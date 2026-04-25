import { NextResponse } from 'next/server';
import { getPool, DB_AVAILABLE } from '@/lib/db';
import { generateSlotsForClinic, PRICING_TIERS } from '@/lib/slot-validation';

// GET /api/clinics/batch-slots?ids=1,2,3,4,5&preview=true
// Returns: { slots: { "1": [...], "2": [...] }, pricingTiers: [...] }
export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const rawIds = searchParams.get('ids') || '';
  const preview = searchParams.get('preview') !== 'false';

  const ids = rawIds
    .split(',')
    .map((s) => parseInt(s.trim(), 10))
    .filter((n) => !isNaN(n) && n > 0)
    .slice(0, 20);

  if (ids.length === 0) {
    return NextResponse.json({ slots: {}, pricingTiers: PRICING_TIERS });
  }

  const schedulesByClinic = {};
  ids.forEach((id) => { schedulesByClinic[id] = []; });

  if (DB_AVAILABLE) {
    try {
      const idList = ids.join(',');
      const pool = await getPool();
      const dbResult = await pool.request().query(
        `SELECT clinic_id, day_of_week, start_time, end_time, is_available
         FROM clinic_schedules
         WHERE clinic_id IN (${idList}) AND is_available = 1
         ORDER BY clinic_id, day_of_week, start_time`
      );
      for (const row of dbResult.recordset) {
        if (!schedulesByClinic[row.clinic_id]) schedulesByClinic[row.clinic_id] = [];
        schedulesByClinic[row.clinic_id].push(row);
      }
    } catch (err) {
      console.error('[batch-slots] DB error:', err);
    }
  }

  const result = {};
  for (const id of ids) {
    const { slots } = generateSlotsForClinic(id, schedulesByClinic[id]);
    // For preview, return only the cheapest 4 slots (1 per tier when present)
    if (preview) {
      const byTier = {};
      for (const s of slots) {
        if (!byTier[s.tier] || s.date < byTier[s.tier].date) byTier[s.tier] = s;
      }
      result[id] = Object.values(byTier).sort((a, b) => a.tier - b.tier);
    } else {
      result[id] = slots;
    }
  }

  return NextResponse.json({ slots: result, pricingTiers: PRICING_TIERS });
}
