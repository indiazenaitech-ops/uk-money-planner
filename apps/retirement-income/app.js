/* Annuity or drawdown: compare a guaranteed income for life (an annuity) with keeping a pension
   invested and taking money out (drawdown), and see how long the money could last.
   Figures are in future pounds (not adjusted for inflation) unless a label says otherwise. */
MP.page({ id: 'retirement-income', title: 'Annuity or drawdown' }).then(function () {
  'use strict';
  var el = MP.el, main = MP.$('#app');
  var P = UK.R.pension, SP = UK.R.statePension, INFL = UK.R.inflation, G = UK.R.growth;
  var MAX_AGE = 120;

  /* Illustrative annuity rates for a healthy 65-year-old (yearly income per £100 of pot).
     Real rates change every week with interest rates, and depend on age, health and where you live. */
  var TYPES = {
    level: { label: 'Level', long: 'Level: the same amount every year', base: 7.0, esc: 0 },
    rising: { label: 'Rising 3%', long: 'Rising by 3% a year, to help with prices', base: 4.9, esc: 0.03 },
    joint: { label: 'Joint 50%', long: 'Joint life: half keeps being paid to your partner after you die', base: 6.4, esc: 0 }
  };
  var SCEN = [{ value: 'low', label: 'Low' }, { value: 'mid', label: 'Mid' }, { value: 'high', label: 'High' }];
  var SCOL = { low: '--c3', mid: '--c2', high: '--c4' };
  var REGIONS = [['england', 'England'], ['wales', 'Wales'], ['scotland', 'Scotland'], ['ni', 'Northern Ireland']];
  var RISK_TO_SCEN = { cautious: 'low', balanced: 'mid', adventurous: 'high' };

  var profile = MP.profile(), answers = (MP.prefs().answers) || {};
  var dobAge = profile.dob ? UK.age(profile.dob) : null;
  if (dobAge != null && (dobAge < 16 || dobAge > 100)) dobAge = null;

  /* ---------- prefills ---------- */
  function startAgeDefault() {
    if (dobAge != null && dobAge >= 55) return { age: Math.min(dobAge, 90), from: 'dob' };
    var ra = +answers.retireAge || +profile.retireAge;
    if (ra >= 55 && ra <= 90) return { age: Math.round(ra), from: 'plan' };
    return { age: 65, from: 'example' };
  }
  function potDefault() {
    var pt = +answers.pensionTotal;
    if (pt > 0 && isFinite(pt)) return { pot: Math.round(pt), from: 'guide' };
    var r = MP.get('tools.retirement', null), sum = 0;
    if (r && typeof r === 'object') {
      ['potNom', 'potAtRetirement', 'projection'].forEach(function (k) { if (!sum && +r[k] > 0 && isFinite(+r[k])) sum = +r[k]; });
      if (!sum && Array.isArray(r.pots)) sum = r.pots.reduce(function (a, p) { var v = p && +p.value; return a + (v > 0 && isFinite(v) ? v : 0); }, 0);
    }
    if (sum > 0) return { pot: Math.round(sum), from: 'retirement' };
    return { pot: 200000, from: 'example' };
  }
  var START = startAgeDefault(), POT = potDefault();

  function typicalRate(type, age) {
    var t = TYPES[type] || TYPES.level;
    return Math.round(MP.clamp(t.base + 0.12 * ((+age || 65) - 65), 2.5, 15) * 10) / 10;
  }

  function defaults() {
    var s = {
      pot: POT.pot,
      age: START.age,
      takeCash: true,
      income: 0,
      type: 'level',
      rate: typicalRate('level', START.age),
      rateAuto: true,
      ufpls: false,
      otherIncome: 0,
      statePension: Math.round(SP.fullWeekly * 52 * 100) / 100,
      region: profile.region || answers.region || 'england',
      scenario: RISK_TO_SCEN[answers.riskReaction] || RISK_TO_SCEN[profile.riskAttitude] || 'mid',
      charges: 0.5,
      inflationLinked: true,
      planTo: 95,
      mixPct: 0
    };
    // Start with the income a level annuity would pay, so the two are easy to compare.
    var buy = s.pot - Math.min(s.pot * P.taxFreeFraction, P.lumpSumAllowance);
    s.income = Math.max(500, Math.round(buy * s.rate / 100 / 500) * 500);
    return s;
  }

  var s = Object.assign(defaults(), MP.get('tools.retirement-income', null) || {});
  if (!TYPES[s.type]) s.type = 'level';
  if (!G[s.scenario]) s.scenario = 'mid';
  var logged = false;

  /* ---------- ages ---------- */
  function birthDate(age) {
    if (profile.dob && UK.age(profile.dob) === age) return new Date(profile.dob);
    var d = new Date(); d.setFullYear(d.getFullYear() - age); d.setMonth(d.getMonth() - 6);
    return d;
  }
  function spa() { return UK.statePensionAge(birthDate(s.age)); }
  function ageLabel(a) {
    var y = Math.floor(a), m = Math.round((a - y) * 12);
    return m ? y + ' and ' + m + (m === 1 ? ' month' : ' months') : String(y);
  }
  function minAccess() { return birthDate(s.age) < new Date(1973, 3, 6) ? P.minimumAccessAge : P.minimumAccessAgeFrom2028; }

  /* ---------- the maths ---------- */
  function tax(gross) { return UK.incomeTax(Math.max(0, gross), s.region).tax; }
  function netRate(scen) { return (G[scen] || G.mid) - MP.clamp(+s.charges || 0, 0, 5) / 100; }
  // Level (or price-linked) yearly withdrawal, taken at the start of each year, that empties the pot after n years.
  function spread(pot, r, n) {
    if (pot <= 0 || n <= 0) return 0;
    if (Math.abs(r) < 1e-9) return pot / n;
    return pot * r / ((1 - Math.pow(1 + r, -n)) * (1 + r));
  }
  function lumpOf(pot) { return Math.min(pot * P.taxFreeFraction, P.lumpSumAllowance); }

  /* Drawdown year by year. Each year's money comes out at the start of the year; the rest grows.
     o: {pot, r, need(t) → amount wanted in year t, extra(t) → guaranteed income that reduces the need}
     Returns balances at each birthday, money taken each year, and the age the money runs out (null = lasts to 120). */
  function simulate(pot, r, needFn) {
    var bal = Math.max(0, pot), out = { ages: [], bal: [], paid: [], runOut: null };
    for (var t = 0; s.age + t <= MAX_AGE; t++) {
      var a = s.age + t, need = Math.max(0, needFn(t));
      out.ages.push(a); out.bal.push(bal < 0.005 ? 0 : bal);
      var w = Math.min(bal, need);
      out.paid.push(w);
      if (out.runOut == null && need > 0 && bal < need - 0.005) out.runOut = a + (need > 0 ? bal / need : 0);
      bal = Math.max(0, (bal - w) * (1 + r));
    }
    return out;
  }

  function model() {
    var pot = MP.clamp(+s.pot || 0, 0, 1e9), age = s.age, rate = MP.clamp(+s.rate || 0, 0, 30) / 100;
    var type = TYPES[s.type] || TYPES.level;
    var cash = s.takeCash ? lumpOf(pot) : 0;
    var ufpls = s.takeCash && s.ufpls;
    var spaAge = spa(), spYear = Math.max(0, +s.statePension || 0), other = Math.max(0, +s.otherIncome || 0);
    var spNow = age >= spaAge;
    var income = Math.max(0, +s.income || 0);
    var planTo = Math.max(age + 1, Math.round(MP.clamp(+s.planTo || 95, 60, MAX_AGE)));
    var growNeed = s.inflationLinked ? INFL : 0;

    // Annuity with the whole pot (after any tax-free cash)
    var annBuy = pot - cash, ann = annBuy * rate;
    var base = spYear + other; // tax worked out once the State Pension is paid
    var annTax = tax(ann + base) - tax(base);
    var annNet = ann - annTax;
    var totalNet = ann + base - tax(ann + base);

    // Drawdown pot: upfront cash leaves 75%; with UFPLS all of it stays invested and each withdrawal is 25% tax-free.
    var drawPot = s.takeCash && !ufpls ? pot - cash : pot;
    var taxFreeShare = ufpls ? (pot > 0 ? lumpOf(pot) / pot : 0) : 0;

    // Mix: buy an annuity with part of the pot, draw the rest
    var mix = MP.clamp(+s.mixPct || 0, 0, 100) / 100;
    var mixAnn = (pot - cash) * mix * rate;
    var mixDrawPot = drawPot * (1 - mix);
    var annAt = function (amount) { return function (t) { return amount * Math.pow(1 + type.esc, t); }; };

    var sc = {};
    SCEN.forEach(function (o) {
      var r = netRate(o.value), rr = (1 + r) / (1 + growNeed) - 1;
      var need = function (t) { return income * Math.pow(1 + growNeed, t); };
      var sim = simulate(drawPot, r, need);
      var mixAnnFn = annAt(mixAnn);
      var mixSim = simulate(Math.max(0, mixDrawPot), r, function (t) { return need(t) - mixAnnFn(t); });
      sc[o.value] = {
        r: r, sim: sim, runOut: sim.runOut,
        sustain: spread(drawPot, rr, planTo - age),
        mixSim: mixSim, mixSustain: spread(Math.max(0, mixDrawPot), rr, planTo - age)
      };
    });

    // Year-one drawdown tax at the chosen income (from State Pension age)
    var taxable = income * (1 - taxFreeShare);
    var drawNet = income - (tax(taxable + base) - tax(base));

    return {
      pot: pot, age: age, rate: rate, type: type, cash: cash, ufpls: ufpls, annBuy: annBuy, ann: ann, annTax: annTax, annNet: annNet,
      totalNet: totalNet, spaAge: spaAge, spYear: spYear, spNow: spNow, other: other, income: income,
      planTo: planTo, drawPot: drawPot, taxFreeShare: taxFreeShare, sc: sc, drawNet: drawNet,
      mix: mix, mixAnn: mixAnn, mixDrawPot: mixDrawPot, annAt: annAt(ann), upfrontCash: s.takeCash && !ufpls ? cash : 0
    };
  }

  // Money received from the pension before a given age (tax-free cash taken up front counts at the start).
  function receivedBy(series, startCash, byAge) {
    if (byAge <= s.age) return null;
    var tot = startCash;
    for (var i = 0; i < series.length && s.age + i < byAge; i++) tot += series[i];
    return tot;
  }
  function annuitySeries(m) { var out = []; for (var t = 0; s.age + t <= MAX_AGE; t++) out.push(m.annAt(t)); return out; }
  function balAt(sim, age) { var i = age - s.age; return i < 0 || i >= sim.bal.length ? null : sim.bal[i]; }
  function runOutText(a) { return a == null ? 'lasts past ' + MAX_AGE : 'age ' + Math.floor(a + 1e-9); }
  function lastsText(a) { return a == null ? 'past 100' : String(Math.floor(a + 1e-9)); }

  /* ---------- render ---------- */
  var resultsBox, tablesBox, chartsBox, mixBox;

  function render() {
    main.innerHTML = '';
    main.appendChild(el('div', { class: 'row', style: { justifyContent: 'space-between', margin: '6px 0 14px' } },
      el('div', null, el('h1', { style: { margin: 0 } }, 'Annuity or drawdown'),
        el('p', { class: 'muted', style: { margin: 0 } }, 'Compare a guaranteed income for life with keeping your pension invested, and see how long it could last.'),
        el('a', { href: '#h-results', class: 'jump small no-print' }, 'Jump to your results ↓')),
      el('button', { class: 'btn', type: 'button', id: 'reset', onclick: reset }, 'Reset')));

    main.appendChild(el('div', { class: 'ri-intro stack' },
      el('p', { class: 'small', style: { margin: 0 } }, 'When you take money from a pension pot you can buy an ', MP.term('annuity'), ', use ', MP.term('drawdown'),
        ', or mix the two. Most people can also take a ', MP.term('tax-free-lump-sum'), '.'),
      MP.adviceCard('pension')));

    var split = el('div', { class: 'split' });
    split.appendChild(el('div', { class: 'stack' }, potCard(), moreCard()));
    resultsBox = el('section', { class: 'card', 'aria-labelledby': 'h-results', id: 'results-card' });
    mixBox = el('div', { class: 'detail-only', id: 'mix-box', 'aria-live': 'polite' });
    tablesBox = el('section', { class: 'card', 'aria-labelledby': 'h-tables' });
    chartsBox = el('section', { class: 'card', 'aria-labelledby': 'h-charts' });
    split.appendChild(el('div', { class: 'stack' }, resultsBox, mixBox, chartsBox, tablesBox, knowCard(), howTo()));
    main.appendChild(split);
    update(true);
  }

  function numInput(id, value, attrs) {
    return el('input', Object.assign({ type: 'number', id: id, inputmode: 'decimal', value: value == null ? '' : value, step: 'any' }, attrs || {}));
  }
  function onNum(input, key, lo, hi, after) {
    input.addEventListener('input', function () { s[key] = MP.clamp(MP.num(input.value), lo, hi); if (after) after(); update(); });
  }
  function syncRate() {
    if (s.rateAuto) s.rate = typicalRate(s.type, s.age);
    var r = MP.$('#rate'); if (r && document.activeElement !== r) r.value = s.rate;
  }

  function potCard() {
    var pot = MP.moneyInput({ id: 'pot', value: s.pot, max: '1000000000' });
    onNum(pot.input, 'pot', 0, 1e9);
    var age = numInput('age', s.age, { min: 50, max: 90, step: 1, inputmode: 'numeric' });
    age.addEventListener('input', function () {
      var v = MP.num(age.value, NaN);
      if (!isFinite(v) || v < 50 || v > 90) return;
      s.age = Math.round(v); syncRate(); update();
    });
    age.addEventListener('change', function () { s.age = Math.round(MP.clamp(MP.num(age.value, 65), 50, 90)); age.value = s.age; syncRate(); update(); });
    var cash = el('input', { type: 'checkbox', id: 'take-cash', checked: s.takeCash });
    cash.onchange = function () { s.takeCash = cash.checked; update(); };
    var income = MP.moneyInput({ id: 'income', value: s.income });
    onNum(income.input, 'income', 0, 1e8);
    var rate = numInput('rate', s.rate, { min: 0, max: 30, step: 0.1 });
    rate.addEventListener('input', function () { s.rate = MP.clamp(MP.num(rate.value), 0, 30); s.rateAuto = false; update(); });
    var typical = el('button', { type: 'button', class: 'btn btn-sm btn-ghost', id: 'rate-typical', onclick: function () { s.rateAuto = true; syncRate(); rate.value = s.rate; update(); } }, 'Use the typical rate');

    var potHint = POT.from === 'guide' ? 'From your guided setup' : POT.from === 'retirement' ? 'From your Retirement planner' : 'An example. Add up all your pension pots.';
    var ageHint = START.from === 'dob' ? 'From your date of birth' : START.from === 'plan' ? 'When you plan to retire' : 'An example';

    return el('section', { class: 'card', 'aria-labelledby': 'h-pot' },
      el('h2', { id: 'h-pot' }, 'Your pension'),
      MP.field('Pension pot (all defined contribution pots together)', pot.wrap, potHint),
      el('div', { class: 'grid-2 tight' },
        MP.field('Age you start taking money', age, ageHint),
        MP.field('Yearly income you want from it, before tax', income.wrap, 'Not counting the State Pension')),
      el('span', { class: 'hint small muted', id: 'age-hint', style: { display: 'block', marginTop: '-6px', marginBottom: '10px' } }),
      el('label', { class: 'check' }, cash, 'Take 25% as a tax-free lump sum'),
      MP.explain('tax-free-lump-sum'),
      el('hr'),
      el('div', { class: 'field' },
        el('label', { for: 'rate' }, 'Annuity rate (illustrative, % a year)'),
        el('div', { class: 'rate-row' }, rate, typical),
        el('span', { class: 'hint', id: 'rate-hint' })),
      el('p', { class: 'small callout warning', style: { margin: 0 } }, el('strong', null, 'Rates are only an example. '),
        'Get real quotes and shop around: you do not have to buy from your own pension provider (this is called the open market option). ',
        'If you smoke or have health problems, say so. You could get a bigger "enhanced" annuity.'));
  }

  function moreCard() {
    var ufpls = el('input', { type: 'checkbox', id: 'ufpls', checked: s.ufpls });
    ufpls.onchange = function () { s.ufpls = ufpls.checked; update(); };
    var other = MP.moneyInput({ id: 'other-income', value: s.otherIncome });
    onNum(other.input, 'otherIncome', 0, 1e8);
    var sp = MP.moneyInput({ id: 'state-pension', value: s.statePension });
    onNum(sp.input, 'statePension', 0, 1e6);
    var region = el('select', { id: 'region' }, REGIONS.map(function (r) { return el('option', { value: r[0], selected: s.region === r[0] }, r[1]); }));
    region.onchange = function () { s.region = region.value; update(); };
    var type = MP.seg(Object.keys(TYPES).map(function (k) { return { value: k, label: TYPES[k].label }; }), s.type, function (v) { s.type = v; syncRate(); update(); }, 'Annuity type');
    type.id = 'annuity-type'; type.classList.add('seg-full');
    var scen = MP.seg(SCEN.map(function (o) { return { value: o.value, label: o.label + ' ' + MP.pct(G[o.value]) }; }), s.scenario, function (v) { s.scenario = v; update(); }, 'Growth scenario');
    scen.id = 'scenario'; scen.classList.add('seg-full');
    var charges = numInput('charges', s.charges, { min: 0, max: 5, step: 0.05 });
    onNum(charges, 'charges', 0, 5);
    var infl = el('input', { type: 'checkbox', id: 'inflation-linked', checked: s.inflationLinked });
    infl.onchange = function () { s.inflationLinked = infl.checked; update(); };
    var planTo = numInput('plan-to', s.planTo, { min: 60, max: 120, step: 1, inputmode: 'numeric' });
    planTo.addEventListener('input', function () { var v = MP.num(planTo.value, NaN); if (isFinite(v) && v >= 60 && v <= 120) { s.planTo = Math.round(v); update(); } });
    planTo.addEventListener('change', function () { s.planTo = Math.round(MP.clamp(MP.num(planTo.value, 95), 60, 120)); planTo.value = s.planTo; update(); });
    var mix = el('input', { type: 'range', id: 'mix-pct', min: 0, max: 100, step: 5, value: s.mixPct, 'aria-describedby': 'mix-hint' });
    var mixOut = el('output', { id: 'mix-pct-out', for: 'mix-pct', class: 'mix-out' }, s.mixPct + '%');
    mix.addEventListener('input', function () { s.mixPct = +mix.value; mixOut.textContent = mix.value + '%'; update(); });

    return el('div', { class: 'stack' },
      el('p', { class: 'simple-only small muted card', id: 'simple-assume' }),
      el('section', { class: 'card detail-only', 'aria-labelledby': 'h-more', id: 'more-card' },
        el('h2', { id: 'h-more' }, 'More options'),
        el('label', { class: 'check' }, ufpls, 'Drawdown: take the tax-free cash bit by bit instead (UFPLS)'),
        el('p', { class: 'hint small', style: { marginTop: '-4px' } }, 'An "uncrystallised funds pension lump sum": each withdrawal is 25% tax-free and 75% taxed, and the whole pot stays invested.'),
        el('div', { class: 'grid-2 tight' },
          MP.field('Other taxable income a year', other.wrap, 'Work, rent, a final salary pension'),
          MP.field('State Pension a year', sp.wrap, 'Full new State Pension: ' + MP.money(SP.fullWeekly, true) + ' a week')),
        MP.field('Where you live', region, 'For income tax'),
        el('hr'),
        el('div', { class: 'field' }, el('span', { class: 'label' }, 'Annuity type'), type, el('span', { class: 'hint', id: 'type-hint' }, TYPES[s.type].long)),
        el('hr'),
        el('div', { class: 'field' }, el('span', { class: 'label' }, 'Drawdown growth a year (before charges)'), scen,
          el('span', { class: 'hint' }, 'Results show all three. This one is used for the headline and your summary.')),
        el('div', { class: 'grid-2 tight' },
          MP.field('Yearly charges (%)', charges, 'Platform and fund charges'),
          MP.field('Plan for money to last to age', planTo, 'Many people live past 90')),
        el('label', { class: 'check' }, infl, 'Raise my drawdown income with prices (' + MP.pct(INFL) + ' a year)'),
        el('hr'),
        el('div', { class: 'field' },
          el('div', { class: 'slider-head' }, el('label', { for: 'mix-pct' }, 'Mix: use part of the pot for an annuity'), mixOut),
          mix,
          el('span', { class: 'hint', id: 'mix-hint' }, 'Many people buy an annuity to cover essential bills (with the State Pension) and keep the rest invested for flexibility. 0% means no mix.'))));
  }

  function stat(label, id, value, note, opts) {
    opts = opts || {};
    return el('div', { class: 'stat' }, el('span', { class: 'label' }, label),
      el('span', { class: 'value', id: id, dataset: { value: opts.raw != null ? opts.raw : Math.round(value) } }, opts.text || MP.money(value)),
      note ? el('span', { class: 'tiny muted' }, note) : null);
  }

  function update(first) {
    syncRate();
    var m = model();
    var ah = MP.$('#age-hint');
    if (ah) {
      var mina = minAccess();
      ah.textContent = 'Your State Pension age is ' + ageLabel(m.spaAge) + '.' + (s.age < mina ? ' Most pensions cannot be taken before ' + mina + '.' : '');
    }
    var rh = MP.$('#rate-hint');
    if (rh) rh.textContent = (s.rateAuto ? 'Typical ' : 'Your rate. Typical ') + 'for a healthy ' + s.age + '-year-old: about ' + typicalRate(s.type, s.age) + '% (' + TYPES[s.type].label.toLowerCase() + '). £' + MP.fmtNum(s.rate, 1) + ' a year for every £100.';
    var th = MP.$('#type-hint'); if (th) th.textContent = TYPES[s.type].long + '.';
    var sa = MP.$('#simple-assume');
    if (sa) sa.textContent = 'Assumes a ' + TYPES[s.type].label.toLowerCase() + ' annuity, ' + MP.pct(G[s.scenario]) + ' growth a year (' + s.scenario + ') less ' + s.charges + '% charges, drawdown income ' +
      (s.inflationLinked ? 'rising with prices' : 'staying level') + ', the State Pension of ' + MP.money(m.spYear) + ' a year from ' + ageLabel(m.spaAge) + ', and money lasting to ' + m.planTo + '. Switch to Detailed to change these.';
    drawResults(m);
    drawMix(m);
    drawTables(m);
    drawCharts(m);
    if (!first) save(m);
  }

  function drawResults(m) {
    var chosen = m.sc[s.scenario];
    resultsBox.innerHTML = '';
    resultsBox.appendChild(el('h2', { id: 'h-results' }, 'Your two options'));
    var live = el('div', { 'aria-live': 'polite', id: 'results' });

    if (m.cash > 0) {
      live.appendChild(el('p', { class: 'small callout' }, 'Tax-free cash: ', el('strong', { id: 'cash', dataset: { value: Math.round(m.cash) } }, MP.money(m.cash)),
        m.ufpls ? ' with the annuity. With drawdown you take it bit by bit (25% of each withdrawal).' : ', taken at the start with either option.' + (m.cash >= P.lumpSumAllowance - 0.5 ? ' This is capped at the ' + MP.money(P.lumpSumAllowance) + ' lump sum allowance.' : '')));
    } else {
      live.appendChild(el('span', { id: 'cash', dataset: { value: 0 }, hidden: true }, '£0'));
    }

    var annCard = el('div', { class: 'option panel', id: 'opt-annuity' },
      el('h3', null, '🛡️ Annuity'),
      el('div', { class: 'muted small' }, 'Guaranteed income for life, before tax'),
      el('div', { class: 'big-number', id: 'annuity-income', dataset: { value: Math.round(m.ann) } }, MP.money(m.ann)),
      el('div', { class: 'small' }, 'a year' + (m.type.esc ? ' to start, rising 3% a year' : '') + ', from ' + MP.money(m.annBuy) + ' at ' + MP.fmtNum(m.rate * 100, 1) + '%'),
      el('div', { class: 'stats' },
        stat('After tax', 'annuity-net', m.annNet, m.spYear > 0 ? 'alongside your State Pension' : 'after income tax'),
        stat('Your total after tax', 'total-net', m.totalNet, 'annuity' + (m.spYear > 0 ? ' + State Pension' : '') + (m.other > 0 ? ' + other income' : ''))),
      el('p', { class: 'tiny muted', style: { margin: '8px 0 0' } }, 'Never runs out. Usually cannot be changed or cashed in. Stops when you die unless you choose joint life, a guarantee period or value protection.'));

    var runRow = el('div', { class: 'runout' }, SCEN.map(function (o) {
      var r = m.sc[o.value].runOut;
      return el('div', { class: 'run' + (o.value === s.scenario ? ' chosen' : '') },
        el('span', { class: 'tiny muted' }, o.label + ' ' + MP.pct(G[o.value])),
        el('strong', { id: 'runout-' + o.value, dataset: { value: r == null ? 'never' : (Math.round(r * 10) / 10) } }, r == null ? MAX_AGE + '+' : String(Math.floor(r + 1e-9))),
        el('span', { class: 'tiny muted' }, r == null ? 'never runs out' : 'runs out'));
    }));
    var short = chosen.runOut != null && chosen.runOut < m.planTo;
    var drawCard = el('div', { class: 'option panel', id: 'opt-drawdown' },
      el('h3', null, '📈 Drawdown'),
      el('div', { class: 'muted small' }, 'Taking ' + MP.money(m.income) + ' a year' + (s.inflationLinked ? ', rising with prices,' : '') + ' from ' + MP.money(m.drawPot) + ', your money runs out at age:'),
      runRow,
      el('p', { class: 'small', style: { margin: '10px 0 4px' } }, short ?
        el('span', { class: 'chip danger' }, 'Runs out before ' + m.planTo + ' (' + s.scenario + ')') :
        el('span', { class: 'chip success' }, 'Lasts to ' + m.planTo + ' (' + s.scenario + ')')),
      el('div', { class: 'stats' },
        stat('Could last to ' + m.planTo, 'sustain-' + s.scenario, chosen.sustain, 'a year' + (s.inflationLinked ? ', rising with prices' : '') + ' (' + s.scenario + ' growth)'),
        stat('After tax', 'drawdown-net', m.drawNet, 'on ' + MP.money(m.income) + (m.ufpls ? ', 25% tax-free' : ''))),
      el('p', { class: 'tiny muted', style: { margin: '8px 0 0' } }, 'Flexible: change or stop your income at any time, and what is left can go to your family. But it can run out, and its value goes up and down.'));

    live.appendChild(el('div', { class: 'options' }, annCard, drawCard));

    // Plain-English verdict
    var verdict = 'An annuity would pay ' + MP.money(m.ann) + ' a year for life. ';
    if (m.income <= 0) verdict += 'Enter the income you want to see how long drawdown could last.';
    else verdict += 'Taking ' + MP.money(m.income) + ' a year in drawdown, your money ' + (chosen.runOut == null ? 'would last past ' + MAX_AGE : 'would run out at about ' + Math.floor(chosen.runOut + 1e-9)) +
      ' with ' + (s.scenario === 'mid' ? 'middle' : s.scenario) + ' growth. To last to ' + m.planTo + ', you could take about ' + MP.money(chosen.sustain) + ' a year' + (s.inflationLinked ? ', rising with prices' : '') + '.';
    live.appendChild(el('p', { class: 'verdict', id: 'verdict' }, verdict));
    live.appendChild(el('p', { class: 'tiny muted', style: { margin: 0 } }, 'Sustainable incomes: low ', MP.money(m.sc.low.sustain), ', middle ', MP.money(m.sc.mid.sustain), ', high ', MP.money(m.sc.high.sustain),
      ' a year to age ' + m.planTo + '. Amounts are in future pounds: in 20 years, ' + MP.money(10000) + ' may buy what ' + MP.money(UK.real(10000, 20)) + ' buys today.'));
    // keep every scenario's sustainable income addressable for tests and screen readers
    SCEN.forEach(function (o) { if (o.value !== s.scenario) live.appendChild(el('span', { id: 'sustain-' + o.value, dataset: { value: Math.round(m.sc[o.value].sustain) }, hidden: true }, MP.money(m.sc[o.value].sustain))); });
    resultsBox.appendChild(live);
  }

  function drawMix(m) {
    mixBox.innerHTML = '';
    if (m.mix <= 0) return;
    var c = m.sc[s.scenario], r = c.mixSim.runOut;
    var guaranteed = m.mixAnn + m.spYear;
    mixBox.appendChild(el('section', { class: 'card', 'aria-labelledby': 'h-mix' },
      el('h2', { id: 'h-mix' }, 'Your mix: ' + Math.round(m.mix * 100) + '% annuity, ' + (100 - Math.round(m.mix * 100)) + '% drawdown'),
      el('div', { class: 'stats', style: { marginTop: 0, paddingTop: 0, borderTop: 0 } },
        stat('Guaranteed annuity', 'mix-annuity', m.mixAnn, 'a year for life, before tax'),
        stat('Guaranteed with State Pension', 'mix-guaranteed', guaranteed, 'a year, from ' + ageLabel(m.spaAge)),
        stat('Left in drawdown', 'mix-pot', Math.max(0, m.mixDrawPot), 'stays invested'),
        stat('Drawdown tops up to ' + MP.money(m.income), 'mix-runout', 0, r == null ? 'never runs out' : 'until about age ' + Math.floor(r + 1e-9) + ' (' + s.scenario + ')',
          { raw: r == null ? 'never' : Math.round(r * 10) / 10, text: r == null ? 'Lasts' : 'Age ' + Math.floor(r + 1e-9) })),
      el('p', { class: 'small', style: { margin: '10px 0 0' } }, 'After the drawdown part runs out you would still get ' + MP.money(m.mixAnn) + ' a year from the annuity' + (m.spYear ? ' plus the State Pension' : '') + '. To last to ' + m.planTo + ', the drawdown part could pay about ' + MP.money(c.mixSustain) + ' a year on top.')));
  }

  function cell(v) { return v == null ? '—' : MP.money(v); }
  function drawTables(m) {
    tablesBox.innerHTML = '';
    tablesBox.appendChild(el('h2', { id: 'h-tables' }, 'Money received, and what is left'));
    var annS = annuitySeries(m), ages = [80, 90, 95];
    var rows = [{ name: 'Annuity', id: 'annuity', series: annS, cash: m.cash }].concat(SCEN.map(function (o) {
      return { name: 'Drawdown, ' + o.label.toLowerCase() + ' ' + MP.pct(G[o.value]), id: o.value, series: m.sc[o.value].sim.paid, cash: m.upfrontCash, sim: m.sc[o.value].sim };
    }));
    var head = el('tr', null, el('th', { scope: 'col' }, 'Received by age'), ages.map(function (a) { return el('th', { scope: 'col', class: 'num' }, a); }));
    var body = rows.map(function (r) {
      return el('tr', { class: r.id === s.scenario ? 'chosen' : null }, el('th', { scope: 'row' }, r.name), ages.map(function (a) {
        var v = receivedBy(r.series, r.cash, a);
        return el('td', { class: 'num', id: 'recv-' + r.id + '-' + a, dataset: { value: v == null ? '' : Math.round(v) } }, cell(v));
      }));
    });
    tablesBox.appendChild(el('div', { class: 'scroll-x' }, el('table', { class: 'table', id: 'received-table' }, el('thead', null, head), el('tbody', null, body))));
    tablesBox.appendChild(el('p', { class: 'tiny muted' }, 'Before tax, including tax-free cash, not counting the State Pension. Future pounds.'));

    var head2 = el('tr', null, el('th', { scope: 'col' }, 'Left at age'), [75, 85].map(function (a) { return el('th', { scope: 'col', class: 'num' }, a); }));
    var body2 = rows.map(function (r) {
      return el('tr', { class: r.id === s.scenario ? 'chosen' : null }, el('th', { scope: 'row' }, r.name), [75, 85].map(function (a) {
        var v = r.sim ? balAt(r.sim, a) : (a >= s.age ? 0 : null);
        return el('td', { class: 'num', id: 'left-' + r.id + '-' + a, dataset: { value: v == null ? '' : Math.round(v) } }, cell(v));
      }));
    });
    tablesBox.appendChild(el('h3', { style: { marginTop: '16px' } }, 'Pot left for beneficiaries if you died'));
    tablesBox.appendChild(el('div', { class: 'scroll-x' }, el('table', { class: 'table', id: 'left-table' }, el('thead', null, head2), el('tbody', null, body2))));
    tablesBox.appendChild(el('p', { class: 'tiny muted' }, 'A single-life annuity leaves nothing unless you add a guarantee period or value protection, which lower the income a little.'));
  }

  function drawCharts(m) {
    chartsBox.innerHTML = '';
    chartsBox.appendChild(el('h2', { id: 'h-charts' }, 'How long the money lasts'));
    var last = Math.min(MAX_AGE, Math.max(m.planTo, 95, s.age + 10)), n = last - s.age + 1;
    var labels = []; for (var a = s.age; a <= last; a++) labels.push(String(a));
    var cw = chartsBox.clientWidth && chartsBox.clientWidth < 560 ? { width: 400, height: 260 } : {};
    var potSeries = SCEN.map(function (o) { return { name: 'Drawdown pot, ' + o.label.toLowerCase() + ' ' + MP.pct(G[o.value]), color: SCOL[o.value], values: m.sc[o.value].sim.bal.slice(0, n), dash: o.value !== s.scenario }; });
    var pi = m.planTo - s.age;
    chartsBox.appendChild(el('h3', null, 'Drawdown pot by age'));
    chartsBox.appendChild(MP.lineChart({ width: cw.width, height: cw.height, series: potSeries, labels: labels,
      marker: pi >= 0 && pi < n ? { index: pi, label: 'Plan to ' + m.planTo } : null,
      label: 'Drawdown pot by age in three growth scenarios, taking ' + MP.money(m.income) + ' a year' }));

    var annS = annuitySeries(m), cumA = [], cum = { low: [], mid: [], high: [] }, ta = m.cash;
    var tc = { low: m.upfrontCash, mid: m.upfrontCash, high: m.upfrontCash };
    for (var i = 0; i < n; i++) {
      cumA.push(ta); SCEN.forEach(function (o) { cum[o.value].push(tc[o.value]); });
      ta += annS[i] || 0; SCEN.forEach(function (o) { tc[o.value] += m.sc[o.value].sim.paid[i] || 0; });
    }
    chartsBox.appendChild(el('h3', { style: { marginTop: '18px' } }, 'Total money received by age'));
    chartsBox.appendChild(MP.lineChart({ width: cw.width, height: cw.height,
      series: [{ name: 'Annuity', color: '--c1', values: cumA, area: true }].concat(SCEN.map(function (o) { return { name: 'Drawdown, ' + o.label.toLowerCase(), color: SCOL[o.value], values: cum[o.value], dash: o.value !== s.scenario }; })),
      labels: labels, label: 'Cumulative money received by age: annuity compared with drawdown' }));
    chartsBox.appendChild(el('p', { class: 'tiny muted', style: { marginTop: '8px' } }, 'Real returns go up and down, and a few bad years early on hurt drawdown most (sequence risk). Growth is before ' + s.charges + '% charges. Before tax, future pounds.'));
  }

  function knowCard() {
    var ihtDate = new Date(UK.R.iht.pensionsInEstateFrom);
    return el('section', { class: 'card', 'aria-labelledby': 'h-know' },
      el('h2', { id: 'h-know' }, 'Things to know before you decide'),
      el('ul', { class: 'small know' },
        el('li', null, el('strong', null, 'Inheritance tax: '), 'from ' + MP.fmtDate(ihtDate) + ', unused pension pots are expected to count as part of your estate for ', MP.term('iht', 'inheritance tax'), '. A big drawdown pot left to your family could then be taxed.'),
        el('li', null, el('strong', null, 'If you die before 75, '), 'your beneficiaries can usually take what is left in drawdown free of income tax. ', el('strong', null, 'If you die at 75 or over, '), 'they pay income tax on it at their own rate when they take it.'),
        el('li', null, el('strong', null, 'Money Purchase Annual Allowance: '), 'once you take taxable money from drawdown (not just the tax-free cash), you can only pay ' + MP.money(P.moneyPurchaseAnnualAllowance) + ' a year into pensions with tax relief. Buying a lifetime annuity does not trigger this.'),
        el('li', null, el('strong', null, 'Emergency tax: '), 'your first taxable withdrawal is often taxed too much because your provider has no tax code yet. You can claim it back from HMRC (or it is put right later in the tax year).'),
        el('li', null, el('strong', null, 'Sequence risk: '), 'if markets fall soon after you start drawdown, you sell more to get the same income and the pot may never recover. Keeping 1 to 2 years of income in cash can help.'),
        el('li', null, el('strong', null, 'Pension Wise: '), 'free, impartial guidance from the government for anyone 50 or over. Book at ', el('a', { href: 'https://www.moneyhelper.org.uk/en/pensions-and-retirement/pension-wise', target: '_blank', rel: 'noopener' }, 'MoneyHelper'), '.'),
        el('li', null, el('strong', null, 'Scams: '), 'cold calls, "free pension reviews", guaranteed high returns and pressure to act fast are red flags. Check the firm on the ', el('a', { href: 'https://www.fca.org.uk/scamsmart', target: '_blank', rel: 'noopener' }, 'FCA ScamSmart'), ' site first.')),
      MP.explain('annuity'), MP.explain('drawdown'), MP.explain('state-pension'));
  }

  function howTo() {
    return el('details', { class: 'card' }, el('summary', null, 'How to use this, and tips'),
      el('ul', { class: 'small' },
        el('li', null, 'Start with your pot, your age and the income you want. The tool compares an annuity with drawdown straight away.'),
        el('li', null, 'Try the income that would cover your essential bills. Then try a higher one and see how much sooner drawdown runs out in a low growth scenario.'),
        el('li', null, 'Switch to Detailed to try a rising or joint-life annuity, UFPLS, charges, other income, and a mix of annuity and drawdown.'),
        el('li', null, 'Annuity rates change often. Ask several providers for quotes, and use the open market option. Tell them about your health and lifestyle.'),
        el('li', null, 'Check your State Pension forecast at ', el('a', { href: 'https://www.gov.uk/check-state-pension', target: '_blank', rel: 'noopener' }, 'gov.uk/check-state-pension'), '.'),
        el('li', null, 'This is guidance, not advice. Figures are illustrations using ' + UK.R.taxYear + ' tax rules. They are not a promise.')));
  }

  /* ---------- actions ---------- */
  function save(m) {
    MP.set('tools.retirement-income', s);
    var r = m.sc[s.scenario].runOut;
    MP.summary('retirement-income', 'Annuity ' + MP.money(m.ann) + '/yr vs drawdown lasts to ' + lastsText(r) + ' (' + s.scenario + ')');
    if (!logged) { logged = true; MP.log('Compared annuity and drawdown'); }
  }

  function reset() {
    if (!MP.confirm('Clear your annuity and drawdown choices and start again?')) return;
    s = defaults();
    MP.set('tools.retirement-income', undefined);
    MP.set('summaries.retirement-income', undefined);
    MP.log('Reset the annuity or drawdown comparison');
    render();
    MP.toast('Reset to the starting example.');
  }

  MP.onTheme(function () { drawCharts(model()); });
  MP.onPrefs(function () { drawCharts(model()); });
  var lastW = window.innerWidth, rt;
  window.addEventListener('resize', function () { clearTimeout(rt); rt = setTimeout(function () { if (Math.abs(window.innerWidth - lastW) > 40) { lastW = window.innerWidth; drawCharts(model()); } }, 200); });
  render();
});
