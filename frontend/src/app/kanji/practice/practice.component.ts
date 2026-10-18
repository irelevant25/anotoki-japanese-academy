import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { TranslatePipe, TranslationService } from '@anotoki/lib/translations';
import { ButtonComponent } from '@anotoki/lib/ui/button';
import { CardComponent } from '@anotoki/lib/ui/card';
import { ChipComponent, ChipGroupComponent, ChipOption } from '@anotoki/lib/ui/chips';
import { EmptyStateComponent } from '@anotoki/lib/ui/empty-state';
import { LabelledGroupComponent } from '@anotoki/lib/ui/labelled-group';
import { PageHeaderComponent } from '@anotoki/lib/ui/page-header';
import { SegmentedComponent, SegmentedOption } from '@anotoki/lib/ui/segmented';
import { CatalogItem, ItemState, LessonTypes } from '../../core/api/api.types';
import { KanjiScreenService } from '../kanji-screen.service';
import { KanjiStateService } from '../kanji-state.service';
import { Parts } from '../session/session-engine';
import { Part, wordedParts } from '../shared/worded/worded-parts';

type Scope = 'all' | 'weakest' | 'mistakes' | 'recent' | 'apprentice' | 'guru' | 'burned';

/**
 * What to practise. `key`: the key of the scope's name. `group`: a stage group
 * of the catalog whose own name — never translated, and never a copy kept
 * here — is the scope's name (no key), or stands inside it as {stage}.
 */
const SCOPES: { id: Scope; key: string | null; group?: string }[] = [
  { id: 'all', key: 'practice.scope.all' },
  { id: 'weakest', key: 'practice.scope.weakest' },
  { id: 'mistakes', key: 'practice.scope.mistakes' },
  { id: 'recent', key: 'practice.scope.recent' },
  { id: 'apprentice', key: null, group: 'apprentice' },
  { id: 'guru', key: 'practice.scope.guruUp', group: 'guru' },
  { id: 'burned', key: null, group: 'burned' },
];

/** How often an item was missed, in reviews and practice ("weakest" sorts by it). */
export function errorRate(st: ItemState): { wrong: number; rate: number } {
  const r = st.reviews || { meaning: { correct: 0, incorrect: 0 }, reading: { correct: 0, incorrect: 0 } };
  const p = st.practice || { correct: 0, incorrect: 0 };
  const wrong = (r.meaning.incorrect || 0) + (r.reading.incorrect || 0) + (p.incorrect || 0);
  const all = wrong + (r.meaning.correct || 0) + (r.reading.correct || 0) + (p.correct || 0);
  return { wrong, rate: (wrong + 1) / (all + 2) };
}

/**
 * Practice: drill what has been learned, any time, as many rounds as wanted. It never changes the SRS schedule.
 * Drawn with the kit: what, the type and what is asked are its choice chips (one at a time: a radio group, the
 * arrows move the choice; a scope's count its chip's quieter note, and a scope named by a stage's own name alone
 * says it is English - "Guru and above" in Slovak reads in the page's language, the stage's name with it), the
 * lessons its chips as toggles in a group its labelled group names (several at once, All when none), how many a
 * segmented choice whose name the labelled group shows.
 */
