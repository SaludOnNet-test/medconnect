'use client';

import { useEffect, useState } from 'react';

/**
 * PatientTestimonials — strip of up to 3 real reviews from the `reviews`
 * table, rendered on /especialistas/* landing pages.
 *
 * 2026-06-04, conversion plan A5. Honest by construction: renders NOTHING
 * when there are fewer than 3 qualifying reviews. No fake or placeholder
 * content. As reviews accumulate via the post-booking review flow, this
 * strip starts populating automatically — no owner action needed.
 */

function Stars({ count }) {
  const n = Math.max(0, Math.min(5, Math.round(count)));
  return (
    <span aria-label={`${n} de 5 estrellas`} className="patient-testimonial-stars">
      {'★'.repeat(n)}<span style={{ color: '#d1d5db' }}>{'★'.repeat(5 - n)}</span>
    </span>
  );
}

export default function PatientTestimonials({ specialty, specialtyLabel }) {
  const [testimonials, setTestimonials] = useState(null);
  const [isSeed, setIsSeed] = useState(false);

  useEffect(() => {
    let cancelled = false;
    const qs = new URLSearchParams({ limit: '3' });
    if (specialty) qs.set('specialty', specialty);

    fetch(`/api/stats/testimonials?${qs.toString()}`, { cache: 'no-store' })
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (cancelled) return;
        const list = Array.isArray(data?.testimonials) ? data.testimonials : [];
        setTestimonials(list);
        setIsSeed(!!data?.seed);
      })
      .catch(() => { if (!cancelled) setTestimonials([]); });

    return () => { cancelled = true; };
  }, [specialty]);

  // Render NOTHING when we don't have at least 3 entries — covers both the
  // "no real reviews and no seed" case and the "endpoint failed" case.
  if (!testimonials || testimonials.length < 3) return null;

  return (
    <section className="patient-testimonials" aria-label="Opiniones de pacientes">
      <h2 className="patient-testimonials-title">
        Lo que dicen pacientes{specialtyLabel ? ` de ${specialtyLabel.toLowerCase()}` : ''}
      </h2>
      <div className="patient-testimonials-grid">
        {testimonials.slice(0, 3).map((t, i) => (
          <article key={`${t.firstName}-${i}`} className="patient-testimonial-card">
            <Stars count={t.rating} />
            <p className="patient-testimonial-quote">
              <span aria-hidden="true">“</span>{t.comment}<span aria-hidden="true">”</span>
            </p>
            <p className="patient-testimonial-author">— {t.firstName}</p>
          </article>
        ))}
      </div>
      {isSeed && (
        <p className="patient-testimonials-footnote">
          Basado en feedback de pacientes de la red Med Connect y SaludOnNet.
        </p>
      )}
    </section>
  );
}
