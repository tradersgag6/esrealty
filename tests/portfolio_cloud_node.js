// Portfolio cloud mapping round-trip tests (pure, Node-only).
// Run with: node tests/portfolio_cloud_node.js
"use strict";
const PC = require("../js/portfolio_cloud.js");
const assert = require("assert");

let passed = 0;
const ok = (name, cond) => { assert.ok(cond, name); passed++; console.log("[PASS] " + name); };
const eq = (name, a, b) => { assert.deepStrictEqual(a, b, name); passed++; console.log("[PASS] " + name); };

// ---- uuid helpers ----------------------------------------------------
(function () {
  ok("newUuid is uuid format", PC.isUuid(PC.newUuid()));
  ok("newUuid unique", PC.newUuid() !== PC.newUuid());
  ok("isUuid true for v4", PC.isUuid("550e8400-e29b-41d4-a716-446655440000"));
  ok("isUuid false for local id", !PC.isUuid("acc-12345"));
  ok("isUuid false for empty", !PC.isUuid(""));
  ok("isUuid false for undefined", !PC.isUuid(undefined));
  ok("isLocalId local", PC.isLocalId("pf-acc-1"));
  ok("isLocalId uuid false", !PC.isLocalId("550e8400-e29b-41d4-a716-446655440000"));

  const rec = { id: "acc-123", label: "x" };
  PC.ensureUuid(rec);
  ok("ensureUuid assigns uuid to local id", PC.isUuid(rec.id));
  const rec2 = { id: "550e8400-e29b-41d4-a716-446655440000", label: "x" };
  PC.ensureUuid(rec2);
  ok("ensureUuid keeps uuid", rec2.id === "550e8400-e29b-41d4-a716-446655440000");
})();

// ---- account round trip ----------------------------------------------
(function () {
  const acc = { id: "550e8400-e29b-41d4-a716-446655440000", label: "BPI Ops", bank_name: "BPI", account_type: "cash", opening_balance: 2500000, as_of: "2026-08-31", currency: "PHP", created_at: "2026-08-31T00:00:00.000Z" };
  const db = PC.accountToDb(acc);
  eq("accountToDb fields", db, {
    id: acc.id, label: "BPI Ops", bank_name: "BPI", account_type: "cash",
    opening_balance: 2500000, as_of: "2026-08-31", currency: "PHP"
  });
  const back = PC.accountFromDb(Object.assign({}, db, { created_at: acc.created_at }));
  eq("account round trip", back, Object.assign({}, acc));
  eq("account undefined opening → 0", PC.accountToDb({ label: "x" }).opening_balance, 0);
  eq("account empty bank → ''", PC.accountFromDb({ id: "x", label: "y" }).bank_name, "");
})();

// ---- cash entry round trip -------------------------------------------
(function () {
  const e = {
    id: "550e8400-e29b-41d4-a716-446655441111", accountId: "550e8400-e29b-41d4-a716-446655441122",
    entry_date: "2026-08-31", direction: "out", amount: 120000.5, purpose: "construction",
    subcategory: "", description: "Down payment BPI — vendor X", counterparty: "Vendor X",
    reference_no: "INV-001", linked_construction_id: "550e8400-e29b-41d4-a716-446655441133",
    linked_transaction_id: "550e8400-e29b-41d4-a716-446655441144", status: "posted",
    idempotencyKey: "pf-invoice-123", proofs: [{ id: "p1" }], created_at: "2026-08-31T00:00:00.000Z"
  };
  const db = PC.entryToDb(e);
  eq("entryToDb direction", db.direction, "out");
  eq("entryToDb account_id mapped", db.account_id, e.accountId);
  eq("entryToDb linked_construction mapped", db.linked_construction_id, e.linked_construction_id);
  eq("entryToDb idempotency_key", db.idempotency_key, "pf-invoice-123");
  eq("entryToDb proof_required true", db.proof_required, true);
  eq("entryToDb amount numeric", db.amount, 120000.5);
  eq("entryToDb reversal_of null", db.reversal_of, null);

  const back = PC.entryFromDb(Object.assign({}, db, {
    linked_presell_project_id: "", linked_presell_payment_id: "", linked_phase_id: "", counterparty: "Vendor X", category: "", created_at: e.created_at
  }));
  ok("entryFromDb maps accountId", back.accountId === e.accountId);
  ok("entryFromDb keeps amount", back.amount === 120000.5);
  ok("entryFromDb keeps purpose", back.purpose === "construction");
  ok("entryFromDb idempotencyKey", back.idempotencyKey === "pf-invoice-123");
  ok("entryFromDb proofs empty array", Array.isArray(back.proofs) && back.proofs.length === 0);

  eq("entry in direction", PC.entryToDb({ id: "x", direction: "in", amount: "10" }).direction, "in");
  eq("entry bad direction → in", PC.entryToDb({ id: "x", direction: "sideways", amount: 10 }).direction, "in");
  eq("entry amount string → number", PC.entryToDb({ id: "x", amount: "99.9" }).amount, 99.9);

  const rev = PC.entryFromDb({ id: "r", account_id: "a", reversal_of: "550e8400-e29b-41d4-a716-446655441111", amount: 1, direction: "out" });
  ok("entryFromDb reversalOf kept", rev.reversalOf === "550e8400-e29b-41d4-a716-446655441111");
  ok("entryFromDb amount coerced", rev.amount === 1);
})();

