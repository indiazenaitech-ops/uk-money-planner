module.exports = async ({ page, expect }) => {
  const val = async (sel) => Number(await page.getAttribute(sel, 'data-value'));
  const settle = () => page.waitForTimeout(150);
  await page.waitForSelector('#results');

  // new accounts start in Simple view: advanced inputs are hidden
  expect(!(await page.isVisible('#charges')) && !(await page.isVisible('#mix-pct')), 'detail-only inputs hidden in Simple view');
  expect(await page.isVisible('#pot') && await page.isVisible('#rate'), 'simple inputs visible');

  // £100,000, no tax-free cash, 7% → £7,000 a year
  await page.fill('#pot', '100000');
  await page.fill('#age', '65');
  await page.uncheck('#take-cash');
  await page.fill('#rate', '7');
  await settle();
  expect(await val('#annuity-income') === 7000, 'annuity £7,000 a year, got ' + await val('#annuity-income'));
  expect(await val('#cash') === 0, 'no tax-free cash');
  // after tax: £7,000 + full State Pension £12,547.60 → tax on (19,547.60 − 12,570) × 20% minus tax on State Pension alone
  const net = await val('#annuity-net');
  const expectedNet = 7000 - (7000 + 241.30 * 52 - 12570) * 0.2; // State Pension alone is under the allowance
  expect(Math.abs(net - Math.round(expectedNet)) <= 1, 'annuity after tax ≈ £' + Math.round(expectedNet) + ', got ' + net);

  // 25% tax-free cash → £25,000, annuity on £75,000 at 7% = £5,250
  await page.check('#take-cash');
  await settle();
  expect(await val('#cash') === 25000, 'tax-free cash £25,000, got ' + await val('#cash'));
  expect(await val('#annuity-income') === 5250, 'annuity on £75,000 = £5,250, got ' + await val('#annuity-income'));

  // detailed view shows the advanced inputs
  await page.click('#mp-detail-detailed');
  await settle();
  expect(await page.isVisible('#charges') && await page.isVisible('#mix-pct') && await page.isVisible('#ufpls'), 'detail-only inputs visible after switching to Detailed');

  // drawdown with 0% net growth (low 2% − 2% charges), level £10,000 a year from 65 on £100,000 → runs out at 75
  await page.uncheck('#take-cash');
  await page.uncheck('#inflation-linked');
  await page.fill('#charges', '2');
  await page.fill('#income', '10000');
  await page.click('#scenario [data-value="low"]');
  await settle();
  const low = await val('#runout-low');
  expect(Math.abs(low - 75) < 0.05, 'money runs out at 75 with 0% growth, got ' + low);
  // sustainable to 95 with 0% growth: £100,000 / 30 years
  expect(Math.abs(await val('#sustain-low') - 3333) <= 1, 'sustainable to 95 at 0% ≈ £3,333, got ' + await val('#sustain-low'));
  // higher growth lasts longer
  const highAttr = await page.getAttribute('#runout-high', 'data-value');
  const mid = await val('#runout-mid');
  expect(mid > low && (highAttr === 'never' || Number(highAttr) > mid), `higher growth lasts longer: low ${low}, mid ${mid}, high ${highAttr}`);
  // total received by 80 with 0% growth: all £100,000 paid out by 75
  expect(await val('#recv-low-80') === 100000, 'received by 80 = £100,000, got ' + await val('#recv-low-80'));
  // pot left at 75 is empty in the low scenario
  expect(await val('#left-low-75') === 0, 'nothing left at 75 in the low scenario');

  // mix: 50% annuity at 7% on £100,000 → £3,500 guaranteed
  await page.evaluate(() => { const e = document.querySelector('#mix-pct'); e.value = '50'; e.dispatchEvent(new Event('input', { bubbles: true })); });
  await settle();
  expect(await val('#mix-annuity') === 3500, 'mix annuity £3,500, got ' + await val('#mix-annuity'));

  // summary and persistence
  await page.waitForTimeout(500);
  const summary = await page.evaluate(() => MP.get('summaries.retirement-income').text);
  expect(/^Annuity £7,000\/yr vs drawdown lasts to 75 \(low\)$/.test(summary), 'summary saved: ' + summary);
  await page.reload();
  await page.waitForSelector('#results');
  expect(await page.inputValue('#pot') === '100000' && await page.inputValue('#income') === '10000' && await page.inputValue('#charges') === '2', 'inputs survive reload');
  expect(Math.abs(await val('#runout-low') - 75) < 0.05 && await val('#annuity-income') === 7000, 'results the same after reload');
  // put the mix back to 0 so the screenshots show the main view
  await page.evaluate(() => { const e = document.querySelector('#mix-pct'); e.value = '0'; e.dispatchEvent(new Event('input', { bubbles: true })); });
};
