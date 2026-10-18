import { provideZonelessChangeDetection } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';
import { TranslationService } from '@anotoki/lib/translations';
import { provideTestTranslations } from '@anotoki/lib/translations/testing';
import { ConfirmService } from '@anotoki/lib/ui/dialog';
import { ApiService } from '../../core/api/api.service';
import { CatalogItem, ItemState, Stage } from '../../core/api/api.types';
import { AudioService } from '../../core/audio.service';
import { KanjiStateService } from '../kanji-state.service';
import { ItemComponent } from './item.component';
import { provideAuth } from '../../core/auth/auth.config';

const ENGLISH: Record<string, string> = {
  'common.lesson': 'Lesson {n}',
  'kanji.type.kanji': 'Kanji',
  'kanji.type.vocab': 'Vocabulary',
  'kanji.meaning': 'Meaning',
  'kanji.reading': 'Reading',
  'kanji.listen': '▶ Listen',
  'kanji.tab.practice': 'Practice',
  'kanji.tileNotLearned': 'not learned',
  'item.notLearned': 'Not learned',
  'item.practiseNow': 'Practise it now',
  'item.reset': 'Reset progress',
  'item.learnNow': 'Learn it now',
  'item.kanjiFirst': 'Learn its kanji first: {need}',
  'item.progress': 'Progress',
  'item.stage': 'Stage',
  'item.learned': 'Learned',
  'item.nextReview': 'Next review',
  'item.noMoreReviews': '{stage} — no more reviews',
  'item.meaningAnswers': 'Meaning answers',
  'item.readingAnswers': 'Reading answers',
  'item.accuracy': '{pct}% ({right}/{total})',
  'item.acceptedTitle': 'Your accepted answers',
  'item.acceptedNote': 'Answers you added with “My answer was right”, or here. They count in reviews and practice.',
  'item.noneYet': 'None yet.',
  'item.remove': 'Remove',
  'item.addMeaning': 'Add your own meaning',
  'item.add': 'Add',
  'item.notFound': 'Not found',
  'item.resetTitle': 'Reset {chars}?',
  'item.confirmReset': 'It goes back to "not learned"; your notes stay.',
  'item.synonyms': 'Your synonyms: {synonyms}',
  'item.foundIn': 'Found in vocabulary',
  'item.alsoAccepted': 'Also accepted',
  'notes.title': 'Your notes',
  'notes.meaningLabel': 'Meaning note',
  'notes.readingLabel': 'Reading note',
  'notes.meaningPlaceholder': 'A mnemonic for the meaning.',
  'notes.readingPlaceholder': 'A mnemonic for the reading.',
  'error.no_such_item': 'No such item.',
  'time.now': 'now',
  'time.inMinutes': 'in {m} min',
  'time.inHours': 'in {h} h',
  'time.inHoursMinutes': 'in {h} h {m} min',
};

const SLOVAK: Record<string, string> = {
  ...ENGLISH,
  'common.lesson': 'Lekcia {n}',
  'kanji.type.vocab': 'Slovíčka',
  'item.notLearned': 'Nenaučené',
  'item.kanjiFirst': 'Najprv sa nauč kanji: {need}',
  'item.noMoreReviews': '{stage} – žiadne ďalšie opakovania',
  'item.accuracy': '{pct} % ({right}/{total})',
  'item.reset': 'Vynulovať pokrok',
  'item.resetTitle': 'Vynulovať „{chars}“?',
  'item.confirmReset': 'Položka sa vráti medzi nenaučené; tvoje poznámky zostanú.',
  'item.synonyms': 'Tvoje synonymá: {synonyms}',
  'time.inHours': 'o {h} h',
};

const STAGES: Stage[] = [
  { n: 0, name: 'Lesson', group: 'lesson', hours: null },
  { n: 1, name: 'Apprentice I', group: 'apprentice', hours: 4 },
  ...[2, 3, 4, 5, 6, 7, 8].map((n): Stage => ({ n, name: `Stage ${n}`, group: 'guru', hours: 8 })),
  { n: 9, name: 'Burned', group: 'burned', hours: null },
];

