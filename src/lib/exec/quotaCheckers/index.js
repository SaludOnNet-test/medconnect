import { checkAzureSql } from './azureSql';
import { checkResend } from './resend';
import { checkUpstash } from './upstash';
import { checkSentry } from './sentry';
import { checkClerk } from './clerk';

// One entry per provider we monitor. Each function returns:
//   { provider, ok, used?, limit?, percentage?, status?, note?, error? }
//
// Independent failures don't cascade — we Promise.all but unwrap any throw
// into an { ok: false, error } object so the endpoint still returns the
// good rows.
const CHECKERS = [
  checkAzureSql,
  checkResend,
  checkUpstash,
  checkSentry,
  checkClerk,
];

export async function runAllCheckers() {
  const results = await Promise.all(
    CHECKERS.map(async (fn) => {
      try {
        return await fn();
      } catch (err) {
        return { provider: fn.name.replace(/^check/, '').toLowerCase(), ok: false, error: err.message };
      }
    }),
  );

  // Compute the worst-percentage provider for the daily email summary line.
  let worst = null;
  for (const r of results) {
    if (r.ok && typeof r.percentage === 'number') {
      if (!worst || r.percentage > worst.percentage) worst = r;
    }
  }

  return { providers: results, worst };
}
