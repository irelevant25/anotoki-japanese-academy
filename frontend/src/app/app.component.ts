import { ChangeDetectionStrategy, Component, effect, inject, untracked } from '@angular/core';
import { Router, RouterOutlet } from '@angular/router';
import { SignInFailureComponent } from '@anotoki/lib/auth';
import { SiteGateComponent, SitePagesDirective } from '@anotoki/lib/migrations';
import { ConfirmHostComponent } from '@anotoki/lib/ui/dialog';
import { AuthService, SIGN_IN_FAILED_PATH } from './core/auth/auth.service';
import { AppVersionComponent } from './core/changelog/app-version.component';
import { FeedbackButtonComponent } from './core/feedback/feedback-button.component';
import { ProblemComponent } from './standin/problem/problem.component';
import { SignInComponent } from './standin/sign-in/sign-in.component';
import { TopBarComponent } from './top-bar/top-bar.component';

/**
 * The page around every screen: the anotoki family's top bar
 * (top-bar/top-bar.component.ts), then the screen of the address — or, while
 * the app cannot be used, the page that says why (a server that does not
 * answer as it should), the anotoki library's screen of a sign-in that came
 * back without one, or could not start (<anotoki-sign-in-failure>: why, Try
 * again and Back - to a visitor too, in the place of their page), or the Sign
 * in card (a session that ended while the page was open). Nobody signed in
 * otherwise, the library's guard has sent the browser to the IAM, and nothing
 * is drawn under the bar — unless the IAM does not require sign-in here: then
 * the screen is a visitor's (state visiting). At the foot, the version and
 * what is new in it (core/changelog/app-version.component.ts), and Send
 * feedback (core/feedback/feedback-button.component.ts).
 *
 * All of that is behind the anotoki library's gate (<anotoki-site-gate>,
 * core/site-status.config.ts): while the site is not ready - being updated,
 * not set up, its database out of reach - the library's page stands in its
 * place, in its own words, and only the site's ADMIN gets through, to the
 * Migrations page, while an update waits. The bar and the foot stay. All of
 * it is the gate's marked template (`anotokiSitePages`, anotoki-lib 0.2.0),
 * made only while the site is open: no page runs behind the library's page -
 * asks for its data, hears a key, ticks a clock - and a page open when the
 * site stops is taken down (an open exam paper is kept for the tab as it goes:
 * exam/exam.component.ts).
 *
 * The bar and the foot are drawn in every state, so their words have their
 * English in the code too (standin/kept-word.ts). The kit's one question
 * (ConfirmService, the admin panel's) is drawn here, over every page.
 */
@Component({
  selector: 'app-root',
  imports: [
    RouterOutlet,
    SiteGateComponent,
    SitePagesDirective,
    ConfirmHostComponent,
    SignInFailureComponent,
    TopBarComponent,
    AppVersionComponent,
    FeedbackButtonComponent,
    SignInComponent,
    ProblemComponent,
  ],
  templateUrl: './app.component.html',
  styleUrl: './app.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AppComponent {
  readonly auth = inject(AuthService);
  private readonly router = inject(Router);

  constructor() {
    // The router's first navigation, once the start has settled the sign-in:
    // signed in or visiting, the page itself; signed out, its guard sends the
    // browser to the IAM, and back to this address (or on to the failure's
    // screen after a sign-in that failed, or to the gate's page while the site
    // is being updated). Not while the app is not set up or could not start:
    // the boot pages are drawn then, and nothing is loaded.
    let started = false;
    effect(() => {
      const state = this.auth.state();
      if ((state === 'ready' || state === 'visiting' || state === 'signed-out') && !started) {
        started = true;
        untracked(() => this.router.initialNavigation());
      }
    });

    // Signed in after all (in another tab) while the failure of a sign-in was said: it is put away, and the
    // failure's screen gives way to the page that sign-in started from.
    effect(() => {
      if (this.auth.state() === 'ready' && this.auth.signInError() !== null) {
        untracked(() => {
          const startedAt = this.auth.dismissFailure();
          if (this.router.url.split(/[?#]/)[0] === SIGN_IN_FAILED_PATH) {
            const back = startedAt && startedAt.startsWith('/') && !startedAt.startsWith('//') && !startedAt.startsWith(SIGN_IN_FAILED_PATH) ? startedAt : '/';
            void this.router.navigateByUrl(back, { replaceUrl: true });
          }
        });
      }
    });
  }
}
