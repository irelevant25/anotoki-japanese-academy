/**
 * The setup page (/setup.php) in a real browser, on a built site served the
 * way a host serves it: the upload of backend/tools/build-dist.php, with the
 * real app, in a temp folder (backend/tests/tools/front-controller.php does
 * what its .htaccess does), and an empty throwaway database owned by a
 * database user of its own, as a hosting panel makes them.
 *
 *   not set up     the app says so, why, and links to the setup page
 *   this computer  (http://127.0.0.1:…) no token; sign-in off offered, the IAM's
 *                  fields hidden with it; the browser's time zone filled in;
 *                  "Test connection" tries the database and a stand-in IAM
 *                  without sending the form; Set up → the app, without sign-in;
 *                  opened again, what is set, never the password
 *   a website      (http://academy.example.test:…, a name of another host that
 *                  the browser is told is this computer) the token from
 *                  backend/config/setup-token.local.php; sign-in through the
 *                  IAM only; Set up → the lock, the setup page gone, the app's
 *                  Sign in page
 *
 * Screenshots of the not-set-up page and both setup forms in light, dark and
 * phone layouts, checked for overflow.   npm run test:setup
 */
const fs = require('fs');
const os = require('os');
const path = require('path');
const crypto = require('crypto');
const { spawn } = require('child_process');
const { BACKEND, BUILD, php, findPhp, freePort } = require('./helpers');
const { launch, newContext, watch, reporter, SHOTS } = require('./browser');

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
    if (out !== undefined) {
      fs.closeSync(out);
      fs.rmSync(log, { force: true });
    }
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

  // The upload, with the real app; the database and its user; a stand-in IAM.
  php([path.join(BACKEND, 'tools', 'build-dist.php'), '--no-audio', `--frontend=${BUILD}`, `--out=${DIR.replace(/\\/g, '/')}`]);
  const db = JSON.parse(php([TESTDB, 'site', NAME]));
  fs.mkdirSync(KEYS, { recursive: true });
  php([path.join(BACKEND, 'tests', 'tools', 'iam.php'), 'keys', KEYS]);
  // (not through serve(): the stand-in must know its own address before it starts)
  const iamPort = await freePort();
  const issuer = `http://127.0.0.1:${iamPort}`;
  const iamProc = spawn(findPhp(), ['-d', 'opcache.enable=0', '-S', `127.0.0.1:${iamPort}`, path.join(BACKEND, 'tests', 'tools', 'stand-in-iam.php')], {
    cwd: BACKEND,
    env: { ...process.env, STAND_IN_ISSUER: issuer, STAND_IN_JWKS: path.join(KEYS, 'jwks.json') },
    stdio: 'ignore',
  });
  servers.push({ proc: iamProc });
  for (let i = 0; !(await fetch(`${issuer}/.well-known/openid-configuration`).then(() => true, () => false)); i++) {
    if (i > 100) throw new Error('the stand-in IAM did not start');
    await new Promise((r) => setTimeout(r, 50));
  }
  const port = await serve(['-t', path.join(DIR, 'public'), path.join(BACKEND, 'tests', 'tools', 'front-controller.php')], DIR);
  const local = `http://127.0.0.1:${port}`;
  const website = `http://${WEBSITE}:${port}`;

  // The website's name leads to this computer, as a host's DNS would lead to the host.
  const browser = await launch({ args: [`--host-resolver-rules=MAP ${WEBSITE} 127.0.0.1`] });
  const problems = [];

  /* ------------------------------------------------ the looks, not set up */
  console.log('not set up: the pages in light, dark and phone');
  for (const [variant, opts] of VARIANTS) {
    const context = await newContext(browser, opts);
    const page = await context.newPage();
    const errors = watch(page, { ignore: [/\/api\/auth\/config$/] }); // 503: not set up, as it should
    for (const [name, url, ready] of [
      ['setup-not-set-up', `${local}/`, '#not-set-up'],
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
  const context = await newContext(browser, { viewport: { width: 1100, height: 900 }, timezoneId: 'Asia/Tokyo' });
  const page = await context.newPage();
  const errors = watch(page, { ignore: [/\/api\/auth\/config$/] });
  await page.goto(`${local}/kanji`);
  await page.waitForSelector('#not-set-up');
  const reason = await page.textContent('#not-set-up');
  ck('not set up: the app says so, and to this computer why', /not set up yet/.test(reason) && /backend\/config\/database\.local\.php is missing/.test(reason), reason.replace(/\s+/g, ' '));
  await page.click('text=Open the setup page');
  await page.waitForSelector('#setup');
  ck('its link opens the setup page', new URL(page.url()).pathname === '/setup.php');
  ck('no token on this computer', (await page.$('#token')) === null);
  ck('sign-in off is offered, and chosen', await page.isChecked('input[name=auth_mode][value=none]'));
  ck('the IAM’s fields hide while sign-in is off', !(await page.isVisible('#iam-fields')));
  ck('the time zone is the browser’s', (await page.inputValue('#timezone')) === 'Asia/Tokyo', await page.inputValue('#timezone'));
  ck('the development IAM is offered', (await page.inputValue('#issuer')) === 'http://localhost:4300');

  const result = async (which) => {
    await page.click(`[data-test=${which}]`);
    await page.waitForFunction((id) => /\b(good|bad)\b/.test(document.getElementById(id).className), `${which}-result`);
    return { good: (await page.getAttribute(`#${which}-result`, 'class')).includes('good'), text: await page.textContent(`#${which}-result`) };
  };
  await page.fill('#db_host', String(db.host));
  await page.fill('#db_port', String(db.port));
  await page.fill('#db_name', NAME);
  await page.fill('#db_user', db.user);
  await page.fill('#db_password', 'not-the-password');
  let r = await result('db');
  ck('Test connection: a wrong password, said plainly', !r.good && /^Cannot connect with these settings: \S/.test(r.text) && !/SQLSTATE/.test(r.text), r.text);
  await page.fill('#db_password', db.password);
  r = await result('db');
  ck('Test connection: the database, empty', r.good && r.text === `Connected to the database ${NAME}. It is empty: setting up makes its tables.`, r.text);
  ck('without sending the form', new URL(page.url()).pathname === '/setup.php' && (await page.inputValue('#db_password')) === db.password);

  await page.check('input[name=auth_mode][value=iam]');
  ck('sign-in through the IAM shows its fields', await page.isVisible('#iam-fields'));
  await page.fill('#issuer', `${issuer}/elsewhere`);
  r = await result('iam');
  ck('Test connection: an address with no IAM', !r.good && /^No answer from /.test(r.text), r.text);
  await page.fill('#issuer', issuer);
  r = await result('iam');
  ck('Test connection: the IAM and its keys', r.good && r.text === `Reached the IAM at ${issuer}: it answers, and its signing keys are there (1).`, r.text);
  await page.screenshot({ path: path.join(SHOTS, 'setup-tested.png'), fullPage: true });
  await page.check('input[name=auth_mode][value=none]');
  ck('and hides them again', !(await page.isVisible('#iam-fields')));

  await Promise.all([page.waitForNavigation(), page.click('button[type=submit]')]);
  await page.waitForSelector('h1');
  const done = await page.textContent('main');
  ck('Set up: done', (await page.textContent('h1')) === 'Set up', done.replace(/\s+/g, ' ').slice(0, 300));
  ck('the tables made', /Applied the migrations: 001_init\.sql, 002_users\.sql, 003_content_stamp\.sql, 004_languages_and_translations\.sql\./.test(done));
  ck('the study content built', /Built the study content: [\d,]+ kanji items and [\d,]+ exam questions/.test(done));
  ck('no sign-in, this computer only; the page stays', /no sign-in \(this computer only\)/.test(done) && /This page stays/.test(done));
  ck('the setup page is still there', fs.existsSync(path.join(DIR, 'backend', 'setup.php')));
  await page.screenshot({ path: path.join(SHOTS, 'setup-done.png'), fullPage: true });

  await page.click('text=Open Japanese Academy');
  await page.waitForSelector('.homecards');
  ck('then the app, without sign-in', (await page.$('#usermenu')) === null && (await page.$('#signin')) === null);
  await page.click('.topnav a[href="/kanji"]');
  await page.waitForSelector('.cards3');
  ck('with its content: lessons to learn', Number((await page.textContent('.c-lessons .bc-num')).trim()) > 0);

  await page.goto(`${local}/setup.php`);
  await page.waitForSelector('#setup');
  const again = await page.content();
  ck('opened again: what is set, never the password',
    /This copy is set up already/.test(again) && (await page.inputValue('#db_name')) === NAME && !again.includes(db.password) && (await page.getAttribute('#db_password', 'placeholder')) === 'unchanged');
  ck('and its time zone as set', (await page.inputValue('#timezone')) === 'Asia/Tokyo');
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
  ck('and sign-in through the IAM only', (await site.$('input[name=auth_mode][type=radio]')) === null && (await site.isVisible('#iam-fields')));
  // this copy is set up (this computer's way, above): none of it shows before the token
  const unproven = { name: await site.inputValue('#db_name'), user: await site.inputValue('#db_user') };
  ck('nothing of what is set before the token', unproven.name !== NAME && unproven.user === '' && !(await site.content()).includes(NAME), JSON.stringify(unproven));
  const tokenResult = async () => {
    await site.waitForFunction(() => /\b(good|bad)\b/.test(document.getElementById('token-result').className));
    return { good: (await site.getAttribute('#token-result', 'class')).includes('good'), text: await site.textContent('#token-result') };
  };
  await site.fill('#token', 'not-the-token');
  await site.press('#token', 'Enter'); // Enter checks the token: it sends no form
  r = await tokenResult();
  ck('Enter in the token checks it, and sends no form', !r.good && /That is not the token/.test(r.text)
    && new URL(site.url()).pathname === '/setup.php' && (await site.inputValue('#token')) === 'not-the-token', r.text);
  await site.fill('#issuer', issuer);
  r = await (async () => {
    await site.click('[data-test=iam]');
    await site.waitForFunction(() => /\b(good|bad)\b/.test(document.getElementById('iam-result').className));
    return { good: (await site.getAttribute('#iam-result', 'class')).includes('good'), text: await site.textContent('#iam-result') };
  })();
  ck('its buttons want the token too', !r.good && /That is not the token/.test(r.text), r.text);
  // pasted: the page checks it at once (a paste event, as the clipboard gives one)
  await site.$eval('#token', (el, value) => {
    el.value = value;
    el.dispatchEvent(new Event('paste', { bubbles: true }));
  }, token);
  const pasted = await site
    .waitForFunction(() => /That is the token/.test(document.getElementById('token-result').textContent), null, { timeout: 5000 })
    .then(() => true, () => false);
  ck('a pasted token is checked at once, without leaving the field', pasted);
  ck('the token proven: what is set is filled in, the password kept back',
    (await site.inputValue('#db_name')) === NAME && (await site.inputValue('#db_user')) === db.user && (await site.inputValue('#db_password')) === ''
      && (await site.getAttribute('#db_password', 'placeholder')) === 'unchanged' && !(await site.content()).includes(db.password));
  ck('and what was typed stays as typed', (await site.inputValue('#issuer')) === issuer);
  await site.click('[data-test=iam]');
  await site.waitForFunction(() => /Reached the IAM/.test(document.getElementById('iam-result').textContent));
  await Promise.all([site.waitForNavigation(), site.click('button[type=submit]')]);
  await site.waitForSelector('h1');
  const siteDone = await site.textContent('main');
  ck('Set up: sign-in through the IAM', (await site.textContent('h1')) === 'Set up' && siteDone.includes(`sign-in through ${issuer},`),
    siteDone.replace(/\s+/g, ' ').slice(0, 300));
  ck('it reached the IAM’s keys', /Reached the IAM: its keys are there/.test(siteDone));
  ck('the lock written, the setup page and its token gone',
    fs.existsSync(path.join(DIR, 'backend', 'storage', 'installed.lock')) && !fs.existsSync(path.join(DIR, 'backend', 'setup.php')) && !fs.existsSync(tokenFile)
      && /Removed backend\/setup\.php and backend\/config\/setup-token\.local\.php/.test(siteDone));
  ck('/setup.php is no more', (await fetch(`${local}/setup.php`)).status === 404);
  await site.click('text=Open Japanese Academy');
  await site.waitForSelector('#signin-button');
  ck('the app: its Sign in page', await site.isVisible('main.signin'));
  await site.screenshot({ path: path.join(SHOTS, 'setup-website-signin.png') });
  ck('no browser errors on the website', siteErrors.length === 0, siteErrors.join(' | '));
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
