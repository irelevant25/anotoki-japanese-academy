import { provideHttpClient, withFetch, withInterceptors } from '@angular/common/http';
import { provideZonelessChangeDetection, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { Title } from '@angular/platform-browser';
import { Router, Routes, TitleStrategy, provideRouter } from '@angular/router';
import { SiteStatus, siteStatusInterceptor } from '@anotoki/lib/migrations';
import { TranslatePipe, TranslationBundle, TranslationService } from '@anotoki/lib/translations';
import { TEST_LANGUAGES, provideTestTranslations } from '@anotoki/lib/translations/testing';
import { keptWord } from '../standin/kept-word';
import { ApiService } from './api/api.service';
import { VisitorMove } from './api/api.types';
import { AuthService } from './auth/auth.service';
import { MOVE_AT_START_MS, VISITOR_STORAGE_KEY } from './auth/visitor-key';
import { boot } from './boot';
import { AcademyTitleStrategy } from './i18n/title.strategy';
import { LANGUAGE_CACHE_KEY, LANGUAGE_KEY, provideTranslations } from './i18n/translations.config';
import { provideSiteStatus } from './site-status.config';
import { provideTestSiteStatus } from './testing/site-status';
import { provideAuth } from './auth/auth.config';

const ENGLISH = {
  'title.exam': 'Exam',
  'topbar.exam': 'Exam',
  'signIn.button': 'Sign in',
};
const SLOVAK = {
  'title.exam': 'Skúška',
  'topbar.exam': 'Skúška',
  'signIn.button': 'Prihlásiť sa',
};
const EN_BUNDLE: TranslationBundle = { language: 'en', languages: TEST_LANGUAGES, values: ENGLISH };
const SK_BUNDLE: TranslationBundle = { language: 'sk', languages: TEST_LANGUAGES, values: SLOVAK, english: ENGLISH };

function json(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
}

/** Where the site stands, as GET /api/site-status answers (the anotoki library's): ready, unless a test says otherwise. */
const READY: [number, unknown] = [200, { state: 'ready', installed: false }];

/**
 * The server, for the three addresses the start asks: where the site stands
 * (the anotoki library's status, through HttpClient's fetch), how this copy
 * signs people in, and the app's words. Returns the addresses asked, in order.
 */
function serve(config: [number, unknown], translations: (code: string) => [number, unknown], status: [number, unknown] = READY): string[] {
  const asked: string[] = [];
  globalThis.fetch = vi.fn((input: RequestInfo | URL) => {
    const url = input instanceof Request ? new URL(input.url).pathname : String(input);
    asked.push(url);
    if (url === '/api/site-status') {
      return Promise.resolve(json(...status));
    }
    if (url === '/api/auth/config') {
      return Promise.resolve(json(...config));
    }
    if (url.startsWith('/api/translations/')) {
      return Promise.resolve(json(...translations(url.slice('/api/translations/'.length))));
    }
    return Promise.reject(new TypeError(`not asked for in this test: ${url}`));
  }) as unknown as typeof fetch;
  return asked;
}

const words = (code: string): [number, unknown] => [200, code === 'sk' ? SK_BUNDLE : EN_BUNDLE];

/** The sign-in's settings of a copy whose client id is these tests' own (their storage listeners stay on the window). */
const CONFIG = { issuer: 'https://iam.test', clientId: 'academy-test-boot' };
const CONFIG_KEY = `anotoki-auth:${CONFIG.clientId}`;

/** A signed-in session as the SDK keeps it, for IAM user `sub`, whose account reads `locale`. */
function session(sub: string, locale: string | null): string {
  return JSON.stringify({
    access_token: `token-of-${sub}`,
    access_expires_at: Date.now() + 3_600_000,
    refresh_token: `refresh-of-${sub}`,
    id_token: null,
    user: { sub, preferred_username: `user-${sub}`, email: null, email_verified: false, locale, roles: [] },
    updated_at: Date.now(),
  });
}

describe('boot(): the whole start', () => {
  const realFetch = globalThis.fetch;
  let warn: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    localStorage.clear();
    sessionStorage.clear();
    history.replaceState(null, '', '/');
    vi.spyOn(window.navigator, 'languages', 'get').mockReturnValue(['en-GB']);
    warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    TestBed.configureTestingModule({
      providers: [
        provideZonelessChangeDetection(),
        provideAuth(),
        TranslatePipe,
        // as app.config.ts has them - on fetch(), so that serve() answers where the site stands too
        provideHttpClient(withFetch(), withInterceptors([siteStatusInterceptor])),
        provideSiteStatus(),
        provideTranslations(),
      ],
    });
  });

  afterEach(() => {
    globalThis.fetch = realFetch;
    vi.restoreAllMocks();
  });

  it('asks where the site stands first, then where the IAM is, then for the words — which need to know what the app can show', async () => {
    localStorage.setItem(CONFIG_KEY, session('7', null));
    const asked = serve([200, CONFIG], words);
    await TestBed.runInInjectionContext(boot);

    expect(asked).toEqual(['/api/site-status', '/api/auth/config', '/api/translations/en-gb']);
    expect(TestBed.inject(SiteStatus).state()).toBe('ready');
    expect(TestBed.inject(AuthService).state()).toBe('ready');
    expect(TestBed.inject(TranslationService).ready()).toBe(true);
    expect(TestBed.inject(TranslationService).t('title.exam')).toBe('Exam');
  });

  it('takes ?lang= out of the address before the router reads it, and starts in that language', async () => {
    history.replaceState(null, '', '/exam?lang=sk');
    const asked = serve([200, CONFIG], words);
    await TestBed.runInInjectionContext(boot);

    expect(asked).toEqual(['/api/site-status', '/api/auth/config', '/api/translations/sk']);
    expect(location.pathname + location.search).toBe('/exam');
    expect(TestBed.inject(TranslationService).t('title.exam')).toBe('Skúška');
    // A link somebody followed is not a choice they made: this tab only.
    expect(sessionStorage.getItem(LANGUAGE_KEY)).toBe('sk');
    expect(localStorage.getItem(LANGUAGE_KEY)).toBeNull();
  });

  it('a copy that is not set up: nothing of the app starts, nothing more asked for — the library’s page says so, in its own words', async () => {
    const asked = serve([200, CONFIG], words, [200, { state: 'not_set_up', installed: false }]);
    await TestBed.runInInjectionContext(boot);

    expect(asked).toEqual(['/api/site-status']);
    expect(TestBed.inject(AuthService).state()).toBe('not-set-up');
    const site = TestBed.inject(SiteStatus);
    expect([site.state(), site.installed()]).toEqual(['not-set-up', false]);
    const i18n = TestBed.inject(TranslationService);
    expect(i18n.ready()).toBe(false);
    expect(keptWord(i18n, 'signIn.button', 'Sign in')).toBe('Sign in');
    expect(warn).not.toHaveBeenCalled();
  });

  it('a server that does not answer: nothing of the app starts — the library’s “not available” page, which asks again by itself; the words the browser kept from an earlier visit', async () => {
    localStorage.setItem(LANGUAGE_CACHE_KEY, JSON.stringify(SK_BUNDLE));
    globalThis.fetch = vi.fn(() => Promise.reject(new TypeError('Failed to fetch'))) as unknown as typeof fetch;
    await TestBed.runInInjectionContext(boot);

    expect(TestBed.inject(SiteStatus).state()).toBe('unavailable');
    expect(globalThis.fetch).toHaveBeenCalledTimes(1);
    const auth = TestBed.inject(AuthService);
    expect([auth.state(), auth.problem()]).toEqual(['starting', null]);
    const i18n = TestBed.inject(TranslationService);
    expect(i18n.language()).toBe('sk');
    expect(keptWord(i18n, 'signIn.button', 'Sign in')).toBe('Prihlásiť sa');
  });

  it('a database that does not answer: the same, and nothing else asked of the server', async () => {
    const asked = serve([200, CONFIG], words, [200, { state: 'unavailable', installed: true }]);
    await TestBed.runInInjectionContext(boot);
    expect(asked).toEqual(['/api/site-status']);
    expect([TestBed.inject(SiteStatus).state(), TestBed.inject(AuthService).state()]).toEqual(['unavailable', 'starting']);
  });

  it('an update waits: the start goes on as ever — how to sign in and the words answer — so a signed-out administrator can sign in; never the problem page', async () => {
    const clientId = 'academy-test-boot-update';
    localStorage.removeItem(`anotoki-auth:${clientId}`);
    const asked = serve([200, { issuer: 'https://iam.test', clientId }], words, [200, { state: 'update_pending', installed: true }]);
    await TestBed.runInInjectionContext(boot);

    expect(asked).toEqual(['/api/site-status', '/api/auth/config', '/api/translations/en-gb']);
    expect(TestBed.inject(SiteStatus).state()).toBe('update-pending');
    const auth = TestBed.inject(AuthService);
    expect([auth.state(), auth.problem()], 'signed out, the sign-in set up: the router starts, and the gate’s page has its Sign in').toEqual(['signed-out', null]);
    expect(TestBed.inject(TranslationService).ready()).toBe(true);
  });

  for (const refusal of [
    { error: 'The words are not in the database yet. An administrator applies the waiting database update on the Migrations page.', code: 'translations_unavailable' },
    { code: 'update_pending', message: 'The site is being updated. Try again in a few minutes.' },
  ]) {
    it(`an update waits and the words answer 503 ${refusal.code} (their tables may be what it brings): no problem page either`, async () => {
      localStorage.setItem(CONFIG_KEY, session('7', null));
      serve([200, CONFIG], () => [503, refusal], [200, { state: 'update_pending', installed: true }]);
      await TestBed.runInInjectionContext(boot);
      const auth = TestBed.inject(AuthService);
      expect([auth.state(), auth.problem()]).toEqual(['ready', null]);
      expect(TestBed.inject(SiteStatus).state()).toBe('update-pending');
      expect(TestBed.inject(TranslationService).ready()).toBe(false);
    });
  }

  it('the words answered 503 not_set_up (the settings gone since the start asked): the app is not set up after all', async () => {
    serve([200, CONFIG], () => [503, { code: 'not_set_up', installed: true, message: 'The site is not available right now. Try again in a few minutes.' }]);
    await TestBed.runInInjectionContext(boot);

    expect(TestBed.inject(AuthService).state()).toBe('not-set-up');
    const site = TestBed.inject(SiteStatus);
    expect([site.state(), site.installed()], 'installed once: never the setup page').toEqual(['not-set-up', true]);
  });

  it('the words answered any other 503 while the site is ready (an upload still arriving, a database out of reach): the problem page, with the server’s reason', async () => {
    const asked = serve([200, CONFIG], () => [
      503,
      { error: 'The words are not in the database yet. An administrator applies the waiting database update on the Migrations page.', code: 'translations_unavailable' },
    ]);
    await TestBed.runInInjectionContext(boot);

    const auth = TestBed.inject(AuthService);
    expect(auth.state()).toBe('problem');
    expect(auth.problem()).toEqual({ kind: 'server', status: 503, code: 'translations_unavailable', detail: null });
    // The anotoki library asks once more, half a second later, as after any first answer lost; the same answer changes nothing.
    expect(asked.filter((url) => url.startsWith('/api/translations/'))).toEqual(['/api/translations/en-gb', '/api/translations/en-gb']);
  });

  it('the words answered 503 database_unavailable (the upkeep before them could not reach the database): the problem page, with its reason', async () => {
    serve([200, CONFIG], () => [503, { error: 'The database is not reachable: connection refused', code: 'database_unavailable', detail: 'connection refused' }]);
    await TestBed.runInInjectionContext(boot);

    const auth = TestBed.inject(AuthService);
    expect(auth.problem()).toEqual({ kind: 'server', status: 503, code: 'database_unavailable', detail: 'connection refused' });
  });

  it('signed out, the words are asked for all the same; somebody signing in in another tab then finds words, never keys', async () => {
    const clientId = 'academy-test-boot-words';
    const key = `anotoki-auth:${clientId}`;
    const asked = serve([200, { issuer: 'https://iam.test', clientId }], words);
    await TestBed.runInInjectionContext(boot);

    const auth = TestBed.inject(AuthService);
    const i18n = TestBed.inject(TranslationService);
    const pipe = TestBed.inject(TranslatePipe);
    expect(auth.state()).toBe('signed-out');
    expect(asked).toEqual(['/api/site-status', '/api/auth/config', '/api/translations/en-gb']);
    expect(i18n.ready()).toBe(true);
    // What the Sign in page and the top bar draw: a kept word, and a key through the pipe.
    expect(keptWord(i18n, 'signIn.button', 'Sign in')).toBe('Sign in');
    expect(pipe.transform('topbar.exam')).toBe('Exam');

    // Another tab signs in — as somebody whose account reads Slovak: the app, with no page load.
    localStorage.setItem(key, session('8', 'sk'));
    window.dispatchEvent(new StorageEvent('storage', { key }));
    expect(auth.state()).toBe('ready');
    expect(pipe.transform('topbar.exam'), 'words at once: the bundle was in memory').toBe('Exam');

    // The token's language is followed, without a page load and without being stored.
    await vi.waitFor(() => {
      TestBed.tick();
      expect(pipe.transform('topbar.exam')).toBe('Skúška');
    });
    expect(i18n.language()).toBe('sk');
    expect(asked).toEqual(['/api/site-status', '/api/auth/config', '/api/translations/en-gb', '/api/translations/sk']);
    expect(localStorage.getItem(LANGUAGE_KEY)).toBeNull();
    expect(warn, 'no key was ever drawn').not.toHaveBeenCalled();
    localStorage.removeItem(key);
  });

  it('signed in with a visitor key held: what the visitor studied moves into the account first, then the words — the first page shows it', async () => {
    localStorage.setItem(CONFIG_KEY, session('7', null));
    localStorage.setItem(VISITOR_STORAGE_KEY, 'k'.repeat(43));
    const order: string[] = [];
    serve([200, CONFIG], (code) => (order.push('words'), words(code)));
    const moved: VisitorMove = { found: true, items: 3, kept: 0, attempts: 0, answers: 3 };
    const moveVisitor = vi.fn(async (key: string) => (order.push(`move ${key}`), moved));
    TestBed.overrideProvider(ApiService, { useValue: { moveVisitor } });
    await TestBed.runInInjectionContext(boot);

    expect(order).toEqual([`move ${'k'.repeat(43)}`, 'words']);
    expect(localStorage.getItem(VISITOR_STORAGE_KEY)).toBeNull();
    expect(TestBed.inject(AuthService).state()).toBe('ready');
  });

  it('a move that does not answer holds the start a few seconds at most; the key stays for it to finish', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    try {
      localStorage.setItem(CONFIG_KEY, session('7', null));
      localStorage.setItem(VISITOR_STORAGE_KEY, 'k'.repeat(43));
      const asked = serve([200, CONFIG], words);
      TestBed.overrideProvider(ApiService, { useValue: { moveVisitor: () => new Promise<VisitorMove>(() => undefined) } });
      let started = false;
      void TestBed.runInInjectionContext(boot).then(() => (started = true));
      await vi.advanceTimersByTimeAsync(MOVE_AT_START_MS - 100);
      expect([started, asked]).toEqual([false, ['/api/site-status', '/api/auth/config']]);
      await vi.advanceTimersByTimeAsync(200);
      await vi.waitFor(() => expect(started).toBe(true));
      expect(asked).toEqual(['/api/site-status', '/api/auth/config', '/api/translations/en-gb']);
      expect(localStorage.getItem(VISITOR_STORAGE_KEY)).toBe('k'.repeat(43));
    } finally {
      vi.useRealTimers();
      localStorage.removeItem(VISITOR_STORAGE_KEY);
    }
  });

  it('sign-in not required and nobody signed in: visiting — the words asked for, no trip to the IAM, nothing moved', async () => {
    const clientId = 'academy-test-boot-visiting';
    localStorage.removeItem(`anotoki-auth:${clientId}`);
    const asked = serve([200, { issuer: 'https://iam.test', clientId, loginRequired: false, visitorKeepDays: 30 }], words);
    const moveVisitor = vi.fn();
    TestBed.overrideProvider(ApiService, { useValue: { moveVisitor } });
    await TestBed.runInInjectionContext(boot);

    expect(TestBed.inject(AuthService).state()).toBe('visiting');
    expect(asked).toEqual(['/api/site-status', '/api/auth/config', '/api/translations/en-gb']);
    expect(TestBed.inject(TranslationService).ready()).toBe(true);
    expect(moveVisitor).not.toHaveBeenCalled();
  });
});

