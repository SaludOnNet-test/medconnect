import { NextResponse } from 'next/server';
import { query, sql, DB_AVAILABLE } from '@/lib/db';
import { generateSlotsForClinic, PRICING_TIERS } from '@/lib/slot-validation';
import { getHeldKeys } from '@/lib/slotHolds';
import { isPartnerClinic } from '@/lib/partnerClinics';

export async function GET(request, { params }) {
  const { id } = await params;
  const clinicId = parseInt(id, 10);
  if (isNaN(clinicId)) {
    return NextResponse.json({ slots: [], source: 'error', error: 'Invalid clinic ID' }, { status: 400 });
  }

  let schedules = [];
  let city = null;
  // Booking-aware slot rotation — mirror the batch-slots route. Any
  // confirmed/pending booking on a (date, time) for this clinic is
  // invisible to the listing; the generator rotates to the next
  // deterministic candidate within the same tier window.
  const bookedKeys = new Set();
  if (DB_AVAILABLE) {
    try {
      const result = await query(
        `SELECT day_of_week, start_time, end_time, is_available
         FROM clinic_schedules
         WHERE clinic_id = @clinicId AND is_available = 1
         ORDER BY day_of_week, start_time`,
        { clinicId: { type: sql.Int, value: clinicId } }
      );
      schedules = result.recordset;
    } catch (err) {
      console.error('available-slots db error:', err);
    }
    // Best-effort: also look up the clinic's city so the slot generator
    // can apply the right local-holiday list (Madrid CCAA + municipio,
    // future cities). If the lookup fails the generator falls back to
    // the national list only — slots open on local holidays in that
    // degraded mode, accepted as a no-data-default rather than blocking
    // every slot.
    try {
      const cityResult = await query(
        `SELECT TOP 1 city FROM clinics WHERE id = @clinicId`,
        { clinicId: { type: sql.Int, value: clinicId } }
      );
      city = cityResult.recordset[0]?.city || null;
    } catch (err) {
      console.error('available-slots city lookup error:', err);
    }
    try {
      const today = new Date().toISOString().slice(0, 10);
      const bookingsResult = await query(
        `SELECT slot_date, slot_time
         FROM bookings
         WHERE provider_id = @clinicId
           AND status IN ('confirmed','pending','awaiting_voucher')
           AND slot_date >= @today`,
        {
          clinicId: { type: sql.Int, value: clinicId },
          today: { type: sql.NVarChar(20), value: today },
        }
      );
      for (const row of bookingsResult.recordset) {
        if (!row.slot_date || !row.slot_time) continue;
        bookedKeys.add(`${clinicId}|${row.slot_date}|${row.slot_time}`);
      }
    } catch (err) {
      console.error('available-slots bookings lookup error (continuing):', err?.message);
    }
  }

  // Active Redis holds for this clinic — same rotation semantics as
  // bookings. Own-session holds stay visible so the user keeps their
  // pick if they navigate back. Best-effort.
  try {
    const sessionId = request.headers.get('x-mc-session') || null;
    const heldKeys = await getHeldKeys([clinicId], sessionId);
    for (const k of heldKeys) bookedKeys.add(k);
  } catch (err) {
    console.error('available-slots held-keys lookup error (continuing):', err?.message);
  }

  // Tier-1 scarcity cap. Two paths fold the cap in:
  //   - Partner clinics (PARTNER_CLINIC_IDS): always 1 tier-1 slot so the
  //     "Última cita…" pill fires on every step of the booking flow.
  //   - Top-ranked non-partner clinics in a search context: the listing
  //     calls the modal with the `isTopRanked` prop, which appends
  //     `?asTopRanked=true` here. Keeps the pill consistent between the
  //     card and the modal for top-3 non-partner clinics.
  // Deep-linked / direct-navigation opens (no listing context) only see
  // the partner rule — those clinics show 2 tier-1 slots and no pill.
  const url = new URL(request.url);
  const asTopRanked = url.searchParams.get('asTopRanked') === 'true';
  const tierOneMaxSlots = (isPartnerClinic(clinicId) || asTopRanked) ? 1 : 2;
  const { slots, rule, earliestSellable } = generateSlotsForClinic(clinicId, schedules, { city, bookedKeys, tierOneMaxSlots });

  return NextResponse.json({
    slots,
    source: rule === 'doctoralia' ? 'db' : 'fallback',
    rule,
    earliestSellable,
    pricingTiers: PRICING_TIERS,
    clinicId,
  });
}
