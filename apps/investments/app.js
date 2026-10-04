/* Investment growth: project regular investing in low, mid and high scenarios, after charges,
   with tax wrappers (ISA, general account, pension with tax relief) and today's-money view.
   Figures are illustrations, not predictions. Nothing here recommends a product. */
MP.page({ id: 'investments', title: 'Investment growth' }).then(function () {
  'use strict';
  var el = MP.el, main = MP.$('#app'), R = UK.R;
  var CASH_RATE = 0.035, DIV_YIELD = 0.02;

  var WRAPPERS = {
    isa: { label: 'Stocks & shares ISA', short: 'ISA' },
    gia: { label: 'General investment account', short: 'general account' },
    sipp: { label: 'Pension (SIPP) with tax relief', short: 'pension' }
  };
  var RISK = {
    cautious: { label: 'Cautious', fall: 0.10, mix: 'Mostly bonds and cash, with a smaller share of company shares (often around 20 to 40% shares).',
      ride: 'A smoother ride: smaller ups and downs, but over long periods you would usually expect less growth.' },
    balanced: { label: 'Balanced', fall: 0.20, mix: 'A mix of company shares and bonds (often around 40 to 70% shares).',
      ride: 'Some bumps along the way. Over many years the value has usually grown more than cash, but not every year.' },
    adventurous: { label: 'Adventurous', fall: 0.30, mix: 'Mostly company shares from around the world (often 70 to 100% shares).',
      ride: 'The bumpiest ride: big rises and big falls. Only suits money you will not need for many years.' }
  };

  function answers() { var a = MP.prefs().answers; return a && typeof a === 'object' ? a : {}; }
  /* Starting values: risk comes from the guided setup (riskReaction) or About you (riskAttitude). */
  function defaults() {
    var risk = RISK[answers().riskReaction] ? answers().riskReaction : MP.profile().riskAttitude;
    return { start: 1000, monthly: 250, escalate: 0, years: 20, wrapper: 'isa', charges: 0.6, real: false, risk: RISK[risk] ? risk : 'balanced', goal: '', showTable: false };
  }
  var s = Object.assign(defaults(), MP.get('tools.investments', {}));
  var refs = {};
  /* MP.field labels the wrapper of a money input; point the label at the input itself. */
  function field(label, control, hint, cls) {
    var f = MP.field(label, control, hint);
    var inner = control.matches && control.matches('input, select, textarea') ? null : MP.$('input, select', control);
    if (inner) MP.$('label', f).setAttribute('for', inner.id);
    if (cls) f.className += ' ' + cls;
    return f;
  }

  function yearsUntil(date) { var d = new Date(date); return isNaN(d) ? 0 : (d - new Date()) / (365.25 * 864e5); }
  function band() { var p = MP.profile(); return +p.salary > 0 ? UK.taxBand(+p.salary) : 'unknown'; }
  function relief() { return s.wrapper === 'sipp' ? 1 / (1 - 0.20) : 1; }   // £80 in → £100 in the pension
  function deflator(months) { return Math.pow(1 + R.inflation, months / 12); }

  /* Monthly simulation. Growth is added monthly (rate / 12, like UK.futureValue), then the yearly charge is taken
     monthly from the pot, then the month's payment goes in. `boost` is pension tax relief. */
  function sim(rate, charge, boost) {
    boost = boost || 1;
    var r = rate / 12, c = charge / 12, n = Math.round(s.years * 12);
    var bal = s.start * boost, paid = bal, paidReal = bal, mine = s.start, fees = 0;
    var rows = [{ year: 0, bal: bal, paid: paid, paidReal: paidReal, mine: mine }];
    for (var i = 1; i <= n; i++) {
      var pay = s.monthly * Math.pow(1 + s.escalate / 100, Math.floor((i - 1) / 12));
      bal *= 1 + r;
      var fee = bal * c; bal -= fee; fees += fee;
      bal += pay * boost; paid += pay * boost; mine += pay; paidReal += pay * boost / deflator(i);
      if (i % 12 === 0 || i === n) rows.push({ year: i / 12, bal: bal, paid: paid, paidReal: paidReal, mine: mine });
    }
    return { bal: bal, paid: paid, paidReal: paidReal, mine: mine, fees: fees, rows: rows };
  }

  function compute() {
    var b = relief(), ch = s.charges / 100, g = R.growth;
    var out = {
      low: sim(g.low, ch, b), mid: sim(g.mid, ch, b), high: sim(g.high, ch, b),
      midNoFee: sim(g.mid, 0, b), midMoreFee: sim(g.mid, ch + 0.005, b),
      cash: sim(CASH_RATE, 0, 1)
    };
    out.feeCost = out.midNoFee.bal - out.mid.bal;
    out.realMid = UK.real(out.mid.bal, s.years);
    return out;
  }
  /* Show in today's money when the toggle is on. */
  function v(amount, year) { return s.real ? amount / deflator(year * 12) : amount; }
  function roundish(n) { return n >= 10000 ? Math.round(n / 1000) * 1000 : Math.round(n / 100) * 100; }

  function save() {
    MP.set('tools.investments', s);
    var r = compute();
    MP.summary('investments', MP.money(s.monthly) + '/month for ' + s.years + (s.years === 1 ? ' year' : ' years') + ': ~' + MP.money(roundish(r.mid.bal)) + ' (mid)');
  }

  /* ---------- layout ---------- */
  function render() {
    main.innerHTML = '';
    main.appendChild(el('div', { class: 'row', style: { justifyContent: 'space-between', margin: '6px 0 14px' } },
      el('div', null, el('h1', { style: { margin: 0 } }, 'Investment growth'),
        el('p', { class: 'muted', style: { margin: 0 } }, 'See how regular investing could grow over time, in a low, middle and high scenario, after charges and rising prices.'))));
    var split = el('div', { class: 'split' });
    var left = el('div', { class: 'stack' }, inputs(), goalBox());
    refs.results = el('div', { class: 'stack' });
    split.appendChild(left);
    split.appendChild(refs.results);
    main.appendChild(split);
    update();
  }

  function numInput(id, key, attrs) {
    var inp = el('input', Object.assign({ type: 'number', id: id, inputmode: 'decimal', min: '0', step: 'any', value: s[key] }, attrs || {}));
    inp.addEventListener('input', function () { s[key] = MP.clamp(MP.num(inp.value), +inp.min || 0, +inp.max || 1e9); changed(); });
    return inp;
  }

  function inputs() {
    var start = MP.moneyInput({ id: 'inv-start', value: s.start, max: '10000000' });
    var monthly = MP.moneyInput({ id: 'inv-monthly', value: s.monthly, max: '1000000' });
    [[start.input, 'start'], [monthly.input, 'monthly']].forEach(function (p) {
      p[0].addEventListener('input', function () { s[p[1]] = MP.clamp(MP.num(p[0].value), 0, +p[0].max); changed(); });
    });
    var esc = numInput('inv-escalate', 'escalate', { max: '20', step: '0.5' });
    var charges = numInput('inv-charges', 'charges', { max: '5', step: '0.05' });
    var yearsOut = el('output', { id: 'inv-years-out', for: 'inv-years', class: 'years-out' }, s.years + (s.years === 1 ? ' year' : ' years'));
    var years = el('input', { type: 'range', id: 'inv-years', min: '1', max: '50', step: '1', value: s.years, 'aria-valuetext': s.years + ' years' });
    years.addEventListener('input', function () { s.years = MP.clamp(Math.round(MP.num(years.value, 1)), 1, 50); syncYears(); changed(); });
    refs.years = years; refs.yearsOut = yearsOut;
    var wrapper = el('select', { id: 'inv-wrapper' }, Object.keys(WRAPPERS).map(function (k) { return el('option', { value: k, selected: s.wrapper === k }, WRAPPERS[k].label); }));
    wrapper.onchange = function () { s.wrapper = wrapper.value; changed(); };
    var real = el('input', { type: 'checkbox', id: 'inv-real', checked: s.real });
    real.onchange = function () { s.real = real.checked; changed(); };
    var risk = MP.seg(Object.keys(RISK).map(function (k) { return { value: k, label: RISK[k].label }; }), s.risk, function (k) { s.risk = k; changed(); }, 'Your attitude to risk');
    risk.id = 'inv-risk';
    // Guided setup said they have never invested: a gentle first step (beginners only, via .explain).
    var newTip = answers().investExp === 'never' ? MP.explain(null, 'New to investing? Start small, for example £25 to £50 a month, in a stocks and shares ISA so you pay no tax on growth, and think of it as money for 5 years or more.') : null;
    if (newTip) newTip.id = 'inv-new-tip';
    refs.simpleNote = el('p', { class: 'tiny muted simple-only', id: 'inv-simple-note', style: { margin: '0 0 10px' } });

    return el('section', { class: 'card', 'aria-labelledby': 'h-inputs' },
      el('h2', { id: 'h-inputs' }, 'Your investing'),
      MP.explain('investing'),
      newTip,
      el('div', { class: 'grid-2 tight' },
        field('Lump sum now', start.wrap),
        field('Each month', monthly.wrap)),
      field('Raise the monthly amount each year by (%)', esc, 'For example 3% to keep up with pay rises. 0 keeps it the same.', 'detail-only'),
      el('div', { class: 'field' },
        el('div', { class: 'years-head' }, el('label', { for: 'inv-years' }, 'How many years?'), yearsOut), years),
      field('Where will you invest?', wrapper, el('span', null, 'A ', MP.term('ss-isa', 'stocks and shares ISA'), ' means no tax on growth or income.')),
      field(el('span', null, 'Yearly ', MP.term('charges', 'charges'), ' (%)'), charges, 'Platform fee plus fund fee added together. ' + MP.pct(0.006) + ' is a typical example.', 'detail-only'),
      el('div', { class: 'field' }, el('span', { class: 'label' }, 'Your ', MP.term('risk-attitude', 'attitude to risk')), risk,
        el('span', { class: 'hint' }, 'Taken from About you on the home page. Change it here to compare.')),
      MP.explain('risk-attitude'),
      refs.simpleNote,
      el('div', { class: 'detail-only' },
        el('label', { class: 'check' }, real, 'Show in today\'s money (prices rising ' + MP.pct(R.inflation) + ' a year)'),
        MP.explain('inflation')),
      el('div', { class: 'row', style: { marginTop: '8px' } },
        el('button', { class: 'btn btn-primary', type: 'button', id: 'inv-save', onclick: function () {
          save(); MP.log('Saved an investment plan: ' + MP.money(s.monthly) + '/month for ' + s.years + ' years'); MP.toast('Plan saved.');
        } }, 'Save plan'),
        el('button', { class: 'btn btn-ghost', type: 'button', id: 'inv-reset', onclick: function () {
          if (!MP.confirm('Reset all your investment inputs?')) return;
          s = defaults(); MP.set('tools.investments', undefined); MP.set('summaries.investments', undefined); render(); MP.toast('Reset.');
        } }, 'Reset')));
  }

  function syncYears() {
    refs.years.value = s.years;
    refs.years.setAttribute('aria-valuetext', s.years + ' years');
    refs.yearsOut.textContent = s.years + (s.years === 1 ? ' year' : ' years');
  }

  function changed() { update(); save(); }

  /* ---------- goal link ---------- */
  function goalBox() {
    var goals = MP.goals();
    refs.goalOut = el('div', { id: 'goal-result', 'aria-live': 'polite' });
    if (!goals.length) {
      return el('section', { class: 'card', 'aria-labelledby': 'h-goal' }, el('h2', { id: 'h-goal' }, 'Link to a dream'),
        el('p', { class: 'muted small' }, 'You have no dreams saved yet. ', el('a', { href: '../dreams/index.html' }, 'Add one in Dreams & goals'), ' to see if investing could get you there.'));
    }
    if (s.goal && !goals.some(function (g) { return g.id === s.goal; })) s.goal = '';
    var sel = el('select', { id: 'inv-goal' }, el('option', { value: '' }, 'No dream linked'),
      goals.map(function (g) { return el('option', { value: g.id, selected: s.goal === g.id }, (g.icon || '🎯') + ' ' + g.name); }));
    sel.onchange = function () {
      s.goal = sel.value;
      var g = currentGoal();
      if (g) { s.years = MP.clamp(Math.ceil(yearsUntil(g.date)), 1, 50); syncYears(); }
      changed();
    };
    return el('section', { class: 'card', 'aria-labelledby': 'h-goal' }, el('h2', { id: 'h-goal' }, 'Link to a dream'),
      MP.field('Which dream is this money for?', sel, 'Picking one sets the years from its date.'), refs.goalOut);
  }
  function currentGoal() { return MP.goals().filter(function (g) { return g.id === s.goal; })[0] || null; }

  function updateGoal(r) {
    if (!refs.goalOut) return;
    refs.goalOut.innerHTML = '';
    var g = currentGoal();
    if (!g) return;
    var target = (+g.target || 0) * Math.pow(1 + R.inflation, s.years);
    if (!(target > 0)) { refs.goalOut.appendChild(el('p', { class: 'muted small' }, 'This dream has no target amount yet.')); return; }
    var share = r.mid.bal / target, netMid = Math.max(0, R.growth.mid - s.charges / 100);
    var need = UK.monthlyNeeded(target, s.start * relief(), s.years, netMid) / relief();
    var passed = yearsUntil(g.date) <= 0;
    refs.goalOut.appendChild(el('div', { class: 'callout ' + (share >= 1 ? 'success' : 'warning') },
      passed ? el('p', { class: 'small' }, 'The date for this dream has passed. Edit it in Dreams & goals.') : null,
      el('p', null, 'In the mid scenario you would reach ', el('strong', { id: 'goal-pct' }, Math.round(share * 100) + '%'),
        ' of ' + MP.money(target) + ' (' + MP.money(g.target) + ' in today\'s money, allowing for rising prices).'),
      share < 1 ? el('p', { class: 'small' }, 'To get there in the mid scenario you would need about ' + MP.money(need) + ' a month' +
        (s.escalate ? ' with no yearly increase' : '') + '. Remember nothing is guaranteed.') :
        el('p', { class: 'small' }, 'Even the low scenario gives ' + MP.money(r.low.bal) + ' (' + Math.round(r.low.bal / target * 100) + '% of the target).')));
    refs.goalOut.appendChild(el('button', { class: 'btn btn-sm', type: 'button', id: 'goal-update', style: { marginTop: '10px' }, onclick: function () {
      var list = MP.goals(), x = list.filter(function (y) { return y.id === g.id; })[0];
      if (!x) return;
      x.rate = Math.round(netMid * 1000) / 1000; x.monthly = Math.round(s.monthly);
      MP.saveGoals(list);
      MP.log('Linked "' + x.name + '" to investing ' + MP.money(s.monthly) + '/month');
      MP.toast('Updated "' + x.name + '": ' + MP.money(s.monthly) + '/month at ' + MP.pct(x.rate) + ' a year.');
    } }, 'Use these figures for this dream'));
  }

  /* ---------- results ---------- */
  function update() {
    var r = compute(), box = refs.results, Y = s.years;
    box.innerHTML = '';
    var realNote = s.real ? ' in today\'s money' : '';

    // headline scenarios
    function scen(key, title, cls) {
      return el('div', { class: 'scen ' + cls },
        el('span', { class: 'label' }, title + ' · ' + MP.pct(R.growth[key]) + ' a year'),
        el('span', { class: 'value', id: 'out-' + key }, MP.money(v(r[key].bal, Y))));
    }
    var paidLabel = s.wrapper === 'sipp' ? 'Paid in (with tax relief)' : 'Total paid in';
    var paidVal = s.real ? r.mid.paidReal : r.mid.paid;
    box.appendChild(el('section', { class: 'card', 'aria-labelledby': 'h-results' },
      el('h2', { id: 'h-results' }, 'After ' + Y + (Y === 1 ? ' year' : ' years') + realNote),
      el('div', { 'aria-live': 'polite', id: 'inv-result' },
        el('div', { class: 'scen-grid' }, scen('low', 'Low', 'low'), scen('mid', 'Mid', 'mid'), scen('high', 'High', 'high')),
        el('div', { class: 'stat-grid' },
          stat(paidLabel, MP.money(paidVal), 'out-paid', s.wrapper === 'sipp' ? 'You pay ' + MP.money(r.mid.mine) + ', tax relief adds ' + MP.money(r.mid.paid - r.mid.mine) : null),
          stat('Growth (mid)', MP.money(v(r.mid.bal, Y) - paidVal), 'out-growth'),
          stat('Charges cost you (mid)', MP.money(v(r.feeCost, Y)), 'out-charges', 'Including the growth those fees would have earned', 'detail-only'),
          stat('Mid in today\'s money', MP.money(r.realMid), 'out-real', 'What it could buy at today\'s prices', 'detail-only')),
        el('p', { class: 'small muted', style: { margin: '12px 0 0' } }, 'Growth rates are before charges of ' + MP.pct(s.charges / 100, 2) +
          ' a year. They are illustrations, not predictions: real returns go up and down and could be lower than the low scenario.'))));

    // chart
    var labels = r.mid.rows.map(function (row) { return String(new Date().getFullYear() + Math.round(row.year)); });
    function vals(key) { return r[key].rows.map(function (row) { return v(row.bal, row.year); }); }
    var paidVals = r.mid.rows.map(function (row) { return s.real ? row.paidReal : row.paid; });
    box.appendChild(el('section', { class: 'card', 'aria-labelledby': 'h-chart' },
      el('h2', { id: 'h-chart' }, 'How it could grow'),
      el('div', { id: 'inv-chart' }, MP.lineChart({
        width: narrow() ? 380 : 640, height: narrow() ? 300 : 280,
        labels: labels, label: 'Projected value by year in low, mid and high scenarios, with total paid in',
        series: [
          { name: 'High (' + MP.pct(R.growth.high) + ')', color: '--c2', values: vals('high') },
          { name: 'Mid (' + MP.pct(R.growth.mid) + ')', color: '--c1', values: vals('mid'), area: true },
          { name: 'Low (' + MP.pct(R.growth.low) + ')', color: '--c3', values: vals('low') },
          { name: 'Paid in (dashed)', color: '--c8', values: paidVals, dash: true }
        ]
      }))));

    // Simple view keeps the headline, chart and risk; the comparisons, tax notes and table are detail-only.
    [cashVsInvest(r), riskCard(r), MP.adviceCard('investments'), wrapperCard(r), tableCard(r)].forEach(function (n, i) {
      if (i === 0 || i >= 3) n.classList.add('detail-only');
      box.appendChild(n);
    });
    box.appendChild(howTo(r));
    if (refs.simpleNote) refs.simpleNote.textContent = 'We assume charges of ' + MP.pct(s.charges / 100, 2) + ' a year' +
      (s.escalate ? ' and that you raise the monthly amount by ' + MP.pct(s.escalate / 100, 1) + ' each year' : ' and the same amount each month') + '. Switch to Detailed to change these.';
    updateGoal(r);
  }

  function narrow() { return window.innerWidth < 560; }

  function stat(label, value, id, hint, cls) {
    return el('div', { class: 'stat' + (cls ? ' ' + cls : '') }, el('span', { class: 'label' }, label), el('span', { class: 'value', id: id }, value), hint ? el('span', { class: 'tiny muted' }, hint) : null);
  }

  function cashVsInvest(r) {
    var Y = s.years, cash = v(r.cash.bal, Y), mid = v(r.mid.bal, Y), diff = mid - cash;
    return el('section', { class: 'card', 'aria-labelledby': 'h-cash' },
      el('h2', { id: 'h-cash' }, 'Cash vs investing'),
      el('p', null, 'The same money' + (s.wrapper === 'sipp' ? ' (what you pay, without tax relief)' : '') + ' in a savings account paying ' + MP.pct(CASH_RATE) +
        ' could grow to ', el('strong', { id: 'out-cash' }, MP.money(cash)), '. The mid investing scenario is ',
        el('strong', null, (diff >= 0 ? MP.money(diff) + ' more' : MP.money(-diff) + ' less')), ', but it is not guaranteed and could be worth less than you put in.'),
      el('p', { class: 'small muted' }, 'Cash rates change and interest above your Personal Savings Allowance may be taxed. Savings at a UK bank are protected by the FSCS up to £120,000.'),
      el('h3', null, 'Little and often, or all at once?'),
      el('p', { class: 'small' }, 'Putting in a set amount every month is sometimes called pound-cost averaging. When prices are low, your money buys more; when they are high, it buys less. ' +
        'It smooths out the bumps and means you never have to guess the "right" time. If you already have a lump sum, investing it all at once has more often come out ahead over long periods, ' +
        'simply because it is invested for longer, but it can feel worse if prices fall soon after. Both are fine: the habit matters more than the timing.'));
  }

  function riskCard(r) {
    var k = RISK[s.risk], pot = Math.max(r.mid.bal, s.start * relief());
    var halfway = r.mid.rows[Math.floor(r.mid.rows.length / 2)] || r.mid.rows[0];
    return el('section', { class: 'card', 'aria-labelledby': 'h-risk' },
      el('h2', { id: 'h-risk' }, 'Your attitude to risk: ' + k.label),
      el('p', null, k.mix),
      MP.explain('fund'),
      el('p', { class: 'small' }, k.ride + ' We use the same low, mid and high growth rates for every attitude to keep the comparison simple. In real life, your attitude mostly changes how bumpy the ride is.'),
      el('div', { class: 'callout warning', id: 'bad-year' },
        el('p', null, el('strong', null, 'What a bad year could look like: '), 'a fall of about ' + MP.pct(k.fall, 0) + ' in one year is possible for a ' + k.label.toLowerCase() + ' mix (illustrative).'),
        el('p', { class: 'small' }, 'If your pot were worth ' + MP.money(halfway.bal) + ' (around halfway), that could mean seeing it drop by ' + MP.money(halfway.bal * k.fall) + '. Near the end, on ' + MP.money(pot) + ', it could be ' + MP.money(pot * k.fall) + '.'),
        el('p', { class: 'small' }, 'Could you leave it alone and wait for it to recover? If losing that would hurt your plans, consider a more cautious mix, or move to safer options as you get close to needing the money.')));
  }

  function wrapperCard(r) {
    var Y = s.years, items = [];
    var yearOne = s.start + s.monthly * 12, maxYear = s.monthly * 12 * Math.pow(1 + s.escalate / 100, Math.max(0, Math.ceil(Y) - 1));
    if (s.wrapper === 'isa') {
      items.push(el('p', null, 'In a stocks & shares ISA you pay ', el('strong', null, 'no tax on growth or income'), ', and you can take money out at any time without tax.'));
      if (Math.max(yearOne, maxYear) > R.isa.annual) items.push(el('p', { class: 'callout warning small' }, 'You can put up to ' + MP.money(R.isa.annual) + ' a year into ISAs in total. Your plan goes over this in at least one year, so some money would need to go elsewhere, such as a general account or pension.'));
      else items.push(el('p', { class: 'small muted' }, 'You can put up to ' + MP.money(R.isa.annual) + ' a year into ISAs in total (' + R.taxYear + ').'));
    } else if (s.wrapper === 'sipp') {
      var b = band(), gross = s.monthly * relief(), yearly = gross * 12;
      items.push(el('p', null, 'Pension tax relief: for every ', el('strong', null, '£80'), ' you pay in, the government adds £20, so ', el('strong', null, '£100'), ' goes into your pension (basic rate relief). ',
        'Your ' + MP.money(s.monthly, true) + ' a month becomes ', el('strong', { id: 'out-gross' }, MP.money(gross, true)), '.'));
      if (b === 'higher' || b === 'additional') {
        var extra = yearly * (b === 'higher' ? 0.20 : 0.25);
        items.push(el('p', { class: 'callout success small' }, 'Your salary in About you puts you in the ' + b + ' rate band. You could claim back up to about ' + MP.money(extra) + ' more a year through a Self Assessment tax return. This tool does not add that extra.'));
      } else {
        items.push(el('p', { class: 'small' }, 'Higher and additional rate taxpayers can claim back even more through Self Assessment.' + (b === 'unknown' ? ' Add your salary in About you to see your figure.' : '')));
      }
      items.push(el('p', { class: 'small muted' }, 'Money in a pension is locked away until at least age ' + R.pension.minimumAccessAge + ' (' + R.pension.minimumAccessAgeFrom2028 + ' from April 2028). Usually ' + MP.pct(R.pension.taxFreeFraction, 0) +
        ' can be taken tax-free and the rest is taxed as income. You get relief on contributions up to 100% of your earnings, within the ' + MP.money(R.pension.annualAllowance) + ' annual allowance.'));
      if (yearly + (yearOne > s.monthly * 12 ? s.start * relief() : 0) > R.pension.annualAllowance) items.push(el('p', { class: 'callout warning small' }, 'This is above the ' + MP.money(R.pension.annualAllowance) + ' annual allowance, so you could face a tax charge. Check carry forward rules.'));
    } else {
      var b2 = band(), higher = b2 === 'higher' || b2 === 'additional';
      var divRate = b2 === 'additional' ? R.dividends.additional : higher ? R.dividends.higher : R.dividends.basic;
      var cgtRate = higher ? R.cgt.higher : R.cgt.basic;
      var endBal = r.mid.bal, divs = endBal * DIV_YIELD, divTax = Math.max(0, divs - R.dividends.allowance) * divRate;
      var gain = Math.max(0, r.mid.bal - r.mid.paid), cgt = Math.max(0, gain - R.cgt.annualExempt) * cgtRate;
      var crossAt = R.dividends.allowance / DIV_YIELD;
      items.push(el('p', null, 'In a general investment account, dividends and profits can be taxed. A rough guide in the mid scenario' + (b2 === 'unknown' ? ' (assuming you pay basic rate tax)' : '') + ':'));
      items.push(el('ul', { class: 'small', id: 'gia-tax' },
        el('li', null, 'Dividends: if your funds pay about ' + MP.pct(DIV_YIELD, 0) + ' a year, you go over the ' + MP.money(R.dividends.allowance) + ' tax-free dividend allowance once the pot is above about ' + MP.money(crossAt) +
          (divTax > 0 ? '. By the end that could mean about ' + MP.money(divTax) + ' tax a year (at ' + MP.pct(divRate, 2) + ').' : '. Your pot stays below that in the mid scenario, so you would probably pay no dividend tax.')),
        el('li', null, 'Selling: profits above the ' + MP.money(R.cgt.annualExempt) + ' yearly Capital Gains Tax allowance are taxed at ' + MP.pct(cgtRate, 0) + '. ' + (cgt > 0 ? 'Selling everything at the end could mean about ' + MP.money(cgt) + ' tax on a profit of ' + MP.money(gain) + '.' : 'Your profit of about ' + MP.money(gain) + ' is within the allowance, so selling at the end would probably mean no tax.')),
        el('li', null, 'Ways to pay less: sell a bit each tax year to use the allowance, and move money into an ISA each year ("Bed and ISA"), where it is tax-free.')));
      items.push(el('p', { class: 'small muted' }, 'The projection above does not take this tax off. An ISA would mean no tax on growth or income.'));
    }
    return el('section', { class: 'card', 'aria-labelledby': 'h-wrap' }, el('h2', { id: 'h-wrap' }, 'Tax: ' + WRAPPERS[s.wrapper].label), items);
  }

  function tableCard(r) {
    var rows = r.mid.rows.map(function (row, i) {
      return el('tr', null, el('td', null, String(new Date().getFullYear() + Math.round(row.year))),
        el('td', { class: 'num' }, MP.money(s.real ? row.paidReal : row.paid)),
        el('td', { class: 'num' }, MP.money(v(r.low.rows[i].bal, row.year))),
        el('td', { class: 'num' }, MP.money(v(row.bal, row.year))),
        el('td', { class: 'num' }, MP.money(v(r.high.rows[i].bal, row.year))));
    });
    var d = el('details', { class: 'card', id: 'inv-table', open: s.showTable },
      el('summary', null, 'Year by year table'),
      el('div', { class: 'scroll-x' }, el('table', { class: 'table' },
        el('thead', null, el('tr', null, el('th', null, 'Year'), el('th', { class: 'num' }, 'Paid in'), el('th', { class: 'num' }, 'Low'), el('th', { class: 'num' }, 'Mid'), el('th', { class: 'num' }, 'High'))),
        el('tbody', null, rows))));
    d.addEventListener('toggle', function () { if (s.showTable !== d.open) { s.showTable = d.open; MP.set('tools.investments', s); } });
    return d;
  }

  function howTo(r) {
    var extra = r.mid.bal - r.midMoreFee.bal;
    return el('details', { class: 'card' }, el('summary', null, 'How to use this, and tips'),
      el('ul', { class: 'small' },
        el('li', null, 'Enter what you can invest each month and for how long. Try the slider to see how much difference extra years make.'),
        el('li', null, 'Invest for at least 5 years. Money you need sooner is usually better in cash savings, because investments can fall just when you need them.'),
        el('li', null, 'Keep an emergency fund of 3 to 6 months\' essential spending in easy-access savings first, and pay off expensive debts like credit cards before investing.'),
        el('li', null, 'Spread your money (diversify) across many companies and countries, for example with a fund, rather than a few shares.'),
        el('li', null, 'Fees matter. In your plan, charges cost about ' + MP.money(r.feeCost) + ' in the mid scenario, and every extra 0.5% a year would cost about ' + MP.money(extra) + ' more.'),
        el('li', null, 'If an investment firm fails, the FSCS can protect up to £85,000 per person, per firm. This does not cover your investments falling in value.'),
        el('li', null, 'Beware of scams. Nobody can promise "guaranteed" high returns. Check a firm on the FCA register and visit ',
          el('a', { href: 'https://www.fca.org.uk/scamsmart', target: '_blank', rel: 'noopener' }, 'FCA ScamSmart'), ' before you invest.')));
  }

  var wasNarrow = narrow();
  window.addEventListener('resize', function () { if (narrow() !== wasNarrow) { wasNarrow = narrow(); update(); } });
  MP.onTheme(function () { update(); });
  MP.onPrefs(function () { update(); });   // advice wording follows the advice preference

  render();
});
