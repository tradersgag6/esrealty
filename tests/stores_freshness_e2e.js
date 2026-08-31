(async function () {
  var log = [], checks = [], ok;
  window.__msLog = log; window.confirm = () => true;
  setTimeout(function(){ log.push("WD"); window.__msDone = true; }, 100000);
  var wait = ms => new Promise(r => setTimeout(r, ms));
  function setSel(id, val){
    var el=document.querySelector(id);
    el.value=val;
    el.dispatchEvent(new Event("change",{bubbles:true}));
  }
  function chipMeta(){
    var r=document.querySelector("#ms-stores-results");
    if(!r) return "";
    var m=r.textContent.match(/(Fresh scan|Refreshed|Cached|Stale) \u00B7 observed ([0-9\- :TZ]+)/);
    return m ? (m[1]+"|"+m[2]) : "";
  }
  function statusText(){ var s=document.querySelector("#ms-stores-status"); return s ? s.textContent : ""; }
  function resultsDone(){
    var r=document.querySelector("#ms-stores-results");
    if(!r) return false;
    return !!r.querySelector("[data-sc-chain]") || /notice-banner/.test(r.innerHTML) && /\bchain\b/.test(r.textContent);
  }
  function waitResults(timeoutMs){
    return new Promise(function(resolve){
      var t0=Date.now();
      var poll=setInterval(function(){
        if(resultsDone()){ clearInterval(poll); resolve(true); }
        else if(Date.now()-t0>timeoutMs){ clearInterval(poll); resolve(false); }
      },400);
    });
  }
  function clickFind(){ document.querySelector("#ms-stores-run").click(); }
  try {
    localStorage.removeItem("esrealty_v1"); localStorage.removeItem("esrealty_user");
    document.querySelector("#auth-role").value="super-admin";
    document.querySelector("#auth-test").click(); await wait(500);
    document.querySelector('[data-view="market"]').click(); await wait(700);
    var card=document.querySelector("#ms-stores-card");
    checks.push({name:"store locator card present", ok:!!card, detail:card?"yes":"missing"});
    setSel("#ms-stores-region","NCR"); await wait(250);
    setSel("#ms-stores-province","Metro Manila"); await wait(250);
    setSel("#ms-stores-city","Makati"); await wait(200);
    var cat=document.querySelector("#ms-stores-cat"); cat.value="convenience"; cat.dispatchEvent(new Event("change",{bubbles:true})); await wait(150);
    var minb=document.querySelector("#ms-stores-minb"); minb.value="4"; minb.dispatchEvent(new Event("input",{bubbles:true}));
    log.push("find 1");
    clickFind();
    var got1=await waitResults(85000);
    await wait(400);
    log.push("chip1="+chipMeta());
    checks.push({name:"first find returns results", ok:got1&&!!chipMeta(), detail:chipMeta()});
    var refBtn=document.querySelector("#ms-stores-refresh");
    checks.push({name:"refresh button present", ok:!!refBtn, detail:refBtn?"yes":"missing"});
    refBtn.click();
    log.push("refresh clicked");
    var sawRefreshing=false;
    for(var i=0;i<60 && !sawRefreshing;i++){ await wait(200); if(/Refreshing/.test(statusText())) sawRefreshing=true; }
    var got2=await waitResults(85000);
    await wait(500);
    var chip2=chipMeta();
    log.push("chip2="+chip2);
    checks.push({name:"refresh ticks status and ends fresh", ok:sawRefreshing&&got2&&/^(Refreshed|Fresh scan)/.test(chip2), detail:"statusRefreshing="+sawRefreshing+" chip="+chip2});
    log.push("find 2 (cache)");
    clickFind();
    var got3=await waitResults(85000);
    await wait(400);
    var chip3=chipMeta();
    log.push("chip3="+chip3);
    checks.push({name:"re-find serves cached data", ok:got3&&/^Cached/.test(chip3), detail:chip3});
    ok=checks.every(c=>c.ok)&&checks.length>0;
  } catch(e){ log.push("ERR:"+e.message); ok=false; }
  window.__msChecks=checks; window.__msOk=ok; window.__msDone=true;
})();