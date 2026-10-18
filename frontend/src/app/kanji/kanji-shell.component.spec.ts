import { provideZonelessChangeDetection } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';
import { TranslationService } from '@anotoki/lib/translations';
import { provideTestTranslations } from '@anotoki/lib/translations/testing';
import { ApiError } from '../core/api/api.service';
import { KanjiScreenService } from './kanji-screen.service';
import { freshKanji, KanjiShellComponent } from './kanji-shell.component';
import { KanjiStateService } from './kanji-state.service';

const ENGLISH: Record<string, string> = {
  'kanji.tab.dashboard': 'Dashboard',
  'kanji.tab.lessons': 'Lessons',
  'kanji.tab.reviews': 'Reviews',
  'kanji.tab.practice': 'Practice',
  'kanji.tab.browse': 'Browse',
  'kanji.loading': 'Loading…',
  'kanji.loadFailed': 'Could not load the kanji data: {reason}',
  'error.offline': 'The server does not answer.',
  'error.database_unavailable': 'The database is not reachable.',
  'error.http': 'The server answered with an error ({status}).',
  'error.unknown': 'Something went wrong.',
};
const SLOVAK: Record<string, string> = {
  'kanji.tab.dashboard': 'Prehľad',
  'kanji.tab.lessons': 'Lekcie',
  'kanji.tab.reviews': 'Opakovania',
  'kanji.tab.practice': 'Precvičovanie',
  'kanji.tab.browse': 'Prehliadať',
  'kanji.loading': 'Načítava sa…',
  'kanji.loadFailed': 'Údaje o kanji sa nepodarilo načítať: {reason}',
  'error.offline': 'Server neodpovedá.',
  'error.database_unavailable': 'Databáza nie je dostupná.',
  'error.http': 'Server odpovedal chybou ({status}).',
  'error.unknown': 'Niečo sa pokazilo.',
};

