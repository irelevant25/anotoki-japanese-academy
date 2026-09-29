/**
 * The app in a real browser, the way a person uses it:
 *   kanji    lessons → quiz (romaji typed, one miss on purpose) → reviews (clock
 *            moved) → practice (+ "My answer was right") → item page → browse
 *   exam     a 40-question listening paper, answered and finished with the
 *            keys, scored (once, though Enter came twice), reported
 *   the app  moving between its sections loads no page; the version at the
 *            foot opens what's new
 *   sign-in  (auth mode iam, against the test IAM, answered in the browser)
 *            signed out → Sign in → back signed in, with only their own data;
 *            the progress download and a report, fetched with the token, which
 *            goes to this site only; Sign out; then a sign-in in another tab
 *            starts the app there, and somebody else's after it loads the
 *            page again, as them
 *
 * The first three run without sign-in (auth mode none), as on the owner's
 * computer. Runs the real server, serving the production build of the app,
 * against a throwaway database — your own database and backups are never
 * touched.   npm run test:browser
 */
const path = require('path');
const fs = require('fs');
const { isolate, startApp, closeAll, iamSession, FRONTEND } = require('./helpers');
isolate('academy-browser'); // before the server starts: a throwaway database

const wk = require('wanakana');
const { launch, watch, reporter, emulateIam, SHOTS } = require('./browser');

