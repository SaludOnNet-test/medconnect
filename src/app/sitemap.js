/**
 * Dynamic sitemap — Next.js App Router convention
 * Returns an array of URL objects for /sitemap.xml
 *
 * Priority scale: 1.0 (highest) → 0.1 (lowest)
 */

import { getAllSpecialtyCityCombinations, specialtyPageUrl } from '@/lib/seoData';

const BASE_URL = process.env.NEXT_PUBLIC_BASE_URL || 'https://medconnect.es';

export default function sitemap() {
  const now = new Date().toISOString();

  // ── Core pages ───────────────────────────────────────────────
  const corePages = [
    { url: BASE_URL,                    changeFrequency: 'weekly',  priority: 1.0 },
    { url: `${BASE_URL}/search-v2`,     changeFrequency: 'daily',   priority: 0.9 },
    { url: `${BASE_URL}/derivadores`,   changeFrequency: 'monthly', priority: 0.7 },
    { url: `${BASE_URL}/book`,          changeFrequency: 'monthly', priority: 0.6 },
  ].map((p) => ({ ...p, lastModified: now }));

  // ── Legal pages ──────────────────────────────────────────────
  const legalPages = [
    { url: `${BASE_URL}/privacidad`, changeFrequency: 'yearly', priority: 0.3 },
    { url: `${BASE_URL}/legal`,      changeFrequency: 'yearly', priority: 0.3 },
    { url: `${BASE_URL}/cookies`,    changeFrequency: 'yearly', priority: 0.2 },
  ].map((p) => ({ ...p, lastModified: now }));

  // ── SEO specialty × city landing pages (8 × 5 = 40) ─────────
  // These are the highest-value pages for organic + paid traffic
  const specialtyPages = getAllSpecialtyCityCombinations().map(
    ({ especialidad, ciudad }) => ({
      url: specialtyPageUrl(especialidad, ciudad),
      lastModified: now,
      changeFrequency: 'weekly',
      priority: 0.85, // high — these target commercial-intent queries
    })
  );

  return [...corePages, ...legalPages, ...specialtyPages];
}
