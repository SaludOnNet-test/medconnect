/**
 * analytics.js — Unified client-side event tracking
 * Fires to: GA4 (gtag), Microsoft Clarity, and our Azure SQL DB
 *
 * Usage:
 *   import { trackEvent } from '@/lib/analytics';
 *   trackEvent('search_performed', { specialty: 'Cardiología', city: 'Madrid' });
 */

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
