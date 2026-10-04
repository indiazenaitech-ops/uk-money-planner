module.exports = async ({ page, expect }) => {
  const txt = async (sel) => (await page.innerText(sel)).trim();
  const set = async (sel, v) => { await page.fill(sel, String(v)); await page.waitForTimeout(80); };

  await page.waitForSelector('#pay-table');
  // £30,000 a year, England, no pension, no loan
  await page.click('#period button[data-value="year"]');
  await page.click('#region button[data-value="ruk"]');
  await set('#pay', 30000);
  await set('#pension-pct', 0);
  expect((await txt('#y-tax')) === '£3,486.00', 'income tax £3,486.00, got ' + (await txt('#y-tax')));
  expect((await txt('#y-ni')) === '£1,394.40', 'NI £1,394.40, got ' + (await txt('#y-ni')));
  expect((await txt('#y-takehome')) === '£25,119.60', 'take-home £25,119.60, got ' + (await txt('#y-takehome')));
  expect((await txt('#m-takehome')) === '£2,093.30', 'monthly take-home £2,093.30, got ' + (await txt('#m-takehome')));

  // Scotland
  await page.click('#region button[data-value="scotland"]');
  expect((await txt('#y-tax')) === '£3,451.07', 'Scottish tax £3,451.07, got ' + (await txt('#y-tax')));
  await page.click('#region button[data-value="ruk"]');

  // Plan 2 student loan on £35,000
  await set('#pay', 35000);
  await page.check('#loan-plan2');
  expect((await txt('#y-sl')) === '£505.35', 'Plan 2 £505.35, got ' + (await txt('#y-sl')));
  await page.uncheck('#loan-plan2');
  expect((await page.locator('#y-sl').count()) === 0, 'no student loan row after unticking');

  // £110,000 shows the 60% taper warning
  await set('#pay', 110000);
  expect(await page.locator('#taper-warning').isVisible(), 'taper warning shown at £110,000');
  expect((await txt('#y-tax')) === '£33,432.00', 'tax at £110,000 is £33,432.00, got ' + (await txt('#y-tax')));

  // salary sacrifice reduces NI compared with relief at source
  await set('#pay', 40000);
  await set('#pension-pct', 5);
  await page.selectOption('#pension-basis', 'full');
  await page.selectOption('#pension-method', 'ras');
  const niRas = await txt('#y-ni');
  await page.selectOption('#pension-method', 'sacrifice');
  const niSac = await txt('#y-ni');
  expect(niRas === '£2,194.40' && niSac === '£2,034.40', 'salary sacrifice cuts NI: ' + niRas + ' → ' + niSac);

  // pay rise what-if: £40,000 → £45,000 keeps a sensible share
  await set('#rise', 45000);
  const keep = Number((await txt('#rise-keep')).replace('%', ''));
  expect(keep > 50 && keep < 70, 'keeps 50-70% of the rise, got ' + keep);

  // save salary to profile
  await page.click('#save-profile');
  await page.waitForTimeout(500);

  // persistence across reload
  await page.reload();
  await page.waitForSelector('#pay-table');
  expect((await page.inputValue('#pay')) === '40000', 'salary remembered');
  expect((await page.inputValue('#pension-method')) === 'sacrifice', 'pension method remembered');
  expect((await txt('#y-ni')) === '£2,034.40', 'results recomputed after reload');
};
