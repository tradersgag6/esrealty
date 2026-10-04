# ES Realty — Apple HIG Feasibility Analysis (Verdict Report)

Analysis-only. No edits made. Source of truth: reading `css/styles.css`
(3,057 lines), `js/app.js` (15,444 lines), `js/storefront.js`, `index.html`,
existing `*_PROMPT.md` files.

---

## 1. Gap Analysis (per surface × per Apple principle)

Legend: gap = none / small / medium / large. Feasibility = feasible / constrained / not recommended.

### A. Internal App (tokenized, `:root` + `[data-theme="light"]`, bootstrap + fallback)

| # | Principle | Current state (evidence) | Gap | Feasibility |
|---|---|---|---|---|
| 1 | Clarity | Token type scale exists but mixed ad hoc sizes (10–34px); dense tables (`table.data`, KPI tiles); already WCAG-focused baseline | medium | **feasible** — encoding scale + spacing tokens is low-risk |
| 2 | Deference | Dense chrome: every card has 1px border + blur (`.card` uses `color-mix` 86% + `blur(14px)`), tables everywhere | medium | **feasible** — soften toward grouped inset surfaces |
| 3 | Depth | Already present: navbar `blur(16px)`, dropdown `blur(14px)`, `.card` blur, layered shadows `--shadow`, score-ring 3D | small | **feasible** — extend consistently |
| 4 | System type | `--font-sans: Inter, -apple-system, Segoe UI` — resolves to SF on Apple devices; JetBrains Mono for figures | small (already SF-first on Apple) | **feasible** — refine weights/leading, keep mono for numbers (financial) |
| 5 | Inset grouped | KPI cards and wizard steps are already card-based; `--radius: 14px` exists | small–medium | **feasible** — hairline separators + grouped sections |
| 6 | Dynamic appearance | Full token pair `:root`/`[data-theme="light"]`; `data-theme` attr + manual toggle; `meta color-scheme` present | none–small | **feasible** — remap to `systemBackground`-style pairs |
| 7 | Vibrancy/materials | `backdrop-filter` already on nav/dropdown/card | small | **constrained** — GPU cost on low-end Android given ~1MB bundle; scope to chrome surfaces only |
| 8 | Motion | Transitions are `all .15s` everywhere; `prefers-reduced-motion` blocks exist; no spring curves | small | **feasible** — normalize to 200–300ms standard curve + press scale |
| 9 | Icons | **Already Apple-ideal**: `ICONS = {...}` inline SVG, 24px viewBox, stroke `currentColor`, `stroke-width 2`, consistent line style (app.js:166–216). SF-proprietary avoided by design | none | **feasible** — no work needed |
| 10 | Controls | Buttons 10px radius, min-height 44px (target), capsules 999px exist; segmented `.tab` present; slider `.wslider` already capsule track/thumb | small | **feasible** — system-fidelity pass |
| 11 | A11y | `prefers-reduced-motion`, `prefers-contrast`, WCAG baseline from existing audits; focus-visible ring in accent | small | **feasible** — Apple parity is mostly achieved |

**Verdict — internal app: Apple-principled redesign is FEASIBLE.** Infrastructure (tokens, icon system, blur layers, dark/light, a11y) is already 60–80% of the way there.

### B. Public Storefront (`#f4f2eb` cream, Georgia serif, orange gradient, pill buttons)

