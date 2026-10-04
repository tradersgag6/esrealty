# Market Multiple Disclosure Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Show the public calculator the exact factor multiple it applied to the BIR zonal reference, labelled as an unreviewed planning assumption, in the HTML result, the report and the PDF.

**Architecture:** `computeEstimate` derives a named `factorStack` where the unrounded product already exists and exposes it on the result. A single disclosure builder in `js/value_guide_reference.js` turns that number plus the factor strings into one structured object, which all three renderers consume so their wording cannot drift. No new data sources, no change to any factor value.

**Tech Stack:** Vanilla ES5-compatible JavaScript (UMD modules), Node `assert` test harness, no build step for these files.

**Spec:** `docs/specs/market-multiple-disclosure.md`

## Global Constraints

- Factor values must not change. `marketBand.bands.residential.mid` stays `2.5`.
- Comparables stay out of the formula. `comparablePricesUsed` remains `false`.
- The BIR figure, its lookup and every applicability caveat are untouched.
- No accuracy claim may appear in the disclosure. Forbidden: `accur*`, `guarantee`, `±`, `within N%`, `error margin`, `precision`.
- Copy is fixed by the spec and must be reproduced verbatim, including the limitation sentence.
- New UI text needs a class in `css/storefront.css`; the existing `.sf-est-result-bir small` pattern is the precedent.
- Every task leaves the full suite green (100 suites: 69 browser + 31 node).

## Review Focus

Five inputs the spec implies that a reasonable user would expect to work, most likely to bite first:

1. **Corner lot switched on** — the multiple becomes `2.5625`, not `2.5`. A user reconciling the printed build-up will notice a hardcoded figure disagreeing with the arithmetic shown beside it.
2. **Non-residential property types** — commercial is `4.25`, agricultural is `0.75`, industrial is `2.7`. Agricultural being *below* 1.0 means the estimate can land under the BIR reference, so copy must never imply the estimate is always higher.
3. **`time-indexed` land method** — `appliedMultiple` is `null`; the disclosure must render nothing at all, not `0×` and not an empty element.
4. **A very low BIR rate** — `landPerSqm` is rounded to a whole peso per sqm, so at low rates dividing rounded values would visibly disagree with the build-up.
5. **An unavailable result** (`no-data`, `integrity-fail`, `time-integrity-fail`) — these return early and carry no `factors` at all; the disclosure builder must return `null` rather than throw.

## File Structure

| File | Responsibility after this change |
| --- | --- |
| `js/estimator.js` | Computes `factorStack`, exposes it on the result, renders the disclosure in the result screen and report |
| `js/value_guide_reference.js` | Sole owner of the disclosure copy, the multiple formatter and the accuracy-language guard |
| `js/value_guide_pdf.js` | Renders the disclosure in the summary block and the land build-up |
| `tests/value_guide_multiple_node.js` | Proves the arithmetic, the copy and the three render surfaces |
| `docs/batangas-value-guide-sources.md` | Records that the multiple is now public |

---

### Task 1: Derive and expose `factorStack` / `appliedMultiple`

**Files:**
- Modify: `js/estimator.js:192` (single-line refactor) and `js/estimator.js:295` (result fields)
- Test: `tests/value_guide_multiple_node.js` (create)

**Interfaces:**
- Consumes: nothing from other tasks.
- Produces: on the `computeEstimate` result, `factorStack: number|null` and `appliedMultiple: number|null`. Both `null` when `landMethod === "time-indexed"`. Later tasks read `result.appliedMultiple` and `result.factors`.

- [ ] **Step 1: Create the test file with the harness and the residential-vector checks**

Create `tests/value_guide_multiple_node.js`. Use the existing harness shape from `tests/value_guide_reference_node.js`: `const EST = require("../js/estimator.js")`, `read()` for JSON, a `check(name, fn)` helper that increments a count and prints `[PASS] <name>`, an async IIFE, and a final `ALL GREEN (<n> checks)` with `process.exitCode = 1` on throw.

The Bauan fixture already used by `tests/value_guide_reference_node.js:22` is known-good and asserts `birZonalRatePerSqm === 11500`; reuse it rather than inventing a location:

```js
const options = {
  municipality: "BAUAN", barangay: "POBLACION III",
  streetKey: "binay st ressurreccion st", classification: "residential"
};
```

Checks:

