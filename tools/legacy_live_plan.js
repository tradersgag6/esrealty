"use strict";
/* Workstream F analysis: for every selector in css/storefront-legacy.css that is
 * live on a public route, work out whether the rule is actually load-bearing.
 *
 * The four stylesheets load in this order:
 *
 *     1  css/storefront-legacy.css   extracted legacy storefront rules
 *     2  css/styles.css              admin/shared + responsive overrides
 *     3  css/estimator.css           value guide
 *     4  css/storefront.css          active token-based design system
 *
 * A rule in sheet 1 therefore loses to anything matching the same element in
 * sheets 2-4. That makes three very different cases, and the migration plan
 * depends on which one applies:
 *
 *   REDUNDANT  every declaration is beaten by a later sheet. The rule can be
 *              deleted outright: nothing about the rendering changes.
 *   PARTIAL    some declarations win, some lose. Only the winning ones matter,
 *              and they have to be carried into sheet 4 to survive.
 *   LOAD       the rule wins. It is genuinely load-bearing and has to move to
 *              sheet 4 (or be re-expressed in tokens) before sheet 1 can lose it.
 *
 * Getting this wrong in either direction is the whole risk of the migration, so
 * the classification is computed from the real cascade rather than guessed.
 *
 *   node tools/legacy_live_plan.js            # summary
 *   node tools/legacy_live_plan.js --list     # every selector, with its verdict
 */
const fs = require("fs");
const path = require("path");

const ROOT = path.join(__dirname, "..");
const SHEETS = [
  "css/storefront-legacy.css",
  "css/styles.css",
  "css/estimator.css",
  "css/storefront.css"
];

// Only rules from sheet 1 are candidates for migration.
const CANDIDATE_SHEET = "css/storefront-legacy.css";

/* Reads a stylesheet into a flat list of style rules, each carrying the chain of
 * at-rule conditions (@media / @supports) it sits inside.
 *
 * At-rules have to be tracked rather than skipped: most of the
 * storefront-legacy rules live inside media queries, and a parser that ignores
 * them reports almost nothing (the first version of this found 23 rules in a
 * file with roughly 800). The walk keeps a stack of open blocks so that closing
 * a brace can be attributed to the right kind of block. */
function readSheet(rel) {
  const abs = path.join(ROOT, rel);
  if (!fs.existsSync(abs)) return [];
  const src = fs.readFileSync(abs, "utf8");
  const n = src.length;
  const out = [];
  const stack = [];        // {kind:'rule'|'at'|'other', selector, bodyStart, comments}
  const conditions = [];   // at-rule conditions currently open
  let pendingComments = [];
  let buf = "";
  let i = 0;

  const flushRule = (frame) => {
    const sel = frame.selector.trim();
    if (!sel || sel[0] === "@") return;
    out.push({
      selector: sel,
      body: src.slice(frame.bodyStart, i),
      comments: frame.comments,
      conds: conditions.slice()
    });
  };

  while (i < n) {
    const c = src[i];

    if (c === "/" && src[i + 1] === "*") {
      const end = src.indexOf("*/", i + 2);
      if (stack.length === 0) pendingComments.push(src.slice(i, end === -1 ? n : end + 2));
      i = end === -1 ? n : end + 2;
      continue;
    }

    if (c === '"' || c === "'") {
      const q = c;
      buf += c; i++;
      while (i < n && src[i] !== q) { if (src[i] === "\\") { buf += src[i]; i++; } buf += src[i]; i++; }
      buf += q; i++;
      continue;
    }

    if (c === "{") {
      const sel = buf.trim();
      buf = "";
      const isAt = sel[0] === "@";
      stack.push({ kind: isAt ? "at" : "rule", selector: sel, bodyStart: i + 1, comments: pendingComments });
      pendingComments = [];
      if (isAt && /@(media|supports)\b/i.test(sel)) conditions.push(sel.replace(/\s+/g, " "));
      i++;
      continue;
    }

    if (c === "}") {
      const frame = stack.pop();
      if (frame && frame.kind === "rule") flushRule(frame);
      if (frame && frame.kind === "at" && /@(media|supports)\b/i.test(frame.selector)) conditions.pop();
      buf = "";
      i++;
      continue;
    }

    if (c === ";") {
      if (stack.length === 0) { buf = ""; pendingComments = []; }
      i++;
      continue;
    }

    if (stack.length === 0) buf += c;
    i++;
  }

  return out;
}

function parseDecls(body) {
  const out = [];
  let buf = "";
  let i = 0;
  const n = body.length;
  while (i < n) {
    const c = body[i];
    if (c === '"' || c === "'") {
      const q = c;
      buf += c; i++;
      while (i < n && body[i] !== q) { if (body[i] === "\\") { buf += body[i]; i++; } buf += body[i]; i++; }
      buf += q; i++;
      continue;
    }
    if (c === ":") {
      const prop = buf.trim();
      buf = "";
      i++;
      let val = "";
      while (i < n && body[i] !== ";") {
        if (body[i] === "(" || body[i] === "[") {
          const open = body[i], close = open === "(" ? ")" : "]";
          let d = 0;
          while (i < n) {
            if (body[i] === open) d++;
            else if (body[i] === close) { d--; if (d === 0) { val += body[i]; i++; break; } }
            val += body[i]; i++;
          }
          continue;
        }
        val += body[i]; i++;
      }
      i++; // skip ;
      const v = val.trim();
      if (prop && v) out.push({ prop: prop.toLowerCase(), val: v, important: /!\s*important\s*$/i.test(v) });
      buf = "";
      continue;
    }
    buf += c;
    i++;
  }
  return out;
}

