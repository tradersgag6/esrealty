"use strict";
// Deterministic, offline parity regression tests between the Market Scan
// worker adapter (market-scan/worker/server.js) and the Vercel serverless
// adapters (market-scan/vercel/api/*.js). Same stubbed network, same inputs.
// Run via: node tests/backend_parity_node.js  (or tests\run_all.ps1).
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

// ---------- stubbed Nominatim / Overpass ----------
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
    if (router.poi[q] !== undefined) {
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

// minimal Vercel-style res harness (header names lowercased for stable asserts)
function makeRes() {
  return {
    statusCode: 200, headers: {}, body: null, ended: false,
    setHeader(k, v) { this.headers[String(k).toLowerCase()] = String(v); },
    status(c) { this.statusCode = c; return this; },
    end() { this.ended = true; },
    json(obj) { this.body = obj; this.ended = true; }
  };
}

// strip volatile timestamps so deterministic payloads can be deep-compared
function sanitize(v) {
  if (Array.isArray(v)) return v.map(sanitize);
  if (v && typeof v === "object") {
    const o = {};
    for (const k of Object.keys(v)) {
      if (k === "foundAt" || k === "fetchedAt") continue;
      o[k] = sanitize(v[k]);
    }
    return o;
  }
  return v;
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

  // Keep fresh-data determinism: never launch a real Facebook scan during a fixture.
  const fb = require("../market-scan/worker/scan-browser.js");
  fb.available = false;

  if (!wserver.listening) await new Promise(r => wserver.once("listening", r));

  const vercelPing = require("../market-scan/vercel/api/ping.js");
  const vercelMarketScan = require("../market-scan/vercel/api/market-scan.js");
  const vercelStores = require("../market-scan/vercel/api/market-scan/stores.js");

  const STORES_QUERY = { region: "NCR (National Capital Region)", province: "Metro Manila", city: "Makati", cat: "convenience", minBranches: "0" };
  const STORES_PATH = "/api/market-scan/stores?region=NCR%20(National%20Capital%20Region)&province=Metro%20Manila&city=Makati&cat=convenience&minBranches=0";

  try {
    // ---- ping parity ----
    {
      const w = await req(port, "/api/ping", "GET");
      const vRes = makeRes();
      await vercelPing({ method: "GET", query: {} }, vRes);
      const sameTime = w.json && vRes.body && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}$/.test(w.json.time) && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}$/.test(vRes.body.time);
      record("ping adapter parity: both 200/ok with the same time format",
        w.status === 200 && vRes.statusCode === 200 && w.json.ok === true && vRes.body.ok === true && sameTime,
        "worker=" + w.status + " vercel=" + vRes.statusCode);
      record("documented ping label divergence: worker identifies as market-scan-worker",
        /^market-scan/.test(w.json.server) && /^market-scan/.test(vRes.body.server) && w.json.server !== vRes.body.server,
        "worker=" + w.json.server + " vercel=" + vRes.body.server);
    }

    // ---- stores GET parity ----
    {
      const w = await req(port, STORES_PATH, "GET");
      const vRes = makeRes();
      await vercelStores({ method: "GET", query: STORES_QUERY }, vRes);
      const same = JSON.stringify(sanitize(w.json.chains)) === JSON.stringify(sanitize(vRes.body.chains))
        && JSON.stringify(sanitize(w.json.coverage)) === JSON.stringify(sanitize(vRes.body.coverage))
        && JSON.stringify(sanitize(w.json.categories)) === JSON.stringify(sanitize(vRes.body.categories))
        && w.json.ok === vRes.body.ok && w.json.today === vRes.body.today;
      record("stores parity: same business payload from both adapters for the same query",
        w.status === 200 && vRes.statusCode === 200 && same,
        "chains=" + (w.json && w.json.chains.length) + " vercel=" + (vRes.body && vRes.body.chains.length));
      record("worker stores adds private-cache meta keys; Vercel keeps only engine keys",
        w.json && vRes.body && w.json.cached === false && w.json.refreshed === false
          && Array.isArray(w.json.warnings) && typeof w.json.cachedAt === "string"
          && !("cached" in vRes.body) && !("refreshed" in vRes.body) && !("cachedAt" in vRes.body)
          && Array.isArray(vRes.body.warnings),
        "workerCacheMeta=cached,refreshed,cachedAt vercel=none");
      record("branch geometry (geo/mapsUrl/embedUrl) is identical across adapters",
        JSON.stringify(sanitize(w.json.chains)) === JSON.stringify(sanitize(vRes.body.chains)),
        "mapsUrl parity via chains deep-equal");
    }

    // ---- stores method / CORS parity ----
    {
      const w = await req(port, STORES_PATH, "POST");
      const vRes = makeRes();
      await vercelStores({ method: "POST", query: STORES_QUERY }, vRes);
      record("stores 405 parity: both adapters reject POST with the same JSON error",
        w.status === 405 && vRes.statusCode === 405 && w.json.ok === false && vRes.body.ok === false
          && w.json.error === vRes.body.error,
        "error=" + (w.json && w.json.error) + " | " + (vRes.body && vRes.body.error));
    }
    {
      const wOpt = await req(port, STORES_PATH, "OPTIONS");
      const vOpt = makeRes();
      await vercelStores({ method: "OPTIONS", query: {} }, vOpt);
      record("OPTIONS parity: both adapters answer preflight with 204 + allow-methods",
        wOpt.status === 204 && vOpt.statusCode === 204
          && wOpt.headers["access-control-allow-methods"] !== undefined
          && vOpt.headers["access-control-allow-methods"] !== undefined,
        "worker=" + wOpt.status + " vercel=" + vOpt.statusCode);
    }

    // ---- market-scan live=0 parity ----
    {
      const q = { city: "ZzzParity", type: "", mode: "sale", maxResults: "5", live: "0" };
      const wPath = "/api/market-scan?city=ZzzParity&type=&mode=sale&maxResults=5&live=0";
      const wRes = await req(port, wPath, "GET");
      const vRes = makeRes();
      await vercelMarketScan({ method: "GET", query: q }, vRes);
      const sourcesSame = JSON.stringify(wRes.json.sources) === JSON.stringify(vRes.body.sources);
      const listingsSame = JSON.stringify(wRes.json.listings) === JSON.stringify(vRes.body.listings);
      record("market-scan live=0 parity: both 200/ok with identical query echo",
        wRes.status === 200 && vRes.statusCode === 200 && wRes.json.ok === true && vRes.body.ok === true
          && JSON.stringify(wRes.json.query) === JSON.stringify(vRes.body.query),
        "query-key=" + Object.keys(wRes.json.query).length);
      record("market-scan live=0 sources and listings are identical across adapters",
        sourcesSame && listingsSame && wRes.json.sources.length === vRes.body.sources.length,
        "sources=" + wRes.json.sources.length);
      record("documented market-scan divergence: worker tags its own meta, Vercel keeps cache headers",
        wRes.json.worker !== undefined && vRes.body.worker === undefined,
        "worker-only key present, vercel body has no worker meta");
    }

    // ---- market-scan live=1 (all upstreams blocked) parity ----
    {
      const q = { city: "ZzzParityLive", type: "", mode: "sale", maxResults: "5", live: "1" };
      const wRes = await req(port, "/api/market-scan?city=ZzzParityLive&type=&mode=sale&maxResults=5&live=1", "GET");
      const vRes = makeRes();
      await vercelMarketScan({ method: "GET", query: q }, vRes);
      const samesources = wRes.json && vRes.body && JSON.stringify(wRes.json.sources) === JSON.stringify(vRes.body.sources);
      record("market-scan live=1 with all upstreams blocked: identical 200 + blocked-source arrays",
        wRes.status === 200 && vRes.statusCode === 200 && wRes.json.listings.length === vRes.body.listings.length
          && samesources,
        "sources=" + (wRes.json && wRes.json.sources.length) + " listings=" + (wRes.json && wRes.json.listings.length));
      record("neither adapter leaves a live source in 'running' state",
        wRes.json.sources.every(s => s.status !== "running") && vRes.body.sources.every(s => s.status !== "running"),
        "worker+vercel resolved");
    }

    // ---- documented worker-only capability (bench) ----
    {
      const wRes = await req(port, "/api/market-scan/bench?n=10", "GET");
      record("bench is a documented worker-only route (no Vercel mirror)",
        wRes.status === 200 && wRes.json && wRes.json.ok === true && Array.isArray(wRes.json.benches),
        "worker bench 200; vercel exposes no bench fn");
    }
  } catch (e) {
    process.stdout.write("  [FAIL] backend parity fixture threw: " + e.message + "\n");
    checks.push({ name: "backend parity fixture", ok: false, detail: e.message });
  }

  https.get = realGet;
  global.fetch = realFetch;
  wserver.close();

  const allOk = checks.length > 0 && checks.every(c => c.ok);
  process.stdout.write("==== SUMMARY ====\n");
  process.stdout.write(allOk ? "ALL GREEN (" + checks.length + " checks)\n" : checks.filter(c => !c.ok).length + " FAILED\n");
  process.exitCode = allOk ? 0 : 1;
}

run();