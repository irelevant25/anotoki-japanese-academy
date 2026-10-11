import { ChangeDetectionStrategy, Component, computed, inject, input } from '@angular/core';
import { RouterLink } from '@angular/router';
import { TranslatePipe } from '@anotoki/lib/translations';
import { ButtonComponent } from '@anotoki/lib/ui/button';
import { AudioService } from '../../../core/audio.service';
import { CatalogItem } from '../../../core/api/api.types';
import { KanjiStateService } from '../../kanji-state.service';
import { NotesEditorComponent } from '../notes-editor/notes-editor.component';
import { ReadingsComponent } from '../readings/readings.component';
import { TileComponent } from '../tile/tile.component';

/**
 * Everything worth knowing about an item: its meanings (and the learner's
 * synonyms), its readings, the words a kanji is found in or the kanji a word
 * is made of, and the learner's notes. Used by the lessons, the item page and
 * "Item info" in a session.
 */
@Component({
  selector: 'app-item-details',
  imports: [ButtonComponent, RouterLink, ReadingsComponent, TileComponent, NotesEditorComponent, TranslatePipe],
  templateUrl: './item-details.component.html',
  styleUrl: './item-details.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ItemDetailsComponent {
  private readonly kanji = inject(KanjiStateService);
  private readonly audio = inject(AudioService);

  readonly item = input.required<CatalogItem>();
  /** the item page: up to 40 example words, not 8 */
  readonly full = input(false);
  readonly notes = input(true);
  /** a lesson's Context tab: the meaning and the reading were its first two tabs */
  readonly context = input(false);

  readonly synonyms = computed(() => this.kanji.st(this.item().id)?.synonyms ?? []);
  /** A word's class, as a grammar term: terms are English in every language (the template says so with `lang`). */
  readonly wordClass = computed(() => {
    const it = this.item();
    if (it.type !== 'vocab') {
      return '';
    }
    if (it.verbClass) {
      return it.verbClass === 'irr' ? 'irregular verb' : `${it.verbClass}-verb`;
    }
    return it.adjClass ? `${it.adjClass}-adjective` : '';
  });
  readonly examples = computed(() => {
    const it = this.item();
    if (it.type !== 'kanji') {
      return [];
    }
    return (it.examples ?? [])
      .map((id) => this.kanji.item(id))
      .filter((v): v is CatalogItem => !!v)
      .slice(0, this.full() ? 40 : 8);
  });
  readonly madeOf = computed(() => {
    const it = this.item();
    return it.type === 'vocab'
      ? (it.kanji ?? []).map((c) => this.kanji.item(`k:${c}`)).filter((k): k is CatalogItem => !!k)
      : [];
  });
  /** A lesson's Context tab with nothing more to show. */
  readonly nothingMore = computed(() => this.context() && this.item().type === 'kanji' && !this.examples().length);

  play(v: CatalogItem): void {
    this.audio.play(v.audio);
  }
}
