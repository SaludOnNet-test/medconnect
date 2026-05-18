// Spec 3 · Lock-in flow, patient pays.
//
// **This is the test that guards the bug PR #50 fixed.**
//
// Path:
//   POST /api/referrals (simulates a derivador creating a lock-in)
//     → visit /lock-in/[id] → fill name/phone/address + accept terms
//     → submit → redirects to /book?lockInId=...&step=payment
//     → assert: insurance toggle is visible (hasInsurance=null at this point)
//     → click "Sí, tengo seguro" → assert: Stripe iframe appears and
//       the total displayed is > 0
//     → fill Stripe and pay → success
//
// What this guards against: the bug where lock-in patients landed on the
// payment step with totalPrice=0, no card inputs of real value, and a
// "Confirmar reserva gratuita" button. If anyone removes the toggle from
// step=payment (or auto-defaults hasInsurance), this spec fails.

const { test, expect } = require('@playwright/test');
const {
  fillStripeCard,
  cleanupBooking,
  createReferral,
} = require('./helpers');

test.describe('lock-in flow · paga', () => {
  let bookingRef = null;

  test('lock-in patient sees insurance toggle then pays priority fee', async ({
    page,
    request,
  }) => {
    // Step 1 — create a referral row directly via the API. This is the
    // shortcut equivalent of an external doctor (or internal derivador)
    // having created a lock-in.
    const referral = await createReferral(request);
    expect(referral.id).toBeTruthy();

    // Step 2 — visit the lock-in page.
    await page.goto(`/lock-in/${referral.id}`);
    await expect(
      page.getByRole('heading', { name: /reserv|confirma|datos/i }),
    ).toBeVisible({ timeout: 10_000 });

    // Step 3 — fill the patient data form. We use getByLabel because the
    // id naming convention has shifted historically and label text is the
    // most stable selector.
    await page.getByLabel(/nombre/i).first().fill('Paciente E2E Lockin');
    await page.getByLabel(/teléfono|telefono/i).fill('+34611222333');
    await page.getByLabel(/dirección|direccion/i).fill('Calle Falsa 1, Madrid');

    // Accept terms — the checkbox is explicitly reset to false on every
    // mount (the source code comments call this out), so we must check it.
    await page.getByLabel(/acepto|términos|terminos|consient/i).first().check();

    // Step 4 — submit. Button label varies a bit (it has the fee € in it),
    // so match on the imperative verb.
    await page
      .getByRole('button', { name: /confirmar y proceder|proceder al pago|pagar/i })
      .first()
      .click();

    // Step 5 — wait for redirect to /book at step=payment.
    await page.waitForURL(/\/book\?.*step=payment/, { timeout: 10_000 });

    // ──────── THE BUG GUARD ────────
    // Before PR #50: hasInsurance stayed null, totalPrice was 0, Stripe
    // form was useless. After PR #50: the insurance toggle is visible
    // and the Stripe form is gated behind it.
    //
    // We assert BOTH parts of the contract:
    //   (a) the toggle is visible — without it the patient can't move on
    //   (b) the Stripe iframe is NOT mounted yet — proves the gate works
    await expect(
      page.locator('.book-insurance-option', { hasText: /Sí, tengo seguro/i }),
    ).toBeVisible({ timeout: 10_000 });
    await expect(
      page.locator('.book-insurance-option', { hasText: /No tengo seguro/i }),
    ).toBeVisible();
    // No Stripe iframe yet — only after the patient picks one of the options.
    await expect(
      page.locator('iframe[title*="payment input frame" i]'),
    ).toHaveCount(0);

    // Step 6 — pick "Sí, tengo seguro" (the asegurado path).
    await page
      .locator('.book-insurance-option', { hasText: /Sí, tengo seguro/i })
      .click();

    // Insurer dropdown appears — pick the first non-empty option.
    const insurerSelect = page.locator('#insurance-company-payment');
    await expect(insurerSelect).toBeVisible({ timeout: 5_000 });
    const insurerOptions = await insurerSelect.locator('option').allTextContents();
    const firstInsurer = insurerOptions.find((o) => o && !o.match(/seleccionar/i));
    if (firstInsurer) {
      await insurerSelect.selectOption({ label: firstInsurer });
    }

    // Step 7 — assert that the total now reflects the priority fee
    // (and is > 0). This is the actual numerical guard for the bug.
    const totalRow = page.locator('.book-price-row.total .book-price-amount');
    await expect(totalRow).toBeVisible();
    const totalText = (await totalRow.textContent()) || '';
    const totalEUR = parseFloat(
      totalText.replace(/[^\d,.]/g, '').replace(',', '.'),
    );
    expect(
      totalEUR,
      'lock-in payment total must be > 0 (priority fee). If this is 0, the PR #50 fix has regressed.',
    ).toBeGreaterThan(0);

    // Step 8 — Stripe iframe is now mounted; pay.
    await expect(
      page.locator('iframe[title*="payment input frame" i]'),
    ).toBeVisible({ timeout: 10_000 });
    await fillStripeCard(page);
    await page.getByRole('button', { name: /pagar/i }).click();

    // Step 9 — success.
    await expect(
      page.getByRole('heading', { name: /Reserva prioritaria confirmada/i }),
    ).toBeVisible({ timeout: 30_000 });

    bookingRef = (await page.locator('.book-confirmation-ref').textContent())?.trim() || null;
  });

  test.afterEach(async ({ request }) => {
    await cleanupBooking(request, bookingRef);
    bookingRef = null;
  });
});
