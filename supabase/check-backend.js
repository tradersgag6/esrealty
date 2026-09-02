"use strict";
// Backend health checker for ES Realty.
//
// Pings every Supabase edge function to confirm it is deployed, verifies that
// protected routes enforce auth, and reads each function's source to report
// which environment variables it references (so you know what must be set in
// Project Settings -> Edge Functions -> Secrets).
//
// Usage:
//   node supabase/check-backend.js [--ref YOUR_PROJECT_REF]
//
// Defaults to the production project ref mrngaqtbaseewzcsogqi. You never need
// secrets to run this — it only hits public/health routes and expects 401/403
// on protected ones.

const SUPER_BASE = "supabase/functions";
const fs = require("fs");
const path = require("path");

const arg = (name, dflt) => {
  const i = process.argv.indexOf(name);
  return i >= 0 && process.argv[i + 1] ? process.argv[i + 1] : dflt;
};
const REF = arg("--ref", "mrngaqtbaseewzcsogqi");
const BASE = `https://${REF}.supabase.co/functions/v1`;

const fnDir = path.join(__dirname, "functions");

// Each entry: name + the probe request(s) that exercise the deployed function
// using only public/unauthenticated calls:
//   { path, method, expect }  expect = HTTP status we assert to prove the
//   function is deployed and behaviour is correct.
const FUNCTIONS = [
  {
    name: "listing-api",
    probes: [
      { path: "/listing-api/api/listings?per_page=1", method: "GET", expect: 200, note: "public catalog" },
      { path: "/listing-api/api/users/me/listings", method: "GET", expect: 401, note: "protected route rejects anonymous (auth enforced)" },
      { path: "/listing-api/api/site-settings", method: "GET", expect: 200, note: "site settings" },
    ],
  },
  {
    name: "seo",
    probes: [
      { path: "/seo/robots.txt", method: "GET", expect: 200 },
      { path: "/seo/sitemap.xml", method: "GET", expect: 200 },
    ],
    parse: (fn, seen) => (/Deno\.env\.get\("([^"]+)"\)/.exec(fn) || []).slice(1).forEach(v => seen.add(v)),
  },
  {
    name: "fb-leads",
    probes: [
      // GET without the right token must 403 (verification fails) — proves deploy.
      { path: "/fb-leads?hub.mode=subscribe&hub.verify_token=wrong&hub.challenge=123", method: "GET", expect: 403, note: "webhook rejects bad verify token" },
    ],
  },
  {
    name: "admin-delete-account",
    probes: [
      { path: "/admin-delete-account", method: "POST", expect: 401, note: "rejects anonymous session", body: { user_id: "x" } },
    ],
  },
  {
    name: "admin-create-account",
    probes: [
      { path: "/admin-create-account", method: "POST", expect: 401, note: "rejects anonymous session", body: { email: "a@b.co" } },
    ],
  },
  {
    name: "notify-dispatch",
    probes: [
      // POST without secret/service key must 401.
      { path: "/notify-dispatch", method: "POST", expect: 401, note: "rejects missing secret", body: { to: "x", subject: "x" } },
    ],
  },
  {
    name: "nearby-scan",
    // NOTE: the app computes nearby amenities locally and does not call this
    // function, so a miss here is informational, not a live outage.
    probes: [
      { path: "/nearby-scan", method: "POST", expect: 400, note: "rejects missing coords (function unused by app)", body: {} },
    ],
  },
];

// Extract referenced env vars from each function source for the "must be set"
// report. Managed/auto-injected vars (SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)
// are excluded from the "manual" list.
const AUTO_VARS = new Set(["SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY"]);
const KNOWN_VARS = new Map([
  ["INQUIRY_RATE_LIMIT_SALT", "listing-api", "private salt for inquiry rate limiting"],
  ["META_VERIFY_TOKEN", "fb-leads", "Meta webhook verify token"],
  ["META_PAGE_TOKEN", "fb-leads", "Meta page access token (Graph API)"],
  ["META_APP_SECRET", "fb-leads", "Meta app secret (signature verification)"],
  ["FB_LEADS_DEFAULT_BROKER_EMAIL", "fb-leads", "default broker to auto-assign Facebook leads"],
  ["RESEND_API_KEY", "notify-dispatch", "Resend API key for email notifications"],
  ["MAIL_FROM", "notify-dispatch", "email from address (defaults to onboarding@resend.dev)"],
  ["SEMAPHORE_API_KEY", "notify-dispatch", "Semaphore API key for PH SMS"],
  ["SEMAPHORE_SENDER", "notify-dispatch", "Semaphore sender name (defaults ESRealty)"],
  ["NOTIFY_DISPATCH_SECRET", "notify-dispatch", "shared secret authorizing /notify-dispatch POSTs"],
  ["SITE_URL", "seo", "canonical site URL for SEO tags (defaults to GitHub Pages)"],
]);

