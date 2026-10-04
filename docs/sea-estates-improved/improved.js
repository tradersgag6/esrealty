"use strict";
// Presentation-only DOM adaptation of the original app. Keep mounted controls.
(() => {
  const path = "docs/sea-estates-improved/";
  let scheduled = false;
  function brand(root) {
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
    const nodes = [];
    while (walker.nextNode()) if (/ES[ -]+REALTY/i.test(walker.currentNode.nodeValue)) nodes.push(walker.currentNode);
    nodes.forEach(node => { node.nodeValue = node.nodeValue.replace(/ES[ -]+REALTY/gi, "SEA Estates"); });
    root.querySelectorAll(".sf-brand-mark").forEach(el => { el.textContent = "SEA"; });
    root.querySelectorAll(".sf-brand small").forEach(el => { el.textContent = "Property & local guidance"; });
    root.querySelectorAll("[aria-label]").forEach(el => {
      const old = el.getAttribute("aria-label"); if (/ES Realty/i.test(old)) el.setAttribute("aria-label", old.replace(/ES Realty/gi, "SEA Estates"));
    });
  }
  function openGuide() {
    const disclosure = document.getElementById("sea-guide-disclosure");
    if (disclosure) disclosure.open = true;
    const target = document.getElementById("sf-estimator");
    if (target) target.scrollIntoView({ behavior: "auto", block: "start" });
  }
  function adapt() {
    const site = document.querySelector(".sf-site");
    if (!site) return;
    if (!document.getElementById("sea-review-banner")) {
      const bar = document.createElement("aside"); bar.id = "sea-review-banner";
      bar.innerHTML = '<div><strong>Clear Horizon · Improved original</strong><span id="sea-preview-notice" role="status">Live calculator and inventory reads. Submissions and account writes disabled.</span></div><a href="index.html#/home" target="_blank" rel="noopener">Compare original ↗</a>';
      document.body.prepend(bar);
    }
    brand(site);
    document.title = "SEA Estates — Improved-original design preview";
    site.classList.add("sea-improved");
    site.querySelectorAll('.sf-nav a[href="#/property-value"], .sf-menu a[href="#/property-value"]').forEach(el => {
      el.textContent = "BATANGAS VALUE GUIDE"; el.href = "#/home"; el.setAttribute("data-est-services", "");
    });
    const intro = site.querySelector("#sf-intro");
    if (intro && !intro.hasAttribute("data-sea-adapted")) {
      intro.setAttribute("data-sea-adapted", "");
      const calculator = intro.querySelector("#sf-estimator");
      const copy = intro.querySelector(".sf-est-hero-copy");
      copy.innerHTML = '<div class="sea-hero-heading"><p class="sf-eyebrow">SEA ESTATES · PROPERTY & LOCAL GUIDANCE</p><h1>Your next property decision,<br> <em>made clearer.</em></h1><p class="sea-lede">Find a property that fits your plans. Or start with a clearer understanding of your property’s value.</p></div><div class="sea-mobile-paths"><a href="#/search">Properties →</a><button type="button" data-sea-guide>BATANGAS VALUE GUIDE →</button></div><div class="sea-entry-grid"><article class="sea-entry sea-entry-properties"><span class="sea-entry-index">01 / FIND YOUR PLACE</span><h2>Properties</h2><p>Explore available homes, land and spaces in the locations we serve.</p><form class="sea-quick-search" data-sf-search><label>Where are you looking?<input name="city" placeholder="City or municipality" autocomplete="off"></label><button type="submit">Search properties <span aria-hidden="true">→</span></button></form><a href="#/search" class="sea-secondary-link">Browse all properties →</a></article><article class="sea-entry sea-entry-guide"><span class="sea-entry-index">02 / KNOW YOUR STARTING POINT</span><h2>BATANGAS<br> VALUE GUIDE</h2><p>See the official BIR zonal reference alongside a separate SEA Estates planning estimate.</p><button type="button" data-sea-guide>Start the free value guide <span aria-hidden="true">→</span></button><small>Current guide coverage: Batangas.<br>A planning guide, not a certified appraisal.</small></article></div>';
      if (calculator) {
        const container = document.createElement("section"); container.className = "sea-guide-section";
        container.innerHTML = '<div class="sea-guide-section-head"><div><p class="sf-eyebrow">BATANGAS VALUE GUIDE</p><h2>The original guide.<br><em>A clearer experience.</em></h2></div><p>Your details match a BIR reference. The estimate, range and calculation details remain separate and transparent.</p></div><details id="sea-guide-disclosure"><summary>Open the property value calculator <span aria-hidden="true">＋</span></summary></details>';
        container.querySelector("details").appendChild(calculator);
        intro.insertAdjacentElement("afterend", container);
      }
      const main = site.querySelector(".sf-main"), featured = main.querySelector(".sf-featured"), guide = main.querySelector(".sea-guide-section"), services = main.querySelector(".sf-services"), summary = main.querySelector(".sf-guide-summary");
      if (featured) intro.insertAdjacentElement("afterend", featured);
      if (guide && featured) featured.insertAdjacentElement("afterend", guide);
      if (services && summary) summary.insertAdjacentElement("afterend", services);
      const process = main.querySelector(".sf-process");
      if (process && !main.querySelector(".sea-bt-teaser")) {
        const bt = document.createElement("section"); bt.className = "sea-bt-teaser";
        bt.innerHTML = '<div class="sea-bt-mark" aria-hidden="true">B.T.</div><div><p class="sf-eyebrow">A NEW CHAPTER</p><h2>Project B.T. <span>Coming Soon</span></h2><p>Something is taking shape. We’ll share the project details when they’re ready.</p><a class="sf-outline-btn" href="#/project-bt">Explore Project B.T. →</a></div>';
        process.insertAdjacentElement("afterend", bt);
      }
      const contact = main.querySelector("#sf-contact .sf-eyebrow"); if (contact) contact.textContent = "PROPERTY GUIDANCE, WHERE YOU NEED IT";
    }
    site.querySelectorAll(".sf-card-meta").forEach(meta => {
      const facts = [...meta.querySelectorAll("b")];
      if (facts.length && facts.every(el => el.textContent.trim() === "0")) {
        meta.innerHTML = '<span class="sea-missing-facts">Ask for complete property details</span>';
      }
    });
    site.querySelectorAll(".sf-sticky").forEach(el => { el.hidden = true; });
    // Click handlers own scrolling. Do not repeatedly scroll from the observer.
    window.SEA_PREVIEW.ready = true;
  }
  function queue() { if (scheduled) return; scheduled = true; requestAnimationFrame(() => { scheduled = false; observer.disconnect(); adapt(); observer.observe(document.body, { childList: true, subtree: true }); }); }
  const observer = new MutationObserver(queue);
  document.addEventListener("click", event => {
    if (event.target.closest("[data-sea-guide]")) { event.preventDefault(); openGuide(); }
    if (event.target.closest("[data-est-services]")) setTimeout(openGuide, 180);
  }, true);
  window.addEventListener("hashchange", () => { queue(); });
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", queue); else queue();
})();
