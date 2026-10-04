const path = require('path');

module.exports = async ({ page, expect, ROOT }) => {
  // unit checks of the parser: encoded words, quoted-printable, HTML to text
  const unit = await page.evaluate(() => ({
    q: InboxParse.decodeHeader('=?UTF-8?Q?Caf=C3=A9_bill_=C2=A312?= =?ISO-8859-1?Q?_=A35?='),
    b: InboxParse.decodeHeader('=?utf-8?B?wqM0MCDigJMgZHVl?='),
    html: InboxParse.htmlToText('<style>p{}</style><p>Total&nbsp;due:<br>&pound;9.99</p><script>x()</script>')
  }));
  expect(unit.q === 'Café bill £12 £5' && unit.b === '£40 – due', 'RFC 2047 encoded words decode, got ' + unit.q + ' / ' + unit.b);
  expect(unit.html === 'Total due:\n£9.99', 'HTML is turned into text, got ' + JSON.stringify(unit.html));

  // import a real .eml file (multipart/alternative, quoted-printable, base64 encoded-word subject)
  const fixture = path.join(ROOT, 'tests/fixtures/inbox/home-renewal.eml');
  const [fc] = await Promise.all([page.waitForEvent('filechooser'), page.click('#import-files')]);
  await fc.setFiles(fixture);
  await page.waitForSelector('#item-list .mail-item');
  const card = page.locator('#item-list .mail-item').first();
  expect((await card.locator('.item-subject').innerText()) === 'Your home insurance renewal – £384.00 a year', 'encoded subject decoded');
  expect((await card.locator('.item-amount').innerText()) === '£384.00', 'premium £384.00 extracted');
  expect((await card.locator('.item-due').innerText()).includes('15 Mar 2030'), 'renewal date 15 March 2030 extracted');
  expect((await card.getAttribute('data-type')) === 'renewal', 'classified as a renewal');
  expect(/Was £351\.20/.test(await card.innerText()), 'last year\'s premium shown as a price rise');

  // paste a plain-text bill
  await page.fill('#paste-text', 'From: Riverside Water <bills@riversidewater.example>\nSubject: Your water bill\n\nHello Priya,\nYour bill is ready.\nAmount due: £86.50\nPlease pay by 20/11/2030.\nRiverside Water');
  await page.click('#paste-read');
  await page.waitForFunction(() => document.querySelectorAll('#item-list .mail-item').length === 2);
  const water = page.locator('#item-list .mail-item', { hasText: 'Your water bill' });
  expect((await water.locator('.item-amount').innerText()) === '£86.50', 'pasted amount £86.50');
  expect((await water.locator('.item-due').innerText()).includes('20 Nov 2030'), 'pasted due date 20/11/2030');

  // samples: scam flagged, car insurance planned at £640 / 5 months = £128 a month
  await page.click('#try-sample');
  await page.waitForFunction(() => document.querySelectorAll('#item-list .mail-item').length === 7);
  const scam = page.locator('#item-list .mail-item.is-scam');
  expect((await scam.count()) === 1, 'one scam flagged');
  expect((await scam.locator('.hmrc-warning').count()) === 1, 'HMRC refund warning shown');

  const car = page.locator('#item-list .mail-item', { hasText: 'Brightside' });
  await car.locator('.plan-item').click();
  await page.waitForTimeout(300);
  const goals = await page.evaluate(() => MP.goals());
  const g = goals.find((x) => /Car insurance renewal/.test(x.name));
  expect(g && g.target === 640 && Math.abs(g.monthly - 128) < 0.01 && g.icon === '🧾', 'goal created at £128 a month, got ' + JSON.stringify(g));
  expect(/£128\.00/.test(await page.locator('#item-list .mail-item', { hasText: 'Brightside' }).locator('.plan-monthly').innerText()), 'plan shown on the card');

  // edit then add to bills: change the water bill to £90 every 3 months, due in 10 days
  await page.locator('#item-list .mail-item', { hasText: 'Your water bill' }).locator('.edit-item').click();
  await page.selectOption('#e-freq', 'quarterly');
  await page.fill('#e-amount', '90');
  const soon = new Date(); soon.setDate(soon.getDate() + 10);
  const iso = soon.getFullYear() + '-' + String(soon.getMonth() + 1).padStart(2, '0') + '-' + String(soon.getDate()).padStart(2, '0');
  await page.fill('#e-date', iso);
  await page.click('#e-save');
  await page.locator('#item-list .mail-item', { hasText: 'Your water bill' }).locator('.add-bill').click();
  await page.locator('#item-list .mail-item', { hasText: 'Brightside' }).locator('.add-bill').click();
  await page.click('#tab-upcoming');
  await page.waitForSelector('#bill-list .bill');
  expect((await page.locator('#bill-list .bill').count()) === 2, 'two bills in the calendar');
  const yearTotal = Number((await page.innerText('#year-total')).replace(/[^0-9.]/g, ''));
  // £640 once + £90 every 3 months (4 times in the next 12 months)
  expect(yearTotal === 1000, 'yearly total £1,000, got ' + yearTotal);

  // dismiss the scam
  await page.click('#tab-found');
  await page.locator('#item-list .mail-item.is-scam .dismiss-item').click();
  await page.waitForFunction(() => document.querySelectorAll('#item-list .mail-item').length === 6);

  // stored data holds facts and a short snippet only
  const stored = await page.evaluate(() => MP.get('tools.inbox'));
  expect(stored.items.every((i) => i.snippet.length <= 500 && !('text' in i)), 'only a short snippet is stored');

  // persists after reload
  await page.waitForTimeout(500);
  await page.reload();
  await page.waitForSelector('#item-list .mail-item');
  expect((await page.locator('#item-list .mail-item').count()) === 6, 'messages survive reload');
  const summary = await page.evaluate(() => MP.get('summaries.inbox'));
  expect(summary && /due in the next 30 days/.test(summary.text), 'home summary set, got ' + JSON.stringify(summary));
};
