# Batangas Value Guide Sources

## Reference verification and indexing — 2026.10.3

Read `docs/sea-reference-indexing/README.md` and `data/government-reference-register.json`. Published 2022 BIR values are unchanged; current legal applicability/latest revision remain unverified. Dataset generated 2026-09-22 is not a newly effective 2026 schedule or an established import date. Last verification attempt is 2026-10-03, not a successful check. Proposed SMVs, including Lipa 2028–2030, are not active replacements. Optional land-only indexing is a separately named scenario with explicit dates/rate, no automatic growth or stacked market/corner factors, and no official tax-reference substitution. Buildings remain separate.

## Current implementation — 2026.10.2

See `docs/sea-market-guide/README.md` and `data/value-guide-project-evidence.json`. The neutral factor-based planning figure has no unsupported flat ownership deductions; risk/site answers are recorded conditions. Fractional floor area and exact age/life depreciation are retained. A separately labelled asking indication requires qualified evidence; researched project specifications/ranges are context-only, not completed sales. The new asking screen is provisional, not a PVS-prescribed accuracy threshold. Derived municipality/province medians are not confirmed parcel tax-floor inputs. Buying and Selling share the same property figure but show different party costs; developer purchases require quotation-specific treatment. Final implementation regression: 97/97 suites passed.

## BIR land reference

- Coverage: Batangas RDO 58 and RDO 59. The two RDOs are covered by **separate**
  Department Orders with different effectivity dates — do not merge them into a
  single citation:

  | RDO | Department Order | Revision | Effectivity | Scope |
  | --- | --- | --- | --- | --- |
  | RDO 058 | DO 035-2022 | 4th | 2022-07-23 | Batangas City, West Batangas |
  | RDO 059 | DO 034-2022 | 5th | 2022-07-10 | Lipa City, East Batangas |

- Data version: `bir-2022-rdo58-59`
- Per-RDO source files, URLs and row counts: `data/bir-batangas/manifest.json`
- Governing orders: DO 60-2018 (3rd revision, 2018-12-21) as revised by DO 035-2022
  (RDO 58) and DO 034-2022 (RDO 59).
- The previous 2026-09-30 “latest” assertion was not independently substantiated.
   Read-only verification attempted 2026-10-03 encountered dynamic-page/API access
   limitations; latest BIR revisions and effective SMV replacements remain unknown.
   A 2022 date alone neither establishes expiry nor current applicability. Verify
   locality-specific certification, publication/effectivity and transition treatment.
- Review rule: verify that no newer Department Order supersedes the imported
  schedule before publishing a result. A published guide must cite the order for
  the RDO of the subject municipality, not a single blended citation.
- Correcting an earlier error: this file previously attributed DO 035-2022 to both
  RDOs and cited RA 12000. The BIR importer manifest is the per-RDO source of
  truth, and RA 12001 carries the short title
  "Real Property Valuation and Assessment Reform Act".

## Market guide factors

The current guide uses SEA ESTATES-approved factors. The BIR reference remains separately identified; the factor-based estimate is a planning guide with the assumptions shown in the result.

- Residential, commercial, agricultural, and industrial proxy factors are stored in `data/zonal-config.json`.
- Market-band midpoints are stored in `data/zonal-config.json`.
- The factor calculation is available with or without comparable listings. When no usable listings are found, the result is labelled as factor-based with no comparable listing context.
- Comparable asking-listing prices are summarized as context; their prices do not directly change the factor calculation.
- Changes require super-admin approval in the Brokerage > Value Guide panel.
- Approved changes are versioned and exposed to the public estimator through sanitized site settings.

## Validation status

- Factor weights and market-band midpoints are SEA ESTATES internal assumptions. They have not yet been
  reviewed by an independent qualified appraiser.
- Because of that, public wording stays neutral: "factor-based guide", with the BIR reference shown
  separately and assumptions disclosed in the result.
- Do not add PVS-compliance, "evaluation standards", certified-accuracy, or value-loss claims to
  public copy until a reviewer signs off on the factor model.
