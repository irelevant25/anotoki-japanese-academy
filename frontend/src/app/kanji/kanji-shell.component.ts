import { ChangeDetectionStrategy, Component, DestroyRef, ElementRef, inject, OnInit, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { ActivatedRoute, NavigationEnd, ResolveFn, Router, RouterLink, RouterOutlet } from '@angular/router';
import { filter } from 'rxjs';
import { KanjiScreenService, Overlay } from './kanji-screen.service';
import { KanjiStateService } from './kanji-state.service';
import { LessonBatchComponent } from './lesson-batch/lesson-batch.component';
import { SessionComponent } from './session/session.component';
import { SessionResult } from './session/session-engine';
import { SummaryComponent } from './summary/summary.component';

/**
 * Before every screen of the section: the catalog (once) and fresh progress —
 * due counts move with the clock. '' when loaded, else why not.
 */
export const freshKanji: ResolveFn<string> = () =>
  inject(KanjiStateService)
    .load()
    .then(
      () => '',
      (e: unknown) => (e instanceof Error ? e.message : String(e)),
    );

/** The section's tabs: [address, data.nav, label]. */
const TABS: [string, string, string][] = [
  ['/kanji', '', 'Dashboard'],
  ['/kanji/lessons', 'lessons', 'Lessons'],
  ['/kanji/reviews', 'reviews', 'Reviews'],
  ['/kanji/practice', 'practice', 'Practice'],
  ['/kanji/browse', 'browse', 'Browse'],
];

/**
 * The kanji trainer: its tabs, and the screen of the address — or what is
 * drawn over it (a lesson batch, a session, a summary: KanjiScreenService).
 *
 * A click on a link to the address already shown fires no navigation, and a
 * session draws over the screen it started from without changing the address,
 * so such a click is routed by hand here: the screen is drawn again, fresh.
 */
@Component({
  selector: 'app-kanji-shell',
  imports: [RouterLink, RouterOutlet, LessonBatchComponent, SessionComponent, SummaryComponent],
  templateUrl: './kanji-shell.component.html',
  styleUrl: './kanji-shell.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class KanjiShellComponent implements OnInit {
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);
  private readonly kanji = inject(KanjiStateService);
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);
  private readonly destroyRef = inject(DestroyRef);
  readonly screen = inject(KanjiScreenService);

  readonly tabs = TABS;
  readonly ready = signal(false);
  readonly loadError = signal('');

  ngOnInit(): void {
    this.settle();
    this.router.events
      .pipe(
        filter((e) => e instanceof NavigationEnd),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe(() => this.settle());

    // A link to the address already shown: drawn again by hand (capture, so
    // the router's own handling of the link, which would do nothing, never runs).
    const onClick = (event: MouseEvent): void => {
      if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) {
        return;
      }
      const a = (event.target as Element | null)?.closest?.('a[href]') as HTMLAnchorElement | null;
      // any other address is a real change: the router takes it
      if (!a || a.target || a.hasAttribute('download') || a.href !== location.href) {
        return;
      }
      event.preventDefault();
      event.stopPropagation();
      void this.screen.redraw();
    };
    document.addEventListener('click', onClick, true);

    // keep the due badge honest while the tab sits open
    const timer = setInterval(() => this.kanji.refresh().catch(() => undefined), 5 * 60 * 1000);
    this.destroyRef.onDestroy(() => {
      document.removeEventListener('click', onClick, true);
      clearInterval(timer);
      this.screen.close();
    });
  }

  /** After a navigation: the screen of the new address, nothing drawn over it. */
  private settle(): void {
    const child = this.route.firstChild;
    if (!child) {
      return;
    }
    const data = child.snapshot.data;
    this.loadError.set(String(data['fresh'] ?? ''));
    this.screen.routeTab.set(String(data['nav'] ?? ''));
    this.screen.close();
    this.ready.set(true);
  }

  /** A session is done and saved: its summary, unless the learner has moved on. */
  finished(result: SessionResult, overlay: Overlay): void {
    if (overlay.kind !== 'session') {
      return;
    }
    void this.screen.finished(result, overlay.ctx, () => this.screen.overlay() === overlay && this.host.nativeElement.isConnected);
  }
}
