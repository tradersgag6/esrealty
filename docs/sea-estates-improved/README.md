# Clear Horizon — improved original, Step 1

**Review the running preview:**

http://127.0.0.1:8931/docs/sea-estates-improved/index.html#/home

Use the existing development server. This preview is derived from the **original application**, not the earlier standalone sample-card prototype. Original production JS, data and stylesheet order are reused; an isolated overlay adjusts the DOM presentation after rendering. The original files have not been edited.

## Confirmed direction change

- Owner chose **Clear Horizon**, then rejected the previous sparse layout as lower quality than the original.
- Improve the original content and working journeys; do not replace them with the first proposal.
- Properties and **BATANGAS VALUE GUIDE** have equal importance.
- Compact guide-start entry opens the complete existing calculator.
- SEA Estates is expanding its listing/service locations; guide dataset coverage remains Batangas.
- English only; Project B.T. remains visibly Coming Soon.
- Owner reports **USD 45** API spend to date. Remaining PHP budget depends on actual exchange/fees, not an invented live usage counter.

## What Step 1 shows

1. Original navigation with SEA Estates presentation and an explicitly named guide action.
2. Updated introduction and two equally sized desktop entry panels:
   - **Properties:** location search using the original `data-sf-search` handler and real search URL.
   - **BATANGAS VALUE GUIDE:** start action opens the mounted original calculator.
3. Both mobile quick-entry actions are visible above the stacked panels.
4. Existing featured inventory moved earlier; real names, asking prices and locations retained.
5. Original guide summary, services, How It Works, contact form/consent and footer links remain present.
6. New Home teaser linking to the existing Coming Soon page.
7. Clear Horizon blue/navy/white palette, larger text/inputs, consistent card borders/radii, service grid without an empty filler slab.
8. The existing calculator opens inside a native disclosure. It still uses all real municipalities, classifications, ownership/title questions, calculations and **17 report sections**. No alternate valuation engine was introduced.

All-zero fallback card fact rows are shown as “Ask for complete property details” in this presentation preview. Before production integration, use actual source-field presence to distinguish unknown facts from legitimate zero values; this prototype does not fix listing records.

The copy “The original guide. A clearer experience.” and the preview notice are review-facing wording, not final approved production copy. The homepage is not a claim of valuation coverage outside Batangas. Existing property illustrations are not replaced with invented photography or new inventory.

## Safety and integration limits

- `guard.js` loads **before** the original app: local/session storage methods use an in-page memory store and read no existing account/draft values through those methods.
- Fetch/XHR mutation requests and beacons are blocked; non-search form submissions are intercepted and explicitly say **nothing was submitted**. Account/save actions are disabled in this preview.
- Inventory, guide data and comparable context may still make normal GET requests to existing services. This is not an offline mockup.
- The tested calculator run reached the real original result, with reference PHP 3,500/sqm, total PHP 2,975,000 and passing arithmetic integrity for the selected example. The displayed recommended asking price can differ from `total`, as in the unchanged original engine.
- Contact/report emailing and account writes were intentionally **not** tested as successful live submissions. The live application's existing pipelines remain future integration requirements.
- Read-only navigation to Search/details/Coming Soon uses the original routes. This step's detailed visual treatment targets **Home**; Search/details and all result-report colours will receive their own later pass.
- DOM adaptation is a review technique, not the recommended production architecture. Once approved, implement the layout directly in the source render functions and scoped CSS, without copying the preview observer/guard into production.
- Preview `index.html` is a generated copy of the root document, with a root `<base>` and added guard/overlay scripts. It carries `noindex,nofollow`; direct `file://` opening will not resolve root application resources correctly. Use the local server.

## Original / improved comparison

Screenshots were captured from both pages in the same review run at 390, 768 and 1440px. Viewport-only shots include the review notice; it will not consume production first-screen space.

| Width | Original homepage | Improved homepage | Improved first viewport |
| --- | --- | --- | --- |
| Desktop 1440 | [Original](screenshots/original-home-1440.png) | [Improved](screenshots/improved-home-1440.png) | [First screen](screenshots/improved-home-1440-viewport.png) |
| Tablet 768 | [Original](screenshots/original-home-768.png) | [Improved](screenshots/improved-home-768.png) | [First screen](screenshots/improved-home-768-viewport.png) |
| Mobile 390 | [Original](screenshots/original-home-390.png) | [Improved](screenshots/improved-home-390.png) | [First screen](screenshots/improved-home-390-viewport.png) |

- [Actual calculator, desktop](screenshots/improved-calculator-1440.png)
- [Actual calculator, mobile](screenshots/improved-calculator-390.png)
- [Actual calculated report](screenshots/improved-real-result-1440.png)

**16 screenshots** saved. Desktop/mobile/tablet first screens, full desktop homepage, mobile calculator and actual report were visually inspected. Inspection corrected text concatenation at line breaks and legacy orange CTA overrides, and added mobile equal-entry shortcuts.

## Verification

[review-results.json](review-results.json): **40/40 targeted checks passed**:

- Original sections and live inventory retained; no measured page/element overflow at 390/768/1440px.
- Visible inputs are at least 16px in tested initial scenarios.
- Compact disclosure opens the original calculator; municipality never selects a barangay automatically.
- Original ownership stage has 13 choices; real estimate reaches a reconciled result; all 17 report sections remain.
- Back/render retains municipality and lot area.
- Original search URL carries the entered city; existing Project B.T. shows Coming Soon.
- Preview POST rejected before network; contact submission reports nothing sent; no observed mutation requests or uncaught JS errors.
- Storage isolation verified by opening the unguarded original page in the **same browser context** after a preview write.
- Selected palette ratios: main text **12.17:1**, secondary text **5.48:1**, primary CTA text **7.35:1**, control boundary **3.73:1**.
- Nine Batch 0 production file hashes remain unchanged.

These checks are scoped to this preview. They are not a full production regression rerun, complete WCAG audit, submission/email verification, or target-user study. Baseline full-suite status remains as recorded in the tracker.

## Reproduce

```powershell
node --check docs/sea-estates-improved/guard.js
node --check docs/sea-estates-improved/improved.js
node tools/build_sea_improved_preview.js
node tools/review_sea_improved_preview.js
```

The builder overwrites only this directory's generated `index.html`; review overwrites generated screenshots/results. Production source files are never written by these tools.

## Next decision

Review whether the revised Home hierarchy and preservation of the original are acceptable. Request changes here before integrating into the live application.

**Next model reminder — Step 2 visual critique: GPT-6 Astra, high reasoning.** After visual approval, switch back to **GPT-6.1 Sol, medium** for source implementation. API reserve stays PHP 3,000; obtain owner-reported cumulative spending before reserve use.
