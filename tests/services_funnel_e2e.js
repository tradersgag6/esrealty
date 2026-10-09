"use strict";
/* Services nav -> Get My Property Value landing (selling services).
 *
 * The landing is deliberately a services conversation, not a calculator:
 *  - every Services dropdown item lands on a real destination; services
 *    without a page of their own route to #/property-value?service=..., never
 *    to the homepage services section,
 *  - the landing carries NO value calculator (the calculator stays on the
 *    home page),
 *  - the service param adapts the hero, document title and primary CTA,
 *  - the consult form preselects the chosen service,
 *  - the home page still embeds the working guide.
 */
window.__msChecks = [];
window.__msDone = false;
function chk(n, ok, d) { window.__msChecks.push({ name: n, ok: !!ok, detail: d || "" }); }

(async () => {
  try {
    const wait = ms => new Promise(r => setTimeout(r, ms));
    const go = async (h, ms) => { location.hash = h; await wait(ms || 1800); };
    const q = s => document.querySelector(s);

    await go("#/home", 2400);

    /* ---- Services dropdown: broker item, real destinations, no bounce ---- */
    const svc = Array.from(document.querySelectorAll(".sf-nav [data-sf-drop]"))
      .find(d => (d.querySelector("summary").textContent || "").indexOf("Services") === 0);
    const items = svc ? Array.from(svc.querySelectorAll(".sf-drop-panel a")) : [];
    chk("services-nine-items", items.length === 9, "items=" + items.length);
    chk("services-no-homepage-bounce", items.every(a => (a.getAttribute("href") || "").indexOf("#/home?section=services") === -1), JSON.stringify(items.map(a => a.getAttribute("href"))));
    const broker = items.find(a => /Talk to a licensed broker/.test(a.textContent));
    chk("services-broker-item-present", !!broker, "items=" + items.length);
    chk("services-broker-target", !!broker && broker.getAttribute("href") === "#/property-value?service=broker", broker && broker.getAttribute("href"));

    /* ---- home keeps the calculator ---- */
    chk("home-still-has-calculator", !!q("#sf-estimator[data-est-root]") && !!q("[data-est-root] [data-est-card]"), "no calculator on home");

    /* ---- the broker landing is a services page, not a calculator ---- */
    await go("#/property-value?service=broker", 2400);
    chk("broker-page-hero", /Talk to a licensed broker/.test((q(".sf-pv-hero h1") || {}).textContent || ""), "h1=" + ((q(".sf-pv-hero h1") || {}).textContent));
    chk("broker-page-title", document.title === "Talk to a licensed broker | SEA ESTATES", "title=" + document.title);
    chk("broker-page-cta", /Talk to a licensed broker/.test((q(".sf-pv-actions .sf-primary-btn") || {}).textContent || ""), "cta=" + ((q(".sf-pv-actions .sf-primary-btn") || {}).textContent));
    chk("landing-has-no-calculator", !q(".sf-pv [data-est-root]") && !q(".sf-pv [data-est-card]"), "calculator leaked onto the landing");
    chk("landing-fallback-form", !!q(".sf-pv-form[data-sf-consult]"), "no consult form");
    const planningSelect = q(".sf-pv-form select[name=message]");
    chk("fallback-preselects-broker", !!planningSelect && planningSelect.value === "Talk to a licensed broker", "value=" + (planningSelect && planningSelect.value));
    /* The option value must be the human label, not the service key: the key
       used to be posted verbatim as the lead's message. */
    chk("planning-posts-human-label", !!planningSelect && planningSelect.value === planningSelect.options[planningSelect.selectedIndex].textContent, "value=" + (planningSelect && planningSelect.value));
    chk("broker-submit-label", /Request broker contact/.test((q(".sf-pv-form button[type=submit]") || {}).textContent || ""), "submit=" + ((q(".sf-pv-form button[type=submit]") || {}).textContent));

    /* ---- a different service still adapts the page ---- */
    await go("#/property-value?service=finance", 2200);
    chk("finance-page-hero", /Plan the financing/.test((q(".sf-pv-hero h1") || {}).textContent || ""), "h1=" + ((q(".sf-pv-hero h1") || {}).textContent));
    chk("finance-page-title", document.title === "Financing support | SEA ESTATES", "title=" + document.title);
    chk("finance-preselects-fallback", (q(".sf-pv-form select[name=message]") || {}).value === "Financing options", "value=" + ((q(".sf-pv-form select[name=message]") || {}).value));

    /* ---- the default landing keeps the first-person CTA promise ---- */
    await go("#/property-value", 2200);
    chk("default-landing-hero", /Get my property value/.test((q(".sf-pv-hero h1") || {}).textContent || ""), "h1=" + ((q(".sf-pv-hero h1") || {}).textContent));
    chk("default-landing-no-calculator", !q(".sf-pv [data-est-root]"), "calculator mounted on the default landing");
    chk("default-cta-scrolls-to-form", (q(".sf-pv-actions .sf-primary-btn") || {}).getAttribute("data-sf-scroll") === "sf-pv-form", "cta target missing");
    chk("default-no-obligation-note", /no obligation/i.test((q(".sf-pv") || {}).textContent || ""), "no obligation note missing");
    /* No "Choose one" gate on the default landing: the first meaningful answer
       is already selected, so a visitor can submit without opening the select. */
    const defaultSelect = q(".sf-pv-form select[name=message]");
    chk("default-preselects-first-answer", !!defaultSelect && defaultSelect.value === "Just want to know my property value", "value=" + (defaultSelect && defaultSelect.value));
  } catch (e) {
    window.__msChecks.push({ name: "runner", ok: false, detail: (e && e.message || e) });
  }
  window.__msOk = window.__msChecks.every(c => c.ok);
  window.__msDone = true;
})();
