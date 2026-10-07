import { HttpClient, HttpErrorResponse, HttpRequest, provideHttpClient, withInterceptors } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { computed, provideZonelessChangeDetection, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { firstValueFrom } from 'rxjs';
import { authInterceptor, makesVisitor, takesToken } from './auth.interceptor';
import { AppState, AuthService, Caller, isThisSite } from './auth.service';
import { CARRIES_VISITOR_KEY, issuedAs } from './issued-as';
import { VISITOR_STORAGE_KEY } from './visitor-key';

/** Keys as the server makes them: 43 characters of base64url. */
const KEY = 'k'.repeat(43);
const OTHER_KEY = 'o'.repeat(43);
const NEW_KEY = 'n'.repeat(43);

/** The sign-in as the interceptor sees it: what the page is shown as, a token, a fresh one on a refresh, and whose they are. */
class FakeAuth {
  readonly state = signal<AppState>('ready');
  readonly signedIn = computed(() => this.state() === 'ready');
  readonly loginRequired = signal(true);
  /** Whether the sign-in is set up at all (an IAM's SDK): without it, nobody's requests. */
  sdk = true;
  current: string | null = 'first-token';
  next: string | null = 'second-token';
  /** Who is signed in; nextWho, after a refresh (another tab may have signed somebody else in). */
  who: string | null = '7';
  nextWho: string | null = '7';
  refusals = 0;
  requiredNow = 0;
  caller(): Caller {
    if (this.state() === 'visiting') {
      return 'visitor';
    }
    return this.sdk ? 'person' : 'nobody';
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
  signInRequiredNow(): void {
    this.requiredNow += 1;
    this.loginRequired.set(true);
  }
}

/** The token is asked for asynchronously, and a held request waits for another's answer: let that happen. */
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
    // where the site stands (the anotoki library's status): nobody's data, asked before the sign-in is set up
    expect(takesToken('/api/site-status')).toBe(false);
    expect(takesToken('/api/admin/migrations')).toBe(true);
  });

  it('the saves that may make a visitor: the ones the server makes one on (study_route with mayMake), and nothing else', () => {
    const post = (url: string) => new HttpRequest('POST', url, {});
    for (const url of ['/api/kanji/learn', '/api/kanji/review', '/api/kanji/practice', '/api/kanji/item', '/api/kanji/settings', '/api/submit']) {
      expect(makesVisitor(post(url)), url).toBe(true);
    }
    for (const url of ['/api/kanji/reset', '/api/kanji/reset-item', '/api/exam', '/api/visitor/move', '/api/me/data', '/api/kanji/learned']) {
      expect(makesVisitor(post(url)), url).toBe(false);
    }
    expect(makesVisitor(new HttpRequest('GET', '/api/kanji/learn'))).toBe(false);
  });
});

