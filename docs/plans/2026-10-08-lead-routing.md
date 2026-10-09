# Lead Routing & Service Flow — Plan

Date: 2026-10-08
Status: **draft for approval**

## The flow (user-confirmed)

1. User submits from the storefront value guide.
2. Super-admin receives the lead in the CRM — everything lands here first, manually routed.
3. Super-admin assigns the lead to a broker.
4. The broker may:
   - transact the requested service themselves (appraisal work and brokerage are both theirs to do), or
   - assign the lead to an agent on their own team (strict hierarchy: agent -> one broker -> super-admin).

Audit trail on every step. Broker and super-admin can both record that the lead's requested service was transacted.

## What already exists (verified in code)

| Piece | Where | Status |
|---|---|---|
| Lead POST from estimator | `supabase/functions/location-report/index.ts` -> `crm_leads` | ✅ |
| `created_by` = super-admin | location-report:651 | ✅ |
| Super-admin sees all leads | `js/app.js leadScope()` — no filter for super-admin | ✅ |
| Lead assignment (`assignedToId`) | `renderLeads` assignment control, app.js:13632-13694 | ✅ flat |
| Broker sees own team's leads | `leadScope()` broker branch (12993-13004) | ✅ |
| Agent sees only own leads | `leadScope()` agent branch (12988-12992) | ✅ |
| Appraisal module w/ status + audit | app.js:7014+ (`appraisalStatusBadge`, `appraisalAudit`) | ✅ |
| Hierarchy links | agent profile `broker` field; `brokerTeamMembers()`; `agentLinkedBroker()` | ✅ |
| Lead `payload.activity` array | location-report:672 | ✅ |

## What the plan adds

### A. Two-path inquiry split (the earlier Task 13 work)

- **Storefront** (`js/estimator.js`): replace the single CTA with two:
  - "Request an appraisal consultation" -> `leadKind = "appraisal"`
  - "Talk to a licensed broker" -> `leadKind = "broker"`
- **Backend** (`location-report/index.ts`): map
  - `appraisal` -> `professional-appraisal-request` (existing)
  - `broker` -> `broker-consultation` (new)
  - "Email my guide" stays `location-analysis`
  - both new types flow through the summary, `channel`, email subject, and activity line.

### B. Hierarchy-scoped assignment

- **Super-admin** may assign to any broker. Picker filters profiles by role `broker`.
- **Broker** may assign to agents whose profile `broker` equals the broker's own id — `brokerTeamMembers()` already returns exactly that set.
- **Agent** cannot reassign.
- Enforcement lives in the assignment path (`bindLeads` / the assignment handler): check the actor's role before writing `assignedToId`, and scope the picker by the same rule.

### C. Audit trail

- Every assignment writes an entry to `payload.activity`:
  - `{ date, text: "Assigned to BROKER_NAME by SUPERADMIN_NAME" }`
  - `{ date, text: "Assigned to AGENT_NAME by BROKER_NAME" }`
- Appended in the same place `location-report` writes the initial activity, so the trail lives on the lead and is versioned with it.

### D. "Transact the service" recording

- A lead-level action: **Mark service transacted** with a note and the acting role (super-admin or broker).
- Writes `payload.serviceTransacted = { by, at, note }` and an activity entry.
- The Appraisal module already records its own completion; this lead-level marker is the outer "this lead's request was fulfilled" flag that a super-admin or broker can set regardless of which module produced the work.

## Scope boundaries

- **Included**: the four items above + tests.
- **Not included** (later tasks): registration/onboarding screens, role nav overhaul, permission matrix beyond assignment. The roles and their nav already exist; we only touch the lead path and the assignment picker.

## Files touched

| File | Change |
|---|---|
| `js/estimator.js` | two-path CTA + `leadKind` payload |
| `supabase/functions/location-report/index.ts` | `broker-consultation` type + activity |
| `js/app.js` | assignment picker scoped by role; audit writes; transact action |
| `tests/estimator_delivery_e2e.js` | both paths asserted |
| new node test | assignment scope + audit logic |

## Order

Backend type -> storefront CTA -> CRM assignment/audit/transact -> tests -> full regression.

## Open question

Should the "Mark service transacted" action be just a record (audit + status), or should it also move the lead's `status` (e.g. `new -> contacted -> working -> completed`)? The lead already has a `status` field and a status UI; I'd wire the transact action to set `status = "completed"` so the funnel reads in one place. Confirm if that's wanted.

**RESOLVED in build:** transact sets `status = "closed"` (the CRM's existing closed/won terminal state) and records `payload.serviceTransacted = { by, byRole, at, service }` plus two activity entries.

## Build status (2026-10-08) — IMPLEMENTED

All four items are built, tested and committed:

1. **Two-path inquiry split** — storefront has "Request an appraisal consultation" and "Talk to a licensed broker" CTAs; payloads label `inquiry_type`/`service_requested` as `professional-appraisal-request` / `broker-consultation` / `location-analysis`. The lead's `serviceRequested` label is shown in the CRM list and detail.
2. **Backend** — `location-report` accepts `broker-consultation`, labels the lead with `serviceRequested` + `serviceTransacted`, and the email subject/filename are service-aware.
3. **Hierarchy-scoped assignment** — super-admin's picker lists brokers only; a broker's picker lists themselves + their team; agents can only manage their own leads (`leadCanEdit` fixed: brokers can route super-admin-created leads down the tree, agents only their own).
4. **Audit trail** — every assignment change appends `Assigned to X by Y (role)` to `payload.activity`; transact appends its own entries.
5. **Transact action** — super-admin or broker marks a lead's requested service transacted; sets status to closed.

Tests: `estimator_delivery_e2e` asserts all three payload labels; `crm_core_e2e` asserts the service label, transact button, and closed state. 40/40 node suites + 9 e2e suites green, bundle rebuilt and in sync.