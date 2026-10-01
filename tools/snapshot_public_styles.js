"use strict";
/* Captures computed styles for every storefront element on every public route,
 * so a CSS refactor can be proven visually neutral instead of merely "tests
 * still pass".
 *
 * Usage:
 *   node tools/snapshot_public_styles.js out.json
 *
 * Reads the live app at :8931. Compare two snapshots with:
 *   node tools/snapshot_public_styles.js --diff before.json after.json
 *
 * The diff intentionally ignores properties that legitimately change between
 * runs (hover/active state, animation progress, reveal-on-scroll transforms,
 * and element heights that depend on remotely loaded imagery).
 *
 * MEASURED NOISE FLOOR: ZERO.
 *
 * This used to report anywhere from 0 to 113 diffs between two captures of the
 * SAME build, which made it useless as a regression gate - a real regression
 * could not be told apart from the weather. Four causes were found and fixed:
 *
 *   1. The storefront renders its whole shell twice (skeleton cards, then the
 *      featured-listings response). Capturing in between swapped 39 nodes.
 *      stabilize() now waits for the .sf-site node to hold its identity and for
 *      no .sf-skeleton to remain.
 *   2. The diff keyed a parent by its UNSORTED class list while keying a child
 *      by a sorted one, so the scroll-reveal `in` class orphaned whole subtrees
 *      - 92 added / 92 removed with zero style changes.
 *   3. `in` is scroll bookkeeping, not style, so it is now dropped from the
 *      identity of both parent and child.
 *   4. The contact block is the one network-dependent region, and its success
 *      and failure paths are structurally different pages (4 children and a
 *      wider sticky bar, versus 1 child and a narrower one that reflows every
 *      centred column). It is now answered by a route() stub so there is no
 *      race to wait out.
 *
 * Plus a 0.05px tolerance for sub-pixel grid rounding ("606.672px" versus
 * "606.688px"), which is far below anything perceivable.
 *
 * Run `node tools/snapshot_public_styles.js --selftest` to assert the floor is
 * still zero. CI does this on every run, because a gate that has quietly gone
 * noisy again is worse than no gate: it looks like it is working.
 */
const fs = require("fs");

const SELFTEST = process.argv.includes("--selftest");
const OUT = process.argv[2] === "--selftest" ? "" : (process.argv[2] || "");
const DIFF_BEFORE = process.argv[2] === "--diff" ? process.argv[3] : "";
const DIFF_AFTER = process.argv[2] === "--diff" ? process.argv[4] : "";
const BASE = "http://127.0.0.1:8931/index.html";

const ROUTES = [
  { hash: "#/home", name: "home" },
  { hash: "#/search", name: "search" },
  { hash: "#/project-bt", name: "project-bt" },
  { hash: "#/property-value", name: "property-value" }
];

/* Properties worth comparing. Deliberately excludes anything that legitimately
   varies run to run: transform (scroll-reveal), height/width (image loading),
   and colour while an animation is mid-flight. */
const PROPS = [
  "display", "position", "float", "flexDirection", "flexWrap", "alignItems",
  "justifyContent", "gridTemplateColumns", "gridTemplateRows", "gap",
  "rowGap", "columnGap", "order",
  "marginTop", "marginRight", "marginBottom", "marginLeft",
  "paddingTop", "paddingRight", "paddingBottom", "paddingLeft",
  "fontFamily", "fontSize", "fontWeight", "fontStyle", "lineHeight",
  "letterSpacing", "textAlign", "textTransform", "textDecorationLine",
  "color", "backgroundColor", "backgroundImage", "backgroundSize",
  "backgroundPosition", "backgroundRepeat",
  "borderTopWidth", "borderRightWidth", "borderBottomWidth", "borderLeftWidth",
  "borderTopStyle", "borderRightStyle", "borderBottomStyle", "borderLeftStyle",
  "borderTopColor", "borderRightColor", "borderBottomColor", "borderLeftColor",
  "borderTopLeftRadius", "borderTopRightRadius", "borderBottomLeftRadius",
  "borderBottomRightRadius",
  "boxShadow", "opacity", "visibility", "zIndex", "overflow", "overflowX",
  "overflowY", "listStyleType", "whiteSpace", "wordBreak", "objectFit",
  "boxSizing", "minHeight", "maxWidth", "flexBasis", "flexGrow", "flexShrink",
  "pointerEvents", "cursor", "mixBlendMode", "filter", "backdropFilter"
];

