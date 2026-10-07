import { computed, provideZonelessChangeDetection, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { SiteStatus } from '@anotoki/lib/migrations';
import { AppState, AuthService, StartProblem } from '../auth/auth.service';
import type { AnotokiPreferenceChanges, AnotokiPreferences, AnotokiSavedPreferences } from '../auth/sdk/anotoki-auth';
import { TEST_LANGUAGES, provideTestTranslations } from '../testing/test-translations';
import { TranslationBundle } from './translation.model';
import { CACHE_WAIT_MS, LANGUAGE_CACHE_KEY, LANGUAGE_KEY, RETRY_WAIT_MS, TranslationService, fillPlaceholders, languageCandidates, pickLanguage } from './translation.service';

const ENGLISH = {
  'common.close': 'Close',
  'home.hello': 'Hello {name}, you have {count}.',
  'home.by': 'Written by {name} for {site}.',
  'home.items.one': '1 item',
  'home.items.few': '{count} items',
  'home.items.other': '{count} items',
  'exam.bankQuestions.one': '1 question in the bank',
  'exam.bankQuestions.few': '{count} questions in the bank',
  'exam.bankQuestions.other': '{count} questions in the bank',
  'exam.size': 'A test of {n} questions',
  'home.onlyEnglish': 'Only in English',
  // Placeholders named like what every object inherits: filled only from what a parameter object has itself.
  'home.proto': 'x {constructor} {toString} y',
};
const SLOVAK = {
  ...ENGLISH,
  'common.close': 'Zavrieť',
  'home.hello': 'Ahoj {name}, máš {count}.',
  'home.by': 'Napísal to {name} pre {site}.',
  'home.items.one': '1 položka',
  'home.items.few': '{count} položky',
  'home.items.other': '{count} položiek',
  'exam.bankQuestions.one': '1 otázka v banke',
  'exam.bankQuestions.few': '{count} otázky v banke',
  'exam.bankQuestions.other': '{count} otázok v banke',
  'exam.size': 'Test s počtom otázok: {n}',
};

const EN_BUNDLE: TranslationBundle = { language: 'en', languages: TEST_LANGUAGES, values: ENGLISH };
const SK_BUNDLE: TranslationBundle = { language: 'sk', languages: TEST_LANGUAGES, values: SLOVAK, english: ENGLISH };

/** The no-break space Intl puts between the thousands in Slovak. */
const NBSP = ' ';

/** The server: Slovak for `sk`, English — saying so — for anything else. */
function answer(code: string): Promise<TranslationBundle> {
  return Promise.resolve(code === 'sk' ? SK_BUNDLE : EN_BUNDLE);
}

/** The Slovak bundle as it is once the owner has reworded a string. */
function reworded(close: string): TranslationBundle {
  return { ...SK_BUNDLE, values: { ...SLOVAK, 'common.close': close } };
}

/** An answer that is not the strings: the server's status and what it said. */
class Refusal {
  constructor(
    readonly status: number,
    readonly body: unknown,
  ) {}
}

const OFFLINE = new TypeError('Failed to fetch');

/** Everything already on its way has run: the answers of requests that were settled, and what follows them. */
function settled(): Promise<void> {
  return new Promise((done) => setTimeout(done));
}

/** A promise the test settles by hand: the server's answer, when the test says. */
function later<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<T>((yes, no) => {
    resolve = yes;
    reject = no;
  });
  return { promise, resolve, reject };
}

describe('languageCandidates() and pickLanguage(): which language a reader gets', () => {
  it('orders the wishes: this tab, the chooser, the token, each browser tag and its first subtag, English', () => {
    const candidates = languageCandidates({ tab: 'de', chosen: 'fr', token: 'it', browser: ['sk-SK', 'cs'] });
    expect(candidates.map((candidate) => candidate.code)).toEqual(['de', 'fr', 'it', 'sk-sk', 'sk', 'cs', 'en']);
    expect(candidates.filter((candidate) => candidate.browser).map((candidate) => candidate.code)).toEqual(['sk-sk', 'sk', 'cs']);
  });

  it('puts what this device remembered after the token when it is given as `stored` (an account that sends its preferences)', () => {
    const candidates = languageCandidates({ tab: 'de', chosen: 'fr', token: 'it', stored: 'pt', browser: ['sk-SK'] });
    expect(candidates.map((candidate) => candidate.code)).toEqual(['de', 'fr', 'it', 'pt', 'sk-sk', 'sk', 'en']);
    expect(pickLanguage(languageCandidates({ token: 'sk', stored: 'en', browser: ['en'] }), ['en', 'sk'])).toBe('sk');
    expect(pickLanguage(languageCandidates({ token: 'cs', stored: 'en', browser: ['sk'] }), ['en', 'sk']), 'an account language not on offer: the device’s').toBe('en');
  });

  it('lower-cases, and ignores whatever does not look like a language code', () => {
    const candidates = languageCandidates({ tab: 'SK', chosen: 'english', token: '../../etc', browser: ['zh-Hant-TW', 'fil', null, undefined, ''] });
    expect(candidates.map((candidate) => candidate.code)).toEqual(['sk', 'zh', 'en']);
  });

  it('takes the first wish that is on offer, and English when none is', () => {
    expect(pickLanguage(languageCandidates({ tab: 'de', chosen: 'sk', browser: ['en-GB'] }), ['en', 'sk'])).toBe('sk');
    expect(pickLanguage(languageCandidates({ tab: 'sk', chosen: 'en' }), ['en', 'sk'])).toBe('sk');
    expect(pickLanguage(languageCandidates({ token: 'sk', browser: ['en'] }), ['en', 'sk'])).toBe('sk');
    expect(pickLanguage(languageCandidates({ browser: ['de-AT', 'fr'] }), ['en', 'sk'])).toBe('en');
  });

  it('gives a Czech browser Slovak — while no Czech is on offer, and only at the browser step', () => {
    expect(pickLanguage(languageCandidates({ browser: ['cs-CZ', 'en'] }), ['en', 'sk'])).toBe('sk');
    expect(pickLanguage(languageCandidates({ browser: ['cs-CZ', 'en'] }), ['en', 'sk', 'cs'])).toBe('cs');
    expect(pickLanguage(languageCandidates({ tab: 'cs' }), ['en', 'sk'])).toBe('en');
    expect(pickLanguage(languageCandidates({ token: 'cs', browser: ['en'] }), ['en', 'sk'])).toBe('en');
    // The alias still counts for the browser when the same code was also asked for elsewhere.
    expect(pickLanguage(languageCandidates({ tab: 'cs', browser: ['cs'] }), ['en', 'sk'])).toBe('sk');
  });
});

