/* Money inbox: five made-up sample emails, written as raw .eml text so the real parser reads them.
   All companies are fictional. Dates are set relative to today so the countdowns look real. */
(function () {
  'use strict';
  var now = new Date();
  function plusDays(n) { var d = new Date(now); d.setDate(d.getDate() + n); return d; }
  function plusMonths(n) { var d = new Date(now.getFullYear(), now.getMonth() + n, 1), last = new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate(); d.setDate(Math.min(now.getDate(), last)); return d; }
  function longDate(d) { return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' }); }
  function slashDate(d) { return String(d.getDate()).padStart(2, '0') + '/' + String(d.getMonth() + 1).padStart(2, '0') + '/' + d.getFullYear(); }
  function monthYear(d) { return d.toLocaleDateString('en-GB', { month: 'long', year: 'numeric' }); }
  function sent(daysAgo) { return plusDays(-daysAgo).toUTCString().replace('GMT', '+0000'); }
  function utf8(s) { return unescape(encodeURIComponent(s)); }
  function b64(s) { return btoa(utf8(s)).replace(/.{76}/g, '$&\r\n'); }
  // quoted-printable for a given charset ('utf-8' or 'latin1')
  function qp(s, latin1) {
    var bytes = latin1 ? s : utf8(s), out = '', line = '';
    for (var i = 0; i < bytes.length; i++) {
      var ch = bytes[i], c = ch.charCodeAt(0), tok;
      if (ch === '\n') { out += line + '\r\n'; line = ''; continue; }
      tok = (c > 126 || c === 61) ? '=' + ('0' + c.toString(16).toUpperCase()).slice(-2) : ch;
      if (line.length + tok.length > 75) { out += line + '=\r\n'; line = ''; }
      line += tok;
    }
    return out + line;
  }

  var renewal = plusMonths(5);
  var lastMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1), lastMonthEnd = new Date(now.getFullYear(), now.getMonth(), 0);
  var april = new Date(now.getMonth() >= 3 ? now.getFullYear() + 1 : now.getFullYear(), 3, 1);

  var carText = 'Dear Priya,\n\nYour car insurance with Brightside Insurance is due for renewal on ' + longDate(renewal) + '.\n\n' +
    'Vehicle: Ford Fiesta (AB12 CDE)\nCover: Comprehensive\n\n' +
    'Your renewal premium: £640.00 a year\nLast year you paid: £512.40\n\n' +
    'Your premium has gone up because repair costs and claims in your area have risen.\n\n' +
    'Your policy is set to auto-renew. If you pay monthly by Direct Debit, you will pay 12 instalments of £56.32 (representative APR 22.9%).\n\n' +
    'You do not need to do anything if you are happy to renew. To make changes, log in to your account at https://www.brightside-insurance.example/account or call the number on your policy documents.\n\n' +
    'Brightside Insurance\n(This is a made-up sample email.)';
  var carHtml = '<html><body><p>Dear Priya,</p><p>Your car insurance with Brightside Insurance is due for renewal on <b>' + longDate(renewal) + '</b>.</p>' +
    '<p>Your renewal premium: <b>&pound;640.00 a year</b><br>Last year you paid: &pound;512.40</p><p>Brightside Insurance</p></body></html>';

  var energyHtml = '<!doctype html><html><head><style>body{font-family:Arial} .x{color:#333}</style><script>var tracking=1;</script></head><body>' +
    '<h1>Your Northern Power bill is ready</h1><p>Hello Priya,</p>' +
    '<p>Here is your energy bill for ' + longDate(lastMonth) + ' to ' + longDate(lastMonthEnd) + '.</p>' +
    '<table><tr><td>Electricity</td><td>&pound;86.12</td></tr><tr><td>Gas</td><td>&pound;56.25</td></tr>' +
    '<tr><td><b>Amount due</b></td><td><b>&pound;142.37</b></td></tr></table>' +
    '<p>We&rsquo;ll collect this by Direct Debit on ' + longDate(plusDays(12)) + '. You don&rsquo;t need to do anything.</p>' +
    '<p>Your tariff: Standard Variable. Unit rate 24.50p per kWh.</p>' +
    '<p>Thanks,<br>Northern Power<br><small>This is a made-up sample email.</small></p></body></html>';

  var cardText = 'Your Meridian Card statement is ready\n\nCard ending 4821\n\n' +
    'Previous balance: £980.15\nStatement balance: £1,245.60\nMinimum payment: £37.37\nPayment due date: ' + slashDate(plusDays(18)) + '\n\n' +
    'Purchase rate: 24.9% APR (variable)\nCredit limit: £3,500.00\n\n' +
    'If you only make the minimum payment each month, it will take you longer and cost you more to clear your balance.\n\n' +
    'Meridian Card Services\n(This is a made-up sample email.)';

  var scamText = '*** SAMPLE ONLY: this is an example of a SCAM email, made up for practice. It is not from HMRC. ***\n\n' +
    'Dear Taxpayer,\n\nAfter the last annual calculation of your tax we have found that you are eligible to receive a tax refund of £478.20.\n\n' +
    'To receive your refund, please click the link below within 24 hours and enter your bank details and card number:\n\n' +
    'http://hmrc-refund-claim.example/secure-login\n\n' +
    'Failure to respond will mean your refund is cancelled.\n\nHM Revenue & Customs';

  var phoneText = 'Hi Priya,\n\nWe are writing to tell you about a price change to your Skyline Mobile plan.\n\n' +
    'From 1 April ' + april.getFullYear() + ', your monthly price will go up from £32.00 to £35.20 a month. This was set out in your contract when you joined.\n\n' +
    'Your plan, data and minutes stay the same. Your new price will be collected by Direct Debit as usual.\n\n' +
    'Skyline Mobile\n(This is a made-up sample email.)';

  window.INBOX_SAMPLES = [
    { file: 'brightside-renewal.eml', raw:
      'Return-Path: <renewals@brightside-insurance.example>\r\n' +
      'From: Brightside Insurance <renewals@brightside-insurance.example>\r\n' +
      'To: Priya Sharma <priya@example.co.uk>\r\n' +
      'Subject: =?UTF-8?Q?Your_car_insurance_renewal_=E2=80=93_premium_=C2=A3640?=\r\n' +
      '  =?UTF-8?Q?=2E00?=\r\n' +
      'Date: ' + sent(3) + '\r\n' +
      'MIME-Version: 1.0\r\n' +
      'Content-Type: multipart/alternative; boundary="b1_bright"\r\n\r\n' +
      'This is a multi-part message in MIME format.\r\n' +
      '--b1_bright\r\nContent-Type: text/plain; charset=utf-8\r\nContent-Transfer-Encoding: quoted-printable\r\n\r\n' + qp(carText) + '\r\n' +
      '--b1_bright\r\nContent-Type: text/html; charset=utf-8\r\nContent-Transfer-Encoding: quoted-printable\r\n\r\n' + qp(carHtml) + '\r\n' +
      '--b1_bright--\r\n' },
    { file: 'northern-power-bill.eml', raw:
      'From: "Northern Power" <bills@northernpower.example>\r\n' +
      'To: priya@example.co.uk\r\n' +
      'Subject: Your energy bill for ' + monthYear(lastMonth) + '\r\n' +
      'Date: ' + sent(2) + '\r\n' +
      'MIME-Version: 1.0\r\n' +
      'Content-Type: text/html; charset="utf-8"\r\nContent-Transfer-Encoding: base64\r\n\r\n' + b64(energyHtml) + '\r\n' },
    { file: 'meridian-card-statement.eml', raw:
      'From: Meridian Card Services <statements@meridiancard.example>\r\n' +
      'To: priya@example.co.uk\r\n' +
      'Subject: Your credit card statement is ready\r\n' +
      'Date: ' + sent(1) + '\r\n' +
      'MIME-Version: 1.0\r\n' +
      'Content-Type: text/plain; charset=iso-8859-1\r\nContent-Transfer-Encoding: quoted-printable\r\n\r\n' + qp(cardText, true) + '\r\n' },
    { file: 'scam-example-tax-refund.eml', raw:
      'From: "HMRC Refunds" <refund-notice@hmrc-taxrefund-online.example>\r\n' +
      'Reply-To: claims@fast-refunds.example\r\n' +
      'To: priya@example.co.uk\r\n' +
      'Subject: =?UTF-8?B?' + btoa(utf8('[Scam example] Tax refund – you are owed £478.20')) + '?=\r\n' +
      'Date: ' + sent(1) + '\r\n' +
      'MIME-Version: 1.0\r\n' +
      'Content-Type: text/plain; charset=utf-8\r\nContent-Transfer-Encoding: 8bit\r\n\r\n' + utf8(scamText) + '\r\n' },
    { file: 'skyline-price-change.eml', raw:
      'From: Skyline Mobile <hello@skylinemobile.example>\r\n' +
      'To: priya@example.co.uk\r\n' +
      'Subject: Your monthly price is changing in April\r\n' +
      'Date: ' + sent(5) + '\r\n' +
      'MIME-Version: 1.0\r\n' +
      'Content-Type: multipart/mixed; boundary="outer-sky"\r\n\r\n' +
      '--outer-sky\r\nContent-Type: multipart/alternative; boundary="inner-sky"\r\n\r\n' +
      '--inner-sky\r\nContent-Type: text/plain; charset=utf-8\r\nContent-Transfer-Encoding: quoted-printable\r\n\r\n' + qp(phoneText) + '\r\n' +
      '--inner-sky\r\nContent-Type: text/html; charset=utf-8\r\nContent-Transfer-Encoding: base64\r\n\r\n' + b64('<p>' + phoneText.replace(/\n/g, '<br>') + '</p>') + '\r\n' +
      '--inner-sky--\r\n' +
      '--outer-sky\r\nContent-Type: application/pdf; name="price-guide.pdf"\r\nContent-Disposition: attachment; filename="price-guide.pdf"\r\nContent-Transfer-Encoding: base64\r\n\r\n' + btoa('%PDF-1.4 sample') + '\r\n' +
      '--outer-sky--\r\n' }
  ];
})();
