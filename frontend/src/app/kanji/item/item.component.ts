import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { ActivatedRoute } from '@angular/router';
import { ApiService } from '../../core/api/api.service';
import { Tally } from '../../core/api/api.types';
import { fmtDate, fmtIn, fmtWeekdayClock, pct } from '../../core/format';
import { TranslatePipe } from '../../core/i18n/translate.pipe';
import { TranslationService } from '../../core/i18n/translation.service';
import { KanjiScreenService } from '../kanji-screen.service';
import { KanjiStateService } from '../kanji-state.service';
import { ItemDetailsComponent } from '../shared/item-details/item-details.component';
import { Part, wordedParts } from '../shared/worded/worded-parts';
import { WordedComponent } from '../shared/worded/worded.component';

/** One item: everything about it, its progress, and the answers the learner added for it. */
@Component({
  selector: 'app-item',
  imports: [ItemDetailsComponent, TranslatePipe, WordedComponent],
  templateUrl: './item.component.html',
  styleUrl: './item.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ItemComponent {
  private readonly kanji = inject(KanjiStateService);
  private readonly api = inject(ApiService);
  private readonly screen = inject(KanjiScreenService);
  private readonly i18n = inject(TranslationService);

  readonly id = inject(ActivatedRoute).snapshot.paramMap.get('id') ?? '';
  readonly it = computed(() => this.kanji.item(this.id));
  readonly st = computed(() => this.kanji.st(this.id));
  readonly stage = computed(() => this.st()?.stage || 0);
  readonly group = computed(() => (this.stage() ? this.kanji.groupOf(this.stage()) : 'none'));
  /**
   * The stage's own name, from the catalog — English in every language; null
   * for an item with no stage, where the page says "Not learned" in its own
   * words (stage 0's name is never drawn).
   */
  readonly stageName = computed(() => (this.stage() ? this.kanji.stageName(this.stage()) : null));
  readonly available = computed(() => {
    const it = this.it();
    return !!it && this.kanji.isAvailable(it);
  });
  /** "Learn its kanji first: 大 学" — the kanji still to learn are Japanese, and say so. */
  readonly kanjiFirst = computed(() => {
    const need = (this.it()?.kanji ?? []).filter((c) => !this.kanji.isLearned(`k:${c}`)).join(' ');
    return wordedParts(this.i18n, 'item.kanjiFirst', { need: { text: need, lang: 'ja' } });
  });
  readonly synonyms = computed(() => this.st()?.synonyms ?? []);
  readonly extra = computed(() => this.st()?.extraReadings ?? []);
  readonly added = signal('');

  /** The key of the item's type, for the line under its characters. */
  readonly typeKey = computed(() => {
    const it = this.it();
    return it ? this.kanji.typeKey(it) : '';
  });

  learnedAt(): string {
    return fmtDate(this.i18n, this.st()?.learnedAt);
  }

  /** When the next review comes — or that there is none, with the last stage's own name. */
  readonly nextReview = computed<Part[]>(() => {
    const st = this.st();
    if (this.stage() === 9) {
      return wordedParts(this.i18n, 'item.noMoreReviews', { stage: { text: this.kanji.stageName(9), lang: 'en' } });
    }
    if (!st?.nextReview) {
      return [{ text: '—', lang: null }];
    }
    return [{ text: `${fmtIn(this.i18n, st.nextReview)} (${fmtWeekdayClock(this.i18n, st.nextReview)})`, lang: null }];
  });

  /** Called from the template, so it follows the language. */
  accuracy(t: Tally | undefined): string {
    const c = t?.correct ?? 0;
    const i = t?.incorrect ?? 0;
    return c + i ? this.i18n.t('item.accuracy', { pct: pct(c, c + i), right: c, total: c + i }) : '—';
  }

  practise(): void {
    const it = this.it();
    if (it) {
      this.screen.practice([it]);
    }
  }

  learn(): void {
    const it = this.it();
    if (it) {
      this.screen.startLessons([it]);
    }
  }

  async reset(): Promise<void> {
    const it = this.it();
    // The browser's own dialog, worded at the moment it is raised, in the language on the page.
    if (!it || !confirm(this.i18n.t('item.confirmReset', { chars: it.chars }))) {
      return;
    }
    const r = await this.api.resetItem(it.id);
    this.kanji.setItemState(it.id, r.state);
    await this.screen.redraw();
  }

  async removeSynonym(x: string): Promise<void> {
    const r = await this.api.item(this.id, { removeSynonym: x });
    this.kanji.setItemState(this.id, r.state);
  }

  async removeReading(x: string): Promise<void> {
    const r = await this.api.item(this.id, { removeReading: x });
    this.kanji.setItemState(this.id, r.state);
  }

  async addSynonym(): Promise<void> {
    const text = this.added().trim();
    if (!text) {
      return;
    }
    const r = await this.api.item(this.id, { addSynonym: text });
    this.kanji.setItemState(this.id, r.state);
    this.added.set('');
  }
}
