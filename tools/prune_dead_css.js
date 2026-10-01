"use strict";
/* Removes selectors that css/legacy-coverage.json proves are dead: the class
 * names they reference are never produced by the public JS, by the admin JS, or
 * by index.html.
 *
 * Two guards, because deleting live CSS is expensive and hard to see:
 *   - never remove a selector unless EVERY class in it is dead. A single live
 *     class in a selector list means the whole rule is still in use.
 *   - never remove a selector that touches a class the admin borrows
 *     (.sf-eyebrow, .sf-empty) even if the coverage run says it is unused,
 *     because the coverage run only visits public routes.
 *
 * Usage: node tools/prune_dead_css.js [--apply]
 */
const fs = require("fs");
const path = require("path");

const ROOT = path.join(__dirname, "..");
const read = p => fs.readFileSync(path.isAbsolute(p) ? p : path.join(ROOT, p), "utf8");
const TARGET = path.join(ROOT, "css", "storefront-legacy.css");

const coverage = JSON.parse(read(path.join(ROOT, "css", "legacy-coverage.json")));
const dead = new Set(coverage.trulyDead || []);
if (!dead.size) {
  process.stderr.write("no dead selectors recorded - run tools/legacy_css_coverage.js first\n");
  process.exit(2);
}

const ADMIN_BORROWED = new Set(["sf-eyebrow", "sf-empty"]);

/* Dead vocabulary, derived from the coverage run rather than hardcoded: a class
 * is dead-vocabulary if every selector that mentions it was proven dead, and it
 * appears in no live, dormant or parked selector. A class that any surviving
 * selector still references is treated as live. */
const DEAD_VOCAB = (() => {
  const inDead = new Set();
  for (const s of (coverage.trulyDead || [])) for (const c of classesOf(s)) inDead.add(c);
  const surviving = new Set();
  for (const list of [coverage.live || [], coverage.dormant || [], coverage.parkedLikely || [], coverage.stateDependent || []]) {
    for (const s of list) for (const c of classesOf(s)) surviving.add(c);
  }
  return new Set([...inDead].filter(c => !surviving.has(c) && !ADMIN_BORROWED.has(c)));
})();

const css = read(TARGET);
const clean = css.replace(/\/\*[\s\S]*?\*\//g, m => " ".repeat(m.length));

/* Preserve the file header. The rule-walk below rebuilds the file from parsed
 * blocks, and comments are not blocks - without this the first prune run silently
 * deletes the "LEGACY STOREFRONT STYLESHEET" banner that tells the next person
 * not to add rules here. */
const headerEnd = (() => {
  let i = 0;
  while (i < css.length) {
    const c = css[i];
    if (c === " " || c === "\n" || c === "\r" || c === "\t") { i++; continue; }
    if (c === "/" && css[i + 1] === "*") {
      const close = css.indexOf("*/", i + 2);
      i = close === -1 ? css.length : close + 2;
      continue;
    }
    break;
  }
  return i;
})();
const FILE_HEADER = css.slice(0, headerEnd);
if (FILE_HEADER.trim()) process.stdout.write("preserved header (" + FILE_HEADER.length + " bytes)\n");

function classesOf(sel) {
  const out = [];
  const re = /\.(-?[_a-zA-Z][\w-]*)/g;
  let m;
  while ((m = re.exec(sel)) !== null) out.push(m[1]);
  return out;
}

/* Walk top-level blocks, tracking offsets. */
function parse(src) {
  const out = [];
  let i = 0, start = 0;
  while (i < src.length) {
    if (src[i] === "{") {
      let depth = 0, j = i;
      for (; j < src.length; j++) {
        if (src[j] === "{") depth++;
        else if (src[j] === "}") { depth--; if (depth === 0) break; }
      }
      const sel = src.slice(start, i).trim();
      if (sel) out.push({ sel, start, end: j + 1 });
      i = j + 1; start = i; continue;
    }
    i++;
  }
  return out;
}

const rules = parse(clean);

/* Comments are not parseable blocks, so a rule-walk that rebuilds the file from
   ranges would drop every one of them. Extend each rule backwards to absorb the
   comments directly above it, then emit from the ORIGINAL source. Same offsets,
   comments preserved. */
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
for (const r of rules) r.ownStart = r.start, r.start = extendOverPrecedingComments(css, r.start);

const drop = [];
const kept = [];
let skipped = 0;

for (const r of rules) {
  if (/^@/.test(r.sel)) { kept.push(r); continue; }           // keep at-rules intact
  const parts = r.sel.split(",").map(s => s.trim()).filter(Boolean);
  if (!parts.length) { kept.push(r); continue; }

  const surviving = [];
  for (const p of parts) {
    const cs = classesOf(p);
    /* Guard 1: a selector with no classes is element-only; never touch it. */
    if (!cs.length) { surviving.push(p); continue; }
    /* Guard 2: never drop a selector naming an admin-borrowed class. */
    if (cs.some(c => ADMIN_BORROWED.has(c))) { surviving.push(p); continue; }
    if (dead.has(p)) continue;                                 // fully dead
    /* Guard 3: for selectors NOT in the dead list, keep unless every class is
       dead. This keeps partially-live rules that the coverage tool never
       reached (e.g. inside a media query it could not test). */
    if (cs.every(c => !emitted(c))) { continue; }
    surviving.push(p);
  }

  if (surviving.length === parts.length) { kept.push(r); continue; }
  if (!surviving.length) { drop.push(r); continue; }

  /* Partially dead: keep the rule, rewrite the selector list. Emit from the
     original source so the leading comments survive. */
  skipped++;
  const raw = css.slice(r.start, r.end);
  const braceAt = raw.indexOf("{");
  const head = css.slice(r.start, r.ownStart);
  const newRule = head + surviving.join(",\n") + " " + raw.slice(braceAt);
  kept.push({ sel: surviving.join(","), start: r.start, end: r.end, rewrite: newRule });
}

function emitted(c) {
  /* Conservative: assume a class is live unless the coverage run proved the
     whole vocabulary unused. */
  return !DEAD_VOCAB.has(c);
}

const removedSelectors = drop.reduce((a, r) => a + r.sel.split(",").filter(s => dead.has(s.trim())).length, 0);

let out = FILE_HEADER ? FILE_HEADER.replace(/\s*$/, "") + "\n\n" : "";
for (const r of kept) out += (r.rewrite || css.slice(r.start, r.end).replace(/\s+$/, "")) + "\n";

process.stdout.write("rules in file      : " + rules.length + "\n");
process.stdout.write("rules removed      : " + drop.length + " (" + removedSelectors + " dead selectors)\n");
process.stdout.write("rules trimmed      : " + skipped + " (dead selector removed from a shared rule)\n");
process.stdout.write("rules kept         : " + kept.length + "\n");
process.stdout.write("size " + (css.length / 1024).toFixed(1) + " KB -> " + (out.length / 1024).toFixed(1) + " KB\n");

drop.forEach(r => process.stdout.write("  - " + r.sel.replace(/\s+/g, " ").slice(0, 100) + "\n"));
if (skipped) kept.filter(r => r.rewrite).forEach(r => process.stdout.write("  ~ trimmed -> " + r.sel.replace(/\s+/g, " ").slice(0, 100) + "\n"));

if (process.argv.includes("--apply")) {
  fs.writeFileSync(TARGET, out);
  process.stdout.write("\nAPPLIED\n");
} else {
  process.stdout.write("\n(dry run - pass --apply to write)\n");
}
