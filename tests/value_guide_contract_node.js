"use strict";
/* One calculation contract for both surfaces.
 *
 * docs/specs/value-guide-calculation-contract.md records what this file asserts and,
 * more usefully, where the two surfaces currently disagree. The plan calls for one
 * shared calculation. Until they are unified, the honest contract is not "they agree"
 * but "the disagreement is measured, decomposed and frozen, so nobody changes one
 * side without the other showing up in a diff".
 *
 * Three separate factors produce the gap, not one:
 *
 *   land        reference 1.174x BIR vs flat 2.5x BIR
 *   building    16,000/sqm vs 25,000/sqm
 *   storeys     x1.00 vs x1.05 on a floor area already labelled "across all storeys"
 *
 * Pinning all three matters because they have different standing. The storeys
 * multiplier is a double count and should go. The land multiplier is the open
 * business decision. The rate table is a documented difference in source.
 */
const assert = require("assert"), fs = require("fs"), path = require("path");
const ROOT = process.cwd();
global.fetch = (u) => {
  const p = path.join(ROOT, String(u).split("?")[0]);
  return Promise.resolve({ ok: fs.existsSync(p), json: () => Promise.resolve(JSON.parse(fs.readFileSync(p, "utf8"))) });
};
const EST = require(path.join(ROOT, "js/estimator.js"));
const FLOW = require(path.join(ROOT, "js/value_guide_flow.js"));
const cfg = require(path.join(ROOT, "data/zonal-config.json"));

let count = 0;
const pending = [];
function check(name, fn) { fn(); count++; console.log("[PASS] " + name); }
function checkAsync(name, fn) { pending.push(fn().then(() => { count++; console.log("[PASS] " + name); })); }

/* The property from the purchased report. One fixture, used by every check here, so
   a change that moves either surface moves it in a place this file names. */
const FORM = {
  municipality: "BAUAN", barangay: "POBLACION III",
  streetKey: "binay st ressurreccion st", classification: "RR",
  type: "house_lot", area: 100, floorArea: 120,
  construction: "mixed_chb", floors: "2", ageBand: "6-10",
  corner: false, features: [], landMethod: "factor",
  saleContext: "private-resale", effectivityDate: "2022-07-23",
  roadAccess: "50"
};

/* Builds model input the way js/app.js vgModelOpts() does. Kept as a copy rather
   than a require because vgModelOpts is a closure inside the app bundle and cannot
   be called from Node; if the two drift, this file's totals stop matching
   value_guide_flow_node.js's golden fixture, which is the signal we want. */
function modelOpts(f) {
  return Object.assign({}, FLOW.pickInputs(f), {
    purpose: f.purpose, type: f.type,
    municipality: f.municipality, barangay: f.barangay,
    streetKey: f.allOther ? "" : f.streetKey, allOther: !!f.allOther,
    effectivityDate: f.effectivityDate, classification: f.classification,
    area: Number(f.area) || 0,
    salePrice: f.salePrice === "" || f.salePrice == null ? null : Number(f.salePrice),
    saleContext: f.saleContext || "private-resale",
    developerFees: f.developerFees === "" || f.developerFees == null ? null : Number(f.developerFees),
    landMethod: f.landMethod || "factor",
    construction: f.construction, floorArea: Number(f.floorArea) || 0,
    floors: f.floors, ageBand: f.ageBand, features: f.features
  });
}

const REPORT = { birRate: 11500, birBase: 1150000, land: 1350000, building: 1536000, total: 2886000 };

/* ------------------------------------------------------- contract shape */

check("both surfaces expose the same result field names", () => {
  /* A shared contract means a renderer can read either result without asking which
     model produced it. The fields a consumer actually binds to are pinned here. */
  const required = ["available", "reason", "birZonalRatePerSqm", "birZonalValue", "birReferenceLabel",
    "landValue", "landPerSqm", "improvement", "total", "low", "high", "perSqm",
    "buildCostPerSqm", "floorsMultiplier", "depreciatedPct", "saleContext", "costOptions",
    "marketGuide", "marketGuideEstimate", "referenceVerification", "factorSettingsVersion",
    "calculationVersion", "dataVersion", "integrity", "type", "area"];
  return Promise.all([
    EST.estimate(modelOpts(FORM)),
    FLOW.compute(modelOpts(FORM), EST)
  ]).then(([storefront, guide]) => {
    [storefront, guide].forEach((r, i) => {
      const which = i ? "guide" : "storefront";
      required.forEach(k => assert.ok(Object.prototype.hasOwnProperty.call(r, k),
        which + " result is missing " + k));
    });
    /* floorsMultiplier exists on both precisely so the double count is visible on
       both surfaces rather than buried in one. */
    assert.strictEqual(guide.floorsMultiplier, 1, "the guide applies no storeys multiplier");
  });
});

