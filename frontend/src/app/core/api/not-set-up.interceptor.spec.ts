import { HttpClient, HttpErrorResponse, provideHttpClient, withInterceptors } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { provideZonelessChangeDetection } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { SiteStatus, siteStatusInterceptor } from '@anotoki/lib/migrations';
import { firstValueFrom } from 'rxjs';
import { AuthService } from '../auth/auth.service';
import { provideSiteStatus } from '../site-status.config';
import { notSetUpInterceptor } from './not-set-up.interceptor';
import { provideAuth } from '../auth/auth.config';

/** The anotoki library's answer for a site without its settings (its SiteGate). */
const NOT_SET_UP = { code: 'not_set_up', installed: false, message: 'This site is not set up yet. Its setup page connects it to its database.', setup: '/setup.php' };

describe('notSetUpInterceptor', () => {
  let auth: AuthService;
  let site: SiteStatus;
  let http: HttpClient;
  let backend: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [
        provideZonelessChangeDetection(),
        provideAuth(),
        // as app.config.ts has them
        provideHttpClient(withInterceptors([siteStatusInterceptor, notSetUpInterceptor])),
        provideHttpClientTesting(),
        provideSiteStatus(),
      ],
    });
    auth = TestBed.inject(AuthService);
    site = TestBed.inject(SiteStatus);
    http = TestBed.inject(HttpClient);
    backend = TestBed.inject(HttpTestingController);
  });

  afterEach(() => backend.verify());

  it('any answer 503 not_set_up (the settings gone while a page is open) stops the app, and the library’s page takes its place', async () => {
    const answer = firstValueFrom(http.get('/api/kanji/summary'));
    backend.expectOne('/api/kanji/summary').flush(NOT_SET_UP, { status: 503, statusText: 'Service Unavailable' });
    await expect(answer).rejects.toBeInstanceOf(HttpErrorResponse);
    expect(auth.state()).toBe('not-set-up');
    expect([site.state(), site.installed()]).toEqual(['not-set-up', false]);
  });

  it('a site installed once: never the setup page', async () => {
    const answer = firstValueFrom(http.get('/api/meta'));
    backend.expectOne('/api/meta').flush({ ...NOT_SET_UP, installed: true, setup: undefined }, { status: 503, statusText: 'Service Unavailable' });
    await expect(answer).rejects.toBeInstanceOf(HttpErrorResponse);
    expect([auth.state(), site.state(), site.installed()]).toEqual(['not-set-up', 'not-set-up', true]);
  });

  it('any other failure leaves the app as it is - a site being updated, too: the library’s gate stands in, and the sign-in goes on', async () => {
    for (const [status, body] of [
      [503, { code: 'update_pending', message: 'The site is being updated. Try again in a few minutes.' }],
      [503, { error: 'The database is not reachable.', code: 'database_unavailable' }],
      [500, { error: 'Something went wrong on the server.', code: 'not_set_up' }],
      [401, { error: 'Sign in first.' }],
    ] as const) {
      const answer = firstValueFrom(http.get('/api/attempts'));
      backend.expectOne('/api/attempts').flush(body, { status, statusText: 'No' });
      await expect(answer).rejects.toBeInstanceOf(HttpErrorResponse);
    }
    expect(auth.state()).toBe('starting');
    expect(site.state()).toBe('update-pending');
  });

  it('another host’s answer says nothing about this copy', async () => {
    const answer = firstValueFrom(http.get('https://elsewhere.example/api/kanji/summary'));
    backend.expectOne('https://elsewhere.example/api/kanji/summary').flush({ code: 'not_set_up' }, { status: 503, statusText: 'Service Unavailable' });
    await expect(answer).rejects.toBeInstanceOf(HttpErrorResponse);
    expect(auth.state()).toBe('starting');
  });
});
