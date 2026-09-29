import { ChangeDetectionStrategy, Component, computed, DestroyRef, effect, inject, OnInit, signal, untracked } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { NavigationEnd, Router, RouterLink, RouterOutlet } from '@angular/router';
import { filter } from 'rxjs';
import { AccountMenuComponent } from './core/auth/account-menu/account-menu.component';
import { AuthService } from './core/auth/auth.service';
import { AppVersionComponent } from './core/changelog/app-version.component';
import { KanjiStateService } from './kanji/kanji-state.service';
import { NotSetUpComponent } from './standin/not-set-up/not-set-up.component';
import { ProblemComponent } from './standin/problem/problem.component';
import { SignInComponent } from './standin/sign-in/sign-in.component';

/**
 * The page around every screen: the top bar (the version beside the app's name,
 * the reviews due, and who is signed in), then the screen of the address — or,
 * while the app cannot be used, the page that says why (signed out, not set up
 * yet, a server that does not answer).
 *
 * The top bar's Kanji and Exam show only while the app can be used: following
 * one loads its section, and the kanji screens ask the API for data on the
 * way, which nobody signed out, or a copy not set up, can have.
 */
@Component({
  selector: 'app-root',
  imports: [RouterLink, RouterOutlet, AccountMenuComponent, AppVersionComponent, SignInComponent, NotSetUpComponent, ProblemComponent],
  templateUrl: './app.component.html',
  styleUrl: './app.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AppComponent implements OnInit {
  readonly auth = inject(AuthService);
  private readonly kanji = inject(KanjiStateService);
  private readonly router = inject(Router);
  private readonly destroyRef = inject(DestroyRef);

  private readonly url = signal(location.pathname);
  /** The part of the app the address is in: its link in the top bar is marked. */
  readonly section = computed(() => {
    const path = this.url().split(/[?#]/)[0];
    return path.startsWith('/kanji') ? 'kanji' : path.startsWith('/exam') ? 'exam' : path === '/' ? 'home' : '';
  });
  readonly due = this.kanji.reviewsDue;

  constructor() {
    // The router's first navigation, once the app can be used: at once without
    // sign-in or with a session, else when somebody signs in (in another tab).
    let started = false;
    effect(() => {
      if (this.auth.state() === 'ready' && !started) {
        started = true;
        untracked(() => this.router.initialNavigation());
      }
    });
  }

  ngOnInit(): void {
    this.router.events
      .pipe(
        filter((e) => e instanceof NavigationEnd),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe((e) => this.url.set((e as NavigationEnd).urlAfterRedirects));
  }
}