check("customer and transaction metadata never moves the number", () => {
  /* The acceptance criterion, as an invariant. Name, purpose, contact details and
     asking-price scenarios shape the surrounding report and the transaction-cost
     panel. None of them may reach the valuation. */
  return Promise.all([
    EST.estimate(modelOpts(FORM)),
    FLOW.compute(modelOpts(FORM), EST)
  ]).then(([plainE, plainG]) => {
    const variants = [
      ["preparedFor", { preparedFor: "Ana Dela Cruz" }],
      ["customerName", { customerName: "Ana Dela Cruz" }],
      ["purpose", { purpose: "Buying" }],
      ["phone+email", { phone: "09171234567", email: "ana@example.com" }],
      ["salePrice", { salePrice: 3000000 }],
      ["developerFees", { developerFees: 250000 }]
    ];
    return Promise.all(variants.map(([name, extra]) => {
      const opts = modelOpts(Object.assign({}, FORM, extra));
      return Promise.all([EST.estimate(opts), FLOW.compute(opts, EST)]).then(([e, g]) => {
        assert.strictEqual(e.total, plainE.total, "storefront total moved with " + name);
        assert.strictEqual(g.total, plainG.total, "guide total moved with " + name);
      });
    }));
  });
});

check("a scenario that the model does not recognise is refused, not silently priced", () => {
  /* saleContext is validated. An unknown value returns unavailable rather than
     defaulting, which is correct: a guessed transaction basis would flow into the
     tax panel. But it must be a refusal with a reason, never a partial number. */
  return EST.estimate(modelOpts(Object.assign({}, FORM, { saleContext: "foreclosure" })))
    .then(r => {
      assert.strictEqual(r.available, false);
      assert.strictEqual(r.reason, "invalid-sale-context");
      assert.strictEqual(r.total, undefined, "a refused scenario must not carry a total");
    });
});

/* ------------------------------------------------- divergence, decomposed */

checkAsync("the two surfaces agree on BIR, and differ only on land and the rate table", () => {
  return Promise.all([
    EST.estimate(modelOpts(FORM)),
    FLOW.compute(modelOpts(FORM), EST)
  ]).then(([s, g]) => {
    /* They read the same BIR rate. If this ever fails the divergence below has a
       fourth cause and the decomposition is no longer complete. */
    assert.strictEqual(s.birZonalRatePerSqm, g.birZonalRatePerSqm, "BIR rate disagreement");
    assert.strictEqual(s.birZonalRatePerSqm, REPORT.birRate, "BIR rate differs from the report");

    /* Land: flat band vs the report-implied indicator. */
    assert.strictEqual(s.appliedMultiple, 2.5, "storefront residential band moved");
    assert.strictEqual(s.landValue, REPORT.birBase * 2.5, "storefront land is not BIR x 2.5");
    assert.ok(g.landValue < s.landValue, "the guide's land is lower than the flat band");

    /* Building: rate table, then the storeys multiplier on top. */
    assert.strictEqual(g.buildCostPerSqm, 16000, "guide CHB rate moved");
    assert.strictEqual(s.buildCostPerSqm, 25000, "storefront CHB rate moved");

    /* The building gap must decompose exactly. The storeys factor is gone as of
       Task 4, so the whole remaining difference is the rate table. If this stops
       equalling the real difference, a second cause has appeared. */
    const dep = 1 - (8 / 40);                      /* age band 6-10, midpoint 8, life 40 */
    const rateGap = 120 * (25000 - 16000) * dep;
    const actual = s.improvement - g.improvement;
    assert.strictEqual(Math.round(rateGap), Math.round(actual),
      "the building gap is no longer explained by the rate table alone (" +
      Math.round(rateGap) + " != " + Math.round(actual) + ")");
  });
});

