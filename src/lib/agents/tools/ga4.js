// `fetch_ga4_metrics` tool — Google Analytics Data API v1 client with a
// service-account JWT signer (no `googleapis` dependency).
//
// Setup is documented in docs/AGENTS_SETUP.md (GA4 section). This module
// is a no-op when GA4_PROPERTY_ID or GA4_SERVICE_ACCOUNT_JSON aren't set —
// the orchestrator falls back to Azure SQL only.
//
// Token caching is in-memory per Lambda. GA4 access tokens last 1h; we
// reuse aggressively so the warm path is ~10ms.

import crypto from 'crypto';
import { fetchWithTimeout } from '@/lib/http';

const TOKEN_URL = 'https://oauth2.googleapis.com/token';
const SCOPE = 'https://www.googleapis.com/auth/analytics.readonly';

let cachedToken = null;
let cachedTokenExpiresAt = 0;

function decodeServiceAccount() {
  const raw = process.env.GA4_SERVICE_ACCOUNT_JSON;
  if (!raw) return null;
  try {
    // Operators can either paste the raw JSON or its base64-encoded version.
    const decoded = raw.trim().startsWith('{')
      ? raw
      : Buffer.from(raw, 'base64').toString('utf8');
    return JSON.parse(decoded);
  } catch (err) {
    console.warn('[ga4] failed to parse GA4_SERVICE_ACCOUNT_JSON:', err.message);
    return null;
  }
}

export function isGa4Configured() {
  return !!(process.env.GA4_PROPERTY_ID && decodeServiceAccount());
}

function base64UrlEncode(input) {
  const buf = Buffer.isBuffer(input) ? input : Buffer.from(String(input));
  return buf.toString('base64').replace(/=+$/, '').replace(/\+/g, '-').replace(/\//g, '_');
}

async function getAccessToken() {
  const now = Math.floor(Date.now() / 1000);
  if (cachedToken && cachedTokenExpiresAt - 60 > now) return cachedToken;

  const sa = decodeServiceAccount();
  if (!sa || !sa.client_email || !sa.private_key) {
    throw new Error('GA4 service account not configured');
  }

  const header = { alg: 'RS256', typ: 'JWT' };
  const claim = {
    iss: sa.client_email,
    scope: SCOPE,
    aud: TOKEN_URL,
    iat: now,
    exp: now + 3600,
  };
  const data = `${base64UrlEncode(JSON.stringify(header))}.${base64UrlEncode(JSON.stringify(claim))}`;
  const signer = crypto.createSign('RSA-SHA256');
  signer.update(data);
  const signature = base64UrlEncode(signer.sign(sa.private_key));
  const jwt = `${data}.${signature}`;

  const res = await fetchWithTimeout(TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
      assertion: jwt,
    }).toString(),
    timeoutMs: 8000,
  });
  if (!res.ok) {
    const errBody = await res.text().catch(() => '');
    throw new Error(`GA4 token exchange failed: ${res.status} ${errBody.slice(0, 200)}`);
  }
  const tok = await res.json();
  cachedToken = tok.access_token;
  cachedTokenExpiresAt = now + (Number(tok.expires_in) || 3600);
  return cachedToken;
}

/**
 * Run a single GA4 Data API report.
 *
 * @param {object} args
 * @param {string} args.startDate  — '7daysAgo', 'YYYY-MM-DD'
 * @param {string} args.endDate    — 'today', 'YYYY-MM-DD'
 * @param {string[]} args.dimensions
 * @param {string[]} args.metrics
 * @param {number} [args.limit]    — default 25
 */
export async function fetchGa4Metrics({ startDate = '7daysAgo', endDate = 'today', dimensions = [], metrics = [], limit = 25 } = {}) {
  if (!isGa4Configured()) {
    return { configured: false, message: 'GA4 not configured (skip)' };
  }
  const propertyId = process.env.GA4_PROPERTY_ID;
  let token;
  try {
    token = await getAccessToken();
  } catch (err) {
    return { configured: true, error: err?.message || String(err) };
  }

  const url = `https://analyticsdata.googleapis.com/v1beta/properties/${encodeURIComponent(propertyId)}:runReport`;
  const safeLimit = Math.max(1, Math.min(250, Math.floor(Number(limit)) || 25));
  const body = {
    dateRanges: [{ startDate, endDate }],
    dimensions: (dimensions || []).slice(0, 5).map((name) => ({ name })),
    metrics: (metrics || []).slice(0, 8).map((name) => ({ name })),
    limit: safeLimit,
    keepEmptyRows: false,
  };

  let res;
  try {
    res = await fetchWithTimeout(url, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
      timeoutMs: 10000,
    });
  } catch (err) {
    return { error: err?.message || 'fetch failed' };
  }
  if (!res.ok) {
    const errBody = await res.text().catch(() => '');
    return { error: `GA4 ${res.status}: ${errBody.slice(0, 300)}` };
  }
  const json = await res.json();

  // Flatten the response into a tabular structure that's easier for the
  // model to reason over.
  const dimHeaders = (json.dimensionHeaders || []).map((d) => d.name);
  const metHeaders = (json.metricHeaders || []).map((m) => m.name);
  const rows = (json.rows || []).map((row) => {
    const out = {};
    dimHeaders.forEach((name, i) => { out[name] = row.dimensionValues?.[i]?.value; });
    metHeaders.forEach((name, i) => {
      const raw = row.metricValues?.[i]?.value;
      const num = Number(raw);
      out[name] = Number.isFinite(num) ? num : raw;
    });
    return out;
  });

  return {
    configured: true,
    rowCount: rows.length,
    totals: (json.totals?.[0]?.metricValues || []).map((m, i) => ({
      metric: metHeaders[i],
      value: Number(m.value),
    })),
    rows,
  };
}

export const FETCH_GA4_TOOL_SCHEMA = {
  name: 'fetch_ga4_metrics',
  description:
    'Consulta el Google Analytics Data API v1 (GA4). Devuelve filas con dimensiones + métricas. Si el agente no está configurado (GA4_PROPERTY_ID o GA4_SERVICE_ACCOUNT_JSON ausentes) devuelve { configured: false } y el orquestador trabaja solo con Azure SQL.',
  input_schema: {
    type: 'object',
    properties: {
      startDate: { type: 'string', description: 'Ej: "7daysAgo", "30daysAgo", o "YYYY-MM-DD".' },
      endDate:   { type: 'string', description: 'Ej: "today", "yesterday", o "YYYY-MM-DD".' },
      dimensions: { type: 'array', items: { type: 'string' }, description: 'Hasta 5: pagePath, country, deviceCategory, source, medium, sessionDefaultChannelGroup, ...' },
      metrics: { type: 'array', items: { type: 'string' }, description: 'Hasta 8: sessions, screenPageViews, conversions, totalUsers, bounceRate, averageSessionDuration, ...' },
      limit: { type: 'integer', minimum: 1, maximum: 250 },
    },
    required: ['dimensions', 'metrics'],
  },
};
