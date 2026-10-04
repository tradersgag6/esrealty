# SEA ESTATES — comparison and Value Guide upgrade

Implemented locally following the owner's approval of the plan and three choices: **85%–130% planning range**, **open results**, and **calculator plus both PDF outputs**.

Review [Properties](http://127.0.0.1:8931/index.html#/search) and [Home calculator](http://127.0.0.1:8931/index.html#/home).

## Delivered

### Compare two properties

- Guest-accessible Compare buttons on Properties cards, map popups and detail pages.
- Inline selection panel, two-property limit, removal and clear controls, live announcements and a dedicated `#/compare` page.
- Same-tab session selection survives refresh. Selection updates patch controls/panel without replacing search drafts or inquiry forms.
- Separate sale-price/monthly-rent labels, separate floor/lot areas, and “Not supplied” for unknown/zero-default facts.
- Desktop side-by-side fields; readable labelled mobile values; the previous search URL and its filters survive a comparison-page refresh in the same tab.
- Fresh comparison data uses the existing public detail endpoint. That endpoint counts listing views; comparison does not call favourites, sign-in or CRM/contact endpoints.

### Home calculator

- Full calculator remains visibly embedded on Home with the original warm identity.
- Four-stage progress: property/location, details, review, results. Review exposes construction defaults, title/occupancy assumptions and model deductions before calculation.
- Discoverable Street not listed action, optional collapsed site notes, clearer built-up-area guidance, improved numeric validation and ownership-error focus.
- Central estimate leads the result; scenario range and separate BIR reference are visible. Four computed pricing/cost cards are open without contact submission.
- Six result groups retain the detailed computation, provenance, limitations and next steps.
- Email guide and professional consultation are distinct actions. Phone is optional for email delivery; consent remains required.
- Loading/retry states retain inputs. Reference failures are distinguished from missing BIR data. Completed calculations have no artificial post-result delay.
- Same-Home rerenders preserve the current stage; stale calculations cannot repaint a different route. Step headings clear the sticky header.

### Computation and reports

- Calculation and tax-reference versions: **2026.10.1**. Existing point-estimate factors, BIR schedules and construction/ownership arithmetic retained; range policy changed to **85%–130%**.
- Source match is categorical, not a claimed accuracy/confidence percentage. Municipality/province fallback labels correctly say median.
- Shared `js/value_guide_finance.js` arithmetic runs in browser, Node and the public Deno report source.
- Tax base no longer depends on whether comparable listings were found. A supplied selling price replaces the assumed guide price; supplied zonal/assessor values remain statutory reference candidates.
- Removed the internal report's half-zonal proxy and excess-only CGT. Corrected estate standard/conditional family-home deductions and the DST month-end filing rule under RA 11976.
- All-cost transaction illustration and seller-only proceeds have distinct labels and payer assumptions. Unknown notarial fees are excluded rather than invented.
- Approved settings use the real `{ data: { valueGuide } }` envelope. Factor-setting version is separate from formula version; approved in-session edits update the cached factors.
- Both report renderers use the central estimate, scenario range and consistent cost assumptions. Public PDF contains six logical sections, truthful unassessed-analysis states, safe text wrapping, page counts and continuation headings.
- Internal PDF preserves six parts and actual continuation/page-count logic. Final proofreading removed duplicate cover figures, shortened repeated notes, corrected step numbering, deadline-trigger wording and the title-adjustment disclosure.
- Corrected an older public-PDF syntax error and currency-prefix precedence bug exposed by executing its actual TypeScript renderer in tests.
- Report/page count remains content-driven; six parts do not imply six physical pages.

## Independent reference fixture

Reference: supplied LandValuePH report and [check page](https://www.landvalueph.com/check). Property: **BAUAN / POBLACION III / BINAY ST (RESSURRECCION ST), RR residential, vacant 100 sqm, no corner or ownership deductions**.

| Figure | Expected and verified |
| --- | ---: |
| Official BIR rate | PHP 11,500/sqm |
| Separate BIR reference | PHP 1,150,000 |
| Central planning estimate | **PHP 2,875,000** |
| Lower scenario, 85% | **PHP 2,443,750** |
| Upper scenario, 130% | **PHP 3,737,500** |
| CGT / DST | PHP 172,500 / PHP 43,125 |
| Transfer / estimated registration | PHP 14,375 / PHP 2,875 |
| All four transaction costs | **PHP 232,875** |
| After all four costs, before broker/notary | **PHP 2,642,125** |
| Seller proceeds, CGT + 3% broker seller-paid | PHP 2,616,250 |

The last two proceeds scenarios use different allocations. The competitor's undisclosed LVIS 70%/30% blend is not claimed. No PVS-compliance or certified-appraisal claim is made.

## Verification record

| Check | Actual result |
| --- | --- |
| Fresh pre-change baseline | **92/92 suites passed** |
| First implementation full run | **94/95**; PDF browser assertions retained old midpoint/allocation/version strings |
| Corrected full regression run | **95/95 passed**, [full-suite-final.log](full-suite-final.log) |
| Browser design/journey review | **57/57 checks**, [review-results.json](review-results.json); 320/390/768/1440px |
| Screenshots | **28** component/viewport captures; representative phone/desktop images inspected |
| Horizontal overflow sweep | **10/10 widths passed** after fixing the 320px progress label |
| Mobile calculator/delivery/readability/typography | Passed targeted checks |
| Comparison suite | **18 checks passed** at desktop and mobile |
| Independent calculation/public-PDF fixture | **18 checks passed**, including actual TypeScript execution and text geometry |
| Final PDF proofreading follow-up | Internal content, adversarial layout, tax engine, reference/public renderer and browser download checks passed after the 95/95 run |
| Bundle/source synchronization | Passed; bundle rebuilt from `app.js` |
| `git diff --check` | Passed |

Initial full-run evidence remains in [full-suite.log](full-suite.log). The 95/95 run preceded the final PDF-only proofreading changes; those were verified with the relevant PDF/tax/browser suites, not a third full run. Remote GitHub Actions and hosted email delivery have not been executed.

Node CI now uses **Node 24**, matching the local environment and supporting the built-in TypeScript parser used to execute the report renderer. CI includes desktop/mobile comparison and email-delivery regression steps. Service-worker cache version is **`esrealty-pages-v8`**, including the new finance module.

## Evidence and reproduction

- [Public report sample](bauan-public-report.pdf), [internal report sample](bauan-internal-report.pdf): generated from the reference fixture; no personal client data.
- [Phone result viewport](calculator-results-390-viewport.png), [desktop review](calculator-review-1440.png), [phone comparison](property-comparison-320.png), [desktop comparison](property-comparison-1440.png).
- Component screenshots temporarily hide the sticky header during capture; the separate viewport images restore it and checks verify heading clearance.

Commands from the repository root, with local server/worker running:

```text
node tools/review_sea_guide_upgrade.js
node tools/review_sea_guide_upgrade.js --suite-only
node tests/value_guide_reference_node.js --capture
powershell -NoProfile -ExecutionPolicy Bypass -File tests/run_all.ps1 -Test properties_compare_e2e -Mobile
powershell -NoProfile -ExecutionPolicy Bypass -File tests/run_all.ps1 -Test estimator_delivery_e2e -Mobile
```

## Publication boundary and handoff

The public email/PDF changes in `supabase/functions/location-report/index.ts` are **source-only until deployed**. Its dependency bundle must include `js/value_guide_finance.js` and `data/tax/ph-estate-tax-reference.json`. The deployed service may still run the old renderer. Frontend review and internal local download work in the local repository. Public valuation inputs remain explicitly client-supplied, not server-verified appraisals; internal downloads remain role-gated and create no CRM/email records.

No commit, push or deployment was requested or made. Preserve prior uncommitted work and historical previews. Model recommendation remains **GPT-6.1 Sol / medium**. Last owner-reported cumulative API spend: **USD 45**; subsequent charges and PHP conversion/fees remain unknown. Obtain updated billed usage before the next API-heavy batch.

## Resumed review — comparison state follow-up

On the owner's “continue”, reviewed the saved implementation and corrected two reproduced state defects:

1. A fresh storefront module restored selected IDs but forgot the prior filtered search URL. A guarded `esrealty_compare_return_v1` session key now restores only a bounded `#/search` hash; unavailable storage falls back to plain Properties.
2. Clear selection cancelled an unrelated pending listings request, leaving skeletons stuck. It now invalidates requests only on the comparison route; pending Properties searches complete normally. When cards are not yet available, focus moves to the Search action.

The expanded comparison test reproduced both failures before the fix. A same-origin iframe boots a fresh module with the same tab's session storage to test reload restoration; an explicitly delayed list response tests cancellation. The tests also reject an external cached return URL.

- **24/24 comparison checks passed at desktop and mobile.**
- Existing Properties and mobile More filters suites passed at 390px.
- Storefront syntax, **13/13 bundle/build-hook checks** and `git diff --check` passed.
- Changed implementation: `js/storefront.js`; expanded test: `tests/properties_compare_e2e.js`.
- The local server was restarted for review. No fresh full-suite run or deployment was performed; the prior **95/95** full-run record and PDF follow-up remain historical evidence.
