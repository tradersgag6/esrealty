(async function () {
  var log = [], checks = [], ok;
  window.__msLog = log; window.confirm = () => true;
  setTimeout(function(){ log.push("WD"); window.__msDone = true; }, 100000);
  var wait = ms => new Promise(r => setTimeout(r, ms));
  function findStores(cb){
    document.querySelector("#ms-stores-run").click();
    var poll=setInterval(function(){
      var r=document.querySelector("#ms-stores-results");
      if(r && (r.querySelector("[data-sc-chain]") || r.querySelector(".notice-banner:not(#ms-stores-status .notice-banner)"))){
        clearInterval(poll); cb();
      }
    },400);
    setTimeout(function(){ clearInterval(poll); cb(); }, 85000);
  }
  function setSel(id, val){
    var el=document.querySelector(id);
    el.value=val;
    el.dispatchEvent(new Event("change",{bubbles:true}));
  }
  function chainRows(){ return document.querySelectorAll("#ms-stores-results [data-sc-chain]"); }
  function badgePairs(){
    var t=document.querySelector("#ms-stores-results").textContent, arr=[];
    t.replace(/([A-Za-z0-9'&. -]+) · (\d+) branches?/g, function(m,n,ct){ arr.push([n.trim(),parseInt(ct,10)]); });
    return arr;
  }
  function visibleBranches(){
    return Array.prototype.filter.call(document.querySelectorAll("#ms-stores-results .ms-sc-branch"), function(b){ return b.style.display !== "none"; }).length;
  }
  function dirtyHintVisible(){
    var r=document.querySelector("#ms-stores-results");
    return !!r && /Location or filters changed/.test(r.textContent);
  }
  try {
    localStorage.removeItem("esrealty_v1"); localStorage.removeItem("esrealty_user");
    document.querySelector("#auth-role").value="super-admin";
    document.querySelector("#auth-test").click(); await wait(500);
    document.querySelector('[data-view="market"]').click(); await wait(700);
    var card=document.querySelector("#ms-stores-card");
    checks.push({name:"store locator card present", ok:!!card, detail:card?"yes":"missing"});
    checks.push({name:"location cascade present", ok:!!document.querySelector("#ms-stores-region")&&!!document.querySelector("#ms-stores-province")&&!!document.querySelector("#ms-stores-city"), detail:""});
    setSel("#ms-stores-region","NCR"); await wait(250);
    setSel("#ms-stores-province","Metro Manila"); await wait(250);
    setSel("#ms-stores-city","Makati"); await wait(200);
    var cat=document.querySelector("#ms-stores-cat"); cat.value="convenience"; cat.dispatchEvent(new Event("change",{bubbles:true})); await wait(150);
    var minb=document.querySelector("#ms-stores-minb"); minb.value="3"; minb.dispatchEvent(new Event("input",{bubbles:true}));
    log.push("run1 min=3");
    await new Promise(res=>findStores(res)); await wait(300);
    var chains=chainRows();
    var bd=badgePairs();
    log.push("chains="+chains.length+" badges="+bd.map(function(b){return b[0]+":"+b[1];}).join(","));
    checks.push({name:"7-Eleven listed with >=3 branches in Makati", ok:chains.length>0&&bd.some(function(b){ return /7-Eleven/.test(b[0]) && b[1]>=3; }), detail:bd.map(function(b){return b[0]+"("+b[1]+")";}).join(",")});
    checks.push({name:"at least 2 chains pass min 3", ok:chains.length>=2, detail:String(chains.length)});
    var branchCells=document.querySelectorAll("#ms-stores-results [data-sc-branch]").length;
    checks.push({name:"branch rows rendered", ok:branchCells>0, detail:String(branchCells)});
    var mapsLink=document.querySelector("#ms-stores-results a[data-sc-maps]");
    checks.push({name:"google maps link present", ok:!!mapsLink&&/google\.com\/maps/.test(mapsLink.href), detail:mapsLink?mapsLink.href:""});
    var showBtn=document.querySelector("#ms-stores-results [data-ms-sc-map]");
    if(showBtn){ showBtn.click(); await wait(1200); }
    var frame=document.querySelector("#ms-stores-results .ms-sc-branch .ms-sc-map iframe");
    checks.push({name:"map embed loads on click", ok:!!frame&&frame.src.indexOf("output=embed")!==-1, detail:frame?frame.src.slice(0,120):"no iframe"});
    // results filter: type a street name -> subset shown, match counter present; clear -> all back
    var totalVisible=visibleBranches();
    var fq=document.querySelector("#ms-stores-q");
    checks.push({name:"results filter input present", ok:!!fq, detail:""});
    if(fq){ fq.value="Chino"; fq.dispatchEvent(new Event("input",{bubbles:true})); await wait(200); }
    var filteredVisible=visibleBranches();
    var matchText=document.querySelector("#ms-stores-match");
    checks.push({name:"filter narrows branch rows", ok:filteredVisible>0&&filteredVisible<totalVisible, detail:filteredVisible+"/"+totalVisible});
    checks.push({name:"filter match count shown", ok:!!matchText&&/of \d+ branch rows match/.test(matchText.textContent), detail:matchText?matchText.textContent.replace(/[\u201C\u201D"]/g,"'"):""});
    var clearBtn=document.querySelector("#ms-stores-qclear");
    if(clearBtn) clearBtn.click();
    await wait(200);
    checks.push({name:"filter clear restores rows", ok:visibleBranches()===totalVisible, detail:visibleBranches()+"=="+totalVisible});
    // min branches 20 filters weaker chains (fresh input post-render)
    minb=document.querySelector("#ms-stores-minb");
    minb.value="20"; minb.dispatchEvent(new Event("input",{bubbles:true}));
    log.push("run2 min=20");
    await new Promise(res=>findStores(res)); await wait(300);
    var bd2=badgePairs();
    log.push("min20 badges="+bd2.map(function(b){return b[0]+":"+b[1];}).join(","));
    checks.push({name:"min 20 keeps only >=20", ok:bd2.length>0 && bd2.every(function(b){ return b[1]>=20; }) && bd2.some(function(b){ return /7-Eleven/.test(b[0]); }), detail:bd2.map(function(b){return b[0]+"("+b[1]+")";}).join(",")});
    // location change invalidates results (dirty hint; no stale chains)
    setSel("#ms-stores-city","Quezon City"); await wait(300);
    checks.push({name:"location change invalidates (no stale)", ok:chainRows().length===0, detail:"chains="+chainRows().length});
    checks.push({name:"dirty hint prompts re-run", ok:dirtyHintVisible(), detail:""});
    minb=document.querySelector("#ms-stores-minb");
    minb.value="3"; minb.dispatchEvent(new Event("input",{bubbles:true}));
    log.push("run qc");
    var t0=Date.now(), pdone=false;
    for(var rdo=0; rdo<3 && !pdone; rdo++){
      document.querySelector("#ms-stores-run").click();
      var t1=Date.now();
      while(Date.now()-t1<85000){
        await wait(300);
        var r=document.querySelector("#ms-stores-results");
        if(r && r.querySelector("[data-sc-chain]")){ pdone=true; break; }
        if(r && r.querySelector(".notice-banner.err")){ pdone=true; break; }
        if(r && /No .* chain in OpenStreetMap/.test(r.textContent)){ await wait(300); break; }
      }
    }
    await wait(400);
    var bdP=badgePairs();
    log.push("qc badges="+bdP.map(function(b){return b[0]+":"+b[1];}).join(","));
    checks.push({name:"re-run loads Quezon City chains", ok:chainRows().length>0 && !dirtyHintVisible() && bdP.some(function(b){ return /7-Eleven/.test(b[0]) && b[1]>=3; }), detail:bdP.map(function(b){return b[0]+"("+b[1]+")";}).join(",")});
    // mini category at min 0 lists Dali + O!Save (honest found counts)
    cat=document.querySelector("#ms-stores-cat"); cat.value="mini"; cat.dispatchEvent(new Event("change",{bubbles:true})); await wait(150);
    minb=document.querySelector("#ms-stores-minb"); minb.value="0"; minb.dispatchEvent(new Event("input",{bubbles:true}));
    log.push("run3 cat=mini min=0");
    await new Promise(res=>findStores(res)); await wait(300);
    var names=Array.prototype.slice.call(document.querySelectorAll("#ms-stores-results [data-sc-chain]")).map(function(x){ return x.getAttribute("data-sc-chain"); });
    log.push("mini chains="+names.join(","));
    checks.push({name:"Dali + O!Save listed at min 0", ok:names.indexOf("Dali Discount Store")!==-1&&names.indexOf("O!Save")!==-1, detail:names.join(", ")});
    // region/province scope without a city must NOT leak branches from other regions
    setSel("#ms-stores-province","Metro Manila"); await wait(200);
    setSel("#ms-stores-city",""); await wait(200);
    var cat2=document.querySelector("#ms-stores-cat"); cat2.value="convenience"; cat2.dispatchEvent(new Event("change",{bubbles:true})); await wait(150);
    var minb2=document.querySelector("#ms-stores-minb"); minb2.value="1"; minb2.dispatchEvent(new Event("input",{bubbles:true}));
    log.push("run ncr-all");
    var t0=Date.now(), pdone2=false;
    for(var rdo2=0; rdo2<3 && !pdone2; rdo2++){
      document.querySelector("#ms-stores-run").click();
      var t1=Date.now();
      while(Date.now()-t1<85000){
        await wait(300);
        var r2=document.querySelector("#ms-stores-results");
        if(r2 && r2.querySelector("[data-sc-chain]")){ pdone2=true; break; }
        if(r2 && r2.querySelector(".notice-banner.err")){ pdone2=true; break; }
        if(r2 && /No .* chain in OpenStreetMap/.test(r2.textContent)){ await wait(300); break; }
      }
    }
    await wait(400);
    var branchesAll=document.querySelectorAll("#ms-stores-results .ms-sc-branch");
    var leaky=Array.prototype.filter.call(branchesAll, function(b){ return !/metro manila|manila/i.test(b.textContent); });
    log.push("ncr-all chains="+document.querySelectorAll("#ms-stores-results [data-sc-chain]").length+" branches="+branchesAll.length+" leaky="+leaky.length);
    checks.push({name:"province scope keeps branches in scope", ok:branchesAll.length>0 && leaky.length===0, detail:"branches="+branchesAll.length+" leaky="+leaky.length});
    ok=checks.every(c=>c.ok)&&checks.length>0;
  } catch(e){ log.push("ERR:"+e.message); ok=false; }
  window.__msChecks=checks; window.__msOk=ok; window.__msDone=true;
})();