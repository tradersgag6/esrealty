"use strict";
/* Diagnostic: for a given selector, list every CSS rule in the document that
 * matches it, in cascade order, with the declared width/box-sizing/min-width.
 *
 * Used to work out which rule is winning on a specific element, and whether a
 * stylesheet split changed the winner.
 *
 * Usage: node tools/which_rules_apply.js ".sf-cta-form input" [viewportWidth]
 */
const fs = require("fs");
const path = require("path");
const BASE = "http://127.0.0.1:8931/index.html";
const ROUTE = process.env.ROUTE || "#/home";

const TARGET = process.argv[2] || ".sf-cta-form input";
const VW = parseInt(process.argv[3] || "390", 10);

function loadPw() {
  try { return require("../market-scan/worker/node_modules/playwright-core"); }
  catch (e) { return require("playwright-core"); }
}

function scanInPage(target) {
  const el = document.querySelector(target);
  const out = { found: !!el, matched: [] };
  if (!el) return out;
  const cs = getComputedStyle(el);
  out.computed = {
    width: cs.width, boxSizing: cs.boxSizing, minWidth: cs.minWidth,
    maxWidth: cs.maxWidth, fontSize: cs.fontSize, minHeight: cs.minHeight,
    padding: cs.padding, display: cs.display, parentWidth: el.parentElement ? getComputedStyle(el.parentElement).width : null
  };
  /* Enumerate every rule in every same-origin sheet, in document order, and
     report the ones that match this element and declare a width-ish property. */
  const INTEREST = ["width", "min-width", "max-width", "box-sizing", "font-size", "min-height", "padding", "flex-basis", "display"];
  for (const sheet of Array.from(document.styleSheets)) {
    let rules;
    try { rules = sheet.cssRules; } catch (e) { continue; }
    const sheetName = (sheet.href || "inline").split("/").pop();
    let order = 0;
    const walk = (list, mediaQ) => {
      for (const r of Array.from(list)) {
        order++;
        if (r.cssRules && (r.media || r.conditionText)) { walk(r.cssRules, r.conditionText || (r.media && r.media.mediaText) || ""); continue; }
        if (!r.selectorText) continue;
        let matches = false;
        try { matches = el.matches(r.selectorText); } catch (e) { matches = false; }
        if (!matches) continue;
        const decls = {};
        for (const p of INTEREST) {
          const v = r.style.getPropertyValue(p);
          if (v) decls[p] = v + (r.style.getPropertyPriority(p) ? " !" + p : "");
        }
        if (!Object.keys(decls).length) continue;
        out.matched.push({ sheet: sheetName, media: mediaQ, selector: r.selectorText, decls });
      }
    };
    walk(rules, "");
  }
  return out;
}

(async () => {
  const { chromium } = loadPw();
  const browser = await chromium.launch({ headless: true });
  const ctx = await browser.newContext({ viewport: { width: VW, height: 844 } });
  const page = await ctx.newPage();
  await page.goto(BASE + ROUTE, { waitUntil: "domcontentloaded", timeout: 60000 });
  await page.waitForFunction(
    () => window.__ESREALTY_READY === true || (document.body && !document.body.classList.contains("preload")),
    null, { timeout: 25000, polling: 100 }
  ).catch(() => {});
  await page.waitForTimeout(2500);
  const res = await page.evaluate(scanInPage, TARGET);
  process.stdout.write("viewport " + VW + "  route " + ROUTE + "  target " + TARGET + "\n");
  process.stdout.write("element found: " + res.found + "\n");
  if (res.computed) {
    process.stdout.write("\ncomputed:\n");
    for (const k of Object.keys(res.computed)) process.stdout.write("  " + k.padEnd(12) + " " + res.computed[k] + "\n");
  }
  process.stdout.write("\nmatching rules in document order (" + (res.matched || []).length + "):\n");
  (res.matched || []).forEach(m => {
    process.stdout.write("  [" + m.sheet + (m.media ? " @" + m.media : "") + "] " + m.selector + "\n");
    for (const k of Object.keys(m.decls)) process.stdout.write("       " + k + ": " + m.decls[k] + "\n");
  });
  await browser.close();
})();
