"use strict";
window.__msChecks = []; window.__msDone = false;
const check = (name, ok, detail = "") => window.__msChecks.push({ name, ok: !!ok, detail });
const q = s => document.querySelector(s), wait = ms => new Promise(r => setTimeout(r, ms));
(async () => {
  try {
    location.hash = "#/home"; await wait(2600);
    const api = window.ESREALTY_EST; await api.loadData();
    const state = api._state(), options = { municipality: "BAUAN", barangay: "POBLACION III", streetKey: "binay st ressurreccion st", classification: "RR", area: 100, type: "vacant_lot", purpose: "Buying" };
    Object.assign(state, options, { municipalitySlug: "bauan", streetLabel: "BINAY ST (RESSURRECCION ST)", classificationUse: "residential", muniRow: api.municipalityRow("BAUAN"), muniData: await api.loadMunicipality("bauan"), landMethod: "factor", timeSource: "manual", timeAnnualPct: null }); api.debug.render(1);
    const reference = q(".sf-est-reference-disclosure"); reference.open = true;
    check("status not falsely latest or effective", /Latest applicability unverified/.test(reference.textContent) && /Not verified/.test(reference.textContent));
    check("generation and schedule dates separated", /2022-07-23/.test(reference.textContent) && /2026-09-22/.test(reference.textContent));
    check("import date not invented", /Not established separately/.test(reference.textContent));
    check("no default annual growth", q('[data-est-time="timeAnnualPct"]').value === "");
    function set(key, value) { const input = q('[data-est-time="' + key + '"]'); input.value = value; input.dispatchEvent(new Event(input.tagName === "SELECT" ? "change" : "input", { bubbles: true })); }
    set("landMethod", "time-indexed"); q("[data-est-next]").click();
    check("missing explicit rate blocks progress", /no default rate/.test(q("[data-est-next-hint]").textContent));
    check("rate error focused and disclosure open", document.activeElement === q('[data-est-time="timeAnnualPct"]') && q(".sf-est-time-inputs").open);
    api.mount(); await wait(50);
    check("same-home asynchronous render retains validation", /no default rate/.test(q("[data-est-next-hint]").textContent) && q(".sf-est-time-inputs").open);
    set("timeAnnualPct", "5"); set("timeBaseDate", "2022-07-23"); set("timeTargetDate", "2020-01-01"); q("[data-est-next]").click();
    check("backwards dates blocked", /target cannot precede base/.test(q("[data-est-next-hint]").textContent));
    set("timeTargetDate", "2026-10-03"); set("timeSource", "evidence"); q("[data-est-next]").click();
    check("unavailable evidence does not fake growth", /No applicable reviewed land-price history/.test(q("[data-est-next-hint]").textContent));
    set("timeSource", "manual"); q("[data-est-next]").click();
    check("valid scenario advances", !!q('[data-est-screen="2"]'));
    for (const key of ["occupancy", "titleStatus", "inheritanceStatus"]) q('[data-est-ownership="' + key + '"][data-val="not_sure"]').click();
    q("[data-est-next]").click();
    check("review explicitly records method and assumption", /Indexed reference; no stacked/.test(q(".sf-est-review").textContent) && /5% annually/.test(q(".sf-est-review").textContent));
    // Public calculate path uses the actual persisted controls, not direct core rendering.
    q("[data-est-next]").click();
    for (let i = 0; i < 120 && !q(".sf-est-result-value"); i++) await wait(100);
    const result = state.result;
    check("public scenario computed", result && result.available && result.landMethod === "time-indexed");
    check("headline declares indexed scenario", /Indexed-reference planning scenario/.test(q(".sf-est-result-summary").textContent));
    check("original official rate remains separate", result.birZonalRatePerSqm === 11500 && result.birZonalValue === 1150000 && /1,150,000/.test(q(".sf-est-result-bir").textContent));
    check("indexed trace contains explicit dates and no stacking", /2022-07-23/.test(q("[data-est-time-result]").textContent) && /2026-10-03/.test(q("[data-est-time-result]").textContent) && /not stacked/.test(q("[data-est-time-result]").textContent));
    check("buying decision shares selected scenario", /Your buying decision/.test(q("[data-est-decision]").textContent) && q("[data-est-decision]").textContent.includes(q(".sf-est-result-value").textContent));
    check("no viewport overflow", document.documentElement.scrollWidth <= innerWidth);
    // The Lipa proposal must be visible as future proposed, not active tax data.
    Object.assign(state, { municipality: "LIPA CITY", muniRow: api.municipalityRow("LIPA CITY"), landMethod: "factor" }); api.debug.render(1);
    check("Lipa proposal correctly labelled", /Proposed.*not an active reference/.test(q("[data-est-reference-status]").textContent) && /2028-2030/.test(q("[data-est-reference-status]").textContent));
    check("factor method still selectable without rate", q('[data-est-time="landMethod"]').value === "factor");
  } catch (e) { check("runner", false, e.message); }
  window.__msOk = window.__msChecks.every(c => c.ok); window.__msDone = true;
})();
