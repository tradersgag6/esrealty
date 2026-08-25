(async function () {
  var log = [], checks = [], ok;
  var C = window.ESREALTY.core;
  window.__msLog = log; window.confirm = () => true;
  setTimeout(function(){ log.push("WD"); window.__msDone = true; }, 120000);
  var wait = ms => new Promise(r => setTimeout(r, ms));
  try {
    localStorage.removeItem("esrealty_v1"); localStorage.removeItem("esrealty_user");
    document.querySelector("#auth-role").value="super-admin";
    document.querySelector("#auth-test").click(); await wait(500);
    document.querySelector('[data-view="market"]').click(); await wait(700);
    // Live scan, NCR/Metro Manila
    var reg=document.querySelector("#ms-region"); reg.value="NCR"; reg.dispatchEvent(new Event("change",{bubbles:true})); await wait(250);
    var prov=document.querySelector("#ms-province"); prov.value="Metro Manila"; prov.dispatchEvent(new Event("change",{bubbles:true})); await wait(250);
    var c=document.querySelector("#ms-city"); c.value="Manila"; c.dispatchEvent(new Event("change",{bubbles:true})); await wait(150);
    document.querySelector("#ms-run").click();
    await wait(300); log.push("started");
    // Poll: wait until status no longer shows Scanning (max 75s)
    var scanning=true, polls=0;
    while(scanning && polls<95){ await wait(800); polls++;
      var s=document.querySelector("#market-status");
      scanning = !!(s && /Scanning sources/.test(s.textContent));
    }
    log.push("scanning finished after "+polls+" polls ("+(polls*0.8)+"s)");
    var html=document.querySelector("#content").innerHTML;
    var greens=Array.from(document.querySelectorAll("#market-results .badge.green")).length;
    var golds=Array.from(document.querySelectorAll("#market-results .badge.gold")).length;
    log.push("greens="+greens+" golds="+golds);
    checks.push({name:"scan finishes", ok:!scanning, detail:(polls*0.8)+"s"});
    checks.push({name:"sources reported", ok:greens+golds>=2, detail:"g"+greens+"/y"+golds});
    checks.push({name:"results shown", ok:/showing [1-9]/.test(html), detail:(html.match(/showing \d+/)||["none"])[0]});
    checks.push({name:"total matched", ok:/\d+ matched/.test(html), detail:(html.match(/\d+ matched/)||["none"])[0]});
    // Use-as-comp handoff into active appraisal
    var btn=document.querySelector("[data-ms-comp]");
    checks.push({name:"use-as-comp button", ok:!!btn, detail:""});
    if(btn){
      btn.click(); await wait(500);
      var nav=document.querySelector('[data-view="appraisal"]');
      var onAppr = document.querySelector("#content").innerHTML;
      checks.push({name:"jumps to appraisal comps", ok:/Comparable Sales|comp-card/.test(onAppr), detail:onAppr.length+" chars"});
      var firstTitle=((document.querySelector("#market-results [data-ms-comp]")||{}).textContent||"").trim().slice(0,15);
      checks.push({name:"comp added", ok: onAppr.indexOf(firstTitle)!==-1 || /comp-card/.test(onAppr), detail:"t="+firstTitle});
    }
    ok = checks.every(c=>c.ok)&&checks.length>0;
  } catch(e){ log.push("ERR:"+e.message); ok=false; }
  window.__msChecks=checks; window.__msOk=ok; window.__msDone=true;
})();