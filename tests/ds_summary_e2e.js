(async function () {
  var log = [], checks = [], ok;
  window.__msLog = log; window.confirm = () => true;
  setTimeout(function(){ log.push("WD"); window.__msDone = true; }, 90000);
  var wait = ms => new Promise(r => setTimeout(r, ms));
  function chk(n, o, d) { checks.push({ name: n, ok: !!o, detail: d || "" }); }
  try {
    localStorage.removeItem("esrealty_v1"); localStorage.removeItem("esrealty_user");
    document.querySelector("#auth-role").value = "super-admin";
    document.querySelector("#auth-test").click(); await wait(1300);
    var openRow = document.querySelector("[data-open-deal]");
    chk("recent-deal-row", !!openRow, openRow ? (openRow.textContent || "").trim().slice(0, 40) : "none");
    if (openRow) openRow.click();
    await wait(1100);
    chk("deal-view-loads", !!document.querySelector(".value-hero"), "value-hero rendered (model+recommend ran)");
    window.print = function () { window.__printed = true; };
    var prev = document.querySelector("#ds-preview");
    chk("ds-preview-btn", !!prev, "print button present");
    if (prev) prev.click();
    await wait(400);
    var html = (document.querySelector("#print-root") || { innerHTML: "" }).innerHTML;
    window.__summary = html.length;
    chk("print-populated", html.length > 500, "len=" + html.length);
    var sections = ["Property &amp; Existing Structure", "Location &amp; Site", "Acquisition &amp; Financing", "Development Plan", "Development Budget", "Sales &amp; Disposition", "Key Metrics", "Location &amp; Risk Register", "Recommendation", "Comparables"];
    var missing = sections.filter(s => html.indexOf("<h2>" + s + "</h2>") < 0);
    chk("all-sections", missing.length === 0, "missing=" + missing.join(","));
    chk("no-undefined", html.indexOf("undefined") < 0 && html.indexOf("NaN") < 0, "");
    chk("property-data", /Zoning/.test(html) && /Title/.test(html) && /Improvement Value/.test(html), "");
    chk("location-data", /Nearby Establishments/.test(html) && /Accessibility Score/.test(html), "");
    chk("acqu-data", /Negotiated Price/.test(html) && /Loan Shortfall/.test(html) && /Total Interest/.test(html), "");
    chk("plan-data", /Development Goal/.test(html) && /Construction Cost/.test(html) && /Carrying Cost/.test(html), "");
    chk("sales-data", /Exit Target/.test(html) && /Holding Period/.test(html) && /Capital Gains Tax/.test(html), "");
    chk("metrics-data", /Cash-on-Cash/.test(html) && /Profit Margin/.test(html) && /Payback/.test(html), "");
    chk("risk-register", /Mitigation/.test(html) && /Basis/.test(html) && /Earthquake/.test(html), "");
    chk("reco-content", /Highest/.test(html) && /best use/.test(html), "");
    chk("comps-data", html.indexOf("Brgy. San Juan") >= 0 || /Comparables/.test(html), "");
    chk("design-shell", html.indexOf('class="ds-wrap') >= 0 && html.indexOf('class="ds-head"') >= 0 && html.indexOf('class="ds-kpis"') >= 0, "");
    chk("design-kv-cos", html.indexOf("ds-kv") >= 0 && html.indexOf("ds-cos") >= 0, "");
    chk("design-kpi-colors", html.indexOf("--t:#EA580C") >= 0 && html.indexOf("--t:#2563EB") >= 0 && html.indexOf("--t:#0F9D58") >= 0 && html.indexOf("--t:#F59E0B") >= 0, "");
    chk("design-grade", html.indexOf('class="ds-grade"') >= 0, "");
    chk("design-total-row", html.indexOf('class="ds-total"') >= 0, "");
    chk("design-risk-levels", html.indexOf("lv-hi") >= 0 || html.indexOf("lv-med") >= 0 || html.indexOf("lv-lo") >= 0, "");
    chk("design-reco-box", html.indexOf('class="ds-reco"') >= 0 && html.indexOf("hbu") >= 0, "");
    window.__msLog.push("summaryLen=" + html.length + " printed=" + !!window.__printed + " sections=" + sections.length);
    ok = checks.every(c => c.ok) && checks.length > 0;
  } catch (e) { log.push("ERR:" + e.message); ok = false; }
  window.__msChecks = checks; window.__msOk = ok; window.__msDone = true;
})();