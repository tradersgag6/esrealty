"use strict";
const fs = require("fs"), path = require("path"), assert = require("assert");
const ROOT = path.resolve(__dirname, ".."), DIR = path.join(ROOT, "docs/sea-market-guide");
(async () => {
  assert(fs.existsSync(path.join(ROOT, "docs"))); fs.mkdirSync(DIR, { recursive: true });
  if (process.argv.includes("--suite")) {
    const run = require("child_process").spawnSync("powershell", ["-NoProfile", "-ExecutionPolicy", "Bypass", "-File", "tests/run_all.ps1"], { cwd: ROOT, encoding: "utf8", timeout: 1200000, maxBuffer: 12 * 1024 * 1024 });
    const output = (run.stdout || "") + (run.stderr || "");
    const name = fs.existsSync(path.join(DIR, "full-suite-recheck.log")) ? "full-suite-final.log" : fs.existsSync(path.join(DIR, "full-suite.log")) ? "full-suite-recheck.log" : "full-suite.log";
    fs.writeFileSync(path.join(DIR, name), output);
    console.log(output.slice(Math.max(0, output.indexOf("==== SUMMARY ===="))));
    if (run.error) throw run.error; assert.equal(run.status, 0, name); return;
  }
  const pw = require("../market-scan/worker/node_modules/playwright-core"), browser = await pw.chromium.launch({ headless: true });
  const captures = [], checks = [], errors = [];
  const check = (name, ok) => { checks.push({ name, ok }); assert(ok, name); };
  try {
    for (const width of [320, 390, 768, 1440]) {
      const context = await browser.newContext({ viewport: { width, height: 900 }, reducedMotion: "reduce" }), page = await context.newPage();
      page.on("pageerror", e => errors.push(e.message));
      await page.goto("http://127.0.0.1:8931/index.html#/home"); await page.waitForSelector("[data-est-muni]"); await page.waitForTimeout(3000);
      for (const purpose of ["Selling", "Buying", "Developer", "Project-sources"]) {
        const outcome = await page.evaluate(async purpose => {
          const api = window.ESREALTY_EST;
          const options = { municipality: "BAUAN", barangay: "POBLACION III", streetKey: "binay st ressurreccion st", classification: "RR", area: 100, type: "vacant_lot", purpose: purpose === "Selling" ? "Selling" : "Buying", salePrice: 3000000 };
          if (purpose === "Developer") Object.assign(options, { saleContext: "developer", developerFees: 100000 });
          if (purpose === "Project-sources") Object.assign(options, { municipality: "LIPA CITY", barangay: "PINAGKAWITAN", streetKey: "", type: "house_lot", floorArea: 67.56 });
          const result = await api.estimate(options);
          Object.assign(api._state(), options, { result }); api.debug.render(4);
          if (purpose === "Project-sources") { [...document.querySelectorAll(".sf-est-rsec")].find(el => /Market evidence/.test(el.querySelector("summary").textContent)).open = true; document.querySelector(".sf-est-project-context").open = true; }
          await document.fonts.ready;
          return { total: result.total, decision: document.querySelector("[data-est-decision]").textContent, scrollWidth: document.documentElement.scrollWidth, body: document.body.textContent };
        }, purpose);
        check(purpose + " " + width + " fits viewport", outcome.scrollWidth <= width);
        if (purpose === "Selling") check("Seller proceeds " + width, outcome.decision.includes("2,730,000") && outcome.total === 2875000);
        if (purpose === "Buying") check("Buyer budget " + width, outcome.decision.includes("3,063,000") && outcome.total === 2875000);
        if (purpose === "Developer") check("Quote not double-charged " + width, outcome.decision.includes("3,100,000"));
        if (purpose === "Project-sources") check("Specs not fabricated into priced units " + width, outcome.body.includes("67.56") && outcome.body.includes("price not published"));
        const file = purpose.toLowerCase() + "-" + width + ".png";
        await page.evaluate(() => { document.querySelector(".sf-header").style.visibility = "hidden"; });
        await page.locator(purpose === "Project-sources" ? ".sf-est-project-context" : "[data-est-decision]").screenshot({ path: path.join(DIR, file) }); captures.push(file);
        await page.evaluate(() => { document.querySelector(".sf-header").style.visibility = ""; });
      }
      await context.close();
    }
    check("No uncaught browser exceptions", errors.length === 0);
    console.log("ALL GREEN (" + checks.length + " checks, " + captures.length + " screenshots)");
  } finally { await browser.close(); fs.writeFileSync(path.join(DIR, "review-results.json"), JSON.stringify({ checkedAt: new Date().toISOString(), checks, captures, errors }, null, 2)); }
})().catch(error => { console.error(error); process.exitCode = 1; });
