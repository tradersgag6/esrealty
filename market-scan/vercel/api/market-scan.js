"use strict";

const { runMarketScan } = require("./_lib");

function cors(res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
}

module.exports = async function (req, res) {
  cors(res);
  if (req.method === "OPTIONS") {
    res.status(200).end();
    return;
  }
  if (req.method !== "GET") {
    res.status(405).json({ ok: false, error: "Method not allowed" });
    return;
  }
  try {
    const payload = await runMarketScan(req.query || {});
    res.status(200).json(payload);
  } catch (err) {
    res.status(500).json({ ok: false, error: String(err && err.message || err) });
  }
};
