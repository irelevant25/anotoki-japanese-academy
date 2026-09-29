import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { RouterLink } from '@angular/router';
import { CatalogItem } from '../../core/api/api.types';
import { PrivateLinksService } from '../../core/auth/private-links.service';
import { fmtClock, fmtIn, pct, plural } from '../../core/format';
import { KanjiScreenService } from '../kanji-screen.service';
import { KanjiStateService } from '../kanji-state.service';
import { TileComponent } from '../shared/tile/tile.component';

/** The trainer's home: lessons, reviews and practice to start, today, the stages, what is coming, and each lesson's progress. */
@Component({
  selector: 'app-dashboard',
  imports: [RouterLink, TileComponent],
  templateUrl: './dashboard.component.html',
  styleUrl: './dashboard.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class DashboardComponent {
  readonly kanji = inject(KanjiStateService);
  private readonly screen = inject(KanjiScreenService);
  readonly privateLinks = inject(PrivateLinksService);

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
      return 'Due now. These are what move items up the SRS stages.';
    }
    return s.nextReviewAt
      ? `Next review ${fmtIn(s.nextReviewAt)} (${fmtClock(s.nextReviewAt)}).`
      : 'Learn some lessons and their reviews will appear here.';
  });

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
        title: `${plural(n, 'review')} around ${fmtClock(at.getTime())}`,
        label: i % 3 === 0 ? String(at.getHours()).padStart(2, '0') : null,
      };
    });
  });

  /** The next seven days. English day names: the rest of the page is English, whatever the system locale. */
  readonly days = computed(() => {
    const s = this.s();
    if (!s) {
      return [];
    }
    return s.forecastDays.map((n, i) => {
      const d = new Date(s.now);
      d.setDate(d.getDate() + i);
      return { n, label: i === 0 ? 'Today' : i === 1 ? 'Tomorrow' : d.toLocaleDateString('en-GB', { weekday: 'short' }) };
    });
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
