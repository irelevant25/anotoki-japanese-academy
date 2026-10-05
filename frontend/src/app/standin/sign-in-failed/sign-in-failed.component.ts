import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { AuthService } from '../../core/auth/auth.service';
import { TranslatePipe } from '../../core/i18n/translate.pipe';
import { TranslationService } from '../../core/i18n/translation.service';
import { signInFailureWords } from '../sign-in/sign-in.component';

/**
 * A sign-in that came back without one (refused, cancelled) or could not
 * start, said on a visitor's page. Where the IAM does not require sign-in
 * here, nobody signed in gets the app itself (AuthService state visiting) and
 * no Sign in card — so the failure is said here, above the page, worded from
 * its code as the card words it (signInFailureWords()), until it is closed.
 * One of them is the IAM turning the account away (`access_denied`: its
 * MEMBER role taken away here, docs/kb/sign-in.md): never swallowed, while
 * the page goes on for a visitor.
 */
@Component({
  selector: 'app-sign-in-failed',
  imports: [TranslatePipe],
  templateUrl: './sign-in-failed.component.html',
  styleUrl: './sign-in-failed.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class SignInFailedComponent {
  private readonly auth = inject(AuthService);
  private readonly i18n = inject(TranslationService);
  /** Closed: not said again in this page load. */
  readonly closed = signal(false);

  readonly said = computed(() => {
    const failure = this.auth.signInError();
    return failure && !this.closed() ? signInFailureWords(this.i18n, failure.code) : '';
  });
}
