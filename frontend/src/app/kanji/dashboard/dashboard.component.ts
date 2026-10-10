import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { RouterLink } from '@angular/router';
import { ButtonComponent } from '@anotoki/lib/ui';
import { CatalogItem } from '../../core/api/api.types';
import { AuthService } from '../../core/auth/auth.service';
import { fmtClock, fmtHour, fmtIn, fmtWeekdayOf, pct } from '../../core/format';
import { TranslatePipe } from '../../core/i18n/translate.pipe';
import { TranslatePluralPipe } from '../../core/i18n/translate-plural.pipe';
import { TranslationService } from '../../core/i18n/translation.service';
import { VisitorNoticeComponent } from '../../home/visitor-notice/visitor-notice.component';
import { KanjiScreenService } from '../kanji-screen.service';
import { KanjiStateService } from '../kanji-state.service';
import { TileComponent } from '../shared/tile/tile.component';

/**
 * The trainer's home: lessons, reviews and practice to start, today, the
 * stages, what is coming, and each lesson's progress. A visitor reads the
 * visitor notice at its top; the link to Your data at its foot is a signed-in
 * person's.
 */
@Component({
  selector: 'app-dashboard',
  imports: [ButtonComponent, RouterLink, TileComponent, TranslatePipe, TranslatePluralPipe, VisitorNoticeComponent],
  templateUrl: './dashboard.component.html',
  styleUrl: './dashboard.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class DashboardComponent {
  readonly kanji = inject(KanjiStateService);
  readonly auth = inject(AuthService);
  private readonly screen = inject(KanjiScreenService);
  private readonly i18n = inject(TranslationService);

  readonly s = computed(() => this.kanji.summary());
  readonly next = computed(() => {
    const set = this.kanji.settings();
    return this.kanji.nextLessons({ count: set.batchSize || 5, types: set.lessonTypes || 'both' });
  });

  readonly reviewsText = computed(() => {
    const s = this.s();
    if (!s) {
      return '';
    }
    if (s.reviewsDue) {
      return this.i18n.t('dashboard.reviewsDue');
    }
    return s.nextReviewAt
      ? this.i18n.t('dashboard.nextReview', { when: fmtIn(this.i18n, s.nextReviewAt), clock: fmtClock(this.i18n, s.nextReviewAt) })
      : this.i18n.t('dashboard.noReviews');
  });

  /** Today's three counts, each sentence cut at its number: the template draws the number in bold. */
  readonly learnedToday = computed(() => this.i18n.around('dashboard.learnedToday', 'n'));
  readonly reviewsToday = computed(() => this.i18n.around('dashboard.reviewsToday', 'n'));
  readonly practisedToday = computed(() => this.i18n.around('dashboard.practisedToday', 'n'));

  readonly anyAhead = computed(() => !!this.s()?.forecastHours.some(Boolean));

  /** The next 24 hours, hour by hour. */
  readonly bars = computed(() => {
    const s = this.s();
    if (!s) {
      return [];
    }
    const max = Math.max(1, ...s.forecastHours);
    return s.forecastHours.map((n, i) => {
      const at = new Date(s.now + i * 3600e3);
      at.setMinutes(0, 0, 0);
      return {
        n,
        height: (n / max) * 100,
        title: this.i18n.plural('dashboard.reviewsAround', n, { clock: fmtClock(this.i18n, at.getTime()) }),
        label: i % 3 === 0 ? fmtHour(this.i18n, at.getTime()) : null,
      };
    });
  });

  /**
   * The next seven days, their names in the language on the page, whatever the
   * system's locale. The server counts them (forecastDays: day i is i times 24
   * hours after the start of the learner's today, in the time zone the browser
   * sent it) and says which of the learner's dates each stands for
   * (forecastDates): each is named from its date, never by steps of the page's
   * own — 24 hours from `now` is another day an hour round a change of summer
   * time.
   */
  readonly days = computed(() => {
    const s = this.s();
    if (!s) {
      return [];
    }
    return s.forecastDays.map((n, i) => ({
      n,
      label: i === 0 ? this.i18n.t('dashboard.today') : i === 1 ? this.i18n.t('dashboard.tomorrow') : fmtWeekdayOf(this.i18n, s.forecastDates[i]),
    }));
  });

  /** Each lesson: its kanji, and how much of its vocabulary is learned. */
  readonly lessonRows = computed(() => {
    const s = this.s();
    const items = this.kanji.items();
    return this.kanji.lessons().map((L) => {
      const b = s?.byLesson[L];
      const learned = b?.vocab.learned || 0;
      const total = b?.vocab.total || 0;
      return { L, kanji: items.filter((it) => it.lesson === L && it.type === 'kanji'), learned, total, fill: pct(learned, total) };
    });
  });

  pct = pct;

  learn(items: CatalogItem[]): void {
    this.screen.startLessons(items);
  }

  go(url: string): void {
    void this.screen.goto(url);
  }
}
