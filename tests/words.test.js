/* Money words page and narrated audio (Eleven v4 recordings in /audio). */
const fs = require('fs');
const path = require('path');
module.exports = async ({ page, expect, url, ROOT }) => {
  // every listed clip exists on disk and is a real MP3
  const keys = await page.evaluate(() => MP.AUDIO);
  const missing = keys.filter((k) => { const f = path.join(ROOT, 'audio', k + '.mp3'); return !fs.existsSync(f) || fs.statSync(f).size < 20000; });
  expect(keys.length === 22 && missing.length === 0, 'all recordings present: missing ' + missing.join(','));
  await page.goto(url('words.html'));
  await page.waitForSelector('#words-list .word');
  const total = await page.locator('#words-list .word').count();
  expect(total >= 50, 'all glossary words listed: ' + total);
  await page.check('#words-audio');
  expect((await page.locator('#words-list .word').count()) === 16, 'audio filter shows the 16 narrated words');
  await page.fill('#words-search', 'lifetime');
  await page.waitForTimeout(100);
  expect((await page.locator('#words-list .word').count()) === 1, 'search narrows to one');
  // playing a clip loads the file and toggles the button
  await page.click('#words-list .listen');
  await page.waitForTimeout(800);
  const state = await page.evaluate(() => { const b = document.querySelector('#words-list .listen'); return b.getAttribute('aria-pressed'); });
  expect(state === 'true', 'listen button shows it is playing');
  await page.click('#words-list .listen');
  expect(await page.getAttribute('#words-list .listen', 'aria-pressed') === 'false', 'press again to stop');
  // guided setup questions offer narration
  await page.goto(url('guide.html?restart=1'));
  await page.waitForSelector('.guide-card');
  expect(await page.locator('.guide-card .listen[data-audio="guide-knowledge"]').count() === 1, 'first guide question is narrated');
};
