"use strict";
const fs = require("fs"), path = require("path");
const ROOT = path.resolve(__dirname, "..");
const homeOnly = process.argv.includes("--home-only");
const DIR = path.join(ROOT, homeOnly ? "docs/sea-home-refinement" : "docs/sea-estates-polish");
(async () => {
  if (!fs.existsSync(path.join(ROOT, "docs"))) throw new Error("Project docs parent missing");
  fs.mkdirSync(DIR, { recursive: true });
  let pw; try { pw = require("../market-scan/worker/node_modules/playwright-core"); } catch (_) { pw = require("playwright-core"); }
  const browser = await pw.chromium.launch({ headless: true });
  const captures = [];
  try {
    for (const width of [390, 768, 1440]) {
      const context = await browser.newContext({ viewport: { width, height: width === 390 ? 844 : 1000 }, reducedMotion: "reduce" });
      const page = await context.newPage();
      for (const name of homeOnly ? ["home"] : ["home", "search", "project-bt", "property-value"]) {
        await page.goto("http://127.0.0.1:8931/index.html#/" + name, { waitUntil: "domcontentloaded" });
        await page.waitForSelector(".sf-site"); await page.waitForTimeout(3000);
        await page.evaluate(async () => { if (document.fonts) await document.fonts.ready; for (let y=0; y < document.documentElement.scrollHeight; y+=650) { window.scrollTo(0,y); await new Promise(r=>setTimeout(r,50)); } window.scrollTo(0,0); });
        // Lazy inventory photos can still be decoding after the scroll pass.
        // Wait for actual images rather than recording half-painted frames.
        const images = await page.evaluate(async () => {
          const imgs = [...document.querySelectorAll(".sf-site img")];
          imgs.forEach(img => { img.loading = "eager"; });
          await Promise.race([Promise.allSettled(imgs.map(img => img.decode())), new Promise(resolve => setTimeout(resolve, 10000))]);
          return imgs.map(img => ({ source: img.src, loaded: img.complete && img.naturalWidth > 0 }));
        });
        if (images.some(img => !img.loaded)) console.log("Image-load limitation on " + name + " " + width + ": " + JSON.stringify(images.filter(img => !img.loaded)));
        await page.waitForTimeout(250);
        for (const fullPage of [false, true]) {
          const file = name + "-" + width + (fullPage ? "" : "-viewport") + ".png";
          await page.screenshot({ path: path.join(DIR, file), fullPage }); captures.push(file);
        }
        console.log("Captured " + name + " " + width);
      }
      await context.close();
    }
  } finally { await browser.close(); }
  fs.writeFileSync(path.join(DIR, "captures.json"), JSON.stringify({ capturedAt: new Date().toISOString(), captures }, null, 2));
})().catch(e => { console.error(e.stack); process.exitCode = 1; });
