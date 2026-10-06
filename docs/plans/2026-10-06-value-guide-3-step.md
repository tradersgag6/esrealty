# Value Guide 3-Step Flow — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the four-stage Value Guide wizard with Location → Details → Report, computed by a clean-room LandValuePH reference model, with the report naming its model, showing the operator's own listings as context-only comparables, and a rebuilt PDF.

**Architecture:** One new UMD module `js/value_guide_flow.js` owns the factor table and `compute()`. It calls the existing estimator once to obtain the BIR lookup, ownership, comparables and metadata skeleton, then **overwrites only the pricing arithmetic** with the reference model and re-runs `core.integrityCheck`. `js/app.js` keeps its renderers and loses its stage count. The PDF gains sections; it is not rewritten.

**Tech Stack:** Vanilla ES5-compatible JavaScript (UMD), Node `assert` harness, no build step for these files. `js/app.js` is bundled by `node build_app.js`.

**Spec:** `docs/specs/value-guide-3-step.md`

## Global Constraints

- `js/estimator.js`, `js/data.js`, `data/zonal-config.json` and every file under `data/bir-batangas/` are **read-only** in this plan.
- Golden numbers are fixed: `landValue 1343350`, `improvement 1536000`, `total 2879350`, `low 2447448`, `high 3743155`, `perSqm 28794`.
- `rcnRate` is **flat**. No `valuationYear`, no `1.02` factor anywhere in shipped code.
- `state.vg` is still never persisted; `stripValueGuideDraft` stays as-is.
- Comparables are context only: `total`, `low`, `high` must be identical with and without listings.
- No accuracy/PVS/±% language. Reuse the existing banned-term regex.
- Copy fixed by the spec must be reproduced verbatim.
- Every task leaves the suite green.

## Review Focus

1. **Vacant lot with a Building-only answer selected** — the section split must not move a land-only total.
2. **A 45-year-old building** — depreciation must cap at 80%, not run to 112%.
3. **`estimate()` returning an unavailable result** (`no-data`, `no-area`, `integrity-fail`) — `compute()` must pass it through untouched rather than overwriting fields on a failed result.
4. **A street with no exact rate** — `hit.depth > 1` gives a median; `landBase` must still come from the returned `birZonalValue`, never a re-lookup.
5. **Empty listings catalog** — the comparables block renders its empty state, and the numbers do not move.

## File Structure

| File | Responsibility after this change |
| --- | --- |
| `js/value_guide_flow.js` | **new** — factor table, `compute(opts, est)`, `missing(form)` |
| `js/app.js` | 3 stages, renderers, `vgCalculate` → `FLOW.compute` |
| `index.html` | one `<script defer>` for the new module |
| `js/value_guide_pdf.js` | extra `PARTS` sections |
| `tests/value_guide_flow_node.js` | **new** — golden + rules |
| `tests/value_guide_internal_node.js`, `value_guide_internal_e2e.js`, `value_guide_simplify_e2e.js` | updated for 3 steps |
| `tests/value_guide_time_node.js`, `value_guide_time_e2e.js`, `.github/workflows/tests.yml` | deleted |
| `sw.js` | `esrealty-pages-v10` → `v11` |

---

### Task 1: `js/value_guide_flow.js` — factors and `compute()`

**Files:**
- Create: `js/value_guide_flow.js`
- Test: `tests/value_guide_flow_node.js` (create)

**Interfaces:**
- Consumes: `window.ESREALTY_EST` / `require("../js/estimator.js")` — specifically `estimate(opts)` and `core.integrityCheck(result)`.
- Produces: `window.ESREALTY_VG_FLOW` = `{ FACTORS, MODEL, compute, missing }`. `compute(opts, est)` returns a result object in the estimator's own shape with the reference-model pricing applied.

- [ ] **Step 1: Create the test harness**

Create `tests/value_guide_flow_node.js` in the shape of `tests/value_guide_reference_node.js`: `require` of estimator and flow, a `check(name, fn)` helper printing `[PASS] <name>`, an async IIFE, `ALL GREEN (<n> checks)`, `process.exitCode = 1` on throw.

- [ ] **Step 2: The golden fixture test (RED)**

