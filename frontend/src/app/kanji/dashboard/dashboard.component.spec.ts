import { provideZonelessChangeDetection } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { ApiService } from '../../core/api/api.service';
import { CatalogItem, ItemState, StageGroup, Summary } from '../../core/api/api.types';
import { TranslationService } from '../../core/i18n/translation.service';
import { provideTestTranslations } from '../../core/testing/test-translations';
import { KanjiStateService } from '../kanji-state.service';
import { DashboardComponent } from './dashboard.component';

const ENGLISH: Record<string, string> = {
  'kanji.tab.lessons': 'Lessons',
  'kanji.tab.reviews': 'Reviews',
  'kanji.tab.practice': 'Practice',
  'kanji.nothingToLearn': 'Nothing to learn',
  'kanji.tileNotLearned': 'not learned',
  'dashboard.allLearned': 'Everything available has been learned.',
  'dashboard.learn.one': 'Learn 1 item',
  'dashboard.learn.few': 'Learn {count} items',
  'dashboard.learn.other': 'Learn {count} items',
  'dashboard.chooseLessons': 'Choose lessons…',
  'dashboard.reviewsDue': 'Due now. These are what move items up the SRS stages.',
  'dashboard.nextReview': 'Next review {when} ({clock}).',
  'dashboard.noReviews': 'Learn some lessons and their reviews will appear here.',
  'dashboard.startReviews': 'Start reviews',
  'dashboard.practiceReady': 'Drill anything you have learned, as often as you like. It never changes the SRS schedule.',
  'dashboard.practiceEmpty': 'Once you have learned something you can drill it here any time.',
  'dashboard.learnedToday': '{n} learned today',
  'dashboard.reviewsToday': '{n} reviews',
  'dashboard.practisedToday': '{n} practised',
  'dashboard.right': '({pct}% right)',
  'dashboard.learnedOfTotal': '{learned} of {total} items learned',
  'dashboard.stages': 'SRS stages',
  'dashboard.groupCounts': '{kanji} kanji · {vocab} vocab',
  'dashboard.upcoming': 'Upcoming reviews',
  'dashboard.reviewsAround.one': '1 review around {clock}',
  'dashboard.reviewsAround.few': '{count} reviews around {clock}',
  'dashboard.reviewsAround.other': '{count} reviews around {clock}',
  'dashboard.nothingAhead': 'Nothing scheduled in the next 24 hours.',
  'dashboard.today': 'Today',
  'dashboard.tomorrow': 'Tomorrow',
  'dashboard.byLesson': 'Progress by lesson',
  'dashboard.vocabTitle': 'vocabulary learned / total',
  'dashboard.vocab': 'vocab',
  'dashboard.saved': 'Your progress is saved in the database, with a daily copy in backups/.',
  'dashboard.download': 'Download a copy',
  'time.now': 'now',
  'time.inMinutes': 'in {m} min',
  'time.inHours': 'in {h} h',
  'time.inHoursMinutes': 'in {h} h {m} min',
};

const SLOVAK: Record<string, string> = {
  ...ENGLISH,
  'kanji.tab.lessons': 'Lekcie',
  'dashboard.learn.one': 'Naučiť sa 1 položku',
  'dashboard.learn.few': 'Naučiť sa {count} položky',
  'dashboard.learn.other': 'Naučiť sa {count} položiek',
  'dashboard.nextReview': 'Ďalšie opakovanie príde {when} ({clock}).',
  'dashboard.learnedToday': 'Dnes naučené: {n}',
  'dashboard.reviewsToday': 'Opakovania: {n}',
  'dashboard.practisedToday': 'Precvičené: {n}',
  'dashboard.right': '({pct} % správne)',
  'dashboard.learnedOfTotal': 'Naučené položky: {learned} / {total}',
  'dashboard.groupCounts': 'kanji: {kanji} · slovíčka: {vocab}',
  'dashboard.reviewsAround.one': '1 opakovanie okolo {clock}',
  'dashboard.reviewsAround.few': '{count} opakovania okolo {clock}',
  'dashboard.reviewsAround.other': '{count} opakovaní okolo {clock}',
  'dashboard.today': 'Dnes',
  'dashboard.tomorrow': 'Zajtra',
  'time.inHours': 'o {h} h',
};

const GROUPS: StageGroup[] = [
  { id: 'apprentice', name: 'Apprentice', stages: [1, 2, 3, 4] },
  { id: 'guru', name: 'Guru', stages: [5, 6] },
];

function item(i: number): CatalogItem {
  return { id: `k:${i}`, type: 'kanji', chars: ['一', '二', '三', '四', '五', '六', '七'][i], no: i + 1, lesson: 3, courseLesson: 3, order: i, meanings: [`meaning ${i}`], readings: ['いち'], audio: null };
}
const ITEMS = [0, 1, 2, 3, 4, 5, 6].map(item);

