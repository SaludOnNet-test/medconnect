// POST /api/agents/marketing/run  — runs the marketing agent.
// GET  /api/agents/marketing/run  — same, used by Vercel Cron (which only
// fires GETs).
//
// Auth: Vercel cron sends `Authorization: Bearer ${CRON_SECRET}`. We also
// accept `?secret=<CRON_SECRET>` for manual curl invocation. The Telegram
// webhook handler dispatches in-process via `runMarketingAgent` directly,
// so it doesn't traverse this endpoint.

import { NextResponse } from 'next/server';
import { internalError, clientError } from '@/lib/errors';
import { runMarketingAgent } from '@/lib/agents/marketing/run';

export const dynamic = 'force-dynamic';
// Bumping max duration so the multi-tool loop has room. Vercel Pro cap is 60s
// for non-streaming functions; if a single run trends past 50s on real data
// we'll need to split into a queue worker.
export const maxDuration = 60;

function authorised(request) {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  const url = new URL(request.url);
  const fromQuery = url.searchParams.get('secret');
  if (fromQuery && fromQuery === secret) return true;
  const auth = request.headers.get('authorization') || '';
  if (auth === `Bearer ${secret}`) return true;
  return false;
}

function parseOptions(request, defaults) {
  const url = new URL(request.url);
  const periodDays = Math.max(1, Math.min(60, Number(url.searchParams.get('period') || defaults.periodDays || 7)));
  const trigger = ['cron', 'manual'].includes(url.searchParams.get('trigger'))
    ? url.searchParams.get('trigger')
    : defaults.trigger;
  const silent = url.searchParams.get('silent') === '1';
  return { periodDays, trigger, silent };
}

async function handle(request, defaults) {
  if (!authorised(request)) return clientError('unauthorized', 401);
  try {
    const opts = parseOptions(request, defaults);
    const result = await runMarketingAgent(opts);
    return NextResponse.json(result, { status: result.ok ? 200 : 500 });
  } catch (err) {
    return internalError(err, '[marketing/run]');
  }
}

export async function GET(request) {
  return handle(request, { trigger: 'cron', periodDays: 7 });
}

export async function POST(request) {
  return handle(request, { trigger: 'manual', periodDays: 7 });
}
