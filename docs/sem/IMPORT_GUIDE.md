# Google Ads Editor — Bulk Import Guide

This bundle pre-loads **everything that can be CSV-imported** into your Google Ads account, with all entities created in **Paused** state. Total time to load: ~10 minutes. After import, all 4 campaigns + 6 ad groups + 60 keywords + 5 RSAs + 47 negative keywords + 6 sitelinks + 8 callouts + 1 structured snippet are sitting in your account, paused, waiting for May 18.

---

## Files in this bundle

| # | File | What it contains | Rows |
|---|---|---|---|
| 01 | `01-campaigns.csv` | 4 campaigns (Brand, Non-brand Madrid, Insurer Brand, Remarketing Display) | 4 |
| 02 | `02-ad-groups.csv` | 7 ad groups (1 Brand, 4 specialty, 1 Sanitas template, 1 Remarketing skeleton) | 7 |
| 03 | `03-keywords.csv` | All keywords with match types + per-keyword Max CPC | 60 |
| 04 | `04-responsive-search-ads.csv` | 5 RSAs with 15 headlines + 4 descriptions + pinning | 5 |
| 05 | `05-negative-keywords.csv` | Campaign-scoped negatives (Non-brand: 36, Insurer: 8, Brand: 5) | 47 |
| 06 | `06-sitelinks.csv` | 6 sitelinks (Cardiología, Ginecología, Traumatología, Sin seguro, Cómo funciona, Aseguradoras) | 6 |
| 07 | `07-callouts.csv` | 8 callouts | 8 |
| 08 | `08-structured-snippets.csv` | 1 Servicios snippet with 8 specialty values | 1 |

---

## Prerequisites

1. **Install Google Ads Editor** (free desktop app from Google) — <https://ads.google.com/home/tools/ads-editor/>
2. **Sign in to Ads Editor** with the same Google account that owns your Med Connect Ads CID `793-975-6760`.
3. **Download account** — File → Open → choose your Med Connect account → "Get recent changes" / full download. Takes 1–2 min.

---

## Import sequence (do in this order — order matters!)

Google Ads Editor enforces parent-child relationships, so campaigns must exist before ad groups, ad groups before keywords/ads, and so on.

### Step 1 — Import campaigns (`01-campaigns.csv`)

1. In Ads Editor, click **Account** → **Import** → **From file**.
2. Choose `docs/sem/01-campaigns.csv`.
3. Map columns when prompted (Ads Editor auto-detects most). Confirm:
   - "Campaign" → Campaign
   - "Status" → Status
   - "Budget" → Daily budget
   - "Bid Strategy Type" → Bid strategy
4. Click **Process file**. You should see "4 campaigns added" with status Paused.
5. **Verify in the left tree:** all 4 campaigns visible at the top level, paused (grey play icon).

### Step 2 — Import ad groups (`02-ad-groups.csv`)

1. **Account** → **Import** → **From file** → `docs/sem/02-ad-groups.csv`.
2. Click **Process file**. "7 ad groups added".
3. **Verify:** expand each campaign in the tree — ad groups appear underneath, all Paused.

### Step 3 — Import keywords (`03-keywords.csv`)

1. **Account** → **Import** → **From file** → `docs/sem/03-keywords.csv`.
2. Click **Process file**. "60 keywords added".
3. **Verify:** click any ad group → Keywords tab → 12+ keywords visible per non-brand specialty group, 8 in Brand, 4 in Sanitas template.

### Step 4 — Import responsive search ads (`04-responsive-search-ads.csv`)

1. **Account** → **Import** → **From file** → `docs/sem/04-responsive-search-ads.csv`.
2. Click **Process file**. "5 RSAs added".
3. **Verify pinning carried through:** click any RSA → in the Headline list, Headlines 1 and 2 should show a pin icon next to them with "Position 1" and "Position 2" respectively. Headlines 3–15 unpinned.

### Step 5 — Import negative keywords (`05-negative-keywords.csv`)

1. **Account** → **Import** → **From file** → `docs/sem/05-negative-keywords.csv`.
2. Click **Process file**. "47 negative keywords added".
3. **Verify:** click any non-brand campaign → Negative keywords tab (campaign-level) → 36 entries.

