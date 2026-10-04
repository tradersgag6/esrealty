"use strict";
/*
 * SEA ESTATES — Official BIR Batangas zonal-value importer.
 *
 * Parses the current Department Order workbooks for RDO 58 (West Batangas,
 * DO 035-2022) and RDO 59 (East Batangas, DO 034-2022), normalizes them into
 * versioned, deterministic JSON under ../../../data/bir-batangas/, and writes
 * a source-traceable manifest.
 *
 * The official workbooks mask some zonal values with the asterisk convention
 * (a value marked "**" means "same as the applicable entry above"). Those are
 * resolved against the preceding numeric entry for the same street + class;
 * any that cannot be resolved are kept out of the lookup and counted in the
 * manifest so we never fabricate a number.
 *
 * Usage:  node import.js
 *         node import.js --from-raw <dir>   (use pre-downloaded workbooks)
 *         node import.js --out <dir>        (override output dir)
 */
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const XLSX = require("xlsx");

const TOOL_DIR = __dirname;
const DEFAULT_RAW_DIR = path.join(TOOL_DIR, "raw");
const DEFAULT_OUT_DIR = path.join(TOOL_DIR, "..", "..", "data", "bir-batangas");

const SHEETS = [
  {
    id: "rdo58",
    rdo: "58",
    rdoName: "Batangas City, West Batangas",
    departmentOrder: "035-2022",
    revision: "4th",
    fileName: "RDO No. 58 - Batangas City, West Batangas.xlsx",
    sheetName: "Sheet 7 (DO 35-2022)",
    sourceDatasetId: 915,
    sourceTemplateId: 195,
    sourceUrl: "https://bir-cdn.bir.gov.ph/local/pdf/RDO%20No.%2058%20-%20Batangas%20City%20West%20Batangas_copy_copy_copy_copy.zip"
  },
  {
    id: "rdo59",
    rdo: "59",
    rdoName: "Lipa City, East Batangas",
    departmentOrder: "034-2022",
    revision: "5th",
    fileName: "RDO No. 59 - Lipa City, East Batangas.xls",
    sheetName: "Sheet 8 (34-22)",
    sourceDatasetId: 914,
    sourceTemplateId: 195,
    sourceUrl: "https://bir-cdn.bir.gov.ph/local/pdf/RDO%20No.%2059%20-%20Lipa%20City%20East%20Batangas_copy_copy_copy_copy_copy.zip"
  }
];

const REGION = "Region IV-A (CALABARZON)";
const PROVINCE = "Batangas";

/* ------------------------------------------------------------------ */
/* helpers                                                            */
/* ------------------------------------------------------------------ */

function clean(v) {
  if (v == null) return "";
  return String(v).replace(/\u00a0/g, " ").replace(/\s+/g, " ").trim();
}

function stripStarMarks(s) {
  // Footnote marker runs like "**", "****", leading/trailing
  return String(s || "").replace(/^\s*\*+\s*/, "").replace(/\s*\*+\s*$/, "").trim();
}

