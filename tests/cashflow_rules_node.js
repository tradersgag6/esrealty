"use strict";
// Deterministic, offline pure-domain regression tests for the Portfolio
// cash-flow rules (js/portfolio_ledger.js): Command Center, monthly rollup,
// asset timeline, construction cash flow, pre-selling cash flow, transfers,
// and balance-after-post preview. Run via: node tests/cashflow_rules_node.js
// (or through tests\run_all.ps1). No HTTP, no browser.
// Output lines use [PASS]/[FAIL] and ASCII only.

const ledger = require("../js/portfolio_ledger.js");

const checks = [];
function record(name, ok, detail) {
  checks.push({ name, ok, detail });
  process.stdout.write((ok ? "  [PASS] " : "  [FAIL] ") + name + " " + (detail || "") + "\n");
}

function fixture() {
  const accounts = [
    { id: "acct-1", name: "Company PHP", type: "company", opening_balance: 100000, as_of: "2024-01-01", currency: "PHP" },
    { id: "acct-2", name: "Company USD", type: "company", opening_balance: 0, as_of: "2024-01-01", currency: "PHP" }
  ];
  const entries = [
    { id: "E1", accountId: "acct-1", direction: "in", amount: 50000, purpose: "", status: "posted", entry_date: "2024-01-15", description: "Seed capital", reference_no: "R1" },
    { id: "E2", accountId: "acct-1", direction: "out", amount: 30000, purpose: "construction", linked_construction_id: "PRJ-1", linked_phase_id: "PH-1", status: "posted", entry_date: "2024-02-10", description: "Foundation progress", reference_no: "R2" },
    { id: "E3", accountId: "acct-1", direction: "out", amount: 5000, purpose: "project_selling", linked_asset_id: "ASSET-1", status: "posted", entry_date: "2024-02-15", description: "Marketing brochures", reference_no: "R3" },
    { id: "E4", accountId: "acct-1", direction: "out", amount: 2000, purpose: "others", subcategory: "ops", status: "posted", entry_date: "2024-03-05", description: "Office rent", reference_no: "R4" },
    { id: "E5", accountId: "acct-1", direction: "out", amount: 1500, purpose: "construction", linked_construction_id: "PRJ-1", linked_phase_id: "PH-2", status: "posted", entry_date: "2024-03-20", description: "Masonry draw", reference_no: "R5" },
    { id: "E6", accountId: "acct-1", direction: "in", amount: 10000, purpose: "", linked_asset_id: "ASSET-1", status: "posted", entry_date: "2024-03-01", description: "Rent received", reference_no: "R6" },
    { id: "E7", accountId: "acct-2", direction: "in", amount: 10000, purpose: "", status: "posted", entry_date: "2024-02-05", description: "Presell collection A", reference_no: "R7", linked_presell_payment_id: "PAY-2" },
    { id: "E8", accountId: "acct-2", direction: "in", amount: 20000, purpose: "", status: "posted", entry_date: "2024-04-10", description: "Presell collection B", reference_no: "R8", linked_presell_payment_id: "PAY-4" }
  ];
  const projects = [
    { id: "PRJ-1", name: "Lordland Tower", asset_id: "ASSET-1", presell_project_id: "PSELL-1", contingency: 10000, retention_rate: 5, contract_value: 120000, status: "active" }
  ];
  const phases = [
    { id: "PH-1", project_id: "PRJ-1", name: "Foundation", planned_budget: 60000, committed: 60000, paid: 30000, percent_complete: 40 },
    { id: "PH-2", project_id: "PRJ-1", name: "Masonry", planned_budget: 50000, committed: 30000, paid: 1500, percent_complete: 10 }
  ];
  const invoices = [
    { id: "INV-1", project_id: "PRJ-1", invoice_no: "INV-1001", date: "2024-02-20", amount: 8000, phase_id: "PH-1", vendor_id: "V-1", status: "pending" },
    { id: "INV-2", project_id: "PRJ-1", invoice_no: "INV-1002", date: "2024-01-30", amount: 8000, phase_id: "PH-1", vendor_id: "V-1", status: "paid" },
    { id: "INV-3", project_id: "PRJ-1", invoice_no: "INV-1003", date: "2024-02-25", amount: 9000, phase_id: "PH-2", vendor_id: "V-2", status: "voided" }
  ];
  const changeOrders = [];
  const units = [
    { id: "U1", project_id: "PSELL-1", name: "Unit 101", price: 2200000, status: "sold" },
    { id: "U2", project_id: "PSELL-1", name: "Unit 102", price: 1800000, status: "sold" },
    { id: "U3", project_id: "PSELL-1", name: "Unit 103", price: 1500000, status: "reserved" }
  ];
  const payments = [
    { id: "PAY-1", unit_id: "U1", label: "Reservation", amount: 5000, due_date: "2024-01-10", status: "pending" },
    { id: "PAY-2", unit_id: "U1", label: "Downpayment 1", amount: 10000, due_date: "2024-02-28", status: "paid" },
    { id: "PAY-6", unit_id: "U1", label: "Downpayment 2", amount: 4000, due_date: "2024-03-30", status: "pending" },
    { id: "PAY-3", unit_id: "U2", label: "Downpayment 1", amount: 15000, due_date: "2024-04-15", status: "pending" },
    { id: "PAY-4", unit_id: "U2", label: "Balance", amount: 20000, due_date: "2024-05-01", status: "paid" }
  ];
  const deals = [
    { id: "ASSET-1", label: "Unit 12 Lordland", acquisition: 200000, loan: 150000, invested: 210000, acquiredAt: "2024-01-20", projectedProfit: 60000, projectedAt: "2025-01-20", realizedProfit: 0 }
  ];
  return { accounts, entries, projects, phases, invoices, changeOrders, units, payments, deals };
}

