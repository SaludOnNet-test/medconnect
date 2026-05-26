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
 * GET /api/admin/clinic-outreach
 *
 * Query params:
 *   status     — filter by status (or 'all', default = all)
 *   priority   — filter by priority (or 'all')
 *   city       — substring match (case-insensitive)
 *   specialty  — substring match
 *   assigned   — exact match on assigned_to email (or '__unassigned__')
 *   limit      — page size (default 100, max 500)
 *   offset     — pagination offset
 *
 * Returns { rows, total, counts: { [status]: n }, kpis: { ... } }
 */
export async function GET(request) {
  const rr = requireRole(request, ['admin', 'ops']);
  if (rr instanceof Response) return rr;

  if (!DB_AVAILABLE) {
    return NextResponse.json({ rows: [], total: 0, counts: {}, kpis: {} });
  }

  const { searchParams } = new URL(request.url);
  const status = searchParams.get('status') || 'all';
  const priority = searchParams.get('priority') || 'all';
  const city = searchParams.get('city')?.trim() || '';
  const specialty = searchParams.get('specialty')?.trim() || '';
  const assigned = searchParams.get('assigned')?.trim() || '';
  const limit = Math.min(500, Math.max(1, Number(searchParams.get('limit')) || 100));
  const offset = Math.max(0, Number(searchParams.get('offset')) || 0);

  const filters = [];
  const params = {};

  if (status !== 'all') {
    filters.push('status = @status');
    params.status = { type: sql.NVarChar(50), value: status };
  }
  if (priority !== 'all') {
    filters.push('priority = @priority');
    params.priority = { type: sql.NVarChar(20), value: priority };
  }
  if (city) {
    filters.push('city LIKE @city');
    params.city = { type: sql.NVarChar(120), value: `%${city}%` };
  }
  if (specialty) {
    filters.push('specialties LIKE @specialty');
    params.specialty = { type: sql.NVarChar(500), value: `%${specialty}%` };
  }
  if (assigned === '__unassigned__') {
    filters.push('assigned_to IS NULL');
  } else if (assigned) {
    filters.push('assigned_to = @assigned');
    params.assigned = { type: sql.NVarChar(255), value: assigned };
  }

  const where = filters.length ? `WHERE ${filters.join(' AND ')}` : '';

  try {
    const rowsResult = await query(
      `SELECT id, clinic_name, linked_clinic_id, city, province, specialties,
              contact_name, contact_phone, contact_email, source,
              priority, status, rejection_reason,
              last_contacted_at, next_followup_at, accepted_at,
              notes, assigned_to, created_at, updated_at
       FROM clinic_outreach
       ${where}
       ORDER BY
         CASE priority WHEN 'high' THEN 0 WHEN 'medium' THEN 1 WHEN 'low' THEN 2 ELSE 3 END,
         CASE WHEN next_followup_at IS NULL THEN 1 ELSE 0 END,
         next_followup_at ASC,
         updated_at DESC
       OFFSET ${offset} ROWS FETCH NEXT ${limit} ROWS ONLY`,
      params,
    );

    const totalResult = await query(
      `SELECT COUNT(*) AS n FROM clinic_outreach ${where}`,
      params,
    );

    const countsResult = await query(
      `SELECT status, COUNT(*) AS n FROM clinic_outreach GROUP BY status`,
    );
    const counts = {};
    for (const row of countsResult.recordset) counts[row.status] = row.n;

    // KPIs for the header strip: how the funnel is moving.
    const kpisResult = await query(`
      SELECT
        COUNT(*) AS total,
        SUM(CASE WHEN status IN ('contacted','follow_up','accepted') THEN 1 ELSE 0 END) AS reached,
        SUM(CASE WHEN status = 'accepted' THEN 1 ELSE 0 END) AS accepted,
        SUM(CASE WHEN status = 'rejected' THEN 1 ELSE 0 END) AS rejected,
        SUM(CASE WHEN status = 'follow_up' THEN 1 ELSE 0 END) AS follow_up,
        SUM(CASE WHEN next_followup_at IS NOT NULL
                  AND next_followup_at < DATEADD(day, 7, SYSDATETIMEOFFSET())
                  AND status IN ('contacted','follow_up','no_answer')
                 THEN 1 ELSE 0 END) AS due_next_7d
      FROM clinic_outreach
    `);

    return NextResponse.json({
      rows: rowsResult.recordset,
      total: totalResult.recordset[0]?.n || 0,
      counts,
      kpis: kpisResult.recordset[0] || {},
    });
  } catch (err) {
    if (String(err?.message || '').includes('Invalid object name')) {
      return NextResponse.json({ rows: [], total: 0, counts: {}, kpis: {}, migrationPending: true });
    }
    console.error('[GET /api/admin/clinic-outreach]', err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

/**
 * POST /api/admin/clinic-outreach
 *
 * Body: { clinicName, city?, province?, specialties?, contactName?,
 *         contactPhone?, contactEmail?, source?, priority?, notes?, assignedTo? }
 *
 * Creates a new outreach row in status='not_contacted'.
 */
export async function POST(request) {
  const rr = requireRole(request, ['admin', 'ops']);
  if (rr instanceof Response) return rr;

  if (!DB_AVAILABLE) {
    return NextResponse.json({ error: 'DB not configured' }, { status: 503 });
  }

  let body;
  try { body = await request.json(); }
  catch { return NextResponse.json({ error: 'invalid json' }, { status: 400 }); }

  const clinicName = String(body?.clinicName || '').trim();
  if (!clinicName) {
    return NextResponse.json({ error: 'clinicName is required' }, { status: 400 });
  }

  const priority = VALID_PRIORITIES.includes(body?.priority) ? body.priority : 'medium';

  try {
    const result = await query(
      `INSERT INTO clinic_outreach
         (clinic_name, city, province, specialties, contact_name,
          contact_phone, contact_email, source, priority, notes, assigned_to)
       OUTPUT INSERTED.id
       VALUES (@name, @city, @province, @specialties, @contactName,
               @contactPhone, @contactEmail, @source, @priority, @notes, @assignedTo)`,
      {
        name: { type: sql.NVarChar(255), value: clinicName },
        city: { type: sql.NVarChar(120), value: body?.city?.trim() || null },
        province: { type: sql.NVarChar(120), value: body?.province?.trim() || null },
        specialties: { type: sql.NVarChar(500), value: body?.specialties?.trim() || null },
        contactName: { type: sql.NVarChar(255), value: body?.contactName?.trim() || null },
        contactPhone: { type: sql.NVarChar(50), value: body?.contactPhone?.trim() || null },
        contactEmail: { type: sql.NVarChar(255), value: body?.contactEmail?.trim() || null },
        source: { type: sql.NVarChar(50), value: body?.source?.trim() || 'manual' },
        priority: { type: sql.NVarChar(20), value: priority },
        notes: { type: sql.NVarChar(sql.MAX), value: body?.notes?.trim() || null },
        assignedTo: { type: sql.NVarChar(255), value: body?.assignedTo?.trim() || null },
      },
    );

    return NextResponse.json({ ok: true, id: result.recordset[0]?.id });
  } catch (err) {
    if (String(err?.message || '').includes('Invalid object name')) {
      return NextResponse.json({ error: 'Migration pending — run /api/db/setup' }, { status: 503 });
    }
    console.error('[POST /api/admin/clinic-outreach]', err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

export { VALID_STATUSES, VALID_PRIORITIES };
