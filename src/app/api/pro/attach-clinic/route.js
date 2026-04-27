import { NextResponse } from 'next/server';
import { getPool, sql, DB_AVAILABLE } from '@/lib/db';

/**
 * POST /api/pro/attach-clinic
 *
 * Pro user picks an existing clinic from the DB during onboarding. We map
 * admin_users.clinic_id -> clinics.id immediately. (No ops approval gate
 * for this path — the clinic is already in our system, the only thing the
 * pro is asserting is "this is mine". A future enhancement can add a
 * verification step, but for v1 instant-attach unblocks the dashboard.)
 *
 * Body: { email, clinicId }
 *
 * Pre-migration the column doesn't exist yet — we return a 503 with a
 * descriptive message so the UI can surface "system in maintenance" rather
 * than silently dropping the action.
 */
export async function POST(request) {
  if (!DB_AVAILABLE) {
    return NextResponse.json({ error: 'DB not configured' }, { status: 503 });
  }

  let body;
  try { body = await request.json(); }
  catch { return NextResponse.json({ error: 'invalid json' }, { status: 400 }); }

  const email = String(body?.email || '').trim().toLowerCase();
  const clinicId = Number(body?.clinicId);
  if (!email || !email.includes('@')) {
    return NextResponse.json({ error: 'email required' }, { status: 400 });
  }
  if (!clinicId || Number.isNaN(clinicId)) {
    return NextResponse.json({ error: 'clinicId required' }, { status: 400 });
  }

  try {
    const pool = await getPool();

    // Validate the clinic exists (avoids silently writing a broken FK).
    const clinicResult = await pool.request()
      .input('id', sql.Int, clinicId)
      .query(`SELECT TOP 1 id, name, city FROM clinics WHERE id = @id`);
    const clinic = clinicResult.recordset[0];
    if (!clinic) {
      return NextResponse.json({ error: 'clinic not found' }, { status: 404 });
    }

    // Validate the user exists (we never auto-create admin_users from this
    // endpoint — that's an admin-grant action).
    const userResult = await pool.request()
      .input('email', sql.NVarChar(255), email)
      .query(`SELECT TOP 1 id, username FROM admin_users WHERE LOWER(username) = LOWER(@email)`);
    const user = userResult.recordset[0];
    if (!user) {
      return NextResponse.json({
        error: 'No professional account found for this email. Ask an admin to grant you access first.',
      }, { status: 404 });
    }

    // Attach. Also clears any pending alta_request_id (the user resolved
    // their onboarding by picking an existing clinic, so the pending
    // request is no longer relevant — we mark it 'cancelled').
    await pool.request()
      .input('id', sql.Int, user.id)
      .input('clinicId', sql.Int, clinicId)
      .query(`
        UPDATE admin_users
        SET clinic_id = @clinicId,
            alta_request_id = NULL
        WHERE id = @id
      `);

    // Best-effort: cancel any pending alta requests this user had open.
    try {
      await pool.request()
        .input('email', sql.NVarChar(255), email)
        .query(`
          UPDATE clinic_alta_requests
          SET status = 'cancelled',
              resolved_at = SYSDATETIMEOFFSET(),
              resolved_by = 'self-attach'
          WHERE LOWER(requested_by_email) = LOWER(@email)
            AND status = 'pending'
        `);
    } catch (cleanupErr) {
      if (!String(cleanupErr?.message || '').includes('Invalid object name')) {
        console.error('[attach-clinic] cleanup error', cleanupErr);
      }
    }

    return NextResponse.json({
      ok: true,
      clinicId,
      clinicName: clinic.name,
      clinicCity: clinic.city,
    });
  } catch (err) {
    console.error('[POST /api/pro/attach-clinic]', err);
    if (String(err?.message || '').includes('Invalid column name')) {
      return NextResponse.json({
        error: 'Migration pending — admin_users.clinic_id column not yet created. Run scripts/migration_add_clinic_alta_requests.py.',
      }, { status: 503 });
    }
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
