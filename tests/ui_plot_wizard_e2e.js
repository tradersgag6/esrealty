"use strict";
window.__msChecks = [];
window.__msLog = [];
window.__msDone = false;
function chk(n, ok, d) { window.__msChecks.push({ name: n, ok: !!ok, detail: d || "" }); }
function storedState() { try { return JSON.parse(localStorage.getItem("esrealty_v1") || "{}"); } catch (e) { return {}; } }
async function wait(ms) { return new Promise(r => setTimeout(r, ms)); }
(async () => {
  try {
    window.__errors = [];
    const origErr = console.error;
    console.error = function () { window.__errors.push([].slice.call(arguments).map(String).join(" ")); origErr.apply(console, arguments); };
    const origWarn = console.warn;
    console.warn = function () { window.__errors.push("WARN " + [].slice.call(arguments).map(String).join(" ")); origWarn.apply(console, arguments); };
    const tBtn = document.querySelector("#auth-test");
    if (tBtn) { tBtn.click(); await wait(1500); }
    document.querySelector("#auth-role").value = "super-admin";
    const nd = document.querySelector("#tb-new-deal");
    if (nd) nd.click();
    await wait(800);
    const step2 = document.querySelector('[data-step="2"]');
    if (step2) step2.click();
    await wait(3500);
    const mapEl = document.querySelector("#wz-map");
    chk("wz-map-rendered", !!mapEl, "wz-map=" + !!mapEl);
    chk("wz-plot-toggle-btn", !!document.querySelector("#wz-map-plotmode"), "plotmode btn exists");
    chk("wz-plot-status-box", !!document.querySelector("#wz-map-plot"), "plot status box exists");
    chk("wz-corners-box", !!document.querySelector("#wz-map-corners"), "corners box exists");
    if (!mapEl) { window.__msOk = window.__msChecks.every(c => c.ok); window.__msDone = true; return; }
    for (let i = 0; i < 20; i++) { if (mapEl.classList.contains("leaflet-container")) break; await wait(300); }
    chk("wz-leaflet-attached", mapEl.classList.contains("leaflet-container") || !!mapEl.querySelector(".leaflet-pane"), "leaflet attached");
    const plotBtn = document.querySelector("#wz-map-plotmode");
    if (plotBtn) plotBtn.click();
    await wait(800);
    window.__msLog.push("plotmode-on=" + (plotBtn && plotBtn.classList.contains("on")));
    chk("wz-plotmode-toggled", !!(plotBtn && plotBtn.classList.contains("on")), "plot btn on");
    const containerR = mapEl.getBoundingClientRect();
    const cx = containerR.left + containerR.width / 2;
    const cy = containerR.top + containerR.height / 2;
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
    const st = storedState();
    const prop = st.current ? st.current.property || {} : (st.deal && st.deal.property) || {};
    window.__msLog.push("wz-prop-keys=" + Object.keys(prop).filter(k => k.includes("land") || k.includes("plot")).join(",") + " len=" + (prop.landPolygon || []).length);
    chk("stored-current-keys", !!st.current, "has current: " + !!st.current);
    chk("wz-autosaved-landPolygon", Array.isArray(prop.landPolygon) && prop.landPolygon.length === 4, "len=" + (prop.landPolygon || []).length);
    chk("wz-autosaved-plotArea", typeof prop.plotArea === "number" && prop.plotArea > 0, "area=" + prop.plotArea);
    const statusEl = document.querySelector("#wz-map-plot");
    const statusTxt = statusEl ? statusEl.textContent : "";
    chk("wz-status-has-area", /sqm/.test(statusTxt), "status area");
    chk("wz-corners-table", !!document.querySelector("#wz-map-corners .plot-corner-table"), "wizard corners table");
    chk("wz-vtx-markers", document.querySelectorAll("#wz-map .plot-vtx").length >= 3, "vtx cnt");
    window.__msOk = window.__msChecks.every(c => c.ok);
  } catch (e) {
    window.__msLog.push("caught: " + (e && e.message));
    window.__msChecks.push({ name: "runner", ok: false, detail: (e && e.message || e) });
    window.__msOk = false;
  }
  window.__msLog.push("errors=" + JSON.stringify(window.__errors.slice(0, 6)));
  window.__msDone = true;
})();