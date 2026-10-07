# Value Guide — Reference Parity Rebuild

**Date:** 2026-10-07
**Status:** approved design, pending plan
**Supersedes:** `docs/specs/value-guide-3-step.md` (flow structure retained, input set replaced)

## Problem

The value guide asks the user nine questions and applies none of them.

`vgOpts()` (`js/app.js:10470`) sends `occupancy`, `titleStatus`, `inheritanceStatus`.
`FACTORS` (`js/value_guide_flow.js:55-109`) reads `lotShape`, `terrain`, `roadAccess`,
`titleDoc`, `floodRisk`, `faultProximity`, `amenities`, `community`, `infrastructure`,
`demand`, `zonalRecency`.

Only `corner` exists in both. Every methodology row therefore prints `0.00%` and the
applied net is always `0.00%`. Tests pass only because `tests/value_guide_flow_node.js`
injects factor values directly, bypassing the form.

A second defect sits underneath: `applyModel` (`js/value_guide_flow.js:147`) writes
`r.total` from the new model but leaves `r.value` holding the old estimator's number,
nulls `r.factors` / `r.factorStack` / `r.appliedMultiple`, and hardcodes
`r.ownershipAdjustmentPct = 0`. Panels carried over from the old estimator read exactly
those fields.

## Goal

Nine questions whose answers demonstrably move the number, a methodology table with no
blank or always-zero rows, and a single writer for every pricing field.

## Non-goals

Accuracy validation against market prices. See *Evidence limits*. Listing cross-check.
Home page port (separate plan).

---

## Decisions

| # | Decision |
|---|---|
| 1 | Flow, input set and interaction patterns match the reference. Visual design and all wording stay ours. No reference branding, assets or copy text. |
| 2 | `preparedFor`, `salePrice`, `saleContext`, `developerFees` are agent-only. Absent from the public guide. |
| 3 | One calculation core, two input surfaces (agent guide, public guide). |
| 4 | Classification is 4 options: `RR`, `CR`, `I`, `A50`. |
| 5 | Exactly 9 questions. The reference's `topography` and `grade` merge into one Terrain question. Frontage and flood are included; nearby-amenity chips are not. |
| 6 | `zonalRecency` is derived from the matched rate's `effectivityDate`. No factor is invented from data we do not hold. |
| 7 | `MARKET_IND`, the range band and the construction rate are settled by measurement against `data/batangas-zonal.json`, not against the reference. |
| 8 | The reference is a 3–4 fixture sanity check, hand-run, committed as JSON. Never a gate. |
| 9 | A skipped question prints "Not assessed" and is listed under "What we didn't check". An answered question printing 0.00% means it was assessed. |
| 10 | House & lot building value is unaffected by the nine questions. Those questions describe land and paperwork; the building is priced by cost approach. `SEC_BUILDING` and `bldgNet` are removed. |
| 11 | The value guide keeps its own construction rates. `data/zonal-config.json` is a generated artifact and is not edited. |
| 12 | Backend verified before `js/storefront.js` is touched. |

---

## Input set

### Step 1 — Location

Purpose · "Where are you in the sale?" (4 options, optional) · property type ·
municipality · barangay · street, with "all other streets" · classification (4) ·
lot area · corner lot.

`preparedFor`, `salePrice`, `saleContext`, `developerFees` appear on the agent surface
only (decision 2). Both surfaces read the same question list through `pickInputs`
(decision 3); neither adds a field by any other route.

Region and province are omitted: Batangas-only scope.

### Step 2 — Details

Nine groups (decision 5). Each option displays its own basis-point effect before
selection.

