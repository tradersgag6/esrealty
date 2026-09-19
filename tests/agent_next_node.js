/* CRM Autopilot "What next" reasoning — node counterpart to the Agent tab box
 * (AGENT_PROMPT.md lines 103-106). Exercises the exact shipped module
 * js/agent_next.js that renders the box, so the due-reason / touch / playbook
 * draft contract cannot drift from what the rep sees. */
const N = require("../js/agent_next.js");

function legacyPlaybook() {
  return {
    id: "pb-1", title: "OFW Pre-Selling Condo Guide", category: "OFW Buyer",
    salesStage: "Initial Consultation", propertyType: "Condominium", status: "active",
    sections: {
      opening: "Kumusta {name}! Which country are you in and when is your next vacation?",
      objections: [{ trigger: "Mahal naman.", response: "Prices rise 10% a year." }, "Plain objection line"]
    }
  };
}

function canonicalPlaybook() {
  return {
    id: "pb-2", title: "Townhouse Guide", category: "End-User",
    salesStage: "Site Viewing", propertyType: "House & Lot", status: "active",
    sections: { followUpSequence: "Day 1: Send {{property}} brochure.\nDay 3: Call." }
  };
}

function run() {
  const checks = [];
  const c = (name, ok, detail, extra) => checks.push({ name, ok, detail: detail + (extra ? " | " + extra : "") });

  c("stale-new due reason", N.dueReason("stale-new") === "No qualification call yet", N.dueReason("stale-new"));
  c("negotiation due reason", N.dueReason("negotiation") === "Offer momentum needs a touch", N.dueReason("negotiation"));
  c("unknown kind falls back to dormant reason", N.dueReason("nope") === N.DUE_REASON.dormant, N.dueReason("nope"));

  c("call touch for stale-new", N.touchFor("stale-new").type === "call", JSON.stringify(N.touchFor("stale-new")));
  c("whatsapp touch for contacted", N.touchFor("contacted").type === "whatsapp", JSON.stringify(N.touchFor("contacted")));
  c("site-visit touch", N.touchFor("site-visit").type === "site-visit", JSON.stringify(N.touchFor("site-visit")));
  c("closed has no touch", N.touchFor("closed") === null, String(N.touchFor("closed")));

  const legacy = legacyPlaybook();
  c("read canonical section", N.sectionText(canonicalPlaybook(), "followUpSequence").indexOf("brochure") >= 0, "canonical");
  c("read legacy section via canonical key", N.sectionText(legacy, "openingScript").indexOf("Kumusta") >= 0, "legacy opening");
  const obj = N.sectionText(legacy, "objectionResponses");
  c("legacy objections array stringified", obj.indexOf("Mahal naman.") >= 0 && obj.indexOf("Plain objection line") >= 0, obj.slice(0, 48));

  const leadCondo = { name: "Nina Reyes", propertyType: "Condominium" };
  const picks = [legacyPlaybook(), canonicalPlaybook()];
  const picked = N.pickPlaybook(picks, leadCondo, null, "contacted");
  c("pick matches property type + kind stage", picked && picked.id === "pb-1", picked ? picked.title : "none");

  const leadTown = { name: "Ben Cruz" };
  const listingTown = { type: "House & Lot", title: "Cavite Townhouse Unit 12" };
  const picked2 = N.pickPlaybook(picks, leadTown, listingTown, "site-visit");
  c("pick follows listing type for site-visit", picked2 && picked2.id === "pb-2", picked2 ? picked2.title : "none");

  c("no playbooks -> null", N.pickPlaybook([], leadCondo, null, "contacted") === null, "empty");
  c("draft message greets the lead by first name", N.draftMessage(legacy, leadCondo, "stale-new", null).text.indexOf("Hi Nina,") === 0, N.draftMessage(legacy, leadCondo, "stale-new", null).text.slice(0, 24));
  const draftPlace = N.draftMessage(canonicalPlaybook(), leadTown, "site-visit", listingTown);
  c("draft fills {{property}} from the listing", draftPlace.text.indexOf("Cavite Townhouse Unit 12") >= 0 && draftPlace.section === "followUpSequence", draftPlace.section);

  const full = N.whatNext({ name: "Nina Reyes", propertyType: "Condominium", agent: { nextRecheck: "2026-10-01T00:00:00.000Z" } }, "stale-new", picks, null);
  c("whatNext carries reason + touch + draft + recheck", full.reason === "No qualification call yet" && full.touch === "call" && full.draft.indexOf("Kumusta") >= 0 && full.recheck === "2026-10-01T00:00:00.000Z", JSON.stringify({ touch: full.touch, pb: full.playbookTitle }));
  c("whatNext without playbooks still recommends a touch", (function () { const r = N.whatNext({ name: "Solo" }, "dormant", [], null); return r.draft === "" && r.touch === "whatsapp"; })(), "graceful degrade");
  c("whatNext for closed exposes no touch", N.whatNext({ name: "Done" }, "closed", picks, null).touch === "", "closed");

  const ok = checks.every(x => x.ok) && checks.length >= 16;
  console.log("\n[agent_next_node] " + checks.length + " checks");
  checks.forEach(x => console.log("  [" + (x.ok ? "PASS" : "FAIL") + "] " + x.name + (x.ok ? "" : "  " + x.detail)));
  console.log(ok ? "ALL PASS" : "FAILURES PRESENT");
  process.exit(ok ? 0 : 1);
}

run();
