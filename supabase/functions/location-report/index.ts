import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.8";
import { PDFDocument, StandardFonts, rgb } from "npm:pdf-lib@1.17.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "content-type, authorization, apikey, idempotency-key",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY") ?? "";
const MAIL_FROM = Deno.env.get("MAIL_FROM") ?? "ES Realty <onboarding@resend.dev>";
const MAX_BODY_BYTES = 200_000;
const MAX_ESTIMATE_JSON_BYTES = 8_000;

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function esc(s: string) {
  return String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

function money(n: unknown) {
  const v = Number(n || 0);
  return "₱" + new Intl.NumberFormat("en-PH", { maximumFractionDigits: 0 }).format(Math.round(v));
}

/* PDF bodies use only the ASCII-safe Helvetica standard font family, which
   cannot encode U+20B1 (₱). Keep the peso symbol out of every drawText call
   and emit "PHP " instead — the email body (HTML/UTF-8) still uses ₱. */
function moneyPdf(n: unknown) {
  const v = Math.round(Number(n || 0));
  return "PHP " + Number.isFinite(v) ? new Intl.NumberFormat("en-PH", { maximumFractionDigits: 0 }).format(v) : "0";
}

function str(v: unknown, max: number) {
  return String(v ?? "").trim().slice(0, max);
}

function num(v: unknown) {
  const n = Number(v);
  return isFinite(n) && n >= 0 ? n : 0;
}

class BodyError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

async function readJsonLimited(req: Request, maxBytes = MAX_BODY_BYTES) {
  const declared = Number(req.headers.get("content-length") || -1);
  if (declared > maxBytes) throw new BodyError(413, "Request body is too large");
  if (!req.body) throw new BodyError(400, "Request body is required");
  const reader = req.body.getReader();
  const decoder = new TextDecoder();
  let size = 0;
  let text = "";
  while (true) {
    const chunk = await reader.read();
    if (chunk.done) break;
    size += chunk.value.byteLength;
    if (size > maxBytes) {
      await reader.cancel();
      throw new BodyError(413, "Request body is too large");
    }
    text += decoder.decode(chunk.value, { stream: true });
  }
  text += decoder.decode();
  try {
    const parsed = JSON.parse(text);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) throw new Error();
    return parsed as Record<string, unknown>;
  } catch {
    throw new BodyError(400, "Invalid JSON body");
  }
}

function wrap(font: any, text: string, maxWidth: number) {
  const words = String(text).split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  let line = "";
  for (const w of words) {
    const candidate = line ? line + " " + w : w;
    if (!line || font.widthOfTextAtSize(candidate, 9) <= maxWidth) {
      line = candidate;
    } else {
      lines.push(line);
      line = w;
    }
  }
  if (line) lines.push(line);
  return lines;
}

/* ------------------------------------------------------------------ */
/* field/schema sanitation — the estimate stored on a CRM lead is      */
/* CLIENT-SUPPLIED. We cap every field and keep a truthfulness marker  */
/* so the CRM can never mistake a self-reported figure for a verified  */
/* BIR appraisal. (Full server-side recomputation needs the imported   */
/* schedule files; that is a follow-up, not silently assumed.)         */
/* ------------------------------------------------------------------ */

const SCORE_KEYS = [
  "accessibilityScore", "trafficScore", "populationScore",
  "futureDevScore", "competitionScore", "commercialGrowthScore",
];

