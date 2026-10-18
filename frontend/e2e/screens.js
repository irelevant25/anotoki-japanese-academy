/**
 * Screenshots of every main screen in light, dark and phone layouts, for a
 * visual check after UI changes - everybody signed in through the stand-in
 * IAM (a session planted in the browser; helpers.js). Seeds a little progress
 * first so the dashboard, reviews and item pages have something to show (大
 * with answers of the learner's own, one as long as a synonym may be). The
 * reader is an ADMIN, so the admin panel's pages are shot too - the anotoki
 * library's People, Feedback, Errors, Audit log and Backups among them, with a
 * message of the reader's own to read and a page's error on the Errors page;
 * feedback-form is Send feedback's form
 * (the library's) in its dialog; sign-in-failed is the anotoki library's screen
 * of a refused sign-in; home-visitor is the home page of somebody
 * studying without signing in (the stand-in IAM saying sign-in is not
 * required here), with its notice; update-waiting is what a learner reads
 * while a database update waits (the anotoki library's page), and
 * update-waiting-admin what the site's ADMIN reads then; exam-finish-question
 * is the kit's question (where the browser's confirm() stood) and
 * exam-score-failed the app's notice (where its alert() stood); legal-* are
 * Terms, Privacy and Contact - signed out, and Privacy signed in -, shot in
 * Slovak at 1280 px too. Every screen is checked for horizontal
 * overflow, key-shaped text (a word with no string shows as its key),
 * errors on the way, and what the reviews found by eye (looks()).
 *
 * The Slovak pass: every screen again at 390 px in a Slovak browser (Slovak
 * chosen, since the token says 'en'), light and dark, each checked for
 * <html lang="sk">, no text that is a key, and no text outside [lang=en] /
 * [lang=ja] that is an English string of the bundle whose Slovak differs (a
 * sentence left in English). The admin area stays English: <html lang="en">.
 *
 * The room: the family's top bar measured piece by piece at 360, 390, 760,
 * 761, 960, 961 and 1280 px, in English and in Slovak, light and dark -
 * signed in with a 20-character name and 999 reviews due, signed out (a
 * refused sign-in: the library's screen, and Sign in in the bar), visiting
 * (sign-in not required: the links and Sign in), and in the admin area (its
 * eight links and the new feedback beside Feedback, at 360, 390, its fold and
 * one pixel past it, where its full brand fits and where the name does, all
 * read from top-bar.component.ts): one row, in order,
 * nothing overlapping, nothing off the screen, no sideways scroll, the brand
 * whole; a phone's bar (up to 760; the admin panel's up to its own fold) with
 * its menu button and the due count on it, a desktop's with the links and the
 * person's button, the name beside it from 961. Then the menus open, light
 * and dark, shot, and a real Tab press from an item: the menu closed, the
 * focus on its button, never <body>.
 *
 *   node frontend/e2e/screens.js          → frontend/e2e/shots/screen-*.png, bar-*.png, menu-*.png
 *   node frontend/e2e/screens.js kanji    → only screens whose name contains "kanji"
 *   node frontend/e2e/screens.js room     → only the room
 *   (after a build: node frontend/scripts/ensure-build.mjs)
 */
const path = require('path');
const fs = require('fs');
const { isolate, startApp, closeAll, iamState, plant } = require('./helpers');
isolate('academy-screens'); // before the server starts: a throwaway database

const { launch, newContext, watch, keyShaped, BAR, focusedOn, answerQuestion, NOTICE, SHOTS } = require('./browser');

const FILTER = process.argv[2] || '';

/** The bar's widths as the app has them (top-bar.component.ts): where each bar folds, and where the name stands beside the initial. */
const TOP_BAR = fs.readFileSync(path.join(__dirname, '..', 'src', 'app', 'top-bar', 'top-bar.component.ts'), 'utf8');
const barWidth = (name) => Number(new RegExp(`export const ${name} = (\\d+);`).exec(TOP_BAR)?.[1] ?? NaN);
const PHONE_BAR_MAX = barWidth('PHONE_BAR_MAX');
const ADMIN_PHONE_BAR_MAX = barWidth('ADMIN_PHONE_BAR_MAX');
const NAME_BAR_MIN = barWidth('NAME_BAR_MIN');
const ADMIN_SHORT_BRAND_MAX = barWidth('ADMIN_SHORT_BRAND_MAX');
const ADMIN_NAME_BAR_MIN = barWidth('ADMIN_NAME_BAR_MIN');
if (![PHONE_BAR_MAX, ADMIN_PHONE_BAR_MAX, NAME_BAR_MIN, ADMIN_SHORT_BRAND_MAX, ADMIN_NAME_BAR_MIN].every(Number.isFinite)) {
  throw new Error('the bar’s widths could not be read from top-bar.component.ts');
}
/** The admin panel's sections, in the bar's order. */
const ADMIN_LINKS = ['translations', 'languages', 'people', 'feedback', 'errors', 'audit', 'backups', 'migrations'].map((page) => `/admin/${page}`);

