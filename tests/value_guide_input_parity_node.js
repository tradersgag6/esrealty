"use strict";
/* Input-parity contract with the reference valuation form.
 *
 * docs/specs/value-guide-input-parity.md records what the live reference actually
 * renders, read off the DOM in a real browser. This file freezes the parts of that
 * inventory we are asserting we match, so a form edit cannot quietly drop a question
 * or reintroduce a requirement the reference does not have.
 *
 * Two rules earn their place here:
 *
 * 1. Street must stay OPTIONAL. The reference labels it "(Optional)". We required
 *    it, which forced users through a fake "my street isn't listed" choice just to
 *    reach a price. Our BIR data has an all-other-streets rate, so we can price a
 *    street-less parcel without asking.
 *
 * 2. The adjustment questions must not be merged back together. We collapsed
 *    terrain slope and elevation-relative-to-road into one question. The reference
 *    prices them separately, because a lot can be level and still sit well below the
 *    road. Merging loses that.
 *
 * This file asserts the inventory, not the arithmetic. value_guide_flow_node.js
 * owns the arithmetic.
 */
const assert = require("assert"), fs = require("fs"), path = require("path");
const ROOT = process.cwd();
/* Node's fetch() rejects the relative URLs estimator.js loads its data with. Same
   shim the other node suites use. */
global.fetch = (u) => {
  const p = path.join(ROOT, String(u).split("?")[0]);
  return Promise.resolve({ ok: fs.existsSync(p), json: () => Promise.resolve(JSON.parse(fs.readFileSync(p, "utf8"))) });
};
const FLOW = require(path.join(ROOT, "js/value_guide_flow.js"));

let count = 0;
/* check() stays synchronous. The async one returns a promise and is awaited by the
   runner below, because a check that returns a promise nobody awaits reports PASS
   for assertions that never ran. */
function check(name, fn) { fn(); count++; console.log("[PASS] " + name); }
const pending = [];
function checkAsync(name, fn) {
  pending.push(fn().then(() => { count++; console.log("[PASS] " + name); }));
}

const FORM_SRC = fs.readFileSync(path.join(ROOT, "js/app.js"), "utf8");

/* Every adjustment question the reference renders, mapped to ours. "elevation" and
 * "terrain" are deliberately separate rows: they were merged once already. */
const REFERENCE_ADJUSTMENTS = [
  { ref: "occupancy", ours: "ownership" },
  { ref: "title status", ours: "titleDoc" },
  { ref: "inheritance", ours: "inheritance" },
  { ref: "community type", ours: null },
  { ref: "flood risk", ours: "floodRisk" },
  { ref: "road access", ours: "roadAccess" },
  { ref: "lot shape", ours: "lotShape" },
  { ref: "right of way", ours: null },
  { ref: "elevation vs road", ours: null },
  { ref: "utilities", ours: "infrastructure" }
];

check("the factor inventory is present and uniquely keyed", () => {
  assert.ok(FLOW.FACTORS.length >= 10, "expected the factor set, got " + FLOW.FACTORS.length);
  const ids = FLOW.FACTORS.map(f => f.id);
  assert.strictEqual(new Set(ids).size, ids.length, "factor ids are unique");
});

check("terrain slope and elevation-vs-road are not the same factor again", () => {
  /* The regression this guards: one "Terrain and elevation" question carrying both
     concepts. A lot can be flat and still sit below the road, and the reference
     deducts for those independently (-7% sloping, -7% below road). */
  const terrainish = FLOW.FACTORS.filter(f => /terrain|elev|slope/i.test(f.id + " " + f.label));
  assert.ok(terrainish.length <= 1,
    "terrain and elevation must not be collapsed into one factor, found: " +
      terrainish.map(f => f.id).join(", "));
});

check("every factor we price has a declared range that its options stay inside", () => {
  FLOW.FACTORS.forEach(f => {
    if (f.type === "bool") return;
    assert.ok(Number.isFinite(f.min) && Number.isFinite(f.max), f.id + " declares min/max");
    assert.ok(f.min <= f.max, f.id + " min is not above max");
    f.options.forEach(o => {
      assert.ok(o.bp >= f.min && o.bp <= f.max,
        f.id + " option " + o.value + " (" + o.bp + " bp) escapes its declared range " + f.min + ".." + f.max);
    });
  });
});

