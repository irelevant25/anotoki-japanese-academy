/**
 * Browser helpers: finds an installed Chromium browser (Edge or Chrome) and
 * drives it with playwright-core — no browser download needed.
 * Override with BROWSER_PATH=<path to msedge.exe / chrome.exe>.
 */
const fs = require('fs');
const path = require('path');

const CANDIDATES = [
  process.env.BROWSER_PATH,
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
  'C:/Program Files/Microsoft/Edge/Application/msedge.exe',
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe',
  '/usr/bin/microsoft-edge',
  '/usr/bin/google-chrome',
  '/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge',
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
].filter(Boolean);

function findBrowser() {
  return CANDIDATES.find((p) => fs.existsSync(p)) || null;
}

/** The browser, headless; args: its command-line switches (e.g. --host-resolver-rules). */
async function launch({ args = [] } = {}) {
  const executablePath = findBrowser();
  if (!executablePath) {
    throw new Error(`No Edge/Chrome found. Set BROWSER_PATH. Looked in:\n  ${CANDIDATES.join('\n  ')}`);
  }
  const { chromium } = require('playwright-core');
  return chromium.launch({ executablePath, headless: true, args });
}

/**
 * A browser context, in English unless `opts.locale` says otherwise. The app
 * takes its language from the browser when nothing else names one (no choice
 * made, no ?lang=, nobody signed in), and a context's language is its locale -
 * left out, the computer's own: on a Slovak system every page would be Slovak
 * and the suites' English matchers would break. Every suite makes its
 * contexts here. A signed-in session says 'en' in its token as well.
 */
function newContext(browser, opts = {}) {
  return browser.newContext({ locale: 'en-GB', ...opts });
}

/**
 * Collects page errors, errors the app logged and failed requests, so a run
 * can assert "no errors". Angular catches an error of the app itself (in an
 * event handler, in drawing a screen) and logs it to the console instead of
 * letting it reach the page, so the console counts too - a warning as well:
 * a key with no string warns ("[i18n] no string for ...").
 */
function watch(page, { ignore = [] } = {}) {
  const errors = [];
  page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
  page.on('console', (m) => {
    // a failed request logs itself too: the responses below judge those
    if (m.type() === 'error' && !/^Failed to load resource/.test(m.text())) errors.push(`console: ${m.text()}`);
    if (m.type() === 'warning') errors.push(`console warning: ${m.text()}`);
  });
  page.on('response', (r) => {
    const url = r.url();
    if (r.status() >= 400 && !ignore.some((re) => re.test(url))) errors.push(`${r.status()} ${url}`);
  });
  return errors;
}

/** Tiny reporter for scripts that aren't node:test. */
function reporter() {
  let fails = 0;
  const ck = (name, cond, extra = '') => {
    console.log(`${cond ? '  ok  ' : '  FAIL'}  ${name}${extra ? '  ' + extra : ''}`);
    if (!cond) fails += 1;
  };
  return { ck, fails: () => fails };
}

/**
 * The anotoki IAM as a browser context sees it, answered by the test: its
 * sign-in sends the browser straight back with a code, its token endpoint
 * hands out the test IAM's tokens for `person` ({ sub, name, roles }), its
 * sign-out comes straight back. The test IAM's address (https://iam.test)
 * exists nowhere, so nothing leaves this computer, and a request nobody
 * answers here fails loudly. Returns what the IAM was asked, for checks
 * ('GET /api/oidc/userinfo', and ' +bearer' after one that came with a token).
 */
async function emulateIam(context, person) {
  const { IAM, iamToken } = require('./helpers');
  const asked = [];
  let nonce = null;
  await context.route(`${IAM.issuer}/**`, async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    asked.push(`${request.method()} ${url.pathname}${request.headers().authorization ? ' +bearer' : ''}`);
    const cors = { 'access-control-allow-origin': request.headers().origin || '*', 'cache-control': 'no-store' };
    const claims = { roles: person.roles || ['MEMBER'], name: person.name };
    switch (url.pathname) {
      case '/.well-known/openid-configuration':
        return route.fulfill({
          headers: cors,
          json: {
            issuer: IAM.issuer,
            authorization_endpoint: `${IAM.issuer}/api/oidc/authorize`,
            token_endpoint: `${IAM.issuer}/api/oidc/token`,
            end_session_endpoint: `${IAM.issuer}/api/oidc/logout`,
            revocation_endpoint: `${IAM.issuer}/api/oidc/revoke`,
            userinfo_endpoint: `${IAM.issuer}/api/oidc/userinfo`,
          },
        });
      case '/api/oidc/authorize': {
        nonce = url.searchParams.get('nonce');
        const back = new URL(url.searchParams.get('redirect_uri'));
        back.searchParams.set('code', 'test-code');
        back.searchParams.set('state', url.searchParams.get('state'));
        back.searchParams.set('iss', IAM.issuer);
        return route.fulfill({ status: 302, headers: { location: back.toString() } });
      }
      case '/api/oidc/token':
        return route.fulfill({
          headers: cors,
          json: {
            access_token: iamToken(person.sub, claims),
            token_type: 'Bearer',
            expires_in: 3600,
            refresh_token: 'iam_rt_test',
            id_token: iamToken(person.sub, { ...claims, typ: 'JWT', nonce }),
            scope: 'openid profile email',
          },
        });
      case '/api/oidc/logout':
        return route.fulfill({ status: 302, headers: { location: url.searchParams.get('post_logout_redirect_uri') || '/' } });
      case '/api/oidc/revoke':
        return route.fulfill({ headers: cors, json: {} });
      case '/api/oidc/userinfo':
        return route.fulfill({ headers: cors, json: { sub: String(person.sub) } });
      default:
        return route.fulfill({ status: 404, headers: cors, body: '' });
    }
  });
  return asked;
}

const SHOTS = path.join(__dirname, 'shots');

module.exports = { launch, newContext, watch, reporter, findBrowser, emulateIam, SHOTS };
