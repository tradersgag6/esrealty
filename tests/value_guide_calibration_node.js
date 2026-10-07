"use strict";
/* Calibration: does the model land near the BIR zonal distribution?
 *
 * There is no market-price data in this repo or in the listings API (3 records,
 * all Caloocan, none with a lot area), so this cannot validate the estimate
 * against what properties actually sell for. What it can do is measure how far
 * the multipliers carry a value off the BIR base for that class and municipality,
 * which is the honest thing to calibrate. The threshold is recorded in the
 * fixture file from a measured run, never chosen in advance. */
const assert = require("assert"), fs = require("fs"), path = require("path");
const ROOT = process.cwd();
global.fetch = (u) => {
  const p = path.join(ROOT, String(u).split("?")[0]);
  return Promise.resolve({ ok: fs.existsSync(p), json: () => Promise.resolve(JSON.parse(fs.readFileSync(p, "utf8"))) });
};
const EST = require(path.join(ROOT, "js/estimator.js"));
const F = require(path.join(ROOT, "js/value_guide_flow.js"));
const zonal = JSON.parse(fs.readFileSync(path.join(ROOT, "data/batangas-zonal.json"), "utf8").replace(/^\uFEFF/, ""));
const FIX = JSON.parse(fs.readFileSync(path.join(ROOT, "tests/fixtures/value-guide-calibration.json"), "utf8"));

let count = 0;
async function check(name, fn) { await fn(); count++; console.log("[PASS] " + name); }

function mun(slug) { return zonal.municipalities.filter(m => m.slug === slug)[0]; }

(async () => {

await check("every fixture resolves against the BIR data", async () => {
  await EST.loadData();
  for (const f of FIX.fixtures) {
    const m = mun(f.municipality.toLowerCase().replace(/\s+/g, "-"));
    assert.ok(m, f.id + ": municipality " + f.municipality + " not in batangas-zonal.json");
    assert.ok(m.byClass[f.classification] && m.byClass[f.classification].p50 > 0,
      f.id + ": " + f.classification + " has no p50 in " + f.municipality);
    const r = await F.compute(Object.assign({}, baseFor(f), F.pickInputs({})), EST);
    assert.ok(r.available !== false, f.id + " unavailable: " + (r.reason || ""));
  }
});

await check("the model is the resolved BIR rate times the multiplier, not the p50", async () => {
  /* Read this before trusting the deviation figure above. The comparison target
     is the municipality's p50, but the model resolves a specific rate for the
     chosen location, which may be a street value, a barangay all-other-streets
     value, or the municipal median as a fallback. So the deviation measures the
     multiplier AND how far the resolved rate sits from p50 — a property of the
     fixture, not an accuracy measurement. Bauan RR resolves 6500 against a p50 of
     3700, so 17.4% for that fixture is mostly the resolution, not the model. */
  assert.strictEqual(F.MODEL.MARKET_IND, 1.174, "the multiplier under test");
  const e = await EST.estimate(Object.assign({}, baseFor({ municipality: "BAUAN", classification: "RR" })));
  const r = await F.compute(Object.assign({}, baseFor({ municipality: "BAUAN", classification: "RR" }), F.pickInputs({})), EST);
  assert.strictEqual(r.perSqm, Math.round(e.birZonalRatePerSqm * F.MODEL.MARKET_IND),
    "with no answers the model is exactly the resolved BIR rate x MARKET_IND");
  assert.notStrictEqual(e.birZonalRatePerSqm, mun("bauan").byClass.RR.p50,
    "the resolved rate and the p50 genuinely differ, so the deviation is not the multiplier alone");
  assert.ok(/cannot|does not measure/i.test(FIX._what_this_does_not_prove),
    "the fixture file states what the harness cannot prove");
});

await check("the recorded threshold is a real bound, not a placeholder", () => {
  assert.ok(FIX.threshold.medianAbsDeviationPct !== null, "threshold recorded");
  assert.ok(FIX.threshold.shareWithinP25P75 !== null, "threshold recorded");
  assert.ok(FIX.threshold.medianAbsDeviationPct >= FIX.threshold._measured.medianAbsDeviationPct,
    "the bound was set from the measurement, not below it");
  assert.ok(FIX.threshold.shareWithinP25P75 <= FIX.threshold._measured.shareWithinP25P75);
  assert.ok(FIX.threshold._measuredOn && FIX.threshold._command, "the measurement is dated and reproducible");
});

await check("the measurement is recorded and reproducible", async () => {
  const devs = [];
  let within = 0, n = 0;
  for (const f of FIX.fixtures) {
    const m = mun(f.municipality.toLowerCase().replace(/\s+/g, "-"));
    const dist = m.byClass[f.classification];
    for (const area of FIX.areas) {
      const r = await F.compute(Object.assign({}, baseFor(f, area), F.pickInputs({})), EST);
      const dev = Math.abs(r.perSqm - dist.p50) / dist.p50;
      devs.push(dev);
      n++;
      if (r.perSqm >= dist.p25 && r.perSqm <= dist.p75) within++;
    }
  }
  devs.sort((a, b) => a - b);
  const median = devs[Math.floor(devs.length / 2)];
  const share = within / n;
  console.log("    median |model - p50| = " + (median * 100).toFixed(1) + "%");
  console.log("    within p25-p75       = " + (share * 100).toFixed(1) + "%  (" + within + "/" + n + ")");
  if (FIX.threshold.medianAbsDeviationPct === null) {
    console.log("    threshold not recorded yet; the fixture file is the place for it");
    return;
  }
  assert.ok(median * 100 <= FIX.threshold.medianAbsDeviationPct,
    "median deviation " + (median * 100).toFixed(1) + "% exceeds the recorded " + FIX.threshold.medianAbsDeviationPct + "%");
  assert.ok(share >= FIX.threshold.shareWithinP25P75,
    "p25-p75 share " + (share * 100).toFixed(1) + "% below the recorded " + (FIX.threshold.shareWithinP25P75 * 100).toFixed(1) + "%");
});

await check("the fixtures span more than one price band", () => {
  /* A threshold measured on one band proves nothing. Balayan RR p50 3000 and
     Batangas City RR p50 6000 are the same class at two prices. */
  const rr = FIX.fixtures.filter(f => f.classification === "RR")
    .map(f => mun(f.municipality.toLowerCase().replace(/\s+/g, "-")).byClass.RR.p50);
  assert.ok(new Set(rr).size > 1, "RR fixtures do not all share a p50: " + rr.join(", "));
  assert.ok(new Set(FIX.fixtures.map(f => f.classification)).size >= 4, "all four classes exercised");
  assert.ok(FIX.areas.length >= 2, "more than one lot size");
});

console.log("ALL GREEN (" + count + " checks)");
})().catch(error => { console.error(error); process.exitCode = 1; });

function baseFor(f, area) {
  return { municipality: f.municipality, barangay: "POBLACION III", streetKey: "",
    allOther: true, classification: f.classification, type: "vacant_lot",
    area: area || FIX.areas[0], saleContext: "private-resale" };
}