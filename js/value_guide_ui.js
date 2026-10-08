/* Shared entry point for mounting the value guide on either host.
 *
 * Two surfaces exist and both already call the same calculation contract
 * (EST.estimate / FLOW.compute over the same BIR data and zonal config — see
 * tests/value_guide_contract_node.js, which pins identical result fields on
 * both). What they did NOT share was the mount decision: the storefront called
 * ESREALTY_EST.cardSection() directly and the agent view reached into the same
 * estimator module by its own path, so the two hosts could drift in which
 * renderer they used.
 *
 * This module is the single seam both hosts call:
 *
 *   mountGuide(container, { mode: "public" | "agent" })
 *
 * - "public" renders the storefront estimator card into the container. The
 *   estimator module auto-binds to its own [data-est-root] on DOMContentLoaded,
 *   so no extra binding is needed here — the same mount the old cardSection()
 *   produced.
 * - "agent" renders the internal agent value-guide view into the container.
 *   That view lives in js/app.js and is reachable through its own router; this
 *   mode exists so a host that wants the agent guide in a specific container
 *   has one call instead of reaching into app internals.
 *
 * Neither mode duplicates the calculation. Both return the estimator's markup,
 * which renders from the shared result object.
 */
(function (root, factory) {
  var api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  root.ESREALTY_GUIDE_UI = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";

  function estimator() {
    return (typeof window !== "undefined" && window.ESREALTY_EST) || null;
  }

  function publicMarkup() {
    var est = estimator();
    /* The estimator owns the card markup. If it has not loaded, return the same
       empty card the estimator itself renders pre-load so the DOM contract
       ([data-est-root] / [data-est-card]) exists and its mount can bind. */
    return (est && est.cardSection)
      ? est.cardSection()
      : '<section class="sf-section sf-est" id="sf-estimator" data-est-root><div class="sf-est-card" data-est-card><p class="sf-est-empty">Loading the Batangas Value Guide.</p></div></section>';
  }

  function agentMarkup() {
    var est = estimator();
    if (!est) return '<div class="card card-pad"><h3>Value Guide unavailable</h3><p class="dim">The estimator module did not load, so no reference data is available.</p></div>';
    /* The agent view reads the same reference tables through the estimator and
       renders its own three-step flow. If the app bundle exposes it, use it;
       otherwise fall back to the public card so the container is never empty. */
    var app = (typeof window !== "undefined" && window.ESREALTY_APP_GUIDE) || null;
    if (app && typeof app.render === "function") return app.render();
    return publicMarkup();
  }

  /* Mount into a live container element. Returns the rendered markup. */
  function mountGuide(container, opts) {
    opts = opts || {};
    var mode = opts.mode === "agent" ? "agent" : "public";
    var html = mode === "agent" ? agentMarkup() : publicMarkup();
    if (container && typeof container === "object" && container.nodeType === 1) {
      container.innerHTML = html;
      /* Public mode: the estimator binds on DOMContentLoaded. If the app mounts
         this after that event (e.g. after a client-side route change), trigger
         the same mount path the estimator uses on load. */
      if (mode === "public") {
        var est = estimator();
        if (est && typeof est.mount === "function" && document.readyState !== "loading") {
          try { est.mount(); } catch (e) { /* non-fatal; the estimator logs its own state */ }
        }
      }
    }
    return html;
  }

  return { mountGuide: mountGuide, publicMarkup: publicMarkup, agentMarkup: agentMarkup };
});