(async function () {
  var log = [], checks = [], ok;
  window.__msLog = log; window.confirm = () => true; window.__csv="";
  var op=HTMLAnchorElement.prototype.click;
  var __blob=null; var oCU=URL.createObjectURL; URL.createObjectURL=function(b){ __blob=b; return oCU.call(URL,b); };
  setTimeout(function(){ log.push("WD"); window.__msDone = true; }, 90000);
  var wait = ms => new Promise(r => setTimeout(r, ms));
  function setv(s,v){var e=document.querySelector(s); if(e){e.value=v; e.dispatchEvent(new Event("input",{bubbles:true})); e.dispatchEvent(new Event("change",{bubbles:true}));} return !!e;}
  function saveModal(){ var m=document.querySelector("#ls-modal"); if(!m) return false;
    var b=Array.from(m.querySelectorAll("button")).find(function(x){return /Save/i.test(x.textContent);});
    if(b){b.click(); return true;} return false; }
  try {
    localStorage.removeItem("esrealty_v1"); localStorage.removeItem("esrealty_user");
    document.querySelector("#auth-role").value="super-admin";
    document.querySelector("#auth-test").click(); await wait(500);
    document.querySelector('[data-view="listings"]').click(); await wait(650);
    checks.push({name:"attr filters render", ok:!!document.querySelector("#ls-furnishing")&&!!document.querySelector("#ls-pet")&&!!document.querySelector("#ls-balcony")&&!!document.querySelector("#ls-drop"), detail:""});
    checks.push({name:"export btn", ok:!!document.querySelector("[data-ls-export]"), detail:""});
    // CREATE with attrs
    document.querySelector("[data-ls-new]").click(); await wait(400);
    setv("#ls-title","Condo Makati Ave"); setv("#ls-city","Makati");
    setv("#ls-price","8000000"); setv("#ls-lot","60"); setv("#ls-floor","45");
    setv("#ls-furnishing","semi"); setv("#ls-pet","yes"); setv("#ls-balcony","yes"); setv("#ls-facing","east");
    setv("#ls-access","12m concrete road, titled RROW");
    saveModal(); await wait(750);
    html=document.querySelector("#content").innerHTML;
    checks.push({name:"listing created", ok:/Condo Makati Ave/.test(html), detail:""});
    checks.push({name:"attr chips", ok:/Semi-Furn|Pets OK|Balcony/.test(html), detail:""});
    // PRICE DROP via edit
    var card=Array.from(document.querySelectorAll("[data-ls-open]")).find(function(c){return /Condo Makati Ave/.test(c.textContent);});
    if(card) card.click(); await wait(450);
    var editB=document.querySelector("[data-ls-edit]");
    if(editB){ editB.click(); await wait(450);
      setv("#ls-price","7200000");
      saveModal(); await wait(700); }
    html=document.querySelector("#content").innerHTML;
    checks.push({name:"drop chip", ok:/Reduced from|▼/.test(html), detail:(html.match(/▼ [^<]*/)||["none"])[0]});
    // Back to grid for CSV
    var backB=Array.from(document.querySelectorAll("#content button")).find(function(b){return /Back to listings/i.test(b.textContent);});
    log.push("backBtn="+(!!backB));
    if(backB){ backB.click(); await wait(600); }
    var ex=document.querySelector("[data-ls-export]");
    log.push("exFound="+(!!ex)+" onGrid="+(!!document.querySelector("[data-ls-new]")));
    if(ex){ try { ex.click(); } catch(e2){ log.push("exClickERR:"+e2.message); } await wait(300); }

    if(__blob){ await new Promise(function(res){ var fr=new FileReader(); fr.onload=function(){ window.__csv=String(fr.result); res(); }; fr.readAsText(__blob); }); }
    checks.push({name:"csv headers+row", ok:/"Ref","Title","Type","Deal","Status"/.test(window.__csv||"")&&/Semi-Furnished/.test(window.__csv||""), detail:String(((window.__csv||"").split("\n").length)-1)+" rows"});
    ok=checks.every(c=>c.ok)&&checks.length>0;
  } catch(e){ log.push("ERR:"+e.message); ok=false; }
  window.__msChecks=checks; window.__msOk=ok; window.__msDone=true;
})();