- Re-review the factors after any change to `data/zonal-config.json` market bands or proxies.
- The calculator now publishes the applied multiple alongside the BIR reference, as a disclosed
  SEA ESTATES market band factor. It is derived from the factor stack the estimate already
  applies — `(1 + cornerPct) x proxy x band x regionalAdj` — and not hardcoded, so it changes
  with `data/zonal-config.json` and with the corner answer, and it is `null` (disclosed
  nothing) in time-indexed mode where no factor stack runs. Because the multiple is the same
  unreviewed planning assumption described above, it is published with the assumption and the
  limitation attached, not as a validated ratio. The accuracy-language rule above — no
  PVS-compliance, certified-accuracy or value-loss language in public copy — is enforced as a
  test in `tests/value_guide_multiple_node.js`, which fails if any banned accuracy term appears
  in the disclosure strings.

## LandValuePH comparison (reviewed 2026-09-30)

A paid LandValuePH report was reviewed to compare methods. Decision: keep the ES Realty factor
model and do not replicate the competitor constant.

Verified LandValuePH computation, from report LVPH-EC33B069 (Bauan, BINAY ST, 100 sqm residential,
BIR 11,500/sqm):

| Step | Value |
| --- | --- |
| Base (`11,500 x 100`) | 1,150,000 |
| FMV | 2,875,000 |
| Ratio | **exactly 2.5x** |
| Low (`x 0.85`) | 2,443,750 |
| High (`x 1.30`) | 3,737,500 |
| Per sqm (`2,875,000 / 100`) | 28,750 |

Findings:

- This single example has an observed `BIR x 2.5` relationship. It does not establish a
  universal competitor formula. The claimed 70% LVIS / 30% regional blend has undisclosed inputs.
- The PDF says no comparable listings are available, but also displays nearby zonal-base
  examples without record-level attribution. Those figures do not establish comparable sales.
- The rates reconcile: `6% + 1.5% + 0.5% + 0.1% = 8.1%`; the four amounts total PHP 232,875.
  PHP 2,642,125 subtracts all four transaction costs, excluding broker and notarial fees.
  That is distinct from seller proceeds using buyer-paid DST/transfer/registration.

Why we keep our own model:

- The disclosed residential factors already produce the same central example. Other use groups,
  buildings, corner and ownership adjustments retain their own disclosed assumptions.
- From calculation version **2026.10.1**, the owner-approved range is **85%-130% of the central
  estimate**, explicitly a planning scenario envelope. Match quality is reported separately.
- Access, flood and site notes remain non-monetary review flags; no site inspection is implied.
- The PDF is an arithmetic/organization reference. Implementation and customer wording are
  original; no undisclosed LVIS blend or licensed-appraisal/PVS-compliance claim is made.

## Comparable evidence

Comparable priority is:

1. SEA ESTATES public Batangas listings with sale price and lot area.
2. External market-scan listings when internal records are unavailable.
3. No comparable evidence when neither source provides usable dimensions and price.

The system stores source, URL, retrieval date, municipality, barangay, property type, asking price, lot area, and price per lot sqm. Public listings are asking-price context unless a record is explicitly marked as a SEA ESTATES transaction (or the compatible historical ES Realty transaction label); current estimator calculations do not use these prices as direct numeric inputs.

The current `data/batangas-projects.json` file is not used as a comparable source because its project records do not consistently include lot area or floor area.

## Construction cost

Current rates are provisional SEA ESTATES assumptions:

- Wood / pre-fab: PHP 16,000/sqm
- Mixed / CHB: PHP 25,000/sqm
- Reinforced concrete / steel: PHP 32,000/sqm

The current internal appraisal RCN table labels these 2026 Philippine mid-range values. The owner's preliminary target range is PHP 25,000-35,000/sqm by finish level; the production values remain provisional until the source scope is validated.

Required evidence before changing the rates:

- Current Batangas contractor quotations
- SEA ESTATES project cost records
- DPWH standard cost references
- PSA construction-cost statistics
- Quantity-surveyor or cost-engineer review

Each adopted rate must record finish level, inclusions, exclusions, location, source, source date, and admin approval.

## External search boundary

The estimator may call the configured market-scan service only after internal listing search returns no records. A timeout or unavailable service returns no comparable evidence and leaves the approved-factor estimate unchanged. The browser never scrapes property sites directly.
