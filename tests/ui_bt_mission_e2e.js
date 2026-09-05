"use strict";
window.__msChecks = [];
window.__msDone = false;
function chk(n, ok, d) { window.__msChecks.push({ name: n, ok: !!ok, detail: d || "" }); }
(async () => {
  try {
    const wait = ms => new Promise(r => setTimeout(r, ms));
    location.hash = "#/project-bt";
    await wait(3000);
    const caption = document.querySelector(".bt-image-caption");
    const conceptImg = document.querySelector(".bt-mission-image img");
    const heroImg = document.querySelector(".bt-hero-media img");
    chk("mission-caption-present", !!caption, "text=" + (caption && caption.textContent.trim()));
    chk("mission-image-is-bt2", !!conceptImg && /bt2\.jpg/i.test(conceptImg.src), "src=" + (conceptImg && conceptImg.src));
    chk("mission-image-loaded", !!conceptImg && conceptImg.complete && conceptImg.naturalWidth > 0, "complete=" + (conceptImg && conceptImg.complete) + " w=" + (conceptImg && conceptImg.naturalWidth));
    chk("hero-still-bt1", !!heroImg && /bt1\.jpg/i.test(heroImg.src), "src=" + (heroImg && heroImg.src));
    window.__msOk = window.__msChecks.every(c => c.ok);
  } catch (e) {
    window.__msChecks.push({ name: "runner", ok: false, detail: (e && e.message || e) });
    window.__msOk = false;
  }
  window.__msDone = true;
})();