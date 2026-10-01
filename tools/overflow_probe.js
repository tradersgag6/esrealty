"use strict";
/* Reproduces the exact overflow condition used by tests/ui_readability_mobile_e2e.js
 * (r.right > clientWidth + 1) and reports the real geometry, so a split-induced
 * regression can be diagnosed instead of guessed at.
 *
 * Usage: node tools/overflow_probe.js [route] [width]
 */
const BASE = "http://127.0.0.1:8931/index.html";
const ROUTE = process.argv[2] || "#/home";
const VW = parseInt(process.argv[3] || "390", 10);

function loadPw() {
  try { return require("../market-scan/worker/node_modules/playwright-core"); }
  catch (e) { return require("playwright-core"); }
}

function probeInPage() {
  const vw = document.documentElement.clientWidth;
  const sw = Math.max(document.documentElement.scrollWidth, document.body.scrollWidth);
  const out = { vw, sw, offenders: [] };
  const all = Array.prototype.slice.call(document.querySelectorAll("body *"));
  for (const el of all) {
    const cs = getComputedStyle(el);
    if (cs.display === "none" || cs.visibility === "hidden") continue;
    const r = el.getBoundingClientRect();
    if (r.width < 1 || r.height < 1) continue;
    if (r.right <= vw + 1) continue;
    out.offenders.push({
      tag: el.tagName.toLowerCase(),
      cls: (typeof el.className === "string" ? el.className : "").split(/\s+/).slice(0, 3).join("."),
      id: el.id || "",
      left: Math.round(r.left),
      right: Math.round(r.right),
      width: Math.round(r.width),
      over: Math.round(r.right - vw),
      parent: el.parentElement ? el.parentElement.tagName.toLowerCase() + "." + (typeof el.parentElement.className === "string" ? el.parentElement.className.split(/\s+/)[0] : "") : "",
      parentDisplay: el.parentElement ? getComputedStyle(el.parentElement).display : "",
      parentWidth: el.parentElement ? Math.round(el.parentElement.getBoundingClientRect().width) : 0
    });
  }
  /* Walk up the first real offender to find where the width is lost. */
  const first = out.offenders.find(o => o.over > 4) || out.offenders[0];
  out.ancestry = [];
  if (first) {
    const el = all.find(e => e.tagName.toLowerCase() === first.tag && Math.round(e.getBoundingClientRect().right) === first.right && (typeof e.className === "string" ? e.className.split(/\s+/).slice(0,3).join(".") === first.cls : false));
    let cur = el;
    while (cur && cur !== document.documentElement) {
      const cs = getComputedStyle(cur);
      const r = cur.getBoundingClientRect();
      out.ancestry.push({
        sel: cur.tagName.toLowerCase() + (cur.id ? "#" + cur.id : "") + (typeof cur.className === "string" && cur.className ? "." + cur.className.split(/\s+/).slice(0, 2).join(".") : ""),
        display: cs.display, width: Math.round(r.width), right: Math.round(r.right),
        minWidth: cs.minWidth, padding: cs.padding, gridTemplateColumns: cs.gridTemplateColumns, overflowX: cs.overflowX
      });
      cur = cur.parentElement;
    }
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
  await page.waitForTimeout(2600);
  const r = await page.evaluate(probeInPage);
  process.stdout.write("route " + ROUTE + "  viewport " + VW + "\n");
  process.stdout.write("clientWidth=" + r.vw + "  scrollWidth=" + r.sw + "  offenders=" + r.offenders.length + "\n\n");
  r.offenders.slice(0, 14).forEach(o => {
    process.stdout.write("  " + o.tag + (o.id ? "#" + o.id : "") + (o.cls ? "." + o.cls : "") + "\n");
    process.stdout.write("      left=" + o.left + " right=" + o.right + " w=" + o.width + " OVER by " + o.over + "\n");
    process.stdout.write("      parent=" + o.parent + " parentDisplay=" + o.parentDisplay + " parentW=" + o.parentWidth + "\n");
  });
  if (r.ancestry.length) {
    process.stdout.write("\nancestry (outermost last):\n");
    r.ancestry.forEach(a => process.stdout.write("  " + a.sel + "  display=" + a.display + " w=" + a.width + " right=" + a.right + " minW=" + a.minWidth + " cols=" + a.gridTemplateColumns + "\n"));
  }
  await browser.close();
})();
