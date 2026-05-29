// Persistent funnel/UX monitor — Med Connect.
//
// Combines 3 signals into a single dashboard:
//   1. analytics_events funnel (search → clinic → slot → book_started → completed)
//   2. bookings table (real DB rows, ground truth for conversions)
//   3. Sentry recent issues (client + server errors that could be silently
//      blocking the flow — e.g., the kind of bug a Clarity dead-click would
//      surface but where we already have a stack trace)
//
// Usage:
//   node scripts/monitor-funnel.mjs [hoursBack]    # default 4
//
// Reads creds from .env.local (server, DB, Sentry).
// Does NOT log secrets — only the configured names are printed once at top.

import fs from 'node:fs';
import path from 'node:path';
import mssql from 'mssql';

const hoursBack = Number(process.argv[2]) || 4;

// ── env.local loader (no dotenv dep) ─────────────────────────────────────
const envPath = path.resolve('.env.local');
const env = Object.fromEntries(
  fs.readFileSync(envPath, 'utf8').split('\n')
    .filter((l) => l && !l.trim().startsWith('#') && l.includes('='))
    .map((l) => {
      const i = l.indexOf('=');
      return [l.slice(0, i).trim(), l.slice(i + 1).trim().replace(/^"|"$/g, '')];
    })
);

// ── DB connection ────────────────────────────────────────────────────────
const pool = await mssql.connect({
  server: env.AZURE_SQL_SERVER,
  database: env.AZURE_SQL_DATABASE,
  user: env.AZURE_SQL_USER,
  // Restore the literal `$` if .env.local had it escaped as `\$` for shell safety.
  password: env.AZURE_SQL_PASSWORD?.replace(/\\\$/g, '$'),
  options: { encrypt: true, trustServerCertificate: false },
  connectionTimeout: 30_000,
});

const now = new Date();
console.log(`╔════════════════════════════════════════════════════════════════╗`);
console.log(`║  Med Connect — funnel monitor                                  ║`);
console.log(`║  window: last ${hoursBack}h · run at ${now.toISOString()}    ║`);
console.log(`╚════════════════════════════════════════════════════════════════╝`);

// ── 1. Funnel events ─────────────────────────────────────────────────────
const events = await pool.request().query(`
  SELECT event_name, COUNT(*) AS cnt
  FROM analytics_events
  WHERE created_at >= DATEADD(hour, -${hoursBack}, SYSDATETIMEOFFSET())
  GROUP BY event_name
  ORDER BY cnt DESC
`);
const sessions = await pool.request().query(`
  SELECT
    COUNT(DISTINCT session_id) AS unique_sessions,
    COUNT(*) AS total_events
  FROM analytics_events
  WHERE created_at >= DATEADD(hour, -${hoursBack}, SYSDATETIMEOFFSET())
`);
const ev = events.recordset.reduce((a, r) => { a[r.event_name] = r.cnt; return a; }, {});
const ss = sessions.recordset[0] || { unique_sessions: 0, total_events: 0 };
const pct = (a, b) => (a && b) ? `${Math.round((a / b) * 100)}%` : 'N/A';

console.log('');
console.log('▼ ANALYTICS (internal DB — gated by cookie consent)');
console.log(`  Sessions: ${ss.unique_sessions}   Total events: ${ss.total_events}`);
console.log(`  search_performed   ${ev.search_performed || 0}`);
console.log(`  clinic_viewed      ${ev.clinic_viewed || 0}   (${pct(ev.clinic_viewed, ev.search_performed)} of search)`);
console.log(`  slot_selected      ${ev.slot_selected || 0}   (${pct(ev.slot_selected, ev.clinic_viewed)} of clinic_viewed)`);
console.log(`  book_started       ${ev.book_started || 0}   (${pct(ev.book_started, ev.slot_selected)} of slot_selected) ${(ev.book_started || 0) > 0 ? '✓ healthy' : '⚠ no progress past slot'}`);
console.log(`  book_completed     ${ev.book_completed || 0}   (${pct(ev.book_completed, ev.book_started)} of book_started)`);

