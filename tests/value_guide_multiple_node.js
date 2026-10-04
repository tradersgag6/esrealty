"use strict";
/* The applied market multiple, disclosed as one number.
 *
 * The public guide shows a BIR zonal reference and a market estimate with no
 * visible link between them. The link is a factor stack: (1 + corner) x
 * property-use proxy x market band x regional adjustment. This file pins that
 * stack for every use group the engine can reach, so a later disclosure task can
 * render it without re-deriving it.
 *
 * Fixture: the Bauan Poblacion III street rate already asserted by
 * tests/value_guide_reference_node.js:22 (birZonalRatePerSqm === 11500).
 */
const assert = require("assert"), fs = require("fs");
const EST = require("../js/estimator.js");
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

  console.log("ALL GREEN (" + count + " checks)");
})().catch(error => { console.error(error); process.exitCode = 1; });
