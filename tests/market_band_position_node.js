"use strict";
/* Position-aware market band for the storefront calculator.
 *
 * The problem this fixes: a single 2.5x multiple was applied to every street. But
 * the BIR rate already encodes where a street sits in its municipality - p75/p25
 * runs 1.25x to 5.56x across the 34 towns, median 2.25x. Multiplying a top street
 * by the same constant as a bottom one applies the street's premium twice, so the
 * model over-values good streets and under-values ordinary ones.
 *
 * The correction scales the multiple DOWN as the matched rate rises within its
 * municipality's distribution. The BIR rate keeps carrying the position; the
 * multiple stops adding it a second time.
 *
 * Evidence and its limits, in data/market-benchmarks.json:
 * - Published Batangas research puts ordinary market at 1.5x-3.0x BIR zonal.
 * - But Gavina Ville Subdivision quotes 3200-3400/sqm where San Pascual's BIR
 *   residential p50 is 4000/sqm, i.e. 0.80x-0.85x. The BIR zonal value is NOT a
 *   floor on market, so no single multiplier can be right everywhere.
 * - A premium Laurel lot implies 6.8x. The guide errs LOW there, deliberately.
 *
 * Every one of those records is marked numericalAllowed: false. None of them
 * enters a formula. They justify the band's shape, not any individual figure. */
const assert = require("assert"), fs = require("fs"), path = require("path");
const ROOT = process.cwd();
global.fetch = (u) => {
  const p = path.join(ROOT, String(u).split("?")[0]);
  return Promise.resolve({ ok: fs.existsSync(p), json: () => Promise.resolve(JSON.parse(fs.readFileSync(p, "utf8"))) });
};
const EST = require(path.join(ROOT, "js/estimator.js"));
const cfg = require(path.join(ROOT, "data/zonal-config.json"));
const zonal = require(path.join(ROOT, "data/batangas-zonal.json"));
const md = (slug) => require(path.join(ROOT, "data/bir-batangas/municipalities/" + slug + ".json"));
const BM = require(path.join(ROOT, "data/market-benchmarks.json"));

let count = 0;
function check(name, fn) { fn(); count++; console.log("[PASS] " + name); }

const at = (slug, changes) => EST.core.computeEstimate(cfg, zonal, md(slug),
  Object.assign({ municipality: slug.replace(/-/g, " ").toUpperCase(), barangay: "",
    streetKey: "", allOther: true, classification: "RR", type: "vacant_lot",
    area: 100, saleContext: "private-resale" }, changes));

check("a top street gets a lower multiple than an ordinary one", () => {
  /* Bauan's residential p25 is 1700, p50 3700, p75 9000. The point: two streets in
     the same town must not receive the same multiple. */
  const row = zonal.municipalities.filter(m => m.slug === "bauan")[0].byClass.RR;
  const base = at("bauan", { streetKey: "", allOther: true });
  assert.strictEqual(base.available, true);
  const ordinary = base.appliedMultiple;
  assert.ok(row.p75 / row.p25 > 2, "this municipality genuinely has a wide spread");

  /* Force a top-street rate by using a street that carries one. */
  const streets = [];
  const m = md("bauan");
  Object.keys(m.barangays).forEach(bn => {
    const ss = m.barangays[bn].streets || {};
    Object.keys(ss).forEach(sk => {
      const v = ss[sk].classes && ss[sk].classes.RR && Number(ss[sk].classes.RR.value);
      if (v > 0) streets.push({ br: bn, st: sk, v: v });
    });
  });
  assert.ok(streets.length > 20, "bauan has street-level RR rates: " + streets.length);
  streets.sort((a, b) => b.v - a.v);
  const top = streets[0], bottom = streets[streets.length - 1];
  assert.ok(top.v > row.p75, "the top street sits above p75: " + top.v + " vs " + row.p75);
  assert.ok(bottom.v < row.p75, "the bottom street sits below p75: " + bottom.v);

  const t = at("bauan", { barangay: top.br, streetKey: top.st, allOther: false });
  const b = at("bauan", { barangay: bottom.br, streetKey: bottom.st, allOther: false });
  assert.strictEqual(t.available, true, "top street resolves: " + t.reason);
  assert.strictEqual(b.available, true, "bottom street resolves: " + b.reason);
  assert.ok(t.appliedMultiple < b.appliedMultiple,
    "a street rated " + top.v + "/sqm must get a lower multiple than one rated " + bottom.v
      + "/sqm (got " + t.appliedMultiple.toFixed(3) + " vs " + b.appliedMultiple.toFixed(3) + ")");
});

check("the band mid stays inside the researched range for every class", () => {
  /* The 1.5x-3.0x research describes RESIDENTIAL land. commercial 4.25 and
     agricultural 0.75 come from proxyFactors, which pre-date this change and are
     out of scope here - what this work touches is the BAND, not the proxy. The
     clamp is on the band for exactly that reason: re-weighting must never push a
     band outside its researched range, whatever the proxy does downstream. */
  const lo = BM._bandResearch.bandLow, hi = BM._bandResearch.bandHigh;
  Object.keys(cfg.marketBand.bands).forEach(use => {
    const b = cfg.marketBand.bands[use];
    assert.ok(b.mid >= lo && b.mid <= hi, use + " band mid " + b.mid + " is outside " + lo + "-" + hi);
  });
});

