// POST /api/agents/vercel-webhook
//
// Vercel posts deployment events here. We open a "post-deploy guard" key in
// Redis with TTL = `post_deploy_guard_minutes` (default 10) so that other
// parts of the system (e.g. `shouldAutoRollback`) know we're inside the
// vigilance window.
//
// Vercel signs the body with HMAC-SHA1 (legacy) or SHA-256 using the
// configured webhook secret. Header: `x-vercel-signature`.
//
// The webhook itself does NOT invoke the agent. The agent fires when
// Sentry reports a new issue *during* the guard window — that's where the
// auto-rollback decision actually lives.

import { NextResponse } from 'next/server';
import { internalError, clientError } from '@/lib/errors';
import { verifyVercelWebhook } from '@/lib/agents/tools/vercel';
import { acquireLock, getConfig } from '@/lib/agents/state';

export const dynamic = 'force-dynamic';

export async function POST(request) {
  let raw;
  try {
    raw = await request.text();
  } catch {
    return clientError('invalid body', 400);
  }
  const signature = request.headers.get('x-vercel-signature') || '';
  if (!verifyVercelWebhook({ rawBody: raw, signature })) {
    return clientError('invalid signature', 401);
  }

  let payload;
  try {
    payload = JSON.parse(raw);
  } catch {
    return clientError('invalid json', 400);
  }

  const eventType = String(payload?.type || '').toLowerCase();
  // We only care about successful production deployments. Vercel emits
  // `deployment.created`, `deployment.succeeded`, `deployment.ready`, ...
  if (!/deployment\.(succeeded|ready|promoted)/.test(eventType)) {
    return NextResponse.json({ ok: true, ignored: eventType });
  }

  const target = payload?.payload?.target || payload?.payload?.deployment?.target;
  if (target && target !== 'production') {
    return NextResponse.json({ ok: true, ignored: `target=${target}` });
  }

  const deploymentId = payload?.payload?.deployment?.id || payload?.payload?.deploymentId || payload?.payload?.id;
  if (!deploymentId) {
    return NextResponse.json({ ok: true, ignored: 'no deployment id' });
  }

  let guardMinutes = 10;
  try {
    const config = await getConfig('security');
    if (config.post_deploy_guard_minutes) {
      guardMinutes = Math.max(1, Math.min(60, Number(config.post_deploy_guard_minutes)));
    }
  } catch {/* default */}

  // Open guard window. Anyone reading `sec:guard:{id}` knows we're inside.
  await acquireLock(`sec:guard:${deploymentId}`, guardMinutes * 60);

  return NextResponse.json({
    ok: true,
    guardOpen: true,
    deploymentId,
    guardMinutes,
  });
}
