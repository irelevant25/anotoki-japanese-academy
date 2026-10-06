import { provideZonelessChangeDetection } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { NO_CHOICE } from '../testing/auth-states';
import { AuthService } from './auth.service';

/** fetch() that answers GET /api/auth/config with this. */
function server(status: number, body: unknown): typeof fetch {
  return vi.fn(() => Promise.resolve(new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } }))) as unknown as typeof fetch;
}

/**
 * A website whose client id is this test's own, so that the SDKs of the other
 * tests (their storage listeners stay on the window) never hear its tabs.
 * Returns where the SDK keeps the session.
 */
function website(clientId: string): string {
  globalThis.fetch = server(200, { issuer: 'https://iam.test', clientId });
  return `anotoki-auth:${clientId}`;
}

/** A signed-in session as the SDK keeps it, for IAM user `sub`, with a token good for an hour (and this site's roles). */
function session(sub: string, token = `token-of-${sub}`, roles: string[] = []): string {
  return JSON.stringify({
    access_token: token,
    access_expires_at: Date.now() + 3_600_000,
    refresh_token: `refresh-of-${sub}`,
    id_token: null,
    user: { sub, preferred_username: `user-${sub}`, email: null, email_verified: false, locale: null, roles },
    updated_at: Date.now(),
  });
}

/** Another tab signs in (a session), refreshes, or signs out (null): what this tab hears of it. */
function otherTab(key: string, value: string | null): void {
  if (value === null) {
    localStorage.removeItem(key);
  } else {
    localStorage.setItem(key, value);
  }
  window.dispatchEvent(new StorageEvent('storage', { key }));
}

