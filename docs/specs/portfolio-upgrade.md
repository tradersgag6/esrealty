# ES Realty Portfolio Upgrade Prompt

Use this prompt to analyze, design, and implement the next Portfolio release.

## Objective

Upgrade Portfolio from a saved-deal summary into an operating control center for
real-estate assets, cash, development, and pre-selling projects.

The system must let an authorized user:

- See owned, acquired, developing, rented, listed, sold, and archived assets.
- Track money coming into and going out of the business or investment.
- Attach an image or document as proof for each cash transaction.
- Track construction progress, budget, committed cost, actual cost, and variance.
- Link construction activity and costs to a Pre-Selling project and its units.
- Preserve existing investment analysis, financing, Portfolio, Transactions,
  Property Management, and Pre-Selling behavior.

Do not treat this as a cosmetic dashboard-only change. The feature needs a clear
data model, permissions, auditability, calculations, storage behavior, and tests.

## Current System Findings

Before editing, verify the current code because this repository already has
partial capabilities:

- `js/app.js` stores `state.deals` and `portfolioStats()` computes value, loans,
  net worth, cash flow, invested amount, sold profit, and property count.
- `renderPortfolio()` currently displays KPIs and a Deals table. It does not
  provide a cash ledger or construction management workspace.
- `core.js` already calculates development costs, construction cost per sqm,
  financing cost during construction, scenarios, returns, and risk inputs.
- Pre-Selling already has `presell_projects`, `presell_units`, and
  `presell_payments`, including payment schedules and unit statuses.
- Transactions currently represent a sales workflow from reservation through
  completion. Do not confuse a sales transaction with a cash-book entry.
- The document vault and Supabase Storage already support uploaded proofs and
  transaction documents. Reuse the existing secure storage patterns where
  appropriate instead of inventing an unrelated upload system.
- General application state is currently persisted in `app_state`; existing
  cloud and local/demo behavior must remain functional during migration.
- Existing roles include super-admin, broker, agent, buyer, seller, owner, and
  tenant. Financial and construction write permissions must be explicit.

## Required Discovery Before Implementation

1. Inspect `js/app.js`, `js/core.js`, `index.html`, existing CSS, Supabase SQL,
   storage helpers, and related e2e tests.
2. Identify whether the requested Portfolio belongs to one user, one broker,
   one company, or multiple projects/accounts.
3. Record the existing data shape and migration strategy before changing it.
4. Run relevant existing tests before edits and record the baseline.
5. Ask the product owner the scenario questions in the final section before
   making irreversible workflow assumptions.

## Portfolio Information Architecture

Add a clear Portfolio workspace with these areas:

1. **Overview**
   - Total portfolio value.
   - Acquisition cost and total invested capital.
   - Cash on bank and cash on hand.
   - Receivables, payables, committed construction cost, and available cash.
   - Debt, equity, net worth, income, expenses, and net cash movement.
   - Filters for account, asset, project, status, date range, and currency.
   - Explicit labels for actual, committed, projected, and estimated amounts.

2. **Assets**
   - Link to existing saved deals without duplicating the source record.
   - Support ownership share and investment basis where applicable.
   - Show lifecycle/status: planned, acquired, under construction, operational,
     listed, sold, archived.
   - Show linked pre-selling project, construction project, loans, cash entries,
     and documents.

3. **Cash Ledger**
   - Start with one or more bank accounts and an opening balance: how much money
     is currently in each bank. Never infer opening balance from portfolio value
     or projected profit.
   - Record every movement using an explicit direction selector: **Cash In** or
     **Cash Out**. Store amount as a positive number and calculate the balance
     from direction.
   - Cash In must include date, amount, bank account, source/category,
     description, counterparty, reference number, and optional linked asset,
     project, unit, Pre-Selling payment, or sales transaction.
   - Cash Out must require exactly one purpose: **Project Selling**,
     **Construction Project**, or **Others**. Do not allow an uncategorized
     outflow to be posted.
   - **Project Selling** must link to the related property/deal, sales
     transaction, project, or approved selling expense.
   - **Construction Project** must link to a construction project and may link to
     a phase, contractor bill, change order, asset, Pre-Selling project, tower,
     or unit.
   - **Others** must require a specific subcategory and useful description, such
     as operating expense, tax/fee, salary, refund, bank charge, owner
     withdrawal, or transfer.
   - Each entry must include date, amount, direction, account, category,
     description, counterparty, reference number, linked asset/project/unit,
     linked Pre-Selling payment or transaction when applicable, proof status,
     creator, and status.
   - Support draft, pending review, approved, posted, voided, and reversed
     states. Do not delete posted financial records without an auditable reversal.
   - Calculate running balance and opening balance per account.
   - Prevent ambiguous signs: store positive amount plus explicit `in`/`out`, or
     use a rigorously documented signed model consistently.
   - Add filters, search, date ranges, category summaries, and export.