function sanitizeEstimate(raw: any): any {
  if (!raw || typeof raw !== "object") return null;
  const out: Record<string, unknown> = {};
  const numberKeys = ["total", "marketGuideEstimate", "recommendedAskingPrice", "low", "high", "perSqm", "birZonalRatePerSqm", "birZonalValue", "landValue", "improvement", "area", "floorArea", "landPerSqm", "salePrice", "ownershipAdjustmentPct"];
  for (const k of numberKeys) {
    if (k in raw) { const n = Number(raw[k]); if (isFinite(n)) out[k] = Math.round(n * 100) / 100; }
  }
  const stringKeys = ["municipality", "barangay", "street", "classification",
    "classificationLabel", "use", "coverage", "sourceLevel", "purpose", "type",
    "typeLabel", "calculationVersion", "dataVersion", "asOf", "schedule", "occupancy", "titleStatus", "inheritanceStatus"];
  for (const k of stringKeys) {
    if (raw[k] != null) out[k] = str(raw[k], 120);
  }
  if (raw.marketGuideAvailable != null) out.marketGuideAvailable = raw.marketGuideAvailable === true;
  if (raw.confidencePct != null) { const n = Number(raw.confidencePct); if (isFinite(n)) out.confidencePct = n; }
  if (raw.source && typeof raw.source === "object") {
    const s = raw.source as Record<string, unknown>;
    out.source = {
      level: str(s.level, 60),
      depth: Number(s.depth),
      pct: Number.isFinite(Number(s.pct)) ? Number(s.pct) : null,
      label: str(s.label, 160),
      count: Number.isFinite(Number(s.count)) ? Number(s.count) : null,
    };
  }
  if (raw.marketGuide && typeof raw.marketGuide === "object") {
    const m = raw.marketGuide as Record<string, unknown>;
    out.marketGuide = {
      sourceType: str(m.sourceType, 120),
      comparableCount: Number.isFinite(Number(m.comparableCount)) ? Number(m.comparableCount) : 0,
      comparableMedianPricePerSqm: Number.isFinite(Number(m.comparableMedianPricePerSqm)) ? Number(m.comparableMedianPricePerSqm) : 0,
      status: str(m.status, 80),
    };
  }
  return out;
}

function sanitizeReport(raw: any): any {
  const source = raw && typeof raw === "object" ? raw : {};
  const property = (source.property && typeof source.property === "object") ? source.property : {};
  const location = (source.location && typeof source.location === "object") ? source.location : {};
  const estimate = sanitizeEstimate(source.estimate);
  const out: Record<string, unknown> = {
    property: {
      purpose: str(property.purpose, 80),
      type: str(property.type, 40),
      typeLabel: str(property.typeLabel, 80),
      kind: property.kind === "built" ? "built" : property.kind === "land" ? "land" : "",
      area: num(property.area),
      corner: !!property.corner,
      floorArea: num(property.floorArea),
      floors: str(property.floors, 20),
      ageBand: str(property.ageBand, 20),
      construction: str(property.construction, 40),
      features: Array.isArray(property.features) ? property.features.map((f: unknown) => str(f, 40)).slice(0, 20) : [],
    },
    location: {
      region: str(location.region, 80),
      province: str(location.province, 80),
      town: str(location.town, 80),
      barangay: str(location.barangay, 120),
      address: str(location.address, 200),
      streetListed: !!location.streetListed,
      lat: location.lat == null ? null : num(location.lat),
      lng: location.lng == null ? null : num(location.lng),
    },
    estimate,
    asOf: str(source.asOf, 60),
    disclaimer: str(source.disclaimer, 800),
    trusted: false,
    note: "All figures are client-supplied via the public estimator and were NOT recomputed server-side.",
  };
  return out;
}

