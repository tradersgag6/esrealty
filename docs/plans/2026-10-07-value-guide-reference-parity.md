# Value Guide Core Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the value guide's nine questions reach the calculator, so every answer moves the number and no methodology row can print `0.00%` by default.

**Architecture:** One calculation core in `js/value_guide_flow.js` owns the question list, the factor table and the model. `pickInputs(draft)` is the only route from form state into `compute()`; `vgOpts()` is deleted. A missing input yields `NaN`, never `0`, so an unanswered question is reportable as unassessed rather than as a false zero.

**Tech Stack:** Vanilla ES5 in browser globals, UMD modules requireable in Node, `assert` + a local `check()` helper for node tests, PowerShell runner (`tests/run_all.ps1`).

**Spec:** `docs/specs/value-guide-reference-parity.md` — the plan argues from the spec, so the spec travels with it; executors read both.

## Global Constraints

- Every value below is copied verbatim from the spec. Do not re-derive.
- `data/zonal-config.json` and `data/bir-batangas/` are generated and read-only. `build-batangas-data.js` regenerates them.
- `js/estimator.js` is not modified. Its `ownershipAdjustmentPct` stays `0`; its "flags not deductions" semantics and the 80-combination assertion in `tests/value_guide_inputs_node.js` keep passing.
- Ownership deductions land in the factor table as basis points. They must **not** be written to `ownershipAdjustmentPct`, because `integrityCheck` (`js/estimator.js:407`) requires `total === landValue + improvement` when that field is `0`.
- `bp` is hundredths of a percent. 250 bp = 2.5%.
- All copy is ours. The reference's flow, input set and interaction patterns are matched; its visual design, wording and assets are not (spec decision 1).
- Node test command: `node tests/<name>.js`, expected pass output `ALL GREEN (n checks)`.
- Full suite: `powershell -File tests/run_all.ps1 -Test value_guide`.

## Review Focus

1. **Not sure on all nine** — net is 0, table lists nine "Not assessed" rows and nine `assumptions` entries. Not nine `0.00%` rows.
2. **Skipped versus a genuine zero** — "Regular / rectangular" and "Not sure" both contribute 0; only the first is an assessment.
3. **Every answer at its worst** — clamps to `NET_FLOOR`; land value never goes negative.
4. **Legacy classification codes** (`X`, `GP`, `CL`, `A1`) in a saved draft still resolve after the four-button picker.
5. **House & lot, all nine skipped** — building value is still `floorArea × RCN × (1 - dep)`; land net is 0; the nine answers never touch the improvement.

---

### Task 1: `pickInputs` and the question list

**Files:**
- Modify: `js/value_guide_flow.js`
- Modify: `js/app.js:10470` (`vgOpts` deleted, `vgMissing` updated)
- Test: `tests/value_guide_questions_node.js` (create)

**Interfaces:**
- Consumes: `FACTORS` (`js/value_guide_flow.js:55`), existing draft shape from `state.vg.form`.
- Produces:
  - `QUESTIONS: Array<{ id: string, label: string, input: string, factorId: string, notSure: string }>` — nine entries, exported.
  - `pickInputs(draft: Object) -> Object` — maps draft fields onto `{ [factor.input]: value }`, omitting unanswered keys entirely.
  - Removes `vgOpts()` from `js/app.js`. Its sole caller `js/app.js:10682` switches to `pickInputs`.

- [ ] **Step 1: Write the failing test**

Create `tests/value_guide_questions_node.js` following the house style (`assert`, a `check()` helper, `ALL GREEN (n checks)` footer, `.catch(e => { console.error(e); process.exitCode = 1 })`). Header, verbatim from `tests/value_guide_flow_node.js:8-29` so the fixtures are identical:

