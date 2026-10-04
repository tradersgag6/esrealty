"use strict";
const fs = require("fs"), path = require("path"), crypto = require("crypto");
const ROOT = path.resolve(__dirname, "..");
const DIR = path.join(ROOT, "docs/sea-estates-improved");
const BASE = "http://127.0.0.1:8931/";
const checks = [], captures = [], errors = [], mutations = [];
function check(name, ok, detail = "") { checks.push({ name, ok: !!ok, detail }); console.log(`[${ok ? "PASS" : "FAIL"}] ${name} ${detail}`); }
async function main() {
  if (!fs.existsSync(DIR)) throw new Error("Preview parent missing");
  fs.mkdirSync(path.join(DIR, "screenshots"), { recursive: true });
  let pw; try { pw = require("../market-scan/worker/node_modules/playwright-core"); } catch (_) { pw = require("playwright-core"); }
  const browser = await pw.chromium.launch({ headless: true });
  try {
    for (const width of [390, 768, 1440]) {
      const ctx = await browser.newContext({ viewport: { width, height: width === 390 ? 844 : 1000 }, reducedMotion: "reduce" });
      const page = await ctx.newPage();
      page.on("pageerror", e => errors.push(e.message));
      page.on("request", r => { if (!["GET", "HEAD"].includes(r.method())) mutations.push({ method: r.method(), url: r.url() }); });
      for (const variant of ["original", "improved"]) {
        await page.goto(BASE + (variant === "original" ? "index.html" : "docs/sea-estates-improved/index.html") + "#/home", { waitUntil: "domcontentloaded" });
        await page.waitForSelector("[data-est-muni]", { timeout: 30000, state: "attached" });
        if (variant === "improved") await page.waitForFunction(() => window.SEA_PREVIEW?.ready);
        await page.waitForTimeout(3500);
        await page.evaluate(async () => {
          if (document.fonts) await document.fonts.ready;
          if (location.pathname.includes("sea-estates-improved")) document.querySelectorAll(".sf-reveal").forEach(el => el.classList.add("in"));
          for (let y = 0; y < document.documentElement.scrollHeight; y += 650) { window.scrollTo(0, y); await new Promise(r => setTimeout(r, 50)); }
          window.scrollTo(0, 0);
        });
        await page.waitForTimeout(250);
        for (const fullPage of [false, true]) {
          const file = `${variant}-home-${width}${fullPage ? "" : "-viewport"}.png`;
          await page.screenshot({ path: path.join(DIR, "screenshots", file), fullPage }); captures.push(file);
        }
      }
      const info = await page.evaluate(() => {
        const s = document.querySelector(".sf-site");
        return { scroll: document.documentElement.scrollWidth, width: innerWidth,
          overflow: [...s.querySelectorAll("*")].filter(el => el.getClientRects().length && getComputedStyle(el).visibility !== "hidden").filter(el => { const r = el.getBoundingClientRect(); return r.left < -2 || r.right > innerWidth + 2; }).map(el => el.className).slice(0, 8),
          sections: [".sf-featured", ".sf-guide-summary", ".sf-services", ".sf-process", ".sea-bt-teaser", "#sf-contact", ".sf-footer"].map(selector => ({ selector, found: !!s.querySelector(selector) })),
          cards: [...s.querySelectorAll(".sf-property-card:not(.sf-skeleton)")].length,
          smallInputs: [...s.querySelectorAll("input,select")].filter(el => el.getClientRects().length && !["radio", "checkbox"].includes(el.type) && parseFloat(getComputedStyle(el).fontSize) < 16).length,
          zeroFacts: [...s.querySelectorAll(".sf-card-meta b")].map(el => el.textContent),
          h1: s.querySelector("h1")?.textContent, brand: s.querySelector(".sf-brand b")?.textContent };
      });
      check(`${width}: brand and two entry paths`, info.brand === "SEA Estates" && await page.locator(".sea-entry-properties").count() === 1 && await page.locator(".sea-entry-guide").count() === 1);
      check(`${width}: original sections retained`, info.sections.every(s => s.found), JSON.stringify(info.sections));
      check(`${width}: listing inventory present`, info.cards > 0, `${info.cards} cards`);
      check(`${width}: no page/element overflow`, info.scroll === width && !info.overflow.length, JSON.stringify(info.overflow));
      check(`${width}: input readability`, info.smallInputs === 0, `small inputs=${info.smallInputs}`);
      if (width === 390) {
        check("mobile: both quick-entry paths visible", await page.locator(".sea-mobile-paths a").isVisible() && await page.locator(".sea-mobile-paths button").isVisible());
      }
      check(`${width}: calculator compact initially`, await page.locator("#sea-guide-disclosure").getAttribute("open") === null && await page.locator("[data-est-muni]").count() === 1);
      await page.locator(".sea-entry-guide [data-sea-guide]").click();
      check(`${width}: start opens original mounted calculator`, await page.locator("[data-est-muni]").isVisible() && await page.locator("#sea-guide-disclosure").getAttribute("open") !== null);
      const file = `improved-calculator-${width}.png`;
      await page.screenshot({ path: path.join(DIR, "screenshots", file), fullPage: true }); captures.push(file);
      await ctx.close();
    }
    const ctx = await browser.newContext({ viewport: { width: 1440, height: 1000 }, reducedMotion: "reduce" });
    const page = await ctx.newPage();
    page.on("pageerror", e => errors.push(e.message));
    page.on("request", r => { if (!["GET", "HEAD"].includes(r.method())) mutations.push({ method: r.method(), url: r.url() }); });
    await page.goto(BASE + "docs/sea-estates-improved/index.html#/home");
    await page.waitForFunction(() => window.SEA_PREVIEW?.ready && document.querySelector("[data-est-muni]"));
    await page.waitForTimeout(3500);
    await page.locator(".sea-entry-guide [data-sea-guide]").click();
    await page.selectOption("[data-est-muni]", "BALAYAN");
    await page.waitForFunction(() => [...document.querySelector("[data-est-barangay]").options].some(o => o.value === "BACLARAN"));
    check("guide: barangay never auto-selected", await page.inputValue("[data-est-barangay]") === "");
    await page.selectOption("[data-est-barangay]", "BACLARAN");
    await page.locator("[data-est-street-q]").fill("all street");
    await page.waitForSelector("[data-est-street]");
    const street = page.locator('[data-est-street]:not([data-est-street-all])').filter({ hasText: /all street/i }).first();
    await street.click();
    await page.selectOption("[data-est-class-use]", "commercial");
    await page.selectOption("[data-est-class]", "CR");
    await page.locator("[data-est-area]").fill("200");
    await page.locator("[data-est-next]").click();
    await page.waitForSelector('[data-est-screen="2"]');
    check("guide: actual property/ownership stage retained", await page.locator("[data-est-ownership]").count() === 13);
    for (const key of ["occupancy", "titleStatus", "inheritanceStatus"]) await page.locator(`[data-est-ownership="${key}"][data-val="not_sure"]`).click();
    await page.locator("[data-est-next]").click();
    await page.waitForSelector('[data-est-screen="4"]', { timeout: 60000 });
    const result = await page.evaluate(() => {
      const api = window.ESREALTY_EST; const state = api._state(); const r = state.result;
      return { available: r.available, integrity: api.core.integrityCheck(r).ok, reference: r.reference.value, total: r.total, sections: document.querySelectorAll(".sf-est-rsec").length };
    });
    check("guide: original engine reaches real result", result.available && result.integrity && result.reference === 3500, JSON.stringify(result));
    check("guide: full report sections retained", result.sections === 17, `${result.sections} sections`);
    await page.screenshot({ path: path.join(DIR, "screenshots/improved-real-result-1440.png"), fullPage: true }); captures.push("improved-real-result-1440.png");
    await page.evaluate(() => window.ESREALTY_EST.debug.render(1));
    check("guide: Back/render retains real inputs", await page.inputValue("[data-est-muni]") === "BALAYAN" && await page.inputValue("[data-est-area]") === "200");
    // Verify request guard without contacting a write endpoint.
    const blocked = await page.evaluate(async () => { try { await fetch("/batch-preview-write-check", { method: "POST" }); return false; } catch (e) { return e.message.includes("submissions are disabled"); } });
    check("guard: write request blocked before network", blocked);
    const storage = await page.evaluate(() => { localStorage.setItem("sea-preview-test", "temporary"); return localStorage.getItem("sea-preview-test") === "temporary"; });
    check("guard: in-page storage is isolated", storage);
    // Contact form does not create a lead or falsely claim success.
    await page.goto(BASE + "docs/sea-estates-improved/index.html#/home");
    await page.waitForFunction(() => window.SEA_PREVIEW?.ready && document.querySelector("#sf-contact form"));
    await page.locator('#sf-contact input[name="name"]').fill("Preview review");
    await page.locator('#sf-contact input[name="email"]').fill("preview@example.com");
    await page.locator('#sf-contact input[name="phone"]').fill("09170000000");
    await page.locator('#sf-contact input[name="consent"]').check();
    await page.locator('#sf-contact button[type="submit"]').click();
    check("guard: contact form says nothing submitted", (await page.locator("#sf-contact .sf-form-status").textContent()).includes("nothing was submitted"));
    await page.locator(".sea-quick-search input").fill("Caloocan");
    await page.locator('.sea-quick-search button[type="submit"]').click();
    await page.waitForFunction(() => location.hash.startsWith("#/search?") && document.querySelector(".sf-search-page"));
    check("search: original API route/filter used", (new URLSearchParams((await page.evaluate(() => location.hash)).split("?")[1])).get("city") === "Caloocan");
    await page.goto(BASE + "docs/sea-estates-improved/index.html#/project-bt");
    await page.waitForSelector(".sf-cs-flag");
    check("Project B.T.: original Coming Soon retained", (await page.locator(".sf-cs-flag").textContent()).toLowerCase().includes("coming soon"));
    // Same browser context/origin: a fresh context would always have empty
    // storage and could not prove that the preview left real storage untouched.
    const checkPage = await ctx.newPage();
    await checkPage.goto(BASE + "index.html#/home");
    check("guard: no storage persisted into original", await checkPage.evaluate(() => localStorage.getItem("sea-preview-test") === null));
    await ctx.close();
    check("preview: zero uncaught JS errors", !errors.length, errors.join("; "));
    check("preview: zero mutation requests reached network", !mutations.length, JSON.stringify(mutations));
  } finally { await browser.close(); }
  function luminance(hex) {
    const c = hex.match(/[\da-f]{2}/gi).map(v => parseInt(v, 16) / 255).map(v => v <= .04045 ? v / 12.92 : ((v + .055) / 1.055) ** 2.4);
    return c[0] * .2126 + c[1] * .7152 + c[2] * .0722;
  }
  for (const [name, fg, bg, minimum] of [
    ["main text", "#193248", "#f3f6f9", 4.5], ["secondary text", "#526678", "#f3f6f9", 4.5],
    ["CTA text", "#ffffff", "#235a82", 4.5], ["input border", "#71879a", "#ffffff", 3]
  ]) {
    const l = [luminance(fg), luminance(bg)].sort((a,b) => b-a); const ratio = (l[0]+.05)/(l[1]+.05);
    check(`palette: ${name} contrast`, ratio >= minimum, ratio.toFixed(2) + ":1");
  }
  const baseline = JSON.parse(fs.readFileSync(path.join(ROOT, "docs/sea-estates-baseline/audit.json"), "utf8"));
  const changed = Object.entries(baseline.hashes).filter(([f, hash]) => crypto.createHash("sha256").update(fs.readFileSync(path.join(ROOT, f))).digest("hex") !== hash).map(([f]) => f);
  check("production hashes unchanged", !changed.length, changed.join(", "));
  const report = { capturedAt: new Date().toISOString(), url: BASE + "docs/sea-estates-improved/index.html#/home", checks, captures, errors, mutations, ok: checks.every(c => c.ok) };
  fs.writeFileSync(path.join(DIR, "review-results.json"), JSON.stringify(report, null, 2));
  console.log(`${report.ok ? "PASS" : "FAIL"}: ${checks.filter(c => c.ok).length}/${checks.length} checks; ${captures.length} screenshots.`);
  if (!report.ok) process.exitCode = 1;
}
main().catch(e => { console.error(e.stack); process.exitCode = 1; });
