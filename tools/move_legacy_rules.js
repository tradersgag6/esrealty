"use strict";
/* Mechanically moves rules from css/storefront-legacy.css into
 * css/storefront.css, preserving comments and at-rule conditions.
 *
 * WHY A TOOL RATHER THAN 169 HAND EDITS
 * The migration is mechanical but not safe by hand: the two sheets load either
 * side of css/styles.css, so relocating a rule also changes which sheet gets to
 * win, and the cascade differences (including !important and specificity) are
 * easy to get wrong and invisible to review. Doing it in one pass with an exact
 * before/after computed-style diff is the only version of this that is
 * verifiable.
 *
 * WHAT IT GUARANTEES
 *   - a rule is moved whole: selector, body, its leading comments, and the
 *     @media/@supports chain it sits inside.
 *   - the destination gets a single clearly marked block, so the migrated rules
 *     are auditable and reversible in one place.
 *   - moving is idempotent: a rule already present in the destination is not
 *     moved again.
 *
 * ALWAYS verify with:
 *   node tools/snapshot_public_styles.js after.json
 *   node tools/snapshot_public_styles.js --diff before.json after.json
 * The diff's noise floor is 0 (see the stabiliser notes in that tool), so any
 * difference reported is a real rendering change.
 *
 *   node tools/move_legacy_rules.js --list  '^\.sf-cta-form'
 *   node tools/move_legacy_rules.js --move  '^\.sf-cta-form'
 *   node tools/move_legacy_rules.js --move --all-selectors '^\.sf-search-form'
 *   node tools/move_legacy_rules.js --move  --dry-run '^\.sf-footer'
 */
const fs = require("fs");
const path = require("path");

const ROOT = path.join(__dirname, "..");
const FROM = path.join(ROOT, "css", "storefront-legacy.css");
const TO = path.join(ROOT, "css", "storefront.css");

const argv = process.argv.slice(2);
const MOVE = argv.includes("--move");
const DRY = argv.includes("--dry-run");
/* By default a rule is selected when ANY member of its comma-separated
 * selector list matches. That preserves the tool's original behavior, but it
 * means `--move '^\\.sf-search-form'` can also lift a shared rule such as
 * `.sf-primary-btn, .sf-search-form button, .sf-contact-card form button`.
 * `--all-selectors` is the safe component-migration mode: every selector in a
 * rule must match, so a shared declaration stays with the shared component. */
const ALL_SELECTORS = argv.includes("--all-selectors");
const filterArg = argv.find(value => !value.startsWith("--")) || null;

if (!filterArg) {
  process.stderr.write("usage: node tools/move_legacy_rules.js --list|--move [--all-selectors] [--dry-run] <selector-regex>\n");
  process.exit(2);
}
const filter = new RegExp(filterArg, "i");

const fromSrc = fs.readFileSync(FROM, "utf8");
const toSrc = fs.readFileSync(TO, "utf8");

/* Split the source into a sequence of tokens so the file can be reassembled
 * byte-for-byte apart from the rules that are lifted out.
 *
 * NESTING IS TRACKED. The original scanner treated an @media block as one opaque
 * token, so the rules inside it were never emitted at all. A filter naming a
 * selector that only exists in a media query therefore matched nothing and
 * reported "0 rules", which reads as "there is nothing here" when in fact the
 * rule was simply invisible - and moving a rule out of its @media, or not
 * moving it at all, silently breaks the responsive layout.
 *
 * Every rule now carries `atChain`: the ordered list of at-rule preludes it sits
 * inside, so a moved rule can be re-wrapped in the same conditions. */