```js
const FLOW = require("../js/value_guide_flow.js");
const EST = require("../js/estimator.js");
const opts = {
  municipality: "BAUAN", barangay: "POBLACION III",
  streetKey: "binay st ressurreccion st", classification: "residential",
  type: "house_lot", area: 100, floorArea: 120, construction: "mixed_chb",
  floors: "2", ageBand: "6-10", corner: false, features: [],
  landMethod: "factor", saleContext: "private-resale"
};
check("golden house-and-lot fixture", () => {
  const r = FLOW.compute(opts, EST);
  assert.strictEqual(r.birZonalRatePerSqm, 11500);
  assert.strictEqual(r.landValue, 1343350);
  assert.strictEqual(r.improvement, 1536000);
  assert.strictEqual(r.total, 2879350);
  assert.strictEqual(r.low, 2447448);
  assert.strictEqual(r.high, 3743155);
  assert.strictEqual(r.perSqm, 28794);
});
```

Run: `node tests/value_guide_flow_node.js`
Expected: FAIL — `Cannot find module '../js/value_guide_flow.js'`.

- [ ] **Step 3: The vacant-lot vector (RED)**

Same fixture with `type: "vacant_lot"`, `floorArea: 0`. Assert `improvement === 0`, `total === 1343350`, `low === 1141848`, `high === 1746355`, `perSqm === 13434`.

- [ ] **Step 4: The model-rules tests (RED)**

Add checks for, and run to confirm they still fail:

```js
check("construction rate table is flat", () => {
  assert.strictEqual(FLOW.MODEL.RCN.mixed_chb, 16000);
  assert.strictEqual(FLOW.MODEL.valuationYear, undefined);
  assert.ok(!/1\.02/.test(require("fs").readFileSync("js/value_guide_flow.js", "utf8")));
});
check("market indicator is exactly 1.174", () =>
  assert.strictEqual(FLOW.MODEL.MARKET_IND, 1.174));
check("range band is 0.85 / 1.30", () => {
  assert.strictEqual(FLOW.MODEL.RANGE_LOW, 0.85);
  assert.strictEqual(FLOW.MODEL.RANGE_HIGH, 1.30);
});
check("no ownership adjustment", () =>
  assert.strictEqual(FLOW.compute(opts, EST).ownershipAdjustmentPct, 0));
check("depreciation caps at 80%", () => {
  const r = FLOW.compute(Object.assign({}, opts, { ageBand: "31plus" }), EST);
  assert.strictEqual(r.depreciatedPct, 80);
  assert.strictEqual(r.improvement, 120 * 16000 * 0.2);
});
check("age 0-5 barely depreciates", () => {
  const r = FLOW.compute(Object.assign({}, opts, { ageBand: "0-5" }), EST);
  assert.strictEqual(r.depreciatedPct, 6.25); // 2.5/40
});
check("integrity check passes", () => {
  const r = FLOW.compute(opts, EST);
  assert.ok(r.integrity && r.integrity.ok, JSON.stringify(r.integrity));
});
check("unavailable results pass through untouched", () => {
  const r = FLOW.compute(Object.assign({}, opts, { area: 0 }), EST);
  assert.strictEqual(r.available, false);
  assert.strictEqual(r.reason, "no-area");
});
```

- [ ] **Step 5: Section-split and additive-net tests (RED)**

```js
check("a building answer never moves a vacant lot", () => {
  const a = FLOW.compute(Object.assign({}, vacant, { features: [] }), EST);
  const b = FLOW.compute(Object.assign({}, vacant, { features: ["fence"] }), EST);
  assert.strictEqual(a.total, b.total);
});
check("net is additive, not compounded", () => {
  const one = netPct(FLOW.compute(vacant, EST));
  // the same fixture with both a +50bp answer and another +50bp answer
  const two = netPct(FLOW.compute(Object.assign({}, vacant, { roadAccess: "paved", community: "subdivision" }), EST));
  assert.ok(Math.abs(two - one - 0.01) < 1e-12, "two +50bp must sum to +100bp");
});
check("landNet never touches the building component", () => {
  const r = FLOW.compute(opts, EST);
  assert.strictEqual(r.improvement, 1536000); // unchanged by the -50bp land net
});
```

`netPct` reads `FLOW.compute(...).referenceModel.net`.

- [ ] **Step 6: Implement `js/value_guide_flow.js`**

UMD pattern copied from `js/value_guide_evidence.js`, publishing
`root.ESREALTY_VG_FLOW`.

Contents:

