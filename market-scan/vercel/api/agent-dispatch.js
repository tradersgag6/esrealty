"use strict";

// Headless scheduler shim for the CRM Autopilot. Called by a Vercel Cron
// (see vercel.json "crons"). When AGENT_EDGE_URL + AGENT_EDGE_TOKEN are set it
// pings the Supabase agent-dispatch edge function, which claims due tasks and
// writes evidence steps. Without those envs this is a harmless no-op, so local
// development and cold deploys are unaffected.

const AGENT_EDGE_URL = process.env.AGENT_EDGE_URL || "";
const AGENT_EDGE_TOKEN = process.env.AGENT_EDGE_TOKEN || "";

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
  if (!AGENT_EDGE_URL || !AGENT_EDGE_TOKEN) {
    res.status(200).json({ ok: true, skipped: "agent edge not configured" });
    return;
  }
  try {
    const r = await fetch(AGENT_EDGE_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-agent-dispatch-secret": AGENT_EDGE_TOKEN,
      },
      body: JSON.stringify({ max: 25 }),
    });
    const text = await r.text();
    res.setHeader("Content-Type", "application/json");
    res.status(r.status).end(text);
  } catch (e) {
    res.status(502).json({ ok: false, error: String((e && e.message) || e) });
  }
};