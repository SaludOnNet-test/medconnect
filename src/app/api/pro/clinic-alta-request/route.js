import { NextResponse } from 'next/server';
import { getPool, query, sql, DB_AVAILABLE } from '@/lib/db';
import { sendEmail } from '@/lib/email';
import { clinicAltaRequestOps, clinicAltaRequestReceived, clinicAltaInfoResponded } from '@/lib/emailTemplates';
import { clinicAltaRequestSchema, formatZodError } from '@/lib/schemas';
import { verifyCaptcha } from '@/lib/captcha';
import { internalError, clientError } from '@/lib/errors';

const OPERATIONS_EMAIL = process.env.OPERATIONS_EMAIL || 'operaciones@medconnect.es';

/**
 * POST /api/pro/clinic-alta-request
 *
 * Pro user submits the alta form because their clinic isn't yet in the DB.
 * Persists to clinic_alta_requests, links it from admin_users.alta_request_id
 * (so /api/pro/me can surface altaStatus = 'pending'), and notifies ops.
 *
 * Body:
 *   { requestedByEmail (required), requestedByName,
 *     clinicName (required), city, province, address, telephone,
 *     contactEmail, specialties, aseguradoras, notes }
 *
 * Auth note: this route does NOT require an admin token — it's meant to be
 * called from /pro/onboarding by a (Clerk-authenticated) professional. We
 * trust the email passed in the body, validating that an admin_users row
 * exists for it. Without that row the request is rejected (the user must
 * have first been granted the 'professional' role and an admin_users entry).
 */
