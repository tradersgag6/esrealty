"use strict";
/* ============================================================
   ES Realty - transaction and estate tax estimates
   ------------------------------------------------------------
   Separate from js/estimator.js on purpose. The estimate answers
   "what is the property worth"; this answers "what would it cost
   to sell it, roughly". They have different legal bases and
   different failure modes, so mixing them into one module would
   let a change to the valuation quietly alter the tax figures.

   WHAT THIS IS NOT
   A tax computation. No software outside the BIR, the LGU and the
   Registry of Deeds can produce a payable amount, and this does not
   pretend to. Every figure here is an orientation aid for a broker
   planning a conversation with a client.

   THE TAX BASE IS NOT THE ESTIMATE
   Capital gains tax and documentary stamp tax are charged on the
   HIGHER of the selling price and fair market value. This guide
   knows neither with certainty: the sale has not happened, and the
   BIR determines fair market value - which under Sec. 24(D) NIRC may
   be taken as 50% of the zonal value. So the base used is the
   higher of the guide estimate and 50% of the BIR zonal value, and
   it is reported alongside the components that produced it.

   A FATHERLY WARNING about the direction of error
   Because FMV is taken as 50% of zonal value and zonal values sit
   well below market, the base used here is usually the estimate.
   If the eventual selling price lands ABOVE the estimate, both CGT
   and DST rise with it. These figures are therefore a floor, not a
   ceiling, and understating them costs the seller money.

   Rates and legal bases: data/tax/ph-estate-tax-reference.json
   ============================================================ */
