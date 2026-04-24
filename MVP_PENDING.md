# Med Connect — MVP Launch Pending Tasks

_Last updated: 2026-04-24_

---

## 🔴 BLOCKERS (must fix before any real user hits the site)

| # | Task | Notes |
|---|------|-------|
| B1 | **Azure SQL firewall** — allow Azure services | Portal Azure → Networking → "Allow Azure services and resources" → ON. Without this DB is unreachable in production. Hit `/api/db/setup` once after enabling. |
| B2 | **Verify medconnect.es DNS on Resend** | Resend dashboard → Domains → add medconnect.es → add SPF/DKIM records. Until done, emails land in spam. |
| B3 | **Add real CIF to Aviso Legal** | `/legal` page — CIF row currently omitted. Add before going public. |
| B4 | **Real Stripe** | Currently mock (4242 card). Needs SaludOnNet Stripe project + new domain. Last step. |

---

## 🟠 HIGH PRIORITY (pre-launch)

| # | Task | Notes |
|---|------|-------|
| H1 | **Update phone number** | Header shows `900 123 456` (fake). Replace with real Med Connect number in: `src/components/Header.js`, and any other pages that display it. Search codebase for `900 123 456`. |
| H2 | **Real Trustpilot account** | Currently TrustpilotSection uses mock reviews and a `#` href. Steps: (1) Create account at trustpilot.com/business, (2) Replace mock reviews with real ones or embed widget, (3) Update "Ver más opiniones" link to real profile URL. File: `src/components/TrustpilotSection.js`. |
| H3 | **Clerk — allow medconnect.es domain** | Clerk dashboard → Settings → Domains → add medconnect.es. Without this Clerk auth won't work on the custom domain. |
| H4 | **GA4 property** | analytics.google.com → Create property → get `G-XXXXXXXXXX` → add to Vercel env vars as `NEXT_PUBLIC_GA4_ID`. |
| H5 | **Activate GA4 in Google Ads** | Link GA4 property to Google Ads account for conversion tracking on bookings. |
| H6 | **Run `/api/db/setup`** | After B1 is done, call `GET /api/db/setup?secret=mc-setup-2026` to create all tables including `analytics_events`. |

---

## 🟡 MEDIUM PRIORITY (soon after launch)

| # | Task | Notes |
|---|------|-------|
| M1 | **Custom domain DNS** | Point medconnect.es → Vercel. Currently aliased but DNS needs propagation. |
| M2 | **Anthropic API key** | For `/api/analytics/report` weekly Claude-generated insights. `console.anthropic.com` → create key → add as `ANTHROPIC_API_KEY` in Vercel. |
| M3 | **SaludOnNet DB sync** | Read-only credentials from SaludOnNet team. Enables live clinic slots instead of mock data. |
| M4 | **Rate limiting** | Add to `/api/analytics/event` and `/api/referrals` to prevent spam. |
| M5 | **Mobile testing** | iOS Safari + Chrome Android on search-v2, booking flow, and CookieBanner. |
| M6 | **Custom 404 page** | `src/app/not-found.js` — show friendly error with search bar. |
| M7 | **Email — Update FROM address** | Once Resend domain verified: change `RESEND_FROM_EMAIL` in Vercel from `onboarding@resend.dev` to `Med Connect <noreply@medconnect.es>`. |

---

## 🟢 FUTURE / PHASE 2

| # | Task | Notes |
|---|------|-------|
| F1 | **Re-enable Med Connect Plus plans** | Content preserved in `feature/with-plans` git branch. Merge to main when ready. |
| F2 | **Sentry error monitoring** | Add `@sentry/nextjs` for production error tracking. |
| F3 | **Server-side reminder cron** | `/api/referrals/remind` endpoint built; needs Vercel Pro for `*/2` cron. Or call manually. |
| F4 | **Admin & Pro dashboard Clerk guards** | `src/app/admin/page.js` and `src/app/pro/dashboard/page.js` — add full Clerk role checks. |
| F5 | **Google Ads landing pages** | Specialty-specific pages (`/cardiologia-madrid`, etc.) for paid campaigns. |
| F6 | **Revoke old GitHub PAT** | Revoke the old token at github.com/settings/tokens (the one used during initial repo setup). |

---

## ✅ COMPLETED

- [x] GDPR Cookie banner (GA4/Clarity load only after consent)
- [x] Política de Privacidad (`/privacidad`)
- [x] Aviso Legal (`/legal`) — CIF pending (B3)
- [x] Política de Cookies (`/cookies`)
- [x] sitemap.xml + robots.txt (Next.js App Router native)
- [x] bookingConfirmation email to patient after payment
- [x] Login/Sign-up buttons in Header
- [x] "Rechazar y crear cuenta" flow in CookieBanner
- [x] Plus/subscription section removed from home, book flow, /suscripcion
- [x] Plus content preserved in `feature/with-plans` git branch
- [x] Footer links updated to real pages (privacidad, legal, cookies)
- [x] Search-v2 as primary search (old /search redirects here)
- [x] Analytics: GA4 + Clarity (consent-gated) + Azure SQL events + Claude weekly report
- [x] Slot pre-selection in booking modal
- [x] Clinic image avatar support (ready for DB)
- [x] Vercel deployed to medconnect-bay.vercel.app (saludonnet-tests-projects account)
