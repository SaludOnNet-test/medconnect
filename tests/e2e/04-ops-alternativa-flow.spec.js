// Spec 4 · Ops "propose alternative" → patient accepts → case confirmed.
//
// Path:
//   Create a booking via the API (skipping the patient-facing funnel — covered
//     by specs 1 + 2 — so this spec stays focused on the ops side).
//   Authenticate as admin in /admin/login.
//   Open /admin/ops/[caseId] → propose an alternative clinic / slot via the
//     typeahead → confirm "Mandar email al paciente con la nueva clínica".
//   Extract the `respondToken` from the case row (via the same API used
//     by the page) and visit /booking/respond?token=...&decision=accept.
//   Assert the case state transitions to confirmed.
//
// What this guards against: the Ops alternative-proposal workflow, which
// is the most operationally important non-happy-path. If the clinic
// typeahead or the email-token-respond chain breaks, the team has to
// triage by hand.

const { test, expect } = require('@playwright/test');
const {
  fakePatient,
  loginAsAdmin,
  cleanupBooking,
  nextWorkdayDate,
} = require('./helpers');

test.describe('ops · propose alternative clinic', () => {
  let bookingRef = null;

  test('admin proposes alternative, patient accepts via email link', async ({
    page,
    request,
  }) => {
    const patient = fakePatient('ops-alt');

    // Step 1 — seed a booking via the API. We use the same endpoint the
    // front-end calls, so the resulting case row matches a real one.
    const seedRes = await request.post('/api/bookings', {
      data: {
        id: `e2e-bk-${Date.now()}`,
        patientName: `${patient.name} ${patient.surname}`,
        patientEmail: patient.email,
        patientPhone: patient.phone,
        providerId: 1,
        providerName: 'Centro Médico de Pruebas E2E',
        specialty: 'Cardiología',
        slotDate: nextWorkdayDate(),
        slotTime: '11:00',
        amount: 25,
        status: 'confirmed',
        cardLast4: '4242',
        hasInsurance: true,
        insuranceCompany: 'Sanitas',
        paymentIntentId: `pi_e2e_${Date.now()}`,
        platformFee: 25,
        servicePrice: 0,
      },
    });
    expect(seedRes.ok(), `POST /api/bookings failed: ${seedRes.status()}`).toBe(true);
    const seedJson = await seedRes.json();
    bookingRef = seedJson.id || seedJson.bookingId || null;
    const caseId = seedJson._case?.id ?? null;
    expect(caseId, 'booking POST must return an ops case id').toBeTruthy();

    // Step 2 — admin login.
    await loginAsAdmin(page);

    // Step 3 — open the case page.
    await page.goto(`/admin/ops/${caseId}`);
    await expect(page.getByRole('heading', { name: /caso|ops|reserva/i })).toBeVisible({
      timeout: 10_000,
    });

    // Step 4 — find the clinic typeahead and propose an alternative.
    // The input's placeholder contains "Buscar clínica" (the team renames
    // labels but tends to keep the placeholder intact).
    const clinicTypeahead = page.locator('input[placeholder*="Buscar" i]').first();
    await expect(clinicTypeahead).toBeVisible({ timeout: 10_000 });
    await clinicTypeahead.fill('Centro');

    // Wait for the dropdown suggestions and pick the first one.
    const firstSuggestion = page.locator('[role="option"], .typeahead-option, button')
      .filter({ hasText: /Centro|Clínica|Médico/i })
      .first();
    await expect(firstSuggestion).toBeVisible({ timeout: 10_000 });
    await firstSuggestion.click();

    // Fill an alternative date/time. The dialog typically has type=date and
    // type=time inputs; we set them to a workday slot 1 hour later.
    const altDate = nextWorkdayDate();
    const dateInput = page.locator('input[type="date"]').first();
    if (await dateInput.count()) await dateInput.fill(altDate);
    const timeInput = page.locator('input[type="time"]').first();
    if (await timeInput.count()) await timeInput.fill('12:00');

    // Step 5 — confirm: trigger the email to the patient.
    await page
      .getByRole('button', { name: /mandar email.*nueva clínica|enviar.*alternativa/i })
      .click();

    // The page should show a confirmation toast/message — match loosely
    // ("email enviado", "propuesta enviada", "esperando respuesta").
    await expect(
      page.getByText(/email enviado|esperando respuesta|propuesta enviada/i),
    ).toBeVisible({ timeout: 10_000 });

    // Step 6 — read the case row to grab the respondToken. This is the
    // same data the email link would carry.
    const caseRes = await request.get(`/api/ops/cases/${caseId}`);
    expect(caseRes.ok()).toBe(true);
    const caseRow = await caseRes.json();
    const token = caseRow.respondToken || caseRow.token || caseRow.alternativeToken;
    expect(
      token,
      'case row must expose the respondToken so the email link works',
    ).toBeTruthy();

    // Step 7 — patient accepts via the public respond page.
    await page.goto(`/booking/respond?token=${token}&decision=accept`);
    await expect(
      page.getByRole('heading', { name: /confirmada|aceptada|gracias/i }),
    ).toBeVisible({ timeout: 15_000 });

    // Step 8 — verify the case row transitioned to confirmed.
    const finalRes = await request.get(`/api/ops/cases/${caseId}`);
    const finalRow = await finalRes.json();
    expect(finalRow.state || finalRow.status).toMatch(/confirm|resolved|completed/i);
  });

  test.afterEach(async ({ request }) => {
    await cleanupBooking(request, bookingRef);
    bookingRef = null;
  });
});
