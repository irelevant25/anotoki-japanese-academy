import { HttpErrorResponse, HttpInterceptorFn } from '@angular/common/http';
import { inject } from '@angular/core';
import { ANOTOKI_ERROR_REPORT } from '@anotoki/lib/error-report';
import { catchError, throwError } from 'rxjs';
import { AuthService, installedOf, isNotSetUp, isThisSite } from '../auth/auth.service';

/**
 * Any answer 503 {"code": "not_set_up"} from this site stops the app
 * (AuthService.notSetUp()): its settings are gone, so nothing of it goes on,
 * and the anotoki library's page takes its place (siteStatusInterceptor,
 * before this one, has told SiteStatus too). The start asks where the site
 * stands before anything else (core/boot.ts), so this is for a site whose
 * settings go while a page is open. Another host's answer says nothing about
 * this copy, and this app's own reaction leaves out the answer to a page's
 * error report (the library's reporter marks its request
 * ANOTOKI_ERROR_REPORT: core/error-report.config.ts), as the library asks of
 * a site's interceptors: a report is no request to show a failure of - the
 * page's own next request says it. (The library's siteStatusInterceptor,
 * outside this one, still hears every answer, a report's too.) This
 * interceptor adds no header, so a report loses none by passing it by.
 */
export const notSetUpInterceptor: HttpInterceptorFn = (request, next) => {
  const auth = inject(AuthService);
  if (!isThisSite(request.url) || request.context.get(ANOTOKI_ERROR_REPORT)) {
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
