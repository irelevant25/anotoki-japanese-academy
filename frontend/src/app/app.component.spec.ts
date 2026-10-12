import { ApplicationRef, ChangeDetectionStrategy, Component, EnvironmentProviders, OnDestroy, Provider, provideZonelessChangeDetection, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter, Router, Routes } from '@angular/router';
import { ANOTOKI_AUTH_CLIENT_FACTORY, AnotokiAuthEnvironment, AnotokiAuthOptions } from '@anotoki/lib/auth';
import { FakeAuthClient } from '@anotoki/lib/auth/testing';
import { SiteStatus } from '@anotoki/lib/migrations';
import { TranslationService } from '@anotoki/lib/translations';
import { provideTestTranslations } from '@anotoki/lib/translations/testing';
import { AppComponent } from './app.component';
import { provideAuth } from './core/auth/auth.config';
import { AuthService } from './core/auth/auth.service';
import { ChangelogService } from './core/changelog/changelog.service';
import { provideFeedback } from './core/feedback.config';
import { provideKit } from './core/kit.config';
import { provideKitEnglish } from './core/testing/kit-english';
import { provideTestSiteStatus } from './core/testing/site-status';
import { KanjiStateService } from './kanji/kanji-state.service';

const ENGLISH = { 'topbar.exam': 'Exam', 'anotoki.language.button': 'Language: {name} ({code})' };
const SLOVAK = { 'topbar.exam': 'Skúška', 'anotoki.language.button': 'Jazyk: {name} ({code})' };

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
    user: { sub: '7', preferred_username: 'hana', email: null, email_verified: false, locale: null, roles },
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
  TestBed.inject(ChangelogService).load = () => Promise.resolve(); // no version button: it has a spec of its own
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

describe('AppComponent: the bar above, the foot below — in every state', () => {
  const realFetch = globalThis.fetch;

  afterEach(() => {
    globalThis.fetch = realFetch;
    localStorage.removeItem(KEY);
    vi.restoreAllMocks();
  });

  it('with no strings (the bar is drawn whatever became of them): the English it keeps — never a key', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const el = await draw();
    expect(el.firstElementChild?.tagName.toLowerCase(), 'the bar first').toBe('app-top-bar');
    expect(Array.from(el.children, (child) => child.tagName.toLowerCase()), 'the bar first, the foot last - then the kit’s question, drawn only when asked').toEqual([
      'app-top-bar',
      'anotoki-site-gate',
      'footer',
      'anotoki-confirm-host',
    ]);
    expect(el.querySelector('footer app-version')).not.toBeNull();
    expect(links(el)).toEqual(['Kanji', 'Exam']);
    expect(el.querySelector('app-top-bar a[href="/exam"]'), 'the link the browser suites click').not.toBeNull();
    expect(Array.from(el.querySelectorAll('anotoki-brand .anotoki-brand__wordmark > span')).map((span) => span.textContent)).toEqual(['anotoki', 'Japanese']);
    expect(warn).not.toHaveBeenCalled();
  });

  it('in the language on the page: the exam is worded, the term “Kanji” and the app’s name are what they are everywhere', async () => {
    const el = await draw([provideTestTranslations(SLOVAK, { language: 'sk', english: ENGLISH })], 125);
    expect(links(el)).toEqual(['Kanji 125', 'Skúška']);
    expect(el.querySelector('app-top-bar nav.anotoki-top-bar__nav .anotoki-top-bar__badge')?.textContent?.trim()).toBe('125');

    await TestBed.inject(TranslationService).setLanguage('en', { remember: false });
    await TestBed.inject(ApplicationRef).whenStable();
    expect(links(el)).toEqual(['Kanji 125', 'Exam']);
  });

  it('the sections show only while the app can be used: a copy that is not set up has the bar, the foot and the library’s page — never installed, with the way to the setup page', async () => {
    const el = await draw();
    TestBed.inject(AuthService).notSetUp(false);
    await settle();
    expect(links(el)).toEqual([]);
    expect(words(el.querySelector('anotoki-site-status h1'))).toBe('This site is not set up yet');
    expect(el.querySelector('anotoki-site-status a[href="/setup.php"]')?.textContent?.trim()).toBe('Open the setup page');
    expect(el.querySelector('router-outlet')).toBeNull();
    expect(el.querySelector('app-top-bar anotoki-brand')).not.toBeNull();
    expect(el.querySelector('footer app-version')).not.toBeNull();
  });

  it('a site that was installed once and lost its settings: “not available right now” — never the setup page', async () => {
    const el = await draw();
    TestBed.inject(AuthService).notSetUp(true);
    await settle();
    expect(words(el.querySelector('anotoki-site-status h1'))).toBe('The site is not available right now');
    expect(el.querySelector('anotoki-site-status a[href="/setup.php"]')).toBeNull();
    expect(words(el.querySelector('anotoki-site-status')).includes('setup'), words(el.querySelector('anotoki-site-status'))).toBe(false);
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
      TestBed.resetTestingModule();
      localStorage.removeItem(KEY);
    }
  });

  it('the site’s ADMIN: “A database update is waiting”, and the way to the Migrations page - which opens, alone of the app’s pages', async () => {
    const el = await draw([], 0, true, {}, ['ADMIN']);
    await TestBed.inject(Router).navigateByUrl('/kanji');
    TestBed.inject(SiteStatus).report('update_pending');
    await settle();
    expect(statusPage(el).title).toBe('A database update is waiting');
    expect(statusPage(el).actions).toEqual(['Open Migrations']);
    expect(el.querySelector('#a-page')).toBeNull();

    el.querySelector<HTMLAnchorElement>('anotoki-site-status a')!.click();
    await vi.waitFor(async () => {
      await settle();
      expect(el.querySelector('#the-migrations-page')).not.toBeNull();
    });
    expect(TestBed.inject(Router).url).toBe('/admin/migrations');
    expect(el.querySelector('anotoki-site-status')).toBeNull();

    // Anywhere else, the page again.
    await TestBed.inject(Router).navigateByUrl('/exam');
    await settle();
    expect(statusPage(el).title).toBe('A database update is waiting');
    expect(el.querySelector('#a-page')).toBeNull();
  });

  it('the pages are the gate’s template: none runs behind the library’s page - the one open when an update stops the site is taken down, none is made while it waits, and the page is made again once the site is back', async () => {
    const el = await draw();
    expect(el.querySelector('#a-page')).not.toBeNull();
    const { made, alive } = pages;

    TestBed.inject(SiteStatus).report('update_pending');
    await settle();
    expect(statusPage(el).title).toBe('The site is being updated');
    expect([el.querySelector('#a-page'), el.querySelector('router-outlet'), pages.alive], 'taken down, its outlet with it').toEqual([null, null, alive - 1]);

    // Addresses followed while it waits (Back, Forward): the router goes on, and makes no page.
    const router = TestBed.inject(Router);
    await router.navigateByUrl('/admin/migrations');
    await router.navigateByUrl('/exam');
    await settle();
    expect([pages.made, pages.alive], 'nothing made behind the library’s page').toEqual([made, alive - 1]);

    TestBed.inject(SiteStatus).markReady();
    await settle();
    expect(el.querySelector('#a-page')).not.toBeNull();
    expect([pages.made, pages.alive], 'the page of the address, made again').toEqual([made + 1, alive]);
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