describe('the kanji section’s shell', () => {
  let load: ReturnType<typeof vi.fn>;
  let warn: ReturnType<typeof vi.spyOn>;
  let harness: RouterTestingHarness;

  const clean = (s: string | null | undefined): string => (s ?? '').replace(/\s+/g, ' ').trim();

  /** The shell at /kanji, its one screen a route with nothing to draw: what matters here is drawn by the shell. */
  async function open(slovak = false): Promise<HTMLElement> {
    TestBed.configureTestingModule({
      providers: [
        provideZonelessChangeDetection(),
        slovak ? provideTestTranslations(SLOVAK, { language: 'sk', english: ENGLISH }) : provideTestTranslations(ENGLISH),
        provideRouter([
          {
            path: 'kanji',
            component: KanjiShellComponent,
            children: [{ path: '', children: [], data: { nav: '' }, resolve: { fresh: freshKanji }, runGuardsAndResolvers: 'always' }],
          },
        ]),
        { provide: KanjiStateService, useValue: { load, refresh: () => Promise.resolve() } },
      ],
    });
    harness = await RouterTestingHarness.create('/kanji');
    await harness.fixture.whenStable();
    return harness.fixture.nativeElement as HTMLElement;
  }

  beforeEach(() => {
    load = vi.fn(() => Promise.resolve());
    warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
  });
  afterEach(() => vi.restoreAllMocks());

  it('names its tabs from keys, each with its address: the kit’s link tabs, in a navigation named Kanji, the page’s marked', async () => {
    const el = await open();
    expect(el.querySelector('.subnav anotoki-link-tabs nav')?.getAttribute('aria-label')).toBe('Kanji');
    const links = Array.from(el.querySelectorAll('.subnav a'));
    expect(links.map((a) => [clean(a.textContent), a.getAttribute('href'), a.getAttribute('aria-current')])).toEqual([
      ['Dashboard', '/kanji', 'page'],
      ['Lessons', '/kanji/lessons', null],
      ['Reviews', '/kanji/reviews', null],
      ['Practice', '/kanji/practice', null],
      ['Browse', '/kanji/browse', null],
    ]);
    expect(links.every((a) => a.classList.contains('anotoki-link-tabs__link'))).toBe(true);

    // The tab marked is the one the screen says, whatever the address (a session drawn over the dashboard marks its
    // own); an item's page is none of them, and none is marked.
    const screen = TestBed.inject(KanjiScreenService);
    screen.routeTab.set('practice');
    await harness.fixture.whenStable();
    expect(links.map((a) => a.getAttribute('aria-current'))).toEqual([null, null, null, 'page', null]);
    screen.routeTab.set('item');
    await harness.fixture.whenStable();
    expect(el.querySelector('.subnav a[aria-current]')).toBeNull();
    expect(el.querySelector('#kanjiLoadError')).toBeNull();
    expect(load).toHaveBeenCalledTimes(1);
    expect(warn, 'no key of the shell is without a string').not.toHaveBeenCalled();
  });

  it('…and in Slovak, following the language when it changes', async () => {
    const el = await open(true);
    const tabs = (): string[] => Array.from(el.querySelectorAll('.subnav a')).map((a) => clean(a.textContent));
    expect(tabs()).toEqual(['Prehľad', 'Lekcie', 'Opakovania', 'Precvičovanie', 'Prehliadať']);
    await TestBed.inject(TranslationService).setLanguage('en', { remember: false });
    await harness.fixture.whenStable();
    expect(tabs()).toEqual(['Dashboard', 'Lessons', 'Reviews', 'Practice', 'Browse']);
  });

  it('a load that fails resolves to the failure itself, which the shell words from its code', async () => {
    load.mockImplementation(() => Promise.reject(new ApiError('the server does not answer', 0, {})));
    const el = await open(true);
    expect(clean(el.querySelector('#kanjiLoadError')?.textContent)).toBe('Údaje o kanji sa nepodarilo načítať: Server neodpovedá.');
    const alert = el.querySelector('#kanjiLoadError') as HTMLElement;
    expect([alert.tagName.toLowerCase(), alert.getAttribute('data-tone')], 'the kit’s alert').toEqual(['anotoki-alert', 'danger']);
    expect(
      [alert.getAttribute('role'), alert.closest('main')?.getAttribute('aria-live')],
      'said by the screen’s live region it is in, never by one of its own (a live region in another may be said twice)',
    ).toEqual([null, 'polite']);
    expect(el.textContent).not.toContain('the server does not answer');

    await TestBed.inject(TranslationService).setLanguage('en', { remember: false });
    await harness.fixture.whenStable();
    expect(clean(el.querySelector('#kanjiLoadError')?.textContent)).toBe('Could not load the kanji data: The server does not answer.');
  });

  it('shows what the owner’s own computer adds after its own words, small, saying it is English', async () => {
    const detail = 'SQLSTATE[08006] could not connect to server';
    load.mockImplementation(() =>
      Promise.reject(new ApiError(`The database is not reachable: ${detail}`, 503, { error: `The database is not reachable: ${detail}`, code: 'database_unavailable', detail })),
    );
    const el = await open(true);
    const err = el.querySelector('#kanjiLoadError') as HTMLElement;
    expect(clean(err.textContent)).toBe(`Údaje o kanji sa nepodarilo načítať: Databáza nie je dostupná. ${detail}`);
    const span = err.querySelector('span[lang]') as HTMLElement;
    expect([span.textContent, span.getAttribute('lang'), span.className]).toEqual([detail, 'en', 'small']);
    expect(err.textContent, 'the server’s own sentence is not shown').not.toContain('The database is not reachable');
  });

  it('words an answer that was not the app’s own by its status, and a fault of the page as the general sentence', async () => {
    load.mockImplementation(() => Promise.reject(new ApiError('Bad Gateway', 502, {})));
    let el = await open();
    expect(clean(el.querySelector('#kanjiLoadError')?.textContent)).toBe('Could not load the kanji data: The server answered with an error (502).');

    TestBed.resetTestingModule();
    load.mockImplementation(() => Promise.reject(new TypeError('x is not a function')));
    el = await open();
    expect(clean(el.querySelector('#kanjiLoadError')?.textContent)).toBe('Could not load the kanji data: Something went wrong.');
    expect(el.textContent).not.toContain('not a function');
  });

  it('freshKanji resolves to null when the data came, and to an ApiError when it did not', async () => {
    TestBed.configureTestingModule({ providers: [provideZonelessChangeDetection(), { provide: KanjiStateService, useValue: { load } }] });
    const resolve = (): Promise<ApiError | null> => TestBed.runInInjectionContext(() => freshKanji({} as never, {} as never)) as Promise<ApiError | null>;
    expect(await resolve()).toBeNull();

    const refused = new ApiError('Sign in first.', 401, { error: 'Sign in first.', code: 'sign_in_required' });
    load.mockImplementation(() => Promise.reject(refused));
    expect(await resolve()).toBe(refused);

    load.mockImplementation(() => Promise.reject(new Error('boom')));
    const failure = await resolve();
    expect(failure).toBeInstanceOf(ApiError);
    expect(failure?.code).toBe('unknown');
  });
});
