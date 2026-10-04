# Market Multiple Disclosure

Status: proposed · Date: 2026-10-04 · Scope: public Value Guide calculator

## Problem

The public calculator shows two numbers and never states how they relate. For
residential the market estimate is **exactly 2.5x** the BIR zonal rate:

```
landPerSqm = base x (1 + cornerPct) x proxy x band x regionalAdj
```

With the shipped factors every residential input resolves to 1.0, so the band
midpoint of `2.5` is the entire multiplier (`data/zonal-config.json:153`).
A reader sees a BIR reference and an estimate that is 150% higher, with no
arithmetic connecting them and no statement of where 2.5 came from.

The multiplier is an unreviewed SEA ESTATES planning assumption derived from a
target price band, not a measurement. That is already stated honestly in
`docs/batangas-value-guide-sources.md:50-58` and `:111-117`, but none of it
reaches the calculator.

Comparable listing prices are explicitly excluded from the formula
(`js/estimator.js:187-191`, `comparablePricesUsed: false` at `:326`), so the
market figure cannot be defended by appeal to market data.

## Decision

Stay factor-only and **disclose the applied multiple as an assumption**.

Rejected for now: per-municipality ratios derived from market-scan asking
evidence. That needs an evidence pipeline, a stated fallback, and a calibration
dataset that does not exist yet. Adding it half-built would be worse than the
current disclosed assumption.

## Non-goals

- No change to the factor values, including `bandMid = 2.5`.
- No change to how the BIR figure is looked up or its applicability caveats.
- No comparables in the formula.
- No accuracy, precision, confidence or value-loss claim.
- No change to the tax computation path.

## Design

### 1. Derive the multiple, never hardcode it

Compute the factor stack as a named value where the unrounded product already
exists, so the disclosure cannot drift from the arithmetic:

```js
// js/estimator.js:202  (behaviour-identical refactor)
var factorStack = (1 + cornerPct) * proxy * band * adj;
var landPerSqm = Math.round(base * factorStack);
```

`factorStack` is the exact ratio. Dividing the rounded `landPerSqm` by the
rounded `birZonalRatePerSqm` instead would introduce up to ~0.4% error at low
rates, and the report prints a build-up a reader may try to reproduce.

Add to the result object beside the existing `factors` field (`:306`):

```js
factorStack: landMethod === "factor" ? factorStack : null,
appliedMultiple: landMethod === "factor" ? factorStack : null,
```

`null` in `time-indexed` mode, where `landPerSqm` is replaced by the indexed
rate (`:210`) and corner is forced to 0 (`:290`). The existing indexed
disclosure already covers that path; a multiple would be meaningless there.

Test vectors from the shipped config:

| use | proxy | band | multiple |
| --- | --- | --- | --- |
| residential | 1.0 | 2.5 | **2.5** |
| commercial | 1.7 | 2.5 | **4.25** |
| agricultural | 0.5 | 1.5 | **0.75** |
| industrial | 1.35 | 2.0 | **2.7** |
| residential + corner | 1.0 | 2.5 | **2.5625** |

A hardcoded "2.5" would be wrong for three of these.

### 2. One source of truth for the copy

HTML, report and PDF are separate renderers and their wording has already
drifted elsewhere - the PDF land build-up used to omit the corner row the
report build-up shows (`js/estimator.js:1321`). That past divergence is why the
disclosure copy is owned in one place rather than written per surface. Add a
single disclosure builder in `js/value_guide_reference.js`, the existing
provenance module, and have all three surfaces consume it:

```js
referenceTools.appliedMultipleDisclosure(result)
// -> null | { multiple, multipleLabel, text, assumption, limitation, factors }
```

The field is `multipleLabel`, not `label`: this module already returns a `label`
from `status()` and from each `lookup().relatedSchedules[]` entry for the BIR
reference, and a bare `label` on a provenance object with siblings reads as the
BIR one. `factors` is passed through so a renderer can show the stack beside
the multiple.

The multiple is formatted by `formatMultiple(n)`, which rounds to **5 decimals**
and trims trailing zeros (`2.5`, not `2.50000`) — no `toFixed`, which would pad
and fail the pinned `2.5` assertion. Five, not four: corner x commercial is
`1.025 x 1.7 x 2.5 = 4.35625` and corner x agricultural is
`1.025 x 0.5 x 1.5 = 0.76875`. Both equalities idealise: IEEE-754 holds those
products as `4.356249999999999` and `0.7687499999999999`, and it is the 5-decimal
rounding that recovers the exact decimal. At four decimals the site would
publish `4.3562` / `0.7687`, a counterfactual reachable only from the float
product, while those exact decimals were applied. Five decimals covers
all eight combinations the shipped factors can produce. This is a property of
today's factors, not a general losslessness guarantee: if a future factor
carries more precision the published multiple stops reconciling with the
estimate, which is the intended signal, not a silent truncation.

