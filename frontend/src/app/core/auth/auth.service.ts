import { computed, Injectable, signal } from '@angular/core';
import { errorCode } from '../api/api.service';
import { ApiErrorBody, AuthConfig } from '../api/api.types';
import { browserTimeZone, TIME_ZONE_HEADER } from '../time-zone';
import { VISITOR_KEY_HEADER } from './issued-as';
// No extension on purpose: TypeScript reads the types of a `.mjs` specifier only
// from a `.d.mts`; written like this it finds the SDK's own `.d.ts`, and the
// bundler, which tries `.mjs` after `.ts`, finds the code.
import { type AnotokiAuth, type AnotokiUser, createAuth } from './sdk/anotoki-auth';

/** Where the IAM sends the browser back after a sign-in: a route of this app. */
export const AUTH_CALLBACK_PATH = '/auth/callback';

/**
 * What the app can show:
 *   starting     it asks the server for the IAM's address and this site's client id
 *   ready        somebody is signed in: the app itself
 *   visiting     nobody is signed in, and the IAM does not require it here
 *                (`loginRequired` false, relayed by the server): the app itself,
 *                for a visitor — whose study the server keeps under a key this
 *                browser holds (core/auth/visitor-key.ts), from their first save
 *   signed-out   nobody is signed in: on the way to the IAM (signInGuard sends
 *                every page there), or the Sign in card when a sign-in came back
 *                without one, could not start, or the session ended while the
 *                page was open (showSignIn)
 *   not-set-up   the server has no settings yet, or no database with its tables
 *                (any answer 503 not_set_up says so): the page that points at /setup.php
 *   problem      the app cannot start (the server does not answer, or refuses): what happened
 */
export type AppState = 'starting' | 'ready' | 'visiting' | 'signed-out' | 'not-set-up' | 'problem';

/**
 * Whom a request of this site's own API is for, decided when it is issued
 * (auth.interceptor.ts, AuthService.fetch()) — from what the page is shown
 * as, never from whether a token happens to be there when it leaves:
 *   person    the page is a person's (or the sign-in is set up and nobody
 *             visits): the token, or the request is never sent (a 401
 *             sign_in_required of its own) — never a visitor's, never one that
 *             makes a visitor
 *   visitor   the page is shown to a visitor (state visiting): the visitor key,
 *             never a token
 *   nobody    the sign-in is not set up (not set up, could not start, still
 *             starting): neither, as before there were visitors
 */
export type Caller = 'person' | 'visitor' | 'nobody';

/** How many days a visitor's study is kept after their last visit, when the server does not say (VISITORS_DEFAULTS keep_days). */
export const VISITOR_KEEP_DAYS = 30;

/**
 * Why the app cannot start (state problem) — what happened, never a sentence:
 * the problem page words it, in the reader's language.
 *   offline  no answer at all
 *   server   the server answered, but not with what the app starts from: its
 *            status and code (errorCode()), and — from the owner's own
 *            computer only — the reason in the server's English words
 *   signIn   the sign-in itself could not be set up: the IAM's SDK's own
 *            message, English, shown small after the page's words
 */
export type StartProblem =
  | { kind: 'offline' }
  | { kind: 'server'; status: number; code: string; detail: string | null }
  | { kind: 'signIn'; detail: string | null };

/**
 * A sign-in that came back without one, or could not even start: the code
 * the IAM or its SDK gave ("access_denied", "state_mismatch",
 * "storage_unavailable"…), '' when there was none. Their English sentence is
 * not kept: the Sign in card words the failure from the code
 * (signInFailureKey() in core/i18n/error-text.ts).
 */
export interface SignInFailure {
  code: string;
}

/** Is this the server's answer for a copy that is not set up (503 {"code": "not_set_up"})? */
export function isNotSetUp(status: number, body: unknown): boolean {
  return status === 503 && !!body && typeof body === 'object' && (body as ApiErrorBody).code === 'not_set_up';
}

