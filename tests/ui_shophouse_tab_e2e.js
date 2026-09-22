"use strict";
window.__msChecks = [];
window.__msDone = false;
function chk(n, ok, d) { window.__msChecks.push({ name: n, ok: !!ok, detail: d || "" }); }
(async () => {
  try {
    const wait = ms => new Promise(r => setTimeout(r, ms));

    const navLinks = Array.from(document.querySelectorAll(".sf-nav a, [data-sf-menu-panel] a")).map(a => a.getAttribute("href"));
    chk("nav-shophouse-desktop", navLinks.includes("#/shophouse"), navLinks.join(","));
    chk("nav-shophouse-twice", navLinks.filter(h => h === "#/shophouse").length === 2, "count=" + navLinks.filter(h => h === "#/shophouse").length);

    location.hash = "#/shophouse";
    await wait(3500);

    const eyebrow = document.querySelector(".sf-hero .sf-eyebrow");
    chk("shophouse-hero", !!document.querySelector(".sf-hero"), "hero=" + !!document.querySelector(".sf-hero"));
    chk("shophouse-eyebrow", !!eyebrow && eyebrow.textContent === "PHILIPPINE SHOPHOUSE SPECIALISTS", "text=" + (eyebrow && eyebrow.textContent));
    chk("shophouse-h1", (document.querySelector(".sf-hero h1") || {}).textContent === "Shophouses that work harder.", "text=" + (document.querySelector(".sf-hero h1") || {}).textContent);
    chk("shophouse-marquee", !!document.querySelector(".sf-marquee .sf-marquee-track span"), "marquee=" + !!document.querySelector(".sf-marquee .sf-marquee-track span"));
    chk("shophouse-why-grid", document.querySelectorAll(".sf-why-card").length === 4, "cards=" + document.querySelectorAll(".sf-why-card").length);
    chk("shophouse-construction", !!document.querySelector(".sf-construction-track"), "construction=" + !!document.querySelector(".sf-construction-track"));
    chk("shophouse-testimonials", !!document.querySelector(".sf-testimonials"), "t=" + !!document.querySelector(".sf-testimonials"));
    chk("shophouse-guide-form", !!document.querySelector("[data-sf-guide]"), "guide=" + !!document.querySelector("[data-sf-guide]"));
    await wait(1200);
    chk("shophouse-featured-cards", document.querySelectorAll(".sf-property-grid .sf-property-card").length > 0, "cards=" + document.querySelectorAll(".sf-property-grid .sf-property-card").length);
    chk("shophouse-no-estimator", !document.querySelector("#sf-estimator"), "est=" + !!document.querySelector("#sf-estimator"));
    chk("shophouse-why-light-bg", !/rgba\(0, 0, 0, 0\)/.test(getComputedStyle(document.querySelector(".sf-why-grid")).backgroundColor) ? "non-transparent" : "transparent", "bg=" + getComputedStyle(document.querySelector(".sf-why-grid")).backgroundColor);

    location.hash = "#/project-bt";
    await wait(3200);
    chk("bt-intro", !!document.querySelector(".bt-intro"), "intro=" + !!document.querySelector(".bt-intro"));
    chk("bt-band-gone-marquee", !document.querySelector(".sf-marquee"), "marquee=" + !!document.querySelector(".sf-marquee"));
    chk("bt-band-gone-story", !document.querySelector(".bt-shophouse-story"), "story=" + !!document.querySelector(".bt-shophouse-story"));
    chk("bt-band-gone-construction", !document.querySelector(".sf-construction"), "construction=" + !!document.querySelector(".sf-construction"));
    chk("bt-band-gone-roi", !document.querySelector(".sf-roi"), "roi=" + !!document.querySelector(".sf-roi"));
    chk("bt-original-tiers", !!document.querySelector(".bt-tiers"), "tiers=" + !!document.querySelector(".bt-tiers"));
    chk("bt-original-thanks", !!document.querySelector(".bt-thanks"), "thanks=" + !!document.querySelector(".bt-thanks"));

    location.hash = "#/home";
    await wait(900);
    chk("home-still-value-guide", (document.querySelector(".sf-est-hero h1") || {}).textContent.indexOf("property worth?") > 0, "h1=" + (document.querySelector(".sf-est-hero h1") || {}).textContent);
  } catch (e) {
    window.__msChecks.push({ name: "runner", ok: false, detail: (e && e.message || e) });
  }
  window.__msOk = window.__msChecks.every(c => c.ok);
  window.__msDone = true;
})();