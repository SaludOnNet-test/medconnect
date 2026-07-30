// ---------------------------------------------------------------------------
// WhatsApp follow-up scheduling via QStash (Upstash message queue).
//
// After the bot replies to a patient we schedule a single deferred nudge 2h
// later (QStash `Upstash-Delay`). QStash then POSTs back to our own
// /api/whatsapp/followup endpoint, which decides whether the nudge should
// actually be sent (see that route for the anti-spam / re-engagement filters).
//
// QStash is NOT provisioned yet: without QSTASH_TOKEN this is a silent no-op
// (logs a warning) so nothing breaks. It activates automatically once the env
// var is added.
// ---------------------------------------------------------------------------
import { fetchWithTimeout } from '@/lib/http';

const QSTASH_TOKEN = process.env.QSTASH_TOKEN || '';
const QSTASH_URL = process.env.QSTASH_URL || 'https://qstash.upstash.io';

/**
 * Schedule a one-off 2h follow-up nudge for a phone number. Best-effort:
 * never throws. No-op (with a warning) when QSTASH_TOKEN is absent.
 *
 * @param {string} phoneNumber
 */
export async function scheduleFollowup(phoneNumber) {
  if (!QSTASH_TOKEN) {
    console.warn('[whatsapp/followup] QSTASH_TOKEN not configured — skipping follow-up scheduling');
    return;
  }
  if (!phoneNumber) return;

  const secret = process.env.WHATSAPP_WEBHOOK_SECRET;
  if (!secret) {
    console.warn('[whatsapp/followup] WHATSAPP_WEBHOOK_SECRET not configured — skipping follow-up scheduling');
    return;
  }

  try {
    const site = process.env.NEXT_PUBLIC_SITE_URL || 'https://www.medconnect.es';
    const destUrl = `${site}/api/whatsapp/followup?secret=${encodeURIComponent(secret)}&phone=${encodeURIComponent(phoneNumber)}`;
    const publishUrl = `${QSTASH_URL}/v2/publish/${encodeURIComponent(destUrl)}`;

    const res = await fetchWithTimeout(publishUrl, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${QSTASH_TOKEN}`,
        'Upstash-Delay': '2h',
      },
      timeoutMs: 3000,
    });
    if (!res.ok) {
      console.warn('[whatsapp/followup] QStash publish failed:', res.status);
    }
  } catch (err) {
    console.error('[whatsapp/followup] scheduleFollowup error:', err.message);
  }
}
