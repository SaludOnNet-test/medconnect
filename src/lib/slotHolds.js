// 15-minute slot holds.
//
// Two stores work together:
//
//   1. **Upstash Redis (REST)** — authoritative for the read-hot
//      "is this slot held right now?" check. Keyed
//      `hold:<clinicId>|<YYYY-MM-DD>|<HH:MM>` → value = session id,
//      EX 900 s (auto-extends on PATCH to 1800 s max). NX flag on
//      SET so a concurrent claim race resolves to a single winner.
//
//   2. **slot_holds DB table** — mirror row per hold. Lets the
//      abandoned-hold cron find expired holds whose patient typed
//      an email but didn't convert, so we can send them a recovery
//      email. Also gives us audit/analytics over time. Redis stays
//      the source of truth for live holds; the DB row is the long-
//      tail companion.
//
// When `UPSTASH_REDIS_REST_URL` is not configured the Redis layer
// degrades gracefully: writes silently succeed, reads return empty
// sets. Local dev without Redis still works — the booking flow
// shows the timer (driven by URL `holdExpiresAt`) but the slot
// listing won't actually exclude held slots until Redis is on.

import { fetchWithTimeout } from '@/lib/http';
import { getPool, sql, DB_AVAILABLE } from '@/lib/db';

const UPSTASH_URL = (process.env.UPSTASH_REDIS_REST_URL || '').replace(/\/$/, '');
const UPSTASH_TOKEN = process.env.UPSTASH_REDIS_REST_TOKEN || '';
const HAS_UPSTASH = !!(UPSTASH_URL && UPSTASH_TOKEN);

const DEFAULT_HOLD_SECONDS = 15 * 60;       // 15 minutes
const MAX_HOLD_SECONDS     = 30 * 60;       // hard cap after one auto-extend

/** Compose the Redis key for a (clinicId, date, time) triple. */
export function holdKey(clinicId, date, time) {
  return `hold:${Number(clinicId)}|${date}|${time}`;
}

/** Compose the listing-filter shape used by `pickSlotsForTier`. */
function listingKey(clinicId, date, time) {
  return `${Number(clinicId)}|${date}|${time}`;
}

// ─────────────────────────────────────────────────────────
// Upstash REST helpers — single command per call. We use the
// `/<cmd>/<arg>/...` URL form documented at upstash.com/docs/redis/rest.
// ─────────────────────────────────────────────────────────

async function upstashCall(parts, opts = {}) {
  if (!HAS_UPSTASH) return null;
  try {
    const url = `${UPSTASH_URL}/${parts.map(encodeURIComponent).join('/')}`;
    const res = await fetchWithTimeout(url, {
      method: 'POST',
      headers: { Authorization: `Bearer ${UPSTASH_TOKEN}` },
      timeoutMs: opts.timeoutMs ?? 1500,
    });
    if (!res.ok) return null;
    const data = await res.json();
    return data?.result;
  } catch {
    return null;
  }
}

async function upstashPipeline(commands, opts = {}) {
  if (!HAS_UPSTASH) return null;
  try {
    const res = await fetchWithTimeout(`${UPSTASH_URL}/pipeline`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${UPSTASH_TOKEN}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(commands),
      timeoutMs: opts.timeoutMs ?? 2000,
    });
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  }
}

// ─────────────────────────────────────────────────────────
// Public API
// ─────────────────────────────────────────────────────────

/**
 * Try to claim a 15-minute hold on (clinicId, date, time) for the
 * given session.
 *
 * Returns:
 *   { ok: true,  expiresAt: ISO, alreadyOwned: boolean }
 *   { ok: false, reason: 'taken' }
 *
 * The Redis `SET key value EX 900 NX` is atomic — only the first
 * caller wins. A second caller within the same millisecond gets
 * `null` back from SET and we report `taken`. If the existing key
 * belongs to the SAME session we treat it as a no-op success
 * (`alreadyOwned: true`) so a duplicate POST from React strict mode
 * or a fast retry doesn't surface a confusing 409.
 *
 * Without Upstash configured we never block — the call returns
 * `ok:true, alreadyOwned:false` so /book still works in local dev.
 */
