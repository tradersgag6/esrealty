"use strict";

const { findStores } = require("../store_chains");

module.exports = async function (req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  if (req.method === "OPTIONS") {
    res.status(204).end();
    return;
  }
  if (req.method !== "GET") {
    res.status(405).json({ ok: false, error: "Method not allowed" });
    return;
  }
  try {
    const payload = await findStores(req.query || {});
    const isRefresh = req.query && req.query.refresh === "1";
    res.setHeader("Cache-Control", isRefresh ? "no-store, max-age=0" : "public, s-maxage=3600, stale-while-revalidate=86400");
    res.status(200).json(payload);
  } catch (err) {
    res.status(500).json({ ok: false, error: String(err && err.message || err) });
  }
};

module.exports.config = { maxDuration: 60 };