"use strict";
/* Guards for the defects that shipped in Workstream B.
 *
 * Each of these passed the suite at the time it shipped, which is the point:
 *
 *  1. The Project B.T email field was 31px wide. The markup put <input> INSIDE a
 *     <label class="sr-only">, so the visually-hidden rule clipped the field
 *     along with the label text. ui_public_nav_e2e asserted the input EXISTED
 *     and that consent was required - and a separate check asserted .sr-only
 *     correctly hid its element to <=1px. Both passed while the form was
 *     impossible to fill in. Nothing checked that the field was USABLE.
 *  2. "No obligation. No obligation to sell, and no obligation to list with us."
 *     - a literal duplication of the phrase.
 *  3. <br> inside <h1> read as "Get myproperty value." to assistive tech and
 *     anything that concatenates text.
 *  4. The closed shophouse campaign was still the live homepage's call to
 *     action, because siteContact's defaults were shophouse-branded and
 *     applyContact() overwrote the page's own copy with them. The existing
 *     closed-page test only checked the parked PAGES, not the defaults.
 *  5. Secondary buttons stretched to 576px and every button anchor was
 *     underlined.
 */
window.__msChecks = [];
window.__msDone = false;
function chk(n, ok, d) { window.__msChecks.push({ name: n, ok: !!ok, detail: d || "" }); }

