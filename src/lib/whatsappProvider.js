// WhatsApp provider adapter — isolates all 360dialog-specific coupling.
// To switch provider (Meta Cloud API, Twilio, ...), replace the internals of
// this file only; the rest of the codebase talks to this interface:
//   - sendTextMessage(to, text)     → send an outbound text message
//   - parseInboundPayload(body)     → normalise the raw webhook payload to
//                                     { messages: [{ id, from, type, text }] }

const DIALOG360_API_KEY = process.env.WHATSAPP_360DIALOG_API_KEY || '';
const DIALOG360_URL = 'https://waba.360dialog.io/v1/messages';

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

// 360dialog inbound payload: { messages: [...], contacts: [...] }
// Normalised shape: { messages: [{ id, from, type, text }] } where `text` is
// the string body for text messages and null otherwise.
export function parseInboundPayload(body) {
  const rawMessages = body?.messages;
  if (!Array.isArray(rawMessages) || !rawMessages.length) {
    return { messages: [] };
  }
  return {
    messages: rawMessages.map((msg) => ({
      id: msg?.id ?? null,
      from: msg?.from ?? null,
      type: msg?.type ?? null,
      text: msg?.type === 'text' ? (msg?.text?.body ?? null) : null,
    })),
  };
}
