"use strict";
/* Probe: what does the public Properties page actually render, with and
 * without the state filter the nav link hard-codes?
 *
 * Usage: node tools/probe_properties.js
 */
const BASE = "http://127.0.0.1:8931/index.html";
const ROUTES = ["#/search", "#/search?state=Batangas", "#/home"];

function loadPw() {
  try { return require("../market-scan/worker/node_modules/playwright-core"); }
  catch (e) { return require("playwright-core"); }
}

function readInPage() {
  const api = window.ESREALTY_API_BASE;
  const cards = Array.from(document.querySelectorAll(".sf-property-card"));
  return {
    api,
    resultsBar: (document.querySelector(".sf-results-bar p") || {}).textContent || "",
    cardCount: cards.length,
    cardTitles: cards.map(c => ((c.querySelector("h4") || {}).textContent || "").trim()),
    emptyVisible: !!document.querySelector(".sf-empty"),
    emptyHeading: (document.querySelector(".sf-empty h3") || {}).textContent || "",
    emptyBody: (document.querySelector(".sf-empty p") || {}).textContent || "",
    /* which filters are active, and is the state filter visible to the user? */
    filterFields: Array.from(document.querySelectorAll(".sf-filter-stick label, .sf-filter-stick select, .sf-filter-stick input")).map(l => {
      const s = l.querySelector("select, input");
      return (l.textContent || "").trim().slice(0, 28) + " = " + (s ? (s.value || "(empty)") : "?");
    }),
    heroCards: document.querySelectorAll(".sf-property-grid .sf-property-card").length
  };
}

(async () => {
  const { chromium } = loadPw();
  const browser = await chromium.launch({ headless: true });
  const ctx = await browser.newContext({ viewport: { width: 1400, height: 900 } });
  const page = await ctx.newPage();
  const netlog = [];
  page.on("response", async r => {
    const u = r.url();
    if (u.indexOf("listing-api") > -1) netlog.push(r.status() + " " + u.replace(/^https?:\/\/[^/]+/, ""));
  });
  page.on("console", m => { if (m.type() === "error") netlog.push("CONSOLE " + m.text().slice(0, 120)); });

  for (const r of ROUTES) {
    netlog.length = 0;
    await page.goto(BASE + r, { waitUntil: "domcontentloaded", timeout: 60000 });
    await page.waitForFunction(
      () => window.__ESREALTY_READY === true || (document.body && !document.body.classList.contains("preload")),
      null, { timeout: 25000, polling: 100 }
    ).catch(() => {});
    await page.waitForTimeout(3200);
    const info = await page.evaluate(readInPage);
    process.stdout.write("=== " + r + " ===\n");
    process.stdout.write("  results bar : " + info.resultsBar.replace(/\s+/g, " ").trim() + "\n");
    process.stdout.write("  cards       : " + info.cardCount + " " + JSON.stringify(info.cardTitles) + "\n");
    process.stdout.write("  empty shown : " + info.emptyVisible + (info.emptyVisible ? '  ("' + info.emptyHeading + '")' : "") + "\n");
    if (info.emptyVisible) process.stdout.write("  empty body  : " + String(info.emptyBody).replace(/\s+/g, " ").trim().slice(0, 120) + "\n");
    process.stdout.write("  filters     : " + info.filterFields.join(" | ") + "\n");
    process.stdout.write("  network     : " + netlog.join(" ; ") + "\n\n");
  }
  await browser.close();
})();
