(async function () {
  var log = [], checks = [], ok;
  window.__msLog = log; window.confirm = () => true;
  setTimeout(function(){ log.push("WD"); window.__msDone = true; }, 60000);
  var wait = ms => new Promise(r => setTimeout(r, ms));
  var setv = (s, v) => { var e = document.querySelector(s); if (e) { e.value = v; e.dispatchEvent(new Event("input", { bubbles: true })); e.dispatchEvent(new Event("change", { bubbles: true })); } return !!e; };
  try {
    localStorage.removeItem("esrealty_v1"); localStorage.removeItem("esrealty_user");
    document.querySelector("#auth-role").value="super-admin";
    document.querySelector("#auth-test").click(); await wait(500);
    document.querySelector('[data-view="leads"]').click(); await wait(700);
    // Stats bar
    checks.push({name:"stats bar", ok:document.querySelectorAll(".ls-stat").length>=4, detail:String(document.querySelectorAll(".ls-stat").length)});
    // Create lead
    var newBtn=document.querySelector("[data-lead-new]");
    checks.push({name:"add-lead btn", ok:!!newBtn, detail:""});
    newBtn.click(); await wait(350);
    var modal=document.querySelector("#ld-modal");
    checks.push({name:"modal opens", ok:!!modal, detail:""});
    var ids=Array.from(modal.querySelectorAll("input,select")).map(e=>e.id).filter(Boolean);
    log.push("modal fields: "+ids.join(","));
    setv("#ld-name","Maria Santos"); 
    ["ld-budget","ld-phone","ld-email"].forEach(function(id){ var el=document.getElementById(id); if(el) el.value = id==="ld-budget"?"3500000":"09171234567"; });
    var src=document.getElementById("ld-source"); if(src){src.value=src.options[1]?src.options[1].value:"listing"; src.dispatchEvent(new Event("change",{bubbles:true}));}
    var saveBtn=Array.from(modal.querySelectorAll("button")).find(b=>/Save/i.test(b.textContent));
    checks.push({name:"save btn", ok:!!saveBtn, detail:""});
    if(saveBtn) saveBtn.click(); await wait(500);
    html=document.querySelector("#content").innerHTML;
    checks.push({name:"lead appears", ok:/Maria Santos/.test(html), detail:""});
    // Open detail
    var card=document.querySelector("[data-lead-open]");
    if(card) card.click(); await wait(450);
    html=document.querySelector("#content").innerHTML;
    checks.push({name:"detail renders", ok:/Advance|Activity|Status/i.test(html), detail:html.length+"c"});
    var adv=document.querySelector("[data-lead-advance]");
    checks.push({name:"advance btn", ok:!!adv, detail:""});
    if(adv) adv.click(); await wait(400);
    html=document.querySelector("#content").innerHTML;
    checks.push({name:"stage advanced", ok:/Contacted/.test(html), detail:""});
    checks.push({name:"activity logged", ok:/Status changed/.test(html), detail:""});
    // back to pipeline
    var backBtn=Array.from(document.querySelectorAll("button")).find(b=>/Pipeline|Back to/i.test(b.textContent));
    if(backBtn){backBtn.click(); await wait(350);}
    // Edit
    var ed=document.querySelector("[data-lead-edit]");
    if(ed){ed.click(); await wait(350);
      setv("#ld-name","Maria Santos-Reyes");
      var sb2=Array.from((document.querySelector("#ld-modal")||{querySelectorAll:()=>[]}).querySelectorAll("button")).find(b=>/Save/i.test(b.textContent));
      if(sb2) sb2.click(); await wait(450);}
    checks.push({name:"edit saves", ok:/Maria Santos-Reyes/.test(document.querySelector("#content").innerHTML), detail:""});
    // Filter search
    var q=document.querySelector('[data-lead-q], #lead-q, input[placeholder*="earch"]');
    log.push("search field="+(q?q.id||q.getAttribute("placeholder"):"none"));
    // Calendar mode toggle
    var calBtn=Array.from(document.querySelectorAll("button")).find(b=>/Calendar/i.test(b.textContent));
    if(calBtn){calBtn.click(); await wait(400);}
    checks.push({name:"calendar view", ok:/cal-|Calendar/.test(document.querySelector("#content").innerHTML), detail:""});
    var pipeBtn=Array.from(document.querySelectorAll("button")).find(b=>/Pipeline/i.test(b.textContent));
    if(pipeBtn){pipeBtn.click(); await wait(350);}
    // Delete temp second lead? create then delete
    ok = checks.every(c=>c.ok)&&checks.length>0;
  } catch(e){ log.push("ERR:"+e.message); ok=false; }
  window.__msChecks=checks; window.__msOk=ok; window.__msDone=true;
})();