import { NgTemplateOutlet } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, inject, input } from '@angular/core';
import { RouterLink } from '@angular/router';
import { TranslatePipe, TranslatePluralPipe, TranslationService } from '@anotoki/lib/translations';
import { ButtonComponent } from '@anotoki/lib/ui/button';
import { ApiError } from '../../core/api/api.service';
import { fmtClock, fmtIn, pct } from '../../core/format';
import { errorKey, errorParams } from '../../core/i18n/error-text';
import { TimeWording } from '../../core/i18n/time-wording';
import { KanjiScreenService, SummaryContext } from '../kanji-screen.service';
import { KanjiStateService } from '../kanji-state.service';
import { DoneEntry, SessionMode, SessionResult } from '../session/session-engine';
import { TileComponent } from '../shared/tile/tile.component';
import { Part, wordedParts } from '../shared/worded/worded-parts';
import { WordedComponent } from '../shared/worded/worded.component';

/** The heading of each kind of session's summary, as keys. */
const TITLES: Record<SessionMode, string> = {
  lesson: 'summary.title.lesson',
  review: 'summary.title.review',
  practice: 'summary.title.practice',
};

/** A review's move between stages: the stage names are the catalog's own, English in every language. */
export type Move = { kind: 'stays'; parts: Part[] } | { kind: 'moved'; from: string; to: string; dir: 'up' | 'down' };

/** A finished lesson quiz, review session or practice: what was learned, missed and saved, and what next. */
@Component({
  selector: 'app-summary',
  imports: [ButtonComponent, NgTemplateOutlet, RouterLink, TileComponent, TranslatePipe, TranslatePluralPipe, WordedComponent],
  templateUrl: './summary.component.html',
  styleUrl: './summary.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class SummaryComponent {
  private readonly kanji = inject(KanjiStateService);
  private readonly screen = inject(KanjiScreenService);
  private readonly i18n = inject(TranslationService);
  private readonly wording = inject(TimeWording);

  readonly result = input.required<SessionResult>();
  readonly ctx = input<SummaryContext>({});

  readonly title = computed(() => TITLES[this.result().mode]);
  readonly clean = computed(() => this.result().done.filter((d) => !d.error && d.wrongM + d.wrongR === 0));
  readonly missed = computed(() => this.result().done.filter((d) => !d.error && d.wrongM + d.wrongR > 0));
  readonly failed = computed(() => this.result().done.filter((d) => d.error));
  readonly summary = this.kanji.summary;

  /**
   * The first line. After lessons: how many items were learned and, as a
   * sentence of its own, when their first review comes. After reviews or
   * practice: how many items went without a mistake, and the share of answers
   * right (left out when nothing was answered).
   */
  readonly lead = computed(() => {
    const r = this.result();
    const s = this.summary();
    if (r.mode === 'lesson') {
      const learned = this.i18n.plural('summary.learned', r.done.length - this.failed().length);
      return s?.nextReviewAt
        ? `${learned} ${this.i18n.t('summary.firstReview', { when: fmtIn(this.wording, s.nextReviewAt), clock: fmtClock(this.wording, s.nextReviewAt) })}`
        : learned;
    }
    const clean = this.clean().length;
    return r.answered
      ? this.i18n.plural('summary.score', r.done.length, { clean, pct: pct(r.right, r.answered) })
      : this.i18n.plural('summary.scoreOnly', r.done.length, { clean });
  });

  /** The next lessons, as the dashboard would offer them. */
  readonly more = computed(() => {
    const set = this.kanji.settings();
    return this.kanji.nextLessons({ count: set.batchSize || 5, types: set.lessonTypes || 'both' });
  });

  misses(d: DoneEntry): number {
    return d.wrongM + d.wrongR;
  }

  /** A review's move between stages, or null. Called from the template, so "stays" follows the language. */
  moved(d: DoneEntry): Move | null {
    if (this.result().mode !== 'review' || d.from == null || d.to == null) {
      return null;
    }
    if (d.to === d.from) {
      return { kind: 'stays', parts: wordedParts(this.i18n, 'summary.stays', { stage: { text: this.kanji.stageName(d.to), lang: 'en' } }) };
    }
    return { kind: 'moved', from: this.kanji.stageName(d.from), to: this.kanji.stageName(d.to), dir: d.to > d.from ? 'up' : 'down' };
  }

  /** Why an item was not saved, in the app's own words (called from the template, so it follows the language). */
  reason(error: ApiError): string {
    return this.i18n.t(errorKey(error), errorParams(error));
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
