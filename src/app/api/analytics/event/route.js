import { NextResponse } from 'next/server';
import { getPool, DB_AVAILABLE } from '@/lib/db';

export const dynamic = 'force-dynamic';

/**
 * POST /api/analytics/event
 * Records a funnel event to Azure SQL analytics_events table.
 * Fire-and-forget from the client — always returns 200 so the UI is never blocked.
 */
export async function POST(request) {
  // If DB not configured, silently succeed (don't block the user)
  if (!DB_AVAILABLE) return NextResponse.json({ ok: true });

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
