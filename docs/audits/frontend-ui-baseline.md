# ES Realty Frontend UI Audit and Upgrade Prompt

You are upgrading the ES Realty public storefront and frontend experience.
Analyze the current implementation before changing anything, then make the
smallest correct frontend-only improvements. Do not redesign or modify backend
architecture, API contracts, Supabase schema, authentication rules, market-scan
services, or portfolio accounting logic.

## Repository

- Root: `C:\Users\Home-Desktop\Desktop\project 1\es realty`
- Public site: `https://tradersgag6.github.io/esrealty/`
- Public routes: `#/home`, `#/search`, `#/project-bt`, `#/listing/<id>`
- Main frontend files:
  - `index.html`
  - `js/storefront.js`
  - `css/styles.css`
  - `css/bootstrap-fallback.css`
  - `sw.js`
- Existing tests:
  - `tests/ui_readability_mobile_e2e.js`
  - `tests/listings_upgrade_e2e.js`
  - `tests/listings_stale_e2e.js`
  - `tests/run_all.ps1`

## Non-Negotiable Constraints

1. Frontend-only unless a finding is explicitly documented as deferred.
2. Do not change `js/listings-api.js`, Supabase SQL/functions, market-scan APIs,
   database records, authentication permissions, or backend response shapes.
3. Do not hide real failures by weakening tests or adding broad exclusions.
4. Preserve public search, listing detail, inquiries, authentication entry,
   Project B.T, internal application routes, and service-worker registration.
5. Preserve the existing warm editorial storefront visual language.
6. Ensure desktop, tablet, 390px mobile, and 320px narrow-mobile layouts work.
7. Use semantic HTML and CSS instead of recurring runtime DOM repair loops.

## Current Verified Baseline

At 390x844:

- Public home fits the viewport.
- Public home text-size, input-size, labels, and touch-target checks pass.
- Public home still reports two overflowing spans.
- Public home contrast still fails for the Create Account button, eyebrow text,
  hero image caption, floating-stat secondary text, and section eyebrow text.
- Public search fits the viewport and has no uncontained overflow.
- Public search contrast remains below target.
- Project B.T has overflowing `b`, `span`, and `small` content on mobile.
- Project B.T contains 10px descriptive text and multiple contrast failures.
- Public listing-detail fallback contrast is below target.
- Internal pages still have widespread badge/tab/status contrast failures.
- `listings_upgrade_e2e` passes on desktop and mobile.

The following homepage strings are complete in the DOM. If users see them
truncated, treat it as a CSS/layout defect, not missing copy:

- `Shophouses that work harder.`
- `Shophouse. One thriving address.`
- `Shophouses & live-work spaces, handpicked`
- `Where shophouse demand is growing.`
- `Property Sales & Acquisition`

Dummy published titles such as `321321`, `sample`, and `sample1` are data-quality
problems. The frontend may suppress obvious test records as a guard, but do not
delete or mutate backend records. Document backend cleanup separately.

## Priority 0: Correctness and Lost Leads

### 1. Stop false-success form behavior

Audit the Project B.T inquiry, guide-download, consultation, and listing-inquiry
forms in `js/storefront.js`.

Current risk: some forms reset and display success when the API is unavailable,
even though nothing was submitted.

Required behavior:

- Never display success unless the API confirms success.
- Preserve entered values after network/API failure.
- Display an actionable inline error with retry and direct-contact options.
- Disable submit only while a request is in flight.
- Restore focus to the relevant status/error message after failure.
- Prevent duplicate submissions.

### 2. Obtain real consent

Some contact flows submit `consent: true` without a visible required consent
control.

Required behavior:

- Add an explicit required consent checkbox to every lead/contact form.
- Link to the privacy notice.
- Do not submit until consent is checked.
- Do not promise that a guide was emailed unless the response confirms dispatch.
- If email delivery requires backend work, change the frontend success copy to
  accurately state that the request was received and document delivery as
  deferred.

