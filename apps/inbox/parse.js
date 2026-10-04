/* Money inbox: email parsing and fact extraction. window.InboxParse
   Everything runs in the browser. Raw messages are handled as "binary strings" (one char per byte)
   until the charset of each part is known, then decoded with TextDecoder. */
(function () {
  'use strict';

  /* ---------- bytes and charsets ---------- */
  function bufToBinary(buf) {
    var b = new Uint8Array(buf), s = '';
    for (var i = 0; i < b.length; i += 0x8000) s += String.fromCharCode.apply(null, b.subarray(i, i + 0x8000));
    return s;
  }
  // Unicode string → UTF-8 binary string (for pasted text that looks like a raw email)
  function toBinary(str) {
    try { return bufToBinary(new TextEncoder().encode(String(str))); } catch (e) { return String(str); }
  }
  function normCharset(cs) {
    cs = String(cs || '').trim().replace(/^["']|["']$/g, '').split('*')[0].toLowerCase();
    if (!cs || cs === 'us-ascii' || cs === 'ascii' || cs === 'ansi_x3.4-1968') return 'utf-8';
    if (cs === 'latin1' || cs === 'latin-1' || cs === 'iso8859-1' || cs === 'iso_8859-1') return 'iso-8859-1';
    if (cs === 'utf8') return 'utf-8';
    return cs;
  }
  function decodeBytes(bin, charset) {
    bin = String(bin || '');
    if (!/[\x80-\xff]/.test(bin)) return bin; // plain ASCII: nothing to do
    var bytes = new Uint8Array(bin.length);
    for (var i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i) & 0xff;
    var cs = normCharset(charset);
    try { return new TextDecoder(cs).decode(bytes); } catch (e) {
      try { return new TextDecoder('utf-8').decode(bytes); } catch (e2) { return bin; }
    }
  }
  // Bytes with no declared charset: try UTF-8, fall back to Windows-1252 if it is not valid UTF-8.
  function decodeGuess(bin) {
    if (!/[\x80-\xff]/.test(bin)) return bin;
    var u = decodeBytes(bin, 'utf-8');
    return u.indexOf('\uFFFD') >= 0 ? decodeBytes(bin, 'windows-1252') : u;
  }

  /* ---------- transfer encodings ---------- */
  function decodeBase64(s) {
    var clean = String(s || '').replace(/[^A-Za-z0-9+\/]/g, '');
    clean = clean.slice(0, clean.length - (clean.length % 4 === 1 ? 1 : 0));
    while (clean.length % 4) clean += '=';
    try { return atob(clean); } catch (e) { return ''; }
  }
  function decodeQP(s) {
    return String(s || '')
      .replace(/[ \t]+(\r?\n)/g, '$1')
      .replace(/=\r?\n/g, '')
      .replace(/=([0-9A-Fa-f]{2})/g, function (m, h) { return String.fromCharCode(parseInt(h, 16)); });
  }
  function decodeCTE(body, cte) {
    cte = String(cte || '').trim().toLowerCase();
    if (cte === 'base64') return decodeBase64(body);
    if (cte === 'quoted-printable') return decodeQP(body);
    return body;
  }

  /* ---------- headers ---------- */
  var WORD = /=\?([^?\s]+)\?([BbQq])\?([^?\s]*)\?=/g;
  function decodeWords(v) {
    v = String(v || '');
    // whitespace between two encoded words is not shown
    v = v.replace(/(=\?[^?\s]+\?[BbQq]\?[^?\s]*\?=)\s+(?==\?[^?\s]+\?[BbQq]\?[^?\s]*\?=)/g, '$1');
    return v.replace(WORD, function (m, cs, enc, txt) {
      var bin = enc.toUpperCase() === 'B' ? decodeBase64(txt)
        : txt.replace(/_/g, ' ').replace(/=([0-9A-Fa-f]{2})/g, function (x, h) { return String.fromCharCode(parseInt(h, 16)); });
      return decodeBytes(bin, cs);
    });
  }
  function decodeHeader(v) { return decodeWords(decodeGuess(String(v || ''))).replace(/\s+/g, ' ').trim(); }

  function parseHeaders(block) {
    var lines = String(block || '').split(/\r?\n/), out = {}, cur = null;
    lines.forEach(function (line) {
      if (/^[ \t]/.test(line) && cur) { out[cur] += ' ' + line.trim(); return; }
      var m = line.match(/^([!-9;-~]+):[ \t]?(.*)$/);
      if (!m) { cur = null; return; }
      var k = m[1].toLowerCase();
      if (out[k] != null) { cur = null; return; } // keep the first copy (top-most) of repeated headers
      out[k] = m[2]; cur = k;
    });
    return out;
  }
  function params(v) {
    var out = {}, re = /;\s*([\w*.-]+)\s*=\s*(?:"((?:[^"\\]|\\.)*)"|([^;\s]+))/g, m;
    while ((m = re.exec(String(v || '')))) out[m[1].toLowerCase()] = m[2] != null ? m[2].replace(/\\(.)/g, '$1') : m[3];
    return out;
  }
  function splitHeadBody(raw) {
    var m = /\r?\n\r?\n/.exec(raw);
    if (!m) return { head: raw, body: '' };
    return { head: raw.slice(0, m.index), body: raw.slice(m.index + m[0].length) };
  }
  function parseAddress(v) {
    v = String(v || '').trim();
    var m = v.match(/^(.*?)<([^<>@\s]+@[^<>\s]+)>\s*$/), name = '', email = '';
    if (m) { name = m[1].trim().replace(/^"|"$/g, '').replace(/\\"/g, '"').trim(); email = m[2]; }
    else if ((m = v.match(/([^\s<>()"]+@[^\s<>()"]+)/))) { email = m[1]; name = v.replace(m[0], '').replace(/[()"]/g, '').trim(); }
    else name = v;
    email = email.toLowerCase().replace(/[>.,;]+$/, '');
    return { name: name, email: email, domain: email.split('@')[1] || '' };
  }

  /* ---------- MIME tree ---------- */
  function splitMultipart(body, boundary) {
    var delim = '--' + boundary, lines = body.split(/\r?\n/), parts = [], cur = null;
    for (var i = 0; i < lines.length; i++) {
      var l = lines[i].replace(/[ \t]+$/, '');
      if (l === delim) { if (cur) parts.push(cur.join('\n')); cur = []; continue; }
      if (l === delim + '--') { if (cur) parts.push(cur.join('\n')); cur = null; break; }
      if (cur) cur.push(lines[i]);
    }
    if (cur && cur.length) parts.push(cur.join('\n')); // missing closing boundary
    return parts;
  }
  function parseEntity(raw, depth) {
    if (depth > 12) return [];
    var hb = splitHeadBody(raw), h = parseHeaders(hb.head);
    var ct = h['content-type'] || 'text/plain', type = ct.split(';')[0].trim().toLowerCase(), p = params(ct);
    var disp = h['content-disposition'] || '', dp = params(disp);
    var name = decodeHeader(dp.filename || p.name || '');
    if (type.indexOf('multipart/') === 0) {
      if (!p.boundary) return [{ type: 'text/plain', text: decodeGuess(hb.body) }];
      var parts = splitMultipart(hb.body, p.boundary), out = [];
      parts.forEach(function (pt) { out = out.concat(parseEntity(pt, depth + 1)); });
      return out;
    }
    var data = decodeCTE(hb.body, h['content-transfer-encoding']);
    if (type === 'message/rfc822' && !/attachment/i.test(disp)) return parseEntity(data, depth + 1);
    if (type.indexOf('text/') === 0 && !/^\s*attachment/i.test(disp)) return [{ type: type, text: decodeBytes(data, p.charset || 'utf-8') }];
    return [{ type: type, attachment: true, name: name }];
  }

  /* ---------- HTML to text ---------- */
  var ENT = { nbsp: ' ', amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", pound: '£', euro: '€', rsquo: '’', lsquo: '‘', ldquo: '“', rdquo: '”', ndash: '–', mdash: '—', hellip: '…', copy: '©', reg: '®', trade: '™', bull: '•', middot: '·', zwnj: '', zwj: '', shy: '' };
  function decodeEntities(s) {
    return String(s || '').replace(/&(#x[0-9a-f]+|#\d+|[a-z][a-z0-9]*);?/gi, function (m, e) {
      if (e[0] === '#') {
        var c = e[1] === 'x' || e[1] === 'X' ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10);
        try { return c > 0 && c < 0x110000 ? String.fromCodePoint(c) : ''; } catch (x) { return ''; }
      }
      var k = e.toLowerCase();
      return ENT[k] != null ? ENT[k] : m;
    });
  }
  function htmlLinks(html) {
    var out = [], re = /<a\b[^>]*\bhref\s*=\s*["']?([^"'\s>]+)/gi, m;
    while ((m = re.exec(html)) && out.length < 30) out.push(decodeEntities(m[1]));
    return out;
  }
  function htmlToText(html) {
    var s = String(html || '')
      .replace(/<!--[\s\S]*?-->/g, '')
      .replace(/<(style|script|head|title|noscript|template)\b[\s\S]*?<\/\1\s*>/gi, '')
      .replace(/<br\s*\/?>/gi, '\n')
      .replace(/<li\b[^>]*>/gi, '\n• ')
      .replace(/<\/(p|div|tr|h[1-6]|li|table|section|article|header|footer|blockquote|ul|ol)\s*>/gi, '\n')
      .replace(/<(p|div|tr|h[1-6]|table)\b[^>]*>/gi, '\n')
      .replace(/<\/t[dh]\s*>/gi, '  ')
      .replace(/<[^>]+>/g, '');
    s = decodeEntities(s).replace(/ /g, ' ');
    return tidy(s);
  }
  function tidy(s) {
    return String(s || '').replace(/\r\n?/g, '\n').split('\n').map(function (l) { return l.replace(/[ \t]+/g, ' ').trim(); })
      .join('\n').replace(/\n{3,}/g, '\n\n').trim();
  }
  function textLinks(text) {
    var out = [], re = /\b(?:https?:\/\/|www\.)[^\s<>"')\]]+/gi, m;
    while ((m = re.exec(text)) && out.length < 30) out.push(m[0].replace(/[.,;:]+$/, ''));
    return out;
  }

  /* ---------- whole messages ---------- */
  function looksLikeEml(s) {
    s = String(s || '').replace(/^\s+/, '').slice(0, 6000);
    var hb = splitHeadBody(s), lines = hb.head.split(/\r?\n/);
    if (!/^[!-9;-~]+:/.test(lines[0] || '')) return false;
    var known = lines.filter(function (l) { return /^(from|to|subject|date|received|return-path|delivered-to|mime-version|message-id|content-type|reply-to|sender|cc|x-[\w-]+):/i.test(l); }).length;
    return known >= 2;
  }
  function message(h, text, links, attachments) {
    var from = parseAddress(decodeHeader(h.from || h.sender || '')), reply = parseAddress(decodeHeader(h['reply-to'] || ''));
    var d = h.date ? new Date(decodeHeader(h.date).replace(/\s*\([^)]*\)\s*$/, '')) : null;
    return {
      subject: decodeHeader(h.subject || '').slice(0, 300),
      fromName: from.name.slice(0, 120), fromEmail: from.email.slice(0, 200), domain: from.domain.slice(0, 120),
      replyDomain: reply.domain, date: d && !isNaN(d) ? d.toISOString() : '',
      text: text, links: links || [], attachments: attachments || []
    };
  }
  function parseEml(bin) {
    bin = String(bin || '').replace(/^﻿/, '').replace(/^\s+/, '');
    var hb = splitHeadBody(bin), h = parseHeaders(hb.head);
    var leaves = parseEntity(bin, 0);
    var plain = leaves.filter(function (l) { return l.type === 'text/plain' && !l.attachment && l.text.trim(); });
    var html = leaves.filter(function (l) { return l.type === 'text/html' && !l.attachment && l.text.trim(); });
    var text = plain.map(function (l) { return l.text; }).join('\n\n');
    var links = [];
    html.forEach(function (l) { links = links.concat(htmlLinks(l.text)); });
    if (html.length && tidy(text).length < 40) text = html.map(function (l) { return htmlToText(l.text); }).join('\n\n');
    else if (!plain.length && /<(html|body|div|p|table|br)\b/i.test(text)) text = htmlToText(text);
    text = tidy(text);
    links = links.concat(textLinks(text)).filter(function (x, i, a) { return x && a.indexOf(x) === i && !/^mailto:/i.test(x); }).slice(0, 20);
    var att = leaves.filter(function (l) { return l.attachment; }).map(function (l) { return l.name || l.type; });
    return message(h, text, links, att);
  }
  /* Pasted (or plain .txt) text: a raw email, an HTML email, or just the words of an email or letter. */
  function parseText(str) {
    str = String(str || '').replace(/^﻿/, '');
    if (looksLikeEml(str)) return parseEml(toBinary(str));
    var links = [];
    if (/<(html|body|div|table|p|br)\b[^>]*>/i.test(str) && (str.match(/<[a-z][^>]*>/gi) || []).length > 3) { links = htmlLinks(str); str = htmlToText(str); }
    var text = tidy(str), h = {};
    // copied emails often keep "From:", "Subject:" and "Date:" lines near the top
    text.split('\n').slice(0, 25).forEach(function (l) {
      var m = l.match(/^(from|subject|date|sent|reply-to)\s*:\s*(.+)$/i);
      if (m) { var k = m[1].toLowerCase() === 'sent' ? 'date' : m[1].toLowerCase(); if (h[k] == null) h[k] = m[2]; }
    });
    if (!h.subject) {
      var first = text.split('\n').filter(function (l) { return l.trim() && !/^(from|to|date|sent|cc)\s*:/i.test(l); })[0] || '';
      h.subject = first.length > 90 ? first.slice(0, 87) + '…' : first;
    }
    if (h.date && isNaN(new Date(h.date))) { var pd = parseDateText(h.date); h.date = pd ? pd.toUTCString() : ''; }
    return message(h, text, links.concat(textLinks(text)).filter(function (x, i, a) { return a.indexOf(x) === i; }).slice(0, 20), []);
  }
  function parseMbox(bin) {
    var lines = String(bin || '').split('\n'), msgs = [], cur = [];
    for (var i = 0; i < lines.length; i++) {
      var l = lines[i];
      if (/^From \S/.test(l) && (i === 0 || !lines[i - 1].replace(/\r$/, '').trim())) { if (cur.length) msgs.push(cur.join('\n')); cur = []; continue; }
      cur.push(l.replace(/^>(>*From )/, '$1'));
    }
    if (cur.length) msgs.push(cur.join('\n'));
    return msgs.filter(function (m) { return m.trim(); }).map(function (m) { return looksLikeEml(m) ? parseEml(m) : parseText(decodeGuess(m)); });
  }
  /* A file's bytes → list of messages. Throws an Error with a friendly message for files we can't read. */
  function fromBuffer(buf, name) {
    var bin = bufToBinary(buf), head = bin.slice(0, 4096);
    if (!bin.trim()) throw new Error('This file is empty.');
    if (/^\xD0\xCF\x11\xE0/.test(head)) throw new Error('This looks like an Outlook .msg file, which a browser cannot open. In Outlook choose Save as or Download and pick .eml, or copy the text and paste it below.');
    if (/^%PDF/.test(head)) throw new Error('PDF');
    if ((head.match(/\x00/g) || []).length > 2 || /^(PK\x03\x04|\x89PNG|\xFF\xD8\xFF|GIF8)/.test(head)) throw new Error('This file does not look like an email, letter or text file.');
    if (/^From \S/.test(bin.replace(/^﻿/, '')) || /\.mbox$/i.test(name || '')) {
      var list = parseMbox(bin.replace(/^﻿/, ''));
      if (!list.length) throw new Error('No emails were found in this mailbox file.');
      return list;
    }
    if (looksLikeEml(head)) return [parseEml(bin)];
    return [parseText(decodeGuess(bin))];
  }

  /* ---------- fact extraction ---------- */
  var MONTHS = { jan: 0, feb: 1, mar: 2, apr: 3, may: 4, jun: 5, jul: 6, aug: 7, sep: 8, oct: 9, nov: 10, dec: 11 };
  var MON_RE = '(jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|june?|july?|aug(?:ust)?|sep(?:t(?:ember)?)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)';
  function mkDate(y, m, d) {
    var dt = new Date(y, m, d);
    return dt.getFullYear() === y && dt.getMonth() === m && dt.getDate() === d ? dt : null;
  }
  function iso(d) { return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'); }
  function parseDateText(s) { var f = findDates(String(s || ''), new Date()); return f.length ? f[0].date : null; }

  /* All UK-style dates in the text, with their positions. ref fills in a missing year. */
  function findDates(text, ref) {
    var out = [], m, ref0 = new Date(ref.getFullYear(), ref.getMonth(), ref.getDate());
    function add(i, len, y, mo, d, hasYear) {
      if (!hasYear) {
        y = ref0.getFullYear();
        var t = mkDate(y, mo, d);
        if (t && t < new Date(ref0.getTime() - 30 * 864e5)) y++;
      } else if (y < 100) y += 2000;
      if (y < 1990 || y > 2100) return;
      var dt = mkDate(y, mo, d);
      if (dt) out.push({ index: i, length: len, date: dt, hasYear: hasYear });
    }
    var re1 = new RegExp('\\b(\\d{1,2})(?:st|nd|rd|th)?(?:\\s+of)?[\\s-]+' + MON_RE + '\\.?\\b,?(?:[\\s-]+(\\d{4}))?', 'gi');
    while ((m = re1.exec(text))) add(m.index, m[0].length, m[3] ? +m[3] : 0, MONTHS[m[2].slice(0, 3).toLowerCase()], +m[1], !!m[3]);
    var re2 = new RegExp('\\b' + MON_RE + '\\.?\\s+(\\d{1,2})(?:st|nd|rd|th)?,?\\s+(\\d{4})\\b', 'gi');
    while ((m = re2.exec(text))) add(m.index, m[0].length, +m[3], MONTHS[m[1].slice(0, 3).toLowerCase()], +m[2], true);
    var re3 = /\b(\d{1,2})[\/.-](\d{1,2})[\/.-](\d{4}|\d{2})\b/g;
    while ((m = re3.exec(text))) add(m.index, m[0].length, +m[3], +m[2] - 1, +m[1], true);
    var re4 = /\b(\d{4})-(\d{2})-(\d{2})\b/g;
    while ((m = re4.exec(text))) add(m.index, m[0].length, +m[1], +m[2] - 1, +m[3], true);
    // drop overlaps (keep the longer match)
    out.sort(function (a, b) { return a.index - b.index || b.length - a.length; });
    return out.filter(function (x, i) { return !out.slice(0, i).some(function (y) { return x.index < y.index + y.length && y.index < x.index + x.length && y.length >= x.length; }); });
  }

  function money(s) { var n = parseFloat(String(s).replace(/,/g, '')); return isFinite(n) ? Math.round(n * 100) / 100 : null; }
  function before(text, i, n) { var ls = text.lastIndexOf('\n', i - 1) + 1; return text.slice(Math.max(ls, i - n), i).toLowerCase(); }
  function after(text, i, n) { var s = text.slice(i, i + n), nl = s.indexOf('\n'); return (nl >= 0 ? s.slice(0, nl) : s).toLowerCase(); }

  function findAmounts(text) {
    var out = [], re = /(?:£|\bGBP\s?)\s?(\d{1,3}(?:,\d{3})+|\d+)(\.\d{1,2})?(?![\d,]*\d)|\b(\d{1,3}(?:,\d{3})+|\d+)(\.\d{2})\s?(?:GBP|pounds)\b/gi, m;
    while ((m = re.exec(text))) {
      var v = money((m[1] || m[3]) + (m[2] || m[4] || ''));
      if (v == null || v > 1e8) continue;
      out.push({ value: v, index: m.index, end: m.index + m[0].length, before: before(text, m.index, 70), after: after(text, m.index + m[0].length, 40) });
    }
    return out;
  }

  var FREEMAIL = /^(gmail|googlemail|outlook|hotmail|live|msn|yahoo|ymail|aol|icloud|me|mac|protonmail|proton|gmx|mail|zoho|yandex)\./i;

  function baseName(domain) {
    var parts = String(domain || '').toLowerCase().replace(/^(mail|email|e|em|news|info|notifications?|alerts?|service|mailer|mg|send|reply|bounce)\./, '').split('.');
    if (parts.length < 2) return parts[0] || '';
    var two = /^(co|org|gov|ac|me|ltd|plc|net|nhs|police|sch)$/.test(parts[parts.length - 2]) && parts.length > 2;
    return parts[parts.length - (two ? 3 : 2)];
  }
  function companyName(h, text) {
    var n = String(h.fromName || '').replace(/["']/g, '').replace(/\b(no-?reply|do not reply|donotreply|notifications?|alerts?)\b/gi, '').replace(/[|·•-]+\s*$/, '').trim();
    if (n && !/@/.test(n) && n.length <= 60) return n;
    var b = baseName(h.domain);
    if (b) return b.replace(/[-_]+/g, ' ').replace(/\b\w/g, function (c) { return c.toUpperCase(); });
    // a letter: look for a company-like line near the top
    var all = String(text || '').split('\n').map(function (l) { return l.trim(); }).filter(Boolean);
    var lines = all.slice(-6).reverse().concat(all.slice(0, 12));
    for (var i = 0; i < lines.length; i++) {
      var l = lines[i].replace(/^(thanks|thank you|many thanks|regards|kind regards|best wishes|yours sincerely|yours faithfully|from|sent by)[,:\s]+/i, '').trim();
      if (/^(your|dear|hello|hi|re:|subject|we|this|please|the|to|if)\b/i.test(l) || /\d{3,}/.test(l)) continue;
      if (l.length > 2 && l.length < 50 && /\b(ltd|limited|plc|insurance|energy|power|water|bank|building society|council|mobile|telecom|broadband|finance|card services|hmrc)\b/i.test(l)) return l.replace(/[,.]+$/, '');
    }
    return '';
  }

  function kindOf(low) {
    var K = [
      ['car-insurance', /\b(car|motor|vehicle|van) (insurance|policy|cover)\b|\bmotor insurance\b|\bno claims? (discount|bonus)\b/],
      ['home-insurance', /\b(home|house|buildings|contents|household|landlord) (insurance|policy|cover)\b/],
      ['pet-insurance', /\bpet (insurance|policy|cover)\b/],
      ['travel-insurance', /\btravel (insurance|policy|cover)\b/],
      ['life-insurance', /\b(life|critical illness|income protection) (insurance|cover|policy)\b/],
      ['credit-card', /\bcredit card\b|\bcard statement\b|\bcard ending\b|\bminimum payment\b/],
      ['energy', /\b(energy|electricity|gas) (bill|account|statement|tariff|supply)\b|\bkwh\b|\benergy price cap\b|\bmeter reading\b/],
      ['water', /\bwater (bill|charges|rates|account)\b|\bsewerage\b/],
      ['council-tax', /\bcouncil tax\b/],
      ['mobile', /\b(mobile|phone|sim[- ]only|handset|airtime)\b/],
      ['broadband', /\b(broadband|fibre|wi-?fi|landline|tv package)\b/],
      ['tv-licence', /\btv licen[cs]e\b/],
      ['mortgage', /\bmortgage\b/],
      ['loan', /\b(personal loan|loan agreement|loan account|car finance|hire purchase|pcp)\b/],
      ['subscription', /\b(subscription|membership|streaming|your plan renews|gym)\b/],
      ['insurance', /\binsurance\b|\bpolicy\b/]
    ];
    for (var i = 0; i < K.length; i++) if (K[i][1].test(low)) return K[i][0];
    return '';
  }

  function count(re, s) { var m = s.match(re); return m ? m.length : 0; }

  function classify(low, kind) {
    var s = {
      renewal: Math.min(3, count(/\brenew(al|als|s|ed|ing)?\b/g, low)) * 2 + (/\bauto-?renew|\b(policy|cover) (ends|expires|end date)|\bcontract (ends|end date)|\bend of (your )?(contract|minimum term)|\bexpiry date\b/.test(low) ? 2 : 0) + (/insurance/.test(kind) && /\brenew/.test(low) ? 1 : 0),
      price: (/\bprice (rise|increase|change|changes|is changing|will change|update)|\bprices? (are|is|will be|will) (go(ing)? up|increas|ris|chang)|\b(go|goes|going) up (from|to|by|in)|\bnew (monthly |annual )?price\b|\b(cpi|rpi)\b|\bannual (price )?(rise|increase)\b|\bis increasing\b/.test(low) ? 5 : 0),
      bill: (/\b(bill|statement|invoice)\b/.test(low) ? 3 : 0) + (/\bamount due\b|\bbalance\b|\bminimum payment\b|\bto pay\b/.test(low) ? 2 : 0) + (/direct debit/.test(low) ? 1 : 0),
      due: (/\bpayment (is )?(due|reminder|overdue)|\breminder\b|\boverdue\b|\bfinal notice\b|\bplease pay\b|\bpay by\b|\bdue (on|by)\b|\bunpaid\b|\bmissed payment\b/.test(low) ? 4 : 0),
      payslip: (/\bpayslips?\b|\bpay slip\b|\bnet pay\b|\bgross pay\b|\bp60\b|\bp45\b|\bpay date\b|\bsalary (slip|statement)\b/.test(low) ? 6 : 0),
      tax: (/\bhmrc\b|\bself[- ]assessment\b|\btax return\b|\btax code\b|\btax (refund|rebate)\b|\btax credits?\b|\bhm revenue\b/.test(low) ? 5 : 0),
      pension: (/\bpension\b|\bannual benefit statement\b|\bfund value\b|\bportfolio\b|\binvestment (statement|account|summary)\b|\bstocks and shares isa\b|\bisa statement\b|\bvaluation\b/.test(low) ? 5 : 0)
    };
    if (/statement/.test(low) && s.pension && !/\bpension\b/.test(kind)) s.bill = Math.max(0, s.bill - 2);
    var order = ['payslip', 'price', 'renewal', 'tax', 'pension', 'bill', 'due'], best = 'other', bs = 2;
    order.forEach(function (k) { if (s[k] > bs) { bs = s[k]; best = k; } });
    return best;
  }

  function scamCheck(all, low, h, links, type) {
    var score = 0, reasons = [];
    function add(n, r) { score += n; reasons.push(r); }
    var subjFrom = (String(h.subject || '') + ' ' + String(h.fromName || '')).toLowerCase(), domain = String(h.domain || '').toLowerCase();
    var linkWords = /\b(click|tap|press|follow|use|open)\b[^.\n]{0,25}\b(link|here|below|button)\b|\bclick here\b|\bvisit the (secure )?(link|page|portal) below\b/.test(low);
    var hasLink = linkWords || links.length > 0;
    var urgency = /\burgent(ly)?\b|\bimmediately\b|\bwithin (24|48|72|\d{1,2}) hours\b|\btoday only\b|\bact now\b|\bfinal (warning|notice)\b|\bsuspend(ed)?\b|\bwill be (closed|locked|cancell?ed|blocked|forfeited)\b|\bavoid (penalt|legal|prosecution|arrest)|\bexpires? today\b|\blast chance\b|\bfailure to (respond|act|verify)\b/.test(low);
    var details = /\b(enter|provide|confirm|update|verify|submit|send|give|re-?enter|validate)\b[^.\n]{0,70}\b(bank details|bank account (number|details)|card details|card number|debit card|credit card number|account number|sort code|password|passcode|pin( number)?\b|security code|cvv|cvc|login details|online banking|memorable (word|information)|mother's maiden name|personal details)/.test(low);
    var lure = /\b(tax )?(refund|rebate)\b|\byou are (owed|eligible|entitled)\b|\bunclaimed\b|\byou('ve| have) won\b|\bprize\b|\bcompensation payment\b/.test(low);
    var claimsGov = /\bhmrc\b|\bhm revenue\b|\bgov\.uk\b|\bdvla\b|\bgovernment\b/.test(subjFrom);
    if (urgency) add(1, 'It tries to rush you ("act now", a short deadline or a threat).');
    if (details) add(3, 'It asks for bank, card or login details. Real banks, HMRC and companies never ask for these by email.');
    if (hasLink && (details || lure)) add(1, 'It wants you to click a link to get money or "confirm" something.');
    if (lure) add(1, 'It offers money you were not expecting, like a refund or prize.');
    if (/\bdear (customer|valued customer|client|taxpayer|tax payer|user|sir\/madam|sir or madam|account holder|member)\b/.test(low)) add(1, 'It does not use your name ("Dear customer").');
    if (claimsGov && domain && !/(^|\.)gov\.uk$/.test(domain)) add(3, 'It says it is from HMRC or the government, but the email address does not end in gov.uk.');
    if (domain && FREEMAIL.test(domain) && /(bill|account|payment|refund|insurance|bank|statement|policy|invoice)/.test(low)) add(2, 'It comes from a personal email address (' + domain + '), not a company one.');
    if (h.replyDomain && domain && baseName(h.replyDomain) !== baseName(domain)) add(1, 'Replies would go to a different address (' + h.replyDomain + ').');
    var base = baseName(domain);
    if (base && links.length) {
      var odd = links.filter(function (u) { var host = (u.replace(/^[a-z]+:\/\//i, '').split(/[\/?#:]/)[0] || '').toLowerCase(); return host && host.indexOf(base) < 0 && !/(^|\.)gov\.uk$/.test(host) && !/(unsubscribe|w3\.org)/.test(u); });
      if (odd.length && (details || lure || urgency)) add(1, 'A link goes to a website that does not match the sender (' + (odd[0].replace(/^[a-z]+:\/\//i, '').split(/[\/?#]/)[0]) + ').');
    }
    var hmrc = /\bhmrc\b|\bhm revenue\b/.test(low) && lure && (hasLink || details);
    if (hmrc) score += 2;
    return { score: score, scam: score >= 4, reasons: reasons, hmrc: hmrc };
  }

  function extract(text, h) {
    h = h || {};
    text = String(text || '');
    var subject = String(h.subject || ''), all = subject + '\n' + text, low = all.toLowerCase();
    var ref = h.date ? new Date(h.date) : new Date(); if (isNaN(ref)) ref = new Date();
    var kind = kindOf(low), type = classify(low, kind);
    var links = h.links || textLinks(text);
    var scam = scamCheck(all, low, h, links, type);
    if (scam.scam) type = 'scam';

    /* amounts */
    var amounts = findAmounts(all), oldAmount = null, minPayment = null, balance = null;
    var fromTo = /from\s+£\s?([\d,]+(?:\.\d{1,2})?)\s+to\s+£\s?([\d,]+(?:\.\d{1,2})?)/i.exec(all);
    amounts.forEach(function (a) {
      var b = a.before, sc = 0, near = b.slice(-45);
      if (/(total (amount )?(due|to pay|payable)|amount (due|to pay|payable|outstanding)|\bto pay\b|you owe|(annual|renewal|new|total|yearly|this year'?s?|your|quoted) (insurance )?premium|\bpremium\b[^£]{0,20}$|new (monthly |annual |yearly )?(price|cost|charge|amount)|statement balance|new balance|closing balance|bill (total|amount)|balance (due|to pay)|this (bill|month'?s? bill)|total charges|amount we'?ll (collect|take)|we will (collect|take)|payment of)/.test(near)) sc += 5;
    else if (/(total|due|balance|premium|price|bill|cost|charge|direct debit|pay(ment)?|collect|owe)/.test(near)) sc += 2;
      if (/minimum (payment|amount)/.test(near)) { sc -= 1; if (minPayment == null) minPayment = a.value; }
      if (/(statement|account|outstanding|current|new|closing) balance/.test(near) && balance == null) balance = a.value;
      if (/(last year|previous(ly)?|\bwas\b|\bwere\b|\bold\b|currently|\bsav(e|ing)\b|credit limit|available|\blimit\b|discount|\boff\b|cashback|(rise|increase|change) of|\bup by|\bby\s*$|\bexcess\b|interest charged|\bfee\b|\bfine\b|\bdeposit\b|\bfrom\s*$|\bup to\s*$|over\s*$|less than\s*$|more than\s*$)/.test(near)) sc -= 4;
      if (/(refund|rebate)/.test(near)) sc -= 1;
      if (/^\s*(\(.{0,20}\))?\s*(per|a|each|every|\/)\s*(month|year|annum|quarter)|^\s*(monthly|annually|yearly)/.test(a.after)) sc += 1;
      if (/^\s*(off|discount|saving|cashback)/.test(a.after)) sc -= 3;
      if (/(last year|previous)/.test(a.after.slice(0, 25)) && !/^\s*\)/.test(a.after)) sc -= 0;
      if (a.index < subject.length) sc += 1; // mentioned in the subject
      a.score = sc;
      if (/(last year|previous(ly)?|\bwas\b|\bold\b|currently)/.test(near) && !/balance/.test(near) && oldAmount == null) oldAmount = a.value;
    });
    var best = null;
    amounts.forEach(function (a) { if (!best || a.score > best.score) best = a; });
    var amount = best ? best.value : null;
    if (fromTo) { var o = money(fromTo[1]), n = money(fromTo[2]); if (o != null && n != null && n !== o) { oldAmount = o; if (type === 'price' || !best || best.score < 5) amount = n; } }
    if (oldAmount === amount) oldAmount = null;

    /* dates */
    var dates = findDates(all, ref), due = null, bestDate = -99;
    dates.forEach(function (d) {
      var b = before(all, d.index, 70), near = b.slice(-50), aft = after(all, d.index + d.length, 30), sc = 0;
      if (/(due( date)?|pay(ment)?( date| due)?|pay (it )?by|by|before|no later than|deadline|renew(al|s|ed)?( date)?|expir(es|y|y date)|(policy|cover|contract|plan) ends|ends|end date|collect(ed)?|tak(en|e it)|(direct )?debit(ed)?( on)?|(will|we'll) (be )?(collect|take|charge)|start(s|ing)?|effective|from|on or (after|around)|until)\W*(on|is|date|:)?\W*$/.test(near)) sc += 4;
      else if (/(due|renew|expir|collect|pay|deadline)/.test(near)) sc += 2;
      if (/(statement date|date of (this )?(statement|letter|bill)|issued|sent( on)?|dated|printed|received|letter date|period|between|since|joined|opened|last (paid|payment)|\bto\s*$|\buntil\s*$|-\s*$|–\s*$|born|date of birth)/.test(near)) sc -= 4;
      if (/^\s*(to|until|–|-)\s/.test(aft)) sc -= 3; // start of a date range, like a billing period
      var ref0 = new Date(ref.getFullYear(), ref.getMonth(), ref.getDate());
      if (d.date < ref0) sc -= 3;
      if (d.index < subject.length) sc += 1;
      if (sc > bestDate || (sc === bestDate && due && d.date < due.date)) { bestDate = sc; due = d; }
    });
    if (due && bestDate < 0) due = null;

    /* frequency */
    var frequency = '';
    var around = best ? all.slice(Math.max(0, best.index - 60), best.end + 50).toLowerCase() : '';
    function freqIn(s, strict) {
      if (/\b(per|a|each|every|\/)\s?(month|mth|mo)\b|\bmonthly\b|\bpcm\b/.test(s)) return 'monthly';
      if (/\b(per|a|each|every|\/)\s?(year|yr|annum)\b|\bannual(ly)?\b|\byearly\b|\b12 months'? cover\b/.test(s) && !(strict && /\b(apr|aer)\b/.test(s))) return 'annual';
      if (/\bquarter(ly)?\b|\bevery (3|three) months\b/.test(s)) return 'quarterly';
      if (/\b(per|a|each|every) week\b|\bweekly\b/.test(s)) return 'weekly';
      return '';
    }
    frequency = freqIn(around, true);
    if (!frequency && best && best.score >= 5) frequency = freqIn(best.before + ' ' + best.after, true);
    if (!frequency) {
      if (/insurance/.test(kind) && type === 'renewal') frequency = 'annual';
      else if (/^(energy|mobile|broadband|credit-card|council-tax|mortgage|loan)$/.test(kind)) frequency = 'monthly';
      else if (kind === 'tv-licence') frequency = 'annual';
      else frequency = freqIn(low.replace(/\d+(\.\d+)?\s?%[^\n]{0,15}/g, ''), false);
    }
    if (type === 'scam' || type === 'payslip' || type === 'pension') frequency = type === 'payslip' ? 'monthly' : '';

    /* rates */
    var rates = [], rm, rre = /(\d{1,2}(?:\.\d{1,2})?)\s?%\s*(?:\((?:variable|fixed|representative)\)\s*)?(apr|aer|gross|p\.a\.|a year|interest|variable|fixed)?/gi;
    while ((rm = rre.exec(all)) && rates.length < 4) {
      var ctx = before(all, rm.index, 40), lab = (rm[2] || '').toUpperCase();
      if (!lab) { var c = ctx.match(/\b(apr|aer|interest|rate)\b/); if (!c) continue; lab = c[1] === 'apr' || c[1] === 'aer' ? c[1].toUpperCase() : 'interest'; }
      if (lab === 'P.A.' || lab === 'A YEAR' || lab === 'GROSS' || lab === 'VARIABLE' || lab === 'FIXED' || lab === 'INTEREST') lab = 'interest';
      var r = rm[1] + '% ' + lab;
      if (rates.indexOf(r) < 0) rates.push(r);
    }

    return {
      type: type, kind: kind, company: companyName(h, text),
      amount: amount, oldAmount: oldAmount, minPayment: minPayment, balance: balance,
      dueDate: due ? iso(due.date) : '', frequency: frequency,
      directDebit: /direct debit/i.test(all), rates: rates,
      scamReasons: scam.reasons, scamScore: scam.score, hmrcWarning: scam.hmrc
    };
  }

  window.InboxParse = {
    parseEml: parseEml, parseMbox: parseMbox, parseText: parseText, fromBuffer: fromBuffer,
    decodeHeader: decodeHeader, decodeWords: decodeWords, decodeQP: decodeQP, decodeBase64: decodeBase64,
    htmlToText: htmlToText, looksLikeEml: looksLikeEml, toBinary: toBinary, findDates: findDates,
    extract: extract
  };
})();
