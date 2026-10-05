import { provideHttpClient, withInterceptors } from '@angular/common/http';
import { ApplicationConfig, provideAppInitializer, provideBrowserGlobalErrorListeners, provideZonelessChangeDetection } from '@angular/core';
import { provideRouter, TitleStrategy, withDisabledInitialNavigation, withInMemoryScrolling } from '@angular/router';
import { routes } from './app.routes';
import { notSetUpInterceptor } from './core/api/not-set-up.interceptor';
import { authInterceptor } from './core/auth/auth.interceptor';
import { boot } from './core/boot';
import { AcademyTitleStrategy } from './core/i18n/title.strategy';

export const appConfig: ApplicationConfig = {
  providers: [
    provideBrowserGlobalErrorListeners(),
    provideZonelessChangeDetection(),
    // Before anything else (boot()): how this copy signs people in, and a
    // sign-in coming back from the IAM finished, with the address it started
    // from put back in the address bar; then the language and its strings.
    provideAppInitializer(boot),
    // The first navigation waits until the start has settled the sign-in
    // (AppComponent starts it): then every page's guard sends anybody not
    // signed in to the IAM, and a screen's data is asked for only once
    // somebody is (never while the copy is not set up). A link to a part of a
    // page (the dashboard's to Your data) scrolls to it.
    provideRouter(routes, withDisabledInitialNavigation(), withInMemoryScrolling({ anchorScrolling: 'enabled' })),
    // A page's title in the language on the page, before the app's name.
    { provide: TitleStrategy, useClass: AcademyTitleStrategy },
    // The token on the way out; on the way back, an answer that the copy is
    // not set up after all (its database missing) puts up the page that says so.
    provideHttpClient(withInterceptors([notSetUpInterceptor, authInterceptor])),
  ],
};
