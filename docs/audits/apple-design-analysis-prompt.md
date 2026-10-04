# ES Realty — Apple Design (HIG) Frontend Feasibility Analysis Prompt

You are analyzing whether the ES Realty frontend can adopt Apple design language
(Apple Human Interface Guidelines — clarity, deference, depth) and how feasible it
is on each surface. THIS IS AN ANALYSIS-ONLY TASK. Do not edit, commit, or rebuild
anything. Produce findings, a feasibility verdict per surface, and a phased
implementation plan. No code changes.

## Repository

- Root: `C:\Users\Home-Desktop\Desktop\project 1\es realty`
- Public site routes: `#/home`, `#/search`, `#/project-bt`, `#/listing/<id>`
- Internal app views (hash routes, bilingual EN/TL nav labels from `LANG_NAV`):
  dashboard, wizard (New Investment), deal, appraisal, market, leads, listings,
  portfolio, pms, assistant (AI chat), reports, transactions, financing, playbook,
  users, admin (Brokerage), settings
- Main frontend files:
  - `index.html`
  - `js/storefront.js` (public marketing/pages)
  - `js/app.js` (internal app shell + most views), `js/core.js`, `js/data.js`
  - `css/styles.css` (ONE stylesheet: internal app tokens + storefront sections)
  - `css/bootstrap.min.css` + `css/bootstrap-fallback.css`
  - `build_app.js` (builds `js/app.min.js`)
  - `sw.js` (service worker)
- Existing test harness: `tests/run_all.ps1` (Playwright chromium e2e, `tests/*_e2e.js`)
- Read first: `docs/audits/frontend-ui-baseline.md`, `docs/hosting/migration-github-pages-to-cdn.md`,
  `README.md` — document existing baseline findings and constraints.

## Current Design System (verify by reading the code, don't trust this summary)

- Design tokens: `:root` (dark default: bg `#0A0E14`, accent orange `#F97316`, stroke
  `#2A3446`) and `[data-theme="light"]` overrides. Radius `--radius: 14px`.
  Fonts: Inter-family sans, JetBrains Mono, Georgia serif (storefront + print).
- Internal app = dense decision-support UI: KPI tiles, data tables, wizard steps,
  score rings, sliders, modals, toasts, chat, Leaflet maps, sticky headers.
  Some chromium depth already present: navbar `backdrop-filter: blur(16px)`,
  dropdowns `blur(14px)`, soft shadows, focus rings in orange.
- Public storefront = deliberately warm/editorial: cream `#f4f2eb` background,
  Georgia serif display headlines (up to 108px), orange gradient brand mark,
  pill buttons, framed hero image with rounded top, dark navy info bands.
- Constraints already in play (from existing prompts/tests): 4096-compatible via
  mobile 320px/390px, 48px touch targets, 16px inputs, WCAG contrast targets,
  `prefers-reduced-motion` support, no backend/API/Supabase/market-scan changes,
  preserve the "warm editorial storefront visual language".

## Apple Design Principles to Evaluate (map each to concrete CSS/UX feasibility)

1. **Clarity** — text legibility at all sizes, one clear hierarchy, meaningful
   color use, restraint. Doesn't require SF Pro specifically.
2. **Deference** — content first; chrome, chrome gradients and heavy borders
   recede; UI is fast, clear, consistent. Evaluate against current dense tables.
3. **Depth** — distinct visual layers, translucency/vibrancy, realistic motion;
   elevation communicated by shadows, not heavy outlines.
4. **System typography** — SF-style stack. Note: SF Pro is proprietary and cannot
   be bundled; the current `-apple-system, system-ui, Inter, Segoe UI` stack already
   resolves to SF on Apple devices. Evaluate a type/weight/leading scale.
5. **Inset grouped / grouped list look** — app settings/cards with inset rounded
   grouped surfaces, hairline separators, generous section spacing.
6. **Dynamic appearance** — the app already has tokenized dark/light. Evaluate
   converting to something closer to `systemBackground`/`secondarySystemGroupedBackground`
   semantic pairs and honoring `prefers-color-scheme` + manual toggle.
7. **Vibrancy & materials** — real or simulated `backdrop-filter` (blur/saturate)
   on nav bars, cards, sheets, modals. Flag GPU cost on low-end Android given the
   ~1MB JS bundle; recommend scoping.
8. **Motion & spring curves** — standard ease, `cubic-bezier(.32,.72,.27,1)` style,
   200-300ms transitions, spring-like scale on press, smooth route transitions,
   respecting `prefers-reduced-motion` (already present).
9. **Icons** — SF Symbols are Apple-proprietary; current app uses inline SVG icons.
   Evaluate a consistent, stroke-based, minimal icon set in place of mixed glyphs.
