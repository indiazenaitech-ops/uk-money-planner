const path = require('path');

module.exports = async ({ page, expect, ROOT }) => {
  const fixture = (f) => path.join(ROOT, 'tests', 'fixtures', 'budget', f);
  const money = async (sel) => Number((await page.innerText(sel)).replace(/[^0-9.\-−]/g, '').replace('−', '-'));
  async function importFile(f) {
    const [chooser] = await Promise.all([page.waitForEvent('filechooser'), page.click('#import-btn')]);
    await chooser.setFiles(fixture(f));
  }

  // privacy promise is shown by the import area
  expect(/never uploaded/i.test(await page.innerText('#privacy-note')), 'privacy note says files are never uploaded');

  // import the fixture CSV (preamble line, £ signs, commas, brackets for negatives)
  await importFile('statement.csv');
  await page.waitForSelector('#tx-table tbody tr');
  expect((await page.locator('#tx-table tbody tr').count()) === 8, 'imported 8 transactions');
  expect((await page.inputValue('#month')) === '2026-03', 'March 2026 is selected');
  const inn = await money('#total-in'), out = await money('#total-out');
  expect(Math.abs(inn - 2520) < 0.001, 'money in = £2,520.00, got ' + inn);
  expect(Math.abs(out - 1065.99) < 0.001, 'money out = £1,065.99, got ' + out);
  expect(Math.abs((await money('#left-over')) - 1454.01) < 0.001, 'left over = £1,454.01');

  // known merchants are categorised
  const tesco = page.locator('#tx-table tbody tr', { hasText: 'TESCO' }).first();
  expect((await tesco.locator('select').inputValue()) === 'Groceries', 'TESCO is Groceries');
  const rent = page.locator('#tx-table tbody tr', { hasText: 'LETTINGS' }).first();
  expect((await rent.locator('select').inputValue()) === 'Housing', 'rent is Housing');

  // importing the same file again adds nothing (two identical Tesco rows on different days are both kept)
  await importFile('statement.csv');
  await page.waitForFunction(() => /already here/.test(document.querySelector('#import-msg').textContent));
  expect((await page.locator('#tx-table tbody tr').count()) === 8, 're-import does not duplicate');

  // recategorise Netflix and make it a rule
  const netflixSel = page.locator('#tx-table tbody tr', { hasText: 'NETFLIX' }).locator('select');
  await netflixSel.selectOption('Entertainment');
  await page.click('#always-rule');
  await page.waitForSelector('#rule-bar .callout.success');
  await page.waitForTimeout(600);
  await page.reload();
  await page.waitForSelector('#tx-table tbody tr');
  expect((await page.locator('#tx-table tbody tr', { hasText: 'NETFLIX' }).locator('select').inputValue()) === 'Entertainment', 'recategorised Netflix survives reload');

  // a file without headings opens the column chooser, prefilled with a sensible guess
  await importFile('no-headings.csv');
  await page.waitForSelector('#map-form');
  expect((await page.inputValue('#map-amount')) === '2', 'amount column guessed');
  await page.click('#map-ok');
  await page.waitForFunction(() => document.querySelectorAll('#tx-table tbody tr').length === 10);
  expect(Math.abs((await money('#total-out')) - (1065.99 + 3.75 + 12.40)) < 0.001, 'money out includes mapped rows');

  // filter by category
  await page.selectOption('#tx-cat', 'Groceries');
  expect((await page.locator('#tx-table tbody tr').count()) === 2, 'category filter shows the 2 Tesco rows');

  // sample data: 3 months, recurring payments found, and Dreams gets the average left over
  await page.click('#sample-btn');
  await page.waitForFunction(() => document.querySelectorAll('#month option').length === 4);
  expect(Number((await page.innerText('#tx-total')).replace(/,/g, '')) > 100, 'sample has over 100 transactions');
  const recurring = await page.innerText('#recurring-table');
  expect(/NETFLIX/.test(recurring) && /SPOTIFY/.test(recurring) && !/TESCO/.test(recurring), 'subscriptions found, weekly shops are not');
  expect(/a year/.test(await page.innerText('#subs-year')), 'subscriptions yearly total shown');
  await page.click('#to-dreams');
  await page.waitForTimeout(300);
  const spare = await page.evaluate(() => MP.get('tools.dreams', {}).spare);
  const btnAmount = Number((await page.innerText('#to-dreams')).replace(/[^0-9]/g, ''));
  expect(spare > 0 && spare === btnAmount, 'Dreams spare set to ' + btnAmount + ', got ' + spare);
};
