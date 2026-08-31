# Market Scan Store Locator - Audit, Test, and Improvement Prompt

Use this prompt with a senior software engineer or coding agent.

## Role

Act as a senior full-stack engineer responsible for auditing and improving the
ES Realty Market Scan Store Locator. Inspect the existing code and run the
tests before making assumptions. Be factual about what is verified, what is
incomplete, and what the data source cannot guarantee.

Do not change application code during the audit unless implementation is
explicitly approved. Produce an evidence-based issue list and an executable
implementation plan first.

## Project

Project root:

`C:\Users\Home-Desktop\Desktop\project 1\es realty\`

Relevant files:

- `js/app.js` - Market Scan UI, Store Locator controls, cascade, result filter, maps links, and worker/Vercel fallback.
- `market-scan/vercel/api/store_chains.js` - shared chain directory, Nominatim search, location resolution, branch filtering, and minimum-branch logic.
- `market-scan/worker/server.js` - local Store Locator endpoint at `/api/market-scan/stores` and 24-hour cache.
- `market-scan/vercel/api/market-scan/stores.js` - Vercel endpoint mirror.
- `tests/stores_e2e.js` - Store Locator browser regression test.
- `tests/leads_pinmove_e2e.js` - related location cascade test.
- `tests/run_all.ps1` - full CDP regression runner.
- `market-scan/README.md` and `market-scan/STORE_LOCATOR_PROMPT.md` - existing documentation to reconcile with the actual implementation.

## Current Implementation Context

Verify each item rather than trusting this summary:

- The primary branch source is OpenStreetMap through Nominatim. It is not an authoritative or real-time chain database.
- The worker runs on port `8932`; the frontend falls back to the hosted Vercel function when the worker is unavailable.
- Store results are cached in memory for 24 hours by request key.
- Nominatim requests use a project User-Agent, `featureType=poi`, a result limit, and a delay between chain requests.
- The current engine resolves a city, province, or region to a bounding box and uses `viewbox` plus `bounded=1` to reduce location leakage.
- The frontend has a separate Store Locator cascade: `#ms-stores-region`, `#ms-stores-province`, and `#ms-stores-city`.
- Changing a Store Locator filter clears stale results and shows a re-run notice. Results have a client-side branch text filter.
- The chain directory currently includes 7-Eleven, Mini Stop, Lawson, FamilyMart, Alfamart, Uncle John's, Puregold, SM Savemore, SM Hypermarket, Robinsons Supermarket, Metro Supermarket, WalterMart, Dali Discount Store, and O!Save.
- The user wrote `alphamart`; treat this as `Alfamart` unless evidence shows they mean a different brand.
- A chain must never be fabricated. Missing OSM coverage must be reported as missing or zero coverage, not filled with guessed branches.

## Main Objective

Audit the Store Locator end to end and produce a concrete plan that ensures:

1. Region, province, and city selections actually constrain the returned branch records.
2. A result cannot belong to another city, province, or region merely because Nominatim returned it in the top results.
3. The system can deliberately scan for updated data instead of silently serving stale cached data.
4. Dali Discount Store, Alfamart, and O!Save are present in the chain directory, selectable through the correct category, and scanned on every applicable request.
5. Empty coverage, lookup failure, stale cache, and successful zero-result scans are distinguishable to the user.
6. The worker and Vercel fallback return the same contract and location behavior.
7. Tests verify location correctness and freshness behavior without relying on fragile exact live branch counts.

## Required Audit Questions

Answer these with file and line references:

### Location correctness

- Does the frontend send the selected Region, Province, and City to the API on every search?
- Do changing any cascade control clear stale results and preserve unrelated filters?
- Are province-only and region-only searches geographically bounded?
- Does the geocoder resolve ambiguous names to the intended Philippine location and feature type?
- Are bounding boxes validated, normalized, and checked against every returned coordinate?
- Are display-name string checks being used as the only location proof anywhere?
- Can a city with a similar name, a neighboring city, or a result outside the selected administrative boundary leak into the response?
- Does changing location alter the API cache key and the displayed branch/map location?
- Are the main Market Scan location controls and the separate Store Locator controls intentionally independent? If independent, is that clear to the user? If they should be synchronized, identify the required change.

### Data freshness

