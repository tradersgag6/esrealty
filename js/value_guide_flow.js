/* The Value Guide's reference calculation.
 *
 * Clean-room implementation of the LandValuePH published methodology: a BIR
 * zonal base, a market-indicator factor, one additive net of twelve published
 * question factors, and a replacement-cost building component. It reuses the
 * storefront estimator for everything that is NOT pricing - the BIR lookup,
 * coverage metadata, ownership review, comparables and transaction options -
 * and overwrites only the arithmetic, so the two calculators cannot drift on
 * provenance while still disagreeing on the answer by design.
 *
 * Provenance of every constant below is recorded in
 * docs/specs/value-guide-3-step.md §2. Rate constants come from LandValuePH's
 * shipped client bundle and from the purchased report LVPH-D-9531904C; the
 * bundle's display chip and the report's own arithmetic disagree on CHB
 * (15,000 vs 16,000) and the report wins, because 16,000 x 120 sqm is the
 * figure that reconciles to the printed building value.
 *
 * There is deliberately no valuation year and no escalation factor. That was
 * proposed, tested against PSA construction statistics and rejected: PSA's
 * national residential average fell from 14,429 (Jan 2025) to 14,081.64 (May
 * 2026) while CMRPI materials grew 1.3%/yr, so no published source supports a
 * 2%/yr uplift, and the uplift was worth only 1.1% of the total. */
