'use client';

import { useEffect } from 'react';
import { usePathname, useSearchParams } from 'next/navigation';
import { trackPageView } from '@/lib/analytics';

/**
 * PageViewTracker — fires a `page_viewed` event on every route change.
 *
 * 2026-06-08. Closes the analytics gap between Clarity (counts all
 * post-consent sessions) and our analytics_events DB (was only logging
 * interaction events, missing 80%+ of bounces).
 *
 * Mounted globally in src/app/layout.js. Consent-gated inside
 * trackPageView() — fires nothing until the patient accepts cookies.
 * The CookieBanner also auto-upgrades consent on booking completion,
 * which means a converted patient's pre-consent pageviews land
 * retroactively on the very next route change.
 *
 * Implementation note: we depend on pathname + searchParams so SPA
 * navigations (which don't trigger a full page load) still emit the
 * event. The first paint is captured on the initial useEffect run.
 */
export default function PageViewTracker() {
  const pathname = usePathname();
  const searchParams = useSearchParams();

  useEffect(() => {
    // Fire-and-forget. If consent isn't granted yet, trackPageView is a no-op.
    trackPageView();
    // searchParams stringified so we re-fire when query changes
    // (filter changes on /search-v2 should count as new pageviews)
  }, [pathname, searchParams?.toString()]);

  return null;
}
