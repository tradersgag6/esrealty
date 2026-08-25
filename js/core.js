/* ============================================================
   ES Realty — Financial Engine
   All calculations are deterministic client-side functions with
   documented formulas. AI never "computes" numbers in free text.
   ============================================================ */
(function () {
  "use strict";
  const D = window.ESREALTY.data;

  const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
  const num = (v, dflt) => { const n = parseFloat(String(v == null ? "" : v).replace(/,/g, "")); return isNaN(n) ? (dflt || 0) : n; };
  const money = v => "₱" + Number(v).toLocaleString("en-PH", { maximumFractionDigits: 0 });
  const money2 = v => "₱" + Number(v).toLocaleString("en-PH", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const pct = v => (Number(v) * 100).toFixed(1) + "%";
  const numFmt = v => Number(v).toLocaleString("en-PH", { maximumFractionDigits: 0 });
  /* Display a number with thousands separators for use inside editable numeric
   * inputs; empty/null/non-numeric become "". Decimals preserved up to 6. */
  const fmtNum = v => {
    if (v === "" || v === null || v === undefined) return "";
    const n = Number(v);
    return isNaN(n) ? "" : n.toLocaleString("en-PH", { maximumFractionDigits: 6 });
  };

  /* ---------- Financing ----------
   * Standard amortization formula:
   *   M = P * [ r(1+r)^n ] / [ (1+r)^n - 1 ]
   * where r = annualRate/12, n = years*12
   */
  function calcAmortization(principal, annualRatePct, years) {
    const P = num(principal, 0);
    const r = num(annualRatePct, 0) / 100 / 12;
    const n = Math.max(1, Math.round(num(years, 1) * 12));
    if (P <= 0) return { monthly: 0, totalPayment: 0, totalInterest: 0, n };
    let monthly;
    if (r === 0) { monthly = P / n; }
    else { const f = Math.pow(1 + r, n); monthly = P * r * f / (f - 1); }
    const totalPayment = monthly * n;
    return { monthly, totalPayment, totalInterest: totalPayment - P, n };
  }

  /* ---------- NPV ----------
   * NPV = Σ CF_t / (1+r)^t  for t = 0..N
   */
  function npv(rate, cashflows) {
    const r = num(rate, 0.1);
    return cashflows.reduce((sum, cf, t) => sum + num(cf, 0) / Math.pow(1 + r, t), 0);
  }

  /* ---------- IRR ----------
   * Root of NPV(cashflows) = 0 via Newton-Raphson with bisection fallback.
   * cashflows[0] is the initial investment (negative).
   */
  function irr(cashflows, guess) {
    const flows = cashflows.map(num);
    if (!flows.length) return 0;
    const npvAt = r => flows.reduce((s, cf, t) => s + cf / Math.pow(1 + r, t), 0);
    // Bracket
    let lo = -0.9, hi = 10.0;
    let fLo = npvAt(lo), fHi = npvAt(hi);
    for (let i = 0; i < 200 && fLo * fHi > 0; i++) {
      if (Math.abs(fLo) < Math.abs(fHi)) { lo -= 0.1; fLo = npvAt(lo); }
      else { hi += 0.1; fHi = npvAt(hi); }
      if (hi > 500) return 0; // no real IRR
    }
    let r = guess || 0.1;
    for (let i = 0; i < 200; i++) {
      const f = npvAt(r);
      if (Math.abs(f) < 1e-6) break;
      // numeric derivative
      const h = 1e-6;
      const df = (npvAt(r + h) - npvAt(r - h)) / (2 * h);
      if (Math.abs(df) < 1e-12) { r = (lo + hi) / 2; }
      else { const nr = r - f / df; r = clamp(nr, lo, hi); }
    }
    return r;
  }

  /* ---------- Payback period ----------
   * First period where cumulative cash flow >= 0.
   */
  function payback(cashflows) {
    let cum = 0;
    for (let t = 0; t < cashflows.length; t++) {
      cum += num(cashflows[t], 0);
      if (cum >= 0) return t;
    }
    return cashflows.length;
  }

  /* ---------- Development cost build ----------
   * Construction, site dev (default 8%), professional fees (6%),
   * permits, contingency (10%), marketing (3% of revenue),
   * financing cost during construction (simple interest on construction).
   */
  function developmentCosts(dev) {
    const isSub = dev.devType === "Subdivision";
    const isSubdivisionShophouse = dev.devType === "Subdivision + Shophouse";
    const isLandDevelopment = isSub || isSubdivisionShophouse;
    const lotDevCostPerSqm = num(dev.lotDevCostPerSqm, 0);
    const buildingCostPerSqm = num(dev.constCostPerSqm, 0);
    const constCostPerSqm = isSub ? lotDevCostPerSqm : buildingCostPerSqm;
    let floorArea = num(dev.floorArea, 0);
    let construction = constCostPerSqm * floorArea;
    let lots = 0, lotSqm = 0, netSaleable = floorArea, roadPct = 0, openPct = 0, shophouseLots = 0, rawLotSaleArea = 0;
    if (isLandDevelopment) {
      lots = num(dev.lots, 0);
      lotSqm = num(dev.lotSqm, 0);
      roadPct = clamp(num(dev.roadPct, 20), 0, 90) / 100;
      openPct = clamp(num(dev.openSpacePct, 10), 0, 90) / 100;
      const grossArea = lots * lotSqm;
      netSaleable = grossArea * Math.max(0, 1 - roadPct - openPct);
      if (isSubdivisionShophouse) {
        shophouseLots = Math.min(lots, Math.max(0, num(dev.shophouseLots, 0)));
        rawLotSaleArea = Math.max(0, netSaleable - shophouseLots * lotSqm);
        construction = lotDevCostPerSqm * grossArea + buildingCostPerSqm * floorArea;
      } else {
        floorArea = netSaleable;
        rawLotSaleArea = netSaleable;
        construction = lotDevCostPerSqm * grossArea;
      }
    }
    const siteDevPct = num(dev.siteDevPct, 8) / 100;
    const profPct = num(dev.profFeesPct, 6) / 100;
    const contPct = num(dev.contingencyPct, 10) / 100;
    const siteDev = construction * siteDevPct;
    const profFees = construction * profPct;
    const permits = num(dev.permits, 150000);
    const marketing = num(dev.marketing, 0);
    const amenities = num(dev.amenities, 0);
    const base = construction + siteDev + profFees + permits + amenities;
    const contingency = base * contPct;
    // Carrying costs while the project is being built (property tax / RPT,
    // insurance, security, utilities) — applied over the build period.
    const carryingMonthly = num(dev.carryingMonthly, 0);
    const carrying = carryingMonthly * Math.max(0, num(dev.buildMonths, 0));
    const total = base + contingency + marketing + carrying;
    return {
      constCostPerSqm, floorArea, construction, siteDev, siteDevPct, profFees, profPct,
      permits, contingency, contingencyPct: contPct, marketing, amenities, base, total,
      carryingMonthly, carrying,
      isSubdivision: isSub, isSubdivisionShophouse, lots, lotSqm, netSaleable, roadPct, openPct,
      shophouseLots, rawLotSaleArea, lotDevCostPerSqm, buildingCostPerSqm
    };
  }

  /* ---------- Financing cost during construction ----------
   * Interest on the drawn construction loan, simple interest,
   * assuming construction loan = construction+soft costs and
   * funds drawn uniformly over build months.
   */
  function constructionFinanceCost(devCosts, loanRatePct, buildMonths, loanPct) {
    const loanAmount = devCosts.total * clamp(num(loanPct, 60), 0, 100) / 100;
    const ratePerMonth = num(loanRatePct, 7.5) / 100 / 12;
    const months = Math.max(1, num(buildMonths, 12));
    // average outstanding balance ≈ half of loan during construction
    return loanAmount * ratePerMonth * (months + 1) / 2;
  }

  /* ---------- Sales & returns ---------- */
  function salesReturns(s, devCosts, acquisition, financingCost, taxContext) {
    const saleablePct = clamp(num(s.saleablePct, 82), 0, 100) / 100;
    const sellPricePerSqm = num(s.sellPricePerSqm, 0);
    const isRawLandSale = !devCosts.isSubdivision && !devCosts.isSubdivisionShophouse && devCosts.floorArea <= 0;
    const saleableArea = devCosts.isSubdivision ? devCosts.netSaleable : isRawLandSale ? num(taxContext && taxContext.lotArea, 0) : devCosts.floorArea * saleablePct;
    const lotSellPricePerSqm = num(s.landSellPricePerSqm, sellPricePerSqm);
    const shophouseRevenue = devCosts.isSubdivisionShophouse ? sellPricePerSqm * saleableArea : 0;
    const lotRevenue = devCosts.isSubdivisionShophouse ? lotSellPricePerSqm * devCosts.rawLotSaleArea : 0;
    const grossRevenue = devCosts.isSubdivisionShophouse ? shophouseRevenue + lotRevenue : sellPricePerSqm * saleableArea;
    // Philippine transfer taxes are generally based on the higher of contract
    // price, fair market value, or BIR zonal value. Cost allocation remains
    // negotiable between buyer and seller.
    const taxBase = Math.max(grossRevenue, num(taxContext && taxContext.estMarketValue, 0), num(taxContext && taxContext.birZonalValue, 0));
    const defaultTransferTaxPct = taxContext && (taxContext.region === "NCR" || taxContext.province === "Metro Manila") ? 0.75 : 0.5;
    const cgtPct = clamp(num(s.cgtPct, 6), 0, 25) / 100;
    const dstPct = clamp(num(s.dstPct, 1.5), 0, 25) / 100;
    const transferTaxPct = clamp(num(s.transferTaxPct, defaultTransferTaxPct), 0, 25) / 100;
    const registrationFeePct = clamp(num(s.registrationFeePct, 0.25), 0, 25) / 100;
    const notarialFeePct = clamp(num(s.notarialFeePct, 0.5), 0, 25) / 100;
    const brokerPct = clamp(num(s.brokerPct, 3), 0, 15) / 100;
    const vatPct = clamp(num(s.vatPct, 0), 0, 25) / 100;
    const otherSellPct = clamp(num(s.sellingCostPct, 5), 0, 30) / 100;
    const fee = (amount, rate) => Math.max(0, num(amount, 0)) || taxBase * rate;
    const cgt = fee(s.cgtAmount, cgtPct);
    const dst = fee(s.dstAmount, dstPct);
    const transferTax = fee(s.transferTaxAmount, transferTaxPct);
    const registrationFee = fee(s.registrationFeeAmount, registrationFeePct);
    const notarialFee = fee(s.notarialFeeAmount, notarialFeePct);
    const brokerFee = grossRevenue * brokerPct;
    const vat = grossRevenue * vatPct;
    const transferCost = cgt + dst + transferTax + registrationFee + notarialFee;
    const transferCostPct = taxBase > 0 ? transferCost / taxBase : 0;
    const otherSell = grossRevenue * otherSellPct;
    const sellingCosts = transferCost + brokerFee + vat + otherSell;
    const sellPct = grossRevenue > 0 ? sellingCosts / grossRevenue : 0;
    const netRevenue = grossRevenue - sellingCosts;

    // Rental (hold) path
    const rentalRatePerSqm = num(s.rentalRatePerSqm, 0);
    const leasablePct = clamp(num(s.leasablePct, 70), 0, 100) / 100;
    const occupancy = clamp(num(s.occupancyPct, 90), 0, 100) / 100;
    const opCostPct = clamp(num(s.opCostPct, 25), 0, 100) / 100;
    const annualRent = rentalRatePerSqm * devCosts.floorArea * leasablePct * occupancy * 12;
    const annualOpEx = annualRent * opCostPct;
    const noi = annualRent - annualOpEx;
    const capRate = devCosts.total > 0 ? noi / devCosts.total : 0;
    const totalDevCost = devCosts.total + financingCost;

    // Total cash invested = land + fees + dev cost + financing (equity portion handled separately)
    const investment = acquisition.landCost + acquisition.totalFees + totalDevCost;
    const profit = netRevenue - investment;
    const roi = investment > 0 ? profit / investment : 0;
    const profitMargin = grossRevenue > 0 ? profit / grossRevenue : 0;
    const appreciation = clamp(num(s.appreciationRate, 7), 0, 30) / 100;
    const holdYears = clamp(num(s.holdYears, 5), 1, 30);
    const discountRate = num(s.discountRate, 10) / 100;

    // Build cash flow series for NPV / IRR
    // t=0: -investment ; each year net cash + appreciation on exit at year holdYears
    const cashflows = [-investment];
    for (let y = 1; y <= holdYears; y++) {
      const isExit = y === holdYears;
      const operating = noi - (acquisition.debtService || 0);
      const exitProceeds = isExit ? netRevenue * Math.pow(1 + appreciation, holdYears) : 0;
      cashflows.push(operating + exitProceeds);
    }
    const irrVal = irr(cashflows);
    const npvVal = npv(discountRate, cashflows);
    const paybackYears = payback(cashflows);
    const cashOnCash = (acquisition.equity || 1) > 0 ? (noi - (acquisition.debtService || 0)) / (acquisition.equity || 1) : 0;
    const grossRentMultiplier = noi > 0 ? totalDevCost / noi : 0;

    return {
      saleableArea, grossRevenue, taxBase, sellingCosts, netRevenue, annualRent, annualOpEx, noi,
      lotSellPricePerSqm, lotRevenue, shophouseRevenue,
      capRate, investment, profit, roi, profitMargin, appreciation, holdYears, discountRate,
      cashflows, irr: irrVal, npv: npvVal, paybackYears, cashOnCash, grossRentMultiplier,
      totalDevCost, breakEvenUnits: grossRevenue > 0 ? Math.ceil(totalDevCost / (grossRevenue / Math.max(1, num(s.units, 1)))) : 0,
      sellPct, cgtPct, dstPct, transferTaxPct, registrationFeePct, notarialFeePct, brokerPct, vatPct, transferCostPct, otherSellPct,
      cgt, dst, transferTax, registrationFee, notarialFee, brokerFee, vat, transferCost, otherSell,
      cgtEffectivePct: taxBase > 0 ? cgt / taxBase : 0, dstEffectivePct: taxBase > 0 ? dst / taxBase : 0,
      transferTaxEffectivePct: taxBase > 0 ? transferTax / taxBase : 0, registrationFeeEffectivePct: taxBase > 0 ? registrationFee / taxBase : 0,
      notarialFeeEffectivePct: taxBase > 0 ? notarialFee / taxBase : 0
    };
  }

  /* ---------- Acquisition ---------- */
  function acquisitionCosts(purchase, financing, financingCost) {
    const price = num(purchase.price, 0);
    const negotiated = num(purchase.negotiatedPrice, price) || price;
    const taxes = num(purchase.taxes, 0);
    const transferFees = num(purchase.transferFees, 0);
    const legalFees = num(purchase.legalFees, 0);
    const surveyCost = num(purchase.surveyCost, 0);
    const miscCost = num(purchase.miscCost, 0);
    const totalFees = taxes + transferFees + legalFees + surveyCost + miscCost;
    const landCost = negotiated;
    const acquisitionCost = landCost + totalFees;

    const finType = financing.type || "Cash";
    const isLoan = finType !== "Cash";
    const loanPct = clamp(num(financing.loanPct, isLoan ? 60 : 0), 0, 100) / 100;
    const loanAmount = landCost * loanPct;
    const am = calcAmortization(loanAmount, num(financing.interestRate, 7.5), num(financing.years, 15));
    const equity = landCost - loanAmount + totalFees + financingCost;

    // Bank / Pag-IBIG loan eligibility check. Typical PH LTV caps by program;
    // Pag-IBIG loan ceiling is ₱6.0M.
    const LTV_CAPS = { "Bank Loan": 0.7, "Pag-IBIG": 0.85, "Private Investor": 0.6, "Seller Financing": 0.7, "Joint Venture": 0.7, "Cash": 0 };
    const PAGIBIG_MAX = 6000000;
    const ltvCap = clamp(LTV_CAPS[finType] !== undefined ? LTV_CAPS[finType] : 0.7, 0, 1);
    let loanEligible = landCost * ltvCap;
    if (finType === "Pag-IBIG") loanEligible = Math.min(loanEligible, PAGIBIG_MAX);
    const loanShortfall = Math.max(0, loanAmount - loanEligible);

    return {
      price, negotiated, landCost, taxes, transferFees, legalFees, surveyCost, miscCost,
      totalFees, acquisitionCost, loanAmount, loanPct, monthly: am.monthly, debtService: am.monthly * 12,
      totalInterest: am.totalInterest, totalPayment: am.totalPayment, equity, isLoan, finType,
      ltvCap, loanEligible, loanShortfall
    };
  }

  /* ---------- Master model ---------- */
  function model(raw) {
    const p = raw.property || {};
    const purchase = raw.purchase || {};
    const financing = raw.financing || {};
    const dev = raw.development || {};
    const sales = raw.sales || {};
    const location = raw.location || {};

    const benchmark = D.benchmarkFor(p.city);
    const marketValuePerSqm = num(p.marketValuePerSqm, benchmark);
    const birZonalPerSqm = num(p.birZonalPerSqm, marketValuePerSqm * D.BIR_ZONAL_RATIO);
    const estMarketValue = marketValuePerSqm * num(p.lotArea, 0);
    const birZonalValue = birZonalPerSqm * num(p.lotArea, 0);

    const devCosts = developmentCosts(dev);
    const finCostConst = constructionFinanceCost(devCosts, num(financing.interestRate, 7.5), num(dev.buildMonths, 12), num(financing.loanPct, 60));
    const acquisition = acquisitionCosts(purchase, financing, finCostConst);
    const sr = salesReturns(sales, devCosts, acquisition, finCostConst, { region: p.region, province: p.province, lotArea: num(p.lotArea, 0), estMarketValue, birZonalValue });

    return {
      property: p, marketValuePerSqm, birZonalPerSqm, estMarketValue, birZonalValue,
      acquisition, development: devCosts, financingCost: finCostConst, returns: sr,
      location, sales
    };
  }

  /* ---------- Scenarios ----------
   * Re-run the engine with scenario-specific assumptions.
   */
  const SCENARIOS = {
    "buyhold":  { label: "Buy & Hold", devType: "Vacant Lot", far: 1.0, desc: "Buy raw land, rent or wait, sell later." },
    "develop_sell": { label: "Develop & Sell", devType: "Townhouse", far: 1.2, desc: "Quick build and sell all units." },
    "apartment": { label: "Build Apartment", devType: "Apartment", far: 1.5, desc: "Multi-unit rental income." },
    "shophouse": { label: "Build Shophouse", devType: "Shophouse", far: 1.2, desc: "Retail at ground, residential above." },
    "subdivide": { label: "Subdivide Only", devType: "Subdivision", far: 0.6, desc: "Subdivide and sell individual lots." },
    "subdivide_shophouse": { label: "Subdivide + Build Shophouses", devType: "Subdivision + Shophouse", far: 0, desc: "Sell developed lots and finished shophouses." },
    "raw_land": { label: "Sell Raw Land", devType: "Vacant Lot", far: 0, desc: "Flip the land as-is for quick return." },
    "commercial": { label: "Commercial Strip", devType: "Commercial", far: 1.0, desc: "Rentable commercial spaces." },
    "mixed": { label: "Mixed Use", devType: "Mixed Use", far: 1.5, desc: "Combine residential + commercial." }
  };

  function buildScenario(raw, key) {
    const sc = SCENARIOS[key];
    if (!sc) return null;
    const base = JSON.parse(JSON.stringify(raw));
    const p = base.property, dev = base.development, sales = base.sales;
    const lotArea = num(p.lotArea, 200);
    dev.devType = sc.devType;
    dev.far = sc.far;

    if (key === "raw_land" || key === "buyhold") {
      dev.constCostPerSqm = 0; dev.floorArea = 0; dev.buildMonths = 0;
      sales.saleMode = "sell";
      sales.sellPricePerSqm = Math.round(base.marketValuePerSqm && p.marketValuePerSqm ? p.marketValuePerSqm * 1.15 : D.benchmarkFor(p.city) * 1.15);
      sales.rentalRatePerSqm = key === "buyhold" ? (num(sales.rentalRatePerSqm, 0) || 150) : 0;
      sales.holdYears = key === "buyhold" ? 10 : 2;
      sales.saleablePct = 100;
      base.acquisitionHint = "raw_land";
    } else if (key === "subdivide_shophouse") {
      dev.lots = Math.max(2, Math.floor(lotArea * 0.7 / 80));
      dev.lotSqm = 80;
      dev.shophouseLots = Math.min(2, dev.lots);
      dev.floorArea = dev.shophouseLots * 120;
      dev.lotDevCostPerSqm = num(dev.lotDevCostPerSqm, 3500) || 3500;
      dev.constCostPerSqm = num(dev.constCostPerSqm, 42000) || 42000;
      dev.buildMonths = 18;
      sales.saleMode = "sell";
      sales.sellPricePerSqm = num(sales.sellPricePerSqm, 0) || Math.round(D.benchmarkFor(p.city) * 2.6);
      sales.landSellPricePerSqm = num(sales.landSellPricePerSqm, 0) || Math.round(D.benchmarkFor(p.city) * 1.2);
      sales.holdYears = 3;
      base.acquisitionHint = "develop";
    } else {
      const buildable = lotArea * dev.far;
      const floors = key === "apartment" || key === "mixed" ? 3 : key === "commercial" ? 1 : 2;
      dev.floorArea = buildable * floors * 0.82;
      dev.constCostPerSqm = num(dev.constCostPerSqm, 38000) || 38000;
      dev.buildMonths = 12;
      sales.saleMode = (key === "apartment" || key === "commercial" || key === "mixed") ? "rent" : "sell";
      sales.sellPricePerSqm = num(sales.sellPricePerSqm, 0) || Math.round(D.benchmarkFor(p.city) * 2.4);
      sales.rentalRatePerSqm = num(sales.rentalRatePerSqm, 0) || (key === "commercial" ? 800 : 450);
      sales.holdYears = key === "buyhold" ? 10 : (sales.saleMode === "rent" ? 10 : 3);
      base.acquisitionHint = "develop";
    }
    const m = model(base);
    return { key, label: sc.label, desc: sc.desc, devType: sc.devType, far: sc.far, m, pass: m.returns.roi >= 0.08 || m.returns.irr >= 0.1 };
  }

  function buildAllScenarios(raw) {
    return Object.keys(SCENARIOS).map(k => buildScenario(raw, k)).filter(Boolean);
  }

  /* ---------- AI simulation layer (deterministic, labeled as AI)
   * Scores are computed from input data with documented heuristics.
   * In production these would be replaced by OpenAI function-calling.
   * ---------- */
  function locationAnalysis(raw) {
    const p = raw.property || {};
    const loc = raw.location || {};
    const benchmark = D.benchmarkFor(p.city);
    const priceRatio = benchmark > 0 ? num(p.marketValuePerSqm, benchmark) / benchmark : 1;

    // Availability of nearby amenities
    const near = loc.nearby || {};
    const present = D.NEARBY_TYPES.filter(t => near[t]).length;
    const amenityScore = clamp(35 + present * 8, 30, 95);

    const accessibility = clamp(num(loc.accessibilityScore, 60), 0, 100);
    const traffic = clamp(100 - num(loc.trafficScore, 40), 0, 100);
    const population = clamp(num(loc.populationScore, 60), 0, 100);
    const future = clamp(num(loc.futureDevScore, 60), 0, 100);
    const commercial = clamp(num(loc.commercialGrowthScore, 60), 0, 100);
    const competition = clamp(100 - num(loc.competitionScore, 40), 0, 100);
    const growth = clamp(num(p.growthRate, 0.07) * 700, 0, 95);

    const locationScore = Math.round(0.3 * accessibility + 0.2 * population + 0.2 * future + 0.15 * growth + 0.15 * amenityScore);
    const demandScore = Math.round(0.35 * population + 0.3 * commercial + 0.2 * growth + 0.15 * accessibility);
    const commercialScore = Math.round(0.35 * commercial + 0.3 * traffic + 0.2 * competition + 0.15 * demandScore);
    const investmentScore = Math.round(0.4 * locationScore + 0.3 * commercialScore + 0.3 * demandScore);

    const rationales = {
      location: "Located in " + (p.city || "the area") + " with " + present + "/" + D.NEARBY_TYPES.length + " nearby establishment types, accessibility " + accessibility + "/100, population growth " + pct(growth / 100) + ".",
      demand: "Demand driven by population score " + population + "/100, commercial momentum " + commercial + "/100 and appreciation " + pct(num(p.growthRate, 0.07)) + "/yr.",
      commercial: "Commercial viability from traffic " + traffic + "/100, competition-adjusted " + competition + "/100, and neighborhood commercial activity " + commercial + "/100.",
      investment: "Weighted blend of location (" + locationScore + "), commercial (" + commercialScore + ") and demand (" + demandScore + ")."
    };

    return { locationScore, demandScore, commercialScore, investmentScore, rationales, amenityScore, present };
  }

  const RISK_TYPES = ["Flood", "Earthquake", "Legal", "Market", "Construction", "Financing", "Vacancy", "Economic", "Political"];

  function riskAnalysis(raw) {
    const p = raw.property || {};
    const loc = raw.location || {};
    const floodMap = { none: "low", low: "low", medium: "medium", high: "high" };
    const flood = floodMap[String(p.floodRisk || "low").toLowerCase()] || "low";
    const risks = [];

    risks.push({ name: "Flood", level: flood, mitigation: "Verify flood maps with DENR/MGB and consider elevated design.", basis: "Flood risk input: " + (p.floodRisk || "Low") });
    risks.push({ name: "Earthquake", level: "medium", mitigation: "Use seismic design code (NSCP 2015) for any construction.", basis: "Philippines sits on the Pacific Ring of Fire." });
    risks.push({ name: "Legal", level: p.titleNumber ? "low" : "medium", mitigation: p.titleNumber ? "Title on file; verify annotations at LRA." : "Request TCT/OCT and tax declaration before closing.", basis: p.titleNumber ? "Title number captured." : "No title number captured." });
    risks.push({ name: "Market", level: priceLevel(p, loc), mitigation: "Stress-test exit price by -15% before committing.", basis: "Price/sqm vs " + (p.city || "area") + " benchmark." });
    risks.push({ name: "Construction", level: num((raw.development || {}).constCostPerSqm, 0) > 0 ? "medium" : "low", mitigation: "Lock lump-sum contracts and 10% contingency.", basis: "Construction type: " + ((raw.building || {}).constructionType || "Vacant lot") });
    risks.push({ name: "Financing", level: num((raw.financing || {}).interestRate, 0) >= 10 ? "medium" : "low", mitigation: "Compare rates across banks; consider fixed-rate terms.", basis: "Financing rate " + (num((raw.financing || {}).interestRate, 0)) + "%" });
    risks.push({ name: "Vacancy", level: num((raw.sales || {}).occupancyPct, 90) < 80 ? "medium" : "low", mitigation: "Pre-lease before completion to close the gap.", basis: "Assumed occupancy " + (raw.sales || {}).occupancyPct + "%" });
    risks.push({ name: "Economic", level: num(p.growthRate, 0.07) < 0.05 ? "medium" : "low", mitigation: "Recheck against inflation and regional growth outlook.", basis: "Assumed appreciation " + pct(num(p.growthRate, 0.07)) + "/yr" });
    risks.push({ name: "Political", level: "low", mitigation: "Monitor local land-use plan changes.", basis: "General political stability assumed." });

    const score = Math.round(100 - risks.reduce((s, r) => s + (r.level === "high" ? 16 : r.level === "medium" ? 8 : 3), 0));
    return { risks, score: clamp(score, 10, 98), types: RISK_TYPES };
  }

  function priceLevel(p, loc) {
    const bench = D.benchmarkFor(p.city);
    const ratio = bench > 0 ? num(p.marketValuePerSqm, bench) / bench : 1;
    if (ratio >= 1.25) return "high";
    if (ratio >= 1.05) return "medium";
    return "low";
  }

  function highestBestUse(raw) {
    const p = raw.property || {};
    const loc = raw.location || {};
    const floor = Math.max(0, num(p.lotArea, 0));
    const benchmark = D.benchmarkFor(p.city);
    const commercialScore = num(loc.commercialGrowthScore, 60);
    const demand = num(loc.populationScore, 60);
    const isUrban = benchmark >= 20000;

    let recommendation;
    if (num((raw.development || {}).devType, "") === "Vacant Lot" || !raw.development) {
      recommendation = { devType: "Vacant Lot", label: "Hold as Vacant Lot", reasons: ["No development intent captured", "Lowest capital at risk"] };
    } else if (commercialScore >= 70 && isUrban) {
      recommendation = { devType: "Mixed Use", label: "Mixed Use (residential + commercial)", reasons: ["High commercial momentum (" + commercialScore + "/100)", "Urban price benchmark (₱" + numFmt(benchmark) + "/sqm)"] };
    } else if (demand >= 65) {
      recommendation = { devType: "Apartment", label: "Build Apartment", reasons: ["Strong population/demand score (" + demand + "/100)", "Recurring rental income"] };
    } else if (floor >= 500) {
      recommendation = { devType: "Subdivision", label: "Subdivide & Sell", reasons: ["Large lot (" + numFmt(floor) + " sqm) suited to lot sales", "Lower construction risk"] };
    } else {
      recommendation = { devType: "Townhouse", label: "Build Townhouse", reasons: ["Compact buildable footprint", "Fast construction-to-sale cycle"] };
    }
    return { recommendation, commercialScore, demand, benchmark };
  }

  function recommend(raw) {
    const m = model(raw);
    const loc = locationAnalysis(raw);
    const risk = riskAnalysis(raw);
    const hbu = highestBestUse(raw);
    const r = m.returns;

    let total = Math.round(loc.investmentScore * 0.4 + risk.score * 0.4 + Math.min(100, Math.max(0, r.roi * 150 + 40)) * 0.2);
    total = clamp(total, 5, 98);
    const grade = total >= 85 ? "A+" : total >= 75 ? "A" : total >= 65 ? "B+" : total >= 55 ? "B" : total >= 45 ? "C" : total >= 35 ? "D" : "F";
    const pass = total >= 55 && r.roi >= 0.05;

    const strengths = [], weaknesses = [], hiddenRisks = [];
    if (r.roi >= 0.15) strengths.push("Projected ROI of " + pct(r.roi) + " is well above the 8% target.");
    if (r.irr >= 0.12) strengths.push("Projected IRR of " + pct(r.irr) + " exceeds a 10% hurdle rate.");
    if (loc.locationScore >= 65) strengths.push("Strong location score " + loc.locationScore + "/100 for " + (m.property.city || "the area") + ".");
    if (risk.score >= 70) strengths.push("Overall low risk profile (score " + risk.score + "/100).");
    if (r.roi < 0.08) weaknesses.push("Projected ROI " + pct(r.roi) + " is below the 8% target — revisit pricing or cost.");
    if (r.capRate < 0.05 && m.sales.saleMode === "rent") weaknesses.push("Cap rate " + pct(r.capRate) + " is thin for a hold strategy.");
    if (loc.demandScore < 50) weaknesses.push("Demand score " + loc.demandScore + "/100 suggests soft absorption.");
    const hi = risk.risks.filter(x => x.level === "high");
    if (hi.length) hiddenRisks.push(hi.map(x => x.name).join(", ") + " rated HIGH — see mitigation.");
    if (m.acquisition.totalFees > 0.06 * m.acquisition.acquisitionCost) hiddenRisks.push("Closing fees are " + pct(m.acquisition.totalFees / m.acquisition.acquisitionCost) + " of acquisition cost.");

    const growth = num(m.property.growthRate, 0.07);
    const suggestedOffer = Math.round(m.acquisition.negotiated * 0.94);
    const maxPrice = Math.round(m.estMarketValue * 0.92);

    return {
      total, grade, pass, verdict: pass ? "PASS — proceed subject to due diligence." : "REJECT — do not acquire at current terms.",
      loc, risk, hbu, strengths, weaknesses, hiddenRisks, suggestedOffer, maxPrice,
      expectedAppreciation: pct(growth) + "/yr",
      recommendation: hbu.recommendation.label
    };
  }

  /* ---------- Simple text analysis for assistant ---------- */
  function assistantAnswer(q, raw) {
    const m = raw ? model(raw) : null;
    const ql = q.toLowerCase();
    if (!m) return "Load a property first so I can analyze it. Use New Investment to create one.";
    if (ql.includes("roi") || ql.includes("return")) return "Projected ROI is " + pct(m.returns.roi) + " (IRR " + pct(m.returns.irr) + ", NPV " + money(m.returns.npv) + "). Profit " + money(m.returns.profit) + " on " + money(m.returns.investment) + " invested.";
    if (ql.includes("cash") || ql.includes("equity")) return "Total cash required is " + money(m.acquisition.equity) + " (loan " + money(m.acquisition.loanAmount) + " at " + m.acquisition.finType + "). Monthly debt service " + money(m.acquisition.monthly) + ".";
    if (ql.includes("risk")) {
      const r = riskAnalysis(raw);
      return "Risk score " + r.score + "/100. Top concern: " + r.risks[0].name + " (" + r.risks[0].level + ") — " + r.risks[0].mitigation;
    }
    if (ql.includes("location") || ql.includes("area")) {
      const l = locationAnalysis(raw);
      return "Location score " + l.locationScore + "/100. " + l.rationales.location;
    }
    if (ql.includes("price") || ql.includes("offer") || ql.includes("negotiat")) {
      const rec = recommend(raw);
      return "Suggested negotiation price " + money(rec.suggestedOffer) + "; maximum purchase price " + money(rec.maxPrice) + ".";
    }
    if (ql.includes("grade") || ql.includes("recommend")) {
      const rec = recommend(raw);
      return "Overall grade " + rec.grade + " (" + rec.total + "/100). " + rec.verdict + " Best use: " + rec.hbu.recommendation.label;
    }
    return "I can answer about ROI, cash/equity, risk, location, price, and grade for the loaded property. This is an automated analysis for informational purposes only.";
  }

  /* ---------- Appraisal (PVS 3rd Ed. aligned — draft valuation) ----------
   * Produces a computer-assisted draft valuation for professional review.
   * It is NOT a certified appraisal; certification requires a PRC-licensed
   * Real Estate Appraiser under RA 9646 to review and sign the report.
   * AI never concludes the value — it only drafts suggested adjustments and
   * reconciliation notes that the appraiser must review and may override.
   */
  const APPRAISAL_ELEMENTS = [
    "Property Rights Conveyed", "Financing Terms", "Conditions of Sale",
    "Market Conditions (Time)", "Location", "Size",
    "Shape / Frontage", "Improvements", "Condition",
    "Zoning / Land Use", "Corner / Lot Type", "Road Right-of-Way & Access",
    "Topography / Elevation", "Flood / Geohazard"
  ];

  const _monthsBetween = (a, b) => {
    const da = a ? new Date(a) : null, db = b ? new Date(b) : null;
    if (!da || !db || isNaN(da) || isNaN(db)) return 0;
    return Math.round((db - da) / (1000 * 60 * 60 * 24 * 30.44));
  };
  const _r1 = v => Math.round(num(v, 0) * 10) / 10;

  function appraisalSuggestAdjustments(raw, comp, effectiveDate) {
    const p = raw.property || {};
    const sBench = D.benchmarkFor(p.city);
    const cBench = D.benchmarkFor(comp.city || comp.address || "");
    const growth = num(p.growthRate, 0.07);
    const months = _monthsBetween(comp.saleDate, effectiveDate);
    const s = {};

    s["Property Rights Conveyed"] = { value: 0, basis: "Fee simple estate assumed for subject and comparable; no leasehold/bundle-of-rights adjustment required." };
    s["Financing Terms"] = { value: 0, basis: "Cash-equivalent pricing assumed (arm's-length)." };

    let cond = 0, condBasis = "Arm's-length closed sale; no condition-of-sale adjustment required.";
    if (comp.transactionType === "auction") { cond = -5; condBasis = "Auction sale — non-arm's-length forced disposition; downward adjustment for marketing/compulsion."; }
    else if (comp.transactionType === "listing") { cond = -1; condBasis = "Listing price, not a closed transaction; small haircut applied for negotiation gap."; }
    s["Conditions of Sale"] = { value: cond, basis: condBasis };

    const timeAdj = _r1((months / 12) * growth * 100);
    s["Market Conditions (Time)"] = { value: timeAdj, basis: months + " months elapsed at " + pct(growth) + "/yr assumed appreciation in " + (p.city || "the market") + "." };

    if (cBench > 0 && sBench > 0) {
      const locAdj = _r1((sBench - cBench) / cBench * 100);
      s["Location"] = { value: locAdj, basis: "Subject benchmark " + money(sBench) + "/sqm (" + (p.city || "n/a") + ") vs comparable " + money(cBench) + "/sqm (" + (comp.city || "n/a") + ")." };
    } else {
      s["Location"] = { value: 0, basis: "No benchmark differential computed — location adjustment left at 0 for appraiser review." };
    }

    const sArea = num(p.lotArea, 0), cArea = num(comp.lotArea, sArea || 200);
    if (sArea > 0 && cArea > 0 && cArea !== sArea) {
      const sizeAdj = _r1(((sArea - cArea) / Math.max(sArea, cArea)) * 12);
      s["Size"] = { value: sizeAdj, basis: "Subject lot " + numFmt(sArea) + " sqm vs comparable " + numFmt(cArea) + " sqm; economies-of-scale curve applied." };
    } else {
      s["Size"] = { value: 0, basis: "Lot areas comparable or not provided." };
    }

    s["Shape / Frontage"] = { value: 0, basis: "Assuming comparable utility/frontage; adjust if subject is irregular or landlocked." };
    s["Improvements"] = { value: 0, basis: "No adjustment default — verify improvements against subject." };
    s["Condition"] = { value: 0, basis: "Condition parity assumed pending inspection." };

    const sZone = String(p.zoning || p.landUse || "").toLowerCase();
    const cZone = String(comp.zoning || comp.landUse || "").toLowerCase();
    if (sZone && cZone) {
      const zoneAdj = sZone === cZone ? 0 : (sZone.indexOf("commercial") !== -1 && cZone.indexOf("residential") !== -1 ? 8 : (cZone.indexOf("commercial") !== -1 && sZone.indexOf("residential") !== -1 ? -8 : 0));
      s["Zoning / Land Use"] = { value: zoneAdj, basis: zoneAdj === 0
        ? "Zoning parity assumed (" + (sZone || "unspecified") + ")."
        : "Subject '" + sZone + "' vs comparable '" + cZone + "' — commercial-zoned land commands a premium over residential in PH practice; ±8% applied pending appraiser review." };
    } else {
      s["Zoning / Land Use"] = { value: 0, basis: "Verify zoning class of both parcels against the CLUP / LGU zoning certificate before concluding." };
    }

    let cornerAdj = 0, cornerBasis = "Lot-type parity assumed (interior vs corner).";
    if (p.lotType === "Corner" || p.isCorner === true) { cornerAdj = 6; cornerBasis = "Subject is a corner lot — commercial visibility/dual-access premium of ~6% applied (typical PH range 5–10%)."; }
    else if (p.lotType === "Through" || p.throughLot === true) { cornerAdj = 4; cornerBasis = "Through lot — dual frontage premium ~4% applied."; }
    else if (comp.lotType === "Corner" || comp.isCorner === true) { cornerAdj = -6; cornerBasis = "Comparable is a corner lot while subject is interior — downward adjustment applied."; }
    s["Corner / Lot Type"] = { value: cornerAdj, basis: cornerBasis };

    const rt = String(p.roadType || "").toLowerCase(), rw = num(p.roadWidth, 0);
    if (rt.indexOf("no road") !== -1 || rt.indexOf("landlocked") !== -1 || rw === 0) {
      s["Road Right-of-Way & Access"] = { value: -25, basis: "Landlocked or no registered RROW — major negative adjustment (-25%; PH practice range −20% to −40%) per Sec. 26 RA 7160 practical access test." };
    } else if (rw > 0 && rw < 5) {
      s["Road Right-of-Way & Access"] = { value: -6, basis: "Narrow ROW (" + numFmt(rw) + " m, below the 5 m minimum for standard vehicular access) — modest negative adjustment." };
    } else {
      s["Road Right-of-Way & Access"] = { value: 0, basis: "Adequate registered access via " + (rt || "public road") + (rw > 0 ? " (" + numFmt(rw) + " m wide)." : ".") };
    }

    s["Topography / Elevation"] = { value: 0, basis: "Assumed similar rolling-to-level terrain; adjust for steep slope, fill requirement, or retention/flood-mitigation cost." };

    const fr = String(p.floodRisk || "").toLowerCase();
    const floodMap = { high: -8, medium: -4, moderate: -4, low: 0 };
    const fVal = floodMap[fr] != null ? floodMap[fr] : 0;
    s["Flood / Geohazard"] = { value: fVal, basis: fVal < 0
      ? "Subject flagged '" + p.floodRisk + "' flood susceptibility — market-documented discount applied; cross-check MGB geohazard map and confirm with insurer."
      : "Low/no flood exposure recorded; verify against MGB geohazard and Project NOAH maps during inspection." };
    return s;
  }

  function appraisalCompute(engagement, raw) {
    const p = raw.property || {};
    const comps = (engagement.comparables || []).filter(c => num(c.lotArea, 0) > 0);
    const adjRows = engagement.adjustments || [];
    const subjectArea = num(p.lotArea, 0);

    const adjusted = comps.map(c => {
      const cells = adjRows.filter(a => a.comparableId === c.id);
      const totalPct = cells.reduce((s, a) => s + num(a.value, 0), 0);
      const price = num(c.price, 0);
      const lot = num(c.lotArea, 1);
      const adjPrice = price * (1 + totalPct / 100);
      return {
        id: c.id, address: c.address, city: c.city, price, lotArea: lot, saleDate: c.saleDate,
        transactionType: c.transactionType, source: c.source, totalPct,
        rawPsm: price / lot, adjPsm: adjPrice / lot, adjPrice, totalAbs: Math.abs(totalPct), cells
      };
    });

    const weights = adjusted.map(x => 1 / (1 + x.totalAbs));
    const wSum = weights.reduce((s, w) => s + w, 0);
    const wAvgPsm = adjusted.length ? adjusted.reduce((s, x, i) => s + x.adjPsm * weights[i], 0) / (wSum || 1) : 0;
    const simpleAvgPsm = adjusted.length ? adjusted.reduce((s, x) => s + x.adjPsm, 0) / adjusted.length : 0;
    const salesIndicated = subjectArea * wAvgPsm;
    const bestComp = adjusted.slice().sort((a, b) => a.totalAbs - b.totalAbs)[0] || null;

    const c = engagement.cost || {};
    const constType = (raw.building || {}).constructionType || "CHB / Masonry";
    const defaultRcn = D.CONSTRUCTION_COST[constType] || 15000;
    const landValuePerSqm = num(c.landValuePerSqm, 0) || (subjectArea > 0 ? salesIndicated / subjectArea : 0);
    const landValue = landValuePerSqm * subjectArea;
    const bldgArea = num(c.bldgArea, subjectArea);
    const rcnPerSqm = num(c.rcnPerSqm, defaultRcn);
    const rcn = rcnPerSqm * bldgArea;
    const depP = num(c.depPhysical, 0), depF = num(c.depFunctional, 0), depE = num(c.depEconomic, 0);
    const depAmt = rcn * (depP + depF + depE) / 100;
    const costIndicated = landValue + (rcn - depAmt);

    const inc = engagement.income;
    let income = null;
    if (inc && inc.useIncome) {
      const gpi = num(inc.gpi, 0);
      const egi = gpi * (1 - num(inc.vacancyPct, 0) / 100);
      const opex = egi * num(inc.opexPct, 0) / 100;
      const noi = egi - opex;
      const cap = num(inc.capRate, 0);
      income = { gpi, egi, opex, noi, capRate: cap, indicated: cap > 0 ? noi / cap : null };
    }

    return {
      subjectArea,
      sales: { adjusted, weights, wAvgPsm, simpleAvgPsm, indicated: salesIndicated, bestComp },
      cost: { landValuePerSqm, landValue, bldgArea, rcnPerSqm, rcn, depP, depF, depE, depAmt, indicated: costIndicated },
      income
    };
  }

  function appraisalReconcileDraft(res, engagement) {
    const s = res.sales, c = res.cost, i = res.income;
    const ar = engagement.approachResults || {};
    const fv = (key, fallback) => (ar[key] && ar[key].finalValue != null) ? ar[key].finalValue : fallback;
    let out = "Final Value — Sales Comparison Approach: " + money(fv("sales", s.indicated)) + " (weighted ₱" + numFmt(s.wAvgPsm) + "/sqm × " + numFmt(res.subjectArea) + " sqm); " +
      "Final Value — Cost Approach: " + money(fv("cost", c.indicated)) + "; " +
      (i ? "Final Value — Income Capitalization Approach: " + money(fv("income", i.indicated)) + "." : "no Income Approach applied (property not flagged income-producing).");
    if (s.bestComp) out += " Comparable '" + (s.bestComp.address || s.bestComp.id) + "' received the most weight at " + money(s.bestComp.adjPsm) + "/sqm (" + pct(s.bestComp.totalPct / 100) + " net adjustment).";
    out += " These three labeled Final Values feed the Final Value Opinion below; this draft reconciliation is advisory only and must be revised by the appraiser before the final value opinion is confirmed.";
    return out;
  }

  // PH TRAIN-era transfer taxes: CGT 6% on the HIGHEST of gross selling price / BIR zonal FMV / assessed FMV (Sec. 24(D), 6(E) NIRC);
  // DST 1.5% (Sec. 196); local transfer tax 0.5% (RA 7160 ceiling); broker's fee shown for cash-out planning.
  function phTaxes(o) {
    const o2 = o || {};
    const area = num(o2.lotArea, 0);
    const zonalPsm = num(o2.zonalPsm, 0), smvPsm = num(o2.smvPsm, 0);
    const sellingPrice = num(o2.sellingPrice, 0);
    const zonalFMV = zonalPsm > 0 ? zonalPsm * area : null;
    const assessedFMV = smvPsm > 0 ? smvPsm * area : null;
    const cands = [sellingPrice, zonalFMV, assessedFMV].filter(v => v != null && v > 0);
    const base = cands.length ? Math.max.apply(null, cands) : null;
    const governing = cands.length
      ? (base === sellingPrice ? "Gross Selling Price" : (base === zonalFMV ? "BIR Zonal FMV" : "Assessed FMV (SMV × area)"))
      : "";
    return {
      zonalFMV: zonalFMV, assessedFMV: assessedFMV, sellingPrice: sellingPrice || null,
      cgtBase: base, governing: governing,
      cgt: base != null ? base * 0.06 : null,
      dst: base != null ? base * 0.015 : null,
      transferTax: base != null ? base * 0.005 : null,
      total: base != null ? base * 0.08 : null,
      zonalDeltaPct: (zonalFMV > 0 && num(o2.marketValue, 0) > 0) ? _r1((o2.marketValue - zonalFMV) / zonalFMV * 100) : null
    };
  }
  function collateralValue(marketValue, haircutPct) {
    const mv = num(marketValue, 0), hc = num(haircutPct, 40);
    if (!(mv > 0)) return { mortgageValue: null, haircutPct: hc };
    const pct = clamp(hc, 0, 90);
    return { mortgageValue: Math.round(mv * (1 - pct / 100) * 100) / 100, haircutPct: pct };
  }

  function appraisalNarrative(raw) {
    const p = raw.property || {};
    const loc = locationAnalysis(raw);
    const hbu = highestBestUse(raw);
    return "Located in " + (p.city || "the area") + ", the subject property benefits from " + loc.rationales.location + " " +
      "Neighborhood demand is driven by a population score of " + loc.demandScore + "/100 and commercial momentum of " + loc.commercialScore + "/100. " +
      "The highest and best use is concluded as \u201c" + hbu.recommendation.label + "\u201d (" + hbu.recommendation.reasons.join("; ") + "). " +
      "This narrative is AI-drafted from the loaded property record and requires professional review.";
  }

  window.ESREALTY = window.ESREALTY || {};
  window.ESREALTY.core = {
    clamp, num, money, money2, pct, numFmt, fmtNum, calcAmortization, npv, irr, payback,
    developmentCosts, constructionFinanceCost, salesReturns, acquisitionCosts,
    model, SCENARIOS, buildScenario, buildAllScenarios,
    locationAnalysis, riskAnalysis, highestBestUse, recommend, assistantAnswer,
    APPRAISAL_ELEMENTS, appraisalSuggestAdjustments, appraisalCompute,
    appraisalReconcileDraft, appraisalNarrative, phTaxes, collateralValue
  };
})();