async function buildPdf(p: any) {
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);
  let page = doc.addPage([595.28, 841.89]);
  let y = page.getHeight() - 48;
  const W = page.getWidth();
  const navy = rgb(0.12, 0.16, 0.23);
  const tan = rgb(0.49, 0.33, 0.11);
  const gray = rgb(0.36, 0.4, 0.44);

  function newPage() {
    page = doc.addPage([595.28, 841.89]);
    y = page.getHeight() - 48;
  }

  function ensure(space: number) {
    if (y < 60 + space) newPage();
  }

  function heading(text: string, color = navy) {
    ensure(28);
    page.drawText(text, { x: 48, y, size: 13, font: bold, color });
    y -= 8;
    page.drawRectangle({ x: 48, y: y - 3, width: 90, height: 2, color: tan });
    y -= 20;
  }

  function line(label: string, value: string) {
    ensure(30);
    page.drawText(label, { x: 48, y, size: 9, font: bold, color: gray });
    const lines = wrap(font, value, 420);
    for (const l of lines) {
      if (y < 70) newPage();
      page.drawText(l, { x: 190, y, size: 9, font, color: navy });
      y -= 13;
    }
    if (lines.length === 0) y -= 13;
  }

  function para(text: string, size = 9, color = gray) {
    const lines = wrap(font, text, 500);
    for (const l of lines) {
      ensure(size + 3);
      page.drawText(l, { x: 48, y, size, font, color });
      y -= size + 3;
    }
  }

  page.drawText("ES Realty", { x: 48, y, size: 18, font: bold, color: navy });
  page.drawText("Location Analysis Full Report", { x: 48, y - 18, size: 11, font: bold, color: tan });
  page.drawText("ES Realty · hello@esrealty.ph · esrealty.ph", { x: 420, y, size: 8, font, color: gray });
  y -= 46;
  const report = p.report || {};
  const property = report.property || {};
  const location = report.location || {};
  const analysis = report.analysis || {};
  const estimate = report.estimate || {};

  heading("Property");
  line("Type", property.typeLabel || str(property.type, 80) || "—");
  line("Classification", (property.kind === "built" ? "Built (land + replacement construction)" : property.kind === "land" ? "Land" : "—"));
  line("Lot / land area", num(property.area) > 0 ? num(property.area) + " sqm" : "—");
  if (property.kind === "built") {
    line("Floor / built-up area", num(property.floorArea) > 0 ? num(property.floorArea) + " sqm" : "auto");
    line("Age", num(property.age) + " year(s)");
  }

  heading("Location");
  line("Pinned coordinates", (location.lat != null && location.lng != null) ? num(location.lat).toFixed(6) + ", " + num(location.lng).toFixed(6) : "—");
  line("Address", location.address || "—");
  line("Town", location.town || "—");
  line("Barangay", location.barangay || "—");
  line("Province", location.province || "—");
  line("Region", location.region || "—");

  heading("Nearby establishments (within 1 km — OpenStreetMap scan)");
  if (analysis.present > 0) {
    for (const [k, v] of Object.entries(analysis.nearbyCounts || {})) {
      line(str(k, 40), String(num(v)) + (num(v) > 0 ? "" : " (none)"));
    }
  } else {
    para("No nearby establishment data was found for this pin at scan time.", 9, gray);
  }

  heading("Neighborhood analysis");
  const tags = Array.isArray(analysis.tags) ? analysis.tags.join(", ") : "—";
  line("Neighborhood tags", tags);
  const highlights = Array.isArray(analysis.highlights) ? analysis.highlights.join(" · ") : "—";
  line("Highlights", highlights || "None");
  const risks = Array.isArray(analysis.risks) ? analysis.risks.join(" · ") : "—";
  line("Risks", risks || "None");

  heading("Location scores /100");
  const scoreRows: Array<[string, number]> = [
    ["Accessibility", num(analysis.accessibilityScore)],
    ["Traffic load", num(analysis.trafficScore)],
    ["Population", num(analysis.populationScore)],
    ["Future development", num(analysis.futureDevScore)],
    ["Competition", num(analysis.competitionScore)],
    ["Commercial growth", num(analysis.commercialGrowthScore)],
  ];
  for (const [k, v] of scoreRows) line(k, String(v));

  heading("Estimated value");
  const hasMarketGuide = estimate.marketGuideAvailable !== false && Number(estimate.marketGuideEstimate) > 0;
  if (estimate && (estimate.birZonalValue || estimate.total)) {
    line("Official BIR zonal value", moneyPdf(estimate.birZonalValue || estimate.total));
    if (hasMarketGuide) {
      line("ES Realty market guide", moneyPdf(estimate.marketGuideEstimate));
      line("Indicative range", moneyPdf(estimate.low) + " - " + moneyPdf(estimate.high));
      line("Recommended asking price", moneyPdf(estimate.recommendedAskingPrice || estimate.high));
    } else {
      line("Market guide", "Pending comparable evidence");
      line("Provisional asking price", estimate.recommendedAskingPrice ? moneyPdf(estimate.recommendedAskingPrice) + " (capped BIR guide)" : "Unavailable");
    }
    line("BIR rate per sqm", moneyPdf(estimate.birZonalRatePerSqm || estimate.perSqm) + " on " + num(estimate.area) + " sqm");
    line("Land component", moneyPdf(estimate.landValue || estimate.birZonalValue));
    if (property.kind === "built") {
      line("Improvement component", moneyPdf(estimate.improvement) + " (" + num(estimate.depreciatedPct) + "% age-depreciated)");
    }
    line("Data coverage", str(estimate.coverage, 40) || "good");
    if (estimate.occupancy || estimate.titleStatus || estimate.inheritanceStatus) {
      line("Ownership/title review", "Occupancy: " + str(estimate.occupancy, 50) + " · title: " + str(estimate.titleStatus, 60) + " · inheritance: " + str(estimate.inheritanceStatus, 50));
      line("Indicative marketability adjustment", estimate.ownershipAdjustmentPct ? "-" + num(estimate.ownershipAdjustmentPct) + "%" : "None recorded");
    }
  } else {
    para("No estimate was produced for this location (not yet a covered Batangas town). Our team can check it on the ground.", 9, gray);
  }

  y -= 10;
  ensure(40);
  page.drawText("Tax context on the available reference (guide only)", { x: 48, y, size: 10, font: bold, color: navy });
  y -= 18;
  const t = estimate && (hasMarketGuide ? estimate.marketGuideEstimate : estimate.birZonalValue);
  if (t && t > 0) {
    const cgt = Math.round(t * 0.06), dst = Math.round(t * 0.015), trans = Math.round(t * 0.005);
    line("Capital gains tax 6%", moneyPdf(cgt));
    line("Documentary stamp tax 1.5%", moneyPdf(dst));
    line("Transfer fees ~0.5%", moneyPdf(trans));
  } else {
    line("Tax context", "n/a");
  }

  heading("Notes & disclaimer");
  const contact = report.contact || {};
  if (contact.purpose) line("Client purpose", str(contact.purpose, 80));
  if (contact.budget) line("Client budget", str(contact.budget, 80));
  if (contact.timeline) line("Client timeline", str(contact.timeline, 80));
  if (contact.notes) line("Client notes", str(contact.notes, 240));
  y -= 6;
  para("Reference data as of " + str(report.asOf, 40) + ". " + str(report.disclaimer, 600), 8, gray);
  para("Generated by ES Realty. This is an indicative guide estimate - not a certified appraisal under RA 9646. Confirm with the current BIR zonal schedule and the LGU Schedule of Market Value, and verify site conditions, before any transaction.", 8, gray);

  const bytes = await doc.save();
  return bytes;
}

