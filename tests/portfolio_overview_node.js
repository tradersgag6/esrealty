"use strict";
// Deterministic, offline pure-domain tests for the Portfolio Overview rollup
// (js/portfolio_ledger.js overviewRollup): cash basis vs projected/committed
// separation, receivables, payables, and due/overdue schedules.
// Run via: node tests/portfolio_overview_node.js
// No HTTP, no browser. Output lines use [PASS]/[FAIL] and ASCII only.

const ledger = require("../js/portfolio_ledger.js");

const checks = [];
function record(name, ok, detail) {
  checks.push({ name, ok, detail });
  process.stdout.write((ok ? "  [PASS] " : "  [FAIL] ") + name + " " + (detail || "") + "\n");
}

function fixture() {
  const accounts = [
    { id: "accA", label: "Cash on Hand", account_type: "cash", opening_balance: 1000000 },
    { id: "accB", label: "Payroll", account_type: "cash", opening_balance: 500000 }
  ];
  const entries = [
    { id: "E1", accountId: "accA", direction: "in", amount: 100000, status: "posted" },
    { id: "E2", accountId: "accA", direction: "out", amount: 60000, purpose: "others", subcategory: "fee", description: "bank charge", status: "posted" },
    { id: "E3", accountId: "accA", direction: "out", amount: 20000, purpose: "others", subcategory: "fee", description: "draft only", status: "draft" },
    { id: "E4", accountId: "accB", direction: "out", amount: 80000, purpose: "construction", link: { type: "project", id: "P1" }, status: "posted" }
  ];
  const projects = [
    { id: "P1", contingency: 50000, retention_rate: 10 },
    { id: "P2", contingency: 0, retention_rate: 0 }
  ];
  const phases = [
    { project_id: "P1", planned_budget: 300000, committed: 240000, paid: 100000, percent_complete: 40 },
    { project_id: "P1", planned_budget: 200000, committed: 160000, paid: 160000, percent_complete: 100 },
    { project_id: "P2", planned_budget: 100000, committed: 100000, paid: 0, percent_complete: 10 }
  ];
  const changeOrders = [
    { project_id: "P1", amount: 25000 }
  ];
  const units = [
    { id: "U1", project_id: "PS1", price: 2000000, status: "reserved" },
    { id: "U2", project_id: "PS1", price: 1500000, status: "available" },
    { id: "U3", project_id: "PS2", price: 3000000, status: "sold" }
  ];
  const payments = [
    { id: "A1", unit_id: "U1", due_date: "2026-08-01", label: "Reservation Fee", amount: 200000, status: "paid" },
    { id: "A2", unit_id: "U1", due_date: "2030-01-01", label: "Balance 1", amount: 1800000, status: "pending" },
    { id: "B1", unit_id: "U2", due_date: "2026-08-30", label: "Balance 2", amount: 50000, status: "pending" },
    { id: "B2", unit_id: "U2", due_date: "", label: "Balance 3", amount: 500000, status: "pending" }
  ];
  const deals = [
    { marketValue: 5000000, acquisition: 1000000, invested: 1500000, loan: 600000, realizedProfit: 0, projectedProfit: 400000 },
    { marketValue: 7000000, acquisition: 2000000, invested: 2600000, loan: 500000, realizedProfit: 800000, projectedProfit: 0 }
  ];
  return ledger.overviewRollup({ accounts, entries, projects, phases, changeOrders, presellUnits: units, presellPayments: payments, deals, today: "2026-08-31" });
}

