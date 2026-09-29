import { ChangeDetectionStrategy, Component, computed, inject, OnInit, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { ApiService } from '../core/api/api.service';
import { Attempt, ExamMeta, Summary } from '../core/api/api.types';
import { fmtInShort } from '../core/format';
import { KanjiStateService } from '../kanji/kanji-state.service';

const BAR: [string, string][] = [
  ['apprentice', '--st-apprentice'],
  ['guru', '--st-guru'],
  ['master', '--st-master'],
  ['enlightened', '--st-enlightened'],
  ['burned', '--st-burned'],
];

/** The Academy's home: the two parts, with where each stands. */
@Component({
  selector: 'app-home',
  imports: [RouterLink],
  templateUrl: './home.component.html',
  styleUrl: './home.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class HomeComponent implements OnInit {
  private readonly api = inject(ApiService);
  private readonly kanji = inject(KanjiStateService);

  readonly summary = signal<Summary | null>(null);
  readonly kanjiError = signal(false);
  readonly meta = signal<ExamMeta | null>(null);
  readonly attempts = signal<Attempt[] | null>(null);
  readonly examError = signal(false);

  readonly kanjiNote = computed(() => {
    if (this.kanjiError()) {
      return 'Could not load kanji progress.';
    }
    const s = this.summary();
    if (!s) {
      return '';
    }
    if (s.reviewsDue) {
      return 'Reviews are waiting.';
    }
    return s.nextReviewAt ? `Next review ${fmtInShort(s.nextReviewAt)}.` : 'Start with your first lessons.';
  });

  /** The stage bar: each stage group's share of all items. */
  readonly bar = computed(() => {
    const s = this.summary();
    if (!s) {
      return [];
    }
    const total = s.total || 1;
    return BAR.map(([g, token]) => ({ g, n: s.groups[g]?.total || 0, token }))
      .filter((b) => b.n)
      .map((b) => ({ ...b, width: (b.n / total) * 100, color: `var(${b.token})` }));
  });

  readonly last = computed(() => this.attempts()?.[0] ?? null);
  readonly examNote = computed(() => {
    if (this.examError()) {
      return 'Could not load exam history.';
    }
    const a = this.last();
    if (this.attempts() === null) {
      return '';
    }
    return a ? `${a.passed ? 'Passed' : 'Not passed'} · ${new Date(a.finishedAt).toLocaleString()}` : 'No attempts yet.';
  });

  async ngOnInit(): Promise<void> {
    await Promise.all([this.loadKanji(), this.loadExam()]);
  }

  bankSize(): string {
    return this.meta()?.bankSize.toLocaleString() ?? '–';
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
