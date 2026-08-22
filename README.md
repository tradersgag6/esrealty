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

### Facebook Lead Ads \u2192 CRM\n\nLead forms on Facebook can flow straight into the CRM:\n\n1. Deploy the webhook function and set secrets:\n   ```\n   supabase functions deploy fb-leads\n   supabase secrets set META_VERIFY_TOKEN=<random-string> \\n     META_PAGE_TOKEN=<page-access-token> \\n     META_APP_SECRET=<app-secret> \\n     FB_LEADS_DEFAULT_BROKER_EMAIL=<broker-to-assign>\n   ```\n2. In Meta Events Manager \u2192 Webhooks, subscribe to the **leadgen** field with callback URL\n   `https://<project-ref>.supabase.co/functions/v1/fb-leads` and use the same verify token.\n3. Leads arrive deduplicated (`fb-<leadgen_id>`), tagged source **facebook**, auto-assigned,\n   and trigger a bell notification for the assigned broker.\n\n### Email / SMS dispatch\n\nBell notifications can also go out by email (Resend) and SMS (Semaphore, PH):\n\n1. Deploy and set keys:\n   ```\n   supabase functions deploy notify-dispatch\n   supabase secrets set RESEND_API_KEY=<key> MAIL_FROM="ES Realty <you@yourdomain.com>" \\n     SEMAPHORE_API_KEY=<key> NOTIFY_DISPATCH_SECRET=<random-string>\n   ```\n2. Run `supabase/notify_dispatch.sql` (adds dispatch-tracking columns; contains a\n   commented pg_cron block that auto-calls the function every 5 minutes).\n3. Behavior: emails go to every user with an address; SMS only for **approval** and\n   **lead** types to profiles with a phone number. Sent items are stamped so nothing\n   double-sends. Without keys the function safely no-ops.\n\n## Data & privacy

Local demo mode stores test state in browser storage. Authenticated production modules use Supabase with row-level security; Sales Playbooks use the dedicated `sales_playbooks` table and are restricted to approved Super Admin profiles. Never use demo accounts or browser storage for production credentials.