### 3. Remove production-looking fallback contact details

Do not silently show `+63 900 000 0000`, `hello@esrealty.ph`, or an unsupported
response-time promise when site settings fail.

Required behavior:

- Show configured values only.
- On settings failure, show a clear unavailable state or omit the field.
- Keep the inquiry form usable if its submission API is available.
- Do not add hardcoded replacement business details.

## Priority 1: Readability and Responsive Layout

### 4. Fix all text clipping and overflow

Audit headings, cards, sticky animated sections, header actions, Project B.T
tiers, and service cards.

Required behavior:

- Every reported heading must render fully at 320, 360, 390, 768, and 1400px.
- Do not use `overflow-wrap: anywhere` on normal headings if it breaks words.
  Prefer responsive type scales, `overflow-wrap: break-word`, balanced wrapping,
  and intentional soft breaks.
- Avoid `width: 100vw` combined with horizontal padding; use `width: 100%` and
  `box-sizing: border-box`.
- Prevent header brand, Create Account, and menu controls from colliding at 320px.
- Do not clip interactive controls merely to satisfy the page-width assertion.
- Make Project B.T product cards and spec rows wrap without horizontal overflow.

### 5. Establish readable typography

- Body text should normally be at least 16px.
- Metadata should normally be at least 12-14px.
- Inputs must remain at least 16px on mobile to avoid browser zoom.
- Increase line-height where descenders or final punctuation are clipped.
- Keep hero and section headings responsive without dominating narrow screens.
- Remove the 800ms whole-document scan that mutates text to 12px after paint.
  Replace it with explicit markup and scoped CSS.
- Ensure SVG diagram labels that intentionally use small type are not enlarged by
  a global JavaScript loop.

### 6. Meet contrast requirements

Use WCAG AA targets:

- 4.5:1 for normal text.
- 3:1 only for genuinely large text under WCAG thresholds.
- 3:1 for meaningful UI component boundaries and focus indicators.

Audit at minimum:

- Create Account and orange action buttons.
- Eyebrow text on light and dark surfaces.
- Hero image captions and floating-stat secondary text.
- Featured badges, card metadata, locations, and consent text.
- Dark contact CTA details, labels, and statuses under light theme.
- Project B.T labels, tiers, image labels, and ratings.
- Internal app badges, tabs, statuses, role labels, and report-format labels.

Do not apply broad theme overrides that make text dark inside dark-gradient
components. Scope colors to each surface/component.

### 7. Handle placeholder and incomplete listings honestly

- Centralize a frontend predicate for obvious test records.
- Apply it consistently to home, search, map, and hero selection.
- Suppress numeric-only titles and exact sample/test fixtures on public routes.
- Never display missing values as factual `PHP 0`, `0 beds`, or `0 sqm`.
- Display `Not provided` or omit unavailable facts.
- Do not delete or alter backend records.
- Add a separate operational note recommending backend cleanup and publication
  validation.

### 8. Investigate perceived duplicate content

The DOM currently contains one `Property Sales & Acquisition` service card.
Users have reported seeing it repeated.

- Test for duplicate mounting, stale service-worker content, overlapping sticky
  sections, animation clones, and double route rendering.
- Verify only one storefront shell, services section, and service-card set exist.
- Do not remove legitimate content based only on a visual symptom.

## Priority 2: Accessibility and Navigation

### 9. Fix document landmarks

The generated storefront `<main class="sf-main">` is mounted inside the existing
application `<main>`, creating nested main landmarks.

- Ensure exactly one visible `<main>` landmark per route.
- Keep the authenticated app shell compatible with public storefront mounting.

### 10. Make authentication modal accessible

- Add `role="dialog"`, `aria-modal="true"`, and an accessible title.
- Associate labels and controls with `for`/`id`.
- Move focus into the modal on open.
- Trap focus while open.
- Close with Escape.
- Restore focus to the opener on close.
- Prevent background interaction while open.

### 11. Improve route navigation