const BIG: CatalogItem = {
  id: 'k:大',
  type: 'kanji',
  chars: '大',
  no: 7,
  lesson: 3,
  courseLesson: 3,
  order: 1,
  meanings: ['big', 'large'],
  readings: ['だい'],
  on: ['だい'],
  kun: ['おお'],
  audio: null,
  examples: ['v:大学'],
};
const STUDY: CatalogItem = { id: 'k:学', type: 'kanji', chars: '学', no: 8, lesson: 3, courseLesson: 3, order: 2, meanings: ['learning'], readings: ['がく'], on: ['がく'], kun: [], audio: null };
const WORD: CatalogItem = {
  id: 'v:大学',
  type: 'vocab',
  chars: '大学',
  lesson: 4,
  courseLesson: 1,
  order: 3,
  meanings: ['university', 'college'],
  readings: ['だいがく'],
  kanji: ['大', '学'],
  audio: null,
};

function state(stage: number, more: Partial<ItemState> = {}): ItemState {
  const tally = { correct: 0, incorrect: 0 };
  return {
    stage,
    learnedAt: Date.now() - 3600e3,
    nextReview: null,
    lastReviewAt: null,
    burnedAt: null,
    reviews: { meaning: { correct: 3, incorrect: 1 }, reading: tally },
    streak: { meaning: 0, reading: 0 },
    practice: { ...tally, last: null },
    lastWrongAt: null,
    notes: { meaning: '', reading: '' },
    synonyms: [],
    extraReadings: [],
    ...more,
  };
}