(function (root, factory) {
  var api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  root.ESREALTY_VG_FLOW = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";

  var MODEL = {
    MARKET_IND: 1.174,
    RANGE_LOW: 0.85,
    RANGE_HIGH: 1.30,
    DEP_CAP: 0.80,
    /* Flat replacement-cost rates, keyed to the construction options that
       data/zonal-config.json already defines (that file is read-only). */
    RCN: { wood_prefab: 8000, mixed_chb: 16000, rca_steel: 18000 },
    USEFUL_LIFE: { wood_prefab: 25, mixed_chb: 40, rca_steel: 50 }
  };

  var SEC_LAND_TERRAIN = "Land & Terrain";
  var SEC_BUILDING = "Building & Features";
  var SEC_NEIGHBOURING = "Neighbouring";
  var SEC_LEGAL = "Legal & Environment";
  /* Everything outside SEC_LAND sections is applied to the improvement, which
     is what stops a house question from moving a vacant lot's value. */
  var LAND_SECTIONS = {};
  LAND_SECTIONS[SEC_LAND_TERRAIN] = 1;
  LAND_SECTIONS[SEC_NEIGHBOURING] = 1;
  LAND_SECTIONS[SEC_LEGAL] = 1;

  /* Twelve published factors. `bp` is hundredths of a percent and every option
     sits inside the range published on /methodology; tests/value_guide_flow_node.js
     asserts that and fails if a future edit widens one. */
  var FACTORS = [
    { id: "lotShape", input: "lotShape", section: SEC_LAND_TERRAIN, label: "Lot shape", min: -500, max: 0, options: [
      { value: "0", label: "Regular / rectangular", bp: 0 },
      { value: "-150", label: "Slightly irregular", bp: -150 },
      { value: "-300", label: "Irregular", bp: -300 },
      { value: "-500", label: "Severely irregular or pie-cut", bp: -500 }] },
    { id: "terrain", input: "terrain", section: SEC_LAND_TERRAIN, label: "Terrain and elevation", min: -800, max: 0, options: [
      { value: "0", label: "Flat", bp: 0 },
      { value: "-300", label: "Gently sloping", bp: -300 },
      { value: "-500", label: "Sloping", bp: -500 },
      { value: "-800", label: "Steep / terraced", bp: -800 }] },
    { id: "cornerExposure", input: "corner", type: "bool", section: SEC_LAND_TERRAIN, label: "Corner exposure", min: 0, max: 500, options: [
      { value: "corner", label: "Frontage on two roads", bp: 250 }] },
    { id: "roadAccess", input: "roadAccess", section: SEC_LAND_TERRAIN, label: "Road access", min: -200, max: 200, options: [
      { value: "-200", label: "Rough or unmade access", bp: -200 },
      { value: "0", label: "Ordinary access", bp: 0 },
      { value: "50", label: "Paved barangay road", bp: 50 },
      { value: "200", label: "Paved, wide, direct to the highway", bp: 200 }] },
    { id: "titleDoc", input: "titleDoc", section: SEC_LEGAL, label: "Title and documentation", min: -500, max: 0, options: [
      { value: "0", label: "Clean TCT in the seller's name", bp: 0 },
      { value: "-200", label: "Tax declaration only", bp: -200 },
      { value: "-350", label: "Inheritance not yet settled", bp: -350 },
      { value: "-500", label: "Disputed or untraceable", bp: -500 }] },
    { id: "floodRisk", input: "floodRisk", section: SEC_LEGAL, label: "Flood exposure", min: -500, max: 0, options: [
      { value: "0", label: "Not known to flood", bp: 0 },
      { value: "-150", label: "Floods in heavy rain", bp: -150 },
      { value: "-300", label: "Floods seasonally", bp: -300 },
      { value: "-500", label: "Floods routinely", bp: -500 }] },
    { id: "faultProximity", input: "faultProximity", section: SEC_LEGAL, label: "Fault proximity", min: -300, max: 0, options: [
      { value: "0", label: "More than 5 km from a mapped fault", bp: 0 },
      { value: "-100", label: "Within 5 km", bp: -100 },
      { value: "-300", label: "Within 1 km", bp: -300 }] },
    { id: "amenities", input: "amenities", section: SEC_NEIGHBOURING, label: "Amenities", min: 0, max: 300, options: [
      { value: "0", label: "None within reach", bp: 0 },
      { value: "100", label: "Playground or court nearby", bp: 100 },
      { value: "200", label: "Clubhouse and pool", bp: 200 },
      { value: "300", label: "Full subdivision amenities", bp: 300 }] },
    { id: "community", input: "community", section: SEC_NEIGHBOURING, label: "Community quality", min: 0, max: 300, options: [
      { value: "0", label: "Ordinary neighbourhood", bp: 0 },
      { value: "100", label: "Gated subdivision", bp: 100 },
      { value: "200", label: "Well-kept, managed community", bp: 200 },
      { value: "300", label: "Prime, high-demand enclave", bp: 300 }] },
    { id: "infrastructure", input: "infrastructure", section: SEC_NEIGHBOURING, label: "Infrastructure", min: 0, max: 200, options: [
      { value: "0", label: "Existing services only", bp: 0 },
      { value: "50", label: "Paved approach and drainage", bp: 50 },
      { value: "200", label: "New road, utility or transit project", bp: 200 }] },
    { id: "demand", input: "demand", section: SEC_BUILDING, label: "Demand (LVIS)", min: -300, max: 300, options: [
      { value: "-300", label: "Weak demand", bp: -300 },
      { value: "0", label: "Normal demand", bp: 0 },
      { value: "300", label: "Strong demand", bp: 300 }] },
    { id: "zonalRecency", input: "zonalRecency", section: SEC_LEGAL, label: "Zonal schedule recency", min: -200, max: 0, options: [
      { value: "0", label: "Schedule current", bp: 0 },
      { value: "-100", label: "Schedule a few years old", bp: -100 },
      { value: "-200", label: "Schedule is materially stale", bp: -200 }] }
  ];

  function factorBp(f, input) {
    var raw = input ? input[f.input] : null;
    if (f.type === "bool") return raw ? f.options[0].bp : 0;
    if (raw == null || raw === "") return 0;
    for (var i = 0; i < f.options.length; i++) {
      if (String(f.options[i].value) === String(raw)) return f.options[i].bp;
    }
    return 0;
  }

  /* Additive: every bp is summed once and the total applied once. Compounding
     two +50 bp answers would give +100.25 bp, which is not what the published
     ranges describe. */
  function netOf(input, landOnly) {
    var bp = 0;
    for (var i = 0; i < FACTORS.length; i++) {
      var f = FACTORS[i];
      if (landOnly && !LAND_SECTIONS[f.section]) continue;
      bp += factorBp(f, input);
    }
    return bp / 10000;
  }

  /* All twelve, answered or not. The report and the PDF both print the whole
     published table, so an unanswered question has to be a printed 0% rather
     than a missing row. */
  function sectionsOf(input) {
    var out = [];
    for (var i = 0; i < FACTORS.length; i++) {
      var f = FACTORS[i];
      out.push({ id: f.id, label: f.label, section: f.section, min: f.min, max: f.max,
        bp: factorBp(f, input), appliedTo: LAND_SECTIONS[f.section] ? "land" : "improvement" });
    }
    return out;
  }

  function applyModel(base, opts) {
    /* Review Focus 3: a failed lookup has no pricing fields to overwrite, and
       inventing them would turn "no BIR rate for this classification" into a
       number. */
    if (!base || base.available === false) return base;

    var r = {};
    for (var k in base) if (Object.prototype.hasOwnProperty.call(base, k)) r[k] = base[k];
    opts = opts || {};

    var landNet = netOf(opts, true);
    /* netOf(opts, false) totals every section, so subtracting the land share
       leaves the Building & Features answers alone. */
    var bldgNet = netOf(opts, false) - landNet;

    var landBase = Number(r.birZonalValue) || 0;
    r.landValue = Math.round(landBase * MODEL.MARKET_IND * (1 + landNet));
    r.landPerSqm = r.area ? Math.round(r.landValue / r.area) : 0;

    var rcn = MODEL.RCN[opts.construction] != null ? MODEL.RCN[opts.construction] : MODEL.RCN.mixed_chb;
    var life = MODEL.USEFUL_LIFE[opts.construction] || 40;
    var age = Number(r.ageMidpoint) || 0;
    var dep = Math.min(age / life, MODEL.DEP_CAP);

    if ((opts.type || r.type) === "vacant_lot") {
      r.improvement = 0;
    } else {
      var floor = Number(r.floorArea) || 0;
      r.improvement = Math.round(floor * rcn * (1 - dep) * (1 + bldgNet)) + (Number(r.featuresTotal) || 0);
    }

    r.total = r.landValue + r.improvement;
    r.rangeLowFactor = MODEL.RANGE_LOW;
    r.rangeHighFactor = MODEL.RANGE_HIGH;
    r.low = Math.round(r.total * MODEL.RANGE_LOW);
    r.high = Math.round(r.total * MODEL.RANGE_HIGH);
    r.perSqm = r.area ? Math.round(r.total / r.area) : 0;

    /* Public-model fields the report, the tax engine and the PDF read. */
    r.marketGuideEstimate = r.total;
    r.marketGuideRatePerSqm = r.perSqm;
    r.recommendedAskingPrice = r.high;
    r.unadjustedTotal = r.total;
    r.ownershipAdjustmentPct = 0;
    r.floorsMultiplier = 1;
    r.buildCostPerSqm = rcn;
    r.ageMidpoint = age;
    r.depreciatedPct = Math.round(dep * 10000) / 100;
    r.landMethod = "factor";
    r.timeIndex = null;
    r.factorBaseline = null;
    /* Null rather than this model's factor: the shared disclosure builder in
       js/value_guide_reference.js would otherwise print "SEA ESTATES market
       band factor" on a guide that no longer uses it. The model is named in
       referenceModel and in the report copy instead. */
    r.factors = null;
    r.factorStack = null;
    r.appliedMultiple = null;
    r.marketGuide = Object.assign({}, r.marketGuide, {
      value: r.total,
      landValue: r.landValue,
      comparablePricesUsed: false,
      sourceType: "LandValuePH published reference model"
    });
    r.referenceModel = {
      name: "LandValuePH reference model",
      marketInd: MODEL.MARKET_IND,
      net: landNet,
      buildingNet: bldgNet,
      sections: sectionsOf(opts),
      rcnRate: rcn,
      usefulLife: life,
      depCap: MODEL.DEP_CAP,
      depreciatedPct: r.depreciatedPct,
      flat: true
    };
    return r;
  }

  function compute(opts, est) {
    if (!est || typeof est.estimate !== "function") throw new Error("FLOW.compute requires the estimator module");
    /* Promise.resolve keeps this correct whether estimate() is async today or
       becomes sync tomorrow. */
    return Promise.resolve(est.estimate(opts)).then(function (base) {
      var r = applyModel(base, opts);
      r.integrity = est.core.integrityCheck(r);
      return r;
    });
  }

  /* The model callout is fixed copy: it names our model, names the other one,
     and states the measured divergence so the reader cannot mistake one figure
     for the other. It is the first thing reportSections returns, so the report
     cannot open without it. */
  var MODEL_CALLOUT =
    "Reference model: LandValuePH published methodology, market-indicator factor 1.174. "
    + "The public site calculator uses a different model (SEA ESTATES factor stack) "
    + "and returns a higher figure for the same property: 2.14x on a vacant lot in this fixture. "
    + "Both are planning figures, not an appraisal.";

  function esc(v) {
    return String(v == null ? "" : v).replace(/[&<>"]/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c];
    });
  }

  function peso(n) {
    return "₱" + String(Math.round(Number(n) || 0)).replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  }

  function pct(n) { return ((Number(n) || 0) * 100).toFixed(2) + "%"; }

  function summaryOpts(result) {
    var r = result || {};
    return { municipality: r.municipality, barangay: r.barangay, propertyType: r.type,
      area: r.area, floorArea: r.floorArea, corner: !!r.cornerApplied,
      saleContext: r.saleContext, useGroup: r.useGroup || r.classification };
  }

  function summarize(result, rows, est) {
    if (!rows.length || !est || !est.core || typeof est.core.comparableSummary !== "function") return null;
    return est.core.comparableSummary(rows, summaryOpts(result));
  }

  /* Our own catalog, filtered the way the storefront already filters it. The
     estimator's own loader is private to that read-only file, so the filter set
     is restated here; cost if the two drift is a listing that should have been
     offered as context not being offered. */
  function loadComparables(opts, est) {
    var api = typeof window !== "undefined" && window.ESREALTY_LISTINGS_API;
    if (!api || typeof api.list !== "function") return Promise.resolve([]);
    opts = opts || {};
    var filters = {
      state: "Batangas",
      city: opts.municipality,
      offer_type: "sale",
      status: "available",
      property_type: opts.type === "house_lot" ? "house-and-lot" : "lot-only",
      per_page: 50,
      sort: "date_desc"
    };
    var request = api.list(filters).then(function (payload) {
      var rows = payload && Array.isArray(payload.data) ? payload.data : [];
      return rows.map(function (row) {
        return est.core.normalizeComparable(row, "SEA ESTATES listing");
      }).filter(Boolean);
    }).catch(function () { return []; });
    /* A hung request must not hold the report hostage. */
    var timeout = new Promise(function (resolve) {
      var timer = setTimeout(function () { resolve([]); }, 2500);
      if (timer && timer.unref) timer.unref();
    });
    return Promise.race([request, timeout]);
  }

  /* Context only. Nothing in this function writes to a pricing field, and
     tests/value_guide_flow_node.js freezes the golden totals across it. */
  function applyComparables(result, list, est) {
    if (!result) return result;
    var rows = Array.isArray(list) ? list : [];
    result.comparableListingCount = rows.length;
    result.comparableSummary = rows.length ? summarize(result, rows, est) : null;
    return result;
  }

  function comparablesSection(summary, rows) {
    var head = '<div data-vg-comparables class="mt-16"><h3>Our own listings, for context</h3>'
      + "<p>Asking advertisements from our own catalog, not completed sales. "
      + "Shown for context only; no listing price enters the calculation above.</p>";
    if (!rows.length) return head + "<p>No matching listings for this municipality.</p></div>";
    var s = summary || {};
    var items = (s.records || rows).slice(0, 8).map(function (rec) {
      return "<li>" + esc(rec.title || rec.id || "Listing") + " · " + peso(rec.price) + "</li>";
    }).join("");
    return head + "<p>" + rows.length + " listing(s)"
      + (s.medianPricePerSqm ? "; median " + peso(s.medianPricePerSqm) + "/sqm" : "")
      + (s.askingIndication ? "; indication " + peso(s.askingIndication.value) : "") + ".</p>"
      + (items ? "<ul>" + items + "</ul>" : "")
      + '<p class="dim tiny">' + esc(s.policy || "") + "</p></div>";
  }

  function methodologySection(result) {
    var model = (result && result.referenceModel) || {};
    var applied = {};
    (model.sections || []).forEach(function (s) { applied[s.id] = s; });
    var rows = FACTORS.map(function (f) {
      var hit = applied[f.id], bp = hit ? hit.bp : 0;
      return '<tr data-vf="' + esc(f.id) + '"><th scope="row">' + esc(f.label) + "</th><td>"
        + esc(f.section) + "</td><td>" + (bp > 0 ? "+" : "") + (bp / 100).toFixed(2) + "%</td></tr>";
    }).join("");
    return '<div data-vg-methodology class="mt-16"><h3>Methodology</h3>'
      + "<p>BIR zonal base × market-indicator factor " + MODEL.MARKET_IND
      + ", then one additive net of the twelve published answers below. Every answer is added once and "
      + "the total is applied once; nothing is compounded.</p>"
      + '<table><thead><tr><th>Question</th><th>Section</th><th>Applied</th></tr></thead><tbody>'
      + rows + "</tbody></table>"
      + '<p><b>Applied net:</b> ' + pct(model.net) + " on land, " + pct(model.buildingNet)
      + " on the improvement.</p>"
      + '<p class="dim small">Construction rates are flat and never escalated: '
      + peso(model.rcnRate) + " per sqm for this build type, depreciated straight-line to a "
      + MODEL.DEP_CAP * 100 + "% cap over " + (model.usefulLife || 40) + " years.</p></div>";
  }

  /* The report body after the figures: model callout first, then comparables,
     then the methodology that produced the number. */
  function reportSections(result, est, list) {
    var rows = Array.isArray(list) ? list : [];
    var summary = (result && result.comparableSummary) || summarize(result, rows, est);
    return [MODEL_CALLOUT, comparablesSection(summary, rows), methodologySection(result)].join("\n");
  }

  return { MODEL: MODEL, FACTORS: FACTORS, SEC_LAND_TERRAIN: SEC_LAND_TERRAIN,
           SEC_BUILDING: SEC_BUILDING, SEC_NEIGHBOURING: SEC_NEIGHBOURING, SEC_LEGAL: SEC_LEGAL,
           netOf: netOf, sectionsOf: sectionsOf, compute: compute,
           MODEL_CALLOUT: MODEL_CALLOUT, loadComparables: loadComparables,
           applyComparables: applyComparables, reportSections: reportSections };
});
