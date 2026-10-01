import { ChangeDetectionStrategy, Component, computed, ElementRef, HostListener, inject, signal, viewChild } from '@angular/core';
import { menuKeydown } from '../../menu-keys';
import { TranslatePipe } from '../translate.pipe';
import { TranslationService } from '../translation.service';

/**
 * The language the app is read in: one small pill beside the version, with
 * the current language's code ("SK"), opening a menu of the languages on
 * offer, each under the name its own speakers give it. Drawn in every state
 * and with or without sign-in — and not at all while fewer than two languages
 * are on offer (which is also the case while there are no strings).
 *
 * Built like the account menu: a `<details>` with the `.umenu` looks. Each
 * item says which language its own name is in (`lang`), so a screen reader
 * pronounces "Slovenčina" as Slovak; the one in use is marked (`aria-current`).
 *
 * It keeps its keys to itself (core/menu-keys.ts): the lesson quiz, the
 * reviews and the exam listen on `document`, and Enter on a language must not
 * submit a card or finish a paper. Switching changes words only — no screen is
 * made again, so a session or a paper goes on where it was.
 */
@Component({
  selector: 'app-language-chooser',
  imports: [TranslatePipe],
  templateUrl: './language-chooser.component.html',
  styleUrl: './language-chooser.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class LanguageChooserComponent {
  readonly i18n = inject(TranslationService);
  private readonly menu = viewChild<ElementRef<HTMLDetailsElement>>('menu');

  /** The chosen language's strings are on their way. */
  readonly switching = signal(false);
  /** The last choice could not be loaded: the menu says so, and the page stays as it was. */
  readonly failed = signal(false);

  readonly code = computed(() => this.i18n.language().toUpperCase());
  /** The button's name: "Language: Slovenčina" — the language as its speakers write it; its code while the list does not name it. */
  readonly label = computed(() => {
    const code = this.i18n.language();
    const name = this.i18n.languages().find((language) => language.code === code)?.nativeName ?? code.toUpperCase();
    return this.i18n.t('language.button', { name });
  });

  /** Counts the choices made: only the last one's answer is acted on. */
  private choice = 0;

  /**
   * Switches once the language's strings have come, then closes the menu; says
   * so in the menu when they could not be had, and stays as it was.
   *
   * The last choice wins. The menu stays usable while a language is on its
   * way, so somebody may change their mind — back to the language on the page
   * too, which is then a choice like any other and is handed to the service
   * (it drops the one on its way). Only the last choice's answer is listened
   * to: an earlier one comes back false for having been overtaken, and that
   * is nothing to tell anybody.
   */
  async choose(code: string): Promise<void> {
    this.failed.set(false);
    if (code === this.i18n.language() && !this.switching()) {
      this.close(true);
      return;
    }
    const mine = ++this.choice;
    this.switching.set(true);
    const switched = await this.i18n.setLanguage(code);
    if (mine !== this.choice) {
      return;
    }
    this.switching.set(false);
    if (switched) {
      this.close(true);
      return;
    }
    // Shown where the choice was made, even when the menu was closed meanwhile.
    this.failed.set(true);
    const menu = this.menu()?.nativeElement;
    if (menu) {
      menu.open = true;
    }
  }

  /** Every key pressed in the menu stops here: Escape and the arrows are the menu's, the rest the browser's. */
  keys(event: KeyboardEvent): void {
    const menu = this.menu()?.nativeElement;
    if (!menu) {
      return;
    }
    menuKeydown(event, menu);
    if (!menu.open) {
      this.failed.set(false);
    }
  }

  /** What happens elsewhere: a click outside the menu, or Escape pressed outside it, closes it. */
  @HostListener('document:click', ['$event'])
  @HostListener('document:keydown', ['$event'])
  elsewhere(event: Event): void {
    const menu = this.menu()?.nativeElement;
    if (!menu?.open) {
      return;
    }
    if (event instanceof KeyboardEvent ? event.key === 'Escape' : !menu.contains(event.target as Node)) {
      this.close(false);
    }
  }

  private close(returnFocus: boolean): void {
    const menu = this.menu()?.nativeElement;
    if (!menu) {
      return;
    }
    menu.open = false;
    this.failed.set(false);
    if (returnFocus) {
      menu.querySelector<HTMLElement>('summary')?.focus();
    }
  }
}
