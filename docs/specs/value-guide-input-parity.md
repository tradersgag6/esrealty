# Value Guide — Input Parity with the reference

Date: 2026-10-07
Status: **verified from the rendered reference**

Source: the live LandValuePH valuation form at `https://www.landvalueph.com/`,
driven in a real browser (Chrome 154). Every row below was read off the rendered
DOM, not inferred from the purchased PDF. The PDF is an output artifact; it does not
list the form.

This is the artifact `docs/plans/2026-10-07-upgraded-value-guide.md` Task 2 requires.

## Correction this file replaces

The earlier design assumed a merged nine-question set, with `topography` and `grade`
combined into one "Terrain" question. The reference does not do that. It has
**eight** distinct adjustment questions, and it splits terrain into two questions —
one about the ground's slope, one about its elevation relative to the road. Merging
them loses information the reference prices separately.

## Shape of the reference

Three steps: Location -> Details -> Report. Details is described as
"9 quick questions" and groups them into eight titled accordions. Two accordions are
open by default; the rest are collapsed, so a user sees a short form they can expand.

---

## Step 1 — Location

Field order as rendered.

| # | Field | Control | Choices | Required | Default | Notes |
|---|---|---|---|---|---|---|
| 1 | What do you need this valuation for? | 6 buttons | Selling, Buying, I received an offer, Estate, Loan, Other | **Yes** | none | Blocks progress. CTA reads "Pick what it's for to continue" until chosen. |
| 1a | Purpose follow-up | 4 buttons, appears after purpose | I'm just checking my property's value, I'm getting ready to sell, My property is already listed, I already have a buyer | Conditional | none | **Only appears under Selling.** Not shown for the other five purposes. |
| 2 | Property type | 2 buttons | Vacant Lot (land only), House & Lot (land + building) | **Yes** | none | Shown as cards with subtitles. |
| 3 | Region | select | 18 regions (NCR, CAR, Region I–XIII, BARMM) + "Select Region" | **Yes** | empty | Nationwide. |
| 4 | Province | select | enabled only after region | **Yes** | empty | For Region IV-A: Batangas, Cavite, Laguna, Rizal, Quezon. |
| 5 | Municipality / City | searchable text + listbox | enabled after province | **Yes** | empty | Reports a match count, e.g. "1 match out of 34 cities". |
| 6 | Barangay | searchable text + listbox | enabled after municipality | **Yes** | empty | |
| 7 | Street / Location | searchable text + listbox | enabled after barangay | **No** — labelled "(Optional)" | empty | **The reference does not require a street.** |
| 8 | Classification | select | Residential, Commercial, Agricultural, Industrial | **Yes** | **Residential** | Exactly four. Matches our RR/CR/I/A50. |
| 9 | Lot Area (sq.m.) | number | free numeric, placeholder "e.g. 150" | **Yes** | empty | |
| 10 | Corner Lot | toggle, "📐Corner Lot +2.5% value" | on/off | **No** | off | Carries its factor in the label. |

### Location parity decisions

- **Street is optional in the reference and must be optional for us.** Our current
  backend requires a street (`vgMissing()` pushes `"street"` when neither
  `streetKey` nor `allOther` is set). Matching the reference means dropping that
  requirement. Our BIR data does fall back to an all-other-streets rate, so we can
  price a street-less parcel — we currently force the user through a fake choice.
- **Purpose follow-up is Selling-only.** We must not show our own four-option sale
  stage for every purpose.
- **Classification default is Residential.** Ours has no default.
- **Corner is +2.5%.** Our disclosed corner factor is +2.5% (`0.025`). Match.
- Region/province: the reference is nationwide. We are Batangas-only. Preselect
  CALABARZON/Batangas and keep the controls visible so the pattern is the same, but
  do not imply nationwide coverage. This is the one deliberate divergence.

---

## Step 2 — Details

Eight accordions. The header of each shows a live summary of the current answers, so
a collapsed accordion still shows what was picked.

The first two are open by default: Ownership & Title is labelled
"BIGGEST IMPACT — Title status, occupancy, inheritance".

### 2.1 Ownership & Title (open by default)

Three questions. Each has a "Not sure we'll skip this" option.

**Occupancy** — no explicit question text, summarised as "occupancy"

| Option | Adjustment |
|---|---:|
| No, it's empty | 0% |
| A caretaker or family member there with permission | −5% |
| Tenants paying rent with a lease or agreement | −10% |
| Informal settlers occupying without permission | −25% |
| Not sure — we'll skip this | skipped |

**Title status** — summarised as "title"

| Option | Adjustment |
|---|---:|
| Yes, and it's in my name | 0% |
| Yes, but still in the previous owner's name, not yet transferred | −8% |
| No, only a tax declaration, no certificate of title yet | −15% |
| Not sure — we'll skip this | skipped |

**Inheritance** — summarised as "inheritance"

| Option | Adjustment |
|---|---:|
| No, I bought it or it's always been mine | 0% |
| Yes, and the settlement is finished, annotated on the title | 0% |
| Yes, but the settlement isn't done, extrajudicial settlement still pending | −10% |
| Not sure — we'll skip this | skipped |

### 2.2 Building (open by default) — House & Lot only

Header shows "CHB · — · 2F · 6-10yr", i.e. construction, floor area, storeys, age.

