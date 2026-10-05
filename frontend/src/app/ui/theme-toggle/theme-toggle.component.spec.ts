import { provideZonelessChangeDetection } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { TranslationService } from '../../core/i18n/translation.service';
import { provideTestTranslations } from '../../core/testing/test-translations';
import { THEME_KEY } from '../../core/theme/theme.service';
import { ThemeToggleComponent } from './theme-toggle.component';

const ENGLISH = { 'theme.label': 'Theme', 'theme.light': 'Light', 'theme.dark': 'Dark', 'theme.system': 'System', 'theme.systemHint': 'As your device is set' };
const SLOVAK = { 'theme.label': 'Vzhľad', 'theme.light': 'Svetlý', 'theme.dark': 'Tmavý', 'theme.system': 'Systémový', 'theme.systemHint': 'Podľa nastavenia tvojho zariadenia' };

describe('ThemeToggleComponent', () => {
  let fixture: ComponentFixture<ThemeToggleComponent>;
  let host: HTMLElement;

  const options = () => Array.from(host.querySelectorAll<HTMLButtonElement>('[role="radio"]'));
  const root = () => document.documentElement;

  async function draw(providers = [provideTestTranslations(SLOVAK, { language: 'sk', english: ENGLISH })]): Promise<void> {
    TestBed.configureTestingModule({ providers: [provideZonelessChangeDetection(), ...providers] });
    fixture = TestBed.createComponent(ThemeToggleComponent);
    host = fixture.nativeElement;
    document.body.appendChild(host);
    await fixture.whenStable();
  }

  beforeEach(() => {
    localStorage.clear();
    root().removeAttribute('data-theme');
    root().style.removeProperty('color-scheme');
  });

  afterEach(() => {
    host.remove();
    localStorage.clear();
    root().removeAttribute('data-theme');
    root().style.removeProperty('color-scheme');
  });

  it('is three icons in one radio group, each named and explained in the language on the page; the system’s chosen at first', async () => {
    await draw();
    expect(host.querySelector('[role="radiogroup"]')?.getAttribute('aria-label')).toBe('Vzhľad');
    expect(options().map((option) => option.getAttribute('aria-label'))).toEqual(['Svetlý', 'Tmavý', 'Systémový']);
    expect(options().map((option) => option.getAttribute('title'))).toEqual(['Svetlý', 'Tmavý', 'Podľa nastavenia tvojho zariadenia']);
    expect(options().map((option) => option.textContent?.trim())).toEqual(['', '', '']);
    expect(options().map((option) => option.getAttribute('aria-checked'))).toEqual(['false', 'false', 'true']);
    // One stop for Tab: the choice made.
    expect(options().map((option) => option.tabIndex)).toEqual([-1, -1, 0]);
    expect(root().hasAttribute('data-theme')).toBe(false);
  });

  it('with no strings: the English it keeps, never a key', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    await draw([]);
    expect(host.querySelector('[role="radiogroup"]')?.getAttribute('aria-label')).toBe('Theme');
    expect(options().map((option) => option.getAttribute('aria-label'))).toEqual(['Light', 'Dark', 'System']);
    expect(options()[2].getAttribute('title')).toBe('As your device is set');
    expect(warn).not.toHaveBeenCalled();
    warn.mockRestore();
  });

  it('a choice of dark or light is the page’s and this device’s; the system’s takes both away again', async () => {
    await draw();
    options()[1].click();
    await fixture.whenStable();
    expect(root().getAttribute('data-theme')).toBe('dark');
    expect(root().style.colorScheme).toBe('dark');
    expect(localStorage.getItem(THEME_KEY)).toBe('dark');
    expect(options().map((option) => option.getAttribute('aria-checked'))).toEqual(['false', 'true', 'false']);

    options()[0].click();
    await fixture.whenStable();
    expect(root().getAttribute('data-theme')).toBe('light');
    expect(localStorage.getItem(THEME_KEY)).toBe('light');

    options()[2].click();
    await fixture.whenStable();
    expect(root().hasAttribute('data-theme')).toBe(false);
    expect(root().style.colorScheme).toBe('');
    expect(localStorage.getItem(THEME_KEY)).toBeNull();
  });

  it('starts from the choice this device kept', async () => {
    localStorage.setItem(THEME_KEY, 'dark');
    await draw();
    expect(options().map((option) => option.getAttribute('aria-checked'))).toEqual(['false', 'true', 'false']);
    expect(root().getAttribute('data-theme')).toBe('dark');
  });

  it('moves the choice with the arrow keys, round the three, the focus with it', async () => {
    await draw();
    options()[2].focus();
    const right = new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true, cancelable: true });
    options()[2].dispatchEvent(right);
    await fixture.whenStable();
    expect(right.defaultPrevented).toBe(true);
    expect(options()[0].getAttribute('aria-checked')).toBe('true');
    expect(document.activeElement).toBe(options()[0]);

    options()[0].dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowLeft', bubbles: true, cancelable: true }));
    await fixture.whenStable();
    expect(options()[2].getAttribute('aria-checked')).toBe('true');
    expect(document.activeElement).toBe(options()[2]);
  });

  it('reads in English in the admin area, whatever the reader chose', async () => {
    await draw();
    TestBed.inject(TranslationService).noteAddress('/admin/people');
    await fixture.whenStable();
    expect(options().map((option) => option.getAttribute('aria-label'))).toEqual(['Light', 'Dark', 'System']);
    expect(document.documentElement.lang).toBe('en');

    TestBed.inject(TranslationService).noteAddress('/kanji');
    await fixture.whenStable();
    expect(options().map((option) => option.getAttribute('aria-label'))).toEqual(['Svetlý', 'Tmavý', 'Systémový']);
    expect(document.documentElement.lang).toBe('sk');
  });
});
