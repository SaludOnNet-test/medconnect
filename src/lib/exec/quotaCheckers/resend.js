import { getPool, DB_AVAILABLE } from '@/lib/db';

// Resend's free tier exposes no aggregate usage endpoint. We keep our own
// ledger (`email_sends`, one row per dispatch) and count from there. The
// month boundary uses the *Madrid* calendar (CET/CEST), not UTC, because the
// 3,000/mes cap is calendar-month.
//
// Cap defaults to 3,000 (free) but is overridable via RESEND_MONTHLY_CAP so
// you don't have to redeploy if you upgrade to Pro (50,000) mid-month.
export async function checkResend() {
  const cap = Number(process.env.RESEND_MONTHLY_CAP) || 3000;

  if (!DB_AVAILABLE) {
    return { provider: 'resend', ok: false, error: 'DB not configured (ledger lives in Azure SQL)' };
  }

  try {
    const pool = await getPool();
    const res = await pool.request().query(`
      SELECT COUNT(*) AS sent
      FROM email_sends
      WHERE sent_at >= DATEFROMPARTS(YEAR(SYSDATETIMEOFFSET()), MONTH(SYSDATETIMEOFFSET()), 1)
    `);
    const sent = Number(res.recordset[0]?.sent) || 0;
    const percentage = Math.round((sent / cap) * 100);

    return {
      provider: 'resend',
      ok: true,
      used: sent,
      limit: cap,
      percentage,
      status: classify(percentage),
      note: `${sent.toLocaleString('es-ES')} de ${cap.toLocaleString('es-ES')} emails este mes`,
    };
  } catch (err) {
    if (String(err?.message || '').includes('Invalid object name')) {
      return { provider: 'resend', ok: false, error: 'ledger table missing — run /api/db/setup' };
    }
    return { provider: 'resend', ok: false, error: err.message };
  }
}

function classify(p) {
  if (p >= 90) return 'critical';
  if (p >= 80) return 'warn';
  return 'ok';
}
