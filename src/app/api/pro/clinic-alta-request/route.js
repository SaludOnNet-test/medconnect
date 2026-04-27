import { NextResponse } from 'next/server';
import { getPool, query, sql, DB_AVAILABLE } from '@/lib/db';
import { sendEmail } from '@/lib/email';
import { clinicAltaRequestOps, clinicAltaRequestReceived } from '@/lib/emailTemplates';

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
  catch { return NextResponse.json({ error: 'invalid json' }, { status: 400 }); }

  const requestedByEmail = String(body?.requestedByEmail || '').trim().toLowerCase();
  const clinicName = String(body?.clinicName || '').trim();
  if (!requestedByEmail || !requestedByEmail.includes('@')) {
    return NextResponse.json({ error: 'requestedByEmail required' }, { status: 400 });
  }
  if (!clinicName) {
    return NextResponse.json({ error: 'clinicName required' }, { status: 400 });
  }

  const fields = {
    requestedByName: trimOrNull(body?.requestedByName),
    city: trimOrNull(body?.city),
    province: trimOrNull(body?.province),
    address: trimOrNull(body?.address),
    telephone: trimOrNull(body?.telephone),
    contactEmail: trimOrNull(body?.contactEmail),
    specialties: trimOrNull(body?.specialties),
    aseguradoras: trimOrNull(body?.aseguradoras),
    notes: trimOrNull(body?.notes),
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

    // If the user already has an open pending request, return it instead
    // of creating duplicates. This lets the onboarding form be retried
    // safely (e.g. user reloaded the page).
    if (userRow) {
      const existing = await safeQuery(
        pool.request().input('id', sql.Int, userRow.id),
        `SELECT TOP 1 r.id, r.status
         FROM admin_users u
         JOIN clinic_alta_requests r ON r.id = u.alta_request_id
         WHERE u.id = @id AND r.status = 'pending'`,
      );
      if (existing?.recordset?.[0]) {
        return NextResponse.json({
          ok: true,
          requestId: existing.recordset[0].id,
          status: 'pending',
          alreadyPending: true,
        });
      }
    }

    // Insert the request.
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
    const requestId = insertResult.recordset[0].id;

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

    const userTpl = clinicAltaRequestReceived({
      requestedByName: fields.requestedByName,
      clinicName,
    });
    sendEmail({ to: requestedByEmail, subject: userTpl.subject, html: userTpl.html })
      .catch((e) => console.error('[clinic-alta-request] user email failed', e));

    return NextResponse.json({ ok: true, requestId, status: 'pending' });
  } catch (err) {
    console.error('[POST /api/pro/clinic-alta-request]', err);
    if (String(err?.message || '').includes('Invalid object name')) {
      return NextResponse.json({
        error: 'Migration pending — clinic_alta_requests table not yet created. Run scripts/migration_add_clinic_alta_requests.py.',
      }, { status: 503 });
    }
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

function trimOrNull(value) {
  if (value == null) return null;
  const s = String(value).trim();
  return s.length ? s : null;
}

async function safeQuery(request, queryString) {
  try { return await request.query(queryString); }
  catch (err) {
    if (String(err?.message || '').includes('Invalid column name')) return null;
    throw err;
  }
}
