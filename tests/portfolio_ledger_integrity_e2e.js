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
  var rowWith = function (needle) {
    var rows = document.querySelectorAll('[data-pf-ledger-row][data-search*="' + needle + '"]');
    return rows.length ? rows[0] : null;
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

    document.querySelector("[data-pf-new-entry]").click();
    await wait(200);
    var preview = document.querySelector("#pf-ledger-balance-preview");
    check("balance preview exists in modal", !!preview, preview ? "open" : "missing");
    check("balance preview shows current balance", preview && /Current balance/.test(preview.textContent), preview ? preview.textContent : "");
    fill("#pf-ledger-amount", "50000");
    await wait(120);
    check("balance preview shows after-save", /After save/.test(preview.textContent), preview ? preview.textContent : "");
    fill("#pf-ledger-description", "Seed inflow integrity");
    fill("#pf-ledger-counterparty", "Test Buyer");
    document.querySelector("[data-pf-save-ledger-entry]").click();
    await wait(400);
    check("seed inflow posts", !!rowWith("seed inflow"), "row");
    check("seed inflow balance shows", /2,550,000/.test(document.querySelector("#content").textContent), "balance");

    document.querySelector("[data-pf-new-entry]").click();
    await wait(200);
    fill("#pf-ledger-direction", "out");
    await wait(100);
    fill("#pf-ledger-purpose", "others");
    await wait(100);
    fill("#pf-ledger-subcategory", "tax");
    fill("#pf-ledger-description", "Planned site bill");
    fill("#pf-ledger-amount", "200000");
    document.querySelector("[data-pf-save-draft]").click();
    await wait(400);
    var draftRow = rowWith("planned site");
    check("save draft creates draft", draftRow && draftRow.getAttribute("data-status") === "draft", draftRow ? draftRow.getAttribute("data-status") : "none");
    check("draft does not change balance", !/2,350,000/.test(document.querySelector("#content").textContent) && /2,550,000/.test(document.querySelector("#content").textContent), "balance");
    check("draft has edit action", draftRow && !!draftRow.querySelector("[data-pf-edit-entry]"), "edit");

    draftRow.querySelector("[data-pf-edit-entry]").click();
    await wait(200);
    check("editing draft opens entry modal", document.querySelector("#pf-ledger-entry-modal").style.display === "flex", "modal");
    check("edit modal titled for draft", /Edit Draft/.test(document.querySelector("#pf-ledger-entry-title").textContent), "title");
    fill("#pf-ledger-amount", "150000");
    document.querySelector("[data-pf-save-draft]").click();
    await wait(400);
    draftRow = rowWith("planned site");
    check("draft edit keeps draft status", draftRow && draftRow.getAttribute("data-status") === "draft", draftRow ? draftRow.getAttribute("data-status") : "none");

    draftRow.querySelector("[data-pf-edit-entry]").click();
    await wait(200);
    document.querySelector("[data-pf-save-ledger-entry]").click();
    await wait(400);
    check("posting draft moves balance", /2,400,000/.test(document.querySelector("#content").textContent), "2.4M");
    check("posted row has reverse only", document.querySelectorAll('[data-pf-ledger-row][data-status="posted"] [data-pf-edit-entry]').length === 0 && document.querySelectorAll('[data-pf-ledger-row][data-status="posted"] [data-pf-del-entry]').length === 0, "actions");

    var postedNotReversed = document.querySelectorAll('[data-pf-ledger-row][data-status="posted"] [data-pf-reverse]');
    check("posted entries expose reverse", postedNotReversed.length >= 1, "reverse");
    postedNotReversed[0].click();
    await wait(400);
    check("reversal row appears", document.querySelectorAll('[data-pf-ledger-row][data-status="reversed"]').length >= 2, "reversed rows");
    check("reversal restores balance", /2,550,000/.test(document.querySelector("#content").textContent), "balance back");
    check("original shown as reversed", /Reversed/.test(document.querySelector("#content").textContent), "badge");

    document.querySelector("[data-pf-new-entry]").click();
    await wait(200);
    fill("#pf-ledger-direction", "out");
    await wait(100);
    fill("#pf-ledger-purpose", "others");
    await wait(100);
    fill("#pf-ledger-subcategory", "tax");
    fill("#pf-ledger-description", "Void me bill");
    fill("#pf-ledger-amount", "100000");
    document.querySelector("[data-pf-save-draft]").click();
    await wait(400);
    var voidRow = rowWith("void me");
    check("voidable draft row has void action", voidRow && !!voidRow.querySelector("[data-pf-del-entry]"), "void btn");
    voidRow.querySelector("[data-pf-del-entry]").click();
    await wait(400);
    voidRow = rowWith("void me");
    check("void keeps record as voided", voidRow && voidRow.getAttribute("data-status") === "voided", voidRow ? voidRow.getAttribute("data-status") : "none");
    check("void does not change balance", !/2,450,000/.test(document.querySelector("#content").textContent), "balance");
    check("voided row exposes purge", voidRow && !!voidRow.querySelector("[data-pf-purge-entry]"), "purge btn");
    voidRow.querySelector("[data-pf-purge-entry]").click();
    await wait(400);
    check("purge removes voided entry", !rowWith("void me"), "purged");

    document.querySelector("[data-pf-new-entry]").click();
    await wait(200);
    fill("#pf-ledger-direction", "out");
    await wait(100);
    fill("#pf-ledger-purpose", "others");
    await wait(100);
    fill("#pf-ledger-subcategory", "tax");
    fill("#pf-ledger-description", "Filter target bill");
    fill("#pf-ledger-amount", "1000");
    document.querySelector("[data-pf-save-draft]").click();
    await wait(400);
    fill("#pf-filter-status", "draft");
    await wait(150);
    check("status filter shows drafts only", visibleRows() === 1, "count=" + visibleRows());
    fill("#pf-filter-status", "");
    document.querySelector("[data-pf-clear-filters]").click();
    await wait(150);
    check("clear status filter restores rows", visibleRows() > 1, "count=" + visibleRows());

    var content = document.querySelector("#content").textContent;
    check("audit trail shows entry_posted", /entry_posted/.test(content), "audit");
    check("audit trail shows entry_reversed", /entry_reversed/.test(content), "audit");
    check("audit trail shows entry_voided", /entry_voided/.test(content), "audit");
    check("audit trail shows entry_deleted", /entry_deleted/.test(content), "audit");
    check("no horizontal overflow", document.documentElement.scrollWidth <= window.innerWidth + 2, "sw=" + document.documentElement.scrollWidth + " vw=" + window.innerWidth);
  } catch (error) {
    window.__msErr = String(error && error.stack || error);
  }
  window.__msChecks = checks;
  window.__msLog = checks.map(function (item) { return (item.ok ? "PASS " : "FAIL ") + item.name + " :: " + item.detail; });
  window.__msOk = !window.__msErr && checks.length > 0 && checks.every(function (item) { return item.ok; });
  window.__msDone = true;
})();