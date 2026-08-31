"use strict";

// =====================================================================
//  Facebook Marketplace adapter — needs "playwright" + a one-time human
//  login (the worker stores the session in store/fb-profile/, never the
//  password). Everything degrades gracefully when Playwright is absent.
// =====================================================================

const path = require("path");

let pw = null;
let bootError = "";
let available = false;
try {
  pw = require("playwright");
  available = true;
} catch (e) {
  bootError = String((e && e.message) || e);
}

const USER_DATA = path.join(__dirname, "store", "fb-profile");
const MIN_GAP_MS = 30000;
let lastRunAt = 0;
let ctxPromise = null;

function context(headless) {
  if (!pw) return Promise.reject(new Error("playwright is not installed — run: cd market-scan\\worker && npm i playwright && npx playwright install chromium"));
  if (!ctxPromise) {
    ctxPromise = pw.chromium.launchPersistentContext(USER_DATA, {
      headless: headless !== false,
      viewport: { width: 1366, height: 900 },
      locale: "en-PH"
    });
  }
  return ctxPromise;
}

function availableInfo() {
  return { available: available, bootError: bootError };
}

// Convert a Facebook "posted X ago" badge into an ISO timestamp (best effort).
function postedAtFrom(text) {
  const raw = String(text || "").trim();
  const when = [];
  let re = /(\d+)\s*h(?:r|ours?)?(?:s)?\b/g;
  let m; let hrs = 0;
  while ((m = re.exec(raw)) !== null) hrs += parseInt(m[1], 10);
  let days = 0;
  re = /(\d+)\s*d(?:ay)?s?\b/g;
  while ((m = re.exec(raw)) !== null) days += parseInt(m[1], 10);
  let weeks = 0;
  re = /(\d+)\s*w(?:ee)?k?s?\b/g;
  while ((m = re.exec(raw)) !== null) weeks += parseInt(m[1], 10);
  let months = 0;
  re = /(\d+)\s*m(?:on)?o?(?:nth)?\b/g;
  while ((m = re.exec(raw)) !== null) months += parseInt(m[1], 10);
  const totalMs = (months ? months * 30 : 0) * 86400000 + weeks * 7 * 86400000 + days * 86400000 + (hrs || (weeks || months ? 0 : 0)) * 3600000;
  // Fresh listings show "Just now" (no number) → treat as minutes ago.
  if (!totalMs && !/ago/i.test(raw)) return 0;
  if (!totalMs && /now|just/i.test(raw)) return 0;
  return totalMs ? Date.now() - totalMs : 0;
}

function parsePrice(text) {
  const m = String(text || "").match(/₱\s?[\d][\d,\.]*(?:\s?[kKmM])?/i);
  if (!m) return 0;
  let t = m[0].replace(/[^\d.kM]/gi, "");
  let k = 1;
  if (/k$/i.test(t)) { k = 1e3; t = t.slice(0, -1); }
  if (/m$/i.test(t)) { k = 1e6; t = t.slice(0, -1); }
  const n = parseFloat(t.replace(/,/g, ""));
  return isNaN(n) ? 0 : Math.round(n * k);
}

function buildSearchText(q) {
  const parts = [];
  const mode = q.mode === "rent" ? "for rent" : "for sale";
  parts.push(q.type, mode, q.city, "Philippines");
  return parts.filter(Boolean).join(" ");
}

