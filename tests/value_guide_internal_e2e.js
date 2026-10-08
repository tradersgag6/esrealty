"use strict";
/* Value Guide (internal) — three-step flow, access, and the PDF download.
 *
 *   1) the item exists in the Analysis dropdown and follows Appraisal's access
 *   2) step 1 blocks progress until the BIR inputs are present
 *   3) a full vacant-lot run reaches a reconciled result
 *   4) the two figures are labelled as different kinds of number
 *   5) the PDF downloads a real PDF and NO lead/email side effect fires
 *
 * The side-effect assertion is the important one. The public guide posts to
 * location-report, which inserts a crm_leads row and emails a PDF; if this tool
 * reached that endpoint, every operator download would manufacture a lead.
 */
window.__msChecks = [];
window.__msLog = [];
window.__msDone = false;
function chk(n, ok, d) { window.__msChecks.push({ name: n, ok: !!ok, detail: d || "" }); }
function log(x) { window.__msLog.push(x); }
setTimeout(function () { log("WD"); window.__msDone = true; }, 240000);

var wait = ms => new Promise(r => setTimeout(r, ms));
async function waitFor(fn, tries, gap) {
  for (var i = 0; i < tries; i++) { if (fn()) return true; await wait(gap || 120); }
  return fn();
}
function q(s) { return document.querySelector(s); }
function qa(s) { return Array.prototype.slice.call(document.querySelectorAll(s)); }
function setv(sel, v) {
  var e = q(sel); if (!e) return false;
  e.value = v; e.dispatchEvent(new Event("change", { bubbles: true }));
  e.dispatchEvent(new Event("input", { bubbles: true }));
  return true;
}
/* Numeric fields re-render on blur so typing is not interrupted, which means
 * the Next button's gating only refreshes once focus genuinely leaves the
 * field. A synthetic blur Event does NOT move focus, so the handler never ran
 * and the button stayed disabled; focusing another control does. */
function setNum(sel, v) {
  if (!setv(sel, v)) return false;
  var e = q(sel);
  if (e && e.focus) e.focus();
  var other = q('[data-vg-set="barangay"]') || q('[data-vg-set="classification"]');
  if (other && other.focus) other.focus();
  return true;
}
/* Read the wizard's own gating decision straight out of the DOM: the Next
 * button is disabled from vgMissing(), so its state is the honest answer to
 * "are all stage-1 inputs present?". Reading the inputs back instead can be
 * fooled by a re-render that has not landed yet. */
function nextEnabled() {
  var b = q('[data-vg-next="2"]');
  return !!(b && !b.disabled);
}

/* ---- spy on anything that could write or send ---- */
var LEAD_CALLS = [];
var MAIL_CALLS = [];
var FETCHED = [];
var realFetch = window.fetch ? window.fetch.bind(window) : null;
window.fetch = function (url, opts) {
  var u = String(url);
  FETCHED.push(u);
  if (/location-report|site-settings|contacts|listings-api/i.test(u)) {
    if (/location-report|contacts/i.test(u)) LEAD_CALLS.push(u);
    if (/site-settings/i.test(u)) MAIL_CALLS.push(u);
    return Promise.resolve({ ok: false, status: 0, json: function () { return Promise.resolve({}); } });
  }
  return realFetch ? realFetch(url, opts) : Promise.reject(new Error("no network in test"));
};
if (window.ESREALTY_LISTINGS_API && window.ESREALTY_LISTINGS_API.contact) {
  window.ESREALTY_LISTINGS_API.contact = function () { LEAD_CALLS.push("contact"); return Promise.resolve({}); };
}

/* ---- pick a location that is real in the dataset ---- */
var EST = null;
async function pickLocation() {
  var ref = EST.reference();
  var sorted = ref.municipalities.slice().sort(function (a, b) { return b.streetCount - a.streetCount; });
  for (var i = 0; i < sorted.length; i++) {
    var row = sorted[i];
    var slug = row.slug;
    var brg = await EST.barangays(slug);
    for (var j = 0; j < brg.length; j++) {
      var st = await EST.streets(slug, brg[j]);
      if (st.streets && st.streets.length > 3) {
        return { muni: row, brg: brg[j], streets: st.streets };
      }
    }
  }
  return null;
}

