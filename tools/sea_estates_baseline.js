"use strict";
// Batch 0 evidence only. Never edits application code or submits a form.
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const { execFileSync } = require("child_process");
const ROOT = path.resolve(__dirname, "..");
const OUT = path.resolve(ROOT, "docs/sea-estates-baseline");
const BASE = "http://127.0.0.1:8931/index.html";
const SKIP = new Set([".git", ".vercel", "node_modules", "vendor", "screenshots", "sea-estates-baseline"]);
const brand = /ES[ -]+REALTY|ESREALTY|esrealty/gi;
const inventory = [];
function walk(dir) {
  for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
    if (SKIP.has(ent.name) || ent.name.startsWith(".env")) continue;
    const abs = path.join(dir, ent.name);
    if (ent.isDirectory()) { walk(abs); continue; }
    if (!/\.(js|css|html|json|md|sql|ts|yml|yaml|ps1|cmd|webmanifest)$/.test(ent.name)) continue;
    if (ent.name === "app.min.js") continue;
    const text = fs.readFileSync(abs, "utf8");
    const hits = [];
    text.split(/\r?\n/).forEach((line, i) => {
      for (const match of line.matchAll(brand)) hits.push({ line: i + 1, spelling: match[0] });
    });
    if (hits.length) {
      const rel = path.relative(ROOT, abs).replace(/\\/g, "/");
      let category = "source-review";
      if (rel.startsWith("tests/")) category = "test-expectation";
      else if (/^supabase\//.test(rel)) category = "backend-report-or-contract-review";
      else if (/\.md$/.test(rel)) category = "documentation-or-history-review";
      else if (/^data\//.test(rel)) category = "provenance-or-data-review";
      else if (/^tools\//.test(rel)) category = "tooling-review";
      inventory.push({ file: rel, category, count: hits.length, hits });
    }
  }
}
function cssAudit(rel) {
  const text = fs.readFileSync(path.join(ROOT, rel), "utf8").replace(/\/\*[\s\S]*?\*\//g, "");
  const hex = text.match(/#[0-9a-f]{3,8}\b/gi) || [];
  const refs = text.match(/var\(--[\w-]+/g) || [];
  return { file: rel, hexOccurrences: hex.length, distinctHex: new Set(hex.map(x => x.toLowerCase())).size,
    tokenReferences: refs.length, sfTokenReferences: (text.match(/var\(--sf-[\w-]+/g) || []).length };
}
async function main() {
  if (!fs.existsSync(path.join(ROOT, "docs"))) throw new Error("Expected project docs directory");
  fs.mkdirSync(OUT, { recursive: true });
  walk(ROOT);
  const sources = ["index.html", "js/app.js", "js/app.min.js", "js/storefront.js", "js/estimator.js",
    "css/styles.css", "css/storefront-legacy.css", "css/storefront.css", "css/estimator.css"];
  const report = {
    capturedAt: new Date().toISOString(), baseUrl: BASE,
    commit: execFileSync("git", ["rev-parse", "HEAD"], { cwd: ROOT, encoding: "utf8" }).trim(),
    captureStatus: execFileSync("git", ["status", "--short"], { cwd: ROOT, encoding: "utf8" }).trim(),
    hashes: Object.fromEntries(sources.map(rel => [rel, crypto.createHash("sha256").update(fs.readFileSync(path.join(ROOT, rel))).digest("hex")])),
    branding: inventory,
    css: ["css/storefront.css", "css/storefront-legacy.css", "css/estimator.css", "css/styles.css"].map(cssAudit),
    captures: [], missing: [], screenshotsUseMocks: false,
    notes: ["Brand matches are an inventory, not instructions for global replacement.",
      "Unmatched legacy selectors are not proof of dead CSS; conditional states need separate review."]
  };
  let pw;
  try { pw = require("../market-scan/worker/node_modules/playwright-core"); }
  catch (_) { pw = require("playwright-core"); }
  const browser = await pw.chromium.launch({ headless: true });
  try {
    const routes = [
      { name: "home", hash: "#/home" }, { name: "properties", hash: "#/search" },
      { name: "property-value", hash: "#/property-value" }, { name: "project-bt", hash: "#/project-bt" }
    ];
    const viewports = [{ name: "desktop", width: 1440, height: 1000 },
      { name: "tablet", width: 768, height: 1024 }, { name: "mobile", width: 390, height: 844 }];
    let detailHash = null;
    for (const viewport of viewports) {
      const context = await browser.newContext({ viewport: { width: viewport.width, height: viewport.height }, reducedMotion: "reduce" });
      const page = await context.newPage();
      const captures = [...routes];
      if (detailHash) captures.push({ name: "property-detail", hash: detailHash });
      for (let i = 0; i < captures.length; i++) {
        const route = captures[i];
        const errors = [], failedRequests = [];
        const onError = e => errors.push(e.message);
        const onRequest = r => failedRequests.push({ url: r.url().split("?")[0], error: r.failure()?.errorText });
        page.on("pageerror", onError); page.on("requestfailed", onRequest);
        await page.goto(BASE + route.hash, { waitUntil: "domcontentloaded", timeout: 60000 });
        await page.waitForSelector(".sf-site", { timeout: 30000 });
        await page.waitForTimeout(3500);
        await page.evaluate(async () => {
          if (document.fonts) await document.fonts.ready;
          for (let y = 0; y < document.documentElement.scrollHeight; y += 650) {
            window.scrollTo(0, y); await new Promise(r => setTimeout(r, 60));
          }
          window.scrollTo(0, 0);
        });
        await page.waitForTimeout(500);
        const summary = await page.evaluate(() => {
          const root = document.querySelector(".sf-site");
          return { title: document.title, h1: [...root.querySelectorAll("h1")].map(x => x.textContent.trim()),
            headings: [...root.querySelectorAll("h2")].map(x => x.textContent.trim()),
            links: [...root.querySelectorAll("a[href]")].map(x => ({ text: x.textContent.trim(), href: x.getAttribute("href") })),
            listingIds: [...root.querySelectorAll("[data-sf-listing]")].map(x => x.getAttribute("data-sf-listing")),
            hasEstimator: !!root.querySelector("[data-est-root]"),
            hasBarangay: !!root.querySelector("[data-est-barangay]"),
            width: innerWidth, scrollWidth: document.documentElement.scrollWidth };
        });
        if (!detailHash && summary.listingIds.length) {
          detailHash = "#/listing/" + encodeURIComponent(summary.listingIds[0]);
          captures.push({ name: "property-detail", hash: detailHash });
        }
        const image = route.name + "-" + viewport.name + ".png";
        const viewportImage = route.name + "-" + viewport.name + "-viewport.png";
        await page.screenshot({ path: path.join(OUT, viewportImage), fullPage: false });
        await page.screenshot({ path: path.join(OUT, image), fullPage: true });
        report.captures.push({ route: route.hash, viewport, image, viewportImage, ...summary, errors, failedRequests });
        page.off("pageerror", onError); page.off("requestfailed", onRequest);
        console.log("Captured " + image + " (" + summary.listingIds.length + " listings)");
      }
      await context.close();
    }
    if (!detailHash) report.missing.push("Property-detail screenshot: no real listing ID available on Home or Search. No fixture invented.");
  } finally { await browser.close(); }
  fs.writeFileSync(path.join(OUT, "audit.json"), JSON.stringify(report, null, 2));
  console.log("Saved " + report.captures.length + " screenshots and branding/CSS inventory to " + OUT);
}
main().catch(e => { console.error(e.stack); process.exitCode = 1; });
