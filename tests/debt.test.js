module.exports = async ({ page, expect, log }) => {
  const num = async (sel) => Number(await page.getAttribute(sel, 'data-value'));

  // 1. Mortgage: £200,000 at 5% over 25 years, repayment → £1,169.18 a month
  await page.click('#tab-mortgage');
  await page.fill('#m-balance', '200000');
  await page.fill('#m-rate', '5');
  await page.fill('#m-years', '25');
  await page.fill('#m-months', '0');
  await page.click('#m-type [data-value="repayment"]');
  await page.fill('#m-over', '0');
  await page.fill('#m-lump', '0');
  const pay = await num('#m-payment');
  expect(Math.abs(pay - 1169.18) <= 0.05, 'monthly payment ≈ £1,169.18, got ' + pay);
  const baseInterest = await num('#m-interest');
  expect(Math.abs(baseInterest - (1169.18 * 300 - 200000)) < 20, 'total interest ≈ £150,754, got ' + baseInterest);

  // 2. Overpaying £200 a month shortens the term and saves interest
  await page.fill('#m-over', '200');
  const savedMonths = await num('#m-saved-months');
  const savedInterest = await num('#m-saved-interest');
  const overInterest = await num('#m-interest-over');
  log('overpay saves', savedMonths, 'months and £' + savedInterest);
  expect(savedMonths >= 60 && savedMonths <= 90, 'overpaying £200 saves roughly 6–7 years, got ' + savedMonths + ' months');
  expect(savedInterest > 30000 && overInterest < baseInterest, 'overpaying saves interest, got £' + savedInterest);
  expect(!(await page.$('#m-allow-warn')), 'no allowance warning for £2,400 a year on £200,000');
  await page.fill('#m-lump', '30000');
  expect(!!(await page.$('#m-allow-warn')), 'warns when overpayments exceed 10% a year');
  await page.fill('#m-lump', '0');

  // 3. Buying: SDLT on £400,000
  await page.click('#tab-buy');
  await page.fill('#b-price', '400000');
  await page.fill('#b-deposit', '40000');
  await page.click('#b-buyer [data-value="ftb"]');
  expect((await num('#b-sdlt')) === 5000, 'first-time buyer SDLT on £400k = £5,000, got ' + (await num('#b-sdlt')));
  await page.click('#b-buyer [data-value="mover"]');
  expect((await num('#b-sdlt')) === 10000, 'standard SDLT on £400k = £10,000, got ' + (await num('#b-sdlt')));
  await page.click('#b-buyer [data-value="additional"]');
  expect((await num('#b-sdlt')) === 30000, 'additional property SDLT on £400k = £30,000, got ' + (await num('#b-sdlt')));
  await page.click('#b-buyer [data-value="ftb"]');
  await page.fill('#b-price', '550000');
  expect((await num('#b-sdlt')) === 17500, 'no first-time relief above £500k: £550k = £17,500, got ' + (await num('#b-sdlt')));
  await page.fill('#b-price', '400000');
  expect(Math.abs((await num('#b-ltv')) - 0.9) < 0.0001, 'LTV is 90%');
  expect((await num('#b-stress')) > (await num('#b-monthly')), 'stress test payment is higher');

  // 4. Debts: two debts, avalanche beats (or ties) snowball on interest
  await page.click('#tab-debts');
  while (await page.$('#debt-list .d-del')) await page.click('#debt-list .d-del');
  expect(!!(await page.$('#debt-empty')), 'empty state when there are no debts');
  await page.click('#debt-add');
  await page.click('#debt-add');
  const rows = page.locator('#debt-list .debt-row');
  expect((await rows.count()) === 2, 'two debts added');
  await rows.nth(0).locator('.d-name').fill('Credit card');
  await rows.nth(0).locator('.d-bal').fill('3000');
  await rows.nth(0).locator('.d-apr').fill('24.9');
  await rows.nth(0).locator('.d-min').fill('90');
  await rows.nth(1).locator('.d-name').fill('Personal loan');
  await rows.nth(1).locator('.d-bal').fill('1000');
  await rows.nth(1).locator('.d-apr').fill('7.9');
  await rows.nth(1).locator('.d-min').fill('40');
  await page.fill('#debt-extra', '100');
  const av = await num('#av-interest'), sb = await num('#sb-interest');
  log('avalanche £' + av.toFixed(2), 'snowball £' + sb.toFixed(2));
  expect(av > 0 && av < sb, 'avalanche interest < snowball interest, got ' + av + ' vs ' + sb);
  expect((await num('#av-months')) > 12 && (await num('#av-months')) < 30, 'debt-free in about 2 years');
  expect((await page.innerText('#av-order li:first-child')).includes('Credit card'), 'avalanche clears the card first');
  expect((await page.innerText('#sb-order li:first-child')).includes('Personal loan'), 'snowball clears the smaller loan first');

  // minimum that does not cover interest is flagged; never paid off with no extra
  await rows.nth(0).locator('.d-min').fill('50');
  expect(!!(await page.$('#debt-warn')), 'warns when a minimum does not cover interest');
  await rows.nth(1).locator('.d-min').fill('5');
  await page.fill('#debt-extra', '0');
  expect(!!(await page.$('#av-never')) && !!(await page.$('#sb-never')), 'shows never paid off when payments do not cover interest');
  await rows.nth(0).locator('.d-min').fill('90');
  await rows.nth(1).locator('.d-min').fill('40');
  await page.fill('#debt-extra', '100');

  // save as a dream
  await page.click('#save-dream');
  await page.waitForTimeout(100);

  // 5. Persists after reload (and remembers the last tab)
  await page.waitForTimeout(600);
  await page.reload();
  await page.waitForSelector('#debt-list');
  expect((await page.getAttribute('#tab-debts', 'aria-selected')) === 'true', 'remembers the Debts tab');
  expect((await page.locator('#debt-list .debt-row').count()) === 2, 'debts survive reload');
  expect(Math.abs((await num('#av-interest')) - av) < 0.01, 'same result after reload');
  const goals = await page.evaluate(() => MP.goals().filter((g) => g.name === 'Be debt-free'));
  expect(goals.length === 1 && goals[0].icon === '🧹' && goals[0].target === 4000, 'debt-free dream saved with target £4,000');
  await page.click('#tab-mortgage');
  expect((await page.inputValue('#m-over')) === '200', 'mortgage overpayment remembered');
};
