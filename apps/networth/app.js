/* Net worth tracker: add up what you own and what you owe, and save a snapshot each month to watch
   the trend. Everything lives in the encrypted vault at 'tools.networth'.
   One data model: every figure is an item {id, kind: asset|debt, type, name, value, owner, note, source?, simple?}.
   Simple view edits category totals, which are stored as items, so switching views keeps the data. */
MP.page({ id: 'networth', title: 'Net worth tracker' }).then(function () {
  'use strict';
  var el = MP.el, main = MP.$('#app');

  var ASSETS = {
    current: { label: 'Current account', cat: 'cash' },
    savings: { label: 'Savings', cat: 'cash' },
    cashisa: { label: 'Cash ISA', cat: 'invest' },
    ssisa: { label: 'Stocks & shares ISA', cat: 'invest' },
    lisa: { label: 'Lifetime ISA', cat: 'invest' },
    gia: { label: 'General investments', cat: 'invest' },
    pension: { label: 'Pension', cat: 'pension', locked: true },
    home: { label: 'Home', cat: 'home', locked: true, property: true },
    property: { label: 'Other property', cat: 'other', locked: true, property: true },
    vehicle: { label: 'Vehicle', cat: 'other' },
    crypto: { label: 'Crypto', cat: 'invest' },
    other: { label: 'Other', cat: 'other' }
  };
  var DEBTS = {
    mortgage: { label: 'Mortgage', cat: 'mortgage', secured: true },
    card: { label: 'Credit card', cat: 'debts' },
    loan: { label: 'Personal loan', cat: 'debts' },
    car: { label: 'Car finance', cat: 'debts' },
    student: { label: 'Student loan', cat: 'student' },
    overdraft: { label: 'Overdraft', cat: 'debts' },
    bnpl: { label: 'Buy now, pay later', cat: 'debts' },
    otherdebt: { label: 'Other', cat: 'debts' }
  };
  var OWNERS = { me: 'Me', partner: 'Partner', joint: 'Joint' };
  /* Asset mix groups (for the donut) and the Simple-view totals. */
  var MIX = [
    { cat: 'cash', label: 'Cash & savings', color: '--c1' },
    { cat: 'invest', label: 'ISAs & investments', color: '--c2' },
    { cat: 'pension', label: 'Pensions', color: '--c4' },
    { cat: 'home', label: 'Home', color: '--c3' },
    { cat: 'other', label: 'Other', color: '--c8' }
  ];
  var SIMPLE = [
    { key: 'cash', kind: 'asset', cats: ['cash'], newType: 'savings', label: 'Cash & savings', hint: 'Current accounts and savings accounts.' },
    { key: 'invest', kind: 'asset', cats: ['invest'], newType: 'ssisa', label: 'ISAs & investments', hint: 'Cash ISAs, stocks & shares ISAs, Lifetime ISAs, other investments and crypto.' },
    { key: 'pension', kind: 'asset', cats: ['pension'], newType: 'pension', label: 'Pensions', hint: 'Add up the latest value of every pension pot (from your statements or pension app).' },
    { key: 'home', kind: 'asset', cats: ['home'], newType: 'home', label: 'Home value', hint: 'What your home would sell for today. Leave at 0 if you rent.' },
    { key: 'other', kind: 'asset', cats: ['other'], newType: 'other', label: 'Other things you own', hint: 'For example a car, another property or valuables. Optional.' },
    { key: 'mortgage', kind: 'debt', cats: ['mortgage'], newType: 'mortgage', label: 'Mortgage left to pay', hint: 'The balance on your latest mortgage statement.' },
    { key: 'debts', kind: 'debt', cats: ['debts'], newType: 'otherdebt', label: 'Other debts', hint: 'Credit cards, loans, car finance, overdraft, buy now pay later. Leave out student loans.' }
  ];
  function typeInfo(it) { return (it.kind === 'debt' ? DEBTS : ASSETS)[it.type] || (it.kind === 'debt' ? DEBTS.otherdebt : ASSETS.other); }

  /* ---------- state ---------- */
  function defaults() { return { items: [], snapshots: [], excludeStudent: true, view: 'all' }; }
  var state = (function load() {
    var d = defaults(), s = MP.get('tools.networth', null);
    if (!s || typeof s !== 'object') return d;
    var out = Object.assign(d, s);
    out.items = (Array.isArray(s.items) ? s.items : []).filter(function (i) { return i && (i.kind === 'asset' || i.kind === 'debt'); }).map(function (i) {
      return { id: i.id || MP.uid(), kind: i.kind, type: i.type, name: String(i.name || ''), value: Math.max(0, +i.value || 0), owner: OWNERS[i.owner] ? i.owner : 'me', note: String(i.note || ''), source: i.source || null, simple: i.simple || null };
    });
    out.snapshots = (Array.isArray(s.snapshots) ? s.snapshots : []).filter(function (x) { return x && /^\d{4}-\d{2}$/.test(x.month); });
    out.excludeStudent = s.excludeStudent !== false;
    out.view = s.view === 'mine' ? 'mine' : 'all';
    return out;
  })();
  function save() { MP.set('tools.networth', state); saveSummary(); }

  /* ---------- maths ---------- */
  function share(it, view) { return view === 'mine' ? (it.owner === 'joint' ? 0.5 : it.owner === 'partner' ? 0 : 1) : 1; }
  function counted(it) { return !(it.kind === 'debt' && it.type === 'student' && state.excludeStudent); }
  function totals(view) {
    var t = { assets: 0, liabilities: 0, liquidAssets: 0, liquidDebts: 0, property: 0, mortgage: 0, student: 0, mix: {} };
    MIX.forEach(function (m) { t.mix[m.cat] = 0; });
    state.items.forEach(function (it) {
      var v = (+it.value || 0) * share(it, view), info = typeInfo(it);
      if (it.kind === 'asset') {
        t.assets += v; t.mix[info.cat] = (t.mix[info.cat] || 0) + v;
        if (!info.locked) t.liquidAssets += v;
        if (info.property) t.property += v;
      } else {
        if (it.type === 'student') t.student += v;
        if (!counted(it)) return;
        t.liabilities += v;
        if (info.secured) t.mortgage += v; else t.liquidDebts += v;
      }
    });
    t.net = t.assets - t.liabilities;
    t.liquid = t.liquidAssets - t.liquidDebts;
    t.ltv = t.property > 0 ? t.mortgage / t.property : null;
    t.dta = t.assets > 0 ? t.liabilities / t.assets : null;
    return t;
  }
  function view() { return MP.isDetailed() ? state.view : 'all'; }
  function signed(n) { return (n > 0 ? '+' : n < 0 ? '−' : '') + MP.money(Math.abs(n)); }
  function monthKey(d) { return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0'); }
  function monthsBack(n) { var d = new Date(); d.setDate(1); d.setMonth(d.getMonth() - n); return monthKey(d); }
  function monthLabel(k, short) { var p = k.split('-'); return new Date(+p[0], +p[1] - 1, 1).toLocaleDateString('en-GB', { month: short ? 'short' : 'long', year: short === true ? '2-digit' : 'numeric' }); }
  function snaps() { return state.snapshots.slice().sort(function (a, b) { return a.month < b.month ? -1 : 1; }); }
  /* Compare today's figures with the last snapshot from an earlier month, and with 12 months ago. */
  function changes(net) {
    var list = snaps(), now = monthKey(new Date()), prev = null, year = null, target = monthsBack(12), limit = monthsBack(15);
    list.forEach(function (s) {
      if (s.month < now) prev = s;
      if (s.month <= target && s.month >= limit) year = s;
    });
    return { prev: prev, year: year, sinceLast: prev ? net - prev.net : null, sinceYear: year ? net - year.net : null };
  }

  /* ---------- render ---------- */
  var box = {};
  function render() {
    main.innerHTML = '';
    main.appendChild(el('div', { class: 'row', style: { justifyContent: 'space-between', margin: '6px 0 14px' } },
      el('div', { style: { minWidth: 0, flex: '1 1 320px' } }, el('h1', { style: { margin: 0 } }, 'Net worth tracker'),
        el('p', { class: 'muted', style: { margin: 0 } }, 'Add up what you own and what you owe to see your ', MP.term('net-worth', 'net worth'), ', and watch your wealth grow month by month.')),
      el('button', { class: 'btn', type: 'button', id: 'nw-reset', onclick: reset }, 'Reset')));
    main.appendChild(el('div', null, MP.explain('net-worth', 'Your net worth is everything you own (savings, investments, pensions, your home) minus everything you owe (mortgage, cards, loans). It is a quick way to see if you are moving forward.')));
    if (!state.items.length) main.appendChild(quickStart());

    box.results = el('section', { class: 'card', id: 'results', 'aria-labelledby': 'h-results', 'aria-live': 'polite' });
    box.mix = el('section', { class: 'card', 'aria-labelledby': 'h-mix' });
    box.history = el('section', { class: 'card', id: 'history', 'aria-labelledby': 'h-history' });
    box.simple = el('section', { class: 'card simple-only', id: 'simple-card', 'aria-labelledby': 'h-simple' });
    main.appendChild(box.results);
    main.appendChild(el('div', { class: 'nw-split' },
      el('div', { class: 'stack' }, box.simple, listCard('asset'), listCard('debt'), importCard()),
      el('div', { class: 'stack' }, box.mix)));
    main.appendChild(box.history);
    main.appendChild(el('div', { class: 'stack', style: { marginTop: '16px' } }, howTo(), MP.adviceCard('general')));
    drawSimple(); refresh();
  }
  /* Redraw everything that depends on the figures (not the Simple form, so typing keeps focus). */
  function refresh() { drawResults(); drawMix(); drawHistory(); saveSummary(); }

  function stat(label, value, id, cls, extra) {
    return el('div', { class: 'stat' }, el('span', { class: 'label' }, label), el('span', { class: 'value' + (cls ? ' ' + cls : ''), id: id }, value), extra || null);
  }

  function drawResults() {
    var v = view(), t = totals(v), c = changes(totals('all').net), r = box.results;
    r.innerHTML = '';
    var head = el('div', { class: 'nw-head' },
      el('div', null,
        el('h2', { id: 'h-results', style: { marginBottom: '2px' } }, v === 'mine' ? 'My share of our net worth' : 'Your net worth'),
        el('div', { class: 'big-number ' + (t.net < 0 ? 'neg' : ''), id: 'nw-net' }, (t.net < 0 ? '−' : '') + MP.money(Math.abs(t.net))),
        el('div', { class: 'small muted', id: 'nw-change' }, !state.items.length ? 'Add your figures below to see your net worth.' :
          c.prev ? [v === 'mine' ? 'Whole household: ' : null, el('span', { class: c.sinceLast >= 0 ? 'pos' : 'neg' }, signed(c.sinceLast)), ' since your ' + monthLabel(c.prev.month) + ' snapshot',
            c.year ? [' · ', el('span', { class: c.sinceYear >= 0 ? 'pos' : 'neg' }, signed(c.sinceYear)), ' in 12 months'] : null] :
            'Save a snapshot each month to see how this changes.')),
      el('div', { class: 'detail-only nw-view' }, el('span', { class: 'small muted', id: 'view-label' }, 'Show'),
        MP.seg([{ value: 'all', label: 'Whole household' }, { value: 'mine', label: 'My share' }], state.view, function (val) { state.view = val; save(); refresh(); }, 'Whose money to show')));
    var mineNote = v === 'mine' ? el('p', { class: 'small muted', style: { margin: '8px 0 0' } }, 'My share counts your own items in full, joint items at 50% and leaves out your partner\'s items.') : null;
    var stats = el('div', { class: 'nw-stats' },
      stat('What you own', MP.money(t.assets), 'nw-assets'),
      stat('What you owe', MP.money(t.liabilities), 'nw-liab'),
      stat('Liquid net worth', (t.liquid < 0 ? '−' : '') + MP.money(Math.abs(t.liquid)), 'nw-liquid', t.liquid < 0 ? 'neg' : '', el('span', { class: 'tiny muted' }, 'Without your home, other property and pensions')),
      stat('Home loan to value', t.ltv == null ? '—' : MP.pct(t.ltv, 0), 'nw-ltv', '', el('span', { class: 'tiny muted' }, t.ltv == null ? 'No property added' : 'Mortgage ÷ property value')),
      el('div', { class: 'detail-only' }, stat('Debt to assets', t.dta == null ? '—' : MP.pct(t.dta, 0), 'nw-dta', '', el('span', { class: 'tiny muted' }, 'What you owe ÷ what you own'))));
    var notes = [];
    if (t.student > 0 && state.excludeStudent) notes.push(el('li', null, 'Your student loan (' + MP.money(t.student) + ') is not counted.' + (MP.isDetailed() ? ' You can change this under "What you owe".' : ' You can change this in the Detailed view.')));
    if (t.ltv != null && t.ltv > 1) notes.push(el('li', null, 'You owe more on your mortgage than your property is worth (negative equity). If you are worried, speak to your lender early.'));
    else if (t.ltv != null && t.ltv <= 0.6 && t.mortgage > 0) notes.push(el('li', null, 'A loan to value of 60% or less usually gets the best mortgage rates when you remortgage.'));
    if (t.dta != null && t.dta > 0.8 && t.liquidDebts > t.liquidAssets) notes.push(el('li', null, 'Your debts are high compared with what you own. Paying off the most expensive debt first usually helps most.'));
    r.appendChild(head);
    if (mineNote) r.appendChild(mineNote);
    r.appendChild(stats);
    r.appendChild(el('div', { class: 'beginner-only' },
      MP.explain(null, 'Liquid net worth is money you could reach fairly quickly if you needed it. Pensions are locked until 55 (57 from 2028) and selling a home takes months, so they are left out.'),
      MP.explain('ltv')));
    if (notes.length) r.appendChild(el('ul', { class: 'small nw-notes' }, notes));
    var snapBtn = el('button', { class: 'btn btn-primary', type: 'button', id: 'snap-save', disabled: !state.items.length, onclick: saveSnapshot }, '📅 Save this month\'s snapshot');
    var have = state.snapshots.some(function (s) { return s.month === monthKey(new Date()); });
    r.appendChild(el('div', { class: 'row', style: { marginTop: '14px' } }, snapBtn,
      el('span', { class: 'small muted' }, have ? 'You have a snapshot for ' + monthLabel(monthKey(new Date())) + '. Saving again replaces it.' : 'Do this once a month, for example on payday.')));
  }

  function drawMix() {
    var t = totals(view()), m = box.mix;
    m.innerHTML = '';
    m.appendChild(el('h2', { id: 'h-mix' }, 'Your asset mix'));
    if (t.assets <= 0) { m.appendChild(el('p', { class: 'muted small' }, 'Your asset mix appears here once you add something you own.')); return; }
    m.appendChild(MP.donut({ items: MIX.map(function (x) { return { label: x.label, value: Math.round(t.mix[x.cat] || 0), color: x.color }; }), center: MP.shortMoney(t.assets), label: 'Asset mix' }));
    var biggest = MIX.slice().sort(function (a, b) { return (t.mix[b.cat] || 0) - (t.mix[a.cat] || 0); })[0];
    m.appendChild(el('p', { class: 'small muted', style: { marginTop: '10px' } }, 'Biggest share: ' + biggest.label.toLowerCase() + ', at ' + MP.pct((t.mix[biggest.cat] || 0) / t.assets, 0) + ' of what you own.'));
  }

  /* ---------- Simple view: category totals ---------- */
  function catItems(s) { return state.items.filter(function (it) { return it.kind === s.kind && s.cats.indexOf(typeInfo(it).cat) >= 0; }); }
  function drawSimple() {
    var c = box.simple;
    c.innerHTML = '';
    c.appendChild(el('h2', { id: 'h-simple' }, 'Your totals'));
    c.appendChild(el('p', { class: 'small muted' }, 'Rough figures are fine. Round to the nearest £100 and update them each month.'));
    function group(kind, title) {
      var g = el('fieldset', { class: 'nw-fieldset' }, el('legend', null, title));
      SIMPLE.filter(function (s) { return s.kind === kind; }).forEach(function (s) {
        var list = catItems(s), total = list.reduce(function (a, i) { return a + (+i.value || 0); }, 0);
        var mi = MP.moneyInput({ id: 's-' + s.key, value: total ? Math.round(total * 100) / 100 : '', placeholder: '0' });
        var hint = s.hint;
        if (list.length > 1) { mi.input.disabled = true; hint = 'Made up of ' + list.length + ' items. Switch to the Detailed view to change them.'; }
        mi.input.addEventListener('input', function () { setSimple(s, MP.clamp(MP.num(mi.input.value), 0, 1e10)); });
        g.appendChild(MP.field(s.label, mi.wrap, hint));
      });
      return g;
    }
    c.appendChild(group('asset', 'What you own'));
    c.appendChild(group('debt', 'What you owe'));
    var student = state.items.filter(function (i) { return i.kind === 'debt' && i.type === 'student'; });
    if (student.length) c.appendChild(el('p', { class: 'small muted' }, 'Student loan listed: ' + MP.money(student.reduce(function (a, i) { return a + i.value; }, 0)) + (state.excludeStudent ? ' (not counted).' : ' (counted).')));
    c.appendChild(MP.explain(null, 'Why leave out student loans? They are repaid through your salary only when you earn above a threshold, and anything left is written off after a set time, so they work more like a tax than a normal debt.'));
  }
  function setSimple(s, v) {
    var list = catItems(s);
    if (list.length > 1) return;
    if (!list.length) { if (v > 0) state.items.push({ id: MP.uid(), kind: s.kind, type: s.newType, name: s.label, value: v, owner: 'me', note: '', source: null, simple: s.key }); }
    else if (v === 0 && list[0].simple) state.items = state.items.filter(function (i) { return i !== list[0]; });
    else list[0].value = v;
    save(); refresh();
    var qs = MP.$('#quick-start'); if (qs && state.items.length) qs.remove();
  }

  /* ---------- Detailed view: itemised lists ---------- */
  function listCard(kind) {
    var isDebt = kind === 'debt', items = state.items.filter(function (i) { return i.kind === kind; });
    var total = items.filter(counted).reduce(function (a, i) { return a + i.value; }, 0);
    var card = el('section', { class: 'card detail-only', id: isDebt ? 'debt-card' : 'asset-card', 'aria-labelledby': 'h-' + kind });
    card.appendChild(el('div', { class: 'nw-card-head' }, el('h2', { id: 'h-' + kind, style: { margin: 0 } }, isDebt ? 'What you owe' : 'What you own'),
      el('button', { class: 'btn btn-sm btn-accent', type: 'button', id: isDebt ? 'add-debt' : 'add-asset', onclick: function () { editItem(null, kind); } }, isDebt ? '＋ Add a debt' : '＋ Add something you own')));
    var ul = el('ul', { class: 'nw-list', id: isDebt ? 'debt-list' : 'asset-list' });
    if (!items.length) ul.appendChild(el('li', { class: 'muted small nw-empty' }, isDebt ? 'No debts added. If you have a mortgage, card or loan, add it here.' : 'Nothing added yet. Start with your bank accounts and savings.'));
    items.slice().sort(function (a, b) { return b.value - a.value; }).forEach(function (it) {
      var info = typeInfo(it), off = !counted(it);
      ul.appendChild(el('li', { class: 'nw-item' + (off ? ' off' : ''), dataset: { id: it.id } },
        el('div', { class: 'nw-item-main' },
          el('div', { class: 'nw-item-name' }, it.name || info.label),
          el('div', { class: 'nw-chips' }, el('span', { class: 'chip' }, info.label), it.owner !== 'me' ? el('span', { class: 'chip info' }, OWNERS[it.owner]) : null,
            it.source ? el('span', { class: 'chip', title: 'Imported from another tool' }, '↻ linked') : null, off ? el('span', { class: 'chip warning' }, 'Not counted') : null),
          it.note ? el('div', { class: 'tiny muted nw-note' }, it.note) : null),
        el('div', { class: 'nw-item-side' },
          el('span', { class: 'nw-value' + (isDebt ? ' neg' : '') }, MP.money(it.value)),
          el('div', { class: 'nw-actions' },
            el('button', { class: 'btn btn-sm edit-item', type: 'button', 'aria-label': 'Edit ' + (it.name || info.label), onclick: function () { editItem(it, kind); } }, 'Edit'),
            el('button', { class: 'btn btn-sm btn-ghost delete-item', type: 'button', 'aria-label': 'Delete ' + (it.name || info.label), onclick: function () {
              if (!MP.confirm('Delete "' + (it.name || info.label) + '"?')) return;
              state.items = state.items.filter(function (x) { return x.id !== it.id; }); save(); render();
            } }, 'Delete')))));
    });
    card.appendChild(ul);
    card.appendChild(el('div', { class: 'nw-total' }, el('span', null, 'Total'), el('strong', { id: isDebt ? 'debt-total' : 'asset-total' }, MP.money(total))));
    if (isDebt) {
      var cb = el('input', { type: 'checkbox', id: 'excl-student', checked: state.excludeStudent });
      cb.onchange = function () { state.excludeStudent = cb.checked; save(); render(); };
      card.appendChild(el('label', { class: 'check', style: { marginTop: '8px' } }, cb, 'Leave student loans out of my net worth'));
      card.appendChild(el('p', { class: 'tiny muted', style: { margin: 0 } }, 'UK student loans are repaid through your salary only when you earn over a threshold, and anything left is written off after a set number of years. Many people never repay them in full, so most net worth trackers leave them out.'));
    }
    return card;
  }

  function editItem(it, kind) {
    var isNew = !it, types = kind === 'debt' ? DEBTS : ASSETS;
    it = it ? Object.assign({}, it) : { id: MP.uid(), kind: kind, type: kind === 'debt' ? 'card' : 'savings', name: '', value: '', owner: 'me', note: '', source: null, simple: null };
    var name = el('input', { type: 'text', id: 'i-name', value: it.name, maxlength: 60, placeholder: types[it.type] ? types[it.type].label : '' });
    var type = el('select', { id: 'i-type' }, Object.keys(types).map(function (k) { return el('option', { value: k, selected: it.type === k }, types[k].label); }));
    type.onchange = function () { name.placeholder = types[type.value].label; };
    var value = MP.moneyInput({ id: 'i-value', value: it.value === '' ? '' : it.value, step: '0.01' });
    var owner = el('select', { id: 'i-owner' }, Object.keys(OWNERS).map(function (k) { return el('option', { value: k, selected: it.owner === k }, OWNERS[k]); }));
    var note = el('input', { type: 'text', id: 'i-note', value: it.note, maxlength: 120, placeholder: 'Optional, e.g. 4.5% fixed until 2028' });
    var err = el('p', { class: 'callout danger', hidden: true, role: 'alert' });
    var form = el('form', { novalidate: true },
      el('div', { class: 'grid-2' },
        MP.field('Type', type), MP.field('Name', name, 'Leave blank to use the type.'),
        MP.field(kind === 'debt' ? 'Amount owed' : 'Value today', value.wrap), MP.field('Whose is it?', owner, 'Joint items count 50% in "My share".')),
      MP.field('Note', note),
      it.source ? el('p', { class: 'small muted' }, 'Imported from another tool. Importing again updates this value.') : null,
      err, el('button', { class: 'btn btn-primary', type: 'submit', id: 'i-save' }, isNew ? 'Add' : 'Save changes'));
    var close = MP.modal(form, { title: isNew ? (kind === 'debt' ? 'Add a debt' : 'Add something you own') : 'Edit ' + (it.name || types[it.type].label) });
    form.addEventListener('submit', function (e) {
      e.preventDefault();
      var v = MP.num(value.input.value, NaN);
      if (!isFinite(v) || v < 0 || v > 1e10) { err.textContent = 'Please enter an amount between £0 and £10,000,000,000.'; err.hidden = false; return; }
      Object.assign(it, { type: type.value, name: name.value.trim() || types[type.value].label, value: Math.round(v * 100) / 100, owner: owner.value, note: note.value.trim(), simple: null });
      var i = state.items.findIndex(function (x) { return x.id === it.id; });
      if (i >= 0) state.items[i] = it; else state.items.push(it);
      save(); close(); render();
      MP.toast(isNew ? 'Added.' : 'Saved.');
    });
  }

  /* ---------- quick start ---------- */
  function setupItems() {
    var a = MP.prefs().answers || {}, out = [];
    if (+a.essentialCosts > 0 && +a.savingsMonths > 0) out.push({ kind: 'asset', type: 'savings', name: 'Savings', value: Math.round(a.essentialCosts * a.savingsMonths) });
    if (+a.pensionTotal > 0) out.push({ kind: 'asset', type: 'pension', name: 'Pensions', value: Math.round(+a.pensionTotal) });
    if (+a.homePrice > 0 && a.homeFirst && a.homeFirst !== 'yes') out.push({ kind: 'asset', type: 'home', name: 'Home', value: Math.round(+a.homePrice) });
    if (+a.debtTotal > 0) out.push({ kind: 'debt', type: 'otherdebt', name: 'Debts', value: Math.round(+a.debtTotal) });
    return out;
  }
  function quickStart() {
    var pre = setupItems();
    return el('section', { class: 'card nw-quick', id: 'quick-start', 'aria-labelledby': 'h-quick' },
      el('h2', { id: 'h-quick' }, 'Get started in a minute'),
      el('p', { class: 'small' }, 'Type your rough totals below, bring in figures from your other tools, or look around with example figures first.'),
      el('div', { class: 'row' },
        pre.length ? el('button', { class: 'btn btn-primary', type: 'button', id: 'nw-setup', onclick: function () {
          pre.forEach(function (p) { state.items.push(Object.assign({ id: MP.uid(), owner: 'me', note: 'From your setup answers', source: null, simple: SIMPLE.filter(function (s) { return s.newType === p.type; }).map(function (s) { return s.key; })[0] || null }, p)); });
          save(); render(); MP.toast('Added ' + pre.length + ' figures from your setup answers. Check and update them.');
        } }, 'Use my setup answers (' + pre.map(function (p) { return p.name.toLowerCase(); }).join(', ') + ')') : null,
        el('button', { class: 'btn', type: 'button', id: 'nw-import-q', onclick: importTools }, '↻ Import from my other tools'),
        el('button', { class: 'btn btn-ghost', type: 'button', id: 'nw-example', onclick: example }, 'Try with example figures')));
  }
  function importCard() {
    return el('section', { class: 'card', 'aria-labelledby': 'h-import' },
      el('h2', { id: 'h-import' }, 'Import from my other tools'),
      el('p', { class: 'small muted' }, 'Bring in your pension pots from the Retirement planner, your mortgage and debts from Mortgage & debt, and your emergency savings from Savings & ISAs. You see a preview first.'),
      el('div', { class: 'row' }, el('button', { class: 'btn', type: 'button', id: 'nw-import', onclick: importTools }, '↻ Import'),
        state.items.length ? null : el('button', { class: 'btn btn-ghost', type: 'button', onclick: example }, 'Try with example figures')));
  }

  function debtType(name) {
    var n = String(name || '').toLowerCase();
    return /card/.test(n) ? 'card' : /car|pcp|hire purchase|\bhp\b/.test(n) ? 'car' : /overdraft/.test(n) ? 'overdraft' : /later|bnpl|klarna|clearpay/.test(n) ? 'bnpl' : /student/.test(n) ? 'student' : /loan/.test(n) ? 'loan' : 'otherdebt';
  }
  /* Read the other tools' saved inputs defensively: they may never have been opened, or be from an older version. */
  function candidates() {
    var out = [];
    try {
      var r = MP.get('tools.retirement', null);
      (r && Array.isArray(r.pots) ? r.pots : []).forEach(function (p, i) {
        var v = +p.value || 0; if (v > 0) out.push({ source: 'retirement:' + (p.id || i), kind: 'asset', type: 'pension', name: String(p.name || 'Pension'), value: Math.round(v), from: 'Retirement planner' });
      });
    } catch (e) { }
    try {
      var d = MP.get('tools.debt', null);
      if (d && d.mortgage && +d.mortgage.balance > 0) out.push({ source: 'debt:mortgage', kind: 'debt', type: 'mortgage', name: 'Mortgage', value: Math.round(+d.mortgage.balance), from: 'Mortgage & debt' });
      (d && Array.isArray(d.debts) ? d.debts : []).forEach(function (x, i) {
        var v = +x.balance || 0; if (v > 0) out.push({ source: 'debt:' + (x.id || i), kind: 'debt', type: debtType(x.name), name: String(x.name || 'Debt'), value: Math.round(v), from: 'Mortgage & debt' });
      });
    } catch (e) { }
    try {
      var s = MP.get('tools.savings', null);
      if (s && s.ef && +s.ef.current > 0) out.push({ source: 'savings:ef', kind: 'asset', type: 'savings', name: 'Emergency savings', value: Math.round(+s.ef.current), from: 'Savings & ISAs' });
    } catch (e) { }
    return out;
  }
  function importTools() {
    var list = candidates();
    if (!list.length) {
      MP.modal(el('div', null, el('p', null, 'There is nothing to import yet. Open the Retirement planner, Mortgage & debt or Savings & ISAs tool and enter your figures there first.'),
        el('div', { class: 'row' }, el('a', { class: 'btn', href: '../retirement/index.html' }, 'Retirement planner'), el('a', { class: 'btn', href: '../debt/index.html' }, 'Mortgage & debt'), el('a', { class: 'btn', href: '../savings/index.html' }, 'Savings & ISAs'))), { title: 'Import from my other tools' });
      return;
    }
    var rows = list.map(function (c, i) {
      var have = state.items.filter(function (it) { return it.source === c.source; })[0];
      var same = have && Math.round(have.value) === c.value;
      var cb = el('input', { type: 'checkbox', id: 'imp-' + i, checked: !same, disabled: same, dataset: { i: i } });
      return { c: c, have: have, cb: cb, li: el('li', null, el('label', { class: 'check nw-imp' }, cb,
        el('span', { class: 'nw-imp-text' }, el('strong', null, c.name), ' · ' + MP.money(c.value),
          el('span', { class: 'tiny muted', style: { display: 'block' } }, (c.kind === 'debt' ? DEBTS : ASSETS)[c.type].label + ' from ' + c.from +
            (same ? ' · already in your list' : have ? ' · updates ' + MP.money(have.value) + ' in your list' : ''))))) };
    });
    var form = el('form', null, el('p', { class: 'small muted' }, 'Tick what to add. Items you imported before are updated, not added twice.'),
      el('ul', { class: 'nw-imp-list' }, rows.map(function (r) { return r.li; })),
      el('button', { class: 'btn btn-primary', type: 'submit', id: 'imp-save' }, 'Add ticked items'));
    var close = MP.modal(form, { title: 'Import from my other tools' });
    form.addEventListener('submit', function (e) {
      e.preventDefault();
      var added = 0, updated = 0;
      rows.forEach(function (r) {
        if (!r.cb.checked || r.cb.disabled) return;
        if (r.have) { r.have.value = r.c.value; updated++; }
        else { state.items.push({ id: MP.uid(), kind: r.c.kind, type: r.c.type, name: r.c.name, value: r.c.value, owner: 'me', note: 'From ' + r.c.from, source: r.c.source, simple: null }); added++; }
      });
      save(); close(); render();
      MP.toast(added || updated ? 'Imported: ' + added + ' added, ' + updated + ' updated.' : 'Nothing changed.');
    });
  }

  function example() {
    if (state.items.length && !MP.confirm('Replace your figures and history with example figures? You can press Reset afterwards to start again.')) return;
    function it(kind, type, name, value, owner, note) { return { id: MP.uid(), kind: kind, type: type, name: name, value: value, owner: owner || 'me', note: note || '', source: null, simple: null }; }
    state.items = [
      it('asset', 'current', 'Current account', 2400), it('asset', 'savings', 'Easy-access savings', 8500, 'joint', 'Emergency fund'),
      it('asset', 'cashisa', 'Cash ISA', 6000), it('asset', 'ssisa', 'Stocks & shares ISA', 14200, 'me', 'Global index fund'),
      it('asset', 'pension', 'Workplace pension', 38000), it('asset', 'pension', 'Partner\'s pension', 21000, 'partner'),
      it('asset', 'home', 'Home', 285000, 'joint', 'From the HM Land Registry house price index'), it('asset', 'vehicle', 'Car', 9000, 'joint'),
      it('debt', 'mortgage', 'Mortgage', 176000, 'joint', '4.2% fixed until 2028'), it('debt', 'card', 'Credit card', 1300),
      it('debt', 'car', 'Car finance', 6200, 'joint'), it('debt', 'student', 'Student loan (Plan 2)', 18500)
    ];
    state.excludeStudent = true;
    var t = totals('all'), snapsList = [];
    for (var m = 11; m >= 1; m--) {
      var wobble = [600, -900, 300, 1200, -400, 800, -200, 500, 1000, -700, 300][m - 1];
      var assets = Math.round(t.assets - m * 1450 + wobble), liab = Math.round(t.liabilities + m * 820);
      var d = new Date(); d.setDate(1); d.setMonth(d.getMonth() - m);
      snapsList.push({ month: monthKey(d), date: MP.isoDate(d), assets: assets, liabilities: liab, net: assets - liab, liquid: Math.round(t.liquid - m * 450 + wobble) });
    }
    state.snapshots = snapsList;
    save(); render();
    MP.toast('Example figures loaded. Press Reset to clear them.');
  }

  /* ---------- snapshots ---------- */
  function saveSnapshot() {
    var k = monthKey(new Date()), t = totals('all');
    var i = state.snapshots.findIndex(function (s) { return s.month === k; });
    if (i >= 0 && !MP.confirm('You already saved a snapshot for ' + monthLabel(k) + '. Replace it with today\'s figures?')) return;
    var snap = { month: k, date: MP.isoDate(new Date()), assets: Math.round(t.assets), liabilities: Math.round(t.liabilities), net: Math.round(t.net), liquid: Math.round(t.liquid) };
    if (i >= 0) state.snapshots[i] = snap; else state.snapshots.push(snap);
    save();
    MP.log('Saved a net worth snapshot for ' + monthLabel(k) + ': ' + MP.money(snap.net));
    drawResults(); drawHistory();
    MP.toast('Snapshot saved for ' + monthLabel(k) + '.');
  }
  function drawHistory() {
    var h = box.history, list = snaps();
    h.innerHTML = '';
    h.appendChild(el('div', { class: 'nw-card-head' }, el('h2', { id: 'h-history', style: { margin: 0 } }, 'Your progress'),
      list.length ? el('button', { class: 'btn btn-sm', type: 'button', id: 'nw-export', onclick: exportCsv }, '⬇ Export CSV') : null));
    if (!list.length) { h.appendChild(el('p', { class: 'muted small', style: { marginTop: '10px' } }, 'No snapshots yet. Press "Save this month\'s snapshot" once a month, and your trend appears here.')); return; }
    if (list.length >= 2) {
      var neg = list.some(function (s) { return s.net < 0; });
      h.appendChild(el('div', { style: { marginTop: '12px' } }, MP.lineChart({
        labels: list.map(function (s) { return monthLabel(s.month, true); }),
        series: [{ name: 'Net worth', color: '--c1', values: list.map(function (s) { return s.net; }), area: true },
          { name: 'What you own', color: '--c2', values: list.map(function (s) { return s.assets; }) },
          { name: 'What you owe', color: '--c5', values: list.map(function (s) { return s.liabilities; }), dash: true }],
        label: 'Net worth, assets and debts by month'
      })));
      if (neg) h.appendChild(el('p', { class: 'tiny muted' }, 'Months with a negative net worth show at £0 on the chart. The table has the exact figures.'));
    } else h.appendChild(el('p', { class: 'small muted', style: { marginTop: '10px' } }, 'Save another snapshot next month to start your trend line.'));
    var rows = list.slice().reverse();
    var tbody = el('tbody', null, rows.map(function (s, i) {
      var before = rows[i + 1], ch = before ? s.net - before.net : null;
      return el('tr', { dataset: { month: s.month } },
        el('td', { class: 'nw-month' }, monthLabel(s.month, 'mid')),
        el('td', { class: 'num' }, (s.net < 0 ? '−' : '') + MP.money(Math.abs(s.net))),
        el('td', { class: 'num ' + (ch == null ? '' : ch >= 0 ? 'pos' : 'neg') }, ch == null ? '—' : signed(ch)),
        el('td', { class: 'num detail-only' }, MP.money(s.assets)),
        el('td', { class: 'num detail-only' }, MP.money(s.liabilities)),
        el('td', { class: 'num detail-only' }, s.liquid == null ? '—' : (s.liquid < 0 ? '−' : '') + MP.money(Math.abs(s.liquid))),
        el('td', { class: 'num' }, el('button', { class: 'btn btn-sm btn-ghost', type: 'button', 'aria-label': 'Delete the ' + monthLabel(s.month) + ' snapshot', onclick: function () {
          if (!MP.confirm('Delete the ' + monthLabel(s.month) + ' snapshot?')) return;
          state.snapshots = state.snapshots.filter(function (x) { return x.month !== s.month; }); save(); drawResults(); drawHistory();
        } }, '✕')));
    }));
    h.appendChild(el('div', { class: 'scroll-x', style: { marginTop: '12px' } }, el('table', { class: 'table', id: 'snap-table' },
      el('thead', null, el('tr', null, el('th', null, 'Month'), el('th', { class: 'num' }, 'Net worth'), el('th', { class: 'num' }, 'Change'),
        el('th', { class: 'num detail-only' }, 'Own'), el('th', { class: 'num detail-only' }, 'Owe'), el('th', { class: 'num detail-only' }, 'Liquid'), el('th', null, el('span', { class: 'visually-hidden' }, 'Delete')))),
      tbody)));
  }
  function exportCsv() {
    var rows = [['Month', 'Date saved', 'Net worth', 'Assets', 'Liabilities', 'Liquid net worth']];
    snaps().forEach(function (s) { rows.push([s.month, s.date, s.net, s.assets, s.liabilities, s.liquid == null ? '' : s.liquid]); });
    rows.push([]);
    rows.push(['Item', 'Own or owe', 'Type', 'Owner', 'Value', 'Counted', 'Note']);
    state.items.forEach(function (it) { rows.push([it.name, it.kind === 'debt' ? 'Owe' : 'Own', typeInfo(it).label, OWNERS[it.owner], it.value, counted(it) ? 'Yes' : 'No', it.note]); });
    MP.download('net-worth-' + MP.isoDate(new Date()) + '.csv', MP.csv.stringify(rows), 'text/csv');
  }

  /* ---------- misc ---------- */
  function howTo() {
    return el('details', { class: 'card' }, el('summary', null, 'How to use this, and tips'),
      el('ul', { class: 'small' },
        el('li', null, 'Update your figures once a month, on the same day (payday works well), then press "Save this month\'s snapshot".'),
        el('li', null, 'Use a realistic home value: check recent sales nearby, or the ', el('a', { href: 'https://www.gov.uk/government/collections/uk-house-price-index-reports', target: '_blank', rel: 'noopener' }, 'HM Land Registry house price index'), ' for your area. Asking prices are often higher than what homes sell for.'),
        el('li', null, 'Pensions count towards your net worth but are locked until 55 (57 from April 2028). That is why "liquid net worth" leaves them out, along with property.'),
        el('li', null, 'Focus on the trend, not one month. Markets go up and down; paying down debt and saving regularly push the line up over time.'),
        el('li', null, 'Couples: mark items as yours, your partner\'s or joint, then use "My share" in the Detailed view.'),
        el('li', null, 'Everything stays encrypted on this device. Export a CSV if you want a copy in a spreadsheet.')));
  }
  function reset() {
    if (!MP.confirm('Clear all your figures and snapshots from the net worth tracker?')) return;
    state = defaults();
    MP.set('tools.networth', undefined); MP.set('summaries.networth', undefined);
    render(); MP.toast('Cleared.');
  }
  function saveSummary() {
    if (!state.items.length) { MP.set('summaries.networth', undefined); return; }
    var t = totals('all'), c = changes(t.net), txt = 'Net worth ' + (t.net < 0 ? '−' : '') + MP.money(Math.abs(t.net));
    if (c.prev) txt += ' (' + signed(c.sinceLast) + (c.prev.month === monthsBack(1) ? ' this month' : ' since ' + monthLabel(c.prev.month, true)) + ')';
    MP.summary('networth', txt);
  }

  MP.onPrefs(function () { render(); });
  MP.onTheme(function () { drawMix(); drawHistory(); });
  render();
});
