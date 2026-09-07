const https = require("https");
const http = require("http");

const CATEGORIES = [
  { id: "convenience", label: "Convenience Store" },
  { id: "grocery", label: "Grocery Store" },
  { id: "mini", label: "Mini Store" }
];

const CHAINS = [
  { name: "7-Eleven", cat: "convenience", tokens: ["7-eleven", "711", "7 eleven", "seven eleven", "seven-eleven"] },
  { name: "Mini Stop", cat: "convenience", tokens: ["mini stop", "ministop"] },
  { name: "Lawson", cat: "convenience", tokens: ["lawson"] },
  { name: "FamilyMart", cat: "convenience", tokens: ["familymart", "family mart"] },
  { name: "Alfamart", cat: "convenience", tokens: ["alfamart", "alfa mart"] },
  { name: "Uncle John's", cat: "convenience", tokens: ["uncle john"] },
  { name: "Puregold", cat: "grocery", tokens: ["puregold", "pure gold"] },
  { name: "SM Savemore", cat: "grocery", tokens: ["savemore", "sm savemore"] },
  { name: "SM Hypermarket", cat: "grocery", tokens: ["hypermarket", "sm hypermarket"] },
  { name: "Robinsons Supermarket", cat: "grocery", tokens: ["robinsons supermarket", "robinsons supermart", "robinsons grocery"] },
  { name: "Metro Supermarket", cat: "grocery", tokens: ["metro supermarket", "metro gaisano", "metro grocery"] },
  { name: "WalterMart", cat: "grocery", tokens: ["waltermart", "walter mart"] },
  { name: "Dali Discount Store", cat: "mini", tokens: ["dali discount", "dali store", "dali pasarap"] },
  { name: "O!Save", cat: "mini", tokens: ["o!save", "o save", "osave"] }
];

function norm(s) {
  return String(s || "").toLowerCase().replace(/ñ/g, "n").replace(/[^a-z0-9]+/g, " ").replace(/\s+/g, " ").trim();
}

function fetchText(url) {
  return new Promise((resolve, reject) => {
    const mod = url.indexOf("https") === 0 ? https : http;
    const req = mod.get(url, {
      timeout: 15000,
      headers: { "user-agent": "esrealty-market-scan/1.0 (store locator; contact: local worker)", "accept": "application/json,text/plain" }
    }, res => {
      let d = "";
      res.on("data", c => d += c);
      res.on("end", () => resolve({ status: res.statusCode || 0, body: d }));
    });
    req.on("error", reject);
    req.on("timeout", () => { req.destroy(); reject(new Error("nominatim timeout")); });
  });
}

function parseJsonArray(body) {
  try {
    const j = JSON.parse(body || "[]");
    return Array.isArray(j) ? j : null;
  } catch (e) { return null; }
}

function phLabelFor(region) {
  if (!region) return "";
  if (/ncr|metro manila/i.test(region)) return "Metro Manila";
  const m = String(region).match(/\(([^)]+)\)/);
  return m ? m[1].trim() : String(region).trim();
}

function mapsScope(query) {
  const city = String(query.city || "").trim();
  if (city) return city;
  const province = String(query.province || "").trim();
  if (province) return /metro manila|ncr/i.test(province) ? "Metro Manila" : province;
  const region = String(query.region || "").trim();
  if (/ncr|metro manila/i.test(region)) return "Metro Manila";
  const m = String(region).match(/\(([^)]+)\)/);
  if (m && m[1]) return m[1].trim() + " Region";
  return phLabelFor(region) || "Philippines";
}

async function nominatimLookup(q, ft) {
  const url = "https://nominatim.openstreetmap.org/search?format=jsonv2&limit=1&countrycodes=ph" + (ft ? "&featureType=" + ft : "") + "&q=" + encodeURIComponent(q);
  for (let attempt = 0; attempt < 3; attempt++) {
    const r = await fetchText(url);
    const j = parseJsonArray(r.body);
    if (j && r.status >= 200 && r.status < 300) return j;
    if (attempt < 2) await sleep(2000 * (attempt + 1));
  }
  return [];
}

