// POST /api/agents/telegram-webhook
//
// Single entry point for Telegram → MedConnect agent updates. Telegram POSTs
// every message + callback_query to this URL after we register a webhook
// (see docs/AGENTS_SETUP.md for one-shot setup).
//
// Three layers of trust check:
//   1. `X-Telegram-Bot-Api-Secret-Token` header (set by Telegram from the
//      `secret_token` we configured at registration). HMAC-equal to
//      TELEGRAM_WEBHOOK_SECRET.
//   2. Update's chat_id must equal TELEGRAM_OWNER_CHAT_ID. Single-operator
//      MVP — no other chat is honoured.
//   3. For callback_queries: the embedded HMAC tag must match the
//      pending_action's stored callback_hmac.
//
// Phase 0 implements:
//   - /agents help, /status   (status of pending_actions across both agents)
//   - /marketing config <key>=<value> + /security config <key>=<value>
//   - mkt:ack / mkt:rej / mkt:det callback handlers (marketing
//     proposals — exec is "no-op + mark acknowledged", marketing never
//     touches code).
//
// Phases 1+ extend the same router with /marketing analizar, /security
// investigar, sec:rollback, sec:hotfix, sec:reject etc.

import { NextResponse } from 'next/server';
import { internalError, clientError } from '@/lib/errors';
import {
  verifyTelegramSecret,
  isAuthorisedChat,
  sendMessage,
  editMessage,
  answerCallbackQuery,
  verifyActionTag,
} from '@/lib/agents/telegram';
import {
  getPendingAction,
  updatePendingActionStatus,
  listOpenPendingActions,
  appendMemory,
  resolveCallbackShortId,
  setConfig,
  getConfig,
} from '@/lib/agents/state';

export const dynamic = 'force-dynamic';

export async function POST(request) {
  // 1. Trust the wrapping bytes only after the secret-token header passes.
  if (!verifyTelegramSecret(request)) {
    return clientError('forbidden', 403);
  }

  let update;
  try {
    update = await request.json();
  } catch {
    return clientError('invalid json', 400);
  }

  try {
    if (update.callback_query) {
      return await handleCallback(update.callback_query);
    }
    if (update.message) {
      return await handleMessage(update.message);
    }
    // Edited messages, channel posts, etc. — silently ack.
    return NextResponse.json({ ok: true, ignored: true });
  } catch (err) {
    return internalError(err, '[telegram-webhook]');
  }
}

// ---------------------------------------------------------------------------
// Message router
// ---------------------------------------------------------------------------

async function handleMessage(message) {
  const chatId = message?.chat?.id;
  if (!isAuthorisedChat(chatId)) {
    // Reply but reveal nothing.
    await sendMessage({
      chatId,
      text: 'No autorizado.',
    });
    return NextResponse.json({ ok: true, unauthorised: true });
  }

  const text = String(message?.text || '').trim();
  if (!text) return NextResponse.json({ ok: true });

  const [head, ...rest] = text.split(/\s+/);
  const cmd = head.toLowerCase();
  const args = rest.join(' ');

  switch (cmd) {
    case '/start':
    case '/agents':
    case '/help':
      return sendHelp(chatId);
    case '/status':
      return sendStatus(chatId);
    case '/marketing':
      return handleMarketingCommand(chatId, rest);
    case '/security':
      return handleSecurityCommand(chatId, rest);
    default:
      await sendMessage({
        chatId,
        text: `Comando no reconocido: \`${cmd}\`\nUsa \`/agents\` para la ayuda.`,
      });
      return NextResponse.json({ ok: true });
  }
}

async function sendHelp(chatId) {
  const help = [
    '*MedConnect Agentes*',
    '',
    '*Marketing*',
    '`/marketing analizar [7d|30d]` — análisis bajo demanda (Fase 1)',
    '`/marketing config <key>=<value>` — ajusta configuración',
    '',
    '*Security*',
    '`/security investigar <issue_id>` — analiza un issue Sentry (Fase 2)',
    '`/security config <key>=<value>` — ajusta configuración',
    '',
    '*General*',
    '`/status` — pendientes abiertos',
    '`/agents` — esta ayuda',
  ].join('\n');
  await sendMessage({ chatId, text: help });
  return NextResponse.json({ ok: true });
}

