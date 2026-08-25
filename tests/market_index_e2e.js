(async function () {
  var log = [], checks = [], ok;
  var C = window.ESREALTY.core;
  window.__msLog = log; window.confirm = () => true;
  setTimeout(function(){ log.push("WD"); window.__msDone = true; }, 60000);
  var wait = ms => new Promise(r => setTimeout(r, ms));
  try {
    // Core unit: monthly pct from synthetic index rows
    var rows = [
      {d:"2026-02-25", c:"Manila", p:90000, n:9},
      {d:"2026-03-25", c:"Manila", p:93000, n:11},
      {d:"2026-05-25", c:"Manila", p:97000, n:12},
      {d:"2026-08-25", c:"Cebu City", p:85000, n:5}
    ];
    var m = C.marketIndexMonthlyPct(rows, "Manila");
    checks.push({name:"index pct ~2%/mo over 6mo", ok: m && Math.abs(m.pctPerMonth - 1.26) < 0.15 && m.months === 6, detail: m ? m.pctPerMonth.toFixed(2)+"%/mo, "+m.months+"mo" : "null"});
    checks.push({name:"single point -> null", ok: C.marketIndexMonthlyPct(rows, "Cebu City") === null || false, detail:""});
    // suggest uses index when passed
    var raw = { property:{ city:"Manila", lotArea:200, growthRate:0.07 } };
    var comp = { city:"Makati", lotArea:200, saleDate:"2026-02-01" };
    var sug = C.appraisalSuggestAdjustments(raw, comp, "2026-08-25", 0, m.pctPerMonth);
    checks.push({name:"time adj cites Index", ok:/Market Price Index/.test(sug["Market Conditions (Time)"].basis), detail:sug["Market Conditions (Time)"].basis.slice(0,90)});
    var sug2 = C.appraisalSuggestAdjustments(raw, comp, "2026-08-25", 0, 0);
    checks.push({name:"fallback to growthRate", ok:/assumed appreciation/.test(sug2["Market Conditions (Time)"].basis), detail:""});
    // UI flow
    localStorage.removeItem("esrealty_v1"); localStorage.removeItem("esrealty_user");
    document.querySelector("#auth-role").value="super-admin";
    document.querySelector("#auth-test").click(); await wait(500);
    document.querySelector('[data-view="market"]').click(); await wait(400);
    for(var i=0;i<10;i++){ await wait(300); if(document.querySelector("#ms-idx-city")) break; }
    html=document.querySelector("#content").innerHTML;
    checks.push({name:"index card renders", ok:/City Price Index/.test(html), detail:""});
    checks.push({name:"city dropdown has data", ok:(document.querySelectorAll("#ms-idx-city option").length>=3), detail:String(document.querySelectorAll("#ms-idx-city option").length)});
    checks.push({name:"latest median shown", ok:/Latest median/.test(html)&&/\/sqm/.test(html), detail:(html.match(/Latest median[\s\S]{0,120}/)||["?"])[0].replace(/<[^>]+>/g," ").slice(0,60)});
    checks.push({name:"snapshot date shown", ok:/updated 2026-/.test(html), detail:(html.match(/updated [\d-]+/)||["?"])[0]});
    ok = checks.every(c=>c.ok)&&checks.length>0;
  } catch(e){ log.push("ERR:"+e.message); ok=false; }
  window.__msChecks=checks; window.__msOk=ok; window.__msDone=true;
})();