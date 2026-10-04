/* Budget from statements: sample data.
   window.BUDGET_SAMPLE() returns a realistic UK current-account statement as CSV text for the last
   three full months (salary, rent, council tax, energy, food shops, travel, subscriptions...).
   It goes through the same CSV reader as a real file. The people and figures are made up. */
window.BUDGET_SAMPLE = function () {
  'use strict';
  var seed = 42;
  function rnd() { seed = (seed * 16807) % 2147483647; return (seed - 1) / 2147483646; }
  function between(a, b) { return Math.round((a + rnd() * (b - a)) * 100) / 100; }
  function pad(n) { return String(n).padStart(2, '0'); }

  var now = new Date(), rows = [];
  for (var k = 3; k >= 1; k--) {
    var first = new Date(now.getFullYear(), now.getMonth() - k, 1), y = first.getFullYear(), m = first.getMonth();
    var days = new Date(y, m + 1, 0).getDate();
    var add = function (day, desc, amt) { rows.push({ d: new Date(y, m, Math.min(day, days)), desc: desc, amt: amt }); };
    // regular money in and out
    add(28, 'BGC NORTHGATE LOGISTICS LTD SALARY', 2780.00);
    add(1, 'STANDING ORDER TO CITY LETTINGS RENT', -1050.00);
    add(1, 'DD BRISTOL CITY COUNCIL TAX', -148.00);
    add(2, 'STANDING ORDER TO SAVINGS ACCOUNT', -250.00);
    add(2, 'DD PUREGYM MONTHLY', -24.99);
    add(4, 'ENERGY SUPPLIER DD', -96.00);
    add(6, 'DD WESSEX WATER', -34.50);
    add(8, 'DD BT GROUP PLC BROADBAND', -32.99);
    add(9, 'DD VODAFONE MOBILE', -16.00);
    add(10, 'NETFLIX.COM', -10.99);
    add(14, 'SPOTIFY UK', -11.99);
    add(15, 'DD TV LICENCE MBP', -14.54);
    // food shops
    [3, 10, 17, 24].forEach(function (d) { add(d, 'CARD PAYMENT TO TESCO STORES 2041 ON ' + pad(d), -between(38, 72)); });
    [7, 21].forEach(function (d) { add(d, "SAINSBURY'S S/MKT", -between(22, 48)); });
    [12, 26].forEach(function (d) { add(d, 'ALDI 84 BRISTOL', -between(18, 35)); });
    // eating out
    [5, 9, 13, 16, 20, 27].forEach(function (d) { add(d, 'PRET A MANGER', -between(3.95, 8.5)); });
    [11, 25].forEach(function (d) { add(d, 'DELIVEROO', -between(17, 28)); });
    // travel
    [3, 5, 8, 12, 15, 18, 19, 22, 24, 29].forEach(function (d) { add(d, 'TFL TRAVEL CH', -between(2.8, 8.1)); });
    add(18, 'TRAINLINE.COM', -between(29, 64));
    // shopping, fun, health, cash
    add(6, 'AMAZON.CO.UK*' + Math.floor(rnd() * 9e5 + 1e5).toString(36).toUpperCase(), -between(9, 45));
    add(20, 'AMZN MKTP UK', -between(8, 30));
    if (k !== 2) add(23, 'ODEON CINEMAS', -between(11, 19));
    add(13, 'BOOTS 1182', -between(4, 15));
    add(19, 'ATM WITHDRAWAL HIGH ST', -[40, 60, 20][k - 1]);
  }
  rows.sort(function (a, b) { return a.d - b.d; });
  var bal = 1240.15, lines = [['Date', 'Type', 'Description', 'Paid out', 'Paid in', 'Balance']];
  rows.forEach(function (r) {
    bal = Math.round((bal + r.amt) * 100) / 100;
    var type = /^DD |DD$/.test(r.desc) ? 'DD' : /^STANDING/.test(r.desc) ? 'SO' : /^BGC/.test(r.desc) ? 'BGC' : /ATM/.test(r.desc) ? 'CPT' : 'DEB';
    lines.push([pad(r.d.getDate()) + '/' + pad(r.d.getMonth() + 1) + '/' + r.d.getFullYear(), type, r.desc,
      r.amt < 0 ? (-r.amt).toFixed(2) : '', r.amt > 0 ? r.amt.toFixed(2) : '', bal.toFixed(2)]);
  });
  return lines.map(function (l) { return l.map(function (c) { return /[",]/.test(c) ? '"' + c.replace(/"/g, '""') + '"' : c; }).join(','); }).join('\n');
};