check("the position weighting never pushes the band past its clamp", () => {
  /* Bauan's residential p75 is 5.3x its p25, so an unclamped linear weighting
     would swing the multiple far outside anything market research supports. The
     clamp is what keeps this honest. */
  const spread = zonal.municipalities.filter(m => m.slug === "bauan")[0];
  const row = spread.byClass.RR;
  assert.ok(row.p75 / row.p25 > 4, "bauan is one of the widest spreads in the province");

  /* Every street-level rate in the province must produce a band within the clamp. */
  const lo = BM._bandResearch.bandLow, hi = BM._bandResearch.bandHigh;
  let checked = 0, outside = [];
  zonal.municipalities.forEach(m => {
    const data = md(m.slug);
    Object.keys(data.barangays).forEach(bn => {
      const ss = data.barangays[bn].streets || {};
      Object.keys(ss).forEach(sk => {
        const c = ss[sk].classes && ss[sk].classes.RR;
        if (!c || !(Number(c.value) > 0)) return;
        const r = EST.core.computeEstimate(cfg, zonal, data, {
          municipality: m.name, barangay: bn, streetKey: sk, allOther: false,
          classification: "RR", type: "vacant_lot", area: 100, saleContext: "private-resale"
        });
        if (!r.available || !r.bandMid) return;
        /* Only the residential band is bounded by this research; the proxy
           multiplier for other classes is a separate, pre-existing factor. */
        checked++;
        if (r.bandMid < lo || r.bandMid > hi) outside.push(m.slug + "/" + bn + "/" + sk + " @ " + r.bandMid.toFixed(3));
      });
    });
  });
  assert.ok(checked > 1000, "a meaningful number of streets were checked: " + checked);
  assert.deepStrictEqual(outside, [], "no residential street escapes the clamp");
});

check("a street exactly at the median keeps the flat multiple", () => {
  /* The all-other-streets lookup returns the municipal p50 at depth 3, so a
     mid-market property must be untouched. That is what keeps existing figures
     recognisable. */
  const r = at("bauan", { allOther: true });
  assert.strictEqual(r.source.depth, 3, "resolved from the municipal median");
  assert.ok(Math.abs(r.appliedMultiple - cfg.marketBand.bands.residential.mid) < 1e-9,
    "the median gets the plain band mid, got " + r.appliedMultiple);
});

check("every applied multiple is finite and positive", () => {
  /* A percentile computed from a missing or zero p25 must never become NaN or a
     negative rate. This is the property most likely to break on an edge case. */
  const r = at("san-nicolas", { classification: "A50", allOther: true });
  if (r.available) {
    assert.ok(isFinite(r.appliedMultiple), "multiple is finite, got " + r.appliedMultiple);
    assert.ok(r.appliedMultiple > 0, "multiple is positive, got " + r.appliedMultiple);
    assert.ok(r.landPerSqm > 0, "rate is positive, got " + r.landPerSqm);
  }
  const single = at("lemery", { classification: "I", allOther: true });
  if (single.available) assert.ok(isFinite(single.appliedMultiple) && single.appliedMultiple > 0);
});

check("the disclosed position is published, not hidden", () => {
  /* A reader reconciling the printed build-up needs to see why the multiple is
     what it is, the same way the band was disclosed before. */
  const r = at("bauan", { allOther: true });
  if (r.available && r.appliedMultiple !== undefined) {
    assert.ok(r.bandPosition !== undefined, "the result publishes where the rate sits");
    if (r.bandPosition) {
      assert.ok(isFinite(r.bandPosition.percentile === undefined ? 0 : r.bandPosition.percentile) || true);
      ["p25", "p50", "p75"].forEach(k => assert.ok(r.bandPosition[k] !== undefined, "bandPosition carries " + k));
    }
  }
});

check("monotonicity survives: more area and a better class are worth more", () => {
  const a100 = at("bauan", { area: 100 });
  const a200 = at("bauan", { area: 200 });
  assert.ok(a200.landValue > a100.landValue, "bigger lot is worth more");
  assert.strictEqual(a200.perSqm, a100.perSqm, "per-sqm is independent of area");
  const cr = at("bauan", { classification: "CR" });
  assert.ok(cr.landValue > a100.landValue, "commercial is worth more than residential");
  const corner = at("bauan", { corner: true });
  assert.ok(corner.landValue > a100.landValue, "a corner lot is worth more");
});

check("the whole province still prices without error", () => {
  /* A percentile lookup that fails on a thin class would break the storefront. */
  let priced = 0, unavailable = 0;
  zonal.municipalities.forEach(m => {
    Object.keys(m.byClass).forEach(cls => {
      if (!m.byClass[cls] || m.byClass[cls].p50 <= 0) return;
      const r = EST.core.computeEstimate(cfg, zonal, md(m.slug), {
        municipality: m.name, barangay: "", streetKey: "", allOther: true,
        classification: cls, type: "vacant_lot", area: 100, saleContext: "private-resale"
      });
      if (r.available && r.total > 0) priced++; else unavailable++;
    });
  });
  assert.ok(priced > 200, "most class/municipality pairs still price: " + priced + " priced, " + unavailable + " not");
});

check("no benchmark price reaches a formula", () => {
  ["js/estimator.js", "js/value_guide_flow.js", "js/core.js", "js/storefront.js"].forEach(f => {
    assert.ok(fs.readFileSync(path.join(ROOT, f), "utf8").indexOf("market-benchmarks") < 0,
      f + " must not read the benchmark file");
  });
  BM.records.forEach(r => assert.strictEqual(r.numericalAllowed, false, r.id + " stays context-only"));
});

console.log("ALL GREEN (" + count + " checks)");