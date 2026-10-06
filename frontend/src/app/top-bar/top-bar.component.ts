import { NgTemplateOutlet } from '@angular/common';
import { afterNextRender, ChangeDetectionStrategy, Component, computed, DestroyRef, effect, ElementRef, inject, Injector, Signal, signal, untracked, viewChild } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { NavigationEnd, Router, RouterLink } from '@angular/router';
import { filter, map } from 'rxjs';
import { AuthService } from '../core/auth/auth.service';
import { SignInService } from '../core/auth/sign-in.service';
import { SignOutService } from '../core/auth/sign-out.service';
import { LanguageChooserComponent } from '../core/i18n/language-chooser/language-chooser.component';
import { isAdminAddress, TranslationService } from '../core/i18n/translation.service';
import { ThemeService } from '../core/theme/theme.service';
import { KanjiStateService } from '../kanji/kanji-state.service';
import { keptWord } from '../standin/kept-word';
import { BrandComponent } from '../ui/brand/brand.component';
import { IconComponent } from '../ui/icon/icon.component';
import { ThemeToggleComponent } from '../ui/theme-toggle/theme-toggle.component';

/**
 * The bar's words in English, for a bar drawn with no strings (keptWord()): it
 * is drawn in every state — a copy not set up, a server that does not answer —
 * so it never shows a key. The same text as the seeded English
 * (backend/tests/unit/translations.test.php holds the two together).
 */
const ENGLISH: Record<string, string> = {
  'topbar.home': 'anotoki Japanese: home',
  'topbar.sections': 'The app’s sections',
  'topbar.exam': 'Exam',
  'topbar.phoneMenu': 'Menu',
  'topbar.phoneMenuDue.one': 'Menu: {count} review due',
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
  'signIn.button': 'Sign in',
};

/**
 * A section of the app in the bar: its words (a key, or a word that is the
 * same in every language — "Kanji", and the admin area's English), where it
 * goes, and the addresses under it that are part of it.
 */
export interface BarLink {
  id: string;
  path: string;
  /** A key the bar words in the language on the page; without one, `word` as it is. */
  key?: string;
  word?: string;
  /** Address beginnings that belong to the section too (a lesson is under Kanji). */
  under: readonly string[];
  /** The reviews due stand beside it. */
  due?: boolean;
  /** Only an administrator sees it (an editor's admin area is Translations alone). */
  adminOnly?: boolean;
}

/** The learner's sections: the kanji trainer, with the reviews due beside it, and the exam. Home is the brand. */
export const APP_LINKS: readonly BarLink[] = [
  { id: 'kanji', word: 'Kanji', path: '/kanji', under: ['/kanji/'], due: true },
  { id: 'exam', key: 'topbar.exam', path: '/exam', under: [] },
];
/** The admin panel's sections: English, as the whole panel. Languages, People and Migrations are an administrator's. */
export const ADMIN_LINKS: readonly BarLink[] = [
  { id: 'translations', word: 'Translations', path: '/admin/translations', under: [] },
  { id: 'languages', word: 'Languages', path: '/admin/languages', under: [], adminOnly: true },
  { id: 'people', word: 'People', path: '/admin/people', under: [], adminOnly: true },
  { id: 'migrations', word: 'Migrations', path: '/admin/migrations', under: [], adminOnly: true },
];

/**
 * Up to this width the bar is a phone's: the links and the person's menu fold
 * into one menu button. Japanese's own number, measured in a browser with the
 * real labels, English and Slovak, a three-digit due count and the Slovak
 * "Prihlásiť sa" (docs/kb/architecture.md, *The top bar*); the same number is
 * in top-bar.component.scss.
 */
export const PHONE_BAR_MAX = 760;

/**
 * The admin panel's bar folds into its menu button up to here: four links
 * (Translations, Languages, People, Migrations) and "anotoki Japanese admin
 * panel" beside the mark need a wider window than the learner's two links,
 * measured the same way (screens.js, the room). From 761 the brand is whole
 * all the same, beside the menu button.
 */
export const ADMIN_PHONE_BAR_MAX = 960;

/** Which of the bar's two menus is open: the person's (account) or the phone's (links and account). */
type OpenMenu = 'account' | 'phone' | null;

