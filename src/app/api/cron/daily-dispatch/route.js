// GET /api/cron/daily-dispatch
//
// Single Vercel-cron entry-point that fans out to every once-a-day
// maintenance job in the project. Built because the Hobby plan caps
// the deployment at 2 cron schedules total, and each schedule must
// run ≤ 1× per day — so we cannot keep one cron per job. The
// dispatcher kicks every downstream job off in parallel; each runs
// in its own serverless function so the dispatcher's 10-second
// budget is only spent on the round-trip, not on the work itself.
//
// Auth is the same `CRON_SECRET` pattern every other cron route in
// this repo uses. The dispatcher forwards the secret as a `Bearer`
// header so each downstream route's existing auth passes.
//
// Adding a new daily job: append its path to `JOBS` below. No
// vercel.json change needed.

import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

const HOST =
  process.env.NEXT_PUBLIC_BASE_URL
  || (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : 'http://localhost:3000');

// Order is informational only — calls fan out in parallel. Keep the
// list small (≤ 8) so we stay comfortably inside the dispatcher's
// 10 s budget even if every downstream job takes its full 6 s.
const JOBS = [
  '/api/exec/daily-email',
  '/api/referrals/remind',
  '/api/reviews/request-batch',
  '/api/slot-holds/recover-abandoned',
];

// Per-downstream-call timeout. The downstream function keeps running
// on its own beyond this — we just stop waiting for its response so
// the dispatcher can return inside Vercel's 10 s window.
const FETCH_TIMEOUT_MS = 6000;

async function callJob(path, cronSecret) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  const t0 = Date.now();
  try {
    const r = await fetch(`${HOST}${path}`, {
      method: 'GET',
      headers: { authorization: `Bearer ${cronSecret}` },
      signal: controller.signal,
    });
    return { path, ok: r.ok, status: r.status, ms: Date.now() - t0 };
  } catch (err) {
    return {
      path,
      ok: false,
      // AbortError just means we stopped waiting — the downstream
      // function is still running. Surface it distinctly so an alert
      // doesn't mistake it for a real failure.
      error: err?.name === 'AbortError' ? 'timeout_waiting_for_response' : (err?.message || 'unknown'),
      ms: Date.now() - t0,
    };
  } finally {
    clearTimeout(timer);
  }
}

export async function GET(request) {
  const bearer = (request.headers.get('authorization') || '').replace(/^Bearer\s+/i, '');
  const secret = bearer || request.headers.get('x-cron-secret') || '';
  const expected = process.env.CRON_SECRET;
  const isDev = process.env.NODE_ENV === 'development';
  if (!isDev) {
    if (!expected) return NextResponse.json({ error: 'cron_not_configured' }, { status: 503 });
    if (secret !== expected) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const results = await Promise.all(JOBS.map((p) => callJob(p, expected || '')));
  const okCount = results.filter((r) => r.ok).length;
  return NextResponse.json({
    ok: true,
    triggered: results.length,
    succeeded: okCount,
    results,
  });
}
