import { provideHttpClient, withInterceptors } from '@angular/common/http';
import {
  ApplicationConfig,
  inject,
  provideAppInitializer,
  provideBrowserGlobalErrorListeners,
  provideZonelessChangeDetection,
} from '@angular/core';
import { provideRouter, withDisabledInitialNavigation } from '@angular/router';
import { routes } from './app.routes';
import { notSetUpInterceptor } from './core/api/not-set-up.interceptor';
import { authInterceptor } from './core/auth/auth.interceptor';
import { AuthService } from './core/auth/auth.service';

export const appConfig: ApplicationConfig = {
  providers: [
    provideBrowserGlobalErrorListeners(),
    provideZonelessChangeDetection(),
    // Before anything else: how this copy signs people in, and a sign-in coming
    // back from the IAM finished, with the address it started from put back in
    // the address bar.
    provideAppInitializer(() => inject(AuthService).init()),
    // The first navigation waits until the app can be used (AppComponent starts
    // it): a screen's data is asked for only then — not while the copy is not
    // set up, nor while nobody is signed in.
    provideRouter(routes, withDisabledInitialNavigation()),
    // The token on the way out; on the way back, an answer that the copy is
    // not set up after all (its database missing) puts up the page that says so.
    provideHttpClient(withInterceptors([notSetUpInterceptor, authInterceptor])),
  ],
};
