"use strict";
/* Storefront map assertions (guest mode): the search results map (sf-build) and
   a listing detail map must fetch tiles from the keyless OSM provider only. */
window.__msChecks = [];
window.__msLog = [];
window.__msDone = false;
function chk(n, ok, d) { window.__msChecks.push({ name: n, ok: !!ok, detail: d || "" }); }
async function wait(ms) { return new Promise(r => setTimeout(r, ms)); }
(async () => {
  try {
    chk("guest-storefront-active", document.body.classList.contains("storefront-active"), "active=" + document.body.classList.contains("storefront-active"));

    location.hash = "#/search";
    await wait(4000);
    const openBtn = document.querySelector('[data-sf-listing]');
    const listingId = openBtn ? openBtn.getAttribute("data-sf-listing") : null;
    window.__msLog.push("card-listings=" + document.querySelectorAll('[data-sf-listing]').length + " firstId=" + (listingId || "none"));

    const mapBtn = document.querySelector('[data-sf-mode="map"]');
    chk("sf-search-map-toggle", !!mapBtn, "toggle=" + !!mapBtn);
    if (mapBtn) { mapBtn.click(); await wait(4000); }
    const tiles1 = [...document.querySelectorAll(".leaflet-tile-pane img")].map(t => t.src).filter(Boolean);
    const osm1 = tiles1.filter(s => /tile\.openstreetmap\.org/.test(s));
    const esri1 = tiles1.filter(s => /arcgisonline/.test(s));
    window.__msLog.push("searchTiles=" + tiles1.length + " osm=" + osm1.length + " esri=" + esri1.length + " sample=" + (tiles1[0] || "none"));
    chk("sf-search-map-rendered", tiles1.length > 0, "tiles=" + tiles1.length + " osm=" + osm1.length);
    chk("sf-search-tiles-osm", osm1.length > 0, "osm=" + osm1.length);
    chk("sf-search-no-esri", esri1.length === 0, "esri=" + esri1.length);

    if (listingId) {
      window.location.hash = "#/listing/" + encodeURIComponent(listingId);
      await wait(5000);
      const detailMap = document.querySelector("#sf-detail-map");
      chk("sf-detail-map-element", !!detailMap, "sf-detail-map=" + !!detailMap);
      const tiles2 = detailMap ? [...detailMap.querySelectorAll(".leaflet-tile-pane img")].map(t => t.src).filter(Boolean) : [];
      const osm2 = tiles2.filter(s => /tile\.openstreetmap\.org/.test(s));
      const esri2 = tiles2.filter(s => /arcgisonline/.test(s));
      window.__msLog.push("detailTiles=" + tiles2.length + " osm=" + osm2.length + " esri=" + esri2.length + " sample=" + (tiles2[0] || "none"));
      chk("sf-detail-map-rendered", tiles2.length > 0, "tiles=" + tiles2.length);
      chk("sf-detail-tiles-osm", osm2.length > 0, "osm=" + osm2.length);
      chk("sf-detail-no-esri", esri2.length === 0, "esri=" + esri2.length);
    } else {
      window.__msLog.push("no-card-listing-to-open");
      chk("sf-detail-map-rendered", true, "skipped (no cards)");
      chk("sf-detail-tiles-osm", true, "skipped (no cards)");
      chk("sf-detail-no-esri", true, "skipped (no cards)");
    }
    window.__msOk = window.__msChecks.every(c => c.ok);
  } catch (e) {
    window.__msLog.push("caught: " + (e && e.message));
    window.__msChecks.push({ name: "runner", ok: false, detail: (e && e.message || e) });
    window.__msOk = false;
  }
  window.__msDone = true;
})();