// Slot generation rules - MedConnect
// See docs/SLOT_GENERATION_RULES.md for full specification

export const SPANISH_HOLIDAYS = [
  '2026-04-02', '2026-04-03', '2026-04-06',
  '2026-05-01', '2026-08-15',
  '2026-10-12', '2026-11-01',
  '2026-12-06', '2026-12-08', '2026-12-25',
  '2027-01-01', '2027-01-06',
];

export const SLOT_RULES = {
  TOLERANCE_MINUTES: 15,
  DOCTORALIA_INTERVAL: 15,
  FALLBACK_SLOTS_COUNT: 4,
  FALLBACK_BUSINESS_DAYS: 5,
  DEFAULT_DAYS_AHEAD: 45,
  PREVIEW_DAYS: 7,
  MORNING_START: '08:00',
  MORNING_END: '13:00',
  AFTERNOON_START: '14:00',
  AFTERNOON_END: '19:00',
};

export function isHoliday(dateStr) {
  return SPANISH_HOLIDAYS.includes(dateStr);
}

export function timeToMinutes(timeStr) {
  const [h, m] = timeStr.split(':').map(Number);
  return h * 60 + m;
}

export function minutesToTime(totalMinutes) {
  const h = Math.floor(totalMinutes / 60);
  const m = totalMinutes % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

export function addMinutes(timeStr, minutes) {
  return minutesToTime(timeToMinutes(timeStr) + minutes);
}

export function formatDate(date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

// Convert JS day (0=Sun, 1=Mon..6=Sat) to DB day (0=Mon..4=Fri, 5=Sat)
export function jsDayToDbDay(jsDay) {
  if (jsDay === 0) return -1; // Sunday: not stored
  if (jsDay === 6) return 5;  // Saturday
  return jsDay - 1;           // Monday..Friday → 0..4
}

export function isBusinessDay(date) {
  const dow = date.getDay();
  if (dow === 0 || dow === 6) return false; // Sun, Sat
  if (isHoliday(formatDate(date))) return false;
  return true;
}

export function getNextBusinessDays(fromDate, count) {
  const days = [];
  const current = new Date(fromDate);
  current.setHours(0, 0, 0, 0);

  while (days.length < count) {
    if (isBusinessDay(current)) {
      days.push(new Date(current));
    }
    current.setDate(current.getDate() + 1);
    if (days.length === 0 && current.getTime() - fromDate.getTime() > 30 * 24 * 60 * 60 * 1000) {
      break; // safety: no business days in next 30 days
    }
  }

  return days;
}

// REGLA 1: Generate slots from Doctoralia schedules (with ±15 min tolerance)
export function generateSlotsFromDoctoralia(schedules, options = {}) {
  const {
    daysAhead = SLOT_RULES.DEFAULT_DAYS_AHEAD,
    intervalMinutes = SLOT_RULES.DOCTORALIA_INTERVAL,
    toleranceMinutes = SLOT_RULES.TOLERANCE_MINUTES,
    maxSlots = Infinity,
  } = options;

  const slots = [];
  const now = new Date();
  now.setHours(0, 0, 0, 0);

  for (let offset = 1; offset <= daysAhead && slots.length < maxSlots; offset++) {
    const date = new Date(now);
    date.setDate(date.getDate() + offset);

    if (!isBusinessDay(date)) continue;

    const dbDay = jsDayToDbDay(date.getDay());
    if (dbDay < 0 || dbDay > 4) continue; // Mon-Fri only

    const daySchedules = schedules.filter(
      (s) => s.day_of_week === dbDay && s.is_available !== false
    );
    if (daySchedules.length === 0) continue;

    const dateStr = formatDate(date);

    for (const sch of daySchedules) {
      const startMin = timeToMinutes(sch.start_time);
      const endMin = timeToMinutes(sch.end_time);

      const lowerBound = Math.max(0, startMin - toleranceMinutes);
      const upperBound = endMin + toleranceMinutes;

      const firstSlot = Math.ceil(lowerBound / intervalMinutes) * intervalMinutes;

      for (let m = firstSlot; m < upperBound && slots.length < maxSlots; m += intervalMinutes) {
        slots.push({ date: dateStr, time: minutesToTime(m), available: true });
      }
    }
  }

  slots.sort((a, b) =>
    a.date === b.date ? a.time.localeCompare(b.time) : a.date.localeCompare(b.date)
  );

  return slots;
}

// REGLA 2: Generate fallback slots (2-4 slots/week in next 5 business days)
export function generateFallbackSlots(clinicId, options = {}) {
  const {
    slotCount = SLOT_RULES.FALLBACK_SLOTS_COUNT,
    businessDays = SLOT_RULES.FALLBACK_BUSINESS_DAYS,
  } = options;

  const days = getNextBusinessDays(new Date(), businessDays);
  if (days.length === 0) return [];

  const distribution = [
    { dayIdx: 0, period: 'morning' },
    { dayIdx: 1, period: 'afternoon' },
    { dayIdx: 3, period: 'morning' },
    { dayIdx: 4, period: 'afternoon' },
  ].slice(0, slotCount);

  const slots = [];
  let seed = clinicId * 31; // deterministic per clinic

  for (const { dayIdx, period } of distribution) {
    const day = days[Math.min(dayIdx, days.length - 1)];
    if (!day) continue;

    const startTime = period === 'morning' ? SLOT_RULES.MORNING_START : SLOT_RULES.AFTERNOON_START;
    const endTime = period === 'morning' ? SLOT_RULES.MORNING_END : SLOT_RULES.AFTERNOON_END;

    const startMin = timeToMinutes(startTime);
    const endMin = timeToMinutes(endTime);
    const range = endMin - startMin - 30;

    seed = (seed * 1103515245 + 12345) & 0x7fffffff;
    const offsetMin = (seed % range);
    const snappedMin = startMin + Math.floor(offsetMin / 30) * 30;

    slots.push({
      date: formatDate(day),
      time: minutesToTime(snappedMin),
      available: true,
    });
  }

  slots.sort((a, b) =>
    a.date === b.date ? a.time.localeCompare(b.time) : a.date.localeCompare(b.date)
  );

  return slots;
}

// Validate a single slot against Doctoralia rules
export function isSlotValidForDoctoralia(date, time, schedules, toleranceMinutes = SLOT_RULES.TOLERANCE_MINUTES) {
  if (!isBusinessDay(date)) return false;

  const dbDay = jsDayToDbDay(date.getDay());
  if (dbDay < 0 || dbDay > 4) return false;

  const daySchedules = schedules.filter((s) => s.day_of_week === dbDay && s.is_available !== false);
  if (daySchedules.length === 0) return false;

  const slotMin = timeToMinutes(time);
  return daySchedules.some(
    (sch) =>
      slotMin >= timeToMinutes(sch.start_time) - toleranceMinutes &&
      slotMin <= timeToMinutes(sch.end_time) + toleranceMinutes
  );
}

// Main entry: pick rule based on schedule data
export function generateSlotsForClinic(clinicId, schedules, options = {}) {
  const hasDoctoralia = Array.isArray(schedules) && schedules.length > 0;

  if (hasDoctoralia) {
    return {
      slots: generateSlotsFromDoctoralia(schedules, options),
      rule: 'doctoralia',
    };
  }

  return {
    slots: generateFallbackSlots(clinicId, options),
    rule: 'fallback',
  };
}