describe('AuthService: what the app can show', () => {
  const realFetch = globalThis.fetch;

  beforeEach(() => TestBed.configureTestingModule({ providers: [provideZonelessChangeDetection()] }));
  afterEach(() => {
    globalThis.fetch = realFetch;
    vi.restoreAllMocks();
  });

  it('the settings are the IAM’s address and the client id, asked for with the reader’s time zone; no mode', async () => {
    const asked = server(200, { issuer: 'https://iam.test', clientId: 'japanese-academy' });
    globalThis.fetch = asked;
    const auth = TestBed.inject(AuthService);
    await auth.init();
    expect(auth.accountUrl()).toBe('https://iam.test/account');
    const init = (asked as unknown as ReturnType<typeof vi.fn>).mock.calls[0][1] as RequestInit;
    expect(new Headers(init.headers).get('X-Time-Zone')).toBe(Intl.DateTimeFormat().resolvedOptions().timeZone);
  });

  it('nobody signed in: signed out, no token, and no Sign in card — the guard sends the browser to the IAM', async () => {
    const key = website('academy-test-nobody');
    localStorage.removeItem(key);
    const auth = TestBed.inject(AuthService);
    await auth.init();
    expect(auth.state()).toBe('signed-out');
    expect(await auth.token()).toBeNull();
    expect(auth.user()).toBeNull();
    expect(auth.showSignIn(), 'on the way to the IAM, nothing is drawn').toBe(false);
  });

  it('the roles from the IAM: EDITOR is staff, ADMIN is staff and admin, anything else (a stale MEMBER) a learner', async () => {
    const key = website('academy-test-roles');
    localStorage.setItem(key, session('7', 'token-of-7', ['member']));
    const auth = TestBed.inject(AuthService);
    vi.spyOn(auth, 'reload').mockImplementation(() => undefined);
    await auth.init();
    expect([auth.isStaff(), auth.isAdmin()]).toEqual([false, false]);

    otherTab(key, session('7', 'token-of-7', ['editor']));
    expect(auth.roles()).toEqual(['EDITOR']);
    expect([auth.isStaff(), auth.isAdmin()]).toEqual([true, false]);

    otherTab(key, session('7', 'token-of-7', ['ADMIN']));
    expect([auth.isStaff(), auth.isAdmin()]).toEqual([true, true]);
  });

  it('not set up yet: the page that says so, and why', async () => {
    globalThis.fetch = server(503, {
      error: 'Japanese Academy is not set up yet. Open /setup.php to set it up.',
      code: 'not_set_up',
      setup: '/setup.php',
      reason: 'backend/config/auth.local.php is missing',
    });
    const auth = TestBed.inject(AuthService);
    await auth.init();
    expect(auth.state()).toBe('not-set-up');
    expect(auth.notSetUpReason()).toBe('backend/config/auth.local.php is missing');
  });

  it('a server that does not answer, or refuses: what happened — a kind and a code, never a blank page and never a sentence', async () => {
    globalThis.fetch = vi.fn(() => Promise.reject(new TypeError('Failed to fetch'))) as unknown as typeof fetch;
    const auth = TestBed.inject(AuthService);
    expect(auth.problem()).toBeNull();
    await auth.init();
    expect(auth.state()).toBe('problem');
    expect(auth.problem()).toEqual({ kind: 'offline' });

    // A refusal with a code of the server's own.
    globalThis.fetch = server(403, { error: 'Forbidden.', code: 'forbidden' });
    const refused = TestBed.runInInjectionContext(() => new AuthService());
    await refused.init();
    expect(refused.state()).toBe('problem');
    expect(refused.problem()).toEqual({ kind: 'server', status: 403, code: 'forbidden', detail: null });
  });

  it('a failure with the reason the server gives the owner’s own computer: kept as the detail', async () => {
    globalThis.fetch = server(503, { error: 'The database is not reachable: connection refused', code: 'database_unavailable', detail: 'connection refused' });
    const auth = TestBed.inject(AuthService);
    await auth.init();
    expect(auth.state()).toBe('problem');
    expect(auth.problem()).toEqual({ kind: 'server', status: 503, code: 'database_unavailable', detail: 'connection refused' });
  });

  it('an answer that is not the API’s own (no code, or no JSON at all): the status stands for it', async () => {
    globalThis.fetch = server(500, { error: 'Something went wrong.' });
    const auth = TestBed.inject(AuthService);
    await auth.init();
    expect(auth.problem()).toEqual({ kind: 'server', status: 500, code: 'http_500', detail: null });

    globalThis.fetch = vi.fn(() => Promise.resolve(new Response('<html>Bad gateway</html>', { status: 502 }))) as unknown as typeof fetch;
    const proxied = TestBed.runInInjectionContext(() => new AuthService());
    await proxied.init();
    expect(proxied.problem()).toEqual({ kind: 'server', status: 502, code: 'http_502', detail: null });
  });

  it('a sign-in that cannot start (settings the IAM’s SDK refuses): the kind signIn, with the SDK’s own message as the detail', async () => {
    globalThis.fetch = server(200, { issuer: '', clientId: 'japanese-academy' });
    const auth = TestBed.inject(AuthService);
    await auth.init();
    expect(auth.state()).toBe('problem');
    const problem = auth.problem();
    expect(problem?.kind).toBe('signIn');
    expect(problem?.kind === 'signIn' ? problem.detail : null).toContain('issuer');
  });

  it('cannotStart(): the problem page for whoever finds out the app cannot go on — but not set up stays not set up', async () => {
    localStorage.setItem(website('academy-test-cannot'), session('7'));
    const auth = TestBed.inject(AuthService);
    await auth.init();
    expect(auth.state()).toBe('ready');
    auth.cannotStart({ kind: 'server', status: 503, code: 'not_up_to_date', detail: '004 failed' });
    expect(auth.state()).toBe('problem');
    expect(auth.problem()).toEqual({ kind: 'server', status: 503, code: 'not_up_to_date', detail: '004 failed' });

    const other = TestBed.runInInjectionContext(() => new AuthService());
    other.notSetUp('the database has no tables yet');
    other.cannotStart({ kind: 'offline' });
    expect(other.state()).toBe('not-set-up');
    expect(other.problem()).toBeNull();
  });

  it('not set up after all (a database missing), said by a later answer: the page that says so', async () => {
    localStorage.setItem(website('academy-test-later'), session('7'));
    const auth = TestBed.inject(AuthService);
    await auth.init();
    expect(auth.state()).toBe('ready');
    globalThis.fetch = server(503, { error: 'Japanese Academy is not set up yet. Open /setup.php to set it up.', code: 'not_set_up', setup: '/setup.php' });
    const r = await auth.fetch('/api/me/data');
    expect(r.status).toBe(503);
    expect(auth.state()).toBe('not-set-up');
    expect(auth.notSetUpReason()).toBeNull();
  });

  it('somebody else signing in, in another tab: the page loads again, as them', async () => {
    const key = website('academy-test-switch');
    localStorage.setItem(key, session('7'));
    const auth = TestBed.inject(AuthService);
    const reload = vi.spyOn(auth, 'reload').mockImplementation(() => undefined);
    await auth.init();
    expect(auth.state()).toBe('ready');
    expect(auth.subject()).toBe('7');

    otherTab(key, session('7', 'a-fresh-token'));
    expect(reload, 'a refresh of the same person’s token changes nothing').not.toHaveBeenCalled();
    expect(auth.state()).toBe('ready');
    expect(await auth.token()).toBe('a-fresh-token');

    otherTab(key, session('8'));
    expect(reload).toHaveBeenCalledTimes(1);
    expect(await auth.token(), 'until the page has loaded again, nothing goes out as the other person').toBeNull();
  });

  it('signed out there, then signed in again: the same person goes on, somebody else gets a fresh page', async () => {
    const key = website('academy-test-out-and-in');
    localStorage.setItem(key, session('7'));
    const auth = TestBed.inject(AuthService);
    const reload = vi.spyOn(auth, 'reload').mockImplementation(() => undefined);
    await auth.init();

    otherTab(key, null);
    expect(auth.state()).toBe('signed-out');
    expect(auth.showSignIn(), 'the app was open: the Sign in card stands in for it').toBe(true);
    otherTab(key, session('7'));
    expect(auth.state()).toBe('ready');
    expect(auth.showSignIn()).toBe(false);
    expect(reload).not.toHaveBeenCalled();

    otherTab(key, null);
    otherTab(key, session('8'));
    expect(reload).toHaveBeenCalledTimes(1);
  });

  it('signed out when the page loaded: a sign-in in another tab starts the app, with nothing to load again', async () => {
    const key = website('academy-test-first-in');
    localStorage.removeItem(key);
    const auth = TestBed.inject(AuthService);
    const reload = vi.spyOn(auth, 'reload').mockImplementation(() => undefined);
    await auth.init();
    expect(auth.state()).toBe('signed-out');

    otherTab(key, session('8'));
    expect(auth.state()).toBe('ready');
    expect(auth.subject()).toBe('8');
    expect(reload).not.toHaveBeenCalled();

    otherTab(key, session('9'));
    expect(reload, 'the app has started now: as 8').toHaveBeenCalledTimes(1);
  });

  it('once not set up, the sign-in changes nothing until a page load', async () => {
    const key = website('academy-test-not-set-up');
    localStorage.setItem(key, session('7'));
    const auth = TestBed.inject(AuthService);
    await auth.init();
    auth.notSetUp('the database academy_x does not exist');
    otherTab(key, session('7', 'a-fresh-token'));
    expect(auth.state()).toBe('not-set-up');
    expect(auth.notSetUpReason()).toBe('the database academy_x does not exist');
  });

  it('its own fetch() (reports, the data file) sends the token and the time zone to this site, and no token of somebody else', async () => {
    const key = website('academy-test-fetch');
    localStorage.setItem(key, session('7'));
    const auth = TestBed.inject(AuthService);
    const reload = vi.spyOn(auth, 'reload').mockImplementation(() => undefined);
    await auth.init();
    const sent: (string | null)[] = [];
    const zones: (string | null)[] = [];
    globalThis.fetch = vi.fn((_input: RequestInfo | URL, init?: RequestInit) => {
      sent.push(new Headers(init?.headers).get('Authorization'));
      zones.push(new Headers(init?.headers).get('X-Time-Zone'));
      return Promise.resolve(new Response('{}', { status: sent.length === 1 ? 200 : 401 }));
    }) as unknown as typeof fetch;

    expect((await auth.fetch('/report/x')).status).toBe(200);
    expect(sent).toEqual(['Bearer token-of-7']);
    expect(zones).toEqual([Intl.DateTimeFormat().resolvedOptions().timeZone]);

    otherTab(key, session('8'));
    expect(reload).toHaveBeenCalledTimes(1);
    const refused = await auth.fetch('/report/x');
    expect([refused.status, (await refused.json()).code]).toEqual([401, 'sign_in_required']);
    expect(sent, 'never sent: not as theirs, and not without a token').toEqual(['Bearer token-of-7']);
  });

  it('its own fetch() of a person’s never carries a visitor’s key, whatever it is handed', async () => {
    const key = website('academy-test-fetch-no-key');
    localStorage.setItem(key, session('7'));
    const auth = TestBed.inject(AuthService);
    await auth.init();
    let headers = new Headers();
    globalThis.fetch = vi.fn((_input: RequestInfo | URL, init?: RequestInit) => {
      headers = new Headers(init?.headers);
      return Promise.resolve(new Response('{}', { status: 200 }));
    }) as unknown as typeof fetch;
    await auth.fetch('/report/x', { headers: { 'X-Visitor-Key': 'k'.repeat(43) } }, 'v'.repeat(43));
    expect([headers.get('Authorization'), headers.get('X-Visitor-Key')]).toEqual(['Bearer token-of-7', null]);
  });
});

