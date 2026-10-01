/**
 * Screenshots of every main screen in light, dark and phone layouts, for a
 * visual check after UI changes. Seeds a little progress first so the
 * dashboard, reviews and item pages have something to show. Two screens are a
 * hosted site's (auth mode iam, against the test IAM): the Sign in page, and
 * the account menu open over the kanji dashboard; two are the owner's
 * (Translations, Languages). Every screen is checked for horizontal overflow
 * and errors on the way.
 *
 * The Slovak pass: every screen again at 390 px in a Slovak browser
 * (locale sk-SK; signed in, Slovak chosen, since the token says 'en'), light
 * and dark, each checked for <html lang="sk">, no text that is a key of the
 * bundle, and no text outside [lang=en] / [lang=ja] that is an English string
 * of the bundle whose Slovak differs (a sentence left in English).
 *
 * The room: the top bar measured piece by piece (locator.boundingBox()) at
 * 360, 370, 390, 440 and 560 px, in English and in Slovak - signed in with a
 * three-digit due badge, without sign-in, and signed out: nothing overlaps,
 * nothing leaves the screen, nothing a person needs is hidden. A bar can paint
 * over its neighbours without scrolling, so boxes are compared, not only
 * scroll widths. Signed in in Slovak at 360 and 390 px it gets the Slovak
 * checks and a shot (room-*.png).
 *
 *   npm run screens            → frontend/e2e/shots/screen-*.png, room-*.png
 *   npm run screens -- kanji   → only screens whose name contains "kanji"
 *   npm run screens -- room    → only the room
 */
const path = require('path');
const fs = require('fs');
const { isolate, startApp, closeAll, iamToken, iamSession } = require('./helpers');
isolate('academy-screens'); // before the server starts: a throwaway database

const { launch, newContext, watch, SHOTS } = require('./browser');

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
    // by its place, not its name: the Slovak pass takes this screen too
    await page.click('section.panel .actions button.primary');
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
    await page.waitForSelector('#usermenu .umenu');
  }, { iam: true, signedIn: true }],
  // the owner's pages (English on every page): anybody, without sign-in
  ['owner-translations', '/translations', async (page) => page.waitForSelector('table.grid')],
  ['owner-languages', '/languages', async (page) => page.waitForSelector('section.add')],
];

const PHONE = { viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true };
const VARIANTS = [
  ['light', { viewport: { width: 1200, height: 900 }, colorScheme: 'light' }],
  ['dark', { viewport: { width: 1200, height: 900 }, colorScheme: 'dark' }],
  ['phone', { ...PHONE, colorScheme: 'light' }],
  // the Slovak pass
  ['sk-phone', { ...PHONE, colorScheme: 'light', locale: 'sk-SK' }],
  ['sk-phone-dark', { ...PHONE, colorScheme: 'dark', locale: 'sk-SK' }],
];

/** The person on the room's signed-in bar: more than 99 reviews due. */
const ROOMY = { sub: 4205, name: 'room-reader', roles: ['MEMBER'] };
const ROOM_WIDTHS = [360, 370, 390, 440, 560];

/**
 * What a Slovak page must not show: a key of the bundle (but on the owner's
 * pages, which list them), or, outside [lang=en] / [lang=ja], an English
 * string of the bundle whose Slovak is different. Text nodes and the
 * attributes a person reads or hears, shown or not yet shown.
 */
function slovakProblems(page, bundle) {
  const keys = Object.keys(bundle.values);
  const english = keys.filter((k) => typeof bundle.english[k] === 'string' && bundle.values[k] !== bundle.english[k]).map((k) => bundle.english[k].replace(/\s+/g, ' ').trim());
  return page.evaluate(({ keys, english }) => {
    const out = [];
    const lang = document.documentElement.getAttribute('lang');
    if (lang !== 'sk') out.push(`<html lang="${lang}">`);
    const keySet = new Set(keys);
    const englishSet = new Set(english);
    const where = (el) => `<${el.tagName.toLowerCase()}${el.id ? '#' + el.id : ''}${typeof el.className === 'string' && el.className.trim() ? '.' + el.className.trim().split(/\s+/).join('.') : ''}>`;
    const check = (raw, el, what) => {
      const text = raw.replace(/\s+/g, ' ').trim();
      if (!text) return;
      if (keySet.has(text) && !el.closest('main.owner')) out.push(`a key ${what} ${where(el)}: ${text}`);
      const own = (el.closest('[lang]') || document.documentElement).getAttribute('lang') || '';
      if (englishSet.has(text) && !/^(en|ja)\b/i.test(own)) out.push(`English ${what} ${where(el)}: "${text}"`);
    };
    const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
    for (let node = walker.nextNode(); node; node = walker.nextNode()) {
      const el = node.parentElement;
      if (el && !el.closest('script, style')) check(node.textContent, el, 'in');
    }
    for (const attr of ['aria-label', 'title', 'placeholder', 'alt']) {
      for (const el of document.querySelectorAll(`[${attr}]`)) check(el.getAttribute(attr), el, `in ${attr} of`);
    }
    return [...new Set(out)];
  }, { keys, english });
}

