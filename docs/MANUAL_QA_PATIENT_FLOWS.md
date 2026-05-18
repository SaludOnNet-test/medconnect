# Manual QA — Patient flows checklist

> **Owner:** Raquel (Ops) + Francisco (Tecnología)
> **Cadence:** before every production release, and after any change that
> touches `/search-v2`, `/book`, `/lock-in`, `/admin/ops`, or the email
> templates in `src/lib/emailTemplates.js`.
> **Duration:** ~45 minutes end-to-end with the prepared test accounts.

The Playwright suite (`tests/e2e/`) covers the **4 most critical**
cells of the matrix automatically. This document covers the **remaining
8 cells** that are too brittle, too long, or too email-dependent to
automate cleanly today.

## How to use this doc

1. Block 45 minutes. Don't try to do this while taking phone calls — a
   miss here is a bug landing in production.
2. Open this file in one half of the screen, a fresh incognito window
   in the other. Each row is a self-contained scenario.
3. Check the box (`[x]`) only after the scenario passes **every**
   assertion — not "looked roughly right".
4. If anything fails: stop the run, file a GitHub issue with the row
   name and a screenshot, and re-run from the top after the fix.
5. Promote a row to a Playwright spec only when a real bug has been
   caught in that exact cell **twice**.

---

## Test accounts (one-time setup, kept in 1Password)

| Account | Email | Notes |
| --- | --- | --- |
| Paciente (asegurado) | `qa.paciente.aseg@medconnect-test.invalid` | Sanitas as default insurer |
| Paciente (sin seguro) | `qa.paciente.sinseg@medconnect-test.invalid` | — |
| Derivador externo | `qa.deriva.externo@medconnect-test.invalid` | Used for spec 03 lock-in flow |
| Cea Bermúdez (Arita) | `araceli.rodriguez@centrocea.test` | Internal derivador |
| Admin Ops (Raquel) | from Vercel `OPS_ADMIN_USERNAME` | Token-gated `/admin/login` |

Stripe test card: `4242 4242 4242 4242` · expiry `12/34` · CVC `123` · postal `28001`.

---

## The matrix (12 cells)

Cells covered by **Playwright** are marked ✅ (do not re-run manually).
The other 8 are **MANUAL** every release.

| Origin | × | Insurance | × | Ops action |
| --- | --- | --- | --- | --- |
| Direct | × | Asegurado | × | (none / direct accept) → ✅ Spec 01 |
| Direct | × | Sin seguro | × | (none / direct accept) → ✅ Spec 02 |
| Lock-in **interna** | × | Asegurado | × | (none / direct accept) → ✅ Spec 03 |
| Lock-in externa | × | Asegurado | × | (none / direct accept) → **M1** |
| Lock-in interna | × | Sin seguro | × | (none / direct accept) → **M2** |
| Lock-in externa | × | Sin seguro | × | (none / direct accept) → **M3** |
| Any | × | Any | × | Ops change time only → **M4** |
| Any | × | Any | × | Ops change clinic (alt) → ✅ Spec 04 |
| Any | × | Any | × | Ops cancel + refund > 72 h → **M5** |
| Any | × | Any | × | Ops cancel + refund < 72 h (sin seguro) → **M6** |
| Any | × | Any | × | Ops mark no-show → **M7** |
| Any | × | Sin seguro | × | Ops upload voucher → **M8** |

8 manual cells (M1–M8) below.

---

## M1 · Lock-in externa, asegurado

> Tests the bridge between an **external** derivador (any doctor outside
> Cea Bermúdez) and the lock-in payment flow.

### Steps

1. Open incognito → `/derivar-paciente` (or any "Soy profesional" CTA).
2. Sign in / register as `qa.deriva.externo@...` (pro flow). Confirm
   the dashboard shows your name and the "derivar paciente" CTA.
3. Pick any specialty + clinic + slot. Submit.
4. Open the patient inbox link → `/lock-in/[id]`. Fill name + phone +
   address, check terms, submit.
