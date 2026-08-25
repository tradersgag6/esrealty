(async function () {
  var log = [], checks = [], ok;
  window.__msLog = log; window.confirm = () => true; window.__snap="";
  var __op = window.print; window.print = function(){ window.__snap=(document.querySelector("#print-root")||{}).innerHTML||""; };
  setTimeout(function(){ log.push("WD"); window.__msDone = true; }, 45000);
  var wait = ms => new Promise(r => setTimeout(r, ms));
  var setv = (s, v) => { var e = document.querySelector(s); if (e) { e.value = v; e.dispatchEvent(new Event("input", { bubbles: true })); } return !!e; };
  try {
    var C = window.ESREALTY.core;
    // Engine: benchmark override + insurance uplift
    var eng = { purpose:"Insurance", comparables:[], adjustments:[], cost:{ rcnPerSqm:25000, bldgArea:100, softCostsPct:0, insuranceUpliftPct:10 }, income:{useIncome:false} };
    var raw = { property:{ lotArea:100, city:"Imus" } };
    var r2 = C.appraisalCompute(eng, raw);
    checks.push({name:"insurance uplift=250k", ok: r2.cost.insuranceUplift === 250000, detail:String(r2.cost.insuranceUplift)});
    var sug = C.appraisalSuggestAdjustments(raw, {city:"Bacoor", lotArea:200}, "2026-08-01", 50000);
    checks.push({name:"override basis text", ok:/OVERRIDE/.test(sug["Location"].basis), detail:sug["Location"].basis.slice(0,80)});
    // UI
    localStorage.removeItem("esrealty_v1"); localStorage.removeItem("esrealty_user");
    document.querySelector("#auth-role").value="super-admin";
    document.querySelector("#auth-test").click(); await wait(500);
    document.querySelector('[data-view="appraisal"]').click(); await wait(700);
    document.querySelector("#ap-reset").click(); await wait(300);
    setv("#ap-name","E2E B4"); await wait(200);
    checks.push({name:"bench override input", ok:!!document.querySelector("#ap-bench"), detail:""});
    checks.push({name:"fvlevel select", ok:!!document.querySelector("#ap-fvlevel"), detail:""});
    setv("#ap-bench","42000"); setv("#ap-benchsrc","Colliers Q2-2026");
    // Financial reporting + level for disclosure test
    var purp=document.querySelector("#ap-purpose"); if(purp){purp.value="Financial Reporting"; purp.dispatchEvent(new Event("input",{bubbles:true}));}
    var fvl=document.querySelector("#ap-fvlevel"); if(fvl){fvl.value="Level 3"; fvl.dispatchEvent(new Event("change",{bubbles:true}));}
    await wait(300);
    // print with cover + pfrs + appendix (no photos -> no appendix section)
    document.querySelector('[data-atab="report"]').click(); await wait(400);
    var pv=document.querySelector("#ap-preview"); if(pv) pv.click(); await wait(800);
    html=window.__snap;
    checks.push({name:"cover page", ok:/BANK VALUATION REPORT/.test(html), detail:""});
    checks.push({name:"cover page-break", ok:/page-break-after/.test(html), detail:""});
    checks.push({name:"pfrs meta row", ok:/PFRS 13 FV Hierarchy/.test(html)&&/Level 3/.test(html), detail:""});
    checks.push({name:"pfrs disclosure", ok:/PFRS 13 Disclosure/.test(html)&&/significant unobservable inputs/.test(html), detail:""});
    ok = checks.every(c=>c.ok)&&checks.length>0;
  } catch(e){ log.push("ERR:"+e.message); ok=false; }
  window.__msChecks=checks; window.__msOk=ok; window.__msDone=true;
})();