"use strict";
window.__msChecks = [];
window.__msLog = [];
window.__msDone = false;
function chk(n, ok, d) { window.__msChecks.push({ name: n, ok: !!ok, detail: d || "" }); }
async function wait(ms) { return new Promise(r => setTimeout(r, ms)); }
(async () => {
  try {
    const tBtn = document.querySelector("#auth-test");
    if (tBtn) { tBtn.click(); await wait(1500); }
    window.__msLog.push("loggedIn=" + (document.querySelector("#sidebar").classList.contains("hidden") === false));
    const navAppraisal = document.querySelector('#nav [data-view="appraisal"], [data-view="appraisal"].nav-item, .nav-dropdown-item[data-view="appraisal"]');
    window.__msLog.push("nav-appraisal=" + !!navAppraisal);
    if (navAppraisal) { navAppraisal.click(); await wait(3000); }
    const detailsTab = document.querySelector('[data-atab="details"]');
    if (detailsTab) { detailsTab.click(); await wait(3000); }
    const mapEl = document.querySelector("#ap-map");
    chk("map-rendered", !!mapEl, "ap-map=" + !!mapEl);
    const tiles = [...document.querySelectorAll(".leaflet-tile-pane img")].map(t => t.src).filter(Boolean);
    chk("has-tiles", tiles.length > 0, "tiles=" + tiles.length);
    const esri = tiles.filter(s => /arcgisonline/.test(s));
    const carto = tiles.filter(s => /cartocdn/.test(s));
    window.__msLog.push("sampleTile=" + (tiles[0] || "none"));
    chk("tiles-from-esri", esri.length > 0, "esri=" + esri.length + " sample=" + (tiles[0] || ""));
    chk("no-carto-tiles", carto.length === 0, "carto=" + carto.length);
    document.documentElement.setAttribute("data-theme", "dark");
    await wait(2000);
    const darkTiles = [...document.querySelectorAll(".leaflet-tile-pane img")].map(t => t.src).filter(Boolean);
    const darkEsri = darkTiles.filter(s => /Dark_Gray|arcgisonline/.test(s));
    window.__msLog.push("darkSampleTile=" + (darkTiles[0] || "none"));
    chk("dark-mode-uses-esri-dark", darkEsri.length > 0, "darkEsri=" + darkEsri.length + " sample=" + (darkTiles[0] || ""));
    window.__msOk = window.__msChecks.every(c => c.ok);
  } catch (e) {
    window.__msLog.push("caught: " + (e && e.message));
    window.__msChecks.push({ name: "runner", ok: false, detail: (e && e.message || e) });
    window.__msOk = false;
  }
  window.__msDone = true;
})();