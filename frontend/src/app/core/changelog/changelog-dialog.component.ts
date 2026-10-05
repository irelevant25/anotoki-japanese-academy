import { ChangeDetectionStrategy, Component, computed, ElementRef, inject, viewChild } from '@angular/core';
import { keptWord } from '../../standin/kept-word';
import { LocalDatePipe } from '../i18n/local-date.pipe';
import { TranslationService } from '../i18n/translation.service';
import { ChangelogService } from './changelog.service';

/**
 * What changed, release by release, over the page (a native dialog: Escape and the backdrop close it).
 *
 * Its frame is in the language on the page — the heading, Close, "latest", the
 * three kinds of change, the dates. The entries themselves are written in
 * English (public/changelog.json) and stay so, marked `lang="en"`. It opens
 * from the foot of the page in every state, so the frame's words have their English
 * here too (standin/kept-word.ts).
 */
@Component({
  selector: 'app-changelog-dialog',
  imports: [LocalDatePipe],
  templateUrl: './changelog-dialog.component.html',
  styleUrl: './changelog-dialog.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ChangelogDialogComponent {
  readonly changelog = inject(ChangelogService);
  private readonly i18n = inject(TranslationService);
  private readonly dialog = viewChild.required<ElementRef<HTMLDialogElement>>('dialog');

  /** The frame's words, in the language on the page. */
  readonly words = computed(() => ({
    title: keptWord(this.i18n, 'whatsNew.title', 'What’s new'),
    close: keptWord(this.i18n, 'common.close', 'Close'),
    latest: keptWord(this.i18n, 'whatsNew.latest', 'latest'),
    added: keptWord(this.i18n, 'whatsNew.added', 'Added'),
    changed: keptWord(this.i18n, 'whatsNew.changed', 'Changed'),
    fixed: keptWord(this.i18n, 'whatsNew.fixed', 'Fixed'),
  }));

  open(): void {
    this.changelog.markSeen();
    this.dialog().nativeElement.showModal();
  }

  close(): void {
    this.dialog().nativeElement.close();
  }

  /** A click on the backdrop (the dialog itself, outside its box) closes it. */
  backdrop(event: MouseEvent): void {
    if (event.target === this.dialog().nativeElement) {
      this.close();
    }
  }
}