- On forward route navigation, scroll to the correct top position.
- Move focus to the new page heading or route container.
- Announce route changes to assistive technology.
- Preserve search scroll position for browser Back.
- Do not use `history.length` to decide whether Back may leave the site; track an
  internal referrer and otherwise route to `#/search`.
- Render an explicit accessible not-found view for unknown routes.

### 12. Make mobile menu accessible

- Add `aria-controls` and accurate expanded state.
- Add an accessible label to the menu panel/navigation.
- Support Escape and sensible focus movement.
- Add a max-height and vertical scrolling for short landscape viewports.
- Keep each touch target at least 44x44px.

### 13. Fix carousel semantics

- Update slide `aria-hidden` state whenever the active slide changes.
- Mark the active dot/thumbnail using `aria-current` or `aria-selected`.
- Use a 44px transparent hit area around a small visual dot rather than globally
  enlarging the dot itself.
- Keep previous/next controls keyboard accessible.
- Limit card carousels to a small image subset; load full galleries on detail.

### 14. Label search controls

- Give sort controls an explicit accessible name.
- Group Grid/List/Map controls and expose `aria-pressed` state.
- Ensure all dynamic error/status text uses suitable live regions.

### 15. Correct heading hierarchy

- The listing title, not the price, should be the card heading.
- Render price as emphasized non-heading text.
- Maintain logical `h1` -> `h2` -> `h3` order on each route.

## Priority 3: Frontend Lifecycle and Performance

### 16. Remove persistent runtime repair work

The storefront currently performs a repeated whole-document scan for labels and
small text.

- Replace this with declarative HTML/CSS.
- Clear timers on unmount.
- Disconnect observers and scroll listeners on unmount.
- Destroy map instances and cancel map polling on route change/unmount.
- Prevent detached-node references and authenticated-view CPU usage.

### 17. Improve public bundle loading

Anonymous visitors currently load much of the authenticated application.

- Introduce a minimal public entry path or defer authenticated modules until
  sign-in.
- Do not break the single-page deployment or authenticated routes.
- Measure parse/evaluation time, LCP, CLS, and interaction readiness before and
  after.

### 18. Harden map behavior

- Surface Leaflet load errors and offer retry.
- Do not leave `Loading map` indefinitely.
- Retain/destroy map references correctly.
- Avoid scroll trapping from wheel zoom until the user intentionally interacts.
- Resolve valid same-origin relative image URLs while enforcing HTTPS for remote
  production media.

### 19. Simplify animation on constrained devices

- Two 240vh sticky SVG sections produce a long and fragile mobile experience.
- Use a compact/static version on narrow or short-height viewports.
- Honor `prefers-reduced-motion` without relying on delayed DOM mutations.
- Keep text and important content visible if animation APIs fail.

## Priority 4: Service Worker and Update Reliability

### 20. Correct cache ownership and cleanup

- Delete only caches with the ES Realty cache-name prefix.
- Do not delete unrelated caches on the same origin.
- Add age/count limits for image and map-tile caches.
- Use stale-while-revalidate or versioned URLs for mutable listing images.

### 21. Implement real offline behavior or correct the claims

- Precache a minimal versioned shell if offline launch is required.
- Route failed navigations to a known offline response.
- Decide deliberately whether opaque cross-origin image/tile responses are
  cacheable.
- Test first-load offline, repeat-load offline, and network recovery.

### 22. Coordinate updates

- Avoid silently swapping the service worker mid-session.
- Show an update-ready notice or perform a controlled reload.
- Ensure HTML, CSS, and JS cannot run as a mixed version.

## Priority 5: Metadata, SEO, and Maintainability

### 23. Keep structured data route-correct

- Remove listing JSON-LD when leaving a listing route.
- Use the rental amount for rental offers.
- Avoid stale listing metadata on home/search/Project B.T.
- Update document title and description per route.
- Record server-side/prerendered social previews as deferred if they cannot be
  solved without hosting/backend changes.

