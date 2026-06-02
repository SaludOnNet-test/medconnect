// GET /api/slot-holds/recover-abandoned
//
// Vercel cron at */15 * * * * (every 15 minutes). Finds `slot_holds`
// rows where:
//   - the 15-min hold expired ≥ 1 min ago,
//   - the patient typed an email on /book before bailing,
//   - the cron hasn't already sent a recovery email,
//   - the booking didn't convert (`converted_at IS NULL`).
//
// For each match: render `abandonedHoldRecovery`, sendEmail, then
// stamp `recovery_email_sent_at`. The partial index on `slot_holds`
// (`IX_slot_holds_recovery_due`) keeps the SELECT cheap even when the
// table grows.
//
// Also purges rows older than 7 days regardless of state — the
// `form_snapshot` contains DOB / DNI / phone, so we cap the retention
// window tight.
//
// Auth: same `CRON_SECRET` pattern as the other crons.

import { NextResponse } from 'next/server';
import { getPool, sql, DB_AVAILABLE } from '@/lib/db';
import { sendEmail } from '@/lib/email';
import { abandonedHoldRecovery } from '@/lib/emailTemplates';
import { internalError } from '@/lib/errors';

export const dynamic = 'force-dynamic';

const BASE_URL = process.env.NEXT_PUBLIC_BASE_URL || 'https://www.medconnect.es';
const RECOVERY_BATCH = 100;
const PII_TTL_DAYS = 7;

export async function GET(request) {
  const bearer = (request.headers.get('authorization') || '').replace(/^Bearer\s+/i, '');
  const secret = bearer || request.headers.get('x-cron-secret') || '';
  const expected = process.env.CRON_SECRET;
  const isDev = process.env.NODE_ENV === 'development';
  if (!isDev) {
    if (!expected) return NextResponse.json({ error: 'cron_not_configured' }, { status: 503 });
    if (secret !== expected) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  if (!DB_AVAILABLE) {
    return NextResponse.json({ error: 'DB not configured' }, { status: 503 });
  }

  let sent = 0;
  let failed = 0;
  let purged = 0;

  try {
    const pool = await getPool();

    // Step 1: pick candidates. `held_until` is in DATETIMEOFFSET; SQL
    // Server compares it against SYSDATETIMEOFFSET() correctly. The
    // 1-minute grace window protects against tail edges where the
    // hold technically expired but the patient is back on the page
    // submitting payment right now.
    let candidates = [];
    try {
      const result = await pool.request()
        .input('batch', sql.Int, RECOVERY_BATCH)
        .query(`
          SELECT TOP (@batch)
            id, session_id, clinic_id, clinic_name, slot_date, slot_time,
            procedure_slug, procedure_name, procedure_price, tier,
            fee, fee_label, has_insurance, insurance_company,
            patient_email, form_snapshot
          FROM slot_holds
          WHERE held_until <= DATEADD(MINUTE, -1, SYSDATETIMEOFFSET())
            AND converted_at IS NULL
            AND recovery_email_sent_at IS NULL
            AND patient_email IS NOT NULL
          ORDER BY held_until ASC
        `);
      candidates = result.recordset || [];
    } catch (err) {
      if (String(err?.message || '').includes('Invalid object name')) {
        // Pre-migration — slot_holds doesn't exist yet, nothing to do.
        return NextResponse.json({ ok: true, sent: 0, failed: 0, purged: 0, migrationPending: true });
      }
      throw err;
    }

    for (const row of candidates) {
      try {
        // Build the recovery URL — drops the patient back on /book
        // with the slot params + ?restoredHoldId so the page knows to
        // refetch the form snapshot and acquire a fresh hold.
        const params = new URLSearchParams({
          providerId: String(row.clinic_id),
          providerName: row.clinic_name || '',
          date: row.slot_date,
          time: row.slot_time,
          fee: String(row.fee ?? ''),
          feeLabel: row.fee_label || '',
          tier: String(row.tier ?? ''),
          procedureSlug: row.procedure_slug || '',
          procedureName: row.procedure_name || '',
          procedurePrice: String(row.procedure_price ?? ''),
          isSinSeguro: row.has_insurance === false ? 'true' : 'false',
          ...(row.insurance_company ? { insurance: row.insurance_company } : {}),
          restoredHoldId: String(row.id),
        });
        const recoveryUrl = `${BASE_URL.replace(/\/$/, '')}/book?${params.toString()}`;

        let snapshot = null;
        try { snapshot = row.form_snapshot ? JSON.parse(row.form_snapshot) : null; } catch {}
        const patientName = snapshot && [snapshot.name, snapshot.surname].filter(Boolean).join(' ').trim();

        const tpl = abandonedHoldRecovery({
          clinicName: row.clinic_name,
          slotDate: row.slot_date,
          slotTime: row.slot_time,
          procedureName: row.procedure_name,
          fee: row.fee,
          recoveryUrl,
          patientName: patientName || null,
        });

        await sendEmail({ to: row.patient_email, subject: tpl.subject, html: tpl.html });
        await pool.request()
          .input('id', sql.Int, row.id)
          .query(`UPDATE slot_holds
                  SET recovery_email_sent_at = SYSDATETIMEOFFSET(),
                      updated_at = SYSDATETIMEOFFSET()
                  WHERE id = @id`);
        sent += 1;
      } catch (e) {
        failed += 1;
        console.error('[slot-holds recover] send failed for row', row?.id, e?.message);
      }
    }

    // Step 2: purge rows older than 7 days. Best-effort.
    try {
      const purgeRes = await pool.request()
        .input('cutoff_days', sql.Int, PII_TTL_DAYS)
        .query(`DELETE FROM slot_holds
                WHERE created_at < DATEADD(DAY, -@cutoff_days, SYSDATETIMEOFFSET())`);
      purged = purgeRes.rowsAffected?.[0] || 0;
    } catch (e) {
      console.error('[slot-holds recover] purge failed', e?.message);
    }

    return NextResponse.json({ ok: true, sent, failed, purged });
  } catch (err) {
    return internalError(err, '[GET /api/slot-holds/recover-abandoned]');
  }
}
