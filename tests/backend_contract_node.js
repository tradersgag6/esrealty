"use strict";
// Deterministic, offline HTTP-contract regression tests for the Market Scan
// worker (market-scan/worker/server.js). Run via: node tests/backend_contract_node.js
// (or through tests\run_all.ps1). Network is stubbed: store-locator HTTP goes
// through a canned https.get router and Market Scan HTML through an empty
// global fetch, so no live site, Overpass, or Nominatim is contacted.
// Output lines use [PASS]/[FAIL] and ASCII only (Windows console + runner parse).

const http = require("http");
const net = require("net");
const https = require("https");
const { EventEmitter } = require("events");

const checks = [];
function record(name, ok, detail) {
  checks.push({ name, ok, detail });
  process.stdout.write((ok ? "  [PASS] " : "  [FAIL] ") + name + " " + (detail || "") + "\n");
}

// ---------- stubbed Nominatim / Overpass (same pattern as stores_fixture_node) ----------
function hit(display, lat, lon, bb) {
  return {
    display_name: display,
    lat: String(lat),
    lon: String(lon),
    boundingbox: bb || [String(lat - 0.05), String(lat + 0.05), String(lon - 0.05), String(lon + 0.05)]
  };
}

function makeRouter() {
  return { regionHits: {}, ftHits: {}, poi: {}, failChains: [], overpassStatus: 200, overpassElements: [] };
}

function installHttpStub(router) {
  https.get = function (url, opts, cb) {
    const u = new URL(url);
    if (u.pathname.indexOf("/api/interpreter") !== -1) {
      const overpassRes = new EventEmitter();
      overpassRes.statusCode = router.overpassStatus;
      const body = router.overpassStatus >= 400 ? "gateway timeout" : JSON.stringify({ elements: router.overpassElements || [] });
      setTimeout(() => { overpassRes.emit("data", Buffer.from(body)); overpassRes.emit("end"); }, 0);
      cb(overpassRes);
      const overpassReq = { on: () => overpassReq, once: () => overpassReq, destroy: () => {} };
      return overpassReq;
    }
    const q = u.searchParams.get("q") || "";
    const ft = u.searchParams.get("featureType") || "";
    let status = 200;
    let body = "[]";
    if (router.failChains.some(fc => q.toLowerCase().indexOf(fc.toLowerCase()) === 0)) {
      status = 429;
      body = "<html>Rate Limited</html>";
    } else if (router.poi[q] !== undefined) {
      body = JSON.stringify(router.poi[q]);
    } else if (ft) {
      body = JSON.stringify(router.ftHits[ft] || []);
    } else {
      body = JSON.stringify(router.regionHits[q] || []);
    }
    const res = new EventEmitter();
    res.statusCode = status;
    setTimeout(() => { res.emit("data", Buffer.from(body)); res.emit("end"); }, 0);
    cb(res);
    const req = { on: () => req, once: () => req, destroy: () => {} };
    return req;
  };
}

// ---------- stubbed HTML fetcher for the Market Scan engine ----------
function installFetchStub() {
  global.fetch = async function () {
    return { ok: true, status: 200, text: async () => "<html><body></body></html>", json: async () => ({}) };
  };
}

function getFreePort() {
  return new Promise((resolve) => {
    const s = net.createServer();
    s.listen(0, () => { const p = s.address().port; s.close(() => resolve(p)); });
  });
}

function req(port, path, method) {
  return new Promise((resolve, reject) => {
    const r = http.request({ host: "127.0.0.1", port, path, method }, (res) => {
      const chunks = [];
      res.on("data", c => chunks.push(c));
      res.on("end", () => {
        const body = Buffer.concat(chunks).toString("utf8");
        let json = null;
        try { json = JSON.parse(body); } catch (e) { /* leave null */ }
        resolve({ status: res.statusCode, headers: res.headers, body, json });
      });
    });
    r.on("error", reject);
    r.end();
  });
}

const realGet = https.get;
const realFetch = global.fetch;

