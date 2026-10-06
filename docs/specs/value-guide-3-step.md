# Value Guide: 3-Step Reference Flow

Status: approved · Date: 2026-10-06 · Scope: internal Value Guide (`view "value-guide"`)

## Problem

The Value Guide is a four-stage wizard that wraps the *public* estimator. It
therefore returns the public model's answer: for a vacant lot in Bauan
Poblacion III the public stack multiplies the BIR rate by **2.5**, so the guide
quotes ₱2,875,000 where the LandValuePH reference model — the published
method this guide claims to follow — quotes ₱1,343,350. The same product shows
two numbers for one lot, and neither screen says which model produced it.

The stages themselves are also mis-shaped. "Review & calculate" is a screen
whose only job is a button, "Property & location" carries three collapsed
disclosure groups about land-method and time-indexing that this flow does not
use, and the operator sees no report until the calculation has already run.

## Decision

Replace the wizard with a three-step flow — **Location → Details → Report** —
driven by a new calculation module that implements the LandValuePH reference
model from their published methodology page and shipped engine.

Rejected:

- **Keeping the market multiple.** Their own published multiplier range
  (1.5×–2.5×) and their own shipped output (1.174×) disagree; adopting the
  range would abandon clean-room parity with a report we can reproduce.
- **Escalating the construction rate to the valuation year.** Tested against
  references and rejected — see *Escalation* below.
- **Changing the public storefront.** It stays on its own model; the guide says
  so rather than the two being silently reconciled.

## Non-goals

- No change to `js/estimator.js`, `js/data.js`, `data/zonal-config.json` or any
  BIR dataset. The storefront calculator is untouched.
- No time-indexing anywhere in this flow. `value_guide_time_*` is deleted.
- No paywall, locked price, testimonial or PVS number/claim.
- No comparables as a calculation input — ever.
- No change to `stripValueGuideDraft` / the no-persist rule for `state.vg`.
- No correction of stale BIR street rates (see *Known data limits*).

## Design

### 1. Model

```
landBase   = birZonalRatePerSqm x lotArea            (unmodified BIR figure)
landNet    = +50 bp   road access                    (Land & Terrain)
           +100 bp   community                       (Land & Terrain)
           -200 bp   zoning recency                  (Legal & Environment)
           = -50 bp  (the golden fixture)
landValue  = landBase x MARKET_IND x (1 + landNet)
rcnRate    = CONSTRUCTION_RATES[style]                (flat, no escalation)
rcn        = floorArea x rcnRate
depreciated= min(ageMidpoint / usefulLife, 0.80)
bldgValue  = rcn x (1 - depreciated) + featureCosts
total      = landValue + bldgValue                   (vacant lot: landValue)
low        = round(total x 0.85)
high       = round(total x 1.30)
perSqm     = round(total / lotArea)
```

Constants:

| Name | Value | Meaning |
| --- | --- | --- |
| `MARKET_IND` | `1.174` | Market-indicator multiplier recovered from LandValuePH's shipped report: land ₱1,350,000 on a ₱1,150,000 base |
| `RANGE_LOW` | `0.85` | published ±15% planning band, low side |
| `RANGE_HIGH` | `1.30` | their H&L report's actual upper band |
| `USEFUL_LIFE` | `40` | CHB service life; matches `zonal-config.depreciation.lifeYears` |
| `DEP_CAP` | `0.80` | maximum depreciable share |
| `ownershipAdjustmentPct` | `0` | no ownership deductions in this flow |

Section split: `landNet` is the sum of **Land & Terrain**, **Neighbouring** and
**Legal & Environment** only. **Building & Features** percentages attach to the
building component, not the land. This is what keeps a vacant lot's value from
moving when a house question changes.

### 2. Provenance of the rate constants

Required record. Every constant above traces to LandValuePH's shipped client
bundle (`https://www.landvalueph.com/assets/*.js`) or to the PDF report
`LVPH-D-9531904C` purchased 2026-10-06:

