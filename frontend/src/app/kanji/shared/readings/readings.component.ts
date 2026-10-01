import { ChangeDetectionStrategy, Component, computed, inject, input } from '@angular/core';
import { AudioService } from '../../../core/audio.service';
import { CatalogItem } from '../../../core/api/api.types';
import { TranslatePipe } from '../../../core/i18n/translate.pipe';
import { KanjiStateService } from '../../kanji-state.service';

/** The readings of an item: on and kun for a kanji, the word's readings (and its voice) for vocabulary. */
@Component({
  selector: 'app-readings',
  imports: [TranslatePipe],
  templateUrl: './readings.component.html',
  styleUrl: './readings.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ReadingsComponent {
  private readonly kanji = inject(KanjiStateService);
  private readonly audio = inject(AudioService);

  readonly item = input.required<CatalogItem>();

  readonly extra = computed(() => this.kanji.st(this.item().id)?.extraReadings ?? []);
  readonly wordReadings = computed(() => [...this.item().readings, ...this.extra()].join('、'));

  listen(): void {
    this.audio.play(this.item().audio);
  }

  join(list: string[] | undefined): string {
    return (list ?? []).join('、') || '—';
  }
}