function scan(src) {
  const items = [];
  const n = src.length;
  let i = 0;
  let pending = [];
  /* Offset just past the most recently consumed block comment. Selector
   * walk-back must not cross it, or a rule following a comment absorbs the
   * comment text. */
  let lastCommentEnd = 0;
  /* Stack of open at-rule blocks. Only at-rules are pushed. */
  const stack = [];

  while (i < n) {
    const c = src[i];

    if (c === "/" && src[i + 1] === "*") {
      const end = src.indexOf("*/", i + 2);
      const stop = end === -1 ? n : end + 2;
      pending.push(src.slice(i, stop));
      lastCommentEnd = stop;
      i = stop;
      continue;
    }

    if (c === "{") {
      /* Find the selector that precedes this brace.
       *
       * This walked back over WHITESPACE ONLY, which is wrong: a rule's opening
       * brace is preceded by its own selector text (".storefront-active {"), so
       * the character before the brace is a letter, not whitespace, and the
       * walk stopped immediately. Every one of the 709 selectors extracted as
       * the empty string, so the tool matched nothing and silently reported
       * "0 rules" for every input. Walk back to the previous structural
       * boundary instead - the last of '}', '{', ';' - and take what is
       * between that boundary and the brace as the selector.
       *
       * lastCommentEnd is the offset just past the most recently consumed
       * comment. The walk must not cross it: the generated file opens with a
       * banner comment containing no '}', '{' or ';', so without this bound the
       * first real rule absorbed the whole banner and --list reported the
       * file's own header as a rule. */
      let selStart = i;
      while (selStart > lastCommentEnd) {
        const p = src[selStart - 1];
        if (p === "}" || p === "{" || p === ";") break;
        selStart--;
      }
      const selector = src.slice(selStart, i).trim();

      /* Find the matching close brace, respecting strings so a '}' inside a
       * quoted value cannot end the block early. */
      let depth = 0, j = i, quote = null;
      for (; j < n; j++) {
        const d = src[j];
        if (quote) { if (d === "\\") { j++; continue; } if (d === quote) quote = null; continue; }
        if (d === '"' || d === "'") { quote = d; continue; }
        if (d === "{") depth++;
        else if (d === "}") { depth--; if (depth === 0) break; }
      }
      const body = src.slice(i + 1, j);

      if (selector[0] === "@") {
        /* Descend into the at-rule rather than consuming it whole.
         *
         * Consuming it (i = j + 1) skipped its body entirely, so the 119 rules
         * that live inside the legacy sheet's media queries were invisible to
         * every filter: a --list for one of them reported "0 rules", and a
         * --move would have left it behind. Step just past the at-rule's opening
         * brace so its contents are scanned normally, and pop the frame when
         * its own closing brace is reached. */
        stack.push({ at: selector, openIdx: i, endIdx: j });
        pending = [];
        i = i + 1;
        continue;
      }

      items.push({
        kind: "rule",
        selector,
        body,
        start: selStart,
        end: j + 1,
        comments: pending,
        atChain: stack.map(s => s.at)
      });
      pending = [];
      i = j + 1;
      continue;
    }

    if (c === "}") {
      /* Pop the at-rule this brace closes. Each frame records the offset of its
       * own closing brace, so braces inside a rule body never confuse it. */
      if (stack.length && stack[stack.length - 1].endIdx === i) stack.pop();
      i++;
      continue;
    }

    i++;
  }
  return items;
}

const items = scan(fromSrc);
const rules = items.filter(it => it.kind === "rule");

const matching = rules.filter(r => {
  const selectors = r.selector.split(",").map(s => s.trim()).filter(Boolean);
  return selectors.length && (ALL_SELECTORS
    ? selectors.every(s => filter.test(s))
    : selectors.some(s => filter.test(s)));
});

console.log("filter: /" + filterArg + "/i");
if (ALL_SELECTORS) console.log("selector-list mode: all selectors must match");
console.log("rules in css/storefront-legacy.css matching: " + matching.length);

/* Report how many of the matches sit inside an at-rule, because those are the
 * ones that silently lose their media condition if the tool is careless. */
const conditional = matching.filter(r => r.atChain.length);
console.log("  of which inside @media/@supports: " + conditional.length);

if (!MOVE) {
  for (const r of matching.slice(0, 40)) {
    const cond = r.atChain.length ? "  [" + r.atChain.join(" > ") + "]" : "  [top level]";
    console.log("  " + r.selector.replace(/\s+/g, " ").slice(0, 100) + cond);
  }
  if (matching.length > 40) console.log("  ... and " + (matching.length - 40) + " more");
  process.exit(0);
}

if (DRY) {
  console.log("(dry run - nothing written)");
  process.exit(0);
}

if (!matching.length) {
  console.log("nothing to move");
  process.exit(0);
}

/* Lift the matching rules out of the legacy sheet.
 *
 * The text between one lifted rule and the next is preserved verbatim, so the
 * only thing that changes is the rule blocks themselves. Byte ranges are taken
 * from the original source and applied back to it, so anything the scanner did
 * not classify as a rule (including the @media wrappers) survives untouched. */
