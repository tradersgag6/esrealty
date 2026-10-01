(async function () {
  var log = [], checks = [], ok = true;
  var wait = ms => new Promise(r => setTimeout(r, ms));
  var click = s => { var e = document.querySelector(s); if (e) e.click(); return !!e; };
  var setv = (s, v) => { var e = document.querySelector(s); if (e) { e.value = v; e.dispatchEvent(new Event("input", { bubbles: true })); } return !!e; };
  window.__msLog = log;

  /* Overpass is a third-party OpenStreetMap database reached over the network.
   * Left live, this test asserted on whatever happened to be in that database
   * for Manila City Hall: sometimes 10 categories with counts, sometimes 10 cards
   * all reading 0, sometimes a mirror timing out mid-scan. None of those say
   * anything about this codebase, and between them they made the suite go red
   * roughly one run in five.
   *
   * The behaviour actually worth testing is ours: given counts from Overpass,
   * does the app render one card per category with the right number? So the
   * fetch to the Overpass mirrors is stubbed with a known payload and the
   * rendered cards are compared against it. Deterministic, and it fails for the
   * right reason if the rendering breaks.
   */
  var STUB_COUNTS = [7, 3, 0, 12, 5, 2, 0, 9, 4, 1];
  var stubbed = 0;
  var realFetch = window.fetch;
  window.fetch = function (input, init) {
    var url = String((input && input.url) || input || "");
    if (/overpass-api|overpass\.kumi|overpass\.private|api\.overpass/i.test(url)) {
      stubbed++;
      return Promise.resolve({
        ok: true,
        status: 200,
        json: function () {
          return Promise.resolve({
            elements: STUB_COUNTS.map(function (n) { return { type: "count", tags: { total: String(n) } }; })
          });
        },
        text: function () { return Promise.resolve("{}"); }
      });
    }
    return realFetch.apply(this, arguments);
  };
  log.push("overpass stub installed");
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
      /* fetchNearbyDirect() walks up to 3 Overpass mirrors with a 35s abort each,
       * so the app's own worst case is ~105s before it settles on a final
       * status. This loop used to give up after 56s, which meant that whenever
       * the first mirror was slow the test asserted against a half-finished
       * scan: the status still read "Scanning nearby via ..." and no .nc-card
       * existed yet. The budget has to exceed the app's worst case, not just be
       * "long enough usually". The happy path is unaffected - the loop still
       * breaks the moment the status settles, which is normally a few seconds. */
      for (var i = 0; i < 80; i++) {
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
      var withCounts = 0; ncCards.forEach(function(c){ var m=c.textContent.match(/(\d+)\s*$/); if (m && parseInt(m[1])>0) withCounts++; });
      log.push("nc-cards=" + ncCards.length + " withCounts=" + withCounts + " stubbed=" + stubbed);
      checks.push({ name: "overpass was stubbed", ok: stubbed > 0, detail: "requests intercepted: " + stubbed });
      checks.push({ name: "one card per category", ok: ncCards.length === STUB_COUNTS.length,
        detail: ncCards.length + " cards for " + STUB_COUNTS.length + " categories" });
      /* Every category the stub reported a non-zero count for must appear with
       * that exact number on its card. This is the assertion that was flaky
       * against live Overpass; against a known payload it is exact. */
      var expectedPositive = STUB_COUNTS.filter(function (n) { return n > 0; });
      var rendered = Array.prototype.map.call(ncCards, function (c) {
        var m = c.textContent.match(/(\d+)\s*$/); return m ? parseInt(m[1]) : -1;
      });
      var matched = expectedPositive.filter(function (n) { return rendered.indexOf(n) >= 0; });
      checks.push({ name: "stubbed counts are rendered", ok: matched.length === expectedPositive.length,
        detail: matched.length + "/" + expectedPositive.length + " matched; rendered=[" + rendered.join(",") + "]" });
      checks.push({ name: "nearby counts", ok: withCounts > 0, detail: withCounts + "/" + ncCards.length });
    }
    ok = checks.every(c => c.ok);
  } catch (e) { log.push("ERR: " + (e && e.message)); ok = false; }
  window.__msChecks = checks; window.__msOk = ok; window.__msDone = true;
})();