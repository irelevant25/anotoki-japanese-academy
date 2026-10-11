import { computed, effect, inject, Injectable, Injector, signal, untracked } from '@angular/core';
import { AnotokiAuth, type AnotokiPreferenceChanges, type AnotokiSavedPreferences, type AuthBootConfig, type AuthState, type Caller } from '@anotoki/lib/auth';
import { SiteStatus } from '@anotoki/lib/migrations';
import { errorCode } from '../api/api.service';
import { ApiErrorBody, AuthConfig } from '../api/api.types';
import { reportSiteState } from '../site-status';
import { browserTimeZone, TIME_ZONE_HEADER } from '../time-zone';

export type { Caller } from '@anotoki/lib/auth';

/** Where the IAM sends the browser back after a sign-in: a route of this app (the library's callback page). */
export const AUTH_CALLBACK_PATH = '/auth/callback';

/** Where a sign-in that came back without one is said: a route of this app (the library's failure screen, app.routes.ts). */
export const SIGN_IN_FAILED_PATH = '/sign-in-failed';

/** How this app asks its server how it signs people in (the anotoki library's AuthRoutes::config(), backend/api/routes/site.php). */
export const AUTH_CONFIG_URL = '/api/auth/config';

/**
 * What the app can show:
 *   starting     it asks the server for the IAM's address and this site's client id
 *   ready        somebody is signed in: the app itself
 *   visiting     nobody is signed in, and the IAM does not require it here
 *                (`loginRequired` false, relayed by the server): the app itself,
 *                for a visitor — whose study the server keeps under a key this
 *                browser holds (core/auth/visitor-key.ts), from their first save
 *   signed-out   nobody is signed in: on the way to the IAM (the library's guards
 *                send every page there), the library's screen of a sign-in that
 *                came back without one, or could not start (signInError), or the
 *                Sign in card when the session ended while the page was open
 *                (showSignIn)
 *   not-set-up   the server has no settings yet (any answer 503 not_set_up says so):
 *                nothing of the app starts, and the anotoki library's page says so in its
 *                place (core/site-status.config.ts) - with the way to /setup.php only while
 *                the site was never installed
 *   problem      the app cannot start (the server does not answer, or refuses): what happened
 *
 * While the site is being updated (a database update waits for an
 * administrator) the state is whatever the sign-in makes it: the library's
 * gate stands in front of the pages, and the sign-in itself works, so an
 * administrator can get in to apply the update.
 */
export type AppState = 'starting' | 'ready' | 'visiting' | 'signed-out' | 'not-set-up' | 'problem';

/** The anotoki library's states, as this app has always called them. 'unavailable' is a problem of the kind signIn. */
const AS_THIS_APP: Readonly<Record<AuthState, AppState>> = {
  starting: 'starting',
  'signed-in': 'ready',
  visitor: 'visiting',
  'signed-out': 'signed-out',
  unavailable: 'problem',
};

/** How many days a visitor's study is kept after their last visit, when the server does not say (VISITORS_DEFAULTS keep_days). */
export const VISITOR_KEEP_DAYS = 30;

/**
 * Why the app cannot start (state problem) — what happened, never a sentence:
 * the problem page words it, in the reader's language.
 *   offline  no answer at all
 *   server   the server answered, but not with what the app starts from: its
 *            status and code (errorCode()), and — from the owner's own
 *            computer only — the reason in the server's English words
 *   signIn   the sign-in itself could not be set up (the server names no IAM, or
 *            one the browser cannot use): the reason, when there is one, shown
 *            small after the page's words
 */
export type StartProblem =
  | { kind: 'offline' }
  | { kind: 'server'; status: number; code: string; detail: string | null }
  | { kind: 'signIn'; detail: string | null };

/**
 * A sign-in that came back without one, or could not even start: the code
 * the IAM or the library's client gave ("access_denied", "state_mismatch",
 * "storage_unavailable"…). Their English sentence is never kept: the
 * library's failure screen words it from the code.
 */
export interface SignInFailure {
  code: string;
}

/** Is this the server's answer for a copy that is not set up (503 {"code": "not_set_up", "installed": …})? */
export function isNotSetUp(status: number, body: unknown): boolean {
  return status === 503 && !!body && typeof body === 'object' && (body as ApiErrorBody).code === 'not_set_up';
}

/** Whether a not_set_up answer says the site was installed once (a website's setup finished): then nobody is offered the setup page. */
export function installedOf(body: unknown): boolean | undefined {
  const installed = body && typeof body === 'object' ? (body as { installed?: unknown }).installed : undefined;
  return typeof installed === 'boolean' ? installed : undefined;
}

