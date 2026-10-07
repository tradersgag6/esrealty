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
/* faultProximity, amenities, community and demand have neither a question nor a
   derivation, and Task 4 retires them. Naming them here keeps that list honest:
   when the four are gone this becomes a plain reachability assertion. */
const PENDING_RETIREMENT = ["faultProximity", "amenities", "community", "demand"];

check("every factor is reachable, a step-1 boolean, or named for retirement", () => {
  const fed = F.QUESTIONS.map(q => q.factorId).concat(["cornerExposure", "zonalRecency"]);
  F.FACTORS.forEach(f => {
    assert.ok(fed.indexOf(f.id) >= 0 || PENDING_RETIREMENT.indexOf(f.id) >= 0, f.id + " unreachable");
  });
});

check("the four answerable factors are retired", () => {
  PENDING_RETIREMENT.forEach(id =>
    assert.strictEqual(F.FACTORS.filter(f => f.id === id).length, 0, id + " retired"));
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

check("the building section is gone and no building net is published", async () => {
  assert.strictEqual(F.SEC_BUILDING, undefined, "the section constant is gone");
  const r = await F.compute(Object.assign({}, OPTS, F.pickInputs({})), EST);
  assert.strictEqual(r.referenceModel.buildingNet, null, "explicitly null, not a silent zero");
});

check("the nine questions never move the improvement", async () => {
  const clean = await F.compute(Object.assign({}, OPTS, F.pickInputs({})), EST);
  const worst = await F.compute(Object.assign({}, OPTS, F.pickInputs({
    shape: "-500", topography: "-800", frontage: "-100", access: "-200",
    flood: "floods_routinely", utilities: "existing_services",
    titled: "tax_declaration", estate_settled: "pending", occupancy: "informal_settlers"
  })), EST);
  assert.strictEqual(clean.improvement, worst.improvement, "the building is untouched");
  assert.ok(worst.landValue < clean.landValue, "the land moved down");
});

check("every question's own option values resolve through its factor", () => {
  /* The join that broke silently before: a question whose option values the
     factor table does not carry scores NaN and the report prints nothing. */
  F.QUESTIONS.forEach(q => {
    const f = F.FACTORS.filter(x => x.id === q.factorId)[0];
    assert.ok(f, q.id + " has a factor");
    f.options.forEach(opt => {
      const picked = F.pickInputs({ [q.input]: opt.value });
      assert.ok(!Number.isNaN(F.factorBp(f, picked)),
        q.id + ' option "' + opt.value + '" is unresolvable');
    });
  });
});

check("no pricing field keeps the superseded model's number", async () => {
  /* applyModel used to set r.total from the new model and leave r.value holding
     the estimator's pre-model figure, so any panel reading r.value reported a
     different number from the one on screen. */
  const r = await F.compute(Object.assign({}, OPTS, F.pickInputs({})), EST);
  assert.strictEqual(r.value, r.total, "value tracks total");
  assert.strictEqual(r.marketGuide.value, r.total, "marketGuide tracks total");
  assert.strictEqual(r.marketGuide.landValue, r.landValue);
  assert.strictEqual(r.marketGuideEstimate, r.total, "public guide estimate agrees");
  assert.strictEqual(r.unadjustedTotal, r.total, "no hidden pre-factor total");
  assert.strictEqual(r.factors, null, "stale factor field stays suppressed");
  assert.strictEqual(r.factorStack, null);
  assert.strictEqual(r.appliedMultiple, null);
});

check("the range follows the single total", async () => {
  const r = await F.compute(Object.assign({}, OPTS, F.pickInputs({})), EST);
  assert.strictEqual(r.rangeLowFactor, F.MODEL.RANGE_LOW);
  assert.strictEqual(r.rangeHighFactor, F.MODEL.RANGE_HIGH);
  assert.strictEqual(r.low, Math.round(r.total * F.MODEL.RANGE_LOW));
  assert.strictEqual(r.high, Math.round(r.total * F.MODEL.RANGE_HIGH));
  assert.ok(r.low < r.total && r.total < r.high, "the band brackets the figure");
});

check("the estimator's own integrity check passes on our result", async () => {
  /* EST.core.integrityCheck requires total === landValue + improvement when
     ownershipAdjustmentPct is 0. It is the contract the whole result rests on. */
  const r = await F.compute(Object.assign({}, OPTS, F.pickInputs({ occupancy: "informal_settlers" })), EST);
  assert.strictEqual(r.ownershipAdjustmentPct, 0);
  assert.strictEqual(r.total, r.landValue + r.improvement);
  assert.strictEqual(EST.core.integrityCheck(r).ok, true, JSON.stringify(EST.core.integrityCheck(r)));
});

check("four classifications map to RR, CR, I and A50", () => {
  assert.deepStrictEqual(F.CLASSIFICATIONS.map(c => c.value), ["RR", "CR", "I", "A50"]);
  assert.deepStrictEqual(F.CLASSIFICATIONS.map(c => c.label),
    ["Residential", "Commercial", "Industrial", "Agricultural"]);
});

check("the classification picker reads the four, not all 35 codes", () => {
  /* The form used to enumerate every BIR code from ref.classifications (RR, CR,
     X, GP, A1..A50). It now renders vgClasses(), which maps over
     CLASSIFICATIONS. Asserting the render site rather than a browser DOM keeps
     this in the node suite; the e2e suite covers the rendered option list. */
  const src = fs.readFileSync(path.join(ROOT, "js/app.js"), "utf8");
  assert.ok(src.indexOf("vgClasses(), f.classification") >= 0,
    "the picker renders vgClasses() rather than every code");
  assert.ok(src.indexOf("classes.map(c => ({ value: c,") < 0,
    "the old all-codes enumeration is gone");
  assert.ok(src.indexOf("function vgClasses()") >= 0, "vgClasses is defined");
  const helper = src.split("function vgClasses()")[1].split("\n}")[0];
  assert.ok(helper.indexOf("CLASSIFICATIONS") >= 0, "it maps the four");
  assert.ok(helper.indexOf("ref.classifications") < 0, "it no longer walks every code");
});

check("legacy and agricultural codes still resolve to a rate", async () => {
  /* X, GP, CL and the 29 agricultural sub-codes become unreachable from the form,
     but a saved draft may still carry one. It must price rather than fail. */
  for (const code of ["X", "GP", "CL", "A1", "A49", "A50"]) {
    const r = await F.compute(Object.assign({}, OPTS, F.pickInputs({}), { classification: code }), EST);
    assert.ok(r.available !== false, code + " resolves (" + (r.reason || "") + ")");
    assert.ok(r.total > 0, code + " produces a figure");
  }
});

check("the four offered codes each produce a distinct rate", async () => {
  const seen = {};
  for (const c of F.CLASSIFICATIONS) {
    const r = await F.compute(Object.assign({}, OPTS, F.pickInputs({}), { classification: c.value }), EST);
    assert.ok(r.available !== false, c.value + " resolves");
    seen[c.value] = r.birZonalRatePerSqm;
  }
  const rates = Object.values(seen);
  assert.strictEqual(new Set(rates).size, rates.length, "each class prices differently: " + JSON.stringify(seen));
});

check("the report states what the figure is derived from", async () => {
  const r = await F.compute(Object.assign({}, OPTS, F.pickInputs({})), EST);
  const html = F.reportSections(r, EST, []);
  assert.ok(html.indexOf("Derived from published BIR zonal values") >= 0, "the permitted claim is stated");
  assert.ok(html.indexOf("RA 9646") >= 0, "and it is not an appraisal under the Act");
  assert.ok(html.indexOf("LandValuePH") < 0, "the model is not named as the source of the number");
});

check("the report makes no market-price claim it cannot support", async () => {
  /* No Batangas listings exist, so there is no active-listing median and no
     verified sale behind any figure here. A report that said it matched the
     market would be making a claim the repo cannot evidence. */
  const r = await F.compute(Object.assign({}, OPTS, F.pickInputs({})), EST);
  const html = F.reportSections(r, EST, []).toLowerCase();
  ["market price", "market value", "fair market", "matches the market", "current asking"].forEach(phrase =>
    assert.ok(html.indexOf(phrase) < 0, 'report must not claim "' + phrase + '"'));
});

check("an empty comparables block says so in words", async () => {
  /* The listings API holds three records, all Caloocan. A blank section read as
     "we checked and there are none". */
  const r = await F.compute(Object.assign({}, OPTS, F.pickInputs({})), EST);
  const html = F.reportSections(r, EST, []);
  const block = html.split('data-vg-comparables')[1].split("</div>")[0];
  assert.ok(block.length > 0, "the block renders");
  assert.ok(/no (matching )?(batangas )?listings/i.test(block), "it says there are none: " + block.slice(0, 120));
});

check("the methodology names the rate it used", async () => {
  const r = await F.compute(Object.assign({}, OPTS, F.pickInputs({})), EST);
  const html = F.reportSections(r, EST, []);
  assert.ok(html.indexOf(String(r.referenceModel.rcnRate).replace(/\B(?=(\d{3})+(?!\d))/g, ",")) > 0,
    "the construction rate is printed, not implied");
});

check("step 2 renders one group per question, each option labelled with its bp", () => {
  /* The nine questions are rendered from QUESTIONS, not hand-listed, so a factor
     cannot be scored without a control to set it. Each option shows its own
     effect before the user picks it: the reference does this and a person who
     does not know what "estate settled" is worth needs it. */
  const src = fs.readFileSync(path.join(ROOT, "js/app.js"), "utf8");
  const stage2 = src.split("function vgStage2")[1].split("function vgReviewRows")[0];
  const groups = src.split("function vgQuestionGroups")[1].split("\n  }")[0];
  assert.ok(stage2.length > 0, "vgStage2 located");
  assert.ok(stage2.indexOf("vgQuestionGroups()") >= 0, "step 2 renders the question groups");
  assert.ok(groups.indexOf("QUESTIONS") >= 0, "which loop over QUESTIONS");
  assert.ok(groups.indexOf("data-vg-bp") >= 0, "each option carries its bp for display");
  assert.ok(groups.indexOf("data-vg-notsure") >= 0, "each group offers Not sure");
  assert.ok(groups.indexOf(".bp") >= 0, "the bp comes from the factor option");
  ["occupancy", "titleStatus", "inheritanceStatus"].forEach(k =>
    assert.ok(stage2.indexOf('data-vg-set=\\"' + k + '\\"') < 0, "the old hand-written " + k + " select is gone"));
  /* Not sure must delete rather than store a sentinel. */
  const handler = src.split('el.hasAttribute("data-vg-notsure")')[1].split("return; }")[0];
  assert.ok(handler.indexOf("delete draft.form[q.input]") >= 0,
    "the handler deletes the key: " + handler.replace(/\s+/g, " ").slice(0, 160));
  assert.ok(handler.indexOf("not_sure") < 0, "no sentinel value is stored");
});

check("the bp labels read from the factor, so they cannot drift from the model", () => {
  /* A label typed next to the control would be a second place to update. */
  const src = fs.readFileSync(path.join(ROOT, "js/app.js"), "utf8");
  const stage = src.split("function vgStage2")[1].split("function vgReviewRows")[0];
  const bpCall = stage.split("data-vg-bp=")[1];
  assert.ok(bpCall.indexOf("factorBp") >= 0 || bpCall.indexOf(".bp") >= 0,
    "the rendered bp comes from the factor option, not a literal in the markup");
  assert.ok(!/data-vg-bp="-?\d+"/.test(stage), "no hard-coded bp in the markup");
});

check("step 1 offers the reference's optional sale-stage group", () => {
  const src = fs.readFileSync(path.join(ROOT, "js/app.js"), "utf8");
  const stage = src.split("function vgStage1")[1].split("function vgStage2")[0];
  assert.ok(stage.indexOf("data-vg-stage1-stage") >= 0, "the group renders");
  ["just_checking", "ready_to_sell", "already_listed", "have_a_buyer"].forEach(k =>
    assert.ok(stage.indexOf('value: "' + k + '"') >= 0, k + " offered"));
  assert.ok(stage.indexOf("Optional") >= 0, "and it is marked optional");
});

check("the nine questions are all reachable from a saved draft", () => {
  /* Not sure must leave the key unset rather than store a sentinel, otherwise
     "skipped" and "answered zero" are the same value again. */
  const out = F.pickInputs({ shape: "", titled: "", occupancy: "" });
  ["lotShape", "titleDoc", "ownership"].forEach(k =>
    assert.ok(!(k in out), k + " absent when the user skips"));
  assert.ok(F.sectionsOf(out).every(s => s.assessed === false), "all read unassessed");
});

check("net cap and floor are symmetric", () => {
  assert.strictEqual(F.MODEL.NET_FLOOR, -0.15);
  assert.strictEqual(F.MODEL.NET_CAP, 0.15);
});

check("every answer at its worst clamps to the floor and stays positive", async () => {
  const worst = await F.compute(Object.assign({}, OPTS, F.pickInputs({
    shape: "-500", topography: "-800", frontage: "-100", access: "-200",
    flood: "floods_routinely", utilities: "existing_services",
    titled: "tax_declaration", estate_settled: "pending", occupancy: "informal_settlers",
    zonalRecency: "-200", corner: true
  })), EST);
  assert.strictEqual(worst.referenceModel.net, F.MODEL.NET_FLOOR, "clamped, not merely negative");
  assert.ok(worst.landValue > 0, "land value stays positive");
  assert.ok(worst.total > 0, "total stays positive");
});

check("the best possible answers reach the cap without exceeding it", async () => {
  const best = await F.compute(Object.assign({}, OPTS, F.pickInputs({
    shape: "0", topography: "0", frontage: "150", access: "200",
    flood: "0", utilities: "200", titled: "titled_self",
    estate_settled: "settled", occupancy: "empty", zonalRecency: "0", corner: true
  })), EST);
  assert.ok(best.referenceModel.net <= F.MODEL.NET_CAP, "never above the cap");
  assert.ok(best.referenceModel.net > 0, "the good answers do lift the value");
});

check("an option outside its declared range is clamped to it", () => {
  /* Declared min/max were never enforced at runtime before, so a bad edit to the
     table would silently exceed the published range. */
  const f = { input: "x", min: -200, max: 200, options: [{ value: "a", bp: -9999 }] };
  assert.strictEqual(F.clampBp(f, -9999), -200);
  assert.strictEqual(F.clampBp(f, 9999), 200);
  assert.strictEqual(F.clampBp(f, 50), 50);
});

check("net stays inside every factor's declared range", () => {
  F.FACTORS.forEach(f => f.options.forEach(o =>
    assert.ok(o.bp >= f.min && o.bp <= f.max, f.id + " option " + o.value + " outside its range")));
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