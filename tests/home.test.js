module.exports = async ({ page, expect }) => {
  await page.fill('#p-dob', '1988-05-14');
  await page.selectOption('#p-region', 'scotland');
  await page.fill('#p-salary', '42000');
  await page.click('#p-save');
  await page.waitForTimeout(500);
  await page.reload();
  await page.waitForSelector('#profile-form');
  expect(await page.inputValue('#p-salary') === '42000', 'salary survives reload');
  expect(await page.inputValue('#p-region') === 'scotland', 'region survives reload');
  expect((await page.locator('#tools .tile').count()) === await page.evaluate(() => MP_TOOLS.length), 'every tool listed');
  expect((await page.locator('#key-dates li').count()) >= 2, 'key dates listed');
  const [dl] = await Promise.all([page.waitForEvent('download'), page.click('#dates-ics')]);
  expect(/\.ics$/.test(dl.suggestedFilename()), 'calendar file downloads');
  await page.click('#open-report');
  await page.waitForSelector('#print');
  expect(/Scotland/.test(await page.innerText('.report')), 'report shows saved details');
  await page.goBack();
  await page.waitForSelector('#profile-form');
  // stored data is encrypted, not plain text
  const raw = await page.evaluate(() => localStorage.getItem('mp.users.v1'));
  expect(!/42000|scotland/.test(raw), 'vault is not stored in plain text');
  // sign out and back in
  await page.click('#mp-signout');
  await page.waitForURL(/index\.html/);
  await page.fill('#login-email', 'priya@example.co.uk');
  await page.fill('#login-password', 'wrong-password-1');
  await page.click('#login-submit');
  await page.waitForSelector('#login-error:not([hidden])');
  await page.fill('#login-password', 'correct-horse-42');
  await page.click('#login-submit');
  await page.waitForURL(/home\.html/);
  await page.waitForSelector('#profile-form');
  expect(await page.inputValue('#p-salary') === '42000', 'data decrypts after signing back in');
};
