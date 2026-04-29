/**
 * robots.txt — Next.js App Router convention
 * Returned object is serialised to /robots.txt by the framework.
 *
 * Rules:
 *  - Allow all public pages to be indexed
 *  - Block API routes, admin, pro dashboard, lock-in, sign-in/sign-up, internal paths
 */

const BASE_URL = process.env.NEXT_PUBLIC_BASE_URL || 'https://medconnect.es';

export default function robots() {
  return {
    rules: [
      {
        userAgent: '*',
        // The leading wildcard `/` already allows everything — these
        // explicit entries are for clarity / signal to crawlers about the
        // pages we actively want indexed. Keep `/derivadores` for the
        // existing 308 → /para-clinicas-o-medicos redirect link equity.
        allow: [
          '/',
          '/search-v2',
          '/book',
          '/suscripcion',
          '/como-funciona',
          '/aseguradoras',
          '/sin-seguro',
          '/faq',
          '/para-clinicas-o-medicos',
          '/contacto',
          '/derivadores',
          '/privacidad',
          '/legal',
          '/cookies',
        ],
        disallow: [
          '/api/',
          '/admin',
          '/pro/',
          '/lock-in/',
          '/sign-in',
          '/sign-up',
          '/book/confirmed',
          '/book/refund',
          '/_next/',
        ],
      },
    ],
    sitemap: `${BASE_URL}/sitemap.xml`,
    host: BASE_URL,
  };
}