/** The person on the screens: an ADMIN, so the admin area's pages are there too. */
const READER = { sub: 4501, name: 'kanji-reader', roles: ['MEMBER', 'ADMIN'] };
/** The room's people: the longest name the family measures (20 characters), 999 reviews due. */
const ROOMY = { sub: 4502, name: 'Alexandra Novakova-K', roles: ['MEMBER'] };
const ROOMY_ADMIN = { sub: 4503, name: 'Alexandra Novakova-A', roles: ['MEMBER', 'ADMIN'] };
/** A learner: what everybody but the site's ADMIN reads while a database update waits. */
const LEARNER = { sub: 4504, name: 'learner', roles: ['MEMBER'] };
/** The migration taken off the list for the update-waiting screens (applied again, it changes nothing), and put back. */
const UPDATE = '006_admin_panel_words.sql';

/** A 40-question paper, started. */
async function startPaper(page) {
  await page.waitForSelector('#bookChips button');
  await page.click('#sizeChips [data-value="40"]');
  await page.click('#startBtn');
  await page.waitForSelector('#test:not([hidden])');
}

const SCREENS = [
  ['home', '/', async (page) => page.waitForSelector('.homecards')],
  ['kanji-dashboard', '/kanji', async (page) => page.waitForSelector('.cards3')],
  ['kanji-lessons', '/kanji/lessons'],
  ['kanji-lesson-screen', '/kanji/lessons', async (page) => {
    // by its id, not its name: the Slovak pass takes this screen too
    await page.click('#startLessons');
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
  // "Finish now" with questions unanswered: the kit's question, Finish or back to the paper
  ['exam-finish-question', '/exam', async (page) => {
    await startPaper(page);
    await page.click('#quitBtn');
    await page.waitForSelector('anotoki-confirm-host dialog[open]');
  }],
  ['exam-result', '/exam', async (page) => {
    await startPaper(page);
    await page.click('#quitBtn');
    await answerQuestion(page, true);
    await page.waitForSelector('#result:not([hidden])');
  }],
  // a paper that could not be scored (no answer from the server: the hand-in cut off): the app's notice, the
  // answers still on the page
  ['exam-score-failed', '/exam', async (page) => {
    await page.route('**/api/submit', (route) => route.abort('failed'));
    await startPaper(page);
    await page.click('#quitBtn');
    await answerQuestion(page, true);
    await page.waitForSelector(NOTICE);
  }, { after: (page) => page.unroute('**/api/submit') }],
  ['changelog', '/', async (page) => {
    await page.click('#whatsNew');
    await page.waitForSelector('app-changelog-dialog dialog[open]');
  }],
  ['your-data-question', '/', async (page, app) => {
    // the reader's own file chosen: the question before anything is replaced
    const own = await (await app.api('/api/me/data', READER)).text();
    await page.setInputFiles('#your-data input[type=file]', { name: 'japanese-academy-2026-10-04.json', mimeType: 'application/json', buffer: Buffer.from(own) });
    await page.waitForSelector('#your-data anotoki-dialog dialog[open]');
  }],
  ['bar-menu', '/kanji', async (page) => {
    // the person's menu, or on a phone the one menu with the links in it
    await page.waitForSelector('.cards3');
    const phone = (await page.$(BAR.menuButton)) !== null;
    await page.click(phone ? BAR.menuButton : BAR.userButton);
    await page.waitForSelector(BAR.menu);
  }],
  // Send feedback, from the foot: the anotoki library's form in the kit's dialog
  ['feedback-form', '/', async (page) => {
    await page.waitForSelector('.homecards');
    await page.click('#sendFeedback');
    await page.waitForSelector('anotoki-feedback-form form');
  }],
  // a refused sign-in: the anotoki library's screen, in the app's frame
  ['sign-in-failed', '/', async (page) => page.waitForSelector('#signInFailure [data-retry]'), { signedOut: true }],
  // nobody signed in, where the IAM does not require it: a visitor's home, with the notice
  ['home-visitor', '/', async (page) => page.waitForSelector('#visitorNotice'), { visiting: true }],
  // the admin area: English, whatever the reader chose
  ['admin-translations', '/admin/translations', async (page) => page.waitForSelector('anotoki-translations-page .anotoki-translations-page__grid'), { admin: true }],
  ['admin-languages', '/admin/languages', async (page) => page.waitForSelector('anotoki-languages-page form.anotoki-languages-page__add'), { admin: true }],
  // the anotoki library's admin pages, in the panel's frame
  ['admin-people', '/admin/people', async (page) => page.waitForSelector('anotoki-people-page [data-people]'), { admin: true }],
  ['admin-feedback', '/admin/feedback', async (page) => page.waitForSelector('anotoki-feedback-page [data-messages] [data-message]'), { admin: true }],
  ['admin-feedback-message', '/admin/feedback', async (page) => {
    await page.click('anotoki-feedback-page [data-messages] [data-message]');
    await page.waitForSelector('anotoki-feedback-page [data-viewer] dialog[open]');
  }, { admin: true }],
  // a row: the page's error the run reported first
  ['admin-errors', '/admin/errors', async (page) => page.waitForSelector('anotoki-error-log-page [data-groups] [data-fingerprint]'), { admin: true }],
  ['admin-audit', '/admin/audit', async (page) => page.waitForSelector('anotoki-audit-log-page [data-entries]'), { admin: true }],
  ['admin-backups', '/admin/backups', async (page) => page.waitForSelector('anotoki-backups-page [data-backups]'), { admin: true }],
  ['admin-migrations', '/admin/migrations', async (page) => page.waitForSelector('[data-applied] .anotoki-migrations-page__file'), { admin: true }],
  // a database update waiting: the anotoki library's page, as a learner reads it, and as the site's ADMIN does
  ['update-waiting', '/', async (page) => page.waitForSelector('anotoki-site-status h1'), { updating: true, learner: true }],
  ['update-waiting-admin', '/', async (page) => page.waitForSelector('anotoki-site-status a'), { updating: true }],
  // the legal pages, the family's with the app's facts: anybody's - signed out the three, Privacy signed in too
  ['legal-terms', '/terms', async (page) => page.waitForSelector('anotoki-terms-page h1'), { legal: true, signedOut: true }],
  ['legal-privacy', '/privacy', async (page) => page.waitForSelector('anotoki-privacy-page [data-stored]'), { legal: true, signedOut: true }],
  ['legal-contact', '/contact', async (page) => page.waitForSelector('anotoki-contact-page [data-open-feedback]'), { legal: true, signedOut: true }],
  ['legal-privacy-signed-in', '/privacy', async (page) => page.waitForSelector('anotoki-privacy-page [data-stored]'), { legal: true }],
];

/** Slovak chosen in a browser nobody is signed in to (about:blank has no storage). */
const SLOVAK = () => {
  try {
    localStorage.setItem('academy-language', 'sk');
  } catch (e) {
    // about:blank
  }
};

const PHONE = { viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true };
const VARIANTS = [
  ['light', { viewport: { width: 1280, height: 900 }, colorScheme: 'light' }],
  ['dark', { viewport: { width: 1280, height: 900 }, colorScheme: 'dark' }],
  ['phone', { ...PHONE, colorScheme: 'light' }],
  ['phone-dark', { ...PHONE, colorScheme: 'dark' }],
  // the Slovak pass
  ['sk-phone', { ...PHONE, colorScheme: 'light', locale: 'sk-SK' }],
  ['sk-phone-dark', { ...PHONE, colorScheme: 'dark', locale: 'sk-SK' }],
  // the legal pages in Slovak at 1280 px too
  ['sk-light', { viewport: { width: 1280, height: 900 }, colorScheme: 'light', locale: 'sk-SK' }, 'legal'],
  ['sk-dark', { viewport: { width: 1280, height: 900 }, colorScheme: 'dark', locale: 'sk-SK' }, 'legal'],
];

/**
 * What a Slovak page must not show, beside key-shaped text (keyShaped()): a
 * key of the bundle, or, outside [lang=en] / [lang=ja], an English string of
 * the bundle whose Slovak is different. Text nodes and the attributes a person
 * reads or hears, shown or not yet shown.
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
      if (keySet.has(text) && !el.closest('main.admin')) out.push(`a key ${what} ${where(el)}: ${text}`);
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
 * What the reviews found by eye, measured on every screen where it is: every
 * Delete their data of the People page (the library's) in view, at 390 px
 * too; the What's new dot beside its words, not floating above them on a
 * touch screen, and clear of the '·' before Send feedback after it; the Your
 * data question's focus on Keep mine with the accent's
 * ring, never on the dialog; in dark, the anotoki mark with its light halo;
 * every segmented choice of the kit's (it never wraps) whole inside its card
 * or the page's frame, on a phone in Slovak too.
 */
function looks(page, dark) {
  return page.evaluate(({ dark, bar }) => {
    const out = [];
    const people = document.querySelector('anotoki-people-page');
    if (people) {
      const right = document.documentElement.clientWidth;
      for (const button of people.querySelectorAll('[data-delete]')) {
        const r = button.getBoundingClientRect();
        if (r.width && (r.right > right + 0.5 || r.left < -0.5)) out.push(`"${button.textContent.trim()}" is off the screen (${Math.round(r.left)}..${Math.round(r.right)} in 0..${right})`);
      }
    }
    const dot = document.querySelector('#whatsNew .dot');
    if (dot) {
      const button = document.querySelector('#whatsNew');
      const range = document.createRange();
      const text = [...button.querySelectorAll('*'), button].flatMap((el) => [...el.childNodes]).find((n) => n.nodeType === 3 && n.textContent.trim());
      if (text) {
        range.selectNodeContents(text);
        const words = range.getBoundingClientRect();
        const d = dot.getBoundingClientRect();
        const middle = (d.top + d.bottom) / 2;
        if (middle < words.top - 2 || middle > words.bottom || d.left < words.right - 2 || d.left > words.right + 12) {
          out.push(`the What's new dot is not beside its words (dot ${Math.round(d.left)},${Math.round(middle)}; words ${Math.round(words.left)}..${Math.round(words.right)}, ${Math.round(words.top)}..${Math.round(words.bottom)})`);
        }
      }
      // What follows it in the foot's line - the '·' before Send feedback - keeps clear of it (on the same line).
      const sep = document.querySelector('app-feedback-button .sep');
      if (sep) {
        const d = dot.getBoundingClientRect();
        const s = sep.getBoundingClientRect();
        if (s.width && Math.abs((s.top + s.bottom) / 2 - (d.top + d.bottom) / 2) < 16 && s.left < d.right + 4) {
          out.push(`the What's new dot touches the '·' before Send feedback (the dot ends at ${Math.round(d.right)}, the '·' starts at ${Math.round(s.left)})`);
        }
      }
    }
    const question = document.querySelector('#your-data anotoki-dialog dialog[open]');
    if (question && question.querySelector('#keepMine')) {
      const active = document.activeElement;
      if (!active || active.id !== 'keepMine') out.push(`the question's focus is on <${active ? active.tagName.toLowerCase() + (active.id ? '#' + active.id : '') : 'nothing'}>, not on Keep mine`);
      else if (active.matches(':focus-visible') && getComputedStyle(active).outlineStyle !== 'solid') out.push('Keep mine has the focus but not the accent ring');
    }
    const mark = document.querySelector(bar.mark);
    if (dark && mark && !/255, 255, 255/.test(getComputedStyle(mark).filter)) out.push(`the anotoki mark has no light halo in the dark bar (filter: ${getComputedStyle(mark).filter})`);
    for (const choice of document.querySelectorAll('main anotoki-segmented .anotoki-segmented__segmented')) {
      const box = choice.closest('.anotoki-card__body, main');
      const r = choice.getBoundingClientRect();
      const b = box.getBoundingClientRect();
      const style = getComputedStyle(box);
      const [left, right] = [b.left + parseFloat(style.paddingLeft), b.right - parseFloat(style.paddingRight)];
      if (r.width && (r.right > right + 0.5 || r.left < left - 0.5)) {
        out.push(`the segmented choice "${choice.getAttribute('aria-label')}" runs past its box (${Math.round(r.left)}..${Math.round(r.right)} in ${Math.round(left)}..${Math.round(right)})`);
      }
    }
    return out;
  }, { dark, bar: BAR });
}

/** Where each piece of the bar is, left-right, and what is wrong with the row (overlap, off the screen, cut). */
function measureBar(page) {
  return page.evaluate((bar) => {
    const q = (s) => document.querySelector(s);
    const box = (el) => {
      if (!el) return null;
      const r = el.getBoundingClientRect();
      return r.width ? [Math.round(r.left), Math.round(r.right)] : null;
    };
    const pieces = {
      brand: box(q(bar.brand)),
      links: box(q(bar.nav)),
      language: box(q(bar.langButton)),
      theme: box(q(bar.theme)),
      person: box(q(bar.userButton)),
      signIn: box(q(bar.signInButton)),
      menu: box(q(bar.menuButton)),
    };
    const order = Object.entries(pieces).filter(([, v]) => v);
    const problems = [];
    for (let i = 1; i < order.length; i++) {
      if (order[i][1][0] < order[i - 1][1][1]) problems.push(`${order[i - 1][0]} overlaps ${order[i][0]}`);
    }
    const width = document.documentElement.clientWidth;
    for (const [k, v] of order) if (v[1] > width || v[0] < 0) problems.push(`${k} leaves the screen (${v[0]}..${v[1]})`);
    if (document.documentElement.scrollWidth > width) problems.push(`the page scrolls sideways: ${document.documentElement.scrollWidth} > ${width}`);
    const wordmark = q(bar.wordmark);
    if (wordmark && wordmark.scrollWidth > wordmark.clientWidth + 1) problems.push('the brand is cut');
    const header = q(bar.header);
    const rows = header ? Math.round(header.getBoundingClientRect().height) : 0;
    const name = q(bar.userName);
    return {
      pieces: Object.fromEntries(order),
      problems,
      height: rows,
      links: [...document.querySelectorAll(`${bar.nav} a`)].map((a) => a.getAttribute('href')),
      badge: (q(bar.navDue) || q(bar.menuDue))?.textContent.trim() ?? null,
      nameShown: !!(name && getComputedStyle(name).display !== 'none' && name.getBoundingClientRect().width > 0),
    };
  }, BAR);
}

(async () => {
  // the IAM's answer whether sign-in is required kept a second, not a minute: home-visitor and the room switch it
  const app = await startApp({ applicationTtl: 1 });
  // some progress: 大 and 学 learned, one of them due, so every screen has content
  for (const id of ['k:一', 'k:二', 'k:大', 'k:学', 'v:大学']) {
    await app.api('/api/kanji/learn', READER, { method: 'POST', body: { id } });
  }
  app.makeDue(['k:大', 'k:学'], 60000, READER.sub);
  // answers of the learner's own on 大, one as long as a synonym may be (80 characters): its words wrap, the page never scrolls sideways
  const longSynonym = 'said of something much bigger than one expected, as big as a house or a mountain';
  const ownAnswers = await app.api('/api/kanji/item', READER, { method: 'POST', body: { id: 'k:大', addSynonym: longSynonym, addReading: 'おおきい' } });
  if (!ownAnswers.ok) throw new Error(`the learner's own answers were not added: ${ownAnswers.status}`);
  await app.api('/api/feedback', READER, { method: 'POST', body: { kind: 'idea', section: 'Kanji', message: 'The stroke order of 学 would help me a lot.', page: '/kanji' } });
  // a page's error, as the pages report one (the library's reporter): a row on the Errors page
  const reported = await app.api('/api/client-errors', READER, { method: 'POST', body: { type: 'TypeError', message: 'screens: a page error for the Errors page to list', page: '/kanji/reviews' } });
  if (reported.status !== 204) throw new Error(`the page's error was not logged: ${reported.status}`);
  // something in the audit log: a language added (hidden: nobody is offered it)
  await app.api('/api/admin/languages', READER, { method: 'POST', body: { code: 'de', name: 'German', native_name: 'Deutsch', enabled: false } });
  // a backup of the database, made by the reader (an ADMIN signed in just now), for the Backups page to list
  await app.api('/api/admin/backups', { ...READER, auth_time: Math.floor(Date.now() / 1000) }, { method: 'POST', body: { description: 'Before the screenshots' } });
  const bundle = await (await fetch(app.base + '/api/translations/sk')).json();
  const updateAppliedAt = app.sql('SELECT applied_at FROM migrations WHERE name = ?', UPDATE)[0].applied_at;
  if (bundle.language !== 'sk' || !bundle.english) throw new Error(`no Slovak bundle: ${JSON.stringify(bundle).slice(0, 200)}`);

  fs.mkdirSync(SHOTS, { recursive: true });
  const browser = await launch();
  const problems = [];
  for (const [variant, opts, only] of VARIANTS) {
    const sk = opts.locale === 'sk-SK';
    if (FILTER === 'room') break;
    if (only && !SCREENS.some(([name, , , how = {}]) => how[only] && (!FILTER || name.includes(FILTER)))) continue;
    const context = await newContext(browser, opts);
    await plant(context, READER, sk ? 'sk' : null);
    const page = await context.newPage();
    const errors = watch(page);
    for (const [name, url, prep, how = {}] of SCREENS) {
      if (FILTER && !name.includes(FILTER)) continue;
      if (only && !how[only]) continue; // a variant for some screens alone (the legal pages in Slovak at 1280)
      // the Sign in card: a browser of its own, nobody signed in, the IAM refusing
      let shown = page;
      // While a database update waits no page is made behind the library's page (the pages are its gate's
      // template), so nothing asks for data then: an answer that fails is a failure here too.
      if (how.updating) app.sql('DELETE FROM migrations WHERE name = ?', UPDATE);
      if (how.signedOut || how.visiting || how.learner) {
        if (how.signedOut) await iamState({ deny: true });
        else if (how.visiting) await app.signInRequired(false);
        const outContext = await newContext(browser, opts);
        if (how.learner) await plant(outContext, LEARNER, sk ? 'sk' : null);
        else if (sk) await outContext.addInitScript(SLOVAK);
        shown = await outContext.newPage();
        const outErrors = watch(shown);
        shown.on('close', () => errors.push(...outErrors));
      }
      // a real page load for every screen (the same address twice would not load again)
      await shown.goto('about:blank');
      await shown.goto(app.base + url);
      await shown.waitForLoadState('networkidle');
      if (prep) await prep(shown, app);
      await shown.mouse.move(0, 0); // no hover left over from an earlier click
      await shown.waitForTimeout(150);
      const overflow = await shown.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
      if (overflow > 0) problems.push(`${variant}/${name}: ${overflow}px horizontal overflow`);
      // the kanji tabs are the kit's link tabs: where the five do not fit (a phone, in Slovak) they scroll sideways in
      // the kit's strip, never the page (the overflow above) - and the page's tab is brought into view
      const tab = await shown.evaluate(() => {
        const strip = document.querySelector('.subnav .anotoki-tab-strip__scroller');
        const current = document.querySelector('.subnav a[aria-current="page"]');
        if (!strip || !current) return null;
        const s = strip.getBoundingClientRect();
        const c = current.getBoundingClientRect();
        return c.left >= s.left - 1 && c.right <= s.right + 1 ? null : `the page’s tab "${current.textContent.trim()}" is out of view (${Math.round(c.left)}..${Math.round(c.right)} in ${Math.round(s.left)}..${Math.round(s.right)})`;
      });
      if (tab) problems.push(`${variant}/${name}: ${tab}`);
      problems.push(...(await keyShaped(shown)).map((p) => `${variant}/${name}: ${p}`));
      problems.push(...(await looks(shown, opts.colorScheme === 'dark')).map((p) => `${variant}/${name}: ${p}`));
      if (sk && how.admin) {
        const lang = await shown.getAttribute('html', 'lang');
        if (lang !== 'en') problems.push(`${variant}/${name}: the admin area is <html lang="${lang}">, not English`);
      } else if (sk) {
        problems.push(...(await slovakProblems(shown, bundle)).map((p) => `${variant}/${name}: ${p}`));
      }
      const file = path.join(SHOTS, `screen-${name}-${variant}.png`);
      // Edge garbles full-page shots taller than ~16k device pixels: keep the top part
      const { height, dpr } = await shown.evaluate(() => ({ height: document.documentElement.scrollHeight, dpr: devicePixelRatio }));
      const limit = Math.floor(16000 / dpr);
      const clip = height > limit ? { x: 0, y: 0, width: shown.viewportSize().width, height: limit } : undefined;
      await shown.screenshot({ path: file, fullPage: true, clip });
      console.log(`saved ${path.relative(process.cwd(), file)}${clip ? `  (top ${limit} of ${height} px)` : ''}`);
      if (how.after) await how.after(shown);
      if (how.signedOut) {
        await shown.context().close();
        await iamState({ deny: false });
      } else if (how.visiting) {
        await shown.context().close();
        await app.signInRequired(true);
      } else if (how.learner) {
        await shown.context().close();
      }
      if (how.updating) {
        app.sql('INSERT INTO migrations (name, applied_at) VALUES (?, ?)', UPDATE, updateAppliedAt);
      }
    }
    problems.push(...errors.map((e) => `${variant}: ${e}`));
    await context.close();
  }

  /* ------------------------------------------------------------ the room */
  if (!FILTER || FILTER === 'room') {
    console.log('the room: the top bar at 360, 390, 760, 761, 960, 961 and 1280 px');
    for (const person of [ROOMY, ROOMY_ADMIN]) await app.api('/api/kanji/summary', person); // their rows
    // a new message nobody opened: its count beside the admin panel's Feedback (the screens before read theirs)
    await app.api('/api/feedback', ROOMY, { method: 'POST', body: { kind: 'bug', section: 'Exam', message: 'The timer kept running after I finished.' } });
    app.sql(
      "INSERT INTO srs_progress (user_id, item_id, stage, learned_at, next_review) SELECT ?, id, 1, now() - interval '2 days', now() - interval '1 hour' FROM srs_items ORDER BY ord LIMIT 999 ON CONFLICT DO NOTHING",
      ROOMY.sub
    );
    const ROOM = [360, 390, 760, 761, 960, 961, 1280];
    const SHOT = [360, 390, 760, 761, 1280];
    const cases = [];
    for (const lang of ['en', 'sk']) {
      for (const dark of [false, true]) {
        for (const width of ROOM) {
          if (dark && !SHOT.includes(width)) continue;
          cases.push({ mode: 'signed-in', lang, dark, width, url: '/kanji', person: ROOMY });
          if (SHOT.includes(width)) cases.push({ mode: 'signed-out', lang, dark, width, url: '/kanji' });
          if (SHOT.includes(width)) cases.push({ mode: 'visiting', lang, dark, width, url: '/kanji' });
        }
        // the admin panel: on phones, on both sides of its own fold, where its full brand fits, and where the name does
        for (const width of [360, 390, ADMIN_PHONE_BAR_MAX, ADMIN_PHONE_BAR_MAX + 1, ADMIN_SHORT_BRAND_MAX + 1, ADMIN_NAME_BAR_MIN]) {
          if (dark && width === ADMIN_PHONE_BAR_MAX) continue;
          cases.push({ mode: 'admin', lang, dark, width, url: '/admin/people', person: ROOMY_ADMIN });
        }
      }
    }
    // the visitors last, all at once: the IAM says sign-in is not required for them
    cases.sort((a, b) => (a.mode === 'visiting') - (b.mode === 'visiting'));
    let visiting = false;
    for (const c of cases) {
      if (c.mode === 'visiting' && !visiting) {
        await app.signInRequired(false);
        visiting = true;
      }
      const label = `room ${c.mode} ${c.lang} ${c.dark ? 'dark' : 'light'} ${c.width}px`;
      const phone = c.width <= (c.mode === 'admin' ? ADMIN_PHONE_BAR_MAX : PHONE_BAR_MAX);
      const context = await newContext(browser, { viewport: { width: c.width, height: 800 }, colorScheme: c.dark ? 'dark' : 'light', ...(c.lang === 'sk' ? { locale: 'sk-SK' } : {}) });
      if (c.person) await plant(context, c.person, c.lang === 'sk' ? 'sk' : null);
      else {
        if (c.mode === 'signed-out') await iamState({ deny: true });
        if (c.lang === 'sk') await context.addInitScript(SLOVAK);
      }
      const page = await context.newPage();
      const errors = watch(page);
      await page.goto(app.base + c.url);
      await page.waitForSelector(c.mode === 'signed-out' ? '#signInFailure [data-retry]' : phone ? BAR.menuButton : c.mode === 'visiting' ? BAR.signInButton : BAR.userButton);
      if (c.mode === 'visiting') await page.waitForSelector('#visitorNotice');
      if (c.mode === 'signed-in') await page.waitForSelector(phone ? BAR.menuDue : BAR.navDue);
      if (c.mode === 'admin') await page.waitForSelector('anotoki-people-page [data-people]');
      // the new feedback beside Feedback, once the bar has asked
      if (c.mode === 'admin' && !phone) await page.waitForSelector(`${BAR.nav} a[href="/admin/feedback"] .anotoki-top-bar__badge`);
      await page.waitForLoadState('networkidle');
      await page.waitForTimeout(150);
      const m = await measureBar(page);
      const found = [...m.problems];
      if (m.height > 72) found.push(`the bar is ${m.height} px high: more than one row`);
      if (phone !== !!m.pieces.menu) found.push(phone ? 'no menu button on a phone' : 'a menu button on a desktop');
      if (phone && m.pieces.links) found.push('links in the row on a phone');
      if (!phone && c.mode !== 'signed-out' && !m.pieces.links) found.push('no links on a desktop');
      if (!phone && !['signed-out', 'visiting'].includes(c.mode) && !m.pieces.person) found.push('no person’s button on a desktop');
      if (!phone && ['signed-out', 'visiting'].includes(c.mode) && !m.pieces.signIn) found.push('no Sign in on a desktop');
      if (c.mode === 'visiting' && m.pieces.person) found.push('a person’s button for a visitor');
      if (c.mode === 'signed-in' && m.badge !== '999') found.push(`the due count says "${m.badge}", not 999`);
      if (['signed-in', 'visiting'].includes(c.mode) && !phone && m.links.join(',') !== '/kanji,/exam') found.push(`links ${m.links.join(',')}`);
      if (c.mode === 'admin' && !phone && m.links.join(',') !== ADMIN_LINKS.join(',')) found.push(`admin links ${m.links.join(',')}`);
      if (!['signed-out', 'visiting'].includes(c.mode) && !phone && m.nameShown !== c.width >= (c.mode === 'admin' ? ADMIN_NAME_BAR_MIN : NAME_BAR_MIN)) {
        found.push(`the name ${m.nameShown ? 'shown' : 'hidden'} at ${c.width} px`);
      }
      if (c.mode === 'admin' && !phone) {
        const wordmark = await page.$$eval(`${BAR.wordmark} > span`, (spans) => spans.map((span) => span.textContent.trim()).join(' '));
        const full = c.width > ADMIN_SHORT_BRAND_MAX;
        if (wordmark !== (full ? 'anotoki Japanese · admin panel' : 'Japanese · admin panel')) found.push(`the brand "${wordmark}" at ${c.width} px`);
      }
      if (!m.pieces.brand || !m.pieces.theme) found.push('the brand or the theme switch missing');
      const lang = await page.getAttribute('html', 'lang');
      const expected = c.mode === 'admin' ? 'en' : c.lang;
      if (lang !== expected) found.push(`<html lang="${lang}">, not ${expected}`);
      found.push(...(await keyShaped(page)));
      found.push(...errors);
      problems.push(...found.map((p) => `${label}: ${p}`));
      console.log(`${label}: ${Object.entries(m.pieces).map(([k, v]) => `${k} ${v[0]}-${v[1]}`).join(', ')}${m.badge ? `; due ${m.badge}` : ''}`);
      if (c.mode === 'admin' ? c.width !== ADMIN_PHONE_BAR_MAX : SHOT.includes(c.width)) {
        await page.screenshot({ path: path.join(SHOTS, `bar-${c.mode}-${c.lang}-${c.width}-${c.dark ? 'dark' : 'light'}.png`), clip: { x: 0, y: 0, width: c.width, height: 140 } });
      }
      await context.close();
      if (c.mode === 'signed-out') await iamState({ deny: false });
    }
    if (visiting) await app.signInRequired(true);

    // The menus open, light and dark, shot; and a real Tab and Shift+Tab from
    // an item: the menu closed, the focus on its button, never <body>.
    for (const [width, dark, lang] of [[390, false, 'sk'], [390, true, 'sk'], [1280, false, 'en'], [1280, true, 'en'], [360, true, 'en']]) {
      const label = `menus ${lang} ${dark ? 'dark' : 'light'} ${width}px`;
      const context = await newContext(browser, { viewport: { width, height: 800 }, colorScheme: dark ? 'dark' : 'light', ...(lang === 'sk' ? { locale: 'sk-SK' } : {}) });
      await plant(context, { ...ROOMY_ADMIN }, lang === 'sk' ? 'sk' : null);
      const page = await context.newPage();
      const errors = watch(page);
      await page.goto(app.base + '/');
      // the button by BAR's name for it: the bar is the library's, its parts have no ids
      const buttonName = width <= 760 ? 'menuButton' : 'userButton';
      const button = BAR[buttonName];
      await page.waitForSelector(button);
      await page.click(button);
      await page.waitForSelector('[role="menu"]');
      await page.waitForTimeout(200);
      const menuBox = await page.evaluate(() => {
        const r = document.querySelector('[role="menu"]').getBoundingClientRect();
        return [Math.round(r.left), Math.round(r.right), Math.round(r.bottom), document.documentElement.clientWidth];
      });
      if (menuBox[0] < 0 || menuBox[1] > menuBox[3]) problems.push(`${label}: the menu leaves the screen (${menuBox})`);
      problems.push(...(await keyShaped(page)).map((p) => `${label}: ${p}`));
      await page.screenshot({ path: path.join(SHOTS, `menu-${lang}-${width}-${dark ? 'dark' : 'light'}.png`), clip: { x: 0, y: 0, width, height: Math.min(760, menuBox[2] + 20) } });
      const first = await page.evaluate(() => document.activeElement?.getAttribute('role'));
      for (const key of ['Tab', 'Shift+Tab']) {
        if (key === 'Shift+Tab') {
          await page.click(button);
          await page.waitForSelector('[role="menu"]');
          await page.waitForTimeout(100);
        } else {
          await page.keyboard.press('ArrowDown');
        }
        await page.keyboard.press(key);
        await page.waitForTimeout(100);
        const after = { ...(await focusedOn(page)), open: !!(await page.$('[role="menu"]')) };
        if (after.open || after.id !== buttonName) problems.push(`${label}: a real ${key} from an item: ${JSON.stringify(after)}`);
      }
      if (first !== 'menuitem') problems.push(`${label}: the menu opened with the focus on ${first}, not its first item`);
      problems.push(...errors.map((e) => `${label}: ${e}`));
      await context.close();
    }
  }
  await browser.close();
  await app.close();
  console.log(problems.length ? `\nPROBLEMS:\n  ${problems.join('\n  ')}` : '\nno overflow, no key-shaped text, the bar in one row, no page errors');
  process.exit(problems.length ? 1 : 0);
})().catch(async (e) => {
  console.error(e);
  await closeAll();
  process.exit(1);
});
