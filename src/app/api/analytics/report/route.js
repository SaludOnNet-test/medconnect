import { NextResponse } from 'next/server';
import { getPool, DB_AVAILABLE } from '@/lib/db';
import Anthropic from '@anthropic-ai/sdk';

export const dynamic = 'force-dynamic';

/**
 * GET /api/analytics/report?secret=<ANALYTICS_SECRET>
 * Queries last 7 days of funnel data from Azure SQL, sends to Claude for analysis.
 * Returns structured JSON with funnel stats + AI recommendations.
 *
 * Recommended: call weekly (Monday mornings) or on demand.
 */
export async function GET(request) {
  const secret = request.nextUrl.searchParams.get('secret');
  if (secret !== process.env.ANALYTICS_SECRET) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  if (!DB_AVAILABLE) {
    return NextResponse.json({ error: 'Azure SQL not configured' }, { status: 503 });
  }

  if (!process.env.ANTHROPIC_API_KEY) {
    return NextResponse.json({ error: 'ANTHROPIC_API_KEY not configured' }, { status: 503 });
  }

  try {
    const pool = await getPool();

    // Funnel events (last 7 days)
    const eventsRes = await pool.request().query(`
      SELECT event_name, COUNT(*) AS cnt
      FROM analytics_events
      WHERE created_at >= DATEADD(day, -7, SYSDATETIMEOFFSET())
      GROUP BY event_name
      ORDER BY cnt DESC
    `);

    // Top searches (last 7 days)
    const searchesRes = await pool.request().query(`
      SELECT TOP 10
        JSON_VALUE(properties, '$.specialty') AS specialty,
        JSON_VALUE(properties, '$.city') AS city,
        COUNT(*) AS cnt
      FROM analytics_events
      WHERE event_name = 'search_performed'
        AND created_at >= DATEADD(day, -7, SYSDATETIMEOFFSET())
      GROUP BY JSON_VALUE(properties, '$.specialty'), JSON_VALUE(properties, '$.city')
      ORDER BY cnt DESC
    `);

    // Referrals by state (last 7 days)
    const referralsRes = await pool.request().query(`
      SELECT state, COUNT(*) AS cnt
      FROM referrals
      WHERE created_at >= DATEADD(day, -7, SYSDATETIMEOFFSET())
      GROUP BY state
    `);

    // Bookings summary (last 7 days)
    const bookingsRes = await pool.request().query(`
      SELECT
        COUNT(*) AS total,
        AVG(CAST(amount AS FLOAT)) AS avg_amount
      FROM bookings
      WHERE created_at >= DATEADD(day, -7, SYSDATETIMEOFFSET())
    `);

    // Build funnel object
    const events = eventsRes.recordset.reduce((acc, r) => { acc[r.event_name] = r.cnt; return acc; }, {});
    const referrals = referralsRes.recordset.reduce((acc, r) => { acc[r.state] = r.cnt; return acc; }, {});
    const bookings = bookingsRes.recordset[0] || {};

    const pct = (a, b) => (a && b) ? `${Math.round(a / b * 100)}%` : 'N/A';

    const funnelData = {
      period: 'last 7 days',
      events,
      top_searches: searchesRes.recordset,
      referrals,
      bookings: {
        total: bookings.total || 0,
        avg_amount_eur: bookings.avg_amount ? Math.round(bookings.avg_amount * 100) / 100 : 0,
      },
      funnel_conversion: {
        search_to_clinic_view:   pct(events.clinic_viewed,   events.search_performed),
        clinic_to_slot_selected: pct(events.slot_selected,   events.clinic_viewed),
        slot_to_book_started:    pct(events.book_started,    events.slot_selected),
        book_to_completed:       pct(events.book_completed,  events.book_started),
        overall:                 pct(events.book_completed,  events.search_performed),
      },
    };

    // Call Claude
    const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
    const model = process.env.ANTHROPIC_MODEL || 'claude-opus-4-5';

    const message = await client.messages.create({
      model,
      max_tokens: 1024,
      messages: [{
        role: 'user',
        content: `You are a UX/conversion analyst for Med Connect, a Spanish private healthcare appointment booking platform. Patients search for specialists, browse clinics on a Doctoralia-style page, select time slots, and pay a convenience fee (€0.99–€25 depending on urgency).

Here is the last 7 days of funnel data:
${JSON.stringify(funnelData, null, 2)}

Analyze the data and respond ONLY with a valid JSON object (no markdown, no explanation outside the JSON):
{
  "headline": "one sentence summary of the week in Spanish",
  "biggest_issue": "the main drop-off or problem you see, in Spanish",
  "recommendations": [
    {
      "title": "short title in Spanish",
      "impact": "high|medium|low",
      "description": "specific actionable improvement in Spanish, reference actual numbers where relevant"
    }
  ]
}

Provide exactly 3 recommendations ranked by expected impact. Be specific and actionable.`,
      }],
    });

    let analysis;
    try {
      const raw = message.content[0].text;
      const match = raw.match(/\{[\s\S]*\}/);
      analysis = match ? JSON.parse(match[0]) : { raw };
    } catch {
      analysis = { raw: message.content[0].text };
    }

    return NextResponse.json({
      funnel: funnelData,
      analysis,
      generatedAt: new Date().toISOString(),
      model,
    });
  } catch (err) {
    console.error('[analytics/report]', err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
