import { provideZonelessChangeDetection } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideTestTranslations } from '../../testing/test-translations';
import { LANGUAGE_KEY, TranslationService } from '../translation.service';
import { LanguageChooserComponent } from './language-chooser.component';

const ENGLISH = { 'language.button': 'Language: {name}', 'language.notLoaded': 'The language could not be loaded. Try again.' };
const SLOVAK = { 'language.button': 'Jazyk: {name}', 'language.notLoaded': 'Jazyk sa nepodarilo načítať. Skús to znova.' };

describe('LanguageChooserComponent', () => {
  let fixture: ComponentFixture<LanguageChooserComponent>;
  let host: HTMLElement;
  /** Every keydown that got as far as `document` — where the lesson quiz, the reviews and the exam listen. */
  let reached: string[];
  const onDocument = (event: KeyboardEvent): void => void reached.push(event.key);

  const menu = () => host.querySelector<HTMLDetailsElement>('details.langmenu')!;
  const summary = () => host.querySelector<HTMLElement>('summary')!;
  const items = () => Array.from(host.querySelectorAll<HTMLButtonElement>('.umenu button'));

  /** A key pressed on an element, as the browser sends it: it bubbles. */
  function press(on: HTMLElement, key: string): KeyboardEvent {
    const event = new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true });
    on.dispatchEvent(event);
    return event;
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

  it('is one pill: the code in capitals, named with the language as its speakers write it', () => {
    expect(summary().textContent?.trim()).toBe('SK');
    expect(summary().getAttribute('aria-label')).toBe('Jazyk: Slovenčina');
    expect(summary().getAttribute('title')).toBe('Jazyk: Slovenčina');
    expect(menu().open).toBe(false);
  });

  it('offers the languages, each in its own name and saying which language that is, the one in use marked', () => {
    expect(items().map((item) => [item.textContent?.trim(), item.getAttribute('lang'), item.getAttribute('aria-current')])).toEqual([
      ['English', 'en', null],
      ['Slovenčina', 'sk', 'true'],
    ]);
    expect(items().every((item) => item.type === 'button')).toBe(true);
  });

  it('is not drawn while fewer than two languages are on offer', async () => {
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      providers: [provideZonelessChangeDetection(), provideTestTranslations(ENGLISH, { languages: [{ code: 'en', name: 'English', nativeName: 'English' }] })],
    });
    const alone = TestBed.createComponent(LanguageChooserComponent);
    await alone.whenStable();
    expect((alone.nativeElement as HTMLElement).querySelector('details')).toBeNull();
    expect((alone.nativeElement as HTMLElement).textContent?.trim()).toBe('');
  });

  it('keeps its keys to itself: nothing pressed in it reaches document, where Enter would submit a card or finish a paper', () => {
    menu().open = true;
    for (const key of ['Enter', ' ', 'f', 'F', 'r', '1', 'a', 'ArrowLeft', 'ArrowRight', 'ArrowDown', 'ArrowUp', 'Escape', 'Tab']) {
      press(summary(), key);
      press(items()[0], key);
      press(items()[1], key);
    }
    expect(reached).toEqual([]);

    // A key pressed anywhere else still gets there.
    press(document.body, 'Enter');
    expect(reached).toEqual(['Enter']);
  });

  it('leaves Enter, Space and Tab to the browser: they open the menu, choose an item, move on', () => {
    for (const key of ['Enter', ' ', 'Tab', 'f']) {
      expect(press(summary(), key).defaultPrevented, key).toBe(false);
      expect(press(items()[0], key).defaultPrevented, key).toBe(false);
    }
  });

  it('moves with the arrows: from the pill to the language after or before the one in use, then round and round', () => {
    summary().focus();
    // Slovak is in use: the one after it is the first again.
    const down = press(summary(), 'ArrowDown');
    expect(down.defaultPrevented).toBe(true);
    expect(menu().open).toBe(true);
    expect(document.activeElement).toBe(items()[0]);

    press(items()[0], 'ArrowDown');
    expect(document.activeElement).toBe(items()[1]);
    press(items()[1], 'ArrowDown');
    expect(document.activeElement).toBe(items()[0]);
    press(items()[0], 'ArrowUp');
    expect(document.activeElement).toBe(items()[1]);

    menu().open = false;
    summary().focus();
    press(summary(), 'ArrowUp');
    expect(menu().open).toBe(true);
    expect(document.activeElement).toBe(items()[0]);
  });

  it('closes on Escape pressed in it, and puts the focus back on the pill', () => {
    menu().open = true;
    items()[0].focus();
    press(items()[0], 'Escape');
    expect(menu().open).toBe(false);
    expect(document.activeElement).toBe(summary());
    expect(reached).toEqual([]);
  });

  it('closes on a click elsewhere and on Escape pressed elsewhere — and stays open for a click inside it', () => {
    menu().open = true;
    menu().querySelector<HTMLElement>('.umenu')!.click();
    expect(menu().open).toBe(true);

    document.body.click();
    expect(menu().open).toBe(false);

    menu().open = true;
    press(document.body, 'Enter');
    expect(menu().open).toBe(true);
    press(document.body, 'Escape');
    expect(menu().open).toBe(false);
  });

  it('switches the language of the page, remembers it on this device, and closes', async () => {
    menu().open = true;
    items()[0].click();
    await fixture.whenStable();

    expect(TestBed.inject(TranslationService).language()).toBe('en');
    expect(localStorage.getItem(LANGUAGE_KEY)).toBe('en');
    expect(summary().textContent?.trim()).toBe('EN');
    expect(summary().getAttribute('aria-label')).toBe('Language: English');
    expect(items().map((item) => item.getAttribute('aria-current'))).toEqual(['true', null]);
    expect(menu().open).toBe(false);
    expect(document.activeElement).toBe(summary());
  });

  it('says so in the menu, and stays as it was, when the language could not be loaded', async () => {
    const i18n = TestBed.inject(TranslationService);
    vi.spyOn(i18n, 'setLanguage').mockResolvedValue(false);
    menu().open = true;
    items()[0].click();
    await fixture.whenStable();

    expect(i18n.language()).toBe('sk');
    expect(summary().textContent?.trim()).toBe('SK');
    expect(menu().open).toBe(true);
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

    menu().open = true;
    items()[0].click();
    await fixture.whenStable();
    expect(summary().getAttribute('aria-busy')).toBe('true');
    expect(menu().open, 'usable while the language is on its way').toBe(true);

    // A change of mind while English is on its way: back to Slovak, the language still on the page.
    items()[1].click();
    await fixture.whenStable();
    expect(setLanguage.mock.calls).toEqual([['en'], ['sk']]);
    expect(summary().hasAttribute('aria-busy')).toBe(false);
    expect(menu().open).toBe(false);

    // The first choice comes back as the service answers one that was overtaken.
    overtaken(false);
    await fixture.whenStable();
    expect(host.querySelector('[role="alert"]')).toBeNull();
    expect(menu().open).toBe(false);
    expect(summary().textContent?.trim()).toBe('SK');
  });

  it('choosing the language already on the page asks for nothing and closes', async () => {
    const setLanguage = vi.spyOn(TestBed.inject(TranslationService), 'setLanguage');
    menu().open = true;
    items()[1].click();
    await fixture.whenStable();
    expect(setLanguage).not.toHaveBeenCalled();
    expect(menu().open).toBe(false);
  });
});
