#!/usr/bin/env node
/**
 * MedConnect — Agent infrastructure migration
 *
 * Creates the tables that back the marketing + security/reliability agents:
 *   - agent_runs:          one row per execution (cron, webhook, manual).
 *   - agent_memory:        rolling memory the agent reads at run start.
 *   - pending_actions:     proposals awaiting Telegram approval.
 *   - security_incidents:  Sentry-driven incident timeline.
 *   - agent_config:        live-tunable thresholds (no redeploy needed).
 *
 * Idempotent — safe to run repeatedly. Run with:
 *   node scripts/migrate_agents_schema.js
 *
 * Requires the same Azure SQL env vars as the app (AZURE_SQL_*).
 */

import { query, sql } from '../src/lib/db.js';

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

const STATEMENTS = [
  {
    name: 'agent_runs',
    sql: `
      IF NOT EXISTS (SELECT * FROM sys.tables WHERE name = 'agent_runs')
      CREATE TABLE agent_runs (
        id            UNIQUEIDENTIFIER NOT NULL PRIMARY KEY DEFAULT NEWID(),
        agent         VARCHAR(20)      NOT NULL,
        trigger_type  VARCHAR(20)      NOT NULL,
        started_at    DATETIME2        NOT NULL DEFAULT SYSUTCDATETIME(),
        finished_at   DATETIME2        NULL,
        status        VARCHAR(20)      NOT NULL,
        tokens_in     INT              NULL,
        tokens_out    INT              NULL,
        cost_usd      DECIMAL(10,4)    NULL,
        summary       NVARCHAR(MAX)    NULL
      );
    `,
  },
  {
    name: 'IX_agent_runs_agent_started',
    sql: `
      IF NOT EXISTS (SELECT * FROM sys.indexes WHERE name = 'IX_agent_runs_agent_started')
      CREATE INDEX IX_agent_runs_agent_started ON agent_runs (agent, started_at DESC);
    `,
  },
  {
    name: 'agent_memory',
    sql: `
      IF NOT EXISTS (SELECT * FROM sys.tables WHERE name = 'agent_memory')
      CREATE TABLE agent_memory (
        id            UNIQUEIDENTIFIER NOT NULL PRIMARY KEY DEFAULT NEWID(),
        agent         VARCHAR(20)      NOT NULL,
        topic         VARCHAR(50)      NOT NULL,
        content_json  NVARCHAR(MAX)    NOT NULL,
        created_at    DATETIME2        NOT NULL DEFAULT SYSUTCDATETIME()
      );
    `,
  },
  {
    name: 'IX_agent_memory_agent_topic',
    sql: `
      IF NOT EXISTS (SELECT * FROM sys.indexes WHERE name = 'IX_agent_memory_agent_topic')
      CREATE INDEX IX_agent_memory_agent_topic ON agent_memory (agent, topic, created_at DESC);
    `,
  },
  {
    name: 'pending_actions',
    sql: `
      IF NOT EXISTS (SELECT * FROM sys.tables WHERE name = 'pending_actions')
      CREATE TABLE pending_actions (
        id                  UNIQUEIDENTIFIER NOT NULL PRIMARY KEY DEFAULT NEWID(),
        agent               VARCHAR(20)      NOT NULL,
        tool                VARCHAR(50)      NOT NULL,
        title               NVARCHAR(255)    NOT NULL,
        rationale           NVARCHAR(MAX)    NULL,
        args_json           NVARCHAR(MAX)    NOT NULL,
        risk_level          VARCHAR(10)      NOT NULL DEFAULT 'low',
        created_at          DATETIME2        NOT NULL DEFAULT SYSUTCDATETIME(),
        expires_at          DATETIME2        NOT NULL,
        status              VARCHAR(20)      NOT NULL DEFAULT 'pending',
        executed_at         DATETIME2        NULL,
        result_json         NVARCHAR(MAX)    NULL,
        telegram_message_id BIGINT           NULL,
        telegram_chat_id    BIGINT           NULL,
        callback_hmac       VARCHAR(64)      NOT NULL
      );
    `,
  },
  {
    name: 'IX_pending_actions_status',
    sql: `
      IF NOT EXISTS (SELECT * FROM sys.indexes WHERE name = 'IX_pending_actions_status')
      CREATE INDEX IX_pending_actions_status ON pending_actions (status, expires_at);
    `,
  },
  {
    name: 'IX_pending_actions_agent_status',
    sql: `
      IF NOT EXISTS (SELECT * FROM sys.indexes WHERE name = 'IX_pending_actions_agent_status')
      CREATE INDEX IX_pending_actions_agent_status ON pending_actions (agent, status, created_at DESC);
    `,
  },
  {
    name: 'security_incidents',
    sql: `
      IF NOT EXISTS (SELECT * FROM sys.tables WHERE name = 'security_incidents')
      CREATE TABLE security_incidents (
        id                      UNIQUEIDENTIFIER NOT NULL PRIMARY KEY DEFAULT NEWID(),
        sentry_issue_id         VARCHAR(50)      NOT NULL,
        first_seen              DATETIME2        NOT NULL,
        severity                VARCHAR(20)      NOT NULL,
        action_taken            VARCHAR(50)      NULL,
        rollback_deployment_id  VARCHAR(80)      NULL,
        pr_number               INT              NULL,
        status                  VARCHAR(20)      NOT NULL DEFAULT 'open',
        created_at              DATETIME2        NOT NULL DEFAULT SYSUTCDATETIME(),
        updated_at              DATETIME2        NOT NULL DEFAULT SYSUTCDATETIME()
      );
    `,
  },
  {
    name: 'IX_security_incidents_sentry',
    sql: `
      IF NOT EXISTS (SELECT * FROM sys.indexes WHERE name = 'IX_security_incidents_sentry')
      CREATE INDEX IX_security_incidents_sentry ON security_incidents (sentry_issue_id, status);
    `,
  },
  {
    name: 'agent_config',
    sql: `
      IF NOT EXISTS (SELECT * FROM sys.tables WHERE name = 'agent_config')
      CREATE TABLE agent_config (
        agent       VARCHAR(20)   NOT NULL,
        config_key  VARCHAR(60)   NOT NULL,
        value       NVARCHAR(500) NOT NULL,
        updated_at  DATETIME2     NOT NULL DEFAULT SYSUTCDATETIME(),
        PRIMARY KEY (agent, config_key)
      );
    `,
  },
];

const DEFAULT_CONFIG = [
  // Marketing
  ['marketing', 'analysis_window_days', '7'],
  ['marketing', 'max_proposals_per_run', '5'],
  ['marketing', 'pending_action_ttl_days', '7'],
  // Security — guardrails for auto-actions (start CONSERVATIVE; tune live)
  ['security', 'pending_action_ttl_hours', '1'],
  ['security', 'auto_rollback_enabled', 'false'],
  ['security', 'auto_merge_enabled', 'false'],
  ['security', 'error_rate_multiplier', '3.0'],
  ['security', 'error_rate_min_window_minutes', '5'],
  ['security', 'post_deploy_guard_minutes', '10'],
  ['security', 'regression_window_days', '30'],
  ['security', 'max_diff_lines', '30'],
  ['security', 'sentry_min_times_seen', '5'],
  ['security', 'sentry_min_level', 'error'],
];

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
