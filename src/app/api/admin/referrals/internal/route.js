import { NextResponse } from 'next/server';
import { query, sql, DB_AVAILABLE } from '@/lib/db';
import { requireRole } from '@/lib/adminAuth';

/**
 * GET /api/admin/referrals/internal?status=...&limit=...
 *
 * Lists internal-derivation referrals for the Ops dashboard. PR #44 stopped
 * creating operations_cases for internal lock-ins because the deriving
 * clinic also accepts the patient and handles the slot internally. But Ops
 * still needs visibility when something goes wrong — paciente cancela,
 * incident reported by the clinic, etc. This endpoint backs the dedicated
 * /admin/ops/internas queue.
 *
 * Filters: optional `status` matches referrals.state exactly. `limit`
 * defaults to 200, capped at 500.
 *
 * Auth: admin or ops role (same gate as /admin/ops main queue).
 */
export async function GET(request) {
  const r = requireRole(request, ['admin', 'ops']);
  if (r instanceof Response) return r;

  if (!DB_AVAILABLE) {
    return NextResponse.json({ items: [], error: 'DB not configured' }, { status: 503 });
  }

  const { searchParams } = new URL(request.url);
  const status = (searchParams.get('status') || '').trim();
  const limit = Math.min(Math.max(Number(searchParams.get('limit')) || 200, 1), 500);

  // Build the query. Pre-migration DBs without is_internal won't have any
  // internal-classified rows yet — return empty rather than 500.
  const where = ['(r.is_internal = 1)'];
  const params = {};
  if (status) {
    where.push('r.state = @state');
    params.state = { type: sql.NVarChar(30), value: status };
  }

  try {
    const result = await query(
      `SELECT TOP (${limit})
         r.id, r.state, r.patient_email, r.professional_email, r.provider_id, r.provider_name,
         r.specialty, r.slot_date, r.slot_time, r.fee, r.created_at, r.updated_at,
         clinic.name AS derivador_clinic_name
       FROM referrals r
       LEFT JOIN admin_users a   ON LOWER(a.username) = LOWER(r.professional_email)
       LEFT JOIN clinics clinic  ON clinic.id = a.clinic_id
       WHERE ${where.join(' AND ')}
       ORDER BY r.updated_at DESC, r.created_at DESC`,
      params,
    );
    return NextResponse.json({ items: result.recordset });
  } catch (err) {
    if (String(err?.message || '').includes('Invalid column name')) {
      return NextResponse.json({ items: [], note: 'is_internal column not migrated yet; run /api/db/setup' });
    }
    console.error('[GET /api/admin/referrals/internal]', err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

/**
 * PATCH /api/admin/referrals/internal/:id is too much new surface for this
 * MVP. The "Marcar como incidencia" button on /admin/ops/internas/[id]
 * uses the existing PATCH /api/referrals/[id] endpoint with body
 * `{ state: 'incident' }` — the referrals route already accepts arbitrary
 * state strings (validation is light), and the dashboard renders
 * 'incident' as a generic state until we add proper labelling.
 */
