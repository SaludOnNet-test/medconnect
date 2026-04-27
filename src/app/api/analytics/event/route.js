import { NextResponse } from 'next/server';
import { getPool, DB_AVAILABLE } from '@/lib/db';
import { limits } from '@/lib/rateLimit';

export const dynamic = 'force-dynamic';

/**
 * POST /api/analytics/event
 * Records a funnel event to Azure SQL analytics_events table.
 * Fire-and-forget from the client — always returns 200 so the UI is never blocked.
 *
 * Rate-limited at 100 events/min/IP. Excess returns 200 (silently drop) so a
 * single misbehaving client can't melt the analytics_events table but the user
 * never sees an error from telemetry.
 */
export async function POST(request) {
  // If DB not configured, silently succeed (don't block the user)
  if (!DB_AVAILABLE) return NextResponse.json({ ok: true });

  // Silent rate-limit: drop excess events but still 200 the client.
  const r = limits.analyticsEvent.check(request);
  if (!r.ok) return NextResponse.json({ ok: true, dropped: true }, { headers: r.headers });

  try {
    const body = await request.json();
    const { event_name, session_id, properties, page_url } = body;

    if (!event_name) return NextResponse.json({ ok: true }); // silent ignore

    const pool = await getPool();
    await pool.request()
      .input('event_name', String(event_name).slice(0, 64))
      .input('session_id', String(session_id || '').slice(0, 64))
      .input('properties', properties ? String(properties).slice(0, 4000) : null)
      .input('page_url', String(page_url || '').slice(0, 512))
      .query(`
        INSERT INTO analytics_events (event_name, session_id, properties, page_url)
        VALUES (@event_name, @session_id, @properties, @page_url)
      `);

    return NextResponse.json({ ok: true });
  } catch (err) {
    // Silent — never surface analytics errors to the user
    console.error('[analytics/event]', err.message);
    return NextResponse.json({ ok: true });
  }
}
