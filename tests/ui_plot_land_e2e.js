"use strict";
window.__msChecks = [];
window.__msLog = [];
window.__msDone = false;
function storedState() { try { return JSON.parse(localStorage.getItem("esrealty_v1") || "{}"); } catch (e) { return {}; } }
function chk(n, ok, d) { window.__msChecks.push({ name: n, ok: !!ok, detail: d || "" }); }
async function wait(ms) { return new Promise(r => setTimeout(r, ms)); }
(async () => {
  try {
    const tBtn = document.querySelector("#auth-test");
    if (tBtn) { tBtn.click(); await wait(1500); }
    const nav = document.querySelector('#nav [data-view="appraisal"], [data-view="appraisal"].nav-item, .nav-dropdown-item[data-view="appraisal"]');
    window.__msLog.push("nav-appraisal=" + !!nav);
    if (nav) { nav.click(); await wait(2500); }
    const detailsTab = document.querySelector('[data-atab="details"]');
    if (detailsTab) { detailsTab.click(); await wait(3000); }
    const mapEl = document.querySelector("#ap-map");
    chk("map-rendered", !!mapEl, "ap-map=" + !!mapEl);
    chk("plot-toggle-btn", !!document.querySelector("#ap-map-plotmode"), "plotmode btn exists");
    chk("plot-status-box", !!document.querySelector("#ap-map-plot"), "plot status box exists");
    chk("corners-box", !!document.querySelector("#ap-map-corners"), "corners box exists");
    if (!mapEl || !window.L) { window.__msOk = false; window.__msDone = true; return; }
    // NOTE: the app's _mapRegistry is closure-scoped; interact purely via DOM events.
    // switch to Plot Land mode
    const plotBtn = document.querySelector("#ap-map-plotmode");
    if (plotBtn) plotBtn.click();
    await wait(500);
    // Use the map container's bounding box to click 4 corners of a square.
    const containerR = mapEl.getBoundingClientRect();
    const cx = containerR.left + containerR.width / 2;
    const cy = containerR.top + containerR.height / 2;
    window.__msLog.push("mapCenter px=" + Math.round(cx) + "," + Math.round(cy));
    const clicks = [
      [cx - 60, cy - 40],
      [cx + 60, cy - 40],
      [cx + 60, cy + 40],
      [cx - 60, cy + 40]
    ];
    for (const [x, y] of clicks) {
      mapEl.dispatchEvent(new MouseEvent("click", { bubbles: true, clientX: x, clientY: y, button: 0 }));
      await wait(300);
    }
    await wait(800);
    const dst = storedState();
    const pd = dst.appraisal ? dst.appraisal.propertyDetails || {} : {};
    window.__msLog.push("polygonLen=" + (pd.landPolygon || []).length);
    chk("autosaved-landPolygon", Array.isArray(pd.landPolygon) && pd.landPolygon.length >= 3, "len=" + (pd.landPolygon || []).length);
    chk("autosaved-plotArea", typeof pd.plotArea === "number" && pd.plotArea > 0, "area=" + pd.plotArea);
    const statusEl = document.querySelector("#ap-map-plot");
    const statusTxt = statusEl ? statusEl.textContent : "";
    window.__msLog.push("status=" + statusTxt.slice(0, 160));
    chk("status-has-area", /sqm/.test(statusTxt), "area in status");
    chk("status-has-perimeter", /m\s/.test(statusTxt), "perimeter in status");
    chk("status-has-corner-word", /corners/.test(statusTxt), "corners title");
    chk("undo-btn", !!document.querySelector("#ap-map-undo"), "undo");
    chk("clear-btn", !!document.querySelector("#ap-map-clear"), "clear");
    chk("finish-btn", !!document.querySelector("#ap-map-finish"), "finish");
    const table = document.querySelector("#ap-map-corners .plot-corner-table");
    chk("corner-table-rendered", !!table, "corners table present");
    if (table) {
      const rows = table.querySelectorAll("tbody tr").length;
      chk("corner-table-row-count", rows >= 5, "rows=" + rows);
      const head = document.querySelector("#ap-map-corners .plot-corner-head") || {};
      chk("corner-table-head", /Corner table/.test(head.textContent || ""), "head present");
    }
    const vtx = document.querySelectorAll("#ap-map .plot-vtx").length;
    window.__msLog.push("vtxMarkers=" + vtx);
    chk("vertex-markers", vtx >= 3, "vtx=" + vtx);
    // finish
    const finish = document.querySelector("#ap-map-finish");
    if (finish) { finish.click(); await wait(600); }
    const edges = document.querySelectorAll("#ap-map .plot-edge-label").length;
    window.__msLog.push("edgeLabels=" + edges);
    chk("edge-labels", edges >= 3, "edges=" + edges);
    // vertex markers persist after finish
    const vtx2 = document.querySelectorAll("#ap-map .plot-vtx").length;
    chk("vtx-after-finish", vtx2 >= 3, "vtx2=" + vtx2);
    // verify it stays saved after finish (no clear)
    const pd2 = storedState().appraisal ? storedState().appraisal.propertyDetails || {} : {};
    chk("kept-after-finish", Array.isArray(pd2.landPolygon) && pd2.landPolygon.length >= 3, "len=" + (pd2.landPolygon || []).length);
    window.__msOk = window.__msChecks.every(c => c.ok);
  } catch (e) {
    window.__msLog.push("caught: " + (e && e.message));
    window.__msChecks.push({ name: "runner", ok: false, detail: (e && e.message || e) });
    window.__msOk = false;
  }
  window.__msDone = true;
})();