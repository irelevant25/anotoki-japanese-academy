import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { AuthService } from '../../core/auth/auth.service';
import { signInFailureKey, signInFailureParams } from '../../core/i18n/error-text';
import { TranslationParams, TranslationService } from '../../core/i18n/translation.service';
import { keptWord } from '../kept-word';

/** What the page says went wrong: a key and what fills it, never a sentence. */
interface Said {
  key: string;
  params: TranslationParams;
}

/** The two sentences in English, for a page drawn with no strings (keptWord()): the same text as the seeded English. */
const ENGLISH: Record<string, string> = {
  'signIn.notCompleted': 'Signing in was not completed. If you did not mean to stop it, this account may have no access to Japanese Academy.',
  'signIn.failed': 'Signing in did not work. Try again. ({code})',
};

function said(code: string): Said {
  return { key: signInFailureKey(code), params: signInFailureParams(code) };
}

/**
 * Signed out, on a website: this page stands in for the app. One button goes
 * to the IAM, which tells who may use the app. (Straight to the IAM would sign
 * a person back in the moment they signed out: docs/kb/decisions.md.) A
 * sign-in that came back without one says so from its code, in the reader's
 * language — never in the IAM's or its SDK's own English sentence
 * (core/i18n/error-text.ts).
 */
@Component({
  selector: 'app-sign-in',
  templateUrl: './sign-in.component.html',
  styleUrl: './sign-in.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class SignInComponent {
  readonly auth = inject(AuthService);
  private readonly i18n = inject(TranslationService);
  readonly busy = signal(false);

  /**
   * The page's own words. The server answers while nobody is signed in, so
   * they usually come from the strings; when those could not be had, the
   * English written here.
   */
  readonly words = computed(() => ({
    intro: keptWord(this.i18n, 'signIn.intro', 'Sign in to study. Your kanji progress and your exam results are kept with your account.'),
    button: keptWord(this.i18n, 'signIn.button', 'Sign in'),
  }));

  private readonly failure = signal<Said | null>(this.cameBackWith());
  /** Worded here, so it follows the language when that changes. */
  readonly error = computed(() => {
    const failure = this.failure();
    return failure ? keptWord(this.i18n, failure.key, ENGLISH[failure.key], failure.params) : '';
  });

  async signIn(): Promise<void> {
    this.busy.set(true);
    try {
      // The IAM's pages open in the language read here — when one was settled: an `en` nobody chose would override the IAM's own choice.
      await this.auth.login(this.i18n.ready() ? this.i18n.language() : undefined);
    } catch {
      this.busy.set(false);
      this.failure.set(said('could_not_start'));
    }
  }

  private cameBackWith(): Said | null {
    const failure = this.auth.signInError();
    return failure ? said(failure.code) : null;
  }
}
