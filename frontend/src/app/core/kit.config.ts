import { EnvironmentProviders, InjectionToken, Injector, WritableSignal, inject, makeEnvironmentProviders, signal } from '@angular/core';
import { AnotokiShellConfig, provideAnotokiShell } from '@anotoki/lib/shell';
import { AnotokiUiConfig, AnotokiWordKey, provideAnotokiUi } from '@anotoki/lib/ui';
import { keptWord } from '../standin/kept-word';
import { AuthService } from './auth/auth.service';
import { errorKey, errorParams, preferencesFailure } from './i18n/error-text';
import { TranslationService } from './i18n/translation.service';

/** Shared with the kit's theme-boot.js (its data-storage-key in index.html): this device's light or dark, before the first paint. */
export const THEME_KEY = 'academy-theme';

/**
 * The words below in English, for a page drawn with no strings (keptWord()):
 * the same text as the seeded English (backend/tests/unit/translations.test.php
 * holds the two together). The last five say why a theme could not be saved to
 * the account: the sentences every failed request has (errorKey()).
 */
const ENGLISH: Record<string, string> = {
  'topbar.sections': 'The app’s sections',
  'topbar.phoneMenu': 'Menu',
  'topbar.menuButton': 'Your menu: {name}',
  'topbar.menu': 'Your menu',
  'topbar.roleAdmin': 'Administrator',
  'topbar.roleEditor': 'Editor',
  'topbar.admin': 'Admin panel',
  'account.yourAccount': 'Your anotoki account',
  'account.signOut': 'Sign out',
  'signOut.saving': 'Saving…',
  'signIn.button': 'Sign in',
  'language.button': 'Language: {name} ({code})',
  'language.notLoaded': 'The language could not be loaded. Try again.',
  'theme.label': 'Theme',
  'theme.light': 'Light',
  'theme.dark': 'Dark',
  'theme.system': 'System',
  'theme.systemHint': 'As your device is set',
  'common.close': 'Close',
  'error.offline': 'The server does not answer.',
  'error.http': 'The server answered with an error ({status}).',
  'error.unknown': 'Something went wrong.',
  'error.sign_in_required': 'Sign in first.',
  'error.invalid_token': 'Sign in again.',
};

/**
 * The words of the anotoki library's kit (@anotoki/lib/ui and /shell: the top
 * bar, the theme switch, the language switcher, the dialogs) that this app has
 * words of its own for - in its database, which the owner rewords in the admin
 * panel: the kit says the app's. By the kit's key, split at its dot (the kit's
 * `topbar.account` is `topbar` → `account`), so that only the app's keys are
 * written here as whole keys - the key scan holds every one of them to the
 * database (backend/tools/translation_keys.php). The kit's theme switch says
 * `theme.notSaved` when the account refused a choice: this app says why
 * (themeRefusal()), as its own switch did.
 */
const APP_KEYS: Readonly<Record<string, Readonly<Record<string, string>>>> = {
  topbar: {
    sections: 'topbar.sections',
    phoneMenu: 'topbar.phoneMenu',
    menuButton: 'topbar.menuButton',
    menu: 'topbar.menu',
    roleAdmin: 'topbar.roleAdmin',
    roleEditor: 'topbar.roleEditor',
    account: 'account.yourAccount',
    admin: 'topbar.admin',
    signIn: 'signIn.button',
    signOut: 'account.signOut',
    saving: 'signOut.saving',
  },
  language: {
    button: 'language.button',
    notLoaded: 'language.notLoaded',
  },
  theme: {
    label: 'theme.label',
    light: 'theme.light',
    dark: 'theme.dark',
    auto: 'theme.system',
    autoHint: 'theme.systemHint',
  },
  ui: {
    close: 'common.close',
  },
};

/**
 * Why the account refused the last theme chosen: the code the IAM or its SDK
 * rejected the save with, which the kit's note under the theme switch words
 * (themeRefusal()). The kit's ThemeService knows only that it was refused.
 */
const THEME_REFUSAL = new InjectionToken<WritableSignal<string | null>>('why the account refused the last theme', {
  providedIn: 'root',
  factory: () => signal<string | null>(null),
});

