(async function () {
  var wait = function (ms) { return new Promise(function (resolve) { setTimeout(resolve, ms); }); };
  var checks = [];
  var check = function (name, ok, detail) { checks.push({ name: name, ok: !!ok, detail: detail || "" }); };
  var setv = function (selector, value) {
    var el = document.querySelector(selector);
    if (!el) return false;
    el.value = value;
    el.dispatchEvent(new Event("input", { bubbles: true }));
    el.dispatchEvent(new Event("change", { bubbles: true }));
    return true;
  };
  try {
    // Capture every Blob the app hands to a download without hitting the disk
    var captured = [];
    window.URL.createObjectURL = function (blob) { captured.push(blob); return "blob:captured/" + (captured.length - 1); };
    window.URL.revokeObjectURL = function () {};
    HTMLAnchorElement.prototype.click = function () {};
    var blobText = function (blob) { return blob.text(); };

    localStorage.removeItem("esrealty_v1");
    localStorage.removeItem("esrealty_user");
    document.querySelector("#auth-role").value = "super-admin";
    document.querySelector("#auth-test").click();
    await wait(800);

    // Seed the workspace with a real listing so exports have data rows
    document.querySelector('[data-view="listings"]').click();
    await wait(650);
    document.querySelector("[data-ls-new]").click();
    await wait(400);
    setv("#ls-title", "Backup Test Condo");
    setv("#ls-city", "Makati");
    setv("#ls-price", "8000000");
    setv("#ls-lot", "60");
    setv("#ls-floor", "45");
    var saveBtn = null, m = document.querySelector("#ls-modal");
    if (m) saveBtn = Array.prototype.filter.call(m.querySelectorAll("button"), function (b) { return /Save/i.test(b.textContent); })[0];
    if (saveBtn) saveBtn.click();
    await wait(800);
    check("demo listing created for backup test", /Backup Test Condo/.test(document.querySelector("#content").innerHTML), "grid");

    // Open Settings
    var settingsNav = document.querySelector('[data-view="settings"]');
    if (settingsNav) settingsNav.click();
    await wait(600);

    // Backup card present (super-admin only)
    var btnJson = document.querySelector("[data-backup-json]");
    var btnCsvLeads = document.querySelector("[data-backup-leads-csv]");
    var btnCsvListings = document.querySelector("[data-backup-listings-csv]");
    check("backup card renders for super admin", !!btnJson && !!btnCsvLeads && !!btnCsvListings, "json=" + !!btnJson + " leads=" + !!btnCsvLeads + " listings=" + !!btnCsvListings);
    check("backup card copy mentions JSON + storage note", /Database backup/.test(document.body.textContent) && /Supabase Storage/.test(document.body.textContent), "card");

    // Inject a sentinel into the local users store to prove secrets are stripped
    var users = [];
    try { users = JSON.parse(localStorage.getItem("esrealty_users") || "[]"); } catch (e) {}
    users.push({ email: "backup-sentinel@esrealty.ph", name: "SANITY_KEEP_VALUE", role: "buyer", password: "SENTINEL_SECRET_ABC123", pwd: "pwdsecret987" });
    localStorage.setItem("esrealty_users", JSON.stringify(users));

    // 1) Full JSON backup
    captured.length = 0;
    btnJson.click();
    for (var i = 0; i < 40 && captured.length === 0; i++) { await wait(200); }
    check("JSON backup produces a download blob", captured.length === 1, "blobs=" + captured.length);
    check("JSON backup button re-enables", !btnJson.disabled, "disabled=" + btnJson.disabled);

    var json = null, jsonErr = "";
    try { json = JSON.parse(await blobText(captured[0])); } catch (e) { jsonErr = String(e); }
    check("JSON backup parses", !!json && !jsonErr, jsonErr || "parsed");
    check("JSON meta recorded", !!json && json.meta && json.meta.app === "ES Realty" && json.meta.role === "super-admin" && /T\d{2}:\d{2}/.test(json.meta.exportedAt || ""), json.meta ? json.meta.exportedAt : "none");
    check("JSON workspace exported", !!json && typeof json.workspace === "object" && json.workspace !== null, "type=" + (json ? typeof json.workspace : "null"));
    check("JSON workspace contains the seeded listing", !!json && /Backup Test Condo/.test(JSON.stringify(json.workspace)), "workspace listing");
    check("JSON local users exported as array", !!json && Array.isArray(json.localUsers), "array");
    check("JSON cloud section exported", !!json && json.cloud && Array.isArray(json.cloud.listings) && Array.isArray(json.cloud.leads) && Array.isArray(json.cloud.profiles), "sections");
    var jsonText = await blobText(captured[0]);
    check("JSON keeps non-secret data", /SANITY_KEEP_VALUE/.test(jsonText), "keep");
    var stripped = !/(SENTINEL_SECRET_ABC123|pwdsecret987)/.test(jsonText) && !/"(password|pwd|passwd|pass)"\s*:/.test(jsonText);
    check("JSON strips passwords (password/pwd/pass keys)", stripped, stripped ? "clean" : "secret found");

    // 2) Leads CSV
    captured.length = 0;
    btnCsvLeads.click();
    for (i = 0; i < 40 && captured.length === 0; i++) { await wait(200); }
    var leadsCsv = captured.length ? await blobText(captured[0]) : "";
    check("Leads CSV produces a download blob", captured.length === 1, "blobs=" + captured.length);
    check("Leads CSV has header", /^ref,name,email,phone,type,status,interest,createdAt,assignedTo,source,notes/.test(leadsCsv.trim().split("\n")[0]), "header");

    // 3) Listings CSV
    captured.length = 0;
    btnCsvListings.click();
    for (i = 0; i < 40 && captured.length === 0; i++) { await wait(200); }
    var listCsv = captured.length ? await blobText(captured[0]) : "";
    var listRows = listCsv.trim().split("\n");
    check("Listings CSV produces a download blob", captured.length === 1, "blobs=" + captured.length);
    check("Listings CSV has header", /^id,ref,title,status,type,dealType,price,/.test(listRows[0]), "header");
    check("Listings CSV has data rows", listRows.length >= 2, "rows=" + listRows.length);
    check("Listings CSV builds public URLs", listRows.length >= 2 && /#\/listing\//.test(listRows[1]), "url=" + (listRows[1] || "none").slice(0, 80));

    check("no horizontal overflow", document.documentElement.scrollWidth <= window.innerWidth + 2, "sw=" + document.documentElement.scrollWidth + " vw=" + window.innerWidth);
  } catch (error) {
    window.__msErr = String(error && error.stack || error);
  }
  window.__msChecks = checks;
  window.__msLog = checks.map(function (item) { return (item.ok ? "PASS " : "FAIL ") + item.name + " :: " + item.detail; });
  window.__msOk = !window.__msErr && checks.length > 0 && checks.every(function (item) { return item.ok; });
  window.__msDone = true;
})();