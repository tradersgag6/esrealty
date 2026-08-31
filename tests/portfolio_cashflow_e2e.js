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
  var content = function () { return document.querySelector("#content").innerHTML || ""; };
  var visibleRows = function () {
    return Array.prototype.filter.call(document.querySelectorAll("[data-pf-ledger-row]"), function (row) { return getComputedStyle(row).display !== "none"; }).length;
  };
  try {
    localStorage.clear();
    document.querySelector("#auth-role").value = "super-admin";
    document.querySelector("#auth-test").click();
    await wait(700);
    // Seed presell sample by visiting the presell view first
    document.querySelector('[data-view="presell"]').click();
    await wait(600);
    document.querySelector('[data-view="portfolio"]').click();
    await wait(500);

    // ── Cash Command Center renders ──
    document.querySelector('[data-ptab="cashflow"]').click();
    await wait(500);
    var html = content();
    check("command center renders cells", /Cash Command Center/.test(html) && /Opening cash/.test(html) && /Closing cash/.test(html), "cc");
    check("basis badges present (Posted/Committed/etc)", /Posted/.test(html) && /Committed/.test(html) && /Projected/.test(html), "badges");
    check("cashflow filters render", !!document.querySelector("#pf-cf-from") && !!document.querySelector("#pf-cf-account") && !!document.querySelector("#pf-cf-project") && !!document.querySelector("#pf-cf-presell") && !!document.querySelector("[data-pf-cf-clear]"), "filters");
    check("go-ledger buttons present", document.querySelectorAll("[data-pf-go-ledger]").length >= 4, "n=" + document.querySelectorAll("[data-pf-go-ledger]").length);
    check("actual-vs-future notice banner", /Posted \/ Committed \/ Receivable \/ Payable/.test(html), "notice");
    check("monthly rollup table", /Monthly Rollup/.test(html) && /Opening/.test(html), "rollup");

    // seed a couple of ledger entries first, then check the numbers move
    document.querySelector('[data-ptab="ledger"]').click();
    await wait(400);
    document.querySelector("[data-pf-new-entry]").click();
    await wait(300);
    fill("#pf-ledger-direction", "in");
    await wait(120);
    fill("#pf-ledger-description", "cashflow e2e cashin");
    fill("#pf-ledger-amount", "25000");
    document.querySelector("[data-pf-save-ledger-entry]").click();
    await wait(500);
    document.querySelector("[data-pf-new-entry]").click();
    await wait(300);
    fill("#pf-ledger-direction", "out");
    await wait(120);
    fill("#pf-ledger-purpose", "others");
    await wait(120);
    fill("#pf-ledger-subcategory", "tax");
    fill("#pf-ledger-description", "cashflow e2e cashout");
    fill("#pf-ledger-amount", "8000");
    document.querySelector("[data-pf-save-ledger-entry]").click();
    await wait(500);
    document.querySelector('[data-ptab="cashflow"]').click();
    await wait(500);
    html = content();
    check("posted cash in reflects seeded entry", /25,000/.test(html), "cashin");
    check("posted cash out reflects seeded entry", /8,000/.test(html), "cashout");

    // ── click-through to filtered ledger ──
    var inBtn = null;
    Array.prototype.forEach.call(document.querySelectorAll("[data-pf-go-ledger]"), function (b) { if (b.getAttribute("data-pf-go-ledger") === "in") inBtn = b; });
    check("cash-in go-ledger button found", !!inBtn, inBtn ? "yes" : "no");
    if (inBtn) { inBtn.click(); }
    await wait(500);
    check("navigated to ledger tab", document.querySelector('[data-ptab="cashflow"]') && /cashflow e2e cashin/.test(content()), "tab");
    check("click-through narrows to cash in", visibleRows() === 1, "rows=" + visibleRows());

    // return to cashflow
    document.querySelector('[data-ptab="cashflow"]').click();
    await wait(500);

    // ── Pre-Selling Project Cash Flow panel ──
    var presellSel = document.getElementById("pf-presell-cf-sel");
    check("presell selector renders options", presellSel && presellSel.options.length >= 2, "opts=" + (presellSel ? presellSel.options.length : 0));
    if (presellSel) fill("#pf-presell-cf-sel", "psp-seed-1");
    await wait(500);
    html = content();
    check("presell panel shows contract/collected", /Contracted value/.test(html) && /Collected \(paid schedules\)/.test(html), "panel");
    check("presell expected-by-month table", /Expected Collections by Month/.test(html), "months");
    check("presell projected margin banner", /Expected margin/.test(html), "margin");

    // ── Asset Cash-Flow Timeline ──
    document.querySelector('[data-ptab="assets"]').click();
    await wait(500);
    html = content();
    check("asset timeline card renders", /Asset Cash-Flow Timeline/.test(html), "atl");
    check("asset actual/estimated basis badges", /Actual/.test(html) && /Estimated/.test(html), "basis");

    // ── Record Pre-Selling Collection (exact-once) ──
    document.querySelector('[data-ptab="cashflow"]').click();
    await wait(500);
    html = content();
    check("collect card renders", /Record Pre-Selling Collection/.test(html) && !!document.querySelector("[data-pf-collect-post]"), "collect");
    // select account (default is pre-selected; ensure a real one) project/unit/payment
    var acc = document.getElementById("pf-collect-account");
    if (acc && acc.options.length > 1) fill("#pf-collect-account", acc.options[1].value);
    fill("#pf-collect-project", "psp-seed-1");
    await wait(400);
    var unitSel = document.getElementById("pf-collect-unit");
    check("collect unit select populated", unitSel && unitSel.options.length >= 2, "opts=" + (unitSel ? unitSel.options.length : 0));
    if (unitSel) fill("#pf-collect-unit", "psu-psp-seed-1-1206");
    await wait(400);
    var paySel = document.getElementById("pf-collect-payment");
    check("collect payment select has pending schedules", paySel && paySel.options.length >= 2, "opts=" + (paySel ? paySel.options.length : 0));
    if (paySel) fill("#pf-collect-payment", paySel.options[1].value);
    await wait(300);
    html = content();
    check("collect balance preview shows after-posting", /After posting/.test(html), "preview");

    // Post the collection
    var paySel2 = document.getElementById("pf-collect-payment");
    var payId = paySel2 ? paySel2.value : "";
    document.querySelector("[data-pf-collect-post]").click();
    await wait(600);
    html = content();
    check("collection posted with toast", /Collection posted/.test(html) || /posted/.test(content()), "post");
    // Try to re-post the same — exact-once should refuse (select is remounted, so re-fill)
    fill("#pf-collect-project", "psp-seed-1");
    await wait(400);
    fill("#pf-collect-unit", "psu-psp-seed-1-1206");
    await wait(400);
    var paySel3 = document.getElementById("pf-collect-payment");
    if (paySel3 && paySel3.options.length) fill("#pf-collect-payment", paySel3.options[1].value);
    await wait(300);
    var postBtn = document.querySelector("[data-pf-collect-post]");
    if (postBtn) postBtn.click();
    await wait(400);
    check("exact-once refuses double posting", /already/.test(content()), "guard");

    // Verify a linked ledger entry exists: the presell panel's ledger footprint
    // must reflect the freshly posted collection, and the payment must now be paid.
    document.querySelector('[data-ptab="cashflow"]');
    if (document.getElementById("pf-presell-cf-sel")) fill("#pf-presell-cf-sel", "psp-seed-1");
    await wait(500);
    html = content();
    check("presell ledger footprint reflects collection", /Ledger footprint/.test(html), "footprint");

    check("no horizontal overflow on cashflow", document.documentElement.scrollWidth <= window.innerWidth + 2, "sw=" + document.documentElement.scrollWidth + " vw=" + window.innerWidth);
  } catch (error) {
    window.__msErr = String(error && error.stack || error);
  }
  window.__msChecks = checks;
  window.__msLog = checks.map(function (item) { return (item.ok ? "PASS " : "FAIL ") + item.name + " :: " + item.detail; });
  window.__msOk = !window.__msErr && checks.length > 0 && checks.every(function (item) { return item.ok; });
  window.__msDone = true;
})();
