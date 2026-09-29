import { HttpErrorResponse, HttpInterceptorFn, HttpRequest } from '@angular/common/http';
import { inject } from '@angular/core';
import { catchError, from, switchMap, throwError } from 'rxjs';
import { AuthService, isThisSite } from './auth.service';

function withBearer(request: HttpRequest<unknown>, token: string | null): HttpRequest<unknown> {
  return token ? request.clone({ setHeaders: { Authorization: `Bearer ${token}` } }) : request;
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
 * The sign-in's access token on every call to this site's API, and on nothing
 * else: a token sent to another host is a token handed to a stranger. Without
 * sign-in (auth mode none) it adds nothing at all.
 *
 * A 401 to a token the SDK thought good (expired on the way, or the session
 * ended at the IAM): one fresh token, one retry — for the same person only.
 * The SDK shares its session with every tab, so the fresh token may be of
 * somebody who signed in elsewhere meanwhile, and the request was made for the
 * one this page shows (AuthService then loads the page again, as the other).
 * When the IAM will not issue one, the session is over, and the Sign in page
 * takes over.
 */
export const authInterceptor: HttpInterceptorFn = (request, next) => {
  const auth = inject(AuthService);
  if (!auth.signsIn() || !takesToken(request.url)) {
    return next(request);
  }
  return from(auth.token()).pipe(
    switchMap((token) => {
      const whose = auth.subject();
      return next(withBearer(request, token)).pipe(
        catchError((error: unknown) => {
          if (!token || !(error instanceof HttpErrorResponse) || error.status !== 401) {
            return throwError(() => error);
          }
          return from(auth.refreshToken()).pipe(
            switchMap((renewed) => {
              if (!renewed || renewed === token || auth.subject() !== whose) {
                auth.refused();
                return throwError(() => error);
              }
              return next(withBearer(request, renewed));
            }),
          );
        }),
      );
    }),
  );
};