function argPair() {
  return process.argv[2] === "--diff" ? { before: process.argv[3], after: process.argv[4] } : null;
}

/* Treat two computed values as equal when they differ only by sub-pixel
 * rounding. A single numeric value is compared directly; a space-separated list
 * (grid tracks, margins) has each numeric token compared. Non-numeric text must
 * match exactly.
 *
 * Declared BEFORE the dispatch below, and at module scope on purpose. It used to
 * be a nested `const` inside diff(), which made --diff throw a temporal dead
 * zone ReferenceError the moment it was invoked - the capture paths are async
 * and deferred, so only the synchronous --diff path exposed it. */
const SUBPIXEL_EPS = 0.05;
function sameValue(x, y) {
  if (x === y) return true;
  const tx = String(x).split(/\s+/), ty = String(y).split(/\s+/);
  if (tx.length !== ty.length) return false;
  for (let i = 0; i < tx.length; i++) {
    if (tx[i] === ty[i]) continue;
    const nx = parseFloat(tx[i]), ny = parseFloat(ty[i]);
    const bothNum = !Number.isNaN(nx) && !Number.isNaN(ny) && /^[-+]?[\d.]+px$/.test(tx[i]) && /^[-+]?[\d.]+px$/.test(ty[i]);
    if (bothNum && Math.abs(nx - ny) < SUBPIXEL_EPS) continue;
    return false;
  }
  return true;
}

if (SELFTEST) {
  selftest().catch(e => {
    process.stderr.write("selftest failed to run: " + (e && e.message ? e.message : e) + "\n");
    process.exit(1);
  });
} else if (argPair()) {
  diff(argPair().before, argPair().after);
} else {
  capture().catch(e => {
    process.stderr.write("capture failed: " + (e && e.message ? e.message : e) + "\n");
    process.exit(1);
  });
}

/* Runs INSIDE the page. Must be fully self-contained: page.evaluate serialises
   the function, so it cannot close over anything in this module. */
function captureInPage(props) {
  const root = document.querySelector(".sf-site") || document.body;
  const out = [];
  const nodes = root.querySelectorAll("*");
  /* Unique, stable identity.
   *
   * The first version used tag + sorted classes + index-among-same-tag-siblings.
   * That is NOT unique: two <svg class="sf-chev"> in two different <summary>
   * parents are both "svg.sf-chev[0]", the Map kept only the last one, and the
   * diff silently compared two unrelated elements - reporting colour and
   * text-transform changes that were really just a different node.
   *
   * So: a per-parent occurrence counter, assigned in document order, appended to
   * the identity. Two structurally identical elements in different parents now
   * get distinct, repeatable ids, and a genuine insertion shifts only the
   * siblings after it. */
  const seen = new Map();
  for (const el of nodes) {
    const cs = getComputedStyle(el);
    const cls = (el.getAttribute("class") || "").trim().split(/\s+/).filter(Boolean)
      /* `in` is a scroll-reveal bookkeeping class added by the
       * IntersectionObserver as sections pass the viewport. Whether it had
       * landed by capture time is pure timing, and because the diff keys
       * elements by their class list it churned whole subtrees - 92 added /
       * 92 removed with zero style changes on identical builds. The visual
       * result is pinned by the stylesheet that forces opacity/transform, so
       * drop the class from the identity of every element. */
      .filter(c => c !== "in").sort().join(".");
    const parent = el.parentElement;
    /* Sort the parent's class list exactly as `cls` is sorted above.
     *
     * This was the last structural source of phantom diffs. Unsorted, a parent's
     * key changed the moment the IntersectionObserver added its `in` class, and
     * because children are keyed as parentKey + ">" + ownKey, every descendant
     * was reported as one node added plus one node removed - 92 added / 92
     * removed with ZERO style changes, on two byte-identical builds. That churn
     * was what made this tool look unusable as a regression gate. */
    const parentKey = parent ? (parent.tagName.toLowerCase() + "." + (parent.getAttribute("class") || "").trim().split(/\s+/).filter(Boolean).filter(c => c !== "in").sort().join(".")) : "?";
    const parentOcc = parent ? (parent.hasAttribute("data-snap-occ") ? Number(parent.getAttribute("data-snap-occ")) : (() => {
      /* stamp the parent once, in document order */
      const n = seen.get(parent) || 0;
      seen.set(parent, n + 1);
      parent.setAttribute("data-snap-occ", String(n));
      return n;
    })()) : 0;
    const ownKey = el.tagName.toLowerCase() + (cls ? "." + cls : "");
    const key = parentKey + "#" + parentOcc + ">" + ownKey;
    const id = key + "[" + (parent ? Array.from(parent.children).filter(c => c.tagName === el.tagName).indexOf(el) : 0) + "]";
    const style = {};
    for (let i = 0; i < props.length; i++) {
      const p = props[i];
      const v = cs[p];
      if (v === "" || v === "none" || v === "normal" || v === "auto" || v === "0px") continue;
      style[p] = v;
    }
    out.push({ id: id, style: style });
  }
  const sheets = Array.from(document.styleSheets).map(s => (s.href || "inline").split("/").pop());
  return { count: out.length, sheets: sheets, nodes: out };
}


