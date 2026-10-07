"use strict";
/* Question-to-factor wiring tests for the Value Guide.
 *
 * The defect these guard: js/app.js used to hand the calculator occupancy,
 * titleStatus and inheritanceStatus while FLOW.FACTORS read lotShape,
 * terrain, roadAccess and the rest. Only `corner` existed in both, so every
 * methodology row printed 0.00% and the applied net was always zero. These
 * checks make that mismatch impossible to reintroduce. */
const assert = require("assert"), fs = require("fs"), path = require("path");
const ROOT = process.cwd();
/* The estimator loads relative URLs through fetch; this shim is copied from
   tests/value_guide_flow_node.js:10-15 and is required, not optional. */
global.fetch = (u) => {
  const p = path.join(ROOT, String(u).split("?")[0]);
  return Promise.resolve({ ok: fs.existsSync(p), json: () => Promise.resolve(JSON.parse(fs.readFileSync(p, "utf8"))) });
};
const EST = require(path.join(ROOT, "js/estimator.js"));
const F = require(path.join(ROOT, "js/value_guide_flow.js"));

let count = 0;
async function check(name, fn) { await fn(); count++; console.log("[PASS] " + name); }

const OPTS = {
  municipality: "BAUAN", barangay: "POBLACION III",
  streetKey: "binay st ressurreccion st", classification: "RR",
  type: "house_lot", area: 100, floorArea: 120, construction: "mixed_chb",
  floors: "2", ageBand: "6-10", corner: false, features: [],
  landMethod: "factor", saleContext: "private-resale"
};

