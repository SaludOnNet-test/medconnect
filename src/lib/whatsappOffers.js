// ---------------------------------------------------------------------------
// Concrete offers for the WhatsApp bot.
//
// 2026-08-31 — Feedback from the 23-ago conversation (phone 34677103856):
// the patient asked three times for "precio" and "dirección" and the bot kept
// answering "lo verás al entrar en el link". It never named a clinic, never
// gave an address and never gave a total. This module is the data source that
// lets it answer with a real example: clinic + address + first available slot
// + priority fee + procedure price + total for a patient with no insurance.
//
// Exposed to Claude as the `buscar_disponibilidad` tool (see
// src/app/api/whatsapp/webhook/route.js). Read-only, best-effort: every
// failure degrades to an empty offer list and the bot falls back to the link.
// ---------------------------------------------------------------------------
import { getPool, DB_AVAILABLE } from '@/lib/db';
import sql from 'mssql';
import { generateSlotsForClinic } from '@/lib/slot-validation';
import { applyPartnerDiscount } from '@/lib/pricing';
import { isPartnerClinic, PARTNER_CLINIC_IDS_SQL } from '@/lib/partnerClinics';
import { isBookableProcedure } from '@/lib/text';
import { toSpecialtySlug } from '@/lib/whatsapp';

// How many clinics we pull slots for before picking the best offers. Six is
// enough to almost always yield a bookable slot without turning one WhatsApp
// turn into a heavy query — the slot generator runs in-process per clinic.
const MAX_CANDIDATE_CLINICS = 6;

// Default city when the patient never said one. Madrid is where the partner
// clinic and most of the sellable inventory live.
const DEFAULT_CITY = 'Madrid';

const dateFormatter = new Intl.DateTimeFormat('es-ES', {
  weekday: 'long',
  day: 'numeric',
  month: 'long',
  timeZone: 'Europe/Madrid',
});

// "viernes, 11 de septiembre" — the leading weekday reads naturally inside a
// WhatsApp sentence ("la primera cita es el viernes 11 de septiembre").
export function formatSlotDate(dateStr) {
  if (!dateStr) return '';
  const [y, m, d] = String(dateStr).split('-').map(Number);
  if (!y || !m || !d) return String(dateStr);
  // Midday UTC keeps the date stable regardless of DST when formatted in Madrid.
  return dateFormatter.format(new Date(Date.UTC(y, m - 1, d, 12))).replace(',', '');
}

function euros(n) {
  const value = Number(n) || 0;
  return Number.isInteger(value) ? `${value} €` : `${value.toFixed(2).replace('.', ',')} €`;
}

// One self-contained sentence per offer. Pre-rendering it here (rather than
// letting the model assemble the numbers) keeps prices and addresses exact —
// the model only has to copy the line into its reply.
export function buildOfferSummary(offer) {
  const parts = [
    `${offer.clinicName} (${offer.address || offer.city || 'dirección por confirmar'})`,
    `primera cita: ${formatSlotDate(offer.slotDate)} a las ${offer.slotTime}`,
    `tarifa de prioridad ${euros(offer.priorityFee)}`,
  ];
  if (offer.procedurePrice != null) {
    parts.push(`${offer.procedureName}: ${euros(offer.procedurePrice)}`);
    parts.push(`total sin seguro ${euros(offer.totalWithoutInsurance)}`);
  }
  parts.push(`con seguro solo pagas la tarifa de prioridad (${euros(offer.priorityFee)})`);
  return parts.join(' · ');
}

function buildOfferLink({ specialtySlug, city, clinicName }) {
  const base = process.env.NEXT_PUBLIC_SITE_URL || 'https://medconnect.es';
  const params = new URLSearchParams({ source: 'whatsapp' });
  if (specialtySlug) params.set('specialtySlug', specialtySlug);
  if (city) params.set('city', city);
  if (clinicName) params.set('providerName', clinicName);
  return `${base}/search-v2?${params.toString()}`;
}

