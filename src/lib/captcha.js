// Cloudflare Turnstile verification helper.
//
// Behaviour:
//   - When TURNSTILE_SECRET_KEY is unset (local dev / preview), verifyCaptcha
//     returns { ok: true, skipped: true } so flows still work without keys.
//   - When the secret is set we require a token in the body/header and call
//     Cloudflare's /siteverify endpoint with a tight timeout.

import { fetchWithTimeout } from '@/lib/http';

const VERIFY_URL = 'https://challenges.cloudflare.com/turnstile/v0/siteverify';

const HAS_TURNSTILE = !!process.env.TURNSTILE_SECRET_KEY;

/**
 * @param {string} token  Token returned by the Turnstile widget on the client.
 * @param {Request} [request] Optional — used to forward the client IP.
 * @returns {Promise<{ok:boolean, skipped?:boolean, errorCodes?:string[]}>}
 */
export async function verifyCaptcha(token, request) {
  if (!HAS_TURNSTILE) {
    return { ok: true, skipped: true };
  }
  if (!token || typeof token !== 'string') {
    return { ok: false, errorCodes: ['missing-input-response'] };
  }

  const params = new URLSearchParams();
  params.set('secret', process.env.TURNSTILE_SECRET_KEY);
  params.set('response', token);
  if (request) {
    const xff = request.headers.get('x-forwarded-for');
    if (xff) params.set('remoteip', xff.split(',')[0].trim());
  }

  try {
    const res = await fetchWithTimeout(VERIFY_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: params.toString(),
      timeoutMs: 5_000,
    });
    if (!res.ok) return { ok: false, errorCodes: [`http_${res.status}`] };
    const data = await res.json();
    if (data?.success) return { ok: true };
    return { ok: false, errorCodes: data?.['error-codes'] || ['verify-failed'] };
  } catch (err) {
    // Don't fail-open: captcha-protected endpoints are precisely the ones
    // an attacker would target during a Cloudflare outage.
    return { ok: false, errorCodes: [`network:${err.message}`] };
  }
}

/** True if Turnstile keys are configured on the server. */
export const captchaEnabled = HAS_TURNSTILE;