/**
 * The top bar, piece by piece (null: not shown), and whether a piece's text is
 * cut short inside it.
 */
async function barBoxes(page) {
  const PIECES = {
    brand: '.topnav .brand',
    academy: '.topnav .brand b',
    version: '#version',
    chooser: '#langmenu summary',
    kanji: '.topnav nav a[href="/kanji"]',
    badge: '#navDue',
    exam: '.topnav nav a[href="/exam"]',
    account: '#usermenu summary',
  };
  const boxes = {};
  for (const [name, selector] of Object.entries(PIECES)) {
    const found = page.locator(selector);
    boxes[name] = (await found.count()) ? await found.first().boundingBox() : null;
  }
  // text cut short: a piece's words reach past its own box (its scroll width
  // would also count the version's dot, which hangs over its edge on purpose)
  const cut = await page.evaluate(() =>
    [...document.querySelectorAll('.topnav nav a, #navDue, #version, #langmenu summary, #usermenu summary')]
      .filter((el) => {
        const box = el.getBoundingClientRect();
        const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
        for (let node = walker.nextNode(); node; node = walker.nextNode()) {
          if (!node.textContent.trim() || !node.parentElement.checkVisibility()) continue;
          const range = document.createRange();
          range.selectNodeContents(node);
          const text = range.getBoundingClientRect();
          if (text.left < box.left - 0.5 || text.right > box.right + 0.5) return true;
        }
        return false;
      })
      .map((el) => el.id || el.getAttribute('href') || el.tagName.toLowerCase())
  );
  return { boxes, cut };
}

