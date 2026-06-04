'use client';

import { useEffect, useState } from 'react';

/**
 * RecentBookingsBar — live social-proof signal for SEM landing pages.
 *
 * 2026-06-04, conversion plan A4. Fetches the count of REAL bookings
 * (status confirmed/awaiting_voucher) in the last 7 days for the given
 * specialty from `/api/stats/recent-bookings`, then renders a one-line
 * chip in the landing hero. Renders nothing when the count is 0 — we
 * never show a placeholder that might read as scammy.
 *
 * Why client-side fetch (not server-rendered): the landing pages are
 * statically generated with generateStaticParams (~85 paths). A server-
 * side fetch would re-bake the page on each build, OR force opt-out of
 * static generation. Cheaper to fetch from the client with a 5-min cached
 * endpoint than to dynamise every landing page.
 */

export default function RecentBookingsBar({ specialty, city, specialtyLabel }) {
  const [count, setCount] = useState(null);

  useEffect(() => {
    let cancelled = false;
    if (!specialty) return;

    fetch(`/api/stats/recent-bookings?specialty=${encodeURIComponent(specialty)}&windowDays=7`, {
      cache: 'no-store', // honour the endpoint's own cache layer
    })
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (cancelled || !data) return;
        const n = Number(data.count);
        if (Number.isFinite(n)) setCount(n);
      })
      .catch(() => { /* soft-fail */ });

    return () => { cancelled = true; };
  }, [specialty]);

  if (count == null || count <= 0) return null;

  // Honest copy variants — we never inflate.
  const label = specialtyLabel ? specialtyLabel.toLowerCase() : 'consultas';
  const cityLabel = city || 'tu zona';

  const copy = count >= 5
    ? `${count} pacientes han reservado ${label} en ${cityLabel} esta semana`
    : count > 1
      ? `Las últimas ${count} reservas de ${label} en ${cityLabel} fueron esta semana`
      : `La última reserva de ${label} en ${cityLabel} fue esta semana`;

  return (
    <div className="recent-bookings-bar" role="status" aria-live="polite">
      <span className="recent-bookings-icon" aria-hidden="true">🩺</span>
      <span className="recent-bookings-text">{copy}</span>
    </div>
  );
}
