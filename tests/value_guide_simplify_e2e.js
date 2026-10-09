"use strict";
/* Value Guide — simplified "About this estimate" panel.
 *
 * The three technical blocks (government schedule status, land method with the
 * optional time scenario, transaction type with optional costs) used to sit at
 * the top level of step 1, so a first-time reader met provenance and four cost
 * inputs before anything about their property. They are now behind one collapsed
 * disclosure that states the three decisions in plain language.
 *
 * This suite pins the behaviour that consolidation can easily break:
 *   1) the panel is collapsed by default and holds all three sections
 *   2) plain-language facts are always readable, including unverified status
 *   3) an opened section survives the re-render that a location change causes
 *   4) validation opens the WHOLE ancestor chain, so the focused field is visible
 *   5) no automatic annual change is invented; the auto control says why
 *   6) the review step restates the reference status and the cost basis
 *
 * The internal wizard's matching consolidation is asserted in
 * value_guide_internal_e2e, which already drives that wizard.
 */
window.__msChecks = [];
window.__msDone = false;
const check = (name, ok, detail = "") => window.__msChecks.push({ name, ok: !!ok, detail });
const q = s => document.querySelector(s), qa = s => [...document.querySelectorAll(s)];
const wait = ms => new Promise(r => setTimeout(r, ms));

