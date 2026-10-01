import { DOCUMENT, Injectable, computed, effect, inject, signal, untracked } from '@angular/core';
import { errorCode } from '../api/api.service';
import { ApiErrorBody } from '../api/api.types';
import { AuthService, isNotSetUp } from '../auth/auth.service';
import { SiteLanguage, TranslationBundle } from './translation.model';

/** What everything falls back to: the server merges English underneath every bundle. */
export const FALLBACK_LANGUAGE = 'en';

/**
 * The chooser's choice (localStorage) and the `?lang=` of this tab
 * (sessionStorage): the same name in two stores with two lifetimes.
 */
export const LANGUAGE_KEY = 'academy-language';
/** The last bundle, so a returning reader is not shown keys while the request is out. */
export const LANGUAGE_CACHE_KEY = 'academy-language-cache';

/** A language code as the database keeps it — the same expression as language_code_ok() in PHP. */
const LANGUAGE_CODE = /^[a-z]{2}(-[a-z]{2})?$/;
/** A placeholder in a string — the same expression as the server's check. */
const PLACEHOLDER = /\{([A-Za-z][A-Za-z0-9_]*)\}/g;

/**
 * At the browser step only: a language nobody offers that reads another far
 * more easily than English. Czech readers read Slovak. An exact match always
 * wins — this counts only while no `cs` language is on offer.
 */
const BROWSER_ALIASES: Record<string, string> = { cs: 'sk' };

/** What `Intl` is given: British English writes dates the way the rest of Europe reads them. */
const LOCALES: Record<string, string> = { en: 'en-GB', sk: 'sk-SK' };

/** How long a start with a cached bundle waits for the fresh one (a 304, usually). */
export const CACHE_WAIT_MS = 1000;
/** How long a start with no cache waits before it asks a second, last time for a bundle that did not come. */
export const RETRY_WAIT_MS = 500;

/** What fills a string's {placeholders}. */
export type TranslationParams = Record<string, string | number | null | undefined>;

/** A language somebody may want, and whether it is the browser that said so (only there do aliases count). */
export interface LanguageCandidate {
  code: string;
  browser: boolean;
}

/** Where a wish for a language can come from, strongest first. */
export interface LanguageSources {
  /** `?lang=`, kept for this tab. */
  tab?: string | null;
  /** What the chooser remembered on this device. */
  chosen?: string | null;
  /** The `locale` claim of the IAM's token (a website only). */
  token?: string | null;
  /** `navigator.languages`. */
  browser?: readonly (string | null | undefined)[];
}

/** The code, lower-cased, when it has the shape of one — anything else is nothing: never stored, never sent. */
export function languageCode(raw: unknown): string | null {
  const code = typeof raw === 'string' ? raw.toLowerCase() : '';
  return LANGUAGE_CODE.test(code) ? code : null;
}

/**
 * Every language the reader may want, in order: `?lang=` / this tab, the
 * chooser's remembered choice, the token's `locale`, each browser tag and
 * then its first subtag (`sk-SK` also asks for `sk`), and English.
 */
export function languageCandidates(sources: LanguageSources): LanguageCandidate[] {
  const candidates: LanguageCandidate[] = [];
  const add = (raw: unknown, browser: boolean): void => {
    const code = languageCode(raw);
    if (code && !candidates.some((candidate) => candidate.code === code && candidate.browser === browser)) {
      candidates.push({ code, browser });
    }
  };
  add(sources.tab, false);
  add(sources.chosen, false);
  add(sources.token, false);
  for (const tag of sources.browser ?? []) {
    add(tag, true);
    add(typeof tag === 'string' ? tag.split('-')[0] : null, true);
  }
  add(FALLBACK_LANGUAGE, false);
  return candidates;
}

