import { provideZonelessChangeDetection } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { TranslationService } from '@anotoki/lib/translations';
import { provideTestTranslations } from '@anotoki/lib/translations/testing';
import { ApiService } from '../../core/api/api.service';
import { AuthService } from '../../core/auth/auth.service';
import { CatalogItem, ItemState, StageGroup, Summary } from '../../core/api/api.types';
import type { AnotokiPreferences } from '@anotoki/lib/auth';
import { authStandIn, NO_CHOICE, person } from '../../core/testing/auth-states';
import { KanjiStateService } from '../kanji-state.service';
import { DashboardComponent } from './dashboard.component';

const ENGLISH: Record<string, string> = {
  'visitor.notice.one': 'You are studying without signing in. What you study is kept for this browser for {count} day after your last visit. Sign in to keep it in your account.',
  'visitor.notice.few': 'You are studying without signing in. What you study is kept for this browser for {count} days after your last visit. Sign in to keep it in your account.',
  'visitor.notice.other': 'You are studying without signing in. What you study is kept for this browser for {count} days after your last visit. Sign in to keep it in your account.',
  'signIn.button': 'Sign in',
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
  'dashboard.saved': 'Your progress is kept with your account.',
  'dashboard.download': 'Your data: download it, or bring a file back',
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

/** The date ('Y-m-d') `days` after NOW's, in the browser's zone: as the server names a forecast day. */
function dateAfter(days: number): string {
  const d = new Date(NOW);
  d.setDate(d.getDate() + days);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

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
    forecastDates: [0, 1, 2, 3, 4, 5, 6].map(dateAfter),
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

  async function open(s: Summary, options: { slovak?: boolean; learned?: number; visiting?: boolean; account?: AnotokiPreferences } = {}): Promise<void> {
    const auth = authStandIn(options.visiting ? 'visiting' : 'ready');
    if (options.account) {
      // Signed in, the anotoki account's date order and clock.
      auth.user.set(person(options.account));
    }
    TestBed.configureTestingModule({
      providers: [
        provideZonelessChangeDetection(),
        provideRouter([]),
        options.slovak ? provideTestTranslations(SLOVAK, { language: 'sk', english: ENGLISH }) : provideTestTranslations(ENGLISH),
        { provide: ApiService, useValue: {} },
        { provide: AuthService, useValue: auth },
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

    await TestBed.inject(TranslationService).setLanguage('en', { remember: false });
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

  it('marks every third hour ahead: two digits — or, on the 12-hour clock chosen for the anotoki account, the hour with am or pm, as the bars’ own words say it', async () => {
    const at = (h: number): Date => new Date(NOW + h * 3600e3);
    await open(summary());
    expect(texts('.fl')).toEqual([0, 3, 6, 9, 12, 15, 18, 21].map((h) => String(at(h).getHours()).padStart(2, '0')));
    expect(texts('.fl')[0], 'NOW is noon').toBe('12');

    TestBed.resetTestingModule();
    await open(summary(), { account: { ...NO_CHOICE, time_format: '12' } });
    expect(texts('.fl')).toEqual([0, 3, 6, 9, 12, 15, 18, 21].map((h) => at(h).toLocaleTimeString('en-GB', { hour: 'numeric', hourCycle: 'h12' })));
    expect(texts('.fl')[0]).toBe('12 pm');
    expect(host.querySelectorAll('.fb')[1].getAttribute('title')).toBe(`1 review around ${at(1).toLocaleTimeString('en-GB', { hour: 'numeric', minute: '2-digit', hourCycle: 'h12' })}`);

    TestBed.resetTestingModule();
    await open(summary(), { slovak: true, account: { ...NO_CHOICE, time_format: '12' } });
    expect(texts('.fl')[0]).toBe('12 PM');
  });

  it('names the days ahead in the language on the page, whatever the system’s locale', async () => {
    // The server names each forecast day by the learner's date: the page words those dates.
    const weekday = (locale: string, days: number): string => new Date(`${dateAfter(days)}T12:00:00Z`).toLocaleDateString(locale, { weekday: 'short', timeZone: 'UTC' });
    await open(summary());
    expect(texts('.fdl')).toEqual(['Today', 'Tomorrow', ...[2, 3, 4, 5, 6].map((i) => weekday('en-GB', i))]);
    expect(texts('.fdl')[2]).toMatch(/^(Mon|Tue|Wed|Thu|Fri|Sat|Sun)$/);

    TestBed.resetTestingModule();
    await open(summary(), { slovak: true });
    expect(texts('.fdl')).toEqual(['Dnes', 'Zajtra', ...[2, 3, 4, 5, 6].map((i) => weekday('sk-SK', i))]);
    expect(texts('.fdl')[2]).toMatch(/^(po|ut|st|št|pi|so|ne)$/);
  });

  it('names each day by the date the server says, never by 24-hour steps of its own from now: a change of summer time moves those', async () => {
    // Europe/Bratislava, 2026-10-25 00:30 CEST (the 25-hour day): now + 2 × 24 h is the 26th at 23:30 CET, a Monday —
    // but day 2 is Tuesday the 27th, as the server says. The dates win whatever the browser's zone.
    const now = Date.parse('2026-10-24T22:30:00Z');
    const dates = ['2026-10-25', '2026-10-26', '2026-10-27', '2026-10-28', '2026-10-29', '2026-10-30', '2026-10-31'];
    await open(summary({ now, forecastDates: dates }));
    expect(texts('.fdl')).toEqual(['Today', 'Tomorrow', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']);

    // And a week that is not this one's at all: the names are the dates', not now's.
    TestBed.resetTestingModule();
    await open(summary({ forecastDates: [3, 4, 5, 6, 7, 8, 9].map(dateAfter) }));
    const weekday = (days: number): string => new Date(`${dateAfter(days)}T12:00:00Z`).toLocaleDateString('en-GB', { weekday: 'short', timeZone: 'UTC' });
    expect(texts('.fdl').slice(2)).toEqual([5, 6, 7, 8, 9].map(weekday));
  });

  it('a visitor (studying without signing in): the visitor notice above it all, and no way to Your data (a visitor’s study has no file)', async () => {
    await open(summary(), { visiting: true });
    expect(host.firstElementChild?.tagName.toLowerCase()).toBe('app-visitor-notice');
    expect(host.querySelector('#visitorNotice')).not.toBeNull();
    expect([host.querySelector('.foot'), host.querySelector('#yourDataLink')]).toEqual([null, null]);
  });

  it('words the rest of the page from keys', async () => {
    await open(summary());
    expect(texts('h2')).toEqual(['SRS stages', 'Upcoming reviews', 'Progress by lesson']);
    expect(text('.lvocab')).toBe('vocab 3/12');
    expect(host.querySelector('.lvocab')?.getAttribute('title')).toBe('vocabulary learned / total');
    expect(text('.foot')).toBe('Your progress is kept with your account. Your data: download it, or bring a file back.');
    expect(host.querySelector('#yourDataLink')?.getAttribute('href'), 'to the Your data card on the home page').toBe('/#your-data');
    expect(text('.c-lessons .bc-foot a')).toBe('Choose lessons…');

    kanji.summary.set(summary({ forecastHours: Array.from({ length: 24 }, () => 0) }));
    await fixture.whenStable();
    expect(text('.panel .muted.small')).toBe('Nothing scheduled in the next 24 hours.');
  });
});
