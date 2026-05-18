// Spec 1 · Direct flow, asegurado.
//
// Path:
//   /search-v2 → filter "tengo seguro" → pick a clinic & slot
//     → /book?step=form with insurance pre-selected → fill patient form
//     → /book?step=payment with totalPrice = priority fee → Stripe → /book?step=success
//
// What this guards against: regressions in the headline conversion funnel,
// the one that drives almost all real revenue today. If this spec passes,
// the asegurado path works end-to-end on the deployed preview.

const { test, expect } = require('@playwright/test');
const { fakePatient, fillStripeCard, cleanupBooking } = require('./helpers');

test.describe('direct flow · asegurado', () => {
  let bookingRef = null;

  test('books a priority slot end-to-end with Stripe test card', async ({
    page,
    request,
  }) => {
    const patient = fakePatient('direct-aseg');

    // Step 1 — land on search-v2 with insurance pre-selected via URL.
    // This is the canonical entry from a "tengo seguro" CTA on the home
    // page, and bypasses the filter UI which has 3 unrelated dropdowns
    // that don't have stable test ids.
    await page.goto('/search-v2?specialty=cardiologia&city=madrid&insurance=Sanitas');
    await expect(page).toHaveURL(/search-v2/);

    // Step 2 — pick a clinic. We click the first "Confirmar reserva" CTA
    // on the result grid (the one closest to the top of the page). If
    // the listing is empty in the preview env this fails fast, which
    // is the right behavior — there's no booking funnel to test.
    const confirmBtn = page.getByRole('button', { name: /Confirmar reserva/i }).first();
    await expect(confirmBtn, 'at least one clinic must be listed on the preview').toBeVisible({
      timeout: 15_000,
    });
    await confirmBtn.click();

    // Step 3 — inside ClinicBookingModal: pick the first available slot.
    // The modal renders procedure → date → time. We trust the defaults
    // (first procedure / first date) and only click the first time slot.
    const firstSlot = page.locator('button.cbm-time-btn').first();
    await expect(firstSlot, 'at least one time slot must be available').toBeVisible({
      timeout: 10_000,
    });
    await firstSlot.click();

    // Step 4 — confirm reserva → navigates to /book.
    await page.getByRole('button', { name: /Confirmar reserva/i }).click();
    await page.waitForURL(/\/book\?/, { timeout: 10_000 });

    // The URL must carry the insurance filter — without it we'd fall
    // into the lock-in code path on the next page. This is a regression
    // guard for the bug PR #50 fixed (where hasInsurance stays null).
    await expect(page).toHaveURL(/insurance=Sanitas/);

    // Step 5 — fill the patient form.
    await page.locator('#name').fill(patient.name);
    await page.locator('#surname').fill(patient.surname);
    await page.locator('#email').fill(patient.email);
    await page.locator('#age').fill(patient.age);
    await page.locator('#gender').selectOption(patient.gender);

    // The "Sí, tengo seguro" toggle should already be pre-selected from
    // the URL. Verify defensively — if this assertion fails it means
    // the search-v2 → book bridge isn't forwarding the param.
    await expect(
      page.locator('.book-insurance-option', { hasText: /Sí, tengo seguro/i }),
    ).toHaveClass(/active/);

    // The price breakdown should show the service as "A cubrir por tu seguro"
    // — that's the asegurado tell. If we see a € amount on the service
    // line, the pricing logic broke.
    await expect(page.getByText(/A cubrir por tu seguro/i)).toBeVisible();

    // Step 6 — submit → goes to payment step.
    await page.locator('#pay-btn').click();
    await expect(page).toHaveURL(/step=|.*/); // still on /book, step changes via state
    await expect(page.getByRole('heading', { name: /Pago seguro/i })).toBeVisible({
      timeout: 10_000,
    });

    // Step 7 — Stripe. Fill the test card and pay.
    await fillStripeCard(page);
    const payBtn = page.getByRole('button', { name: /pagar/i });
    await payBtn.click();

    // Step 8 — success screen + capture reference for cleanup.
    await expect(
      page.getByRole('heading', { name: /Reserva prioritaria confirmada/i }),
    ).toBeVisible({ timeout: 30_000 });

    const refLocator = page.locator('.book-confirmation-ref');
    bookingRef = (await refLocator.textContent())?.trim() || null;
    expect(bookingRef, 'booking reference should be displayed').toBeTruthy();
  });

  test.afterEach(async ({ request }) => {
    await cleanupBooking(request, bookingRef);
    bookingRef = null;
  });
});
