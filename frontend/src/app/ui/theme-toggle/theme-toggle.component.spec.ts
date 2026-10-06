import { provideZonelessChangeDetection } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { AuthService } from '../../core/auth/auth.service';
import type { AnotokiPreferences } from '../../core/auth/sdk/anotoki-auth';
import { TranslationService } from '../../core/i18n/translation.service';
import { AuthStandIn, authStandIn, NO_CHOICE, person } from '../../core/testing/auth-states';
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

/** The sentences a refused save is worded with (errorKey()), as the migrations seed them. */
const ERRORS_SK = { 'error.offline': 'Server neodpovedá.', 'error.http': 'Server odpovedal chybou ({status}).', 'error.unknown': 'Niečo sa pokazilo.' };
const ERRORS_EN = { 'error.offline': 'The server does not answer.', 'error.http': 'The server answered with an error ({status}).', 'error.unknown': 'Something went wrong.' };

describe('ThemeToggleComponent: signed in, the theme is the account’s — one for every anotoki site', () => {
  let fixture: ComponentFixture<ThemeToggleComponent>;
  let host: HTMLElement;
  let auth: AuthStandIn;

  const options = () => Array.from(host.querySelectorAll<HTMLButtonElement>('[role="radio"]'));
  /** The choice the switch shows. */
  const checked = () => options().find((option) => option.getAttribute('aria-checked') === 'true')?.dataset['mode'];
  const root = () => document.documentElement;
  /** The line under the switch that says why a choice was not saved. */
  const line = () => host.querySelector('.refused');
  const theme = (chosen: AnotokiPreferences['theme']): AnotokiPreferences => ({ ...NO_CHOICE, theme: chosen });

  /** The switch, for somebody signed in whose account has these preferences (null: an IAM that sends none). */
  async function draw(preferences: AnotokiPreferences | null, translations = provideTestTranslations({ ...SLOVAK, ...ERRORS_SK }, { language: 'sk', english: { ...ENGLISH, ...ERRORS_EN } })): Promise<void> {
    auth = authStandIn('ready');
    auth.user.set(person(preferences));
    TestBed.configureTestingModule({ providers: [provideZonelessChangeDetection(), translations, { provide: AuthService, useValue: auth }] });
    fixture = TestBed.createComponent(ThemeToggleComponent);
    host = fixture.nativeElement;
    document.body.appendChild(host);
    await fixture.whenStable();
  }

  /** The IAM's answer has been taken in, and the page drawn with it. */
  async function settled(): Promise<void> {
    await new Promise((done) => setTimeout(done));
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

  it('shows the account’s theme at once, over this device’s own choice, and keeps it for the first paint of the next page load', async () => {
    localStorage.setItem(THEME_KEY, 'light');
    await draw(theme('dark'));
    expect(checked()).toBe('dark');
    expect(root().getAttribute('data-theme')).toBe('dark');
    expect(localStorage.getItem(THEME_KEY)).toBe('dark');
    expect(auth.saves, 'nothing to save: it is the account’s').toEqual([]);
  });

  it('follows the account when it changes — a choice on another anotoki site, or in another tab; its "auto" is the system’s', async () => {
    await draw(theme('dark'));
    auth.user.set(person(theme('auto')));
    await fixture.whenStable();
    expect(checked()).toBe('system');
    expect(root().hasAttribute('data-theme')).toBe(false);
    expect(localStorage.getItem(THEME_KEY)).toBeNull();

    auth.user.set(person(theme('light')));
    await fixture.whenStable();
    expect(checked()).toBe('light');
    expect(root().getAttribute('data-theme')).toBe('light');
    expect(localStorage.getItem(THEME_KEY)).toBe('light');
  });

  it('a choice is shown at once and saved to the account — in the admin panel too; a change of the account arriving meanwhile does not flick it back', async () => {
    await draw(theme('light'));
    TestBed.inject(TranslationService).noteAddress('/admin/people');
    options()[1].click();
    await fixture.whenStable();
    expect(checked()).toBe('dark');
    expect(root().getAttribute('data-theme')).toBe('dark');
    expect(localStorage.getItem(THEME_KEY)).toBe('dark');
    expect(auth.saves.map((save) => save.changes)).toEqual([{ theme: 'dark' }]);

    // Another tab's choice, read while this one's save is on its way: the page keeps what was chosen here.
    auth.user.set(person(theme('auto')));
    await fixture.whenStable();
    expect(checked()).toBe('dark');

    auth.saves[0].accept();
    await settled();
    expect(auth.user()?.preferences?.theme).toBe('dark');
    expect(checked()).toBe('dark');
    expect(line()).toBeNull();
  });

  it('saves one choice at a time, the latest last — and none the account has by then', async () => {
    await draw(theme('light'));
    options()[1].click();
    options()[2].click();
    options()[0].click();
    await fixture.whenStable();
    expect(checked(), 'each choice is shown at once').toBe('light');
    expect(auth.saves.map((save) => save.changes)).toEqual([{ theme: 'dark' }]);

    auth.saves[0].accept();
    await settled();
    expect(auth.saves.map((save) => save.changes), 'then the latest, light: the account has dark by then').toEqual([{ theme: 'dark' }, { theme: 'light' }]);
    expect(checked(), 'never back to dark meanwhile').toBe('light');
    auth.saves[1].accept();
    await settled();
    expect(checked()).toBe('light');

    // Back and forth while one is on its way, ending on what that one saves: nothing more to send.
    options()[1].click();
    options()[2].click();
    options()[1].click();
    auth.saves[2].accept();
    await settled();
    expect(auth.saves.map((save) => save.changes)).toEqual([{ theme: 'dark' }, { theme: 'light' }, { theme: 'dark' }]);
    expect(checked()).toBe('dark');
  });

  it('a refusal puts the account’s theme back and says why under the switch, in the language on the page — until a click elsewhere, Escape or the next choice', async () => {
    await draw(theme('light'));
    options()[1].click();
    await fixture.whenStable();
    expect(root().getAttribute('data-theme')).toBe('dark');

    auth.saves[0].refuse('network');
    await settled();
    expect(checked()).toBe('light');
    expect(root().getAttribute('data-theme')).toBe('light');
    expect(localStorage.getItem(THEME_KEY)).toBe('light');
    expect(line()?.getAttribute('role')).toBe('alert');
    expect(line()?.textContent?.trim()).toBe('Server neodpovedá.');
    document.body.click();
    await fixture.whenStable();
    expect(line()).toBeNull();

    // An answer that was not the IAM's own; Escape.
    options()[1].click();
    auth.saves[1].refuse('http_502');
    await settled();
    expect(line()?.textContent?.trim()).toBe('Server odpovedal chybou (502).');
    options()[0].dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }));
    await fixture.whenStable();
    expect(line()).toBeNull();

    // A code the app has no sentence for; the next choice.
    options()[1].click();
    auth.saves[2].refuse('temporarily_unavailable');
    await settled();
    expect(line()?.textContent?.trim()).toBe('Niečo sa pokazilo.');
    options()[1].click();
    await fixture.whenStable();
    expect(line()).toBeNull();
    expect(auth.saves.map((save) => save.changes)).toHaveLength(4);
  });

  it('a refusal said with no strings: the English the switch keeps, never a key', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    await draw(theme('light'), provideTestTranslations(ENGLISH));
    options()[1].click();
    auth.saves[0].refuse('network');
    await settled();
    expect(line()?.textContent?.trim()).toBe('The server does not answer.');
    expect(warn).not.toHaveBeenCalled();
    warn.mockRestore();
  });

  it('an IAM that sends no preferences, or nobody signed in: this device’s choice, as before, and nothing saved', async () => {
    localStorage.setItem(THEME_KEY, 'dark');
    await draw(null);
    expect(checked()).toBe('dark');
    options()[0].click();
    await fixture.whenStable();
    expect([checked(), localStorage.getItem(THEME_KEY)]).toEqual(['light', 'light']);

    // Signed out while the page is open (the Sign in card): the account's theme no longer counts.
    auth.user.set(person(theme('dark')));
    auth.state.set('signed-out');
    await fixture.whenStable();
    expect(checked()).toBe('light');
    options()[2].click();
    await fixture.whenStable();
    expect([checked(), localStorage.getItem(THEME_KEY), root().hasAttribute('data-theme')]).toEqual(['system', null, false]);
    expect(auth.saves).toEqual([]);
  });

  it('the line goes with the account (signed out in another tab), and a refusal that comes after it is not said', async () => {
    await draw(theme('light'));
    options()[1].click();
    auth.saves[0].refuse('network');
    await settled();
    expect(line()).not.toBeNull();
    auth.state.set('signed-out');
    await fixture.whenStable();
    expect(line()).toBeNull();

    // A save on its way as the session ends: nothing of the account's to put back, and its refusal is no news.
    auth.state.set('ready');
    await fixture.whenStable();
    options()[1].click();
    auth.state.set('signed-out');
    auth.saves[1].refuse('login_required');
    await settled();
    expect(line()).toBeNull();
    expect(checked(), 'the choice stays on this device').toBe('dark');
  });
});
