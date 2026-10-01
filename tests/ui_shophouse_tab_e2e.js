"use strict";
/* Shophouse and Project B.T are temporarily closed.
 *
 * This suite previously asserted that the shophouse marketing page rendered.
 * It now guards the CLOSED state instead: that both destinations resolve to the
 * coming-soon page, that no legacy campaign markup or copy leaks anywhere, and
 * that the parked render functions and their CSS are still present so a relaunch
 * is a one-line change rather than a rewrite.
 */
window.__msChecks = [];
window.__msDone = false;
function chk(n, ok, d) { window.__msChecks.push({ name: n, ok: !!ok, detail: d || "" }); }

(async () => {
  try {
    const wait = ms => new Promise(r => setTimeout(r, ms));
    const go = async (hash, ms) => { location.hash = hash; await wait(ms || 1700); };

    // Strings that only ever appeared in the parked shophouse / Project B.T copy.
    const LEAKED = [
      "Shophouses that work harder",
      "PHILIPPINE SHOPHOUSE SPECIALISTS",
      "Shophouse Investment Guide",
      "a shophouse specialist",
      "shophouse specialist"
    ];

    const checkNoLeak = label => {
      const text = document.body.innerText || "";
      LEAKED.forEach(s => chk(label + "-no-leak-" + s.toLowerCase().replace(/[^a-z]/g, ""), text.toLowerCase().indexOf(s.toLowerCase()) === -1, "found: " + s));
    };

    /* ---- #/shophouse resolves to the coming-soon page ---- */
    await go("#/shophouse", 1900);
    chk("closed-shophouse-hash", location.hash === "#/project-bt", "hash=" + location.hash);
    chk("closed-shophouse-coming-soon", !!document.querySelector(".sf-cs"), "cs=" + !!document.querySelector(".sf-cs"));
    chk("closed-no-legacy-hero", !document.querySelector(".sf-hero"), "sf-hero leaked");
    chk("closed-no-marquee", !document.querySelector(".sf-marquee"), "sf-marquee leaked");
    chk("closed-no-why-grid", !document.querySelector(".sf-why-grid"), "sf-why-grid leaked");
    chk("closed-no-construction", !document.querySelector(".sf-construction"), "sf-construction leaked");
    chk("closed-no-roi", !document.querySelector(".sf-roi"), "sf-roi leaked");
    chk("closed-no-testimonials", !document.querySelector(".sf-testimonials"), "sf-testimonials leaked");
    chk("closed-no-guide-form", !document.querySelector("[data-sf-guide]"), "parked guide download form leaked");
    chk("closed-no-bt-markup", !document.querySelector("[class^='bt-'], [class*=' bt-']"), "bt-* leaked");
    chk("closed-no-estimator-on-coming-soon", !document.querySelector("#sf-estimator"), "estimator present on coming-soon");
    checkNoLeak("closed-shophouse");

    /* ---- #/project-bt is the single closed destination ---- */
    await go("#/project-bt", 1700);
    chk("closed-projectbt-coming-soon", !!document.querySelector(".sf-cs"), "cs=" + !!document.querySelector(".sf-cs"));
    chk("closed-projectbt-no-tiers", !document.querySelector(".bt-tiers"), "bt-tiers leaked");
    chk("closed-projectbt-no-thanks", !document.querySelector(".bt-thanks"), "bt-thanks leaked");
    chk("closed-projectbt-no-story", !document.querySelector(".bt-shophouse-story"), "bt-shophouse-story leaked");
    checkNoLeak("closed-projectbt");

    /* ---- coming-soon page must be reachable and not a dead end ---- */
    chk("closed-has-notify", !!document.querySelector("[data-sf-notify]"), "no notify form");
    chk("closed-has-way-out", document.querySelectorAll(".sf-cs-actions a").length >= 2, "actions=" + document.querySelectorAll(".sf-cs-actions a").length);
    chk("closed-notify-status-live", (() => {
      const s = document.querySelector("[data-sf-notify] .sf-form-status");
      return !!s && s.getAttribute("aria-live") === "polite";
    })(), "notify status is not aria-live");

    /* ---- parked assets still exist, so relaunch is cheap ---- */
    const src = await fetch("js/storefront.js").then(r => r.text());
    chk("parked-shophouse-page-fn", /function shophousePage\s*\(/.test(src), "shophousePage() was deleted - relaunch now needs a rewrite");
    chk("parked-projectbt-page-fn", /function projectBtPage\s*\(/.test(src), "projectBtPage() was deleted - relaunch now needs a rewrite");
    chk("parked-documented", /PARKED FOR RELAUNCH/.test(src), "parked marker comment missing");

    /* The parked CSS now lives in css/storefront-legacy.css, extracted from
       styles.css by tools/classify_styles.js. The invariant that matters is
       that the rules are still shipped AND actually loaded, not which file
       they happen to sit in - a test hardcoded to one filename breaks every
       time the split is reshuffled. */
    const PARKED_SELECTORS = [".sf-marquee", ".sf-why-grid", ".sf-roi", ".sf-construction", ".bt-tiers"];
    const loadedSheets = Array.from(document.styleSheets).map(s => (s.href || "").split("/").pop());
    chk("parked-css-sheet-loaded", loadedSheets.indexOf("storefront-legacy.css") > -1, "loaded sheets: " + loadedSheets.join(", "));

    let parkedSheetHasRules = false;
    let parkedSheetHasAll = false;
    for (const name of loadedSheets) {
      if (name !== "storefront-legacy.css" && name !== "styles.css") continue;
      let cssText = "";
      try { cssText = await fetch("css/" + name).then(r => r.text()); } catch (e) { continue; }
      if (!cssText) continue;
      parkedSheetHasRules = true;
      if (PARKED_SELECTORS.every(sel => cssText.indexOf(sel) > -1)) { parkedSheetHasAll = true; break; }
    }
    chk("parked-css-present", parkedSheetHasRules, "neither styles.css nor storefront-legacy.css was readable");
    chk("parked-css-retained", parkedSheetHasAll,
      "the parked shophouse / Project B.T rules are gone from every loaded stylesheet while the render functions are still parked");

    /* ---- home is unaffected by the closure ---- */
    await go("#/home", 1800);
    chk("home-still-value-guide", (document.querySelector(".sf-est-hero h1") || {}).textContent.indexOf("property worth?") > 0, "h1=" + (document.querySelector(".sf-est-hero h1") || {}).textContent);
    checkNoLeak("home");
  } catch (e) {
    window.__msChecks.push({ name: "runner", ok: false, detail: (e && e.message || e) });
  }
  window.__msOk = window.__msChecks.every(c => c.ok);
  window.__msDone = true;
})();
