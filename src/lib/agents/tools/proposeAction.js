// `propose_action` tool — the marketing agent's only "side-effect" tool.
//
// Marketing never edits code; instead each finding becomes a row in
// `pending_actions` plus a Telegram message with [Aceptar] [Rechazar]
// [Detalle] inline buttons. The operator's button press ends the lifecycle.
//
// The tool returns the action id and shortId so the model can string several
// proposals into one Telegram digest message if it wants. By default each
// proposal is sent as its own card to keep approvals atomic.

import { createPendingAction, attachTelegramMessage } from '@/lib/agents/state';
import { sendMessage } from '@/lib/agents/telegram';

const RISK_LEVELS = new Set(['low', 'medium', 'high']);

/**
 * @param {object} args
 * @param {'marketing'|'security'} args.agent
 * @param {string} args.type            — Free-form bucket label (e.g. 'meta_tag_change', 'campaign_pause').
 * @param {string} args.title           — One-line headline shown in Telegram.
 * @param {string} args.rationale       — Markdown-friendly explanation.
 * @param {string} [args.expectedImpact]
 * @param {object} [args.payload]       — Structured details the operator (or a future executor) reads.
 * @param {string} [args.riskLevel]     — 'low' | 'medium' | 'high'. Default low.
 * @param {number} [args.ttlDays]       — Defaults: marketing=7, security=1h elsewhere.
 * @param {boolean} [args.includeButtons] — false for security mode where the route is provided externally.
 */
export async function proposeAction({
  agent,
  type,
  title,
  rationale,
  expectedImpact,
  payload,
  riskLevel = 'low',
  ttlDays,
  includeButtons = true,
} = {}) {
  if (!agent || !title) {
    return { error: 'agent and title are required' };
  }
  const risk = RISK_LEVELS.has(riskLevel) ? riskLevel : 'low';
  const days = Number.isFinite(Number(ttlDays)) ? Number(ttlDays) : 7;
  const ttlSeconds = days * 24 * 3600;

  const args = {
    type: String(type || 'unknown').slice(0, 60),
    title: String(title).slice(0, 250),
    rationale: rationale ? String(rationale) : null,
    expectedImpact: expectedImpact ? String(expectedImpact).slice(0, 500) : null,
    payload: payload ?? null,
  };

  let action;
  try {
    action = await createPendingAction({
      agent,
      tool: 'propose_action',
      title: args.title,
      rationale: args.rationale,
      args,
      riskLevel: risk,
      ttlSeconds,
    });
  } catch (err) {
    return { error: err?.message || 'failed to persist proposal' };
  }

  // Build the Telegram message. Marketing prefix is `mkt:`, security is `sec:`.
  const prefix = agent === 'marketing' ? 'mkt' : 'sec';
  const buttons = includeButtons ? [[
    { text: '✅ Aceptar', callback_data: `${prefix}:ack:${action.shortId}:${action.hmac}` },
    { text: '❌ Rechazar', callback_data: `${prefix}:rej:${action.shortId}:${action.hmac}` },
    { text: '🔎 Detalle', callback_data: `${prefix}:det:${action.shortId}:${action.hmac}` },
  ]] : undefined;

  const lines = [
    `*${args.title}*`,
    args.rationale ? '' : null,
    args.rationale ? args.rationale : null,
    args.expectedImpact ? `\n_Impacto estimado:_ ${args.expectedImpact}` : null,
    `\n_Riesgo: ${risk}_`,
  ].filter((x) => x !== null && x !== undefined);

  const sent = await sendMessage({
    text: lines.join('\n'),
    buttons,
  });

  if (sent?.ok && sent.message_id && sent.chat?.id) {
    await attachTelegramMessage({
      id: action.id,
      chatId: sent.chat.id,
      messageId: sent.message_id,
    });
  }

  return {
    actionId: action.id,
    shortId: action.shortId,
    risk,
    expiresInDays: days,
    telegramSent: !!sent?.ok,
  };
}

export const PROPOSE_ACTION_TOOL_SCHEMA = {
  name: 'propose_action',
  description:
    'Crea una propuesta accionable y la manda al operador por Telegram con botones [Aceptar] [Rechazar] [Detalle]. ' +
    'Marketing usa esta herramienta para CADA hallazgo accionable. La función serializa el payload y NO ejecuta cambios — ' +
    'el operador es siempre quien decide. Devuelve actionId y shortId.',
  input_schema: {
    type: 'object',
    properties: {
      type: {
        type: 'string',
        description:
          'Etiqueta corta del tipo: "meta_tag_change", "copy_change", "landing_create", "landing_consolidate", ' +
          '"campaign_pause", "campaign_budget_shift", "keyword_add", "keyword_negative", "cta_test", ' +
          '"layout_test", "internal_link_add", "json_ld_fix", "speed_optimization", "other".',
      },
      title: { type: 'string', description: 'Una línea, ≤ 250 chars. Ej: "Pausar campaña Dermatología-Madrid (CPC 4,2 €, conv 0,3 %)".' },
      rationale: { type: 'string', description: 'Markdown OK. Por qué propones esto, con números concretos.' },
      expectedImpact: { type: 'string', description: 'Impacto estimado cuantitativo si aplica. Ej: "-180 EUR/sem en gasto, +2 conversiones/sem netas".' },
      payload: {
        type: 'object',
        description:
          'Detalles estructurados que sirven para que el operador o un futuro ejecutor aplique el cambio. ' +
          'Ej para meta_tag_change: { "url": "/especialistas/cardiologia/madrid", "field": "title", "from": "...", "to": "..." }',
      },
      riskLevel: { type: 'string', enum: ['low', 'medium', 'high'] },
    },
    required: ['type', 'title', 'rationale'],
  },
};
