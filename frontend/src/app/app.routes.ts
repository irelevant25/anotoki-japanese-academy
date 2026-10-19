import { inject } from '@angular/core';
import { CanActivateFn, Routes } from '@angular/router';
import { adminGuard, AuthCallbackComponent, personOrVisitorGuard, SignInFailureComponent, staffGuard } from '@anotoki/lib/auth';
import { anotokiUnsavedChangesGuard } from '@anotoki/lib/translations';
import { AuthService } from './core/auth/auth.service';
import { HomeComponent } from './home/home.component';

/**
 * A section's screens only while the app can be used: somebody signed in, or
 * a visitor (where the IAM does not require sign-in). Once the router has
 * started, Back or Forward still navigates while the page shows the Sign in
 * card, the failure's screen or the anotoki library's page (a site not set up,
 * or being updated, where the library's guards let a page through): the kanji
 * screens would ask the API for data on the way (their resolver), which nobody
 * signed out, or a copy not set up, can have.
 */
export const whenReady: CanActivateFn = () => inject(AuthService).usable();

/** The legal pages' frame, loaded with the first of them that is opened (and the app's facts with it, out of the first load). */
const legalFrame = () => import('./legal/legal-frame.component').then((m) => m.LegalFrameComponent);

/**
 *   /                       the Academy's home (and Your data, at its foot)
 *   /kanji                  the kanji trainer: /kanji/lessons, /reviews, /practice, /browse?lesson=6, /item/:id
 *   /exam                   the exam
 *   /admin/translations     EDITOR, ADMIN: the app's words in every language (English): the anotoki library's page
 *   /admin/languages        ADMIN: the languages readers are offered (English): the anotoki library's page
 *   /admin/people           ADMIN: everybody the site has, and deleting a person's data (English): the library's page
 *   /admin/feedback         ADMIN: the messages of the footer's Feedback (English): the library's page
 *   /admin/errors           ADMIN: what went wrong on the server (English): the library's page
 *   /admin/audit            ADMIN: who did what in the admin panel (English): the library's page
 *   /admin/backups          ADMIN: the whole database's backups (English): the library's page
 *   /admin/migrations       ADMIN: the database's migrations, applied and pending, and Apply (English): the
 *                           anotoki library's page, the one page that works while an update waits
 *   /auth/callback          where the IAM sends the browser back after a sign-in (the library's page)
 *   /sign-in-failed         where a sign-in that came back without one is said (the library's screen,
 *                           which AppComponent draws in its place while the failure stands)
 *   /terms, /privacy,       the legal pages: the anotoki family's (@anotoki/lib/legal/pages) with Japanese
 *   /contact                Academy's facts, which their frame gives them (legal/) - anybody's
 *   /about, /support        the anotoki family's About and Support (@anotoki/lib/legal/about, /support:
 *                           anotoki-lib 0.8.0, the same on every anotoki site) - anybody's, in the same frame
 *
 * The legal pages are anybody's: no guard, nothing of a person's study on
 * them, and AppComponent draws them whatever the sign-in says. Each is a path
 * of its own with the frame as its parent - never one parent with an empty
 * path holding the three: the router takes an address it has read whole ("/")
 * for such a parent when none of its children match, and would draw the
 * empty frame at "/" with no guard (the survey's lesson, 2026-10-17;
 * app.routes.spec.ts). They come before the learner's pages, whose "**" would
 * take them. Their paths are the library's (DEFAULT_LEGAL_PATHS, the footer's
 * links go there), their titles the library's own headings. About and Support
 * are routes the same way, in the same frame.
 *
 * Every page but those is for somebody signed in: the anotoki library's
 * guards send anybody else to the IAM, and back to the address they asked for
 * — personOrVisitorGuard on each of a learner's pages (`canActivateChild`),
 * where the IAM does not require sign-in a visitor's too; staffGuard as the
 * admin panel is entered (EDITOR or ADMIN; anybody else signed in goes to the
 * home page), adminGuard on its pages for ADMIN alone. The admin panel is
 * never a visitor's. After a sign-in that came back without one, the guards
 * send the browser to the failure's screen instead: sent straight back to the
 * IAM, it would go round for ever. The old addresses of the admin pages
 * (/translations, /languages) lead to their new ones.
 *
 * A title is a translation key, or a word that is the same in every language
 * ("Kanji"); the title strategy words it and puts the app's name after it
 * (core/i18n/title.strategy.ts). The home page has none: the name alone. The
 * admin pages are English, and so are their titles ("Admin panel" put between
 * a page's and the app's name); leaving Translations or Languages with unsaved
 * changes asks first (the library's anotokiUnsavedChangesGuard). The admin
 * pages are the library's, each from its own entry point and in the admin
 * panel's frame (admin/*): never in the first load.
 */
