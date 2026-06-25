'use client';
/**
 * AnonVisitTracker — fires /api/_visit on every route change.
 *
 * 2026-06-22 — Added to close the 8× gap between Clarity sessions (244)
 * and analytics_events DB sessions (31) observed in the 15-22 jun audit.
 * The DB miss is the consent gate on `page_viewed` — every bouncer who
 * declines cookies is invisible. This tracker is OUTSIDE the consent
 * boundary because it records only AGGREGATE counts per (path, date),
 * no personal data of any kind (no IP, UA, session id, etc.).
 *
 * Behaviour:
 *   - Fires once on initial mount.
 *   - Fires again every time the pathname changes (client navigation).
 *   - Skips /admin, /internal, /api, /_next — those are filtered also
 *     at the API but local skip avoids the round-trip.
 *
 * Fire-and-forget: no await, no error handling. If the endpoint is
 * down, the page is unaffected.
 */

import { useEffect, useRef } from 'react';
import { usePathname } from 'next/navigation';

const SKIP = /^\/(admin|internal|api|_next)(\/|$)/;

export default function AnonVisitTracker() {
  const pathname = usePathname();
  // Dedup per-tab: if React re-renders on the same path, don't fire twice.
  const lastSent = useRef(null);

  useEffect(() => {
    if (!pathname) return;
    if (SKIP.test(pathname)) return;
    if (lastSent.current === pathname) return;
    lastSent.current = pathname;

    // Fire-and-forget. We don't await, don't read the response.
    try {
      fetch('/api/anon-visit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ path: pathname }),
        keepalive: true,
      }).catch(() => {});
    } catch {
      // Silent — the visit just doesn't get counted this time.
    }
  }, [pathname]);

  return null;
}
