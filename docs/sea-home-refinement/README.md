# Homepage refinement — simpler original design

Review the actual local homepage: **http://127.0.0.1:8931/index.html#/home**.

## Changes

- Short introduction explains the two tasks: explore properties or start the Batangas guide.
- Guide/browse actions appear before supporting proof/disclosure text.
- Free/no-account/reference explanations are shorter; coverage, independence and non-appraisal wording remain visible.
- Full original calculator remains visibly embedded on Home. No step, dataset or formula replaced.
- Guide benefits use plain headings: BIR tax reference, planning estimate, practical next step.
- Listings now precede services, so a buyer can reach available inventory sooner.
- A compact **Project B.T. — Coming Soon** entry links to the existing page/notification flow. No launch details invented.
- Service descriptions, How It Works and contact wording are shorter and task-oriented.
- Original cream/orange palette, typography, account/privacy links and contact/calculator behavior retained. The removed fixed bottom actions remain absent.

## Screenshots

| Screen | Desktop | Mobile |
| --- | --- | --- |
| First viewport | [1440px](home-1440-viewport.png) | [390px](home-390-viewport.png) |
| Complete Home | [1440px](home-1440.png) | [390px](home-390.png) |

Tablet images use `home-768.png` and `home-768-viewport.png`. Six screenshots were captured and representative desktop/mobile screens actually inspected. The capture helper now waits for lazy-image decoding; earlier half-painted inventory images were capture-timing artifacts, not an application redesign defect.

## Verification

- Home order/entry checks and existing branding/calculator checks passed on desktop and mobile.
- Typography/alignment suite passed without relaxing its size or flow assertions.
- Full suite: **90/91 passed**; all browser suites and calculator/PDF checks passed. Only build-sync's test-hook inventory failed because it treated intentionally removed bottom-bar hooks as required UI.
- Harness corrected: explicitly requires removed bottom hooks to stay absent, recognises both quote styles in absence assertions including nested opposite quotes, and continues verifying active controls. **13/13 targeted build-sync checks passed afterward**; bundle still in sync. Full suite was not repeated after this harness-only correction.
- Mobile contrast/readability/labels/target checks passed: [readability.log](readability.log).
- Overflow across ten widths passed: [overflow.log](overflow.log).
- Full-run evidence: [full-suite.log](full-suite.log). Original failure remains recorded, not rewritten as a clean run.

Reproduce from repository root:

```powershell
node --check js/storefront.js
node tests/build_sync_node.js
powershell -NoProfile -ExecutionPolicy Bypass -File tests/run_all.ps1 -Test sea_brand_polish_e2e -Mobile
node tools/capture_sea_polish.js --home-only
```

The capture command overwrites only generated evidence in this directory. No deployment, commit or push occurred. Model recommendation: **GPT-6.1 Sol / medium**. Last owner-reported API spending was USD 45; subsequent charges remain unknown.
