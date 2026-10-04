/* Money Planner checks. Usage: node tests/check.js [toolId|home|all]
   For each page: create an account through the real sign-in form, open the page over file://,
   fail on console errors, run tests/<id>.test.js if present, check nothing scrolls sideways at
   390 px, and save screenshots to tests/shots/<id>/ (desktop, mobile, dark, after-test). */
const path = require('path');
const fs = require('fs');
let playwright;
try { playwright = require('playwright'); } catch (e) {
  try { playwright = require('/opt/node-tools/node_modules/playwright'); } catch (e2) { playwright = require('playwright-core'); }
}

const ROOT = path.resolve(__dirname, '..');
const url = (p) => 'file://' + path.join(ROOT, p);
const TOOLS = (() => { const w = {}; new Function('window', fs.readFileSync(path.join(ROOT, 'shared/tools.js'), 'utf8'))(w); return w.MP_TOOLS.map((t) => t.id); })();

function expect(cond, msg) { if (!cond) throw new Error('Assertion failed: ' + msg); }

async function signUp(page) {
  await page.goto(url('index.html'));
  await page.click('#tab-register');
  await page.fill('#reg-name', 'Priya Sharma');
  await page.fill('#reg-email', 'priya@example.co.uk');
  await page.fill('#reg-password', 'correct-horse-42');
  await page.fill('#reg-password2', 'correct-horse-42');
  await page.click('#reg-submit');
  await page.waitForURL(/guide\.html/, { timeout: 20000 });
  await page.waitForSelector('#guide-q');
  await page.goto(url('home.html'));
  await page.waitForSelector('#profile-form');
}

async function checkPage(browser, id) {
  const rel = id === 'home' || id === 'live-guide' ? 'home.html' : id === 'guide' ? 'guide.html' : `apps/${id}/index.html`;
  const shots = path.join(__dirname, 'shots', id);
  fs.mkdirSync(shots, { recursive: true });
  const errors = [];
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 860 } });
  const page = await ctx.newPage();
  page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
  page.on('console', (m) => { if (m.type() === 'error' && !/favicon|net::ERR_|Failed to load resource/.test(m.text())) errors.push('console: ' + m.text()); });
  page.on('dialog', (d) => d.accept());

  await signUp(page);
  await page.goto(url(rel));
  await page.waitForSelector('.mp-header', { timeout: 15000 });
  await page.waitForTimeout(300);
  await page.screenshot({ path: path.join(shots, 'desktop.png'), fullPage: true });

  const testFile = path.join(__dirname, `${id}.test.js`);
  let assertions = 0;
  if (fs.existsSync(testFile)) {
    const test = require(testFile);
    const counted = (c, m) => { assertions++; expect(c, m); };
    await test({ page, expect: counted, log: (...a) => console.log('   ', ...a), url, ROOT });
    await page.waitForTimeout(400);
    await page.screenshot({ path: path.join(shots, 'after-test.png'), fullPage: true });
    // saved state survives a reload
    await page.reload(); await page.waitForSelector('.mp-header');
  } else if (!['home', 'guide', 'live-guide'].includes(id)) {
    errors.push(`no test file tests/${id}.test.js`);
  }

  await page.setViewportSize({ width: 390, height: 844 });
  await page.waitForTimeout(250);
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  if (overflow > 1) errors.push(`page scrolls sideways by ${overflow}px at 390px wide`);
  await page.screenshot({ path: path.join(shots, 'mobile.png'), fullPage: true });
  await page.evaluate(() => { document.documentElement.setAttribute('data-theme', 'dark'); });
  await page.click('#mp-theme').catch(() => {}); // toggles to light; click again for dark so onTheme redraws run
  await page.click('#mp-theme').catch(() => {});
  await page.waitForTimeout(250);
  await page.screenshot({ path: path.join(shots, 'dark-mobile.png'), fullPage: true });
  await ctx.close();
  return { id, errors, assertions };
}

(async () => {
  const which = process.argv[2] || 'all';
  const ids = which === 'all' ? ['home', 'guide', 'live-guide'].concat(TOOLS) : [which];
  const browser = await playwright.chromium.launch({ headless: true });
  let failed = 0;
  for (const id of ids) {
    let r;
    try { r = await checkPage(browser, id); } catch (e) { r = { id, errors: [e.stack || String(e)], assertions: 0 }; }
    const ok = !r.errors.length;
    if (!ok) failed++;
    console.log(`${ok ? 'PASS' : 'FAIL'}  ${id}${r.assertions ? `  (${r.assertions} assertions)` : ''}`);
    r.errors.forEach((e) => console.log('   - ' + e));
  }
  await browser.close();
  process.exit(failed ? 1 : 0);
})();
