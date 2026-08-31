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
  var visibleRows = function () {
    return Array.prototype.filter.call(document.querySelectorAll("[data-pf-ledger-row]"), function (row) { return getComputedStyle(row).display !== "none"; }).length;
  };
  var countText = function () {
    var el = document.getElementById("pf-ledger-count");
    return el ? el.textContent : "";
  };
  var seedOut = async function (desc, amount) {
    document.querySelector("[data-pf-new-entry]").click();
    await wait(250);
    fill("#pf-ledger-direction", "out");
    await wait(120);
    fill("#pf-ledger-purpose", "others");
    await wait(120);
    fill("#pf-ledger-subcategory", "tax");
    fill("#pf-ledger-description", desc);
    fill("#pf-ledger-amount", amount);
    document.querySelector("[data-pf-save-ledger-entry]").click();
    await wait(500);
  };
  var seedIn = async function (desc, amount) {
    document.querySelector("[data-pf-new-entry]").click();
    await wait(250);
    fill("#pf-ledger-direction", "in");
    await wait(120);
    fill("#pf-ledger-description", desc);
    fill("#pf-ledger-amount", amount);
    document.querySelector("[data-pf-save-ledger-entry]").click();
    await wait(500);
  };
  try {
    localStorage.removeItem("esrealty_v1");
    localStorage.removeItem("esrealty_user");
    document.querySelector("#auth-role").value = "super-admin";
    document.querySelector("#auth-test").click();
    await wait(700);
    document.querySelector('[data-view="portfolio"]').click();
    await wait(500);
    document.querySelector('[data-ptab="ledger"]').click();
    await wait(400);
    check("all filter controls render", !!document.querySelector("#pf-filter-acc") && !!document.querySelector("#pf-filter-dir") && !!document.querySelector("#pf-filter-status") && !!document.querySelector("#pf-search") && !!document.querySelector("#pf-date-from") && !!document.querySelector("#pf-date-to") && !!document.querySelector("[data-pf-clear-filters]"), "controls");

    await seedOut("etf manager fee", "1000");
    await seedIn("seed second cashin", "5000");
    check("two entries posted", visibleRows() === 2, "rows=" + visibleRows());
    check("count shows 2 of 2", /^Showing 2 of 2 entries$/.test(countText()), countText());

    var searchInput = document.getElementById("pf-search");
    searchInput.focus();
    fill("#pf-search", "seed second cashin");
    await wait(200);
    check("search narrows to one row", visibleRows() === 1, "rows=" + visibleRows());
    check("count shows 1 of 2", /^Showing 1 of 2 entries$/.test(countText()), countText());
    var active = document.activeElement;
    check("search input keeps focus while filtering", active && active.id === "pf-search", active ? active.id : "none");

    document.querySelector("[data-pf-clear-filters]").click();
    await wait(200);
    check("clear restores all rows", visibleRows() === 2, "rows=" + visibleRows());
    check("count restored after clear", /^Showing 2 of 2 entries$/.test(countText()), countText());

    fill("#pf-filter-dir", "in");
    await wait(200);
    check("direction filter shows only cash in", visibleRows() === 1 && !!document.querySelector("[data-pf-ledger-row][data-direction='in']"), "rows=" + visibleRows());

    document.querySelector("[data-pf-clear-filters]").click();
    await wait(200);
    var revRow = document.querySelector("[data-pf-ledger-row][data-direction='in']");
    var revBtn = revRow && revRow.querySelector("[data-pf-reverse]");
    check("posted cash-in exposes reverse action", !!revBtn, revBtn ? "yes" : "no");
    if (revBtn) { revBtn.click(); }
    await wait(600);
    fill("#pf-filter-status", "reversed");
    await wait(200);
    check("reversed status shows both legs", visibleRows() === 2, "rows=" + visibleRows() + " count=" + countText());
    check("reversed count is 2 of 3", /^Showing 2 of 3 entries$/.test(countText()), countText());
    check("reversed badge shown", /Reversed/.test(document.querySelector("#content").textContent), "badge");

    document.querySelector("[data-pf-clear-filters]").click();
    await wait(200);
    fill("#pf-search", "etf manager fee");
    await wait(200);
    check("persist setup filters to one row", visibleRows() === 1, "rows=" + visibleRows());
    document.querySelector('[data-ptab="overview"]').click();
    await wait(400);
    document.querySelector('[data-ptab="ledger"]').click();
    await wait(400);
    check("filters survive tab switch", document.getElementById("pf-search").value === "etf manager fee" && visibleRows() === 1, "val=" + document.getElementById("pf-search").value + " rows=" + visibleRows());
    check("count survives tab switch", /^Showing 1 of 3 entries$/.test(countText()), countText());

    document.querySelector("[data-pf-clear-filters]").click();
    await wait(200);
    check("ledger running balance reflects reversal pair", /2,499,000/.test(document.querySelector("#content").textContent), "balance");

    check("no read-only banner for super-admin", !document.querySelector(".pf-ro-banner"), document.querySelector(".pf-ro-banner") ? "banner" : "none");
    check("write buttons visible for super-admin", !!document.querySelector("[data-pf-new-entry]") && !!document.querySelector("[data-pf-migrate-presell]"), "buttons");
    check("no horizontal overflow", document.documentElement.scrollWidth <= window.innerWidth + 2, "sw=" + document.documentElement.scrollWidth + " vw=" + window.innerWidth);
  } catch (error) {
    window.__msErr = String(error && error.stack || error);
  }
  window.__msChecks = checks;
  window.__msLog = checks.map(function (item) { return (item.ok ? "PASS " : "FAIL ") + item.name + " :: " + item.detail; });
  window.__msOk = !window.__msErr && checks.length > 0 && checks.every(function (item) { return item.ok; });
  window.__msDone = true;
})();