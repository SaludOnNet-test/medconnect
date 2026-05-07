// Telegram Bot HTTP wrapper.
//
// Why no library: the official SDKs ship with their own dependency trees
// (axios, debug, ...) that bloat cold-start on Vercel. The Bot API is plain
// JSON over HTTPS — `fetchWithTimeout` covers it.
//
// Conventions:
//   - All sends go to TELEGRAM_OWNER_CHAT_ID by default. Multi-operator can
//     pass an explicit chatId.
//   - Mock mode kicks in if TELEGRAM_BOT_TOKEN is missing — logs the message
//     to stdout instead of failing. Lets the agents run end-to-end in dev
//     without a bot configured.
//   - Returns `{ ok, message_id?, mock? }` to keep callers simple. Errors
//     are caught and logged, never thrown — Telegram outage must not crash
//     the agent.
//
// References:
//   https://core.telegram.org/bots/api#sendmessage
//   https://core.telegram.org/bots/api#editmessagetext
//   https://core.telegram.org/bots/api#answercallbackquery

import { fetchWithTimeout } from '@/lib/http';
import crypto from 'crypto';

const TG_API = 'https://api.telegram.org';
const TIMEOUT_MS = 8_000;

function tokenOrNull() {
  return process.env.TELEGRAM_BOT_TOKEN || null;
}

function defaultChat() {
  return process.env.TELEGRAM_OWNER_CHAT_ID || null;
}

async function tgRequest(method, body) {
  const token = tokenOrNull();
  if (!token) {
    console.log(`[telegram MOCK ${method}]`, JSON.stringify(body).slice(0, 400));
    return { ok: true, mock: true };
  }
  try {
    const res = await fetchWithTimeout(`${TG_API}/bot${token}/${method}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      timeoutMs: TIMEOUT_MS,
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok || data?.ok === false) {
      console.error(`[telegram] ${method} failed`, { status: res.status, data });
      return { ok: false, error: data?.description || `http ${res.status}` };
    }
    return { ok: true, ...data.result };
  } catch (err) {
    console.error(`[telegram] ${method} threw`, err.message);
    return { ok: false, error: err.message };
  }
}

/**
 * Send a Markdown-formatted message with optional inline keyboard.
 * `buttons` is a 2D array: rows of { text, callback_data } objects.
 *
 * NOTE Telegram's `callback_data` has a 64-byte limit. Keep payloads short
 * (use the `tg:callback:{shortId}` Redis indirection — see state.js).
 */
export async function sendMessage({ text, chatId = defaultChat(), buttons, parseMode = 'Markdown', disableWebPagePreview = true }) {
  if (!chatId) {
    console.warn('[telegram] no chatId; set TELEGRAM_OWNER_CHAT_ID');
    return { ok: false, error: 'no_chat_id' };
  }
  const payload = {
    chat_id: chatId,
    text,
    parse_mode: parseMode,
    disable_web_page_preview: disableWebPagePreview,
  };
  if (buttons && buttons.length) {
    payload.reply_markup = { inline_keyboard: buttons };
  }
  return tgRequest('sendMessage', payload);
}

export async function editMessage({ chatId, messageId, text, buttons, parseMode = 'Markdown' }) {
  const payload = {
    chat_id: chatId,
    message_id: messageId,
    text,
    parse_mode: parseMode,
  };
  if (buttons && buttons.length) {
    payload.reply_markup = { inline_keyboard: buttons };
  }
  return tgRequest('editMessageText', payload);
}

export async function answerCallbackQuery({ callbackQueryId, text, showAlert = false }) {
  return tgRequest('answerCallbackQuery', {
    callback_query_id: callbackQueryId,
    text: text?.slice(0, 200) || undefined,
    show_alert: showAlert,
  });
}

/**
 * Validate that an incoming Telegram update is genuinely from our bot.
 * We use Telegram's `secret_token` mechanism: the webhook URL is registered
 * with `setWebhook(secret_token=...)`; Telegram echoes it back in the
 * `X-Telegram-Bot-Api-Secret-Token` header on every call.
 */
export function verifyTelegramSecret(request) {
  const expected = process.env.TELEGRAM_WEBHOOK_SECRET;
  if (!expected) return false;
  const got = request.headers.get('x-telegram-bot-api-secret-token');
  if (!got) return false;
  // timingSafeEqual requires same length — wrap with sha256 to normalise.
  const a = crypto.createHash('sha256').update(expected).digest();
  const b = crypto.createHash('sha256').update(got).digest();
  return crypto.timingSafeEqual(a, b);
}

/**
 * Validate that the chat_id matches the configured operator. We compare as
 * strings to avoid JS bigint/number footguns (Telegram chat ids can exceed
 * 2^53).
 */
export function isAuthorisedChat(chatId) {
  const owner = defaultChat();
  if (!owner || chatId == null) return false;
  return String(chatId) === String(owner);
}

/**
 * Sign a `pending_action` id so the callback_data Telegram sends back can be
 * verified server-side without trusting the user-controlled payload.
 *
 * Returns an 8-byte hex tag that comfortably fits inside the 64-byte
 * callback_data envelope.
 */
export function signActionId(actionId) {
  const key = process.env.TELEGRAM_CALLBACK_HMAC_KEY || '';
  if (!key) return '';
  return crypto.createHmac('sha256', key).update(String(actionId)).digest('hex').slice(0, 16);
}

/**
 * Verify an incoming callback_data tag against a pending_action id. Constant
 * time, no early return on length mismatch.
 */
export function verifyActionTag(actionId, tag) {
  const expected = signActionId(actionId);
  if (!expected || !tag) return false;
  if (expected.length !== tag.length) return false;
  return crypto.timingSafeEqual(Buffer.from(expected, 'utf8'), Buffer.from(tag, 'utf8'));
}