/* Puts the page into a single deterministic visual state before anything is
 * measured.
 *
 * This is what makes the diff usable as a gate. The previous version slept for a
 * fixed 2.6s and hoped reveals had settled, but three things kept moving:
 *
 *   - .sf-reveal is IntersectionObserver-driven, so an element below the fold
 *     was captured at whatever opacity the observer had or had not applied.
 *     Scrolling changes that, which is why node identity shifted between runs.
 *   - the pulse on .sf-cs-dot and the marquee are infinite animations, so their
 *     captured opacity depended on when the capture landed.
 *   - the sticky bar appears based on scroll position.
 *
 * With those in play, diffing two captures of the SAME build reported 7-10
 * differences - a noise floor wide enough to hide a real regression, and wide
 * enough that a 169-rule CSS migration could not be validated with it.
 *
 * Animations off, reveals forced to their end state, scrolled through the whole
 * document and returned to the top, the state no longer depends on timing.
 */
async function stabilize(page) {
  /* Wait for the webfont BEFORE anything is measured. This is the big one: the
   * display headline is `max-width: 20ch`, and `ch` resolves against whatever
   * font is actually loaded. Capturing before Inter arrived measured 697px,
   * after it arrived 604px - and that one value re-flowed the header, the
   * footer and every grid row height on the page. That is why an early version
   * of this stabiliser made the diff WORSE (33 differences) rather than better:
   * it removed animation noise but left the font race in place. */
  await page.evaluate(async () => {
    if (document.fonts && document.fonts.ready) {
      try { await document.fonts.ready; } catch (e) { /* non-fatal */ }
    }
    /* Inter is loaded via a font-display that can still be swapping a face in
     * after `ready`; wait until the document reports no pending loads. */
    for (let i = 0; i < 40 && document.fonts && document.fonts.status !== "loaded"; i++) {
      await new Promise(r => setTimeout(r, 50));
    }
  }).catch(() => {});

  await page.addStyleTag({
    content: `
      *, *::before, *::after {
        animation: none !important;
        transition: none !important;
      }
      .sf-reveal, .sf-reveal-up, .sf-reveal-right, .sf-reveal-zoom {
        opacity: 1 !important;
        transform: none !important;
      }
    `
  });
  /* Force the `in` class as well as the visual state. The stylesheet above
   * makes every reveal look revealed, but the IntersectionObserver still adds
   * the `in` class at its own pace, and the diff keys elements by their full
   * class list - so an element whose class had or had not landed appeared as a
   * node added plus a node removed. That was the last of the noise. */
  await page.evaluate(() => {
    document.querySelectorAll(".sf-reveal").forEach(el => el.classList.add("in"));
  }).catch(() => {});
  // Walk the document so IntersectionObserver fires for every section, then
  // return to the top so scroll-dependent chrome (sticky bar) is consistent.
  await page.evaluate(async () => {
    const step = Math.max(240, Math.floor(window.innerHeight * 0.8));
    for (let y = 0; y < document.documentElement.scrollHeight; y += step) {
      window.scrollTo(0, y);
      await new Promise(r => setTimeout(r, 45));
    }
    window.scrollTo(0, document.documentElement.scrollHeight);
    await new Promise(r => setTimeout(r, 120));
    window.scrollTo(0, 0);
    await new Promise(r => setTimeout(r, 120));
  });
  await page.waitForTimeout(400);

  /* THE BIG ONE: the storefront renders its whole shell TWICE.
   *
   * Boot paints a loading shell whose featured section holds .sf-property-card.sf-skeleton
   * placeholders. When the featured-listings fetch resolves, renderCurrent()
   * replaces the ENTIRE .sf-site tree with the real one - 39 nodes added, 10
   * removed. Capturing between those two renders is the dominant source of
   * phantom diffs, and because the fetch is a network response its latency
   * varies run to run, which is why identical builds reported anywhere from 0
   * to 113 structural/style diffs.
   *
   * Wait for the shell node to be the SAME instance across several polls AND for
   * no skeleton to remain. The skeleton half is what makes this deterministic:
   * a slow fetch leaves the loading shell stable but still full of skeletons,
   * so this cannot clear until the data render has actually landed. */
  await page.waitForFunction(() => {
    const host = document.getElementById("sf-site") || document.querySelector(".sf-site");
    if (!host) return true;
    if (window.__snapShellNode === undefined) { window.__snapShellNode = host; window.__snapShellSeq = 0; return false; }
    if (window.__snapShellNode === host) window.__snapShellSeq += 1;
    else { window.__snapShellNode = host; window.__snapShellSeq = 0; return false; }
    if (window.__snapShellSeq < 8) return false;
    return !document.querySelector(".sf-skeleton");
  }, null, { timeout: 30000, polling: 120 }).catch(() => {
    process.stderr.write("  note: shell did not settle within 30s; capturing anyway\n");
  });

  /* The contact block is populated asynchronously by applyContact(), which reads
   * the Supabase site-settings endpoint. That request is CORS-blocked, so it
   * falls back to built-in copy - and which of the two had landed by capture
   * time depended on the run. That showed up as .sf-contact-details holding 4
   * children in one snapshot and 1 in the next, which then also changed the
   * sticky bar (it renders a third button once a phone number exists).
   *
   * Waiting for a QUIET DOM here is not enough, and neither is a long quiet
   * period. While the request is in flight the block still holds its single
   * empty placeholder child, which looks perfectly stable - so a quiet-period
   * check happily returns, and the fallback then lands after the capture. That
   * produced the 14-diff signature: four contact children versus one, the
   * sticky bar's third button present versus absent, and every centre column
   * reflowing because the header and footer grids resize around it.
   *
   * The fallback is terminal and always renders more than the empty state, so
   * require the block to be POPULATED. Only if it never populates do we accept
   * the empty state, and then only after a long wait, so the ambiguous case
   * resolves to the same answer on every run.
   *
   * Watch the sticky bar alongside it: the bar grows a third (phone) button once
   * a phone number resolves, which changes its width and reflows the centred
   * header/footer columns and the hero h1's auto margins. Capturing during that
   * reflow is the residual 9-diff signature (h1 marginLeft 3.3px -> 50px,
   * maxWidth 697px -> 604px) with no node change at all. Requiring BOTH regions
   * to be settled for consecutive polls closes it. */
  await page.waitForFunction(() => {
    const el = document.querySelector(".sf-contact-details");
    const bar = document.querySelector(".sf-sticky");
    const barSig = bar ? Array.from(bar.children)
      .filter(c => getComputedStyle(c).display !== "none").length : 0;
    const sig = (el ? el.children.length : 0) + "/" + barSig;
    if (window.__snapSig === sig) window.__snapQuiet += 1;
    else { window.__snapSig = sig; window.__snapQuiet = 0; }
    /* Populated contact is the terminal fallback state; also demand several
       consecutive identical samples so the bar's reflow completes. */
    const populated = !el || el.children.length > 1;
    if (populated) {
      window.__snapEmptyWait = 0;
    } else {
      window.__snapEmptyWait = (window.__snapEmptyWait || 0) + 1;
    }
    return window.__snapQuiet >= 12 && (populated || window.__snapEmptyWait >= 40);
  }, null, { timeout: 30000, polling: 100 }).catch(() => {
    process.stderr.write("  note: contact/sticky did not settle within 30s\n");
  });
  /* One more quiet beat: the sticky bar and the centre column both reflow once
     the contact block changes height. */
  await page.waitForTimeout(500);
}

