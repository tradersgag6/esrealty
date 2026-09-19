(function (root, factory) {
  if (typeof module === "object" && module.exports) { module.exports = factory(); }
  else { root.ESREALTY_ATTR = factory(); }
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";

  // Pure attribution + dedupe helpers shared by the CRM (app.js) and the
  // Node-only test suite. Browser/Node compatible and dependency-free.

  var RESP_RE = /create|inquiry|utm|converted|generated/i;

  function digitsOnly(v) {
    return String(v == null ? "" : v).replace(/\D/g, "");
  }

  // Normalize a PH mobile number to plain digits (strips +63/0 prefixes).
  function normPhone(phone) {
    var d = digitsOnly(phone);
    if (!d) return "";
    if (d.indexOf("63") === 0 && d.length > 10) d = d.slice(2);
    while (d.length > 4 && d.charAt(0) === "0") d = d.slice(1);
    return d;
  }

  function normEmail(email) {
    return String(email == null ? "" : email).trim().toLowerCase();
  }

  // Canonical contact keys used for dedupe ("em:" + normalized email and/or
  // "ph:" + normalized phone). A record only dedupes when it carries a key.
  function dedupeKeys(rec) {
    var keys = [];
    var em = normEmail(rec && rec.email);
    if (em) keys.push("em:" + em);
    var ph = normPhone(rec && rec.phone);
    if (ph) keys.push("ph:" + ph);
    return keys;
  }

  function keySig(rec) {
    return dedupeKeys(rec).join("\u0001");
  }

  // True when two records share an email OR a phone number.
  function sharesContact(a, b) {
    var ka = dedupeKeys(a), kb = dedupeKeys(b || {});
    for (var i = 0; i < ka.length; i++) {
      if (kb.indexOf(ka[i]) >= 0) return true;
    }
    return false;
  }

  // First existing lead whose email or phone collides with rec (excluding
  // excludeId, for edits). Returns null when rec carries no contact info.
  function findDuplicateLead(leads, rec, excludeId) {
    leads = leads || [];
    if (!dedupeKeys(rec).length) return null;
    for (var i = 0; i < leads.length; i++) {
      var l = leads[i];
      if (excludeId && l.id === excludeId) continue;
      if (sharesContact(rec, l)) return l;
    }
    return null;
  }

  // Minutes between a lead's createdAt and the first human activity entry
  // (anything that isn't an auto "Lead created"/"inquiry"/"utm" note), or null
  // when there is no response yet.
  function firstResponseMinutes(lead) {
    if (!lead || !lead.createdAt) return null;
    var start = Date.parse(lead.createdAt);
    if (!isFinite(start)) return null;
    var first = null;
    var acts = lead.activity || [];
    for (var i = 0; i < acts.length; i++) {
      var a = acts[i];
      if (!a || !a.date) continue;
      if (RESP_RE.test(String(a.text || ""))) continue;
      var t = Date.parse(a.date);
      if (isFinite(t) && (first === null || t < first)) first = t;
    }
    if (first === null) return null;
    var mins = Math.round((first - start) / 60000);
    return mins >= 0 ? mins : null;
  }

  function isQualified(status) { return status !== "new" && status !== "lost"; }
  function isReservation(status) { return status === "offer" || status === "negotiation"; }

  function num(v) {
    var n = Number(v);
    return isFinite(n) ? n : 0;
  }

  // Per-ad return on investment. Views/inquiries are the channel-reported ad
  // figures (populated by a sync or a manual log); leads/qualified/visits/
  // reservations/closed roll up from CRM leads stamped with that adId. Visits
  // are completed viewings (status "done") matched through opts.visits.
  function adRoi(ads, leads, opts) {
    opts = opts || {};
    var visits = opts.visits || [];
    leads = leads || [];
    return (ads || []).map(function (ad) {
      ad = ad || {};
      var linked = leads.filter(function (l) { return ad.id && l && l.adId === ad.id; });
      var leadIds = {};
      linked.forEach(function (l) { leadIds[l.id] = true; });
      var qualified = linked.filter(function (l) { return isQualified(l.status); }).length;
      var reservations = linked.filter(function (l) { return isReservation(l.status); }).length;
      var closed = linked.filter(function (l) { return l.status === "closed"; }).length;
      var visitsDone = visits.filter(function (v) { return v && leadIds[v.leadId] && v.status === "done"; }).length;
      var views = num(ad.perfViews);
      var inquiries = num(ad.perfInquiries);
      var cost = num(ad.cost != null ? ad.cost : ad.perfCost);
      return {
        id: ad.id || "",
        title: ad.listingTitle || ad.title || "",
        channel: ad.channel || "",
        status: ad.status || "",
        views: views,
        inquiries: inquiries,
        leads: linked.length,
        qualified: qualified,
        visits: visitsDone,
        reservations: reservations,
        closed: closed,
        viewToInquiry: views ? Math.round(100 * inquiries / views) : null,
        inquiryToReservation: inquiries ? Math.round(100 * reservations / inquiries) : null,
        leadToReservation: linked.length ? Math.round(100 * reservations / linked.length) : null,
        cost: cost,
        costPerInquiry: cost && inquiries ? Math.round(cost / inquiries) : null
      };
    });
  }

  // Roll leads up by source. With perAd, leads carrying adId are grouped under
  // their own ad row (key ad:<id>); each ad row remembers its parent source's
  // rollup via sourceTotal/sourceQualified so the funnel shows both. Every row
  // carries total/qualified/reservations/closed/pct and avgFirstResponse.
  function sourceFunnel(leads, opts) {
    opts = opts || {};
    var rows = {};
    (leads || []).forEach(function (l) {
      var source = l.source || "other";
      var adId = opts.perAd ? (l.adId || "") : "";
      var key = adId ? "ad:" + adId : "src:" + source;
      var r = rows[key] = rows[key] || { key: key, source: source, adId: adId, total: 0, qualified: 0, reservations: 0, closed: 0, frSum: 0, frN: 0 };
      r.total++;
      if (isQualified(l.status)) r.qualified++;
      if (isReservation(l.status)) r.reservations++;
      if (l.status === "closed") r.closed++;
      var fr = firstResponseMinutes(l);
      if (fr !== null) { r.frSum += fr; r.frN++; }
    });
    var arr = Object.keys(rows).map(function (k) { return rows[k]; });
    if (opts.perAd) {
      arr.forEach(function (r) {
        if (r.adId) {
          var parent = rows["src:" + r.source];
          r.sourceTotal = parent ? parent.total : r.total;
          r.sourceQualified = parent ? parent.qualified : r.qualified;
        }
      });
    }
    arr.sort(function (a, b) { return b.total - a.total || a.source.localeCompare(b.source); });
    arr.forEach(function (r) {
      r.pct = r.total ? Math.round(100 * r.qualified / r.total) : 0;
      r.avgFirstResponse = r.frN ? Math.round(r.frSum / r.frN) : null;
    });
    return arr;
  }

  // Best live ad for a lead: exact adId match wins, else a live ad on the
  // lead's listing. Returns null when nothing applies.
  function attributedAd(lead, ads) {
    ads = ads || [];
    lead = lead || {};
    if (lead.adId) {
      var exact = null;
      for (var i = 0; i < ads.length; i++) {
        if (ads[i].id === lead.adId && ads[i].status !== "draft") { exact = ads[i]; break; }
      }
      if (exact) return exact;
    }
    if (lead.listingId) {
      for (var j = 0; j < ads.length; j++) {
        if (ads[j].listingId === lead.listingId && ads[j].status !== "draft") return ads[j];
      }
    }
    return null;
  }

  return {
    normPhone: normPhone,
    normEmail: normEmail,
    dedupeKeys: dedupeKeys,
    keySig: keySig,
    sharesContact: sharesContact,
    findDuplicateLead: findDuplicateLead,
    firstResponseMinutes: firstResponseMinutes,
    isQualified: isQualified,
    isReservation: isReservation,
    adRoi: adRoi,
    sourceFunnel: sourceFunnel,
    attributedAd: attributedAd
  };
});