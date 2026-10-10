import { provideZonelessChangeDetection } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { ANOTOKI_SHELL_CONFIG, ThemeService } from '@anotoki/lib/shell';
import { AnotokiWords } from '@anotoki/lib/ui';
import { AuthService } from './auth/auth.service';
import { TranslationService } from './i18n/translation.service';
import { provideKit, THEME_KEY } from './kit.config';
import { authStandIn, AuthStandIn, NO_CHOICE, person } from './testing/auth-states';
import { provideTestTranslations } from './testing/test-translations';

/** The app's words for what the kit says, as the seed has them. */
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
};
/** The same in Slovak - with the owner's own rewordings, which the kit's built-in Slovak does not have. */
const SLOVAK: Record<string, string> = {
  'topbar.sections': 'Časti aplikácie',
  'topbar.phoneMenu': 'Ponuka',
  'topbar.menuButton': 'Tvoja ponuka: {name}',
  'topbar.menu': 'Tvoja ponuka',
  'topbar.roleAdmin': 'Administrátor',
  'topbar.roleEditor': 'Editor',
  'topbar.admin': 'Administrátorský panel',
  'account.yourAccount': 'Tvoj účet anotoki',
  'account.signOut': 'Odhlásiť sa',
  'signOut.saving': 'Ukladá sa…',
  'signIn.button': 'Prihlásiť sa',
  'language.button': 'Jazyk: {name} ({code})',
  'language.notLoaded': 'Jazyk sa nepodarilo načítať. Skús to znova.',
  'theme.label': 'Vzhľad',
  'theme.light': 'Svetlý',
  'theme.dark': 'Tmavý',
  'theme.system': 'Systémový',
  'theme.systemHint': 'Podľa nastavenia tvojho zariadenia',
  'common.close': 'Zavrieť',
  'error.offline': 'Server neodpovedá.',
};

