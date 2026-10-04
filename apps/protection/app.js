/* Protection needs: how much life cover, income protection and critical illness cover a household might need.
   Needs-based only (no quotes, no products, no insurer names). Inputs are saved at 'tools.protection'.

   Formulas (all amounts in today's money, no growth or inflation):
   Life cover
     need     = mortgage + other debts + funeral + max(0, family income − partner cover) × years + education
     have     = death-in-service (multiple × salary) + existing life policies + savings
     gap      = max(0, need − have)
     years    = 21 − youngest child's age when an age is given, otherwise the years entered (default 18)
   Income protection
     take-home = (salary − income tax − National Insurance) / 12
     phases    = full employer pay, half pay, Statutory Sick Pay (to week 28), then nothing from work
     gap after sick pay ends = max(0, essential outgoings − other income − existing income protection)
     deferred period = longest of 4/8/13/26/52 weeks that sick pay weeks + savings (months × 52/12) cover (at least 4)
   Critical illness
     need = salary × years of income (1, 1.5 or 2) + one-off costs + mortgage to clear − existing cover */
MP.page({ id: 'protection', title: 'Protection needs' }).then(function () {
  'use strict';
  var el = MP.el, main = MP.$('#app');
  var SSP_WEEKLY = 123.25;      // Statutory Sick Pay 2026/27 [verify on gov.uk/statutory-sick-pay]
  var SSP_WEEKS = 28;           // SSP is paid for up to 28 weeks
  var FUNERAL = 4800;           // approximate average UK funeral cost [verify]
  var DEFERRED = [4, 8, 13, 26, 52];
  var WEEKS_PER_MONTH = 52 / 12;
  var TABS = [
    { key: 'life', label: '🛡️ Life cover' },
    { key: 'income', label: '🩺 Income protection' },
    { key: 'critical', label: '❤️‍🩹 Critical illness' }
  ];

  var profile = MP.profile(), prefs = MP.prefs(), A = prefs.answers || {};
  var employment = A.employment || profile.employment || 'employed';
  var employed = employment === 'employed' || employment === 'both';
  var dependants = A.dependants || (profile.dependants === 0 ? '' : profile.dependants >= 2 ? 'both' : profile.dependants === 1 ? 'partner' : '');

  /* Mortgage from the Mortgage & debt tool, read defensively (it may not exist or have another shape). */
  function debtMortgage() {
    try {
      var d = MP.get('tools.debt', null);
      var m = d && typeof d === 'object' ? d.mortgage : null;
      if (!m || typeof m !== 'object') return null;
      var bal = +m.balance;
      if (!isFinite(bal) || bal < 0) return null;
      return { balance: Math.round(bal), type: m.type === 'interest' ? 'interest' : 'repayment', years: +m.years || null };
    } catch (e) { return null; }
  }
  var fromDebt = debtMortgage();

  function profileSalary() {
    var s = +profile.salary || +A.salary || 0;
    return s > 0 ? s : 35000;
  }
  function defaults() {
    var essential = +A.essentialCosts > 0 ? Math.round(+A.essentialCosts) : null;
    var months = A.savingsMonths != null && A.savingsMonths !== '' ? +A.savingsMonths : 3;
    return {
      tab: 'life',
      salary: null,                         // null → profile salary (or £35,000)
      life: {
        mortgage: fromDebt ? fromDebt.balance : 150000,
        mortgageType: fromDebt ? fromDebt.type : 'repayment',
        income: null,                       // null → 60% of salary
        child: '',                          // youngest child's age (optional)
        years: 18,
        disMult: null,                      // null → 4 if employed (0 if not, or if they said they have no cover)
        savings: essential && months ? Math.round(essential * months) : 5000,
        debts: 0, funeral: FUNERAL, education: 0, existing: 0, partner: 0
      },
      ip: { essential: essential, fullWeeks: 0, halfWeeks: 0, ssp: employed, months: months, other: 0, existing: 0 },
      ci: { years: '1', costs: 0, mortgage: 0, existing: 0 },
      checklist: { will: A.will === 'yes', nominations: false, lpa: false, emergency: months >= 3 }
    };
  }
  function merge(def, v) {
    if (!v || typeof v !== 'object' || Array.isArray(v)) return v === undefined ? def : v;
    var out = {};
    Object.keys(def).forEach(function (k) {
      out[k] = def[k] && typeof def[k] === 'object' && !Array.isArray(def[k]) ? merge(def[k], v[k]) : (v[k] === undefined ? def[k] : v[k]);
    });
    return out;
  }
  var state = merge(defaults(), MP.get('tools.protection', {}));
  if (!TABS.some(function (t) { return t.key === state.tab; })) state.tab = 'life';

  /* ---------- helpers ---------- */
  var logged = false;
  function save() {
    MP.set('tools.protection', state);
    saveSummary();
    if (!logged) { logged = true; MP.log('Updated the protection needs check'); }
  }
  function n(v, lo, hi) { var x = MP.num(v); if (!isFinite(x)) x = 0; return MP.clamp(x, lo == null ? 0 : lo, hi == null ? 1e9 : hi); }
  function has(v) { return v != null && v !== '' && isFinite(+v); }
  function salary() { return has(state.salary) ? n(state.salary) : profileSalary(); }
  function region() { return profile.region || 'england'; }
  function plural(k, word) { return MP.fmtNum(k, 1) + ' ' + word + (k === 1 ? '' : 's'); }
  function stat(label, id, value, cls) {
    return el('div', { class: 'stat' }, el('span', { class: 'label' }, label), el('span', { class: 'value' + (cls ? ' ' + cls : ''), id: id }, value));
  }
  function numInput(id, value, attrs) {
    return el('input', Object.assign({ type: 'number', id: id, value: value, inputmode: 'decimal', step: 'any', min: '0' }, attrs || {}));
  }

  /* ---------- calculations ---------- */
  function autoIncome() { return Math.round(salary() * 0.6 / 100) * 100; }
  function autoMult() { return employed && A.cover !== 'no' ? 4 : 0; }
  function lifeCalc() {
    var L = state.life, s = salary();
    var income = has(L.income) ? n(L.income) : autoIncome();
    var years = n(L.years, 0, 60);
    var mult = has(L.disMult) ? n(L.disMult, 0, 10) : autoMult();
    var partner = n(L.partner);
    var yearly = Math.max(0, income - partner);
    var parts = {
      mortgage: n(L.mortgage), debts: n(L.debts), funeral: n(L.funeral), living: yearly * years, education: n(L.education)
    };
    var need = parts.mortgage + parts.debts + parts.funeral + parts.living + parts.education;
    var dis = mult * s;
    var haveParts = { dis: dis, existing: n(L.existing), savings: n(L.savings) };
    var have = haveParts.dis + haveParts.existing + haveParts.savings;
    var gap = Math.max(0, need - have);
    // how the gap might be split: the mortgage first (decreasing or level term), then living costs
    var mortgageCover = Math.min(parts.mortgage, gap);
    var otherCover = gap - mortgageCover;
    return { income: income, years: years, mult: mult, yearly: yearly, parts: parts, need: need, dis: dis, haveParts: haveParts, have: have, gap: gap,
      mortgageCover: mortgageCover, otherCover: otherCover, salary: s };
  }
  function netOf(gross) {
    gross = Math.max(0, gross);
    return gross - UK.incomeTax(gross, region()).tax - UK.nationalInsurance(gross);
  }
  function autoEssential() { return Math.round(netOf(salary()) / 12 * 0.6 / 10) * 10; }
  function ipCalc() {
    var I = state.ip, s = salary();
    var takeHome = netOf(s) / 12;
    var essential = has(I.essential) ? n(I.essential) : autoEssential();
    var full = Math.round(n(I.fullWeeks, 0, 104)), half = Math.round(n(I.halfWeeks, 0, 104));
    var ssp = I.ssp ? SSP_WEEKLY * WEEKS_PER_MONTH : 0;
    var other = n(I.other), existing = n(I.existing), months = n(I.months, 0, 120);
    var halfNet = Math.max(netOf(s / 2) / 12, ssp);
    var phases = [], wk = 0;
    function gapFor(inc) { return Math.max(0, essential - inc - other); }
    if (full > 0) { phases.push({ key: 'full', label: 'Full pay from your employer', from: wk + 1, to: wk + full, income: takeHome }); wk += full; }
    if (half > 0) { phases.push({ key: 'half', label: 'Half pay from your employer', from: wk + 1, to: wk + half, income: halfNet }); wk += half; }
    if (ssp && wk < SSP_WEEKS) { phases.push({ key: 'ssp', label: 'Statutory Sick Pay only', from: wk + 1, to: SSP_WEEKS, income: ssp }); wk = SSP_WEEKS; }
    phases.push({ key: 'none', label: 'Nothing from work', from: wk + 1, to: null, income: 0 });
    phases.forEach(function (p) { p.gap = gapFor(p.income); });
    var gap = Math.max(0, essential - other - existing);
    var sickWeeks = full + half;
    var coveredWeeks = sickWeeks + months * WEEKS_PER_MONTH;
    var deferred = DEFERRED[0];
    DEFERRED.forEach(function (d) { if (d <= coveredWeeks + 1e-9) deferred = d; });
    var capLow = s * 0.5 / 12, capHigh = s * 0.7 / 12;
    return { takeHome: takeHome, essential: essential, full: full, half: half, ssp: ssp, other: other, existing: existing, months: months,
      phases: phases, gap: gap, sickEndsWeek: wk, coveredWeeks: coveredWeeks, deferred: deferred, capLow: capLow, capHigh: capHigh, salary: s };
  }
  function ciCalc() {
    var C = state.ci, s = salary();
    var years = +C.years || 1;
    var base = s * years;
    var need = base + n(C.costs) + n(C.mortgage);
    var have = n(C.existing);
    return { years: years, base: base, need: need, have: have, gap: Math.max(0, need - have), salary: s };
  }

  /* ---------- page ---------- */
  var panel, summaryBox, tabButtons = {};
  function render() {
    main.innerHTML = '';
    main.appendChild(el('div', { class: 'row', style: { justifyContent: 'space-between', margin: '6px 0 14px' } },
      el('div', null, el('h1', { style: { margin: 0 } }, 'Protection needs'),
        el('p', { class: 'muted', style: { margin: 0 } }, 'See how much life cover and income protection your family would need if the worst happened.')),
      el('button', { class: 'btn', type: 'button', id: 'pr-reset', onclick: reset }, 'Reset')));

    var salIn = MP.moneyInput({ id: 'pr-salary', value: Math.round(salary()) });
    salIn.input.addEventListener('input', function () { state.salary = salIn.input.value === '' ? null : n(salIn.input.value); update(); });
    main.appendChild(el('section', { class: 'card pr-salary', 'aria-label': 'Your salary' },
      el('div', { class: 'pr-salary-row' },
        MP.field('Your salary before tax (a year)', salIn.wrap, profile.salary ? 'From your profile. Change it here to try other figures.' : 'Add your salary on the home page so every tool can use it.'),
        el('p', { class: 'small muted', style: { margin: 0 } }, 'Most of the figures below start from your salary. Nothing here is a quote: it is a guide to how much cover might be enough.'))));

    var list = el('div', { class: 'tabs', role: 'tablist', 'aria-label': 'Types of cover' });
    TABS.forEach(function (t, i) {
      var b = el('button', { type: 'button', role: 'tab', id: 'tab-' + t.key, 'aria-controls': 'pr-panel', 'aria-selected': String(t.key === state.tab), tabindex: t.key === state.tab ? '0' : '-1',
        onclick: function () { selectTab(t.key); },
        onkeydown: function (e) {
          var d = e.key === 'ArrowRight' ? 1 : e.key === 'ArrowLeft' ? -1 : 0;
          if (e.key === 'Home') d = -i; if (e.key === 'End') d = TABS.length - 1 - i;
          if (!d) return;
          e.preventDefault();
          var next = TABS[(i + d + TABS.length) % TABS.length].key;
          selectTab(next); tabButtons[next].focus();
        } }, t.label);
      tabButtons[t.key] = b;
      list.appendChild(b);
    });
    main.appendChild(list);
    panel = el('div', { id: 'pr-panel', role: 'tabpanel' });
    main.appendChild(panel);
    summaryBox = el('div', { class: 'stack', style: { marginTop: '16px' } });
    main.appendChild(summaryBox);
    main.appendChild(el('div', { style: { marginTop: '16px' } }, howTo()));
    drawPanel();
    drawSummary();
    saveSummary();
  }
  function selectTab(key) {
    state.tab = key; MP.set('tools.protection', state);
    TABS.forEach(function (t) { var b = tabButtons[t.key]; b.setAttribute('aria-selected', String(t.key === key)); b.tabIndex = t.key === key ? 0 : -1; });
    drawPanel();
  }
  var refreshPanel = null;
  function drawPanel() {
    panel.innerHTML = '';
    panel.setAttribute('aria-labelledby', 'tab-' + state.tab);
    refreshPanel = null;
    ({ life: lifeTab, income: incomeTab, critical: criticalTab })[state.tab](panel);
  }
  /* Recalculate everything after an input changes, without redrawing the inputs (keeps focus). */
  function update() { save(); if (refreshPanel) refreshPanel(); drawSummary(); }

  /* A money input that shows a suggested figure until the customer types their own. Blank → back to the suggestion. */
  function autoMoney(id, obj, key, auto) {
    var m = MP.moneyInput({ id: id, value: has(obj[key]) ? obj[key] : auto() });
    m.input.addEventListener('input', function () { obj[key] = m.input.value === '' ? null : n(m.input.value); update(); });
    m.refresh = function () { if (!has(obj[key]) && document.activeElement !== m.input) m.input.value = auto(); };
    return m;
  }
  function moneyField(id, obj, key, label, hint, cls) {
    var m = MP.moneyInput({ id: id, value: obj[key] });
    m.input.addEventListener('input', function () { obj[key] = n(m.input.value); update(); });
    var f = MP.field(label, m.wrap, hint);
    if (cls) f.classList.add(cls);
    return f;
  }

  /* ---------- 1. Life cover ---------- */
  function lifeTab(root) {
    var L = state.life, out = el('div', { 'aria-live': 'polite', id: 'lf-result' });
    var income = autoMoney('lf-income', L, 'income', autoIncome);
    var years = numInput('lf-years', L.years, { max: '60', step: '1' });
    var child = numInput('lf-child', L.child, { max: '20', step: '1', placeholder: 'No children' });
    var mult = numInput('lf-dis-mult', has(L.disMult) ? L.disMult : autoMult(), { max: '10', step: '0.5' });
    var disHint = el('span', { class: 'hint', id: 'lf-dis-hint' });
    years.addEventListener('input', function () { L.years = n(years.value, 0, 60); update(); });
    child.addEventListener('input', function () {
      L.child = child.value === '' ? '' : n(child.value, 0, 20);
      if (L.child !== '') { L.years = Math.max(0, 21 - Math.round(L.child)); years.value = L.years; }
      update();
    });
    mult.addEventListener('input', function () { L.disMult = mult.value === '' ? null : n(mult.value, 0, 10); update(); });
    var mType = MP.seg([{ value: 'repayment', label: 'Repayment' }, { value: 'interest', label: 'Interest-only' }], L.mortgageType, function (v) { L.mortgageType = v; update(); }, 'Mortgage type');
    mType.id = 'lf-mtype';

    refreshPanel = function () {
      income.refresh();
      if (!has(L.disMult) && document.activeElement !== mult) mult.value = autoMult();
      out.innerHTML = ''; out.appendChild(lifeResult());
      setDisHint();
    };
    function setDisHint() {
      var r = lifeCalc();
      disHint.textContent = (r.mult ? MP.money(r.dis) + '. ' : '') + (employed ? 'Many employers pay 2 to 4 times salary. Check your staff handbook or benefits site.' : 'Usually only employees get this. Use 0 if you have none.');
    }
    setDisHint();

    var noDeps = dependants === 'none';
    root.appendChild(el('div', { class: 'pr-split' },
      el('section', { class: 'card', 'aria-labelledby': 'h-lf-in' },
        el('h2', { id: 'h-lf-in' }, 'If you died tomorrow'),
        el('p', { class: 'small muted' }, 'What would your family need to pay off and to live on? ', MP.term('life-insurance'), ' pays a lump sum (or an income) to cover this.'),
        MP.explain('life-insurance'),
        noDeps ? el('p', { class: 'callout', style: { marginBottom: '12px' } }, 'You said no one relies on your income. You may only need enough to clear joint debts and pay for a funeral, so try £0 for family income.') : null,
        el('div', { class: 'in-grid' },
          MP.field('Mortgage left to pay', moneyIn('lf-mortgage', L, 'mortgage'), fromDebt ? 'From your Mortgage & debt plan.' : 'An example figure. Use 0 if you rent.'),
          el('div', { class: 'field' }, el('span', { class: 'label' }, 'Mortgage type'), mType),
          MP.field('Income your family would need each year', income.wrap, 'We suggest 60% of your salary (' + MP.money(autoIncome()) + '). Leave blank to use it.'),
          MP.field('For how many years?', years, 'Until your youngest child is 21 is a common choice.'),
          MP.field('Youngest child\'s age (optional)', child, 'We work out the years to age 21 for you.'),
          el('div', { class: 'field' }, el('label', { for: 'lf-dis-mult' }, 'Death-in-service (times your salary)'), mult, disHint),
          MP.field('Savings and investments your family could use', moneyIn('lf-savings', L, 'savings'), 'Not your pension or emergency money you would keep.')),
        el('p', { class: 'small muted', style: { margin: '2px 0 10px' } }, MP.term('death-in-service'), ' is a work benefit. It usually stops if you leave the job, so do not rely on it alone.'),
        el('div', { class: 'detail-only' },
          el('h3', { class: 'pr-sub' }, 'More detail'),
          el('div', { class: 'in-grid' },
            moneyField('lf-debts', L, 'debts', 'Other debts (loans, cards, car finance)'),
            moneyField('lf-funeral', L, 'funeral', 'Funeral costs', 'About ' + MP.money(FUNERAL) + ' is a typical UK funeral.'),
            moneyField('lf-education', L, 'education', 'Lump sum for education or childcare', 'For example university costs.'),
            moneyField('lf-existing', L, 'existing', 'Life cover you already have', 'Your own policies, not work benefits.'),
            moneyField('lf-partner', L, 'partner', 'Yearly income above that your partner\'s pay would cover', 'Leave at £0 if the figure above is just the part your family would lose.')))),
      el('div', { class: 'stack' },
        el('section', { class: 'card', 'aria-labelledby': 'h-lf-out' }, el('h2', { id: 'h-lf-out' }, 'Your life cover gap'), out),
        el('section', { class: 'card', id: 'lf-structure', 'aria-labelledby': 'h-lf-struct' }))));
    out.appendChild(lifeResult());
  }
  function moneyIn(id, obj, key) {
    var m = MP.moneyInput({ id: id, value: obj[key] });
    m.input.addEventListener('input', function () { obj[key] = n(m.input.value); update(); });
    return m.wrap;
  }
  function lifeResult() {
    var r = lifeCalc(), p = r.parts;
    var rows = [
      ['Mortgage', p.mortgage],
      ['Other debts', p.debts, 'debts'],
      ['Funeral', p.funeral],
      ['Family income: ' + MP.money(r.yearly) + ' × ' + plural(r.years, 'year'), p.living],
      ['Education or childcare', p.education, 'education']
    ].filter(function (x) { return x[1] > 0 || !x[2]; });
    var haveRows = [
      ['Death-in-service (' + MP.fmtNum(r.mult, 1) + ' × salary)', r.haveParts.dis],
      ['Life cover you already have', r.haveParts.existing],
      ['Savings', r.haveParts.savings]
    ].filter(function (x) { return x[1] > 0; });
    drawStructure(r);
    return el('div', null,
      el('div', { class: 'stat', style: { marginBottom: '10px' } }, el('span', { class: 'label' }, 'Extra life cover you might need'),
        el('span', { class: 'big-number ' + (r.gap > 0 ? 'neg' : 'pos'), id: 'lf-gap' }, MP.money(r.gap))),
      el('div', { class: 'grid-2 stats' }, stat('Your family would need', 'lf-need', MP.money(r.need)), stat('You already have', 'lf-have', MP.money(r.have))),
      el('div', { class: 'scroll-x', style: { marginTop: '12px' } },
        el('table', { class: 'table small', id: 'lf-table' },
          el('caption', { class: 'visually-hidden' }, 'How we worked it out'),
          el('tbody', null,
            rows.map(function (x) { return el('tr', null, el('td', null, x[0]), el('td', { class: 'num' }, MP.money(x[1]))); }),
            el('tr', { class: 'total' }, el('th', { scope: 'row' }, 'Total need'), el('td', { class: 'num' }, MP.money(r.need))),
            haveRows.map(function (x) { return el('tr', null, el('td', null, '− ' + x[0]), el('td', { class: 'num' }, MP.money(x[1]))); }),
            el('tr', { class: 'total' }, el('th', { scope: 'row' }, 'Gap'), el('td', { class: 'num' }, MP.money(r.gap)))))),
      r.gap <= 0 && r.need > 0 ? el('p', { class: 'callout success', style: { marginTop: '12px' } }, 'What you have already covers this. Check it again when your mortgage, family or job changes.') : null);
  }
  function drawStructure(r) {
    var box = MP.$('#lf-structure');
    if (!box) return;
    box.innerHTML = '';
    box.appendChild(el('h2', { id: 'h-lf-struct' }, 'One way to set it up'));
    if (r.gap <= 0) { box.appendChild(el('p', { class: 'small muted' }, 'No extra cover needed with these figures. The tips on trusts below still apply to cover you already have.')); }
    else {
      var items = [];
      if (r.mortgageCover > 0) {
        items.push(state.life.mortgageType === 'interest'
          ? el('li', null, el('strong', null, 'Level term cover of ' + MP.money(r.mortgageCover)), ' for the rest of your mortgage term. With an interest-only mortgage the amount you owe does not fall, so the cover should not either.')
          : el('li', null, el('strong', null, 'Decreasing term cover of ' + MP.money(r.mortgageCover)), ' over the rest of your mortgage term. The payout falls roughly in line with a repayment mortgage, so it usually costs less than level cover.'));
      }
      if (r.otherCover > 0) {
        var yearlyFib = r.years > 0 ? Math.min(r.yearly, r.otherCover / r.years) : 0;
        items.push(el('li', null, el('strong', null, 'Level term cover of ' + MP.money(r.otherCover)), r.years > 0 ? ' for ' + plural(r.years, 'year') + ' for living costs, ' : ' for living costs, ',
          r.years > 0 && yearlyFib > 0 ? el('span', null, 'or ', el('strong', null, 'family income benefit'), ' paying about ' + MP.money(yearlyFib) + ' a year until the policy ends. It pays an income instead of one lump sum, and is often cheaper.') : 'paid as one lump sum.'));
      }
      box.appendChild(el('ul', { class: 'tight', id: 'lf-suggest' }, items));
      box.appendChild(MP.explain(null, 'Term cover only pays out if you die during the term you choose. If you live past the end, it pays nothing, which is why it is much cheaper than whole-of-life cover.'));
    }
    box.appendChild(el('div', { class: 'callout', style: { marginTop: '12px' } },
      el('p', null, el('strong', null, 'Write policies in trust. '), 'Most insurers offer a free trust form. The payout then usually goes straight to the people you choose, often within weeks, without waiting for probate. It is also normally kept outside your estate for inheritance tax.')));
  }

  /* ---------- 2. Income protection ---------- */
  function incomeTab(root) {
    var I = state.ip, out = el('div', { 'aria-live': 'polite', id: 'ip-result' });
    var essential = autoMoney('ip-essential', I, 'essential', autoEssential);
    var thOut = el('span', { class: 'value', id: 'ip-takehome' });
    var full = numInput('ip-full', I.fullWeeks, { max: '104', step: '1' });
    var half = numInput('ip-half', I.halfWeeks, { max: '104', step: '1' });
    var months = numInput('ip-months', I.months, { max: '120', step: '0.5' });
    full.addEventListener('input', function () { I.fullWeeks = n(full.value, 0, 104); update(); });
    half.addEventListener('input', function () { I.halfWeeks = n(half.value, 0, 104); update(); });
    months.addEventListener('input', function () { I.months = n(months.value, 0, 120); update(); });
    var ssp = el('input', { type: 'checkbox', id: 'ip-ssp', checked: !!I.ssp });
    ssp.addEventListener('change', function () { I.ssp = ssp.checked; update(); });

    refreshPanel = function () {
      essential.refresh();
      var r = ipCalc();
      thOut.textContent = MP.money(r.takeHome);
      out.innerHTML = ''; out.appendChild(ipResult(r));
    };

    root.appendChild(el('div', { class: 'pr-split' },
      el('section', { class: 'card', 'aria-labelledby': 'h-ip-in' },
        el('h2', { id: 'h-ip-in' }, 'If you could not work'),
        el('p', { class: 'small muted' }, 'A long illness or injury is far more likely than dying young. ', MP.term('income-protection'), ' replaces part of your pay until you are back at work.'),
        MP.explain('income-protection'),
        el('div', { class: 'panel', style: { marginBottom: '12px' } }, el('div', { class: 'stat' }, el('span', { class: 'label' }, 'Your take-home pay each month (after tax and National Insurance)'), thOut)),
        MP.field('Essential outgoings each month', essential.wrap, 'Mortgage or rent, bills, food, transport. Leave blank to use 60% of take-home pay.'),
        MP.field('How many months could your savings cover these?', months, 'Your emergency fund.'),
        !employed ? el('p', { class: 'callout warning small' }, 'If you are self-employed you get no sick pay, so income protection matters even more. Set Statutory Sick Pay off below in Detailed view.') : null,
        el('div', { class: 'detail-only' },
          el('h3', { class: 'pr-sub' }, 'Sick pay and other income'),
          el('div', { class: 'in-grid' },
            MP.field('Weeks on full pay from your employer', full, 'Check your contract or staff handbook.'),
            MP.field('Then weeks on half pay', half),
            moneyField('ip-other', I, 'other', 'Other income that would carry on (a month)', 'For example a partner\'s pay towards bills, or rent.'),
            moneyField('ip-existing', I, 'existing', 'Income protection you already have (a month)')),
          el('label', { class: 'check' }, ssp, 'I would get Statutory Sick Pay (' + MP.money(SSP_WEEKLY, true) + ' a week for up to ' + SSP_WEEKS + ' weeks)'),
          el('p', { class: 'hint small muted', style: { margin: 0 } }, 'Employees get SSP. Company sick pay usually includes it rather than adding to it.'))),
      el('section', { class: 'card', 'aria-labelledby': 'h-ip-out' }, el('h2', { id: 'h-ip-out' }, 'Your income gap'), out)));
    refreshPanel();
  }
  function weeksLabel(p) { return p.to == null ? 'From week ' + p.from : 'Weeks ' + p.from + (p.to > p.from ? ' to ' + p.to : ''); }
  function ipResult(r) {
    var aim = Math.min(r.gap, r.capHigh);
    return el('div', null,
      el('div', { class: 'stat', style: { marginBottom: '10px' } }, el('span', { class: 'label' }, 'Monthly gap once sick pay ends'),
        el('span', { class: 'big-number ' + (r.gap > 0 ? 'neg' : 'pos'), id: 'ip-gap' }, MP.money(r.gap))),
      el('div', { class: 'scroll-x' },
        el('table', { class: 'table small', id: 'ip-phases' },
          el('thead', null, el('tr', null, el('th', null, 'When and what comes in'), el('th', { class: 'num' }, 'A month'), el('th', { class: 'num' }, 'Short by'))),
          el('tbody', null, r.phases.map(function (p) {
            return el('tr', { dataset: { phase: p.key } }, el('td', null, el('strong', { class: 'nowrap' }, weeksLabel(p)), el('br'), el('span', { class: 'muted' }, p.label)),
              el('td', { class: 'num' }, MP.money(p.income)), el('td', { class: 'num' + (p.gap > 0 ? ' neg' : '') }, MP.money(p.gap)));
          })))),
      el('p', { class: 'tiny muted', style: { margin: '4px 0 12px' } }, r.other > 0 ? 'Short by = essential outgoings − money coming in − other income (' + MP.money(r.other) + ').' : 'Short by = essential outgoings − money coming in.'),
      el('div', { class: 'grid-2 stats' },
        stat('Suggested deferred period', 'ip-deferred', r.deferred + ' weeks'),
        stat('Insurers usually pay up to', 'ip-cap', MP.money(r.capLow) + ' to ' + MP.money(r.capHigh))),
      el('p', { class: 'small', style: { marginTop: '10px' } }, el('strong', null, 'Why ' + r.deferred + ' weeks: '),
        'your sick pay (' + plural(r.full + r.half, 'week') + ') and savings (about ' + MP.fmtNum(Math.round(r.months * WEEKS_PER_MONTH)) + ' weeks) could carry you that long. ',
        'The deferred period is how long you wait before the policy pays. A longer wait makes cover cheaper.'),
      r.gap > 0 ? el('p', { class: 'callout' + (r.gap > r.capHigh ? ' warning' : ''), style: { marginTop: '10px' } },
        r.gap > r.capHigh
          ? 'Insurers usually cap the benefit at 50 to 70% of your gross pay, so aim for about ' + MP.money(aim) + ' a month and look at cutting costs or building savings for the rest.'
          : 'Cover of about ' + MP.money(aim) + ' a month would fill the gap. Insurers usually cap it at 50 to 70% of your gross pay (' + MP.money(r.capLow) + ' to ' + MP.money(r.capHigh) + ').')
        : el('p', { class: 'callout success', style: { marginTop: '10px' } }, 'Your other income covers your essentials even after sick pay ends.'),
      el('p', { class: 'tiny muted', style: { margin: '8px 0 0' } }, 'Benefits such as Universal Credit or new-style ESA might help but are not counted here. Income protection payouts from a personal policy are usually tax-free.'));
  }

  /* ---------- 3. Critical illness ---------- */
  function criticalTab(root) {
    var C = state.ci, out = el('div', { 'aria-live': 'polite', id: 'ci-result' });
    var yrs = MP.seg([{ value: '1', label: '1 year' }, { value: '1.5', label: '18 months' }, { value: '2', label: '2 years' }], String(C.years), function (v) { C.years = v; update(); }, 'Years of income');
    yrs.id = 'ci-years';
    refreshPanel = function () { out.innerHTML = ''; out.appendChild(ciResult()); };
    root.appendChild(el('div', { class: 'pr-split' },
      el('section', { class: 'card', 'aria-labelledby': 'h-ci-in' },
        el('h2', { id: 'h-ci-in' }, 'If you became seriously ill'),
        el('p', null, MP.term('critical-illness'), ' pays one tax-free lump sum if you are diagnosed with a serious condition listed in the policy, such as many cancers, a heart attack or a stroke. You can spend it on anything: time off, treatment, changes to your home, or paying down the mortgage.'),
        el('div', { class: 'panel small', style: { marginBottom: '12px' } },
          el('strong', null, 'Not the same as life cover. '), 'Life cover pays when you die. Critical illness cover pays while you are alive, and only for the conditions it lists, so read the definitions. Some policies combine both but pay out only once.'),
        el('div', { class: 'field' }, el('span', { class: 'label' }, 'How many years of income would give you breathing space?'), yrs,
          el('span', { class: 'hint' }, 'A common rule of thumb is 1 to 2 years of your salary.')),
        el('div', { class: 'detail-only' },
          el('h3', { class: 'pr-sub' }, 'Adjustments'),
          el('div', { class: 'in-grid' },
            moneyField('ci-costs', C, 'costs', 'One-off costs (home changes, treatment, travel)'),
            moneyField('ci-mortgage', C, 'mortgage', 'Mortgage you would like to clear'),
            moneyField('ci-existing', C, 'existing', 'Critical illness cover you already have', 'Include any from work.')))),
      el('section', { class: 'card', 'aria-labelledby': 'h-ci-out' }, el('h2', { id: 'h-ci-out' }, 'A lump sum to think about'), out)));
    refreshPanel();
  }
  function ciResult() {
    var r = ciCalc();
    return el('div', null,
      el('div', { class: 'stat', style: { marginBottom: '10px' } }, el('span', { class: 'label' }, 'Suggested critical illness cover'),
        el('span', { class: 'big-number', id: 'ci-need' }, MP.money(r.gap))),
      el('ul', { class: 'tight small' },
        el('li', null, MP.money(r.salary) + ' salary × ' + (r.years === 1 ? '1 year' : r.years === 2 ? '2 years' : '18 months') + ' = ' + MP.money(r.base)),
        n(state.ci.costs) > 0 ? el('li', null, '+ one-off costs ' + MP.money(n(state.ci.costs))) : null,
        n(state.ci.mortgage) > 0 ? el('li', null, '+ mortgage to clear ' + MP.money(n(state.ci.mortgage))) : null,
        r.have > 0 ? el('li', null, '− cover you already have ' + MP.money(r.have)) : null),
      el('p', { class: 'small muted', style: { marginTop: '10px' } }, 'Critical illness cover usually costs more than life cover for the same amount, because claims are more likely. If the cost is a stretch, income protection often gives broader cover for long illnesses.'));
  }

  /* ---------- summary: have vs might need ---------- */
  function light(have, need) {
    if (need <= 0 || have >= need - 0.5) return { cls: 'success', text: 'Covered', icon: '●' };
    if (have >= need * 0.5) return { cls: 'warning', text: 'Part covered', icon: '●' };
    return { cls: 'danger', text: 'Big gap', icon: '●' };
  }
  function drawSummary() {
    if (!summaryBox) return;
    var l = lifeCalc(), ip = ipCalc(), ci = ciCalc();
    var ipNeed = Math.max(0, ip.essential - ip.other), ipHave = Math.min(ipNeed, ip.existing);
    var rows = [
      { key: 'life', name: 'Life cover', have: MP.money(l.have), need: MP.money(l.need), t: light(l.have, l.need) },
      { key: 'income', name: 'Income protection', have: MP.money(ipHave) + '/month', need: MP.money(ipNeed) + '/month', t: light(ipHave, ipNeed) },
      { key: 'critical', name: 'Critical illness', have: MP.money(ci.have), need: MP.money(ci.need), t: light(ci.have, ci.need) }
    ];
    var C = state.checklist;
    function check(key, label, extra) {
      var cb = el('input', { type: 'checkbox', id: 'ck-' + key, checked: !!C[key] });
      cb.addEventListener('change', function () { C[key] = cb.checked; save(); });
      return el('li', null, el('label', { class: 'check' }, cb, el('span', null, label)), extra || null);
    }
    summaryBox.innerHTML = '';
    summaryBox.appendChild(el('div', { class: 'grid-2' },
      el('section', { class: 'card', 'aria-labelledby': 'h-sum' },
        el('h2', { id: 'h-sum' }, 'What you have and what you might need'),
        el('ul', { class: 'have-list', id: 'pr-summary' }, rows.map(function (r) {
          return el('li', { dataset: { row: r.key } },
            el('div', { class: 'have-head' }, el('strong', null, r.name), el('span', { class: 'chip ' + r.t.cls }, el('span', { 'aria-hidden': 'true' }, r.t.icon), r.t.text)),
            el('div', { class: 'have-nums' },
              el('div', { class: 'stat' }, el('span', { class: 'label' }, 'You have'), el('span', { class: 'value' }, r.have)),
              el('div', { class: 'stat' }, el('span', { class: 'label' }, 'Might need'), el('span', { class: 'value' }, r.need))));
        })),
        el('p', { class: 'tiny muted', style: { margin: '8px 0 0' } }, 'Life cover "have" includes death-in-service and savings. Figures are a guide, not a quote.')),
      el('section', { class: 'card', 'aria-labelledby': 'h-check' },
        el('h2', { id: 'h-check' }, 'Your protection checklist'),
        el('ul', { class: 'checklist' },
          check('will', 'I have an up-to-date will', el('span', { class: 'hint' }, 'Without one, the law decides who inherits. Unmarried partners can get nothing.')),
          check('nominations', 'I have filled in nomination forms for death-in-service and my pensions', el('span', { class: 'hint' }, 'These payouts usually go by the form, not your will. Update it after life changes.')),
          check('lpa', 'I have a lasting power of attorney', el('span', { class: 'hint' }, 'Lets someone you trust handle money or health decisions if you cannot. Register it at gov.uk.')),
          check('emergency', 'I have an emergency fund of 3 to 6 months of essentials', el('a', { class: 'small', href: '../savings/index.html', id: 'ck-savings-link' }, 'Plan it in Savings & ISAs →'))))));
    summaryBox.appendChild(MP.adviceCard('protection'));
  }

  /* ---------- tips, summary, reset ---------- */
  function howTo() {
    return el('details', { class: 'card' }, el('summary', null, 'How to use this, and tips'),
      el('ul', { class: 'small' },
        el('li', null, 'Start with the Life cover tab, then Income protection. Simple view uses sensible figures for the extras; switch to Detailed at the top to add debts, funeral costs, sick pay and more.'),
        el('li', null, 'Check your workplace benefits first. Death-in-service, company sick pay and group income protection can be worth a lot, but usually stop when you leave the job.'),
        el('li', null, 'Compare cover through an independent broker or protection adviser. They can search many insurers, and some do not charge you a fee.'),
        el('li', null, 'Answer every health and lifestyle question honestly, including smoking and past illnesses. If you do not, an insurer can refuse to pay a claim.'),
        el('li', null, 'Review your cover after big life events: a new baby, moving home, a new mortgage, marriage, separation or a new job.'),
        el('li', null, 'Couples can buy one joint policy or two single ones. Two single policies cost a bit more but can pay out twice.'),
        el('li', null, 'Assumptions: amounts are in today\'s money with no growth or inflation, and income figures are after tax. Statutory Sick Pay of ' + MP.money(SSP_WEEKLY, true) + ' a week and a ' + MP.money(FUNERAL) + ' funeral are approximate.')));
  }
  function saveSummary() {
    var l = lifeCalc(), ip = ipCalc();
    MP.summary('protection', 'Life cover gap ' + MP.money(l.gap) + ' · income gap ' + MP.money(ip.gap) + '/month');
  }
  function reset() {
    if (!MP.confirm('Clear your answers in this tool and start again with suggested figures?')) return;
    var tab = state.tab;
    state = defaults(); state.tab = tab;
    MP.set('tools.protection', state);
    MP.log('Reset the protection needs check');
    render();
    MP.toast('Reset to the suggested figures.');
  }

  render();
});
