module.exports = async ({ page, expect }) => {
  const val = async (sel) => Number(await page.getAttribute(sel, 'data-value'));
  const set = async (sel, v) => { await page.fill(sel, String(v)); await page.waitForTimeout(80); };

  // statutory: age 45, 10 years, £600/week → (5 × 1.5 + 5 × 1) × £600 = £7,500
  await page.waitForSelector('#rd-age');
  await set('#rd-age', 45);
  await set('#rd-years', 10);
  await set('#rd-weekly', 600);
  expect((await val('#rd-stat-total')) === 7500, 'statutory pay is £7,500, got ' + (await val('#rd-stat-total')));
  expect((await page.innerText('#rd-stat-total')).trim() === '£7,500', 'shows £7,500');

  // weekly pay above the cap is capped
  await set('#rd-weekly', 1000);
  const cap = await page.evaluate(() => UK.R.redundancy.weeklyPayCap);
  expect((await val('#rd-stat-total')) === 12.5 * cap, 'capped statutory = 12.5 × £' + cap + ', got ' + (await val('#rd-stat-total')));
  expect(await page.isVisible('#rd-cap-note'), 'cap note shown');

  // fewer than 2 years → £0 with a message
  await set('#rd-years', 1);
  expect((await val('#rd-stat-total')) === 0, 'under 2 years gives £0');
  expect(/at least 2 full years/.test(await page.innerText('#rd-stat-msg')), 'explains the 2-year rule');

  // runway: £6,000 savings + £0 payout, £1,500/month costs, no income → 4 months
  await set('#rd-savings', 6000);
  await set('#rd-costs', 1500);
  await set('#rd-income', 0);
  expect((await val('#rd-net')) === 0, 'net payout is £0');
  expect((await val('#rd-months')) === 4, 'money lasts 4 months, got ' + (await val('#rd-months')));
  expect(/4 months/.test(await page.innerText('#rd-months')), 'shows 4 months');

  // detailed: £40,000 payout → £30,000 tax-free, £10,000 taxable
  await page.click('#mp-detail-detailed');
  await page.waitForSelector('#rd-total', { state: 'visible' });
  await set('#rd-years', 10);
  await set('#rd-total', 40000);
  expect((await val('#rd-taxfree')) === 30000, 'tax-free part is £30,000, got ' + (await val('#rd-taxfree')));
  expect((await val('#rd-taxable')) === 10000, 'taxable part is £10,000, got ' + (await val('#rd-taxable')));
  expect((await page.innerText('#rd-taxfree')).trim() === '£30,000' && (await page.innerText('#rd-taxable')).trim() === '£10,000', 'tax split shown');
  expect(await page.isVisible('#rd-yby-table'), 'year-by-year table visible in detailed view');
  expect((await page.locator('#rd-yby-table tbody tr').count()) === 10, 'ten years listed');

  // checklist tick persists
  await page.check('#rd-check-acas');

  // persistence after reload
  await page.waitForTimeout(500);
  await page.reload();
  await page.waitForSelector('#rd-total');
  expect((await page.inputValue('#rd-total')) === '40000', 'package amount remembered');
  expect((await page.inputValue('#rd-savings')) === '6000', 'savings remembered');
  expect(await page.isChecked('#rd-check-acas'), 'checklist tick remembered');
  expect((await val('#rd-taxable')) === 10000, 'results recalculated after reload');
};
