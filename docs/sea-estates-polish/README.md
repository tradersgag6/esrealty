# SEA ESTATES — original-site polish

Open the actual local website: **http://127.0.0.1:8931/index.html#/home**.

This is implemented application source, not either prior standalone preview. The original cream/orange palette, typography, section structure and fully visible Home calculator are retained. New company wording is **SEA ESTATES**, monogram **S.E**.

## Improvements

- Clearer Home entry/coverage explanations; guide and Properties actions have balanced sizing.
- Native BIR classification help with readable body copy and keyboard/tap interaction.
- Missing/default property facts no longer look like known zero-valued measurements. No facts or listings fabricated.
- Cleaner services-grid gaps and last-row sizing.
- Subtle card hover/focus emphasis and image zoom, restricted by hover/reduced-motion preferences.
- Clearer contact questions, mobile/autofill field semantics, and honest report delivery status.
- Updated active UI, metadata, manifest/favicon, new print/PDF/email source templates and current company provenance labels.

All existing numeric estimate factors and the calculation version remain unchanged. A legacy transaction source alias is retained to keep historical data interpretation compatible. Existing storage/API/global identifiers and real contact domains are not renamed blindly.

## Evidence

| Screen | Desktop | Mobile |
| --- | --- | --- |
| Home | [Full](home-1440.png) / [First viewport](home-1440-viewport.png) | [Full](home-390.png) / [First viewport](home-390-viewport.png) |
| Search | [Full](search-1440.png) | [Full](search-390.png) |
| Coming Soon | [Full](project-bt-1440.png) | [Full](project-bt-390.png) |
| Consultation | [Full](property-value-1440.png) | [Full](property-value-390.png) |

Tablet captures use `-768.png` / `-768-viewport.png`. **24 screenshots** from `tools/capture_sea_polish.js`. Header/desktop/mobile/full-Home images were actually inspected. The last help-font change affects the expanded help paragraph; its 16px size is verified by the final type/readability run.

- [First full test run](../sea-estates-polish-tests.log): 87/91 before correcting help size and updated copy assertions.
- [Final full test run](../sea-estates-polish-tests-final.log): **91/91 passed**.
- [Subsequent delivery fix](delivery-confirmation.log): estimator browser suite **86 checks passed** with a saved inquiry ID that must not imply emailed report delivery; location-report Node suite's **43 checks** also passed. Full suite was not rerun after this isolated change.
- [Overflow sweep](overflow.log): 10 widths passed.
- [Mobile-nav sweep](nav-sweep.log): 13 widths passed.
- [Readability](readability.log): passed.
- [Style snapshot self-test](snapshot-selftest.log): zero differences across three pairs.

The full suite includes estimate maths, build sync, current PDF content/provenance/collision checks, and real browser report/guide flows. Wording assertions were updated to the approved new copy; functional checks were preserved. Passing current readability tooling is not a full independent accessibility certification.

## Deployment boundary

Local application/bundle changes are ready for review. **No deployment, commit or push was requested or made.** Supabase report/email/SEO source updates require their own deployment to affect the hosted services; configured sender display names/site settings must be checked there. No new company email/domain was invented. Historical reports/data and migration history were not rewritten.

Use **GPT-6.1 Sol / medium** for the next focused frontend task. Actual API spending since the owner's USD 45 report is unknown; retain PHP 3,000 reserve and request updated billed usage before more work.
