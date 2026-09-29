import { provideZonelessChangeDetection } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { AuthService, describeSignInFailure } from './auth.service';

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

  it('a server that does not answer, or refuses: the reason, never a blank page', async () => {
    globalThis.fetch = vi.fn(() => Promise.reject(new TypeError('Failed to fetch'))) as unknown as typeof fetch;
    const auth = TestBed.inject(AuthService);
    await auth.init();
    expect(auth.state()).toBe('problem');
    expect(auth.problem()).toBe('Japanese Academy could not start: the server does not answer.');

    globalThis.fetch = server(403, { error: 'Without sign-in, Japanese Academy only answers this computer.' });
    const refused = TestBed.runInInjectionContext(() => new AuthService());
    await refused.init();
    expect(refused.problem()).toContain('only answers this computer');
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

describe('describeSignInFailure: what the Sign in page says', () => {
  it('access_denied: the IAM’s own sentence alone, ending with one full stop', () => {
    expect(describeSignInFailure({ code: 'access_denied', message: 'The sign-in was cancelled' })).toBe('The sign-in was cancelled.');
    expect(describeSignInFailure({ code: 'access_denied', message: 'This account cannot use Japanese Academy' })).toBe(
      'This account cannot use Japanese Academy.',
    );
    expect(describeSignInFailure({ code: 'access_denied', message: 'Confirm your email address first.' })).toBe('Confirm your email address first.');
    expect(describeSignInFailure({ code: 'access_denied' })).toBe('The sign-in was cancelled.');
  });

  it('anything else: signing in did not work, and why', () => {
    expect(describeSignInFailure({ code: 'invalid_grant', message: 'The code has expired' })).toBe('Signing in did not work: The code has expired');
    expect(describeSignInFailure({ code: 'state_mismatch', message: '' })).toBe('Signing in did not work: state_mismatch');
  });
});
