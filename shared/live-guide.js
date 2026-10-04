/* Live guide: an optional ElevenLabs voice/chat agent that walks the customer through the planner.
   - Off until the customer agrees. What they say is sent to ElevenLabs; their saved plan is shared only
     if they tick "Let the guide see my plan".
   - Tools the guide opens load in a panel (iframe) over the current page, so the conversation keeps going.
   - Client tools: open_tool, set_view, show_term, get_my_plan, read_screen (configured on the agent). */
(function () {
  'use strict';
  if (!window.MP || window.top !== window) return;
  var CFG = (MP.config && MP.config.liveGuide) || {};
  if (!CFG.agentId) return;
  var el = MP.el, root = MP.root();
  var PAGES = { guide: 'guide.html', home: 'home.html', report: 'report.html' };
  var panel = null, frame = null, widget = null, launcher = null;

  function gp() { return MP.prefs().liveGuide || {}; }
  function setGp(patch) { return MP.refresh().then(function () { MP.setPrefs({ liveGuide: Object.assign({}, gp(), patch) }); }); }
  function pageId() {
    var m = location.pathname.match(/\/apps\/([a-z-]+)\/(index\.html)?$/);
    if (frame && panel && !panel.hidden) { var f = (frame.getAttribute('src') || '').match(/(?:^|\/)apps\/([a-z-]+)\/index\.html$|([a-z]+)\.html$/); if (f) return f[1] || f[2]; }
    return m ? m[1] : (location.pathname.split('/').pop() || 'home.html').replace('.html', '');
  }

  /* ---------- launcher + consent ---------- */
  function drawLauncher() {
    launcher = el('button', { type: 'button', class: 'lg-launcher', id: 'lg-launcher', 'aria-haspopup': 'dialog' });
    updateLauncher();
    launcher.onclick = function () { if (widget) settings(); else consent(); };
    document.body.appendChild(launcher);
  }
  function updateLauncher() {
    if (!launcher) return;
    launcher.textContent = widget ? '⚙️ Guide settings' : '🎧 Talk to your guide';
    launcher.classList.toggle('lg-small', !!widget);
  }

  function consent() {
    var share = el('input', { type: 'checkbox', id: 'lg-share', checked: !!gp().sharePlan });
    var body = el('div', { class: 'lg-consent' },
      el('p', null, 'Your guide can talk you through the planner like a person on the phone: explain money words, open the right tools, and, if you ask, choose answers, press Next and fill in boxes for you. Speak or type: it\'s up to you.'),
      el('ul', { class: 'small' },
        el('li', null, 'The guide is an AI assistant run by ElevenLabs. What you say or type is sent to them to run the conversation. Transcripts are kept for 30 days; voice recordings are not kept.'),
        el('li', null, 'It gives general guidance, not personal financial advice.'),
        el('li', null, 'Anything it presses or fills in flashes on screen, and you can change it. It can never sign out, delete or reset anything.'),
        el('li', null, 'Never share passwords, PINs, card or account numbers.')),
      el('label', { class: 'check' }, share, el('span', null, el('strong', null, 'Let the guide see my plan'), el('span', { class: 'small muted', style: { display: 'block' } }, 'Your priorities, dreams and saved results, so it can talk about your situation. You can change this any time.'))),
      el('div', { class: 'row', style: { marginTop: '12px' } },
        el('button', { class: 'btn btn-primary', type: 'button', id: 'lg-start', onclick: function () {
          setGp({ consent: true, sharePlan: share.checked, at: Date.now() }).then(function () { close(); mount(); });
        } }, 'Start the guide'),
        el('button', { class: 'btn btn-ghost', type: 'button', onclick: function () { close(); } }, 'Not now')));
    var close = MP.modal(body, { title: 'Talk to your guide' });
  }

  function settings() {
    var share = el('input', { type: 'checkbox', id: 'lg-share-set', checked: !!gp().sharePlan });
    share.onchange = function () { setGp({ sharePlan: share.checked }).then(function () { updateVars(); MP.toast(share.checked ? 'The guide can now see your plan.' : 'The guide can no longer see your plan.'); }); };
    var close = MP.modal(el('div', null,
      el('label', { class: 'check' }, share, 'Let the guide see my plan'),
      el('p', { class: 'small muted' }, 'This only affects new questions you ask. Your plan itself always stays encrypted on this device.'),
      el('div', { class: 'row' },
        el('button', { class: 'btn btn-danger btn-sm', type: 'button', id: 'lg-stop', onclick: function () {
          setGp({ consent: false }).then(function () { if (widget) { widget.remove(); widget = null; } updateLauncher(); close(); MP.toast('The guide is switched off.'); });
        } }, 'Switch the guide off'))), { title: 'Guide settings' });
  }

  /* ---------- the ElevenLabs widget ---------- */
  function vars() {
    var p = MP.prefs(), prof = MP.profile(), share = !!gp().sharePlan;
    var first = share && prof.name ? ', ' + String(prof.name).split(' ')[0] : '';
    return { greeting_name: first, knowledge: p.knowledge || 'new', detail: p.detail || 'simple', advice: p.advice || 'maybe', current_page: pageId(), plan_shared: share ? 'yes' : 'no' };
  }
  function updateVars() { if (widget) widget.setAttribute('dynamic-variables', JSON.stringify(vars())); }

  function mount() {
    if (widget) return;
    widget = document.createElement('elevenlabs-convai');
    widget.setAttribute('agent-id', CFG.agentId);
    widget.setAttribute('dynamic-variables', JSON.stringify(vars()));
    widget.addEventListener('elevenlabs-convai:call', function (e) {
      e.detail.config.clientTools = TOOLS;
    });
    document.body.appendChild(widget);
    updateLauncher();
    if (!customElements.get('elevenlabs-convai')) {
      var s = el('script', { src: CFG.widgetScript, async: true, type: 'text/javascript' });
      s.onerror = unavailable;
      document.head.appendChild(s);
      setTimeout(function () { if (!customElements.get('elevenlabs-convai')) unavailable(); }, 10000);
    }
  }
  function unavailable() {
    if (widget) { widget.remove(); widget = null; }
    updateLauncher();
    MP.modal(el('div', null,
      el('p', null, 'The live guide couldn\'t start here. It needs an internet connection, and some previews and corporate networks block it.'),
      el('p', { class: 'small muted' }, 'Everything else in Money Planner works as normal. Try again later, or from your bank\'s website or app.')), { title: 'Guide unavailable' });
  }

  /* ---------- tool panel ---------- */
  function openPanel(url, title) {
    if (!panel) {
      frame = el('iframe', { class: 'lg-frame', title: 'Tool', id: 'lg-frame' });
      panel = el('div', { class: 'lg-panel', id: 'lg-panel', role: 'region', 'aria-label': 'Tool opened by your guide' },
        el('div', { class: 'lg-panel-head' }, el('strong', { id: 'lg-panel-title' }, ''), el('span', { class: 'mp-spacer' }),
          el('a', { class: 'btn btn-sm', id: 'lg-panel-full', target: '_top' }, 'Open full page'),
          el('button', { class: 'btn btn-sm', type: 'button', id: 'lg-panel-close', onclick: closePanel }, 'Close ✕')),
        frame);
      document.body.appendChild(panel);
    }
    MP.$('#lg-panel-title').textContent = title;
    MP.$('#lg-panel-full').href = url;
    frame.src = url;
    panel.hidden = false;
    document.documentElement.classList.add('lg-panel-open');
    updateVars();
  }
  function closePanel() {
    if (!panel) return;
    panel.hidden = true; frame.src = 'about:blank';
    document.documentElement.classList.remove('lg-panel-open');
    // the panel may have saved new data: pick it up without reloading (that would end the conversation)
    MP.refresh().then(function () { updateVars(); if (location.pathname.match(/home\.html$/)) MP.toast('Back on your dashboard. Reload to see any changes.'); });
  }
  function panelOpen() { return !!(panel && !panel.hidden && frame.contentWindow); }
  /* Ask the page in the panel for its screen text (postMessage works even across file:// origins). */
  function askFrame(msg, timeout) {
    return new Promise(function (resolve) {
      if (!panelOpen()) return resolve(null);
      var id = MP.uid(), done = false;
      function onMsg(e) { if (e.source === frame.contentWindow && e.data && e.data.mp === 'screen' && e.data.id === id) { done = true; window.removeEventListener('message', onMsg); resolve(e.data.text); } }
      window.addEventListener('message', onMsg);
      frame.contentWindow.postMessage(Object.assign({ id: id }, msg), '*');
      setTimeout(function () { if (!done) { window.removeEventListener('message', onMsg); resolve(null); } }, timeout || 3000);
    });
  }

  /* ---------- client tools ---------- */
  function findTerm(q) {
    var g = window.MP_GLOSSARY || {}, s = String(q || '').toLowerCase().trim();
    if (g[s]) return g[s];
    var keys = Object.keys(g);
    for (var i = 0; i < keys.length; i++) { var d = g[keys[i]]; if (d.term.toLowerCase() === s) return d; }
    for (var j = 0; j < keys.length; j++) { var e = g[keys[j]]; if (e.term.toLowerCase().indexOf(s) >= 0 || s.indexOf(e.term.toLowerCase()) >= 0) return e; }
    return null;
  }
  var termCard = null, termTimer = null;
  function showTermCard(d) {
    if (!termCard) { termCard = el('div', { class: 'lg-term', role: 'status', 'aria-live': 'polite' }); document.body.appendChild(termCard); }
    termCard.innerHTML = '';
    termCard.appendChild(el('strong', null, d.term));
    termCard.appendChild(el('p', null, d.text));
    termCard.appendChild(el('button', { class: 'btn btn-ghost btn-sm', type: 'button', onclick: function () { termCard.hidden = true; } }, 'Close'));
    termCard.hidden = false;
    clearTimeout(termTimer); termTimer = setTimeout(function () { termCard.hidden = true; }, 20000);
  }

  var TOOLS = {
    open_tool: function (p) {
      var id = p && p.tool_id, t = (window.MP_TOOLS || []).filter(function (x) { return x.id === id; })[0];
      var url = PAGES[id] ? root + PAGES[id] : t ? root + 'apps/' + id + '/index.html' : null;
      if (!url) return 'There is no screen called "' + id + '".';
      openPanel(url, t ? t.title : id === 'guide' ? 'Guided setup' : id === 'report' ? 'My money plan' : 'Home');
      return 'Opened ' + (t ? t.title : id) + ' in a panel on the customer\'s screen.';
    },
    set_view: function (p) {
      var mode = p && p.mode === 'detailed' ? 'detailed' : 'simple';
      return MP.refresh().then(function () {
        MP.setPrefs({ detail: mode });
        if (panelOpen()) frame.contentWindow.postMessage({ mp: 'setPrefs', patch: { detail: mode } }, '*');
        updateVars();
        return 'Switched to ' + mode + ' view.';
      });
    },
    show_term: function (p) {
      var d = findTerm(p && p.term);
      if (!d) return 'That term is not in the app\'s glossary. Explain it in plain words.';
      showTermCard(d);
      return d.term + ': ' + d.text;
    },
    get_my_plan: function () {
      if (!gp().sharePlan) return 'The customer has not allowed the guide to see their plan. Give general guidance, and mention they can allow it in Guide settings.';
      return MP.refresh().then(function () {
        var pr = MP.prefs(), prof = MP.profile(), sums = MP.get('summaries', {}), goals = MP.goals();
        var TOOL = {}; (window.MP_TOOLS || []).forEach(function (t) { TOOL[t.id] = t.title; });
        var lines = [];
        lines.push('Age: ' + (prof.dob ? UK.age(prof.dob) : 'not given') + '. Lives in: ' + (prof.region || 'not given') + '. Yearly income: ' + (prof.salary ? MP.money(prof.salary) : 'not given') + '.');
        lines.push('Priorities: ' + ((pr.priorities || []).join(', ') || 'none chosen') + '. Life stage: ' + (pr.lifeStage || 'not given') + '.');
        lines.push('Plan steps: ' + ((pr.plan || []).map(function (x, i) { return (i + 1) + ') ' + (TOOL[x.tool] || x.tool) + (sums[x.tool] ? ' [done: ' + sums[x.tool].text + ']' : ''); }).join('; ') || 'no plan yet, suggest the guided setup'));
        lines.push('Dreams: ' + (goals.map(function (g) { return g.name + ' ' + MP.money(g.target) + ' by ' + MP.fmtDate(g.date) + ', saved ' + MP.money(g.saved || 0); }).join('; ') || 'none'));
        lines.push('Saved results: ' + (Object.keys(sums).map(function (k) { return (TOOL[k] || k) + ': ' + sums[k].text; }).join('; ') || 'none'));
        return lines.join('\n');
      });
    },
    get_screen_controls: function () {
      var share = !!gp().sharePlan;
      return askFrame({ mp: 'controls', figures: share }).then(function (text) { return (panelOpen() ? '(In the tool panel) ' : '') + (text || MP.controlsText(share)); });
    },
    click_control: function (p) {
      var ctl = p && (p.control || p.control_id || p.label);
      if (panelOpen()) return askFrame({ mp: 'act', action: 'click', control: ctl }, 5000).then(function (t) { return t || 'The panel did not respond.'; });
      return MP.act({ action: 'click', control: ctl });
    },
    fill_field: function (p) {
      var ctl = p && (p.control || p.control_id || p.label), val = p && p.value;
      if (val == null || val === '') return 'Tell me the value to enter.';
      if (panelOpen()) return askFrame({ mp: 'act', action: 'fill', control: ctl, value: val }, 5000).then(function (t) { return t || 'The panel did not respond.'; });
      return MP.act({ action: 'fill', control: ctl, value: val });
    },
    read_screen: function () {
      var share = !!gp().sharePlan;
      return askFrame({ mp: 'readScreen', figures: share }).then(function (text) { return text || MP.screenText(share); });
    }
  };

  /* ---------- styles ---------- */
  var css = document.createElement('style');
  css.textContent = [
    '.lg-launcher{position:fixed;inset-inline-start:16px;bottom:16px;z-index:40;border:0;border-radius:999px;padding:12px 18px;font:inherit;font-weight:700;background:var(--primary);color:var(--primary-ink);box-shadow:var(--shadow);cursor:pointer;min-height:48px}',
    '.lg-launcher.lg-small{padding:8px 14px;min-height:40px;font-size:.88rem;background:var(--surface);color:var(--text);border:1px solid var(--border)}',
    '.lg-panel{position:fixed;inset:72px 16px 96px 16px;z-index:35;background:var(--surface);border:1px solid var(--border);border-radius:var(--radius);box-shadow:var(--shadow);display:flex;flex-direction:column;overflow:hidden}',
    '@media (min-width:900px){.lg-panel{inset-inline-end:420px}}',
    '.lg-panel-head{display:flex;gap:8px;align-items:center;padding:8px 12px;border-bottom:1px solid var(--border);background:var(--surface-2)}',
    '.lg-frame{flex:1;width:100%;border:0;background:var(--bg)}',
    '.lg-term{position:fixed;inset-inline-start:16px;bottom:76px;z-index:45;max-width:360px;background:var(--surface);border:2px solid var(--accent);border-radius:var(--radius);padding:12px 14px;box-shadow:var(--shadow)}',
    '.lg-term p{margin:6px 0}',
    '@media (max-width:600px){.lg-term{bottom:150px;inset-inline-end:16px;max-width:none}.lg-panel{inset:64px 8px 140px 8px}}',
    '@media print{.lg-launcher,.lg-panel,.lg-term,elevenlabs-convai{display:none!important}}'
  ].join('\n');
  document.head.appendChild(css);

  drawLauncher();
  if (gp().consent) mount();
  MP.onPrefs(updateVars);
  MP.LiveGuide = { tools: TOOLS, openPanel: openPanel, closePanel: closePanel };
})();
