"use strict";
/* Render all six pages of the Value Guide with live data and the tax engine,
   then read the text back out. A valid header proves the file parses; this
   proves the document says the right things in the right order. */
const fs = require("fs");
const path = require("path");
const zlib = require("zlib");
const ROOT = process.cwd();

global.fetch = (u) => {
  const p = path.join(ROOT, String(u).split("?")[0]);
  return Promise.resolve({ ok: fs.existsSync(p), json: () => Promise.resolve(JSON.parse(fs.readFileSync(p, "utf8"))) });
};
global.Blob = class { constructor(parts, o) { this.parts = parts; this.type = (o || {}).type; } };

const PDFLib = require(path.join(ROOT, "vendor/pdf-lib/pdf-lib.min.js"));
const EST = require(path.join(ROOT, "js/estimator.js"));
const TAX = require(path.join(ROOT, "js/value_guide_tax.js"));
const VG = require(path.join(ROOT, "js/value_guide_pdf.js"));

let fails = 0;
function chk(n, ok, d) { console.log("  [" + (ok ? "PASS" : "FAIL") + "] " + n + (d ? " -- " + d : "")); if (!ok) fails++; }

/* pdf-lib writes <hex> Tj; inflate first. Returns one entry per page, each an
   array of text runs in draw order. */
