(async function () {
  var log = [], checks = [], ok;
  window.__msLog = log; window.confirm = () => true; window.__snap=""; var __origPrint = window.print; window.print = function(){ window.__snap = (document.querySelector("#print-root")||{}).innerHTML || ""; };
  setTimeout(function(){ log.push("WD"); window.__msDone = true; }, 40000);
  var wait = ms => new Promise(r => setTimeout(r, ms));
  var setv = (s, v) => { var e = document.querySelector(s); if (e) { e.value = v; e.dispatchEvent(new Event("input", { bubbles: true })); } return !!e; };
  try {
    var C = window.ESREALTY.core, D = window.ESREALTY.data;
    // Engine checks
    checks.push({name:"RCN 2026 CHB=25k", ok: D.CONSTRUCTION_COST["CHB / Masonry"] === 25000, detail:String(D.CONSTRUCTION_COST["CHB / Masonry"])});
    var ds = C.depreciationSuggest(10, 50, "Average");
    checks.push({name:"dep suggest 10/50 avg=20", ok: Math.round(ds*10)/10 === 20, detail:String(ds)});
    var ds2 = C.depreciationSuggest(10, 50, "Good");
    checks.push({name:"dep good factor .85", ok: Math.round(ds2) === 17, detail:String(ds2)});
    var ds3 = C.depreciationSuggest(80, 30, "Dilapidated");
    checks.push({name:"dep capped 90", ok: ds3 === 90, detail:String(ds3)});
    // UI flow
    localStorage.removeItem("esrealty_v1"); localStorage.removeItem("esrealty_user");
    document.querySelector("#auth-role").value = "super-admin";
    document.querySelector("#auth-test").click(); await wait(500);
    document.querySelector('[data-view="appraisal"]').click(); await wait(700); log.push("nav");
    document.querySelector("#ap-reset").click(); await wait(300);
    setv("#ap-name","E2E B2"); await wait(200);
    // Setup compliance fields
    checks.push({name:"premise select", ok:!!document.querySelector("#ap-premise"), detail:""});
    checks.push({name:"insp date", ok:!!document.querySelector("#ap-inspdate"), detail:""});
    checks.push({name:"exposure", ok:!!document.querySelector("#ap-exposure"), detail:""});
    setv("#ap-exposure","90-120 days");
    // Approaches tab
    document.querySelector('[data-atab="approaches"]').click(); await wait(600); log.push("approaches");
    checks.push({name:"soft input", ok:!!document.querySelector("#apc-soft"), detail:""});
    checks.push({name:"site input", ok:!!document.querySelector("#apc-site"), detail:""});
    checks.push({name:"age/el inputs", ok:!!document.querySelector("#apc-age")&&!!document.querySelector("#apc-el"), detail:""});
    // Dep suggest button
    setv("#apc-age","10"); setv("#apc-el","50");
    var cond=document.querySelector("#apc-cond"); if(cond){cond.value="Average"; cond.dispatchEvent(new Event("change",{bubbles:true}));}
    document.querySelector("#apc-depsuggest").click(); await wait(400);
    var depP=C.num((document.querySelector("#apc-depP")||{}).value,0);
    checks.push({name:"suggest fills depP=20", ok: depP===20, detail:String(depP)});
    // Cost math with bldg area
    setv("#apc-bldg","100"); setv("#apc-rcn","25000"); setv("#apc-soft","10"); setv("#apc-site","50000"); setv("#apc-inc","0"); setv("#apc-depE","0"); setv("#apc-depF","0");
    await wait(500);
    var html=document.querySelector("#content").innerHTML;
    var mSoft=html.match(/Soft costs[\s\S]{0,120}?<b>(?:₱)?([\d,\.]+)/);
    checks.push({name:"soft=250k shown", ok: !!(mSoft && mSoft[1]==="250,000"), detail:mSoft?mSoft[1]:"none"});
    // Reconcile + report
    document.querySelector('[data-atab="reconcile"]').click(); await wait(500);
    document.querySelector('[data-atab="report"]').click(); await wait(500);
    var pv=document.querySelector("#ap-preview"); if(pv) pv.click(); await wait(800); log.push("preview");
    html=window.__snap || (document.querySelector("#print-root")||{}).innerHTML;
    checks.push({name:"report premise row", ok:/Premise of Value/.test(html), detail:""});
    checks.push({name:"report inspection row", ok:/Date of Inspection/.test(html), detail:""});
    checks.push({name:"report exposure row", ok:/Exposure \/ Marketing Period/.test(html), detail:""});
    checks.push({name:"report soft costs row", ok:/Soft Costs \(permits/.test(html), detail:""});
    checks.push({name:"report EA/EL note", ok:/EA\/EL method/.test(html), detail:(html.match(/EA\/EL[^<)]{0,60}/)||["none"])[0].slice(0,70)});
    ok = checks.every(c=>c.ok)&&checks.length>0;
  } catch(e){ log.push("ERR:"+e.message); ok=false; }
  window.__msChecks = checks; window.__msOk = ok; window.__msDone = true;
})();