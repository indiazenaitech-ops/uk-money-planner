module.exports = async ({ page, expect }) => {
  const money = async (sel) => Number((await page.innerText(sel)).replace(/[^0-9.\-]/g, ''));
  await page.waitForSelector('#tab-cb');
  // new accounts start in Simple view: advanced inputs hidden
  expect(!(await page.isVisible('#cb-pension')), 'pension contributions hidden in Simple view');

  // 1. Child Benefit: 2 children, £50,000 → £2,337.40 and no charge
  await page.click('#tab-cb');
  await page.click('#cb-household button[data-value="couple"]');
  await page.fill('#cb-children', '2');
  await page.fill('#cb-partner', '30000');
  await page.fill('#cb-income', '50000');
  expect((await money('#cb-benefit')) === 2337.4, 'benefit for 2 children = £2,337.40, got ' + (await page.innerText('#cb-benefit')));
  expect((await money('#cb-charge')) === 0, 'no charge at £50,000, got ' + (await page.innerText('#cb-charge')));
  // £70,000 → 50% charge
  await page.fill('#cb-income', '70000');
  expect((await money('#cb-charge')) === 1168.7, 'charge at £70,000 = £1,168.70, got ' + (await page.innerText('#cb-charge')));
  expect(/£10,000 would cut the charge to £0/.test(await page.innerText('#cb-pension-tip')), 'pension tip: £10,000 cuts the charge to £0');
  // £80,000 → charge equals the benefit
  await page.fill('#cb-income', '80000');
  expect((await money('#cb-charge')) === (await money('#cb-benefit')) && (await money('#cb-net')) === 0, 'charge equals benefit at £80,000');
  // Detailed: a £10,000 pension contribution takes adjusted net income to £70,000
  await page.click('#mp-detail-detailed');
  await page.fill('#cb-pension', '10000');
  expect((await money('#cb-charge')) === 1168.7, 'pension contribution reduces adjusted net income (charge back to £1,168.70)');
  await page.fill('#cb-pension', '0');

  // 2. Tax-Free Childcare: 20% top-up, capped at £2,000 per child
  await page.click('#tab-tfc');
  await page.fill('#tfc-children', '1');
  await page.fill('#tfc-cost', '10000');
  expect((await money('#tfc-topup')) === 2000, 'top-up capped at £2,000, got ' + (await page.innerText('#tfc-topup')));
  await page.fill('#tfc-cost', '5000');
  expect((await money('#tfc-topup')) === 1000, 'top-up on £5,000 = £1,000');
  expect((await money('#tfc-yourcost')) === 4000, 'you pay £4,000');
  await page.check('#tfc-uc');
  expect((await money('#tfc-topup')) === 0, 'no top-up with Universal Credit');
  await page.uncheck('#tfc-uc');

  // 3. Maternity pay: £600 a week → £540 for the first 6 weeks, then the flat rate
  await page.click('#tab-mat');
  await page.fill('#mat-weekly', '600');
  expect((await money('#mat-first6')) === 540, 'SMP first 6 weeks = £540, got ' + (await page.innerText('#mat-first6')));
  expect((await money('#mat-flat')) === 194.32, 'SMP weeks 7-39 = £194.32');
  expect((await money('#mat-total')) === Math.round(540 * 6 + 194.32 * 33), 'total over 52 weeks = £9,653');
  expect((await page.locator('#mat-weeks tbody tr').count()) === 52, 'week-by-week table has 52 rows');
  await page.click('#mat-dream');
  await page.click('#mat-dream');
  const goals = await page.evaluate(() => MP.goals().filter((g) => g.icon === '👶'));
  expect(goals.length === 1 && goals[0].name === 'Parental leave fund' && goals[0].target > 0, 'one Parental leave fund dream, no duplicates');

  // 4. New baby: gifted pushchair removes it from the total
  await page.click('#tab-baby');
  const before = await money('#baby-oneoff');
  await page.click('#baby-mode-pushchair button[data-value="gift"]');
  expect((await money('#baby-oneoff')) === before - 400, 'gifted pushchair takes £400 off');
  await page.fill('#baby-m-formula', '0');
  await page.click('#baby-dream');
  expect((await page.evaluate(() => MP.goals().length)) === 2, 'new baby dream added');

  // persistence after reload
  await page.waitForTimeout(600);
  await page.reload();
  await page.waitForSelector('#tab-baby[aria-selected="true"]');
  expect((await page.inputValue('#baby-m-formula')) === '0', 'baby inputs remembered');
  await page.click('#tab-cb');
  expect((await page.inputValue('#cb-income')) === '80000', 'income remembered');
  const summary = await page.evaluate(() => MP.get('summaries.family').text);
  expect(/Tax-Free Childcare £1,000/.test(summary), 'home summary, got ' + summary);
};
