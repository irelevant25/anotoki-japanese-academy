import { HttpTestingController } from '@angular/common/http/testing';
import { ApplicationRef, ChangeDetectionStrategy, Component, EnvironmentProviders, OnDestroy, Provider, provideZonelessChangeDetection, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter, Router, Routes } from '@angular/router';
import { ANOTOKI_AUTH_CLIENT_FACTORY, AnotokiAuthEnvironment, AnotokiAuthOptions } from '@anotoki/lib/auth';
import { FakeAuthClient } from '@anotoki/lib/auth/testing';
import { SiteStatus } from '@anotoki/lib/migrations';
import { TranslationService } from '@anotoki/lib/translations';
import { provideTestTranslations } from '@anotoki/lib/translations/testing';
import { ConfirmService } from '@anotoki/lib/ui/dialog';
import { AppComponent } from './app.component';
import { provideAuth } from './core/auth/auth.config';
import { AuthService } from './core/auth/auth.service';
import { ChangelogEntry, ChangelogService } from './core/changelog/changelog.service';
import { provideFeedback } from './core/feedback.config';
import { provideKit } from './core/kit.config';
import { NoticeService } from './core/notice/notice.service';
import { provideKitEnglish } from './core/testing/kit-english';
import { provideTestSiteStatus } from './core/testing/site-status';
import { KanjiStateService } from './kanji/kanji-state.service';

const ENGLISH = {
  'topbar.exam': 'Exam',
  'topbar.kanjiDue.one': '{count} review due',
  'topbar.kanjiDue.few': '{count} reviews due',
  'topbar.kanjiDue.other': '{count} reviews due',
  'anotoki.language.button': 'Language: {name} ({code})',
};
const SLOVAK = {
  'topbar.exam': 'Skúška',
  'topbar.kanjiDue.one': '{count} opakovanie čaká',
  'topbar.kanjiDue.few': '{count} opakovania čakajú',
  'topbar.kanjiDue.other': '{count} opakovaní čaká',
  'anotoki.language.button': 'Jazyk: {name} ({code})',
};

/** These specs' own client id: the client's storage listeners of other specs never hear their tabs. */
const CLIENT = 'academy-test-app';
const KEY = `anotoki-auth:${CLIENT}`;

/** A signed-in session as the anotoki library's client keeps it (the IAM's SDK's way, the same key), for IAM user 7, with these roles here. */
function session(roles: string[] = []): string {
  return JSON.stringify({
    access_token: 'token-of-7',
    access_expires_at: Date.now() + 3_600_000,
    refresh_token: 'refresh-of-7',
    id_token: null,
    user: { sub: '7', preferred_username: 'hana', email: 'hana@example.test', email_verified: true, locale: null, roles },
    updated_at: Date.now(),
  });
}

/** How many of the pages below were made, and are alive: the gate makes the pages only while the site is open. */
const pages = { made: 0, alive: 0 };

/** A page of the app, as the router draws it in the outlet. */
@Component({ selector: 'app-test-page', changeDetection: ChangeDetectionStrategy.OnPush, template: '<p id="a-page">a page</p>' })
class TestPageComponent implements OnDestroy {
  constructor() {
    pages.made += 1;
    pages.alive += 1;
  }

  ngOnDestroy(): void {
    pages.alive -= 1;
  }
}

/** The admin panel's Migrations page, standing in for the real one (the library's page has a spec of its own). */
@Component({ selector: 'app-test-migrations', changeDetection: ChangeDetectionStrategy.OnPush, template: '<p id="the-migrations-page">Migrations</p>' })
class TestMigrationsComponent {}

const ROUTES: Routes = [
  { path: 'admin/migrations', component: TestMigrationsComponent },
  { path: '**', component: TestPageComponent },
];

/** The changelog these specs give the footer, in public/changelog.json's place: its newest entry is the version shown. */
const ENTRIES: ChangelogEntry[] = [
  { version: '0.2.0', date: '2026-10-06', changes: { added: ['A setup page'], fixed: ['A missing space'] } },
  { version: '0.1.0', date: '2026-09-29', changes: { updated: ['Sign-in'] } },
];

/**
 * The page around every screen, once the app has started — signed in (with
 * these roles), unless `signedIn` says not — with this many reviews due;
 * `config`: more of what the server relays (loginRequired false: sign-in not
 * required here). The site's state (SiteStatus) stays 'unknown' — the gate
 * shows the pages — unless a test tells it otherwise.
 */
