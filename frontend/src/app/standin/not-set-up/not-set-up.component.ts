import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { AuthService } from '../../core/auth/auth.service';
import { TranslationService } from '../../core/i18n/translation.service';
import { keptAround } from '../kept-around';
import { keptWord } from '../kept-word';

/**
 * The server answered 503 {"code": "not_set_up"}: this copy has no settings
 * yet (backend/config/*.local.php), or its database is missing or has no
 * tables. The setup page does both. To this computer the server may say why,
 * in a whole clause ("backend/config/database.local.php is missing").
 *
 * Its words cannot be asked for — the strings live in the database this page
 * is about — so each is the string the browser kept from an earlier visit, or
 * the English written here (keptWord()). The server's clause is English
 * whatever the page is in, and is marked so (`lang="en"`).
 */
@Component({
  selector: 'app-not-set-up',
  templateUrl: './not-set-up.component.html',
  styleUrl: './not-set-up.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class NotSetUpComponent {
  readonly auth = inject(AuthService);
  private readonly i18n = inject(TranslationService);

  readonly words = computed(() => ({
    title: keptWord(this.i18n, 'boot.notSetUp.title', 'Japanese Academy is not set up yet.'),
    text: keptWord(this.i18n, 'boot.notSetUp.text', 'Its settings or its database are missing, so there is nothing to study with.'),
    setup: keptWord(this.i18n, 'boot.notSetUp.setup', 'The setup page asks for the database and how people sign in, then builds everything the app needs.'),
    open: keptWord(this.i18n, 'boot.notSetUp.open', 'Open the setup page'),
  }));
  /** "Why: {reason}.", cut at the reason: the server's clause stands between the two halves, marked as English. */
  readonly why = computed(() => keptAround(this.i18n, 'boot.notSetUp.why', 'Why: {reason}.', 'reason'));
}