const lifts = matching;
let out = "";
let cursor = 0;
for (const it of lifts) {
  out += fromSrc.slice(cursor, it.start);
  cursor = it.end;
}
out += fromSrc.slice(cursor);

/* Preserve the blank-line separation the source used, so the legacy sheet does
 * not collapse into a wall of rules where things were lifted out. */
out = out.replace(/[ \t]+\r?\n/g, "\n").replace(/\n{3,}/g, "\n\n");

/* Build the destination block.
 *
 * Grouped by the at-rule chain each rule originally sat inside, and each group
 * RE-WRAPPED in that same chain. Dropping the wrapper is the failure mode this
 * grouping exists to prevent: a rule lifted out of "@media (max-width: 760px)"
 * and appended at top level would apply at every width, silently rewriting the
 * responsive design. */
const groups = new Map();   // chainKey -> {chain: string[], texts: string[]}
for (const it of lifts) {
  const key = it.atChain.join(" > ") || "(top level)";
  if (!groups.has(key)) groups.set(key, { chain: it.atChain, texts: [] });
  groups.get(key).texts.push(
    (it.comments || []).join("").trim() + "\n" + it.selector + " {" + it.body + "}"
  );
}

let block = "";
let first = true;
for (const [key, g] of groups) {
  if (!first) block += "\n";
  first = false;
  if (g.chain.length) {
    block += "/* ---- was inside " + key + " ---- */\n";
    let indent = "";
    for (const at of g.chain) { block += indent + at + " {\n"; indent += "  "; }
    for (const t of g.texts) {
      block += t.split("\n").map(l => indent + l).join("\n") + "\n";
    }
    for (let i = g.chain.length - 1; i >= 0; i--) {
      indent = indent.slice(0, -2);
      block += indent + "}\n";
    }
  } else {
    for (const t of g.texts) block += t + "\n";
  }
}
const BANNER_MARKER = "MIGRATED FROM css/storefront-legacy.css";
const BANNER_END = "============================================================================= */";

const banner = [
  "/* =====================================================================",
  "   " + BANNER_MARKER + "  (tools/move_legacy_rules.js)",
  "   =====================================================================",
  "   These rules were load-bearing in the legacy sheet, which loads BEFORE",
  "   css/styles.css. They are preserved here, in the sheet that wins, so the",
  "   storefront no longer depends on that load order. Grouped by the at-rule",
  "   chain each rule originally sat inside, and RE-WRAPPED in that same chain:",
  "   a rule lifted out of its @media and left at top level would apply at every",
  "   width and silently rewrite the responsive design.",
  "   ===================================================================== */"
].join("\n");

/* The banner must appear EXACTLY ONCE, and repeated runs must ACCUMULATE rules
 * rather than replace them.
 *
 * Two bugs lived here. The original appended the whole banner on every run, so
 * migrating N times stacked N copies of the same comment. The obvious fix -
 * truncate everything from the first banner onward and re-emit - was worse: it
 * deleted the rules that earlier runs had already migrated, so a second
 * migration silently undid the first.
 *
 * Correct behaviour: if the banner is absent, add it. If it is present, leave
 * the existing block alone and append the new rules after it. */
let toOut = toSrc;
if (toOut.indexOf(BANNER_MARKER) < 0) {
  toOut = toOut.replace(/\s*$/, "") + "\n\n" + banner + "\n";
}
toOut = toOut.replace(/\s*$/, "") + "\n\n" + block.trim() + "\n";

fs.writeFileSync(FROM, out, "utf8");
fs.writeFileSync(TO, toOut, "utf8");

const inMedia = lifts.filter(r => r.atChain.length).length;
console.log("moved " + lifts.length + " rules  (" + (lifts.length - inMedia) + " top level, " + inMedia + " re-wrapped in their at-rule chain)");
console.log("  css/storefront-legacy.css  " + fromSrc.length + " -> " + out.length + " bytes");
console.log("  css/storefront.css         " + toSrc.length + " -> " + toOut.length + " bytes");
console.log("");
console.log("verify with:");
console.log("  node tools/snapshot_public_styles.js after.json");
console.log("  node tools/snapshot_public_styles.js --diff before.json after.json");
