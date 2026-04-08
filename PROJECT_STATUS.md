# PriorSalus — Project Status
**Share this file at the start of every new session to avoid re-explaining the project.**
**Last updated: 2026-04-07**

---

## What is PriorSalus?
A Spanish healthcare appointment-booking platform. Patients book priority specialist appointments faster than the public waiting list. Professionals (doctors/clinics) can refer patients and earn commissions. Platform is managed by an internal operations team.

**Live URL**: https://medconnect-bay.vercel.app
**Repo**: No git — deploy with `vercel --prod` from project root

---

## Tech Stack
- **Framework**: Next.js 16.2.1 (App Router), React 19.2.4
- **Styling**: CSS modules + CSS variables (--navy, --gold, --emerald)
- **Auth**: localStorage mock (Admin/ADMIN hardcoded) → NextAuth.js (planned)
- **Database**: localStorage mock → Azure SQL (planned)
- **Payments**: Mock → SaludOnNet Stripe (planned)
- **Email**: console.log mock → Resend (planned)

---

## Pages & Routes

| Page | Route | Status |
|------|-------|--------|
| Home | `/` | ✅ Updated layout |
| Search | `/search` | ✅ Updated UX |
| Book/Checkout | `/book` | ✅ Pricing fixed |
| Lock-In | `/lock-in/[id]` | ✅ Live |
| Professional Login | `/pro/login` | ✅ Live (Admin/ADMIN) |
| Professional Dashboard | `/pro/dashboard` | ✅ Updated |
| Admin Login | `/admin/login` | ✅ Live (Admin/ADMIN) |
| Admin Dashboard | `/admin` | ✅ Updated |
| Derivadores Landing | `/derivadores` | ✅ Rewritten |
| Suscripción | `/suscripcion` | ✅ Live |

---

## Key Files

| File | Purpose |
|------|---------|
| `src/data/mock.js` | All mock data: providers (6), specialties (8), services (14), insurances, pricing tiers, slot generation, referral utils, `isSlotAvailable()` |
| `src/app/page.js` | Home page |
| `src/app/search/page.js` | Search results |
| `src/app/book/page.js` | Checkout/booking flow |
| `src/app/admin/page.js` | Admin dashboard |
| `src/app/admin/login/page.js` | Admin login |
| `src/app/pro/dashboard/page.js` | Professional dashboard |
| `src/app/derivadores/page.js` | Derivadores landing |
| `src/components/SearchBar.js` | Search bar (has hospital name field) |
| `src/components/ProviderCard.js` | Provider card with slot calendar |
| `src/components/SlotCalendar.js` | Slot picker + mobile sticky bar |
| `src/components/ReferralModal.js` | 3-step referral wizard |
| `src/components/LockInTimer.js` | 60-min countdown timer |

---

## Pricing Model

| Days from today | Price | Label |
|----------------|-------|-------|
| 0–2 | €25.00 | Súper rápidos |
| 3–29 | €9.99 | Cita con prioridad |
| 30+ | €0.99 | Cita Planificada |

- **Private (no insurance)**: `servicePrice + convenienceFee`
- **Insured**: `convenienceFee` only
- **Plus subscription**: Waives convenience fee + 7.99€/mes or 71.88€/año

---

## Mock Provider Data
- **6 providers** in: Madrid (3), Barcelona (1), Valencia (1), Sevilla (1)
- `allowsFreeCancel: true` for providers id=1 and id=3
- `operatingHours` added to all providers
- Slots guaranteed: at least 1 morning (10:00) + 1 afternoon (17:00) within first 7 days
- Holidays skipped: 2026-04-02 (Jueves Santo), 2026-04-03 (Viernes Santo)

---

## Admin Dashboard Credentials
- URL: `/admin/login`
- Username: `Admin`
- Password: `ADMIN`
- Same for Pro Dashboard: `/pro/login`

---

## Features Completed (This Session)

### 1. Checkout Pricing Fix
- Removed €2.99 "Gestión PriorSalus" fee from private-user price formula and display
- Formula now: `servicePrice + activeFee` (no extra fee)
- Service row label: `"🩺 {service.name}"` (removed "vía SaludOnNet")

### 2. Mock Data (mock.js)
- Added `allowsFreeCancel` flag to all providers (true for id=1, id=3)
- Added `operatingHours` to all providers
- `generateSlots()` now guarantees 2 slots in first 7 days (1 morning, 1 afternoon)
- Skips Spanish public holidays
- Added `isSlotAvailable(providerId, date, time)` utility

