/* Public Supabase connection settings. RLS policies in supabase/schema.sql
 * protect data; never place a secret/service-role key in this browser file. */
(function () {
  "use strict";
  /* Lazy-load the vendored Supabase client: public storefront visitors skip
   * the download entirely; it arrives async and boot() picks it up below. */
  var sbScript = document.createElement("script");
  sbScript.src = "vendor/supabase/supabase.js";
  sbScript.defer = true;
  document.head.appendChild(sbScript);

  const url = "https://mrngaqtbaseewzcsogqi.supabase.co";
  const publishableKey = "sb_publishable_OtrE6VXTJb4OrSCe6Z-f6g_qAcKyOvk";
  window.ESREALTY_API_BASE = url + "/functions/v1/listing-api/api";
  function boot() {
    if (!window.supabase) return false;
    window.ESREALTY_SUPABASE = window.supabase.createClient(url, publishableKey, {
      auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true }
    });
    return true;
  }
  if (boot()) return;
  /* The supabase-js CDN script may still be loading when this file runs.
   * Retry briefly so login does not fail with "Supabase client could not load". */
  let tries = 0;
  const timer = setInterval(function () {
    tries += 1;
    if (boot() || tries >= 50) clearInterval(timer);
  }, 200);
})();
