// POST /api/agents/migrate
//
// One-shot HTTP migration endpoint. Idempotent — safe to call repeatedly.
// Easier path than running `scripts/migrate_agents_schema.js` locally
// because the Azure SQL connection already works from Vercel functions
// (env vars are set, network is open).
//
// Auth: same `x-setup-secret` header pattern as `/api/db/setup`. The
// `DB_SETUP_SECRET` env var must be set in Vercel. Both header and
// `?secret=` query are accepted.

import { NextResponse } from 'next/server';
import { internalError, clientError } from '@/lib/errors';
import { getPool, sql, DB_AVAILABLE } from '@/lib/db';
import { STATEMENTS, DEFAULT_CONFIG } from '@/lib/agents/migrationSchema';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

function authorised(request) {
  const expected = process.env.DB_SETUP_SECRET;
  if (!expected) return false;
  const headerSecret = request.headers.get('x-setup-secret') || '';
  if (headerSecret === expected) return true;
  const url = new URL(request.url);
  return url.searchParams.get('secret') === expected;
}

async function handle(request) {
  if (!DB_AVAILABLE) {
    return clientError('Azure SQL not configured', 503);
  }
  if (!authorised(request)) {
    return clientError('unauthorized', 401);
  }
  try {
    const pool = await getPool();
    const ddl = [];
    for (const stmt of STATEMENTS) {
      try {
        await pool.request().query(stmt.sql);
        ddl.push({ name: stmt.name, ok: true });
      } catch (err) {
        ddl.push({ name: stmt.name, ok: false, error: err?.message || String(err) });
      }
    }
    const seeds = [];
    for (const [agent, key, value] of DEFAULT_CONFIG) {
      try {
        await pool.request()
          .input('agent', sql.VarChar(20), agent)
          .input('key',   sql.VarChar(60), key)
          .input('value', sql.NVarChar(500), value)
          .query(`
            IF NOT EXISTS (SELECT 1 FROM agent_config WHERE agent = @agent AND config_key = @key)
            INSERT INTO agent_config (agent, config_key, value) VALUES (@agent, @key, @value);
          `);
        seeds.push({ agent, key, value, ok: true });
      } catch (err) {
        seeds.push({ agent, key, value, ok: false, error: err?.message || String(err) });
      }
    }
    return NextResponse.json({ ok: true, ddl, seeds });
  } catch (err) {
    return internalError(err, '[agents/migrate]');
  }
}

export const GET = handle;
export const POST = handle;
