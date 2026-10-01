"use strict";
/* Static + behavioural guards for the internal Value Guide.
 *
 * Run: node tests/value_guide_internal_node.js
 *
 * These exist because the risky parts of this feature are not the layout, they
 * are the boundaries: which roles can open it, whether it writes anything,
 * whether it persists a draft, and whether it agrees with the public
 * estimator. Each of those has been a real defect in this codebase.
 */
const fs = require("fs");
const path = require("path");

const ROOT = path.join(__dirname, "..");
const L = rel => fs.readFileSync(path.join(ROOT, rel), "utf8");
const APP = L("js/app.js");
const EST = L("js/estimator.js");
const HTML = L("index.html");
const PDF = L("js/value_guide_pdf.js");
const CSS = L("css/styles.css");
const DOCS = L("docs/batangas-value-guide-sources.md");
const MANIFEST = JSON.parse(L("data/data-manifest.json"));
const BIRMANIFEST = JSON.parse(L("data/bir-batangas/manifest.json"));

let checked = 0, failures = 0;
function ok(cond, label, detail) {
  checked++;
  if (cond) { console.log("  [PASS] " + label + (detail ? "  " + detail : "")); return; }
  failures++;
  console.log("  [FAIL] " + label + (detail ? "  " + detail : ""));
}
function section(name) { console.log("\n== " + name + " =="); }

/* ---------- navigation + access ---------- */
section("navigation and access");
/* The item carries a nested icon span between the attribute and the label. */
ok(/data-view="value-guide"[\s\S]{0,120}?Value Guide</.test(HTML), "Analysis dropdown has a Value Guide item");
ok(/nav-dropdown-menu[^>]*data-dropdown-menu="analysis"/.test(HTML) &&
   HTML.indexOf('data-view="value-guide"') > HTML.indexOf('data-dropdown-menu="analysis"'),
  "Value Guide sits inside the Analysis dropdown");
ok(/"value-guide"\s*:\s*"appraisal\.view"/.test(APP),
  "value-guide reuses the appraisal.view capability");
