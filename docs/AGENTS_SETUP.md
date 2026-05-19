# MedConnect Autonomous Agents — Setup Guide

Sister doc to `MVP_PENDING.md`. The agents (marketing + security/reliability)
were specified in `.claude/plans/necesito-crear-dos-agentes-hashed-kernighan.md`
and built in phases. This doc tracks the operator-side setup steps.

> **Phase 0 (andamiaje) — ready to deploy.**
> Phase 1 (Marketing MVP) and beyond build on top of this scaffolding.

---

## 1 — Telegram bot

The agents push notifications and approval prompts to a Telegram bot. The
operator (you) creates it once with **@BotFather** in the Telegram app:

1. Open a chat with **@BotFather** in Telegram (mobile or desktop).
2. Send `/newbot`. Choose:
   - **Display name**: `MedConnect Agents` (or whatever you prefer).
   - **Username**: must end in `bot`, e.g. `medconnect_agents_bot`.
3. BotFather replies with an HTTP API token. **Copy it** — this is your
   `TELEGRAM_BOT_TOKEN`. Treat it as a secret.
4. Open a chat with **your new bot** and send any message (e.g. `hi`).
   Telegram will not forward updates until you click "start", so the bot
   needs at least one message from you to "know" your `chat_id`.
5. Find your `chat_id`. Easiest path: open this URL in a browser, replacing
   `<TOKEN>` with your bot token:
   ```
   https://api.telegram.org/bot<TOKEN>/getUpdates
   ```
   Look for `"chat":{"id":XXXXXXXX,...}`. That number is your
   `TELEGRAM_OWNER_CHAT_ID`.
6. Generate two random secrets locally (any 32+ char hex string works):
   ```
   TELEGRAM_WEBHOOK_SECRET=<random hex>
   TELEGRAM_CALLBACK_HMAC_KEY=<random hex>
   ```

### Push the four env vars to Vercel

Project: **medconnect** (team `saludonnet-tests-projects`).

```
TELEGRAM_BOT_TOKEN=<from BotFather>
TELEGRAM_OWNER_CHAT_ID=<your chat id>
TELEGRAM_WEBHOOK_SECRET=<random hex>
TELEGRAM_CALLBACK_HMAC_KEY=<random hex>
```

Either via the Vercel dashboard or `vercel env add`. After adding, redeploy
production so the env vars are live.

### Register the webhook with Telegram

Once the new deploy is live and the route handler is responding, point
Telegram at it. Replace `<TOKEN>` and `<SECRET>` and run once:

```
curl -X POST "https://api.telegram.org/bot<TOKEN>/setWebhook" \
  -H "Content-Type: application/json" \
  -d '{
    "url": "https://medconnect.es/api/agents/telegram-webhook",
    "secret_token": "<TELEGRAM_WEBHOOK_SECRET>",
    "allowed_updates": ["message", "callback_query"]
  }'
```

Verify with:

```
curl "https://api.telegram.org/bot<TOKEN>/getWebhookInfo"
```

You should see `"url": "https://medconnect.es/..."` and
`"pending_update_count": 0`. From this point on, every message you send
to the bot is POSTed to MedConnect.

### Smoke-test from your phone

In the Telegram chat with the bot, send `/agents`. You should receive the
help message back.

---

## 2 — Database migration

The agent tables (`agent_runs`, `agent_memory`, `pending_actions`,
`security_incidents`, `agent_config`) are created by:

```
node scripts/migrate_agents_schema.js
```

The script is idempotent — safe to re-run. It also seeds default
`agent_config` rows (with `auto_rollback_enabled=false` and
`auto_merge_enabled=false`, i.e. **no auto-actions on day one**).

Requires the same `AZURE_SQL_*` env vars as the rest of the app.

---

## 3 — Anthropic API

Already configured (`ANTHROPIC_API_KEY` in `.env.local`).
Optional: set `ANTHROPIC_MODEL=claude-sonnet-4-5` (default) or
`claude-opus-4-5` if you want the security agent on Opus for critical
incidents.

---

## 4 — Marketing agent (Phase 1) — optional GA4 hookup

The marketing agent works **out of the box** with just the Azure SQL data
already flowing into `analytics_events`. GA4 is an optional booster that
adds organic-search and source/medium attribution.