| # | Group | Input key | Factor | Basis |
|---|---|---|---|---|
| 1 | Lot shape | `shape` | `lotShape` | ours, matches published table |
| 2 | Terrain and slope | `topography`, `grade` merged | `terrain` | ours |
| 3 | Frontage | `frontage` | `frontage` (new) | chosen, not matched — −100 / 0 / +150 bp for Narrow (6 m) / Average (12 m) / Wide (20 m) |
| 4 | Road access | `access` | `roadAccess` | ours + reference weights |
| 5 | Flood risk | `flood` | `floodRisk` | ours |
| 6 | Utilities | `utilities` | `infrastructure` | ours |
| 7 | Title | `titled` | `titleDoc` (rewritten) | 0 / −800 / −1500 bp: clean title / previous owner / tax declaration only |
| 8 | Estate settled | `estate_settled` | `inheritance` (new, split from `titleDoc`) | 0 / −1000 bp: settled / pending |
| 9 | Occupancy | `occupancy` | `ownership` (new) | 0 / −500 / −1000 / −2500 bp: owner-occupied / caretaker / tenants / informal settlers |

Every group offers **Not sure**, which records the skip and leaves the factor unassessed
(decision 9).

Derived, not asked: `zonalRecency`, from the matched rate's `effectivityDate` (decision 6).
Asked in step 1: `corner` (+250 bp, matching the reference's +2.5%).

**Retired factors:** `faultProximity`, `amenities`, `community`, `demand`. No input
reaches them and no data exists to derive them. `titleDoc`'s "Inheritance not yet
settled" option moves to group 8.

### Retired factors and the building

`demand` was the only factor in `SEC_BUILDING`. Retiring it empties that section, so
`bldgNet = netOf(opts, false) - landNet` (`js/value_guide_flow.js:158`) becomes
permanently zero. This is the intended outcome (decision 10): all nine questions are land
and ownership characteristics. The mechanism is deleted rather than left to compute zero.

Consequence for house & lot: the nine answers move land value only. The building is
`floorArea × RCN × (1 - dep) + featuresTotal`, with no factor adjustment.

### Sections

Three sections survive, all land-bound:

| Section | Factors |
|---|---|
| Land & Terrain | `lotShape`, `terrain`, `frontage`, `cornerExposure`, `roadAccess` |
| Legal & Environment | `titleDoc`, `inheritance`, `floodRisk`, `ownership`, `zonalRecency` |
| Neighbouring | `infrastructure` |

`SEC_BUILDING` is deleted. The published order is preserved so the report and PDF tables
stay stable.

---

## Behaviour

### Unanswered is not zero

`factorBp` returns `0` for both a missing input and an option whose basis points are
zero (`js/value_guide_flow.js:114`). `sectionsOf` documents the current behaviour
deliberately: *"an unanswered question has to be a printed 0% rather than a missing row"*
(line 134).

Decision 9 reverses this while keeping the intent. A missing input yields `NaN`, not `0`.

- The full table still prints every row, in the published order.
- A skipped row reads "Not assessed".
- `assumptions[]` lists every skipped group by label.
- `compute()` never multiplies a `NaN`; `netOf` treats it as no contribution.

### Range bounds

`min` and `max` are declared per factor but never enforced at runtime; only
`tests/value_guide_flow_node.js` checks that option values fit their declared range.
`netOf` applies no total clamp, so answering every question at its worst currently
compounds without limit.

The sum is clamped to `MODEL.NET_FLOOR` / `MODEL.NET_CAP`. Bounds are `-0.15` and `+0.15`.
The published per-factor maxima, summed across the eight land factors, reach −24.5%, so
the floor binds on a property where every question is answered at its worst. The cap binds
on corner plus a strong road access and utilities. Both are reviewed against the
calibration fixtures in Plan 1 Task 9.

### Methodology table rendering

`methodologySection` (`js/value_guide_flow.js:328`) currently maps every `FACTORS` row
and falls back to `bp = 0` for any factor missing from `result.referenceModel.sections`.
With skips yielding `NaN`, that fallback must become "Not assessed" rather than `0.00%`,
and the `<th>` for that row carries `data-vf-unassessed` so the PDF can render the same
wording from its own path.

Two rows of that section are copy, not logic, and both change: "the twelve published
answers" becomes the live question count, and "Applied net: X on land, Y on the
improvement" becomes a land-only statement (decision 10). The count is generated from the
question list, never typed as a literal, for the reason recorded under *Reference
verification*.

### Single writer

`applyModel` is the only function permitted to write a pricing field. It overwrites
`r.value` and `r.marketGuide.value` so no stale pre-model number survives. A test asserts
no field carries a value from the superseded estimator.

### Classification

Four options map to codes `RR`, `CR`, `I`, `A50` (decision 4). `X` Institutional, `GP`
General Purposes and `CL` Cemetery Lot become unreachable from the form. The lookup
retains tolerance for those codes and for all 29 agricultural sub-codes so existing saved
drafts resolve rather than fail. Accepted consequence: an institutional lot is now priced
as residential.

---

## Calibration

`MARKET_IND = 1.174` is applied to land value before any factor adjustment. The
reference's published formula contains no such multiplier, but its per-option
percentages are read at runtime from a database, so the absence is not evidence their
output lacks it.

Twenty-four fixtures — 3 municipalities × 4 classifications × 2 lot sizes — run through
`compute()`. For each, the model's ₱/sqm is compared with the `p50` of
`batangas-zonal.json` for that classification and municipality.

Metrics: median absolute deviation from `p50`; share of fixtures inside `p25`–`p75`.

The acceptance threshold is read off the measured spread, not chosen in advance. It is
then asserted by `tests/value_guide_calibration_node.js` so it cannot silently drift.

Every value settled here is decided against `data/batangas-zonal.json`, never against the
reference (decision 7). The reference is a 3–4 fixture sanity check, hand-run and
committed as JSON (decision 8); a disagreement with it is recorded, not corrected toward.

### Construction rate — four sources, none authoritative

| Source | wood_prefab | mixed_chb | rca_steel |
|---|---|---|---|
| `value_guide_flow.js:37` `MODEL.RCN` | 8,000 | 16,000 | 18,000 |
| `zonal-config.json` `construction.costPerSqm` | 16,000 | 25,000 | 32,000 |
| `build-batangas-data.js:48-50` (the generator) | 15,000 | 25,000 | 40,000 |
| reference app bundle | 8,000 Wood / 14,000 Prefab | 12,000 Mixed / 15,000 CHB | 18,000 RCA / 22,000 Steel |
| reference methodology page | — | 12,182 (PSA 2025 average) | — |

`applyModel` reads `MODEL.RCN`, so the generator's published rates are already
discarded by the value guide. Depreciation is duplicated the same way: the flow module
uses `DEP_CAP: 0.80` and per-construction useful life, while `estimator.js:229-230` and
the step-2 UI copy read `zonal-config.depreciation` (`lifeYears: 40`, `maxPct: 0.95`).

These are two models for two products. Decision 11 keeps them separate: the value guide
owns its rates, the PDF names the rate used, and a test pins the values. Editing
`zonal-config.json` is not possible in any case — `build-batangas-data.js` regenerates it
— and would move the old calculator's numbers across deal, project and appraisal screens.

### Contested: title and occupancy

Two sources disagree.

- The reference's published methodology table: title −5% … 0%.
- The reference's `/check` question screen: title −8% (previous owner), −15% (tax
  declaration only); occupancy −5% / −10% / −25%; inheritance pending −10%.

