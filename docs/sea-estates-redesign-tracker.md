# SEA ESTATES frontend improvement tracker

## Current handoff

- **Latest delivered:** [simplified "About this estimate" panel](sea-reference-indexing/README.md), formula **2026.10.3** unchanged. The three technical blocks (government schedule status, land method with the optional time scenario, transaction type with optional costs) are now one collapsed disclosure in both the public calculator and the internal wizard, with plain-language facts first. Three defects the consolidation caused were reproduced and fixed: an invisible focused field behind a closed ancestor disclosure, panels lost on the step-1 re-render, and an overstated "official BIR zonal schedule" hint. Safe automation only: municipality→reference selection, and a reviewed-trend control that renders **disabled** with an explanation because `landTimeEvidence` is empty. No growth default, no proposed SMV activation, no stacking. New suite **29/29** desktop/mobile, 7 added internal checks, 8 panel screenshots, overflow **10/10**, full regression **100/100**.

- **Previous delivery:** [government-reference verification and land-only indexing](sea-reference-indexing/README.md), formula **2026.10.3**. BIR rates unchanged; applicability labels honest, proposed SMVs separate, optional explicit manual/reviewed-history method not stacked with market/corner factors. No reviewed production history exists. Full regression **99/99**, 23 numeric checks, 19 UI checks, 37 visual checks and 12 screenshots. Public report remains source-only until deployment.

- **Newest batch delivered:** [evidence-led Value Guide and purpose outputs](sea-market-guide/README.md), formula **2026.10.2**. Owner chose asking listings, shared underlying value and evidence-led risk treatment, then “start”. Final full regression **97/97**, input matrix **28 checks/80 ownership combinations**, purpose UI **17 checks** at desktop/mobile, visual review **33 checks/16 screenshots**. Public report backend remains source-only until deployment.

- Resumed review completed: comparison now retains the filtered search destination across refresh, and Clear selection no longer strands a pending Properties search. Both defects reproduced before correction; **24/24 comparison checks passed at desktop and mobile**, with existing Properties/mobile-filter and 13/13 build checks passing. See the follow-up in [upgrade evidence](sea-guide-upgrade/README.md). No new full-suite run or deployment claimed.

- **Newest delivered batch:** [two-property comparison and Value Guide upgrade](sea-guide-upgrade/README.md). Owner approved 85%–130% range, open results and both PDF outputs. Full implementation regression **95/95 passed**, followed by passing PDF-only proofreading checks; 57 browser review checks and 28 screenshots. Public email/PDF function requires deployment to publish its source changes.

