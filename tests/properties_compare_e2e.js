"use strict";
window.__msChecks = []; window.__msDone = false;
const check = (name, ok, detail = "") => window.__msChecks.push({ name, ok: !!ok, detail });
const wait = ms => new Promise(r => setTimeout(r, ms));
const q = s => document.querySelector(s);
(async () => {
  const api = window.ESREALTY_LISTINGS_API, oldList = api.list, oldGet = api.get;
  try {
    // Deterministic published-listing fixtures, including incomplete data and rent.
    const records = [
      { id: "compare-fixture-a", title: "Sale property", offer_type: "sale", property_type: "house-and-lot", display_price: 2875000, city: "Bauan", province: "Batangas", lot_area_sqm: 100, floor_area_sqm: 0, bedrooms: 0, images: [] },
      { id: "compare-fixture-b", title: "Rental property", offer_type: "rent", property_type: "house-and-lot", display_price: 25000, city: "Caloocan", lot_area_sqm: 80, floor_area_sqm: 60, bedrooms: 2, images: [] },
      { id: "compare-fixture-c", title: "Third property", offer_type: "sale", property_type: "lot-only", display_price: null, images: [] }
    ];
    api.list = async () => ({ data: records, total: 3, page: 1, total_pages: 1 });
    api.get = async id => ({ data: records.find(r => r.id === id) || null });
    location.hash = "#/search?sort=price_asc"; await wait(1800);
    check("Properties exposes compare buttons", document.querySelectorAll(".sf-property-card [data-sf-compare]").length === 3);
    check("compare initially disabled", q("[data-sf-compare-open]").disabled);
    q('[data-sf-compare="compare-fixture-a"]').click();
    check("first selection announced and remains on search", /1 of 2/.test(q("[data-sf-compare-status]").textContent) && location.hash.includes("search"));
    q('[data-sf-compare="compare-fixture-b"]').click();
    check("exactly two enable comparison", !q("[data-sf-compare-open]").disabled && document.querySelectorAll('[data-sf-compare][aria-pressed="true"]').length === 2);
    q('[data-sf-compare="compare-fixture-c"]').click();
    check("third rejected without silent replacement", /Remove one/.test(q("[data-sf-compare-status]").textContent) && q('[data-sf-compare="compare-fixture-c"]').getAttribute("aria-pressed") === "false");
    q('[name="city"]').value = "Unsaved location";
    q('[data-sf-compare="compare-fixture-a"]').click();
    check("selection updates retain search draft", q('[name="city"]').value === "Unsaved location");
    q('[data-sf-compare="compare-fixture-a"]').click();
    q('[data-sf-mode="list"]').click();
    check("list mode retains two selections", document.querySelectorAll('[data-sf-compare][aria-pressed="true"]').length === 2);
    check("storage holds two IDs only", JSON.parse(sessionStorage.getItem("esrealty_compare_v1")).length === 2);
    q("[data-sf-compare-open]").click(); await wait(1200);
    check("comparison route and heading focus", location.hash === "#/compare" && document.activeElement.hasAttribute("data-sf-compare-heading"));
    check("both selected properties present", document.querySelectorAll(".sf-compare-properties article").length === 2);
    const fields = q(".sf-compare-fields").textContent;
    check("sale and monthly rent distinguished", /sale price/.test(fields) && /month/.test(fields));
    check("missing fields honestly marked", /Not supplied/.test(fields) && !/₱0\b/.test(fields));
    check("lot and floor areas separate", /Floor area \(sqm\)/.test(fields) && /Lot area \(sqm\)/.test(fields));
    check("no comparison overflow", document.documentElement.scrollWidth <= innerWidth);
    check("return preserves search URL", q(".sf-compare-page .sf-back").getAttribute("href") === "#/search?sort=price_asc");
    // A same-origin frame boots a fresh storefront module with the same tab's
    // session storage, reproducing restoration without losing this test runner.
    const freshFrame = document.createElement("iframe"); freshFrame.hidden = true;
    freshFrame.src = location.pathname + "#/compare";
    document.body.appendChild(freshFrame);
    try {
      for (let i = 0; i < 80 && !freshFrame.contentDocument.querySelector(".sf-compare-page .sf-back"); i++) await wait(100);
      const returnLink = freshFrame.contentDocument.querySelector(".sf-compare-page .sf-back");
      check("fresh module restores prior search filters", !!returnLink && returnLink.getAttribute("href") === "#/search?sort=price_asc");
      const restoredAction = freshFrame.contentDocument.querySelector("[data-sf-compare-open]");
      check("fresh module restores both selections", !!restoredAction && !restoredAction.disabled);
    } finally { freshFrame.remove(); }
    const returnKey = "esrealty_compare_return_v1", safeReturn = sessionStorage.getItem(returnKey);
    sessionStorage.setItem(returnKey, "https://outside.invalid/");
    const unsafeFrame = document.createElement("iframe"); unsafeFrame.hidden = true;
    unsafeFrame.src = location.pathname + "#/compare"; document.body.appendChild(unsafeFrame);
    try {
      for (let i = 0; i < 80 && !unsafeFrame.contentDocument.querySelector(".sf-compare-page .sf-back"); i++) await wait(100);
      const returnLink = unsafeFrame.contentDocument.querySelector(".sf-compare-page .sf-back");
      check("cached return permits only the Properties hash", !!returnLink && returnLink.getAttribute("href") === "#/search");
    } finally {
      unsafeFrame.remove();
      if (safeReturn == null) sessionStorage.removeItem(returnKey); else sessionStorage.setItem(returnKey, safeReturn);
    }
    q('[data-sf-compare-remove="compare-fixture-a"]').click(); await wait(100);
    check("remove ends completed comparison", !q(".sf-compare-fields") && q("[data-sf-compare-open]").disabled);
    q("[data-sf-compare-clear]").click();
    check("clear persists empty selection", sessionStorage.getItem("esrealty_compare_v1") === "[]");
    location.hash = "#/search?sort=price_desc"; await wait(1600);
    q('[data-sf-compare="compare-fixture-a"]').click(); q('[data-sf-compare="compare-fixture-b"]').click();
    let finishSearch;
    api.list = () => new Promise(resolve => { finishSearch = resolve; });
    location.hash = "#/search?sort=date_desc";
    for (let i = 0; i < 30 && !finishSearch; i++) await wait(50);
    check("delayed search can still clear comparison", !!finishSearch && !!q("[data-sf-compare-clear]"));
    q("[data-sf-compare-clear]").click();
    finishSearch({ data: records, total: 3, page: 1, total_pages: 1 });
    api.list = async () => ({ data: records, total: 3, page: 1, total_pages: 1 });
    await wait(250);
    check("clearing selection does not strand pending search", document.querySelectorAll(".sf-property-card [data-sf-compare]").length === 3);
    check("pending search preserves cleared selection", q("[data-sf-compare-open]").disabled && sessionStorage.getItem("esrealty_compare_v1") === "[]");
    // Recover the old broken implementation only so later assertions still run.
    if (!q('[data-sf-compare="compare-fixture-a"]')) { window.ESREALTY_STOREFRONT.refresh(); await wait(250); }
    q('[data-sf-compare="compare-fixture-a"]').click(); q('[data-sf-compare="compare-fixture-b"]').click();
    api.get = async id => ({ data: id === "compare-fixture-b" ? null : records[0] });
    q("[data-sf-compare-open]").click(); await wait(1000);
    check("unavailable property cannot appear as current", !q(".sf-compare-fields") && /unavailable/.test(q(".sf-compare-page").textContent));
    api.get = oldGet; api.list = oldList;
  } catch (e) { check("runner", false, e.message); }
  finally { api.list = oldList; api.get = oldGet; }
  window.__msOk = window.__msChecks.every(c => c.ok); window.__msDone = true;
})();