(async () => {
  try {
    const wait = ms => new Promise(r => setTimeout(r, ms));
    const go = async (h, ms) => { location.hash = h; await wait(ms || 1800); };

    /* Every form field on every public route must be big enough to use. */
    const ROUTES = ["#/home", "#/search", "#/property-value", "#/project-bt"];
    for (const route of ROUTES) {
      await go(route, 2200);
      const bad = await page_usableFields();
      chk("fields-usable-" + route.replace(/[#/]/g, ""), bad.length === 0, bad.join(" | "));
    }

    /* ---- heading text integrity: no run-together words ---- */
    for (const route of ROUTES) {
      await go(route, 2000);
      const headings = await page_headingText();
      const joined = headings.filter(h => /\b[a-z]{2,}[A-Z][a-z]/.test(h) || /[a-z],[a-z]/.test(h) || /\bmy[A-Za-z]{3,}\b/.test(h));
      chk("heading-text-clean-" + route.replace(/[#/]/g, ""), joined.length === 0, joined.join(" | "));
      /* No <br> inside a live heading either - it is what caused the join. */
      const brs = await page_brInHeadings();
      chk("no-br-in-live-headings-" + route.replace(/[#/]/g, ""), brs.length === 0, brs.join(" | "));
    }

    /* ---- no duplicated phrase ---- */
    await go("#/property-value", 2000);
    const body = (document.body.innerText || "").replace(/\s+/g, " ");
    chk("no-dup-no-obligation", !/No obligation\.?\s*No obligation/i.test(body),
      "found: " + (body.match(/.{0,20}No obligation\.?\s*No obligation.{0,30}/i) || [""])[0]);
    chk("no-dup-phrase-anywhere", !/\b(\w+ \w+)\.\s*\1\b/i.test(body),
      "doubled sentence: " + (body.match(/\b(\w+ \w+)\.\s*\1\b/i) || [""])[0]);

    /* ---- closed-campaign copy must not appear anywhere live ---- */
    const CLOSED = ["shophouse specialist", "ground floor", "shop house specialist"];
    for (const route of ROUTES) {
      await go(route, 2000);
      const text = (document.body.innerText || "").toLowerCase();
      const hit = CLOSED.filter(c => text.indexOf(c) > -1);
      chk("no-closed-copy-" + route.replace(/[#/]/g, ""), hit.length === 0, "leaked: " + hit.join(", "));
    }

    /* ---- buttons: not stretched, not underlined ---- */
    for (const route of ["#/property-value", "#/project-bt"]) {
      await go(route, 2000);
      const btns = await page_buttonGeom();
      chk("buttons-not-underlined-" + route.replace(/[#/]/g, ""), btns.every(b => !b.underlined),
        btns.filter(b => b.underlined).map(b => b.label).join(", "));
      chk("buttons-not-stretched-" + route.replace(/[#/]/g, ""), btns.filter(b => !b.isFormSubmit).every(b => b.w < 420),
        btns.filter(b => !b.isFormSubmit && b.w >= 420).map(b => b.label + "=" + b.w).join(", "));
      /* A submit may legitimately span its form (the appraisal request) or stay
         compact (the "Notify me" box is `justify-self: start`). Constraining its
         width tests a design decision rather than a defect, so assert the real
         risk instead: it must stay inside its form. */
      chk("form-submits-contained-" + route.replace(/[#/]/g, ""), btns.filter(b => b.isFormSubmit).every(b => b.contained),
        btns.filter(b => b.isFormSubmit && !b.contained).map(b => b.label + "=" + b.w).join(", "));
      chk("buttons-tappable-" + route.replace(/[#/]/g, ""), btns.every(b => b.h >= 44),
        btns.filter(b => b.h < 44).map(b => b.label + "=" + b.h).join(", "));
    }

    /* ---- the notify form can actually be completed ---- */
    await go("#/project-bt", 2200);
    const form = await page_notifyForm();
    chk("notify-email-usable", form.w >= 200, "email field w=" + form.w);
    chk("notify-email-has-visible-label", form.visibleLabel, "no visible label on the email field");
    chk("notify-submit-reachable", form.submitInView, "submit at y=" + form.submitY + " vh=" + form.vh);
    chk("notify-no-hidden-field", form.hiddenFields === 0, "hidden fields=" + form.hiddenFields);

    /* ---- the homepage contact band keeps its own copy ---- */
    await go("#/home", 2400);
    const band = (document.querySelector("#sf-contact") || {}).innerText || "";
    chk("home-band-not-shophouse", !/shophouse|ground floor/i.test(band), "band=" + band.replace(/\s+/g, " ").slice(0, 100));
    chk("home-band-has-service-copy", /buying|selling|valuing|reviewing/i.test(band),
      "band=" + band.replace(/\s+/g, " ").slice(0, 100));
  } catch (e) {
    window.__msChecks.push({ name: "runner", ok: false, detail: (e && e.message || e) });
  }
  window.__msOk = window.__msChecks.every(c => c.ok);
  window.__msDone = true;
})();

/* ---------- in-page helpers ---------- */
function page_usableFields() {
  const out = [];
  const vw = document.documentElement.clientWidth;
  document.querySelectorAll(".sf-site input, .sf-site select, .sf-site textarea").forEach(el => {
    if (el.type === "hidden" || el.type === "checkbox" || el.type === "radio" || el.type === "submit" || el.type === "button") return;
    const cs = getComputedStyle(el);
    if (cs.display === "none" || cs.visibility === "hidden") return;
    /* an ancestor that clips to a 1px box hides the field too */
    let a = el.parentElement, clipped = false;
    while (a && a !== document.body) {
      const acs = getComputedStyle(a);
      if (acs.clipPath === "inset(50%)" || (acs.overflow === "hidden" && a.getBoundingClientRect().width <= 2)) { clipped = true; break; }
      a = a.parentElement;
    }
    if (clipped) { out.push(el.name + ":clipped-by-ancestor"); return; }
    const r = el.getBoundingClientRect();
    if (r.width < 40 || r.height < 16) {
      out.push((el.name || el.type) + ":" + Math.round(r.width) + "x" + Math.round(r.height));
      return;
    }
    if (r.right > vw + 1) out.push((el.name || el.type) + ":overflows:" + Math.round(r.right - vw));
  });
  return out;
}

function page_headingText() {
  return Array.from(document.querySelectorAll(".sf-site h1, .sf-site h2, .sf-site h3"))
    .map(h => (h.textContent || "").replace(/\s+/g, " ").trim())
    .filter(t => t.length > 3);
}

function page_brInHeadings() {
  const out = [];
  document.querySelectorAll(".sf-site h1, .sf-site h2, .sf-site h3").forEach(h => {
    /* the parked Project B.T page is intentionally excluded from the storefront */
    if (h.closest(".bt-site")) return;
    if (h.querySelector("br")) out.push((h.textContent || "").trim().slice(0, 40));
  });
  return out;
}

function page_buttonGeom() {
  return Array.from(document.querySelectorAll(".sf-site a.sf-primary-btn, .sf-site a.sf-outline-btn, .sf-site button.sf-primary-btn"))
    .filter(b => { const r = b.getBoundingClientRect(); return r.width > 0 && r.height > 0; })
    .map(b => {
      const r = b.getBoundingClientRect();
      const cs = getComputedStyle(b);
      /* A submit inside a form is meant to span the form. The bug was the
         secondary ACTION LINK stretching to 576px next to a 180px primary, so
         only non-submit controls are held to the inline width budget. */
      const isFormSubmit = b.tagName === "BUTTON" && b.type === "submit" && !!b.closest("form");
      const formEl = b.closest("form");
      const fw = formEl ? formEl.getBoundingClientRect().width : 0;
      return {
        label: (b.textContent || "").trim().slice(0, 22),
        w: Math.round(r.width), h: Math.round(r.height),
        isFormSubmit: isFormSubmit,
        contained: !isFormSubmit || (fw > 0 && r.width <= fw + 1),
        underlined: cs.textDecorationLine.indexOf("underline") > -1
      };
    });
}

function page_notifyForm() {
  const input = document.querySelector("[data-sf-notify] input[type=email]");
  const submit = document.querySelector("[data-sf-notify] button[type=submit]");
  const r = input ? input.getBoundingClientRect() : { width: 0 };
  const sr = submit ? submit.getBoundingClientRect() : { top: -1, bottom: -1 };
  const label = input ? input.closest("label") : null;
  const labelText = label ? (label.querySelector("span") || {}).textContent || "" : "";
  let hidden = 0;
  document.querySelectorAll("[data-sf-notify] input, [data-sf-notify] button").forEach(el => {
    const rr = el.getBoundingClientRect();
    if (rr.width < 8 || rr.height < 8) hidden++;
  });
  return {
    w: Math.round(r.width),
    visibleLabel: !!labelText && !label.classList.contains("sr-only"),
    submitInView: sr.top < window.innerHeight,
    submitY: Math.round(sr.top),
    vh: window.innerHeight,
    hiddenFields: hidden
  };
}
