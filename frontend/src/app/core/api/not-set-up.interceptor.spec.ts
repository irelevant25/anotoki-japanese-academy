import { HttpClient, HttpErrorResponse, provideHttpClient, withInterceptors } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { provideZonelessChangeDetection } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { firstValueFrom } from 'rxjs';
import { AuthService } from '../auth/auth.service';
import { notSetUpInterceptor } from './not-set-up.interceptor';

describe('notSetUpInterceptor', () => {
  let auth: AuthService;
  let http: HttpClient;
  let backend: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideZonelessChangeDetection(), provideHttpClient(withInterceptors([notSetUpInterceptor])), provideHttpClientTesting()],
    });
    auth = TestBed.inject(AuthService);
    http = TestBed.inject(HttpClient);
    backend = TestBed.inject(HttpTestingController);
  });

  afterEach(() => backend.verify());

  it('any answer 503 not_set_up (a database missing, found out later) puts up the page that says so', async () => {
    const answer = firstValueFrom(http.get('/api/kanji/summary'));
    backend
      .expectOne('/api/kanji/summary')
      .flush({ error: 'Japanese Academy is not set up yet. Open /setup.php to set it up.', code: 'not_set_up', setup: '/setup.php' }, { status: 503, statusText: 'Service Unavailable' });
    await expect(answer).rejects.toBeInstanceOf(HttpErrorResponse);
    expect(auth.state()).toBe('not-set-up');
    expect(auth.notSetUpReason()).toBeNull();
  });

  it('with the reason, when the server gives this computer one', async () => {
    const answer = firstValueFrom(http.get('/api/meta'));
    backend.expectOne('/api/meta').flush({ code: 'not_set_up', reason: 'backend/config/app.local.php is missing' }, { status: 503, statusText: 'Service Unavailable' });
    await expect(answer).rejects.toBeInstanceOf(HttpErrorResponse);
    expect(auth.notSetUpReason()).toBe('backend/config/app.local.php is missing');
  });

  it('any other failure leaves the app as it is', async () => {
    for (const [status, body] of [
      [503, { error: 'The database could not be brought up to date with the upload.' }],
      [500, { error: 'Something went wrong on the server.', code: 'not_set_up' }],
      [401, { error: 'Sign in first.' }],
    ] as const) {
      const answer = firstValueFrom(http.get('/api/attempts'));
      backend.expectOne('/api/attempts').flush(body, { status, statusText: 'No' });
      await expect(answer).rejects.toBeInstanceOf(HttpErrorResponse);
    }
    expect(auth.state()).toBe('starting');
  });

  it('another host’s answer says nothing about this copy', async () => {
    const answer = firstValueFrom(http.get('https://elsewhere.example/api/kanji/summary'));
    backend.expectOne('https://elsewhere.example/api/kanji/summary').flush({ code: 'not_set_up' }, { status: 503, statusText: 'Service Unavailable' });
    await expect(answer).rejects.toBeInstanceOf(HttpErrorResponse);
    expect(auth.state()).toBe('starting');
  });
});
