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
  // Includes the brand-redesign 2026 nav targets that previously weren't
  // in the sitemap — Google was crawling them via internal links from the
  // header but they weren't getting the priority signal a sitemap entry
  // gives. /derivadores is intentionally NOT here anymore: it's a 308
  // redirect to /para-clinicas-o-medicos, and sitemaps shouldn't list
  // redirected URLs (Google follows them but they dilute the canonical
  // signal).
  const corePages = [
    { url: BASE_URL,                                  changeFrequency: 'weekly',  priority: 1.0 },
    { url: `${BASE_URL}/search-v2`,                   changeFrequency: 'daily',   priority: 0.9 },
    { url: `${BASE_URL}/como-funciona`,               changeFrequency: 'monthly', priority: 0.8 },
    { url: `${BASE_URL}/aseguradoras`,                changeFrequency: 'monthly', priority: 0.8 },
    { url: `${BASE_URL}/sin-seguro`,                  changeFrequency: 'monthly', priority: 0.8 },
    { url: `${BASE_URL}/faq`,                         changeFrequency: 'monthly', priority: 0.7 },
    { url: `${BASE_URL}/para-clinicas-o-medicos`,     changeFrequency: 'monthly', priority: 0.7 },
    { url: `${BASE_URL}/book`,                        changeFrequency: 'monthly', priority: 0.6 },
    { url: `${BASE_URL}/contacto`,                    changeFrequency: 'yearly',  priority: 0.5 },
  ].map((p) => ({ ...p, lastModified: now }));

  // ── Legal pages ──────────────────────────────────────────────
  const legalPages = [
    { url: `${BASE_URL}/privacidad`, changeFrequency: 'yearly', priority: 0.3 },
    { url: `${BASE_URL}/legal`,      changeFrequency: 'yearly', priority: 0.3 },
    { url: `${BASE_URL}/cookies`,    changeFrequency: 'yearly', priority: 0.2 },
  ].map((p) => ({ ...p, lastModified: now }));

  // ── SEO specialty × city landing pages (8 × 11 = 88) ────────
  // These are the highest-value pages for organic + paid traffic.
  // Six second-wave cities added 2026-04-29 (Bilbao, Zaragoza, Granada,
  // Murcia, Vigo, Córdoba) automatically flow through here because
  // getAllSpecialtyCityCombinations reads from CITY_MAP in seoData.js.
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
