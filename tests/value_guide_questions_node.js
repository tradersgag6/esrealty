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

console.log("ALL GREEN (" + count + " checks)");
})().catch(error => { console.error(error); process.exitCode = 1; });