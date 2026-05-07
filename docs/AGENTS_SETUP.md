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

## 5 — What's still pending per phase

| Phase | Owner-side setup | Status |
|---|---|---|
| **0 — Andamiaje** | Telegram bot + env vars + migration | ⬜ pending owner |
| **1 — Marketing MVP** | _Optional:_ GA4 service account JSON (base64) → `GA4_SERVICE_ACCOUNT_JSON`, plus `GA4_PROPERTY_ID`. Without these the agent uses Azure SQL only. Cron is wired in `vercel.json`. | 🟢 code shipped |
| **2 — Security reactivo** | `SENTRY_AUTH_TOKEN`, `SENTRY_ORG`, `SENTRY_PROJECT`, `SENTRY_WEBHOOK_SECRET`, `GITHUB_TOKEN`, `GITHUB_REPO`, `VERCEL_PROJECT_ID`, `VERCEL_TEAM_ID`. Sentry webhook configured in their dashboard pointing at `/api/agents/sentry-webhook`. | ⬜ |
| **3 — Security autónomo** | Flip `auto_rollback_enabled` and/or `auto_merge_enabled` to `true` via `/security config` from Telegram. Recommended only after **4+ weeks** of Phase 2 observation. | ⬜ |
| **4 — Refinamientos** | Google Ads OAuth + Trends, embeddings on `agent_memory`, dashboard. | ⬜ |

---

## 5 — Daily commands cheatsheet

From your Telegram chat with the bot:

- `/agents` — help
- `/status` — open pending proposals across both agents
- `/marketing analizar 7d` — trigger marketing analysis on demand (Phase 1+)
- `/security investigar <issue_id>` — investigate a Sentry issue (Phase 2+)
- `/marketing config max_proposals_per_run=3` — tune marketing live
- `/security config auto_rollback_enabled=true` — enable auto-rollback (Phase 3)

When a proposal arrives, you'll see inline buttons (`Aceptar`/`Rechazar`/
`Detalle`). Pressing them is the only way to action a proposal — the
chat conversation does not execute commands.

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
| `src/app/api/agents/telegram-webhook/route.js` | Single webhook entry point, command + callback router |
| `src/app/api/agents/marketing/run/route.js` | Cron + manual trigger endpoint for the marketing agent |
| `scripts/migrate_agents_schema.js` | Idempotent schema migration (run once after deploy) |
