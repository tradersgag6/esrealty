"use strict";
/* Shared value-guide mount contract (Task 11).
 *
 * js/value_guide_ui.js is the single entry point both hosts call:
 *   mountGuide(container, { mode: "public" | "agent" })
 *
 * This file asserts what the module must always provide:
 * - publicMarkup() renders the estimator card contract ([data-est-root] /
 *   [data-est-card]) so the estimator's auto-mount can bind to it.
 * - mountGuide() without a live DOM returns the markup without throwing.
 * - agentMarkup() never returns empty; it falls back to the public card when
 *   the app guide renderer is not present.
 */
const assert = require("assert"), fs = require("fs"), path = require("path"), vm = require("vm");
const ROOT = path.join(__dirname, "..");

/* Load the module in a Node sandbox with a stub window so the UMD factory runs
   without a browser. */
const src = fs.readFileSync(path.join(ROOT, "js/value_guide_ui.js"), "utf8");
const sandbox = { module: { exports: {} }, window: undefined };
vm.runInNewContext(src, sandbox, { filename: "value_guide_ui.js" });
const UI = sandbox.module.exports;
assert.ok(UI, "the module exports");

let count = 0;
function check(name, fn) { fn(); count++; console.log("[PASS] " + name); }

check("exports the mount entry point and both renderers", () => {
  assert.strictEqual(typeof UI.mountGuide, "function");
  assert.strictEqual(typeof UI.publicMarkup, "function");
  assert.strictEqual(typeof UI.agentMarkup, "function");
});

check("public markup carries the estimator card contract", () => {
  /* The estimator's auto-mount binds to [data-est-root] and renders into
     [data-est-card]. If either is missing the guide renders nothing. */
  const html = UI.publicMarkup();
  assert.ok(/data-est-root/.test(html), "the root hook is present");
  assert.ok(/data-est-card/.test(html), "the card hook is present");
  assert.ok(html.length > 0, "and the markup is not empty");
});

check("mountGuide returns the markup and does not need a live container", () => {
  const html = UI.mountGuide(null, { mode: "public" });
  assert.strictEqual(typeof html, "string");
  assert.ok(html.length > 0);
  /* An invalid mode falls back to public rather than failing. */
  const weird = UI.mountGuide(null, { mode: "banana" });
  assert.strictEqual(weird, html, "unknown mode falls back to public");
});

check("agent markup falls back to the public card when the app guide is absent", () => {
  /* With the estimator present but the app guide renderer absent, agent mode
     falls back to the public card so the container is never empty. */
  const estStub = { cardSection: function () { return '<section class="sf-section sf-est" id="sf-estimator" data-est-root><div class="sf-est-card" data-est-card><p class="sf-est-empty">x</p></div></section>'; } };
  const sandbox2 = { module: { exports: {} }, window: { ESREALTY_EST: estStub } };
  vm.runInNewContext(src, sandbox2, { filename: "value_guide_ui.js" });
  const html = sandbox2.module.exports.agentMarkup();
  assert.ok(html.length > 0, "agent markup is never empty");
  assert.ok(/data-est-root/.test(html), "and falls back to the estimator contract");
  /* Without the estimator at all, agent mode says so honestly rather than
     inventing a number. */
  const html2 = UI.agentMarkup();
  assert.ok(html2.length > 0, "still non-empty");
  assert.ok(/unavailable/.test(html2), "and states the guide is unavailable");
});

check("the storefront calls the shared module, not cardSection directly", () => {
  /* The point of the seam: js/storefront.js must route through
     ESREALTY_GUIDE_UI.publicMarkup, so a future redesign has one place to
     change. If this fails, someone re-introduced a direct call. */
  const sf = fs.readFileSync(path.join(ROOT, "js/storefront.js"), "utf8");
  assert.ok(sf.indexOf("ESREALTY_GUIDE_UI.publicMarkup") > -1,
    "storefront uses the shared public renderer");
  /* It may still reference cardSection as a fallback, but the primary path is
     the shared module. */
});

check("the app exposes the agent guide renderer for mountGuide", () => {
  const app = fs.readFileSync(path.join(ROOT, "js/app.js"), "utf8");
  assert.ok(app.indexOf("ESREALTY_APP_GUIDE = { render: renderValueGuide }") > -1,
    "app.js exposes the agent guide renderer");
});

console.log("ALL GREEN (" + count + " checks)");