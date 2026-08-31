"use strict";
// Deterministic, offline pure-domain regression tests for the Portfolio cash
// ledger + construction/presell accounting rules (js/portfolio_ledger.js).
// Run via: node tests/ledger_domain_node.js  (or through tests\run_all.ps1).
// No HTTP, no browser, no timestamps asserted (fresh entries carry real ISO
// times). Output lines use [PASS]/[FAIL] and ASCII only.

const ledger = require("../js/portfolio_ledger.js");

const checks = [];
function record(name, ok, detail) {
  checks.push({ name, ok, detail });
  process.stdout.write((ok ? "  [PASS] " : "  [FAIL] ") + name + " " + (detail || "") + "\n");
}

function baseLedger(opening) {
  return { opening: opening, entries: [], nextId: 1 };
}
function inEntry(amount, extra) {
  return Object.assign({ accountId: "acct-1", direction: "in", amount: amount }, extra || {});
}
function outEntry(amount, purpose, link, extra) {
  return Object.assign({ accountId: "acct-1", direction: "out", amount: amount, purpose: purpose, link: link }, extra || {});
}

function run() {
  // ---- balance math ----
  {
    const L = baseLedger(100000);
    ledger.post(inEntry(50000), L);
    ledger.post(inEntry(25000), L);
    ledger.post(outEntry(30000, "others", null, { subcategory: "ops", description: "kami ops" }), L);
    const bal = ledger.cashBalance(L.opening, L.entries);
    const expected = 100000 + 50000 + 25000 - 30000;
    record("cash balance = opening + cash in - cash out (posted)",
      bal === expected, "balance=" + bal + " expected=" + expected);
  }
  {
    const L = baseLedger(1000);
    ledger.post(inEntry(500), L);
    L.entries.push({ accountId: "acct-1", direction: "in", amount: 9000, status: "pending" });
    L.entries.push({ accountId: "acct-1", direction: "out", amount: 99999, status: "draft" });
    record("pending/draft entries do not affect the posted balance",
      ledger.cashBalance(L.opening, L.entries) === 1500,
      "balance=" + ledger.cashBalance(L.opening, L.entries));
  }
  {
    const L = baseLedger(1000);
    const a = ledger.post(inEntry(500), L);
    const r = ledger.reverse(L, a.entry.id, "tester");
    record("posting then reversing nets the balance to the opening amount",
      r.ok === true && ledger.cashBalance(L.opening, L.entries) === 1000,
      "balance=" + ledger.cashBalance(L.opening, L.entries));
  }
  {
    record("amount rounding keeps 2-decimal precision",
      ledger.post(inEntry(0.105), baseLedger(0)).entry.amount === 0.11,
      "amount=" + ledger.post({ accountId: "a", direction: "in", amount: 0.105 }, { opening: 0, entries: [] }).entry.amount);
  }

  // ---- validation ----
  {
    const v = ledger.validateCashEntry({ accountId: "a", direction: "in", amount: -5 });
    record("negative amount is rejected",
      v.valid === false && /positive number/.test(v.errors.join(" ")), "errors=" + v.errors.join("|"));
  }
  {
    const v = ledger.validateCashEntry({ accountId: "a", direction: "sideways", amount: 100 });
    record("invalid direction is rejected", v.valid === false, "errors=" + v.errors.join("|"));
  }
  {
    const v = ledger.validateCashEntry({ accountId: "a", direction: "out", amount: 100 });
    record("cash out without a purpose is rejected",
      v.valid === false && /purpose/.test(v.errors.join(" ")), "errors=" + v.errors.join("|"));
  }
  {
    const v = ledger.validateCashEntry(outEntry(100, "project_selling"));
    record("project_selling cash out requires a linked deal/project/payment id",
      v.valid === false && /linked/.test(v.errors.join(" ")), "errors=" + v.errors.join("|"));
  }
  {
    const ok = ledger.validateCashEntry(outEntry(100, "project_selling", { type: "deal", id: "D1" }));
    record("project_selling cash out passes with a linked deal",
      ok.valid === true && ok.entry.purpose === "project_selling", "purpose=" + ok.entry.purpose);
  }
  {
    const v = ledger.validateCashEntry(outEntry(100, "construction"));
    record("construction cash out requires a linked project id",
      v.valid === false, "errors=" + v.errors.join("|"));
  }
  {
    const v = ledger.validateCashEntry(outEntry(100, "others"));
    record("others cash out requires a subcategory and description",
      v.valid === false && /subcategory/.test(v.errors.join(" ")), "errors=" + v.errors.join("|"));
  }
  {
    const v = ledger.validateCashEntry(Object.assign(inEntry(100), { purpose: "construction" }));
    record("purpose is rejected on a cash in",
      v.valid === false && /cash out/.test(v.errors.join(" ")), "errors=" + v.errors.join("|"));
  }

  // ---- posting rules ----
  {
    const L = baseLedger(100);
    const r = ledger.post(outEntry(300, "others", null, { subcategory: "x", description: "y" }), L);
    record("cash out beyond the current balance is rejected",
      r.ok === false && r.insufficient === true, "errors=" + (r.errors || []).join("|"));
  }
  {
    const L = baseLedger(0);
    ledger.post(inEntry(1000), L);
    const dup = ledger.post(Object.assign(inEntry(200), { idempotencyKey: "k-1" }), L);
    const again = ledger.post(Object.assign(inEntry(200), { idempotencyKey: "k-1" }), L);
    record("replayed idempotency keys are rejected",
      dup.ok === true && again.ok === false && again.dup === true, "again.ok=" + again.ok);
  }
  {
    const L = baseLedger(10000);
    ledger.post(outEntry(1000, "construction", { type: "project", id: "P1" }), L);
    const second = ledger.post(outEntry(500, "construction", { type: "project", id: "P1" }), L);
    record("the same linked project cannot be posted twice while active",
      second.ok === false && /already has an active post/.test(second.errors.join(" ")),
      "errors=" + (second.errors || []).join("|"));
  }
  {
    const L = baseLedger(10000);
    const a = ledger.post(outEntry(1000, "construction", { type: "project", id: "P2" }), L);
    ledger.reverse(L, a.entry.id, "tester");
    const again = ledger.post(outEntry(500, "construction", { type: "project", id: "P2" }), L);
    record("reversing frees the link so it can be posted again",
      again.ok === true && again.balance === 10000 - 500, "balance=" + again.balance);
  }
  {
    const L = baseLedger(1000);
    const r1 = ledger.reverse(L, "does-not-exist");
    record("reversing a missing entry is an error",
      r1.ok === false && /not found/.test(r1.errors.join(" ")), "errors=" + r1.errors.join("|"));
  }
  {
    const L = baseLedger(1000);
    const a = ledger.post(inEntry(100), L);
    const r = ledger.reverse(L, a.entry.id);
    const r2 = ledger.reverse(L, r.reversal.id);
    const r3 = ledger.reverse(L, a.entry.id);
    record("a reversal cannot be reversed and an entry cannot be reversed twice",
      r2.ok === false && /reversal/.test(r2.errors.join(" ")) && r3.ok === false && /already reversed/.test(r3.errors.join(" ")),
      "r2=" + r2.ok + " r3=" + r3.ok);
  }

  // ---- construction rollup ----
  {
    const s = ledger.constructionSummary({ planned: 1000000, committed: 600000, paid: 400000, contingency: 100000 });
    record("construction summary computes remaining/variance/forecast",
      s.remainingToCommit === 400000 && s.variance === 400000 && s.forecast === 700000 && s.paidRate === 66.7,
      "remaining=" + s.remainingToCommit + " forecast=" + s.forecast + " paidRate=" + s.paidRate);
  }
  {
    const s = ledger.constructionSummary({ committed: 0 });
    record("construction with zero committed is 'planned'", s.status === "planned", "status=" + s.status);
    const p = ledger.constructionSummary({ planned: 100, committed: 100, paid: 100 });
    record("construction fully paid is 'paid'", p.status === "paid" && p.paidRate === 100, "status=" + p.status);
    const i = ledger.constructionSummary({ planned: 100, committed: 80, paid: 30 });
    record("partial construction payment is 'in-progress'", i.status === "in-progress", "status=" + i.status);
    const e = ledger.constructionSummary({});
    record("empty construction math is safe (no divide by zero)",
      e.status === "planned" && e.paidRate === 0 && e.variance === 0, "status=" + e.status);
    record("committed cannot exceed the plan after a re-plan",
      ledger.constructionSummary({ planned: 50, committed: 80 }).remainingToCommit === 0,
      "remaining=" + ledger.constructionSummary({ planned: 50, committed: 80 }).remainingToCommit);
  }

  // ---- presell rollup ----
  {
    const r = ledger.presellRollup({ units: 20, sold: 15, collections: 7500000, target: 12000000 });
    record("presell rollup computes availability and collection rate",
      r.available === 5 && r.salesRate === 75 && r.collectionRate === 62.5,
      "available=" + r.available + " salesRate=" + r.salesRate + " collectionRate=" + r.collectionRate);
  }
  {
    const r = ledger.presellRollup({});
    record("empty presell rollup is division-safe",
      r.salesRate === 0 && r.collectionRate === 0 && r.available === 0, "salesRate=" + r.salesRate);
  }

  // ---- bank reconciliation ----
  {
    const L = baseLedger(1000);
    ledger.post(inEntry(500), L);
    const m = ledger.reconcile(L, 1500);
    record("balance equal to the statement is 'reconciled'",
      m.status === "reconciled" && m.difference === 0, "status=" + m.status);
  }
  {
    const L = baseLedger(1000);
    ledger.post(inEntry(500), L);
    const m = ledger.reconcile(L, 1400);
    record("balance different from the statement is 'unreconciled' with a difference",
      m.status === "unreconciled" && m.difference === 100, "diff=" + m.difference);
  }

  const allOk = checks.length > 0 && checks.every(c => c.ok);
  process.stdout.write("==== SUMMARY ====\n");
  process.stdout.write(allOk ? "ALL GREEN (" + checks.length + " checks)\n" : checks.filter(c => !c.ok).length + " FAILED\n");
  process.exitCode = allOk ? 0 : 1;
}

run();