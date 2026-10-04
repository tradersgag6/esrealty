"use strict";
/* Screenshot the simplified "About this estimate" panel, collapsed and expanded,
 * at desktop and the two narrowest supported widths. Run with the local server
 * already listening on :8931.
 *
 *   node tools/review_about_panel.js
 */
let chromium = null;
try { chromium = require("../market-scan/worker/node_modules/playwright-core"); } catch (e) { chromium = require("playwright-core"); }
const { chromium: pw } = chromium;
const fs = require("fs");
const path = require("path");

const OUT = path.join(__dirname, "..", "docs", "sea-reference-indexing", "about-panel");
fs.mkdirSync(OUT, { recursive: true });

const VIEWPORTS = [
  { label: "desktop", w: 1440, h: 900 },
  { label: "tablet", w: 768, h: 1024 },
  { label: "mobile", w: 390, h: 844 },
  { label: "mobile-xs", w: 320, h: 667 }
];

const seed = async (page) => {
  await page.goto("http://127.0.0.1:8931/index.html#/home", { waitUntil: "domcontentloaded", timeout: 45000 });
  await page.waitForFunction("!!window.ESREALTY_EST", null, { timeout: 45000 });
  await page.evaluate(async () => {
    const api = window.ESREALTY_EST;
    await api.loadData();
    const state = api._state();
    Object.assign(state, {
      municipality: "BAUAN", municipalitySlug: "bauan", barangay: "POBLACION III",
      streetKey: "binay st ressurreccion st", streetLabel: "BINAY ST (RESSURRECCION ST)",
      classification: "RR", classificationUse: "residential", area: 100,
      type: "vacant_lot", purpose: "Buying", openPanels: {}
    });
    state.muniRow = api.municipalityRow("BAUAN");
    state.muniData = await api.loadMunicipality("bauan");
    api.debug.render(1);
  });
  await page.waitForTimeout(700);
};

/* The storefront finishes a two-phase boot (shell, then featured listings) and
 * renderLayout() can also replace the card's innerHTML. A locator resolved a
 * moment earlier can therefore be detached by the time Playwright screenshots
 * it, which is a capture race, not a layout defect. Re-query and retry. */
async function shootCard(page, file) {
  for (let attempt = 0; attempt < 4; attempt++) {
    try {
      await page.locator("[data-est-card]").screenshot({ path: file, timeout: 15000 });
      return true;
    } catch (e) {
      if (attempt === 3) throw e;
      await page.waitForTimeout(500);
      await page.evaluate(() => { const c = document.querySelector("[data-est-card]"); if (c) c.setAttribute("data-shot", ""); });
    }
  }
  return false;
}

(async () => {
  let browser = null;
  try { browser = await pw.launch({ headless: true }); }
  catch (e) { browser = await pw.launch({ headless: true, channel: "chrome" }); }
  const results = [];
  for (const vp of VIEWPORTS) {
    const context = await browser.newContext({ viewport: { width: vp.w, height: vp.h }, deviceScaleFactor: 1 });
    const page = await context.newPage();
    try {
      await seed(page);
      await shootCard(page, path.join(OUT, `about-collapsed_${vp.label}.png`));
      results.push("OK   collapsed_" + vp.label);

      await page.evaluate(() => {
        document.querySelector(".sf-est-about").open = true;
        const ref = document.querySelector("details.sf-est-reference-disclosure");
        const cost = document.querySelector("details.sf-est-cost-inputs");
        if (ref) ref.open = true;
        if (cost) cost.open = true;
      });
      await page.waitForTimeout(400);
      await shootCard(page, path.join(OUT, `about-expanded_${vp.label}.png`));
      results.push("OK   expanded_" + vp.label);

      const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
      results.push((overflow > 0 ? "FAIL " : "OK   ") + `overflow ${vp.label} = ${overflow}px`);
    } catch (e) {
      results.push("ERR  " + vp.label + ": " + String(e.message).split("\n")[0]);
    }
    await context.close();
  }
  await browser.close();
  console.log(results.join("\n"));
  process.exit(results.some(r => /^(FAIL|ERR)/.test(r)) ? 1 : 0);
})();