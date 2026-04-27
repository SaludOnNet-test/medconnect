// Slot generation rules - MedConnect MVP
// 8 slots per clinic (2 per tier x 4 tiers), with pricing.
// See docs/SLOT_GENERATION_RULES.md for full specification.

export const SPANISH_HOLIDAYS = [
  '2026-04-02', '2026-04-03', '2026-04-06',
  '2026-05-01', '2026-08-15',
  '2026-10-12', '2026-11-01',
  '2026-12-06', '2026-12-08', '2026-12-25',
  '2027-01-01', '2027-01-06',
];

export const PRICING_TIERS = [
  { tier: 1, name: 'urgencia',     label: 'Esta semana',         dayMin: 0,  dayMax: 7,  price: 29.00, paymentToClinic: 15 },
  { tier: 2, name: 'sweet_spot',   label: 'Próxima semana',      dayMin: 8,  dayMax: 14, price: 19.00, paymentToClinic: 10 },
  { tier: 3, name: 'anticipo',     label: 'Este mes',            dayMin: 15, dayMax: 30, price:  9.99, paymentToClinic:  5 },
  { tier: 4, name: 'lead_capture', label: 'Más adelante',        dayMin: 31, dayMax: 45, price:  4.99, paymentToClinic:  2 },
];

export const SLOT_RULES = {
  BUFFER_BUSINESS_HOURS: 6,
  BUSINESS_DAY_START: 9,    // 09:00
  BUSINESS_DAY_END: 18,     // 18:00
  TOLERANCE_MINUTES: 15,
  MORNING_START: '08:00',
  MORNING_END: '13:00',
  AFTERNOON_START: '14:00',
  AFTERNOON_END: '19:00',
  SLOT_INTERVAL_MINUTES: 15,
};

// ----- helpers ----------------------------------------------------------------

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

