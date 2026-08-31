"use strict";
// Deterministic, offline pure-domain tests for the legacy migration/backfill
// rule (js/portfolio_ledger.js migrateLegacyCash): paid pre-selling collections
// and legacy transactions fold into the cash ledger exactly once, with no
// double counting on re-runs, already-linked payments, or unpaid schedules.
// Run via: node tests/portfolio_migration_node.js
// No HTTP, no browser. Output lines use [PASS]/[FAIL] and ASCII only.

const ledger = require("../js/portfolio_ledger.js");

const checks = [];
function record(name, ok, detail) {
  checks.push({ name, ok, detail });
  process.stdout.write((ok ? "  [PASS] " : "  [FAIL] ") + name + " " + (detail || "") + "\n");
}

const ACT = "acc-main";
const OPENING = 2500000;

function paidPay(id, amount, extra) {
  return Object.assign({
    id: id, unit_id: "U-" + id, label: "Equity " + id, amount: amount,
    status: "paid", paid_at: "2026-08-15", ref: "OR-" + id
  }, extra || {});
}

function vacant() {
  return { opening: OPENING, entries: [] };
}

function run() {
  // 1. Paid presell collections post as cash-in once
  {
    const L = vacant();
    const res = ledger.migrateLegacyCash({
      ledger: L,
      defaultAccountId: ACT,
      presellPayments: [paidPay("P1", 95000), paidPay("P2", 50000)]
    });
    record("paid collections post as cash-in",
      res.addedCount === 2 && res.skippedCount === 0,
      "added=" + res.addedCount + " skipped=" + res.skippedCount);
    record("migrated entries are posted with account and amount",
      res.added.every(e => e.status === "posted" && e.accountId === ACT && e.direction === "in" && e.amount > 0),
      "count=" + res.added.length);
    record("migrated entries carry the payment link back",
      res.added[0].link && res.added[0].link.type === "payment" && res.added[0].link.id === "P1",
      JSON.stringify(res.added[0].link || null));
    record("balance rises by the collected total",
      ledger.cashBalance(OPENING, L.entries) === 2645000,
      "bal=" + ledger.cashBalance(OPENING, L.entries));
  }

  // 2. Unpaid / draft payments are not migrated
  {
    const L = vacant();
    const res = ledger.migrateLegacyCash({
      ledger: L,
      defaultAccountId: ACT,
      presellPayments: [
        paidPay("P1", 95000, { status: "pending", due_date: "2026-10-01" }),
        paidPay("P2", 0),
        { id: "P3", amount: 30000, status: "draft" }
      ]
    });
    record("unpaid and zero-amount payments are excluded",
      res.addedCount === 0 && L.entries.length === 0,
      "added=" + res.addedCount + " entries=" + L.entries.length);
  }

  // 3. Re-running the migration does not double count
  {
    const L = vacant();
    const first = ledger.migrateLegacyCash({ ledger: L, defaultAccountId: ACT, presellPayments: [paidPay("P1", 95000)] });
    const second = ledger.migrateLegacyCash({ ledger: L, defaultAccountId: ACT, presellPayments: [paidPay("P1", 95000)] });
    record("re-run adds nothing and flags duplicates",
      first.addedCount === 1 && second.addedCount === 0 && second.skipped.some(s => s.reason === "duplicate" || s.reason === "already-linked"),
      "first=" + first.addedCount + " second=" + second.addedCount + " reasons=" + second.skipped.map(s => s.reason).join(","));
    record("balance is unchanged after re-run",
      ledger.cashBalance(OPENING, L.entries) === 2595000 && L.entries.length === 1,
      "bal=" + ledger.cashBalance(OPENING, L.entries));
  }

  // 4. Already-linked payment is skipped (flat app link field)
  {
    const L = vacant();
    L.entries.push({ id: "E1", status: "posted", direction: "in", amount: 95000, accountId: ACT, linked_presell_payment_id: "P1" });
    const res = ledger.migrateLegacyCash({ ledger: L, defaultAccountId: ACT, presellPayments: [paidPay("P1", 95000)] });
    record("already-linked flat payment field is skipped",
      res.addedCount === 0 && res.skipped.some(s => s.reason === "already-linked"),
      "added=" + res.addedCount);
  }

  // 5. Already-linked pure link is skipped too
  {
    const L = vacant();
    L.entries.push({ id: "E1", status: "posted", direction: "in", amount: 95000, accountId: ACT, link: { type: "payment", id: "P1" } });
    const res = ledger.migrateLegacyCash({ ledger: L, defaultAccountId: ACT, presellPayments: [paidPay("P1", 95000)] });
    record("already-linked pure payment link is skipped",
      res.addedCount === 0 && res.skipped.some(s => s.reason === "already-linked"),
      "added=" + res.addedCount);
  }

  // 6. Legacy transactions map direction, purpose and label
  {
    const L = vacant();
    const tx = [
      { id: "T1", amount: 50000, direction: "in", ref: "Collection T1", date: "2026-06-01", link: { type: "payment", id: "T1-pay" } },
      { id: "T2", amount: 20000, direction: "out", ref: "Commission", date: "2026-06-05", label: "Broker payout" }
    ];
    const res = ledger.migrateLegacyCash({ ledger: L, defaultAccountId: ACT, transactions: tx });
    record("legacy transactions post once with correct movements",
      res.addedCount === 2 && L.entries.length === 2,
      "added=" + res.addedCount);
    const out = L.entries.find(e => e.direction === "out");
    const inc = L.entries.find(e => e.direction === "in");
    record("out transactions carry purpose and subcategory",
      out && out.purpose === "others" && out.subcategory === "migration",
      JSON.stringify(out ? { p: out.purpose, s: out.subcategory } : null));
    record("entry dates and refs are carried through",
      inc && inc.entryDate === "2026-06-01" && inc.ref === "Collection T1",
      JSON.stringify(inc ? { d: inc.entryDate, r: inc.ref } : null));
    record("out transactions are capped by available balance",
      ledger.cashBalance(OPENING, L.entries) === 2530000,
      "bal=" + ledger.cashBalance(OPENING, L.entries));
  }

  // 7. Out transaction exceeding balance is rejected, not double counted
  {
    const L = vacant();
    const res = ledger.migrateLegacyCash({ ledger: L, defaultAccountId: ACT, transactions: [{ id: "T1", amount: 5000000, direction: "out", ref: "Huge" }] });
    record("overdraft transactions are safely skipped",
      res.addedCount === 0 && res.skipped.some(s => s.reason.indexOf("balance") >= 0),
      "added=" + res.addedCount + " reason=" + (res.skipped[0] && res.skipped[0].reason));
  }

  // 8. Transaction referencing an already-migrated payment is skipped
  {
    const L = vacant();
    const p = paidPay("P1", 95000);
    const presell = ledger.migrateLegacyCash({ ledger: L, defaultAccountId: ACT, presellPayments: [p], transactions: [] });
    const tx = ledger.migrateLegacyCash({ ledger: L, defaultAccountId: ACT, presellPayments: [], transactions: [{ id: "T1", amount: 95000, direction: "in", ref: "dup", link: { type: "payment", id: "P1" } }] });
    record("transaction duplicate of a migrated payment is skipped",
      presell.addedCount === 1 && tx.addedCount === 0 && tx.skipped.some(s => s.reason === "already-linked"),
      "presell=" + presell.addedCount + " tx=" + tx.addedCount);
    record("ledger total still reflects the single collection",
      ledger.cashBalance(OPENING, L.entries) === 2595000 && L.entries.length === 1,
      "bal=" + ledger.cashBalance(OPENING, L.entries));
  }

  // 9. No default account prevents posting (rule reports skip)
  {
    const L = vacant();
    const res = ledger.migrateLegacyCash({ ledger: L, defaultAccountId: "", presellPayments: [paidPay("P1", 95000)] });
    record("missing default account blocks migration safely",
      res.addedCount === 0 && res.skipped.some(s => s.reason === "no default account"),
      "added=" + res.addedCount);
  }

  // 10. Empty input is a no-op
  {
    const L = vacant();
    const res = ledger.migrateLegacyCash({ ledger: L, defaultAccountId: ACT });
    record("empty input is a safe no-op",
      res.addedCount === 0 && L.entries.length === 0,
      "ok");
  }

  const allOk = checks.length > 0 && checks.every(c => c.ok);
  process.stdout.write("==== SUMMARY ====\n");
  process.stdout.write(allOk ? "ALL GREEN (" + checks.length + " checks)\n" : checks.filter(c => !c.ok).length + " FAILED\n");
  process.exitCode = allOk ? 0 : 1;
}

run();