"use strict";
/* Reference-model tests for the 3-step Value Guide.
 *
 * The golden fixture is the Bauan Poblacion III street already asserted by
 * tests/value_guide_reference_node.js:22 (RR class -> 11,500/sqm). The expected
 * totals are fixed by docs/specs/value-guide-3-step.md and must not be retuned
 * to make a code change pass. */
const assert = require("assert"), fs = require("fs"), path = require("path");
const ROOT = process.cwd();
/* Node's fetch() rejects the relative URLs the estimator loads from. Same shim
   tests/value_guide_tax_node.js uses. */
global.fetch = (u) => {
  const p = path.join(ROOT, String(u).split("?")[0]);
  return Promise.resolve({ ok: fs.existsSync(p), json: () => Promise.resolve(JSON.parse(fs.readFileSync(p, "utf8"))) });
};
const EST = require(path.join(ROOT, "js/estimator.js"));

let count = 0;
async function check(name, fn) { await fn(); count++; console.log("[PASS] " + name); }

const OPTS = {
  municipality: "BAUAN", barangay: "POBLACION III",
  streetKey: "binay st ressurreccion st", classification: "RR",
  type: "house_lot", area: 100, floorArea: 120, construction: "mixed_chb",
  floors: "2", ageBand: "6-10", corner: false, features: [],
  landMethod: "factor", saleContext: "private-resale",
  /* the three answers that produce the published net of -50 bp */
  roadAccess: "50", community: "100", zonalRecency: "-200"
};
const VACANT = Object.assign({}, OPTS, { type: "vacant_lot", floorArea: 0 });

const flow = () => require("../js/value_guide_flow.js");

