/* Family money: Child Benefit and the High Income Child Benefit Charge, Tax-Free Childcare,
   maternity pay, and the cost of a new baby. Inputs are saved at 'tools.family' in the encrypted vault.
   Figures come from UK.R (childBenefit, taxFreeChildcare, statutoryMaternity, nationalLivingWage). */
MP.page({ id: 'family', title: 'Family money' }).then(function () {
  'use strict';
  var el = MP.el, main = MP.$('#app');
  var CB = UK.R.childBenefit, TFC = UK.R.taxFreeChildcare, SMP = UK.R.statutoryMaternity;
  var LEL = 129;          // Lower Earnings Limit, £ a week, 2026/27 [verify on gov.uk]
  var MA_MIN = 30;        // Maternity Allowance: earn at least £30 a week in 13 of the 66 weeks before the due week
  var MIN_WEEKLY = TFC.minHoursPerWeek * UK.R.nationalLivingWage;   // Tax-Free Childcare minimum earnings a week

  var prefs = MP.prefs(), A = prefs.answers || {}, profile = MP.profile();
  var region = profile.region || A.region || 'england';
  var babyFirst = A.family === 'expecting' || A.family === 'planning';

  var ALL_TABS = {
    cb: { key: 'cb', label: '👪 Child Benefit' },
    tfc: { key: 'tfc', label: '🧸 Tax-Free Childcare' },
    mat: { key: 'mat', label: '🤱 Parental pay' },
    baby: { key: 'baby', label: '🍼 New baby costs' }
  };
  var TABS = (babyFirst ? ['mat', 'baby', 'cb', 'tfc'] : ['cb', 'tfc', 'mat', 'baby']).map(function (k) { return ALL_TABS[k]; });

  var ITEMS = [
    { key: 'pushchair', label: 'Pushchair or pram', def: 400 },
    { key: 'carseat', label: 'Car seat', def: 150 },
    { key: 'cot', label: 'Cot or Moses basket, and mattress', def: 200 },
    { key: 'clothes', label: 'First clothes and blankets', def: 150 },
    { key: 'nursery', label: 'Nursery furniture', def: 250 },
    { key: 'feeding', label: 'Feeding: bottles, steriliser, pump', def: 120 },
    { key: 'bath', label: 'Bath, changing mat and monitor', def: 100 }
  ];
  var MONTHLY = [
    { key: 'nappies', label: 'Nappies and wipes', def: 45 },
    { key: 'formula', label: 'Formula milk', def: 40, hint: '£0 if you are breastfeeding.' },
    { key: 'clothes', label: 'Clothes as they grow', def: 25 },
    { key: 'other', label: 'Toiletries and other bits', def: 20 }
  ];
  var MODES = [{ value: 'new', label: 'New' }, { value: 'used', label: 'Used' }, { value: 'gift', label: 'Gifted' }];
  var MODE_FACTOR = { 'new': 1, used: 0.5, gift: 0 };

  function salaryGuess() { return +A.salary || +profile.salary || 0; }
  function partnerGuess() { return +A.partnerSalary || +profile.partnerSalary || 0; }

  function defaults() {
    var sal = salaryGuess(), items = {}, monthly = {};
    ITEMS.forEach(function (i) { items[i.key] = { amount: i.def, mode: 'new' }; });
    MONTHLY.forEach(function (m) { monthly[m.key] = m.def; });
    return {
      tab: TABS[0].key,
      cb: { children: babyFirst ? 1 : 2, household: 'couple', income: sal || 40000, partner: partnerGuess(), pension: 0, partnerPension: 0 },
      tfc: { children: 1, cost: 6000, disabled: 0, uc: false },
      mat: { weekly: sal ? Math.round(sal / 52) : 550, fullWeeks: 0, halfWeeks: 0, halfMode: 'plus', leaveWeeks: 52 },
      baby: { items: items, monthly: monthly, childcare: 0, childcareMonths: 3 }
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
  var state = merge(defaults(), MP.get('tools.family', {}));
  if (!ALL_TABS[state.tab]) state.tab = TABS[0].key;

  /* ---------- helpers ---------- */
  var logged = false;
  function save() { MP.set('tools.family', state); saveSummary(); }
  function changed() { save(); if (!logged) { logged = true; MP.log('Updated your Family money plan'); } }
  function n(v, lo, hi) { var x = MP.num(v); if (!isFinite(x)) x = 0; return MP.clamp(x, lo == null ? 0 : lo, hi == null ? 1e9 : hi); }
  function int(v, lo, hi) { return Math.round(n(v, lo, hi)); }
  function stat(label, id, value, cls) {
    return el('div', { class: 'stat' }, el('span', { class: 'label' }, label), el('span', { class: 'value' + (cls ? ' ' + cls : ''), id: id }, value));
  }
  function numInput(id, value, attrs) { return el('input', Object.assign({ type: 'number', id: id, value: value, inputmode: 'numeric', step: '1', min: '0' }, attrs || {})); }
  function money(id, value, attrs) { return MP.moneyInput(Object.assign({ id: id, value: value }, attrs || {})); }
  function m2(x) { return MP.money(x, Math.round(x * 100) % 100 !== 0); }
  function plural(k, word) { return MP.fmtNum(k) + ' ' + word + (k === 1 ? '' : 's'); }
  function bind(input, fn) { input.addEventListener('input', function () { fn(input.value); }); }
  function couple() { return state.cb.household !== 'single'; }

  /* ---------- page ---------- */
  var panel, tabButtons = {};
  function render() {
    main.innerHTML = '';
    main.appendChild(el('div', { class: 'row', style: { justifyContent: 'space-between', margin: '6px 0 14px' } },
      el('div', null, el('h1', { style: { margin: 0 } }, 'Family money'),
        el('p', { class: 'muted', style: { margin: 0 } }, 'Child Benefit, the high income charge, Tax-Free Childcare, maternity pay and the cost of a new baby.')),
      el('button', { class: 'btn', type: 'button', id: 'fm-reset', onclick: reset }, 'Reset')));
    var list = el('div', { class: 'tabs', role: 'tablist', 'aria-label': 'Family money sections' });
    TABS.forEach(function (t, i) {
      var b = el('button', { type: 'button', role: 'tab', id: 'tab-' + t.key, 'aria-controls': 'fm-panel', 'aria-selected': String(t.key === state.tab), tabindex: t.key === state.tab ? '0' : '-1',
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
    panel = el('div', { id: 'fm-panel', role: 'tabpanel' });
    main.appendChild(panel);
    main.appendChild(el('div', { class: 'stack', style: { marginTop: '16px' } }, MP.adviceCard('general'), howTo()));
    drawPanel();
    saveSummary();
  }
  function selectTab(key) {
    state.tab = key; save();
    TABS.forEach(function (t) { var b = tabButtons[t.key]; b.setAttribute('aria-selected', String(t.key === key)); b.tabIndex = t.key === key ? 0 : -1; });
    drawPanel();
  }
  function drawPanel() {
    panel.innerHTML = '';
    panel.setAttribute('aria-labelledby', 'tab-' + state.tab);
    ({ cb: cbTab, tfc: tfcTab, mat: matTab, baby: babyTab })[state.tab](panel);
  }

  /* ---------- 1. Child Benefit and the High Income Child Benefit Charge ---------- */
  function cbCalc() {
    var c = state.cb, kids = int(c.children, 0, 20);
    var weekly = kids > 0 ? CB.eldest + CB.other * (kids - 1) : 0;
    var benefit = Math.round(weekly * 52 * 100) / 100;
    var aniYou = Math.max(0, n(c.income) - n(c.pension));
    var aniPartner = couple() ? Math.max(0, n(c.partner) - n(c.partnerPension)) : 0;
    var ani = Math.max(aniYou, aniPartner), whoPays = !couple() || aniYou >= aniPartner ? 'you' : 'partner';
    var pct = ani <= CB.hicbcStart ? 0 : ani >= CB.hicbcEnd ? 100 : Math.min(100, Math.floor((ani - CB.hicbcStart) / 200));
    var charge = Math.round(benefit * pct) / 100;
    return { kids: kids, weekly: weekly, benefit: benefit, aniYou: aniYou, aniPartner: aniPartner, ani: ani, whoPays: whoPays, pct: pct, charge: charge, net: benefit - charge,
      nonEarner: couple() && Math.min(n(c.income), n(c.partner)) < LEL * 52 };
  }
  function chargeAt(ani, benefit) {
    var pct = ani <= CB.hicbcStart ? 0 : ani >= CB.hicbcEnd ? 100 : Math.floor((ani - CB.hicbcStart) / 200);
    return Math.round(benefit * pct) / 100;
  }
  function cbTab(root) {
    var c = state.cb, out = el('div', { id: 'cb-result', 'aria-live': 'polite' });
    function update() { changed(); partnerBox.hidden = !couple(); out.innerHTML = ''; out.appendChild(cbResult()); }
    var kids = numInput('cb-children', c.children, { min: '0', max: '20' });
    bind(kids, function (v) { c.children = int(v, 0, 20); update(); });
    var hh = MP.seg([{ value: 'couple', label: 'Couple' }, { value: 'single', label: 'Single parent' }], c.household, function (v) { c.household = v; update(); }, 'Your household');
    hh.id = 'cb-household';
    var inc = money('cb-income', c.income), par = money('cb-partner', c.partner);
    var pen = money('cb-pension', c.pension), ppen = money('cb-partner-pension', c.partnerPension);
    bind(inc.input, function (v) { c.income = n(v); update(); });
    bind(par.input, function (v) { c.partner = n(v); update(); });
    bind(pen.input, function (v) { c.pension = n(v); update(); });
    bind(ppen.input, function (v) { c.partnerPension = n(v); update(); });
    var partnerBox = el('div', { hidden: !couple() },
      MP.field('Your partner\'s yearly income before tax', par.wrap, 'Put £0 if your partner does not work.'),
      el('div', { class: 'detail-only' }, MP.field('Partner\'s pension contributions a year', ppen.wrap)));

    root.appendChild(el('div', { class: 'split' },
      el('section', { class: 'card', 'aria-labelledby': 'h-cb-in' },
        el('h2', { id: 'h-cb-in' }, 'Your family'),
        el('div', { class: 'field' }, el('span', { class: 'label' }, 'Household'), hh),
        MP.field('Children you claim Child Benefit for', kids, 'Under 16, or under 20 in approved education or training.'),
        MP.field('Your yearly income before tax', inc.wrap, salaryGuess() ? 'From your answers. Change it to try other figures.' : 'Salary plus any other taxable income, such as rent or savings interest.'),
        el('div', { class: 'detail-only' }, MP.field('Your pension contributions a year', pen.wrap,
          'Personal or "relief at source" pensions: enter the gross amount (what you pay plus the tax relief). Salary sacrifice already lowers your salary, so just use the lower salary above.')),
        partnerBox,
        MP.explain(null, 'Adjusted net income is your total taxable income (salary, self-employed profit, rent, savings interest) minus things like pension contributions and Gift Aid donations. It is the figure HMRC uses for the charge.'),
        MP.explain(null, 'The High Income Child Benefit Charge is a tax you pay back if you or your partner have adjusted net income over ' + MP.money(CB.hicbcStart) + '. It only depends on the higher earner, not on your joint income.')),
      out));
    out.appendChild(cbResult());
  }
  function cbResult() {
    var r = cbCalc(), c = state.cb, notes = [];
    var who = r.whoPays === 'you' ? 'You' : 'Your partner';
    var payer = r.whoPays === 'you' ? 'you have' : 'your partner has';
    if (r.kids === 0) notes.push(el('p', { class: 'callout' }, 'Add how many children you claim for to see your Child Benefit.'));
    if (r.charge > 0 && r.ani < CB.hicbcEnd) {
      var toZero = Math.ceil(r.ani - CB.hicbcStart), half = Math.ceil((r.ani - CB.hicbcStart) / 2 / 200) * 200;
      var halfCharge = chargeAt(r.ani - half, r.benefit);
      notes.push(el('div', { class: 'callout success', id: 'cb-pension-tip' },
        el('p', null, el('strong', null, 'A pension can cut the charge. '), 'A pension contribution of ' + MP.money(toZero) + ' would cut the charge to £0' +
          (half > 0 && half < toZero ? ', and ' + MP.money(half) + ' would cut it to ' + m2(halfCharge) : '') + '. ' +
          (r.whoPays === 'you' ? 'It has to be paid by you' : 'It has to be paid by your partner') + ', as the higher earner.'),
        el('p', { class: 'small' }, 'These are gross amounts, including tax relief. You would also get higher-rate tax relief on it, so the real cost to you is much less. You cannot take a pension until age 55 (57 from 2028).')));
    } else if (r.charge > 0) {
      notes.push(el('div', { class: 'callout warning', id: 'cb-pension-tip' },
        el('p', null, el('strong', null, 'The charge takes back all your Child Benefit, '), 'because ' + payer + ' adjusted net income of ' + MP.money(CB.hicbcEnd) + ' or more. ' +
          'A pension contribution of ' + MP.money(Math.ceil(r.ani - CB.hicbcEnd + 200)) + ' would start to bring it down, and ' + MP.money(Math.ceil(r.ani - CB.hicbcStart)) + ' would cut it to £0.')));
    }
    if (r.charge >= r.benefit && r.benefit > 0) {
      notes.push(el('p', { class: 'callout' }, el('strong', null, 'Still fill in the claim form. '), 'You can ask HMRC not to pay you the money, so there is no charge to pay back, while still getting the benefits of claiming below.'));
    }
    if (r.kids > 0) notes.push(el('div', { class: 'callout' + (r.nonEarner ? ' warning' : ''), id: 'cb-ni-note' },
      el('p', null, el('strong', null, r.nonEarner ? 'Make sure the parent who is not working is the one who claims. ' : (r.charge > 0 ? 'Why claim even if you pay it back? ' : 'Claiming protects your State Pension. ')),
        'Claiming gives the parent at home ', MP.term('national-insurance', 'National Insurance'), ' credits while a child is under 12. These count towards their ', MP.term('state-pension', 'State Pension'),
        '. It also means your child gets their National Insurance number automatically at 16.')));
    if (r.ani > TFC.incomeLimit) notes.push(el('p', { class: 'callout warning' }, 'Over ' + MP.money(TFC.incomeLimit) + ' you also lose Tax-Free Childcare and start to lose your Personal Allowance. A pension contribution can bring you back under.'));
    var pensionsSet = n(c.pension) + (couple() ? n(c.partnerPension) : 0);
    return el('div', { class: 'stack' },
      el('section', { class: 'card', 'aria-labelledby': 'h-cb-out' },
        el('h2', { id: 'h-cb-out' }, 'Your Child Benefit'),
        el('div', { class: 'stat', style: { marginBottom: '12px' } }, el('span', { class: 'label' }, 'You keep each year, after any charge'),
          el('span', { class: 'big-number' + (r.net > 0 ? ' pos' : ''), id: 'cb-net' }, m2(r.net))),
        el('div', { class: 'grid-3 stats' },
          stat('Child Benefit a year', 'cb-benefit', m2(r.benefit)),
          stat('High income charge', 'cb-charge', m2(r.charge), r.charge > 0 ? 'neg' : ''),
          stat('Charge rate', 'cb-pct', r.pct + '%')),
        el('p', { class: 'small muted', style: { margin: '12px 0 0' } },
          r.kids ? MP.money(CB.eldest, true) + ' a week for the eldest' + (r.kids > 1 ? ' and ' + MP.money(CB.other, true) + ' for each other child = ' + MP.money(r.weekly, true) + ' a week' : '') + '. ' : '',
          who + ' ' + (r.whoPays === 'you' ? 'have' : 'has') + ' the higher adjusted net income (' + MP.money(r.ani) + '). The charge is 1% of the benefit for every £200 over ' + MP.money(CB.hicbcStart) + ', and all of it from ' + MP.money(CB.hicbcEnd) + '.'),
        pensionsSet > 0 ? el('p', { class: 'small muted simple-only', style: { margin: '6px 0 0' } }, 'Includes ' + MP.money(pensionsSet) + ' of pension contributions. Switch to Detailed to change them.') : null,
        r.charge > 0 ? el('p', { class: 'small', style: { margin: '6px 0 0' } }, 'The higher earner pays the charge through Self Assessment, or through their tax code if HMRC agrees.') : null),
      notes.length ? el('div', { class: 'stack' }, notes) : null);
  }

  /* ---------- 2. Tax-Free Childcare ---------- */
  function tfcCalc() {
    var t = state.tfc, c = state.cb, kids = int(t.children, 0, 20), disabled = Math.min(kids, int(t.disabled, 0, 20)), cost = n(t.cost);
    var checks = [], minYear = MIN_WEEKLY * 52;
    var you = n(c.income), partner = n(c.partner), aniYou = Math.max(0, you - n(c.pension)), aniPartner = Math.max(0, partner - n(c.partnerPension));
    checks.push({ id: 'earn-you', ok: you >= minYear, text: 'You earn at least ' + MP.money(MIN_WEEKLY, true) + ' a week on average (16 hours at the National Living Wage)' });
    if (couple()) checks.push({ id: 'earn-partner', ok: partner >= minYear, text: 'Your partner earns at least ' + MP.money(MIN_WEEKLY, true) + ' a week on average' });
    checks.push({ id: 'ani-you', ok: aniYou <= TFC.incomeLimit, text: 'Your adjusted net income is ' + MP.money(TFC.incomeLimit) + ' or less' });
    if (couple()) checks.push({ id: 'ani-partner', ok: aniPartner <= TFC.incomeLimit, text: 'Your partner\'s adjusted net income is ' + MP.money(TFC.incomeLimit) + ' or less' });
    checks.push({ id: 'uc', ok: !t.uc, text: 'You do not get Universal Credit' });
    var eligible = checks.every(function (x) { return x.ok; });
    var perChild = Math.min(cost * TFC.topUp, TFC.maxPerChild), perDisabled = Math.min(cost * TFC.topUp, TFC.maxDisabled);
    var topup = eligible ? perChild * (kids - disabled) + perDisabled * disabled : 0;
    var total = cost * kids;
    return { kids: kids, disabled: disabled, cost: cost, total: total, eligible: eligible, checks: checks, topup: topup, yourCost: total - topup, payIn: total - topup,
      capped: cost * TFC.topUp > TFC.maxPerChild };
  }
  function tfcTab(root) {
    var t = state.tfc, out = el('div', { id: 'tfc-result', 'aria-live': 'polite' });
    function update() { changed(); out.innerHTML = ''; out.appendChild(tfcResult()); }
    var kids = numInput('tfc-children', t.children, { min: '0', max: '20' });
    var cost = money('tfc-cost', t.cost);
    var dis = numInput('tfc-disabled', t.disabled, { min: '0', max: '20' });
    var uc = el('input', { type: 'checkbox', id: 'tfc-uc', checked: !!t.uc });
    bind(kids, function (v) { t.children = int(v, 0, 20); update(); });
    bind(cost.input, function (v) { t.cost = n(v); update(); });
    bind(dis, function (v) { t.disabled = int(v, 0, 20); update(); });
    uc.addEventListener('change', function () { t.uc = uc.checked; update(); });
    var c = state.cb;
    root.appendChild(el('div', { class: 'split' },
      el('section', { class: 'card', 'aria-labelledby': 'h-tfc-in' },
        el('h2', { id: 'h-tfc-in' }, 'Your childcare'),
        MP.explain(null, 'Tax-Free Childcare is a government online account for paying registered childcare, such as nurseries, childminders, after-school clubs and holiday clubs. For every £8 you pay in, the government adds £2.'),
        el('div', { class: 'grid-2' },
          MP.field('Children in childcare', kids, 'Under 12, or under 17 if disabled.'),
          MP.field('Childcare cost per child a year', cost.wrap, 'Registered childcare only.')),
        el('div', { class: 'detail-only' }, MP.field('How many of them are disabled?', dis, 'A disabled child can get up to ' + MP.money(TFC.maxDisabled) + ' a year, until they are 17.')),
        el('label', { class: 'check' }, uc, 'We get Universal Credit'),
        el('div', { class: 'panel small' },
          el('p', { style: { margin: 0 } }, 'Incomes from the Child Benefit tab: you ' + MP.money(n(c.income)) + (couple() ? ', your partner ' + MP.money(n(c.partner)) : ' (single parent)') + '. ',
            el('button', { type: 'button', class: 'btn btn-sm btn-ghost linkish', id: 'tfc-edit-income', onclick: function () { selectTab('cb'); } }, 'Change incomes')))),
      out));
    out.appendChild(tfcResult());
  }
  function tfcResult() {
    var r = tfcCalc();
    return el('div', { class: 'stack' },
      el('section', { class: 'card', 'aria-labelledby': 'h-tfc-out' },
        el('h2', { id: 'h-tfc-out' }, 'What the government adds'),
        el('div', { class: 'stat', style: { marginBottom: '12px' } }, el('span', { class: 'label' }, 'Government top-up a year'),
          el('span', { class: 'big-number' + (r.topup > 0 ? ' pos' : ''), id: 'tfc-topup' }, MP.money(r.topup))),
        el('div', { class: 'grid-3 stats' },
          stat('Childcare costs a year', 'tfc-total', MP.money(r.total)),
          stat('You pay', 'tfc-yourcost', MP.money(r.yourCost)),
          stat('You pay a month', 'tfc-monthly', MP.money(r.yourCost / 12))),
        r.eligible && r.capped ? el('p', { class: 'small', id: 'tfc-cap', style: { margin: '12px 0 0' } }, 'The top-up is capped at ' + MP.money(TFC.maxPerChild) + ' per child a year (' + MP.money(TFC.maxDisabled) + ' if disabled). You reach the cap once childcare costs ' + MP.money(TFC.maxPerChild / TFC.topUp) + ' a year.') : null,
        r.eligible ? el('p', { class: 'small muted', style: { margin: '8px 0 0' } }, 'The top-up is 20% of the total cost: you pay in £8, the government adds £2. The cap works over 3-month periods, up to ' + MP.money(TFC.maxPerChild / 4) + ' per child each time.') : null),
      el('section', { class: 'card', 'aria-labelledby': 'h-tfc-elig' },
        el('h2', { id: 'h-tfc-elig' }, r.eligible ? 'You look eligible' : 'You may not be eligible'),
        el('ul', { class: 'checks', id: 'tfc-checks' }, r.checks.map(function (x) {
          return el('li', { class: x.ok ? 'ok' : 'no', dataset: { check: x.id } }, el('span', { class: 'mark', 'aria-hidden': 'true' }, x.ok ? '✓' : '✗'), el('span', { class: 'visually-hidden' }, x.ok ? 'Yes: ' : 'No: '), x.text);
        })),
        el('p', { class: 'small muted', style: { margin: '10px 0 0' } }, 'The earnings test is on what you expect to earn over the next 3 months. People on parental, sick or annual leave count as working, and the self-employed can skip the test in their first year. Under 21s and apprentices have a lower minimum.'),
        !r.eligible && state.tfc.uc ? el('p', { class: 'callout', style: { marginTop: '10px' } }, 'You cannot get Tax-Free Childcare and Universal Credit at the same time. Universal Credit can pay back up to 85% of childcare costs instead. Use a benefits calculator to compare.') : null),
      el('section', { class: 'card', 'aria-labelledby': 'h-tfc-hours' }, el('h2', { id: 'h-tfc-hours' }, 'Free childcare hours'), fundedHours(),
        el('ul', { class: 'small tight', style: { marginTop: '10px' } },
          el('li', null, 'You can use Tax-Free Childcare on top of funded hours, for the hours you pay for.'),
          el('li', null, 'Reconfirm your details every 3 months in your childcare account, or the top-ups stop.'),
          el('li', null, 'You cannot get it at the same time as Universal Credit or childcare vouchers. Apply on gov.uk: one application covers funded hours in England too.'))));
  }
  function fundedHours() {
    var nations = {
      england: ['England', 'Working parents can get up to 30 hours a week of funded childcare, 38 weeks a year, from when their child is 9 months old until they start school (from September 2025). All 3 and 4 year olds get 15 hours a week.'],
      scotland: ['Scotland', 'All 3 and 4 year olds, and some 2 year olds, get 1,140 hours a year of funded early learning and childcare (about 30 hours a week in term time). You do not need to be working.'],
      wales: ['Wales', 'The Childcare Offer for Wales gives working parents of 3 and 4 year olds up to 30 hours a week of funded early education and childcare. Flying Start helps some younger children.'],
      ni: ['Northern Ireland', 'There is a funded pre-school place in the year before school, and the Northern Ireland Childcare Subsidy Scheme can cut registered childcare bills for working parents.']
    };
    var me = nations[region] || nations.england;
    return el('div', null,
      el('p', { id: 'tfc-nation' }, el('strong', null, me[0] + ': '), me[1]),
      el('p', { class: 'small muted', style: { margin: 0 } }, 'Funded hours are different in each part of the UK and providers may charge for meals or extras. Check your council or nursery for the details.'));
  }

  /* ---------- 3. Maternity and parental pay ---------- */
  function matCalc() {
    var m = state.mat, awe = n(m.weekly, 0, 1e6), weeks = int(m.leaveWeeks, 1, 52);
    var F = int(m.fullWeeks, 0, 52), H = int(m.halfWeeks, 0, 52);
    var smpOk = awe >= LEL, maOk = !smpOk && awe >= MA_MIN;
    var flat = Math.min(SMP.weeklyFlat, awe * SMP.first6WeeksRate);
    var rows = [], total = 0, taxable = 0;
    for (var w = 1; w <= 52; w++) {
      var sp = 0, kind = 'Unpaid';
      if (smpOk) {
        if (w <= 6) { sp = awe * SMP.first6WeeksRate; kind = 'SMP (90%)'; }
        else if (w <= 6 + SMP.flatWeeks) { sp = flat; kind = 'SMP'; }
      } else if (maOk && w <= 6 + SMP.flatWeeks) { sp = flat; kind = 'Maternity Allowance'; }
      var pay = sp;
      if (smpOk && w <= F) { pay = Math.max(awe, sp); kind = 'Full pay'; }
      else if (smpOk && w <= F + H) {
        pay = m.halfMode === 'incl' ? Math.max(awe / 2, sp) : Math.min(awe, awe / 2 + sp);
        kind = 'Half pay' + (m.halfMode === 'incl' ? '' : ' + SMP');
      }
      pay = Math.round(pay * 100) / 100;
      if (w > weeks) { pay = awe; kind = 'Back at work'; }
      rows.push({ week: w, kind: kind, pay: pay, normal: awe });
      if (w <= weeks) { total += pay; if (kind !== 'Maternity Allowance') taxable += pay; }
    }
    var normalLeave = awe * weeks, back = awe * (52 - weeks);
    function net(gross, extraUntaxed) { return gross - UK.incomeTax(gross, region).tax - UK.nationalInsurance(gross) + (extraUntaxed || 0); }
    var normalNet = net(awe * 52), leaveNet = net(taxable + back, total - taxable);
    var netShort = Math.max(0, normalNet - leaveNet), months = weeks * 12 / 52;
    return { awe: awe, weeks: weeks, smpOk: smpOk, maOk: maOk, first6: smpOk ? awe * SMP.first6WeeksRate : 0, flat: smpOk || maOk ? flat : 0, rows: rows, total: total,
      normal: normalLeave, short: Math.max(0, normalLeave - total), netShort: netShort, monthlyShort: months > 0 ? netShort / months : 0, enhanced: smpOk && (F + H) > 0, F: F, H: H };
  }
  function matTab(root) {
    var m = state.mat, out = el('div', { id: 'mat-result', 'aria-live': 'polite' });
    function update() { changed(); out.innerHTML = ''; out.appendChild(matResult()); }
    var wk = money('mat-weekly', m.weekly);
    var full = numInput('mat-full', m.fullWeeks, { min: '0', max: '52' }), half = numInput('mat-half', m.halfWeeks, { min: '0', max: '52' });
    var leave = numInput('mat-leave', m.leaveWeeks, { min: '1', max: '52' });
    bind(wk.input, function (v) { m.weekly = n(v, 0, 1e6); update(); });
    bind(full, function (v) { m.fullWeeks = int(v, 0, 52); update(); });
    bind(half, function (v) { m.halfWeeks = int(v, 0, 52); update(); });
    bind(leave, function (v) { m.leaveWeeks = int(v, 1, 52) || 52; update(); });
    var mode = MP.seg([{ value: 'plus', label: 'Half pay plus SMP' }, { value: 'incl', label: 'Half pay including SMP' }], m.halfMode, function (v) { m.halfMode = v; update(); }, 'How your employer pays half pay');
    mode.id = 'mat-halfmode';
    root.appendChild(el('div', { class: 'split' },
      el('section', { class: 'card', 'aria-labelledby': 'h-mat-in' },
        el('h2', { id: 'h-mat-in' }, 'Your pay'),
        MP.field('Average weekly earnings before tax', wk.wrap, 'Your average gross pay over the 8 weeks up to the 15th week before your due week. Yearly salary ÷ 52 is a good guess.'),
        MP.explain(null, 'Statutory Maternity Pay (SMP) is the minimum your employer must pay while you are on maternity leave. Many employers pay more: check your contract or staff handbook for an "enhanced" scheme.'),
        el('div', { class: 'detail-only' },
          el('h3', null, 'Your employer\'s scheme'),
          el('div', { class: 'grid-2' },
            MP.field('Weeks on full pay', full),
            MP.field('Then weeks on half pay', half)),
          el('div', { class: 'field' }, el('span', { class: 'label' }, 'Half pay is paid as'), mode),
          MP.field('Weeks of leave you plan to take', leave, 'Up to 52 weeks. After 39 weeks it is unpaid.')),
        el('p', { class: 'small muted simple-only', style: { margin: 0 } }, 'Assumes SMP only and 52 weeks of leave. Switch to Detailed to add your employer\'s scheme.')),
      out));
    out.appendChild(matResult());
  }
  function matResult() {
    var r = matCalc(), msgs = [];
    if (r.smpOk) msgs.push(el('p', { class: 'callout success', id: 'mat-elig' }, 'You earn more than ' + MP.money(LEL) + ' a week, so you should get SMP, as long as you have worked for your employer for at least 26 weeks by the 15th week before your due week. Tell them at least 15 weeks before.'));
    else if (r.maOk) msgs.push(el('p', { class: 'callout warning', id: 'mat-elig' }, 'You earn less than ' + MP.money(LEL) + ' a week, so you would not get SMP. You can claim Maternity Allowance from the government instead: we have used ' + MP.money(r.flat, true) + ' a week for 39 weeks. Self-employed people claim it too.'));
    else msgs.push(el('p', { class: 'callout warning', id: 'mat-elig' }, 'On these earnings you would not get SMP. You may still get Maternity Allowance for 14 weeks if your partner is self-employed and you help in their business, or Universal Credit. Check on gov.uk.'));
    var phases = [];
    if (r.smpOk) {
      phases.push(['Weeks 1–6', '90% of your earnings', MP.money(r.first6, true)]);
      phases.push(['Weeks 7–39', 'SMP: ' + MP.money(SMP.weeklyFlat, true) + ' or 90% if less', MP.money(r.flat, true)]);
    } else if (r.maOk) phases.push(['Weeks 1–39', 'Maternity Allowance', MP.money(r.flat, true)]);
    phases.push(['Weeks 40–52', 'Unpaid', '£0']);
    var dreamBtn = el('button', { class: 'btn btn-accent', type: 'button', id: 'mat-dream', disabled: r.netShort <= 0, onclick: function () { saveLeaveDream(); } }, '👶 Save as a dream: Parental leave fund');
    return el('div', { class: 'stack' },
      el('section', { class: 'card', 'aria-labelledby': 'h-mat-out' },
        el('h2', { id: 'h-mat-out' }, 'Your maternity pay'),
        el('div', { class: 'grid-2' },
          el('div', { class: 'panel' }, stat('SMP for weeks 1 to 6, each week', 'mat-first6', MP.money(r.first6, true))),
          el('div', { class: 'panel' }, stat('SMP for weeks 7 to 39, each week', 'mat-flat', MP.money(r.flat, true)))),
        r.enhanced ? el('p', { class: 'small', style: { margin: '10px 0 0' } }, 'Including your employer\'s scheme: ' + plural(r.F, 'week') + ' at full pay' + (r.H ? ', then ' + plural(r.H, 'week') + ' at half pay' : '') + '.') : null,
        el('div', { class: 'grid-3 stats', style: { marginTop: '14px' } },
          stat('Paid over ' + plural(r.weeks, 'week'), 'mat-total', MP.money(r.total)),
          stat('Normal pay for that time', 'mat-normal', MP.money(r.normal)),
          stat('Less than normal, before tax', 'mat-short', MP.money(r.short), r.short > 0 ? 'neg' : '')),
        el('div', { class: 'callout' + (r.monthlyShort > 0 ? ' warning' : ' success'), style: { marginTop: '14px' } },
          el('p', null, el('strong', null, 'After tax, about ', el('span', { id: 'mat-monthly-short' }, MP.money(r.monthlyShort)), ' a month less '), 'while you are on leave, ' + MP.money(r.netShort) + ' in total.'),
          el('p', { class: 'small' }, 'Saving this before the baby arrives keeps your bills paid. We assume your tax code is 1257L and leave out pension contributions.')),
        el('div', { class: 'row', style: { marginTop: '12px' } }, dreamBtn),
        el('div', { class: 'scroll-x', style: { marginTop: '14px' } }, el('table', { class: 'table', id: 'mat-phases' },
          el('thead', null, el('tr', null, el('th', null, 'When'), el('th', null, 'What you get'), el('th', { class: 'num' }, 'Each week'))),
          el('tbody', null, phases.map(function (p) { return el('tr', null, el('td', { class: 'nowrap' }, p[0]), el('td', null, p[1]), el('td', { class: 'num' }, p[2])); })))),
        el('p', { class: 'tiny muted', style: { margin: '6px 0 0' } }, 'SMP rate ' + MP.money(SMP.weeklyFlat, true) + ' a week (check gov.uk each April).')),
      el('details', { class: 'card detail-only', id: 'mat-weeks-box' },
        el('summary', null, 'Week by week'),
        el('div', { class: 'scroll-x' }, el('table', { class: 'table', id: 'mat-weeks' },
          el('thead', null, el('tr', null, el('th', null, 'Week'), el('th', null, 'Paid as'), el('th', { class: 'num' }, 'You get'), el('th', { class: 'num' }, 'Normally'))),
          el('tbody', null, r.rows.map(function (x) {
            return el('tr', { class: x.kind === 'Back at work' ? 'muted' : '' }, el('td', null, x.week), el('td', null, x.kind), el('td', { class: 'num' }, MP.money(x.pay, true)), el('td', { class: 'num' }, MP.money(x.normal, true)));
          }))))),
      el('div', { class: 'stack' }, msgs),
      el('section', { class: 'card', 'aria-labelledby': 'h-mat-spl' },
        el('h2', { id: 'h-mat-spl' }, 'Partners and Shared Parental Leave'),
        el('p', null, 'Partners can take 1 or 2 weeks of paternity leave, paid at ' + MP.money(SMP.weeklyFlat, true) + ' a week or 90% of earnings if that is less. With Shared Parental Leave, the mother can end maternity leave early and share up to 50 weeks of leave and 37 weeks of pay with her partner. You can take it in turns, or be off together, in up to three blocks each.'),
        el('p', { class: 'small muted', style: { margin: 0 } }, 'Both of you need to meet work and earnings tests, and you must give your employers 8 weeks\' notice. Adoptive parents get the same rights.')));
  }
  function saveLeaveDream() {
    var r = matCalc();
    if (r.netShort <= 0) return;
    var date = new Date(); date.setMonth(date.getMonth() + (A.family === 'expecting' ? 6 : 12));
    var list = MP.goals();
    var g = list.find(function (x) { return x.linked === 'family-leave'; }) || list.find(function (x) { return x.icon === '👶'; });
    var isNew = !g;
    if (!g) { g = { id: MP.uid(), priority: 1, home: 'easy', rate: null, saved: 0 }; list.push(g); }
    Object.assign(g, { name: g.name || 'Parental leave fund', icon: '👶', target: Math.round(r.netShort), date: g.date || MP.isoDate(date), linked: 'family-leave',
      note: 'Covers about ' + MP.money(r.monthlyShort) + ' a month less take-home pay over ' + plural(r.weeks, 'week') + ' of leave. Keep it in easy-access savings.' });
    MP.saveGoals(list);
    MP.log((isNew ? 'Added' : 'Updated') + ' the parental leave fund dream: ' + MP.money(r.netShort));
    MP.toast(isNew ? 'Added to your dreams.' : 'Your parental leave fund is updated.');
  }

  /* ---------- 4. Cost of a new baby ---------- */
  function babyCalc() {
    var b = state.baby, oneOff = 0, monthly = 0, savedByUsed = 0;
    ITEMS.forEach(function (i) {
      var it = b.items[i.key] || { amount: i.def, mode: 'new' }, amt = n(it.amount), f = MODE_FACTOR[it.mode] == null ? 1 : MODE_FACTOR[it.mode];
      oneOff += amt * f; savedByUsed += amt * (1 - f);
    });
    MONTHLY.forEach(function (m) { monthly += n(b.monthly[m.key]); });
    var months = int(b.childcareMonths, 0, 12), childcare = n(b.childcare) * months;
    var year = oneOff + monthly * 12 + childcare;
    var cbYear = (state.cb.children > 1 ? CB.other : CB.eldest) * 52;
    return { oneOff: oneOff, monthly: monthly, childcare: childcare, months: months, year: year, saved: savedByUsed, cbYear: cbYear,
      carseatUsed: (b.items.carseat || {}).mode === 'used' };
  }
  function babyTab(root) {
    var b = state.baby, out = el('div', { id: 'baby-result', 'aria-live': 'polite' });
    function update() { changed(); out.innerHTML = ''; out.appendChild(babyResult()); }
    var rows = ITEMS.map(function (i) {
      var it = b.items[i.key] || (b.items[i.key] = { amount: i.def, mode: 'new' });
      var m = money('baby-' + i.key, it.amount, { 'aria-label': i.label + ', typical cost' });
      bind(m.input, function (v) { it.amount = n(v); update(); });
      var seg = MP.seg(MODES, it.mode || 'new', function (v) { it.mode = v; update(); }, 'How you will get the ' + i.label.toLowerCase());
      seg.classList.add('seg-sm'); seg.id = 'baby-mode-' + i.key;
      return el('div', { class: 'item-row' }, el('span', { class: 'item-name', 'aria-hidden': 'true' }, i.label), m.wrap, seg);
    });
    var monthlyFields = MONTHLY.map(function (mm) {
      var m = money('baby-m-' + mm.key, b.monthly[mm.key]);
      bind(m.input, function (v) { b.monthly[mm.key] = n(v); update(); });
      return MP.field(mm.label, m.wrap, mm.hint);
    });
    var cc = money('baby-childcare', b.childcare), ccm = numInput('baby-childcare-months', b.childcareMonths, { min: '0', max: '12' });
    bind(cc.input, function (v) { b.childcare = n(v); update(); });
    bind(ccm, function (v) { b.childcareMonths = int(v, 0, 12); update(); });
    root.appendChild(el('div', { class: 'split' },
      el('div', { class: 'stack' },
        el('section', { class: 'card', 'aria-labelledby': 'h-baby-items' },
          el('h2', { id: 'h-baby-items' }, 'Things to buy before the birth'),
          el('p', { class: 'small muted' }, 'Typical prices for mid-range new items. Change them, and mark anything you will buy used (we count half price) or be given.'),
          el('div', { class: 'items' }, rows)),
        el('section', { class: 'card', 'aria-labelledby': 'h-baby-monthly' },
          el('h2', { id: 'h-baby-monthly' }, 'Every month'),
          el('div', { class: 'cost-grid' }, monthlyFields),
          el('div', { class: 'grid-2' },
            MP.field('Childcare a month', cc.wrap, 'If you go back to work during the first year.'),
            el('div', { class: 'detail-only' }, MP.field('Months of childcare in the first year', ccm))),
          el('p', { class: 'small muted simple-only', style: { margin: 0 } }, 'Childcare is counted for ' + plural(int(b.childcareMonths, 0, 12), 'month') + ' of the first year.'))),
      out));
    out.appendChild(babyResult());
  }
  function babyResult() {
    var r = babyCalc();
    return el('div', { class: 'stack' },
      el('section', { class: 'card', 'aria-labelledby': 'h-baby-out' },
        el('h2', { id: 'h-baby-out' }, 'The first year'),
        el('div', { class: 'stat', style: { marginBottom: '12px' } }, el('span', { class: 'label' }, 'First-year total'), el('span', { class: 'big-number', id: 'baby-year' }, MP.money(r.year))),
        el('div', { class: 'grid-3 stats' },
          stat('Before the birth', 'baby-oneoff', MP.money(r.oneOff)),
          stat('Each month', 'baby-monthly', MP.money(r.monthly)),
          stat('Childcare', 'baby-childcare-total', MP.money(r.childcare))),
        r.saved > 0 ? el('p', { class: 'small pos', style: { margin: '12px 0 0' } }, 'Buying used and gifts save you about ' + MP.money(r.saved) + '.') : null,
        el('p', { class: 'small', style: { margin: '8px 0 0' } }, 'Child Benefit for this baby would add about ' + MP.money(r.cbYear) + ' a year, which covers ' + Math.round(MP.clamp(r.year ? r.cbYear / r.year : 0, 0, 1) * 100) + '% of this.'),
        el('div', { class: 'row', style: { marginTop: '12px' } },
          el('button', { class: 'btn btn-accent', type: 'button', id: 'baby-dream', disabled: r.year <= 0, onclick: saveBabyDream }, '🍼 Add as a dream'))),
      r.carseatUsed ? el('p', { class: 'callout warning', id: 'baby-carseat' }, el('strong', null, 'Car seats: '), 'only use a second-hand seat from someone you trust who can tell you it has never been in a crash, and that it fits your car. Otherwise buy new.') : null,
      el('section', { class: 'card', 'aria-labelledby': 'h-baby-help' },
        el('h2', { id: 'h-baby-help' }, 'Help you might get'),
        el('ul', { class: 'small tight' },
          el('li', null, el('strong', null, 'Healthy Start: '), 'if you are pregnant or have a child under 4 and get certain benefits, a prepaid card helps buy milk, fruit, vegetables and formula, plus free vitamins.'),
          el('li', null, el('strong', null, 'Sure Start Maternity Grant: '), 'a one-off £500 for your first baby (or a multiple birth) in England, Wales or Northern Ireland if you get certain benefits. Claim from 11 weeks before the due date until the baby is 6 months old.'),
          el('li', null, el('strong', null, 'Best Start Grant (Scotland): '), 'Pregnancy and Baby Payment, plus Best Start Foods, for families on certain benefits.'),
          el('li', null, 'Free NHS prescriptions and dental care while pregnant and for 12 months after the birth, with a maternity exemption certificate from your midwife.'))));
  }
  function saveBabyDream() {
    var r = babyCalc();
    if (r.year <= 0) return;
    var date = new Date(); date.setMonth(date.getMonth() + (A.family === 'expecting' ? 6 : 12));
    var list = MP.goals();
    var g = list.find(function (x) { return x.linked === 'family-baby'; });
    var isNew = !g;
    if (!g) { g = { id: MP.uid(), priority: 1, home: 'easy', rate: null, saved: 0 }; list.push(g); }
    Object.assign(g, { name: g.name || 'New baby', icon: '🍼', target: Math.round(r.year), date: g.date || MP.isoDate(date), linked: 'family-baby',
      note: MP.money(r.oneOff) + ' to buy before the birth, then about ' + MP.money(r.monthly) + ' a month' + (r.childcare ? ' plus ' + MP.money(r.childcare) + ' childcare' : '') + ' in the first year.' });
    MP.saveGoals(list);
    MP.log((isNew ? 'Added' : 'Updated') + ' the new baby dream: ' + MP.money(r.year));
    MP.toast(isNew ? 'Added to your dreams.' : 'Your new baby dream is updated.');
  }

  /* ---------- tips, summary, reset ---------- */
  function howTo() {
    return el('details', { class: 'card' }, el('summary', null, 'How to use this, and tips'),
      el('ul', { class: 'small' },
        el('li', null, 'Start with Child Benefit: your incomes there are also used for Tax-Free Childcare. Switch to Detailed to add pension contributions and your employer\'s maternity scheme.'),
        el('li', null, 'Claim Child Benefit as soon as your baby is born, once you have registered the birth. It can only be backdated 3 months, so a late claim loses money. You can claim online or in the HMRC app.'),
        el('li', null, 'If one of you earns over ' + MP.money(CB.hicbcStart) + ', paying more into a pension lowers your adjusted net income. It can cut the charge and save higher-rate tax at the same time.'),
        el('li', null, 'Healthy Start and the Sure Start Maternity Grant (Best Start in Scotland) help families on lower incomes. Check what you can get on a free benefits calculator.'),
        el('li', null, 'A ', MP.term('jisa', 'Junior ISA'), ' lets family save up to ' + MP.money(UK.R.isa.junior) + ' a year tax-free for a child. Some parents put Child Benefit straight into one. Add it as a dream in Dreams & goals.'),
        el('li', null, 'Apply for Tax-Free Childcare and funded hours on gov.uk before your childcare starts. It can take up to 20 days to be approved.'),
        el('li', null, 'This is guidance, not advice. Figures are for ' + UK.R.taxYear + ' and change each April: check gov.uk before you rely on them.')));
  }
  function saveSummary() {
    var c = cbCalc(), t = tfcCalc(), parts = [];
    if (c.kids > 0) parts.push(c.net > 0 ? 'Child Benefit ' + MP.money(c.net) + '/yr' + (c.charge > 0 ? ' after the charge' : '') : 'Child Benefit all paid back by the charge');
    if (t.topup > 0) parts.push('Tax-Free Childcare ' + MP.money(t.topup));
    MP.summary('family', parts.join(' · ') || 'Family plan started');
  }
  function reset() {
    if (!MP.confirm('Clear everything in Family money and go back to the starting figures? Your dreams are not affected.')) return;
    var tab = state.tab;
    state = defaults(); state.tab = tab;
    MP.set('tools.family', state);
    MP.set('summaries.family', undefined);
    MP.log('Reset the Family money tool');
    render();
    MP.toast('Reset to the starting figures.');
  }

  render();
});