### 3. Search Page
- Seeded pseudorandom "personas buscando" count per session per city+specialty (sessionStorage)
- Real slot count badge: "¡Quedan sólo X citas de esta especialidad en tu región!" (next 7 days)
- `allowsFreeCancel` flag drives "Cancelación Gratuita" badge (ProviderCard)
- Mobile UX: filter sidebar no longer sticky
- Mobile: sticky bottom bar in SlotCalendar when date is selected (position: fixed; bottom:0)
- `providerName` URL param filtering added

### 4. Home Page
- New layout order: Hero+SearchBar → Tagline → Value Pillars → SEO Info → "¿Crees que repetirás?" → Plus section → 3 icons (labeled "Incluido en el plan") → Trust bar
- Tagline: "La clínica, hospital o médico que quieras, en el momento que desees."
- Value pillars reframed as "La alternativa premium a las listas de espera"

### 5. SearchBar
- Added hospital/clinic name text input
- Passes `providerName` URL param to `/search`
- Button text changed to "Buscar cita prioritaria"
- Grid updated to 5 columns (1fr 1fr 1fr 1fr auto)

### 6. Derivadores Page
- Full content rewrite with approved text
- Headline: "Tu clínica. Más ingresos. Sin inversión extra."
- Covers: internal derivations, urgent slot premium (PriorSalus pays the time differential directly, tariffs unchanged)
- CTA: "Empezar a derivar pacientes" → `/pro/login`
- Step 2 is now "optional" (register clinic) — Step 1 is "derive first patient" (no registration needed)

### 7. Pro Dashboard
- Two CTA buttons: "Derivación Interna" + "Derivación Externa"
- `MY_CLINIC_PROVIDER_ID = 1` constant (TODO: replace with real account)
- ReferralModal activated `derivationType` filtering: interna = only provider id=1
- Modal header shows derivation context label
- 4 lock-in action buttons per pending/expired referral:
  - "Reenviar al mismo correo" (if slot available)
  - "Enviar a nuevo correo" (inline email input, if slot available)
  - "Extender 60 min" (PENDING + slot available) — resets timer
  - "Cambiar hueco" (always) — opens modal
- LockInTimer supports `expiresAtOverride` prop to reset from parent
- `timerOverrides` state in dashboard tracks per-referral overrides

### 8. Admin Dashboard
- Filter bar on all tabs: clinic, specialty, city, status, date range, amount range, priority
- Booking edit modal: change date/time/clinic/price + internal notes
  - On save: booking status → `pending_patient_approval`
  - Console logs patient email with 3 options (confirm / propose / refund)
- Patient action buttons for `pending_patient_approval` bookings: ✓ / ↔ / €
- Status transitions: `pending_patient_approval` → confirmed/awaiting_patient_proposal/refund_requested
- Lock-in actions in Bookings tab: Reenviar / Nuevo email (inline) for pending bookings
- New status CSS: `pending_patient_approval`, `awaiting_patient_proposal`, `refund_requested`

---

## Approved Backend Plan (Not Yet Built)
See `C:\Users\francisco.pizarro\.claude\plans\crystalline-yawning-rose.md` for full plan.

- **Part 1**: User Accounts (NextAuth.js, Azure SQL, social login, 20+ API endpoints)
- **Part 2**: Admin Dashboard Full (30+ API endpoints, Zendesk, doctor verification, financial filters)
- **Part 3**: GDPR (consent, export, deletion, audit, DPA)
- **Part 4**: Booking Operations Workflow (SaludOnNet integration, placeholder slot negotiation, Zendesk routing, 24h payout)

---

## Key Approved Decisions
- Auth: NextAuth.js (not Auth0)
- Social login: Google + Apple
- 2FA: Phase 2 only
- Support tickets: Zendesk with structured email body markers
- Clinic payout: 50% of booking value, 24h after appointment
- Alternative clinics: same specialty + service + city or ≤30km, ordered by acceptance rate
- Placeholder slots: Day 6 & Day 9 only (MVP)
- Data retention: Indefinitely for now
- Analytics: Yes (Google Analytics or Plausible — TBD)
- Admin stats: 5-minute cache
- Account deletion: 30-day grace period

---

## Next Steps (Suggested)
1. Deploy current changes: `vercel --prod` from project root
2. Test all 6 change sets on live URL
3. Decide on backend implementation start date
4. Choose analytics tool (Google Analytics vs Plausible)
5. Appoint Data Protection Officer (GDPR requirement)