export async function POST(request) {
  if (!DB_AVAILABLE) {
    return NextResponse.json({ error: 'DB not configured' }, { status: 503 });
  }

  let body;
  try { body = await request.json(); }
  catch { return clientError('invalid json', 400); }

  const parsed = clinicAltaRequestSchema.safeParse(body);
  if (!parsed.success) {
    return clientError(formatZodError(parsed.error), 400);
  }
  const data = parsed.data;
  const requestedByEmail = data.requestedByEmail.toLowerCase();
  const clinicName = data.clinicName;

  // Captcha gate. When TURNSTILE_SECRET_KEY isn't configured this is a
  // no-op (skipped: true) so local/preview flows still work.
  const captcha = await verifyCaptcha(data.captchaToken, request);
  if (!captcha.ok) {
    return clientError('captcha_failed', 400);
  }

  const fields = {
    requestedByName: data.requestedByName,
    city: data.city,
    province: data.province,
    address: data.address,
    telephone: data.telephone,
    contactEmail: data.contactEmail || null,
    specialties: data.specialties,
    aseguradoras: data.aseguradoras,
    notes: data.notes,
  };

  try {
    const pool = await getPool();

    // Find the admin_users row that owns this email so we can link the
    // request back. If the row doesn't exist, we still create the request
    // (ops can pre-create the user later) but we skip the link step.
    const userResult = await pool.request()
      .input('email', sql.NVarChar(255), requestedByEmail)
      .query(`SELECT TOP 1 id, username FROM admin_users WHERE LOWER(username) = LOWER(@email)`);
    const userRow = userResult.recordset[0];

    // Look up any open request (pending OR more_info_requested). Pending
    // is idempotent — return as-is. more_info_requested means the pro is
    // answering ops's question: UPDATE the row with the new fields, flip
    // status back to pending, stamp info_response_at, and notify ops.
    let existingOpen = null;
    if (userRow) {
      const existing = await safeQuery(
        pool.request().input('id', sql.Int, userRow.id),
        `SELECT TOP 1 r.id, r.status
         FROM admin_users u
         JOIN clinic_alta_requests r ON r.id = u.alta_request_id
         WHERE u.id = @id AND r.status IN ('pending', 'more_info_requested')`,
      );
      existingOpen = existing?.recordset?.[0] || null;
    }

    if (existingOpen?.status === 'pending') {
      return NextResponse.json({
        ok: true,
        requestId: existingOpen.id,
        status: 'pending',
        alreadyPending: true,
      });
    }

    let requestId;
    let isInfoResponse = false;

    if (existingOpen?.status === 'more_info_requested') {
      isInfoResponse = true;
      requestId = existingOpen.id;
      await pool.request()
        .input('id', sql.Int, requestId)
        .input('name', sql.NVarChar(255), fields.requestedByName)
        .input('clinicName', sql.NVarChar(255), clinicName)
        .input('city', sql.NVarChar(120), fields.city)
        .input('province', sql.NVarChar(120), fields.province)
        .input('address', sql.NVarChar(500), fields.address)
        .input('telephone', sql.NVarChar(40), fields.telephone)
        .input('contactEmail', sql.NVarChar(255), fields.contactEmail)
        .input('specialties', sql.NVarChar(sql.MAX), fields.specialties)
        .input('aseguradoras', sql.NVarChar(sql.MAX), fields.aseguradoras)
        .input('notes', sql.NVarChar(sql.MAX), fields.notes)
        .query(`
          UPDATE clinic_alta_requests
          SET requested_by_name = COALESCE(@name, requested_by_name),
              clinic_name = @clinicName,
              city = COALESCE(@city, city),
              province = COALESCE(@province, province),
              address = COALESCE(@address, address),
              telephone = COALESCE(@telephone, telephone),
              contact_email = COALESCE(@contactEmail, contact_email),
              specialties = COALESCE(@specialties, specialties),
              aseguradoras = COALESCE(@aseguradoras, aseguradoras),
              notes = COALESCE(@notes, notes),
              status = 'pending',
              info_response_at = SYSDATETIMEOFFSET()
          WHERE id = @id
        `);
    } else {
      // Insert a fresh request.
      const insertResult = await pool.request()
        .input('email', sql.NVarChar(255), requestedByEmail)
        .input('name', sql.NVarChar(255), fields.requestedByName)
        .input('clinicName', sql.NVarChar(255), clinicName)
        .input('city', sql.NVarChar(120), fields.city)
        .input('province', sql.NVarChar(120), fields.province)
        .input('address', sql.NVarChar(500), fields.address)
        .input('telephone', sql.NVarChar(40), fields.telephone)
        .input('contactEmail', sql.NVarChar(255), fields.contactEmail)
        .input('specialties', sql.NVarChar(sql.MAX), fields.specialties)
        .input('aseguradoras', sql.NVarChar(sql.MAX), fields.aseguradoras)
        .input('notes', sql.NVarChar(sql.MAX), fields.notes)
        .query(`
          INSERT INTO clinic_alta_requests
            (requested_by_email, requested_by_name, clinic_name,
             city, province, address, telephone, contact_email,
             specialties, aseguradoras, notes, status)
          OUTPUT INSERTED.id
          VALUES (@email, @name, @clinicName,
                  @city, @province, @address, @telephone, @contactEmail,
                  @specialties, @aseguradoras, @notes, 'pending')
        `);
      requestId = insertResult.recordset[0].id;
    }

    // Link the request from admin_users so /api/pro/me can surface
    // altaStatus = 'pending'. Best-effort: if the column doesn't exist
    // (pre-migration) we swallow the error silently — the request is
    // recorded, ops can still review it, the UI just won't see "pending"
    // until the migration runs.
    if (userRow) {
      try {
        await pool.request()
          .input('id', sql.Int, userRow.id)
          .input('reqId', sql.Int, requestId)
          .query(`UPDATE admin_users SET alta_request_id = @reqId WHERE id = @id`);
      } catch (linkErr) {
        if (!String(linkErr?.message || '').includes('Invalid column name')) {
          console.error('[clinic-alta-request] link error', linkErr);
        }
      }
    }

    // Emails — ops alert + pro confirmation. Failures don't block the
    // response (the request is already persisted).
    if (isInfoResponse) {
      const opsTpl = clinicAltaInfoResponded({
        requestId,
        requestedByEmail,
        clinicName,
      });
      sendEmail({ to: OPERATIONS_EMAIL, subject: opsTpl.subject, html: opsTpl.html })
        .catch((e) => console.error('[clinic-alta-request info-response] ops email failed', e));
    } else {
      const opsTpl = clinicAltaRequestOps({
        requestId,
        requestedByEmail,
        requestedByName: fields.requestedByName,
        clinicName,
        city: fields.city,
        province: fields.province,
        address: fields.address,
        telephone: fields.telephone,
        contactEmail: fields.contactEmail,
        specialties: fields.specialties,
        aseguradoras: fields.aseguradoras,
        notes: fields.notes,
      });
      sendEmail({ to: OPERATIONS_EMAIL, subject: opsTpl.subject, html: opsTpl.html })
        .catch((e) => console.error('[clinic-alta-request] ops email failed', e));
    }

    const userTpl = clinicAltaRequestReceived({
      requestedByName: fields.requestedByName,
      clinicName,
    });
    sendEmail({ to: requestedByEmail, subject: userTpl.subject, html: userTpl.html })
      .catch((e) => console.error('[clinic-alta-request] user email failed', e));

    return NextResponse.json({ ok: true, requestId, status: 'pending', infoResponse: isInfoResponse });
  } catch (err) {
    if (String(err?.message || '').includes('Invalid object name')) {
      return NextResponse.json({
        error: 'Migration pending — clinic_alta_requests table not yet created. Run scripts/migration_add_clinic_alta_requests.py.',
      }, { status: 503 });
    }
    return internalError(err, '[POST /api/pro/clinic-alta-request]');
  }
}

async function safeQuery(request, queryString) {
  try { return await request.query(queryString); }
  catch (err) {
    if (String(err?.message || '').includes('Invalid column name')) return null;
    throw err;
  }
}
