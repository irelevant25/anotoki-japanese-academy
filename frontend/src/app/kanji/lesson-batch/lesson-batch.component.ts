import { ChangeDetectionStrategy, Component, computed, HostListener, inject, input, OnInit, signal } from '@angular/core';
import { CatalogItem } from '../../core/api/api.types';
import { AudioService } from '../../core/audio.service';
import { KanjiScreenService } from '../kanji-screen.service';
import { KanjiStateService } from '../kanji-state.service';
import { ItemDetailsComponent } from '../shared/item-details/item-details.component';
import { NotesEditorComponent } from '../shared/notes-editor/notes-editor.component';
import { ReadingsComponent } from '../shared/readings/readings.component';
import { TileComponent } from '../shared/tile/tile.component';

const TABS = ['Meaning', 'Reading', 'Context'];

/**
 * A batch of lessons: each item shown in three tabs (Meaning → Reading →
 * Context), then the quiz that fixes them in the SRS. ←/→ or Enter move on.
 */
@Component({
  selector: 'app-lesson-batch',
  imports: [TileComponent, ReadingsComponent, NotesEditorComponent, ItemDetailsComponent],
  templateUrl: './lesson-batch.component.html',
  styleUrl: './lesson-batch.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class LessonBatchComponent implements OnInit {
  private readonly kanji = inject(KanjiStateService);
  private readonly screen = inject(KanjiScreenService);
  private readonly audio = inject(AudioService);

  readonly items = input.required<CatalogItem[]>();

  readonly tabs = TABS;
  readonly i = signal(0);
  readonly tab = signal(0);
  readonly current = computed(() => this.items()[this.i()]);
  readonly last = computed(() => this.i() === this.items().length - 1 && this.tab() === TABS.length - 1);
  /** Each item and tab drawn afresh: its notes are the item's own. */
  readonly key = computed(() => `${this.current().id}:${this.tab()}`);

  ngOnInit(): void {
    this.autoplay();
  }

  typeLabel(it: CatalogItem): string {
    return this.kanji.typeLabel(it);
  }

  madeOf(it: CatalogItem): CatalogItem[] {
    return (it.kanji ?? []).map((c) => this.kanji.item(`k:${c}`)).filter((k): k is CatalogItem => !!k);
  }

  pick(k: number): void {
    this.i.set(k);
    this.tab.set(0);
    this.autoplay();
  }

  setTab(k: number): void {
    this.tab.set(k);
    this.autoplay();
  }

  step(dir: number): void {
    const n = this.items().length;
    if (dir > 0) {
      if (this.tab() < TABS.length - 1) {
        this.tab.update((t) => t + 1);
      } else if (this.i() < n - 1) {
        this.i.update((i) => i + 1);
        this.tab.set(0);
      } else {
        this.quiz();
        return;
      }
    } else if (this.tab() > 0) {
      this.tab.update((t) => t - 1);
    } else if (this.i() > 0) {
      this.i.update((i) => i - 1);
      this.tab.set(TABS.length - 1);
    }
    this.autoplay();
  }

  /** The word said on its Reading tab, unless autoplay is off. */
  private autoplay(): void {
    const it = this.current();
    if (this.tab() === 1 && it.type === 'vocab' && it.audio && this.kanji.settings().autoplay !== false) {
      this.audio.play(it.audio);
    }
  }

  private quiz(): void {
    const items = this.items();
    this.screen.startSession('lesson', items, 'both', { lessonItems: items });
  }

  @HostListener('document:keydown', ['$event'])
  onKey(event: KeyboardEvent): void {
    const t = event.target as HTMLElement | null;
    if (t && /^(TEXTAREA|INPUT)$/.test(t.tagName)) {
      return;
    }
    if (event.key === 'ArrowRight' || event.key === 'Enter') {
      event.preventDefault();
      this.step(1);
    }
    if (event.key === 'ArrowLeft') {
      event.preventDefault();
      this.step(-1);
    }
  }
}
