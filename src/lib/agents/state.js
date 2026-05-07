// State helpers for the agent infrastructure.
//
// All persistence goes through Azure SQL (authoritative). Upstash Redis is
// reserved for ephemeral keys only (locks, callback_data shortIds, anti-dupe
// guards). When Upstash is not configured, the helpers degrade to in-memory
// per-Lambda — that's fine for dev and acceptable for a single-region prod
// since the worst case is a duplicate processing of one webhook.

import { getPool, sql } from '@/lib/db';
import { fetchWithTimeout } from '@/lib/http';
import { signActionId } from './telegram';
import crypto from 'crypto';

const UPSTASH_URL = process.env.UPSTASH_REDIS_REST_URL || '';
const UPSTASH_TOKEN = process.env.UPSTASH_REDIS_REST_TOKEN || '';
const HAS_UPSTASH = !!(UPSTASH_URL && UPSTASH_TOKEN);

// In-memory fallback for Redis ops when Upstash isn't configured.
const memStore = new Map();

// ---------------------------------------------------------------------------
// Redis helpers (locks, short ids, post-deploy guard)
// ---------------------------------------------------------------------------

// Upstash REST API: send the command as a JSON array body to the root
// endpoint. This is the documented production-grade path and matches the
// pattern already used by src/lib/rateLimit.js (which posts to /pipeline).
async function upstashCommand(commandArr) {
  if (!HAS_UPSTASH) return null;
  try {
    const res = await fetchWithTimeout(UPSTASH_URL, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${UPSTASH_TOKEN}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(commandArr),
      timeoutMs: 1500,
    });
    if (!res.ok) return null;
    const data = await res.json();
    return data?.result ?? null;
  } catch {
    return null;
  }
}

/**
 * SETNX-style lock with TTL. Returns true if the caller acquired the lock,
 * false if someone else holds it. Falls back to per-Lambda in-memory if
 * Upstash isn't reachable.
 */
export async function acquireLock(key, ttlSeconds) {
  if (HAS_UPSTASH) {
    // SET key 1 EX seconds NX  → "OK" if acquired, null if NX rejected it.
    const result = await upstashCommand(['SET', key, '1', 'EX', String(ttlSeconds), 'NX']);
    if (result === 'OK') return true;
    if (result === null) {
      // Upstash returned null *and* the network call succeeded → key held.
      // (`upstashCommand` also returns null on transport failure — accept the
      // small false-negative; falling through to memory would defeat the
      // shared lock.)
      return false;
    }
  }
  const now = Date.now();
  const existing = memStore.get(key);
  if (existing && existing.expiresAt > now) return false;
  memStore.set(key, { expiresAt: now + ttlSeconds * 1000 });
  return true;
}

export async function releaseLock(key) {
  if (HAS_UPSTASH) {
    await upstashCommand(['DEL', key]);
  }
  memStore.delete(key);
}

/**
 * Telegram callback_data has a 64-byte cap; we use a short id mapped in
 * Redis to the full UUID. TTL covers the realistic window an operator might
 * leave a notification unread (default 72h).
 */
export async function storeCallbackShortId(actionId, ttlSeconds = 72 * 3600) {
  const shortId = crypto.randomBytes(6).toString('hex'); // 12 chars
  if (HAS_UPSTASH) {
    await upstashCommand(['SET', `tg:cb:${shortId}`, String(actionId), 'EX', String(ttlSeconds)]);
  }
  // Always also write to memory: lets a single Lambda answer a callback if
  // Upstash is briefly unreachable on the read side.
  memStore.set(`tg:cb:${shortId}`, { value: actionId, expiresAt: Date.now() + ttlSeconds * 1000 });
  return shortId;
}

export async function resolveCallbackShortId(shortId) {
  if (HAS_UPSTASH) {
    const result = await upstashCommand(['GET', `tg:cb:${shortId}`]);
    if (result) return String(result);
  }
  const entry = memStore.get(`tg:cb:${shortId}`);
  if (!entry || entry.expiresAt < Date.now()) return null;
  return entry.value;
}

