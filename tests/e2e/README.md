# End-to-end smoke tests

Playwright suite that exercises the four highest-value patient flows
on a deployed environment. Goal: catch the next bug like the
lock-in-payment regression (PR #50) **before** it reaches production.

## What this covers

| Spec | Flow | What breaks if it fails |
| --- | --- | --- |
| `01-direct-asegurado` | search-v2 → book → pay (with insurance) | Headline conversion funnel |
| `02-direct-sin-seguro` | search-v2 → book → pay (no insurance) | Pricing math (service + priority) |
| `03-lockin-paga` | POST /api/referrals → /lock-in → /book?step=payment | **The bug from PR #50** — toggle in lock-in step=payment |
| `04-ops-alternativa-flow` | admin proposes alternative → patient accepts | Ops operational workflow |

The other 8 cells of the 12-cell matrix (origin × insurance × ops-action)
are covered by `docs/MANUAL_QA_PATIENT_FLOWS.md` until a real bug
justifies promoting them to specs.

## Running locally against a Vercel preview

1. Open the PR you want to test. Wait for the Vercel comment with the
   preview URL, or pull it from `gh`:

   ```bash
   gh pr view <n> --json statusCheckRollup \
     --jq '.statusCheckRollup[]
           | select(.context | contains("Vercel"))
           | .targetUrl' | head -1
   ```

2. Install Playwright (one-time):

   ```bash
   npm install
   npx playwright install chromium
   ```

3. Set the env vars and run:

   ```bash
   export PLAYWRIGHT_BASE_URL=https://medconnect-<hash>-saludonnet.vercel.app
   export E2E_OPS_ADMIN_USERNAME=...  # from Vercel envs
   export E2E_OPS_ADMIN_PASSWORD=...  # from Vercel envs
   npm run test:e2e
   ```

   On Windows PowerShell:

   ```powershell
   $env:PLAYWRIGHT_BASE_URL='https://medconnect-<hash>-saludonnet.vercel.app'
   $env:E2E_OPS_ADMIN_USERNAME='...'
   $env:E2E_OPS_ADMIN_PASSWORD='...'
   npm run test:e2e
   ```

4. For debugging, use the UI mode — step through frames, inspect
   selectors, replay failures:

   ```bash
   npm run test:e2e:ui
   ```

## Why preview and not localhost

- Stripe test mode + live keys + Azure SQL + Clerk only behave like
  production when wired through the production-shaped build. The
  lock-in bug from PR #50 reproduced fine in production but not in
  `next dev` because the URL params were always explicitly set during
  manual dev testing.
- Vercel previews are cheap and fresh per PR. Running against them is
  the practical maximum of realism we can get without touching prod.
- No `webServer` config — the target is assumed to exist.

## Why no CI yet

Smoke tests run locally before merging. We will hook into GitHub Actions
once the suite has stabilized for two weeks and we trust the flake rate.
Premature CI on a flaky suite teaches the team to ignore red builds,
which is worse than no CI at all.

## Cleanup

Each spec calls `cleanupBooking()` in `afterEach`. If a run crashes
mid-spec it can leave a real row in the preview's DB — the patient name
is `E2E*` so Raquel can spot and discard them.

## Adding a new spec

Promote a row from `docs/MANUAL_QA_PATIENT_FLOWS.md` only when:

1. A real bug has been caught in that path twice or more, **and**
2. The flow is stable enough to be selectoring-safe (you can write
   `getByRole` / `getByLabel` lookups, not brittle CSS positional ones).

Avoid expanding above 8 specs without a strong reason — each spec is a
flake risk and a maintenance cost.
