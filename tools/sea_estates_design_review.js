"use strict";
// Review the isolated Batch 1 proposal; never runs or modifies the production UI.
const fs = require("fs"), path = require("path"), crypto = require("crypto");
const ROOT = path.resolve(__dirname, "..");
const DIR = path.join(ROOT, "docs/sea-estates-design");
const BASE = "http://127.0.0.1:8931/docs/sea-estates-design/index.html";
const checks = [], captures = [], errors = [], requests = [];
const check = (name, ok, detail = "") => { checks.push({ name, ok: !!ok, detail }); console.log(`[${ok ? "PASS" : "FAIL"}] ${name} ${detail}`); };
async function main() {
  if (!fs.existsSync(DIR)) throw new Error("Proposal directory missing");
  fs.mkdirSync(path.join(DIR, "screenshots"), { recursive: true });
  let pw; try { pw = require("../market-scan/worker/node_modules/playwright-core"); } catch (_) { pw = require("playwright-core"); }
  const browser = await pw.chromium.launch({ headless: true });
  try {
    const context = await browser.newContext({ reducedMotion: "reduce" });
    const page = await context.newPage();
    page.on("pageerror", e => errors.push(e.message));
    page.on("request", r => requests.push({ url: r.url(), method: r.method() }));
    await page.goto(BASE);
    for (const theme of ["coastal", "warm", "clear"]) {
      await page.selectOption("#direction", theme);
      const pairs = await page.evaluate(() => {
        const style = getComputedStyle(document.documentElement);
        function luminance(hex) {
          const channels = hex.match(/[0-9a-f]{2}/gi).map(v => parseInt(v, 16) / 255).map(v => v <= .04045 ? v / 12.92 : ((v + .055) / 1.055) ** 2.4);
          return channels[0] * .2126 + channels[1] * .7152 + channels[2] * .0722;
        }
        const value = k => style.getPropertyValue("--" + k).trim();
        return [["ink", "paper"], ["muted", "paper"], ["muted", "surface"], ["muted", "soft"], ["accent", "paper"], ["surface", "accent"], ["on-dark", "dark"], ["on-dark-muted", "dark"], ["badge-ink", "badge"], ["control", "surface"], ["control", "paper"]].map(([fg, bg]) => {
          const l = [luminance(value(fg)), luminance(value(bg))].sort((a, b) => b - a);
          return { pair: `${fg}/${bg}`, ratio: (l[0] + .05) / (l[1] + .05), minimum: fg === "control" ? 3 : 4.5 };
        });
      });
      pairs.forEach(p => check(`${theme}: ${p.pair} contrast`, p.ratio >= p.minimum, `${p.ratio.toFixed(2)}:1 (minimum ${p.minimum})`));
      for (const width of [390, 1440]) {
        await page.setViewportSize({ width, height: width === 390 ? 844 : 1000 });
        await page.goto(BASE + "#home"); await page.selectOption("#direction", theme);
        const file = `home-${theme}-${width}.png`;
        await page.screenshot({ path: path.join(DIR, "screenshots", file), fullPage: true });
        captures.push(file);
      }
    }
    for (const width of [320, 390, 768, 1440]) {
      await page.setViewportSize({ width, height: width === 390 || width === 320 ? 844 : 1000 });
      for (const route of ["home", "properties", "value-guide", "project-bt", "property-ultima", "contact"]) {
        await page.goto(BASE + "#" + route);
        await page.selectOption("#direction", "coastal");
        check(`${route} ${width}: screenshot theme identity`, await page.locator("html").getAttribute("data-direction") === "coastal");
        const geometry = await page.evaluate(() => {
          const visible = el => el.getClientRects().length && getComputedStyle(el).visibility !== "hidden";
          const issues = [...document.querySelectorAll("main *, header *, footer *, .review-bar *")].filter(visible).filter(el => {
            const r = el.getBoundingClientRect(); return r.right > innerWidth + 2 || r.left < -2;
          }).map(el => `${el.tagName}.${el.className}`).slice(0, 10);
          const images = [...document.querySelectorAll("main img")].filter(visible);
          const cardRatios = [...document.querySelectorAll(".card-image")].filter(visible).map(el => {
            const r = el.getBoundingClientRect(); return r.width / r.height;
          });
          const controls = [...document.querySelectorAll("a, button, input, select, summary")].filter(visible).filter(el => !el.classList.contains("skip") && !["checkbox", "radio"].includes(el.type));
          const smallControls = controls.filter(el => el.getBoundingClientRect().height < 43.5).map(el => el.textContent.trim().slice(0, 30) || el.name);
          const tinyText = [...document.querySelectorAll("main p, main label, main input, main select")].filter(visible).filter(el => parseFloat(getComputedStyle(el).fontSize) < 14).map(el => el.textContent.trim().slice(0, 30));
          return { width: innerWidth, scroll: document.documentElement.scrollWidth, issues, smallControls, tinyText, cardRatios,
            broken: images.filter(el => !el.complete || el.naturalWidth === 0).map(el => el.src),
            h1s: [...document.querySelectorAll("main h1")].filter(visible).length };
        });
        check(`${route} ${width}: no horizontal overflow`, geometry.scroll === width && !geometry.issues.length, JSON.stringify(geometry.issues));
        check(`${route} ${width}: control/text sizing`, !geometry.smallControls.length && !geometry.tinyText.length, JSON.stringify({ smallControls: geometry.smallControls, tinyText: geometry.tinyText }));
        check(`${route} ${width}: images and heading`, !geometry.broken.length && geometry.h1s === 1, JSON.stringify({ broken: geometry.broken, h1s: geometry.h1s }));
        if (geometry.cardRatios.length) check(`${route} ${width}: card image aspect ratio`, geometry.cardRatios.every(r => Math.abs(r - 1.65) < .02), geometry.cardRatios.map(r => r.toFixed(2)).join(", "));
        if (width !== 320 && route !== "contact") {
          const file = `${route}-coastal-${width}-viewport.png`;
          await page.screenshot({ path: path.join(DIR, "screenshots", file) }); captures.push(file);
          if (route !== "home") {
            const full = `${route}-coastal-${width}.png`;
            await page.screenshot({ path: path.join(DIR, "screenshots", full), fullPage: true }); captures.push(full);
          }
        }
      }
    }
    // Prove the prototype's interactions and required navigation work.
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto(BASE);
    await page.keyboard.press("Tab");
    check("keyboard: skip link first", await page.locator(".skip").evaluate(el => el === document.activeElement));
    await page.locator(".menu-toggle").click();
    check("mobile: required entries visible", await page.locator('#main-nav [data-nav="properties"]').isVisible() && await page.locator('#main-nav [data-nav="value-guide"]').isVisible() && await page.locator('#main-nav [data-nav="project-bt"] .status').isVisible());
    await page.keyboard.press("Escape");
    check("mobile: Escape closes menu and returns focus", await page.locator(".menu-toggle").evaluate(el => el.getAttribute("aria-expanded") === "false" && el === document.activeElement));
    await page.goto(BASE + "#properties");
    await page.selectOption('select[name="budget"]', "9000000");
    await page.locator('#property-search button[type="submit"]').click();
    check("search: applied budget changes results", await page.locator('[data-cards="results"] .property-card').count() === 1 && (await page.locator('[data-cards="results"]').textContent()).includes("CARRERA"));
    await page.fill('input[name="location"]', "Bauan");
    await page.locator('#property-search button[type="submit"]').click();
    check("search: honest empty state", await page.locator("#empty-results").isVisible());
    await page.locator("#clear-filters").click();
    check("search: clear restores both samples", await page.locator('[data-cards="results"] .property-card').count() === 2);
    await page.goto(BASE + "#value-guide");
    await page.selectOption("#municipality", "batangas");
    check("guide: no automatic barangay selection", await page.inputValue("#barangay") === "");
    await page.locator('#guide-preview button[type="submit"]').click();
    check("guide: error names and focuses barangay", (await page.locator("#guide-feedback").textContent()).includes("barangay") && await page.locator("#barangay").evaluate(el => el === document.activeElement));
    await page.selectOption("#barangay", "ALANGILAN"); await page.selectOption("#street", "AGUDA COMPOUND");
    await page.selectOption("#municipality", "bauan");
    check("guide: parent change clears children", await page.inputValue("#barangay") === "" && await page.inputValue("#street") === "");
    await page.selectOption("#barangay", "POBLACION III"); await page.selectOption("#street", "BINAY ST (RESSURRECCION ST)");
    await page.selectOption("#classification", "RR"); await page.fill("#lot-area", "200");
    await page.locator('#guide-preview button[type="submit"]').click();
    check("guide: valid form discloses prototype boundary", (await page.locator("#guide-feedback").textContent()).includes("No estimate was calculated"));
    check("preview: no runtime errors", !errors.length, errors.join("; "));
    check("preview: local-only, GET-only resources", requests.every(r => r.method === "GET" && r.url.startsWith("http://127.0.0.1:8931/")));
    await context.close();
  } finally { await browser.close(); }
  const baseline = JSON.parse(fs.readFileSync(path.join(ROOT, "docs/sea-estates-baseline/audit.json"), "utf8"));
  const changed = Object.entries(baseline.hashes).filter(([f, expected]) => crypto.createHash("sha256").update(fs.readFileSync(path.join(ROOT, f))).digest("hex") !== expected).map(([f]) => f);
  check("production: original application hashes unchanged", !changed.length, changed.join(", "));
  const result = { capturedAt: new Date().toISOString(), url: BASE, checks, captures, errors, ok: checks.every(c => c.ok), scope: "Standalone proposal only; not a live-website accessibility certification or full regression run." };
  fs.writeFileSync(path.join(DIR, "review-results.json"), JSON.stringify(result, null, 2));
  console.log(`${result.ok ? "PASS" : "FAIL"}: ${checks.filter(c => c.ok).length}/${checks.length} checks; ${captures.length} images.`);
  if (!result.ok) process.exitCode = 1;
}
main().catch(e => { console.error(e.stack); process.exitCode = 1; });