describe('ItemComponent', () => {
  let harness: RouterTestingHarness;
  let host: HTMLElement;
  let kanji: KanjiStateService;
  let api: { resetItem: ReturnType<typeof vi.fn>; item: ReturnType<typeof vi.fn>; progress: ReturnType<typeof vi.fn> };
  let warn: ReturnType<typeof vi.spyOn>;

  const clean = (s: string | null | undefined): string => (s ?? '').replace(/\s+/g, ' ').trim();
  const text = (selector: string): string => clean(host.querySelector(selector)?.textContent);
  const texts = (selector: string): string[] => Array.from(host.querySelectorAll(selector)).map((el) => clean(el.textContent));
  const stats = (): string[] => texts('dl.facts dd');

  /** The item's page at its address; `words`: strings an owner reworded, over the seeded English. */
  async function open(id: string, progress: Record<string, ItemState>, slovak = false, words: Record<string, string> = {}): Promise<void> {
    TestBed.configureTestingModule({
      providers: [
        provideZonelessChangeDetection(),
        provideAuth(),
        provideRouter([{ path: 'kanji/item/:id', component: ItemComponent }]),
        slovak ? provideTestTranslations(SLOVAK, { language: 'sk', english: ENGLISH }) : provideTestTranslations({ ...ENGLISH, ...words }),
        { provide: ApiService, useValue: api },
        { provide: AudioService, useValue: { play: vi.fn() } },
      ],
    });
    kanji = TestBed.inject(KanjiStateService);
    kanji.items.set([BIG, STUDY, WORD]);
    kanji.stages.set(STAGES);
    kanji.progress.set(progress);
    harness = await RouterTestingHarness.create(`/kanji/item/${encodeURIComponent(id)}`);
    host = harness.routeNativeElement as HTMLElement;
    await harness.fixture.whenStable();
  }

  beforeEach(() => {
    api = { resetItem: vi.fn(() => Promise.resolve({ state: state(0) })), item: vi.fn(), progress: vi.fn(() => Promise.resolve({ items: {}, settings: {}, summary: null })) };
    warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
  });
  afterEach(() => vi.restoreAllMocks());

  it('an item not learned: the app says so in its own words — stage 0’s name is never drawn', async () => {
    await open('k:大', {});
    expect(text('.itype')).toBe('Kanji · Lesson 3 · #7');
    expect([text('.imean'), host.querySelector('.imean')?.getAttribute('lang')]).toEqual(['big; large', 'en']);
    expect([text('.stagepill'), host.querySelector('.stagepill')?.getAttribute('lang')]).toEqual(['Not learned', null]);
    expect(host.querySelector('.stagepill')?.classList.contains('g-none')).toBe(true);
    expect(stats().slice(0, 3)).toEqual(['Not learned', '—', '—']);
    expect(texts('#itemActions button')).toEqual(['Learn it now']);
    expect(texts('dl.facts dt')).toEqual(['Stage', 'Learned', 'Next review', 'Meaning answers', 'Reading answers', 'Practice']);
    expect(warn, 'no key of the item page is without a string').not.toHaveBeenCalled();
  });

  it('a word whose kanji are not learned: which ones, as Japanese', async () => {
    await open('v:大学', { 'k:大': state(1) });
    expect(text('.itype')).toBe('Vocabulary · Lesson 4');
    expect(text('#itemActions p')).toBe('Learn its kanji first: 学');
    expect(Array.from(host.querySelectorAll('#itemActions p span[lang]')).map((el) => [el.textContent, el.getAttribute('lang')])).toEqual([['学', 'ja']]);
    expect(host.querySelector('#itemActions button')).toBeNull();
  });

  it('a learned item: its stage by the catalog’s own name, saying it is English; its numbers in the app’s words', async () => {
    const at = Date.now() + 4 * 3600e3;
    await open('k:大', { 'k:大': state(1, { nextReview: at, synonyms: ['huge'] }) });
    expect([text('.stagepill'), host.querySelector('.stagepill')?.getAttribute('lang')]).toEqual(['Apprentice I', 'en']);
    expect(host.querySelector('.stagepill')?.classList.contains('g-apprentice')).toBe(true);
    expect(host.querySelector('dl.facts dd')?.getAttribute('lang')).toBe('en');
    const when = new Date(at).toLocaleString('en-GB', { weekday: 'short', hour: '2-digit', minute: '2-digit' });
    expect(stats()).toEqual(['Apprentice I', stats()[1], `in 4 h (${when})`, '75% (3/4)', '—', '—']);
    expect(texts('#itemActions button')).toEqual(['Practise it now', 'Reset progress']);
    expect(text('.syn')).toBe('Your synonyms: huge');
  });

  it('…and in Slovak: the words change, the stage name and the material do not', async () => {
    const at = Date.now() + 4 * 3600e3;
    await open('v:大学', { 'k:大': state(1), 'k:学': state(1), 'v:大学': state(1, { nextReview: at, synonyms: ['uni'] }) }, true);
    expect(text('.itype')).toBe('Slovíčka · Lekcia 4');
    expect(text('.stagepill')).toBe('Apprentice I');
    expect(text('.imean')).toBe('university; college');
    const when = new Date(at).toLocaleString('sk-SK', { weekday: 'short', hour: '2-digit', minute: '2-digit' });
    expect(stats().slice(2, 4)).toEqual([`o 4 h (${when})`, '75 % (3/4)']);
    expect(text('.syn')).toBe('Tvoje synonymá: uni');

    await TestBed.inject(TranslationService).setLanguage('en', { remember: false });
    await harness.fixture.whenStable();
    expect(text('.itype')).toBe('Vocabulary · Lesson 4');
    expect(stats()[3]).toBe('75% (3/4)');
  });

  it('the last stage: no more reviews, the stage’s own name before the app’s words', async () => {
    await open('k:大', { 'k:大': state(9) }, true);
    expect(stats()[2]).toBe('Burned – žiadne ďalšie opakovania');
    const dd = host.querySelectorAll('dl.facts dd')[2];
    expect(Array.from(dd.querySelectorAll('span[lang]')).map((el) => [el.textContent, el.getAttribute('lang')])).toEqual([['Burned', 'en']]);

    await TestBed.inject(TranslationService).setLanguage('en', { remember: false });
    await harness.fixture.whenStable();
    expect(stats()[2]).toBe('Burned — no more reviews');
  });

  it('asks before a reset with the kit’s question, worded when it is raised — never the browser’s own box', async () => {
    const box = vi.spyOn(window, 'confirm');
    await open('k:大', { 'k:大': state(1) }, true);
    const question = TestBed.inject(ConfirmService);
    const reset = (): void => (host.querySelectorAll('#itemActions button')[1] as HTMLButtonElement).click();
    reset();
    expect(question.pending()).toMatchObject({
      title: 'Vynulovať „大“?',
      message: 'Položka sa vráti medzi nenaučené; tvoje poznámky zostanú.',
      confirmLabel: 'Vynulovať pokrok',
      tone: 'danger',
    });
    question.settle(false);
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(api.resetItem, 'refused: nothing is reset').not.toHaveBeenCalled();

    await TestBed.inject(TranslationService).setLanguage('en', { remember: false });
    reset();
    expect(question.pending()).toMatchObject({ title: 'Reset 大?', message: 'It goes back to "not learned"; your notes stay.', confirmLabel: 'Reset progress' });
    question.settle(false);
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(api.resetItem).not.toHaveBeenCalled();
    expect(box).not.toHaveBeenCalled();
  });

  it('resets when the learner agrees', async () => {
    await open('k:大', { 'k:大': state(1) });
    (host.querySelectorAll('#itemActions button')[1] as HTMLButtonElement).click();
    TestBed.inject(ConfirmService).settle(true);
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(api.resetItem).toHaveBeenCalledWith('k:大');
  });

  it('a sentence an owner reworded before the question had a title, which still names the item ({chars}), names it: never "{chars}" on the page', async () => {
    // Migration 011 leaves a string somebody saved as it was: the browser's question of before named the item in it.
    await open('k:大', { 'k:大': state(1) }, false, { 'item.confirmReset': 'Reset {chars}? It goes back to "not learned".' });
    const question = TestBed.inject(ConfirmService);
    (host.querySelectorAll('#itemActions button')[1] as HTMLButtonElement).click();
    expect(question.pending()?.message).toBe('Reset 大? It goes back to "not learned".');
    question.settle(false);
  });

  it('says so when the address names no item', async () => {
    await open('k:無', {});
    expect(text('h1')).toBe('Not found');
    expect(text('p')).toBe('No such item.');
  });

  it('each answer the learner added: its words outside any button (they wrap), then the kit’s button that takes it away, named by Remove and the answer; the reading saying it is Japanese', async () => {
    api.item.mockResolvedValueOnce({ state: state(1, { synonyms: [], extraReadings: ['おおい'] }) });
    api.item.mockResolvedValueOnce({ state: state(1, { synonyms: [], extraReadings: [] }) });
    await open('k:大', { 'k:大': state(1, { synonyms: ['huge'], extraReadings: ['おおい'] }) });
    const rows = (): HTMLLIElement[] => Array.from(host.querySelectorAll<HTMLLIElement>('#accepted li'));
    const answers = (): string[] => rows().map((row) => clean(row.querySelector('.answer')?.textContent));
    const removes = (): HTMLButtonElement[] => rows().map((row) => row.querySelector('button') as HTMLButtonElement);
    expect(answers()).toEqual(['huge', 'おおい']);
    expect(removes().map((button) => [button.getAttribute('aria-label'), button.title])).toEqual([
      ['Remove: huge', 'Remove: huge'],
      ['Remove: おおい', 'Remove: おおい'],
    ]);
    expect(
      removes().every((button) => button.matches('.anotoki-button--icon.anotoki-button--ghost') && clean(button.textContent) === '' && !!button.querySelector('anotoki-icon')),
      'the kit’s icon button, the answer’s words beside it - a kit button keeps its words on one line, and a synonym may be 80 characters',
    ).toBe(true);
    expect(rows()[1].querySelector('.answer')?.getAttribute('lang')).toBe('ja');
    expect(removes()[1].hasAttribute('lang'), 'Remove is the page’s language').toBe(false);
    expect(texts('anotoki-card .anotoki-card__title')).toEqual(['Progress', 'Your accepted answers']);

    removes()[0].click();
    await harness.fixture.whenStable();
    expect(api.item).toHaveBeenCalledWith('k:大', { removeSynonym: 'huge' });
    expect(answers()).toEqual(['おおい']);

    removes()[0].click();
    await harness.fixture.whenStable();
    expect(api.item).toHaveBeenCalledWith('k:大', { removeReading: 'おおい' });
    expect(host.querySelector('#accepted'), 'none left: no list').toBeNull();
    expect(texts('anotoki-card p.muted')).toContain('None yet.');
  });
});