/** The first candidate that is on offer — or, for a browser's wish, whose alias is — else English. */
export function pickLanguage(candidates: readonly LanguageCandidate[], offered: readonly string[]): string {
  for (const candidate of candidates) {
    if (offered.includes(candidate.code)) {
      return candidate.code;
    }
    if (candidate.browser && Object.hasOwn(BROWSER_ALIASES, candidate.code) && offered.includes(BROWSER_ALIASES[candidate.code])) {
      return BROWSER_ALIASES[candidate.code];
    }
  }
  return FALLBACK_LANGUAGE;
}

/**
 * A string with its {placeholders} filled, in one pass: a parameter's own text
 * is never scanned again, and a placeholder with no parameter stays as
 * written. For the service, and for the English a page keeps in its own code
 * (standin/kept-word.ts).
 */
export function fillPlaceholders(value: string, params?: TranslationParams): string {
  if (!params) {
    return value;
  }
  return value.replace(PLACEHOLDER, (whole, name: string) => {
    const given = Object.hasOwn(params, name) ? params[name] : undefined;
    return given === undefined || given === null ? whole : String(given);
  });
}

/** The server refused a bundle: its status and what it said. */
export class BundleRefused extends Error {
  constructor(
    readonly status: number,
    readonly body: unknown,
  ) {
    super(`The app's words could not be had (${status}).`);
  }
}

/**
 * The app's own words: which language the pages are read in, and the strings
 * for it. They live in the database (the owner's Translations page edits them)
 * and arrive as one bundle — GET /api/translations/{code}, the same for
 * everybody, asked for with plain fetch(): no token goes with it, and neither
 * interceptor touches it.
 *
 * Only the app's own words are translated. The learning material, the stage
 * names and the grammar terms are what they are in every language; they go
 * into a sentence as {placeholders}.
 *
 * A key with no string comes back as itself, on the page, and warns once: the
 * owner wants to see which key is missing.
 *
 * Keys are never built from an address, from the IAM's answer or from
 * anything a person typed — run-time keys come from closed sets, through a
 * table with a fallback key (error-text.ts, dynamic-keys.ts). And state holds
 * keys, kinds and ApiErrors, never a worded sentence: wording happens in a
 * template (the pipes) or inside a computed() / effect() that calls t(), which
 * reads signals and so runs again when the language changes.
 *
 * This service never injects the Router: the Router builds the title strategy,
 * the strategy needs this service, and asking for the Router here would close
 * the circle (NG0200 at start-up). The strategy says when the page has moved
 * instead — navigated(). It injects AuthService (what the app can show, the
 * token's `locale`, the two ways a 503 changes the state); AuthService never
 * injects this.
 *
 * Every load — the start, a choice, reload(), asking again — takes the next
 * turn, and an answer is used only while its turn is still the last one: the
 * load begun last wins, however late an earlier answer comes.
 */
@Injectable({ providedIn: 'root' })
export class TranslationService {
  private readonly auth = inject(AuthService);
  private readonly document = inject(DOCUMENT);

  private readonly languageSignal = signal(FALLBACK_LANGUAGE);
  private readonly languagesSignal = signal<SiteLanguage[]>([]);
  /** The chosen language's strings, English merged underneath. Null: no bundle yet. A Map, so `has('constructor')` is false. */
  private readonly values = signal<ReadonlyMap<string, string> | null>(null);

  /**
   * The language on the page. A plain signal: it changes only once the bundle
   * of that language is in memory (init(), setLanguage()), never by itself
   * when a token or the address changes — a page is never in a language it has
   * no strings for.
   */
  readonly language = this.languageSignal.asReadonly();
  /** The languages on offer, in the order the owner set. Empty until a bundle came. */
  readonly languages = this.languagesSignal.asReadonly();
  /** A bundle is in memory — from the cache or from the server. */
  readonly ready = computed(() => this.values() !== null);
  /** What `Intl` is given for dates and numbers in the language on the page. */
  readonly locale = computed(() => {
    const code = this.languageSignal();
    return Object.hasOwn(LOCALES, code) ? LOCALES[code] : code;
  });

