import { NextResponse } from 'next/server';
import { query, sql, DB_AVAILABLE } from '@/lib/db';
import { isBookableProcedure } from '@/lib/text';

/**
 * Returns the catalogue of medical procedures (actos médicos) offered by a
 * specific clinic, with the SON-catalogue price for each one. Used by the
 * booking modal to force every patient to pick a procedure before booking.
 *
 * Query params:
 *   - specialtySlug (optional): filter to a single specialty
 */
export async function GET(request, { params }) {
  const { id } = await params;
  const clinicId = parseInt(id, 10);
  if (isNaN(clinicId)) {
    return NextResponse.json({ procedures: [], error: 'Invalid clinic ID' }, { status: 400 });
  }

  if (!DB_AVAILABLE) return NextResponse.json({ procedures: [] });

  const url = new URL(request.url);
  const specialtySlug = url.searchParams.get('specialtySlug') || '';

  try {
    const params = { clinicId: { type: sql.Int, value: clinicId } };
    let where = 'clinic_id = @clinicId AND procedure_name IS NOT NULL AND procedure_name <> \'\'';
    if (specialtySlug) {
      // BUG FIX 2026-05-28: previously used exact equality (`= @specialtySlug`).
      // The DB stores long slugs like `obstetricia-y-ginecologia` and
      // `traumatologia-y-cirugia-ortopedica`, but the URL passes short
      // slugs (`ginecologia`, `traumatologia`) from the SEO landing pages.
      // Exact match returned 0 rows for those specialties, leaving the
      // booking modal with no procedure → no procedureSlug auto-select →
      // "Confirmar reserva" button never appears → users bailed out and
      // book_started never fired. Switching to LIKE %slug% matches the
      // pattern used by /api/clinics/search and accepts both slug forms.
      where += ' AND specialty_slug LIKE @specialtySlug';
      params.specialtySlug = { type: sql.NVarChar(100), value: `%${specialtySlug}%` };
    }

    const result = await query(
      `SELECT procedure_slug, procedure_name, specialty_slug, specialty_name, price
       FROM clinic_procedures
       WHERE ${where}
       ORDER BY procedure_name`,
      params,
    );

    // Round catalogue prices to the nearest euro before they reach the
    // patient. Charged amount equals displayed amount (Stripe is also
    // billed the rounded total) — keeps "46 €" honest and avoids the
    // "muy calculados" 45,50 €-style numbers Jesús flagged in 2026-05.
    return NextResponse.json({
      procedures: result.recordset
        .filter((r) => isBookableProcedure(r.procedure_name))
        .map((r) => ({
          slug: r.procedure_slug,
          name: r.procedure_name,
          specialtySlug: r.specialty_slug,
          specialtyName: r.specialty_name,
          price: r.price != null ? Math.round(Number(r.price)) : null,
        })),
    });
  } catch (err) {
    console.error('clinic procedures error:', err);
    return NextResponse.json({ procedures: [], error: err.message }, { status: 500 });
  }
}
