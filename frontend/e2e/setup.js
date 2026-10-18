/**
 * The setup page (/setup.php) in a real browser, on a built site served the
 * way a host serves it: the upload of backend/tools/build-dist.php (a
 * migration still being written allowed in, for this test alone), with the
 * real app, in a temp folder (backend/tests/tools/front-controller.php does
 * what its .htaccess does), an empty throwaway database owned by a database
 * user of its own, as a hosting panel makes them, and the anotoki library's
 * stand-in IAM (backend/vendor/anotoki/lib/backend/testing/stand-in-iam.php)
 * that signs people in.
 *
 *   not set up     the app says so (the anotoki library's page), and - never
 *                  installed - links to the setup page
 *   this computer  (http://127.0.0.1:…) no token; the database and the IAM and
 *                  nothing else, with the family's defaults; "Test connection"
 *                  in the family's words for the database and the IAM,
 *                  without sending the form; Save → the tables, the content,
 *                  the page stays; the app then goes to the IAM and back,
 *                  signed in; opened again, what is saved, never the password
 *   a website      (http://academy.example.test:…, a name of another host that
 *                  the browser is told is this computer) the token from
 *                  backend/config/setup-token.local.php; nothing of what is
 *                  saved, before the token or after it; Save → the lock, the
 *                  setup page gone, the app signing in through the IAM; its
 *                  settings gone after that, the app says it is not
 *                  available - never the setup page again
 *
 * Screenshots of the not-set-up page and both setup forms in light, dark and
 * phone layouts, checked for overflow.   node frontend/scripts/ensure-build.mjs && node frontend/e2e/setup.js
 */
const fs = require('fs');
const os = require('os');
const path = require('path');
const crypto = require('crypto');
const { spawn } = require('child_process');
const { BACKEND, BUILD, php, findPhp, freePort, startStandIn, drafts } = require('./helpers');
const { launch, newContext, watch, reporter, BAR, barLink, SHOTS } = require('./browser');

const TESTDB = path.join(BACKEND, 'tests', 'tools', 'testdb.php');
const WEBSITE = 'academy.example.test';
const NAME = `academy_test_${process.pid}_${crypto.randomBytes(3).toString('hex')}`;
const DIR = path.join(os.tmpdir(), `academy-test-site-${process.pid}-${crypto.randomBytes(3).toString('hex')}`);
const KEYS = `${DIR}-iam`;

const VARIANTS = [
  ['light', { viewport: { width: 1100, height: 900 }, colorScheme: 'light' }],
  ['dark', { viewport: { width: 1100, height: 900 }, colorScheme: 'dark' }],
  ['phone', { viewport: { width: 390, height: 844 }, colorScheme: 'light', deviceScaleFactor: 2, isMobile: true, hasTouch: true }],
];

/** PHP's built-in server on a free port of this computer; stopped at the end. */
const servers = [];
let iam = null;
async function serve(args, cwd, env = {}) {
  const port = await freePort();
  const clean = { ...process.env, ...env };
  delete clean.ACADEMY_CONFIG_DIR;
  delete clean.ACADEMY_JWKS_FILE;
  const log = path.join(os.tmpdir(), `${path.basename(DIR)}-server-${port}.log`);
  const out = fs.openSync(log, 'a');
  const proc = spawn(findPhp(), ['-d', 'display_errors=stderr', '-d', 'opcache.enable=0', '-S', `127.0.0.1:${port}`, ...args], { cwd, env: clean, stdio: ['ignore', out, out] });
  servers.push({ proc, out, log });
  for (let i = 0; ; i++) {
    try {
      await fetch(`http://127.0.0.1:${port}/favicon.svg`);
      return port;
    } catch {
      if (i > 100) throw new Error(`a server did not start: ${fs.readFileSync(log, 'utf8')}`);
      await new Promise((r) => setTimeout(r, 50));
    }
  }
}

async function cleanup() {
  for (const { proc, out, log } of servers.splice(0)) {
    proc.kill();
    await new Promise((r) => (proc.exitCode !== null ? r() : proc.once('exit', r)));
    fs.closeSync(out);
    fs.rmSync(log, { force: true });
  }
  if (iam) {
    await iam.close();
    iam = null;
  }
  if (process.env.ACADEMY_KEEP_TEMP) return;
  try {
    php([TESTDB, 'drop', NAME]);
  } catch (e) {
    console.error(`could not drop ${NAME}: ${e.message}`);
  }
  for (const p of [DIR, KEYS, path.join(os.tmpdir(), `academy-backups-${NAME}`)]) {
    try {
      fs.rmSync(p, { recursive: true, force: true });
    } catch {
      // a file still held open by Windows: harmless leftovers in %TEMP%
    }
  }
}

