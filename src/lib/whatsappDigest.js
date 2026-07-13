// ---------------------------------------------------------------------------
// Opportunistic "stale conversation" digest for the WhatsApp bot.
//
// Vercel Hobby only allows 2 crons/day (see vercel.json — already used by
// daily-dispatch + recover-pending-payment), so we can't run a dedicated
// cron every 15-30 min to catch conversations that went cold without ever
// producing a lead or escalation. Instead, every time the webhook processes
// ANY inbound message, it also piggybacks a scan for OTHER phone numbers
// whose last message is 30 min - 3 h old, and — if that conversation hasn't
// already been reported (no lead/escalation in the last 3h, no prior
// digest) — emails ops the full transcript.
//
// Redis (Upstash REST, same pattern as the message-id dedupe in
// src/app/api/whatsapp/webhook/route.js) is used purely to avoid sending the
// same digest twice; if Redis isn't configured we skip sending entirely
// rather than risk flooding ops with duplicate emails.
// ---------------------------------------------------------------------------
import { getPool, DB_AVAILABLE } from '@/lib/db';
import sql from 'mssql';
import { captureException } from '@/lib/sentry';
import { sendEmail } from '@/lib/email';
import { whatsappConversationDigest } from '@/lib/emailTemplates';
import { getFullConversationTranscript } from '@/lib/whatsapp';
import { fetchWithTimeout } from '@/lib/http';

const UPSTASH_URL = process.env.UPSTASH_REDIS_REST_URL || '';
const UPSTASH_TOKEN = process.env.UPSTASH_REDIS_REST_TOKEN || '';

const STALE_MIN_MINUTES = 30;
const STALE_MAX_HOURS = 3;
const DIGEST_TTL_SECONDS = 25 * 60 * 60; // 25h — covers the 3h window with margin

function digestKey(phoneNumber) {
  const day = new Date().toISOString().slice(0, 10); // YYYY-MM-DD (UTC, good enough for dedupe)
  return `wa:digested:${phoneNumber}:${day}`;
}

// Distinct phone numbers whose most recent message is between
// STALE_MIN_MINUTES and STALE_MAX_HOURS old — old enough that the bot isn't
// still mid-conversation, recent enough that we don't rescan the whole
// history table on every webhook call.
export async function findStaleConversations() {
  if (!DB_AVAILABLE) return [];
  try {
    const pool = await getPool();
    const result = await pool.request()
      .input('minMinutes', sql.Int, STALE_MIN_MINUTES)
      .input('maxHours', sql.Int, STALE_MAX_HOURS)
      .query(`
        SELECT phone_number, MAX(created_at) AS last_message_at, COUNT(*) AS message_count
        FROM whatsapp_conversations
        GROUP BY phone_number
        HAVING MAX(created_at) <= DATEADD(minute, -@minMinutes, SYSDATETIMEOFFSET())
           AND MAX(created_at) >= DATEADD(hour, -@maxHours, SYSDATETIMEOFFSET())
      `);
    return result.recordset.map((r) => ({
      phoneNumber: r.phone_number,
      lastMessageAt: r.last_message_at,
      messageCount: r.message_count,
    }));
  } catch (err) {
    console.error('[whatsappDigest] findStaleConversations error:', err.message);
    captureException(err instanceof Error ? err : new Error(String(err)), {
      scope: '[whatsappDigest.findStaleConversations]',
    }).catch(() => {});
    return [];
  }
}

export async function isAlreadyDigested(phoneNumber) {
  if (!UPSTASH_URL || !UPSTASH_TOKEN) return true; // no Redis → treat as digested so we never send
  try {
    const res = await fetchWithTimeout(`${UPSTASH_URL}/get/${encodeURIComponent(digestKey(phoneNumber))}`, {
      headers: { Authorization: `Bearer ${UPSTASH_TOKEN}` },
      timeoutMs: 1500,
    });
    if (!res.ok) return true;
    const data = await res.json();
    return data?.result != null;
  } catch {
    return true;
  }
}

export async function markDigested(phoneNumber) {
  if (!UPSTASH_URL || !UPSTASH_TOKEN) return false;
  try {
    const res = await fetchWithTimeout(`${UPSTASH_URL}/pipeline`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${UPSTASH_TOKEN}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify([
        ['SET', digestKey(phoneNumber), '1', 'NX', 'EX', String(DIGEST_TTL_SECONDS)],
      ]),
      timeoutMs: 1500,
    });
    if (!res.ok) return false;
    const data = await res.json();
    return data?.[0]?.result === 'OK';
  } catch {
    return false;
  }
}

// Whether phoneNumber already produced a lead or escalation in the last 3h —
// if so, the immediate lead/escalation email already covers it and we skip
// the digest to avoid duplicate ops noise.
async function hasRecentLeadOrEscalation(phoneNumber) {
  if (!DB_AVAILABLE) return false;
  try {
    const pool = await getPool();
    const result = await pool.request()
      .input('phone', sql.NVarChar(20), phoneNumber)
      .input('maxHours', sql.Int, STALE_MAX_HOURS)
      .query(`
        SELECT
          (SELECT COUNT(*) FROM whatsapp_leads
             WHERE phone_number = @phone AND created_at >= DATEADD(hour, -@maxHours, SYSDATETIMEOFFSET())) AS lead_count,
          (SELECT COUNT(*) FROM human_escalations
             WHERE phone_number = @phone AND created_at >= DATEADD(hour, -@maxHours, SYSDATETIMEOFFSET())) AS escalation_count
      `);
    const row = result.recordset[0];
    return Boolean(row && (row.lead_count > 0 || row.escalation_count > 0));
  } catch (err) {
    console.error('[whatsappDigest] hasRecentLeadOrEscalation error:', err.message);
    return false; // fail open toward sending — better a redundant digest than a silent drop
  }
}

// Entry point — called opportunistically from the webhook after handling
// the inbound message that triggered this invocation. Never throws.
export async function dispatchStaleConversationDigests() {
  const to = process.env.EXEC_REPORT_TO_EMAIL;
  if (!to) return;

  const stale = await findStaleConversations();
  for (const { phoneNumber, messageCount } of stale) {
    try {
      if (await isAlreadyDigested(phoneNumber)) continue;
      if (await hasRecentLeadOrEscalation(phoneNumber)) {
        // Already reported via the immediate lead/escalation email — mark
        // digested too so we don't re-check it every webhook call.
        await markDigested(phoneNumber);
        continue;
      }

      const transcript = await getFullConversationTranscript(phoneNumber);
      const { subject, html } = whatsappConversationDigest({ phoneNumber, messageCount, transcript });
      await sendEmail({ to, subject, html });
      await markDigested(phoneNumber);
    } catch (err) {
      console.error('[whatsappDigest] dispatch failed for', phoneNumber, err.message);
      captureException(err instanceof Error ? err : new Error(String(err)), {
        scope: '[whatsappDigest.dispatchStaleConversationDigests]',
        phoneNumber,
      }).catch(() => {});
    }
  }
}
