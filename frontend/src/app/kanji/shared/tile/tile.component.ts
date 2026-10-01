import { ChangeDetectionStrategy, Component, computed, inject, input } from '@angular/core';
import { RouterLink } from '@angular/router';
import { CatalogItem } from '../../../core/api/api.types';
import { TranslationService } from '../../../core/i18n/translation.service';
import { KanjiStateService } from '../../kanji-state.service';

/**
 * A small tile of an item: its characters, coloured by type, edged by SRS
 * stage (outlined while not learned), linking to its page. The host takes no
 * room of its own, so the tile sits in its parent's row as it is.
 *
 * The characters are Japanese and the meaning English, whatever language the
 * page is in, and each says so itself: the link carries no `lang`.
 */
@Component({
  selector: 'app-tile',
  imports: [RouterLink],
  templateUrl: './tile.component.html',
  styleUrl: './tile.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class TileComponent {
  private readonly kanji = inject(KanjiStateService);
  private readonly i18n = inject(TranslationService);

  readonly item = input.required<CatalogItem>();
  readonly withMeaning = input(false);

  readonly stage = computed(() => this.kanji.stage(this.item().id));
  readonly classes = computed(() => {
    const st = this.stage();
    return `tile t-${this.item().type} g-${st ? this.kanji.groupOf(st) : 'none'}`;
  });
  /** The characters, the first meaning and the stage's own name — or, for an item with no stage, the app's "not learned". */
  readonly title = computed(() => {
    const it = this.item();
    const st = this.stage();
    return `${it.chars} — ${it.meanings[0]} · ${st ? this.kanji.stageName(st) : this.i18n.t('kanji.tileNotLearned')}`;
  });
}
