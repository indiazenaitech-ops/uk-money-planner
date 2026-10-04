/* UK tax and benefit figures used by every tool.
   Tax year 2026/27 (6 April 2026 – 5 April 2027). Review every April and after each Budget:
   https://www.gov.uk/income-tax-rates  https://www.gov.uk/new-state-pension
   https://www.gov.uk/individual-savings-accounts  https://www.gov.uk/tax-on-your-private-pension */
window.UK = (function () {
  var R = {
    taxYear: '2026/27',
    personalAllowance: 12570,
    paTaperStart: 100000,          // allowance falls £1 for every £2 above this
    // England, Wales and Northern Ireland: bands are on taxable income (after the allowance)
    bandsRUK: [
      { name: 'Basic rate', upTo: 37700, rate: 0.20 },
      { name: 'Higher rate', upTo: 125140, rate: 0.40 },   // gross £50,270 to £125,140
      { name: 'Additional rate', upTo: Infinity, rate: 0.45 }
    ],
    // Scotland: bands on taxable income (gross thresholds assume the full £12,570 allowance)
    bandsScotland: [
      { name: 'Starter rate', upTo: 3967, rate: 0.19 },        // gross £12,571 to £16,537
      { name: 'Basic rate', upTo: 16956, rate: 0.20 },         // to £29,526
      { name: 'Intermediate rate', upTo: 31092, rate: 0.21 },  // to £43,662
      { name: 'Higher rate', upTo: 62430, rate: 0.42 },        // to £75,000
      { name: 'Advanced rate', upTo: 125140, rate: 0.45 },     // to £125,140 gross
      { name: 'Top rate', upTo: Infinity, rate: 0.48 }
    ],
    higherRateThreshold: 50270,
    additionalRateThreshold: 125140,
    ni: { primaryThreshold: 12570, upperEarningsLimit: 50270, mainRate: 0.08, upperRate: 0.02 },
    studentLoan: {
      none: null,
      plan1: { threshold: 26900, rate: 0.09, label: 'Plan 1' },
      plan2: { threshold: 29385, rate: 0.09, label: 'Plan 2' },
      plan4: { threshold: 33795, rate: 0.09, label: 'Plan 4 (Scotland)' },
      plan5: { threshold: 25000, rate: 0.09, label: 'Plan 5' },
      postgrad: { threshold: 21000, rate: 0.06, label: 'Postgraduate loan' }
    },
    pension: {
      annualAllowance: 60000,
      moneyPurchaseAnnualAllowance: 10000,
      lumpSumAllowance: 268275,       // max tax-free cash across all pensions
      taxFreeFraction: 0.25,
      minimumAccessAge: 55,           // rising to 57 on 6 April 2028
      minimumAccessAgeFrom2028: 57,
      autoEnrolment: { lowerQE: 6240, upperQE: 50270, employee: 0.05, employer: 0.03 }
    },
    statePension: {
      fullWeekly: 241.30,             // full new State Pension
      qualifyingYearsFull: 35,
      qualifyingYearsMin: 10
    },
    isa: {
      annual: 20000,
      lifetime: 4000, lifetimeBonus: 0.25, lifetimeOpenMaxAge: 39, lifetimeContribMaxAge: 50,
      lifetimeHousePriceCap: 450000, lifetimeWithdrawalCharge: 0.25,
      junior: 9000,
      cashCapFrom2027: 12000          // cash ISA limit for under-65s from 6 April 2027
    },
    savings: { psaBasic: 1000, psaHigher: 500, psaAdditional: 0, startingRateBand: 5000 },
    dividends: { allowance: 500, basic: 0.1075, higher: 0.3575, additional: 0.3935 },
    cgt: { annualExempt: 3000, basic: 0.18, higher: 0.24 },
    // Growth assumptions for projections (nominal, before charges): low / mid / high
    growth: { low: 0.02, mid: 0.05, high: 0.08 },
    inflation: 0.025
  };

  function round2(n) { return Math.round(n * 100) / 100; }

  function personalAllowance(gross) {
    var pa = R.personalAllowance;
    if (gross > R.paTaperStart) pa = Math.max(0, pa - (gross - R.paTaperStart) / 2);
    return pa;
  }

  /* Income tax on non-savings income. region: 'england' | 'wales' | 'ni' | 'scotland' */
  function incomeTax(gross, region) {
    gross = Math.max(0, +gross || 0);
    var pa = personalAllowance(gross), tax = 0, bands = [];
    var taxable = Math.max(0, gross - pa), prev = 0;
    var list = region === 'scotland' ? R.bandsScotland : R.bandsRUK;
    list.forEach(function (b) {
      var upTo = b.upTo;
      // the band below the top rate always ends at £125,140 gross
      if (upTo === 125140 || (list === R.bandsRUK && b.rate === 0.40)) upTo = R.additionalRateThreshold - pa;
      var amt = Math.max(0, Math.min(taxable, upTo) - prev);
      if (amt > 0) { tax += amt * b.rate; bands.push({ name: b.name, rate: b.rate, amount: amt, tax: amt * b.rate }); }
      prev = Math.max(prev, upTo);
    });
    return { tax: round2(tax), personalAllowance: pa, bands: bands };
  }

  function nationalInsurance(gross) {
    var n = R.ni, g = Math.max(0, +gross || 0);
    var main = Math.max(0, Math.min(g, n.upperEarningsLimit) - n.primaryThreshold) * n.mainRate;
    var upper = Math.max(0, g - n.upperEarningsLimit) * n.upperRate;
    return round2(main + upper);
  }

  function studentLoan(gross, plan) {
    var p = R.studentLoan[plan];
    if (!p) return 0;
    return round2(Math.max(0, gross - p.threshold) * p.rate);
  }

  /* Marginal band name for a gross salary: 'basic' | 'higher' | 'additional' | 'none' */
  function taxBand(gross) {
    if (gross <= personalAllowance(gross)) return 'none';
    if (gross <= R.higherRateThreshold) return 'basic';
    if (gross <= R.additionalRateThreshold) return 'higher';
    return 'additional';
  }

  /* State Pension age under current law (simplified; gov.uk/state-pension-age is definitive). */
  function statePensionAge(dob) {
    var d = dob instanceof Date ? dob : new Date(dob);
    if (isNaN(d)) return 67;
    var y = d.getFullYear(), m = d.getMonth(), day = d.getDate();
    var t = Date.UTC(y, m, day);
    if (t < Date.UTC(1960, 3, 6)) return 66;
    if (t < Date.UTC(1961, 2, 6)) {
      // 66 years plus 1–11 months, one extra month per month of birth
      var months = (y - 1960) * 12 + (m - 3) + (day >= 6 ? 1 : 0);
      return 66 + Math.min(11, Math.max(1, months)) / 12;
    }
    if (t < Date.UTC(1977, 3, 6)) return 67;
    if (t < Date.UTC(1978, 3, 6)) return 67.5;
    return 68;
  }

  function age(dob, at) {
    var d = new Date(dob), now = at || new Date();
    if (isNaN(d)) return null;
    var a = now.getFullYear() - d.getFullYear();
    if (now.getMonth() < d.getMonth() || (now.getMonth() === d.getMonth() && now.getDate() < d.getDate())) a--;
    return a;
  }

  /* Future value of a lump sum plus regular monthly payments, compounded monthly. */
  function futureValue(opts) {
    var pv = +opts.start || 0, pmt = +opts.monthly || 0, years = Math.max(0, +opts.years || 0);
    var r = (+opts.rate || 0) / 12, n = Math.round(years * 12), esc = (+opts.escalate || 0);
    var bal = pv, paid = pv, series = [{ month: 0, balance: pv, paid: pv }];
    for (var i = 1; i <= n; i++) {
      var p = pmt * Math.pow(1 + esc, Math.floor((i - 1) / 12));
      bal = bal * (1 + r) + p; paid += p;
      if (i % 12 === 0 || i === n) series.push({ month: i, balance: bal, paid: paid });
    }
    return { balance: bal, paid: paid, growth: bal - paid, series: series };
  }

  /* Monthly payment needed to reach target from start in `years` at annual rate. */
  function monthlyNeeded(target, start, years, rate) {
    var n = Math.round(years * 12), r = rate / 12;
    if (n <= 0) return Math.max(0, target - start);
    var grownStart = start * Math.pow(1 + r, n);
    var need = target - grownStart;
    if (need <= 0) return 0;
    return r === 0 ? need / n : need * r / (Math.pow(1 + r, n) - 1);
  }

  /* Money in today's prices. */
  function real(amount, years, inflation) {
    return amount / Math.pow(1 + (inflation == null ? R.inflation : inflation), years);
  }

  return {
    R: R, personalAllowance: personalAllowance, incomeTax: incomeTax, nationalInsurance: nationalInsurance,
    studentLoan: studentLoan, taxBand: taxBand, statePensionAge: statePensionAge, age: age,
    futureValue: futureValue, monthlyNeeded: monthlyNeeded, real: real
  };
})();
