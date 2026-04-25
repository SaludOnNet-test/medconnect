import { NextResponse } from 'next/server';
import { query, sql, DB_AVAILABLE } from '@/lib/db';
import { generateSlotsForClinic, SLOT_RULES } from '@/lib/slot-validation';

export async function GET(request, { params }) {
  const { id } = await params;
  const clinicId = parseInt(id, 10);
  if (isNaN(clinicId)) {
    return NextResponse.json({ slots: [], source: 'error', error: 'Invalid clinic ID' }, { status: 400 });
  }

  const { searchParams } = new URL(request.url);
  const days = Math.min(parseInt(searchParams.get('days') || String(SLOT_RULES.DEFAULT_DAYS_AHEAD), 10), 90);

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

  const { slots, rule } = generateSlotsForClinic(clinicId, schedules, { daysAhead: days });

  return NextResponse.json({
    slots,
    source: rule === 'doctoralia' ? 'db' : 'fallback',
    rule,
    clinicId,
  });
}
