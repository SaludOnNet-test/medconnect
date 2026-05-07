// Server-component layout that wraps the client `/book` page so we can
// export `metadata`. The page itself is `'use client'` (Stripe form +
// Clerk pro-detection bridge), and Next.js 16 forbids `metadata` on
// client components.
//
// Why noindex:
//   `/book` is a transactional page that requires URL params (providerId,
//   slot, etc.) to do anything meaningful. The bare `/book` URL is
//   functionally an empty form. Google was crawling it as a duplicate
//   without canonical (Search Console 2026-05-07 — "Duplicate without
//   user-selected canonical") because variants like
//   `/book?providerId=42&providerName=...` all serve the same shell.
//   Marking it noindex tells Google to drop it from the index entirely
//   so the param-bearing variants are no longer treated as competing
//   duplicates of an already-thin page. Patients still reach this page
//   from /search-v2 → ClinicBookingModal which doesn't depend on
//   indexing.

export const metadata = {
  title: 'Reservar cita — Med Connect',
  description: 'Confirma tu reserva prioritaria.',
  robots: { index: false, follow: true },
};

export default function BookLayout({ children }) {
  return children;
}
