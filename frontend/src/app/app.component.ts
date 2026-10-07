import { ChangeDetectionStrategy, Component, effect, inject, untracked } from '@angular/core';
import { Router, RouterOutlet } from '@angular/router';
import { SiteGateComponent } from '@anotoki/lib/migrations';
import { AdminDrafts } from './admin/admin-drafts.service';
import { AuthService } from './core/auth/auth.service';
import { AppVersionComponent } from './core/changelog/app-version.component';
import { ProblemComponent } from './standin/problem/problem.component';
import { SignInFailedComponent } from './standin/sign-in-failed/sign-in-failed.component';
import { SignInComponent } from './standin/sign-in/sign-in.component';
import { TopBarComponent } from './top-bar/top-bar.component';

/**
 * The page around every screen: the anotoki family's top bar
 * (top-bar/top-bar.component.ts), then the screen of the address — or, while
 * the app cannot be used, the page that says why (a server that does not
 * answer as it should), or the Sign in card (a sign-in that came back without
 * one, or a session that ended while the page was open). Nobody signed in
 * otherwise, signInGuard has sent the browser to the IAM, and nothing is drawn
 * under the bar — unless the IAM does not require sign-in here: then the
 * screen is a visitor's (state visiting), with a sign-in that came back
 * without one said above it (standin/sign-in-failed). At the foot, the version
 * and what is new in it (core/changelog/app-version.component.ts).
 *
 * All of that is behind the anotoki library's gate (<anotoki-site-gate>,
 * core/site-status.config.ts): while the site is not ready - being updated,
 * not set up, its database out of reach - the library's page stands in its
 * place, in its own words, and only the site's ADMIN gets through, to the
 * Migrations page, while an update waits. The bar and the foot stay.
 *
 * The bar and the foot are drawn in every state, so their words have their
 * English in the code too (standin/kept-word.ts).
 */
@Component({
  selector: 'app-root',
  imports: [RouterOutlet, SiteGateComponent, TopBarComponent, AppVersionComponent, SignInComponent, SignInFailedComponent, ProblemComponent],
  templateUrl: './app.component.html',
  styleUrl: './app.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AppComponent {
  readonly auth = inject(AuthService);
  private readonly router = inject(Router);
  /**
   * Made here, once the sign-in has settled, so the admin area's unsaved words
   * are asked about when the tab is closed, whichever page is showing.
   */
  private readonly adminDrafts = inject(AdminDrafts);

  constructor() {
    // The router's first navigation, once the start has settled the sign-in:
    // signed in or visiting, the page itself; signed out, its guard sends the browser to
    // the IAM, and back to this address (or lets it through to the Sign in
    // card after a sign-in that failed, or to the gate's page while the site is
    // being updated). Not while the app is not set up or could not start: the
    // boot pages are drawn then, and nothing is loaded.
    let started = false;
    effect(() => {
      const state = this.auth.state();
      if ((state === 'ready' || state === 'visiting' || state === 'signed-out') && !started) {
        started = true;
        untracked(() => this.router.initialNavigation());
      }
    });
  }
}
