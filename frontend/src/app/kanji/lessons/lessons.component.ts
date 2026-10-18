import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { TranslatePipe, TranslatePluralPipe, TranslationService } from '@anotoki/lib/translations';
import { ButtonComponent } from '@anotoki/lib/ui/button';
import { CardComponent } from '@anotoki/lib/ui/card';
import { ChipGroupComponent, ChipOption } from '@anotoki/lib/ui/chips';
import { LabelledGroupComponent } from '@anotoki/lib/ui/labelled-group';
import { PageHeaderComponent } from '@anotoki/lib/ui/page-header';
import { SegmentedComponent, SegmentedOption } from '@anotoki/lib/ui/segmented';
import { ApiService } from '../../core/api/api.service';
import { LessonTypes, Settings } from '../../core/api/api.types';
import { KanjiScreenService } from '../kanji-screen.service';
import { KanjiStateService } from '../kanji-state.service';
import { TileComponent } from '../shared/tile/tile.component';

/** The value of "Course order" among the lessons' chips: no lesson, the course's own order. */
const COURSE_ORDER = 'course';

/**
 * Choosing lessons: the batch size, which kinds, from which lesson — as many
 * batches as wanted, no daily limit. Drawn with the kit: the batch size a
 * segmented choice (its name shown by the kit's labelled group), the kinds and
 * the lessons its choice chips (one of them chosen: a radio group, the arrows
 * move the choice), what comes next under a name of the labelled group's.
 */
@Component({
  selector: 'app-lessons',
  imports: [ButtonComponent, CardComponent, ChipGroupComponent, LabelledGroupComponent, PageHeaderComponent, SegmentedComponent, TileComponent, TranslatePipe, TranslatePluralPipe],
  templateUrl: './lessons.component.html',
  styleUrl: './lessons.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class LessonsComponent {
  readonly kanji = inject(KanjiStateService);
  private readonly api = inject(ApiService);
  private readonly screen = inject(KanjiScreenService);
  private readonly i18n = inject(TranslationService);

  protected readonly COURSE_ORDER = COURSE_ORDER;

  readonly batch = signal(this.kanji.settings().batchSize || 5);
  readonly types = signal<LessonTypes>(this.kanji.settings().lessonTypes || 'both');
  /** null: go on in course order */
  readonly lesson = signal<number | null>(null);

  readonly sizes = [3, 5, 10];
  /** The batch sizes as the segmented choice offers them: "5 per batch", in the language on the page. */
  readonly sizeOptions = computed<SegmentedOption[]>(() => this.sizes.map((n) => ({ value: String(n), label: this.i18n.t('lessons.perBatch', { n }) })));
  /** Which kinds of items a batch takes: [the setting, the key of its name]. */
  readonly kinds: [LessonTypes, string][] = [
    ['both', 'kanji.type.both'],
    ['kanji', 'lessons.kanjiOnly'],
    ['vocab', 'lessons.vocabOnly'],
  ];
  /** The kinds as the choice chips offer them, in the language on the page. */
  readonly kindOptions = computed<ChipOption[]>(() => this.kinds.map(([value, key]) => ({ value, label: this.i18n.t(key) })));

  readonly next = computed(() => {
    const L = this.lesson();
    return this.kanji.nextLessons({ count: this.batch(), lessons: L !== null ? [L] : null, types: this.types() });
  });
  readonly lessonChoices = computed(() =>
    this.kanji.lessons().map((L) => ({ L, n: this.kanji.availableLessonCount(L, this.types()) })),
  );
  /**
   * The course's order, then each lesson: "L6", heard with how many of its items can be learned now ("L6, 12
   * available" - the name holds the words shown, WCAG 2.5.3); a lesson with nothing left shown and not to be chosen.
   */
  readonly lessonOptions = computed<ChipOption[]>(() => [
    { value: COURSE_ORDER, label: this.i18n.t('lessons.courseOrder') },
    ...this.lessonChoices().map((c) => ({
      value: String(c.L),
      label: `L${c.L}`,
      name: `L${c.L}, ${this.i18n.t('lessons.available', { n: c.n })}`,
      disabled: !c.n,
    })),
  ]);

  setBatch(n: number): void {
    this.batch.set(n);
    this.save({ batchSize: n });
  }

  setTypes(t: string | null): void {
    const kind = this.kinds.find(([value]) => value === t);
    if (!kind) {
      return;
    }
    this.types.set(kind[0]);
    this.save({ lessonTypes: kind[0] });
  }

  /** The choice of where the next items come from: the course's order, or one lesson. */
  setLesson(value: string | null): void {
    this.lesson.set(value === null || value === COURSE_ORDER ? null : Number(value));
  }

  start(): void {
    this.screen.startLessons(this.next());
  }

  private save(patch: Partial<Settings>): void {
    this.api.settings(patch).then(
      (r) => this.kanji.setSettings(r.settings),
      () => undefined,
    );
  }
}
