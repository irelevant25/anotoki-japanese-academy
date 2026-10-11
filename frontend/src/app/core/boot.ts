import { inject, Injector } from '@angular/core';
import { SiteStatus } from '@anotoki/lib/migrations';
import { TranslationService } from '@anotoki/lib/translations';
import { AuthService } from './auth/auth.service';
import { VisitorKey } from './auth/visitor-key';

/**
 * The whole start of the app, before anything is drawn (the one app
 * initializer): first where the site stands (the anotoki library's
 * SiteStatus, GET /api/site-status: core/site-status.config.ts); then how this
 * copy signs people in — which, coming back from the IAM, finishes the
 * sign-in and puts the address the person started from back in the address
 * bar —; then, signed in with a visitor key held (what this browser studied
 * without signing in), the move of it into the account, waited for a few
 * seconds at most (VisitorKey.settle()), so the first page already shows it;
 * then the language and its strings, which need to know what the app can show
 * and who is signed in.
 *
 * A site that is being updated starts like any other: the sign-in's settings
 * and the words answer then, the router starts, and the library's gate stands
 * in front of the pages - so whoever is signed out can sign in from its page,
 * and an administrator reaches the Migrations page. A site that is not set up,
 * or whose database does not answer, starts nothing of its own: its sign-in
 * could not be had, and the gate's page says so (and asks again by itself).
 *
 * None of them ever rejects: an app that cannot start still has to say why,
 * and the pages that say it word themselves when there are no strings
 * (standin/kept-word.ts; the library's page has its own words).
 *
 * Everything is injected before the first `await`: inject() does not work
 * after one. VisitorKey is made only for somebody signed in (it asks the API),
 * through the injector taken here.
 */
export async function boot(): Promise<void> {
  const site = inject(SiteStatus);
  const auth = inject(AuthService);
  const i18n = inject(TranslationService);
  const injector = inject(Injector);

  const state = await site.check();
  if (state === 'not-set-up') {
    auth.notSetUp(site.installed());
  } else if (state !== 'unavailable') {
    await auth.init();
    if (auth.signedIn()) {
      await injector.get(VisitorKey).settle();
    }
  }
  await i18n.init();
}
