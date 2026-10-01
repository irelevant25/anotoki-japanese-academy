import { ChangeDetectionStrategy, Component, computed, ElementRef, HostListener, inject, viewChild } from '@angular/core';
import { RouterLink } from '@angular/router';
import { keptAround } from '../../../standin/kept-around';
import { keptWord } from '../../../standin/kept-word';
import { TranslationService } from '../../i18n/translation.service';
import { menuKeydown } from '../../menu-keys';
import { AuthService } from '../auth.service';

/** The English of `account.signedInAs`, for a menu drawn with no strings: the same text as the seeded English. */
const SIGNED_IN_AS = 'Signed in as {name}';

/**
 * Who is signed in, top right (auth mode iam): their IAM account page, the
 * owner's Translations (English, only for the owner), and Sign out. It keeps its keys to itself, as the language chooser does
 * (core/menu-keys.ts): Enter on "Sign out" must not also submit a card.
 */
@Component({
  selector: 'app-account-menu',
  imports: [RouterLink],
  templateUrl: './account-menu.component.html',
  styleUrl: './account-menu.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AccountMenuComponent {
  readonly auth = inject(AuthService);
  private readonly i18n = inject(TranslationService);
  private readonly menu = viewChild.required<ElementRef<HTMLDetailsElement>>('menu');

  /** The name in the IAM, or the address; the app's own word for somebody who has neither. */
  readonly name = computed(() => this.auth.displayName() || keptWord(this.i18n, 'account.noName', 'Account'));
  readonly initial = computed(() => ([...this.name()][0] ?? '?').toUpperCase());
  readonly sub = computed(() => this.auth.user()?.sub ?? '');

  /**
   * The menu's words, in the language on the page. The top bar is drawn
   * whatever became of the strings, so each has its English here too
   * (standin/kept-word.ts).
   */
  readonly words = computed(() => ({
    signedInAs: keptWord(this.i18n, 'account.signedInAs', SIGNED_IN_AS, { name: this.name() }),
    userId: keptWord(this.i18n, 'account.userId', 'user {sub}', { sub: this.sub() }),
    yourAccount: keptWord(this.i18n, 'account.yourAccount', 'Your account'),
    signOut: keptWord(this.i18n, 'account.signOut', 'Sign out'),
  }));
  /** "Signed in as {name}", cut at the name: the menu draws it in bold between the two halves. */
  readonly who = computed(() => keptAround(this.i18n, 'account.signedInAs', SIGNED_IN_AS, 'name'));

  logout(): void {
    void this.auth.logout();
  }

  /** A page of the app was chosen in the menu: the menu closes behind it. */
  shut(): void {
    this.menu().nativeElement.open = false;
  }

  /** Every key pressed in the menu stops here: Escape and the arrows are the menu's, the rest the browser's. */
  keys(event: KeyboardEvent): void {
    menuKeydown(event, this.menu().nativeElement);
  }

  /** What happens elsewhere: the menu closes on a click outside it, and on Escape pressed outside it. */
  @HostListener('document:click', ['$event'])
  @HostListener('document:keydown', ['$event'])
  close(event: Event): void {
    const menu = this.menu().nativeElement;
    if (!menu.open) {
      return;
    }
    if (event instanceof KeyboardEvent ? event.key === 'Escape' : !menu.contains(event.target as Node)) {
      menu.open = false;
    }
  }
}
