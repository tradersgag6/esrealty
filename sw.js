/* ES Realty service worker — installable PWA + light runtime caching.
   Strategy:
   - Never cache app logic (js/*): network-first, so updates always land.
   - Cache-first for immutable vendor assets, fonts, map tiles.
   - Navigations: network-first with offline fallback to the shell. */
const VERSION = "esrealty-v1";
const VENDOR_CACHE = "esrealty-vendor-v1";
const IMG_CACHE = "esrealty-img-v1";

self.addEventListener("install", (event) => {
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.filter(k => k !== VERSION && k !== VENDOR_CACHE && k !== IMG_CACHE).map(k => caches.delete(k)));
    await self.clients.claim();
  })());
});

async function cacheFirst(request, cacheName) {
  const cache = await caches.open(cacheName);
  const hit = await cache.match(request);
  if (hit) return hit;
  try {
    const res = await fetch(request);
    if (res.ok) cache.put(request, res.clone());
    return res;
  } catch (e) {
    return new Response("", { status: 504 });
  }
}

async function networkFirst(request, cacheName) {
  const cache = await caches.open(cacheName);
  try {
    const res = await fetch(request);
    if (res.ok) cache.put(request, res.clone());
    return res;
  } catch (e) {
    const hit = await cache.match(request);
    if (hit) return hit;
    throw e;
  }
}

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);

  // Supabase / API traffic: never intercept.
  if (url.hostname.includes("supabase") || url.pathname.includes("/functions/")) return;

  // Map tiles: cache-first (they are immutable).
  if (/basemaps\.cartocdn\.com|tile\.openstreetmap/.test(url.hostname)) {
    event.respondWith(cacheFirst(req, IMG_CACHE));
    return;
  }

  // Vendored libs + fonts: cache-first.
  if (url.pathname.includes("/vendor/") || url.hostname === "fonts.gstatic.com" || url.hostname === "fonts.googleapis.com") {
    event.respondWith(cacheFirst(req, VENDOR_CACHE));
    return;
  }

  // Images: cache-first (Unsplash etc).
  if (req.destination === "image" || /unsplash/.test(url.hostname)) {
    event.respondWith(cacheFirst(req, IMG_CACHE));
    return;
  }

  // App code + navigations: network-first so updates always win.
  event.respondWith(networkFirst(req, VERSION));
});
