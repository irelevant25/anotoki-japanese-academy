import { NgTemplateOutlet } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, inject, input } from '@angular/core';
import { RouterLink } from '@angular/router';
import { fmtClock, fmtIn, pct, plural } from '../../core/format';
import { KanjiScreenService, SummaryContext } from '../kanji-screen.service';
import { KanjiStateService } from '../kanji-state.service';
import { DoneEntry, SessionResult } from '../session/session-engine';
import { TileComponent } from '../shared/tile/tile.component';

const TITLES = { lesson: 'Lessons done', review: 'Reviews done', practice: 'Practice done' };

/** A finished lesson quiz, review session or practice: what was learned, missed and saved, and what next. */
@Component({
  selector: 'app-summary',
  imports: [NgTemplateOutlet, RouterLink, TileComponent],
  templateUrl: './summary.component.html',
  styleUrl: './summary.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class SummaryComponent {
  private readonly kanji = inject(KanjiStateService);
  private readonly screen = inject(KanjiScreenService);

  readonly result = input.required<SessionResult>();
  readonly ctx = input<SummaryContext>({});

  readonly title = computed(() => TITLES[this.result().mode]);
  readonly clean = computed(() => this.result().done.filter((d) => !d.error && d.wrongM + d.wrongR === 0));
  readonly missed = computed(() => this.result().done.filter((d) => !d.error && d.wrongM + d.wrongR > 0));
  readonly failed = computed(() => this.result().done.filter((d) => d.error));
  readonly summary = this.kanji.summary;

  readonly lead = computed(() => {
    const r = this.result();
    const s = this.summary();
    if (r.mode === 'lesson') {
      const first = s?.nextReviewAt ? ` The first review is ${fmtIn(s.nextReviewAt)}, at ${fmtClock(s.nextReviewAt)}.` : '';
      return `You learned ${plural(r.done.length - this.failed().length, 'item')}.${first}`;
    }
    return `${this.clean().length} of ${plural(r.done.length, 'item')} with no mistakes${r.answered ? ` · ${pct(r.right, r.answered)}% of answers right.` : '.'}`;
  });
  /** Half-answered items the session ended on, which it did not save. */
  readonly unsaved = computed(() => {
    const n = this.result().unfinished;
    return `${plural(n, 'half-answered item')} ${n === 1 ? 'was' : 'were'} not saved.`;
  });
  /** The button that goes on with the lessons. */
  readonly moreLabel = computed(() => {
    const n = this.more().length;
    return n ? `Next ${plural(n, 'lesson')}` : 'All caught up';
  });

  /** The next lessons, as the dashboard would offer them. */
  readonly more = computed(() => {
    const set = this.kanji.settings();
    return this.kanji.nextLessons({ count: set.batchSize || 5, types: set.lessonTypes || 'both' });
  });

  misses(d: DoneEntry): number {
    return d.wrongM + d.wrongR;
  }

  /** A review's move between stages, or null. */
  moved(d: DoneEntry): { text: string; dir: '' | 'up' | 'down' } | null {
    if (this.result().mode !== 'review' || d.from == null || d.to == null) {
      return null;
    }
    if (d.to === d.from) {
      return { text: `stays ${this.kanji.stageName(d.to)}`, dir: '' };
    }
    return { text: `${this.kanji.stageName(d.from)} → ${this.kanji.stageName(d.to)}`, dir: d.to > d.from ? 'up' : 'down' };
  }

  nextLessons(): void {
    this.screen.startLessons(this.more());
  }

  practiseLessons(): void {
    this.screen.practice(this.ctx().lessonItems ?? []);
  }

  sameAgain(): void {
    this.screen.practice(this.ctx().practiceItems ?? [], this.ctx().parts);
  }

  justMissed(): void {
    this.screen.practice(
      this.missed().map((d) => d.it),
      this.ctx().parts,
    );
  }

  moreReviews(): void {
    void this.screen.goto('/kanji/reviews');
  }
}