/**
 * findConcreteOffers — real, bookable examples for a (specialty, city) pair.
 *
 * Returns at most `limit` offers, soonest slot first, each carrying the
 * clinic name + address, the first sellable slot, the priority fee actually
 * charged for that slot (partner discount applied) and, when the clinic has
 * the procedure in the SON catalogue, its price and the sin-seguro total.
 *
 * Never throws: any DB problem returns [].
 */
export async function findConcreteOffers({ specialty, city, limit = 2 } = {}) {
  if (!DB_AVAILABLE) return [];
  const specialtySlug = toSpecialtySlug(specialty);
  if (!specialtySlug) return [];
  const searchCity = (city || '').trim() || DEFAULT_CITY;

  try {
    const pool = await getPool();

    // 1. Candidate clinics — same ordering as /api/clinics/search so the bot
    //    recommends what the patient would see at the top of the listing.
    //
    //    Two passes on the city: exact match first, province LIKE only as a
    //    fallback. /api/clinics/search matches the province too, which is
    //    right for a map the patient can pan — but over WhatsApp answering
    //    "gynaecologist in Madrid" with a clinic in Ajalvir (30 km out) reads
    //    as a bad recommendation. Exact city first keeps the example credible.
    const partnerSortKey = PARTNER_CLINIC_IDS_SQL
      ? `(CASE WHEN c.id IN (${PARTNER_CLINIC_IDS_SQL}) THEN 1 ELSE 0 END)`
      : '0';
    const candidateSql = (cityClause) => `
      SELECT TOP (@top) c.id, c.name, c.address, c.city, c.rating
      FROM clinics c
      WHERE ${cityClause}
        AND EXISTS (
          SELECT 1 FROM clinic_specialties cs
          WHERE cs.clinic_id = c.id AND cs.specialty_slug LIKE @slug
        )
      ORDER BY ${partnerSortKey} DESC, c.is_preferential DESC, c.rating DESC, c.name ASC
    `;
    const runCandidates = (cityClause, cityValue) => pool.request()
      .input('city', sql.NVarChar(100), cityValue)
      .input('slug', sql.NVarChar(100), `%${specialtySlug}%`)
      .input('top', sql.Int, MAX_CANDIDATE_CLINICS)
      .query(candidateSql(cityClause));

    let clinicsResult = await runCandidates('LOWER(c.city) = LOWER(@city)', searchCity);
    if (!clinicsResult.recordset.length) {
      clinicsResult = await runCandidates(
        '(LOWER(c.city) LIKE LOWER(@city) OR LOWER(c.province) LIKE LOWER(@city))',
        `%${searchCity}%`,
      );
    }
    const clinics = clinicsResult.recordset;
    if (!clinics.length) return [];

    // Ids come from the DB, not from user input — safe to inline for the
    // IN (...) lookups below, same pattern as /api/clinics/batch-slots.
    const ids = clinics.map((c) => Number(c.id)).filter(Number.isFinite);
    const idList = ids.join(',');

    // 2. Opening hours + already-taken slots, one round trip each.
    const schedulesByClinic = {};
    ids.forEach((id) => { schedulesByClinic[id] = []; });
    const schedulesResult = await pool.request().query(
      `SELECT clinic_id, day_of_week, start_time, end_time, is_available
       FROM clinic_schedules
       WHERE clinic_id IN (${idList}) AND is_available = 1
       ORDER BY clinic_id, day_of_week, start_time`,
    );
    for (const row of schedulesResult.recordset) {
      if (!schedulesByClinic[row.clinic_id]) schedulesByClinic[row.clinic_id] = [];
      schedulesByClinic[row.clinic_id].push(row);
    }

    const bookedKeys = new Set();
    try {
      const today = new Date().toISOString().slice(0, 10);
      const bookingsResult = await pool.request()
        .input('today', sql.NVarChar(10), today)
        .query(
          `SELECT provider_id, slot_date, slot_time
           FROM bookings
           WHERE provider_id IN (${idList})
             AND status IN ('confirmed','pending','awaiting_voucher')
             AND slot_date >= @today`,
        );
      for (const row of bookingsResult.recordset) {
        if (!row.provider_id || !row.slot_date || !row.slot_time) continue;
        bookedKeys.add(`${row.provider_id}|${row.slot_date}|${row.slot_time}`);
      }
    } catch (bErr) {
      // Worst case we quote a slot that was just taken — the booking flow
      // re-checks before charging. Better than quoting nothing.
      console.error('[whatsappOffers] bookings lookup failed (continuing):', bErr?.message);
    }

    // 3. Cheapest bookable procedure per clinic for this specialty — the
    //    "acto médico" a patient without insurance also pays for.
    const procedureByClinic = {};
    try {
      const procResult = await pool.request()
        .input('slug', sql.NVarChar(100), `%${specialtySlug}%`)
        .query(
          `SELECT clinic_id, procedure_name, price
           FROM clinic_procedures
           WHERE clinic_id IN (${idList})
             AND specialty_slug LIKE @slug
             AND procedure_name IS NOT NULL AND procedure_name <> ''
             AND price IS NOT NULL`,
        );
      for (const row of procResult.recordset) {
        if (!isBookableProcedure(row.procedure_name)) continue;
        const price = Math.round(Number(row.price));
        if (!Number.isFinite(price) || price <= 0) continue;
        const current = procedureByClinic[row.clinic_id];
        if (!current || price < current.price) {
          procedureByClinic[row.clinic_id] = { name: row.procedure_name, price };
        }
      }
    } catch (pErr) {
      // No catalogue price → the offer still carries the priority fee, and
      // the bot says the consultation price is confirmed at the clinic.
      console.error('[whatsappOffers] procedure lookup failed (continuing):', pErr?.message);
    }

    // 4. Earliest sellable slot per clinic → one offer each.
    const offers = [];
    for (const clinic of clinics) {
      const { slots } = generateSlotsForClinic(
        clinic.id,
        schedulesByClinic[clinic.id],
        { city: clinic.city || searchCity, bookedKeys, tierOneMaxSlots: 1 },
      );
      const slot = slots[0];
      if (!slot) continue;

      const priorityFee = applyPartnerDiscount(Number(slot.price) || 0, clinic.id);
      const procedure = procedureByClinic[clinic.id] || null;
      const offer = {
        clinicId: clinic.id,
        clinicName: clinic.name,
        address: clinic.address || null,
        city: clinic.city || searchCity,
        rating: clinic.rating != null ? Number(clinic.rating) : null,
        isPartner: isPartnerClinic(clinic.id),
        slotDate: slot.date,
        slotTime: slot.time,
        tier: slot.tier,
        priorityFee,
        procedureName: procedure?.name ?? null,
        procedurePrice: procedure?.price ?? null,
        totalWithoutInsurance: procedure ? priorityFee + procedure.price : null,
        link: buildOfferLink({ specialtySlug, city: clinic.city || searchCity, clinicName: clinic.name }),
      };
      offer.summary = buildOfferSummary(offer);
      offers.push(offer);
    }

    // Partner clinics first (standing agreement + direct agenda management —
    // the same reason /search-v2 pins them to the top), then soonest slot.
    // Without the partner key a clinic with an earlier hole pushes Cea out of
    // the two offers we hand the bot.
    offers.sort((a, b) => {
      if (a.isPartner !== b.isPartner) return a.isPartner ? -1 : 1;
      if (a.slotDate !== b.slotDate) return a.slotDate.localeCompare(b.slotDate);
      return a.slotTime.localeCompare(b.slotTime);
    });
    return offers.slice(0, Math.max(1, Math.min(Number(limit) || 2, 3)));
  } catch (err) {
    console.error('[whatsappOffers] findConcreteOffers failed:', err?.message);
    return [];
  }
}
