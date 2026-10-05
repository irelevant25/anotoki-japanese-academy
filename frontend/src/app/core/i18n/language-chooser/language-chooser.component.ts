import { afterNextRender, ChangeDetectionStrategy, Component, computed, ElementRef, inject, Injector, signal, viewChild } from '@angular/core';
import { keptWord } from '../../../standin/kept-word';
import { IconComponent } from '../../../ui/icon/icon.component';
import { TranslationService } from '../translation.service';

/** The chooser's words in English, for a bar drawn with no strings (keptWord()): the same text as the seeded English. */
const ENGLISH: Record<string, string> = {
  'language.button': 'Language: {name} ({code})',
  'language.notLoaded': 'The language could not be loaded. Try again.',
};

/**
 * The language the app is read in, in the top bar: one round button with the
 * current language's code ("SK"), opening a menu of the languages on offer,
 * each under the name its own speakers give it — the anotoki family's chooser
 * (the IAM's UI kit, as the survey has it). Not drawn while fewer than two
 * languages are on offer (which is also the case while there are no strings),
 * nor in the admin area, which is English (the top bar decides).
 *
 * A menu button like the person's menu beside it: the focus goes to the
 * language in use when it opens; the arrow keys, Home and End move between
 * the languages (`menuitemradio`, one choice out of a few); Escape and a click
 * outside close it, Escape with the focus back on the button; Tab and
 * Shift+Tab close it with the focus on the button too, so the next Tab moves
 * on from there and never falls to <body>. Each item says which language its
 * own name is in (`lang`), so a screen reader pronounces "Slovenčina" as
 * Slovak.
 *
 * The button's name holds the code it shows ("Jazyk: Slovenčina (SK)"):
 * somebody who speaks to their computer says "click SK" (WCAG 2.5.3, Label in
 * Name).
 *
 * It keeps its keys to itself: the lesson quiz, the reviews and the exam
 * listen on `document`, and Enter on a language must not submit a card or
 * finish a paper (the top bar stops every key of its own the same way).
 * Switching changes words only — no screen is made again, so a session or a
 * paper goes on where it was.
 */
@Component({
  selector: 'app-language-chooser',
  imports: [IconComponent],
  templateUrl: './language-chooser.component.html',
  styleUrl: './language-chooser.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    '(keydown)': 'keydown($event)',
    '(document:click)': 'clickedElsewhere($event)',
    '(document:keydown.escape)': 'close(true)',
  },
})
export class LanguageChooserComponent {
  readonly i18n = inject(TranslationService);
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);
  private readonly injector = inject(Injector);
  private readonly button = viewChild<ElementRef<HTMLButtonElement>>('button');
  private readonly menu = viewChild<ElementRef<HTMLElement>>('menu');

  readonly open = signal(false);
  /** The chosen language's strings are on their way. */
  readonly switching = signal(false);
  /** The last choice could not be loaded: the menu says so, and the page stays as it was. */
  readonly failed = signal(false);

  readonly code = computed(() => this.i18n.language().toUpperCase());
  /** The button's name: "Language: Slovenčina (SK)" — the language as its speakers write it (its code while the list does not name it), and the code the button shows. */
  readonly label = computed(() => {
    const code = this.i18n.language();
    const name = this.i18n.languages().find((language) => language.code === code)?.nativeName ?? code.toUpperCase();
    return keptWord(this.i18n, 'language.button', ENGLISH['language.button'], { name, code: code.toUpperCase() });
  });
  readonly notLoaded = computed(() => keptWord(this.i18n, 'language.notLoaded', ENGLISH['language.notLoaded']));

  /** Counts the choices made: only the last one's answer is acted on. */
  private choice = 0;

  toggle(): void {
    if (this.open()) {
      this.close(true);
      return;
    }
    this.failed.set(false);
    this.open.set(true);
    // Into the menu once it is drawn, onto the language in use. Drawn means
    // after the next render: with no zone, a microtask runs before it.
    afterNextRender(
      () => {
        const items = this.items();
        (items.find((item) => item.getAttribute('aria-checked') === 'true') ?? items[0])?.focus();
      },
      { injector: this.injector },
    );
  }

  /** Closes the menu; `returnFocus`: back to the button (Escape, Tab, a choice made). */
  close(returnFocus: boolean): void {
    if (!this.open()) {
      return;
    }
    this.open.set(false);
    this.failed.set(false);
    if (returnFocus) {
      this.button()?.nativeElement.focus();
    }
  }

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
    this.open.set(true);
    this.failed.set(true);
  }

  /** The menu's own keys: the arrows, Home and End between the languages; Escape and Tab close it, the focus on the button. */
  menuKeydown(event: KeyboardEvent): void {
    const items = this.items();
    const index = items.indexOf(document.activeElement as HTMLElement);
    let next = -1;
    if (event.key === 'ArrowDown') {
      next = (index + 1) % items.length;
    } else if (event.key === 'ArrowUp') {
      next = (index - 1 + items.length) % items.length;
    } else if (event.key === 'Home') {
      next = 0;
    } else if (event.key === 'End') {
      next = items.length - 1;
    } else if (event.key === 'Escape' || event.key === 'Tab') {
      // Tab (or Shift+Tab) leaves the menu from its button. Left to the browser,
      // the focus would move to the next item of a menu still drawn — with no
      // zone it is removed only at the next render — and then fall to <body>.
      event.preventDefault();
      this.close(true);
      return;
    }
    if (next >= 0 && items.length) {
      event.preventDefault();
      items[next]?.focus();
    }
  }

  /**
   * Every key pressed in the chooser stops here, so none reaches the page's
   * own listeners on `document` — which is why Escape is handled here too: a
   * document listener would never hear it.
   */
  keydown(event: KeyboardEvent): void {
    event.stopPropagation();
    if (event.key === 'Escape') {
      this.close(true);
    }
  }

  /** A click anywhere outside the chooser closes it, the focus left where it is. */
  clickedElsewhere(event: MouseEvent): void {
    if (this.open() && !this.host.nativeElement.contains(event.target as Node)) {
      this.close(false);
    }
  }

  private items(): HTMLElement[] {
    const menu = this.menu()?.nativeElement;
    return menu ? Array.from(menu.querySelectorAll<HTMLElement>('[role="menuitemradio"]')) : [];
  }
}
