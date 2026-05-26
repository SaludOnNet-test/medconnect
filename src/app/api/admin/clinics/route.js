import { NextResponse } from 'next/server';
import { getPool, sql, query, DB_AVAILABLE } from '@/lib/db';
import { requireRole } from '@/lib/adminAuth';

// Reads admin session cookies, so it can't be statically rendered.
export const dynamic = 'force-dynamic';

// Azure SQL collation that is BOTH case-insensitive AND accent-insensitive.
// Applied to both the column and the parameter so the comparison ignores
// tildes/diéresis (otherwise `bermudez` would never match `Bermúdez`).
// CI = case-insensitive, AI = accent-insensitive.
const CI_AI = 'Latin1_General_CI_AI';

/**
 * GET /api/admin/clinics
 *
 * Lists clinics with their notification config — and a search that's
 * actually usable on the 3,135-row Spanish dataset.
 *
 * Search semantics (`q` param):
 *   - The query is split on whitespace into tokens.
 *   - Each token must appear somewhere across name + city + province +
 *     address (token-level AND, field-level OR).
 *   - Comparison uses `COLLATE Latin1_General_CI_AI` so `bermudez`
 *     matches `Bermúdez` and `medico` matches `Médico`.
 *
 * That means `cea berm`, `centro medico cea`, `Cea Bermúdez`, and
 * `bermudez cea` all return the same row for "Centro Médico Cea Bermúdez".
 *
 * Auth: admin OR ops (read-only listing).
 * Query params:
 *   q          - free-text search (tokenized, accent-insensitive)
 *   onlyConfig - 'true' to filter to clinics with notification_email set
 *   limit      - cap (default 1000, max 5000)
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
  const limit = Math.max(1, Math.min(Number.isFinite(rawLimit) ? rawLimit : 1000, 5000));

  // Tokenize on whitespace, drop empties, cap at 8 tokens to keep SQL bounded.
  const tokens = q ? q.split(/\s+/).filter(Boolean).slice(0, 8) : [];

  try {
    // Build dynamic WHERE. Each token gets its own parameter; for each
    // token we OR-match against name/city/province/address with the
    // accent-insensitive collation. Tokens are AND-ed together.
    const pool = await getPool();
    const req = pool.request();
    const wheres = [];

    tokens.forEach((tok, i) => {
      const pname = `q${i}`;
      req.input(pname, sql.NVarChar(255), `%${tok}%`);
      wheres.push(
        `(c.name     COLLATE ${CI_AI} LIKE @${pname} COLLATE ${CI_AI} ` +
        ` OR c.city     COLLATE ${CI_AI} LIKE @${pname} COLLATE ${CI_AI} ` +
        ` OR c.province COLLATE ${CI_AI} LIKE @${pname} COLLATE ${CI_AI} ` +
        ` OR c.address  COLLATE ${CI_AI} LIKE @${pname} COLLATE ${CI_AI})`,
      );
    });

    if (onlyConfig) wheres.push('c.notification_email IS NOT NULL');

    const whereSql = wheres.length ? `WHERE ${wheres.join(' AND ')}` : '';

    try {
      // Single round-trip: page + total via COUNT(*) OVER().
      const result = await req.query(
        `SELECT TOP (${limit})
           c.id, c.name, c.city, c.province, c.address,
           c.notification_email, c.notifications_enabled,
           COUNT(*) OVER() AS total_count
         FROM clinics c
         ${whereSql}
         ORDER BY
           CASE WHEN c.notification_email IS NOT NULL THEN 0 ELSE 1 END,
           c.name ASC`,
      );

      const total = result.recordset[0]?.total_count || 0;
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
        total,
        limit,
      });
    } catch (err) {
      if (!String(err?.message || '').includes('Invalid column name')) throw err;
      // Pre-migration fallback — same search semantics, no config columns.
      const fallback = await query(
        `SELECT TOP (${limit})
           c.id, c.name, c.city, c.province, c.address,
           COUNT(*) OVER() AS total_count
         FROM clinics c
         ${whereSql}
         ORDER BY c.name ASC`,
        // Re-pass tokens via the typed query() helper. Same param names.
        Object.fromEntries(tokens.map((tok, i) => [
          `q${i}`, { type: sql.NVarChar(255), value: `%${tok}%` },
        ])),
      );
      const total = fallback.recordset[0]?.total_count || 0;
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
        total,
        limit,
        migrationPending: true,
      });
    }
  } catch (err) {
    console.error('[GET /api/admin/clinics]', err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