  /** Keys already complained about, so one missing string is one warning. */
  private readonly warned = new Set<string>();
  /** Counts the loads begun: an answer that arrives after a later load began is dropped. */
  private lastTurn = 0;
  /** The loads still out. While there is one, nothing asks again: never two in flight for the same thing. */
  private out = 0;
  /** init() has decided the language at least once: only then is there something to ask again for. */
  private started = false;
  /**
   * What is in force came from the server since this page was loaded. False
   * with no bundle at all, and with the cached one whose refresh has not come
   * (or failed): then the next navigation asks again.
   */
  private fresh = false;
  /**
   * The two wishes that are kept in storage, held here as well for as long as
   * the page lives: `?lang=` of this tab, and what the chooser was told. A
   * browser whose storage refuses writes still gets both, until it reloads.
   */
  private tab: string | null = null;
  private chosen: string | null = null;
  /** The token's `locale` as last seen: only a changed one is adopted. */
  private seenLocale: string | null = null;

  constructor() {
    // Honest for a screen reader, and for the browser's own hyphenation and spelling.
    effect(() => {
      this.document.documentElement.lang = this.languageSignal();
    });
    // Somebody signed in, out or was refreshed — in this tab or another: the
    // token's `locale` may be another one now (followToken()).
    effect(() => {
      const locale = this.tokenLocale();
      untracked(() => this.followToken(locale));
    });
  }

  // ── Reading ────────────────────────────────────────────────────────────────

  /**
   * The string for a key in the language on the page, its {placeholders}
   * filled in one pass: a parameter's own text is never scanned again, and a
   * placeholder with no parameter stays as written.
   *
   * An unknown key comes back as itself — on purpose visible — and warns once.
   */
  t(key: string, params?: TranslationParams): string {
    const value = this.strings().get(key);
    return value === undefined ? this.missing(key) : fillPlaceholders(value, params);
  }

  /**
   * One of a plural family — `key.one`, `key.few`, `key.other` — by the rules
   * of the language on the page (Slovak: 1 -> one, 2-4 -> few, 0 and 5+ ->
   * other). The form is chosen on the number itself; inside a family the number
   * is always `{count}`, whatever the code calls it, and it is written the way
   * the language writes numbers: 11,523 in English, 11 523 in Slovak.
   */
  plural(key: string, count: number, params?: TranslationParams): string {
    const form = `${key}.${pluralRules(this.languageSignal()).select(count)}`;
    return this.t(this.has(form) ? form : `${key}.other`, { ...params, count: this.number(count) });
  }

  /**
   * A number the way the language on the page writes it, for one that goes
   * into t() as any other placeholder: `t('exam.size', { n: number(11523) })`.
   */
  number(value: number, options?: Intl.NumberFormatOptions): string {
    return numberFormat(this.locale(), options).format(value);
  }

  /**
   * A sentence cut at one placeholder, for markup inside it:
   * `{{ before }}<b lang="ja">{{ expected }}</b>{{ after }}`. The stored string
   * is cut first and each half filled after, so nothing a parameter holds can
   * move the cut.
   *
   * The third answer says whether the cut was made. It is not when the key
   * has no string, and not when the string leaves the placeholder out — which
   * a language other than English may: then the whole sentence (or the key)
   * is the first half, and the page must not draw the marked-up value at all,
   * or it would be glued onto a sentence that does not name it.
   */
  around(key: string, placeholder: string, params?: TranslationParams): [before: string, after: string, found: boolean] {
    const value = this.strings().get(key);
    if (value === undefined) {
      return [this.missing(key), '', false];
    }
    const mark = `{${placeholder}}`;
    const at = value.indexOf(mark);
    return at < 0
      ? [fillPlaceholders(value, params), '', false]
      : [fillPlaceholders(value.slice(0, at), params), fillPlaceholders(value.slice(at + mark.length), params), true];
  }

