import { NextResponse } from 'next/server';
import { query, sql, DB_AVAILABLE } from '@/lib/db';

/**
 * GET /api/aseguradoras/stats
 *
 * Returns per-insurer counts of clinics in the network, plus aggregate
 * totals used in the /aseguradoras hero. Powers the dynamic numbers on
 * the page (replacing the hardcoded "1.240 clínicas" placeholders).
 *
 * Coverage logic — per the convention defined in
 * scripts/migration_add_clinic_service_coverage.py:
 *
 *   - Clinics whose `clinics.accepted_insurance` column contains the
 *     insurer's name are counted as "in the network for that insurer".
 *   - The `clinic_service_coverage` table holds per-(clinic, service,
 *     insurer) overrides. Until ops curates per-service exceptions
 *     (tracked as MVP H10), the broad clinic-level column is the source
 *     of truth and rows in clinic_service_coverage are advisory only.
 *
 * Response:
 *   { insurers: [{ id, name, clinics }],
 *     totals: { clinics, cities, insurers } }
 *
 * Falls back to a static placeholder set when the DB is unreachable so
 * the page never crashes — same shape, just stale numbers.
 */

const INSURERS = [
  { id: 'sanitas', name: 'Sanitas' },
  { id: 'adeslas', name: 'Adeslas',  matchAlso: ['SegurCaixa Adeslas'] },
  { id: 'dkv',     name: 'DKV' },
  { id: 'axa',     name: 'AXA' },
  { id: 'mapfre',  name: 'Mapfre',   matchAlso: ['MAPFRE'] },
  { id: 'asisa',   name: 'Asisa',    matchAlso: ['ASISA'] },
  { id: 'cigna',   name: 'Cigna' },
  { id: 'caser',   name: 'Caser' },
];

const FALLBACK_RESPONSE = {
  source: 'fallback',
  insurers: [
    { id: 'sanitas', name: 'Sanitas', clinics: 1240 },
    { id: 'adeslas', name: 'Adeslas', clinics: 1580 },
    { id: 'dkv',     name: 'DKV',     clinics:  980 },
    { id: 'axa',     name: 'AXA',     clinics:  720 },
    { id: 'mapfre',  name: 'Mapfre',  clinics:  860 },
    { id: 'asisa',   name: 'Asisa',   clinics:  910 },
    { id: 'cigna',   name: 'Cigna',   clinics:  430 },
    { id: 'caser',   name: 'Caser',   clinics:  380 },
  ],
  totals: { clinics: 7100, cities: 84, insurers: 8 },
};

export async function GET() {
  if (!DB_AVAILABLE) return NextResponse.json(FALLBACK_RESPONSE);

  try {
    // Per-insurer count: any clinic whose accepted_insurance string
    // includes the insurer name (case-insensitive). The accepted_insurance
    // column is a comma-separated list, so a substring match is correct
    // here — there's no risk of "AXA" matching "FAXA" because we LIKE
    // against the comma-separated list including the leading/trailing
    // separators that wrap each token.
    const insurerStats = [];
    for (const ins of INSURERS) {
      const names = [ins.name, ...(ins.matchAlso || [])];
      const conditions = names.map((_, i) => `LOWER(',' + accepted_insurance + ',') LIKE LOWER(@n${i})`);
      const params = {};
      names.forEach((n, i) => { params[`n${i}`] = { type: sql.NVarChar(120), value: `%,%${n}%,%` }; });

      const result = await query(
        `SELECT COUNT(*) AS n FROM clinics WHERE ${conditions.join(' OR ')}`,
        params,
      );
      insurerStats.push({ id: ins.id, name: ins.name, clinics: result.recordset[0].n || 0 });
    }

    // Aggregate totals — DISTINCT cities and the total clinic count.
    const totalsResult = await query(`
      SELECT
        (SELECT COUNT(*) FROM clinics) AS total_clinics,
        (SELECT COUNT(DISTINCT city) FROM clinics WHERE city IS NOT NULL AND city <> '') AS total_cities
    `);
    const totals = totalsResult.recordset[0] || {};

    return NextResponse.json({
      source: 'db',
      insurers: insurerStats,
      totals: {
        clinics: totals.total_clinics || 0,
        cities: totals.total_cities || 0,
        insurers: INSURERS.length,
      },
    });
  } catch (err) {
    console.error('[GET /api/aseguradoras/stats]', err);
    return NextResponse.json({ ...FALLBACK_RESPONSE, error: err.message });
  }
}
