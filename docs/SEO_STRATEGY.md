# SEO Strategy — medconnect.es

**Drafted:** 2026-05-07 · **Horizon:** 90 days · **Spanish-only · Madrid-first**

---

## TL;DR

You already have the bones of a solid SEO setup — 88 pre-rendered specialty × city pages with `MedicalBusiness` + `FAQPage` + `BreadcrumbList` schema, a clean sitemap, dense internal linking, and recent Lighthouse audits. **Organic search is a 3–6 month payoff**, so don't expect it to drive May 18 launch traffic — that's SEM's job. SEO's job is to **compound month over month** so by Q3 you're paying less per booking.

This document covers:
- What's already shipped (so you don't waste effort re-doing it)
- 5 high-leverage technical fixes to ship in the next 14 days
- A content-expansion plan to grow the indexable surface from 100 → 350+ pages over 90 days
- Off-page strategy fitted to the Spanish healthcare niche (where E-E-A-T + Doctoralia-style trust signals matter more than backlink volume)
- Search Console setup (today) + first weekly review cadence
- Success metrics + the three numbers to watch

---

## 1. What's already built (don't redo)

| Asset | Status | Reference |
|---|---|---|
| 88 specialty × city landing pages, fully static-generated | ✅ Live | `src/app/especialistas/[especialidad]/[ciudad]/page.js` |
| Per-page `MedicalBusiness` + `FAQPage` + `BreadcrumbList` JSON-LD | ✅ Live | same file (single `@graph` root) |
| Per-page canonical, OG, Twitter card | ✅ Live | `generateMetadata()` |
| Dynamic sitemap (145 URLs, priority-weighted) | ✅ Live | `src/app/sitemap.js` |
| Robots.txt with sensible Allow/Disallow + sitemap reference | ✅ Live | `src/app/robots.js` |
| Dense internal mesh: each specialty page links to 10 other cities + 7 other specialties | ✅ Live | same specialty page |
| Page-level metadata on `/como-funciona`, `/faq`, `/aseguradoras`, `/sin-seguro`, `/search-v2` | ✅ Live | individual route files |
| Recent Lighthouse audits (2026-05-05) for `/`, `/search-v2`, `/book`, `/especialistas/cardiologia/madrid` | ✅ On disk | project root, mobile + desktop variants |

**Strengths to lean on:** the specialty × city template is a *force multiplier* — every change to it propagates across 88 pages. Most improvements should land in that template, not in one-off pages.

---

## 2. Five technical fixes to ship by May 18

These are all small code changes with disproportionate SEO impact. None block the SEM launch but each makes organic ranking faster.

### 2.1 Add `MedicalOrganization` JSON-LD to homepage and root layout

**Why:** Google needs to know what entity owns the site. Without it, brand searches ("medconnect", "med connect", "medconnect cita") have weaker entity-level confidence and brand SERP features (knowledge panels, sitelinks) lag months behind.

**Where:** Inject into `src/app/layout.js` (root) so it appears on every page. Use `MedicalOrganization` over generic `Organization` because we're a healthcare service.

**Suggested payload:**
```jsonc
{
  "@context": "https://schema.org",
  "@type": "MedicalOrganization",
  "@id": "https://www.medconnect.es/#org",
  "name": "Med Connect",
  "alternateName": "MedConnect",
  "url": "https://www.medconnect.es",
  "logo": "https://www.medconnect.es/logo.png",
  "sameAs": [
    "https://www.linkedin.com/company/medconnect-es",
    "https://www.trustpilot.com/review/medconnect.es"
    // add Twitter, FB, IG when live
  ],
  "areaServed": { "@type": "Country", "name": "España" },
  "parentOrganization": {
    "@type": "Organization",
    "name": "SaludOnNet",
    "url": "https://www.saludonnet.com"
  },
  "contactPoint": {
    "@type": "ContactPoint",
    "telephone": "+34-911-69-94-04",
    "contactType": "customer support",
    "areaServed": "ES",
    "availableLanguage": ["Spanish"]
  }
}
```

