(async function () {
  var log = [], checks = [], ok;
  window.__msLog = log; window.confirm = () => true;
  setTimeout(function(){ log.push("WD"); window.__msDone = true; }, 90000);
  var wait = ms => new Promise(r => setTimeout(r, ms));
  function setFz(id, v){
    var el = document.getElementById(id);
    if (!el) return false;
    el.value = v;
    el.dispatchEvent(new Event("input", { bubbles: true }));
    return true;
  }
  function fzTxt(id){ var el = document.getElementById(id); return el ? el.textContent : ""; }
  try {
    localStorage.removeItem("esrealty_v1"); localStorage.removeItem("esrealty_user");
    document.querySelector("#auth-role").value = "super-admin";
    document.querySelector("#auth-test").click(); await wait(600);
    var opener = document.querySelector("[data-open-deal]");
    if (!opener) { document.querySelector('[data-view="dashboard"]').click(); await wait(900); opener = document.querySelector("[data-open-deal]"); }
    checks.push({ name: "deal exists in dashboard", ok: !!opener, detail: opener ? "row found" : "no open-deal row" });
    if (opener) { opener.click(); await wait(1200); }
    log.push("view=" + (document.querySelector('[data-dtab="overview"]') ? "deal" : "other"));
    checks.push({ name: "deal view rendered", ok: !!document.querySelector('[data-dtab="overview"]'), detail: document.querySelector('[data-dtab="overview"]') ? "yes" : "missing" });
    var tabBtn = document.querySelector('[data-dtab="feasibility"]');
    checks.push({ name: "feasibility tab present", ok: !!tabBtn, detail: tabBtn ? "yes" : "missing" });
    tabBtn.click(); await wait(900);
    var unitsEl = document.getElementById("fz-units");
    checks.push({ name: "feasibility studio renders", ok: !!unitsEl, detail: unitsEl ? "units node present" : "missing" });

    /* Stage 1 — site math: lot 50 m, side setback 2 m, unit width 8 m -> 5 units */
    setFz("fz-lotW", 50); await wait(120);
    setFz("fz-setS", 2); await wait(120);
    setFz("fz-uw", 8); await wait(200);
    var u = parseInt(fzTxt("fz-units"), 10);
    log.push("units=" + u + " floor=" + fzTxt("fz-floorarea"));
    checks.push({ name: "Stage-1 math 50/2/8 -> 5 units", ok: u === 5, detail: "units=" + u });
    checks.push({ name: "floor area = 5 x 8 x 15 = 600", ok: /600/.test(fzTxt("fz-floorarea")), detail: fzTxt("fz-floorarea") });

    /* Stage 2 — price 2.4M x 5 units -> 12M gross, chained from Stage 1 */
    setFz("fz-unitPrice", 2400000); await wait(250);
    var gross = fzTxt("fz-gross");
    log.push("gross=" + gross);
    checks.push({ name: "gross revenue = unit price x units", ok: /12,000,000/.test(gross), detail: gross });

    /* live update without full re-render: units unchanged after price edit */
    checks.push({ name: "live KPI update keeps units", ok: parseInt(fzTxt("fz-units"), 10) === 5, detail: "units=" + fzTxt("fz-units") });

    /* Stage 3 — push to pre-selling seeds inventory */
    checks.push({ name: "push-to-presell button present", ok: !!document.getElementById("fz-push"), detail: "yes" });

    /* Negative margin -> red verdict */
    setFz("fz-const", 80000); await wait(250);
    var v = document.getElementById("fz-verdict");
    var vt = v ? v.textContent : "";
    var vc = v ? v.className : "";
    log.push("verdict=" + vt + " class=" + vc);
    checks.push({ name: "negative margin flags red verdict", ok: !!v && /negative/i.test(vt) && vc.indexOf("red") !== -1, detail: vt });

    /* Push to Pre-Selling writes projects + unit rows and navigates */
    var saved0 = JSON.parse(localStorage.getItem("esrealty_v1") || "{}");
    var pps0 = (saved0.presellProjects || []).length, psu0 = (saved0.presellUnits || []).length;
    document.getElementById("fz-push").click(); await wait(1800);
    var saved1 = JSON.parse(localStorage.getItem("esrealty_v1") || "{}");
    var pps1 = (saved1.presellProjects || []).length, psu1 = (saved1.presellUnits || []).length;
    var presellTxt = document.querySelector("#content").textContent;
    log.push("pps " + pps0 + "->" + pps1 + " psu " + psu0 + "->" + psu1 + " onPresell=" + /pre-selling/i.test(presellTxt));
    checks.push({ name: "push builds project + 5 units and lands on Pre-Selling", ok: pps1 === pps0 + 1 && psu1 === psu0 + 5 && /pre-selling/i.test(presellTxt), detail: "projects " + pps0 + "->" + pps1 + " units " + psu0 + "->" + psu1 });

    ok = checks.every(c => c.ok) && checks.length > 0;
  } catch (e) { log.push("ERR:" + e.message); ok = false; }
  window.__msChecks = checks; window.__msOk = ok; window.__msDone = true;
})();