| # | Principle | Current state | Gap | Feasibility |
|---|---|---|---|---|
| 1 | Clarity | Large editorial clamp typography; existing audit lists contrast failures on some text | medium | **constrained** — keep editorial, fix contrast |
| 2 | Deference | Big hero art, but also decorative gradients/borders; search form is dense | medium | **constrained** — whitespace-first pass |
| 3 | Depth | Hero frame shadow, layered cards; no glass on light cream | small | **feasible** — soft elevation |
| 4 | System type | Georgia serif is the *brand* — conflicts with SF-first Apple type. Inter used for UI text | **large** | **not recommended** to replace serif; layer Inter for UI fragments only |
| 5 | Inset grouped | Storefront is image/section-driven, not list-driven | medium | **constrained/not applicable** |
| 6 | Dynamic appearance | Storefront fixes `#f4f2eb` light palette; there IS a `[data-theme="light"]` variant used for internal app | **large** | **constrained** — Apple-literal dark/lights would flatten the warm brand |
| 7 | Vibrancy | Minimal | medium | **feasible** on nav/header only; defer rest |
| 8 | Motion | Hover transforms present | small | **feasible** |
| 9 | Icons | Scattered SVG/emoji-style glyphs | medium | **constrained** — reuse app `ICONS` set |
| 10 | Controls | Pill buttons (`999px`) already Apple-ish; search form 17px radius | small | **feasible** |
| 11 | A11y | Known contrast gaps documented in `docs/audits/frontend-ui-baseline.md` | medium | **must fix** (WCAG, not aesthetic) |

**Verdict — storefront: LAYERED adoption (Clarity/Deference/Depth/Motion/System UI type), NOT Apple-literal.** The "warm editorial visual language" is a mandated non-negotiable (existing prompts). Apple look-alike would destroy the brand; Apple-principle refinement preserves it.

### C. Print / Deal Summary (`@media print` block in styles.css:628–661, Georgia serif, 1px `#999` tables)

