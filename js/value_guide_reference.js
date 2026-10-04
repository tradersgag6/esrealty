/* Provenance and optional land-reference indexing. Neither manual growth nor
   a dated asking index changes an official schedule or proves market value. */
(function (root, factory) {
  var api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  root.ESREALTY_REFERENCE = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";
  var labels = { "effective-verified": "Effective applicability verified", "applicability-unverified": "Latest applicability unverified", "proposed": "Proposed — not an active reference", "superseded": "Superseded reference", "approved-not-effective": "Certified but not yet effective", "not-obtained": "Certified schedule not obtained" };
  function day(value) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(String(value || ""))) return null;
    var time = Date.parse(value);
    return isFinite(time) && new Date(time).toISOString().slice(0, 10) === value ? time : null;
  }
  function normalize(v) { return String(v || "").toUpperCase().replace(/\s+/g, " ").trim(); }
  function status(record, targetDate) {
    var code = record && record.status || "applicability-unverified";
    if (code === "effective-verified") {
      var effective = day(record.effectiveDate || record.scheduleEffectiveDate), target = day(targetDate);
      if (!record.successfullyVerifiedOn || !record.certificationReference || !record.publicationEvidence || !record.importIdentityConfirmed || effective == null) code = "applicability-unverified";
      else if (target != null && target < effective) code = "approved-not-effective";
    }
    if (!labels[code]) code = "applicability-unverified";
    return { code: code, label: labels[code], effectiveVerified: code === "effective-verified" };
  }
  function lookup(register, rdo, municipality, targetDate) {
    var records = register && Array.isArray(register.records) ? register.records : [];
    var source = records.filter(function (r) { return r.kind === "bir-schedule" && String(r.rdo) === String(rdo); })[0] || {};
    var result = status(source, targetDate);
    return Object.assign(result, { recordId: source.id || "not-registered", scheduleEffectiveDate: source.scheduleEffectiveDate || "", datasetGeneratedAt: source.datasetGeneratedAt || "", importDate: source.importDate || null,
      lastAttemptedCheck: source.lastAttemptedCheck || null, successfullyVerifiedOn: result.effectiveVerified ? source.successfullyVerifiedOn : null,
      sourceUrl: source.sourceUrl || "", verificationNote: source.verificationNote || "No successful applicability verification recorded.",
      relatedSchedules: records.filter(function (r) { return r.kind === "smv" && (normalize(r.municipality) === normalize(municipality) || (r.id === "batangas-provincial-smv-request" && !/CITY$/.test(normalize(municipality)))); }).map(function (r) { return { id: r.id, label: status(r, targetDate).label, status: r.status, proposedPeriod: r.proposedPeriod || "", sourceUrl: r.sourceUrl, note: r.verificationNote }; }) });
  }
  function timeScenario(baseRate, area, opts, register, scope) {
    opts = opts || {};
    var start = day(opts.baseDate), end = day(opts.targetDate);
    if (start == null || end == null || end < start || (end - start) / 86400000 > 36524.25) return { available: false, reason: "invalid-time-dates" };
    var annual = opts.annualPct, source = "User-entered assumption", sourceId = null;
    if (opts.source === "evidence") {
      var history = (register && register.landTimeEvidence || []).filter(function (r) { return r.id === opts.evidenceId; })[0];
      if (!history || history.status !== "reviewed" || history.metric !== "matched-vacant-land-asking-rate" || !history.sourceUrl || !history.reviewedBy || normalize(history.municipality) !== normalize(scope.municipality) || history.useGroup !== scope.useGroup || day(history.startDate) == null || day(history.endDate) == null || start < day(history.startDate) || end > day(history.endDate) || !(Number(history.startRate) > 0) || !(Number(history.endRate) > 0) || day(history.endDate) <= day(history.startDate)) return { available: false, reason: "time-evidence-unavailable" };
      var historyYears = (day(history.endDate) - day(history.startDate)) / 86400000 / 365.2425;
      annual = (Math.pow(Number(history.endRate) / Number(history.startRate), 1 / historyYears) - 1) * 100;
      source = "Reviewed local asking-index trend, not achieved sales"; sourceId = history.id;
    }
    if (annual == null || annual === "" || !isFinite(Number(annual)) || Number(annual) <= -100 || Number(annual) > 100) return { available: false, reason: "invalid-time-rate" };
    var years = (end - start) / 86400000 / 365.2425, factor = Math.pow(1 + Number(annual) / 100, years);
    var rawRate = Number(baseRate) * factor, amount = Math.round(rawRate * Number(area));
    if (!isFinite(factor) || !isFinite(rawRate) || !Number.isSafeInteger(amount) || !(rawRate > 0)) return { available: false, reason: "time-integrity-fail" };
    return { available: true, baseDate: opts.baseDate, targetDate: opts.targetDate, annualPct: Number(annual), elapsedYears: years, factor: factor, originalRate: Number(baseRate), rawRate: rawRate, landAmount: amount, source: source, evidenceId: sourceId,
      formula: "Published/derived reference × (1 + annual percentage / 100) ^ (elapsed UTC days / 365.2425) × lot area",
      note: "Indexed land-reference scenario, not updated official BIR/SMV or verified market value. No property-use, market-band, region or corner multiplier stacked. Buildings are computed separately." };
  }
  /* The applied market multiple, disclosed as a planning assumption.

     The public calculator shows a BIR zonal reference and a market estimate
     with nothing connecting them. This module owns the one piece of copy that
     connects them, so the HTML result screen, the report build-up and the PDF
     cannot word it three different ways.

     Copy is fixed by docs/specs/market-multiple-disclosure.md section 4. The
     assumption and limitation sentences are reproduced character for character
     and must not be softened: the limitation ("likely too high for rural
     locations") is the reason this disclosure is worth publishing. No accuracy
     claim - no "accurate", "guaranteed", "\u00b1", "within N%", "error margin"
     or "precision" - may appear in anything returned from here. The rule in
     docs/batangas-value-guide-sources.md:56-57 is only partly machine-enforced,
     by the banned-term regex in tests/value_guide_multiple_node.js rather than
     by rewriting the copy at runtime: silently editing published wording would
     hide the defect instead of failing the build. The regex catches an `accur`
     stem - which is how certified-accuracy is caught - plus `guarantee`,
     "\u00b1", `within N %`/`percent`, `error margin`, a `precis` stem,
     `close to` and `exact match`. PVS-compliance, value-loss and evaluation
     standards are NOT matched by it; those terms rest on reviewer convention. */
  var MULTIPLE_LABEL = "SEA ESTATES market band factor";
  var MULTIPLE_ASSUMPTION = "A SEA ESTATES planning assumption. It is not derived from completed sales and has not been reviewed by an independent qualified appraiser.";
  var MULTIPLE_LIMITATION = "The same factor is applied across all Batangas municipalities. It is not adjusted for local demand and is likely too high for rural locations.";

  /* Presentation only. The value itself is applied unrounded by
     js/estimator.js. This rounds for display to 5 decimals and then String()
     drops the trailing zeros, so 2.5 prints as "2.5" and not "2.50000".

     5 is what the SHIPPED factors require, not a general claim of
     losslessness. A corner lot multiplies by 1.025, and on the non-residential
     bands that lands on 4.35625 (commercial) and 0.76875 (agricultural) - five
     decimals, not four. At 4 decimals this module published "4.3562x the BIR
     reference" for a commercial corner lot while applying 4.35625, so a reader
     who multiplied the disclosed multiple by the BIR rate did not get the
     estimate back. Reconciling the disclosed number against the printed
     build-up is the entire purpose of this disclosure, so the divisor covers
     every use-group x corner combination the current factors can produce.

     A different regionalAdj, or any future factor set carrying more decimals,
     can still exceed 5 - when it does, the corner x non-residential vectors in
     tests/value_guide_multiple_node.js are where it surfaces.

     toFixed is NOT used: it pads, and would return "2.50000". */
  function formatMultiple(n) {
    return String(Math.round(Number(n) * 100000) / 100000);
  }

  /* Returns null when there is nothing honest to disclose, so callers can
     guard on the object itself and emit no element at all rather than a "0x"
     or an empty block. The four refusals:
       - no result, or a land method that never applied the factor stack. The
         time-indexed path replaces the land rate with an indexed rate and
         stacks no market, band, regional or corner factor, and an unavailable
         result returns early from computeEstimate carrying no landMethod at
         all - both land here.
       - a non-finite multiple.
       - a multiple of zero or less.
       - missing factors are NOT a refusal; they are tolerated below. */
  function appliedMultipleDisclosure(result) {
    if (!result || result.landMethod !== "factor") return null;
    var multiple = Number(result.appliedMultiple);
    if (!isFinite(multiple)) return null;
    if (!(multiple > 0)) return null;
    var shown = formatMultiple(multiple);
    return {
      multiple: shown,
      multipleLabel: MULTIPLE_LABEL,
      text: shown + "\u00d7 the BIR reference",
      assumption: MULTIPLE_ASSUMPTION,
      limitation: MULTIPLE_LIMITATION,
      factors: result.factors || {}
    };
  }

  return { lookup: lookup, status: status, timeScenario: timeScenario, day: day,
    formatMultiple: formatMultiple, appliedMultipleDisclosure: appliedMultipleDisclosure };
});
