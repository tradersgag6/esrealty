# Market Scan — Store Locator — First Prompt

Goal: add a **Store Locator** to the ES Realty **Market Scan** view. The user picks
a location, chooses a store category, and the app lists stores in that area —
only chains with **3+ branches** are shown — then the user picks a branch and
sees its location on **Google Maps**.

Project root: `C:\Users\Home-Desktop\Desktop\project 1\es realty\`

---

## 0. Feasibility analysis (read first)

### Verdict: possible with today's infrastructure, with honest-limitation caveats

| Requirement | Feasible? | How |
|---|---|---|
| Select a location | ✅ Yes | Reuse the Market Scan region/province/`#ms-city` selectors (already in `js/app.js`) |
| Category filter (convenience / grocery / mini store) | ✅ Yes | Curated chain directory tagged by category + a category param |
| Only show chains with 3+ branches | ✅ Yes (city-level) | Count matched branch records per chain; hide chains with `< minBranches`. Caveat: scrape coverage affects counts → never claim exact totals |
| Pick branch / store name | ✅ Yes | Group branch records under a chain; branch select |
| Show on Google Maps | ✅ Yes, **no API key needed** | Keyless embed: `https://maps.google.com/maps?q=<branch + city>&output=embed` in an iframe + a "Open in Google Maps" link `https://www.google.com/maps/search/?api=1&query=…`. If we cnap actual coords (from a locator page's embedded JSON or a Nominatim geocode), pin via `q=<lat>,<lng>`. |

### Where branch data comes from (no API keys)

1. **Curated chain directory** (bundled table): known PH chains per category with
   name, logo-free plain text label, and an *official store-locator page URL*.
   Candidates to verify: 7‑Eleven PH, Mini Stop, Lawson, FamilyMart, Uncle John's
   (convenience); Puregold, SM Hypermarket/Savemore, Robinsons Supermarket, Metro,
   WalterMart (grocery); Dali Discount Store, Dekaleng Diskarteng, various minmarts
   (mini). Exact locator URLs must be confirmed at implementation time — list as
   unverified candidates, not facts.
2. **Official locator JSON** (preferred): many chain locators render a JSON blob
   (name + branch list with coords). Fetch + parse. Highest fidelity.
3. **Existing web-search chain** (`_lib.js` Google→DDG→Bing) for `"<city> <chain> branch"`:
   parse result titles/snippets into branch → city records. Fallback when the
   locator page is JS-rendered or geo-blocked. Lower fidelity; treat every record
   as "found via web search" and never as exhaustive.

### What is NOT reliably possible (honesty rules from this repo)

- **Exact branch counts** for the whole Philippines. Scraping undercounts; we only
  say "N branches found in <area>" and show the "as of" date.
- **Real-time GPS / "nearest"** without a maps API key. "Nearest" is approximated
  by typed city rather than device coordinates (unless a geocode + Haversine pass
  is added — optional).
- **Private/unlisted stores** (deep Google CAPTCHA walls, Facebook-only shops).
  Report `status` honestly like every other Market Scan source.

### Data freshness & politeness

- Store data changes rarely → cache 24h in the worker store (`store.js` already
  exists); show cache "as of" timestamp.
- Reuse existing fetch utils, timeouts, and per-site rate limits in `_lib.js`.
- One worker endpoint keeps Vercel-serverless timeouts out of the path
  (Hobby functions cap ~10s; store lookups + a few locator fetches fit).

---

## 1. User flow (exact)

```
[Market Scan view → new "Store Locator" card]

1. Location      → Region / Province / City selects (reuse existing)
2. Category      → Convenience Store | Grocery Store | Mini Store | All
                  (+ optional Min branches control, default 3)
3. Search        → "Find stores" button
                  → table of CHAINS with ≥3 found branches in area
                    (name, category, N branches found, as-of date)
4. Select        → click a chain OR pick a specific BRANCH from its list
5. Result        → Google Maps embed (keyless iframe) centered on selection
                  + "Open in Google Maps" link to `maps.google.com?q=…`
```

Acceptance wording from the user (paraphrased literally):
- "list all convenient store" → exhaustive-feeling list per area (we show what
  we honestly found).
- "if the store has 3 or more branch name. only show" → hide chains under 3.
- "will select branch name or store name" → branch-level select, chain default.
- "show result google maps location" → maps embed + outbound link.

## 2. What exists today (files to reuse)

| File | Reusable bits |
|---|---|
| `js/app.js` (~7282) | Market Scan view, region/province/`#ms-city` selects, `marketPlaceForCity`, `msFetch()`, result-card styling, `esc()`, `icon()` |
| `market-scan/vercel/api/_lib.js` | `htmlDecode`, web-search chain (Google→DDG→Bing), `testListingMatch`, `mergeQueryDefaults`, timeout/util helpers, honest `status` conventions |
| `market-scan/worker/server.js` | Node worker on :8932, `/api/*` routing, JSON store, Google-Maps-adjacent plumbing, cache-friendly |
| `market-scan/worker/store.js` | persistent JSON store (5s auto-flush) — reuse for the 24h stores cache |
| `market-scan/vercel/api/market-scan.js` | Vercel function pattern to mirror for a stores fallback |
| `tests/` + `tests/run_all.ps1` | e2e harness; add a `stores_e2e` test; **all existing tests must stay green** |

## 3. Target contract

New endpoint on the worker (primary) + mirrored Vercel handler (fallback):

```
GET /api/market-scan/stores?city=Makati&region=NCR&province=Metro+Manila
    &cat=convenience|grocery|mini|all&minBranches=3

200 {
  ok: true,
  query: { city, region, province, cat, minBranches },
  cachedAt: "2026-...",            // "as of" (null when fresh)
  total: 3,
  chains: [
    {
      name: "7-Eleven", category: "convenience",
      foundBranches: 12,
      branchCountSource: "store-locator" | "web-search",
      branches: [
        { name: "7-Eleven — Makati Ave", address: "Makati Ave cor …",
          city: "Makati", geo: null | { lat, lng },
          mapsQuery: "7-Eleven Makati Ave, Makati, Philippines" }
      ]
    }
  ]
}
```

- Every chain `foundBranches < minBranches` is excluded server-side AND
  client-side (single source of truth = the worker).
- `mapsQuery` is what the iframe + outbound link use (no API key).
- Respect `ok:false + error` for honest failures (blocked locator, timeout).

## 4. Frontend (app.js, additive only)

- New `#ms-stores` card inside the Market Scan view (below the index card),
  collapsible, mobile-safe (embed container with `aspect-ratio`).
- Controls: location (reuse region/province/city), category select, min-branches
  number (default 3), "Find stores" button.
- Chains table: name • category badge • "N branches found in <city>" • as-of.
- Clicking a chain expands its branches; branch rows have a Maps link + embed.
- Loading/error states reuse the existing `notice-banner` + toast patterns.
- No new page route required — stays inside `[data-view="market"]`.

## 5. Chain directory (bundled, verifiable at build time)

```js
// market-scan/vercel/api/store_chains.js  (new module, shared worker+Vercel)
const STORE_CHAINS = [
  { name: "7-Eleven",            category: "convenience", locator: "https://www.7-eleven.com.ph/store-locator" },
  { name: "Mini Stop",           category: "convenience", locator: "https://www.mini-stop.ph/store-locator" },
  { name: "Lawson",              category: "convenience", locator: "…" },
  { name: "FamilyMart",          category: "convenience", locator: "…" },
  { name: "Uncle John's",        category: "convenience", locator: "…" },
  { name: "Puregold",            category: "grocery",     locator: "…" },
  { name: "SM Savemore",         category: "grocery",     locator: "…" },
  { name: "SM Hypermarket",      category: "grocery",     locator: "…" },
  { name: "Robinsons Supermarket", category: "grocery",   locator: "…" },
  { name: "Metro Supermarket",   category: "grocery",     locator: "…" },
  { name: "WalterMart",          category: "grocery",     locator: "…" },
  { name: "Dali Discount Store", category: "mini",        locator: "…" },
  // …expand during implementation; locator URLs MUST be verified live
];
```
- Each chain's locator page: try embedded JSON first; else web-search fallback
  via the existing chain. Only branches whose parsed address/city contains the
  selected city (or whose geo is within the province) are kept.
- Location blurbs MUST NOT be invented. A locator that returns nothing = `ok:false`
  for that chain with an honest error, shown as "0 found".

## 6. Acceptance criteria

- All steps 1→5 of the user flow work in the drawer on desktop + mobile.
- Only chains with ≥3 found branches are listed at default min.
- Google Maps embed renders keyless and the outbound link opens the right query.
- New `stores_e2e.js` in `tests/` (reusing the CDP harness) covers: location
  select, category select, chain list renders, branch select, iframe + link,
  min-branches hides a small chain.
- Full suite `tests\run_all.ps1` stays 19/19 (then 20/20) green.
- Hard "no fake data" rule: every branch shown traces to a retrieved locator page,
  an official JSON, or a parsed web-search result; `cachedAt` always visible.

## 7. Delivery order

1. `store_chains.js` + verify candidate locator URLs live (drop dead ones).
2. Worker endpoint `/api/market-scan/stores` with locator-JSON parsing +
   web-search fallback + 24h cache in `store.js`.
3. Vercel handler mirror + CORS.
4. Frontend: `#ms-stores` card, controls, chains table, branch select, maps embed.
5. `stores_e2e.js` + full-suite regression pass + README note.

## 8. Open questions (ask the user)

- Area granularity for "3+ branches": city-wide, province-wide, or both toggle?
- Should "All" category also list minimarts+groceries+convenience mixed?
- Include official chain locator pages as the source of truth even when slow
  (cache 24h) or prefer speed with web-search first?
- Optional: use a free reverse-geocode (Nominatim, 1 req/s) to add real pins —
  or keep keyless `q=` embed only?

## 9. Implementation status (as built)

**Implemented and verified. All answers to §8 were resolved as follows:**
- **Source**: OpenStreetMap via **Overpass + Nominatim** (real geocoded branch
  records) is the data source. The official-chain-locator and
  web-search approaches were explored and rejected in validation: official
  locators are JS-rendered walls or 404s (7-Eleven `map.philseven.com` is a
  JS app; Puregold/WalterMart pages 404; several hosts fail TLS from Node),
  and search engines return noise or nothing for store queries (Bing → support
  articles; DDG/Google → empty for Dali; directory aggregators like
  asiafirms guessy/404).
- **Area granularity**: city-wide (reuses the Market Scan `#ms-city` picker;
  NCR region filter supported). "All" mixes categories when the user picks
  "All categories".
- **Nominatim politeness**: results cached 24h in the worker; requests spaced
  ≥1.1s; valid UA; `featureType=poi`, `limit=40`; per-chain scans are rate
  limited (429/5xx → 3 retries with 2s/4s backoff).
- **Branch coverage**: bounded city/province/region searches also run one
  bounded Overpass map sweep so results are not truncated at Nominatim's
  `limit=40`; Nominatim fills chains absent from the sweep and remains the
  fallback when Overpass is unavailable. Combined records are coordinate-
  deduplicated and every returned branch has a Google Maps link plus a
  coordinate embed.
- **Honesty**: a chain appears only when OSM records `>= minBranches` real
  branches in the area; coverage gaps (e.g. Dali, Mini Stop) show 0 and the
  chain is omitted rather than padded. `coverage[]` keeps every scanned chain
  visible with a per-chain status (`found` / `zero` / `below-min` / `error`).
- **Keyless maps**: pin via `q=<lat>,<lng>` (`mapsUrl` link + lazy-loading
  embed `...&output=embed` iframe toggled per branch); `mapsScope()` picks a
  non-ambiguous scope label (city/province → its name; region → `Xxx Region`
  or `Metro Manila` for NCR).

**Phase 2 — freshness & refresh contract (verified by `stores_freshness_e2e.js`):**
- Cache key normalized as `[region|province|city|cat|minBranches]`, so
  equivalent queries (e.g. `NCR` vs `Metro Manila` vs no-province) share one
  24h entry instead of stampeding Nominatim.
- `refresh=1` bypasses the 24h TTL **once per minute per key** (hard rate
  limit so a user cannot hammer the upstream).
- Requests for an in-flight key return the single-flight result; a stale
  failing key falls back to **last-known-good** cached data (`stale:true`).
- Response exposes `cached` / `refreshed` / `stale` / `fetchedAt`.
- Vercel mirror: `maxDuration: 60`; refresh responses send `Cache-Control:
  no-store` so a CDN never serves stale `refresh=1` bodies.

**Phase 3 — chain coverage & honest UX (verified by `stores_coverage_e2e.js`):**
- Chain names match on **whole words only** (`hasWord`, padded word boundaries)
  — `SM Hypermarketplace` never counts for `SM Hypermarket`.
- Location scoping: city/province/region resolve to a Nominatim bounding box
  (`featureType=city|county`, `bounded=1`); region-only searches validate the
  hit name and fall back to name-only scope with a warning if the region label
  does not resolve; every returned coordinate must be inside the box.
- Frontend shows a **Coverage** row (every scanned chain + count + status badge
  green/gold/red), a coverage-aware empty state ("Checked: Dali Discount Store
  (0 mapped)…" instead of a bare failure), a min-branches tooltip + hint, and
  `role="status"`/`aria-live` on the status line; the controls row wraps on
  mobile. Min parsing: `max(0, parseInt(v)) || 3`.
- Pre-existing mobile issue (not Store Locator scope) found during testing and
  since fixed in a later mobile pass: the Facebook-listing scan toolbar
  (`.ms-filters`, the two filter `.row`s in the Market Scan card) overflowed
  the right edge at 390px because `.row` did not wrap. Fixed in `css/styles.css`
  (`.ms-filters .row { flex-wrap: wrap }`, fields 2-per-row ≤900px, 1-per-row
  ≤480px) + a `ms-filters` class in `js/app.js`. The app sidebar parks
  off-canvas left on narrow screens and inflates the page `scrollWidth`, so
  overflow assertions stay scoped to the relevant card subtree
  (`tests/market_filters_mobile_e2e.js`, 4 checks, desktop + mobile green).

**Phase 4 — offline regression & docs:**
- `tests/stores_fixture_node.js` (23 checks, pure Node, **no network**): stubs
  `require("https").get` to serve canned Nominatim/Overpass responses and locks
  in the region-bbox boundary, name-fallback + warning, min-branch parsing
  (negative → 0, invalid → 3), country-wide scan, whole-word matching,
  bbox containment of neighbor cities, distinct coverage statuses, map-link
  scope labels, NCR → "Metro Manila", response metadata, an Overpass sweep of
  45 branches beyond `limit=40` (all linked/embedded), Overpass 504 →
  Nominatim fallback + incomplete warning, upstream failure preserving sweep
  results (vs `error` when neither source works), coordinate dedupe, and a
  broad province bbox rejecting out-of-province names.
- This prompt + audit prompt were reconciled with the as-built behavior.

- **Files**: `vercel/api/store_chains.js` (engine), worker
  `/api/market-scan/stores` route (normalized 24h cache, single-flight, stale
  fallback), `vercel/api/market-scan/stores.js` (mirror), `js/app.js`
  `#ms-stores` card UI, `tests/stores_e2e.js` (17 checks), `tests/
  stores_freshness_e2e.js` (5 checks), `tests/stores_coverage_e2e.js`
  (10 checks), `tests/stores_fixture_node.js` (23 checks), and
  `tests/market_filters_mobile_e2e.js` (4 checks).
- **Verification**: desktop suite **22/22 green** (stores_e2e 17 +
  stores_freshness_e2e 5 + stores_coverage_e2e 10) + fixture 23/23 offline;
  mobile `stores_coverage_e2e` green (Makati convenience: 7‑Eleven 38, Uncle
  John's 23, Lawson 10, FamilyMart 8); min-branches gate re-filters; map
  embed loads; cached-vs-fresh consistent.
