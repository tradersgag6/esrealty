(async function () {
  var log = [], checks = [], ok;
  window.__msLog = log; window.confirm = () => true; window.__snap="";
  var __op = window.print; window.print = function(){ window.__snap=(document.querySelector("#print-root")||{}).innerHTML||""; };
  setTimeout(function(){ log.push("WD"); window.__msDone = true; }, 45000);
  var wait = ms => new Promise(r => setTimeout(r, ms));
  var setv = (s, v) => { var e = document.querySelector(s); if (e) { e.value = v; e.dispatchEvent(new Event("input", { bubbles: true })); } return !!e; };
  try {
    var C = window.ESREALTY.core;
    // Engine: GRM + DCF
    var eng = { comparables: [], adjustments: [], cost: {}, income: { useIncome: true, gpi: 600000, vacancyPct: 5, opexPct: 25, capRate: 7, grm: 12, useDcf: true, dcfYears: 5, noiGrowthPct: 4, discountRate: 9, exitCapPct: 6.5 } };
    var raw = { property: { lotArea: 100 } };
    var r2 = C.appraisalCompute(eng, raw);
    checks.push({name:"direct cap", ok: Math.round(r2.income.indicated) === 6107143, detail:String(r2.income.indicated)});
    checks.push({name:"grm indicated", ok: Math.round(r2.income.grmIndicated) === 7200000, detail:String(r2.income.grmIndicated)});
    checks.push({name:"dcf computed", ok: !!(r2.income.dcf && r2.income.dcf.indicated > 7000000 && r2.income.dcf.indicated < 9000000), detail:String(r2.income.dcf && Math.round(r2.income.dcf.indicated))});
    // UI flow
    localStorage.removeItem("esrealty_v1"); localStorage.removeItem("esrealty_user");
    document.querySelector("#auth-role").value="super-admin";
    document.querySelector("#auth-test").click(); await wait(500);
    document.querySelector('[data-view="appraisal"]').click(); await wait(700);
    document.querySelector("#ap-reset").click(); await wait(300);
    setv("#ap-name","E2E B3"); await wait(200);
    // comps tab QC
    document.querySelector('[data-atab="comps"]').click(); await wait(500);
    var html=document.querySelector("#content").innerHTML;
    checks.push({name:"verify select", ok:/data-c="verify"/.test(html), detail:""});
    checks.push({name:"srcUrl field", ok:/data-c="srcUrl"/.test(html), detail:""});
    checks.push({name:"verified badge on sample", ok:/Registry\/Deed verified/.test(html), detail:""});
    // income tab
    document.querySelector('[data-atab="approaches"]').click(); await wait(500);
    var incUse=document.querySelector("#api-use");
    if(incUse && !incUse.checked){ incUse.click(); await wait(400); }
    setv("#api-gpi","600000"); setv("#api-cap","7"); setv("#api-grm","12");
    var dc=document.querySelector("#api-dcfuse"); if(dc && !dc.checked){ dc.click(); await wait(400);} 
    if(dc){ setv("#api-dcfyrs","5"); setv("#api-g","4"); setv("#api-dr","9"); setv("#api-exit","6.5"); }
    await wait(400);
    html=document.querySelector("#content").innerHTML;
    checks.push({name:"grm row ui", ok:/Gross Rent Multiplier/.test(html), detail:""});
    checks.push({name:"dcf rows ui", ok:/DCF indicated value/.test(html), detail:(html.match(/DCF indicated value[^<]*<[\s\S]{0,80}/)||["none"])[0].replace(/<[^>]+>/g," ").slice(0,70)});
    // reconcile matrix + rounding
    document.querySelector('[data-atab="reconcile"]').click(); await wait(500);
    html=document.querySelector("#content").innerHTML;
    checks.push({name:"applicability matrix", ok:/Approach Applicability/.test(html)&&/Primary/.test(html), detail:""});
    checks.push({name:"round btn", ok:!!document.querySelector("#ap-round10k"), detail:""});
    setv("#ap-final","12345678");
    document.querySelector("#ap-round10k").click(); await wait(500);
    var fv=C.num((document.querySelector("#ap-final")||{}).value,0);
    checks.push({name:"rounded to 10k", ok: fv===12350000 || fv===12340000, detail:String(fv)});
    ok = checks.every(c=>c.ok)&&checks.length>0;
  } catch(e){ log.push("ERR:"+e.message); ok=false; }
  window.__msChecks=checks; window.__msOk=ok; window.__msDone=true;
})();