- What exactly does `cachedAt` mean: request time, source fetch time, or cache insertion time?
- Is the user told whether data is cached or freshly fetched?
- Is there a safe manual refresh action or a `forceRefresh` API option?
- Can the worker and Vercel cache hide new branches for 24 hours or longer?
- Is cache-key normalization needed so equivalent query parameters do not create separate stale entries?
- What happens when one Nominatim request times out or rate-limits?
- Does the API distinguish `no mapped branches`, `below minimum`, `source failure`, and `partial source failure`?
- Does “updated data” mean fresh retrieval from Nominatim, and is the limitation that OSM itself may be out of date explained?
- Is `limit=40` causing undercounts in dense cities or regions?
- Is Nominatim appropriate for repeated production scans, or should an Overpass/official-source adapter be considered?

### Chain coverage

- Confirm that these chains are scanned and correctly categorized:
  - Dali Discount Store - mini
  - Alfamart - convenience
  - O!Save - mini
- Confirm aliases and name matching for punctuation, spacing, apostrophes, and brand variants.
- Check whether substring matching can falsely classify another business as a target chain.
- Verify that a chain hidden by `minBranches` is still represented in a coverage/status response when useful.
- Confirm that a zero result is not silently treated as proof that no physical branches exist.
- Check whether the UI lets a user lower the minimum to zero and understand why a chain is absent.

### API and fallback behavior

- Compare the worker and Vercel implementations and confirm they use the same shared engine and response schema.
- Test worker-down fallback from the browser.
- Test upstream timeout, malformed JSON, HTTP error, and partial chain failure.
- Check whether serverless execution limits make the sequential multi-chain scan unreliable on Vercel.
- Confirm response metadata includes query, source, fetched time, cache status, warnings, and per-chain status where needed.

### Frontend behavior

- Verify the cascade options and reset behavior for NCR, Region IV-A, Region VII, province-only, region-only, all locations, and an invalid/stale saved value.
- Verify old branch cards disappear immediately when a location changes.
- Verify the Find Stores action uses the current select values, not detached DOM elements or an older state object.
- Verify maps links and embeds use the selected geographic scope and the actual branch coordinates.
- Verify mobile layout, keyboard operation, labels, disabled states, loading state, errors, and accessible status text.
- Verify the client-side text filter does not alter server-side location scope.

## Test Matrix

Run existing tests first and record the baseline. Then test the following cases.

### Browser tests

- Fresh Store Locator card before the first Market Scan.
- NCR -> Metro Manila -> Makati -> Find Stores.
- NCR -> Metro Manila -> Quezon City -> Find Stores.
- NCR -> Metro Manila -> Taguig -> Find Stores.
- Region VII -> Cebu -> Cebu City -> Find Stores.
- Region VII -> Cebu with no city selected -> Find Stores.
- Region VII with no province or city selected -> Find Stores.
- NCR -> Metro Manila with no city selected -> Find Stores.
- All regions, no province, no city -> Find Stores.
- Change location after results load and verify no old chain rows remain.
- Change category after results load and verify the category is reflected in the next request.
- Change minimum branches to `0`, `1`, `3`, and a high value.
- Search/filter branch text and verify it only hides displayed rows; it must not change location scope.
- Verify Dali, Alfamart, and O!Save are attempted and are reported honestly even when OSM returns zero records.
- Verify every displayed branch address and coordinate belongs to the selected scope.
- Verify every Maps URL contains the correct branch/location context.
- Repeat on a mobile viewport.

### API tests

Test `/api/market-scan/stores` directly with:

- City scope: `Makati`, `Quezon City`, `Cebu City`.
- Province scope: `Cebu` with no city.
- Region scope: `Region VII (Central Visayas)` with no province or city.
- NCR province scope: `NCR` and `Metro Manila` with no city.
- No location scope.
- Each category and the empty/all category.
- Minimum branch values `0`, `3`, `20`, negative, missing, and invalid strings.
- Reordered query parameters that should produce the same normalized cache key.
- Malformed or unknown region/province/city values.
- Upstream timeout, empty Nominatim response, malformed Nominatim response, and partial chain failure.

### Freshness tests

Design deterministic tests or fixtures so they do not depend on live counts:

