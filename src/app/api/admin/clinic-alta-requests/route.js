import { NextResponse } from 'next/server';
import { query, sql, DB_AVAILABLE } from '@/lib/db';
import { requireRole } from '@/lib/adminAuth';

/**
 * GET /api/admin/clinic-alta-requests?status=pending|approved|rejected|all
 *
 * Lists clinic alta requests for the ops dashboard. Defaults to status=pending.
 * Returns the rows + a per-status count map for the tab badges.
 */
export async function GET(request) {
  const rr = requireRole(request, ['admin', 'ops']);
  if (rr instanceof Response) return rr;

  if (!DB_AVAILABLE) {
    return NextResponse.json({ requests: [], counts: {} });
  }

  const { searchParams } = new URL(request.url);
  const status = searchParams.get('status') || 'pending';

  try {
    let where = '';
    const params = {};
    if (status !== 'all') {
      where = 'WHERE status = @status';
      params.status = { type: sql.NVarChar(20), value: status };
    }

    const result = await query(
      `SELECT id, requested_by_email, requested_by_name, clinic_name,
              city, province, address, telephone, contact_email,
              specialties, aseguradoras, notes, status, linked_clinic_id,
              ops_notes, resolved_by, resolved_at, created_at
       FROM clinic_alta_requests
       ${where}
       ORDER BY created_at DESC`,
      params,
    );

    const counts = await query(
      `SELECT status, COUNT(*) AS n FROM clinic_alta_requests GROUP BY status`,
    );
    const countMap = {};
    for (const row of counts.recordset) countMap[row.status] = row.n;

    return NextResponse.json({ requests: result.recordset, counts: countMap });
  } catch (err) {
    if (String(err?.message || '').includes('Invalid object name')) {
      return NextResponse.json({ requests: [], counts: {}, migrationPending: true });
    }
    console.error('[GET /api/admin/clinic-alta-requests]', err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