describe('authInterceptor', () => {
  let auth: FakeAuth;
  let http: HttpClient;
  let backend: HttpTestingController;

  beforeEach(() => {
    localStorage.removeItem(VISITOR_STORAGE_KEY);
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

  afterEach(() => {
    backend.verify();
    localStorage.removeItem(VISITOR_STORAGE_KEY);
    vi.restoreAllMocks();
  });

  describe('a person’s page', () => {
    it('sends the token and the reader’s time zone to this site’s API', async () => {
      const answer = firstValueFrom(http.get('/api/kanji/progress'));
      await settle();
      const request = backend.expectOne('/api/kanji/progress');
      expect(request.request.headers.get('Authorization')).toBe('Bearer first-token');
      expect(request.request.headers.get('X-Time-Zone')).toBe(Intl.DateTimeFormat().resolvedOptions().timeZone);
      request.flush({ ok: true });
      expect(await answer).toEqual({ ok: true });
    });

    it('the time zone is the browser’s own IANA name, whatever it is (Asia/Tokyo here)', async () => {
      vi.spyOn(Intl.DateTimeFormat.prototype, 'resolvedOptions').mockReturnValue({ timeZone: 'Asia/Tokyo' } as Intl.ResolvedDateTimeFormatOptions);
      const answer = firstValueFrom(http.post('/api/kanji/review', { id: 'k:大' }));
      await settle();
      const request = backend.expectOne('/api/kanji/review');
      expect(request.request.headers.get('X-Time-Zone')).toBe('Asia/Tokyo');
      request.flush({});
      await answer;
    });

    it('a browser that names no time zone: no header at all, and the server keeps the one it knows', async () => {
      vi.spyOn(Intl.DateTimeFormat.prototype, 'resolvedOptions').mockReturnValue({ timeZone: '' } as Intl.ResolvedDateTimeFormatOptions);
      const answer = firstValueFrom(http.get('/api/kanji/progress'));
      await settle();
      const request = backend.expectOne('/api/kanji/progress');
      expect(request.request.headers.has('X-Time-Zone')).toBe(false);
      expect(request.request.headers.get('Authorization')).toBe('Bearer first-token');
      request.flush({});
      await answer;
    });

    it('never the token, a key or the time zone to another host', async () => {
      localStorage.setItem(VISITOR_STORAGE_KEY, KEY);
      auth.state.set('visiting');
      const answer = firstValueFrom(http.get('https://iam.test/api/oidc/userinfo'));
      await settle();
      const request = backend.expectOne('https://iam.test/api/oidc/userinfo');
      expect(request.request.headers.has('Authorization')).toBe(false);
      expect(request.request.headers.has('X-Visitor-Key')).toBe(false);
      expect(request.request.headers.has('X-Time-Zone')).toBe(false);
      request.flush({});
      await answer;
    });

    it('no token to send (the session ended, or somebody else signed in in another tab): never sent — a 401 sign_in_required of its own, and the page’s signed-out handling takes over; no visitor made', async () => {
      auth.current = null;
      auth.loginRequired.set(false); // the site welcomes visitors: the request still never goes out as one
      const answer = firstValueFrom(http.post('/api/kanji/learn', { id: 'k:大' })).catch((e: unknown) => e);
      await settle();
      backend.expectNone('/api/kanji/learn');
      const error = await answer;
      expect(error).toBeInstanceOf(HttpErrorResponse);
      expect([(error as HttpErrorResponse).status, (error as HttpErrorResponse).error?.code]).toEqual([401, 'sign_in_required']);
      expect(auth.refusals).toBe(1);
      expect(localStorage.getItem(VISITOR_STORAGE_KEY)).toBeNull();
    });

    it('decided when issued: a request issued on a person’s page whose page turns into a visitor’s before its token comes is still a person’s', async () => {
      auth.loginRequired.set(false);
      localStorage.setItem(VISITOR_STORAGE_KEY, KEY);
      auth.current = null;
      const answer = firstValueFrom(http.post('/api/kanji/learn', { id: 'k:大' })).catch((e: unknown) => e);
      auth.state.set('visiting');
      await settle();
      backend.expectNone('/api/kanji/learn');
      expect(await answer).toBeInstanceOf(HttpErrorResponse);
    });

    it('a key is taken off a person’s request, and one in its answer is not kept', async () => {
      const error = vi.spyOn(console, 'error').mockImplementation(() => undefined);
      const answer = firstValueFrom(http.post('/api/kanji/learn', { id: 'k:大' }, { headers: { 'X-Visitor-Key': KEY } })).catch((e: unknown) => e);
      await settle();
      const request = backend.expectOne('/api/kanji/learn');
      expect(request.request.headers.has('X-Visitor-Key')).toBe(false);
      request.flush({}, { headers: { 'X-Visitor-Key': NEW_KEY } });
      await answer;
      expect(localStorage.getItem(VISITOR_STORAGE_KEY)).toBeNull();
      expect(error).toHaveBeenCalled();
    });

    it('a 2xx that brings a visitor key (a host that dropped the token, sign-in off: the save went to a new visitor) fails as not saved — never counted as this person’s', async () => {
      vi.spyOn(console, 'error').mockImplementation(() => undefined);
      auth.loginRequired.set(false);
      const answer = firstValueFrom(http.post('/api/kanji/learn', { id: 'k:大' })).catch((e: unknown) => e);
      await settle();
      const request = backend.expectOne('/api/kanji/learn');
      expect(request.request.headers.get('Authorization')).toBe('Bearer first-token');
      request.flush({ learned: true }, { headers: { 'X-Visitor-Key': NEW_KEY } });
      const error = await answer;
      expect(error).toBeInstanceOf(HttpErrorResponse);
      expect([(error as HttpErrorResponse).status, (error as HttpErrorResponse).error?.code]).toEqual([502, 'server_error']);
      expect(localStorage.getItem(VISITOR_STORAGE_KEY)).toBeNull();
      expect(auth.refusals, 'the person stays signed in').toBe(0);
    });

    it('the same after a fresh token: the retry’s answer with a visitor key fails too', async () => {
      vi.spyOn(console, 'error').mockImplementation(() => undefined);
      const answer = firstValueFrom(http.post('/api/kanji/review', { id: 'k:大' })).catch((e: unknown) => e);
      await settle();
      backend.expectOne('/api/kanji/review').flush({ error: 'expired' }, { status: 401, statusText: 'Unauthorized' });
      await settle();
      backend.expectOne('/api/kanji/review').flush({}, { headers: { 'X-Visitor-Key': NEW_KEY } });
      expect(((await answer) as HttpErrorResponse).status).toBe(502);
      expect(localStorage.getItem(VISITOR_STORAGE_KEY)).toBeNull();
    });

    it('the move (CARRIES_VISITOR_KEY) is the one person’s request whose answer may name a key without failing', async () => {
      const answer = firstValueFrom(
        http.post('/api/visitor/move', {}, { headers: { 'X-Visitor-Key': KEY }, context: issuedAs('person').set(CARRIES_VISITOR_KEY, true) }),
      );
      await settle();
      backend.expectOne('/api/visitor/move').flush({ found: true }, { headers: { 'X-Visitor-Key': KEY } });
      expect(await answer).toEqual({ found: true });
    });

    it('the move after a sign-in (CARRIES_VISITOR_KEY): the token and the key it set itself, the one request with both', async () => {
      const answer = firstValueFrom(
        http.post('/api/visitor/move', {}, { headers: { 'X-Visitor-Key': KEY }, context: issuedAs('person').set(CARRIES_VISITOR_KEY, true) }),
      );
      await settle();
      const request = backend.expectOne('/api/visitor/move');
      expect(request.request.headers.get('Authorization')).toBe('Bearer first-token');
      expect(request.request.headers.get('X-Visitor-Key')).toBe(KEY);
      request.flush({ found: true });
      await answer;
    });

    it('after a 401, tries once more with a fresh token', async () => {
      const answer = firstValueFrom(http.get('/api/kanji/progress'));
      await settle();
      backend.expectOne('/api/kanji/progress').flush({ error: 'expired' }, { status: 401, statusText: 'Unauthorized' });
      await settle();
      const retry = backend.expectOne('/api/kanji/progress');
      expect(retry.request.headers.get('Authorization')).toBe('Bearer second-token');
      expect(retry.request.headers.has('X-Time-Zone'), 'the retry carries the zone too').toBe(true);
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

  it('no sign-in set up yet (not set up, could not start): the call goes with the time zone alone — neither a token nor a key', async () => {
    auth.sdk = false;
    localStorage.setItem(VISITOR_STORAGE_KEY, KEY);
    const answer = firstValueFrom(http.get('/api/kanji/progress'));
    await settle();
    const request = backend.expectOne('/api/kanji/progress');
    expect(request.request.headers.has('Authorization')).toBe(false);
    expect(request.request.headers.has('X-Visitor-Key')).toBe(false);
    expect(request.request.headers.has('X-Time-Zone')).toBe(true);
    request.flush({});
    await answer;
  });

  describe('a visitor’s page (state visiting)', () => {
    beforeEach(() => {
      auth.state.set('visiting');
      auth.loginRequired.set(false);
    });

    it('the key this browser holds, read as the request leaves — never a token', async () => {
      localStorage.setItem(VISITOR_STORAGE_KEY, KEY);
      const first = firstValueFrom(http.get('/api/kanji/progress'));
      const request = backend.expectOne('/api/kanji/progress');
      expect(request.request.headers.get('X-Visitor-Key')).toBe(KEY);
      expect(request.request.headers.has('Authorization')).toBe(false);
      expect(request.request.headers.has('X-Time-Zone')).toBe(true);
      request.flush({});
      await first;

      // Another tab replaced it meanwhile: the next request sends what is stored now.
      localStorage.setItem(VISITOR_STORAGE_KEY, OTHER_KEY);
      const second = firstValueFrom(http.get('/api/attempts'));
      const next = backend.expectOne('/api/attempts');
      expect(next.request.headers.get('X-Visitor-Key')).toBe(OTHER_KEY);
      next.flush([]);
      await second;
      expect(auth.refusals).toBe(0);
    });

    it('with no key, a read goes as nobody; the save that makes the visitor brings the key, kept for every request after it', async () => {
      const read = firstValueFrom(http.get('/api/kanji/summary'));
      const asNobody = backend.expectOne('/api/kanji/summary');
      expect(asNobody.request.headers.has('X-Visitor-Key')).toBe(false);
      asNobody.flush({});
      await read;

      const save = firstValueFrom(http.post('/api/kanji/learn', { id: 'k:大' }));
      backend.expectOne('/api/kanji/learn').flush({ state: {} }, { headers: { 'X-Visitor-Key': NEW_KEY } });
      await save;
      expect(localStorage.getItem(VISITOR_STORAGE_KEY)).toBe(NEW_KEY);

      const next = firstValueFrom(http.get('/api/kanji/progress'));
      const withKey = backend.expectOne('/api/kanji/progress');
      expect(withKey.request.headers.get('X-Visitor-Key')).toBe(NEW_KEY);
      withKey.flush({});
      await next;
    });

    it('the first key stays: a key in another answer (another tab made one a moment earlier) never replaces the stored one', async () => {
      const save = firstValueFrom(http.post('/api/kanji/learn', { id: 'k:大' }));
      // Another tab's save made a visitor first, while this one was on its way.
      localStorage.setItem(VISITOR_STORAGE_KEY, OTHER_KEY);
      backend.expectOne('/api/kanji/learn').flush({}, { headers: { 'X-Visitor-Key': NEW_KEY } });
      await save;
      expect(localStorage.getItem(VISITOR_STORAGE_KEY)).toBe(OTHER_KEY);
    });

    it('one visitor per browser: saves (and reads) issued while the first save is on its way wait for its answer, then go with its key', async () => {
      const first = firstValueFrom(http.post('/api/kanji/learn', { id: 'k:大' }));
      const second = firstValueFrom(http.post('/api/kanji/learn', { id: 'k:学' }));
      const read = firstValueFrom(http.get('/api/kanji/progress'));
      await settle();
      const out = backend.match(() => true);
      expect(out.map((r) => r.request.url), 'only the first went out').toEqual(['/api/kanji/learn']);
      expect(out[0].request.headers.has('X-Visitor-Key')).toBe(false);
      out[0].flush({}, { headers: { 'X-Visitor-Key': NEW_KEY } });
      await first;
      await settle();
      const after = backend.match(() => true);
      expect(after.map((r) => [r.request.url, r.request.headers.get('X-Visitor-Key')])).toEqual([
        ['/api/kanji/learn', NEW_KEY],
        ['/api/kanji/progress', NEW_KEY],
      ]);
      after.forEach((r) => r.flush({}));
      await Promise.all([second, read]);
    });

    it('a first save that fails brings no key: the waiting saves go one at a time again, the next one alone', async () => {
      const first = firstValueFrom(http.post('/api/kanji/learn', { id: 'k:x' }));
      const second = firstValueFrom(http.post('/api/kanji/learn', { id: 'k:大' }));
      const third = firstValueFrom(http.post('/api/kanji/learn', { id: 'k:学' }));
      await settle();
      backend.expectOne('/api/kanji/learn').flush({ error: 'No such item.', code: 'no_such_item' }, { status: 422, statusText: 'Unprocessable' });
      await expect(first).rejects.toBeInstanceOf(HttpErrorResponse);
      await settle();
      const next = backend.match('/api/kanji/learn');
      expect(next.length, 'the next save alone').toBe(1);
      expect(next[0].request.body).toEqual({ id: 'k:大' });
      next[0].flush({}, { headers: { 'X-Visitor-Key': NEW_KEY } });
      await second;
      await settle();
      const last = backend.expectOne('/api/kanji/learn');
      expect(last.request.headers.get('X-Visitor-Key')).toBe(NEW_KEY);
      last.flush({});
      await third;
    });

    it('401 visitor_unknown: the key sent is forgotten (only while it is still the one held) and the request tried once more without it', async () => {
      localStorage.setItem(VISITOR_STORAGE_KEY, KEY);
      const answer = firstValueFrom(http.get('/api/kanji/progress'));
      backend.expectOne('/api/kanji/progress').flush({ code: 'visitor_unknown' }, { status: 401, statusText: 'Unauthorized' });
      await settle();
      expect(localStorage.getItem(VISITOR_STORAGE_KEY)).toBeNull();
      const again = backend.expectOne('/api/kanji/progress');
      expect(again.request.headers.has('X-Visitor-Key')).toBe(false);
      again.flush({ items: {} });
      expect(await answer).toEqual({ items: {} });

      // A key another tab stored meanwhile is not the one refused: it stays, and the try again goes with it.
      localStorage.setItem(VISITOR_STORAGE_KEY, KEY);
      const second = firstValueFrom(http.get('/api/kanji/progress'));
      localStorage.setItem(VISITOR_STORAGE_KEY, OTHER_KEY);
      backend.expectOne('/api/kanji/progress').flush({ code: 'visitor_unknown' }, { status: 401, statusText: 'Unauthorized' });
      await settle();
      expect(localStorage.getItem(VISITOR_STORAGE_KEY)).toBe(OTHER_KEY);
      backend.expectOne('/api/kanji/progress').flush({});
      await second;
      expect(auth.refusals).toBe(0);
    });

    it('a key the server no longer knows is tried again once only', async () => {
      localStorage.setItem(VISITOR_STORAGE_KEY, KEY);
      const answer = firstValueFrom(http.get('/api/kanji/progress'));
      backend.expectOne('/api/kanji/progress').flush({ code: 'visitor_unknown' }, { status: 401, statusText: 'Unauthorized' });
      await settle();
      localStorage.setItem(VISITOR_STORAGE_KEY, OTHER_KEY);
      backend.expectOne('/api/kanji/progress').flush({ code: 'visitor_unknown' }, { status: 401, statusText: 'Unauthorized' });
      await expect(answer).rejects.toBeInstanceOf(HttpErrorResponse);
      backend.expectNone('/api/kanji/progress');
    });

    it('401 sign_in_required: the IAM requires sign-in now — said to AuthService, and the key KEPT for the sign-in to move', async () => {
      localStorage.setItem(VISITOR_STORAGE_KEY, KEY);
      const answer = firstValueFrom(http.post('/api/kanji/review', { id: 'k:大' }));
      backend.expectOne('/api/kanji/review').flush({ code: 'sign_in_required' }, { status: 401, statusText: 'Unauthorized' });
      await expect(answer).rejects.toBeInstanceOf(HttpErrorResponse);
      expect(auth.requiredNow).toBe(1);
      expect(localStorage.getItem(VISITOR_STORAGE_KEY)).toBe(KEY);
    });

    it('while the IAM requires sign-in: neither a key nor a token, and no key taken from an answer — the one held stays', async () => {
      auth.loginRequired.set(true);
      localStorage.setItem(VISITOR_STORAGE_KEY, KEY);
      const answer = firstValueFrom(http.post('/api/kanji/learn', { id: 'k:大' }));
      const request = backend.expectOne('/api/kanji/learn');
      expect(request.request.headers.has('X-Visitor-Key')).toBe(false);
      expect(request.request.headers.has('Authorization')).toBe(false);
      request.flush({ code: 'sign_in_required' }, { status: 401, statusText: 'Unauthorized' });
      await expect(answer).rejects.toBeInstanceOf(HttpErrorResponse);
      expect(localStorage.getItem(VISITOR_STORAGE_KEY)).toBe(KEY);
      expect(auth.requiredNow).toBe(1);
    });

    it('what only a person may do (issued as a person: the data file, the admin panel) is never sent with no token', async () => {
      auth.current = null;
      const answer = firstValueFrom(http.get('/api/admin/people', { context: issuedAs('person') })).catch((e: unknown) => e);
      await settle();
      backend.expectNone('/api/admin/people');
      expect(await answer).toBeInstanceOf(HttpErrorResponse);
    });
  });
});