### Step 6 — Import sitelinks (`06-sitelinks.csv`)

Sitelinks in Ads Editor live under **Ads & extensions → Extensions** at the account level by default, then get attached to campaigns.

1. In the tree, navigate to **Account → Ads & extensions → Extensions**.
2. Click **+ Add extension → Sitelink → Multiple changes** → Paste from `06-sitelinks.csv` (open it in a text editor, copy all rows).
3. Confirm 6 sitelinks created.
4. **Attach to campaigns:** select all 4 campaigns in the tree → right pane → Sitelinks → tick all 6 → Save. (Sitelinks are shared at account level by default but you may need to confirm campaign-level attachment.)

### Step 7 — Import callouts (`07-callouts.csv`)

Same as sitelinks: **Ads & extensions → Extensions → + Add extension → Callout → Multiple changes** → paste from `07-callouts.csv`. Attach to all 4 campaigns.

### Step 8 — Import structured snippets (`08-structured-snippets.csv`)

**Ads & extensions → Extensions → + Add extension → Structured snippet → Multiple changes** → paste from `08-structured-snippets.csv`. Header value is `Servicios`, with 8 specialty values. Attach to all 4 campaigns.

### Step 9 — Post changes to Google Ads

Right now everything is local in Ads Editor. To upload:

1. Click **Post** (top-right green button).
2. Review the change preview — should say something like "4 campaigns, 7 ad groups, 60 keywords, 5 ads, 47 negatives, 15 extensions added".
3. Click **Post** in the confirmation dialog.
4. Wait 60–90 seconds. Ads Editor will show "Posted successfully".

### Step 10 — Verify in the Google Ads web UI

1. Open <https://ads.google.com> → your Med Connect account.
2. Top-left **Campaigns** dropdown → confirm all 4 are listed and **Paused**.
3. Drill into **Non-brand Madrid → Cardiología Madrid → Ads** → confirm the RSA is there and Paused.
4. **Diagnostics tab** on each campaign → should be green/clean (no policy issues if the gtag tracking is working).

---

## What's NOT in this bundle (manual steps required)

These can't be CSV-imported — Ads Editor doesn't support them:

### A. Geo targeting for Madrid (5-min UI fix per campaign)

The CSV sets `Locations: "Madrid, Spain"` but Ads Editor's location import is finicky and may default to "Spain (all)". After Step 9, in the web UI:

1. Click **Non-brand Madrid** campaign → **Settings → Locations**.
2. Remove "Spain" if it's there.
3. Add "Madrid, Comunidad de Madrid, España" → click **Add**.
4. Targeting type: **Presence: People in or regularly in your targeted locations** (NOT "Interest in").
5. Optionally add a 30 km radius around Madrid centre for broader catchment.
6. Save.

Repeat for **Insurer Brand (LEGAL GATE)** campaign. (Brand campaign can stay at Spain-wide; Remarketing is fine at Spain-wide too.)

### B. Conversion goals attached to campaigns

The **"Booking Completed"** conversion (the one we set up Phase 0.A) needs to be attached as the optimization goal:

1. Web UI → each campaign → **Settings → Conversion goals**.
2. Choose "Use this account's default goal" OR explicitly select "Booking Completed".
3. For non-brand: also attach `slot_selected` and `book_started` as **secondary** goals (after you do the GA4 → Ads import per the Phase A walkthrough).

### C. Audience signals for Remarketing campaign (Campaign 4)

Audiences (`RM_slot_selected`, `RM_book_started`, etc.) must be created in **Audience Manager → Custom audience → Website visitors** before the Remarketing campaign can serve. They also need GA4 to have been firing for 30 days to populate. The Remarketing campaign will sit Paused with the ad group skeleton until you:

1. Create the 4 audiences in Audience Manager.
2. Edit the **Remarketing Specialty Pages** ad group → Audiences → Add the 3 active RM audiences (exclude `RM_homepage_only` and converters).
3. Create one or more **Responsive Display Ads** with image assets (Remarketing ads need 1:1 logo, 4:1 landscape logo, 1.91:1 hero, square hero — minimum 4 images). This is a separate creative-production task.

