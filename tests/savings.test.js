module.exports = async ({ page, expect }) => {
  const money = async (sel) => Number((await page.innerText(sel)).replace(/[^0-9.\-]/g, ''));

  // 0. new accounts start in Simple view, as a beginner
  await page.waitForSelector('#ef-target');
  expect(await page.locator('#sv-panel .explain').first().isVisible(), 'beginners see a 💡 explanation');

  // 1. Emergency fund: target = sum of costs × months
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
  expect(!(await page.isVisible('#isa-date')), 'Simple view hides the deposit date');
  await page.selectOption('#isa-type', 'cash');
  await page.fill('#isa-amount', '1000');
  await page.click('#isa-add');
  expect((await money('#isa-used')) === 1000, 'Simple view records a deposit dated today');
  await page.locator('#isa-list tbody tr').first().locator('.isa-del').click();
  expect((await money('#isa-used')) === 0, 'deleting it clears the allowance used');

  // Growth in Simple: one account and a headline figure
  await page.click('#tab-growth');
  expect(await page.isVisible('#gr-simple-balance') && !(await page.isVisible('#gr-table')) && !(await page.isVisible('#gr-salary')), 'Simple growth shows the headline only');
  expect(await page.isVisible('#gr-start-0') && !(await page.isVisible('#gr-start-1')), 'Simple growth shows one account');
  await page.fill('#gr-rate-0', '0');
  await page.fill('#gr-start-0', '1000');
  await page.fill('#gr-monthly-0', '100');
  await page.fill('#gr-years', '2');
  expect((await money('#gr-simple-balance')) === 3400, 'Simple headline: £1,000 + 24×£100 at 0% = £3,400, got ' + (await page.innerText('#gr-simple-balance')));
  expect((await page.locator('#sv-panel .advice-card').count()) === 1, 'advice card on the Growth tab');

  // switch to Detailed for the advanced inputs
  await page.click('#mp-detail-detailed');
  await page.click('#tab-isa');
  await page.waitForSelector('#isa-date', { state: 'visible' });
  expect(await page.isVisible('#isa-date'), 'Detailed view shows the deposit date');
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
  expect(await page.isVisible('#lisa-rate'), 'Detailed LISA shows the growth rate');

  // confident customers do not see the 💡 lines
  expect(await page.locator('#sv-panel .explain').first().isVisible(), 'LISA explanation visible to a beginner');
  await page.evaluate(() => MP.setPrefs({ knowledge: 'confident' }));
  await page.waitForTimeout(100);
  expect((await page.locator('.explain:visible').count()) === 0, 'explanations hidden for confident customers');
  await page.evaluate(() => MP.setPrefs({ knowledge: '' }));

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

  // prefill from the guided setup after a reset: £1,500 of bills, 2 months saved
  await page.evaluate(() => MP.setPrefs({ answers: { essentialCosts: 1500, savingsMonths: '2', homeFirst: 'no' } }));
  await page.click('#sv-reset');
  await page.waitForSelector('#ef-guide-note');
  expect((await page.inputValue('#ef-current')) === '3000', 'current savings prefilled as £1,500 × 2');
  expect((await money('#ef-target')) === 9000, 'target from guided costs: £1,500 × 6 = £9,000, got ' + (await page.innerText('#ef-target')));
  await page.click('#tab-lisa');
  expect(!(await page.isChecked('#lisa-first')), 'first-time buyer unticked from the guided setup');
  expect(await page.isVisible('#lisa-guide-note'), 'LISA shows the guided-setup note');
  await page.evaluate(() => MP.setPrefs({ answers: {}, detail: 'simple' }));
  await page.click('#tab-emergency');
};
