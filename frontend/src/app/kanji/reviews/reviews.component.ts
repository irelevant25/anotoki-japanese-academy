import { ChangeDetectionStrategy, Component, inject, OnDestroy } from '@angular/core';
import { RouterLink } from '@angular/router';
import { CatalogItem } from '../../core/api/api.types';
import { fmtClock, fmtIn } from '../../core/format';
import { TranslatePipe } from '../../core/i18n/translate.pipe';
import { TranslationService } from '../../core/i18n/translation.service';
import { KanjiScreenService } from '../kanji-screen.service';
import { KanjiStateService } from '../kanji-state.service';
import { SessionComponent } from '../session/session.component';
import { SessionResult } from '../session/session-engine';

/** The reviews that are due, as a session — the only thing that moves items between SRS stages. */
@Component({
  selector: 'app-reviews',
  imports: [RouterLink, SessionComponent, TranslatePipe],
  templateUrl: './reviews.component.html',
  styleUrl: './reviews.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ReviewsComponent implements OnDestroy {
  private readonly kanji = inject(KanjiStateService);
  private readonly screen = inject(KanjiScreenService);
  private readonly i18n = inject(TranslationService);
  private destroyed = false;

  /** Taken when the screen opens: the queue of this session. */
  readonly due: CatalogItem[] = this.kanji.items().filter((it) => this.kanji.isDue(it.id, Date.now()));
  readonly summary = this.kanji.summary;

  /** When the next review comes, or '' when none is scheduled. Called from the template, so it follows the language. */
  next(): string {
    const at = this.summary()?.nextReviewAt;
    return at ? this.i18n.t('reviews.next', { when: fmtIn(this.i18n, at), clock: fmtClock(this.i18n, at) }) : '';
  }

  finished(result: SessionResult): void {
    void this.screen.finished(result, {}, () => !this.destroyed && this.screen.overlay() === null);
  }

  ngOnDestroy(): void {
    this.destroyed = true;
  }
}
