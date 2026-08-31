# Market Scan Upgrade — Implementation Prompt

Goal: upgrade the ES Realty **Market Scan** scraper so it returns rich, real listings
with images, prices, geo, age, and price-drop tracking — most importantly for
**Facebook Marketplace** — while keeping the existing frontend API contract and all
19 e2e tests green.

Project root: `C:\Users\Home-Desktop\Desktop\project 1\es realty\`

---

## 1. What exists today (read these files first)

| File | Role |
|------|------|
| `js/app.js` (line ~7282) | Market Scan UI, `msFetch()` to `http://localhost:8932` or hosted Vercel, `marketPostFilter()`, result cards, source status chips |
| `market-scan/vercel/api/_lib.js` | Node engine for Vercel serverless: DotProperty card parser, MyProperty JSON-LD, Google→DDG→Bing web search, Bing `site:` searches, probes, local benchmark generator, dedupe + filter |
| `market-scan/vercel/api/market-scan.js` | Vercel function (GET/CORS, 900s cache header) |
| `market-scan/market_scan_server.ps1` | Same engine in PowerShell, serves `localhost:8932`, started by `market-scan\start_market_scan.cmd` |
| `tests/market_scan_e2e.js` | e2e: scan finishes, sources chips, "use as comp", jumps to appraisal comps — MUST keep passing |
| `tests/market_scan_filters_e2e.js` | e2e: region/province narrow, type narrows, clear — MUST keep passing |

Normalized listing shape today: `{ url, title, city, price, pricePerSqm, lotArea,
floorArea, bedrooms, bathrooms, propertyType, verified, description, source, sourceLabel }`.

`msFetch(qs)` query params: `city, type, mode(sale|rent), minPrice, maxPrice,
minArea, minBeds, maxResults, live(0|1), region, province`.

## 2. Known weaknesses to fix

1. **Facebook Marketplace returns nothing** — adapter only probes and reports "blocked / login-walled".
2. **No images** — the card has no image field; the UI cannot render thumbnails.
3. **No age / price history** — every run is stateless; you cannot show "price dropped" or "posted Xd ago".
4. **Static benchmark** — `BENCH` is a hardcoded table; real scraped medians should feed the Market Price Index.
5. **Fragile search** — Google CAPTCHA-walls anonymous scraping; Bing HTML layout may change any day.
6. **Lamudi, ZipMatch, Carousell, OnePropertee, 99.co not parsed** — search links only (no price/area/image).
7. **Vercel serverless limits** — Hobby functions time out at 10s; scans take 15–40s. Live scraping must move to a durable worker.
8. **No distance-to-subject, no rent yield** — appraisal linkage is limited.

## 3. Target architecture

```
app.js (frontend, unchanged contract)
   │  GET /api/market-scan?...
   ▼
market-scan/worker/  (NEW - Node 18+, durable, runs on 8932)
   │  ├ server.js        Express: /api/ping, /api/market-scan, /api/fb/status
   │  ├ scan-lite.js      fast parsers: DotProperty, MyProperty, web search, site: search
   │  ├ scan-browser.js   Playwright: Facebook Marketplace, Lamudi, ZipMatch, Carousell
   │  ├ store.js          SQLite (better-sqlite3) OR JSON store in market-scan/store/
   │  ├ config.json       fbCookies (path), proxies, serpApiKey (optional), concurrency
   │  └ package.json
market-scan/vercel/api/_lib.js  (unchanged shape; still called when local worker down)
```

Rules:
- `msFetch` contract (request params + response `{ok, query, sources[], total, shown, listings[], elapsedMs}`) stays byte-for-byte compatible.
- Local worker wins when the app runs on localhost/127.0.0.1; hosted Vercel is the fallback. Do not break this fallback logic at `js/app.js:7284`.
- Keep `marketPostFilter()` in the app as the final client-side region/province/type gate.

## 4. Facebook Marketplace adapter (the centerpiece)

Design:
- Run **only** in `scan-browser.js` on the local worker (never on serverless). Uses Playwright Chromium with a **persistent user-data-dir** so a human logs in once into their own account; session cookies persist.
- After login, fetch marketplace search results via `page.goto('https://www.facebook.com/marketplace/search/?query=<terms>')` and scrape the pre-rendered `__d`/`__req` JSON or the rendered cards:
  - title, price, location, posted-age badge, photo URLs (`src` with `&jpeg` variants), marketplace item id.
- Derive `postedAt` from the "X hrs/days/wks ago" badge.
- Return listings with `url = https://www.facebook.com/marketplace/item/<id>/`, `sourceLabel = "Facebook Marketplace · Live"`.
- If session expired: return `status="blocked"`, error "login expired — open http://localhost:8932/api/fb/login in your browser once".
- Add `GET /api/fb/login` → opens the Playwright browser headed for one login, then closes.
- Hard requirements: honor friendlier rate limits (≤ 1 search per 30s), do NOT auto-scroll faster than a human, support `maxResults ≤ 60`, reuse a single browser instance across requests.

