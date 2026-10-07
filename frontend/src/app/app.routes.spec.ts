import { provideZonelessChangeDetection, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { Route, Router, provideRouter } from '@angular/router';
import { SiteStatus } from '@anotoki/lib/migrations';
import { adminOnly, routes, staffOnly, whenReady } from './app.routes';
import { AppState, AuthService, SignInFailure } from './core/auth/auth.service';
import { adminSignInGuard, signInGuard } from './core/auth/sign-in.guard';
import { provideTestTranslations } from './core/testing/test-translations';
import { HomeComponent } from './home/home.component';
import { derivedFromState } from './core/testing/auth-states';

const find = (list: Route[] | undefined, path: string): Route | undefined => list?.find((route) => route.path === path);

describe('the routes: who may open what', () => {
  const learner = find(routes, '');
  const admin = find(routes, 'admin');

  it('every page a learner opens asks signInGuard again; the callback alone does not', () => {
    expect(learner?.canActivateChild).toEqual([signInGuard]);
    expect(find(learner?.children, '')?.component).toBe(HomeComponent);
    expect(find(learner?.children, 'kanji')?.canActivate).toEqual([whenReady]);
    expect(find(learner?.children, 'exam')?.canActivate).toEqual([whenReady]);
    const callback = find(routes, 'auth/callback');
    expect(callback?.canActivate ?? []).toEqual([]);
    expect(callback?.canActivateChild ?? []).toEqual([]);
  });

  it('the admin area: signed in (a visitor too goes to the IAM), the app ready, and EDITOR or ADMIN; Languages and People for ADMIN alone', () => {
    expect(admin?.canActivate).toEqual([adminSignInGuard, whenReady, staffOnly]);
    expect(find(admin?.children, 'translations')?.canActivate ?? []).toEqual([]);
    expect(find(admin?.children, 'languages')?.canActivate).toEqual([adminOnly]);
    expect(find(admin?.children, 'people')?.canActivate).toEqual([adminOnly]);
    expect(find(admin?.children, 'migrations')?.canActivate).toEqual([adminOnly]);
  });
});

describe('the routes, navigated', () => {
  const state = signal<AppState>('ready');
  const failure = signal<SignInFailure | null>(null);
  const roles = signal<string[]>([]);
  const auth = {
    state,
    ...derivedFromState(state),
    signInError: failure,
    isStaff: () => roles().includes('EDITOR') || roles().includes('ADMIN'),
    isAdmin: () => roles().includes('ADMIN'),
    login: vi.fn(async (_uiLocales?: string, _returnTo?: string) => true),
  };

  beforeEach(() => {
    state.set('ready');
    failure.set(null);
    roles.set([]);
    auth.login.mockReset().mockResolvedValue(true);
    TestBed.configureTestingModule({
      providers: [
        provideZonelessChangeDetection(),
        provideRouter(routes),
        provideTestTranslations(),
        { provide: AuthService, useValue: auth },
        // the site ready (the anotoki library's SiteStatus): the guards as they are every day
        { provide: SiteStatus, useValue: { blocked: () => false } },
      ],
    });
  });

  const go = async (url: string): Promise<string> => {
    const router = TestBed.inject(Router);
    await router.navigateByUrl(url);
    return router.url;
  };

  it('the old addresses of the admin pages lead to their new ones', async () => {
    roles.set(['ADMIN']);
    expect(await go('/translations')).toBe('/admin/translations');
    expect(await go('/languages')).toBe('/admin/languages');
    expect(await go('/admin')).toBe('/admin/translations');
  });

  it('ADMIN opens all four admin pages', async () => {
    roles.set(['ADMIN']);
    expect(await go('/admin/migrations')).toBe('/admin/migrations');
    expect(await go('/admin/people')).toBe('/admin/people');
    expect(await go('/admin/languages')).toBe('/admin/languages');
    expect(await go('/admin/translations')).toBe('/admin/translations');
  });

  it('EDITOR opens Translations; Languages, People and Migrations by their address go home (the server says 403 admin_only)', async () => {
    roles.set(['EDITOR']);
    expect(await go('/admin/translations')).toBe('/admin/translations');
    expect(await go('/admin/languages')).toBe('/');
    expect(await go('/admin/people')).toBe('/');
    expect(await go('/admin/migrations')).toBe('/');
  });

  it('a learner (no role) is sent home from the admin area', async () => {
    expect(await go('/admin')).toBe('/');
    expect(await go('/admin/translations')).toBe('/');
  });

  it('signed out, a deep link goes to the IAM and back to that very address: nothing navigates meanwhile', async () => {
    state.set('signed-out');
    expect(await go('/kanji/reviews?x=1')).toBe('/');
    expect(auth.login).toHaveBeenCalledWith('en', '/kanji/reviews?x=1');
    await go('/admin/people');
    expect(auth.login).toHaveBeenLastCalledWith('en', '/admin/people');
  });

  it('visiting (sign-in not required here): a learner’s pages open as they are, with no trip to the IAM', async () => {
    state.set('visiting');
    expect(await go('/exam')).toBe('/exam');
    expect(await go('/')).toBe('/');
    expect(auth.login).not.toHaveBeenCalled();
  });

  it('visiting: the admin panel — the Migrations page too — is a signed-in person’s: to the IAM and back, nothing navigates meanwhile', async () => {
    state.set('visiting');
    expect(await go('/admin/migrations')).toBe('/');
    expect(auth.login).toHaveBeenCalledWith('en', '/admin/migrations');
    await go('/admin');
    expect(auth.login).toHaveBeenLastCalledWith('en', '/admin');
  });

  it('visiting after a sign-in that came back without one: the admin panel goes home, where the failure is said — never round to the IAM again', async () => {
    state.set('visiting');
    failure.set({ code: 'access_denied' });
    expect(await go('/admin/people')).toBe('/');
    expect(auth.login).not.toHaveBeenCalled();
  });
});
