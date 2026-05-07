// Vercel REST API tools for the security agent.
//
// The "rollback" pattern: Vercel doesn't have a /rollback endpoint per se.
// What it does have is "promote" — promoting a previous deployment to
// production. We keep the previous production deployment in our query path
// and call promote on it.
//
// Auth: `VERCEL_TOKEN` with project read/write scope. Optional team id for
// team accounts (`VERCEL_TEAM_ID`). The project id (`VERCEL_PROJECT_ID`)
// is per-environment.
//
// Reference: https://vercel.com/docs/rest-api

import { fetchWithTimeout } from '@/lib/http';

const VERCEL_BASE = 'https://api.vercel.com';
const TIMEOUT_MS = 10_000;

function authHeader() {
  const token = process.env.VERCEL_TOKEN;
  if (!token) throw new Error('VERCEL_TOKEN not configured');
  return { Authorization: `Bearer ${token}` };
}

function teamQuery() {
  const team = process.env.VERCEL_TEAM_ID;
  return team ? `?teamId=${encodeURIComponent(team)}` : '';
}

/**
 * List recent production deployments. Returns an array of:
 *   { uid, name, url, state, target, createdAt, meta:{ githubCommitSha, githubCommitMessage } }
 * sorted newest first.
 */
export async function listRecentDeployments({ limit = 10 } = {}) {
  const projectId = process.env.VERCEL_PROJECT_ID;
  if (!projectId) return { error: 'VERCEL_PROJECT_ID not configured' };
  const safeLimit = Math.max(1, Math.min(50, Number(limit) || 10));
  const team = teamQuery();
  const url = `${VERCEL_BASE}/v6/deployments${team ? team + '&' : '?'}` +
    `projectId=${encodeURIComponent(projectId)}&limit=${safeLimit}&target=production`;
  const res = await fetchWithTimeout(url, {
    headers: authHeader(),
    timeoutMs: TIMEOUT_MS,
  });
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    return { error: `vercel ${res.status}: ${body.slice(0, 300)}` };
  }
  const json = await res.json();
  const deployments = (json.deployments || []).map((d) => ({
    uid: d.uid,
    name: d.name,
    url: d.url,
    state: d.state,
    target: d.target,
    createdAt: d.createdAt ? new Date(d.createdAt).toISOString() : null,
    readyAt: d.readyAt ? new Date(d.readyAt).toISOString() : null,
    githubSha: d.meta?.githubCommitSha,
    commitMessage: d.meta?.githubCommitMessage,
  }));
  return { deployments };
}

export const LIST_DEPLOYMENTS_SCHEMA = {
  name: 'list_recent_deployments',
  description: 'Lista las deployments recientes de producción (newest first). Útil para identificar el deploy sospechoso de una regresión.',
  input_schema: {
    type: 'object',
    properties: {
      limit: { type: 'integer', minimum: 1, maximum: 50 },
    },
  },
};

/**
 * Promote a deployment to production — i.e. roll back the active version.
 * Requires `auto_rollback_enabled` config true OR an operator approval flow.
 * The orchestrator gates this behind guardrails; this function only does
 * the API call.
 */
export async function rollbackVercel({ deploymentId, reason } = {}) {
  if (!deploymentId) return { error: 'deploymentId required' };
  const projectId = process.env.VERCEL_PROJECT_ID;
  if (!projectId) return { error: 'VERCEL_PROJECT_ID not configured' };
  // Vercel: POST /v9/projects/{projectId}/promote/{deploymentId}
  const team = teamQuery();
  const url = `${VERCEL_BASE}/v9/projects/${encodeURIComponent(projectId)}/promote/${encodeURIComponent(deploymentId)}${team}`;
  const res = await fetchWithTimeout(url, {
    method: 'POST',
    headers: { ...authHeader(), 'Content-Type': 'application/json' },
    body: JSON.stringify({ reason: reason || 'agent rollback' }),
    timeoutMs: TIMEOUT_MS,
  });
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    return { error: `vercel promote ${res.status}: ${body.slice(0, 300)}` };
  }
  // Promote returns 200 with empty body sometimes — treat as success if the
  // status is OK.
  return { ok: true, deploymentId, reason: reason || null };
}

export const ROLLBACK_VERCEL_SCHEMA = {
  name: 'rollback_vercel',
  description:
    'Promueve un deployment previo a production (rollback). Solo se ejecuta automáticamente cuando los guardrails server-side aprueban; en caso contrario el orquestador lo convierte en propuesta para aprobación humana.',
  input_schema: {
    type: 'object',
    properties: {
      deploymentId: { type: 'string', description: 'uid de la deployment objetivo (de list_recent_deployments).' },
      reason: { type: 'string' },
    },
    required: ['deploymentId'],
  },
};

/**
 * Verify a Vercel webhook signature. Vercel signs the body with HMAC-SHA1
 * (legacy) and SHA-256; we accept either. Header: `x-vercel-signature`.
 */
export function verifyVercelWebhook({ rawBody, signature }) {
  const secret = process.env.VERCEL_WEBHOOK_SECRET;
  if (!secret) return false;
  if (!signature) return false;
  // eslint-disable-next-line global-require
  const crypto = require('crypto');
  const sha1 = crypto.createHmac('sha1', secret).update(rawBody).digest('hex');
  if (signature.length === sha1.length) {
    try {
      if (crypto.timingSafeEqual(Buffer.from(sha1, 'utf8'), Buffer.from(signature, 'utf8'))) return true;
    } catch {/* length mismatch */}
  }
  const sha256 = crypto.createHmac('sha256', secret).update(rawBody).digest('hex');
  if (signature.length === sha256.length) {
    try {
      return crypto.timingSafeEqual(Buffer.from(sha256, 'utf8'), Buffer.from(signature, 'utf8'));
    } catch {/* fall through */}
  }
  return false;
}