async function draw(providers: (Provider | EnvironmentProviders)[] = [], due = 0, signedIn = true, config: Record<string, unknown> = {}, roles: string[] = []): Promise<HTMLElement> {
  TestBed.configureTestingModule({
    providers: [
      provideZonelessChangeDetection(),
      provideRouter(ROUTES),
      provideTestSiteStatus(),
      provideAuth(),
      provideFeedback(),
      provideKitEnglish(),
      provideKit(),
      { provide: KanjiStateService, useValue: { reviewsDue: signal(due) } },
      ...providers,
    ],
  });
  const changelog = TestBed.inject(ChangelogService);
  changelog.load = () => Promise.resolve(changelog.entries.set(ENTRIES));
  if (signedIn) {
    localStorage.setItem(KEY, session(roles));
  } else {
    localStorage.removeItem(KEY);
  }
  globalThis.fetch = vi.fn(() =>
    Promise.resolve(new Response(JSON.stringify({ issuer: 'https://iam.test', clientId: CLIENT, ...config }), { status: 200, headers: { 'Content-Type': 'application/json' } })),
  ) as unknown as typeof fetch;
  await TestBed.inject(AuthService).init();
  const fixture = TestBed.createComponent(AppComponent);
  await fixture.whenStable();
  return fixture.nativeElement as HTMLElement;
}

function links(el: HTMLElement): (string | undefined)[] {
  return Array.from(el.querySelectorAll('app-top-bar nav.anotoki-top-bar__nav a')).map((a) => a.textContent?.replace(/\s+/g, ' ').trim());
}

/** The words of an element, its white space folded. */
function words(el: Element | null | undefined): string {
  return el?.textContent?.replace(/\s+/g, ' ').trim() ?? '';
}

const settle = () => TestBed.inject(ApplicationRef).whenStable();

/** The footer's row as it is read: each part's words, and the dots between them. */
function footerRow(el: HTMLElement): string[] {
  return Array.from(el.querySelectorAll('anotoki-site-footer .anotoki-site-footer__row > *'), (part) => words(part));
}

/** What of the app's frame is drawn: its bar, its footer, and any header, navigation or footer landmark at all. */
function frameOf(el: HTMLElement): { bar: boolean; footer: boolean; landmarks: number } {
  return { bar: el.querySelector('app-top-bar') !== null, footer: el.querySelector('anotoki-site-footer') !== null, landmarks: el.querySelectorAll('header, nav, footer').length };
}

/** The status page drawn bare: the library's page alone, in the gate's own <main>, with nothing of the frame around it. */
function bareStatusPage(el: HTMLElement): void {
  expect(el.querySelector('anotoki-site-gate > main.anotoki-site-gate__status > anotoki-site-status'), 'the library’s page in the gate’s <main>').not.toBeNull();
  expect(frameOf(el), 'no bar, no footer, no header, navigation or footer landmark').toEqual({ bar: false, footer: false, landmarks: 0 });
  expect(el.querySelectorAll('main').length, 'one page').toBe(1);
}

/**
 * Presses the footer's Feedback and waits for the library's form in its dialog: the dialog's code comes with the
 * first press (@anotoki/lib/footer/feedback), a turn or two later.
 */
async function openFeedback(el: HTMLElement): Promise<Element> {
  el.querySelector<HTMLButtonElement>('anotoki-site-footer [data-open-feedback]')!.click();
  for (let turn = 0; turn < 40 && !el.querySelector('[data-feedback-dialog] anotoki-feedback-form form'); turn++) {
    await new Promise((done) => setTimeout(done, 5));
    await settle();
  }
  await settle();
  return el.querySelector('[data-feedback-dialog]')!;
}

/**
 * The frame's landmark of a sign-in that came back without one, once the library's route in it has loaded the
 * screen (anotoki-lib 0.5.0: <anotoki-sign-in-failure-route> loads <anotoki-sign-in-failure> as it is shown, a
 * turn or two later - never in the first load).
 */
async function failureShown(el: HTMLElement): Promise<Element | null> {
  for (let turn = 0; turn < 20 && !el.querySelector('#signInFailure anotoki-sign-in-failure'); turn++) {
    await new Promise((done) => setTimeout(done, 5));
    await settle();
  }
  return el.querySelector('#signInFailure');
}

/** A page load that came back from the IAM without a sign-in ($code: the IAM's), as the library's client reports it. */
function refusedSignIn(code: string): Provider {
  return {
    provide: ANOTOKI_AUTH_CLIENT_FACTORY,
    useValue: (options: AnotokiAuthOptions, environment: AnotokiAuthEnvironment) => {
      const client = new FakeAuthClient(options, environment, null);
      client.initResult = { returnTo: '/', error: Object.assign(new Error('refused'), { code }), silent: false };
      refusedClient = client;
      return client;
    },
  };
}

