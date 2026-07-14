// WhatsApp provider adapter — isolates all 360dialog-specific coupling.
// To switch provider (Meta Cloud API, Twilio, ...), replace the internals of
// this file only; the rest of the codebase talks to this interface:
//   - sendTextMessage(to, text)     → send an outbound text message
//   - parseInboundPayload(body)     → normalise the raw webhook payload to
//                                     { messages: [{ id, from, type, text }] }

const DIALOG360_API_KEY = process.env.WHATSAPP_360DIALOG_API_KEY || '';
// 360dialog's newer accounts (embedded Meta signup, waba-v2.360dialog.io) use
// the Cloud-API-compatible v2 endpoint, not the legacy v1 one. Configurable
// via env in case a given account is provisioned on a different base URL.
const DIALOG360_BASE_URL = process.env.WHATSAPP_360DIALOG_BASE_URL || 'https://waba-v2.360dialog.io';
const DIALOG360_URL = `${DIALOG360_BASE_URL}/messages`;

export async function sendTextMessage(to, text) {
  const res = await fetch(DIALOG360_URL, {
    method: 'POST',
    headers: {
      'D360-API-KEY': DIALOG360_API_KEY,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      messaging_product: 'whatsapp',
      recipient_type: 'individual',
      to,
      type: 'text',
      text: { body: text, preview_url: false },
    }),
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`360dialog send failed ${res.status}: ${body}`);
  }
  return res.json();
}

// Inbound payload shapes, by account generation:
//  - v2 / Cloud API (waba-v2, Meta embedded signup — OUR account): messages
//    are nested under entry[].changes[].value.messages; the same envelope
//    also carries status events (value.statuses) with no messages at all.
//  - legacy v1: { messages: [...], contacts: [...] } at the top level.
// We accept both — the top-level fallback keeps old fixtures/tests and any
// v1 account working. Normalised shape: { messages: [{ id, from, type,
// text }] } where `text` is the string body for text messages, else null.
export function parseInboundPayload(body) {
  let rawMessages = [];

  if (Array.isArray(body?.entry)) {
    for (const entry of body.entry) {
      if (!Array.isArray(entry?.changes)) continue;
      for (const change of entry.changes) {
        const msgs = change?.value?.messages;
        if (Array.isArray(msgs)) rawMessages.push(...msgs);
      }
    }
  } else if (Array.isArray(body?.messages)) {
    rawMessages = body.messages;
  }

  if (!rawMessages.length) return { messages: [] };

  return {
    messages: rawMessages.map((msg) => ({
      id: msg?.id ?? null,
      from: msg?.from ?? null,
      type: msg?.type ?? null,
      // Text messages carry their body; emoji reactions (👍 on a bot
      // message) carry the emoji so the bot can read them in context
      // instead of replying "solo proceso mensajes de texto".
      text: msg?.type === 'text'
        ? (msg?.text?.body ?? null)
        : msg?.type === 'reaction'
          ? (msg?.reaction?.emoji ?? null)
          : null,
    })),
  };
}