### Without GA4 (recommended for week 1)

Nothing to do — the agent uses `analytics_events`, `bookings`, and
`referrals` plus the SEO landing matrix (`src/lib/seoData.js`).

### With GA4 (when you want organic-search insight)

1. **Google Cloud project** (use any existing one or create
   `medconnect-agents`). Enable **Google Analytics Data API**.
2. **Service account**: IAM & Admin → Service Accounts → Create.
   - Name: `medconnect-marketing-agent`.
   - Skip granting project roles.
   - Create JSON key, download.
3. **Grant Viewer** on the GA4 property (Admin → Property Access
   Management → Add user → paste the service account email →
   role "Viewer").
4. **Encode and push to Vercel**:
   ```bash
   cat service-account.json | base64 -w 0
   ```
   Add the result as `GA4_SERVICE_ACCOUNT_JSON` (or paste raw JSON; the
   loader accepts both). Add `GA4_PROPERTY_ID` (just the numeric ID, e.g.
   `387654321`).
5. Re-deploy. The next agent run will detect GA4 is configured and
   include it.

### Cron schedule

`0 7 * * 1` (UTC) = **Monday 08:00 Madrid (winter) / 09:00 (summer)**.
Configured in `vercel.json`. Manual trigger always available via
Telegram: `/marketing analizar [7d|30d]`.

### Live config (no redeploy)

From Telegram:
```
/marketing config max_proposals_per_run=3
/marketing config analysis_window_days=14
```
Reads with no value print the whole config block.

---

## 5 — Security agent (Phase 2/3) setup

The security agent works in two layers:

**Phase 2 — reactive proposals (default).** Sentry webhooks land at
`/api/agents/sentry-webhook`. The agent investigates each issue, decides
if it's noise (and ignores), or builds a proposal that pings you on
Telegram with [Ejecutar rollback] / [Crear hotfix PR] / [Ignorar] buttons.
**No autonomous code merges or rollbacks happen** — the seed config has
`auto_rollback_enabled=false` and `auto_merge_enabled=false`.

**Phase 3 — autonomous (opt-in).** When you're confident with Phase 2
behaviour (recommend ≥ 4 weeks observing), flip the flags from Telegram:

```
/security config auto_rollback_enabled=true
/security config auto_merge_enabled=true
```

The hardcoded guardrails in `src/lib/agents/guardrails.js` still apply
even with auto enabled — if a path falls outside the whitelist, or the
diff > `max_diff_lines`, or CI isn't green, the agent always degrades to
a Telegram approval.

### Env vars (push to Vercel)

```
# Sentry (programmatic access + webhook signing)
SENTRY_AUTH_TOKEN=<internal-integration token, scopes: event:read, issue:read>
SENTRY_ORG=<your sentry org slug>
SENTRY_PROJECT=<your sentry project slug>
SENTRY_WEBHOOK_SECRET=<random hex>

# Vercel (rollback + deployment listing)
VERCEL_TOKEN=<existing one is fine if it has Read+Write deployments>
VERCEL_PROJECT_ID=<the medconnect project id>
VERCEL_TEAM_ID=<saludonnet-tests-projects team id>
VERCEL_WEBHOOK_SECRET=<random hex, used by /api/agents/vercel-webhook>

# GitHub (read source + open hotfix PRs + auto-merge in Phase 3)
GITHUB_TOKEN=<fine-grained PAT or app token>
GITHUB_REPO=SaludOnNet-test/medconnect
GITHUB_BASE_BRANCH=main           # optional, default 'main'
```

The GitHub token needs:
- `contents:write` (commit to a branch)
- `pull_requests:write` (open + merge)
- read access to the repo's actions/check runs

### Sentry webhook setup

1. Sentry → Settings → Developer Settings → "New Internal Integration".
2. Name: `MedConnect Agents`. Permissions: `Issue & Event: Read`,
   `Organization: Read`. Webhook URL:
   `https://medconnect.es/api/agents/sentry-webhook`.
3. Webhook events: enable **Issue Alerts** (or Issue Events).
4. Copy the **Client Secret** → Vercel env `SENTRY_WEBHOOK_SECRET`.
   Copy the **Token** → Vercel env `SENTRY_AUTH_TOKEN`.
