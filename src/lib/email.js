// Med Connect — Central Email Dispatcher
// Mock mode: logs formatted email to server console when RESEND_API_KEY is not set
// Production mode: sends via Resend API

const RESEND_API_KEY = process.env.RESEND_API_KEY;
// Use RESEND_FROM_EMAIL env var once medconnect.es domain is verified in Resend dashboard.
// Until then, Resend requires a verified domain — onboarding@resend.dev works for testing.
const DEFAULT_FROM = process.env.RESEND_FROM_EMAIL || 'Med Connect <onboarding@resend.dev>';

/**
 * Send an email via Resend, or log a mock if no API key is configured.
 * @param {Object} opts
 * @param {string} opts.to - Recipient email
 * @param {string} opts.subject - Email subject
 * @param {string} opts.html - HTML body
 * @param {string} [opts.from] - Sender (defaults to Med Connect noreply)
 * @returns {Promise<{ok: boolean, mock?: boolean, data?: any, error?: string}>}
 */
export async function sendEmail({ to, subject, html, from = DEFAULT_FROM }) {
  if (!RESEND_API_KEY) {
    // Mock mode — log to server terminal only
    console.log('\n========== [MOCK EMAIL] ==========');
    console.log(`📧 To:      ${to}`);
    console.log(`📧 From:    ${from}`);
    console.log(`📧 Subject: ${subject}`);
    console.log(`📧 Body preview:\n${html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim().substring(0, 300)}...`);
    console.log('==================================\n');
    return { ok: true, mock: true };
  }

  try {
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${RESEND_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ from, to, subject, html }),
    });
    const data = await res.json();
    if (!res.ok) {
      console.error('[Email Error]', data);
      return { ok: false, error: data?.message || 'Resend error', data };
    }
    return { ok: true, data };
  } catch (err) {
    console.error('[Email Error]', err);
    return { ok: false, error: err.message };
  }
}