/** The stand-in client of the last refusedSignIn(): a test signs somebody in with it, as another tab would. */
let refusedClient: FakeAuthClient | null = null;

describe('AppComponent: the bar above, the family’s footer below — inside the gate', () => {
  const realFetch = globalThis.fetch;

  afterEach(() => {
    globalThis.fetch = realFetch;
    localStorage.removeItem(KEY);
    vi.restoreAllMocks();
  });

  it('with no strings: the bar’s English and the footer’s - the library’s own -, never a key; the gate outermost, the bar first and the footer last inside it', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const el = await draw();
    expect(Array.from(el.children, (child) => child.tagName.toLowerCase()), 'the gate, then the kit’s question and the app’s notice, drawn only when asked').toEqual([
      'anotoki-site-gate',
      'anotoki-confirm-host',
      'app-notice-host',
    ]);
    // The frame is the gate's pages (anotokiSitePages): the bar, the page, the footer and the news it opens.
    const framed = Array.from(el.querySelector('anotoki-site-gate')!.children, (child) => child.tagName.toLowerCase());
    expect([framed[0], framed.slice(-2)], framed.join(' ')).toEqual(['app-top-bar', ['anotoki-site-footer', 'app-changelog-dialog']]);
    expect(framed).toContain('app-test-page');
    expect(links(el)).toEqual(['Kanji', 'Exam']);
    expect(el.querySelector('app-top-bar a[href="/exam"]'), 'the link the browser suites click').not.toBeNull();
    expect(Array.from(el.querySelectorAll('anotoki-brand .anotoki-brand__wordmark > span')).map((span) => span.textContent)).toEqual(['anotoki', 'Japanese']);
    expect(footerRow(el)).toEqual(['Version 0.2.0', '·', "What's new", '·', 'Feedback']);
    expect(warn).not.toHaveBeenCalled();
  });

  it('the foot: the family’s footer, the build analyzer’s - “Version 0.2.0 · What’s new · Feedback”, then Terms · Privacy · Contact to the legal pages’ own paths, in a footer of its own; no fan clause', async () => {
    const el = await draw();
    const footer = el.querySelector('anotoki-site-footer > footer.anotoki-site-footer__footer');
    expect(footer, 'its own <footer> landmark').not.toBeNull();
    // The version is the changelog's newest entry (public/changelog.json); the dots are drawn, never read.
    expect(footerRow(el)).toEqual(['Version 0.2.0', '·', "What's new", '·', 'Feedback']);
    expect(Array.from(el.querySelectorAll('anotoki-site-footer .anotoki-site-footer__dot'), (dot) => dot.getAttribute('aria-hidden'))).toEqual(['true', 'true']);
    const legal = footer?.querySelector('anotoki-legal-links');
    expect(legal?.querySelector('nav')?.getAttribute('aria-label')).toBe('Legal');
    expect(Array.from(legal?.querySelectorAll('a') ?? [], (a) => [words(a), a.getAttribute('href')])).toEqual([
      ['Terms', '/terms'],
      ['Privacy', '/privacy'],
      ['Contact', '/contact'],
    ]);
    expect(el.querySelector('anotoki-site-footer [data-fan]'), 'Japanese Academy is no fan site').toBeNull();

    // No changelog (not come yet, or none on the server): neither the version nor What's new - Feedback alone.
    TestBed.inject(ChangelogService).entries.set([]);
    await settle();
    expect(footerRow(el)).toEqual(['Feedback']);
  });

  it('the footer in the language on the page: the library’s words, Slovak that addresses nobody - and the database’s string of a key first', async () => {
    const el = await draw([provideTestTranslations({ ...SLOVAK, 'anotoki.footer.feedback': 'Napíš nám' }, { language: 'sk', english: ENGLISH })]);
    expect(footerRow(el)).toEqual(['Verzia 0.2.0', '·', 'Čo je nové', '·', 'Napíš nám']);
    expect(el.querySelector('anotoki-site-footer [lang]'), 'every part in the page’s language').toBeNull();
  });

  it('What’s new opens the app’s own news over the page - every release -, and Escape, its Close or the backdrop put it away', async () => {
    const el = await draw();
    el.querySelector<HTMLButtonElement>('anotoki-site-footer [data-whats-new]')!.click();
    await settle();
    const dialog = el.querySelector('app-changelog-dialog dialog');
    expect(dialog?.hasAttribute('open')).toBe(true);
    expect(words(dialog?.querySelector('.anotoki-dialog__title'))).toBe('What’s new');
    expect(Array.from(dialog?.querySelectorAll('.release .vnum') ?? [], (version) => words(version))).toEqual(['v0.2.0latest', 'v0.1.0']);
    expect(el.querySelector('[data-feedback-dialog]'), 'not the feedback form').toBeNull();
    dialog!.querySelector<HTMLButtonElement>('.anotoki-dialog__close')!.click();
    await settle();
    expect(el.querySelector('app-changelog-dialog dialog'), 'closed').toBeNull();
  });

  it('Feedback opens the library’s form in the kit’s dialog, configured for the app: Kanji and the exam as places, “without my name” and the address written in for a person; Cancel closes it', async () => {
    const el = await draw([provideTestTranslations(SLOVAK, { language: 'sk', english: ENGLISH })]);
    const dialog = await openFeedback(el);
    expect(words(dialog.querySelector('.anotoki-dialog__title')), 'named by the footer’s button').toBe('Spätná väzba');
    const form = dialog.querySelector('anotoki-feedback-form');
    expect(form?.querySelector('.anotoki-feedback-form__title'), 'the dialog’s heading says it once').toBeNull();
    expect(Array.from(form?.querySelectorAll('anotoki-select option') ?? [], (option) => words(option))).toEqual(expect.arrayContaining(['Kanji', 'Skúška']));
    expect(form?.querySelector('[data-anonymous]'), 'a person may send it without their name').not.toBeNull();
    expect(form?.querySelector<HTMLInputElement>('[data-email] input')?.value).toBe('hana@example.test');
    form!.querySelector<HTMLButtonElement>('[data-cancel]')!.click();
    await settle();
    expect(el.querySelector('[data-feedback-dialog]')).toBeNull();
  });

  it('a visitor’s form: no “without my name” - there is no name to leave out', async () => {
    const el = await draw([], 0, false, { loginRequired: false });
    expect(TestBed.inject(AuthService).state()).toBe('visiting');
    expect(footerRow(el)).toEqual(['Version 0.2.0', '·', "What's new", '·', 'Feedback']);
    const dialog = await openFeedback(el);
    expect(dialog.querySelector('anotoki-feedback-form form')).not.toBeNull();
    expect(dialog.querySelector('anotoki-feedback-form [data-anonymous]')).toBeNull();
  });

  it('the form sends to POST /api/feedback what was written, the place, and the page without its query', async () => {
    // The page the browser shows (the form reads location.pathname; the TestBed's router has a location of its own).
    history.replaceState(null, '', '/kanji/lessons?batch=2#top');
    try {
      const el = await draw();
      const dialog = await openFeedback(el);
      const textarea = dialog.querySelector<HTMLTextAreaElement>('anotoki-feedback-form textarea')!;
      textarea.value = 'The reading of 学 is missing.';
      textarea.dispatchEvent(new Event('input', { bubbles: true }));
      await settle();
      dialog.querySelector<HTMLFormElement>('anotoki-feedback-form form')!.dispatchEvent(new Event('submit', { cancelable: true }));
      await settle();
      const sent = TestBed.inject(HttpTestingController).expectOne('/api/feedback');
      expect(sent.request.method).toBe('POST');
      expect(sent.request.body).toEqual(expect.objectContaining({ kind: 'bug', message: 'The reading of 学 is missing.', page: '/kanji/lessons', language: 'en' }));
      sent.flush({ ok: true }, { status: 201, statusText: 'Created' });
    } finally {
      history.replaceState(null, '', '/');
    }
  });

  it('Feedback only while the app itself is shown: not on the way to the IAM, on a legal page signed out, on the Sign in card or the problem page - the version and What’s new all the same', async () => {
    const out = await draw([], 0, false);
    expect(TestBed.inject(AuthService).state()).toBe('signed-out');
    expect(footerRow(out), 'on the way to the IAM').toEqual(['Version 0.2.0', '·', "What's new"]);
    await TestBed.inject(Router).navigateByUrl('/privacy');
    await settle();
    expect(footerRow(out), 'a legal page, signed out').toEqual(['Version 0.2.0', '·', "What's new"]);
    TestBed.resetTestingModule();

    const ended = await draw();
    expect(footerRow(ended)).toEqual(['Version 0.2.0', '·', "What's new", '·', 'Feedback']);
    localStorage.removeItem(KEY);
    window.dispatchEvent(new StorageEvent('storage', { key: KEY }));
    await settle();
    expect(ended.querySelector('#signin'), 'the Sign in card').not.toBeNull();
    expect(footerRow(ended), 'the Sign in card').toEqual(['Version 0.2.0', '·', "What's new"]);
    TestBed.resetTestingModule();

    const problem = await draw();
    TestBed.inject(AuthService).cannotStart({ kind: 'offline' });
    await settle();
    expect(problem.querySelector('app-problem'), 'the problem page').not.toBeNull();
    expect(footerRow(problem), 'the problem page').toEqual(['Version 0.2.0', '·', "What's new"]);
  });

  it('no key pressed in the footer reaches the page - What’s new, the news it opens (its Close, its lines), Feedback and its form: Enter there answers no card and hands no paper in', async () => {
    const el = await draw();
    const reached: string[] = [];
    const onDocument = (event: KeyboardEvent): void => void reached.push(event.key);
    const press = (target: Element | null): void => {
      for (const key of ['Enter', ' ', '1', 'f', 'ArrowRight']) {
        target!.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true }));
      }
    };
    document.addEventListener('keydown', onDocument);
    try {
      const whatsNew = el.querySelector('anotoki-site-footer [data-whats-new]');
      press(whatsNew);
      (whatsNew as HTMLButtonElement).click();
      await settle();
      const news = el.querySelector('app-changelog-dialog dialog');
      press(news);
      press(news?.querySelector('.anotoki-dialog__close') ?? null);
      press(news?.querySelector('li') ?? null);
      news!.querySelector<HTMLButtonElement>('.anotoki-dialog__close')!.click();
      await settle();

      press(el.querySelector('anotoki-site-footer [data-open-feedback]'));
      press(el.querySelector('anotoki-site-footer anotoki-legal-links a'));
      const dialog = await openFeedback(el);
      press(dialog.querySelector('anotoki-feedback-form textarea'));
      press(dialog.querySelector('anotoki-feedback-form [data-cancel]'));
      expect(reached, 'no key reached the page').toEqual([]);

      // The same keys anywhere else are the page's.
      press(el.querySelector('#a-page'));
      expect(reached).toEqual(['Enter', ' ', '1', 'f', 'ArrowRight']);
    } finally {
      document.removeEventListener('keydown', onDocument);
    }
  });

  it('the kit’s question and the app’s notice keep every key pressed in them from the page — where the reviews and the exam listen: Enter there answers no card and hands no paper in', async () => {
    const el = await draw();
    const reached: string[] = [];
    const onDocument = (event: KeyboardEvent): void => void reached.push(event.key);
    document.addEventListener('keydown', onDocument);
    try {
      const question = TestBed.inject(ConfirmService);
      const asked = question.ask({ title: 'Stop now?', message: '1 half-answered item will not be saved.' });
      await settle();
      const no = el.querySelector<HTMLButtonElement>('anotoki-confirm-host [data-answer="no"]')!;
      expect(words(el.querySelector('anotoki-confirm-host h2'))).toBe('Stop now?');
      no.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
      no.click();
      expect(await asked).toBe(false);

      const notice = TestBed.inject(NoticeService);
      const told = notice.tell({ title: 'The report did not open', message: 'Could not open it: No such report.', detail: 'Not found' });
      await settle();
      const ok = el.querySelector<HTMLButtonElement>('app-notice-host [data-answer="ok"]')!;
      expect([words(el.querySelector('app-notice-host h2')), words(el.querySelector('[data-notice-message]')), words(ok)]).toEqual([
        'The report did not open',
        'Could not open it: No such report.',
        'OK',
      ]);
      expect(el.querySelector('[data-notice-detail]')?.getAttribute('lang'), 'the server’s reason, as it came').toBe('en');
      ok.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
      ok.click();
      await told;
      await settle();
      expect(el.querySelector('app-notice-host anotoki-dialog'), 'OK closes it').toBeNull();
      expect(reached, 'no key reached the page').toEqual([]);
    } finally {
      document.removeEventListener('keydown', onDocument);
    }
  });

  it('in the language on the page: the exam is worded, the term “Kanji” and the app’s name are what they are everywhere', async () => {
    const el = await draw([provideTestTranslations(SLOVAK, { language: 'sk', english: ENGLISH })], 125);
    // The number seen alone; what it counts heard after the link's name, in the page's language (badgeLabel: never the kit's "125 new").
    expect(links(el)).toEqual(['Kanji 125, 125 opakovaní čaká', 'Skúška']);
    expect(el.querySelector('app-top-bar nav.anotoki-top-bar__nav .anotoki-top-bar__badge')?.textContent?.trim()).toBe('125');

    await TestBed.inject(TranslationService).setLanguage('en', { remember: false });
    await TestBed.inject(ApplicationRef).whenStable();
    expect(links(el)).toEqual(['Kanji 125, 125 reviews due', 'Exam']);
  });

  it('a copy that is not set up: the library’s page alone - no bar, no footer, no page - never installed, with the way to the setup page', async () => {
    const el = await draw();
    TestBed.inject(AuthService).notSetUp(false);
    await settle();
    expect(words(el.querySelector('anotoki-site-status h1'))).toBe('This site is not set up yet');
    expect(el.querySelector('anotoki-site-status a[href="/setup.php"]')?.textContent?.trim()).toBe('Open the setup page');
    expect(el.querySelector('router-outlet')).toBeNull();
    bareStatusPage(el);
  });

  it('a site that was installed once and lost its settings: “not available right now” — never the setup page, and nothing of the frame', async () => {
    const el = await draw();
    TestBed.inject(AuthService).notSetUp(true);
    await settle();
    expect(words(el.querySelector('anotoki-site-status h1'))).toBe('The site is not available right now');
    expect(el.querySelector('anotoki-site-status a[href="/setup.php"]')).toBeNull();
    expect(words(el.querySelector('anotoki-site-status')).includes('setup'), words(el.querySelector('anotoki-site-status'))).toBe(false);
    bareStatusPage(el);
  });

  it('its database out of reach: the library’s page alone, and once the site answers again, the frame is back - the bar, the page, the footer', async () => {
    const el = await draw();
    TestBed.inject(SiteStatus).report('unavailable');
    await settle();
    expect(words(el.querySelector('anotoki-site-status h1'))).toBe('The site is not available right now');
    bareStatusPage(el);

    TestBed.inject(SiteStatus).markReady();
    await settle();
    expect(el.querySelector('anotoki-site-status')).toBeNull();
    expect(frameOf(el)).toEqual(expect.objectContaining({ bar: true, footer: true }));
    expect([links(el), footerRow(el)]).toEqual([['Kanji', 'Exam'], ['Version 0.2.0', '·', "What's new", '·', 'Feedback']]);
    expect(el.querySelector('#a-page')).not.toBeNull();
  });
});

