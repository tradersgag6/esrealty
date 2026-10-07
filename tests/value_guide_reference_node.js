"use strict";
const assert = require("assert"), fs = require("fs"), vm = require("vm"), zlib = require("zlib");
const { stripTypeScriptTypes } = require("module");
const EST = require("../js/estimator.js"), FINANCE = require("../js/value_guide_finance.js"), TAX = require("../js/value_guide_tax.js");
const read = path => JSON.parse(fs.readFileSync(path, "utf8"));
const config = read("data/zonal-config.json"), index = read("data/batangas-zonal.json"), md = read("data/bir-batangas/municipalities/bauan.json"), ref = read("data/tax/ph-estate-tax-reference.json");
const manifest = read("data/data-manifest.json");
const provenance = { basisOfValue: manifest.valuation.basisOfValue, basisNote: manifest.valuation.basisNote, order: manifest.adjustmentFramework.order, sources: manifest.provenance.records, currencyCheckedOn: manifest.provenance.currencyCheckedOn, nextCurrencyReview: manifest.provenance.nextCurrencyReview, rangeMeaning: manifest.range.meaning, limitations: manifest.limitations };
let count = 0;
function check(name, fn) { fn(); count++; console.log("[PASS] " + name); }
function pdfText(bytes) {
  const buffer = Buffer.from(bytes), text = [];
  for (let at = 0; (at = buffer.indexOf("stream", at)) >= 0;) {
    let start = at + 6; if (buffer[start] === 13) start++; if (buffer[start] === 10) start++;
    const end = buffer.indexOf("endstream", start); if (end < 0) break;
    try { const ops = zlib.inflateSync(buffer.subarray(start, end)).toString("latin1"); for (const match of ops.matchAll(/<([0-9A-Fa-f]+)>\s*Tj/g)) text.push(Buffer.from(match[1], "hex").toString("latin1")); } catch (_) {}
    at = end + 9;
  }
  return text.join(" ");
}
(async () => {
  const options = { municipality: "BAUAN", barangay: "POBLACION III", streetKey: "binay st ressurreccion st", classification: "RR", area: 100, type: "vacant_lot" };
  const result = EST.core.computeEstimate(config, index, md, options);
  check("Bauan source fixture matches official residential rate", () => { assert.equal(result.birZonalRatePerSqm, 11500); assert.equal(result.departmentOrder, "035-2022"); });
  /* The market figure is position-weighted now. The fixture street carries
     11500/sqm against Bauan's residential p25 1700 / p50 3700 / p75 9000, so it
     sits above its municipal median and the band falls below the flat 2.5. The BIR
     figures are the official tax base and are asserted unchanged - a market
     assumption must never move them. Market figures are re-derived from the
     disclosed band rather than frozen, so a weighting change shows as a diff. */
  check("the BIR base is untouched and the market band is position-weighted", () => {
    assert.equal(result.birZonalValue, 1150000, "BIR value never moves with a market assumption");
    assert.equal(result.perSqm > 11500, true, "the market figure sits above the BIR rate");
    assert.equal(result.total, result.landValue, "no improvement on a vacant lot");
    assert.equal(result.low, Math.round(result.total * 0.85), "low is 85% of the figure");
    assert.equal(result.high, Math.round(result.total * 1.30), "high is 130%");
    assert.ok(result.bandFlatMid > result.bandMid, "band weighted down above the median");
    assert.ok(result.bandPosition.percentile > 0, "position is published and positive");
  });
  const costs = EST.core.taxMath(config, result.total, { birZonalValue: result.birZonalValue, marketGuideEstimate: result.total, transactionPrice: result.total });
  /* Cost lines are pure functions of the statutory base, so they are re-derived
     from the tax rates rather than frozen. The figures move when the market band
     moves; the ARITHMETIC must not. */
  const T = config.tax;
  check("reference cost lines and total reconcile", () => {
    const gross = costs.base, sixPct = Math.round(gross * T.cgtPct);
    assert.equal(costs.cgt, sixPct, "CGT is 6% of the statutory base");
    assert.equal(costs.dst, Math.round(gross * T.dstPct), "DST matches its rate");
    assert.equal(costs.total, costs.cgt + costs.dst + costs.transfer + costs.registration, "the lines sum to the total");
    assert.equal(costs.netAfterAllTransactionCosts, costs.base - costs.total, "net proceeds are the base less costs");
  });
  /* Seller costs are the statutory total plus the SELLER'S SHARE of commission,
     not the whole of it: the allocation splits commission between the parties.
     Asserting the whole commission here would encode an allocation assumption
     this layer does not own, and it passed by accident before. */
  check("commission is charged on the gross and split between the parties", () => {
    assert.equal(costs.broker, Math.round(costs.base * T.brokerPct), "commission is the configured rate of the base");
    const sellerShare = costs.sellerCosts - costs.total;
    assert.ok(sellerShare > 0, "the seller bears part of the commission");
    assert.ok(sellerShare < costs.broker, "but not all of it - the split is real");
    assert.equal(costs.projectedNetProceeds, costs.base - costs.sellerCosts, "proceeds are the base less what the seller bears");
    assert.ok(costs.projectedNetProceeds < costs.base, "proceeds are below the base");
  });
  const internal = TAX.sellingCosts(result, ref);
  check("internal PDF adapter shares public cost totals", () => {
    assert.equal(internal.taxBase, costs.base, "the PDF reads the same base");
    assert.equal(internal.statutoryTotal, costs.total, "and the same statutory total");
    assert.equal(internal.netProceeds.beforeCommission, costs.netAfterAllTransactionCosts, "and the same net proceeds");
  });
  check("sale price below guide uses full zonal basis, not guide or excess", () => { const c = FINANCE.transaction({}, result.total, { salePrice: 1000000, birZonalValue: 1150000 }); assert.equal(c.base, 1150000); assert.equal(c.cgt, 69000); });
  check("supplied assessor schedule FMV raises statutory basis", () => { const c = FINANCE.transaction({}, result.total, { salePrice: 3000000, birZonalValue: 1150000, fairMarketValue: 3500000 }); assert.equal(c.base, 3500000); assert.equal(c.cgt, 210000); });
  check("comparable evidence does not alter value or transaction costs", () => { const withComps = EST.core.computeEstimate(config, index, md, { ...options, comparables: [{ price: 3000000, lot_area_sqm: 100, city: "BAUAN", barangay: "POBLACION III", property_type: "lot-only", offer_type: "sale" }] }); assert.equal(withComps.total, result.total); assert.equal(TAX.sellingCosts(withComps, ref).statutoryTotal, internal.statutoryTotal); });
  check("rounded scenario endpoints reconcile for fractional areas", () => { const r = EST.core.computeEstimate(config, index, md, { ...options, area: 123.47, corner: true }); assert(EST.core.integrityCheck(r).ok); assert(!EST.core.integrityCheck({ ...r, high: r.high + 1 }).ok); });
  check("estate deduction is standard, family home conditional", () => { assert.equal(FINANCE.estate(15000000).tax, 600000); assert.equal(FINANCE.estate(15000000, { familyHomeEligible: true, familyHomeValue: 10000000 }).tax, 0); assert.equal(FINANCE.estate(15000000, { familyHomeValue: 10000000 }).tax, 600000); });
  check("estate property-only scenario cannot certify whole-estate liability", () => { const i = TAX.inheritance(result, ref); assert(i.scenarioOnly); assert.equal(i.onMarketBasis.tax, 0); assert.equal(i.wholeEstate, null); assert(/entire.*estate/.test(i.note)); });
  check("DST deadline trigger comes from EOPT month-end rule", () => { const deadline = TAX.deadlines(ref).find(r => /Documentary/.test(r.label)); assert.equal(deadline.days, 10); assert(/close of the month/.test(deadline.from)); });
  check("real settings envelope applies factors without replacing formula version", () => { const updated = EST.core.applyGuideSettings(config, { data: { valueGuide: { version: "approved-fixture", proxyFactors: { residential: 1.2 } } } }); assert.equal(updated.proxyFactors.residential.factor, 1.2); assert.equal(updated.factorSettingsVersion, "approved-fixture"); assert.equal(updated.calculationVersion, "2026.10.3"); assert.equal(config.proxyFactors.residential.factor, 1); });
  const source = fs.readFileSync("supabase/functions/location-report/index.ts", "utf8").replace(/^import .*;\r?$/gm, "");
  const context = vm.createContext({ ESREALTY_FINANCE: FINANCE, TAX_REFERENCE: ref, Deno: { env: { get: () => "" }, serve: () => {} }, console, Response, Request, Headers, TextDecoder, setTimeout, crypto: require("crypto").webcrypto });
  // Run pdf-lib in the same realm: its Array type checks reject cross-realm
  // page-size literals, which is a harness issue rather than a renderer error.
  vm.runInContext(fs.readFileSync("vendor/pdf-lib/pdf-lib.min.js", "utf8"), context);
  Object.assign(context, context.PDFLib);
  const painted = [];
  const originalDraw = context.PDFLib.PDFPage.prototype.drawText;
  context.PDFLib.PDFPage.prototype.drawText = function (text, options) {
    const font = options.font, size = options.size;
    const ascent = font.heightAtSize(size, { descender: false });
    const height = font.heightAtSize(size);
    painted.push({ page: this, text, x: options.x, y: options.y, width: font.widthOfTextAtSize(text, size), top: options.y + ascent, bottom: options.y - (height - ascent) });
    return originalDraw.call(this, text, options);
  };
  vm.runInContext(stripTypeScriptTypes(source, { mode: "transform" }), context);
  const api = vm.runInContext("({ buildPdf, sanitizeReport, emailHtml })", context);
  const payload = { report: api.sanitizeReport({ property: { area: 100, kind: "land", typeLabel: "Vacant lot" }, location: { region: "Region IV-A (CALABARZON)", province: "Batangas", town: "Bauan", barangay: "Poblacion III", address: "BINAY ST (RESSURRECCION ST)" }, asOf: result.effectivityDate, disclaimer: result.disclaimer, estimate: { ...result, sourceLevel: result.source.level, proxyFactor: result.factors.proxyFactor, bandMid: result.factors.bandMid, regionalAdj: result.factors.regionalAdj, provenance } }) };
  const bytes = await api.buildPdf(payload), text = pdfText(bytes);
  /* Derived from the live result, so the PDF is proven to carry THIS figure rather
     than a literal from an earlier band. The BIR base must still appear
     unchanged: a market assumption may not move it. */
  const money = n => "PHP " + new Intl.NumberFormat("en-PH", { maximumFractionDigits: 0 }).format(n);
  check("emailed public PDF carries this result's figures", () => {
    /* The renderer derives its own cost lines from the estimate, so the PDF
       figures are computed here the same way rather than assumed to match the
       tax engine's. What is asserted is that the PDF shows THIS property's
       numbers and that the BIR base is unchanged. */
    [result.total, result.low, result.high, result.birZonalValue]
      .forEach(n => assert(text.includes(money(n)), money(n)));
    assert(text.includes(money(Math.round(result.total * config.tax.cgtPct))),
      "CGT derived from this estimate appears in the PDF: " + money(Math.round(result.total * config.tax.cgtPct)));
  });
  check("emailed report contains six ordered sections", () => { let last = -1; for (const title of ["01 Valuation Summary", "02 Detailed Computation", "03 Transaction Costs", "04 Market Evidence", "05 Documents", "06 Pricing Scenarios"]) { const at = text.indexOf(title); assert(at > last, title); last = at; } });
  check("emailed PDF discloses missing analysis, whole-estate assumption and source trust", () => { assert(/not assessed/.test(text)); assert(/property-only scenarios/i.test(text)); assert(/client-supplied/.test(text)); assert(!/50% of the BIR zonal value|excess of the price/.test(text)); });
  /* The email renders bare amounts, not the PDF's "PHP " prefix, so this asserts
     on the figure rather than the formatter. */
  check("email summary uses central estimate and scenario range", () => { const email = api.emailHtml(payload); [result.total, result.low, result.high].forEach(n => assert(email.includes(new Intl.NumberFormat("en-PH", { maximumFractionDigits: 0 }).format(n)), String(n))); });
  const timeResult = EST.core.computeEstimate({ ...config, governmentReferenceRegister: read("data/government-reference-register.json") }, index, md, { ...options, landMethod: "time-indexed", timeAnnualPct: 5, timeBaseDate: "2022-07-23", timeTargetDate: "2026-10-03" });
  const timePayload = { report: api.sanitizeReport({ ...payload.report, estimate: { ...timeResult, sourceLevel: timeResult.source.level, proxyFactor: timeResult.factors.proxyFactor, bandMid: timeResult.factors.bandMid, regionalAdj: timeResult.factors.regionalAdj } }) };
  const timeText = pdfText(await api.buildPdf(timePayload));
  check("public PDF preserves indexing trace without replacing original reference", () => { assert(timeText.includes("Indexed-reference planning scenario")); assert(timeText.includes("2022-07-23") && timeText.includes("2026-10-03")); assert(timeText.includes("PHP 1,150,000")); assert(/No stacked market, region, corner or property-use multipliers/.test(timeText)); assert(/Latest applicability unverified/.test(timeText)); });
  check("public PDF text fits page and columns without collisions", () => {
    assert(painted.length > 100);
    for (const run of painted) { assert(run.x >= 47 && run.x + run.width <= 548, run.text); assert(run.bottom >= 20 && run.top <= 820, run.text); }
    for (let i = 0; i < painted.length; i++) for (let j = i + 1; j < painted.length; j++) {
      const a = painted[i], b = painted[j]; if (a.page !== b.page) continue;
      const overlapX = Math.min(a.x + a.width, b.x + b.width) - Math.max(a.x, b.x);
      const overlapY = Math.min(a.top, b.top) - Math.max(a.bottom, b.bottom);
      assert(!(overlapX > .5 && overlapY > .5), a.text + " overlaps " + b.text);
    }
  });
  if (process.argv.includes("--capture")) {
    const dir = "docs/sea-guide-upgrade";
    assert(fs.existsSync(dir), "Capture folder must already exist");
    fs.writeFileSync(dir + "/bauan-public-report.pdf", bytes);
    const VG = require("../js/value_guide_pdf.js"), PDFLib = require("../vendor/pdf-lib/pdf-lib.min.js");
    const blob = await VG.toBlob(PDFLib, result, { preparedFor: "Bauan reference verification", preparedBy: "SEA ESTATES", generatedOn: "2026-10-02", tax: await TAX.full(result), provenance, muniRow: index.municipalities.find(m => m.name === "BAUAN") });
    fs.writeFileSync(dir + "/bauan-internal-report.pdf", Buffer.from(await blob.arrayBuffer()));
  }
  console.log("ALL GREEN (" + count + " checks)");
})().catch(error => { console.error(error); process.exitCode = 1; });
