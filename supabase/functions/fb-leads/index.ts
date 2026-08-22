import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.8";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-hub-signature-256",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
};

const VERIFY_TOKEN = Deno.env.get("META_VERIFY_TOKEN") ?? "";
const PAGE_TOKEN = Deno.env.get("META_PAGE_TOKEN") ?? "";
const APP_SECRET = Deno.env.get("META_APP_SECRET") ?? "";
const DEFAULT_ASSIGN_EMAIL = Deno.env.get("FB_LEADS_DEFAULT_BROKER_EMAIL") ?? "";

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

async function verifySignature(raw: string, signature: string): Promise<boolean> {
  if (!APP_SECRET) return true; // optional in dev; strongly recommended in prod
  if (!signature.startsWith("sha256=")) return false;
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(APP_SECRET),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  const sig = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(raw));
  const hex = Array.from(new Uint8Array(sig)).map(b => b.toString(16).padStart(2, "0")).join("");
  return hex === signature.slice(7);
}

function pick(fields: Array<{ name: string; values: string[] }>, keys: string[]): string {
  for (const k of keys) {
    const f = fields.find(f => (f.name || "").toLowerCase() === k);
    if (f && f.values && f.values[0]) return f.values[0];
  }
  return "";
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const url = new URL(req.url);

  // ── Meta webhook verification handshake ────────────────────────────
  if (req.method === "GET") {
    const mode = url.searchParams.get("hub.mode");
    const token = url.searchParams.get("hub.verify_token");
    const challenge = url.searchParams.get("hub.challenge");
    if (mode === "subscribe" && token && token === VERIFY_TOKEN) {
      return new Response(challenge ?? "", { status: 200 });
    }
    return json({ ok: false, error: "Verification failed" }, 403);
  }

  if (req.method !== "POST") return json({ ok: false, error: "Method not allowed" }, 405);

  // ── Signature check (when APP_SECRET configured) ────────────────────
  const raw = await req.text();
  const signature = req.headers.get("x-hub-signature-256") ?? "";
  if (!(await verifySignature(raw, signature))) {
    return json({ ok: false, error: "Invalid signature" }, 401);
  }

  let body: any;
  try { body = JSON.parse(raw); } catch { return json({ ok: false, error: "Bad JSON" }, 400); }
  if (body.object !== "page") return json({ ok: true, ignored: true });

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL") ?? "",
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""
  );

  // Default assignee: configured email first, else any approved super-admin.
  let assigneeId: string | null = null;
  if (DEFAULT_ASSIGN_EMAIL) {
    const p = await supabase.from("profiles")
      .select("id").eq("email", DEFAULT_ASSIGN_EMAIL.toLowerCase())
      .eq("registration_status", "approved").limit(1).maybeSingle();
    if (p.data) assigneeId = p.data.id;
  }
  if (!assigneeId) {
    const sa = await supabase.from("profiles")
      .select("id").eq("role", "super-admin")
      .eq("registration_status", "approved").limit(1).maybeSingle();
    if (sa.data) assigneeId = sa.data.id;
  }
  if (!assigneeId) {
    return json({ ok: false, error: "No approved broker/admin to assign leads to" }, 500);
  }

  const results: Array<{ leadgen_id: string; action: string }> = [];

  for (const entry of body.entry ?? []) {
    for (const change of entry.changes ?? []) {
      if (change.field !== "leadgen") continue;
      const v = change.value ?? {};
      const leadgenId = String(v.leadgen_id || "");
      if (!leadgenId) continue;

      // dedupe by id
      const existing = await supabase.from("crm_leads")
        .select("id").eq("id", "fb-" + leadgenId).maybeSingle();
      if (existing.data) { results.push({ leadgen_id: leadgenId, action: "duplicate" }); continue; }

      // fetch full field data from Graph API
      let fields: Array<{ name: string; values: string[] }> = [];
      try {
        const gr = await fetch(
          `https://graph.facebook.com/v19.0/${leadgenId}?access_token=${encodeURIComponent(PAGE_TOKEN)}`
        );
        const gj = await gr.json();
        fields = gj.field_data ?? [];
      } catch { /* fall through with empty fields */ }

      const name = pick(fields, ["full_name", "name"]) || "Facebook Lead";
      const email = pick(fields, ["email"]);
      const phone = pick(fields, ["phone_number", "phone"]);

      const insert = await supabase.from("crm_leads").insert({
        id: "fb-" + leadgenId,
        ref: "FB-" + leadgenId.slice(-6),
        name,
        assigned_to_id: assigneeId,
        payload: {
          status: "new",
          source: "facebook",
          email,
          phone,
          form_id: String(v.form_id || ""),
          page_id: String(v.page_id || ""),
          created_time: v.created_time || "",
          notes: "Auto-imported from Facebook Lead Ads.",
        },
        created_by: assigneeId,
      });

      results.push({ leadgen_id: leadgenId, action: insert.error ? "error:" + insert.error.message : "created" });

      await supabase.rpc("notify_user", {
        target_user: assigneeId,
        n_type: "lead",
        n_title: "New Facebook lead: " + name,
        n_body: [email, phone].filter(Boolean).join(" · ") || "Open CRM to view details.",
        n_link: "leads",
      });
    }
  }

  return json({ ok: true, results });
});
