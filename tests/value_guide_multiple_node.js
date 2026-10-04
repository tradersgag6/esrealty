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

  check("factorStack is the product of the disclosed factors", () => {
    const r = EST.core.computeEstimate(config, index, md, options);
    const expected = (1 + r.corner.pct / 100) * r.factors.proxyFactor * r.factors.bandMid * r.factors.regionalAdj;
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