describe('TranslationService', () => {
  const realFetch = globalThis.fetch;
  /** What GET /api/translations/{code} answers: a bundle, a Refusal, or a rejection (no answer at all). */
  const server = vi.fn<(code: string) => Promise<unknown>>();
  const state = signal<AppState>('ready');
  const user = signal<{ locale: string | null } | null>(null);
  const admin = signal(false);
  /** The account's preferences of whoever is signed in (AuthService.preferences): null — nobody, or an IAM that sends none. */
  const preferences = signal<AnotokiPreferences | null>(null);
  /** Each save to the account asked for (AuthService.savePreferences()), answered by the test. */
  let saves: { changes: AnotokiPreferenceChanges; answer: ReturnType<typeof later<AnotokiSavedPreferences>> }[] = [];
  const auth = {
    state,
    user,
    preferences,
    savePreferences: vi.fn((changes: AnotokiPreferenceChanges) => {
      const answer = later<AnotokiSavedPreferences>();
      saves.push({ changes, answer });
      return answer.promise;
    }),
    isAdmin: admin,
    notSetUp: vi.fn((installed?: boolean) => {
      void installed;
      state.set('not-set-up');
    }),
    cannotStart: vi.fn((problem: StartProblem) => {
      void problem;
      state.set('problem');
    }),
  };
  /** Where the site stands (the anotoki library's SiteStatus): what the service tells it, and whether it is not ready. */
  const siteState = signal('ready');
  const site = {
    blocked: computed(() => siteState() !== 'ready'),
    report: vi.fn((code: string) => siteState.set(code)),
  };
  let warn: ReturnType<typeof vi.spyOn>;
  let browser: ReturnType<typeof vi.spyOn>;
  let asked: string[] = [];

  function service(): TranslationService {
    return TestBed.inject(TranslationService);
  }

  function configure(): void {
    TestBed.configureTestingModule({ providers: [provideZonelessChangeDetection(), { provide: AuthService, useValue: auth }, { provide: SiteStatus, useValue: site }] });
  }

  /** The sign-in changed, in this tab or another: what follows it has run. */
  function authChanged(): void {
    TestBed.tick();
  }

  beforeEach(() => {
    localStorage.clear();
    sessionStorage.clear();
    history.replaceState(null, '', '/');
    server.mockReset().mockImplementation(answer);
    asked = [];
    // Plain fetch(), as the service makes it: the address, no token, and a minimal answer that needs no timer to be read.
    globalThis.fetch = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      asked.push(url);
      expect(new Headers(init?.headers).get('Authorization'), 'no token goes with the app’s words').toBeNull();
      const body = await server(decodeURIComponent(url.slice(url.lastIndexOf('/') + 1)));
      const refused = body instanceof Refusal;
      return { ok: !refused, status: refused ? body.status : 200, json: () => Promise.resolve(refused ? body.body : body) } as Response;
    }) as unknown as typeof fetch;
    state.set('ready');
    user.set(null);
    admin.set(false);
    preferences.set(null);
    saves = [];
    auth.savePreferences.mockClear();
    auth.notSetUp.mockClear();
    auth.cannotStart.mockClear();
    siteState.set('ready');
    site.report.mockClear();
    warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    browser = vi.spyOn(window.navigator, 'languages', 'get').mockReturnValue(['en-GB']);
    configure();
  });

  afterEach(() => {
    globalThis.fetch = realFetch;
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  describe('choosing the language as the app starts', () => {
    it('asks this site’s own address, with plain fetch()', async () => {
      await service().init();
      expect(asked).toEqual(['/api/translations/en-gb']);
    });

    it('needs one request for a Slovak browser’s first visit: the server answers a regional code by its base language', async () => {
      browser.mockReturnValue(['sk-SK', 'sk']);
      server.mockImplementation((code: string) => Promise.resolve(code === 'sk-sk' || code === 'sk' ? SK_BUNDLE : EN_BUNDLE));
      await service().init();

      expect(server.mock.calls).toEqual([['sk-sk']]);
      expect(service().language()).toBe('sk');
      expect(service().t('common.close')).toBe('Zavrieť');
      expect(JSON.parse(localStorage.getItem(LANGUAGE_CACHE_KEY) ?? '{}').language).toBe('sk');
    });

    it('asks for the first wish and, answered in English (an older server), settles on the list that came: two requests at most', async () => {
      browser.mockReturnValue(['sk-SK', 'en']);
      await service().init();

      expect(server.mock.calls).toEqual([['sk-sk'], ['sk']]);
      expect(service().language()).toBe('sk');
      expect(service().languages()).toEqual(TEST_LANGUAGES);
      expect(service().t('common.close')).toBe('Zavrieť');
    });

    it('starts in English rather than in keys when the language it settled on cannot be had', async () => {
      browser.mockReturnValue(['sk-SK']);
      server.mockResolvedValueOnce(EN_BUNDLE).mockRejectedValueOnce(OFFLINE);
      await service().init();

      expect(server.mock.calls).toEqual([['sk-sk'], ['sk']]);
      expect(service().ready()).toBe(true);
      expect(service().language()).toBe('en');
      expect(service().t('common.close')).toBe('Close');
    });

    it('needs one request when the first wish is on offer, or when nothing wished for is', async () => {
      browser.mockReturnValue(['sk']);
      await service().init();
      expect(server.mock.calls).toEqual([['sk']]);

      TestBed.resetTestingModule();
      configure();
      localStorage.clear();
      server.mockClear();
      browser.mockReturnValue(['de-DE', 'fr']);
      await service().init();
      expect(server.mock.calls).toEqual([['de-de']]);
      expect(service().language()).toBe('en');
    });

    it('gives a Czech browser Slovak', async () => {
      browser.mockReturnValue(['cs-CZ', 'cs', 'en']);
      await service().init();
      expect(service().language()).toBe('sk');
    });

    it('keeps ?lang= for this tab only, and takes it out of the address before the router reads it', async () => {
      history.replaceState(null, '', '/kanji/browse?lesson=6&lang=SK&q=a%20b#top');
      localStorage.setItem(LANGUAGE_KEY, 'en');
      await service().init();

      expect(service().language()).toBe('sk');
      expect(sessionStorage.getItem(LANGUAGE_KEY)).toBe('sk');
      expect(localStorage.getItem(LANGUAGE_KEY)).toBe('en');
      expect(location.pathname + location.search + location.hash).toBe('/kanji/browse?lesson=6&q=a%20b#top');
    });

    it('ignores a ?lang= that is not a language code: never stored, never sent — and still removed', async () => {
      history.replaceState(null, '', '/?lang=%3Cscript%3E');
      await service().init();

      expect(sessionStorage.getItem(LANGUAGE_KEY)).toBeNull();
      expect(location.search).toBe('');
      expect(server.mock.calls).toEqual([['en-gb']]);
      expect(service().language()).toBe('en');
    });

    it('keeps ?lang= and a choice for as long as the page lives where storage refuses to be written', async () => {
      vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
        throw new Error('blocked');
      });
      browser.mockReturnValue(['en']);
      history.replaceState(null, '', '/?lang=sk');
      await service().init();

      // Nothing could be kept — and the link works all the same, with the parameter gone from the address.
      expect(sessionStorage.getItem(LANGUAGE_KEY)).toBeNull();
      expect(service().language()).toBe('sk');
      expect(location.search).toBe('');

      // A choice made here outlives the link — and the next start, whatever the browser would rather read.
      browser.mockReturnValue(['sk']);
      expect(await service().setLanguage('en')).toBe(true);
      expect(localStorage.getItem(LANGUAGE_KEY)).toBeNull();
      await service().init();
      expect(service().language()).toBe('en');
    });

    it('puts this tab before the chooser, the chooser before the token, the token before the browser', async () => {
      browser.mockReturnValue(['en']);
      user.set({ locale: 'sk' });
      await service().init();
      expect(service().language()).toBe('sk');
      // Used, not stored: a change on the account page arrives with the next token.
      expect(localStorage.getItem(LANGUAGE_KEY)).toBeNull();
      expect(sessionStorage.getItem(LANGUAGE_KEY)).toBeNull();

      localStorage.setItem(LANGUAGE_KEY, 'en');
      await service().init();
      expect(service().language()).toBe('en');

      sessionStorage.setItem(LANGUAGE_KEY, 'sk');
      await service().init();
      expect(service().language()).toBe('sk');
    });

    it('adopts a changed locale of the token while nothing is stored here — without storing it', async () => {
      browser.mockReturnValue(['en']);
      await service().init();
      expect(service().language()).toBe('en');

      user.set({ locale: 'sk' });
      authChanged();
      await vi.waitFor(() => expect(service().language()).toBe('sk'));
      expect(localStorage.getItem(LANGUAGE_KEY)).toBeNull();

      // Once somebody chose here, the token no longer decides.
      await service().setLanguage('en');
      user.set({ locale: 'en' });
      authChanged();
      user.set({ locale: 'sk' });
      authChanged();
      await settled();
      expect(service().language()).toBe('en');
    });

    it('takes nothing from a token before the start has decided the language', async () => {
      user.set({ locale: 'sk' });
      service();
      authChanged();
      await settled();
      expect(server).not.toHaveBeenCalled();
      expect(service().ready()).toBe(false);
    });
  });

  describe('what the app can show decides whether the server is asked', () => {
    it('asks while signed out: the server answers there, and a sign-in in another tab must find the words in memory', async () => {
      state.set('signed-out');
      await service().init();

      expect(server.mock.calls).toEqual([['en-gb']]);
      expect(service().ready()).toBe(true);
      expect(service().t('common.close')).toBe('Close');

      // Somebody signs in, in another tab, with Slovak on their account: words, then their words — never keys.
      browser.mockReturnValue(['en']);
      state.set('ready');
      user.set({ locale: 'sk' });
      authChanged();
      expect(service().t('common.close')).toBe('Close');
      await vi.waitFor(() => expect(service().t('common.close')).toBe('Zavrieť'));
      expect(warn).not.toHaveBeenCalled();
    });

    it('asks for nothing while the app is not set up or cannot start: the cache if there is one', async () => {
      state.set('not-set-up');
      await service().init();
      expect(server).not.toHaveBeenCalled();
      expect(service().ready()).toBe(false);

      localStorage.setItem(LANGUAGE_CACHE_KEY, JSON.stringify(EN_BUNDLE));
      state.set('problem');
      await service().init();
      expect(server).not.toHaveBeenCalled();
      expect(service().has('common.close')).toBe(true);
    });

    it('takes the cache in whatever language it is in while the server cannot be asked — and leaves it where it is', async () => {
      // A reader whose Slovak came from the token: nobody is signed in now, and the browser says English.
      localStorage.setItem(LANGUAGE_CACHE_KEY, JSON.stringify(SK_BUNDLE));
      browser.mockReturnValue(['en']);
      state.set('problem');
      await service().init();

      expect(server).not.toHaveBeenCalled();
      expect(service().language()).toBe('sk');
      expect(service().t('common.close')).toBe('Zavrieť');
      expect(JSON.parse(localStorage.getItem(LANGUAGE_CACHE_KEY) ?? 'null')).toEqual(SK_BUNDLE);

      // A corrupt one is removed all the same.
      localStorage.setItem(LANGUAGE_CACHE_KEY, '{not json');
      await service().init();
      expect(localStorage.getItem(LANGUAGE_CACHE_KEY)).toBeNull();
    });

    it('asks for nothing at a navigation before the start has run, nor while the app cannot be shown', async () => {
      service().navigated();
      await settled();
      expect(server).not.toHaveBeenCalled();

      state.set('problem');
      await service().init();
      service().navigated();
      await settled();
      expect(server).not.toHaveBeenCalled();
    });
  });

  describe('a bundle answered 503 changes what the app can show, instead of leaving a page of keys', () => {
    const NOT_SET_UP = new Refusal(503, { code: 'not_set_up', installed: false, message: 'This site is not set up yet. Its setup page connects it to its database.', setup: '/setup.php' });
    const UPDATE_PENDING = new Refusal(503, { code: 'update_pending', message: 'The site is being updated. Try again in a few minutes.' });
    const NOT_UP_TO_DATE = new Refusal(503, { error: 'The database could not be brought up to date with the upload: 004 failed', code: 'not_up_to_date', detail: '004 failed' });

    it('not_set_up: nothing of the app goes on (the library’s page says so, with the setup page while never installed) — and nothing is asked a second time', async () => {
      vi.useFakeTimers();
      server.mockResolvedValue(NOT_SET_UP);
      const starting = service().init();
      await vi.advanceTimersByTimeAsync(RETRY_WAIT_MS * 2);
      await starting;

      expect(auth.notSetUp.mock.calls).toEqual([[false]]);
      expect(auth.cannotStart).not.toHaveBeenCalled();
      expect(server).toHaveBeenCalledTimes(1);
      expect(service().ready()).toBe(false);
      // The stand-in page words itself: nothing was looked up, so nothing is complained about.
      expect(warn).not.toHaveBeenCalled();
    });

    it('any other 503: the problem page, with the code and the reason the server gives the owner’s own computer', async () => {
      vi.useFakeTimers();
      server.mockResolvedValue(NOT_UP_TO_DATE);
      const starting = service().init();
      await vi.advanceTimersByTimeAsync(RETRY_WAIT_MS * 2);
      await starting;

      expect(auth.cannotStart.mock.calls).toEqual([[{ kind: 'server', status: 503, code: 'not_up_to_date', detail: '004 failed' }]]);
      expect(auth.notSetUp).not.toHaveBeenCalled();
      expect(server).toHaveBeenCalledTimes(1);
    });

    it('a website gives no reason, and an answer that is not the API’s own has no code: the status stands for it', async () => {
      server.mockResolvedValueOnce(new Refusal(503, { error: 'The database is not reachable. The server’s error log says more.', code: 'database_unavailable' }));
      await service().init();
      expect(auth.cannotStart.mock.calls).toEqual([[{ kind: 'server', status: 503, code: 'database_unavailable', detail: null }]]);

      TestBed.resetTestingModule();
      configure();
      state.set('signed-out');
      auth.cannotStart.mockClear();
      server.mockResolvedValueOnce(new Refusal(503, null));
      await service().init();
      expect(auth.cannotStart.mock.calls).toEqual([[{ kind: 'server', status: 503, code: 'http_503', detail: null }]]);
    });

    it('as the app starts, a cached bundle does not hide it: every address with data would answer the same', async () => {
      localStorage.setItem(LANGUAGE_CACHE_KEY, JSON.stringify(EN_BUNDLE));
      server.mockResolvedValue(NOT_UP_TO_DATE);
      await service().init();

      expect(auth.cannotStart).toHaveBeenCalledTimes(1);
      // The stand-in page still has the kept words to say it with.
      expect(service().t('common.close')).toBe('Close');
    });

    it('once the app runs with its words, a choice that meets a 503 just fails: a lesson or a paper is not taken away over it', async () => {
      await service().init();
      server.mockResolvedValue(NOT_UP_TO_DATE);

      expect(await service().setLanguage('sk')).toBe(false);
      expect(auth.cannotStart).not.toHaveBeenCalled();
      expect(state()).toBe('ready');
      expect(service().language()).toBe('en');
      expect(service().t('common.close')).toBe('Close');

      // Not set up is the truth about the whole copy, whenever it is said.
      server.mockResolvedValue(NOT_SET_UP);
      expect(await service().setLanguage('sk')).toBe(false);
      expect(auth.notSetUp).toHaveBeenCalledTimes(1);
    });

    it('a page in keys that asks again at a navigation and meets a 503 gets the problem page', async () => {
      vi.useFakeTimers();
      server.mockRejectedValue(OFFLINE);
      const starting = service().init();
      await vi.advanceTimersByTimeAsync(RETRY_WAIT_MS);
      await starting;
      vi.useRealTimers();
      expect(service().ready()).toBe(false);
      expect(auth.cannotStart).not.toHaveBeenCalled();

      server.mockResolvedValue(NOT_UP_TO_DATE);
      service().navigated();
      await settled();
      expect(auth.cannotStart).toHaveBeenCalledTimes(1);
    });

    it('update_pending: SiteStatus hears it, and the library’s page stands in, in its own words — never the problem page: the sign-in has to go on', async () => {
      vi.useFakeTimers();
      server.mockResolvedValue(UPDATE_PENDING);
      const starting = service().init();
      await vi.advanceTimersByTimeAsync(RETRY_WAIT_MS * 2);
      await starting;

      expect(site.report.mock.calls).toEqual([['update_pending', undefined]]);
      expect(auth.cannotStart).not.toHaveBeenCalled();
      expect(auth.notSetUp).not.toHaveBeenCalled();
      expect(state()).toBe('ready');
      expect(service().ready()).toBe(false);
    });

    it('while the site is being updated, any other 503 is no problem of the app’s either (the words’ tables may be what the update brings) — for everybody, in the admin panel or not', async () => {
      for (const [address, isAdmin] of [
        ['/', false],
        ['/admin/migrations', true],
        ['/kanji', true],
      ] as [string, boolean][]) {
        TestBed.resetTestingModule();
        configure();
        auth.cannotStart.mockClear();
        state.set('ready');
        siteState.set('update_pending');
        history.replaceState(null, '', address);
        admin.set(isAdmin);
        server.mockResolvedValue(NOT_UP_TO_DATE);
        await service().init();
        service().navigated(); // asked again at the next navigation: still no problem page
        await settled();
        expect(auth.cannotStart, `${address}, admin ${isAdmin}`).not.toHaveBeenCalled();
        expect(state()).toBe('ready');
      }
    });

    it('any other refusal is a lost answer like being offline: the keys, after the one retry', async () => {
      vi.useFakeTimers();
      server.mockResolvedValue(new Refusal(500, { error: 'Something went wrong on the server.', code: 'server_error' }));
      const starting = service().init();
      await vi.advanceTimersByTimeAsync(RETRY_WAIT_MS);
      await starting;

      expect(server).toHaveBeenCalledTimes(2);
      expect(auth.cannotStart).not.toHaveBeenCalled();
      expect(auth.notSetUp).not.toHaveBeenCalled();
      expect(service().ready()).toBe(false);
    });
  });

  describe('the cache', () => {
    it('starts, asks the server and words the page when the cache is corrupt', async () => {
      for (const corrupt of [
        '{not json',
        '[]',
        'null',
        JSON.stringify({ language: 'en', languages: 'en', values: ENGLISH }),
        JSON.stringify({ language: 'EN', languages: TEST_LANGUAGES, values: ENGLISH }),
        JSON.stringify({ language: 'en', languages: [{ code: 'sk', name: 'Slovak', nativeName: 'Slovenčina' }], values: ENGLISH }),
        JSON.stringify({ language: 'en', languages: [{ code: 'en', name: 'English' }], values: ENGLISH }),
        JSON.stringify({ language: 'en', languages: TEST_LANGUAGES, values: { 'common.close': 7 } }),
        JSON.stringify({ language: 'en', languages: TEST_LANGUAGES, values: ['Close'] }),
        JSON.stringify({ language: 'sk', languages: TEST_LANGUAGES, values: SLOVAK }),
      ]) {
        TestBed.resetTestingModule();
        configure();
        server.mockClear();
        // The last one is Slovak without its English: asked for in Slovak, so it is its shape that fails it.
        browser.mockReturnValue(corrupt.includes('"language":"sk"') ? ['sk'] : ['en']);
        localStorage.setItem(LANGUAGE_CACHE_KEY, corrupt);

        await service().init();

        expect(server, corrupt).toHaveBeenCalled();
        expect(service().ready(), corrupt).toBe(true);
        expect(service().t('common.close'), corrupt).toBe(service().language() === 'sk' ? 'Zavrieť' : 'Close');
        // What the server sent has taken the corrupt cache's place.
        expect(JSON.parse(localStorage.getItem(LANGUAGE_CACHE_KEY) ?? 'null').values['common.close'], corrupt).toBeTruthy();
      }
    });

    it('is not used when it is in another language than the one chosen now', async () => {
      localStorage.setItem(LANGUAGE_CACHE_KEY, JSON.stringify(SK_BUNDLE));
      browser.mockReturnValue(['en']);
      const answerLater = later<TranslationBundle>();
      server.mockReturnValue(answerLater.promise);

      const started = service().init();
      // No cache: nothing is shown in Slovak meanwhile, and the start waits for the server.
      expect(service().ready()).toBe(false);
      expect(localStorage.getItem(LANGUAGE_CACHE_KEY)).toBeNull();
      answerLater.resolve(EN_BUNDLE);
      await started;
      expect(service().language()).toBe('en');
    });

    it('follows a language offered again (or added) at once, not one visit late: it settles on the list that came, whatever answered', async () => {
      // Slovak was chosen here; while it was hidden, the visit was in English and that is what was kept.
      localStorage.setItem(LANGUAGE_KEY, 'sk');
      localStorage.setItem(LANGUAGE_CACHE_KEY, JSON.stringify({ language: 'en', languages: [TEST_LANGUAGES[0]], values: ENGLISH }));
      await service().init();

      // The kept language is asked for — and its answer names Slovak again.
      expect(server.mock.calls).toEqual([['en'], ['sk']]);
      expect(service().language()).toBe('sk');
      expect(service().t('common.close')).toBe('Zavrieť');
      expect(JSON.parse(localStorage.getItem(LANGUAGE_CACHE_KEY) ?? '{}').language).toBe('sk');
    });

    it('follows a language hidden since the last visit: the cache is in force only until the answer', async () => {
      localStorage.setItem(LANGUAGE_KEY, 'sk');
      localStorage.setItem(LANGUAGE_CACHE_KEY, JSON.stringify(SK_BUNDLE));
      const english = { language: 'en', languages: [TEST_LANGUAGES[0]], values: ENGLISH };
      server.mockResolvedValue(english);
      await service().init();

      expect(server.mock.calls).toEqual([['sk']]);
      expect(service().language()).toBe('en');
      expect(service().languages()).toEqual([TEST_LANGUAGES[0]]);
      expect(JSON.parse(localStorage.getItem(LANGUAGE_CACHE_KEY) ?? '{}')).toEqual(english);
    });

    it('waits a second for the fresh bundle, then starts from the cache — and the answer replaces it when it comes', async () => {
      vi.useFakeTimers();
      localStorage.setItem(LANGUAGE_CACHE_KEY, JSON.stringify(reworded('Zatvoriť')));
      browser.mockReturnValue(['sk']);
      const answerLater = later<TranslationBundle>();
      server.mockReturnValue(answerLater.promise);

      let started = false;
      const starting = service()
        .init()
        .then(() => (started = true));
      await vi.advanceTimersByTimeAsync(CACHE_WAIT_MS - 1);
      expect(started).toBe(false);
      await vi.advanceTimersByTimeAsync(1);
      await starting;

      expect(server.mock.calls).toEqual([['sk']]);
      expect(service().language()).toBe('sk');
      expect(service().t('common.close')).toBe('Zatvoriť');

      vi.useRealTimers();
      answerLater.resolve(SK_BUNDLE);
      await vi.waitFor(() => expect(service().t('common.close')).toBe('Zavrieť'));
      expect(JSON.parse(localStorage.getItem(LANGUAGE_CACHE_KEY) ?? '{}').values['common.close']).toBe('Zavrieť');
    });

    it('does not wait the second out when the server answers, or fails, sooner', async () => {
      vi.useFakeTimers();
      localStorage.setItem(LANGUAGE_CACHE_KEY, JSON.stringify({ ...EN_BUNDLE, values: { 'common.close': 'Shut' } }));
      await service().init();
      expect(service().t('common.close')).toBe('Close');

      server.mockRejectedValue(OFFLINE);
      localStorage.setItem(LANGUAGE_CACHE_KEY, JSON.stringify({ ...EN_BUNDLE, values: { 'common.close': 'Shut' } }));
      await service().init();
      expect(service().t('common.close')).toBe('Shut');
    });

    it('asks once more, a moment later, when there is no cache and the first bundle does not come', async () => {
      vi.useFakeTimers();
      server.mockRejectedValueOnce(OFFLINE);

      let started = false;
      const starting = service()
        .init()
        .then(() => (started = true));
      await vi.advanceTimersByTimeAsync(RETRY_WAIT_MS - 1);
      expect(server.mock.calls).toEqual([['en-gb']]);
      expect(started).toBe(false);
      await vi.advanceTimersByTimeAsync(1);
      await starting;

      // The same request again: the page waited for it, and starts with its strings.
      expect(server.mock.calls).toEqual([['en-gb'], ['en-gb']]);
      expect(service().ready()).toBe(true);
      expect(service().t('common.close')).toBe('Close');
    });

    it('shows keys, and warns once for each, when there is no cache and the server cannot be reached — after the one retry', async () => {
      vi.useFakeTimers();
      server.mockRejectedValue(OFFLINE);
      const starting = service().init();
      await vi.advanceTimersByTimeAsync(RETRY_WAIT_MS);
      await starting;

      expect(server).toHaveBeenCalledTimes(2);
      expect(service().ready()).toBe(false);
      expect(service().has('common.close')).toBe(false);
      expect(service().t('common.close')).toBe('common.close');
      expect(service().t('common.close')).toBe('common.close');
      expect(warn.mock.calls).toEqual([["[i18n] no string for 'common.close'"]]);
      // Being out of reach changes nothing about what the app can show.
      expect(auth.cannotStart).not.toHaveBeenCalled();
    });

    it('takes nothing from the server that is not a bundle', async () => {
      vi.useFakeTimers();
      server.mockResolvedValue({ language: 'en', languages: TEST_LANGUAGES, values: { 'common.close': ['Close'] } });
      const starting = service().init();
      await vi.advanceTimersByTimeAsync(RETRY_WAIT_MS);
      await starting;
      expect(service().ready()).toBe(false);
      expect(localStorage.getItem(LANGUAGE_CACHE_KEY)).toBeNull();
    });
  });

  describe('asking again: a page that started without its strings heals at the next navigation', () => {
    /** A start with no cache and a server out of reach: both attempts fail, and the page is in keys. */
    async function startInKeys(): Promise<void> {
      vi.useFakeTimers();
      server.mockRejectedValue(OFFLINE);
      const starting = service().init();
      await vi.advanceTimersByTimeAsync(RETRY_WAIT_MS);
      await starting;
      vi.useRealTimers();
      expect(service().ready()).toBe(false);
      server.mockClear();
    }

    it('asks once at each navigation while no bundle is in memory — and no more once one has come', async () => {
      browser.mockReturnValue(['sk']);
      await startInKeys();

      service().navigated();
      await settled();
      expect(server.mock.calls).toEqual([['sk']]);
      expect(service().ready()).toBe(false);

      service().navigated();
      await settled();
      expect(server.mock.calls).toEqual([['sk'], ['sk']]);

      // The server is back: the next click brings the strings, in the reader's language.
      server.mockImplementation(answer);
      service().navigated();
      await settled();
      expect(server).toHaveBeenCalledTimes(3);
      expect(service().language()).toBe('sk');
      expect(service().t('common.close')).toBe('Zavrieť');
      expect(JSON.parse(localStorage.getItem(LANGUAGE_CACHE_KEY) ?? '{}').language).toBe('sk');

      service().navigated();
      service().navigated();
      await settled();
      expect(server).toHaveBeenCalledTimes(3);
    });

    it('asks again while the cached bundle is in force because its refresh failed', async () => {
      localStorage.setItem(LANGUAGE_CACHE_KEY, JSON.stringify({ ...EN_BUNDLE, values: { ...ENGLISH, 'common.close': 'Shut' } }));
      server.mockRejectedValue(OFFLINE);
      await service().init();
      expect(service().t('common.close')).toBe('Shut');
      server.mockClear();

      service().navigated();
      await settled();
      expect(server.mock.calls).toEqual([['en']]);
      expect(service().t('common.close')).toBe('Shut');

      server.mockImplementation(answer);
      service().navigated();
      await settled();
      expect(server.mock.calls).toEqual([['en'], ['en']]);
      expect(service().t('common.close')).toBe('Close');
      expect(JSON.parse(localStorage.getItem(LANGUAGE_CACHE_KEY) ?? '{}').values['common.close']).toBe('Close');

      service().navigated();
      await settled();
      expect(server).toHaveBeenCalledTimes(2);
    });

    it('never has two loads in flight: a navigation asks for nothing while an answer is still on its way', async () => {
      await startInKeys();
      const answerLater = later<TranslationBundle>();
      server.mockReturnValue(answerLater.promise);

      service().navigated();
      service().navigated();
      await settled();
      service().navigated();
      expect(server).toHaveBeenCalledTimes(1);

      answerLater.resolve(EN_BUNDLE);
      await settled();
      expect(service().ready()).toBe(true);
      service().navigated();
      expect(server).toHaveBeenCalledTimes(1);
    });

    it('leaves a start that is still waiting for its fresh bundle alone', async () => {
      vi.useFakeTimers();
      localStorage.setItem(LANGUAGE_CACHE_KEY, JSON.stringify(reworded('Zatvoriť')));
      browser.mockReturnValue(['sk']);
      const slow = later<TranslationBundle>();
      server.mockReturnValue(slow.promise);
      const starting = service().init();
      await vi.advanceTimersByTimeAsync(CACHE_WAIT_MS);
      await starting;
      vi.useRealTimers();

      // The page started from the cache; its refresh is still out — the first navigation does not ask a second time.
      service().navigated();
      await settled();
      expect(server.mock.calls).toEqual([['sk']]);

      slow.resolve(SK_BUNDLE);
      await settled();
      expect(service().t('common.close')).toBe('Zavrieť');
      service().navigated();
      expect(server).toHaveBeenCalledTimes(1);
    });

    it('never overtakes a choice that is being loaded', async () => {
      await startInKeys();
      const slovak = later<TranslationBundle>();
      server.mockReturnValue(slovak.promise);

      const choosing = service().setLanguage('sk');
      service().navigated();
      await settled();
      expect(server.mock.calls).toEqual([['sk']]);

      slovak.resolve(SK_BUNDLE);
      expect(await choosing).toBe(true);
      expect(service().language()).toBe('sk');
    });
  });

  describe('reload(): the strings again, after the owner changed them or the languages', () => {
    it('asks for the bundle of the language on the page again, and puts it in force and in the cache', async () => {
      localStorage.setItem(LANGUAGE_KEY, 'sk');
      await service().init();
      expect(service().t('common.close')).toBe('Zavrieť');
      server.mockClear();

      server.mockImplementation((code: string) => Promise.resolve(code === 'sk' ? reworded('Zatvoriť') : EN_BUNDLE));
      await service().reload();

      expect(server.mock.calls).toEqual([['sk']]);
      expect(service().language()).toBe('sk');
      expect(service().t('common.close')).toBe('Zatvoriť');
      expect(JSON.parse(localStorage.getItem(LANGUAGE_CACHE_KEY) ?? '{}').values['common.close']).toBe('Zatvoriť');
    });

    it('follows a language hidden a moment ago: the page goes to what the list that came still offers', async () => {
      localStorage.setItem(LANGUAGE_KEY, 'sk');
      await service().init();
      server.mockClear();

      server.mockResolvedValue({ language: 'en', languages: [TEST_LANGUAGES[0]], values: ENGLISH });
      await service().reload();

      expect(server.mock.calls).toEqual([['sk']]);
      expect(service().language()).toBe('en');
      expect(service().languages()).toEqual([TEST_LANGUAGES[0]]);
      expect(JSON.parse(localStorage.getItem(LANGUAGE_CACHE_KEY) ?? '{}').language).toBe('en');
    });

    it('follows a language offered a moment ago: the reader who chose it gets it without loading the page again', async () => {
      localStorage.setItem(LANGUAGE_KEY, 'sk');
      server.mockResolvedValue({ language: 'en', languages: [TEST_LANGUAGES[0]], values: ENGLISH });
      await service().init();
      expect(service().language()).toBe('en');
      server.mockClear();

      server.mockImplementation(answer);
      await service().reload();

      expect(server.mock.calls).toEqual([['en'], ['sk']]);
      expect(service().language()).toBe('sk');
      expect(service().languages()).toEqual(TEST_LANGUAGES);
      expect(JSON.parse(localStorage.getItem(LANGUAGE_CACHE_KEY) ?? '{}').language).toBe('sk');
    });

    it('never rejects: the page stays as it is when the server cannot be had — and asks again at the next navigation', async () => {
      localStorage.setItem(LANGUAGE_KEY, 'sk');
      await service().init();
      // Fresh from the server: a navigation asks for nothing.
      service().navigated();
      server.mockClear();

      server.mockRejectedValue(OFFLINE);
      await expect(service().reload()).resolves.toBeUndefined();
      expect(service().language()).toBe('sk');
      expect(service().t('common.close')).toBe('Zavrieť');
      expect(server).toHaveBeenCalledTimes(1);

      // Known to be behind now: the next click asks once more.
      server.mockImplementation((code: string) => Promise.resolve(code === 'sk' ? reworded('Zatvoriť') : EN_BUNDLE));
      service().navigated();
      await settled();
      expect(server).toHaveBeenCalledTimes(2);
      expect(service().t('common.close')).toBe('Zatvoriť');
    });

    it('is the load that counts: an answer still on its way from before the change is dropped', async () => {
      vi.useFakeTimers();
      localStorage.setItem(LANGUAGE_CACHE_KEY, JSON.stringify(SK_BUNDLE));
      browser.mockReturnValue(['sk']);
      const before = later<TranslationBundle>();
      server.mockReturnValueOnce(before.promise);
      const starting = service().init();
      await vi.advanceTimersByTimeAsync(CACHE_WAIT_MS);
      await starting;
      vi.useRealTimers();

      server.mockResolvedValue(reworded('Zatvoriť'));
      await service().reload();
      expect(service().t('common.close')).toBe('Zatvoriť');

      // The start's answer was made before the save: it must not put the old word back.
      before.resolve(SK_BUNDLE);
      await settled();
      expect(service().t('common.close')).toBe('Zatvoriť');
      expect(JSON.parse(localStorage.getItem(LANGUAGE_CACHE_KEY) ?? '{}').values['common.close']).toBe('Zatvoriť');
    });
  });

  describe('setLanguage(): the chooser', () => {
    it('loads the bundle, then switches and remembers — and the choice outlives the ?lang= of this tab', async () => {
      sessionStorage.setItem(LANGUAGE_KEY, 'en');
      await service().init();
      server.mockClear();

      const answerLater = later<TranslationBundle>();
      server.mockReturnValue(answerLater.promise);
      const switching = service().setLanguage('sk');
      expect(service().language()).toBe('en');
      answerLater.resolve(SK_BUNDLE);

      expect(await switching).toBe(true);
      expect(service().language()).toBe('sk');
      expect(localStorage.getItem(LANGUAGE_KEY)).toBe('sk');
      expect(sessionStorage.getItem(LANGUAGE_KEY)).toBeNull();
      expect(JSON.parse(localStorage.getItem(LANGUAGE_CACHE_KEY) ?? '{}').language).toBe('sk');
    });

    it('lets the last choice win: going back to the language on the page drops the one still on its way', async () => {
      await service().init();
      const slow = later<TranslationBundle>();
      server.mockImplementation((code: string) => (code === 'sk' ? slow.promise : Promise.resolve(EN_BUNDLE)));

      const first = service().setLanguage('sk');
      // A change of mind, back to English: no request is needed — and it is a choice all the same.
      expect(await service().setLanguage('en')).toBe(true);
      slow.resolve(SK_BUNDLE);

      expect(await first).toBe(false);
      expect(service().language()).toBe('en');
      expect(service().t('common.close')).toBe('Close');
      expect(localStorage.getItem(LANGUAGE_KEY)).toBe('en');
    });

    it('lets the last choice win with two loads in flight: the slower, earlier answer is dropped when it comes', async () => {
      const czech: TranslationBundle = {
        language: 'cs',
        languages: [...TEST_LANGUAGES, { code: 'cs', name: 'Czech', nativeName: 'Čeština' }],
        values: { ...ENGLISH, 'common.close': 'Zavřít' },
        english: ENGLISH,
      };
      await service().init();
      const slow = later<TranslationBundle>();
      server.mockImplementation((code: string) => (code === 'sk' ? slow.promise : Promise.resolve(code === 'cs' ? czech : EN_BUNDLE)));

      const first = service().setLanguage('sk');
      expect(await service().setLanguage('cs')).toBe(true);
      slow.resolve(SK_BUNDLE);

      expect(await first).toBe(false);
      expect(service().language()).toBe('cs');
      expect(service().t('common.close')).toBe('Zavřít');
      expect(localStorage.getItem(LANGUAGE_KEY)).toBe('cs');
      expect(JSON.parse(localStorage.getItem(LANGUAGE_CACHE_KEY) ?? '{}').language).toBe('cs');
    });

    it('is not undone by a start’s answer that comes late', async () => {
      vi.useFakeTimers();
      localStorage.setItem(LANGUAGE_CACHE_KEY, JSON.stringify(SK_BUNDLE));
      browser.mockReturnValue(['sk']);
      const slow = later<TranslationBundle>();
      server.mockImplementation((code: string) => (code === 'sk' ? slow.promise : Promise.resolve(EN_BUNDLE)));
      const starting = service().init();
      await vi.advanceTimersByTimeAsync(CACHE_WAIT_MS);
      await starting;
      vi.useRealTimers();
      expect(service().language()).toBe('sk');

      expect(await service().setLanguage('en')).toBe(true);
      slow.resolve(SK_BUNDLE);
      await settled();

      expect(service().language()).toBe('en');
      expect(JSON.parse(localStorage.getItem(LANGUAGE_CACHE_KEY) ?? '{}').language).toBe('en');
    });

    it('never rejects: false, and the page stays as it is, when the strings cannot be had', async () => {
      await service().init();
      server.mockRejectedValue(OFFLINE);

      expect(await service().setLanguage('sk')).toBe(false);
      expect(service().language()).toBe('en');
      expect(service().t('common.close')).toBe('Close');
      expect(localStorage.getItem(LANGUAGE_KEY)).toBeNull();
    });

    it('does not switch to a language the server no longer offers, and asks for nothing that is not a code', async () => {
      await service().init();
      server.mockClear();

      expect(await service().setLanguage('de')).toBe(false);
      expect(service().language()).toBe('en');
      expect(localStorage.getItem(LANGUAGE_KEY)).toBeNull();

      server.mockClear();
      expect(await service().setLanguage('../owner')).toBe(false);
      expect(server).not.toHaveBeenCalled();
    });
  });

  describe('the account: a signed-in person’s language, date order and clock', () => {
    /** Signed in at an IAM that sends the account's preferences (none chosen), the account's language `locale`. */
    function signedIn(locale: string): void {
      user.set({ locale });
      preferences.set({ theme: 'auto', date_format: null, time_format: null });
    }

    /** The IAM takes save `index`: the account as it now stands goes into the user first, as the SDK does. */
    function accept(index: number, locale: string): void {
      user.set({ locale });
      authChanged();
      saves[index].answer.resolve({ locale, preferences: preferences() });
    }

    it('gives the dates the account’s order and clock while the IAM sends them, and the language’s own way otherwise', () => {
      expect([service().dateFormat(), service().timeFormat()], 'nobody signed in').toEqual([null, null]);
      preferences.set({ theme: 'dark', date_format: 'ymd_dash', time_format: '12' });
      expect([service().dateFormat(), service().timeFormat()]).toEqual(['ymd_dash', '12']);
      preferences.set({ theme: 'auto', date_format: null, time_format: '24' });
      expect([service().dateFormat(), service().timeFormat()], 'nothing chosen is the language’s own').toEqual([null, '24']);
      preferences.set(null);
      expect([service().dateFormat(), service().timeFormat()], 'an IAM that sends none').toEqual([null, null]);
    });

    it('saves the chooser’s choice to the account once the page has switched — the device keeps it as before, and the token that follows changes nothing', async () => {
      signedIn('en');
      await service().init();
      expect(service().language()).toBe('en');

      expect(await service().setLanguage('sk')).toBe(true);
      expect(saves.map((save) => save.changes)).toEqual([{ language: 'sk' }]);
      expect(localStorage.getItem(LANGUAGE_KEY)).toBe('sk');

      accept(0, 'sk');
      await settled();
      expect(service().language()).toBe('sk');
      expect(saves).toHaveLength(1);
      expect(warn).not.toHaveBeenCalled();
    });

    it('reads the account’s language over what this device remembered — this tab’s ?lang= still first; without the account’s preferences, the device’s first as before', async () => {
      signedIn('sk');
      localStorage.setItem(LANGUAGE_KEY, 'en');
      await service().init();
      expect(service().language(), 'the account’s, over the device’s choice').toBe('sk');
      expect(localStorage.getItem(LANGUAGE_KEY), 'which stays, for whoever is not signed in').toBe('en');

      sessionStorage.setItem(LANGUAGE_KEY, 'en');
      await service().init();
      expect(service().language(), 'this tab’s ?lang= comes first').toBe('en');
      sessionStorage.clear();

      preferences.set(null);
      await service().init();
      expect(service().language(), 'an IAM that sends no preferences: the device’s choice before the token, as before').toBe('en');
      user.set(null);
      await service().init();
      expect(service().language(), 'a visitor: the device’s').toBe('en');
      expect(saves).toEqual([]);
    });

    it('keeps a choice made on this page for the visit, over the account’s language, whatever the account answers — the next visit is the account’s again', async () => {
      signedIn('sk');
      await service().init();
      expect(await service().setLanguage('en')).toBe(true);
      saves[0].answer.reject(Object.assign(new Error('Not offered'), { code: 'invalid_request' }));
      await settled();
      await service().reload();
      expect(service().language(), 'settled on the wishes again: the choice made here first').toBe('en');

      TestBed.resetTestingModule();
      configure();
      await service().init();
      expect(service().language(), 'a new page: the account’s, then the device’s').toBe('sk');
    });

    it('follows a change of the account’s language made elsewhere — over this device’s choice and an earlier choice on the page; not over this tab’s ?lang=, and not while a choice made here is on its way', async () => {
      signedIn('en');
      await service().init();
      await service().setLanguage('sk');
      accept(0, 'sk');
      await settled();
      expect(service().language()).toBe('sk');

      // Changed on the account's page, or on another anotoki site.
      user.set({ locale: 'en' });
      authChanged();
      await settled();
      expect(service().language()).toBe('en');
      expect(localStorage.getItem(LANGUAGE_KEY), 'used, not stored').toBe('sk');
      expect(saves, 'nothing sent back').toHaveLength(1);

      // The answer to an earlier save, while a later choice waits to be saved: not followed.
      await service().setLanguage('sk');
      await service().setLanguage('en');
      accept(1, 'sk');
      await settled();
      expect(service().language(), 'not turned back to Slovak').toBe('en');
      expect(saves.map((save) => save.changes)).toEqual([{ language: 'sk' }, { language: 'sk' }, { language: 'en' }]);
      accept(2, 'en');
      await settled();
      expect(service().language()).toBe('en');

      // This tab came with ?lang=en: a change elsewhere does not override it.
      sessionStorage.setItem(LANGUAGE_KEY, 'en');
      user.set({ locale: 'sk' });
      authChanged();
      await settled();
      expect(service().language()).toBe('en');
    });

    it('saves nothing the account has already, nothing for a language that could not be had, and nothing without the account’s preferences: an IAM that sends none, a visitor', async () => {
      signedIn('sk');
      localStorage.setItem(LANGUAGE_KEY, 'en');
      await service().init();
      expect(service().language(), 'the account’s language, over this device’s choice').toBe('sk');
      expect(await service().setLanguage('sk')).toBe(true);
      expect(saves, 'the account speaks Slovak already').toEqual([]);

      server.mockRejectedValue(OFFLINE);
      expect(await service().setLanguage('en')).toBe(false);
      expect(saves, 'the page did not switch: the account is not told').toEqual([]);

      server.mockImplementation(answer);
      preferences.set(null);
      expect(await service().setLanguage('en')).toBe(true);
      user.set(null);
      expect(await service().setLanguage('sk')).toBe(true);
      expect(saves).toEqual([]);
      expect(auth.savePreferences).not.toHaveBeenCalled();
    });

    it('saves one choice at a time, the latest last — and only when the account does not have it by then', async () => {
      signedIn('en');
      await service().init();
      await service().setLanguage('sk');
      // Changes of mind while the first save is on its way: only the latest waits.
      await service().setLanguage('en');
      await service().setLanguage('sk');
      expect(saves.map((save) => save.changes)).toEqual([{ language: 'sk' }]);

      accept(0, 'sk');
      await settled();
      expect(saves, 'the account has Slovak by then').toHaveLength(1);

      await service().setLanguage('en');
      await service().setLanguage('sk');
      await service().setLanguage('en');
      accept(1, 'en');
      await settled();
      expect(saves.map((save) => save.changes)).toEqual([{ language: 'sk' }, { language: 'en' }]);
      expect(service().language()).toBe('en');
    });

    it('a refusal puts nothing back: a language the IAM does not offer stays this site’s own, silently; one the IAM was not told of is noted in the console', async () => {
      signedIn('en');
      await service().init();
      await service().setLanguage('sk');
      saves[0].answer.reject(Object.assign(new Error('Not offered'), { code: 'invalid_request' }));
      await settled();
      expect(service().language()).toBe('sk');
      expect(localStorage.getItem(LANGUAGE_KEY)).toBe('sk');
      expect(warn).not.toHaveBeenCalled();

      await service().setLanguage('en');
      expect(saves, 'the account has English still: nothing to save').toHaveLength(1);
      await service().setLanguage('sk');
      saves[1].answer.reject(Object.assign(new Error('The IAM could not be reached'), { code: 'network' }));
      await settled();
      expect(saves.map((save) => save.changes)).toEqual([{ language: 'sk' }, { language: 'sk' }]);
      expect(warn).toHaveBeenCalledWith('[i18n] the language could not be saved to the account', expect.objectContaining({ code: 'network' }));
      expect(service().language()).toBe('sk');
      expect(localStorage.getItem(LANGUAGE_KEY)).toBe('sk');
    });
  });
});

