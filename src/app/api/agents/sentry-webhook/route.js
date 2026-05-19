// POST /api/agents/sentry-webhook
//
// Receives Sentry "Issue Alerts" or "Issue Webhook" events. Sentry signs
// webhooks with HMAC-SHA256 over the raw body using the configured client
// secret. We verify, filter (level + times_seen), de-dupe per issue id with
// a Redis lock, and dispatch the security agent via `after()` so the 200 OK
// returns to Sentry quickly.
//
// Payload shape (Sentry "issue alert"):
//   {
//     "action": "triggered" | "resolved" | "unresolved",
//     "data": { "issue": { "id", "shortId", "title", "level", "count", ... } },
//     ...
//   }

import { NextResponse, after } from 'next/server';
import { internalError, clientError } from '@/lib/errors';
import { verifySentryWebhook } from '@/lib/agents/tools/sentry';
import { runSecurityAgent } from '@/lib/agents/security/run';
import { acquireLock, getConfig } from '@/lib/agents/state';
import { shouldProcessSentryEvent } from '@/lib/agents/guardrails';

export const dynamic = 'force-dynamic';
// The security agent run can chain 8-10 Anthropic calls plus tool fetches;
// 60 s was getting tight in real investigations and the function would be
// killed silently mid-loop. 90 s is the Vercel Pro hard ceiling for regular
// functions and gives a generous margin.
export const maxDuration = 90;

export async function POST(request) {
  // 1. Read raw body for signature verification.
  let raw;
  try {
    raw = await request.text();
  } catch {
    return clientError('invalid body', 400);
  }
  const signature = request.headers.get('sentry-hook-signature') || '';
  if (!verifySentryWebhook({ rawBody: raw, signature })) {
    return clientError('invalid signature', 401);
  }

  let payload;
  try {
    payload = JSON.parse(raw);
  } catch {
    return clientError('invalid json', 400);
  }

  // 2. Only react to "triggered" / "created" / "regression" actions.
  const action = String(payload?.action || '').toLowerCase();
  if (!['triggered', 'created', 'regression', 'unresolved'].includes(action)) {
    return NextResponse.json({ ok: true, ignored: action });
  }

  const issue = payload?.data?.issue || payload?.event?.issue;
  const issueId = String(issue?.id || issue?.shortId || '').trim();
  if (!issueId) {
    return NextResponse.json({ ok: true, ignored: 'no issue id' });
  }
  const level = String(issue?.level || 'error');
  const timesSeen = Number(issue?.count || issue?.timesSeen || 0);

  // 3. Pre-filter against the live config (saves Anthropic tokens).
  let config = {};
  try {
    config = await getConfig('security');
  } catch {/* ignore */}
  const verdict = shouldProcessSentryEvent({ level, timesSeen, config });
  if (!verdict.ok) {
    return NextResponse.json({ ok: true, filtered: verdict.reason, issueId });
  }

  // 4. Anti-dupe lock keyed by issueId (TTL 30 min). Sentry retries on 5xx.
  const lockOk = await acquireLock(`sec:lock:issue:${issueId}`, 1800);
  if (!lockOk) {
    return NextResponse.json({ ok: true, deduped: true, issueId });
  }

  // 5. Defer the run so we ack fast.
  after(async () => {
    try {
      await runSecurityAgent({ trigger: 'sentry_webhook', issueId });
    } catch (err) {
      console.error('[sentry-webhook] runSecurityAgent threw', err);
    }
  });

  return NextResponse.json({ ok: true, dispatched: true, issueId });
}
