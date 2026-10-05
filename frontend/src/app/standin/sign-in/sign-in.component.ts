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
  'signIn.notCompleted': 'Signing in was not completed. Try again.',
  'signIn.failed': 'Signing in did not work. Try again. ({code})',
};

function said(code: string): Said {
  return { key: signInFailureKey(code), params: signInFailureParams(code) };
}

/**
 * A sign-in that came back without one (or could not start), worded from its
 * code in the language on the page — the English above when there are no
 * strings. Here and on a visitor's page (standin/sign-in-failed): call it from
 * a computed() or a template, so it follows the language.
 */
export function signInFailureWords(i18n: TranslationService, code: string): string {
  const { key, params }: Said = said(code);
  return keptWord(i18n, key, ENGLISH[key], params);
}

/**
 * The Sign in card, standing in for the app when nobody is signed in and the
 * browser cannot just go to the IAM: a sign-in came back without one
 * (refused, cancelled) or could not start — sent straight back, the browser
 * would go round for ever — or the session ended while the page was open (a
 * sign-out in another tab, the IAM's idle limit). Any other time signInGuard
 * sends the browser to the IAM before anything is drawn. One button goes to
 * the IAM. The failure is said from its code, in the reader's language —
 * never in the IAM's or its SDK's own English sentence
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

  /** The failure, from the sign-in's own record (it came back without one, or could not start): worded here, so it follows the language. */
  readonly error = computed(() => {
    const failure = this.auth.signInError();
    return failure ? signInFailureWords(this.i18n, failure.code) : '';
  });

  async signIn(): Promise<void> {
    this.busy.set(true);
    // The IAM's pages open in the language read here — when one was settled: an `en` nobody chose would override the IAM's own choice.
    // False: it could not start, and signInError now says why (the card words it).
    if (!(await this.auth.login(this.i18n.ready() ? this.i18n.language() : undefined))) {
      this.busy.set(false);
    }
  }
}