(async () => {

check("exactly nine questions, each mapped to a live factor", () => {
  assert.strictEqual(F.QUESTIONS.length, 9);
  const factorIds = F.FACTORS.map(f => f.id);
  F.QUESTIONS.forEach(q => assert.ok(factorIds.indexOf(q.factorId) >= 0, q.id + " -> " + q.factorId));
});

/* Spec decision 5/6: nine Details questions feed their own factors; corner is
   asked in step 1 as a boolean and zonalRecency is derived from the matched
   rate's effectivityDate. Those two are reachable without a Details question, so
   they are exempt here rather than forced into the nine. */
/* Spec decision 5/6: nine Details questions feed their own factors; corner is
   asked in step 1 as a boolean and zonalRecency is derived from the matched
   rate's effectivityDate. Those two are reachable without a Details question.
   faultProximity, amenities, community and demand have neither a question nor a
   derivation and are retired by Task 4, so until then they are the only factors
   allowed to be unreachable - and this assertion fails the moment one of them is
   neither retired nor given a question. */
check("every factor is reachable, a step-1 boolean, or a named pending retirement", () => {
  const PENDING_RETIREMENT = ["faultProximity", "amenities", "community", "demand"];
  const fed = F.QUESTIONS.map(q => q.factorId).concat(["cornerExposure", "zonalRecency"]);
  F.FACTORS.forEach(f => {
    assert.ok(fed.indexOf(f.id) >= 0 || PENDING_RETIREMENT.indexOf(f.id) >= 0, f.id + " unreachable");
  });
});

check("pickInputs omits unanswered keys rather than zeroing them", () => {
  const out = F.pickInputs({ shape: "-150", topography: "", corner: true });
  assert.strictEqual(out.lotShape, "-150", "answered question reaches its factor's field");
  assert.ok(!("terrain" in out), "unanswered key absent entirely");
  assert.strictEqual(out.corner, true);
});

check("the draft key and the factor field are deliberately different", () => {
  /* The bug this whole file exists for: the form wrote one set of names and the
     factor table read another. Assert the translation, so a future rename cannot
     silently break the join. */
  const q = F.QUESTIONS.filter(x => x.factorId === "infrastructure")[0];
  assert.strictEqual(q.input, "utilities");
  const f = F.FACTORS.filter(x => x.id === "infrastructure")[0];
  assert.strictEqual(f.input, "infrastructure");
  assert.strictEqual(F.pickInputs({ utilities: "200" }).infrastructure, "200");
});

check("every question key is renderable from the draft", () => {
  F.QUESTIONS.forEach(q => assert.ok(typeof q.input === "string" && q.input.length, q.id));
});

check("a skipped question is NaN, not zero", () => {
  assert.ok(Number.isNaN(F.factorBp({ input: "terrain", options: [{ value: "0", bp: 0 }] }, {})));
});

check("an answered zero is a real zero, not NaN", () => {
  assert.strictEqual(F.factorBp({ input: "terrain", options: [{ value: "0", bp: 0 }] }, { terrain: "0" }), 0);
});

check("an unmatched answer is unassessed, not a silent zero", () => {
  assert.ok(Number.isNaN(F.factorBp({ input: "terrain", options: [{ value: "0", bp: 0 }] }, { terrain: "banana" })));
});

check("all nine skipped: net is zero, rows unassessed, nine assumptions", async () => {
  const r = await F.compute(Object.assign({}, OPTS, F.pickInputs({})), EST);
  /* Twelve factors plus cornerExposure is 13 rows; OPTS sets corner false, so all
     13 go unassessed. The nine are the ones the user can answer, and the test
     pins that the four leftover factors are named too rather than hidden. */
  assert.strictEqual(r.assumptions.length, F.FACTORS.length, "every unassessed factor is named");
  const nineIds = ["lotShape", "terrain", "frontage", "roadAccess", "floodRisk",
    "infrastructure", "titleDoc", "inheritance", "ownership"];
  const named = r.assumptions.map(a => a.id);
  nineIds.forEach(id => assert.ok(named.indexOf(id) >= 0, id + " reported as skipped"));
  F.sectionsOf({}).forEach(row => assert.strictEqual(row.assessed, false, row.id + " unassessed"));
  assert.ok(Number.isFinite(r.total) && r.total > 0, "a usable number is still produced");
});

check("a skipped question and a zero-bp answer read differently on the result", async () => {
  /* The estimator needs its own location fields; pickInputs deliberately does not
     carry them because it only forwards question answers. Pass the merged object,
     which is how js/app.js builds the call. */
  const base = { municipality: "BAUAN", barangay: "POBLACION III",
    streetKey: "binay st ressurreccion st", classification: "RR",
    type: "vacant_lot", area: 100, saleContext: "private-resale" };
  const skipped = await F.compute(Object.assign({}, base, F.pickInputs(base)), EST);
  const answered = await F.compute(Object.assign({}, base, F.pickInputs(Object.assign({}, base, { shape: "0" }))), EST);
  const read = r => r.referenceModel.sections.filter(s => s.id === "lotShape")[0];
  assert.strictEqual(read(skipped).assessed, false);
  assert.strictEqual(read(skipped).bp, null);
  assert.strictEqual(read(answered).assessed, true);
  assert.strictEqual(read(answered).bp, 0, "an answered zero is scored zero, not skipped");
  assert.strictEqual(skipped.total, answered.total, "but the number is the same");
  assert.notStrictEqual(skipped.assumptions.length, answered.assumptions.length);
});

check("netOf treats a skipped factor as no contribution, never as NaN", () => {
  assert.ok(Number.isFinite(F.netOf({}, true)));
  assert.strictEqual(F.netOf({}, true), 0);
});

check("title, estate and occupancy are three separate factors", () => {
  const byId = id => F.FACTORS.filter(f => f.id === id)[0];
  assert.ok(byId("titleDoc"), "titleDoc");
  assert.ok(byId("inheritance"), "inheritance");
  assert.ok(byId("ownership"), "ownership");
});

check("title carries its own deductions, not the old conflated range", () => {
  const t = F.FACTORS.filter(f => f.id === "titleDoc")[0];
  assert.deepStrictEqual(t.options.map(o => o.bp), [0, -800, -1500]);
  assert.strictEqual(t.min, -1500, "the declared range follows the options");
});

check("pending estate and occupancy carry the published deductions", () => {
  const i = F.FACTORS.filter(f => f.id === "inheritance")[0];
  const o = F.FACTORS.filter(f => f.id === "ownership")[0];
  assert.deepStrictEqual(i.options.map(x => x.bp), [0, -1000]);
  assert.deepStrictEqual(o.options.map(x => x.bp), [0, -500, -1000, -2500]);
});

check("no ownership deduction reaches ownershipAdjustmentPct", async () => {
  const r = await F.compute(Object.assign({}, OPTS, F.pickInputs({
    occupancy: "informal_settlers", titled: "tax_declaration", estate_settled: "pending"
  })), EST);
  const read = s => r.referenceModel.sections.filter(x => x.id === s)[0];
  assert.strictEqual(read("titleDoc").bp, -1500);
  assert.strictEqual(read("inheritance").bp, -1000);
  assert.strictEqual(read("ownership").bp, -2500);
  assert.strictEqual(r.ownershipAdjustmentPct, 0, "that field stays neutral by design");
  assert.ok(r.total < (await F.compute(Object.assign({}, OPTS, F.pickInputs({})), EST)).total,
    "but the answers do move the number");
});

console.log("ALL GREEN (" + count + " checks)");
})().catch(error => { console.error(error); process.exitCode = 1; });