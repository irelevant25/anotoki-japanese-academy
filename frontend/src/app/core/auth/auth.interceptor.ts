import { HttpErrorResponse, HttpEvent, HttpHandlerFn, HttpInterceptorFn, HttpRequest, HttpResponse } from '@angular/common/http';
import { inject } from '@angular/core';
import { catchError, defer, finalize, from, Observable, switchMap, tap, throwError } from 'rxjs';
import { errorCode } from '../api/api.service';
import { browserTimeZone, TIME_ZONE_HEADER } from '../time-zone';
import { AuthService, isThisSite } from './auth.service';
import { CARRIES_VISITOR_KEY, ISSUED_AS, VISITOR_KEY_HEADER } from './issued-as';
import { VisitorKey } from './visitor-key';

function withBearer(request: HttpRequest<unknown>, token: string): HttpRequest<unknown> {
  return request.clone({ setHeaders: { Authorization: `Bearer ${token}` } });
}

/** The reader's time zone, for the server to count their days and hours in (core/time-zone.ts); nothing when the browser names none. */
function withTimeZone(request: HttpRequest<unknown>): HttpRequest<unknown> {
  const zone = browserTimeZone();
  return zone ? request.clone({ setHeaders: { [TIME_ZONE_HEADER]: zone } }) : request;
}

/** Neither a token nor a key: what a visitor's request is while sign-in is required, and nobody's always. */
function bare(request: HttpRequest<unknown>): HttpRequest<unknown> {
  return request.clone({ headers: request.headers.delete('Authorization').delete(VISITOR_KEY_HEADER) });
}

/** The app's own addresses with somebody's data: /api/… and /report/… of this site. */
export function takesToken(url: string): boolean {
  if (!isThisSite(url)) {
    return false;
  }
  const path = new URL(url, location.href).pathname;
  return path.startsWith('/api/') || path.startsWith('/report/');
}

/**
 * The saves that make a visitor when nobody sends them (backend: study_route()
 * with mayMake): a lesson, a review, practice, an item's notes and synonyms,
 * the settings, an exam handed in.
 */
export function makesVisitor(request: HttpRequest<unknown>): boolean {
  if (request.method !== 'POST') {
    return false;
  }
  const path = new URL(request.url, location.href).pathname;
  return /^\/api\/kanji\/(learn|review|practice|item|settings)$/.test(path) || path === '/api/submit';
}

/**
 * Who a request of this site's own API is (/api/…, /report/…; never another
 * host's: a token or a key sent there is handed to a stranger), decided when
 * the request is issued — its ISSUED_AS, or else what the page is shown as
 * as it is handed over (AuthService.caller()), never whether a token happens
 * to be there when it leaves (docs/kb/sign-in.md, *The browser*):
 *
 * - **A person's**: the access token and the reader's time zone. When the
 *   token comes back null (the session ended, a refresh failed, somebody else
 *   signed in in another tab) the request is **never sent**: it fails here as
 *   a 401 sign_in_required, and AuthService's signed-out handling takes over —
 *   it never goes out without a token, so it never reaches the server as a
 *   visitor's, and never makes one. A 401 to a token the SDK thought good: one
 *   fresh token, one retry — for the same person only (the SDK shares its
 *   session with every tab). A visitor key is taken off (but by the move,
 *   CARRIES_VISITOR_KEY); an answer that brings one is not kept and fails
 *   (madeVisitor(): the server never saw the token, so the save is not theirs).
 * - **A visitor's** (the page in the state visiting), while the IAM does not
 *   require sign-in here: the visitor key this browser holds now
 *   (core/auth/visitor-key.ts), never a token. With no key, the first save that
 *   may make a visitor goes alone and everything issued meanwhile waits for its
 *   answer — the key it brings is kept, and they go with it (one visitor per
 *   browser). A 401 visitor_unknown forgets the key that was sent and tries
 *   once more without it; a 401 sign_in_required says the IAM requires sign-in
 *   now (AuthService.signInRequiredNow(): the key stays).
 * - **A visitor's while sign-in is required**, and **nobody's** (no sign-in set
 *   up yet: not set up, could not start): neither key nor token.
 */
export const authInterceptor: HttpInterceptorFn = (original, next) => {
  if (!takesToken(original.url)) {
    return next(original);
  }
  const auth = inject(AuthService);
  const request = withTimeZone(original);
  const caller = original.context.get(ISSUED_AS) ?? auth.caller();
  if (caller === 'visitor') {
    return asVisitor(request, next, auth, inject(VisitorKey), false);
  }
  if (caller === 'nobody') {
    return next(bare(request));
  }
  return asPerson(request, next, auth);
};

