import { inject } from '@angular/core';
import { CanActivateFn, Routes } from '@angular/router';
import { AuthCallbackComponent } from './core/auth/auth-callback/auth-callback.component';
import { AuthService } from './core/auth/auth.service';
import { HomeComponent } from './home/home.component';

/**
 * A section's screens only while the app can be used. Once the router has
 * started, Back or Forward still navigates while the page shows the Sign in or
 * the "not set up yet" page, and the kanji screens would ask the API for data
 * on the way (their resolver), which nobody signed out, or a copy not set up,
 * can have.
 */
export const whenReady: CanActivateFn = () => inject(AuthService).state() === 'ready';

/**
 *   /                 the Academy's home
 *   /kanji            the kanji trainer: /kanji/lessons, /reviews, /practice, /browse?lesson=6, /item/:id
 *   /exam             the exam
 *   /auth/callback    where the IAM sends the browser back after a sign-in
 */
export const routes: Routes = [
  { path: '', component: HomeComponent, title: 'Japanese Academy' },
  {
    path: 'kanji',
    title: 'Kanji · Japanese Academy',
    canActivate: [whenReady],
    loadChildren: () => import('./kanji/kanji.routes').then((m) => m.KANJI_ROUTES),
  },
  {
    path: 'exam',
    title: 'Exam · Japanese Academy',
    canActivate: [whenReady],
    loadComponent: () => import('./exam/exam.component').then((m) => m.ExamComponent),
  },
  { path: 'auth/callback', component: AuthCallbackComponent, title: 'Signing in · Japanese Academy' },
  { path: '**', redirectTo: '' },
];
