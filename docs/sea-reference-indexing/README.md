# SEA ESTATES — government verification and optional land indexing

Implemented after approval of the recommended next batch: government-reference status first, then both evidence-backed and optional manual **land-only** time scenarios. No actual official rates were changed, no approval status invented, and no office requests or deployment performed.

Review [Home calculator](http://127.0.0.1:8931/index.html#/home).

## Government-reference register

`data/government-reference-register.json` separates:

- Schedule effectivity (RDO 58: 2022-07-23; RDO 59: 2022-07-10).
- Dataset generation (2026-09-22T02:28:48.536Z).
- Actual import/download date: **not established separately**.
- Verification attempt: **2026-10-03**.
- Successful applicability verification: **not verified**.

Both imported BIR records are **applicability-unverified**. Source URLs, recorded revisions, attempt outcomes and official confirmation contacts are retained. The previous 2026-09-30 “latest” assertion is identified as unsubstantiated rather than repeated as a successful check.

Related schedules are separately scoped:

- [Lipa PDF](https://lipa.gov.ph/wp-content/uploads/2026/04/SMV.pdf): explicitly **proposed for 2028–2030**, not an active 2026 replacement.
- [Batangas City proposed SMV](https://www.batangascity.gov.ph/web/images/Offices/ASSESSOR/revised-proposed-smv-publish.pdf): proposal posting verified; final certification/effectivity unverified.
- Provincial schedule for component municipalities: **not obtained**; absence online does not establish nonexistence/nonapproval.

The register includes Provincial Assessor and BLGF contact sources and requirements for certification, publication/effectivity and import identity reconciliation. It stores no proposal rates as active inputs. City references are not mixed with provincial municipal scope.

`js/value_guide_reference.js` requires successful-check, certification, publication, import-identity and valid effectivity evidence before a supplied record can receive an effective-verified status. A future certified effective date remains approved-not-effective for an earlier target date. This local metadata gate is not a substitute for authenticating documents; current production records pass no such verified gate.

Public/internal UI and reports now display status and separate dates. An imported row match does not establish latest legal applicability. The legacy `birReferenceConfirmed` field denotes matching in the imported table, not independently confirmed legal currency. Matched imported values remain **provisional tax-scenario references**; time-indexed values never replace them, and derived locality medians remain excluded from confirmed parcel tax inputs.

## Optional time scenario — formula 2026.10.3

The default remains the existing factor-based guide. Users may explicitly choose **Indexed land-reference scenario**, with an annual increase/decrease, base date and target date.

```text
elapsed years = elapsed UTC days / 365.2425
time factor = (1 + annual percentage / 100) ^ elapsed years
indexed land amount = round(original reference rate × time factor × lot area)
selected house-and-lot scenario = indexed land amount + separate improvement component
```

Full rate precision is used before final land rounding. Displayed rates/periods are rounded and labelled. The source/reference rate, Department Order, effectivity and source amount remain unchanged.

**No property-use, market-band, regional or corner multiplier is stacked onto the indexed method.** Its output is compared with the existing factor baseline, not multiplied by it. Corner is still recorded for evidence matching but does not add the existing factor in this method. Buildings retain their separate construction-cost/depreciation assumptions; they receive no backdated land growth.

- No preset growth percentage. Null/blank/invalid rate blocks the indexed method; explicit 0% is supported.
- Negative growth is supported; annual rates must be greater than -100% and at most 100% under the documented engineering input bound.
- Dates must be real ISO calendar dates, not reversed, and span at most 100 years. Unsafe numeric totals/overflow stop the scenario.
- Factor mode ignores unselected time assumptions, preserving the old numerical baseline.
- Evidence mode requires an applicable reviewed matched-land asking-index record, source/reviewer identity, correct locality/use segment and coverage of the requested dates. Wrong metric, proposal or inadequate period is rejected.
- **No reviewed historical land index is currently registered.** Selecting evidence mode cannot silently produce zero/manual growth or use proposed SMV rates. The reviewed-history test record is synthetic test data only.
- Same property/method inputs produce the same selected figure for Buying and Selling. Entered transaction prices still drive party costs; an index is not statutory FMV, an official update or demonstrated market appreciation.

## Example used for verification

For the existing Bauan residential 100-sqm fixture, the imported rate remains **PHP 11,500/sqm**, source amount **PHP 1,150,000** and default factor guide **PHP 2,875,000**.

An explicit assumed **5%**, **2022-07-23 → 2026-10-03** scenario spans **1,533 UTC days**, giving approximately **PHP 14,113.47/sqm** displayed and **PHP 1,411,347** indexed land amount. The 5% is an illustration, not a recommended or observed local growth rate. Exactly four assumed years would differ from this actual date interval.

For an entered PHP 1,000,000 price, the indexing test verifies that the matched imported PHP 1,150,000 provisional tax-reference input remains separate: CGT illustration stays PHP 69,000 rather than using the inflated index as statutory FMV.

## Reports and validation

- Public report source sanitizes the indexing trace and reference dates/status, retains client-supplied provenance and prints the no-stacking rule. It does not server-certify the supplied government status.
- Internal PDF prints verification dates/status, indexing formula/period/rate/source and original reference. APPLIES identifies the selected imported RDO, not confirmation of latest legal applicability.
- Internal wizard supports the same method/rate/date controls and review. Existing PDF role/privacy/CRM boundaries remain covered.
- Same-Home asynchronous rerenders now restore validation messages and invalid-field focus; input/change clears the stored issue. Leaving Home clears it. This fixes a reproduced disappearing-gate error found in the second full run.
- App bundle rebuilt from `app.js`. Service-worker **v10** precaches the reference module; JSON references retain network-first handling.

## Simplification pass - "About this estimate"

The three technical blocks were the first thing a reader met on step 1 of the
public calculator, ahead of anything about the property: government schedule
provenance, an optional land index, and four cost inputs. They now sit behind a
single collapsed disclosure, `.sf-est-about`, that states the three decisions in
plain language before exposing anything.

| Fact line | Source |
| --- | --- |
| Government reference | `referencePlainFact()` - register label plus the imported schedule effective date |
| Land method | `methodPlainFact()` - factor guide, or the indexed scenario with its explicit rate and source |
| Transaction costs | `costPlainFact()` - resale illustration, developer quotation, or undetermined |

The internal wizard (`vgAboutGroup` / `vgDisclosure` in `js/app.js`) collapses
the same three decisions, replacing the always-expanded "Land planning method"
and "Transaction scenario" groups.

Original class names `sf-est-reference-disclosure`, `sf-est-time-inputs` and
`sf-est-cost-inputs` are unchanged, so every `data-est-*` and `data-vg-set` hook,
the PDF snapshot and the saved form are unaffected.

Three defects the consolidation introduced and then fixed:

1. **Invisible focused field.** `showErr` opened only the nearest `<details>`, so
   a cost or rate error was raised inside a closed ancestor - the control it
   focused stayed hidden with a zero bounding box. `openDisclosureChain()` now
   walks the whole ancestor chain.
2. **Panel lost on re-render.** Step 1 re-renders on every purpose, type,
   municipality, street and classification change, which closed any panel the
   reader had opened. `est.openPanels` records reader intent from each
   `data-est-panel` toggle; the `open` attribute present at parse time does not
   fire `toggle`, so a panel that `renderLayout` force-opens is not pinned open.
3. **Overstated currency.** The always-visible hint read "We use the official BIR
   zonal schedule for X", which asserted legal currency the register does not
   support, while the honest version sat inside a collapsed disclosure. It now
   reads "We match the BIR zonal schedule imported for X (latest applicability
   unverified)."

## Automatic adjustment - what is and is not allowed

Automatic behaviour implemented:

- **Reference selection.** The municipality already selects its imported RDO
  schedule and status automatically; the plain fact and the results screen repeat
  the label.
- **Reviewed-trend control.** `[data-est-time-apply-evidence]` applies a reviewed
  local land-price history when one is registered. `register.landTimeEvidence`
  is empty, so the button renders **disabled** and states that the calculator will
  not assume a growth rate. It becomes functional with data, not with a guess.
- **Transaction type.** `private-resale` stays the default with the illustration
  labelled; it is not switched silently from other inputs.

Deliberately not automatic, because the evidence does not exist yet:

- No annual growth, appreciation or inflation default of any kind.
- No activation of the Lipa 2028-2030 or Batangas City **proposed** SMV.
- No stacking of an indexed scenario with factor, market-band or corner
  multipliers; no blending of BIR, advertised project ranges and house packages
  into one market figure.
- No blanket CGT or duplicate transfer charges on developer or unclassified
  transactions.
- No provincial fallback time-indexed with an invented single base date.

The always-visible hint and the review step both restate the reference status and
the cost basis, so the honest wording cannot be hidden behind a disclosure.

## Actual checks

| Check | Result |
| --- | --- |
| New numerical/index/status/PDF suite | **23/23 passed** |
| New UI flow/validation suite | **19/19**, desktop/mobile checks including retained validation |
| Public TypeScript renderer / independent fixture | **19 checks passed**, including indexed trace and text geometry |
| Source/RDO provenance | Passed; parser distinguishes effective-date cells from dates embedded in verification notes |
| Visual review | **37/37**, 320/390/768/1440px; **12 screenshots**, representative indexed/status images inspected |
| Mobile content/type/readability | Passed |
| Horizontal overflow | **10/10 widths passed** |
| First full run | **97/99**, [full-suite.log](full-suite.log); appraisal map and compliance event checks failed, then passed isolated |
| Second full run | **98/99**, [full-suite-recheck.log](full-suite-recheck.log); disappearing estimator validation reproduced and fixed |
| Final full run | **99/99 passed**, [full-suite-final.log](full-suite-final.log) |
| Simplification suite | **29/29**, desktop and mobile; `tests/value_guide_simplify_e2e.js` |
| Internal wizard consolidation | 7 added checks pass in `value_guide_internal_e2e` |
| Panel screenshots | 8 images, 320/390/768/1440px, collapsed and expanded; 0px overflow at every width |
| Full run after simplification | **100/100 passed** (99 previous + the new suite) |
| Horizontal overflow after CSS change | **10/10 widths passed** |
| Syntax, build synchronization, whitespace | Passed |

No fresh official verification, remote CI or hosted email delivery was performed. Passing tests establish arithmetic and regression behavior, not achieved-sale accuracy or legal schedule currency.

Reproduce with local app/worker running:

```text
node tests/value_guide_time_node.js
powershell -NoProfile -ExecutionPolicy Bypass -File tests/run_all.ps1 -Test value_guide_time_e2e -Mobile
powershell -NoProfile -ExecutionPolicy Bypass -File tests/run_all.ps1 -Test value_guide_simplify_e2e
node tools/review_about_panel.js
node tools/review_sea_reference_indexing.js
node tools/review_sea_reference_indexing.js --suite
```

## Handoff

Next factual work is obtaining authenticated, certified/effective schedules and appropriately dated local land histories. Do not activate proposed/future SMVs, treat observation dates as price-effective dates, or insert an invented automatic growth rate.

Local priority order for those sources: **Bauan** and **Lipa City** first (thinnest evidence, highest demand), then **San Pascual**, **Alitagtag** and **Batangas City**. Certified provincial replacement covering Bauan, San Pascual and Alitagtag is still unobtained; the Batangas City document found is proposed, and Lipa's is the 2028-2030 proposal.

Market-accuracy roadmap, unchanged and still the real limit on the numbers:

1. Obtain authenticated certified/effective schedules and register them with approval, publication and effectivity evidence.
2. Build narrow asking-price coverage in Bauan/Lipa with exact unit, area, date, condition and price-basis capture.
3. Measure held-out asking-price performance before any wider claim.
4. Add verified completed sales before asserting achieved-market accuracy.

Public `location-report` source changes are **undeployed**; publication must include shared finance dependencies. Local frontend and internal download are updated. No commit/push/deployment or external office message was requested or made.

Model: **GPT-6.1 Sol / medium**. API spending after the last reported **USD 45** is unknown; no remaining budget or new charge is assumed. Obtain updated billed usage before another API-heavy batch.
