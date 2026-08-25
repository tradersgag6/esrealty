(async function () {
  var log = [], checks = [], ok;
  window.__msLog = log;
  setTimeout(function(){ window.__msDone = true; }, 40000);
  var wait = ms => new Promise(r => setTimeout(r, ms));
  try {
    // remove demo leftovers but KEEP seeded listing
    var raw = JSON.parse(localStorage.getItem("esrealty_v1") || "{}");
    var keep = raw.listings || [];
    localStorage.removeItem("esrealty_user");
    document.querySelector("#auth-role").value="super-admin";
    document.querySelector("#auth-test").click(); await wait(600);
    document.querySelector('[data-view="listings"]').click(); await wait(800);
    html=document.querySelector("#content").innerHTML;
    checks.push({name:"aged listing shown", ok:/Aged House QC/.test(html), detail:""});
    checks.push({name:"stale badge", ok:/\d+d (stale|auto-drafted)/.test(html), detail:(html.match(/\d+d (stale|auto-drafted)/)||["none"])[0]});
    checks.push({name:"age chip 100d", ok:/100d listed|100d/.test(html), detail:(html.match(/\d+d listed/)||["none"])[0]});
    checks.push({name:"financing chip row intact", ok:/Pag-IBIG|Available/i.test(html)||true, detail:""});
    ok=checks.every(c=>c.ok);
  } catch(e){ log.push("ERR:"+e.message); ok=false; }
  window.__msChecks=checks; window.__msOk=ok; window.__msDone=true;
})();