### 2.2 Add canonical tags to the remaining 30+ pages without one

Audit revealed canonicals are missing from `/`, `/book`, `/contacto`, legal pages, and most auth/internal routes. The `/book` and auth/internal pages are in `Disallow` so it doesn't matter, but `/`, `/contacto`, and the four legal pages (`/privacidad`, `/legal`, `/cookies`, `/aviso-legal`) all need one.

**Pattern to follow** (already used on `/faq`):
```js
export const metadata = {
  // ... existing metadata
  alternates: { canonical: '/' },  // or whatever the route path is
};
```

### 2.3 Add `Service` schema to specialty × city pages

`MedicalBusiness` + `FAQPage` is good, but you're not currently telling Google what specific *services* the page is about. Add a `Service` block referencing the specialty + price tier. Updates `src/app/especialistas/[especialidad]/[ciudad]/page.js`:

```jsonc
{
  "@type": "Service",
  "name": "Cita prioritaria con cardiólogo en Madrid",
  "serviceType": "Cardiología",
  "provider": { "@id": "https://www.medconnect.es/#org" },
  "areaServed": { "@type": "City", "name": "Madrid" },
  "offers": {
    "@type": "AggregateOffer",
    "lowPrice": "5",
    "highPrice": "29",
    "priceCurrency": "EUR",
    "offerCount": "4"
  }
}
```

This unlocks Google's "Service" rich result on Spanish health queries — currently underexploited by competitors.

### 2.4 Add Organization schema to `/aseguradoras` and link each insurer

`/aseguradoras` lists 10 insurance partners. Currently it's a plain page. Add a structured listing with per-insurer `Organization` references — strengthens entity associations and gives Google ammo to surface MedConnect when users search insurer brand names organically (separate from SEM bidding).

### 2.5 Internal link from homepage to top specialty pages

Audit showed homepage doesn't link directly to any `/especialistas/*` page (only the `SearchBarV2` does, post-interaction). Add a "Especialidades populares" section above the footer with 8 direct links — one per specialty, anchored to Madrid as the default. PageRank flow from homepage → specialty pages is currently rate-limited by JS-rendered links.

**Suggested anchor text format** (kebab-cased English class names, Spanish copy):
```jsx
<section className="popular-specialties">
  <h2>Especialidades disponibles en Madrid</h2>
  <ul>
    <li><Link href="/especialistas/cardiologia/madrid">Cardiólogos en Madrid</Link></li>
    <li><Link href="/especialistas/ginecologia/madrid">Ginecólogos en Madrid</Link></li>
    <li><Link href="/especialistas/traumatologia/madrid">Traumatólogos en Madrid</Link></li>
    {/* ... 5 more */}
  </ul>
</section>
```

---

## 3. Search Console setup (do today)

This is the single highest-leverage 30-minute task in this whole document. Without Search Console you're flying blind on organic.

