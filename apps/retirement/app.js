/* Retirement planner: project pension pots and the State Pension, compare them with the income
   you want in retirement, and show how to close any gap. Everything is shown in today's money. */
MP.page({ id: 'retirement', title: 'Retirement planner' }).then(function () {
  'use strict';
  var el = MP.el, main = MP.$('#app');
  var P = UK.R.pension, SP = UK.R.statePension, INFL = UK.R.inflation;
  var DRAW_TO_AGE = 90, CHART_TO_AGE = 95;

  /* PLSA Retirement Living Standards (2024), yearly after tax, outside London. */
  var PLSA = {
    single: { minimum: 13400, moderate: 31700, comfortable: 43900 },
    couple: { minimum: 21600, moderate: 43900, comfortable: 60600 }
  };
  var LEVELS = [
    { value: 'minimum', label: 'Minimum', desc: 'Covers all your needs, with some left for fun' },
    { value: 'moderate', label: 'Moderate', desc: 'More security and flexibility' },
    { value: 'comfortable', label: 'Comfortable', desc: 'More freedom, and some luxuries' }
  ];
  var POT_TYPES = { workplace: 'Workplace pension', personal: 'Personal pension', sipp: 'SIPP' };
  var REGIONS = [['england', 'England'], ['wales', 'Wales'], ['scotland', 'Scotland'], ['ni', 'Northern Ireland']];
  var SCEN = [{ value: 'low', label: 'Low' }, { value: 'mid', label: 'Middle' }, { value: 'high', label: 'High' }];
  var RISK_TO_SCEN = { cautious: 'low', balanced: 'mid', adventurous: 'high' };

  var profile = MP.profile();
  var dobAge = profile.dob ? UK.age(profile.dob) : null;
  if (dobAge != null && (dobAge < 16 || dobAge > 100)) dobAge = null;

  function defaults() {
    var age = dobAge != null ? dobAge : 40;
    var s = {
      age: age,
      retireAge: 0,
      pots: [{ id: MP.uid(), name: 'Workplace pension', type: 'workplace', value: 40000 }],
      salary: profile.salary > 0 ? profile.salary : 35000,
      empPct: P.autoEnrolment.employee * 100,
      erPct: P.autoEnrolment.employer * 100,
      basis: 'qualifying',
      scenario: RISK_TO_SCEN[profile.riskAttitude] || 'mid',
      charges: 0.5,
      niYears: Math.max(0, Math.min(35, age - 21)),
      niFuture: null,
      household: 'single',
      level: 'moderate',
      target: PLSA.single.moderate,
      partnerIncome: Math.round(SP.fullWeekly * 52),
      takeLump: true,
      region: profile.region || 'england',
      goalId: null
    };
    s.retireAge = MP.clamp(Math.ceil(spaFor(s.age)), minAccessAge(s.age), 75);
    return s;
  }

  /* ---------- ages ---------- */
  // A date of birth to use for the pension age rules: the real one if it matches the age entered.
  function birthDate(age) {
    if (profile.dob && UK.age(profile.dob) === age) return new Date(profile.dob);
    var d = new Date(); d.setFullYear(d.getFullYear() - age); d.setMonth(d.getMonth() - 6);
    return d;
  }
  function spaFor(age) { return UK.statePensionAge(birthDate(age)); }
  // Normal minimum pension age: 55, rising to 57 on 6 April 2028 (for anyone who is not 55 by then).
  function minAccessAge(age) {
    var b = birthDate(age);
    return b < new Date(1973, 3, 6) ? P.minimumAccessAge : P.minimumAccessAgeFrom2028;
  }
  function ageLabel(a) {
    var y = Math.floor(a), m = Math.round((a - y) * 12);
    return m ? y + ' and ' + m + (m === 1 ? ' month' : ' months') : String(y);
  }

  function duration(y) {
    var whole = Math.floor(y), m = Math.round((y - whole) * 12), parts = [];
    if (whole) parts.push(whole + (whole === 1 ? ' year' : ' years'));
    if (m) parts.push(m + (m === 1 ? ' month' : ' months'));
    return parts.join(' and ') || '0 years';
  }

  var saved = MP.get('tools.retirement', null);
  var s = Object.assign(defaults(), saved || {});
  if (!Array.isArray(s.pots)) s.pots = [];
  var logged = false;

  /* ---------- the maths ---------- */
  function potsTotal() { return s.pots.reduce(function (a, p) { return a + Math.max(0, +p.value || 0); }, 0); }

  function contributions() {
    var sal = Math.max(0, +s.salary || 0), ae = P.autoEnrolment;
    var base = s.basis === 'full' ? sal : Math.max(0, Math.min(sal, ae.upperQE) - ae.lowerQE);
    var you = base * Math.max(0, +s.empPct || 0) / 100, emp = base * Math.max(0, +s.erPct || 0) / 100;
    return { base: base, you: you, employer: emp, total: you + emp, relief: reliefRate(sal) };
  }
  // Rough tax relief on your own contributions at your top rate of tax.
  function reliefRate(sal) {
    if (s.region === 'scotland') return sal > 125140 ? 0.48 : sal > 75000 ? 0.45 : sal > 43662 ? 0.42 : sal > 29526 ? 0.21 : 0.20;
    var b = UK.taxBand(sal);
    return b === 'additional' ? 0.45 : b === 'higher' ? 0.40 : 0.20;
  }
  function netRate() { return (UK.R.growth[s.scenario] || UK.R.growth.mid) - MP.clamp(+s.charges || 0, 0, 5) / 100; }
  function autoNiFuture(retireAge, spa) { return Math.max(0, Math.floor(Math.min(retireAge, spa) - s.age)); }
  function tax(gross) { return UK.incomeTax(Math.max(0, gross), s.region).tax; }
  // Level yearly withdrawal, taken at the start of each year, that empties the pot after n years.
  function drawdown(pot, r, n) {
    if (pot <= 0) return 0;
    if (Math.abs(r) < 1e-9) return pot / n;
    return pot * r / ((1 - Math.pow(1 + r, -n)) * (1 + r));
  }

  /* o: overrides {retireAge, extraMonthly, potReal}. All results in today's money. */
  function model(o) {
    o = o || {};
    var ra = o.retireAge != null ? o.retireAge : s.retireAge;
    var years = Math.max(0, ra - s.age), rate = netRate();
    var c = contributions();
    var fv = UK.futureValue({ start: potsTotal(), monthly: c.total / 12 + (o.extraMonthly || 0), years: years, rate: rate, escalate: INFL });
    var defl = Math.pow(1 + INFL, years);
    var potNom = o.potReal != null ? o.potReal * defl : fv.balance;
    var potReal = potNom / defl;
    var lumpNom = Math.min(P.taxFreeFraction * potNom, P.lumpSumAllowance), lumpReal = lumpNom / defl;
    var drawPot = s.takeLump ? potReal - lumpReal : potReal;
    var taxFreeShare = s.takeLump || potNom <= 0 ? 0 : lumpNom / potNom;
    var rr = (1 + rate) / (1 + INFL) - 1, n = Math.max(1, DRAW_TO_AGE - ra);
    var draw = drawdown(drawPot, rr, n);
    var spa = spaFor(s.age);
    var niFuture = s.niFuture == null || s.niFuture === '' ? autoNiFuture(ra, spa) : Math.max(0, +s.niFuture || 0);
    var niTotal = Math.max(0, +s.niYears || 0) + niFuture;
    var spWeekly = niTotal >= SP.qualifyingYearsMin ? SP.fullWeekly * Math.min(SP.qualifyingYearsFull, niTotal) / SP.qualifyingYearsFull : 0;
    var spYear = spWeekly * 52;
    var taxableDraw = draw * (1 - taxFreeShare);
    var partner = s.household === 'couple' ? Math.max(0, +s.partnerIncome || 0) : 0;
    var taxPre = tax(taxableDraw), taxPost = tax(taxableDraw + spYear);
    var netPre = draw - taxPre + partner, netPost = draw + spYear - taxPost + partner;
    return {
      retireAge: ra, years: years, rate: rate, rr: rr, contrib: c, fv: fv, defl: defl, potNom: potNom, potReal: potReal,
      lumpNom: lumpNom, lumpReal: lumpReal, drawPot: drawPot, draw: draw, taxFreeShare: taxFreeShare, spa: spa,
      niFuture: niFuture, niTotal: niTotal, spWeekly: spWeekly, spYear: spYear, partner: partner,
      taxPre: taxPre, taxPost: taxPost, netPre: netPre, netPost: netPost,
      target: Math.max(0, +s.target || 0), gap: Math.max(0, +s.target || 0) - netPost,
      bridging: ra < spa, bridgeYears: Math.max(0, spa - ra)
    };
  }

  function solve(fn, lo, hi) { // smallest x in [lo, hi] with fn(x) true (fn increasing), or null
    if (!fn(hi)) return null;
    for (var i = 0; i < 50; i++) { var mid = (lo + hi) / 2; if (fn(mid)) hi = mid; else lo = mid; }
    return hi;
  }
  function closeGap(m) {
    if (m.gap <= 0.5) return null;
    var extra = m.years >= 1 ? solve(function (x) { return model({ extraMonthly: x }).gap <= 0.5; }, 0, 50000) : null;
    var later = null;
    for (var a = Math.floor(s.retireAge) + 1; a <= 75; a++) { if (model({ retireAge: a }).gap <= 0.5) { later = a; break; } }
    return { extra: extra, later: later };
  }
  function potNeeded(m) {
    var cap = Math.max(1e7, m.potReal * 4);
    var need = solve(function (x) { return model({ potReal: x }).gap <= 0.5; }, 0, cap);
    return need == null ? null : need;
  }

  /* ---------- render ---------- */
  var resultsBox, chartsBox, gapBox;

  function render() {
    main.innerHTML = '';
    main.appendChild(el('div', { class: 'row', style: { justifyContent: 'space-between', margin: '6px 0 14px' } },
      el('div', null, el('h1', { style: { margin: 0 } }, 'Retirement planner'),
        el('p', { class: 'muted', style: { margin: 0 } }, 'See what your pensions and State Pension could pay, and the gap to the income you want.'),
        el('a', { href: '#h-results', class: 'jump small no-print' }, 'Jump to your results ↓')),
      el('button', { class: 'btn', type: 'button', id: 'reset', onclick: reset }, 'Reset')));

    var split = el('div', { class: 'split' });
    split.appendChild(el('div', { class: 'stack' }, aboutCard(), potsCard(), contribCard(), stateCard(), targetCard()));
    resultsBox = el('section', { class: 'card', 'aria-labelledby': 'h-results' });
    gapBox = el('div', { 'aria-live': 'polite', id: 'gap-box' });
    chartsBox = el('section', { class: 'card', 'aria-labelledby': 'h-charts' });
    split.appendChild(el('div', { class: 'stack' }, resultsBox, gapBox, chartsBox, assumptions(), howTo()));
    main.appendChild(split);
    update(true);
  }

  function numInput(id, value, attrs) {
    var i = el('input', Object.assign({ type: 'number', id: id, inputmode: 'decimal', value: value == null ? '' : value, step: 'any' }, attrs || {}));
    return i;
  }
  function onNum(input, key, lo, hi, allowBlank) {
    input.addEventListener('input', function () {
      if (allowBlank && input.value.trim() === '') s[key] = null;
      else s[key] = MP.clamp(MP.num(input.value), lo, hi);
      update();
    });
  }

  function aboutCard() {
    var age = numInput('age', s.age, { min: 16, max: 100, step: 1, inputmode: 'numeric' });
    age.addEventListener('change', function () {
      s.age = Math.round(MP.clamp(MP.num(age.value, 40), 16, 100));
      s.retireAge = MP.clamp(s.retireAge, retireMin(), retireMax());
      render();
    });
    var region = el('select', { id: 'region' }, REGIONS.map(function (r) { return el('option', { value: r[0], selected: s.region === r[0] }, r[1]); }));
    region.onchange = function () { s.region = region.value; update(); };
    var slider = el('input', { type: 'range', id: 'retire-age', min: retireMin(), max: retireMax(), step: 1, value: s.retireAge, 'aria-describedby': 'retire-hint' });
    var out = el('output', { id: 'retire-age-out', for: 'retire-age', class: 'age-out' }, String(s.retireAge));
    slider.addEventListener('input', function () { s.retireAge = +slider.value; out.textContent = slider.value; update(); });
    var spa = spaFor(s.age), mina = minAccessAge(s.age);
    return el('section', { class: 'card', 'aria-labelledby': 'h-about' },
      el('h2', { id: 'h-about' }, 'About you'),
      el('div', { class: 'grid-2 tight' },
        MP.field('Your age', age, dobAge != null && dobAge === s.age ? 'From your date of birth' : 'Add your date of birth on the home page for exact ages'),
        MP.field('Where you live', region, 'For income tax')),
      el('div', { class: 'field' },
        el('div', { class: 'slider-head' }, el('label', { for: 'retire-age' }, 'When do you want to retire?'), out),
        slider,
        el('span', { class: 'hint', id: 'retire-hint' }, 'You can take money from most pensions from age ' + mina + (mina === 57 ? ' (the minimum rises from 55 to 57 on 6 April 2028)' : '') + '. Your State Pension age is ' + ageLabel(spa) + '.')));
  }
  function retireMin() { return Math.max(minAccessAge(s.age), s.age); }
  function retireMax() { return Math.max(75, retireMin()); }

  function potsCard() {
    var list = el('div', { class: 'pots', id: 'pots' });
    function draw() {
      list.innerHTML = '';
      if (!s.pots.length) list.appendChild(el('p', { class: 'small muted' }, 'No pensions added. That is fine if you are just starting: your contributions build a new pot.'));
      s.pots.forEach(function (p, i) {
        var name = el('input', { type: 'text', id: 'pot-name-' + i, value: p.name, maxlength: 40, class: 'pot-name' });
        name.addEventListener('input', function () { p.name = name.value; update(); });
        var type = el('select', { id: 'pot-type-' + i, class: 'pot-type' }, Object.keys(POT_TYPES).map(function (k) { return el('option', { value: k, selected: p.type === k }, POT_TYPES[k]); }));
        type.onchange = function () { p.type = type.value; update(); };
        var val = MP.moneyInput({ id: 'pot-value-' + i, value: p.value, class: 'pot-value' });
        val.input.addEventListener('input', function () { p.value = MP.clamp(MP.num(val.input.value), 0, 1e9); update(); });
        list.appendChild(el('div', { class: 'pot panel' },
          MP.field('Name', name),
          el('div', { class: 'pot-row' }, MP.field('Type', type), MP.field('Value today', val.wrap)),
          el('div', { class: 'pot-foot' },
            el('button', { class: 'btn btn-sm btn-ghost remove-pot', type: 'button', 'aria-label': 'Remove ' + (p.name || 'pension'), onclick: function () {
              s.pots.splice(i, 1); draw(); update();
            } }, 'Remove'))));
      });
    }
    draw();
    return el('section', { class: 'card', 'aria-labelledby': 'h-pots' },
      el('h2', { id: 'h-pots' }, 'Your pensions so far'),
      el('p', { class: 'small muted' }, 'Add each workplace pension, personal pension or SIPP. Find old ones with the free government Pension Tracing Service.'),
      list,
      el('button', { class: 'btn btn-sm', type: 'button', id: 'add-pot', style: { marginTop: '10px' }, onclick: function () {
        s.pots.push({ id: MP.uid(), name: 'Pension ' + (s.pots.length + 1), type: 'personal', value: 0 }); draw(); update();
        var last = MP.$('#pot-value-' + (s.pots.length - 1)); if (last) last.focus();
      } }, '＋ Add a pension'),
      el('p', { class: 'small', style: { margin: '10px 0 0' } }, 'Total: ', el('strong', { id: 'pots-total' }, MP.money(potsTotal()))));
  }

  function contribCard() {
    var sal = MP.moneyInput({ id: 'salary', value: s.salary });
    onNum(sal.input, 'salary', 0, 1e8);
    var emp = numInput('emp-pct', s.empPct, { min: 0, max: 100, step: 0.5 });
    var er = numInput('er-pct', s.erPct, { min: 0, max: 100, step: 0.5 });
    onNum(emp, 'empPct', 0, 100); onNum(er, 'erPct', 0, 100);
    var basis = MP.seg([{ value: 'qualifying', label: 'Qualifying earnings' }, { value: 'full', label: 'Full salary' }], s.basis, function (v) { s.basis = v; update(); }, 'Contributions are worked out on');
    basis.id = 'basis';
    var scen = MP.seg(SCEN.map(function (o) { return { value: o.value, label: o.label + ' ' + MP.pct(UK.R.growth[o.value]) }; }), s.scenario, function (v) { s.scenario = v; update(); }, 'Growth scenario');
    scen.id = 'scenario';
    var charges = numInput('charges', s.charges, { min: 0, max: 5, step: 0.05 });
    onNum(charges, 'charges', 0, 5);
    var lump = el('input', { type: 'checkbox', id: 'take-lump', checked: s.takeLump });
    lump.onchange = function () { s.takeLump = lump.checked; update(); };
    return el('section', { class: 'card', 'aria-labelledby': 'h-contrib' },
      el('h2', { id: 'h-contrib' }, 'Paying in'),
      MP.field('Yearly salary before tax', sal.wrap, profile.salary > 0 ? 'From your profile' : 'An example. Add your salary on the home page.'),
      el('div', { class: 'grid-2 tight' }, MP.field('You pay (%)', emp), MP.field('Employer pays (%)', er)),
      el('div', { class: 'field' }, el('span', { class: 'label' }, 'Worked out on'), basis,
        el('span', { class: 'hint' }, 'Auto-enrolment minimum: 5% from you and 3% from your employer on "qualifying earnings", the part of pay between ' + MP.money(P.autoEnrolment.lowerQE) + ' and ' + MP.money(P.autoEnrolment.upperQE) + '. Many employers pay on your full salary.')),
      el('p', { class: 'small callout', id: 'contrib-out', 'aria-live': 'polite' }),
      el('hr'),
      el('div', { class: 'field' }, el('span', { class: 'label' }, 'Investment growth a year (before charges)'), scen,
        el('span', { class: 'hint' }, 'Investments can fall as well as rise. Try all three.')),
      MP.field('Yearly charges (%)', charges, 'Workplace pensions usually charge 0.3% to 0.75%. Check your yearly statement.'),
      el('label', { class: 'check' }, lump, 'Take 25% tax-free cash as a lump sum when I retire'));
  }

  function stateCard() {
    var yrs = numInput('ni-years', s.niYears, { min: 0, max: 60, step: 1, inputmode: 'numeric' });
    onNum(yrs, 'niYears', 0, 60);
    var fut = numInput('ni-future', s.niFuture, { min: 0, max: 60, step: 1, inputmode: 'numeric' });
    onNum(fut, 'niFuture', 0, 60, true);
    return el('section', { class: 'card', 'aria-labelledby': 'h-state' },
      el('h2', { id: 'h-state' }, 'State Pension'),
      el('p', { class: 'small muted' }, 'You need ' + SP.qualifyingYearsMin + ' qualifying years of National Insurance to get any State Pension, and ' + SP.qualifyingYearsFull + ' for the full ' + MP.money(SP.fullWeekly, true) + ' a week.'),
      el('div', { class: 'grid-2 tight' },
        MP.field('Years so far', yrs, 'See your record at gov.uk/check-state-pension'),
        MP.field('Years to come', fut, 'Leave blank to count each year until you stop work')),
      el('p', { class: 'small', id: 'ni-out', style: { margin: 0 } }));
  }

  function targetCard() {
    var target = MP.moneyInput({ id: 'target', value: s.target });
    target.input.addEventListener('input', function () { s.target = MP.clamp(MP.num(target.input.value), 0, 1e7); s.level = 'custom'; markLevel(); update(); });
    var levels = el('div', { class: 'levels', role: 'group', 'aria-label': 'PLSA Retirement Living Standards' });
    function drawLevels() {
      levels.innerHTML = '';
      LEVELS.forEach(function (l) {
        levels.appendChild(el('button', { type: 'button', class: 'level', id: 'level-' + l.value, 'aria-pressed': String(s.level === l.value), onclick: function () {
          s.level = l.value; s.target = PLSA[s.household][l.value]; target.input.value = s.target; markLevel(); update();
        } }, el('strong', null, l.label), el('span', { class: 'level-amt' }, MP.money(PLSA[s.household][l.value]) + ' a year'), el('span', { class: 'tiny muted' }, l.desc)));
      });
    }
    function markLevel() { MP.$$('.level', levels).forEach(function (b) { b.setAttribute('aria-pressed', String(b.id === 'level-' + s.level)); }); }
    var partner = MP.moneyInput({ id: 'partner-income', value: s.partnerIncome });
    onNum(partner.input, 'partnerIncome', 0, 1e7);
    var partnerField = MP.field('Your partner\'s yearly income in retirement, after tax', partner.wrap, 'Their pensions and State Pension. We have used a full State Pension as an example.');
    partnerField.style.display = s.household === 'couple' ? '' : 'none';
    var hh = MP.seg([{ value: 'single', label: 'Just me' }, { value: 'couple', label: 'Me and a partner' }], s.household, function (v) {
      s.household = v; partnerField.style.display = v === 'couple' ? '' : 'none';
      if (s.level !== 'custom') { s.target = PLSA[v][s.level]; target.input.value = s.target; }
      drawLevels(); update();
    }, 'Who is retiring');
    hh.id = 'household';
    drawLevels();
    return el('section', { class: 'card', 'aria-labelledby': 'h-target' },
      el('h2', { id: 'h-target' }, 'The income you want'),
      el('div', { class: 'field' }, el('span', { class: 'label' }, 'Planning for'), hh),
      el('div', { class: 'field' }, el('span', { class: 'label' }, 'Pick a lifestyle'), levels,
        el('span', { class: 'hint' }, 'PLSA Retirement Living Standards (2024): yearly spending after tax, outside London. An assumption, not a promise.')),
      MP.field('Yearly income you want, after tax, in today\'s money', target.wrap),
      partnerField);
  }

  function stat(label, id, value, note, cls) {
    return el('div', { class: 'stat' + (cls ? ' ' + cls : '') }, el('span', { class: 'label' }, label), el('span', { class: 'value', id: id, dataset: { value: Math.round(value) } }, MP.money(value)), note ? el('span', { class: 'tiny muted' }, note) : null);
  }

  /* Recalculate and redraw the results. first=true on the initial draw (no save). */
  function update(first) {
    var m = model();
    var c = m.contrib;
    var co = MP.$('#contrib-out');
    if (co) {
      co.textContent = '';
      co.appendChild(document.createTextNode('Going in: '));
      co.appendChild(el('strong', { id: 'monthly-contrib', dataset: { value: (c.total / 12).toFixed(2) } }, MP.money(c.total / 12) + ' a month'));
      co.appendChild(document.createTextNode(' (' + MP.money(c.you / 12) + ' from you, ' + MP.money(c.employer / 12) + ' from your employer). With tax relief, your part costs you about ' + MP.money(c.you / 12 * (1 - c.relief)) + ' a month.' +
        (s.salary > 0 && s.salary < 10000 ? ' Below £10,000 a year your employer does not have to enrol you, but you can ask to join.' : '') +
        (c.total > P.annualAllowance ? ' This is over the ' + MP.money(P.annualAllowance) + ' yearly allowance, so tax may be due.' : '')));
    }
    var no = MP.$('#ni-out');
    if (no) no.textContent = 'That makes ' + m.niTotal + ' qualifying years' + (m.niTotal > SP.qualifyingYearsFull ? ' (only ' + SP.qualifyingYearsFull + ' count)' : '') + ': about ' + MP.money(m.spWeekly, true) + ' a week' + (m.niTotal < SP.qualifyingYearsMin ? ' (under ' + SP.qualifyingYearsMin + ' years, so no State Pension yet).' : '.');
    var pt = MP.$('#pots-total'); if (pt) pt.textContent = MP.money(potsTotal());

    drawResults(m);
    drawGap(m);
    drawCharts(m);
    if (!first) save(m);
  }

  function drawResults(m) {
    var short = m.gap > 0.5;
    resultsBox.innerHTML = '';
    resultsBox.appendChild(el('h2', { id: 'h-results' }, 'Retiring at ' + m.retireAge));
    var live = el('div', { 'aria-live': 'polite', id: 'results' });
    live.appendChild(el('div', { class: 'headline' },
      el('div', null, el('span', { class: 'muted small' }, 'Your yearly income from State Pension age, after tax'),
        el('div', { class: 'big-number', id: 'net-income', dataset: { value: Math.round(m.netPost) } }, MP.money(m.netPost)),
        el('span', { class: 'small muted' }, 'about ' + MP.money(m.netPost / 12) + ' a month, in today\'s money')),
      el('div', { class: 'gap-chip' }, short ?
        el('span', { class: 'chip danger', id: 'gap', dataset: { value: Math.round(m.gap) } }, MP.money(m.gap) + ' a year short') :
        el('span', { class: 'chip success', id: 'gap', dataset: { value: Math.round(m.gap) } }, m.target ? 'On track: ' + MP.money(-m.gap) + ' a year to spare' : 'No target set'))));
    live.appendChild(el('div', { class: 'progress', role: 'progressbar', 'aria-label': 'Income compared with your target', 'aria-valuemin': 0, 'aria-valuemax': 100, 'aria-valuenow': Math.round(m.target ? MP.clamp(m.netPost / m.target, 0, 1) * 100 : 100), style: { margin: '12px 0 4px' } },
      el('span', { style: { width: (m.target ? MP.clamp(m.netPost / m.target, 0, 1) * 100 : 100) + '%' } })));
    live.appendChild(el('p', { class: 'tiny muted' }, 'Target: ' + MP.money(m.target) + ' a year after tax' + (m.partner ? ', including ' + MP.money(m.partner) + ' from your partner' : '') + '.'));
    live.appendChild(el('div', { class: 'stats' },
      stat('Pension pot at ' + m.retireAge, 'pot-real', m.potReal, MP.money(m.potNom) + ' in future pounds'),
      stat('Tax-free lump sum', 'lump-sum', m.lumpReal, m.lumpNom >= P.lumpSumAllowance - 0.5 ? 'capped at the ' + MP.money(P.lumpSumAllowance) + ' allowance' : '25% of your pot' + (s.takeLump ? ', taken as cash' : ', taken bit by bit')),
      stat('Pension income a year', 'pot-income', m.draw, 'before tax, lasts to age ' + DRAW_TO_AGE),
      stat('State Pension a year', 'sp-yearly', m.spYear, 'from age ' + ageLabel(m.spa)),
      stat('Income tax a year', 'tax-yearly', m.taxPost, 'from State Pension age'),
      stat('Total after tax', 'net-total', m.netPost - m.partner, m.partner ? 'yours only, before adding your partner' : 'pension + State Pension − tax')));
    resultsBox.appendChild(live);
    resultsBox.appendChild(el('div', { class: 'row no-print', style: { marginTop: '14px' } },
      el('button', { class: 'btn btn-accent', type: 'button', id: 'save-dream', onclick: function () { saveDream(m); } }, '🏖️ Save as a dream'),
      el('span', { class: 'small muted' }, 'Adds the pot you need to your Dreams & goals.')));
  }

  function drawGap(m) {
    gapBox.innerHTML = '';
    if (m.bridging) {
      gapBox.appendChild(el('div', { class: 'callout warning', id: 'bridge' },
        el('p', null, el('strong', null, 'Bridging the gap: '), 'from ' + m.retireAge + ' to your State Pension age of ' + ageLabel(m.spa) + ' (' + duration(m.bridgeYears) + ') you will have no State Pension.'),
        el('p', null, 'Your income in those years would be about ', el('strong', { id: 'bridge-income' }, MP.money(m.netPre) + ' a year'), ' after tax. To keep it level, you would need roughly ' + MP.money(m.spYear * m.bridgeYears) + ' more saved' + (s.takeLump ? ', or use part of your tax-free lump sum.' : '.'))));
      if (gapBox.childNodes.length) gapBox.appendChild(el('div', { style: { height: '16px' } }));
    }
    var g = closeGap(m);
    if (!g) {
      if (m.target) gapBox.appendChild(el('div', { class: 'callout success', id: 'close-gap' }, el('p', null, 'Your plan meets your target income from State Pension age. Check it again each year, and when your pay or plans change.')));
      return;
    }
    var items = [];
    if (g.extra != null) items.push(el('li', null, 'Pay in ', el('strong', { id: 'extra-monthly', dataset: { value: Math.round(g.extra) } }, MP.money(g.extra) + ' a month more'), ' (in total, rising with prices). After tax relief it could cost you about ' + MP.money(g.extra * (1 - m.contrib.relief)) + ', less if your employer matches.'));
    else items.push(el('li', null, m.years < 1 ? 'There is not enough time to close the gap by paying in more.' : 'Paying in more alone would not close the gap.'));
    if (g.later != null) items.push(el('li', null, 'or ', el('strong', { id: 'later-age', dataset: { value: g.later } }, 'retire ' + (g.later - s.retireAge) + (g.later - s.retireAge === 1 ? ' year' : ' years') + ' later, at ' + g.later), '.'));
    else items.push(el('li', null, 'Retiring later, even at 75, would not close it on its own.'));
    items.push(el('li', null, 'or a mix: a little more each month and a year or two later, or a lower target.'));
    gapBox.appendChild(el('div', { class: 'callout', id: 'close-gap' }, el('p', null, el('strong', null, 'To close the ' + MP.money(m.gap) + ' a year gap:')), el('ul', { class: 'small' }, items)));
  }

  function drawCharts(m) {
    chartsBox.innerHTML = '';
    chartsBox.appendChild(el('h2', { id: 'h-charts' }, 'Your pot and income by age'));
    var ages = [], pot = [], income = [], target = [], state = [], incAges = [];
    var last = Math.max(CHART_TO_AGE, m.retireAge + 5);
    // saving years: balance at each birthday, in today's money
    m.fv.series.forEach(function (p) { if (p.month % 12 === 0) { ages.push(s.age + p.month / 12); pot.push(p.balance / Math.pow(1 + INFL, p.month / 12)); } });
    if (!ages.length || ages[ages.length - 1] !== m.retireAge) { ages.push(m.retireAge); pot.push(m.potReal); }
    // retirement years: take the year's income at the start of the year, the rest keeps growing
    var bal = m.drawPot;
    for (var a = m.retireAge; a <= last; a++) {
      var d = a < DRAW_TO_AGE ? Math.min(bal, m.draw) : 0;
      var sp = a >= m.spa ? m.spYear : 0;
      income.push(d + sp - tax(d * (1 - m.taxFreeShare) + sp) + m.partner);
      state.push(sp); target.push(m.target); incAges.push(String(a));
      bal = Math.max(0, (bal - d) * (1 + m.rr));
      if (a < last) { ages.push(a + 1); pot.push(bal < 1 ? 0 : bal); }
    }
    var ri = ages.indexOf(m.retireAge);
    chartsBox.appendChild(el('h3', null, 'Pension pot, in today\'s money'));
    var cw = chartsBox.clientWidth && chartsBox.clientWidth < 560 ? { width: 400, height: 260 } : {};
    chartsBox.appendChild(MP.lineChart({ width: cw.width, height: cw.height, series: [{ name: 'Pension pot', color: '--c1', values: pot, area: true }], labels: ages.map(String), marker: { index: ri, label: 'Retire at ' + m.retireAge }, label: 'Pension pot by age, peaking at ' + MP.money(m.potReal) + ' at ' + m.retireAge }));
    var spIdx = Math.max(0, Math.ceil(m.spa) - m.retireAge);
    chartsBox.appendChild(el('h3', { style: { marginTop: '18px' } }, 'Yearly income after tax, in today\'s money'));
    chartsBox.appendChild(MP.lineChart({
      width: cw.width, height: cw.height,
      series: [{ name: 'Your income', color: '--c2', values: income, area: true }, { name: 'State Pension', color: '--c4', values: state }, { name: 'Target', color: '--c5', values: target, dash: true }],
      labels: incAges, marker: spIdx < income.length ? { index: spIdx, label: 'State Pension ' + ageLabel(m.spa) } : null, label: 'Yearly income by age in retirement'
    }));
    chartsBox.appendChild(el('p', { class: 'tiny muted', style: { marginTop: '8px' } }, 'Your pension is spread so it runs out at ' + DRAW_TO_AGE + '. After that you would rely on the State Pension. Many people live longer: an annuity can pay an income for life.'));
  }

  function assumptions() {
    return el('details', { class: 'card' }, el('summary', null, 'How we work this out (assumptions)'),
      el('ul', { class: 'small' },
        el('li', null, 'Everything is shown in today\'s money, taking off ' + MP.pct(INFL) + ' a year for rising prices. We assume your pay and contributions rise with prices.'),
        el('li', null, 'Growth: low ' + MP.pct(UK.R.growth.low) + ', middle ' + MP.pct(UK.R.growth.mid) + ', high ' + MP.pct(UK.R.growth.high) + ' a year before your charges. Real returns go up and down.'),
        el('li', null, 'Pension income: we spread your pot (after any tax-free cash) as a level income, rising with prices, so it runs out at age ' + DRAW_TO_AGE + ', while the rest stays invested at the same growth rate. This is called drawdown.'),
        el('li', null, 'Tax-free cash: 25% of your pensions, up to the lump sum allowance of ' + MP.money(P.lumpSumAllowance) + '. The rest is taxed as income using ' + UK.R.taxYear + ' bands. Tax bands are frozen for now, so you may pay more tax than shown.'),
        el('li', null, 'State Pension: full new State Pension of ' + MP.money(SP.fullWeekly, true) + ' a week (' + UK.R.taxYear + ') × your qualifying years ÷ 35. Nothing under 10 years. Your real forecast may differ if you were contracted out before 2016.'),
        el('li', null, 'Lifestyle targets: PLSA Retirement Living Standards (2024), after tax, outside London.'),
        el('li', null, 'State Pension age follows current law and may change. Check gov.uk/state-pension-age.')));
  }

  function howTo() {
    return el('details', { class: 'card' }, el('summary', null, 'How to use this, and tips'),
      el('ul', { class: 'small' },
        el('li', null, 'Add every pension you have. Thinking of putting old pensions together? Check fees, exit charges and any valuable guarantees (like a guaranteed annuity rate) before you move them.'),
        el('li', null, 'Get your State Pension forecast and National Insurance record at ', el('a', { href: 'https://www.gov.uk/check-state-pension', target: '_blank', rel: 'noopener' }, 'gov.uk/check-state-pension'), '. You may be able to fill gaps by paying voluntary contributions.'),
        el('li', null, 'Aged 50 or over? Book a free, impartial ', el('a', { href: 'https://www.moneyhelper.org.uk/en/pensions-and-retirement/pension-wise', target: '_blank', rel: 'noopener' }, 'Pension Wise'), ' appointment before you decide how to take your money.'),
        el('li', null, 'Ask if your employer matches extra contributions. Some will add more if you pay in more: that is free money.'),
        el('li', null, 'Salary sacrifice: some employers let you swap part of your salary for pension contributions, which saves National Insurance too. It lowers your official pay, so check how it affects mortgages and other benefits.'),
        el('li', null, 'Beware pension scams: cold calls, "free pension reviews" and offers to unlock cash before 55 are red flags. Check with the ', el('a', { href: 'https://www.fca.org.uk/scamsmart', target: '_blank', rel: 'noopener' }, 'FCA ScamSmart'), ' tool first.')));
  }

  /* ---------- actions ---------- */
  function saveDream(m) {
    var need = potNeeded(m);
    if (need == null) { MP.toast('We could not work out a pot for this target. Try a lower target.'); return; }
    var date = new Date(); date.setFullYear(date.getFullYear() + Math.max(1, Math.round(m.years)));
    var list = MP.goals();
    var g = list.filter(function (x) { return (s.goalId && x.id === s.goalId) || x.linked === 'retirement'; })[0];
    var isNew = !g;
    if (!g) { g = { id: MP.uid(), priority: 2 }; list.push(g); }
    Object.assign(g, {
      name: 'Retire at ' + m.retireAge, icon: '🏖️', target: Math.max(1, Math.round(need)), saved: Math.round(potsTotal()),
      date: MP.isoDate(date), home: 'pension', rate: Math.max(0, Math.round(m.rate * 1000) / 1000), monthly: Math.round(m.contrib.total / 12),
      linked: 'retirement', note: 'Pot needed in today\'s money for ' + MP.money(m.target) + ' a year after tax, from the Retirement planner.'
    });
    s.goalId = g.id;
    MP.saveGoals(list);
    save(m);
    MP.log((isNew ? 'Added' : 'Updated') + ' the dream "' + g.name + '": ' + MP.money(g.target) + ' pension pot');
    MP.toast(need <= 0.5 ? 'Saved. Your State Pension alone could meet this target.' : (isNew ? 'Added to your dreams: ' : 'Dream updated: ') + MP.money(g.target) + ' pot.');
  }

  function save(m) {
    MP.set('tools.retirement', s);
    MP.summary('retirement', 'Retire at ' + m.retireAge + ': ' + MP.money(m.netPost) + ' a year');
    if (!logged) { logged = true; MP.log('Updated the retirement plan'); }
  }

  function reset() {
    if (!MP.confirm('Clear your retirement plan and start again?')) return;
    var goalId = s.goalId;
    s = defaults(); s.goalId = goalId;
    MP.set('tools.retirement', undefined);
    MP.set('summaries.retirement', undefined);
    MP.log('Reset the retirement plan');
    render();
    MP.toast('Reset to the starting example.');
  }

  MP.onTheme(function () { drawCharts(model()); });
  var lastW = window.innerWidth, rt;
  window.addEventListener('resize', function () { clearTimeout(rt); rt = setTimeout(function () { if (Math.abs(window.innerWidth - lastW) > 40) { lastW = window.innerWidth; drawCharts(model()); } }, 200); });
  render();
});