```js
// residential, no corner
check("residential multiple is 2.5", () => {
  const r = EST.core.computeEstimate(config, index, md, options);
  assert.strictEqual(r.appliedMultiple, 2.5);
});
check("residential factorStack equals 2.5 and is not the rounded rate", () => {
  const r = EST.core.computeEstimate(config, index, md, options);
  assert.strictEqual(r.factorStack, 2.5);
  assert.notStrictEqual(r.factorStack, r.landPerSqm / r.birZonalRatePerSqm); // rounding would differ
});
```

- [ ] **Step 2: Run it and confirm it fails**

Run: `node tests/value_guide_multiple_node.js`
Expected: FAIL — `appliedMultiple` is `undefined`, not `2.5`.

- [ ] **Step 3: The corner and non-residential vectors**

Add checks pinning each remaining vector from the spec table. Drive the corner case through `opts.corner = true`, and the property types through the `classification` option values that `useOfClassification` maps to each proxy factor. Assert exact numbers, not approximations:

| case | expected `appliedMultiple` |
| --- | --- |
| residential | `2.5` |
| residential + corner | `2.5625` |
| commercial | `4.25` |
| agricultural | `0.75` |
| industrial | `2.7` |

Also add the identity check that `factorStack` is reproducible from the factors the result already exposes:

```js
check("factorStack is the product of the disclosed factors", () => {
  const r = EST.core.computeEstimate(config, index, md, options);
  const expected = (1 + r.corner.pct / 100) * r.factors.proxyFactor * r.factors.bandMid * r.factors.regionalAdj;
  assert.ok(Math.abs(r.factorStack - expected) < 1e-12);
});
```

Note `corner.pct` is carried through as the raw **fraction** `cfg.cornerLotPct`
(`0.025`), not the percentage `2.5`. Existing renderers scale it themselves
(`js/estimator.js:1306` does `Math.round(r.corner.pct * 1000) / 10 + "%"`), so the
assertion must use `r.corner.pct` **undivided**, and must run on a corner-enabled
result — on a non-corner result `cornerPct` is `0`, so any `/100` is inert and the
assertion passes even with the corner term deleted entirely.

- [ ] **Step 4: `time-indexed` returns null**

Add a check computing with `landMethod: "time-indexed"`, `timeSource: "manual"`, `timeAnnualPct: 5`, `timeBaseDate` / `timeTargetDate` spanning the municipality effectivity date to a later date, asserting:

```js
assert.strictEqual(r.landMethod, "time-indexed");
assert.strictEqual(r.appliedMultiple, null);
assert.strictEqual(r.factorStack, null);
```

- [ ] **Step 5: Run and confirm only the new-field assertions fail**

Run: `node tests/value_guide_multiple_node.js`
Expected: the identity check passes if written defensively; the literal-value checks fail.

- [ ] **Step 6: Implement in `js/estimator.js`**

Replace line 192 with a named stack, keeping the arithmetic byte-identical:

```js
var factorStack = (1 + cornerPct) * proxy * band * adj;
var landPerSqm = Math.round(base * factorStack);
```

Add both fields immediately after the existing `factors:` line at 295:

```js
factorStack: landMethod === "factor" ? factorStack : null,
appliedMultiple: landMethod === "factor" ? factorStack : null,
```

Do not add rounding here. The value is stored at full precision so the formatter in Task 2 owns presentation.

- [ ] **Step 7: Run and confirm green**

Run: `node tests/value_guide_multiple_node.js`
Expected: ALL GREEN.

- [ ] **Step 8: Confirm nothing else moved**

Run: `node build_app.js --check` and `node tests/build_sync_node.js`
Expected: `IN SYNC` and `ALL GREEN`. Then run the node suites and confirm 31/31 — `appliedMultiple` is additive and no existing assertion reads it.

- [ ] **Step 9: Commit**

```bash
git add js/estimator.js tests/value_guide_multiple_node.js
git commit -m "feat(estimator): expose the applied market factor multiple"
```

---

### Task 2: Disclosure builder and accuracy-language guard

**Files:**
- Modify: `js/value_guide_reference.js:55` (add to the returned API object)
- Test: `tests/value_guide_multiple_node.js`

**Interfaces:**
- Consumes: `result.appliedMultiple`, `result.factors`, `result.corner`, `result.landMethod` from Task 1.
- Produces: `referenceTools.appliedMultipleDisclosure(result) -> null | { multiple, multipleLabel, text, assumption, limitation, factors }`, and `referenceTools.formatMultiple(n) -> string`. Tasks 3 and 4 render only from this object and must not restate the copy.

