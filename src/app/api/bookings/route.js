import { NextResponse } from 'next/server';
import crypto from 'crypto';
import { getPool, sql, DB_AVAILABLE } from '@/lib/db';
import { createCaseForBooking } from '@/lib/opsCases';
import { requireRole } from '@/lib/adminAuth';
import { internalError, clientError } from '@/lib/errors';
import { bookingsCreateSchema, formatZodError } from '@/lib/schemas';
import { getClinicNotificationConfig, CHANNEL_LABELS } from '@/lib/clinicNotifications';
import { sendEmail } from '@/lib/email';
import { clinicSaleNotification } from '@/lib/emailTemplates';
import { releaseHold, markHoldConverted } from '@/lib/slotHolds';
import { notifyInternalWatcher } from '@/lib/internalWatcher';

// Hard cap so a misbehaving admin UI can't pull every row at once. Combined
// with mandatory ops auth this also bounds the data exposure if a token leaks.
const MAX_PAGE_SIZE = 200;
const DEFAULT_PAGE_SIZE = 100;
const SELF_SERVICE_TOKEN_TTL_DAYS = 90;

function clampInt(raw, fallback, max) {
  const n = Number(raw);
  if (!Number.isFinite(n) || n < 0) return fallback;
  return Math.min(Math.floor(n), max);
}

