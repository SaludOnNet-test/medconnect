import { NextResponse } from 'next/server';
import { query, sql, DB_AVAILABLE } from '@/lib/db';
import { limits } from '@/lib/rateLimit';
import { internalError } from '@/lib/errors';
import { isBookableProcedure } from '@/lib/text';
import { PARTNER_CLINIC_IDS_SQL, isPartnerClinic } from '@/lib/partnerClinics';
// SaludOnNet video-consultation pilot — injects ~6 video providers
// into the response when the search lands on derma / uro / gine in
// Madrid. Returns [] for every other (specialty, city) combination
// so non-pilot listings stay untouched. Cleanup: delete this import
// + the inject block near the end of GET.
import { getVideoProviders, toClinicCardShape } from '@/lib/videoProviders';

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
  // Rate-limit: 60 req/min/IP. Search is the most expensive endpoint and
  // also the easiest to weaponise — a bot can fan out specialty/city pairs
  // with no auth and pin Azure SQL.
  const rl = await limits.clinicSearch.check(request);
  if (!rl.ok) {
    return NextResponse.json(
      { clinics: [], total: 0, source: 'rate_limited' },
      { status: 429, headers: rl.headers },
    );
  }

  const { searchParams } = new URL(request.url);
  const city           = searchParams.get('city') || '';
  const specialtyId    = searchParams.get('specialty') || '';
  const specialtySlug  = searchParams.get('specialtySlug') || '';
  const procedureSlug  = searchParams.get('procedureSlug') || '';
  const ratingMin      = parseFloat(searchParams.get('rating') || '0');
  const nameQuery      = searchParams.get('name') || '';
  const limit          = Math.min(parseInt(searchParams.get('limit') || '20'), 100);
  const offset         = Math.max(parseInt(searchParams.get('offset') || '0'), 0);
  // bbox=south,west,north,east — when set, only return clinics whose
  // coordinates fall inside the rectangle. Powers the search-v2 "refresh
  // results when the user pans/zooms the map" UX.
  const bboxParam      = searchParams.get('bbox') || '';

  // Belt-and-braces: the autocomplete already filters surgery procedures
  // out of its suggestions, but a hand-typed `procedureSlug=cirugia-...`
  // URL would otherwise still hit the DB. Reject early.
  if (procedureSlug && !isBookableProcedure(procedureSlug)) {
    return NextResponse.json({ clinics: [], total: 0, source: 'procedure_blocked' });
  }

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
    // Spatial filter — south,west,north,east. Only applied when all four
    // values parse cleanly so a malformed bbox can't silently drop the
    // entire result set.
    if (bboxParam) {
      const parts = bboxParam.split(',').map((s) => parseFloat(s));
      if (parts.length === 4 && parts.every((n) => Number.isFinite(n))) {
        const [south, west, north, east] = parts;
        where += ' AND c.latitude BETWEEN @south AND @north AND c.longitude BETWEEN @west AND @east';
        params.south = { type: sql.Decimal(10, 6), value: south };
        params.north = { type: sql.Decimal(10, 6), value: north };
        params.west  = { type: sql.Decimal(10, 6), value: west };
        params.east  = { type: sql.Decimal(10, 6), value: east };
      }
    }

    // Partner-first sort key. When the code-level allowlist
    // (PARTNER_CLINIC_IDS) has any clinic ids, emit a CASE that ranks
    // those ids above everything else. Safe to inline — the values are
    // integer literals from a code constant, never user input. Empty
    // allowlist falls through to `0` so the original tier ordering
    // (is_preferential, rating, name) decides alone.
    const partnerSortKey = PARTNER_CLINIC_IDS_SQL
      ? `(CASE WHEN c.id IN (${PARTNER_CLINIC_IDS_SQL}) THEN 1 ELSE 0 END)`
      : '0';

    // Single round-trip: COUNT(*) OVER() pulls the total alongside the page,
    // STRING_AGG inlines the specialties array. Replaces the previous
    // count + page + specialties N+1 (3 round trips → 1) and removes the
    // unsafe `IN (${idList})` SQL string concatenation.
    const sqlText = `
      SELECT
        c.id, c.name, c.city, c.province, c.address,
        c.rating, c.review_count, c.accepted_insurance, c.allows_free_cancel,
        c.latitude, c.longitude, c.description, c.telephone,
        c.small_picture_id, c.medium_picture_id, c.is_preferential,
        COUNT(*) OVER() AS total_count,
        (SELECT STRING_AGG(cs.specialty_slug, ',')
           FROM clinic_specialties cs
          WHERE cs.clinic_id = c.id) AS specialty_slugs
      FROM clinics c
      ${where}
      ORDER BY ${partnerSortKey} DESC, c.is_preferential DESC, c.rating DESC, c.name ASC
      OFFSET @offset ROWS FETCH NEXT @limit ROWS ONLY
    `;
    const result = await query(
      sqlText,
      { ...params, limit: { type: sql.Int, value: limit }, offset: { type: sql.Int, value: offset } },
    );

    const total = result.recordset[0]?.total_count || 0;
    const specialtiesByClinic = {};
    for (const r of result.recordset) {
      specialtiesByClinic[r.id] = (r.specialty_slugs || '')
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean);
    }

    const clinics = result.recordset.map((c) => ({
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
      // Med Connect partner — sorted to the top of the list and used by
      // the client's `displayProviders` sort so the partner-first
      // ordering survives the user switching to "Mejor valorados" /
      // "Más opiniones". Backed by `src/lib/partnerClinics.js`.
      isPartner: isPartnerClinic(c.id),
      hasRealSchedule: true,
    }));

    // SaludOnNet video-consultation pilot — append in-scope video
    // providers to the response so they render alongside DB clinics
    // on /especialistas and /search-v2 listings for the pilot
    // specialties + cities (currently derma + uro + gine in Madrid).
    // The pilot module returns [] when (specialty, city) is out of
    // scope, so non-pilot listings stay byte-identical to before.
    let videoExtras = [];
    try {
      const list = await getVideoProviders({ specialtySlug, city });
      videoExtras = list.map(toClinicCardShape);
    } catch (err) {
      console.warn('[search] video pilot append failed (continuing):', err?.message);
    }
    const combinedClinics = videoExtras.length > 0 ? [...clinics, ...videoExtras] : clinics;
    const combinedTotal = total + videoExtras.length;

    return NextResponse.json({
      clinics: combinedClinics,
      total: combinedTotal,
      offset,
      limit,
      source: 'db',
    });
  } catch (err) {
    return internalError(err, '[GET /api/clinics/search]');
  }
}
