# Med Connect — MVP Launch Pending Tasks

_Last updated: 2026-04-24 (continued from 2026-04-10)_

---

## 📊 STATUS SUMMARY

**Platform Status:** 🟡 **90% MVP-ready, awaiting backend integration**

| Component | Status | Notes |
|-----------|--------|-------|
| **Frontend (Next.js App Router)** | ✅ Complete | All UI flows built: home, search-v2, booking, lock-in, auth, admin, pro dashboard. 40 SEO landing pages prerendered. Deployed to Vercel, auto-builds on push. |
| **Backend APIs** | 🟠 Scaffolded | Routes created but awaiting B1 (Azure SQL) + authentication integrations (Clerk). Email API working with Resend. |
| **Database (Azure SQL)** | ⏳ Blocked on B1 | Schema designed, firewall needs enabling. Once B1 done, run `/api/db/setup?secret=mc-setup-2026` to create tables. |
| **Authentication (Clerk)** | 🟠 Configured | Framework integrated, static auth working. Awaiting H3 (medconnect.es domain config) for custom domain. |
| **Email (Resend)** | 🟠 Configured | Infrastructure wired, key saved. Awaiting B2 (domain verification) for production delivery. |
| **Analytics** | 🟠 Scaffolded | GA4 + Clarity framework ready. Awaiting H4 (GA4 property creation) + H5 (Google Ads link). |
| **Payments (Stripe)** | 🟢 Mock | Working in dev with 4242 card. Awaiting B4 (real Stripe via SaludOnNet). |
| **Clinic Data** | 🟢 Mock | Using localhost mock data. Awaiting M3 (SaludOnNet DB sync) for live slots. |
| **Deployment (Vercel)** | ✅ Live | `medconnect-bay.vercel.app`, auto-deploys on GitHub push. |
| **Compliance (GDPR)** | ✅ Complete | Cookie consent, privacy policies, data handling. |

**Critical Path to Launch:** B1 → B2 → B3 → H1/H2 → H3 → H4 → B4 (1-2 weeks estimated)

---

## 🔴 BLOCKERS (must fix before any real user hits the site)

| # | Task | Notes |
|---|------|-------|
| B1 | **Azure SQL firewall** — allow Azure services | Portal Azure → Networking → "Allow Azure services and resources" → ON. Without this DB is unreachable in production. Hit `/api/db/setup?secret=mc-setup-2026` once after enabling to create all tables. |
| B2 | **Verify medconnect.es DNS on Resend** | Resend dashboard → Domains → add medconnect.es → add SPF/DKIM records to domain registrar. Until done, emails may land in spam. Once done, update H7 to change FROM email. |
| B3 | **Add real CIF to Aviso Legal** | `/legal` page — CIF row currently omitted (MVP). Add company legal CIF before going public. |
| B4 | **Real Stripe integration** | Currently mock (4242 card). Needs SaludOnNet Stripe project + new domain binding. Requires coordination with SaludOnNet team. Last step before real payments. |
| B5 | **Azure frontend infrastructure (decision)** | Azure server 52.158.47.4 has nginx + certbot ready but NO medconnect.es configured yet. **Recommendation: KEEP VERCEL** for frontend (GitHub auto-deploy, global CDN). Azure is backup infrastructure if needed. |

---

## 🟠 HIGH PRIORITY (pre-launch)

| # | Task | Notes |
|---|------|-------|
| H1 | **Update phone number** | Header shows `900 123 456` (fake). Replace with real Med Connect number in: `src/components/Header.js` and anywhere else it appears. Search: `grep -r "900 123 456"`. |
| H2 | **Real Trustpilot account** | Create at trustpilot.com/business. Replace mock reviews in `src/components/TrustpilotSection.js`. Update "Ver más opiniones" link to real profile. |
| H3 | **Clerk — allow medconnect.es domain** | Clerk dashboard → Settings → Domains → add medconnect.es. Without this, Clerk auth redirects won't work on custom domain (currently works on vercel domain only). |
| H4 | **GA4 property** | analytics.google.com → Create property → get `G-XXXXXXXXXX` → add to Vercel env vars as `NEXT_PUBLIC_GA4_ID`. |
| H5 | **Activate GA4 in Google Ads** | Link GA4 property to Google Ads account for conversion tracking on bookings. Prerequisite: H4 must be done first. |
| H6 | **Run `/api/db/setup`** | After B1 (Azure SQL firewall), call `GET /api/db/setup?secret=mc-setup-2026` to create all tables including `analytics_events`. One-time setup. |
| H7 | **Update Resend FROM email** | After B2 (domain verification), change `RESEND_FROM_EMAIL` in Vercel from `onboarding@resend.dev` to `Med Connect <noreply@medconnect.es>`. |

