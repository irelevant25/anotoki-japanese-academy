import { inject, Injector } from '@angular/core';
import { AuthService } from './auth/auth.service';
import { VisitorKey } from './auth/visitor-key';
import { TranslationService } from './i18n/translation.service';

/**
 * The whole start of the app, before anything is drawn (the one app
 * initializer): first how this copy signs people in — which, coming back from
 * the IAM, finishes the sign-in and puts the address the person started from
 * back in the address bar —; then, signed in with a visitor key held (what
 * this browser studied without signing in), the move of it into the account,
 * waited for a few seconds at most (VisitorKey.settle()), so the first page
 * already shows it; then the language and its strings, which need to know
 * what the app can show and who is signed in.
 *
 * None of them ever rejects: an app that cannot start still has to say why,
 * and the pages that say it word themselves when there are no strings
 * (standin/kept-word.ts).
 *
 * Everything is injected before the first `await`: inject() does not work
 * after one. VisitorKey is made only for somebody signed in (it asks the API),
 * through the injector taken here.
 */
export async function boot(): Promise<void> {
  const auth = inject(AuthService);
  const i18n = inject(TranslationService);
  const injector = inject(Injector);

  await auth.init();
  if (auth.signedIn()) {
    await injector.get(VisitorKey).settle();
  }
  await i18n.init();
}
