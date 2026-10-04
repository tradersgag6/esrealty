"use strict";
/* The tax engine must never quietly turn an estimate into a payable amount.
   Each check below exists because a plausible shortcut gets it wrong. */
const fs = require("fs");
const path = require("path");
const ROOT = process.cwd();
global.fetch = (u) => {
  const p = path.join(ROOT, String(u).split("?")[0]);
  return Promise.resolve({ ok: fs.existsSync(p), json: () => Promise.resolve(JSON.parse(fs.readFileSync(p, "utf8"))) });
};
const EST = require(path.join(ROOT, "js/estimator.js"));
const TAX = require(path.join(ROOT, "js/value_guide_tax.js"));

let fails = 0;
function chk(n, ok, d) { console.log("  [" + (ok ? "PASS" : "FAIL") + "] " + n + (d ? " -- " + d : "")); if (!ok) fails++; }

(async () => {
  const ref = await TAX.reference();
  chk("tax reference loads", !!ref && !!ref.transaction, ref.version);
  chk("statutory rates are present and sane",
    ref.transaction.find(t => t.key === "capital_gains").ratePct === 6
    && ref.transaction.find(t => t.key === "documentary_stamp").ratePct === 1.5,
    "CGT 6%, DST 1.5%");
  chk("every statutory item states a legal basis",
    ref.transaction.filter(t => t.ratePct != null).every(t => !!t.legalBasis),
    ref.transaction.filter(t => t.ratePct != null).map(t => t.key).join(", "));
  chk("every item with a deadline states the trigger",
    ref.transaction.filter(t => t.deadlineDays != null).every(t => !!t.deadlineFrom), "");
  chk("tax base note includes statutory BIR and assessor values", /BIR zonal reference/.test(ref.taxBaseNote) && /assessor schedule/.test(ref.taxBaseNote), "");
  chk("tax base note uses higher price or statutory FMV", /higher of selling price and statutory fair market value/.test(ref.taxBaseNote), "");
  chk("authority note says the BIR and LGU decide the payable amount",
    /BIR and the LGU determine the actual amounts/i.test(ref.authorityNote), "");

  await EST.loadData();
  /* A real property with real classification and street codes, so the test
     exercises the arithmetic on a figure the app would actually produce. */
  const row = EST.municipalityRow("BAUAN");
  const brgs = await EST.barangays(row.slug);
  const brgy = brgs.filter(b => /^POBLACION III$/i.test(b))[0] || brgs[0];
  const st = await EST.streets(row.slug, brgy);
  const cls = await EST.classificationsFor(row.slug);
  const r = await EST.estimate({
    purpose: "Selling", type: "vacant_lot",
    municipality: "BAUAN", barangay: brgy,
    streetKey: st.streets[0].key, classification: cls[0].code, area: 100
  });
  chk("the tax test property has a real estimate", r.available === true,
    r.available ? ("est " + r.marketGuideEstimate + " zonal " + r.birZonalValue)
      : "reason: " + r.reason);
  if (!r.available) { console.log("\n  ABORT: no estimate to test against"); process.exit(1); }

  const t = TAX.sellingCosts(r, ref);
  const V = r.marketGuideEstimate;
  const fmv = r.taxReferenceValue != null ? r.taxReferenceValue : r.birZonalValue;

  // ---- the base, not the estimate
  chk("tax base is the higher assumed sale price or statutory reference",
    t.taxBase === Math.max(V, fmv), "base=" + t.taxBase + " est=" + Math.round(V) + " fmvProxy=" + Math.round(fmv));
  chk("tax base basis is stated in words", /Highest of/i.test(t.taxBaseBasis), "");
  chk("no fabricated half-zonal proxy", !Object.hasOwn(t, "fmvProxy"), "zonal=" + r.birZonalValue);

  // ---- CGT is on the EXCESS only, never a flat percentage of the price
  const cgt = t.items.find(i => i.key === "capital_gains");
  chk("CGT is six percent of the full applicable base",
    cgt.amount === Math.round(Math.max(V, fmv) * 0.06), "CGT=" + cgt.amount);
  chk("below-zonal price does not erase CGT",
    cgt.amount >= V * 0.06, "price=" + V);
  chk("CGT base is reported so the figure can be checked",
    cgt.baseAmount === Math.round(Math.max(V, fmv)), "baseAmount=" + cgt.baseAmount);
  chk("CGT base label names the statutory rule", /24\(D\)/.test(cgt.base), cgt.base);

  // ---- DST is on the full base
  const dst = t.items.find(i => i.key === "documentary_stamp");
  chk("DST is on the full base", dst.amount === Math.round(t.taxBase * 0.015),
    "DST=" + dst.amount + " expected=" + Math.round(t.taxBase * 0.015));

  const transfer = t.items.find(i => i.key === "transfer");
  chk("transfer tax on the base at 0.5%", transfer.amount === Math.round(t.taxBase * 0.005), "");
  chk("transfer tax names the Local Government Code", /Local Government Code/.test(transfer.legalBasis), transfer.legalBasis);

  // ---- totals reconcile
  const sum = t.items.reduce((a, i) => a + i.amount, 0);
  chk("statutory total equals the sum of its parts", t.statutoryTotal === sum,
    "total=" + t.statutoryTotal + " sum=" + sum);
  chk("net proceeds before commission = estimate - statutory",
    t.netProceeds.beforeCommission === Math.round(V) - t.statutoryTotal, "");
  chk("net proceeds at high commission is lower than before commission",
    t.netProceeds.atHighCommission < t.netProceeds.beforeCommission,
    t.netProceeds.atHighCommission + " < " + t.netProceeds.beforeCommission);
  chk("net proceeds at low commission is higher than at high",
    t.netProceeds.atLowCommission > t.netProceeds.atHighCommission, "");
  chk("broker band is 3% to 5%",
    t.broker.min === Math.round(V * 0.03) && t.broker.max === Math.round(V * 0.05),
    t.broker.min + "-" + t.broker.max);

  // ---- the direction-of-error warning is present and specific
  chk("asset classification and fee allocation disclosed", /capital-asset/.test(t.direction) && /seller-paid/.test(t.direction), "");
  chk("the warning says a higher price raises CGT and DST",
    /higher selling price can raise CGT and DST/i.test(t.direction), "");

  // ---- deadlines
  const dl = TAX.deadlines(ref);
  chk("deadlines are sorted most-urgent first",
    dl.every((d, i) => i === 0 || dl[i - 1].days <= d.days), dl.map(d => d.label + "(" + d.days + "d)").join(", "));
  chk("DST deadline is 10 days after close of document month", dl.some(d => /Documentary/.test(d.label) && d.days === 10 && /close of the month/.test(d.from)), "");
  chk("CGT deadline is 30 days", dl.some(d => /Capital gains/.test(d.label) && d.days === 30), "");
  chk("transfer deadline is 60 days", dl.some(d => /transfer/i.test(d.label) && d.days === 60), "");
  chk("every deadline names its trigger and penalty",
    dl.every(d => !!d.from && !!d.penalty), dl.filter(d => !d.penalty).length + " missing penalties");
  chk("estate deadline is one year from death",
    dl.some(d => /Estate/.test(d.label) && d.days === 365), "");

  // ---- inheritance
  const inh = TAX.inheritance(r, ref);
  chk("no universal extra estate threshold", inh.taxThreshold === 0 && inh.scenarioOnly, "threshold=" + inh.taxThreshold);
  chk("standard deduction is 5,000,000", inh.standardDeduction === 5000000, "");
  chk("estate tax rate is 6%", inh.taxPct === 6, "");
  chk("an ordinary Batangas property shows no estate tax",
    inh.onMarketBasis.tax === 0 && inh.likelyPayable === false,
    "gross on market=" + inh.grossOnMarketBasis + " tax=" + inh.onMarketBasis.tax);
  chk("both gross bases are shown, zonal and market", inh.grossOnZonalBasis !== inh.grossOnMarketBasis,
    inh.grossOnZonalBasis + " vs " + inh.grossOnMarketBasis);
  chk("the threshold note names the TRAIN basis", /TRAIN|10963/.test(inh.basis), inh.basis);

  // ---- a large estate must actually become taxable (guards a hardcoded zero)
  const big = TAX.inheritance({ birZonalValue: 100000000, marketGuideEstimate: 90000000 }, ref);
  chk("a large estate DOES become taxable", big.onMarketBasis.tax > 0,
    "net=" + big.onMarketBasis.afterDeduction + " taxable=" + big.onMarketBasis.taxable + " tax=" + big.onMarketBasis.tax);
  chk("a large citizen/resident estate tax = 6% after standard deduction",
    big.onMarketBasis.tax === 5100000, "tax=" + big.onMarketBasis.tax);

  /* Degenerate inputs must not put NaN or Infinity in the PDF. The notarial
     allowance is a flat peso amount, so even a zero-valued property shows it -
     the check is that every figure stays finite and non-negative, NOT that the
     total is zero. */
  const zero = TAX.sellingCosts({ marketGuideEstimate: 0, birZonalValue: 0 }, ref);
  chk("a zero estimate stays finite and non-negative",
    zero.items.every(i => isFinite(i.amount) && i.amount >= 0)
    && isFinite(zero.taxBase) && zero.taxBase >= 0
    && isFinite(zero.netProceeds.beforeCommission), "total=" + zero.statutoryTotal);
  const undef = TAX.sellingCosts({}, ref);
  chk("a missing estimate does not throw or produce NaN",
    undef.items.every(i => isFinite(i.amount) && i.amount >= 0)
    && isFinite(undef.taxBase) && isFinite(undef.netProceeds.beforeCommission),
    "total=" + undef.statutoryTotal);

  // ---- rates come from data, not from the module
  const custom = JSON.parse(JSON.stringify(ref));
  custom.transaction.find(t2 => t2.key === "documentary_stamp").ratePct = 2;
  const retaxed = TAX.sellingCosts(r, custom);
  chk("changing the data file changes the result (rates are not hardcoded)",
    retaxed.items.find(i => i.key === "documentary_stamp").amount === Math.round(retaxed.taxBase * 0.02), "");

  console.log(fails === 0 ? "\n  TAX ENGINE ALL GREEN" : "\n  " + fails + " FAILURES");
  process.exit(fails === 0 ? 0 : 1);
})().catch(e => { console.error("  CRASH " + e.stack); process.exit(1); });
