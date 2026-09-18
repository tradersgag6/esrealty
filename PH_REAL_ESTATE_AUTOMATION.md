# Automate a Philippine Real Estate Business — Step-by-Step Playbook

This is a two-part document.
- **Part A** is a single "master prompt" you can paste into any AI coding agent (your opencode agents, ChatGPT, Claude, etc.) to have it build/automate your stack.
- **Part B** is the full step-by-step blueprint that Part A is based on, so you understand *why* each step exists.

---

## Part A — Master Prompt (copy-paste this)

> Act as an experienced real estate operations architect for the **Philippines**. Build me a complete, legally-aware automation stack for my real estate business and lay it out step by step as an implementation roadmap I can execute in phases.
>
> Cover ALL of the following, in order, with concrete tools, SOP patterns, and config specifics for PH:
>
> 1. **Compliance foundations** — RA 9646 (Real Estate Service Act): PRC broker licensing, corporate license (a licensed broker must run/be nominated by the entity), SEC/DTI registration, mayor's permit, DHSUD (formerly HLURB) License-to-Sell for any subdivision/condo public offering (pre-selling is not allowed without it), buyer protection bond, notarization, and a compliance checklist for social media ads (name the licensed broker + "for sale" disclosures).
> 2. **Lead generation automation** — property portals (Lamudi, Property24, MyProperty.ph, DotProperty), Facebook Marketplace + Groups, TikTok/Reels local walkthroughs, Google Business Profile, SEO/blog for kw searches, and a posting/repurposing workflow. Define a "lead pipeline contract": each lead must land in ONE CRM with source, campaign, and timestamp.
> 3. **Lead capture & CRM** — a shared CRM (I already have a self-hosted CRM with a leads module, market-scan, and Deal Analysis/Feasibility). Spec the required fields, pipeline stages, duplicate-merge rules, and per-lead evidence ledger.
> 4. **AI agent follow-up engine** — a self-scheduled autopilot that books its own next-recheck per lead (stale-new/contacted/site-visit/negotiation/dormant), only records OBSERVED facts as confident, and turns weak observations into human-approve/reject suggestions rather than fabricating. Integrate WhatsApp Business API + Viber + email drip templates (PH customer tone, Taglish variants).
> 5. **Qualification & appointment automation** — IDD scoring for PH buyers (budget band, financing source: Pag-IBIG/loan/bank/in-house, location radius, abroad+OFW status, timing), calendar booking (Cal.com/Calendly), instant reminders, and a no-show recovery sequence.
> 6. **Deal courting & site visits** — visit scheduler with reminders, mobile-optimized comparative map, feasibility output (transport/commercial/peg values from my market-scan + feasibility studio), and photo/video evidence collection.
> 7. **Negotiation, offers & documentation** — offer-to-reservation workflow, reservation agreement, Contract-to-Sell, payment schedule automation, DHSUD required disclosures, E-sign (SignNow/DocuSign variants) with eStamp readiness.
> 8. **Closing & finance** — downpayment/stage payment triggers, BIR taxes (6% CGT for a capital asset, 12% VAT for a dealer; DST on the deed; verify current rates with a PH accountant), transfer of title (LRA e-Title/DENR e-titlewhere available, Registry of Deeds), unpaid-tax/realty tax (RPT) settlement, move to escrow or bank handling as appropriate.
> 9. **Post-sale & referrals** — move-in checklist, rent/lease or management automation if applicable, post-sale NPS/survey, referral-loop automation, and Google review generation.
> 10. **Scale layer** — dashboards (lead→inquiry→visit→reservation→closing funnel, revenue forecast), weekly AI sales-coach review, team SOP playbooks, QA on compliance (ads disclosure, title checks), and what to outsource vs automate.
>
> Output format: a phased roadmap (Phase 0 → Phase 8) with, for each phase: objective, exact automations to build, the tool/API to use, a definition-of-done, and a 1-hour "do this today" starter. End with a KPI sheet and a 12-month timeline. Flag anything that MUST involve a licensed professional (broker notarization, title transfer, BIR filing) so I never fully automate those.

---

## Part B — The Step-by-Step Blueprint

### Phase 0 — Legal & Compliance Foundation
Purpose: nothing scales if the entity can't legally sell or broker.

