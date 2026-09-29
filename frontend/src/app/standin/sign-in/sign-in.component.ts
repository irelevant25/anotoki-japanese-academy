import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { AuthService, describeSignInFailure } from '../../core/auth/auth.service';

/**
 * Signed out, on a website: this page stands in for the app. One button goes
 * to the IAM, which tells who may use the app. (Straight to the IAM would sign
 * a person back in the moment they signed out: docs/kb/decisions.md.) A
 * sign-in that came back without one says why, in the IAM's own words when it
 * gave some (describeSignInFailure()).
 */
@Component({
  selector: 'app-sign-in',
  templateUrl: './sign-in.component.html',
  styleUrl: './sign-in.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class SignInComponent {
  readonly auth = inject(AuthService);
  readonly busy = signal(false);
  readonly error = signal(this.auth.signInError() ?? '');

  async signIn(): Promise<void> {
    this.busy.set(true);
    try {
      await this.auth.login();
    } catch (e) {
      this.busy.set(false);
      this.error.set(describeSignInFailure({ message: e instanceof Error ? e.message : String(e) }));
    }
  }
}
