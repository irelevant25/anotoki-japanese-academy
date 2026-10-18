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
 * Text on the page that looks like a key of the app's words ("yourData.title",
 * "topbar.phoneMenuDue.one"): a key with no string shows as itself, on
 * purpose, so this is what a missing string looks like - whether the bundle
 * knows the key or not. Text nodes and the attributes a person reads or hears
 * (aria-label, title, placeholder, alt), shown or not yet shown; the admin
 * area (main.admin), which lists the keys, and a file's name ("notes.json")
 * aside.
 */
function keyShaped(page) {
  return page.evaluate(() => {
    const KEY = /^[a-z][A-Za-z0-9]*(\.[A-Za-z][A-Za-z0-9_-]*)+$/;
    const FILE = /\.(json|js|css|html|png|svg|pdf|mp3)$/;
    const out = [];
    const where = (el) => `<${el.tagName.toLowerCase()}${el.id ? '#' + el.id : ''}>`;
    const check = (raw, el, what) => {
      const text = (raw || '').replace(/\s+/g, ' ').trim();
      if (KEY.test(text) && !FILE.test(text) && !el.closest('main.admin, script, style')) out.push(`a key ${what} ${where(el)}: ${text}`);
    };
    const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
    for (let node = walker.nextNode(); node; node = walker.nextNode()) {
      if (node.parentElement) check(node.textContent, node.parentElement, 'in');
    }
    for (const attr of ['aria-label', 'title', 'placeholder', 'alt']) {
      for (const el of document.querySelectorAll(`[${attr}]`)) check(el.getAttribute(attr), el, `in ${attr} of`);
    }
    return [...new Set(out)];
  });
}

/**
 * The top bar is the anotoki family's, the library's (<anotoki-top-bar>,
 * @anotoki/lib/shell): its parts have classes of the library's - since
 * anotoki-lib 0.3.0 each piece's own, `anotoki-<piece>__<part>` -, and no
 * ids. Where each one is, under the name the suites give it (the ids the
 * parts had while the bar was this app's own). A menu is drawn only while it
 * is open.
 */
const BAR = {
  bar: 'anotoki-top-bar',
  header: 'anotoki-top-bar header.anotoki-top-bar__topbar',
  brand: 'anotoki-top-bar anotoki-brand a',
  wordmark: 'anotoki-top-bar anotoki-brand .anotoki-brand__wordmark',
  mark: 'anotoki-top-bar anotoki-brand img',
  nav: 'anotoki-top-bar nav.anotoki-top-bar__nav',
  navDue: 'anotoki-top-bar nav.anotoki-top-bar__nav .anotoki-top-bar__badge',
  langButton: 'anotoki-top-bar anotoki-language-switcher button.anotoki-language-switcher__switcher', // not its menu's items, buttons in it too
  theme: 'anotoki-top-bar anotoki-theme-toggle .anotoki-segmented__segmented',
  userButton: 'anotoki-top-bar .anotoki-top-bar__person-button',
  userName: 'anotoki-top-bar .anotoki-top-bar__person-name',
  signInButton: 'anotoki-top-bar button.anotoki-top-bar__sign-in',
  menuButton: 'anotoki-top-bar .anotoki-top-bar__menu-button',
  menuDue: 'anotoki-top-bar .anotoki-top-bar__mark-badge',
  menu: 'anotoki-top-bar [role="menu"]',
  accountLink: 'anotoki-top-bar [role="menu"] a[target="_blank"]',
  adminLink: 'anotoki-top-bar [role="menu"] a[href="/admin"]',
  backLink: 'anotoki-top-bar [role="menu"] a[href="/"]',
  signOut: 'anotoki-top-bar .anotoki-top-bar__sign-out-item',
  signInItem: 'anotoki-top-bar .anotoki-top-bar__sign-in-item',
};

/** A section's link in the bar, by where it goes: barLink('/kanji'). */
const barLink = (path) => `${BAR.nav} a[href="${path}"]`;

/** The theme switch's choice: light, dark, or auto (as the device is set). */
const themeChoice = (mode) => `anotoki-top-bar [role="radio"][data-value="${mode}"]`;

/**
 * The element that has the focus: for a part of the bar BAR's name for it
 * ('userButton', 'signOut' ...: the ids the library gives its menu buttons are
 * made up as it draws them), else its id; its role and its tag.
 */
function focusedOn(page) {
  return page.evaluate((bar) => {
    const el = document.activeElement;
    const part = el ? Object.keys(bar).find((name) => el.matches(bar[name])) || '' : '';
    return { id: part || (el && el.id) || '', role: (el && el.getAttribute('role')) || '', tag: el ? el.tagName.toLowerCase() : '' };
  }, BAR);
}

/**
 * The kit's question (<anotoki-confirm-host>, ConfirmService - where the browser's own confirm() stood): waited for,
 * its words read, answered - the yes (true) or the no (false) - and waited for until it is gone. Null when none came
 * within `timeout`.
 */
async function answerQuestion(page, yes, timeout = 5000) {
  const open = 'anotoki-confirm-host dialog[open]';
  const shown = await page.waitForSelector(open, { timeout }).then(
    () => true,
    () => false,
  );
  if (!shown) return null;
  const words = (selector) => page.$eval(selector, (el) => el.textContent.replace(/\s+/g, ' ').trim()).catch(() => '');
  const said = {
    title: await words(`${open} h2`),
    message: await words(`${open} .anotoki-confirm-host__message`),
    no: await words(`${open} [data-answer="no"]`),
    yes: await words(`${open} [data-answer="yes"]`),
  };
  await page.click(`${open} [data-answer="${yes ? 'yes' : 'no'}"]`);
  await page.waitForSelector(open, { state: 'detached', timeout });
  return said;
}

/** The app's notice (<app-notice-host>, NoticeService - where the browser's own alert() stood), while one is drawn. */
const NOTICE = 'app-notice-host dialog[open]';

const SHOTS = path.join(__dirname, 'shots');

module.exports = { launch, newContext, watch, reporter, findBrowser, keyShaped, BAR, barLink, themeChoice, focusedOn, answerQuestion, NOTICE, SHOTS };
