module.exports = async ({ page, expect }) => {
  const num = async (sel) => Number((await page.innerText(sel)).replace(/[^0-9.\-−]/g, '').replace('−', '-'));

  // Detailed view: itemised lists
  await page.click('#mp-detail-detailed');
  await page.waitForSelector('#add-asset', { state: 'visible' });
  async function add(btn, type, value, name) {
    await page.click(btn);
    await page.selectOption('#i-type', type);
    if (name) await page.fill('#i-name', name);
    await page.fill('#i-value', String(value));
    await page.click('#i-save');
    await page.waitForSelector('.mp-modal', { state: 'detached' });
  }
  await add('#add-asset', 'savings', 10000);
  await add('#add-asset', 'home', 250000);
  await add('#add-debt', 'mortgage', 150000);
  await add('#add-debt', 'card', 2000, 'Visa card');
  expect((await page.locator('#asset-list .nw-item').count()) === 2 && (await page.locator('#debt-list .nw-item').count()) === 2, 'four items listed');
  expect((await num('#nw-net')) === 108000, 'net worth £108,000, got ' + (await page.innerText('#nw-net')));
  expect((await num('#nw-liquid')) === 8000, 'liquid net worth £8,000, got ' + (await page.innerText('#nw-liquid')));
  expect((await page.innerText('#nw-ltv')).trim() === '60%', 'loan to value 60%, got ' + (await page.innerText('#nw-ltv')));
  expect((await page.innerText('#nw-dta')).trim() === '58%', 'debt to assets 58%, got ' + (await page.innerText('#nw-dta')));

  // deleting the card updates totals
  await page.locator('#debt-list .nw-item', { hasText: 'Visa card' }).locator('.delete-item').click();
  await page.waitForFunction(() => document.querySelectorAll('#debt-list .nw-item').length === 1);
  expect((await num('#nw-net')) === 110000 && (await num('#nw-liab')) === 150000, 'deleting the card gives £110,000 net, £150,000 owed');

  // a student loan is left out by default
  await add('#add-debt', 'student', 30000);
  expect((await num('#nw-net')) === 110000, 'student loan excluded by default');
  await page.uncheck('#excl-student');
  expect((await num('#nw-net')) === 80000, 'student loan counted when the option is off');

  // Simple view with the same figures gives the same answer
  await page.click('#nw-reset');
  await page.click('#mp-detail-simple');
  await page.waitForSelector('#s-cash', { state: 'visible' });
  await page.fill('#s-cash', '10000');
  await page.fill('#s-home', '250000');
  await page.fill('#s-mortgage', '150000');
  await page.fill('#s-debts', '2000');
  expect((await num('#nw-net')) === 108000, 'simple totals give £108,000, got ' + (await page.innerText('#nw-net')));
  expect((await num('#nw-liquid')) === 8000, 'simple liquid £8,000');

  // switching to Detailed keeps the data as items
  await page.click('#mp-detail-detailed');
  expect((await page.locator('#asset-list .nw-item').count()) === 2 && (await num('#nw-net')) === 108000, 'simple totals become items in Detailed view');
  await page.click('#mp-detail-simple');

  // snapshot
  await page.click('#snap-save');
  await page.waitForSelector('#snap-table tbody tr');
  expect((await page.locator('#snap-table tbody tr').count()) === 1, 'one snapshot listed');
  expect((await page.innerText('#snap-table tbody tr')).includes('108,000'), 'snapshot shows £108,000');

  // persists across reload
  await page.waitForTimeout(500);
  await page.reload();
  await page.waitForSelector('#nw-net');
  expect((await num('#nw-net')) === 108000, 'net worth survives reload');
  expect((await page.locator('#snap-table tbody tr').count()) === 1, 'snapshot survives reload');
  expect((await page.inputValue('#s-home')) === '250000', 'simple field remembered');
};
