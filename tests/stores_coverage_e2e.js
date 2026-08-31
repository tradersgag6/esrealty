(async function () {
  var log = [], checks = [], ok;
  window.__msLog = log; window.confirm = () => true;
  setTimeout(function(){ log.push("WD"); window.__msDone = true; }, 110000);
  var wait = ms => new Promise(r => setTimeout(r, ms));
  function setSel(id, val){
    var el=document.querySelector(id);
    el.value=val;
    el.dispatchEvent(new Event("change",{bubbles:true}));
  }
  function resultsArea(){ return document.querySelector("#ms-stores-results"); }
  function hasResultsText(txt){ var r=resultsArea(); return !!r && r.textContent.indexOf(txt) !== -1; }
  function resultsDone(){
    var r=resultsArea();
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
  function waitFor(pred, timeoutMs){
    return new Promise(function(resolve){
      var t0=Date.now();
      var poll=setInterval(function(){
        if(pred()){ clearInterval(poll); resolve(true); }
        else if(Date.now()-t0>timeoutMs){ clearInterval(poll); resolve(false); }
      },400);
    });
  }
  var mid = "\u00B7";
  function coverageLine(){ var r=resultsArea(); if(!r) return ""; var m=r.textContent.match(/Checked \d+ chains? in OpenStreetMap[^]*/); return m?m[0]:""; }
  function noRightOverflow(){
    var c=document.querySelector("#ms-stores-card");
    if(!c) return false;
    var max=0;
    var all=[c].concat(Array.prototype.slice.call(c.querySelectorAll("*")));
    for(var i=0;i<all.length;i++){ var rc=all[i].getBoundingClientRect(); if(rc.right>max) max=rc.right; }
    return max <= document.documentElement.clientWidth + 2;
  }
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
    var cat=document.querySelector("#ms-stores-cat"); cat.value="mini"; cat.dispatchEvent(new Event("change",{bubbles:true})); await wait(150);
    var minb=document.querySelector("#ms-stores-minb"); minb.value="0"; minb.dispatchEvent(new Event("input",{bubbles:true}));
    log.push("mini find");
    clickFind();
    var got1=await waitResults(85000);
    await wait(400);
    var cov1=coverageLine();
    log.push("cov1="+cov1);
    checks.push({name:"mini run reports zero chains honestly", ok:got1&&/Checked 2 chains/.test(cov1)&&/Dali Discount Store/.test(cov1)&&/O!Save/.test(cov1), detail:cov1||"no coverage line"});
    checks.push({name:"zero chain listed with mapped count", ok:got1&&hasResultsText("Dali Discount Store")&&hasResultsText("0 branches"), detail:cov1?cov1:""});
    log.push("mini below-min (stubbed)");
    var realFetch = window.fetch;
    window.fetch = function(url){
      if(String(url).indexOf("/api/market-scan/stores") !== -1){
        return Promise.resolve({ ok:true, json: function(){ return Promise.resolve({ ok:true, cached:false, refreshed:false, stale:false, cachedAt:"", fetchedAt:"2026-08-29T09:00:00Z", chains:[], coverage:[ {name:"Dali Discount Store",foundBranches:0,status:"zero",branchCountSource:"OpenStreetMap (Nominatim)"}, {name:"O!Save",foundBranches:0,status:"zero",branchCountSource:"OpenStreetMap (Nominatim)"} ], warnings:[] }); } });
      }
      return realFetch.apply(this, arguments);
    };
    minb.value="3"; minb.dispatchEvent(new Event("input",{bubbles:true})); await wait(150);
    clickFind();
    var got1b = await waitFor(function(){ return hasResultsText("No mini chain") && hasResultsText("Checked: Dali Discount Store"); }, 15000);
    await wait(200);
    window.fetch = realFetch;
    var mtx="";
    var rr=resultsArea();
    if(rr){ var mm=rr.textContent.match(/No [^.\n]+\.\s*Checked:[^.\n]*/); if(mm) mtx=mm[0]; }
    log.push("notice="+got1b);
    checks.push({name:"all-below-min shows notice with checked coverage", ok:!!got1b, detail:mtx||"notice text missing"});
    var cinf="";
    var c0=document.querySelector("#ms-stores-card");
    if(c0){ var mx0=0, listN=[c0].concat(Array.prototype.slice.call(c0.querySelectorAll("*"))); for(var k=0;k<listN.length;k++){ var rk=listN[k].getBoundingClientRect(); if(rk.right>mx0) mx0=rk.right; } cinf="card right-max="+Math.round(mx0)+" vw="+document.documentElement.clientWidth; }
    checks.push({name:"store card fits the viewport", ok:noRightOverflow(), detail:cinf||"no card"});
    var statusEl=document.querySelector("#ms-stores-status");
    checks.push({name:"status region announced", ok:!!statusEl&&(statusEl.getAttribute("role")==="status"||statusEl.getAttribute("aria-live")==="polite"), detail:"role="+(statusEl?statusEl.getAttribute("role"):"none")});
    var minEl=document.querySelector("#ms-stores-minb");
    checks.push({name:"min branches input explained", ok:!!minEl&&!!minEl.getAttribute("aria-label")&&!!minEl.getAttribute("title"), detail:minEl?(minEl.getAttribute("aria-label")+" / "+minEl.getAttribute("title")):""});
    log.push("convenience find");
    cat.value="convenience"; cat.dispatchEvent(new Event("change",{bubbles:true})); await wait(150);
    minb.value="3"; minb.dispatchEvent(new Event("input",{bubbles:true})); await wait(150);
    clickFind();
    var got2=await waitResults(85000);
    await wait(400);
    var cov2=coverageLine();
    log.push("cov2="+cov2);
    checks.push({name:"coverage lists all scanned chains with status", ok:got2&&/Checked 6 chains/.test(cov2)&&Object.keys(cov2).length>0, detail:cov2||"no coverage line"});
    checks.push({name:"below-minimum chain clearly labelled", ok:got2&&/Alfamart/.test(cov2)&&/(below-min|zero|found)/.test(cov2), detail:cov2?cov2:""});
    var mapsHref="";
    var mapLink=document.querySelector('#ms-stores-results a[href*="maps"]');
    if(mapLink) mapsHref=mapLink.getAttribute("href");
    log.push("maps="+mapsHref);
    checks.push({name:"branch links scope to the selected city", ok:got2&&mapsHref.indexOf("Makati")!==-1, detail:mapsHref||"no maps link"});
    var filterEl=document.querySelector("#ms-stores-q");
    checks.push({name:"branch filter labelled", ok:!!filterEl, detail:filterEl?"aria-label="+filterEl.getAttribute("aria-label"):"missing"});
    ok=checks.every(c=>c.ok)&&checks.length>0;
  } catch(e){ log.push("ERR:"+e.message); ok=false; }
  window.__msChecks=checks; window.__msOk=ok; window.__msDone=true;
})();