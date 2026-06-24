// /api/slot-holds — 15-minute slot reservation endpoint.
//
// POST    body: { clinicId, date, time, procedureSlug?, procedureName?,
//                 procedurePrice?, tier?, fee?, feeLabel?, hasInsurance?,
//                 insuranceCompany?, providerName? }
//         header: x-mc-session
//         → 200 { ok, expiresAt, isLastSlotThisWeek }
//         → 409 { ok:false, reason:'taken' }
//
// PATCH   body: { clinicId, date, time, extendMinutes?, formSnapshot? }
//         header: x-mc-session
//         → 200 { ok, expiresAt }
//
// DELETE  body: { clinicId, date, time }
//         header: x-mc-session
//         → 200 { ok }
//
// GET     ?clinicId=&date=&time=
//         header: x-mc-session
//         → 200 { ok, ownedByThisSession, expiresAt }
//
// Rate-limit: 60 req/min/IP via the existing `clinicSearch` bucket
// (the booking flow chains POST→GET→PATCH→DELETE within seconds, so
// 60/min is a comfortable cap for legitimate users).

import { NextResponse } from 'next/server';
import { getPool, sql, DB_AVAILABLE } from '@/lib/db';
import { generateSlotsForClinic } from '@/lib/slot-validation';
import {
  createHold, extendHold, releaseHold, holdKey,
  persistHoldRow, updateHoldFormSnapshot,
} from '@/lib/slotHolds';
import { limits } from '@/lib/rateLimit';
import { internalError, clientError } from '@/lib/errors';

export const dynamic = 'force-dynamic';

function sessionFromHeader(request) {
  const sid = (request.headers.get('x-mc-session') || '').trim();
  // Don't trust arbitrary lengths — cap to a sane size (UUID = 36).
  if (!sid || sid.length > 80) return null;
  return sid;
}

/**
 * Accept either a DB clinic id (positive integer) or a video-pilot
 * provider id ("video-derma-001" etc). Returns the normalised
 * value (number for DB ids, string for video) or null on failure.
 * Cleanup of the video pilot: drop the second branch and revert
 * the call sites to `Number(body?.clinicId)`.
 */
function parseClinicIdInput(raw) {
  if (typeof raw === 'string' && /^video-[a-z0-9-]+$/i.test(raw)) {
    return raw;
  }
  const n = Number(raw);
  if (Number.isFinite(n) && Number.isInteger(n) && n > 0) return n;
  return null;
}

function isVideoClinicId(id) {
  return typeof id === 'string' && id.startsWith('video-');
}

// ─────────────────────────────────────────────────────────
// isLastSlotThisWeek — single-clinic inventory probe
// ─────────────────────────────────────────────────────────
//
// Counts how many TIER-1 (≤ 7 días) slots the clinic has left after we
// exclude bookings, the slot the patient just held, and any other
// active holds on the same clinic. If exactly one remains we tell the
// client to render the "Última cita en este centro en menos de una
// semana" banner on /book.
//
// Best-effort: a DB hiccup returns null and the client skips the banner.
async function probeIsLastSlotThisWeek({ clinicId, sessionId, holdKeyToInclude }) {
  if (!DB_AVAILABLE) return null;
  try {
    const pool = await getPool();
    const today = new Date().toISOString().slice(0, 10);

    // Schedules + city (matches /api/clinics/[id]/available-slots).
    const scheduleResult = await pool.request()
      .input('clinic_id', sql.Int, clinicId)
      .query(`SELECT day_of_week, start_time, end_time, is_available
              FROM clinic_schedules
              WHERE clinic_id = @clinic_id AND is_available = 1`);
    const cityResult = await pool.request()
      .input('clinic_id', sql.Int, clinicId)
      .query(`SELECT TOP 1 city FROM clinics WHERE id = @clinic_id`);

    // Bookings + active hold keys for this clinic (own session excluded).
    // We also INCLUDE the just-created hold in the booked set so the
    // probe doesn't double-count the patient's own slot.
    const bookedKeys = new Set();
    if (holdKeyToInclude) bookedKeys.add(holdKeyToInclude);

    const bookingsResult = await pool.request()
      .input('clinic_id', sql.Int, clinicId)
      .input('today',     sql.NVarChar(20), today)
      .query(`SELECT slot_date, slot_time
              FROM bookings
              WHERE provider_id = @clinic_id
                AND status IN ('confirmed','pending','awaiting_voucher')
                AND slot_date >= @today`);
    for (const r of bookingsResult.recordset) {
      if (r.slot_date && r.slot_time) bookedKeys.add(`${clinicId}|${r.slot_date}|${r.slot_time}`);
    }

    // Other active holds. We use the DB mirror (cheap, scoped) rather
    // than SCAN'ing Redis just for this probe.
    try {
      const holdsResult = await pool.request()
        .input('clinic_id',  sql.Int,           clinicId)
        .input('session_id', sql.NVarChar(80),  sessionId || '')
        .query(`SELECT slot_date, slot_time
                FROM slot_holds
                WHERE clinic_id = @clinic_id
                  AND held_until > SYSDATETIMEOFFSET()
                  AND converted_at IS NULL
                  AND session_id <> @session_id`);
      for (const r of holdsResult.recordset) {
        if (r.slot_date && r.slot_time) bookedKeys.add(`${clinicId}|${r.slot_date}|${r.slot_time}`);
      }
    } catch (innerErr) {
      // Pre-migration — silently no-op, the probe still works using
      // bookings + the just-created hold.
      if (!String(innerErr?.message || '').includes('Invalid object name')) {
        console.error('[slot-holds probe] holds lookup', innerErr?.message);
      }
    }

    const { slots } = generateSlotsForClinic(
      clinicId,
      scheduleResult.recordset,
      { city: cityResult.recordset[0]?.city || null, bookedKeys },
    );
    const tierOne = slots.filter((s) => s.tier === 1 && s.available);
    return tierOne.length === 1;
  } catch (err) {
    console.error('[slot-holds probe] failed', err?.message);
    return null;
  }
}