1. `MODEL` — `MARKET_IND: 1.174`, `RANGE_LOW: 0.85`, `RANGE_HIGH: 1.30`,
   `USEFUL_LIFE: { wood:25, mixed:35, mixed_chb:40, rca:50, rcc:50, steel:50, prefab:30 }`
   (default 40), `DEP_CAP: 0.80`, and `RCN` flat table
   `{ wood_prefab: 8000, mixed_chb: 16000, rca_steel: 18000, steel: 22000, prefab: 14000, rcc: 26000 }`
   keyed to match `data/zonal-config.json`'s `construction` keys where they
   overlap, with the LVPH extras added. **No `valuationYear`.**
2. `FACTORS` — the twelve published rows from spec §3, each
   `{ id, label, section, min, max, options: [{ label, bp }] }`, `bp` in
   hundredths of a percent (e.g. `+50` = +0.50%).
3. `net(input)` — sums `bp` over the three land sections only, returns a
   **fraction** (`-0.005` for the golden fixture).
4. `compute(opts, est)`:
   ```js
   var base = est.estimate(opts);
   if (!base || base.available === false) return base;      // Review Focus 3
   var r = Object.assign({}, base);
   var landBase = Number(r.birZonalValue) || 0;              // Review Focus 4
   var landNet  = net(opts);
   r.landValue   = Math.round(landBase * MODEL.MARKET_IND * (1 + landNet));
   r.landPerSqm  = r.area ? Math.round(r.landValue / r.area) : 0;
   var floor     = Number(opts.floorArea) || Math.round((Number(opts.area) || 0) * 0.6);
   var rcnRate   = MODEL.RCN[opts.construction] != null ? MODEL.RCN[opts.construction] : MODEL.RCN.mixed_chb;
   var life      = MODEL.USEFUL_LIFE[opts.construction] || 40;
   var age       = ageMidOf(opts.ageBand);
   var dep       = Math.min(age / life, MODEL.DEP_CAP);
   var feat      = featureTotal(opts);
   r.improvement = r.type === "vacant_lot" ? 0
                 : Math.round(floor * rcnRate * (1 - dep)) + feat;
   r.total       = r.landValue + r.improvement;
   r.low         = Math.round(r.total * MODEL.RANGE_LOW);
   r.high        = Math.round(r.total * MODEL.RANGE_HIGH);
   r.perSqm      = r.area ? Math.round(r.total / r.area) : 0;
   // overwrite the public-model fields the report and PDF read
   r.marketGuideEstimate = r.total; r.marketGuideRatePerSqm = r.perSqm;
   r.recommendedAskingPrice = r.high; r.unadjustedTotal = r.total;
   r.ownershipAdjustmentPct = 0;
   r.floorsMultiplier = 1; r.ageMidpoint = age;
   r.depreciatedPct = Math.round(dep * 10000) / 100;
   r.buildCostPerSqm = rcnRate; r.construction = opts.construction;
   r.featuresTotal = feat;
   r.factors = null; r.factorStack = null; r.appliedMultiple = null;   // see ruling below
   r.timeIndex = null; r.landMethod = "factor"; r.factorBaseline = null;
   r.referenceModel = { name: "LandValuePH reference model", marketInd: MODEL.MARKET_IND,
                        net: landNet, sections: sectionsOf(opts), rcnRate: rcnRate };
   r.marketGuide = Object.assign({}, r.marketGuide, {
     value: r.total, landValue: r.landValue, comparablePricesUsed: false,
     sourceType: "LandValuePH published reference model" });
   r.integrity = est.core.integrityCheck(r);
   return r;
   ```
   `est.estimate()` may return a promise; if so, `compute` returns one too and
   callers `await` it (the app already does).

**Ruling (recorded):** `appliedMultiple`/`factorStack` are set to `null` so the
shared `appliedMultipleDisclosure()` builder returns `null` and the PDF emits no
"SEA ESTATES market band factor" row on a guide that no longer uses that factor.
The model is named in `r.referenceModel` and in the report/PDF copy instead.
Cost if wrong: the guide's PDF loses one row; no storefront field changes.

- [ ] **Step 7: Run and confirm green**

Run: `node tests/value_guide_flow_node.js` → `ALL GREEN`.

- [ ] **Step 8: Confirm nothing else moved**

Run: `node build_app.js --check && node tests/build_sync_node.js`
Expected: `IN SYNC`, `ALL GREEN`. Then `powershell -NoProfile -ExecutionPolicy Bypass -File tests/run_all.ps1` — full suite green (the new file is inert until Task 2).

- [ ] **Step 9: Commit**

```bash
git add js/value_guide_flow.js tests/value_guide_flow_node.js
git commit -m "feat(value-guide): add the LandValuePH reference calculation module"
```

