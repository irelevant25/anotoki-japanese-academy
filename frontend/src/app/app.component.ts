import { ChangeDetectionStrategy, Component, computed, effect, inject, untracked } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { NavigationEnd, Router, RouterOutlet } from '@angular/router';
import { SignInFailureComponent } from '@anotoki/lib/auth';
import { SiteFooterComponent } from '@anotoki/lib/footer';
import { SiteGateComponent, SitePagesDirective, SiteStatus } from '@anotoki/lib/migrations';
import { ConfirmHostComponent } from '@anotoki/lib/ui/dialog';
import { filter, map } from 'rxjs';
import { AuthService, SIGN_IN_FAILED_PATH } from './core/auth/auth.service';
import { ChangelogDialogComponent } from './core/changelog/changelog-dialog.component';
import { ChangelogService } from './core/changelog/changelog.service';
import { isLegalPage } from './core/legal.config';
import { NoticeHostComponent } from './core/notice/notice-host.component';
import { ProblemComponent } from './standin/problem/problem.component';
import { SignInComponent } from './standin/sign-in/sign-in.component';
import { TopBarComponent } from './top-bar/top-bar.component';

/**
 * The page around every screen: the anotoki family's top bar
 * (top-bar/top-bar.component.ts), then the screen of the address — or, while
 * the app cannot be used, the page that says why (a server that does not
 * answer as it should), the anotoki library's screen of a sign-in that came
 * back without one, or could not start (<anotoki-sign-in-failure>: why, Try
 * again and Back - to a visitor too, in the place of their page; drawn by the
 * library's <anotoki-sign-in-failure-route>, which loads the screen's code as
 * it is shown, never in the first load - anotoki-lib 0.5.0), or the Sign
 * in card (a session that ended while the page was open). Nobody signed in
 * otherwise, the library's guard has sent the browser to the IAM, and nothing
 * is drawn under the bar — unless the IAM does not require sign-in here: then
 * the screen is a visitor's (state visiting).
 *
 * Under it, the anotoki family's footer (<anotoki-site-footer>,
 * @anotoki/lib/footer, anotoki-lib 0.6.3 - the build analyzer's, the owner's
 * choice of 2026-10-18), on every page and in the admin panel alike: its top
 * border; "Version 0.5.1 · What's new · Feedback" - the version the
 * changelog's newest entry (core/changelog/changelog.service.ts), What's new
 * the app's own news (core/changelog/changelog-dialog.component.ts), both
 * once the changelog has come, and Feedback the library's form in the kit's
 * dialog (core/feedback.config.ts), offered only while the app itself is shown
 * (feedbackOffered); then the family's Terms · Privacy · Contact. Its words
 * are the library's (`anotoki.footer.*`, `anotoki.legalLinks.*`: the
 * database's strings, else the library's own English and Slovak).
 *
 * The legal pages themselves (Terms, Privacy, Contact: legal/) are anybody's:
 * drawn in the page's place to somebody signed in, a visitor, and anybody
 * signed out alike - also over a failed sign-in's screen, whose Back is
 * theirs to press later. Only a start that could not reach its server at all
 * (the problem page: the router never started) has none to show.
 *
 * All of that - the bar, the screen and the footer - is behind the anotoki
 * library's gate (<anotoki-site-gate>, core/site-status.config.ts), the
 * outermost of what the app draws: while the site is not ready - being
 * updated, not set up, its database out of reach - the library's page stands
 * alone, in its own words and in a <main> of its own, with no bar and no
 * footer (the owner's rule of 2026-10-18), and only the site's ADMIN gets
 * through, to the Migrations page - in the app's frame - while an update
 * waits. All of it is the gate's marked template (`anotokiSitePages`,
 * anotoki-lib 0.2.0), made only while the site is open: no page runs behind
 * the library's page - asks for its data, hears a key, ticks a clock - and a
 * page open when the site stops is taken down (an open exam paper is kept for
 * the tab as it goes: exam/exam.component.ts).
 *
 * The bar is drawn on every screen of the app, the problem page of a start
 * that went wrong included, so its words have their English in the code too
 * (standin/kept-word.ts; the footer's are the library's, which never show as
 * a key). No key pressed in the bar, the footer, the form Feedback opens or
 * the news reaches `document`, where the reviews and the exam listen. The
 * kit's one question (ConfirmService: a session's "Stop now?", a sign-out's
 * "Sign out anyway?", the admin panel's) and the app's one notice
 * (NoticeService, drawn with the kit's dialog: a report that would not open, a
 * paper not scored) are drawn here, outside the gate, over every page - where
 * the browser's own confirm() and alert() stood until anotoki-lib 0.6 - and no
 * key pressed in them reaches `document` either.
 */
@Component({
  selector: 'app-root',
  imports: [
    RouterOutlet,
    SiteGateComponent,
    SitePagesDirective,
    ConfirmHostComponent,
    NoticeHostComponent,
    SignInFailureComponent,
    TopBarComponent,
    SiteFooterComponent,
    ChangelogDialogComponent,
    SignInComponent,
    ProblemComponent,
  ],
  templateUrl: './app.component.html',
  styleUrl: './app.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AppComponent {
  readonly auth = inject(AuthService);
  readonly changelog = inject(ChangelogService);
  private readonly site = inject(SiteStatus);
  private readonly router = inject(Router);

  /**
   * The footer's Feedback: while the app itself is shown - to a person, or to
   * a visitor where the IAM does not require signing in (the server takes a
   * message then from anybody) - and not while the library's page stands in
   * for it: never to somebody on their way to the IAM, on the Sign in card or
   * a legal page signed out (the server would refuse them), on the problem
   * page, nor to the site's ADMIN on the Migrations page while an update waits
   * (the message would be refused: 503).
   */
  readonly feedbackOffered = computed(() => this.auth.usable() && !this.site.blocked());

  /** The address the router is at, without its query: which page is drawn. */
  private readonly path = toSignal(
    this.router.events.pipe(
      filter((event) => event instanceof NavigationEnd),
      map(() => this.router.url),
    ),
    { initialValue: this.router.url },
  );
  /** The page is one of the legal pages (Terms, Privacy, Contact): anybody's, drawn whatever the sign-in says. */
  readonly legalPage = computed(() => isLegalPage(this.path()));

  constructor() {
    // The version and the news, for the footer: public/changelog.json, once a page load (a file of the build, never
    // the API: asked for whatever the site's state, and nothing waits for it).
    void this.changelog.load();

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
