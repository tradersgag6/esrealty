"use strict";

// =====================================================================
//  Market Scan engine (Node.js port of market_scan_server.ps1)
//  Scrapes public property listing pages and returns normalized JSON
//  for the Market Scan view. Runs as a Vercel serverless function.
// =====================================================================

const CACHE_TTL = 900;
const PROBE_TTL = 1800;
const cache = new Map();
const probeCache = new Map();

async function fetchHtml(url, timeoutSec) {
  const now = Date.now();
  const hit = cache.get(url);
  if (hit && (now - hit.at) / 1000 < CACHE_TTL) return hit.html;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), (timeoutSec || 14) * 1000);
  try {
    const resp = await fetch(url, {
      redirect: "follow",
      signal: controller.signal,
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36",
        "Accept-Language": "en-PH,en;q=0.9"
      }
    });
    const html = await resp.text();
    if (!resp.ok) throw new Error("HTTP " + resp.status);
    cache.set(url, { at: now, html });
    return html;
  } finally {
    clearTimeout(timer);
  }
}

async function getProbe(name, fn) {
  const now = Date.now();
  const hit = probeCache.get(name);
  if (hit && (now - hit.at) / 1000 < PROBE_TTL) return hit.result;
  const result = await fn();
  probeCache.set(name, { at: now, result });
  return result;
}

