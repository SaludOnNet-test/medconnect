/**
 * Dynamic sitemap — Next.js App Router convention
 * Returns an array of URL objects for /sitemap.xml
 *
 * Priority scale: 1.0 (highest) → 0.1 (lowest)
 */

import { getAllSpecialtyCityCombinations, specialtyPageUrl, SPECIALTY_MAP } from '@/lib/seoData';
import { getAllBlogPosts } from '@/lib/blogData';
import { getAllInsurerSpecialtyCombinations, insurerSpecialtyPageUrl } from '@/lib/insurerData';

const BASE_URL = process.env.NEXT_PUBLIC_BASE_URL || 'https://www.medconnect.es';

export default function sitemap() {
  // Last significant site-wide content update (2026-06-24 pricing change).
  // A stable date is a more honest signal than `new Date()` per request,
  // which tells Google "everything changed right now" on every crawl.
  const SITE_LAST_MODIFIED = '2026-06-24';

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
    // /book intentionally NOT listed — it's noindex; a sitemap entry would
    // send Google a contradictory signal.
    { url: `${BASE_URL}/contacto`,                    changeFrequency: 'yearly',  priority: 0.5 },
  ].map((p) => ({ ...p, lastModified: SITE_LAST_MODIFIED }));

  // ── Legal pages ──────────────────────────────────────────────
  const legalPages = [
    { url: `${BASE_URL}/privacidad`, changeFrequency: 'yearly', priority: 0.3 },
    { url: `${BASE_URL}/legal`,      changeFrequency: 'yearly', priority: 0.3 },
    { url: `${BASE_URL}/cookies`,    changeFrequency: 'yearly', priority: 0.2 },
  ].map((p) => ({ ...p, lastModified: SITE_LAST_MODIFIED }));

  // ── SEO specialty × city landing pages (8 × 11 = 88) ────────
  // These are the highest-value pages for organic + paid traffic.
  // Six second-wave cities added 2026-04-29 (Bilbao, Zaragoza, Granada,
  // Murcia, Vigo, Córdoba) automatically flow through here because
  // getAllSpecialtyCityCombinations reads from CITY_MAP in seoData.js.
  const specialtyPages = getAllSpecialtyCityCombinations().map(
    ({ especialidad, ciudad }) => ({
      url: specialtyPageUrl(especialidad, ciudad),
      lastModified: SITE_LAST_MODIFIED,
      changeFrequency: 'weekly',
      priority: 0.85, // high — these target commercial-intent queries
    })
  );

  // ── Blog posts ───────────────────────────────────────────────
  const blogPosts = getAllBlogPosts();
  const newestPostDate = blogPosts[0]?.publishedAt || SITE_LAST_MODIFIED;
  const blogIndexPage = [
    { url: `${BASE_URL}/blog`, lastModified: newestPostDate, changeFrequency: 'weekly', priority: 0.7 },
  ];
  const blogPostPages = blogPosts.map((post) => ({
    url: `${BASE_URL}/blog/${post.slug}`,
    lastModified: post.publishedAt,
    changeFrequency: 'monthly',
    priority: 0.65,
  }));

  // ── Insurer × specialty landing pages (8 × 18 = 144) ───────────────
  const insurerPages = getAllInsurerSpecialtyCombinations(SPECIALTY_MAP).map(
    ({ aseguradora, especialidad }) => ({
      url: insurerSpecialtyPageUrl(aseguradora, especialidad),
      lastModified: SITE_LAST_MODIFIED,
      changeFrequency: 'monthly',
      priority: 0.75,
    })
  );

  return [...corePages, ...legalPages, ...specialtyPages, ...blogIndexPage, ...blogPostPages, ...insurerPages];
}