function extractEnvRefs(file) {
  const src = fs.readFileSync(file, "utf8");
  const seen = new Set();
  (src.match(/Deno\.env\.get\("([^"]+)"\)/g) || []).forEach(m => {
    const v = /"([^"]+)"/.exec(m)[1];
    seen.add(v);
  });
  return [...seen].filter(v => !AUTO_VARS.has(v) && KNOWN_VARS.has(v));
}

async function probe(base, p, fnName) {
  const url = base + p.path;
  try {
    const res = await fetch(url, {
      method: p.method,
      headers: { "Content-Type": "application/json" },
      body: p.body !== undefined ? JSON.stringify(p.body) : undefined,
    });
    let status = res.status;
    let extra = "";
    // 401 on a route we expect to be public usually means the function is
    // deployed with JWT verification ON (--verify-jwt) instead of --no-verify-jwt.
    if (p.expect === 200 && status === 401) {
      extra = "  [deployed but JWT-LOCKED — re-deploy with --no-verify-jwt]";
    }
    return { name: fnName, method: p.method, path: p.path, expect: p.expect, got: status, note: p.note || "", extra, ok: status === p.expect };
  } catch (e) {
    return { name: fnName, method: p.method, path: p.path, expect: p.expect, got: "ERR", note: p.note || "", extra: " [not reachable: " + (e && e.message || e) + "]", ok: false };
  }
}

(async () => {
  let ok = true;
  const out = [];
  const envReport = [];

  // 1) Probe all deployed functions
  for (const fn of FUNCTIONS) {
    let srcFile = path.join(fnDir, fn.name, "index.ts");
    if (!fs.existsSync(srcFile)) srcFile = path.join(fnDir, fn.name, "mod.ts");
    for (const p of fn.probes) {
      const r = await probe(BASE, p, fn.name);
      out.push(r);
      if (!r.ok) ok = false;
    }
    // env var report
    const refs = extractEnvRefs(srcFile);
    refs.forEach(v => {
      envReport.push({ var: v, required: KNOWN_VARS.get(v)[0] === "secret", desc: KNOWN_VARS.get(v) });
    });
  }

  // collect unique env vars
  const envMap = new Map();
  envReport.forEach(r => envMap.set(r.var, r));

  // 2) Print deployment table
  console.log("=== DEPLOYMENT CHECK (project ref: " + REF + ") ===\n");
  const byFn = {};
  out.forEach(r => (byFn[r.name] = byFn[r.name] || []).push(r));
  Object.keys(byFn).sort().forEach(name => {
    console.log("[" + name + "]");
    byFn[name].forEach(r => {
      const mark = r.ok ? "OK " : "FAIL";
      const color = r.ok ? "" : "  <-- EXPECTED " + r.expect + ", got " + r.got;
      console.log("  " + mark + "  " + r.method + " " + r.path + (r.note ? "  (" + r.note + ")" : "") + color + r.extra);
    });
    console.log("");
  });

  // 3) Print env var report
  console.log("=== ENV VARS REFERENCED BY FUNCTIONS ===\n");
  console.log("Auto-injected by Supabase (never set manually): SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY\n");
  [...envMap.values()].forEach(r => {
    const kind = /api|secret|token|salt/i.test(r.var) ? "SECRET (set in Edge Functions -> Secrets)" : "OPTIONAL";
    console.log("  - " + r.var + "\n    " + r.desc + "\n    [" + kind + "]\n");
  });

  // 4) Status summary
  const total = out.length, passed = out.filter(r => r.ok).length;
  console.log("=== SUMMARY ===\n");
  console.log("Probes: " + passed + "/" + total + (ok ? " — ALL GOOD" : " — SEE FAILURES ABOVE"));
  console.log("\nHow to read the check:");
  console.log("  - A route returning its EXPECTED status proves the function is DEPLOYED.");
  console.log("  - Protected routes expecting 401/403 prove auth is ENFORCED (not just deployed).");
  console.log("  - 'ERR' (no HTTP status) usually means the function is NOT deployed at BASE.");
  if (!ok) { process.exit(1); }
})();