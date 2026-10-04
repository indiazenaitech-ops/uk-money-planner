/* Financial health check: 15 quick questions (10 in Simple view) across five areas, a money score out
   of 100, and the next steps that matter most. Modelled on MoneyHelper's Money Midlife MOT.
   Saved at 'tools.health-check': { answers, from, step, mode, view, history[{date, score, areaScores, answers, count}] } */
MP.page({ id: 'health-check', title: 'Financial health check' }).then(function () {
  'use strict';
  var el = MP.el, main = MP.$('#app');
  var ROOT = MP.root();
  var SVGNS = 'http://www.w3.org/2000/svg';
  var MAX_HISTORY = 12;

  function tool(id) { return ROOT + 'apps/' + id + '/index.html'; }

  var AREAS = [
    { key: 'everyday', icon: '🧾', name: 'Everyday money' },
    { key: 'safety', icon: '🛟', name: 'Safety net' },
    { key: 'borrowing', icon: '💳', name: 'Borrowing' },
    { key: 'future', icon: '🏖️', name: 'Future' },
    { key: 'protect', icon: '📜', name: 'Protect & plan' }
  ];
  var AREA = {}; AREAS.forEach(function (a) { AREA[a.key] = a; });

  /* Each area has three questions; `core` marks the two asked in Simple view.
     Options score 0–100; pts: null means "does not apply" and is left out of the score. */
  var QUESTIONS = [
    { id: 'e_left', area: 'everyday', core: true,
      q: { new: 'At the end of most months, is there any money left over?', basics: 'Do you usually have money left at the end of the month?', confident: 'After all your spending, is your monthly cash flow usually positive?' },
      explain: 'Having a little left each month gives you room to save and to cope with surprises. Even £20 a month helps.',
      options: [{ v: 'yes', label: 'Yes, usually', pts: 100 }, { v: 'just', label: 'Just about', pts: 50 }, { v: 'no', label: 'No, I often run short', pts: 0 }] },
    { id: 'e_credit', area: 'everyday', core: true,
      q: { new: 'In the last 3 months, have you used a credit card, overdraft or loan to pay for everyday things like food or bills?', basics: 'In the last 3 months, have you borrowed to pay for essentials like food or bills?', confident: 'Have you relied on credit or an overdraft for essential spending in the last 3 months?' },
      explain: 'Borrowing for everyday costs can be an early sign that money is getting tight. Spotting it early makes it easier to fix.',
      options: [{ v: 'never', label: 'No, never', pts: 100 }, { v: 'sometimes', label: 'Once or twice', pts: 45 }, { v: 'often', label: 'Yes, most months', pts: 0 }] },
    { id: 'e_track', area: 'everyday',
      q: { new: 'Do you know where your money goes each month?', basics: 'Do you know where your money goes each month?', confident: 'Do you track your spending against a budget?' },
      explain: 'Knowing what you spend is the first step to spending on purpose. Your banking app or our Budget tool can sort your spending into groups for you.',
      options: [{ v: 'yes', label: 'Yes, I keep track', pts: 100 }, { v: 'rough', label: 'Roughly', pts: 60 }, { v: 'no', label: 'Not really', pts: 15 }] },

    { id: 's_months', area: 'safety', core: true,
      q: { new: 'If your pay stopped tomorrow, how long could your savings cover your essential bills?', basics: 'How many months of essential spending do you have in easy-access savings?', confident: 'How many months of essential outgoings does your emergency fund cover?' },
      term: 'emergency-fund',
      options: [{ v: 'none', label: 'I have no savings', pts: 0 }, { v: 'lt1', label: 'Less than a month', pts: 25 }, { v: 'm1', label: '1 to 3 months', pts: 60 }, { v: 'm3', label: '3 to 6 months', pts: 90 }, { v: 'm6', label: 'More than 6 months', pts: 100 }] },
    { id: 's_life', area: 'safety', core: true,
      q: { new: 'If you died, would the people who rely on your income be looked after?', basics: 'Do you have life insurance or death-in-service cover for the people who rely on you?', confident: 'Is your life cover, including death-in-service, enough for your dependants?' },
      term: 'life-insurance',
      options: [{ v: 'na', label: 'Nobody relies on my income', pts: null }, { v: 'yes', label: 'Yes, I have cover I think is enough', pts: 100 }, { v: 'some', label: 'I have some cover, but I\'m not sure it\'s enough', pts: 50 }, { v: 'no', label: 'No, I have no cover', pts: 0 }] },
    { id: 's_sick', area: 'safety',
      q: { new: 'If you were too ill to work for 3 months, would money still come in?', basics: 'Would your income carry on if illness kept you off work for 3 months?', confident: 'How well is your income protected against long-term sickness?' },
      explain: 'Statutory Sick Pay is much less than most people earn. Your contract says what your employer pays. Income protection insurance pays part of your income if you cannot work for a long time.',
      options: [{ v: 'full', label: 'Yes, full sick pay or income protection insurance', pts: 100 }, { v: 'part', label: 'Partly, such as Statutory Sick Pay or a few weeks of full pay', pts: 50 }, { v: 'no', label: 'No, or I don\'t know', pts: 10 }] },

    { id: 'b_missed', area: 'borrowing', core: true,
      q: { new: 'In the last 12 months, have you missed or been late with a bill or loan payment?', basics: 'Have you missed any bill, loan or card payments in the last 12 months?', confident: 'Any missed or late credit or bill payments in the past 12 months?' },
      explain: 'Missed payments can bring fees and harm your credit score. If it is happening, free debt advice can help quickly, and there is nothing to be embarrassed about.',
      options: [{ v: 'none', label: 'No', pts: 100 }, { v: 'once', label: 'Once', pts: 40 }, { v: 'several', label: 'More than once, or I\'m behind now', pts: 0 }] },
    { id: 'b_ratio', area: 'borrowing', core: true,
      q: { new: 'Not counting your mortgage, how much of your take-home pay goes on paying back debts each month?', basics: 'What share of your take-home pay goes on debt repayments, not counting your mortgage?', confident: 'Unsecured debt repayments as a share of your net monthly income?' },
      explain: 'Debts here means credit cards, loans, car finance, overdrafts and buy now pay later. On £2,000 a month take-home pay, 10% is £200. When repayments take more than about a fifth of your pay, money often starts to feel tight.',
      options: [{ v: 'none', label: 'I have no debts to repay', pts: 100 }, { v: 'lt10', label: 'Less than 10%', pts: 90 }, { v: 't10', label: '10% to 20%', pts: 60 }, { v: 't20', label: '20% to 35%', pts: 25 }, { v: 'gt35', label: 'More than 35%', pts: 0 }] },
    { id: 'b_cards', area: 'borrowing',
      q: { new: 'Do you pay off your credit cards in full each month?', basics: 'Do you clear your credit card balance in full each month?', confident: 'Do you clear your credit card balances in full every month?' },
      explain: 'Paying in full each month means you pay no interest. Paying only the minimum keeps the debt going for years and costs much more.',
      options: [{ v: 'na', label: 'I don\'t have a credit card', pts: null }, { v: 'full', label: 'Yes, always in full', pts: 100 }, { v: 'some', label: 'Sometimes', pts: 50 }, { v: 'min', label: 'Rarely, I usually pay the minimum', pts: 10 }] },

    { id: 'f_pension', area: 'future', core: true,
      q: { new: 'Are you paying into a pension?', basics: 'Are you paying into a pension, and how much?', confident: 'What are your current pension contributions?' },
      term: 'auto-enrolment',
      options: [{ v: 'retired', label: 'I\'m retired and already taking my pension', pts: null }, { v: 'more', label: 'Yes, more than the workplace minimum', pts: 100 }, { v: 'min', label: 'Yes, the minimum (usually 8% with my employer\'s part)', pts: 70 }, { v: 'no', label: 'No, or I opted out', pts: 10 }] },
    { id: 'f_track', area: 'future', core: true,
      q: { new: 'Do you know if you\'re saving enough for the retirement you want?', basics: 'Are you on track for the retirement income you want?', confident: 'Have you checked your projected retirement income against your target?' },
      explain: 'Putting your pension statements and State Pension forecast together shows whether you are likely to have enough. Our Retirement planner adds it up for you.',
      options: [{ v: 'yes', label: 'Yes, I\'ve worked it out and I\'m on track', pts: 100 }, { v: 'think', label: 'I think so, but I haven\'t checked', pts: 50 }, { v: 'no', label: 'No, or I have no idea', pts: 10 }] },
    { id: 'f_sp', area: 'future',
      q: { new: 'Have you checked your State Pension forecast and your National Insurance record?', basics: 'Have you checked your State Pension forecast and National Insurance record?', confident: 'Have you reviewed your State Pension forecast and NI record for gaps?' },
      term: 'qualifying-years',
      options: [{ v: 'yes', label: 'Yes, in the last 2 years', pts: 100 }, { v: 'old', label: 'Yes, but more than 2 years ago', pts: 60 }, { v: 'no', label: 'No', pts: 10 }] },

    { id: 'p_will', area: 'protect', core: true,
      q: { new: 'Have you made a will?', basics: 'Do you have an up-to-date will?', confident: 'Is your will in place and up to date?' },
      term: 'will',
      options: [{ v: 'yes', label: 'Yes, and it\'s up to date', pts: 100 }, { v: 'old', label: 'Yes, but it\'s old or my life has changed', pts: 50 }, { v: 'no', label: 'No', pts: 0 }] },
    { id: 'p_lpa', area: 'protect', core: true,
      q: { new: 'Have you set up a lasting power of attorney, so someone you trust can deal with your money if you can\'t?', basics: 'Do you have a lasting power of attorney (LPA)?', confident: 'Do you have registered powers of attorney for money and for health?' },
      term: 'lpa',
      options: [{ v: 'yes', label: 'Yes', pts: 100 }, { v: 'started', label: 'I\'ve started, or I\'m thinking about it', pts: 40 }, { v: 'no', label: 'No', pts: 0 }] },
    { id: 'p_nom', area: 'protect',
      q: { new: 'If you died, does your pension provider know who you want to get your pension money?', basics: 'Are your pension and death-in-service nominations up to date?', confident: 'Are your expression of wish and nomination forms up to date?' },
      explain: 'Pensions usually sit outside your will. A short "expression of wish" form tells the provider who you would like to get the money. Update it after big changes like marriage, divorce or a new baby.',
      options: [{ v: 'na', label: 'I don\'t have a pension or work life cover', pts: null }, { v: 'yes', label: 'Yes, updated in the last few years', pts: 100 }, { v: 'unsure', label: 'Not sure', pts: 30 }, { v: 'no', label: 'No', pts: 0 }] }
  ];
  var Q = {}; QUESTIONS.forEach(function (q) { Q[q.id] = q; });

  /* ---------- state ---------- */
  function freshState() { return { answers: {}, from: {}, step: 0, mode: 'step', view: '', history: [] }; }
  var S = MP.get('tools.health-check', null);
  if (!S || typeof S !== 'object') S = freshState();
  ['answers', 'from'].forEach(function (k) { if (!S[k] || typeof S[k] !== 'object' || Array.isArray(S[k])) S[k] = {}; });
  if (!Array.isArray(S.history)) S.history = [];
  S.history = S.history.filter(function (h) { return h && typeof h.score === 'number'; }).slice(-MAX_HISTORY);
  if (S.mode !== 'list') S.mode = 'step';
  if (S.view !== 'quiz' && S.view !== 'results') S.view = S.history.length ? 'results' : 'quiz';
  if (S.view === 'results' && !S.history.length) S.view = 'quiz';
  // drop answers that are no longer valid options
  Object.keys(S.answers).forEach(function (k) { if (!Q[k] || !optionOf(Q[k], S.answers[k])) { delete S.answers[k]; delete S.from[k]; } });

  function save() { MP.set('tools.health-check', S); }

  function optionOf(q, v) { return q.options.filter(function (o) { return o.v === v; })[0] || null; }
  function w(v) { var k = MP.prefs().knowledge || 'new'; return typeof v === 'string' ? v : (v[k] || v.basics || v.new); }
  function active() { var d = MP.isDetailed(); return QUESTIONS.filter(function (q) { return d || q.core; }); }
  function prof() { return MP.profile(); }
  function age() { var p = prof(); return p.dob ? UK.age(p.dob) : null; }
  function region() { return prof().region || 'england'; }

  /* ---------- prefill from the guided setup and other tools ---------- */
  function computePrefill() {
    var out = {}, A = MP.prefs().answers || {}, p = prof();
    function put(id, v, src) { if (v != null && Q[id] && optionOf(Q[id], v)) out[id] = { v: v, src: src }; }
    var G = 'your guided setup';
    put('e_left', { yes: 'yes', just: 'just', no: 'no' }[A.leftover], G);
    put('s_months', { '0': 'none', '0.5': 'lt1', '2': 'm1', '4.5': 'm3', '6': 'm6' }[String(A.savingsMonths)], G);
    put('b_missed', { behind: 'several', ok: 'none' }[A.debtFeel], G);
    if (A.dependants === 'none') put('s_life', 'na', G);
    else put('s_life', { yes: 'yes', unsure: 'some', no: 'no' }[A.cover], G);
    put('p_will', { yes: 'yes', old: 'old', no: 'no' }[A.will], G);
    put('f_track', { no: 'no', rough: 'think' }[A.pensionKnow], G);
    if (A.employment === 'retired') put('f_pension', 'retired', G);

    // Other tools override the guide: they hold real figures.
    try {
      var b = MP.get('tools.budget', null);
      if (b && Array.isArray(b.tx) && b.tx.length && !b.sample) {
        var months = {}, net = 0;
        b.tx.forEach(function (t) { if (t && t.date) { months[String(t.date).slice(0, 7)] = 1; net += +t.amount || 0; } });
        var n = Object.keys(months).length;
        if (n) {
          var avg = net / n;
          put('e_left', avg > 50 ? 'yes' : avg > -50 ? 'just' : 'no', 'the Budget tool');
          put('e_track', 'yes', 'the Budget tool');
        }
      }
    } catch (e) { }
    try {
      var sv = MP.get('tools.savings', null);
      if (sv && sv.ef && sv.ef.costs) {
        var costs = Object.keys(sv.ef.costs).reduce(function (a, k) { return a + Math.max(0, +sv.ef.costs[k] || 0); }, 0);
        var cur = Math.max(0, +sv.ef.current || 0);
        if (costs > 0) {
          var m = cur / costs;
          put('s_months', cur <= 0 ? 'none' : m < 1 ? 'lt1' : m < 3 ? 'm1' : m < 6 ? 'm3' : 'm6', 'the Savings tool');
        }
      }
    } catch (e) { }
    try {
      var r = MP.get('tools.retirement', null);
      if (r && A.employment !== 'retired' && r.empPct != null) {
        var you = +r.empPct || 0, tot = you + (+r.erPct || 0);
        put('f_pension', you <= 0 ? 'no' : tot > 8.001 ? 'more' : 'min', 'the Retirement planner');
      }
    } catch (e) { }
    try {
      var d = MP.get('tools.debt', null), sal = +p.salary || 0;
      if (d && Array.isArray(d.debts)) {
        var live = d.debts.filter(function (x) { return x && (+x.balance || 0) > 0; });
        if (!live.length) put('b_ratio', 'none', 'the Mortgage & debt tool');
        else if (sal > 0) {
          var netMonthly = (sal - UK.incomeTax(sal, p.region).tax - UK.nationalInsurance(sal)) / 12;
          var mins = live.reduce(function (a, x) { return a + Math.max(0, +x.min || 0); }, 0);
          if (netMonthly > 0) {
            var ratio = mins / netMonthly;
            put('b_ratio', ratio < 0.1 ? 'lt10' : ratio < 0.2 ? 't10' : ratio < 0.35 ? 't20' : 'gt35', 'the Mortgage & debt tool');
          }
        }
      }
    } catch (e) { }
    return out;
  }
  function applyPrefill() {
    var pf = computePrefill();
    Object.keys(pf).forEach(function (id) {
      if (S.answers[id] == null || S.from[id]) { S.answers[id] = pf[id].v; S.from[id] = pf[id].src; }
    });
  }

  /* ---------- scoring ---------- */
  function band(score) {
    if (score >= 75) return { key: 'good', label: 'Good', cls: 'success', color: '--success' };
    if (score >= 45) return { key: 'ok', label: 'OK', cls: 'warning', color: '--warning' };
    return { key: 'attention', label: 'Needs attention', cls: 'danger', color: '--danger' };
  }
  function score(answers, qs) {
    var areaScores = {};
    AREAS.forEach(function (a) {
      var pts = qs.filter(function (q) { return q.area === a.key; }).map(function (q) { var o = optionOf(q, answers[q.id]); return o ? o.pts : null; })
        .filter(function (p) { return p != null; });
      areaScores[a.key] = pts.length ? Math.round(pts.reduce(function (x, y) { return x + y; }, 0) / pts.length) : 100;
    });
    var total = Math.round(AREAS.reduce(function (x, a) { return x + areaScores[a.key]; }, 0) / AREAS.length);
    return { score: total, areaScores: areaScores };
  }
  function message(s) {
    if (s >= 80) return 'You\'re in good shape. Keep doing what you\'re doing, and check again in 6 months.';
    if (s >= 60) return 'A solid base, with a few things worth sorting out.';
    if (s >= 40) return 'Some areas need attention. Small steps, one at a time, make a real difference.';
    return 'Things look tough right now. You\'re not alone, and good help is free. Start with the first step below.';
  }

  /* ---------- next best actions ---------- */
  function link(href, text) { return { href: href, text: text, ext: /^https?:/.test(href) }; }
  var L = {
    stepchange: link('https://www.stepchange.org', 'StepChange (free debt advice)'),
    ndl: link('https://nationaldebtline.org', 'National Debtline'),
    sp: link('https://www.gov.uk/check-state-pension', 'Check your State Pension (GOV.UK)'),
    pw: link('https://www.moneyhelper.org.uk/en/pensions-and-retirement/pension-wise', 'Pension Wise (free, 50+)'),
    mh: link('https://www.moneyhelper.org.uk', 'MoneyHelper'),
    trace: link('https://www.gov.uk/find-pension-contact-details', 'Find old pensions (GOV.UK)'),
    benefits: link('https://www.turn2us.org.uk', 'Check benefits you could get (Turn2us)')
  };
  function willLink() {
    var r = region();
    if (r === 'scotland') return link('https://www.mygov.scot/making-will', 'Making a will (mygov.scot)');
    if (r === 'ni') return link('https://www.nidirect.gov.uk/articles/making-will', 'Making a will (nidirect)');
    return link('https://www.gov.uk/make-will', 'Making a will (GOV.UK)');
  }
  function lpaLink() {
    var r = region();
    if (r === 'scotland') return link('https://www.publicguardian-scotland.gov.uk/power-of-attorney', 'Power of attorney (Office of the Public Guardian Scotland)');
    if (r === 'ni') return link('https://www.nidirect.gov.uk/articles/managing-your-affairs-and-enduring-power-attorney', 'Enduring power of attorney (nidirect)');
    return link('https://www.gov.uk/power-of-attorney', 'Make a lasting power of attorney (GOV.UK)');
  }
  function debtProblem(A) { return A.b_missed === 'once' || A.b_missed === 'several' || A.b_ratio === 't20' || A.b_ratio === 'gt35' || A.e_credit === 'often'; }

  function actions(A) {
    var list = [], a = age(), p = prof(), G = MP.prefs().answers || {};
    var selfEmp = p.employment === 'self' || p.employment === 'both' || G.employment === 'self';
    function add(pri, topic, title, why, links) { list.push({ pri: pri, topic: topic, title: title, why: why, links: links.filter(Boolean) }); }
    var T = {
      debt: link(tool('debt'), 'Mortgage & debt planner'), budget: link(tool('budget'), 'Budget from statements'), savings: link(tool('savings'), 'Savings & ISAs'),
      retirement: link(tool('retirement'), 'Retirement planner'), rincome: link(tool('retirement-income'), 'Retirement income options'), protection: link(tool('protection'), 'Protection needs'),
      iht: link(tool('iht'), 'Inheritance tax'), takehome: link(tool('take-home'), 'Take-home pay'), dreams: link(tool('dreams'), 'Dreams & goals'),
      networth: link(tool('networth'), 'Net worth tracker'), family: link(tool('family'), 'Family money'), self: link(tool('self-employed'), 'Self-employed tax'), redundancy: link(tool('redundancy'), 'Redundancy planner')
    };

    if (A.b_missed === 'several') add(100, 'debt', 'Talk to a free debt adviser',
      'You\'ve missed payments recently. Free, confidential debt advisers can talk to lenders for you, ask them to freeze interest and charges, and agree payments you can afford. The sooner you talk, the more options you have.', [L.stepchange, L.ndl, T.debt]);
    else if (A.b_missed === 'once') add(96, 'debt', 'Get back on track with payments',
      'One missed payment is easy to put right. Set up Direct Debits for at least the minimum, and tell the lender early if it might happen again: they must treat you fairly.', [T.debt, L.stepchange]);
    if (A.b_ratio === 'gt35' || A.b_ratio === 't20') add(A.b_ratio === 'gt35' ? 98 : 94, 'debt', 'Bring your debt repayments down',
      'Repayments take a big share of your pay, which leaves little for surprises. List your debts, pay the most expensive first, and talk to a free debt adviser if it feels too much.', [T.debt, L.stepchange]);
    if (A.e_credit === 'often') add(93, 'debt', 'Break the cycle of borrowing for essentials',
      'Borrowing for food or bills most months means the gap grows over time. Look at where your money goes, check you get every benefit you are entitled to, and get free advice before it builds up.', [T.budget, L.benefits, L.stepchange]);
    else if (A.e_credit === 'sometimes') add(72, 'budget', 'Build a buffer so you don\'t need to borrow',
      'Borrowing for essentials now and then is common. A small buffer in savings, even a few hundred pounds, means the next surprise doesn\'t go on a card.', [T.budget, T.savings]);
    if (G.job === 'consult' || G.job === 'happened') add(92, 'job', 'Plan for redundancy',
      'Check what redundancy pay you are owed, how long your money will last, and what to do with any lump sum.', [T.redundancy, L.mh]);
    if (A.s_months === 'none' || A.s_months === 'lt1') add(A.s_months === 'none' ? 90 : 86, 'savings', 'Start a small emergency fund',
      'Even £500 to £1,000 set aside stops a surprise bill turning into debt. Try a small automatic transfer on payday into an easy-access account.' + (debtProblem(A) ? ' Keep up your debt repayments too: a small buffer helps you avoid borrowing again.' : ''), [T.savings, T.dreams]);
    if (A.e_left === 'no' || A.e_left === 'just') add(A.e_left === 'no' ? 88 : 70, 'budget', 'Find some breathing space in your budget',
      'Look at your last 2 or 3 months of spending to find regular costs you could cut, such as unused subscriptions, and check your tax code and benefits are right.', [T.budget, T.takehome, A.e_left === 'no' ? L.benefits : null]);
    if (A.b_cards === 'min' || A.b_cards === 'some') add(A.b_cards === 'min' ? 80 : 62, 'debt', 'Clear card balances, most expensive first',
      'Card interest is often over 20% a year. Paying a bit more than the minimum, starting with the highest rate, saves a lot. A 0% balance transfer may help if you can clear it within the offer.', [T.debt]);
    if (A.f_pension === 'no') add(78, 'pension', selfEmp ? 'Start a pension, even a small one' : 'Join (or rejoin) your workplace pension',
      selfEmp ? 'Self-employed people get no employer contribution, but tax relief still adds £25 for every £100 you pay in (from £80 of your money). Even a small regular amount helps.'
        : 'If you are employed, your employer must pay in too, and the government adds tax relief. Opting out means turning down money you would otherwise get.', [T.retirement, selfEmp ? T.self : T.takehome]);
    if (A.s_life === 'no' || A.s_life === 'some') add(A.s_life === 'no' ? 76 : 58, 'protection', 'Check your family would be protected',
      'People rely on your income. Check any death-in-service at work first, then see how much cover would clear debts and replace your income. Simple term life insurance often costs less than people expect.', [T.protection, G.family ? T.family : null]);
    if (A.s_months === 'm1') add(66, 'savings', 'Grow your safety net to 3 to 6 months',
      'You have a good start. Most people aim for 3 to 6 months of essential bills in an easy-access account, so a job loss or big repair doesn\'t knock you off course.', [T.savings]);
    if (A.p_will === 'no') add(64, 'will', 'Make a will',
      'Without a will, the law decides who gets what, and an unmarried partner may get nothing. A simple will need not cost much, and some charities run free will schemes.', [willLink(), T.iht]);
    else if (A.p_will === 'old') add(50, 'will', 'Update your will',
      'Marriage, divorce, children or a new home can all change what your will should say. In England and Wales, getting married usually cancels an existing will.', [willLink(), T.iht]);
    if (A.s_sick === 'no' || A.s_sick === 'part') add(A.s_sick === 'no' ? 62 : 46, 'protection', 'Plan for time off sick',
      'Statutory Sick Pay is much less than most people earn. Check what your employer pays, and whether income protection would cover your bills if you were ill for months.', [T.protection]);
    if (A.f_track === 'no' || A.f_track === 'think') add(A.f_track === 'no' ? 60 : 44, 'pension', 'Check if you\'re on track for retirement',
      'Gather your pension statements and your State Pension forecast, then see what income they could give you and how that compares with what you will need.', [T.retirement, a != null && a >= 55 ? T.rincome : null, a != null && a >= 50 ? L.pw : null]);
    if (A.f_sp === 'no' || A.f_sp === 'old') add(A.f_sp === 'no' ? 56 : 40, 'pension', 'Check your State Pension forecast',
      'It takes about 5 minutes online and shows how much you could get and when. Gaps in your National Insurance record can sometimes be filled with voluntary contributions.', [L.sp, T.retirement]);
    if (A.e_track === 'no' || A.e_track === 'rough') add(A.e_track === 'no' ? 54 : 36, 'budget', 'Get to know your spending',
      'Load a bank statement into our Budget tool. It sorts your spending into groups on this device, so you can see where the money goes.', [T.budget]);
    if (A.p_nom === 'no' || A.p_nom === 'unsure') add(A.p_nom === 'no' ? 48 : 38, 'will', 'Update your pension nominations',
      'Ask each pension provider, and your employer for death-in-service, for an "expression of wish" form. It takes minutes and makes sure the money goes to the people you choose.', [L.trace]);
    if (A.p_lpa === 'no' || A.p_lpa === 'started') add(A.p_lpa === 'no' ? 45 : 34, 'will', region() === 'ni' ? 'Set up an enduring power of attorney' : region() === 'scotland' ? 'Set up a power of attorney' : 'Set up a lasting power of attorney',
      'If an illness or accident meant you couldn\'t manage your money, this lets someone you trust do it for you. Without one, your family may need to go to court, which is slow and costly.', [lpaLink()]);
    if (A.f_pension === 'min') add(42, 'pension', 'Think about paying a little more into your pension',
      'Even 1% more of your pay, raised again when you get a pay rise, can add up to thousands by retirement. Ask if your employer matches extra payments or offers salary sacrifice.', [T.retirement, T.takehome]);

    list.sort(function (x, y) { return y.pri - x.pri; });
    var real = list.slice(0, 6);
    var shown = real.slice();
    if (shown.length < 2) {
      shown.push({ pri: 5, topic: 'keep', title: 'Keep track of your progress', why: 'You\'re doing well. Tracking what you own and owe each month keeps you on course.', links: [T.networth] });
      shown.push({ pri: 4, topic: 'keep', title: 'Plan your next goal', why: 'With the basics in place, put a price and a date on the things you want and see what to save each month.', links: [T.dreams] });
    }
    return { real: real, shown: shown };
  }

  /* ---------- rendering ---------- */
  function render() {
    main.innerHTML = '';
    if (S.view === 'results' && S.history.length) renderResults(); else renderQuiz();
  }

  function header(title, sub, right) {
    return el('div', { class: 'row hc-head' },
      el('div', { class: 'hc-head-text' }, el('h1', { id: 'hc-h1', tabindex: '-1' }, title), el('p', { class: 'muted' }, sub)),
      right || null);
  }

  function renderQuiz() {
    var qs = active();
    S.step = MP.clamp(+S.step || 0, 0, qs.length - 1);
    var last = S.history[S.history.length - 1];
    main.appendChild(header('Financial health check', 'Answer ' + qs.length + ' quick questions to get a money score and the next steps that matter most for you.'));

    var modeBtns = el('div', { class: 'seg seg-sm', role: 'group', 'aria-label': 'How to show the questions' },
      el('button', { type: 'button', id: 'hc-mode-step', 'aria-pressed': String(S.mode === 'step'), onclick: function () { setMode('step'); } }, 'One at a time'),
      el('button', { type: 'button', id: 'hc-mode-list', 'aria-pressed': String(S.mode === 'list'), onclick: function () { setMode('list'); } }, 'Show all questions'));
    var note = MP.isDetailed()
      ? el('p', { class: 'small muted hc-mode-note', id: 'hc-mode-note' }, 'Detailed view: all 15 questions, 3 in each area.')
      : el('p', { class: 'small muted hc-mode-note', id: 'hc-mode-note' }, 'Simple view: the 10 most important questions, 2 in each area. Switch to Detailed at the top for all 15.');
    main.appendChild(el('div', { class: 'row hc-bar no-print' }, modeBtns, note));

    if (last) main.appendChild(el('p', { class: 'callout small hc-last' }, 'Your last score was ' + last.score + '/100 on ' + MP.fmtDate(last.date) + '. Your answers from last time are filled in, so just change what\'s different. ',
      el('button', { type: 'button', class: 'btn btn-sm btn-ghost', id: 'hc-see-results', onclick: function () { S.view = 'results'; save(); render(); focusTop(); } }, 'See my results')));

    main.appendChild(S.mode === 'list' ? listView(qs) : stepView(qs));
    main.appendChild(howTo());
  }

  function setMode(m) { if (S.mode === m) return; S.mode = m; save(); render(); }

  function prefillNote(q) {
    var src = S.from[q.id];
    if (!src || S.answers[q.id] == null) return null;
    return el('p', { class: 'hc-prefill small' }, el('span', { 'aria-hidden': 'true' }, '✓ '), 'We filled this from ' + src + '. Change it if it\'s not right.');
  }

  function questionBody(q, idx, onPick, headingTag) {
    var name = 'hc-' + q.id, cur = S.answers[q.id];
    var title = el(headingTag, { class: 'hc-q-title', id: 'hc-q-' + q.id, tabindex: '-1' }, w(q.q));
    var fs = el('fieldset', { class: 'hc-fieldset', dataset: { q: q.id } }, el('legend', null, title));
    var help = q.term ? MP.explain(q.term) : q.explain ? MP.explain(null, q.explain) : null;
    if (help) fs.appendChild(help);
    var pn = prefillNote(q); if (pn) fs.appendChild(pn);
    var opts = el('div', { class: 'hc-opts' });
    q.options.forEach(function (o) {
      var input = el('input', { type: 'radio', name: name, value: o.v, id: name + '-' + o.v, checked: cur === o.v, dataset: { pts: o.pts == null ? 'na' : String(o.pts) } });
      input.addEventListener('change', function () {
        S.answers[q.id] = o.v; delete S.from[q.id]; save();
        var note = fs.querySelector('.hc-prefill'); if (note) note.remove();
        fs.classList.remove('hc-missing');
        if (onPick) onPick();
      });
      opts.appendChild(el('label', { class: 'hc-opt', for: input.id }, input, el('span', null, o.label)));
    });
    fs.appendChild(opts);
    return fs;
  }

  function stepView(qs) {
    var q = qs[S.step], a = AREA[q.area];
    var inArea = qs.filter(function (x) { return x.area === q.area; }), posInArea = inArea.indexOf(q) + 1;
    var pct = Math.round(S.step / qs.length * 100);
    var next = el('button', { type: 'button', class: 'btn btn-primary', id: 'hc-next', disabled: S.answers[q.id] == null }, S.step === qs.length - 1 ? 'See my score' : 'Next →');
    var back = el('button', { type: 'button', class: 'btn', id: 'hc-back', disabled: S.step === 0, onclick: function () { S.step--; save(); render(); focusQuestion(); } }, '← Back');
    var fs = questionBody(q, S.step, function () { next.disabled = false; }, 'h2');
    fs.addEventListener('keydown', function (e) { if (e.key === 'Enter' && e.target.type === 'radio') { e.preventDefault(); next.click(); } });
    next.onclick = function () {
      if (S.answers[q.id] == null) return;
      if (S.step >= qs.length - 1) { finish(); return; }
      S.step++; save(); render(); focusQuestion();
    };
    return el('section', { class: 'card hc-quiz hc-step', 'aria-labelledby': 'hc-q-' + q.id },
      el('div', { class: 'hc-top' },
        el('span', { class: 'small muted', id: 'hc-progress-text', dataset: { total: String(qs.length), index: String(S.step + 1) } }, 'Question ' + (S.step + 1) + ' of ' + qs.length),
        el('span', { class: 'chip info hc-area-chip' }, el('span', { 'aria-hidden': 'true' }, a.icon), a.name + ' · ' + posInArea + ' of ' + inArea.length)),
      el('div', { class: 'progress', role: 'progressbar', 'aria-label': 'Progress', 'aria-valuemin': 0, 'aria-valuemax': 100, 'aria-valuenow': pct }, el('span', { style: { width: pct + '%' } })),
      fs,
      el('div', { class: 'row hc-nav' }, back, el('span', { class: 'mp-spacer' }), next));
  }

  function listView(qs) {
    var err = el('p', { class: 'callout warning', id: 'hc-list-error', role: 'alert', hidden: true });
    var answered = el('span', { class: 'small muted', id: 'hc-progress-text', dataset: { total: String(qs.length) } });
    function count() { var n = qs.filter(function (q) { return S.answers[q.id] != null; }).length; answered.textContent = n + ' of ' + qs.length + ' answered'; answered.dataset.index = String(n); }
    var wrap = el('section', { class: 'card hc-quiz hc-list', 'aria-label': 'All questions' }, el('div', { class: 'hc-top' }, answered));
    AREAS.forEach(function (a) {
      var aq = qs.filter(function (q) { return q.area === a.key; });
      wrap.appendChild(el('h2', { class: 'hc-area-h' }, el('span', { 'aria-hidden': 'true' }, a.icon + ' '), a.name));
      aq.forEach(function (q) { wrap.appendChild(questionBody(q, 0, count, 'h3')); });
    });
    wrap.appendChild(err);
    wrap.appendChild(el('div', { class: 'row hc-nav' }, el('span', { class: 'mp-spacer' }),
      el('button', { type: 'button', class: 'btn btn-primary', id: 'hc-finish-all', onclick: function () {
        var missing = qs.filter(function (q) { return S.answers[q.id] == null; });
        MP.$$('.hc-fieldset', wrap).forEach(function (f) { f.classList.toggle('hc-missing', missing.some(function (q) { return q.id === f.dataset.q; })); });
        if (missing.length) {
          err.textContent = missing.length === 1 ? 'One question still needs an answer. It is marked below.' : missing.length + ' questions still need an answer. They are marked.';
          err.hidden = false;
          var t = MP.$('#hc-q-' + missing[0].id); if (t) { t.focus(); t.scrollIntoView({ block: 'center' }); }
          return;
        }
        finish();
      } }, 'See my score')));
    count();
    return wrap;
  }

  function focusQuestion() { var t = MP.$('.hc-step .hc-q-title'); if (t) t.focus(); }
  function focusTop() { window.scrollTo(0, 0); var h = MP.$('#hc-h1'); if (h) h.focus({ preventScroll: true }); }

  function finish() {
    var qs = active(), ans = {};
    qs.forEach(function (q) { if (S.answers[q.id] != null) ans[q.id] = S.answers[q.id]; });
    var r = score(ans, qs);
    var entry = { date: new Date().toISOString(), score: r.score, areaScores: r.areaScores, answers: ans, count: qs.length };
    S.history.push(entry);
    S.history = S.history.slice(-MAX_HISTORY);
    S.view = 'results'; S.step = 0;
    save();
    var acts = actions(ans).real.length;
    saveSummary();
    MP.log('Financial health check: money score ' + r.score + '/100' + (acts ? ', ' + acts + (acts === 1 ? ' action' : ' actions') : ''));
    render();
    focusTop();
    MP.toast('Your money score is ' + r.score + ' out of 100.');
  }

  function saveSummary() {
    var last = S.history[S.history.length - 1];
    if (!last) { MP.set('summaries.health-check', undefined); return; }
    var n = actions(last.answers).real.length;
    MP.summary('health-check', 'Money score ' + last.score + '/100 · ' + (n ? n + (n === 1 ? ' action' : ' actions') : 'no urgent actions'));
  }

  /* ---------- results ---------- */
  function renderResults() {
    var last = S.history[S.history.length - 1], prev = S.history.length > 1 ? S.history[S.history.length - 2] : null;
    var b = band(last.score), acts = actions(last.answers);
    main.appendChild(header('Your money score', 'From your health check on ' + MP.fmtDate(last.date) + '. This is guidance to help you decide what to look at first, not financial advice.',
      el('div', { class: 'row no-print hc-actions-bar' },
        el('button', { type: 'button', class: 'btn btn-primary', id: 'hc-retake', onclick: retake }, '↻ Retake the check'),
        el('button', { type: 'button', class: 'btn', id: 'hc-print', onclick: function () { window.print(); } }, '🖨 Print'),
        el('button', { type: 'button', class: 'btn btn-ghost', id: 'hc-reset', onclick: reset }, 'Reset'))));

    // score + areas
    var scoreCard = el('section', { class: 'card hc-score-card', 'aria-labelledby': 'hc-score-h', 'aria-live': 'polite' },
      el('h2', { id: 'hc-score-h', class: 'visually-hidden' }, 'Overall score'),
      gauge(last.score),
      el('p', { class: 'hc-score-line' }, el('span', { class: 'visually-hidden', id: 'hc-score', dataset: { score: String(last.score) } }, 'Money score ' + last.score), el('span', { class: 'muted' }, 'out of 100'), el('span', { class: 'chip ' + b.cls, id: 'hc-band' }, b.label)),
      el('p', { id: 'hc-message' }, message(last.score)),
      el('p', { class: 'small muted' }, 'Based on ' + last.count + ' questions.' + (last.count < QUESTIONS.length ? ' Simple view asks the 10 most important ones.' : '')),
      MP.isDetailed() && last.count < QUESTIONS.length ? el('button', { type: 'button', class: 'btn btn-sm no-print', id: 'hc-more', onclick: function () {
        var qs = active(), i = qs.findIndex(function (q) { return S.answers[q.id] == null; });
        S.view = 'quiz'; S.mode = 'step'; S.step = i < 0 ? 0 : i; applyPrefill(); save(); render(); focusQuestion();
      } }, 'Answer the ' + (QUESTIONS.length - last.count) + ' extra questions') : null);

    var areaList = el('ul', { class: 'hc-areas', id: 'hc-areas' }, AREAS.map(function (a) {
      var s = last.areaScores[a.key], ab = band(s);
      return el('li', { dataset: { area: a.key } }, el('span', { class: 'hc-area-ico', 'aria-hidden': 'true' }, a.icon), el('span', { class: 'hc-area-name' }, a.name),
        el('span', { class: 'hc-area-score' }, s + '/100'), el('span', { class: 'chip ' + ab.cls }, ab.label));
    }));
    var areaCard = el('section', { class: 'card', 'aria-labelledby': 'hc-areas-h' }, el('h2', { id: 'hc-areas-h' }, 'Score by area'), areaList,
      el('div', { class: 'hc-bars' }, areaBars(last)));
    main.appendChild(el('div', { class: 'grid-2 hc-top-grid' }, scoreCard, areaCard));

    if (prev) main.appendChild(sinceLast(last, prev));

    // actions
    var debt = debtProblem(last.answers);
    var ol = el('ol', { class: 'hc-action-list', id: 'hc-actions' });
    acts.shown.forEach(function (x, i) {
      var li = el('li', { class: 'hc-action' + (i === 0 && x.topic !== 'keep' ? ' first' : ''), dataset: { topic: x.topic } },
        el('h3', null, x.title), el('p', null, x.why),
        x.links.length ? el('p', { class: 'hc-links small' }, x.links.map(function (l) {
          return el('a', l.ext ? { href: l.href, target: '_blank', rel: 'noopener' } : { href: l.href }, l.text + (l.ext ? ' ↗' : ''));
        })) : null);
      ol.appendChild(li);
      if (i === 0 && debt) ol.appendChild(el('li', { class: 'hc-advice-li' }, MP.adviceCard('debt')));
    });
    main.appendChild(el('section', { class: 'card', 'aria-labelledby': 'hc-actions-h' },
      el('h2', { id: 'hc-actions-h' }, acts.real.length ? 'Your next best actions' : 'Nothing urgent: nice work'),
      el('p', { class: 'small muted' }, acts.real.length ? 'In order of what matters most. Most people find it easiest to take one step at a time.' : 'You scored well in every area. Here are some ideas to keep going.'),
      ol));

    main.appendChild(answersTable(last));
    if (S.history.length > 1) main.appendChild(trend());
    main.appendChild(MP.adviceCard('general'));
    main.appendChild(howTo());
  }

  function gauge(s) {
    function svg(tag, attrs, text) { var e = document.createElementNS(SVGNS, tag); Object.keys(attrs).forEach(function (k) { e.setAttribute(k, attrs[k]); }); if (text != null) e.textContent = text; return e; }
    var g = svg('svg', { viewBox: '0 0 200 116', class: 'hc-gauge', id: 'hc-gauge', role: 'img', 'aria-label': 'Money score ' + s + ' out of 100' });
    var d = 'M 20 100 A 80 80 0 0 1 180 100';
    g.appendChild(svg('path', { d: d, fill: 'none', stroke: MP.css('--surface-2'), 'stroke-width': 18, 'stroke-linecap': 'butt' }));
    if (s > 0) g.appendChild(svg('path', { d: d, fill: 'none', stroke: MP.css(band(s).color), 'stroke-width': 18, 'stroke-linecap': 'butt', pathLength: 100, 'stroke-dasharray': s + ' 200' }));
    g.appendChild(svg('text', { x: 100, y: 92, 'text-anchor': 'middle', 'font-size': 38, 'font-weight': 750, fill: MP.css('--text') }, String(s)));
    g.appendChild(svg('text', { x: 20, y: 114, 'text-anchor': 'middle', 'font-size': 10, fill: MP.css('--muted') }, '0'));
    g.appendChild(svg('text', { x: 180, y: 114, 'text-anchor': 'middle', 'font-size': 10, fill: MP.css('--muted') }, '100'));
    return g;
  }

  /* MP.barChart scales to the largest value; rescale so bars are out of 100. */
  function areaBars(entry) {
    var items = AREAS.map(function (a) { var s = entry.areaScores[a.key]; return { label: a.name, value: s, color: band(s).color }; });
    var chart = MP.barChart({ items: items, format: function (v) { return v + '/100'; }, label: 'Score by area, out of 100', labelWidth: 130, width: (window.innerWidth || 1024) < 560 ? 380 : 460 });
    try {
      var vb = chart.getAttribute('viewBox').split(' '), W = +vb[2], PL = 130, PR = 70, max = Math.max.apply(null, items.map(function (i) { return i.value; }).concat([1]));
      var rects = chart.querySelectorAll('rect'), texts = chart.querySelectorAll('text');
      Array.prototype.forEach.call(rects, function (r, i) {
        var wv = (W - PL - PR) * items[i].value / 100;
        r.setAttribute('width', Math.max(2, wv));
        var t = texts[i * 2 + 1]; if (t) t.setAttribute('x', PL + wv + 6);
      });
      if (max <= 0) return chart;
    } catch (e) { }
    return chart;
  }

  function sinceLast(last, prev) {
    var diff = last.score - prev.score;
    var changes = AREAS.map(function (a) { return { a: a, d: (last.areaScores[a.key] || 0) - (prev.areaScores[a.key] || 0) }; }).filter(function (c) { return c.d !== 0; });
    var better = Object.keys(last.answers).filter(function (k) {
      var q = Q[k]; if (!q || prev.answers[k] == null) return false;
      var o1 = optionOf(q, last.answers[k]), o0 = optionOf(q, prev.answers[k]);
      return o1 && o0 && o1.pts != null && o0.pts != null && o1.pts > o0.pts;
    });
    var cls = diff > 0 ? 'success' : diff < 0 ? 'warning' : '';
    var headline = diff > 0 ? 'Up ' + diff + ' points since ' + MP.fmtDate(prev.date) + '. Well done.' : diff < 0 ? 'Down ' + (-diff) + ' points since ' + MP.fmtDate(prev.date) + '. Life changes, and that\'s OK: the steps below can help.' : 'The same score as on ' + MP.fmtDate(prev.date) + '.';
    return el('section', { class: 'callout ' + cls, id: 'hc-since', 'aria-labelledby': 'hc-since-h' },
      el('h2', { id: 'hc-since-h', class: 'hc-since-h' }, 'Since last time'),
      el('p', null, headline),
      changes.length ? el('ul', { class: 'hc-change-list small' }, changes.map(function (c) {
        return el('li', null, c.a.icon + ' ' + c.a.name + ': ' + (c.d > 0 ? '+' : '−') + Math.abs(c.d));
      })) : null,
      better.length ? el('p', { class: 'small' }, 'You improved: ' + better.map(function (k) { return shortQ(Q[k]); }).slice(0, 5).join(', ') + (better.length > 5 ? ' and ' + (better.length - 5) + ' more' : '') + '.') : null);
  }
  function shortQ(q) {
    return { e_left: 'money left each month', e_credit: 'borrowing for essentials', e_track: 'knowing your spending', s_months: 'emergency savings', s_life: 'life cover',
      s_sick: 'sick pay cover', b_missed: 'payments on time', b_ratio: 'debt repayments', b_cards: 'paying cards in full', f_pension: 'pension saving', f_track: 'retirement on track',
      f_sp: 'State Pension check', p_will: 'your will', p_lpa: 'power of attorney', p_nom: 'pension nominations' }[q.id] || q.id;
  }

  function answersTable(entry) {
    var rows = [];
    AREAS.forEach(function (a) {
      QUESTIONS.filter(function (q) { return q.area === a.key && entry.answers[q.id] != null; }).forEach(function (q) {
        var o = optionOf(q, entry.answers[q.id]);
        rows.push(el('tr', null, el('td', null, a.icon + ' ' + w(q.q)), el('td', null, o ? o.label : '—'), el('td', { class: 'num' }, o && o.pts != null ? String(o.pts) : 'n/a')));
      });
    });
    return el('details', { class: 'card detail-only hc-answers' }, el('summary', null, 'Your answers and how they scored'),
      el('p', { class: 'small muted' }, 'Each answer scores 0 to 100. An area\'s score is the average of its answers, and your overall score is the average of the five areas. Answers that don\'t apply to you are left out.'),
      el('div', { class: 'scroll-x' }, el('table', { class: 'table small' },
        el('thead', null, el('tr', null, el('th', null, 'Question'), el('th', null, 'Your answer'), el('th', { class: 'num' }, 'Points'))),
        el('tbody', null, rows))));
  }

  function trend() {
    var h = S.history;
    var labels = h.map(function (x) { return new Date(x.date).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' }); });
    var chart = MP.lineChart({ series: [{ name: 'Money score', color: '--c1', values: h.map(function (x) { return x.score; }), area: true }], labels: labels, label: 'Your money score over time' });
    // the shared chart labels its axis in pounds; scores are points
    MP.$$('text', chart).forEach(function (t) { if (/^£/.test(t.textContent)) t.textContent = t.textContent.replace(/^£/, ''); });
    var list = el('ul', { class: 'hc-history small', id: 'hc-history' }, h.slice().reverse().map(function (x) {
      return el('li', null, el('span', null, MP.fmtDate(x.date)), el('strong', null, x.score + '/100'), el('span', { class: 'muted' }, x.count + ' questions'));
    }));
    return el('section', { class: 'card', id: 'hc-trend', 'aria-labelledby': 'hc-trend-h' },
      el('h2', { id: 'hc-trend-h' }, 'Your progress'),
      chart,
      el('details', { class: 'hc-history-wrap' }, el('summary', { class: 'small' }, 'All ' + h.length + ' checks (we keep your last ' + MAX_HISTORY + ')'), list));
  }

  function howTo() {
    return el('details', { class: 'card no-print hc-howto' }, el('summary', null, 'How to use this, and tips'),
      el('ul', { class: 'small' },
        el('li', null, 'Answer honestly: nobody else sees this. Your answers are encrypted and stay on this device.'),
        el('li', null, 'Not sure about an answer? Pick the closest one. "Not sure" usually means it\'s worth checking.'),
        el('li', null, 'Simple view asks the 10 most important questions. Switch to Detailed at the top for all 15 and a breakdown of how each answer scored.'),
        el('li', null, 'Start with the first action. Small steps, one at a time, improve your score fastest.'),
        el('li', null, 'Retake the check every 6 months, or after a big change like a new job, a baby, a move or a break-up. Your progress chart shows how far you\'ve come.'),
        el('li', null, 'Doing this as a couple? Each take it, then compare. It\'s a gentle way to start a money conversation.')));
  }

  function retake() {
    S.view = 'quiz'; S.step = 0; applyPrefill(); save(); render(); focusQuestion();
  }
  function reset() {
    if (!MP.confirm('Clear all your health check answers and past scores?')) return;
    S = freshState(); S.view = 'quiz';
    MP.set('tools.health-check', undefined); MP.set('summaries.health-check', undefined);
    applyPrefill(); save(); render(); focusTop();
    MP.toast('Health check cleared.');
  }

  MP.onPrefs(function () { render(); });
  MP.onTheme(function () { render(); });
  // charts pick a narrow or wide layout when drawn, so redraw results when that changes
  var wasNarrow = (window.innerWidth || 1024) < 560, rt;
  window.addEventListener('resize', function () {
    clearTimeout(rt);
    rt = setTimeout(function () { var n = (window.innerWidth || 1024) < 560; if (n !== wasNarrow) { wasNarrow = n; if (S.view === 'results') render(); } }, 150);
  });

  if (S.view === 'quiz') applyPrefill();
  render();
});
