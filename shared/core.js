/* Money Planner core runtime: window.MP
   - Accounts live only on this device. Each customer's data ("vault") is encrypted with AES-GCM
     using a key derived from their password (PBKDF2-SHA256). Nothing is ever sent to a server.
   - The derived key is kept in sessionStorage for the open tab, so moving between tools does not
     ask for the password again. Closing the tab, signing out or being idle signs the customer out.
   - Pages call `MP.page({ id, title, icon })`, which checks the session, draws the shell and resolves
     once the vault is unlocked. Tools then read and write their state with MP.get / MP.set. */
(function () {
  'use strict';
  var CFG = window.MP_CONFIG || {};
  var USERS_KEY = 'mp.users.v1', SESSION_KEY = 'mp.session.v1', THEME_KEY = 'mp.theme';
  var enc = new TextEncoder(), dec = new TextDecoder();
  var MP = window.MP = {};

  /* ---------- small helpers ---------- */
  function $(sel, root) { return (root || document).querySelector(sel); }
  function $$(sel, root) { return Array.prototype.slice.call((root || document).querySelectorAll(sel)); }
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function el(tag, props) {
    var e = document.createElement(tag);
    props = props || {};
    Object.keys(props).forEach(function (k) {
      var v = props[k];
      if (v == null || v === false) return;
      if (k === 'class') e.className = v;
      else if (k === 'text') e.textContent = v;
      else if (k === 'html') e.innerHTML = v;
      else if (k === 'style' && typeof v === 'object') Object.assign(e.style, v);
      else if (k === 'dataset') Object.assign(e.dataset, v);
      else if (k.slice(0, 2) === 'on' && typeof v === 'function') e.addEventListener(k.slice(2), v);
      else if (v === true) e.setAttribute(k, '');
      else e.setAttribute(k, v);
    });
    for (var i = 2; i < arguments.length; i++) append(e, arguments[i]);
    return e;
  }
  function append(parent, c) {
    if (c == null || c === false) return;
    if (Array.isArray(c)) { c.forEach(function (x) { append(parent, x); }); return; }
    parent.appendChild(c.nodeType ? c : document.createTextNode(String(c)));
  }
  function num(v, def) { var n = parseFloat(String(v).replace(/[£,\s]/g, '')); return isFinite(n) ? n : (def == null ? 0 : def); }
  function clamp(v, lo, hi) { return Math.min(hi, Math.max(lo, v)); }
  function uid() { return Date.now().toString(36) + Math.random().toString(36).slice(2, 8); }

  var gbp0 = new Intl.NumberFormat('en-GB', { style: 'currency', currency: 'GBP', maximumFractionDigits: 0 });
  var gbp2 = new Intl.NumberFormat('en-GB', { style: 'currency', currency: 'GBP', minimumFractionDigits: 2, maximumFractionDigits: 2 });
  function money(n, pence) {
    n = +n; if (!isFinite(n)) n = 0;
    var s = (pence ? gbp2 : gbp0).format(Math.abs(n));
    return n < 0 ? '−' + s : s;
  }
  function pct(n, dp) { return (n * 100).toFixed(dp == null ? 1 : dp).replace(/\.0+$/, '') + '%'; }
  function fmtNum(n, dp) { return new Intl.NumberFormat('en-GB', { maximumFractionDigits: dp == null ? 0 : dp }).format(+n || 0); }
  function fmtDate(d) { d = d instanceof Date ? d : new Date(d); return isNaN(d) ? '' : d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }); }
  function isoDate(d) { d = d instanceof Date ? d : new Date(d); if (isNaN(d)) return ''; return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'); }

  Object.assign(MP, { $: $, $$: $$, el: el, esc: esc, num: num, clamp: clamp, uid: uid, money: money, pct: pct, fmtNum: fmtNum, fmtDate: fmtDate, isoDate: isoDate, config: CFG });

  /* ---------- storage helpers (never throw) ---------- */
  function lsGet(k, def) { try { var v = localStorage.getItem(k); return v == null ? def : JSON.parse(v); } catch (e) { return def; } }
  function lsSet(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); return true; } catch (e) { return false; } }
  function ssGet(k) { try { var v = sessionStorage.getItem(k); return v ? JSON.parse(v) : null; } catch (e) { return null; } }
  function ssSet(k, v) { try { if (v == null) sessionStorage.removeItem(k); else sessionStorage.setItem(k, JSON.stringify(v)); } catch (e) { } }

  /* ---------- theme ---------- */
  function applyTheme(t) { if (t === 'light' || t === 'dark') document.documentElement.setAttribute('data-theme', t); else document.documentElement.removeAttribute('data-theme'); }
  applyTheme(lsGet(THEME_KEY, null));
  MP.theme = function () {
    var t = document.documentElement.getAttribute('data-theme');
    if (t) return t;
    return window.matchMedia && matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  };
  var themeFns = [];
  MP.onTheme = function (fn) { themeFns.push(fn); };
  MP.toggleTheme = function () { var n = MP.theme() === 'dark' ? 'light' : 'dark'; lsSet(THEME_KEY, n); applyTheme(n); themeFns.forEach(function (f) { try { f(n); } catch (e) { console.error(e); } }); };
  if (window.matchMedia) { try { matchMedia('(prefers-color-scheme: dark)').addEventListener('change', function () { themeFns.forEach(function (f) { f(MP.theme()); }); }); } catch (e) { } }
  MP.css = function (name) { return getComputedStyle(document.documentElement).getPropertyValue(name).trim(); };

  /* ---------- crypto ---------- */
  function b64(buf) { var b = new Uint8Array(buf), s = ''; for (var i = 0; i < b.length; i += 0x8000) s += String.fromCharCode.apply(null, b.subarray(i, i + 0x8000)); return btoa(s); }
  function unb64(s) { var bin = atob(s), b = new Uint8Array(bin.length); for (var i = 0; i < bin.length; i++) b[i] = bin.charCodeAt(i); return b; }
  function subtle() {
    var s = window.crypto && window.crypto.subtle;
    if (!s) throw new Error('This browser cannot encrypt data here. Please use an up-to-date browser over https or open the file directly.');
    return s;
  }
  function deriveKey(password, salt, iterations) {
    return subtle().importKey('raw', enc.encode(password), 'PBKDF2', false, ['deriveKey']).then(function (base) {
      return subtle().deriveKey({ name: 'PBKDF2', salt: salt, iterations: iterations, hash: 'SHA-256' }, base, { name: 'AES-GCM', length: 256 }, true, ['encrypt', 'decrypt']);
    });
  }
  function encryptJSON(key, obj) {
    var iv = crypto.getRandomValues(new Uint8Array(12));
    return subtle().encrypt({ name: 'AES-GCM', iv: iv }, key, enc.encode(JSON.stringify(obj))).then(function (ct) { return { iv: b64(iv), ct: b64(ct) }; });
  }
  function decryptJSON(key, box) {
    return subtle().decrypt({ name: 'AES-GCM', iv: unb64(box.iv) }, key, unb64(box.ct)).then(function (pt) { return JSON.parse(dec.decode(pt)); });
  }
  function exportKey(key) { return subtle().exportKey('raw', key).then(b64); }
  function importKey(raw) { return subtle().importKey('raw', unb64(raw), { name: 'AES-GCM' }, true, ['encrypt', 'decrypt']); }

  /* ---------- accounts ---------- */
  function users() { return lsGet(USERS_KEY, []); }
  function saveUsers(list) { if (!lsSet(USERS_KEY, list)) throw new Error('This browser has no room left to save your data. Free some space or remove old documents.'); }
  function findUser(email) { email = String(email || '').trim().toLowerCase(); return users().filter(function (u) { return u.email === email; })[0] || null; }

  function emptyVault(name) {
    return { version: 1, profile: { name: name, dob: '', region: 'england', salary: 0, employment: 'employed', dependants: 0, riskAttitude: 'balanced' }, goals: [], tools: {}, summaries: {}, documents: [], activity: [] };
  }

  var state = { user: null, key: null, vault: null, saveTimer: null, saving: null };

  MP.auth = {
    users: function () { return users().map(function (u) { return { email: u.email, name: u.name }; }); },
    passwordProblem: function (pw) {
      if (!pw || pw.length < 10) return 'Use at least 10 characters.';
      if (!/[a-zA-Z]/.test(pw) || !/[0-9\W_]/.test(pw)) return 'Mix letters with numbers or symbols.';
      return '';
    },
    register: function (name, email, password) {
      email = String(email || '').trim().toLowerCase(); name = String(name || '').trim();
      if (!name) return Promise.reject(new Error('Please enter your name.'));
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return Promise.reject(new Error('Please enter a valid email address.'));
      if (findUser(email)) return Promise.reject(new Error('An account with this email already exists on this device. Sign in instead.'));
      var prob = MP.auth.passwordProblem(password);
      if (prob) return Promise.reject(new Error(prob));
      var salt = crypto.getRandomValues(new Uint8Array(16)), iter = CFG.pbkdf2Iterations || 310000;
      return deriveKey(password, salt, iter).then(function (key) {
        var vault = emptyVault(name);
        return encryptJSON(key, vault).then(function (box) {
          var list = users();
          list.push({ id: uid(), email: email, name: name, salt: b64(salt), iter: iter, vault: box, created: Date.now(), fails: 0, lockUntil: 0 });
          saveUsers(list);
          return startSession(list[list.length - 1], key);
        });
      });
    },
    login: function (email, password) {
      var u = findUser(email);
      if (!u) return Promise.reject(new Error('Email or password is not right.'));
      if (u.lockUntil && u.lockUntil > Date.now()) {
        var secs = Math.ceil((u.lockUntil - Date.now()) / 1000);
        return Promise.reject(new Error('Too many attempts. Try again in ' + secs + ' seconds.'));
      }
      return deriveKey(password, unb64(u.salt), u.iter).then(function (key) {
        return decryptJSON(key, u.vault).then(function () {
          var list = users(); list.forEach(function (x) { if (x.email === u.email) { x.fails = 0; x.lockUntil = 0; x.lastLogin = Date.now(); } }); saveUsers(list);
          return startSession(u, key);
        }, function () {
          var list = users(); list.forEach(function (x) {
            if (x.email === u.email) { x.fails = (x.fails || 0) + 1; if (x.fails >= 5) x.lockUntil = Date.now() + 30000 * Math.pow(2, Math.min(5, x.fails - 5)); }
          }); saveUsers(list);
          throw new Error('Email or password is not right.');
        });
      });
    },
    logout: function (reason) {
      flush().then(function () {
        ssSet(SESSION_KEY, null); state.key = null; state.vault = null;
        location.href = MP.root() + 'index.html' + (reason ? '?signedout=' + encodeURIComponent(reason) : '');
      });
    },
    changePassword: function (oldPw, newPw) {
      var u = findUser(state.user && state.user.email);
      if (!u) return Promise.reject(new Error('Not signed in.'));
      var prob = MP.auth.passwordProblem(newPw);
      if (prob) return Promise.reject(new Error(prob));
      return deriveKey(oldPw, unb64(u.salt), u.iter).then(function (oldKey) {
        return decryptJSON(oldKey, u.vault).catch(function () { throw new Error('Your current password is not right.'); });
      }).then(function () {
        var salt = crypto.getRandomValues(new Uint8Array(16));
        return deriveKey(newPw, salt, u.iter).then(function (key) {
          return encryptJSON(key, state.vault).then(function (box) {
            var list = users(); list.forEach(function (x) { if (x.email === u.email) { x.salt = b64(salt); x.vault = box; } }); saveUsers(list);
            state.key = key;
            return exportKey(key).then(function (raw) { var s = ssGet(SESSION_KEY); s.key = raw; ssSet(SESSION_KEY, s); });
          });
        });
      });
    },
    deleteAccount: function () {
      var email = state.user && state.user.email;
      saveUsers(users().filter(function (x) { return x.email !== email; }));
      ssSet(SESSION_KEY, null); state.vault = null; state.key = null;
      location.href = MP.root() + 'index.html?signedout=deleted';
    },
    current: function () { return state.user ? { email: state.user.email, name: state.vault ? state.vault.profile.name : state.user.name } : null; }
  };

  function startSession(u, key) {
    return exportKey(key).then(function (raw) {
      ssSet(SESSION_KEY, { email: u.email, key: raw, last: Date.now() });
      return true;
    });
  }

  function resume() {
    var s = ssGet(SESSION_KEY);
    if (!s) return Promise.resolve(false);
    var mins = CFG.autoLockMinutes || 15;
    if (Date.now() - (s.last || 0) > mins * 60000) { ssSet(SESSION_KEY, null); return Promise.resolve('idle'); }
    var u = findUser(s.email);
    if (!u) { ssSet(SESSION_KEY, null); return Promise.resolve(false); }
    return importKey(s.key).then(function (key) {
      return decryptJSON(key, u.vault).then(function (vault) {
        state.user = u; state.key = key; state.vault = migrate(vault);
        touch();
        return true;
      });
    }).catch(function () { ssSet(SESSION_KEY, null); return false; });
  }
  function migrate(v) {
    var d = emptyVault(v && v.profile ? v.profile.name : '');
    Object.keys(d).forEach(function (k) { if (v[k] == null) v[k] = d[k]; });
    Object.keys(d.profile).forEach(function (k) { if (v.profile[k] == null) v.profile[k] = d.profile[k]; });
    return v;
  }
  function touch() { var s = ssGet(SESSION_KEY); if (s) { s.last = Date.now(); ssSet(SESSION_KEY, s); } }

  /* ---------- vault data API ---------- */
  function getPath(obj, path) {
    var parts = String(path).split('.');
    for (var i = 0; i < parts.length; i++) { if (obj == null) return undefined; obj = obj[parts[i]]; }
    return obj;
  }
  function setPath(obj, path, value) {
    var parts = String(path).split('.');
    for (var i = 0; i < parts.length - 1; i++) { if (obj[parts[i]] == null || typeof obj[parts[i]] !== 'object') obj[parts[i]] = {}; obj = obj[parts[i]]; }
    if (value === undefined) delete obj[parts[parts.length - 1]]; else obj[parts[parts.length - 1]] = value;
  }
  function clone(v) { return v == null ? v : JSON.parse(JSON.stringify(v)); }

  /* MP.get('tools.retirement', {}) returns a copy; MP.set saves it (encrypted, debounced). */
  MP.get = function (path, def) { if (!state.vault) return def; var v = getPath(state.vault, path); return v === undefined ? clone(def) : clone(v); };
  MP.set = function (path, value) { if (!state.vault) return; setPath(state.vault, path, clone(value)); scheduleSave(); };
  MP.vault = function () { return state.vault; };
  MP.profile = function () { return clone(state.vault ? state.vault.profile : {}); };
  /* A one-line summary of a tool's saved plan, shown on the home page. */
  MP.summary = function (toolId, text) { MP.set('summaries.' + toolId, { text: text, at: Date.now() }); };
  MP.log = function (text) {
    if (!state.vault) return;
    state.vault.activity.unshift({ text: text, at: Date.now() });
    state.vault.activity = state.vault.activity.slice(0, 40);
    scheduleSave();
  };
  /* Goals are shared by every tool: {id, name, icon, target, saved, date, priority, monthly, linked} */
  MP.goals = function () { return MP.get('goals', []); };
  MP.saveGoals = function (list) { MP.set('goals', list); };

  function scheduleSave() { clearTimeout(state.saveTimer); state.saveTimer = setTimeout(flush, 250); }
  function flush() {
    clearTimeout(state.saveTimer);
    if (!state.vault || !state.key || !state.user) return Promise.resolve();
    var vault = state.vault, key = state.key, email = state.user.email;
    state.saving = encryptJSON(key, vault).then(function (box) {
      var list = users(); list.forEach(function (x) { if (x.email === email) x.vault = box; });
      try { saveUsers(list); } catch (e) { MP.toast(e.message); }
    }).catch(function (e) { console.error(e); });
    return state.saving;
  }
  MP.flush = flush;
  window.addEventListener('pagehide', function () { flush(); });

  /* Export / import of the decrypted vault so a customer can move to another device. */
  MP.exportData = function () {
    MP.download('money-planner-backup-' + isoDate(new Date()) + '.json', JSON.stringify(state.vault, null, 2), 'application/json');
  };
  MP.importData = function (obj) {
    if (!obj || typeof obj !== 'object' || !obj.profile) throw new Error('That file is not a Money Planner backup.');
    state.vault = migrate(obj); scheduleSave();
  };

  /* ---------- idle auto-lock ---------- */
  var lastTouch = 0;
  function activity() { var n = Date.now(); if (n - lastTouch > 15000) { lastTouch = n; touch(); } }
  function startIdleWatch() {
    ['pointerdown', 'keydown', 'scroll', 'touchstart'].forEach(function (ev) { window.addEventListener(ev, activity, { passive: true }); });
    setInterval(function () {
      var s = ssGet(SESSION_KEY);
      if (!s || Date.now() - s.last > (CFG.autoLockMinutes || 15) * 60000) MP.auth.logout('idle');
    }, 20000);
  }

  /* ---------- paths ---------- */
  MP.root = function () {
    var s = document.querySelector('script[src*="shared/core.js"]');
    return s ? s.getAttribute('src').replace(/shared\/core\.js.*$/, '') : '';
  };

  /* ---------- shell ---------- */
  function header(signedIn) {
    var root = MP.root();
    var right = [];
    if (signedIn) {
      right.push(el('span', { class: 'mp-user', id: 'mp-user' }, 'Hi, ' + (state.vault.profile.name || '').split(' ')[0]));
      right.push(el('button', { class: 'btn btn-sm', type: 'button', id: 'mp-signout', onclick: function () { MP.auth.logout('signedout'); } }, 'Sign out'));
    }
    right.push(el('button', { class: 'btn btn-sm', type: 'button', id: 'mp-theme', 'aria-label': 'Switch light or dark mode', onclick: MP.toggleTheme }, '◐'));
    return el('header', { class: 'mp-header' },
      el('div', { class: 'mp-header-in' },
        el('a', { class: 'mp-brand', href: root + (signedIn ? 'home.html' : 'index.html') },
          el('span', { class: 'mp-logo', 'aria-hidden': 'true' }, CFG.logoText || 'MP'),
          el('span', null, CFG.product || 'Money Planner', el('small', null, CFG.brand || ''))),
        el('span', { class: 'mp-spacer' }), right));
  }
  function footer() {
    var R = window.UK ? UK.R : { taxYear: '' };
    return el('footer', { class: 'mp-footer' }, el('div', { class: 'mp-footer-in' },
      el('p', null, el('strong', null, 'Guidance, not advice. '), 'These tools help you plan. They are not personal financial advice or a recommendation to buy any product. The value of investments can fall as well as rise and you may get back less than you put in.'),
      el('p', null, 'Tax figures are for the ' + R.taxYear + ' tax year and depend on your circumstances. For free, impartial help visit ',
        el('a', { href: 'https://www.moneyhelper.org.uk', target: '_blank', rel: 'noopener' }, 'MoneyHelper'), ' or, if you are 50 or over, book a Pension Wise appointment.'),
      el('p', null, 'Your data is encrypted and stays on this device. Nothing is sent to ' + (CFG.brand || 'us') + ' or anyone else. ' + (CFG.supportText || ''))));
  }

  /* MP.page({id, title, icon}) → Promise<vault>. Redirects to sign-in when there is no session. */
  MP.page = function (opts) {
    opts = opts || {};
    if (opts.title) document.title = opts.title + ' · ' + (CFG.product || 'Money Planner');
    return resume().then(function (ok) {
      if (ok !== true) {
        location.replace(MP.root() + 'index.html?next=' + encodeURIComponent(location.pathname.split('/').slice(-3).join('/')) + (ok === 'idle' ? '&signedout=idle' : ''));
        return new Promise(function () { });
      }
      var main = document.getElementById('app');
      document.body.insertBefore(header(true), document.body.firstChild);
      if (opts.id !== 'home') {
        document.body.insertBefore(el('nav', { class: 'mp-crumb no-print', 'aria-label': 'Breadcrumb' },
          el('a', { href: MP.root() + 'home.html', id: 'mp-back' }, '← All tools')), main);
      }
      document.body.appendChild(footer());
      startIdleWatch();
      return state.vault;
    });
  };
  /* For the public sign-in page. */
  MP.publicPage = function () {
    var main = document.getElementById('app');
    document.body.insertBefore(header(false), main);
    document.body.appendChild(footer());
    return resume();
  };

  /* ---------- UI helpers ---------- */
  var toastTimer;
  MP.toast = function (msg) {
    var t = $('.mp-toast');
    if (!t) { t = el('div', { class: 'mp-toast', role: 'status', 'aria-live': 'polite' }); document.body.appendChild(t); }
    t.textContent = msg; t.hidden = false;
    clearTimeout(toastTimer); toastTimer = setTimeout(function () { t.hidden = true; }, 3200);
  };
  MP.modal = function (content, opts) {
    opts = opts || {};
    var prev = document.activeElement;
    var closeBtn = el('button', { class: 'btn btn-ghost btn-sm', type: 'button', 'aria-label': 'Close' }, '✕');
    var box = el('div', { class: 'mp-modal', role: 'dialog', 'aria-modal': 'true', 'aria-label': opts.title || 'Dialog' },
      el('div', { class: 'mp-modal-head' }, el('h2', null, opts.title || ''), closeBtn),
      typeof content === 'string' ? el('div', { html: content }) : content);
    var bg = el('div', { class: 'mp-modal-bg' }, box);
    function close() { bg.remove(); document.removeEventListener('keydown', onKey); if (prev && prev.focus) prev.focus(); if (opts.onClose) opts.onClose(); }
    function onKey(e) { if (e.key === 'Escape') close(); }
    closeBtn.onclick = close;
    bg.addEventListener('pointerdown', function (e) { if (e.target === bg) close(); });
    document.addEventListener('keydown', onKey);
    document.body.appendChild(bg);
    var f = box.querySelector('input, select, textarea, button:not([aria-label="Close"])') || closeBtn; f.focus();
    return close;
  };
  MP.confirm = function (msg) { return window.confirm(msg); };
  MP.download = function (name, data, mime) {
    var blob = data instanceof Blob ? data : new Blob([data], { type: (mime || 'text/plain') + ';charset=utf-8' });
    var a = el('a', { href: URL.createObjectURL(blob), download: name });
    document.body.appendChild(a); a.click();
    setTimeout(function () { URL.revokeObjectURL(a.href); a.remove(); }, 1000);
  };

  /* Labelled form field. MP.field('Monthly amount', input, 'hint') */
  MP.field = function (label, input, hint) {
    if (!input.id) input.id = 'f-' + uid();
    return el('div', { class: 'field' }, el('label', { for: input.id }, label), input, hint ? el('span', { class: 'hint' }, hint) : null);
  };
  MP.moneyInput = function (attrs) {
    var inp = el('input', Object.assign({ type: 'number', inputmode: 'decimal', min: '0', step: 'any' }, attrs || {}));
    return { wrap: el('div', { class: 'money-input' }, inp), input: inp };
  };
  /* Segmented control: MP.seg([{value,label}], current, onChange) */
  MP.seg = function (options, current, onChange, label) {
    var box = el('div', { class: 'seg', role: 'group', 'aria-label': label || '' });
    options.forEach(function (o) {
      box.appendChild(el('button', { type: 'button', 'aria-pressed': String(o.value === current), dataset: { value: o.value },
        onclick: function () { $$('button', box).forEach(function (b) { b.setAttribute('aria-pressed', String(b.dataset.value === o.value)); }); onChange(o.value); } }, o.label));
    });
    return box;
  };

  /* ---------- files (read on the device only) ---------- */
  MP.files = {
    pick: function (accept, multiple) {
      return new Promise(function (resolve) {
        var inp = el('input', { type: 'file', accept: accept || '', style: { display: 'none' } });
        if (multiple) inp.multiple = true;
        inp.onchange = function () { resolve(Array.prototype.slice.call(inp.files || [])); inp.remove(); };
        document.body.appendChild(inp); inp.click();
      });
    },
    text: function (file) {
      return new Promise(function (resolve, reject) { var r = new FileReader(); r.onload = function () { resolve(String(r.result)); }; r.onerror = function () { reject(r.error); }; r.readAsText(file); });
    },
    buffer: function (file) {
      return new Promise(function (resolve, reject) { var r = new FileReader(); r.onload = function () { resolve(r.result); }; r.onerror = function () { reject(r.error); }; r.readAsArrayBuffer(file); });
    },
    /* Make an element accept dropped files. */
    dropzone: function (node, onFiles) {
      ['dragenter', 'dragover'].forEach(function (ev) { node.addEventListener(ev, function (e) { e.preventDefault(); node.classList.add('over'); }); });
      ['dragleave', 'drop'].forEach(function (ev) { node.addEventListener(ev, function () { node.classList.remove('over'); }); });
      node.addEventListener('drop', function (e) { e.preventDefault(); var f = Array.prototype.slice.call(e.dataTransfer.files || []); if (f.length) onFiles(f); });
    },
    /* PDF text via pdf.js from a CDN (needs internet the first time). Resolves to an array of page strings. */
    pdfText: function (file) {
      var V = '3.11.174', base = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/' + V + '/';
      function load() {
        if (window.pdfjsLib) return Promise.resolve(window.pdfjsLib);
        return new Promise(function (resolve, reject) {
          var s = el('script', { src: base + 'pdf.min.js' });
          s.onload = function () { window.pdfjsLib.GlobalWorkerOptions.workerSrc = base + 'pdf.worker.min.js'; resolve(window.pdfjsLib); };
          s.onerror = function () { reject(new Error('Could not load the PDF reader. PDFs need an internet connection the first time; CSV files work offline.')); };
          document.head.appendChild(s);
        });
      }
      return Promise.all([load(), MP.files.buffer(file)]).then(function (r) {
        return r[0].getDocument({ data: new Uint8Array(r[1]) }).promise.then(function (pdf) {
          var pages = [];
          function next(i) {
            if (i > pdf.numPages) return pages;
            return pdf.getPage(i).then(function (p) { return p.getTextContent(); }).then(function (tc) {
              // rebuild lines from text items using their y position
              var lines = {}, order = [];
              tc.items.forEach(function (it) {
                var y = Math.round(it.transform[5]);
                var key = Object.keys(lines).filter(function (k) { return Math.abs(k - y) <= 2; })[0];
                if (key == null) { key = y; lines[key] = []; order.push(key); }
                lines[key].push({ x: it.transform[4], s: it.str });
              });
              order.sort(function (a, b) { return b - a; });
              pages.push(order.map(function (k) { return lines[k].sort(function (a, b) { return a.x - b.x; }).map(function (i) { return i.s; }).join('  ').replace(/\s{3,}/g, '  ').trim(); }).join('\n'));
              return next(i + 1);
            });
          }
          return next(1);
        });
      });
    }
  };

  /* ---------- CSV ---------- */
  MP.csv = {
    parse: function (text) {
      text = String(text || '').replace(/^﻿/, '');
      var delim = ',', first = text.split(/\r?\n/)[0] || '';
      if ((first.match(/;/g) || []).length > (first.match(/,/g) || []).length) delim = ';';
      if ((first.match(/\t/g) || []).length > (first.match(/,/g) || []).length) delim = '\t';
      var rows = [], row = [], cell = '', q = false;
      for (var i = 0; i < text.length; i++) {
        var c = text[i];
        if (q) { if (c === '"') { if (text[i + 1] === '"') { cell += '"'; i++; } else q = false; } else cell += c; }
        else if (c === '"') q = true;
        else if (c === delim) { row.push(cell); cell = ''; }
        else if (c === '\n' || c === '\r') { if (c === '\r' && text[i + 1] === '\n') i++; row.push(cell); rows.push(row); row = []; cell = ''; }
        else cell += c;
      }
      if (cell !== '' || row.length) { row.push(cell); rows.push(row); }
      return rows.filter(function (r) { return r.some(function (c) { return String(c).trim() !== ''; }); });
    },
    stringify: function (rows) {
      return '﻿' + rows.map(function (r) { return r.map(function (c) { c = c == null ? '' : String(c); return /[",\n;]/.test(c) ? '"' + c.replace(/"/g, '""') + '"' : c; }).join(','); }).join('\r\n');
    }
  };

  /* UK-style date parsing: 31/01/2026, 31-01-26, 31 Jan 2026, 2026-01-31, 20260131 (OFX). */
  var MON = { jan: 0, feb: 1, mar: 2, apr: 3, may: 4, jun: 5, jul: 6, aug: 7, sep: 8, sept: 8, oct: 9, nov: 10, dec: 11 };
  MP.parseDate = function (s) {
    s = String(s || '').trim(); var m;
    if ((m = s.match(/^(\d{4})(\d{2})(\d{2})/))) return new Date(+m[1], +m[2] - 1, +m[3]);
    if ((m = s.match(/^(\d{4})[-\/.](\d{1,2})[-\/.](\d{1,2})/))) return new Date(+m[1], +m[2] - 1, +m[3]);
    if ((m = s.match(/^(\d{1,2})[-\/.](\d{1,2})[-\/.](\d{2,4})/))) { var y = +m[3]; if (y < 100) y += 2000; return new Date(y, +m[2] - 1, +m[1]); }
    if ((m = s.match(/^(\d{1,2})[\s-]+([A-Za-z]{3,9})[\s-,]+(\d{2,4})/))) { var mo = MON[m[2].slice(0, 4).toLowerCase()]; if (mo == null) mo = MON[m[2].slice(0, 3).toLowerCase()]; var yy = +m[3]; if (yy < 100) yy += 2000; if (mo != null) return new Date(yy, mo, +m[1]); }
    if ((m = s.match(/^([A-Za-z]{3,9})\s+(\d{1,2}),?\s+(\d{4})/))) { var mo2 = MON[m[1].slice(0, 3).toLowerCase()]; if (mo2 != null) return new Date(+m[3], mo2, +m[2]); }
    return null;
  };

  /* ---------- charts (SVG, theme-aware) ---------- */
  var SVGNS = 'http://www.w3.org/2000/svg';
  function svg(tag, attrs, text) { var e = document.createElementNS(SVGNS, tag); Object.keys(attrs || {}).forEach(function (k) { e.setAttribute(k, attrs[k]); }); if (text != null) e.textContent = text; return e; }
  function niceMax(v) { if (v <= 0) return 1; var p = Math.pow(10, Math.floor(Math.log10(v))), n = v / p; return (n <= 1 ? 1 : n <= 2 ? 2 : n <= 2.5 ? 2.5 : n <= 5 ? 5 : 10) * p; }
  function shortMoney(v) { var a = Math.abs(v); return (v < 0 ? '−' : '') + '£' + (a >= 1e6 ? (a / 1e6).toFixed(a >= 1e7 ? 0 : 1) + 'm' : a >= 1e3 ? (a / 1e3).toFixed(a >= 1e4 ? 0 : 1) + 'k' : Math.round(a)); }
  MP.shortMoney = shortMoney;

  /* Line/area chart. series: [{name, color:'--c1', values:[...], area:true, dash:true}], labels: x labels */
  MP.lineChart = function (opts) {
    var W = opts.width || 640, H = opts.height || 280, P = { l: 56, r: 14, t: 14, b: 30 };
    var series = opts.series || [], labels = opts.labels || [];
    var n = Math.max(1, labels.length - 1);
    var max = niceMax(Math.max.apply(null, [0].concat(series.map(function (s) { return Math.max.apply(null, s.values.concat([0])); }))));
    var s = svg('svg', { viewBox: '0 0 ' + W + ' ' + H, class: 'chart', role: 'img', 'aria-label': opts.label || 'Chart' });
    var text = MP.css('--muted'), grid = MP.css('--border');
    function x(i) { return P.l + (W - P.l - P.r) * i / n; }
    function y(v) { return H - P.b - (H - P.t - P.b) * v / max; }
    for (var g = 0; g <= 4; g++) {
      var gv = max * g / 4;
      s.appendChild(svg('line', { x1: P.l, x2: W - P.r, y1: y(gv), y2: y(gv), stroke: grid, 'stroke-width': 1 }));
      s.appendChild(svg('text', { x: P.l - 6, y: y(gv) + 4, 'text-anchor': 'end', 'font-size': 11, fill: text }, shortMoney(gv)));
    }
    var step = Math.max(1, Math.ceil(labels.length / 8));
    labels.forEach(function (l, i) { if (i % step === 0 || i === labels.length - 1) s.appendChild(svg('text', { x: x(i), y: H - 10, 'text-anchor': 'middle', 'font-size': 11, fill: text }, l)); });
    series.forEach(function (se) {
      var col = MP.css(se.color || '--c1') || se.color;
      var pts = se.values.map(function (v, i) { return x(i) + ',' + y(Math.max(0, v)); });
      if (se.area) s.appendChild(svg('path', { d: 'M' + x(0) + ',' + y(0) + ' L' + pts.join(' L') + ' L' + x(se.values.length - 1) + ',' + y(0) + ' Z', fill: col, opacity: 0.16 }));
      s.appendChild(svg('polyline', { points: pts.join(' '), fill: 'none', stroke: col, 'stroke-width': 2.5, 'stroke-dasharray': se.dash ? '6 5' : 'none', 'stroke-linejoin': 'round' }));
    });
    if (opts.marker != null) {
      var mx = x(opts.marker.index);
      s.appendChild(svg('line', { x1: mx, x2: mx, y1: P.t, y2: H - P.b, stroke: MP.css('--warning'), 'stroke-width': 1.5, 'stroke-dasharray': '4 4' }));
      s.appendChild(svg('text', { x: Math.min(mx + 4, W - 80), y: P.t + 12, 'font-size': 11, fill: MP.css('--warning') }, opts.marker.label));
    }
    return wrapChart(s, series);
  };
  /* Horizontal bar chart: items [{label, value, color}] */
  MP.barChart = function (opts) {
    var items = opts.items || [], W = opts.width || 640, rowH = 30, P = { l: Math.min(200, opts.labelWidth || 150), r: 70 };
    var H = Math.max(40, items.length * rowH + 10), max = Math.max.apply(null, items.map(function (i) { return Math.abs(i.value); }).concat([1]));
    var s = svg('svg', { viewBox: '0 0 ' + W + ' ' + H, class: 'chart', role: 'img', 'aria-label': opts.label || 'Bar chart' });
    var text = MP.css('--text'), muted = MP.css('--muted');
    items.forEach(function (it, i) {
      var y0 = 5 + i * rowH, w = (W - P.l - P.r) * Math.abs(it.value) / max;
      var lab = String(it.label); if (lab.length > 22) lab = lab.slice(0, 21) + '…';
      s.appendChild(svg('text', { x: P.l - 8, y: y0 + 18, 'text-anchor': 'end', 'font-size': 12, fill: text }, lab));
      s.appendChild(svg('rect', { x: P.l, y: y0 + 4, width: Math.max(2, w), height: rowH - 10, rx: 4, fill: MP.css(it.color || '--c' + (i % 8 + 1)) }));
      s.appendChild(svg('text', { x: P.l + w + 6, y: y0 + 18, 'font-size': 12, fill: muted }, opts.format ? opts.format(it.value) : shortMoney(it.value)));
    });
    return s;
  };
  /* Donut: items [{label, value, color}] */
  MP.donut = function (opts) {
    var items = (opts.items || []).filter(function (i) { return i.value > 0; }), total = items.reduce(function (a, i) { return a + i.value; }, 0) || 1;
    var S = 200, R = 80, r = 52, cx = 100, cy = 100, a0 = -Math.PI / 2;
    var s = svg('svg', { viewBox: '0 0 ' + S + ' ' + S, class: 'chart', role: 'img', 'aria-label': opts.label || 'Donut chart', style: 'max-width:240px;margin:0 auto' });
    items.forEach(function (it, i) {
      var a1 = a0 + 2 * Math.PI * it.value / total, large = a1 - a0 > Math.PI ? 1 : 0;
      if (items.length === 1) a1 = a0 + 2 * Math.PI - 0.0001;
      var d = ['M', cx + R * Math.cos(a0), cy + R * Math.sin(a0), 'A', R, R, 0, large, 1, cx + R * Math.cos(a1), cy + R * Math.sin(a1),
        'L', cx + r * Math.cos(a1), cy + r * Math.sin(a1), 'A', r, r, 0, large, 0, cx + r * Math.cos(a0), cy + r * Math.sin(a0), 'Z'].join(' ');
      s.appendChild(svg('path', { d: d, fill: MP.css(it.color || '--c' + (i % 8 + 1)) }));
      a0 = a1;
    });
    if (opts.center) s.appendChild(svg('text', { x: cx, y: cy + 6, 'text-anchor': 'middle', 'font-size': 18, 'font-weight': 700, fill: MP.css('--text') }, opts.center));
    return wrapChart(s, items.map(function (i, k) { return { name: i.label + (opts.showValues === false ? '' : ' · ' + money(i.value)), color: i.color || '--c' + (k % 8 + 1) }; }));
  };
  function wrapChart(s, series) {
    var legend = el('div', { class: 'legend' });
    (series || []).forEach(function (se) { if (se.name) legend.appendChild(el('span', null, el('i', { style: { background: MP.css(se.color || '--c1') } }), se.name)); });
    return el('div', { class: 'chart-wrap' }, s, legend);
  }
})();
