import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { TranslationService } from '@anotoki/lib/translations';
import { ButtonComponent } from '@anotoki/lib/ui/button';
import { CardComponent } from '@anotoki/lib/ui/card';
import { SignInService } from '../../core/auth/sign-in.service';
import { keptWord } from '../kept-word';

/** The card's words in English, for a page drawn with no strings (keptWord()): the same text as the seeded English. */
const ENGLISH: Record<string, string> = {
  'signIn.intro': 'Sign in to study. Your kanji progress and your exam results are kept with your account.',
  'signIn.button': 'Sign in',
};

/**
 * The Sign in card, standing in for the app when nobody is signed in and the
 * browser cannot just go to the IAM: the session ended while the page was
 * open (a sign-out in another tab, the IAM's idle limit), or a visitor's site
 * started requiring sign-in. Any other time the anotoki library's guard sends
 * the browser to the IAM before anything is drawn; a sign-in that came back
 * without one is the library's own screen (<anotoki-sign-in-failure>,
 * app.component.html). One button goes to the IAM (SignInService: when it
 * could not start, the library's screen says why).
 */
@Component({
  selector: 'app-sign-in',
  imports: [ButtonComponent, CardComponent],
  templateUrl: './sign-in.component.html',
  styleUrl: './sign-in.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class SignInComponent {
  private readonly flow = inject(SignInService);
  private readonly i18n = inject(TranslationService);
  /** On the way to the IAM: the button stays pressed until the page goes. */
  readonly busy = signal(false);

  /**
   * The page's own words. The server answers while nobody is signed in, so
   * they usually come from the strings; when those could not be had, the
   * English written here.
   */
  readonly words = computed(() => ({
    intro: keptWord(this.i18n, 'signIn.intro', ENGLISH['signIn.intro']),
    button: keptWord(this.i18n, 'signIn.button', ENGLISH['signIn.button']),
  }));

  async signIn(): Promise<void> {
    this.busy.set(true);
    // False: it could not start (the library's screen says why), or a sign-in is already under way.
    if (!(await this.flow.signIn())) {
      this.busy.set(false);
    }
  }
}