### 24. Fix shell metadata

- Remove duplicate `theme-color` declarations or make them media-specific.
- Align Open Graph copy with the public shophouse storefront.
- Add route-appropriate canonical behavior where possible on the client.

### 25. Consolidate CSS

- Remove duplicated late-file override blocks and broad `!important` rules.
- Introduce scoped storefront typography/color/spacing tokens.
- Keep public and internal theme rules separated.
- Fix the desktop search form grid so its declared columns match its children.
- Verify Bootstrap fallback activation using a reliable load test rather than a
  timeout that may activate fallback styles after Bootstrap loaded.

### 26. Review commercial claims

Flag, but do not silently rewrite, claims such as:

- `6-8%` indicative yield.
- Named testimonials.
- Fixed Project B.T prices.
- `3-4 months` delivery estimate.
- Guaranteed response-time or performance language.

Add citations, dates, assumptions, and illustrative disclaimers only after
business/legal approval.

## Test Improvements

Do not weaken `ui_readability_mobile_e2e.js`. Improve it:

- Add real public listing fixtures instead of testing only a missing-detail page.
- Use deterministic readiness selectors instead of fixed short waits.
- Use correct WCAG large-text thresholds.
- Test alpha backgrounds and dark-gradient components accurately.
- Add axe-core or an equivalent accessibility audit if dependency policy allows.
- Add dedicated tests for:
  - Auth modal focus and Escape.
  - Mobile menu keyboard behavior.
  - Route scroll/focus restoration.
  - Carousel state.
  - Sort/view-mode labels and state.
  - Contact-form success/failure/offline cases.
  - Placeholder/incomplete listing rendering.
  - Map load failure and cleanup.
  - Service-worker update and offline behavior.
  - 320, 360, 390, 768, and 1400px viewport screenshots.

## Required Verification Commands

Run from the repository root:

```powershell
node --check js\storefront.js
node tests\cdp_driver_runner.js -test-file tests\ui_readability_mobile_e2e.js -url http://127.0.0.1:8931/index.html -window-size 390,844
node tests\cdp_driver_runner.js -test-file tests\listings_upgrade_e2e.js -url http://127.0.0.1:8931/index.html -window-size 1400,900
node tests\cdp_driver_runner.js -test-file tests\listings_upgrade_e2e.js -url http://127.0.0.1:8931/index.html -window-size 390,844
powershell -NoProfile -ExecutionPolicy Bypass -File tests\run_all.ps1
```

Also run targeted public storefront checks at 320x568, 360x800, 390x844,
768x1024, and 1400x900.

## Acceptance Criteria

1. All reported homepage headings render completely at every required viewport.
2. No visible duplicate service cards or duplicate storefront shells.
3. Obvious test listings do not appear on any public route.
4. Missing property facts are not represented as factual zeros.
5. Public pages have no uncontained horizontal overflow.
6. Public text, controls, badges, and focus indicators meet WCAG AA contrast.
7. No important text is below 12px; body copy is generally 16px or larger.
8. Every form has labels, explicit consent, honest success/error states, and no
   false success when the API is absent.
9. Exactly one visible main landmark exists per route.
10. Auth modal, mobile menu, carousels, and route changes are keyboard and
    screen-reader usable.
11. Storefront unmount removes timers, observers, scroll handlers, and maps.
12. Service-worker caches are bounded, app-owned, update-safe, and tested.
13. Existing listing, authentication, portfolio, and internal workflows remain
    behaviorally unchanged.
14. Full suite has no new failures. Do not mark known failures as skipped.

## Delivery Format

Before implementation, return:

1. Findings ordered by severity with file/line references.
2. A proposed minimal change list grouped by file.
3. Frontend-only versus deferred backend/data items.
4. Test plan and rollback risks.

After implementation, return:

1. Exact files changed.
2. Before/after audit results by viewport.
3. Test results, including any remaining failures.
4. Deferred backend/data cleanup items without implementing them.
