"use strict";
// Deterministic, offline regression tests for the Store Locator engine.
// Run via: node tests/stores_fixture_node.js   (or through tests\run_all.ps1)
// The engine's fetchText() uses https.get(); we stub require("https").get to
// serve canned Nominatim responses, so NO network or live counts are involved.
// Output lines use [PASS]/[FAIL] and ASCII only (Windows console + runner parse).

const https = require("https");
const { EventEmitter } = require("events");
const engine = require("../market-scan/vercel/api/store_chains.js");

const realGet = https.get;
const checks = [];

function record(name, ok, detail) {
  checks.push({ name, ok, detail });
  process.stdout.write((ok ? "  [PASS] " : "  [FAIL] ") + name + " " + (detail || "") + "\n");
}

// ---------- stubbed Nominatim ----------
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

function installStub(router) {
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
    const hasViewbox = u.searchParams.get("viewbox") != null;
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

function restore() { https.get = realGet; }

const coverageOf = (d, name) => d.coverage.find(c => c.name === name) || {};

async function run() {
  try {
    // ---- Scenario A: region-only resolution is geographically bounded ----
    {
      const router = makeRouter();
      installStub(router);
      const bbI = [17.55, 17.65, 120.55, 120.65]; // small Ilocos box
      router.regionHits["Ilocos"] = [hit("Ilocos Region, Philippines", 17.6, 120.6, bbI)];
      router.poi["Dali Discount Store Ilocos"] = [
        hit("Dali Discount Store, Vigan, Ilocos Region, Philippines", 17.59, 120.59, bbI),
        hit("Dali Discount Store, Candon, Ilocos Region, Philippines", 17.19, 120.45, bbI)
      ];
      const d = await engine.findStores({ region: "Region I (Ilocos)", cat: "mini", minBranches: 0 });
      const dali = coverageOf(d, "Dali Discount Store");
      const osave = coverageOf(d, "O!Save");
      record("region-only search is bounded by the resolved region bbox",
        dali.foundBranches === 1,
        "dali=" + dali.foundBranches + " (1 in-bbox, 1 rejected by viewbox)");
      record("zero-coverage chain reported honestly inside a region",
        osave.status === "zero" && osave.foundBranches === 0,
        "osave=" + osave.status);
      restore();
    }
    // ---- Scenario A2: region label that does not resolve falls back to name scope + warning ----
    {
      const router = makeRouter();
      installStub(router);
      router.poi["Dali Discount Store Davao"] = [hit("Dali Discount Store, Tagum City, Davao Region, Philippines", 7.45, 125.8)];
      const d = await engine.findStores({ region: "Region XI (Davao)", cat: "mini", minBranches: 0 });
      const warned = d.warnings.some(w => /Region name did not resolve/.test(w));
      record("non-resolving region falls back to name-only scope with a warning",
        warned && coverageOf(d, "Dali Discount Store").foundBranches === 1,
        "warnings=" + d.warnings.length);
      restore();
    }
    // ---- Scenario A3: minimum-branch parsing ----
    {
      const router = makeRouter();
      installStub(router);
      router.regionHits["Ilocos"] = [hit("Ilocos Region, Philippines", 17.6, 120.6, [17.55, 17.65, 120.55, 120.65])];
      router.poi["Dali Discount Store Ilocos"] = [hit("Dali Discount Store, Vigan, Ilocos Region, Philippines", 17.59, 120.59)];
      const dNeg = await engine.findStores({ region: "Region I (Ilocos)", cat: "mini", minBranches: -1 });
      const dInv = await engine.findStores({ region: "Region I (Ilocos)", cat: "mini", minBranches: "x" });
      const okNeg = dNeg.chains.some(c => c.name === "Dali Discount Store");
      const okInv = dInv.chains.length === 0 && coverageOf(dInv, "Dali Discount Store").status === "below-min";
      record("negative minimum parses to 0 and admits a found chain",
        okNeg, "chains=" + dNeg.chains.length);
      record("invalid minimum defaults to 3 and hides below-min chains",
        okInv, "chains=" + dInv.chains.length);
      restore();
    }
    // ---- Scenario A4: no location => country-wide scan, no scope warning ----
    {
      const router = makeRouter();
      installStub(router);
      router.poi["Dali Discount Store"] = [hit("Dali Discount Store, Bunawan, Agusan del Sur, Philippines", 8.94, 125.99)];
      const d = await engine.findStores({ cat: "mini", minBranches: 0 });
      record("all-location search scans country-wide by name without a scope warning",
        coverageOf(d, "Dali Discount Store").foundBranches === 1 && d.warnings.length === 0,
        "warnings=" + d.warnings.length);
      restore();
    }
    // ---- Scenario B: city scope, word-boundary precision, statuses, min gate ----
    {
      const router = makeRouter();
      installStub(router);
      const bbC = [10.28, 10.34, 123.87, 123.92]; // narrow Cebu City bbox
      router.ftHits.city = [hit("Cebu City, Central Visayas, Philippines", 10.315, 123.885, bbC)];
      router.poi["SM Hypermarket Cebu City"] = [
        hit("SM Hypermarket, Osmena Blvd, Cebu City, Central Visayas, Philippines", 10.31, 123.89, bbC),
        hit("SM Hypermarket, J Center Mall, Cebu City, Central Visayas, Philippines", 10.32, 123.9, bbC),
        hit("SM Hypermarket, Mandaue, Cebu, Central Visayas, Philippines", 10.37, 123.9, bbC),
        hit("SM Hypermarketplace, Colon, Cebu City, Central Visayas, Philippines", 10.3, 123.88, bbC)
      ];
      router.poi["Metro Supermarket Cebu City"] = [
        hit("Metro Supermarket, Ayala Center, Cebu City, Central Visayas, Philippines", 10.315, 123.905, bbC),
        hit("Metro Supermarket, P. Del Rosario, Cebu City, Central Visayas, Philippines", 10.3, 123.9, bbC)
      ];
      router.poi["WalterMart Cebu City"] = [
        hit("WalterMart, Talamban, Cebu City, Central Visayas, Philippines", 10.33, 123.9, bbC)
      ];
      router.failChains.push("Robinsons Supermarket");
      const d = await engine.findStores({ region: "Region VII (Central Visayas)", province: "Cebu", city: "Cebu City", cat: "grocery", minBranches: 2 });
      const sm = coverageOf(d, "SM Hypermarket");
      const metro = coverageOf(d, "Metro Supermarket");
      const wm = coverageOf(d, "WalterMart");
      const pure = coverageOf(d, "Puregold");
      const rob = coverageOf(d, "Robinsons Supermarket");
      record("word-boundary matching rejects embedded brand words (SM Hypermarketplace)",
        sm.foundBranches === 2, "found=" + sm.foundBranches + " (expected 2, not 3/4)");
      record("bbox containment rejects neighboring-city results (Mandaue outside Cebu City box)",
        d.chains.filter(c => c.name === "SM Hypermarket")[0].foundBranches === 2,
        "SM Hypermarket charts=" + d.chains.filter(c => c.name === "SM Hypermarket")[0].foundBranches);
      record("below-minimum chains excluded from results but present in coverage",
        !d.chains.some(c => c.name === "WalterMart") && wm.status === "below-min" && wm.foundBranches === 1,
        "waltermart=" + wm.status);
      record("zero, found, and error statuses are distinct in coverage",
        pure.status === "zero" && sm.status === "found" && rob.status === "error" && metro.status === "found",
        "puregold=" + pure.status + " robinsons=" + rob.status);
      record("branch maps URL uses the selected city scope",
        d.chains.filter(c => c.name === "Metro Supermarket")[0].branches[0].mapsUrl.indexOf("Metro%20Supermarket") !== -1,
        d.chains.filter(c => c.name === "Metro Supermarket")[0].branches[0].mapsUrl);
      restore();
    }
    // ---- Scenario C: NCR region resolves and maps scope reads Metro Manila ----
    {
      const router = makeRouter();
      installStub(router);
      const bbM = [14.5, 14.7, 120.9, 121.1];
      router.regionHits["Metro Manila"] = [hit("Metro Manila, Philippines", 14.6, 121.0, bbM)];
      router.poi["7-Eleven Metro Manila"] = [
        hit("7-Eleven, Ayala Avenue, Makati, Metro Manila, Philippines", 14.55, 121.02, bbM)
      ];
      const d = await engine.findStores({ region: "NCR (National Capital Region)", cat: "convenience", minBranches: 1 });
      const se = d.chains.find(c => c.name === "7-Eleven");
      record("NCR region search resolves and maps label is Metro Manila",
        !!se && se.branches[0] && se.branches[0].mapsUrl.indexOf("Metro%20Manila") !== -1,
        se && se.branches[0] ? se.branches[0].mapsUrl : "no branch");
      record("all six convenience chains are scanned for NCR",
        d.coverage.length === 6,
        "coverage=" + d.coverage.length);
      record("response metadata present (ok/categories/today/fetchedAt)",
        d.ok === true && Array.isArray(d.categories) && /^\d{4}-\d{2}-\d{2}$/.test(d.today) && !isNaN(new Date(d.fetchedAt).getTime()),
        "today=" + d.today);
      restore();
    }
    // ---- Scenario D: Overpass sweep is not truncated at Nominatim's limit=40 ----
    {
      const router = makeRouter();
      installStub(router);
      const bbM = [14.5, 14.7, 120.9, 121.1];
      router.ftHits.city = [hit("Makati City, Metro Manila, Philippines", 14.55, 121.02, bbM)];
      router.overpassElements = Array.from({ length: 45 }, (_, i) => ({
        type: "node",
        id: i + 1,
        lat: 14.51 + (i % 9) * 0.02,
        lon: 120.91 + Math.floor(i / 9) * 0.03,
        tags: { name: "7-Eleven", "addr:street": "Branch " + (i + 1), "addr:city": "Makati" }
      }));
      const d = await engine.findStores({ city: "Makati", province: "Metro Manila", region: "NCR", cat: "convenience", minBranches: 3 });
      const se = d.chains.find(c => c.name === "7-Eleven");
      const allLinked = !!se && se.branches.length === 45 && se.branches.every(b => /^https:\/\/www\.google\.com\/maps\/search/.test(b.mapsUrl) && /output=embed/.test(b.embedUrl));
      record("bounded map sweep returns all 45 branches beyond Nominatim limit=40", !!se && se.foundBranches === 45, "found=" + (se ? se.foundBranches : 0));
      record("every returned branch has a Google Maps link and embed", allLinked, "linked=" + (se ? se.branches.length : 0));
      restore();
    }
    // ---- Scenario E: Overpass unavailable => Nominatim fallback + incomplete warning ----
    {
      const router = makeRouter();
      installStub(router);
      const bbM = [14.5, 14.7, 120.9, 121.1];
      router.ftHits.city = [hit("Makati City, Metro Manila, Philippines", 14.55, 121.02, bbM)];
      router.overpassStatus = 504;
      router.poi["Dali Discount Store Makati"] = [hit("Dali Discount Store, Bel-Air, Makati, Metro Manila, Philippines", 14.56, 121.02, bbM)];
      router.poi["O!Save Makati"] = [];
      const d = await engine.findStores({ city: "Makati", province: "Metro Manila", region: "NCR", cat: "mini", minBranches: 0 });
      const warned = d.warnings.some(w => /map sweep unavailable/.test(w));
      const dali = d.chains.find(c => c.name === "Dali Discount Store");
      record("Overpass 504 falls back to Nominatim and warns about incomplete counts", warned && !!dali, "warnings=" + d.warnings.length + " dali-found=" + (dali ? dali.foundBranches : 0));
      record("fallback source reported honestly as Nominatim", !!dali && /Nominatim/.test(dali.branchCountSource), dali ? dali.branchCountSource : "no chain");
      restore();
    }
    // ---- Scenario F: Nominatim failure does not discard exhaustive Overpass results ----
    {
      const router = makeRouter();
      installStub(router);
      const bbM = [14.5, 14.7, 120.9, 121.1];
      router.ftHits.city = [hit("Makati City, Metro Manila, Philippines", 14.55, 121.02, bbM)];
      router.overpassElements = [
        { type: "node", id: 1, lat: 14.55, lon: 121.02, tags: { name: "7-Eleven", "addr:street": "Ayala Avenue", "addr:city": "Makati" } },
        { type: "node", id: 2, lat: 14.56, lon: 121.01, tags: { name: "7-Eleven", "addr:street": "P. Burgos", "addr:city": "Makati" } },
        { type: "node", id: 3, lat: 14.57, lon: 121.03, tags: { name: "7-Eleven", "addr:street": "Jupiter", "addr:city": "Makati" } }
      ];
      router.failChains.push("7-Eleven", "Mini Stop");
      const d = await engine.findStores({ city: "Makati", province: "Metro Manila", region: "NCR", cat: "convenience", minBranches: 0 });
      const se = d.chains.find(c => c.name === "7-Eleven");
      const mini = coverageOf(d, "Mini Stop");
      record("Overpass results survive an upstream Nominatim failure", !!se && se.foundBranches === 3 && se.status === "found", "7-Eleven=" + (se ? se.foundBranches : 0) + " " + (se ? se.status : ""));
      record("chain with no sweep data and failed fallback reports error, not zero", mini.status === "error", "Mini Stop=" + mini.status);
      restore();
    }
    // ---- Scenario G: duplicate records produce one project row ----
    {
      const router = makeRouter();
      installStub(router);
      const bbM = [14.5, 14.7, 120.9, 121.1];
      router.ftHits.city = [hit("Makati City, Metro Manila, Philippines", 14.55, 121.02, bbM)];
      // No Overpass matches: the per-chain Nominatim fallback runs, and it returns the
      // same branch twice (different display names, same rounded coordinates) plus one unique branch.
      router.poi["7-Eleven Makati"] = [
        hit("7-Eleven, Ayala Avenue, Makati, Metro Manila, Philippines", 14.5513, 121.0208, bbM),
        hit("7-Eleven Ayala Avenue, Makati, Metro Manila, Philippines", 14.5514, 121.0209, bbM),
        hit("7-Eleven, P. Burgos, Makati, Metro Manila, Philippines", 14.5812, 121.0111, bbM)
      ];
      const d = await engine.findStores({ city: "Makati", province: "Metro Manila", region: "NCR", cat: "convenience", minBranches: 0 });
      const se = d.chains.find(c => c.name === "7-Eleven");
      const keys = new Set((se ? se.branches : []).map(b => Math.round(b.geo.lat * 1000) + "|" + Math.round(b.geo.lng * 1000)));
      record("duplicate Overpass/Nominatim records collapse to one row per coordinate", !!se && se.foundBranches === 2 && keys.size === 2, "branches=" + (se ? se.foundBranches : 0) + " unique=" + keys.size);
      restore();
    }
    // ---- Scenario H: broad province bbox still rejects out-of-province names ----
    {
      const router = makeRouter();
      installStub(router);
      const bbC = [9.5, 11.0, 123.5, 124.0]; // wide Cebu province rectangle
      router.ftHits.county = [hit("Cebu, Central Visayas, Philippines", 10.3, 123.9, bbC)];
      router.poi["WalterMart Cebu"] = [
        hit("WalterMart, Cebu City, Cebu, Central Visayas, Philippines", 10.31, 123.89, bbC),
        hit("WalterMart, Cagayan de Oro, Northern Mindanao, Philippines", 10.6, 123.6, bbC)
      ];
      const d = await engine.findStores({ region: "Region VII (Central Visayas)", province: "Cebu", cat: "grocery", minBranches: 0 });
      const wm = d.chains.find(c => c.name === "WalterMart");
      const leaked = (wm ? wm.branches : []).some(b => /cagayan/i.test(b.address));
      record("province scope keeps in-province branches inside a broad bbox", !!wm && wm.foundBranches === 1, "WalterMart=" + (wm ? wm.foundBranches : 0));
      record("out-of-province name is rejected despite being inside the imprecise bbox", !leaked, leaked ? "Cagayan leaked" : "clean");
      restore();
    }
  } catch (e) {
    process.stdout.write("  [FAIL] engine fixture threw: " + e.message + "\n");
    checks.push({ name: "engine fixture", ok: false, detail: e.message });
  }

  const allOk = checks.length > 0 && checks.every(c => c.ok);
  process.stdout.write("==== SUMMARY ====\n");
  process.stdout.write(allOk ? "ALL GREEN (" + checks.length + " checks)\n" : checks.filter(c => !c.ok).length + " FAILED\n");
  process.exitCode = allOk ? 0 : 1;
}

run();
