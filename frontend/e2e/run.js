/**
 * The app in a real browser, the way people use it - everybody signed in
 * through the IAM (the stand-in of backend/tests/tools/stand-in-iam.php,
 * started by helpers.js; the app trusts its keys and names it its issuer):
 *   sign-in   a deep link opened signed out goes straight to the IAM and back
 *             to it, with nothing of the app drawn or asked for on the way; a
 *             refused sign-in shows the Sign in card, and its button signs in
 *   kanji     lessons → quiz (romaji typed, one miss on purpose) → reviews
 *             (clock moved) → practice (+ "My answer was right") → item page →
 *             browse; on a review card the language chooser by keys, and Enter
 *             and Space on the bar's controls, leave the card alone
 *   exam      a 40-question listening paper, answered and finished with the
 *             keys, scored (once, though Enter came twice), reported; on its
 *             last question the chooser and the bar's keys hand nothing in,
 *             and Sign out asks first
 *   the app   moving between its sections loads no page; What's new at the
 *             foot; the bar's menus by keys, a real Tab landing on their
 *             button, on a desktop and on a phone
 *   your data download, bring back (asked first; "keep mine" changes
 *             nothing; "replace" puts the file's data back), a file that is
 *             not one refused before anything is sent
 *   sign-out  it waits for an answer on its way, then the IAM's logout; the
 *             token went to this site's API only, with the browser's time zone;
 *             reports fetched with it; a sign-in in another tab starts the app
 *             there, and somebody else's after it loads the page again
 *   admin     ?lang=sk for its tab; the admin area English with Slovak chosen;
 *             Translations refuses a string beside its key and asks before
 *             unsaved strings are left; a language added comes in hidden;
 *             People: an ADMIN deletes a person's data (a copy first, nobody
 *             else's touched); an EDITOR has Translations only, the API says
 *             403 to the rest; a learner has no admin area
 *   update    a database update waiting (the anotoki library's gate): a
 *             visitor, a learner and an editor read that the site is being
 *             updated - no error, no button but a visitor's quiet Sign in,
 *             no trip to the IAM; a signed-out ADMIN signs in from that page,
 *             comes back to it, and reaches the Migrations page: Apply fails
 *             (PostgreSQL's words), then applies; the app back, in words
 *   time zone a browser on Kiritimati (UTC+14) and one on Pago Pago (UTC-11):
 *             each sees its own today, and the server keeps the zone
 *   Slovak    the learner's pages, the bar's menus and Your data's question
 *             in Slovak: no key-shaped text anywhere
 *   visitors  the IAM saying sign-in is not required: / opens with no trip to
 *             the IAM, the notice, no Your data or admin; /admin still goes to
 *             the IAM (refused there: told why, still a visitor); a lesson
 *             batch makes one visitor and one key, kept over a reload; an exam
 *             and its report; Sign in straight after a batch's last answer
 *             waits for it, and everything moves into the account (the note);
 *             signed out, a fresh visitor's page; sign-in required again with
 *             a key held: to the IAM, and the sign-in moves it; the notice in
 *             Slovak on a phone
 *
 * Runs the real server, serving the production build of the app, against a
 * throwaway database (migrations still being written applied there too) -
 * your own database and backups are never touched.
 *   node frontend/scripts/ensure-build.mjs && node frontend/e2e/run.js
 */
const path = require('path');
const fs = require('fs');
const { isolate, startApp, closeAll, iamState, iamSession, plant, IAM, FRONTEND } = require('./helpers');
isolate('academy-browser'); // before the server starts: a throwaway database

const wk = require('wanakana');
const { launch, newContext, watch, reporter, keyShaped, SHOTS } = require('./browser');

/** The people of this run. Roles are the IAM's: everybody holds MEMBER, and MEMBER alone is a learner. */
const LEA = { sub: 4101, name: 'lea', roles: ['MEMBER'] };
const MAX = { sub: 4102, name: 'max', roles: ['MEMBER'] };
const NOA = { sub: 4103, name: 'noa', roles: ['MEMBER'] };
const ADA = { sub: 4201, name: 'ada', roles: ['MEMBER', 'ADMIN'] };
const EDDIE = { sub: 4202, name: 'eddie', roles: ['MEMBER', 'EDITOR'] };
const KIRI = { sub: 4301, name: 'kiri', roles: ['MEMBER'] };
/** Two who study without signing in first (sign-in not required), then sign in. */
const VERA = { sub: 4401, name: 'vera', roles: ['MEMBER'] };
const WREN = { sub: 4402, name: 'wren', roles: ['MEMBER'] };
/** As the stand-in IAM's state names whom it signs in. */
const asUser = (p) => ({ id: p.sub, username: p.name, roles: p.roles });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

