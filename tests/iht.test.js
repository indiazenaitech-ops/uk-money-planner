module.exports = async ({ page, expect, log }) => {
  const num = async (sel) => Number(await page.getAttribute(sel, 'data-value'));
  const fill = async (vals) => { for (const [id, v] of Object.entries(vals)) await page.fill('#' + id, String(v)); await page.waitForTimeout(80); };
  const blank = { 'home-value': 0, 'home-share': 100, savings: 0, isas: 0, 'other-property': 0, pensions: 0, mortgage: 0, loans: 0, funeral: 0 };
  await page.waitForSelector('#results');

  // new accounts start in Simple view, with a useful example estimate
  expect(await page.evaluate(() => document.documentElement.getAttribute('data-detail')) === 'simple', 'starts in Simple view');

  // 1. single, £500,000 estate, home not going to descendants: £175,000 taxable, £70,000 tax
  await page.click('#status [data-value="single"]');
  await fill(Object.assign({}, blank, { 'home-value': 300000, savings: 200000 }));
  await page.click('#home-desc [data-value="no"]');
  expect(await num('#r-taxable') === 175000, 'taxable £175,000, got ' + await num('#r-taxable'));
  expect(await num('#r-tax') === 70000, 'tax £70,000, got ' + await num('#r-tax'));

  // 2. same estate, home £300,000 left to children: residence band £175,000 → no tax
  await page.click('#home-desc [data-value="yes"]');
  await page.waitForTimeout(80);
  expect(await num('#r-rnrb') === 175000 && await num('#r-tax') === 0, 'home to children → £0 tax, got ' + await num('#r-tax'));

  // 3. single, £2,200,000 with home to children: residence band tapered to £75,000, tax £720,000
  await fill({ 'home-value': 1000000, savings: 1200000 });
  expect(await num('#r-rnrb') === 75000, 'tapered RNRB £75,000, got ' + await num('#r-rnrb'));
  expect(await num('#r-tax') === 720000, 'tax £720,000, got ' + await num('#r-tax'));

  // 4. widowed (Detailed, 100% of both bands passed on), £1,000,000 incl. £600,000 home to children → £0
  await page.click('#mp-detail-detailed');
  await page.waitForTimeout(100);
  await fill({ possessions: 0, business: 0, life: 0, charity: 0 });
  await page.click('#status [data-value="widowed"]');
  await fill({ 't-nrb': 100, 't-rnrb': 100, 'home-value': 600000, savings: 400000 });
  expect(await num('#r-net') === 1000000, 'estate £1,000,000, got ' + await num('#r-net'));
  expect(await num('#r-tax') === 0 && await num('#r-rnrb') === 350000, 'widowed with both bands → £0 tax');
  // half the late spouse's nil-rate band → £162,500 more taxable
  await fill({ 't-nrb': 50 });
  expect(await num('#r-tax') === 65000, '50% transferred NRB → £65,000, got ' + await num('#r-tax'));

  // 5. charity: single, £1,000,000 savings. Baseline £675,000; £67,500 to charity → 36% on £607,500 = £218,700
  await page.click('#status [data-value="single"]');
  await fill({ 'home-value': 0, savings: 1000000 });
  expect(await num('#r-tax') === 270000, 'no charity: £270,000, got ' + await num('#r-tax'));
  await fill({ charity: 67500 });
  expect(await num('#r-rate') === 36, 'rate 36% with 10% to charity, got ' + await num('#r-rate'));
  expect(await num('#r-tax') === 218700, 'tax £218,700, got ' + await num('#r-tax'));
  await fill({ charity: 60000 });
  expect(await num('#r-rate') === 40, 'under 10% stays at 40%');
  await fill({ charity: 0 });

  // 6. gifts: £103,000 given 2 years ago (annual exemption + carry forward = £6,000) uses £97,000 of the NRB
  await page.click('#add-gift');
  const d = new Date(); d.setFullYear(d.getFullYear() - 2);
  await page.fill('#gift-date-0', d.toISOString().slice(0, 10));
  await page.locator('#gift-date-0').dispatchEvent('change');
  await fill({ 'gift-amount-0': 103000 });
  expect(await num('#r-nrb') === 228000, 'NRB left £228,000 after gift, got ' + await num('#r-nrb'));
  expect(await num('#r-tax') === 308800, 'tax £308,800 after gift, got ' + await num('#r-tax'));

  // 7. "try it": leaving 10% to charity saves money
  await page.check('#try-charity');
  await page.waitForTimeout(100);
  const saving = await num('#try-save-charity');
  log('charity saves', saving);
  expect(saving > 0 && await num('#try-tax') < await num('#r-tax'), 'charity idea lowers the estimate');

  // 8. checklist + persistence after reload
  await page.click('#will-status [data-value="no"]');
  expect(!!(await page.$('#intestacy')), 'intestacy note shown with no will');
  await page.check('#ck-lpa');
  await page.waitForTimeout(500);
  const before = await num('#r-tax');
  await page.reload();
  await page.waitForSelector('#results');
  expect(await num('#r-tax') === before, 'estimate survives reload, got ' + await num('#r-tax'));
  expect(await page.isChecked('#ck-lpa') && await page.isChecked('#try-charity'), 'checklist and toggles survive reload');
  expect((await page.inputValue('#gift-amount-0')) === '103000', 'gift survives reload');
};
