(async function () {
  var log = [], checks = [], ok;
  window.__msLog = log; window.confirm = () => true;
  setTimeout(function(){ log.push("WD"); window.__msDone = true; }, 90000);
  var wait = ms => new Promise(r => setTimeout(r, ms));
  function setv(s,v){var e=document.querySelector(s); if(e){e.value=v; e.dispatchEvent(new Event("input",{bubbles:true})); e.dispatchEvent(new Event("change",{bubbles:true}));} return !!e;}
  function savePsModal(){ var m=document.querySelector("#ps-modal"); if(!m) return false;
    var b=m.querySelector("[data-ps-save]"); if(b){b.click(); return true;} return false;}
  function saveModal(){ var m=document.querySelector("#ps-modal"); if(!m) return false; var b=m.querySelector("[data-ps-save]"); if(b){b.click(); return true;} return false;}
  try {
    localStorage.clear();
    document.querySelector("#auth-role").value="super-admin";
    document.querySelector("#auth-test").click(); await wait(500);
    document.querySelector('[data-view="presell"]').click(); await wait(650);
    // Create project
    document.querySelector("[data-ps-new-project]").click(); await wait(350);
    setv("#psf-name","FinCalc Test"); saveModal(); await wait(550);
    // Open detail
    var card=document.querySelector("[data-ps-open]"); if(card) card.click(); await wait(500);
    checks.push({name:"detail", ok:/Add Unit/.test(document.querySelector("#content").innerHTML), detail:""});
    // Add unit
    document.querySelector("[data-ps-add-unit]").click(); await wait(350);
    setv("#psf-unit-no","201");
    saveModal(); await wait(550);
    html=document.querySelector("#content").innerHTML;
    checks.push({name:"unit created", ok:/201/.test(html), detail:""});
    // RESERVE the unit (needed for schedule)
    var resBtn=document.querySelector("[data-ps-reserve-btn]");
    if(resBtn){ resBtn.click(); await wait(350);
      setv("#psf-res-name","Test Buyer");
      saveModal(); await wait(500); }
    html=document.querySelector("#content").innerHTML;
    checks.push({name:"reserved", ok:/Reserved/.test(html), detail:""});
    // OPEN SCHEDULE modal
    var schedB=document.querySelector("[data-ps-sched]");
    checks.push({name:"schedule btn", ok:!!schedB, detail:""});
    if(schedB) schedB.click(); await wait(400);
    var sm=document.querySelector("#ps-modal");
    checks.push({name:"schedule modal opens", ok:!!sm&&/Payment Schedule|No schedule/.test(sm.innerHTML), detail:""});
    // Set TCP + generate
    setv("#psf-tcp","6500000"); setv("#psf-resfee","50000"); setv("#psf-dpmonths","24"); setv("#psf-loanpct","90"); setv("#psf-rate","7.5"); setv("#psf-years","15");
    var genB=sm.querySelector("[data-ps-regen]");
    if(genB) { genB.click(); await wait(500); }
    else {
      // find a generate button inside modal
      Array.from((document.querySelector("#ps-modal")||{querySelectorAll:()=>[]}).querySelectorAll("button")).forEach(function(b){ if(/Generate/i.test(b.textContent)) b.click(); });
      await wait(500);
    }
    html=(document.querySelector("#ps-modal")||{innerHTML:""}).innerHTML;
    checks.push({name:"financing quick-calc", ok:/Financing Quick-Calc/.test(html)&&/Loan/.test(html), detail:(html.match(/Loan[^<]{0,60}/)||["none"])[0].slice(0,60)});
    checks.push({name:"monthly amort shown", ok:/\/mo/.test(html), detail:(html.match(/≈ ₱[\d,]+\/mo/g)||[]).join(", ")});
    // Close schedule
    var closeB=sm?sm.querySelector("[data-ps-save]"):null; if(closeB) closeB.click(); await wait(400);
    // Check inline payment summary on unit row
    html=document.querySelector("#content").innerHTML;
    checks.push({name:"inline pay summary", ok:/₱0 \/ ₱6,450,000|next/.test(html.replace(/&nbsp;/g," ")), detail:(html.match(/next <b>.*?<\/b>/)||["no next"])[0].slice(0,60)});
    ok=checks.every(c=>c.ok)&&checks.length>0;
  } catch(e){ log.push("ERR:"+e.message); ok=false; }
  window.__msChecks=checks; window.__msOk=ok; window.__msDone=true;
})();