5. In your Sentry **Alerts → Issue Alerts**, create a rule:
   _"When an issue is first seen OR happens >= N times in a 1-min
   window AND level >= error"_ → action: send to internal integration
   `MedConnect Agents`.

### Vercel webhook setup

1. Vercel dashboard → Project (medconnect) → Settings → Git → Deploy
   Hooks (and Webhooks).
2. Create webhook for events `deployment.succeeded`, `deployment.ready`,
   pointing at `https://medconnect.es/api/agents/vercel-webhook`.
3. Copy the secret → Vercel env `VERCEL_WEBHOOK_SECRET`.

### Manual triggers

- `/security investigar <issueId>` from Telegram → agent investigates and
  posts an analysis or proposal back.
- `curl -X POST https://medconnect.es/api/agents/security/run?secret=$CRON_SECRET&issueId=MEDCONNECT-XYZ` for
  the same from CLI.

---

## 6 — What's still pending per phase

| Phase | Owner-side setup | Status |
|---|---|---|
| **0 — Andamiaje** | Telegram bot + env vars + migration | ⬜ pending owner |
| **1 — Marketing MVP** | _Optional:_ GA4 service account JSON (base64) → `GA4_SERVICE_ACCOUNT_JSON`, plus `GA4_PROPERTY_ID`. Cron wired. | 🟢 code shipped |
| **2 — Security reactivo** | Sentry/Vercel/GitHub env vars + Sentry & Vercel webhook registration (above). Auto-actions remain disabled. | 🟢 code shipped |
| **3 — Security autónomo** | Flip `auto_rollback_enabled` and/or `auto_merge_enabled` to `true` via `/security config`. Recommended only after **4+ weeks** of Phase 2 observation. | 🟢 code shipped, gated off |
| **4 — Refinamientos** | Google Ads OAuth + Trends, embeddings on `agent_memory`, dashboard. | ⬜ |

---

## 5 — Daily commands cheatsheet

From your Telegram chat with the bot:

- `/agents` — help
- `/status` — open pending proposals across both agents
- `/health` — connectivity check to Anthropic, Azure SQL, Sentry, Vercel,
  GitHub, Telegram, and Upstash. Shows configured + reachable + latency +
  a hint for every red.
- `/marketing analizar 7d` — trigger marketing analysis on demand
- `/security investigar <issue_id>` — investigate a Sentry issue
- `/marketing config max_proposals_per_run=3` — tune marketing live
- `/security config auto_rollback_enabled=true` — enable auto-rollback

When a proposal arrives, you'll see inline buttons (`Aceptar`/`Rechazar`/
`Detalle`). Pressing them is the only way to action a proposal — the
chat conversation does not execute commands.

### Health probe / debugging

`/health` from Telegram (or
`curl -X POST https://www.medconnect.es/api/agents/health -H "x-setup-secret: $DB_SETUP_SECRET"`)
runs every dependency check in parallel and returns a per-service report
with ✅ / ⚠️ / ❌, latency, and an actionable hint when something fails.
Common hints already wired in:

| Service | Failure mode | Hint surfaced |
|---|---|---|
| Anthropic | env var missing | "Falta `ANTHROPIC_API_KEY` en Vercel Production." |
| Sentry | 401 | "Pega el **Token** de la pestaña 'Tokens' de la Internal Integration — NO el Client Secret. Scopes: Issue & Event: Read + Organization: Read." |
| Sentry | 404 | "Verifica `SENTRY_ORG` y `SENTRY_PROJECT` (slugs, no nombres)." |
| Vercel | 401/403 | "Re-crea `VERCEL_TOKEN` (write-once) en Account Settings → Tokens." |
| Vercel | 404 | "Revisa `VERCEL_PROJECT_ID` y `VERCEL_TEAM_ID`." |
| GitHub | 401 | "PAT inválido o caducado. Scopes: contents:write + pull_requests:write + actions:read." |
| GitHub | 404 | "`GITHUB_REPO` o acceso del PAT al repo. Default si está ausente: `SaludOnNet-test/medconnect`." |
| Telegram | non-200 | "`TELEGRAM_BOT_TOKEN` revocado o inválido." |
| Upstash | non-200 | "Token expirado o URL distinta." |

