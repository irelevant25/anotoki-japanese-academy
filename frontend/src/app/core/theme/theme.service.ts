import { DOCUMENT, Injectable, computed, effect, inject, signal, untracked } from '@angular/core';
import { AuthService } from '../auth/auth.service';
import type { AnotokiTheme } from '../auth/sdk/anotoki-auth';
import { readStorage, writeStorage } from '../storage';

/** Light, dark, or as the device is set (`system`). */
export type ThemeMode = 'light' | 'dark' | 'system';

/** Shared with public/theme-boot.js, which applies the same choice before the app has loaded. */
export const THEME_KEY = 'academy-theme';

/** Each choice in the account's words: the IAM's `auto` is this app's `system`. */
const ACCOUNT_THEME: Record<ThemeMode, AnotokiTheme> = { light: 'light', dark: 'dark', system: 'auto' };

/**
 * Light, dark, or whatever the device says — the anotoki family's switch, in
 * the top bar.
 *
 * A choice of light or dark is written to `<html data-theme>`, which the
 * tokens key on (styles/_tokens.scss: the dark tokens under
 * `:root[data-theme='dark']`, and under `prefers-color-scheme: dark` unless
 * the page says light). The system's choice is no attribute at all: the
 * media query decides, and follows the device while the page is open.
 *
 * Signed in, the theme is the account's (the owner's decision of 2026-10-06
 * for every anotoki site): one choice every site follows, on every page —
 * the admin panel too —, taken from the account at sign-in and whenever it
 * changes (a choice on another site, or in another tab), and saved to it
 * from the switch here. Nobody signed in, a visitor, or an IAM that sends no
 * preferences: this device's, as it always was. Either way the theme shown
 * is kept in localStorage, where public/theme-boot.js reads it before the
 * first paint, so a dark choice never flashes light while the app and the
 * account load. Storage that refuses (a private window) only means the
 * choice does not outlive the page.
 */
@Injectable({ providedIn: 'root' })
export class ThemeService {
  private readonly document = inject(DOCUMENT);
  private readonly auth = inject(AuthService);

  readonly mode = signal<ThemeMode>(storedMode());
  /**
   * Why the account refused the last choice — the code of the IAM or its SDK,
   * which the switch words (core/i18n/error-text.ts) — or null. The page
   * shows the account's theme again meanwhile.
   */
  readonly refused = signal<string | null>(null);

  /** The account's theme, as a mode, while the IAM gives one for whoever is signed in; null otherwise. */
  private readonly accountMode = computed(() => modeOf(this.auth.preferences()?.theme));

  /** A theme save is on its way. */
  private saving = false;
  /** The latest theme chosen while it is: saved once it settles. */
  private next: ThemeMode | null = null;

  constructor() {
    effect(() => {
      const mode = this.mode();
      const root = this.document.documentElement;
      if (mode === 'system') {
        root.removeAttribute('data-theme');
        root.style.removeProperty('color-scheme');
      } else {
        root.setAttribute('data-theme', mode);
        // The browser's own controls (a scroll bar, a file picker) in the same theme.
        root.style.colorScheme = mode;
      }
    });
    // The account's theme, the moment it is known: at sign-in, and whenever
    // the account is read again. Not while a choice made here is still being
    // saved: the account answers with the earlier one first, and the page
    // would flick back to it. No account any more (signed out in another tab,
    // the IAM's idle limit): what was said of a refused save goes with it.
    effect(() => {
      const account = this.accountMode();
      untracked(() => {
        if (account === null) {
          this.refused.set(null);
        } else if (!this.saving) {
          this.show(account);
        }
      });
    });
  }

  /**
   * The person's choice: shown at once and, while the account has a theme,
   * saved to it, so every anotoki site follows.
   *
   * One save at a time, and the latest choice is the one saved: two saves in
   * flight together could be handled in either order and leave the account
   * on a theme the page no longer shows. A save that is refused puts the
   * account's theme back on the screen, and `refused` says why.
   */
  set(mode: ThemeMode): void {
    this.refused.set(null);
    this.show(mode);
    if (this.saving) {
      this.next = mode;
      return;
    }
    this.save(mode);
  }

  private save(mode: ThemeMode): void {
    const account = this.accountMode();
    if (account === null || account === mode) {
      return;
    }
    this.saving = true;
    /** The save is over: the next choice, if one waits, is saved now — and then this one's refusal is not news. */
    const settle = (): boolean => {
      const next = this.next;
      this.saving = false;
      this.next = null;
      if (next !== null) {
        this.save(next);
      }
      return next !== null;
    };
    this.auth.savePreferences({ theme: ACCOUNT_THEME[mode] }).then(
      () => void settle(),
      (error: unknown) => {
        // A choice waiting is saved now, and makes this refusal no news; so
        // does an account gone meanwhile: there is no theme of it to put back.
        const current = this.accountMode();
        if (settle() || current === null) {
          return;
        }
        this.show(current);
        const code = (error as { code?: unknown } | null)?.code;
        this.refused.set(typeof code === 'string' && code !== '' ? code : 'unknown');
      },
    );
  }

  private show(mode: ThemeMode): void {
    this.mode.set(mode);
    writeStorage(THEME_KEY, mode === 'system' ? null : mode);
  }
}

function storedMode(): ThemeMode {
  const value = readStorage(THEME_KEY);
  return value === 'light' || value === 'dark' ? value : 'system';
}

/** The account's theme as this app's mode (`auto` is the system's); null for none. */
function modeOf(theme: AnotokiTheme | null | undefined): ThemeMode | null {
  if (theme === 'light' || theme === 'dark') {
    return theme;
  }
  return theme === 'auto' ? 'system' : null;
}
