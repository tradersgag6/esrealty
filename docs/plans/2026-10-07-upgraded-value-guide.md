# Upgraded Value Guide — Backend-First Execution Plan

Date: 2026-10-07
Status: **approved, in progress**

## Recommendation

Build one calculator shared by the backend and frontend. Keep the original
storefront computation as the fallback, introduce market-based improvements only
when matched evidence supports them, and use the supplied LandValuePH report as a
separate comparison benchmark — never as market truth.

The public guide shows an understandable result first, then offers two next steps:
request a licensed appraiser, or talk to a licensed broker.

## Decisions locked by the user

| Requirement | Implementation |
|---|---|
| Backend first | Complete and verify the internal Value Guide before replacing the homepage calculator. |
| Same reference inputs | Verify the reference's complete live input inventory. Match its fields, choices and progression. |
| Simple public experience | No extra customer, tax or report-preparation fields in the public steps. |
| Agent/customer details | Optional agent-only section in the backend. |
| Correct computation | One calculation service and result structure for both surfaces. |
| Original calculation fallback | Preserve current class-specific factors and building calculation until evidence justifies a replacement. |
| Improve market accuracy | Matched evidence only. Separate asking-price agreement from verified-sale agreement. |
| Professional inquiries | Results lead to an appraiser or broker request with no registration required. |

Original storefront computation is the shared default fallback. Qualified, closely
matched evidence may replace it, but only after passing independent benchmarks.
LandValuePH stays a comparison benchmark.

**Correction carried into this plan:** the earlier merged nine-question design is
*not* an exact copy of the reference's inputs. Task 2 replaces that assumption with
a verified field-by-field inventory.

---

# Plan A — Backend Value Guide

## Task 1 — Establish the actual baseline

Files: `js/estimator.js`, `js/value_guide_flow.js`, `js/app.js`, existing tests.

- [x] Record current commit, calculator versions and configuration.
- [x] Run the existing Node suite.
- [x] Run the browser suite and record individual failures, separating existing
      failures from regressions. (Full run: only the pre-existing
      `stores_freshness_e2e` failure, which also fails on a clean checkout; it
      requires the market-scan worker on `:8932`.)
- [x] Check that async tests await their assertions and report meaningful counts.
      (The async-runner patterns in `value_guide_questions_node.js`,
      `value_guide_contract_node.js` and `value_guide_input_parity_node.js` were
      audited while writing the Task 2-3 suites; each awaits its promise list.)
- [x] Save the baseline results during execution. (Baseline below + the Task 10
      gate run: 39/39 node suites, estimator/internal/PDF-browser e2e green.)

### Baseline recorded

- HEAD `4d234bd` ("revert(estimator): keep the flat SEA ESTATES market band at 2.5").
- Working tree clean except untracked `logs/`.
- **35/35 Node suites green** as of 2026-10-07 (run after the Task 6 changes).
- Flat band restored: residential 2.5, commercial 4.25, agricultural 0.75,
  industrial 2.7, range 0.85–1.30.
- `stores_freshness_e2e` is a pre-existing failure, unrelated to this work.
  Verify `market-scan/worker/server.js` on `:8932` before calling it a regression.
- The earlier "36 Node suites" figure predates the revert and does not certify the
  current checkout.

## Task 2 — Verify the exact reference input contract

New artifact: `docs/specs/value-guide-input-parity.md`

Inspect the live reference for every purpose and its conditional follow-up,
vacant-lot inputs, house-and-lot inputs, location selection and street fallback,
the four classifications, every Details question and choice, required fields,
defaults, "Not sure" behaviour, and back/edit/reset/calculate behaviour.

Record each field as:

```text
Field -> Choices -> Required/optional -> Default -> Conditional visibility
      -> What it changes in the calculation or report
```

Region and province may display preselected to CALABARZON / Batangas to preserve
the interaction pattern, but the form must not imply nationwide coverage.

**Acceptance:** parity verified from the rendered reference, not inferred from a
PDF or an unconfirmed question count.

### Done — `docs/specs/value-guide-input-parity.md`

Verified in a real browser against the live form. The inventory falsified two
assumptions this plan started from:

- **"9 quick questions" is the reference's marketing label, not its form.** It
  renders ten adjustment fields plus frontage, and the count excludes
  ownership/title and the whole building block. We should copy the fields, not the
  number.
- **Terrain is two questions, not one.** Slope and elevation-relative-to-road are
  priced separately (−7% each). We merged them into "Terrain and slope" and lost
  that distinction.

