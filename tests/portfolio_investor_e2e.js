(async function(){
  var wait = ms=> new Promise(r=> setTimeout(r, ms));
  var checks=[];
  function check(name, ok, detail){ checks.push({name, ok: !!ok, detail: detail||""}); }
  try{
    localStorage.removeItem("esrealty_v1"); localStorage.removeItem("esrealty_user");
    document.querySelector("#auth-role").value="super-admin";
    document.querySelector("#auth-test").click(); await wait(800);
    document.querySelector('[data-view="portfolio"]').click(); await wait(700);
    check("portfolio view renders", !!document.querySelector('#topbar-title') && document.querySelector('#topbar-title').textContent.includes("Portfolio"), document.querySelector('#topbar-title').textContent);
    check("overview KPIs present", !!document.querySelector('.kpi'), document.querySelectorAll('.kpi').length+"");
    check("tabs present", document.querySelectorAll('[data-ptab]').length===6, document.querySelectorAll('[data-ptab]').length+"");
    // Assets tab
    document.querySelector('[data-ptab="assets"]').click(); await wait(400);
    check("assets tab renders", !!document.querySelector('#content').innerHTML.includes("Assets"), "assets");
    // Ledger tab
    document.querySelector('[data-ptab="ledger"]').click(); await wait(400);
    check("ledger tab renders", !!document.querySelector('#content').innerHTML.includes("Cash Ledger"), "ledger");
    // Construction tab
    document.querySelector('[data-ptab="construction"]').click(); await wait(400);
    check("construction tab renders", !!document.querySelector('#content').innerHTML.includes("Construction"), "construction");
    // Test ledger logic via pure module (if available)
    const L = window.ESPOR;
    if(L){
      const ledger={ opening: 100000, entries:[] };
      const r1=L.post({ accountId:"test-acc", direction:"in", amount:50000, description:"buyer payment" }, ledger);
      check("cash in posts", r1.ok && r1.balance===150000, "bal "+r1.balance);
      const r2=L.post({ accountId:"test-acc", direction:"out", amount:20000, purpose:"others", subcategory:"fee", description:"bank charge" }, ledger);
      check("cash out others posts", r2.ok && r2.balance===130000, "bal "+r2.balance);
      const r3=L.post({ accountId:"test-acc", direction:"out", amount:200000, purpose:"others", subcategory:"fee", description:"big" }, ledger);
      check("insufficient blocked", !r3.ok && r3.insufficient, "insufficient");
    } else {
      check("ledger module present", false, "no ESPOR");
    }
    check("no horizontal scroll", document.documentElement.scrollWidth <= window.innerWidth+2, "sw "+document.documentElement.scrollWidth+" vw "+window.innerWidth);
  }catch(e){ window.__msErr=String(e&&e.stack||e); }
  window.__msChecks=checks;
  window.__msOk= !window.__msErr && checks.length>0 && checks.every(c=>c.ok);
  window.__msDone=true;
})();
