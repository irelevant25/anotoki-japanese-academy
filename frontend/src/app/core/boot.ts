import { inject } from '@angular/core';
import { AuthService } from './auth/auth.service';
import { TranslationService } from './i18n/translation.service';

/**
 * The whole start of the app, before anything is drawn (the one app
 * initializer): first how this copy signs people in — which, coming back from
 * the IAM, finishes the sign-in and puts the address the person started from
 * back in the address bar —, then the language and its strings, which need to
 * know what the app can show and who is signed in.
 *
 * Neither ever rejects: an app that cannot start still has to say why, and the
 * pages that say it word themselves when there are no strings
 * (standin/kept-word.ts).
 *
 * Both services are injected before the first `await`: inject() does not work
 * after one.
 */
export async function boot(): Promise<void> {
  const auth = inject(AuthService);
  const i18n = inject(TranslationService);

  await auth.init();
  await i18n.init();
}
