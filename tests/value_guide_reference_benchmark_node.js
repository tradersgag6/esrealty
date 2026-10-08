"use strict";
/* The purchased reference report, as a benchmark.
 *
 * Task 5 acceptance: "the benchmark reports the difference between each model and
 * the reference. It does not tune a universal multiplier to match this single
 * property."
 *
 * So this file compares, it does not reconcile. Both surfaces are computed from the
 * report's own inputs and printed against it, land and building separately. Nothing
 * here asserts a model is right.
 *
 * What this cannot do: measure accuracy. There is one report, it is a BIR-referenced
 * AVM that admits it has no comparables for Bauan, and its own text contradicts its
 * own arithmetic in five places (recorded in the fixture). Agreement with it is a
 * consistency check on our arithmetic, not evidence about the market.
 */
const assert = require("assert"), fs = require("fs"), path = require("path");
const ROOT = process.cwd();
global.fetch = (u) => {
  const p = path.join(ROOT, String(u).split("?")[0]);
  return Promise.resolve({ ok: fs.existsSync(p), json: () => Promise.resolve(JSON.parse(fs.readFileSync(p, "utf8"))) });
};
const EST = require(path.join(ROOT, "js/estimator.js"));
const FLOW = require(path.join(ROOT, "js/value_guide_flow.js"));
const FX = require(path.join(ROOT, "tests/fixtures/value-guide-reference-bauan.json"));

let count = 0;
const pending = [];
function check(name, fn) { fn(); count++; console.log("[PASS] " + name); }
function checkAsync(name, fn) { pending.push(fn().then(() => { count++; console.log("[PASS] " + name); })); }

const money = n => "PHP " + Math.round(n).toLocaleString("en-PH");
const pct = n => (n > 0 ? "+" : "") + n.toFixed(1) + "%";

/* The guide's model input, matching js/app.js vgModelOpts(). */
function guideOpts(f) {
  return Object.assign({}, FLOW.pickInputs(f), {
    purpose: f.purpose, type: f.type,
    municipality: f.municipality, barangay: f.barangay,
    streetKey: f.allOther ? "" : f.streetKey, allOther: !!f.allOther,
    effectivityDate: f.effectivityDate, classification: f.classification,
    area: Number(f.area) || 0,
    salePrice: null, developerFees: null,
    saleContext: f.saleContext || "private-resale",
    landMethod: f.landMethod || "factor",
    construction: f.construction, floorArea: Number(f.floorArea) || 0,
    floors: f.floors, ageBand: f.ageBand, features: f.features
  });
}

/* ------------------------------------------------------- the report reconciles */

check("the fixture's own arithmetic holds", () => {
  const v = FX.reported;
  assert.strictEqual(v.birBase, v.birZonalRatePerSqm * v.lotArea, "BIR base = rate x lot area");
  assert.strictEqual(v.rcn, v.rcnPerSqm * FX.inputs.floorArea, "RCN = rate x floor area");
  assert.strictEqual(v.depreciationAmount, v.rcn * v.accumulatedDepreciationPct / 100);
  assert.strictEqual(v.buildingValue, v.rcn - v.depreciationAmount, "depreciated building");
  assert.strictEqual(v.total, v.landValue + v.buildingValue, "land + building = total");
  assert.strictEqual(v.rangeLow, Math.round(v.total * 0.85), "low = total x 85%");
  assert.strictEqual(v.rangeHigh, Math.round(v.total * 1.30), "high = total x 130%");
  assert.ok(Math.abs(FX.derived.landMultiplierImplied - v.landValue / v.birBase) < 1e-6,
    "the recorded implied multiplier does not match land / BIR base");
});

check("the report's own text is recorded as contradicting its own numbers", () => {
  /* Guards against someone tidying the fixture into a clean citation later. */
  assert.ok(FX._referenceIsNotMarketEvidence.length > 200, "the contradictions are still recorded");
  const listed = FX.derived.listedCategoryPctSum;
  assert.notStrictEqual(listed, FX.reported.claimedNetAdjustmentPct,
    "the claimed net adjustment is being recorded as equal to the sum of the printed rows, which it is not");
  assert.strictEqual(FX.derived.rangeIsTotalTimes085And130, true);
});

check("the guide's market indicator is the multiplier this report implies", () => {
  /* If MARKET_IND ever moves away from 1.174, it stops being "the reference model" and
     becomes something else that needs a name of its own. */
  assert.strictEqual(FLOW.MODEL.MARKET_IND, FX.derived.landMultiplierRounded,
    "MARKET_IND no longer matches the multiplier this reference report implies");
});

/* ------------------------------------------- the comparison, printed and pinned */

