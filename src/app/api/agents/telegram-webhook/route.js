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

import { NextResponse, after } from 'next/server';
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
  listPendingActionsByStatus,
  appendMemory,
  resolveCallbackShortId,
  storeCallbackShortId,
  setConfig,
  getConfig,
} from '@/lib/agents/state';
import { runMarketingAgent } from '@/lib/agents/marketing/run';
import {
  buildClaudeCodePrompt,
  buildClaudeUrl,
} from '@/lib/agents/marketing/claudePrompt';
import { signActionId } from '@/lib/agents/telegram';
import { runSecurityAgent } from '@/lib/agents/security/run';
import { rollbackVercel } from '@/lib/agents/tools/vercel';
import { proposeHotfixPr } from '@/lib/agents/tools/github';

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
    '*Marketing* (manual, no hay cron)',
    '`/marketing analizar [7d|30d]` — analiza ahora.',
    '`/marketing config <key>=<value>` — ajusta configuración.',
    '',
    '_Flujo de aceptar:_ cuando aceptes una propuesta, el bot te genera un',
    'prompt para Claude (plan mode) y dos botones: 🚀 abrir en Claude ahora,',
    'o 📌 guardar para más tarde (queda en `/status`).',
    '',
    '*Security*',
    '`/security investigar <issue_id>` — analiza un issue Sentry.',
    '`/security config <key>=<value>` — ajusta configuración.',
    '',
    '*General*',
    '`/status` — pendientes, aceptadas listas, guardadas para después.',
    '`/agents` — esta ayuda.',
  ].join('\n');
  await sendMessage({ chatId, text: help });
  return NextResponse.json({ ok: true });
}

async function sendStatus(chatId) {
  // Three buckets the operator cares about:
  //   - pending: still needs a yes/no.
  //   - accepted_pending_exec: said yes, prompt generated, not opened yet.
  //   - saved_for_later: deliberately parked; run when convenient.
  const [pendingRows, acceptedRows, savedRows] = await Promise.all([
    listOpenPendingActions({ limit: 10 }),
    listPendingActionsByStatus({ statuses: ['accepted_pending_exec'], limit: 10 }),
    listPendingActionsByStatus({ statuses: ['saved_for_later'], limit: 10 }),
  ]);

  if (pendingRows.length === 0 && acceptedRows.length === 0 && savedRows.length === 0) {
    await sendMessage({ chatId, text: '_Sin propuestas pendientes._' });
    return NextResponse.json({ ok: true });
  }

  const fmtAge = (createdAt) => {
    const minutes = Math.round((Date.now() - new Date(createdAt).getTime()) / 60000);
    if (minutes < 60) return `${minutes} min`;
    const hours = Math.round(minutes / 60);
    if (hours < 48) return `${hours} h`;
    return `${Math.round(hours / 24)} d`;
  };

  const block = (title, rows) => {
    if (rows.length === 0) return null;
    const out = [`*${title}*`, ''];
    for (const a of rows) {
      out.push(`• \`${a.agent}\` · ${a.title} _(${fmtAge(a.created_at)}, riesgo: ${a.risk_level})_`);
    }
    return out.join('\n');
  };

  const parts = [
    block('Pendientes de decisión', pendingRows),
    block('Aceptadas, listas para ejecutar', acceptedRows),
    block('Guardadas para después', savedRows),
  ].filter(Boolean);

  await sendMessage({ chatId, text: parts.join('\n\n') });
  return NextResponse.json({ ok: true });
}

