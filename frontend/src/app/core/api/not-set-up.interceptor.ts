import { HttpErrorResponse, HttpInterceptorFn } from '@angular/common/http';
import { inject } from '@angular/core';
import { catchError, throwError } from 'rxjs';
import { AuthService, installedOf, isNotSetUp, isThisSite } from '../auth/auth.service';

/**
 * Any answer 503 {"code": "not_set_up"} from this site stops the app
 * (AuthService.notSetUp()): its settings are gone, so nothing of it goes on,
 * and the anotoki library's page takes its place (siteStatusInterceptor,
 * before this one, has told SiteStatus too). The start asks where the site
 * stands before anything else (core/boot.ts), so this is for a site whose
 * settings go while a page is open. Another host's answer says nothing about
 * this copy.
 */
export const notSetUpInterceptor: HttpInterceptorFn = (request, next) => {
  const auth = inject(AuthService);
  if (!isThisSite(request.url)) {
    return next(request);
  }
  return next(request).pipe(
    catchError((error: unknown) => {
      if (error instanceof HttpErrorResponse && isNotSetUp(error.status, error.error)) {
        auth.notSetUp(installedOf(error.error));
      }
      return throwError(() => error);
    }),
  );
};
