import { NextResponse } from 'next/server';
import { query, sql, DB_AVAILABLE } from '@/lib/db';
import { generateSlots } from '@/data/mock';

const SPANISH_HOLIDAYS = [
  '2026-04-02', '2026-04-03', '2026-04-06',
  '2026-05-01', '2026-10-12', '2026-11-01',
  '2026-12-06', '2026-12-08', '2026-12-25',
];

function isHoliday(dateStr) {
  return SPANISH_HOLIDAYS.includes(dateStr);
}

function addMinutes(timeStr, minutes) {
  const [h, m] = timeStr.split(':').map(Number);
  const total = h * 60 + m + minutes;
  return `${String(Math.floor(total / 60)).padStart(2, '0')}:${String(total % 60).padStart(2, '0')}`;
}

function timeLt(a, b) {
  return a < b;
}

function generateSlotsFromSchedules(schedules, daysAhead = 45, slotMinutes = 15) {
  const slots = [];
  const now = new Date();

  for (let offset = 1; offset <= daysAhead; offset++) {
    const date = new Date(now);
    date.setDate(date.getDate() + offset);

    const dayOfWeek = date.getDay(); // 0=Sun, 1=Mon ... 6=Sat
    if (dayOfWeek === 0) continue; // skip Sunday

    const dateStr = date.toISOString().split('T')[0];
    if (isHoliday(dateStr)) continue;

    // day_of_week in DB: 0=Mon, 1=Tue, ..., 5=Sat (convert from JS where 1=Mon...6=Sat)
    const dbDay = dayOfWeek === 6 ? 5 : dayOfWeek - 1;

    const daySchedules = schedules.filter((s) => s.day_of_week === dbDay && s.is_available);
    if (daySchedules.length === 0) continue;

    for (const sch of daySchedules) {
      let time = sch.start_time;
      while (timeLt(time, sch.end_time)) {
        slots.push({ date: dateStr, time, available: true });
        time = addMinutes(time, slotMinutes);
      }
    }
  }

  slots.sort((a, b) => a.date === b.date ? a.time.localeCompare(b.time) : a.date.localeCompare(b.date));
  return slots;
}

export async function GET(request, { params }) {
  const { id } = await params;
  const clinicId = parseInt(id, 10);
  if (isNaN(clinicId)) {
    return NextResponse.json({ slots: [], source: 'error', error: 'Invalid clinic ID' }, { status: 400 });
  }

  const { searchParams } = new URL(request.url);
  const days = Math.min(parseInt(searchParams.get('days') || '45'), 90);

  if (DB_AVAILABLE) {
    try {
      const result = await query(
        `SELECT day_of_week, start_time, end_time, is_available
         FROM clinic_schedules
         WHERE clinic_id = @clinicId AND is_available = 1
         ORDER BY day_of_week, start_time`,
        { clinicId: { type: sql.Int, value: clinicId } }
      );

      if (result.recordset.length > 0) {
        const slots = generateSlotsFromSchedules(result.recordset, days);
        return NextResponse.json({ slots, source: 'db', clinicId });
      }
    } catch (err) {
      console.error('available-slots db error:', err);
    }
  }

  // Fallback: generate random slots
  const mockSlots = generateSlots(clinicId);
  return NextResponse.json({ slots: mockSlots, source: 'mock', clinicId });
}