/** Routes with nothing to draw: a title is all these tests read. */
const ROUTES: Routes = [
  { path: '', children: [] },
  { path: 'kanji', title: 'Kanji', children: [] },
  { path: 'exam', title: 'title.exam', children: [] },
  { path: 'translations', title: 'Translations', children: [] },
  { path: 'admin/people', title: 'People', children: [] },
  { path: 'missing', title: 'title.nothingSeeded', children: [] },
];

describe('AcademyTitleStrategy', () => {
  function title(): string {
    TestBed.tick();
    return TestBed.inject(Title).getTitle();
  }

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [
        provideZonelessChangeDetection(),
        provideAuth(),
        provideTestTranslations(SLOVAK, { language: 'sk', english: ENGLISH }),
        provideRouter(ROUTES),
        { provide: TitleStrategy, useClass: AcademyTitleStrategy },
        provideTestSiteStatus(),
      ],
    });
  });

  afterEach(() => vi.restoreAllMocks());

  it('words a title that is a key, in the language on the page, before the app’s name', async () => {
    await TestBed.inject(Router).navigateByUrl('/exam');
    expect(title()).toBe('Skúška · Japanese Academy');
  });

  it('follows the language without a navigation', async () => {
    await TestBed.inject(Router).navigateByUrl('/exam');
    expect(title()).toBe('Skúška · Japanese Academy');
    await TestBed.inject(TranslationService).setLanguage('en', { remember: false });
    expect(title()).toBe('Exam · Japanese Academy');
  });

  it('leaves a term and an admin page’s English title as they are written, the admin panel’s name after the latter', async () => {
    const router = TestBed.inject(Router);
    await router.navigateByUrl('/kanji');
    expect(title()).toBe('Kanji · Japanese Academy');
    await router.navigateByUrl('/translations');
    expect(title()).toBe('Translations · Japanese Academy');
    await router.navigateByUrl('/admin/people');
    expect(title()).toBe('People · Admin panel · Japanese Academy');
  });

  it('is the app’s name alone on the home page', async () => {
    const router = TestBed.inject(Router);
    await router.navigateByUrl('/exam');
    await router.navigateByUrl('/');
    expect(title()).toBe('Japanese Academy');
  });

  it('shows a key that has no string as itself: the owner wants to see which', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    await TestBed.inject(Router).navigateByUrl('/missing');
    expect(title()).toBe('title.nothingSeeded · Japanese Academy');
    expect(warn).toHaveBeenCalledWith("[i18n] no string for 'title.nothingSeeded'");
  });

  it('while the anotoki library’s page stands in for the page (the site being updated): the app’s name alone — then the page’s title again', async () => {
    await TestBed.inject(Router).navigateByUrl('/exam');
    expect(title()).toBe('Skúška · Japanese Academy');
    const site = TestBed.inject(SiteStatus);
    site.report('update_pending');
    expect(title()).toBe('Japanese Academy');
    site.markReady();
    expect(title()).toBe('Skúška · Japanese Academy');
  });

  it('tells the translation service where the page went after every navigation — which is when that one asks again for strings it has not', async () => {
    const noted = vi.spyOn(TestBed.inject(TranslationService), 'noteAddress');
    const router = TestBed.inject(Router);
    await router.navigateByUrl('/exam');
    await router.navigateByUrl('/kanji?x=1');
    expect(noted.mock.calls).toEqual([['/exam'], ['/kanji?x=1']]);
  });
});

