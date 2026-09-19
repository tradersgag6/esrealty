/* Compliance expiry-window math — the node counterpart to compliance_registry_e2e
 * (PHASE_0_1_BUILD.md line 74). Exercises the exact shipped module
 * js/compliance_due.js that feeds complianceStatusOf in the app, so the
 * boundary contract below cannot drift from what the Compliance tab shows. */
const D = require("../js/compliance_due.js");

function day(n) {
  return new Date(Date.now() + n * 86400000).toISOString().slice(0, 10);
}

function run() {
  const checks = [];
  const c = (name, ok, detail, extra) => checks.push({ name, ok, detail: detail + (extra ? " | " + extra : "") });
  const s = D.complianceWindowDays;

  const noDate = s("");
  c("no expiry date -> active, not due", noDate.due === false && noDate.days === null && noDate.cls === "green", JSON.stringify(noDate));

  const nullDate = s(null);
  c("null expiry -> active, not due", nullDate.due === false && nullDate.days === null, JSON.stringify(nullDate));

  const far = s(day(400));
  c("far future (400d) -> active, not due", far.due === false && far.cls === "green" && far.days === 400, JSON.stringify(far));

  const b61 = s(day(61));
  c("61 days out is outside the expiring window", b61.due === false && b61.cls === "green" && b61.days === 61, JSON.stringify(b61), "60d threshold");

  const b60 = s(day(60));
  c("exactly 60 days -> expiring (inclusive boundary)", b60.due === true && b60.cls === "gold" && b60.days === 60, JSON.stringify(b60), "60d threshold");

  const t1 = s(day(1));
  c("1 day out -> expiring", t1.due === true && t1.cls === "gold" && t1.days === 1, JSON.stringify(t1));

  const t0 = s(day(0));
  c("expires today -> expiring, not expired", t0.due === true && t0.cls === "gold" && t0.days === 0, JSON.stringify(t0));

  const n1 = s(day(-1));
  c("1 day past -> expired", n1.due === true && n1.cls === "red" && n1.days === -1, JSON.stringify(n1));

  const n60 = s(day(-60));
  c("60 days past -> expired, days shows magnitude", n60.cls === "red" && n60.due === true && n60.days === -60, JSON.stringify(n60));

  const isoWithTime = s("2026-12-31T14:30:00.000Z");
  c("full ISO expiry truncated to date precision", isoWithTime.days === s("2026-12-31").days, "ISO handled", "same as date-only string");

  c("window constant exported", D.DAYS_EXPIRING === 60, String(D.DAYS_EXPIRING));

  const ok = checks.every(x => x.ok) && checks.length >= 11;
  console.log("\n[compliance_registry_node] " + checks.length + " checks");
  checks.forEach(x => console.log("  [" + (x.ok ? "PASS" : "FAIL") + "] " + x.name + (x.ok ? "" : "  " + x.detail)));
  console.log(ok ? "ALL PASS" : "FAILURES PRESENT");
  process.exit(ok ? 0 : 1);
}

run();