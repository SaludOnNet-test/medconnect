// POST /api/_visit
//
// 2026-06-22 — Anon visit counter (server-side, no consent gate).
//
// Goal: close the 8× gap we saw between Clarity (244 sessions 15-22 jun)
// and analytics_events (31 sessions). page_viewed in analytics.js is
// consent-gated for RGPD compliance — every bounce that rejects cookies
// is invisible to us. This endpoint records ONLY aggregate counts per
// (path, date). No IP, no UA, no session id, no fingerprint. Outside
// the consent boundary because the data is statistical, not personal.
//
// Caller: <AnonVisitTracker> in src/app/layout.js — fires once per
// route change, unconditional on consent state.
//
// Path filter: rejects /admin, /internal, /api so internal staff +
// API noise stays out of the funnel numbers. Also rejects paths
// > 255 chars or with control chars.

import { NextResponse } from 'next/server';
import { getPool, sql, DB_AVAILABLE } from '@/lib/db';

export const dynamic = 'force-dynamic';

const PATH_MAX_LEN = 255;
const BLOCKED_PREFIXES = ['/admin', '/internal', '/api', '/_next'];

function normalizePath(raw) {
  if (typeof raw !== 'string') return null;
  // Strip querystring + hash + control chars.
  const noQuery = raw.split('?')[0].split('#')[0];
  if (!noQuery.startsWith('/')) return null;
  if (noQuery.length > PATH_MAX_LEN) return null;
  if (!/^[\x20-\x7E -￿]+$/.test(noQuery)) return null;
  if (BLOCKED_PREFIXES.some((p) => noQuery.startsWith(p))) return null;
  return noQuery;
}

export async function POST(request) {
  if (!DB_AVAILABLE) {
    return NextResponse.json({ ok: true, db: 'unavailable' });
  }

  let body;
  try { body = await request.json(); }
  catch { return NextResponse.json({ ok: false, error: 'bad_json' }, { status: 400 }); }

  const path = normalizePath(body?.path);
  if (!path) {
    // Return 200 (not 4xx) — this endpoint is fire-and-forget from the
    // client. Errors here shouldn't trigger Sentry noise or browser
    // retries. We just don't count this one.
    return NextResponse.json({ ok: true, skipped: true });
  }

  try {
    const pool = await getPool();
    // MERGE for the UPSERT. SYSDATETIMEOFFSET() in UTC; we cast to DATE
    // at the SQL Server level so day boundaries are consistent regardless
    // of caller timezone. The PRIMARY KEY (path, visit_date) protects
    // against the (rare) concurrent insert race.
    await pool.request()
      .input('path', sql.NVarChar(PATH_MAX_LEN), path)
      .query(`
        MERGE daily_page_visits AS target
        USING (VALUES (@path, CAST(SYSDATETIMEOFFSET() AT TIME ZONE 'UTC' AS DATE))) AS src(p, d)
        ON target.path = src.p AND target.visit_date = src.d
        WHEN MATCHED THEN
          UPDATE SET count = count + 1, updated_at = SYSDATETIMEOFFSET()
        WHEN NOT MATCHED THEN
          INSERT (path, visit_date, count, updated_at)
          VALUES (src.p, src.d, 1, SYSDATETIMEOFFSET());
      `);
    return NextResponse.json({ ok: true });
  } catch (err) {
    // Soft fail — never break the page for an analytics call.
    console.error('[_visit] insert failed', err?.message);
    return NextResponse.json({ ok: false, error: 'db_error' }, { status: 200 });
  }
}