function run() {
  const ov = fixture();

  // Cash — Posted only
  {
    const a = ov.cash.accounts.find(x => x.id === "accA");
    const b = ov.cash.accounts.find(x => x.id === "accB");
    record("per-account balance is posted-only",
      a.balance === 1040000 && b.balance === 420000,
      "A=" + a.balance + " B=" + b.balance);
  }
  record("cash total sums accounts",
    ov.cash.total === 1460000, ov.cash.total);
  record("cash in / out / net are actual posted movements",
    ov.cash.cashIn === 100000 && ov.cash.cashOut === 140000 && ov.cash.netCash === -40000,
    "in=" + ov.cash.cashIn + " out=" + ov.cash.cashOut + " net=" + ov.cash.netCash);
  record("draft entries do not count as posted",
    ov.cash.postedCount === 3, "posted=" + ov.cash.postedCount);

  // Deals — projected vs actual
  record("portfolio value is projected deal value",
    ov.deals.portfolioValue === 12000000, ov.deals.portfolioValue);
  record("acquisition cost and invested capital are actual",
    ov.deals.acquisitionCost === 3000000 && ov.deals.investedCapital === 4100000,
    "acq=" + ov.deals.acquisitionCost + " inv=" + ov.deals.investedCapital);
  record("debt is actual loans and net worth = value - debt",
    ov.deals.debt === 1100000 && ov.deals.netWorth === 10900000,
    "debt=" + ov.deals.debt + " nw=" + ov.deals.netWorth);
  record("realized vs projected profit are separated",
    ov.deals.realizedProfit === 800000 && ov.deals.projectedProfit === 400000,
    "real=" + ov.deals.realizedProfit + " proj=" + ov.deals.projectedProfit);

  // Construction — committed / forecast / payables
  record("construction planned/committed/paid roll up phases",
    ov.construction.planned === 600000 && ov.construction.committed === 500000 && ov.construction.paid === 260000,
    JSON.stringify([ov.construction.planned, ov.construction.committed, ov.construction.paid]));
  record("forecast includes contingency and change orders",
    ov.construction.forecast === 575000 && ov.construction.contingency === 50000 && ov.construction.changeOrders === 25000,
    "fc=" + ov.construction.forecast);
  record("payables = committed - paid",
    ov.construction.payables === 240000, ov.construction.payables);
  record("retention held is computed from committed",
    ov.construction.retention === 40000, ov.construction.retention);
  record("variance = planned - committed",
    ov.construction.variance === 100000, ov.construction.variance);
  record("project and phase counts reported",
    ov.construction.projects === 2 && ov.construction.phases === 3,
    ov.construction.projects + "/" + ov.construction.phases);

  // Presell — booked, collected, receivables, due/overdue
  record("booked revenue counts reserved + sold only",
    ov.presell.bookedRevenue === 5000000 && ov.presell.sold === 2 && ov.presell.units === 3,
    "booked=" + ov.presell.bookedRevenue);
  record("collected = paid payments, receivables = unpaid",
    ov.presell.collected === 200000 && ov.presell.receivables === 2350000,
    "col=" + ov.presell.collected + " rec=" + ov.presell.receivables);
  record("due vs overdue split on today",
    ov.presell.dueTotal === 1800000 && ov.presell.overdueTotal === 50000,
    "due=" + ov.presell.dueTotal + " over=" + ov.presell.overdueTotal);
  record("record without a due date stays receivable only",
    ov.presell.upcomingCount === 1 && ov.presell.overdueCount === 1,
    ov.presell.upcomingCount + "/" + ov.presell.overdueCount);
  record("upcoming items sorted by due date",
    ov.due.upcoming.length === 1 && ov.due.upcoming[0].dueDate === "2030-01-01",
    (ov.due.upcoming[0] && ov.due.upcoming[0].dueDate) || "-");
  record("overdue items carry amount and unit",
    ov.due.overdue.length === 1 && ov.due.overdue[0].amount === 50000 && ov.due.overdue[0].unitId === "U2",
    (ov.due.overdue[0] && ov.due.overdue[0].unitId) || "-");

  // Empty input safety
  {
    const e = ledger.overviewRollup({});
    record("empty input is safe",
      e.cash.total === 0 && e.deals.portfolioValue === 0 && e.construction.forecast === 0 && e.presell.receivables === 0 && e.due.upcoming.length === 0,
      "ok");
  }

  const allOk = checks.length > 0 && checks.every(c => c.ok);
  process.stdout.write("==== SUMMARY ====\n");
  process.stdout.write(allOk ? "ALL GREEN (" + checks.length + " checks)\n" : checks.filter(c => !c.ok).length + " FAILED\n");
  process.exitCode = allOk ? 0 : 1;
}

run();