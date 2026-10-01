import { provideZonelessChangeDetection } from '@angular/core';
import { TestBed } from '@angular/core/testing';
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
  globalThis.fetch = server(200, { mode: 'iam', issuer: 'https://iam.test', clientId });
  return `anotoki-auth:${clientId}`;
}

/** A signed-in session as the SDK keeps it, for IAM user `sub`, with a token good for an hour. */
function session(sub: string, token = `token-of-${sub}`): string {
  return JSON.stringify({
    access_token: token,
    access_expires_at: Date.now() + 3_600_000,
    refresh_token: `refresh-of-${sub}`,
    id_token: null,
    user: { sub, preferred_username: `user-${sub}`, email: null, email_verified: false, locale: null, roles: ['MEMBER'] },
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

  it('without sign-in (auth mode none): the app, and no token for anything', async () => {
    globalThis.fetch = server(200, { mode: 'none' });
    const auth = TestBed.inject(AuthService);
    await auth.init();
    expect(auth.state()).toBe('ready');
    expect(auth.mode()).toBe('none');
    expect(auth.signsIn()).toBe(false);
    expect(await auth.token()).toBeNull();
    expect(auth.user()).toBeNull();
  });

  it('a website with nobody signed in: the Sign in page', async () => {
    globalThis.fetch = server(200, { mode: 'iam', issuer: 'https://iam.test', clientId: 'japanese-academy' });
    const auth = TestBed.inject(AuthService);
    await auth.init();
    expect(auth.state()).toBe('signed-out');
    expect(auth.signsIn()).toBe(true);
    expect(auth.accountUrl()).toBe('https://iam.test/account');
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

    // Opened through another host name or a tunnel, without sign-in: the server's own code for it.
    globalThis.fetch = server(403, { error: 'Sign-in is off here (auth mode none), and that only works on your own computer.', code: 'this_computer_only' });
    const refused = TestBed.runInInjectionContext(() => new AuthService());
    await refused.init();
    expect(refused.state()).toBe('problem');
    expect(refused.problem()).toEqual({ kind: 'server', status: 403, code: 'this_computer_only', detail: null });
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
    globalThis.fetch = server(200, { mode: 'iam', issuer: '', clientId: 'japanese-academy' });
    const auth = TestBed.inject(AuthService);
    await auth.init();
    expect(auth.state()).toBe('problem');
    const problem = auth.problem();
    expect(problem?.kind).toBe('signIn');
    expect(problem?.kind === 'signIn' ? problem.detail : null).toContain('issuer');
  });

  it('cannotStart(): the problem page for whoever finds out the app cannot go on — but not set up stays not set up', async () => {
    globalThis.fetch = server(200, { mode: 'none' });
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
    globalThis.fetch = server(200, { mode: 'none' });
    const auth = TestBed.inject(AuthService);
    await auth.init();
    expect(auth.state()).toBe('ready');
    globalThis.fetch = server(503, { error: 'Japanese Academy is not set up yet. Open /setup.php to set it up.', code: 'not_set_up', setup: '/setup.php' });
    const r = await auth.fetch('/api/kanji/export');
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
    otherTab(key, session('7'));
    expect(auth.state()).toBe('ready');
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

  it('its own fetch() (reports, the progress download) sends no token of somebody else either', async () => {
    const key = website('academy-test-fetch');
    localStorage.setItem(key, session('7'));
    const auth = TestBed.inject(AuthService);
    const reload = vi.spyOn(auth, 'reload').mockImplementation(() => undefined);
    await auth.init();
    const sent: (string | null)[] = [];
    globalThis.fetch = vi.fn((_input: RequestInfo | URL, init?: RequestInit) => {
      sent.push(new Headers(init?.headers).get('Authorization'));
      return Promise.resolve(new Response('{}', { status: sent.length === 1 ? 200 : 401 }));
    }) as unknown as typeof fetch;

    expect((await auth.fetch('/report/x')).status).toBe(200);
    expect(sent).toEqual(['Bearer token-of-7']);

    otherTab(key, session('8'));
    expect(reload).toHaveBeenCalledTimes(1);
    expect((await auth.fetch('/report/x')).status).toBe(401);
    expect(sent, 'without a token, and not tried again with theirs').toEqual(['Bearer token-of-7', null]);
  });
});

describe('AuthService: a sign-in that came back without one', () => {
  const realFetch = globalThis.fetch;

  /**
   * The IAM sends the browser back to /auth/callback with an error, for a
   * sign-in this page started (its state waiting in sessionStorage, as the SDK
   * keeps it): the real SDK finishes that callback.
   */
  async function comeBack(clientId: string, error: string, description: string): Promise<AuthService> {
    const state = `state-${clientId}`;
    sessionStorage.setItem(`anotoki-auth:${clientId}:login:${state}`, JSON.stringify({ verifier: 'v', nonce: 'n', returnTo: '/', createdAt: Date.now() }));
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

  it('keeps the code, and nothing of the IAM’s English sentence: the Sign in page words it', async () => {
    const auth = await comeBack('academy-test-denied', 'access_denied', 'This account cannot use Japanese Academy');
    expect(auth.state()).toBe('signed-out');
    expect(auth.signInError()).toEqual({ code: 'access_denied' });
    expect(JSON.stringify(auth.signInError())).not.toContain('cannot use');
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

  it('the name to show: the one in the IAM, else the address, else nothing — the account menu words that', async () => {
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

    await auth.login('sk');
    await auth.login();
    await auth.login('');
    expect(login.mock.calls).toEqual([[{ returnTo: '/kanji/reviews?x=1#top', uiLocales: 'sk' }], [{ returnTo: '/kanji/reviews?x=1#top' }], [{ returnTo: '/kanji/reviews?x=1#top' }]]);
    history.replaceState(null, '', '/');
  });
});
