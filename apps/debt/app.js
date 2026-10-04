/* Mortgage & debt: mortgage repayments and overpayments, buying a home (affordability and Stamp Duty),
   and paying off cards and loans with the avalanche or snowball method.
   Everything is simulated month by month on the device. Inputs are saved at 'tools.debt'. */
MP.page({ id: 'debt', title: 'Mortgage & debt' }).then(function () {
  'use strict';
  var el = MP.el, main = MP.$('#app');
  var MAX_MONTHS = 1200; // 100 years: stop any simulation here

  function addMonthsIso(n) { var d = new Date(); d.setDate(1); d.setMonth(d.getMonth() + n); return MP.isoDate(d); }
  function monthsFromNow(n) { var d = new Date(); d.setDate(1); d.setMonth(d.getMonth() + n); return d; }
  function monYear(d) { return d.toLocaleDateString('en-GB', { month: 'short', year: 'numeric' }); }
  function monthsUntil(iso) {
    var d = new Date(iso); if (isNaN(d)) return null;
    var now = new Date();
    return (d.getFullYear() - now.getFullYear()) * 12 + (d.getMonth() - now.getMonth());
  }
  function dur(m) {
    m = Math.max(0, Math.round(m));
    var y = Math.floor(m / 12), r = m % 12, parts = [];
    if (y) parts.push(y + (y === 1 ? ' year' : ' years'));
    if (r || !y) parts.push(r + (r === 1 ? ' month' : ' months'));
    return parts.join(' ');
  }

  function defaults() {
    var p = MP.profile();
    return {
      tab: 'mortgage',
      mortgage: { balance: 200000, rate: 5, years: 25, months: 0, type: 'repayment', dealEnd: addMonthsIso(24), svr: 7.5, over: 0, lump: 0, allow: 10 },
      buy: { price: 300000, deposit: 30000, income1: +p.salary || 35000, income2: 0, rate: 4.5, years: 30, buyer: 'ftb' },
      debts: [
        { id: MP.uid(), name: 'Credit card', balance: 3200, apr: 24.9, min: 96 },
        { id: MP.uid(), name: 'Car finance', balance: 7800, apr: 9.9, min: 210 },
        { id: MP.uid(), name: 'Overdraft', balance: 600, apr: 39.9, min: 25 },
        { id: MP.uid(), name: 'Buy now, pay later', balance: 300, apr: 0, min: 100 }
      ],
      extra: 150
    };
  }
  var settings = MP.get('tools.debt', null);
  (function migrate() {
    var d = defaults();
    if (!settings || typeof settings !== 'object') { settings = d; return; }
    ['tab', 'extra', 'debts'].forEach(function (k) { if (settings[k] == null) settings[k] = d[k]; });
    ['mortgage', 'buy'].forEach(function (k) { settings[k] = Object.assign({}, d[k], settings[k] || {}); });
    if (!Array.isArray(settings.debts)) settings.debts = d.debts;
  })();

  var logged = false;
  function save() {
    MP.set('tools.debt', settings);
    saveSummary();
    if (!logged) { logged = true; MP.log('Updated the Mortgage & debt plan'); }
  }

  /* ================= maths ================= */
  function payment(P, annualPct, n) {
    if (P <= 0 || n <= 0) return 0;
    var i = annualPct / 100 / 12;
    return i === 0 ? P / n : P * i / (1 - Math.pow(1 + i, -n));
  }

  /* Simulate a mortgage month by month. Returns months to clear, interest and yearly balances. */
  function simMortgage(m, withOver) {
    var n = MP.clamp(Math.round((+m.years || 0) * 12 + (+m.months || 0)), 0, 600);
    var i = Math.max(0, +m.rate || 0) / 100 / 12;
    var bal = Math.max(0, +m.balance || 0);
    var over = withOver ? Math.max(0, +m.over || 0) : 0;
    if (withOver) bal = Math.max(0, bal - Math.max(0, +m.lump || 0));
    var base = m.type === 'interest' ? 0 : payment(Math.max(0, +m.balance || 0), +m.rate || 0, n);
    var interest = 0, month = 0, yearly = [bal];
    while (month < n && bal > 0.005) {
      month++;
      var int = bal * i;
      var due = m.type === 'interest' ? int : base;
      var pay = Math.min(bal + int, due + over);
      interest += int;
      bal = bal + int - pay;
      if (bal < 0.005) bal = 0;
      if (month % 12 === 0) yearly.push(bal);
    }
    if (month % 12 !== 0) yearly.push(bal);
    return { n: n, months: bal > 0 ? n : month, interest: interest, end: bal, yearly: yearly, firstPayment: m.type === 'interest' ? Math.max(0, +m.balance || 0) * i : base };
  }
  /* Balance after k months on the contractual payment (no overpayments unless asked). */
  function balanceAfter(m, k, withOver) {
    var n = MP.clamp(Math.round((+m.years || 0) * 12 + (+m.months || 0)), 0, 600);
    var i = Math.max(0, +m.rate || 0) / 100 / 12, bal = Math.max(0, +m.balance || 0);
    var over = withOver ? Math.max(0, +m.over || 0) : 0;
    if (withOver) bal = Math.max(0, bal - Math.max(0, +m.lump || 0));
    var base = m.type === 'interest' ? 0 : payment(Math.max(0, +m.balance || 0), +m.rate || 0, n);
    for (var t = 0; t < Math.min(k, n) && bal > 0; t++) {
      var int = bal * i, due = m.type === 'interest' ? int : base;
      bal = Math.max(0, bal + int - Math.min(bal + int, due + over));
    }
    return bal;
  }

  /* Stamp Duty Land Tax, England & Northern Ireland, from 1 April 2025. */
  var SDLT_STANDARD = [[125000, 0], [250000, 0.02], [925000, 0.05], [1500000, 0.10], [Infinity, 0.12]];
  var SDLT_FTB = [[300000, 0], [500000, 0.05]];
  function sdlt(price, buyer) {
    price = Math.max(0, +price || 0);
    var bands = buyer === 'ftb' && price <= 500000 ? SDLT_FTB : SDLT_STANDARD;
    var surcharge = buyer === 'additional' && price >= 40000 ? 0.05 : 0;
    var tax = 0, prev = 0, parts = [];
    bands.forEach(function (b) {
      var amt = Math.max(0, Math.min(price, b[0]) - prev);
      if (amt > 0) { var t = amt * (b[1] + surcharge); tax += t; parts.push({ from: prev, to: Math.min(price, b[0]), rate: b[1] + surcharge, tax: t }); }
      prev = b[0];
    });
    return { tax: Math.round(tax * 100) / 100, parts: parts, reliefLost: buyer === 'ftb' && price > 500000 };
  }

  /* Pay off debts month by month. order: 'avalanche' (highest APR first) or 'snowball' (smallest balance first).
     The monthly budget stays the same: when one debt is cleared its minimum rolls on to the next. */
  function simDebts(list, extra, order) {
    var ds = list.filter(function (d) { return (+d.balance || 0) > 0; }).map(function (d, k) {
      return { id: d.id, name: d.name || 'Debt ' + (k + 1), start: +d.balance, bal: +d.balance, apr: Math.max(0, +d.apr || 0), min: Math.max(0, +d.min || 0), paid: null };
    });
    var budget = ds.reduce(function (a, d) { return a + d.min; }, 0) + Math.max(0, +extra || 0);
    var pri = ds.slice().sort(order === 'snowball' ?
      function (a, b) { return a.start - b.start || b.apr - a.apr; } :
      function (a, b) { return b.apr - a.apr || a.start - b.start; });
    function total() { return ds.reduce(function (a, d) { return a + d.bal; }, 0); }
    var month = 0, interest = 0, series = [total()];
    while (total() > 0.005 && month < MAX_MONTHS) {
      month++;
      ds.forEach(function (d) { if (d.bal > 0) { var int = d.bal * d.apr / 100 / 12; d.bal += int; interest += int; } });
      var left = budget;
      ds.forEach(function (d) { if (d.bal > 0) { var p = Math.min(d.min, d.bal, left); d.bal -= p; left -= p; } });
      pri.forEach(function (d) { if (d.bal > 0 && left > 0) { var p = Math.min(left, d.bal); d.bal -= p; left -= p; } });
      ds.forEach(function (d) { if (d.bal <= 0.005 && d.paid == null) { d.bal = 0; d.paid = month; } });
      series.push(total());
      if (month > 24 && series[month] >= series[month - 12] - 0.01 && series[month - 12] >= series[month - 24] - 0.01) { month = MAX_MONTHS; break; } // growing: never paid off
    }
    var done = total() <= 0.005;
    return { months: month, interest: interest, done: done, budget: budget, series: series,
      order: pri.slice().sort(function (a, b) { return (a.paid == null ? 1e9 : a.paid) - (b.paid == null ? 1e9 : b.paid); }) };
  }

  /* Chart wrapper. Works around two things in the shared MP.lineChart: it always draws the last x label,
     which can overlap the label before it, and its fixed 640px viewBox makes text tiny on phones. */
  function chart(opts) {
    var labels = opts.labels.slice(), n = labels.length, step = Math.max(1, Math.ceil(n / 8));
    var rem = (n - 1) % step;
    if (n > 1 && rem !== 0 && rem < step * 0.75) labels[n - 1 - rem] = '';
    if (String(labels[n - 1]).length > 4) labels[n - 1] = ''; // a long last label is clipped at the right edge
    opts.labels = labels;
    var w = (results && results.clientWidth) || 640;
    if (w < 560) { opts.width = 420; opts.height = 300; }
    return MP.lineChart(opts);
  }

  /* ================= shell ================= */
  var TABS = [{ id: 'mortgage', label: '🏠 Mortgage' }, { id: 'buy', label: '🔑 Buy a home' }, { id: 'debts', label: '💳 Debts' }];
  var results; // container for the current tab's results
  var renderResults = function () { };

  function render() {
    main.innerHTML = '';
    main.appendChild(el('div', { class: 'row', style: { justifyContent: 'space-between', margin: '6px 0 14px' } },
      el('div', null, el('h1', { style: { margin: 0 } }, 'Mortgage & debt'),
        el('p', { class: 'muted', style: { margin: 0 } }, 'Plan mortgage repayments and overpayments, and pay off cards and loans faster.')),
      el('button', { class: 'btn', type: 'button', id: 'reset', onclick: reset }, 'Reset')));

    var tabs = el('div', { class: 'tabs', role: 'tablist', 'aria-label': 'Sections' });
    TABS.forEach(function (t) {
      var sel = settings.tab === t.id;
      tabs.appendChild(el('button', { type: 'button', role: 'tab', id: 'tab-' + t.id, 'aria-selected': String(sel), 'aria-controls': 'panel', tabindex: sel ? '0' : '-1',
        onclick: function () { settings.tab = t.id; save(); render(); MP.$('#tab-' + t.id).focus(); } }, t.label));
    });
    tabs.addEventListener('keydown', function (e) {
      var k = TABS.map(function (t) { return t.id; }).indexOf(settings.tab);
      if (e.key === 'ArrowRight' || e.key === 'ArrowLeft') {
        e.preventDefault();
        settings.tab = TABS[(k + (e.key === 'ArrowRight' ? 1 : TABS.length - 1)) % TABS.length].id;
        save(); render(); MP.$('#tab-' + settings.tab).focus();
      }
    });
    main.appendChild(tabs);

    var panel = el('div', { id: 'panel', role: 'tabpanel', 'aria-labelledby': 'tab-' + settings.tab, class: 'split' });
    results = el('div', { class: 'stack', id: 'results', 'aria-live': 'polite' });
    if (settings.tab === 'buy') panel.appendChild(buyInputs());
    else if (settings.tab === 'debts') panel.appendChild(debtInputs());
    else panel.appendChild(mortgageInputs());
    var right = el('div', { class: 'stack' }, results, howTo());
    panel.appendChild(right);
    main.appendChild(panel);
    renderResults = settings.tab === 'buy' ? buyResults : settings.tab === 'debts' ? debtResults : mortgageResults;
    renderResults();
    saveSummary();
  }

  /* number input bound to obj[key]; re-renders results on every change */
  function bind(input, obj, key, opts) {
    opts = opts || {};
    input.addEventListener('input', function () {
      var v = MP.num(input.value);
      if (opts.max != null) v = Math.min(opts.max, v);
      obj[key] = Math.max(0, v);
      save(); renderResults();
    });
    return input;
  }
  function moneyField(label, id, obj, key, hint) {
    var m = MP.moneyInput({ id: id, value: obj[key] === 0 ? '0' : obj[key] });
    bind(m.input, obj, key, { max: 1e9 });
    return MP.field(label, m.wrap, hint);
  }
  function pctField(label, id, obj, key, hint) {
    var inp = el('input', { type: 'number', id: id, inputmode: 'decimal', min: '0', max: '100', step: '0.01', value: obj[key] });
    bind(inp, obj, key, { max: 100 });
    return MP.field(label, el('div', { class: 'pct-input' }, inp), hint);
  }
  function stat(label, value, id, dataValue, cls) {
    return el('div', { class: 'stat' }, el('span', { class: 'label' }, label),
      el('span', { class: 'value' + (cls ? ' ' + cls : ''), id: id, dataset: dataValue != null ? { value: String(dataValue) } : null }, value));
  }

  /* ================= 1. mortgage ================= */
  function mortgageInputs() {
    var m = settings.mortgage;
    var years = el('input', { type: 'number', id: 'm-years', min: '0', max: '50', step: '1', inputmode: 'numeric', value: m.years });
    var months = el('input', { type: 'number', id: 'm-months', min: '0', max: '11', step: '1', inputmode: 'numeric', value: m.months });
    bind(years, m, 'years', { max: 50 }); bind(months, m, 'months', { max: 11 });
    var deal = el('input', { type: 'date', id: 'm-deal', value: m.dealEnd || '' });
    deal.addEventListener('change', function () { m.dealEnd = deal.value; save(); renderResults(); });
    var type = MP.seg([{ value: 'repayment', label: 'Repayment' }, { value: 'interest', label: 'Interest-only' }], m.type, function (v) { m.type = v; save(); renderResults(); }, 'Mortgage type');
    type.id = 'm-type';
    return el('section', { class: 'card', 'aria-labelledby': 'h-m-in' },
      el('h2', { id: 'h-m-in' }, 'Your mortgage'),
      moneyField('Amount left to pay', 'm-balance', m, 'balance', 'Your latest mortgage statement or app shows this.'),
      pctField('Interest rate now (%)', 'm-rate', m, 'rate'),
      el('div', { class: 'field' }, el('span', { class: 'label' }, 'Time left on the mortgage'),
        el('div', { class: 'grid-2 tight' },
          el('label', { class: 'sub' }, el('span', { class: 'small muted' }, 'Years'), years),
          el('label', { class: 'sub' }, el('span', { class: 'small muted' }, 'Months'), months))),
      el('div', { class: 'field' }, el('span', { class: 'label' }, 'Type'), type),
      el('hr'),
      el('h3', null, 'When your deal ends'),
      el('div', { class: 'grid-2 tight' },
        MP.field('Deal ends on', deal),
        pctField('Rate after (SVR)', 'm-svr', m, 'svr')),
      el('hr'),
      el('h3', null, 'Overpayments'),
      moneyField('Extra each month', 'm-over', m, 'over'),
      moneyField('One-off lump sum now', 'm-lump', m, 'lump'),
      pctField('Overpayment allowance a year (%)', 'm-allow', m, 'allow', 'Most deals let you overpay 10% of the balance a year without an early repayment charge. Check your offer.'));
  }

  function mortgageResults() {
    var m = settings.mortgage;
    results.innerHTML = '';
    var base = simMortgage(m, false), withO = simMortgage(m, true);
    var hasOver = (+m.over || 0) > 0 || (+m.lump || 0) > 0;
    if (!(+m.balance > 0) || base.n <= 0) {
      results.appendChild(el('div', { class: 'card' }, el('p', { class: 'muted', id: 'm-empty' }, 'Enter the amount left to pay and the time left to see your plan.')));
      return;
    }
    var interestOnly = m.type === 'interest';
    var card = el('section', { class: 'card', 'aria-labelledby': 'h-m-out' }, el('h2', { id: 'h-m-out' }, 'Your payments'),
      el('div', { class: 'stats' },
        stat(interestOnly ? 'Monthly payment (interest only)' : 'Monthly payment', MP.money(base.firstPayment, true), 'm-payment', base.firstPayment.toFixed(2), 'big'),
        stat('Total interest', MP.money(base.interest), 'm-interest', Math.round(base.interest)),
        interestOnly ? stat('Still owed at the end', MP.money(base.end), 'm-end', Math.round(base.end)) :
          stat('Mortgage-free by', monYear(monthsFromNow(base.months)), 'm-free', base.months)),
      hasOver && (+m.over || 0) > 0 ? el('p', { class: 'small muted', style: { marginTop: '10px' } }, 'With your overpayment you would pay ' + MP.money(withO.firstPayment + (+m.over || 0), true) + ' a month.') : null,
      el('p', { class: 'tiny muted', style: { marginTop: '10px' } }, 'Assumes today\'s rate for the rest of the term. Most people move to a new deal when theirs ends.'));
    results.appendChild(card);

    if (interestOnly) {
      results.appendChild(el('div', { class: 'callout warning' }, el('p', null, 'With interest-only you still owe ' + MP.money(base.end) + ' at the end of the term. Make sure you have a plan to repay it, like savings, investments or selling. ' +
        'Switching to repayment would cost ' + MP.money(payment(+m.balance, +m.rate, base.n), true) + ' a month.')));
    }

    // overpayments
    if (hasOver) {
      var savedM = base.months - withO.months, savedI = base.interest - withO.interest;
      var firstYear = (+m.over || 0) * 12 + (+m.lump || 0), allowance = (+m.balance || 0) * (+m.allow || 0) / 100;
      results.appendChild(el('section', { class: 'card', 'aria-labelledby': 'h-m-over' }, el('h2', { id: 'h-m-over' }, 'With your overpayments'),
        el('div', { class: 'stats' },
          stat(interestOnly ? 'Owed at the end' : 'Time saved', interestOnly ? MP.money(withO.end) : dur(savedM), 'm-saved-months', savedM, 'pos'),
          stat('Interest saved', MP.money(savedI), 'm-saved-interest', Math.round(savedI), 'pos'),
          stat(interestOnly && withO.end > 0 ? 'Total interest' : 'Mortgage-free by', interestOnly && withO.end > 0 ? MP.money(withO.interest) : monYear(monthsFromNow(withO.months)), 'm-months-over', withO.months)),
        el('p', { class: 'small', style: { marginTop: '10px' } }, 'Total interest with overpayments: ', el('strong', { id: 'm-interest-over', dataset: { value: String(Math.round(withO.interest)) } }, MP.money(withO.interest)), '.'),
        firstYear > allowance + 0.5 ? el('div', { class: 'callout danger', id: 'm-allow-warn', role: 'alert' },
          el('p', null, 'You plan to overpay ' + MP.money(firstYear) + ' in the first year, but your allowance is about ' + MP.money(allowance) + ' (' + (+m.allow || 0) + '% of the balance). ' +
            'Above that, your lender may charge an early repayment charge, often 1% to 5% of the extra. Check your mortgage offer, or wait until your deal ends.')) :
          el('p', { class: 'callout success small' }, 'This is within your yearly overpayment allowance of about ' + MP.money(allowance) + '.')));
    }

    // chart
    var years = Math.max(base.yearly.length, withO.yearly.length);
    var labels = [], y0 = new Date().getFullYear();
    for (var k = 0; k < years; k++) labels.push(String(y0 + k));
    function pad(a) { a = a.slice(); while (a.length < years) a.push(0); return a; }
    var series = [{ name: 'Balance on normal payments', color: '--c1', values: pad(base.yearly), area: true }];
    if (hasOver) series.push({ name: 'Balance with overpayments', color: '--c2', values: pad(withO.yearly) });
    var dm = monthsUntil(m.dealEnd);
    var opts = { series: series, labels: labels, label: 'Mortgage balance over time' };
    if (dm != null && dm > 0 && dm / 12 < years - 1) opts.marker = { index: dm / 12, label: 'Deal ends' };
    results.appendChild(el('section', { class: 'card', 'aria-labelledby': 'h-m-chart' }, el('h2', { id: 'h-m-chart' }, 'Balance over time'), chart(opts)));

    // deal end
    var dealBox = el('section', { class: 'card', 'aria-labelledby': 'h-m-deal' }, el('h2', { id: 'h-m-deal' }, 'When your deal ends'));
    if (dm == null || !m.dealEnd) {
      dealBox.appendChild(el('p', { class: 'muted' }, 'Add the date your current deal ends to see what could happen to your payment.'));
    } else {
      var left = Math.max(0, base.n - Math.max(0, dm));
      var balAtEnd = balanceAfter(m, Math.max(0, dm), false);
      var svrPay = interestOnly ? balAtEnd * (+m.svr || 0) / 1200 : payment(balAtEnd, +m.svr || 0, left);
      var diff = svrPay - base.firstPayment;
      if (dm <= 0) {
        dealBox.appendChild(el('div', { class: 'callout warning' }, el('p', null, 'Your deal has ended, so you may now be paying the standard variable rate. Compare new deals now: switching could lower your payment.')));
      } else if (left <= 0 || balAtEnd <= 0) {
        dealBox.appendChild(el('p', { class: 'muted' }, 'Your mortgage is paid off before this deal ends.'));
      } else {
        dealBox.appendChild(el('p', null, 'From ', el('strong', null, MP.fmtDate(m.dealEnd)), ', if you move to the standard variable rate of ' + (+m.svr || 0) + '%, your payment could go from ' +
          MP.money(base.firstPayment, true) + ' to ', el('strong', { id: 'm-svr-payment', dataset: { value: svrPay.toFixed(2) } }, MP.money(svrPay, true)), ' a month' +
          (diff > 0.5 ? ' (' + MP.money(diff) + ' more).' : '.')));
        var tip = monthsFromNow(dm - 6);
        dealBox.appendChild(el('p', { class: 'callout' + (dm <= 6 ? ' warning' : '') },
          dm <= 6 ? 'Your deal ends within 6 months. Start comparing new deals now. Many lenders let you lock in a rate up to 6 months ahead, and you can still switch if rates fall.' :
            'Tip: start looking for a new deal around ' + monYear(tip) + ', about 6 months before your deal ends. A product transfer with your lender or a remortgage elsewhere usually beats the SVR.'));
      }
    }
    results.appendChild(dealBox);
  }

  /* ================= 2. buying a home ================= */
  function buyInputs() {
    var b = settings.buy;
    var buyer = MP.seg([{ value: 'ftb', label: 'First home' }, { value: 'mover', label: 'Moving home' }, { value: 'additional', label: 'Extra property' }], b.buyer,
      function (v) { b.buyer = v; save(); renderResults(); }, 'Who is buying');
    buyer.id = 'b-buyer';
    var years = el('input', { type: 'number', id: 'b-years', min: '1', max: '40', step: '1', inputmode: 'numeric', value: b.years });
    bind(years, b, 'years', { max: 40 });
    return el('section', { class: 'card', 'aria-labelledby': 'h-b-in' },
      el('h2', { id: 'h-b-in' }, 'The home you want'),
      moneyField('Property price', 'b-price', b, 'price'),
      moneyField('Your deposit', 'b-deposit', b, 'deposit'),
      el('div', { class: 'field' }, el('span', { class: 'label' }, 'Who is buying?'), buyer,
        el('span', { class: 'hint' }, 'First home: you have never owned a home anywhere. Extra property: you will own more than one, like a buy-to-let or second home.')),
      el('hr'),
      el('h3', null, 'Your income'),
      moneyField('Your yearly salary (before tax)', 'b-income1', b, 'income1', 'Filled in from About you on the home page.'),
      moneyField('Second buyer\'s salary (optional)', 'b-income2', b, 'income2'),
      el('hr'),
      el('h3', null, 'Mortgage estimate'),
      el('div', { class: 'grid-2 tight' }, pctField('Interest rate (%)', 'b-rate', b, 'rate'), MP.field('Term (years)', years)));
  }

  function buyResults() {
    var b = settings.buy, region = MP.profile().region || 'england';
    results.innerHTML = '';
    var price = +b.price || 0, deposit = Math.min(+b.deposit || 0, price), loan = Math.max(0, price - deposit);
    var income = (+b.income1 || 0) + (+b.income2 || 0);
    var ltv = price > 0 ? loan / price : 0;
    var lo = income * 4, hi = income * 4.5;
    var n = Math.round((+b.years || 0) * 12);
    var pay = payment(loan, +b.rate || 0, n), stress = payment(loan, (+b.rate || 0) + 3, n);
    var tax = sdlt(price, b.buyer);

    if (price <= 0) {
      results.appendChild(el('div', { class: 'card' }, el('p', { class: 'muted' }, 'Enter a property price to see what you could borrow and the Stamp Duty.')));
      return;
    }

    var ltvBand = ltv <= 0.6 ? 'success' : ltv <= 0.85 ? 'info' : ltv <= 0.95 ? 'warning' : 'danger';
    var lendNote;
    if (!income) lendNote = el('p', { class: 'callout warning' }, 'Add your income to see a rough borrowing range.');
    else if (loan > hi) lendNote = el('p', { class: 'callout danger', id: 'b-lend-note' }, 'You need ' + MP.money(loan) + ', more than the usual top of ' + MP.money(hi) + '. A bigger deposit, a cheaper home or a second buyer would help.');
    else if (loan > lo) lendNote = el('p', { class: 'callout warning', id: 'b-lend-note' }, 'You need ' + MP.money(loan) + ', at the top of the usual range. Some lenders may offer this, others will not.');
    else lendNote = el('p', { class: 'callout success', id: 'b-lend-note' }, 'You need ' + MP.money(loan) + ', within the usual range.');

    results.appendChild(el('section', { class: 'card', 'aria-labelledby': 'h-b-borrow' }, el('h2', { id: 'h-b-borrow' }, 'What you would borrow'),
      el('div', { class: 'stats' },
        stat('Mortgage needed', MP.money(loan), 'b-loan', Math.round(loan), 'big'),
        stat('Loan to value (LTV)', MP.pct(ltv, 1), 'b-ltv', ltv.toFixed(4)),
        stat('Deposit (' + MP.pct(price ? deposit / price : 0, 1) + ')', MP.money(deposit), 'b-dep-pct')),
      el('p', { class: 'small', style: { marginTop: '10px' } }, el('span', { class: 'chip ' + ltvBand }, 'LTV ' + MP.pct(ltv, 0)), ' ',
        ltv > 0.95 ? 'Very few lenders go above 95%. Saving a bigger deposit opens up more deals.' :
          ltv > 0.9 ? 'At 90% to 95% LTV there are fewer deals and higher rates.' :
            ltv > 0.75 ? 'Rates usually get better at 75%, 60% LTV and below.' : 'A low LTV usually gets you the best rates.'),
      el('hr'),
      el('div', { class: 'stat' }, el('span', { class: 'label' }, 'Rough lending range (4 to 4.5 times income of ' + MP.money(income) + ')'),
        el('span', { class: 'value', id: 'b-range' }, MP.money(lo) + ' to ' + MP.money(hi))),
      lendNote,
      el('p', { class: 'tiny muted' }, 'Lenders decide how much to lend after checking your income, spending, debts and credit history. This is only a rough guide.')));

    // Stamp Duty
    var taxCard = el('section', { class: 'card', 'aria-labelledby': 'h-b-tax' }, el('h2', { id: 'h-b-tax' }, 'Stamp Duty (England and Northern Ireland)'));
    if (region === 'scotland' || region === 'wales') {
      taxCard.appendChild(el('div', { class: 'callout warning', id: 'b-region-note' }, el('p', null, 'Your profile says you live in ' + (region === 'scotland' ? 'Scotland' : 'Wales') + '. Homes there pay ' +
        (region === 'scotland' ? 'Land and Buildings Transaction Tax (LBTT), set by Revenue Scotland' : 'Land Transaction Tax (LTT), set by the Welsh Revenue Authority') +
        '. This calculator covers England and Northern Ireland only, so the figure below does not apply to a home in ' + (region === 'scotland' ? 'Scotland' : 'Wales') + '.')));
    }
    taxCard.appendChild(el('div', { class: 'stats' },
      stat('Stamp Duty to pay', MP.money(tax.tax), 'b-sdlt', Math.round(tax.tax), 'big'),
      stat('Effective rate', MP.pct(price ? tax.tax / price : 0, 2), 'b-sdlt-rate')));
    if (tax.parts.length) {
      taxCard.appendChild(el('div', { class: 'scroll-x', style: { marginTop: '12px' } }, el('table', { class: 'table small' },
        el('thead', null, el('tr', null, el('th', null, 'Part of the price'), el('th', { class: 'num' }, 'Rate'), el('th', { class: 'num' }, 'Tax'))),
        el('tbody', null, tax.parts.map(function (p) {
          return el('tr', null, el('td', null, MP.money(p.from) + ' to ' + MP.money(p.to)), el('td', { class: 'num' }, MP.pct(p.rate, 0)), el('td', { class: 'num' }, MP.money(p.tax)));
        })))));
    }
    taxCard.appendChild(el('p', { class: 'small muted', style: { marginTop: '10px' } },
      b.buyer === 'ftb' ? (tax.reliefLost ? 'First-time buyer relief only applies to homes up to £500,000, so standard rates apply.' : 'First-time buyer relief: no tax up to £300,000 and 5% on the part from £300,001 to £500,000.') :
        b.buyer === 'additional' ? 'Includes the 5% surcharge for an additional property (not charged under £40,000). You may get some back if you sell your old main home within 3 years.' :
          'Standard rates from 1 April 2025: 0% to £125,000, 2% to £250,000, 5% to £925,000, 10% to £1.5m and 12% above.'));
    results.appendChild(taxCard);

    // monthly cost
    var net = 0;
    [+b.income1 || 0, +b.income2 || 0].forEach(function (g) { if (g > 0) net += g - UK.incomeTax(g, region).tax - UK.nationalInsurance(g); });
    var netM = net / 12;
    results.appendChild(el('section', { class: 'card', 'aria-labelledby': 'h-b-pay' }, el('h2', { id: 'h-b-pay' }, 'Monthly payment'),
      el('div', { class: 'stats' },
        stat('At ' + (+b.rate || 0) + '% over ' + (+b.years || 0) + ' years', MP.money(pay, true), 'b-monthly', pay.toFixed(2), 'big'),
        stat('If rates rise 3% (to ' + ((+b.rate || 0) + 3).toFixed(2).replace(/\.?0+$/, '') + '%)', MP.money(stress, true), 'b-stress', stress.toFixed(2), 'neg')),
      netM > 0 ? el('p', { class: 'small', style: { marginTop: '10px' } }, 'That is ' + MP.pct(pay / netM, 0) + ' of your estimated take-home pay of ' + MP.money(netM) + ' a month, or ' +
        MP.pct(stress / netM, 0) + ' if rates rise. ' + (stress / netM > 0.45 ? 'That would be a stretch: lenders test that you could still pay at higher rates.' : '')) : null,
      el('p', { class: 'small', style: { marginTop: '6px' } }, 'Money you need upfront: ', el('strong', { id: 'b-upfront' }, MP.money(deposit + tax.tax)), ' (deposit and Stamp Duty), plus legal fees, surveys and moving costs, often £2,000 to £4,000.')));
  }

  /* ================= 3. debts ================= */
  function debtInputs() {
    var list = el('div', { id: 'debt-list', class: 'debt-list' });
    function row(d) {
      function num(cls, key, label, isMoney) {
        var inp = el('input', { type: 'number', class: cls, inputmode: 'decimal', min: '0', step: isMoney ? 'any' : '0.1', value: d[key], 'aria-label': label + ' for ' + (d.name || 'debt') });
        bind(inp, d, key, { max: isMoney ? 1e8 : 100 });
        return el('label', { class: 'sub' }, el('span', { class: 'tiny muted' }, label), isMoney ? el('div', { class: 'money-input' }, inp) : el('div', { class: 'pct-input' }, inp));
      }
      var name = el('input', { type: 'text', class: 'd-name', value: d.name, maxlength: 40, 'aria-label': 'Debt name' });
      name.addEventListener('input', function () { d.name = name.value; save(); renderResults(); });
      return el('div', { class: 'debt-row panel', dataset: { id: d.id } },
        el('div', { class: 'debt-top' }, name,
          el('button', { class: 'btn btn-sm btn-ghost d-del', type: 'button', 'aria-label': 'Remove ' + (d.name || 'debt'), onclick: function () {
            settings.debts = settings.debts.filter(function (x) { return x.id !== d.id; }); save(); render();
          } }, '✕')),
        el('div', { class: 'debt-nums' }, num('d-bal', 'balance', 'Balance', true), num('d-apr', 'apr', 'APR %'), num('d-min', 'min', 'Minimum', true)));
    }
    settings.debts.forEach(function (d) { list.appendChild(row(d)); });
    var extra = MP.moneyInput({ id: 'debt-extra', value: settings.extra });
    bind(extra.input, settings, 'extra', { max: 1e7 });
    return el('section', { class: 'card', 'aria-labelledby': 'h-d-in' },
      el('h2', { id: 'h-d-in' }, 'Your debts'),
      el('p', { class: 'small muted' }, 'Cards, loans, overdraft, buy now pay later, car finance. Leave out your mortgage.'),
      list,
      el('button', { class: 'btn btn-sm', type: 'button', id: 'debt-add', style: { marginTop: '10px' }, onclick: function () {
        settings.debts.push({ id: MP.uid(), name: 'Debt ' + (settings.debts.length + 1), balance: 1000, apr: 20, min: 30 });
        save(); render();
        var rows = MP.$$('#debt-list .d-name'); if (rows.length) rows[rows.length - 1].focus();
      } }, '＋ Add a debt'),
      el('hr'),
      MP.field('Extra you can pay each month', extra.wrap, 'On top of all the minimum payments. Even a small amount helps.'));
  }

  function debtResults() {
    results.innerHTML = '';
    var ds = settings.debts.filter(function (d) { return (+d.balance || 0) > 0; });
    if (!ds.length) {
      results.appendChild(el('div', { class: 'card', id: 'debt-empty' }, el('h2', null, 'No debts to show'), el('p', { class: 'muted' }, 'Add a debt with a balance to compare ways to pay it off. Debt-free already? Well done!')));
      return;
    }
    var total = ds.reduce(function (a, d) { return a + (+d.balance || 0); }, 0);
    var av = simDebts(ds, settings.extra, 'avalanche'), sb = simDebts(ds, settings.extra, 'snowball'), mins = simDebts(ds, 0, 'avalanche');

    // warnings: minimum does not cover interest
    var warn = ds.filter(function (d) { return (+d.min || 0) <= (+d.balance || 0) * (+d.apr || 0) / 1200 + 0.005 && (+d.apr || 0) > 0; });
    if (warn.length) {
      results.appendChild(el('div', { class: 'callout danger', id: 'debt-warn', role: 'alert' },
        el('p', null, el('strong', null, 'Minimum payment does not cover the interest')),
        el('ul', { class: 'small', style: { margin: 0, paddingInlineStart: '18px' } }, warn.map(function (d) {
          return el('li', null, (d.name || 'Debt') + ': interest is about ' + MP.money((+d.balance) * (+d.apr) / 1200, true) + ' a month but the minimum is ' + MP.money(+d.min || 0, true) + '. On its own this debt would never shrink.');
        }))));
    }

    function col(name, r, prefix, best) {
      return el('section', { class: 'card method' + (best ? ' best' : ''), 'aria-labelledby': 'h-' + prefix },
        el('div', { class: 'method-head' }, el('h3', { id: 'h-' + prefix, style: { margin: 0 } }, name), best ? el('span', { class: 'chip success' }, 'Least interest') : null),
        el('p', { class: 'small muted' }, prefix === 'av' ? 'Pay the highest interest rate first. Saves the most money.' : 'Pay the smallest balance first. Quick wins keep you going.'),
        r.done ? el('div', { class: 'stats two' },
          stat('Debt-free by', monYear(monthsFromNow(r.months)), prefix + '-date'),
          stat('Takes', dur(r.months), prefix + '-months', r.months),
          stat('Total interest', MP.money(r.interest), prefix + '-interest', r.interest.toFixed(2))) :
          el('p', { class: 'callout danger', id: prefix + '-never' }, 'Never paid off at this rate. Pay more each month or talk to a free debt adviser.'),
        r.done ? el('ol', { class: 'payoff small', id: prefix + '-order' }, r.order.map(function (d) {
          return el('li', null, el('span', null, d.name), el('span', { class: 'muted' }, d.paid != null ? monYear(monthsFromNow(d.paid)) : '—'));
        })) : null);
    }
    var avBest = av.done && (!sb.done || av.interest <= sb.interest + 0.5);
    results.appendChild(el('section', { class: 'card', 'aria-labelledby': 'h-d-sum' }, el('h2', { id: 'h-d-sum' }, 'Your plan'),
      el('div', { class: 'stats' },
        stat('Total debt', MP.money(total), 'debt-total', Math.round(total), 'big'),
        stat('Paying each month', MP.money(av.budget), 'debt-budget', Math.round(av.budget))),
      mins.done && av.done && settings.extra > 0 ? el('p', { class: 'small', style: { marginTop: '10px' } }, 'Paying minimums only would take ' + dur(mins.months) + ' and cost ' + MP.money(mins.interest) +
        ' in interest. Your extra ' + MP.money(settings.extra) + ' a month saves ' + MP.money(mins.interest - av.interest) + ' and ' + dur(mins.months - av.months) + '.') :
        !mins.done && av.done ? el('p', { class: 'small', style: { marginTop: '10px' } }, 'On minimum payments only you would never clear these debts. Your extra payment makes the difference.') : null,
      el('p', { class: 'tiny muted', style: { marginTop: '8px' } }, 'Assumes rates and minimum payments stay the same, no new spending, and that you keep paying the same total each month. When a debt is cleared, its payment moves on to the next one.')));

    results.appendChild(el('div', { class: 'grid-2' }, col('Avalanche', av, 'av', avBest), col('Snowball', sb, 'sb', !avBest && sb.done)));

    // chart: total balance over time (yearly points, or quarterly if short)
    if (av.done || sb.done) {
      var len = Math.max(av.done ? av.months : 0, sb.done ? sb.months : 0, 1);
      var step = len <= 36 ? 3 : len <= 120 ? 12 : 24;
      var labels = [], a = [], s = [];
      for (var k = 0; k <= len + step - 1; k += step) {
        var mm = Math.min(k, len);
        labels.push(k === 0 ? 'Now' : monYear(monthsFromNow(mm)).replace(' 20', " '"));
        a.push(av.series[Math.min(mm, av.series.length - 1)]); s.push(sb.series[Math.min(mm, sb.series.length - 1)]);
        if (mm === len) break;
      }
      results.appendChild(el('section', { class: 'card', 'aria-labelledby': 'h-d-chart' }, el('h2', { id: 'h-d-chart' }, 'Total debt over time'),
        chart({ series: [{ name: 'Avalanche', color: '--c2', values: a, area: true }, { name: 'Snowball', color: '--c3', values: s, dash: true }], labels: labels, label: 'Total debt over time, avalanche and snowball' })));
    }

    // save as a dream
    var dreamBtn = el('button', { class: 'btn btn-accent', type: 'button', id: 'save-dream', disabled: !av.done, onclick: function () {
      var goals = MP.goals();
      var g = goals.filter(function (x) { return x.id === settings.goalId; })[0] || goals.filter(function (x) { return x.name === 'Be debt-free'; })[0];
      var isNew = !g;
      if (!g) { g = { id: MP.uid(), saved: 0 }; goals.push(g); }
      Object.assign(g, { name: 'Be debt-free', icon: '🧹', target: Math.round(total), date: MP.isoDate(monthsFromNow(av.months)), priority: 1, home: 'debt', rate: 0,
        monthly: Math.round(av.budget), note: 'Avalanche plan: ' + MP.money(av.budget) + ' a month, highest interest rate first. From the Mortgage & debt tool.' });
      settings.goalId = g.id;
      MP.saveGoals(goals); save();
      MP.log((isNew ? 'Added' : 'Updated') + ' the dream "Be debt-free" (by ' + monYear(monthsFromNow(av.months)) + ')');
      MP.toast(isNew ? 'Saved to your dreams.' : 'Your "Be debt-free" dream is updated.');
    } }, '🧹 Save as a dream: Be debt-free');
    results.appendChild(el('div', { class: 'card row' }, dreamBtn, el('span', { class: 'small muted' }, av.done ? 'Adds it to Dreams & goals with your avalanche date.' : 'Make a plan that clears your debts first.')));
  }

  /* ================= common ================= */
  function howTo() {
    return el('details', { class: 'card' }, el('summary', null, 'How to use this, and tips'),
      el('ul', { class: 'small tips' },
        el('li', null, 'Struggling? Free, confidential debt help is available from ', link('StepChange', 'https://www.stepchange.org'), ', ', link('National Debtline', 'https://nationaldebtline.org'), ', ',
          link('Citizens Advice', 'https://www.citizensadvice.org.uk'), ' and ', link('MoneyHelper', 'https://www.moneyhelper.org.uk'), '. Avoid companies that charge for debt help.'),
        el('li', null, 'Pay priority debts first: rent or mortgage, council tax, energy bills, and court fines. Missing these can mean losing your home or your supply. Cards and loans come after.'),
        el('li', null, 'Worried about your mortgage payments? Talk to your lender early. Under the Mortgage Charter, many lenders can switch you to interest-only or extend your term for a while, without it affecting your credit score.'),
        el('li', null, 'A 0% balance transfer card can pause interest, but there is usually a fee (often 3% or more) and the 0% ends. Plan to clear it before then, and do not spend on the old card.'),
        el('li', null, 'Never borrow to repay borrowing without a plan. A consolidation loan only helps if the rate is lower and you stop using the cards you cleared.'),
        el('li', null, 'Overpaying a mortgage saves interest, but keep an emergency fund first and stay within your overpayment allowance. Your money is harder to get back once overpaid.'),
        el('li', null, 'Try it: enter all your debts, press "Save as a dream", then tick off each debt as it is cleared. The snowball method can feel easier; the avalanche costs less.')));
  }
  function link(text, href) { return el('a', { href: href, target: '_blank', rel: 'noopener' }, text); }

  function saveSummary() {
    var parts = [];
    var ds = settings.debts.filter(function (d) { return (+d.balance || 0) > 0; });
    if (ds.length) {
      var av = simDebts(ds, settings.extra, 'avalanche');
      parts.push(av.done ? 'Debt-free by ' + monYear(monthsFromNow(av.months)) + ' (avalanche)' : 'Debts: pay more to clear them');
    }
    var m = settings.mortgage;
    if (+m.balance > 0) {
      var base = simMortgage(m, true);
      if (base.n > 0) parts.push('Mortgage ' + MP.money(base.firstPayment + (+m.over || 0)) + '/month' + (base.end <= 0 ? ', free by ' + monthsFromNow(base.months).getFullYear() : ''));
    }
    if (parts.length) MP.summary('debt', parts.join(' · '));
    else MP.set('summaries.debt', undefined);
  }

  function reset() {
    if (!MP.confirm('Clear your mortgage, home and debt figures and start again?')) return;
    var tab = settings.tab;
    settings = defaults(); settings.tab = tab;
    MP.set('tools.debt', settings);
    MP.log('Reset the Mortgage & debt tool');
    render();
    MP.toast('Reset to the example figures.');
  }

  MP.onTheme(function () { renderResults(); });
  var narrow = window.innerWidth < 600, rt;
  window.addEventListener('resize', function () {
    clearTimeout(rt);
    rt = setTimeout(function () { var n = window.innerWidth < 600; if (n !== narrow) { narrow = n; renderResults(); } }, 150);
  });
  render();
});
