// ──────────────────────────────────────────────────
// Med Connect – Mock Data
// ──────────────────────────────────────────────────

export const specialties = [
  { id: 1, name: 'Traumatología' },
  { id: 2, name: 'Dermatología' },
  { id: 3, name: 'Ginecología' },
  { id: 4, name: 'Oftalmología' },
  { id: 5, name: 'Cardiología' },
  { id: 6, name: 'Urología' },
  { id: 7, name: 'Otorrinolaringología' },
  { id: 8, name: 'Digestivo' },
];

export const services = [
  { id: 1, specialtyId: 1, name: 'Consulta Traumatología', basePrice: 45 },
  { id: 2, specialtyId: 1, name: 'Resonancia Magnética', basePrice: 120 },
  { id: 3, specialtyId: 2, name: 'Consulta Dermatología', basePrice: 40 },
  { id: 4, specialtyId: 2, name: 'Dermatoscopia', basePrice: 65 },
  { id: 5, specialtyId: 3, name: 'Consulta Ginecología', basePrice: 50 },
  { id: 6, specialtyId: 3, name: 'Ecografía Ginecológica', basePrice: 80 },
  { id: 7, specialtyId: 4, name: 'Consulta Oftalmología', basePrice: 45 },
  { id: 8, specialtyId: 4, name: 'Fondo de Ojo', basePrice: 55 },
  { id: 9, specialtyId: 5, name: 'Consulta Cardiología', basePrice: 55 },
  { id: 10, specialtyId: 5, name: 'Electrocardiograma', basePrice: 40 },
  { id: 11, specialtyId: 6, name: 'Consulta Urología', basePrice: 50 },
  { id: 12, specialtyId: 7, name: 'Consulta ORL', basePrice: 45 },
  { id: 13, specialtyId: 8, name: 'Consulta Digestivo', basePrice: 50 },
  { id: 14, specialtyId: 8, name: 'Colonoscopia', basePrice: 350 },
];

export const cities = [
  'Madrid', 'Barcelona', 'Valencia', 'Sevilla', 'Málaga',
  'Bilbao', 'Zaragoza', 'Alicante', 'Palma de Mallorca',
];

export const insuranceCompanies = [
  'Sanitas', 'Adeslas', 'DKV', 'AXA', 'Mapfre', 'Asisa',
  'Cigna', 'Generali', 'Caser', 'Néctar', 'Sin seguro - SaludOnNet'
];

export const providers = [
  {
    id: 1,
    name: 'Hospital Universitario HM Sanchinarro',
    city: 'Madrid',
    address: 'C/ de Oña, 10, 28050',
    rating: 4.8,
    reviewCount: 342,
    specialtyIds: [1, 3, 4, 5],
    acceptedInsurance: ['Sanitas', 'Adeslas', 'DKV', 'AXA', 'Mapfre', 'Sin seguro - SaludOnNet'],
    image: null,
    allowsFreeCancel: true, // TODO: Set from database flag providers.allows_free_cancellation managed by ops team
    operatingHours: { monFri: { morning: ['09:00', '13:00'], afternoon: ['16:00', '19:00'] }, saturday: { morning: ['09:00', '12:00'], afternoon: null }, sunday: null },
  },
  {
    id: 2,
    name: 'Clínica Teknon',
    city: 'Barcelona',
    address: 'C/ de Vilana, 12, 08022',
    rating: 4.9,
    reviewCount: 521,
    specialtyIds: [1, 2, 3, 5, 8],
    acceptedInsurance: ['Sanitas', 'Adeslas', 'DKV', 'Asisa', 'Cigna', 'Sin seguro - SaludOnNet'],
    image: null,
    allowsFreeCancel: false,
    operatingHours: { monFri: { morning: ['09:00', '13:00'], afternoon: ['15:00', '19:00'] }, saturday: null, sunday: null },
  },
  {
    id: 3,
    name: 'Hospital Quirónsalud Valencia',
    city: 'Valencia',
    address: 'Av. de Blasco Ibáñez, 14, 46010',
    rating: 4.6,
    reviewCount: 198,
    specialtyIds: [1, 2, 4, 6, 7],
    acceptedInsurance: ['Sanitas', 'Adeslas', 'AXA', 'Asisa', 'Generali', 'Sin seguro - SaludOnNet'],
    image: null,
    allowsFreeCancel: true,
    operatingHours: { monFri: { morning: ['09:00', '13:00'], afternoon: ['16:00', '19:00'] }, saturday: { morning: ['09:00', '12:00'], afternoon: null }, sunday: null },
  },
  {
    id: 4,
    name: 'Centro Médico Teknon Excellence',
    city: 'Madrid',
    address: 'Paseo de la Castellana, 261, 28046',
    rating: 4.7,
    reviewCount: 267,
    specialtyIds: [2, 5, 6, 8],
    acceptedInsurance: ['Sanitas', 'DKV', 'AXA', 'Mapfre', 'Caser', 'Sin seguro - SaludOnNet'],
    image: null,
    allowsFreeCancel: false,
    operatingHours: { monFri: { morning: ['09:00', '14:00'], afternoon: null }, saturday: null, sunday: null },
  },
  {
    id: 5,
    name: 'Hospital Vithas Sevilla',
    city: 'Sevilla',
    address: 'C/ de la Salud, 7, 41013',
    rating: 4.5,
    reviewCount: 145,
    specialtyIds: [1, 3, 7, 8],
    acceptedInsurance: ['Adeslas', 'DKV', 'Asisa', 'Néctar', 'Generali', 'Sin seguro - SaludOnNet'],
    image: null,
    allowsFreeCancel: false,
    operatingHours: { monFri: { morning: ['09:00', '13:00'], afternoon: ['16:00', '19:00'] }, saturday: { morning: ['09:00', '12:00'], afternoon: null }, sunday: null },
  },
  {
    id: 6,
    name: 'Clínica Universidad de Navarra Madrid',
    city: 'Madrid',
    address: 'C/ del Marquesado de Sta. Marta, 1, 28027',
    rating: 4.9,
    reviewCount: 612,
    specialtyIds: [1, 2, 3, 4, 5, 6, 7, 8],
    acceptedInsurance: ['Sanitas', 'Adeslas', 'DKV', 'AXA', 'Cigna', 'Sin seguro - SaludOnNet'],
    image: null,
    allowsFreeCancel: false,
    operatingHours: { monFri: { morning: ['09:00', '13:00'], afternoon: ['15:00', '19:00'] }, saturday: { morning: ['09:00', '12:00'], afternoon: null }, sunday: null },
  },
];