4. **Proof and Documents**
   - Allow image proof such as receipt, deposit slip, transfer confirmation,
     invoice, voucher, or screenshot.
   - Reuse the existing storage security model; do not expose private financial
     documents through public URLs.
   - Store metadata: original filename, MIME type, byte size, checksum if
     available, uploader, upload time, storage path, and proof category.
   - Validate file type and size, reject executable content, and show upload
     progress and failure states.
   - Support preview for safe image types, signed download, replacement, and
     removal according to permissions.
   - A transaction may have zero, one, or multiple proof files. Do not require
     an image for every entry unless the selected workflow requires it.

5. **Construction Projects**
   - Create a construction project linked to an existing Portfolio asset or
     Pre-Selling project.
   - Track project name, site, contractor, architect, permit status, start date,
     target completion, actual completion, contract value, contingency,
     retention, and project status.
   - Track phases such as land/site preparation, foundation, structure,
     architectural works, MEPF, finishes, external works, permits, and turnover.
   - Track each phase's planned budget, approved budget, committed amount,
     paid amount, remaining amount, percentage complete, start/end dates,
     responsible party, notes, and proof documents.
   - Support change orders separately from the original contract and identify
     who approved them.
   - Show budget vs committed vs paid vs forecast final cost, variance amount,
     variance percentage, and contingency remaining.
   - Allow construction cash outflows to create or link a Cash Ledger entry;
     avoid double-counting linked entries.

6. **Pre-Selling Link**
   - Link one construction project to one Pre-Selling project where appropriate.
   - Link phases and costs to the project, tower, unit type, or unit when the
     business needs that detail.
   - Show total construction cost, cost per sqm, cost per unit, paid cost,
     remaining cost, and allocated cost by unit or unit type.
   - Connect reservation/down-payment collections from `presell_payments` to
     cash entries without automatically marking money paid twice.
   - Show project-level cash need, collection progress, construction progress,
     projected completion, and expected margin.
   - Preserve existing unit status and payment schedule behavior.

## Data and Security Requirements

Prefer normalized Supabase tables for new operational records rather than
putting an ever-growing ledger and document payload inside `app_state`.
Provide an idempotent SQL migration with:

- Foreign keys to the owning account/workspace and linked entities.
- Numeric monetary columns with appropriate precision and non-negative checks.
- Explicit direction/status/category constraints.
- Created/updated timestamps and created-by/approved-by fields.
- Indexes for owner, account, date, asset, project, and status.
- Row-level security policies matching the user's role and ownership model.
- Audit events for create, update, approval, posting, voiding, reversal,
  upload, replacement, and deletion.
- Safe migration/backfill from existing portfolio deals where needed.
- No service-role or secret key in browser code.

If the current app's local/demo mode must remain available, define a temporary
local adapter with the same record shape and clearly separate it from the
Supabase adapter. Do not silently lose records when switching modes.

## Accounting and Calculation Rules

- Opening bank balance is entered explicitly and is not treated as income.
- Cash In increases the selected account balance; Cash Out decreases it.
- Account balance = opening balance + posted Cash In - posted Cash Out, with
  transfers represented by linked entries on both accounts.
- Every posted Cash Out has exactly one primary purpose: Project Selling,
  Construction Project, or Others. The selected purpose controls required links.
- Distinguish cash balance from portfolio value, profit, receivables, and
  projected returns.
- Posted cash balance = opening balance + approved/posting inflows - approved/
  posted outflows, with reversals represented explicitly.
- Do not count projected revenue as cash received.
- Do not count a preselling payment as collected until its payment status and
  cash posting rules agree.
