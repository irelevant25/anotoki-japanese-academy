import { ApplicationRef, provideZonelessChangeDetection } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { ANOTOKI_AUTH_CLIENT_FACTORY, AnotokiAuthEnvironment, AnotokiAuthOptions } from '@anotoki/lib/auth';
import { FakeAuthClient } from '@anotoki/lib/auth/testing';
import { TranslationService } from '@anotoki/lib/translations';
import { provideTestTranslations } from '@anotoki/lib/translations/testing';
import { provideAuth } from '../../core/auth/auth.config';
import { AuthService } from '../../core/auth/auth.service';
import { SignInComponent } from './sign-in.component';

/** The sign-in's settings of a copy whose client id is this test's own (the client's storage listeners stay on the window). */
function website(): string {
  const clientId = `academy-test-${Math.random().toString(36).slice(2, 10)}`;
  globalThis.fetch = vi.fn(() =>
    Promise.resolve(new Response(JSON.stringify({ issuer: 'https://iam.test', client_id: clientId }), { status: 200, headers: { 'Content-Type': 'application/json' } })),
  ) as unknown as typeof fetch;
  return clientId;
}

describe('SignInComponent: the Sign in card - a session that ended while the page was open', () => {
  const realFetch = globalThis.fetch;

  beforeEach(() => TestBed.configureTestingModule({ providers: [provideZonelessChangeDetection(), provideAuth()] }));
  afterEach(() => {
    globalThis.fetch = realFetch;
    history.replaceState(null, '', '/');
    vi.restoreAllMocks();
  });

  it('its own words with no strings: the English it keeps, word for word — no key', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const fixture = TestBed.createComponent(SignInComponent);
    await fixture.whenStable();
    const el = fixture.nativeElement as HTMLElement;
    expect(el.querySelector('anotoki-card p')?.textContent?.trim()).toBe('Sign in to study. Your kanji progress and your exam results are kept with your account.');
    expect(el.querySelector('#signin-button')?.textContent?.trim()).toBe('Sign in');
    expect(el.querySelector('h1 .mark')?.getAttribute('lang')).toBe('ja');
    expect(el.querySelector('[role="alert"]'), 'nothing went wrong: it has nothing to say of a failure (the library’s screen does that)').toBeNull();
    expect(warn, 'a page without strings asks for none').not.toHaveBeenCalled();
  });

  it('a sign-in that came back without one is no business of the card’s: the library’s client finishes the callback (the IAM’s SDK’s storage, read as it was) and the failure is the library’s screen’s to say', async () => {
    const clientId = website();
    const state = `state-${Math.random().toString(36).slice(2, 10)}`;
    sessionStorage.setItem(`anotoki-auth:${clientId}:login:${state}`, JSON.stringify({ verifier: 'v', nonce: 'n', returnTo: '/exam', createdAt: Date.now() }));
    history.replaceState(null, '', `/auth/callback?error=access_denied&error_description=${encodeURIComponent('This account cannot use Japanese Academy')}&state=${state}`);
    const auth = TestBed.inject(AuthService);
    await auth.init();
    expect([auth.state(), auth.signInError(), auth.showSignIn()]).toEqual(['signed-out', { code: 'access_denied' }, false]);
    expect(location.pathname, 'the callback left the address bar: back where the sign-in started').toBe('/exam');
  });
});

describe('SignInComponent: in the reader’s language, and its button', () => {
  const realFetch = globalThis.fetch;
  const ENGLISH = {
    'signIn.intro': 'Sign in to study. Your kanji progress and your exam results are kept with your account.',
    'signIn.button': 'Sign in',
  };
  const SLOVAK = {
    'signIn.intro': 'Ak sa chceš učiť, prihlás sa. Tvoj pokrok v kanji a výsledky skúšok sa ukladajú k tvojmu účtu.',
    'signIn.button': 'Prihlásiť sa',
  };
  let client: FakeAuthClient | null = null;

  beforeEach(() =>
    TestBed.configureTestingModule({
      providers: [
        provideZonelessChangeDetection(),
        provideAuth(),
        provideTestTranslations(SLOVAK, { language: 'sk', english: ENGLISH }),
        // A stand-in IAM client: nobody leaves the test for the IAM.
        {
          provide: ANOTOKI_AUTH_CLIENT_FACTORY,
          useValue: (options: AnotokiAuthOptions, environment: AnotokiAuthEnvironment) => (client = new FakeAuthClient(options, environment, null)),
        },
      ],
    }),
  );
  afterEach(() => {
    globalThis.fetch = realFetch;
    client = null;
    history.replaceState(null, '', '/');
    vi.restoreAllMocks();
  });

  it('its own words come from the strings, and follow the language', async () => {
    const fixture = TestBed.createComponent(SignInComponent);
    await fixture.whenStable();
    const el = fixture.nativeElement as HTMLElement;
    expect(el.querySelector('anotoki-card p')?.textContent?.trim()).toBe('Ak sa chceš učiť, prihlás sa. Tvoj pokrok v kanji a výsledky skúšok sa ukladajú k tvojmu účtu.');
    expect(el.querySelector('#signin-button')?.textContent?.trim()).toBe('Prihlásiť sa');

    await TestBed.inject(TranslationService).setLanguage('en', { remember: false });
    await TestBed.inject(ApplicationRef).whenStable();
    expect(el.querySelector('anotoki-card p')?.textContent?.trim()).toBe('Sign in to study. Your kanji progress and your exam results are kept with your account.');
    expect(el.querySelector('#signin-button')?.textContent?.trim()).toBe('Sign in');
  });

  it('Sign in: to the IAM, back to this page, its pages in the language read here - the button held while the browser goes', async () => {
    website();
    history.replaceState(null, '', '/kanji');
    await TestBed.inject(AuthService).init();
    const fixture = TestBed.createComponent(SignInComponent);
    await fixture.whenStable();
    const el = fixture.nativeElement as HTMLElement;
    (el.querySelector('#signin-button') as HTMLButtonElement).click();
    await vi.waitFor(() => expect(client?.logins).toEqual([{ returnTo: '/kanji', uiLocales: 'sk' }]));
    await fixture.whenStable();
    expect((el.querySelector('#signin-button') as HTMLButtonElement).disabled, 'on its way: pressed once').toBe(true);
  });

  it('a sign-in that cannot even start (the browser refuses the storage): its code for the library’s screen, and the button is free again', async () => {
    website();
    const auth = TestBed.inject(AuthService);
    await auth.init();
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    vi.spyOn(client as FakeAuthClient, 'login').mockRejectedValue(Object.assign(new Error('This browser will not let the site remember the sign-in in progress'), { code: 'storage_unavailable' }));
    const fixture = TestBed.createComponent(SignInComponent);
    await fixture.whenStable();
    const el = fixture.nativeElement as HTMLElement;
    (el.querySelector('#signin-button') as HTMLButtonElement).click();
    await vi.waitFor(() => expect(auth.signInError()).toEqual({ code: 'storage_unavailable' }));
    await fixture.whenStable();
    expect((el.querySelector('#signin-button') as HTMLButtonElement).disabled).toBe(false);
    expect(el.textContent).not.toContain('This browser');
  });
});
