import { provideHttpClient, withInterceptors } from '@angular/common/http';
import { ApplicationConfig, inject, provideAppInitializer, provideBrowserGlobalErrorListeners, provideZonelessChangeDetection } from '@angular/core';
import { provideRouter, TitleStrategy, withDisabledInitialNavigation, withInMemoryScrolling } from '@angular/router';
import { anotokiAuthInterceptor } from '@anotoki/lib/auth';
import { siteStatusInterceptor } from '@anotoki/lib/migrations';
import { ThemeService } from '@anotoki/lib/shell';
import { routes } from './app.routes';
import { provideAdminTools } from './core/admin.config';
import { notSetUpInterceptor } from './core/api/not-set-up.interceptor';
import { provideAuth } from './core/auth/auth.config';
import { boot } from './core/boot';
import { provideErrorReport } from './core/error-report.config';
import { provideFeedback } from './core/feedback.config';
import { AcademyTitleStrategy } from './core/i18n/title.strategy';
import { provideTranslations } from './core/i18n/translations.config';
import { provideKit } from './core/kit.config';
import { provideSiteStatus } from './core/site-status.config';

export const appConfig: ApplicationConfig = {
  providers: [
    // Every error - Angular's own, a window's, a promise nobody caught - to the
    // console and, scrubbed, to this site's error log (core/error-report.config.ts:
    // the anotoki library's reporter, through the HttpClient below, so its
    // interceptors add what every request of the page carries).
    provideBrowserGlobalErrorListeners(),
    provideErrorReport(),
    provideZonelessChangeDetection(),
    // Before anything else (boot()): where the site stands (the anotoki
    // library's SiteStatus), how this copy signs people in, and a sign-in
    // coming back from the IAM finished, with the address it started from put
    // back in the address bar; then the language and its strings.
    provideAppInitializer(boot),
    // The theme - this device's, or the anotoki account's once the start has
    // signed somebody in - before the first frame (the kit's ThemeService,
    // core/kit.config.ts); the kit's theme-boot.js (index.html) painted the
    // stored choice until then.
    provideAppInitializer(() => void inject(ThemeService)),
    // The first navigation waits until the start has settled the sign-in
    // (AppComponent starts it): then every page's guard sends anybody not
    // signed in to the IAM - not while the site is being updated: its gate's
    // page has a Sign in of its own -, and a screen's data is asked for only
    // once somebody is (never while the copy is not set up). A link to a part
    // of a page (the dashboard's to Your data) scrolls to it.
    provideRouter(routes, withDisabledInitialNavigation(), withInMemoryScrolling({ anchorScrolling: 'enabled' })),
    // A page's title in the language on the page, before the app's name.
    { provide: TitleStrategy, useClass: AcademyTitleStrategy },
    // The token (or a visitor's key) and the reader's time zone on the way out
    // - the anotoki library's interceptor (core/auth/auth.config.ts); on the
    // way back, an answer that the site is being updated, or not set up after
    // all, tells SiteStatus, and the gate puts up the library's page
    // (core/site-status.config.ts) - not set up, nothing of the app goes on
    // either.
    provideHttpClient(withInterceptors([siteStatusInterceptor, notSetUpInterceptor, anotokiAuthInterceptor])),
    provideSiteStatus(),
    // Signing in through the anotoki IAM: the anotoki library's auth module,
    // wired to this app (core/auth/auth.config.ts).
    provideAuth(),
    // The app's words and languages: the anotoki library's translations, wired
    // to this app (core/i18n/translations.config.ts) - the admin panel's
    // Translations and Languages pages with them.
    provideTranslations(),
    // The anotoki library's kit, its bar and its theme, in this app's words.
    provideKit(),
    // The admin panel's People, Errors, Audit log, Feedback and Backups pages
    // (the anotoki library's, each loaded with its route; core/admin.config.ts),
    // and the visitors' feedback form behind Send feedback at the foot
    // (core/feedback.config.ts).
    provideAdminTools(),
    provideFeedback(),
  ],
};
