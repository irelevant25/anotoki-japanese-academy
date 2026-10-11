import { HttpRequest } from '@angular/common/http';
import { EnvironmentProviders, inject } from '@angular/core';
import { AnotokiAuthConfig, provideAnotokiAuth } from '@anotoki/lib/auth';
import { TranslationService } from '@anotoki/lib/translations';
import { AUTH_CALLBACK_PATH, AuthService, SIGN_IN_FAILED_PATH, timeZoneHeaders } from './auth.service';
import { SignInService } from './sign-in.service';
import { SignOutService } from './sign-out.service';
import { VisitorKey } from './visitor-key';

/**
 * The saves that make a visitor when nobody sends them (backend: study_route()
 * with mayMake): a lesson, a review, practice, an item's notes and synonyms,
 * the settings, an exam handed in. One goes alone, the others waiting for the
 * key it brings (one visitor per browser).
 */
export function makesVisitor(request: HttpRequest<unknown>): boolean {
  if (request.method !== 'POST') {
    return false;
  }
  const path = new URL(request.url, location.href).pathname;
  return /^\/api\/kanji\/(learn|review|practice|item|settings)$/.test(path) || path === '/api/submit';
}

/**
 * The anotoki library's auth module (@anotoki/lib/auth, every anotoki site's)
 * wired to this app (docs/kb/sign-in.md):
 *
 *   config        this app's own read of GET /api/auth/config
 *                 (AuthService.bootConfig()), so a copy not set up, or a server
 *                 that does not answer, is said as this app says it
 *   api           the app's addresses with somebody's data: /api/… and
 *                 /report/… of this site - not where the site stands, the
 *                 sign-in's settings or the public words (the library's skip)
 *   headers       the reader's time zone on every one of them (X-Time-Zone)
 *   visitors      the visitor key (core/auth/visitor-key.ts), sent on a
 *                 visitor's requests while the IAM does not require sign-in;
 *                 a first save that makes a visitor goes alone (makesVisitor)
 *   language      the IAM's pages open in the language read here - when one
 *                 was settled: an `en` nobody chose would override the IAM's
 *                 own choice; the failure's screen speaks it too
 *   translate     the owner's rewording of the library's words of signing in
 *                 (anotoki.signIn.*, this app's database: migration 010 moved
 *                 the app's own reworded ones there)
 *   beforeSignIn  from a visitor's page: the saves on their way, and a
 *                 question when something would be lost (SignInService)
 *   beforeSignOut the same, always (SignOutService)
 *   hint          off: no automatic sign-in by the IAM's hint cookie here (the
 *                 owner's decision of 2026-10-11: genshin and the build
 *                 analyzer only), and so nothing that follows it either
 *   failureRoute  /sign-in-failed: a sign-in that came back without one is said
 *                 on the library's screen in this app's frame (app.routes.ts,
 *                 app.component.html)
 *
 * The services are asked for when the module asks, never here: AuthService
 * reads the library's service, which reads this configuration - injected now,
 * they would close a circle (NG0200).
 */
export function authConfig(): AnotokiAuthConfig {
  return {
    config: () => inject(AuthService).bootConfig(),
    api: { prefixes: ['/api/', '/report/'] },
    headers: timeZoneHeaders,
    visitors: () => inject(VisitorKey),
    makesVisitor,
    language: () => {
      const i18n = inject(TranslationService);
      return i18n.ready() ? i18n.language() : null;
    },
    translate: (key) => inject(TranslationService).libraryWord(key),
    beforeSignIn: () => inject(SignInService).beforeSignIn(),
    beforeSignOut: () => inject(SignOutService).beforeSignOut(),
    hint: false,
    redirectPath: AUTH_CALLBACK_PATH,
    failureRoute: SIGN_IN_FAILED_PATH,
  };
}

/** The module, configured for this app (app.config.ts; the specs that sign in). */
export function provideAuth(): EnvironmentProviders {
  return provideAnotokiAuth(authConfig);
}