async function sendStatus(chatId) {
  const open = await listOpenPendingActions({ limit: 10 });
  if (open.length === 0) {
    await sendMessage({ chatId, text: '_Sin propuestas pendientes._' });
    return NextResponse.json({ ok: true });
  }
  const lines = ['*Pendientes abiertos*', ''];
  for (const a of open) {
    const ageMin = Math.round((Date.now() - new Date(a.created_at).getTime()) / 60000);
    lines.push(`• \`${a.agent}\` · ${a.title} _(${ageMin} min, riesgo: ${a.risk_level})_`);
  }
  await sendMessage({ chatId, text: lines.join('\n') });
  return NextResponse.json({ ok: true });
}

async function handleMarketingCommand(chatId, parts) {
  const sub = (parts[0] || '').toLowerCase();
  if (sub === 'config') {
    return handleConfigCommand({ chatId, agent: 'marketing', kvString: parts.slice(1).join(' ') });
  }
  if (sub === 'analizar') {
    // Phase 1 will dispatch to /api/agents/marketing/run. For now we ack so
    // the operator knows the routing works.
    await sendMessage({
      chatId,
      text: '_Agente de marketing pendiente de Fase 1. Endpoint y lógica vendrán a continuación._',
    });
    return NextResponse.json({ ok: true });
  }
  await sendMessage({
    chatId,
    text: 'Uso: `/marketing analizar [7d|30d]` o `/marketing config <key>=<value>`',
  });
  return NextResponse.json({ ok: true });
}

async function handleSecurityCommand(chatId, parts) {
  const sub = (parts[0] || '').toLowerCase();
  if (sub === 'config') {
    return handleConfigCommand({ chatId, agent: 'security', kvString: parts.slice(1).join(' ') });
  }
  if (sub === 'investigar') {
    await sendMessage({
      chatId,
      text: '_Agente de seguridad pendiente de Fase 2. Webhook Sentry y tools llegarán después._',
    });
    return NextResponse.json({ ok: true });
  }
  await sendMessage({
    chatId,
    text: 'Uso: `/security investigar <issue_id>` o `/security config <key>=<value>`',
  });
  return NextResponse.json({ ok: true });
}

async function handleConfigCommand({ chatId, agent, kvString }) {
  if (!kvString) {
    const current = await getConfig(agent);
    const lines = [`*Config ${agent}*`, ''];
    for (const [k, v] of Object.entries(current)) {
      lines.push(`\`${k}\` = \`${v}\``);
    }
    await sendMessage({ chatId, text: lines.join('\n') || '_(vacío)_' });
    return NextResponse.json({ ok: true });
  }
  const eq = kvString.indexOf('=');
  if (eq < 1) {
    await sendMessage({ chatId, text: 'Formato: `<key>=<value>`' });
    return NextResponse.json({ ok: true });
  }
  const key = kvString.slice(0, eq).trim();
  const value = kvString.slice(eq + 1).trim();
  await setConfig({ agent, key, value });
  await sendMessage({ chatId, text: `✓ \`${agent}.${key}\` = \`${value}\`` });
  return NextResponse.json({ ok: true });
}

// ---------------------------------------------------------------------------
// Callback router (button presses)
// ---------------------------------------------------------------------------
//
// callback_data envelope: `<agent>:<verb>:<shortId>:<hmacTag>`
//   agent: mkt | sec
//   verb:  ack | rej | det | exec
//   shortId: 12-char hex (resolves to the pending_action UUID via Redis)
//   hmacTag: 16-char hex (HMAC-SHA256(action_id) truncated)
//
// Total length stays well under Telegram's 64-byte cap.

