// Server-component layout for the client `/search-v2` page so we can
// export `metadata` (Next.js 16 forbids `metadata` on `'use client'`
// components, and the page itself uses Clerk + Leaflet hooks).
//
// Why a canonical pointing to the bare `/search-v2`:
//   The page filters via query params (?specialty=N, ?city=X,
//   ?insurance=Y). Google was indexing each combination as a separate
//   page, marking most as "Crawled - currently not indexed" because
//   they're effectively the same template with different filters. A
//   single canonical to `/search-v2` consolidates the link equity into
//   the parameterless URL — the one that matches the most generic
//   search intent.

export const metadata = {
  title: 'Buscar especialistas — Med Connect',
  description: 'Encuentra clínicas y especialistas con cita rápida en tu ciudad. Filtra por especialidad, aseguradora y horario.',
  alternates: { canonical: '/search-v2' },
};

export default function SearchV2Layout({ children }) {
  return children;
}
