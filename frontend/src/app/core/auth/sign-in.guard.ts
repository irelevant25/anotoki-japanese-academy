import { inject } from '@angular/core';
import { CanActivateChildFn, CanActivateFn, Router, UrlTree } from '@angular/router';
import { TranslationService } from '../i18n/translation.service';
import { AuthService } from './auth.service';

/**
 * Every page of the app is for somebody signed in (the survey's signInGuard,
 * the family's rule): anybody else is sent to the IAM before anything of the
 * page is drawn, and comes back to the address they asked for. On every page
 * a learner opens (`canActivateChild` of the routes around them, so each page
 * asks again). Who of the signed-in may use the admin area — EDITOR or ADMIN —
 * staffOnly and adminOnly say, and the API decides.
 *
 * Unless the IAM does not require sign-in here: then nobody signed in is a
 * visitor (AuthService state visiting), and a learner's pages are theirs too.
 * The admin panel is never a visitor's: adminSignInGuard sends a visitor to
 * the IAM all the same.
 *
 * It lets a page through with nobody signed in in one case: this page load
 * came back from the IAM without a sign-in (refused, cancelled), or the
 * sign-in could not even start (the browser refuses the site's storage) —
 * from then on, for every page of the load. Sent straight back, the browser
 * would go round between the two for ever; AppComponent draws the Sign in
 * card instead of the page, worded from the failure's code, and the address
 * asked for is kept (`AuthService.askedFor`): the page's own whenReady refuses
 * it, and the router puts '/' back, but the card's Sign in returns there. (The screens that
 * load data on the way are behind whenReady too, so nothing is asked of the
 * API meanwhile.) While the app cannot run — not set up, could not start, or
 * still starting — it lets nothing through and sends nobody anywhere: the
 * boot pages are drawn then.
 *
 * /auth/callback is not behind it: the SDK has finished the sign-in before the
 * router starts, and that route only ever sends the browser home.
 */
export const signInGuard: CanActivateFn & CanActivateChildFn = () => guard(true);

/**
 * The admin panel's (`canActivate` of /admin, as it is entered): signInGuard,
 * but a visitor counts as signed out — the admin panel (the Migrations page
 * included, which an administrator needs when a migration waits) is a signed-in
 * person's, and a visitor opening it goes to the IAM and back. A visitor whose
 * sign-in this page load came back without (or could not start) goes to the
 * home page instead, where the failure is said: sent to the IAM again, the
 * browser would go round for ever.
 */
export const adminSignInGuard: CanActivateFn = () => guard(false);

function guard(visitorsWelcome: boolean): boolean | UrlTree | Promise<boolean | UrlTree> {
  const auth = inject(AuthService);
  const state = auth.state();
  if (state === 'ready' || (state === 'visiting' && visitorsWelcome)) {
    return true;
  }
  const router = inject(Router);
  const navigation = router.currentNavigation();
  const returnTo = navigation ? navigation.extractedUrl.toString() : location.pathname + location.search + location.hash;
  if (state === 'visiting') {
    if (auth.signInError() !== null) {
      return router.createUrlTree(['/']);
    }
  } else if (auth.signInError() !== null) {
    if (state === 'signed-out') {
      auth.askedFor.set(returnTo);
    }
    return true;
  } else if (state !== 'signed-out') {
    return false;
  }
  const i18n = inject(TranslationService);
  // The IAM's pages in the language the person reads here — when one was settled: an `en` nobody chose would override the IAM's own choice.
  return auth.login(i18n.ready() ? i18n.language() : undefined, returnTo).then((started) => {
    if (started || auth.signInError() === null) {
      return false;
    }
    if (state === 'visiting') {
      return router.createUrlTree(['/']);
    }
    auth.askedFor.set(returnTo);
    return true;
  });
}
