# ES Realty — Backend UX-Flow Analysis & Recommendations

Analysis-only. No edits made. Source of truth: reading the backend surfaces and
their frontend consumers — `market-scan/vercel/*`, `supabase/functions/listing-api/index.ts`,
`supabase/check-backend.js`, `js/listings-api.js`, `js/supabase-config.js`,
`js/storefront.js`, `js/app.js` (Market Scan + Store Locator flows).

---

## 1. Backend Surfaces

| Surface | Files | Role in user flow |
|---|---|---|
| **Market Scan** | `market-scan/vercel/api/market-scan.js`, `market-scan/vercel/lib/_lib.js`, `server.js` | Live multi-source property search (DotProperty, MyProperty, web search, social feeds) |
| **Store Locator** | `market-scan/vercel/api/market-scan/stores.js`, `lib/store_chains.js` | OpenStreetMap branch lookup per location |
| **Listing API** | `supabase/functions/listing-api/index.ts` | Catalog list/detail, favorites, inquiries, contacts, managed listings, site settings |
| **Client-side REST** | `js/listings-api.js`, `js/supabase-config.js`, `js/portfolio_cloud.js` | Browser → edge function / Supabase REST |
| **Supporting functions** | `fb-leads`, `seo`, `notify-dispatch`, `admin-create/delete-account`, `nearby-scan` | Not part of the core interactive loop (webhooks/SEO/ops) |

---

## 2. Flow-UX Findings (with evidence)

### 2.1 Market Scan — biggest friction point

**F1 — Long synchronous wait with a single static message.**
The app shows one banner for the whole scan (`js/app.js:10005`
"Scanning sources… first live run can take 15–40s"). The backend already
computes per-source status but returns it only at the end as `sources[]`
(`market-scan/vercel/lib/_lib.js:700`). No streaming, no per-source progress,
no cancel. Verdict: the perceived wait is worse than the real one.

**F2 — Source fetching is partially serial.**
`runMarketScan` awaits `invokeDotProperty` **then** `invokeMyProperty`
sequentially (`market-scan/vercel/lib/_lib.js:600-616`), each up to 8 pages
of sequential `fetchHtml` calls (14s timeout each, `_lib.js:191-215`). Only the
9-source secondary batch is parallel (`_lib.js:627-640`). The two primary
scrapers are independent and could run in parallel via `Promise.all`.

**F3 — Web-search fallback is sequential.**
Google (6s timeout) → DuckDuckGo (10s) → Bing (10s) run one-after-another
(`_lib.js:463-501`), so a blocked/failed Google can add up to ~26s of worst-case
delay before results return.

**F4 — No persisted cache across instances.**
Caching is an in-memory per-instance `Map` (`_lib.js:11`, TTL 900s). A warm
instance helps; a recycled instance replays the full scrape for every query.
Edge `Cache-Control: public, s-maxage=900` (`api/market-scan.js:23`) only helps
exact-repeat URLs — every distinct filter combination re-scrapes.

**F5 — `live` scraping is the default.**
`mergeQueryDefaults` sets `live: true` (`_lib.js:578`), so every scan performs
the full live scrape even when a cached/nearby result would do.

**F6 — `maxDuration` is fine at the platform level, but the wall-time budget is unmanaged.**
`vercel.json:4` already declares `"api/market-scan.js": { "maxDuration": 300 }`,
so scans below 300s are safe and the earlier concern about 504s does NOT apply.
(`api/market-scan/stores.js:27` also sets `maxDuration: 60` in code, which is
redundant but harmless.) The remaining risk is that a 15–40s scan still blocks
the user regardless of the ceiling — see P1/P2.

### 2.2 Listing API — catalog + writes

**F7 — Pagination re-counts the whole set every request.**
`listListings` uses `{ count: "exact" }` (`index.ts:307`) and applies
`range(from, from+perPage-1)` (`index.ts:339`). Every page load recomputes the
total across the full filtered set — pagination saves rows but not the count query.

**F8 — No `Cache-Control`/ETag on GET endpoints.**
`/listings`, `/listings/:id`, `/site-settings` return plain 200 JSON with no
caching headers. Every home/search/detail load re-hits the edge function and
PostgREST. Contrast with `stores.js`, which sets `s-maxage=3600, stale-while-revalidate=86400`.

**F9 — Inquiry pipeline has three chained writes with a silent failure path.**
`submitInquiry` inserts `listing_inquiries` → inserts `crm_leads` → updates the
inquiry with `crm_lead_id` (`index.ts:537-580`). If the lead insert fails, the
error is swallowed (`index.ts:578` `if (!leadError)`): the user still receives
201 "Inquiry submitted", but the rep-assigned lead silently never exists.

