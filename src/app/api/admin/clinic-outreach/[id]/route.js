import { NextResponse } from 'next/server';
import { query, sql, DB_AVAILABLE } from '@/lib/db';
import { requireRole } from '@/lib/adminAuth';

const VALID_STATUSES = [
  'not_contacted',
  'contacted',
  'follow_up',
  'accepted',
  'rejected',
  'no_answer',
  'do_not_contact',
];

const VALID_PRIORITIES = ['high', 'medium', 'low'];

/**
 * PATCH /api/admin/clinic-outreach/[id]
 *
 * Body fields (all optional, only set what you want to change):
 *   status, priority, contactName, contactPhone, contactEmail,
 *   notes, assignedTo, rejectionReason, nextFollowupAt (ISO string),
 *   markContactedNow (bool — sets last_contacted_at = SYSDATETIMEOFFSET()),
 *   markAcceptedNow (bool — sets accepted_at = SYSDATETIMEOFFSET()
 *                    AND status = 'accepted')
 *
 * Returns the updated row.
 */
export async function PATCH(request, { params }) {
  const rr = requireRole(request, ['admin', 'ops']);
  if (rr instanceof Response) return rr;

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

  // markAcceptedNow forces status=accepted; otherwise honor explicit status.
  let status = body?.status;
  if (status && !VALID_STATUSES.includes(status)) {
    return NextResponse.json({ error: `status must be one of ${VALID_STATUSES.join(',')}` }, { status: 400 });
  }
  if (body?.markAcceptedNow) status = 'accepted';

  const priority = body?.priority;
  if (priority && !VALID_PRIORITIES.includes(priority)) {
    return NextResponse.json({ error: `priority must be one of ${VALID_PRIORITIES.join(',')}` }, { status: 400 });
  }

  const sets = [];
  const inputs = { id: { type: sql.Int, value: id } };

  function add(column, type, value) {
    sets.push(`${column} = @${column}`);
    inputs[column] = { type, value };
  }

  if (status) add('status', sql.NVarChar(50), status);
  if (priority) add('priority', sql.NVarChar(20), priority);
  if (Object.prototype.hasOwnProperty.call(body, 'contactName')) add('contact_name', sql.NVarChar(255), body.contactName?.trim() || null);
  if (Object.prototype.hasOwnProperty.call(body, 'contactPhone')) add('contact_phone', sql.NVarChar(50), body.contactPhone?.trim() || null);
  if (Object.prototype.hasOwnProperty.call(body, 'contactEmail')) add('contact_email', sql.NVarChar(255), body.contactEmail?.trim() || null);
  if (Object.prototype.hasOwnProperty.call(body, 'notes')) add('notes', sql.NVarChar(sql.MAX), body.notes?.trim() || null);
  if (Object.prototype.hasOwnProperty.call(body, 'assignedTo')) add('assigned_to', sql.NVarChar(255), body.assignedTo?.trim() || null);
  if (Object.prototype.hasOwnProperty.call(body, 'rejectionReason')) add('rejection_reason', sql.NVarChar(500), body.rejectionReason?.trim() || null);

  if (Object.prototype.hasOwnProperty.call(body, 'nextFollowupAt')) {
    const dt = body.nextFollowupAt ? new Date(body.nextFollowupAt) : null;
    if (dt && Number.isNaN(dt.getTime())) {
      return NextResponse.json({ error: 'nextFollowupAt must be ISO date or null' }, { status: 400 });
    }
    add('next_followup_at', sql.DateTimeOffset, dt);
  }

  // Side-effect flags translate to direct column writes with SYSDATETIMEOFFSET().
  // We append literal SQL fragments instead of params because the value is the
  // current server time, not user input — no injection risk.
  const literalSets = ['updated_at = SYSDATETIMEOFFSET()'];
  if (body?.markContactedNow) literalSets.push('last_contacted_at = SYSDATETIMEOFFSET()');
  if (body?.markAcceptedNow) literalSets.push('accepted_at = SYSDATETIMEOFFSET()');

  if (sets.length === 0 && literalSets.length === 1) {
    return NextResponse.json({ error: 'no fields to update' }, { status: 400 });
  }

  const allSets = [...sets, ...literalSets].join(', ');

  try {
    const result = await query(
      `UPDATE clinic_outreach
       SET ${allSets}
       OUTPUT INSERTED.*
       WHERE id = @id`,
      inputs,
    );

    const row = result.recordset[0];
    if (!row) {
      return NextResponse.json({ error: 'not found' }, { status: 404 });
    }
    return NextResponse.json({ ok: true, row });
  } catch (err) {
    if (String(err?.message || '').includes('Invalid object name')) {
      return NextResponse.json({ error: 'Migration pending — run /api/db/setup' }, { status: 503 });
    }
    console.error('[PATCH /api/admin/clinic-outreach/[id]]', err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
