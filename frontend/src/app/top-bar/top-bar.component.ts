import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { NavigationEnd, Router } from '@angular/router';
import { SiteStatus } from '@anotoki/lib/migrations';
import { TopBarAction, TopBarBrand, TopBarComponent as AnotokiTopBarComponent, TopBarLink, TopBarMenuItem, TopBarPerson, TopBarPhoneMark } from '@anotoki/lib/shell';
import { isAdminArea, TranslationService } from '@anotoki/lib/translations';
import { filter, map } from 'rxjs';
import { AuthService } from '../core/auth/auth.service';
import { SignInService } from '../core/auth/sign-in.service';
import { SignOutService } from '../core/auth/sign-out.service';
import { MIGRATIONS_ROUTE, pagesShut } from '../core/site-status';
import { KanjiStateService } from '../kanji/kanji-state.service';
import { keptWord } from '../standin/kept-word';

/**
 * The bar's own words in English, for a bar drawn with no strings (keptWord()):
 * it is drawn in every state — a copy not set up, a server that does not
 * answer — so it never shows a key. The same text as the seeded English
 * (backend/tests/unit/translations.test.php holds the two together). The kit's
 * words of the bar (its sections' name, Sign in and out, the theme, the
 * language, and the person's role and the link to their anotoki account,
 * which this bar gives the kit worded with those same library keys - a
 * library key never shows as a key: with no strings it is the library's own
 * word) are the anotoki library's keys in this app's database, which carry
 * this app's words (migration 009; core/kit.config.ts). "Admin panel" stays
 * this app's own word (`topbar.admin`: migration 006 rewords it and checks it
 * is there).
 */
const ENGLISH: Record<string, string> = {
  'topbar.home': 'anotoki Japanese: home',
  'topbar.exam': 'Exam',
  'topbar.phoneMenuDue.one': 'Menu: {count} review due',
  'topbar.phoneMenuDue.other': 'Menu: {count} reviews due',
  'topbar.admin': 'Admin panel',
  'account.noName': 'Account',
};

/**
 * A section of the app in the bar: its words (a key, or a word that is the
 * same in every language — "Kanji", and the admin panel's English), where it
 * goes, and the addresses under it that are part of it.
 */
export interface BarLink {
  id: string;
  path: string;
  /** A key the bar words in the language on the page; without one, `word` as it is (English: `lang="en"`). */
  key?: string;
  word?: string;
  /** Address beginnings that belong to the section too (a lesson is under Kanji). */
  under: readonly string[];
  /** The reviews due stand beside it. */
  due?: boolean;
  /** Only an administrator sees it (an editor's admin panel is Translations alone). */
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
  { id: 'migrations', word: 'Migrations', path: MIGRATIONS_ROUTE, under: [], adminOnly: true },
];

/**
 * Up to this width the bar is a phone's: the links and the person's menu fold
 * into one menu button. Japanese's own number, measured in a browser with the
 * real labels, English and Slovak, a three-digit due count and the Slovak
 * "Prihlásiť sa", in the family's font (docs/kb/architecture.md, *The top
 * bar*; screens.js, the room).
 */
export const PHONE_BAR_MAX = 760;

/**
 * The admin panel's bar folds into its menu button up to here: four links
 * (Translations, Languages, People, Migrations) and "anotoki Japanese · admin
 * panel" beside the mark need a wider window than the learner's two links,
 * measured the same way.
 */
export const ADMIN_PHONE_BAR_MAX = 960;

/**
 * From this width the person's name stands beside their initial, in both
 * areas; up to it the round button alone (the kit's own default would be
 * phoneMax + 201: 1161 px in the admin panel).
 */
export const NAME_BAR_MIN = 961;

