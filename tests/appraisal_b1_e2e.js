(async function () {
  var log = [], checks = [], ok;
  window.__msLog = log; window.confirm = () => true;
  setTimeout(function(){ log.push("WD"); window.__msDone = true; }, 40000);
  var wait = ms => new Promise(r => setTimeout(r, ms));
  var setv = (s, v) => { var e = document.querySelector(s); if (e) { e.value = v; e.dispatchEvent(new Event("input", { bubbles: true })); } return !!e; };
  try {
    // Pure-function verification of tax + collateral engines
    var C = window.ESREALTY.core;
    var tx = C.phTaxes({ lotArea: 1000, sellingPrice: 6500000, zonalPsm: 7000, smvPsm: 2800, marketValue: 7300000 });
    checks.push({name:"cgtBase=highest(zonal)", ok: tx.cgtBase === 7000000 && tx.governing === "BIR Zonal FMV", detail:tx.governing+":"+tx.cgtBase});
    checks.push({name:"cgt 6%", ok: tx.cgt === 420000, detail:String(tx.cgt)});
    checks.push({name:"dst 1.5%", ok: tx.dst === 105000, detail:String(tx.dst)});
    checks.push({name:"xfer 0.5%", ok: tx.transferTax === 35000, detail:String(tx.transferTax)});
    checks.push({name:"zonal delta flag", ok: Math.round(tx.zonalDeltaPct*10)/10 === 4.3, detail:String(tx.zonalDeltaPct)});
    var col = C.collateralValue(7300000, 40);
    checks.push({name:"mortgage 60%", ok: col.mortgageValue === 4380000, detail:String(col.mortgageValue)});
    var col2 = C.collateralValue(7300000, 130);
    checks.push({name:"haircut clamped", ok: col2.mortgageValue === 730000, detail:String(col2.mortgageValue)});
    // UI flow
    localStorage.removeItem("esrealty_v1"); localStorage.removeItem("esrealty_user");
    var role = document.querySelector("#auth-role"); if (role) role.value = "super-admin";
    document.querySelector("#auth-test").click(); await wait(500);
    document.querySelector('[data-view="appraisal"]').click(); await wait(700);
    document.querySelector("#ap-reset").click(); await wait(300);
    setv("#ap-name","E2E Tax"); await wait(200);
    setv("#ap-sp","6500000"); setv("#ap-zonal","3500"); setv("#ap-smv","2800"); setv("#ap-al","20"); setv("#ap-haircut","40");
    document.querySelector('[data-atab="approaches"]').click(); await wait(600);
    var html=document.querySelector("#content").innerHTML;
    checks.push({name:"tax card ui", ok:/PH Transfer Tax Computation/.test(html)&&/Governing Base/.test(html), detail:""});
    checks.push({name:"total=8% SP", ok:/₱?5,200,000|5,200,000/.test(html.replace(/\u20b1/g,"₱"))||/520,000/.test(html), detail:(html.match(/Total Tax[^<]*<[\s\S]{0,90}/)||[""])[0].replace(/<[^>]+>/g," ").slice(0,60)});
    document.querySelector('[data-atab="adjust"]').click(); await wait(500);
    var els=document.querySelectorAll(".adj-grid tbody tr td.el-name");
    checks.push({name:"new elements grid", ok:Array.from(els).some(e=>/Right-of-Way/.test(e.textContent))&&Array.from(els).some(e=>/Geohazard/.test(e.textContent))&&Array.from(els).some(e=>/Corner \/ Lot Type/.test(e.textContent))&&Array.from(els).some(e=>/Zoning \/ Land Use/.test(e.textContent)), detail:String(els.length)});
    document.querySelector('[data-atab="reconcile"]').click(); await wait(600);
    html=document.querySelector("#content").innerHTML;
    checks.push({name:"collateral section", ok:/Collateral \/ Forced Sale Value/.test(html), detail:""});
    ok = checks.every(c=>c.ok)&&checks.length>0;
  } catch(e){ log.push("ERR:"+e.message); ok=false; }
  window.__msChecks = checks; window.__msOk = ok; window.__msDone = true;
})();