import { computed, Injectable, signal } from '@angular/core';
import { ApiErrorBody, AuthConfig } from '../api/api.types';
// No extension on purpose: TypeScript reads the types of a `.mjs` specifier only
// from a `.d.mts`; written like this it finds the SDK's own `.d.ts`, and the
// bundler, which tries `.mjs` after `.ts`, finds the code.
import { type AnotokiAuth, type AnotokiUser, createAuth } from './sdk/anotoki-auth';

/** Where the IAM sends the browser back after a sign-in: a route of this app. */
export const AUTH_CALLBACK_PATH = '/auth/callback';

/**
 * What the app can show:
 *   starting     it asks the server how this copy signs people in
 *   ready        the app itself (no sign-in, or signed in)
 *   signed-out   a website, nobody signed in: the Sign in page stands in for the app
 *   not-set-up   the server has no settings yet, or no database with its tables
 *                (any answer 503 not_set_up says so): the page that points at /setup.php
 *   problem      the server could not say (it does not answer): the reason
 */
export type AppState = 'starting' | 'ready' | 'signed-out' | 'not-set-up' | 'problem';

/** Is this the server's answer for a copy that is not set up (503 {"code": "not_set_up"})? */
export function isNotSetUp(status: number, body: unknown): boolean {
  return status === 503 && !!body && typeof body === 'object' && (body as ApiErrorBody).code === 'not_set_up';
}

/**
 * What the Sign in page says about a sign-in that did not work. For
 * access_denied the IAM's own sentence is the whole of it, as the IAM means
 * it to be shown: "The sign-in was cancelled" when the person went back from
 * its page, or the refusal itself ("This account cannot use Japanese
 * Academy", "Confirm your email address first"). The app decides nothing from
 * those words (the IAM's docs/api.md). Anything else is a failure of the
 * sign-in itself, and says so.
 */
export function describeSignInFailure(failure: { code?: string; message?: string }): string {
  if (failure.code === 'access_denied') {
    return failure.message ? `${failure.message.trim().replace(/\.$/, '')}.` : 'The sign-in was cancelled.';
  }
  return `Signing in did not work: ${failure.message || failure.code || 'unknown'}`;
}

/**
 * Sign-in, through the anotoki IAM (docs/kb/sign-in.md).
 *
 * It asks the server how this copy signs people in (GET /api/auth/config):
 *   none  the owner's computer: nothing to do, and nothing on the page changes
 *   iam   a website: the IAM's browser SDK (sdk/anotoki-auth.mjs, v1.1.1, copied
 *         unchanged from the IAM's sdk/js/) finishes a sign-in coming back to
 *         /auth/callback, or restores the session from an earlier one, before
 *         the router's first navigation. Signed in, the top bar shows who, with
 *         their IAM account page and Sign out; signed out, a Sign in page stands
 *         in for the app.
 *
 * The app talks to its server through the HTTP interceptor, which sends the
 * access token (refreshed by the SDK before it runs out) to this site only.
 * Links the browser would follow by itself can't carry a token: the reports and
 * the progress download go through PrivateLinksService.
 *
 * A page is one person's. What it loaded stays in root services (the kanji
 * state, the exam's paper), so when somebody else signs in, in another tab,
 * the page loads again, as them — as the pages before Angular did.
 */
@Injectable({ providedIn: 'root' })
export class AuthService {
  private sdk: AnotokiAuth | null = null;
  /** Whose the page is: the IAM user id signed in when the app became ready (undefined until then). */
  private shownFor: string | undefined;

  private readonly stateSignal = signal<AppState>('starting');
  private readonly modeSignal = signal<'none' | 'iam' | null>(null);
  private readonly userSignal = signal<AnotokiUser | null>(null);

  readonly state = this.stateSignal.asReadonly();
  readonly mode = this.modeSignal.asReadonly();
  readonly user = this.userSignal.asReadonly();
  /** Why the app could not start (state problem). */
  readonly problem = signal('');
  /** Why the server says it is not set up (state not-set-up; only to this computer, and not always). */
  readonly notSetUpReason = signal<string | null>(null);
  /** What the Sign in page says about a sign-in that came back without one (describeSignInFailure()). */
  readonly signInError = signal<string | null>(null);

  /** The name to show: the one in the IAM, or the address. */
  readonly displayName = computed(() => {
    const user = this.userSignal();
    return user ? user.preferred_username || user.email || 'Account' : '';
  });

  /**
   * Once, before the router's first navigation (provideAppInitializer). Never
   * rejects: an app whose sign-in cannot start still has to say why.
   */
  async init(): Promise<void> {
    let config: AuthConfig;
    try {
      const r = await fetch('/api/auth/config').catch(() => {
        throw new Error('the server does not answer.');
      });
      const body = (await r.json().catch(() => ({}))) as AuthConfig & ApiErrorBody;
      if (isNotSetUp(r.status, body)) {
        this.notSetUp(body.reason);
        return;
      }
      if (!r.ok) {
        throw new Error(body.error || r.statusText);
      }
      config = body;
    } catch (e) {
      this.fail(e);
      return;
    }

    this.modeSignal.set(config.mode);
    if (config.mode !== 'iam') {
      this.stateSignal.set('ready');
      return;
    }
    try {
      this.sdk = createAuth({
        issuer: String(config.issuer),
        clientId: String(config.clientId),
        // both registered at the IAM for this client, byte for byte
        redirectUri: location.origin + AUTH_CALLBACK_PATH,
        postLogoutRedirectUri: location.origin + '/',
      });
      // A callback: the code exchanged, and the address the person started
      // from put back in the address bar, so the router draws that page.
      const { error } = await this.sdk.init();
      if (error) {
        this.signInError.set(describeSignInFailure({ code: String(error.code || ''), message: error.message }));
      }
    } catch (e) {
      this.fail(e);
      return;
    }
    // Signed out in another tab, or the IAM ended the session; or signed in
    // there, perhaps as somebody else.
    this.sdk.onChange(() => this.follow());
    this.follow();
  }