- First request reports a fresh fetch.
- Second identical request reports a cache hit and the same cache timestamp.
- A refresh request bypasses the cache and reports a newer fetch timestamp.
- A refresh request cannot bypass rate limits or cause uncontrolled parallel Nominatim traffic.
- A changed source fixture appears after refresh and does not remain hidden by the old cache entry.
- A failed refresh does not destroy the last known good result without telling the user it is stale.
- The UI clearly displays the observation/fetch time and whether the result is cached.

## Data-Freshness Recommendation To Evaluate

Evaluate this design and improve it if necessary:

1. Keep a normalized cache key containing location, category, and minimum branch settings.
2. Return `cached`, `cachedAt`, `fetchedAt`, `source`, and `warnings` metadata.
3. Add an explicit `Refresh data` action or a narrowly rate-limited `refresh=1` parameter.
4. Do not present refreshed Nominatim data as real-time or authoritative chain data.
5. Use a longer cache for normal usage but a controlled refresh path for users who need new data.
6. Consider separate source adapters: official chain locator data when verifiable, Overpass for broader OSM POI queries, and Nominatim as geocoding/fallback. Do not add a source without validating its terms, reliability, and result quality.
7. Preserve the last successful response if a refresh fails, but label it stale and show the failure.
8. Add logging/metrics for cache hits, refreshes, upstream failures, result counts, and location-scope rejection counts.

## Issue Reporting Format

List every discovered issue, including issues that do not block the happy path.

For each issue provide:

- Severity: blocker, high, medium, low, or observation.
- File and line/function.
- Reproduction steps or test case.
- Actual behavior.
- Expected behavior.
- Evidence, including request parameters and response metadata where relevant.
- Recommended fix.
- Whether the fix is required for the first release or can follow later.

Do not hide uncertainty. Separate confirmed defects from source-coverage limitations
and product decisions.

## Proposed Delivery Plan

Create a phased plan with files, dependencies, risks, and acceptance tests.

### Phase 0 - Baseline and audit

- Run `node --check` on the shared engine and frontend.
- Run `tests/stores_e2e.js` and the complete `tests/run_all.ps1` suite.
- Exercise the API matrix and capture representative responses.
- Record all current location leaks, stale-cache behavior, missing metadata, and source failures.

### Phase 1 - Location correctness

- Normalize location input and cache keys.
- Validate geocoder result type/name and bounding box.
- Apply coordinate containment and administrative-name checks consistently.
- Add deterministic fixtures for city, province, region, and all-location scopes.
- Make empty, invalid, and stale saved selections safe and visible.

### Phase 2 - Freshness and reliability

- Add cached/fresh metadata and a controlled refresh path.
- Add timeout, retry/backoff, partial-failure, and stale-last-known-good handling.
- Define worker versus Vercel responsibilities and serverless timeout behavior.
- Confirm Nominatim/Overpass usage limits and document the source freshness limitation.

### Phase 3 - Chain coverage and user experience

- Verify Dali Discount Store, Alfamart, and O!Save aliases and category labels.
- Show honest zero/low-coverage status instead of implying the chain does not exist.
- Keep minimum-branch filtering, but make the effect understandable.
- Improve loading, source warnings, observation time, refresh controls, maps context, accessibility, and mobile layout.

### Phase 4 - Regression and documentation

- Add deterministic API tests and focused browser tests.
- Keep live smoke tests tolerant of changing OSM counts.
- Remove test flakiness caused by stale DOM or exact live counts.
- Update README and Store Locator documentation to match the actual contract.
- Run the full suite and report any unrelated known failures separately.

## Definition Of Done

- No returned branch falls outside the selected city, province, or region in the tested scope matrix.
- Province-only and region-only searches do not fall back to an unbounded country-wide result set.
- Dali, Alfamart, and O!Save are present in the directory and are scanned under the correct category.
- Users can tell fresh data from cached data and can request a controlled refresh.
- Upstream failures, zero coverage, and below-minimum results are distinguishable.
- Worker and Vercel responses agree on contract and location behavior.
- Location, API, freshness, error, mobile, and maps tests pass.
- Existing regressions remain green, or every unrelated failure is documented with evidence.
- No branch, count, address, or freshness claim is fabricated.

## Final Deliverable

Return:

