import { provideZonelessChangeDetection } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { TranslationService } from '@anotoki/lib/translations';
import { provideTestTranslations } from '@anotoki/lib/translations/testing';
import { ApiService } from '../../core/api/api.service';
import { CatalogItem, ItemState, Stage, StageGroup } from '../../core/api/api.types';
import { KanjiStateService } from '../kanji-state.service';
import { BrowseComponent } from './browse.component';

const ENGLISH: Record<string, string> = {
  'kanji.tab.browse': 'Browse',
  'kanji.type.kanji': 'Kanji',
  'kanji.type.vocab': 'Vocabulary',
  'kanji.tileNotLearned': 'not learned',
  'browse.search': 'Search: kanji, reading (romaji or kana), or meaning',
  'browse.allTypes': 'All',
  'browse.anyLesson': 'Any lesson',
  'browse.anyStage': 'Any stage',
  'browse.count.one': '1 item',
  'browse.count.few': '{count} items',
  'browse.count.other': '{count} items',
  'item.notLearned': 'Not learned',
};
const SLOVAK: Record<string, string> = {
  'kanji.tab.browse': 'Prehliadať',
  'kanji.type.kanji': 'Kanji',
  'kanji.type.vocab': 'Slovíčka',
  'kanji.tileNotLearned': 'nenaučené',
  'browse.search': 'Hľadať: kanji, čítanie (romaji alebo kana) alebo význam',
  'browse.allTypes': 'Všetko',
  'browse.anyLesson': 'Ktorákoľvek lekcia',
  'browse.anyStage': 'Ktorákoľvek úroveň',
  'browse.count.one': '1 položka',
  'browse.count.few': '{count} položky',
  'browse.count.other': '{count} položiek',
  'item.notLearned': 'Nenaučené',
};

const STAGES: Stage[] = [
  { n: 0, name: 'Lesson', group: 'lesson', hours: null },
  { n: 1, name: 'Apprentice I', group: 'apprentice', hours: 4 },
];
const GROUPS: StageGroup[] = [
  { id: 'apprentice', name: 'Apprentice', stages: [1, 2, 3, 4] },
  { id: 'guru', name: 'Guru', stages: [5, 6] },
];

const ITEMS: CatalogItem[] = [
  { id: 'k:一', type: 'kanji', chars: '一', no: 1, lesson: 3, courseLesson: 3, order: 1, meanings: ['one'], readings: ['いち'], audio: null },
  { id: 'k:二', type: 'kanji', chars: '二', no: 2, lesson: 3, courseLesson: 3, order: 2, meanings: ['two'], readings: ['に'], audio: null },
  { id: 'k:三', type: 'kanji', chars: '三', no: 3, lesson: 4, courseLesson: 4, order: 3, meanings: ['three'], readings: ['さん'], audio: null },
  { id: 'v:一つ', type: 'vocab', chars: '一つ', lesson: 4, courseLesson: 4, order: 4, meanings: ['one thing'], readings: ['ひとつ'], kanji: ['一'], audio: null },
];

describe('BrowseComponent', () => {
  let fixture: ComponentFixture<BrowseComponent>;
  let host: HTMLElement;
  let warn: ReturnType<typeof vi.spyOn>;

  const clean = (s: string | null | undefined): string => (s ?? '').replace(/\s+/g, ' ').trim();
  const count = (): string => clean(host.querySelector('p.small.muted')?.textContent);
  const chips = (row: number): HTMLButtonElement[] => Array.from(host.querySelectorAll('.bfilters .chips')[row].querySelectorAll<HTMLButtonElement>('.chip'));
  const search = (): HTMLInputElement => host.querySelector('input') as HTMLInputElement;

  async function find(query: string): Promise<void> {
    search().value = query;
    search().dispatchEvent(new Event('input'));
    await fixture.whenStable();
  }

  async function open(slovak = false): Promise<void> {
    TestBed.configureTestingModule({
      providers: [
        provideZonelessChangeDetection(),
        provideRouter([]),
        slovak ? provideTestTranslations(SLOVAK, { language: 'sk', english: ENGLISH }) : provideTestTranslations(ENGLISH),
        { provide: ApiService, useValue: {} },
      ],
    });
    const kanji = TestBed.inject(KanjiStateService);
    kanji.items.set(ITEMS);
    kanji.lessons.set([3, 4]);
    kanji.stages.set(STAGES);
    kanji.groups.set(GROUPS);
    kanji.progress.set({ 'k:一': { stage: 1 } as ItemState });
    fixture = TestBed.createComponent(BrowseComponent);
    host = fixture.nativeElement;
    await fixture.whenStable();
  }

  beforeEach(() => {
    warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
  });
  afterEach(() => vi.restoreAllMocks());

  it('counts what it shows, the noun with the number', async () => {
    await open();
    expect(count()).toBe('4 items');
    await find('ichi');
    expect(count()).toBe('1 item');
    // what the browser suite reads: the characters of the tiles found
    expect(Array.from(host.querySelectorAll('.bgrid .tc')).map((el) => el.textContent)).toEqual(['一']);
    await find('zzz');
    expect(count()).toBe('0 items');
    expect(search().placeholder).toBe('Search: kanji, reading (romaji or kana), or meaning');
    expect(warn, 'no key of the screen is without a string').not.toHaveBeenCalled();
  });

  it('…in Slovak in its three forms', async () => {
    await open(true);
    expect(count()).toBe('4 položky');
    await find('ichi');
    expect(count()).toBe('1 položka');
    await find('zzz');
    expect(count()).toBe('0 položiek');
    expect(clean(host.querySelector('h1')?.textContent)).toBe('Prehliadať');
  });

  it('names its filters in the app’s words, and the stage groups by the catalog’s own names, which say they are English', async () => {
    await open(true);
    expect(chips(0).map((chip) => clean(chip.textContent))).toEqual(['Všetko', 'Kanji', 'Slovíčka']);
    expect(chips(1).map((chip) => clean(chip.textContent))).toEqual(['Ktorákoľvek lekcia', 'L3', 'L4']);
    expect(chips(2).map((chip) => [clean(chip.textContent), chip.getAttribute('lang')])).toEqual([
      ['Ktorákoľvek úroveň', null],
      ['Nenaučené', null],
      ['Apprentice', 'en'],
      ['Guru', 'en'],
    ]);

    await TestBed.inject(TranslationService).setLanguage('en', { remember: false });
    await fixture.whenStable();
    expect(chips(2).map((chip) => clean(chip.textContent))).toEqual(['Any stage', 'Not learned', 'Apprentice', 'Guru']);
  });

  it('filters by what is learned and by stage group', async () => {
    await open();
    chips(2)[1].click(); // not learned
    await fixture.whenStable();
    expect(count()).toBe('3 items');
    chips(2)[2].click(); // Apprentice
    await fixture.whenStable();
    expect(count()).toBe('1 item');
    expect(chips(2)[2].classList.contains('is-on')).toBe(true);
  });

  it('shows each item’s meaning under its characters, the one Japanese and the other English', async () => {
    await open(true);
    const first = host.querySelector('.bgrid a') as HTMLElement;
    expect(first.hasAttribute('lang')).toBe(false);
    expect([first.querySelector('.tc')?.getAttribute('lang'), first.querySelector('.tm')?.getAttribute('lang')]).toEqual(['ja', 'en']);
  });
});
