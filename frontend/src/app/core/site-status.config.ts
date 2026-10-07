import { EnvironmentProviders, Injector, inject } from '@angular/core';
import { AnotokiMigrationsConfig, provideAnotokiMigrations } from '@anotoki/lib/migrations';
import { AuthService } from './auth/auth.service';
import { SignInService } from './auth/sign-in.service';
import { fmtAdminMoment } from './format';
import { TranslationService } from './i18n/translation.service';
import { MIGRATIONS_ROUTE, SITE_STATUS_URL } from './site-status';

/**
 * The anotoki library's migrations module (@anotoki/lib/migrations, every
 * anotoki site's), wired to this app: where the site stands (SiteStatus,
 * asked first thing at the start, core/boot.ts, and told by every answer that
 * says so: siteStatusInterceptor, reportSiteState() in core/site-status.ts);
 * the gate in front of the pages (<anotoki-site-gate>, app.component.html),
 * which shows the library's page instead of them while the site is not ready;
 * and the admin panel's Migrations page (admin/migrations/).
 *
 *   update pending   a visitor, a learner, an editor: "The site is being
 *                    updated" in the language on the page, which asks again by
 *                    itself and loads afresh once it is back - and, while
 *                    nobody is signed in, a quiet Sign in (this app's own
 *                    sign-in, SignInService: to the IAM and back to the page);
 *                    the site's ADMIN: "A database update is waiting" and the
 *                    way to the Migrations page, which works then, alone
 *   not set up       "This site is not set up yet" and the way to /setup.php -
 *                    only while the site was never installed (a website's setup
 *                    leaves a lock; this computer's never does)
 *   unavailable      (or set up once, its settings gone) "not available right
 *                    now", asking again by itself
 *
 * Who is the site's ADMIN is the token's roles (AuthService.isAdmin); the
 * Migrations page's dates are in the date order and clock the administrator
 * chose for their anotoki account, else in the admin panel's English
 * (fmtAdminMoment()); after an Apply leaves nothing to apply, the app's words
 * are asked for again (the update may have brought some).
 *
 * The services are asked for when the module asks, never here: AuthService
 * and TranslationService tell SiteStatus what the server said, and SiteStatus
 * needs this config - injected now, they would close a circle (NG0200).
 */
export function siteStatusConfig(): AnotokiMigrationsConfig {
  const injector = inject(Injector);
  const auth = (): AuthService => injector.get(AuthService);
  const i18n = (): TranslationService => injector.get(TranslationService);
  return {
    statusUrl: SITE_STATUS_URL,
    apiBase: '/api/admin/migrations',
    migrationsRoute: MIGRATIONS_ROUTE,
    isAdmin: () => auth().isAdmin(),
    isSignedIn: () => auth().signedIn(),
    signIn: () => injector.get(SignInService).signIn(),
    language: () => i18n().pageLanguage(),
    formatDate: (iso) => fmtAdminMoment(i18n(), Date.parse(iso)),
    onUpToDate: () => i18n().reload(),
  };
}

/** The module, configured for this app (app.config.ts; the specs that draw the gate or its page). */
export function provideSiteStatus(): EnvironmentProviders {
  return provideAnotokiMigrations(siteStatusConfig);
}
