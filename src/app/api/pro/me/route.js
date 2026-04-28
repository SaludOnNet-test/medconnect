import { NextResponse } from 'next/server';
import { query, sql, DB_AVAILABLE } from '@/lib/db';

/**
 * GET /api/pro/me?email=<professional-email>
 *
 * Returns the pro user's clinic mapping + alta status. The dashboard +
 * ReferralModal use this to gate "interna" derivation:
 *   - clinicId set            → user attached to a clinic, internal works.
 *   - altaStatus 'pending'    → alta request submitted, awaiting ops review.
 *   - altaStatus 'rejected'   → ops rejected the request.
 *   - altaStatus 'none'       → user has not started onboarding yet.
 *
 * Schema this depends on (created by
 * scripts/migration_add_clinic_alta_requests.py):
 *   - admin_users.clinic_id INT NULL
 *   - admin_users.alta_request_id INT NULL
 *   - table clinic_alta_requests
 *
 * Pre-migration we degrade gracefully — the route catches the missing-column
 * error and returns the same shape with everything null + 'none'. That way
 * the UI keeps working (no clinic = onboarding banner) and the modal's gate
 * also still works.
 *
 * Response:
 *   { clinicId: number | null,
 *     clinicName: string | null,
 *     clinicCity: string | null,
 *     altaStatus: 'active' | 'pending' | 'rejected' | 'none',
 *     altaRequestId: number | null,
 *     username: string | null,
 *     role: string | null }
 */
export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const email = (searchParams.get('email') || '').trim();
  if (!email) {
    return NextResponse.json({ error: 'email is required' }, { status: 400 });
  }
  if (!DB_AVAILABLE) {
    return NextResponse.json(emptyResponse());
  }

  try {
    // Try the wide query first (post-migration). If clinic_id /
    // alta_request_id don't exist yet, mssql throws "Invalid column name"
    // and we fall through to the legacy narrow query.
    const wide = await query(
      `SELECT TOP 1 u.username, u.role, u.display_name,
              u.clinic_id, u.alta_request_id,
              c.name AS clinic_name, c.city AS clinic_city,
              r.status AS request_status
       FROM admin_users u
       LEFT JOIN clinics c ON c.id = u.clinic_id
       LEFT JOIN clinic_alta_requests r ON r.id = u.alta_request_id
       WHERE LOWER(u.username) = LOWER(@email)`,
      { email: { type: sql.NVarChar(255), value: email } },
    );
    const row = wide.recordset[0];
    if (!row) {
      return NextResponse.json(emptyResponse());
    }

    let altaStatus = 'none';
    if (row.clinic_id) altaStatus = 'active';
    else if (row.request_status === 'pending') altaStatus = 'pending';
    else if (row.request_status === 'rejected') altaStatus = 'rejected';

    return NextResponse.json({
      clinicId: row.clinic_id || null,
      clinicName: row.clinic_name || null,
      clinicCity: row.clinic_city || null,
      altaStatus,
      altaRequestId: row.alta_request_id || null,
      username: row.username,
      role: row.role,
    });
  } catch (err) {
    // Fallback path — pre-migration the new columns/tables don't exist.
    // Read the bare admin_users row so the UI still gets the username/role
    // and the modal still falls into its "alta pendiente" gate (because
    // clinicId is null).
    const msg = String(err?.message || '');
    if (
      msg.includes('Invalid column name') ||
      msg.includes('Invalid object name')
    ) {
      try {
        const narrow = await query(
          `SELECT TOP 1 username, role, display_name
           FROM admin_users
           WHERE LOWER(username) = LOWER(@email)`,
          { email: { type: sql.NVarChar(255), value: email } },
        );
        const row = narrow.recordset[0];
        if (!row) {
          return NextResponse.json(emptyResponse());
        }
        return NextResponse.json({
          ...emptyResponse(),
          username: row.username,
          role: row.role,
        });
      } catch (innerErr) {
        console.error('[GET /api/pro/me] fallback failed', innerErr);
        return NextResponse.json({ ...emptyResponse(), error: innerErr.message });
      }
    }
    console.error('[GET /api/pro/me]', err);
    return NextResponse.json({ ...emptyResponse(), error: err.message });
  }
}

function emptyResponse() {
  return {
    clinicId: null,
    clinicName: null,
    clinicCity: null,
    altaStatus: 'none',
    altaRequestId: null,
    username: null,
    role: null,
  };
}
