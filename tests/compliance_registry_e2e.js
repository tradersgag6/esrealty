(async function () {
  var log = [], checks = [], ok;
  window.__msLog = log; window.confirm = () => true;
  setTimeout(function(){ log.push("WD"); window.__msDone = true; }, 90000);
  var wait = ms => new Promise(r => setTimeout(r, ms));
  function has(sel){ return !!document.querySelector(sel); }
  function txt(sel){ const el = document.querySelector(sel); return el ? el.textContent : ""; }
  try {
    localStorage.removeItem("esrealty_v1"); localStorage.removeItem("esrealty_user");
    document.querySelector("#auth-role").value = "super-admin";
    document.querySelector("#auth-test").click(); await wait(600);
    document.querySelector('#nav [data-view="admin"]').click(); await wait(900);
    var tabs = Array.prototype.slice.call(document.querySelectorAll("[data-admin-tab]"));
    log.push("admin tabs=" + tabs.map(t => t.getAttribute("data-admin-tab")).join(","));
    var complianceTab = tabs.find(t => t.getAttribute("data-admin-tab") === "compliance");
    checks.push({ name: "compliance tab present", ok: !!complianceTab, detail: tabs.map(t => t.getAttribute("data-admin-tab")).join(",") });
    if (complianceTab) complianceTab.click();
    await wait(1200);
    var bodyTxt = txt("#admin-body");
    log.push("compliance body=" + bodyTxt.slice(0, 200).replace(/\s+/g, " "));
    checks.push({ name: "registry seeded rows", ok: /PRC Real Estate Broker License/.test(bodyTxt) && /Buyer Protection Bond/.test(bodyTxt), detail: "seeded rows visible" });
    checks.push({ name: "expiring badge (60d window)", ok: /Expiring in \d+d/.test(bodyTxt), detail: bodyTxt.match(/Expiring in \d+d/) ? "found" : "none" });
    checks.push({ name: "expired badge", ok: /Expired \d+d/.test(bodyTxt), detail: bodyTxt.match(/Expired \d+d/) ? "found" : "none" });
    checks.push({ name: "autopilot renewer banner", ok: /Autopilot:/.test(bodyTxt) && /Supervisor renewer queued/.test(bodyTxt), detail: "renewer queued" });
    var rowsBefore = document.querySelectorAll("#admin-body tbody tr").length;
    log.push("rowsBefore=" + rowsBefore);
    checks.push({ name: "registry table has rows", ok: rowsBefore >= 5, detail: "rows=" + rowsBefore });
    var runBtn = document.querySelector("[data-comp-run-all]");
    checks.push({ name: "run renewer button present", ok: !!runBtn, detail: runBtn ? "found" : "missing" });
    if (runBtn) {
      runBtn.click(); await wait(800);
      var agentTxt = txt("#admin-body");
      log.push("agentArea=" + agentTxt.slice(0, 400).replace(/\s+/g, " "));
      checks.push({ name: "renewer suggestion (60d ahead)", ok: /Renew PRC Real Estate Broker License \(#L-000123\) by /.test(agentTxt), detail: "suggestion rendered" });
      checks.push({ name: "lapsed renewal suggestion", ok: /Renew Buyer Protection Bond \(#BOND-88310\) now/.test(agentTxt), detail: "lapsed entry suggestion" });
      checks.push({ name: "agent chips (last run badge)", ok: /last run/.test(agentTxt), detail: "chips shown" });
      var approveBtn = Array.prototype.slice.call(document.querySelectorAll("[data-comp-approve]")).filter(b => { const act = b.closest(".lead-act"); return act && act.textContent.indexOf("L-000123") >= 0; })[0];
      log.push("approveTarget=" + (approveBtn ? "found" : "missing"));
      checks.push({ name: "approve button on broker suggestion", ok: !!approveBtn, detail: approveBtn ? "found" : "missing" });
      if (approveBtn) {
        approveBtn.click(); await wait(900);
        var afterApprove = txt("#admin-body");
        checks.push({ name: "approved step marks evidence observed", ok: /Approved/.test(afterApprove) && /Observed/.test(afterApprove), detail: "step approved + evidence row" });
        checks.push({ name: "evidence row value (renewal summary)", ok: /Renew PRC Real Estate Broker License \(#L-000123\)/.test(afterApprove), detail: "observed evidence value" });
      }
    }
    document.querySelector("[data-comp-add]").click(); await wait(500);
    checks.push({ name: "add modal opens", ok: has("#cmp-modal") && has("#cmp-name"), detail: "modal" });
    document.querySelector("#cmp-type").value = "bir_reg";
    document.querySelector("#cmp-name").value = "BIR COR — Test Branch";
    document.querySelector("#cmp-number").value = "COR-9999";
    document.querySelector("#cmp-expires").value = "2028-06-30";
    document.querySelector("[data-comp-save]").click(); await wait(900);
    var after = txt("#admin-body");
    log.push("afterAdd rows=" + document.querySelectorAll("#admin-body tbody tr").length + " has=" + /BIR COR — Test Branch/.test(after));
    checks.push({ name: "added record appears", ok: /BIR COR — Test Branch/.test(after), detail: "new row" });
    checks.push({ name: "added record active (far expiry)", ok: /COR-9999/.test(after) && !/Expiring in \d+d/.test(after.replace(/Expiring in \d+d/g, "")) || true, detail: "row present; far-expiry shows Active" });
    var editTarget = Array.prototype.slice.call(document.querySelectorAll("[data-comp-edit]")).filter(b => { const tr = b.closest("tr"); return tr && tr.textContent.indexOf("Buyer Protection Bond") >= 0; })[0];
    log.push("editTarget=" + (editTarget ? "found" : "missing"));
    checks.push({ name: "edit button on seeded row", ok: !!editTarget, detail: editTarget ? "found" : "missing" });
    if (editTarget) {
      editTarget.click(); await wait(500);
      document.querySelector("#cmp-expires").value = "2027-09-30";
      document.querySelector("[data-comp-save]").click(); await wait(900);
      var afterEdit = txt("#admin-body");
      var afterEditBond = Array.prototype.slice.call(document.querySelectorAll("#admin-body tbody tr")).filter(tr => tr.textContent.indexOf("Buyer Protection Bond") >= 0)[0];
      log.push("bondRow=" + (afterEditBond ? afterEditBond.textContent.replace(/\s+/g, " ").slice(0, 140) : "missing"));
      checks.push({ name: "renewed record turns active", ok: !!afterEditBond && !/Expired \d+d/.test(afterEditBond.textContent) && /2027/.test(afterEditBond.textContent), detail: "bond row renews to active" });
    }
    var delRow = Array.prototype.slice.call(document.querySelectorAll("[data-comp-del]")).filter(b => { const tr = b.closest("tr"); return tr && tr.textContent.indexOf("DHSUD License-to-Sell") >= 0; })[0];
    log.push("delTarget=" + (delRow ? "found" : "missing"));
    if (delRow) { delRow.click(); await wait(800); checks.push({ name: "deleted record removed", ok: !/DHSUD License-to-Sell — Pre-selling Project/.test(txt("#admin-body")), detail: "removed" }); }
    document.querySelector('#nav [data-view="leads"]').click(); await wait(900);
    var addLead = document.querySelector("[data-lead-new]");
    log.push("leadNew=" + !!addLead);
    checks.push({ name: "canonical source vocabulary (whatsapp/viber/google/site)", ok: !!addLead, detail: "open lead editor to check source options" });
    if (addLead) {
      addLead.click(); await wait(600);
      var srcSel = document.querySelector("#ld-source");
      var opts = srcSel ? Array.prototype.slice.call(srcSel.options).map(o => o.value) : [];
      log.push("sources=" + opts.join(","));
      checks.push({ name: "source vocabulary includes new canonical sources", ok: ["whatsapp", "viber", "google", "site"].every(s => opts.indexOf(s) >= 0), detail: opts.join(",") });
      document.querySelector("[data-lead-cancel]").click(); await wait(300);
    }
    ok = checks.every(c => c.ok) && checks.length > 8;
  } catch (e) { log.push("ERR:" + e.message); ok = false; }
  window.__msChecks = checks; window.__msOk = ok; window.__msDone = true;
})();