async function handleMarketingCommand(chatId, parts) {
  const sub = (parts[0] || '').toLowerCase();
  if (sub === 'config') {
    return handleConfigCommand({ chatId, agent: 'marketing', kvString: parts.slice(1).join(' ') });
  }
  if (sub === 'analizar') {
    // Parse optional period: "7d", "14d", "30d". Default 7.
    const periodArg = (parts[1] || '7d').toLowerCase();
    const m = periodArg.match(/^(\d+)d?$/);
    const periodDays = m ? Math.max(1, Math.min(60, Number(m[1]))) : 7;

    await sendMessage({
      chatId,
      text: `🔄 _Iniciando análisis de los últimos ${periodDays} días… te aviso cuando termine._`,
    });

    // The full run can take 30-60 s. We use Next.js `after()` to defer it
    // until *after* the 200 OK response goes back to Telegram, so the bot
    // doesn't timeout (and doesn't retry the same update).
    after(async () => {
      try {
        await runMarketingAgent({ trigger: 'manual', periodDays });
      } catch (err) {
        await sendMessage({
          chatId,
          text: `*[MKT] Error*: \`${String(err?.message || err).slice(0, 200)}\``,
        }).catch(() => {});
      }
    });
    return NextResponse.json({ ok: true, deferred: true });
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
    const issueId = (parts[1] || '').trim();
    if (!issueId) {
      await sendMessage({ chatId, text: 'Uso: `/security investigar <issueId>`' });
      return NextResponse.json({ ok: true });
    }
    await sendMessage({
      chatId,
      text: `🔍 _Investigando issue \`${issueId}\` …_`,
    });
    after(async () => {
      try {
        await runSecurityAgent({ trigger: 'manual', issueId });
      } catch (err) {
        await sendMessage({
          chatId,
          text: `*[SEC] Error*: \`${String(err?.message || err).slice(0, 200)}\``,
        }).catch(() => {});
      }
    });
    return NextResponse.json({ ok: true, deferred: true });
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
  // NOTE: We deliberately do NOT reject non-`pending` statuses here. Each
  // verb checks what status it accepts (e.g. `save` only fires after an
  // `ack` has flipped the row to `accepted_pending_exec`).

  // Marketing handlers.
  if (agent === 'mkt') {
    return handleMarketingCallback({ callback, action, verb });
  }

  // Security handlers.
  if (agent === 'sec') {
    return handleSecurityCallback({ callback, action, verb });
  }

  return NextResponse.json({ ok: true });
}

async function handleMarketingCallback({ callback, action, verb }) {
  if (verb === 'ack') {
    if (action.status !== 'pending') {
      await answerCallbackQuery({ callbackQueryId: callback.id, text: `Estado: ${action.status}` });
      return NextResponse.json({ ok: true });
    }
    // 1. Update the row and persist memory.
    await updatePendingActionStatus({ id: action.id, status: 'accepted_pending_exec' });
    await appendMemory({
      agent: 'marketing',
      topic: 'acknowledged_proposals',
      content: { actionId: action.id, title: action.title },
    });

    // 2. Build the Claude Code prompt + deep link.
    const promptText = buildClaudeCodePrompt(action);
    const { url: claudeUrl, truncated } = buildClaudeUrl(promptText);

    // 3. Acknowledge the button click quickly (Telegram closes the spinner).
    await answerCallbackQuery({ callbackQueryId: callback.id, text: '✓ Aceptada.' });

    // 4. Edit the original card to point at the new message.
    if (action.telegram_chat_id && action.telegram_message_id) {
      await editMessage({
        chatId: action.telegram_chat_id,
        messageId: action.telegram_message_id,
        text: `✅ *Aceptada* — ${action.title}\n_Prompt para Claude generado en el siguiente mensaje._`,
      });
    }

    // 5. Generate a fresh shortId mapping for the new card's callback button
    //    (so an attacker can't replay the old `ack` shortId on a different
    //    verb; old shortId still resolves to the same action but no verb
    //    accepts it now in `pending` state).
    const newShortId = await storeCallbackShortId(action.id);
    const hmacTag = signActionId(action.id);

    // 6. Send the prompt as a copy-friendly message + the two action buttons.
    //    Markdown code fence preserves whitespace + lets the user tap-hold to
    //    copy on mobile.
    const lines = [
      '*Prompt para Claude (plan mode)*',
      '',
      'Pulsa el botón para abrir Claude en plan mode con este prompt cargado. ' +
        'Si quieres pinearlo en la sidebar de Claude Code, ábrelo primero y luego pin.',
      '',
      '```',
      promptText.slice(0, 3500), // Telegram message body cap ~4096 chars
      '```',
    ];
    if (truncated) {
      lines.push('');
      lines.push('_El deep link va truncado por límite de URL; el prompt completo está arriba (cópialo si lo necesitas íntegro)._');
    }
    if (promptText.length > 3500) {
      lines.push('');
      lines.push('_Prompt largo: el bloque está recortado; usa el botón para abrirlo completo o copia desde el deep link._');
    }

    const buttons = [[
      { text: '🚀 Abrir en Claude (plan mode)', url: claudeUrl },
      { text: '📌 Guardar para después', callback_data: `mkt:save:${newShortId}:${hmacTag}` },
    ]];

    await sendMessage({
      chatId: callback.message.chat.id,
      text: lines.join('\n'),
      buttons,
    });

    return NextResponse.json({ ok: true });
  }

  if (verb === 'save') {
    if (action.status !== 'accepted_pending_exec') {
      await answerCallbackQuery({
        callbackQueryId: callback.id,
        text: `No guardable en estado: ${action.status}`,
      });
      return NextResponse.json({ ok: true });
    }
    await updatePendingActionStatus({ id: action.id, status: 'saved_for_later' });
    await appendMemory({
      agent: 'marketing',
      topic: 'saved_for_later',
      content: { actionId: action.id, title: action.title },
    });
    await answerCallbackQuery({ callbackQueryId: callback.id, text: '📌 Guardada.' });

    // Edit the prompt message in place: drop the "Guardar" button, keep
    // "Abrir en Claude" so the operator can launch when ready.
    if (callback.message?.message_id) {
      // Re-build the URL from the same prompt — we don't have the text in
      // memory here, so re-derive from the action row.
      const promptText = buildClaudeCodePrompt(action);
      const { url: claudeUrl } = buildClaudeUrl(promptText);
      const newButtons = [[
        { text: '🚀 Abrir en Claude (plan mode)', url: claudeUrl },
      ]];
      await editMessage({
        chatId: callback.message.chat.id,
        messageId: callback.message.message_id,
        text:
          `📌 *Guardada para después* — ${action.title}\n\n` +
          'Cuando quieras lanzarla, pulsa el botón para abrir Claude.',
        buttons: newButtons,
      });
    }
    return NextResponse.json({ ok: true });
  }

  if (verb === 'rej') {
    if (action.status !== 'pending') {
      await answerCallbackQuery({ callbackQueryId: callback.id, text: `Estado: ${action.status}` });
      return NextResponse.json({ ok: true });
    }
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
  if (verb === 'rej') {
    if (action.status !== 'pending') {
      await answerCallbackQuery({ callbackQueryId: callback.id, text: `Estado: ${action.status}` });
      return NextResponse.json({ ok: true });
    }
    await updatePendingActionStatus({ id: action.id, status: 'rejected' });
    await appendMemory({
      agent: 'security',
      topic: 'rejected_proposals',
      content: { actionId: action.id, title: action.title, rationale: action.rationale },
    });
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

  if (verb === 'det') {
    await answerCallbackQuery({ callbackQueryId: callback.id });
    let argsPreview = '';
    try {
      const args = JSON.parse(action.args_json || '{}');
      argsPreview = '```json\n' + JSON.stringify(args, null, 2).slice(0, 1500) + '\n```';
    } catch {/* ignore */}
    await sendMessage({
      chatId: callback.message.chat.id,
      text: [`*${action.title}*`, '', action.rationale || '_(sin rationale)_', '', argsPreview].join('\n'),
    });
    return NextResponse.json({ ok: true });
  }

  // ack / exec → execute the proposed action server-side.
  if (verb === 'ack' || verb === 'exec') {
    if (action.status !== 'pending') {
      await answerCallbackQuery({ callbackQueryId: callback.id, text: `Estado: ${action.status}` });
      return NextResponse.json({ ok: true });
    }
    let parsedArgs = {};
    try { parsedArgs = JSON.parse(action.args_json || '{}'); } catch {/* leave empty */}
    const actionType = String(parsedArgs.type || '').toLowerCase();
    const payload = parsedArgs.payload || {};

    let result;
    try {
      if (actionType === 'rollback') {
        result = await rollbackVercel({
          deploymentId: payload.deploymentId,
          reason: payload.reason || `operator-approved rollback (action ${action.id})`,
        });
      } else if (actionType === 'hotfix_pr') {
        result = await proposeHotfixPr({
          branch: payload.branch,
          files: payload.files || [],
          title: payload.title || action.title,
          body: payload.body || action.rationale,
        });
      } else {
        // Generic "investigation_summary" or "other" — nothing to execute.
        result = { ok: true, noop: true, type: actionType };
      }
    } catch (err) {
      result = { error: err?.message || String(err) };
    }

    const okStatus = result?.ok && !result?.error;
    await updatePendingActionStatus({
      id: action.id,
      status: okStatus ? 'executed' : 'failed',
      resultJson: result,
    });
    await appendMemory({
      agent: 'security',
      topic: 'executed_actions',
      content: { actionId: action.id, type: actionType, ok: okStatus, result },
    });

    await answerCallbackQuery({
      callbackQueryId: callback.id,
      text: okStatus ? '✓ Ejecutada.' : `✗ Falló: ${(result?.error || '').slice(0, 80)}`,
      showAlert: !okStatus,
    });
    if (action.telegram_chat_id && action.telegram_message_id) {
      const headline = okStatus
        ? `✅ *Ejecutada* — ${action.title}`
        : `⚠️ *Falló* — ${action.title}\n\n\`${(result?.error || '').slice(0, 200)}\``;
      const tail = result?.prUrl ? `\n\n[PR](${result.prUrl})` : '';
      await editMessage({
        chatId: action.telegram_chat_id,
        messageId: action.telegram_message_id,
        text: headline + tail,
      });
    }
    return NextResponse.json({ ok: true, executed: okStatus });
  }

  await answerCallbackQuery({ callbackQueryId: callback.id, text: 'Verbo no soportado.' });
  return NextResponse.json({ ok: true });
}