Deliverables for FB:
- Real listings (not just URLs) with price + image.
- Age chip on cards.
- A clear, honest status chip when blocked.

## 5. Other source upgrades (parallelizable)

- **Lamudi** (`lamudi.com.ph`): parse the server-rendered `data-id` cards (they already report schema exists) — title, price, beds/baths, area, city, image. Page: `/for-sale/heart?location_ids=<city>` search by city; fall back to `/for-sale/`.
- **ZipMatch** (`zipmatch.com/buy`): parse `.property-card` blocks → title, price, beds, area, img.
- **Carousell PH** (`carousell.ph`): use `https://www.carousell.ph/categories/property/...` cards + the public JSON API if reachable; else keep `site:` fallback.
- **OnePropertee**: parse listing cards DOM; stop relying on search-engine links only.
- **99.co** (`99.co/ph`): add as new source — it has clean JSON embedded (`__NEXT_DATA__`); parse price sqm, area, beds, images.
- **Web search**: optional keys in `config.json` — if `serpApiKey` or `tavilyKey` present use them (structured JSON, fewer CAPTCHAs); else keep Google→DDG→Bing HTML fallback chain.
- **DotProperty/MyProperty**: add `image` extraction; shallow `concurrency=2` for pagination; respect `robots` politeness (keep `MAX_PAGES=8`, one page every ≥1.2s).
- **Benchmark feed**: after each scan, upsert observed sale listings `{city, propertyType, pricePerSqm}` into `store.js`; expose `GET /api/market-scan/bench?city=` returning live medians with sample counts so the frontend price index can prefer real medians over `BENCH` when samples ≥ 5.

## 6. Schema additions (additive, keep old fields)

Each listing gains:
```
image          : "" | first photo URL (thumbnails preferred)
postedAt       : "" | ISO date when listed (null if unknown)
scrapedAt      : number (epoch ms)
priceChange    : null | { pct, dir: "down"|"up"|"new" }   // vs previous scan of same url
sourceId       : string  // stable per-site id (dp-ad-id, myp-id, fbm-item-id, carousell-id…)
hash           : string  // sha1 of url|title|price|city for dedupe across runs
geo            : null | { lat, lng }
yieldPct       : null | number  // rent mode only: annual rent / price * 100
```

## 7. Persistence & history (`store.js`)

- Table/list `listings` keyed by `hash`: `firstSeen, lastSeen, minPrice, maxPrice, latestPrice, lastPrice, title, image, url, city, propertyType, mode`.
- On every scan, update; compute `priceChange` = % vs `lastPrice` at `lastSeen`.
- Table/list `bench` for the median feed (§5).
- `POST /api/market-scan/save` → store a highlighted listing into the app's **Listings** module (reuse existing localStorage shape so saved items get the same stale/price-drop chips the Listings view already has).
- Keep store file under `market-scan/store/`; ignore it in git.

## 8. Frontend integration (app.js, additive only)

- Result cards: render `image` thumbnail (lazy `loading="lazy"`, broken-image fallback icon).
- Age chip: "posted 3d ago" when `postedAt` known; "new" badge.
- Price-change chip: `▼ 8% reduced` (green) / `▲ 5% increased` (red) computed from `priceChange` — reuse the styling Listings already uses.
- Rent mode: show `yieldPct` chip (e.g. "6.2% yield").
- Add **Export CSV** button beside Run Search (reuse `listings_upgrade` CSV pattern).
- Add **Save to Listings** button on each card.
- Keep `market_scan_filters_e2e.js` semantics: type filter may legitimately return 0 results.

## 9. Compatibility & acceptance

- All 19 e2e tests in `tests\` must pass (runner: `powershell -ExecutionPolicy Bypass -File tests\run_all.ps1`), especially `market_scan_e2e` + `market_scan_filters_e2e`.
- Backend must return `status` for every source chip (ok/blocked/error/skipped) — the UI renders these.
- No secrets committed: FB cookies path, proxy list, and API keys live only in `market-scan/config.json` (git-ignored); ship a `config.example.json`.
- Politeness: per-site rate limits, cache 15 min, abort timeouts, honest "blocked" reporting instead of fake data. Never mark synthetic benchmark rows as live.
- Document run steps in `market-scan\README.md`: start worker, first FB login, env keys, and how to test each new source.

## 10. Delivery order

1. Worker scaffold + store + `/api/ping` + keep Vercel fallback working.
2. Playwright FB adapter + `/api/fb/login` + schema/image/age.
3. Lamudi + ZipMatch + Carousell + 99.co parsers.
4. Optional SERP keys, benchmark medians feed.
5. Frontend: images, age/price/yield chips, Export CSV, Save to Listings.
6. Run full e2e suite; fix regressions; write README.

## 11. Ask me for
- FB account for the first live login (the worker never needs your password, only a one-time browser login).
- Whether to use SQLite (`better-sqlite3`) or a plain JSON store — default SQLite.
- Whether you want a SerpAPI/Tavily key for the web-search source (default: keep free HTML fallback).