/**
 * The bar across the top of every page — the anotoki family's one bar
 * (the survey's, the reference), in one row, in this order: the brand (the
 * mark, "anotoki" and "Japanese", linking home); the app's sections as links
 * (Kanji with the reviews due, Exam); then the language (where the learner's
 * pages are, and only with more than one), the theme, and the person's menu
 * (name, address, role; their anotoki account; the way into the admin panel
 * for EDITOR and ADMIN, or back to the app from it; Sign out) — or, signed
 * out (the Sign in card) or visiting (nobody signed in where the IAM does not
 * require it), Sign in.
 *
 * On a phone (up to PHONE_BAR_MAX) the brand is the mark and "Japanese", and
 * the links and the person's menu (or Sign in) are inside one menu button at
 * the right, after the language and the theme; the reviews due stand on that
 * button.
 *
 * The admin panel (/admin…) has the same bar with its own sections as links,
 * "anotoki Japanese admin panel" beside the mark ("admin panel" alone on a
 * phone), no language chooser, and "Back to Japanese Academy" in the
 * person's menu; it folds into the menu button up to ADMIN_PHONE_BAR_MAX. Its
 * words read in English, with no case here — the translation service answers
 * in English there (TranslationService.pageLanguage).
 *
 * Both menus are the IAM's own pattern: a menu button; the focus into the
 * menu when it opens; the arrow keys, Home and End between its items; Escape
 * and a click outside close it, Escape with the focus back on its button; Tab
 * and Shift+Tab close it with the focus on the button too, so the next Tab
 * moves on from there (never to <body>); a change across PHONE_BAR_MAX closes
 * it.
 *
 * And Japanese's own rule: no key pressed anywhere in the bar reaches
 * `document` — the lesson quiz, the reviews and the exam listen there, and
 * Enter or Space on a button of the bar would submit a card, hand a paper in
 * or play a word instead of opening the menu. So the header stops every key
 * (`keydown()`), and handles Escape itself, which no document listener would
 * hear.
 *
 * Sign out goes through SignOutService: it waits for the answers and notes
 * still on their way (the button's spinner and "Saving…"), and asks first
 * when something would be lost. A visitor's Sign in does the same first
 * (SignInService), then goes to the IAM; in the phone's menu, the menu stays
 * open while it waits (signIn()).
 */
