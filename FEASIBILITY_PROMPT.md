# Feasibility — New "Feasibility" Tab in Deal Analysis

## 1. Goal
Add a **Feasibility** tab to Deal Analysis (`data-view="deal"`) that chains the
sample's three screens — **Site Planner → Project P&L → Sales Simulator** — into
one shared-state flow, reusing the existing deal model and math engine.
No new backend. No new dependencies.

## 2. Placement analysis (how it implements on this project)
- **Tab registration:** `TABS` in `js/app.js:3872-3875` — append
  `["feasibility", "Feasibility"]` (after `"development"`).
- **Render branch:** `renderDeal()` (`js/app.js:3895-3904`) — add
  `if (tab === "feasibility") html += dealFeasibility(m, raw);`
- **Renderer:** new `dealFeasibility(m, raw)` beside `dealReturns`/`dealDevelopment`
  (`js/app.js:4036-4084`). Follow their conventions: `kpi()` cards (`app.js:3957`),
  `grid grid-4` KPI rows, `card card-pad` + `table.data` detail blocks,
  `badge green/gold/red` for verdicts, `ai-banner` for warnings.
- **Math — reuse, do not duplicate:** `C.model` / `salesReturns` in `js/core.js:160`
  already compute profit, ROI, margin, IRR, NPV, payback, break-even.
  The tab is a *presentation + staging* layer over the current deal's `m.returns`.
- **State:** extend `state.current.development` defaults in `freshDeal()`
  (`js/app.js:1436`) with `unitWidth, unitDepth, frontSetback, sideSetback`,
  and `state.current.sales` (`js/app.js:1437`) with
  `reservationFee, downPct, dpTermMo, velocity, cancelPct`.
  All reads via `C.num(x, default)` so pre-existing saved deals (missing keys)
  keep working. Persist with existing `save()` (localStorage `esrealty_v1`).
- **Inputs:** first editable sliders inside a deal tab. Bind in the post-render
  bind phase next to the `data-dtab` wiring (`js/app.js:6092`), using the
  `data-fz-*` attribute convention (mirrors `data-ap-pd-*` in appraisal tests).
  `input` event → write state → `save()` → `render()` (live KPIs).
  Guard: skip re-render while a slider is dragged is unnecessary — render() is
  cheap here (no maps on this tab).
- **Presets:** extend `applyDevelopmentPreset()` (`js/app.js:1497`) Townhouse entry
  so "Standard" fills unitWidth 8 / unitDepth 15 / setbacks 7/2.
- **Report:** append the feasibility P&L block to `dealSummaryReportHTML()`
  so Print Deal Summary includes it.
- **Entry dependency:** `renderDeal()` shows "No deal loaded" without
  `state.current` — the tab inherits this; the e2e relies on `ensureDeals()`
  auto-seeding `sampleDeal()` (`js/app.js:1428-1431`), so no wizard walk needed.

## 3. Sample flaws fixed (from the PDF analysis)
| # | Sample bug | Fix in this spec |
|---|---|---|
| 1 | Stages disconnected (5 units/600 sqm vs 4 units/800 sqm vs inventory 50) | Single model: Stage 1 outputs (`development.units`, `floorArea`) feed Stage 2 costs and Stage 3 inventory; `syncSalesToDevelopment()` pattern (`app.js:1483`) extended |
| 2 | Lot Depth / Front Setback don't affect floor area (implied fixed 15 m depth) | `units = floor((frontage − 2×sideSetback) / unitWidth)`; `floorArea = units × unitWidth × unitDepth` — every input visibly moves the result |
| 3 | "Marketing ₱3" / "MARGIN (MRR)" / CJK mojibake in 4+ places | Marketing as `%`; "Margin %"; English-only strings (repo gate: readability/mobile tests) |
| 4 | Toy formula (Total = Land + Construction + Marketing) | Full stack: land (negotiated) + construction + site-dev % + prof-fees % + permits + contingency % + carrying + construction financing + marketing; selling costs (CGT/broker/VAT) on revenue — all already in `m.returns` |
| 5 | One static money-losing scenario, no guidance | Break-even units + ROI/IRR/NPV/payback from engine; red badge when margin < 0; gold "review pricing" banner reusing the `priceGap` vs market ₱/sqm logic (`dealOverview`, `app.js:3968`) |
| 6 | Ephemeral state, blank panels pre-run | Persisted per deal; KPIs live-update on every slider input, no "run" button needed |

