module.exports = async ({ page, expect }) => {
  const money = async (sel) => Number((await page.innerText(sel)).replace(/[^0-9.\-]/g, ''));

  // 1. Simple view with defaults: salary £35,000 (no profile salary), mortgage £150,000 example,
  //    income 60% = £21,000 × 18 years, funeral £4,800, death-in-service 4 × £35,000, savings £5,000
  await page.waitForSelector('#lf-gap');
  expect(await page.evaluate(() => document.documentElement.getAttribute('data-detail')) === 'simple', 'new accounts start in Simple view');
  expect(!(await page.isVisible('#lf-debts')), 'detailed inputs are hidden in Simple view');
  const simpleGap = 150000 + 21000 * 18 + 4800 - 4 * 35000 - 5000; // £387,800
  expect((await money('#lf-gap')) === simpleGap, 'Simple gap with defaults = £387,800, got ' + (await page.innerText('#lf-gap')));
  expect(/Decreasing term/.test(await page.innerText('#lf-suggest')), 'suggests decreasing term cover for a repayment mortgage');

  // 2. Detailed: £200,000 + £5,000 + £4,800 + £20,000 × 10 + £0 − 4 × £40,000 − £10,000 = £239,800
  await page.click('#mp-detail-detailed');
  await page.waitForSelector('#lf-debts', { state: 'visible' });
  await page.fill('#pr-salary', '40000');
  await page.fill('#lf-mortgage', '200000');
  await page.fill('#lf-debts', '5000');
  await page.fill('#lf-funeral', '4800');
  await page.fill('#lf-income', '20000');
  await page.fill('#lf-child', '11'); // 21 − 11 = 10 years
  expect((await page.inputValue('#lf-years')) === '10', 'youngest child aged 11 gives 10 years');
  await page.fill('#lf-education', '0');
  await page.fill('#lf-existing', '0');
  await page.fill('#lf-partner', '0');
  await page.fill('#lf-dis-mult', '4');
  await page.fill('#lf-savings', '10000');
  expect((await money('#lf-need')) === 409800, 'total need = £409,800, got ' + (await page.innerText('#lf-need')));
  expect((await money('#lf-have')) === 170000, 'existing cover = £170,000');
  expect((await money('#lf-gap')) === 239800, 'gap = £239,800, got ' + (await page.innerText('#lf-gap')));

  // changing the youngest child's age changes the need: age 1 → 20 years → +£200,000
  await page.fill('#lf-child', '1');
  expect((await page.inputValue('#lf-years')) === '20', 'child aged 1 gives 20 years');
  expect((await money('#lf-gap')) === 439800, 'younger child raises the gap to £439,800, got ' + (await page.innerText('#lf-gap')));
  // interest-only mortgage suggests level cover
  await page.click('#lf-mtype button[data-value="interest"]');
  expect(/Level term cover of £200,000/.test(await page.innerText('#lf-suggest')), 'interest-only mortgage suggests level term cover');
  await page.click('#lf-mtype button[data-value="repayment"]');

  // 3. Income protection: £40,000 → take-home (40,000 − 5,486 − 2,194.40) / 12 = £2,693
  await page.click('#tab-income');
  await page.waitForSelector('#ip-gap');
  expect((await money('#ip-takehome')) === 2693, 'monthly take-home = £2,693, got ' + (await page.innerText('#ip-takehome')));
  await page.fill('#ip-essential', '1800');
  await page.fill('#ip-months', '3');
  await page.fill('#ip-full', '4');
  await page.fill('#ip-half', '0');
  await page.fill('#ip-other', '0');
  await page.fill('#ip-existing', '0');
  expect((await money('#ip-gap')) === 1800, 'income gap after sick pay ends = £1,800, got ' + (await page.innerText('#ip-gap')));
  // SSP phase: 1,800 − 123.25 × 52 / 12 = £1,266 short
  const sspGap = Number((await page.locator('#ip-phases tr[data-phase="ssp"] td').last().innerText()).replace(/[^0-9.]/g, ''));
  expect(sspGap === 1266, 'short by £1,266 a month on Statutory Sick Pay, got ' + sspGap);
  // 4 weeks sick pay + 3 months savings (13 weeks) = 17 weeks → 13-week deferred period
  expect((await page.innerText('#ip-deferred')).startsWith('13 weeks'), 'deferred period 13 weeks, got ' + (await page.innerText('#ip-deferred')));
  await page.fill('#ip-months', '6'); // 4 + 26 = 30 → 26 weeks
  expect((await page.innerText('#ip-deferred')).startsWith('26 weeks'), 'deferred period 26 weeks with 6 months of savings');

  // 4. Critical illness: 2 years × £40,000 − £20,000 existing = £60,000
  await page.click('#tab-critical');
  await page.click('#ci-years button[data-value="2"]');
  await page.fill('#ci-existing', '20000');
  expect((await money('#ci-need')) === 60000, 'critical illness cover = £60,000, got ' + (await page.innerText('#ci-need')));

  // summary traffic lights and checklist
  expect((await page.locator('#pr-summary li[data-row="life"] .chip.danger').count()) === 1, 'life cover shows a red light (have £170,000 of £609,800)');
  await page.check('#ck-lpa');

  // persistence after reload: tab, inputs and checklist remembered; home summary saved
  await page.waitForTimeout(600);
  await page.reload();
  await page.waitForSelector('#tab-critical[aria-selected="true"]');
  expect((await page.inputValue('#ci-existing')) === '20000', 'critical illness inputs remembered');
  expect(await page.isChecked('#ck-lpa'), 'checklist remembered');
  await page.click('#tab-life');
  expect((await money('#lf-gap')) === 439800, 'life cover inputs survive reload');
  const summary = await page.evaluate(() => MP.get('summaries.protection').text);
  expect(summary === 'Life cover gap £439,800 · income gap £1,800/month', 'home summary, got ' + summary);
};
