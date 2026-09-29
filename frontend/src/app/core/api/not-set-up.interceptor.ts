import { HttpErrorResponse, HttpInterceptorFn } from '@angular/common/http';
import { inject } from '@angular/core';
import { catchError, throwError } from 'rxjs';
import { AuthService, isNotSetUp, isThisSite } from '../auth/auth.service';
import { ApiErrorBody } from './api.types';

/**
 * Any answer 503 {"code": "not_set_up"} from this site puts the "not set up
 * yet" page in place of the app. GET /api/auth/config needs only the
 * settings, so a copy whose database is missing or has no tables yet starts as
 * usual (on a website, with its Sign in page); its first address with data
 * says so. Another host's answer says nothing about this copy.
 */
export const notSetUpInterceptor: HttpInterceptorFn = (request, next) => {
  const auth = inject(AuthService);
  if (!isThisSite(request.url)) {
    return next(request);
  }
  return next(request).pipe(
    catchError((error: unknown) => {
      if (error instanceof HttpErrorResponse && isNotSetUp(error.status, error.error)) {
        auth.notSetUp((error.error as ApiErrorBody).reason);
      }
      return throwError(() => error);
    }),
  );
};