(async () => {
  // the IAM's answer whether sign-in is required kept a second, not a minute: the visitors' part switches it
  const app = await startApp({ applicationTtl: 1 });
  const { ck, fails } = reporter();
  const browser = await launch();
  fs.mkdirSync(SHOTS, { recursive: true });
  const iamLog = async () => (await iamState()).log;

  const cat = await (await app.api('/api/kanji/catalog', LEA)).json();
  const byChars = {};
  for (const it of cat.items) (byChars[it.chars] = byChars[it.chars] || []).push(it);
  const progressOf = async (person) => (await (await app.api('/api/kanji/progress', person)).json()).items;
  const learnedBy = (items) => Object.values(items).filter((st) => st.stage > 0).length;
  // max has a little progress of his own: nobody else's actions may touch it
  for (const it of cat.items.slice(0, 2)) await app.api('/api/kanji/learn', MAX, { method: 'POST', body: { id: it.id } });

  /* --------------------------------------------- signed out: a deep link */
  console.log('signed out: a deep link');
  await iamState({ user: asUser(LEA), deny: false });
  const context = await newContext(browser, { viewport: { width: 1100, height: 860 }, acceptDownloads: true });
  // Whether a page of the app was drawn while nobody was signed in: written
  // down in the tab's own storage, which the trip to the IAM keeps.
  await context.addInitScript((origin) => {
    if (location.origin !== origin) return;
    new MutationObserver(() => {
      try {
        if (localStorage.getItem('anotoki-auth:japanese-academy')) return;
        const drawn = [...document.querySelectorAll('main')].map((m) => m.id || m.className || 'main');
        if (drawn.length) sessionStorage.setItem('drawn-signed-out', drawn.join(' '));
      } catch (e) {
        // no storage: nothing to note
      }
    }).observe(document, { childList: true, subtree: true });
  }, app.base);
  // every request of hers, with its headers
  const sent = [];
  context.on('request', (request) => {
    sent.push({
      url: request.url(),
      method: request.method(),
      // all of them (a token too), unless its page closed before they came: then what the request knew
      headers: Promise.race([request.allHeaders(), sleep(3000).then(() => request.headers())]).catch(() => request.headers()),
    });
  });
  const page = await context.newPage();
  // /learn and /review may answer 409 by design (e.g. a double submit)
  const errors = watch(page, { ignore: [/\/api\/kanji\/(learn|review)/] });
  const shot = (name, fullPage = false) => page.screenshot({ path: path.join(SHOTS, `${name}.png`), fullPage });

  await page.goto(app.base + '/kanji/reviews');
  await page.waitForSelector('#userButton', { timeout: 15000 });
  await page.waitForSelector('main');
  const authorizeAt = sent.findIndex((r) => r.url.startsWith(`${IAM.issuer}/api/oidc/authorize`));
  const askedBefore = sent.slice(0, authorizeAt).filter((r) => r.url.startsWith(`${app.base}/api/`) || r.url.startsWith(`${app.base}/report/`));
  const noData = (r) => /^\/api\/(site-status|auth\/config|translations\/[\w-]+)$/.test(new URL(r.url).pathname);
  ck('signed out, a deep link goes straight to the IAM: nobody’s data asked for on the way',
    authorizeAt > 0 && askedBefore.every(noData), askedBefore.map((r) => r.url).join(' '));
  const drawn = await page.evaluate(() => sessionStorage.getItem('drawn-signed-out'));
  ck('and no page of the app drawn before it', drawn === null, drawn || '');
  ck('back from the IAM on the page asked for, signed in',
    new URL(page.url()).pathname === '/kanji/reviews' && (await page.textContent('.user-name')).trim() === 'lea', page.url());
  let log = await iamLog();
  ck('the IAM was asked: authorize, then its code for tokens', log.includes('GET /api/oidc/authorize') && log.includes('POST /api/oidc/token'));

  /* ---------------------------------------------- a refused sign-in */
  console.log('a refused sign-in');
  await iamState({ deny: true });
  const deniedContext = await newContext(browser, { viewport: { width: 1100, height: 860 } });
  const denied = await deniedContext.newPage();
  const deniedErrors = watch(denied);
  await denied.goto(app.base + '/exam');
  await denied.waitForSelector('#signin-button', { timeout: 15000 });
  const refusedWords = (await denied.textContent('#signin .err')).trim();
  ck('refused at the IAM: the Sign in card says so', refusedWords === 'Signing in was not completed. Try again.', refusedWords);
  ck('with nothing of the app behind it, and Sign in in the bar',
    (await denied.$('#bookChips')) === null && (await denied.$('#userButton')) === null && (await denied.isVisible('#signInButton')));
  await denied.screenshot({ path: path.join(SHOTS, 'signed-out.png') });
  await iamState({ deny: false });
  await denied.click('#signin-button');
  await denied.waitForSelector('#userButton', { timeout: 15000 });
  ck('its button signs in once the IAM lets them: the app, signed in', (await denied.textContent('.user-name')).trim() === 'lea', denied.url());
  ck('and back on the page asked for before the refusal, not on /', new URL(denied.url()).pathname === '/exam', denied.url());
  ck('no browser errors on the way', deniedErrors.length === 0, deniedErrors.join(' | '));
  await deniedContext.close();
  // The same through the bar's Sign in, on a deeper link.
  await iamState({ deny: true });
  const deniedAgain = await newContext(browser, { viewport: { width: 1100, height: 860 } });
  const again = await deniedAgain.newPage();
  const againErrors = watch(again);
  await again.goto(app.base + '/kanji/item/' + encodeURIComponent('k:大'));
  await again.waitForSelector('#signin-button', { timeout: 15000 });
  await iamState({ deny: false });
  await again.click('#signInButton');
  await again.waitForSelector('#userButton', { timeout: 15000 });
  ck('refused on /kanji/item, the bar’s Sign in comes back there, signed in',
    decodeURIComponent(new URL(again.url()).pathname) === '/kanji/item/k:大' && againErrors.length === 0, again.url() + ' ' + againErrors.join(' | '));
  await deniedAgain.close();

  /* ---------------------------------------------------- the study flow */
  // on her page, or on another's (pg: the visitors' part)
  async function card(pg = page) {
    const chars = await pg.textContent('.s-chars');
    const isKanji = await pg.$eval('.s-card', (el) => el.classList.contains('t-kanji'));
    const part = await pg.$eval('.s-q', (el) => (el.classList.contains('reading') ? 'reading' : 'meaning'));
    const it = (byChars[chars] || []).find((x) => x.type === (isKanji ? 'kanji' : 'vocab'));
    return { chars, part, it };
  }
  async function answer({ wrong = false } = {}, pg = page) {
    const c = await card(pg);
    let text;
    if (c.part === 'meaning') text = wrong ? 'zebra' : c.it.meanings[0].replace(/\(.*?\)/g, '').trim();
    else text = wrong ? (wk.toRomaji(c.it.readings[0]) === 'ken' ? 'mizu' : 'ken') : wk.toRomaji(c.it.readings[0]);
    await pg.click('.s-input');
    await pg.keyboard.type(text, { delay: 5 });
    await pg.keyboard.press('Enter');
    await pg.waitForTimeout(80);
    const shown = await pg.inputValue('.s-input');
    const cls = await pg.$eval('.session', (el) => el.className);
    return { ...c, typed: text, shown, verdict: cls.includes('is-wrong') ? 'wrong' : cls.includes('is-correct') ? 'correct' : 'none' };
  }
  const next = async (pg = page) => {
    await pg.keyboard.press('Enter');
    await pg.waitForTimeout(100);
  };
  // A finished session stays on the screen, its box read-only, until its saves
  // have landed and the summary comes: over once its box is read-only after
  // next() (an answered card's box is too, but next() has moved on from it).
  const inSession = async (pg = page) => (await pg.$('.session .s-input:not([readonly])')) !== null;
  // Angular draws what a key or click changed a moment later, not during the
  // event: wait for it (true), or for 3 s (false).
  const until = (selector, state = 'visible') => page.waitForSelector(selector, { state, timeout: 3000 }).then(() => true, () => false);
  const untilText = (selector, text) =>
    page.waitForFunction(([s, t]) => document.querySelector(s)?.textContent.trim() === t, [selector, text], { timeout: 3000 }).then(() => true, () => false);
  // a real page load every time
  const open = async (url) => {
    await page.goto('about:blank');
    await page.goto(app.base + url);
  };
  const focused = () =>
    page.evaluate(() => {
      const el = document.activeElement;
      return { id: (el && el.id) || '', role: (el && el.getAttribute('role')) || '', tag: el ? el.tagName.toLowerCase() : '' };
    });
  // The language chooser, worked with the keys alone: Enter opens it on the
  // language in use, ↓ goes to the next one, Enter chooses it. Its keys stay
  // its own: the session and the paper listen for Enter on the whole page.
  // True once the page is in Slovak.
  const chooseByKeys = async () => {
    await page.focus('#langButton');
    await page.keyboard.press('Enter');
    await page.waitForFunction(() => document.activeElement?.getAttribute('role') === 'menuitemradio', null, { timeout: 3000 });
    await page.keyboard.press('ArrowDown');
    await page.keyboard.press('Enter');
    return page.waitForFunction(() => document.documentElement.lang === 'sk', null, { timeout: 5000 }).then(() => true, () => false);
  };
  // and back to English with the mouse: the choice is kept in this browser
  const backToEnglish = async () => {
    await page.click('#langButton');
    await page.click('#langmenu [role="menuitemradio"][lang="en"]');
    await page.waitForFunction(() => document.documentElement.lang === 'en', null, { timeout: 5000 });
  };
  // Enter and Space on the bar's controls: each does what the control does
  // (the dark look, the light one, the person's menu open and closed again),
  // and nothing reaches the page under it. Returns what the controls did.
  const theme = (mode) =>
    page
      .waitForFunction((m) => document.documentElement.getAttribute('data-theme') === m, mode, { timeout: 2000 })
      .then(() => mode, () => page.evaluate(() => document.documentElement.getAttribute('data-theme')));
  const barKeys = async () => {
    await page.waitForTimeout(300); // the page's words settled (a language just chosen draws the bar again)
    await page.focus('[role="radio"][data-mode="dark"]');
    await page.keyboard.press('Enter');
    const dark = await theme('dark');
    await page.focus('[role="radio"][data-mode="light"]');
    await page.keyboard.press('Space');
    const light = await theme('light');
    await page.focus('#userButton');
    await page.keyboard.press('Enter');
    const menu = await until('#user-menu');
    await page.keyboard.press('Escape');
    const closed = await until('#user-menu', 'detached');
    const back = (await focused()).id;
    await page.focus('#nav-kanji');
    await page.keyboard.press('Space');
    await page.focus('#nav-exam');
    await page.keyboard.press('Space');
    await page.click('[role="radio"][data-mode="system"]'); // the system's look again
    return { dark, light, menu, closed, back };
  };
  const barDidItsOwn = (r) => r.dark === 'dark' && r.light === 'light' && r.menu && r.closed && r.back === 'userButton';

  /* ---------------------------------------------------------- lessons */
  console.log('kanji: lessons');
  await open('/kanji');
  await page.waitForSelector('.cards3');
  await shot('dashboard-empty', true);
  // buttons by their accessible name: the text as a person reads it, spaces trimmed
  await page.getByRole('button', { name: /^Learn \d+ items?$/ }).click();
  await page.waitForSelector('.lband');
  for (let i = 0; i < 15; i++) {
    await page.keyboard.press('Enter');
    await page.waitForTimeout(30);
  }
  await page.waitForSelector('.mode-lesson');
  let n = 0;
  let missed = false;
  let kana = null;
  while ((await inSession()) && n < 40) {
    const r = await answer({ wrong: n === 1 });
    if (n === 1) {
      missed = r.verdict === 'wrong';
      await shot('quiz-wrong');
    } else if (r.verdict !== 'correct') ck(`right answer accepted: ${r.chars} ${r.part}`, false, `${r.typed} → ${r.shown}`);
    if (r.part === 'reading' && r.verdict === 'correct' && !kana) kana = r;
    await next();
    n++;
  }
  ck('a deliberate miss turns the card red', missed);
  ck('romaji becomes kana', kana && /^[぀-ヿ]+$/.test(kana.shown), kana && `${kana.typed} → ${kana.shown}`);
  ck('quiz: 5 items × 2 halves + 1 retry', n === 11, `${n} answers`);
  await page.waitForSelector('h1.page');
  ck('summary: 5 learned', /learned 5 item/.test(await page.textContent('.lead')));
  // The lesson ran over the dashboard, so the address is still /kanji, the
  // same as the Dashboard link's: clicking it must still bring the dashboard back.
  ck('the address stayed /kanji', new URL(page.url()).pathname === '/kanji', page.url());
  await page.click('.subnav a[data-route=""]');
  ck('the Dashboard link works after a lesson started there',
    await page.waitForSelector('.cards3', { timeout: 3000 }).then(() => true, () => false));
  let p = await progressOf(LEA);
  const learned = Object.keys(p).filter((id) => p[id].stage === 1);
  ck('server: 5 items at Apprentice I, hers', learned.length === 5, learned.join(' '));
  ck('in the database under her id', Number(app.sql('SELECT count(*) AS n FROM srs_progress WHERE user_id = ?', LEA.sub)[0].n) === 5);

  /* ---------------------------------------------------------- reviews */
  console.log('kanji: reviews');
  app.makeDue(learned, 60000, LEA.sub);
  await open('/kanji');
  await page.waitForSelector('.cards3');
  ck('dashboard shows 5 due', (await page.textContent('.c-reviews .bc-num')).trim() === '5');
  ck('and so does the top bar', (await page.textContent('#navDue')).trim() === '5');
  await page.click('text=Start reviews');
  await page.waitForSelector('.mode-review');
  ck('reviews have an address of their own', new URL(page.url()).pathname === '/kanji/reviews', page.url());
  n = 0;
  let missedChars = null;
  while ((await inSession()) && n < 40) {
    const c = await card();
    if (n === 0) {
      const english = (await page.getAttribute('html', 'lang')) === 'en';
      const switched = await chooseByKeys();
      ck('the chooser by keys, on a review card: Enter, ↓, Enter changes the language', english && switched);
      const cls = await page.$eval('.session', (el) => el.className);
      ck('and the card is still unanswered', !/is-(wrong|correct)/.test(cls) && (await page.inputValue('.s-input')) === '' && (await card()).chars === c.chars, cls);
      await backToEnglish();
      // an answer typed, not sent: Enter and Space on the bar must not send it
      await page.click('.s-input');
      await page.keyboard.type('zebra');
      const typed = await page.inputValue('.s-input');
      const did = await barKeys();
      const after = { cls: await page.$eval('.session', (el) => el.className), value: await page.inputValue('.s-input'), path: new URL(page.url()).pathname };
      ck('Enter and Space on the bar over a review: the bar’s controls work (dark, light, the menu open and shut)', barDidItsOwn(did), JSON.stringify(did));
      ck('and the card is left alone: not checked, the answer as typed, the page the same',
        !/is-(wrong|correct)/.test(after.cls) && after.value === typed && after.path === '/kanji/reviews', JSON.stringify(after));
      await page.fill('.s-input', '');
    }
    const r = await answer({ wrong: !missedChars && c.part === 'reading' });
    if (!missedChars && c.part === 'reading') missedChars = r.chars;
    if (n === 0) {
      await shot('review');
      // F opens the item's info once answered, and closes it again
      await page.keyboard.press('f');
      const opened = await until('.s-panel:not([hidden]) .dsec');
      await page.keyboard.press('f');
      ck('F shows the item info after an answer, and hides it', opened && (await until('.s-panel[hidden]', 'attached')));
    }
    await next();
    n++;
  }
  await page.waitForSelector('h1.page');
  await shot('review-summary', true);
  p = await progressOf(LEA);
  const stages = learned.map((id) => p[id].stage);
  ck('4 clean reviews → Apprentice II, the missed one stays', stages.filter((s) => s === 2).length === 4 && stages.filter((s) => s === 1).length === 1, stages.join(','));
  ck('summary shows the moves', /Apprentice I → Apprentice II/.test(await page.textContent('main')));

  /* --------------------------------------------------------- practice */
  console.log('kanji: practice');
  const before = JSON.parse(JSON.stringify(p));
  await open('/kanji/practice');
  await page.getByRole('button', { name: /^Practise \d+/ }).click();
  await page.waitForSelector('.mode-practice');
  n = 0;
  let accepted = null;
  while ((await inSession()) && n < 40) {
    const c = await card();
    if (!accepted && c.part === 'meaning') {
      await page.click('.s-input');
      await page.keyboard.type('numero uno');
      await page.keyboard.press('Enter');
      await page.waitForTimeout(80);
      await page.click('text=My answer was right');
      await page.waitForTimeout(150);
      ck('"My answer was right" turns it green', (await page.$eval('.session', (el) => el.className)).includes('is-correct'));
      accepted = c.it.id;
    } else {
      await answer();
    }
    await next();
    n++;
  }
  await page.waitForSelector('h1.page');
  p = await progressOf(LEA);
  const moved = Object.keys(before).filter((id) => before[id].stage !== p[id].stage || before[id].nextReview !== p[id].nextReview);
  ck('practice changed no stage or review time', moved.length === 0, moved.join(' '));
  ck('the accepted answer is now a synonym', (p[accepted].synonyms || []).includes('numero uno'));
  // the session ran at /kanji/practice, the same address as this link
  await page.click('text=New practice');
  ck('"New practice" works after a practice session',
    await page.getByRole('button', { name: /^Practise \d+/ }).waitFor({ timeout: 3000 }).then(() => true, () => false));

  await open(`/kanji/item/${encodeURIComponent(accepted)}`);
  await page.waitForSelector('.ihead');
  ck('item page shows the synonym', (await page.textContent('main')).includes('numero uno'));

  // A slow save (Windows can hold a file for seconds) must not bring the summary
  // back over the screen the learner moved on to while it was saving.
  await page.route('**/api/kanji/practice', async (route) => {
    await sleep(1500);
    await route.continue();
  });
  await page.click('text=Practise it now');
  await page.waitForSelector('.mode-practice');
  for (let i = 0; i < 6 && (await page.textContent('.s-feedback')) !== 'Saving…'; i++) {
    await answer();
    await next();
  }
  ck('the finished practice is still saving', (await page.textContent('.s-feedback')) === 'Saving…');
  await page.click('.subnav a[data-route=""]');
  await page.waitForSelector('.cards3');
  await page.waitForTimeout(2500); // the save lands meanwhile
  ck('a late save leaves the dashboard alone',
    (await page.$('.cards3')) !== null && !/Practice done/.test(await page.textContent('main')));
  await page.unroute('**/api/kanji/practice');
  await open('/kanji/browse');
  await page.waitForSelector('.bgrid');
  await page.fill('input[type=text]', 'ichi');
  await page.waitForTimeout(150);
  ck('browse finds 一 by romaji', (await page.$$eval('.bgrid .tc', (els) => els.map((e) => e.textContent))).includes('一'));

  /* ------------------------------------------------------------- exam */
  console.log('exam');
  const audio = [];
  page.on('response', (r) => {
    if (r.url().includes('/audio/')) audio.push(`${r.status()} ${r.headers()['content-type']}`);
  });
  // the browser's own question boxes: answered yes unless a check says otherwise
  let onDialog = (d) => d.accept();
  page.on('dialog', (d) => onDialog(d));
  await open('/exam');
  await page.waitForSelector('#bookChips .chip');
  await page.click('[data-size="40"]');
  await page.click('details.adv summary');
  for (const b of await page.$$('#sectionChips .chip')) {
    const id = await b.getAttribute('data-section');
    const on = (await b.getAttribute('class')).includes('is-on');
    if (on !== id.startsWith('listening')) await b.click();
  }
  await page.click('#startBtn');
  await page.waitForSelector('#test:not([hidden])');
  const total = Number((await page.textContent('#counter')).split('/')[1]);
  for (let i = 0; i < total; i++) {
    await page.keyboard.press('1');
    await page.waitForTimeout(220);
  }
  ck('1–4 answer, and move on by themselves', await untilText('#counter', `${total} / ${total}`), await page.textContent('#counter'));
  ck('every question answered', (await page.$$('#gridNav .done')).length === total);
  // ← back, F flags, → on again
  await page.keyboard.press('ArrowLeft');
  ck('← goes back', await untilText('#counter', `${total - 1} / ${total}`), await page.textContent('#counter'));
  await page.keyboard.press('f');
  await until('#gridNav .flag');
  const flagged = await page.$$eval('#gridNav .flag', (els) => els.map((e) => e.textContent.trim()));
  ck('F flags the question', flagged.length === 1 && flagged[0] === String(total - 1) && (await page.isChecked('#flagBox')), flagged.join(','));
  await page.keyboard.press('ArrowRight');
  ck('→ moves on', await untilText('#counter', `${total} / ${total}`));
  // On the last question Enter hands the paper in: not from the bar
  const stored = () => Number(app.sql('SELECT count(*) AS n FROM exam_attempts WHERE user_id = ?', LEA.sub)[0].n);
  const storedBefore = stored();
  const paperOpen = async () =>
    (await page.isVisible('#test')) && !(await page.isVisible('#result')) && (await page.textContent('#counter')).trim() === `${total} / ${total}` && stored() === storedBefore;
  const switchedOnPaper = await chooseByKeys();
  ck('the chooser by keys, on the last question: the language changed', switchedOnPaper);
  ck('and the paper is still open, with no attempt stored', await paperOpen(), `stored: ${stored()} (before: ${storedBefore})`);
  await backToEnglish();
  const didOnPaper = await barKeys();
  ck('Enter and Space on the bar over the last question: the bar’s controls work', barDidItsOwn(didOnPaper), JSON.stringify(didOnPaper));
  ck('and the paper is still open: nothing chosen, nothing handed in',
    (await paperOpen()) && (await page.$$('#gridNav .done')).length === total, `stored: ${stored()}`);
  // Sign out over an open paper asks first; "no" keeps the paper and the sign-in
  let asked = '';
  onDialog = (d) => {
    asked = d.message();
    d.dismiss();
  };
  await page.click('#userButton');
  await page.click('#signOut');
  await page.waitForTimeout(300);
  onDialog = (d) => d.accept();
  ck('Sign out over an open paper asks first', asked === 'Your exam is not finished, and signing out loses the test. Sign out anyway?', asked);
  ck('and "no" keeps the paper and the sign-in', (await paperOpen()) && (await page.isVisible('#userButton')));
  await page.keyboard.press('Escape'); // the menu, if it stayed open
  await page.evaluate(() => document.activeElement && document.activeElement.blur()); // the paper's keys again
  await page.keyboard.press('Enter'); // the last question: Enter finishes
  await page.keyboard.press('Enter'); // and again while it is being scored: nothing more
  await page.waitForSelector('#result:not([hidden])', { timeout: 15000 });
  ck('exam scored', /%/.test(await page.textContent('#verdict')));
  const attempts = await (await app.api('/api/attempts', LEA)).json();
  ck('scored once: Enter twice stores one attempt', attempts.length === 1, `stored: ${attempts.length}`);
  // browsers fetch audio with Range headers, so 206 Partial Content is the normal answer
  ck('recordings stream', audio.length > 0 && audio.every((x) => /^20[06] audio\/mpeg/.test(x)), `${audio.length} clip(s)`);
  const reportHref = await page.getAttribute('#reportLink', 'href');
  ck('the report: hers with her token, nobody’s without one',
    (await app.api(reportHref, LEA)).status === 200 && (await fetch(app.base + reportHref)).status === 401 && (await app.api(reportHref, MAX)).status === 404);
  await page.click('#againBtn');
  ck('"New test": the setup again', (await until('#setup:not([hidden]) #bookChips .chip')) && !(await page.isVisible('#result')));

  /* ---------------------------------------------------------- the app */
  console.log('the app');
  await open('/');
  await page.waitForSelector('.homecards');
  await page.waitForFunction(() => /\d/.test(document.getElementById('kLearned').textContent));
  ck('home: what was learned', /^5 \/ \d+$/.test((await page.textContent('#kLearned')).trim()), await page.textContent('#kLearned'));
  await page.evaluate(() => {
    window.stayed = true;
  });
  await page.click('#nav-exam');
  await page.waitForSelector('#bookChips .chip');
  await page.click('#nav-kanji');
  await page.waitForSelector('.cards3');
  await page.click('.subnav a[data-route="browse"]');
  await page.waitForSelector('.bgrid');
  await page.click('app-brand a');
  await page.waitForSelector('.homecards');
  ck('moving between the sections, the brand home: no page loads', await page.evaluate(() => window.stayed === true));

  const [latest] = JSON.parse(fs.readFileSync(path.join(FRONTEND, 'public', 'changelog.json'), 'utf8'));
  ck('the version at the foot, and What’s new with a dot while its news is unread',
    (await page.textContent('#version')).trim() === `v${latest.version}` && (await page.isVisible('#whatsNew .dot')));
  await page.click('#whatsNew');
  await page.waitForSelector('dialog.changelog[open]');
  const news = await page.textContent('dialog.changelog');
  ck("it opens what's new", news.includes(`v${latest.version}`) && news.includes(latest.changes.added[0]));
  await shot('changelog');
  await page.keyboard.press('Escape');
  ck('Escape closes it, and the dot is gone',
    (await page.$('dialog.changelog[open]')) === null && (await page.$('#whatsNew .dot')) === null);

  /* ------------------------------------------- the bar's menus by keys */
  console.log('the bar: its menus by keys');
  await page.setViewportSize({ width: 1280, height: 860 });
  const openBy = async (button, menu) => {
    await page.focus(button);
    await page.keyboard.press('Enter');
    await page.waitForSelector(menu);
    await page.waitForFunction((m) => document.querySelector(m)?.contains(document.activeElement), menu, { timeout: 3000 });
  };
  await openBy('#userButton', '#user-menu');
  const firstItem = await focused();
  await page.keyboard.press('End');
  const lastItem = await focused();
  await page.keyboard.press('Home');
  const homeItem = await focused();
  await page.keyboard.press('ArrowUp');
  const round = await focused();
  ck('the person’s menu by keys: Enter opens it on its first item; End, Home, and ↑ round to the last',
    firstItem.role === 'menuitem' && firstItem.id === 'accountLink' && lastItem.id === 'signOut' && homeItem.id === 'accountLink' && round.id === 'signOut',
    JSON.stringify([firstItem, lastItem, homeItem, round]));
  await page.keyboard.press('Escape');
  ck('Escape closes it, the focus on its button', (await until('#user-menu', 'detached')) && (await focused()).id === 'userButton');
  for (const [key, from] of [['Tab', 'first'], ['Shift+Tab', 'first'], ['Tab', 'last'], ['Shift+Tab', 'last']]) {
    await openBy('#userButton', '#user-menu');
    if (from === 'last') await page.keyboard.press('End');
    await page.keyboard.press(key); // a real key press: the browser moves the focus unless the menu stops it
    await page.waitForTimeout(100);
    const where = await focused();
    ck(`a real ${key} from the ${from} item closes the menu, the focus on its button (never <body>)`,
      (await page.$('#user-menu')) === null && where.id === 'userButton', JSON.stringify(where));
  }
  await openBy('#langButton', '#langmenu');
  const inUse = await page.evaluate(() => document.activeElement?.getAttribute('lang'));
  await page.keyboard.press('Tab');
  await page.waitForTimeout(100);
  ck('the language menu opens on the language in use; a real Tab closes it on its button',
    inUse === 'en' && (await page.$('#langmenu')) === null && (await focused()).id === 'langButton', `${inUse} ${JSON.stringify(await focused())}`);
  // a phone: the links and the person's menu are in one menu
  await page.setViewportSize({ width: 390, height: 844 });
  await page.waitForSelector('#menuButton');
  ck('at 390 px: the menu button, no links and no person’s button in the row',
    (await page.$('.topbar-nav')) === null && (await page.$('#userButton')) === null);
  await openBy('#menuButton', '#topbar-menu');
  const phoneFirst = await page.evaluate(() => document.activeElement?.textContent.trim());
  const phoneItems = await page.$$eval('#topbar-menu [role="menuitem"]', (els) => els.map((e) => e.id || e.textContent.trim()));
  ck('its menu: Kanji and Exam, then the person’s items; the focus on the first',
    /^Kanji/.test(phoneFirst) && /^Kanji/.test(phoneItems[0]) && phoneItems[1] === 'Exam' && phoneItems.includes('accountLink') && phoneItems.at(-1) === 'signOut', phoneItems.join(', '));
  await page.keyboard.press('ArrowDown');
  await page.keyboard.press('Tab');
  await page.waitForTimeout(100);
  ck('a real Tab closes it, the focus on the menu button', (await page.$('#topbar-menu')) === null && (await focused()).id === 'menuButton', JSON.stringify(await focused()));
  await openBy('#menuButton', '#topbar-menu');
  await page.keyboard.press('Shift+Tab');
  await page.waitForTimeout(100);
  ck('and a real Shift+Tab too', (await page.$('#topbar-menu')) === null && (await focused()).id === 'menuButton', JSON.stringify(await focused()));
  await page.setViewportSize({ width: 1100, height: 860 });
  ck('no browser errors in the study flow', errors.length === 0, errors.join(' | '));

  /* -------------------------------------------------------- your data */
  console.log('your data');
  await open('/');
  await page.waitForSelector('#downloadData');
  const zone = await page.evaluate(() => Intl.DateTimeFormat().resolvedOptions().timeZone);
  ck('Your data says whose time zone the days follow: the browser’s', (await page.textContent('#yourZone')).includes(zone), zone);
  const itemsBefore = Object.keys(await progressOf(LEA)).length;
  const [download] = await Promise.all([page.waitForEvent('download'), page.click('#downloadData')]);
  const saved = path.join(app.backups, `downloaded-${download.suggestedFilename()}`);
  await download.saveAs(saved);
  const file = JSON.parse(fs.readFileSync(saved, 'utf8'));
  const hers = file.users && file.users[0];
  ck('Download: her own file, under the server’s name',
    /^japanese-academy-\d{4}-\d{2}-\d{2}\.json$/.test(download.suggestedFilename()) && file.format === 'japanese-academy-backup' && file.version === 2
      && file.users.length === 1 && String(hers.id) === String(LEA.sub) && Object.keys(hers.kanji.items).length === itemsBefore && hers.attempts.length === 1,
    `${download.suggestedFilename()} ${file.users && file.users.length} person(s)`);
  // then she learns three more
  const ahead = cat.items.filter((it) => !hers.kanji.items[it.id]).slice(0, 3);
  for (const it of ahead) await app.api('/api/kanji/learn', LEA, { method: 'POST', body: { id: it.id } });
  ck('(three more learned since)', Object.keys(await progressOf(LEA)).length === itemsBefore + 3);
  const inFile = learnedBy(hers.kanji.items);
  const puts = () => sent.filter((r) => r.method === 'PUT' && r.url === `${app.base}/api/me/data`).length;
  const putsBefore = puts();
  await page.setInputFiles('#your-data input[type=file]', saved);
  await page.waitForSelector('dialog.confirm[open]');
  const question = (await page.textContent('dialog.confirm[open]')).replace(/\s+/g, ' ');
  ck('Bring back asks first, with what the file holds', question.includes(download.suggestedFilename()) && question.includes('lea') && question.includes(String(inFile)), question);
  await shot('your-data-question');
  await page.click('#keepMine');
  ck('"Keep mine": nothing sent, nothing changed',
    (await until('dialog.confirm[open]', 'detached')) && puts() === putsBefore && Object.keys(await progressOf(LEA)).length === itemsBefore + 3);
  await page.setInputFiles('#your-data input[type=file]', saved);
  await page.waitForSelector('dialog.confirm[open]');
  await page.click('#replaceMine');
  await page.waitForSelector('#yourDataDone', { timeout: 10000 });
  ck('"Replace": done, a copy of what it replaced kept', /^Done: your data is now what the file held\./.test((await page.textContent('#yourDataDone')).trim()), await page.textContent('#yourDataDone'));
  ck('her data is the file’s again: the three learned since are gone', Object.keys(await progressOf(LEA)).length === itemsBefore);
  await page.waitForFunction((n) => (document.getElementById('kLearned')?.textContent || '').trim().startsWith(`${n} /`), inFile, { timeout: 5000 }).catch(() => undefined);
  ck('and the home page shows it', (await page.textContent('#kLearned')).trim().startsWith(`${inFile} /`), await page.textContent('#kLearned'));
  ck('the server kept a copy of what was replaced', fs.readdirSync(app.backups).some((f) => /before-import-user-4101-/.test(f)), fs.readdirSync(app.backups).join(' '));
  ck('max’s data untouched', learnedBy(await progressOf(MAX)) === 2);
  const putsThen = puts();
  await page.setInputFiles('#your-data input[type=file]', { name: 'notes.json', mimeType: 'application/json', buffer: Buffer.from('{"notes": [1, 2, 3]}') });
  const refused = await page.waitForFunction(() => document.getElementById('yourDataError')?.textContent.trim(), null, { timeout: 5000 }).then(() => true, () => false);
  ck('a file that is not one: refused here, before anything is sent',
    refused && (await page.textContent('#yourDataError')).trim() === 'The file was not brought back: That is not a Japanese Academy data file, or it is damaged.' && puts() === putsThen && (await page.$('dialog.confirm[open]')) === null,
    await page.textContent('#yourDataError'));

  /* -------------------------------------------------------- sign-out */
  console.log('sign-out');
  // an answer on its way (held back 1.5 s) when Sign out is pressed: an item
  // is saved once both its halves are answered, as the next card comes
  let held = 0;
  await page.route('**/api/kanji/practice', async (route) => {
    held += 1;
    await sleep(1500);
    await route.continue();
  });
  await open('/kanji/practice');
  await page.getByRole('button', { name: /^Practise \d+/ }).click();
  await page.waitForSelector('.mode-practice');
  const answersBefore = Number(app.sql("SELECT count(*) AS n FROM srs_log WHERE user_id = ? AND kind = 'practice'", LEA.sub)[0].n);
  for (let i = 0; i < 6 && !held; i++) {
    await answer();
    await next();
  }
  // after the sign-out the IAM refuses, so the page stays on the Sign in card rather than signing in again at once
  await iamState({ deny: true });
  await page.click('#userButton');
  await page.click('#signOut');
  const waited = await page.waitForSelector('#signOut[aria-busy="true"]', { timeout: 1000 }).then(() => true, () => false);
  const waitWords = waited ? (await page.textContent('#signOut')).trim() : '';
  ck('Sign out with an answer on its way: it waits, saying so', waited && waitWords === 'Saving…', waitWords);
  await page.waitForSelector('#signin-button', { timeout: 15000 });
  const answersAfter = Number(app.sql("SELECT count(*) AS n FROM srs_log WHERE user_id = ? AND kind = 'practice'", LEA.sub)[0].n);
  ck('then signs out: the answer landed first', held === 1 && answersAfter === answersBefore + 1, `${answersBefore} → ${answersAfter} (${held} held back)`);
  log = await iamLog();
  ck('through the IAM’s logout, back to the Sign in card', log.includes('GET /api/oidc/logout') && (await page.isVisible('main.signin')));
  ck('and the tokens are gone from the browser', (await page.evaluate(() => localStorage.getItem('anotoki-auth:japanese-academy'))) === null);
  await page.unroute('**/api/kanji/practice');

  // A report holds whatever a file brought in. The policy must come before
  // anything in it: one that followed the report's own <head> would come after
  // a script put before it, and one after a leading character HTML reads as
  // text (not a space) would land in the body, where it counts for nothing.
  console.log('reports, fetched with the token');
  await iamState({ deny: false, user: asUser(LEA) });
  await page.click('#signin-button');
  await page.waitForSelector('#userButton', { timeout: 15000 });
  await open('/exam');
  await page.waitForSelector('#bookChips .chip');
  await page.click('[data-size="40"]');
  await page.click('#startBtn');
  await page.waitForSelector('#test:not([hidden])');
  await page.click('#quitBtn');
  await page.waitForSelector('#result:not([hidden])', { timeout: 15000 });
  const [report] = await Promise.all([context.waitForEvent('page'), page.click('#reportLink')]);
  await report.waitForFunction(() => document.body && /By skill/.test(document.body.innerText), null, { timeout: 10000 });
  ck('the report: fetched with the token, opened from memory', report.url().startsWith('blob:'), report.url());
  ck('and it may not run a script', (await report.$('meta[http-equiv="Content-Security-Policy"]')) !== null);
  await report.close();
  const attempt = app.sql('SELECT id FROM exam_attempts WHERE user_id = ? ORDER BY finished_at DESC LIMIT 1', LEA.sub)[0].id;
  const evil = [
    ['a script before its <head>', '', '<script>window.pwned = 1</script><!doctype html><html><head><title>t</title></head><body><p>By skill</p><script>window.pwned = 2</script></body></html>'],
    ['a no-break space before its doctype', 'chr(160) || ', '<!doctype html><script>window.pwned = 3</script><p>By skill</p>'],
  ];
  for (const [what, prefix, html] of evil) {
    app.sql(`UPDATE exam_attempts SET report = ${prefix}? WHERE user_id = ? AND id = ?`, html, LEA.sub, attempt);
    const [tab] = await Promise.all([context.waitForEvent('page'), page.click('#reportLink')]);
    await tab.waitForFunction(() => document.body && /By skill/.test(document.body.innerText), null, { timeout: 10000 });
    const seen = await tab.evaluate(() => ({ pwned: window.pwned, first: document.head.firstElementChild ? document.head.firstElementChild.outerHTML : null }));
    ck(`a report with ${what}: no script of it runs`, seen.pwned === undefined && /Content-Security-Policy/.test(seen.first || ''), JSON.stringify(seen));
    await tab.close();
  }

  // The token went with every call to this site's API, and nowhere else: not
  // with the app's words either (/api/translations/, the same for everybody),
  // and never to the IAM. The browser's time zone went to this site alone.
  // Where the site stands (the anotoki library's status, asked before the
  // sign-in is set up) is nobody's: it goes bare.
  const requests = await Promise.all(sent.map(async (r) => ({ url: r.url, headers: await r.headers })));
  const ofNobody = (r) => r.url === `${app.base}/api/site-status`;
  const ours = (r) => (r.url.startsWith(`${app.base}/api/`) || r.url.startsWith(`${app.base}/report/`)) && !ofNobody(r);
  const ofWords = (r) => r.url.startsWith(`${app.base}/api/translations/`) || r.url === `${app.base}/api/auth/config`;
  const bearer = (r) => /^Bearer /.test(r.headers.authorization || '');
  const api = requests.filter((r) => ours(r) && !ofWords(r));
  const elsewhere = requests.filter((r) => !ours(r) || ofWords(r));
  ck('her token went with every call to the API', api.length > 20 && api.every(bearer), api.filter((r) => !bearer(r)).map((r) => r.url).join(' '));
  ck('and nowhere else: not to the IAM, not with the app’s own files or words',
    elsewhere.some((r) => r.url.startsWith(IAM.issuer)) && !elsewhere.some(bearer), elsewhere.filter(bearer).map((r) => r.url).join(' '));
  ck('where the site stands was asked, with nothing of anybody’s: no token, no key',
    requests.some(ofNobody) && requests.filter(ofNobody).every((r) => !bearer(r) && !r.headers['x-visitor-key']));
  ck('the browser’s time zone went with every call to this site’s API, and never to the IAM',
    requests.filter(ours).every((r) => r.headers['x-time-zone'] === zone) && !requests.some((r) => r.url.startsWith(IAM.issuer) && r.headers['x-time-zone']));

  await page.click('#userButton');
  ck('the menu: her IAM account page', (await page.getAttribute('#accountLink', 'href')) === `${IAM.issuer}/account`);
  await shot('account-menu');
  await page.keyboard.press('Escape');

  // Signed out, the page loaded afresh: somebody signing in, in another tab,
  // starts the app here as him. Once it has shown his data, somebody else
  // signing in there loads it again, as her: nothing of his may stay on the
  // screen, or be sent as hers.
  console.log('another tab');
  await iamState({ deny: true });
  await page.click('#userButton');
  await page.click('#signOut');
  await page.waitForSelector('#signin-button', { timeout: 15000 });
  const tab = await context.newPage();
  await tab.goto(app.base + '/favicon.svg');
  await tab.evaluate(({ key, value }) => localStorage.setItem(key, value), iamSession(4203, { name: 'bob' }));
  await page.waitForSelector('#userButton', { timeout: 10000 });
  await page.waitForFunction(() => /\/ \d/.test(document.getElementById('kLearned')?.textContent || ''));
  ck('signed in, in another tab: the app starts here too, as him', (await page.textContent('.user-name')).trim() === 'bob');
  await page.evaluate(() => {
    window.stayed = true;
  });
  await tab.evaluate(({ key, value }) => localStorage.setItem(key, value), iamSession(4204, { name: 'cleo' }));
  await page.waitForFunction(() => document.querySelector('.user-name')?.textContent.trim() === 'cleo', null, { timeout: 10000 });
  ck('somebody else signs in there: this page loads again, as her', (await page.evaluate(() => window.stayed)) === undefined);
  await tab.close();
  ck('no browser errors after it', errors.length === 0, errors.join(' | '));
  await iamState({ deny: false });
  await context.close();

  /* ---------------------------------------------------- the admin area */
  console.log('?lang= and the admin area (ADMIN)');
  await iamState({ user: asUser(ADA) });
  const adminContext = await newContext(browser, { viewport: { width: 1100, height: 860 } });
  const admin = await adminContext.newPage();
  // a string is refused on purpose below (422)
  const adminErrors = watch(admin, { ignore: [/\/api\/admin\/translations$/] });
  await admin.goto(app.base + '/?lang=sk');
  await admin.waitForSelector('.homecards', { timeout: 15000 });
  ck('?lang=sk, through the IAM and back: the page is Slovak, and the parameter leaves the address',
    (await admin.getAttribute('html', 'lang')) === 'sk' && !new URL(admin.url()).searchParams.has('lang'), admin.url());
  const otherTab = await adminContext.newPage();
  await otherTab.goto(app.base + '/');
  await otherTab.waitForSelector('.homecards');
  ck('for that tab only: another one follows the browser, in English', (await otherTab.getAttribute('html', 'lang')) === 'en');
  await otherTab.close();
  ck('the Slovak home page: no key where a word should be', (await keyShaped(admin)).length === 0, (await keyShaped(admin)).join(' | '));

  await admin.click('#userButton');
  ck('Admin panel in her menu, in Slovak', (await admin.textContent('#adminLink')).trim() === 'Administrátorský panel', await admin.textContent('#adminLink'));
  await admin.click('#adminLink');
  await admin.waitForSelector('table.grid');
  ck('Admin panel: the Translations page, at /admin/translations, its title naming the panel',
    new URL(admin.url()).pathname === '/admin/translations' && (await admin.title()) === 'Translations · Admin panel · Japanese Academy', `${admin.url()} ${await admin.title()}`);
  ck('the admin area is English with Slovak chosen: the page, its <html lang>, the bar',
    (await admin.getAttribute('main', 'lang')) === 'en' && (await admin.textContent('h1')).trim() === 'Translations' && (await admin.getAttribute('html', 'lang')) === 'en'
      && (await admin.$('#langButton')) === null);
  const adminLinks = await admin.$$eval('.topbar-nav a', (els) => els.map((e) => e.textContent.trim()));
  ck('the bar holds the panel’s sections: Translations, Languages, People, Migrations; beside the mark its name',
    adminLinks.join(',') === 'Translations,Languages,People,Migrations' && (await admin.textContent('app-brand .area')).trim() === 'Japanese admin panel', adminLinks.join(','));
  await admin.click('#userButton');
  ck('and her menu says it in English, with the way back', (await admin.textContent('#accountLink')).trim() === 'Your anotoki account' && (await admin.textContent('#backLink')).trim() === 'Back to Japanese Academy');
  await admin.keyboard.press('Escape');
  await admin.screenshot({ path: path.join(SHOTS, 'admin-translations.png') });

  await admin.fill('input[type=search]', 'common.lesson');
  const lessonCell = admin.locator('textarea[aria-label="Slovak: common.lesson"]');
  await lessonCell.fill('Lekcia {x}');
  await admin.click('.save-bar button.primary');
  const refusal = admin.locator('tr.row:has(code.key-name:text-is("common.lesson")) td.key .err');
  const refusedText = await refusal.textContent({ timeout: 5000 }).catch(() => '');
  ck('a refused string: the reason stands beside its key', /^Nothing was saved\. .*\{x\}/.test(refusedText), refusedText);

  await admin.click('#nav-languages');
  const leaveAsked = await admin.waitForSelector('dialog.confirm[open]', { timeout: 3000 }).then(() => true, () => false);
  const words = leaveAsked ? { title: await admin.textContent('#confirm-title'), message: await admin.textContent('#confirm-message') } : {};
  ck('leaving with a string not saved asks, in a modal <dialog>, with its words',
    leaveAsked && (await admin.$eval('dialog.confirm', (d) => d.matches(':modal'))) && words.title === 'Leave without saving?' && /^1 changed string is not saved yet/.test(words.message),
    JSON.stringify(words));
  await admin.keyboard.press('Escape');
  const closed = await admin.waitForSelector('dialog.confirm[open]', { state: 'detached', timeout: 3000 }).then(() => true, () => false);
  ck('Escape counts as "no": the page and the string stay',
    closed && new URL(admin.url()).pathname === '/admin/translations' && (await lessonCell.inputValue()) === 'Lekcia {x}', admin.url());
  await admin.click('#nav-languages');
  await admin.waitForSelector('dialog.confirm[open]');
  await admin.click('dialog.confirm[open] button.primary');
  await admin.waitForSelector('section.add form');
  ck('and "Leave" leaves', new URL(admin.url()).pathname === '/admin/languages', admin.url());

  await admin.fill('section.add .field.code input', 'cs');
  await admin.fill('section.add input[placeholder="Czech"]', 'Czech');
  await admin.fill('section.add input[placeholder="Čeština"]', 'Čeština');
  ck('a new language is not offered unless ticked', !(await admin.isChecked('section.add .offered input')));
  await admin.click('section.add button[type=submit]');
  const added = await admin.waitForSelector('li.language[data-code="cs"]', { timeout: 5000 }).then(() => true, () => false);
  const offered = (await (await fetch(app.base + '/api/translations/en')).json()).languages.map((l) => l.code);
  ck('a new language comes in hidden: marked so, and not offered',
    added && (await admin.$eval('li.language[data-code="cs"]', (li) => li.classList.contains('is-hidden') && [...li.querySelectorAll('.tag')].some((tag) => tag.textContent.trim() === 'hidden')))
      && !offered.includes('cs') && offered.includes('sk'), offered.join(','));

  // People: an ADMIN deletes a person's data, after a copy of it
  await admin.click('#nav-people');
  await admin.waitForSelector('#people');
  const listed = await admin.$$eval('#people tbody tr', (rows) => rows.map((r) => r.getAttribute('data-id')));
  ck('People: everybody who signed in, her too', [LEA, MAX, ADA].every((x) => listed.includes(String(x.sub))) && (await admin.textContent(`#people tr[data-id="${ADA.sub}"]`)).includes('you'), listed.join(','));
  await admin.screenshot({ path: path.join(SHOTS, 'admin-people.png'), fullPage: true });
  const leaBefore = Number(app.sql('SELECT count(*) AS n FROM srs_progress WHERE user_id = ?', LEA.sub)[0].n);
  await admin.click(`#people tr[data-id="${MAX.sub}"] button`);
  await admin.waitForSelector('dialog.confirm[open]');
  const deleteWords = (await admin.textContent('#confirm-message')).replace(/\s+/g, ' ');
  ck('Delete data asks first, saying what goes', /2 items learned/.test(deleteWords) && /copy/.test(deleteWords), deleteWords);
  await admin.click('dialog.confirm[open] button.primary');
  const deletedSaid = await admin.waitForFunction(() => /data is deleted/.test(document.querySelector('p.status')?.textContent || ''), null, { timeout: 10000 }).then(() => true, () => false);
  ck('then deletes: said so, and the row gone', deletedSaid && (await admin.$(`#people tr[data-id="${MAX.sub}"]`)) === null, await admin.textContent('p.status'));
  ck('his data is gone, a copy of it kept, nobody else’s touched',
    Number(app.sql('SELECT count(*) AS n FROM srs_progress WHERE user_id = ?', MAX.sub)[0].n) === 0
      && app.sql('SELECT id FROM users WHERE id = ?', MAX.sub).length === 0
      && fs.readdirSync(app.backups).some((f) => /before-delete-user-4102-/.test(f))
      && Number(app.sql('SELECT count(*) AS n FROM srs_progress WHERE user_id = ?', LEA.sub)[0].n) === leaBefore);
  ck('no browser errors in the admin area', adminErrors.length === 0, adminErrors.join(' | '));
  await adminContext.close();

  // An EDITOR: Translations only; the API says 403 to the rest
  console.log('an EDITOR, and a learner');
  const editorContext = await newContext(browser, { viewport: { width: 1100, height: 860 } });
  await plant(editorContext, EDDIE);
  const editor = await editorContext.newPage();
  const editorErrors = watch(editor);
  await editor.goto(app.base + '/');
  await editor.waitForSelector('#userButton');
  await editor.click('#userButton');
  await editor.click('#adminLink');
  await editor.waitForSelector('table.grid');
  const editorLinks = await editor.$$eval('.topbar-nav a', (els) => els.map((e) => e.textContent.trim()));
  ck('an EDITOR: Admin opens Translations, the only section in the bar', new URL(editor.url()).pathname === '/admin/translations' && editorLinks.join(',') === 'Translations', editorLinks.join(','));
  for (const url of ['/admin/people', '/admin/languages']) {
    await editor.goto(app.base + url);
    await editor.waitForSelector('.homecards');
    ck(`an EDITOR opening ${url}: home instead`, new URL(editor.url()).pathname === '/', editor.url());
  }
  const people403 = await (await app.api('/api/admin/people', EDDIE)).json();
  const delete403 = await app.api(`/api/admin/people/${LEA.sub}`, EDDIE, { method: 'DELETE' });
  ck('and the API: 403 admin_only to the people, a delete refused, nothing deleted',
    people403.code === 'admin_only' && delete403.status === 403 && Number(app.sql('SELECT count(*) AS n FROM srs_progress WHERE user_id = ?', LEA.sub)[0].n) > 0);
  ck('no browser errors, as an EDITOR', editorErrors.length === 0, editorErrors.join(' | '));
  await editorContext.close();

  const learnerContext = await newContext(browser, { viewport: { width: 1100, height: 860 } });
  await plant(learnerContext, NOA);
  const learner = await learnerContext.newPage();
  await learner.goto(app.base + '/');
  await learner.waitForSelector('#userButton');
  await learner.click('#userButton');
  await learner.waitForSelector('#user-menu #signOut');
  ck('a learner: no Admin in the menu', (await learner.$('#adminLink')) === null);
  await learner.goto(app.base + '/admin/translations');
  await learner.waitForSelector('.homecards');
  ck('and /admin sends them home; the API says 403 staff_only',
    new URL(learner.url()).pathname === '/' && (await (await app.api('/api/admin/languages', NOA)).json()).code === 'staff_only');
  await learnerContext.close();

  /* ------------------------------------- a database update waiting for an ADMIN */
  console.log('a database update that waits for an administrator: the anotoki library’s page, and the Migrations page');
  // 006 adds a key and rewords strings, each only where that is not done yet: applied again, it changes
  // nothing. Taken off the list, with the stamp of the files forgotten, it is what an upload looks like.
  const WAITS = '006_admin_panel_words.sql';
  app.sql('DELETE FROM migrations WHERE name = ?', WAITS);
  app.sql("UPDATE content_state SET stamp = 'before the upload'");
  const waiting = await app.api('/api/kanji/summary', NOA);
  ck('every address with data says the site is being updated, and to ask again in a minute: no request applies it',
    waiting.status === 503 && (await waiting.json()).code === 'update_pending' && waiting.headers.get('retry-after') === '60'
      && app.sql('SELECT name FROM migrations WHERE name = ?', WAITS).length === 0);
  /** The anotoki library's page, as a tab shows it: its heading, its words, every button and link on it. */
  const libraryPage = (pg) =>
    pg.$eval('anotoki-site-status', (el) => ({
      title: (el.querySelector('h1')?.textContent ?? '').trim(),
      text: el.textContent.replace(/\s+/g, ' ').trim(),
      actions: [...el.querySelectorAll('a, button')].map((a) => a.textContent.trim()),
    }));
  // The pages behind the library's page are made all the same (the gate only hides them), and ask for their
  // data: answered 503 update_pending, on purpose.
  const WAITING_ANSWERS = [/\/api\/(kanji|meta|attempts|me\/data|admin\/(translations|languages|people|visitors))\b/];

  // A visitor - nobody signed in, sign-in required here: never sent to the IAM while the site is being updated.
  const asVisitor = await newContext(browser, { viewport: { width: 390, height: 844 } });
  const visitorSent = [];
  asVisitor.on('request', (request) => visitorSent.push(request.url()));
  const waitingVisitor = await asVisitor.newPage();
  const visitorErrors = watch(waitingVisitor, { ignore: WAITING_ANSWERS });
  await waitingVisitor.goto(app.base + '/kanji/reviews');
  await waitingVisitor.waitForSelector('anotoki-site-status h1', { timeout: 15000 });
  const seenByVisitor = await libraryPage(waitingVisitor);
  ck('a visitor: “The site is being updated” - no error, no code, no setup or migrations button; a quiet Sign in, and no trip to the IAM',
    seenByVisitor.title === 'The site is being updated' && seenByVisitor.actions.join(',') === 'Sign in'
      && !/error|update_pending|503|setup|Migrations/i.test(seenByVisitor.text) && !visitorSent.some((url) => url.startsWith(IAM.issuer)),
    JSON.stringify(seenByVisitor));
  await waitingVisitor.screenshot({ path: path.join(SHOTS, 'waiting-visitor.png') });
  ck('no browser errors for the visitor', visitorErrors.length === 0, visitorErrors.join(' | '));
  await asVisitor.close();

  // A signed-in learner: the same page, and no button at all.
  const asLearner = await newContext(browser, { viewport: { width: 390, height: 844 } });
  await plant(asLearner, NOA);
  const waitingLearner = await asLearner.newPage();
  const learnerErrors = watch(waitingLearner, { ignore: WAITING_ANSWERS });
  await waitingLearner.goto(app.base + '/');
  await waitingLearner.waitForSelector('anotoki-site-status h1', { timeout: 15000 });
  const seenByLearner = await libraryPage(waitingLearner);
  ck('a signed-in learner: the same page, no error, and no button at all',
    seenByLearner.title === 'The site is being updated' && seenByLearner.actions.length === 0 && !/error|update_pending|setup|Migrations/i.test(seenByLearner.text),
    JSON.stringify(seenByLearner));
  await waitingLearner.screenshot({ path: path.join(SHOTS, 'waiting-learner.png') });
  ck('no browser errors for the learner but the waiting answers', learnerErrors.length === 0, learnerErrors.join(' | '));
  await asLearner.close();

  // An EDITOR rewords strings, and applies nothing: the same page everywhere, with no way to the Migrations page.
  await iamState({ user: asUser(EDDIE) });
  const asEditor = await newContext(browser, { viewport: { width: 1100, height: 860 } });
  await plant(asEditor, EDDIE);
  const waitingEditor = await asEditor.newPage();
  for (const where of ['/', '/admin/migrations', '/admin/translations']) {
    await waitingEditor.goto(app.base + where);
    await waitingEditor.waitForSelector('anotoki-site-status h1', { timeout: 15000 });
    const seen = await libraryPage(waitingEditor);
    ck(`an EDITOR at ${where} while it waits: the same page, and no way to the Migrations page`,
      seen.title === 'The site is being updated' && seen.actions.length === 0 && (await waitingEditor.$('main.admin')) === null,
      `${new URL(waitingEditor.url()).pathname}: ${JSON.stringify(seen)}`);
  }
  await asEditor.close();

  // A signed-out administrator: the visitors' page, whose Sign in goes to the IAM and back to it - signed in, the
  // way to the Migrations page, where they apply it. (No session planted: the trip itself is what is tried.)
  await iamState({ user: asUser(ADA), deny: false });
  const asAdmin = await newContext(browser, { viewport: { width: 1100, height: 860 } });
  const migrations = await asAdmin.newPage();
  const migrationErrors = watch(migrations, { ignore: WAITING_ANSWERS });
  await migrations.goto(app.base + '/');
  await migrations.waitForSelector('anotoki-site-status button', { timeout: 15000 });
  ck('a signed-out administrator: the visitors’ page, its quiet Sign in the way in', (await libraryPage(migrations)).actions.join(',') === 'Sign in');
  const iamBefore = (await iamLog()).length;
  await migrations.click('anotoki-site-status button');
  await migrations.waitForSelector('anotoki-site-status a', { timeout: 15000 });
  const seenByAdmin = await libraryPage(migrations);
  ck('its Sign in: to the IAM and back to the same page, signed in - “A database update is waiting”, with the way to the Migrations page',
    (await iamLog()).slice(iamBefore).includes('GET /api/oidc/authorize') && new URL(migrations.url()).pathname === '/'
      && seenByAdmin.title === 'A database update is waiting' && seenByAdmin.actions.join(',') === 'Open Migrations'
      && (await migrations.textContent('.user-name')).trim() === 'ada', `${migrations.url()} ${JSON.stringify(seenByAdmin)}`);
  await migrations.screenshot({ path: path.join(SHOTS, 'waiting-admin.png') });
  await migrations.click('anotoki-site-status a');
  await migrations.waitForSelector('[data-pending] .file', { timeout: 15000 });
  const pendingFiles = await migrations.$$eval('[data-pending] .file code', (els) => els.map((e) => e.textContent.trim()));
  ck('the Migrations page opens while it waits: the file pending, the rest applied, Apply on',
    new URL(migrations.url()).pathname === '/admin/migrations' && pendingFiles.join(',') === WAITS
      && (await migrations.$$('[data-applied] .file')).length >= 5 && !(await migrations.isDisabled('[data-apply]'))
      && (await migrations.title()) === 'Migrations · Admin panel · Japanese Academy', `${pendingFiles.join(',')} ${await migrations.title()}`);
  await migrations.screenshot({ path: path.join(SHOTS, 'admin-migrations-waiting.png'), fullPage: true });
  await migrations.click('[data-apply]');
  await migrations.waitForSelector('dialog[data-confirm][open]');
  ck('Apply asks first', (await migrations.textContent('dialog[data-confirm] h2')).trim() === 'Apply 1 pending migration?');

  // A migration that fails: 006's own gate, with the Slovak string it rewords taken away. Rolled back whole and named.
  const SK_ADMIN = "SELECT value FROM translations WHERE key_name = 'topbar.admin' AND language_code = ?";
  const skAdmin = app.sql(SK_ADMIN, 'sk')[0].value;
  const enAdmin = app.sql(SK_ADMIN, 'en')[0].value;
  app.sql("DELETE FROM translations WHERE key_name = 'topbar.admin' AND language_code = 'sk'");
  await migrations.click('[data-confirm-apply]');
  await migrations.waitForSelector('[data-result] .result-title', { timeout: 15000 });
  await migrations.waitForFunction(() => !document.querySelector('[data-apply]').textContent.includes('Applying'));
  const stopped = (await migrations.textContent('[data-result]')).replace(/\s+/g, ' ').trim();
  ck('a migration that fails: stopped at its file, nothing applied, rolled back whole, Apply on for another try',
    (await migrations.textContent('[data-result] .result-title')).trim() === `Stopped at ${WAITS}` && /Nothing was applied\. The failed file was rolled back as a whole\./.test(stopped)
      && (await migrations.getAttribute('[data-result]', 'role')) === 'alert' && app.sql('SELECT name FROM migrations WHERE name = ?', WAITS).length === 0
      && app.sql(SK_ADMIN, 'en')[0].value === enAdmin && !(await migrations.isDisabled('[data-apply]'))
      && (await migrations.$$eval('[data-pending] .file code', (els) => els.map((e) => e.textContent.trim()))).join(',') === WAITS, stopped);
  // Why, in PostgreSQL's own words (its gate's exception), on the page as the IAM's shows it - a website's too.
  const why = (await migrations.$eval('[data-result] pre.error', (el) => el.textContent).catch(() => '')).trim();
  ck("a migration that fails: why, in PostgreSQL's own words, on the page (no error log to look in)",
    /ERROR:\s+006_admin_panel_words: reworded keys without an English and a Slovak string: topbar\.admin/.test(why) && !/error log/.test(stopped), why || stopped);
  await migrations.screenshot({ path: path.join(SHOTS, 'admin-migrations-failed.png'), fullPage: true });
  app.sql("INSERT INTO translations (key_name, language_code, value) VALUES ('topbar.admin', 'sk', ?)", skAdmin);

  await migrations.click('[data-apply]');
  await migrations.waitForSelector('dialog[data-confirm][open]');
  await migrations.click('[data-confirm-apply]');
  await migrations.waitForFunction(() => document.querySelector('[data-result] .result-title')?.textContent.trim() === 'Up to date', null, { timeout: 15000 });
  await migrations.waitForFunction(() => /Nothing pending/.test(document.querySelector('[data-pending]')?.textContent ?? ''));
  ck('then applies it: up to date, nothing pending, the file applied, Apply off',
    /Applied: 006_admin_panel_words\.sql\./.test(await migrations.textContent('[data-result]')) && (await migrations.isDisabled('[data-apply]'))
      && app.sql('SELECT name FROM migrations WHERE name = ?', WAITS).length === 1, await migrations.textContent('[data-result]'));
  await migrations.screenshot({ path: path.join(SHOTS, 'admin-migrations.png'), fullPage: true });
  // Back to the app without a page load (the menu's link): the gate is open again, and the app's words were asked
  // for anew - the learner's page is drawn in words, not keys, from the start.
  await migrations.click('#userButton');
  await migrations.click('#backLink');
  await migrations.waitForSelector('.homecards', { timeout: 15000 });
  const keysBack = await keyShaped(migrations);
  ck('back to the app by the menu, no page load: its words at once, no key on the page',
    keysBack.length === 0 && new URL(migrations.url()).pathname === '/' && (await migrations.$('anotoki-site-status')) === null, keysBack.join(' | '));
  ck('and the app is back, for everybody', (await app.api('/api/kanji/summary', NOA)).status === 200);
  ck('no browser errors on the way but the waiting answers', migrationErrors.length === 0, migrationErrors.join(' | '));
  const editorMigrations = await app.api('/api/admin/migrations', EDDIE);
  ck('the Migrations page’s addresses are an administrator’s: an EDITOR 403 admin_only', editorMigrations.status === 403 && (await editorMigrations.json()).code === 'admin_only');
  await asAdmin.close();

  /* -------------------------------------------------------- time zones */
  console.log('time zones');
  const dayIn = (timeZone) => new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
  const KIRITIMATI = 'Pacific/Kiritimati'; // UTC+14
  const PAGO = 'Pacific/Pago_Pago'; // UTC-11: never the same day
  await app.api('/api/kanji/summary', KIRI); // the person's row
  app.sql('INSERT INTO srs_daily (user_id, day, lessons) VALUES (?, ?::date, 3), (?, ?::date, 7)', KIRI.sub, dayIn(KIRITIMATI), KIRI.sub, dayIn(PAGO));
  for (const [timezoneId, lessons, lang] of [[KIRITIMATI, '3', null], [PAGO, '7', 'sk']]) {
    const zoned = await newContext(browser, { viewport: { width: 1100, height: 860 }, timezoneId, ...(lang ? { locale: 'sk-SK' } : {}) });
    await plant(zoned, KIRI, lang);
    const z = await zoned.newPage();
    const zErrors = watch(z);
    await z.goto(app.base + '/kanji');
    await z.waitForSelector('.today');
    const today = (await z.textContent('.today span:first-child b').catch(() => '')).trim();
    ck(`a browser on ${timezoneId}: its own today (${dayIn(timezoneId)}: ${lessons} learned)`, dayIn(KIRITIMATI) !== dayIn(PAGO) && today === lessons, today);
    ck('and the server keeps the zone', app.sql('SELECT time_zone FROM users WHERE id = ?', KIRI.sub)[0].time_zone === timezoneId);
    if (lang) {
      // the Slovak pass: the learner's pages, the bar's menus, Your data's question - no key anywhere
      const found = [];
      found.push(...(await keyShaped(z)));
      await z.click('#userButton');
      await z.waitForSelector('#user-menu');
      found.push(...(await keyShaped(z)));
      await z.keyboard.press('Escape');
      await z.click('#langButton');
      await z.waitForSelector('#langmenu');
      found.push(...(await keyShaped(z)));
      await z.keyboard.press('Escape');
      await z.goto(app.base + '/');
      await z.waitForSelector('#yourZone');
      ck('Your data in Slovak names the zone', (await z.textContent('#yourZone')).includes(timezoneId) && (await z.getAttribute('html', 'lang')) === 'sk');
      const own = await (await app.api('/api/me/data', KIRI)).text();
      await z.setInputFiles('#your-data input[type=file]', { name: 'kiri.json', mimeType: 'application/json', buffer: Buffer.from(own) });
      await z.waitForSelector('dialog.confirm[open]');
      found.push(...(await keyShaped(z)));
      await z.click('#keepMine');
      await z.setViewportSize({ width: 390, height: 844 });
      await z.click('#menuButton');
      await z.waitForSelector('#topbar-menu');
      found.push(...(await keyShaped(z)));
      for (const url of ['/kanji/lessons', '/kanji/browse', '/exam']) {
        await z.goto(app.base + url);
        await z.waitForSelector('main');
        await z.waitForTimeout(300);
        found.push(...(await keyShaped(z)));
      }
      ck('Slovak: no key-shaped text on the pages, in the bar’s menus or in Your data’s question', found.length === 0, [...new Set(found)].join(' | '));
    }
    ck(`no browser errors on ${timezoneId}`, zErrors.length === 0, zErrors.join(' | '));
    await zoned.close();
  }

  /* ----------------------------------------- studying without signing in */
  // The IAM says sign-in is not required here: nobody signed in studies as a
  // visitor (docs/kb/sign-in.md, *Visitors*), whose study moves into the
  // account at the sign-in; switched back on, a visitor goes to the IAM.
  console.log('visitors: sign-in not required');
  const VISITOR_KEY = 'japanese-academy-visitor';
  const visitorRows = () => app.sql('SELECT id FROM users WHERE id < 0 ORDER BY id').map((r) => Number(r.id));
  const rowsOf = (table, id) => Number(app.sql(`SELECT count(*) AS n FROM ${table} WHERE user_id = ?`, id)[0].n);
  await app.signInRequired(false);
  const vContext = await newContext(browser, { viewport: { width: 1100, height: 860 } });
  const vSent = [];
  vContext.on('request', (request) => {
    vSent.push({ url: request.url(), method: request.method(), headers: Promise.race([request.allHeaders(), sleep(3000).then(() => request.headers())]).catch(() => request.headers()) });
  });
  const vPage = await vContext.newPage();
  vPage.on('dialog', (d) => d.accept()); // the exam's "quit?"
  // a refused sign-in below comes back with its error, on purpose
  const vErrors = watch(vPage);
  const heldKey = () => vPage.evaluate((k) => localStorage.getItem(k), VISITOR_KEY);
  const vOpen = async (url) => {
    await vPage.goto('about:blank');
    await vPage.goto(app.base + url);
  };
  const toIam = (from) => vSent.slice(from).some((r) => r.url.startsWith(`${IAM.issuer}/api/oidc/authorize`));

  await vOpen('/');
  await vPage.waitForSelector('#visitorNotice', { timeout: 15000 });
  await vPage.waitForSelector('.homecards');
  ck('sign-in not required: / opens at once, no trip to the IAM, as a visitor',
    new URL(vPage.url()).pathname === '/' && !toIam(0), vPage.url());
  const noticeWords = (await vPage.textContent('#visitorNotice p')).trim();
  ck('the notice: kept for this browser for 30 days after the last visit; signing in keeps it',
    noticeWords === 'You are studying without signing in. What you study is kept for this browser for 30 days after your last visit. Sign in to keep it in your account.', noticeWords);
  ck('no Your data, no person’s menu, no way to the admin panel; Sign in in the bar and in the notice',
    (await vPage.$('#your-data')) === null && (await vPage.$('#userButton')) === null && (await vPage.$('#adminLink')) === null
      && (await vPage.isVisible('#signInButton')) && (await vPage.isVisible('#visitorSignIn')));
  ck('a page looked at makes nobody: no key, no visitor', (await heldKey()) === null && visitorRows().length === 0, visitorRows().join(','));
  await vPage.screenshot({ path: path.join(SHOTS, 'home-visitor.png') });

  // The admin panel stays sign-in only: a visitor opening it goes to the IAM. Refused there (as when an
  // administrator took their MEMBER away), they are back on a visitor's page, told why.
  await iamState({ deny: true });
  let mark = vSent.length;
  await vOpen('/admin/migrations');
  const failedShown = await vPage.waitForSelector('#signInFailed', { timeout: 15000 }).then(() => true, () => false);
  const failedWords = failedShown ? (await vPage.textContent('#signInFailed p')).trim() : '';
  ck('/admin/migrations as a visitor: to the IAM first, never the panel', toIam(mark) && (await vPage.$('main.admin')) === null, vPage.url());
  ck('refused there: back home, still a visitor, told why in the sign-in’s words',
    failedShown && failedWords === refusedWords && new URL(vPage.url()).pathname === '/' && (await vPage.isVisible('#visitorNotice')), `${vPage.url()} ${failedWords}`);
  await vPage.click('#signInFailedClose');
  ck('and the words close', await vPage.waitForSelector('#signInFailed', { state: 'detached', timeout: 3000 }).then(() => true, () => false));
  await iamState({ deny: false });

  // A lesson batch: the first answer makes the visitor (its answer brings the key), the others go with it.
  await vOpen('/kanji');
  await vPage.waitForSelector('.cards3');
  await vPage.getByRole('button', { name: /^Learn \d+ items?$/ }).click();
  await vPage.waitForSelector('.lband');
  for (let i = 0; i < 15; i++) {
    await vPage.keyboard.press('Enter');
    await vPage.waitForTimeout(30);
  }
  await vPage.waitForSelector('.mode-lesson');
  for (let i = 0; (await inSession(vPage)) && i < 40; i++) {
    await answer({}, vPage);
    await next(vPage);
  }
  await vPage.waitForSelector('h1.page');
  const key = await heldKey();
  const [visitor] = visitorRows();
  ck('a lesson batch as a visitor: one key in this browser, one visitor (a negative id), five items its own',
    /^[A-Za-z0-9_-]{43}$/.test(key || '') && visitorRows().length === 1 && visitor < 0 && rowsOf('srs_progress', visitor) === 5,
    `${key} ${visitorRows().join(',')}`);
  const learns = await Promise.all(vSent.filter((r) => r.method === 'POST' && r.url === `${app.base}/api/kanji/learn`).map(async (r) => r.headers));
  ck('the first answer went alone and brought the key; every other went with it; none with a token',
    learns.length >= 5 && !learns[0]['x-visitor-key'] && learns.slice(1).every((h) => h['x-visitor-key'] === key) && learns.every((h) => !h.authorization),
    learns.map((h) => (h['x-visitor-key'] ? 'key' : 'none')).join(','));
  await vOpen('/');
  await vPage.waitForFunction(() => /\d/.test(document.getElementById('kLearned')?.textContent || ''));
  ck('the page loaded again: the visitor’s progress is still there', (await vPage.textContent('#kLearned')).trim().startsWith('5 /'), await vPage.textContent('#kLearned'));

  // An exam handed in, and its report, as the visitor.
  await vOpen('/exam');
  await vPage.waitForSelector('#bookChips .chip');
  await vPage.click('[data-size="40"]');
  await vPage.click('#startBtn');
  await vPage.waitForSelector('#test:not([hidden])');
  await vPage.click('#quitBtn');
  await vPage.waitForSelector('#result:not([hidden])', { timeout: 15000 });
  ck('an exam as a visitor: scored and kept, the visitor’s', rowsOf('exam_attempts', visitor) === 1);
  const [vReport] = await Promise.all([vContext.waitForEvent('page'), vPage.click('#reportLink')]);
  const reportOpened = await vReport.waitForFunction(() => document.body && /By skill/.test(document.body.innerText), null, { timeout: 10000 }).then(() => true, () => false);
  ck('and its report opens, fetched with the key', reportOpened && vReport.url().startsWith('blob:'), vReport.url());
  await vReport.close();

  // Signing in from the bar straight after the last answer of a batch, its saves held back on their way:
  // the sign-in waits for them, and everything the visitor studied moves into the account.
  console.log('visitors: signing in moves it');
  let vHeld = 0;
  await vPage.route('**/api/kanji/learn', async (route) => {
    vHeld += 1;
    await sleep(1500);
    await route.continue();
  });
  await iamState({ user: asUser(VERA), deny: false });
  await vOpen('/kanji');
  await vPage.waitForSelector('.cards3');
  await vPage.getByRole('button', { name: /^Learn \d+ items?$/ }).click();
  await vPage.waitForSelector('.lband');
  for (let i = 0; i < 15; i++) {
    await vPage.keyboard.press('Enter');
    await vPage.waitForTimeout(30);
  }
  await vPage.waitForSelector('.mode-lesson');
  for (let i = 0; (await inSession(vPage)) && i < 40; i++) {
    await answer({}, vPage);
    await next(vPage);
  }
  const visitorBefore = rowsOf('srs_progress', visitor);
  mark = vSent.length;
  await vPage.click('#signInButton');
  const signInWaited = await vPage.waitForSelector('#signInButton[aria-busy="true"]', { timeout: 1000 }).then(() => true, () => false);
  const signInWaitWords = signInWaited ? (await vPage.textContent('#signInButton')).trim() : '';
  ck('Sign in with answers on their way: it waits for them, saying so', signInWaited && signInWaitWords === 'Saving…' && visitorBefore < 10, `${signInWaitWords} (${visitorBefore} kept before)`);
  await vPage.waitForSelector('#userButton', { timeout: 20000 });
  await vPage.unroute('**/api/kanji/learn');
  ck('then to the IAM and back, signed in, on the page it left', toIam(mark) && (await vPage.textContent('.user-name')).trim() === 'vera' && new URL(vPage.url()).pathname === '/kanji', vPage.url());
  const movedShown = await vPage.waitForSelector('#visitorMoved', { timeout: 10000 }).then(() => true, () => false);
  const movedWords = movedShown ? (await vPage.textContent('#visitorMoved p')).replace(/\s+/g, ' ').trim() : '';
  ck('the note: what moved into the account', movedWords === 'What you studied without signing in is now in your account. Kanji and words: 10, exam attempts: 1.', movedWords);
  ck('in the database: her 10 items (the last answer too) and the exam; no visitor left, its key gone from the browser',
    vHeld >= 1 && rowsOf('srs_progress', VERA.sub) === 10 && rowsOf('exam_attempts', VERA.sub) === 1 && visitorRows().length === 0 && (await heldKey()) === null,
    `${rowsOf('srs_progress', VERA.sub)} items, ${rowsOf('exam_attempts', VERA.sub)} attempt(s), visitors ${visitorRows().join(',')}, ${vHeld} held back`);
  ck('the kanji dashboard shows them as hers, the notice gone', (await vPage.$('#visitorNotice')) === null && (await vPage.isVisible('.cards3')));

  // Signing out: a fresh visitor's page, with nothing of hers.
  await vPage.click('#userButton');
  await vPage.click('#signOut');
  await vPage.waitForSelector('#visitorNotice', { timeout: 15000 });
  await vOpen('/');
  await vPage.waitForFunction(() => /\d/.test(document.getElementById('kLearned')?.textContent || ''));
  ck('signed out: a visitor’s page again, nothing learned, no key, nobody made',
    (await vPage.$('#userButton')) === null && (await vPage.textContent('#kLearned')).trim().startsWith('0 /') && (await heldKey()) === null && visitorRows().length === 0,
    await vPage.textContent('#kLearned'));

  // Sign-in required again, with a visitor's key held: the page goes to the IAM, and the sign-in moves it.
  console.log('visitors: sign-in required again');
  const wrenItem = cat.items.find((it) => it.type === 'kanji').id; // a kanji: a word waits for its kanji
  const made = await fetch(app.base + '/api/kanji/learn', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: wrenItem }) });
  const madeKey = made.headers.get('x-visitor-key');
  await vPage.evaluate(([k, v]) => localStorage.setItem(k, v), [VISITOR_KEY, madeKey]);
  ck('(a visitor with one item, its key in this browser)', made.status === 200 && visitorRows().length === 1 && (await heldKey()) === madeKey, String(made.status));
  await iamState({ user: asUser(WREN) });
  await app.signInRequired(true);
  mark = vSent.length;
  await vOpen('/kanji');
  await vPage.waitForSelector('#userButton', { timeout: 20000 });
  await vPage.waitForSelector('.cards3');
  const sentSince = await Promise.all(vSent.slice(mark).map(async (r) => ({ url: r.url, method: r.method, headers: await r.headers })));
  ck('switched on: the page goes to the IAM first, and comes back signed in', toIam(mark) && (await vPage.textContent('.user-name')).trim() === 'wren', vPage.url());
  ck('the key went only with the move, never as a visitor’s while sign-in is required',
    sentSince.filter((r) => r.headers['x-visitor-key']).every((r) => r.method === 'POST' && r.url === `${app.base}/api/visitor/move` && /^Bearer /.test(r.headers.authorization || '')),
    sentSince.filter((r) => r.headers['x-visitor-key']).map((r) => r.url).join(' '));
  const wrenHas = await vPage.waitForFunction((k) => localStorage.getItem(k) === null, VISITOR_KEY, { timeout: 10000 }).then(() => true, () => false);
  ck('and the sign-in moved the visitor’s item into the account: the visitor and its key gone',
    wrenHas && app.sql('SELECT item_id FROM srs_progress WHERE user_id = ?', WREN.sub).map((r) => r.item_id).join(',') === wrenItem && visitorRows().length === 0,
    `${app.sql('SELECT item_id FROM srs_progress WHERE user_id = ?', WREN.sub).map((r) => r.item_id).join(',')} visitors ${visitorRows().join(',')}`);
  const vAll = await Promise.all(vSent.map(async (r) => ({ url: r.url, headers: await r.headers })));
  ck('never a token and a key together but on the move; never the key to the IAM',
    vAll.every((r) => !(r.headers['x-visitor-key'] && r.headers.authorization) || r.url === `${app.base}/api/visitor/move`)
      && !vAll.some((r) => r.url.startsWith(IAM.issuer) && r.headers['x-visitor-key']));
  ck('no browser errors as a visitor, signing in and out', vErrors.length === 0, vErrors.join(' | '));
  await vContext.close();

  // The Slovak pass of a visitor's page, on a phone.
  await app.signInRequired(false);
  const skVisitor = await newContext(browser, { viewport: { width: 390, height: 844 }, locale: 'sk-SK', isMobile: true, hasTouch: true });
  const skPage = await skVisitor.newPage();
  const skErrors = watch(skPage);
  await skPage.goto(app.base + '/');
  await skPage.waitForSelector('#visitorNotice', { timeout: 15000 });
  const skNotice = (await skPage.textContent('#visitorNotice p')).trim();
  const skFound = [...(await keyShaped(skPage))];
  ck('in Slovak, on a phone: the notice in Slovak, 30 days in their form',
    (await skPage.getAttribute('html', 'lang')) === 'sk' && skNotice === 'Študuješ bez prihlásenia. To, čo sa naučíš, uchováme pre tento prehliadač 30 dní po tvojej poslednej návšteve. Prihlás sa a zostane ti vo tvojom účte.', skNotice);
  ck('and no sideways scroll at 390 px', await skPage.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth));
  await skPage.screenshot({ path: path.join(SHOTS, 'home-visitor-sk-phone.png'), fullPage: true });
  await skPage.click('#menuButton');
  await skPage.waitForSelector('#topbar-menu');
  skFound.push(...(await keyShaped(skPage)));
  ck('the phone menu: Sign in, no person’s items', (await skPage.isVisible('#signInItem')) && (await skPage.$('#signOut')) === null);
  ck('no key-shaped text on the visitor’s Slovak page or in its menu', skFound.length === 0, [...new Set(skFound)].join(' | '));
  ck('no browser errors in Slovak as a visitor', skErrors.length === 0, skErrors.join(' | '));
  await skVisitor.close();
  await app.signInRequired(true);

  await browser.close();
  await app.close();
  console.log(`\n${fails() ? fails() + ' FAILURE(S)' : 'BROWSER SUITE PASSED'}  (screenshots: ${SHOTS})`);
  process.exit(fails() ? 1 : 0);
})().catch(async (e) => {
  console.error(e);
  await closeAll();
  process.exit(1);
});