function bboxOf(hit) {
  if (!hit || !hit.boundingbox || hit.boundingbox.length < 4) return null;
  const b = hit.boundingbox.map(parseFloat);
  return {
    bbox: { minLat: Math.min(b[0], b[1]), maxLat: Math.max(b[0], b[1]), minLon: Math.min(b[2], b[3]), maxLon: Math.max(b[2], b[3]) },
    displayRaw: String(hit.display_name || "")
  };
}

function isRegionHit(raw, root) {
  const idx = raw.indexOf(",");
  const first = norm(idx === -1 ? raw : raw.slice(0, idx));
  if (first === root) return true;
  return [root + " region", root + " administrative region", root + " national capital region"].indexOf(first) !== -1;
}

async function resolveRegion(label) {
  const root = norm(label);
  const candidates = /region|administrative|ncr|metro manila/i.test(root) ? [label] : [label, label + " Region"];
  for (const cand of candidates) {
    const meta = bboxOf((await nominatimLookup(cand))[0]);
    if (!meta) continue;
    const raw = meta.displayRaw;
    if (norm(raw).indexOf(root) === -1) continue;
    if (isRegionHit(raw, root)) return { bbox: meta.bbox, label: label };
  }
  return { bbox: null, label: label };
}

async function resolveLocation(query) {
  const city = String(query.city || "").trim();
  const province = String(query.province || "").trim();
  const region = String(query.region || "").trim();
  if (city) {
    const meta = bboxOf((await nominatimLookup(city, "city"))[0]);
    return { bbox: meta ? meta.bbox : null, label: city };
  }
  if (province) {
    const meta = bboxOf((await nominatimLookup(province, "county"))[0]);
    return { bbox: meta ? meta.bbox : null, label: province };
  }
  if (region) return resolveRegion(phLabelFor(region));
  return { bbox: null, label: "" };
}

async function nominatimSearch(chainName, loc) {
  let url = "https://nominatim.openstreetmap.org/search?format=jsonv2&limit=40&countrycodes=ph&featureType=poi&q=" + encodeURIComponent(chainName + (loc.label ? " " + loc.label : ""));
  if (loc.bbox) url += "&viewbox=" + loc.bbox.minLon + "," + loc.bbox.minLat + "," + loc.bbox.maxLon + "," + loc.bbox.maxLat + "&bounded=1";
  let lastStatus = 0;
  for (let attempt = 0; attempt < 3; attempt++) {
    const r = await fetchText(url);
    const j = parseJsonArray(r.body);
    if (j && r.status >= 200 && r.status < 300) return j;
    lastStatus = r.status;
    if (attempt < 2) await sleep(2000 * (attempt + 1));
  }
  throw new Error("nominatim search failed (status " + lastStatus + ")");
}