// ─────────────────────────────────────────────────────────
// POST — claim a hold
// ─────────────────────────────────────────────────────────
export async function POST(request) {
  const rl = await limits.clinicSearch.check(request);
  if (!rl.ok) {
    return NextResponse.json({ error: 'rate_limited' }, { status: 429, headers: rl.headers });
  }

  const sid = sessionFromHeader(request);
  if (!sid) return clientError('missing or invalid x-mc-session header', 400);

  let body;
  try { body = await request.json(); }
  catch { return clientError('invalid JSON', 400); }

  const clinicId = parseClinicIdInput(body?.clinicId);
  const date = String(body?.date || '').trim();
  const time = String(body?.time || '').trim();
  if (clinicId === null || !/^\d{4}-\d{2}-\d{2}$/.test(date) || !/^\d{2}:\d{2}$/.test(time)) {
    return clientError('clinicId, date (YYYY-MM-DD) and time (HH:MM) are required', 400);
  }

  try {
    const result = await createHold({ clinicId, date, time, sessionId: sid });
    if (!result.ok) {
      if (result.reason === 'taken') {
        return NextResponse.json({ ok: false, reason: 'taken' }, { status: 409 });
      }
      return clientError(`hold_failed: ${result.reason || 'unknown'}`, 400);
    }

    // DB mirror — best-effort, doesn't block the response.
    persistHoldRow({
      sessionId: sid,
      clinicId,
      clinicName:      body?.providerName || null,
      slotDate:        date,
      slotTime:        time,
      procedureSlug:   body?.procedureSlug  || null,
      procedureName:   body?.procedureName  || null,
      procedurePrice:  body?.procedurePrice ?? null,
      tier:            body?.tier ?? null,
      fee:             body?.fee  ?? null,
      feeLabel:        body?.feeLabel || null,
      hasInsurance:    typeof body?.hasInsurance === 'boolean' ? body.hasInsurance : null,
      insuranceCompany: body?.insuranceCompany || null,
      heldUntil:       result.expiresAt,
    }).catch((e) => console.error('[slot-holds POST] persistHoldRow', e?.message));

    // "Última cita" probe — null when we can't determine. Video
    // providers skip the probe (they're not in the clinics SQL
    // table); the client-side scarcity flag drives the banner
    // alone for them via /book's `lastSlot=1` URL forward.
    const isLastSlotThisWeek = isVideoClinicId(clinicId)
      ? null
      : await probeIsLastSlotThisWeek({
          clinicId,
          sessionId: sid,
          holdKeyToInclude: `${clinicId}|${date}|${time}`,
        });

    return NextResponse.json({
      ok: true,
      expiresAt: result.expiresAt,
      alreadyOwned: !!result.alreadyOwned,
      isLastSlotThisWeek: isLastSlotThisWeek === true,
    });
  } catch (err) {
    return internalError(err, '[POST /api/slot-holds]');
  }
}

// ─────────────────────────────────────────────────────────
// PATCH — extend hold and/or update form snapshot
// ─────────────────────────────────────────────────────────
export async function PATCH(request) {
  const rl = await limits.clinicSearch.check(request);
  if (!rl.ok) {
    return NextResponse.json({ error: 'rate_limited' }, { status: 429, headers: rl.headers });
  }

  const sid = sessionFromHeader(request);
  if (!sid) return clientError('missing or invalid x-mc-session header', 400);

  let body;
  try { body = await request.json(); }
  catch { return clientError('invalid JSON', 400); }

  const clinicId = parseClinicIdInput(body?.clinicId);
  const date = String(body?.date || '').trim();
  const time = String(body?.time || '').trim();
  if (clinicId === null || !/^\d{4}-\d{2}-\d{2}$/.test(date) || !/^\d{2}:\d{2}$/.test(time)) {
    return clientError('clinicId, date and time are required', 400);
  }

  try {
    // Snapshot patch first (cheap, no Redis call required).
    if (body?.formSnapshot && typeof body.formSnapshot === 'object') {
      await updateHoldFormSnapshot({
        sessionId: sid,
        clinicId,
        slotDate: date,
        slotTime: time,
        formSnapshot: body.formSnapshot,
      });
    }

    // Optional extend. We default to 15 min when the body asks for it.
    let expiresAt = null;
    if (Number(body?.extendMinutes) > 0) {
      const r = await extendHold({
        clinicId, date, time, sessionId: sid,
        seconds: Math.min(30 * 60, Math.max(60, Number(body.extendMinutes) * 60)),
      });
      if (!r.ok) {
        return NextResponse.json({ ok: false, reason: r.reason || 'extend_failed' }, { status: 409 });
      }
      expiresAt = r.expiresAt;
    }

    return NextResponse.json({ ok: true, expiresAt });
  } catch (err) {
    return internalError(err, '[PATCH /api/slot-holds]');
  }
}

