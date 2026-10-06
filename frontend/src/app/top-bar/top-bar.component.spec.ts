import { ChangeDetectionStrategy, Component, computed, provideZonelessChangeDetection, signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter, Router } from '@angular/router';
import { AppState, AuthService } from '../core/auth/auth.service';
import { AnotokiUser } from '../core/auth/sdk/anotoki-auth';
import { TranslationService } from '../core/i18n/translation.service';
import { SavesInFlight } from '../core/saves-in-flight.service';
import { provideTestTranslations } from '../core/testing/test-translations';
import { ThemeService } from '../core/theme/theme.service';
import { KanjiStateService } from '../kanji/kanji-state.service';
import { ADMIN_PHONE_BAR_MAX, PHONE_BAR_MAX, TopBarComponent } from './top-bar.component';
import { derivedFromState, derivedFromUser } from '../core/testing/auth-states';

const ENGLISH: Record<string, string> = {
  'topbar.home': 'anotoki Japanese: home',
  'topbar.sections': 'The app’s sections',
  'topbar.exam': 'Exam',
  'topbar.phoneMenu': 'Menu',
  'topbar.phoneMenuDue.one': 'Menu: {count} review due',
  'topbar.phoneMenuDue.few': 'Menu: {count} reviews due',
  'topbar.phoneMenuDue.other': 'Menu: {count} reviews due',
  'topbar.menuButton': 'Your menu: {name}',
  'topbar.menu': 'Your menu',
  'topbar.roleAdmin': 'Administrator',
  'topbar.roleEditor': 'Editor',
  'topbar.admin': 'Admin panel',
  'account.noName': 'Account',
  'account.yourAccount': 'Your anotoki account',
  'account.signOut': 'Sign out',
  'signOut.saving': 'Saving…',
  'signOut.notSaved': 'Some of your answers or notes could not be saved, and signing out loses them. Sign out anyway?',
  'signOut.examOpen': 'Your exam is not finished, and signing out loses the test. Sign out anyway?',
  'signIn.button': 'Sign in',
  'theme.label': 'Theme',
  'theme.light': 'Light',
  'theme.dark': 'Dark',
  'theme.system': 'System',
  'theme.systemHint': 'As your device is set',
  'language.button': 'Language: {name} ({code})',
  'language.notLoaded': 'The language could not be loaded. Try again.',
};
const SLOVAK: Record<string, string> = {
  'topbar.home': 'anotoki Japanese: domov',
  'topbar.sections': 'Časti aplikácie',
  'topbar.exam': 'Skúška',
  'topbar.phoneMenu': 'Ponuka',
  'topbar.phoneMenuDue.one': 'Ponuka: {count} opakovanie čaká',
  'topbar.phoneMenuDue.few': 'Ponuka: {count} opakovania čakajú',
  'topbar.phoneMenuDue.other': 'Ponuka: {count} opakovaní čaká',
  'topbar.menuButton': 'Tvoja ponuka: {name}',
  'topbar.menu': 'Tvoja ponuka',
  'topbar.roleAdmin': 'Administrátor',
  'topbar.roleEditor': 'Editor',
  'topbar.admin': 'Administrátorský panel',
  'account.noName': 'Účet',
  'account.yourAccount': 'Tvoj účet anotoki',
  'account.signOut': 'Odhlásiť sa',
  'signOut.saving': 'Ukladá sa…',
  'signOut.notSaved': 'Niektoré tvoje odpovede alebo poznámky sa nepodarilo uložiť a odhlásením sa stratia. Chceš sa aj tak odhlásiť?',
  'signOut.examOpen': 'Tvoja skúška nie je dokončená a odhlásením sa test stratí. Chceš sa aj tak odhlásiť?',
  'signIn.button': 'Prihlásiť sa',
  'theme.label': 'Vzhľad',
  'theme.light': 'Svetlý',
  'theme.dark': 'Tmavý',
  'theme.system': 'Systémový',
  'theme.systemHint': 'Podľa nastavenia tvojho zariadenia',
  'language.button': 'Jazyk: {name} ({code})',
  'language.notLoaded': 'Jazyk sa nepodarilo načítať. Skús to znova.',
};

/** Whatever page the router draws: the bar only needs it to be somewhere. */
@Component({ selector: 'app-test-page', changeDetection: ChangeDetectionStrategy.OnPush, template: '' })
class PageComponent {}

/** An IAM that sends no preferences: the bar's theme is this device's (the account's: theme-toggle.component.spec.ts). */
const HANA: AnotokiUser = { sub: '7', preferred_username: 'hana', email: 'hana@example.test', email_verified: true, locale: null, roles: [], preferences: null };