(function (root, factory) {
  if (typeof module === "object" && module.exports) module.exports = factory();
  else root.ESREALTY_TAX = factory();
})(typeof self !== "undefined" ? self : this, function () {
  "use strict";

  function loadJSON(url) {
    if (typeof fetch === "function") {
      return fetch(url, { cache: "no-cache" }).then(function (r) {
        if (!r.ok) throw new Error("tax reference unavailable (" + r.status + ")");
        return r.json();
      });
    }
    /* Node, for the test suites. */
    return Promise.resolve(require("fs").readFileSync(url, "utf8").then(JSON.parse));
  }

  var refPromise = null;
  function reference() {
    if (!refPromise) refPromise = loadJSON("data/tax/ph-estate-tax-reference.json");
    return refPromise;
  }

  function num(v) { var n = Number(v || 0); return isFinite(n) ? n : 0; }
  function round2(n) { return Math.round(num(n) * 100) / 100; }

  /* Round to whole pesos for display. Sub-peso precision on a multi-million
     peso figure implies accuracy the estimate does not have. */
  function money(n) { return Math.round(num(n)); }

  /* ------------------------------------------------------------
     Selling costs
     ------------------------------------------------------------ */
  function sellingCosts(estimate, ref) {
    ref = ref || {};
    var txn = ref.transaction || [];

    /* The basis the BIR would actually use: higher of the price and an FMV
       proxy of 50% zonal. Exposed so the caller can state it, because
       "PHP 172,500" without its base is not a usable number. */
    var estimateValue = num(estimate.marketGuideEstimate || estimate.recommendedAskingPrice);
    var zonal = num(estimate.birZonalValue);
    var fmvProxy = zonal * 0.5;
    var taxBase = Math.max(estimateValue, fmvProxy);

    function byKey(k) {
      for (var i = 0; i < txn.length; i++) if (txn[i].key === k) return txn[i];
      return null;
    }

    /* CGT is charged on the EXCESS of the price over fair market value, and
       only where that excess is positive (Sec. 24(D) NIRC). Reading it as a
       flat 6% of the price - which is what a percentage-on-base shortcut
       gives - overstates CGT substantially, because the base for DST is the
       full price but the base for CGT is only the excess over FMV.
       The FMV used here is the 50%-of-zonal proxy, so a street where zonal
       is high relative to market yields no CGT at all. */
    var cgtExcess = Math.max(0, estimateValue - fmvProxy);
    var cgtDef = byKey("capital_gains");
    var cgt = cgtExcess * num(cgtDef && cgtDef.ratePct) / 100;

    var dstDef = byKey("documentary_stamp");
    var dst = taxBase * num(dstDef && dstDef.ratePct) / 100;

    var transferDef = byKey("transfer");
    var transfer = taxBase * num(transferDef && transferDef.ratePct) / 100;

    var regDef = byKey("registration");
    var registration = taxBase * num(regDef && regDef.ratePct) / 100;

    var notaryDef = byKey("notarial");
    var notarial = num(notaryDef && notaryDef.amount);

    var brokerDef = byKey("broker");
    var brokerMin = estimateValue * num(brokerDef && brokerDef.ratePctMin) / 100;
    var brokerMax = estimateValue * num(brokerDef && brokerDef.ratePctMax) / 100;

    /* Total excludes the broker: commission is a negotiated contractual cost,
       not a statutory one, and folding it into "selling costs" would blur the
       line between what the law requires and what the deal agreed. */
    var statutory = cgt + dst + transfer + registration + notarial;

    return {
      taxBase: money(taxBase),
      taxBaseBasis: taxBase >= estimateValue
        ? "Higher of the guide estimate and 50% of the BIR zonal value - the estimate, because the estimate exceeds the FMV proxy."
        : "Higher of the guide estimate and 50% of the BIR zonal value - the FMV proxy, because it exceeds the estimate.",
      estimateValue: money(estimateValue),
      zonalValue: money(zonal),
      fmvProxy: money(fmvProxy),

      items: [
        {
          key: "capital_gains", label: (cgtDef && cgtDef.label) || "Capital gains tax",
          amount: money(cgt),
          base: "excess of the price over fair market value (Sec. 24(D) NIRC)",
          baseAmount: money(cgtExcess),
          rateLabel: num(cgtDef && cgtDef.ratePct) + "%",
          billedBy: cgtDef && cgtDef.billedBy,
          legalBasis: cgtDef && cgtDef.legalBasis,
          deadlineDays: cgtDef && cgtDef.deadlineDays,
          deadlineFrom: cgtDef && cgtDef.deadlineFrom,
          penalty: cgtDef && cgtDef.penalty,
          note: cgtExcess === 0
            ? "No excess over fair market value at this price, so no capital gains tax is indicated. The BIR determines fair market value and may assess differently."
            : cgtDef && cgtDef.note
        },
        {
          key: "documentary_stamp", label: (dstDef && dstDef.label) || "Documentary stamp tax",
          amount: money(dst), base: "higher of selling price or fair market value",
          baseAmount: money(taxBase), rateLabel: num(dstDef && dstDef.ratePct) + "%",
          billedBy: dstDef && dstDef.billedBy, legalBasis: dstDef && dstDef.legalBasis,
          deadlineDays: dstDef && dstDef.deadlineDays, deadlineFrom: dstDef && dstDef.deadlineFrom,
          penalty: dstDef && dstDef.penalty, note: dstDef && dstDef.note
        },
        {
          key: "transfer", label: (transferDef && transferDef.label) || "Local transfer tax",
          amount: money(transfer), base: "higher of original price, current value or fair market value",
          baseAmount: money(taxBase), rateLabel: num(transferDef && transferDef.ratePct) + "%",
          billedBy: transferDef && transferDef.billedBy, legalBasis: transferDef && transferDef.legalBasis,
          deadlineDays: transferDef && transferDef.deadlineDays, deadlineFrom: transferDef && transferDef.deadlineFrom,
          penalty: transferDef && transferDef.penalty, note: transferDef && transferDef.note
        },
        {
          key: "registration", label: (regDef && regDef.label) || "Registration fee",
          amount: money(registration), base: "higher of selling price or fair market value",
          baseAmount: money(taxBase), rateLabel: "about " + num(regDef && regDef.ratePct) + "%",
          billedBy: regDef && regDef.billedBy, legalBasis: regDef && regDef.legalBasis,
          deadlineDays: null, deadlineFrom: null, penalty: null, note: regDef && regDef.note
        },
        {
          key: "notarial", label: (notaryDef && notaryDef.label) || "Notarial fee",
          amount: money(notarial), base: "charged per notarial act, not on the price",
          baseAmount: null, rateLabel: "fixed",
          billedBy: notaryDef && notaryDef.billedBy, legalBasis: notaryDef && notaryDef.legalBasis,
          deadlineDays: null, deadlineFrom: null, penalty: null, note: notaryDef && notaryDef.note
        }
      ],

      statutoryTotal: money(statutory),

      broker: {
        label: (brokerDef && brokerDef.label) || "Broker's commission",
        min: money(brokerMin), max: money(brokerMax),
        rateLabel: num(brokerDef && brokerDef.ratePctMin) + "% to " + num(brokerDef && brokerDef.ratePctMax) + "%",
        note: brokerDef && brokerDef.note
      },

      netProceeds: {
        /* Both ends of the commission band, because commission is the one
           line the two parties actually negotiate. */
        atLowCommission: money(estimateValue - statutory - brokerMin),
        atHighCommission: money(estimateValue - statutory - brokerMax),
        beforeCommission: money(estimateValue - statutory)
      },

      direction: "These figures use the guide estimate as the sale price. A HIGHER selling price raises capital gains tax and documentary stamp tax, so treat the totals as a floor rather than a payable amount.",

      available: true
    };
  }

  /* ------------------------------------------------------------
     Inheritance
     ------------------------------------------------------------ */
  function inheritance(estimate, ref) {
    ref = ref || {};
    var e = ref.estate || {};
    var gross = num(estimate.birZonalValue) * 0.5;
    /* Where the BIR accepts the market value instead, the exposure is larger.
       Both are shown rather than picking one, because which applies is the
       family's and the BIR's decision, not this tool's. */
    var grossMarket = num(estimate.marketGuideEstimate);
    var deduction = num(e.standardDeduction);
    var threshold = num(e.taxThreshold);
    var pct = num(e.taxPct);

    function assess(g) {
      var net = Math.max(0, g - deduction);
      var taxable = Math.max(0, net - threshold);
      return { gross: money(g), afterDeduction: money(net), taxable: money(taxable), tax: money(taxable * pct / 100) };
    }

    var onZonal = assess(gross);
    var onMarket = assess(grossMarket);

    return {
      grossOnZonalBasis: onZonal.gross,
      grossOnMarketBasis: onMarket.gross,
      standardDeduction: deduction,
      taxThreshold: threshold,
      taxPct: pct,
      onZonalBasis: onZonal,
      onMarketBasis: onMarket,
      /* Estate tax is payable only above the threshold. Below it the answer is
         "none", and saying so plainly is more useful than a computed zero. */
      likelyPayable: onMarket.tax > 0,
      basis: e.taxBasis,
      deductionBasis: e.standardDeductionBasis,
      note: e.note,
      penalty: e.penalty,
      deadlineDays: e.deadlineDays,
      deadlineFrom: e.deadlineFrom,
      available: true
    };
  }

  /* Deadlines, most urgent first. Days are relative to a stated trigger, so a
     concrete date cannot be given until the notarisation date is known. */
  function deadlines(ref) {
    ref = ref || {};
    var out = [];
    var txn = ref.transaction || [];
    for (var i = 0; i < txn.length; i++) {
      var t = txn[i];
      if (t.deadlineDays == null || t.deadlineFrom == null) continue;
      out.push({
        label: t.label, days: t.deadlineDays, from: t.deadlineFrom,
        penalty: t.penalty, billedBy: t.billedBy
      });
    }
    var e = ref.estate || {};
    if (e.deadlineDays != null) {
      out.push({
        label: "Estate tax return, if estate tax is payable", days: e.deadlineDays,
        from: e.deadlineFrom, penalty: e.penalty, billedBy: "BIR"
      });
    }
    out.sort(function (a, b) { return a.days - b.days; });
    return out;
  }

  function full(estimate) {
    return reference().then(function (ref) {
      return {
        reference: ref,
        selling: sellingCosts(estimate, ref),
        inheritance: inheritance(estimate, ref),
        deadlines: deadlines(ref),
        steps: ref.steps || [],
        sellerDocuments: ref.sellerDocuments || [],
        buyerDocuments: ref.buyerDocuments || [],
        available: true
      };
    });
  }

  return {
    reference: reference,
    sellingCosts: sellingCosts,
    inheritance: inheritance,
    deadlines: deadlines,
    full: full,
    _money: money,
    _round2: round2
  };
});