- Do not count a construction cost both as a linked payment and as a manually
  entered outflow.
- Use the existing construction and financing calculations where valid, but
  label estimates and assumptions clearly.
- Handle partial payments, refunds, deposits, transfers between own accounts,
  owner contributions, withdrawals, financing proceeds, and loan repayments.
- Define treatment of taxes, fees, retention, advances, and change orders.
- Use a consistent timezone and currency policy; default to Philippine peso if
  that matches the existing application.
- Include an immutable or auditable history for balance-affecting changes.

## Recommended First-Release Flow

Use this flow unless the product owner chooses a different scenario:

1. **Set up bank**: create/select a bank account and enter its verified opening
   balance, bank name, account label, and as-of date.
2. **Record movement**: select `Cash In` or `Cash Out`, then enter a positive
   amount, date, description, counterparty, and reference number.
3. **Classify outflow**: if `Cash Out`, require exactly one of `Project Selling`,
   `Construction Project`, or `Others`.
4. **Link context**:
   - Project Selling -> property/deal/sales transaction or approved selling cost.
   - Construction Project -> construction project, with optional phase, vendor,
     invoice, asset, Pre-Selling project, tower, or unit.
   - Others -> required subcategory and explanation.
5. **Attach proof**: upload a receipt, transfer slip, invoice, deposit slip, or
   other image/document. Save as pending when approval or proof review is needed.
6. **Review and post**: only posted entries affect the official bank balance and
   totals. Approval and posting permissions must be explicit.
7. **Track history**: show a searchable chronological list containing direction,
   amount, purpose, linked record, proof status, creator, approval/posting status,
   and reversal history.
8. **Correct safely**: fix posted mistakes with a reversal or adjustment linked
   to the original. Never silently rewrite historical balance-affecting entries.

## Recommended First-Release Improvements

- Show a live "balance after this transaction" preview before saving.
- Warn when Cash Out exceeds available posted balance, while allowing an
  authorized approved-overdraft or financing scenario.
- Prevent duplicate posting when a Pre-Selling payment or construction bill is
  already linked to a cash entry.
- Add monthly opening balance, Cash In, Cash Out, closing balance, linked project
  costs, and unexplained/unlinked movement summaries.
- Add reconciliation status so the user can compare system balance with the
  actual bank statement balance.

## UI and UX Requirements

- Keep the existing ES Realty visual language and navigation patterns.
- Make the primary action obvious: add account, record money in/out, add proof,
  start construction project, and link a Pre-Selling project.
- Use a transaction drawer/modal only if it remains usable on mobile; otherwise
  use a dedicated detail view.
- Show empty, loading, saving, upload-progress, error, permission-denied, and
  stale/offline states.
- Use confirmation for posting, voiding, reversing, deleting, and unlinking.
- Make linked records clickable and show the source of every amount.
- Never imply that a projected number is actual cash.
- Support keyboard access, labels, focus states, readable errors, and mobile
  layouts without horizontal overflow.
- Include concise financial disclaimers where estimates or forecasts appear.

## Test-First Plan

Run existing tests before edits and record the baseline. Add deterministic tests
for:

- Portfolio overview with zero records and populated records.
- Account creation, opening balance, inflow, outflow, transfer, and running
  balance calculations.
- Draft/pending/approved/posted/voided/reversed transitions and permissions.
- Partial payment, refund, owner contribution, financing proceeds, and loan
  repayment scenarios.
- Proof upload validation, image metadata, signed access, replacement, and
  failed upload behavior.
- Construction project creation, phase budget, committed/paid/forecast totals,
  change orders, variance, and contingency.
- Link to a Pre-Selling project and unit/payment schedule.
- Linked cash entry does not double-count a pre-selling payment or construction
  cost.
- Existing Portfolio KPIs, deal analysis, Transactions, Pre-Selling, reports,
  Property Management, and stale/cache behavior remain green.
- Role-based access for super-admin, broker, agent, buyer, owner, and tenant.
- Mobile rendering, keyboard access, filter/search behavior, and no horizontal
  overflow.
- Migration/backfill and local/demo fallback behavior.

Use non-network fixtures for data-model and calculation tests. Use e2e tests for
the major user flow and storage/worker response contracts. Avoid assertions on
unstable live totals; assert invariants such as balance, linkage, status, and
document presence.

