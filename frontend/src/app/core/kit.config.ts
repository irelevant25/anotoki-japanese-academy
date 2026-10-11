import { EnvironmentProviders, Injector, inject, makeEnvironmentProviders } from '@angular/core';
import { AnotokiShellConfig, provideAnotokiShell } from '@anotoki/lib/shell';
import { ShellLanguages, TranslationService } from '@anotoki/lib/translations';
import { AnotokiUiConfig, provideAnotokiUi } from '@anotoki/lib/ui/config';
import { AuthService } from './auth/auth.service';

/** Shared with the kit's theme-boot.js (its data-storage-key in index.html): this device's light or dark, before the first paint. */
export const THEME_KEY = 'academy-theme';

/**
 * The English of the anotoki library's words this app says its own way: the
 * kit says them while no words are in memory (the translations module's
 * `libraryWords`, core/i18n/translations.config.ts), over the library's own
 * English ("Main navigation", "Automatic"). With words in memory the kit
 * reads the database's - migration 009 copied the app's words under the
 * library's keys -, so this is the same text as the seeded English
 * (backend/tests/unit/translations.test.php holds the two together, and every
 * other library word to the library's own English).
 */
const ENGLISH: Record<string, string> = {
  'anotoki.topbar.sections': 'The app’s sections',
  'anotoki.theme.auto': 'System',
};

/** The English of the library's words this app says its own way (ENGLISH above). */
export const KIT_ENGLISH: Readonly<Record<string, string>> = ENGLISH;

/** What the kit is given of the translation service: the language on the page, and its words from the database. */
type KitWords = Required<Pick<AnotokiUiConfig, 'language' | 'lookup'>>;

/**
 * The anotoki library's kit (@anotoki/lib/ui: the top bar, the theme switch,
 * the language switcher, the dialogs) wired to this app: the language on the
 * page (English in the admin panel), and the kit's words from this app's
 * database - the library's keys, anotoki.<the kit's key>, which the owner
 * rewords on the Translations page like any other (the translations module's
 * forKit()). No icons of the app's own: the bar's are the kit's.
 *
 * The services are asked for when the kit asks, never here: the kit's words
 * are read while the app starts, by what the translation service and
 * AuthService start themselves (as core/site-status.config.ts does for SiteStatus).
 */
export function kitUiConfig(): AnotokiUiConfig {
  const injector = inject(Injector);
  let made: KitWords | null = null;
  const kit = (): KitWords => (made ??= injector.get(TranslationService).forKit());
  return {
    language: () => kit().language(),
    lookup: (key) => kit().lookup(key),
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
 *              anotoki site); the kit's note under the switch says when the
 *              account refused it
 *   languages  the languages on offer under their own names; a choice is the
 *              translation service's, which saves it to the account
 *              (forShell()): a language the account will not take holds for
 *              the visit, and any other refusal is said under the switcher
 */
export function kitShellConfig(): AnotokiShellConfig {
  const injector = inject(Injector);
  const auth = (): AuthService => injector.get(AuthService);
  return {
    theme: {
      storageKey: THEME_KEY,
      account: () => auth().preferences()?.theme ?? null,
      save: (theme) => auth().savePreferences({ theme }),
    },
    languages: shellLanguages(injector),
  };
}

/** The translation service's forShell(), made when the switcher first asks for it. */
function shellLanguages(injector: Injector): ShellLanguages {
  let made: ShellLanguages | null = null;
  const own = (): ShellLanguages => (made ??= injector.get(TranslationService).forShell());
  return {
    current: () => own().current(),
    offered: () => own().offered(),
    choose: (code) => own().choose(code),
    notSaved: () => own().notSaved(),
    clearNotSaved: () => own().clearNotSaved(),
  };
}

/** The kit and the shell, configured for this app (app.config.ts; the specs that draw the bar). */
export function provideKit(): EnvironmentProviders {
  return makeEnvironmentProviders([provideAnotokiUi(kitUiConfig), provideAnotokiShell(kitShellConfig)]);
}
