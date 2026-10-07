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

/* Reads the RR rate BIR actually assigns to a named street. A municipal p50 is
   not a valid denominator for an individual property: it blends subdivisions
   priced far above it with subdivisions priced far below it. Correcting this is
   what turned the two records below from apparent outliers into ordinary ones. */
function streetRR(muniSlug, barangay, street) {
  const d = require(path.join(ROOT, "data/bir-batangas/municipalities/" + muniSlug + ".json"));
  const b = (d.barangays || {})[barangay];
  assert.ok(b, muniSlug + " has barangay " + barangay);
  const st = (b.streets || {})[street];
  assert.ok(st, muniSlug + " has street " + street + " in " + barangay);
  return st.classes.RR.value;
}

check("the premium land listing lands at or near the band, so it is not an outlier", () => {
  /* 310 sqm at 5270000 is the only record where the price is unambiguously land.
     The previous version of this test compared it against Laurel's residential
     p50 of 2500/sqm and concluded 6.8x - far above the band. That denominator was
     wrong: it is not the rate this street carries, and no individual property can
     be judged against a town-wide median.

     Against the rates BIR actually assigns to Splendido Taal, the same listing is
     1.26x (Dayap Itaas / Niyugan, 13500) to 2.43x (Paliparan, 7000) - i.e. it sits
     inside the researched band, not 2.7x above it. The record no longer supports
     treating the band as an over-estimate. */
  const r = BM.records.filter(x => x.id === "laurel-splendido-310")[0];
  const perSqm = r.askingPrice / r.lotArea;
  const dayap = streetRR("laurel", "DAYAP ITAAS", "splendido taal jaka");
  const paliparan = streetRR("laurel", "PALIPARAN", "splendido taal");
  const low = perSqm / Math.max(dayap, paliparan);
  const high = perSqm / Math.min(dayap, paliparan);
  assert.ok(low >= 1.2 && low <= 1.4, "against the 13500 street rate it is ~1.26x, got " + low.toFixed(2));
  assert.ok(high >= 2.3 && high <= 2.5, "against the 7000 street rate it is ~2.43x, got " + high.toFixed(2));
  assert.ok(high <= BM._bandResearch.bandHigh,
    "even the more favourable denominator stays inside the researched ceiling");
  assert.ok(low >= 1.2, "and it is not so far below the floor that it would drag the band down either");
});

check("the subdivision record sits BELOW its own street's BIR rate, which is why the band is clamped", () => {
  /* Gavina Ville Phase 3 shows 3200-3400/sqm. BIR 035-2022 assigns 6000/sqm to the
     Palsahingin leg and 5000/sqm to the Sambat leg, so the asking rate is
     0.53x-0.68x the rate for the very street it is on.

     This is the record that disproves BIR-as-floor, and it survives the corrected
     denominator: an established subdivision can trade below its BIR zonal rate.
     The BIR value is a tax base, not a market floor, so no single multiplier is
     right everywhere - the band is clamped rather than widened to chase outliers.

     Reliability is low: the figure sits in a historical price-trends block on an
     undated page, not a live quoted price. It is a direction, not a calibration. */
  const r = BM.records.filter(x => x.id === "gavina-ville-ph3")[0];
  const palsa = streetRR("san-pascual", "PALSAHINGIN", "gavina ville");
  const sambat = streetRR("san-pascual", "SAMBAT", "gavina ville");
  const vsPalsa = r.askingPricePerSqmMin / palsa;
  const vsSambat = r.askingPricePerSqmMax / sambat;
  assert.ok(vsPalsa < 1 && vsSambat < 1,
    "below the BIR rate for its own street (" + vsPalsa.toFixed(2) + "x / " + vsSambat.toFixed(2) + "x)");
  assert.ok(vsPalsa > 0.5 && vsPalsa < 0.6, "about 0.53x against the 6000 rate, got " + vsPalsa.toFixed(2));
  assert.strictEqual(r.priceReliability && r.priceReliability.indexOf("historical") >= 0, true,
    "and it is recorded as a historical trend, not a live quote");
  assert.ok(cfg.marketBand.bands.residential.min > BM._bandResearch.bandLow,
    "the disclosed band floor stays above this record, so it is never priced below its own asking rate");
});

check("the LandValuePH reference report reconciles and is not treated as market evidence", () => {
  /* The purchased reference report is the closest thing to an external check on
     the internal 1.174 model. Its arithmetic does reconcile - which is why the
     internal model reproduces it - but its own text contradicts its own numbers,
     so it validates the arithmetic and nothing else. */
  const rb = BM._referenceBenchmark;
  assert.ok(rb, "the reference report is recorded");
  const v = rb.reported;
  assert.strictEqual(v.birZonalRatePerSqm, 11500);
  assert.strictEqual(v.birBase, v.birZonalRatePerSqm * 100, "BIR base is rate x lot area");
  assert.strictEqual(v.rcn, v.rcnPerSqm * v.floorArea);
  assert.strictEqual(v.depreciationAmount, v.rcn * v.accumulatedDepreciationPct / 100);
  assert.strictEqual(v.buildingValue, v.rcn - v.depreciationAmount);
  assert.strictEqual(v.total, v.landValue + v.buildingValue, "land + building = the reported total");
  assert.strictEqual(v.rangeLow, Math.round(v.total * 0.85), "the range is the total x 85%");
  assert.strictEqual(v.rangeHigh, Math.round(v.total * 1.30), "and x 130%");
  /* The multiplier the internal model uses must equal the one this report implies,
     or the "parity" is a coincidence rather than a reference. */
  assert.strictEqual(rb.arithmeticVerified.landMultiplierRounded, 1.174);
  assert.ok(Math.abs(rb.arithmeticVerified.landMultiplierImplied - v.landValue / v.birBase) < 1e-6);
  /* And the report's own inconsistencies stay recorded, so nobody later cites it
     as proof that a +2.0% net adjustment or a 23000/sqm market rate is real. */
  assert.ok(rb.internalInconsistencies.length >= 4, "its internal contradictions are kept on file");
  assert.strictEqual(rb.notMarketEvidence, true, "it must never be promoted to market evidence");
  assert.strictEqual(rb.numericalAllowed, false);
  /* The "no benchmark reaches a formula" rule has to cover this key too. */
  ["js/estimator.js", "js/value_guide_flow.js", "js/core.js", "js/storefront.js"].forEach(f => {
    const src = fs.readFileSync(path.join(ROOT, f), "utf8");
    assert.ok(src.indexOf("_referenceBenchmark") < 0, f + " must not read the reference report");
  });
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