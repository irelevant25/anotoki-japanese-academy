import { DOCUMENT, Injectable, effect, inject, signal } from '@angular/core';

/** Light, dark, or as the device is set (`system`). */
export type ThemeMode = 'light' | 'dark' | 'system';

/** Shared with public/theme-boot.js, which applies the same choice before the app has loaded. */
export const THEME_KEY = 'academy-theme';

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
 * The choice is per device, in localStorage — it is about the screen, not the
 * person — and public/theme-boot.js reads the same key before the first
 * paint, so a dark choice never flashes light while the app loads. Storage
 * that refuses (a private window) only means the choice does not outlive the
 * page.
 */
@Injectable({ providedIn: 'root' })
export class ThemeService {
  private readonly document = inject(DOCUMENT);

  readonly mode = signal<ThemeMode>(storedMode());

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
  }

  set(mode: ThemeMode): void {
    this.mode.set(mode);
    try {
      if (mode === 'system') {
        globalThis.localStorage?.removeItem(THEME_KEY);
      } else {
        globalThis.localStorage?.setItem(THEME_KEY, mode);
      }
    } catch {
      // Storage refused: the choice holds for this page only.
    }
  }
}

function storedMode(): ThemeMode {
  let value: string | null = null;
  try {
    value = globalThis.localStorage?.getItem(THEME_KEY) ?? null;
  } catch {
    // no storage: the system decides
  }
  return value === 'light' || value === 'dark' ? value : 'system';
}
