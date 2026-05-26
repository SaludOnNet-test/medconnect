// Med Connect — Central Email Dispatcher
// Mock mode: logs formatted email to server console when RESEND_API_KEY is not set
// Production mode: sends via Resend API
//
// Side effect: every successful send (real or mock) writes one row to the
// `email_sends` ledger in Azure SQL. That ledger is the source of truth for
// the Resend monthly-cap checker (`/api/exec/quotas`). Ledger writes are
// best-effort — a DB hiccup must NOT block delivery of a confirmation email.

import { fetchWithTimeout } from '@/lib/http';
import { query, sql, DB_AVAILABLE } from '@/lib/db';

const RESEND_API_KEY = process.env.RESEND_API_KEY;
// Use RESEND_FROM_EMAIL env var once medconnect.es domain is verified in Resend dashboard.
// Until then, Resend requires a verified domain — onboarding@resend.dev works for testing.
const DEFAULT_FROM = process.env.RESEND_FROM_EMAIL || 'Med Connect <onboarding@resend.dev>';

// 15 s is comfortable for Resend's normal latency (~150–500 ms) but short
// enough that an outage doesn't pin a Lambda for the full 45 s default.
const RESEND_TIMEOUT_MS = 15_000;

/**
 * Send an email via Resend, or log a mock if no API key is configured.
 * @param {Object} opts
 * @param {string} opts.to - Recipient email
 * @param {string} opts.subject - Email subject
 * @param {string} opts.html - HTML body
 * @param {string} [opts.from] - Sender (defaults to Med Connect noreply)
 * @param {string} [opts.category] - Optional tag for the ledger (booking_confirmation, daily_exec, etc.)
 * @returns {Promise<{ok: boolean, mock?: boolean, data?: any, error?: string}>}
 */
export async function sendEmail({ to, subject, html, from = DEFAULT_FROM, category = null }) {
  // Resend acepta `to` como string o array. Aceptamos también una string con
  // comas ("a@x.com, b@y.com") porque suele venir de env vars así.
  if (typeof to === 'string' && to.includes(',')) {
    to = to.split(',').map((s) => s.trim()).filter(Boolean);
    if (to.length === 1) to = to[0];
  }

  if (!RESEND_API_KEY) {
    // Mock mode — log to server terminal only
    console.log('\n========== [MOCK EMAIL] ==========');
    console.log(`📧 To:      ${Array.isArray(to) ? to.join(', ') : to}`);
    console.log(`📧 From:    ${from}`);
    console.log(`📧 Subject: ${subject}`);
    console.log(`📧 Body preview:\n${html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim().substring(0, 300)}...`);
    console.log('==================================\n');
    recordLedger({ to, subject, category, ok: true, provider: 'mock' });
    return { ok: true, mock: true };
  }

  try {
    const res = await fetchWithTimeout('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${RESEND_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ from, to, subject, html }),
      timeoutMs: RESEND_TIMEOUT_MS,
    });
    const data = await res.json();
    if (!res.ok) {
      console.error('[Email Error]', data);
      recordLedger({ to, subject, category, ok: false, provider: 'resend' });
      return { ok: false, error: data?.message || 'Resend error', data };
    }
    recordLedger({ to, subject, category, ok: true, provider: 'resend' });
    return { ok: true, data };
  } catch (err) {
    console.error('[Email Error]', err);
    recordLedger({ to, subject, category, ok: false, provider: 'resend' });
    return { ok: false, error: err.message };
  }
}

// Best-effort write to email_sends. Never throws — if the ledger table is
// missing or the DB is offline, we just drop the row. The checker will
// undercount but the email still went out.
function recordLedger({ to, subject, category, ok, provider }) {
  if (!DB_AVAILABLE) return;
  query(
    `INSERT INTO email_sends (recipient, subject, category, provider, ok)
     VALUES (@recipient, @subject, @category, @provider, @ok)`,
    {
      recipient: { type: sql.NVarChar(255), value: String(to).slice(0, 255) },
      subject: { type: sql.NVarChar(500), value: subject ? String(subject).slice(0, 500) : null },
      category: { type: sql.NVarChar(80), value: category ? String(category).slice(0, 80) : null },
      provider: { type: sql.NVarChar(40), value: provider },
      ok: { type: sql.Bit, value: ok ? 1 : 0 },
    },
  ).catch(() => { /* swallow — best-effort */ });
}
