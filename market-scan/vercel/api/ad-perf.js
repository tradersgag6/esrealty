"use strict";

// Ad-performance sync seam for the CRM "Ad ROI" card (PHASE_0_1_BUILD.md 1.3).
// Marketplace channels (Lamudi, Property24, Facebook, TikTok) only expose
// view/inquiry counts behind partner credentials, so this endpoint is a no-op
// until AD_PERF_SOURCE_URL is configured. When set it fetches the upstream feed
// and normalizes it to { ok:true, ads:[{id,perfViews,perfInquiries,url}] } for
// the browser to merge into each ad_posts.payload record. No data is fabricated.

const AD_PERF_SOURCE_URL = process.env.AD_PERF_SOURCE_URL || "";
const AD_PERF_SOURCE_TOKEN = process.env.AD_PERF_SOURCE_TOKEN || "";

function normNum(v) {
  const n = Number(v);
  return isFinite(n) ? Math.max(0, Math.round(n)) : null;
}

function normalize(data) {
  const rows = Array.isArray(data) ? data : (data && Array.isArray(data.ads) ? data.ads : []);
  return rows
    .map(r => {
      r = r || {};
      const views = normNum(r.perfViews != null ? r.perfViews : r.views);
      const inquiries = normNum(r.perfInquiries != null ? r.perfInquiries : r.inquiries);
      return {
        id: String(r.id || r.adId || ""),
        perfViews: views,
        perfInquiries: inquiries,
        url: String(r.url || "")
      };
    })
    .filter(x => x.id && (x.perfViews !== null || x.perfInquiries !== null));
}

module.exports = async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  if (req.method === "OPTIONS") {
    res.status(204).end();
    return;
  }
  if (req.method !== "GET" && req.method !== "POST") {
    res.status(405).json({ ok: false, error: "Method not allowed" });
    return;
  }
  if (!AD_PERF_SOURCE_URL) {
    res.status(200).json({ ok: true, skipped: "ad perf source not configured" });
    return;
  }
  try {
    const headers = { Accept: "application/json" };
    if (AD_PERF_SOURCE_TOKEN) headers.Authorization = "Bearer " + AD_PERF_SOURCE_TOKEN;
    const r = await fetch(AD_PERF_SOURCE_URL, { headers });
    if (!r.ok) throw new Error("upstream HTTP " + r.status);
    const data = await r.json().catch(() => null);
    res.status(200).json({ ok: true, ads: normalize(data), syncedAt: new Date().toISOString() });
  } catch (e) {
    res.status(502).json({ ok: false, error: String((e && e.message) || e) });
  }
};

module.exports.normalize = normalize;
