# ES Realty UI Readability and Mobile Repair Prompt

Use this prompt to audit and repair the ES Realty UI. Execute the changes in the
repository; do not return only recommendations. The result must make every
user-facing label, value, status, validation message, backend error, and form
usable and readable on a small phone without flattening the existing design.

## Objective

Make both UI surfaces reliable at mobile and desktop sizes:

- Public storefront: home, property search, map mode, listing detail, Project B.T,
  navigation, carousels, and inquiry/contact forms.
- Authenticated app: dashboard, Investment Wizard, Deal Analysis, Appraisal,
  Market Scan, Store Locator, Listings, CRM/Leads, Pre-Selling, Transactions,
  Financing, Portfolio, PMS, Buyer Portal, Reports, Playbook, Users, Brokerage,
  Settings, modals, tables, and backend loading/error states.

Keep the existing ES Realty visual language: dark/light terminal precision for
the internal app and the warm editorial storefront style for public pages. This
is a readability and responsive repair, not a generic Bootstrap redesign.

## Current Architecture

Verify the repository before editing. It is a no-build static SPA with:

- `index.html` as the shell and auth overlay.
- `css/styles.css` as the internal app, public storefront, Project B.T, and
  responsive styles.
- `css/bootstrap.min.css` pinned locally at Bootstrap 5.3.3.
- `css/bootstrap-fallback.css` as a scoped fallback under
  `html[data-bootstrap="fallback"]`.
- `js/app.js` for authenticated views, state, role filtering, forms, modals,
  local demo mode, Supabase persistence, and Market Scan UI.
- `js/storefront.js` for public routing, listing cards/detail pages, public
  forms, carousels, Project B.T, motion, and map mode.
- `js/listings-api.js` for the public listings/contact/inquiry API client.
- `market-scan/worker/server.js` for the local Market Scan worker on port 8932.
- `market-scan/vercel/api/*` for hosted route adapters.
- `tests/run_all.ps1` and the existing `*_e2e.js` and `*_node.js` fixtures.

The worker and Vercel backend contracts are already fixture-tested. Do not
silently change their business payloads, status semantics, cache behavior,
permissions, or source truth merely to make the UI look better.

## Findings To Fix

Confirm each finding against the current source before changing it.

### 1. Text contrast and type scale

Relevant files:

- `css/styles.css:31-49` theme tokens.
- `css/styles.css:121,202-203,292-294,325-336,543,648` internal labels,
  helper text, badges, and faint text.
- `css/styles.css:805-815,860-864,900-910,946-950,1003-1008` public text and
  form labels.
- `css/styles.css:1022,1044,1056-1057,1074-1077,1084-1086,1096-1107,
  1111-1116,1130-1133,1158,1165,1172-1177` Project B.T text.

Observed problems:

- Light-theme `--text-faint: #98A5B8` is approximately 2.5:1 on white.
- Dark-theme faint text is too weak for some metadata and helper text.
- Functional text is frequently 8-11px, including labels, statuses, consent
  copy, table headings, and backend notices.
- `@keyframes spin` is declared twice near `css/styles.css:425-426`; keep one
  definition while cleaning the stylesheet.
- Some component styles use undeclared variables such as `--border`, `--line`,
  `--muted`, `--danger`, `--card`, `--green`, `--amber`, and
  `--text-secondary`. An invalid color declaration can silently remove a
  border or color and make content appear missing.

Required repair:

- Establish one readable token set for body text, secondary text, muted text,
  borders, surfaces, focus rings, success, warning, and danger in both themes.
- Replace undefined tokens with declared tokens or safe fallbacks. Do not leave
  `var(--token)` declarations that resolve to nothing.
- Use at least 4.5:1 contrast for normal text and 3:1 for large text and
  meaningful controls. Check actual computed foreground/background pairs, not
  only raw hex values.
- Make normal internal and public body copy at least 14px where practical;
  helper, metadata, status, consent, and table copy must be at least 12px.
  Decorative eyebrows, map attribution, and purely ornamental labels may be
  smaller only when they are not required to understand or operate the UI.
- Increase line-height for dense copy to approximately 1.45-1.7 and remove
  excessive uppercase tracking that makes small words hard to scan.
