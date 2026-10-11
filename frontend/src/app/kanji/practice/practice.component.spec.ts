import { provideZonelessChangeDetection } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { TranslationService } from '@anotoki/lib/translations';
import { provideTestTranslations } from '@anotoki/lib/translations/testing';
import { ApiService } from '../../core/api/api.service';
import { CatalogItem, ItemState, StageGroup } from '../../core/api/api.types';
import { KanjiScreenService } from '../kanji-screen.service';
import { KanjiStateService } from '../kanji-state.service';
import { PracticeComponent } from './practice.component';

const ENGLISH: Record<string, string> = {
  'kanji.tab.practice': 'Practice',
  'kanji.tab.lessons': 'Lessons',
  'kanji.type.both': 'Kanji & vocabulary',
  'kanji.type.kanji': 'Kanji',
  'kanji.type.vocab': 'Vocabulary',
  'practice.intro': 'Drill what you have learned — any time, as many rounds as you like.',
  'practice.nothingLearned': 'Nothing learned yet.',
  'practice.goToLessons': 'Go to lessons',
  'practice.what': 'What',
  'practice.type': 'Type',
  'practice.askLabel': 'Ask',
  'practice.howMany': 'How many',
  'practice.scope.all': 'Everything learned',
  'practice.scope.weakest': 'Weakest',
  'practice.scope.mistakes': 'Recent mistakes',
  'practice.scope.recent': 'Learned in the last 24 h',
  'practice.scope.guruUp': '{stage} and above',
  'practice.allLessons': 'All lessons',
  'practice.ask.both': 'Meaning + reading',
  'practice.ask.meaning': 'Meaning only',
  'practice.ask.reading': 'Reading only',
  'practice.all': 'All',
  'practice.info': '{matches}; this session will ask {take}.',
  'practice.matches.one': '1 item matches',
  'practice.matches.few': '{count} items match',
  'practice.matches.other': '{count} items match',
  'practice.noMatch': 'Nothing matches — widen the choices above.',
  'practice.start': 'Practise {n}',
  'practice.nothing': 'Nothing to practise',
};

const SLOVAK: Record<string, string> = {
  ...ENGLISH,
  'kanji.tab.practice': 'Precvičovanie',
  'practice.scope.all': 'Všetko naučené',
  'practice.scope.guruUp': '{stage} a vyššie',
  'practice.all': 'Všetky',
  'practice.info': '{matches}; toto kolo sa opýta na {take} z nich.',
  'practice.matches.one': 'Vyhovuje 1 položka',
  'practice.matches.few': 'Vyhovujú {count} položky',
  'practice.matches.other': 'Vyhovuje {count} položiek',
  'practice.noMatch': 'Nič nevyhovuje – rozšír výber vyššie.',
  'practice.start': 'Precvičiť {n}',
  'practice.nothing': 'Niet čo precvičovať',
};

/** The stage groups as the catalog names them: the screen has no copy of these names. */
const GROUPS: StageGroup[] = [
  { id: 'apprentice', name: 'Apprentice', stages: [1, 2, 3, 4] },
  { id: 'guru', name: 'Guru', stages: [5, 6] },
  { id: 'master', name: 'Master', stages: [7] },
  { id: 'enlightened', name: 'Enlightened', stages: [8] },
  { id: 'burned', name: 'Burned', stages: [9] },
];

function item(i: number): CatalogItem {
  return { id: `k:${i}`, type: 'kanji', chars: String(i), no: i, lesson: 3, courseLesson: 3, order: i, meanings: [`meaning ${i}`], readings: ['いち'], audio: null };
}

function state(stage: number): ItemState {
  const tally = { correct: 0, incorrect: 0 };
  return {
    stage,
    learnedAt: Date.now() - 72 * 3600e3,
    nextReview: null,
    lastReviewAt: null,
    burnedAt: null,
    reviews: { meaning: tally, reading: tally },
    streak: { meaning: 0, reading: 0 },
    practice: { ...tally, last: null },
    lastWrongAt: null,
    notes: { meaning: '', reading: '' },
    synonyms: [],
    extraReadings: [],
  };
}

