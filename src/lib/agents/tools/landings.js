// `list_landing_pages` tool — returns the SEO landing matrix joined with
// real traffic + conversion metrics from analytics_events and bookings.
//
// Each row covers one (specialty, city) page like
// `/especialistas/cardiologia/madrid`. The metrics come from the existing
// `analytics_events` table, filtered by `page_url`.

import { query, sql } from '@/lib/db';
import {
  SPECIALTY_MAP,
  CITY_MAP,
  getAllSpecialtyCityCombinations,
  specialtyPageUrl,
} from '@/lib/seoData';

function relativePath(url) {
  // specialtyPageUrl returns a fully-qualified URL — analytics_events stores
  // either the absolute or relative form depending on instrumentation. Match
  // both via LIKE on the tail.
  try {
    const u = new URL(url);
    return u.pathname;
  } catch {
    return url;
  }
}

/**
 * Returns one row per (specialty, city) combo with metrics for the window.
 *
 * Implementation strategy: a single CTE-based query in SQL Server that
 * emits all 88 paths from analytics_events grouped by `page_url`, plus a
 * second pass for bookings keyed off `specialty`. Cleaner than 88 round
 * trips. We assume analytics events log `page_url` close to the relative
 * path; the LIKE handles trailing slashes and absolute/relative variants.
 */
export async function listLandingPages({ days = 7 } = {}) {
  const safeDays = Math.max(1, Math.min(60, Math.floor(Number(days)) || 7));

  // 1. Aggregate analytics_events for all paths starting with /especialistas/.
  const eventsRes = await query(
    `SELECT
        page_url,
        SUM(CASE WHEN event_name = 'page_view' THEN 1 ELSE 0 END) AS views,
        COUNT(DISTINCT session_id) AS sessions,
        SUM(CASE WHEN event_name = 'clinic_viewed' THEN 1 ELSE 0 END) AS clinic_views,
        SUM(CASE WHEN event_name = 'book_started' THEN 1 ELSE 0 END) AS book_started,
        SUM(CASE WHEN event_name = 'book_completed' THEN 1 ELSE 0 END) AS book_completed
       FROM analytics_events
      WHERE created_at >= DATEADD(day, -@days, SYSDATETIMEOFFSET())
        AND page_url LIKE '%/especialistas/%'
      GROUP BY page_url`,
    { days: { type: sql.Int, value: safeDays } }
  );

  // Build a quick { path → metrics } map. Strip protocol/host so /specialty/city
  // matches whether it was logged absolute or relative.
  const byPath = new Map();
  for (const row of eventsRes.recordset) {
    const p = relativePath(row.page_url || '').replace(/\/$/, '');
    if (!p) continue;
    byPath.set(p, {
      views: row.views || 0,
      sessions: row.sessions || 0,
      clinic_views: row.clinic_views || 0,
      book_started: row.book_started || 0,
      book_completed: row.book_completed || 0,
    });
  }

  // 2. Bookings totals grouped by specialty — the `bookings` table stores
  // the specialty as a free-text column, so we lowercase + trim and rely on
  // the operator-curated SPECIALTY_MAP names being a superset of what gets
  // written. The city dimension isn't reliably captured per booking, so we
  // only emit a per-specialty roll-up; the city × specialty conversion
  // remains derivable from analytics_events (book_completed by page_url).
  const bookRes = await query(
    `SELECT
        LOWER(LTRIM(RTRIM(specialty))) AS specialty_lc,
        COUNT(*) AS bookings,
        AVG(CAST(amount AS FLOAT)) AS avg_amount_eur
       FROM bookings
      WHERE created_at >= DATEADD(day, -@days, SYSDATETIMEOFFSET())
        AND specialty IS NOT NULL
      GROUP BY LOWER(LTRIM(RTRIM(specialty)))`,
    { days: { type: sql.Int, value: safeDays } }
  );
  const bookingsBySpecialty = bookRes.recordset.reduce((acc, row) => {
    if (!row.specialty_lc) return acc;
    acc[row.specialty_lc] = (acc[row.specialty_lc] || 0) + (row.bookings || 0);
    return acc;
  }, {});

  // 3. Merge — emit one row per known (specialty, city) combo.
  const combos = getAllSpecialtyCityCombinations();
  const rows = combos.map(({ especialidad, ciudad }) => {
    const sp = SPECIALTY_MAP[especialidad];
    const cityName = CITY_MAP[ciudad];
    const url = specialtyPageUrl(especialidad, ciudad);
    const path = `/especialistas/${especialidad}/${ciudad}`;
    const metrics = byPath.get(path) || {
      views: 0, sessions: 0, clinic_views: 0, book_started: 0, book_completed: 0,
    };
    const conversionRate = metrics.sessions > 0
      ? Math.round((metrics.book_completed / metrics.sessions) * 1000) / 10
      : 0;
    return {
      especialidad,
      ciudad,
      especialidad_name: sp?.name,
      ciudad_name: cityName,
      url,
      path,
      metrics,
      conversion_rate_pct: conversionRate,
      bookings_specialty_total: bookingsBySpecialty[sp?.name?.toLowerCase()] || 0,
    };
  });

  // Sort by views descending so the model can spot under-performers easily.
  rows.sort((a, b) => (b.metrics.views || 0) - (a.metrics.views || 0));
  return { period_days: safeDays, total_combos: rows.length, rows };
}

export const LIST_LANDINGS_TOOL_SCHEMA = {
  name: 'list_landing_pages',
  description:
    'Lista las landings SEO (especialidad × ciudad) con métricas reales: views, sessions, clinic_views, book_started, book_completed, conversion_rate_pct y bookings agregados por especialidad. Ordenado por views desc.',
  input_schema: {
    type: 'object',
    properties: {
      days: { type: 'integer', minimum: 1, maximum: 60, description: 'Ventana de análisis en días (default 7).' },
    },
  },
};