(async () => {
  const { ck, fails } = reporter();
  fs.mkdirSync(SHOTS, { recursive: true });

  // The upload, with the real app (a draft migration let in by name, as the
  // tests' own databases alone may apply it); the database and its user; the
  // stand-in IAM, signing with keys of this run.
  const waiting = drafts();
  php([path.join(BACKEND, 'tools', 'build-dist.php'), '--no-audio', `--frontend=${BUILD}`, `--out=${DIR.replace(/\\/g, '/')}`, ...(waiting ? [`--allow-draft=${waiting}`] : [])]);
  const db = JSON.parse(php([TESTDB, 'site', NAME]));
  fs.mkdirSync(KEYS, { recursive: true });
  php([path.join(BACKEND, 'tests', 'tools', 'iam.php'), 'keys', KEYS]);
  iam = await startStandIn(KEYS);
  const issuer = iam.base;
  await iam.state({ user: { id: 1, username: 'owner', roles: ['MEMBER', 'ADMIN'] } });
  const port = await serve(['-t', path.join(DIR, 'public'), path.join(BACKEND, 'tests', 'tools', 'front-controller.php')], DIR, { ACADEMY_MIGRATION_DRAFTS: waiting });
  const local = `http://127.0.0.1:${port}`;
  const website = `http://${WEBSITE}:${port}`;
  // What the setup page applies, as it names it, in the order the sets run (backend/src/db.php): the anotoki
  // library's admin tools' tables (anotoki_admin), this app's own migrations, the library's words
  // (anotoki_translations) and its people (anotoki_people) - the library's from the upload's vendor/, each with its set.
  const sqlIn = (dir) =>
    fs
      .readdirSync(dir)
      .filter((f) => f.endsWith('.sql'))
      .sort();
  const library = (folder, set) => sqlIn(path.join(DIR, 'backend', 'vendor', 'anotoki', 'lib', 'backend', 'migrations', folder)).map((f) => `${set}/${f}`);
  const migrations = [
    ...library('admin', 'anotoki_admin'),
    ...sqlIn(path.join(DIR, 'backend', 'migrations')),
    ...library('translations', 'anotoki_translations'),
    ...library('people', 'anotoki_people'),
  ];

  // The website's name leads to this computer, as a host's DNS would lead to the
  // host; and the browser counts it as secure, as a website's https is (the
  // sign-in's PKCE needs crypto.subtle, which a plain http page of another
  // name than this computer's does not get).
  const browser = await launch({ args: [`--host-resolver-rules=MAP ${WEBSITE} 127.0.0.1`, `--unsafely-treat-insecure-origin-as-secure=${website}`] });
  const problems = [];

  /* ------------------------------------------------ the looks, not set up */
  console.log('not set up: the pages in light, dark and phone');
  for (const [variant, opts] of VARIANTS) {
    const context = await newContext(browser, opts);
    const page = await context.newPage();
    const errors = watch(page, { ignore: [/\/api\/auth\/config$/] }); // 503: not set up, as it should
    for (const [name, url, ready] of [
      ['setup-not-set-up', `${local}/`, 'anotoki-site-status h1'],
      ['setup-page', `${local}/setup.php`, '#setup'],
      ['setup-page-website', `${website}/setup.php`, '#token'],
    ]) {
      await page.goto(url);
      await page.waitForSelector(ready);
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
      if (overflow > 0) problems.push(`${variant}/${name}: ${overflow}px horizontal overflow`);
      await page.screenshot({ path: path.join(SHOTS, `${name}-${variant}.png`), fullPage: true });
    }
    problems.push(...errors.map((e) => `${variant}: ${e}`));
    await context.close();
  }
  // the website's first view wrote its token; it stays until that setup is done
  const tokenFile = path.join(DIR, 'backend', 'config', 'setup-token.local.php');
  const token = (/'token' => '([0-9a-f]+)'/.exec(fs.readFileSync(tokenFile, 'utf8')) || [])[1];
  ck('a website’s first view writes a token for its owner', !!token);

  /* ---------------------------------------------------- this computer */
  console.log('this computer');
  const context = await newContext(browser, { viewport: { width: 1100, height: 900 } });
  const page = await context.newPage();
  const errors = watch(page, { ignore: [/\/api\/auth\/config$/] });
  await page.goto(`${local}/kanji`);
  await page.waitForSelector('anotoki-site-status h1');
  const notSetUp = await page.$eval('anotoki-site-status', (el) => ({
    title: el.querySelector('h1').textContent.trim(),
    actions: [...el.querySelectorAll('a, button')].map((a) => `${a.textContent.trim()}${a.getAttribute('href') ? ' ' + a.getAttribute('href') : ''}`),
  }));
  ck(
    'not set up, and never installed (this computer’s never is): the library’s page says so, with the way to the setup page',
    notSetUp.title === 'This site is not set up yet' && notSetUp.actions.join(',') === 'Open the setup page /setup.php,Try again',
    JSON.stringify(notSetUp),
  );
  await page.click('text=Open the setup page');
  await page.waitForSelector('#setup');
  ck('its link opens the setup page', new URL(page.url()).pathname === '/setup.php');
  ck('no token on this computer', (await page.$('#token')) === null);
  const fields = await page.$$eval('#setup input', (els) => els.map((e) => e.name));
  ck('the database and the IAM, and nothing else', fields.join(',') === 'nonce,db_host,db_port,db_name,db_user,db_password,issuer,client_id', fields.join(','));
  const defaults = {};
  for (const id of ['db_host', 'db_port', 'db_name', 'db_user', 'issuer', 'client_id']) defaults[id] = await page.inputValue(`#${id}`);
  ck(
    'the family’s defaults: anotoki_japanese on 5432, the development IAM',
    JSON.stringify(defaults) ===
      JSON.stringify({ db_host: 'localhost', db_port: '5432', db_name: 'anotoki_japanese', db_user: 'postgres', issuer: 'http://localhost:4300', client_id: 'japanese-academy' }),
    JSON.stringify(defaults),
  );
  ck('nothing is saved yet: no "unchanged" password', (await page.getAttribute('#db_password', 'placeholder')) === null);

  const result = async (which, on = page) => {
    await on.click(`[data-test=${which}]`);
    await on.waitForFunction((id) => /\b(good|bad)\b/.test(document.getElementById(id).className), `${which}-result`);
    return { good: (await on.getAttribute(`#${which}-result`, 'class')).includes('good'), text: await on.textContent(`#${which}-result`) };
  };
  await page.fill('#db_host', String(db.host));
  await page.fill('#db_port', String(db.port));
  await page.fill('#db_name', NAME);
  await page.fill('#db_user', db.user);
  await page.fill('#db_password', 'not-the-password');
  let r = await result('db');
  ck('Test connection: a wrong password, said plainly', !r.good && /^Cannot connect: password authentication failed for user/.test(r.text) && !/SQLSTATE/.test(r.text), r.text);
  await page.fill('#db_name', `${NAME}_nowhere`);
  await page.fill('#db_password', db.password);
  r = await result('db');
  ck(
    'Test connection: no such database, and this user may not make one',
    !r.good && r.text === `Connected to the server, but there is no database "${NAME}_nowhere" and this user may not create one. Make it in the hosting panel first.`,
    r.text,
  );
  await page.fill('#db_name', NAME);
  r = await result('db');
  ck('Test connection: the database, empty', r.good && r.text === `Connected to the database "${NAME}": it is empty - Save makes the tables.`, r.text);
  ck('without sending the form', new URL(page.url()).pathname === '/setup.php' && (await page.inputValue('#db_password')) === db.password);

  await page.fill('#issuer', `${issuer}/elsewhere`);
  r = await result('iam');
  ck('Test connection: an address with no IAM', !r.good && /^No answer from /.test(r.text), r.text);
  await page.fill('#issuer', 'http://iam.example.com');
  r = await result('iam');
  ck('Test connection: an address no IAM may have', !r.good && /must be an https:\/\/ address/.test(r.text), r.text);
  await page.fill('#issuer', issuer);
  r = await result('iam');
  ck('Test connection: the IAM and its keys', r.good && r.text === `Reached the IAM at ${issuer}: it answers, and its signing keys are there (1).`, r.text);
  await page.screenshot({ path: path.join(SHOTS, 'setup-tested.png'), fullPage: true });

  await Promise.all([page.waitForNavigation(), page.click('button[type=submit]')]);
  await page.waitForSelector('h1');
  const done = await page.textContent('main');
  ck('Save: saved, and the page stays', (await page.textContent('h1')) === 'Saved' && /This page stays/.test(done), done.replace(/\s+/g, ' ').slice(0, 400));
  ck('the settings: the database and the IAM', done.includes(`Saved the settings in backend/config/: the database, and sign-in through the IAM at ${issuer}.`));
  ck('the tables made: every migration', done.includes(`Applied the migrations: ${migrations.join(', ')}.`), migrations.join(', '));
  ck('the study content built', /Built the study content: [\d,]+ kanji items and [\d,]+ exam questions/.test(done));
  ck('people sign in with their anotoki account, each with their own data', done.includes(`Open the app and sign in with your anotoki account at ${issuer}.`));
  ck('the setup page is still there', fs.existsSync(path.join(DIR, 'backend', 'setup.php')));
  ck(
    'the settings written: database and auth only, auth naming the IAM alone',
    fs.existsSync(path.join(DIR, 'backend', 'config', 'database.local.php')) &&
      !fs.existsSync(path.join(DIR, 'backend', 'config', 'app.local.php')) &&
      (() => {
        const auth = fs.readFileSync(path.join(DIR, 'backend', 'config', 'auth.local.php'), 'utf8');
        return auth.includes(issuer) && auth.includes('japanese-academy') && !/mode|local_user_id|jwks_file|time_?zone/i.test(auth);
      })(),
  );
  await page.screenshot({ path: path.join(SHOTS, 'setup-done.png'), fullPage: true });

  await page.click('text=Open Japanese Academy');
  await page.waitForSelector(BAR.userButton, { timeout: 15000 });
  await page.waitForSelector('.homecards');
  ck('then the app: to the IAM and back, signed in', (await page.textContent(BAR.userName)).trim() === 'owner' && (await iam.state()).log.includes('POST /api/oidc/token'));
  await page.click(barLink('/kanji'));
  await page.waitForSelector('.cards3');
  ck('with its content: lessons to learn', Number((await page.textContent('.c-lessons .bc-num')).trim()) > 0);

  await page.goto(`${local}/setup.php`);
  await page.waitForSelector('#setup');
  const again = await page.content();
  ck(
    'opened again on this computer: what is saved, never the password',
    /This copy is set up already/.test(again) &&
      (await page.inputValue('#db_name')) === NAME &&
      (await page.inputValue('#issuer')) === issuer &&
      !again.includes(db.password) &&
      (await page.getAttribute('#db_password', 'placeholder')) === 'unchanged',
  );
  r = await result('db');
  ck('and Test connection: up to date', r.good && r.text === `Connected to the database "${NAME}": it is up to date.`, r.text);
  ck('no browser errors on this computer', errors.length === 0, errors.join(' | '));
  await context.close();

  /* --------------------------------------------------------- a website */
  console.log('a website');
  const siteContext = await newContext(browser, { viewport: { width: 1100, height: 900 } });
  const site = await siteContext.newPage();
  const siteErrors = watch(site);
  await site.goto(`${website}/setup.php`);
  await site.waitForSelector('#token');
  ck('a website: the token first', /setup-token\.local\.php/.test(await site.textContent('main')));
  // (the issuer: what was typed stays as typed, so it counts only before anything was)
  const nothingSaved = async (typed = false) => {
    const shown = { name: await site.inputValue('#db_name'), user: await site.inputValue('#db_user'), issuer: await site.inputValue('#issuer') };
    const html = await site.content();
    return shown.name !== NAME && shown.user === '' && (typed || shown.issuer !== issuer) && !html.includes(NAME) && !html.includes(db.user) && !html.includes('unchanged') && !html.includes('(saved');
  };
  // this copy is set up (this computer's way, above): none of it shows to whoever opens the page
  ck('nothing of what is saved before the token', await nothingSaved());
  const tokenResult = async () => {
    await site.waitForFunction(() => /\b(good|bad)\b/.test(document.getElementById('token-result').className));
    return { good: (await site.getAttribute('#token-result', 'class')).includes('good'), text: await site.textContent('#token-result') };
  };
  await site.fill('#token', 'not-the-token');
  await site.press('#token', 'Enter'); // Enter checks the token: it sends no form
  r = await tokenResult();
  ck(
    'Enter in the token checks it, and sends no form',
    !r.good && /That is not the token/.test(r.text) && new URL(site.url()).pathname === '/setup.php' && (await site.inputValue('#token')) === 'not-the-token',
    r.text,
  );
  await site.fill('#issuer', issuer);
  r = await result('iam', site);
  ck('its buttons want the token too', !r.good && /That is not the token/.test(r.text), r.text);
  // pasted: the page checks it at once (a paste event, as the clipboard gives one)
  await site.$eval(
    '#token',
    (el, value) => {
      el.value = value;
      el.dispatchEvent(new Event('paste', { bubbles: true }));
    },
    token,
  );
  const pasted = await site
    .waitForFunction(() => document.getElementById('token-result').textContent === 'That is the token.', null, { timeout: 5000 })
    .then(
      () => true,
      () => false,
    );
  ck('a pasted token is checked at once: "That is the token.", and no more', pasted);
  ck('and still nothing of what is saved after it', await nothingSaved(true));
  await site.fill('#db_host', String(db.host));
  await site.fill('#db_port', String(db.port));
  await site.fill('#db_name', NAME);
  await site.fill('#db_user', db.user);
  await site.fill('#db_password', db.password);
  r = await result('db', site);
  ck('Test connection on a website: the database, up to date', r.good && r.text === `Connected to the database "${NAME}": it is up to date.`, r.text);
  r = await result('iam', site);
  ck('Test connection on a website: the IAM', r.good && /^Reached the IAM at /.test(r.text), r.text);
  await Promise.all([site.waitForNavigation(), site.click('button[type=submit]')]);
  await site.waitForSelector('h1');
  const siteDone = await site.textContent('main');
  ck(
    'Save on a website: set up, through the IAM',
    (await site.textContent('h1')) === 'Set up' && siteDone.includes(`sign-in through the IAM at ${issuer}.`),
    siteDone.replace(/\s+/g, ' ').slice(0, 300),
  );
  ck('it reached the IAM’s keys', /Reached the IAM: its keys are there/.test(siteDone));
  ck(
    'the lock written, the setup page and its token gone',
    fs.existsSync(path.join(DIR, 'backend', 'storage', 'installed.lock')) &&
      !fs.existsSync(path.join(DIR, 'backend', 'setup.php')) &&
      !fs.existsSync(tokenFile) &&
      /Removed backend\/setup\.php and backend\/config\/setup-token\.local\.php/.test(siteDone),
  );
  ck('/setup.php is no more', (await fetch(`${local}/setup.php`)).status === 404);
  await iam.state({ user: { id: 7, username: 'reader', roles: ['MEMBER'] } });
  await site.click('text=Open Japanese Academy');
  await site.waitForSelector('.homecards, #signin-button, main', { timeout: 15000 });
  await site.waitForSelector(`${BAR.userButton}, #signin-button`, { timeout: 15000 }).catch(() => undefined);
  ck(
    'the app on the website: to the IAM and back, signed in',
    (await site.$('.homecards')) !== null && (await site.textContent(BAR.userName, { timeout: 2000 }).catch(() => '')).trim() === 'reader',
    `${site.url()} ${(await site.textContent('body')).replace(/\s+/g, ' ').slice(0, 200)} | IAM: ${(await iam.state()).log.slice(-6).join(', ')}`,
  );
  await site.screenshot({ path: path.join(SHOTS, 'setup-website-app.png') });
  ck('no browser errors on the website', siteErrors.length === 0, siteErrors.join(' | '));

  // Installed (the lock), and then its settings gone: the site is not available - and never offers the setup
  // page again, which is gone besides.
  const authFile = path.join(DIR, 'backend', 'config', 'auth.local.php');
  const authSaved = fs.readFileSync(authFile);
  fs.unlinkSync(authFile);
  try {
    const gone = await siteContext.newPage();
    await gone.goto(`${website}/`);
    await gone.waitForSelector('anotoki-site-status h1', { timeout: 15000 });
    const seen = await gone.$eval('anotoki-site-status', (el) => ({
      title: el.querySelector('h1').textContent.trim(),
      text: el.textContent.replace(/\s+/g, ' ').trim(),
      actions: [...el.querySelectorAll('a, button')].map((a) => a.textContent.trim()),
    }));
    ck(
      'installed, its settings gone: “not available right now”, asking again by itself - never the setup page',
      seen.title === 'The site is not available right now' && seen.actions.join(',') === 'Try again' && !/setup/i.test(seen.text),
      JSON.stringify(seen),
    );
    await gone.screenshot({ path: path.join(SHOTS, 'setup-website-not-available.png') });
  } finally {
    fs.writeFileSync(authFile, authSaved);
  }
  await siteContext.close();

  await browser.close();
  ck('no overflow, no errors in the three layouts', problems.length === 0, problems.join(' | '));
  await cleanup();
  console.log(`\n${fails() ? fails() + ' FAILURE(S)' : 'SETUP SUITE PASSED'}  (screenshots: ${SHOTS})`);
  process.exit(fails() ? 1 : 0);
})().catch(async (e) => {
  console.error(e);
  await cleanup().catch(() => undefined);
  process.exit(1);
});