---

### Task 2: Three-step flow in `js/app.js`

**Files:**
- Modify: `js/app.js:10269` (`VG_STAGES`), `:10459` (stage dispatch), `:10471-10689` (renderers), `:10731` (`vgCalculate`)
- Modify: `index.html` (script tag)
- Test: `tests/value_guide_internal_node.js`, `tests/value_guide_flow_node.js`

**Interfaces:**
- Consumes: `FLOW.compute`, `FLOW.missing` from Task 1; `window.ESREALTY_VG_FLOW`.
- Produces: `renderValueGuide()` emitting three steps. `data-vg-next` now accepts `1|2|3`.

- [ ] **Step 1: Write the failing structural assertions**

In `tests/value_guide_flow_node.js` add source assertions read from `fs`:

```js
const APP = fs.readFileSync("js/app.js", "utf8");
check("wizard has exactly three stages", () => {
  const m = APP.match(/const VG_STAGES = \[([\s\S]*?)\];/);
  assert.ok(m, "VG_STAGES still present");
  assert.strictEqual((m[1].match(/\{ n:/g) || []).length, 3);
  assert.ok(/Location/.test(m[1]) && /Details/.test(m[1]) && /Report/.test(m[1]));
});
check("calculate routes through the flow module", () => {
  assert.ok(/ESREALTY_VG_FLOW/.test(APP));
  assert.ok(!/vgEst\(\)\.estimate\(vgOpts\(\)\)/.test(APP));
});
check("old stage helpers are gone", () => {
  ["function vgStage4", "vgUnavailableReason", "vgAboutGroup", "vgDisclosure"]
    .forEach(n => assert.ok(APP.indexOf(n) < 0, n + " should be deleted"));
});
check("index.html loads the flow module before the bundle", () => {
  const html = fs.readFileSync("index.html", "utf8");
  const i = html.indexOf("js/value_guide_flow.js"), j = html.indexOf("js/app.min.js");
  assert.ok(i > 0 && j > 0 && i < j, "script order");
});
```

Run: `node tests/value_guide_flow_node.js`
Expected: FAIL — three stages not found (four today), `vgEst().estimate` still present.

- [ ] **Step 2: Rewrite `VG_STAGES` and the dispatch**

```js
const VG_STAGES = [
  { n: 1, label: "Location" },
  { n: 2, label: "Details" },
  { n: 3, label: "Report" }
];
```

Dispatch becomes `if (d.stage === 1) body = vgStage1(d, ref); else if (d.stage === 2) body = vgStage2(d, config); else body = vgStage3(d);`

- [ ] **Step 3: Move the renderers**

- `vgStage1` keeps only "Where is the property?" + "What is being valued?" + Guide details. Delete the whole `vgAboutGroup(...)` / `vgDisclosure(...)` block (`:10515-10547`) and the land-method/time-index inputs. The Next gate stays on `missing()`.
- `vgStage2` keeps house details, ownership and title, and gains the review rows that `vgStage3` used to print plus the `data-vg-calc` button.
- `vgStage3` becomes the **Report**: the old `vgStage4` figure block, plus the model callout, comparables and methodology (Task 3 fills those).

- [ ] **Step 4: Route `vgCalculate` and rewrite `vgMissing`**

```js
const FLOW = window.ESREALTY_VG_FLOW;
const r = await FLOW.compute(vgOpts(), vgEst());
d.result = r;
d.stage = r && r.available ? 3 : 2;
```

`vgMissing()` drops its `landMethod === "time-indexed"` branch entirely and delegates to `FLOW.missing(f)`.

- [ ] **Step 5: Add the script tag**

In `index.html`, immediately **after** `<script src="js/value_guide_pdf.js" defer></script>` (line 68) and before `compliance_due.js`:

```html
<script src="js/value_guide_flow.js" defer></script>
```

This position keeps every ordering asserted by `tests/value_guide_multiple_node.js:578` and `:1324` intact (all of those files load earlier).

- [ ] **Step 6: Run and confirm green**

Run: `node tests/value_guide_flow_node.js` → ALL GREEN.

- [ ] **Step 7: Update the internal tests**

`tests/value_guide_internal_node.js` asserts the `renderValueGuide` block lives in `app.js` and that `vgEst().estimate(vgOpts())` is called — rewrite those to the three-stage shape and to `FLOW.compute`. Keep the no-persist assertions for `stripValueGuideDraft` unchanged.