async function handleCallback(callback) {
  const chatId = callback?.message?.chat?.id;
  if (!isAuthorisedChat(chatId)) {
    await answerCallbackQuery({ callbackQueryId: callback.id, text: 'No autorizado.' });
    return NextResponse.json({ ok: true, unauthorised: true });
  }

  const data = String(callback.data || '');
  const parts = data.split(':');
  if (parts.length !== 4) {
    await answerCallbackQuery({ callbackQueryId: callback.id, text: 'Callback inválido.' });
    return NextResponse.json({ ok: true });
  }
  const [agent, verb, shortId, tag] = parts;
  if (!['mkt', 'sec'].includes(agent)) {
    await answerCallbackQuery({ callbackQueryId: callback.id, text: 'Agente desconocido.' });
    return NextResponse.json({ ok: true });
  }

  const actionId = await resolveCallbackShortId(shortId);
  if (!actionId) {
    await answerCallbackQuery({ callbackQueryId: callback.id, text: 'Acción expirada.' });
    return NextResponse.json({ ok: true });
  }

  // HMAC tag verification — defends against attacker re-using a leaked
  // shortId from any other action.
  if (!verifyActionTag(actionId, tag)) {
    await answerCallbackQuery({ callbackQueryId: callback.id, text: 'Firma inválida.' });
    return NextResponse.json({ ok: true });
  }

  const action = await getPendingAction(actionId);
  if (!action) {
    await answerCallbackQuery({ callbackQueryId: callback.id, text: 'Acción no encontrada.' });
    return NextResponse.json({ ok: true });
  }
  if (action.status !== 'pending') {
    await answerCallbackQuery({ callbackQueryId: callback.id, text: `Estado: ${action.status}` });
    return NextResponse.json({ ok: true });
  }

  // Marketing handlers — Phase 0 covers all three.
  if (agent === 'mkt') {
    return handleMarketingCallback({ callback, action, verb });
  }

  // Security handlers — Phase 0 just acknowledges; full exec lives in Phase 2/3.
  if (agent === 'sec') {
    return handleSecurityCallback({ callback, action, verb });
  }

  return NextResponse.json({ ok: true });
}

async function handleMarketingCallback({ callback, action, verb }) {
  if (verb === 'ack') {
    await updatePendingActionStatus({ id: action.id, status: 'acknowledged' });
    await appendMemory({
      agent: 'marketing',
      topic: 'acknowledged_proposals',
      content: { actionId: action.id, title: action.title },
    });
    await answerCallbackQuery({ callbackQueryId: callback.id, text: '✓ Aceptada.' });
    if (action.telegram_chat_id && action.telegram_message_id) {
      await editMessage({
        chatId: action.telegram_chat_id,
        messageId: action.telegram_message_id,
        text: `✅ *Aceptada* — ${action.title}`,
      });
    }
    return NextResponse.json({ ok: true });
  }
  if (verb === 'rej') {
    await updatePendingActionStatus({ id: action.id, status: 'rejected' });
    await appendMemory({
      agent: 'marketing',
      topic: 'rejected_proposals',
      content: { actionId: action.id, title: action.title, rationale: action.rationale },
    });
    await answerCallbackQuery({ callbackQueryId: callback.id, text: '✗ Rechazada.' });
    if (action.telegram_chat_id && action.telegram_message_id) {
      await editMessage({
        chatId: action.telegram_chat_id,
        messageId: action.telegram_message_id,
        text: `❌ *Rechazada* — ${action.title}`,
      });
    }
    return NextResponse.json({ ok: true });
  }
  if (verb === 'det') {
    await answerCallbackQuery({ callbackQueryId: callback.id });
    let argsPreview = '';
    try {
      const args = JSON.parse(action.args_json || '{}');
      argsPreview = '```json\n' + JSON.stringify(args, null, 2).slice(0, 1500) + '\n```';
    } catch {/* ignore */}
    await sendMessage({
      chatId: callback.message.chat.id,
      text: [
        `*${action.title}*`,
        '',
        action.rationale || '_(sin rationale)_',
        '',
        argsPreview,
      ].join('\n'),
    });
    return NextResponse.json({ ok: true });
  }
  await answerCallbackQuery({ callbackQueryId: callback.id, text: 'Verbo no soportado.' });
  return NextResponse.json({ ok: true });
}

async function handleSecurityCallback({ callback, action, verb }) {
  // Phase 2/3 will dispatch to the security executor module. For Phase 0 we
  // record the choice so we can review the wiring end-to-end.
  if (verb === 'rej') {
    await updatePendingActionStatus({ id: action.id, status: 'rejected' });
    await answerCallbackQuery({ callbackQueryId: callback.id, text: '✗ Ignorada.' });
    if (action.telegram_chat_id && action.telegram_message_id) {
      await editMessage({
        chatId: action.telegram_chat_id,
        messageId: action.telegram_message_id,
        text: `❌ *Ignorada* — ${action.title}`,
      });
    }
    return NextResponse.json({ ok: true });
  }
  if (verb === 'exec' || verb === 'ack') {
    await answerCallbackQuery({
      callbackQueryId: callback.id,
      text: 'Ejecutor de seguridad pendiente de Fase 2/3.',
      showAlert: true,
    });
    return NextResponse.json({ ok: true });
  }
  await answerCallbackQuery({ callbackQueryId: callback.id, text: 'Verbo no soportado.' });
  return NextResponse.json({ ok: true });
}
