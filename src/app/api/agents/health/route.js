// GET / POST /api/agents/health
//
// Returns JSON with the status of every external dependency the two agents
// rely on. Auth: `x-setup-secret: DB_SETUP_SECRET` header OR
// `?secret=DB_SETUP_SECRET` query param — same shape as /api/agents/migrate.
//
// Rate-limited by IP to keep external API costs predictable if the endpoint
// gets discovered or scripted by a curious party.

import { NextResponse } from 'next/server';
import { internalError, clientError } from '@/lib/errors';
import { runHealthCheck } from '@/lib/agents/health';
import { limits } from '@/lib/rateLimit';

export const dynamic = 'force-dynamic';
export const maxDuration = 30;

function authorised(request) {
  const expected = process.env.DB_SETUP_SECRET;
  if (!expected) return false;
  const headerSecret = request.headers.get('x-setup-secret') || '';
  if (headerSecret === expected) return true;
  const url = new URL(request.url);
  return url.searchParams.get('secret') === expected;
}

async function handle(request) {
  if (!authorised(request)) return clientError('unauthorized', 401);
  const rl = await limits.agentsHealth.check(request);
  if (!rl.ok) {
    return NextResponse.json(
      { error: 'rate_limited', retryAfterSec: rl.retryAfterSec },
      { status: 429, headers: rl.headers }
    );
  }
  try {
    const results = await runHealthCheck();
    const ok = results.every((r) => r.reachable);
    return NextResponse.json(
      { ok, results, generatedAt: new Date().toISOString() },
      { headers: rl.headers }
    );
  } catch (err) {
    return internalError(err, '[agents/health]');
  }
}

export const GET = handle;
export const POST = handle;
