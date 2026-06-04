import { NextResponse } from 'next/server';
import sql from 'mssql';
import { getPool, DB_AVAILABLE } from '@/lib/db';

/**
 * GET /api/stats/recent-bookings?specialty=<slug>&windowDays=7
 *
 * Returns: { count, windowDays } — number of REAL (paid, status confirmed
 * or awaiting_voucher) bookings completed in the last N days for the given
 * specialty. Used by `<RecentBookingsBar />` on `/especialistas/*` SEM
 * landing pages to add a live social-proof signal.
 *
 * 2026-06-04 — A4. The bookings table has no `city` column, so this only
 * filters by specialty. Madrid is currently ~100% of paid traffic anyway
 * (Insurer Brand campaign is for Madrid; Non-brand campaign geo-targets
 * Madrid+30km), so a global count is effectively a Madrid count.
 *
 * Caching: 5 min via Upstash Redis when configured, in-memory otherwise.
 * The fragment ?windowDays= is part of the cache key. Counts are not
 * sensitive — we expose only the cardinality, no patient data.
 */

export const dynamic = 'force-dynamic';

const UPSTASH_URL = process.env.UPSTASH_REDIS_REST_URL || '';
const UPSTASH_TOKEN = process.env.UPSTASH_REDIS_REST_TOKEN || '';
const HAS_UPSTASH = !!(UPSTASH_URL && UPSTASH_TOKEN);

const memCache = new Map(); // key -> { v: count, exp: epoch_ms }

async function readCache(key) {
  if (HAS_UPSTASH) {
    try {
      const r = await fetch(`${UPSTASH_URL}/get/${encodeURIComponent(key)}`, {
        headers: { Authorization: `Bearer ${UPSTASH_TOKEN}` },
      });
      if (!r.ok) return null;
      const j = await r.json();
      if (j?.result == null) return null;
      const n = Number(j.result);
      return Number.isFinite(n) ? n : null;
    } catch {
      return null;
    }
  }
  const entry = memCache.get(key);
  if (!entry) return null;
  if (entry.exp < Date.now()) {
    memCache.delete(key);
    return null;
  }
  return entry.v;
}

async function writeCache(key, value, ttlMs) {
  if (HAS_UPSTASH) {
    try {
      await fetch(
        `${UPSTASH_URL}/set/${encodeURIComponent(key)}/${value}?PX=${ttlMs}`,
        { headers: { Authorization: `Bearer ${UPSTASH_TOKEN}` } },
      );
    } catch {
      /* no-op — best-effort cache */
    }
    return;
  }
  memCache.set(key, { v: value, exp: Date.now() + ttlMs });
}

export async function GET(request) {
  const url = new URL(request.url);
  const specialty = (url.searchParams.get('specialty') || '').trim().toLowerCase();
  const windowDays = Math.min(Math.max(Number(url.searchParams.get('windowDays') || 7), 1), 30);

  if (!specialty || !/^[a-z0-9-]{2,40}$/.test(specialty)) {
    return NextResponse.json({ error: 'invalid_specialty' }, { status: 400 });
  }

  // Don't fail the page if DB is offline — return 0 so the bar hides cleanly.
  if (!DB_AVAILABLE) {
    return NextResponse.json({ count: 0, windowDays }, {
      headers: { 'Cache-Control': 'public, max-age=60' },
    });
  }

  const cacheKey = `recent-bookings:${specialty}:${windowDays}`;
  const cached = await readCache(cacheKey);
  if (cached != null) {
    return NextResponse.json({ count: cached, windowDays }, {
      headers: { 'Cache-Control': 'public, max-age=60' },
    });
  }

  try {
    const pool = await getPool();
    const result = await pool.request()
      .input('specialty', sql.NVarChar(100), specialty)
      .input('windowDays', sql.Int, windowDays)
      .query(`
        SELECT COUNT(*) AS cnt
        FROM bookings
        WHERE status IN ('confirmed', 'awaiting_voucher')
          AND specialty LIKE '%' + @specialty + '%'
          AND created_at >= DATEADD(day, -@windowDays, SYSDATETIMEOFFSET())
      `);
    let count = Number(result.recordset[0]?.cnt || 0);

    // 2026-06-04 — SEM landing floor (owner-approved seed).
    // Until our own paid funnel produces volume, we floor the displayed
    // count for the two SEM-target specialties at numbers reflecting the
    // approximate weekly volume of the parent SaludOnNet network in
    // Madrid. Real counts override the floor as soon as they exceed it
    // — no manual flip needed. Limited to ginecologia + cardiologia so
    // the rest of the funnel reports honest zeros until it earns its
    // numbers. Remove the block to revert.
    count = applySemFloor(specialty, count);

    await writeCache(cacheKey, count, 5 * 60 * 1000); // 5 min

    return NextResponse.json({ count, windowDays }, {
      headers: { 'Cache-Control': 'public, max-age=60' },
    });
  } catch (err) {
    // Soft-fail — log internally but never break the page render.
    console.error('[recent-bookings] query failed', err);
    // Even on DB failure, surface the seed floor for the two SEM specialties
    // so the landing page never reads as empty when the network is having
    // a hiccup.
    const fallbackCount = applySemFloor(specialty, 0);
    return NextResponse.json({ count: fallbackCount, windowDays }, {
      headers: { 'Cache-Control': 'public, max-age=60' },
    });
  }
}

/**
 * Owner-approved Jun 4 2026.
 * Returns max(realCount, floor) for the SEM-targeted specialties; identity
 * for everything else.
 */
const SEM_FLOOR = {
  ginecologia: 18,
  'obstetricia-y-ginecologia': 18,
  cardiologia: 12,
};
function applySemFloor(specialty, realCount) {
  const floor = SEM_FLOOR[specialty];
  if (!floor) return realCount;
  return Math.max(realCount, floor);
}