describe('AcademyTitleStrategy with no strings at all', () => {
  const realFetch = globalThis.fetch;
  // The first request for the words failed: the app runs, in keys.
  const auth = { state: signal('ready'), user: signal(null), notSetUp: vi.fn(), cannotStart: vi.fn() };

  function title(): string {
    TestBed.tick();
    return TestBed.inject(Title).getTitle();
  }

  beforeEach(() => {
    localStorage.clear();
    sessionStorage.clear();
    globalThis.fetch = vi.fn(() => Promise.reject(new TypeError('Failed to fetch'))) as unknown as typeof fetch;
    TestBed.configureTestingModule({
      providers: [
        provideZonelessChangeDetection(),
        provideAuth(),
        { provide: AuthService, useValue: auth },
        provideRouter(ROUTES),
        { provide: TitleStrategy, useClass: AcademyTitleStrategy },
        provideTestSiteStatus(),
      ],
    });
  });

  afterEach(() => {
    globalThis.fetch = realFetch;
    vi.restoreAllMocks();
  });

  it('writes the app’s name alone for a title that is a key — never the key — and keeps a title that is a word', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const i18n = TestBed.inject(TranslationService);
    expect(i18n.ready()).toBe(false);

    const router = TestBed.inject(Router);
    await router.navigateByUrl('/exam');
    expect(title()).toBe('Japanese Academy');
    await router.navigateByUrl('/kanji');
    expect(title()).toBe('Kanji · Japanese Academy');
    await router.navigateByUrl('/');
    expect(title()).toBe('Japanese Academy');

    // Nothing was looked up, so nothing is complained about.
    expect(warn).not.toHaveBeenCalled();
  });
});