  /** Whether a key has a string — for what is drawn while there may be no bundle, which keeps its English in code. */
  has(key: string): boolean {
    return this.strings().has(key);
  }

  // ── Choosing ───────────────────────────────────────────────────────────────

  /**
   * The chooser's choice: loads that language's bundle, then switches and
   * remembers it on this device. Never rejects — false when the strings could
   * not be had, and the page stays as it is.
   *
   * `remember: false` is for a language that was not chosen here (the token's
   * `locale`): used, not stored — only the chooser writes the choice.
   *
   * The last choice wins: a choice takes its turn even when it needs no
   * request (the language already on the page), so a slower, earlier choice
   * still on its way is dropped when it comes — and that one answers false.
   */
  async setLanguage(code: string, remember = true): Promise<boolean> {
    const wanted = languageCode(code);
    if (!wanted) {
      return false;
    }
    const turn = ++this.lastTurn;
    if (wanted !== this.languageSignal() || !this.ready()) {
      const bundle = await this.counted(this.request(wanted, false));
      if (turn !== this.lastTurn) {
        return false;
      }
      if (!bundle || bundle.language !== wanted) {
        // Switched off a moment ago: the server answered in English. The page
        // stays in its language; the chooser stops offering the one that went.
        if (bundle?.languages.some((language) => language.code === this.languageSignal())) {
          this.languagesSignal.set(bundle.languages);
        }
        return false;
      }
      this.put(bundle);
    }
    if (remember) {
      // In memory too: storage may refuse the write, and the choice must hold for this page all the same.
      this.chosen = wanted;
      writeStorage(LANGUAGE_KEY, wanted);
      // A choice made here is stronger than the `?lang=` this tab came with.
      this.tab = null;
      writeTab(LANGUAGE_KEY, null);
    }
    return true;
  }

  /**
   * The strings again, from the server: for whoever has just changed them, or
   * the languages on offer (the owner's Translations and Languages pages, after
   * a save). Asks for the bundle of the language on the page and settles
   * against the list that comes with it — so a language hidden or offered a
   * moment ago is followed — then puts the answer in force and in the cache.
   * Never rejects; when the server cannot be had, the page stays as it is —
   * and, being known to be behind, asks again at the next navigation.
   *
   * Not init(): that one is the start — it takes `?lang=` out of the address
   * and starts from the cache.
   */
  async reload(): Promise<void> {
    try {
      // What is in memory is no longer known to be what the server has.
      this.fresh = false;
      await this.again();
    } catch (error) {
      console.error('[i18n] the strings could not be read again', error);
    }
  }

  /**
   * The page has moved, said by the title strategy after every navigation.
   * That is when a page that started without its strings asks for them once
   * more: while no bundle is in memory (the first request failed — the page is
   * in keys), or while the cached one is in force because its refresh failed.
   * One load a navigation, and none while another is out — so such a page
   * heals by itself at the next click, and a server that stays down is asked
   * no more often than somebody clicks.
   */
  navigated(): void {
    if (this.started && !this.fresh && this.out === 0 && this.canAsk()) {
      void this.again().catch((error: unknown) => console.error('[i18n] the strings could not be asked for again', error));
    }
  }

  // ── Starting ───────────────────────────────────────────────────────────────

  /**
   * Once as the app starts, after the sign-in (which, back from the IAM, has
   * put the address back): decides the language and gets its strings before
   * the first page is drawn. Never rejects.
   *
   * By what the app can show (AuthService.state()):
   *   ready, signed-out    the bundle is asked for. Signed out is a state of
   *                        its own here, in which the server answers — and it
   *                        turns ready without a page load when somebody signs
   *                        in in another tab, so the strings must be in memory
   *                        by then.
   *   not-set-up, problem  nothing is requested: the cached bundle is taken
   *                        when there is one — in whatever language it is in —
   *                        and the stand-in pages word themselves otherwise.
   *
   * A request answered 503 changes that state instead of leaving a page of
   * keys (refused()).
   */
  async init(): Promise<void> {
    try {
      await this.start();
    } catch (error) {
      console.error('[i18n] the language could not be set up', error);
    }
  }

