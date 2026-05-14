// Holidays calendar — Spain national + CCAA Madrid + Madrid municipio.
// 2026 and 2027 only. Update yearly.
//
// Sources:
//  - BOE 2025-10 (calendario laboral 2026)
//  - Comunidad de Madrid (orden de calendario laboral 2026 CCAA)
//  - Ayuntamiento de Madrid (festivos locales 2026: San Isidro 15-may,
//    Virgen de la Almudena 9-nov)
//  - 2027 dates are projected from the standard pattern and will be
//    verified against the BOE when published.
//
// The slot generator imports `getHolidaysForCity(city)` and excludes
// matching YYYY-MM-DD strings from `isBusinessDay`. Today the only city
// with operating clinics is Madrid; the structure is designed so a future
// city (Barcelona, Valencia…) drops in as a new array + map entry without
// touching the slot generator.

export const SPAIN_NATIONAL = [
  // 2026
  '2026-01-01', // Año Nuevo
  '2026-01-06', // Reyes
  '2026-04-02', // Jueves Santo (festivo en buena parte del país)
  '2026-04-03', // Viernes Santo
  '2026-04-06', // Lunes de Pascua (CCAA varias; lo dejamos en nacional histórico)
  '2026-05-01', // Día del Trabajador
  '2026-08-15', // Asunción
  '2026-10-12', // Hispanidad
  '2026-11-01', // Todos los Santos
  '2026-12-06', // Día de la Constitución
  '2026-12-08', // Inmaculada
  '2026-12-25', // Navidad
  // 2027
  '2027-01-01',
  '2027-01-06',
  '2027-03-25', // Jueves Santo
  '2027-03-26', // Viernes Santo
  '2027-05-01',
  '2027-08-16', // Asunción (15-ago cae domingo, traslado al 16)
  '2027-10-12',
  '2027-11-01',
  '2027-12-06',
  '2027-12-08',
  '2027-12-25',
];

export const MADRID_CCAA = [
  // 2026
  '2026-05-02', // Día de la Comunidad de Madrid
  // 2027
  '2027-05-03', // 2-may cae domingo, traslado al lunes 3
];

export const MADRID_MUNICIPIO = [
  // 2026
  '2026-05-15', // San Isidro Labrador (patrón de Madrid)
  '2026-11-09', // Nuestra Señora de la Almudena
  // 2027
  '2027-05-15',
  '2027-11-09',
];

// Map of city (case-insensitive) → array of YYYY-MM-DD strings.
// Each city's list is the union of national + CCAA + municipio.
const CITY_HOLIDAYS = {
  madrid: [...SPAIN_NATIONAL, ...MADRID_CCAA, ...MADRID_MUNICIPIO],
};

/**
 * Returns the full list of holidays for a given city. Falls back to the
 * national list when the city isn't mapped — that's the safest default for
 * a new clinic in an unconfigured city (a few extra slots open vs blocking
 * everything).
 *
 * City lookup is case-insensitive and trim-tolerant ("Madrid" / "madrid"
 * / " Madrid " all resolve).
 */
export function getHolidaysForCity(city) {
  const key = String(city || '').trim().toLowerCase();
  return CITY_HOLIDAYS[key] || SPAIN_NATIONAL;
}

/**
 * True when `dateStr` (YYYY-MM-DD) is a holiday in the given city.
 */
export function isHolidayInCity(dateStr, city) {
  return getHolidaysForCity(city).includes(dateStr);
}