- Preserve readable text at 200% browser zoom and when the user increases the
  default system font size.

### 2. Mobile shell, navigation, and top bar

Relevant files:

- `index.html:53-55` shell markup, including the duplicate closing `</head>`.
- `index.html:203-218` topbar and content shell.
- `css/styles.css:83-103,136-162,564-571,1695-1725` shell and mobile rules.
- `js/app.js:2355-2364` navigation, menu, and theme bindings.

Required repair:

- Remove the duplicate `</head>` and keep valid HTML structure.
- At mobile widths, ensure `.main`, `.content`, topbar children, and every flex/grid
  child have `min-width: 0` where needed. No page-level horizontal overflow.
- Make the topbar usable at 320-414px: title may truncate, but actions must not
  overlap, disappear, or push the document wider. Wrap or stack actions with
  deliberate priority.
- Make the internal sidebar a real mobile drawer: visible scrim, close on
  outside tap and Escape, no body scroll behind it while open, and a clear focus
  path. Keep the existing desktop fixed sidebar.
- Keep touch targets at least 44x44 CSS pixels for menu, close, navigation,
  form, carousel, tab, and primary action controls.
- Convert non-semantic clickable elements such as the theme toggle into a
  keyboard-operable button or equivalent control with an accessible name.
- Fix the theme toggle so it actually switches between light and dark instead
  of always forcing light mode. Preserve persisted theme behavior.
- Keep navigation labels and role-filtered sections visible enough to scan;
  hidden role-restricted items must not leave empty section headings.

### 3. Forms and inputs

Relevant files:

- `css/styles.css:200-238,635-649,1695-1725` shared form/modal rules.
- `js/app.js:2464-2855` Investment Wizard and comparable forms.
- `js/app.js:5595-5620,8169-8202,9626-9650,11854-11886,12600-12620`
  PMS, Listings, Lead, Transaction, and inquiry forms.
- `js/storefront.js:169-177,342,356,397,490` public forms.

Required repair:

- Every editable control must have a visible, associated label. Do not use a
  placeholder as the only label. Preserve existing field names and data paths.
- On mobile, use a minimum 16px font for editable `input`, `select`, and
  `textarea` controls to prevent mobile browser zoom and improve readability.
- Give controls a comfortable minimum height of 44px, clear borders, readable
  placeholder contrast, visible focus rings, and an obvious invalid state.
- Keep numeric inputs usable with decimal/peso input modes and do not break the
  existing numeric formatting behavior in `js/app.js:79-101`.
- Stack dense wizard, appraisal, CRM, PMS, listing, transaction, and public
  fields at narrow widths. Do not force long labels into narrow two-column
  cells.
- Allow long labels, validation errors, helper text, emails, addresses, and
  URLs to wrap. Use `overflow-wrap:anywhere` only where appropriate; do not
  clip required information.
- Make modal bodies scroll internally while keeping the title, close control,
  and action buttons reachable. On mobile, primary and secondary actions may
  stack full-width.
- Preserve entered values when a backend request fails or times out. Re-enable
  the submit control after every terminal state.
- Keep success messages conditional on confirmed backend success. Never show a
  successful contact/inquiry message when the API is missing, offline, timed
  out, or returns an error.
 
### 4. Overflow and component containment

Relevant files:

- `css/styles.css:158-170,313-322,583-584,662,710-720,814,977-983,
  1110-1116,1478-1549,1612-1693` fixed widths, nowrap rules, tables, boards,
  calendars, and cards.
- `js/app.js:8262-8275,8713-8741,9784-9810,11776-11815,12611-12619` detail
  layouts, inquiry/digest tables, transaction sections, and share actions.

Required repair:

- Keep `white-space: nowrap` only for short numeric values, compact badges, or
  controls where an alternate accessible full value exists. Long buttons,
  listing titles, table cells, errors, descriptions, and user-entered content
  must wrap or safely ellipsize.
- Add `min-width: 0` to flex/grid content columns and `max-width: 100%` to
  media, embeds, forms, buttons, and cards.
- Replace hard-coded inline `grid-column:span 2` layout assumptions with named
  responsive classes that stack correctly on one-column mobile grids.
