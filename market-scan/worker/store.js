"use strict";

// =====================================================================
//  Store: persistent listing history + live-median benchmarks.
//  Dependency-free JSON file store (atomic, debounced writes).
//  Data lives in market-scan/worker/store/data.json (git-ignored).
// =====================================================================

const fs = require("fs");
const path = require("path");

class Store {
  constructor(file) {
    this.file = file;
    this._timer = null;
    this._flush = null;
    this._dirty = false;
    this.data = { listings: {}, benches: {} };
    try {
      if (fs.existsSync(file)) {
        const parsed = JSON.parse(fs.readFileSync(file, "utf8"));
        this.data = Object.assign({ listings: {}, benches: {} }, parsed);
      }
    } catch (e) {
      /* corrupt store: start fresh */
    }
    if (!this.data.listings) this.data.listings = {};
    if (!this.data.benches) this.data.benches = {};
    // Periodic flush: survive forced kills that skip SIGINT/SIGTERM.
    this._flush = setInterval(() => { if (this._dirty) { this._dirty = false; this.saveNow(); } }, 5000);
    this._flush.unref();
  }

  get(key) {
    return this.data.listings[key] || null;
  }

  upsert(key, rec) {
    this.data.listings[key] = rec;
    this._schedule();
    return rec;
  }

  // Record a price-per-sqm observation for a bench feed.
  addBench(city, type, mode, pricePerSqm, at) {
    if (!city || !type || !(pricePerSqm > 0)) return;
    const bkey = String(city).trim() + "|" + type + "|" + (mode === "rent" ? "rent" : "sale");
    let arr = this.data.benches[bkey];
    if (!arr) { arr = []; this.data.benches[bkey] = arr; }
    arr.push({ pps: Math.round(pricePerSqm), at: at || Date.now() });
    if (arr.length > 3000) arr.splice(0, arr.length - 3000);
    this._schedule();
  }

  // Live median bench per city (optionally filtered by type/mode).
  bench(n) {
    const out = [];
    for (const key of Object.keys(this.data.benches)) {
      const arr = this.data.benches[key].filter(Boolean);
      if (!arr.length) continue;
      const pp = arr.map(x => x.pps).sort((a, b) => a - b);
      const mid = pp.length >> 1;
      const median = pp.length % 2 ? pp[mid] : Math.round((pp[mid - 1] + pp[mid]) / 2);
      const [city, type, mode] = key.split("|");
      out.push({ city, type, mode, medianPps: median, samples: pp.length, firstSeen: arr[0].at, lastSeen: arr[arr.length - 1].at });
    }
    out.sort((a, b) => a.samples - b.samples);
    if (n) return out.slice(-n).reverse();
    return out.reverse();
  }

  _schedule() {
    this._dirty = true;
    if (this._timer) clearTimeout(this._timer);
    this._timer = setTimeout(() => { this._dirty = false; this.saveNow(); }, 1500);
  }

  saveNow() {
    try {
      fs.mkdirSync(path.dirname(this.file), { recursive: true });
      const tmp = this.file + ".tmp";
      fs.writeFileSync(tmp, JSON.stringify(this.data));
      fs.renameSync(tmp, this.file);
    } catch (e) {
      /* best-effort persistence */
    }
  }
}

module.exports = { Store };