/** The reason a failure's body gives to the owner's own computer (`detail`), or null. */
function detailOf(body: unknown): string | null {
  const detail = body && typeof body === 'object' ? (body as ApiErrorBody).detail : undefined;
  return typeof detail === 'string' && detail !== '' ? detail : null;
}

/**
 * Sign-in, through the anotoki IAM: the one way in (docs/kb/sign-in.md) - the
 * anotoki library's auth module (@anotoki/lib/auth, AnotokiAuth: every anotoki
 * site's, built on this app's own state machine), seen the way this app has
 * always seen it. The library keeps the session, the tokens (under the same
 * storage keys the IAM's SDK used: nobody is signed out by the move), the
 * callback, the guards, the interceptor and the failure's screen
 * (core/auth/auth.config.ts wires it); this service keeps what is this app's:
 *
 * - the start: GET /api/auth/config with the reader's time zone, read here
 *   (bootConfig(), which the library is given as its boot configuration), so a
 *   copy that is not set up, a server that does not answer, or one that
 *   refuses, is said as before - `not-set-up`, `problem` - and how many days a
 *   visitor's study is kept (`visitorKeepDays`) is kept;
 * - the states by this app's names (AppState), and the Sign in card
 *   (`showSignIn`): the session ended while the page was open, or a visitor's
 *   site started requiring sign-in;
 * - fetch() telling SiteStatus a 503 as the interceptor tells it for HttpClient.
 *
 * Nobody signed in, every page sends the browser to the IAM (the library's
 * personOrVisitorGuard) and it comes back to that page. Unless the IAM does not
 * require sign-in here (`loginRequired` false): then nobody signed in is a
 * visitor (state visiting), and the app is theirs — except the admin panel and
 * Your data. A page shown to a visitor loads again when somebody signs in in
 * another tab; a page shown to a person never turns into a visitor's (its
 * session ended: the Sign in card); a page is one person's (somebody else
 * signing in in another tab loads it again, as them).
 *
 * The account's theme, date order and clock come with who is signed in
 * (`preferences`, the owner's decision of 2026-10-06 for every anotoki site),
 * and what the person chooses with this site's own controls goes back to the
 * account (savePreferences()): ThemeService, and TranslationService for the
 * language and the dates.
 *
 * It holds what happened — a state, a kind, a code — and never a sentence: the
 * pages word it (core/i18n), and the library's screens their own words
 * (anotoki.signIn.*, in this app's database).
 */
@Injectable({ providedIn: 'root' })
export class AuthService {
  /** For SiteStatus, asked for only when there is something to tell it (core/site-status.config.ts says why). */
  private readonly injector = inject(Injector);
  private readonly library = inject(AnotokiAuth);

  /** What this app's own start found that the library has no state for: not set up, or a problem. */
  private readonly ownState = signal<'not-set-up' | 'problem' | null>(null);
  private readonly problemSignal = signal<StartProblem | null>(null);
  /** Whether the app has been shown to somebody in this page load: a sign-out after that draws the Sign in card. */
  private readonly shownSignal = signal(false);

  readonly state = computed<AppState>(() => this.ownState() ?? AS_THIS_APP[this.library.state()]);
  /** Who is signed in - the ID token's claims - while the page is theirs. */
  readonly user = this.library.user;
  /**
   * Whether the IAM requires sign-in here, as the server relays it at the
   * start (true unless it says false). True from the moment a visitor's request
   * is refused with 401 sign_in_required (the switch turned on meanwhile):
   * signInRequiredNow().
   */
  readonly loginRequired = this.library.loginRequired;
  /** How many days the server keeps a visitor's study after their last visit (the visitor notice says it). */
  readonly visitorKeepDays = signal(VISITOR_KEEP_DAYS);
  /** Somebody is signed in, and the page is theirs. */
  readonly signedIn = computed(() => this.state() === 'ready');
  /** Nobody is signed in, where the IAM does not require it: the app is shown to a visitor. */
  readonly visiting = computed(() => this.state() === 'visiting');
  /** The app itself is shown: to a person, or to a visitor. */
  readonly usable = computed(() => this.signedIn() || this.visiting());
  /** Why the app could not start (state problem), else null. */
  readonly problem = this.problemSignal.asReadonly();
  /**
   * The sign-in this page load came back from without one — or the last one
   * that could not start: its code. The library's failure screen says it
   * (app.component.html), until it is put away (its Back).
   */
  readonly signInError = computed<SignInFailure | null>(() => {
    const failure = this.library.signInFailure();
    return failure === null ? null : { code: failure.code };
  });
  /**
   * The Sign in card instead of the app: nobody is signed in, nothing failed,
   * and the app was shown in this page load - the session ended while it was
   * open (a sign-out in another tab, the IAM's idle limit), or a visitor's site
   * started requiring sign-in. Any other time nobody is signed in the browser
   * is on its way to the IAM, and nothing of the app is drawn.
   */
  readonly showSignIn = computed(() => this.state() === 'signed-out' && this.signInError() === null && this.shownSignal());
  /** The name to show: the one in the IAM, or the address; '' when there is neither (the top bar words that). */
  readonly displayName = this.library.displayName;
  /** This site's roles from the IAM, in capitals: EDITOR rewords the app's words, ADMIN also everything else of the admin panel. */
  readonly roles = this.library.roles;
  readonly isAdmin = this.library.isAdmin;
  /** May use the admin area. It only hides what the server refuses anyway (backend/api/middleware/staff.php). */
  readonly isStaff = this.library.isStaff;
  /**
   * The account's theme, date order and clock — one choice every anotoki site
   * follows — while the page is a signed-in person's and the IAM sends them.
   * Null otherwise: the site keeps its own settings then, and saves nothing to
   * the account.
   */
  readonly preferences = this.library.preferences;

