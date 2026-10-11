import { inject } from '@angular/core';
import { CanActivateFn, Router, Routes } from '@angular/router';
import { anotokiUnsavedChangesGuard } from '@anotoki/lib/translations';
import { AuthCallbackComponent } from './core/auth/auth-callback/auth-callback.component';
import { AuthService } from './core/auth/auth.service';
import { adminSignInGuard, signInGuard } from './core/auth/sign-in.guard';
import { HomeComponent } from './home/home.component';

/**
 * A section's screens only while the app can be used: somebody signed in, or
 * a visitor (where the IAM does not require sign-in). signInGuard lets a page
 * through with nobody signed in after a sign-in that came back without one
 * (the Sign in card is drawn instead), and once the router has started, Back
 * or Forward still navigates while the page shows the card or the anotoki
 * library's page (a site not set up, or being updated): the kanji screens
 * would ask the API for data on the way (their resolver), which nobody signed
 * out, or a copy not set up, can have.
 */
export const whenReady: CanActivateFn = () => inject(AuthService).usable();

/**
 * The admin panel, for EDITOR and ADMIN (AuthService.isStaff): anybody else
 * goes to the home page. It only hides it; the server refuses the calls.
 */
export const staffOnly: CanActivateFn = () => inject(AuthService).isStaff() || inject(Router).createUrlTree(['/']);

/** The admin panel's Languages, People and Migrations, for ADMIN alone: an editor goes to the home page (the server answers 403 admin_only). */
export const adminOnly: CanActivateFn = () => inject(AuthService).isAdmin() || inject(Router).createUrlTree(['/']);

/**
 *   /                       the Academy's home (and Your data, at its foot)
 *   /kanji                  the kanji trainer: /kanji/lessons, /reviews, /practice, /browse?lesson=6, /item/:id
 *   /exam                   the exam
 *   /admin/translations     EDITOR, ADMIN: the app's words in every language (English): the anotoki library's page
 *   /admin/languages        ADMIN: the languages readers are offered (English): the anotoki library's page
 *   /admin/people           ADMIN: everybody the site has, and deleting a person's data (English)
 *   /admin/migrations       ADMIN: the database's migrations, applied and pending, and Apply (English): the
 *                           anotoki library's page, the one page that works while an update waits
 *   /auth/callback          where the IAM sends the browser back after a sign-in
 *
 * Every page but the callback is for somebody signed in: signInGuard sends
 * anybody else to the IAM, and back to the address they asked for — on each
 * of a learner's pages (`canActivateChild`), and as the admin panel is entered
 * (adminSignInGuard). Where the IAM does not require sign-in, a learner's
 * pages are a visitor's too; the admin panel never is.
 * The old addresses of the admin pages (/translations, /languages) lead to
 * their new ones.
 *
 * A title is a translation key, or a word that is the same in every language
 * ("Kanji"); the title strategy words it and puts the app's name after it
 * (core/i18n/title.strategy.ts). The home page has none: the name alone. The
 * admin pages are English, and so are their titles ("Admin panel" put between
 * a page's and the app's name); leaving Translations or Languages with unsaved
 * changes asks first (the library's anotokiUnsavedChangesGuard). Those two
 * pages are the library's, from its own entry point
 * (@anotoki/lib/translations/admin), each in the admin panel's frame
 * (admin/translations/, admin/languages/), as the Migrations page is: never in
 * the first load.
 */
export const routes: Routes = [
  { path: 'auth/callback', component: AuthCallbackComponent, title: 'title.signingIn' },
  {
    path: 'admin',
    canActivate: [adminSignInGuard, whenReady, staffOnly],
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
        canActivate: [adminOnly],
        canDeactivate: [anotokiUnsavedChangesGuard],
        loadComponent: () => import('./admin/languages/languages.component').then((m) => m.LanguagesComponent),
      },
      {
        path: 'people',
        title: 'People',
        canActivate: [adminOnly],
        loadComponent: () => import('./admin/people/people.component').then((m) => m.PeopleComponent),
      },
      {
        path: 'migrations',
        title: 'Migrations',
        canActivate: [adminOnly],
        loadComponent: () => import('./admin/migrations/migrations.component').then((m) => m.MigrationsComponent),
      },
      { path: '**', redirectTo: 'translations' },
    ],
  },
  // Where the admin pages were before they had an area of their own.
  { path: 'translations', pathMatch: 'full', redirectTo: '/admin/translations' },
  { path: 'languages', pathMatch: 'full', redirectTo: '/admin/languages' },
  {
    path: '',
    canActivateChild: [signInGuard],
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
