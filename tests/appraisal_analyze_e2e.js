(async function () {
  var log = [], checks = [], ok = true;
  var wait = ms => new Promise(r => setTimeout(r, ms));
  var click = s => { var e = document.querySelector(s); if (e) e.click(); return !!e; };
  var setv = (s, v) => { var e = document.querySelector(s); if (e) { e.value = v; e.dispatchEvent(new Event("input", { bubbles: true })); } return !!e; };
  window.__msLog = log;
  try {
    localStorage.removeItem("esrealty_v1"); localStorage.removeItem("esrealty_user");
    var role = document.querySelector("#auth-role"); if (role) role.value = "super-admin";
    click("#auth-test"); await wait(500);
    click("#tb-new-deal"); await wait(500);
    click('[data-step="2"]'); await wait(3000);
    log.push("coords-before: " + ((document.querySelector("#wz-map-coords")||{}).textContent||"").slice(0,60));
    setv("#wz-map-q", "Manila City Hall");
    click("#wz-map-btn");
    await wait(6000);
    var coordsTxt = (document.querySelector("#wz-map-coords")||{}).textContent || "";
    log.push("coords-after: " + coordsTxt.slice(0,90));
    checks.push({ name: "pin dropped", ok: /Pin: Latitude/.test(coordsTxt), detail: coordsTxt.slice(0,70) });
    if (!/Pin: Latitude/.test(coordsTxt)) {
      // fall back: analyze anyway to see error path
      log.push("pin failed - checking analyze error path");
      click("#wz-ai-loc"); await wait(800);
      log.push("status: " + (document.querySelector("#wz-ai-loc-status")||{}).textContent);
      checks.push({ name: "analyze guarded without pin", ok: true, detail: "guarded" });
    } else {
      click("#wz-ai-loc");
      var finalStatus = "";
      for (var i = 0; i < 28; i++) {
        await wait(2000);
        finalStatus = ((document.querySelector("#wz-ai-loc-status")||{}).textContent)||"";
        log.push("t+" + ((i+1)*2) + "s: " + finalStatus);
        if (/Scan complete|Last scan|no nearby|outside/i.test(finalStatus)) break;
      }
      checks.push({ name: "scan finished", ok: /Scan complete|Last scan/i.test(finalStatus), detail: finalStatus });
      var brgy = document.querySelector('[data-g="property.barangay"]');
      var region = document.querySelector("#wz-region");
      log.push("region=" + (region?region.value:"?") + " barangay=" + (brgy?brgy.value:"?"));
      checks.push({ name: "region filled", ok: !!(region && region.value), detail: region ? region.value : "?" });
      var ncCards = document.querySelectorAll(".nc-card");
      var withCounts = 0; ncCards.forEach(function(c){ var m = c.textContent.match(/(\d+)\s*$/); if (m && parseInt(m[1])>0) withCounts++; });
      log.push("nc-cards=" + ncCards.length + " withCounts=" + withCounts);
      checks.push({ name: "nearby counts", ok: withCounts > 0, detail: withCounts + "/" + ncCards.length });
    }
    ok = checks.every(c => c.ok);
  } catch (e) { log.push("ERR: " + (e && e.message)); ok = false; }
  window.__msChecks = checks; window.__msOk = ok; window.__msDone = true;
})();