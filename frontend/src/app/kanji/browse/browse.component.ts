import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { ActivatedRoute } from '@angular/router';
import { TranslatePipe, TranslatePluralPipe, TranslationService } from '@anotoki/lib/translations';
import { ChipGroupComponent, ChipOption } from '@anotoki/lib/ui/chips';
import { TextFieldComponent } from '@anotoki/lib/ui/forms';
import { PageHeaderComponent } from '@anotoki/lib/ui/page-header';
import { SegmentedComponent, SegmentedOption } from '@anotoki/lib/ui/segmented';
import { toHiragana } from 'wanakana';
import { CatalogItem } from '../../core/api/api.types';
import { canonReading } from '../answer';
import { KanjiStateService } from '../kanji-state.service';
import { TileComponent } from '../shared/tile/tile.component';

/** A choice of stage: the app's own words by their key, or a stage group by its own name, which is never translated. */
interface StatusChoice {
  id: string;
  key: string | null;
  name: string;
}

/**
 * Every item, filterable by type, lesson and stage, and searchable by kanji, reading (romaji or kana) or meaning.
 * The filters are the kit's: the type a segmented choice, the lessons and the stages its choice chips (one at a
 * time: a radio group, named for a screen reader alone - nothing is written over them; a stage group's name is
 * English, and its chip says so).
 */
@Component({
  selector: 'app-browse',
  imports: [ChipGroupComponent, PageHeaderComponent, SegmentedComponent, TextFieldComponent, TileComponent, TranslatePipe, TranslatePluralPipe],
  templateUrl: './browse.component.html',
  styleUrl: './browse.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class BrowseComponent {
  readonly kanji = inject(KanjiStateService);
  private readonly i18n = inject(TranslationService);

  private readonly params = inject(ActivatedRoute).snapshot.queryParamMap;
  readonly type = signal(this.params.get('type') || 'all');
  readonly lesson = signal<number | null>(this.params.get('lesson') ? Number(this.params.get('lesson')) : null);
  readonly status = signal(this.params.get('status') || 'all');
  readonly query = signal(this.params.get('q') || '');

  /** Which kinds of items: [the choice, the key of its name]. */
  readonly typeChoices: [string, string][] = [
    ['all', 'browse.allTypes'],
    ['kanji', 'kanji.type.kanji'],
    ['vocab', 'kanji.type.vocab'],
  ];
  /** The kinds as the segmented choice offers them, in the language on the page. */
  readonly typeOptions = computed<SegmentedOption[]>(() => this.typeChoices.map(([value, key]) => ({ value, label: this.i18n.t(key) })));
  readonly statusChoices = computed<StatusChoice[]>(() => [
    { id: 'all', key: 'browse.anyStage', name: '' },
    { id: 'new', key: 'item.notLearned', name: '' },
    ...this.kanji.groups().map((g): StatusChoice => ({ id: g.id, key: null, name: g.name })),
  ]);
  /** The stages as the choice chips offer them: the app's own words, or a stage group's own English name, marked so. */
  readonly statusOptions = computed<ChipOption[]>(() =>
    this.statusChoices().map((s) => (s.key !== null ? { value: s.id, label: this.i18n.t(s.key) } : { value: s.id, label: s.name, lang: 'en' })),
  );
  /** Any lesson, then each lesson of the course ("L6"), as the choice chips offer them. */
  readonly lessonOptions = computed<ChipOption[]>(() => [
    { value: 'any', label: this.i18n.t('browse.anyLesson') },
    ...this.kanji.lessons().map((L) => ({ value: String(L), label: `L${L}` })),
  ]);

  /** A lesson chosen on its chips: any lesson, or one. */
  setLesson(value: string | null): void {
    this.lesson.set(value === null || value === 'any' ? null : Number(value));
  }

  /** A stage chosen on its chips: one of their own, or nothing changes. */
  setStatus(value: string | null): void {
    if (value !== null && this.statusChoices().some((s) => s.id === value)) {
      this.status.set(value);
    }
  }

  readonly list = computed(() => this.kanji.items().filter((it) => this.matches(it, this.type(), this.lesson(), this.status(), this.query())));
  readonly shown = computed(() => this.list().slice(0, 1500));

  private matches(it: CatalogItem, type: string, lesson: number | null, status: string, query: string): boolean {
    if (type !== 'all' && it.type !== type) {
      return false;
    }
    if (lesson && it.lesson !== lesson) {
      return false;
    }
    const st = this.kanji.stage(it.id);
    if (status === 'new' && st) {
      return false;
    }
    if (status !== 'all' && status !== 'new' && (!st || this.kanji.groupOf(st) !== status)) {
      return false;
    }
    const q = query.trim().toLowerCase();
    if (!q) {
      return true;
    }
    if (it.chars.includes(query.trim())) {
      return true;
    }
    const canonQ = canonReading(toHiragana(q));
    if (canonQ && !/[a-z]/.test(canonQ) && it.readings.some((r) => canonReading(r).startsWith(canonQ))) {
      return true;
    }
    return it.meanings.some((m) => m.toLowerCase().includes(q));
  }
}