---

## 🟡 MEDIUM PRIORITY (soon after launch)

| # | Task | Notes |
|---|------|-------|
| M1 | **Custom domain DNS setup** | Point medconnect.es DNS A record → Vercel. Coordinate with domain registrar. Verify in Vercel dashboard → Domains. |
| M2 | **Anthropic API key** | For `/api/analytics/report` weekly Claude-generated insights. `console.anthropic.com` → create key → add as `ANTHROPIC_API_KEY` in Vercel env vars. |
| M3 | **SaludOnNet DB sync** | Read-only credentials + schema from SaludOnNet team. Enables live clinic slots from SaludOnNet instead of mock `availability[]` data. Critical for real clinic bookings. |
| M4 | **Rate limiting** | Implement on `/api/analytics/event` (max 100 events/session) and `/api/referrals` (max 10/hour per IP). Prevents spam/abuse. |
| M5 | **Mobile testing** | Full QA: iOS Safari + Chrome Android on `/search-v2`, booking flow, CookieBanner, specialty landing pages. Test responsive grid + sticky UI. |
| M6 | **Custom 404 page** | `src/app/not-found.js` — show friendly error + search bar + home link. Currently shows default Next.js 404. |
| M7 | **Clarity Microsoft integration (optional)** | If keeping Clarity for session recording: create project at clarity.microsoft.com, add `NEXT_PUBLIC_CLARITY_ID` to Vercel. Currently GA4 is primary. |
| M8 | **Favicon & Open Graph images** | Add `/public/favicon.ico`, `/public/og-image.png` for social previews + browser tabs. Currently using defaults. |

---

## 🟢 FUTURE / PHASE 2

| # | Task | Notes |
|---|------|-------|
| F1 | **Re-enable Med Connect Plus plans** | Content preserved in `feature/with-plans` git branch. Merge to main when Plus feature launches. Includes home, book flow, /suscripcion pages with plan pricing. |
| F2 | **Sentry error monitoring** | Add `@sentry/nextjs` for production error tracking + performance monitoring. |
| F3 | **Server-side reminder cron** | `/api/referrals/remind` endpoint built (queries referrals 28-32 min old, sends lockInReminder email). Needs Vercel Pro for `*/2 * * * *` cron. Workaround: call manually or upgrade. |
| F4 | **Admin & Pro dashboard Clerk guards** | `src/app/admin/page.js` and `src/app/pro/dashboard/page.js` — add full Clerk role checks (`useAuth()` + redirect if role not admin/professional). |
| F5 | **SEO specialty landing pages for Ads** | Specialty-specific paid campaign landing pages (e.g., `/cardiologia-madrid` alias for `/especialistas/cardiologia/madrid`). Helps Google Ads Quality Score. |
| F6 | **Expand placeholder slots strategy** | Currently Day 6 & 9 only (MVP). Phase 2: expand to Day 3-5 and Day 10-12 based on demand + operations feedback. |
| F7 | **Professional dashboard enhancements** | Referral statistics, commission tracking, payout history, clinic schedule sync from SaludOnNet. |
| F8 | **Patient account features** | Booking history, saved clinics, appointment reminders (SMS), review submission, appointment rescheduling. |
| F9 | **Revoke old GitHub PAT** | GitHub settings → Personal access tokens → find old `ghp_pLGJLr...` (from initial setup) → delete. No longer needed, Windows Credential Manager has cached credentials. |

---

## ✅ COMPLETED (This Session — 2026-04-24)