## Suggested Improvements Beyond the Request

Consider these improvements if they fit the chosen workflow:

- Bank-account reconciliation with statement import or CSV import before any
  direct bank API integration.
- Approval workflow with maker/checker separation for sensitive outflows.
- Duplicate detection by date, amount, account, reference, and counterparty.
- Recurring expenses, scheduled construction payments, and reminders.
- Vendor/contractor directory with contract, invoice, retention, and payment
  history.
- Budget alerts when committed or forecast cost exceeds approved budget.
- Monthly cash-flow forecast and runway view.
- Project dashboard with earned-progress vs paid-progress warning.
- Document expiry reminders for permits, insurance, contracts, and licenses.
- Exportable audit report and accountant-friendly CSV.
- Reconciliation status: unreconciled, matched, adjusted, and exception.
- Activity timeline showing who changed each financial or construction record.
- Soft-delete/archive policy instead of destructive deletion.
- Searchable global links between asset, deal, transaction, preselling unit,
  construction phase, cash entry, and proof document.

## Product Owner Scenario Questions

Answer these before implementation so the workflow is designed around the real
business process:

1. Who owns the cash: one personal investor, ES Realty, a broker team, or a
   separate project/company account?
2. Which accounts must be tracked first: bank accounts, cash on hand, e-wallets,
   escrow, project-specific accounts, or all of them?
3. Who can add an entry, who can approve it, and who can post or reverse it?
4. Should an entry be considered real immediately after saving, or only after
   approval and proof review?
5. Confirm this preferred first-release workflow:
   `Create/select bank -> enter opening balance -> choose Cash In or Cash Out ->
   enter amount/date -> if Cash Out choose Project Selling, Construction Project,
   or Others -> link the selected record -> attach proof -> save pending or post
   -> update bank balance and searchable transaction history.`
6. For Cash In, which sources are needed first: buyer/reservation payment, rental
   income, loan proceeds, owner contribution, commission, refund, or other income?
7. For Cash Out under Project Selling, should the required link be a property,
   deal, sales transaction, commission, marketing cost, tax/fee, or refund?
8. For Cash Out under Construction Project, should the user select project first,
   then phase, contractor/vendor, invoice, and payment amount?
9. For Cash Out under Others, which subcategories should be available first?
   Recommended defaults: operating expense, salary, tax/fee, bank charge,
   owner withdrawal, refund, transfer, and miscellaneous approved expense.
10. Is construction managed per property, per Pre-Selling project, per tower,
   per unit type, or down to each unit?
11. Should construction costs be allocated to units by equal share, floor area,
   actual unit scope, or a manual allocation?
12. Which stages and cost categories must be mandatory in the first release?
13. Do you need actual accounting periods, tax/VAT treatment, withholding tax,
   retention, and official receipts now, or only management-level tracking?
14. Should money transfers between the company's own accounts appear as two
   ledger entries or one transfer record with linked sides?
15. What proof files are common, what maximum file size is acceptable, and who
   must be allowed to view them?
16. Do existing `transactions` and `presell_payments` already contain real data
   that must be migrated, or are they test/demo records?
17. Which single dashboard decision matters most: available cash, project
   overrun, preselling collections, profit, debt, or upcoming payments?
18. Choose the preferred first-release scenario:
    - **A. Investor portfolio**: assets + personal bank/cash + investment costs.
    - **B. Brokerage operations**: agency cash + commissions + deal expenses.
    - **C. Developer/pre-selling**: project cash + construction + unit payments.
    - **D. Hybrid**: all three, with strict account/project separation.

## Deliverables

Produce:

1. A short current-state audit and chosen workflow assumptions.
2. A data model and idempotent Supabase migration with RLS and audit design.
3. Updated Portfolio UI and interactions.
4. Cash ledger, proof upload/storage, and balance calculations.
5. Construction project tracking linked to Pre-Selling.
6. Migration/local adapter strategy if required.
7. Deterministic fixture tests, targeted e2e tests, and full regression results.
8. Updated documentation describing actual vs projected values, permissions,
   proof handling, and known limitations.

Do not claim the feature is complete until the end-to-end scenarios, security
rules, calculations, storage behavior, migration behavior, and existing suite
have all been tested.
