import { NextResponse } from 'next/server';
import { query, sql, DB_AVAILABLE } from '@/lib/db';

const SPECIALTY_SLUG_MAP = {
  1: ['traumatologia', 'cirugia-ortopedica'],
  2: ['dermatologia'],
  3: ['ginecologia', 'obstetricia'],
  4: ['oftalmologia'],
  5: ['cardiologia'],
  6: ['urologia'],
  7: ['otorrinolaringologia', 'orl'],
  8: ['digestivo', 'gastroenterologia'],
};

function slugsToSpecialtyIds(slugs) {
  const ids = new Set();
  for (const slug of slugs) {
    const lower = slug.toLowerCase();
    for (const [id, keywords] of Object.entries(SPECIALTY_SLUG_MAP)) {
      if (keywords.some((kw) => lower.includes(kw))) ids.add(Number(id));
    }
  }
  return [...ids];
}

export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const city           = searchParams.get('city') || '';
  const specialtyId    = searchParams.get('specialty') || '';
  const specialtySlug  = searchParams.get('specialtySlug') || '';
  const procedureSlug  = searchParams.get('procedureSlug') || '';
  const ratingMin      = parseFloat(searchParams.get('rating') || '0');
  const nameQuery      = searchParams.get('name') || '';
  const limit          = Math.min(parseInt(searchParams.get('limit') || '20'), 100);
  const offset         = Math.max(parseInt(searchParams.get('offset') || '0'), 0);

  if (!DB_AVAILABLE) return NextResponse.json({ clinics: [], total: 0, source: 'no-db' });

  try {
    let where = 'WHERE 1=1';
    const params = {};

    if (city) {
      where += ' AND (LOWER(c.city) LIKE LOWER(@city) OR LOWER(c.province) LIKE LOWER(@city))';
      params.city = { type: sql.NVarChar(100), value: `%${city}%` };
    }
    if (ratingMin > 0) {
      where += ' AND c.rating >= @ratingMin';
      params.ratingMin = { type: sql.Decimal(5, 2), value: ratingMin };
    }
    if (nameQuery) {
      where += ' AND LOWER(c.name) LIKE LOWER(@name)';
      params.name = { type: sql.NVarChar(255), value: `%${nameQuery}%` };
    }
    // Filter by real specialty slug (from SON DB)
    if (specialtySlug) {
      params.specSlug = { type: sql.NVarChar(100), value: `%${specialtySlug}%` };
      where += ` AND EXISTS (SELECT 1 FROM clinic_specialties cs2 WHERE cs2.clinic_id = c.id AND cs2.specialty_slug LIKE @specSlug)`;
    } else if (specialtyId) {
      // Fallback: map mock ID to slugs
      const slugs = SPECIALTY_SLUG_MAP[Number(specialtyId)] || [];
      if (slugs.length > 0) {
        const slugConditions = slugs.map((_, i) => `cs2.specialty_slug LIKE @spec${i}`).join(' OR ');
        slugs.forEach((s, i) => { params[`spec${i}`] = { type: sql.NVarChar(100), value: `%${s}%` }; });
        where += ` AND EXISTS (SELECT 1 FROM clinic_specialties cs2 WHERE cs2.clinic_id = c.id AND (${slugConditions}))`;
      }
    }
    if (procedureSlug) {
      params.procSlug = { type: sql.NVarChar(200), value: `%${procedureSlug}%` };
      where += ` AND EXISTS (SELECT 1 FROM clinic_procedures cp2 WHERE cp2.clinic_id = c.id AND cp2.procedure_slug LIKE @procSlug)`;
    }

    // Count total for pagination
    const countResult = await query(`SELECT COUNT(*) as total FROM clinics c ${where}`, params);
    const total = countResult.recordset[0].total;

    // Fetch page
    const clinicsResult = await query(
      `SELECT c.id, c.name, c.city, c.province, c.address,
              c.rating, c.review_count, c.accepted_insurance, c.allows_free_cancel,
              c.latitude, c.longitude, c.description, c.telephone,
              c.small_picture_id, c.medium_picture_id, c.is_preferential
       FROM clinics c
       ${where}
       ORDER BY c.is_preferential DESC, c.rating DESC, c.name ASC
       OFFSET @offset ROWS FETCH NEXT @limit ROWS ONLY`,
      { ...params, limit: { type: sql.Int, value: limit }, offset: { type: sql.Int, value: offset } }
    );

    const clinicIds = clinicsResult.recordset.map((r) => r.id);
    const specialtiesByClinic = {};

    if (clinicIds.length > 0) {
      const idList = clinicIds.join(',');
      const specsResult = await query(
        `SELECT clinic_id, specialty_slug FROM clinic_specialties WHERE clinic_id IN (${idList})`
      );
      for (const row of specsResult.recordset) {
        if (!specialtiesByClinic[row.clinic_id]) specialtiesByClinic[row.clinic_id] = [];
        specialtiesByClinic[row.clinic_id].push(row.specialty_slug);
      }
    }

    const clinics = clinicsResult.recordset.map((c) => ({
      id: c.id,
      name: c.name,
      city: c.city || '',
      province: c.province || '',
      address: c.address || '',
      rating: c.rating ? parseFloat(c.rating) : 4.2,
      reviewCount: c.review_count || 0,
      acceptedInsurance: c.accepted_insurance
        ? c.accepted_insurance.split(',').map((s) => s.trim())
        : ['Sin seguro - SaludOnNet'],
      allowsFreeCancel: !!c.allows_free_cancel,
      specialtyIds: slugsToSpecialtyIds(specialtiesByClinic[c.id] || []),
      lat: c.latitude ? parseFloat(c.latitude) : null,
      lng: c.longitude ? parseFloat(c.longitude) : null,
      description: c.description || null,
      telephone: c.telephone || null,
      smallPictureId: c.small_picture_id || null,
      mediumPictureId: c.medium_picture_id || null,
      isPreferential: !!c.is_preferential,
      hasRealSchedule: true,
    }));

    return NextResponse.json({ clinics, total, offset, limit, source: 'db' });
  } catch (err) {
    console.error('clinics/search error:', err);
    return NextResponse.json({ clinics: [], total: 0, source: 'error', error: err.message }, { status: 500 });
  }
}
