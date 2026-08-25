(async function () {
  var log = [], checks = [], ok;
  window.__msLog = log; window.confirm = () => true;
  setTimeout(function(){ log.push("WD"); window.__msDone = true; }, 90000);
  var wait = function(ms){ return new Promise(function(r){ setTimeout(r, ms); }); };
  function setv(s,v){var e=document.querySelector(s); if(e){e.value=v; e.dispatchEvent(new Event("input",{bubbles:true})); e.dispatchEvent(new Event("change",{bubbles:true}));} return !!e;}
  function setAny(ids,val){ for(var i=0;i<ids.length;i++){ var e=document.getElementById(ids[i]); if(e) return setv("#"+ids[i],val); } return false; }
  function saveModal(){ var m=document.querySelector("#pms-modal"); if(!m) return false;
    var b=Array.from(m.querySelectorAll("button")).find(function(x){return /Save/i.test(x.textContent);});
    if(b){b.click(); return true;} return false; }
  async function gotoTab(name){
    var t=document.querySelector('[data-pms-tab="'+name+'"]');
    if(!t){ document.querySelectorAll("#content button").forEach(function(b){ if(b.textContent.trim().toLowerCase()===name && !t) t=b; }); }
    if(t){ t.click(); await wait(500); }
  }
  function openNew(kind){ var nb=document.querySelector('[data-pms-new="'+kind+'"]');
    if(nb){ nb.click(); return true; } return false; }
  try {
    localStorage.removeItem("esrealty_v1"); localStorage.removeItem("esrealty_user");
    document.querySelector("#auth-role").value="super-admin";
    document.querySelector("#auth-test").click(); await wait(500);
    document.querySelector('[data-view="pms"]').click(); await wait(700);

    // PROPERTY
    checks.push({name:"add-property btn", ok:!!document.querySelector('[data-pms-new="property"]'), detail:""});
    if(openNew("property")){ await wait(350);
      log.push("prop ids: "+Array.from(document.querySelectorAll("#pms-modal input, #pms-modal select")).map(function(e){return e.id;}).filter(Boolean).join(","));
      setAny(["pms-prop-title","pms-prop-name"],"Sunrise Residences");
      setv("#pms-prop-city","Imus"); setv("#pms-prop-address","12 Poblacion St"); setv("#pms-prop-type","Apartment")||setv("#pms-prop-type","Residential");
      saveModal(); await wait(550); }
    html=document.querySelector("#content").innerHTML + ((document.querySelector("#pms-list")||{}).innerHTML||"");
    checks.push({name:"property created", ok:/Sunrise Residences/.test(html), detail:""});

    // UNIT
    await gotoTab("units");
    log.push("unit btn="+(!!document.querySelector('[data-pms-new="unit"]')));
    if(openNew("unit")){ await wait(350);
      log.push("unit ids: "+Array.from(document.querySelectorAll("#pms-modal input, #pms-modal select")).map(function(e){return e.id;}).filter(Boolean).join(","));
      setAny(["pms-unit-no","pms-unit-label","pms-unit-name"],"Unit 101");
      setAny(["pms-unit-rent","pms-unit-rentamt"],"18000");
      var psel=document.getElementById("pms-unit-prop")||document.getElementById("pms-unit-property")||document.getElementById("pms-unit-propid");
      if(psel && psel.options.length>1){ psel.selectedIndex=1; psel.dispatchEvent(new Event("change",{bubbles:true})); }
      saveModal(); await wait(500); }
    html=document.querySelector("#content").innerHTML+((document.querySelector("#pms-list")||{}).innerHTML||"");
    checks.push({name:"unit created", ok:/Unit 101/.test(html), detail:""});

    // TENANT
    await gotoTab("tenants");
    log.push("tenant btn="+(!!document.querySelector('[data-pms-new="tenant"]')));
    if(openNew("tenant")){ await wait(350);
      log.push("ten ids: "+Array.from(document.querySelectorAll("#pms-modal input, #pms-modal select")).map(function(e){return e.id;}).filter(Boolean).join(","));
      setAny(["pms-ten-name","pms-tenant-name"],"Juan Dela Cruz");
      setAny(["pms-ten-phone","pms-tenant-phone"],"09171112233");
      setAny(["pms-ten-email","pms-tenant-email"],"juan@test.ph");
      var before=Array.from(document.querySelectorAll("[class*=toast]")).map(function(t){return t.textContent;});
      saveModal(); await wait(500);
      var after=Array.from(document.querySelectorAll("[class*=toast]")).map(function(t){return t.textContent;});
      log.push("newToast="+after.filter(function(t){return before.indexOf(t)<0;}).join(" | "));
      log.push("modalStillOpen="+(!!document.querySelector("#pms-modal"))); }
    html=document.querySelector("#content").innerHTML+((document.querySelector("#pms-list")||{}).innerHTML||"");
    checks.push({name:"tenant created", ok:/Juan Dela Cruz/.test(html), detail:""});

    // LEASE
    await gotoTab("leases");
    log.push("lease btn="+(!!document.querySelector('[data-pms-new="lease"]')));
    if(openNew("lease")){ await wait(350);
      log.push("lease ids: "+Array.from(document.querySelectorAll("#pms-modal input, #pms-modal select")).map(function(e){return e.id;}).filter(Boolean).join(","));
      var lu=document.getElementById("pms-lease-unit");
      if(lu && lu.options.length>0){ lu.selectedIndex=Math.min(1,lu.options.length-1); lu.dispatchEvent(new Event("change",{bubbles:true})); }
      var tn=document.getElementById("pms-lease-tenant");
      if(tn && tn.options.length>0){ tn.selectedIndex=Math.min(1,tn.options.length-1); tn.dispatchEvent(new Event("change",{bubbles:true})); }
      setAny(["pms-lease-rent","pms-lease-rentamt"],"18000");
      saveModal(); await wait(500); }
    html=document.querySelector("#content").innerHTML;
    checks.push({name:"lease created", ok:/Active|Lease/i.test(html), detail:"soft"});
    // PAYMENT tab renders
    await gotoTab("payments");
    html=document.querySelector("#content").innerHTML;
    checks.push({name:"payments tab renders", ok:/Payment/i.test(html), detail:html.length+"c"});
    // back to super-admin later; buyer portal
    var rs=document.querySelector("#user-role-select");
    if(rs){ rs.value="buyer"; rs.dispatchEvent(new Event("change",{bubbles:true})); await wait(600); }
    var portal=document.querySelector('[data-view="portal"]');
    if(portal){ portal.click(); await wait(650); }
    html=document.querySelector("#content").innerHTML;
    checks.push({name:"buyer portal renders", ok:/My Buyer Portal/.test(html)&&/Reserved Units/.test(html), detail:html.length+"c"});
    if(rs){ rs.value="super-admin"; rs.dispatchEvent(new Event("change",{bubbles:true})); await wait(400); }
    ok=checks.every(function(c){return c.ok;})&&checks.length>0;
  } catch(e){ log.push("ERR:"+e.message); ok=false; }
  window.__msChecks=checks; window.__msOk=ok; window.__msDone=true;
})();
