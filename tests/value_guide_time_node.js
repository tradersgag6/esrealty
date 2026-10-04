"use strict";
const assert = require("assert"), fs = require("fs"), EST = require("../js/estimator.js"), R = require("../js/value_guide_reference.js"), TAX = require("../js/value_guide_tax.js"), PDF = require("../js/value_guide_pdf.js"), PDFLib = require("../vendor/pdf-lib/pdf-lib.min.js");
const register = require("../data/government-reference-register.json"), config = { ...require("../data/zonal-config.json"), governmentReferenceRegister: register }, index = require("../data/batangas-zonal.json"), md = require("../data/bir-batangas/municipalities/bauan.json");
const base = { municipality: "BAUAN", barangay: "POBLACION III", streetKey: "binay st ressurreccion st", classification: "RR", area: 100, type: "vacant_lot" };
const time = { landMethod: "time-indexed", timeSource: "manual", timeBaseDate: "2022-07-23", timeTargetDate: "2026-10-03", timeAnnualPct: 5 };
const calc = changes => EST.core.computeEstimate(config, index, md, { ...base, ...changes });
let checks = 0;
function check(name, fn) { fn(); checks++; console.log("[PASS] " + name); }
(async () => {
  check("default method retains original factor guide", () => { assert.equal(calc().total, 2875000); assert.equal(calc({ timeAnnualPct: 5 }).total, 2875000); assert.equal(calc().timeIndex, null); });
  const days = (Date.UTC(2026, 9, 3) - Date.UTC(2022, 6, 23)) / 86400000;
  check("calendar dates and fractional-year basis independently checked", () => assert.equal(days, 1533));
  const expected = Math.round(11500 * Math.pow(1.05, 1533 / 365.2425) * 100), indexed = calc(time);
  check("indexed land uses compound explicit growth, not stacked market factors", () => { assert.equal(indexed.total, expected); assert.equal(indexed.landValue, expected); assert.equal(indexed.factorBaseline.total, 2875000); assert.equal(indexed.corner.applied, false); assert(EST.core.integrityCheck(indexed).ok); });
  check("published BIR reference and schedule are unchanged", () => { assert.equal(indexed.birZonalRatePerSqm, 11500); assert.equal(indexed.birZonalValue, 1150000); assert.equal(indexed.effectivityDate, "2022-07-23"); assert.equal(indexed.departmentOrder, "035-2022"); });
  check("corner/use factors never stack onto index method", () => assert.equal(calc({ ...time, corner: true }).landValue, indexed.landValue));
  check("zero percent is an explicit unchanged-reference scenario", () => { const r = calc({ ...time, timeAnnualPct: 0 }); assert.equal(r.total, 1150000); assert.equal(r.timeIndex.factor, 1); });
  check("same day yields unchanged reference", () => assert.equal(calc({ ...time, timeTargetDate: "2022-07-23" }).total, 1150000));
  check("negative growth lowers only indexed land", () => { const r = calc({ ...time, timeAnnualPct: -5 }); assert(r.total < 1150000); assert(r.total > 0); });
  check("no rate default invented", () => { for (const timeAnnualPct of [null, "", undefined, NaN, Infinity, -100, -101, 101]) assert.equal(calc({ ...time, timeAnnualPct }).available, false, String(timeAnnualPct)); });
  check("invalid/reversed/unbounded dates rejected", () => { for (const changes of [{ timeTargetDate: "2026-02-30" }, { timeBaseDate: "invalid" }, { timeTargetDate: "" }, { timeTargetDate: "2020-01-01" }, { timeTargetDate: "2200-01-01" }]) assert.equal(calc({ ...time, ...changes }).available, false); });
  check("numeric overflow cannot publish a scenario", () => assert.equal(calc({ ...time, timeAnnualPct: 100, timeBaseDate: "2022-01-01", timeTargetDate: "2120-01-01" }).available, false));
  check("building calculation unchanged by indexing", () => { const house = { type: "house_lot", floorArea: 63.45, floors: "2", features: ["garden"] }; const normal = calc(house), adjusted = calc({ ...house, ...time }); assert.equal(adjusted.improvement, normal.improvement); assert.equal(adjusted.total, adjusted.landValue + normal.improvement); });
  check("buying/selling share same indexed figure", () => assert.equal(calc({ ...time, purpose: "Buying" }).total, calc({ ...time, purpose: "Selling" }).total));
  check("index never becomes statutory tax floor", () => { const r = calc({ ...time, salePrice: 1000000 }); const c = EST.core.costsFor(r, config); assert.equal(c.base, 1150000); assert.equal(c.cgt, 69000); });
  check("research status cannot be represented as verified", () => { const s = R.lookup(register, "58", "BAUAN", "2026-10-03"); assert.equal(s.code, "applicability-unverified"); assert.equal(s.successfullyVerifiedOn, null); assert.equal(s.importDate, null); assert.equal(s.scheduleEffectiveDate, "2022-07-23"); assert.equal(s.lastAttemptedCheck, "2026-10-03"); });
  check("proposal remains proposed even after future target date", () => { const proposal = register.records.find(r => r.id === "lipa-proposed-smv-2028-2030"); assert.equal(R.status(proposal, "2031-01-01").code, "proposed"); });
  check("verification label requires proof and effective date", () => { assert.equal(R.status({ status: "effective-verified" }, "2026-10-03").code, "applicability-unverified"); const evidence = { status: "effective-verified", effectiveDate: "2028-01-01", successfullyVerifiedOn: "2026-10-03", certificationReference: "test-doc", publicationEvidence: "test-publication", importIdentityConfirmed: true }; assert.equal(R.status(evidence, "2026-10-03").code, "approved-not-effective"); assert.equal(R.status(evidence, "2028-01-01").code, "effective-verified"); });
  check("city and provincial related references not confused", () => { const lipa = R.lookup(register, "59", "LIPA CITY", "2026-10-03"); assert(lipa.relatedSchedules.some(r => r.proposedPeriod === "2028-2030")); assert(!lipa.relatedSchedules.some(r => r.id === "batangas-provincial-smv-request")); });
  check("evidence unavailable cannot silently become manual or zero growth", () => assert.equal(calc({ ...time, timeSource: "evidence", timeEvidenceId: "lipa-proposed-smv-2028-2030" }).reason, "time-evidence-unavailable"));
  const trend = { id: "reviewed-fixture", status: "reviewed", metric: "matched-vacant-land-asking-rate", municipality: "BAUAN", useGroup: "residential", sourceUrl: "https://example.test/history", reviewedBy: "Fixture reviewer", startDate: "2022-07-23", endDate: "2026-10-03", startRate: 10000, endRate: 15000 };
  const evidenceConfig = { ...config, governmentReferenceRegister: { ...register, landTimeEvidence: [trend] } };
  check("reviewed local trend uses scoped evidence and explicit coverage", () => { const r = EST.core.computeEstimate(evidenceConfig, index, md, { ...base, ...time, timeSource: "evidence", timeEvidenceId: trend.id }); assert.equal(r.total, 1725000); assert.equal(r.timeIndex.evidenceId, trend.id); assert(/not achieved sales/.test(r.timeIndex.source)); });
  check("wrong segment/scope/date cannot reuse reviewed trend", () => { for (const change of [{ municipality: "LIPA CITY" }, { useGroup: "commercial" }, { metric: "house-price-index" }, { status: "proposed" }, { endDate: "2025-01-01" }]) { const c = { ...config, governmentReferenceRegister: { landTimeEvidence: [{ ...trend, ...change }] } }; assert.equal(EST.core.computeEstimate(c, index, md, { ...base, ...time, timeSource: "evidence", timeEvidenceId: trend.id }).available, false); } });
  // Capture real draw calls: computation text must match the selected method.
  const draws = [], original = PDFLib.PDFPage.prototype.drawText;
  PDFLib.PDFPage.prototype.drawText = function (text, options) { draws.push(String(text)); return original.call(this, text, options); };
  try {
    const blob = await PDF.toBlob(PDFLib, indexed, { generatedOn: "2026-10-03", tax: await TAX.full(indexed) });
    check("internal PDF contains index trace and government verification", () => { const text = draws.join(" "); assert(text.includes("2022-07-23") && text.includes("2026-10-03")); assert(/Indexed land reference/.test(text)); assert(/Latest applicability unverified/.test(text)); assert(/not stacked/.test(text)); assert(text.includes(expected.toLocaleString("en-PH"))); assert(blob.size > 1000); });
  } finally { PDFLib.PDFPage.prototype.drawText = original; }
  check("none of the production references falsely marked verified", () => { for (const record of register.records) assert.notEqual(R.status(record, "2026-10-03").code, "effective-verified"); });
  console.log("ALL GREEN (" + checks + " checks)");
})().catch(error => { console.error(error); process.exitCode = 1; });