describe('TranslationService: wording', () => {
  let warn: ReturnType<typeof vi.spyOn>;

  function slovak(): TranslationService {
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({ providers: [provideZonelessChangeDetection(), provideTestTranslations(SLOVAK, { language: 'sk', english: ENGLISH })] });
    return TestBed.inject(TranslationService);
  }

  function english(): TranslationService {
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({ providers: [provideZonelessChangeDetection(), provideTestTranslations(ENGLISH)] });
    return TestBed.inject(TranslationService);
  }

  beforeEach(() => {
    warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
  });

  afterEach(() => vi.restoreAllMocks());

  it('fills placeholders in one pass: what a parameter holds is never filled again', () => {
    const i18n = english();
    expect(i18n.t('home.hello', { name: '{count}', count: 3 })).toBe('Hello {count}, you have 3.');
    expect(i18n.t('home.hello', { name: 'Anna {name}', count: '{name}' })).toBe('Hello Anna {name}, you have {name}.');
    // The same filling, for the English a page keeps in its own code.
    expect(fillPlaceholders('Signing in did not work. ({code})', { code: '{code} x' })).toBe('Signing in did not work. ({code} x)');
  });

  it('leaves a placeholder with no parameter as written', () => {
    const i18n = english();
    expect(i18n.t('home.hello')).toBe('Hello {name}, you have {count}.');
    expect(i18n.t('home.hello', { name: 'Anna' })).toBe('Hello Anna, you have {count}.');
    expect(i18n.t('home.hello', { name: null, count: 0 })).toBe('Hello {name}, you have 0.');
    // Not a name a parameter object merely inherits: `constructor` and `toString` are on every object.
    expect(i18n.t('home.proto', { count: 1 })).toBe('x {constructor} {toString} y');
    expect(i18n.t('home.proto', { constructor: 'a', toString: 'b' })).toBe('x a b y');
  });

  it('gives an unknown key back as itself and warns once', () => {
    const i18n = english();
    expect(i18n.t('home.missing')).toBe('home.missing');
    expect(i18n.t('home.missing', { name: 'x' })).toBe('home.missing');
    expect(warn.mock.calls).toEqual([["[i18n] no string for 'home.missing'"]]);
  });

  it('has only the keys of the bundle — nothing an object would inherit', () => {
    const i18n = english();
    expect(i18n.has('common.close')).toBe(true);
    expect(i18n.has('constructor')).toBe(false);
    expect(i18n.has('toString')).toBe(false);
    expect(i18n.has('__proto__')).toBe(false);
    expect(i18n.t('constructor')).toBe('constructor');
  });

  it('cuts a sentence around a placeholder before filling the halves', () => {
    const i18n = english();
    expect(i18n.around('home.by', 'name', { site: 'anotoki' })).toEqual(['Written by ', ' for anotoki.', true]);
    // The cut is made in the stored string: a parameter cannot move it.
    expect(i18n.around('home.by', 'site', { name: '{site}' })).toEqual(['Written by {site} for ', '.', true]);
    expect(slovak().around('home.by', 'name', { site: 'anotoki' })).toEqual(['Napísal to ', ' pre anotoki.', true]);
  });

  it('says when the cut was not made, so the page does not glue the value onto a sentence that left it out — or onto a key', () => {
    const i18n = english();
    // A string without the placeholder (another language may leave one out): the whole sentence, and nothing to mark up.
    expect(i18n.around('common.close', 'name')).toEqual(['Close', '', false]);
    expect(i18n.around('home.by', 'author', { name: 'Anna', site: 'anotoki' })).toEqual(['Written by Anna for anotoki.', '', false]);
    // No string at all: the key, as everywhere — and it warns.
    expect(i18n.around('home.missing', 'name')).toEqual(['home.missing', '', false]);
    expect(warn.mock.calls).toEqual([["[i18n] no string for 'home.missing'"]]);
  });

  it('picks the plural form English asks for', () => {
    const i18n = english();
    expect([0, 1, 2, 5, 12].map((count) => i18n.plural('home.items', count))).toEqual(['0 items', '1 item', '2 items', '5 items', '12 items']);
  });

  it('picks the plural form Slovak asks for: 1, 2 to 4, and 0 with 5 and more', () => {
    const i18n = slovak();
    expect([0, 1, 2, 3, 4, 5, 12, 22].map((count) => i18n.plural('home.items', count))).toEqual(['0 položiek', '1 položka', '2 položky', '3 položky', '4 položky', '5 položiek', '12 položiek', '22 položiek']);
    // A form the family does not have (Slovak "many", for fractions) is the family's "other" — the number written the Slovak way.
    expect(i18n.plural('home.items', 1.5)).toBe('1,5 položiek');
    // Inside a family the number is {count}, whatever else is handed in.
    expect(i18n.plural('home.items', 3, { count: 99 })).toBe('3 položky');
  });

  it('writes the number of a plural family the way the language writes numbers: the form is chosen on the number itself', () => {
    expect(english().plural('exam.bankQuestions', 11523)).toBe('11,523 questions in the bank');
    expect(slovak().plural('exam.bankQuestions', 11523)).toBe(`11${NBSP}523 otázok v banke`);
    // 1,002 is "other" in English; 1 002 is "other" in Slovak too — not the form its last digit would ask for.
    expect(slovak().plural('exam.bankQuestions', 1002)).toBe(`1${NBSP}002 otázok v banke`);
  });

  it('writes a number that goes into a sentence as any other placeholder', () => {
    const en = english();
    expect(en.number(11523)).toBe('11,523');
    expect(en.t('exam.size', { n: en.number(11523) })).toBe('A test of 11,523 questions');
    const sk = slovak();
    expect(sk.number(11523)).toBe(`11${NBSP}523`);
    expect(sk.number(0.5, { style: 'percent' })).toBe(`50${NBSP}%`);
    expect(sk.t('exam.size', { n: sk.number(250) })).toBe('Test s počtom otázok: 250');
  });

  it('says the language on <html lang>, and gives Intl its locale', async () => {
    const i18n = slovak();
    TestBed.tick();
    expect(i18n.language()).toBe('sk');
    expect(i18n.locale()).toBe('sk-SK');
    expect(document.documentElement.lang).toBe('sk');

    expect(await i18n.setLanguage('en', false)).toBe(true);
    TestBed.tick();
    expect(i18n.locale()).toBe('en-GB');
    expect(document.documentElement.lang).toBe('en');
  });

  it('switches between the bundles a spec was given, with no HTTP', async () => {
    const i18n = slovak();
    expect(await i18n.setLanguage('en', false)).toBe(true);
    expect(i18n.t('common.close')).toBe('Close');
    expect(await i18n.setLanguage('sk', false)).toBe(true);
    expect(i18n.t('common.close')).toBe('Zavrieť');
  });

  it('has a reload() in a spec that answers at once and leaves the language the spec chose', async () => {
    const i18n = slovak();
    await expect(i18n.reload()).resolves.toBeUndefined();
    expect(i18n.language()).toBe('sk');
    expect(i18n.t('common.close')).toBe('Zavrieť');
  });

  it('reads in English in the admin area, whatever the reader chose — and in their language again outside it', () => {
    const i18n = slovak();
    i18n.noteAddress('/admin/translations?key=home');
    TestBed.tick();
    expect(i18n.t('common.close')).toBe('Close');
    expect(i18n.plural('home.items', 3)).toBe('3 items');
    expect(i18n.has('common.close')).toBe(true);
    expect(i18n.pageLanguage()).toBe('en');
    expect(i18n.locale()).toBe('en-GB');
    expect(document.documentElement.lang).toBe('en');
    // The reader's own choice stays: the chooser and the IAM's pages go by it.
    expect(i18n.language()).toBe('sk');

    i18n.noteAddress('/kanji/administration');
    TestBed.tick();
    expect(i18n.t('common.close')).toBe('Zavrieť');
    expect(i18n.plural('home.items', 3)).toBe('3 položky');
    expect(i18n.pageLanguage()).toBe('sk');
    expect(document.documentElement.lang).toBe('sk');

    // "/admin" itself, and only the admin area: an address that merely begins with the word is not it.
    for (const [url, admin] of [
      ['/admin', true],
      ['/admin#people', true],
      ['/administration', false],
      ['/', false],
    ] as const) {
      i18n.noteAddress(url);
      expect(i18n.pageLanguage(), url).toBe(admin ? 'en' : 'sk');
    }
  });

  it('an English reader’s admin area is simply English', () => {
    const i18n = english();
    i18n.noteAddress('/admin');
    expect(i18n.t('common.close')).toBe('Close');
    expect(i18n.pageLanguage()).toBe('en');
  });
});