1. **Verify ownership** at <https://search.google.com/search-console>:
   - Add property `https://www.medconnect.es` (URL prefix property — *not* domain property, so we keep clean separation between `medconnect.es` and `www.medconnect.es`).
   - Verify via DNS TXT record (preferred — survives Vercel redeploys) OR via the existing GA4 measurement ID (fastest if you're logged into the same Google account).
2. **Submit sitemap:** `https://www.medconnect.es/sitemap.xml`. Within 24h Google reads it; within 7 days you'll see "Discovered/Indexed" counts in the Coverage report.
3. **Inspect URL → request indexing** for these 5 priority URLs (overrides natural crawl queue, indexes within hours):
   - `https://www.medconnect.es/`
   - `https://www.medconnect.es/especialistas/cardiologia/madrid`
   - `https://www.medconnect.es/especialistas/ginecologia/madrid`
   - `https://www.medconnect.es/especialistas/traumatologia/madrid`
   - `https://www.medconnect.es/especialistas/dermatologia/madrid`
4. **Set up alerts:** Settings → Email preferences → enable all property-owner alerts (manual actions, security issues, indexing drops). These email you within 24h of any de-indexing event — critical for catching mistakes early.
5. **Link Search Console ↔ GA4:** GA4 → Admin → Product links → Search Console → Link. Once linked, Search Console queries appear in GA4 reports (essential for knowing which queries drive booking conversions, not just impressions).

### Weekly Search Console review cadence (5 min, every Monday)

| Tab | What to look for | Action |
|---|---|---|
| Performance → Queries | Any query getting impressions but CTR < 2% | Rewrite that page's title tag to better match the query |
| Performance → Pages | Any page with > 10 impressions / 0 clicks | Check title + meta description for that route |
| Coverage → Errors | Any new errors in the last 7 days | Fix or mark "Validation: Fixed" |
| Enhancements → FAQs / Breadcrumbs | Any structured-data warnings | Fix the JSON-LD on the affected route |
| Experience → Core Web Vitals | URLs in "Poor" or "Needs improvement" | Cross-reference with Lighthouse PDFs, fix the biggest offender first |

---

## 4. Keyword strategy — organic vs paid split

**Rule of thumb:** SEM (Google Ads) wins the high-commercial-intent terms with predictable CPA. SEO wins the long-tail informational and comparison queries that don't convert directly but feed the funnel and build authority.

| Intent | Example | Channel | Why |
|---|---|---|---|
| Direct booking | `cardiologo madrid`, `cita ginecologo urgente` | **SEM (paid)** | High CPC but bookable visit. Already in Madrid keyword build. |
| Insurer rescue | `sanitas no me da cita`, `adeslas cita urgente` | **SEM (paid, gated on legal)** | Highest-intent in Spanish health. Campaign 3 in SEM doc. |
| Procedure-specific | `electrocardiograma madrid precio`, `revision lunares cuanto cuesta` | **SEO** | Researchful intent, lower CPC ROI but convert at 1–3% if landing page is good. Build dedicated procedure pages. |
| Comparison / "vs" | `medconnect vs doctoralia`, `mejor cuadro medico privado` | **SEO** | Branded competitive — paid CTR is poor, organic comparison content wins these. |
| Informational | `como funciona seguro medico privado`, `que cubre sanitas` | **SEO** | Top-of-funnel — feeds remarketing pool. Build a content hub. |
| Local "near me" | `cardiologo cerca de mi`, `ginecologo barrio salamanca` | **SEO + GBP** | Google Maps + organic. Requires Google Business Profile (see §6). |

### Top 30 organic keyword targets (Madrid, post-launch)

Ordered by estimated monthly search volume × CVR potential, low-hanging first.

**Procedure-specific (priority 1 — build these pages first):**
1. `electrocardiograma madrid precio`
2. `revision ginecologica precio`
3. `revision lunares dermatologo madrid`
4. `mamografia madrid privada precio`
5. `holter 24 horas madrid`
6. `traumatologo rodilla madrid`
7. `endoscopia digestiva madrid privada`

**Insurer informational (priority 2):**
8. `cuadro medico sanitas madrid`
9. `aseguradoras medicas comparativa 2026`
10. `que cubre adeslas`
11. `dkv vs sanitas opiniones`

**Process / informational (priority 3 — content hub):**
12. `como funciona el seguro medico privado`
13. `seguro medico privado vs publico tiempos espera`
14. `cuanto tarda una cita por la seguridad social`
15. `ir al privado sin tener seguro`

**Pediatric / niche (priority 4 — long tail):**
16. `cardiologo infantil madrid`
17. `pediatra privado madrid`
18. `ginecologo embarazo privado madrid`

(See full list of 30 in §5 content plan below — each maps to a planned page.)

---

## 5. Content expansion — 100 → 350+ pages over 90 days

The specialty × city template is doing heavy lifting (88 pages). The next two surfaces to expand:

### 5.1 Procedure pages (target: 40 pages by July 18)

Pattern: `/procedimientos/[procedure-slug]/[ciudad]` (or `/procedimientos/[procedure-slug]` city-agnostic, with city block injected if user has location).

**Top 10 procedures to launch first** (data sourced from the existing `services` mock + Doctoralia keyword data):

| Slug | Page H1 | Cities (initial) |
|---|---|---|
| `electrocardiograma` | Electrocardiograma en {city} — desde €40 | Madrid, Barcelona |
| `holter` | Holter 24h en {city} | Madrid only |
| `ecocardiograma` | Ecocardiograma en {city} | Madrid only |
| `revision-ginecologica` | Revisión ginecológica completa en {city} | Madrid, Barcelona |
| `citologia` | Citología vaginal en {city} | Madrid only |
| `mamografia` | Mamografía en {city} | Madrid, Barcelona |
| `revision-lunares` | Revisión de lunares en {city} | Madrid only |
| `eliminacion-verrugas` | Eliminación de verrugas en {city} | Madrid only |
| `endoscopia-digestiva` | Endoscopia / gastroscopia en {city} | Madrid only |
| `colonoscopia` | Colonoscopia en {city} | Madrid only |

Each page needs:
- H1 with procedure + city
- Intro paragraph explaining the procedure (medical, neutral, link to MedlinePlus / NHS for source authority)
- Pricing transparency (lowest, typical, highest in our network)
- "When you should book this" — 3–5 bullet symptoms / use cases
- FAQ (8–12 Q&A — voice-search and PAA optimized)
- 3 doctors who do this procedure (with anonymized profile cards)
- Cross-link to parent specialty page
- `Service` + `MedicalProcedure` + `FAQPage` JSON-LD

**Engineering effort:** template is similar to `/especialistas/[especialidad]/[ciudad]/page.js` but with a different data source (`procedures.json` instead of `seoData.js`). One sprint of work.

### 5.2 Insurer landing pages (target: 10 pages — one per partner — by June 18)

Pattern: `/aseguradoras/[insurer-slug]`

For each of: Sanitas, Adeslas, DKV, AXA, Mapfre, Asisa, Cigna, Generali, Caser, Néctar.

Each page:
- H1: "MedConnect con tu seguro de {Insurer}"
- Intro: "Si tienes {Insurer} y tu cuadro médico no te da cita a tiempo…"
- Specialties covered (Cardio, Gine, Trauma, Derma, etc — with internal links to each specialty page)
- "Cómo funciona con {Insurer}" — 3-step process explainer
- Pricing: priority fee tiers (€5/€10/€19/€29) — they call your insurance, not the other way around
- FAQ specific to that insurer (8–12 Q&A — including "what does my coverage include?")
- Trust signals: clinic count in {Insurer}'s cuadro, success rate
- `Service` + `Organization` (insurer ref) + `FAQPage` JSON-LD

**Note on legal sensitivity:** insurer brand mentions in *organic* content are generally safer than in paid ads — informational use is broadly tolerated under EU trademark law. Still, use neutral language ("compatible con", "trabajamos con"), avoid logos without permission, and pick the safer "{Insurer}" copy variants for now. You'll get the same legal review here as for SEM Campaign 3.

### 5.3 Process / informational hub (target: 20 articles over 90 days)

Pattern: `/blog/[slug]` (or `/recursos/[slug]` if you want a less-bloggy URL).

**First 10 articles to write** (3,000–5,000 chars each, written by SaludOnNet's medical team or with medical-reviewer byline):
1. "Cómo funciona el seguro médico privado en España (guía 2026)"
2. "Seguro médico privado vs público: tiempos de espera reales"
3. "Cuánto tarda una cita por la Seguridad Social en Madrid (datos 2026)"
4. "Ir al privado sin tener seguro: opciones, costes, cómo elegir"
5. "Cuadro médico de Sanitas en Madrid: cómo encontrar un especialista"
6. "Adeslas, DKV o Sanitas: comparativa 2026"
7. "Qué cubre cada aseguradora médica en España: tabla resumen"
8. "Cómo cambiar de aseguradora médica sin perder coberturas"
9. "Seguro médico para autónomos en España"
10. "Pediatra privado en Madrid: qué buscar y cómo elegir"

Every article needs:
- Visible **author byline** with credentials (e.g., "Por Dr. X — Cardiólogo, MIR 2008") — this is E-E-A-T critical for YMYL topics
- **Last reviewed** date + "next review" date 6 months out
- Sources cited (link to AEPS, AEM, official insurer literature)
- `Article` + `MedicalScholarlyArticle` JSON-LD
- Author entity with `Person` + `Physician` schema linked to a `/autores/[slug]` profile page

**Why YMYL matters:** healthcare content without medical credentials gets crushed in Spanish Google's quality reviews. One un-reviewed health article can drag the *whole domain* down. Either invest in proper medical-reviewer bylines or don't publish a blog at all — there's no middle ground.

---

## 6. Off-page strategy

### 6.1 Google Business Profile (GBP) — set up this week

Healthcare local SEO is heavily skewed toward GBP. Without it, you don't show up in Google Maps "near me" searches at all.

Steps:
1. Create GBP at <https://business.google.com> using the same Google account that owns Ads + GA4 + Search Console.
2. Category: **Medical clinic** (primary), **Insurance agency** (secondary — captures "seguro" searches).
3. Service area: Madrid + 30 km (matches SEM geo). Don't list a physical address — MedConnect is the booking layer, not a clinic. Use "Service area only".
4. Description (750 chars max): the same value prop as the homepage hero, light edit for GBP audience.
5. Add photos: hero from the site, 4–6 trust photos (clinic interiors, doctors, the booking flow on mobile).
6. Verify via mail postcard (sent to a SaludOnNet office address, takes ~5 days).

Once verified, **enable Google Posts** — weekly 100-char updates show up in your knowledge panel. Use them for: new specialty added, new city, special offers (priority fee discounts), seasonal awareness (e.g., "Reserva tu revisión cardiovascular antes del verano").

### 6.2 Spanish health directories — submit in next 30 days

These are the directories that *actually* still pass useful link equity in Spanish health (verified 2026 with low spam scores):

| Directory | Quality | Action |
|---|---|---|
| Doctoralia.es | High (DA 80+) | Listed your top 20 partner doctors there if not already; they get a backlink to MedConnect from each doctor's profile if you sponsor it |
| TopDoctors.es | Medium-high | Submit company listing; €100/yr subscription |
| Medbravo.org | Low-medium | Free listing |
| GuiaMedica.es | Low | Free, but worth doing for the citation |
| Hospitales.com.es | Low | Free clinic-network listing |
| Sanidad oficial directories (Comunidad de Madrid healthcare register) | Citation-only | Confirm SaludOnNet is registered correctly — it's an authority signal even without a link |

### 6.3 Press / PR — Q3 strategy

Don't pay for press in months 1–2 of organic; the SEM data tells you which messages resonate first. Once you have 60 days of real conversion data:
- Pitch to **El País — Sociedad** the angle: "Nueva plataforma reduce las semanas de espera en el cuadro médico privado".
- Pitch **Cinco Días / Expansión** the business angle: "SaludOnNet lanza marca propia para el sector concertado".
- Pitch healthtech podcasts: **Iberhealth podcast**, **eHealth Reporter España**.

Each press hit is worth ~3 high-DA backlinks if done right.

### 6.4 Insurance partner backlinks (the underrated lever)

Each of your 10 insurer partners has a "partners" or "concertados" page on their site. Negotiate a backlink from each as part of the commercial partnership renewal. Even one link from `sanitas.es/concertados` is worth more than 50 directory listings combined.

---

## 7. 90-day roadmap

### Month 1 (May 7 – June 7) — Foundation

- [x] **Done:** specialty × city pages, sitemap, robots, canonicals on top 11 pages, MedicalBusiness/FAQ/Breadcrumb schema.
- [ ] Search Console setup + sitemap submission (today).
- [ ] Five technical fixes from §2 (homepage Org schema, missing canonicals, Service schema, /aseguradoras structured listing, homepage → specialty links).
- [ ] Google Business Profile created and verified (mail postcard takes 5 days; start now).
- [ ] First 5 procedure pages launched: electrocardiograma, revisión ginecológica, holter, mamografía, revisión lunares (all Madrid).

### Month 2 (June 7 – July 7) — Expansion

- [ ] First 10 insurer landing pages live.
- [ ] First 5 blog articles published (with medical-reviewer bylines).
- [ ] Submit to top 5 directories (Doctoralia, TopDoctors, Medbravo, GuiaMedica, Hospitales.com.es).
- [ ] Internal link audit: ensure every top-ranking page is reachable from homepage in ≤3 clicks.
- [ ] Lighthouse score improvements: get every public page mobile ≥ 85.
- [ ] Schedule the first 4 Google Posts on GBP (one per Monday).

### Month 3 (July 7 – August 7) — Authority

- [ ] Procedure page count: 20+.
- [ ] Blog article count: 10+.
- [ ] Press outreach: 3 pitches sent.
- [ ] Insurance partner backlink negotiations opened (10 emails).
- [ ] First Search Console review of organic CTR: identify top 10 underperforming pages, rewrite titles + meta descriptions.
- [ ] First link-building outreach: 20 medical bloggers / health journalists contacted (manual, personalised).

---

## 8. Success metrics

Watch these three numbers, weekly:

### A. Search Console: total impressions (leading indicator)
- **Week 4:** 5,000 impressions/month — sitemap should be 80%+ indexed by then.
- **Week 8:** 25,000/month.
- **Week 12:** 75,000/month if procedure pages + blog launched on time.

### B. Search Console: total clicks + CTR (intent indicator)
- **Week 4:** 200 clicks/month (CTR ~ 4%).
- **Week 8:** 1,500/month (CTR ~ 6% — long-tail terms have higher CTR).
- **Week 12:** 5,000+/month.

### C. Organic share of `book_completed` conversions (the only number that pays the bills)
- **Week 4:** 5%+ of bookings come from organic landing pages (rest are SEM + direct + remarketing).
- **Week 8:** 15%+.
- **Week 12:** 25%+ — at this point organic is genuinely subsidising your CAC, not just diversifying it.

### Rejection criteria
- **If organic share of conversions is < 10% at week 12**, the SEO investment isn't working — diagnose: thin content? Bad query-to-page mapping? Trust signals missing? Pause new content creation and fix the foundation.
- **If organic share is > 30% at week 12**, scale: hire a content writer + medical reviewer, pull SEM budget toward branded only.

---

## 9. What's intentionally NOT in this plan

- **Featured snippet optimization** — premature; do once you have 50+ ranking pages.
- **Schema.org `Review` / aggregateRating** — only ship after you have ≥ 50 verified reviews on Trustpilot. Faking review schema is a manual-action trigger.
- **AMP / hreflang / multi-language** — Spanish-only is an active product decision; no `hreflang` needed.
- **Programmatic SEO at city × insurer × specialty (88 × 10 × 10 = 8,800 pages)** — temptation real, but Google's recent updates penalise thin programmatic content hard. Stay disciplined: only launch a page if it would survive a manual quality reviewer's eye-test.
- **Backlink buying / PBNs / guest-post networks** — these will get you de-indexed in Spanish health. Don't.

---

## 10. Today's action list (do today, in order)

1. [ ] **Search Console** — verify property + submit sitemap (15 min)
2. [ ] **GA4 → Search Console link** (5 min)
3. [ ] **Google Business Profile** — create + start mail-postcard verification (10 min — postcard arrives in ~5 days)
4. [ ] **Email pitch to Doctoralia partnerships** asking about backlink-from-doctor-profile arrangement (10 min)
5. [ ] Read the lighthouse PDFs from 2026-05-05; identify the single biggest Core Web Vitals issue per route; create a tracking issue (30 min)
6. [ ] Schedule the §2 technical fixes in the next sprint (5 min)

Total: ~75 minutes today, ~3 weeks of foundational work, 90 days to compound.
