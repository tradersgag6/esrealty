"use strict";
/* Adversarial layout: render with the LONGEST strings the dataset can produce,
   and the largest possible numbers, then check for collisions, overflow past
   panels, and anything drawn outside the printable area.
   The normal suite renders one mid-length property, so it cannot catch a
   municipality name or street name that is too long for its column. */
const fs = require("fs"), path = require("path"), zlib = require("zlib");
const ROOT = process.cwd();
global.fetch = (u) => {
  const p = path.join(ROOT, String(u).split("?")[0]);
  return Promise.resolve({ ok: fs.existsSync(p), json: () => Promise.resolve(JSON.parse(fs.readFileSync(p, "utf8"))) });
};
global.Blob = class { constructor(p, o) { this.parts = p; this.type = (o || {}).type; } };
const PDFLib = require(path.join(ROOT, "vendor/pdf-lib/pdf-lib.min.js"));
const EST = require(path.join(ROOT, "js/estimator.js"));
const TAX = require(path.join(ROOT, "js/value_guide_tax.js"));
const VG = require(path.join(ROOT, "js/value_guide_pdf.js"));

let fails = 0;
const chk = (n, ok, d) => { console.log("  [" + (ok ? "PASS" : "FAIL") + "] " + n + (d ? " -- " + d : "")); if (!ok) fails++; };

