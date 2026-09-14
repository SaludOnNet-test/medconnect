// 2026-09-14 — Metadata layout for /search-v2.
//
// GSC audit: the /search-v2 route was being indexed as a page and, worse,
// as one URL per query-string variant: /search-v2?insurance=Sanitas,
// /search-v2?insurance=Adeslas, /search-v2?insurance=Mapfre, and so on.
// Each one was a separate row in Search Console with its own impressions
// and CTR, splitting the authority of the base page across dozens of
// duplicates. Meanwhile the actual insurance landings we designed for
// SEO (/aseguradoras/[aseguradora]) were being outranked by their own
// query-string doppelgängers.
//
// The page itself is a `'use client'` component — so it can't declare
// generateMetadata. This tiny server layout injects the metadata for
// the whole /search-v2 subtree:
//   • alternates.canonical → the bare `/search-v2` URL. Every filtered
//     variant now tells Google "I am /search-v2" and authority
//     consolidates on one page.
//   • robots.index = true kept on the bare page (it does get some
//     organic search traffic — visitors landing on the general search
//     UI). If we later decide it's noise, flip this to false.
//   • A single meaningful title + description so the SERP snippet is
//     coherent instead of "Med Connect — Med Connect" (the fallback the
//     'use client' page produced).
//
// Insurance-filtered searches keep working via query params for users;
// they just no longer clutter the index.

const BASE_URL = process.env.NEXT_PUBLIC_BASE_URL || 'https://www.medconnect.es';

export const metadata = {
  title: 'Buscador de citas médicas privadas — Med Connect',
  description:
    'Filtra por especialidad, ciudad y aseguradora para encontrar cita con especialistas privados esta semana en España. Tu seguro cubre la consulta, solo pagas la tarifa de prioridad desde €4.',
  alternates: { canonical: `${BASE_URL}/search-v2` },
  openGraph: {
    title: 'Buscador de citas médicas — Med Connect',
    description:
      'Encuentra cita con especialistas privados esta semana. Filtra por seguro, especialidad y ciudad.',
    url: `${BASE_URL}/search-v2`,
    siteName: 'Med Connect',
    locale: 'es_ES',
    type: 'website',
  },
  twitter: {
    card: 'summary',
    title: 'Buscador de citas médicas — Med Connect',
    description:
      'Encuentra cita con especialistas privados esta semana. Filtra por seguro, especialidad y ciudad.',
  },
};

export default function SearchV2Layout({ children }) {
  return children;
}