describe('PracticeComponent', () => {
  let fixture: ComponentFixture<PracticeComponent>;
  let host: HTMLElement;
  let kanji: KanjiStateService;
  let warn: ReturnType<typeof vi.spyOn>;

  const clean = (s: string | null | undefined): string => (s ?? '').replace(/\s+/g, ' ').trim();
  const info = (): string => clean(host.querySelector('#practiceInfo')?.textContent);
  /** A choice's buttons: the kit's buttons of a row, or the segments of the kit's segmented choice (How many). */
  const chips = (field: number): HTMLButtonElement[] => Array.from(host.querySelectorAll('.choice')[field].querySelectorAll<HTMLButtonElement>('button'));
  const startButton = (): HTMLButtonElement => host.querySelector('#startPractice') as HTMLButtonElement;

  /** `learned`: the stage of each learned item, by its number. */
  async function open(learned: Record<number, number>, options: { slovak?: boolean; total?: number; groups?: StageGroup[] } = {}): Promise<void> {
    TestBed.configureTestingModule({
      providers: [
        provideZonelessChangeDetection(),
        provideRouter([]),
        options.slovak ? provideTestTranslations(SLOVAK, { language: 'sk', english: ENGLISH }) : provideTestTranslations(ENGLISH),
        { provide: ApiService, useValue: {} },
      ],
    });
    kanji = TestBed.inject(KanjiStateService);
    kanji.items.set(Array.from({ length: options.total ?? 8 }, (_, i) => item(i)));
    kanji.groups.set(options.groups ?? GROUPS);
    kanji.progress.set(Object.fromEntries(Object.entries(learned).map(([i, stage]) => [`k:${i}`, state(stage)])));
    fixture = TestBed.createComponent(PracticeComponent);
    host = fixture.nativeElement;
    await fixture.whenStable();
  }

  beforeEach(() => {
    warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
  });
  afterEach(() => vi.restoreAllMocks());

  it('says how many items match and how many it will ask: the verb agrees with the count', async () => {
    await open({ 0: 1, 1: 1, 2: 5 });
    expect(info()).toBe('3 items match; this session will ask 3.');
    expect(clean(startButton().textContent)).toBe('Practise 3');

    chips(0)[5].click(); // Guru and above: one item
    await fixture.whenStable();
    expect(info()).toBe('1 item matches; this session will ask 1.');

    chips(2)[2].click(); // vocabulary only: none of these is a word
    await fixture.whenStable();
    expect(info()).toBe('Nothing matches — widen the choices above.');
    expect(clean(startButton().textContent)).toBe('Nothing to practise');
    expect(startButton().disabled).toBe(true);
    expect(warn, 'no key of the screen is without a string').not.toHaveBeenCalled();
  });

  it('asks no more than was chosen, and says so', async () => {
    await open(Object.fromEntries(Array.from({ length: 30 }, (_, i) => [i, 1])), { total: 30 });
    expect(info()).toBe('30 items match; this session will ask 20.');
    expect(clean(startButton().textContent)).toBe('Practise 20');
    chips(4)[4].click(); // All
    await fixture.whenStable();
    expect(info()).toBe('30 items match; this session will ask 30.');
  });

  it('says it in Slovak in three forms, the verb with the noun', async () => {
    await open({ 0: 1 }, { slovak: true });
    expect(info()).toBe('Vyhovuje 1 položka; toto kolo sa opýta na 1 z nich.');
    expect(clean(startButton().textContent)).toBe('Precvičiť 1');

    kanji.progress.set({ 'k:0': state(1), 'k:1': state(1), 'k:2': state(1) });
    await fixture.whenStable();
    expect(info()).toBe('Vyhovujú 3 položky; toto kolo sa opýta na 3 z nich.');

    kanji.progress.set(Object.fromEntries([0, 1, 2, 3, 4, 5].map((i) => [`k:${i}`, state(1)])));
    await fixture.whenStable();
    expect(info()).toBe('Vyhovuje 6 položiek; toto kolo sa opýta na 6 z nich.');

    chips(2)[2].click(); // vocabulary only: none of these is a word
    await fixture.whenStable();
    expect(info()).toBe('Nič nevyhovuje – rozšír výber vyššie.');
    expect(clean(startButton().textContent)).toBe('Niet čo precvičovať');
  });

  it('names its scopes in the app’s words, and the three stage scopes by the catalog’s own names, which say they are English', async () => {
    await open({ 0: 1, 1: 1, 2: 5, 3: 9 });
    expect(chips(0).map((chip) => clean(chip.textContent))).toEqual([
      'Everything learned (4)',
      'Weakest (0)',
      'Recent mistakes (0)',
      'Learned in the last 24 h (0)',
      'Apprentice (2)',
      'Guru and above (1)',
      'Burned (1)',
    ]);
    const marked = (chip: HTMLElement): (string | null)[][] => Array.from(chip.querySelectorAll('span[lang]')).map((span) => [span.textContent, span.getAttribute('lang')]);
    expect(marked(chips(0)[0])).toEqual([]);
    expect(marked(chips(0)[4])).toEqual([['Apprentice', 'en']]);
    expect(marked(chips(0)[5])).toEqual([['Guru', 'en']]);
    expect(marked(chips(0)[6])).toEqual([['Burned', 'en']]);
  });

  it('keeps the stage names as they are in Slovak, inside the app’s own phrase', async () => {
    await open({ 0: 1, 2: 5 }, { slovak: true });
    expect(chips(0).map((chip) => clean(chip.textContent))).toEqual([
      'Všetko naučené (2)',
      'Weakest (0)',
      'Recent mistakes (0)',
      'Learned in the last 24 h (0)',
      'Apprentice (1)',
      'Guru a vyššie (1)',
      'Burned (0)',
    ]);
    expect(chips(0)[5].querySelector('span[lang="en"]')?.textContent).toBe('Guru');

    await TestBed.inject(TranslationService).setLanguage('en', { remember: false });
    await fixture.whenStable();
    expect(clean(chips(0)[5].textContent)).toBe('Guru and above (1)');
    expect(clean(host.querySelector('h1')?.textContent)).toBe('Practice');
  });

  it('has no copy of the stage names: whatever the catalog calls them is what it says', async () => {
    const renamed = GROUPS.map((g) => ({ ...g, name: `${g.name}*` }));
    await open({ 0: 1 }, { groups: renamed });
    expect(chips(0).slice(4).map((chip) => clean(chip.textContent))).toEqual(['Apprentice* (1)', 'Guru* and above (0)', 'Burned* (0)']);
  });

  it('words its other choices from keys', async () => {
    await open({ 0: 1 });
    expect(Array.from(host.querySelectorAll('.choice-label')).map((el) => clean(el.textContent))).toEqual(['What', 'Lessons', 'Type', 'Ask', 'How many']);
    expect(chips(1).map((chip) => clean(chip.textContent))).toEqual(['All lessons', 'L3']);
    expect(chips(2).map((chip) => clean(chip.textContent))).toEqual(['Kanji & vocabulary', 'Kanji', 'Vocabulary']);
    expect(chips(3).map((chip) => clean(chip.textContent))).toEqual(['Meaning + reading', 'Meaning only', 'Reading only']);
    expect(chips(4).map((chip) => clean(chip.textContent))).toEqual(['10', '20', '50', '100', 'All']);
  });

  it('says what is chosen as the kit does: the rows pressed (the chosen ones primary), how many checked; a scope with nothing in it is off unless chosen', async () => {
    await open({ 0: 1, 1: 1 });
    const pressed = (field: number): string[] => chips(field).filter((chip) => chip.getAttribute('aria-pressed') === 'true').map((chip) => clean(chip.textContent));
    expect([pressed(0), pressed(1), pressed(2), pressed(3)]).toEqual([['Everything learned (2)'], ['All lessons'], ['Kanji & vocabulary'], ['Meaning + reading']]);
    expect(chips(0)[0].classList.contains('anotoki-button--primary')).toBe(true);
    expect(chips(0)[1].classList.contains('anotoki-button--secondary')).toBe(true);
    expect(chips(4).map((chip) => chip.getAttribute('aria-checked'))).toEqual(['false', 'true', 'false', 'false', 'false']);
    expect(chips(0)[1].disabled, 'Weakest: nothing missed yet').toBe(true);
    expect(host.querySelectorAll('[role="group"][aria-labelledby]').length, 'every row of buttons named by the words over it').toBe(4);

    chips(1)[1].click(); // L3 alone
    chips(3)[2].click(); // the reading only
    chips(4)[0].click(); // 10
    await fixture.whenStable();
    expect([pressed(1), pressed(3)]).toEqual([['L3'], ['Reading only']]);
    expect(chips(4).map((chip) => chip.getAttribute('aria-checked'))).toEqual(['true', 'false', 'false', 'false', 'false']);
    chips(1)[0].click(); // all lessons again
    await fixture.whenStable();
    expect(pressed(1)).toEqual(['All lessons']);
  });

  it('says so when nothing is learned yet', async () => {
    await open({});
    expect(clean(host.querySelector('anotoki-empty-state .anotoki-empty-state__heading')?.textContent)).toBe('Nothing learned yet.');
    expect(clean(host.querySelector('anotoki-empty-state a')?.textContent)).toBe('Go to lessons');
    expect(host.querySelector('.choice'), 'nothing to choose from').toBeNull();
  });

  it('starts a session with what was chosen', async () => {
    await open({ 0: 1, 1: 1 });
    const practise = vi.spyOn(TestBed.inject(KanjiScreenService), 'practice').mockImplementation(() => undefined);
    startButton().click();
    expect(practise).toHaveBeenCalledTimes(1);
    const [items, parts] = practise.mock.calls[0];
    expect(items.map((it) => it.id).sort()).toEqual(['k:0', 'k:1']);
    expect(parts).toBe('both');
  });
});
