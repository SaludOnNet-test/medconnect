import { NextResponse } from 'next/server';
import { internalError } from '@/lib/errors';
import { requireExecAuth } from '@/lib/exec/auth';
import { sendEmail } from '@/lib/email';
import { dailyHtml } from '@/lib/exec/templates/daily';
import { runAllCheckers } from '@/lib/exec/quotaCheckers';

export const dynamic = 'force-dynamic';

/**
 * GET /api/exec/daily-email?secret=...&dryRun=true
 *
 * Compose + send the daily executive digest. Triggered by Vercel Cron at
 * 06:00 UTC (08:00 Madrid in CEST, 07:00 in CET) — see vercel.json.
 *
 * `dryRun=true` returns the rendered HTML in the JSON response without
 * sending — useful to preview from the browser during development.
 *
 * Internally we call the business-kpis endpoint twice (yesterday + 7d) and
 * the quota checkers directly. The double KPIs call gives us the
 * "vs media 7d" comparator without re-running queries inside this Lambda.
 */
export async function GET(request) {
  const authError = requireExecAuth(request);
  if (authError) return authError;

  const { searchParams } = new URL(request.url);
  const dryRun = searchParams.get('dryRun') === 'true';
  const toOverride = searchParams.get('to'); // útil para test: ?to=alguien@dominio

  const recipient = toOverride || process.env.EXEC_REPORT_TO_EMAIL;
  if (!recipient && !dryRun) {
    return NextResponse.json({ error: 'EXEC_REPORT_TO_EMAIL not configured' }, { status: 503 });
  }

  try {
    const origin = new URL(request.url).origin;
    const secret = process.env.EXEC_REPORT_SECRET || '';
    const cronSecret = process.env.CRON_SECRET || '';

    // We may be invoked by Vercel Cron (Bearer auth) or by an admin browser
    // session. Pass *both* credentials forward so the inner fetch succeeds
    // regardless of which one was set in the environment.
    const innerHeaders = {};
    if (cronSecret) innerHeaders.Authorization = `Bearer ${cronSecret}`;
    const qs = secret ? `&secret=${encodeURIComponent(secret)}` : '';

    // Fan out: two KPI calls + one quotas. Three round-trips, parallel.
    const [kpisRes, kpis7dRes, quotaResult] = await Promise.all([
      fetch(`${origin}/api/exec/business-kpis?range=yesterday${qs}`, {
        cache: 'no-store',
        headers: innerHeaders,
      }).then((r) => r.json()).catch((err) => ({ error: err.message })),
      fetch(`${origin}/api/exec/business-kpis?range=7d${qs}`, {
        cache: 'no-store',
        headers: innerHeaders,
      }).then((r) => r.json()).catch((err) => ({ error: err.message })),
      runAllCheckers(),
    ]);

    if (kpisRes?.error) {
      return NextResponse.json({ error: `kpis: ${kpisRes.error}` }, { status: 500 });
    }

    const dateLabel = new Date(Date.now() - 24 * 60 * 60 * 1000)
      .toLocaleDateString('es-ES', { day: '2-digit', month: 'short', year: 'numeric' });

    const dashboardUrl = `${origin}/admin/exec`;

    const { subject, html } = dailyHtml({
      kpis: kpisRes,
      kpis7d: kpis7dRes,
      quotas: { providers: quotaResult.providers, worst: quotaResult.worst },
      dashboardUrl,
      dateLabel,
    });

    if (dryRun) {
      return new NextResponse(html, {
        status: 200,
        headers: { 'Content-Type': 'text/html; charset=utf-8' },
      });
    }

    const result = await sendEmail({
      to: recipient,
      subject,
      html,
      category: 'daily_exec',
    });

    if (!result.ok) {
      return NextResponse.json({ error: result.error, sentTo: recipient }, { status: 500 });
    }

    return NextResponse.json({
      ok: true,
      mock: !!result.mock,
      sentTo: recipient,
      subject,
      generatedAt: new Date().toISOString(),
    });
  } catch (err) {
    return internalError(err, '[GET /api/exec/daily-email]');
  }
}
