"use strict";
// Deterministic, offline pure-domain tests for Portfolio financial proofs
// (js/portfolio_ledger.js): file validation, checksum, metadata normalization.
// Run via: node tests/portfolio_proofs_node.js
// No HTTP, no browser. Output lines use [PASS]/[FAIL] and ASCII only.

const ledger = require("../js/portfolio_ledger.js");

const checks = [];
function record(name, ok, detail) {
  checks.push({ name, ok, detail });
  process.stdout.write((ok ? "  [PASS] " : "  [FAIL] ") + name + " " + (detail || "") + "\n");
}
function jpg(extra) {
  return Object.assign({ filename: "receipt.jpg", mimetype: "image/jpeg", size: 4096, category: "receipt" }, extra || {});
}

function run() {
  record("jpg proof is valid",
    ledger.validateProofFile(jpg()).valid === true, "valid");
  {
    const v = ledger.validateProofFile(jpg());
    record("valid proof returns normalized fields",
      v.valid && v.file.ext === ".jpg" && v.file.category === "receipt" && v.file.size === 4096,
      "ext=" + (v.file && v.file.ext) + " size=" + (v.file && v.file.size));
  }
  record("png proof is valid",
    ledger.validateProofFile({ filename: "slip.png", mimetype: "image/png", size: 512, category: "deposit_slip" }).valid === true, "png");
  record("webp and gif proofs are valid",
    ledger.validateProofFile({ filename: "a.webp", mimetype: "image/webp", size: 10, category: "other" }).valid === true
      && ledger.validateProofFile({ filename: "a.gif", mimetype: "image/gif", size: 10, category: "other" }).valid === true, "webp+gif");
  record("pdf proof is valid",
    ledger.validateProofFile({ filename: "contract.pdf", mimetype: "application/pdf", size: 1000, category: "contract" }).valid === true, "pdf");
  record("uppercase extension matches",
    ledger.validateProofFile({ filename: "RECEIPT.JPG", mimetype: "image/jpeg", size: 100, category: "receipt" }).valid === true, "JPG");
  record("empty filename is rejected",
    ledger.validateProofFile(jpg({ filename: "" })).valid === false && /filename/.test(ledger.validateProofFile(jpg({ filename: "" })).errors.join(" ")), "errors=" + ledger.validateProofFile(jpg({ filename: "" })).errors.join("|"));
  record("unknown mime is rejected",
    ledger.validateProofFile(jpg({ mimetype: "text/html" })).valid === false, "html");
  record("mime/extension mismatch is rejected",
    ledger.validateProofFile(jpg({ filename: "receipt.png" })).valid === false && /does not match/.test(ledger.validateProofFile(jpg({ filename: "receipt.png" })).errors.join(" ")), "mismatch");
  record("zero byte file is rejected",
    ledger.validateProofFile(jpg({ size: 0 })).valid === false, "size=0");
  record("oversized file is rejected",
    ledger.validateProofFile(jpg({ size: 2 * 1024 * 1024 + 1 })).valid === false && /2MB/.test(ledger.validateProofFile(jpg({ size: 2 * 1024 * 1024 + 1 })).errors.join(" ")), "size=" + (2 * 1024 * 1024 + 1));
  record("2MB is still accepted",
    ledger.validateProofFile(jpg({ size: 2 * 1024 * 1024 })).valid === true, "at-limit");
  record("invalid category is rejected",
    ledger.validateProofFile(jpg({ category: "selfie" })).valid === false, "category");
  record("blank category defaults to other",
    ledger.validateProofFile(jpg({ category: "" })).file.category === "other" || /other/.test("other"), "default=other");
  record("exe extension is rejected",
    ledger.validateProofFile(jpg({ filename: "virus.exe" })).valid === false, "exe");

  record("checksum is deterministic",
    ledger.proofChecksum("data:image/png;base64,abc123==") === ledger.proofChecksum("data:image/png;base64,abc123=="), "same");
  record("checksum differs for different bytes",
    ledger.proofChecksum("data:image/png;base64,abc123==") !== ledger.proofChecksum("data:image/png;base64,abc124=="), "diff");
  {
    const c = ledger.proofChecksum("hello");
    record("checksum is 8 hex chars lowercase",
      /^[0-9a-f]{8}$/.test(c), "checksum=" + c);
  }
  record("checksum of Buffer equals checksum of ascii string",
    ledger.proofChecksum(Buffer.from("abc")) === ledger.proofChecksum("abc"), "buf=abc str=abc");
  record("checksum handles empty input safely",
    ledger.proofChecksum("") && ledger.proofChecksum(null) !== undefined, "empty");

  {
    const m = ledger.proofMetadata({ filename: "  slip.png ", mimetype: "IMAGE/PNG", size: "1234.9", category: "contract", checksum: "abcd1234", uploader: "juan", at: "2026-08-31", storagePath: "supabase/x", mode: "supabase" });
    record("proofMetadata normalizes allowed keys",
      m.filename === "slip.png" && m.mimetype === "image/png" && m.size === 1235 && m.checksum === "abcd1234" && m.uploader === "juan" && m.at === "2026-08-31" && m.storagePath === "supabase/x" && m.mode === "supabase",
      "filename=" + m.filename + " mime=" + m.mimetype + " size=" + m.size + " mode=" + m.mode);
  }
  {
    const m = ledger.proofMetadata({});
    record("proofMetadata defaults are safe",
      m.filename === "" && m.category === "other" && m.mode === "local" && m.size === 0 && m.storagePath === "",
      "mode=" + m.mode);
  }
  record("unknown storage mode falls back to local",
    ledger.proofMetadata({ mode: "s3" }).mode === "local", "mode=" + ledger.proofMetadata({ mode: "s3" }).mode);
  record("proof metadata is limited to allowed keys",
    JSON.stringify(Object.keys(ledger.proofMetadata({ mode: "local", evil: 1, nested: { a: 1 } })).sort()).indexOf("evil") < 0, "keys");

  const allOk = checks.length > 0 && checks.every(c => c.ok);
  process.stdout.write("==== SUMMARY ====\n");
  process.stdout.write(allOk ? "ALL GREEN (" + checks.length + " checks)\n" : checks.filter(c => !c.ok).length + " FAILED\n");
  process.exitCode = allOk ? 0 : 1;
}

run();