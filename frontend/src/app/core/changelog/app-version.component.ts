import { ChangeDetectionStrategy, Component, computed, inject, OnInit, viewChild } from '@angular/core';
import { keptWord } from '../../standin/kept-word';
import { TranslationService } from '../i18n/translation.service';
import { ChangelogDialogComponent } from './changelog-dialog.component';
import { ChangelogService } from './changelog.service';

/**
 * The app's version, beside its name in the top bar, which opens what changed
 * in it. It sat at the foot of the page once, where a long page hid it below
 * the fold and a short one left it small and far from anything anybody looks at.
 *
 * It is drawn in every state — also while the app has no strings — so its
 * words have their English here too (standin/kept-word.ts).
 */
@Component({
  selector: 'app-version',
  imports: [ChangelogDialogComponent],
  templateUrl: './app-version.component.html',
  styleUrl: './app-version.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AppVersionComponent implements OnInit {
  readonly changelog = inject(ChangelogService);
  private readonly i18n = inject(TranslationService);
  private readonly dialog = viewChild.required(ChangelogDialogComponent);

  /** The button's two tooltips, in the language on the page. */
  readonly words = computed(() => ({
    title: keptWord(this.i18n, 'whatsNew.title', 'What’s new'),
    unseen: keptWord(this.i18n, 'whatsNew.unseen', 'Something new'),
  }));

  ngOnInit(): void {
    void this.changelog.load();
  }

  open(): void {
    this.dialog().open();
  }
}