export async function createHold({ clinicId, date, time, sessionId, seconds = DEFAULT_HOLD_SECONDS }) {
  if (!sessionId) return { ok: false, reason: 'no_session' };
  if (!clinicId || !date || !time) return { ok: false, reason: 'bad_input' };

  const key = holdKey(clinicId, date, time);
  const ttl = Math.min(Math.max(60, Math.floor(seconds)), MAX_HOLD_SECONDS);

  if (!HAS_UPSTASH) {
    return {
      ok: true,
      alreadyOwned: false,
      expiresAt: new Date(Date.now() + ttl * 1000).toISOString(),
      bypass: true,
    };
  }

  // SET key value EX <ttl> NX. Returns "OK" on success, null if the key
  // already exists.
  const result = await upstashCall(['set', key, sessionId, 'EX', String(ttl), 'NX']);
  if (result === 'OK') {
    return {
      ok: true,
      alreadyOwned: false,
      expiresAt: new Date(Date.now() + ttl * 1000).toISOString(),
    };
  }

  // Key already existed. Check ownership — same session = success;
  // different session = 409 taken.
  const existingValue = await upstashCall(['get', key]);
  if (existingValue === sessionId) {
    const remainingTtl = Number(await upstashCall(['ttl', key])) || ttl;
    return {
      ok: true,
      alreadyOwned: true,
      expiresAt: new Date(Date.now() + Math.max(1, remainingTtl) * 1000).toISOString(),
    };
  }

  return { ok: false, reason: 'taken' };
}

/**
 * Extend an existing hold by `seconds` (default 15 min), capped at
 * MAX_HOLD_SECONDS from the current point in time. Requires the
 * caller to own the hold — a different session gets `false`.
 *
 * Used when the user enters the payment step so a slow Stripe
 * round-trip doesn't kill the hold mid-card.
 */
export async function extendHold({ clinicId, date, time, sessionId, seconds = DEFAULT_HOLD_SECONDS }) {
  if (!sessionId || !clinicId || !date || !time) return { ok: false };

  if (!HAS_UPSTASH) {
    return { ok: true, expiresAt: new Date(Date.now() + seconds * 1000).toISOString(), bypass: true };
  }

  const key = holdKey(clinicId, date, time);
  const owner = await upstashCall(['get', key]);
  if (owner !== sessionId) return { ok: false, reason: 'not_owner' };

  const ttl = Math.min(MAX_HOLD_SECONDS, Math.max(60, Math.floor(seconds)));
  const r = await upstashCall(['expire', key, String(ttl)]);
  if (r === 1 || r === '1') {
    return { ok: true, expiresAt: new Date(Date.now() + ttl * 1000).toISOString() };
  }
  return { ok: false };
}

/**
 * Release a hold. Idempotent — releasing a non-existent key returns
 * `{ ok: true, released: false }`. Releasing someone else's hold
 * returns `{ ok: false, reason: 'not_owner' }`.
 */
export async function releaseHold({ clinicId, date, time, sessionId }) {
  if (!clinicId || !date || !time) return { ok: false, reason: 'bad_input' };
  if (!HAS_UPSTASH) return { ok: true, released: false, bypass: true };

  const key = holdKey(clinicId, date, time);
  const owner = await upstashCall(['get', key]);
  if (owner === null || owner === undefined) {
    return { ok: true, released: false };
  }
  if (sessionId && owner !== sessionId) {
    return { ok: false, reason: 'not_owner' };
  }
  const deleted = await upstashCall(['del', key]);
  return { ok: true, released: Number(deleted) > 0 };
}

/**
 * Read the set of currently-held slot keys for a list of clinics.
 * `excludeSessionId` — when set, holds owned by that session are
 * NOT included (so the holder still sees their own slot as
 * available in the listing).
 *
 * Returns Set<"clinicId|date|time"> in the listing-filter shape so
 * a caller can `for (const k of held) bookedKeys.add(k)` without
 * any extra parsing.
 *
 * Implementation: SCAN `hold:<clinicId>|*` per clinic id, then
 * MGET in batches to filter by session. SCAN is bounded so this
 * stays cheap; a single search-v2 page typically queries ≤ 20
 * clinics. Without Upstash this returns an empty Set.
 */
