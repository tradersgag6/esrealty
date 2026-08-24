import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const MIRRORS = [
  "https://overpass-api.de/api/interpreter",
  "https://overpass.kumi.systems/api/interpreter",
  "https://lz4.overpass-api.de/api/interpreter"
];

const CATEGORIES = [
  ["School",       'nwr["amenity"~"^(school|kindergarten|college|university)$"](around:1000,{LAT},{LNG});'],
  ["Hospital",     'nwr["amenity"~"^(hospital|clinic)$"](around:1000,{LAT},{LNG});'],
  ["Bank",         'nwr["amenity"~"^(bank|atm)$"](around:1000,{LAT},{LNG});'],
  ["Convenience",  'nwr["shop"="convenience"](around:1000,{LAT},{LNG});'],
  ["Gas Station",  'nwr["amenity"="fuel"](around:1000,{LAT},{LNG});'],
  ["Market",       'nwr["amenity"="marketplace"](around:1000,{LAT},{LNG});nwr["shop"~"^(supermarket|wholesale)$"](around:1000,{LAT},{LNG});'],
  ["Church",       'nwr["amenity"="place_of_worship"](around:1000,{LAT},{LNG});'],
  ["Restaurant",   'nwr["amenity"~"^(restaurant|fast_food|cafe)$"](around:1000,{LAT},{LNG});'],
  ["Mall",         'nwr["shop"="mall"](around:1000,{LAT},{LNG});'],
  ["Transit",      'nwr["railway"~"^(station|stop)$"](around:1000,{LAT},{LNG});nwr["public_transport"="station"](around:1000,{LAT},{LNG});nwr["highway"="bus_stop"](around:1000,{LAT},{LNG});']
];

function buildQuery(lat, lng) {
  const parts = CATEGORIES.map(c => c[1].replace("{LAT}", lat).replace("{LNG}", lng) + "\nout count;\n");
  return "[out:json][timeout:25];\n" + parts.join("");
}

function parseResults(j) {
  const els = (j && j.elements) || [];
  const res = { found: {}, present: 0 };
  CATEGORIES.forEach((c, i) => {
    const el = els[i];
    let count = 0;
    if (el && el.groups) el.groups.forEach(g => { count += g.count || 0; });
    else if (el && el.tags) count = (Number(el.tags.nodes || 0) + Number(el.tags.ways || 0) + Number(el.tags.relations || 0)) || Number(el.tags.total || 0);
    res.found[c[0]] = count;
    if (count > 0) res.present++;
  });
  return res;
}

async function tryMirror(url, query, signal) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 30000);
  const combined = signal ? AbortSignal.any([signal, controller.signal]) : controller.signal;
  try {
    const resp = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        "User-Agent": "ESRealty-LocationScan/1.0"
      },
      body: "data=" + encodeURIComponent(query),
      signal: combined
    });
    clearTimeout(timer);
    if (!resp.ok) throw new Error("HTTP " + resp.status);
    const j = await resp.json();
    return parseResults(j);
  } catch (e) {
    clearTimeout(timer);
    throw e;
  }
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, {
      headers: {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "POST, OPTIONS",
        "Access-Control-Allow-Headers": "Content-Type, Authorization, apikey"
      }
    });
  }

  try {
    const { lat, lng } = await req.json();
    if (typeof lat !== "number" || typeof lng !== "number" || !isFinite(lat) || !isFinite(lng)) {
      return new Response(JSON.stringify({ error: "Invalid coordinates" }), { status: 400, headers: { "Access-Control-Allow-Origin": "*", "Content-Type": "application/json" } });
    }

    const query = buildQuery(lat, lng);
    let lastErr = null;

    for (const mirror of MIRRORS) {
      try {
        const result = await tryMirror(mirror, query);
        return new Response(JSON.stringify({ ok: true, source: mirror, counts: result }), {
          headers: { "Access-Control-Allow-Origin": "*", "Content-Type": "application/json" }
        });
      } catch (e) {
        lastErr = e;
      }
    }

    return new Response(JSON.stringify({ ok: false, error: "All mirrors failed", lastError: String(lastErr) }), {
      status: 502,
      headers: { "Access-Control-Allow-Origin": "*", "Content-Type": "application/json" }
    });
  } catch (e) {
    return new Response(JSON.stringify({ ok: false, error: String(e) }), {
      status: 500,
      headers: { "Access-Control-Allow-Origin": "*", "Content-Type": "application/json" }
    });
  }
});
