import { ChangeDetectionStrategy, Component, computed, DestroyRef, ElementRef, inject, OnInit, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { ActivatedRoute, NavigationEnd, ResolveFn, Router, RouterOutlet } from '@angular/router';
import { TranslatePipe, TranslationService } from '@anotoki/lib/translations';
import { AlertComponent } from '@anotoki/lib/ui/alert';
import { SpinnerComponent } from '@anotoki/lib/ui/spinner';
import { LinkTabItem, LinkTabsComponent } from '@anotoki/lib/ui/tabs';
import { filter } from 'rxjs';
import { ApiError, toApiError } from '../core/api/api.service';
import { errorKey, errorParams } from '../core/i18n/error-text';
import { KanjiScreenService, Overlay } from './kanji-screen.service';
import { KanjiStateService } from './kanji-state.service';
import { LessonBatchComponent } from './lesson-batch/lesson-batch.component';
import { SessionComponent } from './session/session.component';
import { SessionResult } from './session/session-engine';
import { SummaryComponent } from './summary/summary.component';

/**
 * Before every screen of the section: the catalog (once) and fresh progress —
 * due counts move with the clock. Null when loaded, else the failure itself:
 * the shell words it from its code, in the reader's language.
 */
export const freshKanji: ResolveFn<ApiError | null> = () =>
  inject(KanjiStateService)
    .load()
    .then(
      () => null,
      (e: unknown) => toApiError(e),
    );

/** The dashboard's tab among the link tabs (its data.nav is ''). */
const DASHBOARD = 'dashboard';

/** The section's tabs: [address, data.nav, the key of its name]. */
const TABS: [string, string, string][] = [
  ['/kanji', '', 'kanji.tab.dashboard'],
  ['/kanji/lessons', 'lessons', 'kanji.tab.lessons'],
  ['/kanji/reviews', 'reviews', 'kanji.tab.reviews'],
  ['/kanji/practice', 'practice', 'kanji.tab.practice'],
  ['/kanji/browse', 'browse', 'kanji.tab.browse'],
];

/**
 * The kanji trainer: its tabs, and the screen of the address — or what is
 * drawn over it (a lesson batch, a session, a summary: KanjiScreenService).
 *
 * The tabs are the kit's link tabs (<anotoki-link-tabs>, anotoki-lib 0.6.0): a
 * nav named "Kanji" of ordinary links, each its own Tab stop, the page's
 * aria-current="page" - the one KanjiScreenService says, so a session drawn
 * over the dashboard marks Reviews or Practice though the address stays, and
 * an item's page marks none. Where the five do not fit (a phone, in Slovak)
 * they scroll sideways in the kit's strip, never the page: the edge with more
 * beyond it fades under a small arrow, and the page's tab is brought into
 * view.
 *
 * A click on a link to the address already shown fires no navigation, and a
 * session draws over the screen it started from without changing the address,
 * so such a click is routed by hand here: the screen is drawn again, fresh.
 *
 * While the data loads, a line says so beside the kit's spinner; a load that
 * failed is the kit's alert, worded from the failure's code. Both are said by
 * the screen's live region (main, polite), never by one of their own.
 */
@Component({
  selector: 'app-kanji-shell',
  imports: [AlertComponent, LessonBatchComponent, LinkTabsComponent, RouterOutlet, SessionComponent, SpinnerComponent, SummaryComponent, TranslatePipe],
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
  private readonly i18n = inject(TranslationService);
  readonly screen = inject(KanjiScreenService);

  /** The tabs as the kit's link tabs take them, worded in the language on the page; the dashboard's its address alone. */
  readonly tabs = computed<LinkTabItem[]>(() =>
    TABS.map(([path, nav, key]) => ({ id: nav || DASHBOARD, label: this.i18n.t(key), path, exact: nav === '' })),
  );
  /** The tab to mark, whatever the address says (KanjiScreenService); an item's page names no tab, and none is marked. */
  readonly currentTab = computed(() => this.screen.tab() || DASHBOARD);
  readonly ready = signal(false);
  /** Why the kanji data could not be loaded, or null: the failure, never a sentence. */
  readonly loadError = signal<ApiError | null>(null);

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
    const fresh: unknown = data['fresh'];
    this.loadError.set(fresh instanceof ApiError ? fresh : null);
    this.screen.routeTab.set(String(data['nav'] ?? ''));
    this.screen.close();
    this.ready.set(true);
  }

  /** A failure in the app's own words (called from the template, so it follows the language). */
  reason(error: ApiError): string {
    return this.i18n.t(errorKey(error), errorParams(error));
  }

  /** A session is done and saved: its summary, unless the learner has moved on. */
  finished(result: SessionResult, overlay: Overlay): void {
    if (overlay.kind !== 'session') {
      return;
    }
    void this.screen.finished(result, overlay.ctx, () => this.screen.overlay() === overlay && this.host.nativeElement.isConnected);
  }
}
