module.exports = async ({ page, expect }) => {
  // start from a template
  await page.click('[data-template="emergency"]');
  await page.fill('#g-target', '6000');
  await page.fill('#g-saved', '1200');
  await page.click('#g-save');
  await page.waitForSelector('#goal-list .goal');
  expect((await page.locator('#goal-list .goal').count()) === 1, 'one goal created');

  // add a second goal from scratch, due 2 years out with no growth
  await page.click('#new-goal');
  await page.fill('#g-name', 'Trip to Japan');
  await page.fill('#g-target', '4800');
  const d = new Date(); d.setFullYear(d.getFullYear() + 2);
  await page.fill('#g-date', d.toISOString().slice(0, 10));
  await page.fill('#g-rate', '0');
  await page.click('#g-save');
  await page.waitForFunction(() => document.querySelectorAll('#goal-list .goal').length === 2);

  // turn off inflation: 4800 over ~24 months at 0% should be ~£200/month
  await page.uncheck('#inflate');
  await page.waitForTimeout(200);
  const trip = page.locator('#goal-list .goal', { hasText: 'Trip to Japan' });
  const monthly = Number((await trip.locator('.goal-monthly').innerText()).replace(/[^0-9.]/g, ''));
  expect(monthly >= 195 && monthly <= 210, 'monthly needed ≈ £200, got ' + monthly);

  // add money and check saved total updates
  await trip.locator('.add-money').click();
  await page.fill('#add-amount', '300');
  await page.click('#add-save');
  await page.waitForTimeout(200);
  const saved = await page.locator('#goal-list .goal', { hasText: 'Trip to Japan' }).locator('.goal-saved').innerText();
  expect(saved.includes('300'), 'saved shows £300, got ' + saved);

  // affordability: £50 spare should be short
  await page.fill('#spare', '50');
  await page.locator('#spare').dispatchEvent('change');
  await page.waitForTimeout(200);
  expect(/short/.test(await page.innerText('#afford-result')), 'shows a shortfall when spare money is low');

  // persists across reload
  await page.waitForTimeout(400);
  await page.reload();
  await page.waitForSelector('#goal-list .goal');
  expect((await page.locator('#goal-list .goal').count()) === 2, 'goals survive reload');
};