(async function () {
  try {
    localStorage.removeItem("esrealty_v1");
    localStorage.removeItem("esrealty_user");
    document.querySelector("#auth-role").value = "super-admin";
    document.querySelector("#auth-test").click();
    await wait(600);

    /* ---------- 1. navigation + access ---------- */
    var item = q('#nav [data-view="value-guide"]');
    chk("nav-item-present", !!item, item ? "found in sidebar" : "not in sidebar");
    var analysisMenu = q('[data-dropdown-menu="analysis"]');
    chk("inside-analysis-dropdown", !!(item && analysisMenu && analysisMenu.contains(item)),
      "parent=" + (item && item.parentElement ? item.parentElement.className : "n/a"));
    chk("title-set-on-nav", (q("#topbar-title") || {}).textContent !== "", "topbar present");

    /* A role without appraisal.view must not see it. */
    document.querySelector("#auth-role").value = "agent";
    document.querySelector("#auth-test").click();
    await wait(700);
    var asAgent = q('#nav [data-view="value-guide"]');
    var hiddenForAgent = !asAgent || asAgent.classList.contains("nav-hidden");
    chk("agent-cannot-see-value-guide", hiddenForAgent,
      "class=" + (asAgent ? asAgent.className : "absent"));

    document.querySelector("#auth-role").value = "super-admin";
    document.querySelector("#auth-test").click();
    await wait(700);

    /* ---------- open the view ---------- */
    /* The trigger is identified by the nav-dropdown-trigger CLASS (there is no
       data-dropdown-trigger attribute in the markup); the menu it opens is
       identified by data-dropdown-menu. */
    var trigger = q('#nav [data-dropdown="analysis"]');
    if (trigger) trigger.click();
    await wait(250);
    q('#nav [data-view="value-guide"]').click();
    await wait(900);
    chk("view-opens", q('[data-vg-next="2"]') !== null || /Value Guide/.test(q("#content").textContent),
      "wizard rendered");

    /* ---------- 1b. the collapsed "About this estimate" panel is gone ---------- */
    /* It used to hold three disclosures on step 1 (reference status, land
       method, transaction scenario). A three-step flow has no room for a
       disclosure there: reference status moved to the report, the transaction
       inputs became ordinary fields, and the land-method selector is deleted
       along with the indexed scenario. */
    chk("no-collapsed-about-panel", q(".vg-about") === null, ".vg-about removed");
    chk("transaction-inputs-kept-as-ordinary-fields",
      !!q('[data-vg-set="saleContext"]') && !!q('[data-vg-set="salePrice"]'), "saleContext + salePrice on step 1");
    chk("land-method-selector-removed", !q('[data-vg-set="landMethod"]'), "no landMethod select");
    chk("no-regrouped-sibling-land-method",
      !/class="vg-group-title">Land planning method/.test(q("#content").innerHTML)
      && !/class="vg-group-title">Transaction scenario/.test(q("#content").innerHTML));

    /* ---------- 2. stage 1 gating ---------- */
    EST = window.ESREALTY_EST;
    chk("estimator-available", !!EST, EST ? "ESREALTY_EST loaded" : "missing");
    await EST.loadData();

    var nextBtn = q('[data-vg-next="2"]');
    chk("next-disabled-when-empty", !!(nextBtn && nextBtn.disabled), "blocked with no inputs");

    var loc = await pickLocation();
    chk("found-real-location", !!loc, loc ? loc.muni.name + " / " + loc.brg : "none");

    /* Drive stage 1 through the real selects. */
    await waitFor(() => q('[data-vg-set="municipality"]'), 40, 150);
    setv('[data-vg-set="municipality"]', loc.muni.name);
    await waitFor(() => qa('[data-vg-set="barangay"] option').length > 1, 60, 150);
    chk("barangay-options-loaded", qa('[data-vg-set="barangay"] option').length > 1,
      qa('[data-vg-set="barangay"] option').length + " options");

    setv('[data-vg-set="barangay"]', loc.brg);
    await waitFor(() => qa('[data-vg-set="streetKey"] option').length > 1, 60, 150);
    chk("street-options-loaded", qa('[data-vg-set="streetKey"] option').length > 1,
      qa('[data-vg-set="streetKey"] option').length + " options");

    setv('[data-vg-set="streetKey"]', loc.streets[0].key);
    await waitFor(() => qa('[data-vg-set="classification"] option').length > 1, 60, 150);
    var classOpts = qa('[data-vg-set="classification"] option').map(function (o) { return o.value; })
      .filter(function (v) { return v; });
    /* Prefer a classification the dataset actually prices for this street, so
       the run exercises a real calculation and not the unavailable path. */
    var picked = classOpts[0];
    for (var ci = 0; ci < classOpts.length; ci++) {
      var trial = await EST.estimate({
        purpose: "Selling", type: "vacant_lot", municipality: loc.muni.name,
        barangay: loc.brg, streetKey: loc.streets[0].key,
        classification: classOpts[ci], area: 200
      });
      if (trial && trial.available) { picked = classOpts[ci]; break; }
    }
    setv('[data-vg-set="classification"]', picked);
    setNum('[data-vg-set="area"]', "200");
    await wait(500);
    var missingAfter = (function () {
      var f = (window.__vgForm || {});
      return Object.keys(f).length ? "" : "";
    })();
    chk("all-stage1-inputs-recorded", !!q('[data-vg-set="municipality"]').value
      && !!q('[data-vg-set="barangay"]').value
      && !!q('[data-vg-set="streetKey"]').value
      && !!q('[data-vg-set="classification"]').value
      && Number(q('[data-vg-set="area"]').value) > 0,
      "muni=" + q('[data-vg-set="municipality"]').value
      + " brg=" + q('[data-vg-set="barangay"]').value
      + " street=" + q('[data-vg-set="streetKey"]').value
      + " class=" + q('[data-vg-set="classification"]').value
      + " area=" + q('[data-vg-set="area"]').value);

    /* The stage-1 hint names exactly which inputs the gate still wants, so a
     failure here explains itself instead of being a bare false. */
    var hint = (q("#content .dim.tiny") || {}).textContent || "";
    chk("next-enabled-when-complete", nextEnabled(), hint.slice(0, 120) || "gating says ready");

    /* ---------- 3. stage 2 = details, stage 3 = report ---------- */
    q('[data-vg-next="2"]').click();
    await wait(500);
    chk("stage2-reached", q("[data-vg-calc]") !== null, "details screen");
/* Each option now states the adjustment it carries, so the check reads the bp
          off a rendered control rather than looking for prose that described the
          old policy. This is the substantive change: occupancy, title, estate and
          the site questions all move the number now, and the screen says by how much. */
       var bpTiles = qa("[data-vg-bp]");
       chk("stage2-shows-each-options-adjustment", bpTiles.length >= 12,
         bpTiles.length + " option tiles labelled, first: " + (bpTiles[0] ? bpTiles[0].textContent.trim().slice(0, 60) : ""));
chk("stage2-offers-not-sure-per-question", qa("[data-vg-notsure]").length === 10,
          qa("[data-vg-notsure]").length + " skip affordances (10 questions: the reference splits slope from elevation-vs-road)");
       chk("stage2-explains-what-skipping-means", /rather leave it unassessed than guess/i.test(q("#content").textContent),
         "occupancy impact disclosed");

    /* The review list is folded into Details, so it is checked on this screen
       rather than on a step of its own. Read the rows structurally so the
       check describes what the user actually sees. */
    var rows = qa("#content .vg-summary-row");
    var reviewText = rows.map(function (r) {
      var dt = r.querySelector("dt"), dd = r.querySelector("dd");
      return (dt ? dt.textContent.trim() : "") + ": " + (dd ? dd.textContent.trim() : "");
    }).join(" | ");
    chk("review-shows-inputs", rows.length >= 6 && /sqm/.test(reviewText) && /RDO\s*5[89]/i.test(reviewText),
      rows.length + " rows: " + reviewText.slice(0, 150));

    q("[data-vg-calc]").click();
    await waitFor(function () { return q("[data-vg-pdf]") !== null || /No estimate available/.test(q("#content").textContent); }, 120, 200);
    var hasResult = q("[data-vg-pdf]") !== null;
    chk("result-reached", hasResult, hasResult ? "stage 3" : q("#content").textContent.slice(0, 160));
    if (!hasResult) { finish(); return; }

    /* Reference status moved here from the deleted step-1 disclosure. */
    chk("reference-callout-preserved", !!q("[data-vg-reference-status]"), 
    "report carries it");

    /* The report body assembled by FLOW.reportSections must actually reach the
       DOM: the fixed model callout, the context-only comparables block and the
       twelve published factor rows (twelve since the terrain split added
       elevation-vs-road as a factor of its own). */
    chk("model-callout-in-report",
document.body.textContent.indexOf("Derived from published BIR zonal values") >= 0,
         "callout rendered");
       chk("comparables-block-in-report", !!q("[data-vg-comparables]"),
         q("[data-vg-comparables]") ? "present" : "missing");
       chk("methodology-one-row-per-factor", qa("[data-vf]").length === 12,
         qa("[data-vf]").length + " factor rows");
       /* A row nobody answered must not read as a checked one that found nothing. */
       var unassessed = qa("[data-vf-unassessed]");
       chk("unanswered-factors-read-not-assessed", unassessed.length > 0
         && /Not assessed/.test(document.body.textContent)
         && !unassessed.some(function (r) { return /0\.00%/.test(r.textContent); }),
         unassessed.length + " rows unassessed, none printing 0.00%");

    /* The two figures must be visibly different kinds of number. */
    var figs = qa(".vg-figure");
    chk("two-figures-shown", figs.length === 2, figs.length + " figure blocks");
    var figText = figs.map(function (f) { return f.textContent; }).join(" ");
    chk("bir-labelled-as-reference", /tax reference/i.test(figText), "BIR figure labelled a tax reference");
    chk("estimate-labelled-as-planning", /planning figure/i.test(figText), "guide figure labelled planning");
    chk("not-interchangeable-warning", /not interchangeable/i.test(q("#content").textContent),
      "reader is told the two are not the same kind of number");
    chk("integrity-reconciled", /Arithmetic reconciled/.test(q("#content").textContent),
      "integrity check reported");

    /* ---------- 4. the PDF download ---------- */
    /* Capture the blob at creation. The read is asynchronous, so `created`
       is only complete once the FileReader has run - that is why the wait
       below polls for the header rather than assuming it is ready. */
    var created = null;
    var pdfBytes = null;
    var origCreate = URL.createObjectURL;
    var origClick = HTMLAnchorElement.prototype.click;
    HTMLAnchorElement.prototype.click = function () {
      if (this.download) {
        created = created || {};
        created.name = this.download;
        return;
      }
      return origClick.apply(this, arguments);
    };
    URL.createObjectURL = function (blob) {
      if (blob && blob.type === "application/pdf") {
        created = created || {};
        created.blob = true;
        var fr = new FileReader();
        fr.onload = function () {
          var s = String(fr.result);
          /* %PDF- is the file signature; anything else is not a PDF. */
          created.header = s.slice(0, 5);
          pdfBytes = s.slice(0, 5);
        };
        fr.readAsText(blob.slice(0, 8));
        return "blob:stub";
      }
      return origCreate ? origCreate(blob) : "blob:stub";
    };

    var pdfBtn = q("[data-vg-pdf]");
    chk("pdf-button-enabled", !!(pdfBtn && !pdfBtn.disabled), "enabled after a reconciled run");
    pdfBtn.click();
    await waitFor(function () { return created && created.header; }, 120, 250);
    URL.createObjectURL = origCreate;
    HTMLAnchorElement.prototype.click = origClick;

    chk("pdf-blob-created", !!(created && created.blob), "application/pdf blob built");
    chk("pdf-has-pdf-magic", pdfBytes === "%PDF-", "header=" + pdfBytes);
    chk("pdf-filename-set", !!(created && /\.pdf$/.test(created.name || "")),
      created && created.name ? created.name : "no filename");

    /* ---------- 5. no lead, no email, nothing persisted ---------- */
    chk("no-lead-endpoint-called", LEAD_CALLS.length === 0, LEAD_CALLS.join(", ") || "none");
    chk("no-site-settings-fetch", MAIL_CALLS.length === 0, MAIL_CALLS.join(", ") || "none");
    var reportFetches = FETCHED.filter(function (u) { return /location-report|contacts/i.test(u); });
    chk("no-report-submission", reportFetches.length === 0, reportFetches.join(", ") || "none");

    var stored = null;
    try { stored = localStorage.getItem("esrealty_v1"); } catch (e) {}
    chk("no-draft-persisted", !stored || stored.indexOf('"vg"') < 0,
      stored && stored.indexOf('"vg"') >= 0 ? "vg found in storage" : "vg absent from storage");

    finish();
  } catch (e) {
    window.__msChecks.push({ name: "runner", ok: false, detail: (e && e.message) || String(e) });
    finish();
  }
})();

function finish() {
  window.__msOk = window.__msChecks.every(function (c) { return c.ok; });
  window.__msDone = true;
}