  constructor() {
    effect(() => {
      if (this.usable()) {
        untracked(() => this.shownSignal.set(true));
      }
    });
  }

  /**
   * Once, before the router's first navigation (core/boot.ts): the library's
   * start - the boot configuration (bootConfig()), a sign-in coming back
   * finished, a session restored. Never rejects: an app whose sign-in cannot
   * start still has to say why.
   */
  async init(): Promise<void> {
    await this.library.init();
    if (this.library.state() === 'unavailable' && this.ownState() === null) {
      // The server answered, but names no IAM the browser can use.
      this.cannotStart({ kind: 'signIn', detail: null });
    }
  }

  /**
   * How this copy signs people in, for the library (its boot configuration):
   * GET /api/auth/config, {issuer, client_id, login_required, sign_in_available,
   * visitor_keep_days}. Null when there is none to give - and then the app
   * says why: not set up (notSetUp()), no answer, or one it cannot start from
   * (cannotStart()). The camelCase of a server from before the library is read
   * too, as the library reads it.
   */
  async bootConfig(): Promise<AuthBootConfig | null> {
    let r: Response;
    try {
      r = await fetch(AUTH_CONFIG_URL, { headers: timeZoneHeaders() });
    } catch {
      this.cannotStart({ kind: 'offline' });
      return null;
    }
    const body = (await r.json().catch(() => ({}))) as AuthConfig & ApiErrorBody;
    if (isNotSetUp(r.status, body)) {
      this.notSetUp(installedOf(body));
      return null;
    }
    if (!r.ok) {
      this.cannotStart({ kind: 'server', status: r.status, code: errorCode(r.status, body), detail: detailOf(body) });
      return null;
    }
    const days = body.visitor_keep_days ?? body.visitorKeepDays;
    this.visitorKeepDays.set(typeof days === 'number' && Number.isInteger(days) && days > 0 ? days : VISITOR_KEEP_DAYS);
    return { ...body, issuer: String(body.issuer ?? '') };
  }

  /** The IAM's page for the account itself. */
  accountUrl(): string {
    return this.library.accountUrl();
  }

  /**
   * Off to the IAM's sign-in, coming back to `returnTo` (by default the page a
   * sign-in that failed started from, else the page the person is on), the
   * IAM's pages in the language read here. From a visitor's page the saves on
   * their way first, and a question when something would be lost
   * (SignInService, the library's beforeSignIn).
   *
   * True when the browser is on its way to the IAM. False when the visitor
   * chose to stay, or the sign-in could not even start (the browser refuses
   * the site's storage): then `signInError` says so, and the failure's screen
   * words it.
   */
  login(returnTo?: string): Promise<boolean> {
    return this.library.signIn(returnTo === undefined ? {} : { returnTo });
  }

  /**
   * The IAM's sign-in once more, asking for the password even with a session
   * there, and back to this page: the proof the admin panel's Backups page
   * asks for (a sign-in of the last ten minutes) before a backup is made,
   * downloaded, deleted or restored.
   */
  signInAgain(): Promise<boolean> {
    return this.library.signIn({ prompt: 'login' });
  }

  /**
   * Signs out everywhere: the IAM ends its session and sends the browser back
   * to /. First the saves on their way, and a question when something would be
   * lost (SignOutService, the library's beforeSignOut): false when the person
   * chose to stay.
   */
  logout(): Promise<boolean> {
    return this.library.signOut();
  }

