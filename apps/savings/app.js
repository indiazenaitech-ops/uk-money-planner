/* Savings & ISAs: emergency fund, ISA allowance tracker, savings growth and tax, Lifetime ISA for a first home.
   Everything is saved at 'tools.savings' in the encrypted vault. The emergency fund can be saved as a shared dream. */
MP.page({ id: 'savings', title: 'Savings & ISAs' }).then(function () {
  'use strict';
  var el = MP.el, main = MP.$('#app');
  var ISA = UK.R.isa, SAV = UK.R.savings;

  var COSTS = [
    { key: 'rent', label: 'Rent or mortgage', def: 950 },
    { key: 'council', label: 'Council tax', def: 160 },
    { key: 'energy', label: 'Gas, electricity and water', def: 180 },
    { key: 'food', label: 'Food and household', def: 350 },
    { key: 'transport', label: 'Transport', def: 150 },
    { key: 'insurance', label: 'Insurance', def: 50 },
    { key: 'phone', label: 'Phone and broadband', def: 50 },
    { key: 'childcare', label: 'Childcare', def: 0 },
    { key: 'other', label: 'Other essentials', def: 100 }
  ];
  var TYPES = {
    cash: { label: 'Cash ISA', color: '--c1' },
    ss: { label: 'Stocks & shares ISA', color: '--c2' },
    lisa: { label: 'Lifetime ISA', color: '--c3' },
    ifisa: { label: 'Innovative finance ISA', color: '--c4' }
  };
  var TABS = [
    { key: 'emergency', label: '🛟 Emergency fund' },
    { key: 'isa', label: '📅 ISA allowance' },
    { key: 'growth', label: '📈 Growth & tax' },
    { key: 'lisa', label: '🏡 Lifetime ISA' }
  ];
  var COLORS = ['--c1', '--c2', '--c3', '--c4'];

  function defaults() {
    var costs = {};
    COSTS.forEach(function (c) { costs[c.key] = c.def; });
    return {
      tab: 'emergency',
      ef: { costs: costs, months: '6', current: 2000, monthly: 250, fromGuide: false },
      isa: { deposits: [] },
      growth: { years: 5, salary: null, accounts: [
        { id: MP.uid(), name: 'Easy-access account', start: 5000, monthly: 200, rate: 3.5 },
        { id: MP.uid(), name: 'Regular saver', start: 0, monthly: 200, rate: 5 }
      ] },
      lisa: { age: null, firstTime: true, price: 250000, contrib: 4000, years: 5, rate: 4, saved: 0, fromGuide: false },
      prefill: { ef: false, lisa: false }
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
  var state = merge(defaults(), MP.get('tools.savings', {}));
  if (!TABS.some(function (t) { return t.key === state.tab; })) state.tab = 'emergency';
  if (!Array.isArray(state.isa.deposits)) state.isa.deposits = [];
  if (!Array.isArray(state.growth.accounts)) state.growth.accounts = defaults().growth.accounts;

  var profile = MP.profile();
  var answers = MP.prefs().answers || {};
  var profileDob = profile.dob || answers.dob || '';
  var profileAge = profileDob ? UK.age(profileDob) : null;
  var profileSalary = +profile.salary || 0;

  /* Prefill from the guided setup, once, and only where the inputs are still at their starting values. */
  function applyGuide(st) {
    var d = defaults(), A = MP.prefs().answers || {}, changed = false;
    var costs = +A.essentialCosts > 0 ? +A.essentialCosts : 0, months = A.savingsMonths != null && A.savingsMonths !== '' ? +A.savingsMonths : null;
    var efDefault = st.ef.current === d.ef.current && COSTS.every(function (c) { return +st.ef.costs[c.key] === c.def; });
    if (!st.prefill.ef && efDefault && (costs || months != null)) {
      if (costs) {
        // spread the guide's total across the usual cost lines, keeping the same proportions
        var base = COSTS.reduce(function (a, c) { return a + c.def; }, 0), sum = 0;
        COSTS.forEach(function (c) { if (c.key !== 'other') { st.ef.costs[c.key] = Math.round(c.def * costs / base); sum += st.ef.costs[c.key]; } });
        st.ef.costs.other = Math.max(0, Math.round(costs - sum));
      }
      var monthCost = COSTS.reduce(function (a, c) { return a + n(st.ef.costs[c.key]); }, 0);
      if (months != null && isFinite(months)) st.ef.current = Math.round(monthCost * months);
      st.prefill.ef = true; st.ef.fromGuide = true; changed = true;
    }
    if (!st.prefill.lisa && (A.homeFirst || +A.homePrice > 0 || +A.homeWhen > 0)) {
      if (A.homeFirst && st.lisa.firstTime === d.lisa.firstTime) st.lisa.firstTime = A.homeFirst !== 'no';
      if (+A.homePrice > 0 && st.lisa.price === d.lisa.price) st.lisa.price = Math.round(+A.homePrice);
      if (+A.homeWhen > 0 && st.lisa.years === d.lisa.years) st.lisa.years = MP.clamp(Math.round(+A.homeWhen), 1, 30);
      st.prefill.lisa = true; st.lisa.fromGuide = true; changed = true;
    }
    return changed;
  }
  if (applyGuide(state)) MP.set('tools.savings', state);
  function guideNote(id) { return el('p', { class: 'tiny guide-note', id: id }, '✨ Filled in from your guided setup. Change any figure.'); }

  /* ---------- helpers ---------- */
  function save() { MP.set('tools.savings', state); saveSummary(); }
  function n(v, lo, hi) { var x = MP.num(v); if (!isFinite(x)) x = 0; return MP.clamp(x, lo == null ? 0 : lo, hi == null ? 1e9 : hi); }
  function today0() { var d = new Date(); return new Date(d.getFullYear(), d.getMonth(), d.getDate()); }
  function localDate(iso) { var m = String(iso || '').match(/^(\d{4})-(\d{2})-(\d{2})$/); return m ? new Date(+m[1], +m[2] - 1, +m[3]) : null; }
  /* UK tax year runs 6 April to 5 April. */
  function taxYearOf(d) {
    var y = d.getFullYear();
    if (d < new Date(y, 3, 6)) y--;
    return { start: new Date(y, 3, 6), end: new Date(y + 1, 3, 5), label: y + '/' + String((y + 1) % 100).padStart(2, '0'), startYear: y };
  }
  function age() { return state.lisa.age != null && state.lisa.age !== '' ? +state.lisa.age : (profileAge != null ? profileAge : 30); }
  function salary() { return state.growth.salary != null && state.growth.salary !== '' ? +state.growth.salary : (profileSalary || 35000); }
  function stat(label, id, value, cls) {
    return el('div', { class: 'stat' }, el('span', { class: 'label' }, label), el('span', { class: 'value' + (cls ? ' ' + cls : ''), id: id }, value));
  }
  function numInput(id, value, attrs) {
    return el('input', Object.assign({ type: 'number', id: id, value: value, inputmode: 'decimal', step: 'any', min: '0' }, attrs || {}));
  }
  function money(id, value, attrs) { return MP.moneyInput(Object.assign({ id: id, value: value }, attrs || {})); }
  function detailOnly(node) { node.classList.add('detail-only'); return node; }
  function plural(k, word) { return MP.fmtNum(k) + ' ' + word + (k === 1 ? '' : 's'); }

  /* ---------- page ---------- */
  var panel, tabButtons = {};
  function render() {
    main.innerHTML = '';
    main.appendChild(el('div', { class: 'row', style: { justifyContent: 'space-between', margin: '6px 0 14px' } },
      el('div', null, el('h1', { style: { margin: 0 } }, 'Savings & ISAs'),
        el('p', { class: 'muted', style: { margin: 0 } }, 'Build an emergency fund, use your tax-free ISA allowance, and see how your savings could grow.')),
      el('button', { class: 'btn', type: 'button', id: 'sv-reset', onclick: reset }, 'Reset')));

    var list = el('div', { class: 'tabs', role: 'tablist', 'aria-label': 'Savings sections' });
    TABS.forEach(function (t, i) {
      var b = el('button', { type: 'button', role: 'tab', id: 'tab-' + t.key, 'aria-controls': 'sv-panel', 'aria-selected': String(t.key === state.tab), tabindex: t.key === state.tab ? '0' : '-1',
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
    panel = el('div', { id: 'sv-panel', role: 'tabpanel' });
    main.appendChild(panel);
    main.appendChild(el('div', { style: { marginTop: '16px' } }, howTo()));
    drawPanel();
    saveSummary();
  }
  function selectTab(key) {
    state.tab = key; save();
    TABS.forEach(function (t) { var b = tabButtons[t.key]; b.setAttribute('aria-selected', String(t.key === key)); b.tabIndex = t.key === key ? 0 : -1; });
    drawPanel();
  }
  var redrawChart = null;
  function drawPanel() {
    panel.innerHTML = '';
    panel.setAttribute('aria-labelledby', 'tab-' + state.tab);
    redrawChart = null;
    ({ emergency: emergencyTab, isa: isaTab, growth: growthTab, lisa: lisaTab })[state.tab](panel);
  }
  MP.onTheme(function () { if (redrawChart) redrawChart(); });
  // the Growth chart and headline depend on Simple/Detailed, and advice cards on the advice preference
  MP.onPrefs(function () { if (panel) drawPanel(); });

  /* ---------- 1. Emergency fund ---------- */
  function efCalc() {
    var ef = state.ef;
    var sum = COSTS.reduce(function (a, c) { return a + n(ef.costs[c.key]); }, 0);
    var months = +ef.months || 6, target = sum * months, current = n(ef.current), monthly = n(ef.monthly);
    var gap = Math.max(0, target - current);
    var toGo = gap <= 0 ? 0 : monthly > 0 ? Math.ceil(gap / monthly - 1e-9) : null;
    return { sum: sum, months: months, target: target, current: current, monthly: monthly, gap: gap, toGo: toGo, progress: target ? MP.clamp(current / target, 0, 1) : 0 };
  }
  function emergencyTab(root) {
    var ef = state.ef, out = el('div', { 'aria-live': 'polite', id: 'ef-result' });
    function update() { if (ef.fromGuide) { ef.fromGuide = false; var gn = MP.$('#ef-guide-note'); if (gn) gn.remove(); } save(); out.innerHTML = ''; out.appendChild(efResult()); }
    var costFields = COSTS.map(function (c) {
      var m = money('ef-' + c.key, ef.costs[c.key]);
      m.input.addEventListener('input', function () { ef.costs[c.key] = n(m.input.value); update(); });
      return MP.field(c.label, m.wrap);
    });
    var current = money('ef-current', ef.current), monthly = money('ef-monthly', ef.monthly);
    current.input.addEventListener('input', function () { ef.current = n(current.input.value); update(); });
    monthly.input.addEventListener('input', function () { ef.monthly = n(monthly.input.value); update(); });
    var seg = MP.seg([{ value: '3', label: '3 months' }, { value: '6', label: '6 months' }], String(ef.months), function (v) { ef.months = v; update(); }, 'How many months of costs');
    seg.id = 'ef-months';

    root.appendChild(el('div', { class: 'split' },
      el('section', { class: 'card', 'aria-labelledby': 'h-ef-costs' },
        el('h2', { id: 'h-ef-costs' }, 'Your essential monthly costs'),
        MP.explain('emergency-fund'),
        el('p', { class: 'small muted' }, 'Only the bills you must pay if your income stopped. Leave out treats and subscriptions you could cancel.'),
        ef.fromGuide ? guideNote('ef-guide-note') : null,
        el('div', { class: 'cost-grid' }, costFields)),
      el('div', { class: 'stack' },
        el('section', { class: 'card', 'aria-labelledby': 'h-ef-plan' },
          el('h2', { id: 'h-ef-plan' }, 'Your safety net'),
          el('div', { class: 'field' }, el('span', { class: 'label' }, 'How many months to cover?'), seg,
            el('span', { class: 'hint' }, '3 months is a good start. Aim for 6 if you are self-employed, have children, or your income varies.')),
          el('div', { class: 'grid-2' },
            MP.field('Emergency savings you have now', current.wrap),
            MP.field('You can save each month', monthly.wrap)),
          out),
        el('section', { class: 'callout' }, el('p', null, el('strong', null, 'Where to keep it: '),
          'an easy-access savings account or easy-access ', MP.term('cash-isa', 'cash ISA'), ', separate from your current account, so you can reach it in a day or two but are not tempted to spend it.'),
          MP.explain(null, 'Is my money safe? Savings at UK banks and building societies are protected by the FSCS up to £120,000 per person, per banking licence, if the bank fails.')))));
    out.appendChild(efResult());
  }
  function efResult() {
    var r = efCalc();
    var done = new Date(); done.setMonth(done.getMonth() + (r.toGo || 0));
    return el('div', null,
      el('div', { class: 'stat', style: { marginBottom: '10px' } }, el('span', { class: 'label' }, 'Your target (' + MP.money(r.sum) + ' a month × ' + r.months + ')'),
        el('span', { class: 'big-number', id: 'ef-target' }, MP.money(r.target))),
      el('div', { class: 'progress', role: 'progressbar', 'aria-label': 'Emergency fund progress', 'aria-valuemin': 0, 'aria-valuemax': 100, 'aria-valuenow': Math.round(r.progress * 100) },
        el('span', { style: { width: r.progress * 100 + '%' } })),
      el('p', { class: 'small muted', style: { margin: '4px 0 12px' } }, Math.round(r.progress * 100) + '% of the way there'),
      el('div', { class: 'grid-3 stats' },
        stat('Still to save', 'ef-gap', MP.money(r.gap)),
        stat('Months to reach it', 'ef-months-to', r.gap <= 0 ? 'Done 🎉' : r.toGo == null ? '—' : MP.fmtNum(r.toGo)),
        stat('Reached by', 'ef-date', r.gap <= 0 ? 'Now' : r.toGo == null ? '—' : done.toLocaleDateString('en-GB', { month: 'short', year: 'numeric' }))),
      r.gap > 0 && r.toGo == null ? el('p', { class: 'callout warning', style: { marginTop: '12px' } }, 'Add how much you can save each month to see when you will get there.') :
        r.gap <= 0 && r.target > 0 ? el('p', { class: 'callout success', style: { marginTop: '12px' } }, 'Your safety net is in place. Extra savings could go towards your other dreams or your ISA.') :
          r.toGo > 24 ? el('p', { class: 'callout warning', style: { marginTop: '12px' } }, 'That is over 2 years. Start with 1 month of costs (' + MP.money(r.sum) + ') as a first milestone, then keep going.') : null,
      el('div', { class: 'row', style: { marginTop: '14px' } },
        el('button', { class: 'btn btn-accent', type: 'button', id: 'ef-save-dream', disabled: r.target <= 0, onclick: saveDream }, '🛟 Save as a dream')));
  }
  function saveDream() {
    var r = efCalc();
    if (r.target <= 0) return;
    var date = new Date(); date.setMonth(date.getMonth() + Math.max(1, r.toGo || 12));
    var list = MP.goals();
    var g = list.find(function (x) { return x.linked === 'savings-emergency'; }) || list.find(function (x) { return x.icon === '🛟'; });
    var isNew = !g;
    if (!g) { g = { id: MP.uid(), priority: 1, home: 'easy', rate: null }; list.push(g); }
    Object.assign(g, { name: g.name || 'Emergency fund', icon: '🛟', target: Math.round(r.target), saved: r.current, date: MP.isoDate(date), monthly: r.monthly || '',
      linked: 'savings-emergency', note: r.months + ' months of essential costs (' + MP.money(r.sum) + ' a month). Keep it in easy-access savings.' });
    MP.saveGoals(list);
    MP.log((isNew ? 'Added' : 'Updated') + ' the emergency fund dream: ' + MP.money(r.target));
    MP.toast(isNew ? 'Added to your dreams.' : 'Your emergency fund dream is updated.');
  }

  /* ---------- 2. ISA allowance ---------- */
  function isaCalc() {
    var ty = taxYearOf(today0()), by = { cash: 0, ss: 0, lisa: 0, ifisa: 0 }, used = 0;
    state.isa.deposits.forEach(function (d) {
      var dt = localDate(d.date);
      if (!dt || dt < ty.start || dt > ty.end) return;
      var a = +d.amount || 0;
      by[d.type] = (by[d.type] || 0) + a; used += a;
    });
    var daysLeft = Math.round((ty.end - today0()) / 864e5) + 1;
    return { ty: ty, by: by, used: used, remaining: Math.max(0, ISA.annual - used), over: Math.max(0, used - ISA.annual), lisaLeft: Math.max(0, ISA.lifetime - by.lisa), daysLeft: daysLeft };
  }
  function isaTab(root) {
    var ty = taxYearOf(today0());
    var type = el('select', { id: 'isa-type' }, Object.keys(TYPES).map(function (k) { return el('option', { value: k }, TYPES[k].label); }));
    var amt = money('isa-amount', '', { step: '0.01', placeholder: '0' });
    var date = el('input', { type: 'date', id: 'isa-date', value: MP.isoDate(today0()) });
    var err = el('p', { class: 'callout danger', role: 'alert', hidden: true });
    var out = el('div', { id: 'isa-result', 'aria-live': 'polite' });
    var listBox = el('div', { id: 'isa-list-box' });
    function update() { out.innerHTML = ''; out.appendChild(isaResult()); listBox.innerHTML = ''; listBox.appendChild(depositList(update)); }
    var form = el('form', { id: 'isa-form', novalidate: true, onsubmit: function (e) {
      e.preventDefault();
      var a = MP.num(amt.input.value), dt = localDate(date.value);
      err.hidden = true;
      if (!(a > 0) || a > 1e7) { err.textContent = 'Please enter an amount above £0.'; err.hidden = false; return; }
      if (!dt) { err.textContent = 'Please choose the date you paid in.'; err.hidden = false; return; }
      if (dt > today0()) { err.textContent = 'That date is in the future. Record deposits once you have made them.'; err.hidden = false; return; }
      state.isa.deposits.push({ id: MP.uid(), type: type.value, amount: Math.round(a * 100) / 100, date: date.value });
      save();
      MP.log('Recorded ' + MP.money(a, true) + ' paid into a ' + TYPES[type.value].label);
      amt.input.value = '';
      update();
      MP.toast('Deposit added.');
    } },
      el('div', { class: 'grid-2' }, MP.field('Type of ISA', type), MP.field('Amount paid in', amt.wrap)),
      detailOnly(MP.field('Date paid in', date, 'Tax year ' + ty.label + ' runs from ' + MP.fmtDate(ty.start) + ' to ' + MP.fmtDate(ty.end) + '.')),
      el('p', { class: 'small muted simple-only' }, 'We record it as paid in today. Switch to Detailed view to choose another date.'),
      err,
      el('button', { class: 'btn btn-primary', type: 'submit', id: 'isa-add' }, '＋ Add deposit'));

    root.appendChild(el('div', { class: 'split' },
      el('div', { class: 'stack' },
        el('section', { class: 'card', 'aria-labelledby': 'h-isa-add' }, el('h2', { id: 'h-isa-add' }, 'Record a payment into an ', MP.term('isa', 'ISA')), MP.explain('isa'), form),
        el('section', { class: 'card detail-only', 'aria-labelledby': 'h-isa-rules' }, el('h2', { id: 'h-isa-rules' }, 'The rules in brief'),
          el('ul', { class: 'small tight' },
            el('li', null, 'You can put up to ' + MP.money(ISA.annual) + ' into ISAs each tax year, split across any types.'),
            el('li', null, 'A Lifetime ISA takes up to ' + MP.money(ISA.lifetime) + ' a year, and that counts towards the ' + MP.money(ISA.annual) + '.'),
            el('li', null, 'Unused allowance does not roll over. It resets on 6 April.'),
            el('li', null, 'Taking money out does not give you the allowance back, unless your ISA is "flexible" and you pay it back in the same tax year.'),
            el('li', null, 'Transfers between ISAs do not use allowance. Ask your new provider to transfer it, rather than withdrawing yourself.')))),
      el('div', { class: 'stack' }, el('section', { class: 'card', 'aria-labelledby': 'h-isa-used' }, el('h2', { id: 'h-isa-used' }, 'Your allowance for ' + ty.label), out), listBox)));
    update();
  }
  function isaResult() {
    var r = isaCalc(), pc = MP.clamp(r.used / ISA.annual, 0, 1), a = age(), notes = [];
    if (r.over > 0) notes.push(el('p', { class: 'callout danger', id: 'isa-warn-over' }, 'You are ' + MP.money(r.over, true) + ' over the ' + MP.money(ISA.annual) + ' limit. Contact your ISA provider soon: HMRC may ask them to remove the extra and any interest or growth on it.'));
    if (r.by.lisa > ISA.lifetime) notes.push(el('p', { class: 'callout danger', id: 'isa-warn-lisa' }, 'You have paid ' + MP.money(r.by.lisa, true) + ' into a Lifetime ISA. The most you can pay in is ' + MP.money(ISA.lifetime) + ' a tax year, so ' + MP.money(r.by.lisa - ISA.lifetime, true) + ' is too much.'));
    if (r.by.lisa > 0 && a >= ISA.lifetimeContribMaxAge) notes.push(el('p', { class: 'callout warning' }, 'You cannot pay into a Lifetime ISA from age ' + ISA.lifetimeContribMaxAge + '.'));
    var capApplies = r.ty.startYear >= 2027;
    if (capApplies && a < 65 && r.by.cash > ISA.cashCapFrom2027) notes.push(el('p', { class: 'callout danger' }, 'From 6 April 2027 people under 65 can put up to ' + MP.money(ISA.cashCapFrom2027) + ' a year into cash ISAs. You have paid in ' + MP.money(r.by.cash, true) + '.'));
    if (!capApplies) notes.push(el('p', { class: 'callout small' }, 'Coming up: from 6 April 2027, people under 65 can put up to ' + MP.money(ISA.cashCapFrom2027) + ' a year into cash ISAs. The overall ' + MP.money(ISA.annual) + ' limit stays the same, so the rest can go into stocks and shares.'));
    if (r.remaining > 0 && r.daysLeft <= 60) notes.push(el('p', { class: 'callout warning' }, 'Only ' + plural(r.daysLeft, 'day') + ' left to use this year\'s allowance. Anything unused is lost on 6 April.'));
    var bars = Object.keys(TYPES).filter(function (k) { return r.by[k] > 0; }).map(function (k) { return { label: TYPES[k].label, value: r.by[k], color: TYPES[k].color }; });
    return el('div', null,
      el('div', { class: 'stat' }, el('span', { class: 'label' }, 'Used so far'),
        el('span', { class: 'big-number' }, el('span', { id: 'isa-used' }, MP.money(r.used)), el('span', { class: 'of muted' }, ' of ' + MP.money(ISA.annual)))),
      el('div', { class: 'progress isa-bar' + (r.over > 0 ? ' over' : ''), role: 'progressbar', 'aria-label': 'ISA allowance used', 'aria-valuemin': 0, 'aria-valuemax': 100, 'aria-valuenow': Math.round(pc * 100) },
        el('span', { style: { width: pc * 100 + '%' } })),
      el('div', { class: 'grid-3 stats', style: { marginTop: '14px' } },
        stat('Left to use', 'isa-remaining', MP.money(r.remaining, r.remaining % 1 !== 0), r.over > 0 ? 'neg' : 'pos'),
        stat('Lifetime ISA room', 'isa-lisa-left', MP.money(r.lisaLeft, r.lisaLeft % 1 !== 0)),
        stat('Days left this tax year', 'isa-days', MP.fmtNum(r.daysLeft))),
      bars.length ? el('ul', { class: 'isa-split detail-only', 'aria-label': 'ISA payments by type' }, bars.map(function (b) {
        return el('li', null, el('span', { class: 'isa-split-name' }, el('i', { class: 'dot', style: { background: MP.css(b.color) }, 'aria-hidden': 'true' }), b.label),
          el('strong', null, MP.money(b.value, b.value % 1 !== 0)),
          el('span', { class: 'progress', 'aria-hidden': 'true' }, el('span', { style: { width: MP.clamp(b.value / ISA.annual, 0, 1) * 100 + '%', background: MP.css(b.color) } })));
      })) : null,
      notes.length ? el('div', { class: 'stack', style: { marginTop: '14px' } }, notes) : null);
  }
  function depositList(update) {
    var ty = taxYearOf(today0());
    var deps = state.isa.deposits.slice().sort(function (a, b) { return String(b.date).localeCompare(String(a.date)); });
    var sec = el('section', { class: 'card', 'aria-labelledby': 'h-isa-list' }, el('h2', { id: 'h-isa-list' }, 'Your deposits'));
    if (!deps.length) { sec.appendChild(el('p', { class: 'muted', id: 'isa-empty' }, 'No deposits yet. Add each payment into an ISA to keep track of your allowance.')); return sec; }
    sec.appendChild(el('div', { class: 'scroll-x' }, el('table', { class: 'table', id: 'isa-list' },
      el('thead', null, el('tr', null, el('th', null, 'Date'), el('th', null, 'Type'), el('th', { class: 'num' }, 'Amount'), el('th', null, el('span', { class: 'visually-hidden' }, 'Actions')))),
      el('tbody', null, deps.map(function (d) {
        var dt = localDate(d.date), inYear = dt && dt >= ty.start && dt <= ty.end;
        return el('tr', { dataset: { id: d.id } },
          el('td', { class: 'nowrap' }, MP.fmtDate(dt), inYear ? null : el('div', null, el('span', { class: 'chip' }, taxYearOf(dt || today0()).label))),
          el('td', null, (TYPES[d.type] || TYPES.cash).label),
          el('td', { class: 'num' }, MP.money(d.amount, d.amount % 1 !== 0)),
          el('td', { class: 'num' }, el('button', { class: 'btn btn-sm btn-ghost isa-del', type: 'button', title: 'Delete', 'aria-label': 'Delete ' + MP.money(d.amount) + ' ' + (TYPES[d.type] || TYPES.cash).label + ' deposit', onclick: function () {
            if (!MP.confirm('Delete this deposit of ' + MP.money(d.amount, true) + '?')) return;
            state.isa.deposits = state.isa.deposits.filter(function (x) { return x.id !== d.id; });
            save(); MP.log('Deleted an ISA deposit of ' + MP.money(d.amount, true)); update();
          } }, '✕')));
      })))));
    sec.appendChild(el('p', { class: 'tiny muted', style: { margin: '8px 0 0' } }, 'Deposits from earlier tax years are kept for your records but do not count towards this year.'));
    return sec;
  }

  /* ---------- 3. Growth & tax ---------- */
  function savingsTaxInfo(sal) {
    var pa = UK.personalAllowance(sal), band = UK.taxBand(sal);
    var psa = band === 'additional' ? SAV.psaAdditional : band === 'higher' ? SAV.psaHigher : SAV.psaBasic;
    var unusedPA = Math.max(0, pa - sal);
    var starting = Math.max(0, SAV.startingRateBand - Math.max(0, sal - pa));
    var rate = band === 'additional' ? 0.45 : band === 'higher' ? 0.40 : 0.20;
    return { band: band, psa: psa, unusedPA: unusedPA, starting: starting, rate: rate, taxFree: unusedPA + starting + psa };
  }
  function growthCalc(acc, years, info) {
    var fv = UK.futureValue({ start: n(acc.start), monthly: n(acc.monthly), years: years, rate: n(acc.rate, 0, 30) / 100 });
    var tax = 0, s = fv.series;
    for (var i = 1; i < s.length; i++) {
      var interest = (s[i].balance - s[i - 1].balance) - (s[i].paid - s[i - 1].paid);
      tax += Math.max(0, interest - info.taxFree) * info.rate;
    }
    return { fv: fv, interest: fv.growth, tax: tax, firstYear: s.length > 1 ? (s[1].balance - s[0].balance) - (s[1].paid - s[0].paid) : 0 };
  }
  function growthTab(root) {
    var g = state.growth;
    var years = numInput('gr-years', g.years, { min: '1', max: '40', step: '1', inputmode: 'numeric' });
    var sal = money('gr-salary', salary());
    var out = el('div', { id: 'gr-result', 'aria-live': 'polite' }), accBox = el('div', { class: 'stack' });
    function update() { save(); out.innerHTML = ''; out.appendChild(growthResult()); }
    years.addEventListener('input', function () { g.years = Math.round(n(years.value, 1, 40)) || 1; update(); });
    sal.input.addEventListener('input', function () { g.salary = n(sal.input.value); update(); });
    function drawAccounts() {
      accBox.innerHTML = '';
      var simple = !MP.isDetailed();
      g.accounts.forEach(function (a, i) {
        var name = el('input', { type: 'text', id: 'gr-name-' + i, value: a.name, maxlength: 40 });
        var start = money('gr-start-' + i, a.start), monthly = money('gr-monthly-' + i, a.monthly);
        var rate = numInput('gr-rate-' + i, a.rate, { step: '0.05', max: '30' });
        name.addEventListener('input', function () { a.name = name.value; update(); });
        start.input.addEventListener('input', function () { a.start = n(start.input.value); update(); });
        monthly.input.addEventListener('input', function () { a.monthly = n(monthly.input.value); update(); });
        rate.addEventListener('input', function () { a.rate = n(rate.value, 0, 30); update(); });
        accBox.appendChild(el('fieldset', { class: 'acc' + (i > 0 ? ' detail-only' : ''), style: { borderInlineStartColor: MP.css(COLORS[i % 4]) } },
          el('legend', null, simple && i === 0 ? 'Your savings' : 'Account ' + (i + 1)),
          detailOnly(MP.field('Name', name)),
          el('div', { class: 'acc-grid' }, MP.field('Start with', start.wrap), MP.field('Add monthly', monthly.wrap), MP.field('Interest (AER %)', rate)),
          g.accounts.length > 1 ? el('button', { class: 'btn btn-sm btn-ghost detail-only', type: 'button', 'aria-label': 'Remove ' + (a.name || 'account ' + (i + 1)), onclick: function () {
            g.accounts.splice(i, 1); drawAccounts(); update();
          } }, 'Remove') : null));
      });
      if (g.accounts.length < 4) accBox.appendChild(el('button', { class: 'btn btn-sm detail-only', type: 'button', id: 'gr-add', onclick: function () {
        g.accounts.push({ id: MP.uid(), name: 'Account ' + (g.accounts.length + 1), start: 0, monthly: 100, rate: 4 }); drawAccounts(); update();
      } }, '＋ Compare another account'));
    }
    drawAccounts();
    root.appendChild(el('div', { class: 'split' },
      el('section', { class: 'card', 'aria-labelledby': 'h-gr-in' }, el('h2', { id: 'h-gr-in' }, el('span', { class: 'detail-only' }, 'Compare savings accounts'), el('span', { class: 'simple-only' }, 'How your savings could grow')),
        el('p', { class: 'small muted' }, 'Use the interest rate shown as the ', MP.term('aer', 'AER'), ' on the account.'),
        MP.field('Years to save', years),
        detailOnly(MP.field('Your yearly income before tax', sal.wrap, profileSalary ? 'From About you. Change it here to try other figures.' : 'Add your salary in About you on the home page, or type it here.')),
        accBox),
      out));
    update();
  }
  function growthResult() {
    var g = state.growth, years = Math.round(n(g.years, 1, 40)) || 1, sal = salary(), info = savingsTaxInfo(sal);
    var rows = g.accounts.map(function (a) { return { a: a, r: growthCalc(a, years, info) }; });
    var detailed = MP.isDetailed(), shown = detailed ? rows : rows.slice(0, 1), first = rows[0];
    var bandName = { none: 'below the Personal Allowance', basic: 'a basic-rate taxpayer', higher: 'a higher-rate taxpayer', additional: 'an additional-rate taxpayer' }[info.band];
    var labels = []; for (var y = 0; y <= years; y++) labels.push(y === 0 ? 'Now' : y + 'y');
    function chart() {
      var narrow = main.clientWidth < 560;
      return MP.lineChart({ labels: labels, width: narrow ? 380 : 640, height: narrow ? 240 : 280, label: 'Savings growth over ' + years + ' years',
        series: shown.map(function (x, i) { return { name: detailed ? (x.a.name || 'Account ' + (i + 1)) : 'Your savings', color: COLORS[i % 4], values: x.r.fv.series.map(function (p) { return p.balance; }), area: shown.length === 1 }; }) });
    }
    var chartBox = el('div', { id: 'gr-chart' }, chart());
    redrawChart = function () { chartBox.innerHTML = ''; chartBox.appendChild(chart()); };
    var best = rows.reduce(function (b, x) { return !b || x.r.fv.balance > b.r.fv.balance ? x : b; }, null);
    var totalTax = rows.reduce(function (s, x) { return s + x.r.tax; }, 0);
    var headline = first ? el('div', { class: 'simple-only', id: 'gr-headline' },
      el('div', { class: 'stat' }, el('span', { class: 'label' }, 'Your savings could grow to'), el('span', { class: 'big-number', id: 'gr-simple-balance' }, MP.money(first.r.fv.balance))),
      el('p', { class: 'small', style: { margin: '6px 0 0' } }, 'You pay in ' + MP.money(first.r.fv.paid) + ' and earn about ' + MP.money(first.r.interest) + ' in interest, if the rate stays at ' + MP.pct(n(first.a.rate, 0, 30) / 100, 2).replace(/(\.\d)0%$/, '$1%') + '.'),
      MP.explain('compound-interest'),
      el('p', { class: 'small muted', style: { margin: '6px 0 0' } }, 'You can earn ' + MP.money(info.taxFree) + ' of interest a year tax-free (your ', MP.term('psa', 'Personal Savings Allowance'),
        ' and other allowances). In an ISA, all of it is tax-free. Switch to Detailed view to compare accounts and see the tax.')) : null;
    return el('div', { class: 'stack' },
      el('section', { class: 'card', 'aria-labelledby': 'h-gr-out' }, el('h2', { id: 'h-gr-out' }, 'After ' + plural(years, 'year')),
        headline,
        el('div', { class: 'scroll-x detail-only' }, el('table', { class: 'table', id: 'gr-table' },
          el('thead', null, el('tr', null, el('th', null, 'Account'), el('th', { class: 'num' }, 'Final balance'), el('th', { class: 'num' }, 'You paid in'), el('th', { class: 'num' }, 'Interest'), el('th', { class: 'num' }, 'Tax if not in an ISA'))),
          el('tbody', null, rows.map(function (x, i) {
            return el('tr', null,
              el('td', null, el('i', { class: 'dot', style: { background: MP.css(COLORS[i % 4]) }, 'aria-hidden': 'true' }), x.a.name || 'Account ' + (i + 1)),
              el('td', { class: 'num gr-balance' }, el('strong', null, MP.money(x.r.fv.balance))),
              el('td', { class: 'num' }, MP.money(x.r.fv.paid)),
              el('td', { class: 'num gr-interest pos' }, MP.money(x.r.interest)),
              el('td', { class: 'num gr-tax' + (x.r.tax > 0.5 ? ' neg' : '') }, MP.money(x.r.tax)));
          })))),
        best && rows.length > 1 ? el('p', { class: 'small muted detail-only', style: { margin: '10px 0 0' } }, best.a.name + ' ends highest, assuming the rate stays the same. Rates on most accounts change over time.') : null,
        chartBox),
      el('section', { class: 'card detail-only', 'aria-labelledby': 'h-gr-tax' }, el('h2', { id: 'h-gr-tax' }, 'Tax on your interest'),
        el('p', null, 'With an income of ' + MP.money(sal) + ' you are ' + bandName + '.'),
        el('div', { class: 'grid-3 stats' },
          stat('Personal Savings Allowance', 'gr-psa', MP.money(info.psa)),
          stat('Starting rate for savings', 'gr-starting', MP.money(info.starting)),
          stat('Interest you can earn tax-free each year', 'gr-taxfree', MP.money(info.taxFree))),
        el('div', { class: 'grid-2', style: { marginTop: '14px' } },
          el('div', { class: 'panel' }, el('div', { class: 'stat' }, el('span', { class: 'label' }, 'Estimated tax outside an ISA, all accounts'), el('span', { class: 'value' + (totalTax > 0.5 ? ' neg' : ''), id: 'gr-tax-out' }, MP.money(totalTax)))),
          el('div', { class: 'panel' }, el('div', { class: 'stat' }, el('span', { class: 'label' }, 'Tax inside an ISA'), el('span', { class: 'value pos', id: 'gr-tax-in' }, MP.money(0))))),
        el('p', { class: 'small muted', style: { marginTop: '12px' } },
          'Interest above your tax-free amount is taxed at ' + MP.pct(info.rate, 0) + '. Each account is worked out on its own, but your allowance covers the interest from all your non-ISA accounts together. ' +
          'The starting rate for savings (up to ' + MP.money(SAV.startingRateBand) + ') only helps if your other income is under ' + MP.money(UK.R.personalAllowance + SAV.startingRateBand) + '. ' +
          'Savings interest is taxed at these UK rates in Scotland too. We assume your income and the interest rate stay the same.')),
      MP.adviceCard('investments'));
  }

  /* ---------- 4. Lifetime ISA ---------- */
  function lisaCalc() {
    var L = state.lisa, a = age(), contrib = n(L.contrib, 0, 1e6), years = Math.round(n(L.years, 0, 40)), rate = n(L.rate, 0, 30) / 100;
    var allowed = Math.min(contrib, ISA.lifetime), extra = Math.max(0, contrib - ISA.lifetime);
    var payYears = Math.max(0, Math.min(years, ISA.lifetimeContribMaxAge - Math.max(a, 18)));
    var bonusYear = allowed * ISA.lifetimeBonus;
    var withBonus = UK.futureValue({ start: n(L.saved), monthly: allowed * (1 + ISA.lifetimeBonus) / 12, years: payYears, rate: rate });
    var tail = years - payYears;
    var withBal = withBonus.balance * Math.pow(1 + rate / 12, tail * 12);
    var without = UK.futureValue({ start: n(L.saved), monthly: allowed / 12, years: payYears, rate: rate });
    var withoutBal = without.balance * Math.pow(1 + rate / 12, tail * 12);
    var price = n(L.price);
    return { age: a, contrib: contrib, allowed: allowed, extra: extra, years: years, payYears: payYears, bonusYear: bonusYear, totalBonus: bonusYear * payYears,
      withBal: withBal, withoutBal: withoutBal, paid: n(L.saved) + allowed * payYears, price: price,
      canOpen: a >= 18 && a <= ISA.lifetimeOpenMaxAge, priceOk: price <= ISA.lifetimeHousePriceCap, firstTime: !!L.firstTime,
      penaltyPot: withBal * (1 - ISA.lifetimeWithdrawalCharge) };
  }
  function lisaTab(root) {
    var L = state.lisa;
    var ageIn = numInput('lisa-age', age(), { min: '16', max: '80', step: '1', inputmode: 'numeric' });
    var first = el('input', { type: 'checkbox', id: 'lisa-first', checked: !!L.firstTime });
    var price = money('lisa-price', L.price), contrib = money('lisa-contrib', L.contrib, { max: '4000' }), saved = money('lisa-saved', L.saved);
    var years = numInput('lisa-years', L.years, { min: '1', max: '30', step: '1', inputmode: 'numeric' });
    var rate = numInput('lisa-rate', L.rate, { step: '0.1', max: '15' });
    var out = el('div', { id: 'lisa-result', 'aria-live': 'polite' });
    function update(initial) { if (L.fromGuide && initial !== true) { L.fromGuide = false; var gn = MP.$('#lisa-guide-note'); if (gn) gn.remove(); } save(); out.innerHTML = ''; out.appendChild(lisaResult()); }
    ageIn.addEventListener('input', function () { L.age = Math.round(n(ageIn.value, 0, 120)); update(); });
    first.addEventListener('change', function () { L.firstTime = first.checked; update(); });
    price.input.addEventListener('input', function () { L.price = n(price.input.value); update(); });
    contrib.input.addEventListener('input', function () { L.contrib = n(contrib.input.value); update(); });
    saved.input.addEventListener('input', function () { L.saved = n(saved.input.value); update(); });
    years.addEventListener('input', function () { L.years = Math.round(n(years.value, 0, 40)); update(); });
    rate.addEventListener('input', function () { L.rate = n(rate.value, 0, 30); update(); });
    root.appendChild(el('div', { class: 'split' },
      el('section', { class: 'card', 'aria-labelledby': 'h-lisa-in' }, el('h2', { id: 'h-lisa-in' }, 'Saving for your first home'),
        MP.explain('lisa'),
        L.fromGuide ? guideNote('lisa-guide-note') : null,
        el('div', { class: 'grid-2' },
          MP.field('Your age', ageIn, profileAge != null ? 'From your date of birth.' : null),
          MP.field('Years until you buy', years)),
        el('label', { class: 'check' }, first, 'I have never owned a home, in the UK or abroad'),
        MP.field('Price of the home you hope to buy', price.wrap, 'Lifetime ISA limit: ' + MP.money(ISA.lifetimeHousePriceCap) + ' anywhere in the UK.'),
        MP.field('You will pay in each year', contrib.wrap, 'Up to ' + MP.money(ISA.lifetime) + ' a year (' + MP.money(ISA.lifetime / 12, true) + ' a month).'),
        el('div', { class: 'grid-2 detail-only' },
          MP.field('Already in a Lifetime ISA', saved.wrap),
          MP.field('Growth or interest (% a year)', rate, 'Cash or invested; not guaranteed.'))),
      out));
    update(true);
  }
  function lisaResult() {
    var r = lisaCalc(), msgs = [];
    if (r.age < 18) msgs.push(el('p', { class: 'callout warning', id: 'lisa-elig' }, 'You can open a Lifetime ISA from age 18. Until then, a Junior ISA or regular savings account can help you get started.'));
    else if (r.age > ISA.lifetimeOpenMaxAge && r.age < ISA.lifetimeContribMaxAge) msgs.push(el('p', { class: 'callout warning', id: 'lisa-elig' }, 'You must open a Lifetime ISA before your 40th birthday. If you opened one before then, you can keep paying in until you are 50. Otherwise compare the regular saving figure.'));
    else if (r.age >= ISA.lifetimeContribMaxAge) msgs.push(el('p', { class: 'callout danger', id: 'lisa-elig' }, 'You cannot pay into a Lifetime ISA from age 50. The regular saving figure is the one to use.'));
    else msgs.push(el('p', { class: 'callout success', id: 'lisa-elig' }, 'At ' + r.age + ' you can open a Lifetime ISA. You can pay in and get the bonus until you are 50.'));
    if (!r.firstTime) msgs.push(el('p', { class: 'callout danger' }, 'The home bonus is only for first-time buyers. If you have owned a home before, you could only use a Lifetime ISA for retirement (from age 60).'));
    if (!r.priceOk) msgs.push(el('p', { class: 'callout danger', id: 'lisa-price-warn' }, 'This home costs more than ' + MP.money(ISA.lifetimeHousePriceCap) + '. You would pay the 25% withdrawal charge to use the money, unless you buy a cheaper home.'));
    if (r.extra > 0) msgs.push(el('p', { class: 'callout warning' }, 'Only ' + MP.money(ISA.lifetime) + ' a year gets the bonus. The other ' + MP.money(r.extra) + ' could go into another ISA; it is not included below.'));
    if (r.years < 1) msgs.push(el('p', { class: 'callout warning' }, 'Your Lifetime ISA must be open for at least 12 months before you can use it to buy a home.'));
    if (r.payYears < r.years) msgs.push(el('p', { class: 'callout small' }, 'You can only pay in until age 50, so we count ' + plural(r.payYears, 'year') + ' of payments.'));
    var eligible = r.canOpen && r.priceOk && r.firstTime && r.years >= 1;
    return el('div', { class: 'stack' },
      el('section', { class: 'card', 'aria-labelledby': 'h-lisa-out' }, el('h2', { id: 'h-lisa-out' }, 'In ' + plural(r.years, 'year')),
        el('div', { class: 'grid-2' },
          el('div', { class: 'panel lisa-pot' + (eligible ? ' good' : '') }, el('div', { class: 'stat' }, el('span', { class: 'label' }, 'Lifetime ISA, with the bonus'), el('span', { class: 'value big', id: 'lisa-with' }, MP.money(r.withBal)))),
          el('div', { class: 'panel' }, el('div', { class: 'stat' }, el('span', { class: 'label' }, 'Regular saving, same rate'), el('span', { class: 'value big', id: 'lisa-without' }, MP.money(r.withoutBal))))),
        el('div', { class: 'grid-3 stats detail-only', style: { marginTop: '14px' } },
          stat('Government bonus each year', 'lisa-bonus-year', MP.money(r.bonusYear), 'pos'),
          stat('Total bonus', 'lisa-bonus-total', MP.money(r.totalBonus), 'pos'),
          stat('Extra from the bonus', 'lisa-diff', MP.money(r.withBal - r.withoutBal), 'pos')),
        el('p', { class: 'small muted', style: { margin: '12px 0 0' } }, 'You pay in ' + MP.money(r.paid) + ' yourself. The bonus is 25% of what you pay in, up to ' + MP.money(ISA.lifetime * ISA.lifetimeBonus) + ' a year. It is added monthly and grows too.')),
      el('div', { class: 'stack', id: 'lisa-msgs' }, msgs),
      el('section', { class: 'card', 'aria-labelledby': 'h-lisa-pen' }, el('h2', { id: 'h-lisa-pen' }, 'If you take money out for anything else'),
        el('p', null, 'Before 60, taking money out for anything other than a first home (or terminal illness) costs a 25% charge on the whole amount. That takes back the bonus and some of your own money too.'),
        el('div', { class: 'panel detail-only' },
          el('p', { class: 'small', style: { margin: 0 } }, 'You pay in £1,000 and get a £250 bonus: £1,250. Take it out and the 25% charge is £312.50, so you get back £937.50. You have lost £62.50 of your own money, which is 6.25%.')),
        el('p', { class: 'small muted', style: { margin: '10px 0 0' } }, 'With your figures, ' + MP.money(r.withBal) + ' would shrink to ' + MP.money(r.penaltyPot) + ' after the charge, compared with ' + MP.money(r.withoutBal) + ' saved normally. If you might not buy a home, a regular cash or stocks and shares ISA keeps your money flexible.')),
      MP.adviceCard('investments'));
  }

  /* ---------- tips, summary, reset ---------- */
  function howTo() {
    return el('details', { class: 'card' }, el('summary', null, 'How to use this, and tips'),
      el('ul', { class: 'small' },
        el('li', null, 'Start with the Emergency fund tab. Once you have a safety net, use the ISA tabs to plan longer-term saving. Press "Save as a dream" to track it alongside your other goals.'),
        el('li', null, 'Your savings are protected by the FSCS up to £120,000 per person, per banking licence. Some brands share one banking licence, so check before you split money between them. The FSCS website has a checker.'),
        el('li', null, 'Easy-access accounts let you take money out any time, but the rate can change. Fixed-term accounts (or bonds) usually pay more for locking money away for a set time. Notice accounts need you to give, for example, 30 to 120 days\' warning before taking money out.'),
        el('li', null, 'Regular savers often pay a higher rate, but only on a set monthly amount (for example up to a few hundred pounds) for 12 months. Interest is paid on a growing balance, so you earn less than the headline rate suggests over the year.'),
        el('li', null, 'Premium Bonds from NS&I are backed by the Treasury. Prizes are tax-free, but there is no guaranteed return: you might win nothing, and the "prize fund rate" is an average, not what you will get.'),
        el('li', null, 'Since April 2024 you can pay into more than one ISA of the same type in a year (but only one Lifetime ISA). Keep a note of every payment here so you do not go over the limit.'),
        el('li', null, 'Compare rates on the AER (Annual Equivalent Rate), which lets you compare accounts that pay interest at different times. Check whether a rate includes a short-term bonus.')));
  }
  function saveSummary() {
    var r = isaCalc(), e = efCalc(), parts = [];
    if (r.used > 0) parts.push('ISA: ' + MP.money(r.used) + ' of ' + MP.money(ISA.annual) + ' used');
    if (e.target > 0) parts.push('Emergency fund ' + Math.round(e.progress * 100) + '% of ' + MP.money(e.target));
    MP.summary('savings', parts.join(' · ') || 'Savings plan started');
  }
  function reset() {
    if (!MP.confirm('Clear all your savings plans and ISA deposits in this tool? Your dreams are not affected.')) return;
    var tab = state.tab;
    state = defaults(); state.tab = tab;
    applyGuide(state);
    MP.set('tools.savings', state);
    MP.set('summaries.savings', undefined);
    MP.log('Reset the Savings & ISAs tool');
    render();
    MP.toast('Reset to the starting figures.');
  }

  render();
});
