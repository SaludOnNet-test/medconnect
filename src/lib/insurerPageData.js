/**
 * insurerPageData.js — server-side data for /aseguradoras/[aseguradora]/[especialidad].
 *
 * Until 2026-11 the insurer×specialty pages rendered their clinic list only
 * on the client ("Buscando especialistas disponibles…"), so Google saw ~290
 * words that were 97 % identical across the 144 pages. This module runs at
 * build time and returns the data the page renders in its initial HTML:
 *   - the cities with most clinics for the specialty (with 3 example clinics
 *     each), which double as entry points into the booking flow;
 *   - the real price range of a plain consultation of that specialty in the
 *     SaludOnNet catalogue, shown as the "if your policy doesn't cover it"
 *     reference.
 *
 * Every query is best-effort: on any DB error the page renders without the
 * block instead of failing the build.
 */
import { getPool, DB_AVAILABLE, sql } from '@/lib/db';
import { CITY_MAP } from '@/lib/seoData';

const MAX_CITIES = 8;
const CLINICS_PER_CITY = 3;

function specialtyVariants(specialtySlug) {
  return specialtySlug === 'ginecologia'
    ? ['%ginecologia%', '%obstetricia%']
    : [`%${specialtySlug}%`];
}

function normalizeCity(name) {
  return String(name || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .trim();
}

// clinics.city value → landing slug, only for the cities that have
// /especialistas/[especialidad]/[ciudad] landings.
const LANDING_CITY_BY_NAME = Object.fromEntries(
  Object.entries(CITY_MAP).map(([slug, name]) => [normalizeCity(name), slug]),
);

export function landingCitySlug(cityName) {
  return LANDING_CITY_BY_NAME[normalizeCity(cityName)] || null;
}

export async function getInsurerSpecialtyData(specialtySlug, insurerDbName) {
  if (!DB_AVAILABLE) return { cities: [], consultationPrice: null };
  try {
    const pool = await getPool();
    const variants = specialtyVariants(specialtySlug);

    const specialtyCondition = (alias) =>
      variants.map((_, i) => `${alias}.specialty_slug LIKE @v${i}`).join(' OR ');
    const withInputs = (req) => {
      variants.forEach((v, i) => req.input(`v${i}`, sql.NVarChar(100), v));
      return req;
    };

    const citiesReq = withInputs(pool.request())
      .input('insurer', sql.NVarChar(120), `%${insurerDbName}%`)
      .input('maxCities', sql.Int, MAX_CITIES)
      .input('perCity', sql.Int, CLINICS_PER_CITY);
    const citiesResult = await citiesReq.query(`
      WITH matching AS (
        SELECT c.id, c.name, c.city, c.rating
        FROM clinics c
        WHERE c.city IS NOT NULL AND LTRIM(RTRIM(c.city)) <> ''
          AND (',' + c.accepted_insurance + ',') LIKE ('%,' + @insurer + ',%')
          AND EXISTS (
            SELECT 1 FROM clinic_specialties cs
            WHERE cs.clinic_id = c.id AND (${specialtyCondition('cs')})
          )
      ),
      top_cities AS (
        SELECT TOP (@maxCities) city, COUNT(*) AS clinic_count
        FROM matching
        GROUP BY city
        ORDER BY COUNT(*) DESC, city
      ),
      ranked AS (
        SELECT m.city, m.name,
               ROW_NUMBER() OVER (PARTITION BY m.city ORDER BY m.rating DESC, m.name) AS rn
        FROM matching m
        JOIN top_cities t ON t.city = m.city
      )
      SELECT t.city, t.clinic_count, r.name
      FROM top_cities t
      JOIN ranked r ON r.city = t.city AND r.rn <= @perCity
      ORDER BY t.clinic_count DESC, t.city, r.rn
    `);

    const byCity = new Map();
    for (const row of citiesResult.recordset) {
      if (!byCity.has(row.city)) {
        byCity.set(row.city, {
          city: row.city,
          clinicCount: Number(row.clinic_count),
          landingSlug: landingCitySlug(row.city),
          exampleClinics: [],
        });
      }
      byCity.get(row.city).exampleClinics.push(row.name);
    }

    const priceResult = await withInputs(pool.request()).query(`
      SELECT MIN(cp.price) AS min_price, MAX(cp.price) AS max_price, COUNT(*) AS n
      FROM clinic_procedures cp
      WHERE (${specialtyCondition('cp')})
        AND cp.procedure_name LIKE 'Consulta de%'
        AND cp.procedure_name NOT LIKE '%+%'
        AND cp.price > 0
    `);
    const p = priceResult.recordset[0];
    const consultationPrice = p && Number(p.n) > 0
      ? { min: Math.round(Number(p.min_price)), max: Math.round(Number(p.max_price)) }
      : null;

    return { cities: [...byCity.values()], consultationPrice };
  } catch {
    return { cities: [], consultationPrice: null };
  }
}
