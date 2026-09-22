/* ============================================================
   ES Realty — Batangas Value Guide (v3)
   Pure Node-testable math core over the official BIR import
   + 4-screen funnel UI (Phase 4).

   Data contract:
     config   = data/zonal-config.json        (engine constants)
     index    = data/batangas-zonal.json       (lightweight muni index + province aggregates)
     muniData = data/bir-batangas/municipalities/<slug>.json  (barangay / street / class values)
   ============================================================ */
(function (root, factory) {
  if (typeof module === "object" && module.exports) module.exports = factory();
  else root.ESREALTY_EST = factory();
})(typeof self !== "undefined" ? self : this, function () {
  "use strict";

  var servicesBound = false;

  /* ---------------------------------------------------------- */
  /*  normalization / classification mapping                     */
  /* ---------------------------------------------------------- */

  function normKey(s) {
    return String(s == null ? "" : s).toUpperCase().replace(/\s+/g, " ").trim();
  }

  function useOfClassification(config, cls) {
    var u = (config && config.classificationUses) || {};
    var agri = u.agricultural != null ? String(u.agricultural) : "A";
    var comm = (u.commercial) || ["CR", "CC"];
    var ind = (u.industrial) || ["I"];
    var code = String(cls || "").toUpperCase();
    if (!code) return "residential";
    if (agri && code.indexOf(agri) === 0) return "agricultural";
    if (comm.indexOf(code) !== -1) return "commercial";
    if (ind.indexOf(code) !== -1) return "industrial";
    return "residential";
  }

  function bandMid(config, use) {
    var b = config && config.marketBand && config.marketBand.bands && config.marketBand.bands[use];
    return (b && b.mid != null) ? b.mid : 2.5;
  }

  function proxyFactor(config, use) {
    var f = config && config.proxyFactors && config.proxyFactors[use];
    return (f && f.factor != null) ? f.factor : 1;
  }

  function regionalAdj(config) {
    var a = config && config.marketBand && config.marketBand.regionalAdj;
    return (a == null) ? 1 : a;
  }

  var DEPTH_META = {
    1: { level: "street", pct: 0.95, rangePct: 0.05, label: "Exact BIR street value" },
    2: { level: "barangay-other", pct: 0.85, rangePct: 0.10, label: "Barangay all-other-streets value" },
    3: { level: "municipality", pct: 0.70, rangePct: 0.20, label: "Municipality average" },
    4: { level: "province", pct: 0.55, rangePct: 0.30, label: "Batangas province average" }
  };

  function metaFor(depth) {
    return DEPTH_META[depth] ? DEPTH_META[depth] : DEPTH_META[4];
  }

  /* ---------------------------------------------------------- */
  /*  fallback chain                                            */
  /* ---------------------------------------------------------- */

  function resolveBase(ctx, sel) {
    if (!ctx || !sel) return null;
    var cls = normKey(sel.classification);
    var qBr = normKey(sel.barangay);
    var qSt = normKey(sel.streetKey);
    var br = null;
    if (ctx.byBarangay) {
      var bkeys = Object.keys(ctx.byBarangay);
      for (var bi = 0; bi < bkeys.length; bi++) {
        if (normKey(bkeys[bi]) === qBr) { br = ctx.byBarangay[bkeys[bi]]; break; }
      }
    }
    if (br) {
      var st = null;
      var skeys = br.streets ? Object.keys(br.streets) : [];
      for (var si = 0; si < skeys.length; si++) {
        if (normKey(skeys[si]) === qSt) { st = br.streets[skeys[si]]; break; }
      }
      if (st && st.classes && st.classes[cls]) {
        var v = Number(st.classes[cls].value);
        if (v > 0) return { value: v, depth: 1, count: 1, streetName: st.name || qSt };
      }
      if (br.other && br.other[cls]) {
        var ov = Number(br.other[cls]);
        if (ov > 0) return { value: ov, depth: 2, count: 1 };
      }
    }
    var ma = ctx.muniByClass ? ctx.muniByClass[cls] : null;
    if (ma && ma.p50 > 0) return { value: ma.p50, depth: 3, count: ma.count };
    var pa = ctx.provinceByClass ? ctx.provinceByClass[cls] : null;
    if (pa && pa.p50 > 0) return { value: pa.p50, depth: 4, count: pa.count };
    return null;
  }

  /* ---------------------------------------------------------- */
  /*  estimator core                                             */
  /* ---------------------------------------------------------- */

  function isFiniteNum(n) { return typeof n === "number" && isFinite(n); }

  function computeEstimate(config, index, muniData, opts) {
    var unavailable = function (reason) {
      return { available: false, reason: reason, calculationVersion: cfgVersion(config), dataVersion: dataVersionOf(index) };
    };
    function cfgVersion(c) { return (c && c.calculationVersion) || "unknown"; }
    function dataVersionOf(i) { return (i && i.dataVersion) || "unknown"; }

    var area = Number(opts && opts.area);
    if (!(area > 0)) return unavailable("no-area");
    if (!config || !index || !muniData || !muniData.barangays) return unavailable("data-integrity");

    var muniRow = null;
    var wanted = normKey(opts.municipality);
    var munis = (index.municipalities || []);
    for (var i = 0; i < munis.length; i++) {
      if (normKey(munis[i].name) === wanted) { muniRow = munis[i]; break; }
    }
    if (!muniRow) return unavailable("municipality-not-found");

    var cls = normKey(opts.classification);
    var sel = { barangay: opts.barangay, streetKey: opts.streetKey, classification: cls };
    var hit = resolveBase(
      { byBarangay: muniData.barangays, muniByClass: muniRow.byClass, provinceByClass: index.provinceByClass },
      sel
    );
    if (!hit) return unavailable("no-data");

    var cfg = config;
    var meta = metaFor(hit.depth);
    var use = useOfClassification(cfg, cls);
    var cornerPct = opts.corner ? Number(cfg.cornerLotPct || 0) : 0;
    var proxy = proxyFactor(cfg, use);
    var band = bandMid(cfg, use);
    var adj = regionalAdj(cfg);
    var base = hit.value;
    var landPerSqm = Math.round(base * (1 + cornerPct) * proxy * band * adj);
    var landValue = Math.round(landPerSqm * area);

    var typeKey = opts.type === "house_lot" ? "house_lot" : "vacant_lot";
    var typeDef = (cfg.propertyTypes && cfg.propertyTypes[typeKey]) || { label: typeKey, kind: "land" };
    var kind = typeDef.kind === "built" ? "built" : "land";

    var floorArea = 0, floorsMult = 1, ageMid = 0, depPct = 0, buildCost = 0, improvement = 0, featuresTotal = 0, featuresUsed = [];
    if (kind === "built") {
      var fDef = Number(typeDef.floorDefaultRatio) > 0 ? typeDef.floorDefaultRatio : 0.6;
      floorArea = Number(opts.floorArea) > 0 ? Math.round(Number(opts.floorArea)) : Math.round(area * fDef);
      var floors = (cfg.floors || []).filter(function (f) { return f.key === (opts.floors || "1"); })[0];
      floorsMult = (floors && floors.multiplier) || 1;
      var ab = (cfg.ageBands || []).filter(function (b) { return b.key === (opts.ageBand || "0-5"); })[0];
      ageMid = (ab && ab.midpoint) || 2.5;
      var life = (cfg.depreciation && cfg.depreciation.lifeYears) || 40;
      var maxDep = (cfg.depreciation && cfg.depreciation.maxPct) || 0.95;
      depPct = Math.round(Math.min(ageMid / life, maxDep) * 100) / 100;
      var cons = cfg.construction ? cfg.construction[(opts.construction || "mixed_chb")] : null;
      buildCost = (cons && cons.costPerSqm) || 25000;
      featuresTotal = 0;
      featuresUsed = [];
      var feats = cfg.features || {};
      (opts.features || []).forEach(function (fk) {
        var fdef = feats[fk];
        if (fdef && isFiniteNum(fdef.cost)) { featuresTotal += fdef.cost; featuresUsed.push(fk); }
      });
      improvement = Math.round(buildCost * floorArea * floorsMult * (1 - depPct)) + featuresTotal;
    }

    var total = landValue + improvement;
    var rangePct = meta.rangePct;
    var low = Math.round(total * (1 - rangePct));
    var high = Math.round(total * (1 + rangePct));
    var perSqm = Math.round(total / area);

    if (!isFiniteNum(landValue) || !isFiniteNum(total) || !isFiniteNum(perSqm)) {
      return unavailable("integrity-fail");
    }

    var clsLabel = "";
    if (index.classifications && index.classifications[cls] != null) clsLabel = index.classifications[cls];

    return {
      available: true,
      reason: "",
      municipality: muniRow.name,
      municipalitySlug: muniRow.slug,
      rdo: muniRow.rdo,
      departmentOrder: muniRow.departmentOrder,
      revision: muniRow.revision,
      effectivityDate: muniRow.effectivityDate,
      coverage: muniRow.coverage,
      barangay: normKey(opts.barangay),
      streetKey: normKey(opts.streetKey),
      streetName: hit.streetName || normKey(opts.streetKey),
      classification: cls,
      classificationLabel: clsLabel,
      purpose: opts.purpose || "",
      type: typeKey,
      typeLabel: typeDef.label,
      kind: kind,
      use: use,
      corner: { applied: !!opts.corner, pct: cornerPct },
      source: { level: meta.level, depth: hit.depth, pct: meta.pct, label: meta.label, count: hit.count, referencable: hit.streetName || "" },
      reference: {
        value: base,
        schedule: muniRow.departmentOrder + " (" + (muniRow.revision || "") + "), effective " + muniRow.effectivityDate,
        rdo: muniRow.rdo
      },
      factors: { proxyFactor: proxy, bandMid: band, regionalAdj: adj },
      landPerSqm: landPerSqm,
      landValue: landValue,
      area: area,
      floorArea: floorArea,
      floorsMultiplier: floorsMult,
      ageMidpoint: ageMid,
      depreciatedPct: Math.round(depPct * 100),
      buildCostPerSqm: buildCost,
      improvement: improvement,
      featuresUsed: featuresUsed,
      featuresTotal: featuresTotal,
      total: total,
      perSqm: perSqm,
      rangePct: rangePct,
      low: low,
      high: high,
      calculationVersion: cfgVersion(cfg),
      dataVersion: dataVersionOf(index),
      disclaimer: (cfg && cfg.disclaimer) || "",
      fallbackNote: hit.depth > 1
        ? "No exact BIR street rate for this classification here — used " + meta.label.toLowerCase() + (hit.depth > 2 ? " (median of " + hit.count + " values)" : "") + "."
        : ""
    };
  }

  function taxMath(config, total) {
    var t = (config && config.tax) || {};
    var cgt = Math.round((total || 0) * (t.cgtPct || 0.06));
    var dst = Math.round((total || 0) * (t.dstPct || 0.015));
    var transfer = Math.round((total || 0) * (t.transferPct || 0.005));
    var reg = Math.round((total || 0) * (t.registrationPct || 0.001));
    return { cgt: cgt, dst: dst, transfer: transfer, registration: reg, total: cgt + dst + transfer + reg };
  }

  function integrityCheck(result) {
    if (!result || !result.available) return { ok: false, reason: "unavailable" };
    var sums = result.improvement === 0
      ? (result.landValue === result.total)
      : (result.landValue + result.improvement === result.total);
    var range = result.total * (1 - result.rangePct) === result.low &&
        result.total * (1 + result.rangePct) === result.high;
    return {
      ok: sums,
      sumsMatch: sums,
      rangeMatch: range,
      finite: isFiniteNum(result.total) && isFiniteNum(result.low) && isFiniteNum(result.high),
      perSqmMatches: Math.round(result.total / result.area) === result.perSqm
    };
  }

  var core = {
    normKey: normKey,
    useOfClassification: useOfClassification,
    bandMid: bandMid,
    proxyFactor: proxyFactor,
    regionalAdj: regionalAdj,
    metaFor: metaFor,
    resolveBase: resolveBase,
    computeEstimate: computeEstimate,
    taxMath: taxMath,
    integrityCheck: integrityCheck
  };

  /* ---------------------------------------------------------- */
  /*  format helpers                                             */
  /* ---------------------------------------------------------- */

  function esc(value) {
    return String(value == null ? "" : value).replace(/[&<>"']/g, function (ch) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[ch];
    });
  }

  function fmt(n) {
    return new Intl.NumberFormat("en-PH", { maximumFractionDigits: 0 }).format(Math.round(n || 0));
  }

  function money(n) {
    return "₱" + fmt(n);
  }

  function labelFor(config, kind, key) {
    var m = (config && config[kind]) || {};
    var it = m[key];
    return (it && it.label) ? it.label : String(key || "");
  }

  var COMMUNITIES = ["Established residential", "Mixed residential/commercial", "Coastal", "Agricultural", "Mountain / hillside", "Riverside"];
  var FLOOD_RISKS = ["Low", "Moderate", "High"];
  var ROAD_ACCESS = ["Concrete road frontage", "Gravel road frontage", "Dirt track access", "No direct road access"];
  var FRONTAGE = ["Wide (20m+)", "Standard (8–20m)", "Narrow (under 8m)"];

  /* ---------------------------------------------------------- */
  /*  loaders                                                     */
  /* ---------------------------------------------------------- */

  var DATA = null;
  var dataPromise = null;
  var muniCache = {};
  var streetDelegationBound = false;

  function loadJSON(url) {
    return fetch(url, { credentials: "same-origin" }).then(function (r) {
      if (!r.ok) throw new Error("Could not load " + url);
      return r.json();
    });
  }

  function loadData(force) {
    if (dataPromise && !force) return dataPromise;
    dataPromise = Promise.all([
      loadJSON("data/zonal-config.json"),
      loadJSON("data/batangas-zonal.json")
    ]).then(function (parts) {
      DATA = { config: parts[0], index: parts[1] };
      return DATA;
    });
    return dataPromise;
  }

  function loadMunicipality(slug) {
    slug = String(slug || "").toLowerCase();
    if (!slug) return Promise.reject(new Error("no municipality"));
    if (muniCache[slug]) return muniCache[slug];
    muniCache[slug] = loadJSON("data/bir-batangas/municipalities/" + slug + ".json");
    return muniCache[slug];
  }

  /* ---------------------------------------------------------- */
  /*  funnel state                                               */
  /* ---------------------------------------------------------- */

  var est = {
    screen: 1,
    purpose: "Selling",
    stage: "",
    type: "vacant_lot",
    municipality: "",
    municipalitySlug: "",
    barangay: "",
    streetKey: "",
    streetLabel: "",
    allOther: false,
    classification: "",
    area: null,
    corner: false,
    floorArea: "",
    construction: "mixed_chb",
    floors: "1",
    ageBand: "0-5",
    features: [],
    community: "",
    floodRisk: "",
    roadAccess: "",
    frontage: "",
    result: null,
    muniData: null,
    muniLoading: false
  };

  /* ---------------------------------------------------------- */
  /*  UI building                                                */
  /* ---------------------------------------------------------- */

  function getCard() {
    return typeof document !== "undefined" ? document.querySelector("[data-est-card]") : null;
  }

  function chip(label, value, active, attr) {
    return '<button type="button" class="sf-est-chip' + (active ? " active" : "") + '"' +
      (attr ? " " + attr : "") + ' data-val="' + esc(value) + '">' + esc(label) + "</button>";
  }

  function chipRow(opts, dataT) {
    return '<div class="sf-est-chips" data-chip-group' + (dataT ? ' data-t="' + esc(dataT) + '"' : "") + ">" + opts.map(function (o) {
      return chip(o.label, o.value, !!o.active, o.attr || "");
    }).join("") + "</div>";
  }

  function muniOptions() {
    if (!DATA) return "";
    return DATA.index.municipalities.slice().sort(function (a, b) {
      return String(a.name).localeCompare(String(b.name));
    }).map(function (m) {
      var sel = m.name === est.municipality ? " selected" : "";
      return '<option value="' + esc(m.name) + '"' + sel + ">" + esc(m.name) + "</option>";
    }).join("");
  }

  function barangayOptions() {
    if (!est.muniData) return '<option value="">— choose a municipality first —</option>';
    var keys = Object.keys(est.muniData.barangays).sort(function (a, b) {
      return String(a).localeCompare(String(b));
    });
    if (!keys.length) return '<option value="">— no barangay data —</option>';
    return keys.map(function (b) {
      var sel = b === est.barangay ? " selected" : "";
      return '<option value="' + esc(b) + '"' + sel + ">" + esc(b) + "</option>";
    }).join("");
  }

  function currentBarangay() {
    return est.muniData && est.muniData.barangays ? est.muniData.barangays[est.barangay] : null;
  }

  function streetTitles() {
    var br = currentBarangay();
    if (!br || !br.streets) return [];
    return Object.keys(br.streets).map(function (key) {
      return { key: key, name: br.streets[key].name || key };
    }).sort(function (a, b) { return String(a.name).localeCompare(String(b.name)); });
  }

  function classCandidates() {
    var br = currentBarangay();
    var muniByClass = est.muniRow ? est.muniRow.byClass : {};
    var list = [];
    var push = function (codes) {
      (codes || []).forEach(function (c) {
        if (list.indexOf(c) === -1) list.push(c);
      });
    };
    if (br) {
      if (!est.allOther) {
        var st = br.streets ? br.streets[est.streetKey] : null;
        if (st && st.classes) push(Object.keys(st.classes));
      }
      if (br.other) push(Object.keys(br.other));
    }
    push(Object.keys(muniByClass));
    return list;
  }

  function classOptions() {
    var list = classCandidates();
    if (!list.length) return '<option value="">— no classifications available —</option>';
    var labels = (DATA && DATA.index.classifications) || {};
    return list.map(function (c) {
      var l = labels[c] ? " — " + labels[c] : "";
      return '<option value="' + esc(c) + '"' + (c === est.classification ? " selected" : "") + ">" + esc(c + l) + "</option>";
    }).join("");
  }

  function locSummary() {
    var bits = ['<span class="sf-est-loc-fixed">Region IV-A (CALABARZON) · Batangas</span>'];
    if (est.municipality) bits.push("<b>" + esc(est.municipality) + "</b>");
    if (est.barangay) bits.push(esc(est.barangay));
    if (est.streetLabel && !est.allOther) bits.push("<span>" + esc(est.streetLabel) + "</span>");
    else if (est.allOther) bits.push("<span>Street not listed</span>");
    return '<div class="sf-est-locator"><span>' + bits.join(" · ") + "</span></div>";
  }

  function screen1Html() {
    var out = '<div class="sf-est-step" data-est-screen="1">';
    out += locSummary();
    out += '<div class="sf-est-step-head"><span class="sf-est-step-no">01</span><h3>Tell us about the property</h3></div>';
    out += '<div class="sf-est-fields">';

    out += '<label class="sf-est-field sf-est-span2">Purpose<span>Why do you want to know the value?</span>' +
      chipRow((DATA.config.purposes || []).map(function (p) {
        return { label: p, value: p, active: est.purpose === p };
      }), "purpose") + "</label>";

    if (est.purpose === "Selling") {
      out += '<label class="sf-est-field sf-est-span2">Selling stage<span>Optional — helps us prepare the right advice.</span>' +
        chipRow([
          { label: "Just checking", value: "just-checking", active: est.stage === "just-checking" },
          { label: "Preparing to list", value: "preparing", active: est.stage === "preparing" },
          { label: "Ready to list now", value: "ready", active: est.stage === "ready" }
        ], "stage") + "</label>";
    }

    out += '<label class="sf-est-field sf-est-span2">Property type<span>Vacant land, or land with a house?</span>' +
      chipRow([
        { label: "Vacant lot", value: "vacant_lot", active: est.type === "vacant_lot" },
        { label: "House &amp; lot", value: "house_lot", active: est.type === "house_lot" }
      ], "type") + "</label>";

    out += '<label class="sf-est-field">Municipality<span>Which municipality in Batangas?</span>' +
      '<select data-est-muni><option value="">— choose —</option>' + muniOptions() + "</select></label>";

    out += '<label class="sf-est-field">Barangay<span>Your barangay</span>' +
      '<select data-est-barangay>' + barangayOptions() + "</select></label>";

    out += '<div class="sf-est-field sf-est-span2">Street<span>Search the BIR street list, or choose “Street not listed”.</span>' +
      '<input data-est-street-q type="search" placeholder="Type to search streets…" autocomplete="off" aria-label="Search the BIR street list" value="' + esc(est.allOther ? "" : est.streetLabel) + '">' +
      '<div class="sf-est-street-list" data-est-street-list></div></div>';

    out += '<label class="sf-est-field">BIR classification<span>Zonal use classification</span>' +
      '<select data-est-class>' + classOptions() + "</select></label>";

    out += '<label class="sf-est-field">Lot area (sqm)<span>The total land area</span>' +
      '<input data-est-area type="number" min="20" max="100000" step="1" inputmode="decimal" placeholder="e.g. 200" value="' + esc(est.area != null ? est.area : "") + '"></label>';

    out += '</div>';
    out += '<label class="sf-est-field sf-est-corner"><input type="checkbox" data-est-corner' + (est.corner ? " checked" : "") + ">" +
      '<span><b>Corner lot</b> — frontage on more than one road <small>(+2.5% value)</small></span></label>';

    out += '<div class="sf-est-actions">' +
      '<span class="sf-est-next-hint">We use the official BIR zonal schedule for ' + (est.municipality || "your municipality") + ".</span>" +
      '<button type="button" class="sf-est-next" data-est-next>' + (est.type === "house_lot" ? "Continue to the house →" : "See my estimate →") + "</button></div>";
    return out + "</div>";
  }

  function reviewFactorBlock() {
    return '<div class="sf-est-fields">' +
      '<label class="sf-est-field">Community / setting<span>Non-monetary — recorded for your specialist</span>' +
      '<select data-est-community><option value="">— choose —</option>' +
      COMMUNITIES.map(function (c) { return '<option' + (est.community === c ? " selected" : "") + ">" + esc(c) + "</option>"; }).join("") + "</select></label>" +
      '<label class="sf-est-field">Flood risk<span>Non-monetary — site-review flag</span>' + chipRow(
        FLOOD_RISKS.map(function (r) { return { label: r, value: r, active: est.floodRisk === r }; }), "floodRisk"
      ) + "</label>" +
      '<label class="sf-est-field">Road access<span>Non-monetary — site-review flag</span>' +
      '<select data-est-road><option value="">— choose —</option>' +
      ROAD_ACCESS.map(function (r) { return '<option' + (est.roadAccess === r ? " selected" : "") + ">" + esc(r) + "</option>"; }).join("") + "</select></label>" +
      '<label class="sf-est-field">Frontage<span>Non-monetary — site-review flag</span>' +
      '<select data-est-frontage><option value="">— choose —</option>' +
      FRONTAGE.map(function (f) { return '<option' + (est.frontage === f ? " selected" : "") + ">" + esc(f) + "</option>"; }).join("") + "</select></label>" +
      "</div>";
  }

  function screen2Html() {
    var out = '<div class="sf-est-step" data-est-screen="2">';
    out += locSummary();
    out += '<div class="sf-est-step-head"><span class="sf-est-step-no">02</span><h3>About the house</h3></div>';
    if (est.type === "house_lot") {
      out += '<div class="sf-est-fields">' +
        '<label class="sf-est-field sf-est-span2">Construction style<span>Main build type</span>' + chipRow(
          ["wood_prefab", "mixed_chb", "rca_steel"].map(function (k) {
            return { label: labelFor(DATA.config, "construction", k), value: k, active: est.construction === k };
          }), "construction") + "</label>" +
        '<label class="sf-est-field">Floor / built-up area (sqm)<span>Blank uses 60% of the lot as a guide</span>' +
        '<input data-est-floor type="number" min="0" max="100000" step="1" inputmode="decimal" placeholder="auto — ' + fmt(Math.round((est.area || 0) * 0.6)) + ' sqm" value="' + esc(est.floorArea) + '"></label>' +
        '<label class="sf-est-field">Storeys<span>Multiplier on construction</span>' + chipRow(
          (DATA.config.floors || []).map(function (f) {
            return { label: f.label, value: f.key, active: est.floors === f.key };
          }), "floors") + "</label>" +
        '<label class="sf-est-field sf-est-span2">Age band<span>Straight-line depreciation, capped</span>' + chipRow(
          (DATA.config.ageBands || []).map(function (b) {
            return { label: b.label, value: b.key, active: est.ageBand === b.key };
          }), "ageBand") + "</label>" +
        '<div class="sf-est-field sf-est-span2">Improvements<span>Things that add real, itemised value</span><div class="sf-est-feat-grid">' +
        Object.keys(DATA.config.features || {}).map(function (fk) {
          var f = DATA.config.features[fk];
          var on = est.features.indexOf(fk) !== -1;
          return '<label class="sf-est-feat' + (on ? " on" : "") + '"><input type="checkbox" data-est-feature="' + esc(fk) + '"' + (on ? " checked" : "") + ">" +
            "<span><b>" + esc(f.label) + "</b><small>+" + money(f.cost) + "</small></span></label>";
        }).join("") + "</div></div>" +
        "</div>";
    } else {
      out += '<p class="sf-est-hint">As a vacant lot there is no house to value — we only look at the land.</p>';
    }
    out += '<div class="sf-est-subhead">Site review factors</div>';
    out += reviewFactorBlock();
    out += '<div class="sf-est-actions"><button type="button" class="sf-est-next sf-est-prev" data-est-prev>← Back</button>' +
      '<button type="button" class="sf-est-next" data-est-next>See my estimate →</button></div>';
    return out + "</div>";
  }

  function screen3Html() {
    return '<div class="sf-est-step sf-est-anim" data-est-screen="3">' +
      '<div class="sf-est-anim-ring" data-est-spin><b data-est-anim-total>₱0</b><span>calculating…</span></div>' +
      '<p class="sf-est-anim-note" data-est-anim-note>Matching your barangay, street and BIR classification…</p></div>';
  }

  function reportSections(r) {
    var tax = taxMath(DATA.config, r.total);
    var s = [];

    s.push({ t: "Estimate at a glance", h: 
      '<div class="sf-est-total">' + money(r.total) + "</div>" +
      '<p class="sf-est-range">Indicative range <b>' + money(r.low) + " – " + money(r.high) + "</b></p>" +
      '<p class="sf-est-per">≈ ' + money(r.perSqm) + " /sqm of lot on " + fmt(r.area) + " sqm" + (r.kind && r.type === "house_lot" ? " · " + fmt(r.floorArea) + " sqm floor area" : "") + "</p>" });

    s.push({ t: "The property", h:
      "<ul class=\"sf-est-rdl\">" +
      "<li>Purpose: <b>" + esc(r.purpose || "—") + "</b></li>" +
      "<li>Type: <b>" + esc(r.typeLabel) + "</b></li>" +
      "<li>Municipality: <b>" + esc(r.municipality) + "</b></li>" +
      "<li>Barangay: <b>" + esc(r.barangay) + "</b></li>" +
      "<li>Street: <b>" + esc(r.streetName ? r.streetName : "Street not listed") + "</b></li>" +
      "<li>Lot area: <b>" + fmt(r.area) + " sqm</b>" + (r.corner.applied ? " · corner lot (+2.5%)" : "") + "</li>" +
      "</ul>" });

    s.push({ t: "Source of land rates", h:
      "<p class=\"sf-est-rdp\">Official BIR zonal schedule <b>" + esc(r.reference.schedule) + "</b>, RDO " + esc(r.rdo) +
      " (DO " + esc(r.departmentOrder) + ", " + esc(r.revision) + "). Data version <b>" + esc(r.dataVersion) + "</b>, calculation " + esc(r.calculationVersion) + ".</p>" });

    s.push({ t: "BIR classification used", h:
      "<p class=\"sf-est-rdp\"><b>" + esc(r.classification + (r.classificationLabel ? " — " + r.classificationLabel : "")) + "</b>. Use group: " + esc(r.use) + ". Coverage: " + esc(r.coverage) + ".</p>" });

    s.push({ t: "How precise is this match?", h:
      "<ul class=\"sf-est-rdl\"><li>Match confidence: <b>" + Math.round(r.source.pct * 100) + "%</b> — " + esc(r.source.label) + "</li>" +
      (r.fallbackNote ? "<li>" + esc(r.fallbackNote) + "</li>" : "") + "</ul>" });

    s.push({ t: "Land value build-up", h:
      '<div class="sf-est-breakdown">' +
      "<span>" + money(r.reference.value) + "/sqm BIR base</span><i>×</i>" +
      "<span>Corner " + (r.corner.applied ? "+" + Math.round(r.corner.pct * 100) + "%" : "no") + "</span><i>×</i>" +
      "<span>" + r.use + " " + r.factors.proxyFactor.toFixed(2) + "</span><i>×</i>" +
      "<span>Market band " + r.factors.bandMid.toFixed(2) + "</span><i>×</i>" +
      "<span>Region " + r.factors.regionalAdj.toFixed(2) + "</span>" +
      "</div>" +
      '<p class="sf-est-coverage">Effective land rate <b>' + money(r.landPerSqm) + " /sqm</b> × " + fmt(r.area) +
      " sqm = <b>" + money(r.landValue) + "</b> land value.</p>" });

    if (r.type === "house_lot") {
      s.push({ t: "House value (replacement cost approach)", h:
        "<ul class=\"sf-est-rdl\">" +
        "<li>Construction: <b>≈ " + money(r.buildCostPerSqm) + "/sqm</b> on " + fmt(r.floorArea) + " sqm floor area</li>" +
        "<li>Storeys: <b>×" + r.floorsMultiplier.toFixed(2) + "</b> · Age band midpoint <b>" + r.ageMidpoint + " yrs</b>, depreciation <b>" + r.depreciatedPct + "%</b></li>" +
        "<li>Improvements itemised: <b>" + (r.featuresTotal > 0 ? money(r.featuresTotal) : "none") + "</b></li>" +
        "<li>House value: <b>" + money(r.improvement) + "</b></li>" +
        "</ul>" });
    } else {
      s.push({ t: "House value", h: "<p class=\"sf-est-rdp\">Vacant lot — valued on land only; no improvement included in this estimate.</p>" });
    }

    s.push({ t: "Total estimate and range", h:
      "<p class=\"sf-est-rdp\"><b>" + money(r.total) + "</b> · range <b>" + money(r.low) + " – " + money(r.high) +
      "</b> (" + Math.round(r.rangePct * 100) + "% band by match confidence). ≈ <b>" + money(r.perSqm) + "</b>/sqm.</p>" });

    s.push({ t: "Confidence and limitations", h:
      "<p class=\"sf-est-rdp\">The BIR figure is matched street-by-street; where a street has no listed rate for a classification the engine falls back to the barangay all-other-streets rate, then municipality and province medians, narrowing confidence accordingly. Rows the BIR masked as “same as above” were resolved only when a municipality-wide rate existed — never guessed.</p>" });

    s.push({ t: "Estimated transfer costs", h:
      '<div class="sf-est-tax"><span>On a ' + money(r.total) + " sale you would roughly face:</span>" +
      "<b>CGT 6% ≈ " + money(tax.cgt) + "</b><b>DST 1.5% ≈ " + money(tax.dst) + "</b>" +
      "<b>Transfer ~0.5% ≈ " + money(tax.transfer) + "</b><b>Registration ~0.1% ≈ " + money(tax.registration) + "</b></div>" +
      "<p class=\"sf-est-rdp\">Illustrative only — not tax or legal advice; confirm with the BIR and your counsel.</p>" });

    s.push({ t: "Site review factors you recorded", h:
      "<ul class=\"sf-est-rdl\">" +
      "<li>Community/setting: <b>" + esc(est.community || "not stated") + "</b></li>" +
      "<li>Flood risk: <b>" + esc(est.floodRisk || "not stated") + "</b></li>" +
      "<li>Road access: <b>" + esc(est.roadAccess || "not stated") + "</b></li>" +
      "<li>Frontage: <b>" + esc(est.frontage || "not stated") + "</b></li>" +
      "</ul>" +
      "<p class=\"sf-est-rdp\">These flags do not change the arithmetic — they are recorded so a specialist verifies them on site.</p>" });

    s.push({ t: "Methodology", h:
      "<p class=\"sf-est-rdp\">Deterministic and reconcilable: the same inputs always produce the same figure, the build-up is shown section by section, and the engine fails closed whenever a required value is missing — it never fabricates a number.</p>" });

    s.push({ t: "Legal", h: '<p class="sf-est-disclaimer">' + esc(r.disclaimer) + "</p>" });

    s.push({ t: "Verify with us", h:
      "<p class=\"sf-est-rdp\"><b>An ES Realty representative will verify your inputs against the current BIR schedule and contact you within one business day.</b> Estimates here are indicative only — confirm on the ground before any transaction.</p>" });

    return s;
  }

  function screen4Html() {
    var r = est.result;
    if (!r || !r.available) return unavailableHtml();
    var out = '<div class="sf-est-step" data-est-screen="4">';
    out += locSummary();
    out += '<div class="sf-est-step-head"><span class="sf-est-step-no">03–04</span><h3>Your guide estimate</h3></div>';
    out += '<div class="sf-est-cov-row">' + coverageTag(r.coverage) + '<span class="sf-est-asof">BIR schedule effective ' + esc(r.effectivityDate) + " · data " + esc(r.dataVersion) + "</span></div>";
    out += '<div class="sf-est-report">';
    reportSections(r).forEach(function (sec, i) {
      out += '<section class="sf-est-rsec">' +
        '<div class="sf-est-rsec-head"><b>' + zeroPad(i + 1) + "</b><h4>" + esc(sec.t) + "</h4></div>" + sec.h + "</section>";
    });
    out += "</div>";
    out += '<div class="sf-est-actions"><button type="button" class="sf-est-next sf-est-prev" data-est-prev>← Adjust inputs</button></div>';
    out += leadBlock(r);
    return out + "</div>";
  }

  function unavailableHtml() {
    var r = est.result || {};
    return '<div class="sf-est-unavail sf-est-step" data-est-screen="4">' +
      '<span class="sf-est-tag sf-est-tag-unavailable">Unavailable</span>' +
      "<h3>No estimate available yet" + (est.municipality ? " for " + esc(est.municipality) : "") + "</h3>" +
      "<p>" + esc(unavailableReason(r.reason)) + "</p>" +
      '<div class="sf-est-actions"><button type="button" class="sf-est-next sf-est-prev" data-est-prev>← Back to inputs</button></div>' +
      "</div>";
  }

  function unavailableReason(reason) {
    if (reason === "no-data") return "The official BIR schedule for this municipality does not publish a rate for the classification you chose, and no municipality or province median exists for it either. We don't guess — pick another classification, or ask us for an on-ground check.";
    if (reason === "municipality-not-found") return "That municipality is not in the imported BIR set.";
    if (reason === "integrity-fail") return "The calculation could not be reconciled and was stopped.";
    return "Make sure you chose a municipality, barangay, classification and a lot area above.";
  }

  function zeroPad(n) { return n < 10 ? "0" + n : String(n); }

  function coverageTag(coverage) {
    var label = coverage === "limited" ? "Limited data" : coverage === "unavailable" ? "Unavailable" : "BIR street data";
    return '<span class="sf-est-tag sf-est-tag-' + esc(coverage || "good") + '">' + label + "</span>";
  }

  function leadBlock(r) {
    var out = '<div class="sf-est-lead" data-est-lead>';
    out += '<div class="sf-est-lead-ctas">' +
      '<button type="button" class="sf-est-lead-cta" data-est-lead-open>Email me this report →</button></div>';
    if (est.leadOpen) {
      out += '<form class="sf-est-lead-form" data-est-lead-form>' +
        "<h3>Get your report, verified</h3>" +
        '<p class="sf-est-lead-ctx">For: <b>' + esc(est.municipality + " · " + est.barangay + (est.streetLabel && !est.allOther ? " · " + est.streetLabel : "")) + "</b> · estimated " + money(r.total) + ".</p>" +
        '<div class="sf-est-lead-grid">' +
        '<label>Full name<input name="name" required maxlength="160" placeholder="Your name"></label>' +
        '<label>Email<input type="email" name="email" required maxlength="254" placeholder="you@email.com"></label>' +
        '<label>Phone<input name="phone" required maxlength="50" placeholder="Mobile number"></label>' +
        '<label>Message<textarea name="message" maxlength="600" rows="3">I’m interested in this Batangas property estimate.</textarea></label>' +
        "</div>" +
        '<label class="sf-consent"><input type="checkbox" name="consent" required><span>I consent to ES Realty emailing this report to me and contacting me within one business day.</span></label>' +
        '<button type="submit">Email me the report →</button>' +
        '<p class="sf-form-status" data-est-lead-status aria-live="polite"></p></form>';
    }
    return out + "</div>";
  }

  /* ---------------------------------------------------------- */
  /*  render + bind                                              */
  /* ---------------------------------------------------------- */

  function renderLayout() {
    var out = "";
    if (est.screen === 1) out = screen1Html();
    else if (est.screen === 2) out = screen2Html();
    else if (est.screen === 3) out = screen3Html();
    else out = screen4Html();
    var card = getCard();
    if (card) { card.innerHTML = out; bindCard(card); }
  }

  function $q(card, sel) { return card ? card.querySelector(sel) : null; }
  function $qa(card, sel) { return card ? Array.prototype.slice.call(card.querySelectorAll(sel)) : []; }

  function streetListHtml(filter) {
    var br = currentBarangay();
    var titles = streetTitles();
    var f = String(filter || "").toLowerCase().trim();
    var out = "";
    if (!br) return '<p class="sf-est-street-empty">Choose a barangay first.</p>';
    titles.filter(function (t) {
      if (!f) return true;
      return String(t.name).toLowerCase().indexOf(f) !== -1;
    }).slice(0, 50).forEach(function (t) {
      var active = t.key === est.streetKey && !est.allOther;
      out += '<button type="button" class="sf-est-street-opt' + (active ? " active" : "") + '" data-est-street="' + esc(t.key) + '">' + esc(t.name) + "</button>";
    });
    out += '<button type="button" class="sf-est-street-opt sf-est-street-all' + (est.allOther ? " active" : "") + '" data-est-street-all>Street not listed — use ALL OTHER STREETS rate →</button>';
    return out;
  }

  function bindCard(card) {
    var self = this;
    $qa(card, "[data-chip-group]").forEach(function (group) {
      group.addEventListener("click", function (e) {
        var btn = e.target.closest("[data-val]");
        if (!btn) return;
        $qa(group, "[data-val]").forEach(function (b) { b.classList.toggle("active", b === btn); });
      });
    });

    $qa(card, '[data-est-screen="1"] .sf-est-chips').forEach(function (group) {
      group.addEventListener("click", function (e) {
        var btn = e.target.closest("[data-val]");
        if (!btn) return;
        var t = group.getAttribute("data-t");
        if (t === "purpose") est.purpose = btn.getAttribute("data-val");
        else if (t === "stage") est.stage = btn.getAttribute("data-val");
        else if (t === "type") est.type = btn.getAttribute("data-val");
        renderLayout();
      });
    });

    var muniSel = $q(card, "[data-est-muni]");
    if (muniSel) muniSel.addEventListener("change", function () {
      var v = muniSel.value;
      est.municipality = v;
      est.barangay = "";
      est.streetKey = "";
      est.streetLabel = "";
      est.allOther = false;
      est.classification = "";
      est.result = null;
      var row = null;
      (DATA.index.municipalities || []).forEach(function (m) { if (m.name === v) row = m; });
      est.muniRow = row;
      if (!v) { est.muniData = null; est.municipalitySlug = ""; renderLayout(); return; }
      est.municipalitySlug = row ? row.slug : "";
      est.muniData = null;
      renderLayout();
      var slug = est.municipalitySlug;
      loadMunicipality(slug).then(function (md) {
        if (est.municipalitySlug !== slug) return;
        est.muniData = md;
        renderLayout();
      }).catch(function () {
        if (est.municipalitySlug !== slug) return;
        est.muniData = null;
        renderLayout();
      });
    });

    var brSel = $q(card, "[data-est-barangay]");
    if (brSel) brSel.addEventListener("change", function () {
      est.barangay = brSel.value;
      est.streetKey = "";
      est.streetLabel = "";
      est.allOther = false;
      est.classification = "";
      est.result = null;
      renderLayout();
    });

    var sq = $q(card, "[data-est-street-q]");
    if (sq) {
      var listEl = $q(card, "[data-est-street-list]");
      var refreshList = function () {
        if (listEl) listEl.innerHTML = streetListHtml(sq.value);
      };
      sq.addEventListener("input", refreshList);
      sq.addEventListener("focus", refreshList);
      sq.addEventListener("blur", function () {
        setTimeout(function () { if (listEl) listEl.innerHTML = ""; }, 150);
      });
      if (listEl) listEl.innerHTML = streetListHtml("");
    }

    // Street / "street not listed" clicks are delegated at the document level
    // and bound exactly once. The search-results list (streetListHtml) is
    // re-injected via innerHTML on every keystroke, creating fresh button nodes
    // that bindCard() never sees — per-node handlers would silently die there.
    if (!streetDelegationBound) {
      streetDelegationBound = true;
      document.addEventListener("click", function (e) {
        var st = e.target.closest ? e.target.closest("[data-est-street]") : null;
        if (st) {
          est.streetKey = st.getAttribute("data-est-street");
          var t = currentBarangay();
          est.streetLabel = t && t.streets && t.streets[est.streetKey] ? (t.streets[est.streetKey].name || est.streetKey) : est.streetKey;
          est.allOther = false;
          est.classification = "";
          est.result = null;
          renderLayout();
          return;
        }
        var all = e.target.closest ? e.target.closest("[data-est-street-all]") : null;
        if (all) {
          est.allOther = true;
          est.streetKey = "";
          est.streetLabel = "Street not listed";
          est.classification = "";
          est.result = null;
          renderLayout();
        }
      });
    }

    var classSel = $q(card, "[data-est-class]");
    if (classSel) classSel.addEventListener("change", function () {
      est.classification = classSel.value;
      est.result = null;
    });

    var areaIn = $q(card, "[data-est-area]");
    if (areaIn) areaIn.addEventListener("input", function () {
      est.area = Number(areaIn.value) > 0 ? Number(areaIn.value) : null;
      est.result = null;
    });

    var corner = $q(card, "[data-est-corner]");
    if (corner) corner.addEventListener("change", function () {
      est.corner = corner.checked;
      est.result = null;
    });

    var floorIn = $q(card, "[data-est-floor]");
    if (floorIn) floorIn.addEventListener("input", function () { est.floorArea = floorIn.value; });

    $qa(card, "[data-est-feature]").forEach(function (cb) {
      cb.addEventListener("change", function () {
        var k = cb.getAttribute("data-est-feature");
        var idx = est.features.indexOf(k);
        if (cb.checked && idx === -1) est.features.push(k);
        if (!cb.checked && idx !== -1) est.features.splice(idx, 1);
      });
    });

    var com = $q(card, "[data-est-community]");
    if (com) com.addEventListener("change", function () { est.community = com.value; });
    var road = $q(card, "[data-est-road]");
    if (road) road.addEventListener("change", function () { est.roadAccess = road.value; });
    var front = $q(card, "[data-est-frontage]");
    if (front) front.addEventListener("change", function () { est.frontage = front.value; });
    var floodGroup = {};
    $qa(card, '[data-est-screen="2"] .sf-est-chips').forEach(function (group) {
      group.addEventListener("click", function (e) {
        var btn = e.target.closest("[data-val]");
        if (!btn) return;
        var t = group.getAttribute("data-t");
        if (t === "floodRisk") est.floodRisk = btn.getAttribute("data-val");
        else if (t === "construction") est.construction = btn.getAttribute("data-val");
        else if (t === "floors") est.floors = btn.getAttribute("data-val");
        else if (t === "ageBand") est.ageBand = btn.getAttribute("data-val");
      });
    });

    var prev = $q(card, "[data-est-prev]");
    if (prev) prev.addEventListener("click", function () {
      est.screen = 2;
      renderLayout();
    });

    var next = $q(card, "[data-est-next]");
    if (next) {
      next.addEventListener("click", function () {
        if (est.screen === 1) {
          if (validScreen1()) {
            if (est.type === "house_lot") { est.screen = 2; renderLayout(); }
            else runEstimate();
          } else showErr(card);
        } else if (est.screen === 2) {
          runEstimate();
        }
      });
    }

    var leadBtn = $q(card, "[data-est-lead-open]");
    if (leadBtn) leadBtn.addEventListener("click", function () {
      est.leadOpen = true;
      renderLayout();
    });
    var leadForm = $q(card, "[data-est-lead-form]");
    if (leadForm) leadForm.addEventListener("submit", function (e) {
      e.preventDefault();
      submitLead(leadForm);
    });
  }

  function validScreen1() {
    return est.municipality && est.barangay && est.classification && est.area > 0;
  }

  function showErr(card) {
    var btn = $q(card, "[data-est-next]");
    if (!btn) return;
    var msg = $q(card, "[data-est-next-hint]");
    if (!msg) {
      var p = document.createElement("p");
      p.className = "sf-est-next-hint sf-est-err";
      p.setAttribute("data-est-next-hint", "");
      btn.parentNode.insertBefore(p, btn);
      msg = p;
    }
    msg.textContent = "Choose municipality, barangay, a street (or Street not listed), a classification and a lot area to continue.";
  }

  function runEstimate() {
    if (!validScreen1()) return;
    est.result = null;
    est.screen = 3;
    renderLayout();
    var config = DATA.config;
    var index = DATA.index;
    var opts = {
      municipality: est.municipality, barangay: est.barangay,
      streetKey: est.allOther ? "" : est.streetKey,
      classification: est.classification, area: est.area,
      corner: est.corner, purpose: est.purpose,
      type: est.type,
      floorArea: est.type === "house_lot" ? (Number(est.floorArea) > 0 ? Number(est.floorArea) : 0) : 0,
      floors: est.type === "house_lot" ? est.floors : "1",
      ageBand: est.type === "house_lot" ? est.ageBand : "0-5",
      construction: est.type === "house_lot" ? est.construction : "mixed_chb",
      features: est.type === "house_lot" ? est.features : []
    };
    loadMunicipality(est.municipalitySlug).then(function (md) {
      var r = core.computeEstimate(config, index, md, opts);
      est.result = r;
      animateThenReport();
    }).catch(function () {
      est.result = { available: false, reason: "no-data" };
      animateThenReport();
    });
  }

  function animateThenReport() {
    var card = getCard();
    var totalEl = card ? card.querySelector("[data-est-anim-total]") : null;
    var noteEl = card ? card.querySelector("[data-est-anim-note]") : null;
    var spinEl = card ? card.querySelector("[data-est-spin]") : null;
    if (spinEl) spinEl.classList.add("spin");
    if (!totalEl || !est.result || !est.result.available) {
      setTimeout(function () { est.screen = 4; renderLayout(); }, 900);
      return;
    }
    var target = est.result.total;
    var t0 = performance ? performance.now() : Date.now();
    var dur = 1500;
    function frame(t) {
      var p = Math.min(1, (t - t0) / dur);
      var e = 1 - Math.pow(1 - p, 3);
      if (totalEl) totalEl.innerHTML = money(Math.round(target * e));
      if (noteEl && est.result) {
        noteEl.textContent = p < 0.5 ? "Matching your barangay, street and BIR classification…" : "Reconciling the build-up and range…";
      }
      if (p < 1) requestAnimationFrame(frame);
      else {
        if (totalEl) totalEl.innerHTML = money(target);
        setTimeout(function () { est.screen = 4; renderLayout(); }, 420);
      }
    }
    requestAnimationFrame(frame);
  }

  /* ---------------------------------------------------------- */
  /*  lead submit (Phase 5 wires the Supabase pipeline)          */
  /* ---------------------------------------------------------- */

  function snapshotFor(r) {
    return r && r.available ? {
      municipality: r.municipality, barangay: r.barangay, street: r.streetName || "Street not listed",
      classification: r.classification, classificationLabel: r.classificationLabel,
      use: r.use, coverage: r.coverage, sourceLevel: r.source.level, confidencePct: r.source.pct,
      total: r.total, low: r.low, high: r.high, perSqm: r.perSqm,
      landValue: r.landValue, improvement: r.improvement, area: r.area,
      purpose: r.purpose, type: r.type, typeLabel: r.typeLabel,
      calculationVersion: r.calculationVersion, dataVersion: r.dataVersion,
      asOf: r.effectivityDate, schedule: r.reference.schedule
    } : null;
  }

  function locationReportUrl() {
    if (typeof window === "undefined" || !window.ESREALTY_API_BASE) return "";
    return String(window.ESREALTY_API_BASE).replace(/\/listing-api\/api$/, "/location-report");
  }

  function submitLead(form) {
    var status = form.querySelector("[data-est-lead-status]");
    var button = form.querySelector("button[type=submit]");
    var data = new FormData(form);
    var api = typeof window !== "undefined" && window.ESREALTY_LISTINGS_API;
    var r = est.result;
    var snap = snapshotFor(r);
    var message = ["Official BIR schedule estimate request"];
    message.push("Location: " + est.municipality + (est.barangay ? " · " + est.barangay : ""));
    message.push("Street: " + (est.streetLabel && !est.allOther ? est.streetLabel : "Street not listed"));
    if (snap) message.push("Estimate: " + money(snap.total) + " (" + money(snap.low) + "–" + money(snap.high) + ") · " + (snap.typeLabel || snap.type) + " · " + fmt(snap.area) + " sqm · confidence " + Math.round(snap.confidencePct * 100) + "%");
    var notes = data.get("message");
    if (notes) message.push("Notes: " + notes);
    var payload = {
      inquiry_type: "location-analysis",
      full_name: data.get("name"),
      email: data.get("email"),
      phone: data.get("phone"),
      consent: data.get("consent") === "on",
      purpose: est.purpose,
      message: message.join(" | "),
      report: {
        property: {
          purpose: est.purpose, type: snap ? snap.type : est.type,
          typeLabel: snap ? snap.typeLabel : "", kind: est.type === "house_lot" ? "built" : "land",
          area: snap ? snap.area : (est.area || 0), corner: est.corner,
          floorArea: est.type === "house_lot" ? (Number(est.floorArea) > 0 ? Number(est.floorArea) : 0) : 0
        },
        location: {
          region: "Region IV-A (CALABARZON)", province: "Batangas",
          town: est.municipality, barangay: est.barangay,
          address: est.streetLabel && !est.allOther ? est.streetLabel : "",
          streetListed: !est.allOther, lat: null, lng: null
        },
        estimate: snap,
        asOf: snap ? snap.asOf : "",
        disclaimer: r && r.disclaimer ? r.disclaimer : (DATA && DATA.config.disclaimer)
      }
    };
    if (button) { button.disabled = true; button.textContent = "Sending…"; }
    if (status) { status.textContent = "Sending…"; status.className = "sf-form-status"; }
    function fallback() {
      if (!api || !api.contact) throw new Error("Contact service unavailable");
      return api.contact({
        inquiry_type: "location-analysis",
        full_name: payload.full_name,
        email: payload.email,
        phone: payload.phone,
        message: payload.message,
        consent: payload.consent
      });
    }
    var url = locationReportUrl();
    var key = form.dataset.estIdempotencyKey ||
      ("loc-" + Date.now().toString(36) + "-" + Math.random().toString(36).slice(2, 10));
    form.dataset.estIdempotencyKey = key;
    var headers = { "Content-Type": "application/json", "Accept": "application/json", "Idempotency-Key": key };
    var send = url
      ? window.fetch(url, { method: "POST", headers: headers, body: JSON.stringify(payload) })
        .then(function (res) {
          // Degraded fallback to listing-api ONLY on transport failure (this
          // endpoint never received/acknowledged the request, so no duplicate).
          // Any HTTP answer — including 500s — is surfaced to the user instead:
          // a retry keeps the same Idempotency-Key and is deduped server-side.
          return res.json().then(function (j) {
            if (!res.ok) throw new Error((j && j.error) || "location-report " + res.status);
            return j;
          });
        })
        .catch(function (err) {
          var isHttp = /^location-report /.test(err && err.message);
          if (isHttp) throw err;
          return fallback();
        })
      : fallback();
    send.then(function (res) {
      form.reset();
      delete form.dataset.estIdempotencyKey;
      var emailed = !!(res && (res.pdfSent || (!res.emailSkipped && res.id)));
      if (status) {
        status.textContent = emailed
          ? "Thanks! Your report is on its way to your inbox. An ES Realty representative will verify your inputs and contact you within one business day."
          : "Thanks — your report request is saved. An ES Realty representative will verify your inputs and contact you within one business day.";
        status.className = "sf-form-status success";
      }
    }).catch(function (err) {
      if (status) {
        status.textContent = err.message || "Could not send. Please try again.";
        status.className = "sf-form-status error";
      }
    }).finally(function () {
      if (button) { button.disabled = false; button.textContent = "Email me the report →"; }
    });
  }

  /* ---------------------------------------------------------- */
  /*  mount                                                      */
  /* ---------------------------------------------------------- */

  function cardSection() {
    return '<section class="sf-section sf-est" id="sf-estimator" data-est-root>' +
      '<div class="sf-est-card" data-est-card><p class="sf-est-empty">Loading the Batangas Value Guide…</p></div></section>';
  }

  function markup() {
    return '<section class="sf-section sf-est" id="sf-estimator" data-est-root>' +
      '<div class="sf-section-head sf-reveal"><div><p class="sf-eyebrow">BATANGAS VALUE GUIDE</p><h2>What is your <em>property worth?</em></h2></div>' +
      '<p>Official BIR zonal values for Batangas (RDO 58 &amp; 59) matched to your municipality, barangay, street and classification.</p></div>' +
      '<div class="sf-est-card" data-est-card></div></section>';
  }

  function mount() {
    if (typeof document === "undefined") return;
    if (!servicesBound) {
      servicesBound = true;
      document.addEventListener("click", function (event) {
        var link = event.target.closest("[data-est-services]");
        if (!link) return;
        event.preventDefault();
        var goHome = typeof location !== "undefined" && String(location.hash).indexOf("home") === -1;
        if (goHome) { location.hash = "#/home"; setTimeout(scrollToEstimator, 160); }
        else scrollToEstimator();
      });
    }
    if (!document.querySelector("[data-est-root]")) return;
    loadData().then(function () {
      est.screen = 1;
      renderLayout();
    }).catch(function () {
      var card = getCard();
      if (card) card.innerHTML = '<p class="sf-est-empty">Could not load reference data — refresh to try again.</p>';
    });
  }

  function scrollToEstimator() {
    var target = document.getElementById("sf-estimator");
    if (target) target.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  if (typeof document !== "undefined") {
    if (document.readyState === "loading") {
      document.addEventListener("DOMContentLoaded", function () { mount(); });
    } else {
      mount();
    }
  }

  var debug = null;
  if (typeof window !== "undefined" && typeof module !== "object") {
    debug = {
      state: function () { return est; },
      render: function (screen) { est.screen = screen || est.screen; renderLayout(); },
      estimate: function (opts) {
        return loadData().then(function (d) {
          var row = null;
          d.index.municipalities.forEach(function (m) { if (core.normKey(m.name) === core.normKey(opts.municipality)) row = m; });
          return loadMunicipality(row && row.slug).then(function (md) {
            return core.computeEstimate(d.config, d.index, md, opts);
          });
        });
      }
    };
  }

  return {
    markup: markup,
    cardSection: cardSection,
    mount: mount,
    core: core,
    loadData: loadData,
    loadMunicipality: loadMunicipality,
    _data: function () { return DATA; },
    _state: function () { return est; },
    debug: debug
  };
});