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
    document.querySelector('[data-view="leads"]').click(); await wait(1200);
    check1: {
      log.push("cards=" + document.querySelectorAll("[data-lead-open]").length);
      checks.push({ name: "leads board renders", ok: document.querySelectorAll("[data-lead-open]").length >= 3, detail: "cards=" + document.querySelectorAll("[data-lead-open]").length });
    }
    checks.push({ name: "run-agent header button present", ok: has("[data-lead-agent-all]"), detail: "yes" });
    var cards = Array.prototype.slice.call(document.querySelectorAll("[data-lead-open]"));
    var nina = cards.find(c => c.textContent.indexOf("Nina Reyes") >= 0);
    check2: {
      log.push("nina found=" + !!nina);
      if (!nina) { checks.push({ name: "stale-new seed lead exists", ok: false, detail: "Nina Reyes card missing" }); }
      else {
        nina.click(); await wait(1000);
        checks.push({ name: "agent section in detail", ok: has("#agent-steps") && has("[data-agent-run]"), detail: "steps + run button" });
        document.querySelector("[data-agent-run]").click(); await wait(900);
        var stepsTxt = txt("#agent-steps");
        log.push("stepsTxt=" + stepsTxt.slice(0, 160).replace(/\s+/g, " "));
        checks.push({ name: "run now produces observation + suggestion", ok: /Observed/.test(stepsTxt) && /Suggestion/.test(stepsTxt) && has("[data-agent-approve]"), detail: "obs + sugg + approve btn" });
        checks.push({ name: "agent meta chips show recheck", ok: /recheck/i.test(document.querySelector('#content').textContent), detail: "view level" });
        var approve = document.querySelector("[data-agent-approve]");
        approve.click(); await wait(800);
        var afterApprove = document.querySelector("#content").textContent;
        log.push("afterApprove has Approved=" + /Approved/.test(afterApprove) + " evidenceObserved=" + /Evidence Ledger[\s\S]{0,600}Observed/.test(afterApprove));
        checks.push({ name: "approve settles suggestion + writes observed evidence", ok: /Approved/.test(afterApprove) && /Evidence Ledger/.test(afterApprove) && /Observed/.test(afterApprove), detail: "approved + ledger observed" });
        document.querySelector("[data-agent-run]").click(); await wait(900);
        var reject = document.querySelector("[data-agent-reject]");
        checks.push({ name: "second run appends fresh step to reject", ok: !!reject, detail: reject ? "reject btn present" : "missing" });
        if (reject) { reject.click(); await wait(700); checks.push({ name: "reject records rejected", ok: /Rejected/.test(document.querySelector("#content").textContent), detail: "rejected" }); }
        document.querySelector("[data-lead-back]").click(); await wait(900);
        var cards2 = Array.prototype.slice.call(document.querySelectorAll("[data-lead-open]"));
        var nina2 = cards2.find(c => c.textContent.indexOf("Nina Reyes") >= 0);
        log.push("card agent chip=" + (nina2 ? /agent \d/.test(nina2.textContent) : "no-card"));
        checks.push({ name: "card shows agent recheck chip", ok: !!nina2 && nina2.textContent.indexOf("agent") >= 0, detail: nina2 ? nina2.textContent.match(/agent[^L]{0,14}/) && "chip" : "missing" });
      }
    }
    ok = checks.every(c => c.ok) && checks.length > 8;
  } catch (e) { log.push("ERR:" + e.message); ok = false; }
  window.__msChecks = checks; window.__msOk = ok; window.__msDone = true;
})();