describe('AppComponent: while a database update waits', () => {
  const realFetch = globalThis.fetch;

  afterEach(() => {
    globalThis.fetch = realFetch;
    localStorage.removeItem(KEY);
    vi.restoreAllMocks();
  });

  /** The library's page: its heading, and every button and link on it. */
  function statusPage(el: HTMLElement): { title: string; text: string; actions: string[] } {
    const page = el.querySelector('anotoki-site-status');
    return {
      title: words(page?.querySelector('h1')),
      text: words(page),
      actions: Array.from(page?.querySelectorAll('a, button') ?? [], (action) => words(action)),
    };
  }

  it('a visitor (nobody signed in): “The site is being updated” — no error, no code, no setup or migrations button; a quiet Sign in, this app’s own', async () => {
    const el = await draw([], 0, false);
    TestBed.inject(SiteStatus).report('update_pending');
    await settle();
    const page = statusPage(el);
    expect(page.title).toBe('The site is being updated');
    expect(page.actions).toEqual(['Sign in']);
    expect(page.text).not.toMatch(/error|update_pending|503|setup|Migrations/i);
    expect(el.querySelector('#signin, app-problem, router-outlet')).toBeNull();
    bareStatusPage(el);
    // The quiet Sign in is this app's: to the IAM, in the language read here, and back to this page (AuthService.askedFor).
    const login = vi.spyOn(TestBed.inject(AuthService), 'login').mockResolvedValue(true);
    el.querySelector<HTMLButtonElement>('anotoki-site-status button')!.click();
    await vi.waitFor(() => expect(login).toHaveBeenCalledTimes(1));
  });

  it('in the reader’s language: Slovak', async () => {
    const el = await draw([provideTestTranslations(SLOVAK, { language: 'sk', english: ENGLISH })], 0, false);
    TestBed.inject(SiteStatus).report('update_pending');
    await settle();
    expect(statusPage(el).title).toBe('Stránku práve aktualizujeme');
    expect(statusPage(el).actions).toEqual(['Prihlásiť sa']);
    expect(el.querySelector('anotoki-site-status [lang]')?.getAttribute('lang')).toBe('sk');
  });

  it('a signed-in learner, and an editor: the same page, and no button at all', async () => {
    for (const roles of [[], ['EDITOR']]) {
      const el = await draw([], 0, true, {}, roles);
      TestBed.inject(SiteStatus).report('update_pending');
      await settle();
      const page = statusPage(el);
      expect([page.title, page.actions], roles.join() || 'a learner').toEqual(['The site is being updated', []]);
      expect(page.text).not.toMatch(/error|update_pending|setup|Migrations/i);
      bareStatusPage(el);
      TestBed.resetTestingModule();
      localStorage.removeItem(KEY);
    }
  });

  it('the site’s ADMIN: “A database update is waiting”, and the way to the Migrations page - which opens, alone of the app’s pages, in the app’s frame', async () => {
    const el = await draw([], 0, true, {}, ['ADMIN']);
    await TestBed.inject(Router).navigateByUrl('/kanji');
    TestBed.inject(SiteStatus).report('update_pending');
    await settle();
    expect(statusPage(el).title).toBe('A database update is waiting');
    expect(statusPage(el).actions).toEqual(['Open Migrations']);
    expect(el.querySelector('#a-page')).toBeNull();
    bareStatusPage(el);

    el.querySelector<HTMLAnchorElement>('anotoki-site-status a')!.click();
    await vi.waitFor(async () => {
      await settle();
      expect(el.querySelector('#the-migrations-page')).not.toBeNull();
    });
    expect(TestBed.inject(Router).url).toBe('/admin/migrations');
    expect(el.querySelector('anotoki-site-status')).toBeNull();
    // The admin panel's frame with it: the bar, with the Migrations link alone, and the footer - its Feedback
    // left out while the update waits (a message would be refused).
    expect(frameOf(el)).toEqual(expect.objectContaining({ bar: true, footer: true }));
    expect(links(el)).toEqual(['Migrations']);
    expect(footerRow(el)).toEqual(['Version 0.2.0', '·', "What's new"]);

    // Anywhere else, the page again - bare.
    await TestBed.inject(Router).navigateByUrl('/exam');
    await settle();
    expect(statusPage(el).title).toBe('A database update is waiting');
    expect(el.querySelector('#a-page')).toBeNull();
    bareStatusPage(el);
  });

  it('the pages are the gate’s template: none runs behind the library’s page - the one open when an update stops the site is taken down, none is made while it waits, and the page is made again once the site is back', async () => {
    const el = await draw();
    expect(el.querySelector('#a-page')).not.toBeNull();
    const { made, alive } = pages;

    TestBed.inject(SiteStatus).report('update_pending');
    await settle();
    expect(statusPage(el).title).toBe('The site is being updated');
    expect([el.querySelector('#a-page'), el.querySelector('router-outlet'), pages.alive], 'taken down, its outlet with it').toEqual([null, null, alive - 1]);
    bareStatusPage(el);

    // Addresses followed while it waits (Back, Forward): the router goes on, and makes no page.
    const router = TestBed.inject(Router);
    await router.navigateByUrl('/admin/migrations');
    await router.navigateByUrl('/exam');
    await settle();
    expect([pages.made, pages.alive], 'nothing made behind the library’s page').toEqual([made, alive - 1]);
    bareStatusPage(el);

    TestBed.inject(SiteStatus).markReady();
    await settle();
    expect(el.querySelector('#a-page')).not.toBeNull();
    expect([pages.made, pages.alive], 'the page of the address, made again').toEqual([made + 1, alive]);
    // The frame back with it: the bar with its sections, the footer with its Feedback; the library's page gone.
    expect(el.querySelector('.anotoki-site-gate__status, anotoki-site-status')).toBeNull();
    expect([links(el), footerRow(el)]).toEqual([['Kanji', 'Exam'], ['Version 0.2.0', '·', "What's new", '·', 'Feedback']]);
  });
});

