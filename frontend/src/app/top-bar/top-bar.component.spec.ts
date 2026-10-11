import { ChangeDetectionStrategy, Component, computed, provideZonelessChangeDetection, signal } from '@angular/core';
import { HttpTestingController } from '@angular/common/http/testing';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter, Router } from '@angular/router';
import { provideAnotokiAdmin } from '@anotoki/lib/admin';
import { SiteStatus } from '@anotoki/lib/migrations';
import { ThemeService } from '@anotoki/lib/shell';
import { TranslationService } from '@anotoki/lib/translations';
import { provideTestTranslations } from '@anotoki/lib/translations/testing';
import { AppState, AuthService } from '../core/auth/auth.service';
import { AnotokiPreferenceChanges, AnotokiUser } from '@anotoki/lib/auth';
import { provideKit } from '../core/kit.config';
import { SavesInFlight } from '../core/saves-in-flight.service';
import { derivedFromState, derivedFromUser, NO_CHOICE } from '../core/testing/auth-states';
import { provideKitEnglish } from '../core/testing/kit-english';
import { provideTestSiteStatus } from '../core/testing/site-status';
import { KanjiStateService } from '../kanji/kanji-state.service';
import { ADMIN_NAME_BAR_MIN, ADMIN_PHONE_BAR_MAX, ADMIN_SHORT_BRAND_MAX, NAME_BAR_MIN, PHONE_BAR_MAX, TopBarComponent } from './top-bar.component';

/**
 * The bar's words as the database has them since migration 009: the app's
 * own, and the kit's under the anotoki library's keys - the app's words,
 * copied there, the person's role and account link among them - beside the
 * library's own where the app had none (the theme's note).
 */
const ENGLISH: Record<string, string> = {
  'topbar.home': 'anotoki Japanese: home',
  'topbar.exam': 'Exam',
  'topbar.phoneMenuDue.one': 'Menu: {count} review due',
  'topbar.phoneMenuDue.few': 'Menu: {count} reviews due',
  'topbar.phoneMenuDue.other': 'Menu: {count} reviews due',
  'anotoki.topbar.roleAdmin': 'Administrator',
  'anotoki.topbar.roleEditor': 'Editor',
  'topbar.admin': 'Admin panel',
  'account.noName': 'Account',
  'anotoki.topbar.account': 'Your anotoki account',
  'signOut.notSaved': 'Some of your answers or notes could not be saved, and signing out loses them. Sign out anyway?',
  'signOut.examOpen': 'Your exam is not finished, and signing out loses the test. Sign out anyway?',
  'signIn.button': 'Sign in',
  'anotoki.topbar.sections': 'The app’s sections',
  'anotoki.topbar.phoneMenu': 'Menu',
  'anotoki.topbar.menuButton': 'Your menu: {name}',
  'anotoki.topbar.menu': 'Your menu',
  'anotoki.topbar.signIn': 'Sign in',
  'anotoki.topbar.signOut': 'Sign out',
  'anotoki.topbar.saving': 'Saving…',
  'anotoki.theme.label': 'Theme',
  'anotoki.theme.light': 'Light',
  'anotoki.theme.dark': 'Dark',
  'anotoki.theme.auto': 'System',
  'anotoki.theme.autoHint': 'As your device is set',
  'anotoki.theme.notSaved': 'The theme could not be saved to your anotoki account.',
  'anotoki.language.button': 'Language: {name} ({code})',
  'anotoki.language.notLoaded': 'The language could not be loaded. Try again.',
};
const SLOVAK: Record<string, string> = {
  'topbar.home': 'anotoki Japanese: domov',
  'topbar.exam': 'Skúška',
  'topbar.phoneMenuDue.one': 'Ponuka: {count} opakovanie čaká',
  'topbar.phoneMenuDue.few': 'Ponuka: {count} opakovania čakajú',
  'topbar.phoneMenuDue.other': 'Ponuka: {count} opakovaní čaká',
  'anotoki.topbar.roleAdmin': 'Administrátor',
  'anotoki.topbar.roleEditor': 'Editor',
  'topbar.admin': 'Administrátorský panel',
  'account.noName': 'Účet',
  'anotoki.topbar.account': 'Tvoj účet anotoki',
  'signOut.notSaved': 'Niektoré tvoje odpovede alebo poznámky sa nepodarilo uložiť a odhlásením sa stratia. Chceš sa aj tak odhlásiť?',
  'signOut.examOpen': 'Tvoja skúška nie je dokončená a odhlásením sa test stratí. Chceš sa aj tak odhlásiť?',
  'signIn.button': 'Prihlásiť sa',
  'anotoki.topbar.sections': 'Časti aplikácie',
  'anotoki.topbar.phoneMenu': 'Ponuka',
  'anotoki.topbar.menuButton': 'Tvoja ponuka: {name}',
  'anotoki.topbar.menu': 'Tvoja ponuka',
  'anotoki.topbar.signIn': 'Prihlásiť sa',
  'anotoki.topbar.signOut': 'Odhlásiť sa',
  'anotoki.topbar.saving': 'Ukladá sa…',
  'anotoki.theme.label': 'Vzhľad',
  'anotoki.theme.light': 'Svetlý',
  'anotoki.theme.dark': 'Tmavý',
  'anotoki.theme.auto': 'Systémový',
  'anotoki.theme.autoHint': 'Podľa nastavenia tvojho zariadenia',
  'anotoki.theme.notSaved': 'Vzhľad sa nepodarilo uložiť do tvojho anotoki účtu.',
  'anotoki.language.button': 'Jazyk: {name} ({code})',
  'anotoki.language.notLoaded': 'Jazyk sa nepodarilo načítať. Skús to znova.',
};

