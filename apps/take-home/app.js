/* Take-home pay: income tax, National Insurance, student loan and pension from a salary.
   All figures come from shared/uk.js (tax year in UK.R.taxYear). Inputs are saved at 'tools.take-home'. */
MP.page({ id: 'take-home', title: 'Take-home pay' }).then(function () {
  'use strict';
  var el = MP.el, main = MP.$('#app'), R = UK.R;
  var AE = R.pension.autoEnrolment;
  var BLIND = 3250;              // blind person's allowance (approximate for 2026/27)
  var MARRIAGE = 1260;           // marriage allowance transfer: 20% of this comes off the receiver's tax
  var TOP_BAND_START = R.additionalRateThreshold; // taxable income where the top rate starts

  var PERIODS = [{ value: 'year', label: 'Year' }, { value: 'month', label: 'Month' }, { value: 'week', label: 'Week' }, { value: 'hour', label: 'Hour' }];
  var METHODS = {
    ras: 'Relief at source (taken after tax)',
    net: 'Net pay (taken before tax)',
    sacrifice: 'Salary sacrifice (before tax and NI)'
  };
  var LOANS = ['plan1', 'plan2', 'plan4', 'plan5', 'postgrad'];

  function defaults() {
    var p = MP.profile();
    return {
      pay: +p.salary > 0 ? +p.salary : 35000, period: 'year', hours: 37.5,
      region: p.region === 'scotland' ? 'scotland' : 'ruk',
      pensionPct: 5, pensionMethod: 'ras', pensionBasis: 'qualifying',
      loans: [], bonus: 0, bik: 0, taxCode: '', blind: false, marriage: false, rise: ''
    };
  }
  var s = Object.assign(defaults(), MP.get('tools.take-home', {}));
  if (!Array.isArray(s.loans)) s.loans = [];

  /* ---------- the maths ---------- */
  function annualSalary(st) {
    var pay = MP.clamp(MP.num(st.pay), 0, 1e8);
    if (st.period === 'month') return pay * 12;
    if (st.period === 'week') return pay * 52;
    if (st.period === 'hour') return pay * MP.clamp(MP.num(st.hours, 37.5), 0, 100) * 52;
    return pay;
  }

  /* Tax on income with a given allowance (may be negative for K codes). Band limits are on taxable income. */
  function bandTax(income, allowance, region) {
    var taxable = Math.max(0, income - allowance), prev = 0, tax = 0, bands = [];
    var list = region === 'scotland' ? R.bandsScotland : R.bandsRUK;
    list.forEach(function (b, i) {
      var upTo = i === list.length - 2 ? TOP_BAND_START : b.upTo;
      var amt = Math.max(0, Math.min(taxable, upTo) - prev);
      if (amt > 0) { tax += amt * b.rate; bands.push({ name: b.name, rate: b.rate, amount: amt, tax: amt * b.rate }); }
      prev = Math.max(prev, upTo);
    });
    return { tax: Math.round(tax * 100) / 100, personalAllowance: allowance, bands: bands };
  }

  /* Standard allowances (taper applied), plus blind person's allowance if ticked. */
  function standardTax(income, st, region) {
    if (!st.blind) return UK.incomeTax(income, region);
    return bandTax(income, UK.personalAllowance(income) + BLIND, region);
  }

  /* Basic tax code support: 1257L style, K codes, BR, D0-D3, NT, 0T, with S (Scotland) or C (Wales) prefix. */
  function parseCode(raw) {
    var c = String(raw || '').toUpperCase().replace(/\s+/g, '').replace(/(W1|M1|X)$/, '');
    if (!c) return null;
    var scot = false;
    if (/^[SC]/.test(c) && !/^[SC]$/.test(c)) { scot = c[0] === 'S'; c = c.slice(1); }
    var m;
    if (c === 'NT') return { kind: 'flat', rate: 0, label: 'NT: no tax taken' };
    if (c === 'BR') return { kind: 'flat', rate: 0.20, label: 'BR: all pay taxed at 20%' };
    if ((m = /^D([0-3])$/.exec(c))) {
      var rates = scot ? [0.21, 0.42, 0.45, 0.48] : [0.40, 0.45];
      var r = rates[+m[1]];
      if (r == null) return { kind: 'bad' };
      return { kind: 'flat', rate: r, label: c + ': all pay taxed at ' + MP.pct(r, 0) };
    }
    if (c === '0T') return { kind: 'allow', allowance: 0, label: '0T: no tax-free allowance' };
    if ((m = /^K(\d{1,5})$/.exec(c))) return { kind: 'allow', allowance: -(+m[1] * 10), k: true, label: 'K code: ' + MP.money(+m[1] * 10) + ' added to taxable pay' };
    if ((m = /^(\d{1,5})[LMNT]$/.exec(c))) return { kind: 'allow', allowance: +m[1] * 10 + 9, label: 'Tax-free allowance ' + MP.money(+m[1] * 10 + 9) };
    return { kind: 'bad' };
  }

  function calc(st, salaryOverride) {
    var region = st.region === 'scotland' ? 'scotland' : 'england';
    var salary = salaryOverride != null ? salaryOverride : annualSalary(st);
    var bonus = MP.clamp(MP.num(st.bonus), 0, 1e8), bik = MP.clamp(MP.num(st.bik), 0, 1e7);
    var gross = salary + bonus;
    var pct = MP.clamp(MP.num(st.pensionPct), 0, 100) / 100;
    var base = st.pensionBasis === 'qualifying' ? Math.max(0, Math.min(gross, AE.upperQE) - AE.lowerQE) : gross;
    var C = Math.min(gross, base * pct);                       // gross contribution
    var method = METHODS[st.pensionMethod] ? st.pensionMethod : 'ras';
    var niable = method === 'sacrifice' ? gross - C : gross;
    var taxable = (method === 'ras' ? gross : gross - C) + bik;
    var ani = method === 'ras' ? taxable - C : taxable;        // adjusted net income

    var code = parseCode(st.taxCode), t, codeUsed = code && code.kind !== 'bad';
    if (codeUsed && code.kind === 'flat') {
      t = { tax: Math.round(taxable * code.rate * 100) / 100, personalAllowance: 0, bands: code.rate ? [{ name: 'Flat rate', rate: code.rate, amount: taxable, tax: taxable * code.rate }] : [] };
    } else if (codeUsed) {
      t = bandTax(taxable, code.allowance, region);
      if (code.k && t.tax > gross * 0.5) t.tax = Math.round(gross * 50) / 100;   // K code tax is capped at half of pay
    } else {
      t = standardTax(taxable, st, region);
    }
    var tax = t.tax, marriage = 0, marriageOk = false;
    if (!codeUsed && st.marriage) {
      var top = t.bands.length ? t.bands[t.bands.length - 1].rate : 0;
      marriageOk = top > 0 && top <= (region === 'scotland' ? 0.21 : 0.20);
      if (marriageOk) { marriage = Math.min(tax, MARRIAGE * 0.20); tax = Math.round((tax - marriage) * 100) / 100; }
    }

    var ni = UK.nationalInsurance(niable);
    var loans = [], under = LOANS.filter(function (k) { return k !== 'postgrad' && st.loans.indexOf(k) >= 0; });
    if (under.length) {
      // with more than one undergraduate plan you repay 9% above the lowest threshold
      var low = under.slice().sort(function (a, b) { return R.studentLoan[a].threshold - R.studentLoan[b].threshold; })[0];
      loans.push({ label: 'Student loan (' + under.map(function (k) { return R.studentLoan[k].label; }).join(' + ') + ')', amount: UK.studentLoan(niable, low) });
    }
    if (st.loans.indexOf('postgrad') >= 0) loans.push({ label: 'Postgraduate loan', amount: UK.studentLoan(niable, 'postgrad') });
    var sl = loans.reduce(function (a, l) { return a + l.amount; }, 0);

    var fromPay = method === 'ras' ? C * 0.8 : C;
    var topUp = method === 'ras' ? C * 0.2 : 0;
    var extraClaim = 0;
    if (method === 'ras' && C > 0) extraClaim = Math.max(0, standardTax(taxable, st, region).tax - standardTax(taxable - C, st, region).tax - C * 0.2);
    var takeHome = gross - tax - ni - sl - fromPay;
    return { region: region, salary: salary, bonus: bonus, bik: bik, gross: gross, C: C, method: method, niable: niable, taxable: taxable, ani: ani,
      tax: tax, bands: t.bands, allowance: t.personalAllowance, code: code, codeUsed: codeUsed, marriage: marriage, marriageOk: marriageOk,
      ni: ni, loans: loans, sl: sl, fromPay: fromPay, topUp: topUp, extraClaim: extraClaim, takeHome: takeHome };
  }

  /* ---------- page ---------- */
  var results;
  function render() {
    main.innerHTML = '';
    main.appendChild(el('div', { style: { margin: '6px 0 14px' } },
      el('h1', { style: { margin: 0 } }, 'Take-home pay'),
      el('p', { class: 'muted', style: { margin: 0 } }, 'Work out income tax, National Insurance, student loan and pension from your salary (tax year ' + R.taxYear + ').')));
    var split = el('div', { class: 'split' });
    split.appendChild(inputs());
    results = el('div', { class: 'stack', style: { minWidth: '0' }, id: 'results', 'aria-live': 'polite' });
    var right = el('div', { class: 'stack', style: { minWidth: '0' } }, results, whatIf(), howTo());
    split.appendChild(right);
    main.appendChild(split);
    update();
  }

  function onInput(node, key, fn) {
    node.addEventListener('input', function () { s[key] = fn ? fn(node) : node.value; update(); });
    return node;
  }

  function inputs() {
    var pay = MP.moneyInput({ id: 'pay', value: s.pay, step: '0.01' });
    onInput(pay.input, 'pay');
    var hours = el('input', { type: 'number', id: 'hours', min: '1', max: '100', step: '0.5', inputmode: 'decimal', value: s.hours });
    onInput(hours, 'hours');
    var hoursField = MP.field('Hours a week', hours);
    function ex(key, id) { var e = MP.explain(key); if (e) e.id = id; return e; }
    hoursField.hidden = s.period !== 'hour';
    var period = MP.seg(PERIODS, s.period, function (v) { s.period = v; hoursField.hidden = v !== 'hour'; update(); }, 'Pay period');
    period.id = 'period';
    var region = MP.seg([{ value: 'ruk', label: 'England, Wales or NI' }, { value: 'scotland', label: 'Scotland' }], s.region, function (v) { s.region = v; update(); }, 'Where you live');
    region.id = 'region';

    var pct = el('input', { type: 'number', id: 'pension-pct', min: '0', max: '100', step: '0.5', inputmode: 'decimal', value: s.pensionPct });
    onInput(pct, 'pensionPct');
    var method = el('select', { id: 'pension-method' }, Object.keys(METHODS).map(function (k) { return el('option', { value: k, selected: s.pensionMethod === k }, METHODS[k]); }));
    onInput(method, 'pensionMethod');
    method.addEventListener('change', function () { s.pensionMethod = method.value; update(); });
    var basis = el('select', { id: 'pension-basis' },
      el('option', { value: 'full', selected: s.pensionBasis === 'full' }, 'All of my pay'),
      el('option', { value: 'qualifying', selected: s.pensionBasis === 'qualifying' }, 'Qualifying earnings'));
    onInput(basis, 'pensionBasis');
    basis.addEventListener('change', function () { s.pensionBasis = basis.value; update(); });

    var loans = el('fieldset', { class: 'loans', id: 'loans' }, el('legend', null, 'Student loans'),
      LOANS.map(function (k) {
        var cb = el('input', { type: 'checkbox', id: 'loan-' + k, value: k, checked: s.loans.indexOf(k) >= 0 });
        cb.addEventListener('change', function () {
          s.loans = LOANS.filter(function (x) { return MP.$('#loan-' + x).checked; }); update();
        });
        return el('label', { class: 'check' }, cb, R.studentLoan[k].label);
      }),
      el('span', { class: 'hint' }, 'Plan 4 is for Scottish student loans. Not sure? Check your payslip or the Student Loans Company.'));

    var bonus = MP.moneyInput({ id: 'bonus', value: s.bonus || '' });
    onInput(bonus.input, 'bonus');
    var bik = MP.moneyInput({ id: 'bik', value: s.bik || '' });
    onInput(bik.input, 'bik');
    var code = el('input', { type: 'text', id: 'tax-code', value: s.taxCode, placeholder: '1257L', maxlength: 12, autocomplete: 'off', spellcheck: 'false' });
    onInput(code, 'taxCode');
    var blind = el('input', { type: 'checkbox', id: 'blind', checked: s.blind });
    blind.addEventListener('change', function () { s.blind = blind.checked; update(); });
    var marriage = el('input', { type: 'checkbox', id: 'marriage', checked: s.marriage });
    marriage.addEventListener('change', function () { s.marriage = marriage.checked; update(); });

    return el('section', { class: 'card', 'aria-labelledby': 'h-pay' },
      el('h2', { id: 'h-pay' }, 'Your pay'),
      MP.field('Pay before tax', pay.wrap),
      ex('personal-allowance', 'ex-allowance'),
      el('div', { class: 'field' }, el('span', { class: 'label' }, 'Paid per'), period),
      hoursField,
      el('div', { class: 'field' }, el('span', { class: 'label' }, 'Where you live'), region,
        el('span', { class: 'hint' }, 'Scotland has its own income tax rates. ', MP.term('national-insurance'), ' is the same everywhere.')),
      ex('national-insurance', 'ex-ni'),
      el('h3', null, MP.term('workplace-pension')),
      el('div', { class: 'grid-2 th-tight' },
        MP.field('You pay in (%)', pct),
        detailOnly(MP.field('Percentage of', basis))),
      el('p', { class: 'small muted simple-only', id: 'pension-assume', style: { margin: '-4px 0 12px' } }, 'We assume the usual workplace set-up: relief at source, on qualifying earnings (your pay between ' + MP.money(AE.lowerQE) + ' and ' + MP.money(AE.upperQE) + '). Switch to Detailed to change this.'),
      el('p', { class: 'small muted detail-only', style: { margin: '-4px 0 12px' } }, 'Qualifying earnings are your pay between ' + MP.money(AE.lowerQE) + ' and ' + MP.money(AE.upperQE) + ', the usual auto-enrolment basis.'),
      detailOnly(MP.field('How it is taken', method, 'Your payslip or pension provider can tell you. Many auto-enrolment schemes use relief at source.')),
      detailOnly(ex('salary-sacrifice', 'ex-sacrifice')),
      loans,
      el('details', { class: 'more detail-only', id: 'more-options', open: !!(s.bonus || s.bik || s.taxCode || s.blind || s.marriage) },
        el('summary', null, 'Bonus, benefits and tax code'),
        el('div', { class: 'more-body' },
          MP.field('One-off bonus this year', bonus.wrap),
          MP.field('Taxable benefits a year', bik.wrap, 'For example the benefit-in-kind value of a company car (on your P11D or payslip). Taxed but no NI for you.'),
          MP.field(el('span', null, MP.term('tax-code'), ' (optional)'), code, 'From your payslip or the HMRC app. Leave blank to use the standard allowance.'),
          ex('tax-code', 'ex-tax-code'),
          el('p', { class: 'small', id: 'code-note', 'aria-live': 'polite' }),
          el('label', { class: 'check' }, blind, 'Blind person\'s allowance (about ' + MP.money(BLIND) + ' more tax-free)'),
          el('label', { class: 'check' }, marriage, 'My partner gives me their marriage allowance'))),
      el('hr'),
      el('div', { class: 'row' },
        el('button', { class: 'btn btn-primary', type: 'button', id: 'save-profile', onclick: saveProfile }, 'Save salary to my profile'),
        el('button', { class: 'btn btn-ghost', type: 'button', id: 'reset', onclick: function () {
          if (!MP.confirm('Clear your answers and start again?')) return;
          s = defaults(); save(); render(); MP.toast('Reset.');
        } }, 'Reset')));
  }

  function detailOnly(node) { if (node) node.classList.add('detail-only'); return node; }

  /* Options only shown in Detailed view that are not at their usual values. They still count in Simple view,
     so Simple says so rather than silently changing the answer. */
  function hiddenChoices() {
    var d = defaults(), out = [];
    if (MP.num(s.bonus) > 0) out.push('a bonus of ' + MP.money(MP.num(s.bonus)));
    if (MP.num(s.bik) > 0) out.push('taxable benefits of ' + MP.money(MP.num(s.bik)));
    if (String(s.taxCode || '').trim()) out.push('tax code ' + String(s.taxCode).trim().toUpperCase());
    if (s.blind) out.push('blind person\'s allowance');
    if (s.marriage) out.push('marriage allowance');
    if (s.pensionMethod !== d.pensionMethod && METHODS[s.pensionMethod]) out.push('pension taken by ' + METHODS[s.pensionMethod].split(' (')[0].toLowerCase());
    if (s.pensionBasis !== d.pensionBasis) out.push('pension on all of your pay');
    return out;
  }

  function saveProfile() {
    var p = MP.profile(), sal = Math.round(annualSalary(s));
    p.salary = sal;
    MP.set('profile', p);
    MP.log('Saved salary of ' + MP.money(sal) + ' to your profile');
    MP.toast('Salary of ' + MP.money(sal) + ' saved to your profile.');
  }

  function cell(id, v, cls) { return el('td', { class: 'num' + (cls ? ' ' + cls : ''), id: id || null }, MP.money(v, true)); }
  function row(key, label, yearly, opts) {
    opts = opts || {};
    return el('tr', { class: opts.cls || null }, el('th', { scope: 'row' }, label),
      cell(key ? 'y-' + key : null, yearly), cell(key ? 'm-' + key : null, yearly / 12), cell(key ? 'w-' + key : null, yearly / 52, 'detail-only'));
  }

  function update() {
    save();
    var r = calc(s);
    var note = MP.$('#code-note');
    if (note) {
      note.textContent = !r.code ? '' : r.code.kind === 'bad' ? 'We did not recognise that tax code, so we used the standard allowance.' :
        r.code.label + '. Your tax code replaces the allowance options below.';
      note.className = 'small ' + (r.code && r.code.kind === 'bad' ? 'neg' : 'muted');
    }
    results.innerHTML = '';

    // headline numbers
    var up = calc(s, r.salary + 100);
    var marginal = ((up.tax + up.ni + up.sl) - (r.tax + r.ni + r.sl)) / 100;
    var effective = r.gross > 0 ? (r.tax + r.ni) / r.gross : 0;
    results.appendChild(el('section', { class: 'card', 'aria-labelledby': 'h-sum' },
      el('h2', { id: 'h-sum', class: 'visually-hidden' }, 'Summary'),
      el('div', { class: 'th-stats' },
        el('div', { class: 'stat' }, el('span', { class: 'label' }, 'Take-home a month'), el('span', { class: 'value big', id: 'takehome-month' }, MP.money(r.takeHome / 12, true))),
        el('div', { class: 'stat' }, el('span', { class: 'label' }, 'Take-home a year'), el('span', { class: 'value', id: 'takehome-year' }, MP.money(r.takeHome))),
        el('div', { class: 'stat detail-only' }, el('span', { class: 'label' }, 'Tax and NI on your next £1'), el('span', { class: 'value', id: 'marginal' }, MP.pct(marginal, 0))),
        el('div', { class: 'stat detail-only' }, el('span', { class: 'label' }, 'Effective tax rate'), el('span', { class: 'value', id: 'effective' }, MP.pct(effective)))),
      el('p', { class: 'small muted detail-only', style: { margin: '10px 0 0' } },
        'Next £1 includes student loan. Effective rate is income tax and NI as a share of your pay of ' + MP.money(r.gross) + '.')));

    var hidden = hiddenChoices();
    if (hidden.length) {
      results.appendChild(el('p', { class: 'callout small simple-only', id: 'hidden-note' }, 'Also counted, from the Detailed view: ' + hidden.join(', ') + '. ',
        el('button', { type: 'button', class: 'btn btn-sm btn-ghost', onclick: function () { MP.setPrefs({ detail: 'detailed' }); } }, 'Show all options')));
    }

    // personal allowance taper
    var taperTop = R.paTaperStart + 2 * R.personalAllowance;
    if (r.ani > R.paTaperStart && r.ani < taperTop && !r.codeUsed) {
      results.appendChild(el('div', { class: 'callout warning', id: 'taper-warning' },
        el('p', null, el('strong', null, 'You are in the 60% tax trap. '),
          'Between ' + MP.money(R.paTaperStart) + ' and ' + MP.money(taperTop) + ' you lose £1 of tax-free allowance for every £2 you earn, so each extra pound is taxed at about 60% plus NI. You have lost ' + MP.money(R.personalAllowance - UK.personalAllowance(r.ani)) + ' of your allowance.'),
        el('p', null, 'Pension contributions can bring your income below £100,000 and win back your allowance. About ' + MP.money(r.ani - R.paTaperStart) + ' more a year into your pension would do it.')));
    }
    if (r.extraClaim > 0.5) {
      results.appendChild(el('div', { class: 'callout', id: 'extra-claim' },
        el('p', null, 'Your pension uses relief at source, so your provider adds 20% tax relief (' + MP.money(r.topUp) + ' a year). You pay a higher rate, so you can claim about ',
          el('strong', null, MP.money(r.extraClaim)), ' a year more back through a Self Assessment tax return or by contacting HMRC.')));
    }
    if (s.marriage && !r.codeUsed && !r.marriageOk) {
      results.appendChild(el('p', { class: 'callout warning' }, 'Marriage allowance only helps if you pay tax and do not pay more than the ' + (r.region === 'scotland' ? 'intermediate' : 'basic') + ' rate, so it is not included.'));
    }

    // table
    var tbody = el('tbody');
    tbody.appendChild(row('gross', r.bonus ? 'Pay (including ' + MP.money(r.bonus) + ' bonus)' : 'Pay before tax', r.gross));
    if (r.bik) tbody.appendChild(row('bik', 'Taxable benefits (not cash)', r.bik, { cls: 'sub' }));
    if (r.method === 'sacrifice' && r.C) tbody.appendChild(row(null, 'Less salary sacrifice', -r.C, { cls: 'sub' }));
    if (r.method === 'net' && r.C) tbody.appendChild(row(null, 'Less pension (before tax)', -r.C, { cls: 'sub' }));
    tbody.appendChild(row('taxable', 'Taxable pay', r.taxable));
    tbody.appendChild(row(null, r.codeUsed ? 'Tax-free allowance (from tax code)' : el('span', null, MP.term('personal-allowance', 'Tax-free allowance')), r.allowance, { cls: 'sub' }));
    tbody.appendChild(row('tax', 'Income tax', r.tax, { cls: 'ded' }));
    r.bands.forEach(function (b) {
      tbody.appendChild(row(null, b.name + ' ' + MP.pct(b.rate, 0) + ' on ' + MP.money(b.amount), b.tax, { cls: 'sub band detail-only' }));
    });
    if (r.marriage) tbody.appendChild(row(null, 'Marriage allowance reduction', -r.marriage, { cls: 'sub' }));
    tbody.appendChild(row('ni', 'National Insurance', r.ni, { cls: 'ded' }));
    r.loans.forEach(function (l, i) { tbody.appendChild(row(i ? 'sl' + i : 'sl', l.label, l.amount, { cls: 'ded' })); });
    if (r.C) tbody.appendChild(row('pension', r.method === 'ras' ? 'Pension (you pay 80%, tax relief adds ' + MP.money(r.topUp) + ')' : r.method === 'net' ? 'Pension (net pay)' : 'Pension (salary sacrifice)', r.method === 'ras' ? r.fromPay : r.C, { cls: 'ded' }));
    tbody.appendChild(row('takehome', 'Take-home pay', r.takeHome, { cls: 'total' }));

    results.appendChild(el('section', { class: 'card', 'aria-labelledby': 'h-table' },
      el('h2', { id: 'h-table' }, 'Your pay, line by line'),
      el('div', { class: 'scroll-x' }, el('table', { class: 'table th-table', id: 'pay-table' },
        el('thead', null, el('tr', null, el('th', { scope: 'col' }, el('span', { class: 'visually-hidden' }, 'Item')), el('th', { class: 'num', scope: 'col' }, 'Yearly'), el('th', { class: 'num', scope: 'col' }, 'Monthly'), el('th', { class: 'num detail-only', scope: 'col' }, 'Weekly'))),
        tbody)),
      el('p', { class: 'small muted', style: { margin: '10px 0 0' } },
        (r.C ? 'Total going into your pension: ' + MP.money(r.C) + ' a year, plus anything your employer adds. ' : '') +
        (r.bonus ? 'Monthly and weekly figures spread your bonus over the year; in the month it is paid you may see more tax taken. ' : '') +
        'Assumes the same pay all year, the standard ' + R.taxYear + ' rates and no other income.')));

    // donut
    var items = [{ label: 'Take-home', value: Math.max(0, r.takeHome), color: '--c2' }, { label: 'Income tax', value: r.tax, color: '--c1' },
      { label: 'National Insurance', value: r.ni, color: '--c3' }, { label: 'Student loan', value: r.sl, color: '--c4' },
      { label: 'Pension', value: r.fromPay, color: '--c5' }];
    results.appendChild(el('section', { class: 'card', 'aria-labelledby': 'h-donut' },
      el('h2', { id: 'h-donut' }, 'Where your pay goes'),
      r.gross > 0 ? MP.donut({ items: items, center: r.gross > 0 ? MP.pct(Math.max(0, r.takeHome) / r.gross, 0) + ' kept' : '', label: 'Where your yearly pay goes' }) :
        el('p', { class: 'muted' }, 'Enter your pay to see the breakdown.')));

    // getting advice: always shown above £100,000 (the allowance taper makes tax planning worth it)
    var advice = MP.adviceCard('tax');
    advice.id = 'th-advice';
    if (r.gross <= 100000) advice.classList.add('detail-only');
    results.appendChild(advice);

    updateRise(r);
    var sal = Math.round(r.salary);
    if (sal > 0) MP.summary('take-home', MP.money(r.takeHome / 12) + ' a month take-home on ' + MP.money(sal));
  }

  var riseBox, riseInput;
  function whatIf() {
    var inp = MP.moneyInput({ id: 'rise', value: s.rise, placeholder: '' });
    riseInput = inp.input;
    riseInput.addEventListener('input', function () { s.rise = riseInput.value; update(); });
    riseBox = el('div', { id: 'rise-result', 'aria-live': 'polite' });
    return el('section', { class: 'card', 'aria-labelledby': 'h-rise' },
      el('h2', { id: 'h-rise' }, 'What if I got a pay rise?'),
      MP.field('New yearly salary', inp.wrap, 'Uses the same pension, student loan and other choices as above.'),
      riseBox);
  }
  function updateRise(r) {
    if (!riseBox) return;
    var suggest = Math.max(1000, Math.round(r.salary * 1.05 / 500) * 500);
    riseInput.placeholder = MP.fmtNum(suggest);
    var raw = String(s.rise == null ? '' : s.rise).trim();
    var target = raw === '' ? suggest : MP.clamp(MP.num(raw), 0, 1e8);
    var n = calc(s, target), rise = target - r.salary, gain = n.takeHome - r.takeHome;
    riseBox.innerHTML = '';
    if (Math.abs(rise) < 1) { riseBox.appendChild(el('p', { class: 'muted' }, 'Enter a salary different from your current ' + MP.money(r.salary) + '.')); return; }
    var keep = gain / rise;
    riseBox.appendChild(el('div', { class: 'th-stats two' },
      el('div', { class: 'stat' }, el('span', { class: 'label' }, 'Change in monthly take-home'), el('span', { class: 'value ' + (gain >= 0 ? 'pos' : 'neg'), id: 'rise-monthly' }, (gain >= 0 ? '+' : '') + MP.money(gain / 12, true))),
      el('div', { class: 'stat' }, el('span', { class: 'label' }, rise > 0 ? 'Of the rise you keep' : 'Of the cut you lose'), el('span', { class: 'value', id: 'rise-keep' }, MP.pct(keep, 0)))));
    riseBox.appendChild(el('p', { class: 'small muted', style: { margin: '10px 0 0' } },
      (rise > 0 ? 'A rise of ' : 'A cut of ') + MP.money(Math.abs(rise)) + ' a year (' + (raw === '' ? 'example: 5%' : 'from ' + MP.money(r.salary)) + ') changes your take-home by ' + MP.money(Math.abs(gain)) + ' a year. ' +
      (rise > 0 ? 'The rest goes on tax, NI, student loan and pension.' : '')));
  }

  function howTo() {
    return el('details', { class: 'card' }, el('summary', null, 'How to use this, and tips'),
      el('ul', { class: 'small' },
        el('li', null, 'Enter your pay before tax and how often you are paid. Add your pension and any student loans to match your payslip.'),
        el('li', null, 'Check your tax code on your payslip, P60 or in the free HMRC app. Most people have 1257L. A wrong code is the most common reason for paying the wrong tax.'),
        el('li', null, 'Emergency codes end in W1, M1 or X (or you may be on BR or 0T after starting a job). You may pay too much for a while; HMRC usually puts it right, or you can update your details in the HMRC app.'),
        el('li', null, 'You can claim tax relief for some work costs you pay yourself, such as cleaning a uniform, professional fees or using your own car. Working from home only counts if your employer requires it, not if you choose to. Claim on GOV.UK.'),
        el('li', null, 'Marriage allowance: if one of you earns less than ' + MP.money(R.personalAllowance) + ' and the other pays basic rate tax, the lower earner can transfer ' + MP.money(MARRIAGE) + ' of allowance, worth up to ' + MP.money(MARRIAGE * 0.2) + ' a year. You can backdate it up to 4 years.'),
        el('li', null, 'Child Benefit: if either partner\'s income is over £60,000, the High Income Child Benefit Charge claws it back, rising to all of it at £80,000. Pension contributions reduce the income used for this test.'),
        el('li', null, 'Salary sacrifice also saves NI, so it usually gives the most take-home per pound saved, but it can lower your salary for mortgages and some benefits.')),
      el('p', { class: 'small muted' }, 'This is guidance, not financial advice. Figures use ' + R.taxYear + ' rates for employees and are estimates; your payslip is worked out pay period by pay period.'));
  }

  function save() { MP.set('tools.take-home', s); }

  MP.onTheme(function () { if (results) update(); });
  MP.onPrefs(function () { if (results) update(); });
  render();
});
