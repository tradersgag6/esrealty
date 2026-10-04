"use strict";
/* The applied market multiple, disclosed as one number.
 *
 * The public guide shows a BIR zonal reference and a market estimate with no
 * visible link between them. The link is a factor stack: (1 + corner) x
 * property-use proxy x market band x regional adjustment. This file pins that
 * stack for every use group the engine can reach, so a later disclosure task can
 * render it without re-deriving it.
 *
 * It then pins the disclosure itself: the builder in js/value_guide_reference.js
 * that owns the public copy, the multiple formatter, the guards that make it
 * refuse to speak at all when there is no usable multiple, and the
 * accuracy-language rule from docs/batangas-value-guide-sources.md:50-58.
 *
 * Fixture: the Bauan Poblacion III street rate already asserted by
 * tests/value_guide_reference_node.js:22 (birZonalRatePerSqm === 11500).
 */
const assert = require("assert"), fs = require("fs");
const EST = require("../js/estimator.js"), REF = require("../js/value_guide_reference.js");
const read = path => JSON.parse(fs.readFileSync(path, "utf8"));
const config = read("data/zonal-config.json"), index = read("data/batangas-zonal.json"), md = read("data/bir-batangas/municipalities/bauan.json");
let count = 0;
function check(name, fn) { fn(); count++; console.log("[PASS] " + name); }
(async () => {
  const options = { municipality: "BAUAN", barangay: "POBLACION III", streetKey: "binay st ressurreccion st", classification: "RR", area: 100, type: "vacant_lot" };

  // residential, no corner
  check("residential multiple is 2.5", () => {
    const r = EST.core.computeEstimate(config, index, md, options);
    assert.strictEqual(r.appliedMultiple, 2.5);
  });
  check("residential factorStack is 2.5", () => {
    const r = EST.core.computeEstimate(config, index, md, options);
    assert.strictEqual(r.factorStack, 2.5);
  });

  /* Every remaining use-group vector. The classification codes are the real BIR
     codes this fixture can resolve, not invented labels: RR and CR are street
     rates on Binay St; A50 ("Other Agricultural Lands") and I ("Industrial") are
     Poblacion III all-other-streets rates. Each maps to a distinct proxy factor
     and market band, which is what the multiples below are made of. */
  check("residential + corner multiple is 2.5625", () => {
    const r = EST.core.computeEstimate(config, index, md, { ...options, corner: true });
    assert.strictEqual(r.appliedMultiple, 2.5625);
    /* Full precision, not the rounded rate. On this vector rounding is visible:
       11500 x 2.5625 = 29468.75, so the rounded land rate over the zonal rate
       reads 29469/11500 = 2.5625217... and is NOT 2.5625. (The residential
       vector cannot carry this check - 11500 x 2.5 is a whole peso, so its
       rounded rate happens to reproduce 2.5 exactly.) */
    assert.notStrictEqual(r.factorStack, r.landPerSqm / r.birZonalRatePerSqm);
  });
  check("commercial multiple is 4.25", () => {
    const r = EST.core.computeEstimate(config, index, md, { ...options, classification: "CR" });
    assert.strictEqual(r.appliedMultiple, 4.25);
  });
  check("agricultural multiple is 0.75", () => {
    const r = EST.core.computeEstimate(config, index, md, { ...options, classification: "A50" });
    assert.strictEqual(r.appliedMultiple, 0.75);
  });
  check("industrial multiple is 2.7", () => {
    const r = EST.core.computeEstimate(config, index, md, { ...options, classification: "I" });
    assert.strictEqual(r.appliedMultiple, 2.7);
  });

  /* The identity is pinned on the corner vector FIRST. On a non-corner result
     corner.pct is 0, so (1 + corner) collapses to 1 and the identity holds no
     matter what the corner term does - it cannot tell a correct stack from one
     with the corner term deleted, or from one that divides the corner term by
     100. The corner vector is the only one where the term is non-zero, so it
     is the only one that has teeth.

     corner.pct is a FRACTION (0.025), not a percentage (2.5):
     data/zonal-config.json carries cornerLotPct: 0.025, js/estimator.js:169
     reads it straight into cornerPct, and :290 copies it into the result
     unscaled. Renderers scale it themselves (js/estimator.js:1306 rounds
     pct * 1000 / 10; js/value_guide_pdf.js:644 uses pct * 100). Dividing by 100
     here would be wrong twice over and is pinned by the corner.pct assertion.

     Teeth checked by mutation on 2026-10-04 (each mutation run against this
     file, then reverted): deleting the corner term from `expected` makes the
     corner check below FAIL, and restoring the `/ 100` makes it FAIL. Neither
     mutation is visible to the old non-corner-only assertion. */
  check("factorStack is the product of the disclosed factors, corner term included", () => {
    const r = EST.core.computeEstimate(config, index, md, { ...options, corner: true });
    assert.strictEqual(r.corner.pct, 0.025);
    const expected = (1 + r.corner.pct) * r.factors.proxyFactor * r.factors.bandMid * r.factors.regionalAdj;
    assert.ok(Math.abs(r.factorStack - expected) < 1e-12);
  });
  check("factorStack is the product of the disclosed factors, no corner term", () => {
    const r = EST.core.computeEstimate(config, index, md, options);
    assert.strictEqual(r.corner.pct, 0);
    const expected = (1 + r.corner.pct) * r.factors.proxyFactor * r.factors.bandMid * r.factors.regionalAdj;
    assert.ok(Math.abs(r.factorStack - expected) < 1e-12);
  });

  /* The indexed scenario is not a factor estimate: no market, region, corner or
     property-use multiplier is stacked onto it, so there is no multiple to
     disclose. null, not 0 and not a leftover factor value. */
  const indexed = { ...options, landMethod: "time-indexed", timeSource: "manual", timeAnnualPct: 5, timeBaseDate: "2022-07-23", timeTargetDate: "2026-10-03" };
  check("time-indexed land method discloses no multiple", () => {
    const r = EST.core.computeEstimate(config, index, md, indexed);
    assert.strictEqual(r.landMethod, "time-indexed");
    assert.strictEqual(r.appliedMultiple, null);
    assert.strictEqual(r.factorStack, null);
  });

  check("fixture is the known-good Bauan street rate", () => {
    const r = EST.core.computeEstimate(config, index, md, options);
    assert.strictEqual(r.birZonalRatePerSqm, 11500);
  });
  check("factorStack and appliedMultiple are the same disclosed number", () => {
    const r = EST.core.computeEstimate(config, index, md, options);
    assert.strictEqual(r.appliedMultiple, r.factorStack);
  });

  /* ===================================================================
     Task 2 - the disclosure builder and the accuracy-language guard.

     The builder is the single source of the public copy. The HTML result
     screen, the report build-up and the PDF all read this object and none of
     them restate the wording, so the three surfaces cannot drift apart.

     The copy is fixed by docs/specs/market-multiple-disclosure.md section 4
     and is reproduced here character for character. It is not paraphrased
     here, and it must not be paraphrased in js/value_guide_reference.js
     either: the limitation sentence ("likely too high for rural locations")
     is deliberately unflattering and softening it into vagueness would make
     the disclosure worthless. */
  const LABEL = "SEA ESTATES market band factor";
  const ASSUMPTION = "A SEA ESTATES planning assumption. It is not derived from completed sales and has not been reviewed by an independent qualified appraiser.";
  const LIMITATION = "The same factor is applied across all Batangas municipalities. It is not adjusted for local demand and is likely too high for rural locations.";

  check("disclosure publishes the multiple and the verbatim copy", () => {
    const r = EST.core.computeEstimate(config, index, md, options);
    const d = REF.appliedMultipleDisclosure(r);
    assert.strictEqual(d.multiple, "2.5");
    assert.strictEqual(d.multipleLabel, LABEL);
    assert.strictEqual(d.text, "2.5\u00d7 the BIR reference");
    assert.strictEqual(d.assumption, ASSUMPTION);
    assert.strictEqual(d.limitation, LIMITATION);
  });

  /* Review Focus 1 and 2: the multiple is derived per result, never hardcoded.
     A corner lot is 2.5625, not 2.5, and agricultural is 0.75 - BELOW 1, which
     is why the copy must never imply the estimate is always the higher number.
     The text is built from whatever the stack resolved to, so all eight vectors
     are checked rather than just the residential one.

     The corner x non-residential vectors are here because that is the class
     that broke. 4 decimals renders 2.5 x 1.025 fine, so a formatter pinned
     only against residential+corner passed while publishing "4.3562x" for a
     commercial corner lot whose applied multiple was 4.35625. See the
     reconciliation check below. */
  const vectors = [
    ["residential", options, "2.5"],
    ["residential + corner", { ...options, corner: true }, "2.5625"],
    ["commercial", { ...options, classification: "CR" }, "4.25"],
    ["commercial + corner", { ...options, classification: "CR", corner: true }, "4.35625"],
    ["agricultural", { ...options, classification: "A50" }, "0.75"],
    ["agricultural + corner", { ...options, classification: "A50", corner: true }, "0.76875"],
    ["industrial", { ...options, classification: "I" }, "2.7"],
    ["industrial + corner", { ...options, classification: "I", corner: true }, "2.7675"]
  ];
  vectors.forEach(([name, opts, expected]) => {
    check("disclosure multiple for " + name + " is " + expected, () => {
      const d = REF.appliedMultipleDisclosure(EST.core.computeEstimate(config, index, md, opts));
      assert.ok(d, "expected a disclosure");
      assert.strictEqual(d.multiple, expected);
      assert.strictEqual(d.text, expected + "\u00d7 the BIR reference");
    });
  });

  /* The point of publishing the multiple at all: a reader multiplies it by the
     BIR rate shown beside it and must land on the estimate. This pins that
     property directly instead of trusting the display strings above, so it
     catches a formatter that loses a digit the moment a new vector appears.

     Tolerance is 1e-12, far above the noise but far below the defect. The
     stack is built by multiplication in IEEE-754, so the stored factorStack
     for a commercial corner lot is 4.356249999999999 - binary approximation
     noise, observed at ~9e-16 against the disclosed 4.35625, which is why the
     assertion cannot be strictEqual. The defect this exists to catch is
     orders of magnitude larger: 4 decimals gave a delta of 5e-5, which fails
     here by seven orders of magnitude. */
  check("every disclosed multiple reconciles with the applied factor stack", () => {
    vectors.forEach(([name, opts]) => {
      const r = EST.core.computeEstimate(config, index, md, opts);
      const d = REF.appliedMultipleDisclosure(r);
      const shown = Number(d.multiple);
      assert.ok(Math.abs(shown - r.factorStack) < 1e-12,
        name + ": disclosed " + shown + " does not reconcile with applied " + r.factorStack);
      assert.ok(Math.abs(shown * r.birZonalRatePerSqm - r.factorStack * r.birZonalRatePerSqm) < 1e-6,
        name + ": disclosed multiple x BIR rate does not reconcile with the applied build-up");
    });
  });

  /* The builder hands back the result's own factor object so the renderers can
     print the build-up that produced the multiple without recomputing it. */
  check("disclosure carries the result's own factors", () => {
    const r = EST.core.computeEstimate(config, index, md, { ...options, corner: true });
    const d = REF.appliedMultipleDisclosure(r);
    assert.strictEqual(d.factors, r.factors);
    assert.deepStrictEqual(d.factors, { proxyFactor: 1, bandMid: 2.5, regionalAdj: 1 });
  });

  /* ------------------------------------------------------------------
     The refusal guards. Each check below hands the builder an input that
     ONLY the guard named in the comment can refuse, so removing that guard
     turns the check red. Inputs the brief lists but that several guards could
     each catch (a bare {} has no landMethod AND no multiple) are kept
     verbatim further down, but they are not the teeth.

     Mutation proof, run on 2026-10-04 against this file, each mutation
     applied to js/value_guide_reference.js and then reverted:
       1. drop `!result`                    -> "no result at all" THROWS
       2. `!== "factor"` becomes `=== "time-indexed"` (deny-list)
                                           -> "unrecognised or absent land
                                               method" FAILS
       3. drop the isFinite check           -> "non-finite multiple" FAILS
       4. drop the `> 0` check              -> "zero multiple" and
                                               "negative multiple" FAIL
       5. drop the `|| {}` on factors       -> "defaults the factors object"
                                               FAILS
       6. copy factors instead of passing the result's own object through
                                           -> "carries the result's own
                                               factors" FAILS
       7. hardcode `shown = "2.5"`          -> the commercial, agricultural,
                                               industrial and corner vector
                                               checks FAIL
       8. round to 2 decimals               -> the corner vector check FAILS
       9. toFixed(5) instead of String()    -> "drops trailing zeros" FAILS
      10. no rounding at all                -> "rounds to 5 decimals" FAILS
      11. reword, soften or drop either fixed sentence
                                           -> "verbatim copy" FAILS
      12. plant "accurate to +/-3%" in the label
                                           -> RED, but at the verbatim
                                               multipleLabel assertion, NOT at
                                               the accuracy guard - see the
                                               note below
      13. round to 4 decimals               -> "disclosure multiple for
                                               commercial + corner" and
                                               "agricultural + corner" FAIL
                                               (added in fix round 1)

     Mutation 2 was GREEN on the first run. Every check then present was also
     satisfied by a deny-list on "time-indexed", because the indexed path and
     every unavailable result are separately refused by the value guards. The
     "unrecognised or absent land method" check was added to close that, and
     mutation 2 re-run to confirm it is now RED. Recorded because the whole
     point of this file is that a guard nobody can distinguish from its
     opposite is not a guard.

     On mutation 12: the accuracy guard has NO discriminating power over
     today's code. Every banned term is planted in one of the three fixed
     strings, and the verbatim assertions on `multipleLabel`, `assumption`
     and `limitation` fire first - roughly 185 lines before the guard is
     reached - so the run goes RED without the guard ever executing. That is
     correct behaviour, not a defect: a banned term cannot reach the copy. But
     it does mean the guard proves nothing yet. Its value is forward-looking,
     for the sentences Tasks 3 and 4 compose, which are NOT pinned verbatim
     and therefore can only be policed by the regex. */

  // Guard 1: no result object at all.
  check("guard: no result at all discloses nothing", () => {
    assert.strictEqual(REF.appliedMultipleDisclosure(null), null);
    assert.strictEqual(REF.appliedMultipleDisclosure(undefined), null);
  });

  /* Guard 2: only the factor land method has a multiple to disclose.
     The value is 2.5 - finite and positive - so neither value guard can
     explain this refusal; removing the landMethod clause makes the builder
     announce a market band factor for an indexed scenario that never applied
     one. */
  check("guard: land method other than factor refuses even a usable multiple", () => {
    assert.strictEqual(REF.appliedMultipleDisclosure({ landMethod: "time-indexed", appliedMultiple: 2.5 }), null);
  });
  /* The landMethod guard is an allow-list, not a deny-list: an UNRECOGNISED
     method is refused too, and so is a missing one. Without this check the
     guard has no teeth - flipping `!== "factor"` to `=== "time-indexed"` keeps
     every other check green, because the indexed path and every unavailable
     result are separately caught by the value guards. What separates the two
     implementations is a result that carries a usable multiple under a land
     method that is not "factor", which is exactly what a future third method
     (one that does not apply the market band) would look like. For such a
     result "SEA ESTATES market band factor x the BIR reference" would be a
     false sentence, so the builder must stay silent. */
  check("guard: unrecognised or absent land method refuses even a usable multiple", () => {
    assert.strictEqual(REF.appliedMultipleDisclosure({ landMethod: "time-evidence", appliedMultiple: 2.5 }), null);
    assert.strictEqual(REF.appliedMultipleDisclosure({ landMethod: "", appliedMultiple: 2.5 }), null);
    assert.strictEqual(REF.appliedMultipleDisclosure({ appliedMultiple: 2.5 }), null);
  });
  check("guard: land method is absent on a real unavailable result", () => {
    const r = EST.core.computeEstimate(config, index, md, { ...options, classification: "ZZ" });
    assert.strictEqual(r.available, false);
    assert.strictEqual(r.reason, "no-data");
    assert.strictEqual(r.landMethod, undefined);
    assert.strictEqual(r.factors, undefined);
    assert.strictEqual(REF.appliedMultipleDisclosure(r), null); // must not throw
  });
  check("guard: a real time-indexed result discloses nothing", () => {
    const r = EST.core.computeEstimate(config, index, md, indexed);
    assert.strictEqual(REF.appliedMultipleDisclosure(r), null);
  });

  /* Guard 3: a non-finite multiple is refused. Infinity is the isolating
     input - Number(Infinity) > 0 is TRUE, so the positivity guard cannot
     catch it and only isFinite can. (NaN falls out of the positivity guard
     instead, which is why the NaN case is asserted separately below.) */
  check("guard: non-finite multiple is refused", () => {
    assert.strictEqual(REF.appliedMultipleDisclosure({ landMethod: "factor", appliedMultiple: Infinity }), null);
    assert.strictEqual(REF.appliedMultipleDisclosure({ landMethod: "factor", appliedMultiple: -Infinity }), null);
  });

  /* Guard 4: zero is not a usable multiple - "0x the BIR reference" is a
     number the reader would take literally. A negative multiple is refused
     for the same reason; the shipped engine cannot produce one, but the
     builder is a public entry point and must not render it if it ever did. */
  check("guard: zero multiple is refused", () => {
    assert.strictEqual(REF.appliedMultipleDisclosure({ landMethod: "factor", appliedMultiple: 0 }), null);
  });
  check("guard: negative multiple is refused", () => {
    assert.strictEqual(REF.appliedMultipleDisclosure({ landMethod: "factor", appliedMultiple: -1 }), null);
  });
  check("guard: absent multiple is refused", () => {
    assert.strictEqual(REF.appliedMultipleDisclosure({ landMethod: "factor" }), null);
  });

  /* Guard 5: missing factors are tolerated, not fatal. The brief's guard
     table reads as if absent factors should return null, but the same
     section says `factors` is "defaulted to {}" - and an unavailable result
     is already refused by guard 2, which the real no-data case above
     proves. So a factor-mode result still discloses; it just has no
     build-up to show. Deleting the `|| {}` fails the next check. */
  check("guard: a factor-mode result with no factors still discloses", () => {
    const d = REF.appliedMultipleDisclosure({ landMethod: "factor", appliedMultiple: 2.5 });
    assert.ok(d);
    assert.strictEqual(d.multiple, "2.5");
  });
  check("disclosure defaults the factors object to an empty object", () => {
    const d = REF.appliedMultipleDisclosure({ landMethod: "factor", appliedMultiple: 2.5 });
    assert.deepStrictEqual(d.factors, {});
  });

  /* The brief's hostile-input list, verbatim. Each of these returns null, but
     for the landMethod reason rather than the value reason - see the
     isolating guards above for the ones that pin the value guards. */
  check("hostile inputs from the brief disclose nothing", () => {
    assert.strictEqual(REF.appliedMultipleDisclosure({ landMethod: "time-indexed", appliedMultiple: null }), null);
    assert.strictEqual(REF.appliedMultipleDisclosure({}), null);
    assert.strictEqual(REF.appliedMultipleDisclosure({ appliedMultiple: null }), null);
    assert.strictEqual(REF.appliedMultipleDisclosure({ appliedMultiple: 0 }), null);
    assert.strictEqual(REF.appliedMultipleDisclosure({ appliedMultiple: NaN }), null);
    assert.strictEqual(REF.appliedMultipleDisclosure({ appliedMultiple: Infinity }), null);
  });

  /* ------------------------------------------------------------------
     The accuracy-language guard. This is what makes the rule in
     docs/batangas-value-guide-sources.md:50-58 enforceable instead of
     aspirational. Two halves, and both matter: a positive control proving
     the regex actually bites (a guard that can never match is a green lie),
     and the negative assertion on the real copy.

     Widened in fix round 1. Three gaps let real variants through:
       - `\baccur\w*` has no word boundary inside "inaccurate", so the most
         natural way to break the rule - denying accuracy - was unguarded.
       - `\bprecision\b` missed "precise" and "precisely".
       - `within \d+\s*%` missed "within 5 percent", which is the spelled-out
         form a human writing prose is likelier to reach for.
     The published copy is fixed and contains none of these, so widening
     cannot produce a false positive today; it matters because Tasks 3 and 4
     introduce prose that is NOT pinned verbatim and can only be policed by
     this regex. */
  const BANNED = /\b(?:in)?accur\w*|\bguarantee|\u00b1|\bwithin \d+\s*(?:%|percent)|\berror margin|\bprecis\w*/i;

  check("accuracy guard rejects every forbidden term (positive control)", () => {
    ["accurate", "accuracy", "accurately", "inaccurate", "inaccurately", "guarantee", "guaranteed",
     "\u00b1 5%", "within 5%", "within 10 %", "within 5 percent", "within 10 percent",
     "error margin", "precision", "precise", "precisely"].forEach(phrase => {
      assert.ok(BANNED.test(phrase), "guard failed to catch " + JSON.stringify(phrase));
    });
  });

  /* One check per gap the fix round 1 widened, so the widened pattern is
     itself pinned rather than merely present. Each asserts the specific
     variant that the pre-fix pattern missed, which is the only way to catch
     a future well-meaning "simplification" back to `\baccur\w*`. */
  check("accuracy guard catches the variants the narrow pattern missed", () => {
    /* Pre-fix `\baccur\w*` did not match: "in" runs straight into "accurate"
       with no word boundary. */
    assert.ok(BANNED.test("The estimate is not inaccurate"), "missed: inaccurate");
    assert.ok(BANNED.test("derived inaccurately"), "missed: inaccurately");
    /* Pre-fix `\bprecision\b` did not match. */
    assert.ok(BANNED.test("precise"), "missed: precise");
    assert.ok(BANNED.test("computed precisely"), "missed: precisely");
    /* Pre-fix `within \d+\s*%` did not match the spelled-out unit. */
    assert.ok(BANNED.test("within 5 percent"), "missed: within 5 percent");
    assert.ok(BANNED.test("within 10 percent"), "missed: within 10 percent");
  });

  check("no disclosure string claims accuracy", () => {
    const strings = [];
    vectors.forEach(([name, opts]) => {
      const d = REF.appliedMultipleDisclosure(EST.core.computeEstimate(config, index, md, opts));
      assert.ok(d, "expected a disclosure for " + name);
      strings.push(d.multiple, d.multipleLabel, d.text, d.assumption, d.limitation);
    });
    const blob = strings.join(" ");
    assert.strictEqual(BANNED.test(blob), false, "accuracy language leaked into: " + blob);
  });

  /* The formatter. Three independent teeth: it pads (toFixed) if the first
     check is broken, it drops precision if the first or second is, and it
     stops rounding entirely if the third is. The 5-decimal divisor is pinned
     by the corner x non-residential vectors above - 4.35625 and 0.76875 need
     five digits, and 2.5 x 1.025 alone would have passed at four. */
  check("formatMultiple drops trailing zeros and keeps corner precision", () => {
    assert.strictEqual(REF.formatMultiple(2.5), "2.5");
    assert.strictEqual(REF.formatMultiple(4.25), "4.25");
    assert.strictEqual(REF.formatMultiple(0.75), "0.75");
    assert.strictEqual(REF.formatMultiple(2.7), "2.7");
    assert.strictEqual(REF.formatMultiple(2.5625), "2.5625");
    assert.strictEqual(REF.formatMultiple(2.7675), "2.7675");
  });
  check("formatMultiple rounds to 5 decimals", () => {
    assert.strictEqual(REF.formatMultiple(2.123456789), "2.12346");
    assert.strictEqual(REF.formatMultiple(2.562500001), "2.5625");
    assert.strictEqual(REF.formatMultiple(2.999999), "3");
    /* The lossy case that motivated the divisor: at 4 decimals these both
       truncated. */
    assert.strictEqual(REF.formatMultiple(4.356249999999999), "4.35625");
    assert.strictEqual(REF.formatMultiple(0.7687499999999999), "0.76875");
  });

  console.log("ALL GREEN (" + count + " checks)");
})().catch(error => { console.error(error); process.exitCode = 1; });