function overpassPattern() {
  return CHAINS.map(c => c.name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("|");
}

async function overpassSearch(loc, query) {
  if (!loc.bbox) return { results: [], error: "" };
  const b = loc.bbox;
  const pattern = overpassPattern();
  const data = "[out:json][timeout:25];nwr[\"name\"~\"" + pattern + "\",i](" + b.minLat + "," + b.minLon + "," + b.maxLat + "," + b.maxLon + ");out center tags;";
  const url = "https://overpass-api.de/api/interpreter?data=" + encodeURIComponent(data);
  try {
    const r = await fetchText(url);
    if (r.status < 200 || r.status >= 300) throw new Error("overpass status " + r.status);
    const payload = JSON.parse(r.body || "{}");
    const results = (Array.isArray(payload.elements) ? payload.elements : []).map(e => {
      const tags = e.tags || {};
      const center = e.center || {};
      const lat = e.lat != null ? e.lat : center.lat;
      const lon = e.lon != null ? e.lon : center.lon;
      const locality = tags["addr:city"] || tags["addr:municipality"] || tags["addr:town"] || tags["is_in:city"] || tags["is_in:municipality"] || "";
      const address = [tags["addr:housenumber"], tags["addr:street"], locality, tags["addr:province"]].filter(Boolean).join(", ");
      return { display_name: [tags.name || tags.brand || tags.operator, address, "Philippines"].filter(Boolean).join(", "), lat: lat, lon: lon };
    }).filter(r => r.lat != null && r.lon != null);
    return { results: results, error: "" };
  } catch (e) {
    return { results: [], error: String((e && e.message) || e) };
  }
}

function hasWord(d, w) {
  if (!w) return false;
  return (" " + d + " ").indexOf(" " + w + " ") !== -1;
}

function chainMatchesName(chain, display) {
  const d = norm(display);
  if (!d) return false;
  return chain.tokens.some(t => hasWord(d, norm(t)));
}

const PH_REGION_LABELS = {
  "Region I (Ilocos)": "ilocos",
  "Region II (Cagayan Valley)": "cagayan valley",
  "Region III (Central Luzon)": "central luzon",
  "Region IV-A (CALABARZON)": "calabarzon",
  "Region IV-B (MIMAROPA)": "mimaropa|southwestern tagalog",
  "Region V (Bicol)": "bicol",
  "Region VI (Western Visayas)": "western visayas",
  "Region VII (Central Visayas)": "central visayas",
  "Region VIII (Eastern Visayas)": "eastern visayas",
  "Region IX (Zamboanga Peninsula)": "zamboanga",
  "Region X (Northern Mindanao)": "northern mindanao",
  "Region XI (Davao)": "davao",
  "Region XII (SOCCSKSARGEN)": "soccsksargen",
  "Region XIII (Caraga)": "caraga",
  "BARMM (Bangsamoro)": "bangsamoro|muslim mindanao",
  "CAR (Cordillera)": "cordillera"
};

function scopeMatches(display, query) {
  const d = norm(display);
  if (!d) return false;
  const city = String(query.city || "").trim();
  const province = String(query.province || "").trim();
  const region = String(query.region || "").trim();
  if (city) {
    const c = norm(city);
    if (d.indexOf(c) !== -1) return true;
    const cNoCity = c.replace(/ city$/, "").trim();
    return !!(cNoCity && d.indexOf(cNoCity) !== -1);
  }
  if (province) {
    if (/metro manila|ncr/i.test(province)) return /metro manila|manila/i.test(d);
    if (d.indexOf(norm(province)) !== -1) return true;
    const pNoProv = norm(province).replace(/ (city|province)$/, "").trim();
    return !!(pNoProv && d.indexOf(pNoProv) !== -1);
  }
  if (region) {
    if (/metro manila|ncr/i.test(region)) return /metro manila|manila/i.test(d);
    const tokens = (PH_REGION_LABELS[region] || "").split("|");
    return tokens.some(t => !!t && d.indexOf(t) !== -1);
  }
  return true;
}

function shortAddress(full) {
  const parts = String(full || "").split(",").map(s => s.trim()).filter(Boolean);
  while (parts.length && (parts[parts.length - 1] === "Philippines" || /^\d{4}$/.test(parts[parts.length - 1]))) parts.pop();
  return parts.join(", ").slice(0, 160);
}

function parseBranches(chain, results, query, bbox, skipScope) {
  const out = [];
  const seen = new Set();
  for (const r of results) {
    const display = String(r.display_name || "");
    if (!chainMatchesName(chain, display)) continue;
    if (!skipScope && !scopeMatches(display, query)) continue;
    const lat = parseFloat(r.lat);
    const lon = parseFloat(r.lon);
    if (!(lat && lon)) continue;
    if (bbox && (lat < bbox.minLat || lat > bbox.maxLat || lon < bbox.minLon || lon > bbox.maxLon)) continue;
    const key = Math.round(lat * 1000) + "|" + Math.round(lon * 1000);
    if (seen.has(key)) continue;
    seen.add(key);
    const first = String(display.split(",")[0] || chain.name).trim();
    const addr = shortAddress(display.replace(/^[^,]+,\s*/, ""));
    const city = String(query.city || "").trim();
    const scopeLabel = mapsScope(query);
    out.push({
      name: first || chain.name,
      address: addr,
      city: city || "",
      geo: { lat, lng: lon },
      mapsUrl: "https://www.google.com/maps/search/?api=1&query=" + encodeURIComponent((first || chain.name) + ", " + scopeLabel),
      embedUrl: "https://maps.google.com/maps?q=" + lat.toFixed(6) + "," + lon.toFixed(6) + "&z=17&output=embed"
    });
  }
  return out;
}

const sleep = ms => new Promise(r => setTimeout(r, ms));

async function scanChain(chain, query, loc) {
  const started = Date.now();
  try {
    const overpass = (loc.overpassResults || []).filter(r => chainMatchesName(chain, String(r.display_name || "")));
    let results = [];
    if (!overpass.length) {
      try {
        results = await nominatimSearch(chain.name, loc);
      } catch (e) { throw e; }
    }
    const parsed = parseBranches(chain, overpass, query, loc.bbox).concat(parseBranches(chain, results, query, loc.bbox));
    const branchKeys = new Set();
    const branches = parsed.filter(branch => {
      const key = Math.round(branch.geo.lat * 1000) + "|" + Math.round(branch.geo.lng * 1000);
      if (branchKeys.has(key)) return false;
      branchKeys.add(key);
      return true;
    });
    return {
      name: chain.name,
      category: chain.cat,
      status: branches.length ? "found" : "zero",
      foundBranches: branches.length,
       branchCountSource: overpass.length ? "OpenStreetMap (Overpass)" : "OpenStreetMap (Nominatim)",
      foundAt: new Date(started).toISOString(),
      branches: branches
    };
  } catch (e) {
    return {
      name: chain.name,
      category: chain.cat,
      status: "error",
      foundBranches: 0,
      branchCountSource: "error: " + String((e && e.message) || e),
      foundAt: new Date().toISOString(),
      branches: []
    };
  }
}

async function findStores(query) {
  const cat = String(query.cat || "").trim();
  const parsedMin = parseInt(query.minBranches, 10);
  const minBranches = Math.max(0, isNaN(parsedMin) ? 3 : parsedMin);
  const loc = await resolveLocation(query);
  const warnings = [];
  if (String(query.region || "").trim() && !loc.bbox) warnings.push("Region name did not resolve to a bounding box; results are scope-checked by name only.");
  if (String(query.province || "").trim() && !loc.bbox) warnings.push("Province name did not resolve to a bounding box; results are scope-checked by name only.");
  const overpass = await overpassSearch(loc, query);
  loc.overpassResults = overpass.results;
  if (overpass.error) warnings.push("Complete map sweep unavailable; Nominatim results may be incomplete (" + overpass.error + ").");
  const chains = CHAINS.filter(c => !cat || c.cat === cat);
  const out = [];
  for (let i = 0; i < chains.length; i++) {
    out.push(await scanChain(chains[i], query, loc));
    await sleep(1100);
  }
  const chainsOut = out.filter(c => c.foundBranches >= minBranches).sort((a, b) => b.foundBranches - a.foundBranches);
  const errors = out.filter(c => c.status === "error").length;
  if (errors) warnings.push(errors + " chain " + (errors === 1 ? "scan" : "scans") + " failed upstream (OpenStreetMap may be rate-limiting) — partial results shown, other chains may be missing.");
  return {
    ok: true,
    chains: chainsOut,
    total: chainsOut.length,
    categories: CATEGORIES,
    today: new Date().toISOString().slice(0, 10),
    fetchedAt: new Date().toISOString(),
    warnings: warnings,
    coverage: out.map(c => ({
      name: c.name,
      category: c.category,
      status: c.status === "error" ? "error" : (c.foundBranches === 0 ? "zero" : (c.foundBranches >= minBranches ? "found" : "below-min")),
      foundBranches: c.foundBranches,
      branchCountSource: c.branchCountSource
    }))
  };
}

module.exports = { findStores, CHAINS, CATEGORIES };
