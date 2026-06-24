'use client';
/**
 * BlogCTA — tracked CTA anchor for blog articles.
 *
 * Fires `blog_cta_click` to GA4 + Clarity + Azure SQL on click,
 * then navigates to /search-v2 with the specialty pre-selected via
 * ?specialtySlug= so the filter is applied on arrival.
 *
 * Measured events:
 *   blog_cta_click  { article_slug, specialty_slug, destination, label }
 *
 * Downstream: filter analytics_events WHERE event_name='blog_cta_click'
 * and JOIN on session_id with book_completed to measure blog→conversion rate.
 */
import { trackEvent } from '@/lib/analytics';

export default function BlogCTA({ articleSlug, specialtySlug, specialtyName, label, size = 'md', variant = 'primary' }) {
  const href = specialtySlug
    ? `/search-v2?specialtySlug=${encodeURIComponent(specialtySlug)}`
    : '/search-v2';

  function handleClick() {
    trackEvent('blog_cta_click', {
      article_slug: articleSlug,
      specialty_slug: specialtySlug || null,
      specialty_name: specialtyName || null,
      destination: href,
      label: label || null,
      source: 'blog_article',
    });
  }

  const displayLabel = label || (specialtyName ? `Buscar ${specialtyName}` : 'Buscar mi especialista');

  return (
    <a
      href={href}
      onClick={handleClick}
      className={`brand-btn brand-btn--${variant} brand-btn--${size}`}
      data-brass-element={variant === 'primary' ? '' : undefined}
    >
      <span className="brand-btn__label">{displayLabel}</span>
    </a>
  );
}
