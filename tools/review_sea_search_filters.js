"use strict";
const fs = require("fs"), path = require("path"), assert = require("assert");
const ROOT = path.resolve(__dirname, "..");
const DIR = path.join(ROOT, "docs/sea-search-refinement");
const checks = [], captures = [], errors = [];
function check(name, ok) { checks.push({ name, ok: !!ok }); assert(ok, name); }
(async () => {
  if (!fs.existsSync(path.join(ROOT, "docs"))) throw new Error("Project docs parent missing");
  fs.mkdirSync(DIR, { recursive: true });
  let pw; try { pw = require("../market-scan/worker/node_modules/playwright-core"); } catch (_) { pw = require("playwright-core"); }
  const browser = await pw.chromium.launch({ headless: true });
  try {
    const page = await browser.newPage({ viewport: { width: 390, height: 844 }, reducedMotion: "reduce" });
    page.on("pageerror", e => errors.push(e.message));
    async function go(hash) {
      await page.goto("http://127.0.0.1:8931/index.html" + hash, { waitUntil: "domcontentloaded" });
      await page.waitForSelector("[data-sf-search]"); await page.waitForTimeout(3000);
      await page.evaluate(async () => { if (document.fonts) await document.fonts.ready; const imgs = [...document.querySelectorAll(".sf-site img")]; imgs.forEach(img => { img.loading = "eager"; }); await Promise.race([Promise.allSettled(imgs.map(img => img.decode())), new Promise(r => setTimeout(r, 10000))]); });
    }
    async function capture(name) {
      await page.evaluate(() => window.scrollTo(0, 0));
      for (const fullPage of [false, true]) {
        const file = name + (fullPage ? "" : "-viewport") + ".png";
        await page.screenshot({ path: path.join(DIR, file), fullPage }); captures.push(file);
      }
      check(name + ": no horizontal page overflow", await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
    }
    await go("#/search"); await capture("search-mobile-closed");
    const summary = page.locator("[data-sf-more-filters] > summary");
    await summary.focus(); await page.keyboard.press("Enter");
    check("Enter opens native disclosure", await page.locator("[data-sf-more-filters]").evaluate(el => el.open));
    await capture("search-mobile-open");
    await summary.focus(); await page.keyboard.press("Enter");
    check("Enter closes native disclosure", await page.locator("[data-sf-more-filters]").evaluate(el => !el.open));
    await page.keyboard.press("Tab");
    check("closed controls skipped by keyboard navigation", await page.evaluate(() => !document.activeElement.closest(".sf-search-more-fields")));
    await summary.focus(); await page.keyboard.press("Space");
    check("Space opens native disclosure", await page.locator("[data-sf-more-filters]").evaluate(el => el.open));
    await page.keyboard.press("Tab");
    check("opening panel makes province the next Tab stop", await page.evaluate(() => document.activeElement.name === "state"));
    await page.locator('[data-sf-search] [name="state"]').fill("Cebu");
    await page.locator('[data-sf-search] [name="city"]').fill("Caloocan");
    await page.locator('[data-sf-search] [name="property_type"]').selectOption("house-and-lot");
    await page.locator('[data-sf-search] [name="offer_type"]').selectOption("sale");
    await page.locator('[data-sf-search] [name="max_price"]').selectOption("3000000");
    await page.locator('[data-sf-search] [name="state"]').focus();
    for (const width of [600, 601, 768, 390, 1440, 390]) {
      await page.setViewportSize({ width, height: 900 }); await page.waitForTimeout(100);
      const state = await page.evaluate(() => {
        const form = document.querySelector("[data-sf-search]"), more = form.querySelector("[data-sf-more-filters]");
        return { values: Object.fromEntries(new FormData(form)), focused: document.activeElement.name, hidden: more.hidden, open: more.open, order: [...form.children].filter(el => el.tagName === "LABEL").map(el => el.querySelector("[name]").name).join(",") };
      });
      check(width + "px: all unsaved values retained", state.values.state === "Cebu" && state.values.city === "Caloocan" && state.values.property_type === "house-and-lot" && state.values.offer_type === "sale" && state.values.max_price === "3000000");
      check(width + "px: focus retained after moving control", state.focused === "state");
      check(width + "px: appropriate layout", width <= 600 ? !state.hidden && state.open : state.hidden && state.order === "city,state,property_type,offer_type,max_price");
    }
    await page.setViewportSize({ width: 390, height: 844 });
    await go("#/search?offer_type=rent"); await capture("search-mobile-applied");
    for (const width of [768, 1440]) {
      await page.setViewportSize({ width, height: 1000 }); await go("#/search"); await capture("search-" + width);
    }
    await page.locator('[data-sf-search] [name="state"]').focus();
    await page.setViewportSize({ width: 390, height: 844 }); await page.waitForTimeout(100);
    check("empty focused advanced field stays exposed after shrinking", await page.evaluate(() => document.activeElement.name === "state" && document.querySelector("[data-sf-more-filters]").open));
    await page.locator("[data-sf-more-filters] > summary").focus();
    await page.setViewportSize({ width: 1440, height: 1000 }); await page.waitForTimeout(100);
    check("disappearing summary transfers focus to advanced field on desktop", await page.evaluate(() => document.activeElement.name === "state"));
    check("no uncaught browser exceptions", errors.length === 0);
    console.log("ALL GREEN (" + checks.length + " checks, " + captures.length + " screenshots)");
  } finally {
    await browser.close();
    fs.writeFileSync(path.join(DIR, "review-results.json"), JSON.stringify({ capturedAt: new Date().toISOString(), checks, captures, errors }, null, 2));
  }
})().catch(e => { console.error(e.stack); process.exitCode = 1; });
