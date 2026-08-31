# ES Realty Portfolio Cash-Flow Flow Upgrade Prompt

## Objective

Redesign Portfolio so an ES Realty user can follow cash from the opening account
balance through every project and asset over time. The system must show where
money came from, where it went, what it is committed to, what is expected later,
and how each asset or construction project affects cash.

This is an operational cash-flow feature, not only a chart or cosmetic dashboard.
Actual cash, committed costs, receivables, payables, projected revenue, debt, and
profit must never be combined into one misleading number.

## Confirmed Business Flow

1. Create or select an ES Realty account.
2. Enter a verified opening balance and as-of date.
3. Choose Cash In or Cash Out.
4. Enter a positive amount, date, description, counterparty, and reference.
5. For Cash Out choose exactly one purpose:
   - Project Selling.
   - Construction Project.
   - Others.
6. Select the optional context from a dependent list:
   - Asset/deal.
   - Construction project, phase, vendor, or invoice.
   - Pre-Selling project, unit, or payment where applicable.
   - Sales transaction.
7. Attach image proof when available.
8. Save as posted because this workflow is real on save.
9. Update the account balance and linked project/asset totals once.
10. Show the entry in the chronological cash-flow history.
11. Correct a posted mistake with an auditable reversal, never a silent delete.

## Cash-Flow Views

### 1. Portfolio Cash Command Center

Show a date-range view with:

- Opening cash.
- Posted Cash In.
- Posted Cash Out.
- Net posted movement.
- Closing cash.
- Committed but unpaid cost.
- Receivables not yet collected.
- Payables due.
- Projected future inflow.
- Projected future outflow.
- Available cash after committed obligations.
- Debt service and financing proceeds.

Every amount must carry a state label: Posted, Committed, Receivable,
Payable, Projected, Forecast, or Estimated.

Provide monthly and project/asset filters. Default to PHP and a consistent
timezone. Show a warning if the user tries to interpret projected revenue as cash.

### 2. Asset Cash-Flow Timeline

For each asset/deal show a chronological timeline containing:

- Owner contribution.
- Acquisition payment.
- Financing proceeds.
- Fees, taxes, and selling expenses.
- Construction payments.
- Rental income or other operating income.
- Pre-selling collections where linked.
- Loan repayments and interest.
- Sale proceeds.
- Refunds and reversals.

Show each event's source record, account, direction, status, proof, and whether it
is actual or projected. Include asset totals for paid cost, remaining cost, debt,
posted income, posted expenses, projected revenue, and realized profit.

### 3. Construction Project Cash Flow

For a construction project show:

- Contract value and approved budget.
- Contingency and retention.
- Planned cost by phase.
- Committed cost by phase.
- Paid cost by phase.
- Forecast final cost.
- Budget variance.
- Construction Cash Out entries.
- Upcoming invoices and due dates.
- Linked asset and pre-selling project.
- Collections from linked pre-selling units.
- Cash required to complete.
- Progress percentage versus paid percentage.

Use a warning when paid progress materially exceeds physical progress or when
committed plus forecast contingency exceeds approved budget.

### 4. Pre-Selling Project Cash Flow

For each pre-selling project show:

- Contracted and reserved unit value.
- Reservation collections.
- Down-payment/equity collections.
- Paid versus pending schedules.
- Construction cost paid.
- Construction cost remaining.
- Cost per unit and cost per square metre where data allows.
- Expected collections by month.
- Expected project cash need.
- Expected margin, explicitly marked projected.

Link a payment to one cash entry only. A payment marked paid must not be counted
as collected again if its cash entry already represents the same movement.

## Data Model

Use normalized records with these concepts:

- `portfolio_accounts`: owner, type, opening balance, as-of date, currency.
- `cash_entries`: date, account, direction, positive amount, category, purpose,
  subcategory, description, counterparty, reference, status, proof, links, and
  reversal metadata.
- `cash_entry_links`: optional normalized links to asset, project, phase, vendor,
  invoice, preselling project, unit, payment, or transaction.