(async () => {
  const app = await startApp();
  const { ck, fails } = reporter();
  const browser = await launch();
  fs.mkdirSync(SHOTS, { recursive: true });

  const cat = await (await fetch(app.base + '/api/kanji/catalog')).json();
  const byChars = {};
  for (const it of cat.items) (byChars[it.chars] = byChars[it.chars] || []).push(it);

  const page = await (await browser.newContext({ viewport: { width: 1100, height: 860 } })).newPage();
  // /learn and /review may answer 409 by design (e.g. a double submit)
  const errors = watch(page, { ignore: [/\/api\/kanji\/(learn|review)/] });
  const shot = (name, fullPage = false) => page.screenshot({ path: path.join(SHOTS, `${name}.png`), fullPage });

  async function card() {
    const chars = await page.textContent('.s-chars');
    const isKanji = await page.$eval('.s-card', (el) => el.classList.contains('t-kanji'));
    const part = await page.$eval('.s-q', (el) => (el.classList.contains('reading') ? 'reading' : 'meaning'));
    const it = (byChars[chars] || []).find((x) => x.type === (isKanji ? 'kanji' : 'vocab'));
    return { chars, part, it };
  }
  async function answer({ wrong = false } = {}) {
    const c = await card();
    let text;
    if (c.part === 'meaning') text = wrong ? 'zebra' : c.it.meanings[0].replace(/\(.*?\)/g, '').trim();
    else text = wrong ? (wk.toRomaji(c.it.readings[0]) === 'ken' ? 'mizu' : 'ken') : wk.toRomaji(c.it.readings[0]);
    await page.click('.s-input');
    await page.keyboard.type(text, { delay: 5 });
    await page.keyboard.press('Enter');
    await page.waitForTimeout(80);
    const shown = await page.inputValue('.s-input');
    const cls = await page.$eval('.session', (el) => el.className);
    return { ...c, typed: text, shown, verdict: cls.includes('is-wrong') ? 'wrong' : cls.includes('is-correct') ? 'correct' : 'none' };
  }
  const next = async () => {
    await page.keyboard.press('Enter');
    await page.waitForTimeout(100);
  };
  const inSession = async () => (await page.$('.session')) !== null;
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
  ck('romaji becomes kana', kana && /^[\u3040-\u30ff]+$/.test(kana.shown), kana && `${kana.typed} → ${kana.shown}`);
  ck('quiz: 5 items × 2 halves + 1 retry', n === 11, `${n} answers`);
  await page.waitForSelector('h1.page');
  ck('summary: 5 learned', /learned 5 item/.test(await page.textContent('.lead')));
  // The lesson ran over the dashboard, so the address is still /kanji, the
  // same as the Dashboard link's: clicking it must still bring the dashboard back.
  ck('the address stayed /kanji', new URL(page.url()).pathname === '/kanji', page.url());
  await page.click('.subnav a[data-route=""]');
  ck('the Dashboard link works after a lesson started there',
    await page.waitForSelector('.cards3', { timeout: 3000 }).then(() => true, () => false));
  let p = await (await fetch(app.base + '/api/kanji/progress')).json();
  const learned = Object.keys(p.items).filter((id) => p.items[id].stage === 1);
  ck('server: 5 items at Apprentice I', learned.length === 5, learned.join(' '));

  /* ---------------------------------------------------------- reviews */
  console.log('kanji: reviews');
  app.makeDue(learned);
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
  p = await (await fetch(app.base + '/api/kanji/progress')).json();
  const stages = learned.map((id) => p.items[id].stage);
  ck('4 clean reviews → Apprentice II, the missed one stays', stages.filter((s) => s === 2).length === 4 && stages.filter((s) => s === 1).length === 1, stages.join(','));
  ck('summary shows the moves', /Apprentice I → Apprentice II/.test(await page.textContent('main')));

  /* --------------------------------------------------------- practice */
  console.log('kanji: practice');
  const before = JSON.parse(JSON.stringify(p.items));
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
  p = await (await fetch(app.base + '/api/kanji/progress')).json();
  const moved = Object.keys(before).filter((id) => before[id].stage !== p.items[id].stage || before[id].nextReview !== p.items[id].nextReview);
  ck('practice changed no stage or review time', moved.length === 0, moved.join(' '));
  ck('the accepted answer is now a synonym', (p.items[accepted].synonyms || []).includes('numero uno'));
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
    await new Promise((r) => setTimeout(r, 1500));
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
  page.on('dialog', (d) => d.accept());
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
  await page.keyboard.press('Enter'); // the last question: Enter finishes
  await page.keyboard.press('Enter'); // and again while it is being scored: nothing more
  await page.waitForSelector('#result:not([hidden])', { timeout: 15000 });
  ck('exam scored', /%/.test(await page.textContent('#verdict')));
  const attempts = await (await fetch(app.base + '/api/attempts')).json();
  ck('scored once: Enter twice stores one attempt', attempts.length === 1, `stored: ${attempts.length}`);
  // browsers fetch audio with Range headers, so 206 Partial Content is the normal answer
  ck('recordings stream', audio.length > 0 && audio.every((x) => /^20[06] audio\/mpeg/.test(x)), `${audio.length} clip(s)`);
  const rep = await page.request.get(app.base + (await page.getAttribute('#reportLink', 'href')));
  ck('report opens', rep.status() === 200);
  ck('without sign-in nothing is different: no account menu, no Sign in page',
    (await page.$('#usermenu')) === null && (await page.$('#signin')) === null);
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
  await page.click('.topnav a[href="/exam"]');
  await page.waitForSelector('#bookChips .chip');
  await page.click('.topnav a[href="/kanji"]');
  await page.waitForSelector('.cards3');
  await page.click('.subnav a[data-route="browse"]');
  await page.waitForSelector('.bgrid');
  await page.click('.topnav a.brand');
  await page.waitForSelector('.homecards');
  ck('moving between the sections loads no page', await page.evaluate(() => window.stayed === true));

  const [latest] = JSON.parse(fs.readFileSync(path.join(FRONTEND, 'public', 'changelog.json'), 'utf8'));
  ck('the version at the foot, with a dot while its news is unread',
    (await page.textContent('#version')).trim() === `v${latest.version}` && (await page.isVisible('#version .dot')));
  await page.click('#version');
  await page.waitForSelector('dialog.changelog[open]');
  const news = await page.textContent('dialog.changelog');
  ck("it opens what's new", news.includes(`v${latest.version}`) && news.includes(latest.changes.added[0]));
  await shot('changelog');
  await page.keyboard.press('Escape');
  ck('Escape closes it, and the dot is gone',
    (await page.$('dialog.changelog[open]')) === null && (await page.$('#version .dot')) === null);

  ck('no browser errors', errors.length === 0, errors.join(' | '));

  /* ---------------------------------------------- sign-in (auth mode iam) */
  console.log('sign-in (auth mode iam)');
  const site = await startApp({ auth: 'iam' });
  const ada = { sub: 4201, name: 'ada', roles: ['MEMBER'] };
  const context = await browser.newContext({ viewport: { width: 1100, height: 860 }, acceptDownloads: true });
  const asked = await emulateIam(context, ada);
  // every request of hers, and whether it carried a token
  const sent = [];
  context.on('request', (request) => {
    sent.push(
      request.allHeaders().then(
        (h) => ({ url: request.url(), bearer: /^Bearer /.test(h.authorization || '') }),
        () => ({ url: request.url(), bearer: /^Bearer /.test(request.headers().authorization || '') }) // its page closed meanwhile
      )
    );
  });
  const signed = await context.newPage();
  const signedErrors = watch(signed);
  const visit = async (url) => {
    await signed.goto('about:blank');
    await signed.goto(site.base + url);
  };

  await visit('/');
  await signed.waitForSelector('#signin-button');
  ck('signed out: the Sign in page stands in for the app', !(await signed.isVisible('.homecards')) && (await signed.isVisible('main.signin')));
  await signed.screenshot({ path: path.join(SHOTS, 'signed-out.png') });
  await signed.click('#signin-button');
  await signed.waitForSelector('#usermenu', { timeout: 10000 });
  ck('Sign in goes to the IAM, and back', asked.includes('GET /api/oidc/authorize') && asked.includes('POST /api/oidc/token'), asked.join(', '));
  ck('back on the page that was open, signed in', new URL(signed.url()).pathname === '/', signed.url());
  ck('the name, top right', (await signed.textContent('#usermenu .uname')) === 'ada');
  await signed.waitForFunction(() => /\/ \d/.test(document.getElementById('kLearned').textContent));
  ck('the owner’s progress is not hers: nothing learned', /^0 \//.test(await signed.textContent('#kLearned')), await signed.textContent('#kLearned'));

  await visit('/kanji');
  await signed.waitForSelector('.cards3');
  await signed.getByRole('button', { name: /^Learn \d+ items?$/ }).click();
  await signed.waitForSelector('.lband');
  for (let i = 0; i < 15; i++) {
    await signed.keyboard.press('Enter');
    await signed.waitForTimeout(30);
  }
  await signed.waitForSelector('.mode-lesson');
  const signedCard = async () => {
    const chars = await signed.textContent('.s-chars');
    const isKanji = await signed.$eval('.s-card', (el) => el.classList.contains('t-kanji'));
    const part = await signed.$eval('.s-q', (el) => (el.classList.contains('reading') ? 'reading' : 'meaning'));
    return { part, it: (byChars[chars] || []).find((x) => x.type === (isKanji ? 'kanji' : 'vocab')) };
  };
  for (let n = 0; (await signed.$('.session')) !== null && n < 30; n++) {
    const c = await signedCard();
    await signed.click('.s-input');
    await signed.keyboard.type(c.part === 'meaning' ? c.it.meanings[0].replace(/\(.*?\)/g, '').trim() : wk.toRomaji(c.it.readings[0]), { delay: 5 });
    await signed.keyboard.press('Enter');
    await signed.waitForTimeout(80);
    await signed.keyboard.press('Enter');
    await signed.waitForTimeout(100);
  }
  await signed.waitForSelector('h1.page');
  ck('a lesson, saved with her token', /learned 5 item/.test(await signed.textContent('.lead')));
  const hers = site.sql('SELECT count(*) AS n FROM srs_progress WHERE user_id = ?', ada.sub)[0].n;
  ck('her 5 items are hers, in the database', Number(hers) === 5, `${hers}`);

  await visit('/kanji');
  await signed.waitForSelector('.cards3');
  const [download] = await Promise.all([signed.waitForEvent('download'), signed.click('text=Download a copy')]);
  const saved = JSON.parse(fs.readFileSync(await download.path(), 'utf8'));
  ck('the progress download: fetched with the token, saved under its name',
    /^kanji-progress-\d{4}-\d{2}-\d{2}\.json$/.test(download.suggestedFilename()) && Object.keys(saved.items).length === 5, download.suggestedFilename());

  await visit('/exam');
  await signed.waitForSelector('#bookChips .chip');
  await signed.click('[data-size="40"]');
  await signed.click('#startBtn');
  await signed.waitForSelector('#test:not([hidden])');
  signed.on('dialog', (d) => d.accept());
  await signed.click('#quitBtn');
  await signed.waitForSelector('#result:not([hidden])', { timeout: 15000 });
  const [report] = await Promise.all([context.waitForEvent('page'), signed.click('#reportLink')]);
  await report.waitForFunction(() => document.body && /By skill/.test(document.body.innerText), null, { timeout: 10000 });
  ck('the report: fetched with the token, opened from memory', report.url().startsWith('blob:'), report.url());
  ck('and it may not run a script', (await report.$('meta[http-equiv="Content-Security-Policy"]')) !== null);
  await report.close();

  // A report holds whatever a backup brought in. The policy must come before
  // anything in it: one that followed the report's own <head> would come after
  // a script put before it, and one after a leading character HTML reads as
  // text (not a space) would land in the body, where it counts for nothing.
  const attempt = site.sql('SELECT id FROM exam_attempts WHERE user_id = ? ORDER BY finished_at DESC LIMIT 1', ada.sub)[0].id;
  const evil = [
    ['a script before its <head>', '', '<script>window.pwned = 1</script><!doctype html><html><head><title>t</title></head><body><p>By skill</p><script>window.pwned = 2</script></body></html>'],
    ['a no-break space before its doctype', 'chr(160) || ', '<!doctype html><script>window.pwned = 3</script><p>By skill</p>'],
  ];
  for (const [what, prefix, html] of evil) {
    site.sql(`UPDATE exam_attempts SET report = ${prefix}? WHERE user_id = ? AND id = ?`, html, ada.sub, attempt);
    const [tab] = await Promise.all([context.waitForEvent('page'), signed.click('#reportLink')]);
    await tab.waitForFunction(() => document.body && /By skill/.test(document.body.innerText), null, { timeout: 10000 });
    const seen = await tab.evaluate(() => ({ pwned: window.pwned, first: document.head.firstElementChild ? document.head.firstElementChild.outerHTML : null }));
    ck(`a report with ${what}: no script of it runs`, seen.pwned === undefined && /Content-Security-Policy/.test(seen.first || ''), JSON.stringify(seen));
    await tab.close();
  }

  // The token went with every call to this site's API, and nowhere else.
  const requests = await Promise.all(sent);
  const api = requests.filter((r) => r.url.startsWith(`${site.base}/api/`) && !r.url.startsWith(`${site.base}/api/auth/config`));
  const elsewhere = requests.filter((r) => !r.url.startsWith(`${site.base}/api/`) && !r.url.startsWith(`${site.base}/report/`));
  ck('her token went with every call to the API', api.length > 5 && api.every((r) => r.bearer), `${api.filter((r) => !r.bearer).map((r) => r.url).join(' ')}`);
  ck('and nowhere else: not to the IAM, not with the app’s own files',
    elsewhere.length > 0 && !elsewhere.some((r) => r.bearer) && !asked.some((a) => a.endsWith('+bearer')),
    elsewhere.filter((r) => r.bearer).map((r) => r.url).join(' '));

  await signed.click('#usermenu summary');
  ck('the menu: her IAM account page', (await signed.getAttribute('.umenu a', 'href')) === 'https://iam.test/account');
  await signed.screenshot({ path: path.join(SHOTS, 'account-menu.png') });
  await signed.click('.umenu button');
  await signed.waitForSelector('#signin-button', { timeout: 10000 });
  ck('Sign out: through the IAM, and back to the Sign in page', asked.includes('GET /api/oidc/logout') && new URL(signed.url()).pathname === '/');
  ck('and the tokens are gone from the browser', (await signed.evaluate(() => localStorage.getItem('anotoki-auth:japanese-academy'))) === null);
  ck('no browser errors, signed in', signedErrors.length === 0, signedErrors.join(' | '));

  // Signed out, the page loaded afresh: somebody signing in, in another tab,
  // starts the app here as him. Once it has shown his data, somebody else
  // signing in there loads it again, as her: nothing of his may stay on the
  // screen, or be sent as hers.
  const tab = await context.newPage();
  await tab.goto(site.base + '/favicon.svg');
  await tab.evaluate(({ key, value }) => localStorage.setItem(key, value), iamSession(4203, { name: 'bob' }));
  await signed.waitForSelector('#usermenu', { timeout: 10000 });
  await signed.waitForFunction(() => /\/ \d/.test(document.getElementById('kLearned')?.textContent || ''));
  ck('signed in, in another tab: the app starts here too, as him', (await signed.textContent('#usermenu .uname')) === 'bob');
  await signed.evaluate(() => {
    window.stayed = true;
  });
  await tab.evaluate(({ key, value }) => localStorage.setItem(key, value), iamSession(4204, { name: 'cleo' }));
  await signed.waitForFunction(() => document.querySelector('#usermenu .uname')?.textContent === 'cleo', null, { timeout: 10000 });
  ck('somebody else signs in there: this page loads again, as her', (await signed.evaluate(() => window.stayed)) === undefined);
  await tab.close();
  ck('no browser errors after it', signedErrors.length === 0, signedErrors.join(' | '));

  await browser.close();
  await site.close();
  await app.close();
  console.log(`\n${fails() ? fails() + ' FAILURE(S)' : 'BROWSER SUITE PASSED'}  (screenshots: ${SHOTS})`);
  process.exit(fails() ? 1 : 0);
})().catch(async (e) => {
  console.error(e);
  await closeAll();
  process.exit(1);
});
