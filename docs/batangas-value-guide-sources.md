# Batangas Value Guide Sources

## BIR land reference

- Coverage: Batangas RDO 58 and RDO 59
- Imported schedule effectivity: 2022-07-23
- Data version: `bir-2022-rdo58-59`
- Source files and URLs: `data/bir-batangas/manifest.json`
- Review rule: verify that no newer Department Order supersedes the imported schedule before publishing a result.

## Market guide factors

The current market guide uses ES Realty-approved factors. These are internal assumptions, not official BIR values and not a certified appraisal.

- Residential, commercial, agricultural, and industrial proxy factors are stored in `data/zonal-config.json`.
- Market-band midpoints are stored in `data/zonal-config.json`.
- Without usable comparable evidence, the market land guide is capped at 2.5x the BIR rate.
- Changes require super-admin approval in the Brokerage > Value Guide panel.
- Approved changes are versioned and exposed to the public estimator through sanitized site settings.

## Comparable evidence

Comparable priority is:

1. ES Realty public Batangas listings with sale price and lot area.
2. External market-scan listings when internal records are unavailable.
3. No comparable evidence when neither source provides usable dimensions and price.

The system stores source, URL, retrieval date, municipality, barangay, property type, asking price, lot area, and price per lot sqm. Public listings are asking-price evidence unless a record is explicitly marked as an ES Realty transaction.

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
