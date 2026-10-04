/* Self-employed tax: income tax, Class 4 NI, student loan and payments on account for a sole trader,
   with a monthly set-aside figure and the key Self Assessment dates (downloadable as a calendar file).
   All rates come from shared/uk.js (UK.R.selfEmployed and the income tax bands). Saved at 'tools.self-employed'. */
MP.page({ id: 'self-employed', title: 'Self-employed tax' }).then(function () {
  'use strict';
  var el = MP.el, main = MP.$('#app'), R = UK.R, SE = R.selfEmployed;
  var LOANS = ['plan1', 'plan2', 'plan4', 'plan5', 'postgrad'];
  // simplified expenses for working from home: hours a month → flat rate a month
  var HOME_RATES = [{ value: '0', label: 'Less than 25 hours a month (none)', monthly: 0 }, { value: '10', label: '25 to 50 hours a month (£10)', monthly: 10 },
    { value: '18', label: '51 to 100 hours a month (£18)', monthly: 18 }, { value: '26', label: '101 hours or more a month (£26)', monthly: 26 }];
  var MILE_LOW = 0.45, MILE_HIGH = 0.25, MILE_SPLIT = 10000;   // simplified mileage for cars and vans

  function defaults() {
    var p = MP.profile(), a = (MP.prefs().answers || {});
    var salary = +(a.salary || p.salary) || 0, emp = a.employment || p.employment;
    var d = { turnover: 35000, expenses: 5000, job: 0, pension: 0, loans: [], region: (a.region || p.region) === 'scotland' ? 'scotland' : 'ruk',
      class2: false, items: { miles: 0, travel: 0, phone: 0, home: '0', homeMonths: 12, equipment: 0, fees: 0, other: 0 }, prefilled: '' };
    if (a.selfEmp === 'side' || emp === 'both') {
      d.turnover = 8000; d.expenses = 500; d.job = salary;
      if (salary) d.prefilled = 'We put your salary of ' + MP.money(salary) + ' in as income from a job, from your answers in the guided setup.';
    } else if ((a.selfEmp === 'sole' || emp === 'self') && salary > 0) {
      d.turnover = salary; d.expenses = 0;
      d.prefilled = 'We started with your yearly income of ' + MP.money(salary) + ' as your turnover. Add your business costs to make it accurate.';
    }
    return d;
  }
  var saved = MP.get('tools.self-employed', null);
  var s = Object.assign(defaults(), saved || {});
  if (!Array.isArray(s.loans)) s.loans = [];
  s.items = Object.assign(defaults().items, s.items || {});

  /* ---------- the maths ---------- */
  function round2(n) { return Math.round(n * 100) / 100; }
  function money(v) { return MP.clamp(MP.num(v), 0, 1e9); }

  /* Income tax with the basic-rate band (and higher-rate limit) extended by gross pension contributions
     paid under relief at source. Without contributions this is exactly UK.incomeTax. */
  function incomeTax(income, region, ext) {
    if (!(ext > 0)) return UK.incomeTax(income, region);
    var pa = UK.personalAllowance(Math.max(0, income - ext));    // allowance uses adjusted net income
    var taxable = Math.max(0, income - pa), prev = 0, tax = 0, bands = [];
    var list = region === 'scotland' ? R.bandsScotland : R.bandsRUK;
    list.forEach(function (b, i) {
      var upTo = b.upTo;
      if (upTo === 125140 || (list === R.bandsRUK && b.rate === 0.40)) upTo = R.additionalRateThreshold - pa;
      if (upTo !== Infinity && (list === R.bandsRUK || i >= 1)) upTo += ext;
      var amt = Math.max(0, Math.min(taxable, upTo) - prev);
      if (amt > 0) { tax += amt * b.rate; bands.push({ name: b.name, rate: b.rate, amount: amt, tax: amt * b.rate }); }
      prev = Math.max(prev, upTo);
    });
    return { tax: round2(tax), personalAllowance: pa, bands: bands };
  }

  function itemsTotal(it) {
    var miles = money(it.miles);
    var mileage = Math.min(miles, MILE_SPLIT) * MILE_LOW + Math.max(0, miles - MILE_SPLIT) * MILE_HIGH;
    var rate = HOME_RATES.filter(function (h) { return h.value === String(it.home); })[0] || HOME_RATES[0];
    var home = rate.monthly * MP.clamp(Math.round(MP.num(it.homeMonths, 12)), 0, 12);
    var total = mileage + money(it.travel) + money(it.phone) + home + money(it.equipment) + money(it.fees) + money(it.other);
    return { mileage: round2(mileage), home: home, total: round2(total) };
  }

  function calc(st) {
    var region = st.region === 'scotland' ? 'scotland' : 'england';
    var turnover = money(st.turnover), expenses = money(st.expenses), job = money(st.job);
    // the £1,000 trading allowance or real expenses, whichever is better (the allowance cannot create a loss)
    var allowance = Math.min(SE.tradingAllowance, turnover);
    var useAllowance = allowance > expenses;
    var deduction = useAllowance ? allowance : expenses;
    var loss = Math.max(0, deduction - turnover);
    var profit = Math.max(0, turnover - deduction);

    var total = job + profit;
    var net = money(st.pension);
    var grossPension = Math.min(net / 0.8, Math.max(3600, total));   // relief only up to 100% of earnings (or £3,600)
    var topUp = round2(grossPension * 0.2);

    var t = incomeTax(total, region, grossPension);
    var paye = job > 0 ? UK.incomeTax(job, region).tax : 0;         // tax the employer already takes
    var extraTax = round2(t.tax - paye);

    var c4 = round2(Math.max(0, Math.min(profit, SE.class4Upper) - SE.class4Lower) * SE.class4Main + Math.max(0, profit - SE.class4Upper) * SE.class4UpperRate);
    var belowSPT = profit < SE.smallProfitsThreshold;
    var c2 = belowSPT && st.class2 ? round2(SE.class2Weekly * 52) : 0;

    // student loans: 9% (6% postgraduate) on combined income above the threshold, less what PAYE took from the job
    var loans = [], under = LOANS.filter(function (k) { return k !== 'postgrad' && st.loans.indexOf(k) >= 0; });
    if (under.length) {
      var low = under.slice().sort(function (a, b) { return R.studentLoan[a].threshold - R.studentLoan[b].threshold; })[0];
      loans.push({ key: 'sl', label: 'Student loan (' + under.map(function (k) { return R.studentLoan[k].label; }).join(' + ') + ')', amount: round2(Math.max(0, UK.studentLoan(total, low) - UK.studentLoan(job, low))) });
    }
    if (st.loans.indexOf('postgrad') >= 0) loans.push({ key: 'pgl', label: 'Postgraduate loan', amount: round2(Math.max(0, UK.studentLoan(total, 'postgrad') - UK.studentLoan(job, 'postgrad'))) });
    var sl = round2(loans.reduce(function (a, l) { return a + l.amount; }, 0));

    var bill = round2(extraTax + c4 + c2 + sl);
    // payments on account: due if the income tax + Class 4 through Self Assessment is over £1,000
    // and less than 80% of your total income tax and Class 4 was collected at source
    var saLiability = round2(extraTax + c4);
    var atSource = paye, all = paye + Math.max(0, saLiability);
    var sourceShare = all > 0 ? atSource / all : 0;
    var poaDue = saLiability > SE.paymentsOnAccountThreshold && sourceShare < 0.8;
    var poa = poaDue ? round2(saLiability / 2) : 0;
    var setAside = Math.max(0, bill) / 12;
    var share = turnover > 0 ? Math.max(0, bill) / turnover : 0;

    return { region: region, turnover: turnover, expenses: expenses, allowance: allowance, useAllowance: useAllowance, deduction: deduction, loss: loss, profit: profit,
      job: job, total: total, net: net, grossPension: grossPension, topUp: topUp, t: t, paye: paye, extraTax: extraTax, c4: c4, c2: c2, belowSPT: belowSPT,
      loans: loans, sl: sl, bill: bill, saLiability: saLiability, sourceShare: sourceShare, poaDue: poaDue, poa: poa, setAside: setAside, share: share };
  }

  /* ---------- key dates for the 2026/27 tax year ---------- */
  function keyDates(r) {
    var poaTxt = r.poaDue ? ' Your estimate: ' + MP.money(r.poa, true) + '.' : '';
    return [
      { date: '2027-01-31', title: '1st payment on account for 2026/27', who: 'If you already file Self Assessment', desc: 'Half of last year\'s bill, paid in advance towards 2026/27. Not due in your first year.' },
      { date: '2027-04-05', title: 'Tax year 2026/27 ends', desc: 'Total up your income and expenses for 6 April 2026 to 5 April 2027.' },
      { date: '2027-04-06', title: 'Making Tax Digital for Income Tax: £30,000 threshold', who: 'If your qualifying income is over £30,000', desc: 'Keep digital records and send quarterly updates with compatible software. Over £50,000 it already started on 6 April 2026. Check gov.uk.' },
      { date: '2027-07-31', title: '2nd payment on account for 2026/27', who: 'If you already file Self Assessment', desc: 'The other half of the advance payment towards 2026/27.' },
      { date: '2027-10-05', title: 'Register for Self Assessment', who: 'If 2026/27 is your first year', desc: 'Tell HMRC you are self-employed by this date. You will get a Unique Taxpayer Reference (UTR).' },
      { date: '2027-10-31', title: 'Paper tax return deadline (2026/27)', desc: 'Only if you file on paper. Most people file online.' },
      { date: '2028-01-31', title: 'File online and pay your 2026/27 tax', desc: 'Online return deadline. Pay the balancing payment for 2026/27' + (r.poaDue ? ' and the 1st payment on account for 2027/28.' : '.') + ' Your estimated 2026/27 bill: ' + MP.money(Math.max(0, r.bill), true) + '.' + poaTxt },
      { date: '2028-07-31', title: '2nd payment on account for 2027/28', who: r.poaDue ? null : 'If payments on account apply', desc: 'Half of your 2026/27 tax and Class 4 NI, paid in advance towards 2027/28.' + poaTxt }
    ];
  }

  function icsEscape(t) { return String(t).replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\r?\n/g, '\\n'); }
  function fold(line) {
    var out = [], cur = line;
    while (cur.length > 74) { out.push(cur.slice(0, 74)); cur = ' ' + cur.slice(74); }
    out.push(cur);
    return out.join('\r\n');
  }
  function buildIcs(r) {
    var stamp = new Date().toISOString().replace(/[-:]/g, '').replace(/\.\d+Z$/, 'Z');
    var lines = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Money Planner//Self-employed tax//EN', 'CALSCALE:GREGORIAN', 'METHOD:PUBLISH', 'X-WR-CALNAME:Self Assessment dates 2026/27'];
    keyDates(r).forEach(function (d, i) {
      var start = d.date.replace(/-/g, '');
      var end = new Date(d.date + 'T12:00:00Z'); end.setUTCDate(end.getUTCDate() + 1);
      lines.push('BEGIN:VEVENT', 'UID:se-' + start + '-' + i + '@money-planner', 'DTSTAMP:' + stamp,
        'DTSTART;VALUE=DATE:' + start, 'DTEND;VALUE=DATE:' + end.toISOString().slice(0, 10).replace(/-/g, ''),
        'SUMMARY:' + icsEscape(d.title), 'DESCRIPTION:' + icsEscape((d.who ? d.who + '. ' : '') + d.desc + ' Estimate only, check gov.uk.'),
        'TRANSP:TRANSPARENT',
        'BEGIN:VALARM', 'ACTION:DISPLAY', 'DESCRIPTION:' + icsEscape(d.title), 'TRIGGER:-P7D', 'END:VALARM', 'END:VEVENT');
    });
    lines.push('END:VCALENDAR');
    return lines.map(fold).join('\r\n') + '\r\n';
  }

  /* ---------- page ---------- */
  var results, expenseInput, helperOut;
  function render() {
    main.innerHTML = '';
    main.appendChild(el('div', { style: { margin: '6px 0 14px' } },
      el('h1', { style: { margin: 0 } }, 'Self-employed tax'),
      el('p', { class: 'muted', style: { margin: 0 } }, 'Estimate income tax, Class 4 NI and payments on account, and how much to set aside each month (tax year ' + R.taxYear + ').')));
    if (s.prefilled && !saved) main.appendChild(el('p', { class: 'callout small', id: 'prefill-note' }, s.prefilled));
    var answers = MP.prefs().answers || {};
    if (answers.selfEmp === 'landlord') {
      main.appendChild(el('p', { class: 'callout warning small', id: 'landlord-note' }, 'You told us your extra income is rent. Rental income is taxed differently (no Class 4 NI, and there is a separate £1,000 property allowance), so treat these figures as a rough guide only.'));
    }
    var split = el('div', { class: 'split' });
    split.appendChild(inputs());
    results = el('div', { class: 'stack', style: { minWidth: '0' }, id: 'results', 'aria-live': 'polite' });
    split.appendChild(el('div', { class: 'stack', style: { minWidth: '0' } }, results, datesCard(), MP.adviceCard('tax'), howTo()));
    main.appendChild(split);
    update();
  }

  function onInput(node, key) {
    node.addEventListener('input', function () { s[key] = node.value; changed(); });
    return node;
  }

  function inputs() {
    var turnover = MP.moneyInput({ id: 'turnover', value: s.turnover, step: '1' });
    onInput(turnover.input, 'turnover');
    var expenses = MP.moneyInput({ id: 'expenses', value: s.expenses, step: '1' });
    expenseInput = expenses.input;
    onInput(expenses.input, 'expenses');
    var job = MP.moneyInput({ id: 'job', value: s.job || '', step: '1', placeholder: '0' });
    onInput(job.input, 'job');

    var region = MP.seg([{ value: 'ruk', label: 'England, Wales or NI' }, { value: 'scotland', label: 'Scotland' }], s.region, function (v) { s.region = v; changed(); }, 'Where you live');
    region.id = 'region';
    var pension = MP.moneyInput({ id: 'pension', value: s.pension || '', step: '1', placeholder: '0' });
    onInput(pension.input, 'pension');
    var loans = el('fieldset', { class: 'se-box', id: 'loans' }, el('legend', null, 'Student loans'),
      LOANS.map(function (k) {
        var cb = el('input', { type: 'checkbox', id: 'loan-' + k, value: k, checked: s.loans.indexOf(k) >= 0 });
        cb.addEventListener('change', function () { s.loans = LOANS.filter(function (x) { return MP.$('#loan-' + x).checked; }); changed(); });
        return el('label', { class: 'check' }, cb, R.studentLoan[k].label);
      }),
      el('span', { class: 'hint' }, 'Self Assessment collects repayments on your total income. Anything your employer already took is taken off.'));
    var class2 = el('input', { type: 'checkbox', id: 'class2', checked: !!s.class2 });
    class2.addEventListener('change', function () { s.class2 = class2.checked; changed(); });

    return el('section', { class: 'card', 'aria-labelledby': 'h-in' },
      el('h2', { id: 'h-in' }, 'Your business'),
      MP.field('Turnover this tax year', turnover.wrap, 'Everything your customers paid you before costs, 6 April to 5 April.'),
      MP.field('Allowable expenses', expenses.wrap, 'Business costs such as materials, travel, phone, software and insurance.'),
      MP.explain(null, 'You can take either your real business costs or a £1,000 tax-free "trading allowance" off your turnover. We pick whichever saves you more.'),
      el('p', { class: 'small', id: 'allowance-note', 'aria-live': 'polite' }),
      expenseHelper(),
      MP.field('Salary from a job (before tax)', job.wrap, 'Leave at 0 if you only work for yourself. Your employer takes tax on this through PAYE.'),
      el('div', { class: 'detail-only' },
        el('h3', null, 'More about you'),
        el('div', { class: 'field' }, el('span', { class: 'label' }, 'Where you live'), region,
          el('span', { class: 'hint' }, 'Scotland has its own income tax rates. Class 4 NI is the same everywhere.')),
        MP.field('Personal pension you pay in a year', pension.wrap, 'What leaves your bank account. Your provider adds 25% tax relief, and your basic-rate band grows by the total, so higher-rate tax falls.'),
        loans,
        el('label', { class: 'check', id: 'class2-wrap' }, class2, 'Pay voluntary Class 2 NI (' + MP.money(SE.class2Weekly, true) + ' a week) to protect my State Pension'),
        el('p', { class: 'hint small muted', id: 'class2-note' })),
      el('p', { class: 'small muted simple-only', id: 'extras-note' }),
      el('hr'),
      el('div', { class: 'row' },
        el('button', { class: 'btn btn-ghost', type: 'button', id: 'reset', onclick: function () {
          if (!MP.confirm('Clear your answers and start again?')) return;
          s = defaults(); s.prefilled = ''; save(); render(); MP.toast('Reset.');
        } }, 'Reset')));
  }

  function expenseHelper() {
    var it = s.items;
    function num(id, key, label, hint, step) {
      var inp = key === 'miles' || key === 'homeMonths' ? el('input', { type: 'number', id: id, min: '0', step: step || '1', inputmode: 'numeric', value: it[key] || '', placeholder: '0' })
        : MP.moneyInput({ id: id, value: it[key] || '', step: '1', placeholder: '0' });
      var input = inp.input || inp;
      input.addEventListener('input', function () { s.items[key] = input.value; helperUpdate(); save(); });
      return MP.field(label, inp.wrap || inp, hint);
    }
    var home = el('select', { id: 'x-home' }, HOME_RATES.map(function (h) { return el('option', { value: h.value, selected: String(it.home) === h.value }, h.label); }));
    home.addEventListener('change', function () { s.items.home = home.value; helperUpdate(); save(); });
    helperOut = el('p', { class: 'se-helper-total', id: 'x-total', 'aria-live': 'polite' });
    return el('details', { class: 'se-more detail-only', id: 'expense-helper' },
      el('summary', null, 'Help me add up my expenses'),
      el('div', { class: 'se-more-body' },
        el('div', { class: 'grid-2 se-tight' },
          num('x-miles', 'miles', 'Business miles in your own car', '45p a mile for the first 10,000, then 25p.'),
          num('x-travel', 'travel', 'Other travel', 'Trains, buses, parking, hotels for work.'),
          num('x-phone', 'phone', 'Phone and internet', 'The business share only.'),
          num('x-equipment', 'equipment', 'Equipment', 'Laptop, tools, machinery.'),
          num('x-fees', 'fees', 'Professional fees and insurance', 'Accountant, memberships, cover.'),
          num('x-other', 'other', 'Stock, materials and other costs', 'Including software, advertising, bank charges.')),
        el('div', { class: 'grid-2 se-tight' },
          MP.field('Working from home (flat rate)', home, 'HMRC simplified expenses, instead of working out a share of bills.'),
          num('x-months', 'homeMonths', 'Months you work from home', '0 to 12.')),
        helperOut,
        el('button', { class: 'btn btn-accent btn-sm', type: 'button', id: 'x-use', onclick: function () {
          var tot = itemsTotal(s.items).total;
          s.expenses = tot; expenseInput.value = tot; changed(); MP.toast('Expenses set to ' + MP.money(tot, true) + '.');
        } }, 'Use this total as my expenses')));
  }
  function helperUpdate() {
    if (!helperOut) return;
    var t = itemsTotal(s.items);
    helperOut.textContent = 'Total: ' + MP.money(t.total, true) + (t.mileage ? ' (mileage ' + MP.money(t.mileage, true) + ')' : '') + (t.home ? ' (home ' + MP.money(t.home) + ')' : '');
  }

  var logged = false, logTimer;
  function changed() {
    update();
    if (logged) return;
    clearTimeout(logTimer);
    logTimer = setTimeout(function () { logged = true; MP.log('Updated self-employed tax: ' + summaryText(calc(s))); }, 1500);
  }
  function summaryText(r) {
    return r.bill > 0 ? 'Set aside ' + MP.money(r.setAside) + '/month (tax bill ' + MP.money(r.bill) + ')' : 'No tax to pay on ' + MP.money(r.profit) + ' profit';
  }

  function trow(id, label, value, opts) {
    opts = opts || {};
    return el('tr', { class: [opts.cls, opts.detail ? 'detail-only' : ''].filter(Boolean).join(' ') || null },
      el('th', { scope: 'row' }, label), el('td', { class: 'num', id: id ? 'r-' + id : null }, opts.text != null ? opts.text : MP.money(value, true)));
  }

  function update() {
    save();
    var r = calc(s);
    helperUpdate();

    var note = MP.$('#allowance-note');
    note.textContent = r.turnover <= SE.tradingAllowance && r.turnover > 0
      ? 'Your turnover is ' + MP.money(r.turnover) + ', within the £1,000 trading allowance, so there is no tax on it and you do not need to register for Self Assessment for this income.'
      : r.useAllowance ? 'Using the £1,000 trading allowance: it is more than your expenses of ' + MP.money(r.expenses) + ', so it saves you more tax.'
        : r.turnover > 0 ? 'Using your expenses of ' + MP.money(r.expenses) + ': more than the £1,000 trading allowance.' : '';
    note.className = 'small ' + (r.useAllowance ? 'se-good' : 'muted');

    var c2note = MP.$('#class2-note');
    c2note.textContent = r.belowSPT ? 'Your profit is under ' + MP.money(SE.smallProfitsThreshold) + ', so you do not get National Insurance credits automatically. Paying ' + MP.money(SE.class2Weekly * 52, true) + ' a year keeps a qualifying year for your State Pension.'
      : 'Your profit is over ' + MP.money(SE.smallProfitsThreshold) + ', so you get National Insurance credits for your State Pension automatically. Class 2 is not needed.';
    MP.$('#class2-wrap').hidden = !r.belowSPT;

    var extras = [];
    if (r.grossPension) extras.push('pension');
    if (r.loans.length) extras.push('student loan');
    if (r.region === 'scotland') extras.push('Scottish tax rates');
    if (r.c2) extras.push('voluntary Class 2');
    MP.$('#extras-note').textContent = extras.length ? 'Also included from your detailed choices: ' + extras.join(', ') + '. Switch to Detailed to change them.' : 'Pension, student loan, Scottish rates and Class 2: switch to Detailed.';

    results.innerHTML = '';
    var refund = r.bill < 0;
    results.appendChild(el('section', { class: 'card', 'aria-labelledby': 'h-sum' },
      el('h2', { id: 'h-sum' }, 'Your tax bill'),
      el('div', { class: 'se-stats' },
        el('div', { class: 'stat' }, el('span', { class: 'label' }, 'Set aside each month'), el('span', { class: 'value big', id: 'set-aside' }, MP.money(r.setAside))),
        el('div', { class: 'stat' }, el('span', { class: 'label' }, refund ? 'HMRC may owe you' : 'Tax bill for ' + R.taxYear), el('span', { class: 'value', id: 'bill' }, MP.money(Math.abs(r.bill)))),
        el('div', { class: 'stat' }, el('span', { class: 'label' }, 'Of each invoice'), el('span', { class: 'value', id: 'invoice-pct' }, MP.pct(r.share, 0)))),
      el('p', { class: 'small', style: { margin: '12px 0 0' } },
        r.turnover > 0 && r.bill > 0 ? 'Move ' + MP.pct(r.share, 0) + ' of every payment you receive into a separate savings account, and the money will be there when HMRC asks for it.'
          : refund ? 'Your pension tax relief is worth more than the extra tax on your profit, so you may get money back when you file.' : 'On these figures there is nothing extra to pay.',
        ' You report it and pay through ', MP.term('self-assessment'), ' by 31 January 2028.'),
      MP.explain(null, 'Your employer takes tax from wages automatically. When you work for yourself nobody does that, so you pay it in one go after the tax year ends. Saving a little every month stops it becoming a shock.')));

    if (r.loss > 0) {
      results.appendChild(el('p', { class: 'callout warning', id: 'loss-note' }, 'Your expenses are ' + MP.money(r.loss) + ' more than your turnover: a loss. You may be able to set it against other income or carry it forward to future profits. An accountant can help.'));
    }

    // breakdown table (summary rows for everyone, the full workings in Detailed)
    var tb = el('tbody');
    tb.appendChild(trow('turnover', 'Turnover', r.turnover, { detail: true }));
    tb.appendChild(trow('deduction', r.useAllowance ? 'Less trading allowance' : 'Less allowable expenses', -r.deduction, { detail: true, cls: 'sub' }));
    tb.appendChild(trow('taxable-profit', 'Taxable profit', r.profit, { cls: 'strong' }));
    if (r.job) tb.appendChild(trow('job', 'Salary from your job', r.job, { detail: true }));
    if (r.job) tb.appendChild(trow('income', 'Total income', r.total, { detail: true }));
    tb.appendChild(trow('pa', 'Personal Allowance (tax-free)', r.t.personalAllowance, { detail: true, cls: 'sub' }));
    if (r.grossPension) tb.appendChild(trow('pension-ext', 'Basic-rate band made bigger by your pension', r.grossPension, { detail: true, cls: 'sub' }));
    r.t.bands.forEach(function (b) { tb.appendChild(trow(null, b.name + ' ' + MP.pct(b.rate, 0) + ' on ' + MP.money(b.amount), b.tax, { detail: true, cls: 'sub' })); });
    if (r.job) tb.appendChild(trow('all-tax', 'Income tax on all your income', r.t.tax, { detail: true, cls: 'sub' }));
    if (r.job) tb.appendChild(trow('paye', 'Less tax your employer takes (PAYE)', -r.paye, { detail: true, cls: 'sub' }));
    tb.appendChild(trow('tax', r.job ? (r.extraTax < 0 ? 'Income tax back' : 'Extra income tax to pay') : 'Income tax', r.extraTax, { cls: 'ded' }));
    tb.appendChild(trow('class4', 'Class 4 National Insurance', r.c4, { cls: 'ded' }));
    if (r.c2) tb.appendChild(trow('class2', 'Class 2 National Insurance (voluntary)', r.c2, { cls: 'ded' }));
    r.loans.forEach(function (l) { tb.appendChild(trow(l.key, l.label, l.amount, { cls: 'ded' })); });
    tb.appendChild(trow('total', 'Total to pay', r.bill, { cls: 'total' }));
    tb.appendChild(trow('poa', 'Each payment on account', r.poa, { text: r.poaDue ? MP.money(r.poa, true) : 'Not needed' }));
    tb.appendChild(trow('month', 'Set aside a month', r.setAside));

    results.appendChild(el('section', { class: 'card', 'aria-labelledby': 'h-table' },
      el('h2', { id: 'h-table' }, 'How it adds up'),
      el('div', { class: 'scroll-x' }, el('table', { class: 'table se-table', id: 'se-table' },
        el('thead', null, el('tr', null, el('th', { scope: 'col' }, 'Item'), el('th', { class: 'num', scope: 'col' }, 'Per year'))), tb)),
      el('p', { class: 'small muted', style: { margin: '10px 0 0' } },
        el('span', null, MP.term('national-insurance', 'Class 4 National Insurance'), ' is ' + MP.pct(SE.class4Main, 0) + ' of profit between ' + MP.money(SE.class4Lower) + ' and ' + MP.money(SE.class4Upper) + ', and ' + MP.pct(SE.class4UpperRate, 0) + ' above. '),
        'Assumes ' + R.taxYear + ' rates' + (r.region === 'scotland' ? ' (Scottish income tax)' : '') + ', no savings, dividend or rental income, and that your job uses the standard tax code.')));

    // payments on account
    var poaBox = el('section', { class: 'card', 'aria-labelledby': 'h-poa', id: 'poa-card' },
      el('h2', { id: 'h-poa' }, MP.term('payments-on-account')));
    if (r.poaDue) {
      poaBox.appendChild(el('div', { class: 'se-poa' },
        el('div', { class: 'stat' }, el('span', { class: 'label' }, '31 January 2028'), el('span', { class: 'value', id: 'poa-jan' }, MP.money(r.bill + r.poa, true)),
          el('span', { class: 'small muted' }, 'Balancing payment ' + MP.money(r.bill, true) + ' + 1st payment on account ' + MP.money(r.poa, true))),
        el('div', { class: 'stat' }, el('span', { class: 'label' }, '31 July 2028'), el('span', { class: 'value', id: 'poa-jul' }, MP.money(r.poa, true)),
          el('span', { class: 'small muted' }, '2nd payment on account'))));
      poaBox.appendChild(el('p', { class: 'small', style: { marginTop: '12px' } }, 'Your bill is over ' + MP.money(SE.paymentsOnAccountThreshold) + ' and most of it is not taken at source, so HMRC asks for advance payments towards next year: each is half of this year\'s income tax and Class 4 NI (' + MP.money(r.saLiability, true) + '). Student loan and Class 2 are not included.'));
      poaBox.appendChild(el('p', { class: 'callout warning small', id: 'first-year' }, el('strong', null, 'First year? '),
        'On 31 January you pay your whole first bill plus the 1st payment on account for the next year: about 150% (' + MP.money(r.bill + r.poa) + '). Setting aside ' + MP.money((r.bill + r.poa) / 12) + ' a month in year one covers it. After that, if your profit stays the same, the advance payments mean you pay about the same each year.'));
    } else {
      poaBox.appendChild(el('p', { class: 'small', id: 'poa-none' }, r.saLiability <= SE.paymentsOnAccountThreshold
        ? 'Not needed: your income tax and Class 4 NI through Self Assessment is ' + MP.money(Math.max(0, r.saLiability), true) + ', which is ' + MP.money(SE.paymentsOnAccountThreshold) + ' or less. You pay it all by 31 January 2028.'
        : 'Not needed: more than 80% of your tax is already taken from your wages through PAYE. You pay the rest by 31 January 2028.'));
    }
    poaBox.appendChild(MP.explain(null, 'Payments on account are not extra tax. They are next year\'s bill paid early, in two halves. If your profit falls you can ask HMRC to reduce them.'));
    results.appendChild(poaBox);

    // donut
    var kept = Math.max(0, r.profit - Math.max(0, r.extraTax) - r.c4 - r.c2 - r.sl);
    results.appendChild(el('section', { class: 'card', 'aria-labelledby': 'h-donut' },
      el('h2', { id: 'h-donut' }, 'Where your profit goes'),
      r.profit > 0 ? MP.donut({ items: [{ label: 'You keep', value: kept, color: '--c2' }, { label: 'Income tax', value: Math.max(0, r.extraTax), color: '--c1' },
        { label: 'National Insurance', value: r.c4 + r.c2, color: '--c3' }, { label: 'Student loan', value: r.sl, color: '--c4' }],
        center: MP.pct(kept / r.profit, 0) + ' kept', label: 'Where your yearly profit goes' }) : el('p', { class: 'muted' }, 'No taxable profit, so nothing to show yet.'),
      el('p', { class: 'small muted', style: { margin: '10px 0 0' } }, 'Sole trader or limited company? The answer depends on your profits, plans and personal situation, so it needs personal advice from an accountant.')));

    updateDates(r);
    MP.summary('self-employed', summaryText(r));
  }

  /* ---------- key dates card ---------- */
  var datesList, mtdNote;
  function datesCard() {
    datesList = el('ol', { class: 'se-dates', id: 'dates' });
    mtdNote = el('p', { class: 'callout small', id: 'mtd-note' });
    return el('section', { class: 'card', 'aria-labelledby': 'h-dates' },
      el('h2', { id: 'h-dates' }, 'Key dates for ' + R.taxYear),
      datesList, mtdNote,
      el('div', { class: 'row' },
        el('button', { class: 'btn btn-primary', type: 'button', id: 'ics', onclick: function () {
          MP.download('self-assessment-dates-2026-27.ics', buildIcs(calc(s)), 'text/calendar');
          MP.toast('Calendar file downloaded. Open it to add the dates to your calendar.');
        } }, 'Add dates to my calendar (.ics)')));
  }
  function updateDates(r) {
    if (!datesList) return;
    var today = MP.isoDate(new Date());
    datesList.innerHTML = '';
    keyDates(r).forEach(function (d) {
      var past = d.date < today;
      datesList.appendChild(el('li', { class: past ? 'past' : null },
        el('span', { class: 'when' }, MP.fmtDate(d.date + 'T12:00:00')),
        el('span', { class: 'what' }, el('strong', null, d.title), past ? el('span', { class: 'chip' }, 'Passed') : null,
          el('span', { class: 'small muted' }, (d.who ? d.who + '. ' : '') + d.desc))));
    });
    var q = r.turnover;
    mtdNote.textContent = (q > SE.mtdThresholdApr2026 ? 'Your turnover of ' + MP.money(q) + ' is over ' + MP.money(SE.mtdThresholdApr2026) + ', so Making Tax Digital for Income Tax likely applies to you from April 2026: digital records and quarterly updates.'
      : q > SE.mtdThresholdApr2027 ? 'Your turnover of ' + MP.money(q) + ' is over ' + MP.money(SE.mtdThresholdApr2027) + ', so Making Tax Digital for Income Tax likely applies to you from April 2027: digital records and quarterly updates.'
        : 'Making Tax Digital for Income Tax starts in April 2026 for qualifying income over ' + MP.money(SE.mtdThresholdApr2026) + ' and April 2027 over ' + MP.money(SE.mtdThresholdApr2027) + '. At ' + MP.money(q) + ' it does not apply to you yet.') +
      ' Qualifying income is your self-employed and property turnover before costs, taken from an earlier tax return. Check gov.uk.';
  }

  function howTo() {
    return el('details', { class: 'card' }, el('summary', null, 'How to use this, and tips'),
      el('ul', { class: 'small' },
        el('li', null, 'Enter what you expect to earn this tax year and your costs. Update it every few months as the year goes on, and the set-aside figure keeps up.'),
        el('li', null, 'Keep records of every sale and cost (photos of receipts are fine) for at least 5 years after the 31 January deadline. A spreadsheet or bookkeeping app makes the return quick.'),
        el('li', null, 'Open a separate bank account for the business and another savings pot for tax. Move the "of each invoice" percentage across every time you are paid.'),
        el('li', null, 'Allowable expenses are costs "wholly and exclusively" for the business: stock, travel to clients (not your usual commute), the business share of your phone, insurance, accountant fees. Clothes, lunches and fines are not allowed.'),
        el('li', null, 'Use the free HMRC app or your online account to see your Unique Taxpayer Reference, what you owe and to pay. You can also pay towards your bill early with a budget payment plan.'),
        el('li', null, 'Budget for payments on account. They catch most people out in their second year, when the January bill can be one and a half times what they expected.')),
      el('p', { class: 'small muted' }, 'This is guidance, not tax advice. It does not cover partnerships, the cash basis versus accruals choice, capital allowance limits, VAT (register if your turnover goes over £90,000) or other income such as savings and dividends.'));
  }

  function save() { MP.set('tools.self-employed', s); }

  MP.onTheme(function () { if (results) update(); });
  MP.onPrefs(function () { if (results) update(); });
  render();
});
