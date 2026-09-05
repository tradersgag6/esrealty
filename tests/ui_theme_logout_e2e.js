"use strict";
/* Same-load A/B (no reload):
   guest light -> snapshot A; test-login -> night mode -> real signout -> snapshot B.
   B must equal A (palette regression check) and theme must be light. */
window.__msChecks = [];
window.__msLog = [];
window.__msDone = false;
function chk(n, ok, d) { window.__msChecks.push({ name: n, ok: !!ok, detail: d || "" }); }
function log(m) { window.__msLog.push(m); }

(async () => {
  try {
    const wait = ms => new Promise(r => setTimeout(r, ms));
    const snapshot = () => {
      const map = {};
      document.querySelectorAll(".sf-site h1,.sf-site h2,.sf-site h3,.sf-site h4").forEach(el => {
        const t = (el.textContent || "").trim(); if (!t) return;
        const k = getComputedStyle(el).color;
        map[k] = (map[k] || 0) + 1;
      });
      return map;
    };
    const cmp = (a, b) => {
      const keys = new Set([...Object.keys(a), ...Object.keys(b)]);
      const diff = [];
      keys.forEach(k => { if ((a[k] || 0) !== (b[k] || 0)) diff.push(k + ":" + (a[k] || 0) + "->" + (b[k] || 0)); });
      return diff;
    };

    await wait(6000);
    const guest = document.querySelector(".sf-site");
    chk("guest-storefront-present", !!guest, "sf=" + !!guest);
    const A = snapshot();
    log("A=" + JSON.stringify(A));

    const testBtn = document.querySelector("#auth-test");
    log("auth-test-btn=" + !!testBtn);
    if (testBtn) {
      testBtn.click();
      await wait(1500);
    }
    const loggedIn = !document.querySelector("#sidebar").classList.contains("hidden");
    log("logged-in-after-test=" + loggedIn);

    document.documentElement.setAttribute("data-theme", "dark");
    await wait(200);
    const signout = document.querySelector("#btn-signout");
    if (signout) { signout.click(); await wait(3000); }

    const theme = document.documentElement.getAttribute("data-theme");
    const B = snapshot();
    log("B=" + JSON.stringify(B));
    chk("signout-forced-light", theme === "light", "data-theme=" + theme);
    const diff = cmp(A, B);
    chk("palette-unchanged-after-logout", diff.length === 0, "diff=" + diff.slice(0, 6).join(" | "));
    chk("storefront-still-mounted", !!document.querySelector(".sf-site"), "sf=" + !!document.querySelector(".sf-site"));

    window.__msOk = window.__msChecks.every(c => c.ok);
  } catch (e) {
    log("caught: " + (e && e.message || e));
    window.__msChecks.push({ name: "runner", ok: false, detail: (e && e.message || e) });
    window.__msOk = false;
  }
  window.__msDone = true;
})();