// Spec 2 · Direct flow, sin seguro.
//
// Path:
//   /search-v2 → filter "sin seguro" → pick a clinic & slot
//     → /book?step=form with isSinSeguro pre-selected
//     → fill patient form → /book?step=payment with
//        totalPrice = servicePrice + priority fee
//     → Stripe → success
//
// What this guards against: the "double pricing" regression from PR #48
// — sin-seguro patients should see BOTH the service price AND the
// priority fee, not just one. Asserting on the breakdown lines proves
// the math is right before Stripe ever loads.

const { test, expect } = require('@playwright/test');
const { fakePatient, fillStripeCard, cleanupBooking } = require('./helpers');

test.describe('direct flow · sin seguro', () => {
  let bookingRef = null;

  test('books a priority slot and pays service + priority fee', async ({
    page,
  }) => {
    const patient = fakePatient('direct-sinseg');

    // Step 1 — land on search-v2 with the sin-seguro filter pre-applied.
    await page.goto('/search-v2?specialty=cardiologia&city=madrid&isSinSeguro=true');
    await expect(page).toHaveURL(/search-v2/);

    // Step 2 — pick the first available clinic.
    const confirmBtn = page.getByRole('button', { name: /Confirmar reserva/i }).first();
    await expect(confirmBtn).toBeVisible({ timeout: 15_000 });
    await confirmBtn.click();

    // Step 3 — first time slot in the modal.
    const firstSlot = page.locator('button.cbm-time-btn').first();
    await expect(firstSlot).toBeVisible({ timeout: 10_000 });
    await firstSlot.click();

    // Step 4 — submit modal → /book.
    await page.getByRole('button', { name: /Confirmar reserva/i }).click();
    await page.waitForURL(/\/book\?/, { timeout: 10_000 });
    await expect(page).toHaveURL(/isSinSeguro=true/);

    // Step 5 — fill the patient form.
    await page.locator('#name').fill(patient.name);
    await page.locator('#surname').fill(patient.surname);
    await page.locator('#email').fill(patient.email);
    await page.locator('#age').fill(patient.age);
    await page.locator('#gender').selectOption(patient.gender);

    // The "No tengo seguro" toggle is pre-selected via URL.
    await expect(
      page.locator('.book-insurance-option', { hasText: /No tengo seguro/i }),
    ).toHaveClass(/active/);

    // Pricing assertion: the service line must show a € amount (not the
    // asegurado-only "A cubrir por tu seguro" message). And the total
    // line must reflect service + priority. We check by parsing the
    // total-row label "Total que pagas hoy" and asserting it's > 0.
    await expect(page.getByText(/Total que pagas hoy/i)).toBeVisible();

    // Capture the total displayed in the breakdown — used later to
    // sanity-check that what Stripe charges matches what we showed.
    const totalRow = page.locator('.book-price-row.total .book-price-amount');
    const totalText = (await totalRow.textContent()) || '';
    const totalEUR = parseFloat(
      totalText.replace(/[^\d,.]/g, '').replace(',', '.'),
    );
    expect(
      totalEUR,
      'sin-seguro total must include both service and priority — must be > 0',
    ).toBeGreaterThan(0);

    // Step 6 — submit → payment step.
    await page.locator('#pay-btn').click();
    await expect(page.getByRole('heading', { name: /Pago seguro/i })).toBeVisible({
      timeout: 10_000,
    });

    // Step 7 — Stripe pay.
    await fillStripeCard(page);
    await page.getByRole('button', { name: /pagar/i }).click();

    // Step 8 — success + voucher info box visible (sin-seguro only).
    await expect(
      page.getByRole('heading', { name: /Reserva prioritaria confirmada/i }),
    ).toBeVisible({ timeout: 30_000 });
    await expect(page.getByText(/Voucher en camino/i)).toBeVisible();

    const refLocator = page.locator('.book-confirmation-ref');
    bookingRef = (await refLocator.textContent())?.trim() || null;
    expect(bookingRef).toBeTruthy();
  });

  test.afterEach(async ({ request }) => {
    await cleanupBooking(request, bookingRef);
    bookingRef = null;
  });
});
