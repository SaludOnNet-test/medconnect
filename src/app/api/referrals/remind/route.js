import { NextResponse } from 'next/server';
import { getPool, sql, DB_AVAILABLE } from '@/lib/db';

// GET /api/referrals/remind
// Called by Vercel Cron every 2 minutes.
// Finds PENDING referrals created ~30 min ago (28–32 min window) that haven't
// received a reminder yet, sends lockInReminder email, and marks them sent.
export async function GET(request) {
  // Validate cron secret to prevent public triggering
  const secret = request.headers.get('x-cron-secret');
  const expected = process.env.CRON_SECRET || 'dev';
  if (secret !== expected && process.env.NODE_ENV === 'production') {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  if (!DB_AVAILABLE) {
    return NextResponse.json({ error: 'DB not configured' }, { status: 503 });
  }

  const BASE_URL = process.env.NEXT_PUBLIC_BASE_URL || 'https://medconnect.es';

  try {
    const pool = await getPool();

    // Find referrals in the 28–32 minute window since creation, still PENDING, no reminder sent
    const result = await pool.request().query(`
      SELECT id, patient_email, professional_email, profession_name,
             provider_name, slot_date, slot_time, fee, specialty, lock_in_warning_at
      FROM referrals
      WHERE state = 'PENDING'
        AND reminder_sent = 0
        AND created_at >= DATEADD(minute, -32, SYSDATETIMEOFFSET())
        AND created_at <= DATEADD(minute, -28, SYSDATETIMEOFFSET())
    `);

    const rows = result.recordset;
    let sent = 0;

    for (const row of rows) {
      try {
        // Build lock-in URL with full referral data encoded (cross-browser safe)
        const payload = Buffer.from(JSON.stringify({
          patientEmail: row.patient_email,
          professionalEmail: row.professional_email,
          providerName: row.provider_name,
          slotDate: row.slot_date,
          slotTime: row.slot_time,
          fee: row.fee,
          clinicName: row.profession_name,
          specialty: row.specialty,
        })).toString('base64');
        const lockInUrl = `${BASE_URL}/lock-in/${row.id}?data=${payload}`;

        // Send reminder email via our own email API
        const emailRes = await fetch(`${BASE_URL}/api/email/send`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            templateName: 'lockInReminder',
            data: {
              patientEmail: row.patient_email,
              professionalEmail: row.professional_email,
              clinicName: row.profession_name || 'Tu centro médico',
              specialty: row.specialty || 'Consulta médica',
              providerName: row.provider_name,
              slotDate: row.slot_date,
              slotTime: row.slot_time,
              fee: row.fee,
              lockInId: row.id,
              lockInUrl,
            },
          }),
        });

        if (emailRes.ok) {
          // Mark reminder as sent
          await pool.request()
            .input('id', sql.NVarChar(50), row.id)
            .query(`UPDATE referrals SET reminder_sent = 1, updated_at = SYSDATETIMEOFFSET() WHERE id = @id`);
          sent++;
        }
      } catch (rowErr) {
        console.error(`[remind] Failed for referral ${row.id}:`, rowErr.message);
      }
    }

    return NextResponse.json({ checked: rows.length, sent });
  } catch (err) {
    console.error('[GET /api/referrals/remind]', err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
