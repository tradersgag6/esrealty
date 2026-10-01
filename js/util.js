/* Shared helpers. One implementation, loaded before the modules that use it.
 *
 * esc() was previously duplicated three times — in app.js, estimator.js and
 * storefront.js — as byte-identical logic. Duplicated escaping is the classic
 * way an XSS fix lands in one file and silently misses the other two, so this
 * is the single place to change.
 *
 * Each consumer keeps a local fallback because the Node test suite requires
 * these modules directly (tests/estimator_core_node.js and friends), where no
 * window is present. The fallback is byte-identical, so behaviour is unchanged
 * in either environment. */
(function () {
  "use strict";
  var ESCAPES = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" };
  var util = window.ESREALTY_UTIL || (window.ESREALTY_UTIL = {});
  util.esc = function (value) {
    return String(value == null ? "" : value).replace(/[&<>"']/g, function (ch) { return ESCAPES[ch]; });
  };
  /* Join class names, dropping falsy entries. New code should prefer this over
   * hand-built className strings. */
  util.cls = function () {
    var out = [];
    for (var i = 0; i < arguments.length; i++) {
      var a = arguments[i];
      if (!a) continue;
      if (typeof a === "string") { out.push(a); continue; }
      if (typeof a === "object") {
        for (var k in a) { if (Object.prototype.hasOwnProperty.call(a, k) && a[k]) out.push(k); }
      }
    }
    return out.join(" ");
  };
})();