**F10 — 429 handling blocks for a full hour.**
Rate-limit rejection returns `Retry-After: 3600` (`index.ts:756`) for the
10-request/hour contact-form window (`index.ts:608-610`). A legit visitor who
submits 10 forms loses the form for an hour. The client-side error presentation
of a 429 should be checked for friendliness (raw "Too many requests" toast vs
"please come back in an hour").

**F11 — Every protected call pays two extra round-trips.**
`authenticate()` does `auth.getUser(token)` plus a `profiles` lookup on every
request (`index.ts:156-170`). No short-TTL in-instance cache for the profile
lookup result.

### 2.3 Patterns already done well (replicate these)

**G1 — Store Locator flow is the model.**
`stores.js` declares `maxDuration`, sets 24h edge cache, supports `refresh=1`
(no-store), and the UI renders Cached/Refreshed/Fresh/Stale badges
(`js/app.js:9916`) with a manual refresh button (`js/app.js:10331`). This is
exactly the two-tier freshness model Market Scan should adopt.

**G2 — Fallback host chain.**
`msFetch`/`msStoresFetch` fall back Local → Cloud automatically
(`js/app.js:9722-9734`).

**G3 — Clean mapping layer.**
`js/portfolio_cloud.js` is a pure to-DB/from-DB mapper with no flow logic —
keeps sync deterministic and testable.

---

## 3. Recommended Flow Improvements (priority order)

### P1 — Two-tier Market Scan (biggest UX win)
Serve the last snapshot instantly and refresh in the background, exactly like the
Store Locator:
- Cache normalized scan results keyed by query
  (city, type, mode, price/area/beds bounds, maxResults).
- On a scan request: return cached snapshot with a `cached`/`fetchedAt` flag,
  then trigger a background re-scrape; mark the response `stale` while it runs.
- Surface `cached | fresh | stale | refreshed` badges in the results header
  (reuse the Store Locator badge logic at `js/app.js:9916`).
- Keep a manual "Refresh live data" action (as `stores.js refresh=1`).

Impact: 40s blank → instant paint with freshness indicator. No schema change.

**Implementation requirements (so this actually ships):**
1. Shared cross-instance store is REQUIRED — the in-memory `Map` (`_lib.js:11`) is
   per-instance and a recycled instance loses everything. Vercel serverless
   filesystem is read-only except `/tmp` (not shared). Adopt **Vercel KV** by adding
   the dependency and env vars (package.json currently has zero deps):
   ```
   cd market-scan/vercel
   npm i @vercel/kv                 # adds to package.json (deploy installs it)
   # provision a KV store in the Vercel dashboard for the esrealty project, then:
   # add KV_REST_API_URL + KV_REST_API_TOKEN to the project's Environment Variables
   ```
   (Upstash Redis via REST with `UPSTASH_REDIS_REST_URL`/`..._TOKEN` is an
   equivalent alternative — keep it out of the browser bundle; this is server-side only.)
2. Normalized key, e.g. `scan:v1:<sha256(city|type|mode|min|max|area|beds|n)>`,
   value = the `runMarketScan` payload + `fetchedAt` + `fetchingSince` (to
   coalesce concurrent refresh jobs). TTL 15 min to mirror `s-maxage=900`.
3. Handler flow in `api/market-scan.js`: `live=0` → KV only (sub-second);
   `live=1` and fresh hit → return snapshot immediately + fire background
   refresh (skip refresh if `fetchingSince` is < 60s old, to avoid stampede);
   `live=1` and miss → synchronous scan like today, then write to KV.
4. **Frontend template edits are REQUIRED** in `js/app.js` (banner text +
   freshness badge in `marketResultsHtml` ~`js/app.js:9942-9958`). Per project
   convention that touches `app.js` → run `node build_app.js` and re-verify the
   e2e suite (see §4 gates). Keep API response fields additive so `marketRun`'s
   existing state shape works.
5. Deployment is user-side via Vercel only (see §5).

### P2 — Parallelize the scan engine
- `Promise.all` DotProperty + MyProperty instead of sequential awaits
  (`market-scan/vercel/lib/_lib.js:600-616`).
- Bound-concurrency page fetching for DotProperty paging.
- First-past-the-post web search: fire Google/DDG/Bing in parallel, take the
  first with parseable results, instead of sequential fallback
  (`_lib.js:463-501`).
- No `maxDuration` code change needed — already 300s via `vercel.json:4`. Add a
  total wall-time budget (e.g. abort remaining primary sources at ~90s given the
  parallel step) so scans complete well under the ceiling and the edge-cache
  `s-maxage=900` window is usable.

### P3 — Per-source progressive status (OPTIONAL, bounded)
Emit one update per source instead of a final aggregate array. **Constraint: do
NOT attempt NDJSON/SSE from the serverless function.** Streamed responses on the
Vercel Node runtime buffer until the function ends within `maxDuration`, and
there is no durable job state across instances, so a `/status` poll without a
shared store cannot work. Realistic sizing:
- If P1's KV store is adopted: start a scan job, write per-source status to KV
  as each source settles, expose `GET /api/market-scan/status?job=<id>`, and have
  the frontend poll every ~2s lighting the existing source badges
  (`js/app.js:9944-9949`).
