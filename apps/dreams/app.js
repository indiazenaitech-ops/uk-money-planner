/* Dreams & goals: turn aspirations into costed goals with a monthly plan.
   Goals are stored in the shared vault (MP.goals) so other tools can link to them. */
MP.page({ id: 'dreams', title: 'Dreams & goals' }).then(function () {
  'use strict';
  var el = MP.el, main = MP.$('#app');

  var TEMPLATES = [
    { key: 'emergency', icon: '🛟', name: 'Emergency fund', target: 6000, years: 1, priority: 1, home: 'easy', note: 'Aim for 3 to 6 months of essential spending in an easy-access account.' },
    { key: 'home', icon: '🏡', name: 'First home deposit', target: 25000, years: 4, priority: 1, home: 'lisa', note: 'Under 40? A Lifetime ISA adds a 25% government bonus for a first home up to £450,000.' },
    { key: 'wedding', icon: '💍', name: 'Wedding', target: 18000, years: 2, priority: 2, home: 'easy', note: 'Average UK weddings cost around £18,000 to £20,000. Decide what matters most to you.' },
    { key: 'holiday', icon: '✈️', name: 'Dream holiday', target: 5000, years: 1.5, priority: 3, home: 'easy', note: 'Saving first rather than borrowing means no interest on your memories.' },
    { key: 'car', icon: '🚗', name: 'New car', target: 12000, years: 3, priority: 2, home: 'easy', note: 'Compare the total cost of finance (PCP, HP) with saving and buying outright.' },
    { key: 'uni', icon: '🎓', name: "Child's future", target: 20000, years: 15, priority: 2, home: 'jisa', note: 'A Junior ISA lets you save up to £9,000 a year tax-free for a child until they are 18.' },
    { key: 'retire', icon: '🏖️', name: 'Retire early', target: 150000, years: 20, priority: 2, home: 'pension', note: 'Pension contributions get tax relief, and many employers add more. Use the Retirement planner too.' },
    { key: 'business', icon: '🚀', name: 'Start a business', target: 15000, years: 3, priority: 3, home: 'easy', note: 'Keep a separate pot so your personal emergency fund stays untouched.' },
    { key: 'renovation', icon: '🔨', name: 'Home improvements', target: 10000, years: 2, priority: 3, home: 'easy', note: 'Get three quotes and add 10 to 20% for surprises.' },
    { key: 'debt', icon: '🧹', name: 'Be debt-free', target: 5000, years: 2, priority: 1, home: 'debt', note: 'Clearing high-interest debt is often the best "return" you can get. See Mortgage & debt.' }
  ];
  var HOMES = {
    easy: { label: 'Easy-access savings or cash ISA', rate: 0.035 },
    lisa: { label: 'Lifetime ISA (first home)', rate: 0.035 },
    jisa: { label: 'Junior ISA (stocks and shares)', rate: 0.05 },
    ssisa: { label: 'Stocks and shares ISA', rate: 0.05 },
    pension: { label: 'Pension', rate: 0.05 },
    debt: { label: 'Paying off debt', rate: 0 },
    other: { label: 'Other', rate: 0.03 }
  };
  var PRIORITY = { 1: 'Must have', 2: 'Should have', 3: 'Nice to have' };
  var ICONS = ['🎯', '🏡', '💍', '✈️', '🚗', '🎓', '🏖️', '🚀', '🔨', '🛟', '🧹', '👶', '🐶', '🎸', '💻', '🌍', '❤️', '🎁'];

  var settings = MP.get('tools.dreams', { spare: 400, inflate: true, filter: 'all' });

  /* Simple view always allows for rising prices; only Detailed lets the customer turn it off. */
  function inflating() { return settings.inflate || !MP.isDetailed(); }
  function yearsUntil(date) { var d = new Date(date); return isNaN(d) ? 0 : Math.max(0, (d - new Date()) / (365.25 * 864e5)); }
  function addYears(y) { var d = new Date(); d.setMonth(d.getMonth() + Math.round(y * 12)); return MP.isoDate(d); }

  /* Work out the plan for one goal. */
  function plan(g) {
    var years = yearsUntil(g.date), home = HOMES[g.home] || HOMES.other;
    var rate = g.rate != null && g.rate !== '' ? +g.rate : home.rate;
    var target = +g.target || 0;
    var future = inflating() ? target * Math.pow(1 + UK.R.inflation, years) : target;
    var saved = +g.saved || 0;
    var monthly;
    if (g.home === 'lisa') {
      // the 25% bonus is paid on contributions (up to £4,000 a year), so you pay in 80% of each pound
      var m = UK.monthlyNeeded(future, saved, years, rate) / (1 + UK.R.isa.lifetimeBonus);
      monthly = Math.min(m, UK.R.isa.lifetime / 12) + Math.max(0, m - UK.R.isa.lifetime / 12) * (1 + UK.R.isa.lifetimeBonus);
    } else {
      monthly = UK.monthlyNeeded(future, saved, years, rate);
    }
    var done = saved >= future && future > 0;
    return { years: years, rate: rate, future: future, monthly: done ? 0 : monthly, progress: future ? MP.clamp(saved / future, 0, 1) : 0, done: done, overdue: years <= 0 && !done };
  }

  function render() {
    var goals = MP.goals();
    main.innerHTML = '';
    main.appendChild(el('div', { class: 'row', style: { justifyContent: 'space-between', margin: '6px 0 14px' } },
      el('div', null, el('h1', { style: { margin: 0 } }, 'Dreams & goals'),
        el('p', { class: 'muted', style: { margin: 0 } }, 'Put a price and a date on what you want in life, and see what to put aside each month.')),
      el('button', { class: 'btn btn-primary', type: 'button', id: 'new-goal', onclick: function () { editGoal(null); } }, '＋ New dream')));

    var split = el('div', { class: 'split' });
    split.appendChild(sidebar(goals));
    var right = el('div', { class: 'stack' });
    right.appendChild(goalsList(goals));
    if (goals.length) right.appendChild(timeline(goals));
    right.appendChild(howTo());
    right.appendChild(MP.adviceCard('general'));
    split.appendChild(right);
    main.appendChild(split);
    saveSummary(goals);
  }

  function sidebar(goals) {
    var spare = MP.moneyInput({ id: 'spare', value: settings.spare });
    spare.input.addEventListener('change', function () { settings.spare = MP.num(spare.input.value); save(); render(); });
    var inflate = el('input', { type: 'checkbox', id: 'inflate', checked: settings.inflate });
    inflate.onchange = function () { settings.inflate = inflate.checked; save(); render(); };

    var need = 0, funded = [], left = settings.spare;
    goals.slice().sort(function (a, b) { return (a.priority || 2) - (b.priority || 2) || yearsUntil(a.date) - yearsUntil(b.date); }).forEach(function (g) {
      var p = plan(g); need += p.monthly;
      var give = Math.min(left, p.monthly); left -= give;
      funded.push({ g: g, p: p, give: give });
    });
    var gap = need - settings.spare;
    var box = el('section', { class: 'card', 'aria-labelledby': 'h-afford' },
      el('h2', { id: 'h-afford' }, 'Can I afford it all?'),
      MP.field('How much can you put aside each month?', spare.wrap, 'After bills and everyday spending. The Budget tool can help you find this.'),
      el('label', { class: 'check detail-only' }, inflate, 'Allow for rising prices (' + MP.pct(UK.R.inflation) + ' a year)'),
      inflating() ? el('p', { class: 'small muted simple-only', style: { margin: 0 } }, 'Targets include rising prices of ' + MP.pct(UK.R.inflation) + ' a year.') : null,
      MP.explain(null, 'Prices usually rise each year (this is called inflation). A holiday that costs £5,000 today might cost about £5,650 in 5 years, so we save towards the future price.'),
      el('hr'),
      el('div', { class: 'stat' }, el('span', { class: 'label' }, 'All your dreams need each month'), el('span', { class: 'value', id: 'total-monthly' }, MP.money(need))),
      el('div', { 'aria-live': 'polite', id: 'afford-result', style: { marginTop: '12px' } },
        !goals.length ? el('p', { class: 'muted' }, 'Add a dream to see your plan.') :
          gap <= 0.5 ? el('p', { class: 'callout success' }, 'You can fund every dream on time and still have ' + MP.money(-gap) + ' a month spare.') :
            el('div', { class: 'callout warning' },
              el('p', null, 'You are ' + MP.money(gap) + ' a month short. Your most important dreams are funded first:'),
              el('ul', { class: 'small', style: { margin: 0, paddingInlineStart: '18px' } }, funded.filter(function (f) { return !f.p.done; }).map(function (f) {
                var pc = f.p.monthly ? f.give / f.p.monthly : 1;
                return el('li', null, f.g.name + ': ' + (pc >= 0.999 ? 'fully funded' : pc <= 0 ? 'not funded yet' : Math.round(pc * 100) + '% funded'));
              })),
              el('p', { class: 'small', style: { marginTop: '8px' } }, 'Ideas: push a "nice to have" date back a year, lower a target, or look for savings in the Budget tool.'))));
    return box;
  }

  function goalsList(goals) {
    var sec = el('section', { 'aria-labelledby': 'h-list' }, el('h2', { id: 'h-list', class: 'visually-hidden' }, 'Your dreams'));
    if (!goals.length) {
      sec.appendChild(el('div', { class: 'card' }, el('h2', null, 'Start with an idea'),
        el('p', { class: 'muted' }, 'Pick one to get going. You can change the amount and date.'),
        MP.explain(null, 'Not sure where to start? Most people begin with an emergency fund: 3 to 6 months of essential bills in an easy-access account, for surprises such as a broken boiler or losing your job.'),
        el('div', { class: 'template-grid' }, TEMPLATES.map(function (t) {
          return el('button', { class: 'btn template', type: 'button', dataset: { template: t.key }, onclick: function () { editGoal(null, t); } }, el('span', { 'aria-hidden': 'true' }, t.icon), t.name);
        }))));
      return sec;
    }
    var list = el('div', { class: 'goal-grid', id: 'goal-list' });
    goals.slice().sort(function (a, b) { return (a.priority || 2) - (b.priority || 2) || yearsUntil(a.date) - yearsUntil(b.date); }).forEach(function (g) {
      var p = plan(g);
      var status = p.done ? el('span', { class: 'chip success' }, 'Reached 🎉') : p.overdue ? el('span', { class: 'chip danger' }, 'Date passed') :
        (+g.monthly || 0) >= p.monthly - 0.5 ? el('span', { class: 'chip success' }, 'On track') :
          (+g.monthly || 0) > 0 ? el('span', { class: 'chip warning' }, 'Behind') : el('span', { class: 'chip' }, PRIORITY[g.priority || 2]);
      list.appendChild(el('article', { class: 'card goal', dataset: { id: g.id } },
        el('div', { class: 'goal-head' }, el('span', { class: 'goal-ico', 'aria-hidden': 'true' }, g.icon || '🎯'),
          el('div', { style: { minWidth: 0 } }, el('h3', null, g.name), el('div', { class: 'small muted' }, 'by ' + MP.fmtDate(g.date), el('span', { class: 'detail-only' }, ' · ' + (HOMES[g.home] || HOMES.other).label)),
            /^guide-/.test(g.source || '') ? el('div', { class: 'tiny guide-note' }, '✨ Added by your guided setup') : null), status),
        el('div', { class: 'progress', role: 'progressbar', 'aria-label': g.name + ' progress', 'aria-valuemin': 0, 'aria-valuemax': 100, 'aria-valuenow': Math.round(p.progress * 100) }, el('span', { style: { width: p.progress * 100 + '%' } })),
        el('div', { class: 'goal-nums' },
          el('div', { class: 'stat' }, el('span', { class: 'label' }, 'Saved'), el('span', { class: 'value goal-saved' }, MP.money(g.saved || 0))),
          el('div', { class: 'stat' }, el('span', { class: 'label' }, inflating() && p.years > 0.5 ? 'Target (with rising prices)' : 'Target'), el('span', { class: 'value' }, MP.money(p.future))),
          el('div', { class: 'stat' }, el('span', { class: 'label' }, 'Put aside monthly'), el('span', { class: 'value goal-monthly' }, MP.money(p.monthly)))),
        g.note ? el('p', { class: 'small muted', style: { margin: '10px 0 0' } }, g.note) : null,
        el('div', { class: 'row', style: { marginTop: '12px' } },
          el('button', { class: 'btn btn-sm btn-accent add-money', type: 'button', onclick: function () { addMoney(g); } }, '＋ Add money'),
          el('button', { class: 'btn btn-sm edit-goal', type: 'button', onclick: function () { editGoal(g); } }, 'Edit'),
          el('button', { class: 'btn btn-sm btn-ghost delete-goal', type: 'button', 'aria-label': 'Delete ' + g.name, onclick: function () {
            if (!MP.confirm('Delete "' + g.name + '"?')) return;
            MP.saveGoals(MP.goals().filter(function (x) { return x.id !== g.id; })); MP.log('Deleted the dream "' + g.name + '"'); render();
          } }, 'Delete'))));
    });
    sec.appendChild(list);
    return sec;
  }

  function timeline(goals) {
    var sorted = goals.slice().sort(function (a, b) { return new Date(a.date) - new Date(b.date); });
    return el('section', { class: 'card detail-only', 'aria-labelledby': 'h-time' }, el('h2', { id: 'h-time' }, 'Your timeline'),
      el('ol', { class: 'timeline' }, sorted.map(function (g) {
        var p = plan(g);
        return el('li', null, el('span', { class: 'when' }, new Date(g.date).getFullYear() || '—'),
          el('span', null, (g.icon || '🎯') + ' ' + g.name + ' · ' + MP.money(p.future) + (p.done ? ' ✓' : '')));
      })));
  }

  function howTo() {
    return el('details', { class: 'card' }, el('summary', null, 'How to use this, and tips'),
      el('ul', { class: 'small' },
        el('li', null, 'Add each dream with a price in today\'s money and a date. We add rising prices for you, so the monthly figure stays realistic.'),
        el('li', null, 'Set a priority. "Must have" dreams, like an emergency fund, are funded first when money is tight.'),
        el('li', null, 'Put money for goals under 5 years away in cash savings. Money for longer goals may grow more if invested, but can fall in value too.'),
        el('li', null, 'Use your tax-free ', MP.term('isa', 'ISA'), ' allowance (' + MP.money(UK.R.isa.annual) + ' a year). Savings at UK banks are protected by the ', MP.term('fscs', 'FSCS'), ' up to £120,000 per person, per banking licence.'),
        el('li', null, 'Press "Add money" every time you save towards a dream. Seeing the bar fill up keeps you going.'),
        el('li', null, 'Try this with your family: each person names one dream, then agree together on the order to fund them.')));
  }

  function editGoal(g, tpl) {
    var isNew = !g;
    g = g ? Object.assign({}, g) : { id: MP.uid(), name: tpl ? tpl.name : '', icon: tpl ? tpl.icon : '🎯', target: tpl ? tpl.target : '', saved: 0, date: addYears(tpl ? tpl.years : 2), priority: tpl ? tpl.priority : 2, home: tpl ? tpl.home : 'easy', monthly: '', note: tpl ? tpl.note : '' };
    var name = el('input', { type: 'text', id: 'g-name', value: g.name, required: true, maxlength: 60 });
    var target = MP.moneyInput({ id: 'g-target', value: g.target });
    var saved = MP.moneyInput({ id: 'g-saved', value: g.saved || '' });
    var monthly = MP.moneyInput({ id: 'g-monthly', value: g.monthly || '' });
    var date = el('input', { type: 'date', id: 'g-date', value: g.date, min: MP.isoDate(new Date()) });
    var pri = el('select', { id: 'g-priority' }, [1, 2, 3].map(function (k) { return el('option', { value: k, selected: +g.priority === k }, PRIORITY[k]); }));
    var home = el('select', { id: 'g-home' }, Object.keys(HOMES).map(function (k) { return el('option', { value: k, selected: g.home === k }, HOMES[k].label); }));
    var rate = el('input', { type: 'number', id: 'g-rate', step: '0.1', min: '0', max: '15', value: g.rate != null && g.rate !== '' ? (g.rate * 100).toFixed(1) : '', placeholder: ((HOMES[g.home] || HOMES.other).rate * 100).toFixed(1) });
    home.onchange = function () { rate.placeholder = (HOMES[home.value].rate * 100).toFixed(1); };
    var icon = g.icon;
    var icons = el('div', { class: 'icon-pick', role: 'radiogroup', 'aria-label': 'Icon' }, ICONS.map(function (i) {
      return el('button', { type: 'button', role: 'radio', 'aria-checked': String(i === icon), 'aria-label': 'Icon ' + i, onclick: function (e) {
        icon = i; MP.$$('button', icons).forEach(function (b) { b.setAttribute('aria-checked', String(b === e.currentTarget)); });
      } }, i);
    }));
    var err = el('p', { class: 'callout danger', hidden: true, role: 'alert' });
    var form = el('form', { id: 'goal-form', novalidate: true },
      MP.field('What is your dream?', name), el('div', { class: 'field' }, el('span', { class: 'label' }, 'Icon'), icons),
      el('div', { class: 'grid-2' },
        MP.field('Cost in today\'s money', target.wrap), MP.field('Saved so far', saved.wrap),
        MP.field('When do you want it?', date), MP.field('Priority', pri),
        detailOnly(MP.field('Where will you save?', home)), detailOnly(MP.field('Expected yearly growth (%)', rate, 'Leave blank for our assumption'))),
      el('div', { class: 'detail-only' },
        MP.explain(null, 'Money can grow while you save. Interest is added to your savings, then next time you earn interest on that interest too (compound interest). Cash savings grow slowly but safely; investments may grow more over 5+ years, but can fall.'),
        MP.field('You plan to put aside each month (optional)', monthly.wrap, 'We compare this with what you need, to show if you are on track.')),
      el('div', { class: 'simple-only' }, MP.explain(null, '"Must have" dreams are funded first when money is tight. Switch to Detailed view to choose where you will save and the growth rate.')),
      err, el('button', { class: 'btn btn-primary', type: 'submit', id: 'g-save' }, isNew ? 'Add dream' : 'Save changes'));
    var close = MP.modal(form, { title: isNew ? 'New dream' : 'Edit dream' });
    form.addEventListener('submit', function (e) {
      e.preventDefault();
      var t = MP.num(target.input.value);
      if (!name.value.trim()) { err.textContent = 'Please give your dream a name.'; err.hidden = false; return; }
      if (!(t > 0) || t > 1e9) { err.textContent = 'Please enter a cost between £1 and £1,000,000,000.'; err.hidden = false; return; }
      if (!date.value || isNaN(new Date(date.value))) { err.textContent = 'Please choose a date.'; err.hidden = false; return; }
      Object.assign(g, { name: name.value.trim(), icon: icon, target: t, saved: Math.max(0, MP.num(saved.input.value)), date: date.value, priority: +pri.value, home: home.value,
        rate: rate.value === '' ? null : MP.clamp(MP.num(rate.value), 0, 15) / 100, monthly: MP.num(monthly.input.value) || '' });
      g.monthlyNeeded = Math.round(plan(g).monthly);
      var list = MP.goals();
      var i = list.findIndex(function (x) { return x.id === g.id; });
      if (i >= 0) list[i] = g; else list.push(g);
      MP.saveGoals(list);
      MP.log((isNew ? 'Added' : 'Updated') + ' the dream "' + g.name + '"');
      close(); render();
      MP.toast(isNew ? 'Dream added.' : 'Saved.');
    });
  }

  function addMoney(g) {
    var amt = MP.moneyInput({ id: 'add-amount', step: '0.01' });
    var form = el('form', null, MP.field('How much did you put aside?', amt.wrap, 'Use a minus number to take money out.'), el('button', { class: 'btn btn-primary', type: 'submit', id: 'add-save' }, 'Add'));
    amt.input.removeAttribute('min');
    var close = MP.modal(form, { title: (g.icon || '🎯') + ' ' + g.name });
    form.addEventListener('submit', function (e) {
      e.preventDefault();
      var a = MP.num(amt.input.value);
      if (!a) return;
      var list = MP.goals(), x = list.find(function (y) { return y.id === g.id; });
      if (!x) return close();
      x.saved = Math.max(0, (+x.saved || 0) + a);
      x.monthlyNeeded = Math.round(plan(x).monthly);
      MP.saveGoals(list);
      MP.log('Added ' + MP.money(a, true) + ' to "' + x.name + '"');
      close(); render();
      if (plan(x).done) MP.toast('🎉 You reached "' + x.name + '"!'); else MP.toast('Added ' + MP.money(a, true) + '.');
    });
  }

  function detailOnly(node) { node.classList.add('detail-only'); return node; }
  function save() { MP.set('tools.dreams', settings); }
  function saveSummary(goals) {
    if (!goals.length) { MP.set('summaries.dreams', undefined); return; }
    var need = goals.reduce(function (a, g) { return a + plan(g).monthly; }, 0);
    MP.summary('dreams', goals.length + (goals.length === 1 ? ' dream' : ' dreams') + ', ' + MP.money(need) + '/month needed');
  }

  // Simple/Detailed is CSS-driven; re-render so the advice card follows the customer's latest preferences.
  MP.onPrefs(function () { render(); });
  render();
});