/** Whatever page the router draws: the bar only needs it to be somewhere. */
@Component({ selector: 'app-test-page', changeDetection: ChangeDetectionStrategy.OnPush, template: '' })
class PageComponent {}

/** An IAM that sends no preferences: the bar's theme is this device's. */
const HANA: AnotokiUser = { sub: '7', preferred_username: 'hana', email: 'hana@example.test', email_verified: true, locale: null, roles: [], preferences: null };

/**
 * The anotoki family's bar is the library's (<anotoki-top-bar>, its own specs
 * cover its parts); these pin down what this app makes of it: its words - the
 * app's, from its database, the kit's own included -, its sections and who
 * they are for, the reviews due, the admin panel's English, the site's state,
 * its sign-in and sign-out, its fold widths, and the rules the app relies on
 * (no key of the bar reaches `document`; the menus' keys and focus).
 */
describe('TopBarComponent', () => {
  const state = signal<AppState>('ready');
  const user = signal<AnotokiUser | null>(HANA);
  const roles = signal<string[]>(['ADMIN']);
  const showSignIn = signal(false);
  /** Every save of the account's preferences, and how the spec's IAM answers it (undefined: it takes it). */
  const saved: AnotokiPreferenceChanges[] = [];
  let refuseWith: string | undefined;
  const auth = {
    state,
    ...derivedFromState(state),
    loginRequired: signal(true),
    user,
    ...derivedFromUser(state, user),
    showSignIn,
    signInError: signal<{ code: string } | null>(null),
    displayName: computed(() => user()?.preferred_username || user()?.email || ''),
    isAdmin: computed(() => roles().includes('ADMIN')),
    isStaff: computed(() => roles().includes('ADMIN') || roles().includes('EDITOR')),
    accountUrl: () => 'https://iam.example.test/account',
    login: vi.fn(async (_returnTo?: string) => true),
    logout: vi.fn(async () => true),
    savePreferences: (changes: AnotokiPreferenceChanges) => {
      saved.push(changes);
      return refuseWith === undefined ? Promise.resolve({}) : Promise.reject(Object.assign(new Error('refused'), { code: refuseWith }));
    },
  };
  const due = signal(0);

  let fixture: ComponentFixture<TopBarComponent>;
  let host: HTMLElement;
  /** Every keydown that got as far as `document` — where the lesson quiz, the reviews and the exam listen. */
  let reached: string[];
  const onDocument = (event: KeyboardEvent): void => void reached.push(event.key);

  // The window as the bar's media queries see it: its width, and the listeners told when it changes.
  let width = 1280;
  const resized = new Set<() => void>();

  const personButton = () => host.querySelector<HTMLButtonElement>('.anotoki-top-bar__person-button')!;
  const phoneButton = () => host.querySelector<HTMLButtonElement>('.anotoki-top-bar__menu-button')!;
  const signInButton = () => host.querySelector<HTMLButtonElement>('button.anotoki-top-bar__sign-in');
  const items = () => Array.from(host.querySelectorAll<HTMLElement>('[role="menuitem"]'));
  const menu = () => host.querySelector<HTMLElement>('[role="menu"]');
  const words = (element: Element | null | undefined) => element?.textContent?.replace(/\s+/g, ' ').trim();
  /** The words of each element a selector finds, in order. */
  const parts = (selector: string) => Array.from(host.querySelectorAll(selector)).map(words);
  const links = () => Array.from(host.querySelectorAll<HTMLAnchorElement>('nav.anotoki-top-bar__nav a'));
  const brand = () => host.querySelector<HTMLAnchorElement>('anotoki-brand a')!;
  /** A link as "words href", with " [page]" for aria-current and " [here]" for the section the page is in. */
  const described = (link: HTMLAnchorElement) =>
    `${words(link)} ${link.getAttribute('href')}${link.getAttribute('aria-current') === 'page' ? ' [page]' : ''}${link.classList.contains('anotoki-top-bar__link--active') ? ' [here]' : ''}`;
  /** What stands in the bar's row and among its controls, in order: a component as its tag, another element as tag.<its part of the bar> (its first anotoki-top-bar__ class, the prefix left out). */
  const childrenOf = (selector: string) =>
    Array.from(host.querySelector(selector)!.children)
      .filter((child) => !(child instanceof HTMLElement) || !child.hidden)
      .map((child) => {
        const tag = child.tagName.toLowerCase();
        const part = Array.from(child.classList)
          .find((name) => name.startsWith('anotoki-top-bar__') && !name.includes('--'))
          ?.slice('anotoki-top-bar__'.length);
        return tag.includes('-') ? tag : `${tag}.${part ?? ''}`;
      });

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
        provideTestSiteStatus(),
        provideKitEnglish(),
        provideKit(),
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
    (host.querySelector<HTMLButtonElement>('.anotoki-top-bar__person-button') ?? phoneButton()).click();
    await fixture.whenStable();
  }

  beforeEach(() => {
    state.set('ready');
    user.set(HANA);
    roles.set(['ADMIN']);
    showSignIn.set(false);
    due.set(0);
    saved.length = 0;
    refuseWith = undefined;
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
    document.documentElement.style.removeProperty('color-scheme');
  });

  /* ------------------------------------------------------------ the row */

  it('is the family’s one bar, in its order: the brand, the links, then the language, the theme and the person', async () => {
    await draw();
    expect(childrenOf('.anotoki-top-bar__row')).toEqual(['anotoki-brand', 'nav.nav', 'div.actions']);
    expect(childrenOf('.anotoki-top-bar__actions')).toEqual(['anotoki-language-switcher', 'anotoki-theme-toggle', 'button.person-button', 'anotoki-menu']);
    expect(host.querySelector('nav.anotoki-top-bar__nav')?.getAttribute('aria-label'), 'the app’s word for the kit’s').toBe('Časti aplikácie');
    // The brand: the mark, "anotoki" and the app's name (a name: English on every page), its link named with the words it shows.
    expect(parts('anotoki-brand .anotoki-brand__wordmark > span')).toEqual(['anotoki', 'Japanese']);
    expect(host.querySelector('anotoki-brand .anotoki-brand__wordmark')?.getAttribute('lang')).toBe('en');
    expect(host.querySelector('anotoki-brand img')?.getAttribute('alt')).toBe('');
    expect(brand().getAttribute('aria-label')).toBe('anotoki Japanese: domov');
    expect(brand().getAttribute('href')).toBe('/');
  });

  it('links Kanji and the exam, marks the section the page is in, and the brand on the home page', async () => {
    await draw();
    await at('/');
    expect(links().map(described)).toEqual(['Kanji /kanji', 'Skúška /exam']);
    expect(brand().getAttribute('aria-current')).toBe('page');
    await at('/kanji');
    expect(links().map(described)).toEqual(['Kanji /kanji [page] [here]', 'Skúška /exam']);
    expect(brand().hasAttribute('aria-current')).toBe(false);
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
    expect(host.querySelector('nav.anotoki-top-bar__nav .anotoki-top-bar__badge')).toBeNull();
    due.set(125);
    await fixture.whenStable();
    expect(words(host.querySelector('nav.anotoki-top-bar__nav .anotoki-top-bar__badge'))).toBe('125');
    expect(links().map(words)).toEqual(['Kanji 125', 'Skúška']);
  });

  it('in the admin panel: its sections, English, for whom they are; no language; the brand "anotoki Japanese · admin panel" to the panel, by its name', async () => {
    windowOf(ADMIN_SHORT_BRAND_MAX + 1);
    await draw();
    await at('/admin/translations');
    expect(links().map(described)).toEqual([
      'Translations /admin/translations [page] [here]',
      'Languages /admin/languages',
      'People /admin/people',
      'Feedback /admin/feedback',
      'Errors /admin/errors',
      'Audit log /admin/audit',
      'Backups /admin/backups',
      'Migrations /admin/migrations',
    ]);
    expect(links().every((link) => link.getAttribute('lang') === 'en')).toBe(true);
    expect(host.querySelector('anotoki-language-switcher')).toBeNull();
    expect(brand().getAttribute('href')).toBe('/admin');
    expect(brand().getAttribute('aria-label')).toBe('anotoki Japanese admin panel: home');
    expect(parts('anotoki-brand .anotoki-brand__wordmark > span')).toEqual(['anotoki', 'Japanese', '·', 'admin panel']);
    await at('/admin/migrations');
    expect(links().map(described)).toEqual([
      'Translations /admin/translations',
      'Languages /admin/languages',
      'People /admin/people',
      'Feedback /admin/feedback',
      'Errors /admin/errors',
      'Audit log /admin/audit',
      'Backups /admin/backups',
      'Migrations /admin/migrations [page] [here]',
    ]);

    // An editor's admin panel is Translations alone: every other page is an administrator's.
    roles.set(['EDITOR']);
    await fixture.whenStable();
    expect(links().map(described)).toEqual(['Translations /admin/translations']);
  });

  it('the new feedback beside Feedback, asked for as the site’s ADMIN enters the panel (the anotoki library’s FeedbackUnread: no mail is sent for a message)', async () => {
    windowOf(ADMIN_PHONE_BAR_MAX + 1);
    TestBed.configureTestingModule({ providers: [provideAnotokiAdmin(() => ({ isAdmin: () => roles().includes('ADMIN') }))] });
    await draw();
    const http = TestBed.inject(HttpTestingController);
    expect(http.match('/api/admin/feedback/unread'), 'not asked on the learner’s pages').toEqual([]);
    await at('/admin/translations');
    const asked = http.match('/api/admin/feedback/unread');
    expect(asked.length).toBeGreaterThan(0);
    asked.forEach((request) => request.flush({ unread: 3 }));
    await new Promise((done) => setTimeout(done));
    await fixture.whenStable();
    expect(links().map(words)).toContain('Feedback 3');
    expect(words(host.querySelector('nav.anotoki-top-bar__nav a[href="/admin/feedback"] .anotoki-top-bar__badge'))).toBe('3');
  });

  it('reads in English in the admin area, whatever the person reads — the kit’s words too, with no case of its own', async () => {
    await draw();
    await at('/admin/languages');
    expect(host.querySelector('nav.anotoki-top-bar__nav')?.getAttribute('aria-label')).toBe('The app’s sections');
    expect(personButton().getAttribute('aria-label')).toBe('Your menu: hana');
    expect(Array.from(host.querySelectorAll('[role="radio"]')).map((radio) => radio.getAttribute('aria-label'))).toEqual(['Light', 'Dark', 'System']);

    await openMenu();
    expect(words(host.querySelector('.anotoki-top-bar__menu-role'))).toBe('Administrator');
    expect(items().map(words)).toEqual(['Your anotoki account', 'Back to Japanese Academy', 'Sign out']);
    expect(items()[1].getAttribute('href')).toBe('/');
    expect(items()[1].getAttribute('lang')).toBe('en');

    // Back on a learner's page, the person's language again.
    await at('/');
    expect(host.querySelector('nav.anotoki-top-bar__nav')?.getAttribute('aria-label')).toBe('Časti aplikácie');
    expect(host.querySelector('anotoki-language-switcher')).not.toBeNull();
  });

  it('the language and the theme in the app’s own words: its button holds the code it shows, the system’s choice is the app’s "System"', async () => {
    await draw();
    const language = host.querySelector<HTMLButtonElement>('anotoki-language-switcher button')!;
    expect(words(language)).toBe('SK');
    expect(language.getAttribute('aria-label')).toBe('Jazyk: Slovenčina (SK)');
    const radios = Array.from(host.querySelectorAll<HTMLElement>('[role="radio"]'));
    expect(radios.map((radio) => [radio.getAttribute('data-value'), radio.getAttribute('aria-label'), radio.getAttribute('title')])).toEqual([
      ['light', 'Svetlý', 'Svetlý'],
      ['dark', 'Tmavý', 'Tmavý'],
      ['auto', 'Systémový', 'Podľa nastavenia tvojho zariadenia'],
    ]);
    expect(host.querySelector('[role="radiogroup"]')?.getAttribute('aria-label')).toBe('Vzhľad');
  });

  /* ---------------------------------------------------- the person's menu */

  it('the person’s menu: name, address and role; their anotoki account; Admin panel for staff; Sign out — in their language', async () => {
    await draw();
    expect(personButton().getAttribute('aria-label')).toBe('Tvoja ponuka: hana');
    expect(personButton().getAttribute('aria-haspopup')).toBe('menu');
    expect(personButton().getAttribute('aria-expanded')).toBe('false');
    expect(words(host.querySelector('.anotoki-top-bar__person-name'))).toBe('hana');
    expect(words(host.querySelector('.anotoki-top-bar__initial'))).toBe('H');

    await openMenu();
    expect(personButton().getAttribute('aria-expanded')).toBe('true');
    expect(menu()!.id).toBe(personButton().getAttribute('aria-controls'));
    expect(menu()!.getAttribute('aria-label')).toBe('Tvoja ponuka');
    expect(parts('.anotoki-top-bar__menu-head > span')).toEqual(['hana', 'hana@example.test', 'Administrátor']);
    expect(host.querySelector('.anotoki-top-bar__menu-head')?.getAttribute('role')).toBe('none');
    expect(items().map(words)).toEqual(['Tvoj účet anotoki', 'Administrátorský panel', 'Odhlásiť sa']);
    expect([items()[0].getAttribute('href'), items()[0].getAttribute('target'), items()[0].getAttribute('rel')]).toEqual([
      'https://iam.example.test/account',
      '_blank',
      'noopener',
    ]);
    expect(items()[1].getAttribute('href')).toBe('/admin');

    roles.set(['EDITOR']);
    await fixture.whenStable();
    expect(words(host.querySelector('.anotoki-top-bar__menu-role'))).toBe('Editor');

    // A learner: no role, no way into the admin area.
    roles.set([]);
    await fixture.whenStable();
    expect(host.querySelector('.anotoki-top-bar__menu-role')).toBeNull();
    expect(items().map(words)).toEqual(['Tvoj účet anotoki', 'Odhlásiť sa']);
  });

  it('an account with neither a name nor an address is the app’s own word for it', async () => {
    user.set({ ...HANA, preferred_username: null, email: null });
    await draw();
    expect(personButton().getAttribute('aria-label')).toBe('Tvoja ponuka: Účet');
    await openMenu();
    expect(parts('.anotoki-top-bar__menu-head > span')).toEqual(['Účet', 'Administrátor']);
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

    // Escape pressed in the menu: the menu's own (no document listener hears a key of the bar).
    press(items()[0], 'Escape');
    await fixture.whenStable();
    expect(items()).toEqual([]);
    expect(document.activeElement).toBe(personButton());
    expect(reached).toEqual([]);

    // Escape pressed elsewhere closes it too.
    await openMenu();
    document.body.focus();
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    await fixture.whenStable();
    expect(items()).toEqual([]);
  });

  it('when the account refuses a theme, the note under the switch says so in the reader’s language - and Escape on any of the bar’s controls puts it away', async () => {
    user.set({ ...HANA, preferences: { ...NO_CHOICE, theme: 'light' } });
    refuseWith = 'network';
    await draw();
    host.querySelector<HTMLElement>('[role="radio"][data-value="dark"]')!.click();
    await vi.waitFor(async () => {
      await fixture.whenStable();
      expect(words(host.querySelector('anotoki-theme-toggle .anotoki-theme-toggle__note')), 'the library’s word, from the database').toBe('Vzhľad sa nepodarilo uložiť do tvojho anotoki účtu.');
    });
    expect(saved).toEqual([{ theme: 'dark' }]);
    expect(TestBed.inject(ThemeService).mode(), 'the account’s theme again').toBe('light');

    press(links()[0], 'Escape');
    await fixture.whenStable();
    expect(host.querySelector('anotoki-theme-toggle .anotoki-theme-toggle__note')).toBeNull();
    expect(reached, 'the bar keeps the key').toEqual([]);
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
    await expectTabOut(personButton);
  });

  it('closes on a click outside it — a click inside it is no reason to — and when an item is chosen', async () => {
    await draw();
    await openMenu();
    host.querySelector<HTMLElement>('.anotoki-top-bar__menu-head')!.click();
    await fixture.whenStable();
    expect(items()).toHaveLength(3);

    document.body.click();
    await fixture.whenStable();
    expect(items()).toEqual([]);
    expect(personButton().getAttribute('aria-expanded')).toBe('false');

    await openMenu();
    items()[1].click();
    await fixture.whenStable();
    expect(items()).toEqual([]);
    expect(TestBed.inject(Router).url).toBe('/admin');

    // The button again closes it, the focus on the button.
    await openMenu();
    personButton().click();
    await fixture.whenStable();
    expect(items()).toEqual([]);
    expect(document.activeElement).toBe(personButton());
  });

  it('follows a change of language without being drawn again', async () => {
    await draw();
    await TestBed.inject(TranslationService).setLanguage('en', { remember: false });
    await fixture.whenStable();
    expect(personButton().getAttribute('aria-label')).toBe('Your menu: hana');
    expect(links().map(words)).toEqual(['Kanji', 'Exam']);
    expect(brand().getAttribute('aria-label')).toBe('anotoki Japanese: home');
    expect(Array.from(host.querySelectorAll('[role="radio"]')).map((radio) => radio.getAttribute('aria-label'))).toEqual(['Light', 'Dark', 'System']);
  });

  /* --------------------------------------------------- the other states */

  it('with no strings (the bar is drawn whatever became of them): the English it keeps — never a key, never the library’s English for a word the app says its own way', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    due.set(3);
    await draw(provideTestTranslations({}));
    expect(links().map(words)).toEqual(['Kanji 3', 'Exam']);
    expect(brand().getAttribute('aria-label')).toBe('anotoki Japanese: home');
    expect(host.querySelector('nav.anotoki-top-bar__nav')?.getAttribute('aria-label')).toBe('The app’s sections');
    expect(personButton().getAttribute('aria-label')).toBe('Your menu: hana');
    expect(Array.from(host.querySelectorAll('[role="radio"]')).map((radio) => radio.getAttribute('aria-label'))).toEqual(['Light', 'Dark', 'System']);
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
    expect(host.querySelector('.anotoki-top-bar__person-button')).toBeNull();
    expect(words(signInButton())).toBe('Prihlásiť sa');
    signInButton()!.click();
    await new Promise((done) => setTimeout(done));
    expect(auth.login).toHaveBeenCalledTimes(1);
  });

  it('signed out after a sign-in that came back without one (the anotoki library’s screen on the page): Sign in there too — and no links', async () => {
    state.set('signed-out');
    user.set(null);
    roles.set([]);
    auth.signInError.set({ code: 'access_denied' });
    try {
      await draw();
      expect(links()).toEqual([]);
      expect(words(signInButton())).toBe('Prihlásiť sa');
    } finally {
      auth.signInError.set(null);
    }
  });

  it('visiting (nobody signed in, sign-in not required here): Kanji and Exam, and Sign in — nobody’s menu', async () => {
    state.set('visiting');
    user.set(null);
    roles.set([]);
    await draw();
    expect(links().map(described)).toEqual(['Kanji /kanji', 'Skúška /exam']);
    expect(host.querySelector('.anotoki-top-bar__person-button')).toBeNull();
    expect(childrenOf('.anotoki-top-bar__actions')).toEqual(['anotoki-language-switcher', 'anotoki-theme-toggle', 'button.sign-in']);
    expect(words(signInButton())).toBe('Prihlásiť sa');
  });

  it('visiting: Sign in waits for the saves on their way — the one that brings the visitor’s key among them — then the IAM, in the reader’s language', async () => {
    state.set('visiting');
    user.set(null);
    roles.set([]);
    await draw();
    let land!: () => void;
    TestBed.inject(SavesInFlight).track(new Promise<void>((done) => (land = done)));
    const button = signInButton()!;
    button.click();
    await fixture.whenStable();
    expect([button.disabled, button.getAttribute('aria-busy'), words(button)]).toEqual([true, 'true', 'Ukladá sa…']);
    expect(button.querySelector('anotoki-spinner')).not.toBeNull();
    expect(auth.login).not.toHaveBeenCalled();

    land();
    await new Promise((done) => setTimeout(done));
    expect(auth.login).toHaveBeenCalledTimes(1);
  });

  it('visiting: an exam paper open is asked about first, in the words of signing in — and Cancel stays', async () => {
    state.set('visiting');
    user.set(null);
    roles.set([]);
    await draw();
    const asked = vi.spyOn(window, 'confirm').mockReturnValue(false);
    TestBed.inject(SavesInFlight).watch(() => 'signOut.examOpen');
    signInButton()!.click();
    await new Promise((done) => setTimeout(done));
    expect(asked).toHaveBeenCalledWith('signIn.examOpen');
    expect(auth.login).not.toHaveBeenCalled();
    asked.mockRestore();
  });

  it('on the way to the IAM, and while the copy is not set up: the brand, the language and the theme — nothing to follow, nobody', async () => {
    state.set('signed-out');
    user.set(null);
    await draw();
    expect(childrenOf('.anotoki-top-bar__actions')).toEqual(['anotoki-language-switcher', 'anotoki-theme-toggle']);

    state.set('not-set-up');
    await fixture.whenStable();
    expect(childrenOf('.anotoki-top-bar__row')).toEqual(['anotoki-brand', 'div.actions']);
    expect(childrenOf('.anotoki-top-bar__actions')).toEqual(['anotoki-language-switcher', 'anotoki-theme-toggle']);
  });

  it('while the site is being updated: no section, and no way into the admin panel - each would be the anotoki library’s page again', async () => {
    await draw();
    await at('/kanji');
    TestBed.inject(SiteStatus).report('update_pending');
    await fixture.whenStable();
    expect(links()).toEqual([]);
    expect(childrenOf('.anotoki-top-bar__actions'), 'the language, the theme and the person stay').toEqual(['anotoki-language-switcher', 'anotoki-theme-toggle', 'button.person-button', 'anotoki-menu']);
    await openMenu();
    expect(items().map(words)).toEqual(['Tvoj účet anotoki', 'Odhlásiť sa']);

    // Back (the Migrations page's Apply, here in this tab): all of it again.
    TestBed.inject(SiteStatus).markReady();
    await fixture.whenStable();
    expect(links().map(described)).toEqual(['Kanji /kanji [page] [here]', 'Skúška /exam']);
    await openMenu();
    expect(items().map(words)).toEqual(['Tvoj účet anotoki', 'Administrátorský panel', 'Odhlásiť sa']);
  });

  it('while an update waits, the site’s ADMIN on the Migrations page - the one page that works then: that link alone, and the way back', async () => {
    await draw();
    await at('/admin/migrations');
    TestBed.inject(SiteStatus).report('update_pending');
    await fixture.whenStable();
    expect(links().map(described)).toEqual(['Migrations /admin/migrations [page] [here]']);
    await openMenu();
    expect(items().map(words)).toEqual(['Your anotoki account', 'Back to Japanese Academy', 'Sign out']);

    // Anywhere else in the panel the library's page stands in: nothing to follow.
    await at('/admin/people');
    expect(links()).toEqual([]);
    // An editor never has the Migrations page.
    roles.set(['EDITOR']);
    await at('/admin/migrations');
    expect(links()).toEqual([]);
  });

  /* ---------------------------------------------- no key reaches the page */

  it('keeps every key of every control to itself: Enter and Space never reach the document, where a quiz or a paper listens', async () => {
    due.set(12);
    await draw();
    const controls = (): Element[] => [
      brand(),
      ...links(),
      host.querySelector('anotoki-language-switcher button')!,
      ...Array.from(host.querySelectorAll('[role="radio"]')),
      personButton(),
    ];
    expect(controls()).toHaveLength(8);
    for (const control of controls()) {
      for (const key of ['Enter', ' ', 'a', '1', 'f', 'r']) {
        const event = press(control, key);
        // What the key does on the control is the browser's, and stays so.
        expect(event.defaultPrevented, `${key} on ${control.outerHTML.slice(0, 40)}`).toBe(false);
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
      expect(parts('anotoki-brand .anotoki-brand__wordmark > span')).toEqual(['Japanese']);
      expect(host.querySelector('nav.anotoki-top-bar__nav')).toBeNull();
      expect(host.querySelector('.anotoki-top-bar__person-button')).toBeNull();
      expect(childrenOf('.anotoki-top-bar__actions')).toEqual(['anotoki-language-switcher', 'anotoki-theme-toggle', 'button.round', 'anotoki-menu']);
      expect(phoneButton().getAttribute('aria-label')).toBe('Ponuka');
      expect(phoneButton().getAttribute('aria-haspopup')).toBe('menu');
      expect(phoneButton().getAttribute('aria-expanded')).toBe('false');
      expect(host.querySelector('.anotoki-top-bar__mark-badge')).toBeNull();
    });

    it('carries the reviews due on its menu button, and says them in its name (Label in Name), one, few and other', async () => {
      windowOf(360);
      due.set(125);
      await draw();
      expect(words(host.querySelector('.anotoki-top-bar__mark-badge'))).toBe('125');
      expect(host.querySelector('.anotoki-top-bar__mark-badge')?.getAttribute('aria-hidden')).toBe('true');
      expect(phoneButton().getAttribute('aria-label')).toBe('Ponuka: 125 opakovaní čaká');
      due.set(3);
      await fixture.whenStable();
      expect(phoneButton().getAttribute('aria-label')).toBe('Ponuka: 3 opakovania čakajú');
      due.set(1);
      await fixture.whenStable();
      expect(phoneButton().getAttribute('aria-label')).toBe('Ponuka: 1 opakovanie čaká');

      // The admin area has no Kanji link: no count on its button.
      await at('/admin/translations');
      expect(host.querySelector('.anotoki-top-bar__mark-badge')).toBeNull();
      expect(phoneButton().getAttribute('aria-label')).toBe('Menu');
    });

    it('holds the links and the person’s menu: focus in, the arrows, Home, Escape back to its button', async () => {
      windowOf(360);
      due.set(125);
      await draw();
      await at('/kanji');
      await openMenu();
      expect(phoneButton().getAttribute('aria-expanded')).toBe('true');
      expect(menu()?.getAttribute('aria-label')).toBe('Ponuka: 125 opakovaní čaká');
      expect(items().map(words)).toEqual(['Kanji 125', 'Skúška', 'Tvoj účet anotoki', 'Administrátorský panel', 'Odhlásiť sa']);
      expect(items()[0].getAttribute('aria-current')).toBe('page');
      expect(parts('[role="menu"] .anotoki-top-bar__menu-head > span')).toEqual(['hana', 'hana@example.test', 'Administrátor']);
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
      expect(items().map(words)).toEqual(['Translations', 'Languages', 'People', 'Feedback', 'Errors', 'Audit log', 'Backups', 'Migrations', 'Your anotoki account', 'Back to Japanese Academy', 'Sign out']);
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
      expect(signInButton()).toBeNull();
      await openMenu();
      expect(items().map(words)).toEqual(['Prihlásiť sa']);
      items()[0].click();
      await new Promise((done) => setTimeout(done));
      await fixture.whenStable();
      expect(auth.login).toHaveBeenCalledTimes(1);
      expect(items()).toEqual([]);
    });

    it('visiting: the links and Sign in are in the menu', async () => {
      state.set('visiting');
      user.set(null);
      roles.set([]);
      windowOf(360);
      await draw();
      expect(signInButton()).toBeNull();
      await openMenu();
      expect(items().map(words)).toEqual(['Kanji', 'Skúška', 'Prihlásiť sa']);
      items()[2].click();
      await new Promise((done) => setTimeout(done));
      expect(auth.login).toHaveBeenCalledTimes(1);
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
      host.querySelector<HTMLButtonElement>('.anotoki-top-bar__sign-in-item')!.click();
      await fixture.whenStable();
      const item = host.querySelector<HTMLButtonElement>('.anotoki-top-bar__sign-in-item')!;
      expect(phoneButton().getAttribute('aria-expanded'), 'the menu stays open while it waits').toBe('true');
      expect([item.disabled, item.getAttribute('aria-busy'), words(item)]).toEqual([true, 'true', 'Ukladá sa…']);
      expect(item.querySelector('anotoki-spinner')).not.toBeNull();
      // The item is disabled while it waits: the focus waits on the menu button, not where a disabled item drops it.
      expect(document.activeElement).toBe(phoneButton());
      expect(auth.login).not.toHaveBeenCalled();

      land();
      await new Promise((done) => setTimeout(done));
      await fixture.whenStable();
      expect(auth.login).toHaveBeenCalledTimes(1);
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
      host.querySelector<HTMLButtonElement>('.anotoki-top-bar__sign-in-item')!.click();
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
      expect(host.querySelector('.anotoki-top-bar__menu-button')).toBeNull();
    });

    it(`is a desktop’s bar from ${PHONE_BAR_MAX + 1} px: the links and the person in the row again, the full brand; the name beside the initial from ${NAME_BAR_MIN}`, async () => {
      windowOf(PHONE_BAR_MAX + 1);
      await draw();
      expect(host.querySelector('.anotoki-top-bar__menu-button')).toBeNull();
      expect(links().map(words)).toEqual(['Kanji', 'Skúška']);
      expect(personButton()).not.toBeNull();
      expect(parts('anotoki-brand .anotoki-brand__wordmark > span')).toEqual(['anotoki', 'Japanese']);
      expect(host.querySelector('header.anotoki-top-bar__topbar')?.classList.contains('anotoki-top-bar__topbar--nameless'), 'the initial alone').toBe(true);
      await resize(NAME_BAR_MIN);
      expect(host.querySelector('header.anotoki-top-bar__topbar')?.classList.contains('anotoki-top-bar__topbar--nameless')).toBe(false);
    });

    it(`the admin panel's eight links fold up to ${ADMIN_PHONE_BAR_MAX} px, "Japanese" and "admin panel" beside the button; the full brand from ${ADMIN_SHORT_BRAND_MAX + 1}, the name beside the initial from ${ADMIN_NAME_BAR_MIN}`, async () => {
      windowOf(ADMIN_PHONE_BAR_MAX);
      await draw();
      await at('/admin/translations');
      expect(links()).toEqual([]);
      expect(phoneButton()).not.toBeNull();
      expect(parts('anotoki-brand .anotoki-brand__wordmark > span')).toEqual(['Japanese', '·', 'admin panel']);
      expect(brand().getAttribute('aria-label')).toBe('anotoki Japanese admin panel: home');
      await openMenu();
      expect(items().map(words)).toEqual(['Translations', 'Languages', 'People', 'Feedback', 'Errors', 'Audit log', 'Backups', 'Migrations', 'Your anotoki account', 'Back to Japanese Academy', 'Sign out']);
      await resize(ADMIN_PHONE_BAR_MAX + 1);
      expect(items(), 'the menu closes as the bar unfolds').toEqual([]);
      expect(links().map(words)).toEqual(['Translations', 'Languages', 'People', 'Feedback', 'Errors', 'Audit log', 'Backups', 'Migrations']);
      expect(parts('anotoki-brand .anotoki-brand__wordmark > span'), 'the short brand beside the eight links').toEqual(['Japanese', '·', 'admin panel']);
      const nameless = () => host.querySelector('header.anotoki-top-bar__topbar')?.classList.contains('anotoki-top-bar__topbar--nameless');
      expect(nameless(), 'the initial alone').toBe(true);
      await resize(ADMIN_SHORT_BRAND_MAX + 1);
      expect(parts('anotoki-brand .anotoki-brand__wordmark > span')).toEqual(['anotoki', 'Japanese', '·', 'admin panel']);
      expect(nameless()).toBe(true);
      await resize(ADMIN_NAME_BAR_MIN);
      expect(nameless(), 'and the name beside it').toBe(false);
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
      expect(host.querySelector('.anotoki-top-bar__menu-button')).toBeNull();

      await openMenu();
      expect(items()).toHaveLength(3);
      await resize(PHONE_BAR_MAX);
      expect(items()).toEqual([]);
      expect(phoneButton().getAttribute('aria-expanded')).toBe('false');
    });
  });

  /* ------------------------------------------------------------ sign-out */

  describe('signing out', () => {
    const signOutItem = () => host.querySelector<HTMLButtonElement>('.anotoki-top-bar__sign-out-item')!;

    async function chooseSignOut(): Promise<void> {
      await openMenu();
      signOutItem().click();
      await fixture.whenStable();
    }

    it('waits for the answers still on their way — a spinner and “Saving…” in the open menu — then the IAM signs the person out', async () => {
      await draw();
      let land!: () => void;
      TestBed.inject(SavesInFlight).track(new Promise<void>((done) => (land = done)));
      await chooseSignOut();

      const button = signOutItem();
      expect(button.getAttribute('aria-busy')).toBe('true');
      expect(button.disabled).toBe(true);
      expect(words(button)).toBe('Ukladá sa…');
      expect(button.querySelector('anotoki-spinner')).not.toBeNull();
      expect(document.activeElement, 'the focus waits on the menu’s button').toBe(personButton());
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
      expect(items(), 'told to stay: the menu closes, the focus on its button').toEqual([]);
      expect(document.activeElement).toBe(personButton());

      asked.mockReturnValue(true);
      await chooseSignOut();
      await new Promise((done) => setTimeout(done));
      expect(auth.logout).toHaveBeenCalledTimes(1);
    });
  });
});
