# Store Locator - Complete Branch Coverage Prompt

Use this prompt when auditing or extending the ES Realty Store Locator.

## Problem

The Store Locator must show every available mapped branch for the selected
location in the project, and every displayed branch must provide a working
Google Maps link and map embed. A single Nominatim search with `limit=40` is
not exhaustive: ranked results after the first 40 are silently omitted.

Do not claim that the result is an authoritative list of every physical branch.
The source is OpenStreetMap, so the product wording must remain "mapped
branches found" and must disclose incomplete or unavailable source coverage.

## Required Behavior

1. For a selected city, province, or region with a valid bounding box, run an
   exhaustive bounded OpenStreetMap sweep using Overpass or an equivalent
   bounded source. Do not rely only on a single `limit=40` Nominatim search.
2. Keep Nominatim as a fallback for chains not returned by the exhaustive
   sweep, and keep the existing retry/backoff behavior for upstream failures.
3. Merge Overpass and Nominatim records and deduplicate branches by stable
   coordinates, without dropping valid branches merely because the combined
   result exceeds 40 records.
4. Enforce the selected geographic scope. Every returned coordinate must be
   inside the selected bounding box. Province and region results must also
   pass the existing administrative-name checks where the bbox is broad.
5. Preserve the curated chain directory, category filtering, `minBranches`
   behavior, `coverage[]`, `warnings[]`, and stale-cache contract.
6. Every returned branch must include:
   - the actual mapped coordinates;
   - a `mapsUrl` Google Maps search link scoped to the selected area; and
   - an `embedUrl` that points to those coordinates with `output=embed`.
7. If the exhaustive source is unavailable, show the Nominatim fallback and a
   visible warning that counts may be incomplete. Never fabricate branches or
   counts.
8. For no-location searches, document the source limitation clearly. A
   bounded exhaustive sweep is preferred; do not imply that a country-wide
   result is complete when the source query is limited.

## Test First

Run the existing Store Locator tests before changing code and record the
baseline:

```powershell
powershell -ExecutionPolicy Bypass -File tests\run_all.ps1 -Test stores_e2e
node tests\stores_fixture_node.js
```

The deterministic fixture must include a bounded chain with more than 40
records, such as 45 branches. It must fail against a single Nominatim
`limit=40` implementation and pass after the exhaustive sweep is added.

## Required Regression Cases

- 45 or more bounded branches are all returned, not truncated at 40.
- Every returned branch has a Google Maps URL and coordinate embed URL.
- Duplicate Overpass/Nominatim records produce one project row.
- A neighboring-city record outside the selected bbox is rejected.
- A broad province/region bbox does not admit records from another province or
  region merely because their coordinates happen to be inside an imprecise
  outer rectangle.
- Overpass failure falls back to Nominatim and adds an incomplete-results
  warning.
- Nominatim failure does not discard valid exhaustive-sweep results.
- Zero, below-minimum, found, and error chain statuses remain distinct.
- Existing filters, branch text search, map embeds, cache metadata, refresh,
  mobile layout, and worker/Vercel response contracts remain green.

## Implementation Notes

- The shared engine is `market-scan/vercel/api/store_chains.js`; both the local
  worker and Vercel handler must continue using it.
- Nominatim currently uses `limit=40`; this is the original source of the
  missing-branch defect.
- The worker is the primary runtime and the Vercel mirror has a 60-second
  execution limit. Avoid one upstream request per returned branch and keep the
  exhaustive sweep bounded to the selected location.
- Public Overpass services can return 429/5xx/504 or become slow. Treat this as
  a source failure, not as proof that no branches exist.
- Use ASCII-only fixture output because `tests/run_all.ps1` parses browser
  results through PowerShell JSON conversion.

## Acceptance Criteria

- The baseline is recorded before edits.
- The deterministic fixture proves a result set larger than 40 is preserved.
- Live Store Locator tests pass without requiring exact fixed branch counts.
- Every displayed project branch has a Google Maps link and coordinate embed.
- Geographic scope checks remain enforced.
- Full regression suite passes:

```powershell
powershell -ExecutionPolicy Bypass -File tests\run_all.ps1
powershell -ExecutionPolicy Bypass -File tests\run_all.ps1 -Test stores_coverage_e2e -Mobile
```

- Documentation states that results are mapped OpenStreetMap coverage, not an
  authoritative real-time chain database.
