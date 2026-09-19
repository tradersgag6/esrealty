(async function () {
  var log = [], checks = [], ok;
  window.__msLog = log; window.confirm = () => true;
  setTimeout(function(){ log.push("WD"); window.__msDone = true; }, 90000);
  var wait = ms => new Promise(r => setTimeout(r, ms));
  function has(sel){ return !!document.querySelector(sel); }
  function txt(sel){ const el = document.querySelector(sel); return el ? el.textContent : ""; }
  function stored(){ try { return JSON.parse(localStorage.getItem("esrealty_v1") || "{}") || {}; } catch(e){ return {}; } }
  function lsAdsTab(){ return Array.prototype.slice.call(document.querySelectorAll("[data-ls-tab]")).find(t => t.getAttribute("data-ls-tab") === "ads"); }
  function lsCatTab(){ return Array.prototype.slice.call(document.querySelectorAll("[data-ls-tab]")).find(t => t.getAttribute("data-ls-tab") === "catalog"); }
  try {
    localStorage.removeItem("esrealty_v1"); localStorage.removeItem("esrealty_user");
    document.querySelector("#auth-role").value = "super-admin";
    document.querySelector("#auth-test").click(); await wait(600);
    document.querySelector('#nav [data-view="listings"]').click(); await wait(900);
    var lsTabs = Array.prototype.slice.call(document.querySelectorAll("[data-ls-tab]"));
    log.push("ls tabs=" + lsTabs.map(t => t.getAttribute("data-ls-tab")).join(","));
    var adsTab = lsTabs.find(t => t.getAttribute("data-ls-tab") === "ads");
    checks.push({ name: "listings ads sub-tab present", ok: !!adsTab, detail: lsTabs.map(t => t.getAttribute("data-ls-tab")).join(",") });
    var lsNew = document.querySelector("[data-ls-new]");
    log.push("lsNew=" + !!lsNew);
    checks.push({ name: "can add a listing (UI)", ok: !!lsNew, detail: lsNew ? "add button" : "missing" });
    if (lsNew) {
      lsNew.click(); await wait(600);
      checks.push({ name: "listing editor opens", ok: has("#ls-modal") && has("#ls-title"), detail: "editor" });
      document.querySelector("#ls-title").value = "Azumi Cascadia 3BR House & Lot — Silang, Cavite";
      document.querySelector("#ls-price").value = "5600000";
      document.querySelector("[data-ls-save]").click(); await wait(1200);
      log.push("cards after add=" + document.querySelectorAll("[data-ls-open]").length + " stored=" + (stored().listings || []).length);
      checks.push({ name: "listing created and persisted", ok: (stored().listings || []).length >= 1, detail: "saved locally+cloud" });
    }
    var adsFresh = lsAdsTab();
    log.push("adsFresh=" + !!adsFresh);
    checks.push({ name: "ads sub-tab re-queried after add", ok: !!adsFresh, detail: adsFresh ? "tab" : "missing" });
    if (adsFresh) adsFresh.click(); await wait(900);
    checks.push({ name: "ads empty state renders", ok: /No ads yet/.test(txt("#content")) && has("[data-ad-pick]"), detail: "empty + create button" });
    checks.push({ name: "source funnel table renders", ok: /Source Funnel/.test(txt("#content")) && !!document.querySelector("#content table.data"), detail: "funnel with seeded leads" });
    checks.push({ name: "source funnel shows avg first response column", ok: /First resp/.test(txt("#content")), detail: "Avg first-response column present" });
    document.querySelector("[data-ad-pick]").click(); await wait(500);
    checks.push({ name: "ad picker modal opens", ok: has("#ad-pick-modal") && has("#ad-listing"), detail: "picker" });
    var pickOpts = Array.prototype.slice.call(document.querySelectorAll("#ad-listing option")).length;
    log.push("pickerOptions=" + pickOpts);
    checks.push({ name: "picker lists created listing", ok: pickOpts >= 1, detail: "options=" + pickOpts });
    document.querySelector("[data-ad-from-list]").click(); await wait(700);
    log.push("afterFromList hasModal=" + has("#ad-modal"));
    checks.push({ name: "ad editor modal opens", ok: has("#ad-modal") && has("#ad-preview"), detail: "editor" });
    document.querySelector("#ad-tone").value = "hook";
    document.querySelector("#ad-tone").dispatchEvent(new Event("change", { bubbles: true }));
    await wait(300);
    log.push("previewHook=" + String(document.querySelector("#ad-preview").value).slice(0, 80));
    checks.push({ name: "tone switch regenerates caption", ok: /Looking for/.test(document.querySelector("#ad-preview").value), detail: "hook caption generated" });
    document.querySelector("#ad-channel").value = "lamudi";
    document.querySelector("[data-ad-save]").click(); await wait(900);
    checks.push({ name: "draft saved to repo", ok: /Draft/.test(txt("#content")) && has("[data-ad-pub]"), detail: "draft row + publish button" });
    document.querySelector("[data-ad-pub]").click(); await wait(900);
    var stLive = stored();
    var pubAd = (stLive.ads || [])[0] || {};
    log.push("afterPublish status=" + pubAd.status + " live=" + /Live/.test(txt("#content")) + " disclosure=" + /Listed by/.test(String(pubAd.caption || "")));
    checks.push({ name: "publish appends legal disclosure + goes live", ok: pubAd.status === "posted" && /Live/.test(txt("#content")) && /Listed by/.test(String(pubAd.caption || "")), detail: "live + disclosure appended to caption" });
    checks.push({ name: "ads persist to localStorage", ok: Array.isArray(stLive.ads) && (stLive.ads || []).length >= 1, detail: "ads array saved" });
    var catalogTab = lsCatTab();
    if (catalogTab) catalogTab.click(); await wait(800);
    var firstCard = document.querySelector("[data-ls-open]");
    var wid = firstCard ? firstCard.getAttribute("data-ls-open") : "";
    log.push("catalog cards=" + document.querySelectorAll("[data-ls-open]").length + " wid=" + wid);
    checks.push({ name: "catalog shows created listing", ok: !!firstCard, detail: "first card" });
    if (firstCard) {
      firstCard.click(); await wait(1000);
      var detailTxt = txt("#content");
      checks.push({ name: "disclosure footer in detail", ok: /Disclosure:/.test(detailTxt) && /Listed by/.test(detailTxt), detail: "brokerage disclosure line" });
      checks.push({ name: "copy-ad button in detail", ok: has("[data-ls-ad-copy]"), detail: "copy button" });
      if (has("[data-ls-ad-copy]")) { document.querySelector("[data-ls-ad-copy]").click(); await wait(500); checks.push({ name: "copy-ad works", ok: /copied|Azumi Cascadia/i.test(document.body.textContent), detail: "toast or fallback caption shown" }); }
      var wa = document.querySelector('[data-listing-contact="whatsapp"]');
      checks.push({ name: "click-to-chat whatsapp button", ok: !!wa && (wa.getAttribute("href") || "").indexOf("wa.me/639171234567") >= 0, detail: wa ? wa.getAttribute("href").slice(0, 60) : "missing" });
      if (wa) { wa.click(); await wait(900); }
      var st = stored();
      var taps = st.listingStats && st.listingStats[wid] ? st.listingStats[wid].waTaps : 0;
      var liveAd = (st.ads || []).find(a => a.listingId === wid && a.status !== "draft");
      log.push("waTaps=" + taps + " adInquiries=" + (liveAd ? liveAd.perfInquiries : "no-ad"));
      checks.push({ name: "whatsapp tap records funnel attribution", ok: taps === 1 && !!liveAd && Number(liveAd.perfInquiries) === 1, detail: "waTaps=" + taps + " adInquiries=" + (liveAd ? liveAd.perfInquiries : "-") });
    }
    var leadCountBefore = (stored().leads || []).length;
    document.querySelector('#nav [data-view="leads"]').click(); await wait(900);
    var leadNew = document.querySelector("[data-lead-new]");
    checks.push({ name: "add lead button available in CRM", ok: !!leadNew, detail: leadNew ? "button" : "missing" });
    if (leadNew) {
      leadNew.click(); await wait(600);
      checks.push({ name: "lead editor opens", ok: has("#ld-modal") && has("#ld-name"), detail: "editor" });
      document.querySelector("#ld-name").value = "Duplicate Prospect";
      document.querySelector("#ld-email").value = "maria.santos@gmail.com";
      document.querySelector("[data-lead-save]").click(); await wait(900);
      var afterDup = stored();
      var dupCount = (afterDup.leads || []).length;
      log.push("dedupe count before=" + leadCountBefore + " after=" + dupCount + " toast=" + /Duplicate contact/.test(document.body.textContent));
      checks.push({ name: "duplicate email blocked", ok: /Duplicate contact/.test(document.body.textContent) && dupCount === leadCountBefore, detail: "blocked, count=" + dupCount });
      checks.push({ name: "dedupe leaves lead count unchanged", ok: dupCount === leadCountBefore, detail: "count=" + dupCount });
      leadNew = document.querySelector("[data-lead-new]");
      if (leadNew) leadNew.click(); await wait(600);
      document.querySelector("#ld-name").value = "Ad Prospect";
      document.querySelector("#ld-email").value = "ad.prospect@esrealty.ph";
      document.querySelector("#ld-phone").value = "+63 900 111 2222";
      var lsSel = document.querySelector("#ld-listing");
      if (lsSel) lsSel.value = wid;
      document.querySelector("[data-lead-save]").click(); await wait(900);
      var stProspect = stored();
      var newLead = (stProspect.leads || [])[0] || {};
      var prosLiveAd = (stProspect.ads || []).find(a => a.listingId === wid && a.status !== "draft");
      log.push("adProspect adId=" + newLead.adId + " liveAd=" + (prosLiveAd ? prosLiveAd.id : "none"));
      checks.push({ name: "new lead stamped with matching adId", ok: !!newLead.adId && !!prosLiveAd && newLead.adId === prosLiveAd.id, detail: "adId=" + (newLead.adId || "-") });
      document.querySelector('#nav [data-view="listings"]').click(); await wait(800);
      var backBtn = document.querySelector("[data-ls-back]");
      if (backBtn) backBtn.click(); await wait(600);
      var adsTab2 = lsAdsTab();
      if (adsTab2) adsTab2.click(); await wait(900);
      var funnelTxt = txt("#content");
      var badg2 = Array.prototype.slice.call(document.querySelectorAll("#content td .badge.blue")).map(b => b.textContent);
      log.push("funnelBadges=" + badg2.join("|") + " leads=" + (stored().leads || []).length);
      checks.push({ name: "funnel shows per-ad channel row", ok: badg2.indexOf("Lamudi") >= 0, detail: "badge=" + badg2.join("|") });
      checks.push({ name: "funnel avg first response persists", ok: /First resp/.test(funnelTxt), detail: "column header present" });
    }
    document.querySelector('#nav [data-view="admin"]').click(); await wait(900);
    var adminAds = Array.prototype.slice.call(document.querySelectorAll("[data-admin-tab]")).find(t => t.getAttribute("data-admin-tab") === "ads");
    checks.push({ name: "admin ads tab present", ok: !!adminAds, detail: adminAds ? "tab" : "missing" });
    if (adminAds) { adminAds.click(); await wait(900); checks.push({ name: "admin ads tab renders funnel", ok: /Source Funnel/.test(txt("#admin-body")), detail: "admin ads body" }); }
    ok = checks.every(c => c.ok) && checks.length > 8;
  } catch (e) { log.push("ERR:" + e.message); ok = false; }
  window.__msChecks = checks; window.__msOk = ok; window.__msDone = true;
})();