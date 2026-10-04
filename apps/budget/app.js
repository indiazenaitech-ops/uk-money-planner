/* Budget from statements: read bank statement files on this device and see where the money goes.
   Files are read with FileReader (PDFs with pdf.js) and never uploaded. Transactions are kept in the
   encrypted vault at 'tools.budget'. Parsers and the categoriser live in parsers.js (window.BudgetParsers). */
MP.page({ id: 'budget', title: 'Budget from statements' }).then(function () {
  'use strict';
  var el = MP.el, main = MP.$('#app'), P = window.BudgetParsers;
  var MAX_TX = 5000, MAX_BYTES = 20 * 1024 * 1024, PAGE = 100;

  var CAT = {
    'Groceries': { color: '--bc-groceries', icon: '🛒' },
    'Eating out & takeaway': { color: '--bc-eating', icon: '🍔' },
    'Transport': { color: '--bc-transport', icon: '🚆' },
    'Bills & utilities': { color: '--bc-bills', icon: '💡' },
    'Housing': { color: '--bc-housing', icon: '🏠' },
    'Subscriptions': { color: '--bc-subs', icon: '🔁' },
    'Shopping': { color: '--bc-shopping', icon: '🛍️' },
    'Entertainment': { color: '--bc-fun', icon: '🎬' },
    'Health & fitness': { color: '--bc-health', icon: '💪' },
    'Cash': { color: '--bc-cash', icon: '💷' },
    'Transfers & savings': { color: '--bc-transfer', icon: '🏦' },
    'Income': { color: '--bc-income', icon: '💰' },
    'Other': { color: '--bc-other', icon: '❓' }
  };
  var NOT_SPENDING = { 'Income': 1, 'Transfers & savings': 1 };
  var FLEX = { 'Eating out & takeaway': 1, 'Shopping': 1, 'Entertainment': 1, 'Groceries': 1, 'Cash': 1, 'Other': 1 };
  var SPEND_CATS = P.CATS.filter(function (c) { return !NOT_SPENDING[c]; });

  var state = MP.get('tools.budget', {});
  state.tx = Array.isArray(state.tx) ? state.tx : [];
  state.rules = state.rules || {};
  state.limits = state.limits || {};
  var ui = { cat: 'all', q: '', shown: PAGE, msgs: [], lastChange: null };

  /* ---------- helpers ---------- */
  function monthKey(iso) { return String(iso).slice(0, 7); }
  function monthLabel(key, short) {
    var p = key.split('-'), d = new Date(+p[0], +p[1] - 1, 1);
    return d.toLocaleDateString('en-GB', { month: short ? 'short' : 'long', year: short ? '2-digit' : 'numeric' });
  }
  function months() {
    var seen = {};
    state.tx.forEach(function (t) { seen[monthKey(t.date)] = 1; });
    return Object.keys(seen).sort();
  }
  function round2(n) { return Math.round(n * 100) / 100; }
  function txIn(list) { return round2(list.reduce(function (a, t) { return a + (t.amount > 0 ? t.amount : 0); }, 0)); }
  function txOut(list) { return round2(list.reduce(function (a, t) { return a + (t.amount < 0 ? -t.amount : 0); }, 0)); }
  function forMonth(m) { return m === 'all' ? state.tx : state.tx.filter(function (t) { return monthKey(t.date) === m; }); }
  function byCategory(list) {
    var sums = {};
    list.forEach(function (t) { if (t.amount < 0) sums[t.cat] = (sums[t.cat] || 0) - t.amount; });
    return sums;
  }
  function currentMonth() {
    var ms = months();
    if (state.month === 'all' && ms.length) return 'all';
    if (ms.indexOf(state.month) < 0) state.month = ms[ms.length - 1] || '';
    return state.month;
  }
  function sortTx() { state.tx.sort(function (a, b) { return a.date < b.date ? 1 : a.date > b.date ? -1 : 0; }); }

  function save() {
    MP.set('tools.budget', { tx: state.tx, rules: state.rules, limits: state.limits, month: state.month, sample: !!state.sample });
    var ms = months();
    if (!state.tx.length) { MP.set('summaries.budget', undefined); return; }
    var avg = (txIn(state.tx) - txOut(state.tx)) / ms.length;
    MP.summary('budget', (avg >= 0 ? 'Avg ' + MP.money(avg) + ' left over a month' : 'Avg ' + MP.money(-avg) + ' overspent a month') + ' (' + ms.length + (ms.length === 1 ? ' month)' : ' months)'));
  }

  /* ---------- importing ---------- */
  /* Add transactions, skipping ones already stored. Counting matching keys means two real £3.50 coffees on
     the same day in one file are both kept, but importing the same file again adds nothing. */
  function addTransactions(list, src) {
    var have = {};
    state.tx.forEach(function (t) { var k = P.txKey(t); have[k] = (have[k] || 0) + 1; });
    var added = 0, dupes = 0;
    list.forEach(function (t) {
      var k = P.txKey(t);
      if (have[k]) { have[k]--; dupes++; return; }
      state.tx.push({ date: t.date, desc: t.desc, amount: t.amount, cat: P.categorise(t.desc, t.amount, state.rules), src: src });
      added++;
    });
    sortTx();
    var dropped = 0;
    if (state.tx.length > MAX_TX) { dropped = state.tx.length - MAX_TX; state.tx = state.tx.slice(0, MAX_TX); }
    return { added: added, dupes: dupes, dropped: dropped };
  }

  function readFile(file) {
    var name = file.name || 'file';
    if (file.size > MAX_BYTES) return Promise.reject(new Error('This file is too big (over 20 MB). Download a shorter date range.'));
    if (/\.pdf$/i.test(name) || file.type === 'application/pdf') {
      return MP.files.pdfText(file).then(function (pages) {
        var r = P.parsePDFText(pages);
        r.warning = 'PDF reading is best effort. Please check the dates and amounts below.';
        return r;
      });
    }
    return MP.files.text(file).then(function (text) {
      var r = P.parseText(name, text);
      if (!r.needsMap) return r;
      return askMapping(name, r.rows, r.guess).then(function (map) {
        if (!map) return { kind: 'csv', tx: [], cancelled: true };
        return { kind: 'csv', tx: P.rowsToTx(r.rows, map) };
      });
    });
  }

  function importFiles(files) {
    files = Array.prototype.slice.call(files || []);
    if (!files.length) return Promise.resolve();
    if (state.sample) { state.tx = []; state.sample = false; }
    ui.msgs = [{ kind: 'info', text: 'Reading ' + files.length + (files.length === 1 ? ' file' : ' files') + ' on this device…' }];
    showMessages();
    var msgs = [], total = 0;
    return files.reduce(function (p, file) {
      return p.then(function () {
        return readFile(file).then(function (r) {
          if (r.cancelled) { msgs.push({ kind: 'warning', text: file.name + ': skipped. No columns were chosen.' }); return; }
          if (r.error) { msgs.push({ kind: 'danger', text: file.name + ': ' + r.error }); return; }
          if (!r.tx.length) { msgs.push({ kind: 'danger', text: file.name + ': we could not find any transactions in this file. Check it is a statement export (CSV, OFX, QFX, QIF or PDF).' }); return; }
          var res = addTransactions(r.tx, file.name);
          total += res.added;
          msgs.push({ kind: res.added ? 'success' : 'info', text: file.name + ': ' + res.added + ' transaction' + (res.added === 1 ? '' : 's') + ' added' +
            (res.dupes ? ', ' + res.dupes + ' already here so skipped' : '') + '.' + (res.dropped ? ' We keep the newest ' + MP.fmtNum(MAX_TX) + ' transactions, so ' + res.dropped + ' older ones were left out.' : '') });
          if (r.warning) msgs.push({ kind: 'warning', text: r.warning });
        }).catch(function (e) {
          console.warn(e);
          msgs.push({ kind: 'danger', text: (file.name || 'File') + ': ' + (e && e.message && /PDF|big|internet/i.test(e.message) ? e.message : 'sorry, we could not read this file. It may be damaged or in a format we do not know.') });
        });
      });
    }, Promise.resolve()).then(function () {
      if (total) {
        state.month = monthKey(state.tx[0].date);
        MP.log('Budget: imported ' + total + ' transaction' + (total === 1 ? '' : 's') + ' from ' + files.length + (files.length === 1 ? ' file' : ' files'));
      }
      ui.msgs = msgs; ui.shown = PAGE;
      save(); render();
    });
  }

  function loadSample() {
    if (state.tx.length && !state.sample && !MP.confirm('Replace your transactions with sample data? Your own data will be removed.')) return;
    state.tx = []; state.sample = true;
    var r = P.parseText('sample-statement.csv', window.BUDGET_SAMPLE());
    var res = addTransactions(r.tx, 'sample-statement.csv');
    state.month = monthKey(state.tx[0].date);
    ui.msgs = [{ kind: 'info', text: 'Showing ' + res.added + ' sample transactions over 3 months. Add your own statement files to replace them.' }];
    ui.shown = PAGE; ui.cat = 'all'; ui.q = '';
    MP.log('Budget: tried the sample statement');
    save(); render();
  }

  /* Column chooser for CSV files without recognisable headings. Resolves to a column map or null. */
  function askMapping(name, rows, guess) {
    return new Promise(function (resolve) {
      var done = false, cols = Math.max.apply(null, rows.slice(0, 20).map(function (r) { return r.length; }));
      var firstIsHead = guess.headerRow === 0;
      function colOptions(sel, allowNone) {
        var opts = allowNone ? [el('option', { value: '-1' }, '(none)')] : [];
        for (var i = 0; i < cols; i++) {
          var ex = String((rows[firstIsHead ? 1 : 0] || [])[i] || '').slice(0, 24);
          var head = firstIsHead ? String(rows[0][i] || '').slice(0, 20) : '';
          opts.push(el('option', { value: i, selected: i === sel }, 'Column ' + (i + 1) + (head ? ' "' + head + '"' : '') + (ex ? ' e.g. ' + ex : '')));
        }
        return opts;
      }
      var dateSel = el('select', { id: 'map-date' }, colOptions(guess.date, false));
      var descSel = el('select', { id: 'map-desc' }, colOptions(guess.desc, false));
      var amtSel = el('select', { id: 'map-amount' }, colOptions(guess.amount, true));
      var outSel = el('select', { id: 'map-out' }, colOptions(-1, true));
      var inSel = el('select', { id: 'map-in' }, colOptions(-1, true));
      var head = el('input', { type: 'checkbox', id: 'map-head', checked: firstIsHead });
      var flip = el('input', { type: 'checkbox', id: 'map-flip' });
      var err = el('p', { class: 'callout danger', hidden: true, role: 'alert' });
      var preview = el('div', { class: 'scroll-x' }, el('table', { class: 'table small' }, el('tbody', null, rows.slice(0, 4).map(function (r) {
        return el('tr', null, r.slice(0, 8).map(function (c) { return el('td', null, String(c).slice(0, 28)); }));
      }))));
      var form = el('form', { id: 'map-form', novalidate: true },
        el('p', { class: 'small' }, 'We could not tell which columns are which in ', el('strong', null, name), '. Pick them below. Here are the first rows:'),
        preview,
        el('div', { class: 'grid-2', style: { marginTop: '12px' } },
          MP.field('Date', dateSel), MP.field('Description', descSel),
          MP.field('Amount (one column)', amtSel, 'Money out as minus numbers'),
          el('div', null, MP.field('Or: paid out', outSel), MP.field('and paid in', inSel))),
        el('label', { class: 'check' }, head, 'The first row is headings'),
        el('label', { class: 'check' }, flip, 'Spending shows as plus numbers (common on credit cards)'),
        err,
        el('div', { class: 'row', style: { marginTop: '8px' } },
          el('button', { class: 'btn btn-primary', type: 'submit', id: 'map-ok' }, 'Use these columns')));
      var close = MP.modal(form, { title: 'Which column is which?', onClose: function () { if (!done) { done = true; resolve(null); } } });
      form.addEventListener('submit', function (e) {
        e.preventDefault();
        var map = { headerRow: head.checked ? 0 : -1, date: +dateSel.value, desc: +descSel.value, amount: +amtSel.value, out: +outSel.value, in: +inSel.value, balance: -1, flip: flip.checked };
        if (map.amount < 0 && map.out < 0 && map.in < 0) { err.textContent = 'Please choose an amount column, or paid out and paid in columns.'; err.hidden = false; return; }
        if (!P.rowsToTx(rows, map).length) { err.textContent = 'No transactions found with these columns. Check the date and amount columns.'; err.hidden = false; return; }
        done = true; resolve(map); close();
      });
    });
  }

  /* ---------- analysis ---------- */
  function recurring() {
    var ms = months(), groups = {};
    if (ms.length < 2) return [];
    state.tx.forEach(function (t) {
      if (t.amount >= 0) return;
      var k = P.merchant(t.desc);
      (groups[k] = groups[k] || []).push(t);
    });
    var list = [];
    Object.keys(groups).forEach(function (k) {
      var g = groups[k], seen = {};
      g.forEach(function (t) { seen[monthKey(t.date)] = 1; });
      var nMonths = Object.keys(seen).length;
      if (nMonths < 2 || g.length > nMonths * 1.5) return;
      var amts = g.map(function (t) { return -t.amount; }).sort(function (a, b) { return a - b; });
      var median = amts[Math.floor(amts.length / 2)];
      if (amts[amts.length - 1] > amts[0] * 1.3 + 1) return;
      // payments should be roughly a month apart
      var dates = g.map(function (t) { return new Date(t.date); }).sort(function (a, b) { return a - b; });
      for (var i = 1; i < dates.length; i++) { var gap = (dates[i] - dates[i - 1]) / 864e5; if (gap < 20 || gap > 45) return; }
      var cats = {}; g.forEach(function (t) { cats[t.cat] = (cats[t.cat] || 0) + 1; });
      var cat = Object.keys(cats).sort(function (a, b) { return cats[b] - cats[a]; })[0];
      list.push({ merchant: k, desc: g[0].desc, cat: cat, amount: median, yearly: median * 12, last: dates[dates.length - 1] });
    });
    return list.sort(function (a, b) { return b.yearly - a.yearly; });
  }

  function averages() {
    var ms = months(), n = ms.length || 1;
    var inn = txIn(state.tx), out = txOut(state.tx), cats = byCategory(state.tx);
    Object.keys(cats).forEach(function (c) { cats[c] /= n; });
    return { months: ms.length, inn: inn / n, out: out / n, left: (inn - out) / n, cats: cats };
  }

  /* ---------- render ---------- */
  function render() {
    main.innerHTML = '';
    main.appendChild(el('div', { style: { margin: '6px 0 14px' } },
      el('h1', { style: { margin: 0 } }, 'Budget from statements'),
      el('p', { class: 'muted', style: { margin: 0 } }, 'Read your bank statement files on this device and see where your money goes each month.')));
    var has = state.tx.length > 0;
    var wrap = el('div', { class: 'stack' });
    wrap.appendChild(importCard(has));
    if (has) {
      var m = currentMonth(), list = forMonth(m);
      wrap.appendChild(controls(m));
      wrap.appendChild(totals(m, list));
      wrap.appendChild(el('div', { class: 'grid-2' }, donutCard(m, list), trendCard()));
      wrap.appendChild(el('div', { class: 'grid-2' }, insightsCard(m, list), limitsCard(m, list)));
      wrap.appendChild(recurringCard());
      wrap.appendChild(txCard(m, list));
    }
    wrap.appendChild(howTo());
    main.appendChild(wrap);
    showMessages();
  }

  function importCard(has) {
    var zone = el('div', { class: 'dropzone bd-drop', id: 'dropzone' },
      el('div', { class: 'bd-drop-ico', 'aria-hidden': 'true' }, '📄'),
      el('p', { class: 'bd-drop-title' }, 'Drop statement files here'),
      el('p', { class: 'small muted' }, 'CSV, OFX, QFX, QIF or PDF. You can add several months at once.'),
      el('div', { class: 'row', style: { justifyContent: 'center' } },
        el('button', { class: 'btn btn-primary', type: 'button', id: 'import-btn', onclick: function () {
          MP.files.pick('.csv,.txt,.ofx,.qfx,.qif,.pdf,text/csv,application/pdf', true).then(importFiles);
        } }, '＋ Choose files'),
        el('button', { class: 'btn', type: 'button', id: 'sample-btn', onclick: loadSample }, 'Try with sample data')));
    MP.files.dropzone(zone, importFiles);
    var files = {};
    state.tx.forEach(function (t) { files[t.src] = 1; });
    var nFiles = Object.keys(files).length;
    return el('section', { class: 'card', 'aria-labelledby': 'h-import', id: 'import-card' },
      el('h2', { id: 'h-import' }, has ? 'Add more statements' : 'Add your bank statements'),
      el('p', { class: 'callout success bd-privacy', id: 'privacy-note' }, el('strong', null, '🔒 Your files stay on this device. '),
        'They are read by your browser and never uploaded to us or anyone else. Transactions are saved encrypted in your account on this device.'),
      zone,
      el('p', { class: 'tiny muted', style: { marginTop: '8px' } }, 'PDF reading is best effort and needs internet the first time. CSV or OFX files are more accurate, so use them if your bank offers them.'),
      el('div', { id: 'import-msg', 'aria-live': 'polite' }),
      has ? el('p', { class: 'small', style: { margin: '10px 0 0' } }, el('strong', { id: 'tx-total' }, MP.fmtNum(state.tx.length)), ' transactions saved' +
        (state.sample ? ' (sample data)' : ' from ' + nFiles + (nFiles === 1 ? ' file' : ' files')) + ', covering ' + months().length + (months().length === 1 ? ' month.' : ' months.')) : null);
  }

  function showMessages() {
    var box = MP.$('#import-msg');
    if (!box) return;
    box.innerHTML = '';
    ui.msgs.forEach(function (m) { box.appendChild(el('p', { class: 'callout small ' + (m.kind === 'info' ? '' : m.kind), style: { marginTop: '10px' } }, m.text)); });
  }

  function controls(m) {
    var ms = months();
    var sel = el('select', { id: 'month', 'aria-label': 'Month to show' },
      ms.slice().reverse().map(function (k) { return el('option', { value: k, selected: k === m }, monthLabel(k)); }),
      ms.length > 1 ? el('option', { value: 'all', selected: m === 'all' }, 'All months (' + ms.length + ')') : null);
    sel.onchange = function () { state.month = sel.value; ui.shown = PAGE; save(); render(); };
    return el('div', { class: 'row bd-controls no-print' },
      el('div', { class: 'bd-month' }, el('label', { for: 'month', class: 'bd-month-label' }, 'Month'), sel),
      el('span', { class: 'mp-spacer' }),
      el('button', { class: 'btn btn-sm', type: 'button', id: 'export-btn', onclick: exportCSV }, '⬇ Export CSV'),
      el('button', { class: 'btn btn-sm btn-danger', type: 'button', id: 'clear-btn', onclick: clearAll }, 'Clear all data'));
  }

  function totals(m, list) {
    var inn = txIn(list), out = txOut(list), left = round2(inn - out), n = m === 'all' ? months().length : 1;
    var saved = byCategory(list)['Transfers & savings'] || 0;
    function stat(label, id, val, cls, sub) {
      return el('div', { class: 'card stat bd-total' }, el('span', { class: 'label' }, label),
        el('span', { class: 'value big-number ' + (cls || ''), id: id }, MP.money(val, true)),
        sub ? el('span', { class: 'tiny muted' }, sub) : null);
    }
    return el('section', { class: 'grid-3', 'aria-live': 'polite', 'aria-label': 'Totals for ' + (m === 'all' ? 'all months' : monthLabel(m)) },
      stat('Money in', 'total-in', inn, 'pos', n > 1 ? MP.money(inn / n) + ' a month on average' : null),
      stat('Money out', 'total-out', out, '', saved ? 'Includes ' + MP.money(saved) + ' moved to savings or other accounts' : (n > 1 ? MP.money(out / n) + ' a month on average' : null)),
      stat(left >= 0 ? 'Left over' : 'Overspent', 'left-over', Math.abs(left), left >= 0 ? 'pos' : 'neg', n > 1 ? MP.money(left / n) + ' a month on average' : (left >= 0 ? 'Money in minus money out' : 'You spent more than came in')));
  }

  function donutCard(m, list) {
    var sums = byCategory(list), items = SPEND_CATS.filter(function (c) { return sums[c] > 0; })
      .map(function (c) { return { label: c, value: round2(sums[c]), color: CAT[c].color }; })
      .sort(function (a, b) { return b.value - a.value; });
    var total = items.reduce(function (a, i) { return a + i.value; }, 0);
    return el('section', { class: 'card', 'aria-labelledby': 'h-donut' },
      el('h2', { id: 'h-donut' }, 'Where your money went'),
      el('p', { class: 'small muted' }, 'Spending by category' + (m === 'all' ? ' across all months' : ' in ' + monthLabel(m)) + '. Money moved to savings is not counted as spending.'),
      items.length ? MP.donut({ items: items, center: MP.shortMoney(total), label: 'Spending by category, total ' + MP.money(total) }) : el('p', { class: 'muted' }, 'No spending this month.'));
  }

  function trendCard() {
    var ms = months();
    var ins = ms.map(function (k) { return txIn(forMonth(k)); }), outs = ms.map(function (k) { return txOut(forMonth(k)); });
    var body;
    if (ms.length < 2) body = el('p', { class: 'muted' }, 'Add statements for two or more months to see how your money changes month by month.');
    else body = monthBars(ms.slice(-12), ins.slice(-12), outs.slice(-12));
    var rows = ms.slice(-6).reverse().map(function (k, i) {
      var j = ms.length - 1 - i, left = round2(ins[j] - outs[j]);
      return el('tr', null, el('td', null, monthLabel(k, true)), el('td', { class: 'num' }, MP.money(ins[j])), el('td', { class: 'num' }, MP.money(outs[j])),
        el('td', { class: 'num ' + (left >= 0 ? 'pos' : 'neg') }, MP.money(left)));
    });
    return el('section', { class: 'card', 'aria-labelledby': 'h-trend' },
      el('h2', { id: 'h-trend' }, 'Month by month'), body,
      el('div', { class: 'scroll-x', style: { marginTop: '10px' } }, el('table', { class: 'table small', id: 'month-table' },
        el('thead', null, el('tr', null, el('th', null, 'Month'), el('th', { class: 'num' }, 'In'), el('th', { class: 'num' }, 'Out'), el('th', { class: 'num' }, 'Left over'))),
        el('tbody', null, rows))));
  }

  /* Grouped column chart: money in and out for each month (last 12). */
  function monthBars(ms, ins, outs) {
    var NS = 'http://www.w3.org/2000/svg';
    function svg(tag, attrs, text) { var e = document.createElementNS(NS, tag); Object.keys(attrs).forEach(function (k) { e.setAttribute(k, attrs[k]); }); if (text != null) e.textContent = text; return e; }
    var W = 560, H = 230, L = 50, R = 8, T = 10, B = 28;
    var top = Math.max.apply(null, ins.concat(outs).concat([1]));
    var raw = top / 4, p = Math.pow(10, Math.floor(Math.log10(raw))), n = raw / p;
    var step = (n <= 1 ? 1 : n <= 2 ? 2 : n <= 2.5 ? 2.5 : n <= 5 ? 5 : 10) * p, lines = Math.max(1, Math.ceil(top / step)), max = step * lines;
    var muted = MP.css('--muted'), grid = MP.css('--border'), cIn = MP.css('--bc-income'), cOut = MP.css('--danger');
    var s = svg('svg', { viewBox: '0 0 ' + W + ' ' + H, class: 'chart', role: 'img', 'aria-label': 'Money in and out each month: ' + ms.map(function (k, i) { return monthLabel(k) + ' in ' + MP.money(ins[i]) + ', out ' + MP.money(outs[i]); }).join('; ') });
    function y(v) { return H - B - (H - T - B) * v / max; }
    for (var g = 0; g <= lines; g++) {
      var v = step * g;
      s.appendChild(svg('line', { x1: L, x2: W - R, y1: y(v), y2: y(v), stroke: grid, 'stroke-width': 1 }));
      s.appendChild(svg('text', { x: L - 6, y: y(v) + 4, 'text-anchor': 'end', 'font-size': 11, fill: muted }, MP.shortMoney(v)));
    }
    var slot = (W - L - R) / ms.length, bw = Math.min(34, slot * 0.32);
    ms.forEach(function (k, i) {
      var cx = L + slot * (i + 0.5);
      s.appendChild(svg('rect', { x: cx - bw - 2, y: y(ins[i]), width: bw, height: Math.max(1, y(0) - y(ins[i])), rx: 3, fill: cIn }));
      s.appendChild(svg('rect', { x: cx + 2, y: y(outs[i]), width: bw, height: Math.max(1, y(0) - y(outs[i])), rx: 3, fill: cOut }));
      s.appendChild(svg('text', { x: cx, y: H - 9, 'text-anchor': 'middle', 'font-size': 11, fill: muted }, monthLabel(k, true)));
    });
    return el('div', { class: 'chart-wrap' }, s, el('div', { class: 'legend' },
      el('span', null, el('i', { style: { background: cIn } }), 'Money in'), el('span', null, el('i', { style: { background: cOut } }), 'Money out')));
  }

  function insightsCard(m, list) {
    var avg = averages(), sums = byCategory(list), items = [];
    var top = SPEND_CATS.filter(function (c) { return sums[c] > 0; }).sort(function (a, b) { return sums[b] - sums[a]; })[0];
    var spend = SPEND_CATS.reduce(function (a, c) { return a + (sums[c] || 0); }, 0);
    if (top) items.push(el('li', null, 'Your biggest spending ' + (m === 'all' ? 'overall' : 'in ' + monthLabel(m)) + ' was ', el('strong', null, CAT[top].icon + ' ' + top), ' at ' + MP.money(sums[top]) + ' (' + MP.pct(sums[top] / (spend || 1), 0) + ' of spending).'));
    var rec = recurring(), subs = rec.filter(function (r) { return r.cat === 'Subscriptions'; });
    var subYear = subs.reduce(function (a, r) { return a + r.yearly; }, 0);
    if (subs.length) items.push(el('li', null, 'Your ' + subs.length + ' subscription' + (subs.length === 1 ? '' : 's') + ' cost about ', el('strong', { id: 'subs-year' }, MP.money(subYear) + ' a year'), '. Check you still use each one.'));
    var eat = avg.cats['Eating out & takeaway'] || 0;
    if (eat > 4) items.push(el('li', null, 'If you cut eating out and takeaways by 25%, you would free about ', el('strong', { id: 'eat-cut' }, MP.money(eat * 0.25) + ' a month'), ' (' + MP.money(eat * 0.25 * 12) + ' a year).'));
    var cash = avg.cats['Cash'] || 0;
    if (cash > 30) items.push(el('li', null, 'You take out about ' + MP.money(cash) + ' a month in cash. Cash spending is hard to track, so jot down what it goes on.'));
    var other = sums['Other'] || 0;
    if (other > spend * 0.15 && other > 50) items.push(el('li', null, MP.money(other) + ' is in "Other". Sorting these into categories below makes this picture clearer.'));
    var left = avg.left, dreams = null;
    if (avg.months) items.push(el('li', null, 'On average you have ', el('strong', { id: 'avg-left', class: left >= 0 ? 'pos' : 'neg' }, MP.money(Math.abs(left)) + (left >= 0 ? ' left over' : ' overspent')), ' a month (' + avg.months + (avg.months === 1 ? ' month' : ' months') + ' of statements).' +
      (left < 0 ? ' Look at the biggest categories first, and check for payments you no longer need.' : '')));
    if (left >= 1) {
      var spare = Math.round(left);
      dreams = el('div', { class: 'panel', style: { marginTop: '12px' } },
        el('p', { class: 'small', style: { marginBottom: '8px' } }, 'Put your average left over towards your dreams and goals.'),
        el('div', { class: 'row' },
          el('button', { class: 'btn btn-accent', type: 'button', id: 'to-dreams', onclick: function () {
            var d = MP.get('tools.dreams', {}) || {};
            d.spare = spare;
            MP.set('tools.dreams', d);
            MP.log('Budget: set spare money for dreams to ' + MP.money(spare) + ' a month');
            MP.toast('Done. Dreams & goals will use ' + MP.money(spare) + ' a month.');
          } }, 'Use ' + MP.money(spare) + '/month in Dreams'),
          el('a', { href: '../dreams/index.html', class: 'small' }, 'Open Dreams & goals →')));
    }
    return el('section', { class: 'card', 'aria-labelledby': 'h-insights', id: 'insights' },
      el('h2', { id: 'h-insights' }, 'What this tells you'),
      el('ul', { class: 'bd-insights' }, items), dreams);
  }

  function limitsCard(m, list) {
    var sums = byCategory(list), n = m === 'all' ? Math.max(1, months().length) : 1;
    var cats = SPEND_CATS.filter(function (c) { return sums[c] > 0 || state.limits[c] > 0; });
    var rows = cats.map(function (c) {
      var spent = (sums[c] || 0) / n, lim = +state.limits[c] || 0;
      var inp = MP.moneyInput({ value: lim || '', placeholder: 'No limit', 'aria-label': 'Monthly limit for ' + c, dataset: { cat: c }, class: 'bd-limit-input' });
      inp.input.addEventListener('change', function () {
        var v = Math.max(0, MP.num(inp.input.value));
        if (v) state.limits[c] = Math.round(v * 100) / 100; else delete state.limits[c];
        save(); render();
        var again = MP.$('.bd-limit-input[data-cat="' + c + '"]'); if (again) again.focus();
      });
      var chip = null, bar = null;
      if (lim) {
        var ratio = spent / lim;
        chip = ratio > 1 ? el('span', { class: 'chip danger' }, MP.money(spent - lim) + ' over') :
          ratio >= 0.85 ? el('span', { class: 'chip warning' }, MP.money(lim - spent) + ' left') : el('span', { class: 'chip success' }, MP.money(lim - spent) + ' left');
        bar = el('div', { class: 'progress bd-bar' + (ratio > 1 ? ' over' : ratio >= 0.85 ? ' near' : ''), role: 'progressbar', 'aria-label': c + ' spent against limit', 'aria-valuemin': 0, 'aria-valuemax': 100, 'aria-valuenow': Math.round(Math.min(1, ratio) * 100) },
          el('span', { style: { width: Math.min(100, ratio * 100) + '%' } }));
      }
      return el('div', { class: 'bd-limit', dataset: { cat: c } },
        el('div', { class: 'bd-limit-head' },
          el('span', { class: 'bd-limit-name' }, el('i', { class: 'bd-dot', style: { background: 'var(' + CAT[c].color + ')' } }), c),
          el('span', { class: 'bd-limit-spent' }, MP.money(spent)), chip),
        el('div', { class: 'bd-limit-row' }, bar || el('div', { class: 'progress bd-bar bd-bar-none', 'aria-hidden': 'true' }), inp.wrap));
    });
    return el('section', { class: 'card', 'aria-labelledby': 'h-limits', id: 'limits' },
      el('h2', { id: 'h-limits' }, 'Monthly limits'),
      el('p', { class: 'small muted' }, (m === 'all' ? 'Average monthly spending' : 'Spending in ' + monthLabel(m)) + ' against a limit you choose for each category.'),
      rows.length ? rows : el('p', { class: 'muted' }, 'No spending to compare yet.'),
      el('div', { class: 'row', style: { marginTop: '12px' } },
        el('button', { class: 'btn btn-sm', type: 'button', id: 'suggest-limits', onclick: function () {
          var avg = averages();
          SPEND_CATS.forEach(function (c) { if (avg.cats[c] > 0) state.limits[c] = Math.ceil(avg.cats[c] * (FLEX[c] ? 0.9 : 1) / 5) * 5; });
          save(); render(); MP.toast('Limits set from your average spending, 10% lower for flexible spending like eating out. Change any of them.');
        } }, 'Suggest limits from my spending'),
        Object.keys(state.limits).length ? el('button', { class: 'btn btn-sm btn-ghost', type: 'button', id: 'reset-limits', onclick: function () { state.limits = {}; save(); render(); } }, 'Remove limits') : null));
  }

  function recurringCard() {
    var rec = recurring(), body;
    if (months().length < 2) body = el('p', { class: 'muted' }, 'We need statements covering at least two months to spot regular payments.');
    else if (!rec.length) body = el('p', { class: 'muted' }, 'No regular monthly payments found.');
    else {
      var year = rec.reduce(function (a, r) { return a + r.yearly; }, 0);
      body = [el('div', { class: 'scroll-x' }, el('table', { class: 'table', id: 'recurring-table' },
        el('thead', null, el('tr', null, el('th', null, 'Paid to'), el('th', { class: 'bd-rec-catcol' }, 'Category'), el('th', { class: 'num' }, 'Each month'), el('th', { class: 'num' }, 'A year'))),
        el('tbody', null, rec.map(function (r) {
          return el('tr', { class: r.cat === 'Subscriptions' ? 'bd-sub' : '' }, el('td', { class: 'bd-desc' }, r.merchant, el('span', { class: 'tiny muted bd-rec-cat' }, r.cat)),
            el('td', { class: 'bd-rec-catcol' }, el('span', { class: 'chip' }, CAT[r.cat] ? CAT[r.cat].icon + ' ' + r.cat : r.cat)),
            el('td', { class: 'num' }, MP.money(r.amount, true)), el('td', { class: 'num' }, MP.money(r.yearly)));
        })),
        el('tfoot', null, el('tr', null, el('th', null, 'Total of regular payments'), el('th', { class: 'bd-rec-catcol' }), el('th'), el('th', { class: 'num' }, MP.money(year)))))),
        el('p', { class: 'small muted', style: { marginTop: '8px' } }, 'Payments to the same place for a similar amount about once a month. Cancelling one you do not use saves its yearly cost.')];
    }
    return el('section', { class: 'card', 'aria-labelledby': 'h-recurring', id: 'recurring' }, el('h2', { id: 'h-recurring' }, 'Regular payments and subscriptions'), body);
  }

  function txCard(m, list) {
    var search = el('input', { type: 'search', id: 'tx-search', placeholder: 'Search, e.g. Tesco', value: ui.q, 'aria-label': 'Search transactions' });
    var catSel = el('select', { id: 'tx-cat', 'aria-label': 'Filter by category' }, el('option', { value: 'all' }, 'All categories'),
      P.CATS.map(function (c) { return el('option', { value: c, selected: ui.cat === c }, c); }));
    var tableBox = el('div', { id: 'tx-box' });
    search.addEventListener('input', function () { ui.q = search.value; ui.shown = PAGE; fillTable(tableBox, list); });
    catSel.onchange = function () { ui.cat = catSel.value; ui.shown = PAGE; fillTable(tableBox, list); };
    fillTable(tableBox, list);
    return el('section', { class: 'card', 'aria-labelledby': 'h-tx', id: 'tx-card' },
      el('h2', { id: 'h-tx' }, 'Transactions' + (m === 'all' ? '' : ' in ' + monthLabel(m))),
      el('p', { class: 'small muted' }, 'Wrong category? Change it here. You can then choose to always use it for that place.'),
      el('div', { class: 'bd-filters no-print' }, el('div', { class: 'field' }, el('label', { for: 'tx-search' }, 'Search'), search), el('div', { class: 'field' }, el('label', { for: 'tx-cat' }, 'Category'), catSel)),
      ruleBar(), tableBox);
  }

  function ruleBar() {
    var c = ui.lastChange, box = el('div', { id: 'rule-bar', 'aria-live': 'polite' });
    if (!c) return box;
    if (c.saved) box.appendChild(el('p', { class: 'callout success small' }, 'Saved. ' + c.merchant + ' will always go in ' + c.cat + ' (' + c.count + ' transaction' + (c.count === 1 ? '' : 's') + ' updated).'));
    else box.appendChild(el('div', { class: 'callout small bd-rule' },
      el('span', null, 'Moved to ', el('strong', null, c.cat), '. '),
      el('button', { class: 'btn btn-sm btn-primary', type: 'button', id: 'always-rule', onclick: function () {
        state.rules[c.merchant] = c.cat;
        var count = 0;
        state.tx.forEach(function (t) { if (P.merchant(t.desc) === c.merchant) { if (t.cat !== c.cat) count++; t.cat = c.cat; } });
        ui.lastChange = { merchant: c.merchant, cat: c.cat, saved: true, count: count + 1 };
        MP.log('Budget: always put ' + c.merchant + ' in ' + c.cat);
        save(); render();
      } }, 'Always use this for ' + c.merchant),
      el('button', { class: 'btn btn-sm btn-ghost', type: 'button', onclick: function () { ui.lastChange = null; box.innerHTML = ''; } }, 'Just this one')));
    return box;
  }

  function fillTable(box, list) {
    var q = ui.q.trim().toLowerCase();
    var rows = list.filter(function (t) {
      return (ui.cat === 'all' || t.cat === ui.cat) && (!q || t.desc.toLowerCase().indexOf(q) >= 0 || t.cat.toLowerCase().indexOf(q) >= 0 || String(Math.abs(t.amount)).indexOf(q) >= 0);
    });
    box.innerHTML = '';
    box.appendChild(el('p', { class: 'small', id: 'tx-count', 'aria-live': 'polite', dataset: { count: rows.length } },
      rows.length === list.length ? rows.length + ' transaction' + (rows.length === 1 ? '' : 's') : rows.length + ' of ' + list.length + ' transactions match'));
    if (!rows.length) { box.appendChild(el('p', { class: 'muted' }, 'Nothing matches. Try another search or category.')); return; }
    var tbody = el('tbody');
    rows.slice(0, ui.shown).forEach(function (t) {
      var idx = state.tx.indexOf(t);
      var sel = el('select', { class: 'bd-cat', 'aria-label': 'Category for ' + t.desc, dataset: { i: idx } }, P.CATS.map(function (c) { return el('option', { value: c, selected: c === t.cat }, c); }));
      sel.onchange = function () {
        t.cat = sel.value;
        ui.lastChange = { merchant: P.merchant(t.desc), cat: t.cat };
        save(); render();
        var again = MP.$('#tx-table select[data-i="' + idx + '"]'); if (again) again.focus();
      };
      tbody.appendChild(el('tr', { dataset: { i: idx } },
        el('td', { class: 'bd-date' }, MP.fmtDate(t.date)),
        el('td', { class: 'bd-desc' }, t.desc, t.src && t.src !== 'sample-statement.csv' ? el('span', { class: 'tiny muted bd-src' }, t.src) : null),
        el('td', { class: 'bd-catcell' }, sel),
        el('td', { class: 'num bd-amt ' + (t.amount > 0 ? 'pos' : '') }, (t.amount > 0 ? '+' : '') + MP.money(t.amount, true))));
    });
    box.appendChild(el('div', { class: 'scroll-x' }, el('table', { class: 'table', id: 'tx-table' },
      el('thead', null, el('tr', null, el('th', null, 'Date'), el('th', null, 'Description'), el('th', null, 'Category'), el('th', { class: 'num' }, 'Amount'))), tbody)));
    if (rows.length > ui.shown) {
      box.appendChild(el('div', { class: 'row', style: { marginTop: '10px', justifyContent: 'center' } },
        el('button', { class: 'btn', type: 'button', id: 'show-more', onclick: function () { ui.shown += PAGE; fillTable(box, list); } },
          'Show more (' + (rows.length - ui.shown) + ' more)')));
    }
  }

  function exportCSV() {
    var rows = [['Date', 'Description', 'Amount', 'Category', 'Source file']];
    state.tx.slice().reverse().forEach(function (t) { rows.push([t.date, t.desc, t.amount.toFixed(2), t.cat, t.src]); });
    MP.download('budget-transactions-' + MP.isoDate(new Date()) + '.csv', MP.csv.stringify(rows), 'text/csv');
  }

  function clearAll() {
    if (!MP.confirm('Remove all transactions, your category rules and limits from this tool? Your statement files are not affected.')) return;
    state.tx = []; state.rules = {}; state.limits = {}; state.month = ''; state.sample = false;
    ui = { cat: 'all', q: '', shown: PAGE, msgs: [{ kind: 'info', text: 'All budget data has been removed.' }], lastChange: null };
    MP.log('Budget: cleared all transactions');
    save(); render();
  }

  function howTo() {
    return el('details', { class: 'card' }, el('summary', null, 'How to use this, and tips'),
      el('ul', { class: 'small' },
        el('li', null, el('strong', null, 'Get your statement file: '), 'sign in to online banking on a computer, open your current account, and look for "Download", "Export" or "Statements". Choose CSV (best), or OFX/QFX/QIF if you use money software. Pick the last 3 to 12 months.'),
        el('li', null, el('strong', null, 'Several accounts? '), 'Add a file for each current account and credit card. If you add the same file twice, we skip transactions that are already here.'),
        el('li', null, el('strong', null, 'Open Banking: '), 'some apps can link to your bank directly. This tool does not. It only reads files you choose, so your bank login is never shared.'),
        el('li', null, el('strong', null, 'Try 50/30/20: '), 'a simple guide is about 50% of take-home pay on needs (rent, bills, food), 30% on wants, and 20% on saving or paying off debt. Adjust it to your life.'),
        el('li', null, el('strong', null, 'Check your subscriptions '), 'every few months. Streaming, apps and gym memberships add up, and many renew without telling you.'),
        el('li', null, el('strong', null, 'Budget together: '), 'sit down with your partner or household once a month, look at the categories, and agree limits that feel fair to everyone.')));
  }

  MP.onTheme(render);
  ui.msgs = [];
  render();
});