  private async start(): Promise<void> {
    this.takeAddressLanguage();
    this.seenLocale = this.tokenLocale();
    this.started = true;

    // Whether the server can be asked decides what a cache is worth. While it
    // cannot, the language the cache is in is the best there is: not every
    // wish is known then (nobody is signed in, so the token says nothing).
    const running = this.canAsk();
    const candidates = this.candidates();
    const cached = this.cachedBundle(candidates, running);
    if (cached) {
      this.put(cached, false);
    }
    if (!running) {
      return;
    }

    const turn = ++this.lastTurn;
    const first = cached ? cached.language : candidates[0].code;
    if (cached) {
      // With a cache the page may start from it, but not at once: a release adds
      // strings, and a returning reader would see their keys. The fresh bundle is
      // a 304 most of the time — worth a second's wait; it replaces the cache
      // whenever it comes.
      await Promise.race([this.counted(this.refresh(turn, candidates, first, true)), wait(CACHE_WAIT_MS)]);
      return;
    }
    await this.counted(this.firstLoad(turn, candidates, first));
  }

  /** The server can be asked for the strings: the app itself is shown, or its Sign in page. */
  private canAsk(): boolean {
    const state = this.auth.state();
    return state === 'ready' || state === 'signed-out';
  }

  /**
   * The start with no cache: the page waits for its strings, and a request
   * that fails is made once more after a moment — one lost answer should not
   * leave a first visit in keys. After that the page is drawn as it is, and
   * asks again at each navigation (navigated()). Not when the answer was a
   * 503 that changed what the app can show: there is nothing to ask again for.
   */
  private async firstLoad(turn: number, candidates: readonly LanguageCandidate[], first: string): Promise<void> {
    if ((await this.refresh(turn, candidates, first, true)) || turn !== this.lastTurn || !this.canAsk()) {
      return;
    }
    await wait(RETRY_WAIT_MS);
    if (turn === this.lastTurn && this.canAsk()) {
      await this.refresh(turn, candidates, first, true);
    }
  }

  /**
   * The strings once more, for the wishes as they are now: what reload() does,
   * and what a navigation does for a page that has none from the server. It
   * asks first for the language in force — its bundle names the languages on
   * offer now — and takes the next turn, so it is the load that counts.
   */
  private again(): Promise<boolean> {
    const turn = ++this.lastTurn;
    const candidates = this.candidates();
    return this.counted(this.refresh(turn, candidates, this.ready() ? this.languageSignal() : candidates[0].code, false));
  }

  /**
   * One load, put in force when it came and is still the last one begun.
   * False: the server could not be had — or a later load has taken over.
   */
  private async refresh(turn: number, candidates: readonly LanguageCandidate[], first: string, atStart: boolean): Promise<boolean> {
    const bundle = await this.load(candidates, first, atStart);
    if (!bundle || turn !== this.lastTurn) {
      return false;
    }
    this.put(bundle);
    return true;
  }

  /** Counted while it is out, whichever way it ends. */
  private async counted<T>(work: Promise<T>): Promise<T> {
    this.out++;
    try {
      return await work;
    } finally {
      this.out--;
    }
  }

  /**
   * The bundle for the language the candidates settle on. The list of offered
   * languages arrives with the bundle itself, so: ask for `first`, settle
   * against the list that came — whatever answered — and fetch that bundle if
   * it is another language than the one in hand. One request when `first` is
   * what the wishes settle on (the usual case: the server answers a regional
   * code like `sk-sk` with its base language); two at most — on a first visit
   * whose first wish is not on offer, or when the offered languages have
   * changed since the cached bundle was made (a language hidden, offered
   * again, or added: the reader is moved to it now, not one visit late).
   *
   * When the second request fails the first answer is what there is: a page in
   * English rather than in keys.
   */
  private async load(candidates: readonly LanguageCandidate[], first: string, atStart: boolean): Promise<TranslationBundle | null> {
    const answer = await this.request(first, atStart);
    if (!answer) {
      return null;
    }
    const settled = pickLanguage(
      candidates,
      answer.languages.map((language) => language.code),
    );
    return settled === answer.language ? answer : ((await this.request(settled, atStart)) ?? answer);
  }

