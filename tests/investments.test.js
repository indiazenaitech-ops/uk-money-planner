module.exports = async ({ page, expect }) => {
  const money = async (sel) => Number((await page.innerText(sel)).replace(/[^0-9.\-]/g, ''));
  await page.waitForSelector('#out-mid');

  // new accounts start in Simple view, as a beginner
  expect(await page.isHidden('#inv-charges') && await page.isHidden('#inv-table'), 'charges and year table (detail-only) hidden in Simple view');
  expect(await page.isVisible('#out-low') && await page.isVisible('#out-mid') && await page.isVisible('#out-high'), 'Simple view shows the low / mid / high headline');
  expect(await page.locator('#h-inputs + .explain').isVisible(), 'beginner explanation visible by default');
  expect(await page.locator('.advice-card').count() === 1, 'investments advice card shown');

  // Simple view still computes with the hidden defaults (0.6% charges, no yearly increase)
  await page.fill('#inv-start', '0');
  await page.fill('#inv-monthly', '100');
  await page.fill('#inv-years', '10');
  await page.waitForTimeout(150);
  let bal = 0;
  for (let i = 1; i <= 120; i++) { bal *= 1 + 0.05 / 12; bal -= bal * 0.006 / 12; bal += 100; }
  expect(Math.abs((await money('#out-mid')) - bal) <= 2, `Simple mid with default charges ≈ £${Math.round(bal)}, got ` + await money('#out-mid'));

  await page.click('#mp-detail-detailed');
  await page.waitForTimeout(100);
  expect(await page.isVisible('#inv-charges') && await page.isVisible('#inv-escalate'), 'detail-only inputs visible after switching to Detailed');

  // £0 start, £100/month, 10 years, no charges, ISA, nominal: mid 5% ≈ £15,528
  await page.fill('#inv-start', '0');
  await page.fill('#inv-monthly', '100');
  await page.fill('#inv-escalate', '0');
  await page.fill('#inv-charges', '0');
  await page.fill('#inv-years', '10');
  await page.selectOption('#inv-wrapper', 'isa');
  if (await page.isChecked('#inv-real')) await page.uncheck('#inv-real');
  await page.waitForTimeout(150);
  const mid = await money('#out-mid'), low = await money('#out-low'), high = await money('#out-high');
  expect(Math.abs(mid - 15528) <= 5, 'mid ≈ £15,528, got ' + mid);
  expect(high > mid && mid > low && low > 12000, 'high > mid > low > paid in, got ' + [low, mid, high]);
  expect((await money('#out-paid')) === 12000, 'paid in is £12,000');
  expect((await money('#out-charges')) === 0, 'no charges cost with 0%');

  // charges lower the value
  await page.fill('#inv-charges', '1');
  await page.waitForTimeout(150);
  const midFee = await money('#out-mid');
  expect(midFee < mid - 300 && (await money('#out-charges')) > 300, 'charges reduce mid value, got ' + midFee);

  // pension tax relief: £80 a month becomes £100
  await page.fill('#inv-monthly', '80');
  await page.selectOption('#inv-wrapper', 'sipp');
  await page.waitForTimeout(150);
  expect((await page.innerText('#out-gross')).includes('100.00'), 'SIPP grosses £80 up to £100');
  expect((await money('#out-paid')) === 12000, 'pension paid in with relief is £12,000');

  // today's money is lower than the nominal value
  const nominal = await money('#out-mid');
  await page.check('#inv-real');
  await page.waitForTimeout(150);
  expect((await money('#out-mid')) < nominal * 0.85, 'today\'s money view is lower');

  // persistence after reload
  await page.waitForTimeout(600);
  await page.reload();
  await page.waitForSelector('#out-mid');
  expect((await page.inputValue('#inv-monthly')) === '80' && (await page.inputValue('#inv-years')) === '10' && (await page.inputValue('#inv-wrapper')) === 'sipp', 'inputs survive reload');
  expect(await page.isChecked('#inv-real'), 'today\'s money toggle survives reload');

  // confident customers do not see the beginner explanations
  await page.evaluate(() => MP.setPrefs({ knowledge: 'confident' }));
  await page.waitForTimeout(100);
  expect(await page.locator('#h-inputs + .explain').isHidden(), 'explanation hidden for confident customers');

  // guided setup answers prefill an empty plan: risk from riskReaction, a starter tip for people who never invested
  await page.evaluate(() => { MP.setPrefs({ knowledge: 'new', answers: { riskReaction: 'adventurous', investExp: 'never' } }); MP.set('tools.investments', undefined); });
  await page.waitForTimeout(600);
  await page.reload();
  await page.waitForSelector('#out-mid');
  expect(await page.getAttribute('#inv-risk [data-value="adventurous"]', 'aria-pressed') === 'true', 'guide riskReaction prefills Adventurous');
  expect(await page.isVisible('#inv-new-tip'), 'never-invested beginners see the start-small tip');
};
