// ES Realty — Nearby scan proxy (Overpass mirrors)
// Same runtime pattern as notify-dispatch (Deno.serve, no imports).

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

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, apikey"
};

function json(body, status) {
  return new Response(JSON.stringify(body), { status: status || 200, headers: { ...CORS, "Content-Type": "application/json" } });
}

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

async function tryMirror(url, query) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 30000);
  try {
    const resp = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        "User-Agent": "ESRealty-LocationScan/1.0"
      },
      body: "data=" + encodeURIComponent(query),
      signal: controller.signal
    });
    if (!resp.ok) throw new Error("HTTP " + resp.status);
    const j = await resp.json();
    return parseResults(j);
  } finally {
    clearTimeout(timer);
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: CORS });

  let lat, lng;
  try {
    const body = await req.json();
    lat = body.lat; lng = body.lng;
  } catch (e) {
    return json({ ok: false, error: "Invalid JSON body" }, 400);
  }
  if (typeof lat !== "number" || typeof lng !== "number" || !isFinite(lat) || !isFinite(lng)) {
    return json({ ok: false, error: "Invalid coordinates" }, 400);
  }

  const query = buildQuery(lat, lng);
  let lastErr = null;

  for (const mirror of MIRRORS) {
    try {
      const result = await tryMirror(mirror, query);
      return json({ ok: true, source: mirror, counts: result });
    } catch (e) {
      lastErr = e;
    }
  }

  return json({ ok: false, error: "All mirrors failed", lastError: String(lastErr) }, 502);
});