`estimator.js` already holds `referenceTools` for `.lookup()` and
`.timeScenario()`, so this adds no new dependency.

### 3. Surfaces

**Result screen**, in the existing BIR block (`js/estimator.js:1412`), so the
relationship is visible at the moment of reading — the disclosure element is
interpolated immediately after it (`:1413`):

> BIR zonal reference - P11,500/sqm · P1,150,000
> **SEA ESTATES market band factor: 2.5× the BIR reference**

**Report - "Land value build-up"** (`js/estimator.js:1318-1328`), appended after
the existing factor rows and the effective-land-rate line.

**PDF** — `js/value_guide_pdf.js:682`, the multiple row in the same build-up
table, plus the line under the summary tiles (`:584`, the multiple line itself
at `:596`). Public and internal PDFs share this renderer.

### 4. Copy

```
multipleLabel SEA ESTATES market band factor
multiple      2.5 (already formatted; the renderer must not re-round)
text          2.5× the BIR reference
assumption    A SEA ESTATES planning assumption. It is not derived from
              completed sales and has not been reviewed by an independent
              qualified appraiser.
limitation    The same factor is applied across all Batangas municipalities.
              It is not adjusted for local demand and is likely too high for
              rural locations.
```

State the limitation rather than hide it: a flat factor is wrong by the
competitor's own published reasoning, which says the gap is wider in prime
areas and narrower in rural ones. Publishing that costs less than being found
out by a broker who knows the area.

### 5. Accuracy-language guard

The disclosure must never claim accuracy. `tests/` gains a guard that fails if
these appear in the disclosure strings (`tests/value_guide_multiple_node.js:401`):

```
/\b(?:in)?accur\w*|\bguarantee|\u00b1|\bwithin \d+\s*(?:%|percent)|\berror margin|\bprecis\w*|\bclose to\b|\bexact match\b/i
```

`docs/batangas-value-guide-sources.md:56-57` already forbids PVS-compliance,
certified-accuracy and value-loss claims until an appraiser signs off. The guard
turns most of that into a test rather than a convention, but not all of it: the
regex fails on an `accur` stem — which is how `certified-accuracy` and
`certified accuracy` are caught — plus `guarantee`, `±`, `within N %`/`percent`,
`error margin`, a `precis` stem, `close to` and `exact match`. It does not match
`PVS-compliant`, `PVS compliance`, `value-loss`/`value loss` or
`evaluation standards`; those spellings are held by reviewer convention only.
Closing that gap needs a change to the regex, which this task does not make.

## Testing

New `tests/value_guide_multiple_node.js`:

1. `factorStack === (1 + cornerPct) x proxy x band x regionalAdj` across all
   four use groups, with and without corner - assert the five vectors above.
2. `appliedMultiple === null` in `time-indexed` mode.
3. `factorStack` equals `landPerSqm_unrounded / base` - guards the rounding
   claim directly.
4. Disclosure copy contains no banned accuracy term.
5. The disclosure text is rendered in the HTML result summary, the report
   build-up, and the PDF build-up - static source assertions in the existing
   style of `value_guide_internal_node.js`.
6. `null` disclosure renders nothing rather than an empty element.

Regression: the existing 100/100 suite must stay green, including
`value_guide_pdf_browser_e2e` and the public/internal parity assertions.

## Files

| File | Change |
| --- | --- |
| `js/estimator.js` | `factorStack` refactor, two result fields, disclosure in result screen + report |
| `js/value_guide_reference.js` | new `appliedMultipleDisclosure()` |
| `js/value_guide_pdf.js` | build-up row and summary block |
| `tests/value_guide_multiple_node.js` | new |
| `docs/batangas-value-guide-sources.md` | record the new public disclosure |

`js/app.js:10735` calls the same estimator entry point (`estimate`, a thin
wrapper over `computeEstimate` at `js/estimator.js:131`), so it receives the
field automatically. Surfacing it in the internal UI is a follow-up, not
required here.

## Risks

- **A stated multiple invites "why 2.5?"** The honest answer is that it targets
  a price band, which is a commercial decision, not a valuation. That belongs
  in a sales conversation, not in public copy - hence "planning assumption" and
  nothing further.
- **"Likely too high for rural locations" may cost rural leads.** It is
  accurate and deliberately included; accept it consciously or drop that line
  only. Do not soften it into vagueness.
- **Competitors publish vaguer numbers with no provenance** and may outspend
  on presentation. The ground worth competing on is traceability.
- **Copy drift between HTML and PDF** is the main implementation hazard, and
  the reason the disclosure builder is shared.