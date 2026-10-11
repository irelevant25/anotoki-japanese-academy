import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { TranslatePipe, TranslationService } from '@anotoki/lib/translations';
import { ButtonComponent } from '@anotoki/lib/ui/button';
import { AuthService } from '../../core/auth/auth.service';
import { SignInService } from '../../core/auth/sign-in.service';
import { VisitorKey } from '../../core/auth/visitor-key';

/**
 * What a visitor is told, at the top of the home page and the kanji
 * dashboard (docs/kb/sign-in.md, *Visitors*):
 *
 *   - while studying without signing in (AuthService state visiting): that
 *     what they study is kept for this browser for the server's days after
 *     their last visit, and that signing in keeps it in their account — with
 *     Sign in, which waits for the saves on their way first (SignInService);
 *   - once, when the key was forgotten because the server no longer knew it
 *     (VisitorKey.lost): deleted after the days unused, or moved into an
 *     account;
 *   - once, after a sign-in moved what this browser studied into the account
 *     (VisitorKey.moved): how much, and how much of it the account had
 *     already (its own progress stays for those).
 *
 * Each note closes; the notice stays while the page is a visitor's. Worded
 * here, from numbers and kinds, so it follows the language.
 */
@Component({
  selector: 'app-visitor-notice',
  imports: [ButtonComponent, TranslatePipe],
  templateUrl: './visitor-notice.component.html',
  styleUrl: './visitor-notice.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class VisitorNoticeComponent {
  readonly auth = inject(AuthService);
  readonly visitor = inject(VisitorKey);
  readonly signInFlow = inject(SignInService);
  private readonly i18n = inject(TranslationService);

  /** The notice, in the language on the page: the server's days, in the plural form they take. */
  readonly notice = computed(() => (this.auth.visiting() ? this.i18n.plural('visitor.notice', this.auth.visitorKeepDays()) : ''));

  /** What moved into the account, and what of it the account had already. */
  readonly moved = computed(() => {
    const move = this.visitor.moved();
    if (!move) {
      return null;
    }
    return {
      moved: this.i18n.t('visitor.moved', { items: this.i18n.number(move.items), attempts: this.i18n.number(move.attempts) }),
      kept: move.kept > 0 ? this.i18n.t('visitor.movedKept', { kept: this.i18n.number(move.kept) }) : '',
    };
  });

  signIn(): void {
    void this.signInFlow.signIn();
  }
}
