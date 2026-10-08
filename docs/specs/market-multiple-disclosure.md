# Market Multiple Disclosure

Status: proposed · Date: 2026-10-04 · Scope: public Value Guide calculator

## Problem

The public calculator shows two numbers and never states how they relate. For
residential the market estimate is **exactly 2.5x** the BIR zonal rate:

```
landPerSqm = base x (1 + cornerPct) x proxy x band x regionalAdj
```

With the shipped factors every residential input resolves to 1.0, so the band
midpoint of `2.5` is the entire multiplier (`data/zonal-config.json:155`; the
`mid` keys sit at `:155`, `:160`, `:165`, `:170`).
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
// js/estimator.js:202-203
var factorStack = (1 + cornerPct) * proxy * band * adj;
var landPerSqm = Math.round(base * factorStack);
```

Grouping the product re-associates the floating-point multiply, so it is **not**
behaviour-identical: across every rate in `data/bir-batangas` the whole-peso
result is unchanged for non-corner parcels and moves by at most 1 peso on some
corner lots (149,160 combinations). That drift is measured, not assumed, and is
recorded where it happens at `js/estimator.js:197-200`.

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

HTML, report and PDF are three separately-written renderers, so per-surface
wording is possible by construction and every difference between them would be
invisible without a comparison. There is already one deliberate asymmetry: the
result screen prints the label, the multiple and the assumption, while the
limitation appears only in the report build-up and the PDF. That is a choice,
and it is only recognisable as a choice because the words come from one owner.
So the disclosure copy is owned in one place rather than written per surface.
Add a single disclosure builder in `js/value_guide_reference.js`, the existing
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
> **SEA ESTATES market band factor: 2.5× the BIR reference for land**

The sentence must name the land. The stack multiplies the lot area and the
building component is computed separately, so for `house_lot` the unqualified
"2.5× the BIR reference" reads as a multiple of the headline TOTAL printed
directly above it - 2,875,000 against 6,655,000, so the printed product is 56.8%
short of that total (equivalently, the total exceeds the product by 131.5%)
while appearing to reconcile it.
For `vacant_lot` the land is the whole property and the
unqualified sentence happens to be true, which is what let the defect survive on
a file whose only web fixture was a vacant lot.

The qualifier belongs on `text`, not on `multipleLabel`: the report and PDF
build-up rows print the label beside a `Land value` row that already scopes it,
and qualifying it there would read worse.

**Report - "Land value build-up"** (`js/estimator.js:1318-1328`), appended after
the existing factor rows and the effective-land-rate line.

**PDF** — `js/value_guide_pdf.js:682`, the multiple row in the same build-up
table, plus the line under the summary tiles (`:584`, the multiple line itself
at `:596`). Public and internal PDFs share this renderer.

### 4. Copy

```
multipleLabel SEA ESTATES market band factor
multiple      2.04565 (already formatted; the renderer must not re-round)
text          2.04565× the BIR reference for land
assumption    A SEA ESTATES planning assumption. It is not derived from
              completed sales and has not been reviewed by an independent
              qualified appraiser.
limitation    The factor descends from 2.5x for low BIR rates toward 1.4x at
              25,000/sqm and above, because high-BIR streets (beachfront,
              prime town centres) already carry their location premium in the
              BIR rate itself. It is a planning assumption, not a
              market-comparable calibration.
```

The multiple is the 2026.10.5 rate-ramped value for the fixture (Binay St,
11,500/sqm). It is read off the result at render time; these strings are the
verbatim copy, not a hardcoded number.

State the limitation rather than hide it: the ramp is directional, not calibrated.
It descends where the BIR rate already prices the location (beachfront, prime
streets) and holds the flat value where it does not. Publishing that costs less
than being found out by a broker who knows the area.

### 5. Accuracy-language guard

The disclosure must never claim accuracy. `tests/` gains a guard that fails if
these appear in the disclosure strings (`tests/value_guide_multiple_node.js:408`):

```
/\b(?:in)?accur\w*|\bguarantee|\u00b1|\bwithin \d+\s*(?:%|percent)|\berror margin|\bprecis\w*|\bclose to\b|\bexact match\b|\bPVS[\s-]?(?:complian\w*|conform\w*)\b|\bvalue[\s-]?loss\b|\bevaluation standards\b/i
```

`docs/batangas-value-guide-sources.md:56-57` forbids PVS-compliance,
"evaluation standards", certified-accuracy and value-loss claims until a reviewer
signs off. The guard turns all of that into a test rather than a convention: the
regex fails on an `accur` stem — which is how `certified-accuracy` and
`certified accuracy` are caught — plus `guarantee`, `±`, `within N %`/`percent`,
`error margin`, a `precis` stem, `close to`, `exact match`,
`PVS-compliance`/`PVS compliance`/`PVS-compliant`, `value-loss`/`value loss` and
`evaluation standards`.

One asymmetry is accepted rather than solved: the regex cannot tell a claim from
a denial, so a disclaimer such as `not PVS-compliant` also fails. That is the
right side to err on for a rule that forbids the terminology in public copy
outright, and it is documented here rather than worked around.

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
7. For a house and lot, `multiple x birZonalValue === landValue` and `!== total`,
   and both the published string and the rendered result block end in
   `for land`. The `house_lot` vector is not decoration: it is the only one
   where the unqualified sentence is false, so an all-`vacant_lot` file cannot
   see this defect at all.
8. Every term §5 prohibits is asserted as a positive control, and the fixed
   copy is asserted NOT to match the widened regex.

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
  nothing further. The 2026.10.5 ramp answers it more precisely: the factor
  descends where the BIR rate already prices the location.
- **The ramp is directional, not calibrated.** Six land records cannot fit a
  curve; the limitation says so, and the numbers sharpen as records accumulate.
  Do not present the ramp as a market-comparable calibration.
- **Competitors publish vaguer numbers with no provenance** and may outspend
  on presentation. The ground worth competing on is traceability.
- **Copy drift between HTML and PDF** is the main implementation hazard, and
  the reason the disclosure builder is shared.