- Wrap the Listing Inquiries and Weekly Broker Digest tables in the same
  deliberate bounded responsive table wrapper used elsewhere. The wrapper may
  scroll horizontally; the page must not.
- Wrap listing share actions so Facebook, X/Twitter, WhatsApp, Viber, and Copy
  Link remain visible and tappable on narrow screens.
- Keep intentional inner scrolling only for:
  - data tables in `.table-wrap` or an equivalent explicit wrapper;
  - CRM calendar grid;
  - desktop kanban board;
  - Project B.T comparison table;
  - storefront thumbnail strip;
  - explicitly horizontally scrollable tab strips.
- For all other content, enforce document-level `scrollWidth <= clientWidth + 1`.

### 5. Public storefront readability and touch behavior

Relevant files:

- `js/storefront.js:42-59,146-177,302-356,401-412,473-490,531-577,590-598,
  741-895`.
- `css/styles.css:787-1017,1218-1349,1351-1469,1727-1802`.

Required repair:

- Preserve the editorial storefront layout, but raise readable body, metadata,
  label, consent, and form text to the shared minimums.
- Keep hero headings responsive without clipping or causing horizontal overflow.
- Make the public header menu keyboard and touch friendly. Close it on Escape,
  outside tap, and route navigation; update `aria-expanded` and accessible
  labels consistently.
- Make carousel controls visible on touch devices. Arrows/dots must be at least
  44px hit areas, keyboard focusable, and must not trigger the card-open action.
  If swipe is added, retain buttons for keyboard and assistive technology users.
- Ensure public search controls stack cleanly at 320-414px and have readable
  labels and 16px mobile input text.
- Keep map controls and map attribution contained. A map or thumbnail strip may
  scroll internally but must not widen the page.
- Ensure public property detail forms are usable at narrow widths and maintain
  consent/error/success states without losing entered data.

### 6. Backend-driven UI states


The UI consumes real and fallback backend data. Repair the presentation and
request lifecycle without changing business rules.

Relevant files:

- `js/listings-api.js:11-30` request wrapper.
- `js/storefront.js:546-577,800-893` public list/detail/contact/inquiry states.
- `js/app.js:7285-7581,7866-7953` Market Scan and Store Locator requests.
- `market-scan/worker/server.js:253-347` route contract reference.
- `BACKEND_DESIGN_FIXTURE_PROMPT.md` for API contract and parity constraints.

Required repair:

- Add bounded request timeouts and safe cancellation or request-generation
  guards to public listing requests and Market Scan requests. A slow or hung
  request must not leave skeletons or a disabled button forever.
- Show distinct, readable states for loading, empty-success, stale/cached,
  blocked-source, rate-limited, timeout, and server-error responses.
- Never render “No properties found” when the request failed. Include a clear
  Retry action that preserves the current filters.
- Public contact, guide, Project B.T, and listing inquiry forms must fail safely
  when `API` is absent, offline, timed out, or returns 4xx/5xx. Only confirmed
  responses may display success.
- Prevent an old Market Scan or Store Locator response from overwriting newer
  filters. If filters change during a request, the latest query wins.
- On Store Locator refresh failure, visibly mark retained data as stale and
  explain its timestamp. Do not silently present old records as fresh.
- Keep worker-specific metadata (`cached`, `refreshed`, `stale`, `warnings`) and
  hosted/Vercel intentional differences honest in the UI. Do not fabricate
  branch counts, listings, or benchmark rows.
- Where authenticated Supabase loads fail, distinguish “no records” from
  “could not load records”; provide Retry or a useful recovery message rather
  than silently rendering a misleading empty state.
- Do not expose tokens, passwords, signed URLs, or private backend payloads in
  visible markup, URLs, or logs.

### 7. Bootstrap compatibility


Bootstrap 5.3.3 is intentionally pinned locally and loads before
`css/styles.css`. Existing app classes overlap with Bootstrap names, including
`.btn`, `.btn-primary`, `.btn-sm`, `.card`, `.row`, `.col-*`, `.nav`, `.nav-item`,
`.badge`, `.toast`, `.grid`, `.tabs`, `.tab`, and `.modal-body`.

