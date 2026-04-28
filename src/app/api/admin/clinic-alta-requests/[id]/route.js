import { NextResponse } from 'next/server';
import { getPool, sql, DB_AVAILABLE } from '@/lib/db';
import { requireRole } from '@/lib/adminAuth';
import { sendEmail } from '@/lib/email';
import { clinicAltaApproved, clinicAltaRejected } from '@/lib/emailTemplates';

/**
 * PATCH /api/admin/clinic-alta-requests/[id]
 *
 * Body: { action: 'approve' | 'reject' | 'link', opsNotes?, linkedClinicId? }
 *
 * - approve: creates a new clinics row from the request data, sets
 *            admin_users.clinic_id = newClinicId for the requester,
 *            marks the request 'approved', emails the user.
 * - link:    same as approve but reuses an existing clinic instead of
 *            creating a new one (e.g. ops noticed it's already in the DB).
 *            Body must include linkedClinicId.
 * - reject:  marks 'rejected', persists ops_notes, emails the user.
 */
export async function PATCH(request, { params }) {
  const rr = requireRole(request, ['admin', 'ops']);
  if (rr instanceof Response) return rr;
  const session = rr;

  if (!DB_AVAILABLE) {
    return NextResponse.json({ error: 'DB not configured' }, { status: 503 });
  }

  const { id: idParam } = await params;
  const id = Number(idParam);
  if (!id || Number.isNaN(id)) {
    return NextResponse.json({ error: 'invalid id' }, { status: 400 });
  }

  let body;
  try { body = await request.json(); }
  catch { return NextResponse.json({ error: 'invalid json' }, { status: 400 }); }

  const action = String(body?.action || '').toLowerCase();
  const opsNotes = body?.opsNotes ? String(body.opsNotes).trim() : null;
  const linkedClinicId = body?.linkedClinicId ? Number(body.linkedClinicId) : null;

  if (!['approve', 'reject', 'link'].includes(action)) {
    return NextResponse.json({ error: 'action must be approve, reject or link' }, { status: 400 });
  }
  if (action === 'link' && !linkedClinicId) {
    return NextResponse.json({ error: 'linkedClinicId required for action=link' }, { status: 400 });
  }

  try {
    const pool = await getPool();

    // Load the request row.
    const reqResult = await pool.request()
      .input('id', sql.Int, id)
      .query(`SELECT * FROM clinic_alta_requests WHERE id = @id`);
    const altaRequest = reqResult.recordset[0];
    if (!altaRequest) {
      return NextResponse.json({ error: 'request not found' }, { status: 404 });
    }
    if (altaRequest.status !== 'pending') {
      return NextResponse.json({
        error: `request already ${altaRequest.status} — refresh the dashboard`,
      }, { status: 409 });
    }

    if (action === 'reject') {
      await pool.request()
        .input('id', sql.Int, id)
        .input('opsNotes', sql.NVarChar(sql.MAX), opsNotes)
        .input('by', sql.NVarChar(80), session.username)
        .query(`
          UPDATE clinic_alta_requests
          SET status = 'rejected',
              ops_notes = @opsNotes,
              resolved_by = @by,
              resolved_at = SYSDATETIMEOFFSET()
          WHERE id = @id
        `);

      // Clear the alta_request_id pointer on the requester so /api/pro/me
      // returns altaStatus = 'none' (or we keep the link so it returns
      // 'rejected' — chosen the latter so the UI can show the rejection
      // banner with ops_notes).
      const tpl = clinicAltaRejected({
        requestedByName: altaRequest.requested_by_name,
        clinicName: altaRequest.clinic_name,
        opsNotes,
      });
      sendEmail({ to: altaRequest.requested_by_email, subject: tpl.subject, html: tpl.html })
        .catch((e) => console.error('[clinic-alta-requests reject] email failed', e));

      return NextResponse.json({ ok: true, status: 'rejected' });
    }

    // approve / link both end with the user mapped to a clinic.
    let clinicId = linkedClinicId;
    let clinicName = null;
    let clinicCity = null;

    if (action === 'approve') {
      // Create a new clinics row from the request data. We default the
      // accepted_insurance to 'Sin seguro - SaludOnNet' so the clinic at
      // least appears in the sin-seguro filter. Ops can edit later.
      const insertResult = await pool.request()
        .input('name', sql.NVarChar(255), altaRequest.clinic_name)
        .input('city', sql.NVarChar(120), altaRequest.city || null)
        .input('province', sql.NVarChar(120), altaRequest.province || null)
        .input('address', sql.NVarChar(500), altaRequest.address || null)
        .input('telephone', sql.NVarChar(40), altaRequest.telephone || null)
        .input('insurance', sql.NVarChar(sql.MAX), altaRequest.aseguradoras || 'Sin seguro - SaludOnNet')
        .query(`
          INSERT INTO clinics (name, city, province, address, telephone, accepted_insurance)
          OUTPUT INSERTED.id, INSERTED.name, INSERTED.city
          VALUES (@name, @city, @province, @address, @telephone, @insurance)
        `);
      const created = insertResult.recordset[0];
      clinicId = created.id;
      clinicName = created.name;
      clinicCity = created.city;
    } else {
      // link — reuse existing.
      const clinicResult = await pool.request()
        .input('id', sql.Int, clinicId)
        .query(`SELECT TOP 1 id, name, city FROM clinics WHERE id = @id`);
      const clinic = clinicResult.recordset[0];
      if (!clinic) {
        return NextResponse.json({ error: 'linked clinic not found' }, { status: 404 });
      }
      clinicName = clinic.name;
      clinicCity = clinic.city;
    }

    // Map admin_users -> clinic_id. If the user doesn't exist in admin_users
    // yet (no grant), we still mark the request approved — the user will
    // get the clinic when an admin grants them later (ops grants the
    // 'professional' role first via /admin/users + /api/admin/professionals/grant
    // and the next /api/pro/me poll picks up the mapping).
    await pool.request()
      .input('email', sql.NVarChar(255), altaRequest.requested_by_email)
      .input('clinicId', sql.Int, clinicId)
      .query(`
        UPDATE admin_users
        SET clinic_id = @clinicId,
            alta_request_id = NULL
        WHERE LOWER(username) = LOWER(@email)
      `);

    await pool.request()
      .input('id', sql.Int, id)
      .input('clinicId', sql.Int, clinicId)
      .input('opsNotes', sql.NVarChar(sql.MAX), opsNotes)
      .input('by', sql.NVarChar(80), session.username)
      .query(`
        UPDATE clinic_alta_requests
        SET status = 'approved',
            linked_clinic_id = @clinicId,
            ops_notes = @opsNotes,
            resolved_by = @by,
            resolved_at = SYSDATETIMEOFFSET()
        WHERE id = @id
      `);

    const tpl = clinicAltaApproved({
      requestedByName: altaRequest.requested_by_name,
      clinicName,
      clinicCity,
    });
    sendEmail({ to: altaRequest.requested_by_email, subject: tpl.subject, html: tpl.html })
      .catch((e) => console.error('[clinic-alta-requests approve] email failed', e));

    return NextResponse.json({
      ok: true,
      status: 'approved',
      clinicId,
      clinicName,
      clinicCity,
    });
  } catch (err) {
    console.error('[PATCH /api/admin/clinic-alta-requests/[id]]', err);
    if (String(err?.message || '').includes('Invalid object name')) {
      return NextResponse.json({
        error: 'Migration pending — run scripts/migration_add_clinic_alta_requests.py.',
      }, { status: 503 });
    }
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