@Component({
  selector: 'app-top-bar',
  imports: [NgTemplateOutlet, RouterLink, BrandComponent, IconComponent, LanguageChooserComponent, ThemeToggleComponent],
  templateUrl: './top-bar.component.html',
  styleUrl: './top-bar.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    '(document:click)': 'clickedElsewhere($event)',
    '(document:keydown.escape)': 'closeMenu(true)',
  },
})
export class TopBarComponent {
  readonly auth = inject(AuthService);
  readonly signOut = inject(SignOutService);
  readonly signInFlow = inject(SignInService);
  private readonly i18n = inject(TranslationService);
  private readonly kanji = inject(KanjiStateService);
  private readonly theme = inject(ThemeService);
  private readonly router = inject(Router);
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);
  private readonly injector = inject(Injector);

  private readonly accountButton = viewChild<ElementRef<HTMLButtonElement>>('accountButton');
  private readonly phoneButton = viewChild<ElementRef<HTMLButtonElement>>('phoneButton');
  private readonly menu = viewChild<ElementRef<HTMLElement>>('menu');

  /** Which menu is open, if one is. */
  readonly openMenu = signal<OpenMenu>(null);
  /** A phone's window (up to PHONE_BAR_MAX): the brand is the short one. */
  readonly narrow = this.matches(`(max-width: ${PHONE_BAR_MAX}px)`);
  private readonly adminNarrow = this.matches(`(max-width: ${ADMIN_PHONE_BAR_MAX}px)`);
  /** The bar of a phone: the links and the person's menu inside the menu button (the admin panel's up to ADMIN_PHONE_BAR_MAX). */
  readonly phone = computed(() => (this.area() === 'admin' ? this.adminNarrow() : this.narrow()));

  /** The address of the page, without its query and fragment: which link is the page's. */
  private readonly path = toSignal(
    this.router.events.pipe(
      filter((event) => event instanceof NavigationEnd),
      map(() => this.router.url),
    ),
    { initialValue: this.router.url },
  );
  private readonly here = computed(() => this.path().split(/[?#]/)[0] || '/');
  readonly area = computed(() => (isAdminAddress(this.here()) ? 'admin' : 'app'));

  /** The app can be used: somebody is signed in, or a visitor. Only then are there sections to follow (they load data on the way). */
  readonly ready = computed(() => this.auth.usable());
  /** Who is signed in, while the app is theirs (never a visitor). */
  readonly person = computed(() => (this.auth.signedIn() ? this.auth.user() : null));
  /** Sign in is offered: signed out with the Sign in card on the page (any other time the browser is on its way to the IAM), or visiting. */
  readonly signedOut = computed(() => this.auth.showSignIn() || this.auth.visiting());
  readonly links = computed(() => {
    if (!this.ready()) {
      return [];
    }
    return (this.area() === 'admin' ? ADMIN_LINKS : APP_LINKS).filter((link) => !link.adminOnly || this.auth.isAdmin());
  });
  /** The language chooser: where the learner's pages are (the admin area is English). It hides itself with fewer than two languages. */
  readonly chooser = computed(() => this.area() === 'app');
  /** The phone's menu button has something to hold: the sections, the person's menu, or Sign in. */
  readonly menuButton = computed(() => this.links().length > 0 || this.person() !== null || this.signedOut());
  readonly due = this.kanji.reviewsDue;
  /** The reviews due on the phone's menu button: only where the Kanji link is in its menu. */
  readonly phoneDue = computed(() => (this.links().some((link) => link.due) ? this.due() : 0));

  /** The name to show: the one in the IAM, or the address; the app's own word for an account with neither. */
  readonly name = computed(() => this.auth.displayName() || this.word('account.noName'));
  readonly initial = computed(() => ([...this.name()][0] ?? '?').toUpperCase());
  /** The address under the name, unless it is the name. */
  readonly email = computed(() => {
    const email = this.person()?.email ?? '';
    return email && email !== this.name() ? email : '';
  });

  /**
   * The bar's words, in the language on the page (English in the admin area);
   * with no strings, the English kept above. Worded here, so the bar follows a
   * change of language without being made again.
   */
  readonly words = computed(() => ({
    home: this.word('topbar.home'),
    sections: this.word('topbar.sections'),
    phoneMenu: this.phoneDue() ? this.dueLabel(this.phoneDue()) : this.word('topbar.phoneMenu'),
    menuButton: this.word('topbar.menuButton', { name: this.name() }),
    menu: this.word('topbar.menu'),
    role: this.auth.isAdmin() ? this.word('topbar.roleAdmin') : this.auth.isStaff() ? this.word('topbar.roleEditor') : '',
    admin: this.word('topbar.admin'),
    account: this.word('account.yourAccount'),
    signOut: this.word('account.signOut'),
    saving: this.word('signOut.saving'),
    signIn: this.word('signIn.button'),
    links: Object.fromEntries(this.links().map((link) => [link.id, link.key ? this.word(link.key) : (link.word ?? '')])),
  }));

  constructor() {
    // From a phone's bar to a desktop's (a turned tablet, a wider window): the open menu would belong to neither.
    effect(() => {
      this.phone();
      untracked(() => this.closeMenu(false));
    });
    // Signed out, or into another area: a menu open for what was there closes.
    effect(() => {
      this.person();
      this.area();
      untracked(() => this.closeMenu(false));
    });
  }

  /** The page is this link's own address. */
  isPage(link: BarLink): boolean {
    return this.here() === link.path;
  }

  /** The page is in this link's section: its own address or one under it. */
  inSection(link: BarLink): boolean {
    const here = this.here();
    return here === link.path || link.under.some((start) => here.startsWith(start));
  }

  /** The home page: the brand is its link (the app has no Home link of its own). */
  isHome(): boolean {
    return this.here() === '/';
  }

  toggleMenu(which: 'account' | 'phone'): void {
    if (this.openMenu() === which) {
      this.closeMenu(true);
      return;
    }
    this.openMenu.set(which);
    // Into the menu once it is drawn, as a menu button is expected to do. Drawn
    // means after the next render: with no zone, a microtask runs before it.
    afterNextRender(() => this.menuItems()[0]?.focus(), { injector: this.injector });
  }

  /** Closes the open menu; `returnFocus`: back to the button that opened it (Escape, Tab, the button again). */
  closeMenu(returnFocus: boolean): void {
    const open = this.openMenu();
    if (!open) {
      return;
    }
    this.openMenu.set(null);
    if (returnFocus) {
      (open === 'account' ? this.accountButton() : this.phoneButton())?.nativeElement.focus();
    }
  }

  /**
   * Every key pressed anywhere in the bar — on a link, the brand, the theme
   * switch, a menu button or an item — stops here: the lesson quiz, the
   * reviews and the exam listen on `document`, where Enter submits a card or
   * hands a paper in, and Space plays a word. What the key does in the bar
   * (Enter and Space press a button or follow a link) is the browser's, and
   * stays so. Escape is handled here, because a document listener never hears
   * it now: it closes the open menu, and puts away the theme switch's line
   * about a choice the account refused.
   */
  keydown(event: KeyboardEvent): void {
    event.stopPropagation();
    if (event.key === 'Escape') {
      this.closeMenu(true);
      this.theme.refused.set(null);
    }
  }

  /** The open menu's own keys: the arrows, Home and End between its items; Tab and Shift+Tab out of it from its button. */
  menuKeydown(event: KeyboardEvent): void {
    const items = this.menuItems();
    const index = items.indexOf(document.activeElement as HTMLElement);
    let next = -1;
    if (event.key === 'ArrowDown') {
      next = (index + 1) % items.length;
    } else if (event.key === 'ArrowUp') {
      next = (index - 1 + items.length) % items.length;
    } else if (event.key === 'Home') {
      next = 0;
    } else if (event.key === 'End') {
      next = items.length - 1;
    } else if (event.key === 'Tab') {
      // Tab (or Shift+Tab) leaves the menu from its button. Left to the browser,
      // the focus would move to the next item of a menu still drawn — with no
      // zone it is removed only at the next render — and then fall to <body>.
      event.preventDefault();
      this.closeMenu(true);
      return;
    }
    if (next >= 0 && items.length) {
      event.preventDefault();
      items[next]?.focus();
    }
  }

  /** A click anywhere outside the open menu and its button closes it, the focus left where it is. */
  clickedElsewhere(event: MouseEvent): void {
    const open = this.openMenu();
    if (!open) {
      return;
    }
    const root = this.host.nativeElement.querySelector(open === 'account' ? '.user-menu' : '.phone-menu');
    if (!root || !root.contains(event.target as Node)) {
      this.closeMenu(false);
    }
  }

  /**
   * To the IAM, whose pages open in the language read here — when one was
   * settled; from a visitor's page after the saves on their way, asking first
   * when something would be lost (SignInService). When it could not start, the
   * Sign in card (or, visiting, the line under the bar) says why.
   *
   * Chosen in the phone's menu, the menu stays open while it waits: its item
   * says so (the spinner and "Saving…"), as Sign out's does, and the focus
   * waits on the menu's button — the item is disabled meanwhile, which would
   * drop it to <body>. Once the wait is over (the visitor stayed, the sign-in
   * could not start, or the browser is on its way to the IAM), the menu
   * closes with the focus on its button.
   */
  async signIn(): Promise<void> {
    if (this.openMenu() === 'phone') {
      this.phoneButton()?.nativeElement.focus();
    }
    await this.signInFlow.signIn();
    this.closeMenu(true);
  }

  /** Waits for the saves on their way, asks when something would be lost, then the IAM signs the person out everywhere. */
  logout(): void {
    void this.signOut.signOut();
  }

  private word(key: string, params?: Record<string, string | number>): string {
    return keptWord(this.i18n, key, ENGLISH[key], params);
  }

  /** "Menu: 125 reviews due": the phone's menu button names the number it shows (Label in Name). */
  private dueLabel(count: number): string {
    if (this.i18n.has('topbar.phoneMenuDue.other')) {
      return this.i18n.plural('topbar.phoneMenuDue', count);
    }
    return keptWord(this.i18n, 'topbar.phoneMenuDue.other', ENGLISH[count === 1 ? 'topbar.phoneMenuDue.one' : 'topbar.phoneMenuDue.other'], { count });
  }

  private menuItems(): HTMLElement[] {
    const menu = this.menu()?.nativeElement;
    return menu ? Array.from(menu.querySelectorAll<HTMLElement>('[role="menuitem"]:not([disabled])')) : [];
  }

  /** Whether the screen matches a media query, kept current while the bar is there. */
  private matches(media: string): Signal<boolean> {
    const matches = signal(false);
    const query = globalThis.matchMedia?.(media);
    if (query) {
      const update = (): void => matches.set(query.matches);
      update();
      query.addEventListener('change', update);
      inject(DestroyRef).onDestroy(() => query.removeEventListener('change', update));
    }
    return matches.asReadonly();
  }
}