async function search(q) {
  const now = Date.now();
  if (now - lastRunAt < MIN_GAP_MS) {
    return { status: "blocked", count: 0, error: "rate limited — Facebook scans are spaced 30s apart; try again shortly", listings: [] };
  }
  lastRunAt = now;
  const browser = await context(true);
  const page = await browser.newPage();
  try {
    const terms = buildSearchText(q);
    await page.goto(
      "https://www.facebook.com/marketplace/search/?query=" + encodeURIComponent(terms) + "&sl=Browse",
      { waitUntil: "domcontentloaded", timeout: 45000 }
    );
    const finalUrl = page.url();
    if (/\/login\b|\/login\//.test(finalUrl) || /Log in/.test(await page.locator("body").innerText().catch(() => ""))) {
      return { status: "blocked", count: 0, error: "login required — run GET /api/fb/login in a browser once so the worker keeps its session", listings: [] };
    }
    try {
      await page.waitForSelector('a[href*="/marketplace/item/"]', { timeout: 25000 });
    } catch (e) { /* keep going — scrape what rendered */ }

    const items = await page.evaluate(() => {
      const out = [];
      const seen = new Set();
      const links = Array.from(document.querySelectorAll('a[href*="/marketplace/item/"]'));
      for (const a of links) {
        const m = (a.getAttribute("href") || "").match(/\/marketplace\/item\/(\d+)/);
        if (!m || seen.has(m[1])) continue;
        seen.add(m[1]);
        let card = a;
        for (let i = 0; i < 6; i++) {
          if (card && (card.textContent || "").length > 60 && card.querySelector("img")) break;
          card = card.parentElement;
        }
        if (!card) continue;
        const img = card.querySelector("img");
        const txt = card.textContent || "";
        const title = String(txt).split(/\n/).map(s => s.trim()).filter(Boolean)[0] || "";
        out.push({
          id: m[1],
          title: title,
          image: img ? (img.getAttribute("src") || img.getAttribute("data-src") || "") : "",
          text: txt
        });
      }
      return out;
    });

    const seenItems = new Set();
    const listings = [];
    for (const it of items.slice(0, Math.max(1, Math.min(60, q.maxResults || 60)))) {
      if (seenItems.has(it.id)) continue;
      seenItems.add(it.id);
      const price = parsePrice(it.text);
      const city = q.city || "";
      let area = 0;
      const am = it.text.match(/([\d,\.]+)\s*sq(?:uare)?[ .]?m/i);
      if (am) area = Math.round(parseFloat(am[1].replace(/,/g, "")));
      let beds = 0;
      const bm = it.text.match(/(\d+)\s*(?:[Bb]ed|br)\b/);
      if (bm) beds = parseInt(bm[1], 10);
      const pta = postedAtFrom(it.text);
      listings.push({
        url: "https://www.facebook.com/marketplace/item/" + it.id + "/",
        title: it.title || ("Marketplace listing " + it.id),
        city: city, price: price, pricePerSqm: 0,
        lotArea: 0, floorArea: area, bedrooms: beds, bathrooms: 0,
        propertyType: q.type || "", verified: false,
        description: "",
        image: it.image, postedAt: pta > 0 ? new Date(pta).toISOString() : "",
        sourceId: "fbm-" + it.id
      });
    }
    if (!listings.length) {
      return { status: "blocked", count: 0, error: "no parseable Marketplace items (page structure changed, empty results, or needs login)", listings: [] };
    }
    return { status: "ok", count: listings.length, error: "", listings: listings };
  } finally {
    await page.close().catch(() => {});
  }
}

// One-time interactive login: opens a headed Chrome with the persistent
// profile, waits for the user to reach Marketplace, then stores the session.
async function login() {
  const browser = await context(false);
  const page = await browser.newPage();
  await page.goto("https://www.facebook.com/marketplace", { waitUntil: "domcontentloaded", timeout: 60000 });
  console.log("FB login: sign in in the opened browser, then visit Marketplace. Waiting for Marketplace to load…");
  let ok = false;
  const deadline = Date.now() + 180000;
  while (Date.now() < deadline) {
    try {
      await page.waitForSelector('a[href*="/marketplace/item/"], [aria-label="Marketplace"]', { timeout: 8000 });
      ok = true;
      break;
    } catch (e) { /* keep polling */ }
  }
  await page.close();
  if (ok) console.log("FB login: session saved — worker can now scan Marketplace.");
  else console.log("FB login: timed out waiting for Marketplace — profile still saved; run again after finishing login.");
  return ok;
}

module.exports = { available, bootError, availableInfo, search, login };