The current `titleDoc` range (−2% / −3.5% / −5%) matches neither, so rows 7–9 start from
the `/check` values and the fixtures decide. If calibration prefers the methodology
table, the change lands in one place and every golden fixture moves with it.

---

## Evidence limits

There is no market price data available to validate against.

| Source | Contents |
|---|---|
| `ESREALTY_LISTINGS_API` | 3 listings, all Caloocan, Metro Manila. No lot or floor area. One titled `321321`. |
| `market-index.json` | 38 daily snapshots, NCR cities only (Manila, Pasig, Quezon City, Antipolo, Parañaque, Biñan, Muntinlupa). Samples of 3–12. |
| `batangas-projects.json` | 26 projects with total price ranges (₱9M–₱16M). No lot area, so ₱/sqm is not derivable. |
| `value-guide-project-evidence.json` | States it directly: *"No verified completed sales or currently dated exact-unit quotations obtained… context-only."* |
| `data/bir-batangas/*.json` | 34 municipalities, ~4.5 MB, street-level. Rich — but all BIR zonal values. |

Calibration against `batangas-zonal.json` measures how far the multipliers move a value
off the BIR baseline. It is not external validation, and the report must not claim
otherwise.

The existing comparables mechanism (`loadComparables`, `js/value_guide_flow.js:275`) queries
Batangas sale listings and returns nothing, because none exist. It stays, is context-only
and writes no pricing field (`applyComparables:304`), and becomes correct automatically
once listing volume exists. Its empty state must say so in words rather than render a
blank section.