export async function getHeldKeys(clinicIds, excludeSessionId = null) {
  const out = new Set();
  if (!HAS_UPSTASH || !Array.isArray(clinicIds) || clinicIds.length === 0) return out;

  // SCAN per clinic prefix. Each clinic's hold count is at most a
  // few dozen (one hold per booked slot per 15 min); SCAN's MATCH
  // is cheap on Upstash for small key spaces.
  const allKeys = [];
  for (const rawId of clinicIds) {
    const cid = Number(rawId);
    if (!Number.isFinite(cid) || cid <= 0) continue;
    const pattern = `hold:${cid}|*`;
    let cursor = '0';
    let iterations = 0;
    do {
      const data = await upstashCall(['scan', cursor, 'match', pattern, 'count', '100']);
      // Upstash returns SCAN as [nextCursor, [keys]].
      if (!Array.isArray(data) || data.length < 2) break;
      cursor = String(data[0] ?? '0');
      for (const k of (data[1] || [])) allKeys.push(k);
      iterations += 1;
      // Safety net — a runaway SCAN won't break us, just stops early.
    } while (cursor !== '0' && iterations < 8);
  }

  if (allKeys.length === 0) return out;

  // MGET in chunks of 50 to bound the URL size. Result is the array
  // of owner-session-ids parallel to `allKeys`.
  const CHUNK = 50;
  for (let i = 0; i < allKeys.length; i += CHUNK) {
    const chunk = allKeys.slice(i, i + CHUNK);
    const owners = await upstashCall(['mget', ...chunk]);
    if (!Array.isArray(owners)) continue;
    chunk.forEach((k, j) => {
      const owner = owners[j];
      if (owner === null || owner === undefined) return;
      if (excludeSessionId && owner === excludeSessionId) return;
      // Strip the "hold:" prefix to get the listing-shape key.
      const listing = k.startsWith('hold:') ? k.slice(5) : k;
      out.add(listing);
    });
  }

  return out;
}

// ─────────────────────────────────────────────────────────
// DB mirror — slot_holds table
// ─────────────────────────────────────────────────────────
//
// Best-effort: a DB outage doesn't block the Redis hold. Errors are
// logged and the booking flow continues. The cron picks up the rows
// that DID make it in.

/**
 * Insert (or upsert) a row into `slot_holds` mirroring a fresh hold.
 * Called from `/api/slot-holds POST` right after `createHold` succeeds.
 */
export async function persistHoldRow({
  sessionId, clinicId, clinicName, slotDate, slotTime,
  procedureSlug, procedureName, procedurePrice,
  tier, fee, feeLabel,
  hasInsurance, insuranceCompany,
  heldUntil,
}) {
  if (!DB_AVAILABLE) return { ok: false, reason: 'no_db' };
  try {
    const pool = await getPool();
    // Upsert via MERGE-style: if a row exists for the same
    // (session, clinic, date, time) we just refresh its held_until.
    await pool.request()
      .input('session_id',        sql.NVarChar(80),   sessionId)
      .input('clinic_id',         sql.Int,            clinicId)
      .input('clinic_name',       sql.NVarChar(255),  clinicName || null)
      .input('slot_date',         sql.NVarChar(20),   slotDate)
      .input('slot_time',         sql.NVarChar(10),   slotTime)
      .input('procedure_slug',    sql.NVarChar(100),  procedureSlug || null)
      .input('procedure_name',    sql.NVarChar(255),  procedureName || null)
      .input('procedure_price',   sql.Decimal(10, 2), procedurePrice ?? null)
      .input('tier',              sql.TinyInt,        tier ?? null)
      .input('fee',               sql.Decimal(10, 2), fee ?? null)
      .input('fee_label',         sql.NVarChar(100),  feeLabel || null)
      .input('has_insurance',     sql.Bit,            hasInsurance == null ? null : (hasInsurance ? 1 : 0))
      .input('insurance_company', sql.NVarChar(100),  insuranceCompany || null)
      .input('held_until',        sql.DateTimeOffset, new Date(heldUntil))
      .query(`
        IF EXISTS (
          SELECT 1 FROM slot_holds
          WHERE session_id = @session_id
            AND clinic_id  = @clinic_id
            AND slot_date  = @slot_date
            AND slot_time  = @slot_time
        )
          UPDATE slot_holds
          SET held_until = @held_until,
              updated_at = SYSDATETIMEOFFSET()
          WHERE session_id = @session_id
            AND clinic_id  = @clinic_id
            AND slot_date  = @slot_date
            AND slot_time  = @slot_time;
        ELSE
          INSERT INTO slot_holds
            (session_id, clinic_id, clinic_name, slot_date, slot_time,
             procedure_slug, procedure_name, procedure_price,
             tier, fee, fee_label, has_insurance, insurance_company, held_until)
          VALUES
            (@session_id, @clinic_id, @clinic_name, @slot_date, @slot_time,
             @procedure_slug, @procedure_name, @procedure_price,
             @tier, @fee, @fee_label, @has_insurance, @insurance_company, @held_until);
      `);
    return { ok: true };
  } catch (err) {
    // Pre-migration column-not-found — silently no-op; the cron just
    // won't have rows to dispatch from until the table exists.
    if (String(err?.message || '').includes('Invalid object name') ||
        String(err?.message || '').includes('Invalid column name')) {
      return { ok: false, reason: 'pre_migration' };
    }
    console.error('[slotHolds] persistHoldRow failed', err?.message);
    return { ok: false, reason: 'db_error' };
  }
}