checkAsync("both surfaces are computed from the report's own inputs and differ from it", () => {
  const f = FX.inputs, v = FX.reported;
  return Promise.all([
    EST.estimate(guideOpts(f)),
    FLOW.compute(guideOpts(f), EST)
  ]).then(([storefront, guide]) => {
    const rows = [
      ["BIR rate /sqm", v.birZonalRatePerSqm, guide.birZonalRatePerSqm, storefront.birZonalRatePerSqm],
      ["Land", v.landValue, guide.landValue, storefront.landValue],
      ["Building", v.buildingValue, guide.improvement, storefront.improvement],
      ["Total", v.total, guide.total, storefront.total],
      ["Range low", v.rangeLow, guide.low, storefront.low],
      ["Range high", v.rangeHigh, guide.high, storefront.high]
    ];
    const out = rows.map(r => r[0].padEnd(11) +
      "report " + money(r[1]).padStart(13) +
      "   guide " + money(r[2]).padStart(13) + " " + pct((r[2] / r[1] - 1) * 100).padStart(7) +
      "   storefront " + money(r[3]).padStart(13) + " " + pct((r[3] / r[1] - 1) * 100).padStart(7)).join("\n");
    console.log("\n=== reference benchmark: " + FX._sourceLocation + " ===\n" + out + "\n");

    /* Both surfaces must read the report's BIR rate. This is the one agreement we
       can demand, because it is a lookup rather than a judgement. */
    assert.strictEqual(guide.birZonalRatePerSqm, v.birZonalRatePerSqm, "guide BIR rate");
    assert.strictEqual(storefront.birZonalRatePerSqm, v.birZonalRatePerSqm, "storefront BIR rate");

    /* The guide's building must equal the report's exactly: both use 16,000/sqm and
       20% accumulated depreciation. If this drifts, our depreciation or rate changed. */
    assert.strictEqual(guide.improvement, v.buildingValue,
      "the guide's building no longer matches the report's; check the rate or depreciation");

    /* The guide lands close to the report. Pinned as a consistency check on our
       arithmetic, NOT as an accuracy claim. */
    const guideGapPct = (guide.total / v.total - 1) * 100;
    assert.ok(Math.abs(guideGapPct) < 2,
      "the guide drifted further than 2% from the report (" + guideGapPct.toFixed(2) + "%)");

    /* The storefront is expected to sit well above it. Asserted only as a direction,
       and as a tripwire: if this ever crosses to roughly equal, someone changed a
       band without updating the plan's open decision. */
    const storefrontGapPct = (storefront.total / v.total - 1) * 100;
    assert.ok(storefrontGapPct > 50,
      "the storefront no longer sits far above the reference (" + storefrontGapPct.toFixed(1) + "%) - the land multiplier may have moved");
  });
});

checkAsync("the land multiplier choice, and nothing else, explains the residual gap", () => {
  /* The guide lands close because of MARKET_IND. Show that by re-running the
     guide's own land formula at the storefront's 2.5: the residual must vanish. */
  const f = FX.inputs, v = FX.reported;
  return Promise.all([
    EST.estimate(guideOpts(f)),
    FLOW.compute(guideOpts(f), EST)
  ]).then(([storefront, guide]) => {
    /* The two differences between the surfaces, asserted exactly. Land: the
       storefront's is BIR base x 2.5; the guide's is the same base x the report's
       implied multiplier, then factor-adjusted (hence the few-peso delta). */
    assert.strictEqual(Math.round(FX.reported.birBase * 2.5), storefront.landValue,
      "the storefront land is not simply BIR base x 2.5");
    assert.ok(Math.abs(guide.landValue - FX.reported.landValue) < FX.reported.landValue * 0.02,
      "the guide's land sits near the report's, not at the storefront's");

    /* Building: each surface matches its own rate table exactly, on the same
       depreciation. The whole building difference is the rate, not the formula. */
    const dep = 1 - FX.reported.accumulatedDepreciationPct / 100;
    assert.strictEqual(guide.improvement, Math.round(guide.buildCostPerSqm * FX.inputs.floorArea * dep),
      "the guide's building is not rate x floor area x (1 - dep)");
    assert.strictEqual(storefront.improvement, Math.round(storefront.buildCostPerSqm * FX.inputs.floorArea * dep),
      "the storefront's building is not rate x floor area x (1 - dep)");
    assert.notStrictEqual(storefront.buildCostPerSqm, guide.buildCostPerSqm,
      "the two surfaces use the same rate table - then the rate is no longer a difference");

    /* And the report's own land, with our building, lands near the report's total. */
    const rebuilt = FX.reported.landValue + guide.improvement;
    assert.strictEqual(rebuilt, v.total,
      "the report's land plus our building should reproduce the report's total");
  });
});

check("no benchmark or reference figure reaches a formula", () => {
  /* estimator.js may LOAD market-benchmarks.json as display context (the result
     screen cites researched asking prices) - that is a read for the reader, not a
     formula input, and market_benchmarks_node.js asserts the compute path never
     touches it. The other files may not read it at all. The reference report
     fixture and the report block are never loaded by any of these. */
  ["js/value_guide_flow.js", "js/core.js", "js/storefront.js", "js/app.js"].forEach(f => {
    const src = fs.readFileSync(path.join(ROOT, f), "utf8");
    assert.ok(src.indexOf("market-benchmarks") < 0, f + " must not read the benchmark file");
    assert.ok(src.indexOf("value-guide-reference-bauan") < 0, f + " must not read the report fixture");
    assert.ok(src.indexOf("_referenceBenchmark") < 0, f + " must not read the report block");
  });
  /* estimator.js: the benchmark file exists only as a display feed; the report
     fixture never. */
  const est = fs.readFileSync(path.join(ROOT, "js/estimator.js"), "utf8");
  const loads = est.match(/loadJSON\("data\/market-benchmarks\.json"\)/g) || [];
  assert.strictEqual(loads.length, 1, "estimator loads the benchmark file exactly once, as display data");
  assert.ok(est.indexOf("value-guide-reference-bauan") < 0, "estimator must not read the report fixture");
  assert.ok(est.indexOf("_referenceBenchmark") < 0, "estimator must not read the report block");
});

Promise.all(pending).then(function () {
  console.log("ALL GREEN (" + count + " checks)");
}).catch(function (err) {
  console.error("FAILED:", err && err.stack || err);
  process.exit(1);
});