const { spawnSync } = require("child_process");
const path = require("path");

const modulePath = path.join(__dirname, "..", "js", "portfolio_ledger.js");
const checkout = `
var fn = require(${JSON.stringify(modulePath)});
var checks = [];
function check(name, cond, detail){ checks.push({name:name, ok:!!cond, detail:detail==null?"":String(detail)}); }
function s(c){ return fn.constructionSummary(c||{}); }

// baseline invariance: existing semantics preserved
var b = s({ planned:1000, committed:600, paid:400, contingency:100 });
check("baseline forecast = committed + contingency", b.forecast===700, b.forecast);
check("baseline remainingToCommit", b.remainingToCommit===400, b.remainingToCommit);
check("baseline variance", b.variance===400, b.variance);
check("baseline paidRate", b.paidRate===66.7, b.paidRate);
check("baseline status in-progress", b.status==="in-progress", b.status);

// retention math
var r = s({ planned:1000, committed:600, paid:400, contingency:100, retentionRate:10 });
check("retention = 10% of committed", r.retention===60, r.retention);
check("netPayable = committed - retention", r.netPayable===540, r.netPayable);
check("zero retention when committed 0", s({planned:1000,committed:0}).retention===0, s({planned:1000,committed:0}).retention);

// change orders feed the forecast but not planned/committed
var co = s({ planned:1000, committed:600, paid:400, contingency:100, changeOrders:120 });
check("forecast adds change orders", co.forecast===820, co.forecast);
check("variance ignores change orders", co.variance===400, co.variance);

// over-budget detection
var ob = s({ planned:1000, committed:1200, paid:200, contingency:100 });
check("over-budget status when committed>planned", ob.status==="over-budget", ob.status);
check("overbudget flag", ob.overbudget===true, ob.overbudget);
check("committed <= planned is not over-budget", s({planned:1000,committed:900,paid:100}).overbudget===false, s({planned:1000,committed:900,paid:100}).overbudget);

// earned vs paid (progress-based)
var ev = s({ planned:1000, committed:600, paid:400, contingency:100, progress:25 });
check("earned = planned * progress", ev.earned===250, ev.earned);
check("no overpaid warning at 25% progressed/40% paid... is overpaid", ev.overpaid===true, ev.overpaid);
var okp = s({ planned:1000, committed:600, paid:100, contingency:100, progress:50 });
check("overpaid false when paid<earned", okp.overpaid===false, okp.overpaid);
check("no overpaid evaluation without progress", s({planned:1000,committed:600,paid:600,contingency:50}).overpaid===false, s({planned:1000,committed:600,paid:600,contingency:50}).overpaid);
check("allocation passthrough", s({planned:1000,committed:100,allocation:"floor_area"}).allocation==="floor_area", s({planned:1000,committed:100,allocation:"floor_area"}).allocation);
check("allocation defaults to equal", s({planned:1000,committed:100}).allocation==="equal", s({planned:1000,committed:100}).allocation);

// project-level rollup over phases
var proj = fn.constructionProjectSummary({
  contractValue: 5000000,
  contingency: 250000,
  retentionRate: 10,
  allocation: "equal",
  changeOrders: 100000,
  phases: [
    { name:"Foundation", planned_budget:1000000, committed:600000, paid:400000, percent_complete:25 },
    { name:"Structure", planned_budget:2000000, committed:1200000, paid:700000, percent_complete:50 }
  ]
});
check("project phases rolled up", proj.phases===2, proj.phases);
check("project planned total", proj.planned===3000000, proj.planned);
check("project committed total", proj.committed===1800000, proj.committed);
check("project paid total", proj.paid===1100000, proj.paid);
check("project progress average", proj.progress===37.5, proj.progress);
check("project forecast incl contingency + change orders", proj.forecast===2150000, proj.forecast);
check("project retention", proj.retention===180000, proj.retention);
check("project contract value kept", proj.contractValue===5000000, proj.contractValue);
check("empty project is safe", fn.constructionProjectSummary({}).planned===0, fn.constructionProjectSummary({}).planned);

// construction link may be a per-invoice link (multiple invoices per project; one payment per invoice)
var invLink = fn.validateCashEntry(JSON.parse(JSON.stringify({ accountId:"A", direction:"out", amount:150000, purpose:"construction", link:{type:"invoice", id:"cinv-1"} })));
check("construction accepts invoice link type", invLink.valid===true, invLink.valid);
var noLink = fn.validateCashEntry(JSON.parse(JSON.stringify({ accountId:"A", direction:"out", amount:150000, purpose:"construction", link:{type:"project", id:""} })));
check("construction still requires a link id", noLink.valid===false, noLink.valid);
{
  var il = fn.post(JSON.parse(JSON.stringify({ accountId:"A", direction:"out", amount:150000, purpose:"construction", link:{type:"invoice", id:"cinv-1"}, status:"posted" })), { opening:400000, entries:[] });
  var reciv = fn.post(JSON.parse(JSON.stringify({ accountId:"A", direction:"out", amount:120000, purpose:"construction", link:{type:"invoice", id:"cinv-2"}, status:"posted" })), { opening:400000, entries:[il.entry] });
  check("two invoices on one project post independently", reciv.ok===true, "ok="+reciv.ok);
  var repay = fn.post(JSON.parse(JSON.stringify({ accountId:"A", direction:"out", amount:150000, purpose:"construction", link:{type:"invoice", id:"cinv-1"}, status:"posted" })), { opening:400000, entries:[il.entry, reciv.entry] });
  check("same invoice cannot be paid twice while active", repay.ok===false && /already has an active post/.test(repay.errors.join(" ")), "ok="+repay.ok);
  var projLink = fn.post(JSON.parse(JSON.stringify({ accountId:"A", direction:"out", amount:100000, purpose:"project_selling", link:{type:"project", id:"P9"}, status:"posted" })), { opening:900000, entries:[il.entry, reciv.entry] });
  check("project_selling link rule still enforced", projLink.ok===true, "ok="+projLink.ok);
}

var bad = [];
checks.forEach(function(c){ if(!c.ok) bad.push(c.name); });
if (bad.length) {
  console.log("[FAIL] construction_depth " + bad.join(", "));
  console.log("ALL FAILED (" + bad.length + ")"); process.exit(1);
}
console.log(checks.map(function(c){ return (c.ok?"[PASS] ":"[FAIL] ")+c.name+" "+c.detail; }).join("\\n"));
console.log("ALL GREEN (" + checks.length + " checks)");
`;
const res = spawnSync(process.execPath, ["-e", checkout], { encoding: "utf8" });
process.stdout.write(res.stdout || "");
process.stderr.write(res.stderr || "");
process.exit(res.status === null ? 1 : res.status);