function toBooking(row) {
  return {
    id: row.id,
    referralId: row.referral_id,
    patientName: row.patient_name,
    patientEmail: row.patient_email,
    patientPhone: row.patient_phone,
    patientAddress: row.patient_address,
    providerId: row.provider_id,
    providerName: row.provider_name,
    specialty: row.specialty,
    slotDate: row.slot_date,
    slotTime: row.slot_time,
    amount: row.amount ? Number(row.amount) : null,
    status: row.status,
    cardLast4: row.card_last4,
    hasInsurance: !!row.has_insurance,
    insuranceCompany: row.insurance_company,
    procedureSlug: row.procedure_slug || null,
    procedureName: row.procedure_name || null,
    servicePrice: row.service_price != null ? Number(row.service_price) : null,
    platformFee: row.platform_fee != null ? Number(row.platform_fee) : null,
    notes: row.notes,
    clerkUserId: row.clerk_user_id || null,
    linkedAt: row.linked_at || null,
    selfServiceToken: row.self_service_token || null,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

// Best-effort: if the request carries a Clerk session AND the session's
// verified emails include the booking's patient_email, return the Clerk
// userId so we can stamp it on the inserted row. Returns null in every
// other case — anonymous bookings keep the existing behavior of no
// account linkage at insert time (the Clerk webhook backfill picks them
// up later when the patient signs up with that email).
async function resolveClerkUserIdForEmail(patientEmail) {
  if (!process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY || !process.env.CLERK_SECRET_KEY) {
    return null;
  }
  if (!patientEmail) return null;
  try {
    const { auth, clerkClient } = await import('@clerk/nextjs/server');
    const { userId } = await auth();
    if (!userId) return null;
    const client = await clerkClient();
    const user = await client.users.getUser(userId);
    const emails = (user?.emailAddresses || [])
      .map((e) => String(e?.emailAddress || '').toLowerCase())
      .filter(Boolean);
    if (emails.includes(String(patientEmail).toLowerCase())) {
      return userId;
    }
  } catch (err) {
    // Don't block booking creation on a Clerk hiccup — the backfill path
    // via webhook will catch missed links when the patient signs up.
    console.error('[bookings] Clerk session lookup failed', err?.message);
  }
  return null;
}

// ---------------------------------------------------------------------------
// GET /api/bookings?status=...&from=...&to=...&limit=...&offset=...
//
// Admin/ops only. Without auth this endpoint historically dumped every
// booking row in the system, which is a textbook RGPD-class data leak —
// patient names, emails, phones, amounts, specialties, all unfiltered.
// ---------------------------------------------------------------------------
export async function GET(request) {
  if (!DB_AVAILABLE) {
    return NextResponse.json({ error: 'DB not configured' }, { status: 503 });
  }

  const auth = requireRole(request, ['admin', 'ops']);
  if (auth instanceof Response) return auth;

  const { searchParams } = new URL(request.url);
  const status = searchParams.get('status');
  const from = searchParams.get('from');
  const to = searchParams.get('to');
  const limit = clampInt(searchParams.get('limit'), DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE);
  const offset = clampInt(searchParams.get('offset'), 0, 1_000_000);

  const conditions = [];
  const pool = await getPool();
  const req = pool.request();

  if (status) {
    req.input('status', sql.NVarChar(30), status);
    conditions.push('status = @status');
  }
  if (from) {
    req.input('from', sql.NVarChar(20), from);
    conditions.push('slot_date >= @from');
  }
  if (to) {
    req.input('to', sql.NVarChar(20), to);
    conditions.push('slot_date <= @to');
  }
  req.input('limit', sql.Int, limit);
  req.input('offset', sql.Int, offset);

  const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';

  try {
    const result = await req.query(
      `SELECT * FROM bookings ${where}
       ORDER BY created_at DESC
       OFFSET @offset ROWS FETCH NEXT @limit ROWS ONLY`,
    );
    return NextResponse.json(result.recordset.map(toBooking));
  } catch (err) {
    return internalError(err, '[GET /api/bookings]');
  }
}

// ---------------------------------------------------------------------------
// POST /api/bookings — create booking after payment
// ---------------------------------------------------------------------------
export async function POST(request) {
  if (!DB_AVAILABLE) {
    return NextResponse.json({ error: 'DB not configured' }, { status: 503 });
  }

  let body;
  try { body = await request.json(); }
  catch { return clientError('Invalid JSON', 400); }

  const parsed = bookingsCreateSchema.safeParse(body);
  if (!parsed.success) {
    return clientError(formatZodError(parsed.error), 400);
  }
  const {
    id,
    referralId,
    patientName,
    patientEmail,
    patientPhone,
    patientAddress,
    patientDateOfBirth,
    patientNationalId,
    providerId,
    providerName,
    specialty,
    slotDate,
    slotTime,
    amount,
    status,
    cardLast4,
    hasInsurance,
    insuranceCompany,
    paymentIntentId,
    procedureSlug,
    procedureName,
    servicePrice,
    platformFee,
  } = parsed.data;

  // B9 — server-side amount validation. For sin-seguro bookings we re-fetch the
  // SON catalogue price for the (clinic, procedure) pair and verify it matches
  // what the client charged. Prevents query-string price tampering.
  if (hasInsurance === false && procedureSlug && providerId) {
    try {
      const pool = await getPool();
      const priceResult = await pool.request()
        .input('clinic_id', sql.Int, providerId)
        .input('procedure_slug', sql.NVarChar(100), procedureSlug)
        .query(`
          SELECT TOP 1 price FROM clinic_procedures
          WHERE clinic_id = @clinic_id AND procedure_slug = @procedure_slug
        `);
      const dbPrice = priceResult.recordset[0]?.price;
      const expected = Number(dbPrice ?? 0) + Number(platformFee || 0);
      if (dbPrice != null && Math.abs(Number(amount) - expected) > 0.01) {
        console.warn(`[POST /api/bookings] amount mismatch for ${id}: charged=${amount} expected=${expected.toFixed(2)} (procedure=${procedureSlug})`);
        return NextResponse.json(
          { error: 'amount_mismatch', expected, charged: Number(amount) },
          { status: 400 },
        );
      }
    } catch (validErr) {
      console.error('[POST /api/bookings] price validation failed', validErr);
      // Continue — don't block bookings on validation infra failures, but the
      // warn above flags it for ops review.
    }
  }

  // B2 — sin seguro starts at awaiting_voucher (ops must upload SON voucher).
  const finalStatus = status || (hasInsurance === true ? 'confirmed' : 'awaiting_voucher');

  // F15 — detect whether this id was already reserved by /api/bookings/reserve.
  // Three terminal cases:
  //   - row doesn't exist            → fresh INSERT (legacy path, lock-in or
  //                                    callers that skip reserve)
  //   - row exists, status='pending_payment' → UPDATE in place + run the
  //                                    finalization side effects (ops case,
  //                                    notifications). This is the canonical
  //                                    /book happy path post-F15.
  //   - row exists, status=anything else     → idempotent return of current
  //                                    state. Webhook may have finalized
  //                                    first (tab closed mid-3DS then
  //                                    reopened), or this is a duplicate
  //                                    client POST. Either way: no side
  //                                    effects, return the existing row.
  let existingRow = null;
  try {
    const pre = await (await getPool()).request()
      .input('id', sql.NVarChar(50), id)
      .query(`SELECT TOP 1 id, status, self_service_token FROM bookings WHERE id = @id`);
    existingRow = pre.recordset[0] || null;
  } catch (preErr) {
    console.error('[POST /api/bookings] pre-check failed', preErr?.message);
  }
  const isReservedRow = !!(existingRow && existingRow.status === 'pending_payment');
  const isAlreadyFinalized = !!(existingRow && !isReservedRow);

  if (isAlreadyFinalized) {
    // Webhook (or a previous client POST) already finalized this booking.
    // Return the current state so the client UI moves forward exactly as
    // if it had been the one to finalize it.
    try {
      const result = await (await getPool()).request()
        .input('id', sql.NVarChar(50), id)
        .query('SELECT * FROM bookings WHERE id = @id');
      return NextResponse.json({
        ...toBooking(result.recordset[0]),
        selfServiceToken: existingRow.self_service_token,
        _case: null,
        _alreadyFinalized: true,
      }, { status: 200 });
    } catch (alreadyErr) {
      return internalError(alreadyErr, '[POST /api/bookings idempotent return]');
    }
  }

  // F2 — generate the patient self-service token at insert time. 32 hex chars
  // (128 bits of entropy), unique-indexed so collisions error out instead of
  // silently sharing tokens between bookings. Tokens expire 90 days after
  // creation so a leaked email doesn't yield an indefinite cancel primitive.
  //
  // F15 — if the row was reserved by /api/bookings/reserve, reuse its
  // token so the patient gets a stable cancel/reschedule link.
  const selfServiceToken = isReservedRow
    ? existingRow.self_service_token
    : crypto.randomBytes(16).toString('hex');
  const selfServiceTokenExpiresAt = new Date(
    Date.now() + SELF_SERVICE_TOKEN_TTL_DAYS * 24 * 60 * 60 * 1000,
  );

  // Best-effort opportunistic Clerk linkage. Logged-in patients who book
  // for their own email get an immediate clerk_user_id stamp so /mi-cuenta
  // shows the booking in the same session. Anonymous bookings stay NULL
  // and rely on the webhook backfill at sign-up time.
  const clerkUserIdAtInsert = await resolveClerkUserIdForEmail(patientEmail);

  try {
    const pool = await getPool();
    await pool.request()
      .input('id', sql.NVarChar(50), id)
      .input('referral_id', sql.NVarChar(50), referralId || null)
      .input('patient_name', sql.NVarChar(255), patientName || null)
      .input('patient_email', sql.NVarChar(255), patientEmail)
      .input('patient_phone', sql.NVarChar(50), patientPhone || null)
      .input('patient_address', sql.NVarChar(500), patientAddress || null)
      .input('provider_id', sql.Int, providerId || null)
      .input('provider_name', sql.NVarChar(255), providerName || null)
      .input('specialty', sql.NVarChar(100), specialty || null)
      .input('slot_date', sql.NVarChar(20), slotDate || null)
      .input('slot_time', sql.NVarChar(10), slotTime || null)
      .input('amount', sql.Decimal(10, 2), amount || null)
      .input('status', sql.NVarChar(30), finalStatus)
      .input('card_last4', sql.NVarChar(4), cardLast4 || null)
      .input('has_insurance', sql.Bit, hasInsurance ? 1 : 0)
      .input('insurance_company', sql.NVarChar(100), insuranceCompany || null)
      .input('payment_intent_id', sql.NVarChar(80), paymentIntentId || id || null)
      .input('procedure_slug', sql.NVarChar(100), procedureSlug || null)
      .input('procedure_name', sql.NVarChar(255), procedureName || null)
      .input('service_price', sql.Decimal(10, 2), servicePrice != null ? Number(servicePrice) : null)
      .input('platform_fee', sql.Decimal(10, 2), platformFee != null ? Number(platformFee) : null)
      .input('self_service_token', sql.NVarChar(64), selfServiceToken)
      .input('self_service_token_expires_at', sql.DateTimeOffset, selfServiceTokenExpiresAt)
      .query(isReservedRow
        ? `
        UPDATE bookings SET
          referral_id = @referral_id,
          patient_name = @patient_name,
          patient_email = @patient_email,
          patient_phone = @patient_phone,
          patient_address = @patient_address,
          provider_id = @provider_id,
          provider_name = @provider_name,
          specialty = @specialty,
          slot_date = @slot_date,
          slot_time = @slot_time,
          amount = @amount,
          status = @status,
          card_last4 = @card_last4,
          has_insurance = @has_insurance,
          insurance_company = @insurance_company,
          payment_intent_id = @payment_intent_id,
          procedure_slug = @procedure_slug,
          procedure_name = @procedure_name,
          service_price = @service_price,
          platform_fee = @platform_fee,
          updated_at = SYSDATETIMEOFFSET()
        WHERE id = @id
          AND status = 'pending_payment'
        `
        : `
        INSERT INTO bookings
          (id, referral_id, patient_name, patient_email, patient_phone, patient_address,
           provider_id, provider_name, specialty, slot_date, slot_time,
           amount, status, card_last4, has_insurance, insurance_company, payment_intent_id,
           procedure_slug, procedure_name, service_price, platform_fee,
           self_service_token, self_service_token_expires_at)
        VALUES
          (@id, @referral_id, @patient_name, @patient_email, @patient_phone, @patient_address,
           @provider_id, @provider_name, @specialty, @slot_date, @slot_time,
           @amount, @status, @card_last4, @has_insurance, @insurance_company, @payment_intent_id,
           @procedure_slug, @procedure_name, @service_price, @platform_fee,
           @self_service_token, @self_service_token_expires_at)
      `);

    // 2026-05 — stamp patient_date_of_birth + patient_national_id in a
    // separate UPDATE so a pre-migration DB (columns not yet added via
    // /api/db/setup) still accepts the booking. Same graceful pattern as
    // clerk_user_id below.
    if (patientDateOfBirth || patientNationalId) {
      try {
        await pool.request()
          .input('id', sql.NVarChar(50), id)
          .input('dob', sql.NVarChar(20), patientDateOfBirth || null)
          .input('nid', sql.NVarChar(20), patientNationalId || null)
          .query(`UPDATE bookings
                  SET patient_date_of_birth = @dob,
                      patient_national_id   = @nid
                  WHERE id = @id`);
      } catch (idErr) {
        if (!String(idErr?.message || '').includes('Invalid column name')) {
          console.error('[POST /api/bookings] dob/nid stamp failed', idErr?.message);
        }
      }
    }

    // Stamp clerk_user_id on the inserted row when we resolved one. Same
    // graceful-fallback pattern as verified_derivador / slot_source — a
    // pre-migration DB without the column silently no-ops so the booking
    // still goes through.
    if (clerkUserIdAtInsert) {
      try {
        await pool.request()
          .input('id', sql.NVarChar(50), id)
          .input('clerk_user_id', sql.NVarChar(255), clerkUserIdAtInsert)
          .query(`UPDATE bookings SET clerk_user_id = @clerk_user_id WHERE id = @id`);
      } catch (linkErr) {
        if (!String(linkErr?.message || '').includes('Invalid column name')) {
          console.error('[POST /api/bookings] clerk_user_id stamp failed', linkErr?.message);
        }
      }
    }

    // For sin-seguro bookings, open a voucher row in awaiting_voucher state so
    // ops can pick it up from the dashboard.
    if (hasInsurance === false) {
      try {
        await pool.request()
          .input('booking_id', sql.NVarChar(50), id)
          .query(`
            IF NOT EXISTS (SELECT 1 FROM vouchers WHERE booking_id = @booking_id)
            INSERT INTO vouchers (booking_id, status) VALUES (@booking_id, 'awaiting_voucher')
          `);
      } catch (voucherErr) {
        console.error('[POST /api/bookings] voucher row creation failed', voucherErr);
      }
    }

    // Open an operations case for this booking, with two carve-outs:
    //   1. Internal lock-in (referral.is_internal = 1): no case. The
    //      deriving clinic is also the destination clinic, so they handle
    //      the appointment themselves — Ops adds zero value.
    //   2. External lock-in (referral.is_internal = 0/NULL): create case
    //      AND tag it with referral_id + a starter call-log entry naming
    //      the derivador. From Ops's perspective the case behaves exactly
    //      like a direct booking (call destination clinic, confirm slot or
    //      find alternative, refund if nothing fits) — the chip and banner
    //      just give Raquel context for the call.
    //   3. Direct booking (no referralId): case created as today.
    //
    // Best-effort throughout: a missed lookup, a pre-migration column, or
    // a referrals row that doesn't exist all degrade to "create the case
    // anyway" rather than dropping a paid booking from the Ops queue.
    let opsCase = null;
    let skipCase = false;
    let referralContext = null;
    if (referralId) {
      try {
        const r = await pool.request()
          .input('rid', sql.NVarChar(50), referralId)
          .query(`SELECT TOP 1 is_internal, professional_email, provider_name
                  FROM referrals WHERE id = @rid`);
        const row = r.recordset[0];
        if (row?.is_internal === 1) {
          skipCase = true;
        } else if (row) {
          // Resolve derivador clinic name via admin_users.clinic_id → clinics.name.
          let derivadorClinicName = null;
          try {
            const c = await pool.request()
              .input('email', sql.NVarChar(255), row.professional_email)
              .query(`SELECT TOP 1 cl.name
                      FROM admin_users a
                      LEFT JOIN clinics cl ON cl.id = a.clinic_id
                      WHERE LOWER(a.username) = LOWER(@email)`);
            derivadorClinicName = c.recordset[0]?.name || null;
          } catch (clErr) {
            if (!String(clErr?.message || '').includes('Invalid column name')) {
              console.error('[POST /api/bookings] derivador clinic lookup', clErr.message);
            }
          }
          referralContext = {
            derivadorEmail: row.professional_email,
            derivadorClinicName,
            isInternal: false,
          };
        }
      } catch (refErr) {
        if (!String(refErr?.message || '').includes('Invalid column name')) {
          console.error('[POST /api/bookings] referral lookup', refErr.message);
        }
      }
    }
    if (!skipCase) {
      try {
        opsCase = await createCaseForBooking({
          id, providerId, providerName, slotDate, slotTime, amount,
          platformFee: platformFee != null ? Number(platformFee) : null,
          referralId: referralId || null,
          referralContext,
        });
      } catch (caseErr) {
        console.error('[POST /api/bookings] case creation failed', caseErr);
      }
    }

    // ── Clinic notification: paths 1-3 (direct / internal / external) ────
    // Fire-and-forget the "new sale derived to your clinic" email when the
    // destination clinic has notification_email configured AND notifications
    // are enabled. Channel classification:
    //   - direct booking (no referralId): "directo"
    //   - internal referral (is_internal=1): "derivacion_interna"
    //   - external referral (is_internal=0 or NULL): "derivacion_externa"
    //   (path 4 — alternative proposed by ops — fires from /api/ops/respond
    //    when the patient accepts the alternative.)
    //
    // We deliberately fire here, including for sin-seguro at awaiting_voucher,
    // so the clinic gerente sees the sale immediately and can plan agenda
    // without waiting for ops to upload the SON voucher (decision 2026-05-26).
    if (providerId) {
      const channel = !referralId
        ? 'directo'
        : (referralContext && referralContext.isInternal === false)
          ? 'derivacion_externa'
          : skipCase
            ? 'derivacion_interna'
            : 'derivacion_externa';
      getClinicNotificationConfig(providerId)
        .then(async (cfg) => {
          if (!cfg || !cfg.enabled || !cfg.email) return;
          try {
            const tpl = clinicSaleNotification({
              clinicName: cfg.clinicName || providerName,
              bookingId: id,
              referralId: referralId || null,
              channel,
              channelLabel: CHANNEL_LABELS[channel] || channel,
              patientName,
              patientEmail,
              patientPhone,
              specialty,
              procedureName,
              slotDate,
              slotTime,
              status: finalStatus,
              amountPaid: amount,
              servicePrice: servicePrice != null ? Number(servicePrice) : null,
              platformFee: platformFee != null ? Number(platformFee) : null,
              hasInsurance: hasInsurance == null ? null : !!hasInsurance,
              insuranceCompany,
              derivadorEmail: referralContext?.derivadorEmail || null,
              derivadorClinicName: referralContext?.derivadorClinicName || null,
            });
            await sendEmail({ to: cfg.email, subject: tpl.subject, html: tpl.html });
          } catch (e) {
            console.error('[POST /api/bookings] clinic notification send failed', e?.message);
          }
        })
        .catch((e) => console.error('[POST /api/bookings] clinic config lookup failed', e?.message));
    }

    // ── Internal watcher: mirror every sale to Francisco ─────────────────
    // Fires regardless of clinic notification config — this is the global
    // "ops mirror" channel, separate from the per-clinic recipient.
    notifyInternalWatcher({
      kind: 'sale',
      summary: `${providerName || 'clínica desconocida'} · ${patientName || 'paciente'}${slotDate ? ' · ' + slotDate : ''}${slotTime ? ' ' + slotTime : ''}`,
      booking: {
        id, patientName, patientEmail, patientPhone,
        providerName, specialty, procedureName,
        slotDate, slotTime,
        amount, servicePrice, platformFee,
        status: finalStatus,
        hasInsurance, insuranceCompany,
        referralId: referralId || null,
        paymentIntentId: paymentIntentId || null,
      },
      extra: {
        Canal: !referralId
          ? CHANNEL_LABELS.directo
          : (referralContext && referralContext.isInternal === false)
            ? CHANNEL_LABELS.derivacion_externa
            : skipCase
              ? CHANNEL_LABELS.derivacion_interna
              : CHANNEL_LABELS.derivacion_externa,
        Derivador: referralContext?.derivadorEmail || null,
        'Clínica derivadora': referralContext?.derivadorClinicName || null,
      },
    });

    const result = await pool.request()
      .input('id', sql.NVarChar(50), id)
      .query('SELECT * FROM bookings WHERE id = @id');

    // 2026-06 — release the Redis slot hold (best-effort) and mark the
    // mirror row as converted so the abandoned-cart cron skips it.
    // Failures are logged but never block the booking response — the
    // hold auto-expires within 15 min anyway.
    if (providerId && slotDate && slotTime) {
      const sessionId = request.headers.get('x-mc-session') || '';
      Promise.all([
        releaseHold({ clinicId: providerId, date: slotDate, time: slotTime, sessionId: sessionId || undefined }),
        markHoldConverted({ sessionId, clinicId: providerId, slotDate, slotTime }),
      ]).catch((e) => console.error('[bookings] slot-hold release/convert failed', e?.message));
    }

    // F2 — surface the self-service token to the booking flow so the email
    // dispatcher can build the cancel/reschedule link. Returned only on POST
    // (the GET shape stays clean of this implementation detail).
    return NextResponse.json({
      ...toBooking(result.recordset[0]),
      selfServiceToken,
      _case: opsCase,
    }, { status: 201 });
  } catch (err) {
    return internalError(err, '[POST /api/bookings]');
  }
}