- `construction_projects` and `construction_phases`: budget and progress values.
- `construction_invoices` and `construction_change_orders`.
- `asset_cashflow_events`: derived or materialized read model only if needed; do
  not create duplicate balance-affecting entries.
- `cashflow_periods` or a query/read model for monthly rollups if performance
  requires it.
- `portfolio_proofs`: private image metadata and storage path.
- `portfolio_audit_events`: immutable action history.

Use `js/portfolio_ledger.js` as the shared pure rules module. Account balance is:

`opening balance + posted Cash In - posted Cash Out`.

Projected values must not enter this equation. Reversals are explicit posted
opposite entries linked to the original. Transfers should be one user-facing
record with linked internal account sides when two balances must change.

## Better User Flow

### Overview to detail

1. User opens Portfolio Overview.
2. User selects a date range or project/asset.
3. User sees cash position plus a clear explanation of actual versus future cash.
4. User clicks a number such as Construction Paid.
5. System opens the filtered ledger and shows the related project/phase entries.
6. User clicks an entry to see proof, source, linked records, and reversal history.

### Posting a construction payment

1. Click `New Cash Entry`.
2. Select Cash Out.
3. Select Construction Project.
4. Select project, phase, vendor, and invoice.
5. Enter amount, date, reference, and description.
6. Upload an image proof.
7. Preview account balance after posting and project paid/remaining cost.
8. Confirm Post.
9. Show one ledger entry and one linked construction cost, with no double count.

### Posting a pre-selling collection

1. Click `New Cash Entry`.
2. Select Cash In.
3. Select Pre-Selling Project.
4. Select unit and payment schedule item if available.
5. Enter amount, date, method, counterparty, and reference.
6. Upload deposit/transfer proof.
7. Confirm Post.
8. Update account cash, project collections, unit payment status, and monthly
   forecast exactly once.

## UI Requirements

- Use modal or drawer only if it remains usable on mobile; use a dedicated detail
  view for complex timelines.
- Use a flow indicator: Account → Direction → Purpose → Link → Proof → Review →
  Post.
- Disable dependent selects until their parent has a value.
- Use dropdowns populated from valid current records, not manually typed IDs.
- Show a balance-after-post preview before confirmation.
- Keep filters visible and preserve them when opening/closing details.
- Use desktop tables with sticky date/asset columns and mobile cards or a
  contained horizontal table. Never create page-level horizontal overflow.
- Use green/blue for positive cash and committed/forecast values only with clear
  labels; do not rely on color alone.
- Show empty, loading, stale, error, permission, proof-upload, and offline states.

## Security and Audit

- Only authorized admin/super-admin users may add, post, reverse, or alter
  balance-affecting records according to the configured permission policy.
- RLS must isolate the ES Realty owner/workspace.
- Posted records cannot be deleted or silently edited.
- Proof images use private storage and signed access.
- Every post, reversal, void, link/unlink, proof upload, and migration has an
  audit event.
- Do not expose service-role credentials in frontend code.

## Required Tests

Add deterministic fixtures and E2E tests for:

- Opening balance, monthly rollup, Cash In, Cash Out, reversal, and transfer.
- Asset timeline totals and source links.
- Construction planned/committed/paid/forecast/variance calculations.
- Pre-selling collections and no-double-counting behavior.
- Future projected inflows/outflows separate from posted balances.
- Filters by date, account, asset, project, status, and direction.
- Balance-after-post preview and insufficient-cash warning.
- Proof image acceptance/rejection and secure metadata.
- Permission denial and audit history.
- Desktop and mobile widths: 320, 375, 390, 414, 768, 1024, 1400, 1920.

## Acceptance Criteria

The feature is complete only when:

- A user can trace every posted peso from account to asset/project and back.
- Portfolio Overview clearly separates actual cash from future/projected values.
- Construction and pre-selling totals reconcile with the ledger without duplicates.
- Asset/project timelines are filterable, readable, responsive, and source-linked.
- Reversal and proof workflows are auditable and permission-protected.
- Migration from existing transactions and pre-selling payments is deterministic.
- Existing ES Realty tests remain green and new cash-flow tests pass.