`GITHUB_REPO` tiene un default de `SaludOnNet-test/medconnect` hardcodeado
en `src/lib/agents/tools/github.js`, así que aunque la env var desaparezca,
los tools de GitHub siguen sabiendo dónde apuntar. El token sigue siendo
obligatorio (no se puede defaultear un secreto).

---

## 6 — Operational guardrails (enforced server-side)

These are **not** model-side suggestions; they are validated in
`src/lib/agents/guardrails.js` before any auto-action runs.

- Auto-merge is allowed only when ALL of:
  1. `auto_merge_enabled = 'true'` in `agent_config`.
  2. Sentry confirms `regression = true` for the issue.
  3. CI checks are green.
  4. Total diff ≤ `max_diff_lines` (default 30).
  5. Every changed path lives under `src/{app,lib,components}/` AND does
     **not** match any of the protected patterns (`auth`, `payments`,
     `stripe`, `clerk`, `webhook`, `admin`, `sentry`, `db`, etc.).
- Auto-rollback is allowed only when ALL of:
  1. `auto_rollback_enabled = 'true'`.
  2. Within `post_deploy_guard_minutes` (default 10) of a successful deploy.
  3. Error rate exceeds `error_rate_multiplier × baseline` (default 3×).
  4. Sustained for `error_rate_min_window_minutes` (default 5).

If any check fails, the action degrades to a Telegram approval prompt.

---

## 7 — Files to know

| File | Role |
|---|---|
| `src/lib/agents/anthropicClient.js` | Anthropic SDK wrapper + prompt caching helpers + cost telemetry |
| `src/lib/agents/telegram.js` | Telegram Bot API HTTP wrapper, secret + HMAC validators |
| `src/lib/agents/state.js` | All Azure SQL + Redis persistence helpers |
| `src/lib/agents/guardrails.js` | Server-side checks for auto-actions |
| `src/lib/agents/tools/db.js` | `query_analytics_events_db` — pre-approved query templates |
| `src/lib/agents/tools/landings.js` | `list_landing_pages` — 88 SEO landings × metrics |
| `src/lib/agents/tools/ga4.js` | `fetch_ga4_metrics` — service-account JWT + GA4 Data API |
| `src/lib/agents/tools/proposeAction.js` | `propose_action` — wraps state + Telegram approval card |
| `src/lib/agents/marketing/systemPrompt.js` | Stable cached system prompt for the marketing agent |
| `src/lib/agents/marketing/run.js` | Marketing orchestrator (multi-turn tool loop) |
| `src/lib/agents/tools/sentry.js` | Sentry REST API client + webhook signature verifier |
| `src/lib/agents/tools/vercel.js` | Vercel REST API client (deployments + rollback) + webhook signature verifier |
| `src/lib/agents/tools/github.js` | GitHub REST API client (read files, propose PR, auto-merge gated) |
| `src/lib/agents/security/systemPrompt.js` | Stable cached system prompt for the security agent |
| `src/lib/agents/security/run.js` | Security orchestrator with guardrail-gated auto-actions |
| `src/lib/agents/health.js` | `runHealthCheck()` — pings every external dependency in parallel + Markdown formatter |
| `src/app/api/agents/telegram-webhook/route.js` | Single webhook entry point, command + callback router |
| `src/app/api/agents/marketing/run/route.js` | Cron + manual trigger endpoint for the marketing agent |
| `src/app/api/agents/sentry-webhook/route.js` | Sentry → security agent dispatcher (HMAC + filter + dedupe) |
| `src/app/api/agents/vercel-webhook/route.js` | Vercel deploy events → opens 10-min post-deploy guard window |
| `src/app/api/agents/security/run/route.js` | Manual trigger for security agent (with optional issueId) |
| `src/app/api/agents/health/route.js` | `/health` HTTP endpoint with `x-setup-secret` auth |
| `src/app/api/agents/migrate/route.js` | One-shot HTTP migration endpoint (alternative to running the CLI script) |
| `scripts/migrate_agents_schema.js` | Idempotent schema migration (CLI form) |