// ── 2. Bookings table (ground truth) ─────────────────────────────────────
const bookings = await pool.request().query(`
  SELECT TOP 5
    id, patient_email, amount, created_at, provider_name
  FROM bookings
  WHERE created_at >= DATEADD(hour, -${hoursBack}, SYSDATETIMEOFFSET())
  ORDER BY created_at DESC
`);
const bookingsCount = await pool.request().query(`
  SELECT
    COUNT(*) AS total,
    COALESCE(SUM(CAST(amount AS FLOAT)), 0) AS revenue,
    COALESCE(AVG(CAST(amount AS FLOAT)), 0) AS avg_amount
  FROM bookings
  WHERE created_at >= DATEADD(hour, -${hoursBack}, SYSDATETIMEOFFSET())
`);
const bc = bookingsCount.recordset[0] || {};
console.log('');
console.log('▼ BOOKINGS (DB ground truth)');
console.log(`  Total: ${bc.total || 0}   Revenue: €${Number(bc.revenue || 0).toFixed(2)}   Avg: €${Number(bc.avg_amount || 0).toFixed(2)}`);
if (bookings.recordset.length > 0) {
  console.log('  Latest:');
  for (const b of bookings.recordset) {
    const t = new Date(b.created_at).toISOString().slice(11, 19);
    console.log(`    ${t}  ${(b.id || '').slice(0, 12).padEnd(13)} €${Number(b.amount || 0).toFixed(2).padStart(6)}  ${(b.provider_name || '').slice(0, 38)}`);
  }
}

// ── 3. Top pages (where ad traffic is landing) ───────────────────────────
const pages = await pool.request().query(`
  SELECT TOP 5
    CASE
      WHEN CHARINDEX('?', page_url) > 0 THEN LEFT(page_url, CHARINDEX('?', page_url) - 1)
      ELSE page_url
    END AS path,
    COUNT(*) AS cnt
  FROM analytics_events
  WHERE created_at >= DATEADD(hour, -${hoursBack}, SYSDATETIMEOFFSET())
  GROUP BY CASE WHEN CHARINDEX('?', page_url) > 0 THEN LEFT(page_url, CHARINDEX('?', page_url) - 1) ELSE page_url END
  ORDER BY cnt DESC
`);
console.log('');
console.log('▼ TOP PAGES');
for (const r of pages.recordset) {
  console.log(`  ${String(r.cnt).padStart(4)}  ${r.path || '(unknown)'}`);
}

// ── 4. Sentry — recent issues (errors that could be silently blocking) ───
console.log('');
console.log('▼ SENTRY (recent issues)');
if (!env.SENTRY_API_TOKEN || !env.SENTRY_ORG_SLUG) {
  console.log('  (SENTRY_API_TOKEN or SENTRY_ORG_SLUG missing in .env.local — skipping)');
} else {
  try {
    const sinceIso = new Date(now.getTime() - hoursBack * 3600_000).toISOString();
    const url = `https://sentry.io/api/0/organizations/${env.SENTRY_ORG_SLUG}/issues/?statsPeriod=${hoursBack}h&query=is:unresolved&limit=8&sort=freq`;
    const r = await fetch(url, {
      headers: { Authorization: `Bearer ${env.SENTRY_API_TOKEN}` },
    });
    if (!r.ok) {
      console.log(`  Sentry API ${r.status}: ${(await r.text()).slice(0, 200)}`);
    } else {
      const issues = await r.json();
      if (issues.length === 0) {
        console.log('  No unresolved issues in window. ✓');
      } else {
        for (const i of issues) {
          const count24 = i.count || '?';
          const last = i.lastSeen ? new Date(i.lastSeen).toISOString().slice(11, 19) : '?';
          const title = (i.title || i.metadata?.value || '').slice(0, 80);
          console.log(`  [${count24.toString().padStart(3)}] ${last} ${title}`);
        }
        console.log(`  (since ${sinceIso})`);
      }
    }
  } catch (e) {
    console.log(`  Sentry fetch failed: ${e.message}`);
  }
}

await pool.close();
console.log('');
