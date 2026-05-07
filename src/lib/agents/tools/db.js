// `query_analytics_events_db` tool implementation.
//
// Why we don't expose raw SQL to the model:
//   The model is reliable enough that prompt-injection probably wouldn't
//   pierce a "SELECT only" check, but a single unhardened code path that
//   reaches the prod DB is a forever-liability. Templates are easier to
//   audit and impossible to break out of.
//
// The agent picks one of the named queries below by `template`, and supplies
// only data parameters (period in days, limits, optional filters). Anything
// not listed is rejected.

import { query, sql } from '@/lib/db';

const MAX_DAYS = 60;
const MAX_LIMIT = 50;

function safeDays(value, defaultDays = 7) {
  const d = Math.floor(Number(value));
  if (!Number.isFinite(d) || d < 1) return defaultDays;
  return Math.min(d, MAX_DAYS);
}
function safeLimit(value, defaultLimit = 20) {
  const n = Math.floor(Number(value));
  if (!Number.isFinite(n) || n < 1) return defaultLimit;
  return Math.min(n, MAX_LIMIT);
}

// ---------------------------------------------------------------------------
// Templates
// ---------------------------------------------------------------------------

const TEMPLATES = {
  /**
   * Total events grouped by name across the window.
   * params: { days }
   */
  events_by_name: async ({ days }) => {
    const r = await query(
      `SELECT event_name, COUNT(*) AS cnt
         FROM analytics_events
        WHERE created_at >= DATEADD(day, -@days, SYSDATETIMEOFFSET())
        GROUP BY event_name
        ORDER BY cnt DESC`,
      { days: { type: sql.Int, value: safeDays(days) } }
    );
    return r.recordset;
  },

  /**
   * Funnel conversion rates (relative %) — search → clinic → slot → booking.
   * params: { days }
   */
  funnel_conversion: async ({ days }) => {
    const r = await query(
      `SELECT event_name, COUNT(*) AS cnt
         FROM analytics_events
        WHERE created_at >= DATEADD(day, -@days, SYSDATETIMEOFFSET())
          AND event_name IN ('search_performed','clinic_viewed','slot_selected','book_started','book_completed')
        GROUP BY event_name`,
      { days: { type: sql.Int, value: safeDays(days) } }
    );
    const counts = r.recordset.reduce((acc, row) => { acc[row.event_name] = row.cnt; return acc; }, {});
    const pct = (a, b) => (a && b) ? Math.round((a / b) * 1000) / 10 : null;
    return {
      counts,
      funnel: {
        search_to_clinic_view:   pct(counts.clinic_viewed,   counts.search_performed),
        clinic_to_slot_selected: pct(counts.slot_selected,   counts.clinic_viewed),
        slot_to_book_started:    pct(counts.book_started,    counts.slot_selected),
        book_to_completed:       pct(counts.book_completed,  counts.book_started),
        overall_pct:             pct(counts.book_completed,  counts.search_performed),
      },
    };
  },

  /**
   * Top searched (specialty, city) pairs.
   * params: { days, limit }
   */
  top_searches: async ({ days, limit }) => {
    const r = await query(
      `SELECT TOP (@limit)
              JSON_VALUE(properties, '$.specialty') AS specialty,
              JSON_VALUE(properties, '$.city') AS city,
              COUNT(*) AS cnt
         FROM analytics_events
        WHERE event_name = 'search_performed'
          AND created_at >= DATEADD(day, -@days, SYSDATETIMEOFFSET())
        GROUP BY JSON_VALUE(properties, '$.specialty'), JSON_VALUE(properties, '$.city')
        ORDER BY cnt DESC`,
      {
        days:  { type: sql.Int, value: safeDays(days) },
        limit: { type: sql.Int, value: safeLimit(limit) },
      }
    );
    return r.recordset;
  },

  /**
   * Top landing-page URLs by views, with bounce-ish ratio (sessions that
   * viewed only one event vs ones that converted further).
   * params: { days, limit, urlPrefix? }
   */
  top_landing_pages: async ({ days, limit, urlPrefix }) => {
    const params = {
      days:  { type: sql.Int, value: safeDays(days) },
      limit: { type: sql.Int, value: safeLimit(limit) },
    };
    let prefixClause = '';
    if (typeof urlPrefix === 'string' && urlPrefix.length && urlPrefix.length < 200) {
      // Append a wildcard server-side rather than letting the agent inject
      // the `%`. Concatenation with the `+` operator inside SQL Server string
      // context handles the @prefix variable as the LIKE pattern's prefix.
      params.prefix = { type: sql.NVarChar(202), value: `${urlPrefix}%` };
      prefixClause = ' AND page_url LIKE @prefix';
    }
    const r = await query(
      `SELECT TOP (@limit)
              page_url,
              COUNT(*) AS views,
              COUNT(DISTINCT session_id) AS sessions
         FROM analytics_events
        WHERE event_name = 'page_view'
          AND created_at >= DATEADD(day, -@days, SYSDATETIMEOFFSET())
          ${prefixClause}
        GROUP BY page_url
        ORDER BY views DESC`,
      params
    );
    return r.recordset;
  },

  /**
   * Bookings summary across the window.
   * params: { days }
   */
  bookings_summary: async ({ days }) => {
    const r = await query(
      `SELECT
          COUNT(*)                       AS total,
          AVG(CAST(amount AS FLOAT))     AS avg_amount_eur,
          SUM(CASE WHEN amount IS NULL THEN 0 ELSE 1 END) AS with_amount
         FROM bookings
        WHERE created_at >= DATEADD(day, -@days, SYSDATETIMEOFFSET())`,
      { days: { type: sql.Int, value: safeDays(days) } }
    );
    return r.recordset[0] || {};
  },

  /**
   * Period-over-period delta in bookings — compare last `days` window vs
   * previous `days` window of the same length.
   * params: { days }
   */
  bookings_delta_vs_previous: async ({ days }) => {
    const r = await query(
      `WITH cur AS (
          SELECT COUNT(*) AS c, AVG(CAST(amount AS FLOAT)) AS avg_eur
            FROM bookings
           WHERE created_at >= DATEADD(day, -@days, SYSDATETIMEOFFSET())
        ),
        prev AS (
          SELECT COUNT(*) AS c, AVG(CAST(amount AS FLOAT)) AS avg_eur
            FROM bookings
           WHERE created_at >= DATEADD(day, -2*@days, SYSDATETIMEOFFSET())
             AND created_at <  DATEADD(day, -@days, SYSDATETIMEOFFSET())
        )
        SELECT cur.c AS current_count, prev.c AS previous_count,
               cur.avg_eur AS current_avg, prev.avg_eur AS previous_avg
          FROM cur, prev`,
      { days: { type: sql.Int, value: safeDays(days) } }
    );
    return r.recordset[0] || {};
  },

  /**
   * Referrals by state (lock-in funnel) over the window.
   * params: { days }
   */
  referrals_by_state: async ({ days }) => {
    const r = await query(
      `SELECT state, COUNT(*) AS cnt
         FROM referrals
        WHERE created_at >= DATEADD(day, -@days, SYSDATETIMEOFFSET())
        GROUP BY state`,
      { days: { type: sql.Int, value: safeDays(days) } }
    );
    return r.recordset.reduce((acc, row) => { acc[row.state] = row.cnt; return acc; }, {});
  },
};