function normStreet(s) {
  return String(s || "").toLowerCase()
    .replace(/[.,'’":/\\()[\]]/g, " ")
    .replace(/\s+/g, " ")
    .replace(/\s+\*+|\*+\s+/g, " ")
    .trim();
}

function normName(s) {
  return String(s || "").toLowerCase()
    .replace(/[(),*'’]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function slugify(s) {
  return String(s || "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
}

function sha256(buf) {
  return "sha256:" + crypto.createHash("sha256").update(buf).digest("hex");
}

function serialToDate(v) {
  // Convert Excel serial / text into an ISO date if possible.
  if (typeof v === "number" && v > 20000 && v < 60000) {
    const d = XLSX.SSF.parse_date_code(v);
    if (d) return d.y + "-" + String(d.m).padStart(2, "0") + "-" + String(d.d).padStart(2, "0");
  }
  const s = clean(v);
  const m = /(\d{1,2})\/(\d{1,2})\/(\d{4})/.exec(s);
  if (m) return m[3] + "-" + String(+m[1]).padStart(2, "0") + "-" + String(+m[2]).padStart(2, "0");
  const m2 = /(\d{1,2})-([A-Za-z]+)-(\d{4})/.exec(s);
  if (m2) {
    const months = { jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6, jul: 7, aug: 8, sep: 9, oct: 10, nov: 11, dec: 12 };
    const mo = months[String(m2[2]).toLowerCase().slice(0, 3)];
    if (mo) return m2[3] + "-" + String(mo).padStart(2, "0") + "-" + String(+m2[1]).padStart(2, "0");
  }
  return "";
}

const CLASS_LEGEND = {
  RR: "Residential Regular", CR: "Commercial Regular", RC: "Residential Condominium",
  CC: "Commercial Condominium", CL: "Cemetery Lot", A: "Agricultural",
  GL: "Government Land", GP: "General Purposes", I: "Industrial",
  X: "Institutional", APD: "Area for Priority Development", PS: "Parking Slot",
  A1: "Riceland Irrigated", A2: "Riceland Unirrigated", A3: "Upland", A4: "Coco Land",
  A5: "Citrus Land", A6: "Fishpond", A7: "Swamp", A8: "Nipa Land", A9: "Cotton Land",
  A10: "Cogon", A11: "Abaca Land", A12: "Orchard", A13: "Pineapple Land", A14: "Banana Land",
  A15: "Pasture Land", A16: "Corn Land", A17: "Sugar Land", A18: "Tobacco Land",
  A19: "Cacao", A20: "Lanzones", A21: "Durian", A22: "Rambutan", A23: "Mango",
  A24: "Mangrove", A25: "Camote/Cassava", A26: "Bamboo Land", A27: "Peanut Land",
  A28: "Soy beans Land", A29: "Grape vineyard", A30: "Pepper Land", A31: "Mineral Land",
  A32: "Non Metallic mineral Land", A33: "Coal Deposit", A34: "African Oil Land",
  A35: "Rubber Land", A36: "Forest Land/Timber Land", A37: "Horticultural Land",
  A38: "Salt Beds", A39: "Seashore", A40: "Resort", A41: "Sandy/Stony",
  A42: "Prawn pond", A43: "Sorghum", A44: "Ipil-ipil", A45: "Kangkong",
  A46: "Zarate", A47: "Vegetable Land", A48: "Coffee", A49: "Mountainous/Hilly Areas",
  A50: "Other Agricultural Lands"
};

function parseArgs() {
  const out = { rawDir: DEFAULT_RAW_DIR, outDir: DEFAULT_OUT_DIR };
  const argv = process.argv.slice(2);
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === "--from-raw") out.rawDir = path.resolve(argv[++i]);
    else if (argv[i] === "--out") out.outDir = path.resolve(argv[++i]);
  }
  return out;
}

/* ------------------------------------------------------------------ */
/* sheet parser                                                       */
/* ------------------------------------------------------------------ */

function parseSheet(ds, wb) {
  const ws = wb.Sheets[ds.sheetName];
  if (!ws) throw new Error(ds.id + ": sheet not found: " + ds.sheetName);
  const rows = XLSX.utils.sheet_to_json(ws, { header: 1, raw: true, defval: null });
  const municipalities = {}; // canonical name -> { slug, name, rdo, versions }
  const warnings = [];
  const errors = [];
  let curMuni = null;
  let curBrgy = null;
  let lastStreet = "";      // display name of current street (continuation)
  let lastStreetKey = "";
  let headerSeen = false;
  let muniHeaderRow = null;   // first municipality header row index (for DO/effectivity)
  let dataRowCount = 0;
  let numericCount = 0;
  let maskedResolved = 0;
  let maskedUnresolved = 0;
  let invalidRows = [];

  // Masked ("**") cells mean "same as the applicable entry of the same
  // classification above (or within the same street block)". Because the
  // numeric values often appear in APART (later) rows/barangay blocks, we
  // buffer all data rows per municipality and resolve after the municipality
  // block is fully scanned.
  let pendingRows = []; // {i, barangay, street, streetKey, vicinity, cls, masked, value}
  let audit = {}; // muniName -> {added, mapped, other, unresolved, nobarangay, nonum, nocur}
  function ctr(muniName, id) {
    const k = (muniName || "?");
    if (!audit[k]) audit[k] = {};
    audit[k][id] = (audit[k][id] || 0) + 1;
  }

  function addRow(row) {
    dataRowCount++;
    pendingRows.push(row);
  }

  function resolveRows() {
    // Build municipality-wide numeric index per street+class.
    const numIndex = {}; // streetKey+"||"+cls -> numeric value (first wins)
    for (const p of pendingRows) {
      if (!p.masked && p.value != null && p.streetKey) {
        const k = p.streetKey + "||" + p.cls;
        if (!(k in numIndex)) numIndex[k] = p.value;
      }
    }
    let resolved = 0;
    let unresolved = 0;
    for (const p of pendingRows) {
      const wasMasked = p.masked;
      if (p.masked) {
        const k = p.streetKey + "||" + p.cls;
        const v = (k in numIndex) ? numIndex[k] : null;
        if (v != null && v > 0) { p.value = v; p.masked = false; resolved++; }
        else { unresolved++; ctr(curMuni.display, "resolve-unresolved"); continue; } // skip: no numeric entry anywhere in muni
      }
      // map into barangay structure
      const bk = mapBarangay(curMuni, p.barangay);
      if (!bk) { ctr(curMuni.display, "resolve-nobarangay"); warnings.push(ds.id + ":r" + p.i + " row in unknown barangay: " + (p.street || p.cls)); continue; }
      const isOtherStreet = /^ALL OTHER/.test(p.street);
      if (isOtherStreet) {
        ctr(curMuni.display, "resolve-other");
        p.cls = p.cls || "RR";
        if (!bk.other[p.cls] || p.value > bk.other[p.cls]) bk.other[p.cls] = p.value;
        curMuni.allOtherCount++;
        curMuni.rowCount++;
      } else {
        ctr(curMuni.display, "resolve-mapped");
        if (!bk.streets[p.streetKey]) bk.streets[p.streetKey] = { display: p.street, vicinity: "", classes: {} };
        const st = bk.streets[p.streetKey];
        if (!st.classes[p.cls]) {
          st.classes[p.cls] = {
            value: p.value,
            valueLabel: "BIR " + (curMuni.departmentOrder || (curMuni.display + " " + curMuni.revision)),
            segments: []
          };
        }
        const seg = { value: p.value };
        if (p.vicinity) seg.vicinity = p.vicinity;
        if (wasMasked) seg.maskedResolved = true;
        st.classes[p.cls].segments.push(seg);
        if (p.vicinity && !st.vicinity) st.vicinity = p.vicinity;
        curMuni.rowCount++;
      }
    }
    pendingRows = [];
    return { resolved, unresolved };
  }

  function mapBarangay(m, name) {
    const key = normName(name);
    if (!m.barangays[key]) {
      m.barangays[key] = { name: name, streets: {}, other: {}, classifications: [], rowCount: 0 };
    }
    return m.barangays[key];
  }

  function finalizeClassifications(m) {
    const all = new Set();
    for (const bk of Object.values(m.barangays)) {
      const cs = new Set(Object.keys(bk.other));
      for (const sk of Object.keys(bk.streets)) Object.keys(bk.streets[sk].classes).forEach((c) => cs.add(c));
      bk.classifications = [...cs].sort();
      cs.forEach((c) => all.add(c));
    }
    m.classifications = [...all].sort();
  }

  for (let i = 0; i < rows.length; i++) {
    const r = rows[i] || [];
    const c0 = clean(r[0]);
    const c1 = clean(r[1]);
    const c2 = clean(r[2]);
    const c4c = clean(r[4]);
    const c6 = r[6];

    // --- municipality header ---
    if (/CITY\s*\/\s*MUNICIPALITY|^\s*MUNICIPALITY/.test(c0)) {
      if (curMuni && pendingRows.length) {
        const r = resolveRows();
        maskedResolved += r.resolved;
        maskedUnresolved += r.unresolved;
      }
      let name = "";
      const m0 = /CITY\s*\/\s*MUNICIPALITY\s*:\s*(.+)|^\s*MUNICIPALITY\s*:\s*(.+)/i.exec(c0);
      if (c1 && /^:/.test(c1)) name = clean(c1.replace(/^:/, ""));
      else if (m0) name = clean((m0[1] || m0[2] || ""));
      else name = clean(c1);
      name = name.replace(/\(CONT\.?\)/i, "").replace(/\s*\*+\s*$/, "").trim();
      if (!name) { warnings.push(ds.id + ":r" + i + " municipality header without name"); continue; }
      const key = normName(name);
      if (!municipalities[key]) {
        municipalities[key] = {
          display: name, slug: slugify(name), rdo: ds.rdo,
          departmentOrder: ds.departmentOrder, revision: ds.revision, effectivityDate: "",
          barangays: {}, rowCount: 0, allOtherCount: 0
        };
      }
      curMuni = municipalities[key];
      if (muniHeaderRow == null) {
        muniHeaderRow = i;
        const doVal = clean(r[6]);
        if (/035-2022|034-2022|DO|DEPARTMENT/i.test(doVal)) curMuni._rawDo = doVal.replace(/^\s*0?/, "").toUpperCase();
        const eff = serialToDate(c6);
        if (eff) curMuni.effectivityDate = eff;
      }
      curBrgy = null;
      headerSeen = false;
      lastStreet = ""; lastStreetKey = "";
      continue;
    }

    // --- barangay header ---
    const isBrgyHeader = (/^BARANGAY\s*:/.test(c0) || (/^BARANGAY/.test(c0) && c1 && /^:/.test(c1)));
    if (isBrgyHeader) {
      if (!curMuni) { warnings.push(ds.id + ":r" + i + " barangay header before municipality"); continue; }
      let bName = "";
      if (c1 && /^:/.test(c1)) bName = clean(c1.replace(/^:/, ""));
      else {
        const m1 = /^BARANGAY\s*:\s*(.+)/i.exec(c0);
        if (m1) bName = clean(m1[1]);
      }
      const isCont = /\(CONT\.?\)/i.test(c0) || (c1 && /\(CONT\.?\)/i.test(c1));
      bName = bName.replace(/\(CONT\.?\)/i, "").replace(/\s*\*+\s*$/, "").trim();
      if (!bName) { warnings.push(ds.id + ":r" + i + " barangay header without name"); continue; }
      curBrgy = bName;
      // Continuation pages (BARANGAY : X (CONT.)) continue the previous page's
      // street blocks on the same sheet; keep the running street so rows printed
      // on the new page (e.g. ALL OTHER STREETS interior blocks) keep their key.
      if (!isCont) { lastStreet = ""; lastStreetKey = ""; }
      const eff = serialToDate(c6);
      // NOTE: rdo58/59 put effectivity in the last header string col sometimes as serial (rdo59 44752)
      if (eff && eff.length) {
        if (!curMuni.effectivityDate || (i === muniHeaderRow + 1 || i === muniHeaderRow + 2)) curMuni.effectivityDate = eff;
      }
      if (/ZV\/? ?SQ\.?\/?M|STREET NAME|SUB-DIVISION|CLASSIFI/.test(clean(c2)) || /^STREET NAME/.test(c0)) headerSeen = true;
      continue;
    }

    if (!curMuni || !curBrgy) { ctr(curMuni && curMuni.display, "nocur"); continue; }

    // --- header / legend / note rows ---
    if (/^STREET NAME/.test(c0)) { headerSeen = true; continue; }
    if (/ZV\/\s*SQ|REVISION|\(FINAL REVISION\)|EFFECTIVITY|PROVINCE/.test(c0 + " " + clean(r[3]) + " " + clean(r[5])) && /STREET NAME|ZV\/|REVISION|EFFECTIVITY/.test(c0 + " " + clean(r[3]) + " " + clean(r[5])) ) { continue; }
    if (/^NOTE/i.test(c0) || /^NOTES/i.test(c0)) { continue; }
    if (c0 && /^COMMISSION|^BY |^REPUBLIC|^DEPARTMENT|^MANILA|^TO :|^SUBJECT|^SECTION|^VIRTUE|^TAX DUE|^THE ZONAL|^THIS ORDER|^\(ORIGINAL|^RECOMMENDED|^CARLOS|^CAESAR|^SECRETARY|^COMMISSIONER OF|^DEFINITION|^CODE|^CLASSIFICATION LEGEND|^AGRICULTURAL|^VICINITY/.test(c0)) { continue; }
    if (c0 === "PROVINCE" || c1 === ": BATANGAS" || /^ALONG/.test(c0) && !r[2]) { continue; }
    if ((r[2] === "VICINITY") || (r[3] === "CLASSIFICATION")) { headerSeen = true; continue; }

    const isOnlyStars = /^[*\s]+$/.test(c0) && !c2 && !c4c && (c6 == null || c6 === "");
    if (isOnlyStars) continue;

    const streetRaw = c0;
    const street = streetRaw ? stripStarMarks(streetRaw) : "";
    const vicinity = c2 ? stripStarMarks(c2) : "";
    const clsRaw = c4c;
    const cls = clsRaw.replace(/\s+/g, " ").trim().toUpperCase();
    const isCls = /^[A-Za-z]{1,3}\d*$/.test(cls);

    // Data rows must carry a value or a classification or a street
    if (!street && !isCls && c6 == null) continue;

    if (street) { lastStreet = street; lastStreetKey = normStreet(street); }
    if (!isCls && !street && !vicinity) continue;

    const valueCell = c6;
    let value = null;
    let masked = false;
    if (typeof valueCell === "number") value = Math.round(valueCell);
    else if (typeof valueCell === "string" && /^\*+$/.test(valueCell.trim())) masked = true;
    else { ctr(curMuni.display, "nonum"); continue; }
    if (value != null && value <= 0) { invalidRows.push(ds.id + ":r" + i + " non-positive value " + value); continue; }

    if (isCls || masked) {
      ctr(curMuni.display, "added");
      numericCount += (value != null && !masked) ? 1 : 0;
      addRow({
        i, barangay: curBrgy, street: lastStreet, streetKey: lastStreetKey,
        vicinity, cls, masked, value
      });
    }
  }

  // resolve trailing municipality
  if (curMuni && pendingRows.length) {
    const r = resolveRows();
    maskedResolved += r.resolved;
    maskedUnresolved += r.unresolved;
  }

  // post-process municipalities: finalize counts/classifications, spot-check
  const muniList = Object.keys(municipalities).map((k) => municipalities[k]);
  muniList.forEach((m) => {
    m.region = REGION;
    m.province = PROVINCE;
    finalizeClassifications(m);
  });

  return { municipalities: muniList, dataRowCount, numericCount, maskedResolved, maskedUnresolved, invalidRows, warnings, muniHeaderRow, audit };
}

/* ------------------------------------------------------------------ */
/* main                                                               */
/* ------------------------------------------------------------------ */

function main() {
  const args = parseArgs();
  if (!fs.existsSync(args.rawDir)) {
    console.error("Raw directory missing: " + args.rawDir + "\nRun: node download.js first.");
    process.exit(1);
  }
  fs.mkdirSync(args.outDir, { recursive: true });
  const muniDir = path.join(args.outDir, "municipalities");
  fs.mkdirSync(muniDir, { recursive: true });

  const manifest = {
    version: 1,
    region: REGION,
    province: PROVINCE,
    generatedAt: new Date().toISOString(),
    importer: { name: "tools/bir-import", version: "1.0.0", dep: "xlsx + adm-zip" },
    datasets: [],
    lookup: {},
    note: "Official BIR zonal-value datasets for Batangas (RDO 58 West Batangas, DO 035-2022 / RDO 59 East Batangas, DO 034-2022). Imported from the official BIR sources listed below. Values are current until superseded by a newer Department Order.",
    warnings: [],
    errors: []
  };

  let allMunis = [];

  for (const ds of SHEETS) {
    const wbFile = path.join(args.rawDir, ds.id + ".workbook");
    if (!fs.existsSync(wbFile)) throw new Error("Missing workbook: " + wbFile);
    const buffer = fs.readFileSync(wbFile);
    const wb = XLSX.read(buffer, { type: "buffer", cellDates: false, cellFormula: true });
    console.log("[parse] " + ds.id + " " + ds.sheetName + " (" + buffer.length + " bytes)");
    const res = parseSheet(ds, wb, buffer);

    const muniBySlug = {};
    for (const m of res.municipalities) muniBySlug[m.slug] = m;
    allMunis = allMunis.concat(res.municipalities);

    // sort deterministically
    res.municipalities.sort((a, b) => a.display.localeCompare(b.display));

    // write per-municipality files
    for (const m of res.municipalities) {
      const brgys = Object.values(m.barangays).sort((a, b) => a.name.localeCompare(b.name));
      const streetsAll = [];
      for (const bk of brgys) {
        for (const sk of Object.keys(bk.streets)) {
          const s = bk.streets[sk];
          const classes = Object.keys(s.classes).reduce((acc, c) => {
            acc[c] = s.classes[c];
            return acc;
          }, {});
          streetsAll.push({ name: s.display, vicinity: s.vicinity || "" });
          bk.streets[sk] = { name: s.display, vicinity: s.vicinity || "", classes };
        }
        bk.classifications = bk.classifications.slice().sort();
      }
      const file = {
        slug: m.slug,
        name: m.display,
        region: m.region,
        province: m.province,
        rdo: m.rdo,
        departmentOrder: m.departmentOrder,
        revision: m.revision,
        effectivityDate: m.effectivityDate,
        classifications: m.classifications,
        rowCount: m.rowCount,
        barangays: brgys.reduce((acc, b) => { acc[b.name] = { streets: b.streets, other: b.other, classifications: b.classifications }; return acc; }, {})
      };
      const outPath = path.join(muniDir, m.slug + ".json");
      fs.writeFileSync(outPath, JSON.stringify(file, null, 2) + "\n", "utf8");
      console.log("  [wrote] " + path.relative(args.outDir, outPath) + " (" + m.rowCount + " rows)");
    }

    const fileHash = sha256(buffer);
    let mappedT = 0, otherT = 0, unresT = 0, nobrT = 0;
    let reconcile = true;
    if (res.audit) {
      for (const k of Object.keys(res.audit)) {
        const a = res.audit[k];
        mappedT += a["resolve-mapped"] || 0;
        otherT += a["resolve-other"] || 0;
        unresT += a["resolve-unresolved"] || 0;
        nobrT += a["resolve-nobarangay"] || 0;
        const added = a.added || 0;
        const sum = (a["resolve-mapped"] || 0) + (a["resolve-other"] || 0) + (a["resolve-unresolved"] || 0) + (a["resolve-nobarangay"] || 0);
        if (sum !== added) reconcile = false;
      }
    }
    if (!reconcile) manifest.errors.push(ds.id + ": row accounting mismatch (added != mapped+other+unresolved+nobarangay)");
    const counts = {
      sheetRows: XLSX.utils.sheet_to_json(wb.Sheets[ds.sheetName], { header: 1 }).length,
      dataRows: res.dataRowCount,
      municipalities: res.municipalities.length,
      barangays: res.municipalities.reduce((a, m) => a + Object.keys(m.barangays).length, 0),
      streets: res.municipalities.reduce((a, m) => a + Object.values(m.barangays).reduce((x, b) => x + Object.keys(b.streets).length, 0), 0),
      maskedResolved: res.maskedResolved,
      maskedUnresolved: res.maskedUnresolved,
      invalidRows: res.invalidRows.length,
      reconcile,
      mappedRows: mappedT,
      otherRows: otherT,
      unresolvedRows: unresT
    };
    manifest.datasets.push({
      id: ds.id,
      rdo: ds.rdo,
      rdoName: ds.rdoName,
      departmentOrder: ds.departmentOrder,
      revision: ds.revision,
      effectivityDate: res.municipalities[0] ? res.municipalities[0].effectivityDate : "",
      effectiveTo: "Present",
      sourceDatasetId: ds.sourceDatasetId,
      sourceTemplateId: ds.sourceTemplateId,
      sourceName: ds.fileName,
      sourceSheet: ds.sheetName,
      sourceUrl: ds.sourceUrl,
      sourceFileHash: fileHash,
      sheetRows: counts.sheetRows,
      rowCounts: counts
    });
    manifest.warnings = manifest.warnings.concat(res.warnings.slice(0, 50));
    manifest.errors = manifest.errors.concat(res.invalidRows.slice(0, 50));
    if (res.maskedUnresolved > 0) {
      manifest.warnings.push(ds.id + ": " + res.maskedUnresolved + " rows carried an unresolvable masked value and were excluded from lookup (" + res.maskedResolved + " resolved as 'same as above').");
    }
  }

  // ---- locations index ----
  const slugSet = new Set();
  allMunis = allMunis.filter((m) => { if (slugSet.has(m.slug)) return false; slugSet.add(m.slug); return true; });
  allMunis.sort((a, b) => a.display.localeCompare(b.display));
  const classifications = {};
  for (const m of allMunis) for (const c of m.classifications) classifications[c] = CLASS_LEGEND[c] || c;
  const locations = {
    region: REGION,
    province: PROVINCE,
    classifications,
    municipalities: allMunis.map((m) => ({
      slug: m.slug,
      name: m.display,
      rdo: m.rdo,
      departmentOrder: m.departmentOrder,
      effectivityDate: m.effectivityDate,
      barangayCount: Object.keys(m.barangays).length,
      streetCount: Object.values(m.barangays).reduce((a, b) => a + Object.keys(b.streets).length, 0)
    }))
  };
  fs.writeFileSync(path.join(args.outDir, "locations.json"), JSON.stringify(locations, null, 2) + "\n", "utf8");

  manifest.lookup = {
    municipalityCount: allMunis.length,
    barangayCount: allMunis.reduce((a, m) => a + Object.keys(m.barangays).length, 0),
    streetCount: allMunis.reduce((a, m) => a + Object.values(m.barangays).reduce((x, b) => x + Object.keys(b.streets).length, 0), 0),
    classificationCount: Object.keys(classifications).length
  };

  fs.writeFileSync(path.join(args.outDir, "manifest.json"), JSON.stringify(manifest, null, 2) + "\n", "utf8");
  console.log("\nManifest: " + manifest.lookup.municipalityCount + " municipalities, " + manifest.lookup.barangayCount + " barangays, " + manifest.lookup.streetCount + " streets, " + manifest.lookup.classificationCount + " classification codes.");
  console.log("Output: " + args.outDir);
  if (manifest.errors.length) {
    console.error("IMPORT FAILED — " + manifest.errors.length + " invalid record(s). No silent data loss; see errors in manifest.");
    process.exit(1);
  }
  console.log("DONE");
}

try {
  main();
} catch (e) {
  console.error("FAILED: " + (e.stack || e.message));
  process.exit(1);
}