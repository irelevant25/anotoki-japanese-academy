import { ChangeDetectionStrategy, Component, computed, effect, inject, OnInit, signal, untracked } from '@angular/core';
import { RouterLink } from '@angular/router';
import { TranslatePluralPipe, TranslatePipe, TranslationService } from '@anotoki/lib/translations';
import { ApiService } from '../core/api/api.service';
import { Attempt, ExamMeta, Summary } from '../core/api/api.types';
import { AuthService } from '../core/auth/auth.service';
import { VisitorKey } from '../core/auth/visitor-key';
import { fmtDateTime, fmtInShort } from '../core/format';
import { TimeWording } from '../core/i18n/time-wording';
import { KanjiStateService } from '../kanji/kanji-state.service';
import { VisitorNoticeComponent } from './visitor-notice/visitor-notice.component';
import { YourDataComponent } from './your-data/your-data.component';

/** The stage groups of the bar, by the ids the summary uses, each with its colour. */
const BAR: [string, string][] = [
  ['apprentice', '--st-apprentice'],
  ['guru', '--st-guru'],
  ['master', '--st-master'],
  ['enlightened', '--st-enlightened'],
  ['burned', '--st-burned'],
];

/**
 * The Academy's home: the two parts, with where each stands, and at its foot
 * Your data (the learner's data as a file, and back) — a signed-in person's
 * only. A visitor (nobody signed in, where the IAM does not require it) reads
 * the visitor notice at the top instead (visitor-notice/), and the page loads
 * again when what this browser studied moves into an account after the first
 * page was drawn (a move asked again later: VisitorKey.moves).
 *
 * Its words are in the language on the page. What is kept here is what
 * happened — the numbers, and whether a load failed — and the sentences are
 * worded from that in the template or in a computed(), so they follow the
 * language when it changes. The stage groups' names are not the app's words:
 * they come with the summary, the same in every language, and the bar that
 * shows them says so (`lang="en"`).
 */
@Component({
  selector: 'app-home',
  imports: [RouterLink, TranslatePipe, TranslatePluralPipe, VisitorNoticeComponent, YourDataComponent],
  templateUrl: './home.component.html',
  styleUrl: './home.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class HomeComponent implements OnInit {
  private readonly api = inject(ApiService);
  private readonly kanji = inject(KanjiStateService);
  private readonly i18n = inject(TranslationService);
  private readonly wording = inject(TimeWording);
  readonly auth = inject(AuthService);
  private readonly visitor = inject(VisitorKey);

  readonly summary = signal<Summary | null>(null);
  readonly kanjiError = signal(false);
  readonly meta = signal<ExamMeta | null>(null);
  readonly attempts = signal<Attempt[] | null>(null);
  readonly examError = signal(false);

  readonly kanjiNote = computed(() => {
    if (this.kanjiError()) {
      return this.i18n.t('home.kanji.loadFailed');
    }
    const s = this.summary();
    if (!s) {
      return '';
    }
    if (s.reviewsDue) {
      return this.i18n.t('home.kanji.waiting');
    }
    return s.nextReviewAt ? this.i18n.t('home.kanji.nextReview', { when: fmtInShort(this.wording, s.nextReviewAt) }) : this.i18n.t('home.kanji.start');
  });

  /** The stage bar: each stage group's share of all items, under the group's own name. */
  readonly bar = computed(() => {
    const s = this.summary();
    if (!s) {
      return [];
    }
    const total = s.total || 1;
    return BAR.map(([g, token]) => ({ g, name: s.groups[g]?.name ?? '', n: s.groups[g]?.total || 0, token }))
      .filter((b) => b.n)
      .map((b) => ({ ...b, width: (b.n / total) * 100, color: `var(${b.token})` }));
  });
  /** What the bar's colours stand for, in its order: "Apprentice · Guru · …", once the summary has come. */
  readonly barTitle = computed(() => {
    const s = this.summary();
    if (!s) {
      return null;
    }
    return (
      BAR.map(([g]) => s.groups[g]?.name)
        .filter((name) => !!name)
        .join(' · ') || null
    );
  });

  readonly last = computed(() => this.attempts()?.[0] ?? null);
  /** The last attempt's score: "–" while the history is on its way, "—" when there is none yet. */
  readonly lastScore = computed(() => {
    if (this.attempts() === null) {
      return '–';
    }
    const a = this.last();
    return a ? this.i18n.t('home.exam.score', { pct: this.i18n.number(a.pct) }) : '—';
  });
  readonly examNote = computed(() => {
    if (this.examError()) {
      return this.i18n.t('home.exam.loadFailed');
    }
    const a = this.last();
    if (this.attempts() === null) {
      return '';
    }
    return a ? this.i18n.t(a.passed ? 'home.exam.passed' : 'home.exam.notPassed', { when: fmtDateTime(this.wording, a.finishedAt) }) : this.i18n.t('home.exam.none');
  });
  /** How many questions the exam draws from, written as the language writes numbers. */
  readonly bankSize = computed(() => {
    const meta = this.meta();
    return meta ? this.i18n.number(meta.bankSize) : '–';
  });

  constructor() {
    // A move that finished after the page was drawn: what it shows is the account's now.
    const movesAtStart = this.visitor.moves();
    effect(() => {
      if (this.visitor.moves() !== movesAtStart) {
        untracked(() => void this.reload());
      }
    });
  }

  async ngOnInit(): Promise<void> {
    await this.reload();
  }

  /** Where each part stands, asked again: at the start, and after a data file has replaced the learner's data (Your data). */
  async reload(): Promise<void> {
    await Promise.all([this.loadKanji(), this.loadExam()]);
  }

  private async loadKanji(): Promise<void> {
    try {
      const s = await this.api.summary();
      this.summary.set(s);
      this.kanji.setSummary(s); // the badge in the top bar
    } catch {
      this.kanjiError.set(true);
    }
  }

  private async loadExam(): Promise<void> {
    try {
      const [meta, attempts] = await Promise.all([this.api.meta(), this.api.attempts()]);
      this.meta.set(meta);
      this.attempts.set(attempts);
    } catch {
      this.examError.set(true);
    }
  }
}
