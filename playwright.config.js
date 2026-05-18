// Playwright config — smoke tests against a deployed environment.
//
// Decision recap (2026-05-18): we run smoke tests against the **Vercel
// preview URL** of the PR under review, not against `localhost:3000`.
//   - It's the only place we can test the real Stripe + Azure SQL + Clerk
//     wiring together. Local mocks would miss configuration bugs that only
//     show up in production-shaped builds (the exact class of bug PR #50
//     fixed: lock-in payment broke because `hasInsurance` stayed null
//     under real conditions but worked with default URL params in dev).
//   - There is no `webServer` config — the target environment is assumed
//     to be already running. The harness expects PLAYWRIGHT_BASE_URL.
//
// How to find the preview URL for a PR:
//   gh pr view <n> --json statusCheckRollup \
//     --jq '.statusCheckRollup[] | select(.context | contains("Vercel"))
//           | .targetUrl' | head -1
//
// Then:
//   PLAYWRIGHT_BASE_URL=https://medconnect-xyz-saludonnet.vercel.app \
//     npm run test:e2e
//
// For local debugging only (most flows will partially fail without Stripe):
//   PLAYWRIGHT_BASE_URL=http://localhost:3000 npm run test:e2e

const { defineConfig, devices } = require('@playwright/test');

const baseURL = process.env.PLAYWRIGHT_BASE_URL;

if (!baseURL) {
  // Hard fail in the config so tests don't accidentally hit production. The
  // user must opt in to a target environment by setting the env var.
  throw new Error(
    'PLAYWRIGHT_BASE_URL is required. Set it to a Vercel preview URL ' +
      '(e.g. https://medconnect-abc123-saludonnet.vercel.app) before running tests. ' +
      'See playwright.config.js for the gh-cli one-liner.'
  );
}

module.exports = defineConfig({
  testDir: './tests/e2e',
  // The 4 smoke specs are independent — run them in parallel inside a single
  // worker. We keep workers=1 to avoid hitting Stripe rate limits and to
  // avoid two specs racing on the same admin session.
  fullyParallel: false,
  workers: 1,
  // CI=true bumps retries; locally we keep it at 0 so flakes are obvious
  // instead of being silently retried away.
  retries: process.env.CI ? 2 : 0,
  // 60 s per test — covers a full Stripe round-trip plus DB writes. The
  // lock-in test is the slowest (it also POSTs a referral row before the
  // payment step) and clocks in around 25 s in practice.
  timeout: 60_000,
  expect: { timeout: 10_000 },
  reporter: process.env.CI ? [['github'], ['list']] : 'list',
  use: {
    baseURL,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
    // Spanish locale matches what real users see and keeps date/currency
    // formats consistent with the assertions in the specs.
    locale: 'es-ES',
    timezoneId: 'Europe/Madrid',
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
});