### D. Bid strategy switch on Day 14 / Day 30

CSV sets all campaigns to **Manual CPC** for the launch period. Per the SEM plan, on Day 14 (≥15 conversions) switch the **Non-brand Madrid** campaign to **Maximize Conversions**, and on Day 30 (≥30 conversions) switch to **tCPA €15**. These bid strategy switches are easier in the web UI than via Ads Editor.

### E. Account-level shared budget (optional)

If you want a single daily-budget cap across all 4 campaigns (so total spend never exceeds €X/day no matter which campaign converts), create a **Shared budget** in Tools → Shared library → Budgets → +. Name it `MedConnect Launch` and set €40/day. Attach to all 4 campaigns.

---

## Sanity-check after import

Before May 18, walk through this checklist (5 min):

- [ ] All 4 campaigns visible in web UI, Paused
- [ ] Non-brand Madrid campaign location = Madrid (not Spain-wide)
- [ ] Each non-brand ad group has 12 keywords (8 phrase + exact for Cardio with electrocardiograma extra; check totals match `03-keywords.csv`)
- [ ] Each RSA has 15 headlines, 4 descriptions, pinning on H1+H2, Path 1 + Path 2 set
- [ ] 36 negatives applied at the Non-brand Madrid campaign level
- [ ] All 6 sitelinks visible under Ads & extensions, attached to campaigns
- [ ] Conversion goal **Booking Completed** attached to non-brand + brand campaigns
- [ ] Healthcare-related campaigns show no policy disapprovals (only the standard "Health in personalized advertising" limitation, which is normal — see the SEM plan FAQ)

---

## On May 18 launch day

Open the web UI and unpause in this order (matches the launch playbook in `docs/SEM_LAUNCH_MADRID.md`):

| Time (CET) | Action |
|---|---|
| 09:00 | Unpause **MedConnect Brand** |
| 10:00 | Unpause **Non-brand Madrid** |
| 11:00 | Unpause **Remarketing Display** (only if audiences and creative are ready) |
| (Whenever legal clears) | Unpause **Insurer Brand (LEGAL GATE)** ad group(s) per cleared insurer |

**Do not unpause Insurer Brand without legal sign-off** — the campaign is in the bundle so the keyword research and ad copy are pre-loaded, but trademark policy applies once it's serving.

---

## Rollback

If something goes wrong post-import and you want to revert: the Ads Editor session that performed the import has a **History** entry. **File → Revisions → Revert to last** undoes the entire batch of changes. You can also delete individual entities in the web UI.

If you've already posted but haven't unpaused: just delete the campaigns one by one in the web UI (since they're Paused, no ad has served, no harm done).

---

## Manual fallback (if Ads Editor import fails)

Some Ads Editor installations have bugs with the multi-CSV import flow. Fallback paths in priority order:

1. **Single-row paste:** open each CSV in a text editor, copy contents, in Ads Editor click the equivalent entity tab, paste into the bulk-paste dialog.
2. **Web UI bulk upload:** Tools → Bulk actions → Bulk uploads → Upload — accepts a similar CSV format. Slower but more forgiving.
3. **Manual recreation:** worst case, the CSVs serve as the spec and you create entities by hand in the web UI. The whole bundle is < 90 entities total — about 90 minutes of manual work.

---

## When something goes wrong

| Symptom | Likely cause | Fix |
|---|---|---|
| RSA shows "Insufficient ad strength: poor" | Pinning is too aggressive | Unpin H2; keep only H1 pinned |
| Keyword shows "Below first page bid" | Max CPC too low for the term | Raise that keyword's Max CPC by 25% |
| Campaign won't post: "Campaign requires a conversion goal" | No conversion attached | UI → Settings → Conversion goals → attach Booking Completed |
| "Geo targeting too broad" warning | Location set to Spain | Override to Madrid + 30 km in the UI |
| "Ad group has no ads" error | RSA didn't import to that ad group | Manually create one RSA in the UI from the headlines in `04-responsive-search-ads.csv` |
| Negative keyword "(?)" warning | Special chars in keyword | Strip accents (`reclamación` → `reclamacion`) — Google Ads matches both |
