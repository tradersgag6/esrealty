"use strict";

// Headless scheduler shim for the CRM Autopilot. Called by a Vercel Cron
// (see vercel.json "crons"). When AGENT_EDGE_URL + AGENT_EDGE_TOKEN are set it
// pings the Supabase agent-dispatch edge function, which claims due tasks and
// writes evidence steps. Without those envs this is a harmless no-op, so local
// development and cold deploys are unaffected.

const AGENT_EDGE_URL = process.env.AGENT_EDGE_URL || "";
const AGENT_EDGE_TOKEN = process.env.AGENT_EDGE_TOKEN || "";

module.exports = async function handler(req) {
  if (req.method !== "GET" && req.method !== "POST") {
    return new Response(JSON.stringify({ ok: false, error: "Method not allowed" }), {
      status: 405,
      headers: { "Content-Type": "application/json" },
    });
  }
  if (!AGENT_EDGE_URL || !AGENT_EDGE_TOKEN) {
    return new Response(JSON.stringify({ ok: true, skipped: "agent edge not configured" }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
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
    return new Response(text, {
      status: r.status,
      headers: { "Content-Type": "application/json" },
    });
  } catch (e) {
    return new Response(JSON.stringify({ ok: false, error: String(e && e.message || e) }), {
      status: 502,
      headers: { "Content-Type": "application/json" },
    });
  }
};