describe('keptWord(): a string for what is drawn while there may be no strings', () => {
  afterEach(() => vi.restoreAllMocks());

  it('is the string of the language on the page when there is one, with its placeholders filled', () => {
    TestBed.configureTestingModule({
      providers: [
        provideZonelessChangeDetection(),
        provideAuth(),
        provideTestTranslations({ 'signIn.failed': 'Prihlásenie sa nepodarilo. ({code})' }, { language: 'sk', english: { 'signIn.failed': 'Signing in did not work. ({code})' } }),
      ],
    });
    const i18n = TestBed.inject(TranslationService);
    expect(keptWord(i18n, 'signIn.failed', 'Signing in did not work. ({code})', { code: 'state_mismatch' })).toBe('Prihlásenie sa nepodarilo. (state_mismatch)');
  });

  it('is the English written in the code when there is none — filled the same way, and never the key', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    TestBed.configureTestingModule({ providers: [provideZonelessChangeDetection(), provideAuth()] });
    const i18n = TestBed.inject(TranslationService);
    expect(keptWord(i18n, 'signIn.button', 'Sign in')).toBe('Sign in');
    expect(keptWord(i18n, 'signIn.failed', 'Signing in did not work. ({code})', { code: 'state_mismatch' })).toBe('Signing in did not work. (state_mismatch)');
    expect(warn).not.toHaveBeenCalled();
  });
});
