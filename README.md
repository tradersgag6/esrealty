# ES Realty — AI Real Estate Investment Intelligence (Philippines)

A client-side, single-page application for Philippine real estate investment analysis and brokerage operations: feasibility, financing, risk, scenario modeling, appraisal, portfolio management, CRM, transactions, and a public storefront. No build step — static hosting only. Runs standalone with local demo data, or connects to Supabase for authentication, role-based access control, and cloud persistence.

## Features

- **Investment Wizard** — 7 guided steps: property, location, purchase & financing, development, sales & rental, comparables, then run the AI-style analysis.
- **Deal Analysis** — overview, AI assistant rationale, returns (IRR, ROI, cash flows), development budget, financing amortization, scenarios, location scoring, and risk flags.
- **Appraisal Suite** — comparables with AI-suggested adjustments, sales/cost/income approaches, reconciliation with final value confirmation, SVG charts, print-ready PDF report, Excel exports, certification workflow with audit trail.
- **Portfolio** — save deals and track holdings.
- **AI Assistant** — rule-based investment copilot with context from the current deal.
- **Reports** — executive summary and feasibility report with print/CSV export.
- Light/dark themes, Philippine admin regions/provinces/cities dataset, peso formatting.

## Tech

- Plain HTML/CSS/JS (ES2017+), no frameworks, no build tooling.
- [Supabase JS v2](https://supabase.com/docs/reference/javascript) — vendored locally under `vendor/supabase/`; the app has no JavaScript CDN dependency.
- [Leaflet 1.9.4](https://leafletjs.com/) — vendored locally under `vendor/leaflet/`.
- Google Fonts (Inter) via CDN — optional; falls back to system fonts.
- Live map tiles (CARTO), geocoding (OpenStreetMap Nominatim) and the OSM embed map require an internet connection; everything else works offline.

## File structure

```
.
├── index.html              # App shell
├── assets/
│   └── favicon.svg
├── css/
│   └── styles.css          # App + storefront + playbook styles
├── js/
│   ├── data.js             # PH regions, city maps, constants
│   ├── core.js             # Financial/valuation engine
│   ├── app.js              # Admin app: views, bindings, role access
│   ├── storefront.js       # Public storefront pages
│   ├── listings-api.js     # Public listings REST API client
│   └── supabase-config.js  # Supabase URL + publishable key
├── supabase/               # SQL migrations + edge functions (see setup below)
├── market-scan/            # Market Scan API (Vercel serverless)
└── vendor/
    ├── leaflet/            # Vendored Leaflet
    └── supabase/           # Vendored Supabase JS v2
```

## Run locally

Any static server works. For example:

```bash
npx serve .          # or: python -m http.server 8080
```

Then open `http://localhost:8080`. (Opening `index.html` directly via `file://` also works for most features.)

## Deploy

It's a static site — drop the folder on any static host:

- **Netlify** — drag the folder into [app.netlify.com/drop](https://app.netlify.com/drop).
- **Vercel / Cloudflare Pages** — import the repo or upload the folder.
- **GitHub Pages** — push to a repo and enable Pages from the branch/root (a `.nojekyll` file is included so paths are served as-is).

No configuration, build command, or environment variables are required.

## Supabase Setup

The Supabase browser client is configured in `js/supabase-config.js` using a publishable key only. Before enabling server-backed auth and persistence, run `supabase/schema.sql` in **Supabase Dashboard -> SQL Editor**. The migration creates user profiles, owner-scoped state, audit events, a private document bucket, and row-level security policies.

Never put an `sb_secret_...` or service-role key in this project. Promote administrators only through the SQL Editor using the commented command at the bottom of `supabase/schema.sql`.

Run `supabase/patch_registration_approval.sql` after the initial schema to enable registration approval. New accounts are created as `pending`; an approved `super-admin` can open **Users & Access**, assign a role, and approve or reject each registration. Existing super-admin profiles are marked approved by the patch.

Run the core scripts in `supabase/` in this order: `schema.sql`, `patch_registration_approval.sql`, `crm_leads.sql`, `shared_listings.sql`, `sales_playbooks.sql`, `seed_playbooks.sql`, `notifications.sql`, `preselling.sql`, `team_performance.sql`, `cobroking.sql`, `pms_normalized.sql`, `patch_presell_buyer_link.sql`, `patch_presell_financing.sql`, and `security_hardening.sql`. For the public listings REST API, continue with `listing_platform_schema.sql` and `listing_api.sql`, then deploy the `listing-api` Edge Function using its README. Existing Supabase projects must run these patches in the SQL Editor; updating the static files alone does not change deployed database policies.

### SEO \u0026 PWA\n\n**Search visibility** \u2014 deploy the meta/JSON-LD endpoint once:\n   ```\n   supabase functions deploy seo\n   supabase secrets set SITE_URL=https://tradersgag6.github.io/esrealty\n   ```\n- Crawlable listing pages: `https://<ref>.supabase.co/functions/v1/seo/property/<id>`\n  (full OG tags + RealEstateListing JSON-LD, then redirects into the app).\n- Sitemap for Search Console: `/functions/v1/seo/sitemap.xml` (also linked from robots.txt).\n\n**Installable app (PWA)** \u2014 ships automatically: manifest + service worker are wired.\nVisitors get Add-to-Home-Screen; agents get offline map tiles and fonts after first use.\n\n### Facebook Lead Ads \u2192 CRM\n\nLead forms on Facebook can flow straight into the CRM:\n\n1. Deploy the webhook function and set secrets:\n   ```\n   supabase functions deploy fb-leads\n   supabase secrets set META_VERIFY_TOKEN=<random-string> \\n     META_PAGE_TOKEN=<page-access-token> \\n     META_APP_SECRET=<app-secret> \\n     FB_LEADS_DEFAULT_BROKER_EMAIL=<broker-to-assign>\n   ```\n2. In Meta Events Manager \u2192 Webhooks, subscribe to the **leadgen** field with callback URL\n   `https://<project-ref>.supabase.co/functions/v1/fb-leads` and use the same verify token.\n3. Leads arrive deduplicated (`fb-<leadgen_id>`), tagged source **facebook**, auto-assigned,\n   and trigger a bell notification for the assigned broker.\n\n### Email / SMS dispatch\n\nBell notifications can also go out by email (Resend) and SMS (Semaphore, PH):\n\n1. Deploy and set keys:\n   ```\n   supabase functions deploy notify-dispatch\n   supabase secrets set RESEND_API_KEY=<key> MAIL_FROM="ES Realty <you@yourdomain.com>" \\n     SEMAPHORE_API_KEY=<key> NOTIFY_DISPATCH_SECRET=<random-string>\n   ```\n2. Run `supabase/notify_dispatch.sql` (adds dispatch-tracking columns; contains a\n   commented pg_cron block that auto-calls the function every 5 minutes).\n3. Behavior: emails go to every user with an address; SMS only for **approval** and\n   **lead** types to profiles with a phone number. Sent items are stamped so nothing\n   double-sends. Without keys the function safely no-ops.\n\n## Data & privacy

Local demo mode stores test state in browser storage. Authenticated production modules use Supabase with row-level security; Sales Playbooks use the dedicated `sales_playbooks` table and are restricted to approved Super Admin profiles. Never use demo accounts or browser storage for production credentials.
**Map view & geocoding:** the storefront Properties page has a **Map** mode (price pins, popups). Admins: Brokerage > Inventory > **Auto-locate** batch-geocodes listings missing coordinates via OpenStreetMap Nominatim (max 8 per click; 1.1s between requests).

## Modules & recent additions

- **Appraisal (PVS/BSP-aligned)** — TRAIN tax pack (CGT/DST/transfer on governing base, ±10% zonal band), collateral/forced value + LTV, 14 adjustment elements with AI suggestions, 2026 RCN table w/ soft costs & entrepreneurial incentive, EA/EL depreciation suggester, GRM + DCF income approaches, approach-applicability matrix, ₱10k rounding + range-spread guard, comp QC (verification / distance / duplicates), RESA-format report with bank cover page and photo appendix.
- **CRM / Leads** — pipeline board (7 stages), calendar mode, buyer qualification fields, PH lead sources (portals/Pag-IBIG/LEANS), overdue follow-up badges + stat tile, quick Mark Lost, +63 phone normalization with Call/WhatsApp/Viber links, won→Transaction conversion, duplicate warnings, CSV export, printable call sheet, Weekly Broker Digest (print/email).
- **Market Scan** — live listings from DotProperty/MyProperty (+3-page pagination), web-search fallback, per-source health chips, live median benchmarks built from observed listings; local Node engine (market-scan/start_market_scan.cmd) auto-falls back to the hosted Vercel deployment.
- **Store Locator (Market Scan)** — real geocoded OSM branch records for convenience/grocery/mini chains; bounded Overpass sweep prevents Nominatim's 40-result truncation, with Nominatim fallback; location scope uses coordinate containment (city/province/region, whole-word chain matching); `minBranches` gate; honest per-chain `coverage[]` statuses; per-branch Google Maps links + lazy embeds; endpoint `/api/market-scan/stores` (24h cache, controlled refresh, single-flight, stale fallback; Vercel mirror `maxDuration: 60`).
- **Market Price Index** — nightly GitHub Action snapshots median ₱/sqm per city into \data/market-index.json\; City Price Index card charts trends; appraisal Time adjustments cite the index when available.
- **Buyer Portal** — reservations, saved properties, inquiries KPIs.

## Tests

Headless-Chrome regression suite lives in \	ests/\ (requires Chrome + the local server on :8931):

`powershell
powershell -File tests\run_all.ps1                 # all tests, desktop
powershell -File tests\run_all.ps1 -Mobile         # mobile viewport pass
powershell -File tests\run_all.ps1 -Test crm_core_e2e
`

## Cloud runbook

1. SQL migrations: run files in \supabase/\ in README order inside the Supabase SQL Editor.
2. Edge functions: deploy \listing-api\, \seo\, \
earby-scan\, \
otify-dispatch\ (sources under \supabase/functions/\). Secrets: \RESEND_API_KEY\ (Resend), optional \MAIL_FROM\, \SEMAPHORE_API_KEY\, \NOTIFY_DISPATCH_SECRET\.
   - notify-dispatch supports a **self-send mode**: POST {to, subject, html} with a user JWT emails that same account (Resend sandbox: only your Resend signup address until a domain is verified).
3. Market Price Index job: enable GitHub Actions; workflow \.github/workflows/market-index.yml\ runs daily 02:30 PHT and commits \data/market-index.json\. Local one-off: \
ode market-scan/build-index.js\.