```js
"use strict";
const assert = require("assert"), fs = require("fs"), path = require("path");
const ROOT = process.cwd();
/* The estimator loads relative URLs through fetch; this shim is copied verbatim
   from tests/value_guide_flow_node.js:10-15 and is required, not optional. */
global.fetch = (u) => {
  const p = path.join(ROOT, String(u).split("?")[0]);
  return Promise.resolve({ ok: fs.existsSync(p), json: () => Promise.resolve(JSON.parse(fs.readFileSync(p, "utf8"))) });
};
const EST = require(path.join(ROOT, "js/estimator.js"));
const F = require(path.join(ROOT, "js/value_guide_flow.js"));

let count = 0;
async function check(name, fn) { await fn(); count++; console.log("[PASS] " + name); }

const OPTS = {
  municipality: "BAUAN", barangay: "POBLACION III",
  streetKey: "binay st ressurreccion st", classification: "RR",
  type: "house_lot", area: 100, floorArea: 120, construction: "mixed_chb",
  floors: "2", ageBand: "6-10", corner: false, features: [],
  landMethod: "factor", saleContext: "private-resale"
};
```

`ROOT = process.cwd()`, not `__dirname` — `value_guide_flow_node.js:9` uses `process.cwd()`
and `run_all.ps1` invokes node from the repo root. `OPTS` carries no factor answers, so an
unmodified `OPTS` produces net 0, which is precisely the defect this task fixes. Wrap the
checks in the same IIFE the house tests use, closing with:

```js
console.log("ALL GREEN (" + count + " checks)");
})().catch(error => { console.error(error); process.exitCode = 1; });
```

