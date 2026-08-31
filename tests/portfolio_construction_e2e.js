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
  var contentText = function () { return document.querySelector("#content").textContent; };
  try {
    localStorage.removeItem("esrealty_v1");
    localStorage.removeItem("esrealty_user");
    document.querySelector("#auth-role").value = "super-admin";
    document.querySelector("#auth-test").click();
    await wait(700);
    document.querySelector('[data-view="portfolio"]').click();
    await wait(500);
    document.querySelector('[data-ptab="construction"]').click();
    await wait(300);

    check("construction tab renders", /Construction Projects/.test(contentText()), "tab");
    document.querySelector("[data-pf-new-proj]").click();
    await wait(200);
    var modal = document.querySelector("#pf-construction-modal");
    check("project modal opens", modal && getComputedStyle(modal).display === "flex", modal ? getComputedStyle(modal).display : "missing");
    check("project fields are full width", modal && Array.prototype.every.call(modal.querySelectorAll("input,select"), function (el) { return el.getBoundingClientRect().width >= Math.min(280, window.innerWidth - 60); }), "viewport=" + window.innerWidth);
    fill("#pf-proj-name", "Investor Build One");
    fill("#pf-proj-site", "Manila");
    fill("#pf-proj-contractor", "ES Realty Construction");
    fill("#pf-proj-value", "5000000");
    fill("#pf-proj-cont", "250000");
    document.querySelector("[data-pf-save-proj]").click();
    await wait(500);
    check("project saved", /Investor Build One/.test(contentText()), "saved");

    var open = document.querySelector("[data-pf-open-proj]");
    if (open) open.click();
    await wait(300);
    check("project selection shows phases", /Phases/.test(contentText()), "selected");
    check("retention column renders", /Retention/.test(contentText()), "header");
    var add = document.querySelector("[data-pf-add-phase]");
    check("add phase action present", !!add, add ? "present" : "missing");
    if (add) add.click();
    await wait(200);
    var phaseModal = document.querySelector("#pf-phase-modal");
    check("phase modal opens", phaseModal && getComputedStyle(phaseModal).display === "flex", phaseModal ? getComputedStyle(phaseModal).display : "missing");
    fill("#pf-phase-name", "Foundation");
    fill("#pf-phase-planned", "1000000");
    fill("#pf-phase-approved", "950000");
    fill("#pf-phase-committed", "500000");
    fill("#pf-phase-paid", "250000");
    fill("#pf-phase-progress", "25");
    fill("#pf-phase-responsible", "ES Realty Construction");
    document.querySelector("[data-pf-save-phase]").click();
    await wait(500);
    check("phase saved", /Foundation/.test(contentText()), "saved");
    check("phase budget is displayed", /1,000,000/.test(contentText()), "budget");
    check("no horizontal overflow", document.documentElement.scrollWidth <= window.innerWidth + 2, "sw=" + document.documentElement.scrollWidth + " vw=" + window.innerWidth);

    // Phase 2 depth
    check("project summary card renders", /Forecast final/.test(contentText()), "forecast");
    check("project action buttons render", /Change Order/.test(contentText()), "buttons");

    // edit project: retention, allocation, status
    var editProj = document.querySelector("[data-pf-edit-proj]");
    check("edit project action present", !!editProj, editProj ? "present" : "missing");
    if (editProj) editProj.click();
    await wait(200);
    fill("#pf-proj-retention", "10");
    fill("#pf-proj-allocation", "floor_area");
    fill("#pf-proj-status", "under construction");
    document.querySelector("[data-pf-save-proj]").click();
    await wait(500);
    check("project edit saves retention/allocation/status", /under construction/.test(contentText()) && /floor_area/.test(contentText()), "saved");
    check("retention amount appears in summary", /50,000/.test(contentText()), "retention");

    // phase edit
    var editPhase = document.querySelector("[data-pf-edit-phase]");
    check("phase edit action present", !!editPhase, editPhase ? "present" : "missing");
    if (editPhase) editPhase.click();
    await wait(200);
    fill("#pf-phase-planned", "1200000");
    document.querySelector("[data-pf-save-phase]").click();
    await wait(500);
    check("phase edit updates planned budget", /1,200,000/.test(contentText()), "edited");

    // vendor
    var newVendor = document.querySelector("[data-pf-new-vendor]");
    check("vendor add action present", !!newVendor, newVendor ? "present" : "missing");
    if (newVendor) newVendor.click();
    await wait(200);
    var vendorModal = document.querySelector("#pf-vendor-modal");
    check("vendor modal opens", vendorModal && getComputedStyle(vendorModal).display === "flex", vendorModal ? getComputedStyle(vendorModal).display : "missing");
    fill("#pf-vendor-name", "Mega Build Co.");
    document.querySelector("[data-pf-save-vendor]").click();
    await wait(500);
    check("vendor saved", /Mega Build Co\./.test(contentText()), "saved");

    // invoice
    var newInvoice = document.querySelector("[data-pf-new-invoice]");
    check("invoice add action present", !!newInvoice, newInvoice ? "present" : "missing");
    if (newInvoice) newInvoice.click();
    await wait(200);
    var invoiceModal = document.querySelector("#pf-invoice-modal");
    check("invoice modal opens", invoiceModal && getComputedStyle(invoiceModal).display === "flex", invoiceModal ? getComputedStyle(invoiceModal).display : "missing");
    fill("#pf-invoice-no", "INV-26-001");
    var vSel = document.querySelector("#pf-invoice-vendor");
    if (vSel && vSel.options.length > 1) vSel.value = vSel.options[1].value;
    fill("#pf-invoice-amount", "150000");
    document.querySelector("[data-pf-save-invoice]").click();
    await wait(500);
    check("invoice saved", /INV-26-001/.test(contentText()), "saved");

    // pay invoice (single posted ledger entry)
    var pay = document.querySelector("[data-pf-pay-invoice]");
    check("invoice pay action present", !!pay, pay ? "present" : "missing");
    if (pay) { pay.click(); }
    await wait(600);
    check("invoice marked paid", /INV-26-001/.test(contentText()) && /paid/.test(contentText()), "paid");
    check("phase paid bumped by invoice", /400,000/.test(contentText()), "phase-paid");

    // verify exactly one posted construction cash-out in ledger + updated balance
    document.querySelector('[data-ptab="ledger"]').click();
    await wait(400);
    var ledgerText = contentText();
    check("ledger balance reflects invoice", /2,350,000/.test(ledgerText), "balance");
    var rows = document.querySelectorAll("[data-pf-ledger-row]");
    var outCons = Array.prototype.filter.call(rows, function (r) { return r.getAttribute("data-direction") === "out" && /construction/.test(r.getAttribute("data-search")); }).length;
    check("single posted construction cash-out", outCons === 1, "out rows=" + outCons);
    check("invoice payment audited", /invoice_paid/.test(document.querySelector("#content").textContent), "audit");

    // back to construction for the rest
    document.querySelector('[data-ptab="construction"]').click();
    await wait(400);

    // change order
    var newChange = document.querySelector("[data-pf-new-change]");
    check("change order add action present", !!newChange, newChange ? "present" : "missing");
    if (newChange) newChange.click();
    await wait(200);
    var changeModal = document.querySelector("#pf-change-modal");
    check("change order modal opens", changeModal && getComputedStyle(changeModal).display === "flex", changeModal ? getComputedStyle(changeModal).display : "missing");
    fill("#pf-change-reason", "Extra footing depth");
    fill("#pf-change-amount", "50000");
    fill("#pf-change-approver", "JM");
    document.querySelector("[data-pf-save-change]").click();
    await wait(500);
    check("change order saved", /Extra footing depth/.test(contentText()), "saved");
    check("change order added to forecast", /added to forecast/.test(contentText()), "forecast");

    // over-budget warning: committed > planned
    var editPhase2 = document.querySelector("[data-pf-edit-phase]");
    if (editPhase2) editPhase2.click();
    await wait(200);
    fill("#pf-phase-committed", "1300000");
    document.querySelector("[data-pf-save-phase]").click();
    await wait(500);
    check("over-budget warning shows", /Over budget/.test(contentText()), "warning");
    var editPhase3 = document.querySelector("[data-pf-edit-phase]");
    if (editPhase3) editPhase3.click();
    await wait(200);
    fill("#pf-phase-committed", "500000");
    document.querySelector("[data-pf-save-phase]").click();
    await wait(500);
    check("over-budget warning clears", !/Over budget/.test(contentText()), "cleared");

    // phase delete: temp phase deletable, Foundation blocked
    var addPhase2 = document.querySelector("[data-pf-add-phase]");
    if (addPhase2) addPhase2.click();
    await wait(200);
    fill("#pf-phase-name", "Temp Phase");
    fill("#pf-phase-planned", "1");
    var savePhaseBtn = document.querySelector("[data-pf-save-phase]");
    if (savePhaseBtn) savePhaseBtn.click();
    await wait(400);
    check("temp phase added", /Temp Phase/.test(contentText()), "added");
    var tempRow = Array.prototype.find.call(document.querySelectorAll("[data-pf-del-phase]"), function (b) {
      return b.closest("tr") && /Temp Phase/.test(b.closest("tr").textContent);
    });
    check("temp phase delete action present", !!tempRow, tempRow ? "present" : "missing");
    if (tempRow) tempRow.click();
    await wait(350);
    check("temp phase deleted", !/Temp Phase/.test(contentText()), "deleted");
    var foundationDel = Array.prototype.find.call(document.querySelectorAll("[data-pf-del-phase]"), function (b) {
      return b.closest("tr") && /Foundation/.test(b.closest("tr").textContent);
    });
    check("foundation delete action present", !!foundationDel, foundationDel ? "present" : "missing");
    if (foundationDel) foundationDel.click();
    await wait(350);
    check("paid/invoiced phase delete is blocked", /Foundation/.test(contentText()), "blocked");

    check("final no horizontal overflow", document.documentElement.scrollWidth <= window.innerWidth + 2, "sw=" + document.documentElement.scrollWidth + " vw=" + window.innerWidth);
  } catch (error) {
    window.__msErr = String(error && error.stack || error);
  }
  window.__msChecks = checks;
  window.__msLog = checks.map(function (item) { return (item.ok ? "PASS " : "FAIL ") + item.name + " :: " + item.detail; });
  window.__msOk = !window.__msErr && checks.length > 0 && checks.every(function (item) { return item.ok; });
  window.__msDone = true;
})();