/**
 * The bar across the top of every page — the anotoki family's one bar, the
 * library's (<anotoki-top-bar>, @anotoki/lib/shell), worded and wired here: in
 * one row, in this order, the brand (the mark, "anotoki" and "Japanese",
 * linking home); the app's sections as links (Kanji with the reviews due,
 * Exam); then the language (where the learner's pages are, and only with more
 * than one), the theme, and the person's menu (name, address, role; their
 * anotoki account; the way into the admin panel for EDITOR and ADMIN, or back
 * to the app from it; Sign out) — or, signed out (the Sign in card) or
 * visiting (nobody signed in where the IAM does not require it), Sign in.
 *
 * On a phone (up to PHONE_BAR_MAX) the brand is the mark and "Japanese", and
 * the links and the person's menu (or Sign in) are inside one menu button at
 * the right, after the language and the theme; the reviews due stand on that
 * button, and its name says them ("Menu: 125 reviews due").
 *
 * The admin panel (/admin…) has the same bar with its own sections as links,
 * "anotoki Japanese · admin panel" beside the mark ("Japanese" with "admin
 * panel" under it while folded), no language, and "Back to Japanese Academy"
 * in the person's menu; it folds up to ADMIN_PHONE_BAR_MAX. Its words read in
 * English, with no case here — the translation service answers in English
 * there (TranslationService.effectiveLanguage, the library's), and so do the
 * kit's (core/kit.config.ts).
 *
 * The library's bar keeps the family's rules: its menus (the focus in, the
 * arrows, Home and End, Escape and Tab back to their button, a click outside,
 * a crossing of the fold), and Japanese's own - no key pressed anywhere in the
 * bar reaches `document` (`isolateKeys`, on by default): the lesson quiz, the
 * reviews and the exam listen there, where Enter would submit a card or hand
 * a paper in, and Space play a word.
 *
 * While the site is not ready (the anotoki library's SiteStatus: being
 * updated, not set up, out of reach) its page stands in for the app's under
 * the bar, and the bar offers no section and no way into the admin panel -
 * each would lead to that same page. The site's ADMIN on the Migrations page,
 * the one page that works while an update waits, has that link alone.
 *
 * Sign out goes through SignOutService: it waits for the answers and notes
 * still on their way, and asks first when something would be lost; a
 * visitor's Sign in does the same first (SignInService), then goes to the IAM.
 * Both return a promise, which the bar waits for in the open menu (the item's
 * spinner and "Saving…", the focus on the menu's button).
 */
