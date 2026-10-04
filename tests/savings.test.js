module.exports = async ({ page, expect }) => {
  const money = async (sel) => Number((await page.innerText(sel)).replace(/[^0-9.\-]/g, ''));

  // 1. Emergency fund: target = sum of costs × months
  await page.waitForSelector('#ef-target');
  const keys = ['rent', 'council', 'energy', 'food', 'transport', 'insurance', 'phone', 'childcare', 'other'];
  const vals = [800, 150, 150, 300, 100, 50, 50, 0, 0];
  for (let i = 0; i < keys.length; i++) await page.fill('#ef-' + keys[i], String(vals[i]));
  await page.click('#ef-months button[data-value="3"]');
  await page.fill('#ef-current', '1000');
  await page.fill('#ef-monthly', '500');
  const sum = vals.reduce((a, b) => a + b, 0); // 1600
  expect((await money('#ef-target')) === sum * 3, 'emergency target = £' + sum * 3 + ', got ' + (await page.innerText('#ef-target')));
  expect((await money('#ef-gap')) === sum * 3 - 1000, 'gap = £3,800');
  expect((await money('#ef-months-to')) === 8, 'months to reach = 8 (3800/500), got ' + (await page.innerText('#ef-months-to')));
  await page.click('#ef-save-dream');
  const goals = await page.evaluate(() => MP.goals());
  expect(goals.length === 1 && goals[0].icon === '🛟' && goals[0].target === 4800, 'emergency dream saved with target £4,800');
  await page.click('#ef-save-dream');
  expect((await page.evaluate(() => MP.goals().length)) === 1, 'saving again updates rather than duplicates');

  // 2. ISA allowance: £5,000 cash + £3,000 S&S leaves £12,000
  await page.click('#tab-isa');
  await page.selectOption('#isa-type', 'cash');
  await page.fill('#isa-amount', '5000');
  await page.click('#isa-add');
  await page.selectOption('#isa-type', 'ss');
  await page.fill('#isa-amount', '3000');
  await page.click('#isa-add');
  expect((await money('#isa-used')) === 8000, 'ISA used = £8,000');
  expect((await money('#isa-remaining')) === 12000, 'ISA remaining = £12,000, got ' + (await page.innerText('#isa-remaining')));
  expect((await page.locator('#isa-list tbody tr').count()) === 2, 'two deposits listed');
  // LISA over £4,000 warns
  await page.selectOption('#isa-type', 'lisa');
  await page.fill('#isa-amount', '4500');
  await page.click('#isa-add');
  expect(await page.isVisible('#isa-warn-lisa'), 'warning when Lifetime ISA is over £4,000');
  await page.locator('#isa-list tbody tr', { hasText: 'Lifetime ISA' }).locator('.isa-del').click();
  expect((await money('#isa-remaining')) === 12000, 'deleting the LISA deposit restores £12,000 remaining');

  // 3. Growth: 0% interest means no interest; basic-rate PSA is £1,000
  await page.click('#tab-growth');
  await page.fill('#gr-salary', '35000');
  await page.fill('#gr-rate-0', '0');
  await page.fill('#gr-start-0', '1000');
  await page.fill('#gr-monthly-0', '100');
  await page.fill('#gr-years', '2');
  const bal = Number((await page.locator('#gr-table tbody tr').first().locator('.gr-balance').innerText()).replace(/[^0-9.]/g, ''));
  expect(bal === 3400, '0% for 2 years: £1,000 + 24×£100 = £3,400, got ' + bal);
  expect((await money('#gr-psa')) === 1000, 'basic-rate Personal Savings Allowance = £1,000');
  await page.fill('#gr-salary', '60000');
  expect((await money('#gr-psa')) === 500, 'higher-rate PSA = £500');

  // 4. Lifetime ISA: £4,000 a year earns a £1,000 bonus
  await page.click('#tab-lisa');
  await page.fill('#lisa-age', '28');
  await page.fill('#lisa-contrib', '4000');
  await page.fill('#lisa-rate', '0');
  await page.fill('#lisa-saved', '0');
  await page.fill('#lisa-years', '3');
  expect((await money('#lisa-bonus-year')) === 1000, 'LISA bonus on £4,000 = £1,000');
  expect(Math.round(await money('#lisa-with')) === 15000 && Math.round(await money('#lisa-without')) === 12000, 'LISA 3 years at 0%: £15,000 vs £12,000');
  await page.fill('#lisa-price', '500000');
  expect(await page.isVisible('#lisa-price-warn'), 'warns when home is over £450,000');
  await page.fill('#lisa-price', '300000');

  // persistence after reload: remembers the LISA tab and the ISA deposits
  await page.waitForTimeout(600);
  await page.reload();
  await page.waitForSelector('#tab-lisa[aria-selected="true"]');
  expect((await page.inputValue('#lisa-price')) === '300000', 'LISA inputs remembered');
  await page.click('#tab-isa');
  expect((await money('#isa-remaining')) === 12000, 'ISA deposits survive reload');
  const summary = await page.evaluate(() => MP.get('summaries.savings').text);
  expect(/ISA: £8,000 of £20,000 used/.test(summary), 'home summary shows ISA use, got ' + summary);
  await page.click('#tab-emergency');
};