/** The reason a failure's body gives to the owner's own computer (`detail`), or null. */
function detailOf(body: unknown): string | null {
  const detail = body && typeof body === 'object' ? (body as ApiErrorBody).detail : undefined;
  return typeof detail === 'string' && detail !== '' ? detail : null;
}

/**
 * Sign-in, through the anotoki IAM: the one way in (docs/kb/sign-in.md).
 *
 * It asks the server where the IAM is, which client this site is and whether
 * the IAM requires sign-in here (GET /api/auth/config, `{issuer, clientId,
 * loginRequired, visitorKeepDays}`), then the IAM's browser SDK
 * (sdk/anotoki-auth.mjs, v1.1.1, copied unchanged from the IAM's sdk/js/)
 * finishes a sign-in coming back to /auth/callback, or restores the session
 * from an earlier one, before the router's first navigation. Nobody signed in,
 * every page sends the browser to the IAM (signInGuard) and it comes back to
 * that page; the Sign in card is drawn only after a sign-in that came back
 * without one or could not start (`signInError`), or when the session ends
 * while the page is open. Unless the IAM does not require sign-in here
 * (`loginRequired` false): then nobody signed in is a visitor (state
 * visiting), and the app is theirs — except the admin panel and Your data.
 * A page shown to a visitor loads again when somebody signs in in another tab
 * (nothing loaded as the visitor stays on it); a page shown to a person never
 * turns into a visitor's (its session ended: the Sign in card).
 *
 * The app talks to its server through the HTTP interceptor, which sends the
 * access token (refreshed by the SDK before it runs out) and the reader's
 * time zone to this site only. Links the browser would follow by itself can't
 * carry a token: the reports go through PrivateLinksService, and the data
 * file is fetched with fetch() here.
 *
 * A page is one person's. What it loaded stays in root services (the kanji
 * state, the exam's paper), so when somebody else signs in, in another tab,
 * the page loads again, as them.
 *
 * It holds what happened — a state, a kind, a code — and never a sentence: the
 * pages word it (core/i18n). And it never asks the translation service for
 * anything (that one needs this one, which would close a circle): the language
 * the IAM's pages should open in is handed to login() by its caller. Nor
 * VisitorKey (which reads this one): fetch() is handed the key by its caller.
 */
@Injectable({ providedIn: 'root' })
export class AuthService {
  private sdk: AnotokiAuth | null = null;
  /** Whose the page is: the IAM user id signed in when the app became ready (undefined until then). */
  private shownFor: string | undefined;
  /** The page has been shown to a visitor: a sign-in (in another tab) means a fresh page. */
  private shownAsVisitor = false;

  private readonly stateSignal = signal<AppState>('starting');
  private readonly userSignal = signal<AnotokiUser | null>(null);

  readonly state = this.stateSignal.asReadonly();
  readonly user = this.userSignal.asReadonly();
  /**
   * Whether the IAM requires sign-in here, as the server relays it at the
   * start (true unless it says false). Set to true later when a visitor's
   * request is refused with 401 sign_in_required (the switch turned on
   * meanwhile): signInRequiredNow().
   */
  readonly loginRequired = signal(true);
  /** How many days the server keeps a visitor's study after their last visit (the visitor notice says it). */
  readonly visitorKeepDays = signal(VISITOR_KEEP_DAYS);
  /** Somebody is signed in, and the page is theirs. */
  readonly signedIn = computed(() => this.stateSignal() === 'ready');
  /** Nobody is signed in, where the IAM does not require it: the app is shown to a visitor. */
  readonly visiting = computed(() => this.stateSignal() === 'visiting');
  /** The app itself is shown: to a person, or to a visitor. */
  readonly usable = computed(() => this.signedIn() || this.visiting());
  private readonly problemSignal = signal<StartProblem | null>(null);
  /** Why the app could not start (state problem), else null. */
  readonly problem = this.problemSignal.asReadonly();
  /** Why the server says it is not set up (state not-set-up; only to this computer, and not always). */
  readonly notSetUpReason = signal<string | null>(null);
  /**
   * The sign-in this page load came back from without one — or the last one
   * that could not start: its code, for the Sign in card to word. Never
   * cleared: the page load after a sign-in starts clean.
   */
  readonly signInError = signal<SignInFailure | null>(null);
  /**
   * The address the person asked for when a sign-in came back without one
   * (the SDK's returnTo of the callback), or the last one asked for since
   * (signInGuard lets it through to the card, and the router, refused by the
   * page's own whenReady, puts '/' back in the address bar): the Sign in card's
   * and the bar's Sign in come back there, not to '/'. Null otherwise.
   */
  readonly askedFor = signal<string | null>(null);
  /** Whether the app has been shown to somebody in this page load: a sign-out after that draws the Sign in card. */
  private readonly shownSignal = signal(false);

