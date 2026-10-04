"use strict";
/* Classifies every top-level rule in css/styles.css as storefront, admin, or
 * shared, by parsing the CSS properly (brace matching, at-rule aware) and
 * cross-referencing the class names the two JS surfaces actually emit.
 *
 * The point is to establish FACT about the boundary before moving anything,
 * because the file interleaves the two concerns (notably the
 * [data-theme="light"] block, which mixes both).
 *
 * Usage: node tools/classify_styles.js
 */

/* ---------- class inventory from each JS surface ---------- */
const fs = require("fs");
const path = require("path");

const ROOT = path.join(__dirname, "..");
const read = p => fs.readFileSync(path.join(ROOT, p), "utf8");

const PUBLIC_JS = ["js/storefront.js", "js/estimator.js"];
const ADMIN_JS = [
  "js/app.js", "js/core.js", "js/data.js", "js/playbook_seed.js",
  "js/portfolio_ledger.js", "js/portfolio_cloud.js", "js/attribution.js",
  "js/compliance_due.js", "js/agent_next.js"
];

/* class="..." literals, plus classList.add/remove/toggle and className = "..." */
function classesIn(files) {
  const set = new Set();
  for (const f of files) {
    let t;
    try { t = read(f); } catch (e) { continue; }
    const patterns = [
      /class="([^"]{0,4000})"/g,
      /className\s*=\s*'([^']{0,400})'/g,
      /className\s*=\s*"([^"]{0,400})"/g,
      /classList\.(?:add|remove|toggle)\(\s*'([^']+)'/g,
      /classList\.(?:add|remove|toggle)\(\s*"([^"]+)"/g
    ];
    for (const re of patterns) {
      let m;
      while ((m = re.exec(t)) !== null) {
        for (const raw of m[1].split(/\s+/)) {
          const c = raw.trim();
          if (!c || /[+()<>{}]/.test(c)) continue;
          set.add(c);
        }
      }
    }
    /* also catch any bare token that looks like a class inside a quoted attr */
    const attrish = /['"\s]((?:sf|bt|lx|ls|hero|app)-[a-z0-9-]{2,40})['"\s]/g;
    let m2;
    while ((m2 = attrish.exec(t)) !== null) set.add(m2[1]);
  }
  return set;
}

const publicClasses = classesIn(PUBLIC_JS);
const adminClasses = classesIn(ADMIN_JS);

const shared = [...publicClasses].filter(c => adminClasses.has(c));
const publicOnly = [...publicClasses].filter(c => !adminClasses.has(c));

/* ---------- CSS parsing ---------- */
const css = read("css/styles.css");
const lines = css.split(/\r\n|\r|\n/);

/* Build a line index -> offset map so I can report line numbers. */
const lineStarts = [0];
for (let i = 0; i < css.length; i++) if (css[i] === "\n") lineStarts.push(i + 1);
function lineOf(offset) {
  let lo = 0, hi = lineStarts.length - 1;
  while (lo < hi) { const mid = (lo + hi + 1) >> 1; if (lineStarts[mid] <= offset) lo = mid; else hi = mid - 1; }
  return lo + 1;
}