- **Licensing (RA 9646, "Real Estate Service Act")**
  - Individual brokers: PRC Real Estate Broker license (pass the board, CBRA endorsement).
  - Entity (sole prop/partnership/corp): SEC or DTI registration, then the entity must **nominate a duly licensed broker** (Corporate Broker) and register with PRC/Department of Human Settlements for broker practice. A corporation cannot act as broker without the licensed broker.
  - Renewals and CPE hours — automate reminders (your CRM can hold license-expiry dates).
- **Project/Lot marketing**
  - Selling **pre-selling lots/condos/subdivisions**: obtain a **DHSUD Certificate of Registration and License to Sell** for the project before accepting any reservation/DP. Selling without it is a violation.
  - For **own RFO (ready-for-occupancy)** properties, still keep the project registration current where applicable.
- **Business permits**: Mayor's permit, BIR registration (VAT or non-VAT), bank account, barangay permit.
- **Ad compliance boilerplate**: every online listing shows the licensed broker's name + license number and proper project accreditation (DHSUD) when required. Automate via a listing template with the fields locked in.
- **Buyer protection bond** for pre-selling projects (required by DHSUD) — keep current.
- **Define your offering**: are you a broker (3rd-party commissions), a developer (own projects), or a rental/property manager? Each has different licensing + tax treatment. Pick one to start.

### Phase 1 — Lead Generation Automation
Goal: a repeatable inflow with measurable sourcing.

| Channel | Mechanics |
|---|---|
| Lamudi / Property24 / MyProperty.ph / DotProperty | Refresh ads on a schedule; use their API/CSV exports where available; keep photos/videos consistent |
| Facebook Marketplace + Groups | Auto-post format (12-photo template + caption) to curated PH property groups |
| TikTok / Reels | 60–90s walkthroughs + "cost to rent a 3BR in QC" hooks; post 3–5×/week on a content calendar |
| Google Business Profile | Services, posts, review links; local SEO ("for sale Bacoor", "condo for rent Makati") |
| Email/WhatsApp nurture | Drip lists segmented by budget band and timeline |

**Automate**: a content repurposer (1 video → 3 captions, 5 images, 1 listing), a posting scheduler, and a tracker that stamps every lead with `source`, `campaign`, and `ts` at capture. Root rule: **one lead, one record, one owner**.

### Phase 2 — Lead Capture & CRM
Use your existing CRM (you already have a leads module). Enforce:
- Pipeline: New → Contacted → Qualified → Site Visit → Negotiation → Reservation → Docs → Closed.
- De-duplication: match on phone + email, merge duplicates automatically.
- **Evidence ledger per lead**: every fact carries `source` (observed vs claimed) and confidence. Nothing the agent "infers" becomes truth without an observed source.
- Auto-tagging: OFW/abroad (likely Viber/WhatsApp international), investor vs end-user, budget band, city of interest.

### Phase 3 — AI Agent Follow-up Engine (your CRM Autopilot)
Your existing "CRM Autopilot" already implements the right discipline. Extend it for PH:
- **Self-scheduled rechecks** with a ladder: stale-new (no touch ≥2d, recheck +2d) → contacted (follow-up due today) → site-visit (before + after the visit) → negotiation (≥4d without movement, +2d) → dormant (+7d) → closed (stop).
- **No fabrication rule**: confident observations only. Weak signals produce Approve/Reject suggestions for you.
- **Channel integration in priority order for PH**: WhatsApp Business API (most-used), Viber (strong in PH, esp. overseas), then email/SMS. Use template messages (Taglish tone) that vary by stage:
  - New: "Good day! This is [Name] from [Firm]. Re: [Listing] — is this still going to be your first home / investment?"
  - Missed visit: "Missed you today! No worries — want a fresh video walkthrough or a rebook?"
  - Negotiation: "Your broker, [listing/seller] countered at [₱xxx]. Shall I send the revised payment scheme?"
  - Dormant: "We haven't chatted in a while — I removed nothing; your saved listing [X] is still available."
- **Always remind on compliance**: each message can mention your firm + licensed broker; never overpromise financing, zoning, or returns.

