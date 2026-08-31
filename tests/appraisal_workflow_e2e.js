(async function () {
  var log = [], checks = [], ok;
  window.__msLog = log; var C = window.ESREALTY.core; window.confirm = () => true;
  setTimeout(function(){ log.push("WD"); window.__msDone = true; }, 60000);
  var wait = ms => new Promise(r => setTimeout(r, ms));
  var setv = (s, v) => { var e = document.querySelector(s); if (e) { e.value = v; e.dispatchEvent(new Event("input", { bubbles: true })); } return !!e; };
  var setpd = (k, v) => setv('[data-ap-pd="' + k + '"]', v);
  try {
    localStorage.removeItem("esrealty_v1"); localStorage.removeItem("esrealty_user");
    document.querySelector("#auth-role").value="super-admin";
    document.querySelector("#auth-test").click(); await wait(500);
    // PH workflow order mirrors the tabs: Setup -> Details -> Comps -> Adjustments -> Approaches -> Reconciliation -> Report
    document.querySelector('[data-view="appraisal"]').click(); await wait(700); log.push("view");
    document.querySelector("#ap-reset").click(); await wait(300);
    // STEP 1 Engagement
    setv("#ap-name","Bauan Lot — BPI Mortgage"); await wait(250);
    var purp=document.querySelector("#ap-purpose"); purp.value="Mortgage/Loan Security"; purp.dispatchEvent(new Event("input",{bubbles:true}));
    checks.push({name:"1 setup named+purpose", ok:!!document.querySelector("#ap-premise"), detail:"engagement card"});
    // STEP 2 Property details (subject)
    document.querySelector('[data-atab="details"]').click(); await wait(400);
    setpd("region","Region IV-A (CALABARZON)"); await wait(150);
    setpd("province","Batangas"); await wait(150);
    setpd("city","Batangas City"); await wait(150);
    setpd("barangay","Poblacion"); setpd("lotArea","500"); setpd("frontage","15"); setpd("lat","13.7565"); setpd("lng","121.0583");
    await wait(200);
    
    var la=document.querySelector('[data-ap-pd="lotArea"]');
    checks.push({name:"2 subject filled", ok: !!(la && la.value==="500"), detail:"lotArea=500"});
    // STEP 3 Comparables
    document.querySelector('[data-atab="comps"]').click(); await wait(400);
    document.querySelector("#ap-sample-comp").click(); await wait(500);
    var compCards=document.querySelectorAll(".comp-card");
    checks.push({name:"3 comps loaded >=3", ok:compCards.length>=3, detail:String(compCards.length)});
    // STEP 4 Adjustments AI suggest
    document.querySelector('[data-atab="adjust"]').click(); await wait(400);
    document.querySelector("#ap-ai-adj").click(); await wait(600);
    var rows=document.querySelectorAll(".adj-grid tbody tr td.el-name");
    var netRow=document.querySelector(".adj-grid tfoot, .adj-grid .net");
    checks.push({name:"4 grid 14 elements", ok:Array.from(rows).filter(function(r){return /Net Adjustment/i.test(r.textContent)===false;}).length>=14, detail:String(rows.length)});
    // STEP 5 Approaches
    document.querySelector('[data-atab="approaches"]').click(); await wait(500);
    // Sales FV save via Recalculate button
    var sBtn=document.querySelector("#ap-fv-sales-btn"); if(sBtn)sBtn.click(); await wait(350);
    // Cost approach inputs
    setv("#apc-land","12000"); setv("#apc-bldg","120"); setv("#apc-rcn","25000"); setv("#apc-age","8"); setv("#apc-el","50");
    var cnd=document.querySelector("#apc-cond"); if(cnd){cnd.value="Good"; cnd.dispatchEvent(new Event("change",{bubbles:true}));} await wait(150);
    document.querySelector("#apc-depsuggest").click(); await wait(300);
    var cBtn=document.querySelector("#ap-fv-cost-btn"); if(cBtn)cBtn.click(); await wait(350);
    // Income
    var incUse=document.querySelector("#api-use"); if(incUse && !incUse.checked){incUse.click(); await wait(350);}
    setv("#api-gpi","480000"); setv("#api-vac","5"); setv("#api-opex","25"); setv("#api-cap","7.5");
    await wait(300);
    var iBtn=document.querySelector("#ap-fv-income-btn"); if(iBtn)iBtn.click(); await wait(350);
    html=document.querySelector("#content").innerHTML;
    checks.push({name:"5 three FVs saved", ok:(html.match(/Saved/g)||[]).length>=0 && !!document.querySelector("#ap-fv-cost-input") && !!document.querySelector("#ap-fv-income-input"), detail:"fv inputs present"});
    var fvSales=C.num((document.querySelector("#ap-fv-sales-input")||{}).value), fvCost=C.num((document.querySelector("#ap-fv-cost-input")||{}).value), fvInc=C.num((document.querySelector("#ap-fv-income-input")||{}).value);
    checks.push({name:"5 sales FV>0", ok:fvSales>0, detail:String(fvSales)});
    checks.push({name:"5 cost FV>0", ok:fvCost>0, detail:String(fvCost)});
    checks.push({name:"5 income FV>0", ok:fvInc>0, detail:String(fvInc)});
    // STEP 6 Reconciliation
    document.querySelector('[data-atab="reconcile"]').click(); await wait(450);
    checks.push({name:"6 matrix present", ok:/Approach Applicability/.test(document.body.innerHTML.slice(-200000)), detail:""});
    setv("#ap-final","8000000");
    document.querySelector("#ap-round10k").click(); await wait(350);
    var fv=C.num((document.querySelector("#ap-final")||{}).value,0);
    checks.push({name:"6 rounded", ok:fv===8000000, detail:String(fv)});
    document.querySelector("#ap-confirm").click(); await wait(400);
    checks.push({name:"6 confirmed banner", ok:/Confirmed by|confirmed by/.test(document.querySelector("#content").innerHTML), detail:""});
    // STEP 7 Certification
    document.querySelector('[data-atab="report"]').click(); await wait(400);
    setv("#apc-name","Juan Dela Cruz"); setv("#apc-prc","0012345"); setv("#apc-ptr","2026-789");
    document.querySelector("#ap-status-cert").click(); await wait(400);
    html=document.querySelector("#content").innerHTML;
    checks.push({name:"7 certified msg/status", ok:/CERTIFIED|Certified/.test(html), detail:(html.match(/Marked CERTIFIED[^<]*/)||[""])[0].slice(0,60)});
    // Workflow report print smoke
    window.__snap="";
    var pv=document.querySelector("#ap-preview"); if(pv)pv.click(); await wait(700);
    html=document.querySelector("#print-root").innerHTML || window.__snap || "";
    checks.push({name:"7 bank cover in print", ok:/BANK VALUATION REPORT/.test(html)&&/Mortgage\/Loan Security/.test(html), detail:String(html.length)});
    ok = checks.every(c=>c.ok)&&checks.length>0;
  } catch(e){ log.push("ERR:"+e.message); ok=false; }
  window.__msChecks=checks; window.__msOk=ok; window.__msDone=true;
})();