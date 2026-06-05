// Wallet-detection check — reports the % of /book payment-step visits
// where Apple Pay / Google Pay (or any Stripe-supported wallet) is
// usable on the patient's device. Fed by the `wallet_check` event
// fired in PaymentForm.js (commit a922107, 2026-06-05).
//
// Usage:
//   node scripts/wallet-check-report.mjs [hoursBack]   # default 168 (7 days)
//
// Output:
//   - Total wallet_check events in window
//   - available=true / available=false counts + percentage
//   - Breakdown by wallet kind (apple / google / link / other / none)
//   - Conclusion based on threshold:
//        ≥25% available → A1 (PaymentRequestButton) is worth it
//        10-25%         → marginal, monitor 2 more weeks
//         <10%          → drop A1, focus on card UX

import fs from 'node:fs';
import path from 'node:path';
import mssql from 'mssql';

const hoursBack = Number(process.argv[2]) || 168;

// .env.local loader — mirrors scripts/monitor-funnel.mjs
const envPath = path.resolve('.env.local');
const env = Object.fromEntries(
  fs.readFileSync(envPath, 'utf8').split('\n')
    .filter((l) => l && !l.trim().startsWith('#') && l.includes('='))
    .map((l) => {
      const i = l.indexOf('=');
      return [l.slice(0, i).trim(), l.slice(i + 1).trim().replace(/^"|"$/g, '')];
    })
);

const pool = await mssql.connect({
  server: env.AZURE_SQL_SERVER,
  database: env.AZURE_SQL_DATABASE,
  user: env.AZURE_SQL_USER,
  password: env.AZURE_SQL_PASSWORD?.replace(/\\\$/g, '$'),
  options: { encrypt: true, trustServerCertificate: false },
  connectionTimeout: 30_000,
});

const since = new Date(Date.now() - hoursBack * 3600_000).toISOString();

// Pull every wallet_check event in the window and parse `properties` JSON.
const result = await pool.request().query(`
  SELECT properties
  FROM analytics_events
  WHERE event_name = 'wallet_check'
    AND created_at >= '${since}'
`);

let total = 0;
let available = 0;
const byKind = { apple: 0, google: 0, link: 0, other: 0, none: 0 };

for (const row of result.recordset) {
  total++;
  try {
    const props = JSON.parse(row.properties || '{}');
    if (props.available) {
      available++;
      const k = props.kind || 'other';
      if (k in byKind) byKind[k]++;
      else byKind.other++;
    } else {
      byKind.none++;
    }
  } catch {
    /* malformed row — skip */
  }
}

const pct = total > 0 ? Math.round((available / total) * 1000) / 10 : 0;

console.log(`\n=== Wallet detection report — last ${hoursBack} h ===\n`);
console.log(`Total wallet_check events:  ${total}`);
console.log(`Wallet available:           ${available}  (${pct}%)`);
console.log(`Wallet NOT available:       ${total - available}`);
console.log();
console.log('Breakdown by kind:');
console.log(`  Apple Pay:    ${byKind.apple}`);
console.log(`  Google Pay:   ${byKind.google}`);
console.log(`  Stripe Link:  ${byKind.link}`);
console.log(`  Other:        ${byKind.other}`);
console.log(`  None:         ${byKind.none}`);
console.log();

if (total < 20) {
  console.log(`⏳ Sample too small (need ≥20). Wait for more traffic and re-run.`);
} else if (pct >= 25) {
  console.log(`✅ Conclusion: A1 IS worth keeping. ${pct}% of patients can use the wallet button — that is a real conversion lever on mobile.`);
} else if (pct >= 10) {
  console.log(`🟡 Conclusion: marginal at ${pct}%. Keep A1 live, re-run in 2 weeks. If still <25%, focus engineering on card-step UX (Apple Pay alternative).`);
} else {
  console.log(`❌ Conclusion: only ${pct}% of patients have a usable wallet. A1 carries little weight with current traffic. Drop the PaymentRequestButton block or pause it; redirect effort to card-step copy + Stripe Link.`);
}

console.log();
await pool.close();