  /**
   * The Sign in card instead of the app: nobody is signed in, and either a
   * sign-in came back without one (or could not start), or the session ended
   * while the app was open. Any other time nobody is signed in the browser is
   * on its way to the IAM, and nothing of the app is drawn.
   */
  readonly showSignIn = computed(() => this.stateSignal() === 'signed-out' && (this.signInError() !== null || this.shownSignal()));

  /** The name to show: the one in the IAM, or the address; '' when there is neither (the top bar words that). */
  readonly displayName = computed(() => {
    const user = this.userSignal();
    return user ? user.preferred_username || user.email || '' : '';
  });

  /** This site's roles from the IAM, in capitals: EDITOR rewords the app's words, ADMIN also manages languages and people. */
  readonly roles = computed(() => (this.userSignal()?.roles ?? []).map((role) => String(role).toUpperCase()));
  readonly isAdmin = computed(() => this.roles().includes('ADMIN'));
  /**
   * May use the admin area (the app's words; for ADMIN also the languages and
   * the people). It only hides what the server refuses anyway
   * (backend/api/middleware/staff.php).
   */
  readonly isStaff = computed(() => this.isAdmin() || this.roles().includes('EDITOR'));

  /**
   * Once, before the router's first navigation (provideAppInitializer). Never
   * rejects: an app whose sign-in cannot start still has to say why.
   */
  async init(): Promise<void> {
    let r: Response;
    try {
      r = await fetch('/api/auth/config', { headers: timeZoneHeaders() });
    } catch {
      this.cannotStart({ kind: 'offline' });
      return;
    }
    const body = (await r.json().catch(() => ({}))) as AuthConfig & ApiErrorBody;
    if (isNotSetUp(r.status, body)) {
      this.notSetUp(body.reason);
      return;
    }
    if (!r.ok) {
      this.cannotStart({ kind: 'server', status: r.status, code: errorCode(r.status, body), detail: detailOf(body) });
      return;
    }
    // Only an explicit false opens the site to visitors: a server that says nothing requires sign-in.
    this.loginRequired.set(body.loginRequired !== false);
    const days = body.visitorKeepDays;
    this.visitorKeepDays.set(typeof days === 'number' && Number.isInteger(days) && days > 0 ? days : VISITOR_KEEP_DAYS);
    try {
      this.sdk = createAuth({
        issuer: String(body.issuer ?? ''),
        clientId: String(body.clientId ?? ''),
        // both registered at the IAM for this client, byte for byte
        redirectUri: location.origin + AUTH_CALLBACK_PATH,
        postLogoutRedirectUri: location.origin + '/',
      });
    } catch (e) {
      this.cannotStart({ kind: 'signIn', detail: (e instanceof Error ? e.message : String(e)) || null });
      return;
    }
    try {
      // A callback: the code exchanged, and the address the person started
      // from put back in the address bar, so the router draws that page.
      const { error, returnTo } = await this.sdk.init();
      if (error) {
        this.signInError.set({ code: String(error.code || '') });
        this.askedFor.set(returnTo || null);
      }
    } catch (e) {
      // The IAM out of reach while a stored session was being restored: the
      // app starts with nobody signed in, so the first page's guard sends the
      // browser to the IAM, which tries again.
      console.error('[auth] the sign-in could not be restored', e);
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

  /**
   * Off to the IAM's sign-in, coming back to `returnTo` (by default the page
   * the person asked for before a refused sign-in — `askedFor` —, else the
   * page they are on). `uiLocales` is the language the person reads the app
   * in, so the IAM's pages open in the same one. The caller says it (this
   * service cannot ask the translation service), and only when a language was
   * really settled: without it the IAM keeps its own choice.
   *
   * True when the browser is on its way to the IAM. False when the sign-in
   * could not even start (the browser refuses the site's storage, where the
   * SDK keeps the sign-in in progress, or there is no sign-in at all): then
   * `signInError` says so, as for a sign-in that came back without one, and
   * the Sign in card words it.
   */
  async login(uiLocales?: string, returnTo: string = this.askedFor() ?? location.pathname + location.search + location.hash): Promise<boolean> {
    if (!this.sdk) {
      return false;
    }
    try {
      await this.sdk.login(uiLocales ? { returnTo, uiLocales } : { returnTo });
      return true;
    } catch (e) {
      console.error('[auth] the sign-in could not start', e);
      const code = (e as { code?: unknown } | null)?.code;
      this.signInError.set({ code: typeof code === 'string' && code !== '' ? code : 'could_not_start' });
      return false;
    }
  }

  /** Signs out everywhere: the IAM ends its session and sends the browser back to /. (SignOutService waits for the saves first.) */
  async logout(): Promise<void> {
    await this.sdk?.logout();
  }

  /** A valid access token, or null: no sign-in yet, nobody signed in, or somebody else than whose the page is. */
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

  /** The IAM user id of whoever is signed in here now, or null. */
  subject(): string | null {
    return this.sdk?.user()?.sub ?? null;
  }

  /** The API answered 401: when the session is over, the Sign in card; when it is somebody else's now, a fresh page. */
  refused(): void {
    this.follow();
  }

  /**
   * Whom a request issued now is for (Caller): a visitor's while the page is
   * shown to one; a person's whenever the sign-in is set up otherwise —
   * shown to a person, or the session ended on a page of theirs, or on the
   * way to the IAM; nobody's before there is a sign-in at all.
   */
  caller(): Caller {
    if (this.stateSignal() === 'visiting') {
      return 'visitor';
    }
    return this.sdk ? 'person' : 'nobody';
  }

  /**
   * A visitor's request was refused with 401 sign_in_required: the IAM
   * requires sign-in here now (its switch turned on since the page loaded).
   * Nobody visits from now on: the Sign in card. The visitor key stays where it
   * is (VisitorKey never forgets it for this), so a sign-in still moves what it
   * holds into the account, and the switch turned off again brings it back.
   */
  signInRequiredNow(): void {
    this.loginRequired.set(true);
    if (this.stateSignal() === 'visiting') {
      this.shownSignal.set(true);
      this.stateSignal.set('signed-out');
    }
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
   * The app cannot start, or cannot go on: the problem page, with what
   * happened, until a page load. Said here when the sign-in's settings cannot
   * be had, and by the translation service when the server refuses the app's
   * own words with a 503 (a migration that failed, an upload still arriving).
   * A copy that is not set up stays that: it is the more exact answer.
   */
  cannotStart(problem: StartProblem): void {
    if (this.stateSignal() === 'not-set-up') {
      return;
    }
    this.problemSignal.set(problem);
    this.stateSignal.set('problem');
  }

  /**
   * fetch() for the app's own addresses, with the token and the reader's time
   * zone — to this site only, and only the page's own person's token
   * (token()). The same as the interceptor does for HttpClient: a 401 to a
   * token that looked good gets one fresh token and one retry, for the same
   * person only. (The SDK's fetch() would send its token wherever it is asked
   * to, and whoever's it holds.)
   *
   * Whom it is for is decided as it is called (caller()), as the interceptor
   * decides: a person's with no token to send is never sent — it answers a 401
   * sign_in_required of its own, and the page's signed-out handling takes
   * over; a visitor's goes with `visitorKey` (the key the caller holds, read
   * from VisitorKey: this service never reads it) while sign-in is not
   * required, and never with a token.
   */
  async fetch(url: string, init: RequestInit = {}, visitorKey: string | null = null): Promise<Response> {
    let r: Response;
    const caller = this.caller();
    if (!this.sdk || !isThisSite(url)) {
      r = await fetch(url, init);
    } else if (caller === 'visitor') {
      const headers = new Headers(init.headers ?? {});
      headers.delete('Authorization');
      headers.delete(VISITOR_KEY_HEADER);
      if (visitorKey && !this.loginRequired()) {
        headers.set(VISITOR_KEY_HEADER, visitorKey);
      }
      const zone = browserTimeZone();
      if (zone) {
        headers.set(TIME_ZONE_HEADER, zone);
      }
      r = await fetch(url, { ...init, headers });
      if (r.status === 401 && (await codeOf(r)) === 'sign_in_required') {
        this.signInRequiredNow();
      }
    } else {
      const send = (token: string): Promise<Response> => {
        const headers = new Headers(init.headers ?? {});
        // A person's request never carries a visitor's key.
        headers.delete(VISITOR_KEY_HEADER);
        headers.set('Authorization', `Bearer ${token}`);
        const zone = browserTimeZone();
        if (zone) {
          headers.set(TIME_ZONE_HEADER, zone);
        }
        return fetch(url, { ...init, headers });
      };
      const token = await this.token();
      if (!token) {
        // A person's, with no token to send (the session ended, or it is somebody else's now): never sent as anybody else's.
        this.refused();
        return notSignedIn();
      }
      const whose = this.subject();
      r = await send(token);
      if (r.status === 401) {
        const renewed = await this.refreshToken();
        if (renewed && renewed !== token && this.subject() === whose) {
          r = await send(renewed);
        }
      }
    }
    if (r.status === 401 && this.sdk && caller === 'person') {
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
   * Brings the page in line with the SDK: signed in, or signed out. Once the
   * app has been shown, somebody else signed in (in another tab, even after a
   * sign-out there) means a fresh page: nothing loaded for the one before may
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
      // A visitor only where the IAM does not require sign-in, and only on a page never shown to a person.
      if (this.loginRequired() || this.shownFor !== undefined) {
        this.stateSignal.set('signed-out');
      } else {
        this.shownAsVisitor = true;
        this.stateSignal.set('visiting');
      }
      return;
    }
    const user = sdk.user();
    const sub = user?.sub ?? '';
    // Shown to a visitor, or to somebody else: a fresh page (it moves the visitor's study in first, core/boot.ts).
    if (this.shownAsVisitor || (this.shownFor !== undefined && sub !== this.shownFor)) {
      this.reload();
      return;
    }
    this.shownFor = sub;
    this.shownSignal.set(true);
    this.userSignal.set(user);
    this.stateSignal.set('ready');
  }
}

/** Is this address on this site? The token and the time zone go nowhere else. */
export function isThisSite(url: string): boolean {
  try {
    return new URL(url, location.href).origin === location.origin;
  } catch {
    return false;
  }
}

/** What a person's request with no token to send answers, without being sent: what the API would say. */
function notSignedIn(): Response {
  return new Response(JSON.stringify({ error: 'Sign in first.', code: 'sign_in_required' }), {
    status: 401,
    headers: { 'Content-Type': 'application/json' },
  });
}

/** The code of a failure's JSON body, read from a copy (the caller still reads the answer), or ''. */
async function codeOf(r: Response): Promise<string> {
  const body: unknown = await r
    .clone()
    .json()
    .catch(() => null);
  const code = body && typeof body === 'object' ? (body as ApiErrorBody).code : undefined;
  return typeof code === 'string' ? code : '';
}

/** The reader's time zone as a header, for a plain fetch() of this site's /api/ (none when the browser gives no zone). */
export function timeZoneHeaders(): Record<string, string> {
  const zone = browserTimeZone();
  return zone ? { [TIME_ZONE_HEADER]: zone } : {};
}
