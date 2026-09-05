"use strict";
/* Preload/anti-flash: body.preload must hide the shell until the storefront is
   mounted and render() completes; __ESREALTY_READY set only after mount. */
window.__msChecks = [];
window.__msDone = false;
function chk(n, ok, d) { window.__msChecks.push({ name: n, ok: !!ok, detail: d || "" }); }

(async () => {
  const wait = ms => new Promise(r => setTimeout(r, ms));
  await wait(1200);
  chk("storefront-mounted", !!document.querySelector(".sf-site"), "sf=" + !!document.querySelector(".sf-site"));
  chk("preload-inside-mount", !document.body.classList.contains("preload"), "preload=" + document.body.classList.contains("preload"));
  chk("ready-after-render", window.__ESREALTY_READY === true, "ready=" + window.__ESREALTY_READY);
  chk("shell-hidden-on-guest", document.querySelector("#sidebar").classList.contains("hidden"), "sidebar-hidden=" + document.querySelector("#sidebar").classList.contains("hidden"));
  window.__msOk = window.__msChecks.every(c => c.ok);
  window.__msDone = true;
})();