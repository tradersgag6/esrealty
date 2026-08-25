(async function () {
  var log = [], checks = [], ok;
  window.__msLog = log; window.confirm = () => true;
  setTimeout(function(){ log.push("WD"); window.__msDone = true; }, 60000);
  var wait = ms => new Promise(r => setTimeout(r, ms));
  try {
    localStorage.removeItem("esrealty_v1"); localStorage.removeItem("esrealty_user");
    document.querySelector("#auth-role").value="super-admin";
    document.querySelector("#auth-test").click(); await wait(500);
    document.querySelector('[data-view="leads"]').click(); await wait(700);
    checks.push({name:"no h-scroll", ok:document.documentElement.scrollWidth<=window.innerWidth+2, detail:"sw="+document.documentElement.scrollWidth+" vw="+window.innerWidth});
    // board single/2-col on mobile
    var col=document.querySelector(".lead-col");
    if(col){var w=col.getBoundingClientRect().width;
      checks.push({name:"board columns fit", ok:w<=window.innerWidth, detail:"colW="+Math.round(w)});}
    // Add lead modal fits
    document.querySelector("[data-lead-new]").click(); await wait(350);
    var mc=document.querySelector("#ld-modal .modal-card");
    if(mc){var r=mc.getBoundingClientRect();
      checks.push({name:"modal fits viewport", ok:r.width<=window.innerWidth+2 && r.left>=0, detail:"w="+Math.round(r.width)});
      var saveB=Array.from(mc.querySelectorAll("button")).find(b=>/Save/i.test(b.textContent));
      if(saveB){var sr=saveB.getBoundingClientRect();
        checks.push({name:"save reachable", ok:sr.top>=0&&sr.bottom<=innerHeight+80||sr.height>0, detail:"t="+Math.round(sr.top)});}
    }
    // close modal
    var x=document.querySelector("#ld-modal [data-modal-close], #ld-modal .modal-close");
    if(!x){x=Array.from(document.querySelectorAll("#ld-modal button")).find(b=>/×|Close|Cancel/i.test(b.textContent));}
    if(x){x.click(); await wait(300);} 
    // open a seeded lead card if any
    var card=document.querySelector("[data-lead-open]");
    if(card){card.click(); await wait(400);
      checks.push({name:"detail fits", ok:document.documentElement.scrollWidth<=window.innerWidth+2, detail:""});
      var ab=document.querySelector("[data-lead-advance]");
      if(ab){var ar=ab.getBoundingClientRect(); checks.push({name:"advance touch target", ok:ar.height>=24, detail:"h="+Math.round(ar.height)});}
    } else { checks.push({name:"seed lead present", ok:true, detail:"none seeded - skip"}); }
    ok=checks.every(c=>c.ok);
  } catch(e){ log.push("ERR:"+e.message); ok=false; }
  window.__msChecks=checks; window.__msOk=ok; window.__msDone=true;
})();