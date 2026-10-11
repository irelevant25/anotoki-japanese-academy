import { provideZonelessChangeDetection } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { Route, Router, provideRouter } from '@angular/router';
import {
  adminGuard,
  ANOTOKI_AUTH_CLIENT_FACTORY,
  AnotokiAuthEnvironment,
  AnotokiAuthOptions,
  AnotokiInitResult,
  AuthCallbackComponent,
  personOrVisitorGuard,
  SignInFailureComponent,
  staffGuard,
} from '@anotoki/lib/auth';
import { FakeAuthClient, provideTestAnotokiAuth, testAnotokiAuth, TestUser } from '@anotoki/lib/auth/testing';
import { SiteStatus } from '@anotoki/lib/migrations';
import { anotokiUnsavedChangesGuard } from '@anotoki/lib/translations';
import { provideTestTranslations } from '@anotoki/lib/translations/testing';
import { AuditComponent } from './admin/audit/audit.component';
import { BackupsComponent } from './admin/backups/backups.component';
import { ErrorsComponent } from './admin/errors/errors.component';
import { FeedbackComponent } from './admin/feedback/feedback.component';
import { LanguagesComponent } from './admin/languages/languages.component';
import { MigrationsComponent } from './admin/migrations/migrations.component';
import { PeopleComponent } from './admin/people/people.component';
import { TranslationsComponent } from './admin/translations/translations.component';
import { routes, whenReady } from './app.routes';
import { authConfig } from './core/auth/auth.config';
import { AuthService } from './core/auth/auth.service';
import { provideTestSiteStatus } from './core/testing/site-status';
import { HomeComponent } from './home/home.component';

const find = (list: Route[] | undefined, path: string): Route | undefined => list?.find((route) => route.path === path);

/** The admin panel's pages after Translations, each for ADMIN alone, each the library's page in the panel's frame. */
const ADMIN_PAGES: [string, unknown][] = [
  ['languages', LanguagesComponent],
  ['people', PeopleComponent],
  ['feedback', FeedbackComponent],
  ['errors', ErrorsComponent],
  ['audit', AuditComponent],
  ['backups', BackupsComponent],
  ['migrations', MigrationsComponent],
];

/** What a callback that came back without a sign-in leaves for the library: where it started, and the IAM's code. */
function refused(returnTo: string, code: string): AnotokiInitResult {
  return { returnTo, error: Object.assign(new Error('refused'), { code }), silent: false };
}

describe('the routes: who may open what', () => {
  const learner = find(routes, '');
  const admin = find(routes, 'admin');

  it('every page a learner opens asks the library’s personOrVisitorGuard again; the callback and the failure’s screen do not', () => {
    expect(learner?.canActivateChild).toEqual([personOrVisitorGuard]);
    expect(find(learner?.children, '')?.component).toBe(HomeComponent);
    expect(find(learner?.children, 'kanji')?.canActivate).toEqual([whenReady]);
    expect(find(learner?.children, 'exam')?.canActivate).toEqual([whenReady]);
    const callback = find(routes, 'auth/callback');
    expect(callback?.component).toBe(AuthCallbackComponent);
    expect([callback?.canActivate ?? [], callback?.canActivateChild ?? []]).toEqual([[], []]);
    const failed = find(routes, 'sign-in-failed');
    expect(failed?.component).toBe(SignInFailureComponent);
    expect([failed?.canActivate ?? [], failed?.canActivateChild ?? []]).toEqual([[], []]);
    expect(failed?.title, 'the library’s heading, the owner’s words for it in the database').toBe('anotoki.signIn.failedTitle');
  });

  it('the admin area: signed in, EDITOR or ADMIN (the library’s staffGuard), the app ready; every page but Translations for ADMIN alone (its adminGuard)', async () => {
    expect(admin?.canActivate).toEqual([staffGuard, whenReady]);
    expect(find(admin?.children, 'translations')?.canActivate ?? []).toEqual([]);
    for (const [path, component] of ADMIN_PAGES) {
      expect(find(admin?.children, path)?.canActivate, path).toEqual([adminGuard]);
      // Each the library's page in the admin panel's frame, loaded with its route.
      expect(await find(admin?.children, path)?.loadComponent?.(), path).toBe(component);
    }
    expect(await find(admin?.children, 'translations')?.loadComponent?.()).toBe(TranslationsComponent);
  });

  it('leaving Translations or Languages with something not saved asks the page first (the anotoki library’s guard); nothing else asks', () => {
    expect(find(admin?.children, 'translations')?.canDeactivate).toEqual([anotokiUnsavedChangesGuard]);
    expect(find(admin?.children, 'languages')?.canDeactivate).toEqual([anotokiUnsavedChangesGuard]);
    for (const [path] of ADMIN_PAGES.filter(([path]) => path !== 'languages')) {
      expect(find(admin?.children, path)?.canDeactivate ?? [], path).toEqual([]);
    }
  });
});