function pagesOf(bytes) {
  const b = Buffer.from(bytes);
  const pages = []; let i = 0;
  while (true) {
    const s = b.indexOf("stream", i, "latin1");
    if (s < 0) break;
    let p = s + 6; if (b[p] === 13) p++; if (b[p] === 10) p++;
    const e = b.indexOf("endstream", p, "latin1");
    if (e < 0) break;
    let sl = b.slice(p, e);
    try { sl = zlib.inflateSync(sl); } catch (x) {}
    const body = sl.toString("latin1");
    const ops = [], rects = [];
    const flat = /\/([A-Za-z0-9+#._-]+)\s+([\d.]+)\s+Tf|1\s+0\s+0\s+1\s+([\d.]+)\s+([\d.]+)\s+Tm|<([0-9A-Fa-f\s]+)>\s*Tj/g;
    let cur = { font: "", size: 0 }, x = 0, y = 0, m;
    while ((m = flat.exec(body)) !== null) {
      if (m[1]) cur = { font: m[1], size: parseFloat(m[2]) };
      else if (m[3] != null) { x = parseFloat(m[3]); y = parseFloat(m[4]); }
      else if (m[5] != null) {
        const h = m[5].replace(/\s+/g, "");
        let t = ""; for (let k = 0; k + 1 < h.length; k += 2) t += String.fromCharCode(parseInt(h.substr(k, 2), 16));
        ops.push({ x: x, y: y, size: cur.size, font: cur.font, text: t });
      }
    }

    /* pdf-lib's drawRectangle does NOT use the `re` operator. It emits
       "1 0 0 1 tx ty cm" followed by a path "0 0 m / 0 h l / w h l / w 0 l /
       h f". Matching `re` therefore finds nothing, which is how an earlier
       version of this check passed while testing an empty list. */
    const draw = /1\s+0\s+0\s+1\s+(-?[\d.]+)\s+(-?[\d.]+)\s+cm|(-?[\d.]+)\s+(-?[\d.]+)\s+([ml])\b|\b(h|f)\b/g;
    let tx = 0, ty = 0, pts = [], d;
    while ((d = draw.exec(body)) !== null) {
      /* pdf-lib emits THREE cm operators per rectangle, the first carrying the
         translation and two identity matrices after it. Accumulating rather
         than overwriting is what keeps the origin: overwriting collapsed every
         rect to x=0,y=0 and made the spill check compare against the page. */
      if (d[1] !== undefined) { tx += parseFloat(d[1]); ty += parseFloat(d[2]); }
      else if (d[5] === "m" || d[5] === "l") { pts.push([parseFloat(d[3]), parseFloat(d[4])]); }
      else if (d[6] === "h") {
        if (pts.length >= 3) {
          const xs = pts.map(q2 => q2[0]), ys = pts.map(q2 => q2[1]);
          const x0 = Math.min.apply(null, xs), y0 = Math.min.apply(null, ys);
          rects.push({ x: tx + x0, y: ty + y0, w: Math.max.apply(null, xs) - x0, h: Math.max.apply(null, ys) - y0 });
        }
        pts = []; tx = 0; ty = 0;
      }
    }

    if (ops.length) pages.push({ ops: ops, rects: rects });
    i = e + 9;
  }
  return pages;
}

const ASC = 0.78, DESC = 0.24;

async function audit(label, r, meta) {
  const blob = await VG.toBlob(PDFLib, r, meta);
  const pages = pagesOf(blob.parts[0]);
  const helv = await PDFLib.PDFDocument.create().then(d => d.embedFont("Helvetica"));
  const helvB = await PDFLib.PDFDocument.create().then(d => d.embedFont("Helvetica-Bold"));
  const out = { label: label, pages: pages.length, collisions: [], spills: [], offPage: 0, minY: Infinity, maxX: -Infinity, rects: 0 };

  for (let pi = 0; pi < pages.length; pi++) {
    const boxes = pages[pi].ops.map(o => {
      const f = /Bold/.test(o.font) ? helvB : helv;
      const w = f.widthOfTextAtSize(o.text, o.size);
      out.minY = Math.min(out.minY, o.y);
      out.maxX = Math.max(out.maxX, o.x + w);
      if (o.y - o.size * DESC < 8 || o.y + o.size * ASC > 841.89 || o.x < 8 || o.x + w > 595.28 - 8) out.offPage++;
      return { x0: o.x, x1: o.x + w, y0: o.y - o.size * DESC, y1: o.y + o.size * ASC, text: o.text };
    });
    for (let a = 0; a < boxes.length; a++) {
      for (let b = a + 1; b < boxes.length; b++) {
        const vx = Math.min(boxes[a].x1, boxes[b].x1) - Math.max(boxes[a].x0, boxes[b].x0);
        const vy = Math.min(boxes[a].y1, boxes[b].y1) - Math.max(boxes[a].y0, boxes[b].y0);
        if (vx > 0.5 && vy > 0.35) {
          out.collisions.push({ p: pi + 1, a: boxes[a].text.slice(0, 26), b: boxes[b].text.slice(0, 26), vy: vy, vx: vx });
        }
      }
    }

    /* Text spilling OUT of a panel or tile. A run can overflow its own box
       without touching another run, so the collision check alone cannot see
       it: the text lands in the gutter between tiles and reads as broken. */
    /* Text spilling OUT of a container. Restricted to genuine containers
       (tiles, figure panels, callout boxes, the cover band) and to the body
       area: the footer legitimately overlaps table row shading, and flagging
       that would make the check cry wolf. */
    for (const rc of pages[pi].rects) {
      if (rc.w < 140 || rc.h < 34) continue;
      for (const bx of boxes) {
        if (bx.y0 < 44 || bx.y1 > 800) continue;
        const startsInside = bx.x0 >= rc.x + 2 && bx.x0 <= rc.x + rc.w;
        const insideVertically = bx.y0 <= rc.y + rc.h && bx.y1 >= rc.y;
        if (!startsInside || !insideVertically) continue;
        if (bx.x1 > rc.x + rc.w + 0.5) {
          out.spills.push({
            p: pi + 1, text: bx.text.slice(0, 30),
            over: (bx.x1 - (rc.x + rc.w)).toFixed(2),
            detail: "text[" + bx.x0.toFixed(1) + ".." + bx.x1.toFixed(1) + "] y[" + bx.y0.toFixed(1) + ".." + bx.y1.toFixed(1)
              + "] vs rect x[" + rc.x.toFixed(1) + ".." + (rc.x + rc.w).toFixed(1) + "] y[" + rc.y.toFixed(1) + ".." + (rc.y + rc.h).toFixed(1) + "]"
          });
        }
      }
    }
  }
  out.rects = pages.reduce((a, p) => a + p.rects.length, 0);
  return out;
}

(async () => {
  await EST.loadData();

  /* --- find the property with the longest street name and the largest lot --- */
  const loc = JSON.parse(fs.readFileSync(path.join(ROOT, "data/bir-batangas/locations.json"), "utf8"));
  let worst = null;
  for (const m of loc.municipalities) {
    const j = JSON.parse(fs.readFileSync(path.join(ROOT, "data/bir-batangas/municipalities/" + m.slug + ".json"), "utf8"));
    for (const b of Object.keys(j.barangays || {})) {
      for (const s of Object.keys(j.barangays[b].streets || {})) {
        const cand = { muni: m.name, slug: m.slug, brgy: b, street: s, len: s.length + b.length + m.name.length };
        if (!worst || cand.len > worst.len) worst = cand;
      }
    }
  }
  console.log("  worst-case property: " + worst.muni + " / " + worst.brgy + " / " + worst.street.slice(0, 46));
  const cls = await EST.classificationsFor(worst.slug);
  const c0 = cls[0].code;
  const rBig = await EST.estimate({
    purpose: "Selling", type: "house_lot", municipality: worst.muni, barangay: worst.brgy,
    streetKey: worst.street, classification: c0,
    area: 100000, floorArea: 99999, ageBand: "31plus", floors: "3plus", construction: "rca_steel"
  });
  chk("worst-case estimate produced", rBig.available === true, rBig.available ? "" : "reason " + rBig.reason);
  if (!rBig.available) process.exit(1);

  const taxBig = await TAX.full(rBig);
  const metaLong = {
    preparedFor: "Sagittarius Party Holdings Corporation and Spouses Dela Cruz",
    preparedBy: "SEA ESTATES Batangas Property Valuation Desk",
    generatedOn: "2026-10-01", reference: rBig.reference,
    provenance: EST.provenance(), tax: taxBig, muniRow: EST.municipalityRow(worst.muni)
  };

  const long = await audit("longest names + 7-figure values", rBig, metaLong);
  const rectTotal = long.rects;
  console.log("  pages=" + long.pages + " rects captured=" + rectTotal + " minY=" + long.minY.toFixed(1) + " maxX=" + long.maxX.toFixed(1));
  chk("rectangles were actually parsed (the spill check is not vacuous)", rectTotal > 20, rectTotal + " rects");
  chk("no collisions with the longest names in the dataset", long.collisions.length === 0, long.collisions.length + " found");
  for (const c of long.collisions.slice(0, 8)) {
    console.log("      p" + c.p + " '" + c.a + "' x '" + c.b + "' vx=" + c.vx.toFixed(2) + " vy=" + c.vy.toFixed(2));
  }
  chk("nothing runs off the page with the longest names", long.offPage === 0, long.offPage + " offenders");
  chk("nothing runs past the right margin with a very long street name", long.maxX <= 595.28 - 46 + 1,
    "maxX=" + long.maxX.toFixed(1) + " (margin at " + (595.28 - 46).toFixed(1) + ")");
  chk("no text spills outside its panel or tile", long.spills.length === 0, long.spills.length + " spills");
  for (const s of long.spills.slice(0, 8)) console.log("      p" + s.p + " \u0027" + s.text + "\u0027 over by " + s.over + "pt  " + s.detail);
  chk("nothing drops into the footer", long.minY >= 12, "minY=" + long.minY.toFixed(1));

  /* A long section heading must not run under the header's municipality label. */
  chk("a very long prepared-for value does not collide", long.collisions.every(c => c.a.indexOf("Sagittarius") < 0 && c.b.indexOf("Sagittarius") < 0), "");

  /* --- widest single word: could a long unbreakable token overflow a column? --- */
  console.log("");
  console.log(fails === 0 ? "  ADVERSARIAL LAYOUT ALL GREEN" : "  " + fails + " FAILURES");
  process.exit(fails === 0 ? 0 : 1);
})().catch(e => { console.error("  CRASH " + e.stack); process.exit(1); });
