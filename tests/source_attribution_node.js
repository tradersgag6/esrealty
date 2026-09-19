// Lead source attribution, dedupe, and first-response metrics (pure, Node-only).
// Run with: node tests/source_attribution_node.js  (or tests\run_all.ps1 -Test source_attribution_node)
"use strict";
const AT = require("../js/attribution.js");
const assert = require("assert");

let passed = 0;
const ok = (name, cond) => { assert.ok(cond, name); passed++; console.log("[PASS] " + name); };
const eq = (name, a, b) => { assert.deepStrictEqual(a, b, name); passed++; console.log("[PASS] " + name); };

// ---- phone/email normalization ------------------------------------------
(function () {
  eq("normPhone strips +63", AT.normPhone("+63 917 555 0123"), "9175550123");
  eq("normPhone strips leading 0", AT.normPhone("09175550123"), "9175550123");
  eq("normPhone strips 63 prefix", AT.normPhone("639175550123"), "9175550123");
  eq("normPhone digits only", AT.normPhone("0917-555-0123"), "9175550123");
  eq("normPhone empty", AT.normPhone(""), "");
  eq("normPhone null", AT.normPhone(null), "");
  eq("normEmail lowercases + trims", AT.normEmail("  Maria@Gmail.COM "), "maria@gmail.com");
})();

// ---- dedupe --------------------------------------------------------------
(function () {
  const base = [
    { id: "a", name: "Maria Santos", email: "maria@x.com", phone: "+63 917 555 0101" },
    { id: "b", name: "Juan Cruz", email: "juan@x.com", phone: "09175550102" },
    { id: "c", name: "No contact", email: "", phone: "" }
  ];
  const dup = AT.findDuplicateLead(base, { name: "New", email: "MARIA@X.COM", phone: "" }, "");
  ok("dup found by email (case-insensitive)", dup && dup.id === "a");
  const dup2 = AT.findDuplicateLead(base, { name: "New", email: "", phone: "+639175550102" }, "");
  ok("dup found by normalized phone", dup2 && dup2.id === "b");
  const none = AT.findDuplicateLead(base, { name: "Fresh", email: "fresh@x.com", phone: "+63 900 000 0000" }, "");
  ok("no dup for distinct contact", none === null);
  const noneNoContact = AT.findDuplicateLead(base, { name: "No keys", email: "", phone: "" }, "");
  ok("no contact info -> no dup", noneNoContact === null);
  const exclude = AT.findDuplicateLead(base, { id: "x", email: "maria@x.com", phone: "" }, "x");
  ok("dup when no excludeId", exclude && exclude.id === "a");
  const notSelf = AT.findDuplicateLead(base, { id: "a", email: "maria@x.com", phone: "" }, "a");
  ok("self excluded by id", notSelf === null);
  ok("sharesContact by phone", AT.sharesContact({ phone: "09175550101" }, { phone: "+63 917 555 0101" }));
  ok("sharesContact false", !AT.sharesContact({ phone: "09000000000" }, { phone: "09175550101" }));
  eq("dedupeKeys email+phone", AT.dedupeKeys({ email: "A@b.com", phone: "09175550101" }).sort(), ["em:a@b.com", "ph:9175550101"].sort());
})();

// ---- firstResponseMinutes -------------------------------------------------
(function () {
  const lead = {
    createdAt: "2026-09-01T09:00:00.000Z",
    activity: [
      { date: "2026-09-01T09:00:00.000Z", text: "Lead created" },
      { date: "2026-09-01T09:00:00.000Z", text: "Inquiry from listing page." },
      { date: "2026-09-01T10:15:00.000Z", text: "Called client — wants a site visit" }
    ]
  };
  eq("first response 75 min", AT.firstResponseMinutes(lead), 75);
  const noReply = { createdAt: lead.createdAt, activity: [{ date: "2026-09-01T09:00:00.000Z", text: "Lead created" }] };
  ok("null when no reply", AT.firstResponseMinutes(noReply) === null);
  ok("null when no createdAt", AT.firstResponseMinutes({ activity: [] }) === null);
  const recentFirst = { createdAt: "2026-09-01T09:00:00.000Z", activity: [{ date: "2026-09-01T08:00:00.000Z", text: "Follow up" }] };
  ok("pre-created activity ignored", AT.firstResponseMinutes(recentFirst) === null);
})();

