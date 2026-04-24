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
        allow: [
          '/',
          '/search-v2',
          '/book',
          '/suscripcion',
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
