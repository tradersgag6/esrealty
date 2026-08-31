# Market Scan (ES Realty)

Live property intelligence for the ES Realty app — scans public listing sites
for an area, matches rows to the user's property type / deal mode, keeps a
per-listing price history, and builds live per-city price-per-sqm medians that
feed the appraisal workflow.

The frontend (`js/app.js`, Market Scan view) calls `http://localhost:8932`
(the local worker) and automatically falls back to the hosted Vercel function
(`https://esrealty-market-scan.vercel.app`) when the worker is down.

## Layout

- `worker/server.js` — the local worker (port 8932). Plain Node http, zero
  required dependencies. Wraps the shared engine, adds history / bench
  tracking (SQLite-free JSON store) and the Facebook adapter.
- `worker/store.js` — dependency-free atomic JSON store
  (`worker/store/data.json`, git-ignored). Tracks every seen listing URL
  (first/last price → price-drop chips) and a bounded price-per-sqm sample
  feed per `city|type|mode` (live median benchmarks).
- `worker/scan-browser.js` — Facebook Marketplace adapter via **optional**
  Playwright. Guards everything: if Playwright is missing, the worker still
  serves scans and reports `fb.available: false` honestly.
- `vercel/api/_lib.js` — shared scraping engine (single source of truth).
  Sources: DotProperty, MyProperty, Google→DuckDuckGo→Bing web search,
  `site:` searches for Facebook / Instagram / TikTok / Lamudi / ZipMatch.
  Also exports the query-matching helpers used by the worker
  (`testListingMatch`, `mergeQueryDefaults`).
- `worker/server.js` — adds the **Live Benchmark** source after each scan:
  one heading row per `city|type|mode` derived only from listings the worker
  has actually observed (store medians). No synthesized/offline data — when
  nothing has been observed for the requested area, the source is omitted.
- `vercel/api/market-scan.js` — serverless handler for Vercel.
- `vercel/api/store_chains.js` — **Store Locator** engine: real geocoded
  branch records from OpenStreetMap (Overpass + Nominatim). Honest rule — only chains
  with real found branches are returned; nothing is fabricated. Category
  filter (convenience / grocery / mini), `minBranches` gate, lazily-loading
  Google Maps embed per branch. Location scoping: a city or province resolves
  to a bounding box (`featureType=city|county`) and a region-only search
  resolves the region's bbox and validates the hit name before accepting it;
  every returned coordinate must fall inside the box (`viewbox` + `bounded=1`).
  Chain names match on whole words only (no embedded-substring false hits).
  For bounded city/province/region searches, an Overpass map sweep collects
  mapped POIs beyond Nominatim's `limit=40`; Nominatim supplements chains not
  returned by that sweep and remains the fallback when Overpass is unavailable.
  Each response returns `coverage[]` (every scanned chain with its status:
  `found` / `zero` / `below-min` / `error`) and `warnings[]`.
- `vercel/api/market-scan/stores.js` — serverless handler mirroring the
  worker's `/api/market-scan/stores` path.
- `UPGRADE_PROMPT.md` — analysis + implementation prompt that drove this
  upgrade (FB Marketplace scraper, richer fields, persistence, UI).
- `STORE_LOCATOR_PROMPT.md` — feasibility analysis + prompt that drove the
  Store Locator feature.

## Endpoints

| Endpoint | Purpose |
|---|---|
| `GET /api/ping` | liveness; reports Playwright availability |
| `GET /api/market-scan?city=&type=&mode=&maxResults=&live=` | run a scan |
| `GET /api/market-scan/bench?n=30` | live medians (most-sampled first) |
| `GET /api/market-scan/stores?city=&region=&province=&cat=&minBranches=&refresh=` | store locator (worker caches 24h; `refresh=1` bypasses cache once per minute per location; Nominatim queries are spaced ≥1.1s). Returns `chains[]` (above-min), `coverage[]` (all scanned chains with per-chain status), `warnings[]`, `fetchedAt`, `cached`/`refreshed`/`stale` |
| `GET /api/fb/status` | Facebook adapter status |
| `GET /api/fb/login` | one-time interactive Facebook Marketplace login |

## Running