@Component({
  selector: 'app-top-bar',
  imports: [AnotokiTopBarComponent],
  templateUrl: './top-bar.component.html',
  styleUrl: './top-bar.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class TopBarComponent {
  private readonly auth = inject(AuthService);
  private readonly signOutFlow = inject(SignOutService);
  private readonly signInFlow = inject(SignInService);
  private readonly i18n = inject(TranslationService);
  private readonly kanji = inject(KanjiStateService);
  private readonly router = inject(Router);
  private readonly site = inject(SiteStatus);

  readonly nameMin = NAME_BAR_MIN;

  /** The address of the page, without its query and fragment: which link is the page's. */
  private readonly path = toSignal(
    this.router.events.pipe(
      filter((event) => event instanceof NavigationEnd),
      map(() => this.router.url),
    ),
    { initialValue: this.router.url },
  );
  private readonly here = computed(() => this.path().split(/[?#]/)[0] || '/');
  readonly area = computed(() => (isAdminArea(this.here()) ? 'admin' : 'app'));
  /** Up to this width the bar is a phone's: the admin panel's four links need more room than the learner's two. */
  readonly phoneMax = computed(() => (this.area() === 'admin' ? ADMIN_PHONE_BAR_MAX : PHONE_BAR_MAX));

  /**
   * The app can be used: somebody is signed in, or a visitor, and the anotoki
   * library's gate does not stand in front of this page (core/site-status.ts).
   * Only then are there sections to follow (they load data on the way).
   */
  private readonly ready = computed(() => this.auth.usable() && !pagesShut(this.site, () => this.auth.isAdmin(), this.here()));
  /** The way into the admin panel, for EDITOR and ADMIN: not while the site is not ready (the panel would be the library's page too). */
  private readonly adminOffered = computed(() => this.auth.isStaff() && !this.site.blocked());
  /** Sign in is offered: signed out with the Sign in card on the page (any other time the browser is on its way to the IAM), or visiting. */
  private readonly signedOut = computed(() => this.auth.showSignIn() || this.auth.visiting());

  private readonly shownLinks = computed(() => {
    if (!this.ready()) {
      return [];
    }
    const links = (this.area() === 'admin' ? ADMIN_LINKS : APP_LINKS).filter((link) => !link.adminOnly || this.auth.isAdmin());
    // While an update waits the Migrations page is the ADMIN's one page: the others would be the library's again.
    return this.site.blocked() ? links.filter((link) => link.path === MIGRATIONS_ROUTE) : links;
  });
  /** The reviews due on the phone's menu button: only where the Kanji link is in its menu. */
  private readonly phoneDue = computed(() => (this.shownLinks().some((link) => link.due) ? this.kanji.reviewsDue() : 0));

  /** The brand, linking home: "anotoki Japanese" (a name: English on every page), in the admin panel "anotoki Japanese · admin panel". */
  readonly brand = computed<TopBarBrand>(() =>
    this.area() === 'admin'
      ? { area: 'Japanese', panel: 'admin panel', link: '/admin', label: 'anotoki Japanese admin panel: home', lang: 'en' }
      : { area: 'Japanese', link: '/', label: this.word('topbar.home'), current: this.here() === '/', lang: 'en' },
  );

  /** The sections, worded in the language on the page (English in the admin panel); the reviews due beside Kanji. */
  readonly links = computed<TopBarLink[]>(() =>
    this.shownLinks().map((link) => ({
      id: link.id,
      label: link.key ? this.word(link.key) : (link.word ?? ''),
      path: link.path,
      under: link.under,
      lang: link.key ? null : 'en',
      badge: link.due ? this.kanji.reviewsDue() : null,
    })),
  );

  /** "Menu: 125 reviews due": the phone's menu button carries the reviews due and names them (Label in Name). */
  readonly phoneMark = computed<TopBarPhoneMark | null>(() => {
    const due = this.phoneDue();
    return due ? { badge: due, label: this.dueLabel(due) } : null;
  });

  /** Who is signed in, while the app is theirs (never a visitor): their name (or address; the app's word for an account with neither), the address under it, the role. */
  readonly person = computed<TopBarPerson | null>(() => {
    if (!this.auth.signedIn()) {
      return null;
    }
    const name = this.auth.displayName() || this.word('account.noName');
    const role = this.auth.isAdmin() ? this.i18n.t('anotoki.topbar.roleAdmin') : this.auth.isStaff() ? this.i18n.t('anotoki.topbar.roleEditor') : null;
    return { name, email: this.auth.user()?.email ?? null, role };
  });

  /**
   * Between the person's name and Sign out: their anotoki account (a new tab),
   * then the way into the admin panel for EDITOR and ADMIN - or, in it, the way
   * back to the app (English, as the whole panel).
   */
  readonly menuItems = computed<TopBarMenuItem[]>(() => {
    const items: TopBarMenuItem[] = [];
    const account = this.person() ? this.auth.accountUrl() : '';
    if (account) {
      items.push({ id: 'account', label: this.i18n.t('anotoki.topbar.account'), icon: 'user', href: account, newTab: true });
    }
    if (this.auth.isStaff()) {
      if (this.area() === 'admin') {
        items.push({ id: 'back', label: 'Back to Japanese Academy', icon: 'arrowLeft', path: '/', lang: 'en' });
      } else if (this.adminOffered()) {
        items.push({ id: 'admin', label: this.word('topbar.admin'), icon: 'shield', path: '/admin' });
      }
    }
    return items;
  });

  /**
   * To the IAM, whose pages open in the language read here — when one was
   * settled; from a visitor's page after the saves on their way, asking first
   * when something would be lost (SignInService). When it could not start, the
   * Sign in card (or, visiting, the line under the bar) says why.
   */
  readonly signIn = computed<TopBarAction | null>(() => (this.signedOut() ? () => this.signInFlow.signIn() : null));
  /** Waits for the saves on their way, asks when something would be lost, then the IAM signs the person out everywhere. */
  readonly signOut: TopBarAction = () => this.signOutFlow.signOut();

  private word(key: string, params?: Record<string, string | number>): string {
    return keptWord(this.i18n, key, ENGLISH[key], params);
  }

  /** "Menu: 125 reviews due", by the plural rules of the language on the page; with no strings, the English kept above. */
  private dueLabel(count: number): string {
    if (this.i18n.has('topbar.phoneMenuDue.other')) {
      return this.i18n.plural('topbar.phoneMenuDue', count);
    }
    return keptWord(this.i18n, 'topbar.phoneMenuDue.other', ENGLISH[count === 1 ? 'topbar.phoneMenuDue.one' : 'topbar.phoneMenuDue.other'], { count });
  }
}