// ---------------------------------------------------------------------------
// Azure SQL — agent_runs
// ---------------------------------------------------------------------------

export async function startAgentRun({ agent, trigger }) {
  const pool = await getPool();
  const result = await pool.request()
    .input('agent', sql.VarChar(20), agent)
    .input('trigger', sql.VarChar(20), trigger)
    .query(`
      INSERT INTO agent_runs (agent, trigger_type, status)
      OUTPUT INSERTED.id
      VALUES (@agent, @trigger, 'running');
    `);
  return result.recordset[0].id;
}

export async function finishAgentRun({ runId, status, summary, tokensIn, tokensOut, costUsd }) {
  const pool = await getPool();
  await pool.request()
    .input('id', sql.UniqueIdentifier, runId)
    .input('status', sql.VarChar(20), status)
    .input('summary', sql.NVarChar(sql.MAX), summary || null)
    .input('tokensIn', sql.Int, tokensIn ?? null)
    .input('tokensOut', sql.Int, tokensOut ?? null)
    .input('costUsd', sql.Decimal(10, 4), costUsd ?? null)
    .query(`
      UPDATE agent_runs
         SET finished_at = SYSUTCDATETIME(),
             status = @status,
             summary = @summary,
             tokens_in = @tokensIn,
             tokens_out = @tokensOut,
             cost_usd = @costUsd
       WHERE id = @id;
    `);
}

// ---------------------------------------------------------------------------
// Azure SQL — agent_memory
// ---------------------------------------------------------------------------

export async function appendMemory({ agent, topic, content }) {
  const pool = await getPool();
  await pool.request()
    .input('agent', sql.VarChar(20), agent)
    .input('topic', sql.VarChar(50), topic)
    .input('content', sql.NVarChar(sql.MAX), JSON.stringify(content ?? {}))
    .query(`
      INSERT INTO agent_memory (agent, topic, content_json)
      VALUES (@agent, @topic, @content);
    `);
}

export async function readMemory({ agent, topic, limit = 20 }) {
  const pool = await getPool();
  const r = await pool.request()
    .input('agent', sql.VarChar(20), agent)
    .input('topic', sql.VarChar(50), topic)
    .input('limit', sql.Int, limit)
    .query(`
      SELECT TOP (@limit) id, content_json, created_at
        FROM agent_memory
       WHERE agent = @agent AND topic = @topic
       ORDER BY created_at DESC;
    `);
  return r.recordset.map((row) => {
    let content = null;
    try { content = JSON.parse(row.content_json); } catch {/* leave null */}
    return { id: row.id, content, createdAt: row.created_at };
  });
}

// ---------------------------------------------------------------------------
// Azure SQL — pending_actions
// ---------------------------------------------------------------------------

/**
 * Create a proposal awaiting approval. Returns the row's id (UUID), the
 * shortId mapped in Redis (used in the callback_data envelope), and the HMAC
 * tag persisted on the row.
 */
export async function createPendingAction({
  agent, tool, title, rationale, args, riskLevel = 'low', ttlSeconds,
}) {
  const pool = await getPool();
  const ttl = Number(ttlSeconds) > 0 ? Number(ttlSeconds) : 7 * 24 * 3600;
  const result = await pool.request()
    .input('agent', sql.VarChar(20), agent)
    .input('tool', sql.VarChar(50), tool)
    .input('title', sql.NVarChar(255), title?.slice(0, 250) || tool)
    .input('rationale', sql.NVarChar(sql.MAX), rationale ?? null)
    .input('args', sql.NVarChar(sql.MAX), JSON.stringify(args ?? {}))
    .input('riskLevel', sql.VarChar(10), riskLevel)
    .input('ttl', sql.Int, ttl)
    .query(`
      INSERT INTO pending_actions
        (agent, tool, title, rationale, args_json, risk_level, expires_at, callback_hmac)
      OUTPUT INSERTED.id
      VALUES
        (@agent, @tool, @title, @rationale, @args, @riskLevel,
         DATEADD(second, @ttl, SYSUTCDATETIME()),
         '');
    `);
  const id = result.recordset[0].id;
  const hmac = signActionId(id);
  await pool.request()
    .input('id', sql.UniqueIdentifier, id)
    .input('hmac', sql.VarChar(64), hmac)
    .query(`UPDATE pending_actions SET callback_hmac = @hmac WHERE id = @id;`);
  const shortId = await storeCallbackShortId(id);
  return { id, shortId, hmac };
}

