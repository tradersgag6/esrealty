# Deployment Guide — CRM Autopilot + Market Scan Stores

Three deployment targets. Steps 1–3 enable the CRM Autopilot (queued agent tasks
run by a timed edge function); Step 4 covers the store-locator dev-only route that
was just added.

## 1. Supabase — schema (run once)

Run these in the Supabase **SQL Editor** (Project → SQL Editor → New query →
paste file → Run), in order. All are safe to re-run any number of times:
1. `supabase/crm_leads.sql` — CRM + RLS helpers (`crm_lead_broker_of` etc.)
2. `supabase/compliance_registry.sql` — `compliance_records` (self-contained: it
   now defines `address_book_profile_accessible`, its RLS helper).
3. `supabase/agent_tasks.sql` — `agent_tasks` + `agent_steps` + the four
   service-role worker RPCs (`agent_claim_due` / `agent_complete` /
   `agent_cancel` / `agent_snooze_lead`) and `agent_set_step` (invoker-rights,
   RLS-gated so reps can only resolve steps on leads they own/supervise).

> **Gotcha (fixed 2026-09-19):** `compliance_registry.sql` originally referenced
> `address_book_profile_accessible(text, uuid)` in its RLS policies without ever
> defining it, so `create policy` failed with
> `ERROR: 42883 ... function address_book_profile_accessible(text, uuid) does
> not exist`. The file now ships with the definition. If you deployed an older
> copy, re-run the current file.

CLI alternative:
```
supabase login
supabase link --project-ref <ref>
supabase db push   # or: psql "$DATABASE_URL" -f agent_tasks.sql
```

## 2. Supabase — deploy the `agent-dispatch` edge function

The function needs `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` and
`AGENT_DISPATCH_SECRET`. `SUPABASE_URL`/`SUPABASE_SERVICE_ROLE_KEY` are **default
secrets** (always available); only the dispatcher secret is custom:

```
cd supabase
supabase functions deploy agent-dispatch
supabase secrets set AGENT_DISPATCH_SECRET="<long-random-token>"
```

Manual alternative (match the deployed ref `mrngaqtbaseewzcsogqi`):
- Dashboard → **Project Settings → Secrets → Custom secrets** → add
  `AGENT_DISPATCH_SECRET` (default secrets already cover URL + service role).

> **JWT verification must be OFF** for this function (Edge Functions →
> agent-dispatch → Settings → "Verify JWT" toggle → **off** → Save). The
> function checks `x-agent-dispatch-secret` itself; the platform JWT gate
> otherwise rejects the cron's no-`Authorization` calls with
> `UNAUTHORIZED_NO_AUTH_HEADER` before the code runs.

Verify it answers (claim tick + auth both ways work):
```
curl -X POST "https://<ref>.supabase.co/functions/v1/agent-dispatch" \
  -H "Content-Type: application/json" -H "x-agent-dispatch-secret: <token>" \
  -d '{}'
```
A `401 Unauthorized` on a wrong secret is actually a good sign — it proves the
function is alive and reachable.

## 3. Vercel — cron tick + env

This project deploys via the **CLI from the repo root**, not Git integration —
pushing to GitHub does *not* trigger Vercel deploys. The `.vercel` link lives at
the repo root; the project's Root Directory is `market-scan/vercel`.

```
npm i -g vercel; vercel login          # once
# from the REPO ROOT (never from market-scan/vercel — the CLI doubles the path):
vercel deploy --prod --yes
```

Env vars (add via CLI — stored as hidden Secrets):
```
echo "https://<ref>.supabase.co/functions/v1/agent-dispatch" | vercel env add AGENT_EDGE_URL production
echo "<same token as AGENT_DISPATCH_SECRET>"                  | vercel env add AGENT_EDGE_TOKEN production
vercel deploy --prod --yes     # re-deploy so envs are baked in
```

`vercel.json` defines the schedule — **daily** because the Vercel Hobby plan
only allows one cron run per day (an hourly `0 * * * *` fails the deploy with an
explicit plan error). Upgrade to Pro for hourly:
```json
"crons": [{ "path": "/api/agent-dispatch", "schedule": "0 6 * * *" }]
```
The cron calls `api/agent-dispatch`, which claims due tasks and runs the recheck
ladder. **Known behavior:** if `AGENT_EDGE_URL`/`AGENT_EDGE_TOKEN` are unset, the
shim no-ops silently (`{"ok":true,"skipped":"agent edge not configured"}`).

> **Gotcha (fixed 2026-09-19):** `api/agent-dispatch.js` originally returned a
> Web `Response` from a `module.exports = async (req, res)` handler. Vercel's
> Node runtime ignores that return value, so the request sat until the 300s
> timeout. It now writes through `res` using the same `(req, res)` style as
> `api/ping.js`.

Verify end-to-end:
```
https://esrealty-market-scan.vercel.app/api/agent-dispatch
```
Expect `{"ok":true,"claimed":0,"done":0}` (or `skipped: "no edge env"` if not
wired).

## 4. Store locator — dev-only route (already applied)

`market-scan/vercel/server.js` now serves `/api/market-scan/stores` locally with
the worker's 24 h in-memory cache semantics (`cached`/`refreshed`/`stale`/
`cachedAt`). This is **dev/harness only** — it makes `stores_freshness_e2e` and
store-locator flows testable against `:8932`.

The **hosted** Vercel adapter (`vercel/api/market-scan/stores.js`) intentionally
does **not** emit those keys — `tests/backend_parity_node.js` enforces that
contract — so the production "Served from cache" chip will not appear. If you want
the chip live in production, the parity test + adapter must be changed together
(not a one-liner; do it deliberately).

## Expected production behavior after steps 1–4

- Leads in the app: each Run/Recheck pushes `agent_tasks` rows; the hourly cron
  leases and executes them; steps + evidence sync back into OSM-rendered Agent tab.
- Offline degrade: no Supabase/Vercel connectivity → the app's local engine still
  ticks, and steps render as "missing cloud" until connectivity returns.
- The `Cached · observed` chip on store results appears on local dev only.