### Phase 4 — Qualification & Appointments
- **IDD scoring** for PH buyers:
  - Budget band vs listing, financing: **Pag-IBIG** (membership + 2-yr SAP always present → approx. max loan), bank loan, in-house / assumption, or cash.
  - OFW status (abroad → Viber/WA timing to their night; often cash-heavy).
  - Location radius and target city; timing (move-in within months vs years).
- **Booking automation**: Cal.com/Calendly with your Google Calendar; auto reminder at T-24h and T-1h; quick reschedule link.
- **No-show recovery**: auto-sequence (SMS/WA: "We still saved your slot; rebook in one tap").

### Phase 5 — Deal Courting & Site Visits
- **Visit scheduler** with per-visit evidence (photo, video, GPS, notes) — mirrors the site-visit module you already have.
- **Comparative maps & feasibility**: use your market-scan + Feasibility studio output (transport time, malls, commercial density, rent/sale peg values) inside the deal context.
- Standardize the tour script → save as SOP: walk-through checklist, document capture, question sheet.
- **Follow-up within 24h**: 3-touch cadence (thank-you + recap, value recap, gentle nudge), each automatically scheduled and logged.

### Phase 6 — Offers, Reservation, Documentation
- Offer → **Reservation Agreement** + reservation fee (watch DHSUD rules on reservation/downpayment for pre-selling) → **Contract-to-Sell**.
- Automate payment schedules (DP + balance + amortization) and reminders; integrate GCash/PayMongo/Dragonpay or bank deposit confirmation for fees.
- ESIGN every document (SignNow / DocuSign / local). Keep a fully notarized paper trail for anything the Registry of Deeds requires.
- Pre-selling: attach the **DHSUD-approved disclosures** + buyer protection bond info to every contracting workflow.

### Phase 7 — Closing & Finance (licensed professionals MUST be involved)
- **Taxes (current rates, confirm with your accountant; rates change and differ by status):**
  - Capital asset (individual, not in real estate business): **6% Capital Gains Tax** on selling price or BIR zonal/fair value, whichever is higher.
  - Dealer / developer (in real estate business): **12% VAT** + DST + income tax instead of CGT.
  - **Documentary Stamp Tax (DST)** on the deed of sale.
  - Real property tax (RPT) on the property up to transfer.
- **Transfer of title**: notarize the Deed of Sale, pay taxes, present to the **Registry of Deeds**; use **eTitle / eStamp** where available (LRA digitization) and keep certified true copies. Verify the title is clean (LRA/lawyer) — flag every land-for-transfer to your lawyer; do not "automate" title transfers.
- Bank/financing: coordinate release of loan proceeds / Pag-IBIG take-out; auto-track the checklist so nothing lapses.
- **Never automate**: BIR filings, notarization, and Registry of Deeds submissions beyond preparing the documents.

### Phase 8 — Post-Sale, Rentals & Referrals
- **Move-in checklist** automation (connection apps, HOA, turnover docs).
- If you do rentals/management: auto rent billing, overdue escalation, maintenance tickets, lease expiry alerts.
- **Referral loop**: NPS survey after closing → referral asks at peak-happiness windows → Google review requests → repeat buyers funnels.
- **Renewal engine** for licenses/bonds/contracts (CRM date-based alerts).

### Scale — Dashboards & Team
- **Funnel KPIs**: leads → inquiries → qualified → visits → reservations → closed, with stage conversion % and $ / lead source.
- **Forecast**: pipeline value × weighted close probability per stage.
- **Weekly AI sales-coach review**: top 5 slow/dormant leads, best-performing ad content, channel ROI.
- **Team SOPs**: written playbooks per role (seller-facing vs buyer-facing), QA monthly on compliance (ad disclosures, representation).

---

## Compliance guardrails (never automate away)
- Licensed broker supervision/execution.
- Notarization and all Registry of Deeds steps.
- BIR filings and tax computations (final figure → licensed accountant).
- DHSUD License-to-Sell and buyer protection bond.
All of the above are outputs a machine can **prepare and remind**, but only a licensed professional can **sign/execute**.

## KPI sheet (track weekly)
| Metric | Target (example) |
|---|---|
| Inquiries / mo | 150+ |
| Lead-to-visit % | 15–20% |
| Visit-to-reservation % | 10–15% |
| Days lead→reservation | < 30 |
| Reservation-to-closed % | 60–70% |
| Cost per inquiry | track by source |
| Response time | < 5 min when online |