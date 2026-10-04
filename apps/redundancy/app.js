/* Redundancy & job loss: statutory redundancy pay, tax on a payout, and how long your money would last.
   Everything is worked out on the device. Inputs are saved at 'tools.redundancy'. */
MP.page({ id: 'redundancy', title: 'Redundancy & job loss' }).then(function () {
  'use strict';
  var el = MP.el, main = MP.$('#app');
  var RR = UK.R.redundancy;
  var MAX_MONEY = 1e9;

  /* ---------- prefills ---------- */
  function answers() { var p = MP.prefs(); return (p && p.answers) || {}; }
  function profileAge() {
    var p = MP.profile(), a = answers();
    var age = p.dob ? UK.age(p.dob) : (a.dob ? UK.age(a.dob) : null);
    return age != null && age >= 16 && age <= 80 ? age : null;
  }
  function profileSalary() {
    var p = MP.profile(), a = answers();
    var s = +p.salary || +a.salary || 0;
    return s > 0 ? s : 0;
  }
  // Average monthly essential spending from the Budget tool, if the customer has imported statements.
  function budgetEssentials() {
    try {
      var b = MP.get('tools.budget', {}) || {}, tx = Array.isArray(b.tx) ? b.tx : [];
      var skip = { 'Income': 1, 'Transfers & savings': 1, 'Eating out & takeaway': 1, 'Shopping': 1, 'Entertainment': 1, 'Cash': 1, 'Other': 1 };
      var months = {}, total = 0;
      tx.forEach(function (t) {
        if (!t || !(t.amount < 0) || skip[t.cat]) return;
        months[String(t.date).slice(0, 7)] = 1; total += -t.amount;
      });
      var n = Object.keys(months).length;
      return n && total > 0 ? Math.round(total / n / 10) * 10 : 0;
    } catch (e) { return 0; }
  }
  function costsPrefill() {
    var a = answers();
    if (+a.essentialCosts > 0) return { value: Math.round(+a.essentialCosts), from: 'From your guided setup.' };
    var b = budgetEssentials();
    if (b > 0) return { value: b, from: 'Estimated from your Budget tool (bills, housing, food and transport).' };
    return { value: 1500, from: 'An example figure. Put in your own.' };
  }
  // Fraction of the tax year (from 6 April) that has gone by.
  function taxYearFraction() {
    var now = new Date(), y = now.getMonth() > 3 || (now.getMonth() === 3 && now.getDate() >= 6) ? now.getFullYear() : now.getFullYear() - 1;
    var start = new Date(y, 3, 6), end = new Date(y + 1, 3, 6);
    return MP.clamp((now - start) / (end - start), 0, 1);
  }

  function defaults() {
    var a = answers(), sal = profileSalary(), costs = costsPrefill().value;
    var weekly = sal ? Math.round(sal / 52) : 600;
    var months = a.savingsMonths != null && a.savingsMonths !== '' ? +a.savingsMonths : null;
    return {
      age: profileAge() || 40, years: 5, weekly: weekly,
      total: '', noticeMode: 'worked', noticeWeeks: '', holiday: '', bonus: '', pension: '',
      earned: Math.round(weekly * 52 * taxYearFraction()),
      savings: months != null && isFinite(months) ? Math.round(months * costs) : 5000,
      costs: costs, income: 0, benefits: 0,
      checks: {}
    };
  }

  var s = Object.assign(defaults(), MP.get('tools.redundancy', {}) || {});
  if (!s.checks || typeof s.checks !== 'object') s.checks = {};
  var logged = false;

  function n(v, max) { var x = MP.num(v); return MP.clamp(isFinite(x) ? x : 0, 0, max == null ? MAX_MONEY : max); }

  /* ---------- the maths ---------- */
  // Statutory redundancy pay. Count back from the most recent year of service.
  function statutory() {
    var age = Math.round(n(s.age, 100)), years = Math.floor(n(s.years, 80));
    var maxYears = Math.max(0, age - 15);   // nobody can have worked since before age 15
    var trimmed = years > maxYears;
    years = Math.min(years, maxYears);
    var weekly = n(s.weekly, 1e6), cap = RR.weeklyPayCap, used = Math.min(weekly, cap);
    var counted = Math.min(years, RR.maxYears), rows = [], weeks = 0;
    for (var i = 0; i < counted; i++) {
      var at = age - i, mult = at >= 41 ? 1.5 : at >= 22 ? 1 : 0.5;
      rows.push({ year: i + 1, age: at, mult: mult, pay: mult * used });
      weeks += mult;
    }
    var eligible = years >= 2;
    return { age: age, years: years, trimmed: trimmed, counted: counted, weekly: weekly, used: used, capped: weekly > cap,
      rows: rows, weeks: eligible ? weeks : 0, total: eligible ? weeks * used : 0, eligible: eligible };
  }

  function noticeWeeks(years) {
    var stat = years < 2 ? 1 : Math.min(12, years);
    var contract = Math.floor(n(s.noticeWeeks, 104));
    return { stat: stat, contract: contract, weeks: Math.max(stat, contract) };
  }

  function pkg(st) {
    var region = MP.profile().region || 'england';
    var offered = n(s.total);
    var redundancy = s.total === '' || s.total == null ? st.total : offered;
    var belowStat = s.total !== '' && s.total != null && offered < st.total;
    if (belowStat) redundancy = st.total;
    var nw = noticeWeeks(st.years);
    var notice = s.noticeMode === 'pilon' ? nw.weeks * st.weekly : 0;
    var holiday = n(s.holiday), bonus = n(s.bonus);
    var pension = Math.min(n(s.pension), redundancy);
    var termination = redundancy - pension;               // paid to you as a lump sum
    var taxFree = Math.min(termination, RR.taxFreeTermination);
    var overLimit = Math.max(0, termination - RR.taxFreeTermination);
    var earnings = notice + holiday + bonus;               // taxed like normal pay, with NI
    var taxable = overLimit + earnings;
    var earned = n(s.earned);
    var tax = Math.max(0, UK.incomeTax(earned + taxable, region).tax - UK.incomeTax(earned, region).tax);
    var ni = Math.max(0, UK.nationalInsurance(earned + earnings) - UK.nationalInsurance(earned));
    var gross = termination + earnings;
    return { redundancy: redundancy, offered: offered, belowStat: belowStat, notice: notice, noticeInfo: nw, holiday: holiday, bonus: bonus,
      pension: pension, termination: termination, taxFree: taxFree, overLimit: overLimit, earnings: earnings, taxable: taxable,
      tax: tax, ni: ni, gross: gross, net: Math.max(0, gross - tax - ni), region: region };
  }

  function runway(p) {
    var start = n(s.savings) + p.net;
    var costs = n(s.costs), income = n(s.income) + n(s.benefits);
    var gap = costs - income;
    var months = gap > 0 ? start / gap : Infinity;
    return { start: start, costs: costs, income: income, gap: gap, months: months, whole: isFinite(months) ? Math.floor(months + 1e-9) : Infinity };
  }

  function dur(m) {
    if (!isFinite(m)) return 'as long as your income lasts';
    m = Math.max(0, Math.floor(m + 1e-9));
    var y = Math.floor(m / 12), r = m % 12, parts = [];
    if (y >= 2) { parts.push(y + ' years'); if (r) parts.push(r + (r === 1 ? ' month' : ' months')); return parts.join(' '); }
    return m + (m === 1 ? ' month' : ' months');
  }

  /* ---------- page ---------- */
  var refs = {};

  function moneyField(id, key, label, hint, attrs) {
    var m = MP.moneyInput(Object.assign({ id: id, value: s[key] === '' || s[key] == null ? '' : s[key] }, attrs || {}));
    m.input.addEventListener('input', function () { s[key] = m.input.value === '' ? '' : n(m.input.value); changed(); });
    return MP.field(label, m.wrap, hint);
  }
  function numField(id, key, label, hint, min, max) {
    var inp = el('input', { type: 'number', id: id, inputmode: 'numeric', min: String(min), max: String(max), step: '1', value: s[key] });
    inp.addEventListener('input', function () { s[key] = inp.value === '' ? 0 : n(inp.value, max); changed(); });
    return MP.field(label, inp, hint);
  }

  function render() {
    main.innerHTML = '';
    refs = {};
    main.appendChild(el('div', { style: { margin: '6px 0 14px' } },
      el('h1', { style: { margin: 0 } }, 'Redundancy & job loss'),
      el('p', { class: 'muted', style: { margin: 0 } }, 'Work out statutory redundancy pay, tax on a payout and how long your money would last.')));

    var mood = moodNote();
    if (mood) main.appendChild(mood);

    var wrap = el('div', { class: 'stack' });
    wrap.appendChild(statCard());
    wrap.appendChild(packageCard());
    wrap.appendChild(runwayCard());
    wrap.appendChild(checklistCard());
    refs.advice = el('div', { class: 'stack', id: 'rd-advice' });
    wrap.appendChild(refs.advice);
    wrap.appendChild(howTo());
    wrap.appendChild(el('div', { class: 'row no-print' },
      el('button', { class: 'btn btn-ghost', type: 'button', id: 'rd-reset', onclick: reset }, 'Reset this tool')));
    main.appendChild(wrap);
    update();
  }

  function moodNote() {
    var j = answers().job;
    var text = j === 'happened' ? 'Losing your job is hard, and it is normal to feel worried. Take it one step at a time: this page shows what you are owed and how long your money can stretch.'
      : j === 'consult' ? 'Your employer has started the redundancy process. You have rights during consultation, so look at the checklist below, and keep a note of every meeting.'
      : j === 'worried' ? 'Planning now, while you are still being paid, gives you more choices if redundancy does happen.'
      : '';
    return text ? el('p', { class: 'callout', id: 'rd-mood' }, text) : null;
  }

  function statCard() {
    var hint = profileAge() ? 'From your profile.' : null;
    var sal = profileSalary();
    var inputs = el('div', null,
      el('div', { class: 'grid-2 rd-tight' },
        numField('rd-age', 'age', 'Your age', hint, 16, 80),
        numField('rd-years', 'years', 'Full years with this employer', 'Only continuous service counts. Up to 20 years are counted.', 0, 60)),
      moneyField('rd-weekly', 'weekly', 'Weekly pay before tax', (sal ? 'Your salary ÷ 52. ' : '') + 'Capped at ' + MP.money(RR.weeklyPayCap) + ' a week for statutory pay.'),
      MP.explain(null, 'Statutory redundancy pay is the legal minimum your employer must pay if you have worked for them for at least 2 years. Many employers pay more.'));
    refs.stat = el('div', { 'aria-live': 'polite', id: 'rd-stat-result' });
    refs.yby = el('div', { class: 'detail-only' });
    return el('section', { class: 'card', 'aria-labelledby': 'h-stat' },
      el('h2', { id: 'h-stat' }, '1. Statutory redundancy pay'),
      el('div', { class: 'grid-2' }, inputs, el('div', null, refs.stat)),
      refs.yby);
  }

  function packageCard() {
    var noticeSeg = el('div', { class: 'seg rd-seg', role: 'group', 'aria-label': 'How is your notice paid?' });
    [['worked', 'I work my notice'], ['pilon', 'Paid in lieu (PILON)']].forEach(function (o) {
      noticeSeg.appendChild(el('button', { type: 'button', id: 'rd-notice-' + o[0], 'aria-pressed': String(s.noticeMode === o[0]), dataset: { value: o[0] },
        onclick: function () {
          s.noticeMode = o[0];
          MP.$$('button', noticeSeg).forEach(function (b) { b.setAttribute('aria-pressed', String(b.dataset.value === s.noticeMode)); });
          changed();
        } }, o[1]));
    });
    var detailed = el('div', { class: 'detail-only' },
      el('div', { class: 'grid-2' },
        el('div', null,
          moneyField('rd-total', 'total', 'Total redundancy pay offered', 'Including the statutory part. Leave blank if you only get statutory pay.'),
          el('div', { class: 'field' }, el('span', { class: 'label' }, 'Notice'), noticeSeg,
            el('span', { class: 'hint' }, 'If you work your notice you are paid as normal. Pay in lieu of notice (PILON) comes in your final pay and is taxed like salary.')),
          numField('rd-notice-weeks', 'noticeWeeks', 'Notice in your contract (weeks)', 'Leave blank to use the legal minimum: 1 week per full year, up to 12 weeks.', 0, 104),
          moneyField('rd-holiday', 'holiday', 'Holiday pay owed', 'For holiday you have built up but not taken. Taxed like salary.')),
        el('div', null,
          moneyField('rd-bonus', 'bonus', 'Bonus or other pay due', 'Taxed like salary.'),
          moneyField('rd-pension', 'pension', 'Put into your pension from the package', 'Paid straight into a pension by your employer, so no income tax. It is not cash you can spend now.'),
          moneyField('rd-earned', 'earned', 'Pay already earned this tax year (since 6 April)', 'Used to estimate the tax on the taxable part.'))));
    refs.pkg = el('div', { 'aria-live': 'polite', id: 'rd-pkg-result' });
    return el('section', { class: 'card', 'aria-labelledby': 'h-pkg' },
      el('h2', { id: 'h-pkg' }, '2. Your payout and tax'),
      el('p', { class: 'simple-only small muted' }, 'This assumes you get statutory pay and work your notice as normal. Switch to Detailed at the top to add an enhanced package, pay in lieu of notice, holiday pay or a pension payment.'),
      MP.explain(null, 'The first ' + MP.money(RR.taxFreeTermination) + ' of redundancy pay is tax-free. Notice pay, holiday pay and bonuses are taxed like your normal salary.'),
      detailed, refs.pkg);
  }

  function runwayCard() {
    var c = costsPrefill(), a = answers();
    var savHint = a.savingsMonths != null && a.savingsMonths !== '' ? 'Prefilled from your guided setup. Put in the real figure if you know it.' : 'Easy-access savings you could use. Leave out your pension.';
    var inputs = el('div', null,
      moneyField('rd-savings', 'savings', 'Savings you could use', savHint),
      moneyField('rd-costs', 'costs', 'Essential costs each month', 'Rent or mortgage, council tax, energy, food, transport, insurance, phone and minimum debt payments. ' + c.from),
      moneyField('rd-income', 'income', 'Other money coming in each month', 'For example a partner\'s take-home pay or other regular income.'),
      el('div', { class: 'detail-only' },
        moneyField('rd-benefits', 'benefits', 'Benefits you expect each month', null)),
      el('p', { class: 'small' }, 'You may be able to get Universal Credit or New Style Jobseeker\'s Allowance. Check with the free ',
        el('a', { href: 'https://www.gov.uk/benefits-calculators', target: '_blank', rel: 'noopener' }, 'benefits calculators on GOV.UK'),
        ' and claim as soon as your job ends. ', el('span', { class: 'detail-only' }, 'Put what they show in "Benefits you expect".')),
      MP.explain(null, 'Your "money runway" is how many months your savings and payout would cover your essential bills if no new job came along.'));
    refs.run = el('div', { 'aria-live': 'polite', id: 'rd-run-result' });
    refs.chart = el('div', { id: 'rd-chart' });
    return el('section', { class: 'card', 'aria-labelledby': 'h-run' },
      el('h2', { id: 'h-run' }, '3. How long your money would last'),
      el('div', { class: 'grid-2' }, inputs, el('div', null, refs.run, refs.chart)),
      el('h3', { style: { marginTop: '16px' } }, 'Ways to make your money last longer'),
      el('ul', { class: 'small rd-ideas' },
        el('li', null, 'Pause or cancel subscriptions and memberships you can live without for now.'),
        el('li', null, 'Talk to your mortgage lender or landlord early, before you miss a payment. Lenders must treat you fairly and may offer help.'),
        el('li', null, 'Payment holidays are not free: interest usually keeps building, so you pay more later. Ask what it would cost first.'),
        el('li', null, 'Check your insurance. ', MP.term('income-protection'), ' or accident, sickness and unemployment (ASU) cover on a mortgage, loan or card might pay out.'),
        el('li', null, 'Keep your payout in an easy-access account as your ', MP.term('emergency-fund', 'emergency fund'), ' until you have a new plan. Avoid big spending or locking it away.'),
        el('li', null, 'Use the ', el('a', { href: '../budget/index.html' }, 'Budget tool'), ' to find your real essential spending.')));
  }

  var CHECKS = [
    ['consult', 'I have been consulted', 'Your employer must talk to you before making you redundant. If 20 or more people at one place may lose their jobs within 90 days, there must also be collective consultation: at least 30 days before the first job ends (45 days for 100 or more).'],
    ['selection', 'I know how people were chosen', 'Selection must be fair, for example based on skills or performance, and must not discriminate.'],
    ['alternative', 'I have asked about other jobs', 'Your employer should offer you any suitable alternative job. You can try a new role for 4 weeks without losing your right to redundancy pay.'],
    ['timeoff', 'I know I can take time off to look for work', 'With 2 years\' service you can take reasonable paid time off during your notice to look for work or arrange training.'],
    ['written', 'I have a written breakdown of my pay', 'Ask for your redundancy pay, notice pay and holiday pay in writing, and check it against this page.'],
    ['settlement', 'Settlement agreement: I will get legal advice', 'If you are offered a settlement agreement, it is only valid if you get independent legal advice. Employers often pay for this.'],
    ['acas', 'I know where to get free help', 'The Acas helpline (0300 123 1100) gives free, confidential advice on your rights at work.'],
    ['benefits', 'I will claim benefits straight away', 'Claims cannot usually be backdated far, so apply as soon as your job ends.'],
    ['p45', 'I will get my P45', 'Give it to your next employer, or use it to claim back any tax you overpaid from HMRC.'],
    ['pension', 'I will not cash in my pension on impulse', 'Taking money out can mean a tax bill and limits on what you can pay in later. Take time, and get free guidance first.']
  ];
  function checklistCard() {
    var done = CHECKS.filter(function (c) { return s.checks[c[0]]; }).length;
    var count = el('span', { class: 'chip', id: 'rd-check-count' }, done + ' of ' + CHECKS.length);
    var list = el('ul', { class: 'rd-checks' }, CHECKS.map(function (c) {
      var box = el('input', { type: 'checkbox', id: 'rd-check-' + c[0], checked: !!s.checks[c[0]] });
      box.onchange = function () {
        if (box.checked) s.checks[c[0]] = true; else delete s.checks[c[0]];
        count.textContent = CHECKS.filter(function (x) { return s.checks[x[0]]; }).length + ' of ' + CHECKS.length;
        save();
      };
      return el('li', null, el('label', { class: 'check', for: box.id }, box, el('span', null, el('strong', null, c[1]), el('span', { class: 'small muted rd-check-text' }, c[2]))));
    }));
    return el('section', { class: 'card', 'aria-labelledby': 'h-check' },
      el('div', { class: 'row', style: { justifyContent: 'space-between' } }, el('h2', { id: 'h-check', style: { margin: 0 } }, '4. Your rights and next steps'), count),
      el('p', { class: 'small muted' }, 'Tick these off as you go. Your ticks are saved.'),
      list);
  }

  function howTo() {
    function a(href, text) { return el('a', { href: href, target: '_blank', rel: 'noopener' }, text); }
    return el('details', { class: 'card' }, el('summary', null, 'How to use this, and tips'),
      el('ul', { class: 'small' },
        el('li', null, 'Start with your age, your full years of service and your weekly pay before tax. Check the result with the ', a('https://www.gov.uk/calculate-your-redundancy-pay', 'GOV.UK redundancy pay calculator'), '.'),
        el('li', null, 'Switch to Detailed to add an enhanced package, pay in lieu of notice, holiday pay and pension payments, and to see the year-by-year working.'),
        el('li', null, 'Your rights, consultation and settlement agreements: ', a('https://www.acas.org.uk/redundancy', 'Acas'), ' and ', a('https://www.citizensadvice.org.uk/work/redundancy/', 'Citizens Advice'), '.'),
        el('li', null, 'Money and budgeting after losing your job: ', a('https://www.moneyhelper.org.uk/en/work/losing-your-job', 'MoneyHelper redundancy guidance'), '.'),
        el('li', null, 'If tax is taken off your payout at too high a rate, you can claim it back from HMRC, usually with your P45.'),
        el('li', null, 'These are estimates using ' + UK.R.taxYear + ' rules. Northern Ireland has its own redundancy rules and weekly pay cap. Guidance, not advice.')));
  }

  /* ---------- results ---------- */
  function update() {
    var st = statutory(), p = pkg(st), r = runway(p);

    // 1. statutory
    refs.stat.innerHTML = '';
    if (!st.eligible) {
      refs.stat.appendChild(el('div', { class: 'stat' }, el('span', { class: 'label' }, 'Statutory redundancy pay'),
        el('span', { class: 'value big-number', id: 'rd-stat-total', dataset: { value: '0' } }, MP.money(0))));
      refs.stat.appendChild(el('p', { class: 'callout warning', id: 'rd-stat-msg', style: { marginTop: '10px' } },
        'You need at least 2 full years with your employer to get statutory redundancy pay. You should still get notice pay, holiday pay you are owed, and any redundancy pay in your contract.'));
    } else {
      refs.stat.appendChild(el('div', { class: 'stat' }, el('span', { class: 'label' }, 'Statutory redundancy pay'),
        el('span', { class: 'value big-number', id: 'rd-stat-total', dataset: { value: String(st.total) } }, MP.money(st.total))));
      refs.stat.appendChild(el('p', { class: 'small muted', id: 'rd-stat-msg', style: { marginTop: '6px' } },
        MP.fmtNum(st.weeks, 1) + ' weeks\' pay × ' + MP.money(st.used, st.used % 1 !== 0) + ' a week' + (st.years > RR.maxYears ? ', counting your last ' + RR.maxYears + ' years' : '') + '.'));
      refs.stat.appendChild(el('p', { class: 'small' }, 'This is tax-free, as it is under ' + MP.money(RR.taxFreeTermination) + '.'));
    }
    if (st.capped) refs.stat.appendChild(el('p', { class: 'callout small', id: 'rd-cap-note' }, 'Your weekly pay is above the legal cap, so statutory pay uses ' + MP.money(RR.weeklyPayCap) + ' a week. Your employer may pay more.'));
    if (st.trimmed) refs.stat.appendChild(el('p', { class: 'small muted' }, 'Years of service cannot start before age 15, so we counted ' + st.years + '.'));

    refs.yby.innerHTML = '';
    if (st.eligible && st.rows.length) {
      refs.yby.appendChild(el('details', { class: 'rd-yby', open: true }, el('summary', null, 'Year-by-year working'),
        el('div', { class: 'scroll-x' }, el('table', { class: 'table', id: 'rd-yby-table' },
          el('thead', null, el('tr', null, el('th', null, 'Year'), el('th', null, 'Age'), el('th', { class: 'num' }, 'Weeks'), el('th', { class: 'num' }, 'Amount'))),
          el('tbody', null, st.rows.map(function (row) {
            return el('tr', null, el('td', null, row.year === 1 ? 'Most recent' : String(row.year)), el('td', null, String(row.age)),
              el('td', { class: 'num' }, MP.fmtNum(row.mult, 1)), el('td', { class: 'num' }, MP.money(row.pay, row.pay % 1 !== 0)));
          })),
          el('tfoot', null, el('tr', null, el('th', null, 'Total'), el('th', null, ''), el('th', { class: 'num' }, MP.fmtNum(st.weeks, 1)), el('th', { class: 'num' }, MP.money(st.total, st.total % 1 !== 0))))))));
    }

    // 2. package
    refs.pkg.innerHTML = '';
    var rows = [['Redundancy pay', p.redundancy]];
    if (p.pension) rows.push(['Paid into your pension', -p.pension]);
    if (p.notice) rows.push(['Pay in lieu of notice (' + p.noticeInfo.weeks + (p.noticeInfo.weeks === 1 ? ' week)' : ' weeks)'), p.notice]);
    if (p.holiday) rows.push(['Holiday pay', p.holiday]);
    if (p.bonus) rows.push(['Bonus or other pay', p.bonus]);
    rows.push(['Estimated income tax', -p.tax]);
    if (p.ni) rows.push(['Estimated National Insurance', -p.ni]);
    var grid = el('div', { class: 'rd-pkg-stats' },
      el('div', { class: 'stat' }, el('span', { class: 'label' }, 'Tax-free'), el('span', { class: 'value pos', id: 'rd-taxfree', dataset: { value: String(p.taxFree) } }, MP.money(p.taxFree))),
      el('div', { class: 'stat' }, el('span', { class: 'label' }, 'Taxable'), el('span', { class: 'value', id: 'rd-taxable', dataset: { value: String(p.taxable) } }, MP.money(p.taxable))),
      el('div', { class: 'stat' }, el('span', { class: 'label' }, 'Tax and NI (estimate)'), el('span', { class: 'value', id: 'rd-tax' }, MP.money(p.tax + p.ni))),
      el('div', { class: 'stat' }, el('span', { class: 'label' }, 'You keep'), el('span', { class: 'value', id: 'rd-net', dataset: { value: String(p.net) } }, MP.money(p.net))));
    refs.pkg.appendChild(grid);
    refs.pkg.appendChild(el('div', { class: 'detail-only scroll-x', style: { marginTop: '12px' } }, el('table', { class: 'table', id: 'rd-pkg-table' },
      el('tbody', null, rows.map(function (rw) { return el('tr', null, el('td', null, rw[0]), el('td', { class: 'num' }, MP.money(rw[1]))); })),
      el('tfoot', null, el('tr', null, el('th', null, 'Cash in your hand'), el('th', { class: 'num' }, MP.money(p.net)))))));
    if (p.belowStat) refs.pkg.appendChild(el('p', { class: 'callout warning small' }, 'The amount offered is less than your statutory pay of ' + MP.money(st.total) + '. By law you must get at least the statutory amount, so we used that. Ask your employer or Acas.'));
    if (p.overLimit > 0) refs.pkg.appendChild(el('p', { class: 'small' }, MP.money(p.overLimit) + ' of your redundancy pay is over the ' + MP.money(RR.taxFreeTermination) + ' tax-free limit, so income tax is due on it (no employee National Insurance). ' +
      'Asking your employer to pay some of it into your pension can save tax.'));
    if (p.taxable > 0) refs.pkg.appendChild(el('p', { class: 'small muted' }, 'Your final payslip may take too much tax. If so, you can claim it back from HMRC. Based on ' + MP.money(n(s.earned)) + ' already earned this tax year.'));

    // 3. runway
    refs.run.innerHTML = '';
    var headline = !isFinite(r.months) ? 'Your income covers your essentials' : dur(r.months);
    refs.run.appendChild(el('div', { class: 'stat' }, el('span', { class: 'label' }, 'Your money would last'),
      el('span', { class: 'value big-number', id: 'rd-months', dataset: { value: isFinite(r.whole) ? String(r.whole) : 'Infinity' } }, headline)));
    refs.run.appendChild(el('p', { class: 'small muted', style: { marginTop: '6px' } },
      MP.money(n(s.savings)) + ' savings + ' + MP.money(p.net) + ' payout = ' + MP.money(r.start) + '. ' +
      (r.gap > 0 ? 'You would use about ' + MP.money(r.gap) + ' a month.' : 'Money coming in is at least as much as your essential costs.')));
    var tone = !isFinite(r.months) || r.months >= 6 ? 'success' : r.months >= 3 ? '' : 'warning';
    var msg = !isFinite(r.months) ? 'Good news: you would not need to use your savings for essentials. Keep them as a safety net.'
      : r.months >= 6 ? 'That is a solid cushion. It gives you time to find the right next job.'
        : r.months >= 3 ? 'That gives you some breathing space. The ideas below can stretch it further.'
          : r.start <= 0 ? 'Your essentials cost more than the money coming in, and there are no savings to fall back on. Claim benefits straight away and get free help: you do not have to sort this out alone.'
            : 'Your money would run short quickly. Claim any benefits straight away, talk to your lender or landlord early, and get free help if bills or debts worry you.';
    refs.run.appendChild(el('p', { class: 'callout ' + tone + ' small', id: 'rd-run-msg', style: { marginTop: '10px' } }, msg));
    drawChart(r);

    // advice
    refs.advice.innerHTML = '';
    var a = answers(), debts = (MP.get('tools.debt.debts', []) || []).some(function (d) { return d && +d.balance > 0; });
    var hasDebt = +a.debtTotal > 0 || a.debtFeel === 'hard' || a.debtFeel === 'behind' || debts;
    var short = isFinite(r.months) && r.months < 3;
    if (short || hasDebt) refs.advice.appendChild(MP.adviceCard('debt'));
    refs.advice.appendChild(MP.adviceCard('general'));

    saveSummary(st, r);
  }

  function drawChart(r) {
    refs.chart.innerHTML = '';
    var horizon = isFinite(r.months) ? MP.clamp(Math.ceil(r.months) + 2, 6, 60) : 12;
    var labels = [], values = [], d = new Date(); d.setDate(1);
    for (var i = 0; i <= horizon; i++) {
      var m = new Date(d.getFullYear(), d.getMonth() + i, 1);
      labels.push(i === 0 ? 'Now' : m.getMonth() === 0 ? String(m.getFullYear()) : m.toLocaleDateString('en-GB', { month: 'short' }));
      values.push(Math.max(0, r.start - r.gap * i));
    }
    var opts = { series: [{ name: 'Money left', color: '--c1', values: values, area: true }], labels: labels, label: 'Money left each month' };
    if (isFinite(r.months) && r.months <= horizon) opts.marker = { index: Math.max(0, r.months), label: 'Runs out' };
    refs.chart.appendChild(MP.lineChart(opts));
  }

  /* ---------- saving ---------- */
  function save() { MP.set('tools.redundancy', s); }
  function changed() {
    save();
    update();
    if (!logged) { logged = true; MP.log('Updated the Redundancy & job loss plan'); }
  }
  function saveSummary(st, r) {
    MP.summary('redundancy', 'Statutory pay ' + MP.money(st.total) + ' · ' +
      (isFinite(r.months) ? 'money lasts ' + dur(r.months) : 'income covers essentials'));
  }
  function reset() {
    if (!MP.confirm('Clear your redundancy figures and checklist, and start again?')) return;
    s = defaults();
    MP.set('tools.redundancy', undefined);
    MP.log('Reset the Redundancy & job loss tool');
    render();
    MP.toast('Reset.');
  }

  MP.onTheme(function () { update(); });
  MP.onPrefs(function () { render(); });
  render();
});