Other findings that change Task 9 scope:

- **Street is optional** in the reference, labelled "(Optional)". Our `vgMissing()`
  requires it. Verified the engine already handles it: an empty street falls through
  to the barangay all-other-streets rate (6,500/sqm vs 11,500/sqm for the street),
  stays positive, and borrows no street name. The form block is removable; only the
  form needs changing.
- **The sale-stage follow-up is Selling-only.** We ask it generally.
- **Classification defaults to Residential.** Ours does not.
- **No storeys multiplier on the building.** The reference labels its field "Total
  floor area across all storeys" and applies nothing extra. Our `floorsMultiplier`
  of 1.05 is what Task 4 says to audit.
- Construction: six options at 8K–22K/sqm. Ours has three at 16K–32K/sqm, from a
  different table.

Contract frozen in `tests/value_guide_input_parity_node.js` (8 checks), including a
guard that terrain and elevation are not merged back together and a guard that the
street-less fallback still prices.

## Task 3 — Define one calculation contract

Files: `js/estimator.js`, `js/value_guide_flow.js`, `js/value_guide_evidence.js`

```js
computeGuide(input, evidence, options) -> Promise<GuideResult>
```

The result carries: normalized inputs; BIR reference and lookup depth; land
component; building component; feature allowances; adjustments actually applied;
total and planning range; selected method; evidence sources and observation dates;
assumptions and unanswered questions; model/data version; arithmetic reconciliation.

**Acceptance:** identical inputs and evidence produce identical frontend/backend
amounts. Customer name, purpose, phone and email never change the valuation.
Asking-price scenarios used for transaction costs do not silently change the
property estimate.

### Done — `docs/specs/value-guide-calculation-contract.md`

Invariants hold on both surfaces and are asserted:
metadata never moves a total (6 variants x 2 surfaces); an unrecognised
`saleContext` is refused with a reason rather than priced; a vacant lot never
inherits a building even when a floor area is passed; components sum to the
total and the total sits inside its own range; every result carries model,
data and factor-settings versions.

**The two surfaces do not agree, and cannot yet.** The gap decomposes into three
factors, all exact on the report fixture:

| Factor | Guide | Storefront | Gap |
|---|---:|---:|---:|
| Land multiplier | 1.174 | 2.5 | the open Task 9 decision |
| Building rate (CHB) | 16,000/sqm | 25,000/sqm | ₱864,000 |
| Storeys on a total-area input | x1.00 | x1.05 | ₱120,000 — **removed in Task 4** |

**The storeys multiplier was a bug, not a difference of opinion.** The field is
labelled "Across all storeys", so multiplying by a per-storey factor charged the
same square metres twice: it priced a 2-storey house 5% above the same house
described as 1-storey at an identical floor area. Removed in Task 4.

The land multiplier cannot be settled by engineering — it is which model survives.
Two land records disagree (1.26x–2.43x vs 0.53x–0.68x) and neither is a verified
sale. Frozen, not unified, so the eventual decision arrives as a deliberate diff.

`tests/value_guide_contract_node.js` — 9 checks.

## Task 4 — Preserve and document the fallback computation

```text
BIR land reference = matched BIR rate x lot area

Land guide    = original calculation using disclosed classification,
                market-band, regional and corner factors
Building guide = original replacement-cost calculation using construction,
                total floor area, age and supported features
Total         = land guide + building guide
```

Safeguards:
- Vacant Lot: building contribution is always zero.
- House & Lot: show the building contribution separately.
- Label floor area as **total across all storeys**.
- Audit the storeys multiplier — is it a pricing allowance or an accidental second
  count of floor area?
- Preserve flag-only ownership/hazard behaviour until numerical deductions have
  defensible support.
- Do not automatically inflate prices because a BIR schedule is old.
- Keep official BIR figures separate from market-model assumptions.

**Acceptance:** independently calculated fixtures reconcile every component and
rounding step.

### Done — storeys multiplier removed

Audited, and it was an accidental second count. Every `floors` multiplier in
`data/zonal-config.json` is now 1, and the generator that writes it agrees.

Changed: `data/zonal-config.json`, `market-scan/build-batangas-data.js`, the two
reader-facing strings in `js/estimator.js` that promised or printed a storeys factor,
and `calculationVersion` to `2026.10.4` so a cached report cannot be mistaken for one
from the old model.

Effect on the report fixture: storefront total ₱5,395,000 → ₱5,275,000. Visible
reduction, not hidden. Storeys is still recorded as context; it no longer prices.

