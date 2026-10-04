/* Guided setup: answers branch by priority, wording adapts to knowledge, and the result personalises the app. */
module.exports = async ({ page, expect, url }) => {
  const step = () => page.getAttribute('.guide-card', 'data-step');
  const choose = async (value) => { await page.check(`.guide-card input[value="${value}"]`); await page.click('#guide-next'); };
  const seen = [];
  const answers = {
    knowledge: () => choose('new'),
    detail: () => choose('simple'),
    advice: () => choose('yes'),
    about: async () => { await page.fill('#guide-dob', '1988-05-14'); await page.fill('#guide-salary', '38000'); await page.click('#guide-next'); },
    lifeStage: () => choose('building'),
    priorities: async () => {
      for (const v of ['debt', 'home', 'retire']) await page.click(`.choice-tile[data-value="${v}"]`);
      // simple mode allows only 3
      await page.click('.choice-tile[data-value="invest"]');
      await page.click('#guide-next');
    },
    leftover: () => choose('no'),
    debtFeel: () => choose('behind'),
    homeFirst: () => choose('yes'),
    homePrice: async () => { await page.fill('#guide-input', '250000'); await page.click('#guide-next'); },
    homeDeposit: async () => { await page.fill('#guide-input', '5000'); await page.click('#guide-next'); },
    homeWhen: () => choose('3'),
    riskReaction: () => choose('balanced'),
    pensionKnow: () => choose('no'),
    retireAge: async () => { await page.fill('#guide-input', '67'); await page.click('#guide-next'); }
  };
  await page.goto(url('guide.html?restart=1'));
  await page.waitForSelector('.guide-card');
  for (let i = 0; i < 30; i++) {
    const s = await step();
    if (s === 'plan') break;
    seen.push(s);
    if (s === 'knowledge') {
      // wording adapts: the beginner wording appears after choosing "new"
    }
    if (!answers[s]) throw new Error('unexpected step ' + s);
    await answers[s]();
    await page.waitForTimeout(60);
  }
  expect(await step() === 'plan', 'reached the plan');
  expect(!seen.includes('savingsMonths') && !seen.includes('debtTotal') && !seen.includes('pensionTotal'), 'only relevant, simple-mode questions asked: ' + seen.join(','));
  const prio = await page.evaluate(() => MP.prefs().priorities);
  expect(prio.length === 3 && !prio.includes('invest'), 'simple mode caps priorities at 3');

  const first = await page.getAttribute('#plan-list li:first-child', 'data-tool');
  expect(first === 'debt', 'being behind on payments puts debt first, got ' + first);
  expect(await page.locator('a[href*="stepchange"]').count() > 0, 'free debt advice is signposted');
  expect(await page.locator('#plan-list li[data-tool="retirement"]').count() === 1, 'retirement is in the plan');
  expect(await page.locator('a[href="https://www.unbiased.co.uk"]').count() > 0, 'adviser seekers are pointed to unbiased.co.uk');

  const goals = await page.evaluate(() => MP.goals());
  const home = goals.find((g) => g.source === 'guide-home');
  expect(home && home.target === 25000 && home.saved === 5000 && home.home === 'lisa', 'first-home deposit dream created with a Lifetime ISA: ' + JSON.stringify(home));
  expect(await page.getAttribute('html', 'data-detail') === 'simple', 'simple view applied');
  expect(await page.getAttribute('html', 'data-knowledge') === 'new', 'beginner explanations on');

  // a re-run updates rather than duplicates the dream
  await page.click('#guide-redo');
  for (let i = 0; i < 30; i++) {
    const s = await step();
    if (s === 'plan') break;
    await page.click('#guide-next');
    await page.waitForTimeout(40);
  }
  const n = await page.evaluate(() => MP.goals().filter((g) => g.source === 'guide-home').length);
  expect(n === 1, 'no duplicate dreams after re-running');

  // home shows the plan; the Simple/Detailed switch persists
  await page.goto(url('home.html'));
  await page.waitForSelector('#your-plan');
  expect(await page.locator('#home-plan li').count() >= 3, 'plan shown on the dashboard');
  await page.click('#mp-detail-detailed');
  await page.waitForTimeout(400);
  await page.reload();
  await page.waitForSelector('#your-plan');
  expect(await page.getAttribute('html', 'data-detail') === 'detailed', 'detail preference survives reload');
  await page.goto(url('guide.html?restart=1'));
  await page.waitForSelector('.guide-card');
};