export const TEMPLATE_NAMES = Object.keys(TEMPLATES);

/**
 * Tool entrypoint. The agent passes `{ template, params }`.
 */
export async function queryAnalyticsEventsDb({ template, params = {} } = {}) {
  if (!TEMPLATES[template]) {
    return { error: `unknown template '${template}'`, available: TEMPLATE_NAMES };
  }
  try {
    const data = await TEMPLATES[template](params || {});
    return { template, params, data };
  } catch (err) {
    return { template, params, error: err?.message || String(err) };
  }
}

// JSON-Schema for the Anthropic tool definition. Keeping it here so
// run.js + the system prompt stay in sync with the actual implementation.
export const QUERY_DB_TOOL_SCHEMA = {
  name: 'query_analytics_events_db',
  description:
    'Run a pre-defined analytics query against MedConnect Azure SQL. Templates: ' +
    TEMPLATE_NAMES.join(', ') + '. Period parameters are in DAYS (max 60). limit max 50.',
  input_schema: {
    type: 'object',
    properties: {
      template: { type: 'string', enum: TEMPLATE_NAMES },
      params: {
        type: 'object',
        properties: {
          days: { type: 'integer', minimum: 1, maximum: 60 },
          limit: { type: 'integer', minimum: 1, maximum: 50 },
          urlPrefix: { type: 'string' },
        },
      },
    },
    required: ['template'],
  },
};
