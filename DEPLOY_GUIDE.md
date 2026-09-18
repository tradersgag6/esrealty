# Deployment Guide — CRM Autopilot + Market Scan Stores

Three deployment targets. Steps 1–3 enable the CRM Autopilot (queued agent tasks
run by a timed edge function); Step 4 covers the store-locator dev-only route that
was just added.

## 1. Supabase — schema (run once)

Run `supabase/agent_tasks.sql` in your Supabase project's **SQL Editor**
(Project → SQL Editor → New query → paste file → Run).

What it creates:
- `agent_tasks` (queued follow-ups) + `agent_steps` (evidence ledger rows)
- Indexes + `agent_claim_due` / `agent_complete` / `agent_cancel` /
  `agent_snooze_lead` (service_role-only, lease via `FOR UPDATE SKIP LOCKED`)
- `agent_set_step` (invoker-rights, RLS-gated so reps can only resolve steps on
  leads they own/supervise)

CLI alternative:
```
supabase login
supabase link --project-ref <ref>
supabase db push   # or: psql "$DATABASE_URL" -f agent_tasks.sql
```

## 2. Supabase — deploy the `agent-dispatch` edge function

```
cd supabase
supabase functions deploy agent-dispatch
supabase secrets set AGENT_DISPATCH_SECRET="<long-random-token>"
```

The function needs `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY`; on a linked
project these are injected automatically. If you deployed without linking:
```
supabase secrets set SUPABASE_URL="https://<ref>.supabase.co"
supabase secrets set SUPABASE_SERVICE_ROLE_KEY="<service-role-key>"
```

Verify it answers (claim tick + auth both ways work):
```
curl -X POST "https://<ref>.supabase.co/functions/v1/agent-dispatch" \
  -H "Authorization: Bearer $SUPABASE_SERVICE_ROLE_KEY" -H "Content-Type: application/json" \
  -d '{}'
```

## 3. Vercel — cron tick + env

With the project linked and `market-scan/vercel` as the framework root:
```
cd market-scan/vercel
vercel --prod
vercel env add AGENT_EDGE_URL      # https://<ref>.supabase.co/functions/v1/agent-dispatch
vercel env add AGENT_EDGE_TOKEN    # same value as AGENT_DISPATCH_SECRET
vercel --prod   # re-deploy so envs are baked in
```

`vercel.json` already defines the schedule:
```json
"crons": [{ "path": "/api/agent-dispatch", "schedule": "0 * * * *" }]
```
Once an hour the cron calls `api/agent-dispatch`, which claims due tasks and
runs the recheck ladder. (Thinned from 5-minute to hourly in the quota-reduction
cleanup to cut edge-function invocations and DB compute ~12x; if you need faster
Autopilot picks, revert to `*/5`.) **Known behavior:** if `AGENT_EDGE_URL`/`AGENT_EDGE_TOKEN`
are unset, the shim no-ops silently (so it is safe to deploy before wiring envs).
Cron jobs require a paid plan on Vercel; on a free plan the scheduler will not fire
— in that case add a manual trigger (GitHub Actions scheduled call, or uptime-robot
ping to `/api/agent-dispatch`) instead.

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