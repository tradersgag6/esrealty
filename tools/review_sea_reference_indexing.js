"use strict";
const fs = require("fs"), path = require("path"), assert = require("assert");
const ROOT = path.resolve(__dirname, ".."), DIR = path.join(ROOT, "docs/sea-reference-indexing");
(async () => {
  assert(fs.existsSync(path.join(ROOT, "docs"))); fs.mkdirSync(DIR, { recursive: true });
  if (process.argv.includes("--suite")) {
    const run = require("child_process").spawnSync("powershell", ["-NoProfile", "-ExecutionPolicy", "Bypass", "-File", "tests/run_all.ps1"], { cwd: ROOT, encoding: "utf8", timeout: 1200000, maxBuffer: 12 * 1024 * 1024 });
    const output = (run.stdout || "") + (run.stderr || ""), name = fs.existsSync(path.join(DIR, "full-suite-recheck.log")) ? "full-suite-final.log" : fs.existsSync(path.join(DIR, "full-suite.log")) ? "full-suite-recheck.log" : "full-suite.log";
    fs.writeFileSync(path.join(DIR, name), output); console.log(output.slice(Math.max(0, output.indexOf("==== SUMMARY ===="))));
    if (run.error) throw run.error; assert.equal(run.status, 0, name); return;
  }
  const pw = require("../market-scan/worker/node_modules/playwright-core"), browser = await pw.chromium.launch({ headless: true });
  const checks = [], captures = [], errors = [];
  function check(name, ok) { checks.push({ name, ok }); assert(ok, name); }
  try {
    for (const width of [320, 390, 768, 1440]) {
      const page = await browser.newPage({ viewport: { width, height: 900 }, reducedMotion: "reduce" }); page.on("pageerror", error => errors.push(error.message));
      await page.goto("http://127.0.0.1:8931/index.html#/home"); await page.waitForSelector("[data-est-muni]"); await page.waitForTimeout(3000);
      for (const name of ["factor", "indexed", "lipa-status"]) {
        const outcome = await page.evaluate(async name => {
          const api = window.ESREALTY_EST, opts = { municipality: "BAUAN", barangay: "POBLACION III", streetKey: "binay st ressurreccion st", classification: "RR", area: 100, type: "vacant_lot", purpose: "Buying" };
          if (name === "indexed") Object.assign(opts, { landMethod: "time-indexed", timeAnnualPct: 5, timeBaseDate: "2022-07-23", timeTargetDate: "2026-10-03" });
          if (name === "lipa-status") opts.municipality = "LIPA CITY";
          const result = await api.estimate(opts); Object.assign(api._state(), opts, { result, muniRow: api.municipalityRow(opts.municipality) }); api.debug.render(4);
          if (name === "indexed") [...document.querySelectorAll(".sf-est-rsec")].find(el => /Calculation/.test(el.querySelector("summary").textContent)).open = true;
          if (name === "lipa-status") [...document.querySelectorAll(".sf-est-rsec")].find(el => /Market evidence/.test(el.querySelector("summary").textContent)).open = true;
          await document.fonts.ready;
          return { value: result.total, original: result.birZonalValue, text: document.body.textContent, width: document.documentElement.scrollWidth };
        }, name);
        check(name + " " + width + " fits viewport", outcome.width <= width);
        check(name + " " + width + " verification clearly unconfirmed", /Latest applicability unverified/.test(outcome.text));
        if (name === "factor") check("default factor baseline " + width, outcome.value === 2875000);
        if (name === "indexed") check("index remains separate from unchanged tax reference " + width, outcome.original === 1150000 && /no property-use|No property-use/.test(outcome.text));
        if (name === "lipa-status") check("Lipa proposed future period " + width, /2028-2030/.test(outcome.text) && /not an active reference/.test(outcome.text));
        const selector = name === "factor" ? ".sf-est-result-summary" : name === "indexed" ? "[data-est-time-result]" : "[data-est-reference-status]";
        await page.evaluate(() => { document.querySelector(".sf-header").style.visibility = "hidden"; });
        const file = name + "-" + width + ".png"; await page.locator(selector).first().screenshot({ path: path.join(DIR, file) }); captures.push(file);
        await page.evaluate(() => { document.querySelector(".sf-header").style.visibility = ""; });
      }
      await page.close();
    }
    check("No uncaught browser exceptions", errors.length === 0);
    console.log("ALL GREEN (" + checks.length + " checks, " + captures.length + " screenshots)");
  } finally { await browser.close(); fs.writeFileSync(path.join(DIR, "review-results.json"), JSON.stringify({ checkedAt: new Date().toISOString(), checks, captures, errors }, null, 2)); }
})().catch(error => { console.error(error); process.exitCode = 1; });
