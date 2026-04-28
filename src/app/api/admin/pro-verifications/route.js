import { NextResponse } from 'next/server';
import { query, sql, DB_AVAILABLE } from '@/lib/db';
import { requireRole } from '@/lib/adminAuth';

/**
 * GET /api/admin/pro-verifications?status=pending|approved|rejected|all
 *
 * Lists pro verification requests for the ops dashboard. Mirrors the
 * `/api/admin/clinic-alta-requests` pattern (status counts + filtered
 * list), with one difference: each row includes the parsed
 * `documentUrls` array (the API stores them as JSON in a single column).
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
      `SELECT id, requested_by_email, profile_type, full_name, license_number,
              clinic_name, tax_id, document_urls, notes, status, ops_notes,
              resolved_by, resolved_at, created_at
       FROM pro_verification_requests
       ${where}
       ORDER BY created_at DESC`,
      params,
    );

    const counts = await query(
      `SELECT status, COUNT(*) AS n FROM pro_verification_requests GROUP BY status`,
    );
    const countMap = {};
    for (const row of counts.recordset) countMap[row.status] = row.n;

    const requests = result.recordset.map((r) => ({
      ...r,
      documentUrls: parseUrls(r.document_urls),
    }));

    return NextResponse.json({ requests, counts: countMap });
  } catch (err) {
    if (String(err?.message || '').includes('Invalid object name')) {
      return NextResponse.json({ requests: [], counts: {}, migrationPending: true });
    }
    console.error('[GET /api/admin/pro-verifications]', err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

function parseUrls(json) {
  if (!json) return [];
  try {
    const arr = JSON.parse(json);
    return Array.isArray(arr) ? arr.filter((u) => typeof u === 'string') : [];
  } catch {
    return [];
  }
}
