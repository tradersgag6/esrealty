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
  var setFile = function (el, name, mime, body) {
    return (fetch("data:" + mime + ";base64," + btoa(body)).then(function (r) { return r.blob(); }).then(function (blob) {
      var dt = new DataTransfer();
      dt.items.add(new File([blob], name, { type: mime }));
      el.files = dt.files;
      el.dispatchEvent(new Event("change", { bubbles: true }));
      return true;
    }));
  };
  var PNG1 = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==";
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

    // 1) invalid file is rejected with an error toast and no pending preview
    document.querySelector("[data-pf-new-entry]").click();
    await wait(200);
    var pfInput = document.querySelector("#pf-entry-proof");
    check("entry modal has proof upload input", !!pfInput, "input");
    var pfCat = document.querySelector("#pf-entry-proof-category");
    check("proof category select present", !!pfCat && pfCat.value === "receipt", "cat=" + (pfCat ? pfCat.value : "none"));
    await setFile(pfInput, "note.txt", "text/plain", "just text");
    await wait(400);
    var preview = document.querySelector("#pf-entry-proof-preview");
    check("invalid file keeps preview empty", preview && preview.innerHTML.indexOf("pf-proof-item") < 0, "preview");
    check("invalid file shows an error toast", document.querySelector("#toasts .toast.err") !== null, "toast");
    document.querySelector("[data-pf-close-ledger-entry]").click();
    await wait(200);

    // 2) attach a PNG proof to a posted inflow
    document.querySelector("[data-pf-new-entry]").click();
    await wait(200);
    fill("#pf-ledger-amount", "50000");
    fill("#pf-ledger-description", "Proofed inflow");
    fill("#pf-ledger-counterparty", "Test Buyer");
    await setFile(document.querySelector("#pf-entry-proof"), "receipt.png", "image/png", atob(PNG1));
    await wait(500);
    preview = document.querySelector("#pf-entry-proof-preview");
    check("pending proof preview shows thumbnail", preview && !!preview.querySelector(".pf-proof-thumb"), "thumb");
    check("pending proof preview shows filename + category", preview && /receipt\.png/.test(preview.textContent) && /Receipt/.test(preview.textContent), "meta");
    document.querySelector("[data-pf-save-ledger-entry]").click();
    await wait(400);

    // 3) attach a PDF (contract) proof to a draft outflow
    document.querySelector("[data-pf-new-entry]").click();
    await wait(200);
    fill("#pf-ledger-direction", "out");
    await wait(100);
    fill("#pf-ledger-purpose", "others");
    await wait(100);
    fill("#pf-ledger-subcategory", "tax");
    fill("#pf-ledger-description", "Draft legal bill with pdf");
    fill("#pf-ledger-amount", "1000");
    fill("#pf-entry-proof-category", "contract");
    await setFile(document.querySelector("#pf-entry-proof"), "contrato.pdf", "application/pdf", "%PDF-1.1 miniproof");
    await wait(500);
    document.querySelector("[data-pf-save-draft]").click();
    await wait(400);

    // 4) ledger proof column reflects attachments
    var inflowRow = document.querySelector('[data-pf-ledger-row][data-search*="proofed inflow"]');
    check("ledger proof column shows count", inflowRow && /1 proof/.test(inflowRow.textContent), inflowRow ? inflowRow.children[6].textContent : "none");

    // 5) Proofs tab renders full cards with metadata + secure-mode label
    document.querySelector('[data-ptab="docs"]').click();
    await wait(400);
    var cards = document.querySelectorAll(".pf-proof-card");
    check("proofs tab lists both proofs", cards.length === 2, "cards=" + cards.length);
    var imgCard = null;
    Array.prototype.forEach.call(cards, function (c) { if (/receipt\.png/.test(c.textContent)) imgCard = c; });
    check("png card shows thumbnail link", imgCard && !!imgCard.querySelector(".pf-proof-thumb-link img"), "thumb");
    check("png card shows category + mime + mode label",
      imgCard && /Receipt/.test(imgCard.textContent) && /image\/png/.test(imgCard.textContent) && /Local adapter/.test(imgCard.textContent), "meta");
    check("png card shows checksum",
      imgCard && /^[0-9a-f]{8}$/.test((imgCard.textContent.match(/[0-9a-f]{8}/) || [""])[0]), "checksum");
    check("png card exposes view link", imgCard && /data:image\/png/.test(imgCard.querySelector(".pf-proof-thumb-link").getAttribute("href")), "view");
    check("png card exposes replace + remove (admin)",
      imgCard && !!imgCard.querySelector(".pf-proof-replace-input") && !!imgCard.querySelector("[data-pf-proof-remove]"), "actions");
    var pdfCard = null;
    Array.prototype.forEach.call(cards, function (c) { if (/contrato\.pdf/.test(c.textContent)) pdfCard = c; });
    check("pdf card shows pdf chip", pdfCard && !!pdfCard.querySelector(".pf-proof-pdf"), "pdf-chip");

    // 6) category filter
    document.querySelector("#pf-proof-category-filter").value = "contract";
    document.querySelector("#pf-proof-category-filter").dispatchEvent(new Event("change", { bubbles: true }));
    await wait(150);
    var visible = Array.prototype.filter.call(document.querySelectorAll(".pf-proof-card"), function (c) { return getComputedStyle(c).display !== "none"; }).length;
    check("category filter narrows to contract", visible === 1 && pdfCard.style.display !== "none", "visible=" + visible);
    document.querySelector("#pf-proof-category-filter").value = "";
    document.querySelector("#pf-proof-category-filter").dispatchEvent(new Event("change", { bubbles: true }));
    await wait(150);
    visible = Array.prototype.filter.call(document.querySelectorAll(".pf-proof-card"), function (c) { return getComputedStyle(c).display !== "none"; }).length;
    check("clearing category filter restores cards", visible === 2, "visible=" + visible);

    // 7) replace a proof (filename + audit change, same checksum source deterministic)
    var replaceInput = imgCard.querySelector(".pf-proof-replace-input");
    var beforeChecksum = (imgCard.textContent.match(/[0-9a-f]{8}/) || [""])[0];
    await setFile(replaceInput, "receipt-v2.png", "image/png", atob(PNG1));
    await wait(500);
    cards = document.querySelectorAll(".pf-proof-card");
    var imgCard2 = null;
    Array.prototype.forEach.call(cards, function (c) { if (/receipt-v2\.png/.test(c.textContent)) imgCard2 = c; });
    check("replace updates filename", !!imgCard2, "name=" + (imgCard2 ? "updated" : "missing"));
    check("replace keeps category + checksum", imgCard2 && /Receipt/.test(imgCard2.textContent) && (imgCard2.textContent.match(/[0-9a-f]{8}/) || [""])[0] === beforeChecksum, "meta stable");

    // 8) remove the pdf proof (confirm dialog auto-accepted by driver)
    var contractCard = null;
    Array.prototype.forEach.call(document.querySelectorAll(".pf-proof-card"), function (c) { if (/contrato\.pdf/.test(c.textContent)) contractCard = c; });
    check("contract card still rendered after replace", !!contractCard, "card");
    contractCard.querySelector("[data-pf-proof-remove]").click();
    await wait(400);
    var cardsLeft = document.querySelectorAll(".pf-proof-card").length;
    check("remove deletes the proof card", cardsLeft === 1, "cards=" + cardsLeft);
    check("no pdf proof remains", !/contrato\.pdf/.test(document.querySelector("#content").textContent), "gone");

    // 9) audits recorded (audit trail lives on the ledger tab)
    document.querySelector('[data-ptab="ledger"]').click();
    await wait(400);
    var content = document.querySelector("#content").textContent;
    check("audit trail shows proof_uploaded", /proof_uploaded/.test(content), "audit");
    check("audit trail shows proof_replaced", /proof_replaced/.test(content), "audit");
    check("audit trail shows proof_removed", /proof_removed/.test(content), "audit");

    // 10) ledger still shows the surviving proof
    inflowRow = document.querySelector('[data-pf-ledger-row][data-search*="proofed inflow"]');
    check("surviving proof still shown in ledger", inflowRow && /1 proof/.test(inflowRow.textContent), inflowRow ? inflowRow.children[6].textContent : "none");

    check("no horizontal overflow", document.documentElement.scrollWidth <= window.innerWidth + 2, "sw=" + document.documentElement.scrollWidth + " vw=" + window.innerWidth);
  } catch (error) {
    window.__msErr = String(error && error.stack || error);
  }
  window.__msChecks = checks;
  window.__msLog = checks.map(function (item) { return (item.ok ? "PASS " : "FAIL ") + item.name + " :: " + item.detail; });
  window.__msOk = !window.__msErr && checks.length > 0 && checks.every(function (item) { return item.ok; });
  window.__msDone = true;
})();