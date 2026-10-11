import { ChangeDetectionStrategy, Component, provideZonelessChangeDetection, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { Router, provideRouter } from '@angular/router';
import { SiteStatus } from '@anotoki/lib/migrations';
import { provideTestTranslations } from '@anotoki/lib/translations/testing';
import { AppState, AuthService, SignInFailure } from './auth.service';
import { adminSignInGuard, signInGuard } from './sign-in.guard';

@Component({ selector: 'app-test-page', changeDetection: ChangeDetectionStrategy.OnPush, template: '' })
class PageComponent {}

describe('signInGuard, and adminSignInGuard on the admin panel', () => {
  const state = signal<AppState>('ready');
  const failure = signal<SignInFailure | null>(null);
  const askedFor = signal<string | null>(null);
  const auth = { state, signInError: failure, askedFor, login: vi.fn(async (_uiLocales?: string, _returnTo?: string) => true) };
  /** Whether the site is not ready by the anotoki library's account (SiteStatus.blocked: being updated, say). */
  const blocked = signal(false);

  beforeEach(() => {
    state.set('ready');
    failure.set(null);
    askedFor.set(null);
    blocked.set(false);
    auth.login.mockReset().mockResolvedValue(true);
    TestBed.configureTestingModule({
      providers: [
        provideZonelessChangeDetection(),
        provideRouter([
          { path: 'auth/callback', component: PageComponent },
          { path: 'admin', canActivate: [adminSignInGuard], component: PageComponent },
          { path: '', canActivateChild: [signInGuard], children: [{ path: '', component: PageComponent }, { path: 'kanji/:screen', component: PageComponent }] },
        ]),
        provideTestTranslations({}, { language: 'sk' }),
        { provide: AuthService, useValue: auth },
        { provide: SiteStatus, useValue: { blocked } },
      ],
    });
  });

  const go = (url: string) => TestBed.inject(Router).navigateByUrl(url);

  it('lets somebody signed in through, on every page', async () => {
    expect(await go('/kanji/reviews?x=1')).toBe(true);
    expect(await go('/admin')).toBe(true);
    expect(await go('/')).toBe(true);
    expect(auth.login).not.toHaveBeenCalled();
  });

  it('sends anybody else to the IAM first — nothing drawn — and back to the address they asked for, in their language', async () => {
    state.set('signed-out');
    expect(await go('/kanji/reviews?x=1#top')).toBe(false);
    expect(auth.login).toHaveBeenCalledWith('sk', '/kanji/reviews?x=1#top');
    expect(await go('/admin')).toBe(false);
    expect(auth.login).toHaveBeenLastCalledWith('sk', '/admin');
    expect(TestBed.inject(Router).url, 'nothing navigated').toBe('/');
  });

  it('the callback is not behind it: it only ever sends the browser home', async () => {
    state.set('signed-out');
    expect(await go('/auth/callback')).toBe(true);
    expect(auth.login).not.toHaveBeenCalled();
  });

  it('lets a page load that came back from the IAM without a sign-in through, to the Sign in card: sent back, the browser would go round for ever', async () => {
    state.set('signed-out');
    failure.set({ code: 'access_denied' });
    expect(await go('/kanji/reviews')).toBe(true);
    expect(await go('/admin')).toBe(true);
    expect(auth.login).not.toHaveBeenCalled();
  });

  it('keeps the address asked for through a refused sign-in: the page refuses it after all (whenReady), the card’s Sign in comes back there', async () => {
    state.set('signed-out');
    failure.set({ code: 'access_denied' });
    askedFor.set('/exam'); // as AuthService.init() keeps the callback's returnTo
    expect(await go('/kanji/reviews?x=1#top')).toBe(true);
    expect(askedFor()).toBe('/kanji/reviews?x=1#top');

    // Signed in after all (another tab): nothing more is kept.
    state.set('ready');
    expect(await go('/')).toBe(true);
    expect(askedFor()).toBe('/kanji/reviews?x=1#top');
  });

  it('a sign-in that cannot even start: through, to the card that says why — not a blank page — and no second trip', async () => {
    state.set('signed-out');
    // As AuthService does it: the browser refused the site its storage, so the SDK could not keep the sign-in in progress.
    auth.login.mockImplementation(async () => {
      failure.set({ code: 'storage_unavailable' });
      return false;
    });
    expect(await go('/kanji/reviews')).toBe(true);
    expect(auth.login).toHaveBeenCalledTimes(1);
    expect(askedFor(), 'the card’s Sign in tries this address again').toBe('/kanji/reviews');
    expect(await go('/admin')).toBe(true);
    expect(auth.login).toHaveBeenCalledTimes(1);
    expect(askedFor()).toBe('/admin');
  });

  it('visiting (the IAM does not require sign-in here): every page of a learner’s, with no trip to the IAM', async () => {
    state.set('visiting');
    expect(await go('/kanji/reviews?x=1')).toBe(true);
    expect(await go('/')).toBe(true);
    expect(auth.login).not.toHaveBeenCalled();
  });

  it('visiting: the admin panel is a signed-in person’s — to the IAM first, nothing drawn, and back to it', async () => {
    state.set('visiting');
    expect(await go('/admin')).toBe(false);
    expect(auth.login).toHaveBeenCalledWith('sk', '/admin');
    expect(TestBed.inject(Router).url, 'nothing navigated').toBe('/');
  });

  it('visiting, with a sign-in that came back without one or could not start: the admin panel goes home, where it is said — no trip round', async () => {
    state.set('visiting');
    failure.set({ code: 'access_denied' });
    await go('/admin');
    expect(TestBed.inject(Router).url).toBe('/');
    expect(auth.login).not.toHaveBeenCalled();

    failure.set(null);
    auth.login.mockImplementation(async () => {
      failure.set({ code: 'storage_unavailable' });
      return false;
    });
    await go('/admin');
    expect(TestBed.inject(Router).url).toBe('/');
    expect(auth.login).toHaveBeenCalledTimes(1);
    expect(askedFor(), 'nothing kept for a card a visitor never sees').toBeNull();
  });

  it('while the site is being updated (or not ready at all): nobody is sent to the IAM — the page is let through, and the address kept for the library page’s quiet Sign in', async () => {
    blocked.set(true);
    state.set('signed-out');
    expect(await go('/kanji/reviews?x=1#top')).toBe(true);
    expect(askedFor(), 'its Sign in comes back here').toBe('/kanji/reviews?x=1#top');
    expect(await go('/admin')).toBe(true);
    expect(askedFor(), 'an administrator who signs in from it comes back to the panel: the Migrations page').toBe('/admin');
    state.set('visiting');
    expect(await go('/')).toBe(true);
    expect(await go('/admin'), 'a visitor too, to the panel: the gate’s page has the Sign in').toBe(true);
    expect(auth.login, 'nobody was sent to the IAM: the gate’s page stands in front of every page').not.toHaveBeenCalled();
    // Signed in, as ever; and while the app cannot run, nothing.
    state.set('ready');
    expect(await go('/kanji/reviews')).toBe(true);
    for (const s of ['starting', 'not-set-up', 'problem'] as const) {
      state.set(s);
      expect(await go('/kanji/practice'), s).toBe(false);
    }
    expect(auth.login).not.toHaveBeenCalled();
  });

  it('sends nobody anywhere while the app cannot run — the boot pages are drawn then', async () => {
    for (const s of ['starting', 'not-set-up', 'problem'] as const) {
      state.set(s);
      expect(await go('/kanji/reviews'), s).toBe(false);
    }
    expect(auth.login).not.toHaveBeenCalled();
  });
});
