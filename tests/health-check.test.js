module.exports = async ({ page, expect }) => {
  // Pick an answer on the current question: 'best' / 'worst' by points, or a fixed value per question.
  async function choose(kind, overrides) {
    const id = await page.evaluate(({ kind, overrides }) => {
      const fs = document.querySelector('.hc-step .hc-fieldset');
      const q = fs.dataset.q;
      const inputs = Array.from(fs.querySelectorAll('input[type=radio]'));
      if (overrides && overrides[q]) return inputs.find((i) => i.value === overrides[q]).id;
      const scored = inputs.filter((i) => i.dataset.pts !== 'na');
      scored.sort((a, b) => Number(a.dataset.pts) - Number(b.dataset.pts));
      return (kind === 'best' ? scored[scored.length - 1] : scored[0]).id;
    }, { kind, overrides });
    await page.click(`label[for="${id}"]`);
  }
  async function runCheck(kind, overrides) {
    await page.waitForSelector('#hc-progress-text');
    const total = Number(await page.getAttribute('#hc-progress-text', 'data-total'));
    for (let i = 0; i < total; i++) {
      await choose(kind, overrides);
      await page.click('#hc-next');
    }
    await page.waitForSelector('#hc-score');
    return total;
  }
  const score = async () => Number(await page.getAttribute('#hc-score', 'data-score'));

  // Simple view (the default for new accounts) asks 10 questions
  await page.waitForSelector('#hc-progress-text');
  const simpleTotal = Number(await page.getAttribute('#hc-progress-text', 'data-total'));
  expect(simpleTotal === 10, 'Simple view asks 10 questions, got ' + simpleTotal);
  expect((await page.locator('#hc-mode-note').innerText()).includes('10'), 'Simple view says it asks 10 questions');

  // Detailed view asks all 15
  await page.click('#mp-detail-detailed');
  await page.waitForTimeout(150);
  const detailedTotal = Number(await page.getAttribute('#hc-progress-text', 'data-total'));
  expect(detailedTotal === 15, 'Detailed view asks 15 questions, got ' + detailedTotal);

  // "Show all questions" list mode shows every question at once
  await page.click('#hc-mode-list');
  expect((await page.locator('.hc-list .hc-fieldset').count()) === 15, 'list mode shows all 15 questions');
  await page.click('#hc-mode-step');

  // all best answers → high score, nothing urgent
  await runCheck('best');
  const best = await score();
  expect(best >= 90, 'all best answers score at least 90, got ' + best);

  // retake with all worst answers → low score, debt action first
  await page.click('#hc-retake');
  await runCheck('worst');
  const worst = await score();
  expect(worst <= 25, 'all worst answers score 25 or less, got ' + worst);
  expect((await page.locator('#hc-actions .hc-action').count()) === 6, 'up to 6 actions shown');
  expect((await page.locator('#hc-since').innerText()).includes('Down'), 'since last time shows the drop');

  // retake: good answers except missed payments → a debt action comes first, with free debt advice
  await page.click('#hc-retake');
  await runCheck('best', { b_missed: 'several' });
  const firstTopic = await page.getAttribute('#hc-actions .hc-action >> nth=0', 'data-topic');
  expect(firstTopic === 'debt', 'missed payments put a debt action first, got ' + firstTopic);
  expect((await page.locator('#hc-actions .advice-card').innerText()).includes('StepChange'), 'free debt advice card shown');

  // history survives a reload, with a trend chart
  await page.waitForTimeout(500);
  await page.reload();
  await page.waitForSelector('#hc-score');
  expect((await page.locator('#hc-history li').count()) === 3, 'history keeps all 3 checks after reload');
  expect((await page.locator('#hc-trend svg.chart').count()) === 1, 'trend chart shown when there are 2+ checks');

  // summary saved for the home page
  const summary = await page.evaluate(() => (MP.get('summaries.health-check') || {}).text || '');
  expect(/^Money score \d+\/100 · \d+ actions?$/.test(summary), 'home summary saved, got ' + summary);
  const hist = await page.evaluate(() => MP.get('tools.health-check').history.length);
  expect(hist === 3, 'history stored in the vault');
};
