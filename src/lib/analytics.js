/**
 * analytics.js — Unified client-side event tracking
 * Fires to: GA4 (gtag), Microsoft Clarity, our Azure SQL DB, and Google Ads (conversions)
 *
 * Usage:
 *   import { trackEvent, trackConversion } from '@/lib/analytics';
 *   trackEvent('search_performed', { specialty: 'Cardiología', city: 'Madrid' });
 *   trackConversion({ transactionId: 'BK-123', value: 29, userData: { email, phone } });
 *
 * Google Ads env vars (read at build time by CookieBanner; the gtag library
 * itself is loaded only after explicit cookie consent):
 *   NEXT_PUBLIC_GOOGLE_ADS_ID                       — e.g. "AW-1234567890"
 *   NEXT_PUBLIC_GOOGLE_ADS_BOOKING_CONVERSION_LABEL — e.g. "AbCdEfGhIj-KlMnOpQr"
 */

const GOOGLE_ADS_ID = process.env.NEXT_PUBLIC_GOOGLE_ADS_ID;
const GOOGLE_ADS_BOOKING_LABEL = process.env.NEXT_PUBLIC_GOOGLE_ADS_BOOKING_CONVERSION_LABEL;

function getSessionId() {
  try {
    let sid = sessionStorage.getItem('mc_sid');
    if (!sid) {
      sid = Math.random().toString(36).slice(2) + Date.now().toString(36);
      sessionStorage.setItem('mc_sid', sid);
    }
    return sid;
  } catch {
    return 'unknown';
  }
}

async function recordDbEvent(name, params) {
  try {
    fetch('/api/analytics/event', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        event_name: name,
        session_id: getSessionId(),
        properties: JSON.stringify(params),
        page_url: window.location.pathname + window.location.search,
      }),
    }); // fire-and-forget — no await
  } catch {
    // silent
  }
}

/**
 * Track a conversion event across GA4, Clarity and Azure SQL.
 * Safe to call during SSR — exits immediately if window is unavailable.
 *
 * Standard events:
 *   search_performed  — user submitted a search
 *   clinic_viewed     — booking modal opened for a clinic
 *   slot_selected     — user tapped a specific time slot
 *   book_started      — user arrived at /book
 *   book_completed    — booking confirmed successfully
 *   referral_created  — derivador sent a referral
 */
export function trackEvent(name, params = {}) {
  if (typeof window === 'undefined') return;

  // GA4
  if (typeof window.gtag === 'function') {
    try { window.gtag('event', name, params); } catch {}
  }

  // Microsoft Clarity
  if (typeof window.clarity === 'function') {
    try { window.clarity('event', name); } catch {}
  }

  // Azure SQL (our own DB)
  recordDbEvent(name, params);
}

/**
 * Hash a string with SHA-256 and return lowercase hex.
 * Used for Google Ads Enhanced Conversions: email + phone must be SHA-256
 * hashed client-side before being passed to gtag('set', 'user_data', ...).
 *
 * Per Google's spec: trim, lowercase, strip non-digits from phone (keep
 * leading +country-code), then hash. Returns null on any failure so callers
 * can skip the user_data block rather than send malformed input.
 */
async function sha256Hex(input) {
  if (!input || typeof input !== 'string') return null;
  if (typeof window === 'undefined') return null;
  if (!window.crypto || !window.crypto.subtle) return null;
  try {
    const buf = new TextEncoder().encode(input);
    const digest = await window.crypto.subtle.digest('SHA-256', buf);
    return Array.from(new Uint8Array(digest))
      .map((b) => b.toString(16).padStart(2, '0'))
      .join('');
  } catch {
    return null;
  }
}

function normalizeEmail(email) {
  if (!email || typeof email !== 'string') return null;
  return email.trim().toLowerCase();
}

function normalizePhone(phone) {
  if (!phone || typeof phone !== 'string') return null;
  // Keep leading + and digits only; strip spaces, dashes, parens.
  const cleaned = phone.trim().replace(/[^\d+]/g, '');
  if (!cleaned) return null;
  // Default to Spain country code if user typed a 9-digit local number.
  if (/^\d{9}$/.test(cleaned)) return `+34${cleaned}`;
  return cleaned.startsWith('+') ? cleaned : `+${cleaned}`;
}

/**
 * Fire a Google Ads conversion event.
 *
 * Safe to call even if Google Ads env vars aren't configured yet — exits
 * cleanly so a missing AW- ID never breaks the booking flow. Also exits if
 * the user hasn't accepted cookies (gtag won't be on window).
 *
 * @param {object} opts
 * @param {string} opts.transactionId  Unique booking reference; prevents
 *                                     double-counting if the user reloads.
 * @param {number} opts.value          Conversion value in EUR. Use the
 *                                     priority fee (platform_fee), NOT the
 *                                     full charge — that's MedConnect's
 *                                     actual revenue per booking.
 * @param {string} [opts.currency]     ISO 4217 code, defaults to 'EUR'.
 * @param {object} [opts.userData]     For Enhanced Conversions. Pass plain
 *                                     email + phone; we hash before sending.
 * @param {string} [opts.userData.email]
 * @param {string} [opts.userData.phone]
 */
export async function trackConversion({ transactionId, value, currency = 'EUR', userData } = {}) {
  if (typeof window === 'undefined') return;
  if (typeof window.gtag !== 'function') return;
  if (!GOOGLE_ADS_ID || !GOOGLE_ADS_BOOKING_LABEL) return;

  // Enhanced Conversions: hash PII client-side and attach to gtag before the
  // conversion fires. Google merges this with the conversion event by session.
  if (userData && (userData.email || userData.phone)) {
    try {
      const [emailHash, phoneHash] = await Promise.all([
        sha256Hex(normalizeEmail(userData.email)),
        sha256Hex(normalizePhone(userData.phone)),
      ]);
      const payload = {};
      if (emailHash) payload.sha256_email_address = emailHash;
      if (phoneHash) payload.sha256_phone_number = phoneHash;
      if (Object.keys(payload).length > 0) {
        window.gtag('set', 'user_data', payload);
      }
    } catch {
      // Hash failure — fall through and fire the conversion without
      // Enhanced Conversions rather than dropping it entirely.
    }
  }

  try {
    window.gtag('event', 'conversion', {
      send_to: `${GOOGLE_ADS_ID}/${GOOGLE_ADS_BOOKING_LABEL}`,
      value: typeof value === 'number' ? value : 0,
      currency,
      transaction_id: transactionId || '',
    });
  } catch {
    // silent
  }
}