describe('AuthService: visitors, where the IAM does not require sign-in here', () => {
  const realFetch = globalThis.fetch;

  /** A website whose server relays the IAM's switch (and the days a visitor is kept), with nobody signed in. */
  function relaying(clientId: string, extra: Record<string, unknown>): string {
    globalThis.fetch = server(200, { issuer: 'https://iam.test', clientId, ...extra });
    localStorage.removeItem(`anotoki-auth:${clientId}`);
    return `anotoki-auth:${clientId}`;
  }

  beforeEach(() => TestBed.configureTestingModule({ providers: [provideZonelessChangeDetection()] }));
  afterEach(() => {
    globalThis.fetch = realFetch;
    history.replaceState(null, '', '/');
    vi.restoreAllMocks();
  });

  it('a server that says nothing of it requires sign-in (signed out, on the way to the IAM); only false lets visitors in', async () => {
    relaying('academy-test-v-silent', {});
    const silent = TestBed.inject(AuthService);
    await silent.init();
    expect([silent.loginRequired(), silent.state(), silent.visitorKeepDays()]).toEqual([true, 'signed-out', 30]);

    relaying('academy-test-v-true', { loginRequired: true, visitorKeepDays: 30 });
    const required = TestBed.runInInjectionContext(() => new AuthService());
    await required.init();
    expect([required.loginRequired(), required.state()]).toEqual([true, 'signed-out']);

    relaying('academy-test-v-garbage', { loginRequired: 'false', visitorKeepDays: -3 });
    const garbage = TestBed.runInInjectionContext(() => new AuthService());
    await garbage.init();
    expect([garbage.loginRequired(), garbage.state(), garbage.visitorKeepDays()]).toEqual([true, 'signed-out', 30]);
  });

  it('nobody signed in, sign-in not required: visiting — the app itself, for a visitor; no Sign in card; nobody’s name or roles', async () => {
    relaying('academy-test-v-off', { loginRequired: false, visitorKeepDays: 14 });
    const auth = TestBed.inject(AuthService);
    await auth.init();
    expect([auth.state(), auth.visiting(), auth.usable(), auth.signedIn()]).toEqual(['visiting', true, true, false]);
    expect([auth.loginRequired(), auth.visitorKeepDays()]).toEqual([false, 14]);
    expect(auth.showSignIn()).toBe(false);
    expect([auth.user(), auth.isStaff(), auth.caller()]).toEqual([null, false, 'visitor']);
  });

  it('a sign-in in another tab while visiting: a fresh page (it moves the visitor’s study in) — nothing loaded as the visitor stays on it', async () => {
    const key = relaying('academy-test-v-in', { loginRequired: false });
    const auth = TestBed.inject(AuthService);
    const reload = vi.spyOn(auth, 'reload').mockImplementation(() => undefined);
    await auth.init();
    otherTab(key, session('7'));
    expect(reload).toHaveBeenCalledTimes(1);
    expect(auth.state(), 'never ready for a person on a page loaded for a visitor').toBe('visiting');
  });

  it('a person’s page whose session ends never turns into a visitor’s: the Sign in card, as when sign-in is required', async () => {
    const key = relaying('academy-test-v-person', { loginRequired: false });
    localStorage.setItem(key, session('7'));
    const auth = TestBed.inject(AuthService);
    await auth.init();
    expect([auth.state(), auth.caller()]).toEqual(['ready', 'person']);
    otherTab(key, null);
    expect([auth.state(), auth.showSignIn(), auth.caller()]).toEqual(['signed-out', true, 'person']);
  });

  it('signInRequiredNow() (a visitor refused with 401 sign_in_required: the switch turned on): the Sign in card from now on', async () => {
    const key = relaying('academy-test-v-now', { loginRequired: false });
    const auth = TestBed.inject(AuthService);
    const reload = vi.spyOn(auth, 'reload').mockImplementation(() => undefined);
    await auth.init();
    auth.signInRequiredNow();
    expect([auth.loginRequired(), auth.state(), auth.showSignIn()]).toEqual([true, 'signed-out', true]);
    auth.refused();
    expect(auth.state(), 'not a visitor again').toBe('signed-out');
    otherTab(key, session('7'));
    expect(reload, 'a page shown to a visitor loads again for a person').toHaveBeenCalledTimes(1);
  });

  it('a sign-in that came back without one (access_denied: e.g. MEMBER taken away here) while visiting: kept for the page to say — never swallowed', async () => {
    const clientId = 'academy-test-v-denied';
    const state = `state-${clientId}`;
    sessionStorage.setItem(`anotoki-auth:${clientId}:login:${state}`, JSON.stringify({ verifier: 'v', nonce: 'n', returnTo: '/exam', createdAt: Date.now() }));
    history.replaceState(null, '', `/auth/callback?error=access_denied&error_description=No&state=${state}`);
    relaying(clientId, { loginRequired: false });
    const auth = TestBed.inject(AuthService);
    await auth.init();
    expect([auth.state(), auth.signInError(), auth.askedFor()]).toEqual(['visiting', { code: 'access_denied' }, '/exam']);
  });

  it('its own fetch() for a visitor: the key it is handed and the time zone, never a token; a 401 sign_in_required says the switch turned on', async () => {
    relaying('academy-test-v-fetch', { loginRequired: false });
    const auth = TestBed.inject(AuthService);
    await auth.init();
    const sent: Headers[] = [];
    let status = 200;
    globalThis.fetch = vi.fn((_input: RequestInfo | URL, init?: RequestInit) => {
      sent.push(new Headers(init?.headers));
      return Promise.resolve(new Response(JSON.stringify(status === 401 ? { code: 'sign_in_required' } : {}), { status }));
    }) as unknown as typeof fetch;

    await auth.fetch('/report/x', { headers: { Authorization: 'Bearer stray' } }, 'k'.repeat(43));
    expect([sent[0].get('Authorization'), sent[0].get('X-Visitor-Key'), sent[0].has('X-Time-Zone')]).toEqual([null, 'k'.repeat(43), true]);
    await auth.fetch('/report/x');
    expect(sent[1].has('X-Visitor-Key'), 'no key held: nobody').toBe(false);

    status = 401;
    expect((await auth.fetch('/report/x', {}, 'k'.repeat(43))).status).toBe(401);
    expect([auth.loginRequired(), auth.state()]).toEqual([true, 'signed-out']);
  });
});

