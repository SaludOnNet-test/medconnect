import { NextResponse } from 'next/server';
import { getPool, DB_AVAILABLE } from '@/lib/db';
import { generateSlots } from '@/data/mock';

const SPANISH_HOLIDAYS = [
  '2026-04-02', '2026-04-03', '2026-04-06',
  '2026-05-01', '2026-10-12', '2026-11-01',
  '2026-12-06', '2026-12-08', '2026-12-25',
];

function addMinutes(timeStr, minutes) {
  const [h, m] = timeStr.split(':').map(Number);
  const total = h * 60 + m + minutes;
  return `${String(Math.floor(total / 60)).padStart(2, '0')}:${String(total % 60).padStart(2, '0')}`;
}

function generateSlotsFromSchedules(schedules, daysAhead = 7, slotMinutes = 15, maxSlots = 3) {
  const slots = [];
  const now = new Date();

  for (let offset = 1; offset <= daysAhead && slots.length < maxSlots; offset++) {
    const date = new Date(now);
    date.setDate(date.getDate() + offset);
    const dayOfWeek = date.getDay();
    if (dayOfWeek === 0) continue;
    const dateStr = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
    if (SPANISH_HOLIDAYS.includes(dateStr)) continue;
    const dbDay = dayOfWeek === 6 ? 5 : dayOfWeek - 1;
    const daySchedules = schedules.filter((s) => s.day_of_week === dbDay);
    for (const sch of daySchedules) {
      let time = sch.start_time;
      while (time < sch.end_time && slots.length < maxSlots) {
        slots.push({ date: dateStr, time, available: true });
        time = addMinutes(time, slotMinutes);
      }
    }
  }
  return slots;
}

// GET /api/clinics/batch-slots?ids=1,2,3,4,5&days=7&preview=true
// Returns: { slots: { "1": [...], "2": [] } }
export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const rawIds = searchParams.get('ids') || '';
  const days = Math.min(parseInt(searchParams.get('days') || '7'), 30);
  const preview = searchParams.get('preview') !== 'false';
  const maxSlotsPerClinic = preview ? 3 : 999;

  const ids = rawIds
    .split(',')
    .map((s) => parseInt(s.trim(), 10))
    .filter((n) => !isNaN(n) && n > 0)
    .slice(0, 20); // cap at 20 clinics per batch

  if (ids.length === 0) {
    return NextResponse.json({ slots: {} });
  }

  const result = {};
  ids.forEach((id) => { result[id] = undefined; }); // mark all as requested

  if (DB_AVAILABLE) {
    try {
      // One raw query for all clinic IDs — IDs are validated integers so interpolation is safe
      const idList = ids.join(',');
      const pool = await getPool();
      const dbResult = await pool.request().query(
        `SELECT clinic_id, day_of_week, start_time, end_time
         FROM clinic_schedules
         WHERE clinic_id IN (${idList}) AND is_available = 1
         ORDER BY clinic_id, day_of_week, start_time`
      );

      // Group schedules by clinic_id
      const schedulesByClinic = {};
      for (const row of dbResult.recordset) {
        const cid = row.clinic_id;
        if (!schedulesByClinic[cid]) schedulesByClinic[cid] = [];
        schedulesByClinic[cid].push(row);
      }

      // Generate slots for clinics that have schedules
      for (const id of ids) {
        const schedules = schedulesByClinic[id];
        if (schedules && schedules.length > 0) {
          result[id] = generateSlotsFromSchedules(schedules, days, 15, maxSlotsPerClinic);
        }
      }
    } catch (err) {
      console.error('[batch-slots] DB error:', err);
    }
  }

  // For any clinic without DB schedules, fall back to mock
  for (const id of ids) {
    if (result[id] === undefined) {
      const mockSlots = generateSlots(id).filter((s) => s.available).slice(0, maxSlotsPerClinic);
      result[id] = mockSlots;
    }
  }

  return NextResponse.json({ slots: result });
}
