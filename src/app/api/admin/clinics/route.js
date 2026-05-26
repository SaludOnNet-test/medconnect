import { NextResponse } from 'next/server';
import { query, DB_AVAILABLE } from '@/lib/db';
import { requireRole } from '@/lib/adminAuth';

// Reads admin session cookies, so it can't be statically rendered.
export const dynamic = 'force-dynamic';

/**
 * GET /api/admin/clinics
 *
 * Lists all clinics with their notification config. Used by /admin/clinics
 * to show the table where ops can configure which clinics get the
 * "new sale derived to your clinic" emails.
 *
 * Auth: admin OR ops (read-only listing is non-sensitive).
 * Query params:
 *   q          - optional filter by name (LIKE)
 *   onlyConfig - 'true' to filter to clinics with notification_email set
 *   limit      - cap (default 500, max 2000)
 */
export async function GET(request) {
  const rr = requireRole(request, ['admin', 'ops']);
  if (rr instanceof Response) return rr;

  if (!DB_AVAILABLE) {
    return NextResponse.json({ error: 'DB not configured' }, { status: 503 });
  }

  const { searchParams } = new URL(request.url);
  const q = (searchParams.get('q') || '').trim();
  const onlyConfig = searchParams.get('onlyConfig') === 'true';
  const rawLimit = Number(searchParams.get('limit'));
  const limit = Math.max(1, Math.min(Number.isFinite(rawLimit) ? rawLimit : 500, 2000));

  try {
    // The two new columns (notification_email, notifications_enabled) are
    // added by /api/db/setup. Pre-migration DBs fall back to a query that
    // omits them so the page stays usable until the migration runs.
    try {
      const params = {};
      const conds = [];
      if (q) {
        conds.push('LOWER(c.name) LIKE LOWER(@q)');
        params.q = { value: `%${q}%`, type: undefined };
      }
      if (onlyConfig) {
        conds.push('c.notification_email IS NOT NULL');
      }
      const whereSql = conds.length ? `WHERE ${conds.join(' AND ')}` : '';
      // We can't easily reuse the query() helper here because it expects
      // the type-tagged params shape — fall back to building inline since
      // these are all NVARCHAR and we ony parameterize the LIKE pattern.
      const { getPool, sql } = await import('@/lib/db');
      const pool = await getPool();
      const req = pool.request();
      if (q) req.input('q', sql.NVarChar(255), `%${q}%`);
      const result = await req.query(
        `SELECT TOP (${limit})
           c.id, c.name, c.city, c.province, c.address,
           c.notification_email, c.notifications_enabled
         FROM clinics c
         ${whereSql}
         ORDER BY
           CASE WHEN c.notification_email IS NOT NULL THEN 0 ELSE 1 END,
           c.name ASC`,
      );
      return NextResponse.json({
        clinics: result.recordset.map((row) => ({
          id: row.id,
          name: row.name,
          city: row.city,
          province: row.province,
          address: row.address,
          notificationEmail: row.notification_email || null,
          notificationsEnabled: row.notifications_enabled === false ? false : !!row.notifications_enabled,
        })),
      });
    } catch (err) {
      if (!String(err?.message || '').includes('Invalid column name')) throw err;
      // Pre-migration fallback — return rows without config columns.
      const fallback = await query(
        `SELECT TOP (${limit}) id, name, city, province, address FROM clinics ORDER BY name ASC`,
      );
      return NextResponse.json({
        clinics: fallback.recordset.map((row) => ({
          id: row.id,
          name: row.name,
          city: row.city,
          province: row.province,
          address: row.address,
          notificationEmail: null,
          notificationsEnabled: true,
        })),
        migrationPending: true,
      });
    }
  } catch (err) {
    console.error('[GET /api/admin/clinics]', err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
