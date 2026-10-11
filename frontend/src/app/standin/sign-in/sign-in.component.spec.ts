import { ApplicationRef, provideZonelessChangeDetection } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { TranslationService } from '@anotoki/lib/translations';
import { provideTestTranslations } from '@anotoki/lib/translations/testing';
import { AuthService } from '../../core/auth/auth.service';
import { SignInComponent } from './sign-in.component';

/**
 * The IAM sends the browser back to /auth/callback with an error, for a
 * sign-in this page started (its state waiting in sessionStorage, as the SDK
 * keeps it): the real SDK finishes that callback, then the Sign in page shows.
 */
async function comeBack(error: string, description: string): Promise<HTMLElement> {
  const clientId = `academy-test-${Math.random().toString(36).slice(2, 10)}`;
  const state = `state-${Math.random().toString(36).slice(2, 10)}`;
  sessionStorage.setItem(`anotoki-auth:${clientId}:login:${state}`, JSON.stringify({ verifier: 'v', nonce: 'n', returnTo: '/', createdAt: Date.now() }));
  history.replaceState(null, '', `/auth/callback?error=${error}&error_description=${encodeURIComponent(description)}&state=${state}`);
  globalThis.fetch = vi.fn(() =>
    Promise.resolve(new Response(JSON.stringify({ issuer: 'https://iam.test', clientId }), { status: 200, headers: { 'Content-Type': 'application/json' } })),
  ) as unknown as typeof fetch;
  const auth = TestBed.inject(AuthService);
  await auth.init();
  expect(auth.state()).toBe('signed-out');
  expect(auth.showSignIn(), 'the card is what the app draws now').toBe(true);
  const fixture = TestBed.createComponent(SignInComponent);
  await fixture.whenStable();
  return fixture.nativeElement as HTMLElement;
}

describe('SignInComponent: a sign-in that came back without one', () => {
  const realFetch = globalThis.fetch;

  beforeEach(() => TestBed.configureTestingModule({ providers: [provideZonelessChangeDetection()] }));
  afterEach(() => {
    globalThis.fetch = realFetch;
    history.replaceState(null, '', '/');
  });

  // The rule changed (it was "in the IAM's own words"): the IAM's sentence is
  // English, so the page words a sign-in that came back without one from its
  // code. With no strings in memory, as here, it draws the English it keeps.
  // Every account may study now (IAM 007): it no longer says that an account may have no access.
  const NOT_COMPLETED = 'Signing in was not completed. Try again.';

  it('cancelled at the IAM: one sentence of the page’s own, true whoever ended it — not the IAM’s', async () => {
    const el = await comeBack('access_denied', 'The sign-in was cancelled');
    expect(el.querySelector('.err')?.textContent?.trim()).toBe(NOT_COMPLETED);
    expect(location.pathname, 'the callback left the address bar').toBe('/');
  });

  it('refused by the IAM: the same sentence, and nothing of the IAM’s English', async () => {
    const el = await comeBack('access_denied', 'This account cannot use Japanese Academy');
    expect(el.querySelector('.err')?.textContent?.trim()).toBe(NOT_COMPLETED);
    expect(el.textContent).not.toContain('cannot use');
  });

  it('any other failure: signing in did not work, with its code — not the IAM’s sentence', async () => {
    const el = await comeBack('server_error', 'The IAM could not finish the sign-in');
    expect(el.querySelector('.err')?.textContent?.trim()).toBe('Signing in did not work. Try again. (server_error)');
    expect(el.textContent).not.toContain('could not finish');
  });

  it('its own words with no strings: the English it keeps, word for word — no key, and nothing said before anything went wrong', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const fixture = TestBed.createComponent(SignInComponent);
    await fixture.whenStable();
    const el = fixture.nativeElement as HTMLElement;
    expect(el.querySelector('.panel > p:not(.err)')?.textContent?.trim()).toBe('Sign in to study. Your kanji progress and your exam results are kept with your account.');
    expect(el.querySelector('#signin-button')?.textContent?.trim()).toBe('Sign in');
    expect(el.querySelector('.err')?.textContent).toBe('');
    expect(el.querySelector('h1 .mark')?.getAttribute('lang')).toBe('ja');
    expect(warn, 'a page without strings asks for none').not.toHaveBeenCalled();
    warn.mockRestore();
  });
});

