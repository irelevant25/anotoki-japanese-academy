import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { CatalogItem, ItemState, LessonTypes } from '../../core/api/api.types';
import { plural } from '../../core/format';
import { KanjiScreenService } from '../kanji-screen.service';
import { KanjiStateService } from '../kanji-state.service';
import { Parts } from '../session/session-engine';

type Scope = 'all' | 'weakest' | 'mistakes' | 'recent' | 'apprentice' | 'guru' | 'burned';

const SCOPES: [Scope, string][] = [
  ['all', 'Everything learned'],
  ['weakest', 'Weakest'],
  ['mistakes', 'Recent mistakes'],
  ['recent', 'Learned in the last 24 h'],
  ['apprentice', 'Apprentice'],
  ['guru', 'Guru and above'],
  ['burned', 'Burned'],
];

/** How often an item was missed, in reviews and practice ("weakest" sorts by it). */
export function errorRate(st: ItemState): { wrong: number; rate: number } {
  const r = st.reviews || { meaning: { correct: 0, incorrect: 0 }, reading: { correct: 0, incorrect: 0 } };
  const p = st.practice || { correct: 0, incorrect: 0 };
  const wrong = (r.meaning.incorrect || 0) + (r.reading.incorrect || 0) + (p.incorrect || 0);
  const all = wrong + (r.meaning.correct || 0) + (r.reading.correct || 0) + (p.correct || 0);
  return { wrong, rate: (wrong + 1) / (all + 2) };
}

/** Practice: drill what has been learned, any time, as many rounds as wanted. It never changes the SRS schedule. */
@Component({
  selector: 'app-practice',
  imports: [RouterLink],
  templateUrl: './practice.component.html',
  styleUrl: './practice.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class PracticeComponent {
  private readonly kanji = inject(KanjiStateService);
  private readonly screen = inject(KanjiScreenService);

  readonly scopes = SCOPES;
  readonly kinds: [LessonTypes, string][] = [
    ['both', 'Kanji & vocabulary'],
    ['kanji', 'Kanji'],
    ['vocab', 'Vocabulary'],
  ];
  readonly asks: [Parts, string][] = [
    ['both', 'Meaning + reading'],
    ['meaning', 'Meaning only'],
    ['reading', 'Reading only'],
  ];
  readonly counts = [10, 20, 50, 100, 0];

  readonly scope = signal<Scope>((inject(ActivatedRoute).snapshot.queryParamMap.get('scope') as Scope) || 'all');
  readonly types = signal<LessonTypes>('both');
  readonly parts = signal<Parts>('both');
  readonly count = signal(20);
  readonly lessons = signal<Set<number>>(new Set());

  readonly learned = computed(() => this.kanji.items().filter((it) => this.kanji.isLearned(it.id)));
  readonly learnedLessons = computed(() => [...new Set(this.learned().map((it) => it.lesson))].sort((a, b) => a - b));
  readonly scopeChoices = computed(() =>
    SCOPES.map(([id, label]) => ({ id, label, n: this.pool(id, this.lessons(), this.types()).length })),
  );
  readonly current = computed(() => this.pool(this.scope(), this.lessons(), this.types()));
  readonly take = computed(() => {
    const n = this.count();
    const pool = this.current().length;
    return n ? Math.min(n, pool) : pool;
  });
  readonly info = computed(() => {
    const n = this.current().length;
    return n ? `${plural(n, 'item')} ${n === 1 ? 'matches' : 'match'}; this session will ask ${this.take()}.` : 'Nothing matches — widen the choices above.';
  });

  toggleLesson(L: number): void {
    this.lessons.update((set) => {
      const next = new Set(set);
      if (next.has(L)) {
        next.delete(L);
      } else {
        next.add(L);
      }
      return next;
    });
  }

  allLessons(): void {
    this.lessons.set(new Set());
  }

  start(): void {
    let items = this.current();
    // "Weakest" keeps its ranking; the rest are sampled at random
    if (this.scope() !== 'weakest') {
      items = items.slice().sort(() => Math.random() - 0.5);
    }
    this.screen.practice(items.slice(0, this.take()), this.parts());
  }

  /** The learned items one choice of scope, lessons and type gives. */
  private pool(scope: Scope, lessons: Set<number>, types: LessonTypes): CatalogItem[] {
    const now = Date.now();
    const pool = this.kanji.items().filter((it) => {
      if (!this.kanji.isLearned(it.id)) {
        return false;
      }
      if (types !== 'both' && it.type !== types) {
        return false;
      }
      if (lessons.size && !lessons.has(it.lesson)) {
        return false;
      }
      const st = this.kanji.st(it.id) as ItemState;
      switch (scope) {
        case 'recent':
          return now - (st.learnedAt || 0) < 24 * 3600e3;
        case 'mistakes':
          return !!st.lastWrongAt && now - st.lastWrongAt < 72 * 3600e3;
        case 'apprentice':
          return st.stage >= 1 && st.stage <= 4;
        case 'guru':
          return st.stage >= 5 && st.stage <= 8;
        case 'burned':
          return st.stage === 9;
        case 'weakest':
          return errorRate(st).wrong > 0;
        default:
          return true;
      }
    });
    if (scope === 'weakest') {
      pool.sort((a, b) => errorRate(this.kanji.st(b.id) as ItemState).rate - errorRate(this.kanji.st(a.id) as ItemState).rate);
    }
    return pool;
  }
}
