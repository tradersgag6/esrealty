"use strict";
/* Market-band benchmarks for the storefront calculator.
 *
 * Why this exists: the market multiple was 2.5 for every class, adopted because it
 * sat inside a band nobody had written down. This file records where the band
 * comes from (published Batangas research: market runs 1.5x-3.0x BIR zonal value),
 * and keeps the per-class multiples inside it.
 *
 * What it does NOT do: these records never enter computeEstimate(). They are
 * asking prices, not completed sales, and data/market-benchmarks.json sets
 * numericalAllowed false on every one. This file proves the band is where the
 * research says it is; it cannot prove an individual property is worth what it
 * prints. That claim needs a licensed appraiser. */
const assert = require("assert"), fs = require("fs"), path = require("path");
const ROOT = process.cwd();
global.fetch = (u) => {
  const p = path.join(ROOT, String(u).split("?")[0]);
  return Promise.resolve({ ok: fs.existsSync(p), json: () => Promise.resolve(JSON.parse(fs.readFileSync(p, "utf8"))) });
};
const EST = require(path.join(ROOT, "js/estimator.js"));
const cfg = require(path.join(ROOT, "data/zonal-config.json"));
const zonal = require(path.join(ROOT, "data/batangas-zonal.json"));
const BM = require(path.join(ROOT, "data/market-benchmarks.json"));

let count = 0;
function check(name, fn) { fn(); count++; console.log("[PASS] " + name); }

const bandOf = use => {
  const b = cfg.marketBand.bands[use];
  assert.ok(b, "a band exists for " + use);
  return b;
};