1. A short current-state summary.
2. The complete issue table ordered by severity.
3. Test commands and results.
4. The recommended architecture for fresh, location-correct scans.
5. A prioritized implementation plan with file-level changes.
6. Acceptance criteria and remaining risks.

## Implementation Status (as built, Phases 1-4)

The audit plan above has been executed. Verification is evidence-based per Phase 0.

### Phase 1 - Location correctness

- `resolveRegion()` (`store_chains.js`) resolves a region/province/city label to a
  Nominatim bounding box (`featureType=city|county`); region labels are tried as
  the plain label, `<label> Region`, and `<label> Administrative Region`, and the
  returned hit is name-validated before its `boundingbox` is trusted.
- Region-only searches that resolve are bounded by the region bbox
  (`tests/stores_fixture_node.js` proves a region-named POI outside the box is
  rejected). A label that does not resolve falls back to name-only scope and
  surfaces a warning (`warnings[]`).
- Every branch coordinate must lie inside the resolved bounding box
  (`viewbox` + `bounded=1`, plus an in-engine containment check).
- Audit question "can a neighboring/outside-boundary result leak?" —
  confirmed resolved at the coordinate level; name checks are soft
  (see the documented suffix-stripped city fallback in
  `market-scan/README.md`); the fixture locks in containment as the guard.
- Unknown region/province/city values are handled without 500s; empty and
  invalid saved selections are safe.

### Phase 2 - Freshness and reliability

- Normalized cache key `[region|province|city|cat|minBranches]` so equivalent
  parameter shapes share one 24h entry.
- `refresh=1` bypasses the 24h TTL, rate-limited to **once per minute per key**;
  single-flight for concurrent identical requests.
- Stale failing key falls back to **last-known-good** with `stale:true`.
- Per-chain upstream failures (timeout/429/5xx) retry 3x with 2s/4s backoff and
  report that chain as `error` in `coverage[]` instead of failing the whole scan.
- Response metadata: `query`, `cached`/`refreshed`/`stale`, `fetchedAt`,
  `warnings[]`, per-chain `coverage[]` with `found|zero|below-min|error`.
- Vercel mirror uses the same shared engine/schema, `maxDuration: 60`, and
  `Cache-Control: no-store` on refresh responses.
- Known limitation documented: refreshed data is as current as OSM itself; it is
  not presented as real-time or authoritative chain data.

### Phase 3 - Chain coverage and user experience

- Dali Discount Store (mini), Alfamart (convenience), and O!Save (mini) are in
  the directory and scanned on every applicable request; zero coverage is
  reported honestly (`tests/stores_coverage_e2e.js`).
- Whole-word chain-name matching (`hasWord`) prevents substring false
  classification (SM Hypermarketplace never matches SM Hypermarket).
- `minBranches` parses to `max(0, parseInt(v)) || 3`; hidden chains stay visible
  in `coverage[]` as `below-min`.
- UI additions: Coverage row with status badge, coverage-aware empty state,
  min-branches tooltip/hint, `role="status"`/`aria-live`, mobile-wrapping
  controls, card-scoped mobile overflow checks.

### Phase 4 - Regression and documentation

- `tests/stores_fixture_node.js` - 23 offline checks (stubbed `https.get`, no
  network) covering the full location/min/match/metadata matrix plus a 45-
  branch result beyond Nominatim's `limit=40`, with Google Maps links and
  coordinate embeds for every branch; Overpass 504 -> Nominatim fallback +
  incomplete-count warning; upstream failure keeping sweep results (vs
  `error`); coordinate dedupe; and broad-province-bbox name guards.
- Full desktop suite green: `stores_e2e.js` (17) + `stores_freshness_e2e.js`
  (5) + `stores_coverage_e2e.js` (10) = 22/22, fixture 23/23; mobile
  `stores_coverage_e2e` green.
- README + both prompts reconciled with the as-built contract.
- Pre-existing unrelated issue found during testing (not Store Locator scope)
  was fixed in a follow-up mobile pass: the Facebook-listing scan toolbar
  overflowed the right edge at 390px (`.row` did not wrap). Fix:
  `.ms-filters` class + wrap rules in `css/styles.css`; verified by
  `tests/market_filters_mobile_e2e.js` (4 checks, desktop + mobile green).