- Do not add more indiscriminate specificity hacks or mix two competing modal,
  button, reset, or spacing systems.
- Keep one visual source of truth for internal app controls. If existing custom
  classes remain, scope their overrides deliberately and document the choice;
  otherwise namespace new component classes with `es-` or a feature prefix.
- Ensure the same readable layout works when the local Bootstrap file loads and
  when `html[data-bootstrap="fallback"]` activates.
- Keep business selectors and existing `data-*` hooks stable unless a change is
  required for correctness.



## Test-First Procedure

1. Confirm the app is served at `http://127.0.0.1:8931/index.html` and the local
   worker, when needed, is on `http://127.0.0.1:8932`.
2. Run the existing relevant baseline tests, including the current mobile tests.
3. Record page width, document width, computed colors, font sizes, and failed
   request states before changing CSS or rendering code.

Add a deterministic browser audit such as `tests/ui_readability_mobile_e2e.js`
without external network dependencies. It
must:

- cover public home, search, Project B.T, property detail with a fixture, and
  authenticated internal primary views;
- exercise at least one form, validation error, modal, table, tab strip, loading
  state, API error, retry, and stale/cached state;
- inspect both light and dark themes;
- check document-level overflow and allow only the explicit inner-scroll
  exceptions listed above;
- check computed contrast for visible text and backgrounds;
- check editable controls for readable font size, visible labels, focus style,
  and minimum touch size;
- check long titles, email addresses, addresses, URLs, validation messages, and
  backend warnings for wrapping or safe accessible truncation;
- run at 320x568, 375x667, 390x844, 414x896, 768x1024, and a desktop width;
- use the existing driver conventions (`__msChecks`, `__msOk`, `__msDone`) and
  must not be named `*_node.js` unless it is a Node fixture.




## Acceptance Criteria

- No page-level horizontal scrolling at 320x568, 375x667, 390x844, 414x896,
  768x1024, desktop, and tested landscape sizes.
- Intentional tables, calendars, kanban boards, thumbnail strips, and tab strips
  scroll inside bounded labeled containers only.
- No essential visible text is clipped, overlapped, invisible, or dependent on
  hover. Functional text is at least 12px; normal body copy is generally at
  least 14px; mobile editable controls are at least 16px.
- Visible text meets WCAG contrast targets in light and dark themes, including
  helper text, badges, errors, backend warnings, consent copy, and disabled or
  selected states where applicable.
- Every form has visible labels, readable errors, preserved values on failure,
  usable focus states, 44px touch targets, and a confirmed-success-only flow.
- Every modal, drawer, topbar, menu, carousel, tab strip, and table is usable by
  touch and keyboard at narrow widths.
- Public listing/contact/inquiry requests timeout safely and offer Retry without
  losing context.
- Market Scan and Store Locator show current query, loading, cached/stale,
  warning, rate-limit, empty, and error states accurately. Old responses cannot
  overwrite newer filters.
- Local worker/Vercel API payloads, status codes, permissions, cache semantics,
  and source truth remain unchanged unless explicitly covered by a separate
  backend fixture.
- Existing tests remain green, including:

  ```powershell
  powershell -NoProfile -ExecutionPolicy Bypass -File tests\run_all.ps1
  powershell -NoProfile -ExecutionPolicy Bypass -File tests\run_all.ps1 -Mobile
  ```

- The new UI audit passes for the complete viewport matrix and reports useful
  `[PASS]`/`[FAIL]` details.

## Implementation Order


1. Baseline and add the deterministic readability/mobile audit.
2. Normalize theme tokens, contrast, type scale, wrapping, and focus styles.
3. Repair shell/topbar/sidebar/drawer behavior and global overflow containment.
4. Repair shared form, modal, button, card, table, and responsive grid rules.
5. Repair the highest-risk internal views: Wizard, Appraisal, Listings, CRM,
   Transactions, PMS, Market Scan, and Store Locator.
6. Repair public storefront/search/detail/Project B.T typography, controls,
   carousel, and form states.
7. Add timeout/request-generation/error/retry presentation fixes for backend UI
   calls without changing backend contracts.
8. Run the full desktop/mobile regression suite and review the final diff for
   accidental design, security, or data changes.

viewport matrix.
