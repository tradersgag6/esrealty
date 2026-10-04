# Batch 0 baseline evidence

Captured on 2026-10-02 from the existing application at `http://127.0.0.1:8931/index.html`.

## Screenshots

Each route has a **full-page** image and a **viewport-only** image at desktop (1440×1000), tablet (768×1024), and mobile (390×844). Viewport-only images are essential when reviewing sticky elements; their position in a stitched full-page screenshot can be misleading.

| Route | Desktop full-page | Mobile full-page | Mobile first viewport |
| --- | --- | --- | --- |
| Home / calculator | [home-desktop.png](home-desktop.png) | [home-mobile.png](home-mobile.png) | [home-mobile-viewport.png](home-mobile-viewport.png) |
| Properties / Search | [properties-desktop.png](properties-desktop.png) | [properties-mobile.png](properties-mobile.png) | [properties-mobile-viewport.png](properties-mobile-viewport.png) |
| Consultation | [property-value-desktop.png](property-value-desktop.png) | [property-value-mobile.png](property-value-mobile.png) | [property-value-mobile-viewport.png](property-value-mobile-viewport.png) |
| Project B.T. Coming Soon | [project-bt-desktop.png](project-bt-desktop.png) | [project-bt-mobile.png](project-bt-mobile.png) | [project-bt-mobile-viewport.png](project-bt-mobile-viewport.png) |
| Actual property detail | [property-detail-desktop.png](property-detail-desktop.png) | [property-detail-mobile.png](property-detail-mobile.png) | [property-detail-mobile-viewport.png](property-detail-mobile-viewport.png) |

For tablet use the same prefix with `-tablet.png` / `-tablet-viewport.png`. Desktop viewport-only images use `-desktop-viewport.png`.

## Machine-readable evidence

- [audit.json](audit.json): capture timestamp, commit/source hashes, brand occurrence inventory (file/line/spelling, no secret/environment contents), CSS counts, real route headings/links, JS exceptions and failed requests.
- [computed-styles.json](computed-styles.json): stable four-route computed-style snapshot. The existing tool mocks contact settings for reproducibility; live screenshots do not.
- [Full-suite log](../sea-estates-batch-0-tests.log): first pass 89/90, with map detail tile-loading failure.
- [Map rerun](map-recheck.log): isolated passing rerun, 8/8 detail tiles.
- [Snapshot self-test](snapshot-selftest.log): zero differences across three pairs.
- [Overflow sweep](overflow-sweep.log): 10 widths pass.
- [Mobile-nav sweep](mobile-nav-sweep.log): 13 widths pass.
- [Mobile readability](readability-mobile.log): passing existing contrast/input/label/touch checks.
- [Generated legacy coverage](../../css/legacy-coverage.json): sampled coverage, not a deletion list. Details/mobile/conditional states need further coverage.

## Reproduction

Run from the application repo with the existing app/worker running on ports 8931/8932:

```powershell
node tools/sea_estates_baseline.js
node tools/legacy_css_coverage.js
node tools/snapshot_public_styles.js docs/sea-estates-baseline/computed-styles.json
node tools/snapshot_public_styles.js --selftest
powershell -NoProfile -ExecutionPolicy Bypass -File tests/run_all.ps1
powershell -NoProfile -ExecutionPolicy Bypass -File tests/run_overflow_sweep.ps1
powershell -NoProfile -ExecutionPolicy Bypass -File tests/run_mobile_nav_sweep.ps1
powershell -NoProfile -ExecutionPolicy Bypass -File tests/run_all.ps1 -Test ui_readability_mobile_e2e -Mobile
```

The capture tool **overwrites this directory's generated screenshots and audit JSON**. Archive this baseline first before running it after a redesign. It never submits forms or edits application code. No redesign or renaming has been applied in Batch 0.