export async function getPendingAction(id) {
  const pool = await getPool();
  const r = await pool.request()
    .input('id', sql.UniqueIdentifier, id)
    .query(`SELECT * FROM pending_actions WHERE id = @id;`);
  return r.recordset[0] || null;
}

export async function listOpenPendingActions({ agent, limit = 10 } = {}) {
  const pool = await getPool();
  const req = pool.request().input('limit', sql.Int, limit);
  let where = `status = 'pending' AND expires_at > SYSUTCDATETIME()`;
  if (agent) {
    req.input('agent', sql.VarChar(20), agent);
    where += ` AND agent = @agent`;
  }
  const r = await req.query(`
    SELECT TOP (@limit) id, agent, tool, title, rationale, risk_level, created_at, expires_at
      FROM pending_actions
     WHERE ${where}
     ORDER BY created_at DESC;
  `);
  return r.recordset;
}

export async function updatePendingActionStatus({ id, status, resultJson }) {
  const pool = await getPool();
  await pool.request()
    .input('id', sql.UniqueIdentifier, id)
    .input('status', sql.VarChar(20), status)
    .input('result', sql.NVarChar(sql.MAX), resultJson ? JSON.stringify(resultJson) : null)
    .query(`
      UPDATE pending_actions
         SET status = @status,
             executed_at = CASE WHEN @status IN ('executed','rejected','acknowledged') THEN SYSUTCDATETIME() ELSE executed_at END,
             result_json = COALESCE(@result, result_json)
       WHERE id = @id;
    `);
}

export async function attachTelegramMessage({ id, chatId, messageId }) {
  const pool = await getPool();
  await pool.request()
    .input('id', sql.UniqueIdentifier, id)
    .input('chatId', sql.BigInt, chatId)
    .input('messageId', sql.BigInt, messageId)
    .query(`
      UPDATE pending_actions
         SET telegram_chat_id = @chatId,
             telegram_message_id = @messageId
       WHERE id = @id;
    `);
}

// ---------------------------------------------------------------------------
// Azure SQL — agent_config (live-tunable)
// ---------------------------------------------------------------------------

export async function getConfig(agent) {
  const pool = await getPool();
  const r = await pool.request()
    .input('agent', sql.VarChar(20), agent)
    .query(`SELECT config_key, value FROM agent_config WHERE agent = @agent;`);
  return r.recordset.reduce((acc, row) => {
    acc[row.config_key] = row.value;
    return acc;
  }, {});
}

export async function setConfig({ agent, key, value }) {
  const pool = await getPool();
  await pool.request()
    .input('agent', sql.VarChar(20), agent)
    .input('key', sql.VarChar(60), key)
    .input('value', sql.NVarChar(500), String(value))
    .query(`
      MERGE agent_config AS target
      USING (SELECT @agent AS agent, @key AS config_key) AS src
        ON target.agent = src.agent AND target.config_key = src.config_key
      WHEN MATCHED THEN UPDATE SET value = @value, updated_at = SYSUTCDATETIME()
      WHEN NOT MATCHED THEN
        INSERT (agent, config_key, value) VALUES (@agent, @key, @value);
    `);
}
