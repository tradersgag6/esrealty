import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.8";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-dispatch-secret",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
};

const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY") ?? "";
const MAIL_FROM = Deno.env.get("MAIL_FROM") ?? "ES Realty <onboarding@resend.dev>";
const SEMAPHORE_API_KEY = Deno.env.get("SEMAPHORE_API_KEY") ?? "";
const SEMAPHORE_SENDER = Deno.env.get("SEMAPHORE_SENDER") ?? "ESRealty";
const DISPATCH_SECRET = Deno.env.get("NOTIFY_DISPATCH_SECRET") ?? "";
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
const BATCH = 25;

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function emailHtml(title: string, bodyText: string) {
  const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  return [
    '<div style="font-family:Arial,sans-serif;max-width:520px;margin:auto;padding:24px;border:1px solid #e5e7eb;border-radius:12px">',
    '<div style="font-weight:800;font-size:18px;color:#1e2a3a;margin-bottom:8px">ES Realty</div>',
    '<div style="font-size:16px;font-weight:700;margin-bottom:6px">' + esc(title) + "</div>",
    '<div style="font-size:14px;color:#374151;line-height:1.5">' + esc(bodyText) + "</div>",
    '<hr style="border:none;border-top:1px solid #e5e7eb;margin:18px 0">',
    '<div style="font-size:12px;color:#6b7280">You are receiving this because you have an ES Realty account. Sign in to view details.</div>',
    "</div>",
  ].join("");
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  // Auth: shared dispatch secret OR the service-role key.
  const secretHeader = req.headers.get("x-dispatch-secret") ?? "";
  const authHeader = req.headers.get("authorization") ?? "";
  const okSecret = !!DISPATCH_SECRET && secretHeader === DISPATCH_SECRET;
  const okService = !!SERVICE_KEY && authHeader === "Bearer " + SERVICE_KEY;
  if (!okSecret && !okService) return json({ ok: false, error: "Unauthorized" }, 401);

  if (!RESEND_API_KEY && !SEMAPHORE_API_KEY) {
    return json({ ok: true, skipped: "No RESEND_API_KEY / SEMAPHORE_API_KEY configured" });
  }

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL") ?? "",
    SERVICE_KEY,
  );

  const pending = await supabase.from("notifications")
    .select("id,user_id,type,title,body")
    .or("emailed_at.is.null,sms_sent_at.is.null")
    .order("created_at", { ascending: false })
    .limit(BATCH);

  if (pending.error) return json({ ok: false, error: pending.error.message }, 500);

  let emails = 0, sms = 0, errors = 0;

  for (const n of pending.data ?? []) {
    const prof = await supabase.from("profiles")
      .select("email,phone,full_name").eq("id", n.user_id).maybeSingle();
    const email = prof.data?.email ?? "";
    const phone = prof.data?.phone ?? "";

    // ── Email via Resend ─────────────────────────────────────────────
    if (RESEND_API_KEY && email && !(n as any).emailed_at) {
      try {
        const r = await fetch("https://api.resend.com/emails", {
          method: "POST",
          headers: { Authorization: "Bearer " + RESEND_API_KEY, "Content-Type": "application/json" },
          body: JSON.stringify({
            from: MAIL_FROM,
            to: [email],
            subject: "ES Realty — " + (n.title ?? "Notification"),
            html: emailHtml(n.title ?? "", n.body ?? ""),
          }),
        });
        if (r.ok) {
          await supabase.from("notifications").update({ emailed_at: new Date().toISOString() }).eq("id", n.id);
          emails++;
        } else { errors++; }
      } catch { errors++; }
    }

    // ── SMS via Semaphore (PH) — only for urgent types ───────────────
    if (SEMAPHORE_API_KEY && phone && !(n as any).sms_sent_at && ["approval", "lead"].includes(n.type ?? "")) {
      try {
        const msg = "ES Realty: " + (n.title ?? "") + (n.body ? ". " + n.body : "");
        const r = await fetch("https://api.semaphore.co/api/v4/messages", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ apikey: SEMAPHORE_API_KEY, number: phone, message: msg.slice(0, 300), sendername: SEMAPHORE_SENDER }),
        });
        if (r.ok) {
          await supabase.from("notifications").update({ sms_sent_at: new Date().toISOString() }).eq("id", n.id);
          sms++;
        } else { errors++; }
      } catch { errors++; }
    }
  }

  return json({ ok: true, scanned: (pending.data ?? []).length, emails, sms, errors });
});
