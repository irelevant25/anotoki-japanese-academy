import { HttpClient, HttpErrorResponse, provideHttpClient, withInterceptors } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { provideZonelessChangeDetection } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { firstValueFrom } from 'rxjs';
import { authInterceptor, takesToken } from './auth.interceptor';
import { AuthService, isThisSite } from './auth.service';

/** The sign-in as the interceptor sees it: a token, a fresh one on a refresh, and whose they are. */
class FakeAuth {
  signs = true;
  current: string | null = 'first-token';
  next: string | null = 'second-token';
  /** Who is signed in; nextWho, after a refresh (another tab may have signed somebody else in). */
  who: string | null = '7';
  nextWho: string | null = '7';
  refusals = 0;
  signsIn(): boolean {
    return this.signs;
  }
  subject(): string | null {
    return this.who;
  }
  token(): Promise<string | null> {
    return Promise.resolve(this.current);
  }
  refreshToken(): Promise<string | null> {
    this.who = this.nextWho;
    return Promise.resolve(this.next);
  }
  refused(): void {
    this.refusals += 1;
  }
}

/** The token is asked for asynchronously: let that happen. */
const settle = () => new Promise((resolve) => setTimeout(resolve, 0));

describe('which addresses get the token', () => {
  it('this site’s API and reports only', () => {
    expect(takesToken('/api/kanji/progress')).toBe(true);
    expect(takesToken(`${location.origin}/report/2026-09-22-exam-1`)).toBe(true);
    expect(takesToken('/changelog.json')).toBe(false);
    expect(takesToken('/audio/47ea3b04dfad7126.mp3')).toBe(false);
    expect(takesToken('https://iam.test/api/oidc/userinfo')).toBe(false);
    expect(takesToken('//elsewhere.example/api/kanji/progress')).toBe(false);
    expect(isThisSite('https://iam.test/')).toBe(false);
  });
});

describe('authInterceptor', () => {
  let auth: FakeAuth;
  let http: HttpClient;
  let backend: HttpTestingController;

  beforeEach(() => {
    auth = new FakeAuth();
    TestBed.configureTestingModule({
      providers: [
        provideZonelessChangeDetection(),
        provideHttpClient(withInterceptors([authInterceptor])),
        provideHttpClientTesting(),
        { provide: AuthService, useValue: auth },
      ],
    });
    http = TestBed.inject(HttpClient);
    backend = TestBed.inject(HttpTestingController);
  });

  afterEach(() => backend.verify());

  it('sends the token to this site’s API', async () => {
    const answer = firstValueFrom(http.get('/api/kanji/progress'));
    await settle();
    const request = backend.expectOne('/api/kanji/progress');
    expect(request.request.headers.get('Authorization')).toBe('Bearer first-token');
    request.flush({ ok: true });
    expect(await answer).toEqual({ ok: true });
  });

  it('never to another host', async () => {
    const answer = firstValueFrom(http.get('https://iam.test/api/oidc/userinfo'));
    await settle();
    const request = backend.expectOne('https://iam.test/api/oidc/userinfo');
    expect(request.request.headers.has('Authorization')).toBe(false);
    request.flush({});
    await answer;
  });

  it('adds nothing without sign-in (auth mode none)', async () => {
    auth.signs = false;
    const answer = firstValueFrom(http.get('/api/kanji/progress'));
    await settle();
    const request = backend.expectOne('/api/kanji/progress');
    expect(request.request.headers.has('Authorization')).toBe(false);
    request.flush({});
    await answer;
  });

  it('after a 401, tries once more with a fresh token', async () => {
    const answer = firstValueFrom(http.get('/api/kanji/progress'));
    await settle();
    backend.expectOne('/api/kanji/progress').flush({ error: 'expired' }, { status: 401, statusText: 'Unauthorized' });
    await settle();
    const retry = backend.expectOne('/api/kanji/progress');
    expect(retry.request.headers.get('Authorization')).toBe('Bearer second-token');
    retry.flush({ ok: 2 });
    expect(await answer).toEqual({ ok: 2 });
    expect(auth.refusals).toBe(0);
  });

  it('when the IAM gives no fresh token, the session is over', async () => {
    auth.next = null;
    const answer = firstValueFrom(http.get('/api/kanji/progress'));
    await settle();
    backend.expectOne('/api/kanji/progress').flush({ error: 'expired' }, { status: 401, statusText: 'Unauthorized' });
    await expect(answer).rejects.toBeInstanceOf(HttpErrorResponse);
    expect(auth.refusals).toBe(1);
  });

  it('never tries again as somebody else: a fresh token of another person (signed in in another tab) is not sent', async () => {
    auth.nextWho = '8';
    const answer = firstValueFrom(http.post('/api/kanji/review', { id: 'k:大' }));
    await settle();
    backend.expectOne('/api/kanji/review').flush({ error: 'expired' }, { status: 401, statusText: 'Unauthorized' });
    await expect(answer).rejects.toBeInstanceOf(HttpErrorResponse);
    backend.expectNone('/api/kanji/review');
    expect(auth.refusals).toBe(1);
  });
});