// ─────────────────────────────────────────────────────────
// DELETE — release hold
// ─────────────────────────────────────────────────────────
export async function DELETE(request) {
  const sid = sessionFromHeader(request);
  // No rate-limit on DELETE — the client uses `sendBeacon` here and
  // we want releases to fire reliably so the slot frees up for the
  // next visitor.

  let body;
  try { body = await request.json(); }
  catch {
    // sendBeacon sometimes posts no body — accept query params as a fallback.
    body = null;
  }

  let clinicId, date, time;
  if (body && typeof body === 'object') {
    clinicId = parseClinicIdInput(body.clinicId);
    date = String(body.date || '').trim();
    time = String(body.time || '').trim();
  } else {
    const url = new URL(request.url);
    clinicId = parseClinicIdInput(url.searchParams.get('clinicId'));
    date = String(url.searchParams.get('date') || '').trim();
    time = String(url.searchParams.get('time') || '').trim();
  }
  if (clinicId === null || !/^\d{4}-\d{2}-\d{2}$/.test(date) || !/^\d{2}:\d{2}$/.test(time)) {
    return clientError('clinicId, date and time are required', 400);
  }

  try {
    const r = await releaseHold({ clinicId, date, time, sessionId: sid || undefined });
    return NextResponse.json({ ok: r.ok !== false });
  } catch (err) {
    return internalError(err, '[DELETE /api/slot-holds]');
  }
}

// ─────────────────────────────────────────────────────────
// GET — pre-flight check
// ─────────────────────────────────────────────────────────
export async function GET(request) {
  const sid = sessionFromHeader(request);
  if (!sid) return clientError('missing or invalid x-mc-session header', 400);

  const url = new URL(request.url);
  const clinicId = parseClinicIdInput(url.searchParams.get('clinicId'));
  const date = String(url.searchParams.get('date') || '').trim();
  const time = String(url.searchParams.get('time') || '').trim();
  if (clinicId === null || !/^\d{4}-\d{2}-\d{2}$/.test(date) || !/^\d{2}:\d{2}$/.test(time)) {
    return clientError('clinicId, date and time are required', 400);
  }

  // Pre-flight check. The result is purely informational ("does this
  // session still own this slot?") — even when Upstash is offline we
  // return ok:true so /book doesn't gate on it (the URL `holdExpiresAt`
  // drives the timer in that fallback mode).
  let ownedByThisSession = false;
  let expiresAt = null;
  try {
    const { UPSTASH_URL, UPSTASH_TOKEN } = readUpstash();
    if (UPSTASH_URL && UPSTASH_TOKEN) {
      const key = holdKey(clinicId, date, time);
      const { fetchWithTimeout } = await import('@/lib/http');
      const ownerRes = await fetchWithTimeout(`${UPSTASH_URL}/get/${encodeURIComponent(key)}`, {
        headers: { Authorization: `Bearer ${UPSTASH_TOKEN}` },
        timeoutMs: 1200,
      });
      if (ownerRes.ok) {
        const owner = (await ownerRes.json())?.result;
        if (owner === sid) {
          ownedByThisSession = true;
          const ttlRes = await fetchWithTimeout(`${UPSTASH_URL}/ttl/${encodeURIComponent(key)}`, {
            headers: { Authorization: `Bearer ${UPSTASH_TOKEN}` },
            timeoutMs: 1200,
          });
          const ttl = ttlRes.ok ? Number((await ttlRes.json())?.result) : 0;
          if (Number.isFinite(ttl) && ttl > 0) {
            expiresAt = new Date(Date.now() + ttl * 1000).toISOString();
          }
        }
      }
    } else {
      // No Upstash — trust the client (the URL `holdExpiresAt` drives the
      // timer; this endpoint isn't gating in that mode anyway).
      ownedByThisSession = true;
    }
  } catch (err) {
    console.error('[GET /api/slot-holds] redis lookup failed', err?.message);
    ownedByThisSession = true; // fail open
  }

  return NextResponse.json({ ok: true, ownedByThisSession, expiresAt });
}

function readUpstash() {
  return {
    UPSTASH_URL: (process.env.UPSTASH_REDIS_REST_URL || '').replace(/\/$/, ''),
    UPSTASH_TOKEN: process.env.UPSTASH_REDIS_REST_TOKEN || '',
  };
}
