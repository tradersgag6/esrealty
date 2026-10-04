"use strict";
const fs = require("fs"), path = require("path"), assert = require("assert");
const ROOT = path.resolve(__dirname, ".."), DIR = path.join(ROOT, "docs/sea-guide-upgrade");
const captures = [], checks = [], errors = [];
function check(name, ok) { checks.push({ name, ok: !!ok }); assert(ok, name); }
function runSuite() {
  const run = require("child_process").spawnSync("powershell", ["-NoProfile", "-ExecutionPolicy", "Bypass", "-File", "tests/run_all.ps1"], { cwd: ROOT, encoding: "utf8", timeout: 1200000, maxBuffer: 10 * 1024 * 1024 });
  const output = (run.stdout || "") + (run.stderr || "");
  const logName = fs.existsSync(path.join(DIR, "full-suite.log")) ? "full-suite-final.log" : "full-suite.log";
  fs.writeFileSync(path.join(DIR, logName), output);
  const summary = output.indexOf("==== SUMMARY ====");
  console.log(summary >= 0 ? output.slice(summary) : output);
  if (run.error) throw run.error;
  if (run.status !== 0) throw new Error("Full regression suite failed; see docs/sea-guide-upgrade/" + logName);
}
(async () => {
  if (!fs.existsSync(path.join(ROOT, "docs"))) throw new Error("Docs parent missing");
  fs.mkdirSync(DIR, { recursive: true });
  if (process.argv.includes("--suite-only")) { runSuite(); return; }
  const pw = require("../market-scan/worker/node_modules/playwright-core");
  const browser = await pw.chromium.launch({ headless: true });
  try {
    for (const width of [320, 390, 768, 1440]) {
      const context = await browser.newContext({ viewport: { width, height: 900 }, reducedMotion: "reduce" });
      const page = await context.newPage(); page.on("pageerror", e => errors.push(e.message));
      async function capture(name, selector) {
        await page.evaluate(async () => { await document.fonts.ready; const imgs = [...document.querySelectorAll(".sf-site img")]; imgs.forEach(img => { img.loading = "eager"; }); await Promise.race([Promise.allSettled(imgs.map(img => img.decode())), new Promise(r => setTimeout(r, 8000))]); });
        const file = name + "-" + width + ".png";
        // Component evidence excludes the sticky header; capture the actual
        // viewport separately with the header restored to verify occlusion.
        await page.evaluate(() => { document.querySelector(".sf-header").style.visibility = "hidden"; });
        await page.locator(selector).screenshot({ path: path.join(DIR, file) }); captures.push(file);
        await page.evaluate(() => { document.querySelector(".sf-header").style.visibility = ""; });
        if (name !== "calculator-start") {
          const viewportFile = name + "-" + width + "-viewport.png";
          if (name === "property-comparison") await page.evaluate(() => window.scrollTo({ top: 0, behavior: "instant" }));
          else await page.evaluate(() => document.querySelector("[data-est-screen]").scrollIntoView({ block: "start", behavior: "instant" }));
          await page.screenshot({ path: path.join(DIR, viewportFile) }); captures.push(viewportFile);
          if (name !== "property-comparison") check(name + " " + width + " heading clears sticky header", await page.evaluate(() => document.querySelector("[data-est-screen] h3").getBoundingClientRect().top >= document.querySelector(".sf-header").getBoundingClientRect().bottom));
        }
        check(name + " " + width + " fits viewport", await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
      }
      await page.goto("http://127.0.0.1:8931/index.html#/home", { waitUntil: "domcontentloaded" }); await page.waitForTimeout(3500);
      await page.waitForSelector("[data-est-muni]");
      await capture("calculator-start", "[data-est-card]");
      await page.locator("[data-est-muni]").selectOption("BAUAN");
      await page.waitForFunction(() => [...document.querySelector("[data-est-barangay]").options].some(o => o.value === "POBLACION III"));
      await page.locator("[data-est-barangay]").selectOption("POBLACION III");
      await page.locator("[data-est-street-q]").fill("BINAY");
      await page.locator("[data-est-street]").filter({ hasText: "BINAY" }).first().click();
      await page.locator("[data-est-class-use]").selectOption("residential"); await page.locator("[data-est-class]").selectOption("RR");
      await page.locator("[data-est-area]").fill("100"); await page.locator("[data-est-next]").click();
      for (const [key, value] of [["occupancy", "empty"], ["titleStatus", "titled_self"], ["inheritanceStatus", "not_inherited"]]) await page.locator('[data-est-ownership="' + key + '"][data-val="' + value + '"]').click();
      await page.locator("[data-est-next]").click(); await page.waitForSelector('[data-est-screen="5"]');
      check("review focus " + width, await page.evaluate(() => document.activeElement.tagName === "H3"));
      await capture("calculator-review", "[data-est-card]");
      await page.locator('[data-est-edit="2"]').click();
      check("edit retains ownership answers " + width, await page.locator('[data-est-ownership="occupancy"][data-val="empty"]').getAttribute("aria-pressed") === "true");
      await page.locator("[data-est-next]").click(); await page.locator("[data-est-next]").click(); await page.waitForSelector(".sf-est-result-value");
      check("central estimate matches reference " + width, await page.locator(".sf-est-result-value").textContent() === "₱2,875,000");
      check("scenario range matches reference " + width, /₱2,443,750.*₱3,737,500/.test(await page.locator(".sf-est-scenario-range").textContent()));
      check("open pricing outputs " + width, await page.locator(".sf-est-price-lock").count() === 0 && await page.locator(".sf-est-price-card").count() === 4);
      await capture("calculator-results", "[data-est-card]");
      await page.locator("[data-est-email-open]").click();
      check("email form has optional phone " + width, !await page.locator('[data-est-lead-form] [name="phone"]').evaluate(el => el.required));
      check("email is a distinct request " + width, await page.locator("[data-est-lead-form] h3").textContent() === "Email my guide");
      await page.goto("http://127.0.0.1:8931/index.html#/search", { waitUntil: "domcontentloaded" }); await page.waitForTimeout(3200);
      await page.locator(".sf-property-card [data-sf-compare]").first().click(); await page.locator(".sf-property-card [data-sf-compare]").nth(1).click();
      await page.locator("[data-sf-compare-open]").click(); await page.waitForSelector(".sf-compare-fields");
      await capture("property-comparison", ".sf-compare-page");
      await page.reload(); await page.waitForSelector(".sf-compare-fields");
      check("comparison survives refresh " + width, await page.locator(".sf-compare-properties article").count() === 2);
      await context.close();
    }
    check("no uncaught browser exceptions", errors.length === 0);
    console.log("ALL GREEN (" + checks.length + " checks, " + captures.length + " screenshots)");
  } finally {
    await browser.close(); fs.writeFileSync(path.join(DIR, "review-results.json"), JSON.stringify({ capturedAt: new Date().toISOString(), checks, captures, errors }, null, 2));
  }
  if (process.argv.includes("--full-suite")) {
    runSuite();
  }
})().catch(e => { console.error(e.stack); process.exitCode = 1; });
