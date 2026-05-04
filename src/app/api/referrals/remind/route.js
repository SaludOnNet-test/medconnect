import { NextResponse } from 'next/server';
import { getPool, sql, DB_AVAILABLE } from '@/lib/db';
import { sendEmail } from '@/lib/email';
import { lockInReminder } from '@/lib/emailTemplates';
import { internalError } from '@/lib/errors';

// GET /api/referrals/remind
// Called by Vercel Cron daily.
// Finds PENDING referrals created ~30 min ago (28–32 min window) that haven't
// received a reminder yet, sends lockInReminder email, and marks them sent.
export async function GET(request) {
  // Validate cron secret. Vercel Cron sends Authorization: Bearer <CRON_SECRET>
  // by default; we also accept the legacy x-cron-secret header. Two important
  // hardenings vs. before:
  //   1. We require CRON_SECRET to be set everywhere except local dev. Preview
  //      deploys, which used to slip past the old `NODE_ENV === 'production'`
  //      guard, are now protected.
  //   2. The 'dev' string fallback is gone. Anyone who guessed it could fan
  //      out reminder emails to real patients on a preview URL.
  const bearer = (request.headers.get('authorization') || '').replace(/^Bearer\s+/i, '');
  const secret = bearer || request.headers.get('x-cron-secret') || '';
  const expected = process.env.CRON_SECRET;
  const isDev = process.env.NODE_ENV === 'development';
  if (!isDev) {
    if (!expected) {
      return NextResponse.json({ error: 'cron_not_configured' }, { status: 503 });
    }
    if (secret !== expected) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
  }

  if (!DB_AVAILABLE) {
    return NextResponse.json({ error: 'DB not configured' }, { status: 503 });
  }

  const BASE_URL = process.env.NEXT_PUBLIC_BASE_URL || 'https://www.medconnect.es';

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

        // Send reminder email by calling the dispatcher directly. We used
        // to self-fetch /api/email/send, which (a) added a 30 s+ tail-of-
        // doom if Resend hung, (b) hit the per-IP rate limiter for our
        // own server's IP under load, and (c) doubled the JSON
        // serialisation cost.
        const tpl = lockInReminder({
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
        });
        const emailRes = await sendEmail({
          to: row.patient_email,
          subject: tpl.subject,
          html: tpl.html,
        });

        if (emailRes?.ok) {
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
    return internalError(err, '[GET /api/referrals/remind]');
  }
}