  /** One bundle from the server, checked — or null: out of reach, refused, or not what a bundle is. */
  private async request(code: string, atStart: boolean): Promise<TranslationBundle | null> {
    try {
      return bundleFrom(await this.fetchBundle(code));
    } catch (error) {
      if (error instanceof BundleRefused) {
        this.refused(error, atStart);
      }
      // Offline, or the server is down. The cache — or the keys themselves — is
      // what the page shows then; it is not worth stopping the app over.
      return null;
    }
  }

  /**
   * The server answered 503 instead of the strings. That is not a lost answer:
   * it says what the app can show.
   *
   *   not_set_up      the copy has no settings, or its database no tables: the
   *                   page that points at /setup.php — a database without its
   *                   tables says so here first.
   *   any other 503   (not_up_to_date: an upload still arriving, or a migration
   *                   that failed; database_unavailable) the problem page, with
   *                   the reason the server gives the owner's own computer.
   *
   * The second only as the app starts, or while no bundle is in memory (the
   * page would be in keys): once the app runs with its words, a choice of
   * language that meets a 503 just fails, as any other lost answer — a lesson
   * or a paper somebody is in the middle of is not taken away over it.
   */
  private refused(refusal: BundleRefused, atStart: boolean): void {
    if (refusal.status !== 503) {
      return;
    }
    const body = refusal.body;
    if (isNotSetUp(refusal.status, body)) {
      this.auth.notSetUp((body as ApiErrorBody).reason);
      return;
    }
    if (atStart || !this.ready()) {
      const detail = body && typeof body === 'object' ? (body as ApiErrorBody).detail : undefined;
      this.auth.cannotStart({
        kind: 'server',
        status: refusal.status,
        code: errorCode(refusal.status, body),
        detail: typeof detail === 'string' && detail !== '' ? detail : null,
      });
    }
  }

  /**
   * GET /api/translations/{code}, with plain fetch(). Answers what the server
   * sent, unchecked; throws BundleRefused for an answer that is not 2xx. On its
   * own so the tests' stand-in answers without HTTP.
   */
  protected async fetchBundle(code: string): Promise<unknown> {
    const response = await fetch(`/api/translations/${encodeURIComponent(code)}`, { headers: { Accept: 'application/json' } });
    if (!response.ok) {
      throw new BundleRefused(response.status, await response.json().catch(() => null));
    }
    return response.json();
  }

  /**
   * Puts a bundle in force as the one a spec runs with (the tests' stand-in):
   * it counts as the server's — nothing asks for it again — and is kept nowhere.
   */
  protected use(bundle: TranslationBundle): void {
    this.put(bundle, false);
    this.fresh = true;
  }

  /**
   * Puts a checked bundle in force — strings first, then the language they are
   * in. The server's is kept for the next visit; the kept one (`keep: false`)
   * is only in force until the server's comes.
   */
  private put(bundle: TranslationBundle, keep = true): void {
    this.values.set(new Map(Object.entries(bundle.values)));
    this.languagesSignal.set(bundle.languages);
    this.languageSignal.set(bundle.language);
    this.fresh = keep;
    if (keep) {
      writeStorage(LANGUAGE_CACHE_KEY, JSON.stringify(bundle));
    }
  }

  private strings(): ReadonlyMap<string, string> {
    return this.values() ?? NO_STRINGS;
  }

  private candidates(): LanguageCandidate[] {
    const navigator = this.document.defaultView?.navigator;
    return languageCandidates({
      tab: this.tabWish(),
      chosen: this.chosenWish(),
      token: this.tokenLocale(),
      browser: navigator?.languages?.length ? navigator.languages : [navigator?.language],
    });
  }