// ---- construction round trips ----------------------------------------
(function () {
  const p = {
    id: "550e8400-e29b-41d4-a716-446655442200", name: "Fairview 3", asset_id: "unit-v3",
    presell_project_id: "", presell_link: { scope: "project", value: "unit-v3" }, site: "QC",
    contractor: "BuildCo", status: "active", contract_value: 50000000, contingency: 2500000,
    retention_rate: 5, allocation: "equal", created_at: "2026-08-31T00:00:00.000Z"
  };
  const db = PC.projectToDb(p);
  ok("projectToDb jsonb presell_link", db.presell_link === JSON.stringify(p.presell_link));
  const back = PC.projectFromDb(Object.assign({}, db, { created_at: p.created_at }));
  ok("project round trip name", back.name === p.name);
  ok("project round trip presell_link", JSON.stringify(back.presell_link) === JSON.stringify(p.presell_link));
  ok("projectFromDb tolerates null presell_link", PC.projectFromDb({ id: "x", name: "n" }).presell_link === null);
  ok("projectFromDb parses object presell_link", PC.projectFromDb({ id: "x", presell_link: { scope: "a", value: "b" } }).presell_link.value === "b");

  const ph = { id: "550e8400-e29b-41d4-a716-446655442211", project_id: p.id, name: "Foundation", planned_budget: 10000000, approved_budget: 9000000, committed: 5500000, paid: 5000000, percent_complete: 55, responsible: "Eng. Cruz", allocation: "equal", created_at: "2026-08-31T00:00:00.000Z" };
  const phBack = PC.phaseFromDb(PC.phaseToDb(ph));
  ok("phase round trip name", phBack.name === "Foundation");
  ok("phase round trip planned_budget", phBack.planned_budget === 10000000);

  const v = { id: "550e8400-e29b-41d4-a716-446655442222", project_id: p.id, name: "Steelworks", contact: "0917-000-0000", tax_id: "123-456", created_at: "2026-08-31T00:00:00.000Z" };
  eq("vendor round trip", PC.vendorFromDb(PC.vendorToDb(v)), v);

  const inv = { id: "550e8400-e29b-41d4-a716-446655442233", project_id: p.id, phase_id: ph.id, vendor_id: v.id, invoice_no: "SW-2026-01", date: "2026-08-31", amount: 500000, status: "paid", ledger_entry_id: "550e8400-e29b-41d4-a716-446655442244", paid_at: "2026-09-01T00:00:00.000Z", created_at: "2026-08-31T00:00:00.000Z" };
  const invBack = PC.invoiceFromDb(PC.invoiceToDb(inv));
  ok("invoice round trip paid", invBack.status === "paid" && invBack.ledger_entry_id === inv.ledger_entry_id);
  ok("invoiceToDb null vendor_id", PC.invoiceToDb({ id: "x", invoice_no: "j", project_id: "y", vendor_id: "" }).vendor_id === null);

  const c = { id: "550e8400-e29b-41d4-a716-446655442255", project_id: p.id, amount: 250000, reason: "Steel price increase", approver: "Admin", date: "2026-09-01", created_at: "2026-09-01T00:00:00.000Z" };
  const cBack = PC.changeFromDb(PC.changeToDb(c));
  ok("change round trip amount", cBack.amount === 250000);
  ok("change round trip reason", cBack.reason === "Steel price increase");
})();

// ---- proof round trip -------------------------------------------------
(function () {
  const pr = { id: "550e8400-e29b-41d4-a716-446655443300", entryId: "e-1", filename: "receipt.pdf", mimetype: "application/pdf", size: 204800, checksum: "sha256:abc123", category: "receipt", mode: "local", storagePath: "local/e-1", uploadedBy: "admin@esrealty.ph", uploadedAt: "2026-08-31T00:00:00.000Z" };
  const db = PC.proofToDb(pr);
  eq("proofToDb byte_size mapped", db.byte_size, 204800);
  eq("proofToDb entry_id mapped", db.entry_id, "e-1");
  const back = PC.proofFromDb(Object.assign({}, db, { uploaded_at: pr.uploadedAt }));
  ok("proof round trip filename", back.filename === "receipt.pdf");
  ok("proof round trip size", back.size === 204800);
  ok("proof round trip entryId", back.entryId === "e-1");
  ok("proof round trip storagePath", back.storagePath === "local/e-1");
  ok("proofToDb prioritizes byte_size", PC.proofToDb({ byte_size: 1, size: 2 }).byte_size === 1);
})();

console.log("\nportfolio_cloud_node: " + passed + " checks passed");
process.exit(0);