Re-derived by hand in `tests/estimator_math_node.js` and
`tests/estimator_core_node.js` (no longer `x 1.05`), and the contract test now asserts
every multiplier is 1 *and* that the copy no longer mentions one. The
`value_guide_multiple_node.js` headline moved with the engine and its gap
recalculated 131.5% → 125.2%.

37/37 node suites green, `js/app.min.js` in sync.

Still open from this task: the CHB rate table (25,000 vs the reference's 16,000) is a
documented difference of source, not an error, and is left alone. The land multiplier
remains the Task 9 decision.

## Task 5 — Make the supplied reference report a reproducible benchmark

New fixture: `tests/fixtures/value-guide-reference-bauan.json`

Source: LandValuePH report `LVPH-D-9531904C`, dated 2026-10-05, BINAY ST
(RESSURRECCION ST), Poblacion III, Bauan. A 21-page PDF; text extracted with
`pypdf`.

Inputs read from pages 3 and 4:

| Component | Reference |
|---|---:|
| BIR rate (BIR RR 8-2018, as cited) | 11,500/sqm |
| Lot area | 100 sqm |
| BIR land base | 1,150,000 |
| Reported land value | 1,350,000 |
| Floor area | 120 sqm |
| Construction rate (PSA 2025) | 16,000/sqm |
| Replacement cost new | 1,920,000 |
| Accumulated depreciation | 20% |
| Depreciation amount | 384,000 |
| Building value | 1,536,000 |
| **Total** | **2,886,000** |
| Range | 2,453,100 – 3,751,800 |

Verified arithmetic: implied land multiplier `1,350,000 / 1,150,000 = 1.173913`,
which is the origin of the internal `MARKET_IND = 1.174`. Range is exactly
total x 0.85 and x 1.30. Land + building = total.

Recorded internal inconsistencies, kept on file so nobody cites the report as proof
of a +2.0% net adjustment or a 23,000/sqm market rate:

1. Claims a +2.0% net adjustment; the four category rows it prints sum to +0.5%.
2. The +2.0% is never applied — `1,150,000 x 1.02 = 1,173,000`, not 1,350,000.
3. Its own tax-visibility page states a 23,000/sqm market rate (2.0x BIR),
   inconsistent with the 13,500/sqm it valued the land at.
4. Depreciation is labelled "20.0%/year" but 20% is accumulated over a 40-year
   life; the remaining-life line says 85% / 34 years, implying 15%.
5. Page 6 states active market listing data for Bauan is still being compiled, and
   shows no comparables. It is a BIR-referenced AVM, not a market-derived appraisal.

**Acceptance:** the benchmark reports each model's difference from the reference. It
never tunes a universal multiplier to match a single property.

### Done — `tests/fixtures/value-guide-reference-bauan.json`

The plan's named fixture exists, and the comparison it calls for is now a suite of
its own. `tests/value_guide_reference_benchmark_node.js` computes both surfaces from
the report's own inputs, prints the side-by-side table, and pins the arithmetic:

| | Report | Guide | Storefront |
|---|---:|---:|---:|
| Land | 1,350,000 | 1,336,599 (−1.0%) | 2,875,000 (+113.0%) |
| Building | 1,536,000 | 1,536,000 (0.0%) | 2,400,000 (+56.3%) |
| **Total** | **2,886,000** | **2,872,599 (−0.5%)** | **5,275,000 (+82.8%)** |

(Storefront figures are post-Task-4; the building row no longer includes the storeys
multiplier.)

The fixture also corrected a location decision from earlier in this session: the
report data originally lived inside `data/market-benchmarks.json` under
`_referenceBenchmark`, which would have been two copies of the same numbers. That
block is removed from the market file; the fixture is the one canonical copy, and
`market_benchmarks_node.js` now reads it. Two files holding the same figures would
drift, which is the exact failure this task exists to prevent.

Asserted: the report's arithmetic reconciles; its five contradictions stay on file;
`MARKET_IND` still equals the multiplier the report implies; neither surface's
formula reads the fixture; the guide sits within 2% of the report while the
storefront stays far above it — as a tripwire, not an accuracy claim.

38/38 node suites green.

## Task 6 — Research and repair the market-evidence dataset

Files: `data/market-benchmarks.json`, reusing
`data/value-guide-project-evidence.json` where appropriate.

Each record needs exact location and identity, property type and classification,
price and price basis, lot area, floor/age/condition for houses, source URL and
observation date, published price date, developer-sale vs resale, and included fees.

Screening rules: historical prices are never relabelled current; observation date is
never substituted for price-effective date; house-and-lot packages are never read
as land-only rates; duplicate advertisements count once; unresolved records stay
context-only; **compare against the exact project/street BIR rate, never a
municipal median for convenience**.

### Measured comparison on the same report property

| | Reference report | Internal 1.174 guide | Flat storefront |
|---|---:|---:|---:|
| BIR rate | 11,500/sqm | 11,500/sqm | 11,500/sqm |
| Land | 1,350,000 | 1,343,350 | 2,875,000 |
| Building | 1,536,000 | 1,536,000 | 2,520,000 |
| **Total** | **2,886,000** | **2,879,350 (-0.23%)** | **5,395,000 (+86.9%)** |
| Range | 2,453,100 – 3,751,800 | 2,447,448 – 3,743,155 | 4,585,750 – 7,013,500 |

The building side matches to the peso — both use 16,000/sqm x 120 sqm x 80%
remaining. The entire gap is the land multiplier, 1.174 vs 2.5.

### Two land-only records, re-measured against the BIR rate for their own street

The earlier reading compared both against a municipal p50. That was the wrong
denominator: a town-wide median blends subdivisions priced far above it with ones
far below it, and no individual property can be judged against it.

| Record | Asking | BIR rate for that street | Implied multiple |
|---|---|---|---:|
| `laurel-splendido-310` (310 sqm, 5,270,000 = 17,000/sqm) | 17,000/sqm | 13,500 (Dayap Itaas, Niyugan); 7,000 (Paliparan) | **1.26x – 2.43x** |
| `gavina-ville-ph3` (3,200–3,400/sqm) | 3,200–3,400/sqm | 6,000 (Palsahingin); 5,000 (Sambat) | **0.53x – 0.68x** |

This reversed the earlier conclusion. Splendido was read as 6.8x against a Laurel
p50 of 2,500 and treated as a premium outlier; against the rates its street actually
carries it is **1.26x–2.43x, inside the researched 1.5x–3.0x band**. It no longer
supports treating the band as an over-estimate.

Gavina Ville still sits *below* its own street's BIR rate, and survives the
corrected denominator. It is the record that disproves BIR-as-floor. Reliability is
low: the figure sits in an undated historical-trends block, not a live quote.

Also flagged: the CBDI source URL for both Paseo de Lipa records returns 404; a
corroborating Businesses10 URL is live.

Net evidence position: one land record inside the band, one below its BIR rate, one
house-and-lot package at ~10x that cannot be read as a land rate. Too thin to
change any multiplier.

- [x] Correct and reclassify the existing records with exact-street BIR checks.
- [x] Record the reference report as `_referenceBenchmark`, including its internal
      contradictions, with `numericalAllowed: false`.
- [x] Expand toward screened records, starting with Bauan, then nearby markets.
      Report actual usable count and coverage gaps.

### Done — expanded to 12 records, and the single most important finding is negative

Researched on 2026-10-08 via listd.ph (Lamudi and MyProperty both return 403 to
automation; dotproperty has no Batangas lot pages). Added five records:

| id | Where | What | Asking | vs its street's BIR |
|---|---|---|---:|---:|
| `bauan-locloc-beach-hl` | Bauan, Locloc | beach H&L, 400 sqm, 100 sqm living | ₱11M | 30.6x vs all-other 900 — beachfront, house included |
| `tuy-toong-farm-1000` | Tuy, Toong | leisure/farm lot, 1000 sqm | ₱2M (2,000/sqm) | 3.33x vs ALL STREETS 600 |
| `san-juan-laiya-price-list` | San Juan, Laiya Ibabao | **8 exact developer units**, 264–380 sqm | ₱5.56M–10.85M | **0.84x–1.14x vs Playa Laiya beachfront 25,000** |
| `nasugbu-munting-indang-price-list` | Nasugbu | commercial 12,800/sqm + regular 8,300/sqm | developer list | 4.3x–8.3x vs rural CR/RR |
| `san-juan-beach-200` | San Juan | beach lot, 200 sqm | ₱8.51M (42,550/sqm) | 1.70x vs beachfront 25,000 |

**The finding that matters: a full listd.ph search for vacant lots in Bauan
returned ZERO results** — the page only offered "similar locations near Bauan". The
single Bauan record is the beachfront house and lot. The subject municipality
therefore has no land-only asking-price evidence at all, so **no multiplier can be
calibrated for Bauan from this dataset**. Recorded as `_coverageSummary` and pinned
by a test that fails if a Bauan vacant-lot record ever appears without review.

Second finding: the strongest new record — eight exact developer-priced beach lots
in Laiya — asks **at or below the Playa Laiya BIR beachfront rate** (0.84x–1.14x).
Even a beachfront developer project prices at its BIR rate, not far above it. That
undercuts any blanket "beachfront = many times BIR" assumption.

The 30–50 record target was not reached: the usable, street-matchable pool is far
smaller than that. 12 records total, of which two are developer price lists with
exact units and the rest are individual asks. Bauan coverage is zero for land. That
gap is the honest reason the land multiplier stays the Task 9 decision rather than
being resolved here.

### Done — developer projects near Bauan, tested against both models

2026-10-08. Source list: the Reignvest Realty portfolio site
(`virgilio-corlet-portfolio.webflow.io`), then each developer's own website.
Developer sites (Sta. Lucia, Ecoverde, Pueblo de Oro) confirm projects and specs but
publish **no prices** — every one says "Request Quotation" — so the price points come
from broker/developer asking figures. Catalina Lake Residences' official developer
is **Sta. Lucia Land Inc.** (`stalucialand.com.ph`), not a local builder; this
confirmed the project's real identity for the resolved BIR lookup.

Four projects have both a lot/floor area and a price, so both calculators ran on
them. Asking vs guide (1.174x) vs storefront (2.5x):

| Project | Asking | Guide | Storefront (2026.10.5 ramped) | Closer |
|---|---:|---:|---:|---|
| Catalina Lake (Bauan, 120sqm land) | ₱1,600,000 | ₱836,827 (−47.7%) | ₱1,662,240 (+3.9%) | **storefront** |
| Summit Point (Lipa, 350sqm land, membership incl.) | ₱9,350,000 | ₱1,627,164 (−82.6%) | ₱3,365,950 (−64.0%) | storefront (both low) |
| Paseo de Lipa LARISSA (100sqm + 90 floor, new) | ₱6,098,750 (unverified) | ₱2,047,356 (−66.4%) | ₱3,494,575 (−42.7%) | storefront |
| Bayanihan Town Sierra (44sqm + 38.5 floor, new) | ₱1,350,000 (from 1.2M) | ₱654,209 (−51.5%) | ₱1,067,344 (−20.9%) | storefront |

Storefront figures are under the finalized 2026.10.5 rate-ramped model. The
ramped model IMPROVED the Bauan-land case: Catalina went from +12.5% to +3.9% —
inside the guide's own ±15% planning range.

Property types were re-verified against the live listings on 2026-10-08: Catalina
and Summit Point are unambiguously **lot-only** ("Lot for Sale", per-sqm pricing,
no building); Paseo LARISSA and Bayanihan Sierra are unambiguously **house-and-lot**
(two-storey homes on their official sites). Two price caveats were added to the
records: Paseo's official site publishes no price and both prior corroborating
sources are now unavailable (CBDI 404, Businesses10 Cloudflare-blocked), so
₱6,098,750 is the top of an earlier-recorded range and is flagged unverified;
Bayanihan's official site says "starts from ₱1.2M", so ₱1.35M is the project
midpoint, not an exact unit quote.

The pattern is unambiguous and it is the first real-market signal the whole project
was missing: **the storefront's rate-ramped land multiplier lands within +3.9% to
−64% of every developer asking price, while the guide's 1.174x is 48%–83% below
them.** On the Bauan-specific record (Catalina) the storefront is +3.9% — inside the
guide's own ±15% planning range — and the guide is −47.7%.

Caveats, recorded with the numbers: all four are NEW developer/premium product
(so asking runs at or above the multiplier), two are house-and-lot (building cost
inflates the total toward the storefront's higher RCN), Summit Point's ₱9.35M
includes club membership, and Paseo's price is unverified. None is a completed
sale. But the direction is consistent across all four, which a single outlier could
not produce.

This does not prove 2.5 is correct — but it does shift the burden of proof. The
evidence the whole project lacked was "is 1.174 or 2.5 closer to real prices?" and
every developer asking price near Bauan answers: **2.5**. The guide's 1.174 remains
the reference-parity figure (it reproduces the LandValuePH report); it is not the
market figure.

## Task 7 — Benchmark candidate computations properly

New test: `tests/value_guide_market_benchmark_node.js`

Compare the fallback, the internal reference-style model, and any
evidence-supported candidate. Measure separately for vacant residential lots,
resale house-and-lot, and new developer packages.

Metrics: median absolute percentage error, median signed error (systematically high
or low), share within ±10% / ±20% / ±30%, sample count and results by locality and
property type, worst mismatches and their causes.

Keep evaluation properties separate from calibration properties. Never randomly
split duplicate advertisements of the same property across both sets.

**Promotion rule:** a candidate replaces the fallback only when it improves on
independent, matched cases. Insufficient evidence means the fallback stays and the
limitation is reported.

## Task 8 — Add evidence-supported computation where justified

Reuse the existing evidence-screening module before adding machinery.

With sufficient closely matched evidence, compute a clearly labelled
asking-market indication. For vacant land use matched land rates and subject lot
area. For houses use matched whole-property packages or a documented component
method. **Never add replacement building cost onto a whole house-and-lot comparable
price.** If evidence is missing or unsuitable, use the fallback.

Treat the current screening rules (minimum comparable count, date checks,
deduplication, property matching) as engineering rules, not market-accuracy
guarantees.

**Acceptance:** every result explains its method and sources. A network failure
cannot produce a fabricated comparable estimate.

## Task 9 — Rebuild the backend flow and detailed result

Files: `js/app.js`, `js/value_guide_flow.js`, `js/value_guide_pdf.js`

Backend flow: reference-equivalent valuation steps plus an optional Customer and
report details section for agents.

Result presentation, in order:

1. Market Guide Estimate
2. Planning range and calculation method
3. Property summary — Vacant Lot or House & Lot shown prominently
4. Land breakdown
5. Building breakdown, when applicable
6. Applied adjustments and unanswered questions
7. Market evidence and comparability explanations
8. BIR tax reference, clearly separate
9. Optional transaction-cost illustration
10. Professional-review next steps

HTML and PDF must show the same amounts, methods, sources and assumptions.

**Acceptance:** no old-model number survives in a secondary panel; skipped questions
never print as verified zero adjustments.

### Done — parity gaps closed and the result screen rebuilt

Four reference-parity gaps from Task 2 were closed:

1. **Street is optional.** `vgMissing()` no longer requires it. The form labels it
   "(Optional)" and a street-less parcel resolves to the barangay all-other-streets
   rate (already proven priceable in `value_guide_input_parity_node.js`).
2. **Sale-stage follow-up is Selling-only.** The four "where are you in the sale"
   options now render only when purpose is Selling, matching the reference's
   conditional follow-up.
3. **Classification defaults to Residential.** The draft now starts at `RR`,
   matching the reference's default.
4. **Terrain split into slope + elevation-vs-road.** The merged "Terrain and
   elevation" factor is gone. Two factors now price the reference's two -7%
   deductions independently: `terrain` (Level 0 / Sloping -700) and `elevation`
   (At road level 0 / Below road -700). A level lot below the road is no longer
   priced as flat. QUESTIONS went 9 -> 10, FACTORS 11 -> 12.

The result screen now shows the property type prominently ("House & lot" / "Vacant
lot") and a land vs building breakdown beneath the headline figure, so a reader can
see what the total is made of before opening the methodology. The PDF cover also
states the property type.

Asserted in `tests/value_guide_input_parity_node.js` (two new checks: the factors
are separate and both -700 bp, and ten questions each bound to a factor) and in the
browser `value_guide_internal_e2e.js` (ten skip affordances, twelve factor rows).
39/39 node suites green; internal, PDF-browser, purpose, simplify and estimator e2e
all pass. `app.min.js` rebuilt.

### Done — FINAL computation: rate-ramped residential band (2026.10.5)

The land multiplier is finalized as a **smooth rate ramp**, replacing the flat 2.5x.
The flat value stays for low-BIR land; as the street's BIR rate rises, the
multiplier descends linearly to a floor at 25,000/sqm:

| BIR rate/sqm | Multiplier |
|---|---:|
| <= 2,000 | 2.5 (unchanged) |
| 2,000 – 25,000 | linear descent 2.5 -> 1.4 |
| >= 25,000 | 1.4 (floor) |

Applied to residential only; commercial/agricultural/industrial keep their flat
bands. `data/zonal-config.json` carries the ramp as `marketBand.rateRamp` with the
evidence note; `js/estimator.js` applies it via `rampBandMid()`.

**Why this is the final form:**

1. **The gathered evidence brackets the descent.** Catalina (6,000/sqm) asks 2.22x
   its street rate; Playa Laiya (25,000/sqm) asks 0.84x-1.70x. A flat 2.5x misses
   both - it overprices beachfront by charging the location premium twice.
2. **The reverse-engineered LandValuePH code confirms it.** Their own published
   Rural residential band is 1.5x-2.5x (see
   `docs/reference/landvalueph-reverse-engineering.md`); our 2.5x floor-to-top
   matches, and the descent lands inside their range.
3. **It is a ramp, not tiers.** No price cliffs at arbitrary boundaries; a 1/sqm
   change in BIR rate moves the multiplier continuously.
4. **It improves the one Bauan land record.** Catalina went from +12.5% (flat) to
   +3.9% (ramped) against the asking price.

**Effect on the reference property (Binay St, 11,500/sqm):** multiplier 2.0457x ->
land 100 x 11,500 x 2.0457 = **2,352,500**, total with building 4,752,500. This
sits between the LandValuePH detailed report (2.89M) and the old flat storefront
(5.28M), and matches the report's own "market 23,000/sqm" claim (23,525/sqm).

**What the ramp does NOT claim:** it is directional, not calibrated - six land
records cannot fit a curve. The numbers will sharpen as more records accumulate;
the disclosure states this. The guide's 1.174x remains the reference-parity model
and is unchanged.

### Reverse engineering recorded

`docs/reference/landvalueph-reverse-engineering.md` records the extracted client
chunks, their multiplier table, the LVIS blend weights, the city-median data (no
Bauan row), and the boundary (their detailed-report engine is server-side and was
not probed).

## Task 10 — Backend release gate

```powershell
node tests/estimator_core_node.js
node tests/estimator_math_node.js
node tests/value_guide_flow_node.js
node tests/value_guide_inputs_node.js
node tests/value_guide_pdf_node.js
node tests/market_benchmarks_node.js
node tests/generator_config_sync_node.js

node build_app.js
node build_app.js --check

powershell -ExecutionPolicy Bypass -File tests/run_all.ps1 -Test value_guide_internal_e2e
powershell -ExecutionPolicy Bypass -File tests/run_all.ps1 -Test value_guide_pdf_browser_e2e
```

(The plan originally named `value_guide_market_benchmark_node.js`; the benchmark
suite became `market_benchmarks_node.js` during Tasks 5-6, and the generator/data
sync guard from the Tasks 1-5 audit is included.)

### Done — gate run clean

All gate commands pass:

- 39/39 node suites green (includes the five named above, plus
  `market_benchmarks_node.js` and `generator_config_sync_node.js`).
- `build_app.js` rebuilds and `--check` reports the bundle in sync
  (hash `9fa11c25409534a1`).
- `value_guide_internal_e2e` and `value_guide_pdf_browser_e2e` both pass.

Two checklist items were missing and are now covered:

- **Identical HTML/PDF totals.** `value_guide_pdf_browser_e2e.js` captures the
  on-screen headline total and asserts the PDF text contains the same digits. This
  is the class of bug the project has hit before (`r.value` vs `r.total`), so it is
  now a tripwire.
- **Editing inputs after calculating.** `value_guide_internal_e2e.js` now clicks
  Edit inputs, doubles the lot area, recalculates, and requires the total to move
  while the draft survives the round trip.

The other checklist items (each input reaching its calculation, all "Not sure"
answers, boundary/invalid inputs, vacant vs built, floor area across storeys,
evidence quality) were already asserted across `value_guide_questions_node.js`,
`value_guide_inputs_node.js`, `value_guide_flow_node.js` and the e2e suites.

Backend verification is complete. Frontend work (Plan B) may start after the user's
review.

---

# Plan B — Frontend Value Guide and Professional Inquiry

## Task 11 — Share the completed guide across both hosts

Recommended module: `js/value_guide_ui.js`

```js
mountGuide(container, { mode: "agent" | "public" })
```

Agent mode permits customer/report metadata. Public mode exposes only the
reference-equivalent valuation inputs. Both call the same calculation contract.

Replace `ESREALTY_EST.cardSection()` in `js/storefront.js` after the backend gate.

### Done — `js/value_guide_ui.js` with `mountGuide(container, { mode })`

The shared entry point exists and both hosts route through it:

- `publicMarkup()` returns the estimator card contract (`data-est-root` /
  `data-est-card`) that the estimator's auto-mount binds to. `storefront.js`
  home() now calls `ESREALTY_GUIDE_UI.publicMarkup()` instead of reaching into
  `ESREALTY_EST.cardSection()` directly (which remains as the fallback path).
- `agentMarkup()` delegates to `window.ESREALTY_APP_GUIDE.render`
  (`renderValueGuide` in `js/app.js`, now exposed), falling back to the public
  card when the app renderer is absent, and saying "unavailable" when the
  estimator itself is missing.
- `mountGuide(container, { mode })` renders into a live container and triggers
  the estimator mount for post-DOMContentLoaded routing.

Both modes read the same estimator reference data and calculation contract
(pinned by `tests/value_guide_contract_node.js`). No calculation was duplicated.

Verified: 40/40 node suites (incl. new `tests/value_guide_ui_node.js`),
estimator / storefront-routing / internal e2e green, bundle rebuilt and in sync
(hash `5fe8a98cb0af2bee`).

## Task 12 — Improve the public design

- Three steps: Location -> Property Details -> Your Result, subject to the verified
  reference progression.
- Large answer tiles, searchable location fields.
- Plain-language explanations beside unfamiliar property terms.
- Visible "Not sure" options.
- Conditional building fields only for House & Lot.
- Useful defaults that never silently answer unknown property conditions.
- Preserve entered values when navigating back.
- Result-first layout: estimate, range, property type, evidence basis, then detail.
- Site's own colours, typography and wording. Keyboard access, visible focus, proper
  labels, readable contrast, usable 390px mobile.

No account or contact details required to see the estimate.

## Task 13 — Add appraiser and broker inquiry paths

Reuse the existing contact infrastructure in `js/listings-api.js`,
`js/storefront.js`, `supabase/functions/listing-api/index.ts`, and existing
notification/dispatch handlers.

| Action | Customer intent |
|---|---|
| Request a licensed appraiser | Formal valuation, financing, or a documented appraisal assignment. |
| Talk to a licensed broker | Selling, buying, pricing discussion, or marketing assistance. |

Ask only after the user chooses an action: name; preferred contact method and
matching detail; optional message; consent. Attach the selected service,
normalized property details, calculation version and result snapshot.

**Acceptance:** correct service classification; one submission per request, retries
do not duplicate leads; clear pending, success and failure states; "Request
received" is never presented as "professional assigned" or "email delivered";
submitted customer information never becomes a pricing input.

## Task 14 — Frontend parity and conversion verification

Verify: same inputs produce the same backend/frontend amounts; public inputs match
the verified reference inventory; both inquiry paths work; the correct property
summary reaches the request; results stay visible after submission; mobile,
keyboard and screen-reader basics work; existing purpose, disclosure, tax,
report-delivery and privacy tests remain meaningful.

Rewrite rather than delete the coverage in `value_guide_purpose_e2e.js`,
`value_guide_simplify_e2e.js` and `estimator_delivery_e2e.js`.

Finish with a rebuilt bundle, cache-version update and full regression run. Report
any remaining pre-existing failure by name.

---

## Five highest-priority review cases

1. A vacant lot must never inherit a building value.
2. Total floor area must not be multiplied by storeys a second time unintentionally.
3. A developer package must not receive a second building-cost addition.
4. Unknown property conditions must remain unknown.
5. A failed or duplicated inquiry must not create misleading confirmation or
   duplicate contacts.

## Execution order

Baseline -> exact input verification -> shared calculation -> evidence research ->
benchmarks -> backend flow/result/PDF -> **backend approval** -> frontend port ->
appraiser/broker inquiries -> final verification.

## Open question: which figure is the public default?

**RESOLVED on 2026-10-08 — the rate-ramped band (2026.10.5) is the finalized
computation.** The earlier dilemma (flat 2.5 vs 1.174) is settled by the evidence
gathered in Tasks 6-9 and by reverse-engineering LandValuePH's own published code:

- The storefront now applies a smooth rate ramp: 2.5x at BIR <= 2,000/sqm
  descending linearly to a 1.4x floor at 25,000/sqm, residential only.
- It is validated three ways: the gathered records (Catalina +3.9% vs its asking
  price, inside the guide's own +-15% range), the 4-developer-project test
  (storefront closest in all four), and LandValuePH's published Rural band of
  1.5x-2.5x (see docs/reference/landvalueph-reverse-engineering.md).
- The guide's 1.174x remains the reference-parity model (it reproduces the
  purchased report) and is unchanged.

The remaining design question for Plan B is no longer "which number" but how the
public surface presents the ramp honestly: the estimate, its disclosed multiplier,
the BIR reference, and the researched asking evidence beside it.

## Plan B status (2026-10-08)

Task 11 in progress: shared `js/value_guide_ui.js` with `mountGuide(container,
{ mode })`, replacing the old `ESREALTY_EST.cardSection()` mount on the storefront.