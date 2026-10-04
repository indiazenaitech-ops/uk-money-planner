/* Money inbox: read saved emails (.eml, .mbox, .txt), PDF letters or pasted text on this device,
   spot bills, renewals, due dates and scams, then plan for them. Only the extracted facts, subject,
   sender and the first 500 characters of each message are kept (encrypted in the vault). */
MP.page({ id: 'inbox', title: 'Money inbox' }).then(function () {
  'use strict';
  var el = MP.el, main = MP.$('#app'), P = window.InboxParse;

  var TYPES = {
    bill: { label: 'Bill or statement', icon: '🧾', chip: 'info' },
    renewal: { label: 'Renewal', icon: '🔁', chip: 'warning' },
    due: { label: 'Payment due', icon: '⏰', chip: 'warning' },
    price: { label: 'Price rise', icon: '📈', chip: 'warning' },
    payslip: { label: 'Payslip or income', icon: '💷', chip: 'success' },
    tax: { label: 'Tax (HMRC)', icon: '🏛️', chip: 'info' },
    pension: { label: 'Pension or investment', icon: '🏦', chip: 'success' },
    scam: { label: 'Possible scam', icon: '⚠️', chip: 'danger' },
    other: { label: 'Other', icon: '✉️', chip: '' }
  };
  var KINDS = {
    'car-insurance': 'Car insurance', 'home-insurance': 'Home insurance', 'pet-insurance': 'Pet insurance', 'travel-insurance': 'Travel insurance',
    'life-insurance': 'Life insurance', insurance: 'Insurance', 'credit-card': 'Credit card', energy: 'Energy', water: 'Water', 'council-tax': 'Council Tax',
    mobile: 'Mobile phone', broadband: 'Broadband', 'tv-licence': 'TV Licence', mortgage: 'Mortgage', loan: 'Loan', subscription: 'Subscription'
  };
  var FREQ = { '': 'Not stated', once: 'One-off', weekly: 'Weekly', monthly: 'Monthly', quarterly: 'Every 3 months', annual: 'Yearly' };
  var MAX_ITEMS = 300, MAX_FILE = 25 * 1024 * 1024;

  var state = MP.get('tools.inbox', { items: [], bills: [], tab: 'found' });
  if (!Array.isArray(state.items)) state.items = [];
  if (!Array.isArray(state.bills)) state.bills = [];
  var lastStatus = null;

  function today() { var d = new Date(); return new Date(d.getFullYear(), d.getMonth(), d.getDate()); }
  function parseIso(s) { var m = /^(\d{4})-(\d{2})-(\d{2})/.exec(s || ''); return m ? new Date(+m[1], +m[2] - 1, +m[3]) : null; }
  function daysTo(s) { var d = parseIso(s); return d ? Math.round((d - today()) / 864e5) : null; }
  function countdown(s) {
    var n = daysTo(s);
    if (n == null) return null;
    var txt = n === 0 ? 'today' : n === 1 ? 'tomorrow' : n === -1 ? 'yesterday' : n < 0 ? Math.abs(n) + ' days ago' : n > 730 ? 'in about ' + Math.round(n / 365.25) + ' years' : n > 60 ? 'in about ' + Math.round(n / 30.4375) + ' months' : 'in ' + n + ' days';
    return el('span', { class: 'chip ' + (n < 0 ? 'danger' : n <= 14 ? 'warning' : 'info') + ' countdown' }, txt);
  }
  function monthsUntil(s) { var n = daysTo(s); return n == null ? 0 : Math.max(1, Math.round(n / 30.4375)); }
  /* Letters about missed payments, arrears or debt collection: these get a free debt advice card. */
  var DEBT_RE = /\barrears\b|\bmissed (a |your |the )?(monthly )?payments?\b|\bdebt collect(ion|or|ors|ing)\b|\bdebt recovery\b|\bdefault notice\b|\bnotice of default\b|\bfinal (notice|demand|reminder)\b|\bbehind (on|with) (your )?(payments|rent|bills|repayments)\b|\bpayments? (is |are )?overdue\b|\bcounty court\b|\bbailiffs?\b|\benforcement agents?\b/i;
  function isDebt(it) {
    if (!it || it.type === 'scam') return false;
    if (typeof it.debt === 'boolean') return it.debt;
    return DEBT_RE.test((it.subject || '') + '\n' + (it.snippet || ''));
  }

  function itemName(it) {
    var k = KINDS[it.kind], t = TYPES[it.type] || TYPES.other;
    var what = it.type === 'renewal' ? (k ? k + ' renewal' : 'Renewal') : it.type === 'price' ? (k ? k + ' price rise' : 'Price rise') : k || t.label;
    return what + (it.company ? ' (' + it.company + ')' : '');
  }

  /* ---------- import ---------- */
  function addMessages(msgs, source) {
    var added = 0, dupes = 0, counts = {};
    msgs.forEach(function (m) {
      var f = P.extract(m.text, m);
      var key = [m.subject, m.fromEmail, m.date, (m.text || '').slice(0, 80)].join('|');
      if (state.items.some(function (x) { return x.key === key; })) { dupes++; return; }
      var it = {
        id: MP.uid(), key: key, added: Date.now(), source: source || '',
        subject: m.subject || '(no subject)', fromName: m.fromName, fromEmail: m.fromEmail, received: m.date,
        snippet: (m.text || '').slice(0, 500), attachments: (m.attachments || []).slice(0, 5),
        type: f.type, kind: f.kind, company: f.company, amount: f.amount, oldAmount: f.oldAmount, minPayment: f.minPayment, balance: f.balance,
        dueDate: f.dueDate, frequency: f.frequency, directDebit: f.directDebit, rates: f.rates,
        scamReasons: f.scamReasons, hmrcWarning: f.hmrcWarning, sample: !!m.sample,
        debt: f.type !== 'scam' && DEBT_RE.test((m.subject || '') + '\n' + (m.text || ''))
      };
      state.items.unshift(it); added++;
      counts[it.type] = (counts[it.type] || 0) + 1;
    });
    if (state.items.length > MAX_ITEMS) state.items = state.items.slice(0, MAX_ITEMS);
    return { added: added, dupes: dupes, counts: counts };
  }
  function describe(r) {
    var bits = [];
    var money = (r.counts.bill || 0) + (r.counts.renewal || 0) + (r.counts.due || 0) + (r.counts.price || 0);
    if (money) bits.push(money + (money === 1 ? ' bill or renewal' : ' bills or renewals'));
    if (r.counts.scam) bits.push(r.counts.scam + (r.counts.scam === 1 ? ' possible scam' : ' possible scams'));
    var s = 'Read ' + r.added + (r.added === 1 ? ' message' : ' messages') + (bits.length ? ': found ' + bits.join(' and ') + '.' : '.');
    if (r.dupes) s += ' ' + r.dupes + ' already in your list.';
    return s;
  }

  function handleFiles(files) {
    if (!files || !files.length) return;
    setStatus({ kind: 'info', text: 'Reading ' + files.length + (files.length === 1 ? ' file' : ' files') + ' on this device…' });
    var errors = [], msgs = [];
    var jobs = files.map(function (file) {
      if (file.size > MAX_FILE) { errors.push(file.name + ': this file is too big (over 25 MB).'); return Promise.resolve(); }
      var isPdf = /\.pdf$/i.test(file.name) || file.type === 'application/pdf';
      if (isPdf) return readPdf(file).then(function (m) { msgs.push(m); }).catch(function (e) { errors.push(file.name + ': ' + friendly(e)); });
      return MP.files.buffer(file).then(function (buf) {
        var list;
        try { list = P.fromBuffer(buf, file.name); } catch (e) {
          if (e.message === 'PDF') return readPdf(file).then(function (m) { msgs.push(m); });
          throw e;
        }
        list.forEach(function (m) { m.source = file.name; msgs.push(m); });
      }).catch(function (e) { errors.push(file.name + ': ' + friendly(e)); });
    });
    return Promise.all(jobs).then(function () {
      var r = addMessages(msgs, 'file');
      if (r.added) { MP.log('Money inbox: read ' + r.added + (r.added === 1 ? ' message' : ' messages') + ' from ' + files.length + (files.length === 1 ? ' file' : ' files')); state.tab = 'found'; }
      save();
      setStatus({ kind: errors.length ? (r.added ? 'warning' : 'danger') : 'success', text: msgs.length ? describe(r) : 'Nothing could be read.', errors: errors });
      render();
    });
  }
  function friendly(e) {
    var m = e && e.message ? e.message : String(e || '');
    if (/password/i.test(m)) return 'this PDF is password-protected. Open it, copy the text and paste it below.';
    if (/Invalid PDF|InvalidPDF|corrupt/i.test(m)) return 'this PDF looks damaged and could not be read.';
    return m || 'this file could not be read.';
  }
  function readPdf(file) {
    return MP.files.pdfText(file).then(function (pages) {
      var text = (pages || []).join('\n\n').trim();
      if (!text) throw new Error('no text was found in this PDF. It may be a scanned image. Type the key details into the paste box instead.');
      var m = P.parseText(text);
      m.subject = (m.subject && m.subject.length > 4 ? m.subject : file.name.replace(/\.pdf$/i, '')).slice(0, 120);
      m.source = file.name;
      return m;
    });
  }
  function readPasted() {
    var ta = MP.$('#paste-text'), txt = ta.value;
    if (!txt.trim()) { setStatus({ kind: 'warning', text: 'Paste the text of an email or letter first.' }); ta.focus(); return; }
    if (txt.length > 2e6) { setStatus({ kind: 'danger', text: 'That is too much text. Paste one email at a time.' }); return; }
    var m;
    try { m = P.parseText(txt); } catch (e) { setStatus({ kind: 'danger', text: 'Sorry, we could not read that text.' }); return; }
    var r = addMessages([m], 'paste');
    if (r.added) MP.log('Money inbox: read a pasted message');
    ta.value = '';
    state.tab = 'found';
    save();
    setStatus({ kind: r.added ? 'success' : 'warning', text: describe(r) });
    render();
  }
  function loadSamples() {
    var msgs = (window.INBOX_SAMPLES || []).map(function (s) {
      var m = P.parseEml(s.raw); m.sample = true; return m;
    });
    var r = addMessages(msgs, 'sample');
    if (r.added) MP.log('Money inbox: tried the sample emails');
    state.tab = 'found';
    save();
    setStatus({ kind: 'success', text: r.added ? describe(r) + ' These are made-up examples.' : 'The sample emails are already in your list.' });
    render();
  }
  function setStatus(s) { lastStatus = s; var box = MP.$('#import-status'); if (box) fillStatus(box); }
  function fillStatus(box) {
    box.innerHTML = '';
    if (!lastStatus) return;
    box.appendChild(el('div', { class: 'callout ' + (lastStatus.kind === 'info' ? '' : lastStatus.kind) },
      el('p', null, lastStatus.text),
      lastStatus.errors && lastStatus.errors.length ? el('ul', { class: 'small', style: { margin: 0, paddingInlineStart: '18px' } }, lastStatus.errors.map(function (e) { return el('li', null, e); })) : null));
  }

  /* ---------- bills and goals ---------- */
  function billFrom(it) {
    return { id: it.billId || MP.uid(), itemId: it.id, name: itemName(it), type: it.type, kind: it.kind, company: it.company, amount: +it.amount || 0, date: it.dueDate, frequency: it.frequency || 'once', directDebit: !!it.directDebit };
  }
  function addToBills(it) {
    if (!(it.amount > 0) || !it.dueDate) { editItem(it, 'Add the amount and the date first, so we can put it in your calendar.', function (x) { addToBills(x); }); return; }
    var b = billFrom(it), i = state.bills.findIndex(function (x) { return x.id === b.id || x.itemId === it.id; });
    if (i >= 0) { b.id = state.bills[i].id; state.bills[i] = b; } else state.bills.push(b);
    it.billId = b.id;
    save(); render();
    MP.toast('Added to your bills & renewals.');
  }
  function removeBill(id) {
    state.bills = state.bills.filter(function (b) { return b.id !== id; });
    state.items.forEach(function (it) { if (it.billId === id) delete it.billId; });
    save(); render();
  }
  function planFor(it) {
    if (!(it.amount > 0) || !it.dueDate) { editItem(it, 'Add the amount and the date first, so we can work out a monthly plan.', function (x) { planFor(x); }); return; }
    if (daysTo(it.dueDate) < 0) { MP.toast('That date has passed. Change the date to the next one first.'); editItem(it, 'That date has passed. Enter the next due date.', function (x) { planFor(x); }); return; }
    var months = monthsUntil(it.dueDate), monthly = Math.round(it.amount / months * 100) / 100;
    var goals = MP.goals(), g = goals.find(function (x) { return x.id === it.goalId; });
    var isNew = !g;
    if (!g) { g = { id: MP.uid(), saved: 0, priority: 1, home: 'easy', linked: 'inbox' }; goals.push(g); }
    Object.assign(g, { name: itemName(it).slice(0, 60), icon: '🧾', target: +it.amount, date: it.dueDate, rate: 0, monthly: monthly, monthlyNeeded: Math.round(monthly),
      note: 'From Money inbox: ' + MP.money(it.amount, true) + ' due ' + MP.fmtDate(parseIso(it.dueDate)) + '. Put aside ' + MP.money(monthly, true) + ' a month for ' + months + (months === 1 ? ' month' : ' months') + '.' });
    MP.saveGoals(goals);
    it.goalId = g.id; it.planMonthly = monthly;
    MP.log((isNew ? 'Made a plan for ' : 'Updated the plan for ') + g.name + ': ' + MP.money(monthly, true) + ' a month');
    save(); render();
    MP.toast('Plan saved: put aside ' + MP.money(monthly, true) + ' a month. See Dreams & goals.');
  }
  function dismiss(it) {
    state.items = state.items.filter(function (x) { return x.id !== it.id; });
    save(); render();
    MP.toast(it.type === 'scam' ? 'Removed. Remember to delete the email too.' : 'Dismissed.');
  }

  /* next 12 months of payments for a bill */
  function occurrences(b) {
    var start = today(), end = new Date(start.getFullYear(), start.getMonth() + 12, 1), d = parseIso(b.date), out = [];
    if (!d || !(b.amount > 0)) return out;
    var step = { weekly: 0, monthly: 1, quarterly: 3, annual: 12 }[b.frequency];
    if (step == null) { if (d >= start && d < end) out.push(d); return out; }
    var day = d.getDate(), guard = 0;
    function addStep(x, n) { var y = new Date(x.getFullYear(), x.getMonth() + n, 1), last = new Date(y.getFullYear(), y.getMonth() + 1, 0).getDate(); y.setDate(Math.min(day, last)); return y; }
    if (b.frequency === 'weekly') { while (d < start && guard++ < 2000) d = new Date(d.getFullYear(), d.getMonth(), d.getDate() + 7); while (d < end && guard++ < 2000) { out.push(d); d = new Date(d.getFullYear(), d.getMonth(), d.getDate() + 7); } return out; }
    while (d < start && guard++ < 1200) d = addStep(d, step);
    while (d < end && guard++ < 1200) { out.push(d); d = addStep(d, step); }
    return out;
  }
  function upcoming() {
    var rows = [];
    state.bills.forEach(function (b) { occurrences(b).forEach(function (d) { rows.push({ bill: b, date: d }); }); });
    rows.sort(function (a, b) { return a.date - b.date; });
    return rows;
  }

  /* ---------- render ---------- */
  function render() {
    main.innerHTML = '';
    main.appendChild(el('div', { class: 'row', style: { justifyContent: 'space-between', margin: '6px 0 14px' } },
      el('div', null, el('h1', { style: { margin: 0 } }, 'Money inbox'),
        el('p', { class: 'muted', style: { margin: 0 } }, 'Read saved emails and letters to spot bills, renewals and due dates, then plan for them.')),
      el('div', { class: 'row' },
        el('button', { class: 'btn btn-primary', type: 'button', id: 'try-sample', onclick: loadSamples }, '✉️ Try a sample'),
        state.items.length || state.bills.length ? el('button', { class: 'btn btn-ghost', type: 'button', id: 'clear-all', onclick: clearAll }, 'Clear all') : null)));

    main.appendChild(el('div', { class: 'callout success privacy', role: 'note' },
      el('p', null, el('strong', null, '🔒 Read on this device only. '), 'Your emails and letters are read in this browser and never uploaded. We keep only the key facts, the subject, the sender and the first 500 characters, encrypted with your password.'),
      el('p', { class: 'tiny muted' }, 'Live connection to Gmail or Outlook can be added by your bank later.')));

    var debts = state.items.filter(isDebt);
    if (debts.length) main.appendChild(debtHelp(debts));

    var split = el('div', { class: 'split' });
    var left = el('div', { class: 'stack' });
    left.appendChild(importCard());
    left.appendChild(glance());
    split.appendChild(left);
    var right = el('div', { class: 'stack' });
    right.appendChild(tabs());
    right.appendChild(state.tab === 'upcoming' ? upcomingView() : foundView());
    right.appendChild(howTo());
    split.appendChild(right);
    main.appendChild(split);
    saveSummary();
  }

  function debtHelp(debts) {
    return el('section', { class: 'card debt-help', id: 'debt-help', 'aria-labelledby': 'h-debt' },
      el('h2', { id: 'h-debt' }, debts.length === 1 ? 'One of your letters is about a missed payment or debt' : debts.length + ' of your letters are about missed payments or debt'),
      el('p', { class: 'small' }, 'Please do not ignore ', debts.length === 1 ? 'it' : 'them', ' (', debts.map(function (d) { return '"' + d.subject + '"'; }).slice(0, 3).join('; '), '). Contact the company to say you have seen it and ask for time to pay. Missed payments can affect your ',
        MP.term('credit-score', 'credit score'), ', and getting help early stops things getting harder.'),
      MP.adviceCard('debt'));
  }

  function importCard() {
    var pick = el('button', { class: 'btn btn-accent', type: 'button', id: 'import-files', onclick: function () {
      MP.files.pick('.eml,.mbox,.txt,.pdf,.text,message/rfc822,application/mbox,text/plain,application/pdf', true).then(handleFiles);
    } }, '📂 Choose files');
    var zone = el('div', { class: 'dropzone', id: 'drop' },
      el('p', { style: { margin: '0 0 10px' } }, el('strong', null, 'Drag emails or letters here')),
      pick,
      el('p', { class: 'tiny muted', style: { margin: '10px 0 0' } }, '.eml and .mbox emails, .txt files and PDF letters. PDFs need internet the first time.'));
    MP.files.dropzone(zone, handleFiles);
    var ta = el('textarea', { id: 'paste-text', rows: 6, placeholder: 'Paste the whole email here. Include the From and Subject lines if you can.', spellcheck: 'false' });
    var status = el('div', { id: 'import-status', 'aria-live': 'polite' });
    fillStatus(status);
    return el('section', { class: 'card', 'aria-labelledby': 'h-add' },
      el('h2', { id: 'h-add' }, 'Add emails and letters'),
      MP.explain(null, 'An .eml file is one email saved as a file. In Gmail on a computer, open the email, press the three dots (⋮) and choose "Download message". On a phone, it is easier to copy the email text and paste it below.'),
      zone,
      el('div', { class: 'field', style: { marginTop: '16px' } }, el('label', { for: 'paste-text' }, 'Or paste an email or letter'), ta),
      el('button', { class: 'btn btn-primary btn-block', type: 'button', id: 'paste-read', onclick: readPasted }, 'Read this text'),
      status);
  }

  function glance() {
    var rows = upcoming(), soon = rows.filter(function (r) { return (r.date - today()) / 864e5 <= 30; });
    var soonTotal = soon.reduce(function (a, r) { return a + r.bill.amount; }, 0), year = rows.reduce(function (a, r) { return a + r.bill.amount; }, 0);
    var scams = state.items.filter(function (i) { return i.type === 'scam'; }).length;
    return el('section', { class: 'card', 'aria-labelledby': 'h-glance' },
      el('h2', { id: 'h-glance' }, 'At a glance'),
      el('div', { class: 'glance' },
        el('div', { class: 'stat' }, el('span', { class: 'label' }, 'Due in the next 30 days'), el('span', { class: 'value', id: 'due-30' }, MP.money(soonTotal)), el('span', { class: 'tiny muted' }, soon.length + (soon.length === 1 ? ' payment' : ' payments'))),
        el('div', { class: 'stat' }, el('span', { class: 'label' }, 'Bills in the next 12 months'), el('span', { class: 'value', id: 'due-year' }, MP.money(year)), el('span', { class: 'tiny muted' }, state.bills.length + ' in your list')),
        el('div', { class: 'stat' }, el('span', { class: 'label' }, 'Possible scams'), el('span', { class: 'value' + (scams ? ' neg' : ''), id: 'scam-count' }, String(scams)))),
      MP.explain(null, 'How to spot a scam: it rushes you ("within 24 hours"), offers money or threatens a fine, and asks you to click a link or give bank details. Check the sender\'s full email address. Your bank and HMRC will never ask for your PIN or password.'));
  }

  function tabs() {
    var found = state.items.length, bills = state.bills.length;
    function tab(id, label) {
      return el('button', { type: 'button', role: 'tab', id: 'tab-' + id, 'aria-selected': String(state.tab === id), 'aria-controls': 'panel', onclick: function () { state.tab = id; save(); render(); MP.$('#tab-' + id).focus(); } }, label);
    }
    return el('div', { class: 'tabs', role: 'tablist', 'aria-label': 'Money inbox views' },
      tab('found', 'Found in your emails (' + found + ')'), tab('upcoming', 'Bills & renewals (' + bills + ')'));
  }

  function foundView() {
    var sec = el('section', { id: 'panel', role: 'tabpanel', 'aria-labelledby': 'tab-found' });
    if (!state.items.length) {
      sec.appendChild(el('div', { class: 'card empty' }, el('div', { class: 'empty-ico', 'aria-hidden': 'true' }, '📭'),
        el('h2', null, 'Nothing here yet'),
        el('p', { class: 'muted' }, 'Add a saved email, a PDF letter or paste some text, and we will pick out the amount, the due date and what kind of message it is.'),
        el('button', { class: 'btn btn-primary', type: 'button', onclick: loadSamples }, 'Try 5 sample emails')));
      return sec;
    }
    if (state.items.some(function (i) { return i.type === 'renewal' || i.type === 'price'; })) {
      sec.appendChild(MP.explain(null, 'Renewal prices are often higher than last year, and auto-renewal means you can roll over without noticing (people call this the "loyalty penalty"). Compare prices about 3 to 4 weeks before the renewal date, then ask your provider to match or switch.'));
    }
    var list = el('div', { class: 'mail-list', id: 'item-list' });
    state.items.slice().sort(function (a, b) {
      return (b.type === 'scam') - (a.type === 'scam') || ((a.dueDate || '9999') < (b.dueDate || '9999') ? -1 : (a.dueDate || '9999') > (b.dueDate || '9999') ? 1 : 0) || b.added - a.added;
    }).forEach(function (it) { list.appendChild(itemCard(it)); });
    sec.appendChild(list);
    return sec;
  }

  function fact(label, value, cls, extra) {
    return el('div', { class: 'stat' }, el('span', { class: 'label' }, label), el('span', { class: 'value ' + (cls || '') }, value), extra || null);
  }

  function itemCard(it) {
    var t = TYPES[it.type] || TYPES.other, scam = it.type === 'scam';
    var from = it.fromName || it.fromEmail || it.company || 'Unknown sender';
    var meta = [from + (it.fromEmail && it.fromName ? ' <' + it.fromEmail + '>' : '')];
    if (it.received) meta.push('received ' + MP.fmtDate(it.received));
    var extras = [];
    if (it.oldAmount && it.amount && it.oldAmount !== it.amount) {
      var ch = (it.amount - it.oldAmount) / it.oldAmount;
      extras.push(el('li', { class: ch > 0 ? 'neg' : 'pos' }, 'Was ' + MP.money(it.oldAmount, true) + ', now ' + MP.money(it.amount, true) + ' (' + (ch > 0 ? 'up ' : 'down ') + MP.pct(Math.abs(ch)) + ')'));
    }
    if (it.minPayment && it.minPayment !== it.amount) extras.push(el('li', null, 'Minimum payment ' + MP.money(it.minPayment, true) + '. Paying only this costs more in interest.'));
    if (it.balance && it.balance !== it.amount) extras.push(el('li', { class: 'detail-only' }, 'Balance ' + MP.money(it.balance, true)));
    if (it.directDebit && !scam) extras.push(el('li', null, 'Paid by ', MP.term('direct-debit', 'Direct Debit')));
    if (it.rates && it.rates.length && !scam) {
      var rateTerms = [];
      if (it.rates.some(function (r) { return /APR/.test(r); })) rateTerms.push(MP.term('apr', 'What is APR?'));
      if (it.rates.some(function (r) { return /AER/.test(r); })) rateTerms.push(MP.term('aer', 'What is AER?'));
      extras.push(el('li', { class: 'detail-only' }, 'Rates mentioned: ' + it.rates.join(', ') + (rateTerms.length ? ' ' : ''), rateTerms));
    }
    if (it.attachments && it.attachments.length) extras.push(el('li', { class: 'muted detail-only' }, 'Attachments (not opened): ' + it.attachments.join(', ')));
    var allDetail = extras.every(function (e) { return e.classList.contains('detail-only'); });

    var due = it.dueDate ? parseIso(it.dueDate) : null;
    var dueLabel = it.type === 'renewal' ? 'Renews' : it.type === 'price' ? 'Starts' : 'Due';
    var actions = scam ? [
      el('button', { class: 'btn btn-sm btn-danger dismiss-item', type: 'button', onclick: function () { dismiss(it); } }, 'Remove'),
      el('button', { class: 'btn btn-sm btn-ghost edit-item', type: 'button', onclick: function () { editItem(it); } }, 'Not a scam? Edit')
    ] : [
      el('button', { class: 'btn btn-sm add-bill' + (it.billId ? ' added' : ''), type: 'button', 'aria-pressed': String(!!it.billId), onclick: function () { if (it.billId) { state.tab = 'upcoming'; save(); render(); } else addToBills(it); } }, it.billId ? '✓ In bills calendar' : '📅 Add to bills calendar'),
      el('button', { class: 'btn btn-sm btn-accent plan-item', type: 'button', onclick: function () { planFor(it); } }, it.goalId ? 'Update plan' : '🎯 Plan for it'),
      el('button', { class: 'btn btn-sm edit-item', type: 'button', onclick: function () { editItem(it); } }, 'Edit'),
      el('button', { class: 'btn btn-sm btn-ghost dismiss-item', type: 'button', 'aria-label': 'Dismiss ' + it.subject, onclick: function () { dismiss(it); } }, 'Dismiss')
    ];

    return el('article', { class: 'card mail-item' + (scam ? ' is-scam' : ''), dataset: { id: it.id, type: it.type } },
      el('div', { class: 'mail-head' },
        el('span', { class: 'mail-ico', 'aria-hidden': 'true' }, t.icon),
        el('div', { class: 'mail-title' }, el('h3', { class: 'item-subject' }, it.subject), el('div', { class: 'small muted item-from' }, meta.join(' · '))),
        el('div', { class: 'mail-chips' }, el('span', { class: 'chip item-type ' + t.chip }, t.label), it.sample ? el('span', { class: 'chip' }, 'Sample') : null)),
      scam ? el('div', { class: 'callout danger scam-warning', role: 'alert' },
        el('p', null, el('strong', null, 'This looks like a scam. '), 'Do not click any links, reply, or give any details.'),
        it.hmrcWarning ? el('p', { class: 'hmrc-warning' }, el('strong', null, 'HMRC never asks for bank details by email; possible scam. '), 'HMRC will not email you about a tax refund or ask you to click a link to claim one.') : null,
        el('ul', { class: 'small' }, (it.scamReasons || []).map(function (r) { return el('li', null, r); })),
        el('p', { class: 'small' }, 'Forward the email to ', el('strong', null, 'report@phishing.gov.uk'), ', then delete it. If you gave any bank details, call your bank now on the number on the back of your card.')) : null,
      !scam && it.hmrcWarning ? el('p', { class: 'callout warning hmrc-warning' }, 'HMRC never asks for bank details by email; possible scam. Check your tax on GOV.UK by typing the address yourself.') : null,
      !scam ? el('div', { class: 'facts' },
        fact('Amount', it.amount > 0 ? MP.money(it.amount, true) : 'Not found', 'item-amount' + (it.amount > 0 ? '' : ' missing')),
        fact(dueLabel, due ? MP.fmtDate(due) : 'Not found', 'item-due' + (due ? '' : ' missing'), due ? countdown(it.dueDate) : null),
        el('div', { class: 'detail-only fact-freq' }, fact('How often', FREQ[it.frequency] || FREQ[''], 'item-freq')),
        fact('Company', it.company || '—', 'item-company')) : null,
      !scam && isDebt(it) ? el('p', { class: 'callout warning small debt-flag' }, el('strong', null, 'This is about a missed payment or debt. '), 'Contact the company soon, and see the free debt help at the top of this page.') : null,
      extras.length ? el('ul', { class: 'small extras' + (allDetail ? ' detail-only' : '') }, extras) : null,
      it.goalId && it.planMonthly ? el('p', { class: 'small plan-line' }, '🎯 Planned: put aside ', el('strong', { class: 'plan-monthly' }, MP.money(it.planMonthly, true)), ' a month in ', el('a', { href: '../dreams/index.html' }, 'Dreams & goals'), '.') : null,
      it.snippet ? el('details', { class: 'snippet detail-only' }, el('summary', { class: 'small' }, 'Show the text we kept'), el('p', { class: 'small muted' }, it.snippet + (it.snippet.length >= 500 ? '…' : ''))) : null,
      el('div', { class: 'row mail-actions' }, actions));
  }

  function editItem(it, msg, after) {
    var type = el('select', { id: 'e-type' }, Object.keys(TYPES).map(function (k) { return el('option', { value: k, selected: it.type === k }, TYPES[k].label); }));
    var kind = el('select', { id: 'e-kind' }, [el('option', { value: '' }, 'Not sure')].concat(Object.keys(KINDS).map(function (k) { return el('option', { value: k, selected: it.kind === k }, KINDS[k]); })));
    var company = el('input', { type: 'text', id: 'e-company', value: it.company || '', maxlength: 60 });
    var amount = MP.moneyInput({ id: 'e-amount', value: it.amount > 0 ? it.amount : '', step: '0.01' });
    var date = el('input', { type: 'date', id: 'e-date', value: it.dueDate || '' });
    var freq = el('select', { id: 'e-freq' }, ['once', 'weekly', 'monthly', 'quarterly', 'annual'].map(function (k) { return el('option', { value: k, selected: (it.frequency || 'once') === k }, FREQ[k]); }));
    var err = el('p', { class: 'callout danger', hidden: true, role: 'alert' });
    var form = el('form', { id: 'edit-form', novalidate: true },
      msg ? el('p', { class: 'callout warning' }, msg) : el('p', { class: 'small muted' }, 'We read emails automatically, so we are not always right. Check these against the email.'),
      el('div', { class: 'grid-2' },
        MP.field('What kind of message', type), detailOnly(MP.field('What it is for', kind)),
        MP.field('Company', company), MP.field('Amount', amount.wrap),
        MP.field('Due or renewal date', date), detailOnly(MP.field('How often', freq))),
      el('p', { class: 'small muted simple-only' }, 'How often it repeats is kept as it is. Switch to Detailed view to change it.'),
      err, el('button', { class: 'btn btn-primary', type: 'submit', id: 'e-save' }, 'Save'));
    var close = MP.modal(form, { title: 'Check the details' });
    form.addEventListener('submit', function (e) {
      e.preventDefault();
      var a = amount.input.value === '' ? null : MP.num(amount.input.value, NaN);
      if (a != null && (!isFinite(a) || a < 0 || a > 1e8)) { err.textContent = 'Please enter an amount between £0 and £100,000,000.'; err.hidden = false; return; }
      if (date.value && !parseIso(date.value)) { err.textContent = 'Please choose a valid date.'; err.hidden = false; return; }
      var x = state.items.find(function (y) { return y.id === it.id; }) || it;
      Object.assign(x, { type: type.value, kind: kind.value, company: company.value.trim(), amount: a, dueDate: date.value, frequency: freq.value });
      if (x.type !== 'scam') x.scamReasons = x.scamReasons || [];
      // keep the bills calendar in step
      var bi = state.bills.findIndex(function (b) { return b.id === x.billId; });
      if (bi >= 0) { if (x.amount > 0 && x.dueDate) { state.bills[bi] = billFrom(x); state.bills[bi].id = x.billId; } }
      save(); close(); render();
      if (after && x.amount > 0 && x.dueDate) after(x); else MP.toast('Saved.');
    });
  }

  function detailOnly(node) { node.classList.add('detail-only'); return node; }

  function upcomingView() {
    var sec = el('section', { id: 'panel', role: 'tabpanel', 'aria-labelledby': 'tab-upcoming', class: 'stack' });
    if (!state.bills.length) {
      sec.appendChild(el('div', { class: 'card empty' }, el('div', { class: 'empty-ico', 'aria-hidden': 'true' }, '📅'),
        el('h2', null, 'No bills in your calendar yet'),
        el('p', { class: 'muted' }, 'Press "Add to bills calendar" on a bill or renewal, and it will show here month by month for the next 12 months.')));
      sec.appendChild(tipsCard());
      return sec;
    }
    var rows = upcoming(), year = rows.reduce(function (a, r) { return a + r.bill.amount; }, 0);
    var months = [], byKey = {}, start = today();
    for (var i = 0; i < 12; i++) {
      var d = new Date(start.getFullYear(), start.getMonth() + i, 1), k = d.getFullYear() + '-' + d.getMonth();
      byKey[k] = { date: d, rows: [], total: 0 }; months.push(byKey[k]);
    }
    var endD = new Date(start.getFullYear(), start.getMonth() + 12, 1);
    rows.forEach(function (r) {
      var k = r.date.getFullYear() + '-' + r.date.getMonth();
      if (!byKey[k]) { byKey[k] = { date: new Date(r.date.getFullYear(), r.date.getMonth(), 1), rows: [], total: 0 }; months.push(byKey[k]); }
      byKey[k].rows.push(r); byKey[k].total += r.bill.amount;
    });

    sec.appendChild(el('div', { class: 'card', 'aria-live': 'polite' },
      el('div', { class: 'row', style: { justifyContent: 'space-between', alignItems: 'flex-end' } },
        el('div', null, el('div', { class: 'muted small' }, 'Bills and renewals, next 12 months'), el('div', { class: 'big-number', id: 'year-total' }, MP.money(year))),
        el('div', { class: 'small muted' }, 'About ' + MP.money(year / 12) + ' a month on average')),
      el('div', { class: 'bill-chart detail-only' }, MP.barChart({ items: months.map(function (m) { return { label: m.date.toLocaleDateString('en-GB', { month: 'short', year: '2-digit' }), value: m.total, color: '--c1' }; }), width: 420, labelWidth: 64, label: 'Bills per month for the next 12 months' }))));

    // the bills themselves
    var list = el('ul', { class: 'bill-list', id: 'bill-list' }, state.bills.slice().sort(function (a, b) {
      var na = occurrences(a)[0], nb = occurrences(b)[0]; return (na || endD) - (nb || endD);
    }).map(function (b) {
      var next = occurrences(b)[0], isRenewal = b.type === 'renewal';
      var shop = isRenewal && next ? new Date(next.getFullYear(), next.getMonth(), next.getDate() - 28) : null;
      return el('li', { class: 'bill', dataset: { id: b.id } },
        el('div', { class: 'bill-main' },
          el('strong', { class: 'bill-name' }, b.name),
          el('div', { class: 'small muted' }, (FREQ[b.frequency] || 'One-off') + (b.directDebit ? ' · Direct Debit' : '') + ' · next ' + (next ? MP.fmtDate(next) : 'not in the next 12 months')),
          shop ? el('div', { class: 'small shop-tip' }, '🔎 Start comparing prices from ' + MP.fmtDate(shop < today() ? today() : shop)) : null),
        el('div', { class: 'bill-amt' }, el('strong', null, MP.money(b.amount, true)), next ? countdown(MP.isoDate(next)) : null),
        el('button', { class: 'btn btn-sm btn-ghost remove-bill', type: 'button', 'aria-label': 'Remove ' + b.name, onclick: function () { removeBill(b.id); } }, 'Remove'));
    }));
    sec.appendChild(el('section', { class: 'card', 'aria-labelledby': 'h-bills' }, el('h2', { id: 'h-bills' }, 'Your bills & renewals'), list));

    // month by month
    var monthBox = el('div', { class: 'months', id: 'month-list' });
    months.filter(function (m) { return m.rows.length; }).forEach(function (m) {
      monthBox.appendChild(el('div', { class: 'month' },
        el('div', { class: 'month-head' }, el('h3', null, m.date.toLocaleDateString('en-GB', { month: 'long', year: 'numeric' })), el('strong', { class: 'month-total' }, MP.money(m.total, true))),
        el('ul', null, m.rows.map(function (r) {
          return el('li', null, el('span', { class: 'when' }, r.date.getDate() + ' ' + r.date.toLocaleDateString('en-GB', { month: 'short' })), el('span', { class: 'what' }, r.bill.name), el('span', { class: 'amt' }, MP.money(r.bill.amount, true)));
        }))));
    });
    sec.appendChild(el('section', { class: 'card detail-only', id: 'months-card', 'aria-labelledby': 'h-months' }, el('h2', { id: 'h-months' }, 'Month by month'),
      monthBox.childNodes.length ? monthBox : el('p', { class: 'muted' }, 'None of your bills fall in the next 12 months.'),
      el('p', { class: 'total-line' }, el('span', null, 'Total for the year'), el('strong', null, MP.money(year, true)))));
    sec.appendChild(tipsCard());
    return sec;
  }

  function tipsCard() {
    return el('section', { class: 'card', 'aria-labelledby': 'h-tips' }, el('h2', { id: 'h-tips' }, 'Renewal tips'),
      MP.explain(null, 'The "loyalty penalty" is when staying with the same company costs more than a new customer would pay. Rules now stop this for home and car insurance, but phone, broadband and energy deals can still creep up, so check each renewal.'),
      el('ul', { class: 'small' },
        el('li', null, el('strong', null, 'Shop around 3 to 4 weeks before a renewal. '), 'Insurance quotes are often cheapest when you buy about 20 to 27 days before the start date, and dearer at the last minute.'),
        el('li', null, el('strong', null, 'Loyalty penalty rules: '), 'since January 2022, home and car insurers must not charge you more to renew than they would charge a new customer for the same cover through the same channel (FCA rules). Comparing can still save money, because other insurers may be cheaper.'),
        el('li', null, el('strong', null, 'Mobile and broadband: '), 'since January 2025, any mid-contract price rises must be shown in pounds and pence when you sign up (Ofcom). Near the end of your contract, ask for a better deal or switch.'),
        el('li', null, el('strong', null, 'Energy: '), 'the price cap changes every 3 months (January, April, July, October). Check your tariff, and send meter readings so bills are accurate.'),
        el('li', null, el('strong', null, 'Don\'t let it roll over without a look. '), 'Auto-renewal is convenient, but check the price against last year every time.')));
  }

  function howTo() {
    return el('details', { class: 'card' }, el('summary', null, 'How to use this, and tips'),
      el('h3', null, 'Saving an email as a file'),
      el('ul', { class: 'small' },
        el('li', null, el('strong', null, 'Gmail (computer): '), 'open the email, press the three dots (⋮) at the top right, then "Download message". This saves an .eml file.'),
        el('li', null, el('strong', null, 'Outlook: '), 'in new Outlook or Outlook on the web, open the email, press the three dots (…), then "Save as" or "Download". Older Outlook saves .msg files, which a browser can\'t read, so copy the text and paste it here instead.'),
        el('li', null, el('strong', null, 'Apple Mail: '), 'select the email, then File > Save As and choose "Raw Message Source", or drag the email to your desktop. Several emails? Mailbox > Export Mailbox makes an .mbox file.'),
        el('li', null, el('strong', null, 'On a phone: '), 'open the email, select all the text, copy it and paste it into the box. Paper letter? Type in the amount and date, or save it as a PDF.')),
      el('h3', null, 'Spotting scams'),
      el('ul', { class: 'small' },
        el('li', null, 'Check the sender\'s full email address, not just the name. HMRC emails come from addresses ending in gov.uk, but scammers can fake names easily.'),
        el('li', null, 'Never give your password, PIN or full card details in reply to an email, text or call. Your bank and HMRC will never ask for them.'),
        el('li', null, 'Not sure? Don\'t use the links or phone numbers in the message. Call the company on a number you know, like the one on your card or their official website.'),
        el('li', null, 'Report scam emails to report@phishing.gov.uk. Forward scam texts to 7726 (free). If you have lost money, tell your bank straight away.')),
      el('h3', null, 'Staying on top of bills'),
      el('ul', { class: 'small' },
        el('li', null, 'Add each bill to the calendar, then set a reminder on your phone about 4 weeks before each renewal date.'),
        el('li', null, '"Plan for it" turns a big yearly bill into a small monthly amount in Dreams & goals, so it never comes as a shock.'),
        el('li', null, 'We read emails automatically and can get things wrong. Press Edit to fix the amount, date or type before you save it.'),
        el('li', null, 'Only the key facts and the first 500 characters of each email are kept. Use Clear all to remove everything.')));
  }

  function clearAll() {
    if (!MP.confirm('Remove all messages and bills from the Money inbox? Plans you made in Dreams & goals stay.')) return;
    state = { items: [], bills: [], tab: 'found' };
    lastStatus = null;
    MP.log('Money inbox: cleared all messages and bills');
    save(); render();
    MP.toast('Cleared.');
  }

  function save() { MP.set('tools.inbox', state); }
  function saveSummary() {
    if (!state.items.length && !state.bills.length) { MP.set('summaries.inbox', undefined); return; }
    var soon = upcoming().filter(function (r) { return (r.date - today()) / 864e5 <= 30; }).length;
    var text;
    if (state.bills.length) text = soon + (soon === 1 ? ' bill' : ' bills') + ' due in the next 30 days';
    else text = state.items.length + (state.items.length === 1 ? ' message' : ' messages') + ' read, no bills added yet';
    MP.summary('inbox', text);
  }

  MP.onPrefs(render);
  render();
});
