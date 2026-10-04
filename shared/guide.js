/* Guided setup: an adaptive question flow that personalises the whole planner.
   The first three answers (knowledge, detail, advice) change how later questions are worded, how many
   are asked, and how every tool behaves. The flow ends with a personal step-by-step plan. */
MP.page({ id: 'guide', title: 'Guided setup', noToggle: true }).then(function () {
  'use strict';
  var el = MP.el, main = MP.$('#app');
  var prof = MP.profile(), prefs = MP.prefs();
  var restart = /restart=1/.test(location.search);
  var draft = MP.get('tools.guide', null);
  var A = (draft && !restart && !prefs.onboarded) ? draft.answers : Object.assign({}, prefs.answers || {});
  // seed from the profile so returning customers do not retype
  if (A.dob == null && prof.dob) A.dob = prof.dob;
  if (A.region == null) A.region = prof.region || 'england';
  if (A.salary == null && prof.salary) A.salary = prof.salary;
  if (A.employment == null) A.employment = prof.employment || 'employed';
  if (A.knowledge == null && prefs.knowledge) A.knowledge = prefs.knowledge;
  if (A.detail == null && prefs.onboarded) A.detail = prefs.detail;
  if (A.advice == null && prefs.advice) A.advice = prefs.advice;
  var stepIndex = (draft && !restart && !prefs.onboarded) ? (draft.step || 0) : 0;

  /* Pick wording for the customer's knowledge level. */
  function w(v) { var k = A.knowledge || 'new'; return typeof v === 'string' ? v : (v[k] || v.basics || v.new); }
  function has(p) { return (A.priorities || []).indexOf(p) >= 0; }
  function detailed() { return A.detail === 'detailed'; }
  function age() { return A.dob ? UK.age(A.dob) : null; }

  var PRIORITIES = [
    { value: 'bills', icon: '🧾', label: 'Get on top of bills and spending' },
    { value: 'debt', icon: '💳', label: 'Pay off debts' },
    { value: 'safety', icon: '🛟', label: 'Build a safety net' },
    { value: 'home', icon: '🏡', label: 'Buy a home or move' },
    { value: 'save', icon: '🎯', label: 'Save for something special' },
    { value: 'invest', icon: '📈', label: 'Grow my money by investing' },
    { value: 'retire', icon: '🏖️', label: 'Plan for retirement' },
    { value: 'protect', icon: '🛡️', label: 'Protect my family' },
    { value: 'family', icon: '👶', label: 'Plan for a baby or children' },
    { value: 'legacy', icon: '📜', label: 'Pass money on / inheritance tax' },
    { value: 'selfemp', icon: '🧑‍💼', label: 'Sort tax as self-employed' },
    { value: 'job', icon: '📦', label: 'Prepare for redundancy or job loss' }
  ];

  /* Every possible question. `when` decides whether it is asked. */
  var STEPS = [
    { id: 'knowledge', type: 'choice', title: 'How confident do you feel about money matters?',
      help: 'There are no wrong answers. We use this to explain things at the right level.',
      options: [
        { value: 'new', label: 'I\'m new to this', hint: 'Keep it plain and explain the jargon' },
        { value: 'basics', label: 'I know the basics', hint: 'I know what an ISA and a pension are' },
        { value: 'confident', label: 'I\'m confident', hint: 'I\'m comfortable with tax wrappers, funds and drawdown' }] },
    { id: 'detail', type: 'choice', title: { new: 'How much would you like to see?', basics: 'How much detail would you like?', confident: 'How much detail do you want in each tool?' },
      help: 'You can switch between Simple and Detailed at the top of any tool.',
      options: [
        { value: 'simple', label: 'Just the essentials', hint: 'Fewer questions, sensible assumptions filled in for you' },
        { value: 'detailed', label: 'Show me every option', hint: 'More inputs, breakdowns and assumptions you can change' }] },
    { id: 'advice', type: 'choice', title: { new: 'Would you like help from a professional adviser?', basics: 'How do you feel about getting financial advice?', confident: 'Do you use, or want, a regulated financial adviser?' },
      help: { new: 'A financial adviser is a qualified professional who tells you what to do, and usually charges a fee. This planner gives free guidance: it helps you understand your options, but the decisions are yours.' },
      options: [
        { value: 'diy', label: 'I\'d rather do it myself', hint: 'Show me free guidance only' },
        { value: 'maybe', label: 'Maybe, for big decisions', hint: 'Mention advice where it matters most' },
        { value: 'yes', label: 'Yes, I\'d like an adviser', hint: 'Help me find one and prepare for the meeting' }] },
    { id: 'about', type: 'form', title: { new: 'A little about you', basics: 'About you', confident: 'Your details' },
      help: 'This stays encrypted on this device. Leave anything blank you are not sure about.' },
    { id: 'lifeStage', type: 'choice', title: 'Which of these sounds most like you right now?',
      options: [
        { value: 'starting', label: 'Starting out', hint: 'First jobs, renting, maybe paying off a student loan' },
        { value: 'building', label: 'Building a life', hint: 'Career, partner, home or children' },
        { value: 'midlife', label: 'Mid-career', hint: 'Juggling family, mortgage and future plans' },
        { value: 'preretire', label: 'Approaching retirement', hint: 'Thinking about when and how to stop work' },
        { value: 'retired', label: 'Retired', hint: 'Making my money last' }] },
    { id: 'priorities', type: 'multi', title: { new: 'What would you most like help with?', basics: 'What matters most to you right now?', confident: 'What are your priorities?' },
      help: function () { return detailed() ? 'Pick as many as you like.' : 'Pick up to 3. You can always come back for more.'; },
      max: function () { return detailed() ? 12 : 3; }, options: PRIORITIES },

    // ---- follow-ups, asked only for the priorities chosen ----
    { id: 'leftover', when: function () { return has('bills') || has('debt') || has('safety'); }, type: 'choice',
      title: { new: 'At the end of most months, is there any money left?', basics: 'Do you usually have money left at the end of the month?', confident: 'What is your typical monthly cash flow?' },
      options: [{ value: 'yes', label: 'Yes, usually' }, { value: 'just', label: 'Just about' }, { value: 'no', label: 'No, I often run short' }] },
    { id: 'debtFeel', when: function () { return has('debt'); }, type: 'choice',
      title: { new: 'How do your debts feel at the moment?', basics: 'How are your debt repayments going?', confident: 'How would you describe your debt position?' },
      help: { new: 'Debts include credit cards, loans, overdrafts, buy now pay later and car finance.' },
      options: [{ value: 'ok', label: 'Manageable, I just want them gone sooner' }, { value: 'hard', label: 'Getting harder to keep up' }, { value: 'behind', label: 'I\'m behind on some payments' }] },
    { id: 'debtTotal', when: function () { return has('debt') && detailed(); }, type: 'money',
      title: 'Roughly how much do you owe, not counting your mortgage?', help: 'A rough figure is fine.' },
    { id: 'savingsMonths', when: function () { return has('safety') || has('invest') || has('job'); }, type: 'choice',
      title: { new: 'If your pay stopped, how long could your savings cover your bills?', basics: 'How many months of essential spending do you have in savings?', confident: 'How many months of essential spending is your emergency fund?' },
      help: { new: 'Most people aim for 3 to 6 months of essential bills, kept somewhere easy to reach.' },
      options: [{ value: '0', label: 'I have no savings' }, { value: '0.5', label: 'Less than a month' }, { value: '2', label: '1 to 3 months' }, { value: '4.5', label: '3 to 6 months' }, { value: '6', label: 'More than 6 months' }] },
    { id: 'essentialCosts', when: function () { return has('safety') && detailed(); }, type: 'money',
      title: 'What do your essential bills come to each month?', help: 'Rent or mortgage, council tax, energy, food, transport, insurance and phone. Leave out things you could cut.' },
    { id: 'homeFirst', when: function () { return has('home'); }, type: 'choice',
      title: { new: 'Would this be your first home?', basics: 'Are you a first-time buyer?', confident: 'First-time buyer?' },
      options: [{ value: 'yes', label: 'Yes, my first home' }, { value: 'no', label: 'No, I\'m moving or buying another' }] },
    { id: 'homePrice', when: function () { return has('home'); }, type: 'money',
      title: { new: 'Roughly how much might the home cost?', basics: 'What price of home are you aiming for?', confident: 'Target purchase price' } },
    { id: 'homeDeposit', when: function () { return has('home'); }, type: 'money',
      title: { new: 'How much have you saved towards it so far?', basics: 'How much deposit have you saved?', confident: 'Deposit saved so far' } },
    { id: 'homeWhen', when: function () { return has('home'); }, type: 'choice', title: 'When would you like to buy?',
      options: [{ value: '1', label: 'Within a year' }, { value: '3', label: 'In 2 to 3 years' }, { value: '5', label: 'In 4 to 5 years' }, { value: '8', label: 'Later than that' }] },
    { id: 'saveGoal', when: function () { return has('save'); }, type: 'goal',
      title: { new: 'What are you saving for?', basics: 'What are you saving for, and how much do you need?', confident: 'Your savings goal' } },
    { id: 'investExp', when: function () { return has('invest'); }, type: 'choice',
      title: { new: 'Have you ever invested money before, for example in a stocks and shares ISA?', basics: 'How much investing have you done?', confident: 'Your investing experience' },
      options: [{ value: 'never', label: 'Never' }, { value: 'some', label: 'A little' }, { value: 'regular', label: 'I invest regularly' }] },
    { id: 'riskReaction', when: function () { return has('invest') || has('retire'); }, type: 'choice',
      title: { new: 'Imagine you put £1,000 away and a year later it is worth £800. What would you do?', basics: 'If your investments fell 20% in a year, what would you do?', confident: 'Your likely reaction to a 20% market fall' },
      help: { new: 'Investments go up and down. This helps us understand how much ups and downs you are comfortable with.' },
      options: [{ value: 'cautious', label: 'Take it out, I don\'t want to lose more' }, { value: 'balanced', label: 'Leave it and wait for it to recover' }, { value: 'adventurous', label: 'Put more in while prices are low' }] },
    { id: 'pensionKnow', when: function () { return has('retire'); }, type: 'choice',
      title: { new: 'Do you know how much is in your pensions?', basics: 'Do you know your pension pot values?', confident: 'Do you know your current pension values?' },
      help: { new: 'Each pension sends a yearly statement. You can also check your State Pension at gov.uk/check-state-pension.' },
      options: [{ value: 'no', label: 'No idea' }, { value: 'rough', label: 'Roughly' }, { value: 'yes', label: 'Yes' }] },
    { id: 'pensionTotal', when: function () { return has('retire') && detailed() && A.pensionKnow !== 'no'; }, type: 'money',
      title: 'Roughly how much is in all your pensions together?' },
    { id: 'retireAge', when: function () { return has('retire') && A.lifeStage !== 'retired'; }, type: 'number', min: 50, max: 80,
      title: { new: 'At what age would you like to stop working?', basics: 'When would you like to retire?', confident: 'Target retirement age' } },
    { id: 'dependants', when: function () { return has('protect') || has('legacy') || has('family'); }, type: 'choice',
      title: 'Does anyone rely on your income?',
      options: [{ value: 'none', label: 'No' }, { value: 'partner', label: 'A partner' }, { value: 'children', label: 'Children' }, { value: 'both', label: 'Partner and children' }] },
    { id: 'cover', when: function () { return has('protect'); }, type: 'choice',
      title: { new: 'Do you have life insurance, or a work benefit that pays out if you die?', basics: 'Do you have life cover or death-in-service?', confident: 'Existing protection in place?' },
      options: [{ value: 'yes', label: 'Yes' }, { value: 'unsure', label: 'Not sure' }, { value: 'no', label: 'No' }] },
    { id: 'will', when: function () { return has('legacy') || has('protect') || (age() || 0) >= 50; }, type: 'choice',
      title: { new: 'Have you made a will?', basics: 'Do you have an up-to-date will?', confident: 'Will status' },
      options: [{ value: 'yes', label: 'Yes, and it\'s up to date' }, { value: 'old', label: 'Yes, but it\'s old' }, { value: 'no', label: 'No' }] },
    { id: 'family', when: function () { return has('family'); }, type: 'choice', title: 'Which fits best?',
      options: [{ value: 'expecting', label: 'We\'re expecting a baby' }, { value: 'planning', label: 'We\'re planning a family' }, { value: 'young', label: 'We have young children' }, { value: 'older', label: 'Our children are older' }] },
    { id: 'selfEmp', when: function () { return has('selfemp'); }, type: 'choice', title: 'What kind of income is it?',
      options: [{ value: 'sole', label: 'I work for myself full time' }, { value: 'side', label: 'Side income on top of a job' }, { value: 'landlord', label: 'Rent from a property' }] },
    { id: 'job', when: function () { return has('job'); }, type: 'choice', title: 'Where are you at?',
      options: [{ value: 'worried', label: 'Worried it might happen' }, { value: 'consult', label: 'My employer has started the process' }, { value: 'happened', label: 'It has happened' }] },
    { id: 'plan', type: 'plan', title: 'Your personal plan' }
  ];

  function activeSteps() { return STEPS.filter(function (s) { return !s.when || s.when(); }); }
  function saveDraft() { MP.set('tools.guide', { answers: A, step: stepIndex }); }

  function render() {
    MP.stopAudio();
    var steps = activeSteps();
    stepIndex = MP.clamp(stepIndex, 0, steps.length - 1);
    var s = steps[stepIndex];
    main.innerHTML = '';
    var wrap = el('div', { class: 'guide-wrap' });
    var pct = Math.round(stepIndex / (steps.length - 1) * 100);
    if (s.type !== 'plan') {
      wrap.appendChild(el('div', { class: 'guide-top' },
        el('span', { class: 'small muted', id: 'guide-progress-text' }, 'Question ' + (stepIndex + 1) + ' of ' + (steps.length - 1)),
        el('button', { class: 'btn btn-ghost btn-sm', type: 'button', id: 'guide-skip', onclick: skip }, prefs.onboarded ? 'Cancel' : 'Skip for now')));
      wrap.appendChild(el('div', { class: 'progress', role: 'progressbar', 'aria-label': 'Progress', 'aria-valuemin': 0, 'aria-valuemax': 100, 'aria-valuenow': pct }, el('span', { style: { width: pct + '%' } })));
    }
    var card = el('section', { class: 'card guide-card', 'aria-live': 'polite', dataset: { step: s.id } });
    card.appendChild(el('h1', { id: 'guide-q', tabindex: '-1' }, w(s.title)));
    var clip = MP.listen('guide-' + s.id, A.knowledge === 'new' || !A.knowledge ? 'Listen to this question' : 'Listen');
    if (clip) card.appendChild(el('p', { class: 'guide-listen' }, clip));
    var help = typeof s.help === 'function' ? s.help() : s.help;
    if (help) {
      var h = typeof help === 'string' ? help : help[A.knowledge || 'new'];
      if (h) card.appendChild(el('p', { class: 'muted' }, h));
    }
    var body = el('div', { class: 'guide-body' });
    var next = el('button', { class: 'btn btn-primary', type: 'button', id: 'guide-next' }, 'Next');
    var getValue = renderInput(s, body, next);
    card.appendChild(body);
    if (s.type !== 'plan') {
      card.appendChild(el('div', { class: 'row guide-nav' },
        stepIndex > 0 ? el('button', { class: 'btn', type: 'button', id: 'guide-back', onclick: function () { stepIndex--; saveDraft(); render(); } }, '← Back') : null,
        el('span', { class: 'mp-spacer' }), next));
      next.onclick = function () {
        var v = getValue();
        if (v === undefined) return;
        A[s.id] = v;
        if (s.id === 'about') Object.assign(A, v), delete A.about;
        stepIndex++; saveDraft(); render();
      };
    }
    wrap.appendChild(card);
    main.appendChild(wrap);
    var q = MP.$('#guide-q'); if (q) q.focus();
  }

  function renderInput(s, body, next) {
    if (s.type === 'choice') {
      var name = 'q-' + s.id, cur = A[s.id];
      var opts = s.options;
      if (s.id === 'lifeStage' && cur == null) cur = suggestStage();
      var fs = el('fieldset', { class: 'choices' }, el('legend', { class: 'visually-hidden' }, w(s.title)));
      opts.forEach(function (o) {
        var input = el('input', { type: 'radio', name: name, value: o.value, id: name + '-' + o.value, checked: String(cur) === o.value });
        input.onchange = function () { next.disabled = false; };
        input.ondblclick = function () { next.click(); };
        fs.appendChild(el('label', { class: 'choice', for: input.id }, input, el('span', null, el('strong', null, o.label), o.hint ? el('span', { class: 'small muted' }, o.hint) : null)));
      });
      body.appendChild(fs);
      next.disabled = cur == null;
      return function () { var c = MP.$('input[name="' + name + '"]:checked'); return c ? c.value : undefined; };
    }
    if (s.type === 'multi') {
      var sel = (A[s.id] || []).slice(), max = s.max();
      var grid = el('div', { class: 'choices-grid', role: 'group', 'aria-label': w(s.title) });
      var note = el('p', { class: 'small muted', 'aria-live': 'polite' });
      function sync() {
        MP.$$('button', grid).forEach(function (b) { b.setAttribute('aria-pressed', String(sel.indexOf(b.dataset.value) >= 0)); });
        next.disabled = !sel.length;
        note.textContent = sel.length ? sel.length + ' chosen' + (max < 12 ? ' (up to ' + max + ')' : '') : '';
      }
      s.options.forEach(function (o) {
        grid.appendChild(el('button', { type: 'button', class: 'choice-tile', dataset: { value: o.value }, 'aria-pressed': 'false', onclick: function () {
          var i = sel.indexOf(o.value);
          if (i >= 0) sel.splice(i, 1);
          else if (sel.length < max) sel.push(o.value);
          else { MP.toast('You can pick up to ' + max + '. Switch to "Show me every option" to choose more.'); return; }
          sync();
        } }, el('span', { class: 'ico', 'aria-hidden': 'true' }, o.icon), o.label));
      });
      if (max < 12 && sel.length > max) sel = sel.slice(0, max);
      body.appendChild(grid); body.appendChild(note); sync();
      return function () { return sel.length ? sel.slice() : undefined; };
    }
    if (s.type === 'money' || s.type === 'number') {
      var inp = s.type === 'money' ? MP.moneyInput({ id: 'guide-input', value: A[s.id] || '' }) : { input: el('input', { type: 'number', id: 'guide-input', inputmode: 'numeric', min: s.min, max: s.max, value: A[s.id] || (s.id === 'retireAge' ? Math.round(UK.statePensionAge(A.dob || '1985-01-01')) : '') }) };
      inp.wrap = inp.wrap || inp.input;
      body.appendChild(el('div', { class: 'field' }, el('label', { for: 'guide-input', class: 'visually-hidden' }, w(s.title)), inp.wrap,
        el('span', { class: 'hint' }, 'Not sure? Leave it blank and press Next.')));
      inp.input.addEventListener('keydown', function (e) { if (e.key === 'Enter') next.click(); });
      return function () {
        var v = inp.input.value.trim();
        if (v === '') return '';
        var n = MP.num(v);
        if (s.type === 'number' && (n < s.min || n > s.max)) { MP.toast('Please enter an age between ' + s.min + ' and ' + s.max + '.'); return undefined; }
        return Math.max(0, Math.min(n, 1e9));
      };
    }
    if (s.type === 'goal') {
      var g = A.saveGoal || {};
      var nm = el('input', { type: 'text', id: 'guide-goal-name', value: g.name || '', placeholder: 'e.g. Wedding, new car, trip to Japan', maxlength: 60 });
      var amt = MP.moneyInput({ id: 'guide-goal-amount', value: g.amount || '' });
      var yrs = el('select', { id: 'guide-goal-years' }, [['1', 'Within a year'], ['2', 'In 2 years'], ['3', 'In 3 years'], ['5', 'In 5 years'], ['10', 'In 10 years']].map(function (o) { return el('option', { value: o[0], selected: String(g.years || '2') === o[0] }, o[1]); }));
      body.appendChild(el('div', { class: 'grid-2' }, MP.field('What is it?', nm), MP.field('How much will it cost?', amt.wrap), MP.field('When?', yrs)));
      return function () { return { name: nm.value.trim(), amount: MP.num(amt.input.value), years: +yrs.value }; };
    }
    if (s.type === 'form') return aboutForm(body);
    if (s.type === 'plan') { renderPlan(body); return function () { }; }
  }

  function aboutForm(body) {
    var dob = el('input', { type: 'date', id: 'guide-dob', value: A.dob || '', max: MP.isoDate(new Date()) });
    var region = el('select', { id: 'guide-region' }, [['england', 'England'], ['wales', 'Wales'], ['scotland', 'Scotland'], ['ni', 'Northern Ireland']].map(function (r) { return el('option', { value: r[0], selected: A.region === r[0] }, r[1]); }));
    var sal = MP.moneyInput({ id: 'guide-salary', value: A.salary || '' });
    var emp = el('select', { id: 'guide-employment' }, [['employed', 'Employed'], ['self', 'Self-employed'], ['both', 'Employed with side income'], ['retired', 'Retired'], ['other', 'Not working / other']].map(function (r) { return el('option', { value: r[0], selected: A.employment === r[0] }, r[1]); }));
    var partner = MP.moneyInput({ id: 'guide-partner', value: A.partnerSalary || '' });
    var fields = [
      MP.field('Date of birth', dob, 'Used for pension and State Pension ages'),
      MP.field('Where do you live?', region, A.knowledge === 'new' ? 'Scotland has its own income tax rates' : null),
      MP.field(w({ new: 'How much do you earn in a year, before tax?', basics: 'Yearly income before tax', confident: 'Gross annual income' }), sal.wrap, A.knowledge === 'new' ? 'It\'s on your payslip or P60. Leave blank if you\'re not sure.' : null),
      MP.field('Work', emp)
    ];
    if (detailed()) fields.push(MP.field('Partner\'s yearly income (optional)', partner.wrap, 'For household plans like childcare and Child Benefit'));
    body.appendChild(el('div', { class: 'grid-2' }, fields));
    return function () {
      var v = { dob: dob.value, region: region.value, salary: MP.num(sal.input.value), employment: emp.value };
      if (detailed()) v.partnerSalary = MP.num(partner.input.value);
      return v;
    };
  }

  function suggestStage() {
    var a = age();
    if (a == null) return null;
    if (A.employment === 'retired' || a >= 68) return 'retired';
    if (a >= 55) return 'preretire';
    if (a >= 40) return 'midlife';
    if (a >= 28) return 'building';
    return 'starting';
  }

  /* ---------- the plan ---------- */
  var TOOL = {}; (window.MP_TOOLS || []).forEach(function (t) { TOOL[t.id] = t; });

  function buildPlan() {
    var out = [], seen = {};
    function add(tool, why, urgent) { if (!TOOL[tool] || seen[tool]) return; seen[tool] = 1; out.push({ tool: tool, why: why, urgent: !!urgent }); }
    var months = A.savingsMonths == null ? null : +A.savingsMonths, a = age();
    if (A.debtFeel === 'behind') add('debt', 'You said you are behind on some payments. List your debts here, and contact free debt advice today: they can often freeze interest and charges.', true);
    if (A.job === 'happened' || A.job === 'consult') add('redundancy', 'Check what redundancy pay you are owed and how long your money will last.', true);
    if (A.leftover === 'no') add('budget', 'You often run short. Your statements will show where the money goes, so you can find savings.', A.debtFeel === 'hard');
    add('health-check', 'A quick score across your whole financial life, with the next steps that matter most.');
    if (has('debt') && A.debtFeel !== 'behind') add('debt', A.debtFeel === 'hard' ? 'Get a clear payoff plan before things get harder.' : 'See how much interest and time you could save by paying in the right order.');
    if (months != null && months < 3) add('savings', 'Build an emergency fund of 3 to 6 months of bills, so a surprise does not become debt.');
    if (has('bills')) { add('budget', 'See where your money goes each month and spot subscriptions you could cancel.'); add('inbox', 'Pull bills, renewals and price rises out of your emails so nothing catches you out.'); }
    if (has('job')) add('redundancy', 'Know your redundancy rights and plan how long your savings would last.');
    if (has('protect') && A.cover !== 'yes' && A.dependants && A.dependants !== 'none') add('protection', 'People depend on your income. See how much cover would keep them secure.');
    if (has('home')) {
      add('debt', 'Check what you could borrow, the Stamp Duty and the monthly payments in "Buy a home".');
      if (A.homeFirst === 'yes' && a != null && a < 40) add('savings', 'You could use a Lifetime ISA: the government adds 25% towards your first home.');
      add('dreams', 'Your home deposit is set up as a dream with a monthly saving plan.');
    }
    if (has('save')) add('dreams', 'Your savings goal is set up with a monthly plan.');
    if (has('family')) add('family', 'Child Benefit, Tax-Free Childcare and parental pay, worked out for your household.');
    if (has('retire')) {
      add('retirement', A.pensionKnow === 'no' ? 'Find out what your pensions and State Pension could pay. Start by gathering your pension statements.' : 'See if you are on track for the retirement income you want.');
      if (a != null && a >= 50) add('retirement-income', 'Compare a guaranteed income (annuity) with keeping your pension invested (drawdown).');
      if (A.employment === 'employed' || A.employment === 'both') add('take-home', 'See how pension contributions and salary sacrifice change your take-home pay.');
    }
    if (has('invest')) add('investments', months != null && months < 3 ? 'Once your safety net is in place, see how investing could grow your money.' : 'See how regular investing could grow, after charges and inflation.');
    if (has('selfemp') || A.employment === 'self' || A.employment === 'both') add('self-employed', 'Work out your tax bill and how much to put aside each month.');
    if (has('legacy') || A.will === 'no') add('iht', A.will === 'no' ? 'You don\'t have a will yet. See how your estate would be passed on and taxed.' : 'Estimate inheritance tax and see what affects it.');
    if (A.knowledge === 'confident' || detailed()) add('networth', 'Track everything you own and owe in one number, month by month.');
    add('dreams', 'Put a price and a date on the things you want in life.');
    return out.slice(0, 7);
  }

  function applyAnswers(plan) {
    var v = MP.vault();
    var p = v.profile;
    if (A.dob) p.dob = A.dob;
    p.region = A.region || p.region;
    if (A.salary) p.salary = A.salary;
    p.employment = A.employment === 'both' ? 'employed' : (A.employment || p.employment);
    if (A.riskReaction) p.riskAttitude = A.riskReaction;
    if (A.retireAge) p.retireAge = A.retireAge;
    if (A.dependants) p.dependants = A.dependants === 'none' ? 0 : A.dependants === 'both' ? 2 : 1;
    if (A.partnerSalary) p.partnerSalary = A.partnerSalary;
    MP.set('profile', Object.assign({}, p, { prefs: v.profile.prefs }));

    // dreams created from answers (updated, never duplicated, on a re-run)
    var goals = MP.goals();
    function upsert(source, g) {
      var i = goals.findIndex(function (x) { return x.source === source; });
      if (i >= 0) goals[i] = Object.assign(goals[i], g); else goals.push(Object.assign({ id: MP.uid(), source: source, priority: 2, saved: 0 }, g));
    }
    function inYears(y) { var d = new Date(); d.setMonth(d.getMonth() + Math.round(y * 12)); return MP.isoDate(d); }
    var a = age();
    if (has('home') && A.homePrice > 0) {
      var deposit = Math.round(A.homePrice * (A.homeFirst === 'yes' ? 0.1 : 0.15));
      upsert('guide-home', { name: A.homeFirst === 'yes' ? 'First home deposit' : 'Home deposit', icon: '🏡', target: deposit, saved: Math.min(A.homeDeposit || 0, deposit), date: inYears(+A.homeWhen || 3), priority: 1,
        home: A.homeFirst === 'yes' && a != null && a < 40 ? 'lisa' : 'easy', note: 'A ' + (A.homeFirst === 'yes' ? '10%' : '15%') + ' deposit on ' + MP.money(A.homePrice) + '. A bigger deposit usually gets a better mortgage rate.' });
    }
    if (has('save') && A.saveGoal && A.saveGoal.name && A.saveGoal.amount > 0) {
      upsert('guide-save', { name: A.saveGoal.name, icon: '🎯', target: A.saveGoal.amount, date: inYears(A.saveGoal.years || 2), home: (A.saveGoal.years || 2) >= 5 ? 'ssisa' : 'easy' });
    }
    if (A.savingsMonths != null && +A.savingsMonths < 3 && A.essentialCosts > 0) {
      upsert('guide-emergency', { name: 'Emergency fund', icon: '🛟', target: A.essentialCosts * 3, saved: Math.round(A.essentialCosts * +A.savingsMonths), date: inYears(1), priority: 1, home: 'easy', note: 'Three months of essential bills.' });
    }
    goals.forEach(function (g) {
      if (!/^guide-/.test(g.source || '')) return;
      var yrs = Math.max(0.1, (new Date(g.date) - new Date()) / (365.25 * 864e5));
      g.monthlyNeeded = Math.round(UK.monthlyNeeded(g.target * Math.pow(1 + UK.R.inflation, yrs), +g.saved || 0, yrs, g.home === 'ssisa' ? 0.05 : 0.035) / (g.home === 'lisa' ? 1.25 : 1));
    });
    MP.saveGoals(goals);

    MP.setPrefs({ knowledge: A.knowledge, detail: A.detail, advice: A.advice, lifeStage: A.lifeStage, priorities: A.priorities || [], answers: A, plan: plan, onboarded: true, completedAt: Date.now() });
    MP.set('tools.guide', undefined);
    MP.summary('guide', 'Personal plan: ' + plan.length + ' steps');
    MP.log('Completed the guided setup');
  }

  function renderPlan(body) {
    var plan = buildPlan();
    applyAnswers(plan);
    var urgent = plan.filter(function (p) { return p.urgent; });
    body.appendChild(el('p', { class: 'lead' }, w({ new: 'Here is where to start. Take it one step at a time: there is no rush.', basics: 'Based on your answers, here is the order we suggest.', confident: 'Suggested order, based on your answers.' })));
    if (A.debtFeel === 'behind' || A.leftover === 'no' && A.debtFeel === 'hard') body.appendChild(MP.adviceCard('debt'));
    var ol = el('ol', { class: 'plan-list', id: 'plan-list' });
    plan.forEach(function (p, i) {
      var t = TOOL[p.tool];
      ol.appendChild(el('li', { class: 'plan-item' + (p.urgent ? ' urgent' : ''), dataset: { tool: p.tool } },
        el('span', { class: 'plan-num', 'aria-hidden': 'true' }, String(i + 1)),
        el('div', null, el('a', { href: 'apps/' + p.tool + '/index.html', class: 'plan-link' }, t.icon + ' ' + t.title), p.urgent ? el('span', { class: 'chip danger', style: { marginInlineStart: '8px' } }, 'Do this first') : null,
          el('p', { class: 'small muted' }, p.why))));
    });
    body.appendChild(ol);
    var made = MP.goals().filter(function (g) { return /^guide-/.test(g.source || ''); });
    if (made.length) body.appendChild(el('p', { class: 'callout success small' }, 'We added ' + made.map(function (g) { return '"' + g.name + '"'; }).join(' and ') + ' to your Dreams & goals.'));
    body.appendChild(el('h2', null, 'How the planner will work for you'));
    body.appendChild(el('ul', { class: 'small' },
      el('li', null, A.detail === 'detailed' ? 'Tools will show every option. Switch to Simple at the top of any tool for just the essentials.' : 'Tools will show just the essentials. Switch to Detailed at the top of any tool for more options.'),
      el('li', null, A.knowledge === 'new' ? 'We\'ll explain money words as we go (look for 💡 and dotted underlines).' : A.knowledge === 'basics' ? 'Tap any dotted-underlined word for a quick explanation.' : 'We\'ll keep explanations out of your way. Dotted-underlined words still have definitions.'),
      el('li', null, A.advice === 'yes' ? 'Where a decision is big, we\'ll show how to find a regulated adviser.' : A.advice === 'maybe' ? 'We\'ll mention advice for the big decisions only.' : 'We\'ll point you to free, impartial guidance.')));
    body.appendChild(el('h2', null, A.advice === 'yes' ? 'Finding an adviser' : 'Help if you want it'));
    body.appendChild(MP.adviceCard('general'));
    if (A.advice === 'yes') body.appendChild(el('p', { class: 'small muted' }, 'Tip: before your meeting, print ', el('a', { href: 'report.html' }, 'your money plan'), ' so the adviser can see your figures.'));
    body.appendChild(el('div', { class: 'row', style: { marginTop: '16px' } },
      el('a', { class: 'btn btn-primary', href: 'home.html', id: 'guide-done' }, 'Go to my dashboard'),
      plan[0] ? el('a', { class: 'btn btn-accent', href: 'apps/' + plan[0].tool + '/index.html', id: 'guide-first' }, 'Start step 1 →') : null,
      el('button', { class: 'btn btn-ghost', type: 'button', id: 'guide-redo', onclick: function () { stepIndex = 0; render(); } }, 'Change my answers')));
    if (urgent.length) MP.toast('Step 1 is urgent: please look at it today.');
  }

  function skip() {
    if (!prefs.onboarded) MP.setPrefs({ onboarded: false, skipped: true });
    location.href = 'home.html';
  }

  render();
});
