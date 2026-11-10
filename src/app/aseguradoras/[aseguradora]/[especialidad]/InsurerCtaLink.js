'use client';
import Link from 'next/link';
import { trackEvent } from '@/lib/analytics';

/**
 * Link that records which booking entry point of an insurer×specialty page
 * the patient used (`insurer_page_cta_click`), so we can tell which of the
 * 144 pages and which CTA actually drive bookings.
 */
export default function InsurerCtaLink({ href, cta, insurer, specialty, className, children }) {
  const handleClick = () => {
    try {
      trackEvent('insurer_page_cta_click', { cta, insurer, specialty });
    } catch { /* analytics is fire-and-forget */ }
  };
  return (
    <Link href={href} className={className} onClick={handleClick}>
      {children}
    </Link>
  );
}
