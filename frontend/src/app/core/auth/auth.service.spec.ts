import { provideZonelessChangeDetection } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { ANOTOKI_AUTH_BROWSER, ANOTOKI_AUTH_CLIENT_FACTORY, AnotokiAuthEnvironment, AnotokiAuthOptions, AnotokiInitResult } from '@anotoki/lib/auth';
import { FakeAuthClient, testAnotokiAuth, TestAnotokiAuth, TestUser } from '@anotoki/lib/auth/testing';
import { SiteStatus } from '@anotoki/lib/migrations';
import { provideTestTranslations } from '@anotoki/lib/translations/testing';
import { SavesInFlight } from '../saves-in-flight.service';
import { provideTestSiteStatus } from '../testing/site-status';
import { provideAuth } from './auth.config';
import { AuthService } from './auth.service';
import { VISITOR_STORAGE_KEY } from './visitor-key';

/** The anotoki library's answer for a site without its settings (its SiteGate), never installed. */
const NOT_SET_UP = { code: 'not_set_up', installed: false, message: 'This site is not set up yet. Its setup page connects it to its database.', setup: '/setup.php' };

/** The boot configuration as the server answers it now (the library's AuthRoutes::config()). */
const CONFIG = { issuer: 'https://iam.test', client_id: 'japanese-academy', login_required: true, sign_in_available: true, visitor_keep_days: 30 };

/** A visitor key in the server's shape. */
const KEY = 'k'.repeat(43);