describe('AuthService: a sign-in that came back without one', () => {
  const realFetch = globalThis.fetch;

  /**
   * The IAM sends the browser back to /auth/callback with an error, for a
   * sign-in this page started (its state waiting in sessionStorage, as the SDK
   * keeps it): the real SDK finishes that callback.
   */
  async function comeBack(clientId: string, error: string, description: string, returnTo = '/'): Promise<AuthService> {
    const state = `state-${clientId}`;
    sessionStorage.setItem(`anotoki-auth:${clientId}:login:${state}`, JSON.stringify({ verifier: 'v', nonce: 'n', returnTo, createdAt: Date.now() }));
    history.replaceState(null, '', `/auth/callback?error=${error}&error_description=${encodeURIComponent(description)}&state=${state}`);
    website(clientId);
    const auth = TestBed.inject(AuthService);
    await auth.init();
    return auth;
  }

  beforeEach(() => TestBed.configureTestingModule({ providers: [provideZonelessChangeDetection()] }));
  afterEach(() => {
    globalThis.fetch = realFetch;
    history.replaceState(null, '', '/');
  });

  it('keeps the code, and nothing of the IAM’s English sentence: the Sign in card words it', async () => {
    const auth = await comeBack('academy-test-denied', 'access_denied', 'This account cannot use Japanese Academy');
    expect(auth.state()).toBe('signed-out');
    expect(auth.signInError()).toEqual({ code: 'access_denied' });
    expect(auth.showSignIn(), 'the card, not a trip round to the IAM and back for ever').toBe(true);
    expect(JSON.stringify(auth.signInError())).not.toContain('cannot use');
  });

  it('keeps the address the refused sign-in started from: the card’s Sign in (login() with no address) goes back there, not to /', async () => {
    const auth = await comeBack('academy-test-deep', 'access_denied', 'No', '/exam?part=2');
    expect(auth.askedFor()).toBe('/exam?part=2');
    // The router, refused by the page's whenReady, puts / back in the address bar.
    history.replaceState(null, '', '/');
    const login = vi.fn(() => Promise.resolve());
    (auth as unknown as { sdk: { login: typeof login } }).sdk.login = login;
    expect(await auth.login('sk')).toBe(true);
    expect(login.mock.calls).toEqual([[{ returnTo: '/exam?part=2', uiLocales: 'sk' }]]);
  });

  it('any other failure: its code too', async () => {
    const auth = await comeBack('academy-test-failed', 'server_error', 'The IAM could not finish the sign-in');
    expect(auth.signInError()).toEqual({ code: 'server_error' });
  });

  it('a page load that was no callback has none', async () => {
    website('academy-test-plain');
    const auth = TestBed.inject(AuthService);
    await auth.init();
    expect(auth.signInError()).toBeNull();
    expect(auth.askedFor()).toBeNull();
  });
});

