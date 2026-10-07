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
- [ ] Run the browser suite and record individual failures, separating existing
      failures from regressions.
- [ ] Check that async tests await their assertions and report meaningful counts.
- [ ] Save the baseline results during execution.

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
- [ ] Expand toward 30–50 screened records, starting with Bauan, then nearby
      markets. Report actual usable count and coverage gaps.

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

## Task 10 — Backend release gate

```powershell
node tests/estimator_core_node.js
node tests/estimator_math_node.js
node tests/value_guide_flow_node.js
node tests/value_guide_inputs_node.js
node tests/value_guide_pdf_node.js
node tests/value_guide_market_benchmark_node.js

node build_app.js
node build_app.js --check

powershell -ExecutionPolicy Bypass -File tests/run_all.ps1 -Test value_guide_internal_e2e
powershell -ExecutionPolicy Bypass -File tests/run_all.ps1 -Test value_guide_pdf_browser_e2e
```

Coverage to add: each reference input reaching its intended calculation; all
"Not sure" answers; boundary and invalid numeric inputs; vacant vs built; floor
area across storeys; duplicate, stale, incomplete and mismatched evidence; editing
inputs after calculating; calculate/reset behaviour; identical HTML/PDF totals.

Frontend work starts only after backend verification and the user's review.

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

Unresolved. The user's earlier instructions point both ways on the one property we
can test:

- The reference report matches the internal 1.174 guide to within 0.23%.
- The flat storefront computation is 86.9% above it, and is what the user has
  twice said they prefer.

We cannot say which is closer to what this house would actually sell for. We have
one Bauan lot, zero Bauan comparables, and the reference report itself admits it has
none.

Options:

- **Keep flat 2.5 as default.** Matches the stated preference and the old data; the
  1.174 guide stays the internal benchmark. The storefront reads ~87% above the
  reference report.
- **Switch to 1.174.** Matches the reference report closely; loses the uplift, with
  no Batangas evidence that 1.174 is right either.
- **Show both.** The public sees the flat figure with the guide figure and BIR base
  as disclosed context, so the spread is visible instead of one number being
  trusted.

Current lean: the third option, since it stops the guide implying a precision none
of these inputs support. Needs the user's decision before Task 9.