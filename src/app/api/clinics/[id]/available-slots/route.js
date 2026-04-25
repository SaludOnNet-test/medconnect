import { NextResponse } from 'next/server';
import { query, sql, DB_AVAILABLE } from '@/lib/db';
import { generateSlotsForClinic, PRICING_TIERS } from '@/lib/slot-validation';

export async function GET(request, { params }) {
  const { id } = await params;
  const clinicId = parseInt(id, 10);
  if (isNaN(clinicId)) {
    return NextResponse.json({ slots: [], source: 'error', error: 'Invalid clinic ID' }, { status: 400 });
  }

  let schedules = [];
  if (DB_AVAILABLE) {
    try {
      const result = await query(
        `SELECT day_of_week, start_time, end_time, is_available
         FROM clinic_schedules
         WHERE clinic_id = @clinicId AND is_available = 1
         ORDER BY day_of_week, start_time`,
        { clinicId: { type: sql.Int, value: clinicId } }
      );
      schedules = result.recordset;
    } catch (err) {
      console.error('available-slots db error:', err);
    }
  }

  const { slots, rule, earliestSellable } = generateSlotsForClinic(clinicId, schedules);

  return NextResponse.json({
    slots,
    source: rule === 'doctoralia' ? 'db' : 'fallback',
    rule,
    earliestSellable,
    pricingTiers: PRICING_TIERS,
    clinicId,
  });
}