// Spanish public holidays to skip (YYYY-MM-DD)
// TODO: Load from database or config for production
const SPANISH_HOLIDAYS = [
  '2026-04-02', // Jueves Santo
  '2026-04-03', // Viernes Santo
  '2026-04-06', // Lunes de Pascua (some regions)
  '2026-05-01', // Día del Trabajo
  '2026-10-12', // Día de la Hispanidad
  '2026-11-01', // Todos los Santos
  '2026-12-06', // Día de la Constitución
  '2026-12-08', // Inmaculada Concepción
  '2026-12-25', // Navidad
];

function isHoliday(dateObj) {
  return SPANISH_HOLIDAYS.includes(dateObj.toISOString().split('T')[0]);
}

// ── Generate availability slots for next 45 days ──
// Slots must be validated against clinic.operating_hours and clinic.services from database
function generateSlots(providerId) {
  const slots = [];
  const now = new Date();

  // Track guaranteed slots within first 7 days
  let guaranteedMorning = false;
  let guaranteedAfternoon = false;

  for (let dayOffset = 1; dayOffset < 45; dayOffset++) {
    const date = new Date(now);
    date.setDate(date.getDate() + dayOffset);
    const dateStr = date.toISOString().split('T')[0];

    // Skip Sundays and public holidays
    if (date.getDay() === 0 || isHoliday(date)) continue;

    const isSaturday = date.getDay() === 6;
    const isFirst7Days = dayOffset <= 7;

    // For first 7 days, guarantee 1 morning + 1 afternoon slot
    if (isFirst7Days && !isSaturday) {
      if (!guaranteedMorning) {
        slots.push({ date: dateStr, time: '10:00', available: true });
        guaranteedMorning = true;
      }
      if (!guaranteedAfternoon) {
        slots.push({ date: dateStr, time: '17:00', available: true });
        guaranteedAfternoon = true;
      }
    }

    // Random number of slots per day (1-4), fewer on Saturdays
    const numSlots = isSaturday
      ? Math.floor(Math.random() * 2) + 1
      : Math.floor(Math.random() * 4) + 1;

    const possibleHours = isSaturday
      ? [9, 10, 11, 12]
      : [9, 10, 11, 12, 13, 16, 17, 18, 19];

    // Shuffle and pick
    const shuffled = [...possibleHours].sort(() => 0.5 - Math.random());
    for (let i = 0; i < numSlots && i < shuffled.length; i++) {
      const minutes = Math.random() > 0.5 ? '00' : '30';
      const time = `${String(shuffled[i]).padStart(2, '0')}:${minutes}`;
      // Avoid exact duplicates with guaranteed slots
      if (!slots.some(s => s.date === dateStr && s.time === time)) {
        slots.push({ date: dateStr, time, available: true });
      }
    }
  }

  // Sort by date then time
  slots.sort((a, b) => a.date === b.date ? a.time.localeCompare(b.time) : a.date.localeCompare(b.date));
  return slots;
}

// Pre-generate availability per provider
export { generateSlots };
export const availability = {};
providers.forEach((p) => {
  availability[p.id] = generateSlots(p.id);
});

/**
 * Check if a specific slot is still available
 * TODO: Replace with real-time database query
 */
export function isSlotAvailable(providerId, date, time) {
  const slots = availability[providerId] || [];
  return slots.some(s => s.date === date && s.time === time && s.available === true);
}