10. **Buttons/controls** — evaluate current buttons, segmented selects, toggles,
    checkboxes, sliders against a system-fidelity control language (capsules,
    clear active/pressed states, 44-48pt touch targets).
11. **Accessibility** — contrast, dynamic type scaling, focus visibility,
    reduced-motion, keyboard/`aria`. Tie to existing WCAG baseline.

## Deliverables

Produce a markdown report structured as:

1. **Gap analysis** — for each surface (internal app vs public storefront vs
   print/Deal Summary output), for each of the 11 principles above: current state
   (quote file:line evidence), gap size (none / small / medium / large), and
   feasibility rating (feasible / feasible-with-constraints / not recommended).
2. **Surface verdicts** — a clear verdict per surface: e.g.
   - Internal app: full Apple-system redesign is feasible (token-based) — estimate
     effort, risk to existing e2e tests, and isolated vs sweeping-diff strategy.
   - Public storefront: Apple-literal look conflicts with the mandated "warm
     editorial" brand language. Recommend which Apple principles can be layered in
     (clarity, deference, depth, motion, system type) WITHOUT flattening the brand,
     and which to explicitly avoid.
   - Print / Deal Summary (Georgia serif, `@media print`): assess keeping paper
     editorial style vs Apple influence; recommend keeping print as-is.
3. **Token migration map** — proposed new `:root`/`[data-theme="light"]` semantic
   tokens (color, radius, spacing, elevation, type scale, motion) mapped to Apple
   equivalents, with explicit "keep unchanged" items (brand orange, storefront
   palette) and a backward-compatibility note.
4. **Phased plan** — Phase 0 (audit/tokens), Phase 1 (controls + type scale),
   Phase 2 (surfaces/depth/motion), Phase 3 (storefront restraint pass), each with
   scope, affected files, risks, and test impact.
5. **Decision log / open questions** — trade-offs (e.g., literal iOS skeuomorphism
   vs "Apple-principled refinement", monospace digits for financial numbers, GPU
   budget for blur, keeping bootstrap vs progressive removal).

## Non-Negotiable Constraints (analysis must respect these)

1. No backend, Supabase, market-scan, API, or auth changes — visual design only.
2. Preserve the warm editorial storefront visual language; Apple adoption there is
   layered, not replacement.
3. Preserve all functionality: search, listings, inquiries, auth, Project B.T,
   portfolio/ledger, CRM, reports/print, service worker, offline/PWA.
4. All current e2e tests must remain passing — a plan that breaks them is not
   feasible; the plan must state test impact per phase.
5. Keep 320px, 390px, tablet, desktop layouts; WCAG contrast; touch targets.

## Non-Breaking Guarantee Contract (requirement, not suggestion)

The user's hard requirement is that NOTHING breaks when the redesign lands.
Treat the following as mandatory acceptance criteria for any recommendation.
Read `docs/audits/apple-design-feasibility.md` §6 for the full spec; summary:

1. **CSS-only default.** Prefer changing `css/styles.css` only. `js/app.min.js`
   is generated by `build_app.js` (terser, no compress/mangle) and must never be
   hand-edited; touching template strings in `app.js`/`storefront.js` triggers the
   full rebuild-and-verify path.
2. **Append, never reorder.** The stylesheet has 464 `!important`, 55 `@media`
   blocks, 799 hex literals and equal-specificity rules resolved by source order.
   New rules append at the end or in a marked `/* === APPLE HIG === */` block;
   existing selectors are never moved/merged/flattened.
3. **Alias, never mutate.** Existing token values and hex literals keep identical
   values; new Apple tokens are added as new names. Guards against unintended
   global visual deltas.
4. **New `!important` banned** except to neutralize a pre-existing later-source
   `!important` (append the neutralizer after it).
5. **Storefront + print excluded.** Cream/Georgia/orange literals and the
   `@media print` block (styles.css:628–661) are untouched by every phase.
6. **Blur budget capped** at the 6 existing `backdrop-filter` sites plus top
   bars/sheets; no full-viewport or per-card vibrancy.
7. **Per-phase commits + gate:** `node --check js/app.js`; `node build_app.js`
   (only if JS changed); `tests/run_all.ps1` and `-Mobile` must show zero new
   failures and no regression of previously-passing tests; geometry spot-checks
   on touched controls (44pt targets, 18x18 consent checkbox at every viewport,
   no 320px overflow).
8. **Rollback = git revert** of the phase commit; CSS/JS are network-first in
   `sw.js` so a reverted deploy is live immediately. Never rename cache versions
   unless vendor assets change.