@Component({
  selector: 'app-practice',
  imports: [
    ButtonComponent,
    CardComponent,
    ChipComponent,
    ChipGroupComponent,
    EmptyStateComponent,
    LabelledGroupComponent,
    PageHeaderComponent,
    RouterLink,
    SegmentedComponent,
    TranslatePipe,
  ],
  templateUrl: './practice.component.html',
  styleUrl: './practice.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class PracticeComponent {
  private readonly kanji = inject(KanjiStateService);
  private readonly screen = inject(KanjiScreenService);
  private readonly i18n = inject(TranslationService);

  /** Which kinds of items: [the choice, the key of its name]. */
  readonly kinds: [LessonTypes, string][] = [
    ['both', 'kanji.type.both'],
    ['kanji', 'kanji.type.kanji'],
    ['vocab', 'kanji.type.vocab'],
  ];
  /** Which halves are asked: [the choice, the key of its name]. */
  readonly asks: [Parts, string][] = [
    ['both', 'practice.ask.both'],
    ['meaning', 'practice.ask.meaning'],
    ['reading', 'practice.ask.reading'],
  ];
  readonly counts = [10, 20, 50, 100, 0];
  /** How many, as the segmented choice offers them: the numbers, and "All" (0) in the language on the page. */
  readonly countOptions = computed<SegmentedOption[]>(() => this.counts.map((n) => ({ value: String(n), label: n ? String(n) : this.i18n.t('practice.all') })));

  readonly scope = signal<Scope>((inject(ActivatedRoute).snapshot.queryParamMap.get('scope') as Scope) || 'all');
  readonly types = signal<LessonTypes>('both');
  readonly parts = signal<Parts>('both');
  readonly count = signal(20);
  readonly lessons = signal<Set<number>>(new Set());

  readonly learned = computed(() => this.kanji.items().filter((it) => this.kanji.isLearned(it.id)));
  readonly learnedLessons = computed(() => [...new Set(this.learned().map((it) => it.lesson))].sort((a, b) => a - b));
  /** The scopes to choose from: each with its name in pieces (a stage name inside it says it is English) and how many items it gives. */
  readonly scopeChoices = computed(() =>
    SCOPES.map((scope) => ({ id: scope.id, name: this.scopeName(scope.key, scope.group), n: this.pool(scope.id, this.lessons(), this.types()).length })),
  );
  /**
   * The scopes as the choice chips offer them: the name's words (English, marked so, where it is a stage's own name
   * alone), how many items each gives as its note, and one with none not to be chosen - unless it is the one chosen.
   */
  readonly scopeOptions = computed<ChipOption[]>(() =>
    this.scopeChoices().map((c) => ({
      value: c.id,
      label: c.name.map((part) => part.text).join(''),
      lang: c.name.length === 1 ? c.name[0].lang : null,
      note: this.i18n.number(c.n),
      disabled: !c.n && this.scope() !== c.id,
    })),
  );
  /** The kinds and the halves asked, as the choice chips offer them, in the language on the page. */
  readonly kindOptions = computed<ChipOption[]>(() => this.kinds.map(([value, key]) => ({ value, label: this.i18n.t(key) })));
  readonly askOptions = computed<ChipOption[]>(() => this.asks.map(([value, key]) => ({ value, label: this.i18n.t(key) })));
  readonly current = computed(() => this.pool(this.scope(), this.lessons(), this.types()));
  readonly take = computed(() => {
    const n = this.count();
    const pool = this.current().length;
    return n ? Math.min(n, pool) : pool;
  });
  /** "5 items match; this session will ask 5.": a frame over a plural phrase, because the verb agrees with the count. */
  readonly info = computed(() => {
    const n = this.current().length;
    return n
      ? this.i18n.t('practice.info', { matches: this.i18n.plural('practice.matches', n), take: this.i18n.number(this.take()) })
      : this.i18n.t('practice.noMatch');
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

  /** A choice of the chips: one of their own values, or nothing changes. */
  setScope(value: string | null): void {
    const scope = SCOPES.find((one) => one.id === value);
    if (scope) {
      this.scope.set(scope.id);
    }
  }

  setTypes(value: string | null): void {
    const kind = this.kinds.find(([one]) => one === value);
    if (kind) {
      this.types.set(kind[0]);
    }
  }

  setParts(value: string | null): void {
    const ask = this.asks.find(([one]) => one === value);
    if (ask) {
      this.parts.set(ask[0]);
    }
  }

  start(): void {
    let items = this.current();
    // "Weakest" keeps its ranking; the rest are sampled at random
    if (this.scope() !== 'weakest') {
      items = items.slice().sort(() => Math.random() - 0.5);
    }
    this.screen.practice(items.slice(0, this.take()), this.parts());
  }

  /** A scope's name: the app's words, the stage group's own name, or the one inside the other ("Guru and above"). */
  private scopeName(key: string | null, group: string | undefined): Part[] {
    const stage: Part | null = group ? { text: this.kanji.groupName(group), lang: 'en' } : null;
    if (key === null) {
      return stage ? [stage] : [];
    }
    return wordedParts(this.i18n, key, stage ? { stage } : {});
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