describe('AuthService: what it hands to the pages', () => {
  const realFetch = globalThis.fetch;

  beforeEach(() => TestBed.configureTestingModule({ providers: [provideZonelessChangeDetection()] }));
  afterEach(() => {
    globalThis.fetch = realFetch;
    vi.restoreAllMocks();
  });

  /** A signed-in session whose person has this name and address. */
  function named(sub: string, name: string | null, email: string | null): string {
    const kept = JSON.parse(session(sub)) as { user: Record<string, unknown> };
    kept.user['preferred_username'] = name;
    kept.user['email'] = email;
    return JSON.stringify(kept);
  }

  it('the name to show: the one in the IAM, else the address, else nothing — the top bar words that', async () => {
    const auth = TestBed.inject(AuthService);
    expect(auth.displayName(), 'nobody signed in').toBe('');

    const key = website('academy-test-names');
    localStorage.setItem(key, named('7', 'Hana', 'hana@example.test'));
    vi.spyOn(auth, 'reload').mockImplementation(() => undefined);
    await auth.init();
    expect(auth.displayName()).toBe('Hana');

    otherTab(key, named('7', null, 'hana@example.test'));
    expect(auth.displayName()).toBe('hana@example.test');

    otherTab(key, named('7', null, null));
    expect(auth.state()).toBe('ready');
    expect(auth.displayName(), 'no English word of its own').toBe('');
  });

  it('login() takes the language from its caller, and says nothing of it when there is none', async () => {
    website('academy-test-login');
    history.replaceState(null, '', '/kanji/reviews?x=1#top');
    const auth = TestBed.inject(AuthService);
    await auth.init();
    // The SDK would leave the page: a stand-in takes the call instead.
    const login = vi.fn(() => Promise.resolve());
    (auth as unknown as { sdk: { login: typeof login } }).sdk.login = login;

    expect(await auth.login('sk')).toBe(true);
    await auth.login();
    await auth.login('');
    await auth.login('sk', '/exam');
    expect(login.mock.calls).toEqual([
      [{ returnTo: '/kanji/reviews?x=1#top', uiLocales: 'sk' }],
      [{ returnTo: '/kanji/reviews?x=1#top' }],
      [{ returnTo: '/kanji/reviews?x=1#top' }],
      [{ returnTo: '/exam', uiLocales: 'sk' }],
    ]);
    history.replaceState(null, '', '/');
  });

  it('a sign-in that cannot start (the browser refuses the storage): false, and the code for the Sign in card', async () => {
    website('academy-test-no-storage');
    const auth = TestBed.inject(AuthService);
    await auth.init();
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const refused = Object.assign(new Error('This browser will not let the site remember the sign-in in progress'), { code: 'storage_unavailable' });
    (auth as unknown as { sdk: { login: () => Promise<void> } }).sdk.login = () => Promise.reject(refused);
    expect(await auth.login('en')).toBe(false);
    expect(auth.signInError()).toEqual({ code: 'storage_unavailable' });
    expect(auth.showSignIn()).toBe(true);

    (auth as unknown as { sdk: { login: () => Promise<void> } }).sdk.login = () => Promise.reject(new Error('no code'));
    await auth.login();
    expect(auth.signInError()).toEqual({ code: 'could_not_start' });
  });
});