(async () => {
  /* ---- 1. golden house-and-lot ---------------------------------------- */
  await check("golden house-and-lot fixture", async () => {
    const r = await flow().compute(OPTS, EST);
    assert.strictEqual(r.birZonalRatePerSqm, 11500, "BIR rate unchanged");
    assert.strictEqual(r.birZonalValue, 1150000, "BIR value unchanged");
    assert.strictEqual(r.landValue, 1343350);
    assert.strictEqual(r.improvement, 1536000);
    assert.strictEqual(r.total, 2879350);
    assert.strictEqual(r.low, 2447448);
    assert.strictEqual(r.high, 3743155);
    assert.strictEqual(r.perSqm, 28794);
  });

  /* ---- 2. vacant-lot vector ------------------------------------------- */
  await check("vacant-lot vector carries no improvement", async () => {
    const r = await flow().compute(VACANT, EST);
    assert.strictEqual(r.improvement, 0);
    assert.strictEqual(r.total, 1343350);
    assert.strictEqual(r.low, 1141848);
    assert.strictEqual(r.high, 1746355);
    assert.strictEqual(r.perSqm, 13434);
  });

  /* ---- 3. the model constants ---------------------------------------- */
  await check("construction rate table is flat", () => {
    const F = flow();
    assert.strictEqual(F.MODEL.RCN.mixed_chb, 16000);
    assert.strictEqual(F.MODEL.RCN.wood_prefab, 8000);
    assert.strictEqual(F.MODEL.RCN.rca_steel, 18000);
    assert.strictEqual(F.MODEL.valuationYear, undefined, "no valuation year");
    assert.ok(!/1\.02/.test(fs.readFileSync(path.join(ROOT, "js/value_guide_flow.js"), "utf8")), "no escalation factor in source");
  });
  await check("market indicator is exactly 1.174", () =>
    assert.strictEqual(flow().MODEL.MARKET_IND, 1.174));
  await check("range band is 0.85 / 1.30", () => {
    assert.strictEqual(flow().MODEL.RANGE_LOW, 0.85);
    assert.strictEqual(flow().MODEL.RANGE_HIGH, 1.30);
  });
  await check("depreciation cap is 0.80 on a 40-year life", () => {
    assert.strictEqual(flow().MODEL.DEP_CAP, 0.80);
    assert.strictEqual(flow().MODEL.USEFUL_LIFE.mixed_chb, 40);
  });
  await check("twelve published factors, each with a section", () => {
    const F = flow();
    assert.strictEqual(F.FACTORS.length, 12);
    F.FACTORS.forEach(f => assert.ok(f.section && f.options && f.options.length, f.id));
  });

  /* ---- 4. rules ------------------------------------------------------- */
  await check("no ownership adjustment", async () =>
    assert.strictEqual((await flow().compute(OPTS, EST)).ownershipAdjustmentPct, 0));

  await check("depreciation caps at 80% on the oldest band", async () => {
    const r = await flow().compute(Object.assign({}, OPTS, { ageBand: "31plus" }), EST);
    assert.strictEqual(r.depreciatedPct, 80);
    assert.strictEqual(r.improvement, 120 * 16000 * 0.2);
  });

  await check("the youngest band barely depreciates", async () => {
    const r = await flow().compute(Object.assign({}, OPTS, { ageBand: "0-5" }), EST);
    assert.strictEqual(r.depreciatedPct, 6.25);
    assert.strictEqual(r.improvement, Math.round(120 * 16000 * (1 - 0.0625)));
  });

  await check("integrity check passes on the produced result", async () => {
    const r = await flow().compute(OPTS, EST);
    assert.ok(r.integrity && r.integrity.ok, JSON.stringify(r.integrity));
  });

  await check("an unavailable estimate passes through untouched", async () => {
    const r = await flow().compute(Object.assign({}, OPTS, { area: 0 }), EST);
    assert.strictEqual(r.available, false);
    assert.strictEqual(r.reason, "no-area");
  });

  await check("the BIR figure is never blended into the estimate", async () => {
    const r = await flow().compute(OPTS, EST);
    assert.strictEqual(r.birZonalValue, 1150000);
    assert.strictEqual(r.taxReferenceValue, 1150000);
    assert.notStrictEqual(r.total, r.birZonalValue);
  });

  /* ---- 5. section split ----------------------------------------------- */
  await check("a building-section answer never moves a vacant lot", async () => {
    const a = await flow().compute(VACANT, EST);
    const b = await flow().compute(Object.assign({}, VACANT, { demand: "300" }), EST);
    assert.strictEqual(a.total, b.total);
    assert.strictEqual(a.landValue, b.landValue);
  });

  await check("a building-section answer moves only the building", async () => {
    const a = await flow().compute(OPTS, EST);
    const b = await flow().compute(Object.assign({}, OPTS, { demand: "300" }), EST);
    assert.strictEqual(b.landValue, a.landValue, "land untouched");
    assert.ok(b.improvement > a.improvement, "building rises");
  });

  await check("the land net never touches the building component", async () => {
    const r = await flow().compute(OPTS, EST);
    assert.strictEqual(r.improvement, 1536000);
  });

  /* ---- 6. additive net ------------------------------------------------ */
  await check("net is additive, not compounded", async () => {
    const F = flow();
    const zero = await F.compute(Object.assign({}, VACANT, { roadAccess: "", community: "", zonalRecency: "" }), EST);
    const one  = await F.compute(Object.assign({}, VACANT, { roadAccess: "50", community: "", zonalRecency: "" }), EST);
    const two  = await F.compute(Object.assign({}, VACANT, { roadAccess: "50", infrastructure: "50", community: "", zonalRecency: "" }), EST);
    assert.strictEqual(zero.referenceModel.net, 0);
    assert.strictEqual(one.referenceModel.net, 0.005);
    assert.strictEqual(two.referenceModel.net, 0.01, "50bp + 50bp = 100bp, not 1.05 x 1.05");
    const compounded = 1.005 * 1.005;
    assert.notStrictEqual(1 + two.referenceModel.net, compounded);
  });

  await check("the golden fixture lands on the published net of -50 bp", async () => {
    const r = await flow().compute(OPTS, EST);
    assert.strictEqual(r.referenceModel.net, -0.005);
  });

  await check("net stays inside every published factor range", async () => {
    const F = flow();
    F.FACTORS.forEach(f => f.options.forEach(o => {
      assert.ok(o.bp >= f.min && o.bp <= f.max, f.id + " option " + o.value + " outside published range");
    }));
  });

  /* ---- 7. the model is named ------------------------------------------ */
  await check("the result names its model", async () => {
    const r = await flow().compute(OPTS, EST);
    assert.strictEqual(r.referenceModel.name, "LandValuePH reference model");
    assert.strictEqual(r.referenceModel.marketInd, 1.174);
    assert.strictEqual(r.appliedMultiple, null, "stale public multiple suppressed");
    assert.strictEqual(r.factorStack, null);
  });

  /* ---- 8. the wizard shape ------------------------------------------- */
  await check("wizard has exactly three stages", () => {
    const APP = fs.readFileSync(path.join(ROOT, "js/app.js"), "utf8");
    const m = APP.match(/const VG_STAGES = \[([\s\S]*?)\];/);
    assert.ok(m, "VG_STAGES still present");
    assert.strictEqual((m[1].match(/\{ n:/g) || []).length, 3);
    assert.ok(/Location/.test(m[1]) && /Details/.test(m[1]) && /Report/.test(m[1]));
  });

  await check("calculate routes through the flow module", () => {
    const APP = fs.readFileSync(path.join(ROOT, "js/app.js"), "utf8");
    assert.ok(/ESREALTY_VG_FLOW/.test(APP), "flow module referenced");
    assert.ok(!/vgEst\(\)\.estimate\(vgOpts\(\)\)/.test(APP), "raw estimate() call removed");
  });

  await check("old stage helpers are gone", () => {
    const APP = fs.readFileSync(path.join(ROOT, "js/app.js"), "utf8");
    ["function vgStage4", "vgUnavailableReason", "vgAboutGroup", "vgDisclosure"].forEach(n =>
      assert.ok(APP.indexOf(n) < 0, n + " should be deleted"));
  });

  await check("index.html loads the flow module before the bundle", () => {
    const html = fs.readFileSync(path.join(ROOT, "index.html"), "utf8");
    const i = html.indexOf("js/value_guide_flow.js"), j = html.indexOf("js/app.min.js");
    assert.ok(i > 0 && j > 0 && i < j, "script order: flow at " + i + ", bundle at " + j);
  });

  console.log("ALL GREEN (" + count + " checks)");
})().catch(error => { console.error(error); process.exitCode = 1; });
