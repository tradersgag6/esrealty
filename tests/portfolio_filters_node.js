"use strict";
// Deterministic, offline pure-domain tests for the shared ledger query model
// (js/portfolio_ledger.js queryLedger): one filter object drives rows, counts,
// and CSV export. Account/direction/status/search/date-range semantics are
// tested inclusively and combined, matching the DOM filter behavior exactly.
// Run via: node tests/portfolio_filters_node.js
// No HTTP, no browser. Output lines use [PASS]/[FAIL] and ASCII only.

const ledger = require("../js/portfolio_ledger.js");

const checks = [];
function record(name, ok, detail) {
  checks.push({ name, ok, detail });
  process.stdout.write((ok ? "  [PASS] " : "  [FAIL] ") + name + " " + (detail || "") + "\n");
}

function fixture() {
  return [
    { id: "E1", accountId: "A", direction: "in", amount: 100000, description: "Presell collection Unit 1206", counterparty: "Joy", reference_no: "OR-1", purpose: "", entry_date: "2026-08-01", status: "posted" },
    { id: "E2", accountId: "A", direction: "out", amount: 60000, description: "Bank charge", counterparty: "BPI", reference_no: "CH-2", purpose: "others", subcategory: "fee", entry_date: "2026-08-15", status: "posted" },
    { id: "E3", accountId: "B", direction: "out", amount: 20000, description: "Draft plan", counterparty: "", reference_no: "DR-3", purpose: "construction", entry_date: "2026-08-20", status: "draft" },
    { id: "E4", accountId: "A", direction: "in", amount: 140000, description: "Contribution", counterparty: "Ltd", reference_no: "OR-4", purpose: "", entry_date: "2026-07-10", status: "posted", reversalOf: "E1" },
    { id: "E5", accountId: "A", direction: "in", amount: 170000, description: "Refund", counterparty: "Bank", reference_no: "RF-5", purpose: "", entry_date: "2026-07-11", status: "voided" }
  ];
}

const ALL = fixture();

function run() {
  const FRESH = fixture();

  // Account
  {
    const r = ledger.queryLedger(FRESH, { accountId: "A" });
    record("account filter returns only that account",
      r.filtered === 4 && r.rows.every(x => x.accountId === "A"), "f=" + r.filtered + "/" + r.total);
  }

  // Direction
  {
    const r = ledger.queryLedger(FRESH, { direction: "in" });
    record("direction filter keeps only in/out",
      r.filtered === 3 && r.rows.every(x => x.direction === "in"), "f=" + r.filtered);
  }

  // Status
  {
    const posted = ledger.queryLedger(FRESH, { status: "posted" });
    record("status posted excludes draft/voided/reversed",
      posted.filtered === 1 && posted.rows[0].id === "E2", "f=" + posted.filtered + " ids=" + posted.rows.map(x => x.id).join(","));
    const rev = ledger.queryLedger(FRESH, { status: "reversed" });
    record("status reversed exposes both legs (original + reversal)",
      rev.filtered === 2 && rev.rows.map(x => x.id).sort().join(",") === "E1,E4", "ids=" + rev.rows.map(x => x.id).join(","));
    const dr = ledger.queryLedger(FRESH, { status: "draft" });
    record("status draft matches drafts only",
      dr.filtered === 1 && dr.rows[0].id === "E3", "f=" + dr.filtered);
    const vd = ledger.queryLedger(FRESH, { status: "voided" });
    record("status voided matches voided only",
      vd.filtered === 1 && vd.rows[0].id === "E5", "f=" + vd.filtered);
  }

  // Search (description / counterparty / reference, case-insensitive)
  {
    const r = ledger.queryLedger(FRESH, { search: "presell collection" });
    record("search matches description case-insensitively",
      r.filtered === 1 && r.rows[0].id === "E1", "f=" + r.filtered + " ids=" + r.rows.map(x => x.id).join(","));
    const c = ledger.queryLedger(FRESH, { search: "BPI" });
    record("search matches counterparty",
      c.filtered === 1 && c.rows[0].id === "E2", "f=" + c.filtered);
    const ref = ledger.queryLedger(FRESH, { search: "rf-5" });
    record("search matches reference number",
      ref.filtered === 1 && ref.rows[0].id === "E5", "f=" + ref.filtered);
    const none = ledger.queryLedger(FRESH, { search: "zzznope" });
    record("search with no match returns empty",
      none.filtered === 0 && none.rows.length === 0, "f=" + none.filtered);
  }

  // Date range (inclusive)
  {
    const r = ledger.queryLedger(FRESH, { from: "2026-08-01", to: "2026-08-20" });
    record("date range is inclusive on both bounds",
      r.filtered === 3 && r.rows.map(x => x.id).join(",") === "E1,E2,E3",
      "ids=" + r.rows.map(x => x.id).join(","));
    const fromOnly = ledger.queryLedger(FRESH, { from: "2026-08-02" });
    record("from-only excludes earlier dates",
      fromOnly.filtered === 2 && fromOnly.rows.every(x => x.entry_date >= "2026-08-02"), "f=" + fromOnly.filtered);
  }

  // Combined
  {
    const r = ledger.queryLedger(FRESH, { accountId: "A", direction: "out", status: "posted", search: "bank charge" });
    record("combined filters intersect correctly",
      r.filtered === 1 && r.rows[0].id === "E2", "f=" + r.filtered + " ids=" + r.rows.map(x => x.id).join(","));
    const d = ledger.queryLedger(FRESH, { accountId: "B", direction: "out", status: "draft", from: "2026-08-01", to: "2026-08-31" });
    record("full filter stack matches one row",
      d.filtered === 1 && d.rows[0].id === "E3", "f=" + d.filtered);
  }

  // Defaults / totals
  {
    const r = ledger.queryLedger(FRESH, {});
    record("empty filter returns all rows unchanged",
      r.filtered === 5 && r.total === 5 && r.rows.length === 5, "f=" + r.filtered);
    const s = ledger.queryLedger(FRESH, { accountId: "A", direction: "out" });
    record("result carries total vs filtered counts",
      s.total === 5 && s.filtered === 1, "t=" + s.total + " f=" + s.filtered);
  }

  // Purity / shared use
  {
    const before = JSON.stringify(ALL);
    const r1 = ledger.queryLedger(ALL, { search: "presell" });
    const r2 = ledger.queryLedger(ALL, { search: "presell" });
    record("query is pure and deterministic",
      r1.filtered === r2.filtered && JSON.stringify(ALL) === before, "f=" + r1.filtered);
  }

  const allOk = checks.length > 0 && checks.every(c => c.ok);
  process.stdout.write("==== SUMMARY ====\n");
  process.stdout.write(allOk ? "ALL GREEN (" + checks.length + " checks)\n" : checks.filter(c => !c.ok).length + " FAILED\n");
  process.exitCode = allOk ? 0 : 1;
}

run();