export function formatDate(date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

export function jsDayToDbDay(jsDay) {
  if (jsDay === 0) return -1; // Sunday: not stored
  if (jsDay === 6) return 5;  // Saturday
  return jsDay - 1;           // Mon..Fri → 0..4
}

export function isBusinessDay(date) {
  const dow = date.getDay();
  if (dow === 0 || dow === 6) return false;
  if (isHoliday(formatDate(date))) return false;
  return true;
}

function addDaysUTC(date, days) {
  const d = new Date(date);
  d.setDate(d.getDate() + days);
  return d;
}

function startOfDay(date) {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  return d;
}

// Adds `hours` business hours (Mon-Fri 9:00-18:00, no holidays) to fromDate.
// Returns a Date object.
export function applyBusinessHourBuffer(fromDate, hours = SLOT_RULES.BUFFER_BUSINESS_HOURS) {
  let cursor = new Date(fromDate);
  let remaining = hours * 60; // minutes

  while (remaining > 0) {
    if (!isBusinessDay(cursor)) {
      // jump to next business day at 09:00
      cursor = addDaysUTC(startOfDay(cursor), 1);
      cursor.setHours(SLOT_RULES.BUSINESS_DAY_START, 0, 0, 0);
      continue;
    }

    const minutesNow = cursor.getHours() * 60 + cursor.getMinutes();
    const dayStart = SLOT_RULES.BUSINESS_DAY_START * 60;
    const dayEnd = SLOT_RULES.BUSINESS_DAY_END * 60;

    if (minutesNow < dayStart) {
      // before business hours, jump to dayStart
      cursor.setHours(SLOT_RULES.BUSINESS_DAY_START, 0, 0, 0);
      continue;
    }

    if (minutesNow >= dayEnd) {
      // after business hours, jump to next day 09:00
      cursor = addDaysUTC(startOfDay(cursor), 1);
      cursor.setHours(SLOT_RULES.BUSINESS_DAY_START, 0, 0, 0);
      continue;
    }

    const availableToday = dayEnd - minutesNow;
    if (remaining <= availableToday) {
      cursor.setMinutes(cursor.getMinutes() + remaining);
      remaining = 0;
    } else {
      remaining -= availableToday;
      cursor = addDaysUTC(startOfDay(cursor), 1);
      cursor.setHours(SLOT_RULES.BUSINESS_DAY_START, 0, 0, 0);
    }
  }

  return cursor;
}

// Returns array of business-day Date objects between startDate and endDate (inclusive).
function listBusinessDays(startDate, endDate) {
  const days = [];
  const cursor = startOfDay(startDate);
  const end = startOfDay(endDate);

  while (cursor <= end) {
    if (isBusinessDay(cursor)) days.push(new Date(cursor));
    cursor.setDate(cursor.getDate() + 1);
  }
  return days;
}

// Deterministic pseudo-random in [0, max) seeded by (clinicId, tier, salt).
function seededInt(clinicId, tier, salt, max) {
  let seed = (clinicId * 31 + tier * 1009 + salt * 7919) >>> 0;
  seed = (seed * 1103515245 + 12345) & 0x7fffffff;
  return seed % max;
}

// Pick a time in HH:MM that lies within [windowStart, windowEnd] minutes,
// snapped to SLOT_INTERVAL_MINUTES, deterministic per (clinicId, tier, salt).
function pickTimeInWindow(clinicId, tier, salt, windowStart, windowEnd) {
  const interval = SLOT_RULES.SLOT_INTERVAL_MINUTES;
  const slotsCount = Math.max(1, Math.floor((windowEnd - windowStart) / interval));
  const idx = seededInt(clinicId, tier, salt, slotsCount);
  return minutesToTime(windowStart + idx * interval);
}

// For clinics WITH Doctoralia: find a time in the matching schedule(s) for a given day,
// optionally constrained to morning/afternoon period.
function pickTimeFromSchedules(clinicId, tier, salt, schedules, dbDay, period) {
  const day = schedules.filter((s) => s.day_of_week === dbDay && s.is_available !== false);
  if (day.length === 0) return null;

  const tolerance = SLOT_RULES.TOLERANCE_MINUTES;
  const interval = SLOT_RULES.SLOT_INTERVAL_MINUTES;

  // collect candidate slot minutes that fall within the requested period
  const periodStart = timeToMinutes(period === 'morning' ? SLOT_RULES.MORNING_START : SLOT_RULES.AFTERNOON_START);
  const periodEnd   = timeToMinutes(period === 'morning' ? SLOT_RULES.MORNING_END   : SLOT_RULES.AFTERNOON_END);

  const candidates = [];
  for (const sch of day) {
    const startMin = Math.max(timeToMinutes(sch.start_time) - tolerance, 0);
    const endMin = timeToMinutes(sch.end_time) + tolerance;
    const lo = Math.max(startMin, periodStart);
    const hi = Math.min(endMin, periodEnd);
    if (hi <= lo) continue;
    const first = Math.ceil(lo / interval) * interval;
    for (let m = first; m < hi; m += interval) candidates.push(m);
  }

  if (candidates.length === 0) return null;
  return minutesToTime(candidates[seededInt(clinicId, tier, salt, candidates.length)]);
}

// ----- main -------------------------------------------------------------------

// Picks up to 2 slots (1 morning + 1 afternoon) for a tier.
function pickSlotsForTier(clinicId, schedules, tier, earliestSellable, hasDoctoralia) {
  const now = earliestSellable; // already buffered
  const tierStart = startOfDay(addDaysUTC(now, tier.dayMin));
  const tierStartUsable = tierStart < earliestSellable ? startOfDay(earliestSellable) : tierStart;
  const tierEnd = startOfDay(addDaysUTC(now, tier.dayMax));

  const businessDays = listBusinessDays(tierStartUsable, tierEnd);
  if (businessDays.length === 0) return [];

  const slots = [];

  const periods = ['morning', 'afternoon'];
  const dayOffsets = [
    Math.floor(businessDays.length * 0.25),
    Math.floor(businessDays.length * 0.65),
  ];

  for (let i = 0; i < periods.length; i++) {
    const period = periods[i];
    let pickedDay = null;
    let pickedTime = null;

    // try the deterministic offset first, then walk forward, then backward
    const startIdx = Math.min(dayOffsets[i], businessDays.length - 1);
    const order = [];
    for (let off = 0; off < businessDays.length; off++) {
      const idx = (startIdx + off) % businessDays.length;
      order.push(idx);
    }

    for (const idx of order) {
      const day = businessDays[idx];

      // ensure day not already used by previous slot of same tier
      if (slots.length > 0 && formatDate(day) === slots[0].date) continue;

      const dbDay = jsDayToDbDay(day.getDay());

      let time;
      if (hasDoctoralia) {
        time = pickTimeFromSchedules(clinicId, tier.tier, i, schedules, dbDay, period);
      } else {
        const winStart = timeToMinutes(period === 'morning' ? SLOT_RULES.MORNING_START : SLOT_RULES.AFTERNOON_START);
        const winEnd   = timeToMinutes(period === 'morning' ? SLOT_RULES.MORNING_END   : SLOT_RULES.AFTERNOON_END);
        time = pickTimeInWindow(clinicId, tier.tier, i, winStart, winEnd);
      }

      if (!time) continue;

      // ensure slot is after earliestSellable
      const slotDateTime = new Date(day);
      const [th, tm] = time.split(':').map(Number);
      slotDateTime.setHours(th, tm, 0, 0);
      if (slotDateTime < earliestSellable) continue;

      pickedDay = day;
      pickedTime = time;
      break;
    }

    if (pickedDay && pickedTime) {
      slots.push({
        date: formatDate(pickedDay),
        time: pickedTime,
        available: true,
        tier: tier.tier,
        tierName: tier.name,
        tierLabel: tier.label,
        price: tier.price,
        paymentToClinic: tier.paymentToClinic,
        period,
      });
    }
  }

  return slots;
}

// Main entry: 8 slots per clinic (2 per tier x 4 tiers).
export function generateSlotsForClinic(clinicId, schedules, options = {}) {
  const now = options.now || new Date();
  const earliestSellable = applyBusinessHourBuffer(now, SLOT_RULES.BUFFER_BUSINESS_HOURS);
  const hasDoctoralia = Array.isArray(schedules) && schedules.length > 0;

  const allSlots = [];
  for (const tier of PRICING_TIERS) {
    const tierSlots = pickSlotsForTier(clinicId, schedules || [], tier, earliestSellable, hasDoctoralia);
    allSlots.push(...tierSlots);
  }

  allSlots.sort((a, b) =>
    a.date === b.date ? a.time.localeCompare(b.time) : a.date.localeCompare(b.date)
  );

  return {
    slots: allSlots,
    rule: hasDoctoralia ? 'doctoralia' : 'fallback',
    earliestSellable: earliestSellable.toISOString(),
  };
}

// Backwards-compatible single-slot validator
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
