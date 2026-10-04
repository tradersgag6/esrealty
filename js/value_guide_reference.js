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
  return { lookup: lookup, status: status, timeScenario: timeScenario, day: day };
});