(async () => {
  try {
    location.hash = "#/home"; await wait(2600);
    const api = window.ESREALTY_EST; await api.loadData();
    const state = api._state();
    Object.assign(state, {
      municipality: "BAUAN", municipalitySlug: "bauan", barangay: "POBLACION III",
      streetKey: "binay st ressurreccion st", streetLabel: "BINAY ST (RESSURRECCION ST)",
      classification: "RR", classificationUse: "residential", area: 100,
      type: "vacant_lot", purpose: "Buying", landMethod: "factor", timeSource: "manual",
      timeAnnualPct: null, timeEvidenceId: "", saleContext: "private-resale",
      muniRow: api.municipalityRow("BAUAN"), muniData: await api.loadMunicipality("bauan")
    }, { openPanels: {} });
    api.debug.render(1);

    /* ---------- 1. one collapsed container for all three sections ---------- */
    const about = q(".sf-est-about");
    check("single about panel exists", !!about);
    check("about panel is collapsed by default", !!about && !about.open);
    check("all three sections are nested inside it",
      !!about && ["sf-est-reference-disclosure", "sf-est-time-inputs", "sf-est-cost-inputs"]
        .every(c => about.querySelector("details." + c)));
    check("sections are collapsed until asked for",
      ["sf-est-reference-disclosure", "sf-est-time-inputs", "sf-est-cost-inputs"]
        .every(c => { const el = q("details." + c); return el && !el.open; }));
    check("technical sections no longer sit at the top level of step 1",
      !q('[data-est-screen="1"] > details.sf-est-time-inputs') && !q('[data-est-screen="1"] > details.sf-est-cost-inputs'));
    check("always-visible hint repeats the unverified status instead of claiming currency",
      (() => {
        const hint = q(".sf-est-next-hint");
        return !!hint && /latest applicability unverified/i.test(hint.textContent)
          && !/official BIR zonal schedule/.test(hint.textContent);
      })());

    /* ---------- 2. plain-language facts, honest about status ---------- */
    const facts = q(".sf-est-about-facts");
    check("plain facts list rendered", !!facts && facts.querySelectorAll("li").length === 3);
    const factText = facts ? facts.textContent : "";
    check("reference fact states unverified applicability", /Latest applicability unverified/.test(factText) && /2022-07-23/.test(factText));
    check("method fact names the factor guide with no growth", /Factor-based guide/.test(factText) && /no annual change assumed/.test(factText));
    check("cost fact names the resale illustration", /Standard resale illustration/.test(factText));
    check("no municipality selected is stated, not silently omitted", (() => {
      Object.assign(state, { municipality: "", muniRow: null, openPanels: {} }); api.debug.render(1);
      const t = q(".sf-est-about-facts").textContent;
      Object.assign(state, { municipality: "BAUAN", muniRow: api.municipalityRow("BAUAN") }); api.debug.render(1);
      return /Choose a municipality/.test(t);
    })());

    /* ---------- 3. an opened section survives a location re-render ---------- */
    about.open = true;
    q("details.sf-est-reference-disclosure").open = true;
    await wait(30);
    const muni = q("[data-est-muni]");
    muni.value = "LIPA CITY"; muni.dispatchEvent(new Event("change", { bubbles: true }));
    await wait(400);
    check("opened section stays open after a municipality change",
      !!q(".sf-est-about") && q(".sf-est-about").open && !!q("details.sf-est-reference-disclosure") && q("details.sf-est-reference-disclosure").open);
    check("reference status follows the new municipality",
      /Proposed — not an active reference/.test(q("[data-est-reference-status]").textContent));
    q("details.sf-est-reference-disclosure").open = false;
    q(".sf-est-about").open = false;

    /* restore Bauan */
    Object.assign(state, {
      municipality: "BAUAN", municipalitySlug: "bauan", barangay: "POBLACION III",
      streetKey: "binay st ressurreccion st", streetLabel: "BINAY ST (RESSURRECCION ST)",
      classification: "RR", classificationUse: "residential", area: 100,
      muniRow: api.municipalityRow("BAUAN"), muniData: await api.loadMunicipality("bauan"),
      openPanels: {}
    });
    api.debug.render(1);

    /* ---------- 4. validation reveals the whole chain, not just one level ---- */
    const cost = q('[data-est-cost="brokerPct"]');
    cost.value = "-1"; cost.dispatchEvent(new Event("input", { bubbles: true }));
    q("[data-est-next]").click();
    await wait(60);
    check("cost validation opens the container and the section",
      q(".sf-est-about").open && q(".sf-est-cost-inputs").open);
    check("the invalid control is actually visible after validation",
      cost.getBoundingClientRect().height >= 44 && cost.getBoundingClientRect().width >= 100);
    check("the invalid control holds focus", document.activeElement === cost);

    state.landMethod = "time-indexed"; api.debug.render(1);
    q("[data-est-next]").click();
    await wait(60);
    check("indexed-scenario validation opens container and section",
      q(".sf-est-about").open && q(".sf-est-time-inputs").open);
    check("no default annual change is invented",
      q('[data-est-time="timeAnnualPct"]').value === "" && state.timeAnnualPct == null);
    check("indexed scenario without a rate is blocked, not guessed",
      /no default rate/.test(q("[data-est-next-hint]").textContent));
    check("the missing-rate control is visible after validation",
      q('[data-est-time="timeAnnualPct"]').getBoundingClientRect().height >= 44);

    /* ---------- 5. no automatic growth without reviewed evidence ---------- */
    const apply = q("[data-est-time-apply-evidence]");
    check("auto trend control exists", !!apply);
    check("auto trend control is disabled with no reviewed history", !!apply && apply.disabled);
    check("auto trend control explains the absence",
      !!apply && /will not assume a growth rate/.test(apply.closest(".sf-est-time-auto").textContent));
    check("evidence dropdown offers no fabricated record",
      /No reviewed local land-price history available/.test(q('[data-est-time="timeEvidenceId"]').textContent));

    /* ---------- 6. Details advances straight to the calculating screen ----- */
    /* The old review step ("Check your inputs") was removed: its reference and
       cost facts live in the About panel (asserted in section 2) and in the
       result report, so the flow is Location -> Details -> calculating ->
       Result. Ownership answers default to Not sure and are recorded as the
       specialist's review flags. */
    state.landMethod = "factor"; state.brokerPct = .03; api.debug.render(1);
    q("[data-est-next]").click();
    await wait(120);
    check("default factor method advances without touching the advanced panels",
      !!q('[data-est-screen="2"]'));
    check("ownership answers start on Not sure", ["occupancy", "titleStatus", "inheritanceStatus"].every(key => {
      const btn = q(`[data-est-ownership="${key}"][data-val="not_sure"]`);
      return !!btn && btn.classList.contains("active") && btn.getAttribute("aria-pressed") === "true";
    }));
    q("[data-est-next]").click();
    await wait(120);
    check("no review screen between Details and the calculation",
      !!q('[data-est-screen="3"]') && !q(".sf-est-review") && !q('[data-est-screen="5"]'));
    for (let i = 0; i < 80 && !q('[data-est-screen="4"]'); i++) await wait(150);
    check("calculation completes to the result", !!q('[data-est-screen="4"]'));

    check("no page overflow", document.documentElement.scrollWidth <= innerWidth);
  } catch (e) { check("runner", false, e.message); }
  window.__msOk = window.__msChecks.every(c => c.ok);
  window.__msDone = true;
})();