| Constant | Value | Source |
| --- | --- | --- |
| `CONSTRUCTION_RATES` | Wood 8,000 · Mixed 12,000 · **CHB 16,000** · RCA 18,000 · Steel 22,000 · Prefab 14,000 | Report arithmetic: `RCN 16,000 x 120 sqm = 1,920,000`, matching the printed building figure |
| bundle chip (display only) | Wood 8e3 · Mixed 12e3 · CHB **15e3** · RCA 18e3 · Steel 22e3 · Prefab 14e3 | Same bundle, a rate chip that disagrees with the report's own arithmetic — **report wins**, and the discrepancy is recorded here rather than silently reconciled |
| `USEFUL_LIFE` by style | Wood 25 · Mixed 35 · CHB 40 · RCA 50 · RCC 50 · Steel 50 · Prefab 30 | bundle `usefulLife` map |
| `MARKET_IND` | 1.174 | reported land ₱1,350,000 ÷ zonal base ₱1,150,000 in the purchased report |
| age bands | 0-5 · 6-10 · 11-20 · 21-30 · 30+ | bundle age bucket list |
| 12-factor ranges | see §3 | `/methodology`, JS-rendered; recovered with a browser because `webfetch` returns only the SPA shell |
| feature costs | 8 items | identical to `data/zonal-config.json.features` — already in this repo, not re-imported |
| `cornerLotPct` | 0.025 | `data/zonal-config.json`, already in this repo |

Labelling rule: ₱16,000 is a **permit-declared** figure. PSA published a
national residential average of ₱14,429/sqm (Jan 2025) and ₱14,081.64/sqm
(May 2026); PSA CALABARZON was ₱13,405/sqm (Jan 2025); real Batangas turnkey
quotations for an economic finish run ₱23,100–₱31,185/sqm (Q1 2026). The rate
is therefore above the permit-declared average and below every contractor quote.
The report prints that disclosure beside the building figure.

### 3. The factor table

Twelve published factors, each with a published range, a section, and a
question whose answers map to a percentage:

| Factor | Published range | Section |
| --- | --- | --- |
| Lot shape | 0 → −5% | Land & Terrain |
| Terrain / elevation | 0 → −8% | Land & Terrain |
| Corner exposure | 0 → +5% | Land & Terrain |
| Road access | −2% → +2% | Land & Terrain |
| Title / documentation | −5% → 0% | Legal & Environment |
| Flood exposure | −5% → 0% | Legal & Environment |
| Fault proximity <5 km | −3% → 0% | Legal & Environment |
| Amenities | 0 → +3% | Neighbouring |
| Community quality | 0 → +3% | Neighbouring |
| Infrastructure | 0 → +2% | Neighbouring |
| Demand (LVIS) | −3% → +3% | Building & Features |
| Zonal recency | −2% → 0% | Legal & Environment |

Net is **additive**, summed once, then applied once. Never compounded.

### 4. Escalation: rejected

The plan originally escalated `rcnRate` by `1.02^(valuationYear − 2025)`.
Reference testing rejected it:

- PSA's national residential average **fell** 14,429 (Jan 2025) → 14,081.64
  (May 2026) = **−2.4%**.
- PSA CMRPI materials growth is **+1.3%/yr** (Mar 2026).
- No source supports +2%/yr.

It also moved the golden total by only ₱30,720 (1.1%). The rate is **flat
₱16,000**, which additionally removes the last time-index from the flow and is
consistent with deleting `value_guide_time_*`.

### 5. Comparables from our own catalog

Step 3 pulls the operator's own listings through
`ESREALTY_LISTINGS_API.list(...)` with the filter the public estimator already
uses (Batangas · same municipality · `offer_type: sale` · `status: available` ·
matching property type · 50 rows), then `core.normalizeComparable()` and
`core.comparableSummary()`.

They render in the report's Comparables block. **Context only.** A test pins
`total`, `low` and `high` to be byte-identical with and without listings, so a
future edit that lets a listing price into the arithmetic fails. Empty catalog
→ "No matching listings for this municipality", never a hidden section.

Both APIs are already exported from `js/estimator.js`, so this needs no change
to that file. The existing evidence gates apply: a row without a lot area,
price or a date inside six months, or one flagged synthetic or membership-priced,
is dropped rather than averaged.

### 6. Surfaces