check("no surface prices storeys twice on an area already measured across all of them", () => {
  /* Removed in Task 4. Floor area is entered once and labelled "Total built-up
     area (sqm) / Across all storeys"; the config then multiplied it by 1.05 for two
     storeys and 1.10 for three, charging the same square metres a second time. On
     the report fixture that was 120,000.

     The reference labels its field "Total floor area across all storeys" and applies
     no storeys factor, and our guide already set floorsMultiplier = 1.

     If a genuine multi-storey premium is ever justified, it belongs in the rate
     table as a per-storey construction argument, not as a multiply over a total. */
  assert.strictEqual(FLOW.MODEL.floorsMultiplier, undefined,
    "the guide model should not declare a storeys multiplier at all");
  assert.ok(cfg.floors.every(f => f.multiplier === 1),
    "storefront table still prices storeys: " +
      cfg.floors.map(f => f.key + "=" + f.multiplier).join(", "));
  /* It must also be gone from the reader-facing copy, not merely neutralised. A
     disclosed "x1.05" that no longer applies is worse than never printing it. */
  const src = fs.readFileSync(path.join(ROOT, "js/estimator.js"), "utf8");
  assert.ok(src.indexOf('"Storeys: <b>') < 0, "the report still prints a storeys multiplier line");
  assert.ok(src.indexOf("storeys also apply a cost factor") < 0, "the field hint still promises a storeys factor");
});

check("the report reconciliation is a separate table, never folded into a multiplier", () => {
  /* docs/plans/... Task 5 acceptance: the benchmark reports a difference, it does
     not tune a global constant to make it zero. The report's implied 1.174 exists in
     the guide as MARKET_IND, which is fine because the guide IS the reference-aligned
     model - but it must not leak into the storefront, which has its own band. */
  assert.strictEqual(FLOW.MODEL.MARKET_IND, 1.174, "the guide's reference indicator moved");
  assert.notStrictEqual(s_val(), FLOW.MODEL.MARKET_IND,
    "the storefront band has become the reference multiplier - that is Task 9's decision, not a silent change");
  function s_val() { return cfg.marketBand.bands.residential.mid; }
  /* And the benchmark data must remain non-numerical, in both its homes. */
  const BM = require(path.join(ROOT, "data/market-benchmarks.json"));
  assert.ok(BM.records.every(r => r.numericalAllowed === false));
  const FX = require(path.join(ROOT, "tests/fixtures/value-guide-reference-bauan.json"));
  assert.ok(FX._referenceIsNotMarketEvidence, "the reference fixture still records its non-market status");
});

check("a vacant lot never inherits a building value", () => {
  /* Plan review case #1. The kind flag gates the whole building block, so this must
     hold on both surfaces regardless of what floorArea is passed in. */
  const vacant = Object.assign({}, FORM, { type: "vacant_lot", floorArea: 120 });
  return Promise.all([
    EST.estimate(modelOpts(vacant)),
    FLOW.compute(modelOpts(vacant), EST)
  ]).then(([s, g]) => {
    assert.strictEqual(s.improvement, 0, "storefront gave a vacant lot a building");
    assert.strictEqual(g.improvement, 0, "the guide gave a vacant lot a building");
    assert.strictEqual(s.total, s.landValue, "storefront total is not land-only");
    assert.strictEqual(g.total, g.landValue, "guide total is not land-only");
  });
});

check("both surfaces reconcile internally: components sum to the total", () => {
  return Promise.all([
    EST.estimate(modelOpts(FORM)),
    FLOW.compute(modelOpts(FORM), EST)
  ]).then(([s, g]) => {
    [s, g].forEach((r, i) => {
      const which = i ? "guide" : "storefront";
      assert.ok(r.integrity && r.integrity.ok, which + " integrity check failed: " + JSON.stringify(r.integrity));
      /* The range is a disclosed scenario band, not a confidence interval. */
      assert.ok(r.low < r.total && r.total < r.high, which + " total is not inside its own range");
    });
  });
});

check("the model version is reported on every result, so a number can be traced back", () => {
  return EST.estimate(modelOpts(FORM)).then(r => {
    assert.ok(r.calculationVersion, "no calculation version");
    assert.ok(r.dataVersion, "no data version");
    assert.ok(r.factorSettingsVersion, "no factor-settings version");
  });
});

Promise.all(pending).then(function () {
  console.log("ALL GREEN (" + count + " checks)");
}).catch(function (err) {
  console.error("FAILED:", err && err.stack || err);
  process.exit(1);
});