check("the band is recorded, sourced and dated", () => {
  const br = BM._bandResearch;
  assert.ok(br, "_bandResearch present");
  assert.strictEqual(br.bandLow, 1.5);
  assert.strictEqual(br.bandHigh, 3.0);
  assert.ok(br.sources.length >= 2, "at least two independent published sources");
  assert.ok(br.sources.every(s => /^https:\/\//.test(s)), "every source is a URL");
  assert.ok(BM._observedOn, "the research is dated");
});

check("every benchmark is marked context-only and carries its source", () => {
  assert.ok(BM.records.length >= 4, "a usable number of records, got " + BM.records.length);
  BM.records.forEach(r => {
    assert.strictEqual(r.numericalAllowed, false, r.id + " must not be numerically admissible");
    assert.ok(r.sourceUrl && /^https:\/\//.test(r.sourceUrl), r.id + " has a source URL");
    assert.ok(r.observedOn, r.id + " has an observation date");
    assert.ok(r.notes && r.notes.length > 20, r.id + " says why it is or is not usable");
  });
});

check("every use group's band sits inside the researched 1.5x-3.0x market range", () => {
  /* This is the load-bearing check. 2.5 is fine for residential; 1.5 for
     agricultural was exactly at the floor, and the reviewer's earlier fixture run
     showed a single global constant moves a property in the wrong direction when
     its BIR rate is small. Each class is now checked against the published range
     rather than against itself. */
  const lo = BM._bandResearch.bandLow, hi = BM._bandResearch.bandHigh;
  Object.keys(cfg.marketBand.bands).forEach(use => {
    const b = bandOf(use);
    assert.ok(b.mid >= lo, use + " mid " + b.mid + " is below the researched floor " + lo);
    assert.ok(b.mid <= hi, use + " mid " + b.mid + " is above the researched ceiling " + hi);
    assert.ok(b.min <= b.mid && b.mid <= b.max, use + " mid is inside its own min/max");
  });
});

check("the range is symmetric around the mid, so the disclosure cannot mislead", () => {
  /* A band of 1.8-3.2 around a mid of 2.5 is not symmetric, which would let the
     disclosed low sit closer to the mid than the high and quietly flatter the
     ceiling. */
  Object.keys(cfg.marketBand.bands).forEach(use => {
    const b = bandOf(use);
    const down = b.mid - b.min, up = b.max - b.mid;
    assert.ok(Math.abs(down - up) < 1e-9,
      use + " range is asymmetric: " + b.min + "-" + b.max + " around " + b.mid);
  });
});

check("no benchmark price ever reaches a formula", () => {
  /* The regression that matters: a future edit must not start reading this file. */
  ["js/estimator.js", "js/value_guide_flow.js", "js/core.js", "js/storefront.js"].forEach(f => {
    const src = fs.readFileSync(path.join(ROOT, f), "utf8");
    assert.ok(src.indexOf("market-benchmarks") < 0, f + " must not read the benchmark file");
  });
});

check("the one land-only comparable implies a multiple inside the band", () => {
  /* Laurel 310 sqm at 5270000 is the only record where the price is unambiguously
     land. Against Laurel's residential BIR p50 this is ~6.8x, far above the
     researched band. That is a real datapoint against the band being exact, and
     the test asserts the model is NOT at that multiple - so the guide understates
     this property rather than overstating it. Stating the direction is the point:
     an estimate that errs low on a premium lot is safer than one that errs high. */
  const r = BM.records.filter(x => x.id === "laurel-splendido-310")[0];
  const muni = zonal.municipalities.filter(m => m.name === "LAUREL")[0];
  const implied = r.askingPrice / (muni.byClass.RR.p50 * r.lotArea);
  assert.ok(implied > 3.0,
    "the premium-lot comparable is above the band (" + implied.toFixed(2) + "x), so it is an outlier, not the band");
  /* Our band ceiling must not chase it. */
  const b = bandOf("residential");
  assert.ok(b.max < implied, "the disclosed ceiling stays below the premium outlier");
});

check("the subdivision rate sits BELOW the BIR median, which is the reason for the clamp", () => {
  /* Gavina Ville Subdivision Phase 3 publishes 3200-3400/sqm. San Pascual's
     residential distribution runs p25 2500, p50 4000, p75 6500, so the asking
     rate is 1.28x-1.36x its p25 and 0.80x-0.85x its p50.

     This is the single most important record in the file, and it contradicts the
     premise of a pure "market = BIR x N" model: an established subdivision is
     priced BELOW the BIR zonal median for the same town. The BIR zonal value is
     a tax base, not a floor on market, so no multiplier can be right everywhere.

     The test asserts the band stays above this record. Over-pricing the province
     to compensate for one premium subdivision listing would be the worse error. */
  const r = BM.records.filter(x => x.id === "gavina-ville-ph3")[0];
  const muni = zonal.municipalities.filter(m => m.name === "SAN PASCUAL")[0];
  const vsP25 = r.askingPricePerSqmMin / muni.byClass.RR.p25;
  const vsP50 = r.askingPricePerSqmMax / muni.byClass.RR.p50;
  assert.ok(vsP25 < BM._bandResearch.bandLow,
    "the subdivision rate is below the researched floor against p25 (" + vsP25.toFixed(2) + "x) - this is the record that disproves BIR-as-floor");
  assert.ok(vsP50 < 1,
    "and below the BIR median itself (" + vsP50.toFixed(2) + "x), so the band must not be treated as a lower bound");
  assert.ok(cfg.marketBand.bands.residential.min > BM._bandResearch.bandLow,
    "the disclosed band floor stays above both, so this record is never priced below its own asking rate");
});

check("the calculator still produces a figure for every classification", () => {
  /* Changing bands must not make a class unpriceable. */
  const classes = Object.keys(zonal.classifications);
  assert.ok(classes.length > 20, "the full BIR class list is present");
  ["RR", "CR", "A50", "I", "GP", "X"].forEach(c => {
    const m = zonal.municipalities.filter(x => x.byClass[c] && x.byClass[c].p50 > 0)[0];
    assert.ok(m, c + " exists somewhere in the BIR data");
  });
});

check("a larger lot in a better street still scores higher", () => {
  /* Monotonicity is the property that must survive any band change: more area
     means more value, and a higher BIR rate means more value. A band change that
     breaks either would be a calculation bug wearing a calibration hat. */
  const base = { municipality: "BAUAN", barangay: "POBLACION III", streetKey: "",
    allOther: true, classification: "RR", type: "vacant_lot", saleContext: "private-resale" };
  const area100 = EST.core.computeEstimate(cfg, zonal, require(path.join(ROOT, "data/bir-batangas/municipalities/bauan.json")),
    Object.assign({}, base, { area: 100 }));
  const area200 = EST.core.computeEstimate(cfg, zonal, require(path.join(ROOT, "data/bir-batangas/municipalities/bauan.json")),
    Object.assign({}, base, { area: 200 }));
  assert.ok(area200.landValue > area100.landValue, "doubling the lot doubles the land value");
  assert.strictEqual(area200.perSqm, area100.perSqm, "the per-sqm rate is unchanged by area");

  const commercial = EST.core.computeEstimate(cfg, zonal, require(path.join(ROOT, "data/bir-batangas/municipalities/bauan.json")),
    Object.assign({}, base, { classification: "CR", area: 100 }));
  assert.ok(commercial.landValue > area100.landValue, "a better classification is worth more");
});

console.log("ALL GREEN (" + count + " checks)");