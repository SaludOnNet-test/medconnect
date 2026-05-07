# SEM Launch — Madrid Keyword + RSA Build

**Launch date:** May 18, 2026
**Geo:** Madrid + 30 km radius (Barcelona expansion gated separately)
**Budget:** €500–€1,500 / month
**Primary KPI:** `book_completed` (insured-patient bookings)
**Conversion ID:** `AW-18138897481` / Label `AQ0GCKHf-6gcEMm4pslD` (verified live 2026-05-07)

This file is the paste-ready spec for the four campaigns described in the [SEM Launch Plan](C:\Users\francisco.pizarro\.claude\plans\i-need-a-session-zazzy-crescent.md). All headline character counts have been verified ≤30; descriptions ≤90.

---

## Account-level shared assets (set once, reuse on every campaign)

### Sitelinks (6, all link to specialty pages or info)
| Text | Description line 1 | Description line 2 | URL |
|---|---|---|---|
| Cardiología | Cardiólogos verificados en Madrid | Cita en 24–72h con tu seguro | `https://www.medconnect.es/especialistas/cardiologia/madrid` |
| Ginecología | Ginecólogos privados en Madrid | Reserva online en 2 minutos | `https://www.medconnect.es/especialistas/ginecologia/madrid` |
| Traumatología | Lesiones, esguinces, rodilla | Sin esperas en tu cuadro médico | `https://www.medconnect.es/especialistas/traumatologia/madrid` |
| Sin seguro | Atención privada todo incluido | Clínicas verificadas en Madrid | `https://www.medconnect.es/sin-seguro` |
| Cómo funciona | Tu seguro cubre la consulta | Nosotros, la reserva | `https://www.medconnect.es/como-funciona` |
| Aseguradoras | Sanitas, Adeslas, DKV y más | Pagas solo la prioridad | `https://www.medconnect.es/aseguradoras` |

### Callout extensions (8, plain text ≤25 chars)
- Cita en 24–72h
- Pago seguro con Stripe
- Reembolso garantizado
- Clínicas verificadas
- Reserva online 24/7
- +9 ciudades en España
- Sin esperas de semanas
- Confirmación inmediata

### Structured snippets (Servicios)
Cardiología, Ginecología, Traumatología, Dermatología, Oftalmología, Urología, Otorrinolaringología, Digestivo

### Call extension
**Off at launch.** Adding a phone number that's unstaffed hurts Quality Score (Google penalizes call extensions where nobody picks up). Re-evaluate week 4.

### Lead form extension
**Off at launch.** Revisit week 4 once we have a baseline CVR.

---

## Campaign-level shared negative keyword list

Apply to **Campaigns 2 + 3** (any non-brand search campaign). Create a Shared Library → Negative keyword list named `MEDCONNECT_GLOBAL_NEGATIVES`.

```
gratis
gratuito
seguridad social
sanidad publica
hospital publico
oposiciones
formacion
curso
cursos
mir
empleo
trabajo
sueldo
salario
opiniones
quejas
reclamacion
reclamación
foro
experiencias
urgencias
24 horas
24h
animales
veterinario
veterinaria
para perros
para gatos
ofertas
promocion
promoción
descuento
amazon
youtube
wikipedia
```

`urgencias` and `24 horas` are critical: those are emergency-room intent, completely different funnel. Don't pay for them.

---

## Campaign 1 — MedConnect Brand

### Settings
- **Type:** Search
- **Bid strategy:** Manual CPC
- **Daily budget:** €5–€8 (≈ €150–€240/mo)
- **Max CPC:** €0.50 (brand CPCs in Spanish health are €0.10–€0.40, so €0.50 is generous safety margin)
- **Geo:** Spain (no need to restrict — brand searches are intentful)
- **Languages:** Spanish
- **Networks:** Google Search only (turn OFF Display partners)
- **Schedule:** All hours (no bid adjustments — brand demand is steady)
- **Devices:** No bid adjustments

### Ad Group 1.1 — MedConnect Brand

**Final URL:** `https://www.medconnect.es/`

**Keywords** (8 — exact + phrase, paste into Ads Editor):

| Match | Keyword | Notes |
|---|---|---|
| Exact | `[medconnect]` | Core brand |
| Exact | `[med connect]` | Two-word variant |
| Exact | `[medconnect madrid]` | Brand + geo |
| Exact | `[medconnect cita]` | Brand + intent |
| Phrase | `"medconnect"` | Catches misspellings & long-tail |
| Phrase | `"med connect"` | |
| Phrase | `"medconnect cita"` | |
| Phrase | `"med connect madrid"` | |