async function capture(outPath) {
  const target = outPath || OUT;
  if (!target) {
    process.stderr.write("usage: node tools/snapshot_public_styles.js out.json\n");
    process.exit(2);
  }
  const pwLib = loadPw();
  const { chromium } = pwLib;
  const browser = await chromium.launch({ headless: true });
  const ctx = await browser.newContext({ viewport: { width: 1400, height: 900 } });
  const page = await ctx.newPage();
  const consoleErrors = [];
  page.on("console", m => { if (m.type() === "error") consoleErrors.push(m.text()); });
  page.on("pageerror", e => consoleErrors.push("pageerror: " + e.message));

  /* Deterministic site-settings, served at the network layer.
   *
   * The contact block is the one part of the storefront that depends on a
   * network response, and its two outcomes are structurally different pages:
   *
   *   success -> applyContact() runs, .sf-contact-details gets its full set of
   *              children and the sticky bar unhides its phone button;
   *   failure -> the .catch branch sets contactLoaded and NEVER calls
   *              applyContact(), so the block keeps one placeholder child and
   *              the bar stays one button narrower.
   *
   * Which one lands before capture is a race against the CORS failure, so the
   * snapshot alternated between two different layouts. The visible reflow is
   * larger than it looks: the narrower bar changes the sticky element's width,
   * which re-resolves the centred header and footer grid columns and the hero
   * h1's auto margins (maxWidth 697px vs 604px).
   *
   * Answering this request locally removes the race entirely - the same bytes
   * and the same DOM on every run, without changing what is being measured. A
   * timeout wait cannot do this: while the request is in flight the DOM is
   * indistinguishable from the failure state, so any number of settle checks
   * still guess. */
  await page.route("**/listing-api/api/site-settings*", async route => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ data: { contact_email: "hello@esrealty.ph", contact_phone: "09171234567" } })
    });
  });

  const result = { capturedAt: new Date().toISOString(), routes: {}, consoleErrors: [] };

  for (const r of ROUTES) {
    await page.goto(BASE + r.hash, { waitUntil: "domcontentloaded", timeout: 60000 });
    await page.waitForFunction(
      () => window.__ESREALTY_READY === true || (document.body && !document.body.classList.contains("preload")),
      null, { timeout: 25000, polling: 100 }
    ).catch(() => {});
    await page.waitForTimeout(1200);
    await stabilize(page);
    const data = await page.evaluate(captureInPage, PROPS);
    result.routes[r.name] = { count: data.count, sheets: data.sheets, nodes: data.nodes };
    process.stdout.write("captured " + r.name + ": " + data.count + " nodes\n");
  }
  result.consoleErrors = consoleErrors;
  fs.writeFileSync(target, JSON.stringify(result, null, 1));
  process.stdout.write("wrote " + target + "\n");
  if (consoleErrors.length) {
    process.stdout.write("console errors (" + consoleErrors.length + "):\n");
    consoleErrors.slice(0, 10).forEach(e => process.stdout.write("  " + e + "\n"));
  }
  await browser.close();
}

