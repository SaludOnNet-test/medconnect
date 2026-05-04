import { NextResponse } from 'next/server';
import { query, DB_AVAILABLE } from '@/lib/db';

export async function GET() {
  if (!DB_AVAILABLE) return NextResponse.json({ specialties: [], cities: [], procedures: [] });

  try {
    const [specsResult, citiesResult, procsResult] = await Promise.all([
      query(`SELECT DISTINCT specialty_slug, specialty_name
             FROM clinic_specialties
             WHERE specialty_name IS NOT NULL AND specialty_name != ''
             ORDER BY specialty_name`),
      // Location filter is province-level across the whole site (we don't
       // want one province to fragment into a long list of small towns).
       // The shape is preserved (`{ city, province }` per row) so existing
       // consumers don't break — `city` here just carries the province
       // name. /api/clinics/search?city=<value> already matches against
       // either column, so a province name routes correctly.
       query(`SELECT DISTINCT province
              FROM clinics
              WHERE province IS NOT NULL AND province != ''
              ORDER BY province`),
      query(`SELECT DISTINCT procedure_slug, procedure_name, specialty_slug, specialty_name
             FROM clinic_procedures
             WHERE procedure_name IS NOT NULL AND procedure_name != ''
             ORDER BY procedure_name`),
    ]);

    return NextResponse.json({
      specialties: specsResult.recordset.map((r) => ({
        slug: r.specialty_slug,
        name: r.specialty_name,
      })),
      cities: citiesResult.recordset.map((r) => ({
        // Field carries the province name now — keeping the legacy `city`
        // key avoids touching every consumer in one go.
        city: r.province,
        province: r.province,
      })),
      procedures: procsResult.recordset.map((r) => ({
        slug: r.procedure_slug,
        name: r.procedure_name,
        specialtySlug: r.specialty_slug,
        specialtyName: r.specialty_name,
      })),
    });
  } catch (err) {
    console.error('filters error:', err);
    return NextResponse.json({ specialties: [], cities: [], procedures: [], error: err.message });
  }
}
