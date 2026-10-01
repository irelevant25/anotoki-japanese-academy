import { inject } from '@angular/core';
import { CanActivateFn, Router, Routes } from '@angular/router';
import { AuthCallbackComponent } from './core/auth/auth-callback/auth-callback.component';
import { AuthService } from './core/auth/auth.service';
import { HomeComponent } from './home/home.component';
import { unsavedChangesGuard } from './owner/unsaved-changes.guard';

/**
 * A section's screens only while the app can be used. Once the router has
 * started, Back or Forward still navigates while the page shows the Sign in or
 * the "not set up yet" page, and the kanji screens would ask the API for data
 * on the way (their resolver), which nobody signed out, or a copy not set up,
 * can have.
 */
export const whenReady: CanActivateFn = () => inject(AuthService).state() === 'ready';

/**
 * The owner's pages, for the owner only (AuthService.isOwner): anybody else
 * goes to the home page. It only hides them; the server refuses the calls.
 */
export const ownerOnly: CanActivateFn = () => inject(AuthService).isOwner() || inject(Router).createUrlTree(['/']);

/**
 *   /                 the Academy's home
 *   /kanji            the kanji trainer: /kanji/lessons, /reviews, /practice, /browse?lesson=6, /item/:id
 *   /exam             the exam
 *   /translations     the owner's: the app's words in every language (English)
 *   /languages        the owner's: the languages readers are offered (English)
 *   /auth/callback    where the IAM sends the browser back after a sign-in
 *
 * A title is a translation key, or a word that is the same in every language
 * ("Kanji"); the title strategy words it and puts the app's name after it
 * (core/i18n/title.strategy.ts). The home page has none: the name alone. The
 * owner's pages are English, and so are their titles; leaving one with
 * unsaved changes asks first (unsavedChangesGuard).
 */
export const routes: Routes = [
  { path: '', component: HomeComponent },
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
  {
    path: 'translations',
    title: 'Translations',
    canActivate: [whenReady, ownerOnly],
    canDeactivate: [unsavedChangesGuard],
    loadComponent: () => import('./owner/translations/translations.component').then((m) => m.TranslationsComponent),
  },
  {
    path: 'languages',
    title: 'Languages',
    canActivate: [whenReady, ownerOnly],
    canDeactivate: [unsavedChangesGuard],
    loadComponent: () => import('./owner/languages/languages.component').then((m) => m.LanguagesComponent),
  },
  { path: 'auth/callback', component: AuthCallbackComponent, title: 'title.signingIn' },
  { path: '**', redirectTo: '' },
];