Run: `node tests/value_guide_internal_node.js` → ALL GREEN.

- [ ] **Step 8: Rebuild and run the browser flow**

```bash
node build_app.js
powershell -NoProfile -ExecutionPolicy Bypass -File tests/run_all.ps1 -Test value_guide_internal_e2e
```

Update `value_guide_internal_e2e.js` selectors (`[data-vg-next="2"/"3"]`, `[data-vg-calc]`) for three steps. Expected: ALL GREEN.

- [ ] **Step 9: Commit**

```bash
git add js/app.js index.html js/app.min.js tests/value_guide_flow_node.js tests/value_guide_internal_node.js tests/value_guide_internal_e2e.js
git commit -m "feat(value-guide): replace the four-stage wizard with Location/Details/Report"
```

---

### Task 3: Report sections — model callout, comparables, methodology

**Files:**
- Modify: `js/value_guide_flow.js` (comparables loader helper)
- Modify: `js/app.js` (`vgStage3` report body)
- Test: `tests/value_guide_flow_node.js`

**Interfaces:**
- Consumes: `window.ESREALTY_LISTINGS_API.list()`, `est.core.normalizeComparable`, `est.core.comparableSummary` (all already exported).
- Produces: `FLOW.loadComparables(opts, est) -> Promise<Array>`; report markup with `data-vg-comparables`.

- [ ] **Step 1: Failing copy assertions**

```js
check("report names its model verbatim", () => {
  const html = FLOW.reportSections(FLOW.compute(opts, EST), EST);
  assert.ok(html.indexOf("Reference model: LandValuePH published methodology") === 0);
  assert.ok(html.indexOf("SEA ESTATES factor stack") > 0);
  assert.ok(html.indexOf("2.14x") > 0);
});
check("comparables block renders even when empty", () => {
  const html = FLOW.reportSections(FLOW.compute(opts, EST), EST, []);
  assert.ok(html.indexOf("data-vg-comparables") > 0);
  assert.ok(html.indexOf("No matching listings for this municipality") > 0);
});
check("comparables never move the numbers", () => {
  const a = FLOW.compute(opts, EST);
  const b = Object.assign({}, FLOW.compute(opts, EST));
  b.comparableSummary = { count: 5, medianPricePerSqm: 99999, askingIndication: { value: 1 } };
  FLOW.applyComparables(b, [{ price: 999999999 }]);
  assert.strictEqual(b.total, a.total);
  assert.strictEqual(b.low, a.low);
  assert.strictEqual(b.high, a.high);
});
check("methodology prints the twelve factors and the applied net", () => {
  const html = FLOW.reportSections(FLOW.compute(opts, EST), EST);
  assert.strictEqual((html.match(/data-vf=/g) || []).length, 12);
  assert.ok(html.indexOf("-0.50") > 0 || html.indexOf("-0.5%") > 0);
});
```

Run: `node tests/value_guide_flow_node.js` → FAIL, `reportSections is not a function`.

- [ ] **Step 2: Implement `loadComparables`, `applyComparables`, `reportSections`**

- `loadComparables(opts, est)` — `ESREALTY_LISTINGS_API.list({ region, province: "Batangas", city: opts.municipality, offer_type: "sale", status: "available", limit: 50 })`, filtered by property type, each row through `est.core.normalizeComparable(row, "SEA ESTATES catalog")`, then `est.core.comparableSummary(list)`. Swallow API errors → `[]`.
- `applyComparables(result, list)` — sets `result.comparableSummary` and `result.comparableListingCount` **only**; never touches `total`, `low`, `high`, `perSqm`.
- `reportSections(result, est, list)` — returns the HTML for the model callout, comparables, methodology and construction-rate disclosure. The model callout string is a constant `MODEL_CALLOUT` exported on the module so the copy has one owner.

- [ ] **Step 3: Wire into `vgStage3`**

Insert the sections after the figures/integrity block and before the actions. Load comparables fire-and-forget on stage entry (`FLOW.loadComparables(...).then(list => { d.comparables = list; render(); })`), guarded so a re-render loop cannot start.

- [ ] **Step 4: Run and confirm green**

`node tests/value_guide_flow_node.js` → ALL GREEN.

- [ ] **Step 5: Browser check**

```bash
powershell -NoProfile -ExecutionPolicy Bypass -File tests/run_all.ps1 -Test value_guide_internal_e2e
powershell -NoProfile -ExecutionPolicy Bypass -File tests/run_all.ps1 -Test value_guide_simplify_e2e
```
Expected: both ALL GREEN (update `value_guide_simplify_e2e.js` selectors for three steps).