function stripComments(src) {
  /* Replace comment bodies with spaces, preserving offsets so line numbers hold. */
  return src.replace(/\/\*[\s\S]*?\*\//g, m => " ".repeat(m.length));
}

const clean = stripComments(css);

/* Walk top-level blocks. Returns [{sel, body, start, end, atRule}] */
function parseRules(src) {
  const rules = [];
  let i = 0;
  let preludeStart = 0;
  const n = src.length;
  while (i < n) {
    const ch = src[i];
    if (ch === "{") {
      /* find matching close brace */
      let depth = 0, j = i;
      for (; j < n; j++) {
        if (src[j] === "{") depth++;
        else if (src[j] === "}") { depth--; if (depth === 0) break; }
      }
      const prelude = src.slice(preludeStart, i).trim();
      const body = src.slice(i + 1, j);
      if (prelude) {
        const isAt = prelude.startsWith("@");
        /* @keyframes bodies contain nested rules; treat the whole block as one unit */
        rules.push({ sel: prelude, body, start: preludeStart, end: j + 1, atRule: isAt, isKeyframes: /@keyframes/i.test(prelude) });
      }
      i = j + 1;
      preludeStart = i;
      continue;
    }
    i++;
  }
  return rules;
}

const rules = parseRules(clean);

/* Comments are stripped for parsing (so a comment containing a brace cannot
 * corrupt brace matching) but must survive into the output. Each rule is
 * extended backwards to absorb the whitespace and comments that immediately
 * precede it, so section banners like "/* ==== STOREFRONT MOBILE ==== *\/"
 * travel with the rules they label. Slicing from the ORIGINAL source (not the
 * stripped copy) then preserves them verbatim.
 *
 * Without this the extracted file lost every internal comment and was left with
 * whitespace runs over 900 characters long. */
function extendOverPrecedingComments(src, start) {
  let i = start;
  for (;;) {
    let j = i - 1;
    while (j >= 0 && /\s/.test(src[j])) j--;
    if (j < 1) return start;
    if (src[j] === "/" && src[j - 1] === "*") {
      const open = src.lastIndexOf("/*", j - 1);
      if (open === -1) return start;
      i = open;
      continue;
    }
    return i;
  }
}

/* ---------- classification ---------- */
const SF_PREFIX = /(^|[\s>+~,])((?:sf|bt)-[a-z0-9_-]+)/g;

/* ------------------------------------------------------------------
 * Precise "can the admin's markup ever match this selector?" test
 * ------------------------------------------------------------------
 * Two earlier versions of this logic were wrong, in ways that silently stranded
 * storefront CSS in the admin stylesheet:
 *
 * 1. "Does any class name here also appear in app.js?"  -> matched `.sf-menu.open`
 *    on the token `open`, which stranded the whole @media mobile-nav block.
 * 2. "sf- classes only, unless one is shared?"           -> the block also holds
 *    `.sf-gallery.empty`, so it re-bucketed to `mixed` and was still retained.
 *
 * Neither asks the real question. A selector matches an element only if every
 * simple selector matches, so a rule matters to the admin only if at least one
 * of its comma-separated selector parts could match admin markup. `open` is a
 * state class; it cannot make `.sf-menu.open` reachable, because the admin never
 * renders `.sf-menu`.
 *
 * So: split the selector into parts, and a part is admin-reachable only when
 * EVERY class it requires is one the admin actually emits. That is the same
 * test that correctly keeps `.section-title-row` (the admin really renders it)
 * and correctly moves `.sf-menu.open` (it does not).
 */
const CLASS_LITERALS = [
  /class="([^"]{0,4000})"/g,
  /classList\.(?:add|remove|toggle)\(\s*["']([A-Za-z][\w-]*)["']/g,
  /className\s*=\s*["']([^"']{1,200})["']/g
];

/* High-confidence: only literal markup, classList calls and className
 * assignments. Deliberately excludes the loose "looks like a class name in a
 * quoted string" scan, which over-collects and would keep rules that should
 * move - the safe-looking direction is actually the wrong one here. */
function emittedClasses(files) {
  const set = new Set();
  for (const f of files) {
    let t;
    try { t = read(f); } catch (e) { continue; }
    for (const re of CLASS_LITERALS) {
      re.lastIndex = 0;
      let m;
      while ((m = re.exec(t)) !== null) {
        for (const raw of m[1].split(/\s+/)) {
          const c = raw.trim();
          if (c && /^[A-Za-z][\w-]*$/.test(c)) set.add(c);
        }
      }
    }
  }
  return set;
}

const adminEmits = emittedClasses(ADMIN_JS);
const publicEmits = emittedClasses(PUBLIC_JS);

/* Split a rule's selector into comma-separated parts. For an at-rule
 * (@media / @supports) the real rules live in its body, so recurse into them.
 * `isAtRule` must be passed explicitly: both at-rules and plain rules have a
 * body, so testing `body !== undefined` made every plain rule recurse into its
 * own declarations, find no selectors, and fall through to "generic". */
function selectorParts(sel, body, isAtRule, depth) {
  depth = depth || 0;
  const parts = [];
  const push = s => {
    const t = s.replace(/\s+/g, " ").trim();
    if (t) parts.push(t);
  };
  if (isAtRule) {
    for (const nested of parseRules(body)) {
      if (nested.isKeyframes) continue;
      for (const p of selectorParts(nested.sel, nested.body, nested.atRule, depth + 1)) push(p);
    }
    return parts;
  }
  let depthParen = 0, buf = "";
  for (const ch of sel) {
    if (ch === "(") depthParen++;
    else if (ch === ")") depthParen--;
    if (ch === "," && depthParen === 0) { push(buf); buf = ""; continue; }
    buf += ch;
  }
  push(buf);
  return parts;
}

function classesInSelector(sel) {
  const out = [];
  const re = /\.(-?[_a-zA-Z][\w-]*)/g;
  let m;
  while ((m = re.exec(sel)) !== null) out.push(m[1]);
  return out;
}

/* Does at least one selector part look like something the admin renders? */
function adminReachable(sel, body, isAtRule) {
  const parts = selectorParts(sel, body, isAtRule);
  if (!parts.length) return false;
  for (const p of parts) {
    const cs = classesInSelector(p);
    /* No classes at all: an element-only or attribute-only selector. It could
       match admin markup, so be conservative and assume it can. */
    if (!cs.length) return true;
    if (cs.every(c => adminEmits.has(c))) return true;
  }
  return false;
}

function classify(sel, body, isAtRule) {
  const parts = selectorParts(sel, body, isAtRule);
  const classes = new Set();
  for (const p of parts) for (const c of classesInSelector(p)) classes.add(c);

  const isSfPrefixed = c => /^(sf|bt)-/.test(c);
  const touchesSf = [...classes].some(isSfPrefixed);
  const reachable = adminReachable(sel, body, isAtRule);

  if (!classes.size) return reachable ? "element-only" : "generic";
  /* Reachable by admin markup -> the rule must stay in styles.css. */
  if (reachable) return touchesSf ? "shared-sf" : "admin";
  /* Not reachable by admin markup. If the public surface emits any of these
     classes, or they are storefront-prefixed, the rule belongs to the storefront. */
  if (touchesSf) return "storefront";
  for (const c of classes) if (publicEmits.has(c)) return "public-named";
  return "generic";
}

const buckets = {};
for (const r of rules) {
  if (r.isKeyframes) { buckets.keyframes = (buckets.keyframes || 0) + 1; r.bucket = "keyframes"; continue; }
  const c = classify(r.sel, r.body, r.atRule);
  buckets[c] = (buckets[c] || 0) + 1;
  r.bucket = c;
  /* Absorb the comments immediately above this rule so section banners travel
     with the rules they label. r.ownStart keeps the true selector offset. */
  r.ownStart = r.start;
  r.start = extendOverPrecedingComments(css, r.start);
}

console.log("=== class inventory ===");
console.log("public classes:", publicClasses.size, " admin classes:", adminClasses.size);
console.log("\n=== class names used by BOTH surfaces (INFORMATIONAL ONLY) ===");
console.log("A name collision does NOT make a rule shared - see adminEmitsSfClass below.");
console.log("These are almost all generic state/util tokens:");
console.log(shared.length ? shared.sort().join("\n") : "(none)");

console.log("\n=== rule buckets ===");
for (const k of Object.keys(buckets).sort()) console.log("  " + k.padEnd(14), buckets[k]);

console.log("\n=== 'shared-sf' rules (admin RENDERS these storefront classes) ===");
rules.filter(r => r.bucket === "shared-sf").forEach(r => {
  console.log("  L" + lineOf(r.start) + "  " + r.sel.replace(/\s+/g, " ").slice(0, 110));
});

console.log("\n=== 'mixed' rules (sf- class combined with a non-sf class) ===");
rules.filter(r => r.bucket === "mixed").forEach(r => {
  console.log("  L" + lineOf(r.start) + "  " + r.sel.replace(/\s+/g, " ").slice(0, 110));
});

console.log("\n=== 'public-named' rules (non-sf classes only used by the storefront) ===");
rules.filter(r => r.bucket === "public-named").forEach(r => {
  console.log("  L" + lineOf(r.start) + "  " + r.sel.replace(/\s+/g, " ").slice(0, 110));
});

/* ---------- the migration plan ----------
 * A rule moves only if EVERY class it touches belongs to the public surface and
 * none of them is shared with the admin. Anything referencing a shared or
 * admin-only class stays in styles.css, which is what keeps .sf-eyebrow and
 * .sf-empty (borrowed by the admin's "My Property Space" view) working.
 *
 * Each top-level block is an atomic unit, so a @media block is never cut in
 * half - it moves whole or stays whole.
 */
const APPLY = process.argv.includes("--apply");
const MOVE = new Set(["storefront", "public-named"]);
const KEEP = new Set(["shared-sf", "mixed", "admin", "generic", "element-only", "keyframes"]);

const moveRules = rules.filter(r => MOVE.has(r.bucket));
const keepRules = rules.filter(r => KEEP.has(r.bucket));

const moveBytes = moveRules.reduce((a, r) => a + (r.end - r.start), 0);
console.log("\n=== plan ===");
console.log("rules to move :", moveRules.length, "(" + (moveBytes / 1024).toFixed(1) + " KB of " + (css.length / 1024).toFixed(1) + " KB)");
console.log("rules to keep  :", keepRules.length);

/* ---------------------------------------------------------------------------
 * SHARPNESS GUARD - --apply is NOT idempotent, and running it a second time is
 * destructive.
 *
 * This tool was run once (2026-09-26) to split the storefront rules OUT of
 * css/styles.css and into css/storefront-legacy.css. That is why today's plan
 * looks so small: the storefront rules are no longer IN styles.css, so there is
 * nothing left for it to find. --apply does not know that; it happily rebuilds
 * the legacy file from whatever is currently in styles.css and would overwrite
 * 88.5 KB of extracted legacy CSS with the 6 KB that is still sitting in
 * styles.css.
 *
 * Measured, not theorised: with the 2026-09-26 files in place, `--apply`
 * rewrote css/storefront-legacy.css from 88.5 KB / 712 rules down to 6.1 KB,
 * discarding 663 rules. The parked Shophouse and Project B.T pages depend on
 * those rules, and the generated file's own header warns "do not treat these
 * rules as dead until those pages are deleted, not merely closed."
 *
 * Consequence: DO NOT re-run --apply. To change what is in the legacy file,
 * edit that plan (which component moves to css/storefront.css) and change the
 * extractor, rather than re-extracting. This guard only exists to stop a
 * well-meaning "let me just regenerate it" from silently deleting a stylesheet.
 * ------------------------------------------------------------------------ */
if (APPLY) {
  const legacyPath = path.join(ROOT, "css", "storefront-legacy.css");
  let existing = null;
  try { existing = fs.readFileSync(legacyPath, "utf8"); } catch (e) { /* first run */ }
  if (existing && existing.indexOf("GENERATED by tools/classify_styles.js") >= 0) {
    const kb = (existing.length / 1024).toFixed(1);
    console.error(
      "\n!! REFUSING TO RUN --apply !!\n" +
      "   css/storefront-legacy.css is already a generated extract (" + kb + " KB).\n" +
      "   Re-running would rebuild it from css/styles.css, which no longer\n" +
      "   contains the extracted rules, and would DISCARD them. Measured on the\n" +
      "   2026-09-26 files: 88.5 KB / 712 rules -> 6.1 KB / 49 rules.\n" +
      "   To migrate a component, edit this tool's classifier and the legacy file\n" +
      "   deliberately, then re-verify with tools/snapshot_public_styles.js."
    );
    process.exit(1);
  }
}

function mergeRanges(list) {
  const out = [];
  for (const r of list) {
    const last = out[out.length - 1];
    if (last && r.start <= last.end + 1) last.end = Math.max(last.end, r.end);
    else out.push({ start: r.start, end: r.end });
  }
  return out;
}
const ranges = mergeRanges(moveRules);
console.log("contiguous ranges to cut:", ranges.length);

/* Byte ranges are offsets into the comment-stripped source, which has the same
 * length as the original. Reconstruct each file from those ranges. */
const outPath = path.join(ROOT, "css", "storefront-legacy.css");
const header = [
  "/* GENERATED by tools/classify_styles.js --apply  (do not hand-edit)",
  " *",
  " * Storefront rules extracted VERBATIM from css/styles.css. Nothing here was",
  " * rewritten, reordered or reformatted, so the extraction is visually neutral:",
  " * verify with",
  " *   node tools/snapshot_public_styles.js out.json",
  " *   node tools/snapshot_public_styles.js --diff before.json out.json",
  " *",
  " * Loaded in index.html at the exact position styles.css used to occupy, so the",
  " * cascade is unchanged.",
  " *",
  " * THIS IS THE LEGACY STOREFRONT STYLESHEET. It carries no design tokens and is",
  " * what css/storefront.css is meant to replace, one component at a time. When a",
  " * component is tokenised there, delete its rules from this file.",
  " *",
  " * Still required by the PARKED shophouse / Project B.T pages - do not treat",
  " * these rules as dead until those pages are deleted, not merely closed.",
  " *",
  " * " + moveRules.length + " rules, extracted " + new Date().toISOString() + ".",
  " */",
  ""
].join("\n");

let body = "";
/* Emit from the ORIGINAL source so comments survive; ranges were computed on the
   comment-stripped copy, which has identical offsets. */
for (const rg of ranges) body += css.slice(rg.start, rg.end).replace(/\s+$/, "") + "\n";

if (APPLY) {
  fs.writeFileSync(outPath, header + body);
  console.log("wrote " + outPath + " (" + ((header + body).length / 1024).toFixed(1) + " KB)");

  const keepRanges = mergeRanges(keepRules);
  let remaining = "";
  for (const rg of keepRanges) remaining += css.slice(rg.start, rg.end).replace(/\s+$/, "") + "\n";

  const stylesHeader = [
    "/* SEA ESTATES - application (admin) styles, plus the responsive override layer.",
    " *",
    " * SCOPE: the authenticated back-office, the shared primitives both surfaces",
    " * use, and the @media overrides that correct the storefront for smaller",
    " * viewports. The public storefront base rules live in",
    " * css/storefront-legacy.css (extracted from this file) and the token-based",
    " * design system in css/storefront.css; the value guide is in",
    " * css/estimator.css.",
    " *",
    " * !! LOAD ORDER IS LOAD BEARING - do not reorder index.html. !!",
    " * This file must load AFTER css/storefront-legacy.css. The responsive",
    " * overrides here correct base rules that now live in the extracted file, and",
    " * CSS has no concept of \"this was written later in the source\", only load",
    " * order. Loading the extracted file second inverts the pair below and breaks",
    " * the mobile layout:",
    " *",
    " *   storefront-legacy.css  .sf-cta-band { grid-template-columns: 1.1fr .9fr }",
    " *   styles.css @media      .sf-cta-band { grid-template-columns: 1fr }",
    " *",
    " * With the wrong order the media query still applies at 390px but appears",
    " * earlier in the cascade, so the two-column rule wins and the contact form",
    " * overflows the viewport by 94px. tests/css_load_order_node.js guards this.",
    " *",
    " * The admin no longer borrows any storefront class. The \"My Property Space\"",
    " * dashboard used to render .sf-eyebrow / .sf-empty and patch them with",
    " * overrides; it now renders .ls-eyebrow / .ls-empty, which the app owns.",
    " * That decoupling is what allowed those storefront rules to move out of this",
    " * file. Do not reintroduce the borrowing.",
    " *",
    " * Keep public marketing CSS out of this file.",
    " */",
    ""
  ].join("\n");

  fs.writeFileSync(path.join(ROOT, "css", "styles.css"), stylesHeader + remaining);
  console.log("rewrote css/styles.css (" + ((stylesHeader + remaining).length / 1024).toFixed(1) + " KB, was " + (css.length / 1024).toFixed(1) + " KB)");
} else {
  fs.writeFileSync(path.join(ROOT, "css", "styles.reduced.css"),
    "/* preview only - styles.css minus the storefront rules */\n" +
    mergeRanges(keepRules).map(rg => css.slice(rg.start, rg.end).replace(/\s+$/, "")).join("\n") + "\n");
  console.log("wrote css/styles.reduced.css (preview)");
}