- [ ] **Step 1: Write the failing builder tests**

Add checks that call the builder directly on a computed result:

```js
const REF = require("../js/value_guide_reference.js");
const r = EST.core.computeEstimate(config, index, md, options);
const d = REF.appliedMultipleDisclosure(r);
assert.strictEqual(d.multiple, "2.5");
assert.strictEqual(d.assumption, "A SEA ESTATES planning assumption. It is not derived from completed sales and has not been reviewed by an independent qualified appraiser.");
assert.strictEqual(d.limitation, "The same factor is applied across all Batangas municipalities. It is not adjusted for local demand and is likely too high for rural locations.");
```

- [ ] **Step 2: The four null / hostile-input cases from Review Focus**

Add one check per case:

```js
// Review Focus 3 - indexed mode yields no disclosure at all
assert.strictEqual(REF.appliedMultipleDisclosure({ landMethod: "time-indexed", appliedMultiple: null }), null);

// Review Focus 5 - an unavailable result carries no factors and must not throw
assert.strictEqual(REF.appliedMultipleDisclosure({}), null);
assert.strictEqual(REF.appliedMultipleDisclosure({ appliedMultiple: null }), null);
assert.strictEqual(REF.appliedMultipleDisclosure({ appliedMultiple: 0 }), null); // 0 is not a usable multiple

// Review Focus 4 - a non-finite multiple is refused
assert.strictEqual(REF.appliedMultipleDisclosure({ appliedMultiple: NaN }), null);
assert.strictEqual(REF.appliedMultipleDisclosure({ appliedMultiple: Infinity }), null);
```

- [ ] **Step 3: The accuracy-language guard test**

Build the disclosure from each of the four property types plus corner, concatenate every string field, and assert the forbidden patterns are absent:

```js
const BANNED = /\baccur\w*|\bguarantee|\u00b1|\bwithin \d+\s*%|\berror margin|\bprecision\b/i;
```

Assert `BANNED.test(blob) === false`. This is the check that makes the rule in `docs/batangas-value-guide-sources.md:50-58` enforceable rather than aspirational.

- [ ] **Step 4: Formatter tests**

```js
assert.strictEqual(REF.formatMultiple(2.5), "2.5");
assert.strictEqual(REF.formatMultiple(4.25), "4.25");
assert.strictEqual(REF.formatMultiple(0.75), "0.75");
assert.strictEqual(REF.formatMultiple(2.7), "2.7");
assert.strictEqual(REF.formatMultiple(2.5625), "2.5625"); // corner case must not round to 2.56
```

- [ ] **Step 5: Run and confirm failure**

Run: `node tests/value_guide_multiple_node.js`
Expected: FAIL — `appliedMultipleDisclosure is not a function`.

- [ ] **Step 6: Implement `formatMultiple` in `js/value_guide_reference.js`**

Signature `formatMultiple(n: any) -> string`. Round to 4 decimals and return via `String(...)` so trailing zeros drop — `2.5`, not `2.5000`. Do not use `toFixed`, which would keep them and fail Step 4.

- [ ] **Step 7: Implement `appliedMultipleDisclosure`**

Signature `appliedMultipleDisclosure(result: object) -> null | Disclosure`, where `Disclosure` is `{ multiple, multipleLabel, text, assumption, limitation, factors }`.

Return `null` when any of these hold — each covers a case Step 2 pins:

| condition | Review Focus case |
| --- | --- |
| `!result` or `result.landMethod !== "factor"` | 3, indexed mode |
| `!isFinite(Number(result.appliedMultiple))` | 4, non-finite |
| `!(Number(result.appliedMultiple) > 0)` | zero multiple |
| `result.factors` absent | 5 — tolerate it, do not throw |

`multiple` is `formatMultiple(m)`. `text` is `multiple + "\u00d7 the BIR reference"`. `multipleLabel` is `"SEA ESTATES market band factor"`. `assumption` and `limitation` are the two strings fixed verbatim in Step 1. `factors` is `result.factors`, defaulted to `{}`.

- [ ] **Step 8: Export both**

Extend the return at line 55:

```js
return { lookup: lookup, status: status, timeScenario: timeScenario, day: day,
         formatMultiple: formatMultiple, appliedMultipleDisclosure: appliedMultipleDisclosure };
```

- [ ] **Step 9: Run and confirm green**

