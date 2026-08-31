(async function () {
  var wait = function (ms) { return new Promise(function (resolve) { setTimeout(resolve, ms); }); };
  var checks = [];
  function check(name, ok, detail) { checks.push({ name: name, ok: !!ok, detail: detail || "" }); }
  try {
    localStorage.removeItem("esrealty_v1");
    localStorage.removeItem("esrealty_user");
    document.querySelector("#auth-role").value = "super-admin";
    document.querySelector("#auth-test").click();
    await wait(800);
    document.querySelector('[data-view="portfolio"]').click();
    await wait(700);
    document.querySelector('[data-ptab="ledger"]').click();
    await wait(500);

    var rowCount = function () { return document.querySelectorAll("[data-pf-ledger-row]").length; };
    var bodyText = function () { return document.body.textContent; };

    check("ledger tab renders import-presell action", !!document.querySelector("[data-pf-migrate-presell]"), "button");
    check("fresh seed ledger starts empty", rowCount() === 0, "rows=" + rowCount());

    document.querySelector("[data-pf-migrate-presell]").click();
    await wait(700);

    check("import posts exactly one collection", rowCount() === 1, "rows=" + rowCount());
    var row = document.querySelector("[data-pf-ledger-row]");
    var rowText = row ? row.textContent : "";
    var cells = row ? row.querySelectorAll("td") : [];
    check("migrated row is a posted cash-in", /Cash In/.test(rowText) && /posted/.test(rowText), "row");
    check("migrated row carries amount and label", cells.length >= 4 && cells[3].textContent.trim() === "\u20B195,000" && /presell collection: equity 1/.test(row.getAttribute("data-search") || ""), cells.length >= 4 ? cells[3].textContent.trim() : "no cell");
    check("migrated row links the presell payment", /pre-selling:ppay-E/.test(rowText), "link");
    check("running balance after migration is 2.595M", cells.length >= 9 && cells[8].textContent.indexOf("\u20B12,595,000") >= 0, cells.length >= 9 ? cells[8].textContent : "no cell");
    check("ledger count reports one entry", document.getElementById("pf-ledger-count") && /^Showing 1 of 1 entries$/.test(document.getElementById("pf-ledger-count").textContent), "count");
    check("import success toast shown", /Imported 1 presell collection/.test(bodyText()), "toast");
    check("audit trail records backfill event", /entry_migrated/.test(bodyText()) && /backfilled presell collection/.test(bodyText()), "audit");

    document.querySelector('[data-ptab="overview"]').click();
    await wait(500);
    var html = document.querySelector("#content").textContent;
    var kvals = Array.prototype.map.call(document.querySelectorAll(".kpi"), function (k) {
      var label = k.querySelector(".k-label");
      var value = k.querySelector(".k-value");
      return (label ? label.textContent.trim() : "") + " = " + (value ? value.textContent.trim() : "");
    });
    var card = function (label) {
      var hit = kvals.filter(function (x) { return x.indexOf(label + " =") === 0; })[0] || "";
      return hit.slice(label.length + 3);
    };
    check("overview cash balance reflects migrated collection", card("Cash Balance") === "\u20B12,595,000", card("Cash Balance"));
    check("overview cash in/out records the collection", card("Cash In / Out") === "\u20B195,000 / \u20B10", card("Cash In / Out"));
    check("overview receivables unchanged (paid already collected)", card("Receivables") === "\u20B1190,000", card("Receivables"));

    document.querySelector('[data-ptab="ledger"]').click();
    await wait(400);
    document.querySelector("[data-pf-migrate-presell]").click();
    await wait(700);
    check("re-import does not double count", rowCount() === 1, "rows=" + rowCount());
    check("re-import reports already in ledger", /already in the ledger/.test(bodyText()), "toast");
  } catch (e) {
    window.__msErr = String(e && e.stack || e);
  }
  window.__msChecks = checks;
  window.__msOk = !window.__msErr && checks.length > 0 && checks.every(function (c) { return c.ok; });
  window.__msDone = true;
})();