function run() {
  const f = fixture();

  // ---- classification ----
  {
    const c1 = ledger.classifyEntry({ link: { type: "payment", id: "X" } });
    const c2 = ledger.classifyEntry({ linked_construction_id: "PRJ-1" });
    const c3 = ledger.classifyEntry({ direction: "in" });
    const c4 = ledger.classifyEntry({ direction: "out", purpose: "others", subcategory: "tax" });
    const c5 = ledger.classifyEntry({ direction: "out", purpose: "project_selling", linked_asset_id: "A" });
    record("classifyEntry buckets payment/construction/in/selling",
      c1.bucket === "presell_collection" && c2.bucket === "construction" && c3.bucket === "collection" && c5.bucket === "selling",
      [c1.bucket, c2.bucket, c3.bucket, c5.bucket].join(","));
    record("classifyEntry maps tax subcategory", c4.label === "Tax / fee", c4.label);
  }

  // ---- Command Center: posted buckets over a range ----
  {
    const cc = ledger.commandCenter({
      accounts: f.accounts, entries: f.entries, projects: f.projects, phases: f.phases,
      invoices: f.invoices, changeOrders: f.changeOrders, presellUnits: f.units, presellPayments: f.payments,
      deals: f.deals, today: "2024-03-25", from: "2024-02-01", to: "2024-03-31"
    });
    record("command center opening excludes in-range movements", cc.posted.opening === 150000, "opening=" + cc.posted.opening);
    record("command center cashIn within range (rent + presell collection)", cc.posted.cashIn === 20000, "cashIn=" + cc.posted.cashIn);
    record("command center cashOut within range", cc.posted.cashOut === 38500, "cashOut=" + cc.posted.cashOut);
    record("command center net = in - out", cc.posted.net === -18500, "net=" + cc.posted.net);
    record("command center closing = opening + net", cc.posted.closing === 131500, "closing=" + cc.posted.closing);
    record("command center basis labels are distinct", cc.posted.basis === "Posted" && cc.committed.basis === "Committed" && cc.receivables.basis === "Receivable" && cc.projected.basis === "Projected");
  }

  // ---- Command Center: committed vs posted separation ----
  {
    const cc = ledger.commandCenter({
      accounts: f.accounts, entries: f.entries, projects: f.projects, phases: f.phases,
      invoices: f.invoices, changeOrders: f.changeOrders, presellUnits: f.units, presellPayments: f.payments,
      deals: f.deals, today: "2024-03-25", from: "2024-02-01", to: "2024-03-31"
    });
    record("committed unpaid = committed - paid", cc.committed.committedUnpaid === 58500, "unpaid=" + cc.committed.committedUnpaid);
    record("forecast includes contingency (committed+contingency)", cc.committed.forecast === 100000, "forecast=" + cc.committed.forecast);
    record("cash required to complete = forecast - paid", cc.committed.cashRequiredToComplete === 68500, "req=" + cc.committed.cashRequiredToComplete);
    record("payables due excludes paid and voided invoices", cc.payables.due === 8000 && cc.payables.invoices === 1, "due=" + cc.payables.due + " count=" + cc.payables.invoices);
    record("receivables exclude paid schedules and out-of-range dues", cc.receivables.total === 4000 && cc.receivables.count === 1, "recv=" + cc.receivables.total + " count=" + cc.receivables.count);
    record("projected inflow only future-dated receivables", cc.projected.inflow === 4000, "inflow=" + cc.projected.inflow);
    record("available after committed = closing - committedUnpaid", cc.availableAfterCommitted.amount === 73000, "avail=" + cc.availableAfterCommitted.amount);
    record("debt is Estimated from the deal model", cc.debt.basis === "Estimated" && cc.debt.principal === 150000 && cc.debt.financingProceeds === 150000, "debt=" + cc.debt.principal);
  }

  // ---- Monthly rollup ----
  {
    const cc = ledger.commandCenter({
      accounts: f.accounts, entries: f.entries, projects: f.projects, phases: f.phases,
      invoices: f.invoices, changeOrders: f.changeOrders, presellUnits: f.units, presellPayments: f.payments,
      deals: f.deals, today: "2024-03-25", from: "2024-02-01", to: "2024-03-31"
    });
    const m = cc.months;
    record("monthly rollup has Feb and Mar rows", m.length === 2 && m[0].month === "2024-02" && m[1].month === "2024-03", "months=" + m.map(x => x.month).join(","));
    record("Feb opening = opening before range + pre-range movement", m[0].opening === 150000, "opening=" + m[0].opening);
    record("Feb posted out = E2+E3", m[0].cashOut === 35000 && m[0].net === -25000, "out=" + m[0].cashOut + " net=" + m[0].net);
    record("Feb closing carries to Mar opening (incl Feb cash-in)", m[0].closing === 125000 && m[1].opening === 125000, "chain=" + m[0].closing + "->" + m[1].opening);
    record("Feb projected inflow: PAY-2 was already paid, so none pending", m[0].projectedIn === 0, "proj=" + m[0].projectedIn);
    record("Mar projected inflow from pending dues", m[1].projectedIn === 4000, "proj=" + m[1].projectedIn);
  }

  // ---- Asset timeline ----
  {
    const tl = ledger.assetTimeline({ assetId: "ASSET-1", asset: f.deals[0], entries: f.entries, today: "2024-03-25" });
    const actual = tl.events.filter(e => e.actual);
    const estimates = tl.events.filter(e => !e.actual);
    record("asset timeline has actual posted entries", actual.length === 2, "actual=" + actual.length);
    record("asset timeline has deal-model estimates", estimates.length === 4, "estimates=" + estimates.length);
    const sale = estimates.some(e => e.label === "Selling expense") || actual.some(e => e.source === "selling");
    const fin = estimates.some(e => e.label === "Financing proceeds");
    record("asset timeline labels selling expense + financing", sale && fin);
    const rent = actual.find(e => e.description === "Rent received");
    record("asset timeline rent is actual in-collection", rent && rent.direction === "in" && rent.amount === 10000, "amt=" + (rent && rent.amount));
    record("asset timeline posted totals", tl.totals.postedIncome === 10000 && tl.totals.postedExpenses === 5000 && tl.totals.debt === 150000, "in=" + tl.totals.postedIncome + " out=" + tl.totals.postedExpenses);
    record("asset timeline projected revenue labeled", tl.totals.projectedRevenue === 60000, "proj=" + tl.totals.projectedRevenue);
    record("asset timeline events ordered by date", tl.events.every((e, i) => i === 0 || tl.events[i - 1].date <= e.date), "first=" + tl.events[0].date);
  }

  // ---- Construction project cash flow ----
  {
    const pcf = ledger.projectCashflow({
      projectId: "PRJ-1", project: f.projects[0], phases: f.phases, invoices: f.invoices,
      changeOrders: f.changeOrders, entries: f.entries, presellUnits: f.units, presellPayments: f.payments,
      today: "2024-03-25"
    });
    record("project cash out lists linked construction entries", pcf.cashOut.length === 2 && pcf.cashOut[0].amount === 30000 && pcf.cashOut[1].amount === 1500, "out=" + pcf.cashOut.map(x => x.amount).join(","));
    record("unpaid invoices excludes paid/voided", pcf.unpaidInvoices.length === 1 && pcf.unpaidInvoices[0].invoice_no === "INV-1001", "inv=" + pcf.unpaidInvoices.map(x => x.invoice_no).join(","));
    record("collections from presell units = paid schedules once (PAY-2 + PAY-4)", pcf.collectedFromPresell === 30000, "coll=" + pcf.collectedFromPresell);
    record("ledger footprint matches collections (no double count)", pcf.ledgerFootprint === 30000 && pcf.ledgerMismatch === false, "fp=" + pcf.ledgerFootprint);
    record("cash required to complete", pcf.cashRequiredToComplete === 68500, "req=" + pcf.cashRequiredToComplete);
    record("overpaid warning fires above earned", pcf.warnings.some(w => w.type === "overpaid"), "warn=" + pcf.warnings.map(w => w.type).join(","));
  }
  {
    const pcf2 = ledger.projectCashflow({
      projectId: "PRJ-1", project: f.projects[0], phases: f.phases, invoices: f.invoices,
      changeOrders: f.changeOrders, entries: f.entries.concat([{ id: "E9", accountId: "acct-2", direction: "in", amount: 10000, purpose: "", status: "posted", entry_date: "2024-02-06", linked_presell_payment_id: "PAY-2" }]),
      presellUnits: f.units, presellPayments: f.payments, today: "2024-03-25"
    });
    record("double-posted linked collection is flagged", pcf2.ledgerMismatch === true && pcf2.ledgerFootprint === 30000, "fp=" + pcf2.ledgerFootprint + " mismatch=" + pcf2.ledgerMismatch);
  }

  // ---- Pre-selling project cash flow ----
  {
    const s = ledger.presellCashflow({
      projectId: "PSELL-1", project: { id: "PSELL-1", name: "Lordland Residences" }, units: f.units,
      payments: f.payments, entries: f.entries, constructionProjects: f.projects, phases: f.phases,
      today: "2024-03-25"
    });
    record("presell contracted + reserved values", s.contracted === 4000000 && s.contractedCount === 2 && s.reservedValue === 1500000, "contracted=" + s.contracted);
    record("presell paid vs pending schedules", s.paid.total === 30000 && s.paid.count === 2 && s.pending.total === 24000 && s.pending.count === 3, "paid=" + s.paid.total + " pending=" + s.pending.total);
    record("expected collections by month from pending only", s.expectedByMonth.length === 3 && s.expectedByMonth[0].month === "2024-01" && s.expectedByMonth[2].month === "2024-04", "months=" + s.expectedByMonth.map(x => x.month).join(","));
    record("ledger footprint counts each paid schedule once", s.ledger.total === 30000 && s.ledger.count === 2 && s.doubleCounted === false, "ledger=" + s.ledger.total);
    record("linked construction cost paid/remaining", s.construction.paid === 31500 && s.construction.remaining === 68500, "paid=" + s.construction.paid + " rem=" + s.construction.remaining);
    record("cost per unit is projected from forecast", s.costPerUnit === 50000, "cpu=" + s.costPerUnit);
    record("expected margin is projected", s.expectedMargin === 5400000, "margin=" + s.expectedMargin);
  }

  // ---- Transfers ----
  {
    const t = ledger.postTransfer({ from: "acct-1", to: "acct-2", amount: 5000, date: "2024-03-01", description: "Convert PHP to USD", id: "TF1" });
    record("transfer emits both sides", t.ok && t.out.direction === "out" && t.in.direction === "in" && t.out.amount === 5000 && t.in.amount === 5000, "out=" + (t.out && t.out.amount) + " in=" + (t.in && t.in.amount));
    record("transfer sides carry distinct idempotency keys", t.ok && t.out.idempotencyKey === "transfer:out:TF1" && t.in.idempotencyKey === "transfer:in:TF1", t.ok ? t.out.idempotencyKey : "-");
    record("transfer requires from/to", !ledger.postTransfer({ amount: 100 }).ok && !ledger.postTransfer({ from: "a", amount: 100 }).ok, "");
    record("transfer rejects same account", !ledger.postTransfer({ from: "a", to: "a", amount: 100 }).ok, "");
    record("transfer rejects non-positive amount", !ledger.postTransfer({ from: "a", to: "b", amount: 0 }).ok, "");
  }

  // ---- Balance-after-post preview ----
  {
    const L = { opening: 5000, entries: [
      { id: "A", accountId: "acct-1", direction: "in", amount: 10000, status: "posted", entry_date: "2024-01-05" },
      { id: "B", accountId: "acct-1", direction: "out", amount: 2500, status: "posted", entry_date: "2024-01-06" }
    ] };
    const ok = ledger.balanceAfterPost(L.entries, L.opening, { direction: "out", amount: 3000 });
    const bad = ledger.balanceAfterPost(L.entries, L.opening, { direction: "out", amount: 20000 });
    record("balance-after-post preview computes surplus", ok.current === 12500 && ok.after === 9500 && ok.ok === true, "after=" + ok.after);
    record("insufficient cash warning when deficient", bad.after === -7500 && bad.ok === false, "after=" + bad.after);
  }

  // ---- aggregated result ----
  const failed = checks.filter(c => !c.ok);
  process.stdout.write("\n==== SUMMARY " + (failed.length ? "FAILED " + failed.length + "/" + checks.length : "ALL GREEN (" + checks.length + " checks)") + " ====\n");
  if (failed.length) process.exit(1);
}

run();