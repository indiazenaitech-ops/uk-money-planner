const fs = require('fs');

module.exports = async ({ page, expect }) => {
  const txt = async (sel) => (await page.innerText(sel)).trim();
  const set = async (sel, v) => { await page.fill(sel, String(v)); await page.waitForTimeout(80); };

  await page.waitForSelector('#se-table');
  // new accounts start in Simple view: advanced inputs are hidden
  expect(!(await page.locator('#pension').isVisible()), 'pension input hidden in Simple view');

  // profit £30,000 (turnover £35,000, expenses £5,000), no other income, England
  await set('#turnover', 35000);
  await set('#expenses', 5000);
  await set('#job', 0);
  expect((await txt('#r-taxable-profit')) === '£30,000.00', 'profit £30,000.00, got ' + (await txt('#r-taxable-profit')));
  expect((await txt('#r-tax')) === '£3,486.00', 'income tax £3,486.00, got ' + (await txt('#r-tax')));
  expect((await txt('#r-class4')) === '£1,045.80', 'Class 4 £1,045.80, got ' + (await txt('#r-class4')));
  expect((await txt('#r-total')) === '£4,531.80', 'total £4,531.80, got ' + (await txt('#r-total')));
  expect((await txt('#r-poa')) === '£2,265.90', 'each POA £2,265.90, got ' + (await txt('#r-poa')));
  expect((await txt('#poa-jan')) === '£6,797.70', '31 January payment £6,797.70, got ' + (await txt('#poa-jan')));
  expect((await txt('#set-aside')) === '£378', 'set aside £378 a month, got ' + (await txt('#set-aside')));

  // turnover £900, no expenses → trading allowance covers it
  await set('#turnover', 900);
  await set('#expenses', 0);
  expect((await txt('#r-taxable-profit')) === '£0.00', 'taxable profit £0.00 via trading allowance, got ' + (await txt('#r-taxable-profit')));
  expect(/trading allowance/.test(await txt('#allowance-note')), 'says the trading allowance was used');
  expect((await txt('#r-poa')) === 'Not needed', 'no payments on account on a £0 bill');

  // Detailed: job salary £20,000 + profit £10,000
  await page.click('#mp-detail-detailed');
  await page.waitForTimeout(150);
  expect(await page.locator('#pension').isVisible(), 'pension input shown in Detailed view');
  await set('#turnover', 11000);
  await set('#expenses', 1000);
  await set('#job', 20000);
  expect((await txt('#r-paye')) === '−£1,486.00', 'PAYE on the job £1,486.00, got ' + (await txt('#r-paye')));
  expect((await txt('#r-tax')) === '£2,000.00', 'extra income tax £2,000.00, got ' + (await txt('#r-tax')));
  expect((await txt('#r-class4')) === '£0.00', 'Class 4 £0.00, got ' + (await txt('#r-class4')));
  // Plan 2 on combined income £30,000: 9% of £615 = £55.35 (nothing taken by PAYE below the threshold)
  await page.check('#loan-plan2');
  await page.waitForTimeout(80);
  expect((await txt('#r-sl')) === '£55.35', 'Plan 2 £55.35 through Self Assessment, got ' + (await txt('#r-sl')));
  expect((await txt('#r-total')) === '£2,055.35', 'total £2,055.35, got ' + (await txt('#r-total')));

  // expense helper: 2,000 miles (£900) + home office 51-100 hours for 12 months (£216)
  await page.click('#expense-helper > summary');
  await set('#x-miles', 2000);
  await page.selectOption('#x-home', '18');
  await page.waitForTimeout(80);
  expect(/£1,116\.00/.test(await txt('#x-total')), 'helper total £1,116.00, got ' + (await txt('#x-total')));
  await page.click('#x-use');
  await page.waitForTimeout(80);
  expect((await page.inputValue('#expenses')) === '1116', 'helper total copied into expenses');

  // .ics download
  const [dl] = await Promise.all([page.waitForEvent('download'), page.click('#ics')]);
  expect(/\.ics$/.test(dl.suggestedFilename()), 'downloads an .ics file, got ' + dl.suggestedFilename());
  const p = await dl.path();
  const ics = p ? fs.readFileSync(p, 'utf8') : '';
  expect(/^BEGIN:VCALENDAR/.test(ics) && /DTSTART;VALUE=DATE:20280131/.test(ics) && /END:VCALENDAR\s*$/.test(ics), 'calendar file has the 31 January 2028 deadline');

  // persistence after reload
  await page.waitForTimeout(500);
  await page.reload();
  await page.waitForSelector('#se-table');
  expect((await page.inputValue('#turnover')) === '11000', 'turnover remembered');
  expect((await page.inputValue('#job')) === '20000', 'job salary remembered');
  expect(await page.isChecked('#loan-plan2'), 'student loan plan remembered');
  expect((await page.inputValue('#expenses')) === '1116', 'expenses remembered');
  // profit £9,884 + job £20,000: tax £3,462.80 less PAYE £1,486 = £1,976.80
  expect((await txt('#r-tax')) === '£1,976.80', 'results recomputed after reload, got ' + (await txt('#r-tax')));
};
