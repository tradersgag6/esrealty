# Batangas Value Guide Sources

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
- Currency check (2026-09-30): DO 035-2022 (eff. 2022-07-23) and DO 034-2022
  (eff. 2022-07-10) remain the latest published schedules for RDO 58 and RDO 59.
  Under RA 12001 (Real Property Valuation and Assessment Reform Act, Sec. 31) the
  BIR zonal values stay in force until an LGU-approved Schedule of Market Values
  replaces them, so the imported effectivity dates are not stale.
- Review rule: verify that no newer Department Order supersedes the imported
  schedule before publishing a result. A published guide must cite the order for
  the RDO of the subject municipality, not a single blended citation.
- Correcting an earlier error: this file previously attributed DO 035-2022 to both
  RDOs and cited RA 12000. The BIR importer manifest is the per-RDO source of
  truth, and RA 12001 carries the short title "Real Property Valuation and
  Assessment Reform Act".

## Market guide factors

The current guide uses ES Realty-approved factors. The BIR reference remains separately identified; the factor-based estimate is a planning guide with the assumptions shown in the result.

- Residential, commercial, agricultural, and industrial proxy factors are stored in `data/zonal-config.json`.
- Market-band midpoints are stored in `data/zonal-config.json`.
- The factor calculation is available with or without comparable listings. When no usable listings are found, the result is labelled as factor-based with no comparable listing context.
- Comparable asking-listing prices are summarized as context; their prices do not directly change the factor calculation.
- Changes require super-admin approval in the Brokerage > Value Guide panel.
- Approved changes are versioned and exposed to the public estimator through sanitized site settings.

## Validation status

- Factor weights and market-band midpoints are ES Realty internal assumptions. They have not yet been
  reviewed by an independent qualified appraiser.
- Because of that, public wording stays neutral: "factor-based guide", with the BIR reference shown
  separately and assumptions disclosed in the result.
- Do not add PVS-compliance, "evaluation standards", certified-accuracy, or value-loss claims to
  public copy until a reviewer signs off on the factor model.
- Re-review the factors after any change to `data/zonal-config.json` market bands or proxies.

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

- The result is a flat `BIR x 2.5` constant. The published "Market Adjustment" line is only the
  arithmetic difference, and the "LVIS blend 70% / regional formula 30%" wording resolves to a
  fixed 2.5 with no disclosed per-property inputs.
- 2.5 is the ceiling of their own stated 1.5x-2.5x band, applied uniformly to every property. There is
  no shape, corner, access, or title sensitivity in their output.
- Their five cited comparables average 11,830/sqm (about 2% above the subject's own zonal value).
  Applying that mean to the same lot gives 1,183,000, so their FMV is 2.43x their own comparable
  average. The comparables are displayed as context and are not calculation inputs.
- Their selling-cost table does not reconcile: the stated rates sum to 8.15% (234,312.50) but the
  reported total is 8.1% (232,875).

Why we keep our own model:

- Our residential band midpoint is already 2.5 with a 1.8-3.2 band, so plain residential lots already
  land on the same midpoint inside a comparable range. The difference is structural, not numeric.
- Ours is multiplicative and property-aware (`base x corner x proxy x band x regional`); a constant
  would apply a top-of-band premium to landlocked, irregular, or flood-prone lots.
- Matching the constant would import defects and would undercut the neutral, assumption-disclosing
  wording above.

Legal note: a multiplier and a method of computation are not copyrightable subject matter under
IP Code Sec. 175 and *BJ Productions v. Vitarte* (G.R. 108946), which excludes "any idea, procedure,
system, method or operation... or mere data as such." Replicating a constant was legally available;
it was rejected on accuracy grounds. Their source code, curated dataset, report layout, and wording
remain protected and are not copied here.

## Comparable evidence

Comparable priority is:

1. ES Realty public Batangas listings with sale price and lot area.
2. External market-scan listings when internal records are unavailable.
3. No comparable evidence when neither source provides usable dimensions and price.

The system stores source, URL, retrieval date, municipality, barangay, property type, asking price, lot area, and price per lot sqm. Public listings are asking-price context unless a record is explicitly marked as an ES Realty transaction; current estimator calculations do not use these prices as direct numeric inputs.

The current `data/batangas-projects.json` file is not used as a comparable source because its project records do not consistently include lot area or floor area.

## Construction cost

Current rates are provisional ES Realty assumptions:

- Wood / pre-fab: PHP 16,000/sqm
- Mixed / CHB: PHP 25,000/sqm
- Reinforced concrete / steel: PHP 32,000/sqm

The current internal appraisal RCN table labels these 2026 Philippine mid-range values. The owner's preliminary target range is PHP 25,000-35,000/sqm by finish level; the production values remain provisional until the source scope is validated.

Required evidence before changing the rates:

- Current Batangas contractor quotations
- ES Realty project cost records
- DPWH standard cost references
- PSA construction-cost statistics
- Quantity-surveyor or cost-engineer review

Each adopted rate must record finish level, inclusions, exclusions, location, source, source date, and admin approval.

## External search boundary

The estimator may call the configured market-scan service only after internal listing search returns no records. A timeout or unavailable service returns no comparable evidence and leaves the approved-factor estimate unchanged. The browser never scrapes property sites directly.