// ---- sourceFunnel rollups -------------------------------------------------
(function () {
  const t = (h, m) => { const d = new Date("2026-09-01T" + h + "Z"); return d.setMinutes(d.getMinutes() + (m || 0)), d.toISOString(); };
  const leads = [
    { id: "1", source: "facebook", status: "new", adId: "", createdAt: t("09:00"), activity: [{ date: t("09:05"), text: "Messaged back" }] },
    { id: "2", source: "facebook", status: "contacted", adId: "ad-fb", createdAt: t("09:00"), activity: [] },
    { id: "3", source: "listing", status: "offer", adId: "ad-lm", createdAt: t("09:00"), activity: [{ date: t("09:30"), text: "Scheduled viewing" }] },
    { id: "4", source: "listing", status: "closed", adId: "ad-lm", createdAt: t("09:00"), activity: [] },
    { id: "5", source: "referral", status: "lost", adId: "", createdAt: t("09:00") },
    { id: "6", source: "listing", status: "new", adId: "", createdAt: t("09:00"), activity: [] }
  ];
  const rows = AT.sourceFunnel(leads, { perAd: true });
  const byKey = {};
  rows.forEach(r => { byKey[r.key] = r; });

  const fb = byKey["src:facebook"];
  eq("facebook source totals (ad leads excluded)", [fb.total, fb.qualified], [1, 0]);
  const lm = byKey["src:listing"];
  eq("listing source totals (ad leads excluded)", [lm.total, lm.qualified], [1, 0]);
  const adFb = byKey["ad:ad-fb"];
  ok("ad-fb row present", !!adFb);
  eq("ad-fb totals", [adFb.total, adFb.qualified], [1, 1]);
  eq("ad-fb parent source total (excludes ad leads)", adFb.sourceTotal, 1);
  eq("ad-fb parent qualified", adFb.sourceQualified, 0);
  const adLm = byKey["ad:ad-lm"];
  eq("ad-lm parent source total", adLm.sourceTotal, 1);
  eq("ad-lm closed", adLm.closed, 1);
  eq("ad-lm reservations (offer)", adLm.reservations, 1);
  eq("ad-lm qualify 100%", adLm.pct, 100);
  eq("referral lost not qualified", byKey["src:referral"].qualified, 0);
  eq("fb avg first response 5m", byKey["src:facebook"].avgFirstResponse, 5);
  ok("listing parent row lossless count", rows.filter(r => r.key === "src:listing").length === 1);

  const plain = AT.sourceFunnel(leads, {});
  eq("no perAd still rolls source", plain.find(r => r.key === "src:facebook").total, 2);
  ok("no perAd has no ad rows", plain.every(r => !r.adId));

  const empty = AT.sourceFunnel([], { perAd: true });
  eq("empty funnel", empty, []);
  const other = AT.sourceFunnel([{ id: "x", status: "new" }]);
  eq("missing source -> other", other[0].source, "other");
})();

// ---- attributedAd ----------------------------------------------------------
(function () {
  const ads = [
    { id: "ad-1", listingId: "lst-1", status: "draft" },
    { id: "ad-2", listingId: "lst-1", status: "posted", channel: "lamudi" },
    { id: "ad-3", listingId: "lst-2", status: "posted", channel: "facebook" }
  ];
  const lead = { adId: "ad-3", listingId: "lst-1" };
  eq("attributedAd exact adId wins", AT.attributedAd(lead, ads).id, "ad-3");
  const byListing = AT.attributedAd({ adId: "", listingId: "lst-1" }, ads);
  eq("attributedAd falls back to live listing ad", byListing.id, "ad-2");
  ok("attributedAd skips draft", AT.attributedAd({ adId: "ad-1", listingId: "lst-1" }, ads).id === "ad-2");
  ok("attributedAd null when nothing", AT.attributedAd({ adId: "ad-x", listingId: "lst-x" }, ads) === null);
})();

console.log("\nsource_attribution_node: " + passed + " checks passed");
process.exit(0);