/* The view key is quoted in the source, so the pattern must allow for that. */
ok(/["']value-guide["']\s*:\s*renderValueGuide/.test(APP), "render map routes value-guide");
ok(/"value-guide"\s*:\s*"Value Guide"/.test(APP), "title map has Value Guide");
ok(/state\.view === "value-guide"\) bindValueGuide\(\)/.test(APP), "bindPerView binds the view");

/* The capability must not be quietly widened. super-admin has "*", broker has
 * appraisal.view; agent/buyer/seller/owner/tenant must NOT gain it. */
const roles = /ROLE_CAPABILITIES = \{([\s\S]*?)\n  \};/m.exec(APP);
ok(!!roles, "ROLE_CAPABILITIES parsed");
if (roles) {
  const body = roles[1];
  const capOf = name => {
    const m = new RegExp(name + ":\\s*\\[([^\\]]*)\\]").exec(body);
    return m ? m[1] : "";
  };
  /* The super-admin key is quoted and the rest are bare identifiers, so the
     key pattern must accept both. */
  const capOfFixed = name => {
    const m = new RegExp("(?:[\"']" + name + "[\"']|\\b" + name + "\\b)\\s*:\\s*\\[([^\\]]*)\\]").exec(body);
    return m ? m[1] : "";
  };
  ok(/"\*"/.test(capOfFixed("super-admin")), "super-admin sees Value Guide (wildcard)");
  ok(/appraisal\.view/.test(capOfFixed("broker")), "broker sees Value Guide");
  ok(/appraisal\.view/.test(capOf("broker")), "broker sees Value Guide");
  ok(!/appraisal\.view/.test(capOf("agent")), "agent cannot see Value Guide");
  ok(!/appraisal\.view/.test(capOf("buyer")), "buyer cannot see Value Guide");
  ok(!/appraisal\.view/.test(capOf("seller")), "seller cannot see Value Guide");
  ok(!/appraisal\.view/.test(capOf("owner")), "owner cannot see Value Guide");
  ok(!/appraisal\.view/.test(capOf("tenant")), "tenant cannot see Value Guide");
}

/* ---------- no writes, no persistence ---------- */
section("no CRM, email or persistence side effects");
/* The public pipeline posts to location-report, which INSERTs a crm_leads row
 * and emails a PDF. An operator generating a guide must not do that. */
const vgBlock = /function renderValueGuide\(\)[\s\S]*?function renderMarketScan\(\)/.exec(APP);
ok(!!vgBlock, "the Value Guide implementation block was located");
if (vgBlock) {
  const code = vgBlock[0];
  ok(!/location-report/.test(code), "never calls the location-report endpoint");
  ok(!/crm_leads/.test(code), "never references crm_leads");
  ok(!/ESREALTY_API_BASE/.test(code), "never uses the API base URL");
  ok(!/\bfetch\s*\(/.test(code), "performs no fetch of any kind");
  ok(!/localStorage/.test(code), "does not touch localStorage directly");
  ok(!/\.contact\(/.test(code), "never calls the listings contact endpoint");
}
ok(/function stripValueGuideDraft\(st\)/.test(APP), "draft is stripped before persistence");
ok(/stripHeavyBlobs\(stripValueGuideDraft\(state\)\)/.test(APP),
  "save() strips the Value Guide draft");
ok(/delete merged\.vg/.test(APP), "a stale persisted draft is discarded on load");

/* ---------- estimator reuse: one source of truth ---------- */
section("reuses the public estimator");
ok(/function estimate\(opts\)/.test(EST), "estimator exposes an estimate() entry point");
ok(/core\.computeEstimate\(d\.config, d\.index, md, opts\)/.test(EST),
  "estimate() delegates to core.computeEstimate");
ok(/result\.integrity = core\.integrityCheck\(result\)/.test(EST),
  "estimate() attaches the integrity verdict");
ok(/vgEst\(\)\.estimate\(vgOpts\(\)\)/.test(APP), "the wizard calls estimate()");
ok(!/function computeEstimate.*\n(?:.|\n)*?vgStage4/.test(vgBlock ? vgBlock[0] : ""),
  "the wizard does not re-implement the formula");
ok(/cfgVersion[\s\S]*?function dataVersionOf/.test(EST),
  "version helpers are at module scope");
ok(/function cfgVersion\(c\)[\s\S]{0,400}?function computeEstimate/.test(EST),
  "cfgVersion is declared before computeEstimate uses it");

/* ---------- data shape the wizard depends on ---------- */
section("dataset accessors match the real data shape");
ok(/function streets\(municipalitySlug, barangay\)/.test(EST),
  "streets() takes a municipality AND a barangay");
ok(/found\.streets/.test(EST), "streets() reads barangays[b].streets (the real shape)");
ok(/found\.other/.test(EST), "streets() reports the all-other-streets rate");
ok(/function barangays\(municipalitySlug\)/.test(EST), "barangays() is async");
/* The unavailable object is built across several lines, so match the reason
 * string and the guard separately. */
ok(/reason:\s*"municipality-not-found"/.test(EST), "an unknown municipality is reported, not guessed");
ok(/if\s*\(!row\)\s*\{/.test(EST), "a missing municipality row short-circuits instead of estimating");

/* ---------- source provenance ---------- */
section("source provenance is per-RDO and correctly cited");
const byRdo = {};
BIRMANIFEST.datasets.forEach(d => { byRdo[d.rdo] = d; });
ok(byRdo["58"] && byRdo["59"], "importer manifest carries both RDOs");
const d58 = byRdo["58"], d59 = byRdo["59"];
ok(d58.departmentOrder === "035-2022" && d58.effectivityDate === "2022-07-23",
  "RDO 58 = DO 035-2022 effective 2022-07-23");
ok(d59.departmentOrder === "034-2022" && d59.effectivityDate === "2022-07-10",
  "RDO 59 = DO 034-2022 effective 2022-07-10");
const rec = id => MANIFEST.provenance.records.find(r => r.id === id);
ok(!!rec("bir-d035-2022") && rec("bir-d035-2022").coverage.indexOf("058") >= 0 &&
   rec("bir-d035-2022").coverage.indexOf("059") < 0,
  "DO 035-2022 is scoped to RDO 058 only");
ok(!!rec("bir-d034-2022") && rec("bir-d034-2022").coverage.indexOf("059") >= 0 &&
   rec("bir-d034-2022").effectiveDate === "2022-07-10",
  "DO 034-2022 covers RDO 059 effective 2022-07-10");
ok(MANIFEST.provenance.records.length === 3, "three source records (two DOs + RCN)");
ok(!/RA 12000/.test(JSON.stringify(MANIFEST)), "no stale RA 12000 citation in the manifest");
ok(!/RAVPRADA/.test(JSON.stringify(MANIFEST)), "no stale RAVPRADA acronym in the manifest");
ok(/RA 12001/.test(MANIFEST.provenance.records[0].currencyNote),
  "RA 12001 cited with its short title");
ok(/DO 034-2022/.test(DOCS), "the docs cite DO 034-2022");
ok(/RA 12001/.test(DOCS), "the docs cite RA 12001");
/* The docs deliberately name the old citation inside the correction note, so
   only the substantive references are checked. */
const docsBody = DOCS.replace(/Correcting an earlier error:[\s\S]*?(?=\n\n)/, "");
ok(!/RA 12000/.test(docsBody), "the docs no longer cite RA 12000 outside the correction note");
ok(/RA 12001.*Real Property Valuation and Assessment Reform Act/s.test(DOCS),
  "the docs spell out RA 12001's short title");

/* ---------- PDF renderer ---------- */
section("PDF renderer");
ok(/vendor\/pdf-lib\/pdf-lib\.min\.js/.test(HTML), "pdf-lib is vendored, not from a CDN");
ok(!/cdn\./.test(PDF), "the renderer does not reach a CDN");
ok(/function toBlob\(lib, r, meta\)/.test(PDF), "toBlob takes the lib as an argument");
ok(/ESREALTY_PDF_LIB/.test(HTML), "a pdf-lib namespace is defined");
ok(/ensure\s*:\s*function\s*\(\s*\)/.test(HTML), "a lazy loader is defined");
/* The loader must not be a blocking <script src> tag: 513 KB on every page
   load would be paid by every user of the public storefront to serve an
   internal tool. */
const pdfTag = /<script[^>]*src="vendor\/pdf-lib[^"]*"[^>]*>/.test(HTML);
ok(!pdfTag, "pdf-lib is NOT in a blocking script tag (lazy-loaded)");
ok(/document\.createElement\("script"\)/.test(HTML), "the loader injects the script on demand");
/* Strip comments before scanning for the peso sign: it is mentioned in a
 * comment explaining why it is NOT used, and a naive search finds that. */
const pdfCode = PDF.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
ok(!/₱/.test(pdfCode), "the peso sign is not passed to the standard PDF fonts");
ok(/PHP "/.test(pdfCode) || /"PHP "/.test(pdfCode), "peso amounts are written as PHP for the standard fonts");
ok(/not a certified appraisal|not a certified appraisal/i.test(PDF),
  "the PDF states it is not a certified appraisal");
ok(/planning guide|planning estimate/i.test(PDF), "the PDF labels the figure a planning guide");
ok(/context only/i.test(PDF), "the PDF marks comparables as context only");
ok(/What this report does not cover/.test(PDF), "the PDF has a limitations section");
ok(/dataVersion/.test(PDF) && /calculationVersion/.test(PDF),
  "the PDF prints data and calculation versions");
ok(/disclaimer/.test(PDF), "the PDF prints the disclaimer");
ok(/t\s*\+\s*"\[A-Za-z0-9\.\/_-]+\.pdf"/.test(PDF) || /\.pdf/.test(PDF), "a .pdf filename is produced");

/* ---------- wizard chrome ---------- */
section("wizard UI");
ok(/\.vg-steps/.test(CSS) && /\.vg-figure-primary/.test(CSS), "wizard styles are defined");
ok(/not interchangeable/.test(vgBlock ? vgBlock[0] : ""),
  "the summary tells the reader the two figures are not interchangeable");
ok(/data-vg-calc/.test(APP) && /data-vg-pdf/.test(APP), "calculate and download actions exist");
ok(/Nothing is saved to the CRM and no email is sent/.test(vgBlock ? vgBlock[0] : ""),
  "the UI states nothing is saved or sent");
ok(/integrity\.ok \? "" : " disabled"/.test(vgBlock ? vgBlock[0] : ""),
  "the PDF button is disabled when the integrity check fails");

console.log(failures ? "\n" + failures + "/" + checked + " FAILED" : "\nALL GREEN (" + checked + " checks)");
process.exit(failures ? 1 : 0);