async function run() {
  const router = makeRouter();
  installHttpStub(router);
  installFetchStub();

  const bbM = [14.5, 14.7, 120.9, 121.1];
  router.ftHits.city = [hit("Makati City, Metro Manila, Philippines", 14.55, 121.02, bbM)];
  router.poi["7-Eleven Makati"] = [
    hit("7-Eleven, Ayala Avenue, Makati, Metro Manila, Philippines", 14.55, 121.02, bbM),
    hit("7-Eleven, P. Burgos, Makati, Metro Manila, Philippines", 14.56, 121.01, bbM)
  ];

  const port = await getFreePort();
  process.env.MS_PORT = String(port);
  const wmod = require("../market-scan/worker/server.js");
  const wserver = wmod.server;

  // Keep fresh-data determinism: prevent the worker's optional Facebook scan
  // from ever launching against the real network during the fixture.
  const fb = require("../market-scan/worker/scan-browser.js");
  fb.available = false;

  if (!wserver.listening) await new Promise(r => wserver.once("listening", r));

  const STORES = "/api/market-scan/stores?region=NCR%20(National%20Capital%20Region)&province=Metro%20Manila&city=Makati&cat=convenience&minBranches=0";

  try {
    // ---- CORS / method contract ----
    {
      const r = await req(port, STORES, "OPTIONS");
      record("OPTIONS preflight returns 204 with CORS allow-methods",
        r.status === 204 && /GET/.test(r.headers["access-control-allow-methods"] || ""),
        "status=" + r.status);
    }
    {
      const r = await req(port, "/api/market-scan/bench", "POST");
      record("non-GET method on a known data route returns 405 with Allow header",
        r.status === 405 && (r.headers.allow || "").indexOf("GET") !== -1 && r.json && r.json.ok === false,
        "status=" + r.status);
    }
    {
      const r = await req(port, "/api/market-scan/stores", "DELETE");
      record("unsupported DELETE returns 405 on a known data route",
        r.status === 405, "status=" + r.status);
    }
    {
      const r = await req(port, "/api/does-not-exist", "GET");
      record("unknown route returns 404 with a JSON error",
        r.status === 404 && r.json && /Not found/.test(r.json.error || ""),
        "status=" + r.status);
    }
    {
      const r = await req(port, "/api/does-not-exist", "PUT");
      record("unknown route + unknown method still returns 404 (not 405)",
        r.status === 404, "status=" + r.status);
    }

    // ---- ping / fb contract ----
    {
      const r = await req(port, "/api/ping", "GET");
      record("GET /api/ping reports worker identity and sticky time format",
        r.status === 200 && r.json && r.json.ok === true && r.json.server === "market-scan-worker" && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/.test(r.json.time || ""),
        "server=" + (r.json && r.json.server));
    }
    {
      const r = await req(port, "/api/ping", "POST");
      record("POST /api/ping stays 200/ok, matching the Vercel ping adapter",
        r.status === 200 && r.json && r.json.ok === true,
        "status=" + r.status + " parity with vercel/api/ping.js");
    }
    {
      const r = await req(port, "/api/fb/status", "GET");
      record("GET /api/fb/status reports the facebook adapter state shape",
        r.status === 200 && r.json && r.json.ok === true && r.json.fb && typeof r.json.fb.available === "boolean",
        "available=" + (r.json && r.json.fb && r.json.fb.available));
    }

    // ---- bench contract ----
    {
      const r = await req(port, "/api/market-scan/bench?n=5", "GET");
      record("bench caps its row count to the requested n",
        r.status === 200 && r.json && r.json.ok === true && Array.isArray(r.json.benches) && r.json.benches.length <= 5,
        "rows=" + (r.json && r.json.benches.length));
    }
    {
      const r = await req(port, "/api/market-scan/bench?n=0", "GET");
      record("bench n=0 clamps to a single row or fewer",
        r.status === 200 && r.json && Array.isArray(r.json.benches) && r.json.benches.length <= 1,
        "rows=" + (r.json && r.json.benches.length));
    }
    {
      const r = await req(port, "/api/market-scan/bench?n=99999", "GET");
      record("bench n=99999 clamps at 200 rows maximum",
        r.status === 200 && r.json && Array.isArray(r.json.benches) && r.json.benches.length <= 200,
        "rows=" + (r.json && r.json.benches.length));
    }
    {
      const r = await req(port, "/api/market-scan/bench", "GET");
      record("bench with no n defaults to at most 30 rows",
        r.status === 200 && r.json && r.json.benches.length <= 30, "rows=" + (r.json && r.json.benches.length));
    }

    // ---- stores contract (offline stubbed) ----
    {
      const r = await req(port, STORES, "GET");
      record("stores first scan returns 200 with full result shape",
        r.status === 200 && r.json && r.json.ok === true && Array.isArray(r.json.chains) && Array.isArray(r.json.coverage) && Array.isArray(r.json.categories),
        "chains=" + (r.json && r.json.chains.length) + " coverage=" + (r.json && r.json.coverage.length));
      record("stores response is JSON with no-store caching for a private worker",
        (r.headers["content-type"] || "").indexOf("application/json") !== -1 && (r.headers["cache-control"] || "").indexOf("no-store") !== -1,
        "cache-control=" + r.headers["cache-control"]);
    }
    {
      const a = await req(port, STORES, "GET");
      const b = await req(port, STORES, "GET");
      record("identical stores params hit the 24h cache and return cached:true with a timestamp",
        b.status === 200 && b.json.cached === true && typeof b.json.cachedAt === "string" && b.json.cachedAt.length > 0,
        "cached=" + b.json.cached);
      record("cached body matches the fresh body exactly (deterministic)",
        JSON.stringify(a.json.chains) === JSON.stringify(b.json.chains),
        "same=" + (JSON.stringify(a.json.chains) === JSON.stringify(b.json.chains)));
    }
    {
      const forced = STORES + "&refresh=1";
      const first = await req(port, forced, "GET");
      record("forced refresh of an uncached key returns refreshed:true",
        first.status === 200 && first.json.refreshed === true,
        "refreshed=" + (first.json && first.json.refreshed));
      const second = await req(port, forced, "GET");
      // second forced call within the 60s window with a fresh cache serves cached data + rate-limit warning
      record("rapid forced refresh serves cached data with a rate-limit warning",
        second.status === 200 && second.json.cached === true && /Refresh rate limit/.test((second.json.warnings || []).join(" ")),
        "warnings=" + (second.json.warnings || []).length);
    }
    {
      const r = await req(port, "/api/market-scan/stores?cat=convenience&minBranches=xyz", "GET");
      record("invalid minBranches falls back to defaults without an error",
        r.status === 200 && r.json && Array.isArray(r.json.coverage),
        "status=" + r.status);
    }

    // ---- market-scan contract (offline, all upstreams empty) ----
    {
      const r = await req(port, "/api/market-scan?city=ZzzOffline&type=&mode=sale&maxResults=5&live=0", "GET");
      record("market-scan live=0 returns a 200 payload with two skipped live sources",
        r.status === 200 && r.json && r.json.ok === true && r.json.sources.length >= 2 && r.json.sources[0].status === "skipped",
        "sources=" + (r.json && r.json.sources.length));
      record("market-scan echoes the normalized query to the client",
        r.status === 200 && r.json && r.json.query && r.json.query.city === "ZzzOffline" && r.json.query.maxResults === 5,
        "city=" + (r.json && r.json.query && r.json.query.city));
    }
    {
      const r = await req(port, "/api/market-scan?city=ZzzAllBlocked&type=&mode=sale&maxResults=5&live=1", "GET");
      record("market-scan live=1 with every upstream blocked still returns 200, never 500",
        r.status === 200 && r.json && r.json.ok === true,
        "status=" + r.status);
      record("blocked upstreams report per-source status and zero listings, no hanging sources",
        r.json && r.json.sources.length >= 2 && r.json.sources.every(s => s.status !== "running") && Array.isArray(r.json.listings) && r.json.listings.length === 0,
        "sources=" + (r.json && r.json.sources.length) + " listings=" + (r.json && r.json.listings.length));
    }
  } catch (e) {
    process.stdout.write("  [FAIL] backend contract fixture threw: " + e.message + "\n");
    checks.push({ name: "backend contract fixture", ok: false, detail: e.message });
  }

  // restore stubs and release the worker port
  https.get = realGet;
  global.fetch = realFetch;
  wserver.close();

  const allOk = checks.length > 0 && checks.every(c => c.ok);
  process.stdout.write("==== SUMMARY ====\n");
  process.stdout.write(allOk ? "ALL GREEN (" + checks.length + " checks)\n" : checks.filter(c => !c.ok).length + " FAILED\n");
  process.exitCode = allOk ? 0 : 1;
}

run();