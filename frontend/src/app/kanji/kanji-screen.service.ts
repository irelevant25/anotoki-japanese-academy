import { computed, inject, Injectable, signal } from '@angular/core';
import { Router } from '@angular/router';
import { CatalogItem } from '../core/api/api.types';
import { KanjiStateService } from './kanji-state.service';
import { Parts, SessionMode, SessionResult } from './session/session-engine';

/** What a summary offers next: the same lessons to practise, the same practice again. */
export interface SummaryContext {
  lessonItems?: CatalogItem[];
  practiceItems?: CatalogItem[];
  parts?: Parts;
}

/**
 * What the kanji section draws over the screen it was started from: a lesson
 * batch, a session, a session's summary. The address doesn't change (a batch
 * started on the dashboard stays at /kanji): giving sessions addresses of their
 * own would mean rebuilding in-memory batches from the URL. A link in the
 * section's navigation takes it away (KanjiShellComponent), even a link to the
 * address already shown.
 */
export type Overlay =
  | { kind: 'lessons'; items: CatalogItem[] }
  | { kind: 'session'; mode: SessionMode; items: CatalogItem[]; parts: Parts; ctx: SummaryContext }
  | { kind: 'summary'; result: SessionResult; ctx: SummaryContext };

const TAB: Record<SessionMode, string> = { lesson: 'lessons', review: 'reviews', practice: 'practice' };

@Injectable({ providedIn: 'root' })
export class KanjiScreenService {
  private readonly kanji = inject(KanjiStateService);
  private readonly router = inject(Router);

  readonly overlay = signal<Overlay | null>(null);
  /** The tab of the screen the route shows (its data.nav). */
  readonly routeTab = signal('');

  /** The tab to mark: a session started from the dashboard marks its own. */
  readonly tab = computed(() => {
    const o = this.overlay();
    if (!o) {
      return this.routeTab();
    }
    if (o.kind === 'lessons') {
      return 'lessons';
    }
    return o.kind === 'session' ? TAB[o.mode] : TAB[o.result.mode];
  });

  /** A batch of lessons: each item shown, then the quiz. */
  startLessons(items: CatalogItem[]): void {
    if (items.length) {
      this.overlay.set({ kind: 'lessons', items });
    }
  }

  startSession(mode: SessionMode, items: CatalogItem[], parts: Parts = 'both', ctx: SummaryContext = {}): void {
    this.overlay.set({ kind: 'session', mode, items, parts, ctx });
  }

  practice(items: CatalogItem[], parts: Parts = 'both'): void {
    this.startSession('practice', items, parts, { practiceItems: items, parts });
  }

  /**
   * A session is done and its answers saved: its summary, once the progress is
   * fresh — unless the learner has moved on meanwhile ($stillShown says
   * whether the session is still what is on the screen), whose screen stays.
   */
  async finished(result: SessionResult, ctx: SummaryContext, stillShown: () => boolean): Promise<void> {
    await this.kanji.refresh().catch(() => undefined);
    if (stillShown()) {
      this.overlay.set({ kind: 'summary', result, ctx });
    }
  }

  close(): void {
    this.overlay.set(null);
  }

  /**
   * To a screen of the section. The router does nothing for the address
   * already shown — and a session draws over the screen it started from, so
   * after a lesson started on the dashboard, the dashboard's own link would do
   * nothing: the screen is then drawn again by hand, with fresh progress.
   */
  async goto(url: string): Promise<void> {
    if (this.router.url === url) {
      await this.redraw();
    } else {
      await this.router.navigateByUrl(url);
    }
  }

  /** The screen of the address shown, fresh: whatever was drawn over it goes. */
  async redraw(): Promise<void> {
    await this.kanji.refresh().catch(() => undefined);
    this.close();
    this.redraws.update((n) => n + 1);
  }

  /** Counts redraw()s: the shell draws its screen anew for each. */
  readonly redraws = signal(0);
}
