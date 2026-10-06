import { provideZonelessChangeDetection } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { AuthService } from '../../auth/auth.service';
import { authStandIn, NO_CHOICE, person } from '../../testing/auth-states';
import { provideTestTranslations } from '../../testing/test-translations';
import { LANGUAGE_KEY, TranslationService } from '../translation.service';
import { LanguageChooserComponent } from './language-chooser.component';

const ENGLISH = { 'language.button': 'Language: {name} ({code})', 'language.notLoaded': 'The language could not be loaded. Try again.' };
const SLOVAK = { 'language.button': 'Jazyk: {name} ({code})', 'language.notLoaded': 'Jazyk sa nepodarilo načítať. Skús to znova.' };

describe('LanguageChooserComponent', () => {
  let fixture: ComponentFixture<LanguageChooserComponent>;
  let host: HTMLElement;
  /** Every keydown that got as far as `document` — where the lesson quiz, the reviews and the exam listen. */
  let reached: string[];
  const onDocument = (event: KeyboardEvent): void => void reached.push(event.key);

  const button = () => host.querySelector<HTMLButtonElement>('button.switcher')!;
  const items = () => Array.from(host.querySelectorAll<HTMLButtonElement>('[role="menuitemradio"]'));

  /** A key pressed on an element, as the browser sends it: it bubbles. */
  function press(on: HTMLElement, key: string, shiftKey = false): KeyboardEvent {
    const event = new KeyboardEvent('keydown', { key, shiftKey, bubbles: true, cancelable: true });
    on.dispatchEvent(event);
    return event;
  }

  async function open(): Promise<void> {
    button().click();
    await fixture.whenStable();
  }

  beforeEach(async () => {
    localStorage.clear();
    TestBed.configureTestingModule({ providers: [provideZonelessChangeDetection(), provideTestTranslations(SLOVAK, { language: 'sk', english: ENGLISH })] });
    fixture = TestBed.createComponent(LanguageChooserComponent);
    host = fixture.nativeElement;
    document.body.appendChild(host);
    reached = [];
    document.addEventListener('keydown', onDocument);
    await fixture.whenStable();
  });

  afterEach(() => {
    document.removeEventListener('keydown', onDocument);
    host.remove();
    localStorage.clear();
    vi.restoreAllMocks();
  });

  it('is one round button: the code in capitals, named with the language as its speakers write it and the code it shows', () => {
    expect(host.querySelectorAll('button')).toHaveLength(1);
    expect(button().textContent?.trim()).toBe('SK');
    // Label in Name: somebody who speaks to their computer says "click SK".
    expect(button().getAttribute('aria-label')).toBe('Jazyk: Slovenčina (SK)');
    expect(button().getAttribute('title')).toBe('Jazyk: Slovenčina (SK)');
    expect(button().getAttribute('aria-haspopup')).toBe('menu');
    expect(button().getAttribute('aria-expanded')).toBe('false');
    expect(items()).toEqual([]);
  });

  it('opens a menu of the languages, each in its own name and saying which language that is, the focus on the one in use', async () => {
    await open();
    expect(button().getAttribute('aria-expanded')).toBe('true');
    const menu = host.querySelector('[role="menu"]')!;
    expect(menu.id).toBe(button().getAttribute('aria-controls'));
    expect(menu.getAttribute('aria-labelledby')).toBe(button().id);
    expect(items().map((item) => [item.textContent?.trim(), item.getAttribute('lang'), item.getAttribute('aria-checked')])).toEqual([
      ['English', 'en', 'false'],
      ['Slovenčina', 'sk', 'true'],
    ]);
    expect(document.activeElement).toBe(items()[1]);
  });

  it('is not drawn while fewer than two languages are on offer', async () => {
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      providers: [provideZonelessChangeDetection(), provideTestTranslations(ENGLISH, { languages: [{ code: 'en', name: 'English', nativeName: 'English' }] })],
    });
    const alone = TestBed.createComponent(LanguageChooserComponent);
    await alone.whenStable();
    expect((alone.nativeElement as HTMLElement).querySelector('button')).toBeNull();
    expect((alone.nativeElement as HTMLElement).textContent?.trim()).toBe('');
  });

  it('keeps its keys to itself: nothing pressed on it or in it reaches document, where Enter would submit a card or finish a paper', async () => {
    for (const key of ['Enter', ' ', 'f', 'r', '1', 'a', 'ArrowLeft', 'ArrowRight']) {
      press(button(), key);
    }
    await open();
    for (const key of ['Enter', ' ', 'f', 'F', 'r', '1', 'a', 'ArrowLeft', 'ArrowRight', 'ArrowDown', 'ArrowUp', 'Home', 'End']) {
      press(items()[0], key);
      press(items()[1], key);
    }
    expect(reached).toEqual([]);

    // A key pressed anywhere else still gets there.
    press(document.body, 'Enter');
    expect(reached).toEqual(['Enter']);
  });

  it('moves with the arrows, round and round, and with Home and End', async () => {
    await open();
    expect(document.activeElement).toBe(items()[1]);
    expect(press(items()[1], 'ArrowDown').defaultPrevented).toBe(true);
    expect(document.activeElement).toBe(items()[0]);
    press(items()[0], 'ArrowUp');
    expect(document.activeElement).toBe(items()[1]);
    press(items()[1], 'Home');
    expect(document.activeElement).toBe(items()[0]);
    press(items()[0], 'End');
    expect(document.activeElement).toBe(items()[1]);
    // Enter and Space on an item are the browser's: they choose it.
    expect(press(items()[1], 'Enter').defaultPrevented).toBe(false);
  });

  it('closes on Escape pressed in it, and on Escape pressed on its button, the focus back on the button', async () => {
    await open();
    press(items()[0], 'Escape');
    await fixture.whenStable();
    expect(items()).toEqual([]);
    expect(document.activeElement).toBe(button());

    await open();
    button().focus();
    press(button(), 'Escape');
    await fixture.whenStable();
    expect(items()).toEqual([]);
    expect(reached, 'Escape is the chooser’s too').toEqual([]);
  });

  it('closes on Tab and Shift+Tab, from the first and the last language, with the focus on its button — never on <body>', async () => {
    for (const [which, shift] of [
      [0, false],
      [1, false],
      [0, true],
      [1, true],
    ] as const) {
      await open();
      items()[which].focus();
      const tab = press(items()[which], 'Tab', shift);
      expect(tab.defaultPrevented).toBe(true);
      expect(document.activeElement).toBe(button());
      await fixture.whenStable();
      expect(items()).toEqual([]);
      expect(button().getAttribute('aria-expanded')).toBe('false');
      expect(document.activeElement).toBe(button());
    }
  });

  it('closes on a click elsewhere and on Escape pressed elsewhere — and stays open for a click inside it', async () => {
    await open();
    host.querySelector<HTMLElement>('[role="menu"]')!.click();
    await fixture.whenStable();
    expect(items()).toHaveLength(2);

    document.body.click();
    await fixture.whenStable();
    expect(items()).toEqual([]);

    await open();
    document.body.focus();
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    await fixture.whenStable();
    expect(items()).toEqual([]);
  });

  it('switches the language of the page, remembers it on this device, and closes with the focus on its button', async () => {
    await open();
    items()[0].click();
    await fixture.whenStable();

    expect(TestBed.inject(TranslationService).language()).toBe('en');
    expect(localStorage.getItem(LANGUAGE_KEY)).toBe('en');
    expect(button().textContent?.trim()).toBe('EN');
    expect(button().getAttribute('aria-label')).toBe('Language: English (EN)');
    expect(items()).toEqual([]);
    expect(document.activeElement).toBe(button());
  });

  it('signed in, the choice goes to the anotoki account too, for every site — a visitor’s stays this device’s alone', async () => {
    host.remove();
    TestBed.resetTestingModule();
    const auth = authStandIn('ready');
    auth.user.set(person(NO_CHOICE, 'sk'));
    TestBed.configureTestingModule({
      providers: [provideZonelessChangeDetection(), provideTestTranslations(SLOVAK, { language: 'sk', english: ENGLISH }), { provide: AuthService, useValue: auth }],
    });
    fixture = TestBed.createComponent(LanguageChooserComponent);
    host = fixture.nativeElement;
    document.body.appendChild(host);
    await fixture.whenStable();

    await open();
    items()[0].click();
    await fixture.whenStable();
    expect(TestBed.inject(TranslationService).language()).toBe('en');
    expect(localStorage.getItem(LANGUAGE_KEY), 'this device keeps it, as before').toBe('en');
    expect(auth.saves.map((save) => save.changes)).toEqual([{ language: 'en' }]);
    auth.saves[0].accept();
    await fixture.whenStable();
    expect(auth.user()?.locale).toBe('en');

    auth.state.set('visiting');
    auth.user.set(null);
    await open();
    items()[1].click();
    await fixture.whenStable();
    expect(TestBed.inject(TranslationService).language()).toBe('sk');
    expect(auth.saves, 'nothing more').toHaveLength(1);
  });

  it('says so in the menu, and stays as it was, when the language could not be loaded', async () => {
    const i18n = TestBed.inject(TranslationService);
    vi.spyOn(i18n, 'setLanguage').mockResolvedValue(false);
    await open();
    items()[0].click();
    await fixture.whenStable();

    expect(i18n.language()).toBe('sk');
    expect(button().textContent?.trim()).toBe('SK');
    expect(items()).toHaveLength(2);
    expect(host.querySelector('[role="alert"]')?.textContent?.trim()).toBe('Jazyk sa nepodarilo načítať. Skús to znova.');

    // Closing the menu takes the message away with it.
    press(items()[0], 'Escape');
    await fixture.whenStable();
    expect(host.querySelector('[role="alert"]')).toBeNull();
  });

  it('takes a second choice while the first is on its way — the last one wins, and the one overtaken is not called a failure', async () => {
    const i18n = TestBed.inject(TranslationService);
    let overtaken!: (switched: boolean) => void;
    const slow = new Promise<boolean>((done) => (overtaken = done));
    const setLanguage = vi.spyOn(i18n, 'setLanguage').mockImplementation((code: string) => (code === 'en' ? slow : Promise.resolve(true)));

    await open();
    items()[0].click();
    await fixture.whenStable();
    expect(button().getAttribute('aria-busy')).toBe('true');
    expect(items(), 'usable while the language is on its way').toHaveLength(2);

    // A change of mind while English is on its way: back to Slovak, the language still on the page.
    items()[1].click();
    await fixture.whenStable();
    expect(setLanguage.mock.calls).toEqual([['en'], ['sk']]);
    expect(button().hasAttribute('aria-busy')).toBe(false);
    expect(items()).toEqual([]);

    // The first choice comes back as the service answers one that was overtaken.
    overtaken(false);
    await fixture.whenStable();
    expect(host.querySelector('[role="alert"]')).toBeNull();
    expect(items()).toEqual([]);
    expect(button().textContent?.trim()).toBe('SK');
  });

  it('choosing the language already on the page asks for nothing and closes', async () => {
    const setLanguage = vi.spyOn(TestBed.inject(TranslationService), 'setLanguage');
    await open();
    items()[1].click();
    await fixture.whenStable();
    expect(setLanguage).not.toHaveBeenCalled();
    expect(items()).toEqual([]);
  });
});