/** Noon today: the hours of the forecast are whole, whenever the spec runs. */
const NOW = new Date().setHours(12, 0, 0, 0);

function summary(more: Partial<Summary> = {}): Summary {
  const forecastHours = Array.from({ length: 24 }, () => 0);
  forecastHours[1] = 1;
  forecastHours[2] = 3;
  forecastHours[3] = 5;
  return {
    now: NOW,
    total: 7,
    learned: 2,
    lessonsAvailable: 5,
    reviewsDue: 0,
    nextReviewAt: null,
    groups: { apprentice: { name: 'Apprentice', total: 2, kanji: 2, vocab: 0 }, guru: { name: 'Guru', total: 0, kanji: 0, vocab: 0 } },
    forecastHours,
    forecastDays: [9, 4, 0, 0, 0, 0, 1],
    byLesson: { 3: { kanji: { total: 7, learned: 2, guru: 0 }, vocab: { total: 12, learned: 3, guru: 0 } } },
    today: { lessons: 2, reviews: 4, reviewsCorrect: 3, practice: 0, practiceCorrect: 0 },
    history: [],
    ...more,
  };
}

describe('DashboardComponent', () => {
  let fixture: ComponentFixture<DashboardComponent>;
  let host: HTMLElement;
  let kanji: KanjiStateService;
  let warn: ReturnType<typeof vi.spyOn>;

  const clean = (s: string | null | undefined): string => (s ?? '').replace(/\s+/g, ' ').trim();
  const text = (selector: string): string => clean(host.querySelector(selector)?.textContent);
  const texts = (selector: string): string[] => Array.from(host.querySelectorAll(selector)).map((el) => clean(el.textContent));
  const learnButton = (): HTMLButtonElement => host.querySelector('.c-lessons button') as HTMLButtonElement;

  async function open(s: Summary, options: { slovak?: boolean; learned?: number } = {}): Promise<void> {
    TestBed.configureTestingModule({
      providers: [
        provideZonelessChangeDetection(),
        provideRouter([]),
        options.slovak ? provideTestTranslations(SLOVAK, { language: 'sk', english: ENGLISH }) : provideTestTranslations(ENGLISH),
        { provide: ApiService, useValue: {} },
      ],
    });
    kanji = TestBed.inject(KanjiStateService);
    kanji.items.set(ITEMS);
    kanji.lessons.set([3]);
    kanji.groups.set(GROUPS);
    learn(options.learned ?? 2);
    kanji.summary.set(s);
    fixture = TestBed.createComponent(DashboardComponent);
    host = fixture.nativeElement;
    await fixture.whenStable();
  }

  /** The first n items learned. */
  function learn(n: number): void {
    kanji.progress.set(Object.fromEntries(ITEMS.slice(0, n).map((it) => [it.id, { stage: 1 } as ItemState])));
  }

  beforeEach(() => {
    warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
  });
  afterEach(() => vi.restoreAllMocks());

  it('names the next batch by its number: the button the browser suite presses', async () => {
    await open(summary());
    expect(clean(learnButton().textContent)).toBe('Learn 5 items');
    expect(clean(learnButton().textContent)).toMatch(/^Learn \d+ items?$/);

    learn(6);
    await fixture.whenStable();
    expect(clean(learnButton().textContent)).toBe('Learn 1 item');
    expect(clean(learnButton().textContent)).toMatch(/^Learn \d+ items?$/);

    learn(7);
    await fixture.whenStable();
    expect(clean(learnButton().textContent)).toBe('Nothing to learn');
    expect(learnButton().disabled).toBe(true);
    expect(text('.c-lessons .bc-body')).toBe('Everything available has been learned.');
    expect(warn, 'no key of the dashboard is without a string').not.toHaveBeenCalled();
  });

  it('…in Slovak in its three forms', async () => {
    await open(summary(), { slovak: true });
    expect(clean(learnButton().textContent)).toBe('Naučiť sa 5 položiek');
    learn(4);
    await fixture.whenStable();
    expect(clean(learnButton().textContent)).toBe('Naučiť sa 3 položky');
    learn(6);
    await fixture.whenStable();
    expect(clean(learnButton().textContent)).toBe('Naučiť sa 1 položku');
    expect(text('.c-lessons .bc-title')).toBe('Lekcie');
  });

  it('says what the reviews are waiting for', async () => {
    await open(summary({ reviewsDue: 5 }));
    expect(text('.c-reviews .bc-num')).toBe('5');
    expect(text('.c-reviews .bc-body')).toBe('Due now. These are what move items up the SRS stages.');
    expect(text('.c-reviews button')).toBe('Start reviews');

    const at = Date.now() + 4 * 3600e3;
    const clock = new Date(at).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
    kanji.summary.set(summary({ nextReviewAt: at }));
    await fixture.whenStable();
    expect(text('.c-reviews .bc-body')).toBe(`Next review in 4 h (${clock}).`);

    kanji.summary.set(summary({ learned: 0 }));
    await fixture.whenStable();
    expect(text('.c-reviews .bc-body')).toBe('Learn some lessons and their reviews will appear here.');
    expect(text('.c-practice .bc-body')).toBe('Once you have learned something you can drill it here any time.');
  });

  it('draws today’s numbers in bold inside their sentences, wherever the language puts them', async () => {
    await open(summary());
    expect(texts('.today span')).toEqual(['2 learned today', '4 reviews (75% right)', '0 practised', '2 of 7 items learned']);
    expect(texts('.today b')).toEqual(['2', '4', '0']);

    TestBed.resetTestingModule();
    await open(summary(), { slovak: true });
    expect(texts('.today span')).toEqual(['Dnes naučené: 2', 'Opakovania: 4 (75 % správne)', 'Precvičené: 0', 'Naučené položky: 2 / 7']);
    expect(texts('.today b')).toEqual(['2', '4', '0']);
  });

  it('names the stage groups as the catalog does, saying they are English, and counts in the app’s words', async () => {
    await open(summary(), { slovak: true });
    expect(Array.from(host.querySelectorAll('.gn')).map((el) => [el.textContent, el.getAttribute('lang')])).toEqual([
      ['Apprentice', 'en'],
      ['Guru', 'en'],
    ]);
    expect(texts('.gs')).toEqual(['kanji: 2 · slovíčka: 0', 'kanji: 0 · slovíčka: 0']);

    await TestBed.inject(TranslationService).setLanguage('en', false);
    await fixture.whenStable();
    expect(texts('.gs')).toEqual(['2 kanji · 0 vocab', '0 kanji · 0 vocab']);
  });

  it('says how many reviews an hour holds, the noun with the number', async () => {
    const hour = (h: number): string => new Date(NOW + h * 3600e3).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
    await open(summary());
    const titles = (): (string | null)[] => Array.from(host.querySelectorAll('.fb')).map((el) => el.getAttribute('title'));
    expect(titles().slice(0, 4)).toEqual([`0 reviews around ${hour(0)}`, `1 review around ${hour(1)}`, `3 reviews around ${hour(2)}`, `5 reviews around ${hour(3)}`]);

    TestBed.resetTestingModule();
    await open(summary(), { slovak: true });
    const sk = (h: number): string => new Date(NOW + h * 3600e3).toLocaleTimeString('sk-SK', { hour: '2-digit', minute: '2-digit' });
    expect(titles().slice(0, 4)).toEqual([`0 opakovaní okolo ${sk(0)}`, `1 opakovanie okolo ${sk(1)}`, `3 opakovania okolo ${sk(2)}`, `5 opakovaní okolo ${sk(3)}`]);
  });

  it('names the days ahead in the language on the page, whatever the system’s locale', async () => {
    const weekday = (locale: string, days: number): string => {
      const d = new Date(NOW);
      d.setDate(d.getDate() + days);
      return d.toLocaleDateString(locale, { weekday: 'short' });
    };
    await open(summary());
    expect(texts('.fdl')).toEqual(['Today', 'Tomorrow', ...[2, 3, 4, 5, 6].map((i) => weekday('en-GB', i))]);
    expect(texts('.fdl')[2]).toMatch(/^(Mon|Tue|Wed|Thu|Fri|Sat|Sun)$/);

    TestBed.resetTestingModule();
    await open(summary(), { slovak: true });
    expect(texts('.fdl')).toEqual(['Dnes', 'Zajtra', ...[2, 3, 4, 5, 6].map((i) => weekday('sk-SK', i))]);
    expect(texts('.fdl')[2]).toMatch(/^(po|ut|st|št|pi|so|ne)$/);
  });

  it('words the rest of the page from keys', async () => {
    await open(summary());
    expect(texts('h2')).toEqual(['SRS stages', 'Upcoming reviews', 'Progress by lesson']);
    expect(text('.lvocab')).toBe('vocab 3/12');
    expect(host.querySelector('.lvocab')?.getAttribute('title')).toBe('vocabulary learned / total');
    expect(text('.foot')).toBe('Your progress is saved in the database, with a daily copy in backups/. Download a copy.');
    expect(text('.c-lessons .bc-foot a')).toBe('Choose lessons…');

    kanji.summary.set(summary({ forecastHours: Array.from({ length: 24 }, () => 0) }));
    await fixture.whenStable();
    expect(text('.panel .muted.small')).toBe('Nothing scheduled in the next 24 hours.');
  });
});
