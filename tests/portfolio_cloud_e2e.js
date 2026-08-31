(async function () {
  var wait = function (ms) { return new Promise(function (resolve) { setTimeout(resolve, ms); }); };
  var checks = [];
  var check = function (name, ok, detail) { checks.push({ name: name, ok: !!ok, detail: detail || "" }); };
  var fill = function (selector, value) {
    var el = document.querySelector(selector);
    if (!el) return false;
    el.value = value;
    el.dispatchEvent(new Event("input", { bubbles: true }));
    el.dispatchEvent(new Event("change", { bubbles: true }));
    return true;
  };
  try {
    localStorage.removeItem("esrealty_v1");
    localStorage.removeItem("esrealty_user");
    document.querySelector("#auth-role").value = "super-admin";
    document.querySelector("#auth-test").click();
    await wait(700);

    check("portfolio cloud module exposed", typeof window.ESPFCLOUD === "object" && typeof window.ESPFCLOUD.entryToDb === "function" && typeof window.ESPFCLOUD.proofFromDb === "function", typeof window.ESPFCLOUD);
    check("ledger engine still exposed", typeof window.ESPOR === "object" && typeof window.ESPOR.post === "function", typeof window.ESPOR);

    // smoke-test mappers in the browser (pure functions, no side effects)
    var uuid = window.ESPFCLOUD.newUuid();
    check("browser uuid is uuid format", window.ESPFCLOUD.isUuid(uuid), uuid);
    var acc = { id: window.ESPFCLOUD.newUuid(), label: "Cloud ABC", bank_name: "Maya", account_type: "cash", opening_balance: 50000, as_of: "2026-08-31", currency: "PHP" };
    var accBack = window.ESPFCLOUD.accountFromDb(window.ESPFCLOUD.accountToDb(acc));
    check("account mapper round trips in browser", accBack.label === "Cloud ABC" && accBack.opening_balance === 50000, JSON.stringify(accBack));
    var entryBack = window.ESPFCLOUD.entryFromDb({ id: "x", account_id: "a", entry_date: "2026-08-31", direction: "in", amount: "1234.5", description: "d", status: "posted" });
    check("entry mapper round trips in browser", entryBack.accountId === "a" && entryBack.amount === 1234.5 && entryBack.direction === "in", JSON.stringify(entryBack));
    check("ensureUuid maps local id to uuid", (function(){ var r = { id: "E7" }; window.ESPFCLOUD.ensureUuid(r); window.ESPFCLOUD.ensureUuid(r); return window.ESPFCLOUD.isUuid(r.id); })(), "local-id");

    // Navigate to portfolio in demo (local) mode. Cloud guard must be OFF:
    // no cloud badge, no cloud errors, and local CRUD still works.
    document.querySelector('[data-view="portfolio"]').click();
    await wait(500);
    check("portfolio view renders in demo mode", !!document.querySelector("#content") && /Portfolio/.test(document.querySelector("#content").textContent), "view");
    check("no cloud badge in demo mode", !document.querySelector("[data-pf-cloud]"), document.querySelector("[data-pf-cloud]") ? "badge" : "none");
    check("no cloud error toasts", !/Cloud save|cloud tables not found|Could not load Portfolio from cloud/i.test(document.body.textContent), "clean");

    // Create an account then a cash-in entry — cloud hooks must no-op safely.
    document.querySelector("[data-pf-new-acc]").click();
    await wait(250);
    fill("#pf-acc-name", "Cloud Wired");
    fill("#pf-acc-bank", "Bank");
    fill("#pf-acc-opening", "1000");
    document.querySelector("[data-pf-save-account]").click();
    await wait(500);
    check("account created locally while cloud off", /Cloud Wired/.test(document.querySelector("#content").textContent), "account");

    document.querySelector('[data-ptab="ledger"]').click();
    await wait(400);
    document.querySelector("[data-pf-new-entry]").click();
    await wait(250);
    fill("#pf-ledger-direction", "in");
    await wait(120);
    fill("#pf-ledger-description", "cloud hook check");
    fill("#pf-ledger-amount", "250");
    document.querySelector("[data-pf-save-ledger-entry]").click();
    await wait(500);
    check("entry posted locally while cloud off", /cloud hook check/.test(document.querySelector("#content").textContent), "entry");
    check("no cloud badge after CRUD in demo mode", !document.querySelector("[data-pf-cloud]"), "demo");

    // Local persistence still works (app_state blob path is untouched by cloud wiring).
    var saved = localStorage.getItem("esrealty_v1");
    check("portfolio data persisted locally in demo mode", !!saved && saved.indexOf("Cloud Wired") >= 0 && saved.indexOf("cloud hook check") >= 0, saved ? "stored" : "missing");
    check("no horizontal overflow", document.documentElement.scrollWidth <= window.innerWidth + 2, "sw=" + document.documentElement.scrollWidth + " vw=" + window.innerWidth);
  } catch (error) {
    window.__msErr = String(error && error.stack || error);
  }
  window.__msChecks = checks;
  window.__msLog = checks.map(function (item) { return (item.ok ? "PASS " : "FAIL ") + item.name + " :: " + item.detail; });
  window.__msOk = !window.__msErr && checks.length > 0 && checks.every(function (item) { return item.ok; });
  window.__msDone = true;
})();