// ── Price helpers ──
export function getConvenienceFee(slotDate) {
  const now = new Date();
  now.setHours(0, 0, 0, 0);
  const target = new Date(slotDate);
  target.setHours(0, 0, 0, 0);
  const diffDays = Math.round((target - now) / (1000 * 60 * 60 * 24));

  // Canonical Med Connect priority pricing (2026 Q2). Day buckets must
  // stay aligned with PRICING_TIERS in src/lib/slot-validation.js — the
  // DB-driven slot generator is the source of truth for live pricing,
  // this helper is just the mock fallback when the live data isn't loaded.
  //   0 – 7 días            → 29 €   (tier 1 — esta semana)
  //   8 – 14 días           → 19 €   (tier 2 — próxima semana)
  //   15 – 30 días          → 9,99 € (tier 3 — este mes)
  //   > 30 días             → 4,99 € (tier 4 — más adelante)
  if (diffDays <= 7)  return { amount: 29,    tier: 1, label: 'Cita esta semana' };
  if (diffDays <= 14) return { amount: 19,    tier: 2, label: 'Cita la próxima semana' };
  if (diffDays <= 30) return { amount: 9.99,  tier: 3, label: 'Cita este mes' };
  return                      { amount: 4.99, tier: 4, label: 'Cita más adelante' };
}

export function getServicesForSpecialty(specialtyId) {
  return services.filter((s) => s.specialtyId === Number(specialtyId));
}

export function getProvidersForSearch({ specialtyId, serviceId, city, insurance }) {
  return providers.filter((p) => {
    if (specialtyId && !p.specialtyIds.includes(Number(specialtyId))) return false;
    if (city && p.city !== city) return false;
    if (insurance && !p.acceptedInsurance.includes(insurance)) return false;
    return true;
  });
}

// ──────────────────────────────────────────────────
// Step 5: Advanced Referral Flow (Derivación Pro)
// ──────────────────────────────────────────────────

export const REFERRAL_STATES = {
  CREATED: 'created',
  PENDING: 'pending',
  DATA_COMPLETED: 'data_completed',
  PAYMENT_PENDING: 'payment_pending',
  CONFIRMED: 'confirmed',
  EXPIRED: 'expired',
};

/**
 * Generate a unique referral ID (e.g., "REF-ABC123XYZ")
 */
export function generateReferralId() {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  const randomPart = Array.from({ length: 9 }, () => chars.charAt(Math.floor(Math.random() * chars.length))).join('');
  return `REF-${randomPart}`;
}

/**
 * Create a new referral object
 * @param {Object} params - Referral parameters
 * @returns {Object} Referral object
 */
export function createReferral({
  type = 'externa', // 'interna' | 'externa'
  professionalEmail,
  professionName,
  patientEmail,
  providerId,
  serviceId,
  slotDate,
  slotTime,
  providerName,
  fee,
}) {
  const now = new Date();
  const lockInExpiresAt = new Date(now.getTime() + 30 * 60 * 1000); // 30 min warning
  const lockInWarningAt = new Date(now.getTime() + 60 * 60 * 1000); // 60 min actual timeout

  return {
    id: generateReferralId(),
    type,
    professionalEmail,
    professionName,
    patientEmail,
    patientName: null,
    patientPhone: null,
    patientAddress: null,
    providerId,
    serviceId,
    slotDate,
    slotTime,
    providerName,
    fee,
    state: REFERRAL_STATES.PENDING,
    createdAt: now.toISOString(),
    lockInExpiresAt: lockInExpiresAt.toISOString(),
    lockInWarningAt: lockInWarningAt.toISOString(),
    completedAt: null,
  };
}

/**
 * Calculate remaining time in milliseconds
 * @param {string} expiresAt - ISO timestamp
 * @returns {Object} { remainingMs, remainingSeconds, isExpired }
 */
export function calculateExpirationTime(expiresAt) {
  const now = new Date();
  const expiry = new Date(expiresAt);
  const remainingMs = expiry - now;
  const remainingSeconds = Math.max(0, Math.floor(remainingMs / 1000));
  const isExpired = remainingSeconds <= 0;

  return {
    remainingMs,
    remainingSeconds,
    isExpired,
    displayMinutes: Math.floor(remainingSeconds / 60),
    displaySeconds: remainingSeconds % 60,
  };
}

/**
 * Format referral status with color/badge
 * @param {string} state - Referral state
 * @returns {Object} { label, color, icon }
 */
export function getReferralStatusDisplay(state) {
  const statusMap = {
    [REFERRAL_STATES.PENDING]: { label: 'Lock-in Pendiente', color: 'yellow', icon: '⏱️' },
    [REFERRAL_STATES.DATA_COMPLETED]: { label: 'Datos Completados', color: 'blue', icon: '✓' },
    [REFERRAL_STATES.PAYMENT_PENDING]: { label: 'Esperando Pago', color: 'orange', icon: '💳' },
    [REFERRAL_STATES.CONFIRMED]: { label: 'Confirmada', color: 'green', icon: '✅' },
    [REFERRAL_STATES.EXPIRED]: { label: 'Expirada', color: 'red', icon: '❌' },
  };
  return statusMap[state] || { label: 'Desconocido', color: 'gray', icon: '?' };
}
