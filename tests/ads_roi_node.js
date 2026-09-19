/* Per-ad ROI math — the node counterpart to the Ad ROI card (PHASE_0_1_BUILD.md
 * 1.3). Exercises the exact shipped js/attribution.js adRoi() so the card's
 * numbers cannot drift from the model the CRM renders. */
const A = require("../js/attribution.js");
const adPerf = require("../market-scan/vercel/api/ad-perf.js");

function run() {
  const checks = [];
  const c = (name, ok, detail) => checks.push({ name, ok, detail });

  const ads = [
    { id: "ad-1", listingTitle: "Azumi 3BR", channel: "lamudi", status: "posted", perfViews: 120, perfInquiries: 6, cost: 2400 },
    { id: "ad-2", listingTitle: "Tagaytay Lot", channel: "fb", status: "posted", perfViews: 0, perfInquiries: 0 }
  ];
  const leads = [
    { id: "l1", adId: "ad-1", status: "new" },
    { id: "l2", adId: "ad-1", status: "contacted" },
    { id: "l3", adId: "ad-1", status: "site-visit" },
    { id: "l4", adId: "ad-1", status: "offer" },
    { id: "l5", adId: "ad-1", status: "closed" },
    { id: "l6", adId: "ad-2", status: "lost" },
    { id: "l7", adId: "", status: "contacted" }
  ];
  const visits = [
    { leadId: "l3", status: "done" },
    { leadId: "l3", status: "scheduled" },
    { leadId: "l1", status: "done" },
    { leadId: "l7", status: "done" }
  ];

  const rows = A.adRoi(ads, leads, { visits });
  const r1 = rows.find(r => r.id === "ad-1");
  const r2 = rows.find(r => r.id === "ad-2");

  c("adRoi returns one row per ad", rows.length === 2, String(rows.length));
  c("channel views/inquiries carried through", r1.views === 120 && r1.inquiries === 6, r1.views + "/" + r1.inquiries);
  c("CRM leads roll up by adId", r1.leads === 5, String(r1.leads));
  c("qualified excludes new/lost", r1.qualified === 4, String(r1.qualified));
  c("completed visits counted per linked lead", r1.visits === 2, String(r1.visits));
  c("reservations from offer/negotiation", r1.reservations === 1, String(r1.reservations));
  c("closed counted", r1.closed === 1, String(r1.closed));
  c("view -> inquiry %", r1.viewToInquiry === 5, String(r1.viewToInquiry));
  c("inquiry -> reservation %", r1.inquiryToReservation === 17, String(r1.inquiryToReservation));
  c("cost per inquiry", r1.costPerInquiry === 400, String(r1.costPerInquiry));

  c("zero-view ad yields null ratios, not NaN", r2.viewToInquiry === null && r2.inquiryToReservation === null, String(r2.viewToInquiry));
  c("unattributed leads are ignored", r2.leads === 1 && r2.qualified === 0, r2.leads + "/" + r2.qualified);

  const empty = A.adRoi([], leads, {});
  c("no ads -> empty array", Array.isArray(empty) && empty.length === 0, String(empty.length));

  const noVisits = A.adRoi([{ id: "ad-1", perfViews: 10, perfInquiries: 1 }], leads, {});
  c("missing visits option is safe", noVisits[0].visits === 0, String(noVisits[0].visits));

  const norm = adPerf.normalize([
    { id: "ad-1", views: 10.6, inquiries: 2 },
    { adId: "ad-2", perfViews: "-3", perfInquiries: "4.4", url: "https://x" },
    { id: "", views: 5, inquiries: 5 },
    { id: "ad-3" }
  ]);
  c("ad-perf normalize maps id/views/inquiries", norm.length === 2 && norm[0].id === "ad-1" && norm[0].perfViews === 11, JSON.stringify(norm[0]));
  c("ad-perf normalize clamps negatives and rounds", norm[1].id === "ad-2" && norm[1].perfViews === 0 && norm[1].perfInquiries === 4, JSON.stringify(norm[1]));
  const normObj = adPerf.normalize({ ads: [{ id: "ad-9", perfViews: 1, perfInquiries: 0 }] });
  c("ad-perf normalize accepts {ads:[]} shape", normObj.length === 1 && normObj[0].id === "ad-9", JSON.stringify(normObj[0]));

  const ok = checks.every(x => x.ok) && checks.length >= 17;
  console.log("\n[ads_roi_node] " + checks.length + " checks");
  checks.forEach(x => console.log("  [" + (x.ok ? "PASS" : "FAIL") + "] " + x.name + (x.ok ? "" : "  " + x.detail)));
  console.log(ok ? "ALL PASS" : "FAILURES PRESENT");
  process.exit(ok ? 0 : 1);
}

run();