/** An answer of the server, as fetch() gives it. */
function answer(status: number, body: unknown): Response {
  return new Response(typeof body === 'string' ? body : JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
}

interface Started {
  auth: AuthService;
  /** The client the library made (a stand-in IAM's, in memory). */
  client: FakeAuthClient | null;
  browser: TestAnotokiAuth['browser'];
  /** Every fetch() the page made: its address and what it sent. */
  fetches: { url: string; init: RequestInit }[];
}

/**
 * The app started as the boot starts it - this app's AuthService over the
 * anotoki library's auth module, wired as app.config.ts wires it (provideAuth()),
 * with a stand-in IAM client in memory: the server's answer to GET
 * /api/auth/config (`boot`: a status and a body, or 'offline'), who is signed
 * in, a callback's outcome, the language the page is read in; `answers` for
 * the other addresses the page fetches.
 */
async function start(
  boot: { status: number; body: unknown } | 'offline' = { status: 200, body: CONFIG },
  user: TestUser | null = null,
  options: { callback?: AnotokiInitResult; language?: string; answers?: Record<string, () => Response> } = {},
): Promise<Started> {
  const handle = testAnotokiAuth();
  const started: Started = { auth: null as unknown as AuthService, client: null, browser: handle.browser, fetches: [] };
  globalThis.fetch = vi.fn((input: RequestInfo | URL, init: RequestInit = {}) => {
    const url = String(input);
    started.fetches.push({ url, init });
    if (url === '/api/auth/config') {
      return boot === 'offline' ? Promise.reject(new TypeError('Failed to fetch')) : Promise.resolve(answer(boot.status, boot.body));
    }
    const path = new URL(url, location.href).pathname;
    const respond = options.answers?.[path];
    return respond ? Promise.resolve(respond()) : Promise.resolve(answer(404, { code: 'not_found' }));
  }) as unknown as typeof fetch;
  TestBed.configureTestingModule({
    providers: [
      provideZonelessChangeDetection(),
      provideTestSiteStatus(),
      provideTestTranslations({}, options.language ? { language: options.language, english: {} } : {}),
      provideAuth(),
      {
        provide: ANOTOKI_AUTH_CLIENT_FACTORY,
        useValue: (clientOptions: AnotokiAuthOptions, environment: AnotokiAuthEnvironment) => {
          const client = new FakeAuthClient(clientOptions, environment, user);
          if (options.callback) {
            client.initResult = options.callback;
          }
          started.client = client;
          return client;
        },
      },
      { provide: ANOTOKI_AUTH_BROWSER, useValue: handle.browser },
    ],
  });
  started.auth = TestBed.inject(AuthService);
  await started.auth.init();
  return started;
}

/** What a callback that came back without a sign-in leaves for the library: where it started, and the IAM's code. */
function refused(returnTo: string, code: string): AnotokiInitResult {
  return { returnTo, error: Object.assign(new Error('The IAM’s own sentence, never shown'), { code }), silent: false };
}

/** Lets the effects run. */
const settle = () => new Promise((done) => setTimeout(done));

describe('AuthService: the start - this app’s read of how it signs people in, for the anotoki library', () => {
  const realFetch = globalThis.fetch;

  afterEach(() => {
    globalThis.fetch = realFetch;
    localStorage.removeItem(VISITOR_STORAGE_KEY);
    vi.restoreAllMocks();
  });

  it('asks GET /api/auth/config with the reader’s time zone, and gives the library the IAM and the client it names', async () => {
    const { auth, client, fetches } = await start();
    expect(new Headers(fetches[0].init.headers).get('X-Time-Zone')).toBe(Intl.DateTimeFormat().resolvedOptions().timeZone);
    expect([client?.options.issuer, client?.options.clientId]).toEqual(['https://iam.test', 'japanese-academy']);
    expect(client?.options.redirectUri).toBe(`${location.origin}/auth/callback`);
    expect(auth.accountUrl()).toBe('https://iam.test/account');
  });

  it('how many days a visitor is kept: the server’s visitor_keep_days, or the camelCase of a server from before the library, else 30', async () => {
    expect((await start({ status: 200, body: { ...CONFIG, visitor_keep_days: 12 } })).auth.visitorKeepDays()).toBe(12);
    TestBed.resetTestingModule();
    const older = await start({ status: 200, body: { issuer: 'https://iam.test', clientId: 'japanese-academy', loginRequired: false, visitorKeepDays: 9 } });
    expect([older.auth.visitorKeepDays(), older.client?.options.clientId, older.auth.state()]).toEqual([9, 'japanese-academy', 'visiting']);
    TestBed.resetTestingModule();
    expect((await start({ status: 200, body: { ...CONFIG, visitor_keep_days: 'many' } })).auth.visitorKeepDays()).toBe(30);
  });

  it('nobody signed in, sign-in required: signed out, no token, and no Sign in card — the guard sends the browser to the IAM', async () => {
    const { auth } = await start();
    expect([auth.state(), auth.signedIn(), auth.visiting(), auth.usable(), auth.showSignIn()]).toEqual(['signed-out', false, false, false, false]);
    expect(await auth.token()).toBeNull();
    expect(auth.user()).toBeNull();
    expect(auth.caller(), 'a request issued now is a person’s: with a token, or never sent').toBe('person');
  });

  it('a server that says nothing of it requires sign-in; only false lets visitors in', async () => {
    expect((await start({ status: 200, body: { issuer: 'https://iam.test', client_id: 'japanese-academy' } })).auth.state()).toBe('signed-out');
    TestBed.resetTestingModule();
    const { auth } = await start({ status: 200, body: { ...CONFIG, login_required: false } });
    expect([auth.state(), auth.loginRequired(), auth.caller(), auth.showSignIn()]).toEqual(['visiting', false, 'visitor', false]);
  });

  it('signed in: ready - their name, their roles here (EDITOR is staff, ADMIN staff and admin), the account’s preferences', async () => {
    const preferences = { theme: 'dark' as const, date_format: 'ymd_dash' as const, time_format: '24' as const };
    const { auth } = await start(undefined, { sub: '7', preferred_username: 'hana', roles: ['MEMBER', 'EDITOR'], preferences });
    expect([auth.state(), auth.displayName(), auth.isStaff(), auth.isAdmin(), auth.subject()]).toEqual(['ready', 'hana', true, false, '7']);
    expect(auth.preferences()).toEqual(preferences);
    expect(await auth.token()).toMatch(/^token-/);
    TestBed.resetTestingModule();
    const admin = await start(undefined, { sub: '8', roles: ['MEMBER', 'ADMIN'] });
    expect([admin.auth.isStaff(), admin.auth.isAdmin()]).toEqual([true, true]);
  });

  it('not set up yet: nothing of the app starts, SiteStatus hears it - never installed, so the library’s page offers the setup page - and no sign-in is made', async () => {
    const { auth, client } = await start({ status: 503, body: NOT_SET_UP });
    expect(auth.state()).toBe('not-set-up');
    expect([TestBed.inject(SiteStatus).state(), TestBed.inject(SiteStatus).installed()]).toEqual(['not-set-up', false]);
    expect(client).toBeNull();
    expect(auth.caller()).toBe('nobody');
  });

  it('a server that does not answer, or refuses: what happened — a kind and a code, never a blank page and never a sentence', async () => {
    expect((await start('offline')).auth.problem()).toEqual({ kind: 'offline' });
    TestBed.resetTestingModule();
    const refusing = await start({ status: 503, body: { error: 'The database does not answer.', code: 'database_unavailable', detail: 'SQLSTATE[08006] connection refused' } });
    expect([refusing.auth.state(), refusing.auth.problem()]).toEqual(['problem', { kind: 'server', status: 503, code: 'database_unavailable', detail: 'SQLSTATE[08006] connection refused' }]);
    TestBed.resetTestingModule();
    expect((await start({ status: 502, body: '<html>Bad gateway</html>' })).auth.problem()).toEqual({ kind: 'server', status: 502, code: 'http_502', detail: null });
  });

  it('a server that names no IAM: the sign-in cannot be set up - the kind signIn', async () => {
    const { auth, client } = await start({ status: 200, body: { ...CONFIG, issuer: '' } });
    expect([auth.state(), auth.problem()]).toEqual(['problem', { kind: 'signIn', detail: null }]);
    expect(client).toBeNull();
  });

  it('cannotStart(): the problem page for whoever finds out the app cannot go on — but not set up stays not set up', async () => {
    const { auth } = await start(undefined, { sub: '7' });
    auth.cannotStart({ kind: 'server', status: 503, code: 'translations_unavailable', detail: null });
    expect([auth.state(), auth.problem()?.kind]).toEqual(['problem', 'server']);
    auth.notSetUp(true);
    expect(auth.state()).toBe('not-set-up');
    auth.cannotStart({ kind: 'offline' });
    expect(auth.state(), 'the more exact answer stays').toBe('not-set-up');
  });
});

describe('AuthService: the page and its person', () => {
  const realFetch = globalThis.fetch;

  afterEach(() => {
    globalThis.fetch = realFetch;
    localStorage.removeItem(VISITOR_STORAGE_KEY);
    vi.restoreAllMocks();
  });

  it('a session that ends while the page is open (signed out in another tab): the Sign in card stands in for the app', async () => {
    const { auth, client } = await start(undefined, { sub: '7' });
    await settle();
    client?.signOut();
    await settle();
    expect([auth.state(), auth.showSignIn()]).toEqual(['signed-out', true]);
  });

  it('somebody else signing in, in another tab: the page loads again, as them; the same person goes on', async () => {
    const { client, browser } = await start(undefined, { sub: '7' });
    client?.signIn({ sub: '7' });
    expect(browser.reloads).toBe(0);
    client?.signIn({ sub: '8' });
    expect(browser.reloads).toBe(1);
  });

  it('a visitor’s site that starts requiring sign-in (401 sign_in_required): the Sign in card from now on', async () => {
    const { auth } = await start({ status: 200, body: { ...CONFIG, login_required: false } });
    await settle();
    auth.signInRequiredNow();
    await settle();
    expect([auth.state(), auth.loginRequired(), auth.showSignIn()]).toEqual(['signed-out', true, true]);
  });

  it('a sign-in that came back without one: its code - never the IAM’s sentence - for the library’s screen, not the Sign in card; trying again goes back where it started', async () => {
    const { auth, client } = await start(undefined, null, { callback: refused('/exam?part=2', 'access_denied') });
    expect([auth.state(), auth.signInError(), auth.showSignIn()]).toEqual(['signed-out', { code: 'access_denied' }, false]);
    expect(await auth.login()).toBe(true);
    expect(client?.logins.at(-1)?.returnTo).toBe('/exam?part=2');
  });

  it('a sign-in that came back without one while visiting: kept for the page to say — never swallowed', async () => {
    const { auth } = await start({ status: 200, body: { ...CONFIG, login_required: false } }, null, { callback: refused('/', 'access_denied') });
    expect([auth.state(), auth.signInError()]).toEqual(['visiting', { code: 'access_denied' }]);
  });

  it('login(): the IAM’s pages in the language read here - and none named before the words are settled; signInAgain() asks for the password again', async () => {
    const { auth, client } = await start(undefined, null, { language: 'sk' });
    await auth.login('/kanji');
    expect(client?.logins.at(-1)).toEqual({ returnTo: '/kanji', uiLocales: 'sk' });
    await auth.signInAgain();
    expect(client?.logins.at(-1)?.prompt).toBe('login');
  });

  it('a sign-in that cannot start (the browser refuses the storage): false, and the code for the library’s screen', async () => {
    const { auth, client } = await start();
    vi.spyOn(client as FakeAuthClient, 'login').mockRejectedValue(Object.assign(new Error('no storage'), { code: 'storage_unavailable' }));
    expect(await auth.login()).toBe(false);
    expect(auth.signInError()).toEqual({ code: 'storage_unavailable' });
  });

  it('a visitor’s sign-in waits for the saves on their way, and asks before one that failed is left behind (the library’s beforeSignIn)', async () => {
    const { auth, client } = await start({ status: 200, body: { ...CONFIG, login_required: false } }, null, { language: 'sk' });
    const saves = TestBed.inject(SavesInFlight);
    let fail!: () => void;
    void saves.track(new Promise<void>((_resolve, reject) => (fail = () => reject(new Error('offline'))))).catch(() => undefined);
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(false);
    const going = auth.login();
    await settle();
    expect(client?.logins, 'not while an answer is on its way').toEqual([]);
    fail();
    expect(await going, 'the visitor chose to stay').toBe(false);
    expect(confirm).toHaveBeenCalledTimes(1);
    expect(client?.logins).toEqual([]);
  });

  it('logout(): the saves first, then the IAM ends the session; a learner who chooses to stay stays', async () => {
    const { auth, client } = await start(undefined, { sub: '7' });
    const saves = TestBed.inject(SavesInFlight);
    const release = saves.watch(() => 'signOut.examOpen');
    vi.spyOn(window, 'confirm').mockReturnValue(false);
    expect(await auth.logout()).toBe(false);
    expect(client?.logouts).toEqual([]);
    release();
    expect(await auth.logout()).toBe(true);
    expect(client?.logouts).toEqual([{ local: false }]);
  });

  it('savePreferences(): the account’s choice goes to the IAM through the library, one at a time', async () => {
    const { auth, client } = await start(undefined, { sub: '7', preferences: { theme: 'auto', date_format: null, time_format: null } });
    await auth.savePreferences({ theme: 'dark' });
    expect(client?.saved).toEqual([{ theme: 'dark' }]);
    expect(auth.preferences()?.theme).toBe('dark');
  });
});

describe('AuthService.fetch(): the app’s own addresses (a report, the data file), through the library', () => {
  const realFetch = globalThis.fetch;

  afterEach(() => {
    globalThis.fetch = realFetch;
    localStorage.removeItem(VISITOR_STORAGE_KEY);
    vi.restoreAllMocks();
  });

  it('a person’s: the page’s token and the reader’s time zone, never a visitor’s key; another site gets neither', async () => {
    localStorage.setItem(VISITOR_STORAGE_KEY, KEY);
    const started = await start(undefined, { sub: '7' }, { answers: { '/report/a-1': () => answer(200, { ok: true }) } });
    expect((await started.auth.fetch('/report/a-1', { headers: { 'X-Visitor-Key': KEY, Authorization: 'Bearer stray' } })).status).toBe(200);
    const sent = new Headers(started.fetches.at(-1)?.init.headers);
    expect([sent.get('Authorization'), sent.get('X-Visitor-Key'), sent.get('X-Time-Zone')]).toEqual([`Bearer ${await started.auth.token()}`, null, Intl.DateTimeFormat().resolvedOptions().timeZone]);
    await started.auth.fetch('https://elsewhere.test/x');
    expect(new Headers(started.fetches.at(-1)?.init.headers).get('Authorization')).toBeNull();
  });

  it('a visitor’s: the key this browser holds and the time zone, never a token; a 401 sign_in_required says the switch turned on', async () => {
    localStorage.setItem(VISITOR_STORAGE_KEY, KEY);
    const started = await start({ status: 200, body: { ...CONFIG, login_required: false } }, null, {
      answers: { '/report/a-1': () => answer(401, { error: 'Sign in first.', code: 'sign_in_required' }) },
    });
    expect((await started.auth.fetch('/report/a-1')).status).toBe(401);
    const sent = new Headers(started.fetches.at(-1)?.init.headers);
    expect([sent.get('Authorization'), sent.get('X-Visitor-Key')]).toEqual([null, KEY]);
    expect([started.auth.loginRequired(), started.auth.state()]).toEqual([true, 'signed-out']);
  });

  it('a 503 tells SiteStatus: being updated (the gate stands in, the sign-in goes on), or not set up after all', async () => {
    const started = await start(undefined, { sub: '7' }, {
      answers: {
        '/report/a-1': () => answer(503, { code: 'update_pending', message: 'The site is being updated.' }),
        '/api/me/data': () => answer(503, { ...NOT_SET_UP, installed: true }),
      },
    });
    await started.auth.fetch('/report/a-1');
    expect([TestBed.inject(SiteStatus).state(), started.auth.state()]).toEqual(['update-pending', 'ready']);
    await started.auth.fetch('/api/me/data');
    expect([started.auth.state(), TestBed.inject(SiteStatus).installed()]).toEqual(['not-set-up', true]);
  });
});
