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
    check("ledger heading renders", /Cash Ledger/.test(document.querySelector("#content").textContent), "ledger");
    check("ledger summary renders", document.querySelectorAll(".pf-ledger-summary > div").length === 4, "summary");
    check("ledger filters render", !!document.querySelector("#pf-filter-acc") && !!document.querySelector("#pf-search"), "filters");

    document.querySelector("[data-pf-new-entry]").click();
    await wait(200);
    var modal = document.querySelector("#pf-ledger-entry-modal");
    check("entry modal opens", modal && getComputedStyle(modal).display === "flex", modal ? "open" : "missing");
    check("entry fields are usable", modal && Array.prototype.every.call(modal.querySelectorAll("input,select"), function (el) { return el.getBoundingClientRect().width >= Math.min(280, window.innerWidth - 60); }), "viewport=" + window.innerWidth);
    fill("#pf-ledger-direction", "out");
    await wait(100);
    check("cash out purpose appears", !!document.querySelector('#pf-ledger-purpose option[value="construction"]'), "purpose");
    fill("#pf-ledger-purpose", "others");
    await wait(100);
    check("others subcategory appears", !!document.querySelector('#pf-ledger-subcategory option[value="tax"]'), "subcategory");
    fill("#pf-ledger-link-type", "asset");
    await wait(100);
    check("link ID becomes a dependent dropdown", document.querySelector("#pf-ledger-link-id") && document.querySelector("#pf-ledger-link-id").tagName === "SELECT", "select");
    check("asset link options are populated", document.querySelectorAll("#pf-ledger-link-id option").length > 1, "options");
    fill("#pf-ledger-link-type", "presell");
    await wait(100);
    check("pre-selling project options are populated", Array.prototype.some.call(document.querySelectorAll("#pf-ledger-link-id option"), function (option) { return /Pre-Selling Project/.test(option.textContent); }), "project options");
    document.querySelector("[data-pf-save-ledger-entry]").click();
    await wait(200);
    check("required validation keeps modal open", document.querySelector("#pf-ledger-entry-modal").style.display === "flex", "description required");
    fill("#pf-ledger-subcategory", "tax");
    fill("#pf-ledger-description", "Annual property tax");
    fill("#pf-ledger-amount", "1000");
    document.querySelector("[data-pf-save-ledger-entry]").click();
    await wait(500);
    check("cash out posts", document.querySelectorAll('[data-pf-ledger-row][data-direction="out"]').length === 1, "posted");
    check("posted balance is displayed", /2,499,000/.test(document.querySelector("#content").textContent), "balance");
    fill("#pf-search", "Annual property tax");
    await wait(100);
    check("search filters rows", visibleRows() === 1, document.querySelector("#pf-ledger-count").textContent);
    document.querySelector("[data-pf-clear-filters]").click();
    check("clear filters restores rows", visibleRows() === 1, "clear");
    check("no horizontal overflow", document.documentElement.scrollWidth <= window.innerWidth + 2, "sw=" + document.documentElement.scrollWidth + " vw=" + window.innerWidth);
  } catch (error) {
    window.__msErr = String(error && error.stack || error);
  }
  window.__msChecks = checks;
  window.__msLog = checks.map(function (item) { return (item.ok ? "PASS " : "FAIL ") + item.name + " :: " + item.detail; });
  window.__msOk = !window.__msErr && checks.length > 0 && checks.every(function (item) { return item.ok; });
  window.__msDone = true;
})();