  /** A valid access token, or null: no sign-in yet, nobody signed in, or somebody else than whose the page is. */
  token(): Promise<string | null> {
    return this.library.token();
  }

  /** After the API refused the current token: a different one, or null. */
  refreshToken(): Promise<string | null> {
    return this.library.refresh();
  }

  /**
   * Saves to the account what the person chose with this site's own controls
   * — the theme, the date order, the clock, the language — for every anotoki
   * site. One save at a time, and only for the person the page is shown to:
   * `login_required`, and nothing sent, when it is nobody's page or another
   * person is signed in now. Rejects with an Error whose `code` is the IAM's
   * or the client's (`invalid_request`, `access_denied`, `network`, …).
   */
  savePreferences(changes: AnotokiPreferenceChanges): Promise<AnotokiSavedPreferences> {
    return this.library.savePreferences(changes);
  }

  /**
   * Puts away the failure of a sign-in (somebody is signed in after all - in
   * another tab, say): where that sign-in started, or null.
   */
  dismissFailure(): string | null {
    const returnTo = this.library.signInFailure()?.returnTo ?? null;
    this.library.dismissFailure();
    return returnTo;
  }

  /** The IAM user id of whoever is signed in here now (in any tab), or null. */
  subject(): string | null {
    return this.library.subject();
  }

  /** The API answered 401: when the session is over, the Sign in card; when it is somebody else's now, a fresh page. */
  refused(): void {
    this.library.refused();
  }

  /**
   * Whom a request issued now is for: a visitor's while the page is shown to
   * one; a person's whenever the sign-in is set up otherwise — shown to a
   * person, or the session ended on a page of theirs, or on the way to the
   * IAM; nobody's before there is a sign-in at all.
   */
  caller(): Caller {
    return this.library.caller();
  }

  /**
   * A visitor's request was refused with 401 sign_in_required: the IAM
   * requires sign-in here now (its switch turned on since the page loaded).
   * Nobody visits from now on: the Sign in card. The visitor key stays where it
   * is (VisitorKey never forgets it for this), so a sign-in still moves what it
   * holds into the account.
   */
  signInRequiredNow(): void {
    this.library.noteSignInRequired();
  }

  /**
   * The server answered 503 not_set_up (as the start asked where the site
   * stands, or later: its settings gone). Nothing of the app goes on, until a
   * page load after the setup; SiteStatus hears it too ($installed: whether
   * the site was ever installed, as the answer says), and the gate puts up the
   * anotoki library's page - with the way to /setup.php only while the site
   * was never installed.
   */
  notSetUp(installed?: boolean): void {
    this.injector.get(SiteStatus).report('not_set_up', installed);
    this.ownState.set('not-set-up');
  }

  /**
   * The app cannot start, or cannot go on: the problem page, with what
   * happened, until a page load. Said here when the sign-in's settings cannot
   * be had, and by the translation service when the server refuses the app's
   * own words with a 503 for a reason of its own - never while the site is
   * being updated: then the anotoki library's page stands in for the app, and
   * the sign-in has to work. A copy that is not set up stays that: it is the
   * more exact answer.
   */
  cannotStart(problem: StartProblem): void {
    if (this.ownState() === 'not-set-up') {
      return;
    }
    this.problemSignal.set(problem);
    this.ownState.set('problem');
  }

  /**
   * fetch() for the app's own addresses (a report, the data file) - the
   * library's AnotokiAuth.fetch(), which decides whom it is for as it is
   * called, as the interceptor decides for HttpClient: a person's with the
   * page's person's token (one fresh token and one retry after a 401, for the
   * same person), or never sent (a 401 sign_in_required of its own); a
   * visitor's with the visitor key while sign-in is not required; the reader's
   * time zone on both. Another site's address gets neither. A 503 tells
   * SiteStatus, as the interceptors do: not set up, or being updated.
   */
  async fetch(url: string, init: RequestInit = {}): Promise<Response> {
    const r = await this.library.fetch(url, init);
    if (r.status === 503 && isThisSite(url)) {
      const body: unknown = await r
        .clone()
        .json()
        .catch(() => null);
      if (isNotSetUp(r.status, body)) {
        this.notSetUp(installedOf(body));
      } else {
        // Being updated (update_pending): the gate puts up the library's page, as siteStatusInterceptor does for HttpClient.
        reportSiteState(() => this.injector.get(SiteStatus), r.status, body);
      }
    }
    return r;
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

/** The reader's time zone as a header, for every request of this site's API (none when the browser gives no zone). */
export function timeZoneHeaders(): Record<string, string> {
  const zone = browserTimeZone();
  return zone ? { [TIME_ZONE_HEADER]: zone } : {};
}
