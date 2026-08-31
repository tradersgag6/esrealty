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
    var html = document.querySelector("#content").textContent;
    check("overview KPI grid renders", document.querySelectorAll(".kpi").length >= 12, document.querySelectorAll(".kpi").length + " cards");
    var kvals = Array.prototype.map.call(document.querySelectorAll(".kpi"), function (k) {
      var label = k.querySelector(".k-label");
      var value = k.querySelector(".k-value");
      return (label ? label.textContent.trim() : "") + " = " + (value ? value.textContent.trim() : "");
    });
    var card = function (label) {
      var hit = kvals.filter(function (x) { return x.indexOf(label + " =") === 0; })[0] || "";
      return hit.slice(label.length + 3);
    };
    check("cash balance card is posted amount", card("Cash Balance") === "\u20B12,500,000", card("Cash Balance"));
    check("receivables card shows pending schedules", card("Receivables") === "\u20B1190,000", card("Receivables"));
    check("projected revenue card from booked contracts", card("Projected Revenue") === "\u20B118,150,000", card("Projected Revenue"));
    check("payables card zeros with no construction", card("Payables") === "\u20B10", card("Payables"));
    check("construction forecast zero with no projects", card("Construction Forecast") === "\u20B10", card("Construction Forecast"));
    check("construction committed zero with no projects", card("Construction Cost") === "\u20B10", card("Construction Cost"));
    check("portfolio value labelled projected", /Projected market value/.test(html), "projected");
    check("cash balance labelled posted/actual", /Posted, actual cash/.test(html), "posted");
    check("cash in/out labelled actual", /Actual · net/.test(html), "actual");
    check("net worth labelled projected", /Projected value - actual debt/.test(html), "projected");
    check("projected revenue clearly marked projected", /Projected · booked presell contracts/.test(html), "proj");
    check("payables qualified as committed", /Committed - paid construction/.test(html), "committed");
    check("forecast qualified as forecast", /Forecast incl\./.test(html), "forecast");
    check("cash overview table renders", /Cash Overview/.test(html) && /Cash on Hand/.test(html), "table");
    check("receivables and due card renders", /Receivables & Due Schedule/.test(html) && /Due soon/.test(html), "card");
    check("due schedule lists upcoming equity payments", /Equity 2 of 24/.test(html), "sched");
    check("no overdue notices on fresh seed", !/overdue payment\(s\)/.test(html), "clean");
    check("payables and debt card renders", /Payables & Debt/.test(html) && /Invested capital/.test(html), "card");
    check("empty-state guard keeps overview usable", /Rollup unavailable|Construction Summary/.test(html), "guard");
    check("no horizontal scroll", document.documentElement.scrollWidth <= window.innerWidth + 2, "sw=" + document.documentElement.scrollWidth + " vw=" + window.innerWidth);
  } catch (e) {
    window.__msErr = String(e && e.stack || e);
  }
  window.__msChecks = checks;
  window.__msOk = !window.__msErr && checks.length > 0 && checks.every(function (c) { return c.ok; });
  window.__msDone = true;
})();