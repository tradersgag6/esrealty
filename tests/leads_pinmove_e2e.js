(async function () {
  var log = [], checks = [], ok = true;
  var wait = ms => new Promise(r => setTimeout(r, ms));
  var click = s => { var e = document.querySelector(s); if (e) e.click(); return !!e; };
  var setv = (s, v) => { var e = document.querySelector(s); if (e) { e.value = v; e.dispatchEvent(new Event("input", { bubbles: true })); } return !!e; };
  var vals = () => ({
    region: (document.querySelector("#wz-region")||{}).value || "",
    prov: (document.querySelector("#wz-province")||{}).value || "",
    city: (document.querySelector("#wz-city")||{}).value || "",
    brgy: ((document.querySelector('[data-g="property.barangay"]')||{}).value) || "",
    addr: (((document.querySelector('[data-g="property.address"]')||{}).value)||"").slice(0,60),
    coords: ((document.querySelector("#wz-map-coords")||{}).textContent||"").trim()
  });
  window.__msLog = log;
  try {
    localStorage.removeItem("esrealty_v1"); localStorage.removeItem("esrealty_user");
    var role = document.querySelector("#auth-role"); if (role) role.value = "super-admin";
    click("#auth-test"); await wait(500);
    click("#tb-new-deal"); await wait(400);
    click('[data-step="2"]'); await wait(3000);
    async function moveTo(place) {
      setv("#wz-map-q", place); click("#wz-map-btn");
      for (var i = 0; i < 12; i++) { await wait(1500); var c = vals().coords; if (/—|-\s/.test(c) && !/Resolving/.test(c)) break; }
      await wait(1200); return vals();
    }
    var vB = await moveTo("Bauan, Batangas");
    log.push("BAUAN: " + JSON.stringify(vB));
    checks.push({ name: "bauan region IV-A", ok: /IV-A|CALABARZON/i.test(vB.region), detail: vB.region });
    checks.push({ name: "bauan province", ok: vB.prov === "Batangas", detail: vB.prov });
    checks.push({ name: "bauan city", ok: /bauan$/i.test(vB.city), detail: vB.city });
    var vQ = await moveTo("Quezon Memorial Circle, Quezon City");
    log.push("QC: " + JSON.stringify({r:vQ.region,p:vQ.prov,c:vQ.city,b:vQ.brgy}));
    checks.push({ name: "qc chain", ok: vQ.region==="NCR" && vQ.prov==="Metro Manila" && /quezon/i.test(vQ.city), detail: vQ.region+"/"+vQ.prov+"/"+vQ.city });
    var vC = await moveTo("Cebu Business Park, Cebu City");
    log.push("CEBU: " + JSON.stringify({r:vC.region,p:vC.prov,c:vC.city,b:vC.brgy}));
    checks.push({ name: "cebu chain", ok: /VII/i.test(vC.region) && vC.prov==="Cebu" && /cebu/i.test(vC.city), detail: vC.region+"/"+vC.prov+"/"+vC.city });
    ok = checks.every(c => c.ok);
  } catch (e) { log.push("ERR: " + (e && e.message)); ok = false; }
  window.__msChecks = checks; window.__msOk = ok; window.__msDone = true;
})();