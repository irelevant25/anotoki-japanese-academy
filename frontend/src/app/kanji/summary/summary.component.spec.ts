import { provideZonelessChangeDetection } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { TranslationService } from '@anotoki/lib/translations';
import { provideTestTranslations } from '@anotoki/lib/translations/testing';
import { ApiError, ApiService } from '../../core/api/api.service';
import { CatalogItem, Stage, Summary } from '../../core/api/api.types';
import { KanjiStateService } from '../kanji-state.service';
import { DoneEntry, SessionResult } from '../session/session-engine';
import { SummaryComponent } from './summary.component';
import { provideAuth } from '../../core/auth/auth.config';

const ENGLISH: Record<string, string> = {
  'summary.title.lesson': 'Lessons done',
  'summary.title.review': 'Reviews done',
  'summary.title.practice': 'Practice done',
  'summary.learned.one': 'You learned 1 item.',
  'summary.learned.few': 'You learned {count} items.',
  'summary.learned.other': 'You learned {count} items.',
  'summary.firstReview': 'The first review is {when}, at {clock}.',
  'summary.score.one': '{clean} of {count} item with no mistakes · {pct}% of answers right.',
  'summary.score.few': '{clean} of {count} items with no mistakes · {pct}% of answers right.',
  'summary.score.other': '{clean} of {count} items with no mistakes · {pct}% of answers right.',
  'summary.scoreOnly.one': '{clean} of {count} item with no mistakes.',
  'summary.scoreOnly.few': '{clean} of {count} items with no mistakes.',
  'summary.scoreOnly.other': '{clean} of {count} items with no mistakes.',
  'summary.unsaved.one': '1 half-answered item was not saved.',
  'summary.unsaved.few': '{count} half-answered items were not saved.',
  'summary.unsaved.other': '{count} half-answered items were not saved.',
  'summary.nextLessons.one': 'Next 1 lesson',
  'summary.nextLessons.few': 'Next {count} lessons',
  'summary.nextLessons.other': 'Next {count} lessons',
  'summary.allCaughtUp': 'All caught up',
  'summary.practiseThese': 'Practise these now',
  'summary.sameAgain': 'Same set again',
  'summary.justMissed': 'Just the {n} missed',
  'summary.newPractice': 'New practice',
  'summary.moreDue': '{n} more due',
  'summary.missed': 'Missed ({n})',
  'summary.rightFirstTime': 'Right first time ({n})',
  'summary.notSaved': 'Not saved',
  'summary.misses.one': '1 miss',
  'summary.misses.few': '{count} misses',
  'summary.misses.other': '{count} misses',
  'summary.stays': 'stays {stage}',
  'kanji.tab.dashboard': 'Dashboard',
  'kanji.tileNotLearned': 'not learned',
  'time.now': 'now',
  'time.inMinutes': 'in {m} min',
  'time.inHours': 'in {h} h',
  'time.inHoursMinutes': 'in {h} h {m} min',
  'error.offline': 'The server does not answer.',
  'error.not_due': 'That item is not due for review.',
  'error.server_error': 'Something went wrong on the server.',
  'error.unknown': 'Something went wrong.',
};

const SLOVAK: Record<string, string> = {
  ...ENGLISH,
  'summary.title.lesson': 'Lekcie sú hotové',
  'summary.title.review': 'Opakovania sú hotové',
  'summary.learned.one': 'Máš naučenú 1 novú položku.',
  'summary.learned.few': 'Máš naučené {count} nové položky.',
  'summary.learned.other': 'Máš naučených {count} nových položiek.',
  'summary.firstReview': 'Prvé opakovanie príde {when}, o {clock}.',
  'summary.score.one': 'Bez chyby: {clean} / {count} · správne odpovede: {pct} %.',
  'summary.score.few': 'Bez chyby: {clean} / {count} · správne odpovede: {pct} %.',
  'summary.score.other': 'Bez chyby: {clean} / {count} · správne odpovede: {pct} %.',
  'summary.scoreOnly.one': 'Bez chyby: {clean} / {count}.',
  'summary.scoreOnly.few': 'Bez chyby: {clean} / {count}.',
  'summary.scoreOnly.other': 'Bez chyby: {clean} / {count}.',
  'summary.unsaved.one': '1 rozpracovaná položka sa neuložila.',
  'summary.unsaved.few': '{count} rozpracované položky sa neuložili.',
  'summary.unsaved.other': '{count} rozpracovaných položiek sa neuložilo.',
  'summary.nextLessons.one': 'Ďalšia lekcia',
  'summary.nextLessons.few': 'Ďalšie {count} lekcie',
  'summary.nextLessons.other': 'Ďalších {count} lekcií',
  'summary.misses.one': '1 chyba',
  'summary.misses.few': '{count} chyby',
  'summary.misses.other': '{count} chýb',
  'summary.stays': 'zostáva: {stage}',
  'summary.notSaved': 'Neuložené',
  'summary.moreDue': 'Ďalšie opakovania: {n}',
  'time.inHours': 'o {h} h',
  'error.not_due': 'Táto položka ešte nečaká na opakovanie.',
  'error.server_error': 'Na serveri sa niečo pokazilo.',
};

