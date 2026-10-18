import { provideZonelessChangeDetection, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { SiteStatus } from '@anotoki/lib/migrations';
import { ANOTOKI_TRANSLATIONS_CONFIG, AnotokiTranslationsConfig, BundleRefusal, TranslationBundle, TranslationService } from '@anotoki/lib/translations';
import { TEST_LANGUAGES } from '@anotoki/lib/translations/testing';
import { AppState, AuthService } from '../auth/auth.service';
import { AnotokiUser } from '@anotoki/lib/auth';
import { provideTestSiteStatus } from '../testing/site-status';
import { ADMIN_DRAFTS_KEY, BundleRefused, bundleRefused, fetchBundle, LANGUAGE_CACHE_KEY, LANGUAGE_KEY, provideTranslations, wordsCanBeAsked } from './translations.config';

const EN_BUNDLE: TranslationBundle = { language: 'en', languages: TEST_LANGUAGES, values: { 'topbar.exam': 'Exam' } };
const SK_BUNDLE: TranslationBundle = { language: 'sk', languages: TEST_LANGUAGES, values: { 'topbar.exam': 'Skúška' }, english: { 'topbar.exam': 'Exam' } };

function json(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
}

/** AuthService as the translations read it: who is there, what they may do, and the two ways the start can stop. */
function authStub(state: AppState = 'ready', roles: string[] = []) {
  const user = signal<AnotokiUser | null>(null);
  return {
    state: signal<AppState>(state),
    user,
    preferences: () => user()?.preferences ?? null,
    savePreferences: vi.fn(() => Promise.resolve({ locale: null, preferences: null })),
    subject: () => user()?.sub ?? null,
    isStaff: () => roles.includes('ADMIN') || roles.includes('EDITOR'),
    isAdmin: () => roles.includes('ADMIN'),
    notSetUp: vi.fn(),
    cannotStart: vi.fn(),
  };
}

/** A refusal of the words as the anotoki library hands it to the site. */
function refusal(status: number, body: unknown, starting = true, hasWords = false): BundleRefusal {
  return { status, body, error: new BundleRefused(status, body), starting, hasWords };
}

describe('the app’s words through the anotoki library (core/i18n/translations.config.ts)', () => {
  const realFetch = globalThis.fetch;
  let auth: ReturnType<typeof authStub>;

  function configure(state: AppState = 'ready', roles: string[] = []): void {
    auth = authStub(state, roles);
    TestBed.configureTestingModule({
      providers: [provideZonelessChangeDetection(), provideTestSiteStatus(), provideTranslations(), { provide: AuthService, useValue: auth }],
    });
  }

  beforeEach(() => {
    localStorage.clear();
    sessionStorage.clear();
  });

  afterEach(() => {
    globalThis.fetch = realFetch;
    localStorage.clear();
    sessionStorage.clear();
    vi.restoreAllMocks();
  });

  it('keeps a choice and the words under the names this app always had: a visitor’s language survives the upgrade', async () => {
    configure('visiting');
    const asked: string[] = [];
    globalThis.fetch = vi.fn((input: RequestInfo | URL) => {
      const url = String(input);
      asked.push(url);
      return Promise.resolve(json(200, url.endsWith('/sk') ? SK_BUNDLE : EN_BUNDLE));
    }) as unknown as typeof fetch;
    const i18n = TestBed.inject(TranslationService);

    expect(await i18n.setLanguage('sk')).toBe(true);
    expect(i18n.t('topbar.exam')).toBe('Skúška');
    expect(localStorage.getItem('academy-language')).toBe('sk');
    expect(JSON.parse(localStorage.getItem('academy-language-cache') ?? '{}').language).toBe('sk');
    expect([LANGUAGE_KEY, LANGUAGE_CACHE_KEY, ADMIN_DRAFTS_KEY]).toEqual(['academy-language', 'academy-language-cache', 'academy-admin-drafts']);
    expect(asked).toEqual(['/api/translations/sk']);
  });

  it('a returning visitor’s choice, kept by the app before the library: the start asks for that language', async () => {
    localStorage.setItem('academy-language', 'sk');
    configure('visiting');
    const asked: string[] = [];
    globalThis.fetch = vi.fn((input: RequestInfo | URL) => {
      asked.push(String(input));
      return Promise.resolve(json(200, SK_BUNDLE));
    }) as unknown as typeof fetch;
    const i18n = TestBed.inject(TranslationService);
    await i18n.init();
    expect(asked[0]).toBe('/api/translations/sk');
    expect([i18n.language(), i18n.t('topbar.exam')]).toEqual(['sk', 'Skúška']);
  });

  it('fetchBundle(): plain fetch() with the reader’s time zone and no token; an answer that is not 2xx is a BundleRefused with what the server said', async () => {
    const calls: [string, RequestInit | undefined][] = [];
    globalThis.fetch = vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
      calls.push([String(input), init]);
      return Promise.resolve(String(input).endsWith('/sk') ? json(200, SK_BUNDLE) : json(503, { error: 'The words are not in the database yet.', code: 'translations_unavailable' }));
    }) as unknown as typeof fetch;

    await expect(fetchBundle('sk')).resolves.toEqual(SK_BUNDLE);
    const headers = calls[0][1]?.headers as Record<string, string>;
    expect(calls[0][0]).toBe('/api/translations/sk');
    expect(headers['Accept']).toBe('application/json');
    expect(
      Object.keys(headers).some((name) => name.toLowerCase() === 'authorization'),
      'the words are the same for everybody',
    ).toBe(false);

    const refused = await fetchBundle('en-gb').catch((error: unknown) => error);
    expect(refused).toBeInstanceOf(BundleRefused);
    expect([(refused as BundleRefused).status, (refused as BundleRefused).body]).toEqual([503, { error: 'The words are not in the database yet.', code: 'translations_unavailable' }]);
    expect(calls[1][0], 'the code goes into the address encoded').toBe('/api/translations/en-gb');
  });

  it('a refused bundle: not set up stops the app; an update waiting tells SiteStatus; any other 503 at the start is the problem page - never with words in memory, never once the site is not ready', () => {
    configure();
    const site = TestBed.inject(SiteStatus);
    const words = () => auth as unknown as AuthService;
    const status = () => site;

    bundleRefused(refusal(404, { code: 'not_found' }), words, status);
    expect([auth.notSetUp.mock.calls.length, auth.cannotStart.mock.calls.length]).toEqual([0, 0]);

    bundleRefused(refusal(503, { code: 'translations_unavailable', error: 'The words are not in the database yet.' }, true, false), words, status);
    expect(auth.cannotStart).toHaveBeenCalledWith({ kind: 'server', status: 503, code: 'translations_unavailable', detail: null });

    auth.cannotStart.mockClear();
    bundleRefused(refusal(503, { code: 'translations_unavailable' }, false, true), words, status);
    expect(auth.cannotStart, 'a choice of language later: just fails, the page stays').not.toHaveBeenCalled();

    bundleRefused(refusal(503, { code: 'database_unavailable', detail: 'connection refused' }, false, false), words, status);
    expect(auth.cannotStart, 'no words in memory: the problem page').toHaveBeenCalledWith({ kind: 'server', status: 503, code: 'database_unavailable', detail: 'connection refused' });

    auth.cannotStart.mockClear();
    bundleRefused(refusal(503, { code: 'update_pending', message: 'The site is being updated.' }), words, status);
    expect(site.state()).toBe('update-pending');
    bundleRefused(refusal(503, { code: 'translations_unavailable' }), words, status);
    expect(auth.cannotStart, 'the library’s page stands in already').not.toHaveBeenCalled();

    bundleRefused(refusal(503, { code: 'not_set_up', installed: true }), words, status);
    expect(auth.notSetUp).toHaveBeenCalledWith(true);
  });

  it('the words are asked for only while the app itself, or its Sign in card, is shown', () => {
    const asks = (['starting', 'ready', 'visiting', 'signed-out', 'not-set-up', 'problem'] as AppState[]).map((state) => wordsCanBeAsked({ state: () => state } as unknown as AuthService));
    expect(asks).toEqual([false, true, true, true, false, false]);
  });

  it('the admin panel’s pages: Translations for the editors and the administrators, Languages for the administrators; a language deleted names the copy the server kept', () => {
    configure('ready', ['EDITOR']);
    const config = TestBed.inject(ANOTOKI_TRANSLATIONS_CONFIG) as AnotokiTranslationsConfig;
    const admin = config.admin!;
    expect([admin.allows!.strings!(), admin.allows!.languages!()]).toEqual([true, false]);
    expect(admin.routes).toEqual({ translations: '/admin/translations', languages: '/admin/languages', migrations: '/admin/migrations' });
    expect(config.libraryWords).toEqual({ en: { 'anotoki.topbar.sections': 'The app’s sections', 'anotoki.theme.auto': 'System' } });

    const slovak = { code: 'sk', name: 'Slovak', native_name: 'Slovenčina', enabled: true, sort_order: 1, seeded: true, strings: 420 };
    const czech = { ...slovak, code: 'cs', name: 'Czech', native_name: 'Čeština', seeded: false, strings: 0 };
    expect(admin.languageNotes!.beforeDelete!(slovak)).toBe('Only the copy of them the server keeps first, in backups/, still holds them.');
    expect(admin.languageNotes!.beforeDelete!(czech)).toBeNull();
    expect(admin.languageNotes!.afterDelete!(slovak, { strings: 420, copy: 'academy-before-language-delete-sk-20261011-101500-000.json' })).toBe(
      'A copy of its strings is in backups/academy-before-language-delete-sk-20261011-101500-000.json.',
    );
    expect(admin.languageNotes!.afterDelete!(czech, { strings: 0 })).toBeNull();
  });
});