## 4. The three stages (spec)
- **Stage 1 — Site:** sliders Lot Width (= property.frontage default), Lot Depth
  (= property.depth), Unit Width, Unit Depth; numeric Front/Side Setback; SVG lot
  diagram (reuse `.badge`/legend pattern from market results; keep it CSS/SVG,
  no new libs). Outputs: Units Buildable, Total Floor Area → written to
  `development.units` / `development.floorArea`.
- **Stage 2 — Project P&L:** sliders Construction ₱/sqm (= constCostPerSqm),
  Selling Price/unit, Marketing %; KPIs: Gross Revenue (= price×units),
  Total Cost (engine), Net Profit (red when < 0), Margin %.
  Plus cost-breakdown table (reuse `dealDevelopment` row pattern) and
  Break-Even Units KPI.
- **Stage 3 — Sales Simulator:** sliders Unit Price (defaults from Stage 2),
  Reservation Fee, Down %, DP Term, Velocity/mo, Cancellation %; month-by-month
  cash-in table (reservation + DP schedule at velocity, net of cancellations);
  "Push to Pre-Selling" button seeds `state.presellProjects` inventory matrix
  (structure at `app.js:591-706`).

## 5. Upgrades / suggestions beyond the sample
1. **PH-specific presets:** Socialized (BP 220 price-ceiling guard + DHSUD/LTS fee
   line) vs Economic vs Open-market townhouse — configurable ceilings with a
   "verify current DHSUD ceiling" note; HLURB renamed DHSUD (2019).
2. **Absorption-timed revenue:** sell over `units/velocity` months instead of
   instant — feeds IRR/payback honestly.
3. **Sensitivity strip:** ±10 % on price, cost/sqm, velocity → margin range;
   cheapest decision-grade upgrade available.
4. **Exit-price anchor:** one-line cross-check of Selling Price/unit against
   Market Scan ₱/sqm for the deal city (gold banner if > +15 % above benchmark).
5. **Scenario compare:** "Save as scenario" pushes current inputs into
   `dealScenarios` ranking (`app.js:4106`) so feasibility competes with other goals.
6. **Mobile:** KPI `grid-4` collapses via existing grid classes; sliders ≥44 px
   touch targets (readability gate enforces this).

## 6. Build prompt (copy-paste to the implementing agent)
> In the ES Realty repo, implement the **Feasibility** tab per
> FEASIBILITY_PROMPT.md §§2–4. Edits limited to: `TABS` + `renderDeal()` branch
> (`js/app.js:3872-3904`), new `dealFeasibility(m, raw)` renderer,
> `freshDeal()` defaults (`app.js:1436-1437`), `applyDevelopmentPreset()`
> Townhouse entry (`app.js:1501`), `data-fz-*` bindings beside the `data-dtab`
> wiring (`app.js:6092`), `dealSummaryReportHTML()` block. Math: reuse
> `C.model`/`salesReturns` (`js/core.js:160`) — no new engine. New test
> `tests/feasibility_e2e.js` (auto-discovered by `tests/run_all.ps1`;
> follow `tests/market_scan_filters_e2e.js` probe pattern with
> `__msChecks`/`__msDone`; bootstrap via `ensureDeals()` seeded sample —
> no wizard): asserts tab renders, Stage-1 math
> (frontage 50/setback 2/unit-width 8 → 5 units), chained floor area feeds
> Stage 2 revenue, negative-margin red badge, slider live-update.
> Gates: `node --check js/app.js` → `node build_app.js` →
> `tests/run_all.ps1` + `-Mobile`, zero new failures. Additive only —
> no changes to other tabs, market scan, or stores.

## 7. Acceptance
- Tab visible on a loaded deal; empty state unchanged without a deal.
- 50/2/8 inputs → 5 units; changing any one input moves Units/Floor Area.
- Stage 2 revenue = price × Stage-1 units; margin red when < 0.
- Reload persists all three stages; Print Deal Summary includes the P&L block.
- `feasibility_e2e` green; full suite (desktop + mobile) zero new failures.
