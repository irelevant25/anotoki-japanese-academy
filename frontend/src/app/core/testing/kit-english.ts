import { EnvironmentProviders } from '@angular/core';
import { provideAnotokiTranslations } from '@anotoki/lib/translations';
import { KIT_ENGLISH } from '../kit.config';

/**
 * For a spec that draws the kit's words (the top bar, the dialogs) with
 * provideTestTranslations(): the one part of the app's translations
 * configuration they read (core/i18n/translations.config.ts) - the English of
 * the anotoki library's words this app says its own way, which the kit says
 * while the strings have none ("The app’s sections", "System"). The rest of
 * that configuration reads the session and the server, which such a spec
 * stands in for itself.
 */
export function provideKitEnglish(): EnvironmentProviders {
  return provideAnotokiTranslations(() => ({ libraryWords: { en: KIT_ENGLISH } }));
}
