import { ChangeDetectionStrategy, Component, ElementRef, computed, inject, viewChildren } from '@angular/core';
import { errorKey, errorParams, preferencesFailure } from '../../core/i18n/error-text';
import { TranslationService } from '../../core/i18n/translation.service';
import { ThemeMode, ThemeService } from '../../core/theme/theme.service';
import { keptWord } from '../../standin/kept-word';
import { IconComponent, IconName } from '../icon/icon.component';

/**
 * The switch's words in English, for a bar drawn with no strings (keptWord()):
 * the same text as the seeded English (backend/tests/unit/translations.test.php
 * holds the two together). The last five say why a choice could not be saved
 * to the account: the sentences every failed request has (errorKey()).
 */
const ENGLISH: Record<string, string> = {
  'theme.label': 'Theme',
  'theme.light': 'Light',
  'theme.dark': 'Dark',
  'theme.system': 'System',
  'theme.systemHint': 'As your device is set',
  'error.offline': 'The server does not answer.',
  'error.http': 'The server answered with an error ({status}).',
  'error.unknown': 'Something went wrong.',
  'error.sign_in_required': 'Sign in first.',
  'error.invalid_token': 'Sign in again.',
};

/** Each choice with the key of its name — a key and never the name: the language may change under it. */
const OPTIONS: { mode: ThemeMode; icon: IconName; key: string }[] = [
  { mode: 'light', icon: 'sun', key: 'theme.light' },
  { mode: 'dark', icon: 'moon', key: 'theme.dark' },
  { mode: 'system', icon: 'monitor', key: 'theme.system' },
];

/**
 * Light, dark or the system's, in the top bar: the anotoki family's switch
 * (the IAM's UI kit, as the survey has it), compact — three icons, each named
 * for a screen reader and in its tooltip.
 *
 * A radio group underneath (`role="radiogroup"`): one choice out of three, so
 * the arrow keys move the choice and Tab moves on past the group. Drawn in
 * every state, so its words have their English here too
 * (standin/kept-word.ts); in the admin area they read in English, as the
 * whole area does (TranslationService.pageLanguage).
 *
 * Signed in, a choice is the account's, for every anotoki site
 * (ThemeService). When the account refuses it, the page goes back to the
 * account's theme and a line under the switch says why, worded from the code
 * (core/i18n/error-text.ts), until the next choice, a click elsewhere or
 * Escape.
 */
@Component({
  selector: 'app-theme-toggle',
  imports: [IconComponent],
  templateUrl: './theme-toggle.component.html',
  styleUrl: './theme-toggle.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    '(document:click)': 'clickedElsewhere($event)',
    '(document:keydown.escape)': 'theme.refused.set(null)',
  },
})
export class ThemeToggleComponent {
  readonly theme = inject(ThemeService);
  private readonly i18n = inject(TranslationService);
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);
  private readonly buttons = viewChildren<ElementRef<HTMLButtonElement>>('option');

  /** Why the last choice could not be saved to the account, in the language on the page; '' while there is nothing to say. */
  readonly refusal = computed(() => {
    const code = this.theme.refused();
    if (code === null) {
      return '';
    }
    const failure = preferencesFailure(code);
    const key = errorKey(failure);
    return keptWord(this.i18n, key, ENGLISH[key] ?? ENGLISH['error.unknown'], errorParams(failure));
  });

  readonly label = computed(() => keptWord(this.i18n, 'theme.label', ENGLISH['theme.label']));
  readonly options = computed(() =>
    OPTIONS.map((option) => ({
      ...option,
      name: keptWord(this.i18n, option.key, ENGLISH[option.key]),
      hint: keptWord(this.i18n, option.mode === 'system' ? 'theme.systemHint' : option.key, ENGLISH[option.mode === 'system' ? 'theme.systemHint' : option.key]),
    })),
  );

  /** A click outside the switch puts its line away; one inside is a choice, which does so itself. */
  clickedElsewhere(event: MouseEvent): void {
    if (this.theme.refused() !== null && !this.host.nativeElement.contains(event.target as Node)) {
      this.theme.refused.set(null);
    }
  }

  /**
   * The arrow keys move the choice round the three, and the focus with it.
   * Escape puts the line away: the top bar keeps every key pressed in it
   * from `document`, so it is heard here.
   */
  keydown(event: KeyboardEvent): void {
    if (event.key === 'Escape') {
      this.theme.refused.set(null);
      return;
    }
    const step = event.key === 'ArrowRight' || event.key === 'ArrowDown' ? 1 : event.key === 'ArrowLeft' || event.key === 'ArrowUp' ? -1 : 0;
    if (!step) {
      return;
    }
    event.preventDefault();
    const index = OPTIONS.findIndex((option) => option.mode === this.theme.mode());
    const next = (index + step + OPTIONS.length) % OPTIONS.length;
    this.theme.set(OPTIONS[next].mode);
    this.buttons()[next]?.nativeElement.focus();
  }
}
