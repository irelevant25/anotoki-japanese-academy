import { Injectable, InjectionToken, Provider, inject } from '@angular/core';
import { SiteLanguage, TranslationBundle } from '../i18n/translation.model';
import { FALLBACK_LANGUAGE, TranslationService } from '../i18n/translation.service';

/** The two languages the app is seeded with. */
export const TEST_LANGUAGES: SiteLanguage[] = [
  { code: 'en', name: 'English', nativeName: 'English' },
  { code: 'sk', name: 'Slovak', nativeName: 'Slovenčina' },
];

const TEST_BUNDLE = new InjectionToken<TranslationBundle>('the bundle a spec runs with');

/**
 * The real service with a bundle already in memory, and no HTTP: what it would
 * fetch is answered from that bundle — its own language, English for any
 * other, as the server answers a language it does not offer.
 *
 * The bundle counts as the server's own, so a navigation in a spec asks for
 * nothing (navigated()).
 */
@Injectable()
class TestTranslationService extends TranslationService {
  private readonly bundle = inject(TEST_BUNDLE);

  constructor() {
    super();
    this.use(this.bundle);
  }

  protected override fetchBundle(code: string): Promise<unknown> {
    const { language, languages, values, english } = this.bundle;
    return Promise.resolve(code === language ? this.bundle : { language: FALLBACK_LANGUAGE, languages, values: english ?? values });
  }

  /**
   * What a page calls after it has changed the strings or the languages: here
   * it answers at once and changes nothing — the language the spec chose stays
   * (the real one settles again on the browser's wishes, which would move a
   * Slovak spec to whatever jsdom says it speaks). A spec that cares asks
   * whether it was called: `vi.spyOn(i18n, 'reload')`.
   */
  override reload(): Promise<void> {
    return Promise.resolve();
  }
}

/**
 * For a spec that runs the translation service, a pipe or a component with
 * given strings: `provideTestTranslations({ 'common.close': 'Close' })` is an
 * English bundle of them; for another language, say which, and give English
 * beside it (what a switch back to English reads) —
 * `provideTestTranslations({ 'common.close': 'Zavrieť' }, { language: 'sk', english: { 'common.close': 'Close' } })`.
 *
 * A key that is not given comes back as itself and warns, as in the app.
 */
export function provideTestTranslations(values: Record<string, string> = {}, bundle: Partial<Omit<TranslationBundle, 'values'>> = {}): Provider[] {
  const language = bundle.language ?? FALLBACK_LANGUAGE;
  const whole: TranslationBundle = { language, languages: bundle.languages ?? TEST_LANGUAGES, values, ...(language === FALLBACK_LANGUAGE ? {} : { english: bundle.english ?? {} }) };
  return [
    { provide: TEST_BUNDLE, useValue: whole },
    { provide: TranslationService, useClass: TestTranslationService },
  ];
}