5. On `/book?lockInId=...&step=payment`, **assert the insurance toggle
   is visible** (this is the PR #50 guard manually). Pick "Sí, tengo
   seguro" → Sanitas.
6. Pay with Stripe test card.

### Pass criteria

- [ ] Toggle visible after the lock-in submit (no Stripe form yet).
- [ ] After picking "Sí, tengo seguro" + insurer, the total = priority
      fee only (no service price line shows a € amount; the service
      line reads "A cubrir por tu seguro").
- [ ] Stripe iframe mounts and accepts `4242…`. Success page shows
      "Reserva prioritaria confirmada".
- [ ] Derivador (`qa.deriva.externo@...`) receives the
      `derivadorPatientPaid` email with the patient name + slot.
- [ ] An Ops case appears in `/admin/ops` with `origin=external_referral`
      (or whatever the code labels external lock-ins as).

### Edge case to spot-check

- Refresh the page **during** the lock-in form (between step 4 and the
  submit). The form should restore the data from the URL — not blow
  up with "lock-in expirado" unless 30 minutes have passed.

---

## M2 · Lock-in interna, sin seguro

> Internal derivador (Arita / Cea Bermúdez) referring a patient who
> doesn't have insurance for that specialty. This is the cell where
> the team most often forgets that sin-seguro pays service + priority,
> not just priority.

### Steps

1. Sign in to `/pro/dashboard` as Arita (`araceli.rodriguez@centrocea.test`).
2. Open "Derivar paciente" → pick a specialty / clinic / slot.
3. Trigger the lock-in email. Open it from the patient inbox.
4. Fill the lock-in form, submit.
5. On the payment step, **pick "No tengo seguro"**.

### Pass criteria

- [ ] Toggle visible, both options selectable.
- [ ] After picking "No tengo seguro", the breakdown shows BOTH:
      - Service price line with a € amount (from the procedure catalogue).
      - Priority fee line with a € amount.
- [ ] Total = service + priority, displayed in the total row.
- [ ] Stripe charges that exact total. Confirm the receipt email
      lists both lines.
- [ ] **Commission split:** in `/admin/ops` the case shows
      "Cea Bermúdez deriva: 0 €" (no double-dip on self-derive). This
      enforces the PR #40 + #46 commission rules.
- [ ] Patient receives `bookingConfirmation` + `paymentReceipt`
      emails. The `paymentReceipt` lists service price + priority fee
      as separate lines.
- [ ] Ops case is `awaiting_voucher` (not confirmed), per the sin-seguro
      flow.

### Edge case to spot-check

- The success screen shows the "Voucher en camino" green box — proves
  the sin-seguro branch on the success screen rendered, not the
  asegurado branch.

---

## M3 · Lock-in externa, sin seguro

> Combines the M1 entry path with the M2 sin-seguro payment shape.
> Most failure modes here are in commission attribution (external
> derivador must earn the 5 €/3 € based on days, NOT 50 %).

### Steps

1. Same as M1 (external derivador creates lock-in).
2. Patient picks "No tengo seguro" on `/book?step=payment`.
3. Pay.

### Pass criteria

- [ ] All checks from M2 (sin-seguro payment shape, voucher box, etc.).
- [ ] Commission in `/admin/ops`: derivador earns either **5 €** (if
      slot date is > 3 days from now) or **3 €** (if ≤ 3 days), never
      50 % of priority. This is the rule from PR #40 — easy to break.
- [ ] Derivador email (`derivadorPatientPaid`) arrives with the correct
      commission amount.

### Edge case to spot-check

- Patient cancels within 1 minute of paying: refund flow should still
  work (sin-seguro 72 h rule doesn't apply when payment is fresh enough
  that operations haven't issued the voucher yet).

---

## M4 · Ops changes time only (same clinic)

> Tests the simplest Ops intervention: the booked slot doesn't work
> for the clinic, Ops offers a different time at the same clinic.
> Bug magnet: notification email gets out of sync with the new time.

### Steps

1. Create a direct asegurado booking with `qa.paciente.aseg@...`.
2. Log in as Ops admin → `/admin/ops/[caseId]`.
3. Use the "Cambiar hora" action (NOT "Cambiar clínica" — that's M-spec-04).
4. Pick a new time on the same date. Submit.
5. Patient opens the email link → `/booking/respond?token=...&decision=accept`.

### Pass criteria

- [ ] Ops page shows the new time and a "esperando respuesta del
      paciente" state.
- [ ] Patient email subject contains the **new** time, not the old.
- [ ] Accepting the new time transitions the case to `confirmed`.
- [ ] Clinic email (if implemented) shows the new time.
- [ ] No duplicate emails are sent (each step fires exactly once).

### Edge case

- Patient clicks the email link **twice** in a row: second click
  should be idempotent (still shows "confirmada", no double-charge).

---

## M5 · Ops cancels + refunds (> 72 h before slot)

> Cancellation rules from PR #48: > 72 h ⇒ full refund of priority
> fee. For sin seguro, full refund of service + priority.

### Steps

1. Create a direct booking (asegurado) at least 4 days out.
2. Ops opens the case → "Cancelar + reembolsar".
3. Confirm reason ("Paciente lo pidió").

### Pass criteria

- [ ] Ops UI clearly shows "Reembolso completo" (not partial).
- [ ] Stripe dashboard (test mode) shows a refund of the full charged
      amount.
- [ ] Patient receives `bookingCancelled` + `refundIssued` emails.
- [ ] Case state = `cancelled_refunded`.

### Edge case

- Re-cancel an already-cancelled case: UI should disable the button
  or show "Ya cancelado".

---

## M6 · Ops cancels < 72 h, sin seguro

> The trickiest refund rule: sin-seguro within 72 h gets ONLY the
> service price back. Priority fee is non-refundable.

### Steps

1. Create a sin-seguro direct booking with a slot < 72 h away.
   (Tip: create one at +60 h on a Friday afternoon.)
2. Ops cancels with refund.

### Pass criteria

- [ ] Refund amount = service price ONLY. NOT total. NOT zero.
- [ ] Email to patient explains the split clearly ("Te devolvemos
      el valor de la consulta; la tarifa de prioridad no es
      reembolsable").
- [ ] Case state captures the partial-refund nature (state name
      varies — `cancelled_partial_refund` is the candidate).

### Edge case

- Patient with sin-seguro 73 hours out (just barely > 72 h): full
  refund. Confirm the boundary is **strictly greater than 72 h** =
  full refund. The off-by-one is a classic bug.

---

## M7 · Ops marks no-show

> Patient didn't show up. Ops marks the case so the commission is NOT
> paid to the clinic (and the no-show counts against the patient's
> trust score, if implemented).

### Steps

1. Create a confirmed booking with a past slot date (use the API or
   manipulate a fresh booking's `slotDate` in the DB if no UI affords
   this).
2. Ops opens the case → "Marcar no-show".

### Pass criteria

- [ ] Case state = `no_show`.
- [ ] Clinic commission = 0 (verify in the commission column of
      `/admin/ops`).
- [ ] No refund issued. No new email to patient.
- [ ] Ops note ("¿Por qué no vino?") is required before saving.

---

## M8 · Ops uploads voucher (sin seguro confirmation)

> Sin-seguro bookings land in `awaiting_voucher`. SaludOnNet issues
> the voucher manually (today), Ops uploads it, the case progresses
> to `confirmed` and the patient gets the voucher email.

### Steps

1. Create a sin-seguro booking. Confirm it's `awaiting_voucher`.
2. Ops opens the case → upload the voucher PDF (use any small PDF —
   the file is just attached to the email).
3. Submit.

### Pass criteria

- [ ] Case transitions to `confirmed`.
- [ ] Patient receives `voucherIssued` email with the PDF attached.
- [ ] The PDF is downloadable from the email AND from `/admin/ops` for
      audit.
- [ ] Re-uploading replaces the previous file (no duplicate attachments
      in the audit log).

### Edge case

- Upload a > 5 MB file. The system should reject cleanly with an error
  message (the Blob storage tier has limits — verify the error is
  user-friendly, not "500 internal").

---

## Sign-off

End of the run:

- [ ] All 8 manual cells passed.
- [ ] All 4 Playwright specs passed (`npm run test:e2e` against the
      target preview).
- [ ] No bookings with the `E2E` / `qa.` prefix remain in `/admin/ops`
      (cleanup was effective).
- [ ] Any new bug found has a GitHub issue with steps to reproduce.

Signed: ______________  Date: ______________