export const routes: Routes = [
  { path: 'auth/callback', component: AuthCallbackComponent, title: 'title.signingIn' },
  { path: 'sign-in-failed', component: SignInFailureComponent, title: 'anotoki.signIn.failedTitle' },
  {
    path: 'admin',
    canActivate: [staffGuard, whenReady],
    children: [
      { path: '', pathMatch: 'full', redirectTo: 'translations' },
      {
        path: 'translations',
        title: 'Translations',
        canDeactivate: [anotokiUnsavedChangesGuard],
        loadComponent: () => import('./admin/translations/translations.component').then((m) => m.TranslationsComponent),
      },
      {
        path: 'languages',
        title: 'Languages',
        canActivate: [adminGuard],
        canDeactivate: [anotokiUnsavedChangesGuard],
        loadComponent: () => import('./admin/languages/languages.component').then((m) => m.LanguagesComponent),
      },
      {
        path: 'people',
        title: 'People',
        canActivate: [adminGuard],
        loadComponent: () => import('./admin/people/people.component').then((m) => m.PeopleComponent),
      },
      {
        path: 'feedback',
        title: 'Feedback',
        canActivate: [adminGuard],
        loadComponent: () => import('./admin/feedback/feedback.component').then((m) => m.FeedbackComponent),
      },
      {
        path: 'errors',
        title: 'Errors',
        canActivate: [adminGuard],
        loadComponent: () => import('./admin/errors/errors.component').then((m) => m.ErrorsComponent),
      },
      {
        path: 'audit',
        title: 'Audit log',
        canActivate: [adminGuard],
        loadComponent: () => import('./admin/audit/audit.component').then((m) => m.AuditComponent),
      },
      {
        path: 'backups',
        title: 'Backups',
        canActivate: [adminGuard],
        loadComponent: () => import('./admin/backups/backups.component').then((m) => m.BackupsComponent),
      },
      {
        path: 'migrations',
        title: 'Migrations',
        canActivate: [adminGuard],
        loadComponent: () => import('./admin/migrations/migrations.component').then((m) => m.MigrationsComponent),
      },
      { path: '**', redirectTo: 'translations' },
    ],
  },
  // Where the admin pages were before they had an area of their own.
  { path: 'translations', pathMatch: 'full', redirectTo: '/admin/translations' },
  { path: 'languages', pathMatch: 'full', redirectTo: '/admin/languages' },
  // The legal pages: anybody's, each a path of its own in the frame that gives them the app's facts (see above).
  {
    path: 'terms',
    loadComponent: legalFrame,
    children: [{ path: '', title: 'anotoki.legal.termsTitle', loadComponent: () => import('@anotoki/lib/legal/pages').then((m) => m.TermsPageComponent) }],
  },
  {
    path: 'privacy',
    loadComponent: legalFrame,
    children: [{ path: '', title: 'anotoki.legal.privacyTitle', loadComponent: () => import('@anotoki/lib/legal/pages').then((m) => m.PrivacyPageComponent) }],
  },
  {
    path: 'contact',
    loadComponent: legalFrame,
    children: [{ path: '', title: 'anotoki.legal.contactTitle', loadComponent: () => import('@anotoki/lib/legal/pages').then((m) => m.ContactPageComponent) }],
  },
  // About and Support, the family's: anybody's, in the legal pages' frame, the same way.
  {
    path: 'about',
    loadComponent: legalFrame,
    children: [{ path: '', title: 'anotoki.about.title', loadComponent: () => import('@anotoki/lib/legal/about').then((m) => m.AboutPageComponent) }],
  },
  {
    path: 'support',
    loadComponent: legalFrame,
    children: [{ path: '', title: 'anotoki.support.title', loadComponent: () => import('@anotoki/lib/legal/support').then((m) => m.SupportPageComponent) }],
  },
  {
    path: '',
    canActivateChild: [personOrVisitorGuard],
    children: [
      { path: '', pathMatch: 'full', component: HomeComponent },
      {
        path: 'kanji',
        title: 'Kanji',
        canActivate: [whenReady],
        loadChildren: () => import('./kanji/kanji.routes').then((m) => m.KANJI_ROUTES),
      },
      {
        path: 'exam',
        title: 'title.exam',
        canActivate: [whenReady],
        loadComponent: () => import('./exam/exam.component').then((m) => m.ExamComponent),
      },
      { path: '**', redirectTo: '' },
    ],
  },
];
