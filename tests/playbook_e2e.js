(async function () {
  var wait = function (ms) { return new Promise(function (resolve) { setTimeout(resolve, ms); }); };
  var click = function (selector) { var element = document.querySelector(selector); if (element) element.click(); return element; };
  var set = function (selector, value) { var element = document.querySelector(selector); if (element) { element.value = value; element.dispatchEvent(new Event("input", { bubbles: true })); } return element; };
  var checks = [];
  var check = function (name, ok, detail) { checks.push({ name: name, ok: !!ok, detail: detail || "" }); };
  try {
    localStorage.removeItem("esrealty_v1");
    localStorage.removeItem("esrealty_user");
    var role = document.querySelector("#auth-role");
    if (role) role.value = "super-admin";
    click("#auth-test");
    await wait(500);
    var nav = document.querySelector('[data-view="playbook"]');
    check("super admin nav visible", nav && !nav.classList.contains("nav-hidden"), nav ? nav.className : "missing");
    if (nav) nav.click();
    await wait(500);
    check("playbook dashboard renders", !!document.querySelector(".pb-page"), "page=" + !!document.querySelector(".pb-page"));
    click("[data-pb-new]");
    await wait(150);
    check("editor opens", !!document.querySelector("#pb-modal #pb-title"), "modal=" + !!document.querySelector("#pb-modal"));
    set("#pb-title", "Investor Discovery Call");
    set("#pb-summary", "Qualify shophouse investors and establish their acquisition criteria.");
    set("#pb-objective", "Confirm budget, timeline, target yield, and preferred location.");
    set("#pb-openingScript", "Thank you for considering ES Realty. Let us define the right investment target.");
    set("#pb-objectionResponses", "Price concern: compare total income potential and long-term land value.");
    var status = document.querySelector("#pb-status"); if (status) status.value = "active";
    click("[data-pb-save]");
    await wait(650);
    var firstCard = document.querySelector(".pb-card");
    check("playbook created", firstCard && /Investor Discovery Call/.test(firstCard.textContent), firstCard ? firstCard.querySelector("h3").textContent : "missing");
    click("[data-pb-preview]");
    await wait(150);
    check("preview shows structured content", !!document.querySelector(".pb-preview-sections") && /Price concern/.test(document.querySelector("#pb-modal").textContent), "preview=" + !!document.querySelector(".pb-preview"));
    click("[data-pb-cancel]");
    click("[data-pb-duplicate]");
    await wait(650);
    check("duplicate creates draft", document.querySelectorAll(".pb-card").length === 2 && /Copy/.test(document.querySelector(".pb-grid").textContent), "cards=" + document.querySelectorAll(".pb-card").length);
    var archiveButtons = document.querySelectorAll("[data-pb-archive]");
    if (archiveButtons[0]) archiveButtons[0].click();
    await wait(650);
    check("archive action works", /Archived/.test(document.querySelector(".pb-grid").textContent), document.querySelector(".pb-grid").textContent.indexOf("Archived") >= 0 ? "archived" : "missing");
    var roleSelect = document.querySelector("#user-role-select");
    if (roleSelect) { roleSelect.value = "broker"; roleSelect.dispatchEvent(new Event("change", { bubbles: true })); }
    await wait(500);
    nav = document.querySelector('[data-view="playbook"]');
    check("broker nav hidden", nav && nav.classList.contains("nav-hidden"), nav ? nav.className : "missing");
    check("broker cannot retain playbook view", !document.querySelector(".pb-page") && document.querySelector(".topbar-title").textContent !== "Sales Playbook", document.querySelector(".topbar-title").textContent);
    check("no horizontal scroll", document.documentElement.scrollWidth <= window.innerWidth + 2, "scrollW=" + document.documentElement.scrollWidth + " viewport=" + window.innerWidth);
  } catch (error) {
    window.__msErr = String(error && error.stack || error);
  }
  window.__msChecks = checks;
  window.__msLog = checks.map(function (item) { return (item.ok ? "PASS " : "FAIL ") + item.name + " :: " + item.detail; });
  window.__msOk = !window.__msErr && checks.length > 0 && checks.every(function (item) { return item.ok; });
  window.__msDone = true;
})();
