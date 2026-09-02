(function (root, factory) {
  if (typeof module === "object" && module.exports) { module.exports = factory(); }
  else { root.ESPOR = factory(); }
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";

  // Pure cash-ledger + Portfolio accounting rules for ES Realty.
  // Dependency-free and browser/Node compatible so backend rules, fixtures,
  // and the upcoming Portfolio UI share one source of truth.

  var DIRECTIONS = ["in", "out"];
  var PURPOSES = ["project_selling", "construction", "others"];
  var STATUSES = ["draft", "pending", "posted", "voided", "reversed"];

  function toAmount(v) {
    var n = Number(v);
    if (!(n > 0)) return 0;
    return Math.round(n * 100) / 100;
  }

  function cashBalance(opening, entries) {
    var bal = Number(opening) || 0;
    for (var i = 0; i < (entries || []).length; i++) {
      var e = entries[i];
      if (!e || e.status !== "posted") continue;
      if (e.direction === "in") bal += toAmount(e.amount);
      else if (e.direction === "out") bal -= toAmount(e.amount);
    }
    return Math.round(bal * 100) / 100;
  }

  function linkActive(entries, type, id) {
    if (!type || !id) return false;
    var reversed = {};
    for (var i = 0; i < (entries || []).length; i++) {
      var e = entries[i];
      if (e && e.reversalOf) reversed[e.reversalOf] = true;
    }
    for (var j = 0; j < (entries || []).length; j++) {
      var x = entries[j];
      if (!x || x.status !== "posted" || x.reversalOf) continue;
      if (x.link && x.link.type === type && String(x.link.id) === String(id) && !reversed[x.id]) return true;
    }
    return false;
  }

  function validateCashEntry(raw) {
    var errs = [];
    var amount = toAmount(raw && raw.amount);
    if (!(amount > 0)) errs.push("amount must be a positive number");
    if (!(raw && raw.accountId)) errs.push("accountId is required");
    if (raw && raw.status != null && STATUSES.indexOf(raw.status) < 0) errs.push("status must be one of draft, pending, posted, voided, reversed");
    if (!raw || DIRECTIONS.indexOf(raw.direction) < 0) errs.push("direction must be 'in' or 'out'");
    var purpose = raw && raw.purpose;
    var link = (raw && raw.link) || {};
    if (raw && raw.direction === "out") {
      if (PURPOSES.indexOf(purpose) < 0) {
        errs.push("cash out requires exactly one purpose: project_selling, construction, or others");
      } else {
        if (purpose === "project_selling" && !(link.id && ["deal", "project", "payment"].indexOf(link.type) >= 0)) {
          errs.push("project_selling requires a linked deal/project/payment id");
        }
        if (purpose === "construction" && !(link.id && (link.type === "project" || link.type === "invoice"))) {
          errs.push("construction requires a linked construction project or invoice id");
        }
        if (purpose === "others" && !(String(raw.subcategory || "").trim() && String(raw.description || "").trim())) {
          errs.push("others requires a subcategory and description");
        }
      }
    } else if (purpose) {
      errs.push("purpose is only allowed on cash out");
    }
    if (errs.length) return { valid: false, errors: errs };
    return {
      valid: true,
      entry: {
        id: raw.id || null,
        accountId: raw.accountId,
        direction: raw.direction,
        amount: amount,
        purpose: raw.direction === "out" ? purpose : "",
        subcategory: raw.subcategory || "",
        description: raw.description || "",
        link: raw.direction === "out" ? link : null,
        proof: raw.proof || null,
        ref: raw.ref || "",
        status: raw.status || "posted",
        idempotencyKey: raw.idempotencyKey || "",
        createdAt: raw.createdAt || new Date().toISOString(),
        entryDate: String(raw.entryDate || raw.entry_date || "").slice(0, 10)
      }
    };
  }

  function post(raw, ledger) {
    var l = ledger || {};
    var entries = l.entries || [];
    var v = validateCashEntry(raw);
    if (!v.valid) return { ok: false, errors: v.errors };
    if (v.entry.idempotencyKey) {
      for (var i = 0; i < entries.length; i++) {
        if (entries[i].idempotencyKey === v.entry.idempotencyKey) {
          return { ok: false, dup: true, errors: ["duplicate idempotency key " + v.entry.idempotencyKey] };
        }
      }
    }
    if (v.entry.status === "posted" && v.entry.link && v.entry.link.id) {
      if (linkActive(entries, v.entry.link.type, v.entry.link.id)) {
        return { ok: false, errors: ["link already has an active post: " + v.entry.link.type + ":" + v.entry.link.id] };
      }
    }
    if (v.entry.direction === "out" && v.entry.status === "posted" && cashBalance(l.opening || 0, entries) < v.entry.amount) {
      return { ok: false, insufficient: true, errors: ["cash out exceeds current balance"] };
    }
    var maxId = 0;
    for (var p = 0; p < entries.length; p++) {
      var mm = /^E(\d+)$/.exec(String((entries[p] && entries[p].id) || ""));
      if (mm) maxId = Math.max(maxId, parseInt(mm[1], 10));
    }
    var id = v.entry.id || ("E" + (maxId + 1));
    var entry = Object.assign({}, v.entry, { id: id });
    entries.push(entry);
    return { ok: true, entry: entry, balance: cashBalance(l.opening || 0, entries) };
  }

  function reverse(ledger, id, by) {
    var l = ledger || {};
    var entries = l.entries || [];
    var target = null;
    for (var i = 0; i < entries.length; i++) {
      if (entries[i].id === id) { target = entries[i]; break; }
    }
    if (!target) return { ok: false, errors: ["entry not found"] };
    if (target.reversalOf) return { ok: false, errors: ["cannot reverse a reversal"] };
    if (target.status !== "posted") return { ok: false, errors: ["only posted entries are reversible"] };
    for (var j = 0; j < entries.length; j++) {
      if (entries[j].reversalOf === id) return { ok: false, errors: ["entry already reversed"] };
    }
    var rev = {
      id: "R" + id,
      reversalOf: id,
      direction: target.direction === "in" ? "out" : "in",
      amount: target.amount,
      purpose: target.purpose,
      accountId: target.accountId,
      link: null,
      proof: null,
      ref: "reversal",
      status: "posted",
      createdAt: new Date().toISOString(),
      reversedBy: by || ""
    };
    entries.push(rev);
    return { ok: true, reversal: rev, balance: cashBalance(l.opening || 0, entries) };
  }

  function voidEntry(ledger, id, by) {
    var l = ledger || {};
    var entries = l.entries || [];
    var target = null;
    for (var i = 0; i < entries.length; i++) {
      if (entries[i].id === id) { target = entries[i]; break; }
    }
    if (!target) return { ok: false, errors: ["entry not found"] };
    if (target.reversalOf) return { ok: false, errors: ["cannot void a reversal"] };
    if (target.status === "posted") return { ok: false, reversalRequired: true, errors: ["posted entries must be reversed, not voided"] };
    if (target.status === "voided") return { ok: false, errors: ["entry already voided"] };
    target.status = "voided";
    target.voidedBy = by || "";
    target.voidedAt = new Date().toISOString();
    return { ok: true, entry: target };
  }

  function constructionSummary(c) {
    c = c || {};
    var planned = Number(c.planned) || 0;
    var committed = Number(c.committed) || 0;
    var paid = Number(c.paid) || 0;
    var contingency = Number(c.contingency) || 0;
    var changeOrders = Number(c.changeOrders) || 0;
    var retentionRate = Number(c.retentionRate) || 0;
    var progress = Number(c.progress) || 0;
    var allocation = c.allocation || "equal";
    var retention = committed > 0 ? Math.round((committed * retentionRate / 100) * 100) / 100 : 0;
    var earned = progress > 0 ? Math.round((planned * progress / 100) * 1000) / 1000 : 0;
    var overbudget = committed > planned;
    var overpaid = progress > 0 && paid > earned;
    var st = committed === 0 ? "planned" : paid >= committed ? "paid" : "in-progress";
    if (overbudget && st !== "planned") st = "over-budget";
    return {
      planned: planned,
      committed: committed,
      paid: paid,
      contingency: contingency,
      changeOrders: changeOrders,
      retentionRate: retentionRate,
      retention: retention,
      allocation: allocation,
      progress: progress,
      earned: earned,
      remainingToCommit: Math.max(0, planned - committed),
      variance: planned - committed,
      forecast: Math.round((committed + contingency + changeOrders) * 100) / 100,
      netPayable: Math.round(Math.max(0, committed - retention) * 100) / 100,
      paidRate: committed > 0 ? Math.min(100, Math.round((paid / committed) * 1000) / 10) : 0,
      overbudget: overbudget,
      overpaid: overpaid,
      status: st
    };
  }

  function constructionProjectSummary(c) {
    c = c || {};
    var phases = Array.isArray(c.phases) ? c.phases : [];
    var planned = (function(){ var s=0; for(var i=0;i<phases.length;i++) s+=Number(phases[i].planned_budget||phases[i].planned||0); return s; })();
    var committed = (function(){ var s=0; for(var i=0;i<phases.length;i++) s+=Number(phases[i].committed||0); return s; })();
    var paid = (function(){ var s=0; for(var i=0;i<phases.length;i++) s+=Number(phases[i].paid||0); return s; })();
    var progress = (function(){ var d=0,n=0; for(var i=0;i<phases.length;i++){ if(!isNaN(Number(phases[i].percent_complete))){ d+=Number(phases[i].percent_complete); n++; } } return n? d/n : 0; })();
    var summary = constructionSummary({ planned: planned, committed: committed, paid: paid, contingency: c.contingency, changeOrders: c.changeOrders, retentionRate: c.retentionRate, progress: progress, allocation: c.allocation });
    summary.phases = phases.length;
    summary.contractValue = Number(c.contractValue) || 0;
    return summary;
  }

  function presellRollup(p) {
    p = p || {};
    var units = Number(p.units) || 0;
    var sold = Number(p.sold) || 0;
    var collections = Number(p.collections) || 0;
    var target = Number(p.target) || 0;
    return {
      units: units,
      sold: sold,
      available: Math.max(0, units - sold),
      salesRate: units > 0 ? Math.min(100, Math.round((sold / units) * 1000) / 10) : 0,
      collections: collections,
      collectionRate: target > 0 ? Math.min(100, Math.round((collections / target) * 1000) / 10) : 0
    };
  }

  function reconcile(ledger, statementBalance) {
    var stmt = Math.round((Number(statementBalance) || 0) * 100) / 100;
    var bal = cashBalance((ledger && ledger.opening) || 0, (ledger && ledger.entries) || []);
    var diff = Math.round((bal - stmt) * 100) / 100;
    return {
      ledgerBalance: bal,
      statementBalance: stmt,
      difference: diff,
      status: diff === 0 ? "reconciled" : "unreconciled"
    };
  }

  // ── Financial proofs (images first, PDF allowed) ─────────────────
  var PROOF_CATEGORIES = ["receipt", "deposit_slip", "transfer_confirmation", "contract", "invoice", "other"];
  var PROOF_MAX_BYTES = 2 * 1024 * 1024;
  var PROOF_MIME_EXT = {
    "image/jpeg": [".jpg", ".jpeg"],
    "image/png": [".png"],
    "image/gif": [".gif"],
    "image/webp": [".webp"],
    "application/pdf": [".pdf"]
  };

  function proofExtension(filename) {
    var m = /\.([a-z0-9]+)$/i.exec(String(filename || "").trim());
    return m ? ("." + m[1].toLowerCase()) : "";
  }

  function validateProofFile(raw) {
    var errs = [];
    raw = raw || {};
    var filename = String(raw.filename || "").trim();
    var mimetype = String(raw.mimetype || "").toLowerCase();
    var size = Number(raw.size);
    var category = String(raw.category || "").trim();
    if (!filename) errs.push("filename is required");
    if (!PROOF_MIME_EXT[mimetype]) {
      errs.push("unsupported file type (" + (mimetype || "none") + "); jpg/png/gif/webp/pdf only");
    }
    if (!(size > 0)) {
      errs.push("file size must be a positive number of bytes");
    } else if (size > PROOF_MAX_BYTES) {
      errs.push("file exceeds the 2MB maximum");
    }
    if (category && PROOF_CATEGORIES.indexOf(category) < 0) {
      errs.push("category must be one of " + PROOF_CATEGORIES.join(", "));
    }
    var ext = proofExtension(filename);
    if (mimetype && PROOF_MIME_EXT[mimetype] && ext && PROOF_MIME_EXT[mimetype].indexOf(ext) < 0) {
      errs.push("extension " + ext + " does not match " + mimetype);
    }
    if (errs.length) return { valid: false, errors: errs };
    return {
      valid: true,
      file: { filename: filename, ext: ext, mimetype: mimetype, size: Math.round(size), category: category || "other" }
    };
  }

  function proofChecksum(input) {
    // FNV-1a 32-bit over bytes (Buffer) or utf8 code units (string).
    // Deterministic and dependency-free so browser proofs and Node fixtures agree.
    var h = 0x811c9dc5;
    var hasBuffer = typeof Buffer !== "undefined" && typeof Buffer.isBuffer === "function";
    var bytes = hasBuffer && Buffer.isBuffer(input) ? input : null;
    var s, len, i;
    if (bytes) {
      len = bytes.length;
      for (i = 0; i < len; i++) {
        h ^= bytes[i];
        h = Math.imul(h, 0x01000193);
      }
    } else {
      s = String(input == null ? "" : input);
      len = s.length;
      for (i = 0; i < len; i++) {
        h ^= s.charCodeAt(i) & 0xff;
        h = Math.imul(h, 0x01000193);
      }
    }
    h = h >>> 0;
    return ("0000000" + h.toString(16)).slice(-8);
  }

  function proofMetadata(raw) {
    raw = raw || {};
    var size = Math.round(Number(raw.size) || 0);
    return {
      filename: String(raw.filename || "").trim(),
      mimetype: String(raw.mimetype || "").toLowerCase(),
      size: size,
      checksum: String(raw.checksum || ""),
      category: PROOF_CATEGORIES.indexOf(raw.category) >= 0 ? raw.category : "other",
      uploader: String(raw.uploader || ""),
      at: String(raw.at || ""),
      storagePath: String(raw.storagePath || ""),
      mode: raw.mode === "supabase" ? "supabase" : "local"
    };
  }

  // ── Overview rollup ──────────────────────────────────────────────
  // Separates Actual, Posted, Committed, Projected, Forecast, and
  // Scheduled amounts so every KPI card carries exactly one basis and
  // never mixes cash and accrual/projection numbers on one figure.
  // Callers normalize deal-level numbers (market value, acquisition,
  // invested, loans, realized/projected profit) themselves so this
  // module stays dependency-free.
  function overviewRollup(input) {
    input = input || {};
    var accounts = Array.isArray(input.accounts) ? input.accounts : [];
    var entries = Array.isArray(input.entries) ? input.entries : [];
    var projects = Array.isArray(input.projects) ? input.projects : [];
    var phases = Array.isArray(input.phases) ? input.phases : [];
    var changes = Array.isArray(input.changeOrders) ? input.changeOrders : [];
    var units = Array.isArray(input.presellUnits) ? input.presellUnits : [];
    var payments = Array.isArray(input.presellPayments) ? input.presellPayments : [];
    var deals = Array.isArray(input.deals) ? input.deals : [];
    var today = String(input.today || "").slice(0, 10);

    // Cash — Actual/Posted only. Draft/pending/voided never touch these.
    var perAccount = [];
    for (var ai = 0; ai < accounts.length; ai++) {
      var acc = accounts[ai];
      var mine = [];
      for (var ei = 0; ei < entries.length; ei++) {
        if (entries[ei] && entries[ei].accountId === acc.id) mine.push(entries[ei]);
      }
      perAccount.push({
        id: acc.id,
        label: acc.label || String(acc.id),
        type: acc.account_type || "cash",
        opening: Math.round((Number(acc.opening_balance) || 0) * 100) / 100,
        balance: cashBalance(acc.opening_balance || 0, mine)
      });
    }
    var cashIn = 0, cashOut = 0, postedCount = 0;
    for (var e2 = 0; e2 < entries.length; e2++) {
      var en = entries[e2];
      if (en && en.status === "posted") {
        postedCount++;
        if (en.direction === "in") cashIn += toAmount(en.amount);
        else if (en.direction === "out") cashOut += toAmount(en.amount);
      }
    }
    var totalCash = 0;
    for (var b = 0; b < perAccount.length; b++) totalCash += perAccount[b].balance;

    // Deals — Projected market value + Actual cost/debt + Realized/Projected profit.
    var portfolioValue = 0, acquisitionCost = 0, investedCapital = 0, debt = 0;
    var realizedProfit = 0, projectedProfit = 0, dealCount = 0;
    for (var d = 0; d < deals.length; d++) {
      var deal = deals[d] || {};
      dealCount++;
      portfolioValue += Number(deal.marketValue) || 0;
      acquisitionCost += Number(deal.acquisition) || 0;
      investedCapital += Number(deal.invested) || 0;
      debt += Number(deal.loan) || 0;
      realizedProfit += Number(deal.realizedProfit) || 0;
      projectedProfit += Number(deal.projectedProfit) || 0;
    }
    var netWorth = Math.round((portfolioValue - debt) * 100) / 100;

    // Construction — Committed/Planned/Paid + Forecast incl contingency &
    // change orders. Payables = unpaid committed work (retention held back).
    var planned = 0, committed = 0, paid = 0, contingency = 0, changeOrders = 0, retWeighted = 0;
    for (var p = 0; p < projects.length; p++) {
      var proj = projects[p];
      var chg = 0;
      for (var c1 = 0; c1 < changes.length; c1++) {
        if (changes[c1] && changes[c1].project_id === proj.id) chg += Number(changes[c1].amount) || 0;
      }
      var projPhases = [];
      for (var ph = 0; ph < phases.length; ph++) {
        if (phases[ph] && phases[ph].project_id === proj.id) projPhases.push(phases[ph]);
      }
      var sub = constructionProjectSummary({ contingency: proj.contingency, retentionRate: proj.retention_rate, changeOrders: chg, phases: projPhases });
      planned += sub.planned;
      committed += sub.committed;
      paid += sub.paid;
      contingency += sub.contingency;
      changeOrders += sub.changeOrders;
      retWeighted += (Number(sub.retentionRate) || 0) * sub.committed;
    }
    var retentionRate = committed > 0 ? Math.round(100 * (retWeighted / committed)) / 100 : 0;
    var retention = committed > 0 ? Math.round((committed * retentionRate / 100) * 100) / 100 : 0;
    var forecast = Math.round((committed + contingency + changeOrders) * 100) / 100;
    var payables = Math.round(Math.max(0, committed - paid) * 100) / 100;

    // Presell — Projected booked revenue, Actual collections, Receivables.
    var bookedRevenue = 0, soldCount = 0;
    for (var u = 0; u < units.length; u++) {
      var unit = units[u];
      if (unit && (unit.status === "reserved" || unit.status === "sold")) {
        soldCount++;
        bookedRevenue += Number(unit.price) || 0;
      }
    }
    var collected = 0, receivables = 0, dueTotal = 0, overdueTotal = 0;
    var upcoming = [], overdue = [];
    for (var py = 0; py < payments.length; py++) {
      var pay = payments[py] || {};
      var amount = toAmount(pay.amount);
      if (pay.status === "paid") { collected += amount; continue; }
      receivables += amount;
      var due = String(pay.due_date || "").slice(0, 10);
      var item = { id: pay.id, label: String(pay.label || "payment"), dueDate: due, amount: amount, unitId: String(pay.unit_id || "") };
      if (due && today && due < today) { overdueTotal += amount; overdue.push(item); }
      else if (due) { dueTotal += amount; upcoming.push(item); }
    }
    upcoming.sort(function (x, y) { return String(x.dueDate).localeCompare(String(y.dueDate)); });
    overdue.sort(function (x, y) { return String(x.dueDate).localeCompare(String(y.dueDate)); });

    return {
      cash: {
        accounts: perAccount,
        total: Math.round(totalCash * 100) / 100,
        cashIn: Math.round(cashIn * 100) / 100,
        cashOut: Math.round(cashOut * 100) / 100,
        netCash: Math.round((cashIn - cashOut) * 100) / 100,
        postedCount: postedCount
      },
      deals: {
        count: dealCount,
        portfolioValue: Math.round(portfolioValue * 100) / 100,
        acquisitionCost: Math.round(acquisitionCost * 100) / 100,
        investedCapital: Math.round(investedCapital * 100) / 100,
        debt: Math.round(debt * 100) / 100,
        netWorth: netWorth,
        realizedProfit: Math.round(realizedProfit * 100) / 100,
        projectedProfit: Math.round(projectedProfit * 100) / 100
      },
      construction: {
        projects: projects.length,
        phases: phases.length,
        planned: Math.round(planned * 100) / 100,
        committed: Math.round(committed * 100) / 100,
        paid: Math.round(paid * 100) / 100,
        contingency: Math.round(contingency * 100) / 100,
        changeOrders: changeOrders,
        retentionRate: retentionRate,
        retention: retention,
        forecast: forecast,
        variance: Math.round((planned - committed) * 100) / 100,
        payables: payables
      },
      presell: {
        units: units.length,
        sold: soldCount,
        bookedRevenue: Math.round(bookedRevenue * 100) / 100,
        collected: Math.round(collected * 100) / 100,
        receivables: Math.round(receivables * 100) / 100,
        dueTotal: dueTotal,
        overdueTotal: overdueTotal,
        upcomingCount: upcoming.length,
        overdueCount: overdue.length
      },
      due: { upcoming: upcoming, overdue: overdue }
    };
  }

  // ── Legacy migration/backfill ──────────────────────────────────
  // Folds PAID pre-selling collections and legacy cash transactions into
  // the cash ledger exactly once. Dedup is driven by idempotency keys and
  // the link-active guard (pure + flat linked_* payment fields), so
  // re-running the migration never double counts an already-booked amount.
  function migrateLegacyCash(input) {
    input = input || {};
    var ledger = input.ledger || {};
    if (!ledger.entries) ledger.entries = [];
    var defaultAccountId = input.defaultAccountId || "";
    var presellPayments = Array.isArray(input.presellPayments) ? input.presellPayments : [];
    var transactions = Array.isArray(input.transactions) ? input.transactions : [];
    var added = [], skipped = [];

    var keys = {};
    var i;
    for (i = 0; i < ledger.entries.length; i++) {
      var k = (ledger.entries[i] || {}).idempotencyKey;
      if (k) keys[k] = true;
    }

    function keyFor(prefix, id, fallback) {
      return "migrated:" + prefix + ":" + String(id || fallback).replace(/[^A-Za-z0-9_-]/g, "_");
    }

    function presellLinked(id) {
      var s = String(id || "");
      for (var n = 0; n < ledger.entries.length; n++) {
        var en = ledger.entries[n];
        if (!en || en.status !== "posted" || en.reversalOf) continue;
        if (String(en.linked_presell_payment_id || "") === s) return true;
      }
      return linkActive(ledger.entries, "payment", s);
    }

    function emit(raw, key, skipReason, carryLink) {
      if (skipReason) { skipped.push({ key: key, reason: skipReason }); return; }
      if (keys[key]) { skipped.push({ key: key, reason: "duplicate" }); return; }
      if (!defaultAccountId) { skipped.push({ key: key, reason: "no default account" }); return; }
      var res = post(Object.assign({}, raw, { idempotencyKey: key, status: "posted" }), ledger);
      if (res.ok) {
        if (carryLink && carryLink.id) Object.assign(res.entry, { link: carryLink });
        keys[key] = true; added.push(res.entry);
      }
      else skipped.push({ key: key, reason: (res.errors || []).join(";") });
    }

    for (var p = 0; p < presellPayments.length; p++) {
      var pay = presellPayments[p] || {};
      var amount = toAmount(pay.amount);
      if (pay.status !== "paid" || !(amount > 0)) continue;
      var key = keyFor("presell", pay.id, p);
      var reason = presellLinked(pay.id) ? "already-linked" : "";
      emit({
        accountId: defaultAccountId,
        direction: "in",
        amount: amount,
        link: { type: "payment", id: String(pay.id || "") },
        description: "Presell collection: " + String(pay.label || "payment") + (pay.unit_id ? " (" + pay.unit_id + ")" : ""),
        subcategory: "",
        ref: String(pay.ref || ""),
        entryDate: String(pay.paid_at || pay.paidAt || pay.due_date || "").slice(0, 10)
      }, key, reason, { type: "payment", id: String(pay.id || "") });
    }

    for (var t = 0; t < transactions.length; t++) {
      var tx = transactions[t] || {};
      var txAmount = toAmount(tx.amount);
      if (!(txAmount > 0)) continue;
      var dir = String(tx.direction || tx.kind || "").toLowerCase() === "out" ? "out" : "in";
      var txKey = keyFor("tx", tx.id, t);
      var txReason = "";
      if (dir === "in" && tx.link && tx.link.type === "payment" && presellLinked(tx.link.id)) {
        txReason = "already-linked";
      }
      emit({
        accountId: defaultAccountId,
        direction: dir,
        amount: txAmount,
        purpose: dir === "out" ? "others" : "",
        subcategory: dir === "out" ? "migration" : "",
        description: dir === "out"
          ? "Legacy expense: " + String(tx.ref || tx.label || "transaction")
          : String(tx.ref || tx.label || "Legacy collection"),
        link: dir === "in" && tx.link ? tx.link : null,
        ref: String(tx.ref || ""),
        entryDate: String(tx.date || tx.created_at || "").slice(0, 10)
      }, txKey, txReason, dir === "in" && tx.link ? tx.link : null);
    }

    return { added: added, skipped: skipped, addedCount: added.length, skippedCount: skipped.length };
  }

  // ── Shared query model ─────────────────────────────────────────
  // One filter object drives ledger rows, counts, and CSV export so the
  // account/direction/status/search/date-range UI stays consistent.
  // f = { accountId, direction, status, search, from, to }.
  function queryLedger(entries, f) {
    f = f || {};
    var q = String(f.search || "").trim().toLowerCase();
    var from = String(f.from || "");
    var to = String(f.to || "");
    var src = entries || [];
    var rows = [];
    for (var i = 0; i < src.length; i++) {
      var e = src[i];
      if (!e) continue;
      if (f.accountId && e.accountId !== f.accountId) continue;
      if (f.direction && e.direction !== f.direction) continue;
      if (f.status) {
        var st = e.status;
        if (e.reversalOf) st = "reversed";
        else if (st === "posted" && src.some(function (x) { return x.reversalOf === e.id; })) st = "reversed";
        if (st !== f.status) continue;
      }
      if (q) {
        var hay = [e.description, e.counterparty, e.reference_no, e.purpose, e.subcategory].join(" ").toLowerCase();
        if (hay.indexOf(q) < 0) continue;
      }
      var d = String(e.entry_date || "");
      if (from && d < from) continue;
      if (to && d > to) continue;
      rows.push(e);
    }
    return { rows: rows, total: src.length, filtered: rows.length };
  }

  // ── Cash-flow classification (pure) ─────────────────────────────
  // Maps a posted entry to one event bucket so the Command Center,
  // asset timeline, construction, and pre-selling cash-flow views all
  // classify the same peso identically. Never mixes projected values
  // into posted buckets; projected/forecast amounts are additive only
  // in their own labelled sections.
  function classifyEntry(e) {
    e = e || {};
    var link = e.link || {};
    var isPayment = Boolean(e.linked_presell_payment_id) || link.type === "payment";
    var isConstruction = Boolean(e.linked_construction_id) || link.type === "project" || link.type === "invoice";
    var purpose = String(e.purpose || "");
    var sub = String(e.subcategory || "");
    if (isPayment) return { bucket: "presell_collection", label: "Pre-selling collection" };
    if (e.direction === "in") return { bucket: "collection", label: "Collection / income" };
    if (isConstruction) return { bucket: "construction", label: "Construction payment" };
    if (purpose === "project_selling") return { bucket: "selling", label: "Selling expense" };
    if (purpose === "others") {
      var map = {
        tax: "Tax / fee",
        salary: "Salary",
        marketing: "Marketing",
        ops: "Operating expense",
        refund: "Refund",
        transfer: "Transfer",
        migration: "Legacy expense",
        other: "Other expense"
      };
      return { bucket: sub && map[sub] ? sub : "expense", label: map[sub] || "Other expense" };
    }
    return { bucket: "expense", label: "Expense" };
  }

  // Balance + projected surplus after posting (used by the post preview).
  function balanceAfterPost(entries, opening, raw) {
    var amt = toAmount(raw && raw.amount);
    var dir = raw && raw.direction;
    var cur = cashBalance(opening || 0, entries || []);
    var after = dir === "out" ? cur - amt : cur + amt;
    after = Math.round(after * 100) / 100;
    return { current: cur, after: after, ok: dir !== "out" || after >= 0 };
  }

  // One user-facing transfer: emits an OUT side on `from` and an IN side
  // on `to`, both posted, sharing a transfer reference + a common idempotency
  // lineage so the pair posts atomically and never replays. Returns the two
  // entries; callers push both into the ledger.
  function postTransfer(raw) {
    var amount = toAmount(raw && raw.amount);
    var id = String(raw && raw.id || "TR" + Date.now());
    var errs = [];
    if (!(amount > 0)) errs.push("amount must be a positive number");
    if (!(raw && raw.from)) errs.push("from account is required");
    if (!(raw && raw.to)) errs.push("to account is required");
    if (raw && raw.from && raw.to && String(raw.from) === String(raw.to)) errs.push("from and to must differ");
    if (errs.length) return { ok: false, errors: errs };
    var date = String(raw.date || new Date().toISOString()).slice(0, 10);
    var ref = String(raw.ref || "transfer-" + id);
    var note = raw.description || "Account transfer";
    var outKey = "transfer:out:" + String(id).replace(/[^A-Za-z0-9_-]/g, "_");
    var inKey = "transfer:in:" + String(id).replace(/[^A-Za-z0-9_-]/g, "_");
    var out = {
      accountId: raw.from, direction: "out", amount: amount, purpose: "others",
      subcategory: "transfer", description: note + " → " + (raw.toLabel || "to"),
      company: "", counterparty: raw.toLabel || "to", reference_no: ref, status: "posted",
      entry_date: date, idempotencyKey: outKey, transferId: id, created_at: new Date().toISOString()
    };
    var inn = {
      accountId: raw.to, direction: "in", amount: amount, purpose: "", subcategory: "",
      description: note + " ← " + (raw.fromLabel || "from"), counterparty: raw.fromLabel || "from",
      reference_no: ref, status: "posted", entry_date: date, idempotencyKey: inKey,
      transferId: id, created_at: new Date().toISOString()
    };
    return { ok: true, out: out, in: inn, amount: amount, ref: ref, date: date };
  }

  // ── Portfolio Cash Command Center ───────────────────────────────
  // One labelled view over a date range: actual posted cash, committed
  // unpaid cost, receivables, payables, projected future in/outflow,
  // available cash after committed obligations, and debt/financing.
  // Every returned amount carries a `basis` label that the UI must render.
  function commandCenter(input) {
    input = input || {};
    var accounts = Array.isArray(input.accounts) ? input.accounts : [];
    var entries = Array.isArray(input.entries) ? input.entries : [];
    var projects = Array.isArray(input.projects) ? input.projects : [];
    var phases = Array.isArray(input.phases) ? input.phases : [];
    var invoices = Array.isArray(input.invoices) ? input.invoices : [];
    var changes = Array.isArray(input.changeOrders) ? input.changeOrders : [];
    var units = Array.isArray(input.presellUnits) ? input.presellUnits : [];
    var payments = Array.isArray(input.presellPayments) ? input.presellPayments : [];
    var deals = Array.isArray(input.deals) ? input.deals : [];
    var today = String(input.today || "").slice(0, 10);
    var from = String(input.from || "");
    var to = String(input.to || "");

    function inRangeEntry(e) {
      if (!e) return false;
      if (e.status !== "posted" || e.reversalOf) return false;
      var d = String(e.entry_date || "");
      if (from && d && d < from) return false;
      if (to && d && d > to) return false;
      return true;
    }

    // Opening = account openings + posted movements strictly BEFORE `from`.
    var opening = 0;
    for (var a = 0; a < accounts.length; a++) opening += Number(accounts[a].opening_balance) || 0;
    var cashIn = 0, cashOut = 0, postedCount = 0, beforeCount = 0;
    for (var i = 0; i < entries.length; i++) {
      var e = entries[i];
      if (!e || e.status !== "posted" || e.reversalOf) continue;
      var d = String(e.entry_date || "");
      if (from && d && d < from) {
        if (e.direction === "in") opening += toAmount(e.amount);
        else opening -= toAmount(e.amount);
        beforeCount++;
        continue;
      }
      if (inRangeEntry(e)) {
        postedCount++;
        if (e.direction === "in") cashIn += toAmount(e.amount);
        else cashOut += toAmount(e.amount);
      }
    }
    opening = Math.round(opening * 100) / 100;
    var net = Math.round((cashIn - cashOut) * 100) / 100;
    var closing = Math.round((opening + net) * 100) / 100;

    // Construction committed/paid/forecast (same rollup as overview).
    var planned = 0, committed = 0, paid = 0, contingency = 0, changeOrders = 0;
    for (var p = 0; p < projects.length; p++) {
      var proj = projects[p];
      var chg = 0;
      for (var c1 = 0; c1 < changes.length; c1++) {
        if (changes[c1] && changes[c1].project_id === proj.id) chg += Number(changes[c1].amount) || 0;
      }
      var projPhases = [];
      for (var ph = 0; ph < phases.length; ph++) {
        if (phases[ph] && phases[ph].project_id === proj.id) projPhases.push(phases[ph]);
      }
      var sub = constructionProjectSummary({ contingency: proj.contingency, retentionRate: proj.retention_rate, changeOrders: chg, phases: projPhases });
      planned += sub.planned;
      committed += sub.committed;
      paid += sub.paid;
      contingency += sub.contingency;
      changeOrders += sub.changeOrders;
    }
    committed = Math.round(committed * 100) / 100;
    paid = Math.round(paid * 100) / 100;
    var committedUnpaid = Math.round(Math.max(0, committed - paid) * 100) / 100;
    var forecast = Math.round((committed + contingency + changeOrders) * 100) / 100;
    var cashRequiredToComplete = Math.round(Math.max(0, forecast - paid) * 100) / 100;

    // Payables due = unpaid (non-void) invoices within range + committed unpaid.
    var payablesDue = 0, pendingInvoices = 0;
    for (var iv = 0; iv < invoices.length; iv++) {
      var inv = invoices[iv] || {};
      if (inv.status === "paid" || inv.status === "voided") continue;
      var dInv = String(inv.date || inv.due_date || "");
      if (from && dInv && dInv < from) continue;
      if (to && dInv && dInv > to) continue;
      payablesDue += toAmount(inv.amount);
      pendingInvoices++;
    }
    payablesDue = Math.round(payablesDue * 100) / 100;

    // Presell: receivables (unpaid schedules in range) + projected inflow by month.
    var receivables = 0, receivableCount = 0, projectedIn = 0;
    var projectedInByMonth = {};
    for (var py = 0; py < payments.length; py++) {
      var pay = payments[py] || {};
      if (pay.status === "paid" || pay.status === "voided") continue;
      var due = String(pay.due_date || "").slice(0, 10);
      if (from && due && due < from) continue;
      if (to && due && due > to) continue;
      var amt = toAmount(pay.amount);
      receivables += amt;
      receivableCount++;
    }
    // Projected future inflow = receivables due in range minus those already due
    // before `today` (still receivable, but "past-due receiver", not future).
    for (var py2 = 0; py2 < payments.length; py2++) {
      var pay2 = payments[py2] || {};
      if (pay2.status === "paid") continue;
      var due2 = String(pay2.due_date || "").slice(0, 10);
      if (!due2) continue;
      if (from && due2 < from) continue;
      if (to && due2 > to) continue;
      var a2 = toAmount(pay2.amount);
      if (today && due2 > today) {
        projectedIn += a2;
        var m = due2.slice(0, 7);
        projectedInByMonth[m] = Math.round(((projectedInByMonth[m] || 0) + a2) * 100) / 100;
      }
    }
    receivables = Math.round(receivables * 100) / 100;
    projectedIn = Math.round(projectedIn * 100) / 100;

    // Projected future outflow = forecast not yet paid (money required to
    // complete committed + contingency work), which is Forecast, not Posted.
    var projectedOut = cashRequiredToComplete;

    // Available after committed obligations = actual closing minus what is
    // committed but not yet paid (money we owe on real commitments).
    var availableAfterCommitted = Math.round((closing - committedUnpaid) * 100) / 100;

    // Debt & financing from the deal model (Estimated/Projected — not cash).
    var debt = 0, financingProceeds = 0, dealCount = deals.length;
    for (var d = 0; d < deals.length; d++) {
      var deal = deals[d] || {};
      debt += Number(deal.loan) || 0;
      financingProceeds += Number(deal.financing) || Number(deal.loan) || 0;
    }

    return {
      range: { from: from, to: to, today: today },
      posted: {
        basis: "Posted",
        opening: opening,
        cashIn: cashIn,
        cashOut: cashOut,
        net: net,
        closing: closing,
        count: postedCount,
        beforeCount: beforeCount
      },
      committed: {
        basis: "Committed",
        planned: planned,
        committed: committed,
        paid: paid,
        committedUnpaid: committedUnpaid,
        forecast: forecast,
        cashRequiredToComplete: cashRequiredToComplete
      },
      payables: { basis: "Payable", due: payablesDue, invoices: pendingInvoices },
      receivables: { basis: "Receivable", total: receivables, count: receivableCount },
      projected: {
        basis: "Projected",
        inflow: projectedIn,
        inflowByMonth: projectedInByMonth,
        outflow: projectedOut,
        outflowBasis: "Forecast"
      },
      availableAfterCommitted: { basis: "Posted – Committed", amount: availableAfterCommitted },
      debt: { basis: "Estimated", principal: debt, financingProceeds: financingProceeds, dealCount: dealCount },
      months: monthlyRollup(input)
    };
  }

  // Monthly posted + projected-inflow rollup across the range. Opening of a
  // month = account openings + all posted movement before that month.
  function monthlyRollup(input) {
    input = input || {};
    var accounts = Array.isArray(input.accounts) ? input.accounts : [];
    var entries = Array.isArray(input.entries) ? input.entries : [];
    var payments = Array.isArray(input.presellPayments) ? input.presellPayments : [];
    var from = String(input.from || "");
    var to = String(input.to || "");
    var months = {};
    var order = [];
    var i;
    for (i = 0; i < entries.length; i++) {
      var e = entries[i];
      if (!e || e.status !== "posted" || e.reversalOf) continue;
      var d = String(e.entry_date || "");
      var m = d.slice(0, 7);
      if (from && d && d < from) m = "prev";
      if (to && d && d > to) continue;
      var rec = months[m];
      if (!rec) {
        rec = months[m] = { month: m === "prev" ? "before" : m, cashIn: 0, cashOut: 0, projectedIn: 0, posted: 0 };
        if (m !== "prev") order.push(m);
      }
      if (m === "prev") continue;
      rec.posted++;
      if (e.direction === "in") rec.cashIn += toAmount(e.amount);
      else rec.cashOut += toAmount(e.amount);
    }
    for (i = 0; i < payments.length; i++) {
      var pay = payments[i] || {};
      if (pay.status === "paid") continue;
      var due = String(pay.due_date || "").slice(0, 10);
      var mm = due.slice(0, 7);
      if (!mm) continue;
      if (from && due < from) continue;
      if (to && due > to) continue;
      if (!months[mm]) {
        months[mm] = { month: mm, cashIn: 0, cashOut: 0, projectedIn: 0, posted: 0 };
        order.push(mm);
      }
      months[mm].projectedIn += toAmount(pay.amount);
    }
    order.sort();
    var opening = 0;
    for (i = 0; i < accounts.length; i++) opening += Number(accounts[i].opening_balance) || 0;
    for (i = 0; i < entries.length; i++) {
      var e2 = entries[i];
      if (!e2 || e2.status !== "posted" || e2.reversalOf) continue;
      var d2 = String(e2.entry_date || "");
      if (!from || (d2 && d2 >= from)) break;
      opening += e2.direction === "in" ? toAmount(e2.amount) : -toAmount(e2.amount);
    }
    var rows = [];
    var running = opening;
    for (i = 0; i < order.length; i++) {
      var m2 = months[order[i]];
      var net = Math.round((m2.cashIn - m2.cashOut) * 100) / 100;
      var close = Math.round((running + net) * 100) / 100;
      rows.push({
        month: m2.month,
        opening: Math.round(running * 100) / 100,
        cashIn: Math.round(m2.cashIn * 100) / 100,
        cashOut: Math.round(m2.cashOut * 100) / 100,
        net: net,
        closing: close,
        projectedIn: Math.round(m2.projectedIn * 100) / 100,
        posted: m2.posted
      });
      running = close;
    }
    return rows;
  }

  // ── Asset cash-flow timeline ────────────────────────────────────
  // Actual posted entries linked to the asset (via linked_asset_id or deal
  // link) plus Estimated deal-model records (acquisition, financing, owner
  // equity, projected revenue) — each marked actual/projected with a source.
  function assetTimeline(input) {
    input = input || {};
    var assetId = String(input.assetId || "");
    var deal = input.asset || {};
    var entries = Array.isArray(input.entries) ? input.entries : [];
    var today = String(input.today || "").slice(0, 10);
    var events = [];
    var i, e;

    for (i = 0; i < entries.length; i++) {
      e = entries[i] || {};
      if (e.status !== "posted") continue;
      var linked = String(e.linked_asset_id || "") === assetId || (e.link && e.link.type === "deal" && String(e.link.id) === assetId);
      if (!linked) continue;
      var cls = classifyEntry(e);
      events.push({
        kind: "entry", id: String(e.id), date: String(e.entry_date || "").slice(0, 10),
        label: cls.label, description: String(e.description || ""), direction: e.direction,
        amount: toAmount(e.amount), accountId: String(e.accountId || ""), status: "posted",
        actuallyPosted: true, actual: true, proof: (e.proofs && e.proofs.length) ? e.proofs.length : 0,
        ref: String(e.reference_no || ""), source: classifyEntry(e).bucket, reversalOf: String(e.reversalOf || "")
      });
    }

    function estimated(label, direction, amount, date, source) {
      events.push({
        kind: "estimate", id: "est-" + source + "-" + assetId, date: date, label: label,
        description: "", direction: direction, amount: Math.round((Number(amount) || 0) * 100) / 100,
        accountId: "", status: "estimated", actuallyPosted: false, actual: false, proof: 0,
        ref: "", source: source, reversalOf: ""
      });
    }

    // Deal-model estimates: owner contribution (equity), acquisition,
    // financing proceeds, and projected revenue.
    var acq = Number(deal.acquisition) || 0;
    var loan = Number(deal.loan) || 0;
    var invested = Number(deal.invested) || 0;
    var equity = Math.max(0, invested - loan);
    if (acq > 0) estimated("Acquisition payment", "out", acq, deal.acquiredAt || today, "acquisition");
    if (loan > 0) estimated("Financing proceeds", "in", loan, deal.acquiredAt || today, "financing");
    if (equity > 0) estimated("Owner contribution", "out", equity, deal.acquiredAt || today, "equity");
    if (Number(deal.projectedProfit) > 0) estimated("Projected revenue", "in", Number(deal.projectedProfit), deal.projectedAt || today, "revenue");

    events.sort(function (x, y) { return String(x.date).localeCompare(String(y.date)) || String(x.id).localeCompare(String(y.id)); });

    var postedIncome = 0, postedExpenses = 0;
    for (i = 0; i < events.length; i++) {
      e = events[i];
      if (!e.actual) continue;
      if (e.direction === "in") postedIncome += e.amount;
      else postedExpenses += e.amount;
    }
    var remainingCost = Math.round(Math.max(0, (Number(deal.invested) || 0) - (Number(deal.initialAcquisitionPaid) || acq)) * 100) / 100;

    return {
      assetId: assetId,
      label: String(deal.label || input.label || assetId),
      events: events,
      totals: {
        paidCost: Math.round(postedExpenses * 100) / 100,
        remainingCost: remainingCost,
        debt: Math.round(loan * 100) / 100,
        postedIncome: Math.round(postedIncome * 100) / 100,
        postedExpenses: Math.round(postedExpenses * 100) / 100,
        projectedRevenue: Math.round((Number(deal.projectedProfit) || 0) * 100) / 100,
        realizedProfit: Math.round((Number(deal.realizedProfit) || 0) * 100) / 100
      }
    };
  }

  // ── Construction project cash flow ──────────────────────────────
  function projectCashflow(input) {
    input = input || {};
    var projectId = String(input.projectId || "");
    var project = input.project || {};
    var phases = Array.isArray(input.phases) ? input.phases : [];
    var invoices = Array.isArray(input.invoices) ? input.invoices : [];
    var changes = Array.isArray(input.changeOrders) ? input.changeOrders : [];
    var entries = Array.isArray(input.entries) ? input.entries : [];
    var units = Array.isArray(input.presellUnits) ? input.presellUnits : [];
    var payments = Array.isArray(input.presellPayments) ? input.presellPayments : [];
    var today = String(input.today || "").slice(0, 10);

    var mine = [];
    for (var p = 0; p < phases.length; p++) if (phases[p] && String(phases[p].project_id) === projectId) mine.push(phases[p]);
    var chg = 0;
    for (var c = 0; c < changes.length; c++) if (changes[c] && String(changes[c].project_id) === projectId) chg += Number(changes[c].amount) || 0;
    var summary = constructionProjectSummary({ contingency: project.contingency, retentionRate: project.retention_rate, changeOrders: chg, phases: mine });

    var cashOut = [];
    for (var e = 0; e < entries.length; e++) {
      var en = entries[e] || {};
      if (en.status !== "posted" || en.reversalOf) continue;
      if (String(en.linked_construction_id || "") === projectId || (en.link && en.link.type === "project" && String(en.link.id) === projectId) || (en.link && en.link.type === "invoice" && String(en.linked_construction_id) === projectId)) {
        cashOut.push({
          id: String(en.id), date: String(en.entry_date || "").slice(0, 10), amount: toAmount(en.amount),
          phaseId: String(en.linked_phase_id || ""), description: String(en.description || ""),
          reference: String(en.reference_no || ""), accountId: String(en.accountId || ""),
          proof: (en.proofs && en.proofs.length) ? en.proofs.length : 0
        });
      }
    }
    cashOut.sort(function (a, b) { return String(a.date).localeCompare(String(b.date)); });

    var unpaidInvoices = [];
    for (var i2 = 0; i2 < invoices.length; i2++) {
      var inv = invoices[i2] || {};
      if (String(inv.project_id) !== projectId) continue;
      if (inv.status === "paid" || inv.status === "voided") continue;
      unpaidInvoices.push({
        id: String(inv.id), invoice_no: String(inv.invoice_no || ""), date: String(inv.date || "").slice(0, 10),
        amount: toAmount(inv.amount), phaseId: String(inv.phase_id || ""), vendorId: String(inv.vendor_id || ""),
        status: String(inv.status || "pending")
      });
    }
    unpaidInvoices.sort(function (a, b) { return String(a.date).localeCompare(String(b.date)); });

    // Collections from the linked pre-selling project. Paid schedules are the
    // source of truth; every paid schedule must appear as exactly one ledger
    // entry (linked_presell_payment_id). We report paid schedules as collected,
    // and cross-check the ledger footprint so a double-posted entry is visible.
    var presellProjectId = String(project.presell_project_id || input.presell_project_id || "");
    var unitIds = {}, pu;
    for (pu = 0; pu < units.length; pu++) {
      var u = units[pu] || {};
      if (String(u.project_id) === presellProjectId) unitIds[String(u.id)] = true;
    }
    var paidScheduleAmount = 0, paidScheduleIds = {};
    for (var py = 0; py < payments.length; py++) {
      var pay = payments[py] || {};
      if (pay.status !== "paid") continue;
      if (!unitIds[String(pay.unit_id)]) continue;
      paidScheduleAmount += toAmount(pay.amount);
      paidScheduleIds[String(pay.id)] = true;
    }
    var ledgerFootprint = 0, ledgerMismatch = false;
    for (e = 0; e < entries.length; e++) {
      var en2 = entries[e] || {};
      if (en2.status !== "posted" || en2.reversalOf) continue;
      var pId = String(en2.linked_presell_payment_id || "");
      if (pId && paidScheduleIds[pId]) {
        ledgerFootprint += toAmount(en2.amount);
        if (ledgerFootprint > paidScheduleAmount) { ledgerMismatch = true; ledgerFootprint = paidScheduleAmount; break; }
      }
    }
    var collectedFromPresell = Math.round(paidScheduleAmount * 100) / 100;

    var warnings = [];
    if (summary.overpaid && summary.progress > 0) {
      warnings.push({ type: "overpaid", tone: "warn", message: "Paid (" + summary.paidRate + "%) materially exceeds physical progress (" + summary.progress + "%)." });
    }
    if (summary.variance < 0) {
      warnings.push({ type: "overbudget", tone: "warn", message: "Forecast final cost (" + summary.forecast + ") exceeds approved planned cost (" + summary.planned + ")." });
    }

    return {
      projectId: projectId,
      label: String(project.name || project.contract_value ? (project.name || "") : projectId),
      summary: summary,
      cashOut: cashOut,
      unpaidInvoices: unpaidInvoices,
      collectedFromPresell: Math.round(paidScheduleAmount * 100) / 100,
      ledgerFootprint: Math.round(ledgerFootprint * 100) / 100,
      ledgerMismatch: ledgerMismatch,
      cashRequiredToComplete: Math.round(Math.max(0, summary.forecast - summary.paid) * 100) / 100,
      warnings: warnings
    };
  }

  // ── Pre-selling project cash flow ───────────────────────────────
  // Collections are counted once per paid schedule; a paid schedule whose
  // amount is already a ledger cash entry (linked payment) is never double
  // counted. Expected-by-month is purely projected from pending schedules.
  function presellCashflow(input) {
    input = input || {};
    var projectId = String(input.projectId || "");
    var project = input.project || {};
    var units = Array.isArray(input.units) ? input.units : [];
    var payments = Array.isArray(input.payments) ? input.payments : [];
    var entries = Array.isArray(input.entries) ? input.entries : [];
    var constructionProjects = Array.isArray(input.constructionProjects) ? input.constructionProjects : [];
    var phases = Array.isArray(input.phases) ? input.phases : [];
    var today = String(input.today || "").slice(0, 10);

    var mineUnits = [];
    var unitIdSet = {};
    for (var u = 0; u < units.length; u++) {
      var un = units[u] || {};
      if (String(un.project_id) === projectId) { mineUnits.push(un); unitIdSet[String(un.id)] = true; }
    }
    var contracted = 0, reservedValue = 0, contractedCount = 0;
    for (var u2 = 0; u2 < mineUnits.length; u2++) {
      var un2 = mineUnits[u2];
      if (un2.status === "sold") { contracted += Number(un2.price) || 0; contractedCount++; }
      else if (un2.status === "reserved") reservedValue += Number(un2.price) || 0;
    }

    var minePayments = [];
    for (var p = 0; p < payments.length; p++) {
      var pay = payments[p] || {};
      if (unitIdSet[String(pay.unit_id)]) minePayments.push(pay);
    }
    var paidTotal = 0, paidCount = 0, pendingTotal = 0, pendingCount = 0;
    var byMonth = {};
    for (var i = 0; i < minePayments.length; i++) {
      var it = minePayments[i];
      var amt = toAmount(it.amount);
      if (it.status === "paid") {
        paidTotal += amt;
        paidCount++;
      } else {
        pendingTotal += amt;
        pendingCount++;
        var m = String(it.due_date || "").slice(0, 7);
        if (m) byMonth[m] = Math.round(((byMonth[m] || 0) + amt) * 100) / 100;
      }
    }

    // Ledger footprint: entries whose linked_presell_payment_id maps to one of
    // this project's payments. No double count vs the paid schedule total.
    var ledgerTotal = 0, ledgerCount = 0, ledgerPaymentIds = {};
    for (var e = 0; e < entries.length; e++) {
      var en = entries[e] || {};
      if (en.status !== "posted" || en.reversalOf) continue;
      var pid = String(en.linked_presell_payment_id || "");
      if (pid && unitIdSet[String(presellPaymentUnit(minePayments, pid))]) {
        ledgerTotal += toAmount(en.amount);
        ledgerCount++;
        ledgerPaymentIds[pid] = true;
      }
    }

    // Linked construction projects for this presell project.
    var cProjects = [];
    var cPhases = [];
    for (var c = 0; c < constructionProjects.length; c++) {
      var cp = constructionProjects[c] || {};
      if (String(cp.presell_project_id) === projectId) cProjects.push(cp);
    }
    var cCash = { planned: 0, committed: 0, paid: 0, forecast: 0 };
    for (var c2 = 0; c2 < cProjects.length; c2++) {
      var pc = cProjects[c2];
      var minePh = [];
      for (var ph = 0; ph < phases.length; ph++) {
        if (phases[ph] && String(phases[ph].project_id) === pc.id) minePh.push(phases[ph]);
      }
      var sub = constructionProjectSummary({ contingency: pc.contingency, retentionRate: pc.retention_rate, changeOrders: 0, phases: minePh });
      cCash.planned += sub.planned;
      cCash.committed += sub.committed;
      cCash.paid += sub.paid;
      cCash.forecast += sub.forecast;
    }

    var perUnitCost = contractedCount > 0 ? Math.round((cCash.forecast / contractedCount) * 100) / 100 : 0;
    var expectedMargin = Math.round((contracted + reservedValue - cCash.forecast) * 100) / 100;

    var sortedMonths = Object.keys(byMonth).sort();
    var months = [];
    for (var s = 0; s < sortedMonths.length; s++) {
      months.push({ month: sortedMonths[s], expected: byMonth[sortedMonths[s]] });
    }

    return {
      projectId: projectId,
      unitCount: mineUnits.length,
      contracted: Math.round(contracted * 100) / 100,
      contractedCount: contractedCount,
      reservedValue: Math.round(reservedValue * 100) / 100,
      reservationCollections: 0,
      paid: { total: Math.round(paidTotal * 100) / 100, count: paidCount },
      pending: { total: Math.round(pendingTotal * 100) / 100, count: pendingCount },
      expectedByMonth: months,
      ledger: { total: Math.round(ledgerTotal * 100) / 100, count: ledgerCount, ids: ledgerPaymentIds },
      doubleCounted: ledgerCount > paidCount || ledgerTotal > paidTotal,
      construction: {
        projects: cProjects.length,
        paid: Math.round(cCash.paid * 100) / 100,
        remaining: Math.round((cCash.forecast - cCash.paid) * 100) / 100,
        committed: Math.round(cCash.committed * 100) / 100,
        forecast: Math.round(cCash.forecast * 100) / 100
      },
      costPerUnit: perUnitCost,
      expectedMargin: expectedMargin
    };
  }

  function presellPaymentUnit(payments, paymentId) {
    for (var i = 0; i < payments.length; i++) {
      if (String(payments[i].id) === String(paymentId)) return String(payments[i].unit_id || "");
    }
    return "";
  }

  return {
    DIRECTIONS: DIRECTIONS,
    PURPOSES: PURPOSES,
    STATUSES: STATUSES,
    cashBalance: cashBalance,
    linkActive: linkActive,
    validateCashEntry: validateCashEntry,
    post: post,
    reverse: reverse,
    voidEntry: voidEntry,
    constructionSummary: constructionSummary,
    constructionProjectSummary: constructionProjectSummary,
    presellRollup: presellRollup,
    reconcile: reconcile,
    PROOF_CATEGORIES: PROOF_CATEGORIES,
    PROOF_MAX_BYTES: PROOF_MAX_BYTES,
    PROOF_MIME_EXT: PROOF_MIME_EXT,
    validateProofFile: validateProofFile,
    proofChecksum: proofChecksum,
    proofMetadata: proofMetadata,
    overviewRollup: overviewRollup,
    migrateLegacyCash: migrateLegacyCash,
    queryLedger: queryLedger,
    classifyEntry: classifyEntry,
    balanceAfterPost: balanceAfterPost,
    postTransfer: postTransfer,
    commandCenter: commandCenter,
    monthlyRollup: monthlyRollup,
    assetTimeline: assetTimeline,
    projectCashflow: projectCashflow,
    presellCashflow: presellCashflow
  };
});