"use strict";
/* The "APPLIES" flag must follow the subject RDO, not always pick the first
   record. Lipa City is RDO 59, so the governing instrument must flip to
   Department Order 034-2022 (eff. 2022-07-10). */
const fs = require("fs"), path = require("path"), zlib = require("zlib");
const ROOT = process.cwd();
global.fetch = (u) => {
  const p = path.join(ROOT, String(u).split("?")[0]);
  return Promise.resolve({ ok: fs.existsSync(p), json: () => Promise.resolve(JSON.parse(fs.readFileSync(p, "utf8"))) });
};
global.Blob = class { constructor(parts, o) { this.parts = parts; this.type = (o || {}).type; } };
const PDFLib = require(path.join(ROOT, "vendor/pdf-lib/pdf-lib.min.js"));
const EST = require(path.join(ROOT, "js/estimator.js"));
const VG = require(path.join(ROOT, "js/value_guide_pdf.js"));

function textOf(bytes) {
  const buf = Buffer.from(bytes);
  const out = [];
  let i = 0;
  while (true) {
    const s = buf.indexOf("stream", i, "latin1");
    if (s < 0) break;
    let p = s + 6;
    if (buf[p] === 13) p++;
    if (buf[p] === 10) p++;
    const e = buf.indexOf("endstream", p, "latin1");
    if (e < 0) break;
    let sl = buf.slice(p, e);
    try { sl = zlib.inflateSync(sl); } catch (x) {}
    const b = sl.toString("latin1");
    const re = /<([0-9A-Fa-f\s]+)>\s*Tj/g;
    let m;
    while ((m = re.exec(b)) !== null) {
      const h = m[1].replace(/\s+/g, "");
      let t = "";
      for (let k = 0; k + 1 < h.length; k += 2) t += String.fromCharCode(parseInt(h.substr(k, 2), 16));
      out.push(t);
    }
    i = e + 9;
  }
  return out;
}

/* The sources render as a table, so one logical row is several text runs (the
     instrument label can wrap, and each column is its own run). Segment the
     page by row boundary - a run that starts a new "APPLIES"/"also in force"
     row - rather than assuming one run per cell. */
function sourceRows(runs) {
  const rows = [];
  let cur = null;
  for (const run of runs) {
    const isStart = /^\s*(APPLIES|also in force)\b/.test(run);
    if (isStart) {
      cur = { flag: /^\s*APPLIES/.test(run) ? "APPLIES" : "also in force", text: "" };
      rows.push(cur);
    }
    if (cur) cur.text += " " + run;
  }
return rows.map(r => ({
    flag: r.flag,
    text: r.text.replace(/\s+/g, " "),
    instrument: (/Department Order (\d{3}-\d{4})/.exec(r.text) || [])[0] || "",
    revision: (/\((\w+)\)/.exec(r.text) || [])[1] || "",
    rdo: (/(RDO \d+)/.exec(r.text) || [])[0] || "",
    /* The Effective column holds a bare date, so match the date itself rather
       than the word "effective" that the old label/value layout included. */
    eff: (/(\d{4}-\d{2}-\d{2})/.exec(r.text) || [])[0] || ""
  }));
}

let fails = 0;
function chk(n, ok, d) { console.log("  [" + (ok ? "PASS" : "FAIL") + "] " + n + (d ? " -- " + d : "")); if (!ok) fails++; }

(async () => {
  await EST.loadData();
  for (const town of ["LIPA CITY", "BATANGAS CITY"]) {
    const row = EST.municipalityRow(town);
    if (!row) { console.log("  (skip " + town + ": not in reference)"); continue; }
    const brgs = await EST.barangays(row.slug);
    let best = { n: -1 };
    for (const b of brgs) { const s = await EST.streets(row.slug, b); if (s.streets.length > best.n) best = { n: s.streets.length, b: b, st: s }; }
    const cls = await EST.classificationsFor(row.slug);
    const A1 = cls.find(c => c.code === "A1") || cls[0];
    const r = await EST.estimate({
      purpose: "Selling", type: "house_lot", municipality: row.name, barangay: best.b,
      streetKey: best.st.streets[0].key, classification: A1.code, area: 300,
      floorArea: 180, age: 10, floors: 2, corner: true
    });
    const blob = await VG.toBlob(PDFLib, r, {
      preparedFor: "RDO " + r.rdo + " check", generatedOn: "2026-10-01",
      provenance: EST.provenance()
    });
    const runs = textOf(blob.parts[0]);
    const t = runs.join(" ").replace(/\s+/g, " ");
    const rows = sourceRows(runs);
    const is58 = String(r.rdo) === "58";
    const want = is58 ? "Department Order 035-2022" : "Department Order 034-2022";
    const other = is58 ? "Department Order 034-2022" : "Department Order 035-2022";
    const wantEff = is58 ? "2022-07-23" : "2022-07-10";
    const otherEff = is58 ? "2022-07-10" : "2022-07-23";

    /* The third source record is the RCN construction rate table, which is not
       a Department Order, so the DO checks apply to the two BIR records. */
    const dos = rows.filter(x => x.instrument);
    const rcn = rows.filter(x => !x.instrument);
    chk(town + ": both province instruments are listed", dos.length === 2,
      dos.map(x => x.flag + " " + x.instrument).join(" / "));
    chk(town + ": the RCN construction rate table is also listed", rcn.length >= 1,
      rcn.map(x => x.flag).join("/") || "absent");
    chk(town + ": exactly one DO is flagged APPLIES", dos.filter(x => x.flag === "APPLIES").length === 1, "");

    const gov = dos.find(x => x.flag === "APPLIES");
    const non = dos.find(x => x.flag === "also in force");
    chk(town + " (RDO " + r.rdo + "): governing instrument is " + want, gov && gov.instrument === want, gov ? gov.instrument : "none");
    chk(town + ": governing record is for RDO 0" + r.rdo, gov && gov.rdo === "RDO 0" + r.rdo, gov ? gov.rdo : "none");
    chk(town + ": governing effective date is " + wantEff, gov && gov.eff === wantEff, "");
    chk(town + ": governing revision is " + (is58 ? "4th" : "5th"), gov && gov.revision === (is58 ? "4th" : "5th"), gov ? gov.revision : "");
    chk(town + ": non-governing instrument is " + other, non && non.instrument === other, non ? non.instrument : "none");
    chk(town + ": non-governing keeps its OWN effective date " + otherEff,
      non && non.eff === otherEff, non ? non.eff : "none");
    chk(town + ": the two records did not get crossed", gov && non && gov.text !== non.text, "");
    chk(town + ": RA 12001 cited", t.indexOf("RA 12001") >= 0, "");
    chk(town + ": RA 12000 absent", t.indexOf("RA 12000") < 0, "");
    chk(town + ": estimate figure present",
      t.indexOf("PHP " + new Intl.NumberFormat("en-PH", { maximumFractionDigits: 0 }).format(Math.round(r.marketGuideEstimate))) >= 0, "");
    console.log("");
  }
  console.log(fails === 0 ? "  RDO PROVENANCE ALL GREEN" : "  " + fails + " FAILURES");
  process.exit(fails === 0 ? 0 : 1);
})().catch(e => { console.error("  CRASH " + e.stack); process.exit(1); });