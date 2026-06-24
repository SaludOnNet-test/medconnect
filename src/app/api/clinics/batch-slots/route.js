import { NextResponse } from 'next/server';
import { getPool, DB_AVAILABLE } from '@/lib/db';
import { generateSlotsForClinic, PRICING_TIERS } from '@/lib/slot-validation';
import { getHeldKeys } from '@/lib/slotHolds';
import { isPartnerClinic } from '@/lib/partnerClinics';
import { isVideoProviderId } from '@/lib/videoPilot';
import { getVideoProviderById, buildSlotsFromAvailability } from '@/lib/videoProviders';

// GET /api/clinics/batch-slots?ids=1,2,3,4,5&preview=true
// Returns: { slots: { "1": [...], "2": [...] }, pricingTiers: [...] }
//
// Accepts two id flavours:
//   - numeric (DB clinic id): goes through the standard
//     clinic_schedules + bookings + holds → generateSlotsForClinic
//     pipeline.
//   - "video-…" (pilot SaludOnNet video providers): goes through
//     the manifest loader + buildSlotsFromAvailability — see
//     src/lib/videoProviders.js. Cleanup of the pilot strips the
//     video- branch and reverts to numeric-only parsing.
export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const rawIds = searchParams.get('ids') || '';
  const preview = searchParams.get('preview') !== 'false';

  const tokens = rawIds.split(',').map((s) => s.trim()).filter(Boolean).slice(0, 20);
  const dbIds = [];
  const videoIds = [];
  for (const t of tokens) {
    if (isVideoProviderId(t)) {
      videoIds.push(t);
    } else {
      const n = parseInt(t, 10);
      if (!Number.isNaN(n) && n > 0) dbIds.push(n);
    }
  }
  // DB pipeline still keys everything by numeric id; the original
  // code below assumed `ids` was a numeric array, so keep that name
  // pointing at the numeric subset.
  const ids = dbIds;

  // Optional `topRankedIds=<id>,<id>,<id>` — caller-supplied list of
  // clinic ids that the search view considers "top-ranked" for the
  // active filter (typically the first 3 non-partner ids in the
  // partner-first → rating DESC ordering). Those clinics get tier-1
  // capped to 1 slot so the "última cita en menos de una semana"
  // scarcity pill fires on their card. Partners are always capped
  // separately via `isPartnerClinic`. Video provider ids are ignored
  // for this cap — their slot list comes from a fixed manifest, the
  // cap concept doesn't apply.
  const rawTopRanked = searchParams.get('topRankedIds') || '';
  const topRankedIds = new Set(
    rawTopRanked
      .split(',')
      .map((s) => parseInt(s.trim(), 10))
      .filter((n) => Number.isFinite(n) && n > 0)
      .slice(0, 8),
  );

  if (ids.length === 0 && videoIds.length === 0) {
    return NextResponse.json({ slots: {}, pricingTiers: PRICING_TIERS });
  }

  const schedulesByClinic = {};
  const cityByClinic = {};
  ids.forEach((id) => { schedulesByClinic[id] = []; cityByClinic[id] = null; });
  // bookedKeys: union Set across every clinic in this batch. The
  // generator filters its own clinic out by checking `${clinicId}|…`
  // so leaving them all in one set is correct and saves one allocation
  // per clinic. Pre-filtered to status IN ('confirmed','pending',
  // 'awaiting_voucher') and slot_date >= today.
  const bookedKeys = new Set();

  // DB pipeline only runs if there are numeric ids to look up.
  // A batch that contains only video- ids skips the entire SQL
  // block below; their slots come from the manifest at the bottom.
  if (DB_AVAILABLE && ids.length > 0) {
    try {
      const idList = ids.join(',');
      const pool = await getPool();
      const dbResult = await pool.request().query(
        `SELECT clinic_id, day_of_week, start_time, end_time, is_available
         FROM clinic_schedules
         WHERE clinic_id IN (${idList}) AND is_available = 1
         ORDER BY clinic_id, day_of_week, start_time`
      );
      for (const row of dbResult.recordset) {
        if (!schedulesByClinic[row.clinic_id]) schedulesByClinic[row.clinic_id] = [];
        schedulesByClinic[row.clinic_id].push(row);
      }
      // Single query for the cities of every clinic in this batch so the
      // slot generator can exclude city-specific holidays (Madrid municipio
      // San Isidro / Almudena, etc.). Best-effort: if it fails we fall
      // back to the national-only list and lose city precision.
      const cityResult = await pool.request().query(
        `SELECT id, city FROM clinics WHERE id IN (${idList})`
      );
      for (const row of cityResult.recordset) {
        cityByClinic[row.id] = row.city || null;
      }
      // Real-booking lookup. Any confirmed/pending/awaiting_voucher
      // booking against a (clinic, date, time) tuple is invisible to the
      // listing — the slot generator rotates to the next deterministic
      // candidate in the same tier window. Cheap single query, scoped to
      // the batch + future dates. Best-effort: if the query fails the
      // generator falls back to "no bookings known" and may surface a
      // slot that's actually taken (the booking modal will then re-check
      // when the patient clicks through).
      try {
        const today = new Date().toISOString().slice(0, 10);
        const bookingsResult = await pool.request().query(
          `SELECT provider_id, slot_date, slot_time
           FROM bookings
           WHERE provider_id IN (${idList})
             AND status IN ('confirmed','pending','awaiting_voucher')
             AND slot_date >= '${today}'`
        );
        for (const row of bookingsResult.recordset) {
          if (!row.provider_id || !row.slot_date || !row.slot_time) continue;
          bookedKeys.add(`${row.provider_id}|${row.slot_date}|${row.slot_time}`);
        }
      } catch (bErr) {
        console.error('[batch-slots] bookings lookup failed (continuing)', bErr?.message);
      }
    } catch (err) {
      console.error('[batch-slots] DB error:', err);
    }
  }

  // Active Redis holds: merge into the booked-key set so the slot
  // generator rotates past them exactly like a real booking.
  // `excludeSessionId` keeps the holder's OWN held slot visible to
  // them — so if they navigate back to the listing their picked time
  // is still there. Best-effort: a Redis hiccup returns an empty Set.
  try {
    const sessionId = request.headers.get('x-mc-session') || null;
    const heldKeys = await getHeldKeys(ids, sessionId);
    for (const k of heldKeys) bookedKeys.add(k);
  } catch (err) {
    console.error('[batch-slots] held-keys lookup failed (continuing)', err?.message);
  }

  const result = {};
  for (const id of ids) {
    // Tier-1 scarcity cap: partner clinics + caller-supplied "top
    // ranked" clinics surface a single tier-1 slot → the card / modal
    // banner "Última cita en este centro en menos de una semana" fires.
    // Other clinics keep the historical 2-slots-per-tier behaviour.
    const tierOneMaxSlots = (isPartnerClinic(id) || topRankedIds.has(id)) ? 1 : 2;
    const { slots } = generateSlotsForClinic(
      id,
      schedulesByClinic[id],
      { city: cityByClinic[id], bookedKeys, tierOneMaxSlots },
    );
    // For preview, return only the cheapest 4 slots (1 per tier when present)
    if (preview) {
      const byTier = {};
      for (const s of slots) {
        if (!byTier[s.tier] || s.date < byTier[s.tier].date) byTier[s.tier] = s;
      }
      result[id] = Object.values(byTier).sort((a, b) => a.tier - b.tier);
    } else {
      result[id] = slots;
    }
  }

  // SaludOnNet video-consultation pilot — synthesise slot arrays for
  // any video-… ids in the batch from the weekly manifest. They go
  // into the same `result` object so the front-end's slotsMap[p.id]
  // lookup works uniformly across in-person clinics and video
  // providers. Cleanup: drop this loop.
  for (const vid of videoIds) {
    try {
      const p = await getVideoProviderById(vid);
      if (!p) { result[vid] = []; continue; }
      const slots = buildSlotsFromAvailability(p.availability, p.servicePrice);
      if (preview) {
        const byTier = {};
        for (const s of slots) {
          if (!byTier[s.tier] || s.date < byTier[s.tier].date) byTier[s.tier] = s;
        }
        result[vid] = Object.values(byTier).sort((a, b) => a.tier - b.tier);
      } else {
        result[vid] = slots;
      }
    } catch (err) {
      console.warn('[batch-slots] video provider slot build failed for', vid, err?.message);
      result[vid] = [];
    }
  }

  return NextResponse.json({ slots: result, pricingTiers: PRICING_TIERS });
}