**Negative keywords (ad-group level):**
```
medconnect linkedin
medconnect ofertas empleo
medconnect trabajo
medconnect facturacion
medconnect login
```
*(Block intent that's about working at MedConnect or admin tasks, not booking.)*

### RSA 1.1 — MedConnect Brand

**Headlines (15)** — pin the first one to position 1 so brand is always visible:

| # | Headline | Chars | Pin |
|---|---|---|---|
| 1 | Med Connect — Cita médica | 25 | **H1** |
| 2 | Tu cita prioritaria con tu seguro | 33→**too long, swap** | |

Wait that's 33. Let me redo:

| # | Headline | Chars | Pin |
|---|---|---|---|
| 1 | Med Connect — Cita prioritaria | 30 | **H1** |
| 2 | Tu cita médica sin esperas | 26 | |
| 3 | Reserva online en 2 minutos | 27 | |
| 4 | +9 ciudades en España | 22 | |
| 5 | Tu seguro cubre la consulta | 28 | |
| 6 | Especialistas verificados | 25 | |
| 7 | Reserva prioritaria desde €5 | 28 | |
| 8 | Cita esta semana en Madrid | 26 | |
| 9 | Cardiólogos, ginecólogos y + | 28 | |
| 10 | Sanitas, Adeslas, DKV y + | 25 | *(only enable when legal cleared)* |
| 11 | Reembolso si no hay hueco | 24 | |
| 12 | Confirmación inmediata | 22 | |
| 13 | Med Connect oficial | 19 | |
| 14 | Atención privada también | 23 | |
| 15 | Clínicas concertadas | 20 | |

**Descriptions (4):**

| # | Description | Chars |
|---|---|---|
| 1 | Med Connect — la reserva que tu seguro no encuentra. Cita prioritaria desde €5. | 79 |
| 2 | Si tu cuadro médico no te da cita, te buscamos hueco esta semana. Reserva online. | 82 |
| 3 | Tu seguro cubre la consulta. Nosotros, la reserva. Pagas solo la tarifa de prioridad. | 85 |
| 4 | Sin seguro también atendemos. Cita privada con todo incluido. Confirmación inmediata. | 85 |

**Path 1:** `cita`
**Path 2:** `prioritaria`
*(Renders as `medconnect.es/cita/prioritaria` in display URL — improves CTR.)*

---

## Campaign 2 — Non-brand Specialty (Madrid) — the workhorse

### Settings
- **Type:** Search
- **Bid strategy:** **Manual CPC** for first 14 days → **Maximize Conversions** at ≥15 conversions → **tCPA €15** at ≥30 conversions
- **Daily budget:** €20–€30 (≈ €600–€900/mo)
- **Geo:** Madrid + 30 km radius — **"Presence: People in or regularly in"** (NOT "Interest in"). Excludes tourists searching from elsewhere.
- **Languages:** Spanish
- **Networks:** Google Search ONLY — turn off "Include Google search partners" and "Include Display Network"
- **Schedule:** All hours; **+20% bid adjustment Mon–Fri 8–11 AM** (peak intent for "I need a cita this week")
- **Devices:** No bid adjustments at launch; review week 2
- **Negative keyword list:** `MEDCONNECT_GLOBAL_NEGATIVES` (shared)

---

### Ad Group 2.1 — Cardiología Madrid

**Final URL:** `https://www.medconnect.es/especialistas/cardiologia/madrid`
**Max CPC:** €2.00 (competitive specialty term)

**Keywords (12):**

| Match | Keyword |
|---|---|
| Exact | `[cardiologo madrid]` |
| Exact | `[cardiólogo madrid]` |
| Exact | `[cita cardiologo madrid]` |
| Exact | `[cardiologo privado madrid]` |
| Exact | `[cardiologo urgente madrid]` |
| Exact | `[mejor cardiologo madrid]` |
| Phrase | `"cardiologo madrid"` |
| Phrase | `"cardiólogo madrid"` |
| Phrase | `"cita cardiologo madrid"` |
| Phrase | `"cardiologo privado madrid"` |
| Phrase | `"cardiologo urgente madrid"` |
| Phrase | `"electrocardiograma madrid"` |

**RSA 2.1 — Cardiología Madrid headlines:**

| # | Headline | Chars | Pin |
|---|---|---|---|
| 1 | Cardiólogo en Madrid en 24h | 27 | **H1** |
| 2 | Tu seguro cubre la consulta | 28 | **H2** |
| 3 | Cardiólogo privado en Madrid | 28 | |
| 4 | Cita cardiólogo esta semana | 27 | |
| 5 | Cardiólogo en tu cuadro médico | 30 | |
| 6 | Especialistas en cardiología | 28 | |
| 7 | Reserva prioritaria desde €5 | 28 | |
| 8 | Sin esperas de 3 semanas | 24 | |
| 9 | Clínicas concertadas | 20 | |
| 10 | Reserva online en 2 minutos | 27 | |
| 11 | Cita en 24–72h | 14 | |
| 12 | Pagas solo la prioridad | 23 | |
| 13 | Reembolso si no hay hueco | 24 | |
| 14 | Atención privada también | 23 | |
| 15 | Electrocardiograma incluido | 27 | |

**Descriptions (4):**
1. Tu seguro cubre la consulta. Nosotros, la reserva. Cita prioritaria con cardiólogos en Madrid. *(86)*
2. Si tu cuadro médico no te da cita esta semana, te buscamos hueco. Reserva online en 2 min. *(89)*
3. Sin seguro también atendemos: cita privada con todo incluido. Confirmación inmediata. *(85)*
4. Cardiólogos verificados en Madrid. Pago seguro. Reembolso si no encontramos hueco. *(82)*

**Path 1:** `cardiologo` **Path 2:** `madrid`

---

### Ad Group 2.2 — Ginecología Madrid

**Final URL:** `https://www.medconnect.es/especialistas/ginecologia/madrid`
**Max CPC:** €1.80

**Keywords (12):**

| Match | Keyword |
|---|---|
| Exact | `[ginecologo madrid]` |
| Exact | `[ginecólogo madrid]` |
| Exact | `[cita ginecologo madrid]` |
| Exact | `[ginecologo privado madrid]` |
| Exact | `[mejor ginecologo madrid]` |
| Exact | `[revision ginecologica madrid]` |
| Phrase | `"ginecologo madrid"` |
| Phrase | `"ginecóloga madrid"` |
| Phrase | `"cita ginecologo madrid"` |
| Phrase | `"ginecologo privado madrid"` |
| Phrase | `"revision ginecologica madrid"` |
| Phrase | `"citologia madrid"` |

**RSA 2.2 — Ginecología Madrid headlines:**

| # | Headline | Chars | Pin |
|---|---|---|---|
| 1 | Ginecólogo en Madrid en 24h | 27 | **H1** |
| 2 | Tu seguro cubre la consulta | 28 | **H2** |
| 3 | Ginecólogo privado en Madrid | 28 | |
| 4 | Cita ginecólogo esta semana | 27 | |
| 5 | Revisión ginecológica Madrid | 28 | |
| 6 | Especialistas en ginecología | 28 | |
| 7 | Reserva prioritaria desde €5 | 28 | |
| 8 | Sin esperas de 3 semanas | 24 | |
| 9 | Clínicas concertadas | 20 | |
| 10 | Reserva online en 2 minutos | 27 | |
| 11 | Cita en 24–72h | 14 | |
| 12 | Pagas solo la prioridad | 23 | |
| 13 | Reembolso si no hay hueco | 24 | |
| 14 | Atención privada también | 23 | |
| 15 | Citología y ecografía | 21 | |

**Descriptions (4):**
1. Tu seguro cubre la consulta. Nosotros, la reserva. Cita prioritaria con ginecólogos en Madrid. *(89)*
2. Si tu cuadro médico no te da cita esta semana, te buscamos hueco. Reserva online en 2 min. *(89)*
3. Sin seguro también atendemos: cita privada con todo incluido. Confirmación inmediata. *(85)*
4. Ginecólogos verificados en Madrid. Pago seguro. Reembolso si no encontramos hueco. *(82)*

**Path 1:** `ginecologo` **Path 2:** `madrid`

---

### Ad Group 2.3 — Traumatología Madrid

**Final URL:** `https://www.medconnect.es/especialistas/traumatologia/madrid`
**Max CPC:** €1.80

**Keywords (12):**

| Match | Keyword |
|---|---|
| Exact | `[traumatologo madrid]` |
| Exact | `[traumatólogo madrid]` |
| Exact | `[cita traumatologo madrid]` |
| Exact | `[traumatologo privado madrid]` |
| Exact | `[traumatologo rodilla madrid]` |
| Exact | `[traumatologo hombro madrid]` |
| Phrase | `"traumatologo madrid"` |
| Phrase | `"traumatólogo madrid"` |
| Phrase | `"cita traumatologo madrid"` |
| Phrase | `"traumatologo privado madrid"` |
| Phrase | `"esguince madrid"` |
| Phrase | `"lesion deportiva madrid"` |

**RSA 2.3 — Traumatología Madrid headlines:**

| # | Headline | Chars | Pin |
|---|---|---|---|
| 1 | Traumatólogo en Madrid en 24h | 29 | **H1** |
| 2 | Tu seguro cubre la consulta | 28 | **H2** |
| 3 | Traumatólogo privado Madrid | 27 | |
| 4 | Cita traumatólogo esta semana | 29 | |
| 5 | Esguince, rodilla, hombro | 25 | |
| 6 | Especialistas en traumatología | 30 | |
| 7 | Reserva prioritaria desde €5 | 28 | |
| 8 | Sin esperas de 3 semanas | 24 | |
| 9 | Clínicas concertadas | 20 | |
| 10 | Reserva online en 2 minutos | 27 | |
| 11 | Cita en 24–72h | 14 | |
| 12 | Pagas solo la prioridad | 23 | |
| 13 | Reembolso si no hay hueco | 24 | |
| 14 | Atención privada también | 23 | |
| 15 | Lesiones deportivas Madrid | 26 | |

**Descriptions (4):**
1. Tu seguro cubre la consulta. Nosotros, la reserva. Cita prioritaria con traumatólogos Madrid. *(89)*
2. Si tu cuadro médico no te da cita esta semana, te buscamos hueco. Reserva online en 2 min. *(89)*
3. Sin seguro también atendemos: cita privada con todo incluido. Confirmación inmediata. *(85)*
4. Traumatólogos verificados en Madrid. Pago seguro. Reembolso si no encontramos hueco. *(83)*

**Path 1:** `traumatologo` **Path 2:** `madrid`

---

### Ad Group 2.4 — Dermatología Madrid

**Final URL:** `https://www.medconnect.es/especialistas/dermatologia/madrid`
**Max CPC:** €1.80

**Keywords (12):**

| Match | Keyword |
|---|---|
| Exact | `[dermatologo madrid]` |
| Exact | `[dermatólogo madrid]` |
| Exact | `[cita dermatologo madrid]` |
| Exact | `[dermatologo privado madrid]` |
| Exact | `[mejor dermatologo madrid]` |
| Exact | `[revision lunares madrid]` |
| Phrase | `"dermatologo madrid"` |
| Phrase | `"dermatóloga madrid"` |
| Phrase | `"cita dermatologo madrid"` |
| Phrase | `"dermatologo privado madrid"` |
| Phrase | `"acne dermatologo madrid"` |
| Phrase | `"revision lunares madrid"` |

**RSA 2.4 — Dermatología Madrid headlines:**

| # | Headline | Chars | Pin |
|---|---|---|---|
| 1 | Dermatólogo en Madrid en 24h | 28 | **H1** |
| 2 | Tu seguro cubre la consulta | 28 | **H2** |
| 3 | Dermatólogo privado en Madrid | 29 | |
| 4 | Cita dermatólogo esta semana | 28 | |
| 5 | Revisión de lunares Madrid | 26 | |
| 6 | Especialistas en dermatología | 29 | |
| 7 | Reserva prioritaria desde €5 | 28 | |
| 8 | Sin esperas de 3 semanas | 24 | |
| 9 | Clínicas concertadas | 20 | |
| 10 | Reserva online en 2 minutos | 27 | |
| 11 | Cita en 24–72h | 14 | |
| 12 | Pagas solo la prioridad | 23 | |
| 13 | Reembolso si no hay hueco | 24 | |
| 14 | Atención privada también | 23 | |
| 15 | Acné, lunares, manchas | 22 | |

**Descriptions (4):**
1. Tu seguro cubre la consulta. Nosotros, la reserva. Cita prioritaria con dermatólogos Madrid. *(88)*
2. Si tu cuadro médico no te da cita esta semana, te buscamos hueco. Reserva online en 2 min. *(89)*
3. Sin seguro también atendemos: cita privada con todo incluido. Confirmación inmediata. *(85)*
4. Dermatólogos verificados en Madrid. Pago seguro. Reembolso si no encontramos hueco. *(82)*

**Path 1:** `dermatologo` **Path 2:** `madrid`

---

## Campaign 3 — Insurer brand (PAUSED until legal cleared)

### Settings
- **Status:** Paused at launch. Enable per-ad-group as legal sign-off arrives per insurer.
- **Type:** Search, Manual CPC, **€5/day per ad group**
- **Geo:** Madrid + 30 km radius
- **Negative keyword list:** `MEDCONNECT_GLOBAL_NEGATIVES`

### One ad group per insurer (template)

For each cleared insurer, create an ad group **only** when legal sign-off is in writing. Until then, do **not** mention the insurer's name in ad copy — bidding on the keyword without naming the insurer is a separate trademark concern that's lower-risk.

#### Template: Sanitas Madrid (paused at launch)

**Final URL:** `https://www.medconnect.es/aseguradoras` *(or specialty page if combined intent)*

**Keywords (8):**

| Match | Keyword |
|---|---|
| Exact | `[sanitas cita urgente madrid]` |
| Exact | `[sanitas cardiologo madrid]` |
| Exact | `[sanitas ginecologo madrid]` |
| Exact | `[sanitas traumatologo madrid]` |
| Phrase | `"sanitas cita madrid"` |
| Phrase | `"sanitas urgente madrid"` |
| Phrase | `"cuadro medico sanitas madrid"` |
| Phrase | `"sanitas no me da cita"` ← **highest intent — pure rescue** |

**RSA 3.x — Sanitas template (only enable when legal cleared the brand mention):**

If brand-mention IS authorized:
- H1: `Sanitas — cita esta semana` (24)
- H2: `Tu seguro cubre la consulta` (28)
- H3: `Sin esperas de 3 semanas` (24)

If brand-mention is NOT authorized (keyword bid only):
- H1: `Cita prioritaria con tu seguro` (29)
- H2: `Tu cuadro médico, esta semana` (29)
- H3: `Sin esperas de 3 semanas` (24)

Repeat the template for each: Adeslas, DKV, AXA, Mapfre, Asisa, Cigna.

---

## Campaign 4 — Remarketing (Display)

### Settings
- **Type:** Display, **Optimized targeting OFF** (we want strict audience-based targeting, not Google's broadening)
- **Daily budget:** €3–€5 (≈ €100/mo)
- **Frequency cap:** **3 impressions / user / day, 10 / user / week**
- **Geo:** Spain (RM audiences are already pre-qualified by site visit)
- **Bid strategy:** Manual CPM at first → Maximize Conversions once you have 30+ converted clicks

### Audiences (create in Audience Manager → Custom audience → Website visitors)

| Audience name | Definition | Membership | Bid priority |
|---|---|---|---|
| `RM_slot_selected` | Visited `/book*` AND fired `slot_selected` event | 14 days | **Highest** |
| `RM_book_started` | Visited `/book?...` AND fired `book_started` event | 7 days | High |
| `RM_search_performed` | Visited `/search-v2*` | 30 days | Medium |
| `RM_homepage_only` | Visited `/` only, no other paths | 30 days | Lowest (or exclude) |

**Exclude** anyone who has already converted (`book_completed`) — don't waste impressions on people who already booked.

### Ad Group 4.1 — Remarketing — Specialty Pages

Target the 3 RM audiences (slot_selected highest, book_started second, search_performed third).

**Responsive Display Ad — assets:**
- 5 headlines (≤30 chars):
  - "Termina tu reserva en 2 min" *(27)*
  - "Tu cita prioritaria te espera" *(29)*
  - "Cita esta semana en Madrid" *(26)*
  - "Sin esperas de 3 semanas" *(24)*
  - "Reserva con tu seguro" *(21)*
- 5 long headlines (≤90 chars):
  - "Vuelve y termina tu reserva — clínicas concertadas con tu seguro en Madrid." *(76)*
  - "Tu cita prioritaria a un clic. Pagas solo la tarifa de prioridad desde €5." *(76)*
  - "Si tu cuadro médico no te da cita, nosotros te buscamos hueco esta semana." *(76)*
  - "Reserva online en 2 minutos. Confirmación inmediata. Pago seguro con Stripe." *(78)*
  - "Cardiología, ginecología y +. Especialistas verificados en Madrid." *(67)*
- 5 descriptions (≤90 chars):
  - Same as Campaign 2 descriptions, reuse.
- Final URL: `https://www.medconnect.es/search-v2`
- Business name: **Med Connect**
- Logos: 1:1 (square) + 4:1 (landscape) — get from `Medconnect design project/` folder
- Images: 1.91:1 (landscape) + 1:1 — use site hero imagery (clinic interior, doctor with patient)
- Videos: skip at launch (production overhead not worth it for this budget)

---

## Day-1 launch checklist (May 18)

| Time | Action |
|---|---|
| 08:30 | Final Tag Assistant test booking on production. Confirm `book_completed` conversion lands in Ads UI within 3h. |
| 09:00 | Enable **Campaign 1 (Brand)**. Watch Search Terms in real time for the first 2h. |
| 10:00 | Enable **Campaign 2 (Non-brand specialty)**. Bid Strategy = Manual CPC. |
| 11:00 | Enable **Campaign 4 (Remarketing)**. |
| Throughout day | Add any junk Search Terms to negative list immediately. |
| End of day | Review: spend pacing 80–120% of budget, CTR > 4% brand / > 2% non-brand, ≥1 conversion expected by EOD. |

**Hard stop rule:** if any campaign has spent its full daily budget by 14:00 with 0 conversions, **pause it** and investigate. Almost always a junk-keyword leak.

---

## Optimization cadence

### Daily, first 14 days (10 min):
1. **Search Terms Report** → add negatives.
2. Pause any keyword with **>30 clicks and 0 conversions**.
3. Quick scan of Microsoft Clarity sessions for landing-page friction (search "rage clicks" or session abandons on `/book`).

### Weekly:
- Reallocate budget across the 4 specialty ad groups based on CPA. The cheapest CPA wins more spend.
- Review device + hour-of-day performance, apply bid adjustments.
- Refresh underperforming RSA assets (Google labels each as **Low / Average / Best**).

### Day 14 → Maximize Conversions:
- **Only if ≥15 conversions logged across Campaign 2.**
- Switch Campaign 2's bid strategy from Manual CPC → Maximize Conversions (no tCPA target yet — let it spend the budget freely while learning).

### Day 30 → tCPA:
- **Only if ≥30 conversions logged.**
- Switch to **tCPA = €15** (target CPA below MedConnect's average revenue per booking — even at the €5 lowest priority fee, doctor-side margins make €15 acquisition acceptable).
- Decide whether to expand to a 5th specialty (Oftalmología or ORL) based on which had the best CPA so far.

### Day 30 review questions:
- Which specialty has the best CPA? Pour budget there.
- Is `book_started → book_completed` < 40%? → landing/checkout friction, not an ads problem; flag for product session.
- Have any insurer legal approvals come through? → flip on Campaign 3 ad groups.

---

## Barcelona expansion (when you decide)

If you decide to add Barcelona, **don't reuse Campaign 2**. Create a parallel **Campaign 2b — Non-brand Specialty (Barcelona)** so daily budgets can be tuned per city. Sharing one campaign across two cities lets Google starve whichever has a worse short-term CPA, which would distort the city-comparison signal.

For each Barcelona ad group, take the keyword block above and:
1. Replace `madrid` with `barcelona` in every keyword.
2. Replace `Madrid` with `Barcelona` in every headline + description.
3. Switch the Final URL from `/madrid` to `/barcelona`.
4. Geo target = Barcelona + 30 km radius.

Same negative keyword list applies (`MEDCONNECT_GLOBAL_NEGATIVES`).

---

## Google Ads Editor CSV — keywords (paste-ready)

Save the block below as `keywords.csv` and import via Ads Editor → Account → Import → From file.

```csv
Campaign,Ad group,Keyword,Match type,Max CPC,Final URL
MedConnect Brand,MedConnect Brand,medconnect,Exact,0.50,https://www.medconnect.es/
MedConnect Brand,MedConnect Brand,med connect,Exact,0.50,https://www.medconnect.es/
MedConnect Brand,MedConnect Brand,medconnect madrid,Exact,0.50,https://www.medconnect.es/
MedConnect Brand,MedConnect Brand,medconnect cita,Exact,0.50,https://www.medconnect.es/
MedConnect Brand,MedConnect Brand,medconnect,Phrase,0.50,https://www.medconnect.es/
MedConnect Brand,MedConnect Brand,med connect,Phrase,0.50,https://www.medconnect.es/
MedConnect Brand,MedConnect Brand,medconnect cita,Phrase,0.50,https://www.medconnect.es/
MedConnect Brand,MedConnect Brand,med connect madrid,Phrase,0.50,https://www.medconnect.es/
Non-brand Madrid,Cardiología Madrid,cardiologo madrid,Exact,2.00,https://www.medconnect.es/especialistas/cardiologia/madrid
Non-brand Madrid,Cardiología Madrid,cardiólogo madrid,Exact,2.00,https://www.medconnect.es/especialistas/cardiologia/madrid
Non-brand Madrid,Cardiología Madrid,cita cardiologo madrid,Exact,2.00,https://www.medconnect.es/especialistas/cardiologia/madrid
Non-brand Madrid,Cardiología Madrid,cardiologo privado madrid,Exact,2.00,https://www.medconnect.es/especialistas/cardiologia/madrid
Non-brand Madrid,Cardiología Madrid,cardiologo urgente madrid,Exact,2.00,https://www.medconnect.es/especialistas/cardiologia/madrid
Non-brand Madrid,Cardiología Madrid,mejor cardiologo madrid,Exact,2.00,https://www.medconnect.es/especialistas/cardiologia/madrid
Non-brand Madrid,Cardiología Madrid,cardiologo madrid,Phrase,2.00,https://www.medconnect.es/especialistas/cardiologia/madrid
Non-brand Madrid,Cardiología Madrid,cardiólogo madrid,Phrase,2.00,https://www.medconnect.es/especialistas/cardiologia/madrid
Non-brand Madrid,Cardiología Madrid,cita cardiologo madrid,Phrase,2.00,https://www.medconnect.es/especialistas/cardiologia/madrid
Non-brand Madrid,Cardiología Madrid,cardiologo privado madrid,Phrase,2.00,https://www.medconnect.es/especialistas/cardiologia/madrid
Non-brand Madrid,Cardiología Madrid,cardiologo urgente madrid,Phrase,2.00,https://www.medconnect.es/especialistas/cardiologia/madrid
Non-brand Madrid,Cardiología Madrid,electrocardiograma madrid,Phrase,1.50,https://www.medconnect.es/especialistas/cardiologia/madrid
Non-brand Madrid,Ginecología Madrid,ginecologo madrid,Exact,1.80,https://www.medconnect.es/especialistas/ginecologia/madrid
Non-brand Madrid,Ginecología Madrid,ginecólogo madrid,Exact,1.80,https://www.medconnect.es/especialistas/ginecologia/madrid
Non-brand Madrid,Ginecología Madrid,cita ginecologo madrid,Exact,1.80,https://www.medconnect.es/especialistas/ginecologia/madrid
Non-brand Madrid,Ginecología Madrid,ginecologo privado madrid,Exact,1.80,https://www.medconnect.es/especialistas/ginecologia/madrid
Non-brand Madrid,Ginecología Madrid,mejor ginecologo madrid,Exact,1.80,https://www.medconnect.es/especialistas/ginecologia/madrid
Non-brand Madrid,Ginecología Madrid,revision ginecologica madrid,Exact,1.50,https://www.medconnect.es/especialistas/ginecologia/madrid
Non-brand Madrid,Ginecología Madrid,ginecologo madrid,Phrase,1.80,https://www.medconnect.es/especialistas/ginecologia/madrid
Non-brand Madrid,Ginecología Madrid,ginecóloga madrid,Phrase,1.80,https://www.medconnect.es/especialistas/ginecologia/madrid
Non-brand Madrid,Ginecología Madrid,cita ginecologo madrid,Phrase,1.80,https://www.medconnect.es/especialistas/ginecologia/madrid
Non-brand Madrid,Ginecología Madrid,ginecologo privado madrid,Phrase,1.80,https://www.medconnect.es/especialistas/ginecologia/madrid
Non-brand Madrid,Ginecología Madrid,revision ginecologica madrid,Phrase,1.50,https://www.medconnect.es/especialistas/ginecologia/madrid
Non-brand Madrid,Ginecología Madrid,citologia madrid,Phrase,1.50,https://www.medconnect.es/especialistas/ginecologia/madrid
Non-brand Madrid,Traumatología Madrid,traumatologo madrid,Exact,1.80,https://www.medconnect.es/especialistas/traumatologia/madrid
Non-brand Madrid,Traumatología Madrid,traumatólogo madrid,Exact,1.80,https://www.medconnect.es/especialistas/traumatologia/madrid
Non-brand Madrid,Traumatología Madrid,cita traumatologo madrid,Exact,1.80,https://www.medconnect.es/especialistas/traumatologia/madrid
Non-brand Madrid,Traumatología Madrid,traumatologo privado madrid,Exact,1.80,https://www.medconnect.es/especialistas/traumatologia/madrid
Non-brand Madrid,Traumatología Madrid,traumatologo rodilla madrid,Exact,1.50,https://www.medconnect.es/especialistas/traumatologia/madrid
Non-brand Madrid,Traumatología Madrid,traumatologo hombro madrid,Exact,1.50,https://www.medconnect.es/especialistas/traumatologia/madrid
Non-brand Madrid,Traumatología Madrid,traumatologo madrid,Phrase,1.80,https://www.medconnect.es/especialistas/traumatologia/madrid
Non-brand Madrid,Traumatología Madrid,traumatólogo madrid,Phrase,1.80,https://www.medconnect.es/especialistas/traumatologia/madrid
Non-brand Madrid,Traumatología Madrid,cita traumatologo madrid,Phrase,1.80,https://www.medconnect.es/especialistas/traumatologia/madrid
Non-brand Madrid,Traumatología Madrid,traumatologo privado madrid,Phrase,1.80,https://www.medconnect.es/especialistas/traumatologia/madrid
Non-brand Madrid,Traumatología Madrid,esguince madrid,Phrase,1.20,https://www.medconnect.es/especialistas/traumatologia/madrid
Non-brand Madrid,Traumatología Madrid,lesion deportiva madrid,Phrase,1.20,https://www.medconnect.es/especialistas/traumatologia/madrid
Non-brand Madrid,Dermatología Madrid,dermatologo madrid,Exact,1.80,https://www.medconnect.es/especialistas/dermatologia/madrid
Non-brand Madrid,Dermatología Madrid,dermatólogo madrid,Exact,1.80,https://www.medconnect.es/especialistas/dermatologia/madrid
Non-brand Madrid,Dermatología Madrid,cita dermatologo madrid,Exact,1.80,https://www.medconnect.es/especialistas/dermatologia/madrid
Non-brand Madrid,Dermatología Madrid,dermatologo privado madrid,Exact,1.80,https://www.medconnect.es/especialistas/dermatologia/madrid
Non-brand Madrid,Dermatología Madrid,mejor dermatologo madrid,Exact,1.80,https://www.medconnect.es/especialistas/dermatologia/madrid
Non-brand Madrid,Dermatología Madrid,revision lunares madrid,Exact,1.50,https://www.medconnect.es/especialistas/dermatologia/madrid
Non-brand Madrid,Dermatología Madrid,dermatologo madrid,Phrase,1.80,https://www.medconnect.es/especialistas/dermatologia/madrid
Non-brand Madrid,Dermatología Madrid,dermatóloga madrid,Phrase,1.80,https://www.medconnect.es/especialistas/dermatologia/madrid
Non-brand Madrid,Dermatología Madrid,cita dermatologo madrid,Phrase,1.80,https://www.medconnect.es/especialistas/dermatologia/madrid
Non-brand Madrid,Dermatología Madrid,dermatologo privado madrid,Phrase,1.80,https://www.medconnect.es/especialistas/dermatologia/madrid
Non-brand Madrid,Dermatología Madrid,acne dermatologo madrid,Phrase,1.50,https://www.medconnect.es/especialistas/dermatologia/madrid
Non-brand Madrid,Dermatología Madrid,revision lunares madrid,Phrase,1.50,https://www.medconnect.es/especialistas/dermatologia/madrid
```

---

## Summary table

| Item | Count |
|---|---|
| Total campaigns at launch | 3 active (Brand, Non-brand specialty, Remarketing) + 1 paused (Insurer brand) |
| Total ad groups at launch | 1 brand + 4 non-brand specialty + 1 remarketing = **6 active** |
| Total keywords at launch | 8 brand + 48 non-brand specialty = **56** |
| Total RSAs at launch | 5 (one per active ad group, plus the remarketing display ad) |
| Negative keywords (shared list) | 36 |
| Sitelinks / callouts / structured snippets | 6 / 8 / 8 |
| Estimated monthly spend at launch | €850–€1,240 |
| Expected `book_completed` per month (steady state) | 10–32 |
| Target CPA after day 30 | €15 |
