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
    const nav = document.querySelector('#nav [data-view="deal"], [data-view="deal"].nav-item');
    if (nav) nav.click();
    await wait(2000);
    window.__msLog.push("deal-view=" + (!!document.querySelector("#content").innerHTML.match(/map|Deal/i) !== null));
    // go to appraisal details
    const nav2 = document.querySelector('#nav [data-view="appraisal"], [data-view="appraisal"].nav-item');
    if (nav2) nav2.click();
    await wait(2500);
    const detailsTab = document.querySelector('[data-atab="details"]');
    if (detailsTab) detailsTab.click();
    await wait(3000);
    const mapEl = document.querySelector("#ap-map");
    chk("map-rendered", !!mapEl, "ap-map=" + !!mapEl);
    if (!mapEl) { window.__msOsok = false; window.__msDone = true; return; }
    // zoom to max
    if (window.L && mapEl._leaflet_id) {
      const m = Object.values(window._mapRegistry || {}).find(e => e.map && e.map._container === mapEl);
      if (m) { m.map.setZoom(19); await wait(2000); }
    }
    const tiles = [...document.querySelectorAll(".leaflet-tile-pane img")].map(t => t.src).filter(Boolean);
    window.__msLog.push("z19 tiles=" + tiles.length + " sample=" + (tiles[0] || ""));
    // try very high zoom to simulate scroll-in past 19
    if (window.L && window._mapRegistry) {
      const m = Object.values(window._mapRegistry).find(e => e.map && e.map._container === mapEl);
      if (m) { m.map.setZoom(20); await wait(2000); }
    }
    const tiles20 = [...document.querySelectorAll(".leaflet-tile-pane img")].map(t => t.src).filter(Boolean);
    window.__msLog.push("z20 tiles=" + tiles20.length);
    window.__msOk = true;
  } catch (e) {
    window.__msLog.push("caught: " + (e && e.message));
    window.__msOk = false;
  }
  window.__msDone = true;
})();