function diff(beforePath, afterPath) {
  const a = JSON.parse(fs.readFileSync(beforePath, "utf8"));
  const b = JSON.parse(fs.readFileSync(afterPath, "utf8"));
  let totalDiffs = 0;
  const lines = [];
  for (const name of Object.keys(a.routes)) {
    if (!b.routes[name]) { lines.push("ROUTE MISSING in after: " + name); totalDiffs++; continue; }
    const A = a.routes[name].nodes, B = b.routes[name].nodes;
    const mapA = new Map(A.map(n => [n.id, n]));
    const mapB = new Map(B.map(n => [n.id, n]));
    const added = B.filter(n => !mapA.has(n.id));
    const removed = A.filter(n => !mapB.has(n.id));
    const changed = [];
    for (const [id, na] of mapA) {
      const nb = mapB.get(id);
      if (!nb) continue;
      for (const p of Object.keys(na.style)) {
        if (na.style[p] !== nb.style[p]) {
          /* Ignore sub-pixel rasterisation jitter.
           *
           * Identical builds still disagree on the last decimal of a computed
           * grid track - "606.672px" versus "606.688px" - because the browser
           * rounds text metrics to the device pixel and the rounding can fall
           * either side between runs. That is a 0.016px difference in a column
           * nobody can see, and reporting it as a diff made this tool look
           * permanently noisy, which is how a genuine regression could hide in
           * it. 0.05px is far below anything perceivable and still an order of
           * magnitude tighter than any real layout change. */
          if (sameValue(na.style[p], nb.style[p])) continue;
          changed.push({ id, p, from: na.style[p], to: nb.style[p] });
        }
      }
      for (const p of Object.keys(nb.style)) {
        if (!(p in na.style) && nb.style[p] !== "none") changed.push({ id, p, from: "(absent)", to: nb.style[p] });
      }
    }
    const sheetChanged = JSON.stringify(a.routes[name].sheets) !== JSON.stringify(b.routes[name].sheets);
    lines.push("== " + name + " ==");
    lines.push("  nodes: " + A.length + " -> " + B.length);
    lines.push("  added: " + added.length + "  removed: " + removed.length + "  style changes: " + changed.length);
    if (sheetChanged) {
      lines.push("  stylesheet list changed:");
      lines.push("    before: " + a.routes[name].sheets.join(", "));
      lines.push("    after:  " + b.routes[name].sheets.join(", "));
    }
    added.slice(0, 12).forEach(n => lines.push("  + " + n.id));
    removed.slice(0, 12).forEach(n => lines.push("  - " + n.id));
    changed.slice(0, 40).forEach(c => lines.push("  ~ " + c.id + "  " + c.p + ": " + c.from + "  ->  " + c.to));
    if (changed.length > 40) lines.push("  ... and " + (changed.length - 40) + " more");
    totalDiffs += added.length + removed.length + changed.length;
  }
  if (a.consoleErrors.length !== b.consoleErrors.length) {
    lines.push("console error count changed: " + a.consoleErrors.length + " -> " + b.consoleErrors.length);
  }
  process.stdout.write(lines.join("\n") + "\n");
  process.stdout.write("\nTOTAL STRUCTURAL/STYLE DIFFS: " + totalDiffs + "\n");
}

