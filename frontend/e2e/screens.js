/**
 * Screenshots of every main screen in light, dark and phone layouts, for a
 * visual check after UI changes. Seeds a little progress first so the
 * dashboard, reviews and item pages have something to show. The last two
 * screens are a hosted site's (auth mode iam, against the test IAM): the Sign
 * in page, and the account menu open over the kanji dashboard. Every screen
 * is checked for horizontal overflow and errors on the way.
 *
 *   npm run screens            → frontend/e2e/shots/screen-*.png
 *   npm run screens -- kanji   → only screens whose name contains "kanji"
 */
const path = require('path');
const fs = require('fs');
const { isolate, startApp, closeAll, iamToken, iamSession } = require('./helpers');
isolate('academy-screens'); // before the server starts: a throwaway database

const { launch, watch, SHOTS } = require('./browser');

const FILTER = process.argv[2] || '';

/** The person signed in on the screens of a hosted site. */
const READER = { sub: 4202, name: 'kanji-reader', roles: ['ADMIN'] };

/** A 40-question paper, started. */
async function startPaper(page) {
  await page.waitForSelector('#bookChips .chip');
  await page.click('[data-size="40"]');
  await page.click('#startBtn');
  await page.waitForSelector('#test:not([hidden])');
}

const SCREENS = [
  ['home', '/'],
  ['kanji-dashboard', '/kanji'],
  ['kanji-lessons', '/kanji/lessons'],
  ['kanji-lesson-screen', '/kanji/lessons', async (page) => {
    await page.getByRole('button', { name: /^Start \d+ lessons?$/ }).click();
    await page.waitForSelector('.lband');
  }],
  ['kanji-review', '/kanji/reviews', async (page) => page.waitForSelector('.session')],
  ['kanji-review-answered', '/kanji/reviews', async (page) => {
    // a wrong answer, with the item's info open under it
    await page.waitForSelector('.session');
    const reading = await page.$eval('.s-q', (el) => el.classList.contains('reading'));
    await page.click('.s-input');
    await page.keyboard.type(reading ? 'mizu' : 'zebra');
    await page.keyboard.press('Enter');
    await page.waitForSelector('.session.is-wrong');
    await page.keyboard.press('f');
    await page.waitForSelector('.s-panel:not([hidden])');
  }],
  ['kanji-practice', '/kanji/practice'],
  ['kanji-browse', '/kanji/browse'],
  ['kanji-item', '/kanji/item/k%3A%E5%A4%A7'],
  ['exam', '/exam'],
  ['exam-question', '/exam', startPaper],
  ['exam-result', '/exam', async (page) => {
    await startPaper(page);
    page.once('dialog', (d) => d.accept());
    await page.click('#quitBtn');
    await page.waitForSelector('#result:not([hidden])');
  }],
  ['changelog', '/', async (page) => {
    await page.click('#version');
    await page.waitForSelector('dialog.changelog[open]');
  }],
  ['signed-out', '/', async (page) => page.waitForSelector('#signin-button'), { iam: true }],
  ['account-menu', '/kanji', async (page) => {
    await page.waitForSelector('.cards3');
    await page.click('#usermenu summary');
    await page.waitForSelector('.umenu');
  }, { iam: true, signedIn: true }],
];

const VARIANTS = [
  ['light', { viewport: { width: 1200, height: 900 }, colorScheme: 'light' }],
  ['dark', { viewport: { width: 1200, height: 900 }, colorScheme: 'dark' }],
  ['phone', { viewport: { width: 390, height: 844 }, colorScheme: 'light', deviceScaleFactor: 2, isMobile: true, hasTouch: true }],
];

(async () => {
  const app = await startApp();
  const site = await startApp({ auth: 'iam' });
  // some progress: 大 and 学 learned, one of them due, so every screen has content
  const post = (base, u, b, token) => fetch(base + u, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: JSON.stringify(b),
  });
  const token = iamToken(READER.sub, READER);
  for (const id of ['k:一', 'k:二', 'k:大', 'k:学', 'v:大学']) {
    await post(app.base, '/api/kanji/learn', { id });
    await post(site.base, '/api/kanji/learn', { id }, token);
  }
  app.makeDue(['k:大', 'k:学']);
  site.makeDue(['k:大', 'k:学'], 60000, READER.sub);
  const session = iamSession(READER.sub, READER);

  fs.mkdirSync(SHOTS, { recursive: true });
  const browser = await launch();
  const problems = [];
  for (const [variant, opts] of VARIANTS) {
    const page = await (await browser.newContext(opts)).newPage();
    const errors = watch(page);
    for (const [name, url, prep, how = {}] of SCREENS) {
      if (FILTER && !name.includes(FILTER)) continue;
      // a hosted site's screen: a browser of its own, signed in or not
      let shown = page;
      let shownErrors = null;
      if (how.iam) {
        const context = await browser.newContext(opts);
        if (how.signedIn) {
          await context.addInitScript(({ key, value }) => {
            try {
              localStorage.setItem(key, value);
            } catch (e) {
              // about:blank has no storage
            }
          }, session);
        }
        shown = await context.newPage();
        shownErrors = watch(shown);
      }
      // a real page load for every screen (the same address twice would not load again)
      await shown.goto('about:blank');
      await shown.goto((how.iam ? site.base : app.base) + url);
      await shown.waitForLoadState('networkidle');
      if (prep) await prep(shown);
      if (!how.signedIn) await shown.mouse.move(0, 0); // no hover left over from an earlier click
      await shown.waitForTimeout(150);
      const overflow = await shown.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
      if (overflow > 0) problems.push(`${variant}/${name}: ${overflow}px horizontal overflow`);
      const file = path.join(SHOTS, `screen-${name}-${variant}.png`);
      // Edge garbles full-page shots taller than ~16k device pixels: keep the top part
      const { height, dpr } = await shown.evaluate(() => ({ height: document.documentElement.scrollHeight, dpr: devicePixelRatio }));
      const limit = Math.floor(16000 / dpr);
      const clip = height > limit ? { x: 0, y: 0, width: shown.viewportSize().width, height: limit } : undefined;
      await shown.screenshot({ path: file, fullPage: true, clip });
      console.log(`saved ${path.relative(process.cwd(), file)}${clip ? `  (top ${limit} of ${height} px)` : ''}`);
      if (shownErrors) {
        errors.push(...shownErrors);
        await shown.context().close();
      }
    }
    problems.push(...errors.map((e) => `${variant}: ${e}`));
  }
  await browser.close();
  await site.close();
  await app.close();
  console.log(problems.length ? `\nPROBLEMS:\n  ${problems.join('\n  ')}` : '\nno overflow, no page errors');
  process.exit(problems.length ? 1 : 0);
})().catch(async (e) => {
  console.error(e);
  await closeAll();
  process.exit(1);
});
