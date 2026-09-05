"use strict";
window.__msChecks = [];
window.__msDone = false;
function chk(n, ok, d) { window.__msChecks.push({ name: n, ok: !!ok, detail: d || "" }); }
(async () => {
  try {
    const wait = ms => new Promise(r => setTimeout(r, ms));
    location.hash = "#/project-bt";
    await wait(3000);
    const img = document.querySelector(".bt-hero-media img");
    chk("bt-hero-img-present", !!img, "src=" + (img && img.src));
    chk("bt-hero-uses-local-jpg", !!img && /bt1\.jpg/i.test(img.src), "src=" + (img && img.src));
    chk("bt-hero-not-unsplash", !!img && !/unsplash/i.test(img.src), "src=" + (img && img.src));
    const loaded = img && img.complete && img.naturalWidth > 0;
    chk("bt-hero-image-loaded", !!loaded, "complete=" + (img && img.complete) + " w=" + (img && img.naturalWidth));
    window.__msOk = window.__msChecks.every(c => c.ok);
  } catch (e) {
    window.__msChecks.push({ name: "runner", ok: false, detail: (e && e.message || e) });
    window.__msOk = false;
  }
  window.__msDone = true;
})();