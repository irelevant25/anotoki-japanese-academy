import { HttpErrorResponse, provideHttpClient, withInterceptors } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { ErrorHandler, provideZonelessChangeDetection } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { ANOTOKI_AUTH_BROWSER, ANOTOKI_AUTH_CLIENT_FACTORY, anotokiAuthInterceptor, AnotokiAuthEnvironment, AnotokiAuthOptions } from '@anotoki/lib/auth';
import { FakeAuthClient, testAnotokiAuth, TestUser } from '@anotoki/lib/auth/testing';
import { ANOTOKI_ERROR_REPORT, AnotokiErrorReporter } from '@anotoki/lib/error-report';
import { siteStatusInterceptor } from '@anotoki/lib/migrations';
import { provideTestTranslations } from '@anotoki/lib/translations/testing';
import { notSetUpInterceptor } from './api/not-set-up.interceptor';
import { provideAuth } from './auth/auth.config';
import { AuthService } from './auth/auth.service';
import { ERROR_REPORT_ENDPOINT, provideErrorReport } from './error-report.config';
import { provideTestSiteStatus } from './testing/site-status';

/** The boot configuration as the server answers it (the library's AuthRoutes::config()). */
const CONFIG = { issuer: 'https://iam.test', client_id: 'japanese-academy', login_required: true, sign_in_available: true, visitor_keep_days: 30 };

/**
 * The app's error handling as app.config.ts has it - the reporter, through the app's own HttpClient and
 * interceptors - signed in as $user (or nobody), the server saying whether sign-in is required here.
 */
async function start(user: TestUser | null, loginRequired = true): Promise<{ handler: ErrorHandler; backend: HttpTestingController; auth: AuthService }> {
  const handle = testAnotokiAuth();
  globalThis.fetch = vi.fn((input: RequestInfo | URL) =>
    Promise.resolve(
      String(input) === '/api/auth/config'
        ? new Response(JSON.stringify({ ...CONFIG, login_required: loginRequired }), { status: 200, headers: { 'Content-Type': 'application/json' } })
        : new Response('{}', { status: 404 }),
    ),
  ) as unknown as typeof fetch;
  TestBed.configureTestingModule({
    providers: [
      provideZonelessChangeDetection(),
      provideTestSiteStatus(),
      provideTestTranslations({}),
      provideAuth(),
      {
        provide: ANOTOKI_AUTH_CLIENT_FACTORY,
        useValue: (options: AnotokiAuthOptions, environment: AnotokiAuthEnvironment) => new FakeAuthClient(options, environment, user),
      },
      { provide: ANOTOKI_AUTH_BROWSER, useValue: handle.browser },
      provideHttpClient(withInterceptors([siteStatusInterceptor, notSetUpInterceptor, anotokiAuthInterceptor])),
      provideHttpClientTesting(),
      provideErrorReport(),
    ],
  });
  const auth = TestBed.inject(AuthService);
  await auth.init();
  return { handler: TestBed.inject(ErrorHandler), backend: TestBed.inject(HttpTestingController), auth };
}

/** The report's way out: after the error is handled (a timer), and the token asked for. */
const reported = () => new Promise((done) => setTimeout(done, 20));

describe('the browser’s errors, reported to the error log (core/error-report.config.ts)', () => {
  const realFetch = globalThis.fetch;

  beforeEach(() => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined); // the console hears of every error, as before
  });

  afterEach(() => {
    globalThis.fetch = realFetch;
    vi.restoreAllMocks();
  });

  it('the app’s ErrorHandler is the anotoki library’s reporter, sending to the backend’s route for it', async () => {
    const { handler } = await start(null);
    expect(handler).toBeInstanceOf(AnotokiErrorReporter);
    expect(ERROR_REPORT_ENDPOINT).toBe('/api/client-errors');
  });

  it('a person’s page: the error reported once, scrubbed, through the app’s interceptors - their token and the time zone on it, marked as a report', async () => {
    const { handler, backend, auth } = await start({ sub: '7' });
    const error = new TypeError('Cannot read properties of undefined for hana@example.test');
    handler.handleError(error);
    await reported();
    const request = backend.expectOne(ERROR_REPORT_ENDPOINT);
    expect(request.request.method).toBe('POST');
    expect(request.request.context.get(ANOTOKI_ERROR_REPORT)).toBe(true);
    expect([request.request.headers.get('Authorization'), request.request.headers.get('X-Time-Zone')]).toEqual([`Bearer ${await auth.token()}`, Intl.DateTimeFormat().resolvedOptions().timeZone]);
    const body = request.request.body as { type: string; message: string; page: string };
    expect(body.type).toBe('TypeError');
    expect(body.message).toContain('Cannot read properties of undefined');
    expect(JSON.stringify(body)).not.toContain('hana@example.test');
    request.flush(null, { status: 204, statusText: 'No Content' });
    expect(console.error).toHaveBeenCalled();

    handler.handleError(error); // the same error again (a template failing on every check): reported once
    await reported();
    backend.expectNone(ERROR_REPORT_ENDPOINT);
    backend.verify();
  });

  it('a visitor’s page (sign-in not required here): reported without a token - the server counts their address; a failed request is never reported, the server writes its own', async () => {
    const { handler, backend, auth } = await start(null, false);
    expect(auth.state()).toBe('visiting');
    handler.handleError(new HttpErrorResponse({ status: 500, url: '/api/kanji/summary' }));
    await reported();
    backend.expectNone(ERROR_REPORT_ENDPOINT);
    handler.handleError(new Error('A visitor’s page broke'));
    await reported();
    const request = backend.expectOne(ERROR_REPORT_ENDPOINT);
    expect([request.request.headers.get('Authorization'), request.request.headers.get('X-Time-Zone')]).toEqual([null, Intl.DateTimeFormat().resolvedOptions().timeZone]);
    request.flush(null, { status: 204, statusText: 'No Content' });
    backend.verify();
  });
});
