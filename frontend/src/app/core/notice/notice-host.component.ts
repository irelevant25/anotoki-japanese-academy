import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { TranslationService } from '@anotoki/lib/translations';
import { ButtonComponent } from '@anotoki/lib/ui/button';
import { DialogComponent } from '@anotoki/lib/ui/dialog';
import { keptWord } from '../../standin/kept-word';
import { NoticeService } from './notice.service';

/**
 * The host's own word in English, for a notice drawn while the app has no
 * strings (keptWord()): the same text as the seeded English
 * (backend/tests/unit/translations.test.php holds the two together).
 */
const ENGLISH: Record<string, string> = {
  'common.ok': 'OK',
};

/**
 * Draws the notice NoticeService holds, if any: the kit's dialog (small), its
 * title the notice's, the sentence under it, the server's reason after it
 * where one came (small, English), and one button - OK, the focus on it, so a
 * stray Enter only closes it. Put once in the app's root, beside the kit's
 * <anotoki-confirm-host>.
 *
 * Like the foot and the top bar, it keeps every key pressed in it from
 * `document`, where the reviews and the exam listen: Enter on OK closes the
 * notice, and never hands a paper in. It is drawn in every state, so its word
 * has its English here too (keptWord()).
 */
@Component({
  selector: 'app-notice-host',
  imports: [ButtonComponent, DialogComponent],
  templateUrl: './notice-host.component.html',
  styleUrl: './notice-host.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { '(keydown)': '$event.stopPropagation()' },
})
export class NoticeHostComponent {
  protected readonly notice = inject(NoticeService);
  private readonly i18n = inject(TranslationService);

  /** The button's word, in the language on the page. */
  protected readonly ok = computed(() => keptWord(this.i18n, 'common.ok', ENGLISH['common.ok']));
}