describe('TopBarComponent', () => {
  const state = signal<AppState>('ready');
  const user = signal<AnotokiUser | null>(HANA);
  const roles = signal<string[]>(['ADMIN']);
  const showSignIn = signal(false);
  const auth = {
    state,
    ...derivedFromState(state),
    loginRequired: signal(true),
    user,
    ...derivedFromUser(state, user),
    showSignIn,
    displayName: computed(() => user()?.preferred_username || user()?.email || ''),
    isAdmin: computed(() => roles().includes('ADMIN')),
    isStaff: computed(() => roles().includes('ADMIN') || roles().includes('EDITOR')),
    accountUrl: () => 'https://iam.example.test/account',
    login: vi.fn(async (_uiLocales?: string) => true),
    logout: vi.fn(async () => undefined),
  };
  const due = signal(0);

  let fixture: ComponentFixture<TopBarComponent>;
  let host: HTMLElement;
  /** Every keydown that got as far as `document` — where the lesson quiz, the reviews and the exam listen. */
  let reached: string[];
  const onDocument = (event: KeyboardEvent): void => void reached.push(event.key);

  // The window as the bar's media query sees it: its width, and the listeners told when it changes.
  let width = 1280;
  const resized = new Set<() => void>();

  const userButton = () => host.querySelector<HTMLButtonElement>('.user-button')!;
  const phoneButton = () => host.querySelector<HTMLButtonElement>('.menu-button')!;
  const items = () => Array.from(host.querySelectorAll<HTMLElement>('[role="menuitem"]'));
  const words = (element: Element | null | undefined) => element?.textContent?.replace(/\s+/g, ' ').trim();
  /** The words of each element a selector finds, in order. */
  const parts = (selector: string) => Array.from(host.querySelectorAll(selector)).map(words);
  const links = () => Array.from(host.querySelectorAll<HTMLAnchorElement>('.topbar-nav a'));
  /** A link as "words href", with " [page]" for aria-current and " [here]" for the section the page is in. */
  const described = (link: HTMLAnchorElement) =>
    `${words(link)} ${link.getAttribute('href')}${link.getAttribute('aria-current') === 'page' ? ' [page]' : ''}${link.classList.contains('is-active') ? ' [here]' : ''}`;
  /** What stands in an element, in order: each child as tag.firstClass. */
  const childrenOf = (selector: string) =>
    Array.from(host.querySelector(selector)!.children).map((child) => child.tagName.toLowerCase() + (child.className ? '.' + String(child.className).split(' ')[0] : ''));

  /** A key pressed on an element, as the browser sends it: it bubbles. */
  function press(on: Element, key: string, shiftKey = false): KeyboardEvent {
    const event = new KeyboardEvent('keydown', { key, shiftKey, bubbles: true, cancelable: true });
    on.dispatchEvent(event);
    return event;
  }

  /** A window `w` wide, as the bar's media queries see it from the start. */
  function windowOf(w: number): void {
    width = w;
  }

  /** The window changes width while the bar is there (a turned tablet). */
  async function resize(w: number): Promise<void> {
    width = w;
    resized.forEach((tell) => tell());
    await fixture.whenStable();
  }

  async function draw(translations = provideTestTranslations(SLOVAK, { language: 'sk', english: ENGLISH })): Promise<void> {
    TestBed.configureTestingModule({
      providers: [
        provideZonelessChangeDetection(),
        translations,
        provideRouter([{ path: '**', component: PageComponent }]),
        { provide: AuthService, useValue: auth },
        { provide: KanjiStateService, useValue: { reviewsDue: due } },
      ],
    });
    fixture = TestBed.createComponent(TopBarComponent);
    host = fixture.nativeElement;
    document.body.appendChild(host);
    await fixture.whenStable();
  }

  async function at(url: string): Promise<void> {
    TestBed.inject(TranslationService).noteAddress(url);
    await TestBed.inject(Router).navigateByUrl(url);
    await fixture.whenStable();
  }

  async function openMenu(): Promise<void> {
    (host.querySelector<HTMLButtonElement>('.user-button') ?? phoneButton()).click();
    await fixture.whenStable();
  }

  beforeEach(() => {
    state.set('ready');
    user.set(HANA);
    roles.set(['ADMIN']);
    showSignIn.set(false);
    due.set(0);
    auth.login.mockClear();
    auth.logout.mockClear();
    width = 1280;
    resized.clear();
    vi.stubGlobal('matchMedia', (query: string) => {
      const max = Number(/max-width:\s*(\d+)px/.exec(query)?.[1] ?? Infinity);
      return {
        get matches() {
          return width <= max;
        },
        addEventListener: (_type: string, tell: () => void) => resized.add(tell),
        removeEventListener: (_type: string, tell: () => void) => resized.delete(tell),
      };
    });
    reached = [];
    document.addEventListener('keydown', onDocument);
    localStorage.clear();
  });

  afterEach(() => {
    document.removeEventListener('keydown', onDocument);
    fixture?.destroy();
    host?.remove();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
    localStorage.clear();
    document.documentElement.removeAttribute('data-theme');
  });

  /* ------------------------------------------------------------ the row */

  it('is one row in the family’s order: the brand, the links, then the language, the theme and the person', async () => {
    await draw();
    expect(childrenOf('.topbar-inner')).toEqual(['app-brand', 'nav.topbar-nav', 'div.topbar-actions']);
    expect(childrenOf('.topbar-actions')).toEqual(['app-language-chooser', 'app-theme-toggle', 'div.user-menu']);
    expect(host.querySelector('.topbar-nav')?.getAttribute('aria-label')).toBe('Časti aplikácie');
    // The brand: the mark, "anotoki" and the app's name, its link named with the words it shows.
    expect(parts('app-brand .wordmark > span')).toEqual(['anotoki', 'Japanese']);
    expect(host.querySelector('app-brand img')?.getAttribute('alt')).toBe('');
    expect(host.querySelector('app-brand a')?.getAttribute('aria-label')).toBe('anotoki Japanese: domov');
    expect(host.querySelector('app-brand a')?.getAttribute('href')).toBe('/');
  });

  it('links Kanji and the exam, marks the section the page is in, and the brand on the home page', async () => {
    await draw();
    await at('/');
    expect(links().map(described)).toEqual(['Kanji /kanji', 'Skúška /exam']);
    expect(host.querySelector('app-brand a')?.getAttribute('aria-current')).toBe('page');
    await at('/kanji');
    expect(links().map(described)).toEqual(['Kanji /kanji [page] [here]', 'Skúška /exam']);
    expect(host.querySelector('app-brand a')?.hasAttribute('aria-current')).toBe(false);
    await at('/kanji/reviews?from=home');
    expect(links().map(described)).toEqual(['Kanji /kanji [here]', 'Skúška /exam']);
    await at('/exam');
    expect(links().map(described)).toEqual(['Kanji /kanji', 'Skúška /exam [page] [here]']);
    // "Kanji" is a term, the same in every language.
    expect(links()[0].getAttribute('lang')).toBe('en');
    expect(links()[1].hasAttribute('lang')).toBe(false);
  });

  it('shows the reviews due on the Kanji link — three digits too', async () => {
    await draw();
    expect(host.querySelector('#navDue')).toBeNull();
    due.set(125);
    await fixture.whenStable();
    expect(words(host.querySelector('#navDue'))).toBe('125');
    expect(links().map(words)).toEqual(['Kanji 125', 'Skúška']);
  });

  it('in the admin panel: its sections, English, for whom they are; no language chooser; the brand to the panel, by its name', async () => {
    await draw();
    await at('/admin/translations');
    expect(links().map(described)).toEqual([
      'Translations /admin/translations [page] [here]',
      'Languages /admin/languages',
      'People /admin/people',
      'Migrations /admin/migrations',
    ]);
    expect(links().every((link) => link.getAttribute('lang') === 'en')).toBe(true);
    expect(host.querySelector('app-language-chooser')).toBeNull();
    expect(host.querySelector('app-brand a')?.getAttribute('href')).toBe('/admin');
    expect(host.querySelector('app-brand a')?.getAttribute('aria-label')).toBe('anotoki Japanese admin panel: home');
    expect(parts('app-brand .wordmark > span')).toEqual(['anotoki', 'Japanese admin panel']);
    await at('/admin/migrations');
    expect(links().map(described)).toEqual([
      'Translations /admin/translations',
      'Languages /admin/languages',
      'People /admin/people',
      'Migrations /admin/migrations [page] [here]',
    ]);

    // An editor's admin panel is Translations alone: Languages, People and Migrations are an administrator's.
    roles.set(['EDITOR']);
    await fixture.whenStable();
    expect(links().map(described)).toEqual(['Translations /admin/translations']);
  });

  it('reads in English in the admin area, whatever the person reads — with no case of its own', async () => {
    await draw();
    await at('/admin/languages');
    expect(host.querySelector('.topbar-nav')?.getAttribute('aria-label')).toBe('The app’s sections');
    expect(userButton().getAttribute('aria-label')).toBe('Your menu: hana');
    expect(Array.from(host.querySelectorAll('[role="radio"]')).map((radio) => radio.getAttribute('aria-label'))).toEqual(['Light', 'Dark', 'System']);

    await openMenu();
    expect(words(host.querySelector('.menu-role'))).toBe('Administrator');
    expect(items().map(words)).toEqual(['Your anotoki account', 'Back to Japanese Academy', 'Sign out']);
    expect(items()[1].getAttribute('href')).toBe('/');
    expect(items()[1].getAttribute('lang')).toBe('en');

    // Back on a learner's page, the person's language again.
    await at('/');
    expect(host.querySelector('.topbar-nav')?.getAttribute('aria-label')).toBe('Časti aplikácie');
    expect(host.querySelector('app-language-chooser')).not.toBeNull();
  });

  /* ---------------------------------------------------- the person's menu */

  it('the person’s menu: name, address and role; their anotoki account; Admin panel for staff; Sign out — in their language', async () => {
    await draw();
    expect(userButton().getAttribute('aria-label')).toBe('Tvoja ponuka: hana');
    expect(userButton().getAttribute('aria-haspopup')).toBe('menu');
    expect(userButton().getAttribute('aria-expanded')).toBe('false');
    expect(words(host.querySelector('.user-name'))).toBe('hana');
    expect(words(host.querySelector('.avatar'))).toBe('H');

    await openMenu();
    expect(userButton().getAttribute('aria-expanded')).toBe('true');
    const menu = host.querySelector('[role="menu"]')!;
    expect(menu.id).toBe(userButton().getAttribute('aria-controls'));
    expect(menu.getAttribute('aria-label')).toBe('Tvoja ponuka');
    expect(parts('.menu-head > span')).toEqual(['hana', 'hana@example.test', 'Administrátor']);
    expect(host.querySelector('.menu-head')?.getAttribute('role')).toBe('none');
    expect(items().map(words)).toEqual(['Tvoj účet anotoki', 'Administrátorský panel', 'Odhlásiť sa']);
    expect([items()[0].getAttribute('href'), items()[0].getAttribute('target'), items()[0].getAttribute('rel')]).toEqual([
      'https://iam.example.test/account',
      '_blank',
      'noopener',
    ]);
    expect(items()[1].getAttribute('href')).toBe('/admin');

    roles.set(['EDITOR']);
    await fixture.whenStable();
    expect(words(host.querySelector('.menu-role'))).toBe('Editor');

    // A learner: no role, no way into the admin area.
    roles.set([]);
    await fixture.whenStable();
    expect(host.querySelector('.menu-role')).toBeNull();
    expect(items().map(words)).toEqual(['Tvoj účet anotoki', 'Odhlásiť sa']);
  });

  it('an account with neither a name nor an address is the app’s own word for it', async () => {
    user.set({ ...HANA, preferred_username: null, email: null });
    await draw();
    expect(userButton().getAttribute('aria-label')).toBe('Tvoja ponuka: Účet');
    await openMenu();
    expect(parts('.menu-head > span')).toEqual(['Účet', 'Administrátor']);
  });

  it('moves focus into the menu when it opens; the arrows, Home and End move in it; Escape back to its button', async () => {
    await draw();
    await openMenu();
    expect(items()).toHaveLength(3);
    expect(document.activeElement).toBe(items()[0]);

    press(items()[0], 'ArrowDown');
    expect(document.activeElement).toBe(items()[1]);
    press(items()[1], 'End');
    expect(document.activeElement).toBe(items()[2]);
    press(items()[2], 'ArrowDown');
    expect(document.activeElement).toBe(items()[0]);
    press(items()[0], 'ArrowUp');
    expect(document.activeElement).toBe(items()[2]);
    press(items()[2], 'Home');
    expect(document.activeElement).toBe(items()[0]);

    // Escape pressed in the menu: the bar's own (no document listener hears a key of the bar).
    press(items()[0], 'Escape');
    await fixture.whenStable();
    expect(items()).toEqual([]);
    expect(document.activeElement).toBe(userButton());
    expect(reached).toEqual([]);

    // Escape pressed elsewhere closes it too.
    await openMenu();
    document.body.focus();
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    await fixture.whenStable();
    expect(items()).toEqual([]);
  });

  it('puts away the theme switch’s line about a choice the account refused on Escape pressed on any of the bar’s controls', async () => {
    await draw();
    const theme = TestBed.inject(ThemeService);
    theme.refused.set('network');
    await fixture.whenStable();
    expect(host.querySelector('.refused')?.textContent?.trim(), 'with no string of its own here: the English the switch keeps').toBe('The server does not answer.');

    press(host.querySelector('#nav-kanji')!, 'Escape');
    await fixture.whenStable();
    expect(host.querySelector('.refused')).toBeNull();
    expect(reached, 'the bar keeps the key').toEqual([]);

    theme.refused.set('network');
    await fixture.whenStable();
    press(userButton(), 'Escape');
    await fixture.whenStable();
    expect(theme.refused()).toBeNull();
  });

  /**
   * Tab (and Shift+Tab) from the first, a middle and the last item of the open
   * menu: the menu closes, the browser's own move is stopped (it would land on
   * the next item of a menu about to go, then on <body>), and the focus is on
   * the button that opened it — where the next Tab moves on from.
   */
  async function expectTabOut(button: () => HTMLButtonElement): Promise<void> {
    if (items().length === 0) {
      button().click();
      await fixture.whenStable();
    }
    const count = items().length;
    expect(count).toBeGreaterThanOrEqual(3);
    for (const [which, shift] of [
      [0, false],
      [1, false],
      [count - 1, false],
      [0, true],
      [1, true],
      [count - 1, true],
    ] as const) {
      if (items().length === 0) {
        button().click();
        await fixture.whenStable();
      }
      expect(items().length).toBe(count);
      items()[which].focus();
      const tab = press(items()[which], 'Tab', shift);
      expect(tab.defaultPrevented, `Tab from item ${which}${shift ? ' with Shift' : ''}`).toBe(true);
      expect(document.activeElement).toBe(button());
      await fixture.whenStable();
      expect(items()).toEqual([]);
      expect(button().getAttribute('aria-expanded')).toBe('false');
      expect(document.activeElement, 'never <body>').toBe(button());
    }
  }

  it('closes on Tab and Shift+Tab with the focus on its button, from the first, a middle and the last item — never on <body>', async () => {
    await draw();
    await expectTabOut(userButton);
  });

  it('closes on a click outside it — a click inside it is no reason to — and when an item is chosen', async () => {
    await draw();
    await openMenu();
    host.querySelector<HTMLElement>('.menu-head')!.click();
    await fixture.whenStable();
    expect(items()).toHaveLength(3);

    document.body.click();
    await fixture.whenStable();
    expect(items()).toEqual([]);
    expect(userButton().getAttribute('aria-expanded')).toBe('false');

    await openMenu();
    items()[1].click();
    await fixture.whenStable();
    expect(items()).toEqual([]);
    expect(TestBed.inject(Router).url).toBe('/admin');

    // The button again closes it, the focus on the button.
    await openMenu();
    userButton().click();
    await fixture.whenStable();
    expect(items()).toEqual([]);
    expect(document.activeElement).toBe(userButton());
  });

  it('follows a change of language without being drawn again', async () => {
    await draw();
    await TestBed.inject(TranslationService).setLanguage('en', false);
    await fixture.whenStable();
    expect(userButton().getAttribute('aria-label')).toBe('Your menu: hana');
    expect(links().map(words)).toEqual(['Kanji', 'Exam']);
    expect(host.querySelector('app-brand a')?.getAttribute('aria-label')).toBe('anotoki Japanese: home');
  });

  /* --------------------------------------------------- the other states */

  it('with no strings (the bar is drawn whatever became of them): the English it keeps — never a key', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    due.set(3);
    await draw(provideTestTranslations({}));
    expect(links().map(words)).toEqual(['Kanji 3', 'Exam']);
    expect(host.querySelector('app-brand a')?.getAttribute('aria-label')).toBe('anotoki Japanese: home');
    expect(host.querySelector('.topbar-nav')?.getAttribute('aria-label')).toBe('The app’s sections');
    expect(userButton().getAttribute('aria-label')).toBe('Your menu: hana');
    await openMenu();
    expect(items().map(words)).toEqual(['Your anotoki account', 'Admin panel', 'Sign out']);
    expect(warn).not.toHaveBeenCalled();
  });

  it('signed out (the Sign in card on the page): the button to sign in, which opens the IAM in the reader’s language — and no links', async () => {
    state.set('signed-out');
    user.set(null);
    roles.set([]);
    showSignIn.set(true);
    await draw();
    expect(links()).toEqual([]);
    expect(host.querySelector('.user-button')).toBeNull();
    const button = host.querySelector<HTMLButtonElement>('#signInButton')!;
    expect(words(button)).toBe('Prihlásiť sa');
    button.click();
    expect(auth.login).toHaveBeenCalledWith('sk');
  });

  it('visiting (nobody signed in, sign-in not required here): Kanji and Exam, and Sign in — nobody’s menu', async () => {
    state.set('visiting');
    user.set(null);
    roles.set([]);
    await draw();
    expect(links().map(described)).toEqual(['Kanji /kanji', 'Skúška /exam']);
    expect(host.querySelector('.user-button')).toBeNull();
    expect(childrenOf('.topbar-actions')).toEqual(['app-language-chooser', 'app-theme-toggle', 'button.primary']);
    expect(words(host.querySelector('#signInButton'))).toBe('Prihlásiť sa');
  });

  it('visiting: Sign in waits for the saves on their way — the one that brings the visitor’s key among them — then the IAM, in the reader’s language', async () => {
    state.set('visiting');
    user.set(null);
    roles.set([]);
    await draw();
    let land!: () => void;
    TestBed.inject(SavesInFlight).track(new Promise<void>((done) => (land = done)));
    const button = host.querySelector<HTMLButtonElement>('#signInButton')!;
    button.click();
    await fixture.whenStable();
    expect([button.disabled, button.getAttribute('aria-busy'), words(button)]).toEqual([true, 'true', 'Ukladá sa…']);
    expect(button.querySelector('.spinner')).not.toBeNull();
    expect(auth.login).not.toHaveBeenCalled();

    land();
    await new Promise((done) => setTimeout(done));
    expect(auth.login).toHaveBeenCalledWith('sk');
  });

  it('visiting: an exam paper open is asked about first, in the words of signing in — and Cancel stays', async () => {
    state.set('visiting');
    user.set(null);
    roles.set([]);
    await draw();
    const asked = vi.spyOn(window, 'confirm').mockReturnValue(false);
    TestBed.inject(SavesInFlight).watch(() => 'signOut.examOpen');
    host.querySelector<HTMLButtonElement>('#signInButton')!.click();
    await new Promise((done) => setTimeout(done));
    expect(asked).toHaveBeenCalledWith('signIn.examOpen');
    expect(auth.login).not.toHaveBeenCalled();
    asked.mockRestore();
  });

  it('on the way to the IAM, and while the copy is not set up: the brand, the language and the theme — nothing to follow, nobody', async () => {
    state.set('signed-out');
    user.set(null);
    await draw();
    expect(childrenOf('.topbar-actions')).toEqual(['app-language-chooser', 'app-theme-toggle']);

    state.set('not-set-up');
    await fixture.whenStable();
    expect(childrenOf('.topbar-inner')).toEqual(['app-brand', 'div.topbar-actions']);
    expect(childrenOf('.topbar-actions')).toEqual(['app-language-chooser', 'app-theme-toggle']);
  });

  /* ---------------------------------------------- no key reaches the page */

  it('keeps every key of every control to itself: Enter and Space never reach the document, where a quiz or a paper listens', async () => {
    due.set(12);
    await draw();
    const controls = (): Element[] => [
      host.querySelector('app-brand a')!,
      ...links(),
      host.querySelector('#langButton')!,
      ...Array.from(host.querySelectorAll('[role="radio"]')),
      userButton(),
    ];
    expect(controls()).toHaveLength(8);
    for (const control of controls()) {
      for (const key of ['Enter', ' ', 'a', '1', 'f', 'r', 'ArrowLeft', 'ArrowRight']) {
        const event = press(control, key);
        if (key === 'Enter' || key === ' ') {
          // What the key does on the control is the browser's, and stays so.
          expect(event.defaultPrevented, `${key} on ${control.outerHTML.slice(0, 40)}`).toBe(false);
        }
      }
    }
    await openMenu();
    for (const item of items()) {
      for (const key of ['Enter', ' ', 'a', '1', 'f']) {
        press(item, key);
      }
    }
    expect(reached).toEqual([]);

    // A key pressed anywhere else still gets there.
    press(document.body, 'Enter');
    expect(reached).toEqual(['Enter']);
  });

  it('on a phone too: the menu button and the items of its menu keep their keys', async () => {
    windowOf(390);
    due.set(4);
    await draw();
    for (const key of ['Enter', ' ', 'a']) {
      press(phoneButton(), key);
    }
    await openMenu();
    for (const item of items()) {
      press(item, 'Enter');
      press(item, ' ');
    }
    expect(reached).toEqual([]);
  });

  /* ------------------------------------------------------------- a phone */

  describe('on a phone', () => {
    it('is the brand (the mark and the app’s name), the language, the theme and a menu button — nothing else in the row', async () => {
      windowOf(390);
      await draw();
      expect(parts('app-brand .wordmark > span')).toEqual(['Japanese']);
      expect(host.querySelector('.topbar-nav')).toBeNull();
      expect(host.querySelector('.user-button')).toBeNull();
      expect(childrenOf('.topbar-actions')).toEqual(['app-language-chooser', 'app-theme-toggle', 'div.phone-menu']);
      expect(phoneButton().getAttribute('aria-label')).toBe('Ponuka');
      expect(phoneButton().getAttribute('aria-haspopup')).toBe('menu');
      expect(phoneButton().getAttribute('aria-expanded')).toBe('false');
      expect(host.querySelector('#menuDue')).toBeNull();
    });

    it('carries the reviews due on its menu button, and says them in its name (Label in Name), one, few and other', async () => {
      windowOf(360);
      due.set(125);
      await draw();
      expect(words(host.querySelector('#menuDue'))).toBe('125');
      expect(host.querySelector('#menuDue')?.getAttribute('aria-hidden')).toBe('true');
      expect(phoneButton().getAttribute('aria-label')).toBe('Ponuka: 125 opakovaní čaká');
      due.set(3);
      await fixture.whenStable();
      expect(phoneButton().getAttribute('aria-label')).toBe('Ponuka: 3 opakovania čakajú');
      due.set(1);
      await fixture.whenStable();
      expect(phoneButton().getAttribute('aria-label')).toBe('Ponuka: 1 opakovanie čaká');

      // The admin area has no Kanji link: no count on its button.
      await at('/admin/translations');
      expect(host.querySelector('#menuDue')).toBeNull();
      expect(phoneButton().getAttribute('aria-label')).toBe('Menu');
    });

    it('holds the links and the person’s menu: focus in, the arrows, Home, Escape back to its button', async () => {
      windowOf(360);
      due.set(125);
      await draw();
      await at('/kanji');
      await openMenu();
      expect(phoneButton().getAttribute('aria-expanded')).toBe('true');
      expect(host.querySelector('#topbar-menu')?.getAttribute('aria-label')).toBe('Ponuka: 125 opakovaní čaká');
      expect(items().map(words)).toEqual(['Kanji 125', 'Skúška', 'Tvoj účet anotoki', 'Administrátorský panel', 'Odhlásiť sa']);
      expect(items()[0].getAttribute('aria-current')).toBe('page');
      expect(parts('#topbar-menu .menu-head > span')).toEqual(['hana', 'hana@example.test', 'Administrátor']);
      expect(document.activeElement).toBe(items()[0]);

      press(items()[0], 'ArrowUp');
      expect(document.activeElement).toBe(items().at(-1));
      press(items().at(-1)!, 'Home');
      expect(document.activeElement).toBe(items()[0]);

      press(items()[0], 'Escape');
      await fixture.whenStable();
      expect(items()).toEqual([]);
      expect(document.activeElement).toBe(phoneButton());
    });

    it('closes when a link is chosen, on a click outside, and on Tab and Shift+Tab out of it from the first, a middle and the last item', async () => {
      windowOf(390);
      await draw();
      await at('/admin/translations');
      await openMenu();
      expect(items().map(words)).toEqual(['Translations', 'Languages', 'People', 'Migrations', 'Your anotoki account', 'Back to Japanese Academy', 'Sign out']);
      items()[1].click();
      await fixture.whenStable();
      expect(items()).toEqual([]);
      expect(TestBed.inject(Router).url).toBe('/admin/languages');

      await openMenu();
      document.body.click();
      await fixture.whenStable();
      expect(items()).toEqual([]);

      await expectTabOut(phoneButton);
    });

    it('signed out: Sign in is in the menu', async () => {
      state.set('signed-out');
      user.set(null);
      roles.set([]);
      showSignIn.set(true);
      windowOf(360);
      await draw();
      expect(host.querySelector('#signInButton')).toBeNull();
      await openMenu();
      expect(items().map(words)).toEqual(['Prihlásiť sa']);
      items()[0].click();
      await fixture.whenStable();
      expect(auth.login).toHaveBeenCalledWith('sk');
      expect(items()).toEqual([]);
    });

    it('visiting: the links and Sign in are in the menu', async () => {
      state.set('visiting');
      user.set(null);
      roles.set([]);
      windowOf(360);
      await draw();
      expect(host.querySelector('#signInButton')).toBeNull();
      await openMenu();
      expect(items().map(words)).toEqual(['Kanji', 'Skúška', 'Prihlásiť sa']);
      items()[2].click();
      await new Promise((done) => setTimeout(done));
      expect(auth.login).toHaveBeenCalledWith('sk');
    });

    it('visiting: Sign in waits in the open menu — its spinner and “Saving…”, the focus on the menu button, never on <body> — then the IAM, the menu closed', async () => {
      state.set('visiting');
      user.set(null);
      roles.set([]);
      windowOf(390);
      await draw();
      let land!: () => void;
      TestBed.inject(SavesInFlight).track(new Promise<void>((done) => (land = done)));
      await openMenu();
      expect(document.activeElement).toBe(items()[0]);
      host.querySelector<HTMLButtonElement>('#signInItem')!.click();
      await fixture.whenStable();
      const item = host.querySelector<HTMLButtonElement>('#signInItem')!;
      expect(phoneButton().getAttribute('aria-expanded'), 'the menu stays open while it waits').toBe('true');
      expect([item.disabled, item.getAttribute('aria-busy'), words(item)]).toEqual([true, 'true', 'Ukladá sa…']);
      expect(item.querySelector('.spinner')).not.toBeNull();
      // The item is disabled while it waits: the focus waits on the menu button, not where a disabled item drops it.
      expect(document.activeElement).toBe(phoneButton());
      expect(auth.login).not.toHaveBeenCalled();

      land();
      await new Promise((done) => setTimeout(done));
      await fixture.whenStable();
      expect(auth.login).toHaveBeenCalledWith('sk');
      expect(items()).toEqual([]);
      expect(phoneButton().getAttribute('aria-expanded')).toBe('false');
      expect(document.activeElement).toBe(phoneButton());
    });

    it('visiting: told to stay (an exam paper open), the menu closes with the focus on its button', async () => {
      state.set('visiting');
      user.set(null);
      roles.set([]);
      windowOf(390);
      await draw();
      const asked = vi.spyOn(window, 'confirm').mockReturnValue(false);
      TestBed.inject(SavesInFlight).watch(() => 'signOut.examOpen');
      await openMenu();
      host.querySelector<HTMLButtonElement>('#signInItem')!.click();
      await new Promise((done) => setTimeout(done));
      await fixture.whenStable();
      expect(asked).toHaveBeenCalledWith('signIn.examOpen');
      expect(auth.login).not.toHaveBeenCalled();
      expect(items()).toEqual([]);
      expect(document.activeElement).toBe(phoneButton());
      asked.mockRestore();
    });

    it('while the copy is not set up there is nothing to hold, and no menu button', async () => {
      state.set('not-set-up');
      user.set(null);
      windowOf(390);
      await draw();
      expect(host.querySelector('.menu-button')).toBeNull();
    });

    it(`is a desktop’s bar from ${PHONE_BAR_MAX + 1} px: the links and the person in the row again, the full brand`, async () => {
      windowOf(PHONE_BAR_MAX + 1);
      await draw();
      expect(host.querySelector('.menu-button')).toBeNull();
      expect(links().map(words)).toEqual(['Kanji', 'Skúška']);
      expect(userButton()).not.toBeNull();
      expect(parts('app-brand .wordmark > span')).toEqual(['anotoki', 'Japanese']);
    });

    it(`the admin panel's four links fold up to ${ADMIN_PHONE_BAR_MAX} px, the whole brand beside the button from ${PHONE_BAR_MAX + 1}; on a phone "admin panel"`, async () => {
      windowOf(ADMIN_PHONE_BAR_MAX);
      await draw();
      await at('/admin/translations');
      expect(links()).toEqual([]);
      expect(phoneButton()).not.toBeNull();
      expect(parts('app-brand .wordmark > span')).toEqual(['anotoki', 'Japanese admin panel']);
      await openMenu();
      expect(items().map(words)).toEqual(['Translations', 'Languages', 'People', 'Migrations', 'Your anotoki account', 'Back to Japanese Academy', 'Sign out']);
      await resize(ADMIN_PHONE_BAR_MAX + 1);
      expect(items(), 'the menu closes as the bar unfolds').toEqual([]);
      expect(links().map(words)).toEqual(['Translations', 'Languages', 'People', 'Migrations']);
      await resize(390);
      expect(parts('app-brand .wordmark > span')).toEqual(['admin panel']);
      expect(host.querySelector('app-brand a')?.getAttribute('aria-label')).toBe('anotoki Japanese admin panel: home');
      // The learner's pages fold at their own width: a desktop's bar at the same window.
      await resize(ADMIN_PHONE_BAR_MAX);
      await at('/kanji');
      expect(links().map(words)).toEqual(['Kanji', 'Skúška']);
    });

    it(`a crossing of ${PHONE_BAR_MAX} px closes the open menu, either way`, async () => {
      windowOf(PHONE_BAR_MAX);
      await draw();
      await openMenu();
      expect(items().length).toBeGreaterThan(0);
      await resize(PHONE_BAR_MAX + 1);
      expect(items()).toEqual([]);
      expect(host.querySelector('.menu-button')).toBeNull();

      await openMenu();
      expect(items()).toHaveLength(3);
      await resize(PHONE_BAR_MAX);
      expect(items()).toEqual([]);
      expect(phoneButton().getAttribute('aria-expanded')).toBe('false');
    });
  });

  /* ------------------------------------------------------------ sign-out */

  describe('signing out', () => {
    async function chooseSignOut(): Promise<void> {
      await openMenu();
      items()
        .find((item) => item.id === 'signOut')!
        .click();
      await fixture.whenStable();
    }

    it('waits for the answers still on their way — a spinner and “Saving…” — then the IAM signs the person out', async () => {
      await draw();
      let land!: () => void;
      TestBed.inject(SavesInFlight).track(new Promise<void>((done) => (land = done)));
      await chooseSignOut();

      const button = host.querySelector<HTMLButtonElement>('#signOut')!;
      expect(button.getAttribute('aria-busy')).toBe('true');
      expect(button.disabled).toBe(true);
      expect(words(button)).toBe('Ukladá sa…');
      expect(button.querySelector('.spinner')).not.toBeNull();
      expect(auth.logout).not.toHaveBeenCalled();

      land();
      await new Promise((done) => setTimeout(done));
      await fixture.whenStable();
      expect(auth.logout).toHaveBeenCalledTimes(1);
    });

    it('asks first, in the reader’s language, when an exam paper is open — and stays when told to', async () => {
      await draw();
      const asked = vi.spyOn(window, 'confirm').mockReturnValue(false);
      TestBed.inject(SavesInFlight).watch(() => 'signOut.examOpen');
      await chooseSignOut();
      await new Promise((done) => setTimeout(done));
      expect(asked).toHaveBeenCalledWith('Tvoja skúška nie je dokončená a odhlásením sa test stratí. Chceš sa aj tak odhlásiť?');
      expect(auth.logout).not.toHaveBeenCalled();
      await fixture.whenStable();
      expect(host.querySelector<HTMLButtonElement>('#signOut')!.disabled).toBe(false);

      asked.mockReturnValue(true);
      host.querySelector<HTMLButtonElement>('#signOut')!.click();
      await new Promise((done) => setTimeout(done));
      expect(auth.logout).toHaveBeenCalledTimes(1);
    });
  });
});
