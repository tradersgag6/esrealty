/* Compliance expiry-window math (RA 9646 / DHSUD renewal tracking).
 * UMD: browser gets window.ESREALTY_DUE, Node gets module.exports.
 * Kept split out of app.js so the node test locks the same shipped logic
 * instead of a re-implemented reference. */
(function (root, factory) {
  if (typeof module === "object" && module.exports) module.exports = factory();
  else root.ESREALTY_DUE = factory();
})(typeof self !== "undefined" ? self : this, function () {
  "use strict";
  var DAYS_EXPIRING = 60;
  function complianceWindowDays(dateStr) {
    var text = dateStr == null ? "" : String(dateStr).slice(0, 10);
    var t = /^\d{4}-\d{2}-\d{2}$/.test(text)
      ? Date.UTC(+text.slice(0, 4), +text.slice(5, 7) - 1, +text.slice(8, 10))
      : (text ? NaN : null);
    if (t == null || isNaN(t)) return { label: "Active", cls: "green", due: false, days: null };
    var now = new Date();
    var startNow = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
    var d = Math.round((t - startNow) / 86400000);
    if (d < 0) return { label: "Expired " + Math.abs(d) + "d", cls: "red", due: true, days: d };
    if (d <= DAYS_EXPIRING) return { label: "Expiring in " + d + "d", cls: "gold", due: true, days: d };
    return { label: "Active - " + d + "d", cls: "green", due: false, days: d };
  }
  return { DAYS_EXPIRING: DAYS_EXPIRING, complianceWindowDays: complianceWindowDays };
});