describe('SignInComponent: in the reader’s language', () => {
  const realFetch = globalThis.fetch;
  const ENGLISH = {
    'signIn.intro': 'Sign in to study. Your kanji progress and your exam results are kept with your account.',
    'signIn.button': 'Sign in',
    'signIn.notCompleted': 'Signing in was not completed.',
    'signIn.failed': 'Signing in did not work. Try again. ({code})',
  };
  const SLOVAK = {
    'signIn.intro': 'Ak sa chceš učiť, prihlás sa. Tvoj pokrok v kanji a výsledky skúšok sa ukladajú k tvojmu účtu.',
    'signIn.button': 'Prihlásiť sa',
    'signIn.notCompleted': 'Prihlásenie sa nedokončilo.',
    'signIn.failed': 'Prihlásenie sa nepodarilo. Skús to znova. ({code})',
  };

  beforeEach(() => TestBed.configureTestingModule({ providers: [provideZonelessChangeDetection(), provideTestTranslations(SLOVAK, { language: 'sk', english: ENGLISH })] }));
  afterEach(() => {
    globalThis.fetch = realFetch;
    history.replaceState(null, '', '/');
    vi.restoreAllMocks();
  });

  it('words the failure from the strings, and again when the language changes', async () => {
    const el = await comeBack('server_error', 'The IAM could not finish the sign-in');
    expect(el.querySelector('.err')?.textContent?.trim()).toBe('Prihlásenie sa nepodarilo. Skús to znova. (server_error)');

    await TestBed.inject(TranslationService).setLanguage('en', { remember: false });
    await TestBed.inject(ApplicationRef).whenStable();
    expect(el.querySelector('.err')?.textContent?.trim()).toBe('Signing in did not work. Try again. (server_error)');
  });

  it('its own words come from the strings too, and follow the language', async () => {
    const fixture = TestBed.createComponent(SignInComponent);
    await fixture.whenStable();
    const el = fixture.nativeElement as HTMLElement;
    expect(el.querySelector('.panel > p:not(.err)')?.textContent?.trim()).toBe('Ak sa chceš učiť, prihlás sa. Tvoj pokrok v kanji a výsledky skúšok sa ukladajú k tvojmu účtu.');
    expect(el.querySelector('#signin-button')?.textContent?.trim()).toBe('Prihlásiť sa');

    await TestBed.inject(TranslationService).setLanguage('en', { remember: false });
    await TestBed.inject(ApplicationRef).whenStable();
    expect(el.querySelector('.panel > p:not(.err)')?.textContent?.trim()).toBe('Sign in to study. Your kanji progress and your exam results are kept with your account.');
    expect(el.querySelector('#signin-button')?.textContent?.trim()).toBe('Sign in');
  });

  it('a sign-in that cannot even start says so with its code, never the SDK’s sentence, and hands the IAM the language read here', async () => {
    const clientId = `academy-test-${Math.random().toString(36).slice(2, 10)}`;
    globalThis.fetch = vi.fn(() =>
      Promise.resolve(new Response(JSON.stringify({ issuer: 'https://iam.test', clientId }), { status: 200, headers: { 'Content-Type': 'application/json' } })),
    ) as unknown as typeof fetch;
    history.replaceState(null, '', '/kanji');
    const auth = TestBed.inject(AuthService);
    await auth.init();
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    // The SDK itself refuses: the browser will not keep the sign-in in progress.
    const login = vi.fn(() => Promise.reject(Object.assign(new Error('This browser will not let the site remember the sign-in in progress'), { code: 'storage_unavailable' })));
    (auth as unknown as { sdk: { login: typeof login } }).sdk.login = login;
    const fixture = TestBed.createComponent(SignInComponent);
    await fixture.whenStable();
    const el = fixture.nativeElement as HTMLElement;
    expect(el.querySelector('.err')?.textContent?.trim()).toBe('');

    (el.querySelector('#signin-button') as HTMLButtonElement).click();
    await vi.waitFor(async () => {
      await fixture.whenStable();
      expect(el.querySelector('.err')?.textContent?.trim()).toBe('Prihlásenie sa nepodarilo. Skús to znova. (storage_unavailable)');
    });
    expect(login.mock.calls).toEqual([[{ returnTo: '/kanji', uiLocales: 'sk' }]]);
    expect(el.textContent).not.toContain('This browser');
    expect((el.querySelector('#signin-button') as HTMLButtonElement).disabled).toBe(false);
  });
});
