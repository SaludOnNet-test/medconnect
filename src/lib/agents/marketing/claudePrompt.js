// Helpers that translate an accepted marketing proposal into a ready-to-use
// Claude Code prompt (plain text) + a claude.ai deep link.
//
// Why: when the operator hits [Aceptar] on a Telegram card, we want to hand
// off the proposal to a Claude session with enough context that the session
// can plan + implement without re-discovering the codebase. The prompt asks
// for plan mode explicitly — the operator approves the plan from desktop or
// mobile, then the model executes.
//
// claude.ai supports pre-filling a new chat with the `q` query param at
// `https://claude.ai/new?q=...`. Browsers cap URL length at ~8 KB; we
// truncate the embedded JSON payload (not the title/rationale/instructions)
// to keep the URL safe while keeping the full prompt visible as text in
// the Telegram message above the button for copy-paste fallback.

const URL_PROMPT_CAP = 6000; // safely below the practical browser URL limit
const PAYLOAD_PREVIEW_CAP = 2000;

/**
 * Build the prompt that we'll seed into Claude. Same body is shown verbatim
 * in Telegram (code block) and used as `?q=` for the URL.
 *
 * @param {object} action — a row from pending_actions.
 * @param {string} action.id
 * @param {string} action.title
 * @param {string} action.rationale
 * @param {string} action.args_json  raw JSON the propose_action tool wrote
 * @param {string} action.created_at
 */
export function buildClaudeCodePrompt(action) {
  let args = {};
  try { args = JSON.parse(action.args_json || '{}'); } catch {/* leave empty */}

  const payload = args?.payload ?? null;
  const expectedImpact = args?.expectedImpact || null;
  const type = args?.type || 'other';
  const proposalDate = (action.created_at instanceof Date)
    ? action.created_at.toISOString().slice(0, 10)
    : String(action.created_at || '').slice(0, 10);

  const lines = [];
  lines.push(`[Origen: Marketing Agent de MedConnect — propuesta aprobada ${proposalDate}]`);
  lines.push('');
  lines.push(`# ${action.title}`);
  lines.push('');
  lines.push(`Tipo de cambio propuesto: \`${type}\``);
  if (expectedImpact) {
    lines.push(`Impacto estimado por el agente: ${expectedImpact}`);
  }
  lines.push('');
  lines.push('## Análisis del agente');
  lines.push('');
  lines.push(action.rationale || '_(sin análisis adicional)_');
  if (payload !== null && payload !== undefined) {
    lines.push('');
    lines.push('## Detalles estructurados (payload)');
    lines.push('');
    let payloadStr;
    try {
      payloadStr = JSON.stringify(payload, null, 2);
    } catch {
      payloadStr = String(payload);
    }
    if (payloadStr.length > PAYLOAD_PREVIEW_CAP) {
      payloadStr = payloadStr.slice(0, PAYLOAD_PREVIEW_CAP) + '\n…(truncado)';
    }
    lines.push('```json');
    lines.push(payloadStr);
    lines.push('```');
  }
  lines.push('');
  lines.push('## Contexto del repositorio');
  lines.push('');
  lines.push('- Repo: `github.com/SaludOnNet-test/medconnect` rama `main`.');
  lines.push('- Stack: Next.js 16, React 19, Vercel, Azure SQL (mssql), Clerk, Stripe, Resend.');
  lines.push('- El agente lee de `analytics_events`, `bookings`, `referrals` y de las landings SEO en `src/app/especialistas/[especialidad]/[ciudad]/page.js`.');
  lines.push('- Las reglas internas viven en `.claude/rules/` (lenguaje EN para identificadores, etc.).');
  lines.push('');
  lines.push('## Instrucciones');
  lines.push('');
  lines.push('1. **ENTRA en plan mode.** No edites código todavía.');
  lines.push('2. Lee los ficheros que la propuesta sugiere y los relacionados.');
  lines.push('3. Propón un plan de implementación detallado con archivos concretos + diffs aproximados.');
  lines.push('4. **Espera mi aprobación** antes de aplicar cambios.');
  lines.push('5. Tras aprobar: implementa, verifica `next build`, crea un PR.');
  lines.push('');
  lines.push('Si la propuesta es ambigua o falta contexto, pregúntame antes de seguir.');

  return lines.join('\n');
}

/**
 * Build the deep-link URL that opens claude.ai with the prompt pre-filled.
 * Returns the URL plus a `truncated` flag so the caller can warn the user
 * if the embedded text had to be shortened.
 */
export function buildClaudeUrl(promptText) {
  const base = 'https://claude.ai/new';
  let toEncode = promptText;
  let truncated = false;
  if (toEncode.length > URL_PROMPT_CAP) {
    toEncode = toEncode.slice(0, URL_PROMPT_CAP) +
      '\n…(prompt truncado en el deep link — copia el texto completo del mensaje anterior si lo necesitas)';
    truncated = true;
  }
  const url = `${base}?q=${encodeURIComponent(toEncode)}`;
  return { url, truncated };
}