function htmlDecode(s) {
  if (s == null) return "";
  return String(s)
    .replace(/&#(\d+);/g, (_, n) => { try { return String.fromCodePoint(parseInt(n, 10)); } catch (e) { return ""; } })
    .replace(/&#x([0-9a-f]+);/gi, (_, h) => { try { return String.fromCodePoint(parseInt(h, 16)); } catch (e) { return ""; } })
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/&apos;/gi, "'")
    .replace(/&#39;/g, "'");
}

function stripTags(s) {
  return htmlDecode(String(s || "").replace(/<[^>]+>/g, " ").replace(/\s+/g, " ")).trim();
}

function toNumber(raw) {
  if (raw == null || !String(raw).trim()) return 0;
  const t = String(raw).replace(/[^\d.MKB]/g, "");
  let m = t.match(/^([\d.]+)\s*M$/i);
  if (m) return parseFloat(m[1]) * 1e6;
  m = t.match(/^([\d.]+)\s*K$/i);
  if (m) return parseFloat(m[1]) * 1e3;
  m = t.match(/^([\d.]+)\s*B$/i);
  if (m) return parseFloat(m[1]) * 1e9;
  m = t.match(/^([\d.]+)$/);
  if (m) return parseFloat(m[1]);
  return 0;
}

// ------------------------------------------------------------ benchmark data

const BENCH = {
  "Manila": 95000, "Makati": 220000, "Taguig": 210000, "Pasig": 140000, "Quezon City": 90000,
  "Mandaluyong": 150000, "Muntinlupa": 110000, "Parañaque": 100000, "Pasay": 120000,
  "Cebu City": 85000, "Lapu-Lapu": 60000, "Mandaue": 65000, "Davao City": 55000,
  "Iloilo City": 52000, "Bacolod": 42000, "Baguio": 58000, "Angeles": 48000,
  "San Fernando": 42000, "Cagayan de Oro": 46000, "Zamboanga City": 38000,
  "General Santos": 36000, "Tacloban": 34000, "Puerto Princesa": 32000, "Legazpi": 30000,
  "Butuan": 30000, "Naga": 32000, "Marawi": 26000, "Imus": 18500, "Bacoor": 17000,
  "Dasmariñas": 15000, "General Trias": 14000, "Santa Rosa": 28000, "Biñan": 24000,
  "Calamba": 20000, "Antipolo": 22000, "Meycauayan": 16000, "Silang": 12000, "Tagaytay": 26000,
  "Lipa": 18000, "Tanauan": 16000, "Malolos": 14000, "Santa Maria": 15000, "Taytay": 17000,
  "Cainta": 16000, "San Pedro": 19000, "Cabuyao": 20000, "Trece Martires": 12000,
  "Mariveles": 10000, "Balanga": 12000, "Coron": 28000, "Ormoc": 24000, "Talisay": 45000,
  "Minglanilla": 38000, "Mabalacat": 35000, "Batangas City": 22000
};

const DP_TYPE = {
  "Vacant Lot": { sale: "land-for-sale", rent: null },
  "House & Lot": { sale: "houses-for-sale", rent: "houses-for-rent" },
  "Townhouse": { sale: "townhouses-for-sale", rent: "townhouses-for-rent" },
  "Condominium Unit": { sale: "condos-for-sale", rent: "condos-for-rent" },
  "Apartment": { sale: "apartments-for-sale", rent: "apartments-for-rent" },
  "Shophouse": { sale: "shophouse-for-sale", rent: "shophouse-for-rent" },
  "Commercial": { sale: "commercial-property-for-sale", rent: "commercial-property-for-rent" },
  "Warehouse": { sale: "warehouses-for-sale", rent: "warehouses-for-rent" },
  "Office": { sale: "offices-for-sale", rent: "offices-for-rent" }
};
const DP_ALL_SALE = ["houses-for-sale"];
const DP_ALL_RENT = ["houses-for-rent"];

const MP_TYPE = {
  "Vacant Lot": { sale: "land", rent: "land" },
  "House & Lot": { sale: "house", rent: "house" },
  "Townhouse": { sale: "townhouse", rent: "townhouse" },
  "Condominium Unit": { sale: "condo", rent: "condo" },
  "Apartment": { sale: "apartment", rent: "apartment" },
  "Commercial": { sale: "commercial", rent: "commercial" },
  "Warehouse": { sale: "warehouse", rent: "warehouse" },
  "Office": { sale: "office", rent: "office" }
};

function propTypeFromTitle(title) {
  const s = " " + String(title || "").toLowerCase() + " ";
  if (s.indexOf("warehouse") >= 0) return "Warehouse";
  if (s.indexOf("townhouse") >= 0) return "Townhouse";
  if (s.indexOf("shophouse") >= 0) return "Shophouse";
  if (s.indexOf("apartment") >= 0) return "Apartment";
  if (s.indexOf("office") >= 0) return "Office";
  if (s.indexOf("commercial") >= 0) return "Commercial";
  if (s.indexOf("condo") >= 0 || s.indexOf("studio") >= 0) return "Condominium Unit";
  if (s.indexOf("house") >= 0) return "House & Lot";
  if (s.indexOf("lot") >= 0 || s.indexOf("land") >= 0) return "Vacant Lot";
  return "";
}

function getDotPropertyPages(type, mode) {
  const m = mode === "rent" ? "rent" : "sale";
  if (!type || !DP_TYPE[type]) return m === "rent" ? DP_ALL_RENT : DP_ALL_SALE;
  const slug = DP_TYPE[type][m];
  return slug ? [slug] : [];
}

// ------------------------------------------------------------ dotproperty parser

function parseDotPropertyCard(card, typeFallback, mode) {
  const out = {
    url: "", title: "", city: "", price: 0, pricePerSqm: 0,
    lotArea: 0, floorArea: 0, bedrooms: 0, bathrooms: 0,
    propertyType: typeFallback, verified: false, description: ""
  };
  let m = card.match(/href="(https:\/\/www\.dotproperty\.com\.ph\/ads\/[^"]+)"/);
  if (m) out.url = m[1];
  m = card.match(/<div class="text-2xl font-semibold[^"]*"[^>]*title="([^"]+)"/);
  if (m) out.title = htmlDecode(m[1]);
  m = card.match(/location-[a-z0-9]+\.svg[^>]*>\s*<\/span>\s*([^<]{2,80}?)\s*<\/div>/);
  if (m) out.city = htmlDecode(m[1].trim());
  m = card.match(/class="inline-block text-secondary-base[^"]*"[^>]*>([^<]*)/);
  if (m) out.price = Math.round(toNumber(m[1]));
  m = card.match(/\(?\s*(?:₱)?\s*([\d][\d,.\s]*(?:M|K)?)\s*\/\s*m<sup>2<\/sup>/);
  if (m) out.pricePerSqm = Math.round(toNumber(m[1]));
  let area = 0;
  m = card.match(/resize-[a-z0-9]+\.svg[^>]*>\s*<\/span>\s*([\d][\d,.]*)\s*m<sup>2<\/sup>/);
  if (m) area = toNumber(m[1]);
  m = card.match(/bed-[a-z0-9]+\.svg[^>]*>\s*<\/span>\s*([\d]+)/);
  if (m) out.bedrooms = parseInt(m[1], 10);
  m = card.match(/bathtub-[a-z0-9]+\.svg[^>]*>\s*<\/span>\s*([\d]+)/);
  if (m) out.bathrooms = parseInt(m[1], 10);
  m = card.match(/home-[a-z0-9]+\.svg[^>]*>\s*<\/span>\s*([A-Za-z][A-Za-z &-]+?)\s*<\/li>/);
  if (m) out.propertyType = m[1].trim();
  if (card.indexOf("verified") >= 0) out.verified = true;
  m = card.match(/class="line-clamp-4[^"]*"[^>]*>([\s\S]*?)<\/div>/);
  if (m) out.description = stripTags(m[1]);
  if (typeFallback === "Vacant Lot" && area > 0) out.lotArea = area;
  else out.floorArea = area;
  return out;
}

async function invokeDotProperty(query) {
  const mode = query.mode === "rent" ? "rent" : "sale";
  const pages = getDotPropertyPages(query.type, mode);
  const all = [];
  let lastErr = "";
  let lastCount = 0;
  const MAX_PAGES = 3;
  for (const slug of pages) {
    let emptyStreak = 0;
    for (let page = 1; page <= MAX_PAGES && emptyStreak === 0; page++) {
      try {
        const url = "https://www.dotproperty.com.ph/" + slug + (page > 1 ? ("?page=" + page) : "");
        const html = await fetchHtml(url, 14);
        const cards = html.match(/<article\s+class="listing-snippet.*?<\/article>/gs) || [];
        if (cards.length === 0) { emptyStreak++; break; }
        const typeFallback = query.type || String(slug.split("-for-")[0]);
        for (const c of cards) all.push(parseDotPropertyCard(c, typeFallback, mode));
        lastCount += cards.length;
      } catch (err) {
        lastErr = String(err && err.message || err);
        break;
      }
    }
  }
  let status = "ok";
  if (all.length === 0 && lastErr) status = "error";
  return { status, count: all.length, error: lastErr, listings: all };
}

// ------------------------------------------------------------ myproperty parser

function parseMyPropertyListing(x, mode, queryType, pageSlug) {
  let area = 0;
  if (x.floorSize && x.floorSize.value) area = Math.round(toNumber(String(x.floorSize.value)));
  let price = 0;
  if (x.offers) {
    let o = x.offers;
    if (Array.isArray(o) && o.length > 0) o = o[0];
    if (o.price) price = Math.round(toNumber(String(o.price)));
  }
  let beds = 0;
  if (x.numberOfBedrooms) beds = parseInt(x.numberOfBedrooms, 10) || 0;
  let baths = 0;
  if (x.numberOfBathroomsTotal) baths = parseInt(x.numberOfBathroomsTotal, 10) || 0;
  let city = "", region = "", address = "";
  if (x.address) {
    if (x.address.addressLocality) city = htmlDecode(String(x.address.addressLocality));
    if (x.address.addressRegion) region = htmlDecode(String(x.address.addressRegion));
    if (x.address.streetAddress) address = htmlDecode(String(x.address.streetAddress));
  }
  let lat = "", lng = "";
  if (x.geo) { lat = String(x.geo.latitude || ""); lng = String(x.geo.longitude || ""); }

  let ptype = queryType;
  if (!ptype) {
    ptype = propTypeFromTitle(String(x.name || ""));
    if (!ptype && pageSlug) {
      ptype = { land: "Vacant Lot", house: "House & Lot", townhouse: "Townhouse", condo: "Condominium Unit", apartment: "Apartment", commercial: "Commercial", warehouse: "Warehouse", office: "Office" }[pageSlug] || "";
    }
  }

  const out = {
    url: x.url ? String(x.url) : "",
    title: htmlDecode(String(x.name || "")),
    city: city || region || "",
    price: price, pricePerSqm: 0,
    lotArea: 0, floorArea: area,
    bedrooms: beds, bathrooms: baths,
    propertyType: ptype, verified: false,
    description: htmlDecode(String(x.description || ""))
  };
  if (ptype === "Vacant Lot" && area > 0) { out.lotArea = area; out.floorArea = 0; }
  if (area > 0 && price > 0 && mode !== "rent") out.pricePerSqm = Math.round(price / area);
  return out;
}

async function invokeMyProperty(query) {
  const mode = query.mode === "rent" ? "rent" : "buy";
  let slug = "";
  if (query.type && MP_TYPE[query.type]) slug = MP_TYPE[query.type][query.mode];
  let url = "https://www.myproperty.ph/" + mode + "/";
  if (slug) url = "https://www.myproperty.ph/" + mode + "/" + slug + "/";
  const all = [];
  let lastErr = "";
  try {
    const html = await fetchHtml(url, 14);
    const m = html.match(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/);
    if (m) {
      const obj = JSON.parse(m[1]);
      const about = Array.isArray(obj.about) ? obj.about : [obj.about];
      for (const x of about) {
        if (x) all.push(parseMyPropertyListing(x, query.mode, query.type, slug));
      }
    }
  } catch (err) {
    lastErr = String(err && err.message || err);
  }
  let status = "ok";
  if (all.length === 0 && lastErr) status = "error";
  return { status, count: all.length, error: lastErr, listings: all };
}

// ------------------------------------------------------------ social media (probes)

async function invokeFacebook() {
  return getProbe("facebook", async () => {
    try {
      const html = await fetchHtml("https://www.facebook.com/marketplace/", 8);
      if (!html || html.length < 500) {
        return { status: "blocked", count: 0, error: "requires Facebook login (session cookie); not scrapeable without authentication", listings: [] };
      }
      return { status: "blocked", count: 0, error: "login-walled; Marketplace listings are not exposed to anonymous clients", listings: [] };
    } catch (err) {
      return { status: "blocked", count: 0, error: String(err && err.message || err), listings: [] };
    }
  });
}

async function invokeInstagram() {
  return getProbe("instagram", async () => {
    try {
      const html = await fetchHtml("https://www.instagram.com/explore/tags/property/", 8);
      if (!html) return { status: "js-only", count: 0, error: "serves a JavaScript-only shell (login wall); no listings exposed to plain requests", listings: [] };
      return { status: "blocked", count: 0, error: "no public listing data parseable", listings: [] };
    } catch (err) {
      return { status: "blocked", count: 0, error: String(err && err.message || err), listings: [] };
    }
  });
}

async function invokeTikTok() {
  return getProbe("tiktok", async () => {
    try {
      const html = await fetchHtml("https://www.tiktok.com/tag/property", 8);
      if (html.length < 10000) return { status: "blocked", count: 0, error: "access denied", listings: [] };
      return { status: "js-only", count: 0, error: "client-rendered feed; no structured property listings", listings: [] };
    } catch (err) {
      return { status: "blocked", count: 0, error: String(err && err.message || err), listings: [] };
    }
  });
}

// ------------------------------------------------------------ lamudi / zipmatch

async function invokeLamudi() {
  return getProbe("lamudi", async () => {
    try {
      const html = await fetchHtml("https://www.lamudi.com.ph/for-sale/", 6);
      const n = (html.match(/data-id="[^"]+"/g) || []).length;
      if (n > 0) return { status: "ok", count: 0, error: "parsed but schema not implemented", listings: [] };
      return { status: "blocked", count: 0, error: "HTTP 401 / access denied (site blocks scrapers)", listings: [] };
    } catch (err) {
      return { status: "blocked", count: 0, error: String(err && err.message || err), listings: [] };
    }
  });
}

async function invokeZipMatch() {
  return getProbe("zipmatch", async () => {
    try {
      const html = await fetchHtml("https://www.zipmatch.com/buy", 6);
      const n = (html.match(/property-card/g) || []).length;
      return { status: "ok", count: n, error: "", listings: [] };
    } catch (err) {
      return { status: "offline", count: 0, error: "host unreachable from this network", listings: [] };
    }
  });
}

// ------------------------------------------------------------ web search

function searchQueryText(query) {
  const parts = [];
  if (query.type) parts.push(query.type);
  parts.push(query.mode === "rent" ? "for rent" : "for sale");
  if (query.city) parts.push(query.city);
  parts.push("Philippines");
  return parts.join(" ");
}

function newSearchListing(title, url, snippet, query) {
  return {
    url: url, title: title, city: query.city, price: 0, pricePerSqm: 0,
    lotArea: 0, floorArea: 0, bedrooms: 0, bathrooms: 0,
    propertyType: query.type, verified: false, description: snippet
  };
}

function safeDecode(u) {
  try { return decodeURIComponent(u); } catch (e) { return u; }
}

function parseSearchHtml(html, engine, query) {
  const list = [];
  const seen = new Set();
  if (engine === "google") {
    const re = /href="\/url\?q=([^&"]+)[^"]*"[^>]*>(?:(?!<\/a>).)*?<h3[^>]*>(.*?)<\/h3>/gs;
    let m;
    while ((m = re.exec(html)) !== null) {
      const u = htmlDecode(safeDecode(m[1]));
      const t = stripTags(m[2]);
      if (/^https?:\/\//.test(u) && t && !seen.has(u)) {
        seen.add(u);
        list.push(newSearchListing(t, u, "", query));
      }
    }
  } else {
    const blocks = html.split(/(?=<div class="result[^"]* web-result)/);
    for (const b of blocks) {
      const am = b.match(/class="result__a" href="([^"]+)"[^>]*>(.*?)<\/a>/gs);
      if (!am) continue;
      let u = htmlDecode(am[1]);
      const mm = u.match(/uddg=([^&]+)/);
      if (mm) u = safeDecode(mm[1]);
      if (!/^https?:\/\//.test(u)) continue;
      const t = stripTags(am[2]);
      if (!t || seen.has(u)) continue;
      const sm = b.match(/class="result__snippet"[^>]*>(.*?)<\/a>/gs);
      const sn = sm ? stripTags(sm[1]) : "";
      seen.add(u);
      list.push(newSearchListing(t, u, sn, query));
    }
  }
  return list;
}

async function invokeWebSearch(query) {
  const qtext = searchQueryText(query);
  const enc = encodeURIComponent(qtext);
  let html = "";
  let err = "";

  try {
    html = await fetchHtml("https://www.google.com/search?num=20&hl=en&q=" + enc, 6);
    const blocked = !html || html.length < 2000 ||
      /unusual traffic|enablejs|\/sorry\/|captcha|not a robot/i.test(html);
    if (blocked) {
      err = "Google blocked the request (bot detection / CAPTCHA); fell back to DuckDuckGo";
      html = "";
    }
  } catch (e) {
    err = "Google request failed (" + String(e && e.message || e) + "); fell back to DuckDuckGo";
    html = "";
  }
  if (html) {
    const list = parseSearchHtml(html, "google", query);
    if (list.length > 0) return { status: "ok", engine: "google", count: list.length, error: "", listings: list };
    err = "Google returned no parseable results; fell back to DuckDuckGo";
    html = "";
  }

  try {
    html = await fetchHtml("https://html.duckduckgo.com/html/?q=" + enc, 10);
    const list = parseSearchHtml(html, "duckduckgo", query);
    if (list.length > 0) return { status: "ok", engine: "duckduckgo", count: list.length, error: err, listings: list };
    return { status: "blocked", engine: "duckduckgo", count: 0, error: "DuckDuckGo returned no results", listings: [] };
  } catch (e) {
    return { status: "blocked", engine: "duckduckgo", count: 0, error: "DuckDuckGo failed: " + String(e && e.message || e), listings: [] };
  }
}

async function bingSiteSearch(qtext) {
  const enc = encodeURIComponent(qtext);
  const html = await fetchHtml("https://www.bing.com/search?count=20&q=" + enc, 10);
  const list = [];
  const seen = new Set();
  const re = /<li class="b_algo"[\s\S]*?<h2[^>]*><a href="([^"]+)"[^>]*>([\s\S]*?)<\/a>[\s\S]*?(?:<p[^>]*>([\s\S]*?)<\/p>)?/gi;
  let m;
  while ((m = re.exec(html)) !== null) {
    const url = htmlDecode(m[1]);
    if (seen.has(url)) continue;
    const title = stripTags(m[2]);
    if (!title) continue;
    const snippet = stripTags(m[3] || "");
    seen.add(url);
    list.push({ url: url, title: title, snippet: snippet });
  }
  return list;
}

async function invokeFacebookPublicSearch(query) {
  const qtext = searchQueryText(query) + " site:facebook.com";
  try {
    const list = await bingSiteSearch(qtext);
    const fb = list.filter((l) => /^https?:\/\/(?:www\.|m\.)?facebook\.com\//.test(l.url));
    const items = fb.map((l) => newSearchListing(l.title, l.url, l.snippet, query));
    if (items.length > 0) return { status: "ok", engine: "Bing", count: items.length, error: "", listings: items };
    return { status: "blocked", engine: "Bing", count: 0, error: "Bing returned no publicly indexed Facebook property posts for this search", listings: [] };
  } catch (err) {
    return { status: "blocked", engine: "Bing", count: 0, error: "Bing Facebook-post search failed: " + String(err && err.message || err), listings: [] };
  }
}

async function invokeIndexedListingSite(query, site, label) {
  const qtext = searchQueryText(query) + " site:" + site;
  const pattern = new RegExp("^https?://(?:www\\.)?" + site.replace(/\./g, "\\.") + "/");
  try {
    const list = await bingSiteSearch(qtext);
    const items = list.filter((l) => pattern.test(l.url)).map((l) => newSearchListing(l.title, l.url, l.snippet, query));
    if (items.length > 0) return { status: "ok", engine: "Bing", count: items.length, error: "", listings: items };
    return { status: "blocked", engine: "Bing", count: 0, error: "Bing returned no publicly indexed " + label + " listings for this search", listings: [] };
  } catch (err) {
    return { status: "blocked", engine: "Bing", count: 0, error: label + " search failed: " + String(err && err.message || err), listings: [] };
  }
}

// ------------------------------------------------------------ local benchmark source

function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a |= 0;
    a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function nextInt(rng, min, max) {
  return min + Math.floor(rng() * (max - min));
}

function newBenchmarkListing(city, bench, type, mode, seed) {
  const rng = mulberry32(seed);
  let lot = 0, floor = 0;
  switch (type) {
    case "Vacant Lot": lot = nextInt(rng, 80, 600); break;
    case "House & Lot": lot = nextInt(rng, 60, 240); floor = Math.round(lot * (0.7 + rng() * 0.6)); break;
    case "Townhouse": lot = nextInt(rng, 45, 160); floor = Math.round(lot * (0.8 + rng() * 0.5)); break;
    case "Condominium Unit": floor = nextInt(rng, 20, 140); break;
    case "Apartment": floor = nextInt(rng, 18, 120); break;
    case "Shophouse": floor = nextInt(rng, 30, 220); break;
    case "Commercial": floor = nextInt(rng, 50, 400); break;
    case "Warehouse": floor = nextInt(rng, 100, 600); break;
    case "Office": floor = nextInt(rng, 40, 300); break;
    default: lot = nextInt(rng, 80, 400); floor = 0; break;
  }
  let area = lot > 0 ? lot : floor;
  if (area <= 0) area = 120;
  const factor = 0.85 + rng() * 0.45;
  let price = 0;
  if (mode === "rent") {
    const value = bench * area * factor;
    price = Math.round(value * (0.0005 + rng() * 0.0004));
  } else {
    price = Math.ceil((bench * area * factor) / 10000) * 10000;
  }
  let beds = 0;
  if (type !== "Vacant Lot" && type !== "Warehouse" && type !== "Office" && type !== "Commercial") {
    beds = nextInt(rng, 1, 5);
  }
  const modeWord = mode === "rent" ? "for rent" : "for sale";
  const title = type === "Vacant Lot"
    ? area + " sqm " + type + " " + modeWord + " in " + city
    : beds + " Bedroom " + type + " " + modeWord + " in " + city;
  return {
    url: "", title: title, city: city, price: price,
    pricePerSqm: area > 0 && mode !== "rent" ? Math.round(price / area) : 0,
    lotArea: lot, floorArea: floor, bedrooms: beds, bathrooms: 0,
    propertyType: type, verified: false,
    description: "Generated from the ES Realty benchmark table for " + city + " (indicative ₱" + bench + "/sqm) — reference data, not a live listing."
  };
}

async function invokeLocalBenchmark(query) {
  const mode = query.mode === "rent" ? "rent" : "sale";
  let types = ["Vacant Lot", "House & Lot", "Townhouse", "Condominium Unit", "Apartment", "Shophouse", "Commercial", "Warehouse", "Office"];
  if (query.type) types = [query.type];
  if (mode === "rent") types = types.filter((t) => t !== "Vacant Lot" && t !== "Warehouse");
  const list = [];
  let seed = 1;
  const cities = Object.keys(BENCH).sort();
  for (const t of types) {
    for (const c of cities) {
      seed++;
      list.push(newBenchmarkListing(c, BENCH[c], t, mode, seed));
    }
  }
  return { status: "ok", count: list.length, error: "", listings: list };
}

// ------------------------------------------------------------ filtering

function testListingMatch(l, query) {
  const city = String(query.city || "");
  if (city.trim()) {
    const hay = (l.city + " " + l.title).toLowerCase();
    const needle = city.trim().toLowerCase();
    if (hay.indexOf(needle) < 0) return false;
  }
  if (l.price > 0) {
    const min = query.minPrice, max = query.maxPrice;
    if (min > 0 && l.price < min) return false;
    if (max > 0 && l.price > max) return false;
  }
  const minArea = query.minArea;
  if (minArea > 0) {
    const area = l.lotArea > 0 ? l.lotArea : (l.floorArea > 0 ? l.floorArea : 0);
    if (area < minArea) return false;
  }
  const minBeds = query.minBeds;
  if (minBeds > 0 && l.bedrooms < minBeds) return false;
  return true;
}

function mergeQueryDefaults(q) {
  q = q || {};
  const d = {
    city: String(q.city || ""),
    type: String(q.type || ""),
    mode: String(q.mode || "").toLowerCase() === "rent" ? "rent" : "sale",
    minPrice: 0, maxPrice: 0, minArea: 0, minBeds: 0, maxResults: 40, live: true
  };
  const num = (v) => { const n = parseFloat(String(v == null ? "" : v).replace(/,/g, "").trim()); return isNaN(n) ? 0 : n; };
  d.minPrice = Math.max(0, num(q.minPrice));
  d.maxPrice = Math.max(0, num(q.maxPrice));
  d.minArea = Math.max(0, num(q.minArea));
  d.minBeds = Math.max(0, Math.round(num(q.minBeds)));
  d.maxResults = Math.max(1, Math.round(num(q.maxResults))) || 40;
  if (String(q.live).trim() === "0" || String(q.live).trim() === "false") d.live = false;
  return d;
}

// ------------------------------------------------------------ handler

async function runMarketScan(query) {
  const q = mergeQueryDefaults(query);
  const start = Date.now();
  const sources = [];
  const listings = [];

  const dot = { status: "skipped", count: 0, error: "", listings: [] };
  const mp = { status: "skipped", count: 0, error: "", listings: [] };
  if (q.live) {
    dot.status = "running"; dot.count = 0;
    try {
      const r = await invokeDotProperty(q);
      dot.status = r.status; dot.count = r.count; dot.error = r.error;
      for (const l of r.listings) { l.source = "dotproperty"; l.sourceLabel = "DotProperty.com.ph"; listings.push(l); }
    } catch (err) {
      dot.status = "error"; dot.error = String(err && err.message || err);
    }
    mp.status = "running";
    try {
      const r = await invokeMyProperty(q);
      mp.status = r.status; mp.count = r.count; mp.error = r.error;
      for (const l of r.listings) { l.source = "myproperty"; l.sourceLabel = "MyProperty.ph"; listings.push(l); }
    } catch (err) {
      mp.status = "error"; mp.error = String(err && err.message || err);
    }
  }
  sources.push({ name: "dotproperty", label: "DotProperty.com.ph", status: dot.status, count: dot.count, error: dot.error });
  sources.push({ name: "myproperty", label: "MyProperty.ph", status: mp.status, count: mp.count, error: mp.error });

  const running = (s) => s.status === "running";

  if (q.live) {
    if (!running(dot) && !running(mp)) {
      const ws = await invokeWebSearch(q);
      const wsEngine = ws.engine === "google" ? "Google" : "DuckDuckGo";
      sources.push({ name: "websearch", label: "Web Search (" + wsEngine + ")", status: ws.status, count: ws.count, error: ws.error });
      for (const l of ws.listings) { l.source = "websearch"; l.sourceLabel = "Web Search · " + wsEngine; listings.push(l); }

      const fbPublic = await invokeFacebookPublicSearch(q);
      const fbEngine = fbPublic.engine || "Bing";
      sources.push({ name: "facebookpublic", label: "Facebook Public Posts (" + fbEngine + ")", status: fbPublic.status, count: fbPublic.count, error: fbPublic.error });
      for (const l of fbPublic.listings) { l.source = "facebookpublic"; l.sourceLabel = "Facebook Public Post · " + fbEngine; listings.push(l); }

      for (const site of [
        { name: "onepropertee", domain: "onepropertee.com", label: "OnePropertee" },
        { name: "carousell", domain: "carousell.ph", label: "Carousell Philippines" }
      ]) {
        const siteResult = await invokeIndexedListingSite(q, site.domain, site.label);
        const eng = siteResult.engine || "Bing";
        sources.push({ name: site.name, label: site.label + " (" + eng + ")", status: siteResult.status, count: siteResult.count, error: siteResult.error });
        for (const l of siteResult.listings) { l.source = site.name; l.sourceLabel = site.label + " · " + eng; listings.push(l); }
      }

      const lam = await invokeLamudi();
      sources.push({ name: "lamudi", label: "Lamudi", status: lam.status, count: lam.count, error: lam.error });

      const zip = await invokeZipMatch();
      sources.push({ name: "zipmatch", label: "ZipMatch", status: zip.status, count: zip.count, error: zip.error });

      const fb = await invokeFacebook();
      sources.push({ name: "facebook", label: "Facebook Marketplace", status: fb.status, count: fb.count, error: fb.error });

      const ig = await invokeInstagram();
      sources.push({ name: "instagram", label: "Instagram (#property)", status: ig.status, count: ig.count, error: ig.error });

      const tt = await invokeTikTok();
      sources.push({ name: "tiktok", label: "TikTok (#property)", status: tt.status, count: tt.count, error: tt.error });
    }
  }

  const lb = await invokeLocalBenchmark(q);
  sources.push({ name: "localbenchmark", label: "Local Benchmark (offline)", status: lb.status, count: lb.count, error: lb.error });
  for (const l of lb.listings) { l.source = "localbenchmark"; l.sourceLabel = "Local Benchmark"; listings.push(l); }

  const filtered = listings.filter((l) => testListingMatch(l, q));
  return {
    ok: true,
    query: {
      city: q.city, type: q.type, mode: q.mode,
      minPrice: q.minPrice, maxPrice: q.maxPrice,
      minArea: q.minArea, minBeds: q.minBeds,
      maxResults: q.maxResults, live: q.live
    },
    sources: sources,
    total: filtered.length,
    shown: Math.min(q.maxResults, filtered.length),
    listings: filtered.slice(0, q.maxResults),
    elapsedMs: Date.now() - start,
    serverTime: new Date().toISOString().slice(0, 19)
  };
}

module.exports = { runMarketScan };
