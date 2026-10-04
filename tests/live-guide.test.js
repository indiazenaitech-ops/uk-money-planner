/* Live guide: consent first, then the ElevenLabs widget (stubbed here) gets our client tools. */
module.exports = async ({ page, expect, url }) => {
  // stand-in for the ElevenLabs widget: records the client tools it is given
  await page.route('**/convai-widget-embed@*/**', (route) => route.fulfill({ contentType: 'text/javascript', body: `
    customElements.define('elevenlabs-convai', class extends HTMLElement {
      connectedCallback() { const ev = new CustomEvent('elevenlabs-convai:call', { detail: { config: {} } }); this.dispatchEvent(ev); window.__lgTools = ev.detail.config.clientTools; window.__lgVars = this.getAttribute('dynamic-variables'); }
    });` }));
  await page.goto(url('home.html'));
  await page.waitForSelector('#lg-launcher');
  expect(await page.locator('elevenlabs-convai').count() === 0, 'nothing is sent anywhere before consent');
  await page.click('#lg-launcher');
  await page.waitForSelector('#lg-start');
  await page.click('#lg-start'); // plan sharing left unticked
  await page.waitForFunction(() => window.__lgTools);
  const names = await page.evaluate(() => Object.keys(window.__lgTools).sort().join(','));
  expect(names === 'get_my_plan,open_tool,read_screen,set_view,show_term', 'client tools registered: ' + names);
  const vars = JSON.parse(await page.evaluate(() => window.__lgVars));
  expect(vars.plan_shared === 'no' && vars.greeting_name === '' && vars.current_page === 'home', 'no personal data in variables without consent: ' + JSON.stringify(vars));

  // privacy: no plan without permission
  const denied = await page.evaluate(() => window.__lgTools.get_my_plan());
  expect(/not allowed/.test(denied), 'plan withheld without permission');

  // open a tool in the panel and read it
  const opened = await page.evaluate(() => window.__lgTools.open_tool({ tool_id: 'savings' }));
  expect(/Savings/.test(opened), 'open_tool reports what it opened');
  await page.waitForSelector('#lg-panel:not([hidden])');
  const frame = page.frameLocator('#lg-frame');
  await frame.locator('.tabs').waitFor();
  const screen = await page.evaluate(() => window.__lgTools.read_screen());
  expect(/Savings & ISAs/.test(screen) && /hidden/.test(screen), 'read_screen gives headings but hides figures: ' + screen.slice(0, 120));

  // view switch reaches the panel too
  await page.evaluate(() => window.__lgTools.set_view({ mode: 'detailed' }));
  await page.waitForTimeout(200);
  const frameDetail = await frame.locator('html').getAttribute('data-detail');
  expect(frameDetail === 'detailed' && await page.getAttribute('html', 'data-detail') === 'detailed', 'set_view applies to page and panel');

  // terms show on screen with the app's wording
  const term = await page.evaluate(() => window.__lgTools.show_term({ term: 'lifetime isa' }));
  expect(/25%/.test(term) && await page.isVisible('.lg-term'), 'show_term returns and shows the definition');

  // allow plan sharing, then the plan is available
  await page.click('#lg-panel-close');
  await page.click('#lg-launcher');
  await page.check('#lg-share-set');
  await page.waitForTimeout(400);
  const plan = await page.evaluate(() => window.__lgTools.get_my_plan());
  expect(/Priorities:/.test(plan) && /Plan steps:/.test(plan) && /Dreams:/.test(plan), 'plan shared after permission: ' + plan.split('\n')[0]);
  await page.click('#lg-stop');
  await page.waitForTimeout(400);
  expect(await page.locator('elevenlabs-convai').count() === 0, 'guide can be switched off');
};
