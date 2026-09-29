import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { ActivatedRoute } from '@angular/router';
import { ApiService } from '../../core/api/api.service';
import { Tally } from '../../core/api/api.types';
import { fmtDate, fmtIn, pct } from '../../core/format';
import { KanjiScreenService } from '../kanji-screen.service';
import { KanjiStateService } from '../kanji-state.service';
import { ItemDetailsComponent } from '../shared/item-details/item-details.component';

/** One item: everything about it, its progress, and the answers the learner added for it. */
@Component({
  selector: 'app-item',
  imports: [ItemDetailsComponent],
  templateUrl: './item.component.html',
  styleUrl: './item.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ItemComponent {
  private readonly kanji = inject(KanjiStateService);
  private readonly api = inject(ApiService);
  private readonly screen = inject(KanjiScreenService);

  readonly id = inject(ActivatedRoute).snapshot.paramMap.get('id') ?? '';
  readonly it = computed(() => this.kanji.item(this.id));
  readonly st = computed(() => this.kanji.st(this.id));
  readonly stage = computed(() => this.st()?.stage || 0);
  readonly group = computed(() => (this.stage() ? this.kanji.groupOf(this.stage()) : 'none'));
  readonly stageName = computed(() => (this.stage() ? this.kanji.stageName(this.stage()) : 'Not learned'));
  readonly available = computed(() => {
    const it = this.it();
    return !!it && this.kanji.isAvailable(it);
  });
  readonly need = computed(() => (this.it()?.kanji ?? []).filter((c) => !this.kanji.isLearned(`k:${c}`)).join(' '));
  readonly synonyms = computed(() => this.st()?.synonyms ?? []);
  readonly extra = computed(() => this.st()?.extraReadings ?? []);
  readonly added = signal('');

  typeLabel(): string {
    const it = this.it();
    return it ? `${this.kanji.typeLabel(it)} · Lesson ${it.lesson}${it.type === 'kanji' ? ` · #${it.no}` : ''}` : '';
  }

  learnedAt(): string {
    return fmtDate(this.st()?.learnedAt);
  }

  nextReview(): string {
    const st = this.st();
    if (this.stage() === 9) {
      return 'Burned — no more reviews';
    }
    if (!st?.nextReview) {
      return '—';
    }
    const when = new Date(st.nextReview).toLocaleString('en-GB', { weekday: 'short', hour: '2-digit', minute: '2-digit' });
    return `${fmtIn(st.nextReview)} (${when})`;
  }

  accuracy(t: Tally | undefined): string {
    const c = t?.correct ?? 0;
    const i = t?.incorrect ?? 0;
    return c + i ? `${pct(c, c + i)}% (${c}/${c + i})` : '—';
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
    if (!it || !confirm(`Reset ${it.chars}? It goes back to "not learned"; your notes stay.`)) {
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
