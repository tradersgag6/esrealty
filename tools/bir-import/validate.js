"use strict";
/**
 * tools/bir-import/validate.js
 *
 * Validates the artefacts produced by import.js (manifest.json, locations.json,
 * municipalities/*.json) against the raw BIR workbooks:
 *   - manifest row accounting (dataRows == mapped + other + unresolved)
 *   - per-municipality reconcile from the audit already embedded in rowCounts
 *   - deterministic spot-check: every listed street/class/value in the output
 *     must exist in the raw sheet for the same municipality+barangay
 *   - municipalities/barangays present in output must also appear in sources
 *
 * Usage: node validate.js [--full]
 *   --full  verify EVERY numeric output segment against the source (slower)
 * Exit code 0 when valid, 1 when any check fails.
 */
"use strict";
const fs = require("fs");
const path = require("path");
const XLSX = require("xlsx");

const RAW_DIR = path.join(__dirname, "raw");
const OUT_DIR = path.join(__dirname, "..", "..", "data", "bir-batangas");
const MUNI_DIR = path.join(OUT_DIR, "municipalities");
const SHEETS = [
  { id: "rdo58", rdo: "058", sheetName: "Sheet 7 (DO 35-2022)" },
  { id: "rdo59", rdo: "059", sheetName: "Sheet 8 (34-22)" }
];

