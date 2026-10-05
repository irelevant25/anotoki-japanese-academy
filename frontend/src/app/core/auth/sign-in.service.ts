import { inject, Injectable, signal } from '@angular/core';
import { TranslationService } from '../i18n/translation.service';
import { SavesInFlight } from '../saves-in-flight.service';
import { AuthService } from './auth.service';

/**
 * What signing out asks (SavesInFlight's loss checks), as signing in from a
 * visitor's page asks it: the same loss, the other way out.
 */
const ASKED_ON_SIGN_IN: Record<string, string> = {
  'signOut.notSaved': 'signIn.notSaved',
  'signOut.examOpen': 'signIn.examOpen',
};

/**
 * Signing in, for the buttons that offer it while the page is shown (the top
 * bar's Sign in, the visitor notice's). Off to the IAM, which opens in the
 * language read here, and back to this page.
 *
 * From a visitor's page it first does what signing out does (SignOutService):
 * the saves on their way — a lesson's, a review's or practice's answers, a
 * note being typed — are sent and waited for (`waiting`), so the first save,
 * whose answer brings the visitor's key, is not cut off as the browser
 * leaves (its study would stay behind on the server, out of reach of the
 * move); and when one failed, or an exam paper is open and not handed in, the
 * visitor is asked first, in the language on the page. Then the sign-in, and
 * on the way back the move (core/auth/visitor-key.ts).
 *
 * False: the visitor chose to stay, a sign-in is already under way, or it
 * could not start (`AuthService.signInError` says why, and the page words it).
 */
@Injectable({ providedIn: 'root' })
export class SignInService {
  private readonly auth = inject(AuthService);
  private readonly saves = inject(SavesInFlight);
  private readonly i18n = inject(TranslationService);

  private readonly waitingSignal = signal(false);
  /** Waiting for the saves on their way: the button that signs in shows it. */
  readonly waiting = this.waitingSignal.asReadonly();

  async signIn(): Promise<boolean> {
    if (this.waitingSignal()) {
      return false;
    }
    this.waitingSignal.set(true);
    try {
      if (this.auth.visiting()) {
        const failed = await this.saves.settle();
        // Each question once: a session's failed answer can be both one that failed meanwhile and one it reports.
        const lost = [...new Set([...(failed > 0 ? ['signOut.notSaved'] : []), ...this.saves.losses()])];
        for (const key of lost) {
          if (!confirm(this.i18n.t(ASKED_ON_SIGN_IN[key] ?? key))) {
            return false;
          }
        }
      }
      // The IAM's pages in the language read here — when one was settled: an `en` nobody chose would override the IAM's own choice.
      return await this.auth.login(this.i18n.ready() ? this.i18n.language() : undefined);
    } finally {
      this.waitingSignal.set(false);
    }
  }
}