describe('the anotoki library’s kit, in this app’s words and theme (core/kit.config.ts)', () => {
  let auth: AuthStandIn;

  function configure(translations = provideTestTranslations(SLOVAK, { language: 'sk', english: ENGLISH })): void {
    auth = authStandIn();
    TestBed.configureTestingModule({
      providers: [provideZonelessChangeDetection(), translations, provideKit(), { provide: AuthService, useValue: auth }],
    });
  }

  afterEach(() => {
    localStorage.clear();
    document.documentElement.removeAttribute('data-theme');
    document.documentElement.style.removeProperty('color-scheme');
  });

  it('every word of the kit the app has words for is the app’s - from its database, the owner’s rewordings included', () => {
    configure();
    const words = TestBed.inject(AnotokiWords);
    expect(
      [
        words.t('topbar.sections'),
        words.t('topbar.phoneMenu'),
        words.t('topbar.menuButton', { name: 'hana' }),
        words.t('topbar.menu'),
        words.t('topbar.roleAdmin'),
        words.t('topbar.roleEditor'),
        words.t('topbar.account'),
        words.t('topbar.admin'),
        words.t('topbar.signIn'),
        words.t('topbar.signOut'),
        words.t('topbar.saving'),
        words.t('language.button', { name: 'Slovenčina', code: 'SK' }),
        words.t('language.notLoaded'),
        words.t('theme.label'),
        words.t('theme.light'),
        words.t('theme.dark'),
        words.t('theme.auto'),
        words.t('theme.autoHint'),
        words.t('ui.close'),
      ],
    ).toEqual([
      'Časti aplikácie',
      'Ponuka',
      'Tvoja ponuka: hana',
      'Tvoja ponuka',
      'Administrátor',
      'Editor',
      'Tvoj účet anotoki',
      'Administrátorský panel',
      'Prihlásiť sa',
      'Odhlásiť sa',
      'Ukladá sa…',
      'Jazyk: Slovenčina (SK)',
      'Jazyk sa nepodarilo načítať. Skús to znova.',
      'Vzhľad',
      'Svetlý',
      'Tmavý',
      'Systémový',
      'Podľa nastavenia tvojho zariadenia',
      'Zavrieť',
    ]);
    // What the app has no words for is the kit's own, in the same informal Slovak.
    expect([words.t('language.label'), words.t('ui.cancel'), words.t('ui.confirm')]).toEqual(['Jazyk', 'Zrušiť', 'Potvrdiť']);
    expect([words.language(), words.lang(), words.foreignLang()]).toEqual(['sk', 'sk', null]);
  });

  it('English in the admin panel, whatever the reader reads; and with no strings at all, the English the app keeps - never the kit’s own English for a word the app has', () => {
    configure();
    TestBed.inject(TranslationService).noteAddress('/admin/people');
    const words = TestBed.inject(AnotokiWords);
    expect([words.language(), words.t('theme.auto'), words.t('topbar.account')]).toEqual(['en', 'System', 'Your anotoki account']);

    TestBed.resetTestingModule();
    configure(provideTestTranslations({}));
    const kept = TestBed.inject(AnotokiWords);
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    expect([kept.t('topbar.sections'), kept.t('theme.auto'), kept.t('theme.autoHint'), kept.t('topbar.signOut')]).toEqual([
      'The app’s sections',
      'System',
      'As your device is set',
      'Sign out',
    ]);
    expect(warn, 'no key asked for that has no string').not.toHaveBeenCalled();
  });

  it('the theme: this device’s, kept where the boot script reads it; signed in, the account’s - shown, and a choice saved to it', async () => {
    configure();
    const theme = TestBed.inject(ThemeService);
    expect(TestBed.inject(ANOTOKI_SHELL_CONFIG).theme?.storageKey).toBe(THEME_KEY);
    theme.set('dark');
    TestBed.tick();
    expect([localStorage.getItem(THEME_KEY), document.documentElement.getAttribute('data-theme')]).toEqual(['dark', 'dark']);
    expect(auth.saves, 'nobody signed in: nothing saved').toEqual([]);
    // (The kit's one save at a time settles that choice first.)
    await new Promise((done) => setTimeout(done));

    auth.user.set(person({ ...NO_CHOICE, theme: 'light' }));
    TestBed.tick();
    expect(theme.mode(), 'the account’s theme, from the moment it is known').toBe('light');
    theme.set('auto');
    expect(auth.saves.map((save) => save.changes)).toEqual([{ theme: 'auto' }]);
    expect(localStorage.getItem(THEME_KEY), 'as the device is set: nothing kept').toBeNull();
    auth.saves[0].accept();
    await Promise.resolve();
  });

  it('a theme the account refuses: the account’s again, and the note under the switch says why in the app’s words', async () => {
    configure();
    auth.user.set(person({ ...NO_CHOICE, theme: 'light' }));
    const theme = TestBed.inject(ThemeService);
    TestBed.tick();
    theme.set('dark');
    auth.saves[0].refuse('network');
    await vi.waitFor(() => expect(theme.refused()).toBe(true));
    expect(theme.mode()).toBe('light');
    expect(TestBed.inject(AnotokiWords).t('theme.notSaved')).toBe('Server neodpovedá.');
  });

  it('the languages: those on offer under their own names, and a choice is the translation service’s', async () => {
    configure();
    const languages = TestBed.inject(ANOTOKI_SHELL_CONFIG).languages!;
    expect(languages.current()).toBe('sk');
    expect(languages.offered()).toEqual([
      { code: 'en', name: 'English' },
      { code: 'sk', name: 'Slovenčina' },
    ]);
    const chosen = vi.spyOn(TestBed.inject(TranslationService), 'setLanguage');
    await expect(languages.choose('en')).resolves.toBe(true);
    expect(chosen).toHaveBeenCalledWith('en');
    expect(languages.current()).toBe('en');
  });
});