/**
 * Patch the `form_snapshot` (and the denormalised `patient_email`)
 * for the holder's open row. Called by `/book` on debounced field
 * changes so the abandoned-hold cron has the patient's data.
 */
export async function updateHoldFormSnapshot({ sessionId, clinicId, slotDate, slotTime, formSnapshot }) {
  if (!DB_AVAILABLE) return { ok: false, reason: 'no_db' };
  const patientEmail = formSnapshot && typeof formSnapshot.email === 'string'
    ? formSnapshot.email.trim().toLowerCase()
    : null;
  try {
    const pool = await getPool();
    await pool.request()
      .input('session_id',    sql.NVarChar(80),   sessionId)
      .input('clinic_id',     sql.Int,            clinicId)
      .input('slot_date',     sql.NVarChar(20),   slotDate)
      .input('slot_time',     sql.NVarChar(10),   slotTime)
      .input('form_snapshot', sql.NVarChar(sql.MAX), JSON.stringify(formSnapshot || {}))
      .input('patient_email', sql.NVarChar(255),  patientEmail || null)
      .query(`
        UPDATE slot_holds
        SET form_snapshot = @form_snapshot,
            patient_email = @patient_email,
            updated_at    = SYSDATETIMEOFFSET()
        WHERE session_id = @session_id
          AND clinic_id  = @clinic_id
          AND slot_date  = @slot_date
          AND slot_time  = @slot_time
      `);
    return { ok: true };
  } catch (err) {
    if (String(err?.message || '').includes('Invalid object name') ||
        String(err?.message || '').includes('Invalid column name')) {
      return { ok: false, reason: 'pre_migration' };
    }
    console.error('[slotHolds] updateHoldFormSnapshot failed', err?.message);
    return { ok: false, reason: 'db_error' };
  }
}

/**
 * Mark the matching slot_holds row as converted. Called from
 * `/api/bookings POST` on successful insert so the recovery cron
 * skips it.
 */
export async function markHoldConverted({ sessionId, clinicId, slotDate, slotTime }) {
  if (!DB_AVAILABLE) return { ok: false, reason: 'no_db' };
  try {
    const pool = await getPool();
    await pool.request()
      .input('session_id', sql.NVarChar(80),  sessionId || '')
      .input('clinic_id',  sql.Int,           clinicId)
      .input('slot_date',  sql.NVarChar(20),  slotDate)
      .input('slot_time',  sql.NVarChar(10),  slotTime)
      .query(`
        UPDATE slot_holds
        SET converted_at = SYSDATETIMEOFFSET(),
            updated_at   = SYSDATETIMEOFFSET()
        WHERE clinic_id = @clinic_id
          AND slot_date = @slot_date
          AND slot_time = @slot_time
          AND converted_at IS NULL
          AND (@session_id = '' OR session_id = @session_id)
      `);
    return { ok: true };
  } catch (err) {
    if (String(err?.message || '').includes('Invalid object name') ||
        String(err?.message || '').includes('Invalid column name')) {
      return { ok: false, reason: 'pre_migration' };
    }
    console.error('[slotHolds] markHoldConverted failed', err?.message);
    return { ok: false, reason: 'db_error' };
  }
}

// Internal helper for unit-level parity if ever needed.
export const _internal = { listingKey, holdKey };
