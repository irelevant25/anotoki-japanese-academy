import { EnvironmentProviders } from '@angular/core';
import { provideAnotokiErrorReport } from '@anotoki/lib/error-report';

/** Where the backend takes a page's own errors: the anotoki library's ErrorLogRoutes::client() (backend api/routes/admin.php). */
export const ERROR_REPORT_ENDPOINT = '/api/client-errors';

/**
 * The browser's errors into this site's error log - the anotoki family's
 * reporter (@anotoki/lib/error-report, anotoki-lib 0.5.0; the owner's decision
 * of 2026-10-11: every site's error log holds its pages' errors too). It is
 * the app's ErrorHandler: every error still goes to the console as Angular's
 * own has it, and - scrubbed in the page first (no stored value, token,
 * address, query or fragment), at most five a page load, each once - is sent
 * through the app's HttpClient, so this app's interceptors treat it as any
 * request of the page (app.config.ts): a signed-in person's carries their
 * token and the browser's time zone (the server counts them by their
 * account), a visitor's or nobody's goes without a token (counted by their
 * address). A failed HTTP request (HttpErrorResponse) is no error of the
 * page's (the server writes its own) - but an ApiError a page leaves
 * unhandled is reported (none does today); with
 * provideBrowserGlobalErrorListeners() the errors
 * outside Angular's own code - a window's error, a promise nobody caught -
 * arrive too. The admin panel's Errors page shows them (`source: client`).
 */
export function provideErrorReport(): EnvironmentProviders {
  return provideAnotokiErrorReport({ endpoint: ERROR_REPORT_ENDPOINT });
}