/**
 * The app's string for a word of the kit, in the language on the page (the
 * admin panel's English there: TranslationService.pageLanguage), or its
 * English while there are no strings; null for a word the app has none of:
 * the kit's own, built in for English and Slovak ("ty", as this app speaks).
 * Read in the kit's computed()s, so the kit follows the strings and the
 * language as they change.
 */
function appWord(i18n: TranslationService, refusal: () => string | null, key: AnotokiWordKey): string | null {
  const [area, name] = key.split('.');
  if (area === 'theme' && name === 'notSaved') {
    // Read here alone: a refusal coming in words this one note again, not every word of the kit.
    const code = refusal();
    return code === null ? null : themeRefusal(i18n, code);
  }
  const appKey = APP_KEYS[area]?.[name];
  return appKey ? keptWord(i18n, appKey, ENGLISH[appKey]) : null;
}

/** Why a theme could not be saved, worded from the code (core/i18n/error-text.ts) - never the IAM's sentence. */
function themeRefusal(i18n: TranslationService, code: string): string {
  const failure = preferencesFailure(code);
  const key = errorKey(failure);
  return keptWord(i18n, key, ENGLISH[key] ?? ENGLISH['error.unknown'], errorParams(failure));
}

/** A refusal's code, as the SDK rejects a save (an Error with its code); 'unknown' when it has none. */
function codeOf(error: unknown): string {
  const code = (error as { code?: unknown } | null)?.code;
  return typeof code === 'string' && code !== '' ? code : 'unknown';
}

/**
 * The anotoki library's kit (@anotoki/lib/ui) wired to this app: the language
 * on the page, and the app's own words for the kit's (appWord()). No icons of
 * the app's own: the bar's are the kit's.
 *
 * The services are asked for when the kit asks, never here: the kit's words
 * are read while the app starts, by what TranslationService and AuthService
 * start themselves (as core/site-status.config.ts does for SiteStatus).
 */
export function kitUiConfig(): AnotokiUiConfig {
  const injector = inject(Injector);
  const refusal = inject(THEME_REFUSAL);
  const i18n = (): TranslationService => injector.get(TranslationService);
  return {
    language: () => i18n().pageLanguage(),
    lookup: (key) => appWord(i18n(), refusal, key),
  };
}

/**
 * The anotoki library's shell (@anotoki/lib/shell: the theme, the language
 * switcher, the top bar) wired to this app.
 *
 *   theme      light, dark or as the device is set - this device's (THEME_KEY,
 *              which the kit's theme-boot.js reads before the first paint),
 *              or, signed in, the anotoki account's: shown as it comes and
 *              saved to it (the owner's decision of 2026-10-06 for every
 *              anotoki site); a refusal is worded by appWord()
 *   languages  the languages on offer under their own names; a choice is the
 *              translation service's, which saves it to the account itself
 *              (TranslationService.setLanguage()) and says nothing when the
 *              account will not take it - the language holds for the visit
 */
export function kitShellConfig(): AnotokiShellConfig {
  const injector = inject(Injector);
  const refusal = inject(THEME_REFUSAL);
  const auth = (): AuthService => injector.get(AuthService);
  const i18n = (): TranslationService => injector.get(TranslationService);
  return {
    theme: {
      storageKey: THEME_KEY,
      account: () => auth().preferences()?.theme ?? null,
      save: (theme) =>
        auth()
          .savePreferences({ theme })
          .catch((error: unknown) => {
            refusal.set(codeOf(error));
            throw error;
          }),
    },
    languages: {
      current: () => i18n().language(),
      offered: () => i18n().languages().map((language) => ({ code: language.code, name: language.nativeName })),
      choose: (code) => i18n().setLanguage(code),
    },
  };
}

/** The kit and the shell, configured for this app (app.config.ts; the specs that draw the bar). */
export function provideKit(): EnvironmentProviders {
  return makeEnvironmentProviders([provideAnotokiUi(kitUiConfig), provideAnotokiShell(kitShellConfig)]);
}
