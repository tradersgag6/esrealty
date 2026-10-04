"use strict";
window.__msChecks = []; window.__msDone = false;
const check = (name, ok, detail = "") => window.__msChecks.push({ name, ok: !!ok, detail });
const wait = ms => new Promise(r => setTimeout(r, ms));
const q = selector => document.querySelector(selector);
(async () => {
  const oldFetch = window.fetch, oldBase = window.ESREALTY_API_BASE, api = window.ESREALTY_LISTINGS_API, oldContact = api.contact;
  try {
    location.hash = "#/home"; await wait(2500);
    const est = window.ESREALTY_EST;
    const result = await est.estimate({ municipality: "BAUAN", barangay: "POBLACION III", streetKey: "binay st ressurreccion st", classification: "RR", area: 100, type: "vacant_lot", purpose: "Selling" });
    est._state().result = result; est._state().leadSubmitted = false; est._state().leadOpen = false; est.debug.render(4);
    q("[data-est-email-open]").click();
    const form = q("[data-est-lead-form]");
    check("email purpose and optional phone", !form.elements.phone.required && /Email my guide/.test(form.querySelector("h3").textContent));
    form.elements.name.value = "Delivery fixture"; form.elements.email.value = "fixture@example.com"; form.elements.consent.checked = true;
    window.ESREALTY_API_BASE = "https://example.invalid/functions/v1/listing-api/api";
    let fallback = 0, responseMode = "error"; const posts = [];
    api.contact = async () => { fallback++; return { id: "unexpected-fallback" }; };
    window.fetch = async (url, options) => {
      if (String(url).endsWith("/location-report")) {
        posts.push({ key: options.headers["Idempotency-Key"], data: JSON.parse(options.body) });
        if (responseMode === "error") return new Response(JSON.stringify({ error: "Service busy, retry this request" }), { status: 503 });
        if (responseMode === "bad-json") return new Response("unparseable response", { status: 200 });
        return new Response(JSON.stringify({ inquiry: { id: "fixture-saved" }, pdfSent: responseMode === "emailed" }), { status: 201 });
      }
      return oldFetch(url, options);
    };
    form.querySelector('button[type="submit"]').click(); await wait(250);
    check("custom HTTP error surfaced without contact fallback", /Service busy/.test(q("[data-est-lead-status]").textContent) && fallback === 0);
    responseMode = "bad-json"; form.querySelector('button[type="submit"]').click(); await wait(250);
    check("malformed HTTP response cannot create a second contact", fallback === 0 && !!q("[data-est-lead-form]"));
    check("retry reuses idempotency key", posts.length === 2 && posts[0].key === posts[1].key);
    responseMode = "saved"; form.querySelector('button[type="submit"]').click(); await wait(250);
    check("saved request never implies email delivery", /saved/.test(q("[data-est-lead-status]").textContent) && /no emailed delivery has been confirmed/.test(q("[data-est-lead-status]").textContent));
    check("email request distinct from professional consultation", posts[2].data.service_requested === "valuation-report" && posts[2].data.inquiry_type === "location-analysis");
    check("posted report keeps central estimate, range and BIR separate", posts[2].data.report.estimate.marketGuideEstimate === 2875000 && posts[2].data.report.estimate.low === 2443750 && posts[2].data.report.estimate.birZonalValue === 1150000);
    check("results stay visible after submission", !!q(".sf-est-result-value") && !q(".sf-est-price-lock"));
  } catch (e) { check("runner", false, e.message); }
  finally { window.fetch = oldFetch; window.ESREALTY_API_BASE = oldBase; api.contact = oldContact; }
  window.__msOk = window.__msChecks.every(c => c.ok); window.__msDone = true;
})();
