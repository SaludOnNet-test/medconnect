import { NextResponse } from 'next/server';
import { query, sql, DB_AVAILABLE } from '@/lib/db';

/**
 * GET /api/pro/me?email=<professional-email>
 *
 * Returns the pro user's clinic mapping + alta status + verification
 * status. The dashboard uses this to:
 *   - Show or hide the "Verificar cuenta" banner based on `isVerified`.
 *   - Surface verification progress (`pending`, `approved`, `rejected`).
 *   - Gate "interna" derivation in ReferralModal on clinic state.
 *
 * Schema this depends on (created by
 * scripts/migration_add_clinic_alta_requests.py and
 * scripts/migration_add_pro_verification.py):
 *   - admin_users.clinic_id INT NULL
 *   - admin_users.alta_request_id INT NULL
 *   - admin_users.is_verified BIT NOT NULL DEFAULT 0
 *   - admin_users.verification_request_id INT NULL
 *   - tables clinic_alta_requests, pro_verification_requests
 *
 * Pre-migration we degrade gracefully — the route catches the missing-
 * column error and returns the same shape with safe defaults
 * (everything null + 'none' + isVerified false).
 *
 * Response:
 *   { clinicId: number | null,
 *     clinicName: string | null,
 *     clinicCity: string | null,
 *     altaStatus: 'active' | 'pending' | 'rejected' | 'none',
 *     altaRequestId: number | null,
 *     isVerified: boolean,
 *     verificationStatus: 'approved' | 'pending' | 'rejected' | 'none',
 *     verificationRequestId: number | null,
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
    // Try the wide query first (post-migration). If any of the new
    // columns/tables don't exist yet, mssql throws "Invalid column name"
    // / "Invalid object name" and we fall through to the legacy narrow
    // query.
    const wide = await query(
      `SELECT TOP 1 u.username, u.role, u.display_name,
              u.clinic_id, u.alta_request_id,
              u.is_verified, u.verification_request_id,
              c.name AS clinic_name, c.city AS clinic_city,
              r.status AS request_status,
              v.status AS verification_status
       FROM admin_users u
       LEFT JOIN clinics c ON c.id = u.clinic_id
       LEFT JOIN clinic_alta_requests r ON r.id = u.alta_request_id
       LEFT JOIN pro_verification_requests v ON v.id = u.verification_request_id
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

    // Verification status takes the persisted is_verified flag as truth
    // (so once approved, even if a new pending row is created we still
    // report approved). Otherwise we look at the latest request row.
    const isVerified = !!row.is_verified;
    let verificationStatus = 'none';
    if (isVerified) verificationStatus = 'approved';
    else if (row.verification_status === 'pending') verificationStatus = 'pending';
    else if (row.verification_status === 'rejected') verificationStatus = 'rejected';

    return NextResponse.json({
      clinicId: row.clinic_id || null,
      clinicName: row.clinic_name || null,
      clinicCity: row.clinic_city || null,
      altaStatus,
      altaRequestId: row.alta_request_id || null,
      isVerified,
      verificationStatus,
      verificationRequestId: row.verification_request_id || null,
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
    isVerified: false,
    verificationStatus: 'none',
    verificationRequestId: null,
    username: null,
    role: null,
  };
}