function loadPw() {
  try { return require("../market-scan/worker/node_modules/playwright-core"); }
  catch (e) { return require("playwright-core"); }
}

/* Assert the noise floor is still zero.
 *
 * The instrument is only worth trusting while identical builds compare clean,
 * so this is the check that protects every future CSS migration. It captures
 * the same build twice and fails if they differ at all.
 *
 * A run of, say, 3 pairs rather than 1: the sources of noise were intermittent
 * (a race that usually resolves in time), and a single pair passes about half
 * the time even when the noise is back. Three consecutive clean pairs is
 * strong evidence, and still cheap. */
async function selftest() {
  const pairs = 3;
  const tmp = require("os").tmpdir();
  const files = [];
  for (let i = 0; i <= pairs; i++) {
    const f = require("path").join(tmp, "sf_snap_selftest_" + i + ".json");
    await capture(f);
    files.push(f);
  }
  let worst = 0;
  for (let i = 0; i < files.length - 1; i++) {
    const n = countDiffs(files[i], files[i + 1]);
    process.stdout.write("  selftest pair " + (i + 1) + ": " + n + " diffs\n");
    if (n > worst) worst = n;
  }
  files.forEach(f => { try { fs.unlinkSync(f); } catch (e) { /* noop */ } });
  if (worst !== 0) {
    process.stderr.write(
      "\n!! NOISE FLOOR REGRESSED !!\n" +
      "   Two captures of the SAME build differed by " + worst + ".\n" +
      "   This tool cannot gate a CSS change while it reports phantom diffs.\n" +
      "   See the MEASURED NOISE FLOOR comment for what used to cause it.\n"
    );
    process.exit(1);
  }
  process.stdout.write("  noise floor is 0 across " + pairs + " pairs\n");
}

/* Total diff count between two snapshot files, reusing the same comparison the
 * --diff report uses. */
function countDiffs(beforePath, afterPath) {
  const a = JSON.parse(fs.readFileSync(beforePath, "utf8"));
  const b = JSON.parse(fs.readFileSync(afterPath, "utf8"));
  let total = 0;
  for (const name of Object.keys(a.routes)) {
    if (!b.routes[name]) { total++; continue; }
    const mapA = new Map(a.routes[name].nodes.map(n => [n.id, n]));
    const mapB = new Map(b.routes[name].nodes.map(n => [n.id, n]));
    total += b.routes[name].nodes.filter(n => !mapA.has(n.id)).length;
    total += a.routes[name].nodes.filter(n => !mapB.has(n.id)).length;
    for (const [id, na] of mapA) {
      const nb = mapB.get(id);
      if (!nb) continue;
      for (const p of Object.keys(na.style)) {
        if (na.style[p] !== nb.style[p] && !sameValue(na.style[p], nb.style[p])) total++;
      }
      for (const p of Object.keys(nb.style)) {
        if (!(p in na.style) && nb.style[p] !== "none") total++;
      }
    }
    if (JSON.stringify(a.routes[name].sheets) !== JSON.stringify(b.routes[name].sheets)) total++;
  }
  if (a.consoleErrors.length !== b.consoleErrors.length) total++;
  return total;
}
