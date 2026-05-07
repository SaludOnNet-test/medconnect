#!/usr/bin/env node
/**
 * MedConnect — Agent infrastructure migration (CLI)
 *
 * Idempotent — safe to re-run. Two ways to run a migration:
 *
 * 1. **HTTP (recommended)** — POST /api/agents/migrate with the
 *    `x-setup-secret: $DB_SETUP_SECRET` header. Runs on Vercel where the
 *    Azure SQL connection already works.
 *
 * 2. **CLI (this script)** — requires AZURE_SQL_* env vars locally. With
 *    Node 18+ you can pass them via:
 *      node --env-file=.env.local scripts/migrate_agents_schema.js
 */

import { query, sql } from '../src/lib/db.js';
import { STATEMENTS, DEFAULT_CONFIG } from '../src/lib/agents/migrationSchema.js';

const COLORS = {
  reset: '\x1b[0m',
  cyan: '\x1b[36m',
  green: '\x1b[32m',
  red: '\x1b[31m',
  yellow: '\x1b[33m',
};

function log(color, ...args) {
  console.log(`${color}${args.join(' ')}${COLORS.reset}`);
}

async function run() {
  log(COLORS.cyan, '\n=== MedConnect — agent schema migration ===\n');
  for (const stmt of STATEMENTS) {
    process.stdout.write(`  • ${stmt.name} ... `);
    try {
      await query(stmt.sql);
      log(COLORS.green, 'ok');
    } catch (err) {
      log(COLORS.red, `FAILED: ${err.message}`);
      throw err;
    }
  }

  log(COLORS.cyan, '\nSeeding default agent_config (only if absent)...');
  for (const [agent, key, value] of DEFAULT_CONFIG) {
    try {
      await query(
        `IF NOT EXISTS (SELECT 1 FROM agent_config WHERE agent = @agent AND config_key = @key)
         INSERT INTO agent_config (agent, config_key, value) VALUES (@agent, @key, @value);`,
        {
          agent: { type: sql.VarChar(20),   value: agent },
          key:   { type: sql.VarChar(60),   value: key },
          value: { type: sql.NVarChar(500), value },
        }
      );
      log(COLORS.green, `  • ${agent}.${key} = ${value}`);
    } catch (err) {
      log(COLORS.yellow, `  • ${agent}.${key} skipped: ${err.message}`);
    }
  }

  log(COLORS.green, '\n✓ Migration complete.\n');
}

run()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error('\nMigration failed:', err);
    process.exit(1);
  });
