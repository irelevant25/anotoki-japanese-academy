import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { TranslatePipe, TranslatePluralPipe, TranslationService } from '@anotoki/lib/translations';
import { ButtonComponent } from '@anotoki/lib/ui/button';
import { CardComponent } from '@anotoki/lib/ui/card';
import { PageHeaderComponent } from '@anotoki/lib/ui/page-header';
import { SegmentedComponent, SegmentedOption } from '@anotoki/lib/ui/segmented';
import { ApiService } from '../../core/api/api.service';
import { LessonTypes, Settings } from '../../core/api/api.types';
import { KanjiScreenService } from '../kanji-screen.service';
import { KanjiStateService } from '../kanji-state.service';
import { TileComponent } from '../shared/tile/tile.component';

/**
 * Choosing lessons: the batch size, which kinds, from which lesson — as many
 * batches as wanted, no daily limit. Drawn with the kit: the batch size a
 * segmented choice, the kinds and the lessons rows of its buttons, the one
 * chosen pressed (styles/_base.scss, .choice).
 */
@Component({
  selector: 'app-lessons',
  imports: [ButtonComponent, CardComponent, PageHeaderComponent, SegmentedComponent, TileComponent, TranslatePipe, TranslatePluralPipe],
  templateUrl: './lessons.component.html',
  styleUrl: './lessons.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class LessonsComponent {
  readonly kanji = inject(KanjiStateService);
  private readonly api = inject(ApiService);
  private readonly screen = inject(KanjiScreenService);
  private readonly i18n = inject(TranslationService);

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

  readonly next = computed(() => {
    const L = this.lesson();
    return this.kanji.nextLessons({ count: this.batch(), lessons: L !== null ? [L] : null, types: this.types() });
  });
  readonly lessonChoices = computed(() =>
    this.kanji.lessons().map((L) => ({ L, n: this.kanji.availableLessonCount(L, this.types()) })),
  );

  setBatch(n: number): void {
    this.batch.set(n);
    this.save({ batchSize: n });
  }

  setTypes(t: LessonTypes): void {
    this.types.set(t);
    this.save({ lessonTypes: t });
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
