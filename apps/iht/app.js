/* Inheritance tax & estate: estimate inheritance tax (IHT) on an estate, including the home, gifts made
   in the last 7 years and, from 6 April 2027, unused pensions. Shows the allowances, a breakdown, ways
   people reduce the bill (education, not advice) and an estate checklist. Inputs are saved at 'tools.iht'. */
MP.page({ id: 'iht', title: 'Inheritance tax & estate' }).then(function () {
  'use strict';
  var el = MP.el, main = MP.$('#app');
  var R = UK.R.iht;
  var DAY = 864e5, YEAR = 365.25 * DAY;

  var STATUS = [
    { value: 'single', label: 'Single' },
    { value: 'married', label: 'Married or civil partner' },
    { value: 'widowed', label: 'Widowed' }
  ];
  var GIFT_KINDS = {
    gift: 'Gift to a person or trust',
    income: 'Regular gift from spare income',
    small: 'Small gift (up to £250 to one person)',
    exempt: 'To a spouse, civil partner or charity'
  };
  var CHECKS = [
    { key: 'executors', label: 'I have chosen executors and asked them', hint: 'The people who sort out your estate. Many people choose one or two family members, a friend or a solicitor.' },
    { key: 'lpa', label: 'I have made lasting powers of attorney', hint: 'One for money and property, one for health and care. Register them with the Office of the Public Guardian.', term: 'lpa' },
    { key: 'accounts', label: 'I keep a list of my accounts, pensions and policies', hint: 'Where they are and who to contact. Not your passwords.' },
    { key: 'digital', label: 'I have thought about my digital assets', hint: 'Photos, email, social media, online accounts and any crypto. Many services let you name a legacy contact.' },
    { key: 'funeral', label: 'My family knows my funeral wishes', hint: 'Burial or cremation, any plan you have paid for, and the kind of service you would like.' },
    { key: 'nominations', label: 'I have filled in pension "expression of wish" forms', hint: 'This tells your pension scheme who you would like to get your pension if you die.' }
  ];

  var prefs = MP.prefs(), answers = prefs.answers || {}, profile = MP.profile();
  var region = profile.region || answers.region || 'england';

  function defaults() {
    var dep = answers.dependants || (profile.dependants > 0 ? 'children' : '');
    var homePrice = +answers.homePrice > 0 ? Math.round(+answers.homePrice) : 450000;
    return {
      status: dep === 'partner' || dep === 'both' || +answers.partnerSalary > 0 ? 'married' : 'single',
      homeValue: homePrice, homeShare: 100, homeToDesc: dep !== 'partner' && dep !== 'none',
      otherProperty: 0, savings: 80000, isas: 60000,
      pensions: 250000, after2027: true,
      mortgage: 60000, loans: 0, funeral: 5000,
      business: 0, possessions: 0, life: 0,
      tNrb: 100, tRnrb: 100, spouseAll: false, charity: 0,
      gifts: [],
      tries: {}, tryGift: 100000, tryIncome: 250,
      will: answers.will === 'yes' || answers.will === 'old' || answers.will === 'no' ? answers.will : '',
      willDate: '', checks: {}
    };
  }
  var s = Object.assign(defaults(), MP.get('tools.iht', null) || {});
  if (!Array.isArray(s.gifts)) s.gifts = [];
  if (!s.tries || typeof s.tries !== 'object') s.tries = {};
  if (!s.checks || typeof s.checks !== 'object') s.checks = {};
  var logged = false;

  /* ---------- the maths ---------- */
  function pos(v) { v = +v; return isFinite(v) && v > 0 ? v : 0; }
  function taxYear(d) { var y = d.getFullYear(); return (d.getMonth() > 3 || (d.getMonth() === 3 && d.getDate() >= 6)) ? y : y - 1; }
  function taperRate(yearsAgo) {
    for (var i = 0; i < R.giftTaper.length; i++) if (yearsAgo < R.giftTaper[i].years) return R.giftTaper[i].rate;
    return 0;
  }

  /* Gifts made in life. Exempt gifts are removed, then the £3,000 annual exemption (with one year carried
     forward) is used in date order. Gifts in the last 7 years use up the nil-rate band first; any part over
     it is taxed at 40%, less taper relief for gifts made 3 to 7 years before death (taken as today). */
  function giftCalc(gifts, nrbTotal) {
    var now = new Date();
    var rows = (gifts || []).map(function (g) {
      var d = g.date ? new Date(g.date) : null;
      if (!d || isNaN(d)) d = now;
      if (d > now) d = now;
      return { g: g, date: d, amount: pos(g.amount), kind: GIFT_KINDS[g.kind] ? g.kind : 'gift', exempt: 0, ae: 0, chargeable: 0, nrb: 0, tax: 0, rate: 0, yearsAgo: (now - d) / YEAR };
    }).sort(function (a, b) { return a.date - b.date; });
    // outright exemptions
    var byYear = {};
    rows.forEach(function (r) {
      if (r.kind === 'exempt' || r.kind === 'income' || (r.kind === 'small' && r.amount <= R.smallGift)) { r.exempt = r.amount; return; }
      var y = taxYear(r.date); (byYear[y] = byYear[y] || []).push(r);
    });
    // annual exemption with one year carried forward (the year before the first gift is taken as unused)
    var years = Object.keys(byYear).map(Number).sort(function (a, b) { return a - b; });
    if (years.length) {
      var prevUnused = R.annualExemption;
      for (var y = years[0]; y <= years[years.length - 1]; y++) {
        var own = R.annualExemption, carry = prevUnused;
        (byYear[y] || []).forEach(function (r) {
          var a = Math.min(own, r.amount); own -= a;
          var b = Math.min(carry, r.amount - a); carry -= b;
          r.ae = a + b;
        });
        prevUnused = own;
      }
    }
    var left = nrbTotal, chargeable = 0, tax = 0;
    rows.forEach(function (r) {
      r.within = r.yearsAgo < 7;
      if (!r.within) return;
      r.chargeable = Math.max(0, r.amount - r.exempt - r.ae);
      r.nrb = Math.min(left, r.chargeable); left -= r.nrb;
      r.rate = taperRate(r.yearsAgo);
      r.tax = (r.chargeable - r.nrb) * r.rate;
      chargeable += r.chargeable; tax += r.tax;
    });
    return { rows: rows, chargeable: chargeable, tax: tax };
  }

  /* st: the inputs (or a copy changed by a "try it" toggle). Returns every figure in the breakdown. */
  function calc(st) {
    var married = st.status === 'married', widowed = st.status === 'widowed';
    var tN = widowed ? MP.clamp(+st.tNrb || 0, 0, 100) / 100 : 0;
    var tR = widowed ? MP.clamp(+st.tRnrb || 0, 0, 100) / 100 : 0;
    var home = pos(st.homeValue) * MP.clamp(st.homeShare == null || st.homeShare === '' ? 100 : +st.homeShare, 0, 100) / 100;
    var assets = {
      home: home,
      otherProperty: pos(st.otherProperty),
      savings: pos(st.savings),
      isas: pos(st.isas),
      pensions: st.after2027 && !st.pensionsOut ? pos(st.pensions) : 0,
      business: pos(st.business),
      possessions: pos(st.possessions),
      life: st.lifeOut ? 0 : pos(st.life)
    };
    var gross = Object.keys(assets).reduce(function (a, k) { return a + assets[k]; }, 0);
    gross = Math.max(0, gross + (+st.adjust || 0));
    var debts = pos(st.mortgage) + pos(st.loans) + pos(st.funeral);
    var net = Math.max(0, gross - debts);
    var homeNet = Math.max(0, home - pos(st.mortgage));

    // business and agricultural relief: 100% up to the cap, then 50%
    var cap = R.businessReliefFullCap;
    var br = Math.min(net, Math.min(assets.business, cap) + Math.max(0, assets.business - cap) * 0.5);

    var nrbTotal = R.nilRateBand * (1 + tN);
    var gifts = giftCalc(st.gifts, nrbTotal);
    var nrbLeft = Math.max(0, nrbTotal - gifts.chargeable);

    var rnrbMax = R.residenceNilRateBand * (1 + tR);
    var taper = Math.max(0, (net - R.rnrbTaperStart) / 2);
    var rnrbAvail = Math.max(0, rnrbMax - taper);
    var rnrb = st.homeToDesc ? Math.min(rnrbAvail, homeNet) : 0;

    var charity = Math.min(pos(st.charity), net - br);
    var spouseEx = married && st.spouseAll ? Math.max(0, net - br - charity) : 0;
    var afterEx = Math.max(0, net - br - charity - spouseEx);
    // charity rate test: the "baseline" is the estate after reliefs, exemptions (other than charity) and the nil-rate band
    var baseline = Math.max(0, net - br - spouseEx - nrbLeft);
    var charityRate = charity > 0 && baseline > 0 && charity + 0.5 >= R.charityShare * baseline;
    var rate = charityRate ? R.charityRate : R.rate;

    var nrbUsed = Math.min(nrbLeft, afterEx);
    var rnrbUsed = Math.min(rnrb, afterEx - nrbUsed);
    var taxable = Math.max(0, afterEx - nrbUsed - rnrbUsed);
    var estateTax = taxable * rate;
    var nrbUnused = Math.max(0, nrbTotal - gifts.chargeable - nrbUsed);
    var rnrbUnused = Math.max(0, rnrbAvail - rnrbUsed);
    return {
      assets: assets, gross: gross, debts: debts, net: net, homeNet: homeNet,
      br: br, charity: charity, spouseEx: spouseEx, exemptions: br + charity + spouseEx,
      nrbTotal: nrbTotal, nrbLeft: nrbLeft, nrbUsed: nrbUsed, gifts: gifts,
      rnrbMax: rnrbMax, taper: Math.min(taper, rnrbMax), rnrbAvail: rnrbAvail, rnrb: rnrb, rnrbUsed: rnrbUsed,
      allowances: nrbUsed + rnrbUsed, baseline: baseline, charityRate: charityRate, rate: rate,
      taxable: taxable, estateTax: estateTax, giftTax: gifts.tax, tax: estateTax + gifts.tax,
      receive: Math.max(0, net - charity - estateTax), effective: net > 0 ? estateTax / net : 0,
      nrbUnusedPct: nrbTotal > 0 ? Math.round(nrbUnused / nrbTotal * 100) : 0,
      rnrbUnusedPct: rnrbMax > 0 ? Math.round(rnrbUnused / rnrbMax * 100) : 0,
      married: married, widowed: widowed
    };
  }

  /* The inputs used for the estimate. Simple view ignores the Detailed-only inputs and uses sensible defaults:
     nothing extra, no gifts or charity, and a widow(er) gets 100% of both allowances passed on. */
  function eff() {
    if (MP.isDetailed()) return s;
    var c = JSON.parse(JSON.stringify(s));
    c.business = 0; c.possessions = 0; c.life = 0; c.tNrb = 100; c.tRnrb = 100; c.spouseAll = false; c.charity = 0; c.gifts = [];
    return c;
  }
  function hiddenExtras() {
    return !MP.isDetailed() && (pos(s.business) || pos(s.possessions) || pos(s.life) || pos(s.charity) || s.gifts.length ||
      (s.status === 'married' && s.spouseAll) || (s.status === 'widowed' && (+s.tNrb !== 100 || +s.tRnrb !== 100)));
  }

  /* "Ways people reduce inheritance tax": each one changes a copy of the inputs. */
  var TRIES = [
    { key: 'ae', title: 'Use the £3,000 annual exemption',
      text: function () { return 'You can give away ' + MP.money(R.annualExemption) + ' each tax year and it leaves your estate straight away. Over 7 years that is ' + MP.money(R.annualExemption * 7) + ' (a couple can give twice as much).'; },
      apply: function (c) { c.adjust = (c.adjust || 0) - R.annualExemption * 7; } },
    { key: 'income', title: 'Give regularly from spare income',
      text: function () { return 'Regular gifts from income you do not need (not from savings) are free of IHT with no limit, if you keep records. Here: ' + MP.money(s.tryIncome) + ' a month for 10 years, compared with saving it.'; },
      input: 'tryIncome', inputLabel: 'A month',
      // the money would otherwise build up in the estate, so compare against an estate that is larger by that amount
      ref: function (c) { c.adjust = (c.adjust || 0) + pos(s.tryIncome) * 120; } },
    { key: 'charity', title: 'Leave 10% to charity',
      text: function (m) { return 'Gifts to charity are free of IHT, and leaving at least 10% of your "baseline" estate (' + MP.money(Math.ceil(m.baseline * R.charityShare)) + ' here) cuts the rate on the rest from 40% to 36%.'; },
      apply: function (c, m) { c.charity = Math.max(pos(c.charity), Math.ceil(m.baseline * R.charityShare)); } },
    { key: 'trust', title: 'Put life insurance in trust',
      text: function () { return pos(eff().life) > 0 ? 'A life policy written in trust pays out to your family directly, outside your estate. Most insurers do this for free.' : 'A life policy written in trust pays out outside your estate. ' + (MP.isDetailed() ? 'Add any life policies not in trust above' : 'Switch to Detailed and add any life policies not in trust') + ' to see the effect.'; },
      apply: function (c) { c.lifeOut = true; } },
    { key: 'gift7', title: 'Give money away and live 7 more years',
      text: function () { return 'A gift to a person is free of IHT if you live 7 years after it. If you die sooner, it uses up your tax-free allowance first. Only give what you can afford to live without.'; },
      input: 'tryGift', inputLabel: 'Amount',
      apply: function (c) { c.adjust = (c.adjust || 0) - pos(s.tryGift); } },
    { key: 'pension', title: 'Plan for pensions counting from 2027',
      text: function () { return 'From 6 April 2027 most unused pensions count towards your estate. Pensions left to a spouse or civil partner stay tax-free, and some people now spend pension money in later life and keep other savings to pass on. Withdrawals can be taxed as income.'; },
      apply: function (c) { c.pensionsOut = true; } }
  ];
  function scenario(keys) {
    var st = eff(), base = calc(st);
    var ref = JSON.parse(JSON.stringify(st)), act = JSON.parse(JSON.stringify(st));
    keys.forEach(function (k) {
      var t = TRIES.filter(function (x) { return x.key === k; })[0];
      if (!t) return;
      if (t.ref) t.ref(ref, base);
      if (t.apply) t.apply(act, base);
    });
    var r = calc(ref), a = calc(act);
    return { ref: r.tax, tax: a.tax, saving: Math.max(0, r.tax - a.tax) };
  }

  /* ---------- render ---------- */
  var resultsBox, breakdownBox, giftsBox, triesBox, checklistBox, statusHint, transferBox, spouseBox;

  function render() {
    main.innerHTML = '';
    main.appendChild(el('div', { class: 'row', style: { justifyContent: 'space-between', margin: '6px 0 14px' } },
      el('div', { style: { minWidth: 0, flex: '1 1 300px' } }, el('h1', { style: { margin: 0 } }, 'Inheritance tax & estate'),
        el('p', { class: 'muted', style: { margin: 0 } }, 'Estimate inheritance tax on your estate, including your home, gifts and pensions from 2027.'),
        el('a', { href: '#h-results', class: 'jump small no-print' }, 'Jump to your results ↓')),
      el('button', { class: 'btn', type: 'button', id: 'reset', onclick: reset }, 'Reset')));

    var split = el('div', { class: 'split' });
    split.appendChild(el('div', { class: 'stack' }, aboutCard(), assetsCard(), debtsCard(), moreCard(), giftsCard(), charityCard()));
    resultsBox = el('section', { class: 'card', 'aria-labelledby': 'h-results', id: 'results' });
    breakdownBox = el('section', { class: 'card', 'aria-labelledby': 'h-breakdown' });
    triesBox = el('section', { class: 'card', 'aria-labelledby': 'h-tries' });
    checklistBox = el('section', { class: 'card', 'aria-labelledby': 'h-check' });
    split.appendChild(el('div', { class: 'stack' }, resultsBox, breakdownBox, triesBox, checklistBox, MP.adviceCard('iht'), howTo()));
    main.appendChild(split);
    drawChecklist();
    drawGifts();
    update(true);
  }

  function money(id, key, lo, hi) {
    var m = MP.moneyInput({ id: id, value: s[key] === 0 || s[key] ? s[key] : '' });
    m.input.addEventListener('input', function () { s[key] = MP.clamp(MP.num(m.input.value), lo || 0, hi || 1e10); update(); });
    return m.wrap;
  }
  function check(id, key, label, after) {
    var c = el('input', { type: 'checkbox', id: id, checked: !!s[key] });
    c.addEventListener('change', function () { s[key] = c.checked; if (after) after(); update(); });
    return el('label', { class: 'check' }, c, el('span', null, label));
  }
  function pctInput(id, key) {
    var i = el('input', { type: 'number', id: id, inputmode: 'decimal', min: 0, max: 100, step: 1, value: s[key] });
    i.addEventListener('input', function () { s[key] = MP.clamp(MP.num(i.value), 0, 100); update(); });
    return i;
  }

  function aboutCard() {
    var status = MP.seg(STATUS, s.status, function (v) { s.status = v; update(); }, 'Your situation');
    status.id = 'status';
    statusHint = el('p', { class: 'small muted', id: 'status-hint', style: { margin: '6px 0 0' } });
    var share = el('input', { type: 'number', id: 'home-share', inputmode: 'decimal', min: 0, max: 100, step: 1, value: s.homeShare });
    share.addEventListener('input', function () { s.homeShare = MP.clamp(MP.num(share.value, 100), 0, 100); update(); });
    var desc = MP.seg([{ value: 'yes', label: 'Yes' }, { value: 'no', label: 'No' }], s.homeToDesc ? 'yes' : 'no', function (v) { s.homeToDesc = v === 'yes'; update(); }, 'Will your home go to your children or grandchildren?');
    desc.id = 'home-desc';
    transferBox = el('div', { class: 'detail-only panel', id: 'transfer-box', style: { marginTop: '12px' } },
      el('h3', null, 'Allowances passed on by your late spouse'),
      el('p', { class: 'small muted' }, 'If your husband, wife or civil partner did not use all their allowances (for example, they left everything to you), the unused share passes to you.'),
      el('div', { class: 'grid-2 tight' },
        MP.field('Nil-rate band passed on (%)', pctInput('t-nrb', 'tNrb')),
        MP.field('Residence band passed on (%)', pctInput('t-rnrb', 'tRnrb'))),
      el('p', { class: 'tiny muted', style: { margin: 0 } }, 'Use 100% if they left everything to you. Your executors claim this on form IHT402.'));
    spouseBox = el('div', { class: 'detail-only', id: 'spouse-box' },
      check('spouse-all', 'spouseAll', 'I leave everything to my spouse or civil partner'),
      el('p', { class: 'tiny muted', style: { margin: '0 0 6px' } }, 'Gifts between spouses and civil partners living in the UK are free of IHT. Your unused allowances then pass to them.'));
    return el('section', { class: 'card', 'aria-labelledby': 'h-about' },
      el('h2', { id: 'h-about' }, 'You and your home'),
      el('div', { class: 'field' }, el('span', { class: 'label' }, 'Your situation'), status, statusHint),
      spouseBox,
      transferBox,
      el('div', { class: 'grid-2 tight', style: { marginTop: '12px' } },
        MP.field('Value of your home', money('home-value', 'homeValue')),
        MP.field('Your share (%)', share, 'Joint owners often own 50%')),
      el('div', { class: 'field' }, el('span', { class: 'label' }, 'Will your home go to your children or grandchildren?'), desc,
        el('span', { class: 'hint' }, 'Including step-children, adopted and foster children. This unlocks the residence nil-rate band.')));
  }

  function assetsCard() {
    return el('section', { class: 'card', 'aria-labelledby': 'h-assets' },
      el('h2', { id: 'h-assets' }, 'What you own'),
      el('div', { class: 'grid-2 tight' },
        MP.field('Savings and investments', money('savings', 'savings'), 'Bank accounts, shares, funds'),
        MP.field('ISAs', money('isas', 'isas'), 'ISAs are not free of IHT'),
        MP.field('Other property', money('other-property', 'otherProperty'), 'Second home, buy-to-let (your share)'),
        MP.field('Pensions not yet used', money('pensions', 'pensions'), 'All your pension pots')),
      check('after-2027', 'after2027', 'Count pensions (death after 6 April 2027)'),
      el('p', { class: 'tiny muted', style: { margin: 0 } }, 'From 6 April 2027 most unused pensions and pension death benefits count towards your estate. Death-in-service lump sums do not.'));
  }

  function debtsCard() {
    return el('section', { class: 'card', 'aria-labelledby': 'h-debts' },
      el('h2', { id: 'h-debts' }, 'What you owe'),
      el('div', { class: 'grid-2 tight' },
        MP.field('Mortgage (your share)', money('mortgage', 'mortgage')),
        MP.field('Loans and cards', money('loans', 'loans')),
        MP.field('Funeral costs', money('funeral', 'funeral'), 'A typical UK funeral costs around £4,000 to £5,000')));
  }

  function moreCard() {
    return el('section', { class: 'card detail-only', 'aria-labelledby': 'h-more' },
      el('h2', { id: 'h-more' }, 'Other things in your estate'),
      el('div', { class: 'grid-2 tight' },
        MP.field('Business or farm assets', money('business', 'business'), '100% relief up to ' + MP.shortMoney(R.businessReliefFullCap) + ', then 50%'),
        MP.field('Possessions', money('possessions', 'possessions'), 'Car, jewellery, furniture, art'),
        MP.field('Life policies not in trust', money('life', 'life'), 'Pay-outs that would go into your estate')),
      el('p', { class: 'tiny muted', style: { margin: 0 } }, 'Business and agricultural relief only applies to qualifying assets, such as a trading business or working farm, not shares listed on a main stock market. Check the rules on gov.uk.'));
  }

  function charityCard() {
    return el('section', { class: 'card detail-only', 'aria-labelledby': 'h-charity' },
      el('h2', { id: 'h-charity' }, 'Gifts to charity in your will'),
      MP.field('Amount left to charity', money('charity', 'charity'), 'Free of IHT. Leave 10% or more of the baseline and the rest is taxed at 36%.'),
      el('p', { class: 'small', id: 'charity-out', 'aria-live': 'polite', style: { margin: 0 } }));
  }

  function giftsCard() {
    giftsBox = el('div', { class: 'gifts', id: 'gifts' });
    return el('section', { class: 'card detail-only', 'aria-labelledby': 'h-gifts' },
      el('h2', { id: 'h-gifts' }, 'Gifts in the last 7 years'),
      el('p', { class: 'small muted' }, 'Gifts to people count against your tax-free allowance if you die within 7 years. Each year ' + MP.money(R.annualExemption) + ' of gifts is exempt (plus last year\'s if unused), as are small gifts and regular gifts from spare income.'),
      giftsBox,
      el('button', { class: 'btn btn-sm', type: 'button', id: 'add-gift', style: { marginTop: '10px' }, onclick: function () {
        var d = new Date(); d.setFullYear(d.getFullYear() - 2);
        s.gifts.push({ id: MP.uid(), date: MP.isoDate(d), amount: 10000, kind: 'gift' });
        drawGifts(); update();
        var last = MP.$('#gift-amount-' + (s.gifts.length - 1)); if (last) last.focus();
      } }, '＋ Add a gift'));
  }
  function drawGifts() {
    giftsBox.innerHTML = '';
    if (!s.gifts.length) giftsBox.appendChild(el('p', { class: 'small muted', style: { margin: 0 } }, 'No gifts added.'));
    s.gifts.forEach(function (g, i) {
      var date = el('input', { type: 'date', id: 'gift-date-' + i, value: g.date || '', max: MP.isoDate(new Date()) });
      date.addEventListener('change', function () { g.date = date.value; update(); });
      var amt = MP.moneyInput({ id: 'gift-amount-' + i, value: g.amount });
      amt.input.addEventListener('input', function () { g.amount = MP.clamp(MP.num(amt.input.value), 0, 1e10); update(); });
      var kind = el('select', { id: 'gift-kind-' + i }, Object.keys(GIFT_KINDS).map(function (k) { return el('option', { value: k, selected: g.kind === k }, GIFT_KINDS[k]); }));
      kind.onchange = function () { g.kind = kind.value; update(); };
      giftsBox.appendChild(el('div', { class: 'gift panel' },
        el('div', { class: 'gift-row' }, MP.field('Date', date), MP.field('Amount', amt.wrap)),
        MP.field('Type of gift', kind),
        el('div', { class: 'gift-foot' },
          el('span', { class: 'small gift-out', id: 'gift-out-' + i }),
          el('button', { class: 'btn btn-sm btn-ghost remove-gift', type: 'button', 'aria-label': 'Remove gift ' + (i + 1), onclick: function () {
            s.gifts.splice(i, 1); drawGifts(); update();
          } }, 'Remove'))));
    });
  }

  function drawChecklist() {
    var box = checklistBox;
    box.innerHTML = '';
    var will = MP.seg([{ value: 'yes', label: 'Yes, up to date' }, { value: 'old', label: 'Yes, but old' }, { value: 'no', label: 'No' }], s.will, function (v) { s.will = v; drawChecklist(); update(); }, 'Have you made a will?');
    will.id = 'will-status';
    var wd = el('input', { type: 'date', id: 'will-date', value: s.willDate || '', max: MP.isoDate(new Date()) });
    wd.addEventListener('change', function () { s.willDate = wd.value; drawChecklist(); update(); });
    var done = CHECKS.filter(function (c) { return s.checks[c.key]; }).length + (s.will === 'yes' ? 1 : 0), total = CHECKS.length + 1;
    var years = s.willDate ? (Date.now() - new Date(s.willDate)) / YEAR : null;
    box.appendChild(el('h2', { id: 'h-check' }, 'Estate checklist'));
    box.appendChild(el('div', { class: 'row', style: { justifyContent: 'space-between', marginBottom: '6px' } },
      el('span', { class: 'small muted' }, 'Getting these in order makes things much easier for your family.'),
      el('span', { class: 'chip ' + (done === total ? 'success' : 'info'), id: 'check-count' }, done + ' of ' + total + ' done')));
    box.appendChild(el('div', { class: 'progress', role: 'progressbar', 'aria-label': 'Checklist progress', 'aria-valuemin': 0, 'aria-valuemax': total, 'aria-valuenow': done, style: { marginBottom: '14px' } },
      el('span', { style: { width: done / total * 100 + '%' } })));
    box.appendChild(el('div', { class: 'field' }, el('span', { class: 'label' }, 'Have you made a ', MP.term('will', 'will'), '?'), will));
    if (s.will === 'yes' || s.will === 'old') {
      box.appendChild(MP.field('When did you last update it?', wd, 'Review it every 5 years, and after marriage, divorce, a new child or a move. Marriage usually cancels an existing will in England, Wales and Northern Ireland.'));
      if (years != null && years >= 5) box.appendChild(el('p', { class: 'callout warning small', id: 'will-old' }, 'Your will is ' + Math.floor(years) + ' years old. It is worth checking it still says what you want.'));
    }
    if (s.will === 'no') box.appendChild(intestacy());
    box.appendChild(el('ul', { class: 'checklist' }, CHECKS.map(function (c) {
      var cb = el('input', { type: 'checkbox', id: 'ck-' + c.key, checked: !!s.checks[c.key] });
      cb.addEventListener('change', function () { s.checks[c.key] = cb.checked; drawChecklist(); update(); var n = MP.$('#ck-' + c.key); if (n) n.focus(); });
      return el('li', null, el('label', { class: 'check' }, cb, el('span', null, c.label)), el('p', { class: 'tiny muted' }, c.term ? [MP.term(c.term, 'What is this?'), ' '] : null, c.hint));
    })));
  }

  function intestacy() {
    var scot = region === 'scotland', ni = region === 'ni';
    return el('div', { class: 'callout warning small', id: 'intestacy' },
      el('p', null, el('strong', null, 'Without a will, the law decides who gets what ("intestacy"). ')),
      scot ? el('p', null, 'In Scotland, a husband, wife or civil partner has "prior rights" to the home and some money, and children have "legal rights" to part of the rest. Unmarried partners have no automatic right.') :
        ni ? el('p', null, 'In Northern Ireland, a husband, wife or civil partner gets the first £250,000 and personal items, then shares the rest with children. Unmarried partners have no automatic right.') :
          el('p', null, 'In England and Wales, a husband, wife or civil partner gets personal belongings, the first £322,000 and half of the rest. Children share the other half. With no spouse, it goes to children, then parents, then brothers and sisters. Unmarried partners and step-children get nothing automatically.'),
      el('p', null, 'A will lets you choose, name guardians for children and pick your executors. A solicitor or will writer can help, and many charities run free will schemes.'));
  }

  function howTo() {
    return el('details', { class: 'card' }, el('summary', null, 'How to use this, and tips'),
      el('ul', { class: 'small' },
        el('li', null, 'Enter today\'s values. The estimate works out the tax as if you died today, except that you can count pensions as the rules will be from 6 April 2027.'),
        el('li', null, 'Switch to Detailed to add gifts, business assets, life policies, charity gifts and allowances passed on by a late husband, wife or civil partner.'),
        el('li', null, 'Couples: work out the estimate for the second death too. Choose "Widowed" and set both bands to 100% to see roughly what your family might pay later.'),
        el('li', null, 'Keep a simple record of gifts (date, who, how much) so your executors can show which ones are exempt.'),
        el('li', null, 'Read the official guide at ', el('a', { href: 'https://www.gov.uk/inheritance-tax', target: '_blank', rel: 'noopener' }, 'gov.uk/inheritance-tax'), '. For a will, use a solicitor or a regulated will writer. Trusts are complex: get professional advice before setting one up.'),
        el('li', null, 'This is guidance, not advice. Rules change, and reliefs such as the residence nil-rate band have conditions (for example, "downsizing" rules) that we do not model.')));
  }

  /* ---------- results ---------- */
  function stat(id, label, value, raw) {
    return el('div', { class: 'stat' }, el('span', { class: 'label' }, label), el('span', { class: 'value', id: id, dataset: { value: String(Math.round(raw * 100) / 100) } }, value));
  }

  function update(first) {
    var st = eff(), m = calc(st);
    // inputs that depend on the situation
    transferBox.hidden = s.status !== 'widowed';
    spouseBox.hidden = s.status !== 'married';
    statusHint.textContent = s.status === 'widowed' ? 'We count the allowances passed on by your late husband, wife or civil partner (' + (+st.tNrb || 0) + '% of each band). Change this in Detailed.' :
      s.status === 'married' ? (st.spouseAll ? 'Everything goes to your spouse or civil partner: no IHT now.' : 'Anything you leave to your spouse or civil partner is free of IHT. Choose what they get in Detailed.') :
        'Unmarried partners do not get the spouse exemption.';

    drawResults(m);
    drawBreakdown(m);
    drawGiftOut(m);
    drawTries(m);
    var co = MP.$('#charity-out');
    if (co) co.textContent = m.charity > 0 ? (m.charityRate ? 'This is at least 10% of the baseline (' + MP.money(m.baseline) + '), so the rate is 36%.' : 'To get the 36% rate, leave at least ' + MP.money(Math.ceil(m.baseline * R.charityShare)) + ' (10% of the baseline of ' + MP.money(m.baseline) + ').') :
      m.baseline > 0 ? 'Leaving ' + MP.money(Math.ceil(m.baseline * R.charityShare)) + ' or more would bring the rate down to 36%.' : '';
    if (!first) save(m); else saveSummary(m);
  }

  function drawResults(m) {
    var box = resultsBox;
    box.innerHTML = '';
    box.appendChild(el('h2', { id: 'h-results' }, 'Estimated ', MP.term('iht', 'inheritance tax')));
    var head = el('div', { 'aria-live': 'polite', id: 'headline' });
    head.appendChild(el('div', { class: 'big-number ' + (m.tax > 0 ? 'neg' : 'pos'), id: 'r-tax', dataset: { value: String(Math.round(m.tax * 100) / 100) } }, MP.money(m.tax)));
    head.appendChild(el('p', { class: 'small', style: { margin: '2px 0 0' } },
      m.tax > 0 ? 'on an estate worth ' + MP.money(m.net) + ' after debts. Your beneficiaries would receive about ' + MP.money(m.receive) + '.' :
        m.spouseEx > 0 ? 'Everything goes to your spouse or civil partner, so there is no IHT now.' :
          'Your estate of ' + MP.money(m.net) + ' is within your tax-free allowances.'));
    box.appendChild(head);
    box.appendChild(MP.explain(null, 'Everyone can leave ' + MP.money(R.nilRateBand) + ' free of inheritance tax. This is called the nil-rate band. If your home goes to your children or grandchildren, you get up to ' + MP.money(R.residenceNilRateBand) + ' more (the residence nil-rate band). Tax is usually 40% of anything above these allowances.'));
    box.appendChild(el('div', { class: 'stats' },
      stat('r-net', 'Estate after debts', MP.money(m.net), m.net),
      stat('r-nrb', 'Nil-rate band left', MP.money(m.nrbLeft), m.nrbLeft),
      stat('r-rnrb', 'Residence band', MP.money(m.rnrb), m.rnrb),
      stat('r-taxable', 'Taxable', MP.money(m.taxable), m.taxable),
      stat('r-rate', 'Tax rate', MP.pct(m.rate, 0), m.rate * 100),
      stat('r-effective', 'Effective rate', MP.pct(m.effective, 1), m.effective * 100)));
    var notes = el('ul', { class: 'small notes' });
    if (m.taper > 0 && s.homeToDesc) notes.appendChild(el('li', null, 'Your estate is over ' + MP.money(R.rnrbTaperStart) + ', so the residence band is cut by ' + MP.money(m.taper) + ' (£1 for every £2 over).'));
    if (s.homeToDesc && m.homeNet < m.rnrbAvail && m.homeNet > 0 && m.rnrbAvail > 0 && !m.spouseEx) notes.appendChild(el('li', null, 'The residence band is limited to the value of your home after the mortgage (' + MP.money(m.homeNet) + ').'));
    if (!s.homeToDesc && m.rnrbAvail > 0 && !m.spouseEx) notes.appendChild(el('li', null, 'Leaving your home to children or grandchildren could unlock up to ' + MP.money(Math.min(m.rnrbAvail, m.homeNet)) + ' more tax-free.'));
    if (m.gifts.chargeable > 0) notes.appendChild(el('li', null, 'Gifts in the last 7 years use ' + MP.money(Math.min(m.gifts.chargeable, m.nrbTotal)) + ' of your nil-rate band.' + (m.giftTax > 0 ? ' Tax on gifts: ' + MP.money(m.giftTax) + ' (usually paid by the people who got them).' : '')));
    if (m.married && !m.spouseEx) notes.appendChild(el('li', null, 'If you leave everything to your spouse or civil partner instead, there is no IHT now and your unused allowances pass to them: up to ' + MP.money((R.nilRateBand + R.residenceNilRateBand) * 2) + ' tax-free on the second death.'));
    if (m.married && (m.nrbUnusedPct > 0 || m.rnrbUnusedPct > 0)) notes.appendChild(el('li', { id: 'unused-pass' }, 'Unused allowances that would pass to your spouse or civil partner: ' + m.nrbUnusedPct + '% of the nil-rate band and ' + m.rnrbUnusedPct + '% of the residence band.'));
    if (!s.after2027 && pos(s.pensions) > 0) notes.appendChild(el('li', null, 'Pensions are left out. From 6 April 2027 they would add ' + MP.money(scenarioPensionsIn() - m.tax) + ' of tax.'));
    else if (m.assets.pensions > 0) { var without = calc(Object.assign({}, eff(), { pensionsOut: true })).tax; if (m.tax - without > 0.5) notes.appendChild(el('li', null, 'Counting pensions from 2027 adds ' + MP.money(m.tax - without) + ' to the bill.')); }
    if (hiddenExtras()) notes.appendChild(el('li', { id: 'hidden-note' }, 'Simple view leaves out what you entered in Detailed (such as gifts, charity or possessions). Switch to Detailed to include it.'));
    if (notes.childNodes.length) box.appendChild(notes);
  }
  function scenarioPensionsIn() { return calc(Object.assign({}, eff(), { after2027: true })).tax; }

  function row(label, value, cls, sign) {
    return el('tr', { class: cls || '' }, el('td', null, label), el('td', { class: 'num' }, (sign && value > 0 ? sign + ' ' : '') + MP.money(value)));
  }
  function drawBreakdown(m) {
    var box = breakdownBox;
    box.innerHTML = '';
    box.appendChild(el('h2', { id: 'h-breakdown' }, 'How it is worked out'));
    var a = m.assets, rows = [];
    [['home', 'Home (your share)'], ['otherProperty', 'Other property'], ['savings', 'Savings and investments'], ['isas', 'ISAs'],
      ['pensions', 'Pensions (from 6 April 2027)'], ['business', 'Business or farm assets'], ['possessions', 'Possessions'], ['life', 'Life policies not in trust']].forEach(function (k) {
      if (a[k[0]] > 0) rows.push(row(k[1], a[k[0]], 'sub'));
    });
    rows.push(row('Estate before debts', m.gross, 'total'));
    rows.push(row('Debts and funeral costs', m.debts, 'sub', '−'));
    rows.push(row('Estate after debts', m.net, 'total'));
    if (m.br > 0) rows.push(row('Business or agricultural relief', m.br, 'sub', '−'));
    if (m.charity > 0) rows.push(row('Left to charity', m.charity, 'sub', '−'));
    if (m.spouseEx > 0) rows.push(row('Left to spouse or civil partner', m.spouseEx, 'sub', '−'));
    var nrbNotes = [m.nrbTotal > R.nilRateBand ? 'incl. passed on' : '', m.gifts.chargeable > 0 ? 'after gifts' : ''].filter(Boolean);
    rows.push(row('Nil-rate band used' + (nrbNotes.length ? ' (' + nrbNotes.join(', ') + ')' : ''), m.nrbUsed, 'sub', '−'));
    rows.push(row('Residence nil-rate band used', m.rnrbUsed, 'sub', '−'));
    rows.push(row('Taxable estate', m.taxable, 'total'));
    rows.push(row('Inheritance tax at ' + MP.pct(m.rate, 0), m.estateTax, 'tax'));
    if (m.giftTax > 0) rows.push(row('Tax on gifts made in the last 7 years', m.giftTax, 'tax'));
    if (m.charity > 0) rows.push(row('Charity receives', m.charity, 'sub'));
    rows.push(row('Your beneficiaries receive', m.receive, 'total'));
    box.appendChild(el('div', { class: 'scroll-x' }, el('table', { class: 'table breakdown', id: 'breakdown' }, el('caption', { class: 'visually-hidden' }, 'Inheritance tax breakdown'), el('tbody', null, rows))));
    box.appendChild(el('p', { class: 'small muted', style: { margin: '8px 0 12px' } }, 'Effective rate: ' + MP.pct(m.effective, 1) + ' of your estate after debts goes in inheritance tax.'));
    box.appendChild(MP.barChart({
      label: 'Estate, exemptions, allowances, taxable amount, tax and what beneficiaries receive',
      items: [
        { label: 'Estate', value: m.net, color: '--c1' },
        { label: 'Exempt & relief', value: m.exemptions, color: '--c2' },
        { label: 'Allowances', value: m.allowances, color: '--c7' },
        { label: 'Taxable', value: m.taxable, color: '--c3' },
        { label: 'Tax', value: m.tax, color: '--c5' },
        { label: 'Family gets', value: m.receive, color: '--c4' }
      ]
    }));
  }

  function drawGiftOut(m) {
    m.gifts.rows.forEach(function (r) {
      var i = s.gifts.indexOf(r.g), out = MP.$('#gift-out-' + i);
      if (!out) return;
      var y = Math.floor(r.yearsAgo);
      out.textContent = !r.within ? 'Over 7 years ago: no IHT.' :
        r.exempt >= r.amount ? 'Exempt.' :
          (r.ae > 0 ? MP.money(r.ae) + ' annual exemption. ' : '') + MP.money(r.chargeable) + ' counts' + (r.tax > 0 ? ', tax ' + MP.money(r.tax) + (r.rate < R.rate ? ' after taper (' + y + ' years ago)' : '') : '') + '.';
    });
  }

  function drawTries(m) {
    var box = triesBox;
    box.innerHTML = '';
    box.appendChild(el('h2', { id: 'h-tries' }, 'Ways people reduce inheritance tax'));
    box.appendChild(el('p', { class: 'small muted' }, 'General information, not advice. Tick any to see the effect on your estimate.'));
    var on = Object.keys(s.tries).filter(function (k) { return s.tries[k]; });
    var list = el('ul', { class: 'tries' });
    TRIES.forEach(function (t) {
      var single = scenario([t.key]);
      var cb = el('input', { type: 'checkbox', id: 'try-' + t.key, checked: !!s.tries[t.key], 'aria-describedby': 'try-text-' + t.key });
      cb.addEventListener('change', function () { s.tries[t.key] = cb.checked; update(); var n = MP.$('#try-' + t.key); if (n) n.focus(); });
      if (t.key === 'trust' && !(pos(eff().life) > 0)) cb.disabled = true;
      var extra = null;
      if (t.input) {
        var inp = MP.moneyInput({ id: 'try-' + t.input, value: s[t.input], 'aria-label': t.title + ': ' + t.inputLabel.toLowerCase() });
        inp.input.addEventListener('change', function () { s[t.input] = MP.clamp(MP.num(inp.input.value), 0, 1e9); update(); });
        extra = el('div', { class: 'try-input' }, el('span', { class: 'tiny muted' }, t.inputLabel), inp.wrap);
      }
      list.appendChild(el('li', { class: 'try' + (s.tries[t.key] ? ' on' : '') },
        el('div', { class: 'try-head' },
          el('label', { class: 'check' }, cb, el('strong', null, t.title)),
          el('span', { class: 'chip ' + (single.saving > 0.5 ? 'success' : ''), id: 'try-save-' + t.key, dataset: { value: String(Math.round(single.saving)) } }, single.saving > 0.5 ? 'Saves ' + MP.money(single.saving) : 'No change')),
        el('p', { class: 'small muted', id: 'try-text-' + t.key }, t.text(m)),
        extra));
    });
    box.appendChild(list);
    var combo = scenario(on);
    box.appendChild(el('div', { class: 'callout ' + (on.length && combo.saving > 0.5 ? 'success' : ''), id: 'try-result', 'aria-live': 'polite' },
      !on.length ? el('p', null, 'Tick the ideas above to see how your estimate could change.') :
        el('p', null, 'With the ideas you ticked, the estimate is ', el('strong', { id: 'try-tax', dataset: { value: String(Math.round(combo.tax)) } }, MP.money(combo.tax)),
          ', compared with ' + MP.money(combo.ref) + '. ' + (combo.saving > 0.5 ? 'A saving of about ' + MP.money(combo.saving) + '.' : 'No saving for your estate.'))));
  }

  /* ---------- saving ---------- */
  function saveSummary(m) {
    MP.summary('iht', m.tax > 0.5 ? 'Estimated inheritance tax ' + MP.money(m.tax) : m.spouseEx > 0 ? 'No inheritance tax now: all to spouse' : 'No inheritance tax expected on ' + MP.money(m.net));
  }
  function save(m) {
    MP.set('tools.iht', s);
    saveSummary(m);
    if (!logged) { logged = true; MP.log('Updated the inheritance tax estimate'); }
  }
  function reset() {
    if (!MP.confirm('Clear your inheritance tax estimate and checklist and start again?')) return;
    s = defaults();
    MP.set('tools.iht', undefined);
    MP.set('summaries.iht', undefined);
    MP.log('Reset the inheritance tax estimate');
    render();
    MP.toast('Reset to the starting example.');
  }

  MP.onTheme(function () { update(true); });
  MP.onPrefs(function () { update(true); });
  var lastW = window.innerWidth, rt;
  window.addEventListener('resize', function () { clearTimeout(rt); rt = setTimeout(function () { if (Math.abs(window.innerWidth - lastW) > 40) { lastW = window.innerWidth; update(true); } }, 200); });
  render();
});