/** A person's request: with the token, or not at all. */
function asPerson(request: HttpRequest<unknown>, next: HttpHandlerFn, auth: AuthService): Observable<HttpEvent<unknown>> {
  const carriesKey = request.context.get(CARRIES_VISITOR_KEY);
  if (!carriesKey) {
    request = request.clone({ headers: request.headers.delete(VISITOR_KEY_HEADER) });
  }
  return from(auth.token()).pipe(
    switchMap((token) => {
      if (!token) {
        auth.refused();
        return throwError(() => notSignedIn(request));
      }
      const whose = auth.subject();
      const send = (bearer: string): Observable<HttpEvent<unknown>> =>
        next(withBearer(request, bearer)).pipe(
          tap((event) => {
            if (!carriesKey && event instanceof HttpResponse && event.headers.has(VISITOR_KEY_HEADER)) {
              console.error('[auth] a visitor key in the answer to a person’s request: not kept, and the request failed', request.url);
              throw madeVisitor(request, event);
            }
          }),
        );
      return send(token).pipe(
        catchError((error: unknown) => {
          if (!(error instanceof HttpErrorResponse) || error.status !== 401) {
            return throwError(() => error);
          }
          return from(auth.refreshToken()).pipe(
            switchMap((renewed) => {
              if (!renewed || renewed === token || auth.subject() !== whose) {
                auth.refused();
                return throwError(() => error);
              }
              return send(renewed);
            }),
          );
        }),
      );
    }),
  );
}

/**
 * A visitor's request: with the key held as it leaves, if any; with no key,
 * behind the first save that may make the visitor (see the interceptor).
 * `retried`: this is the one try again without a key the server no longer knew.
 */
function asVisitor(
  request: HttpRequest<unknown>,
  next: HttpHandlerFn,
  auth: AuthService,
  visitor: VisitorKey,
  retried: boolean,
): Observable<HttpEvent<unknown>> {
  const plain = bare(request);
  if (auth.loginRequired()) {
    return next(plain).pipe(
      catchError((error: unknown) => {
        refusedAsVisitor(error, auth, visitor, null);
        return throwError(() => error);
      }),
    );
  }
  return defer(() => {
    const key = visitor.current();
    if (key) {
      return sendAsVisitor(plain.clone({ setHeaders: { [VISITOR_KEY_HEADER]: key } }), key);
    }
    const pending = visitor.firstSave();
    if (pending) {
      // Another request may be making the visitor right now: after its answer, with the key it brought (or as the next to try).
      return from(pending).pipe(switchMap(() => asVisitor(request, next, auth, visitor, retried)));
    }
    if (makesVisitor(request)) {
      const done = visitor.beginFirstSave();
      return sendAsVisitor(plain, null).pipe(finalize(done));
    }
    return sendAsVisitor(plain, null);
  });

  function sendAsVisitor(sent: HttpRequest<unknown>, key: string | null): Observable<HttpEvent<unknown>> {
    return next(sent).pipe(
      tap((event) => {
        const made = !key && event instanceof HttpResponse ? event.headers.get(VISITOR_KEY_HEADER) : null;
        if (made) {
          visitor.remember(made);
        }
      }),
      catchError((error: unknown) => {
        if (refusedAsVisitor(error, auth, visitor, key) === 'forgotten' && !retried) {
          return asVisitor(request, next, auth, visitor, true);
        }
        return throwError(() => error);
      }),
    );
  }
}

/** A visitor's 401: sign-in required now (the key stays), or a key the server no longer knows (forgotten, when it was the one sent). */
function refusedAsVisitor(error: unknown, auth: AuthService, visitor: VisitorKey, key: string | null): 'forgotten' | null {
  if (error instanceof HttpErrorResponse && error.status === 401) {
    const code = errorCode(error.status, error.error);
    if (code === 'sign_in_required') {
      auth.signInRequiredNow();
    } else if (code === 'visitor_unknown' && key) {
      visitor.forget(key, true);
      return 'forgotten';
    }
  }
  return null;
}

/** What a person's request with no token to send answers, without being sent: what the API would say. */
function notSignedIn(request: HttpRequest<unknown>): HttpErrorResponse {
  return new HttpErrorResponse({
    status: 401,
    statusText: 'Unauthorized',
    url: request.urlWithParams,
    error: { error: 'Sign in first.', code: 'sign_in_required' },
  });
}

/**
 * A person's request answered with a visitor key: the server never saw its
 * token (a host that drops `Authorization`, docs/kb/hosting.md) and, while
 * sign-in is not required, kept the save under a new visitor nobody holds the
 * key to. It is not this person's save: it fails (a 502 server_error), so the
 * page says it was not saved instead of going on as if it were.
 */
function madeVisitor(request: HttpRequest<unknown>, answer: HttpResponse<unknown>): HttpErrorResponse {
  return new HttpErrorResponse({
    status: 502,
    statusText: 'Bad Gateway',
    url: answer.url ?? request.urlWithParams,
    error: { error: 'The server did not get the sign-in token: this was not saved for you.', code: 'server_error' },
  });
}
