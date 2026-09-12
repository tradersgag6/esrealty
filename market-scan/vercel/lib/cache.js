"use strict";

// Scan-result cache for the Market Scan two-tier flow (BACKEND_UX_FLOW_REPORT P1).
//
// Primary: Vercel KV (cross-instance, survives instance recycling).
// Fallback: single-process in-memory Map (local dev / KV not provisioned).
// Every KV call is fail-open: on error we degrade to the in-memory fallback or
// a synchronous scan, never a broken response.

const crypto = require("crypto");

const TTL_SECONDS = 15 * 60; // mirrors the edge Cache-Control s-maxage=900 window
const REFRESH_AFTER_MS = 5 * 60 * 1000; // schedule a background refresh when a snapshot is older than this
const COALESCE_MS = 60 * 1000; // skip a refresh if one already started within the last minute

let kv = null;
if (process.env.KV_REST_API_URL && process.env.KV_REST_API_TOKEN) {
  try { kv = require("@vercel/kv").kv; } catch (e) { kv = null; }
}

const local = new Map(); // single-process fallback store

// Normalized cache key from the request query. Only the fields the engine
// actually honors server-side factor into the key (see mergeQueryDefaults in
// _lib.js); region/province narrowing is applied client-side and must not
// partition the shared cache.
function cacheKey(q) {
  const canonical = [
    "v1",
    String(q.city || "").trim().toLowerCase(),
    String(q.type || "").trim().toLowerCase(),
    String(q.mode || "").trim().toLowerCase(),
    Number(q.minPrice) || 0,
    Number(q.maxPrice) || 0,
    Number(q.minArea) || 0,
    Number(q.minBeds) || 0,
    Number(q.maxResults) || 0,
  ].join("|");
  return "scan:" + crypto.createHash("sha256").update(canonical).digest("hex");
}

function isFresh(wrapped) {
  if (!wrapped) return false;
  const at = wrapped._at ? Number(wrapped._at) : 0;
  if (at && Date.now() - at > TTL_SECONDS * 1000) return false;
  return true;
}

function parseWrapped(raw) {
  if (raw == null) return null;
  if (typeof raw === "string") {
    try { return JSON.parse(raw); } catch (e) { return null; }
  }
  return raw;
}

// value shape: { payload: <runMarketScan result>, fetchedAt: iso, fetchingSince: iso|null }
async function readScan(key) {
  if (kv) {
    try {
      const raw = await kv.get(key);
      const w = parseWrapped(raw);
      return isFresh(w) ? w : null;
    } catch (e) { /* fall through to local */ }
  }
  const hit = local.get(key);
  if (!hit) return null;
  if (Date.now() - hit.at > TTL_SECONDS * 1000) { local.delete(key); return null; }
  return hit.wrapped;
}

async function writeScan(key, value) {
  const wrapped = Object.assign({}, value, { _at: Date.now() });
  if (kv) {
    try {
      await kv.set(key, wrapped, { ex: TTL_SECONDS });
      return;
    } catch (e) { /* fall through to local fallback */ }
  }
  local.set(key, { at: Date.now(), wrapped });
}

// Attempt to mark a snapshot as "currently refreshing". Returns true only if no
// refresh has started within the cooldown window (best-effort stampede guard).
async function touchRefreshing(key, cooldownMs) {
  const w = await readScan(key);
  if (!w) return false;
  const now = Date.now();
  const since = w.fetchingSince ? new Date(w.fetchingSince).getTime() : 0;
  if (since && now - since < (cooldownMs || COALESCE_MS)) return false;
  await writeScan(key, Object.assign({}, w, { fetchingSince: new Date(now).toISOString() }));
  return true;
}

module.exports = {
  TTL_SECONDS,
  REFRESH_AFTER_MS,
  COALESCE_MS,
  cacheKey,
  readScan,
  writeScan,
  touchRefreshing,
};