- **Report (step 3)** — figures, range, per-sqm, integrity, then in order:
  the model callout, comparables, methodology (12-factor table with the applied
  net), the BIR reference shown separately, the construction-rate disclosure,
  the transaction/tax block, and the PDF action.
- **Model callout, fixed copy:**
  `Reference model: LandValuePH published methodology, market-indicator factor 1.174. The public site calculator uses a different model (SEA ESTATES factor stack) and returns a higher figure for the same property — 2.14x on a vacant lot in this fixture. Both are planning figures; neither is an appraisal.`
- **PDF** — `js/value_guide_pdf.js` `PARTS` grows from 6 to about 12 sections to
  match, by *adding* sections to the existing builder rather than rewriting it.

### 7. Known data limits (logged, not fixed)

BIR street rates for post-2022 subdivisions are far below market: in Bauan
Barangay As-is the schedule reads ₱2,500–₱3,500/sqm on `amaia scapes`,
`lumina homes` and `lynville residences`, while those homes transact around an
implied ₱21,000+/sqm of land. The guide and the public estimator both inherit
this. Back-test evidence: the model lands **+10%** against a foreclosed asking
in Poblacion III (where the schedule tracks market) and **−38% to −69%** in the
subdivision barangays (where it does not). The cause is the zonal schedule, not
the construction rate — doubling `rcnRate` moves the As-is cases only from −69%
to −47%.

Out of scope. The report discloses `effectivityDate` and the model name instead.

## Testing

New `tests/value_guide_flow_node.js`:

1. Golden Bauan fixture → `total 2879350`, `low 2447448`, `high 3743155`,
   `perSqm 28794`, `landValue 1343350`, `improvement 1536000`.
2. Vacant-lot vector → `1343350` / `1141848` / `1746355` / `13434`.
3. Construction-rate table is flat: no `valuationYear`, no `1.02`.
4. Age curve: age 0 → no depreciation; age 40 → capped at 80%.
5. Section split: changing a *Building & Features* answer never moves a vacant
   lot's total.
6. Net is additive — two +50 bp answers sum to +100 bp, not 1.05 x 1.05.
7. `ownershipAdjustmentPct === 0`.
8. `MARKET_IND` is exactly `1.174`.
9. Comparables do not change `total`/`low`/`high`.
10. `core.integrityCheck` passes on the produced result.

Updated: `value_guide_internal_node.js` (block moved, `vgEst().estimate` call
gone), `value_guide_internal_e2e.js` (three-step selectors),
`value_guide_simplify_e2e.js`. Deleted: `value_guide_time_node.js`,
`value_guide_time_e2e.js` and their CI entries.

Regression: the full suite must stay green (`tests/run_all.ps1`), and
`node build_app.js --check` + `node tests/build_sync_node.js` must report
`IN SYNC`.

## Files

| File | Change |
| --- | --- |
| `js/value_guide_flow.js` | **new** — factor table, `compute()`, `missing()` |
| `js/app.js` | stages 4 → 3, renderers, `vgCalculate` routes to `FLOW.compute` |
| `index.html` | one `<script defer>` before `js/app.min.js` |
| `js/value_guide_pdf.js` | add report sections to `PARTS` |
| `tests/value_guide_flow_node.js` | **new** |
| `tests/value_guide_internal_{node,e2e}.js`, `value_guide_simplify_e2e.js` | update |
| `tests/value_guide_time_{node,e2e}.js`, `.github/workflows/tests.yml` | delete |
| `sw.js` | `esrealty-pages-v10` → `v11` |

## Risks

- **The guide now disagrees with the public calculator by 2.14×.** Accepted and
  disclosed in the model callout rather than reconciled; reconciling would mean
  changing the storefront, which is out of scope.
- **₱16,000 understates real turnkey construction** (₱23,100–31,185). Disclosed
  beside the building figure. Raising it is a one-line change once someone owns
  the decision.
- **Back-test coverage is one town.** Poblacion III validates; the subdivision
  barangays fail on zonal data. The spec records both rather than quoting the
  flattering half.
- **PDF section growth** is the largest surface change; it is additive to an
  existing tested builder, not a rewrite.
