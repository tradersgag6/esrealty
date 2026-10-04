# SEA ESTATES — evidence-led Value Guide and purpose outputs

Implemented after the owner's “start”, following the calculator audit and public-project research. Owner decisions: asking listings only, one underlying property guide with tailored Buying/Selling outputs, and evidence-led risk treatment. Local implementation; no deployment or commit.

Review [Home calculator](http://127.0.0.1:8931/index.html#/home).

## Delivered

- **Formula version 2026.10.2.** The original land factors and 85%–130% planning scenarios remain explicit, uncalibrated assumptions. Fractional floor areas are preserved and depreciation uses the precise age/life ratio rather than rounding before calculation.
- Unsupported automatic title/occupancy/inheritance discounts are removed from the neutral planning figure. Their historical scenario is retained in result metadata, marked not applied. Known risks prevent borrowing an ordinary-property asking indication; conditions and recorded site flags remain explicit.
- Buying shows acquisition budget; Selling shows seller proceeds; received offers are compared with the guide. The same property facts retain the same underlying value. Estate and Loan receive scope-appropriate scenario/financing limitations.
- Developer/ordinary-asset or unclassified transactions require quotation information. No blanket 6% CGT or extra transfer charges are invented. Entered developer charges are treated as outside-price totals; charges already included in price/payment schedule must not be entered twice.
- Optional commission, notarial quote and assessor schedule FMV fields are available. Existing default private-resale allocation is stated; negotiated allocation is supported by the shared finance contract.
- Street edits invalidate stale selected keys. Negative prices are rejected rather than silently becoming blank. Invalid costs reveal their disclosure and receive focus. Invalid core categories/areas/features fail explicitly; duplicate features are charged once.
- Public/internal area constraints now agree. Internal review includes floor area, transaction and ownership answers; the corner label preserves 2.5%, and internal explanatory copy reflects the evidence-led policy.
- Municipal/province medians are labelled derived references, not confirmed parcel tax floors. They are excluded from confirmed tax-base inputs. Province-aggregate schedule wording identifies both RDOs.
- Formula version and factor-setting version remain separate, with active factor identity carried in the public report snapshot.

## Asking evidence model

`js/value_guide_evidence.js` normalizes every record, including catalog `lot_area_sqm` and external rows with existing `pricePerSqm`. Rates are recomputed from actual price/area; truthy rate fields cannot bypass validation. Even-count medians use both middle observations.

The **provisional engineering screen** requires at least three distinct identified listings with source links, a matching barangay/locality, property/use segment, developer/resale context and corner status, price dates within 180 days, and lot-area similarity of 0.5–2 times the subject. Houses also require appropriate built-up-area definitions, similarity and matching condition. These are initial screening rules, not PVS-prescribed thresholds or measured accuracy guarantees.

- Vacant land indication: median eligible asking rate × subject lot area.
- House-and-lot indication: median eligible whole-property package prices; no building allowance is added again.
- Observed low/high asking spread is separate from the factor guide's 85%–130% scenario range. Wide spread is flagged, not silently trimmed.
- Duplicate identities, ranges, starting prices, synthetic benchmarks, membership-inclusive amounts, missing dates and unresolved conflicts cannot create a numerical indication.
- A transaction source label alone does not verify an achieved sale. Explicitly documented sale records remain separate from asking evidence.
- Rejection reasons, source retrieval status, timeouts and unavailable searches are disclosed. A weak catalog record does not suppress external discovery.

The **primary factor-based guide remains independent of asking prices**. The asking indication is a separately labelled decision aid—not a blend claiming calibrated market value. Achieved-sale accuracy is not established by these tests or by advertised prices.

## Public project-source register

`data/value-guide-project-evidence.json` contains **17 context-only records**, observed 2026-10-03. Specifications, price ranges, advertised parcels and conflicts are separate. Retrieval/page dates are not treated as price-effective dates.

Sources include:

- [Ecoverde Sahaia](https://ecoverdehomes.com/sahaia/) and [Ecoverde Lipa](https://ecoverdehomes.com/lipa/): gross floor specifications, no model-linked current TCP.
- [Vermira / Keyland](https://keyland.com.ph/properties/vermira/): Mirela/Mireio/Mira dimensions; unit prices and exact locality remain unconfirmed.
- [Westwoods Heights](https://pueblodeoro.com/projects/westwoods-heights/): Ivy/Lilac specifications.
- [Courtyards Lily](https://pueblodeoro.com/projects/lily/) and [Lipa location page](https://pueblodeoro.com/locations/lipa-batangas/): contradictory floor/lot figures held for clarification.
- [Madeira](https://www.paseodelipa.com.ph/madeira/) and [Estella](https://www.paseodelipa.com.ph/estella/): official model-price ranges, not exact-unit quotations.
- [Bayanihan Sierra](https://bayanihantownbatangas.com/house-models/): broker starting-price/minimum-area record.
- [Summit B38/L13](https://www.dotproperty.com.ph/ads/land-for-sale-in-plaridel-batangas_0b122bdb77df-3fb0-7292-1744-8b749f89): 350 sqm / PHP 9.35M gross including shares, undated and not numerically eligible.
- [Catalina FS131](https://www.dotproperty.com.ph/ads/land-for-sale-in-san-teodoro-batangas_167ca9c66f5b-f46f-2b32-a23a-77541089): 120 sqm, PHP 1.6M versus PHP 13,500/sqm conflict; physical identity/location/date unresolved.

The legacy Paseo record was corrected to the CBDI township/house-and-lot identity. Unverified coordinates/barangay were removed. Its project-level model range is explicitly not a unit valuation comparable. The [CBDI buyer guide](https://www.cbdi.com.ph/buyers-guide/) fee bundle is recorded as general policy, not a unit quote or an extra charge to stack on included taxes.

**None of these researched records currently qualifies for numerical market use.** The UI exposes useful specifications, source links, unknown prices and conflicts without manufacturing unit prices or replacement-cost rates from package prices.

## Report parity

The public report source sanitizes the new context, cost options and asking-indication fields, keeps client-supplied status, uses shared developer/resale finance logic and reports buyer budget. Internal PDF supports developer quotations without rendering invented taxes/proceeds, shows purpose-specific budget/proceeds, and labels derived references honestly. Existing local-download role/privacy boundaries remain covered.

Public email/PDF source remains **undeployed**. Its shared finance dependency must be published with it; no hosted report or email delivery is claimed as updated or verified.

## Actual verification

| Check | Result |
| --- | --- |
| Input-sensitivity suite | **28/28 checks**, including all **80 supported ownership combinations** |
| Purpose UI suite | **17/17** desktop and mobile; buyer/seller/developer/estate/loan, stale street and negative/hidden-input validation |
| Existing math core | **82 checks passed** |
| Dataset/math sweep | **174 checks passed**, 34 municipalities and 1,085 sampled computations |
| Independent Bauan/public-PDF fixture | **18 checks passed**; actual TypeScript renderer and text geometry |
| First full run | **94/97**, [full-suite.log](full-suite.log); map tiles 7/24, old ownership expectation and derived-tax-floor expectation |
| Second full run | **96/97**, [full-suite-recheck.log](full-suite-recheck.log); internal light-theme contrast assertion failed, then passed isolated |
| Final full run | **97/97 passed**, [full-suite-final.log](full-suite-final.log) |
| Visual review | **33/33 checks**, [review-results.json](review-results.json), 320/390/768/1440px |
| Captures | **16 screenshots**; representative buying/selling/developer/project-source images inspected |
| Overflow sweep | **10/10 widths passed** |
| Mobile readability/content/type | Passed |
| PDF content/adversarial/browser/privacy | Passed in final full run; adversarial input now uses the actual 100,000 sqm supported bound |
| Build sync and whitespace | Passed; app bundle rebuilt from source |

The new tests distinguish intentional invariances from real sensitivity. They cover price-vs-value separation, tax-floor plateaus, precise areas/depreciation, per-feature deduplication, unsupported inputs, eligible/insufficient asking evidence, synthetic/range rejection, known risks and no double-counting buildings/fees. Numerical asking fixtures are test data, not fabricated production sales.

The generic usability scan skips deliberately closed native disclosures; the purpose suite opens optional costs and verifies their usable dimensions/focus. No assertions were relaxed to certify market accuracy.

## Reproduce

```text
node tests/value_guide_inputs_node.js
powershell -NoProfile -ExecutionPolicy Bypass -File tests/run_all.ps1 -Test value_guide_purpose_e2e -Mobile
node tools/review_sea_market_guide.js
node tools/review_sea_market_guide.js --suite
```

App/worker servers must run on 8931/8932 for the full/browser checks. Service-worker version is **v9**, precaching the evidence module. CI includes purpose tests at desktop/mobile; remote CI has not been executed.

Model recommendation: **GPT-6.1 Sol / medium**. Last owner-reported API spend remains **USD 45**; later charges and PHP conversion are unknown. No cost or remaining-budget amount is invented. No commit, push or deployment.
