import { ChangeDetectionStrategy, Component, computed, inject, OnInit, viewChild } from '@angular/core';
import { keptWord } from '../../standin/kept-word';
import { TranslationService } from '../i18n/translation.service';
import { ChangelogDialogComponent } from './changelog-dialog.component';
import { ChangelogService } from './changelog.service';

/**
 * The foot of every page: the app's version, and "What's new", which opens
 * what changed in it (a dot beside it until the news of this version has been
 * opened). It stood beside the app's name in the old top bar; the anotoki
 * family's bar holds the same things on every site, and the version and its
 * news are at the foot of each (AppComponent draws it).
 *
 * It is drawn in every state — also while the app has no strings — so its
 * words have their English here too (standin/kept-word.ts).
 *
 * Like the top bar, it keeps every key pressed in it — on "What's new", in
 * the open dialog — from `document`, where the reviews and the exam listen:
 * Enter there opens or closes the news, never hands a paper in. (Only the
 * event's way up is stopped: a button's Enter and the dialog's Escape still
 * do their own work.)
 */
@Component({
  selector: 'app-version',
  imports: [ChangelogDialogComponent],
  templateUrl: './app-version.component.html',
  styleUrl: './app-version.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { '(keydown)': '$event.stopPropagation()' },
})
export class AppVersionComponent implements OnInit {
  readonly changelog = inject(ChangelogService);
  private readonly i18n = inject(TranslationService);
  private readonly dialog = viewChild.required(ChangelogDialogComponent);

  /** The button's words and its dot's tooltip, in the language on the page. */
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