function emailHtml(p: any) {
  const report = p.report || {};
  const property = report.property || {};
  const location = report.location || {};
  const estimate = report.estimate || {};
  const hasMarketGuide = estimate.marketGuideAvailable !== false && Number(estimate.marketGuideEstimate) > 0;
  const rows = [
    ["Property type", esc(property.typeLabel || property.type || "—")],
    ["Area", esc((num(property.area) || "—") + " sqm") + (property.kind === "built" ? " · " + esc((num(property.floorArea) || "auto") + " sqm floor") : "")],
    ["Location", esc([location.town, location.barangay, location.address].filter(Boolean).join(" · ") || "Pinned location")],
    ["Official BIR / market guide", hasMarketGuide ? esc(money(estimate.marketGuideEstimate)) + " (" + esc(money(estimate.low)) + "–" + esc(money(estimate.high)) + ") · asking " + esc(money(estimate.recommendedAskingPrice || estimate.high)) : (estimate.birZonalValue ? esc(money(estimate.birZonalValue)) + " · provisional asking " + esc(money(estimate.recommendedAskingPrice || 0)) + " · market comparables pending" : "Not estimated")],
  ].map((r) => "<tr><td style='padding:6px 12px;font-size:13px;color:#5f6771'>" + r[0] + "</td><td style='padding:6px 12px;font-size:13px;font-weight:700;color:#1e2a3a'>" + r[1] + "</td></tr>").join("");
  return [
    '<div style="font-family:Arial,sans-serif;max-width:560px;margin:auto;padding:24px;border:1px solid #e5e7eb;border-radius:12px">',
    '<div style="font-weight:800;font-size:18px;color:#1e2a3a;margin-bottom:4px">ES Realty</div>',
    '<div style="font-size:15px;font-weight:700;color:#7d531d;margin-bottom:14px">Your full Location Analysis Report</div>',
    '<p style="font-size:14px;color:#374151;line-height:1.6">Hi ' + esc(p.full_name || "") + ',</p>',
    '<p style="font-size:14px;color:#374151;line-height:1.6">Thanks for your interest. Attached is the full location analysis for your property — nearby establishments, neighborhood scores, and the indicative estimate described below.</p>',
    '<table style="width:100%;border-collapse:collapse;margin:8px 0 16px">' + rows + "</table>",
    '<p style="font-size:12px;color:#6b7280;line-height:1.6">Your details have been sent to the ES Realty team. A specialist will reply within one business day — reply to this email anytime.</p>',
    '<p style="font-size:12px;color:#6b7280;line-height:1.6">Indicative guide estimate — not a certified appraisal (RA 9646).</p>',
    "</div>",
  ].join("");
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), {
      status: 405,
      headers: { ...corsHeaders, "Content-Type": "application/json", Allow: "POST, OPTIONS" },
    });
  }

  let body: any;
  try {
    body = await readJsonLimited(req);
  } catch (e) {
    if (e instanceof BodyError) return json({ error: e.message }, e.status);
    return json({ error: "Invalid JSON body" }, 400);
  }

  const email = str(body.email, 254).toLowerCase();
  const fullName = str(body.full_name, 160);
  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) return json({ error: "email is invalid" }, 400);
  if (!fullName) return json({ error: "full_name is required" }, 400);
  if (body.consent !== true) return json({ error: "consent is required" }, 400);

  const idempotencyKey = str(req.headers.get("idempotency-key") || "", 200);

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!supabaseUrl || !serviceRoleKey) return json({ error: "Server configuration is incomplete" }, 500);
  const admin = createClient(supabaseUrl, serviceRoleKey, { auth: { autoRefreshToken: false, persistSession: false } });
  const pepper = Deno.env.get("INQUIRY_RATE_LIMIT_SALT") || serviceRoleKey.slice(-32);

  const forwarded = req.headers.get("cf-connecting-ip") || req.headers.get("x-real-ip") ||
    (req.headers.get("x-forwarded-for") || "").split(",")[0].trim() || "unknown";
  const keyHash = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(pepper + ":" + forwarded + ":public")).then((b) => {
    return Array.from(new Uint8Array(b)).map((x) => x.toString(16).padStart(2, "0")).join("");
  });
  const { data: permitted, error: rateError } = await admin.rpc("consume_listing_inquiry_rate_limit", {
    p_request_key_hash: keyHash,
    p_limit: 10,
    p_window_seconds: 3600,
  });
  if (rateError) return json({ error: rateError.message }, 500);
  if (!permitted) return json({ error: "Too many requests. Please try again later" }, 429);

  const now = new Date().toISOString();

  // Idempotency: a retried submit with the same key returns the original lead
  // instead of creating a duplicate CRM record / duplicate follow-up email.
  if (idempotencyKey) {
    const { data: existing } = await admin
      .from("crm_leads")
      .select("id,ref")
      .eq("payload->>idempotencyKey", idempotencyKey)
      .maybeSingle();
    if (existing && existing.id) {
      return json({ ok: true, id: existing.id, ref: existing.ref, duplicated: true, emailSkipped: false, pdfSent: false });
    }
  }

  const report = sanitizeReport(body.report);
  const location = report.location || {};
  const estimate = report.estimate || {};
  const inquiryType = str(body.inquiry_type, 80) === "professional-appraisal-request"
    ? "professional-appraisal-request" : "location-analysis";
  const summary = [
    inquiryType === "professional-appraisal-request" ? "Professional appraisal consultation request" : "Location analysis full report request",
    location.town ? "Town: " + location.town + (location.barangay ? " · " + location.barangay : "") : "",
    location.address ? "Address: " + location.address : "",
    estimate.marketGuideAvailable !== false && estimate.marketGuideEstimate ? "Market guide: " + money(estimate.marketGuideEstimate) + " (" + money(estimate.low) + "–" + money(estimate.high) + ")" : (estimate.birZonalValue ? "BIR zonal: " + money(estimate.birZonalValue) + " · market guide pending comparable evidence" : "Not estimated"),
    estimate.birZonalValue ? "BIR zonal: " + money(estimate.birZonalValue) : "",
    body.purpose ? "Purpose: " + str(body.purpose, 80) : "",
    body.budget ? "Budget: " + str(body.budget, 80) : "",
    body.timeline ? "Timeline: " + str(body.timeline, 80) : "",
    body.notes ? "Notes: " + str(body.notes, 800) : "",
  ].filter(Boolean).join(" | ");

  const leadId = "lead-" + crypto.randomUUID();
  const ref = "LOC-" + leadId.slice(-8).toUpperCase();
  const lead = {
    id: leadId,
    ref,
    name: fullName || email || "Website lead",
    assigned_to: "",
    assigned_to_id: null,
    created_by: (await requireAdmin(admin)).id,
    updated_at: now,
    payload: {
      id: leadId,
      ref,
      name: fullName || email || "Website lead",
      phone: str(body.phone, 50),
      email,
      type: "buyer",
      source: "website",
      status: "new",
      consent: true,
      origin: "storefront",
      channel: inquiryType,
      propertyInterest: report.property?.typeLabel || "Location analysis report",
      notes: summary,
      assignedTo: "",
      assignedToId: null,
      createdBy: null,
      createdAt: now,
      updatedAt: now,
      activity: [{ date: now, text: inquiryType === "professional-appraisal-request" ? "Professional appraisal consultation requested from the website." : "Full location analysis report requested from the website." }],
      fullReport: report,
      idempotencyKey,
    },
  };
  const { error: leadError } = await admin.from("crm_leads").insert(lead);
  if (leadError) return json({ error: leadError.message }, 500);

  try {
    await admin.from("storefront_inquiries").insert({
      inquiry_type: inquiryType,
      user_id: null,
      full_name: fullName,
      phone: str(body.phone, 50),
      email,
      message: summary,
      interest: null,
      consent: true,
      created_at: now,
    });
  } catch {
    // archive copy is best-effort
  }

  let emailSkipped = false;
  let pdfSent = false;
  try {
    // Keep the PDF's bytes small and bounded: only the sanitized report clone
    // (capped to MAX_ESTIMATE_JSON_BYTES) feeds the generator.
    const pdfReport = JSON.parse(JSON.stringify({ report, full_name: fullName, email }));
    const pdfBytes = await buildPdf(pdfReport);
    const b64 = btoa(String.fromCharCode(...pdfBytes));
    if (RESEND_API_KEY) {
      const resp = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: {
          Authorization: "Bearer " + RESEND_API_KEY,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          from: MAIL_FROM,
          to: [email],
          subject: "Your ES Realty Location Analysis Report — " + (location.town || "pin"),
          html: emailHtml({ full_name: fullName, report }),
          attachments: [{ filename: "ES-Realty-Location-Analysis.pdf", content: b64 }],
        }),
      });
      pdfSent = resp.ok;
      if (!resp.ok) emailSkipped = true;
    } else {
      emailSkipped = true;
    }
  } catch {
    emailSkipped = true;
  }

  return json({
    ok: true,
    id: leadId,
    ref,
    message: "Location analysis report queued",
    emailSkipped,
    pdfSent,
  }, 201);
});

async function requireAdmin(admin: any) {
  const { data: adminAccount, error: adminError } = await admin
    .from("profiles")
    .select("id")
    .eq("role", "super-admin")
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();
  if (adminError || !adminAccount) throw new BodyError(500, "No super-admin account is configured");
  return adminAccount;
}