/** What is wrong with a bar of `width` px that should show `needed`. */
function barProblems({ boxes, cut }, width, needed) {
  const out = [];
  for (const name of needed) {
    const b = boxes[name];
    if (!b || b.width < 1 || b.height < 1) out.push(`${name} is not shown`);
    else if (b.x < -0.5 || b.x + b.width > width + 0.5) out.push(`${name} leaves the screen (${Math.round(b.x)}..${Math.round(b.x + b.width)})`);
  }
  // "Academy" gives way to the mark below 440 px (max-width: 440px), as built
  const academy = !!(boxes.academy && boxes.academy.width > 0);
  if (academy !== width > 440) out.push(`"Academy" ${academy ? 'shown' : 'hidden'} at ${width} px`);
  const apart = ['brand', 'version', 'chooser', 'kanji', 'exam', 'account'].filter((n) => boxes[n]);
  for (let i = 0; i < apart.length; i++) {
    for (let j = i + 1; j < apart.length; j++) {
      const a = boxes[apart[i]];
      const b = boxes[apart[j]];
      const x = Math.min(a.x + a.width, b.x + b.width) - Math.max(a.x, b.x);
      const y = Math.min(a.y + a.height, b.y + b.height) - Math.max(a.y, b.y);
      if (x > 0.5 && y > 0.5) out.push(`${apart[i]} and ${apart[j]} overlap by ${Math.round(x)} px`);
    }
  }
  const { badge, kanji } = boxes;
  if (badge && kanji && (badge.x < kanji.x - 0.5 || badge.x + badge.width > kanji.x + kanji.width + 0.5)) out.push('the due badge sticks out of its link');
  if (cut.length) out.push(`text cut short: ${cut.join(', ')}`);
  return out;
}

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
  const bundle = await (await fetch(app.base + '/api/translations/sk')).json();
  if (bundle.language !== 'sk' || !bundle.english) throw new Error(`no Slovak bundle: ${JSON.stringify(bundle).slice(0, 200)}`);

  /** A signed-in session in the browser before its pages load, and Slovak chosen there when `sk`. */
  const signIn = (context, person, sk) =>
    context.addInitScript(({ key, value, sk }) => {
      try {
        localStorage.setItem(key, value);
        if (sk) localStorage.setItem('academy-language', 'sk'); // the token says 'en'
      } catch (e) {
        // about:blank has no storage
      }
    }, { ...person, sk });

  fs.mkdirSync(SHOTS, { recursive: true });
  const browser = await launch();
  const problems = [];
  for (const [variant, opts] of VARIANTS) {
    const sk = opts.locale === 'sk-SK';
    if (FILTER === 'room') break;
    const page = await (await newContext(browser, opts)).newPage();
    const errors = watch(page);
    for (const [name, url, prep, how = {}] of SCREENS) {
      if (FILTER && !name.includes(FILTER)) continue;
      // a hosted site's screen: a browser of its own, signed in or not
      let shown = page;
      let shownErrors = null;
      if (how.iam) {
        const context = await newContext(browser, opts);
        if (how.signedIn) await signIn(context, session, sk);
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
      // the kanji tabs scroll sideways rather than overflow the page: all five
      // must still fit a screen of 390 px, in every language
      const tabs = await shown.evaluate(() => {
        const strip = document.querySelector('.subnav .in');
        return strip ? strip.scrollWidth - strip.clientWidth : 0;
      });
      if (tabs > 0) problems.push(`${variant}/${name}: the kanji tabs scroll by ${tabs}px`);
      if (sk) problems.push(...(await slovakProblems(shown, bundle)).map((p) => `${variant}/${name}: ${p}`));
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

  /* ------------------------------------------------------------ the room */
  if (!FILTER || FILTER === 'room') {
    console.log('the room: the top bar at ' + ROOM_WIDTHS.join(', ') + ' px');
    // somebody with more than 99 reviews due: a three-digit badge
    const catalog = await (await fetch(app.base + '/api/kanji/catalog')).json();
    await post(site.base, '/api/kanji/learn', { id: 'k:一' }, iamToken(ROOMY.sub, ROOMY)); // makes the person
    site.sql(
      "INSERT INTO srs_progress (user_id, item_id, stage, learned_at, next_review) SELECT ?, x, 1, now(), now() - interval '1 hour' FROM json_array_elements_text(?::json) AS x ON CONFLICT DO NOTHING",
      ROOMY.sub, JSON.stringify(catalog.items.slice(0, 140).map((it) => it.id))
    );
    site.makeDue(['k:一'], 60000, ROOMY.sub);
    const roomySession = iamSession(ROOMY.sub, ROOMY);
    const MODES = [
      ['signed-in', site, '/kanji', '#navDue', ['brand', 'version', 'chooser', 'kanji', 'badge', 'exam', 'account']],
      ['no-sign-in', app, '/kanji', '.cards3', ['brand', 'version', 'chooser', 'kanji', 'exam']],
      ['signed-out', site, '/', '#signin-button', ['brand', 'version', 'chooser']],
    ];
    for (const sk of [false, true]) {
      for (const [mode, server, url, ready, needed] of MODES) {
        for (const width of ROOM_WIDTHS) {
          const label = `room ${mode} ${sk ? 'sk' : 'en'} ${width}px`;
          const context = await newContext(browser, { ...PHONE, viewport: { width, height: 800 }, colorScheme: 'light', ...(sk ? { locale: 'sk-SK' } : {}) });
          if (mode === 'signed-in') await signIn(context, roomySession, sk);
          const page = await context.newPage();
          const errors = watch(page);
          await page.goto(server.base + url);
          await page.waitForSelector(ready);
          await page.waitForSelector('#langmenu summary');
          await page.waitForLoadState('networkidle');
          await page.waitForTimeout(100);
          if (mode === 'signed-in') {
            const due = (await page.textContent('#navDue')).trim();
            if (!/^\d{3}$/.test(due)) problems.push(`${label}: the due badge says "${due}", not three digits`);
          }
          const lang = await page.getAttribute('html', 'lang');
          if (lang !== (sk ? 'sk' : 'en')) problems.push(`${label}: <html lang="${lang}">`);
          const measured = await barBoxes(page);
          problems.push(...barProblems(measured, width, needed).map((p) => `${label}: ${p}`));
          const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
          if (overflow > 0) problems.push(`${label}: ${overflow}px horizontal overflow`);
          const pieces = Object.entries(measured.boxes)
            .map(([n, b]) => `${n} ${b ? `${Math.round(b.x)}-${Math.round(b.x + b.width)}` : '-'}`)
            .join(', ');
          console.log(`${label}: ${pieces}`);
          if (sk && mode === 'signed-in' && (width === 360 || width === 390)) {
            problems.push(...(await slovakProblems(page, bundle)).map((p) => `${label}: ${p}`));
            await page.screenshot({ path: path.join(SHOTS, `room-signed-in-sk-${width}.png`) });
          }
          problems.push(...errors.map((e) => `${label}: ${e}`));
          await context.close();
        }
      }
    }
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
