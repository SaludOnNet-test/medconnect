import { NextResponse } from 'next/server';
import { query, sql, DB_AVAILABLE } from '@/lib/db';

/**
 * GET /api/pro/me?email=<professional-email>
 *
 * Returns the pro user's clinic mapping + alta status. The dashboard +
 * ReferralModal use this to gate "interna" derivation: if the user isn't
 * yet attached to a clinic, the modal shows an "alta pendiente" message
 * and only "externa" derivations work.
 *
 * Schema today is provisional. Once admin_users has clinic_id +
 * alta_request_id columns (PR G2), this endpoint joins to clinics and
 * clinic_alta_requests; for now it returns null fields when nothing is
 * mapped, which is the correct gating behaviour.
 *
 * Response:
 *   { clinicId: number | null,
 *     clinicName: string | null,
 *     clinicCity: string | null,
 *     altaStatus: 'active' | 'pending' | 'none' }
 */
export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const email = (searchParams.get('email') || '').trim();
  if (!email) {
    return NextResponse.json({ error: 'email is required' }, { status: 400 });
  }
  if (!DB_AVAILABLE) {
    return NextResponse.json({ clinicId: null, clinicName: null, clinicCity: null, altaStatus: 'none' });
  }

  try {
    // Defensive: only read columns that already exist on admin_users today.
    // PR G2 will widen this once clinic_id / alta_request_id are added.
    const result = await query(
      `SELECT TOP 1 username, role, display_name
       FROM admin_users
       WHERE LOWER(username) = LOWER(@email)`,
      { email: { type: sql.NVarChar(255), value: email } },
    );
    const row = result.recordset[0];
    if (!row) {
      return NextResponse.json({ clinicId: null, clinicName: null, clinicCity: null, altaStatus: 'none' });
    }
    // No clinic_id column yet → always return null + altaStatus 'none'.
    // ReferralModal interprets this as "no clinic attached" and gates
    // internal derivation. External derivation works fine.
    return NextResponse.json({
      clinicId: null,
      clinicName: null,
      clinicCity: null,
      altaStatus: 'none',
      username: row.username,
      role: row.role,
    });
  } catch (err) {
    console.error('[GET /api/pro/me]', err);
    return NextResponse.json({ clinicId: null, clinicName: null, clinicCity: null, altaStatus: 'none', error: err.message });
  }
}