  /** `?lang=` of this tab: what this page took from its address, else what the tab kept. */
  private tabWish(): string | null {
    return this.tab ?? readTab(LANGUAGE_KEY);
  }

  /** The chooser's choice: what was chosen on this page, else what the device kept. */
  private chosenWish(): string | null {
    return this.chosen ?? readStorage(LANGUAGE_KEY);
  }

  /**
   * `?lang=` holds for this tab: kept in sessionStorage — it survives the
   * round trip to the IAM and the navigation inside the app — and taken out of
   * the address before the router reads it. Never written to localStorage:
   * a link somebody followed is not a choice they made. Kept in memory too,
   * because the parameter is gone from the address either way: where
   * sessionStorage refuses the write, the link still works for this page.
   */
  private takeAddressLanguage(): void {
    const view = this.document.defaultView;
    const location = this.document.location;
    const parts = (location?.search ?? '').replace(/^\?/, '').split('&');
    const given = parts.filter((part) => part.split('=')[0] === 'lang');
    if (!view || !location || !given.length) {
      return;
    }
    let value = '';
    try {
      value = decodeURIComponent(given[0].split('=')[1] ?? '');
    } catch {
      // Not an address anybody wrote by hand; not a language either.
    }
    const code = languageCode(value);
    if (code) {
      this.tab = code;
      writeTab(LANGUAGE_KEY, code);
    }
    // The other parameters stay byte for byte as they came.
    const rest = parts.filter((part) => part !== '' && part.split('=')[0] !== 'lang').join('&');
    try {
      view.history.replaceState(view.history.state, '', location.pathname + (rest ? `?${rest}` : '') + location.hash);
    } catch {
      // A browser that refuses: the parameter stays, and does no harm.
    }
  }

  /**
   * The token's `locale` is used, not stored: a change made on the IAM's
   * account page arrives with the next token, and somebody signing in in
   * another tab brings theirs. While nothing is stored here — no choice, no
   * `?lang=` — a changed one is adopted when it comes.
   */
  private followToken(locale: string | null): void {
    if (!this.started || locale === this.seenLocale) {
      return;
    }
    this.seenLocale = locale;
    const stored = languageCode(this.tabWish()) ?? languageCode(this.chosenWish());
    if (locale && !stored && locale !== this.languageSignal() && this.languagesSignal().some((language) => language.code === locale)) {
      void this.setLanguage(locale, false);
    }
  }

  /** The `locale` of whoever is signed in — on a website only: without sign-in there is no token. */
  private tokenLocale(): string | null {
    return languageCode(this.auth.user()?.locale);
  }

  /**
   * The cached bundle, only when it is one — it parses, has the shape, and
   * (`settle`) is in the language the candidates settle on now. Anything else
   * is removed: a corrupt or outdated cache is no cache.
   *
   * Without `settle` — the server cannot be asked — the language is not asked
   * about: the wishes are not all known then (nobody is signed in, so the
   * token says nothing), and a cache in another language is still the reader's
   * own words from their last visit. It is used, and left where it is.
   */
  private cachedBundle(candidates: readonly LanguageCandidate[], settle: boolean): TranslationBundle | null {
    const raw = readStorage(LANGUAGE_CACHE_KEY);
    if (raw === null) {
      return null;
    }
    let bundle: TranslationBundle | null = null;
    try {
      bundle = bundleFrom(JSON.parse(raw));
    } catch {
      bundle = null;
    }
    if (
      bundle &&
      (!settle ||
        bundle.language ===
          pickLanguage(
            candidates,
            bundle.languages.map((language) => language.code),
          ))
    ) {
      return bundle;
    }
    writeStorage(LANGUAGE_CACHE_KEY, null);
    return null;
  }

