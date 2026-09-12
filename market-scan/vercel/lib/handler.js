"use strict";

// Two-tier Market Scan handler (BACKEND_UX_FLOW_REPORT P1). Shared by the Vercel
// function (api/market-scan.js) and the local dev server (server.js) so the
// cache behavior is tested offline too.
//
// Flow:
//   live=1 + fresh KV snapshot -> respond instantly, schedule background refresh
//   live=1 + stale/missing     -> synchronous scan, write through to cache
//   live=0 + snapshot          -> respond instantly (KV only, no scrape)
//   live=0 + miss              -> fast empty result (runMarketScan with live=0
//                                  skips scraping; see mergeQueryDefaults)

const { runMarketScan } = require("./_lib");
const {
  cacheKey,
  readScan,
  writeScan,
  touchRefreshing,
  REFRESH_AFTER_MS,
  COALESCE_MS,
  TTL_SECONDS,
} = require("./cache");

let afterImpl = null;
try { afterImpl = require("@vercel/functions").after; } catch (e) { afterImpl = null; }

function isLive(q) {
  return !(String(q.live).trim() === "0" || String(q.live).trim() === "false");
}

const nowIso = () => new Date().toISOString();
const isoForHeader = iso => String(iso || "").slice(0, 19).replace("T", " ");

async function refreshScan(key, q) {
  // Background re-scrape: recompute, write through, clear the in-flight flag.
  // Best-effort — a failure leaves the previous snapshot in place.
  try {
    const fresh = await runMarketScan(q);
    await writeScan(key, { payload: fresh, fetchedAt: nowIso(), fetchingSince: null });
  } catch (e) { /* best-effort background refresh */ }
}

async function handleMarketScan(query) {
  const q = query || {};
  const live = isLive(q);
  const key = cacheKey(q);

  const cached = await readScan(key);
  if (cached && cached.payload) {
    const fetchedMs = cached.fetchedAt ? new Date(cached.fetchedAt).getTime() : 0;
    if (live && fetchedMs && (Date.now() - fetchedMs) >= REFRESH_AFTER_MS) {
      const go = await touchRefreshing(key, COALESCE_MS);
      if (go) {
        const refresh = () => refreshScan(key, q);
        if (afterImpl) afterImpl(refresh);
        else refresh();
      }
    }
    return {
      payload: Object.assign({}, cached.payload, {
        cached: true,
        cachedAt: cached.fetchedAt || new Date().toISOString(),
        serverTime: nowIso().slice(0, 19),
      }),
      // TTL kept below the scan TTL so edge caches do not outlive the KV snapshot.
      cacheControl: "public, s-maxage=300, stale-while-revalidate=600",
    };
  }

  const fresh = await runMarketScan(q);
  try {
    await writeScan(key, { payload: fresh, fetchedAt: nowIso(), fetchingSince: null });
  } catch (e) { /* cache write failure is non-fatal */ }
  return {
    payload: Object.assign({}, fresh, {
      cached: false,
      fetchedAt: nowIso().slice(0, 19),
      serverTime: nowIso().slice(0, 19),
    }),
    cacheControl: "public, s-maxage=" + TTL_SECONDS + ", stale-while-revalidate=300",
  };
}

module.exports = { handleMarketScan, isLive, isoForHeader };