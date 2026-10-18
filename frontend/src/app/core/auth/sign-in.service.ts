import { inject, Injectable, signal } from '@angular/core';
import { TranslationService } from '@anotoki/lib/translations';
import { ConfirmService } from '@anotoki/lib/ui/dialog';
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
 * bar's Sign in, the visitor notice's, the Sign in card's, the library's page
 * of a site being updated): off to the IAM, which opens in the language read
 * here, and back to this page.
 *
 * Every sign-in - these, and the one the library's guards start - first asks
 * ready(): these here, before they hand over to the library; the guards'
 * through the library's beforeSignIn (core/auth/auth.config.ts), which a
 * sign-in started here passes at once, so nobody is asked twice. From a
 * visitor's page the saves on their way — a lesson's, a review's or
 * practice's answers, a note being typed — are sent and waited for, so the
 * first save, whose answer brings the visitor's key, is not cut off as the
 * browser leaves (its study would stay behind on the server, out of reach of
 * the move); and when one failed, or an exam paper is open and not handed in,
 * the visitor is asked first, in the language on the page - the kit's question
 * ("Sign in anyway?", the sentence under it, Cancel or Sign in). Then the
 * sign-in, and on the way back the move (core/auth/visitor-key.ts).
 */
@Injectable({ providedIn: 'root' })
export class SignInService {
  private readonly auth = inject(AuthService);
  private readonly saves = inject(SavesInFlight);
  private readonly i18n = inject(TranslationService);
  private readonly confirm = inject(ConfirmService);

  private readonly waitingSignal = signal(false);
  /** Waiting for the saves on their way: the button that signs in shows it. */
  readonly waiting = this.waitingSignal.asReadonly();
  /** A sign-in of this service's is handing over to the library: it asked already. */
  private asked = false;

  /**
   * To the IAM. False: the visitor chose to stay, a sign-in is already under
   * way, or it could not start (`AuthService.signInError` says why, and the
   * library's failure screen words it).
   */
  async signIn(): Promise<boolean> {
    if (this.waitingSignal()) {
      return false;
    }
    this.waitingSignal.set(true);
    try {
      if (!(await this.ready())) {
        return false;
      }
      this.asked = true;
      try {
        return await this.auth.login();
      } finally {
        this.asked = false;
      }
    } finally {
      this.waitingSignal.set(false);
    }
  }

  /** The library's beforeSignIn: ready(), unless the sign-in is this service's, which asked already. */
  beforeSignIn(): Promise<boolean> {
    return this.asked ? Promise.resolve(true) : this.ready();
  }

  /** Whether the sign-in may go: at once for anybody but a visitor; for a visitor once their saves are in, or they chose to go all the same. */
  async ready(): Promise<boolean> {
    if (!this.auth.visiting()) {
      return true;
    }
    const failed = await this.saves.settle();
    // Each question once: a session's failed answer can be both one that failed meanwhile and one it reports.
    const lost = [...new Set([...(failed > 0 ? ['signOut.notSaved'] : []), ...this.saves.losses()])];
    for (const key of lost) {
      // Each loss its own question, as signing out asks it: its yes is the bar's Sign in.
      const go = await this.confirm.ask({
        title: this.i18n.t('signIn.confirmTitle'),
        message: this.i18n.t(ASKED_ON_SIGN_IN[key] ?? key),
        confirmLabel: this.i18n.t('anotoki.topbar.signIn'),
        tone: 'danger',
      });
      if (!go) {
        return false;
      }
    }
    return true;
  }
}