- [ ] **Step 6: Commit**

```bash
git add js/value_guide_flow.js js/app.js tests/value_guide_flow_node.js tests/value_guide_simplify_e2e.js
git commit -m "feat(value-guide): name the model and show own listings as context-only comparables"
```

---

### Task 4: PDF sections

**Files:**
- Modify: `js/value_guide_pdf.js` (`PARTS`)
- Test: `tests/value_guide_flow_node.js`

- [ ] **Step 1: Failing PDF text assertion**

Reuse the `pdfText` helper shape from `tests/value_guide_reference_node.js:11-20`:

```js
check("PDF carries the model name and the construction disclosure", async () => {
  const PDF = require("../js/value_guide_pdf.js");
  const blob = await PDF.toBlob(PDFLib, FLOW.compute(opts, EST),
    { preparedFor: "3-step flow", preparedBy: "SEA ESTATES", generatedOn: "2026-10-06" });
  const text = pdfText(Buffer.from(await blob.arrayBuffer()));
  assert.ok(text.indexOf("LandValuePH reference model") >= 0, "model named");
  assert.ok(text.indexOf("16,000") >= 0, "construction rate shown");
  assert.ok(text.indexOf("permit-declared") >= 0, "rate disclosure");
  assert.ok(text.indexOf("SEA ESTATES market band factor") < 0, "stale factor label gone");
});
```

Run: `node tests/value_guide_flow_node.js` → FAIL on the first assertion.

- [ ] **Step 2: Add the sections**

Append to `PARTS` (do not reorder existing entries): a *Model & provenance* section reading `r.referenceModel`, a *Construction basis* section printing `rcnRate`, the PSA/turnkey disclosure sentence, and a *Comparables (context only)* section from `r.comparableSummary`.

- [ ] **Step 3: Run and confirm green**

`node tests/value_guide_flow_node.js` → ALL GREEN.

- [ ] **Step 4: Browser PDF suite**

```bash
powershell -NoProfile -ExecutionPolicy Bypass -File tests/run_all.ps1 -Test value_guide_pdf_browser_e2e
```
Expected: ALL GREEN.

- [ ] **Step 5: Commit**

```bash
git add js/value_guide_pdf.js tests/value_guide_flow_node.js
git commit -m "feat(pdf): add model provenance, construction basis and comparables sections"
```

---

### Task 5: Delete time-indexing

**Files:**
- Delete: `tests/value_guide_time_node.js`, `tests/value_guide_time_e2e.js`
- Modify: `.github/workflows/tests.yml` (remove the four `value_guide_time_e2e` lines at 124-127)

- [ ] **Step 1:** Delete both test files; remove lines 124-127 from the workflow.
- [ ] **Step 2:** `Select-String -Path tests\*.js, .github\workflows\tests.yml -Pattern "value_guide_time"` → no matches.
- [ ] **Step 3:** `powershell -NoProfile -ExecutionPolicy Bypass -File tests/run_all.ps1` → ALL GREEN, 100 → 98 suites.
- [ ] **Step 4:**
```bash
git add -A tests/value_guide_time_node.js tests/value_guide_time_e2e.js .github/workflows/tests.yml
git commit -m "test(value-guide): drop the time-indexed scenario suites"
```

---

### Task 6: Stamps, bundle and full regression

**Files:** `sw.js`, `js/app.min.js` (rebuilt)

- [ ] **Step 1:** Bump `VERSION` in `sw.js` from `esrealty-pages-v10` to `esrealty-pages-v11`.
- [ ] **Step 2:**
```bash
node build_app.js
node build_app.js --check
node tests/build_sync_node.js
```
Expected: `IN SYNC`, `ALL GREEN`.
- [ ] **Step 3:** `powershell -NoProfile -ExecutionPolicy Bypass -File tests/run_all.ps1`
Expected: `ALL GREEN`, zero `[FAIL]`.
- [ ] **Step 4:**
```bash
git add sw.js js/app.min.js
git commit -m "chore: bump the service-worker cache version for the 3-step value guide"
```
- [ ] **Step 5:** Full regression once more, then commit the plan and spec:
```bash
git add docs/specs/value-guide-3-step.md docs/plans/2026-10-06-value-guide-3-step.md
git commit -m "docs: record the 3-step value guide specification and plan"
```
