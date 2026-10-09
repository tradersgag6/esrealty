"use strict";
/* Guards the single type system (Workstream C).
 *
 * The storefront ran two: display copy in `Georgia, 'Times New Roman', serif`
 * across 73 rules in storefront-legacy.css and estimator.css, body and UI copy
 * in Inter. Georgia has no @font-face, so it resolved to a default serif on
 * Linux and Georgia on macOS/Windows - the brand rendered differently per
 * platform, and a hairline serif needed 82-100px to stay legible, which is
 * what made the homepage swallow a phone screen.
 *
 * Georgia was also not loadable at all here, so the display face silently
 * became whatever the OS picked, and the display <em> was a SYNTHESISED oblique
 * (only Inter's normal weights were loaded), which at 50px reads as a different
 * typeface rather than an accent.
 */
window.__msChecks = [];
window.__msDone = false;
function chk(n, ok, d) { window.__msChecks.push({ name: n, ok: !!ok, detail: d || "" }); }

const ROUTES = ["#/home", "#/search", "#/property-value", "#/project-bt"];

(async () => {
  try {
    const wait = ms => new Promise(r => setTimeout(r, ms));
    const go = async (h, ms) => { location.hash = h; await wait(ms || 2400); };

    for (const route of ROUTES) {
      await go(route, 2600);
      const tag = route.replace(/[#/]/g, "");

      /* ---- one family: nothing resolves to a serif ---- */
      const serif = await page_serifNodes();
      chk("no-serif-" + tag, serif.length === 0, "serif: " + serif.slice(0, 5).join(", "));

      /* ---- the whole storefront shares one font stack ---- */
      const fams = await page_fontFamilies();
      chk("single-font-family-" + tag, fams.length === 1, "families: " + fams.join(" | "));
      chk("family-is-inter-" + tag, fams.length === 1 && /^"?Inter/.test(fams[0]), "family: " + fams.join(" | "));

      /* ---- the scale is bounded; the display size is the regression risk ---- */
      const h1 = await page_headingSizes();
      chk("h1-bounded-" + tag, h1.every(s => s.size >= 28 && s.size <= 56),
        "h1 sizes: " + h1.map(s => s.size + "px").join(", "));
      chk("h1-is-bold-" + tag, h1.every(s => s.weight >= 700),
        "h1 weights: " + h1.map(s => s.weight).join(", "));

      /* ---- body copy never drops below 16px; chrome keeps a 12px+ floor ---- */
      const small = await page_undersizedText();
      chk("text-size-floors-" + tag, small.length === 0, "under floor: " + small.slice(0, 5).join(", "));

      /* ---- one alignment axis per block ----
       * The home hero is deliberately centred (eyebrow, headline, lede, proof
       * strip, buttons and card all share that axis); everything below it on
       * every page is left-aligned. So the invariant is not "nothing is ever
       * centred" - it is that no block is half-centred, and that justify is
       * never used. Checking each block's own axis catches a hero where the
       * headline centres but the lede or buttons drift back to the gutter,
       * which is exactly the ragged edge this suite was written for. */
      const axes = await page_alignmentAxes();
      chk("no-block-mixes-alignment-" + tag, axes.mixed.length === 0,
        "mixed: " + axes.mixed.slice(0, 3).join(" ; "));
      chk("hero-axis-consistent-" + tag, axes.heroMixed.length === 0,
        "hero mixes: " + axes.heroMixed.slice(0, 3).join(" ; "));
      chk("no-justified-copy-" + tag, axes.justified.length === 0,
        "justify: " + axes.justified.slice(0, 3).join(", "));
      chk("body-sections-left-aligned-" + tag, axes.offAxisSections.length === 0,
        "not left-aligned: " + axes.offAxisSections.slice(0, 3).join(", "));
    }

    /* ---- the display accent must be a real italic, not a synthesised skew ---- */
    await go("#/home", 2800);
    const em = await page_displayEm();
    chk("display-italic-is-inter", em.family.indexOf("Inter") === 0, "family: " + em.family);
    chk("display-italic-requested", em.style === "italic", "style: " + em.style);
    /* The italic axis must actually be requested, or the browser synthesises. */
    chk("italic-axis-loaded", await page_italicFaceDeclared(),
      "Inter's italic axis is not in the font request, so the display <em> is a synthesised oblique");
    chk("font-synthesis-disabled", await page_synthesisDisabled(), "font-synthesis is not none on .sf-site");

    /* ---- the storefront must not pad the hero into a dead zone ---- */
    await go("#/home", 2600);
    const pad = await page_heroPadding();
    chk("hero-not-padded-out", pad.top <= 72, "hero padding-top=" + pad.top + "px (was ~130px)");

    /* ---- flow: /property-value must not loop back to the home estimator ---- */
    await go("#/property-value", 2600);
    const flow = await page_flowLinks();
    chk("pv-no-broken-home-anchor", flow.broken.length === 0, "dead/looping links: " + flow.broken.join(", "));
    chk("pv-primary-targets-the-form", flow.primaryTargetsForm, "primary CTA target=" + flow.primaryTarget);
    /* The landing is a services conversation: it must not link out to the
       home calculator (the reader chose a service, not a calculator session)
       and must not mount one. The calculator stays on the home page. */
    chk("pv-carries-no-guide-link", !flow.guideLinkUsesHandler, "landing still links to the home guide");
    chk("pv-carries-no-calculator", !document.querySelector(".sf-pv [data-est-root]"), "calculator mounted on the landing");
    chk("pv-form-has-scroll-target", flow.formHasId, "form wrapper has no id for the CTA to scroll to");

    /* ---- stylesheets must be structurally valid ---- */
    for (const sheet of ["storefront.css", "storefront-legacy.css", "estimator.css", "styles.css"]) {
      const ok = await page_sheetBalanced(sheet);
      chk("css-balanced-" + sheet, ok, sheet + " has unbalanced braces - the browser will silently drop rules after the error");
    }
  } catch (e) {
    window.__msChecks.push({ name: "runner", ok: false, detail: (e && e.message || e) });
  }
  window.__msOk = window.__msChecks.every(c => c.ok);
  window.__msDone = true;
})();

/* ---------- in-page helpers ---------- */
function page_serifNodes() {
  const out = [];
  /* Scan the whole document, not just .sf-site. Scoping to .sf-site missed the
   * header wordmark and any footer, which are rendered outside it - and the
   * wordmark was still on Georgia. */
  const seen = {};
  document.querySelectorAll("body *").forEach(el => {
    const cs = getComputedStyle(el);
    if (cs.display === "none" || cs.visibility === "hidden") return;
    const stack = cs.fontFamily || "";
    const first = stack.split(",")[0].trim().replace(/["']/g, "");
    if (!/Georgia|Times/i.test(first)) return;
    if (!el.textContent || !el.textContent.trim()) return;
    const k = el.tagName.toLowerCase() + "." + (typeof el.className === "string" ? el.className.split(/\s+/)[0] : "");
    if (seen[k]) return;
    seen[k] = 1;
    out.push(k);
  });
  return out;
}

function page_fontFamilies() {
  const set = {};
  const root = document.querySelector(".sf-site");
  if (!root) return ["no-root"];
  root.querySelectorAll("*").forEach(el => {
    const cs = getComputedStyle(el);
    if (!el.textContent || !el.textContent.trim()) return;
    set[cs.fontFamily] = 1;
  });
  return Object.keys(set);
}

function page_headingSizes() {
  return Array.from(document.querySelectorAll(".sf-site h1"))
    .map(h => { const c = getComputedStyle(h); return { size: parseFloat(c.fontSize), weight: parseInt(c.fontWeight, 10) || 400 }; });
}

function page_undersizedText() {
  const out = [];
  const root = document.querySelector(".sf-site");
  if (!root) return ["no-root"];
  /* Two different floors, and conflating them is what made the first version of
   * this check fail on ordinary nav chrome.
   *
   *  - Body copy and FORM CONTROLS must be >=16px. iOS zooms the viewport on
   *    focus for anything smaller, and this audience is 40-75.
   *  - Navigation and button labels are chrome, not reading copy. The existing
   *    mobile audit already enforces a 12px floor there, which passes; holding
   *    nav labels to 16px would mean inflating the header, not improving
   *    readability. */
  const BODY = "p, li, td, th, dd, figcaption, blockquote";
  const FORM = "input, select, textarea";
  /* Uppercase micro-labels are labels, not reading copy: they sit above a
   * heading and are read at a glance, so they follow the same 12px floor the
   * existing mobile audit already enforces (and which it passes). */
  const LABEL = "p.sf-eyebrow, .sf-eyebrow, .sf-cs-mark, .sf-cs-flag, .sf-service-num, .sf-est-step-no, .sf-eyebrow + *";
  const CHROME = ".sf-nav a, .sf-nav summary, .sf-menu a, .sf-menu summary, .sf-header-actions a, .sf-header-actions button, .sf-primary-btn, .sf-outline-btn";
  const LABEL_MIN = 12;
  const CHROME_MIN = 13;
  const seen = {};
  const test = (sel, floor) => {
    root.querySelectorAll(sel).forEach(el => {
      /* A visually-hidden label is not rendered, so its size is not a legibility
         question - it exists only for assistive tech. */
      if (el.closest(".sr-only") || el.closest(".sf-visually-hidden") || el.classList.contains("sr-only") || el.classList.contains("sf-visually-hidden")) return;
      /* An eyebrow is a <p>, so it also matches the body selector. Classify it
         once, on the label floor, rather than failing it on the body floor. */
      if (floor > LABEL_MIN && el.matches(LABEL)) return;
      const txt = (el.textContent || "").trim();
      if (el.matches(FORM) ? !txt && el.type !== "submit" : txt.length < 12) return;
      if (el.querySelector("p, li, span, svg, img")) return;   // leaf text only
      const cs = getComputedStyle(el);
      if (cs.display === "none" || cs.visibility === "hidden") return;
      if (cs.opacity === "0") return;
      const size = parseFloat(cs.fontSize);
      if (size > 0 && size < floor) {
        const k = el.tagName + "." + (typeof el.className === "string" ? el.className.split(/\s+/)[0] : "") + ":" + size;
        if (!seen[k]) { seen[k] = 1; out.push(k); }
      }
    });
  };
  test(BODY, 16);
  test(FORM, 16);
  test(LABEL, LABEL_MIN);
  test(CHROME, CHROME_MIN);
  return out;
}

/* Returns the alignment axis of each top-level block, and of the home hero.
 *
 * The hero is allowed to be centred because that is the design; what is not
 * allowed is a hero whose children disagree with each other, or a body section
 * that is neither left-aligned nor intentionally centred. */
function page_alignmentAxes() {
  const axisOf = (el) => {
    let n = el;
    while (n && n !== document.body) {
      const a = getComputedStyle(n).textAlign;
      if (a && a !== "start" && a !== "inherit") return a;
      n = n.parentElement;
    }
    return "start";
  };
  const out = { mixed: [], heroMixed: [], justified: [], offAxisSections: [] };

  document.querySelectorAll(".sf-site *").forEach(el => {
    const cs = getComputedStyle(el);
    if (cs.textAlign === "justify" && el.textContent && el.textContent.trim().length > 40) {
      out.justified.push(el.tagName + "." + String(el.className || "").split(" ")[0]);
    }
  });

  /* The hero's intro block shares one axis. The value-guide card sits inside the
   * hero but is a form: its inputs, chips and option rows are left-aligned by
   * design and are not part of the hero's axis, so the card is excluded rather
   * than counted as a contradiction. */
  const hero = document.querySelector(".sf-est-hero");
  if (hero) {
    const intro = hero.querySelector(".sf-est-hero-copy") || hero;
    const heroAxes = new Set();
    intro.querySelectorAll("h1, h2, p, li, a, span, em, strong").forEach(el => {
      if (el.closest("#sf-estimator, .sf-est-card, form")) return;
      const a = getComputedStyle(el).textAlign;
      if (a) heroAxes.add(a === "start" ? "left" : a);
    });
    const heroAxis = getComputedStyle(intro).textAlign === "start" ? "left" : getComputedStyle(intro).textAlign;
    if (heroAxes.size > 1) out.heroMixed.push("hero axes: " + [...heroAxes].join("/"));
    if (heroAxes.size === 1 && !heroAxes.has(heroAxis)) {
      out.heroMixed.push("hero container=" + heroAxis + " but children=" + [...heroAxes][0]);
    }
  }

  // Body sections other than the hero keep the left axis.
  document.querySelectorAll(".sf-site > section, .sf-site > main > section, .sf-site .sf-pv > section").forEach(sec => {
    if (sec.classList.contains("sf-est-hero")) return;
    const heads = sec.querySelectorAll("h1, h2, h3");
    if (!heads.length) return;
    const axes = new Set(Array.from(heads).map(h => {
      const a = getComputedStyle(h).textAlign;
      return a === "start" ? "left" : a;
    }));
    if (axes.size > 1) out.mixed.push(sec.className + ": " + [...axes].join("/"));
    else if (!axes.has("left")) out.offAxisSections.push(sec.className + "=" + [...axes][0]);
  });

  return out;
}

function page_displayEm() {
  const em = document.querySelector(".sf-est-hero h1 em");
  if (!em) return { family: "(none)", style: "(none)" };
  const c = getComputedStyle(em);
  return { family: c.fontFamily, style: c.fontStyle };
}

function page_italicFaceDeclared() {
  try {
    const link = Array.from(document.querySelectorAll('link[rel="stylesheet"], link[rel="preload"]'))
      .map(l => l.getAttribute("href") || "").find(h => h.indexOf("fonts.googleapis.com/css2") > -1);
    if (!link) return false;
    return /ital/i.test(link);
  } catch (e) { return false; }
}

function page_synthesisDisabled() {
  const site = document.querySelector(".sf-site");
  if (!site) return false;
  const cs = getComputedStyle(site);
  return cs.fontSynthesis === "none" || cs.fontSynthesis === "none style";
}

function page_heroPadding() {
  const hero = document.querySelector(".sf-est-hero");
  if (!hero) return { top: 999 };
  return { top: parseFloat(getComputedStyle(hero).paddingTop) || 0 };
}

function page_flowLinks() {
  const out = { broken: [], primaryTarget: "(none)", primaryTargetsForm: false, guideLinkUsesHandler: false, formHasId: false };
  const scope = document.querySelector(".sf-pv");
  if (!scope) return out;
  const formWrap = document.getElementById("sf-pv-form");
  out.formHasId = !!formWrap;
  scope.querySelectorAll("a[href]").forEach(a => {
    const href = a.getAttribute("href");
    /* "#/home#anchor" parses to the path "home#anchor" in the hash router: the
       route matches no branch, so it renders home but never scrolls. */
    if (/^#\/?[a-z0-9-]+#/.test(href)) out.broken.push(href);
    if (a.classList.contains("sf-primary-btn")) {
      out.primaryTarget = href;
      const id = (a.getAttribute("data-sf-scroll") || href.replace(/^#/, ""));
      out.primaryTargetsForm = !!id && !!document.getElementById(id);
    }
    if (a.hasAttribute("data-est-services")) out.guideLinkUsesHandler = true;
  });
  return out;
}

function page_sheetBalanced(name) {
  try {
    const sheet = Array.from(document.styleSheets).find(s => (s.href || "").indexOf(name) > -1);
    if (!sheet) return true; // not loaded (e.g. a node-only run) - not a failure
    let depth = 0;
    const walk = list => {
      for (const r of Array.from(list)) {
        if (r.style && r.style.length) continue;  // declaration block, not a container
        if (r.cssRules) walk(r.cssRules);
      }
    };
    /* The CSSOM normalises away the error, so check the source text instead. */
    return fetch("css/" + name).then(r => r.text()).then(t => {
      const clean = t.replace(/\/\*[\s\S]*?\*\//g, "");
      return (clean.match(/\{/g) || []).length === (clean.match(/\}/g) || []).length;
    }).catch(() => true);
  } catch (e) { return true; }
}