**Permitted report claim:** *"Derived from published BIR zonal values, adjusted for
documented property factors. Not a real estate appraisal under RA 9646."*

**Prohibited:** any claim of agreement with real market prices, and the LVIS-style active
listing median. No listing data exists for Batangas. Revisit once listing volume does.

### Follow-up, non-blocking

Persist each guide run's inputs and estimate so a real comparison becomes possible when
Batangas listings exist. Not built now: the guide's answers do not currently move the
number at all, which outranks it.

---

## Reference verification record

Verified 2026-10-07 by reading the live `/check` page and its shipped bundle
(`CheckLocation-DqPWl9QF.js`).

- Steps: `["Location","Details","Report"]`.
- Step-1 group "Where are you in the sale?" — four options, optional, revealed once a
  purpose is chosen. Not present in our plan until this spec.
- Classification: exactly `Residential`, `Commercial`, `Agricultural`, `Industrial`.
- Corner lot: `+2.5% value`.
- Frontage options carry `pct: null`; frontage is recorded in metres (6 / 12 / 20).
- Road access weights, hardcoded: `footpath: 2, barangay: 6, municipal: 10, highway: 20`.
- Details factor keys rendered: `shape, topography, access, grade, utilities, titled,
  estate_settled, occupancy`, plus frontage — the count is displayed as that list's length
  `+ 1`, computed from rows fetched at runtime from a `valuation_factors` table. **Their
  question count is database state, not a fixed spec, and can change without a code
  deploy.** Our count is therefore generated from our own question list, never typed as a
  literal.
- `Not sure` on frontage deletes the key outright.

Clean-room boundary (decision 1): flow, input set and interaction patterns may be matched.
Visual design, wording and copy are ours.

---

## Scope

Plan 1 (this spec) covers the calculation core, the nine inputs, both renderers, the
methodology table and calibration. The home page port is a separate plan, blocked until
Plan 1 is verified (decision 12).

## Review focus

Input classes the spec implies that no test currently exercises.

1. **Not sure on all nine.** Net is 0; the table lists nine "Not assessed" rows and nine
   assumption entries. Not nine `0.00%` rows.
2. **Skipped versus a genuine zero.** "Regular / rectangular" and "Not sure" both
   contribute 0; only the first is an assessment.
3. **Every answer at its worst.** Clamped to `NET_FLOOR`, never negative value.
4. **Legacy classification codes** (`X`, `GP`, `CL`, `A1`) in saved drafts. Must still
   resolve after the four-button picker.
5. **House & lot, all nine skipped.** Building value is still
   `floorArea × RCN × (1 - dep)`; land net is 0.

## Deferred

The "Calculate value returns to step 1 with cleared fields" defect is undiagnosed. It is
expected to fall out of rebuilding the step machine in Plan 1 and carries no separate task.