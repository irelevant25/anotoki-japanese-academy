import { inject, Injectable, signal } from '@angular/core';
import { TranslationService } from '@anotoki/lib/translations';
import { ConfirmService } from '@anotoki/lib/ui/dialog';
import { SavesInFlight } from '../saves-in-flight.service';
import { AuthService } from './auth.service';

/**
 * Signing out, for whatever offers it (the person's menu of the top bar). It
 * does not let anything the learner did go unsaved without asking - ready(),
 * before it hands over to the library (whose beforeSignOut,
 * core/auth/auth.config.ts, then passes at once):
 *
 *   1. the saves on their way — a lesson's, a review's or practice's answers,
 *      a note being typed — are sent and waited for (`waiting`: the button
 *      shows a spinner and `signOut.saving`);
 *   2. when one of them failed (`signOut.notSaved`), or a session still holds
 *      an answer whose save failed before and that nothing has shown yet (the
 *      same question: kanji/session watches for it), or an exam paper is open
 *      and not handed in (`signOut.examOpen`), the learner is asked first, in
 *      the language on the page — the kit's question (ConfirmService, drawn in
 *      the app's root: "Sign out anyway?", the sentence under it, Cancel or
 *      Sign out), worded the moment it is raised (as a session's "Stop now?"
 *      is);
 *   3. then the IAM ends the session everywhere and sends the browser back to
 *      the app, which sends it on to the IAM's sign-in.
 *
 * Unsaved strings of the admin area are the anotoki library's drafts' to ask
 * about (LocalizationDrafts, @anotoki/lib/translations/admin): they are held
 * for the tab, through a sign-out, and the browser's "Leave site?" comes as
 * the page goes.
 */
@Injectable({ providedIn: 'root' })
export class SignOutService {
  private readonly auth = inject(AuthService);
  private readonly saves = inject(SavesInFlight);
  private readonly i18n = inject(TranslationService);
  private readonly confirm = inject(ConfirmService);

  private readonly waitingSignal = signal(false);
  /** Waiting for the saves on their way: the button that signs out shows it. */
  readonly waiting = this.waitingSignal.asReadonly();
  /** A sign-out of this service's is handing over to the library: it asked already. */
  private asked = false;

  /** Answers false when the learner chose to stay (or a sign-out is already under way), true once the IAM has been asked. */
  async signOut(): Promise<boolean> {
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
        return await this.auth.logout();
      } finally {
        this.asked = false;
      }
    } finally {
      this.waitingSignal.set(false);
    }
  }

  /** The library's beforeSignOut: ready(), unless the sign-out is this service's, which asked already. */
  beforeSignOut(): Promise<boolean> {
    return this.asked ? Promise.resolve(true) : this.ready();
  }

  /** Whether the sign-out may go: once every save is in, or the learner chose to go all the same. */
  async ready(): Promise<boolean> {
    const failed = await this.saves.settle();
    // Each question once: a session's failed answer can be both one that failed meanwhile and one it reports.
    const lost = [...new Set([...(failed > 0 ? ['signOut.notSaved'] : []), ...this.saves.losses()])];
    for (const key of lost) {
      // Each loss its own question: the title asks, the sentence says what goes; its yes is the bar's Sign out.
      const go = await this.confirm.ask({
        title: this.i18n.t('signOut.confirmTitle'),
        message: this.i18n.t(key),
        confirmLabel: this.i18n.t('anotoki.topbar.signOut'),
        tone: 'danger',
      });
      if (!go) {
        return false;
      }
    }
    return true;
  }
}