| # | Field | Options | Default |
|---|---|---|---|
| 1 | Construction | Wood ₱8K/sqm, Mixed ₱12K/sqm, CHB ₱15K/sqm, RCA ₱18K/sqm, Steel ₱22K/sqm, Prefab ₱14K/sqm | CHB |
| 2 | Total floor area across all storeys, in sqm | number | empty |
| 3 | Storeys | 1, 2, 3 | 2 |
| 4 | Age | 0-5yr, 6-10yr, 11-20yr, 21-30yr, 30+ | 6-10yr |

Note the label: **"Total floor area across all storeys"**. This confirms the floor
area must not be multiplied by storeys. Our `floorsMultiplier` of 1.05 on the
building component is the thing Task 4 says to audit — the reference has no such
multiplier.

### 2.3 Rooms (House & Lot)

Four counters with −/+ steppers: bedrooms, bathrooms, parking, maid's room. All
default 0. Header shows "0 bed · 0 bath · 0 parking · 0 maid".

### 2.4 Features (House & Lot)

Multi-select, additive, priced in pesos not percent. Header shows "None selected".

| Feature | Allowance |
|---|---:|
| 🧱 Wall/Gate | +₱180K |
| 🏡 Patio | +₱80K |
| 🌳 Garden | +₱50K |
| 🍳 Dirty Kitchen | +₱40K |
| 💧 Water Tank | +₱30K |
| 📹 CCTV | +₱50K |
| ☀️ Solar | +₱200K |
| 🏊 Pool | +₱500K |

### 2.5 Surroundings

Three questions.

**Community type:** Open Area, Subdivision, Gated. Header shows "Subdivision" as the
default.

**Flood risk:** No flooding, Occasional, Flood-prone. Default "No flood".

**Road access:** Footpath, Brgy road, Municipal, Highway. Default "Municipal".

### 2.6 Land & Access

Three questions.

**Frontage:** Narrow (narrower than neighbours), About average (similar to
neighbours), Wide (wider than neighbours), Not sure. No percentage shown.

**Lot shape:** Regular (no change), Irregular (−5%), Not sure.

**Right of way:** Direct (no change), Right of Way (−12%), Landlocked (−35%), Not
sure.

Note this is where terrain-as-slope also lives in the reference, split from
elevation below.

### 2.7 The Land Itself

**Elevation:** At Road Level (no change), Below Road (−7%), Not sure.

### 2.8 Utilities

**Power and water:** Full (no change), Partial (−5%), None (−10%), Not sure.

---

## Counting the questions

The reference says "9 quick questions". Reconciling that against what is actually on
the form:

- The eight **adjustment** questions that move the number: occupancy, title status,
  inheritance, community type, flood risk, road access, lot shape, right of way,
  elevation, utilities. That is ten.
- Frontage carries no percentage.
- House & Lot adds construction, floor area, storeys, age, four room counters and
  eight features.

So the "9 quick questions" label counts the lot/land questions only and excludes
ownership/title and the building block. **The marketing count does not match the
form.** We should not copy the number "9" — we should copy the fields and let the
count fall out.

Our current `FACTORS`/`QUESTIONS` in `js/value_guide_flow.js` has 9, built on the
merged-terrain assumption. It does not match. Confirmed by reading the live form.

---

## Gaps against our current implementation

| Reference | Ours today | Action |
|---|---|---|
| Street optional | required | drop the requirement (Task 9) |
| Purpose follow-up only under Selling | ours asks sale stage generally | gate on purpose (Task 9) |
| Classification defaults to Residential | no default | add |
| 10 separate adjustment questions | 9, with terrain merged | split, do not merge (Task 9) |
| Terrain split: slope + elevation vs road | single merged question | split (Task 9) |
| Frontage has no % | ours has a frontage factor | decide whether frontage is priced; reference implies not |
| Features priced in pesos | ours has a features model | align to peso allowances |
| No storeys multiplier on building | ours applies `floorsMultiplier` 1.05 | audit and likely remove (Task 4) |
| Construction: 6 options | ours has 3 | add the missing options or document the difference |
| Accordion summaries show live answers | flat grid | candidate for our own UI |

## Unresolved

- Frontage. The reference offers the question and no adjustment. We carry a frontage
  factor. Either drop the factor and keep the question as descriptive, or keep ours
  and say why we price it when the reference does not. Task 9 decision.
- Our construction rates differ from the reference's published per-sqm figures
  (ours 16K/25K/32K; reference 8K/12K/15K/18K/22K/14K). Ours are a SEA ESTATES table,
  not derived from the reference, and the purchased report used 16K. Task 4
  safeguard.

## How this was verified

```powershell
& "$env:APPDATA\npm\agent-browser.cmd" session id --scope worktree --prefix lvph
& "$env:APPDATA\npm\agent-browser.cmd" open "https://www.landvalueph.com/" --session lvph-...
& "$env:APPDATA\npm\agent-browser.cmd" snapshot -i --session lvph-...
```

Filled with the same property as the purchased report — Region IV-A, Batangas,
Bauan, a Poblacion barangay, Residential, 100 sqm, House & Lot — to reach the
Details step and expand all eight accordions. No estimate was generated and no
personal data was submitted.