describe('AuthService: the account’s preferences (the IAM’s SDK 1.2.0)', () => {
  const realFetch = globalThis.fetch;

  beforeEach(() => TestBed.configureTestingModule({ providers: [provideZonelessChangeDetection()] }));
  afterEach(() => {
    globalThis.fetch = realFetch;
    vi.restoreAllMocks();
  });

  /** A signed-in session whose account has these preferences — none at all (`undefined`): kept by an SDK from before them. */
  function withPreferences(sub: string, preferences?: unknown, ranOut = false): string {
    const kept = JSON.parse(session(sub)) as { access_expires_at: number; user: Record<string, unknown> };
    if (preferences !== undefined) {
      kept.user['preferences'] = preferences;
    }
    if (ranOut) {
      kept.access_expires_at = Date.now() - 1000;
    }
    return JSON.stringify(kept);
  }

  /** fetch() that records what it is asked and answers each with `status` and `body` — or, given an Error, fails as an unreachable server does. */
  function iam(status: number | Error, body: unknown = {}): { url: string; method: string | undefined; bearer: string | null; body: unknown }[] {
    const asked: { url: string; method: string | undefined; bearer: string | null; body: unknown }[] = [];
    globalThis.fetch = vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
      asked.push({ url: String(input), method: init?.method, bearer: new Headers(init?.headers).get('Authorization'), body: typeof init?.body === 'string' ? JSON.parse(init.body) : init?.body });
      return status instanceof Error ? Promise.reject(status) : Promise.resolve(new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } }));
    }) as unknown as typeof fetch;
    return asked;
  }

  it('preferences: the account’s theme, date order and clock while the page is a signed-in person’s — null from an SDK or an IAM before them, and when nobody is', async () => {
    const key = website('academy-test-prefs');
    localStorage.setItem(key, withPreferences('7'));
    const auth = TestBed.inject(AuthService);
    expect(auth.preferences(), 'before the start').toBeNull();
    await auth.init();
    expect(auth.state()).toBe('ready');
    expect(auth.preferences(), 'kept by an SDK from before them: none known yet').toBeNull();

    const chosen = { theme: 'dark', date_format: 'ymd_dash', time_format: '12' };
    otherTab(key, withPreferences('7', chosen));
    expect(auth.preferences(), 'read again at every change the SDK hears of').toEqual(chosen);
    expect(auth.user()?.preferences).toEqual(chosen);

    otherTab(key, null);
    expect([auth.state(), auth.preferences()]).toEqual(['signed-out', null]);
  });

  it('savePreferences(): the change goes to the IAM with the page’s own token, and the account as it now stands is the page’s at once', async () => {
    const key = website('academy-test-save');
    localStorage.setItem(key, withPreferences('7', NO_CHOICE));
    const auth = TestBed.inject(AuthService);
    await auth.init();
    const answer = { locale: 'sk', preferences: { theme: 'dark', date_format: null, time_format: '24' } };
    const asked = iam(200, answer);

    expect(await auth.savePreferences({ theme: 'dark' })).toEqual(answer);
    expect(asked).toEqual([{ url: 'https://iam.test/api/oidc/preferences', method: 'POST', bearer: 'Bearer token-of-7', body: { theme: 'dark' } }]);
    expect(auth.preferences()).toEqual(answer.preferences);
    expect(auth.user()?.locale).toBe('sk');
    expect(JSON.parse(localStorage.getItem(key) ?? '{}').user.preferences, 'and every tab’s').toEqual(answer.preferences);
  });

  it('savePreferences(): nothing is sent for a page that is nobody’s, or while the SDK holds somebody else’s session (signed in in another tab)', async () => {
    const nobodyKey = website('academy-test-save-nobody');
    localStorage.removeItem(nobodyKey);
    const nobody = TestBed.inject(AuthService);
    await nobody.init();
    let asked = iam(200);
    await expect(nobody.savePreferences({ theme: 'dark' })).rejects.toMatchObject({ code: 'login_required' });
    expect(asked).toEqual([]);

    const key = website('academy-test-save-other');
    localStorage.setItem(key, withPreferences('7', NO_CHOICE));
    const page = TestBed.runInInjectionContext(() => new AuthService());
    const reload = vi.spyOn(page, 'reload').mockImplementation(() => undefined);
    await page.init();
    otherTab(key, withPreferences('8', NO_CHOICE));
    expect(reload).toHaveBeenCalledTimes(1);
    asked = iam(200);
    await expect(page.savePreferences({ theme: 'dark' })).rejects.toMatchObject({ code: 'login_required' });
    expect(asked, 'never as the other person').toEqual([]);
  });

  it('savePreferences(): one save at a time, whoever asks — each answer is the whole account, so the next goes once the one before has its answer, refused or not', async () => {
    const key = website('academy-test-save-queue');
    localStorage.setItem(key, withPreferences('7', NO_CHOICE));
    const auth = TestBed.inject(AuthService);
    await auth.init();
    const sent: unknown[] = [];
    const answers: ((response: Response) => void)[] = [];
    globalThis.fetch = vi.fn((_input: RequestInfo | URL, init?: RequestInit) => {
      sent.push(JSON.parse(String(init?.body)));
      return new Promise<Response>((answer) => answers.push(answer));
    }) as unknown as typeof fetch;
    const json = (status: number, body: unknown): Response => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
    const turn = (): Promise<void> => new Promise((done) => setTimeout(done));

    const theme = auth.savePreferences({ theme: 'dark' });
    const language = auth.savePreferences({ language: 'sk' });
    const clock = auth.savePreferences({ time_format: '12' });
    await turn();
    expect(sent, 'the language waits for the theme’s answer').toEqual([{ theme: 'dark' }]);

    answers[0](json(400, { error: 'invalid_request', error_description: 'No' }));
    await expect(theme).rejects.toMatchObject({ code: 'invalid_request' });
    await turn();
    expect(sent, 'a refusal does not hold the next one up').toEqual([{ theme: 'dark' }, { language: 'sk' }]);

    answers[1](json(200, { locale: 'sk', preferences: NO_CHOICE }));
    expect(await language).toEqual({ locale: 'sk', preferences: NO_CHOICE });
    await turn();
    expect(sent).toEqual([{ theme: 'dark' }, { language: 'sk' }, { time_format: '12' }]);
    answers[2](json(200, { locale: 'sk', preferences: { ...NO_CHOICE, time_format: '12' } }));
    await clock;
    expect([auth.user()?.locale, auth.preferences()?.time_format]).toEqual(['sk', '12']);
  });

  it('savePreferences(): a refusal comes with the IAM’s code, the account left as it was; an IAM out of reach is `network`', async () => {
    const key = website('academy-test-save-refused');
    localStorage.setItem(key, withPreferences('7', NO_CHOICE));
    const auth = TestBed.inject(AuthService);
    await auth.init();

    iam(400, { error: 'invalid_request', error_description: 'That language is not offered here' });
    await expect(auth.savePreferences({ language: 'ja' })).rejects.toMatchObject({ code: 'invalid_request' });
    expect(auth.preferences()).toEqual(NO_CHOICE);

    iam(new TypeError('Failed to fetch'));
    await expect(auth.savePreferences({ theme: 'dark' })).rejects.toMatchObject({ code: 'network' });

    // A token that ran out, and the IAM out of reach for a new one: said as such, and nothing goes to the preferences.
    localStorage.setItem('anotoki-auth:academy-test-save-ran-out', withPreferences('7', NO_CHOICE, true));
    const urls: string[] = [];
    globalThis.fetch = vi.fn((input: RequestInfo | URL) => {
      const url = String(input);
      urls.push(url);
      return url === '/api/auth/config'
        ? Promise.resolve(new Response(JSON.stringify({ issuer: 'https://iam.test', clientId: 'academy-test-save-ran-out' }), { status: 200 }))
        : Promise.reject(new TypeError('Failed to fetch'));
    }) as unknown as typeof fetch;
    const stale = TestBed.runInInjectionContext(() => new AuthService());
    await stale.init();
    expect(stale.state(), 'the session is kept, to be tried again').toBe('ready');
    await expect(stale.savePreferences({ theme: 'dark' })).rejects.toMatchObject({ code: 'network' });
    expect(urls.filter((url) => url.endsWith('/api/oidc/preferences'))).toEqual([]);
  });
});
