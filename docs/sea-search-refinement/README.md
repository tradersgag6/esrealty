# SEA ESTATES — mobile Properties search refinement

Implemented in the local application on 2026-10-02 following the owner's “next”.

Review: [Properties search](http://127.0.0.1:8931/index.html#/search).

## Behaviour

- At **600px and below**, Location, Budget and Search come first. Native **More filters** exposes State / province, Property type and Listing type (sale/rent).
- Applied advanced filters open the panel automatically, with an applied-filter count. A basic-only URL starts collapsed. Clear all resets the panel; individual filter chips retain their existing removal behaviour.
- The same labelled controls move between layouts. There are no duplicated or disabled fields: closing the panel preserves all values in FormData and subsequent search URLs.
- Above 600px, all five filters retain their original order. Unsaved values and focus survive breakpoint changes; an empty focused advanced field stays exposed when shrinking, and a disappearing desktop disclosure transfers focus to the province field.
- Native Enter/Space behaviour, visible keyboard focus, comfortable disclosure/input targets and existing warm colours are retained.
- Mobile listing-location paragraphs and Home process copy now meet the existing 16px reading-copy floor, overriding older 13/14px mobile rules.

## Actual verification

| Check | Result |
| --- | --- |
| `properties_mobile_filters_e2e`, 390px | **20/20 checks passed** |
| Same suite, standard desktop | **18/18 checks passed** |
| `review_sea_search_filters.js` | **31/31 checks passed**, real Enter/Space/Tab input, unsaved-value/focus checks at 600/601/768/390/1440px, no uncaught browser exceptions |
| Existing Properties suite | Passed at desktop and mobile |
| Content integrity | Passed at desktop and mobile after the reachability-test correction below |
| Mobile readability, typography, navigation | Passed; typography was rerun after the font-size correction |
| Public navigation, desktop | Passed |
| Build/source synchronization | **13/13 checks passed**, including required test-hook inventory |
| Horizontal overflow sweep | **10/10 widths passed**, final run after the text-size/focus fixes |
| Screenshots | **10 images**; inspected mobile closed/open/applied states and tablet/desktop layout |
| `git diff --check` | Passed |

Initial mobile verification exposed two issues: older mobile body-text overrides fell below 16px, and the Coming Soon test assumed its button must already fit above the fold (`y=904`, viewport `844`). The font overrides were corrected. The test now scrolls to the button on phones and requires its entire rectangle to fit, a usable size, and a successful centre-point hit test; desktop retains the above-fold requirement. The passing rerun measured the mobile button at `y=398` and desktop at `y=518`. It also deliberately excludes closed More Filters controls from its general usability scan; the dedicated filter suite verifies their usable dimensions after opening.

The new filter suite is discoverable by the full runner and has desktop/mobile GitHub Actions steps. Remote CI has **not** been executed. A fresh full-application run was **not** performed for this focused task; the earlier Home full run remains 90/91 followed by a passing build-harness correction. These targeted results do not imply a new 92/92 full run.

## Evidence

- [Review checks and captures](review-results.json)
- [Mobile closed](search-mobile-closed-viewport.png), [mobile open](search-mobile-open-viewport.png), [mobile with applied Rent filter](search-mobile-applied-viewport.png)
- [Tablet](search-768-viewport.png), [desktop](search-1440-viewport.png)
- Each scenario also has a full-page screenshot alongside its `-viewport` image.

Reproduce captures/checks with `node tools/review_sea_search_filters.js` while the existing local server is running. Screenshots use live inventory/fallbacks. No contact/report forms are submitted by this review tool.

## Changed sources

`js/storefront.js`, `css/storefront.css`, `tests/properties_mobile_filters_e2e.js`, `tests/ui_content_integrity_e2e.js`, `.github/workflows/tests.yml`, `tools/review_sea_search_filters.js`, and this evidence/tracker/handoff documentation.

Model recommendation: **GPT-6.1 Sol / medium**. Last owner-reported cumulative API spend: **USD 45**; later charges and conversion/fees are unknown. No commit, push or deployment was requested or made.
