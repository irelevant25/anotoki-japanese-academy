import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { TranslationService } from '@anotoki/lib/translations';
import { BadgeComponent } from '@anotoki/lib/ui/badge';
import { DialogComponent } from '@anotoki/lib/ui/dialog';
import { keptWord } from '../../standin/kept-word';
import { LocalDatePipe } from '../i18n/local-date.pipe';
import { ChangelogService } from './changelog.service';

/**
 * What changed, release by release, over the page: the kit's dialog (Escape,
 * its Close and the backdrop close it; the focus goes in and comes back), made
 * while it is open.
 *
 * Its frame is in the language on the page — the heading, "latest", the three
 * kinds of change, the dates; its Close is the kit's, in the kit's words. The
 * entries themselves are written in English (public/changelog.json) and stay
 * so, marked `lang="en"`. It opens from the foot of the page in every state, so
 * the frame's words have their English here too (standin/kept-word.ts).
 */
@Component({
  selector: 'app-changelog-dialog',
  imports: [BadgeComponent, DialogComponent, LocalDatePipe],
  templateUrl: './changelog-dialog.component.html',
  styleUrl: './changelog-dialog.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ChangelogDialogComponent {
  readonly changelog = inject(ChangelogService);
  private readonly i18n = inject(TranslationService);
  /** Open: the dialog is drawn (the kit's dialog opens itself as it appears, and is gone when it closes). */
  readonly shown = signal(false);

  /** The frame's words, in the language on the page. */
  readonly words = computed(() => ({
    title: keptWord(this.i18n, 'whatsNew.title', 'What’s new'),
    latest: keptWord(this.i18n, 'whatsNew.latest', 'latest'),
    added: keptWord(this.i18n, 'whatsNew.added', 'Added'),
    changed: keptWord(this.i18n, 'whatsNew.changed', 'Changed'),
    fixed: keptWord(this.i18n, 'whatsNew.fixed', 'Fixed'),
  }));

  open(): void {
    this.changelog.markSeen();
    this.shown.set(true);
  }

  close(): void {
    this.shown.set(false);
  }
}