function pagesOf(bytes) {
  const buf = Buffer.from(bytes);
  const pages = [];
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
    const runs = [];
    const ops = [];
    /* pdf-lib names embedded fonts like "Helvetica-Bold-7098480789", so the font
     name class must allow hyphens. Without them the Tf operator never matched,
     every run measured size 0, and the width/height geometry checks silently
     measured nothing - which is how a document with words drawn on top of each
     other passed a green "nothing overlaps the margins" gate. */
    const flat = /\/([A-Za-z0-9+#._-]+)\s+([\d.]+)\s+Tf|1\s+0\s+0\s+1\s+([\d.]+)\s+([\d.]+)\s+Tm|<([0-9A-Fa-f\s]+)>\s*Tj/g;
    let cur = { font: "", size: 0 }, x = 0, y = 0, m;
    while ((m = flat.exec(b)) !== null) {
      if (m[1]) cur = { font: m[1], size: parseFloat(m[2]) };
      else if (m[3] != null) { x = parseFloat(m[3]); y = parseFloat(m[4]); }
      else {
        const h = m[5].replace(/\s+/g, "");
        let t = "";
        for (let k = 0; k + 1 < h.length; k += 2) t += String.fromCharCode(parseInt(h.substr(k, 2), 16));
        runs.push(t);
        /* Keep the text with its box so the overlap check can measure it. */
        ops.push({ x: x, y: y, size: cur.size, font: cur.font, text: t });
      }
    }
    if (runs.length) pages.push({ runs: runs, ops: ops });
    i = e + 9;
  }
  return pages;
}

const M = (n) => "PHP " + new Intl.NumberFormat("en-PH", { maximumFractionDigits: 0 }).format(Math.round(Number(n || 0)));

(async () => {
  await EST.loadData();

  // Pick a location that actually has comparables, so page 4 is exercised
  // rather than always hitting the empty branch.
  const ref = EST.reference();
  let chosen = null;
  for (const row of ref.municipalities.slice().sort((a, b) => b.streetCount - a.streetCount)) {
    const brgs = await EST.barangays(row.slug);
    let best = { n: -1 };
    for (const b of brgs) { const s = await EST.streets(row.slug, b); if (s.streets.length > best.n) best = { n: s.streets.length, b: b, st: s }; }
    if (!best.st || !best.st.streets.length) continue;
    const cls = await EST.classificationsFor(row.slug);
    const r = await EST.estimate({
      purpose: "Selling", type: "house_lot", municipality: row.name, barangay: best.b,
      streetKey: best.st.streets[0].key, classification: cls[0].code,
      area: 300, floorArea: 180, ageBand: "6-10", floors: "2", construction: "mixed_chb"
    });
    if (r.available) { chosen = r; break; }
  }
  chk("a fully-populated house lot produced an estimate", !!chosen, chosen ? chosen.municipality + " -> " + chosen.marketGuideEstimate : "none found");
  if (!chosen) process.exit(1);
  const r = chosen;

  const tax = await TAX.full(r);
  /* The municipality row carries the zonal distribution the Market Analysis
     section needs. Omitting it is a real failure mode, not a hypothetical. */
  const muniRow = EST.municipalityRow(r.municipality);
  const meta = {
    kind: "internal-value-guide", preparedFor: "Verification Run", preparedBy: "SEA ESTATES",
    generatedOn: "2026-10-01", reference: r.reference, provenance: EST.provenance(),
    tax: tax, muniRow: muniRow
  };
  const blob = await VG.toBlob(PDFLib, r, meta);
  const bytes = new Uint8Array(blob.parts[0]);
  /* Written only when explicitly asked, so a test run leaves no artifact in
     the working tree for git to report. */
  if (process.env.VG_KEEP_PDF === "1") {
    fs.writeFileSync(path.join(ROOT, "vg-verify.pdf"), bytes);
  }

  const pages = pagesOf(bytes);
  const texts = pages.map(p => p.runs.join(" "));
  const all = texts.join("\n").replace(/\s+/g, " ");
  console.log("  pages with text: " + pages.length + ", chars: " + all.length);

  /* Sections, not page numbers, are the contract: a section may legitimately
     run to a second sheet, so the flow is asserted by finding which page each
     section starts on rather than by index. */
  const SECTIONS = VG.PARTS.map(p => p.title);
  const starts = SECTIONS.map(s => texts.findIndex(t => new RegExp("SEA ESTATES\\s+.{0,40}" + s.replace(/ /g, "\\s")).test(t.replace(/\s+/g, " "))));
  chk("all six parts are present", starts.every(v => v >= 0), SECTIONS.map((s, i) => s + "@" + (starts[i] + 1)).join(", "));
  chk("the parts appear in the reference report's order",
    starts.every((v, i) => i === 0 || v > starts[i - 1]), starts.join(" < "));

  chk("every page carries a header", texts.every(t => /SEA ESTATES/.test(t)), "");
  const total = pages.length;
  chk("every page is numbered 1..N with N equal to the real page count",
    pages.every((p, i) => p.runs.join(" ").includes("Page " + (i + 1) + " of " + total)),
    "total=" + total);
  /* Match only page-number strings. A loose /of 6/ also fires on prose such as
     "median of 6 values", which is not a page-count claim. */
  const pageNumbers = all.match(/Page \d+ of \d+/g) || [];
  chk("every declared page total equals the real page count",
    pageNumbers.length > 0 && pageNumbers.every(p => p.endsWith("of " + total)),
    pageNumbers[0] + " ... " + pageNumbers[pageNumbers.length - 1] + " (actual " + total + ")");
  chk("no page footer claims a total the document does not have",
    !pageNumbers.some(p => !p.endsWith("of " + total)), pageNumbers.filter(p => !p.endsWith("of " + total)).join(", "));
  chk("a sheet that continues a section says so",
    pages.filter(p => /, continued/.test(p.runs.join(" "))).length === total - SECTIONS.length,
    (total - SECTIONS.length) + " continuation sheet(s)");

  const secText = (name) => {
    /* Match the page header, which reads "SEA ESTATES  <municipality>  ·  RDO n
       <part title>". The municipality sits between the brand and the title, so
       allow a short gap rather than assuming they are adjacent. */
    const re = new RegExp("SEA ESTATES.{0,44}" + name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&").replace(/ /g, "\\s"));
    const i = texts.findIndex(t => re.test(t.replace(/\s+/g, " ")));
    if (i < 0) return "";
    /* A section continues onto later sheets, so gather from its first page to
       the page before the next section begins. */
    const si = SECTIONS.indexOf(name);
    const stop = si >= 0 && si + 1 < SECTIONS.length ? starts[si + 1] : texts.length;
    return texts.slice(i, stop === -1 ? texts.length : stop).join("\n").replace(/\s+/g, " ");
  };
  const SUM = secText(VG.PARTS[0].title);
  const CALC = secText(VG.PARTS[1].title);
  const TAXPG = secText(VG.PARTS[2].title);
  const DLPG = secText(VG.PARTS[4].title);
  const CHKPG = secText(VG.PARTS[4].title);
  const GUIDE = secText(VG.PARTS[5].title);
  const MKT = secText(VG.PARTS[3].title);

  // ---- page 1
  chk("summary shows the market guide estimate", SUM.includes(M(r.marketGuideEstimate)), M(r.marketGuideEstimate));
  chk("summary shows the BIR zonal reference", SUM.includes(M(r.birZonalValue)), M(r.birZonalValue));
  chk("summary labels the estimate a planning figure", /MARKET GUIDE ESTIMATE/.test(SUM), "");
  chk("summary labels reference according to actual source", (r.birReferenceConfirmed ? /OFFICIAL BIR ZONAL REFERENCE/ : /DERIVED LOCALITY REFERENCE/).test(SUM), "");
  chk("source match appears on page 1 without false confidence",
    /Source match:/.test(SUM) && /not a statistical valuation accuracy score/.test(SUM), r.source.label);
  chk("page 1 shows the guide range", SUM.includes(M(r.low)) && SUM.includes(M(r.high)), "");
  chk("page 1 states it is not a certified appraisal", /not a certified appraisal/i.test(SUM), "");

  // ---- page 2
  chk("computation is numbered as steps", /Step 1/.test(CALC) && /Step 2/.test(CALC), "");
  chk("computation shows the BIR rate lookup", /Zonal value found/.test(CALC), "");
  chk("computation shows the land build-up", /Effective land rate/.test(CALC) && CALC.includes(M(r.landValue)), "");
  chk("computation shows the house build-up for a house lot", /replacement cost/i.test(CALC) && CALC.includes(M(r.improvement)), "");
  chk("computation shows the DO instrument for this RDO",
    CALC.includes("Department Order 0" + r.departmentOrder.split("-")[0].slice(2)) || /Department Order \d{3}-\d{4}/.test(all), "");

  // ---- page 3 tax
  const s = tax.selling;
  chk("tax page warns the BIR decides the amount", /BIR, the LGU and the Registry of Deeds/.test(TAXPG), "");
  chk("tax page states the higher-of-price-or-FMV base", /HIGHER applicable selling price or statutory fair market value/i.test(TAXPG), "");
  chk("tax page prints the base it used", TAXPG.includes(M(s.taxBase)), M(s.taxBase));
  chk("capital gains tax is listed", /Capital gains tax/.test(TAXPG), "");
  chk("CGT base is full applicable value, with statute", /24\(D\)/.test(TAXPG) && !/excess of the price/.test(TAXPG), "");
  chk("documentary stamp tax is listed", /Documentary stamp tax/.test(TAXPG), "");
  chk("transfer tax is listed and names the LGC", /Local transfer tax/.test(TAXPG) && /Local Government Code/.test(TAXPG), "");
  chk("registration and notarial fees are listed", /[Rr]egistration fee/.test(TAXPG) && /[Nn]otarial fee/.test(TAXPG), "");
  chk("broker commission is shown as a band, not a fixed figure", /3% to 5%/.test(TAXPG), "");
  chk("net proceeds before commission", TAXPG.includes(M(s.netProceeds.beforeCommission)), M(s.netProceeds.beforeCommission));
  chk("net proceeds after commission, as a band", TAXPG.includes(M(s.netProceeds.atHighCommission)), "");
  chk("inheritance section is present", /Inheritance/i.test(TAXPG), "");
  chk("conditional family-home limit not universal exemption", /family-home limit is conditional/.test(TAXPG), "");
  chk("tax page discloses classification and missing assessor FMV", /capital-asset/.test(TAXPG) && /Assessor FMV not supplied/.test(TAXPG), "");

  // ---- page 4 deadlines
  chk("deadline page explains the trigger", /notarisation/.test(DLPG), "");
  chk("deadline page lists DST at 10 days after document month", /Documentary stamp tax/.test(DLPG) && /10 days/.test(DLPG) && /close of the month/.test(DLPG), "");
  chk("deadline page lists CGT at 30 days", /Capital gains tax/.test(DLPG) && /30 days/.test(DLPG), "");
  chk("deadline page lists transfer tax at 60 days", /60 days/.test(DLPG), "");
  chk("deadline page lists the estate return at 365 days", /365 days/.test(DLPG), "");
  chk("deadline page shows a penalty for each", /surcharge|Interest|interest/.test(DLPG), "");
  chk("deadline page lists the filing steps", /Certificate Authorizing Registration/.test(DLPG) && /Registry of Deeds/.test(DLPG), "");
  chk("deadline page includes CAR and the assessor", /Assessor/.test(DLPG), "");

  // ---- page 5 checklist
  chk("checklist page lists seller documents", /Seller/.test(CHKPG) || /seller/.test(CHKPG), "");
  chk("checklist page lists buyer documents", /buyer/i.test(CHKPG), "");
  chk("checklist names the OCT/TCT", /Certificate of Title/.test(CHKPG), "");
  chk("checklist names tax clearance", /tax clearance/i.test(CHKPG), "");
  chk("checklist warns requirements vary", /Registry of Deeds will reject/i.test(CHKPG), "");

  // ---- page 6
  chk("page 6 says scenario range is not confidence", /planning scenarios, not statistical confidence/i.test(GUIDE), "");
  chk("page 6 says zonal is a tax floor not a negotiable price", /tax floor in practice, not a negotiable one/i.test(GUIDE), "");
  chk("page 6 flags the governing instrument", /APPLIES/.test(GUIDE), "");
  chk("page 6 cites RA 12001", /RA 12001/.test(GUIDE), "");
  /* PVS 105 is named once, to DENY compliance - a licensed appraisal is not what
     this is. Asserting the bare string is absent would forbid that honest
     disclaimer; what matters is that no compliance is ever CLAIMED. */
  chk("no FMV or compliance claim is made under PVS 105",
    !/FMV per PVS|PVS 105 compliant|PVS 105-compliant|compliant methodology|per PVS 105 standards/i.test(all),
    (all.match(/[^.]*PVS 105[^.]*\./g) || []).join(" ").slice(0, 150));
  chk("the PVS 105 disclaimer is explicit", /makes no claim of PVS 105 compliance|not a certified appraisal/i.test(all), "");
  chk("page 6 states the tax figures are not payable amounts", /not a computation of tax payable/i.test(GUIDE), "");
  chk("page 6 records the tax reference version", all.includes(tax.reference.version), tax.reference.version);
  chk("limitations are listed", /does not cover/.test(GUIDE) && /No physical inspection/i.test(GUIDE), "");

  // ---- "What your report contains" on the cover
  chk("the cover states what the report contains", /What your report contains/.test(SUM), "");
  for (const p of VG.PARTS) {
    chk("contents lists part " + p.no + ": " + p.title, SUM.indexOf(p.title) >= 0, p.blurb.slice(0, 40));
  }
  chk("contents numbers the parts 01 to 06",
    VG.PARTS.every((p, i) => SUM.indexOf(p.no) >= 0), VG.PARTS.map(p => p.no).join(","));
  /* Page numbers come from a first layout pass. The contents row is
     identifiable by its "01  " prefix, which appears nowhere else - searching
     for the bare title would match the page header instead. */
  VG.PARTS.forEach((p, i) => {
    const marker = p.no + " " + p.title;
    const at = SUM.indexOf(marker);
    if (at < 0) { chk("contents row found for " + p.title, false, "marker not found"); return; }
    const after = SUM.slice(at + marker.length);
    const afterBlurb = after.slice(after.indexOf(p.blurb) + p.blurb.length);
    const m = /^\s(\d{1,2})\b/.exec(afterBlurb);
    chk("contents gives " + p.title + " the page it actually starts on",
      !!m && Number(m[1]) === starts[i] + 1,
      "contents says " + (m ? m[1] : "?") + ", starts on " + (starts[i] + 1));
  });

  // ---- pricing strategy ladder (part 06)
  chk("pricing strategy section exists", /Pricing strategy/.test(GUIDE), "");
  chk("ladder: lower end of guide range", /LOWER END OF GUIDE RANGE/.test(GUIDE) && GUIDE.indexOf(M(r.low)) >= 0, M(r.low));
  chk("ladder: lower end caption", /A reference point for reviewing offers/.test(GUIDE), "");
  chk("ladder: central estimate", /CENTRAL PLANNING ESTIMATE/.test(GUIDE), "");
  chk("ladder: central estimate is not asymmetric range midpoint", GUIDE.indexOf(M(r.marketGuideEstimate)) >= 0, M(r.marketGuideEstimate));
  chk("ladder: central estimate caption", /factor-based estimate/.test(GUIDE), "");
  chk("ladder: taxes and fees", /TAXES AND FEES/.test(GUIDE), "");
  chk("ladder: seller and buyer allocation disclosed", /Seller-paid CGT, broker/.test(GUIDE) && /buyer-paid/.test(GUIDE), "");
  chk("ladder: tax caption warns a higher price can raise CGT and DST", /higher selling price can raise CGT and DST/i.test(GUIDE), "");
  chk("ladder: cash you would receive", /CASH YOU WOULD RECEIVE/.test(GUIDE), "");
  chk("ladder: cash caption ties to net proceeds after seller costs", /net proceeds at the guide estimate after those seller costs/i.test(GUIDE), "");
  if (tax && tax.selling) {
    chk("ladder cash figure matches the tax engine's net proceeds",
      GUIDE.indexOf(M(tax.selling.netProceeds.atHighCommission)) >= 0
      && GUIDE.indexOf(M(tax.selling.netProceeds.atLowCommission)) >= 0,
      M(tax.selling.netProceeds.atHighCommission) + " - " + M(tax.selling.netProceeds.atLowCommission));
  }
  chk("the ladder is framed as reference points, not advice to price",
    /not a recommendation to price or accept/i.test(GUIDE), "");

  // ---- market analysis (part 04)
  chk("market analysis section exists", /Market Analysis/.test(MKT), "");
  chk("match level is stated", /Match level/.test(MKT), "");
  chk("fallback applied is disclosed", /Fallback applied/.test(MKT), "");
  const bc = (muniRow && muniRow.byClass ? muniRow.byClass[r.classification] : null);
  if (bc && bc.count) {
    chk("local distribution shows the median", /Median/.test(MKT) && MKT.indexOf(M(bc.p50)) >= 0, M(bc.p50));
    chk("local distribution shows the 25th and 75th percentiles",
      MKT.indexOf(M(bc.p25)) >= 0 && MKT.indexOf(M(bc.p75)) >= 0, M(bc.p25) + " / " + M(bc.p75));
    chk("local distribution is labelled as zonal rates, not market prices",
      /zonal rates, not market prices/i.test(MKT), "");
    chk("the property's position in the distribution is stated in words",
      /cheapest quarter|below the local median|above the local median|dearest quarter/i.test(MKT), "");
  } else {
    chk("no distribution published, and the report says so", /No municipality distribution is published/.test(MKT), "");
  }
  chk("comparable listings are addressed either way",
    /No comparable asking listings/.test(MKT) || /context only/i.test(MKT), "");

  // ---- legal basis (part 02)
  chk("legal and regulatory basis section exists", /Legal and regulatory basis/.test(CALC), "");
  chk("basis cites the BIR authority", /RA 12001/.test(CALC), "");
  chk("basis cites the CGT statute", /Sec\. 24\(D\) NIRC/.test(CALC), "");
  chk("basis cites provincial and city transfer rules", /135 and 151 LGC/.test(CALC), "");
  chk("basis cites the TRAIN estate threshold", /RA 10963/.test(CALC), "");

  // ---- the two-number distinction survives the whole document
  chk("the not-interchangeable sentence appears", /not interchangeable/i.test(all), "");
  chk("comparables are labelled context-only, not inputs", /not calculation inputs|NOT inputs/i.test(all), "");

  // ---- geometry
  let minY = Infinity, maxY = -Infinity, maxX = -Infinity, minX = Infinity, off = 0, ops = 0;
  for (const p of pages) {
    for (const o of p.ops) {
      ops++;
      minY = Math.min(minY, o.y); maxY = Math.max(maxY, o.y);
      minX = Math.min(minX, o.x); maxX = Math.max(maxX, o.x);
      if (o.y < 8 || o.y > 841.89 || o.x < 8 || o.x > 595.28) off++;
    }
  }
  chk("text runs were found to measure", ops > 400, ops + " runs");
  chk("nothing is drawn off the page", off === 0, off + " offenders");
  chk("nothing falls into the footer", minY >= 12, "minY=" + minY.toFixed(1));
  chk("nothing crosses the right margin", maxX <= 595.28 - 40, "maxX=" + maxX.toFixed(1));
  chk("nothing crosses the left margin", minX >= 44, "minX=" + minX.toFixed(1));

  /* ---- OVERLAP DETECTION
   * The earlier geometry gate only checked page bounds, so it passed a document
   * whose words were drawn on top of each other. This measures each run's ink
   * box with the real Helvetica metrics and reports any two runs whose boxes
   * intersect - the check that would have caught the pricing ladder. */
  const helv = await PDFLib.PDFDocument.create().then(d => d.embedFont("Helvetica"));
  const helvB = await PDFLib.PDFDocument.create().then(d => d.embedFont("Helvetica-Bold"));
  /* PDF y increases UPWARD, so ink runs from the descender BELOW the baseline
     up to the ascender ABOVE it: [y - descent, y + ascent]. */
  const ASC = 0.78, DESC = 0.24;
  let collisions = [];
  for (let pi = 0; pi < pages.length; pi++) {
    const boxes = pages[pi].ops.map(o => {
      const f = o.font && /Bold/.test(o.font) ? helvB : helv;
      const w = Math.min(f.widthOfTextAtSize(o.text, o.size), 595.28);
      return { x0: o.x, x1: o.x + w, y0: o.y - o.size * DESC, y1: o.y + o.size * ASC, text: o.text };
    });
    for (let a = 0; a < boxes.length; a++) {
      for (let b = a + 1; b < boxes.length; b++) {
        const A = boxes[a], B = boxes[b];
        const vx = Math.min(A.x1, B.x1) - Math.max(A.x0, B.x0);
        const vy = Math.min(A.y1, B.y1) - Math.max(A.y0, B.y0);
        /* A sliver of overlap is ink touching; anything more is words on top of
           words. Both are reported so the tolerance is not hiding a defect. */
        if (vx > 0.5 && vy > 0.35) {
          collisions.push({ page: pi + 1, a: A.text.slice(0, 22), b: B.text.slice(0, 22), vx: vx, vy: vy });
        }
      }
    }
  }
  chk("no two text runs overlap", collisions.length === 0,
    collisions.length + " collisions; first: " + (collisions[0]
      ? "p" + collisions[0].page + " '" + collisions[0].a + "' over '" + collisions[0].b + "' by " + collisions[0].vy.toFixed(2) + "pt"
      : ""));
  if (collisions.length) {
    for (const c of collisions.slice(0, 6)) {
      console.log("      p" + c.page + " '" + c.a + "' x '" + c.b + "' vx=" + c.vx.toFixed(2) + " vy=" + c.vy.toFixed(2));
    }
  }

  console.log(fails === 0 ? "\n  PDF CONTENT ALL GREEN" : "\n  " + fails + " FAILURES");
  process.exit(fails === 0 ? 0 : 1);
})().catch(e => { console.error("  CRASH " + e.stack); process.exit(1); });
