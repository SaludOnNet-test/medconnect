// POST /api/agents/security/run  — manual trigger for the security agent.
//
// Body / query: { issueId? }. If issueId is set, runs in 'manual' trigger
// mode focused on that issue. Without issueId it does a generic sweep
// (lists recent issues, no auto-actions).
//
// Auth: same `CRON_SECRET` shape used by the marketing endpoint.

import { NextResponse } from 'next/server';
import { internalError, clientError } from '@/lib/errors';
import { runSecurityAgent } from '@/lib/agents/security/run';

export const dynamic = 'force-dynamic';
// See sentry-webhook: 90 s gives the multi-turn investigation enough room.
export const maxDuration = 90;

function authorised(request) {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  const url = new URL(request.url);
  const fromQuery = url.searchParams.get('secret');
  if (fromQuery && fromQuery === secret) return true;
  const auth = request.headers.get('authorization') || '';
  return auth === `Bearer ${secret}`;
}

async function handle(request) {
  if (!authorised(request)) return clientError('unauthorized', 401);
  try {
    const url = new URL(request.url);
    const issueId = url.searchParams.get('issueId') || undefined;
    const result = await runSecurityAgent({ trigger: 'manual', issueId });
    return NextResponse.json(result, { status: result.ok ? 200 : 500 });
  } catch (err) {
    return internalError(err, '[security/run]');
  }
}

export const GET  = handle;
export const POST = handle;
