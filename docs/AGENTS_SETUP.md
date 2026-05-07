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

## 4 — What's still pending per phase

| Phase | Owner-side setup | Status |
|---|---|---|
| **0 — Andamiaje** | Telegram bot + env vars + migration | ⬜ pending owner |
| **1 — Marketing MVP** | GA4 service account JSON (base64) → `GA4_SERVICE_ACCOUNT_JSON`, plus `GA4_PROPERTY_ID`. Cron `0 8 * * 1` will be added to `vercel.json`. | ⬜ |
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
| `src/app/api/agents/telegram-webhook/route.js` | Single webhook entry point, command + callback router |
| `scripts/migrate_agents_schema.js` | Idempotent schema migration (run once after deploy) |