  /** The IAM's page for the account itself. */
  accountUrl(): string {
    return this.sdk ? this.sdk.accountUrl() : '';
  }

  /** Off to the IAM's sign-in, coming back to the page the person is on. */
  async login(): Promise<void> {
    if (!this.sdk) {
      return;
    }
    await this.sdk.login({ returnTo: location.pathname + location.search + location.hash });
  }

  /** Signs out everywhere: the IAM ends its session and sends the browser back to /. */
  async logout(): Promise<void> {
    await this.sdk?.logout();
  }

  /** A valid access token, or null: no sign-in here, nobody signed in, or somebody else than whose the page is. */
  async token(): Promise<string | null> {
    return this.sdk ? this.ownToken(await this.sdk.getAccessToken()) : null;
  }

  /** After the API refused the current token: a different one, or null. */
  async refreshToken(): Promise<string | null> {
    return this.sdk ? this.ownToken(await this.sdk.refresh()) : null;
  }

  /**
   * The token, while it is of the person the page shows. Between somebody
   * else's sign-in in another tab and this page's reload (follow()) the SDK
   * holds their session already: what this page sends meanwhile goes without
   * a token, and is refused, rather than go out as theirs.
   */
  private ownToken(token: string | null): string | null {
    return this.shownFor === undefined || (this.sdk?.user()?.sub ?? '') === this.shownFor ? token : null;
  }

  /** Does this copy sign people in at all? */
  signsIn(): boolean {
    return this.sdk !== null;
  }

  /** The IAM user id of whoever is signed in here now, or null (nobody, or no sign-in). */
  subject(): string | null {
    return this.sdk?.user()?.sub ?? null;
  }

  /** The API answered 401: when the session is over, the Sign in page; when it is somebody else's now, a fresh page. */
  refused(): void {
    this.follow();
  }

  /**
   * The server answered 503 not_set_up (at start, or later: a copy with its
   * settings, whose database is missing or has no tables yet, says so at the
   * first address with data). The page that points at /setup.php, until a page
   * load after the setup.
   */
  notSetUp(reason?: string | null): void {
    this.notSetUpReason.set(reason ?? null);
    this.stateSignal.set('not-set-up');
  }

  /**
   * fetch() for the app's own addresses, with the token — to this site only,
   * and only the page's own person's (token()). The same as the interceptor
   * does for HttpClient: a 401 to a token that looked good gets one fresh
   * token and one retry, for the same person only. (The SDK's fetch() would
   * send its token wherever it is asked to, and whoever's it holds.)
   */
  async fetch(url: string, init: RequestInit = {}): Promise<Response> {
    let r: Response;
    if (!this.sdk || !isThisSite(url)) {
      r = await fetch(url, init);
    } else {
      const send = (token: string | null): Promise<Response> => {
        const headers = new Headers(init.headers ?? {});
        if (token) {
          headers.set('Authorization', `Bearer ${token}`);
        }
        return fetch(url, { ...init, headers });
      };
      const token = await this.token();
      const whose = this.subject();
      r = await send(token);
      if (r.status === 401 && token) {
        const renewed = await this.refreshToken();
        if (renewed && renewed !== token && this.subject() === whose) {
          r = await send(renewed);
        }
      }
    }
    if (r.status === 401 && this.sdk) {
      this.refused();
    } else if (r.status === 503 && isThisSite(url)) {
      const body: unknown = await r
        .clone()
        .json()
        .catch(() => null);
      if (isNotSetUp(r.status, body)) {
        this.notSetUp((body as ApiErrorBody).reason);
      }
    }
    return r;
  }

  /** A fresh load of the page (its own method, for the tests to stand in for). */
  reload(): void {
    location.reload();
  }

  /**
   * Brings the page in line with the SDK: signed in, or the Sign in page. Once
   * the app has been shown, somebody else signed in (in another tab, even after
   * a sign-out there) means a fresh page: nothing loaded for the one before may
   * be shown to them, or sent as theirs.
   */
  private follow(): void {
    const sdk = this.sdk;
    const state = this.stateSignal();
    // not set up, or it could not start: only a page load changes that
    if (!sdk || state === 'not-set-up' || state === 'problem') {
      return;
    }
    if (!sdk.isAuthenticated()) {
      this.userSignal.set(null);
      this.stateSignal.set('signed-out');
      return;
    }
    const user = sdk.user();
    const sub = user?.sub ?? '';
    if (this.shownFor !== undefined && sub !== this.shownFor) {
      this.reload();
      return;
    }
    this.shownFor = sub;
    this.userSignal.set(user);
    this.stateSignal.set('ready');
  }

  private fail(e: unknown): void {
    this.problem.set(`Japanese Academy could not start: ${e instanceof Error ? e.message : String(e)}`);
    this.stateSignal.set('problem');
  }
}

/** Is this address on this site? The token goes nowhere else. */
export function isThisSite(url: string): boolean {
  try {
    return new URL(url, location.href).origin === location.origin;
  } catch {
    return false;
  }
}
