// Shared helpers for Playwright smoke tests.
//
// Keep these small and obvious — when a spec breaks, the maintainer should
// be able to read the helper in one screen and understand what it asserts.

const { expect } = require('@playwright/test');

/**
 * Stripe test card constants.
 * https://docs.stripe.com/testing
 *
 * 4242 4242 4242 4242 — generic success, no 3DS required.
 * We use any future expiry and any CVC; Stripe's test mode accepts all.
 */
const STRIPE_TEST_CARD = {
  number: '4242 4242 4242 4242',
  // 12/34 → December 2034. Far enough out that we never need to bump it.
  expiry: '12/34',
  cvc: '123',
  postal: '28001', // Madrid centro
};

/**
 * Unique fake patient identity. Each spec generates its own so concurrent
 * runs and CI replays don't collide on email-unique constraints.
 *
 * Email format: `e2e+<spec>-<timestamp>@medconnect-test.invalid`.
 * The `+suffix` trick keeps the inbox routable while making every run
 * unique. `.invalid` TLD is RFC-2606 reserved so we never accidentally
 * spam a real domain if a webhook fires.
 */
function fakePatient(specName) {
  const ts = Date.now();
  return {
    name: `E2E${specName.charAt(0).toUpperCase()}`,
    surname: `Test ${ts.toString().slice(-5)}`,
    email: `e2e+${specName}-${ts}@medconnect-test.invalid`,
    phone: '+34600000000',
    address: 'Calle de Prueba 1, 28001 Madrid',
    age: '42',
    gender: 'F',
  };
}

/**
 * Fill the Stripe CardElement that lives inside an iframe. Playwright
 * `frameLocator` automatically handles re-attaching when Stripe re-renders.
 *
 * The CardElement is one combined input (number + exp + cvc + postal split
 * into separate inputs *within* the same iframe). We type into each by
 * its placeholder.
 */
async function fillStripeCard(page) {
  // Stripe Elements mounts as an iframe with a title that always starts
  // with "Secure card payment input frame" (or "Secure payment input frame"
  // in older versions). The locator hedges across both wordings.
  const stripeFrame = page
    .frameLocator('iframe[title*="payment input frame" i]')
    .first();

  await stripeFrame
    .locator('[placeholder*="1234" i], [name="cardnumber"]')
    .fill(STRIPE_TEST_CARD.number);
  await stripeFrame
    .locator('[placeholder*="MM" i], [name="exp-date"]')
    .fill(STRIPE_TEST_CARD.expiry);
  await stripeFrame
    .locator('[placeholder*="CVC" i], [name="cvc"]')
    .fill(STRIPE_TEST_CARD.cvc);

  // Postal code is optional in some Stripe configurations — only fill if present.
  const postalInput = stripeFrame.locator(
    '[placeholder*="postal" i], [name="postal"]',
  );
  if (await postalInput.count()) {
    await postalInput.fill(STRIPE_TEST_CARD.postal);
  }
}

/**
 * Admin login helper. Hits `/admin/login`, fills the credentials, and
 * waits for the redirect to `/admin/ops`. Requires the test runner to
 * have `E2E_OPS_ADMIN_USERNAME` and `E2E_OPS_ADMIN_PASSWORD` env vars
 * set (the same values that are configured in Vercel for the preview).
 *
 * We deliberately do NOT hardcode credentials in the spec. If the value
 * isn't set we fail loudly so the engineer knows what's missing.
 */
async function loginAsAdmin(page) {
  const username = process.env.E2E_OPS_ADMIN_USERNAME;
  const password = process.env.E2E_OPS_ADMIN_PASSWORD;

  if (!username || !password) {
    throw new Error(
      'E2E_OPS_ADMIN_USERNAME and E2E_OPS_ADMIN_PASSWORD env vars must be set. ' +
        'Get them from Vercel project settings → Environment Variables, or from ' +
        'the team lead.',
    );
  }

  await page.goto('/admin/login');
  await page.locator('#username, [name="username"]').fill(username);
  await page.locator('#password, [name="password"]').fill(password);
  await page.getByRole('button', { name: /entrar|log\s*in/i }).click();
  // Wait for the redirect to ops — proves the cookie was set.
  await page.waitForURL(/\/admin\/(ops|board)/, { timeout: 10_000 });
}

/**
 * Cancel a booking via the public DELETE endpoint, called from `afterEach`
 * so a flaking test never leaves a real booking in the DB that the team
 * might mistake for a real patient. Best-effort — never throws.
 */
async function cleanupBooking(request, reference) {
  if (!reference) return;
  try {
    await request.delete(`/api/bookings/${reference}`);
  } catch {
    // Swallow — cleanup is best-effort. If it fails, the booking will be
    // visible in /admin/ops as an obvious "E2E" name and Raquel can sweep
    // it manually.
  }
}

/**
 * The `/api/referrals` POST builds a lock-in row directly. We use this in
 * the lock-in spec to skip the /book → "Soy un profesional" flow (which
 * has its own coverage in the direct-asegurado spec) and jump straight
 * to testing the lock-in → payment hop, which is where the bug lived.
 */
async function createReferral(request, overrides = {}) {
  const ts = Date.now();
  const body = {
    id: `e2e-ref-${ts}`,
    patientEmail: `e2e+lockin-patient-${ts}@medconnect-test.invalid`,
    professionalEmail: `e2e+lockin-pro-${ts}@medconnect-test.invalid`,
    providerName: 'Centro Médico de Pruebas E2E',
    providerId: 1,
    specialty: 'Cardiología',
    slotDate: nextWorkdayDate(),
    slotTime: '10:00',
    fee: 25,
    lockInWarningAt: new Date(Date.now() + 60 * 60 * 1000).toISOString(),
    ...overrides,
  };
  const res = await request.post('/api/referrals', { data: body });
  expect(res.ok(), `POST /api/referrals failed: ${res.status()}`).toBe(true);
  const j = await res.json();
  // The API may return either the row or {referral: row} — handle both.
  return j.referral || j;
}

/**
 * Return YYYY-MM-DD for the next non-weekend day starting from tomorrow.
 * Keeps test slots realistic without colliding with the current day's
 * already-booked grid.
 */
function nextWorkdayDate() {
  const d = new Date();
  d.setDate(d.getDate() + 1);
  while (d.getDay() === 0 || d.getDay() === 6) {
    d.setDate(d.getDate() + 1);
  }
  return d.toISOString().slice(0, 10);
}

module.exports = {
  STRIPE_TEST_CARD,
  fakePatient,
  fillStripeCard,
  loginAsAdmin,
  cleanupBooking,
  createReferral,
  nextWorkdayDate,
};