  private missing(key: string): string {
    if (!this.warned.has(key)) {
      this.warned.add(key);
      console.warn(`[i18n] no string for '${key}'`);
    }
    return key;
  }
}

const NO_STRINGS: ReadonlyMap<string, string> = new Map();

const PLURAL_RULES = new Map<string, Intl.PluralRules>();

/** The plural rules of a language: only ever asked with a code that passed the pattern. */
function pluralRules(language: string): Intl.PluralRules {
  let rules = PLURAL_RULES.get(language);
  if (!rules) {
    rules = new Intl.PluralRules(language);
    PLURAL_RULES.set(language, rules);
  }
  return rules;
}

const NUMBER_FORMATS = new Map<string, Intl.NumberFormat>();

function numberFormat(locale: string, options?: Intl.NumberFormatOptions): Intl.NumberFormat {
  const key = options ? `${locale}|${JSON.stringify(options)}` : locale;
  let format = NUMBER_FORMATS.get(key);
  if (!format) {
    format = new Intl.NumberFormat(locale, options);
    NUMBER_FORMATS.set(key, format);
  }
  return format;
}

function wait(milliseconds: number): Promise<void> {
  return new Promise((done) => setTimeout(done, milliseconds));
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** A flat {key: text} map, copied — or null when it is anything else. */
function stringsFrom(raw: unknown): Record<string, string> | null {
  if (!isPlainObject(raw)) {
    return null;
  }
  const strings: Record<string, string> = {};
  for (const [key, value] of Object.entries(raw)) {
    if (typeof value !== 'string') {
      return null;
    }
    strings[key] = value;
  }
  return strings;
}

/**
 * A bundle, from the server or from the cache, only when it is one: a language
 * code, the offered languages (strings, and the bundle's own among them),
 * a flat map of strings — and English beside it for every other language.
 */
function bundleFrom(raw: unknown): TranslationBundle | null {
  if (!isPlainObject(raw) || !Array.isArray(raw['languages'])) {
    return null;
  }
  const language = raw['language'];
  if (typeof language !== 'string' || !LANGUAGE_CODE.test(language)) {
    return null;
  }
  const languages: SiteLanguage[] = [];
  for (const entry of raw['languages']) {
    if (!isPlainObject(entry)) {
      return null;
    }
    const { code, name, nativeName } = entry;
    if (typeof code !== 'string' || !LANGUAGE_CODE.test(code) || typeof name !== 'string' || typeof nativeName !== 'string') {
      return null;
    }
    languages.push({ code, name, nativeName });
  }
  const values = stringsFrom(raw['values']);
  if (!values || !languages.some((entry) => entry.code === language)) {
    return null;
  }
  if (language === FALLBACK_LANGUAGE) {
    return { language, languages, values };
  }
  const english = stringsFrom(raw['english']);
  return english ? { language, languages, values, english } : null;
}

/**
 * localStorage that never throws. It can be missing or refuse writes — a
 * private window, storage switched off, a full quota — and nothing kept in it
 * here is worth breaking a page over. A read that fails is "nothing stored".
 */
function readStorage(key: string): string | null {
  try {
    return globalThis.localStorage?.getItem(key) ?? null;
  } catch {
    return null;
  }
}

function writeStorage(key: string, value: string | null): void {
  try {
    if (value === null) {
      globalThis.localStorage?.removeItem(key);
    } else {
      globalThis.localStorage?.setItem(key, value);
    }
  } catch {
    // Nothing to do: the value just will not survive a reload.
  }
}

/** sessionStorage, the same way. */
function readTab(key: string): string | null {
  try {
    return globalThis.sessionStorage?.getItem(key) ?? null;
  } catch {
    return null;
  }
}

function writeTab(key: string, value: string | null): void {
  try {
    if (value === null) {
      globalThis.sessionStorage?.removeItem(key);
    } else {
      globalThis.sessionStorage?.setItem(key, value);
    }
  } catch {
    // Nothing to do: the language just will not hold for the tab.
  }
}