Run: `node tests/value_guide_multiple_node.js`
Expected: ALL GREEN.

- [ ] **Step 10: Commit**

```bash
git add js/value_guide_reference.js tests/value_guide_multiple_node.js
git commit -m "feat(reference): single-source the multiple disclosure copy and guard accuracy language"
```

---

### Task 3: Render in the HTML result screen and report

**Files:**
- Modify: `js/estimator.js:1362` (result BIR block) and `js/estimator.js:1287-1296` (land build-up)
- Modify: `css/storefront.css`
- Test: `tests/value_guide_multiple_node.js`

**Interfaces:**
- Consumes: `referenceTools.appliedMultipleDisclosure(result)` from Task 2. Available in `estimator.js` as `referenceTools` (bound at line 21).
- Produces: no new interface. Task 4 mirrors these two locations in the PDF.

- [ ] **Step 1: Write the failing render assertions**

These are static source assertions in the style already used by `tests/value_guide_internal_node.js`, because the summary HTML is produced by string concatenation inside a browser-only function:

```js
check("result screen renders the multiple inside the BIR block", () => {
  assert.ok(/sf-est-result-bir/.test(estSrc));
  assert.ok(/appliedMultipleDisclosure/.test(estSrc));
});
check("report land build-up renders the multiple", () => {
  assert.ok(/Land value build-up/.test(estSrc) || /buildUp/.test(estSrc));
});
```

Read the source with `fs.readFileSync("js/estimator.js", "utf8")` into `estSrc`.

- [ ] **Step 2: Run and confirm failure**

Run: `node tests/value_guide_multiple_node.js`
Expected: FAIL — `appliedMultipleDisclosure` does not appear in `estimator.js`.

- [ ] **Step 3: Render in the result BIR block**

Resolve the disclosure once per render, next to wherever `resultSummaryHtml` already reads `r`:

```js
var multipleDisclosure = referenceTools.appliedMultipleDisclosure(result);
```

Immediately after the `sf-est-result-bir` `div` closes, emit a sibling `div.sf-est-result-multiple` guarded on `multipleDisclosure` being non-null. It contains three elements in order: `b` for `multipleLabel`, `span` for `text`, `small` for `assumption`. The guard is what satisfies Review Focus 3 — in indexed mode emit the empty string, leaving no empty element and no `0×`.

- [ ] **Step 4: Render in the land build-up**

After the build-up's "Effective land rate" row, add two paragraphs, both guarded on `multipleDisclosure`:

- `p.sf-est-multiple-note` — `multipleLabel`, then `text` in `b`, then `assumption`.
- `p.sf-est-multiple-limit` — `limitation` alone.

Use the module's existing `esc()` helper for every interpolated string.

- [ ] **Step 5: Style it**

Add to `css/storefront.css`, following the existing `.sf-est-result-bir` spacing and muted-colour tokens:

```css
.sf-est-result-multiple { margin-top: 8px; display: flex; flex-direction: column; gap: 2px; }
.sf-est-result-multiple small,
.sf-est-multiple-note,
.sf-est-multiple-limit { color: var(--muted, #6b7280); }
.sf-est-multiple-limit { font-size: 12px; }
```

Reuse the project's existing muted colour variable if `css/storefront.css` already defines one; do not introduce a second token.

- [ ] **Step 6: Run and confirm green**

Run: `node tests/value_guide_multiple_node.js`
Expected: ALL GREEN.

- [ ] **Step 7: Browser check**

Run the two suites that render this surface, with the servers up:

```bash
powershell -NoProfile -ExecutionPolicy Bypass -File tests/run_all.ps1 -Test estimator_e2e
powershell -NoProfile -ExecutionPolicy Bypass -File tests/run_all.ps1 -Test value_guide_internal_e2e
```

Expected: both ALL GREEN. `-ExecutionPolicy Bypass` is required on this machine; CI does not need it.

- [ ] **Step 8: Rebuild the bundle and commit**

`js/estimator.js` is not bundled, but run the check anyway to prove nothing drifted:

```bash
node build_app.js --check
git add js/estimator.js css/storefront.css tests/value_guide_multiple_node.js
git commit -m "feat(estimator): show the applied multiple in the result and report"
```

---

### Task 4: Render in the PDF

**Files:**
- Modify: `js/value_guide_pdf.js:642-651` (land build-up) and `js/value_guide_pdf.js:577` (summary block)
- Test: `tests/value_guide_multiple_node.js`