Because the checks are async, the `async function check` wrapper and the IIFE are both
required — do not write bare `check("...", () => {...})` for the `compute()` cases.
check("exactly nine questions, each mapped to a live factor", () => {
  assert.strictEqual(F.QUESTIONS.length, 9);
  const factorIds = F.FACTORS.map(f => f.id);
  F.QUESTIONS.forEach(q => assert.ok(factorIds.indexOf(q.factorId) >= 0, q.id + " -> " + q.factorId));
});
check("every factor is fed by at least one question", () => {
  const fed = F.QUESTIONS.map(q => q.factorId);
  F.FACTORS.forEach(f => assert.ok(fed.indexOf(f.id) >= 0, f.id + " has no question"));
});
check("pickInputs omits unanswered keys rather than zeroing them", () => {
  const out = F.pickInputs({ lotShape: "-150", terrain: "", corner: true });
  assert.strictEqual(out.lotShape, "-150");
  assert.ok(!("terrain" in out), "unanswered key absent");
  assert.strictEqual(out.corner, true);
});
check("every question key is renderable from the draft", () => {
  // each QUESTIONS[].input must be a key pickInputs knows how to read
  F.QUESTIONS.forEach(q => assert.ok(typeof q.input === "string" && q.input.length, q.id));
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `node tests/value_guide_questions_node.js`
Expected: FAIL — `QUESTIONS` and `pickInputs` are undefined.

- [ ] **Step 3: Implement**

Add to `js/value_guide_flow.js`:

- `var QUESTIONS = [...]` — nine entries, `input` keys `shape`, `topography`, `frontage`, `access`, `flood`, `utilities`, `titled`, `estate_settled`, `occupancy`. `corner` is asked in step 1 and stays a `bool` factor, not a `QUESTIONS` entry. `zonalRecency` is derived and stays out.
- `function pickInputs(draft) -> Object` — for each of the nine, copy `draft[input]` only when it is neither `undefined` nor `""`; return the object. Also copy `corner` when truthy.

In `js/app.js`, delete `vgOpts()` and change `js/app.js:10682` to
`window.ESREALTY_VG_FLOW.pickInputs(d.form)`.

- [ ] **Step 4: Run it to verify it passes**

Run: `node tests/value_guide_questions_node.js`
Expected: `ALL GREEN (4 checks)`

- [ ] **Step 5: Run the existing flow test**

Run: `node tests/value_guide_flow_node.js`
Expected: FAIL only on golden totals, because inputs now reach factors. Record which assertions moved; Task 4 updates them.

- [ ] **Step 6: Commit**

```bash
git add js/value_guide_flow.js js/app.js tests/value_guide_questions_node.js
git commit -m "feat(value-guide): single pickInputs route from draft to factors"
```

---

### Task 2: Unanswered is `NaN`, not zero

**Files:**
- Modify: `js/value_guide_flow.js:111` (`factorBp`), `:137` (`sectionsOf`), `:328` (`methodologySection`)
- Test: `tests/value_guide_questions_node.js` (append)

**Interfaces:**
- Consumes: `QUESTIONS`, `pickInputs` from Task 1.
- Produces: `factorBp(factor, input) -> number` returning `NaN` when the key is absent. `sectionsOf(input)` rows gain `assessed: boolean`. `compute()` result gains `assumptions: Array<{ id, label }>`.

- [ ] **Step 1: Write the failing test**

```js
check("a skipped question is NaN, not zero", () => {
  assert.ok(Number.isNaN(F.factorBp({ input: "terrain", options: [{ value: "0", bp: 0 }] }, {})));
});
check("an answered zero is a real zero, not NaN", () => {
  assert.strictEqual(F.factorBp({ input: "terrain", options: [{ value: "0", bp: 0 }] }, { terrain: "0" }), 0);
});
check("all nine skipped: net is zero, nine rows unassessed, nine assumptions", async () => {
  const r = await F.compute(OPTS, EST);
  const rows = F.sectionsOf({});
  assert.strictEqual(r.assumptions.length, 9);
  rows.forEach(row => assert.strictEqual(row.bp, null, row.id + " reports null");
  assert.ok(Number.isFinite(r.total) && r.total > 0);
});
check("netOf treats NaN as no contribution, never as NaN", () => {
  assert.ok(Number.isFinite(F.netOf({}, true)));
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `node tests/value_guide_questions_node.js`
Expected: FAIL — `factorBp` is not exported and returns `0` for `{}`.

- [ ] **Step 3: Implement**

- `factorBp`: when the key is absent, return `NaN`. When present but no option matches, return `NaN` too (an unmatched value is unassessed, not a silent zero).
- `netOf`: skip any factor whose `factorBp` is `NaN`. A skip contributes nothing and does not poison the sum.
- `sectionsOf`: emit `bp: NaN` and `assessed: false` for skips; `assessed: true` otherwise.
- `compute`: build `r.assumptions` from every factor with `assessed === false`, using the question label.
- `methodologySection`: render `assessed === false` as `Not assessed` with `data-vf-unassessed` on the `<th>`; render `0.00%` only when `assessed === true` and `bp === 0`.
- Export `factorBp`, `pickInputs`, `QUESTIONS`.

- [ ] **Step 4: Run it to verify it passes**

Run: `node tests/value_guide_questions_node.js`
Expected: `ALL GREEN (8 checks)`

- [ ] **Step 5: Commit**

```bash
git add js/value_guide_flow.js tests/value_guide_questions_node.js
git commit -m "feat(value-guide): distinguish a skipped question from a zero adjustment"
```

---

### Task 3: Split title, add inheritance and occupancy

**Files:**
- Modify: `js/value_guide_flow.js:73` (`titleDoc`), FACTORS array
- Test: `tests/value_guide_questions_node.js` (append)

**Interfaces:**
- Consumes: `factorBp`, `QUESTIONS` from Task 2.
- Produces: factor ids `titleDoc` (rewritten), `inheritance` (new), `ownership` (new).

- [ ] **Step 1: Write the failing test**

```js
check("title, estate and occupancy are three separate factors", () => {
  const byId = id => F.FACTORS.filter(f => f.id === id)[0];
  assert.ok(byId("titleDoc"), "titleDoc");
  assert.ok(byId("inheritance"), "inheritance");
  assert.ok(byId("ownership"), "ownership");
});
check("title carries the /check deductions, not the old ones", () => {
  const t = F.FACTORS.filter(f => f.id === "titleDoc")[0];
  assert.deepStrictEqual(t.options.map(o => o.bp), [0, -800, -1500]);
});
check("pending estate costs 1000 bp and occupancy 500/1000/2500", () => {
  const i = F.FACTORS.filter(f => f.id === "inheritance")[0];
  const o = F.FACTORS.filter(f => f.id === "ownership")[0];
  assert.strictEqual(i.options.map(x => x.bp)[1], -1000);
  assert.deepStrictEqual(o.options.map(x => x.bp), [0, -500, -1000, -2500]);
});
check("no ownership deduction reaches ownershipAdjustmentPct", async () => {
  const r = await F.compute(OPTS, EST);
  assert.strictEqual(r.ownershipAdjustmentPct, 0);
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `node tests/value_guide_questions_node.js`
Expected: FAIL — `inheritance` and `ownership` do not exist.

- [ ] **Step 3: Implement**

Rewrite `titleDoc` options to `0 / -800 / -1500` labelled clean title / previous owner / tax declaration only. Add `inheritance` with `0 / -1000`, settled / pending. Add `ownership` with `0 / -500 / -1000 / -2500`, owner-occupied / caretaker / tenants / informal settlers. Both new factors sit in `SEC_LEGAL`. Remove titleDoc's old "Inheritance not yet settled" option.

- [ ] **Step 4: Run it to verify it passes**

Run: `node tests/value_guide_questions_node.js`
Expected: `ALL GREEN (12 checks)`

- [ ] **Step 5: Confirm integrity still holds**

Run: `node tests/value_guide_flow_node.js`
Expected: PASS on `integrityCheck`; golden totals still stale pending Task 4.

- [ ] **Step 6: Commit**

```bash
git add js/value_guide_flow.js tests/value_guide_questions_node.js
git commit -m "feat(value-guide): split title, add estate-settled and occupancy factors"
```

---

### Task 4: Retire unreachable factors and the building section

**Files:**
- Modify: `js/value_guide_flow.js` — remove `faultProximity`, `amenities`, `community`, `demand`; delete `SEC_BUILDING`; delete `bldgNet`
- Test: `tests/value_guide_questions_node.js` (append), `tests/value_guide_flow_node.js`

**Interfaces:**
- Consumes: Task 3's factor set.
- Produces: `FACTORS.length === 11`; `compute()` result has no `referenceModel.buildingNet`.

- [ ] **Step 1: Write the failing test**

```js
check("no factor can be left unanswered forever", () => {
  const fed = F.QUESTIONS.map(q => q.factorId).concat(["cornerExposure", "zonalRecency"]);
  F.FACTORS.forEach(f => assert.ok(fed.indexOf(f.id) >= 0, f.id + " unreachable"));
});
check("the building section is gone and no building net is published", async () => {
  assert.strictEqual(F.SEC_BUILDING, undefined);
  const r = await F.compute(OPTS, EST);
  assert.strictEqual(r.referenceModel.buildingNet, undefined);
});
check("the nine questions never move the improvement", async () => {
  const base = await F.compute(OPTS, EST);
  const worst = await F.compute(Object.assign({}, OPTS, {
    lotShape: "-500", terrain: "-800", frontage: "-100", roadAccess: "-200",
    floodRisk: "-500", titleDoc: "-1500", inheritance: "-1000", ownership: "-2500"
  }), EST);
  assert.strictEqual(base.improvement, worst.improvement);
  assert.ok(worst.landValue < base.landValue, "land moved down");
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `node tests/value_guide_questions_node.js`
Expected: FAIL — four retired factors are still present.

- [ ] **Step 3: Implement**

Delete the four factors. Delete `SEC_BUILDING` from the section constants, the `LAND_SECTIONS` entry handling, and the `bldgNet` computation at line 158. `applyModel` uses `landNet` only. Drop `buildingNet` from `referenceModel` and update the methodology copy to a land-only statement.

- [ ] **Step 4: Run it to verify it passes**

Run: `node tests/value_guide_questions_node.js`
Expected: `ALL GREEN (15 checks)`

- [ ] **Step 5: Recompute the golden fixtures**

Run: `node tests/value_guide_flow_node.js`
Expected: FAIL on golden totals only. Update `tests/value_guide_flow_node.js` assertions (`landValue` 1343350, `improvement` 1536000, `total` 2879350, `low`, `high`, `perSqm`) to the values the run prints, and change `"twelve published factors"` to assert `F.FACTORS.length === 11`. Change `"no ownership adjustment"` to assert the field is `0` **and** that `ownership` factor bp reaches the land net.

- [ ] **Step 6: Run the whole value-guide suite**

Run: `powershell -File tests/run_all.ps1 -Test value_guide`
Expected: all green.

- [ ] **Step 7: Commit**

```bash
git add js/value_guide_flow.js tests/value_guide_questions_node.js tests/value_guide_flow_node.js
git commit -m "refactor(value-guide): drop unreachable factors and the building net"
```

---

### Task 5: Clamp the net

**Files:**
- Modify: `js/value_guide_flow.js:30` (`MODEL`), `:124` (`netOf`)
- Test: `tests/value_guide_questions_node.js` (append)

**Interfaces:**
- Produces: `MODEL.NET_FLOOR === -0.15`, `MODEL.NET_CAP === 0.15`.

- [ ] **Step 1: Write the failing test**

```js
check("every answer at its worst clamps to NET_FLOOR and stays positive", async () => {
  const r = await F.compute(Object.assign({}, OPTS, {
    lotShape: "-500", terrain: "-800", frontage: "-100", roadAccess: "-200",
    floodRisk: "-500", titleDoc: "-1500", inheritance: "-1000", ownership: "-2500"
  }), EST);
  assert.ok(r.referenceModel.net >= F.MODEL.NET_FLOOR, "clamped");
  assert.ok(r.landValue > 0, "land value positive");
  assert.ok(r.total > 0, "total positive");
});
check("net cap and floor are symmetric", () => {
  assert.strictEqual(F.MODEL.NET_FLOOR, -0.15);
  assert.strictEqual(F.MODEL.NET_CAP, 0.15);
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `node tests/value_guide_questions_node.js`
Expected: FAIL — `NET_FLOOR` is undefined.

- [ ] **Step 3: Implement**

Add `NET_FLOOR: -0.15, NET_CAP: 0.15` to `MODEL`. In `netOf`, clamp the summed value into that range before dividing by 10000. Enforce each factor's declared `min`/`max` against its resolved option bp.

- [ ] **Step 4: Run it to verify it passes**

Run: `node tests/value_guide_questions_node.js`
Expected: `ALL GREEN (17 checks)`

- [ ] **Step 5: Commit**

```bash
git add js/value_guide_flow.js tests/value_guide_questions_node.js
git commit -m "feat(value-guide): clamp the applied net and enforce factor ranges"
```

---

### Task 6: Single writer for pricing fields

**Files:**
- Modify: `js/value_guide_flow.js:147` (`applyModel`)
- Test: `tests/value_guide_questions_node.js` (append)

**Interfaces:**
- Produces: `applyModel` sets `r.value`, `r.marketGuide.value` alongside `r.total`.

- [ ] **Step 1: Write the failing test**

```js
check("no pricing field keeps the superseded model's number", async () => {
  const r = await F.compute(OPTS, EST);
  assert.strictEqual(r.value, r.total, "value tracks total");
  assert.strictEqual(r.marketGuide.value, r.total, "marketGuide tracks total");
  assert.strictEqual(r.factors, null);
  assert.strictEqual(r.factorStack, null);
});
check("valueGuideEstimate and range follow the single total", async () => {
  const r = await F.compute(OPTS, EST);
  assert.strictEqual(r.marketGuideEstimate, r.total);
  assert.strictEqual(r.low, Math.round(r.total * F.MODEL.RANGE_LOW));
  assert.strictEqual(r.high, Math.round(r.total * F.MODEL.RANGE_HIGH));
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `node tests/value_guide_questions_node.js`
Expected: FAIL — `r.value` still holds the estimator's pre-model number.

- [ ] **Step 3: Implement**

In `applyModel`, after `r.total` is computed, assign `r.value = r.total` and rebuild `r.marketGuide` so `value` and `landValue` match. Leave `ownershipAdjustmentPct`, `floorsMultiplier` and `unadjustedTotal` as they are.

- [ ] **Step 4: Run it to verify it passes**

Run: `node tests/value_guide_questions_node.js`
Expected: `ALL GREEN (19 checks)`

- [ ] **Step 5: Run the suite**

Run: `powershell -File tests/run_all.ps1 -Test value_guide`
Expected: all green.

- [ ] **Step 6: Commit**

```bash
git add js/value_guide_flow.js tests/value_guide_questions_node.js
git commit -m "fix(value-guide): one writer for every pricing field"
```

---

### Task 7: Four classifications, tolerant lookup

**Files:**
- Modify: `js/app.js:10466` (classification field in `vgStage1`)
- Test: `tests/value_guide_questions_node.js` (append)

**Interfaces:**
- Consumes: `ref.classifications` (`data/batangas-zonal.json`).
- Produces: a `CLASSIFICATIONS` map of four labels to codes.

- [ ] **Step 1: Write the failing test**

```js
check("four classifications map to RR, CR, I and A50", () => {
  assert.deepStrictEqual(F.CLASSIFICATIONS.map(c => c.value), ["RR", "CR", "I", "A50"]);
});
check("legacy and agricultural codes still resolve to a rate", async () => {
  for (const code of ["X", "GP", "CL", "A1", "A49"]) {
    const r = await F.compute(Object.assign({}, OPTS, { classification: code }), EST);
    assert.ok(r.available !== false, code + " resolves");
  }
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `node tests/value_guide_questions_node.js`
Expected: FAIL — `CLASSIFICATIONS` is undefined.

- [ ] **Step 3: Implement**

Add to `js/value_guide_flow.js`:

```js
var CLASSIFICATIONS = [
  { value: "RR", label: "Residential" },
  { value: "CR", label: "Commercial" },
  { value: "I", label: "Industrial" },
  { value: "A50", label: "Agricultural" }
];
```

Export it. In `js/app.js:10466`, render `data-vg-set="classification"` from `CLASSIFICATIONS` instead of all 35 keys. Leave the estimator's rate lookup untouched so legacy codes still resolve.

- [ ] **Step 4: Run it to verify it passes**

Run: `node tests/value_guide_questions_node.js`
Expected: `ALL GREEN (21 checks)`

- [ ] **Step 5: Commit**

```bash
git add js/value_guide_flow.js js/app.js tests/value_guide_questions_node.js
git commit -m "feat(value-guide): four classifications with tolerant legacy lookup"
```

---

### Task 8: Calibration fixtures and the measured threshold

**Files:**
- Create: `tests/fixtures/value-guide-calibration.json`, `tests/value_guide_calibration_node.js`
- Modify: `js/value_guide_flow.js:31` (`MARKET_IND`), `:32-33` (range band)

**Interfaces:**
- Consumes: `compute()`, `data/batangas-zonal.json` `municipalities[].byClass`.
- Produces: a measured `medianDeviationPct` recorded in the fixture file, and an asserted threshold.

- [ ] **Step 1: Write the failing test**

Create `tests/value_guide_calibration_node.js` loading the 24 fixtures and asserting `medianAbsDeviation <= fixtures.threshold.medianAbsDeviationPct` and `shareWithinP25P75 >= fixtures.threshold.shareWithinP25P75`.

- [ ] **Step 2: Run it to verify it fails**

Run: `node tests/value_guide_calibration_node.js`
Expected: FAIL — the fixture file does not exist.

- [ ] **Step 3: Build the fixtures**

Pick 3 municipalities with distinct p50 spreads and 4 classifications, 2 lot sizes each. For each, read `p25`/`p50`/`p75` from `data/batangas-zonal.json` and record them alongside the location. Record `threshold` after the first measured run, in the fixture file, with a comment naming the run that produced it.

- [ ] **Step 4: Run it and record the measurement**

Run: `node tests/value_guide_calibration_node.js`
Expected: prints the measured median deviation and the p25–p75 share.

- [ ] **Step 5: Decide the three constants from the measurement**

Compare the measured result for `MARKET_IND` 1.174 against 1.0, the range band against the published ±15%, and `MODEL.RCN` against the spec's four-source table. Record the choice and its source in the fixture file. Re-run until the threshold reflects the settled constants.

- [ ] **Step 6: Run it to verify it passes**

Run: `node tests/value_guide_calibration_node.js`
Expected: `ALL GREEN (n checks)`

- [ ] **Step 7: Commit**

```bash
git add tests/fixtures/value-guide-calibration.json tests/value_guide_calibration_node.js js/value_guide_flow.js
git commit -m "test(value-guide): pin the measured calibration threshold"
```

---

### Task 9: Report copy and the honest claim

**Files:**
- Modify: `js/value_guide_flow.js:328` (`methodologySection`), `:350` (`reportSections`), `MODEL_CALLOUT`
- Modify: `js/value_guide_pdf.js:720` (construction-rate row)
- Test: `tests/value_guide_pdf_node.js`

**Interfaces:**
- Produces: report copy carrying the spec's permitted claim, a "What we didn't check" list, and a named construction rate.

- [ ] **Step 1: Write the failing test**

In `tests/value_guide_pdf_node.js`, assert the generated text contains `"Derived from published BIR zonal values"`, does **not** contain any market-price claim, contains `"Not assessed"` when a question is skipped, and names the construction rate used.

- [ ] **Step 2: Run it to verify it fails**

Run: `node tests/value_guide_pdf_node.js`
Expected: FAIL on the new copy assertions.

- [ ] **Step 3: Implement**

Replace "the twelve published answers" with the generated count. Add the assumptions list. Add the comparables empty state naming the absence of Batangas listings. Put the permitted claim and the RA 9646 disclaimer in `MODEL_CALLOUT`. Leave `data/zonal-config.json` untouched; the PDF names the rate it used, sourced from `referenceModel.rcnRate`.

- [ ] **Step 4: Run it to verify it passes**

Run: `node tests/value_guide_pdf_node.js`
Expected: `ALL GREEN (n checks)`

- [ ] **Step 5: Commit**

```bash
git add js/value_guide_flow.js js/value_guide_pdf.js tests/value_guide_pdf_node.js
git commit -m "docs(value-guide): state what the estimate is derived from"
```

---

### Task 10: Fix the brittle source-text assertions

**Files:**
- Modify: `tests/value_guide_internal_e2e.js:85`, `:103`
- Modify: `tests/value_guide_pdf_node.js:120`

**Interfaces:**
- Consumes: Tasks 1–9.
- Produces: three tests that assert behaviour rather than source text.

This task only rewrites assertions that Task 1 invalidated, so nothing here starts failing on
its own. Run the suite first to confirm the current state.

- [ ] **Step 1: Confirm the suite fails for exactly the expected reason**

Run: `powershell -File tests/run_all.ps1 -Test value_guide`
Expected: FAIL in `value_guide_internal_e2e.js` on the `vgOpts` literal, because `vgOpts`
no longer exists after Task 1. Any other failure is a regression from Tasks 1–4 and must be
fixed before continuing.

- [ ] **Step 2: Rewrite `value_guide_internal_e2e.js:103`**

It currently requires the literal `ESREALTY_VG_FLOW.compute(vgOpts(), vgEst())`. Replace
with a behavioural assertion: after calculating, `result.value === result.total` and
`result.assumptions` is an array.

- [ ] **Step 3: Rewrite `value_guide_internal_e2e.js:85`**

It forbids literal `fetch(` in `renderValueGuide`. Keep the intent — the guide must not
fetch — but the node suite already proves `pickInputs` reaches `compute()` with no network
call. Drop the source-grep.

- [ ] **Step 4: Escape the RegExp in `value_guide_pdf_node.js:120`**

`new RegExp(p.title)` throws on regex metacharacters in a part title. Escape the string
before building the pattern.

- [ ] **Step 5: Prove the escape with a failing case**

Add a check to `value_guide_pdf_node.js` that builds the pattern from a title containing
`(` and `+`, so the escaping is tested rather than assumed.

Run: `node tests/value_guide_pdf_node.js`
Expected: FAIL before the escape, `ALL GREEN` after.

- [ ] **Step 6: Run both suites**

Run: `powershell -File tests/run_all.ps1 -Test value_guide`
Expected: all green.

- [ ] **Step 7: Commit**

```bash
git add tests/value_guide_internal_e2e.js tests/value_guide_pdf_node.js
git commit -m "test(value-guide): assert behaviour instead of source text"
```

---

### Task 11: Step 1 and Step 2 rendering

**Files:**
- Modify: `js/app.js:10438` (`vgStage1`), `:10497` (`vgStage2`)
- Test: `tests/value_guide_internal_e2e.js`

**Interfaces:**
- Consumes: `QUESTIONS`, `CLASSIFICATIONS` from Tasks 1 and 7.
- Produces: step 1 with "Where are you in the sale?"; step 2 with nine groups, per-option bp labels and a Not sure tile per group.

- [ ] **Step 1: Write the failing test**

Assert step 1 renders a `data-vg-stage1-stage` control with four options; step 2 renders one `[data-vg-group]` per entry in `QUESTIONS`, each option carrying its bp in `data-vg-bp`, and one `[data-vg-notsure]` per group. Assert selecting Not sure omits the key from `pickInputs`.

- [ ] **Step 2: Run it to verify it fails**

Run: `powershell -File tests/run_all.ps1 -Test value_guide`
Expected: FAIL on the new assertions.

- [ ] **Step 3: Implement step 1**

Add the optional four-option group "Where are you in the sale?" to `vgStage1`. Render classification from `CLASSIFICATIONS`.

- [ ] **Step 4: Implement step 2**

Replace the current ownership block with a loop over `QUESTIONS`. Each group renders its options from the matching factor, each option showing its own bp as a percentage, plus a Not sure tile that leaves the key unset.

- [ ] **Step 5: Run it to verify it passes**

Run: `powershell -File tests/run_all.ps1 -Test value_guide`
Expected: all green.

- [ ] **Step 6: Commit**

```bash
git add js/app.js tests/value_guide_internal_e2e.js
git commit -m "feat(value-guide): render the nine reference questions"
```

---

## Deferred to Plan 2

Home page port, `ESREALTY_VG_MOUNT` export, `sf-vg` styling, the public surface hiding the four
agent-only fields, and the 48 assertions in `value_guide_purpose_e2e.js` and
`value_guide_simplify_e2e.js`. Blocked until this plan is verified (spec decision 12).

The "Calculate value returns to step 1 with cleared fields" defect is expected to fall out
of the Task 11 re-render. If it survives, it is diagnosed then, not before.

## Follow-up, not scheduled

Persist each guide run's inputs and estimate so a real market comparison becomes possible
once Batangas listings exist. Not built here: no Batangas listings exist, and no listing
median may be shown until they do.