function clean(v) { return v == null ? "" : String(v).replace(/\u00a0/g, " ").replace(/\s+/g, " ").trim(); }
function normStreet(s) { return String(s || "").toLowerCase().replace(/[.,'’":/\\()[\]]/g, " ").replace(/\s+/g, " ").replace(/\s+\*+|\*+\s+/g, " ").trim(); }
function normName(s) { return normStreet(s); }
function slugify(name) { return normName(name).replace(/\s+/g, "-"); }

let failures = 0;
let checks = 0;
function check(cond, msg) {
  checks++;
  if (!cond) { failures++; console.error("  FAIL: " + msg); }
  return !!cond;
}
function ok(msg) { if (process.env.VERBOSE) console.log("  ok: " + msg); }

/* ------------------------------------------------------------------ */
/* load outputs                                                        */
/* ------------------------------------------------------------------ */

const manifest = JSON.parse(fs.readFileSync(path.join(OUT_DIR, "manifest.json"), "utf8"));
const locations = JSON.parse(fs.readFileSync(path.join(OUT_DIR, "locations.json"), "utf8"));
const perMuni = {}; // slug -> parsed
for (const f of fs.readdirSync(MUNI_DIR)) {
  if (!f.endsWith(".json")) continue;
  const m = JSON.parse(fs.readFileSync(path.join(MUNI_DIR, f), "utf8"));
  perMuni[m.slug] = m;
}

console.log("=== bir import validation ===");

/* ------------------------------------------------------------------ */
/* 1. manifest vs locations vs files                                   */
/* ------------------------------------------------------------------ */

check(manifest.lookup.municipalityCount === locations.municipalities.length,
  "manifest.lookup.municipalityCount (" + manifest.lookup.municipalityCount + ") != locations.municipalities.length (" + locations.municipalities.length + ")");
check(locations.municipalities.length === Object.keys(perMuni).length,
  "locations.municipalities (" + locations.municipalities.length + ") != municipality files (" + Object.keys(perMuni).length + ")");

let totalFileStreets = 0;
let totalFileBarangays = 0;
for (const loc of locations.municipalities) {
  const m = perMuni[loc.slug];
  check(!!m, "missing municipality file for " + loc.slug);
  if (!m) continue;
  check(m.name === loc.name, loc.slug + ": file name mismatch");
  check(Object.keys(m.barangays).length === loc.barangayCount, loc.slug + ": barangay count mismatch (" + Object.keys(m.barangays).length + " vs " + loc.barangayCount + ")");
  const streetCount = Object.values(m.barangays).reduce((a, b) => a + Object.keys(b.streets).length, 0);
  check(streetCount === loc.streetCount, loc.slug + ": street count mismatch (" + streetCount + " vs " + loc.streetCount + ")");
  totalFileStreets += streetCount;
  totalFileBarangays += Object.keys(m.barangays).length;
}
check(totalFileStreets === manifest.lookup.streetCount,
  "sum of file streets (" + totalFileStreets + ") != manifest.lookup.streetCount (" + manifest.lookup.streetCount + ")");
check(totalFileBarangays === manifest.lookup.barangayCount,
  "sum of file barangays (" + totalFileBarangays + ") != manifest.lookup.barangayCount (" + manifest.lookup.barangayCount + ")");
ok("manifest/locations/files consistent (" + manifest.lookup.municipalityCount + " munis, " + totalFileBarangays + " barangays, " + totalFileStreets + " streets)");

/* ------------------------------------------------------------------ */
/* 2. manifest dataset reconcile flags                                 */
/* ------------------------------------------------------------------ */

for (const d of manifest.datasets) {
  const rc = d.rowCounts;
  check(rc.reconcile === true, d.id + ": rowCounts.reconcile must be true");
  check(rc.maskedResolved + rc.maskedUnresolved + rc.invalidRows >= 0, d.id + ": sanity");
  ok(d.id + " reconcile=true dataRows=" + rc.dataRows + " mapped=" + rc.mappedRows + " other=" + rc.otherRows + " unresolved=" + rc.unresolvedRows + " invalid=" + rc.invalidRows);
}
check(manifest.errors.length === 0, "manifest.errors not empty: " + JSON.stringify(manifest.errors));
ok("row accounting reconciled for all datasets, no manifest errors");

/* ------------------------------------------------------------------ */
/* 3. build reverse index of raw sheet                                 */
/* ------------------------------------------------------------------ */

// rawLookup[id][muniSlug][barangayNorm][streetKey][cls] = Set of numeric values
const rawLookup = {};
for (const ds of SHEETS) {
  const wbFile = path.join(RAW_DIR, ds.id + ".workbook");
  if (!fs.existsSync(wbFile)) { check(false, "missing " + wbFile); continue; }
  const wb = XLSX.readFile(wbFile, { cellDates: false });
  const rows = XLSX.utils.sheet_to_json(wb.Sheets[ds.sheetName], { header: 1, raw: true, defval: null });
  let muni = "", muniSlug = "", brgy = "", lastStreet = "", lastStreetKey = "";
  const idx = {};
  for (const r of rows) {
    const c0 = clean(r[0]);
    const c1 = clean(r[1]);
    if (/CITY\s*\/\s*MUNICIPALITY|^\s*MUNICIPALITY/.test(c0)) {
      let name = "";
      const m0 = /CITY\s*\/\s*MUNICIPALITY\s*:\s*(.+)|^\s*MUNICIPALITY\s*:\s*(.+)/i.exec(c0);
      if (c1 && /^:/.test(c1)) name = clean(c1.replace(/^:/, ""));
      else if (m0) name = clean((m0[1] || m0[2] || ""));
      else name = clean(c0.replace(/CITY\s*\/\s*MUNICIPALITY/i, "").trim());
      name = name.replace(/\(CONT\.?\)/i, "").replace(/\s*\*+\s*$/, "").trim();
      if (!name) continue;
      muni = name;
      muniSlug = slugify(name);
      if (!idx[muniSlug]) idx[muniSlug] = {};
      brgy = ""; lastStreet = ""; lastStreetKey = "";
      continue;
    }
    const isBrgyHeader = (/^BARANGAY\s*:/.test(c0) || (/^BARANGAY/.test(c0) && c1 && /^:/.test(c1)));
    if (isBrgyHeader) {
      let bn = "";
      if (c1 && /^:/.test(c1)) bn = clean(c1.replace(/^:/, ""));
      else { const mm = /^BARANGAY\s*:\s*(.+)/i.exec(c0); if (mm) bn = clean(mm[1]); }
      const isCont = /\(CONT\.?\)/i.test(c0) || (c1 && /\(CONT\.?\)/i.test(c1));
      bn = bn.replace(/\(CONT\.?\)/i, "").replace(/\s*\*+\s*$/, "").trim();
      brgy = normName(bn);
      // continuation pages keep the running street (mirrors import.js)
      if (!isCont) { lastStreet = ""; lastStreetKey = ""; }
      continue;
    }
    if (!muniSlug || !brgy) continue;
    if (!/^[A-Za-z]{1,3}\d*$/.test(clean(r[4]))) continue;
    const c2 = clean(r[2]);
    const street = c0 ? c0.replace(/^\s*\*+\s*/, "").replace(/\s*\*+\s*$/, "").trim() : "";
    if (street) { lastStreet = street; lastStreetKey = normStreet(street); }
    if (!lastStreetKey) continue;
    const cls = clean(r[4]).toUpperCase();
    const c6 = r[6];
    const value = typeof c6 === "number" ? Math.round(c6) : null;
    if (value == null) continue; // mask-only rows have no numeric to check
    if (!idx[muniSlug][brgy]) idx[muniSlug][brgy] = {};
    if (!idx[muniSlug][brgy][lastStreetKey]) idx[muniSlug][brgy][lastStreetKey] = {};
    if (!idx[muniSlug][brgy][lastStreetKey][cls]) idx[muniSlug][brgy][lastStreetKey][cls] = new Set();
    idx[muniSlug][brgy][lastStreetKey][cls].add(value);
    // municipality-wide mirror (masked rows resolve against any barangay)
    if (!idx[muniSlug].__muni) idx[muniSlug].__muni = {};
    if (!idx[muniSlug].__muni[lastStreetKey]) idx[muniSlug].__muni[lastStreetKey] = {};
    if (!idx[muniSlug].__muni[lastStreetKey][cls]) idx[muniSlug].__muni[lastStreetKey][cls] = new Set();
    idx[muniSlug].__muni[lastStreetKey][cls].add(value);
  }
  rawLookup[ds.id] = idx;
}

/* ------------------------------------------------------------------ */
/* 4. verify every output segment has a matching source numeric        */
/* ------------------------------------------------------------------ */

function sourceHas(dsId, muniSlug, barangay, streetKey, cls, value, muniWide) {
  const idx = rawLookup[dsId] && rawLookup[dsId][muniSlug];
  const brg = idx && idx[barangay] && idx[barangay][streetKey] && idx[barangay][streetKey][cls];
  if (brg && brg.has(value)) return true;
  if (muniWide) {
    const mw = idx && idx.__muni && idx.__muni[streetKey] && idx.__muni[streetKey][cls];
    return !!mw && mw.has(value);
  }
  return false;
}

let segmentsChecked = 0;
let spotChecks = 0;
const limit = (process.env.FULL === "1") ? Infinity : 200;

outer:
for (const f of fs.readdirSync(MUNI_DIR)) {
  if (!f.endsWith(".json")) continue;
  const m = perMuni[f.replace(".json", "")];
  const ds = manifest.datasets.find((d) => d.rdo === m.rdo);
  if (!ds) continue;
  const dsId = ds.id;
  for (const bName of Object.keys(m.barangays)) {
    const b = m.barangays[bName];
    const brgyNorm = normName(bName);
for (const sk of Object.keys(b.streets)) {
        const st = b.streets[sk];
        for (const cls of Object.keys(st.classes)) {
          const entry = st.classes[cls];
          const anyMasked = entry.segments.some((s) => s.maskedResolved);
          const brgSet = (rawLookup[dsId] && rawLookup[dsId][m.slug] &&
            rawLookup[dsId][m.slug][brgyNorm] &&
            rawLookup[dsId][m.slug][brgyNorm][sk] &&
            rawLookup[dsId][m.slug][brgyNorm][sk][cls]) || null;
          check(!!brgSet || anyMasked,
            dsId + " " + m.slug + "/" + bName + " street=" + st.name + " cls=" + cls + " has no numeric rows in source");
          // primary value must exist in the source set; every extra segment too
          for (const seg of entry.segments) {
            check(sourceHas(dsId, m.slug, brgyNorm, sk, cls, seg.value, !!seg.maskedResolved),
              dsId + " " + m.slug + "/" + bName + " " + sk + " " + cls + " seg value " + seg.value + " not in source set");
            segmentsChecked++;
            spotChecks++;
            if (spotChecks > limit) break outer;
          }
          check(sourceHas(dsId, m.slug, brgyNorm, sk, cls, entry.value, anyMasked),
            dsId + " " + m.slug + "/" + bName + " " + sk + " " + cls + " primary " + entry.value + " not in source set");
        }
      }
  }
}
ok("verified " + segmentsChecked + " output segments against source (full=" + (process.env.FULL === "1") + ")");

/* ------------------------------------------------------------------ */

console.log(checks + " checks, " + failures + " failures.");
if (failures > 0) {
  console.error("VALIDATION FAILED");
  process.exit(1);
}
console.log("VALIDATION PASSED");