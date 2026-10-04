module.exports = async ({ page, expect }) => {
  // new accounts start in Simple view, as a beginner
  await page.waitForSelector('[data-template="emergency"]');
  expect(!(await page.isVisible('#inflate')), 'Simple view hides the rising-prices toggle');
  expect(await page.locator('.explain').first().isVisible(), 'beginners see a 💡 explanation');
  expect((await page.locator('.advice-card').count()) === 1, 'advice card is shown');

  // start from a template (Simple form: no "where will you save" or growth rate)
  await page.click('[data-template="emergency"]');
  expect(!(await page.isVisible('#g-rate')) && !(await page.isVisible('#g-home')), 'Simple goal form hides growth rate and where to save');
  expect(await page.isVisible('#g-date') && await page.isVisible('#g-priority'), 'Simple goal form keeps date and priority');
  await page.fill('#g-target', '6000');
  await page.fill('#g-saved', '1200');
  await page.click('#g-save');
  await page.waitForSelector('#goal-list .goal');
  expect((await page.locator('#goal-list .goal').count()) === 1, 'one goal created');
  // £6,000 in a year, with £1,200 saved, needs roughly £400+/month in Simple too (defaults: inflation on, 3.5%)
  const simpleMonthly = Number((await page.locator('#goal-list .goal-monthly').first().innerText()).replace(/[^0-9.]/g, ''));
  expect(simpleMonthly > 380 && simpleMonthly < 430, 'Simple view still computes the monthly figure, got ' + simpleMonthly);

  // switch to Detailed to reach the advanced inputs
  await page.click('#mp-detail-detailed');
  await page.waitForSelector('#inflate', { state: 'visible' });
  expect(await page.isVisible('#inflate'), 'Detailed view shows the rising-prices toggle');

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

  // confident customers do not see the 💡 lines
  await page.evaluate(() => MP.setPrefs({ knowledge: 'confident' }));
  await page.waitForTimeout(100);
  expect((await page.locator('.explain:visible').count()) === 0, 'explanations hidden for confident customers');

  // persists across reload
  await page.waitForTimeout(400);
  await page.reload();
  await page.waitForSelector('#goal-list .goal');
  expect((await page.locator('#goal-list .goal').count()) === 2, 'goals survive reload');

  // a dream created by the guided setup is labelled
  await page.evaluate(() => { const l = MP.goals(); l.push({ id: 'g1', source: 'guide-home', name: 'First home deposit', icon: '🏡', target: 25000, saved: 0, date: '2030-01-01', priority: 1, home: 'easy' }); MP.saveGoals(l); });
  await page.waitForTimeout(400);
  await page.reload();
  await page.waitForSelector('#goal-list .goal');
  expect((await page.locator('#goal-list .guide-note').count()) === 1, 'guided-setup dream shows "Added by your guided setup"');
  await page.evaluate(() => MP.setPrefs({ knowledge: '' }));
};
