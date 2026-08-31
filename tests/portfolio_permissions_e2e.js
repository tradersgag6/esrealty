(async function () {
  var wait = function (ms) { return new Promise(function (resolve) { setTimeout(resolve, ms); }); };
  var checks = [];
  var check = function (name, ok, detail) { checks.push({ name: name, ok: !!ok, detail: detail || "" }); };
  var setRole = async function (role) {
    var sel = document.querySelector("#user-role-select");
    if (sel) { sel.value = role; sel.dispatchEvent(new Event("change", { bubbles: true })); }
    await wait(500);
  };
  var pfNav = function () { return document.querySelector('[data-view="portfolio"]'); };
  var pfNavHidden = function () { var n = pfNav(); return !n || n.classList.contains("nav-hidden"); };
  try {
    localStorage.removeItem("esrealty_v1");
    localStorage.removeItem("esrealty_user");
    document.querySelector("#auth-role").value = "super-admin";
    document.querySelector("#auth-test").click();
    await wait(700);

    var nav = pfNav();
    check("super-admin sees portfolio nav", nav && !nav.classList.contains("nav-hidden"), nav ? nav.className : "missing");
    if (!nav) throw new Error("portfolio nav missing for super-admin");
    nav.click();
    await wait(600);
    check("portfolio view renders for super-admin", /Portfolio/.test(document.querySelector("#topbar-title").textContent), document.querySelector("#topbar-title").textContent);
    check("no read-only banner for super-admin", !document.querySelector(".pf-ro-banner"), document.querySelector(".pf-ro-banner") ? "banner" : "none");
    check("overview write button present", !!document.querySelector("[data-pf-new-acc]"), "new-acc");
    document.querySelector('[data-ptab="ledger"]').click();
    await wait(400);
    check("ledger write buttons present", !!document.querySelector("[data-pf-new-entry]") && !!document.querySelector("[data-pf-migrate-presell]"), "buttons");
    check("no owner-only labels for super-admin", !/owner only/.test(document.querySelector("#content").textContent), "labels");

    await setRole("broker");
    check("broker loses portfolio nav", pfNavHidden(), pfNav() ? pfNav().className : "absent");
    check("broker is not left on portfolio view", document.querySelector("#topbar-title").textContent !== "Portfolio", document.querySelector("#topbar-title").textContent);
    check("broker never renders portfolio content", !document.querySelector(".pf-ledger-shell") && !document.querySelector(".pf-perm-denied"), "content");
    check("broker lands on an allowed view", !!document.querySelector("#topbar-title") && document.querySelector("#topbar-title").textContent.length > 0, document.querySelector("#topbar-title").textContent);

    await setRole("buyer");
    check("buyer loses portfolio nav", pfNavHidden(), pfNav() ? pfNav().className : "absent");
    check("buyer is not on portfolio view", document.querySelector("#topbar-title").textContent !== "Portfolio", document.querySelector("#topbar-title").textContent);

    await setRole("owner");
    check("owner loses portfolio nav", pfNavHidden(), pfNav() ? pfNav().className : "absent");
    check("owner is not on portfolio view", document.querySelector("#topbar-title").textContent !== "Portfolio", document.querySelector("#topbar-title").textContent);

    await setRole("super-admin");
    nav = pfNav();
    check("super-admin sees portfolio nav again", nav && !nav.classList.contains("nav-hidden"), nav ? nav.className : "missing");
    check("no horizontal overflow", document.documentElement.scrollWidth <= window.innerWidth + 2, "sw=" + document.documentElement.scrollWidth + " vw=" + window.innerWidth);
  } catch (error) {
    window.__msErr = String(error && error.stack || error);
  }
  window.__msChecks = checks;
  window.__msLog = checks.map(function (item) { return (item.ok ? "PASS " : "FAIL ") + item.name + " :: " + item.detail; });
  window.__msOk = !window.__msErr && checks.length > 0 && checks.every(function (item) { return item.ok; });
  window.__msDone = true;
})();