**Interfaces:**
- Consumes: `referenceTools.appliedMultipleDisclosure(result)` from Task 2, available in the PDF module the same way as in `estimator.js` (`require` under Node, `window.ESREALTY_REFERENCE` in the browser).
- Produces: no new interface.

- [ ] **Step 1: Write the failing PDF text assertion**

The harness in `tests/value_guide_reference_node.js:11-20` already provides `pdfText(bytes)`, which inflates the PDF content streams and returns the text. Reuse that helper. Generate a PDF for the Bauan result and assert the multiple and the assumption sentence appear in the extracted text:

```js
const blob = await VG.toBlob(PDFLib, result, { preparedFor: "multiple disclosure", preparedBy: "SEA ESTATES" });
const text = pdfText(Buffer.from(await blob.arrayBuffer()));
assert.ok(text.indexOf("2.5") >= 0, "PDF shows the multiple");
assert.ok(text.indexOf("planning assumption") >= 0, "PDF shows the assumption line");
```

- [ ] **Step 2: Run and confirm failure**

Run: `node tests/value_guide_multiple_node.js`
Expected: FAIL — "PDF shows the multiple" or the assumption line is absent.

- [ ] **Step 3: Render in the land build-up**

The build-up already prints the factor rows at 646-648 and "Effective land rate" at 649. After the "Land value" row at 651, append a row and a note:

```js
multipleDisclosure ? ["SEA ESTATES market band factor", "x " + d.multiple] : null
```

Filter the `null` out of the rows array rather than rendering a blank row. Then, after the table, emit `d.assumption` and `d.limitation` through the existing `para(text, size, color)` helper used at line 605.

- [ ] **Step 4: Render in the summary block**

Extend the figure at 577 so the reader sees the relationship at the same moment as on the web, appending `d.text` to that block's `sub` field.

- [ ] **Step 5: Run and confirm green**

Run: `node tests/value_guide_multiple_node.js`
Expected: ALL GREEN.

- [ ] **Step 6: Confirm public/internal parity**

The internal wizard calls the same `computeEstimate`, so both PDFs pick this up. Run the browser PDF suite to prove it renders:

```bash
powershell -NoProfile -ExecutionPolicy Bypass -File tests/run_all.ps1 -Test value_guide_pdf_browser_e2e
```

Expected: ALL GREEN.

- [ ] **Step 7: Commit**

```bash
git add js/value_guide_pdf.js tests/value_guide_multiple_node.js
git commit -m "feat(pdf): render the applied multiple in the summary and build-up"
```

---

### Task 5: Document the public claim and run full regression

**Files:**
- Modify: `docs/batangas-value-guide-sources.md`
- Test: none new

**Interfaces:**
- Consumes: nothing. Produces: nothing.

- [ ] **Step 1: Record the disclosure**

In `docs/batangas-value-guide-sources.md`, in the section covering factor approval and validation status (around line 50), add a short paragraph stating that the calculator now publishes the applied multiple, that it is derived from the factor stack rather than hardcoded, and that the accuracy-language guard lives in `tests/value_guide_multiple_node.js`.

- [ ] **Step 2: Full regression**

```bash
node build_app.js --check
node tools/gen_ph_geo.js --check
powershell -NoProfile -ExecutionPolicy Bypass -File tests/run_all.ps1
```

Expected: build `IN SYNC`; `ph_geo.js is current`; the sweep reports `ALL GREEN` across 69 browser and 31 node suites with zero `[FAIL]` lines.

- [ ] **Step 3: Verify the clone case**

This repo's `core.autocrlf` is `true`, and a CRLF-fragile assertion previously passed locally while failing on a fresh clone. Clone to a temp directory and re-run the node suites there:

```bash
git clone --no-hardlinks . %TEMP%\multiple-clone
cd %TEMP%\multiple-clone && node tests/value_guide_multiple_node.js
```

Expected: ALL GREEN. Note that `run_all.ps1` needs `-ExecutionPolicy Bypass`; on Linux CI the line endings stay LF and no bypass is required.

- [ ] **Step 4: Commit**

```bash
git add docs/batangas-value-guide-sources.md
git commit -m "docs: record the published multiple disclosure"
```

- [ ] **Step 5: Push**

```bash
git fetch origin && git rebase origin/main && git push origin main
```

Rebase rather than force: the `market-index.yml` bot commits `data/market-index.json` daily to `main`, so a plain push will be rejected if a snapshot landed in between.