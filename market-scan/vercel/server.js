"use strict";

// Local dev server for the Market Scan engine (replaces the PowerShell
// HttpListener for testing). Run:  node server.js
// Serves http://localhost:8932/api/ping and /api/market-scan

const http = require("http");
const { runMarketScan } = require("./api/_lib");

const PORT = parseInt(process.env.PORT || "8932", 10);

const server = http.createServer(async (req, res) => {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  if (req.method === "OPTIONS") {
    res.statusCode = 204;
    res.end();
    return;
  }
  const url = new URL(req.url, "http://localhost:" + PORT);
  const send = (status, obj) => {
    res.statusCode = status;
    res.setHeader("Content-Type", "application/json; charset=utf-8");
    res.end(JSON.stringify(obj));
  };
  try {
    if (req.method !== "GET") {
      send(405, { ok: false, error: "Method not allowed" });
      return;
    }
    if (url.pathname === "/api/ping") {
      send(200, { ok: true, server: "market-scan", time: new Date().toISOString().slice(0, 19) });
      return;
    }
    if (url.pathname === "/api/market-scan") {
      const query = {};
      for (const [k, v] of url.searchParams.entries()) query[k] = v;
      send(200, await runMarketScan(query));
      return;
    }
    send(404, { ok: false, error: "Not found: " + url.pathname });
  } catch (err) {
    send(500, { ok: false, error: String(err && err.message || err) });
  }
});

server.listen(PORT, () => {
  console.log("Market Scan server listening on http://localhost:" + PORT);
});
