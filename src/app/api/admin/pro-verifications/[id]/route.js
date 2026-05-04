import { NextResponse } from 'next/server';
import { getPool, sql, DB_AVAILABLE } from '@/lib/db';
import { requireRole } from '@/lib/adminAuth';
import { sendEmail } from '@/lib/email';
import {
  proVerificationApproved,
  proVerificationRejected,
  proVerificationMoreInfo,
} from '@/lib/emailTemplates';

/**
 * PATCH /api/admin/pro-verifications/[id]
 *
 * Body: { action: 'approve' | 'reject' | 'request_info', opsNotes?, message? }
 *
 * - approve:      mark 'approved', flip admin_users.is_verified = 1 for the
 *                 requester, send the approval email.
 * - reject:       mark 'rejected' with ops_notes, send the rejection email
 *                 (with motivo visible to the user).
 * - request_info: keep the request open but mark 'more_info_requested' and
 *                 store the ops message in info_request_message. Email the
 *                 pro with the message + a CTA to respond from /pro/dashboard.
 *                 Allowed when current status is 'pending' OR
 *                 'more_info_requested' (so ops can amend the message).
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
  const message = body?.message ? String(body.message).trim() : null;

  if (!['approve', 'reject', 'request_info'].includes(action)) {
    return NextResponse.json({ error: 'action must be approve, reject or request_info' }, { status: 400 });
  }
  if (action === 'request_info' && !message) {
    return NextResponse.json({ error: 'message required for request_info' }, { status: 400 });
  }

  try {
    const pool = await getPool();

    // Load the request row.
    const reqResult = await pool.request()
      .input('id', sql.Int, id)
      .query(`SELECT * FROM pro_verification_requests WHERE id = @id`);
    const verifyRequest = reqResult.recordset[0];
    if (!verifyRequest) {
      return NextResponse.json({ error: 'request not found' }, { status: 404 });
    }
    // approve/reject require pending; request_info also accepts an already
    // 'more_info_requested' row so ops can amend their message.
    const acceptableForAction = action === 'request_info'
      ? ['pending', 'more_info_requested']
      : ['pending'];
    if (!acceptableForAction.includes(verifyRequest.status)) {
      return NextResponse.json({
        error: `request already ${verifyRequest.status} — refresh the dashboard`,
      }, { status: 409 });
    }

    if (action === 'request_info') {
      await pool.request()
        .input('id', sql.Int, id)
        .input('message', sql.NVarChar(sql.MAX), message)
        .query(`
          UPDATE pro_verification_requests
          SET status = 'more_info_requested',
              info_request_message = @message,
              info_request_at = SYSDATETIMEOFFSET(),
              info_response_at = NULL
          WHERE id = @id
        `);

      const tpl = proVerificationMoreInfo({
        requestedByName: verifyRequest.full_name || verifyRequest.clinic_name,
        message,
      });
      sendEmail({ to: verifyRequest.requested_by_email, subject: tpl.subject, html: tpl.html })
        .catch((e) => console.error('[pro-verifications request_info] email failed', e));

      return NextResponse.json({ ok: true, status: 'more_info_requested' });
    }

    if (action === 'reject') {
      await pool.request()
        .input('id', sql.Int, id)
        .input('opsNotes', sql.NVarChar(sql.MAX), opsNotes)
        .input('by', sql.NVarChar(80), session.username)
        .query(`
          UPDATE pro_verification_requests
          SET status = 'rejected',
              ops_notes = @opsNotes,
              resolved_by = @by,
              resolved_at = SYSDATETIMEOFFSET()
          WHERE id = @id
        `);

      const tpl = proVerificationRejected({
        requestedByName: verifyRequest.full_name || verifyRequest.clinic_name,
        opsNotes,
      });
      sendEmail({ to: verifyRequest.requested_by_email, subject: tpl.subject, html: tpl.html })
        .catch((e) => console.error('[pro-verifications reject] email failed', e));

      return NextResponse.json({ ok: true, status: 'rejected' });
    }

    // Approve — flip is_verified on the requester's admin_users row + mark
    // request 'approved' + send email.
    await pool.request()
      .input('email', sql.NVarChar(255), verifyRequest.requested_by_email)
      .query(`
        UPDATE admin_users
        SET is_verified = 1
        WHERE LOWER(username) = LOWER(@email)
      `);

    await pool.request()
      .input('id', sql.Int, id)
      .input('opsNotes', sql.NVarChar(sql.MAX), opsNotes)
      .input('by', sql.NVarChar(80), session.username)
      .query(`
        UPDATE pro_verification_requests
        SET status = 'approved',
            ops_notes = @opsNotes,
            resolved_by = @by,
            resolved_at = SYSDATETIMEOFFSET()
        WHERE id = @id
      `);

    const tpl = proVerificationApproved({
      requestedByName: verifyRequest.full_name || verifyRequest.clinic_name,
    });
    sendEmail({ to: verifyRequest.requested_by_email, subject: tpl.subject, html: tpl.html })
      .catch((e) => console.error('[pro-verifications approve] email failed', e));

    return NextResponse.json({ ok: true, status: 'approved' });
  } catch (err) {
    console.error('[PATCH /api/admin/pro-verifications/[id]]', err);
    if (String(err?.message || '').includes('Invalid object name')) {
      return NextResponse.json({
        error: 'Migration pending — run scripts/migration_add_pro_verification.py.',
      }, { status: 503 });
    }
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