- If P1 is not adopted: skip P3 entirely — the two-tier cache from P1 already
  removes the "blank 40s" complaint; per-source progress without caching adds
  complexity for marginal return.
- Do not exceed the 300s `maxDuration` window; worst-case scan must fit.

### P4 — Cache catalog GETs
- `Cache-Control: public, s-maxage=60, stale-while-revalidate=300` on
  `/listings`, `/listings/:id`, `/site-settings` (safe: catalog changes are
  infrequent; revalidation bounds staleness).
- `count: "estimated"` in `listListings` (`index.ts:307`) or a short-TTL cached
  total to stop re-counting the full set per page.

### P5 — Make the inquiry pipeline transactional or loud
Either wrap `inquiry + lead + update` in a single transaction, or on lead-write
failure log-and-alert instead of swallowing (`index.ts:578`). The user still
gets 201 either way — the backend must not silently drop the rep-assignment.

### P6 — Soften the hourly rate-limit UX
- Present a human message client-side: "You've reached the hourly submission
  limit — please try again in about an hour."
- Consider splitting windows per inquiry type (consult / guide / project-bt
  already carry distinct `inquiry_type`s) so one channel's cap doesn't block all.

### P7 — Trim auth overhead (minor)
Short-TTL in-instance cache for `profiles` lookups inside `authenticate()`
(`index.ts:162-170`) to shave a round-trip per protected call.

---

## 4. Non-Breaking Considerations

- All recommendations above are backend/additive: no changes to RLS policies,
  table schemas, or the frontend contract (`js/listings-api.js` shape stays the
  same). P4 headers are strictly additive; `count: "estimated"` may change the
  reported `total` slightly (documented PostgREST behavior).
- P2 changes the engine's internal ordering only. P1/P4 add response fields and
  cache headers (`cached`, `fetchedAt`, `Cache-Control`) without removing any
  existing ones.
- **P1 touches `js/app.js` templates** (banner/badge), which per project build
  convention (`build_app.js`, terser no-compress) means the gate is:
  `node --check js/app.js` → `node build_app.js` → `tests/run_all.ps1` and
  `-Mobile` must show zero new failures. `sw.js` is network-first for CSS/JS, so
  rollback of a bad phase is a `git revert` that goes live immediately.
- **P1 adds a runtime dependency** (`@vercel/kv`) + two env vars to the Vercel
  project — confirm the `esrealty-market-scan` project's KV store is provisioned
  and the env vars exist BEFORE deploying, or KV calls will 401 and scans will
  fall back to synchronous (degraded, not broken). Fail open: wrap KV reads in
  try/catch and return the synchronous scan path on KV error.
- Verify against the deployed policy after any change:
  `node supabase/check-backend.js` (functions + REST tables) and a live
  `/api/market-scan?city=...` call for shape preservation.
- Gating (per stored plan docs): after any backend change, re-run the health
  checker and confirm sample responses against the current response shape.

---

## 5. Waiting Blockers Revisited

- These recommendations do not depend on the pending user-side deploys
  (Cloudflare Worker CSS/JS upload, Supabase `portfolio_a_investor.sql` re-run).
  Market Scan changes, however, ARE user-side deployable only via Vercel
  (`vercel --project esrealty-market-scan --prod` from repo root) — not via the
  stalled Cloudflare Worker.

## Appendix — Evidence Anchors

- Serial primaries: `market-scan/vercel/lib/_lib.js:600-616`
- DotProperty page loop + 14s timeouts: `_lib.js:190-214`
- Parallel secondaries batch: `_lib.js:627-640`
- Sequential search fallback: `_lib.js:463-501`
- `live` default true: `_lib.js:578`
- In-memory cache: `_lib.js:9-12`; edge cache header: `api/market-scan.js:23`
- `maxDuration` for scan is at platform level: `vercel.json:4` (300s) — no code change needed
- Obviously-safe old claim (do not reintroduce): *"market-scan.js lacks maxDuration"* is FALSE — `vercel.json:4` covers it
- Count exact on every page: `listListings` `index.ts:307,339`
- No cache headers on GETs: `index.ts:301-356,463-485,707-761`
- Inquiry write chain + swallowed lead error: `index.ts:537-580`
- 429 `Retry-After: 3600`: `index.ts:756`; contact cap 10/hr: `index.ts:608-610`
- Auth round-trips: `index.ts:156-170`
- Stores freshness model (to replicate): `js/app.js:9868-9940,9916`
- Market Scan single-status banner: `js/app.js:10005`
- Source badges already available: `js/app.js:9944-9949`
- Fallback host chain: `js/app.js:9722-9734`