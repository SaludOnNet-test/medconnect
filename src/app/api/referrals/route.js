import { NextResponse } from 'next/server';
import { getPool, sql, DB_AVAILABLE } from '@/lib/db';

// ---------------------------------------------------------------------------
// Row → camelCase object
// ---------------------------------------------------------------------------
function toReferral(row) {
  return {
    id: row.id,
    state: row.state,
    patientEmail: row.patient_email,
    professionalEmail: row.professional_email,
    professionName: row.profession_name,
    providerId: row.provider_id,
    providerName: row.provider_name,
    slotDate: row.slot_date,
    slotTime: row.slot_time,
    fee: row.fee ? Number(row.fee) : null,
    specialty: row.specialty,
    patientName: row.patient_name,
    patientPhone: row.patient_phone,
    patientAddress: row.patient_address,
    lockInWarningAt: row.lock_in_warning_at,
    completedAt: row.completed_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

// ---------------------------------------------------------------------------
// GET /api/referrals?professionalEmail=...
// ---------------------------------------------------------------------------
export async function GET(request) {
  if (!DB_AVAILABLE) {
    return NextResponse.json({ error: 'DB not configured' }, { status: 503 });
  }

  const { searchParams } = new URL(request.url);
  const professionalEmail = searchParams.get('professionalEmail');

  try {
    const pool = await getPool();
    const req = pool.request();
    let queryStr = 'SELECT * FROM referrals';
    if (professionalEmail) {
      req.input('professionalEmail', sql.NVarChar(255), professionalEmail);
      queryStr += ' WHERE professional_email = @professionalEmail';
    }
    queryStr += ' ORDER BY created_at DESC';

    const result = await req.query(queryStr);
    return NextResponse.json(result.recordset.map(toReferral));
  } catch (err) {
    console.error('[GET /api/referrals]', err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

// ---------------------------------------------------------------------------
// POST /api/referrals — create a new referral
// ---------------------------------------------------------------------------
export async function POST(request) {
  if (!DB_AVAILABLE) {
    return NextResponse.json({ error: 'DB not configured' }, { status: 503 });
  }

  const body = await request.json();
  const {
    id,
    patientEmail,
    professionalEmail,
    professionName,
    providerId,
    providerName,
    slotDate,
    slotTime,
    fee,
    specialty,
    lockInWarningAt,
  } = body;

  if (!id || !patientEmail) {
    return NextResponse.json({ error: 'id and patientEmail are required' }, { status: 400 });
  }

  try {
    const pool = await getPool();
    await pool.request()
      .input('id', sql.NVarChar(50), id)
      .input('state', sql.NVarChar(30), 'PENDING')
      .input('patient_email', sql.NVarChar(255), patientEmail)
      .input('professional_email', sql.NVarChar(255), professionalEmail || null)
      .input('profession_name', sql.NVarChar(255), professionName || null)
      .input('provider_id', sql.Int, providerId || null)
      .input('provider_name', sql.NVarChar(255), providerName || null)
      .input('slot_date', sql.NVarChar(20), slotDate || null)
      .input('slot_time', sql.NVarChar(10), slotTime || null)
      .input('fee', sql.Decimal(10, 2), fee || null)
      .input('specialty', sql.NVarChar(100), specialty || null)
      .input('lock_in_warning_at', sql.DateTimeOffset, lockInWarningAt ? new Date(lockInWarningAt) : null)
      .query(`
        INSERT INTO referrals
          (id, state, patient_email, professional_email, profession_name,
           provider_id, provider_name, slot_date, slot_time, fee, specialty, lock_in_warning_at)
        VALUES
          (@id, @state, @patient_email, @professional_email, @profession_name,
           @provider_id, @provider_name, @slot_date, @slot_time, @fee, @specialty, @lock_in_warning_at)
      `);

    // Fetch the inserted row to return it
    const result = await pool.request()
      .input('id', sql.NVarChar(50), id)
      .query('SELECT * FROM referrals WHERE id = @id');

    return NextResponse.json(toReferral(result.recordset[0]), { status: 201 });
  } catch (err) {
    console.error('[POST /api/referrals]', err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
