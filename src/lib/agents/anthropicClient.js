// Shared Anthropic client for the marketing + security agents.
//
// Why a wrapper instead of new Anthropic() everywhere:
//   1. Prompt caching — system prompts and tool definitions are stable across
//      runs. Caching them cuts input cost ~90% on repeat calls. Setting
//      `cache_control: { type: 'ephemeral' }` is the only opt-in needed.
//   2. Sane timeouts — the SDK defaults to no timeout, which on Vercel pins
//      a Lambda for the full ceiling. We give Claude 60 s, plenty for a
//      multi-tool turn.
//   3. Cost telemetry — one place to extract token usage so the orchestrator
//      can persist it to agent_runs without each caller re-implementing.
//
// Public API:
//   - getClient(): returns the singleton Anthropic instance.
//   - DEFAULT_MODEL: the env-driven model id (override with ANTHROPIC_MODEL).
//   - estimateCostUsd(usage): rough $ estimate from a `messages.usage` object.
//   - withCache(blocks): helper to mark the LAST text block in a system prompt
//     as cacheable. Pass it to messages.create({ system: withCache(...) }).

import Anthropic from '@anthropic-ai/sdk';

let _client = null;

export function getClient() {
  if (_client) return _client;
  if (!process.env.ANTHROPIC_API_KEY) {
    throw new Error('ANTHROPIC_API_KEY not configured');
  }
  _client = new Anthropic({
    apiKey: process.env.ANTHROPIC_API_KEY,
    timeout: 60_000,
    maxRetries: 1,
  });
  return _client;
}

// Default to Sonnet 4.5 — cheaper and fast enough for this kind of analysis.
// Override with ANTHROPIC_MODEL env var (e.g. 'claude-opus-4-5' for the
// security agent on critical incidents).
export const DEFAULT_MODEL = process.env.ANTHROPIC_MODEL || 'claude-sonnet-4-5';

// Pricing (USD per million tokens). Update if Anthropic shifts pricing —
// these are correct as of 2026-05.
const PRICING = {
  // Sonnet 4.5 / 4.7
  'claude-sonnet-4-5': { in: 3, out: 15, cacheWrite: 3.75, cacheRead: 0.30 },
  'claude-sonnet-4-7': { in: 3, out: 15, cacheWrite: 3.75, cacheRead: 0.30 },
  // Opus 4.5
  'claude-opus-4-5':   { in: 15, out: 75, cacheWrite: 18.75, cacheRead: 1.50 },
  // Haiku 4.5 (fallback if added later)
  'claude-haiku-4-5':  { in: 1, out: 5, cacheWrite: 1.25, cacheRead: 0.10 },
};

/**
 * Rough USD cost from a `messages.usage` payload. Returns 0 if the model isn't
 * in our pricing table (caller should still log tokens to investigate later).
 */
export function estimateCostUsd(usage, model = DEFAULT_MODEL) {
  if (!usage) return 0;
  const p = PRICING[model] || PRICING['claude-sonnet-4-5'];
  const inTok        = Number(usage.input_tokens || 0);
  const outTok       = Number(usage.output_tokens || 0);
  const cacheWrite   = Number(usage.cache_creation_input_tokens || 0);
  const cacheRead    = Number(usage.cache_read_input_tokens || 0);
  const cost =
    (inTok       * p.in)         / 1_000_000 +
    (outTok      * p.out)        / 1_000_000 +
    (cacheWrite  * p.cacheWrite) / 1_000_000 +
    (cacheRead   * p.cacheRead)  / 1_000_000;
  return Math.round(cost * 10000) / 10000;
}

/**
 * Mark a system prompt for prompt caching. Anthropic caches up to the LAST
 * block flagged with `cache_control`, so we always wrap the final text block.
 * The system prompt + tool definitions both live in this prefix so the cache
 * hit is maximal across runs.
 *
 * Pass either a string (wrapped to a single text block) or an array of
 * content blocks.
 */
export function withCache(systemPrompt) {
  if (!systemPrompt) return undefined;
  const blocks = Array.isArray(systemPrompt)
    ? systemPrompt
    : [{ type: 'text', text: String(systemPrompt) }];
  // Add cache_control to the LAST block only — Anthropic uses that as the
  // cache breakpoint.
  return blocks.map((b, i) =>
    i === blocks.length - 1
      ? { ...b, cache_control: { type: 'ephemeral' } }
      : b
  );
}

/**
 * Convenience for tools/tool_choice callers: stamp `cache_control` on the
 * last tool definition so tool schemas (which are stable) ride the cache too.
 */
export function withToolCache(tools) {
  if (!Array.isArray(tools) || tools.length === 0) return tools;
  return tools.map((t, i) =>
    i === tools.length - 1
      ? { ...t, cache_control: { type: 'ephemeral' } }
      : t
  );
}
