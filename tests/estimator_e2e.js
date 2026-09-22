"use strict";
/* Batangas Value Guide funnel end-to-end (guest storefront, Phase 4):
   1) funnel is a section in #/home; screen 1 = purpose/stage/type + Batangas-only location
   2) gating: estimate hidden until municipality+barangay+classification+area are set
   3) depth-1 flow (Balayan / BACLARAN / all street / CR) vs core.computeEstimate
   4) all-other-streets fallback (depth 2) via the "Street not listed" button
   5) house & lot flow: screen 2 inputs -> improvement included in report
   6) report sections (14), coverage honesty, lead block + submit status */
window.__msChecks = [];
window.__msLog = [];
window.__msDone = false;
function chk(n, ok, d) { window.__msChecks.push({ name: n, ok: !!ok, detail: d || "" }); }
async function wait(ms) { return new Promise(r => setTimeout(r, ms)); }
async function waitFor(fn, tries, gap) {
  for (let i = 0; i < tries; i++) { if (fn()) return true; await wait(gap); }
  return fn();
}
const ESP = 120;
const MONEY = n => "₱" + new Intl.NumberFormat("en-PH", { maximumFractionDigits: 0 }).format(Math.round(n || 0));
const estApi = () => window.ESREALTY_EST || null;
const q = s => document.querySelector(s);
const qa = s => Array.prototype.slice.call(document.querySelectorAll(s));
function stateOpts() {
  const st = estApi()._state();
  return {
    municipality: st.municipality, barangay: st.barangay,
    streetKey: st.allOther ? "" : st.streetKey,
    classification: st.classification, area: st.area,
    corner: st.corner, purpose: st.purpose, type: st.type,
    floorArea: Number(st.floorArea) > 0 ? Number(st.floorArea) : 0,
    floors: st.floors, ageBand: st.ageBand,
    construction: st.construction, features: st.features
  };
}
async function estimateExpected(opts) {
  const api = estApi();
  const row = api._data().index.municipalities.find(m => m.name === opts.municipality);
  const md = await api.loadMunicipality(row.slug);
  return api.core.computeEstimate(api._data().config, api._data().index, md, opts);
}
function setValue(sel, v) { const e = q(sel); e.value = v; e.dispatchEvent(new Event("change", { bubbles: true })); }
function setInput(sel, v) { const e = q(sel); e.value = v; e.dispatchEvent(new Event("input", { bubbles: true })); }
(async () => {
  try {
    window.__msLog.push("funnel-e2e start");
    location.hash = "#/home";
    await wait(400);

    await waitFor(() => estApi() && q('[data-est-muni]') && q('[data-est-screen="1"]'), 60, ESP);
    const pt = q('[data-est-muni]') ? q('[data-est-muni]').options.length : 0;
    chk("sf-estimator-section-present", !!q('#sf-estimator') && !!q('[data-est-card]') && !!q('.sf-est'), "root ok");
    chk("funnel-brand-eyebrow", /BATANGAS VALUE GUIDE/.test(document.body.innerText), "");
    chk("homepage-primary-estimate-cta", !!q('.sf-est-hero-actions [data-est-services]') && /Get My Free Estimate/.test(q('.sf-est-hero-actions [data-est-services]').textContent), "");
    chk("homepage-secondary-batangas-cta", !!q('.sf-est-hero-actions a[href*="state=Batangas"]'), "");
    chk("homepage-guide-summary-heading", /A clearer answer before your next property step/.test(document.body.innerText), "");
    chk("screen1-rendered", !!q('[data-est-screen="1"]'), "");
    chk("region-fixed-batangas", !!q('.sf-est-loc-fixed') && /CALABARZON.*Batangas/.test(q('.sf-est-loc-fixed').textContent), "txt=" + (q('.sf-est-loc-fixed') && q('.sf-est-loc-fixed').textContent));
    chk("mn-options-gte34", pt >= 34, "mn=" + pt);
    chk("legacy-map-removed", !document.getElementById("est-map") && !q('[data-est-step]'), "");
    chk("street-search-input", !!q('[data-est-street-q]'), "");
    chk("classification-starts-empty", !!q('[data-est-class]') && q('[data-est-class]').value === "", "value=" + (q('[data-est-class]') && q('[data-est-class]').value));

    q('[data-est-next]').click();
    await wait(60);
    const err0 = q('[data-est-next-hint]');
    chk("gating-error-on-empty", !!err0 && /municipality/.test(err0.textContent), "txt=" + (err0 && err0.textContent));
    chk("error-highlights-muni", !!q('[data-est-muni]') && q('[data-est-muni]').closest(".sf-est-field").classList.contains("sf-est-invalid"), "invalid-class");

    // --- depth 1: Balayan / BACLARAN / all street / CR / 200 / corner ---
    setValue('[data-est-muni]', "BALAYAN");
    await waitFor(() => qa('[data-est-barangay] option').some(o => o.value === "BACLARAN"), 60, ESP);
    chk("barangay-options-loaded", qa('[data-est-barangay] option').length >= 2, "n=" + qa('[data-est-barangay] option').length);
    setValue('[data-est-barangay]', "BACLARAN");
    await waitFor(() => qa('[data-est-street]').length > 0, 30, ESP);
    chk("street-list-populated", qa('[data-est-street]').length > 0, "n=" + qa('[data-est-street]').length);
    chk("street-not-listed-button", !!q('[data-est-screen="1"] [data-est-street-all]'), "");
    // Search-filtered street buttons are re-injected via innerHTML on each
    // keystroke; clicking them must still select the street (delegated handler).
    setInput('[data-est-street-q]', "all street");
    await wait(80);
    const filtered = qa('[data-est-street]').filter(b => !b.hasAttribute('data-est-street-all'));
    chk("street-search-filters-list", filtered.length > 0 && filtered.length <= 3 && filtered.some(b => /all street/i.test(b.textContent)), "n=" + filtered.length);
    const streetKey = (filtered.find(b => /all street/i.test(b.textContent)) || qa('[data-est-street]')[0]).getAttribute("data-est-street");
    (filtered.find(b => b.getAttribute("data-est-street") === streetKey) || qa('[data-est-street]')[0]).click();
    await wait(120);
    chk("street-clicked-from-search-selects", !!q('[data-est-street-q]') && String(q('[data-est-street-q]').value).toLowerCase() === "all street" && !!estApi()._state().streetKey && !estApi()._state().allOther, "value=" + ((q('[data-est-street-q]') || {}).value || ""));
    chk("class-options-from-street", Array.from(q('[data-est-class]').options).some(o => o.value === "CR"), "opts=" + q('[data-est-class]').options.length);
    setValue('[data-est-class]', "CR");
    setInput('[data-est-area]', "200");
    const corner = q('[data-est-corner]');
    if (corner && !corner.checked) { corner.checked = true; corner.dispatchEvent(new Event("change", { bubbles: true })); }

    q('[data-est-next]').click();
    await waitFor(() => q('[data-est-screen="3"]'), 30, ESP);
    chk("screen3-animation", !!q('[data-est-screen="3"] [data-est-spin]') && /spin/.test(q('[data-est-screen="3"] [data-est-spin]').className), "");
    await waitFor(() => q('[data-est-screen="4"]'), 90, ESP);
    chk("result-heading-is-clear", !!q('#sf-est-result-heading') && /Your property value guide/.test(q('#sf-est-result-heading').textContent), "");

    const rD1 = estApi()._state().result;
    chk("depth1-available", rD1 && rD1.available, "");
    chk("depth1-level", rD1 && rD1.source && rD1.source.depth === 1 && rD1.source.level === "street", "lvl=" + (rD1 && rD1.source && rD1.source.level));
    chk("depth1-reconciles", estApi().core.integrityCheck(rD1).ok, "");
    const e1 = await estimateExpected(stateOpts());
    chk("total-matches-core", MONEY(rD1.total) === MONEY(e1.total), "dom=" + MONEY(rD1.total) + " core=" + MONEY(e1.total));
    chk("corner-note-shown", /corner lot \(\+2.5%\)/.test(document.body.innerText), "");
    chk("range-or-bir-reference-shown", !!q('.sf-est-range') && (/–/.test(q('.sf-est-range').textContent) || /BIR reference/.test(q('.sf-est-range').textContent)), "txt=" + ((q('.sf-est-range') || { textContent: "" }).textContent));
    chk("per-sqm-shown", !!q('.sf-est-per') && /sqm/.test(q('.sf-est-per').textContent), "");
    chk("bir-value-shown-separately", !!q('.sf-est-bir-primary') && /Official BIR zonal value/.test(q('.sf-est-bir-primary').textContent), "");
    chk("market-guide-evidence-gated", !!q('.sf-est-guide-unavailable') && /pending comparable evidence/i.test(q('.sf-est-guide-unavailable').textContent), "");
    chk("asking-price-value-shown", !!q('.sf-est-asking') && !/Pending comparables/.test(q('.sf-est-asking').textContent) && /₱/.test(q('.sf-est-asking').textContent), "");
    chk("full-property-report-label", /Full Property Report/.test(document.body.innerText), "");
    chk("pricing-strategy-shown", /Negotiation floor/.test(document.body.innerText) && /Buyer sweet spot/.test(document.body.innerText), "");
    chk("taxes-fees-commissions-shown", /Taxes, fees & commissions/.test(document.body.innerText) && /Broker commission/.test(document.body.innerText), "");
    chk("tax-base-disclosed", /Illustrative tax base/.test(document.body.innerText), "");
    chk("coverage-good-tag", !!q('.sf-est-tag-good') && /BIR street data/.test(q('.sf-est-tag-good').textContent), "");
    chk("report-15-sections", qa('.sf-est-rsec').length === 15, "n=" + qa('.sf-est-rsec').length);

    // lead block + submit (fallback to contact stub, no email -> "saved")
    chk("lead-block-present", !!q('[data-est-lead]'), "");
    q('[data-est-appraisal-open]').click();
    await wait(40);
    chk("appraisal-lead-form-opens", !!q('[data-est-lead-form]') && /professional appraisal/i.test(q('[data-est-lead-form] h3').textContent), "");
    const form = q('[data-est-lead-form]');
    form.querySelector('[name=name]').value = "E2E Tester";
    form.querySelector('[name=email]').value = "e2e@example.com";
    form.querySelector('[name=phone]').value = "09171234567";
    form.querySelector('[name=consent]').checked = true;
    window.ESREALTY_LISTINGS_API = { contact: () => Promise.resolve({ emailSent: false }) };
    form.querySelector('button[type=submit]').click();
    await waitFor(() => /saved/.test((q('[data-est-lead-status]') || { textContent: "" }).textContent), 40, ESP);
    chk("lead-submit-success-saved", /saved/.test((q('[data-est-lead-status]') || { textContent: "" }).textContent), (q('[data-est-lead-status]') || { textContent: "" }).textContent);

    // --- depth 2: "Street not listed" (barangay all-other) ---
    estApi().debug.render(1);
    await wait(70);
    chk("back-to-screen1", !!q('[data-est-screen="1"]'), "");
    q('[data-est-screen="1"] [data-est-street-all]').click();
    await wait(90);
    const cs2 = q('[data-est-class]');
    chk("class-options-after-allother", Array.from(cs2.options).some(o => o.value === "A40"), "opts=" + Array.from(cs2.options).map(o => o.value).join(","));
    setValue('[data-est-class]', "A40");
    setInput('[data-est-area]', "100");
    q('[data-est-next]').click();
    await waitFor(() => q('[data-est-screen="4"]'), 90, ESP);
    const rD2 = estApi()._state().result;
    chk("depth2-available", rD2 && rD2.available, "");
    chk("depth2-level", rD2 && rD2.source.depth === 2 && rD2.source.level === "barangay-other", "lvl=" + (rD2 && rD2.source && rD2.source.level));
    chk("depth2-other-value-2500", rD2 && rD2.reference && rD2.reference.value === 2500, "ref=" + (rD2 && rD2.reference && rD2.reference.value));

    // --- house & lot flow (screen 2 inputs) ---
    estApi().debug.render(1);
    await wait(70);
    const typeGroup = qa('[data-est-screen="1"] [data-chip-group]').find(g => g.getAttribute("data-t") === "type");
    typeGroup.querySelector('[data-val="house_lot"]').click();
    await wait(60);
    setInput('[data-est-sale-price]', "5000000");
    chk("house-next-goes-to-screen2", /Continue to the house/.test(q('[data-est-next]').textContent), "label=" + q('[data-est-next]').textContent);
    q('[data-est-next]').click();
    await waitFor(() => q('[data-est-screen="2"]'), 30, ESP);
    chk("screen2-house-inputs", !!q('[data-est-floor]') && qa('[data-est-feature]').length >= 6, "feat=" + qa('[data-est-feature]').length);
    setInput('[data-est-floor]', "160");
    const wg = qa('[data-est-feature]').find(cb => cb.getAttribute("data-est-feature") === "wall_gate");
    if (wg) { wg.checked = true; wg.dispatchEvent(new Event("change", { bubbles: true })); }
    q('[data-est-next]').click();
    await waitFor(() => q('[data-est-screen="4"]'), 90, ESP);
    const rH = estApi()._state().result;
    const eH = await estimateExpected(stateOpts());
    chk("house-available", rH && rH.available, "");
    chk("house-total-matches-core", MONEY(rH.total) === MONEY(eH.total), "dom=" + MONEY(rH.total) + " core=" + MONEY(eH.total));
    chk("house-improvement-included", rH && rH.improvement === eH.improvement && rH.improvement > 0, "imp=" + (rH && rH.improvement));
    chk("house-report-shows-house-value", /House value/.test(document.body.innerText), "");
    chk("seller-net-proceeds-shown", /estimated net proceeds/.test(document.body.innerText), "");

    window.__msOk = window.__msChecks.every(c => c.ok) && window.__msChecks.length > 0;
    window.__msDone = true;
  } catch (err) {
    window.__msLog.push("e2e error: " + (err && err.message || err));
    window.__msChecks.push({ name: "run-error", ok: false, detail: (err && err.message || String(err)) });
    window.__msOk = false;
    window.__msDone = true;
  }
})();