/** The stage names are the catalog's, and stay what they are in every language. */
const STAGES: Stage[] = [
  { n: 0, name: 'Lesson', group: 'lesson', hours: null },
  { n: 1, name: 'Apprentice I', group: 'apprentice', hours: 4 },
  { n: 2, name: 'Apprentice II', group: 'apprentice', hours: 8 },
];

function item(i: number): CatalogItem {
  return {
    id: `k:${i}`,
    type: 'kanji',
    chars: ['一', '二', '三', '四', '五', '六', '七'][i],
    no: i + 1,
    lesson: 3,
    courseLesson: 3,
    order: i,
    meanings: [`meaning ${i}`],
    readings: ['いち'],
    audio: null,
  };
}
const ITEMS = [0, 1, 2, 3, 4, 5, 6].map(item);

const entry = (i: number, more: Partial<DoneEntry> = {}): DoneEntry => ({ it: ITEMS[i], wrongM: 0, wrongR: 0, ...more });
const result = (mode: SessionResult['mode'], done: DoneEntry[], more: Partial<SessionResult> = {}): SessionResult => ({
  mode,
  done,
  answered: done.length * 2,
  right: done.length * 2,
  unfinished: 0,
  early: false,
  ...more,
});

describe('SummaryComponent', () => {
  let fixture: ComponentFixture<SummaryComponent>;
  let host: HTMLElement;
  let kanji: KanjiStateService;
  let warn: ReturnType<typeof vi.spyOn>;

  const text = (selector: string): string => (host.querySelector(selector)?.textContent ?? '').replace(/\s+/g, ' ').trim();
  const texts = (selector: string): string[] => Array.from(host.querySelectorAll(selector)).map((el) => (el.textContent ?? '').replace(/\s+/g, ' ').trim());

  async function show(r: SessionResult, options: { slovak?: boolean; summary?: Partial<Summary> } = {}): Promise<void> {
    TestBed.configureTestingModule({
      providers: [
        provideZonelessChangeDetection(),
        provideAuth(),
        provideRouter([]),
        options.slovak ? provideTestTranslations(SLOVAK, { language: 'sk', english: ENGLISH }) : provideTestTranslations(ENGLISH),
        { provide: ApiService, useValue: {} },
      ],
    });
    kanji = TestBed.inject(KanjiStateService);
    kanji.items.set(ITEMS);
    kanji.stages.set(STAGES);
    kanji.summary.set({ reviewsDue: 0, nextReviewAt: null, ...options.summary } as Summary);
    fixture = TestBed.createComponent(SummaryComponent);
    fixture.componentRef.setInput('result', r);
    host = fixture.nativeElement;
    await fixture.whenStable();
  }

  async function shown(r: SessionResult): Promise<void> {
    fixture.componentRef.setInput('result', r);
    await fixture.whenStable();
  }

  beforeEach(() => {
    warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
  });
  afterEach(() => vi.restoreAllMocks());

  it('after lessons: how many items were learned and, as a sentence of its own, when their first review comes', async () => {
    const at = Date.now() + 4 * 3600e3;
    const clock = new Date(at).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
    await show(
      result(
        'lesson',
        [0, 1, 2, 3, 4].map((i) => entry(i)),
      ),
      { summary: { nextReviewAt: at } },
    );
    expect(text('h1')).toBe('Lessons done');
    // the browser suite looks for "learned 5 item" here
    expect(text('.anotoki-page-header__lead')).toBe(`You learned 5 items. The first review is in 4 h, at ${clock}.`);

    await shown(result('lesson', [entry(0)]));
    expect(text('.anotoki-page-header__lead')).toBe(`You learned 1 item. The first review is in 4 h, at ${clock}.`);
    expect(warn, 'no key of the summary is without a string').not.toHaveBeenCalled();
  });

  it('after lessons, with no review scheduled: the first sentence alone; an item that was not saved is not counted as learned', async () => {
    const refused = new ApiError('Learn its kanji first.', 409, { code: 'kanji_first' });
    await show(result('lesson', [entry(0), entry(1), entry(2, { error: refused })]));
    expect(text('.anotoki-page-header__lead')).toBe('You learned 2 items.');
  });

  it('after lessons, in Slovak: no past tense about the reader, and each number with its own form', async () => {
    const at = Date.now() + 4 * 3600e3;
    const clock = new Date(at).toLocaleTimeString('sk-SK', { hour: '2-digit', minute: '2-digit' });
    await show(
      result(
        'lesson',
        [0, 1, 2, 3, 4].map((i) => entry(i)),
      ),
      { slovak: true, summary: { nextReviewAt: at } },
    );
    expect(text('h1')).toBe('Lekcie sú hotové');
    expect(text('.anotoki-page-header__lead')).toBe(`Máš naučených 5 nových položiek. Prvé opakovanie príde o 4 h, o ${clock}.`);
    await shown(
      result(
        'lesson',
        [0, 1, 2].map((i) => entry(i)),
      ),
    );
    expect(text('.anotoki-page-header__lead')).toBe(`Máš naučené 3 nové položky. Prvé opakovanie príde o 4 h, o ${clock}.`);
    await shown(result('lesson', [entry(0)]));
    expect(text('.anotoki-page-header__lead')).toBe(`Máš naučenú 1 novú položku. Prvé opakovanie príde o 4 h, o ${clock}.`);
  });

  it('after reviews or practice: how many went without a mistake, and the share of answers right', async () => {
    const done = [entry(0), entry(1), entry(2), entry(3), entry(4, { wrongM: 1 })];
    await show(result('practice', done, { answered: 10, right: 9 }));
    expect(text('h1')).toBe('Practice done');
    expect(text('.anotoki-page-header__lead')).toBe('4 of 5 items with no mistakes · 90% of answers right.');

    await shown(result('practice', [entry(0)], { answered: 2, right: 2 }));
    expect(text('.anotoki-page-header__lead')).toBe('1 of 1 item with no mistakes · 100% of answers right.');

    // ended before anything was answered: no share to give
    await shown(result('practice', [], { answered: 0, right: 0, early: true }));
    expect(text('.anotoki-page-header__lead')).toBe('0 of 0 items with no mistakes.');
  });

  it('the same line in Slovak is one text for every number: a label, then the numbers', async () => {
    await show(result('review', [entry(0), entry(1), entry(2), entry(3), entry(4, { wrongM: 1 })], { answered: 10, right: 9 }), { slovak: true });
    expect(text('h1')).toBe('Opakovania sú hotové');
    expect(text('.anotoki-page-header__lead')).toBe('Bez chyby: 4 / 5 · správne odpovede: 90 %.');
    await shown(result('review', [entry(0)], { answered: 0, right: 0 }));
    expect(text('.anotoki-page-header__lead')).toBe('Bez chyby: 1 / 1.');
  });

  it('says how many half-answered items were not saved, the verb with the number — after reviews and practice only', async () => {
    await show(result('review', [entry(0)], { unfinished: 1, early: true }));
    expect(text('#unsavedNote')).toBe('1 half-answered item was not saved.');
    await shown(result('review', [entry(0)], { unfinished: 3, early: true }));
    expect(text('#unsavedNote')).toBe('3 half-answered items were not saved.');
    await shown(result('lesson', [entry(0)], { unfinished: 3, early: true }));
    expect(host.querySelector('#unsavedNote')).toBeNull();
  });

  it('…and in Slovak, in its three forms', async () => {
    await show(result('review', [entry(0)], { unfinished: 1 }), { slovak: true });
    expect(text('#unsavedNote')).toBe('1 rozpracovaná položka sa neuložila.');
    await shown(result('review', [entry(0)], { unfinished: 2 }));
    expect(text('#unsavedNote')).toBe('2 rozpracované položky sa neuložili.');
    await shown(result('review', [entry(0)], { unfinished: 5 }));
    expect(text('#unsavedNote')).toBe('5 rozpracovaných položiek sa neuložilo.');
  });

  it('lists what was missed and what was right, the meaning saying English and the reading Japanese', async () => {
    await show(result('practice', [entry(0), entry(1, { wrongM: 1 }), entry(2, { wrongM: 1, wrongR: 1 })]));
    expect(texts('h2')).toEqual(['Missed (2)', 'Right first time (1)']);
    expect(texts('.sm-x')).toEqual(['1 miss', '2 misses']);
    expect(Array.from(host.querySelectorAll('.sm-m')).map((el) => el.getAttribute('lang'))).toEqual(['en', 'en', 'en']);
    expect(Array.from(host.querySelectorAll('.sm-r')).map((el) => el.getAttribute('lang'))).toEqual(['ja', 'ja', 'ja']);
    expect(texts('#summaryActions button')).toEqual(['Same set again', 'Just the 2 missed']);
    expect(texts('#summaryActions a')).toEqual(['New practice', 'Dashboard']);
  });

  it('shows a review’s move between stages in the stages’ own names, which say they are English', async () => {
    await show(result('review', [entry(0, { from: 1, to: 2 }), entry(1, { wrongR: 1, from: 1, to: 1 })]));
    const moves = Array.from(host.querySelectorAll('.sumlist anotoki-badge'));
    // the browser suite looks for this text
    expect(host.textContent).toContain('Apprentice I → Apprentice II');
    const up = moves.find((el) => el.getAttribute('data-tone') === 'success') as HTMLElement;
    expect(up.textContent).toBe('Apprentice I → Apprentice II');
    expect(up.getAttribute('lang')).toBe('en');

    const stays = moves.find((el) => el.getAttribute('data-tone') === 'neutral') as HTMLElement;
    expect(stays.textContent).toBe('stays Apprentice I');
    expect(stays.getAttribute('lang'), 'the word is the app’s, in the page’s language').toBeNull();
    expect(Array.from(stays.querySelectorAll('span[lang]')).map((el) => [el.textContent, el.getAttribute('lang')])).toEqual([['Apprentice I', 'en']]);
  });

  it('in Slovak a stage name stands after a colon, undeclined, and the misses take their form', async () => {
    await show(result('review', [entry(0, { wrongR: 1, from: 2, to: 1 }), entry(1, { wrongR: 2, wrongM: 1, from: 1, to: 1 }), entry(2, { wrongM: 5, from: 1, to: 1 })]), {
      slovak: true,
    });
    expect(texts('.sm-x')).toEqual(['1 chyba', '3 chyby', '5 chýb']);
    expect(texts('.sumlist anotoki-badge')).toEqual(['Apprentice II → Apprentice I', 'zostáva: Apprentice I', 'zostáva: Apprentice I']);
    expect(host.querySelector('.sumlist anotoki-badge[data-tone="danger"]')?.getAttribute('lang')).toBe('en');
  });

  it('words an item that was not saved from the failure’s code — never with the server’s English sentence', async () => {
    const notDue = new ApiError('That item is not due for review.', 409, { error: 'That item is not due for review.', code: 'not_due' });
    const broke = new ApiError('SQLSTATE[08006] connection lost', 500, { error: 'SQLSTATE[08006] connection lost', code: 'server_error', detail: 'SQLSTATE[08006] connection lost' });
    await show(result('review', [entry(0, { error: notDue }), entry(1, { error: broke }), entry(2)]), { slovak: true });
    expect(texts('h2')).toEqual(['Right first time (1)', 'Neuložené']);
    expect(texts('#summaryFailed .sm-x')).toEqual(['Táto položka ešte nečaká na opakovanie.', 'Na serveri sa niečo pokazilo.']);
    // what the owner's own computer adds: shown after the app's words, small, and saying it is English
    expect(Array.from(host.querySelectorAll('#summaryFailed span[lang="en"]')).map((el) => el.textContent)).toEqual(['SQLSTATE[08006] connection lost']);
    expect(host.textContent).not.toContain('That item is not due');
  });

  it('offers the next lessons by their number, or says there are none', async () => {
    await show(result('lesson', [entry(0)]));
    expect(texts('#summaryActions button')).toEqual(['Next 5 lessons', 'Practise these now']);

    // everything but two learned
    kanji.progress.set(Object.fromEntries(ITEMS.slice(0, 5).map((it) => [it.id, { stage: 1 }])) as never);
    await fixture.whenStable();
    expect(texts('#summaryActions button')).toEqual(['Next 2 lessons', 'Practise these now']);

    kanji.progress.set(Object.fromEntries(ITEMS.map((it) => [it.id, { stage: 1 }])) as never);
    await fixture.whenStable();
    expect(texts('#summaryActions button')).toEqual(['All caught up', 'Practise these now']);
    expect((host.querySelector('#summaryActions button') as HTMLButtonElement).disabled).toBe(true);
  });

  it('offers more reviews when more have come due, and follows the language', async () => {
    await show(result('review', [entry(0)]), { slovak: true, summary: { reviewsDue: 3 } });
    expect(texts('#summaryActions button')).toEqual(['Ďalšie opakovania: 3']);

    await TestBed.inject(TranslationService).setLanguage('en', { remember: false });
    await fixture.whenStable();
    expect(texts('#summaryActions button')).toEqual(['3 more due']);
    expect(text('h1')).toBe('Reviews done');
    expect(text('.anotoki-page-header__lead')).toBe('1 of 1 item with no mistakes · 100% of answers right.');
  });
});