**SEO Landing Pages (40 static pages)**
- [x] Dynamic route `/especialistas/[especialidad]/[ciudad]/page.js` with `generateStaticParams` → all 40 pages prerendered at build time
- [x] Dynamic `generateMetadata` per page: unique `<title>`, `<meta description>`, canonical, Open Graph tags
- [x] JSON-LD structured data: MedicalBusiness + FAQPage + BreadcrumbList for Google rich snippets
- [x] Navy hero section: H1 + specialty description + key stat pills
- [x] SearchResults client component: reuses ClinicCardV2, ClinicBookingModal, SearchBarV2 (compact mode), filters, map panel
- [x] About section + "How to Book" (4 steps) + FAQ accordion (3 FAQs per specialty)
- [x] Internal linking grid: other cities (same specialty) + other specialties (same city) for SEO crawl coverage
- [x] `/lib/seoData.js`: single source of truth (SPECIALTY_MAP + CITY_MAP + combination helpers)
- [x] Updated `/sitemap.xml` with all 40 URLs at priority 0.85 (weekly)
- [x] Fixed CSS import path in SearchResults.js (../../ → ../../..)
- [x] Build verification: all 68 static pages compile successfully

**Infrastructure & Authentication**
- [x] Brand rename complete: all PriorSalus → Med Connect (split HTML spans too)
- [x] Clerk auth scaffolded + fully integrated
  - Dual-mode: static links work without Clerk keys (safe for SSG)
  - Clerk hooks removed from SSG-rendered components to prevent build failures
  - Pages: `/sign-in`, `/sign-up`, `/pro/login`, `/admin/login` + middleware
- [x] Email infrastructure fully wired via Resend
  - Central dispatcher: `lib/email.js` with mock fallback
  - 6 HTML templates: lockInInvitation, bookingConfirmation, paymentReceipt, adminBookingEdit, clinicPatientCompleted, operationsBookingAlert
  - API route: `POST /api/email/send` for email dispatching
  - Key saved in `.env.local` and Vercel (mock mode active until domain verification)

**Booking & Payment Flow**
- [x] Payment form with mock Stripe (pre-filled 4242 card, 2s spinner)
- [x] Payment state machine: `step: 'form' | 'payment' | 'success'`
- [x] Booking confirmation email + payment receipt + ops alert
- [x] Lock-in invitation email flow (60-min countdown, resend support)
- [x] Account creation CTA on booking success (email pre-filled)
- [x] Slot pre-selection in modal (click slot chip → modal opens with date selected)
- [x] Clinic image avatar support (ready for DB, uses initials fallback)

**Legal & Compliance**
- [x] GDPR Cookie banner: Accept (closes + triggers tracking) | Reject & Create Account
- [x] Consent flow: `/accept-cookies` intermediate page (sets localStorage) → GA4/Clarity load only after `'accepted'`
- [x] Política de Privacidad, Aviso Legal, Política de Cookies
- [x] Footer links updated to real pages

**Frontend & UI**
- [x] Login/Sign-up buttons in Header (static links, safe for SSG)
- [x] "Rechazar y crear cuenta" flow in CookieBanner (→ register → `/accept-cookies` → home)
- [x] Plus/subscription section removed from home, book flow, `/suscripcion`
- [x] Plus content preserved in `feature/with-plans` git branch
- [x] Search-v2 as primary search (doctoralia-style)

**Deployment & DevOps**
- [x] Vercel auto-deploy from GitHub push (saludonnet-tests-projects account)
- [x] Live at: `https://medconnect-bay.vercel.app`
- [x] GitHub: `SaludOnNet-test/medconnect` (main branch)
- [x] Git safety: old PATs removed, `.claude` added to .gitignore (contains local secrets)

**Infrastructure Analysis**
- [x] Azure server 52.158.47.4 assessed: nginx + certbot ready, no frontend deployed yet
- [x] Decision: KEEP VERCEL for frontend (GitHub auto-deploy + global CDN)
- [x] Azure maintained as backup infrastructure

---

## ✅ COMPLETED (Earlier Sessions)

- [x] GDPR Cookie banner (GA4/Clarity consent-gated)
- [x] Legal pages: Privacidad, Legal, Cookies
- [x] sitemap.xml + robots.txt (Next.js native)
- [x] bookingConfirmation email pipeline
- [x] Analytics scaffolding: GA4 + Clarity + Azure SQL + Claude report
- [x] Slot pre-selection + clinic images
- [x] Vercel deployment (auto-deploy from GitHub)