describe('AppComponent: nobody signed in', () => {
  const realFetch = globalThis.fetch;

  afterEach(() => {
    globalThis.fetch = realFetch;
    localStorage.removeItem(KEY);
    vi.restoreAllMocks();
  });

  it('on the way to the IAM (the guard sends every page there): nothing of the app, and no Sign in card either', async () => {
    const el = await draw([], 0, false);
    expect(TestBed.inject(AuthService).state()).toBe('signed-out');
    expect(el.querySelector('#signin')).toBeNull();
    expect(el.querySelector('router-outlet')).toBeNull();
    expect(links(el)).toEqual([]);
  });

  it('a session that ends while the page is open (a sign-out in another tab): the Sign in card stands in for the app', async () => {
    const el = await draw();
    expect(el.querySelector('router-outlet')).not.toBeNull();
    localStorage.removeItem(KEY);
    window.dispatchEvent(new StorageEvent('storage', { key: KEY }));
    await TestBed.inject(ApplicationRef).whenStable();
    expect(el.querySelector('#signin')).not.toBeNull();
    expect(el.querySelector('router-outlet')).toBeNull();
    expect(links(el), 'nothing to follow that would load data').toEqual([]);
  });

  it('a sign-in that came back without one: the anotoki library’s screen says why, so the browser does not go round to the IAM and back for ever', async () => {
    const el = await draw([refusedSignIn('access_denied')], 0, false);
    expect(TestBed.inject(AuthService).state()).toBe('signed-out');
    const failure = await failureShown(el);
    expect(failure?.tagName.toLowerCase(), 'in the page’s landmark').toBe('main');
    expect(failure?.querySelector('anotoki-sign-in-failure-route anotoki-sign-in-failure'), 'the screen, loaded into the library’s route').not.toBeNull();
    expect(words(failure?.querySelector('.anotoki-sign-in-failure__title'))).toBe('Signing in did not work');
    expect(failure?.querySelector('.anotoki-sign-in-failure__message')?.getAttribute('role')).toBe('alert');
    expect(failure?.querySelector('[data-retry]')).not.toBeNull();
    expect(el.querySelector('#signin'), 'not the Sign in card').toBeNull();
  });

  it('nobody signed in where sign-in is not required: the app itself, for a visitor — its sections, and Sign in in the bar; no card', async () => {
    const el = await draw([], 0, false, { loginRequired: false });
    expect(TestBed.inject(AuthService).state()).toBe('visiting');
    expect(el.querySelector('router-outlet')).not.toBeNull();
    expect(el.querySelector('#signin')).toBeNull();
    expect(links(el)).toEqual(['Kanji', 'Exam']);
    expect(el.querySelector('app-top-bar button.anotoki-top-bar__sign-in')).not.toBeNull();
    expect(el.querySelector('#signInFailure')).toBeNull();
  });

  it('visiting after a sign-in that came back without one (access_denied: the IAM turned the account away): the library’s screen in the place of the page, until Back — never swallowed', async () => {
    const el = await draw([refusedSignIn('access_denied')], 0, false, { loginRequired: false });
    expect(TestBed.inject(AuthService).state()).toBe('visiting');
    const failure = await failureShown(el);
    expect(words(failure?.querySelector('.anotoki-sign-in-failure__message'))).toBe('The sign-in was not completed.');
    expect(el.querySelector('router-outlet'), 'the screen in the place of the page').toBeNull();
    el.querySelector<HTMLButtonElement>('[data-back]')!.click();
    await TestBed.inject(ApplicationRef).whenStable();
    expect(el.querySelector('#signInFailure')).toBeNull();
    expect(el.querySelector('router-outlet'), 'and the page, for a visitor').not.toBeNull();
  });

  it('a legal page (Terms, Privacy, Contact) is anybody’s: signed out, it is drawn in the page’s place - Sign in in the bar, no card -, and any other page is not (on the way to the IAM)', async () => {
    const el = await draw([], 0, false);
    const router = TestBed.inject(Router);
    for (const path of ['/terms', '/privacy', '/contact']) {
      await router.navigateByUrl(path);
      await settle();
      expect(el.querySelector('#a-page'), path).not.toBeNull();
      expect(el.querySelector('#signin'), ).toBeNull();
      expect(el.querySelector('app-top-bar button.anotoki-top-bar__sign-in'), ).not.toBeNull();
      expect(links(el), ).toEqual([]);
    }
    await router.navigateByUrl('/kanji');
    await settle();
    expect(el.querySelector('#a-page'), 'any other page: nothing drawn').toBeNull();
    expect(el.querySelector('app-top-bar button.anotoki-top-bar__sign-in')).toBeNull();
  });

  it('visiting with a failed sign-in standing: a legal page is drawn all the same, the failure’s screen back on any other page', async () => {
    const el = await draw([refusedSignIn('access_denied')], 0, false, { loginRequired: false });
    expect(await failureShown(el)).not.toBeNull();
    await TestBed.inject(Router).navigateByUrl('/privacy');
    await settle();
    expect([el.querySelector('#a-page') !== null, el.querySelector('#signInFailure')]).toEqual([true, null]);
    await TestBed.inject(Router).navigateByUrl('/exam');
    await settle();
    expect(el.querySelector('#signInFailure')).not.toBeNull();
  });

  it('signed in after all - in another tab - while the failure is said: it is put away, and the app is theirs', async () => {
    const el = await draw([refusedSignIn('access_denied')], 0, false);
    expect(el.querySelector('#signInFailure')).not.toBeNull();
    refusedClient?.signIn({ sub: '7' });
    await settle();
    await settle();
    const auth = TestBed.inject(AuthService);
    expect([auth.state(), auth.signInError()]).toEqual(['ready', null]);
    expect(el.querySelector('#signInFailure')).toBeNull();
    expect(el.querySelector('router-outlet')).not.toBeNull();
  });
});
