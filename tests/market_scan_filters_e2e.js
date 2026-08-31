(async function () {
  var log = [], checks = [], ok;
  window.__msLog = log; window.confirm = () => true;
  setTimeout(function(){ log.push("WD"); window.__msDone = true; }, 90000);
  var wait = ms => new Promise(r => setTimeout(r, ms));
  function runScan(cb){
    document.querySelector("#ms-run").click();
    var poll=setInterval(function(){
      var r=document.querySelector("#market-results");
      if(r && /matched/.test(r.textContent)){ clearInterval(poll); cb(); }
    },400);
    setTimeout(function(){ clearInterval(poll); cb(); }, 80000);
  }
  try {
    localStorage.removeItem("esrealty_v1"); localStorage.removeItem("esrealty_user");
    document.querySelector("#auth-role").value="super-admin";
    document.querySelector("#auth-test").click(); await wait(500);
    document.querySelector('[data-view="market"]').click(); await wait(700);
    var live=document.querySelector("#ms-live"); if(live && live.checked) live.click(); await wait(120);
    // A) Province only (no city): NCR / Metro Manila — must exclude non-NCR benchmark rows
    var reg=document.querySelector("#ms-region"); reg.value="NCR"; reg.dispatchEvent(new Event("change",{bubbles:true})); await wait(250);
    var prov=document.querySelector("#ms-province"); prov.value="Metro Manila"; prov.dispatchEvent(new Event("change",{bubbles:true})); await wait(200);
    var mx=document.querySelector("#ms-max"); if(mx){ mx.value="500"; mx.dispatchEvent(new Event("input",{bubbles:true})); }
    await new Promise(res=>runScan(res)); await wait(300);
    html=document.querySelector("#content").innerHTML;
    var m=html.match(/(\d+) matched/); var nA=m?parseInt(m[1]):0;
    log.push("A matched="+nA);
    checks.push({name:"province narrows (<495)", ok:nA>0&&nA<495, detail:String(nA)});
    // every visible card belongs to NCR cities
    var cards=Array.from(document.querySelectorAll("#market-results article.ms-card"));
    var ncr=["Manila","Quezon","Makati","Taguig","Pasig","Mandaluyong","Para","Muntinlupa","Pasay","Marikina","Caloocan","Las Pi","Valenzuela","Malabon","Navotas","Pateros","San Juan"];
    var bad=cards.filter(function(c){ return !ncr.some(function(k){ return c.textContent.indexOf(k)!==-1; }); }).length;
    log.push("cards="+cards.length+" bad="+bad);
    checks.push({name:"all cards NCR", ok:cards.length>0&&bad===0, detail:bad+"/"+cards.length});
    // B) Type narrowing on top: Condominium Unit
    var ty=document.querySelector("#ms-type"); ty.value="Condominium Unit"; ty.dispatchEvent(new Event("change",{bubbles:true})); await wait(150);
    await new Promise(res=>runScan(res)); await wait(300);
    html=document.querySelector("#content").innerHTML;
    var m2=html.match(/(\d+) matched/); var nB=m2?parseInt(m2[1]):0;
    log.push("B condo matched="+nB);
    // Filter should not increase results (allow nB=0 if no condos in area)
    checks.push({name:"type narrows further", ok:nB<=nA, detail:nB+"<="+nA});
    var condoBad=Array.from(document.querySelectorAll("#market-results article.ms-card")).filter(function(c){
      return !/condo|studio|condominium/i.test(c.textContent); }).length;
    checks.push({name:"all cards condo-type", ok:condoBad===0, detail:condoBad+" off"});
    // C) Clear still resets
    document.querySelector("#ms-clear").click(); await wait(500);
    checks.push({name:"clear works", ok:/Run a market scan/.test(document.querySelector("#content").innerHTML), detail:""});
    ok=checks.every(c=>c.ok)&&checks.length>0;
  } catch(e){ log.push("ERR:"+e.message); ok=false; }
  window.__msChecks=checks; window.__msOk=ok; window.__msDone=true;
})();