const LIST = process.argv.includes("--list");
const LIVE_ONLY = !process.argv.includes("--all");

const sheets = SHEETS.map(readSheet);
const idx = SHEETS.indexOf(CANDIDATE_SHEET);

/* ---- which candidate selectors actually match something on a live route? ----
 *
 * Most of storefront-legacy.css styles the parked shophouse / Project B.T pages.
 * Migrating those would be pointless and, worse, would pull parked-page styling
 * into the active sheet. So the live public routes decide the work list, the
 * same way tools/legacy_css_coverage.js does.
 */
const BASE = "http://127.0.0.1:8931/index.html";
const LIVE_ROUTES = ["#/home", "#/search", "#/property-value", "#/project-bt"];

async function liveSelectorSet(selectors) {
  const pw = require(path.join(ROOT, "market-scan", "worker", "node_modules", "playwright-core"));
  const browser = await pw.chromium.launch({ headless: true });
  const hits = new Set();
  try {
    for (const hash of LIVE_ROUTES) {
      const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
      const page = await ctx.newPage();
      await page.goto(BASE + hash, { waitUntil: "domcontentloaded", timeout: 60000 });
      await page.waitForFunction(
        () => window.__ESREALTY_READY === true || (document.body && !document.body.classList.contains("preload")),
        null, { timeout: 25000 }
      ).catch(() => {});
      await page.waitForTimeout(2600);
      const matched = await page.evaluate((sels) => {
        const out = [];
        for (const s of sels) {
          let ok = false;
          try { ok = Array.from(document.querySelectorAll(s)).length > 0; } catch (e) { ok = false; }
          if (ok) out.push(s);
        }
        return out;
      }, selectors);
      for (const m of matched) hits.add(m);
      await ctx.close();
    }
  } finally {
    await browser.close();
  }
  return hits;
}

(async function main() {
  const allSels = [];
  sheets[idx].forEach(r => {
    for (const s of r.selector.split(",").map(x => x.trim()).filter(Boolean)) allSels.push(s);
  });
  const uniq = [...new Set(allSels)];
  const liveSel = LIVE_ONLY ? await liveSelectorSet(uniq) : new Set(uniq);

  const tally = { REDUNDANT: 0, PARTIAL: 0, LOAD: 0 };
  const rows = [];

  sheets[idx].forEach(rule => {
    const sels = rule.selector.split(",").map(s => s.trim()).filter(Boolean);
    if (LIVE_ONLY && !sels.some(s => liveSel.has(s))) return;
    const mine = parseDecls(rule.body);
    if (!mine.length) return;

    // Competing declarations from the sheets that load AFTER the candidate.
    const later = [];
    for (let k = idx + 1; k < sheets.length; k++) {
      for (const other of sheets[k]) {
        const otherSels = other.selector.split(",").map(s => s.trim()).filter(Boolean);
        if (!sels.some(a => otherSels.some(b => a === b))) continue;
        for (const d of parseDecls(other.body)) later.push({ prop: d.prop, val: d.val, important: d.important, sheet: SHEETS[k] });
      }
    }

    let beaten = 0;
    for (const d of mine) {
      if (later.some(l => l.prop === d.prop && (l.important || !d.important))) beaten++;
    }
    const verdict = beaten === 0 ? "LOAD" : (beaten === mine.length ? "REDUNDANT" : "PARTIAL");
    tally[verdict]++;
    rows.push({ selector: rule.selector.replace(/\s+/g, " "), decls: mine.length, beaten, verdict, conds: rule.conds });
  });

  console.log((LIVE_ONLY ? "LIVE" : "ALL") + " candidate rules in " + CANDIDATE_SHEET + ": " + rows.length);
  console.log("  REDUNDANT (every declaration beaten later - safe to delete): " + tally.REDUNDANT);
  console.log("  PARTIAL   (some declarations beat - must be carried over)  : " + tally.PARTIAL);
  console.log("  LOAD      (rule wins - must move to css/storefront.css)  : " + tally.LOAD);
  console.log("");
  if (LIST) {
    const order = { REDUNDANT: 0, PARTIAL: 1, LOAD: 2 };
    rows.sort((a, b) => order[a.verdict] - order[b.verdict] || a.selector.localeCompare(b.selector));
    for (const r of rows) {
      const m = r.conds.length ? "  @" + r.conds[r.conds.length - 1].slice(0, 42) : "";
      console.log("  [" + r.verdict.padEnd(9) + "] " + String(r.decls).padStart(2) + " decls, " + r.beaten + " beaten  " + r.selector.slice(0, 96) + m);
    }
  }
})();
