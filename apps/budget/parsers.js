/* Budget from statements: file parsers and categoriser (window.BudgetParsers).
   Everything here works on text already read on this device. Nothing is sent anywhere.
   Each parser returns plain transactions: { date: 'YYYY-MM-DD', desc: 'TESCO STORES', amount: -12.5 }
   (money out is negative, money in is positive). */
window.BudgetParsers = (function () {
  'use strict';

  var MONTHS = { jan: 0, feb: 1, mar: 2, apr: 3, may: 4, jun: 5, jul: 6, aug: 7, sep: 8, oct: 9, nov: 10, dec: 11 };

  function pad(n) { return String(n).padStart(2, '0'); }
  function iso(y, m, d) {
    var dt = new Date(y, m, d);
    if (isNaN(dt) || dt.getFullYear() !== y || dt.getMonth() !== m || dt.getDate() !== d) return null;
    if (y < 1990 || y > 2100) return null;
    return y + '-' + pad(m + 1) + '-' + pad(d);
  }

  /* "£1,234.56", "-12.30", "(12.30)", "12.30 DR", "12.30CR", "−4.00" → number, or null when it is not an amount. */
  function amount(s) {
    if (typeof s === 'number') return isFinite(s) ? s : null;
    s = String(s == null ? '' : s).trim();
    if (!s) return null;
    var neg = false;
    if (/^\(.*\)$/.test(s)) { neg = true; s = s.slice(1, -1).trim(); }
    if (/\s*DR\.?$/i.test(s)) { neg = !neg; s = s.replace(/\s*DR\.?$/i, ''); }
    else if (/\s*CR\.?$/i.test(s)) s = s.replace(/\s*CR\.?$/i, '');
    s = s.replace(/GBP/ig, '').replace(/[£$€Â\uFFFD\s,]/g, '').replace(/[−–—]/g, '-');
    if (/^\+/.test(s)) s = s.slice(1);
    if (/^-/.test(s)) { neg = !neg; s = s.slice(1); }
    if (/-$/.test(s)) { neg = !neg; s = s.slice(0, -1); }
    if (/^\(.*\)$/.test(s)) { neg = !neg; s = s.slice(1, -1); }
    if (!/^(\d+\.?\d*|\.\d+)$/.test(s)) return null;
    var n = parseFloat(s);
    if (!isFinite(n) || n > 1e9) return null;
    n = Math.round(n * 100) / 100;
    return neg ? -n : n;
  }

  /* UK dates: 31/01/2026, 31-01-26, 31 Jan 2026, 2026-01-31, 20260131. `us` reads 01/31/2026 instead. */
  function date(s, us) {
    s = String(s == null ? '' : s).trim().replace(/'/g, '/');
    var m;
    if ((m = s.match(/^(\d{4})(\d{2})(\d{2})/))) return iso(+m[1], +m[2] - 1, +m[3]);
    if ((m = s.match(/^(\d{4})[-\/.](\d{1,2})[-\/.](\d{1,2})/))) return iso(+m[1], +m[2] - 1, +m[3]);
    if ((m = s.match(/^(\d{1,2})[-\/.](\d{1,2})[-\/.](\d{2,4})\b/))) {
      var y = +m[3]; if (y < 100) y += 2000;
      return us ? iso(y, +m[1] - 1, +m[2]) : iso(y, +m[2] - 1, +m[1]);
    }
    if ((m = s.match(/^(\d{1,2})(?:st|nd|rd|th)?[\s\-]+([A-Za-z]{3,9})\.?[\s\-,]+(\d{2,4})\b/))) {
      var mo = MONTHS[m[2].slice(0, 3).toLowerCase()], yy = +m[3]; if (yy < 100) yy += 2000;
      if (mo != null) return iso(yy, mo, +m[1]);
    }
    if ((m = s.match(/^([A-Za-z]{3,9})\.?\s+(\d{1,2}),?\s+(\d{4})\b/))) {
      var mo2 = MONTHS[m[1].slice(0, 3).toLowerCase()];
      if (mo2 != null) return iso(+m[3], mo2, +m[2]);
    }
    // fall back to the shared parser for anything else it knows
    if (window.MP && MP.parseDate) {
      var d = MP.parseDate(s);
      if (d && !isNaN(d)) return iso(d.getFullYear(), d.getMonth(), d.getDate());
    }
    return null;
  }

  function clean(s) { return String(s == null ? '' : s).replace(/&amp;/gi, '&').replace(/&lt;/gi, '<').replace(/&gt;/gi, '>').replace(/\s+/g, ' ').trim(); }

  /* ---------- CSV ---------- */
  function classify(cell) {
    var c = String(cell || '').toLowerCase().replace(/[^a-z ]/g, ' ').replace(/\s+/g, ' ').trim();
    if (!c) return null;
    if (/balance/.test(c)) return { k: 'balance' };
    if (/\bdate\b|^posted|^when$/.test(c)) return { k: 'date' };
    if (/paid out|money out|debit|withdrawal|^out$|spent|^payments?$/.test(c)) return { k: 'out' };
    if (/paid in|money in|credit|deposit|^in$|received|receipts?/.test(c)) return { k: 'in' };
    if (/amount|^value$|^sum$|^gbp$/.test(c)) return { k: 'amount' };
    if (/description|details|narrative|payee|merchant|counter ?party/.test(c)) return { k: 'desc', s: 3 };
    if (/^name$|^memo$|transaction description|^particulars$/.test(c)) return { k: 'desc', s: 2 };
    if (/reference|^transaction$|^type$|transaction type/.test(c)) return { k: 'desc', s: 1 };
    return null;
  }

  /* Look at the first rows for a heading row. Returns {headerRow, date, desc, amount, out, in, balance} or null. */
  function detectColumns(rows) {
    for (var r = 0; r < Math.min(rows.length, 15); r++) {
      var map = { headerRow: r, date: -1, desc: -1, amount: -1, out: -1, in: -1, balance: -1 }, best = 0;
      rows[r].forEach(function (cell, i) {
        var c = classify(cell);
        if (!c) return;
        if (c.k === 'desc') { if (c.s > best) { best = c.s; map.desc = i; } }
        else if (map[c.k] === -1) map[c.k] = i;
      });
      if (map.date >= 0 && map.desc >= 0 && (map.amount >= 0 || map.out >= 0 || map.in >= 0)) return map;
    }
    return null;
  }

  /* Best guess at columns when there is no heading row, used to prefill the column chooser. */
  function guessColumns(rows) {
    var sample = rows.slice(0, 30), cols = Math.max.apply(null, sample.map(function (r) { return r.length; }).concat([0]));
    var g = { headerRow: -1, date: -1, desc: -1, amount: -1, out: -1, in: -1, balance: -1 }, nums = [], textLen = [];
    for (var i = 0; i < cols; i++) {
      var d = 0, n = 0, len = 0, filled = 0;
      sample.forEach(function (r) {
        var v = r[i]; if (v == null || String(v).trim() === '') return;
        filled++;
        if (date(v)) d++;
        else if (amount(v) != null) n++;
        else len += String(v).length;
      });
      if (g.date < 0 && filled && d / filled >= 0.7) g.date = i;
      else if (filled && n / filled >= 0.7) nums.push(i);
      textLen[i] = len;
    }
    var bestText = -1;
    textLen.forEach(function (l, i) { if (i !== g.date && nums.indexOf(i) < 0 && (bestText < 0 || l > textLen[bestText])) bestText = i; });
    g.desc = bestText;
    if (nums.length) g.amount = nums[0];
    if (nums.length > 1) g.balance = nums[nums.length - 1];
    if (rows.length && rows[0].some(function (c) { return classify(c); }) && !date(rows[0][g.date])) g.headerRow = 0;
    return g;
  }

  /* Turn CSV rows into transactions with a column map. */
  function rowsToTx(rows, map) {
    var out = [];
    for (var r = map.headerRow + 1; r < rows.length; r++) {
      var row = rows[r], d = date(row[map.date]);
      if (!d) continue;
      var amt = null;
      if (map.amount >= 0) amt = amount(row[map.amount]);
      if (amt == null && (map.out >= 0 || map.in >= 0)) {
        var o = map.out >= 0 ? amount(row[map.out]) : null, i = map.in >= 0 ? amount(row[map.in]) : null;
        if (o != null || i != null) amt = Math.round(((i ? Math.abs(i) : 0) - (o ? Math.abs(o) : 0)) * 100) / 100;
      }
      if (amt == null || amt === 0) continue;
      if (map.flip) amt = -amt;
      var desc = clean(row[map.desc]);
      if (!desc) desc = 'No description';
      out.push({ date: d, desc: desc.slice(0, 140), amount: amt });
    }
    return out;
  }

  function parseCSV(text, map) {
    var rows = window.MP && MP.csv ? MP.csv.parse(text) : text.split(/\r?\n/).map(function (l) { return l.split(','); });
    if (!rows.length) return { kind: 'csv', tx: [], error: 'This file is empty.' };
    var found = map || detectColumns(rows);
    if (!found) return { kind: 'csv', needsMap: true, rows: rows, guess: guessColumns(rows) };
    var tx = rowsToTx(rows, found);
    if (!tx.length && !map) return { kind: 'csv', needsMap: true, rows: rows, guess: guessColumns(rows) };
    return { kind: 'csv', tx: tx, map: found };
  }

  /* ---------- OFX / QFX (SGML or XML) ---------- */
  function parseOFX(text) {
    var blocks = String(text).split(/<STMTTRN>/i).slice(1), tx = [];
    blocks.forEach(function (b) {
      b = b.split(/<\/STMTTRN>/i)[0];
      function f(tag) { var m = b.match(new RegExp('<' + tag + '>\\s*([^<\\r\\n]*)', 'i')); return m ? clean(m[1]) : ''; }
      var d = date(f('DTPOSTED') || f('DTUSER')), a = amount(f('TRNAMT'));
      if (!d || a == null || a === 0) return;
      var name = f('NAME') || f('PAYEE'), memo = f('MEMO');
      var desc = name && memo && memo.toUpperCase().indexOf(name.toUpperCase()) < 0 && name.toUpperCase().indexOf(memo.toUpperCase()) < 0 ? name + ' ' + memo : (memo.length > name.length ? memo : name);
      tx.push({ date: d, desc: (desc || 'No description').slice(0, 140), amount: a });
    });
    return { kind: 'ofx', tx: tx };
  }

  /* ---------- QIF ---------- */
  function parseQIF(text) {
    var recs = [], cur = {};
    String(text).split(/\r?\n/).forEach(function (line) {
      if (!line) return;
      var c = line[0], v = line.slice(1).trim();
      if (c === '^') { if (cur.D) recs.push(cur); cur = {}; }
      else if (c === 'D') cur.D = v;
      else if (c === 'T' || (c === 'U' && cur.T == null)) cur.T = v;
      else if (c === 'P') cur.P = v;
      else if (c === 'M') cur.M = v;
    });
    if (cur.D) recs.push(cur);
    // US-style month/day files have a "day" bigger than 12 in the second position
    var us = recs.some(function (r) { var m = String(r.D).replace(/'/g, '/').match(/^(\d{1,2})[\/.-](\d{1,2})/); return m && +m[2] > 12; });
    var tx = [];
    recs.forEach(function (r) {
      var d = date(String(r.D).replace(/\s+/g, ''), us), a = amount(r.T);
      if (!d || a == null || a === 0) return;
      tx.push({ date: d, desc: clean(r.P || r.M || 'No description').slice(0, 140), amount: a });
    });
    return { kind: 'qif', tx: tx };
  }

  /* ---------- PDF text (best effort) ---------- */
  var AMT = '\\(?[-\\u2212]?£?\\d{1,3}(?:,\\d{3})*\\.\\d{2}\\)?(?:\\s?(?:CR|DR|-))?';
  var DATE_RE = '(\\d{1,2}[\\/.-]\\d{1,2}[\\/.-]\\d{2,4}|\\d{1,2}(?:st|nd|rd|th)?\\s+[A-Za-z]{3,9}\\.?(?:\\s+\\d{4}|\\s+\\d{2}(?=\\s))?)';
  var LINE_DATED = new RegExp('^' + DATE_RE + '\\s+(.+?)\\s+(' + AMT + ')(?:\\s+(' + AMT + '))?\\s*$');
  var LINE_UNDATED = new RegExp('^([A-Za-z].*?)\\s+(' + AMT + ')(?:\\s+(' + AMT + '))?\\s*$');
  var SKIP = /brought forward|carried forward|opening balance|closing balance|^total|statement|page \d|balance on|sort code|account number|overdraft limit/i;
  var CREDIT_WORDS = /salary|wages|payroll|refund|interest paid|credit|transfer from|from savings|hmrc|dwp|benefit|bgc|deposit|paid in|cashback/i;

  function parsePDFText(pages) {
    var text = (Array.isArray(pages) ? pages : [String(pages || '')]).join('\n');
    var years = {}, yearGuess = new Date().getFullYear();
    (text.match(/\b20\d\d\b/g) || []).forEach(function (y) { years[y] = (years[y] || 0) + 1; });
    var top = Object.keys(years).sort(function (a, b) { return years[b] - years[a]; })[0];
    if (top) yearGuess = +top;
    var tx = [], lastDate = null, prevBal = null;
    function pdfDate(s) {
      var d = date(s);
      if (d) return d;
      var m = String(s).match(/^(\d{1,2})(?:st|nd|rd|th)?\s+([A-Za-z]{3,9})/);
      if (m && MONTHS[m[2].slice(0, 3).toLowerCase()] != null) return iso(yearGuess, MONTHS[m[2].slice(0, 3).toLowerCase()], +m[1]);
      return null;
    }
    text.split(/\r?\n/).forEach(function (raw) {
      var line = raw.replace(/\s+/g, ' ').trim(), m, d = null, desc, a1, a2;
      if (!line) return;
      if (SKIP.test(line)) {
        var bal = line.match(new RegExp('(' + AMT + ')\\s*$'));
        if (/brought forward|opening balance|balance on/i.test(line) && bal) prevBal = amount(bal[1]);
        return;
      }
      if ((m = line.match(LINE_DATED))) { d = pdfDate(m[1]); desc = m[2]; a1 = m[3]; a2 = m[4]; }
      if (!d && lastDate && (m = line.match(LINE_UNDATED)) && /[A-Za-z]{2}/.test(m[1])) { d = lastDate; desc = m[1]; a1 = m[2]; a2 = m[3]; }
      if (!d) return;
      lastDate = d;
      var amt = amount(String(a1).replace(/-$/, ' DR')), explicit = /^[(\-−]|DR$|-$/.test(String(a1).trim()), credit = /CR$/.test(String(a1).trim());
      if (amt == null || amt === 0) return;
      var bal2 = a2 != null ? amount(a2) : null, abs = Math.abs(amt);
      if (bal2 != null && prevBal != null && Math.abs(Math.abs(bal2 - prevBal) - abs) < 0.011) amt = bal2 >= prevBal ? abs : -abs;
      else if (!explicit) amt = credit || CREDIT_WORDS.test(desc) ? abs : -abs;
      if (bal2 != null) prevBal = bal2;
      tx.push({ date: d, desc: clean(desc).slice(0, 140), amount: amt });
    });
    return { kind: 'pdf', tx: tx };
  }

  /* ---------- which parser? ---------- */
  function kindOf(name, text) {
    var ext = String(name || '').toLowerCase().split('.').pop(), head = String(text || '').slice(0, 2000);
    if (ext === 'pdf' || /^%PDF/.test(head)) return 'pdf';
    if (ext === 'ofx' || ext === 'qfx' || /<OFX>|<STMTTRN>|OFXHEADER/i.test(head)) return 'ofx';
    if (ext === 'qif' || /^\s*!Type:/i.test(head)) return 'qif';
    if (/^PK\u0003\u0004/.test(head) || ext === 'xlsx' || ext === 'xls') return 'excel';
    if (/\u0000/.test(head)) return 'binary';
    return 'csv';
  }

  /* ---------- merchants and categories ---------- */
  var CATS = ['Groceries', 'Eating out & takeaway', 'Transport', 'Bills & utilities', 'Housing', 'Subscriptions', 'Shopping',
    'Entertainment', 'Health & fitness', 'Cash', 'Transfers & savings', 'Income', 'Other'];

  var PREFIX = /^(CARD PAYMENT TO|CARD PURCHASE|CONTACTLESS( PAYMENT)?|PURCHASE|PAYMENT TO|BILL PAYMENT( TO)?|DIRECT DEBIT( TO)?|DIRECT DEBIT PAYMENT TO|STANDING ORDER( TO)?|FASTER PAYMENTS?( TO| RECEIVED| FROM)?|CREDIT FROM|POS|VIS|VISA|DEB|DD|SO|BGC|FPI|FPO|BP|CPT|TFR|CHQ|DR|CR|ONLINE PAYMENT( TO)?)\b[\s:.\-]*/;
  /* A short, stable name for a merchant: "CARD PAYMENT TO TESCO STORES 3021 ON 02 MAR" → "TESCO STORES" */
  function merchant(desc) {
    var s = String(desc || '').toUpperCase().replace(/[*#|]/g, ' ').replace(/\s+/g, ' ').trim();
    for (var i = 0; i < 4; i++) { var t = s.replace(PREFIX, ''); if (t === s) break; s = t; }
    s = s.replace(/\bON \d{1,2}[ \/-]?[A-Z]{0,9}.*$/, '').replace(/(^|\s)(GBR|GB|UK|LTD|LIMITED|PLC)(?=\s|$)/g, ' ')
      .replace(/\b\S*\d\S*\b/g, ' ').replace(/[^A-Z&'.\/ \-]/g, ' ').replace(/(^|\s)[.\-\/]+(?=\s|$)/g, ' ').replace(/\s+/g, ' ').trim();
    var words = s.split(' ').filter(Boolean);
    return words.slice(0, 2).join(' ') || String(desc || '').toUpperCase().slice(0, 20).trim() || 'UNKNOWN';
  }

  var RULES = [
    ['Cash', /\b(ATM|CASHPOINT|CASH WITHDRAWAL|CASH MACHINE|NOTEMACHINE|LINK ATM)\b|^CASH\b/],
    ['Income', /\b(SALARY|WAGES|PAYROLL|HMRC|DWP|CHILD BENEFIT|UNIVERSAL CREDIT|PENSION PAYMENT|DIVIDEND|CASHBACK)\b/, 'in'],
    ['Transfers & savings', /\b(TRANSFER|TFR|SAVINGS?|SAVER|ISA|TO A\/C|FROM A\/C|POT|MONEYBOX|CHIP|PLUM|PREMIUM BONDS|NS&I|INVESTMENTS?|OWN ACCOUNT|REVOLUT|MONZO|STARLING)\b/],
    ['Income', /\b(REFUND|INTEREST|PAY|BGC|REIMBURSE\w*|COMPENSATION)\b/, 'in'],
    ['Subscriptions', /NETFLIX|SPOTIFY|DISNEY|AMAZON PRIME|PRIME VIDEO|APPLE\.COM|ITUNES|GOOGLE (STORAGE|ONE|PLAY)|YOUTUBE|NOW ?TV|PARAMOUNT|AUDIBLE|KINDLE UNLIM|PATREON|MICROSOFT|XBOX|PLAYSTATION|ADOBE|DROPBOX|ICLOUD|CHATGPT|OPENAI|DUOLINGO|HEADSPACE|\bCALM\b|SUBSCRIPTION|MEMBERSHIP/],
    ['Housing', /\b(RENT|LETTINGS?|LANDLORD|MORTGAGE|GROUND RENT|SERVICE CHARGE|ESTATE AGENTS?|OPENRENT|HOUSING ASSOC\w*)\b/],
    ['Bills & utilities', /COUNCIL|ENERGY|ELECTRIC|\bGAS\b|BRITISH GAS|OCTOPUS|\bEDF\b|E\.ON|EON NEXT|\bOVO\b|SCOTTISH POWER|\bSSE\b|WATER\b|TV LICEN[CS]|\bBT\b|BT GROUP|\bSKY\b|VIRGIN MEDIA|TALKTALK|PLUSNET|HYPEROPTIC|BROADBAND|VODAFONE|\bEE\b|\bO2\b|GIFFGAFF|TESCO MOBILE|LEBARA|LYCAMOBILE|SMARTY|VOXI|ID MOBILE|MOBILE|INSURANCE|AVIVA|DIRECT LINE|ADMIRAL|OVERDRAFT|BANK CHARGE|ACCOUNT FEE/],
    ['Groceries', /TESCO|SAINSBURY|\bASDA\b|MORRISONS|\bALDI\b|\bLIDL\b|WAITROSE|\bCO-?OP\b|CO OP|ICELAND|M&S FOOD|M ?& ?S SIMPLY|SIMPLY FOOD|OCADO|FARMFOODS|\bSPAR\b|BUDGENS|COSTCO|BOOTHS|GROCER|SUPERMARKET|BUTCHER|BAKERY/],
    ['Eating out & takeaway', /\bPRET\b|COSTA|STARBUCKS|CAFFE NERO|GREGGS|MCDONALD|\bKFC\b|BURGER KING|NANDO|WAGAMAMA|PIZZA|DOMINO|DELIVEROO|JUST ?EAT|UBER ?\*? ?EATS|\bLEON\b|\bITSU\b|WASABI|SUBWAY|FIVE GUYS|TOBY CARVERY|WETHERSPOON|\bPUB\b|RESTAURANT|\bCAFE\b|COFFEE|TAKEAWAY|\bBAR\b|\bGRILL\b|DINER|KEBAB|CHIPPY|FISH & CHIPS/],
    ['Transport', /\bTFL\b|TRANSPORT FOR|TRAINLINE|NATIONAL RAIL|\bLNER\b|AVANTI|\bGWR\b|NORTHERN RAIL|SOUTHERN RAIL|SOUTHEASTERN|THAMESLINK|SCOTRAIL|\bUBER\b|\bBOLT\b|ADDISON LEE|STAGECOACH|ARRIVA|FIRST BUS|NATIONAL EXPRESS|MEGABUS|\bSHELL\b|\bBP\b|\bESSO\b|TEXACO|PETROL|\bFUEL\b|PARKING|RINGGO|PAYBYPHONE|\bNCP\b|DVLA|CONGESTION|ULEZ|DART CHARGE|EASYJET|RYANAIR|BRITISH AIRWAYS|\bJET2\b|ZIPCAR|\bTAXI\b|\bRAIL\b|\bBUS\b/],
    ['Health & fitness', /\bGYM\b|PUREGYM|PURE GYM|DAVID LLOYD|NUFFIELD|VIRGIN ACTIVE|BANNATYNE|ANYTIME FITNESS|\bBETTER\b|LEISURE|FITNESS|\bBOOTS\b|SUPERDRUG|PHARMACY|CHEMIST|DENTAL|DENTIST|OPTICIAN|SPECSAVERS|VISION EXPRESS|\bNHS\b|PRESCRIPTION|PHYSIO|HOLLAND & BARRETT|YOGA/],
    ['Entertainment', /CINEMA|ODEON|\bVUE\b|CINEWORLD|PICTUREHOUSE|EVERYMAN|TICKETMASTER|SEETICKETS|EVENTIM|THEATRE|\bSTEAM\b|NINTENDO|BOWLING|CONCERT|MUSEUM|\bZOO\b|NATIONAL TRUST|LOTTERY|BET365|PADDY POWER|SKY BET|FESTIVAL|GOLF/],
    ['Shopping', /AMAZON|\bAMZN|EBAY|ARGOS|JOHN LEWIS|\bNEXT\b|PRIMARK|\bZARA\b|H ?& ?M\b|UNIQLO|\bASOS\b|BOOHOO|CURRYS|\bIKEA\b|B ?& ?Q\b|WICKES|HOMEBASE|DUNELM|TK ?MAXX|SPORTS DIRECT|JD SPORTS|WHSMITH|WATERSTONES|APPLE STORE|SHEIN|\bETSY\b|PAYPAL|MATALAN|SAVERS|POUNDLAND|B ?& ?M\b|THE WORKS|HOBBYCRAFT|SCREWFIX|TOOLSTATION|MARKS ?& ?SPENCER|\bM ?& ?S\b|DEBENHAMS|SELFRIDGES|SHOP|STORE/]
  ];

  /* Category for one transaction. Custom rules ({MERCHANT: category}) win over the built-in keywords. */
  function categorise(desc, amt, custom) {
    var key = merchant(desc);
    if (custom && custom[key] && CATS.indexOf(custom[key]) >= 0) return custom[key];
    var s = String(desc || '').toUpperCase();
    for (var i = 0; i < RULES.length; i++) {
      var r = RULES[i];
      if (r[2] === 'in' && !(amt > 0)) continue;
      if (r[1].test(s)) return r[0];
    }
    return amt > 0 ? 'Income' : 'Other';
  }

  /* Key used to spot the same transaction imported twice. */
  function txKey(t) { return t.date + '|' + (+t.amount).toFixed(2) + '|' + String(t.desc || '').toUpperCase().replace(/[^A-Z0-9]/g, ''); }

  /* Parse any supported text file. PDFs are handled by the caller (they need MP.files.pdfText first). */
  function parseText(name, text, map) {
    var kind = kindOf(name, text);
    if (kind === 'excel') return { kind: kind, tx: [], error: 'This looks like an Excel file. Open it in Excel or Google Sheets and save it as CSV, then add the CSV here.' };
    if (kind === 'binary' || kind === 'pdf') return { kind: kind, tx: [], error: 'We could not read this file. Use a CSV, OFX, QFX, QIF or PDF statement.' };
    if (kind === 'ofx') return parseOFX(text);
    if (kind === 'qif') return parseQIF(text);
    return parseCSV(text, map);
  }

  return {
    CATS: CATS, amount: amount, date: date, kindOf: kindOf, detectColumns: detectColumns, guessColumns: guessColumns, rowsToTx: rowsToTx,
    parseCSV: parseCSV, parseOFX: parseOFX, parseQIF: parseQIF, parsePDFText: parsePDFText, parseText: parseText,
    merchant: merchant, categorise: categorise, txKey: txKey
  };
})();
