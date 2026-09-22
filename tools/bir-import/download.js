"use strict";
/*
 * ES Realty — Official BIR Batangas zonal-value dataset downloader.
 *
 * Downloads the two current (2022) Department Order workbooks for Batangas
 * from the official BIR CDN and stores them under ./raw/ for the importer.
 *
 * Usage:  node download.js
 *         node download.js --force   (re-download even if files exist)
 */
const fs = require("fs");
const path = require("path");
const http = require("http");
const https = require("https");

const RAW_DIR = path.join(__dirname, "raw");

const DATASETS = [
  {
    id: "rdo58",
    rdo: "58",
    departmentOrder: "035-2022",
    datasetId: 915,
    templateId: 195,
    fileName: "RDO No. 58 - Batangas City, West Batangas.xlsx",
    url: "https://bir-cdn.bir.gov.ph/local/pdf/RDO%20No.%2058%20-%20Batangas%20City%20West%20Batangas_copy_copy_copy_copy.zip"
  },
  {
    id: "rdo59",
    rdo: "59",
    departmentOrder: "034-2022",
    datasetId: 914,
    templateId: 195,
    fileName: "RDO No. 59 - Lipa City, East Batangas.xls",
    url: "https://bir-cdn.bir.gov.ph/local/pdf/RDO%20No.%2059%20-%20Lipa%20City%20East%20Batangas_copy_copy_copy_copy_copy.zip"
  }
];

function fetchUrl(url) {
  return new Promise((resolve, reject) => {
    const mod = /^https:/.test(url) ? https : http;
    const req = mod.get(url, { headers: { "User-Agent": "ESRealty-bir-import/1.0" } }, (res) => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        res.resume();
        return fetchUrl(res.headers.location).then(resolve, reject);
      }
      if (res.statusCode !== 200) {
        res.resume();
        return reject(new Error("HTTP " + res.statusCode + " for " + url));
      }
      const chunks = [];
      res.on("data", (c) => chunks.push(c));
      res.on("end", () => resolve(Buffer.concat(chunks)));
    });
    req.on("error", reject);
    req.setTimeout(60000, () => req.destroy(new Error("timeout fetching " + url)));
  });
}

async function main() {
  const force = process.argv.indexOf("--force") !== -1 || !fs.existsSync(RAW_DIR);
  fs.mkdirSync(RAW_DIR, { recursive: true });
  for (const ds of DATASETS) {
    const zipPath = path.join(RAW_DIR, ds.id + ".zip");
    const wbPath = path.join(RAW_DIR, ds.id + ".workbook");
    if (!force && fs.existsSync(wbPath) && fs.statSync(wbPath).size > 0) {
      console.log("[skip] " + ds.id + " workbook already present -> " + wbPath);
      continue;
    }
    console.log("[get] " + ds.id + " " + ds.url);
    const zip = await fetchUrl(ds.url);
    fs.writeFileSync(zipPath, zip);
    console.log("  zip bytes=" + zip.length);
    const AdmZip = require("adm-zip");
    const az = new AdmZip(zipPath);
    const entry = az.getEntries().find((e) => e.entryName === ds.fileName || e.entryName.endsWith(path.extname(ds.fileName)));
    if (!entry) throw new Error("workbook entry not found in zip for " + ds.id);
    fs.writeFileSync(wbPath, entry.getData());
    console.log("  workbook extracted -> " + wbPath + " (" + fs.statSync(wbPath).size + " bytes)");
  }
  console.log("DONE");
}

main().catch((e) => {
  console.error("FAILED: " + (e.stack || e.message));
  process.exit(1);
});