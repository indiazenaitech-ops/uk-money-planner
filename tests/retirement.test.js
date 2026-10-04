module.exports = async ({ page, expect }) => {
  const val = async (sel) => Number(await page.getAttribute(sel, 'data-value'));
  const setRange = (sel, v) => page.evaluate(([s, x]) => { const e = document.querySelector(s); e.value = x; e.dispatchEvent(new Event('input', { bubbles: true })); }, [sel, String(v)]);
  await page.waitForSelector('#results');

  // new accounts start in Simple view, as a beginner
  expect(await page.isHidden('#charges'), 'charges (detail-only) hidden in Simple view');
  expect(await page.isHidden('#pot-value-0') && await page.isVisible('#pot-total'), 'Simple view shows one total pot box, not the list');
  expect(await page.isVisible('#net-income') && await page.isVisible('#gap'), 'Simple view still shows the headline income and the gap');
  expect(await page.locator('#h-pots + .explain').isVisible(), 'beginner explanation visible by default');
  expect(await page.locator('.advice-card').count() === 1, 'pension advice card shown');

  // known setup, all from Simple view: age 40, retire at 67, £100,000 in pensions, £30,000 salary, 5% + 3%
  await page.fill('#age', '40');
  await page.locator('#age').dispatchEvent('change');
  await page.waitForSelector('#retire-age');
  await setRange('#retire-age', 67);
  await page.fill('#pot-total', '100000');
  await page.fill('#salary', '30000');
  await page.fill('#emp-pct', '5');
  await page.fill('#er-pct', '3');
  await page.waitForTimeout(150);

  // contributions use the hidden default (qualifying earnings): 8% of (30,000 − 6,240) = £158.40 a month
  const monthly = await val('#monthly-contrib');
  expect(Math.abs(monthly - 158.4) < 0.01, 'monthly contribution £158.40, got ' + monthly);

  // projected pot in today's money matches an independent calculation using the defaults (5% growth, 0.5% charges)
  const rate = 0.05 - 0.005, infl = 0.025, years = 27;
  let bal = 100000;
  for (let i = 1; i <= years * 12; i++) bal = bal * (1 + rate / 12) + 158.4 * Math.pow(1 + infl, Math.floor((i - 1) / 12));
  const expected = bal / Math.pow(1 + infl, years);
  const pot67 = await val('#pot-real');
  expect(Math.abs(pot67 - expected) < 2, `Simple view: pot at 67 ≈ £${Math.round(expected)}, got £${pot67}`);

  // "I'm not sure" about National Insurance at 40 assumes the full State Pension
  await page.check('#ni-unsure');
  await page.waitForTimeout(100);
  expect(Math.abs(await val('#sp-yearly') - 12548) <= 1 && await page.isDisabled('#ni-years'), 'not sure at 40: full State Pension assumed');
  await page.uncheck('#ni-unsure');

  // switch to Detailed: the advanced inputs appear and the answer is unchanged
  await page.click('#mp-detail-detailed');
  await page.waitForTimeout(100);
  expect(await page.isVisible('#charges') && await page.isVisible('#pot-value-0'), 'detail-only inputs visible after switching to Detailed');
  expect(await page.inputValue('#pot-value-0') === '100000', 'Simple total became the first pot');
  await page.click('#basis [data-value="qualifying"]');
  await page.click('#scenario [data-value="mid"]');
  await page.fill('#charges', '0.5');
  await page.waitForTimeout(150);
  expect(Math.abs(await val('#pot-real') - pot67) < 1, 'Detailed with the same defaults gives the same pot');

  // tax-free cash is 25% of the pot
  const lump = await val('#lump-sum');
  expect(Math.abs(lump - pot67 * 0.25) < 2, `lump sum is 25% of pot, got £${lump}`);

  // State Pension: 35 qualifying years gives the full £241.30 × 52 = £12,547.60
  await page.fill('#ni-years', '35');
  await page.fill('#ni-future', '0');
  await page.waitForTimeout(100);
  const sp = await val('#sp-yearly');
  expect(Math.abs(sp - 12548) <= 1, 'full State Pension ≈ £12,548, got ' + sp);
  // fewer than 10 years gives nothing
  await page.fill('#ni-years', '9');
  await page.waitForTimeout(100);
  expect(await val('#sp-yearly') === 0, 'under 10 years: no State Pension');
  // 20 years gives 20/35 of the full amount
  await page.fill('#ni-years', '20');
  await page.waitForTimeout(100);
  expect(Math.abs(await val('#sp-yearly') - 241.30 * 52 * 20 / 35) <= 1, '20 years gives 20/35 of the full State Pension');
  await page.fill('#ni-years', '35');
  await page.waitForTimeout(100);

  // retiring earlier means a smaller pot and a bridging gap before State Pension age
  await setRange('#retire-age', 60);
  await page.waitForTimeout(100);
  const pot60 = await val('#pot-real');
  expect(pot60 < pot67 - 10000, `retiring at 60 gives a smaller pot (${pot60} vs ${pot67})`);
  expect(await page.locator('#bridge').count() === 1, 'bridging years shown when retiring before State Pension age');

  // a comfortable target leaves a gap; retiring at the suggested later age closes it
  await setRange('#retire-age', 67);
  await page.click('#level-comfortable');
  await page.waitForTimeout(150);
  expect(await page.inputValue('#target') === '43900', 'comfortable preset sets £43,900');
  const gap = await val('#gap');
  expect(gap > 0, 'comfortable target shows a gap, got ' + gap);
  expect(await page.locator('#extra-monthly').count() === 1, 'shows extra monthly needed');
  const extra = await val('#extra-monthly');
  expect(extra > 0 && extra < 50000, 'extra monthly is sensible: ' + extra);
  // paying that much more closes the gap: raise employer % by the equivalent amount
  const addPct = extra * 12 / (30000 - 6240) * 100;
  await page.fill('#er-pct', String(3 + addPct));
  await page.waitForTimeout(200);
  expect(await val('#gap') <= 1, 'paying in the extra amount closes the gap, gap now ' + await val('#gap'));
  await page.fill('#er-pct', '3');
  await page.waitForTimeout(150);

  // save as a dream: one pension goal is created, and saving again updates it
  await page.click('#save-dream');
  await page.click('#save-dream');
  await page.waitForTimeout(300);
  const goals = await page.evaluate(() => MP.goals().filter((g) => g.home === 'pension'));
  expect(goals.length === 1 && goals[0].target > 0 && goals[0].name === 'Retire at 67', 'one pension dream saved: ' + JSON.stringify(goals.map((g) => [g.name, g.target])));

  // inputs survive a reload
  await page.waitForTimeout(500);
  await page.reload();
  await page.waitForSelector('#results');
  expect(await page.inputValue('#pot-value-0') === '100000', 'pot value survives reload');
  expect(await page.inputValue('#retire-age') === '67', 'retirement age survives reload');
  expect(Math.abs(await val('#pot-real') - pot67) < 2, 'projection is the same after reload');
  const summary = await page.evaluate(() => MP.get('summaries.retirement').text);
  expect(/^Retire at 67: £[\d,]+ a year$/.test(summary), 'home summary saved: ' + summary);

  // two pots: the Simple total adds them up and is read-only
  await page.click('#add-pot');
  await page.fill('#pot-value-1', '5000');
  await page.click('#mp-detail-simple');
  await page.waitForTimeout(100);
  expect(await page.inputValue('#pot-total') === '105000' && await page.isDisabled('#pot-total'), 'Simple total sums two pots and is locked');

  // confident customers do not see the beginner explanations
  await page.evaluate(() => MP.setPrefs({ knowledge: 'confident' }));
  await page.waitForTimeout(100);
  expect(await page.locator('#h-pots + .explain').isHidden(), 'explanation hidden for confident customers');

  // guided setup answers prefill an empty plan
  await page.evaluate(() => { MP.setPrefs({ answers: { retireAge: 60, pensionTotal: 85000 } }); MP.set('tools.retirement', undefined); });
  await page.waitForTimeout(600);
  await page.reload();
  await page.waitForSelector('#results');
  expect(await page.inputValue('#retire-age') === '60' && await page.inputValue('#pot-total') === '85000', 'guide answers prefill retire age 60 and £85,000, got ' + await page.inputValue('#retire-age') + ' / ' + await page.inputValue('#pot-total'));
  await page.click('#mp-detail-detailed');
  expect(await page.inputValue('#pot-value-0') === '85000', 'guide pension total becomes the single pot');
};