- Currently paper-editorial: serif, 11–12px, bordered tables, page-break control, signature blocks.
- Full Apple depth/motion/vibrancy is meaningless in print; Apple "clarity" (type hierarchy on paper) is already partially met.
- **Verdict: NOT RECOMMENDED for Apple adoption. Keep as-is.** Anything Apple-reminiscent here would degrade print fidelity (purists' PDFs must stay clean). Only improvement: align heading scale to the iOS type scale if cheap.

---

## 2. Surface Verdicts (summary)

1. **Internal app — FEASIBLE full Apple-system pass.** Token infrastructure already exists; single largest risk is e2e test breakage (~18 internal views, snapshot-style assertions) → do it as isolated token/type/motion diff + rerun `tests/run_all.ps1`, not sweeping HTML rewrite.
2. **Public storefront — feasible ONLY as layered principle adoption.** Keep cream/georgia/orange brand; refine clarity, whitespace, elevation, system UI type for controls/labels, consistent iconography. Explicitly avoid iOS-glass, forced dark mode, SF-only type.
3. **Print/Deal Summary — NOT RECOMMENDED.** Keep paper editorial style.

---

## 3. Token Migration Map (proposed, apply to `css/styles.css`)

| Current | Proposed semantic | Apple analogy |
|---|---|---|
| `--bg: #0A0E14` / `#F5F7FA` | `--system-bg` | `systemBackground` |
| `--surface / --surface-2 / --surface-3` (some inline `#fff`, `#fafafa`) | `--secondary-bg`, `--tertiary-bg`, grouped surfaces | `secondarySystemGroupedBackground` |
| `--stroke: #2A3446` / `#D0D8E2` | `--separator` (hairline, `0.5px` where possible) | `separator` |
| `--accent: #F97316` (orange) | **KEEP** (brand) | `tintColor` (brand-tinted; Apple replaces blue) |
| `--radius: 14px` | `--radius-s 8 / --radius-m 14 / --radius-l 20 / pill 999` | iOS continuous corners `~10/18/continuous` |
| shadows | `--shadow-s/m/l` tokens | materials from elevation |
| `--font-sans` | keep stack; document that Apple devices already get SF | `systemFont` |
| `--font-mono` | **KEEP** for financial figures (tabular data) | `monospacedSystemFont` |
| transitions `all .15s` | `--dur-fast .15s / --dur-base .25s / --curve` | standard + spring-on-press |

Backward-compat: keep existing var names as aliases so `app.min.js`/inline styles (they reference `var(--accent)` etc. via templates) need ZERO JS changes — CSS-only migration.

---

## 4. Phased Plan

- **Phase 0 — Audit + CSS tokens only** (0 JS changes). New semantic tokens + aliases; run all e2e. Risk: very low.
- **Phase 1 — System controls + type scale.** Buttons, tabs, toggles, inputs, stepper, slider → capsule/system fidelity; encode type scale; ensure 44–48pt; rerun mobile e2e. Risk: low-medium (many `!important` overrides in file — careful with specificity; later source wins).
- **Phase 2 — Surfaces, depth, motion.** Grouped inset cards, hairline separators, elevation tokens, standardize motion + `prefers-reduced-motion`; scope blur budget. Risk: medium (perf, GPU on low-end; snapshot e2e).
- **Phase 3 — Storefront restraint pass (LIGHT only).** Whitespace, contrast fixes, system UI type for labels/controls, reuse `ICONS`. Risk: low if scoped; must NOT touch cream/georgia/orange identity.
- **Explicitly out of scope:** Print styles, backend/Supabase/market-scan, auth, removing bootstrap wholesale.

Test impact per phase: all phases must keep `tests/*_e2e.js` green (`node serve.js 8931` + `tests/run_all.ps1`). Phases 1–2 carry the most risk because the audit baseline is contrast- and overflow-focused and the stylesheet has interleaved `@media` rules that later-source-override each other.

---

## 5. Decision Log / Open Questions

1. **Literal iOS look vs Apple-principled refinement** → recommendation: principled. Brand (orange, warm editorial, serif storefront) is the differentiator; a literal iOS clone signals "template site".
2. **SF Pro availability** → proprietary, cannot bundle. Current `-apple-system` stack already yields SF on Apple devices. Do NOT add a bundled SF Pro web font.
3. **Monospace figures** → keep JetBrains Mono for money/percent (financial data legibility beats Apple's proportional numerals).
4. **`backdrop-filter` budget** → blur is already on 3 chrome surfaces; cap new blur to top bars/sheets. Measure with the ~1MB JS bundle on mid Android.
5. **Bootstrap** → keep (fallback CSS already protects layout); progressive removal is a separate initiative, not part of Apple adoption.
6. **Dark mode on storefront** → Apple-literal auto dark/light would clash with the fixed cream identity; recommend keeping storefront single-light (its brand) while internal app honors `data-theme`.
7. **Icons** → already stroke-based 24px consistent set; treat as final. Only need SF-symbol *semantics* (add names like `leaf`→`spark`), no visual change.

---

## 6. Non-Breaking Guarantee Spec (MUST be honored at implementation time)

Everything below exists so that an implementer can *prove* nothing breaks.

### 6.1 Architecture invariants (changes forbidden)

| Invariant | Reason / evidence |
|---|---|
| No edits to backend, Supabase SQL/functions, `js/listings-api.js`, market-scan, auth | Different deploy surface; unrelated to visual design |
| CSS is the ONLY file changed in Phases 0–2 **unless** a phase explicitly needs markup | Markup lives inside template strings in `app.js`/`storefront.js`; touching it means the whole 1MB `app.min.js` rebuild path must be exercised |
| `js/app.min.js` is generated by `build_app.js` (terser, `compress:false mangle:false`) — never hand-edit | Forensic mismatch breaks parity with `app.js` |
| `state.theme` default `"light"` + `<html data-theme="light">` stay the default | app.js:257, index.html:2 |
| The `@media print` block (styles.css:628–661) is excluded from EVERY phase | Paper Deal Summary is out of scope |
| `prefers-reduced-motion` and `prefers-contrast` blocks are never removed | a11y, existing audit baseline |
| Existing class names and `data-*` hooks (`data-view`, `data-theme`, `[data-ic]`, etc.) never renamed | 15,444-line app.js references them via templates |

### 6.2 CSS safety rules (crash-prevention for a 3,057-line file)

Evidence of fragility: **464 `!important`, 55 `@media` blocks, 799 hard-coded hex literals, 6 `backdrop-filter` sites, equal-specificity rules fighting by source order** (the consent-checkbox bug we "fixed" was precisely this). Therefore:

1. **Append, never reorder.** New rules go at the END of the stylesheet or inside a clearly-marked `/* === APPLE HIG === */` block. Never move/merge existing selectors — source order is semantic in this file.
2. **Alias, never mutate.** Existing token values (`--bg`, `--accent`…) and existing hex literals keep their exact values. New Apple tokens are added as new names. This guarantees zero visual delta outside the intended change.
3. **Never flatten/restructure `@media` blocks.** 55 interleaved blocks override each other; consolidating them is a separate initiative with its own risk, not part of Apple adoption.
4. **New `!important` banned** except to neutralize a pre-existing `!important` in a *later-source* block — and that neutralizer must be appended after it.
5. **Storefront literals stay literal.** Cream `#f4f2eb`, Georgia serif declarations, orange gradient — untouched. Token work is for the internal-app variables only.
6. **Blur budget capped at 6 existing `backdrop-filter` sites + top bars/sheets.** No full-viewport or per-card vibrancy (1MB JS on mid Android).

### 6.3 Per-phase verification gates (definition of "did not break")

Before: server up (`node serve.js 8931`). After each phase, ALL of these must be green in an unmodified tree:

```
node --check js/app.js            # syntax unchanged (anything touching templates)
node build_app.js                 # ONLY if app.js changed; confirm app.min.js rebuilt
powershell -NoProfile -ExecutionPolicy Bypass -File tests\run_all.ps1        # desktop 1400x900
powershell -NoProfile -ExecutionPolicy Bypass -File tests\run_all.ps1 -Mobile # 390x844
```

- **Zero new failures** across all `*_e2e.js` + `*_node.js`. Known baseline failures (documented in `docs/audits/frontend-ui-baseline.md`) must not worsen and no previously-passing test may regress.
- **Geometry spot-checks** on touched components (same CDP technique used for the consent checkbox): buttons ≥44pt, consent checkbox stays 18x18 at every viewport, no new overflow at 320px.

### 6.4 Rollback semantics

- **Per-phase commits.** A phase is a single commit; revert = `git revert <commit>`; re-run the gates above.
- **CSS/JS propagate immediately.** `sw.js` is network-first for everything except `/vendor/`, fonts, images, map tiles (sw.js:56–75) → no stale-cache barrier; a reverted deploy is live on next load. Never touch the immutable cache names unless vendor assets actually change.

### 6.5 Explicit no-break contract

> A phase is accepted only if the pre-change and post-change repos differ ONLY in: (a) the documented token/type/control/motion/whitespace changes for that phase, and (b) the described permitted-file list. Any test result, rendered geometry, theme default, print output, or app.min.js hash that changed outside the phase's documented scope = the phase FAILED the gate and must be reverted.

## Appendix — Evidence Anchors

- Tokens / dark+light: `css/styles.css:7–52`
- Glass already present: navbar `color-mix + blur(16px)` styles.css:220–221; dropdown `blur(14px)` styles.css:273–274; `.card` blur styles.css:272–278
- Buttons: `body .btn` styles.css:246–265 (10px radius, 44px min-height); pills `border-radius:999px` (styles.css:413, `.badge`)
- Slider already capsule: `.wslider` styles.css:452–455
- Icons: `ICONS` app.js:166–216 via `icon()` app.js:217–219 (24 viewBox, stroke 2)
- Print: `@media print` styles.css:628–661
- Storefront identity: cream `#f4f2eb` styles.css:1033; Georgia serif headings styles.css:1054,1075; orange gradient brand mark styles.css:1037
- Theme state: `state.theme: "light"` default app.js:257; `data-theme` on `<html>` index.html:2