- **Approved original-site polish implemented and verified, 2026-10-02.**
- Latest follow-up: [simpler Home flow](sea-home-refinement/README.md) implemented; shorter hero/copy, actions first, listings before services, small Coming Soon entry, original visible calculator retained.
- Latest completed task: [mobile Properties search](sea-search-refinement/README.md); basic controls first, native More filters, applied-filter auto-expansion, preserved form/URL state and desktop order. Targeted desktop/mobile verification passed; 31 real-keyboard/resize checks, ten-width overflow sweep and ten screenshots recorded.
- Latest owner decision supersedes Clear Horizon and both previews: **keep the original colours/layout/typography and the full calculator visible on Home**. Improve wording, clarity, spacing and subtle effects.
- Canonical identity is now **SEA ESTATES**, monogram **S.E** exactly.
- Review the [local application](http://127.0.0.1:8931/index.html#/home) and [implementation evidence](sea-estates-polish/README.md).
- **MODEL CHECK: GPT-6.1 Sol, medium** for the next incremental task. Astra/high is optional for a short final visual critique, not required for routine edits.
- Active application sources changed and `app.min.js` was rebuilt. Earlier prototype files remain historical proposals, **not implementation targets**.
- Owner reports **USD 45 cumulative API spend**. Exact PHP conversion/fees and per-batch attribution are unknown; do not treat them as zero.

## Confirmed decisions

| Decision | Approved requirement |
| --- | --- |
| Brand and legal spelling | **SEA ESTATES** exactly; no suffix; **S.E** logo with no trailing period |
| Design scope | **Improve the original public website**, not the sparse standalone replacement; retain useful sections and working journeys |
| Whole-project rename | Current visible public/internal branding, current company provenance, new reports/PDFs and emails |
| Technical compatibility | Keep JS globals, storage keys, API routes, database names, deployments and IDs compatible |
| Historical / statutory records | Keep original issued-report attribution and exact government/legal instrument names |
| Audience | Adults aged 30–65; readable, understandable, accessible on mobile and desktop |
| Design direction | **Original warm cream/orange palette and layout retained**; modernise through wording, consistency, accessibility and restrained effects |
| Properties | Remain visible on Home and in navigation; preserve Search, detail and enquiry flows |
| BATANGAS VALUE GUIDE | Keep feature/name, location selectors, calculations, BIR distinction and disclosures |
| Project B.T. | Keep a discoverable Coming Soon page; do not activate parked project content |
| Budget | PHP 10,000 API-only hard ceiling; planned ceiling PHP 7,000 plus PHP 3,000 reserved |
| Operating model | Owner implements with OpenCode/API-metered GPT; no contractor cost in API ledger |
| Geography | Listing/service locations may expand beyond Batangas; current guide data coverage remains Batangas |
| Language | English only |
| Guide entry | **Full original calculator visibly embedded on Home**, not collapsed or relocated; no replacement formula |

Reference directions discussed earlier remain research only. Clear Horizon and the sparse proposals were subsequently rejected. **The latest approved scope is original-site polish** with SEA ESTATES / S.E. No new tagline or replacement artwork was adopted.

## Batch schedule

At **every batch start**, print: `MODEL CHECK — Use [model], reasoning effort [level]. Switch in OpenCode if needed.`

| Batch | Work | Recommended model / effort | Status |
| --- | --- | --- | --- |
| 0 | Inventory, CSS coverage, screenshots, verification, tracker | GPT-6.1 Sol / medium | **Complete** |
| 1 | SEA Estates visual concepts and UX direction | GPT-6 Astra / high | First sparse layout rejected; Clear Horizon chosen; revised Step 1 complete |
| 2 | Live CSS scope and incremental migration | GPT-6.1 Sol / medium; high for difficult cascade investigation | Pending |
| 3 | Design tokens and shared components | GPT-6.1 Sol / medium | Pending |
| 4 | Home, Properties/Search, property details | GPT-6.1 Sol / medium | Pending |
| 5 | BATANGAS VALUE GUIDE, Coming Soon, whole-project visible rename | GPT-6.1 Sol / medium; high for source-attribution review | Pending |
| 6 | Final visual/UX audit, regressions and handoff | Astra / high for critique; Sol / medium for fixes | Pending |

Do not use xhigh/max or Fast mode without explaining the need and getting approval. Do not silently change the model; the owner controls model/effort selection. Keep contexts task-focused; check provider pricing before spending, including long-context and reasoning-token charges.

## Budget ledger

Budget envelopes are ceilings, **not cost estimates or spending targets**.

| Envelope | Ceiling |
| --- | ---: |
| Sol implementation / migration | PHP 4,000 |
| Astra direction / review | PHP 2,000 |
| Normal iteration / debugging | PHP 1,000 |
| Problem reserve (approval needed) | PHP 3,000 |
| Total hard cap | **PHP 10,000** |

| Batch | Recommended model | Verified actual charge | Cumulative actual | Notes |
| --- | --- | --- | --- | --- |
| 0 | Sol / medium | **Not available** | **Not available** | Do not invent token/currency usage; request owner billing figures |
| 1 | Astra / high | **Not available** | **Not available** | Prototype + review; no purchased assets/fonts/dependencies. API cost remains unverified |
| Owner report before revised Step 1 | Owner selected model | Per-batch attribution unavailable | **USD 45** | Confirmed by user; exchange/fees unknown |
| Revised Step 1 | Sol / medium recommended | **Not available** | At least reported USD 45, new charges unreported | Working improved-original preview and targeted review |
| Approved original-site implementation | Sol / medium recommended | **Not available** | Latest owner-reported USD 45; later charges unknown | Rebrand, wording/help, missing facts, spacing/effects, test runs |
| Home and mobile Properties follow-ups | Sol / medium recommended | **Not available** | Latest owner-reported USD 45; later charges unknown | Copy/order, removed bottom bar, More filters and targeted verification |
| Two-property comparison / Value Guide upgrade | Sol / medium recommended | **Not available** | Latest owner-reported USD 45; later charges unknown | Comparison, calculator review/open results, range and tax correction, PDF parity, verification |
| Evidence-led Value Guide / buyer-seller outputs | Sol / medium recommended | **Not available** | Latest owner-reported USD 45; later charges unknown | Sourced project register, asking screen, input/risk correctness, purpose/fee outputs and 97-suite verification |
| Government register / optional land indexing | Sol / medium recommended | **Not available** | Latest owner-reported USD 45; later charges unknown | Honest legal-currency labels, no stacked multipliers, land-only scenarios, UI/PDF trace and 99-suite verification |

Review billed usage at PHP 6,000; pause at PHP 7,000 before reserve use. Stop before PHP 10,000. Alerts may not be hard spending controls. Remaining budget cannot be computed until actual charges are supplied.

Planning illustration only: USD 45 × PHP 58/USD ≈ PHP 2,610; remaining hard-cap amount ≈ PHP 7,390; remaining planned allowance after preserving PHP 3,000 ≈ PHP 4,390. This is **not** the provider/card billing conversion and excludes unreported charges after the user's update.

## Repository baseline

- Repository: `C:\Users\Home-Desktop\Desktop\project 1\es realty`.
- The current OpenCode `steps` working directory was empty; the known application repo was verified before work.
- Git baseline: `7d67c6541d84656d8775b6d8277bfb5149fd605d` (`ci: annotate the individual failing check, not just the suite`).
- `git status --short` was clean before Batch 0 artifacts were added.
- Local app and market worker were not running. Started existing `serve.js` on 8931 and worker `server.js` on 8932; worker ping succeeded.
- No `AGENTS.md` found in the inspected project tree. No subagents were used.
- Original application-file SHA-256 hashes are in `sea-estates-baseline/audit.json`.
- Final Batch 0 hash verification: **0 changes** across the nine recorded application files; all **30 screenshot files** exist; capture helper syntax and `git diff --check` passed.

## Evidence and screenshots

See [baseline index](sea-estates-baseline/README.md).

- **15 full-page + 15 viewport screenshots** (30 PNGs): five route types at 1440×1000, 768×1024, 390×844.
- Routes: `#/home`, `#/search`, `#/property-value`, `#/project-bt`, and one actual listing detail discovered from Home/Search.
- A real listing was available; detail capture did not use an invented fixture.
- Screenshot captures used live responses/fallbacks; they did **not** mock site settings.
- `audit.json`: brand occurrence inventory, CSS counts, route headings/link targets, JS errors, failed requests, source hashes.
- `computed-styles.json`: existing snapshot tool's four-route baseline at its configured viewport; this tool **does stub contact settings** for stable computed-style diffs. Do not confuse this with the live screenshots.
- `../css/legacy-coverage.json`: refreshed generated coverage report.

### Visual observations (inspected actual screenshots)

| ID | Finding | Redesign action / limitation |
| --- | --- | --- |
| UX-01 | Home leads with BATANGAS VALUE GUIDE; listings are much lower on the page | Keep guide prominent, but offer equally understandable buyer and seller entry points |
| UX-02 | `#/property-value` is a consultation landing page, while the calculator lives on Home | Clarify the difference between getting an estimate and requesting a human consultation; preserve both tasks |
| UX-03 | Cards and detail facts display `0 beds`, `0 baths`, `0 sqm` with incomplete inventory | Show missing facts honestly instead of implying zero; first determine absent vs valid zero from listing data |
| UX-04 | Search mobile first viewport is dominated by a long filter stack | Consider basic filters first plus an explicit More Filters control; verify results remain easily reachable |
| UX-05 | Persistent mobile value-guide/Browse bar occupies bottom viewport space | Check control occlusion and safe-area padding on real scrolled viewports; a full-page screenshot alone cannot prove a sticky-bar defect |
| UX-06 | Home services grid leaves an unfinished-looking empty area with seven entries | Make service-grid layout intentional at all breakpoints |
| UX-07 | Header has Properties and Project B.T.; guide action reads Get My Property Value | Maintain explicit BATANGAS VALUE GUIDE identity and Coming Soon expectation in the new navigation |
| UX-08 | Existing sample inventory is in Caloocan, despite Batangas guide positioning | Distinguish geographic guide coverage from actual inventory; do not fabricate Batangas listings/photos |
| UX-09 | Visible ES Realty remains in header/footer, consent text, consultation copy, meta and reports | Rename current company wording consistently; separate display copy from compatibility identifiers |

These are observations and design opportunities, not implementation changes or a usability study with the target audience.

## CSS and migration scope

Measured with comments removed (hex literals are textual occurrences, **not a percentage of visible design**):

| File | Hex occurrences | Distinct hex | All token references | `--sf-*` references |
| --- | ---: | ---: | ---: | ---: |
| `css/storefront.css` | 17 | 17 | 221 | 221 |
| `css/storefront-legacy.css` | 511 | 164 | 8 | 0 |
| `css/estimator.css` | 455 | 131 | 1 | 1 |
| `css/styles.css` | 258 | 107 | 584 | 0 |

This corrects earlier simplified counts of 16 storefront hex values and zero estimator token uses. Ratios such as “93% tokenised” do **not** measure live-page coverage.

Existing `legacy_css_coverage.js` sampled Home/Search/Property Value at 1400×900:

| Classification | Selector count |
| --- | ---: |
| Matched sampled live route | **183** |
| Parked-only vocabulary classification | **361** |
| Unmatched / class not found by source heuristic | **14** |
| Dormant / conditional classification | **109** |
| Invalid selector | **0** |
| Total analysed | **667** |

**Important limitation:** coverage excludes actual listing detail, Project B.T. Coming Soon, mobile states and interactive estimator/report states. Several `.sf-detail` / `.sf-contact-card` selectors are classified as parked despite being visible on the captured detail page. Treat all categories as triage, not deletion authority. Extend scenario coverage in Batch 2 before pruning/migration. Keep carousels and galleries that depend on multiple photos.

Stylesheet order to preserve: Bootstrap → fallback → legacy storefront → shared styles → estimator → storefront.

## Rename inventory

`audit.json` contains **846 spelling matches in 140 files**, excluding dependencies/vendor, environment files, screenshots, generated `app.min.js` and baseline artifacts. This includes tests, comments, source and tooling: it is **not** a count of customer-visible strings.

| Review category | Matches |
| --- | ---: |
| Source / integration review | 293 |
| Documentation / history review | 72 |
| Provenance / data review | 11 |
| Backend report / contract review | 303 |
| Test expectations | 150 |
| Tooling | 17 |

Priority paths: `index.html`, `js/storefront.js`, `js/estimator.js`, `js/app.js`, `js/value_guide_pdf.js`, `data/data-manifest.json`, `manifest.webmanifest`, `sw.js`, Supabase report/email handlers, documentation and relevant tests.

Rebuild `js/app.min.js` from `js/app.js` after future changes; never hand-edit the bundle. Inventory remaining literal `ES` logo marks, image assets, filename prefixes and legal prose during the rename; word searches alone do not locate every old-brand mark.

## Verification record (actual, not assumed)

| Check | Result | Evidence |
| --- | --- | --- |
| Full `tests/run_all.ps1` | **89/90 suites passed**, 28 node suites passed | `sea-estates-batch-0-tests.log` |
| Initial map failure | `ui_sf_maps_e2e`: detail tiles loaded **6/8** | Same full-suite log |
| Isolated map rerun | **Passed**; detail **8/8**, search **24/24** tiles loaded | `sea-estates-baseline/map-recheck.log` |
| Overflow sweep | **10/10 widths passed** | `sea-estates-baseline/overflow-sweep.log` |
| Mobile-nav sweep | **13/13 widths passed** | `sea-estates-baseline/mobile-nav-sweep.log` |
| Readability mobile run | **Passed**, including contrast/input labels/touch checks | `sea-estates-baseline/readability-mobile.log` |
| CSS load order / build sync | Passed in full suite | Full-suite log |
| Style snapshot self-test | **0 diffs across three pairs** | `sea-estates-baseline/snapshot-selftest.log` |
| Browser captures | **No uncaught JS exceptions** across 15 route/viewport scenarios; page width equals viewport | `sea-estates-baseline/audit.json` |

The full-suite first pass was **not 90/90 green**. Each suite has a passing run after the targeted map rerun, but no second full-suite run was performed. This records a network-sensitive baseline, not a silently repaired application defect.

Live screenshot requests to the hosted `listing-api/api/site-settings` failed with `net::ERR_FAILED` on each Home context; the site rendered fallback contact copy (including “Contact details available soon”). Do not invent contact details. Map tiles and settings need network-aware verification. Existing readability checks include small-text exemptions and a fallback detail-page audit; passing them is not a comprehensive WCAG certification.

## Batch 0 checklist / artifacts

- [x] Verify repo, clean initial state, local app and worker.
- [x] Inventory brand occurrences, provenance/technical categories, public routes, stylesheet structure.
- [x] Capture real desktop/tablet/mobile routes including a discovered listing detail.
- [x] Inspect rendered baseline screenshots.
- [x] Refresh legacy coverage and document scenario limitations.
- [x] Capture computed-style baseline and run zero-noise self-test.
- [x] Run full suite, isolate original map failure, run responsive/readability gates.
- [x] Save tracker and reusable prompt, model schedule and budget ledger.
- [ ] Obtain user-reported Batch 0 API charge.
- [x] User authorises Batch 1 (“continue”). Model/effort reminder provided; UI effort setting is owner-controlled.

Files added: `tools/sea_estates_baseline.js`, this tracker, `sea-estates-redesign-prompt.md`, baseline screenshots/index/JSON/logs, `sea-estates-batch-0-tests.log`. Generated file refreshed: `css/legacy-coverage.json`. No commit was requested or made.

## Batch 1 — visual-direction proposal

- [x] Review baseline and existing local artwork.
- [x] Develop three direction options, with **Coastal Ink** recommended.
- [x] Build standalone Home, Properties/search, sample property-detail, guide-entry, Coming Soon and contact-preview screens.
- [x] Keep exact SEA Estates spelling; required Properties / BATANGAS VALUE GUIDE / Coming Soon entries visible through desktop/mobile navigation and page sections.
- [x] Test sample interactions, keyboard entry/menu, field error/reset behavior and no automatic barangay selection.
- [x] Generate **33 screenshots**, inspect representative rendered pages, correct intrinsic card image height and undersized section labels.
- [x] Final prototype review: **150/150 checks passed** at 320/390/768/1440px; all tested palette pairs pass contrast thresholds.
- [x] Production-hash comparison: nine baseline application files unchanged. No external API requests from prototype.
- [x] Save design rationale, prototype limits, assets and review evidence.
- [x] Owner chooses Clear Horizon; previous sparse layout rejected. Current improved-original layout still awaits review.
- [ ] Owner supplies actual API charges for batches 0 and 1.
- [ ] Owner authorises Batch 2 and switches to Sol/medium.

Added: `docs/sea-estates-design/{index.html,preview.css,preview.js,README.md,review-results.json,screenshots/}` and `tools/sea_estates_design_review.js`. Updated tracker and reusable handoff prompt. No production branding changed yet and no new full application regression run was claimed. Existing application baseline remains as recorded above.

**Implementation reminders from the mockup:** the preview is a layout demonstration, not a new valuation engine. Retain live maps/filter state/sort/pagination, full guide inputs/report flows, Privacy Notice/account/service links and Coming Soon consent when integrating. `#value-guide` is a prototype route only; production routing must preserve Home's existing calculator and the distinct consultation journey.

## Revised Step 1 — improved original, Clear Horizon

This replaces the previous sparse-layout direction; keep its files for reference, not as the implementation target.

- [x] Owner chooses Clear Horizon and instructs improving the original instead.
- [x] Owner confirms equal Properties/guide importance, compact guide entry, English only and expanding listing geography.
- [x] Owner authorises revised Step 1 (“go with step 1”). Sol/medium model reminder issued.
- [x] Generate an isolated review document from the actual root app, preserving all original scripts and stylesheet order.
- [x] Add presentation overlay: equal entry panels, early featured listings, expandable original calculator, improved service grid, original summary/process/contact, new Coming Soon teaser.
- [x] Guard storage and writes before app boot; preview contact/account submissions cannot mutate live records.
- [x] Run actual guide path: Balayan/Baclaran/commercial/200sqm, ownership stage, real reconciled result and 17 report sections; return keeps real input state.
- [x] Capture original vs improved screenshots at 390/768/1440px, calculator open states and real result (**16 images**).
- [x] **40/40 targeted checks passed**, including no detected overflow, input sizing, selected palette contrast, original search routing, Coming Soon visibility, storage isolation and no network mutations/uncaught JS errors.
- [x] Visually inspect desktop/mobile/tablet homepage, calculator and actual report; correct line-break concatenation and legacy CTA colours.
- [x] Nine production source hashes unchanged; no full production regression rerun claimed.
- [ ] Owner reviews/approves current homepage layout or requests adjustments.
- [ ] Step 2 focused visual critique on Astra/high; then approved integration on Sol/medium.
- [ ] Owner provides updated cumulative API usage.

Artifacts: `docs/sea-estates-improved/{index.html,guard.js,improved.js,improved.css,README.md,review-results.json,screenshots/}`; `tools/build_sea_improved_preview.js`; `tools/review_sea_improved_preview.js`. `index.html` inside that folder is **generated**, not a replacement for the application root document. Actual contact/API report/account writing remains disabled in the review page; production flows are not changed. Preview DOM-observer technique is not the future production implementation architecture.

## Approved implementation — original-site polish

Authorised by the owner's final “implement” after choosing SEA ESTATES/S.E and confirming the full Home calculator. This is an implementation in the local repository, **not a deployment**.

### Delivered

- Current public/auth/internal/print branding, manifest and favicon: **SEA ESTATES / S.E**. New internal PDF filenames and public email/PDF templates use the current brand.
- Current company provenance labels in config/manifest and source documentation updated; BIR orders, laws and numeric factor configuration untouched.
- Legacy globals/storage/API identifiers/contact domains remain compatible. Historic `ES Realty transaction` source labels still classify as transactions (tested), and existing saved historical records were not rewritten.
- Full calculator stays visible in the original Home structure; no disclosure wrapper, new route or replacement engine.
- Clearer Home and consultation/next-step wording, balanced guide/browse action sizing, coverage distinction, calculator field explanations.
- New native disclosure for BIR classification help, usable by tap and keyboard; help body meets the existing 16px floor.
- Property card/detail facts show only positive supplied numbers; absent/zero API defaults no longer appear as fabricated `0 sqm` / `0 beds`. Existing data records are not altered; studios/land get no invented bedroom count.
- Services grid has intentional spacing and last-row sizing, without the old empty filler area.
- Restrained pointer hover/focus card emphasis and single-image zoom; reduced-motion alternatives retained.
- Contact field autofill/mobile phone semantics; saved-vs-emailed report status wording remains distinct and does not falsely confirm delivery.
- Final review tightened delivery confirmation to `pdfSent === true`: a fallback inquiry ID alone no longer implies a report was emailed. Existing guide e2e now exercises a saved ID with `emailSent: false`.
- Bundle regenerated from source, service-worker cache version bumped from v6 to v7 while preserving compatibility prefix.
- Existing original-style sections, Properties, Coming Soon, maps, filters, auth roles and report flow retained. Internal layouts were not redesigned.

### Verification

| Gate | Actual result |
| --- | --- |
| First full run | 87/91 suites; four failures: three outdated copy/title assertions and a real 15px help paragraph |
| Fixes | Updated exact approved copy/title assertions without removing routing/function checks; enlarged help paragraph to 16px |
| Final full run | **91/91 passed**, including all 28 Node suites |
| Subsequent delivery-confirmation fix | Targeted estimator browser suite **86 checks passed** and location-report Node suite **43 checks passed**; full suite was not repeated after this isolated fix |
| New `sea_brand_polish_e2e` | Passed; tests brand/logo, original accent, full calculator visibility, help, placeholder and preserved sections |
| Existing estimator math | Passed; 1,085 computations in the math suite; numerical zonal config and calculation version match pre-change values |
| Build sync | **12 checks passed**, bundle source/hash intact |
| Overflow | **10 widths passed** |
| Mobile navigation | **13 widths passed** |
| Mobile readability | Passed contrast, labels, input-size and target-size checks |
| Snapshot self-test | **0 diffs across three pairs** |
| Internal PDF | Content/provenance/adversarial and browser-download checks passed under the new brand |
| Rendered screenshots | Desktop/mobile Home plus full homepage visually reviewed; 24 captures saved at 390/768/1440px |
| Git whitespace check | Passed |

Evidence: `docs/sea-estates-polish-tests.log` (first run), `docs/sea-estates-polish-tests-final.log` (passing run), `docs/sea-estates-polish/` (screenshots and sweep/readability/snapshot logs), and `docs/sea-estates-polish/delivery-confirmation.log` (subsequent targeted fallback-ID regression). New browser test added to CI. No test was removed to achieve a pass.

Build environment note: Terser was missing from root dependencies. Installed `terser@5` in the pre-approved temporary OpenCode directory and used `NODE_PATH` for `node build_app.js`; no repository package/config dependency change was needed. The bundle was built normally, not hand-edited.

### Remaining boundaries / next work

- Hosted Supabase template/SEO changes require a separately requested deployment. No external function deployment, commit or push occurred. Environment-configured sender display names should be checked during deployment.
- Existing email/domain contacts were preserved rather than inventing a new SEA ESTATES address. Saved site settings/historical business records may still hold original wording; no bulk data migration was attempted.
- Rejected previews and historical docs may contain earlier brand names; they are not active UI. SQL migration history/tool comments remain historical/technical artifacts.
- Optional More Filters, sharing, comparison, recently viewed and search-scroll restoration are **not claimed as implemented** in this focused pass. Preserve current chips/sort/map behavior until a next task is authorised.
- Report math and tax/legal assumptions were not independently revalidated by a frontend rebrand; existing numeric behavior remains unchanged.
- Actual billed spend after the owner's USD 45 report remains unknown. Obtain an updated total before further API-heavy work or reserve use.

## Follow-up — remove mobile bottom actions

- Owner requested removal of **Get my property value / Browse / Call us** from the fixed bottom screen area.
- Removed bottom-bar markup from the shared public shell, its contact-phone patch, and the `sf-has-sticky` mount flag. Header/footer/Home actions remain accessible.
- Updated public-navigation assertions to require no bottom action bar and no reserved-spacing class.
- Verified at 390px on Home, Search, consultation and Coming Soon: bar absent, spacing flag absent, `.sf-main` bottom padding **0px**.
- Public-nav suite passed at its standard desktop viewport; mobile-nav suite passed at 390px. The desktop-dropdown public-nav suite was also initially attempted at mobile width; its hidden desktop-dropdown checks failed, while removal checks passed. No unrelated navigation behavior was changed to accommodate the wrong viewport.
- Full application suite was not repeated for this focused follow-up; the preceding full result remains 91/91.
- Model recommendation remains **GPT-6.1 Sol / medium**. No deployment/commit/push.

## Follow-up — simpler Home flow and wording

- Owner requested another Home review with simpler design, flow and wording; original palette/layout remains the foundation.
- Shortened hero to a single explanatory sentence; moved the existing two actions ahead of proof/disclosure text; retained Batangas coverage, BIR independence and non-appraisal disclaimer.
- Guide summary now has three distinct plain-language benefits. Property listings precede the service catalogue; Home has a compact Project B.T. Coming Soon entry linking to the existing consent/notification page.
- Shortened shared service notes, How It Works and contact introduction. No unsupported geographic coverage or new inventory claims added.
- Full calculator, original source math and removed mobile-bar state remain intact. No Blue/Clear Horizon replacement applied.
- Desktop/mobile branding/home order checks and typography/alignment checks passed. Full run: **90/91**, with all browser suites passing; remaining failure was the build harness treating retired bottom-bar attributes as required controls.
- Corrected that harness with two explicit absent-hook contracts and proper single/double quoted negative-query parsing. **13/13 build-sync checks passed** afterward. No broad positive-hook bypass added; no full rerun after the harness correction.
- Ten-width overflow sweep and mobile readability/contrast/labels/targets passed. Six updated Home screenshots saved and inspected; capture helper now waits for lazy images to decode.
- Evidence: `docs/sea-home-refinement/{README.md,full-suite.log,readability.log,overflow.log,captures.json,home-*.png}`. Optional features such as property comparison/sharing/More Filters remain outside this pass.
- Added structural assertions for action placement, listing-before-services order and Home Coming Soon link; updated only the old literal guide-summary heading assertion to the new copy.
- Recommended next model remains **GPT-6.1 Sol / medium**. No deployment/commit/push. USD 45 remains the last supplied usage figure; subsequent costs are unknown.

## Follow-up — mobile Properties search

- Owner authorised the next incremental task (“next”, then “continue”). Model recommendation **GPT-6.1 Sol / medium** reiterated.
- At 600px and below, the form starts with Location, Budget and Search; State / province, Property type and Listing type live in native **More filters**. Desktop retains all five fields in their original order.
- Applied advanced filters automatically open the panel and show their count. Basic-only searches start collapsed; chips, clear/reset, Rent destination and all original parameter names remain covered.
- Move the existing labelled controls rather than duplicate/disable them. Closed-panel values remain in FormData and the URL. Real breakpoint tests preserve unsaved values and focus, including empty advanced fields and the disappearing summary.
- Added focused filter tests and desktop/mobile CI entries, plus a reproducible real-keyboard/resize/screenshot review helper.
- Mobile verification found older 13px listing-location and 14px process-copy overrides; scoped storefront rules now enforce the existing 16px body-copy floor. Typography rerun passed.
- Content-integrity verification originally failed its mobile Coming Soon above-fold assumption. Mobile now scrolls to the button and requires a fully visible, usable, hit-testable target; desktop keeps the first-viewport contract. Both reruns passed. Closed disclosure fields are intentionally excluded from that generic scan and tested explicitly by the new filter suite.
- New filter suite: **20/20 mobile**, **18/18 desktop**. Existing Properties suite passed at both widths. Content integrity, mobile typography/readability/nav, desktop public nav and **13/13 build-sync** checks passed.
- Review helper: **31/31 checks**, no uncaught exceptions, **10 screenshots**. Final overflow sweep: **10/10 widths**. Rendered mobile closed/open/applied, tablet and desktop captures inspected; `git diff --check` passed.
- Evidence: `docs/sea-search-refinement/{README.md,review-results.json,search-*.png}`. No fresh full-suite or remote-CI result claimed; preceding Home full run remains **90/91 followed by passing harness correction**.
- Local review is the next handoff step. Further page changes require the owner's next instruction. Historical rejected prototypes remain reference-only; full Home calculator and original palette remain required.
- Actual API charges since the owner's **USD 45** report remain unknown. No commit/push/deployment.

## Delivered — comparison and Value Guide upgrade

- Owner requested two-property comparison and a calculator/report review using LandValuePH's check page and supplied PDF. Approved the implementation plan, **85%–130% range**, **open results**, and **calculator plus public/internal PDFs**, then instructed “implement”.
- Guest comparison implemented in Properties cards/map/details with an inline two-selection panel, session IDs, accessible toggle/remove/clear, dedicated comparison route, honest missing values and sale/rent semantics. Controls update without replacing inquiry/search drafts. Existing `get` refresh counts property views; favourites/auth/CRM paths are not used for selection.
- Full Home calculator retained in original warm identity. Added progress and review, clearer inputs/defaults, direct street fallback, optional site notes, accessible validation and retry states. Central estimate/range/BIR separated; pricing cards open without contact. Email and consultation actions distinct; accepted request does not imply professional review or confirmed delivery.
- Calculation version **2026.10.1**, fixed 85%–130% planning scenarios. Point-estimate factors and original BIR values retained. Source match/fallback wording corrected; comparable availability no longer changes tax arithmetic.
- Introduced shared browser/Node/Deno finance arithmetic; corrected half-zonal/excess-only CGT and universal extra estate exemption. Estate illustrations explicitly require whole-estate information for actual liability. DST deadline corrected to the general 10-day-after-document-month rule; tax references cite actual legislation and expose assumptions.
- Reference fixture matches **PHP 2,875,000**, range **PHP 2,443,750–3,737,500**, BIR **PHP 1,150,000**, total transaction costs **PHP 232,875**, and after-all-costs **PHP 2,642,125**. Seller-only proceeds with a 3% commission are separately **PHP 2,616,250**. No undisclosed LVIS-blend/PVS-compliance claim copied.
- Fixed real settings envelope and in-session approved-factor cache updates. Formula and factor-setting versions have separate meanings. Corrected internal result headline to central estimate and rebuilt `app.min.js` from source.
- Public report source now has coherent six-section valuation content and no invented neighborhood scores, shared costs/estate scenarios, safe wrapping/currency, page counts and continuation headings. Internal PDF retains six parts with reduced duplication and corrected disclosures. Public HTTP errors, including malformed responses, cannot invoke a second contact fallback; retries retain idempotency keys.
- Fresh baseline **92/92**. First implementation full run **94/95** due stale PDF browser wording/version assertions; corrected run **95/95**. Then final PDF-only proofreading/capture changes were followed by passing content, adversarial layout, tax, reference-renderer and browser-download checks. No third full-run or remote-CI result claimed.
- Visual review **57/57**, **28 screenshots** at 320/390/768/1440px; final overflow sweep **10/10**. Phone readability/type and comparison/delivery checks passed. Fixed insufficient warm-icon/fallback-text contrast, clipped 320px progress copy and sticky-header step occlusion.
- Evidence: `docs/sea-guide-upgrade/README.md`, initial/final full logs, review JSON, screenshots, Bauan public/internal PDF fixtures. Generated PDF text/images inspected; final numeric and geometry checks passed.
- Node CI uses Node 24 for the actual TypeScript-renderer test. New comparison/delivery suites registered; service-worker version **v8** precaches finance module.
- **Publication still required:** `location-report` source and its shared JS/JSON dependencies have not been deployed. Hosted reports may remain old. Local frontend/internal downloads are updated; technical identities, historical records, role boundaries and public consent/CRM workflow preserved.
- No commits, pushes or deployment. **USD 45** remains last reported cumulative API usage; later charges unknown. Sol/medium for the next owner-authorised batch; obtain updated billing before further API-heavy work.

## Delivered - simplified estimate panel and safe auto-adjustment

- Owner reviewed the plan to simplify the three technical panels and then instructed implementation.
- Public step 1 now carries one collapsed `.sf-est-about` disclosure holding `.sf-est-reference-disclosure`, `.sf-est-time-inputs` and `.sf-est-cost-inputs`. Plain-language facts read first: government reference (register label + imported schedule effective date), land method, transaction costs.
- Internal wizard stage 1 replaces the always-expanded `Land planning method` and `Transaction scenario` groups with `vgAboutGroup` plus three nested `vgDisclosure` sections. The `data-vg-reference-status` callout and every `data-vg-set` hook are preserved.
- Formula, factors and BIR values unchanged at **2026.10.3**. No imported reference number, proposed SMV, or statutory tax input was altered.
- Three defects introduced by the nesting and fixed: (1) `showErr` opened only the nearest `<details>`, leaving the focused cost/rate field inside a closed ancestor with a zero bounding box - `openDisclosureChain` now walks the full chain; (2) the step-1 re-render closed any panel the reader had opened - `est.openPanels` records intent from `data-est-panel` toggles, and the parse-time `open` attribute does not fire `toggle` so a force-opened panel is not pinned; (3) the always-visible hint asserted legal currency the register does not support - it now states the imported schedule and its unverified applicability.
- Safe automation only. Municipality-to-reference selection is automatic. `[data-est-time-apply-evidence]` applies a reviewed local history when one exists and renders **disabled** with an explanation that the calculator will not assume a growth rate, because `register.landTimeEvidence` is empty. Transaction type keeps the labelled resale default and is never switched silently.
- Still not automatic and intentionally so: annual growth or appreciation defaults, activation of the Lipa 2028-2030 or Batangas City proposed SMV, stacking an indexed scenario with factor/market-band/corner multipliers, blanket CGT on developer or unclassified transactions, and provincial fallbacks indexed with an invented single base date.
- New regression suite `tests/value_guide_simplify_e2e.js` **29/29** desktop and mobile; 7 assertions added to `value_guide_internal_e2e`. Full regression **100/100** (99 previous plus the new suite). Overflow sweep **10/10** after the CSS change. Eight panel screenshots at 320/390/768/1440px, collapsed and expanded, in `docs/sea-reference-indexing/about-panel/`.
- Pre-existing unrelated failure found and fixed: the RA 12001 short-title check in `value_guide_internal_node` failed because the doc line wrap split the title across two lines; restored to **72/72**.
- Evidence: `docs/sea-reference-indexing/README.md`, `tools/review_about_panel.js`, `about-panel/` screenshots.
- **Publication still required:** `location-report` source and shared dependencies remain undeployed. No commits, pushes or deployment. **USD 45** remains last reported cumulative API usage; later charges unknown.