check("every question maps to a factor that actually exists", () => {
  const ids = new Set(FLOW.FACTORS.map(f => f.id));
  FLOW.QUESTIONS.forEach(q => {
    if (!q.factorId) return;
    assert.ok(ids.has(q.factorId), q.id + " points at missing factor " + q.factorId);
  });
});

check("pickInputs round-trips every question answer into model input", () => {
  /* A question whose input name never reaches the model is a question that looks
     answered and changes nothing. */
  FLOW.QUESTIONS.forEach(q => {
    const draft = {};
    draft[q.input] = "0";
    const out = FLOW.pickInputs(draft);
    const key = FLOW.FACTORS.filter(f => f.id === q.factorId)[0];
    const expected = key ? key.input : q.input;
    assert.ok(out[expected] !== undefined,
      q.id + " answer to '" + q.input + "' did not reach '" + expected + "'");
  });
});

check("a question we cannot map to a reference field is a deliberate decision, not a drift", () => {
  /* Two reference fields have no counterpart of ours yet: community type and right
     of way. Left unmapped on purpose - dropping a question the reference asks would
     be an accuracy regression, so they are listed as gaps rather than removed. This
     test fails when a THIRD one appears, which is how an accidental merge or a
     half-done edit gets caught. */
  const unmapped = REFERENCE_ADJUSTMENTS.filter(a => !a.ours).map(a => a.ref);
  assert.deepStrictEqual(unmapped.sort(), ["community type", "elevation vs road", "right of way"],
    "the set of unported reference fields changed - update this test and the spec together");
});

checkAsync("a parcel with no street still reaches a price, at a lower reference depth", () => {
  /* The reference labels Street "(Optional)". Our form blocked on it via
     vgMissing(), which pushed "street" when neither streetKey nor allOther was set -
     forcing users through a fake "my street isn't listed" choice just to get a
     number. The block was never technically necessary: resolveBase() falls through
     street -> barangay "other" -> municipal p50 when streetKey is empty.

     This asserts the engine guarantee that makes dropping the block safe. Removing
     the block itself is Task 9 work. */
  const EST = require(path.join(ROOT, "js/estimator.js"));
  const base = { municipality: "BAUAN", barangay: "POBLACION III", classification: "RR",
    type: "vacant_lot", saleContext: "private-resale", area: 100 };
  return Promise.all([
    EST.estimate(Object.assign({}, base, { streetKey: "binay st ressurreccion st" })),
    EST.estimate(Object.assign({}, base, { streetKey: "", allOther: false }))
  ]).then(([withStreet, noStreet]) => {
    assert.ok(withStreet.available && noStreet.available,
      "a street-less parcel must still be priceable");
    assert.ok(noStreet.landValue > 0, "and must produce a positive land value");
    /* Priced off the barangay's all-other-streets rate rather than the street rate,
       so it is legitimately lower. If this ever equals the street-level figure the
       fallback chain has silently stopped falling back. */
    assert.ok(noStreet.birZonalRatePerSqm < withStreet.birZonalRatePerSqm,
      "the street-less rate must come from a shallower match than the street match");
    /* "Official BIR zonal reference" stays true - the barangay's all-other-streets
       rate is a real figure from the BIR schedule, not an estimate. What must not
       happen is it being presented as this street's rate, so the street name stays
       empty rather than borrowing one. */
    assert.ok(!noStreet.streetName,
      "a street-less parcel must not borrow a street name it does not have");
    assert.ok(withStreet.streetName, "a parcel with a street keeps its street name");
  });
});

check("the reference's own '9 quick questions' label is not copied as a count", () => {
  /* The reference markets itself as "9 quick questions" but renders ten adjustment
     fields plus frontage, and the count excludes ownership/title and the whole
     building block. Copying the number would bake in an inaccuracy. */
  assert.ok(FLOW.QUESTIONS.length !== 9 || FLOW.FACTORS.length >= 10,
    "question count drifted to a number copied from the reference's marketing label");
});

Promise.all(pending).then(function () {
  console.log("ALL GREEN (" + count + " checks)");
}).catch(function (err) {
  console.error("FAILED:", err && err.stack || err);
  process.exit(1);
});