import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { ButtonComponent } from '@anotoki/lib/ui';
import { ApiService } from '../../core/api/api.service';
import { LessonTypes, Settings } from '../../core/api/api.types';
import { TranslatePipe } from '../../core/i18n/translate.pipe';
import { TranslatePluralPipe } from '../../core/i18n/translate-plural.pipe';
import { KanjiScreenService } from '../kanji-screen.service';
import { KanjiStateService } from '../kanji-state.service';
import { TileComponent } from '../shared/tile/tile.component';

/** Choosing lessons: the batch size, which kinds, from which lesson — as many batches as wanted, no daily limit. */
@Component({
  selector: 'app-lessons',
  imports: [ButtonComponent, TileComponent, TranslatePipe, TranslatePluralPipe],
  templateUrl: './lessons.component.html',
  styleUrl: './lessons.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class LessonsComponent {
  readonly kanji = inject(KanjiStateService);
  private readonly api = inject(ApiService);
  private readonly screen = inject(KanjiScreenService);

  readonly batch = signal(this.kanji.settings().batchSize || 5);
  readonly types = signal<LessonTypes>(this.kanji.settings().lessonTypes || 'both');
  /** null: go on in course order */
  readonly lesson = signal<number | null>(null);

  readonly sizes = [3, 5, 10];
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