```bat
start_market_scan.cmd        :: launches the worker minimized on :8932
node worker\server.js        :: or run it in the foreground
```

### Facebook Marketplace scraping (optional)

1. `cd market-scan\worker`
2. `npm i playwright`
3. `npx playwright install chromium`
4. Open `http://localhost:8932/api/fb/login` once — a Chrome window opens.
   Sign into Facebook, browse to Marketplace, then close it. The session is
   kept in `worker/store/fb-profile/` (the password is never stored).
5. Live scans now merge Facebook Marketplace items automatically (spaced 30s
   apart to stay low-profile; reports "login required" honestly if the
   session expires).

## Fields added by the worker

Each listing gains `image`, `sourceId`, `hash`, `scrapedAt`, `firstSeenAt`,
and `postedAt` where the source exposes one. `priceChange` is computed from
prior observations (`dir` + `pct`) and rendered by the app as a green ▼ /
red ▲ chip. The app also shows the thumbnail, an age chip, and a gross rent
yield chip when available.

## Notes / known limits

- Web search fallback occasionally returns low-quality rows and DotProperty
  demands its own session for full listings — the engine reports these per
  source (`sources[]` status) instead of failing the whole scan.
- Bench medians accumulate from live scans only and are stored in
  `worker/store/data.json` (flushed ~every 5s).
- Store Locator coverage = whatever OpenStreetMap has mapped for a chain in
  that area. Chains with little OSM coverage (e.g. Dali, Mini Stop) may show
  0 branches and are omitted — shown honestly rather than padded. The
  `coverage[]` array keeps every scanned chain visible, including chains that
  a `minBranches` setting hid (`below-min`), chains with `zero` mapped
  branches, and chains whose scan failed upstream (`error`).
- Bounded searches use one Overpass sweep plus per-chain Nominatim fallback;
  the combined records are coordinate-deduplicated. If Overpass fails, the
  response remains usable but includes a warning that Nominatim's ranked
  results may be incomplete. No-location searches cannot promise exhaustive
  country-wide coverage.
- Region-only searches try to resolve the region's bounding box through
  Nominatim and validate the hit name (a plain `<label>` query is accepted,
  plus `<label> Region` / `<label> Administrative Region`); if no valid region
  resolves, results are scope-checked by name only and a warning is surfaced.
- For city searches the engine matches the display name against the full city
  name and a suffix-stripped form (e.g. `Cebu` for `Cebu City`), so a
  neighboring place whose name contains the bare city word can still pass the
  name check — the *coordinate containment* of the city bounding box is the
  real boundary enforcement (`tests/stores_fixture_node.js` proves a
  neighboring-city POI outside the box is rejected).
- Map links use a disambiguated scope label: the city or province name, or
  `Xxx Region` / `Metro Manila` when only a region was chosen, so `q=`
  queries do not geocode to an ambiguous sub-area.

### Store Locator freshness contract

- Responses carry `cached` (`true` = served without refetching), `refreshed`
  (`true` = a forced scan ran for this request), `stale` (`true` = the last
  fetch failed and the last-known-good result is being shown), `fetchedAt`
  (when the source scan completed), `today`, and `warnings[]`.
- Results are cached **24h by normalized location + category + minimum** in
  the worker's memory (key order does not matter). The frontend shows a
  Cached / Refreshed / Fresh scan badge with the observed time.
- `refresh=1` forces a rescan but is rate-limited to **once per minute per
  location** (in worker memory), and identical concurrent requests are
  coalesced (single flight) so bursts do not hammer Nominatim. If the refresh
  fails and a cache entry exists, the worker returns the cached data flagged
  `stale: true` with the failure warning.
- `cachedAt` is the time the response was served; `fetchedAt` is the time the
  underlying OpenStreetMap scan finished.
- **Freshness limits are real:** OSM/Nominatim data can lag the physical
  world, and a refresh only fetches what OSM currently maps. A "zero" result
  means no mapped branches — never proof a chain is absent. Nominatim is a
  geocoding index, not an authoritative or real-time chain database. The
  worker stays under its 1 request/second policy via inter-request sleeps,
  and the engine retries transient 4xx/5xx responses with backoff.