describe('the routes, navigated (the anotoki library’s guards, a stand-in IAM client)', () => {
  let client: FakeAuthClient | null = null;

  /** The app started as the boot starts it: who is signed in (with these roles), whether the IAM requires it, a callback's outcome. */
  async function start(user: TestUser | null, roles: string[] = ['MEMBER'], loginRequired = true, callback?: AnotokiInitResult): Promise<void> {
    const person = user ? { ...user, roles } : null;
    TestBed.configureTestingModule({
      providers: [
        provideZonelessChangeDetection(),
        provideRouter(routes),
        provideTestTranslations(),
        ...provideTestSiteStatus(),
        // The library's module with this app's failure route (core/auth/auth.config.ts), and a stand-in client.
        ...provideTestAnotokiAuth({ user: person, loginRequired, config: { failureRoute: authConfig().failureRoute } }, testAnotokiAuth()),
        {
          provide: ANOTOKI_AUTH_CLIENT_FACTORY,
          useValue: (options: AnotokiAuthOptions, environment: AnotokiAuthEnvironment) => {
            client = new FakeAuthClient(options, environment, person);
            if (callback) {
              client.initResult = callback;
            }
            return client;
          },
        },
      ],
    });
    // The site ready (the anotoki library's SiteStatus): the guards as they are every day.
    TestBed.inject(SiteStatus).markReady();
    await TestBed.inject(AuthService).init();
  }

  const go = async (url: string): Promise<string> => {
    const router = TestBed.inject(Router);
    await router.navigateByUrl(url);
    return router.url;
  };

  afterEach(() => (client = null));

  it('the old addresses of the admin pages lead to their new ones', async () => {
    await start({ sub: '7' }, ['MEMBER', 'ADMIN']);
    expect(await go('/translations')).toBe('/admin/translations');
    expect(await go('/languages')).toBe('/admin/languages');
    expect(await go('/admin')).toBe('/admin/translations');
  });

  it('ADMIN opens every admin page', async () => {
    await start({ sub: '7' }, ['MEMBER', 'ADMIN']);
    for (const [path] of ADMIN_PAGES) {
      expect(await go(`/admin/${path}`)).toBe(`/admin/${path}`);
    }
    expect(await go('/admin/translations')).toBe('/admin/translations');
  });

  it('EDITOR opens Translations; every other admin page by its address goes home (the server says 403 admin_only)', async () => {
    await start({ sub: '8' }, ['MEMBER', 'EDITOR']);
    expect(await go('/admin/translations')).toBe('/admin/translations');
    for (const [path] of ADMIN_PAGES) {
      expect(await go(`/admin/${path}`), path).toBe('/');
    }
  });

  it('a learner (MEMBER alone) is sent home from the admin area', async () => {
    await start({ sub: '9' });
    expect(await go('/admin')).toBe('/');
    expect(await go('/admin/feedback')).toBe('/');
  });

  it('signed out, a deep link goes to the IAM and back to that very address: nothing navigates meanwhile', async () => {
    await start(null);
    expect(TestBed.inject(AuthService).state()).toBe('signed-out');
    expect(await go('/kanji/reviews?x=1')).toBe('/');
    expect(client?.logins.at(-1)?.returnTo).toBe('/kanji/reviews?x=1');
    await go('/admin/backups');
    expect(client?.logins.at(-1)?.returnTo).toBe('/admin/backups');
  });

  it('a sign-in that came back without one: the failure’s screen, never round to the IAM again', async () => {
    await start(null, ['MEMBER'], true, refused('/exam', 'access_denied'));
    expect(TestBed.inject(AuthService).signInError()).toEqual({ code: 'access_denied' });
    expect(await go('/exam')).toBe('/sign-in-failed');
    expect(client?.logins).toEqual([]);
  });

  it('visiting (sign-in not required here): a learner’s pages open as they are, with no trip to the IAM', async () => {
    await start(null, ['MEMBER'], false);
    expect(TestBed.inject(AuthService).state()).toBe('visiting');
    expect(await go('/exam')).toBe('/exam');
    expect(await go('/')).toBe('/');
    expect(client?.logins).toEqual([]);
  });

  it('visiting: the admin panel — the Migrations page too — is a signed-in person’s: to the IAM and back, nothing navigates meanwhile', async () => {
    await start(null, ['MEMBER'], false);
    expect(await go('/admin/migrations')).toBe('/');
    expect(client?.logins.at(-1)?.returnTo).toBe('/admin/migrations');
  });

  it('visiting after a sign-in that came back without one: the admin panel goes to the failure’s screen — never round to the IAM again', async () => {
    await start(null, ['MEMBER'], false, refused('/', 'access_denied'));
    expect(await go('/admin/people')).toBe('/sign-in-failed');
    expect(client?.logins).toEqual([]);
  });
});
