// ---------------------------------------------------------------------------
// WhatsApp follow-up nudge executor.
//
// QStash calls this endpoint ~2h after a bot reply (scheduled by
// scheduleFollowup in src/lib/whatsappFollowup.js). It decides whether to
// actually send a warm re-engagement nudge, applying several guards so we
// never spam a patient:
//   1. Auth via ?secret= (same shared secret as the inbound webhook).
//   2. Re-engagement: if the conversation had ANY activity in the last
//      ~105 min, the patient is still around (or a newer bot reply already
//      scheduled its own later follow-up) — defer to that one, no nudge now.
//   3. Conversion: if the most recent lead is already 'paid', no nudge.
//   4. Anti-double-nudge: one nudge per phone per day (Upstash SET NX),
//      claimed only right before sending so a skip never burns the day slot.
//
// Always returns 200 (never 500) so QStash does not retry.
// ---------------------------------------------------------------------------
import { NextResponse } from 'next/server';
import crypto from 'crypto';
import { getPool, DB_AVAILABLE } from '@/lib/db';
import sql from 'mssql';
import { sendWhatsAppMessage, getFullConversationTranscript } from '@/lib/whatsapp';
import { fetchWithTimeout } from '@/lib/http';
import { captureException } from '@/lib/sentry';

export const dynamic = 'force-dynamic';

const UPSTASH_URL = process.env.UPSTASH_REDIS_REST_URL || '';
const UPSTASH_TOKEN = process.env.UPSTASH_REDIS_REST_TOKEN || '';

// Follow-ups are scheduled 2h (120 min) after each bot reply. If the last
// message is younger than this, a newer bot reply exists whose own callback
// will fire later — defer to it. Slightly below 120 so the aligned callback
// (last message ≈120 min old) still passes.
const RECENT_ACTIVITY_MINUTES = 105;

// Timing-safe comparison; false on length mismatch instead of throwing.
function safeCompare(a, b) {
  const bufA = Buffer.from(String(a));
  const bufB = Buffer.from(String(b));
  if (bufA.length !== bufB.length) return false;
  return crypto.timingSafeEqual(bufA, bufB);
}

// One nudge per phone per calendar day. Returns true when THIS call created
// the key (i.e. we're clear to nudge). Fails open to `false` (skip) when Redis
// is unavailable — better to miss a nudge than risk spamming on retries.
async function claimDailyNudge(phone) {
  if (!UPSTASH_URL || !UPSTASH_TOKEN) {
    console.warn('[whatsapp/followup] Upstash not configured — skipping nudge (fail-safe)');
    return false;
  }
  const day = new Date().toISOString().slice(0, 10); // YYYY-MM-DD
  try {
    const res = await fetchWithTimeout(`${UPSTASH_URL}/pipeline`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${UPSTASH_TOKEN}`,
        'Content-Type': 'application/json',
      },
      // 90000s ≈ 25h TTL so the daily key comfortably outlives the day window.
      body: JSON.stringify([
        ['SET', `wa:nudged:${phone}:${day}`, '1', 'NX', 'EX', String(90000)],
      ]),
      timeoutMs: 1500,
    });
    if (!res.ok) {
      console.warn('[whatsapp/followup] nudge claim failed — skipping');
      return false;
    }
    const data = await res.json();
    return data?.[0]?.result === 'OK';
  } catch {
    console.warn('[whatsapp/followup] nudge claim errored — skipping');
    return false;
  }
}

// Most recent lead for a phone: name, specialty and status (for personalization
// + conversion check).
async function getLatestLead(phone) {
  if (!DB_AVAILABLE) return null;
  try {
    const pool = await getPool();
    const result = await pool.request()
      .input('phone', sql.NVarChar(20), phone)
      .query(`
        SELECT TOP 1 patient_name, specialty_requested, status
        FROM whatsapp_leads
        WHERE phone_number = @phone
        ORDER BY created_at DESC
      `);
    return result.recordset[0] || null;
  } catch (err) {
    console.error('[whatsapp/followup] getLatestLead error:', err.message);
    return null;
  }
}

export async function POST(request) {
  const webhookSecret = process.env.WHATSAPP_WEBHOOK_SECRET;
  if (!webhookSecret) {
    return NextResponse.json({ error: 'Followup not configured' }, { status: 503 });
  }

  const url = new URL(request.url);
  const providedSecret = request.headers.get('x-webhook-secret') || url.searchParams.get('secret') || '';
  if (!safeCompare(providedSecret, webhookSecret)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const phone = url.searchParams.get('phone');
  if (!phone) return NextResponse.json({ ok: true });

  try {
    // Re-engagement check: skip if the conversation had any activity in the
    // last ~105 min. Because the bot always replies last, a role-based check
    // would almost never trigger; a time-based one correctly defers to the
    // most recent bot reply's own follow-up and avoids nudging a patient who
    // just engaged. Empty transcript → nothing to nudge about.
    const transcript = await getFullConversationTranscript(phone);
    if (!transcript.length) {
      return NextResponse.json({ ok: true, skipped: 'no_conversation' });
    }
    const lastMessage = transcript[transcript.length - 1];
    const lastAt = lastMessage?.created_at ? new Date(lastMessage.created_at).getTime() : 0;
    const ageMinutes = lastAt ? (Date.now() - lastAt) / 60000 : Infinity;
    if (ageMinutes < RECENT_ACTIVITY_MINUTES) {
      return NextResponse.json({ ok: true, skipped: 're_engaged' });
    }

    // Conversion check + personalization data.
    const lead = await getLatestLead(phone);
    if (lead?.status === 'paid') {
      return NextResponse.json({ ok: true, skipped: 'already_paid' });
    }

    // Anti-double-nudge: claimed last, right before sending, so the checks
    // above never consume the one-per-day slot on a skip.
    const claimed = await claimDailyNudge(phone);
    if (!claimed) return NextResponse.json({ ok: true, skipped: 'already_nudged' });

    const name = (lead?.patient_name || '').trim();
    const specialty = (lead?.specialty_requested || '').trim();
    const greeting = name ? `Hola ${name}` : 'Hola';
    const cita = specialty ? `tu cita de ${specialty}` : 'tu cita';
    const message = `${greeting}, ¿pudiste reservar ${cita}? Si el enlace te dio algún problema o tienes dudas, dime y lo resolvemos juntos 😊`;

    await sendWhatsAppMessage(phone, message);
    return NextResponse.json({ ok: true, nudged: true });
  } catch (err) {
    console.error('[whatsapp/followup]', err);
    captureException(err instanceof Error ? err : new Error(String(err)), {
      scope: '[POST /api/whatsapp/followup]',
      phone,
    }).catch(() => {});
    // Always 200 so QStash does not retry.
    return NextResponse.json({ ok: true, handled_error: true });
  }
}
