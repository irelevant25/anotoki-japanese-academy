import { provideZonelessChangeDetection } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { ANOTOKI_SHELL_CONFIG, ThemeService } from '@anotoki/lib/shell';
import { TranslationService } from '@anotoki/lib/translations';
import { provideTestTranslations } from '@anotoki/lib/translations/testing';
import { AnotokiWords } from '@anotoki/lib/ui/config';
import { AuthService } from './auth/auth.service';
import { KIT_ENGLISH, provideKit, THEME_KEY } from './kit.config';
import { authStandIn, AuthStandIn, NO_CHOICE, person } from './testing/auth-states';
import { provideKitEnglish } from './testing/kit-english';

/**
 * The kit's words as this app's database has them since migration 009: the
 * app's own words, copied under the anotoki library's keys - and the
 * library's own (002) where the app had none, the theme's note among them.
 */
const ENGLISH: Record<string, string> = {
  'anotoki.topbar.sections': 'The app’s sections',
  'anotoki.topbar.phoneMenu': 'Menu',
  'anotoki.topbar.menuButton': 'Your menu: {name}',
  'anotoki.topbar.menu': 'Your menu',
  'anotoki.topbar.roleAdmin': 'Administrator',
  'anotoki.topbar.roleEditor': 'Editor',
  'anotoki.topbar.admin': 'Admin panel',
  'anotoki.topbar.account': 'Your anotoki account',
  'anotoki.topbar.signIn': 'Sign in',
  'anotoki.topbar.signOut': 'Sign out',
  'anotoki.topbar.saving': 'Saving…',
  'anotoki.language.button': 'Language: {name} ({code})',
  'anotoki.language.notLoaded': 'The language could not be loaded. Try again.',
  'anotoki.theme.label': 'Theme',
  'anotoki.theme.light': 'Light',
  'anotoki.theme.dark': 'Dark',
  'anotoki.theme.auto': 'System',
  'anotoki.theme.autoHint': 'As your device is set',
  'anotoki.theme.notSaved': 'The theme could not be saved to your anotoki account.',
  'anotoki.ui.close': 'Close',
};
/** The same in Slovak - with the owner's own rewordings, which the library's built-in Slovak does not have ("Časti aplikácie", "Systémový"). */
const SLOVAK: Record<string, string> = {
  'anotoki.topbar.sections': 'Časti aplikácie',
  'anotoki.topbar.phoneMenu': 'Ponuka',
  'anotoki.topbar.menuButton': 'Tvoja ponuka: {name}',
  'anotoki.topbar.menu': 'Tvoja ponuka',
  'anotoki.topbar.roleAdmin': 'Administrátor',
  'anotoki.topbar.roleEditor': 'Editor',
  'anotoki.topbar.admin': 'Administrátorský panel',
  'anotoki.topbar.account': 'Tvoj účet anotoki',
  'anotoki.topbar.signIn': 'Prihlásiť sa',
  'anotoki.topbar.signOut': 'Odhlásiť sa',
  'anotoki.topbar.saving': 'Ukladá sa…',
  'anotoki.language.button': 'Jazyk: {name} ({code})',
  'anotoki.language.notLoaded': 'Jazyk sa nepodarilo načítať. Skús to znova.',
  'anotoki.theme.label': 'Vzhľad',
  'anotoki.theme.light': 'Svetlý',
  'anotoki.theme.dark': 'Tmavý',
  'anotoki.theme.auto': 'Systémový',
  'anotoki.theme.autoHint': 'Podľa nastavenia tvojho zariadenia',
  'anotoki.theme.notSaved': 'Vzhľad sa nepodarilo uložiť do tvojho anotoki účtu.',
  'anotoki.ui.close': 'Zavrieť',
};

describe('the anotoki library’s kit, in this app’s words and theme (core/kit.config.ts)', () => {
  let auth: AuthStandIn;

  function configure(translations = provideTestTranslations(SLOVAK, { language: 'sk', english: ENGLISH })): void {
    auth = authStandIn();
    TestBed.configureTestingModule({
      providers: [provideZonelessChangeDetection(), translations, provideKitEnglish(), provideKit(), { provide: AuthService, useValue: auth }],
    });
  }

  afterEach(() => {
    localStorage.clear();
    document.documentElement.removeAttribute('data-theme');
    document.documentElement.style.removeProperty('color-scheme');
    vi.restoreAllMocks();
  });

  it('every word of the kit is the database’s, under the library’s keys - the app’s words, the owner’s rewordings included', () => {
    configure();
    const words = TestBed.inject(AnotokiWords);
    expect([
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
    ]).toEqual([
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
    // A word the database has no string for is the library's own, in the same informal Slovak.
    expect([words.t('language.label'), words.t('ui.cancel'), words.t('ui.confirm')]).toEqual(['Jazyk', 'Zrušiť', 'Potvrdiť']);
    expect([words.language(), words.lang(), words.foreignLang()]).toEqual(['sk', 'sk', null]);
  });

  it('English in the admin panel, whatever the reader reads; and with no strings at all, the English the app keeps - never the library’s own English for a word the app says its own way', () => {
    configure();
    TestBed.inject(TranslationService).noteAddress('/admin/people');
    const words = TestBed.inject(AnotokiWords);
    expect([words.language(), words.t('theme.auto'), words.t('topbar.account')]).toEqual(['en', 'System', 'Your anotoki account']);

    TestBed.resetTestingModule();
    configure(provideTestTranslations({}));
    const kept = TestBed.inject(AnotokiWords);
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    expect([kept.t('topbar.sections'), kept.t('theme.auto'), kept.t('theme.autoHint'), kept.t('topbar.signOut')]).toEqual(['The app’s sections', 'System', 'As your device is set', 'Sign out']);
    expect(KIT_ENGLISH, 'the two this app says its own way, and only they').toEqual({ 'anotoki.topbar.sections': 'The app’s sections', 'anotoki.theme.auto': 'System' });
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

  it('a theme the account refuses: the account’s again, and the note under the switch says so in the reader’s language - the library’s word, from the database', async () => {
    configure();
    auth.user.set(person({ ...NO_CHOICE, theme: 'light' }));
    const theme = TestBed.inject(ThemeService);
    TestBed.tick();
    theme.set('dark');
    auth.saves[0].refuse('network');
    await vi.waitFor(() => expect(theme.refused()).toBe(true));
    expect(theme.mode()).toBe('light');
    expect(TestBed.inject(AnotokiWords).t('theme.notSaved')).toBe('Vzhľad sa nepodarilo uložiť do tvojho anotoki účtu.');
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
    expect(languages.notSaved?.(), 'nobody signed in: nothing to refuse it').toBe(false);
  });
});
