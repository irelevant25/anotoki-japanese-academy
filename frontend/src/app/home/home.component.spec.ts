import { ApplicationRef, ChangeDetectionStrategy, Component, inject, Injectable, Provider, provideZonelessChangeDetection, output } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { TranslationService } from '@anotoki/lib/translations';
import { provideTestTranslations } from '@anotoki/lib/translations/testing';
import { ConfirmService } from '@anotoki/lib/ui/dialog';
import { ApiService } from '../core/api/api.service';
import { Attempt, BroughtBack, ExamMeta, Summary, VisitorMove } from '../core/api/api.types';
import { AuthService } from '../core/auth/auth.service';
import { VisitorKey } from '../core/auth/visitor-key';
import { SavesInFlight } from '../core/saves-in-flight.service';
import { authStandIn } from '../core/testing/auth-states';
import { KanjiStateService } from '../kanji/kanji-state.service';
import { HomeComponent } from './home.component';
import { YourDataComponent } from './your-data/your-data.component';
import { provideAuth } from '../core/auth/auth.config';

/** Where the stand-in for Your data says it is there: the card has a spec of its own (your-data.component.spec.ts). */
@Injectable({ providedIn: 'root' })
class YourDataStubHolder {
  last: YourDataStubComponent | null = null;
}

@Component({ selector: 'app-your-data', changeDetection: ChangeDetectionStrategy.OnPush, template: '' })
class YourDataStubComponent {
  readonly brought = output<BroughtBack>();
  constructor() {
    inject(YourDataStubHolder).last = this;
  }
}

// Every test of this file draws the page with the stand-in (after each reset too: a test that draws twice resets in between).
const standIn = () => TestBed.overrideComponent(HomeComponent, { remove: { imports: [YourDataComponent] }, add: { imports: [YourDataStubComponent] } });
beforeEach(standIn);

// The page's strings as the migration seeds them (the plural families whole: English `.few` is `.other`).
const ENGLISH: Record<string, string> = {
  'home.intro': 'Learn the kanji of the course — and the vocabulary written with them — through spaced-repetition lessons, reviews and practice. Then test yourself on the whole course with the exam.',
  'home.kanji.sub': 'Lessons · reviews · practice',
  'home.kanji.reviewsDue.one': 'review due',
  'home.kanji.reviewsDue.few': 'reviews due',
  'home.kanji.reviewsDue.other': 'reviews due',
  'home.kanji.lessonsAvailable.one': 'lesson available',
  'home.kanji.lessonsAvailable.few': 'lessons available',
  'home.kanji.lessonsAvailable.other': 'lessons available',
  'home.kanji.learned': 'learned',
  'home.kanji.loadFailed': 'Could not load kanji progress.',
  'home.kanji.waiting': 'Reviews are waiting.',
  'home.kanji.nextReview': 'Next review {when}.',
  'home.kanji.start': 'Start with your first lessons.',
  'home.kanji.open': 'Open Kanji',
  'home.exam.title': 'Exam',
  'home.exam.sub': 'Multiple choice with listening',
  'home.exam.score': '{pct}%',
  'home.exam.lastScore': 'last score',
  'home.exam.attempts.one': 'attempt',
  'home.exam.attempts.few': 'attempts',
  'home.exam.attempts.other': 'attempts',
  'home.exam.bankQuestions.one': 'question in the bank',
  'home.exam.bankQuestions.few': 'questions in the bank',
  'home.exam.bankQuestions.other': 'questions in the bank',
  'home.exam.loadFailed': 'Could not load exam history.',
  'home.exam.passed': 'Passed · {when}',
  'home.exam.notPassed': 'Not passed · {when}',
  'home.exam.none': 'No attempts yet.',
  'home.exam.open': 'Open Exam',
  'time.now': 'now',
  'time.inMinutes': 'in {m} min',
  'time.inHours': 'in {h} h',
  'time.inDays.one': 'in 1 day',
  'time.inDays.few': 'in {count} days',
  'time.inDays.other': 'in {count} days',
  'visitor.notice.one': 'You are studying without signing in. What you study is kept for this browser for {count} day after your last visit. Sign in to keep it in your account.',
  'visitor.notice.few': 'You are studying without signing in. What you study is kept for this browser for {count} days after your last visit. Sign in to keep it in your account.',
  'visitor.notice.other': 'You are studying without signing in. What you study is kept for this browser for {count} days after your last visit. Sign in to keep it in your account.',
  'visitor.lost': 'What this browser studied without signing in is no longer here: it was deleted after a long time unused, or moved into an account.',
  'visitor.moved': 'What you studied without signing in is now in your account. Kanji and words: {items}, exam attempts: {attempts}.',
  'visitor.movedKept': 'Kanji and words that were in your account already: {kept}. Your own progress stays for them.',
  'signIn.button': 'Sign in',
  'common.close': 'Close',
};
const SLOVAK: Record<string, string> = {
  'home.intro': 'Nauč sa kanji z kurzu – aj slovíčka, ktoré sa nimi píšu. Potom si celý kurz over skúškou.',
  'home.kanji.sub': 'Lekcie · opakovania · precvičovanie',
  'home.kanji.reviewsDue.one': 'opakovanie čaká',
  'home.kanji.reviewsDue.few': 'opakovania čakajú',
  'home.kanji.reviewsDue.other': 'opakovaní čaká',
  'home.kanji.lessonsAvailable.one': 'dostupná lekcia',
  'home.kanji.lessonsAvailable.few': 'dostupné lekcie',
  'home.kanji.lessonsAvailable.other': 'dostupných lekcií',
  'home.kanji.learned': 'naučené',
  'home.kanji.loadFailed': 'Pokrok v kanji sa nepodarilo načítať.',
  'home.kanji.waiting': 'Opakovania čakajú.',
  'home.kanji.nextReview': 'Ďalšie opakovanie príde {when}.',
  'home.kanji.start': 'Začni prvými lekciami.',
  'home.kanji.open': 'Otvoriť Kanji',
  'home.exam.title': 'Skúška',
  'home.exam.sub': 'Výber z možností, aj s počúvaním',
  'home.exam.score': '{pct} %',
  'home.exam.lastScore': 'posledný výsledok',
  'home.exam.attempts.one': 'pokus',
  'home.exam.attempts.few': 'pokusy',
  'home.exam.attempts.other': 'pokusov',
  'home.exam.bankQuestions.one': 'otázka v banke',
  'home.exam.bankQuestions.few': 'otázky v banke',
  'home.exam.bankQuestions.other': 'otázok v banke',
  'home.exam.loadFailed': 'Históriu skúšok sa nepodarilo načítať.',
  'home.exam.passed': 'Úspešný pokus · {when}',
  'home.exam.notPassed': 'Neúspešný pokus · {when}',
  'home.exam.none': 'Zatiaľ žiadne pokusy.',
  'home.exam.open': 'Otvoriť skúšku',
  'time.now': 'teraz',
  'time.inMinutes': 'o {m} min',
  'time.inHours': 'o {h} h',
  'time.inDays.one': 'o 1 deň',
  'time.inDays.few': 'o {count} dni',
  'time.inDays.other': 'o {count} dní',
};

/** The stage groups as the server sends them with the summary: under their ids, each with its own name. */
function groups(totals: Record<string, number>): Summary['groups'] {
  const named: [string, string][] = [
    ['apprentice', 'Apprentice'],
    ['guru', 'Guru'],
    ['master', 'Master'],
    ['enlightened', 'Enlightened'],
    ['burned', 'Burned'],
  ];
  return Object.fromEntries(named.map(([id, name]) => [id, { name, total: totals[id] ?? 0, kanji: totals[id] ?? 0, vocab: 0 }]));
}

function summary(over: Partial<Summary> = {}): Summary {
  return {
    now: Date.now(),
    total: 1373,
    learned: 5,
    lessonsAvailable: 1,
    reviewsDue: 1,
    nextReviewAt: null,
    groups: groups({ apprentice: 3, guru: 2 }),
    forecastHours: [],
    forecastDays: [],
    forecastDates: [],
    byLesson: {},
    today: { lessons: 0, reviews: 0, reviewsCorrect: 0, practice: 0, practiceCorrect: 0 },
    history: [],
    ...over,
  };
}

const META: ExamMeta = { books: [], sections: [], lessons: [], bankSize: 11523, attempts: 1 };

function attempt(over: Partial<Attempt> = {}): Attempt {
  return { id: 'a1', finishedAt: '2026-09-22T14:05:09.000Z', total: 40, right: 13, pct: 32.5, grade: 'F', passed: false, candidate: '', ...over };
}

/** What the server has for the page; a rejected promise is a load that fails. */
interface Served {
  summary?: Summary | Error;
  meta?: ExamMeta | Error;
  attempts?: Attempt[] | Error;
}

function promised<T>(value: T | Error): Promise<T> {
  return value instanceof Error ? Promise.reject(value) : Promise.resolve(value);
}

/** The home page, drawn in a language with its strings, once its two loads have settled. */
async function draw(served: Served, language: 'en' | 'sk' = 'en', extra: Provider[] = []): Promise<HTMLElement> {
  TestBed.configureTestingModule({
    providers: [
      provideZonelessChangeDetection(),
      provideAuth(),
      provideRouter([]),
      language === 'en' ? provideTestTranslations(ENGLISH) : provideTestTranslations(SLOVAK, { language: 'sk', english: ENGLISH }),
      {
        provide: ApiService,
        useValue: {
          summary: () => promised(served.summary ?? summary()),
          meta: () => promised(served.meta ?? META),
          attempts: () => promised(served.attempts ?? []),
        },
      },
      { provide: KanjiStateService, useValue: { setSummary: vi.fn() } },
      // A page shown to a person, unless the test says otherwise.
      { provide: AuthService, useValue: authStandIn('ready') },
      ...extra,
    ],
  });
  const fixture = TestBed.createComponent(HomeComponent);
  await fixture.whenStable();
  return fixture.nativeElement as HTMLElement;
}

/** A tile's label: the words under the number with this id. */
function label(el: HTMLElement, id: string): string {
  return el.querySelector(`#${id}`)?.parentElement?.querySelector('span')?.textContent?.trim() ?? '';
}

function text(el: HTMLElement, selector: string): string {
  return el.querySelector(selector)?.textContent?.replace(/\s+/g, ' ').trim() ?? '';
}

/** A date with its time as the language writes it: what the page must show, whatever the system's locale is. */
function written(locale: string, iso: string): string {
  return new Date(iso).toLocaleString(locale, { year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
}

describe('HomeComponent: in English, as it read before it had strings', () => {
  let warn: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
  });
  afterEach(() => {
    expect(warn.mock.calls, 'no key without a string').toEqual([]);
    warn.mockRestore();
  });

  it('says what it said, word for word: the two cards, their tiles and their notes', async () => {
    const el = await draw({ attempts: [attempt({ passed: true, pct: 85 })] });
    expect(text(el, '.hero p')).toBe(ENGLISH['home.intro']);
    expect(text(el, '.hc-kanji .hc-title')).toBe('Kanji');
    expect(text(el, '.hc-kanji .hc-sub')).toBe('Lessons · reviews · practice');
    expect([text(el, '#kDue'), label(el, 'kDue')]).toEqual(['1', 'review due']);
    expect([text(el, '#kLessons'), label(el, 'kLessons')]).toEqual(['1', 'lesson available']);
    expect([text(el, '#kLearned'), label(el, 'kLearned')]).toEqual(['5 / 1373', 'learned']);
    expect(text(el, '#kNext')).toBe('Reviews are waiting.');
    expect(text(el, '.hc-kanji .hc-go')).toBe('Open Kanji →');

    expect(text(el, '.hc-exam .hc-title')).toBe('Exam');
    expect(text(el, '.hc-exam .hc-sub')).toBe('Multiple choice with listening');
    expect([text(el, '#eLast'), label(el, 'eLast')]).toEqual(['85%', 'last score']);
    expect([text(el, '#eCount'), label(el, 'eCount')]).toEqual(['1', 'attempt']);
    expect([text(el, '#eBank'), label(el, 'eBank')]).toEqual(['11,523', 'questions in the bank']);
    expect(text(el, '#eWhen')).toBe(`Passed · ${written('en-GB', '2026-09-22T14:05:09.000Z')}`);
    expect(text(el, '.hc-exam .hc-go')).toBe('Open Exam →');
  });

  it('a label under a number agrees with it; while the number is on its way the label is the plural, as before', async () => {
    const el = await draw({ summary: summary({ reviewsDue: 0, lessonsAvailable: 25 }), attempts: [attempt(), attempt({ id: 'a2' })] });
    expect([text(el, '#kDue'), label(el, 'kDue')]).toEqual(['0', 'reviews due']);
    expect([text(el, '#kLessons'), label(el, 'kLessons')]).toEqual(['25', 'lessons available']);
    expect([text(el, '#eCount'), label(el, 'eCount')]).toEqual(['2', 'attempts']);
    expect([text(el, '#eLast'), text(el, '#eWhen')]).toEqual(['32.5%', `Not passed · ${written('en-GB', '2026-09-22T14:05:09.000Z')}`]);

    TestBed.resetTestingModule();
    standIn();
    const never = new Promise<never>(() => undefined);
    TestBed.configureTestingModule({
      providers: [
        provideZonelessChangeDetection(),
        provideAuth(),
        provideRouter([]),
        provideTestTranslations(ENGLISH),
        { provide: ApiService, useValue: { summary: () => never, meta: () => never, attempts: () => never } },
        { provide: KanjiStateService, useValue: { setSummary: vi.fn() } },
      ],
    });
    const fixture = TestBed.createComponent(HomeComponent);
    fixture.detectChanges();
    const waiting = fixture.nativeElement as HTMLElement;
    expect([text(waiting, '#kDue'), label(waiting, 'kDue')]).toEqual(['–', 'reviews due']);
    expect([text(waiting, '#kLessons'), label(waiting, 'kLessons')]).toEqual(['–', 'lessons available']);
    expect([text(waiting, '#kLearned'), text(waiting, '#kNext')]).toEqual(['–', '']);
    expect([text(waiting, '#eLast'), text(waiting, '#eCount'), label(waiting, 'eCount')]).toEqual(['–', '–', 'attempts']);
    expect([text(waiting, '#eBank'), label(waiting, 'eBank'), text(waiting, '#eWhen')]).toEqual(['–', 'questions in the bank', '']);
    expect(waiting.querySelector('#kBar')?.hasAttribute('title'), 'no names before the summary has brought them').toBe(false);
  });

  it('the kanji note: reviews waiting, else when the next one comes, else the first lessons — and a load that failed', async () => {
    expect(text(await draw({ summary: summary({ reviewsDue: 0, nextReviewAt: Date.now() + 3 * 3_600_000 + 90_000 }) }), '#kNext')).toBe('Next review in 3 h.');
    TestBed.resetTestingModule();
    standIn();
    expect(text(await draw({ summary: summary({ reviewsDue: 0, nextReviewAt: Date.now() + 2 * 86_400_000 + 90_000 }) }), '#kNext')).toBe('Next review in 2 days.');
    TestBed.resetTestingModule();
    standIn();
    expect(text(await draw({ summary: summary({ reviewsDue: 0, nextReviewAt: null, learned: 0 }) }), '#kNext')).toBe('Start with your first lessons.');
    TestBed.resetTestingModule();
    standIn();
    const failed = await draw({ summary: new Error('Something went wrong on the server.') });
    expect(text(failed, '#kNext')).toBe('Could not load kanji progress.');
    expect(failed.textContent, 'the server’s own sentence is never shown').not.toContain('Something went wrong');
  });

  it('the exam note: nothing sat yet, and a history that could not be loaded', async () => {
    const none = await draw({ attempts: [] });
    expect([text(none, '#eLast'), text(none, '#eCount'), label(none, 'eCount'), text(none, '#eWhen')]).toEqual(['—', '0', 'attempts', 'No attempts yet.']);
    TestBed.resetTestingModule();
    standIn();
    const failed = await draw({ attempts: new Error('The database is not reachable.') });
    expect(text(failed, '#eWhen')).toBe('Could not load exam history.');
    expect(failed.textContent).not.toContain('not reachable');
  });

  it('the stage bar takes its titles from the summary: each group under its own name, not its id', async () => {
    const el = await draw({ summary: summary({ total: 10, groups: groups({ apprentice: 3, guru: 2, burned: 5 }) }) });
    const bar = el.querySelector('#kBar') as HTMLElement;
    expect(bar.getAttribute('title')).toBe('Apprentice · Guru · Master · Enlightened · Burned');
    const parts = Array.from(bar.querySelectorAll('i'));
    expect(parts.map((part) => part.getAttribute('title'))).toEqual(['Apprentice: 3', 'Guru: 2', 'Burned: 5']);
    expect(parts.map((part) => part.style.width)).toEqual(['30%', '20%', '50%']);
  });
});

describe('HomeComponent: in Slovak', () => {
  let warn: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
  });
  afterEach(() => {
    expect(warn.mock.calls, 'no key without a string').toEqual([]);
    warn.mockRestore();
  });

  it('each label under a number takes the form the number asks for: 1, 2–4, 0 and 5 up', async () => {
    const forms: [number, string, string, string][] = [
      [1, 'opakovanie čaká', 'dostupná lekcia', 'pokus'],
      [3, 'opakovania čakajú', 'dostupné lekcie', 'pokusy'],
      [5, 'opakovaní čaká', 'dostupných lekcií', 'pokusov'],
      [0, 'opakovaní čaká', 'dostupných lekcií', 'pokusov'],
    ];
    for (const [n, reviews, lessons, attempts] of forms) {
      TestBed.resetTestingModule();
      standIn();
      const el = await draw({ summary: summary({ reviewsDue: n, lessonsAvailable: n }), attempts: Array.from({ length: n }, (_, i) => attempt({ id: `a${i}` })) }, 'sk');
      expect([text(el, '#kDue'), label(el, 'kDue')], `${n}`).toEqual([String(n), reviews]);
      expect([text(el, '#kLessons'), label(el, 'kLessons')], `${n}`).toEqual([String(n), lessons]);
      expect([text(el, '#eCount'), label(el, 'eCount')], `${n}`).toEqual([String(n), attempts]);
    }
  });

  it('numbers, the percentage and the date are written the Slovak way; the terms and the stage names stay as they are', async () => {
    const el = await draw({ summary: summary({ reviewsDue: 0, nextReviewAt: Date.now() + 3 * 86_400_000 + 90_000 }), attempts: [attempt()] }, 'sk');
    // As written, space for space: Slovak groups thousands with a no-break space.
    const exact = (selector: string) => el.querySelector(selector)?.textContent;
    expect(exact('#eBank')).toBe(new Intl.NumberFormat('sk-SK').format(11523));
    expect(exact('#eBank')).toMatch(/^11\s523$/);
    expect(label(el, 'eBank')).toBe('otázok v banke');
    expect(exact('#eLast')).toBe('32,5 %');
    expect(exact('#eWhen')).toBe(`Neúspešný pokus · ${written('sk-SK', '2026-09-22T14:05:09.000Z')}`);
    expect(text(el, '#kNext')).toBe('Ďalšie opakovanie príde o 3 dni.');
    expect(text(el, '.hc-exam .hc-title')).toBe('Skúška');
    expect(text(el, '.hc-kanji .hc-go')).toBe('Otvoriť Kanji →');

    // Not the app's words: the section's term, and the stage groups' names — which say what language they are in.
    expect(text(el, '.hc-kanji .hc-title')).toBe('Kanji');
    const bar = el.querySelector('#kBar') as HTMLElement;
    expect(bar.getAttribute('lang')).toBe('en');
    expect(bar.getAttribute('title')).toBe('Apprentice · Guru · Master · Enlightened · Burned');
    expect(Array.from(bar.querySelectorAll('i')).map((part) => part.getAttribute('title'))).toEqual(['Apprentice: 3', 'Guru: 2']);
    // And the Japanese on the page says it is Japanese.
    expect(Array.from(el.querySelectorAll('[lang="ja"]')).map((mark) => mark.textContent)).toEqual(['日本語', '漢', '試']);
  });

  it('follows the language when it changes, without loading anything again', async () => {
    const el = await draw({ summary: summary({ reviewsDue: 3 }), attempts: [attempt()] }, 'sk');
    expect([label(el, 'kDue'), text(el, '#kNext'), label(el, 'eLast')]).toEqual(['opakovania čakajú', 'Opakovania čakajú.', 'posledný výsledok']);

    await TestBed.inject(TranslationService).setLanguage('en', { remember: false });
    await TestBed.inject(ApplicationRef).whenStable();
    expect([label(el, 'kDue'), text(el, '#kNext'), label(el, 'eLast')]).toEqual(['reviews due', 'Reviews are waiting.', 'last score']);
    expect(text(el, '#eLast')).toBe('32.5%');
  });
});

describe('HomeComponent: Your data at its foot', () => {
  it('has the card, and no way to the admin area of its own (that is the top bar’s)', async () => {
    const el = await draw({});
    expect(el.querySelector('app-your-data')).not.toBeNull();
    expect(el.querySelector('a[href="/translations"], a[href^="/admin"]')).toBeNull();
  });

  it('asks again where each part stands once a file has replaced the learner’s data', async () => {
    let asked = 0;
    const el = await draw({}, 'en', [
      {
        provide: ApiService,
        useValue: {
          summary: () => (asked++, Promise.resolve(summary({ reviewsDue: asked === 1 ? 1 : 9 }))),
          meta: () => Promise.resolve(META),
          attempts: () => Promise.resolve([]),
        },
      },
    ]);
    expect(text(el, '#kDue')).toBe('1');
    TestBed.inject(YourDataStubHolder).last!.brought.emit({ items: 9, days: 1, log: 9, attempts: 0, reports: 0, copy: true });
    await vi.waitFor(async () => {
      await TestBed.inject(ApplicationRef).whenStable();
      expect(text(el, '#kDue')).toBe('9');
    });
  });
});

describe('HomeComponent: somebody studying without signing in (visiting)', () => {
  it('the notice at the top — the server’s days, the form they take — with Sign in; no Your data (a visitor’s study has no file)', async () => {
    const auth = authStandIn('visiting');
    auth.visitorKeepDays.set(30);
    const el = await draw({}, 'en', [{ provide: AuthService, useValue: auth }]);
    expect(text(el, '#visitorNotice p')).toBe('You are studying without signing in. What you study is kept for this browser for 30 days after your last visit. Sign in to keep it in your account.');
    expect(el.querySelector('app-your-data')).toBeNull();
    expect(el.querySelector('main')?.firstElementChild?.tagName.toLowerCase(), 'above everything else').toBe('app-visitor-notice');

    auth.visitorKeepDays.set(1);
    await TestBed.inject(ApplicationRef).whenStable();
    expect(text(el, '#visitorNotice p')).toContain('for 1 day after');
  });

  it('Sign in waits for the saves on their way first — the one that brings the key included — then goes to the IAM', async () => {
    const auth = authStandIn('visiting');
    const el = await draw({}, 'en', [{ provide: AuthService, useValue: auth }]);
    let saved!: () => void;
    TestBed.inject(SavesInFlight).track(new Promise<void>((resolve) => (saved = resolve)));
    el.querySelector<HTMLButtonElement>('#visitorSignIn')!.click();
    await TestBed.inject(ApplicationRef).whenStable();
    expect(auth.logins, 'not while an answer is on its way').toEqual([]);
    expect(el.querySelector<HTMLButtonElement>('#visitorSignIn')!.disabled).toBe(true);
    saved();
    // Back to this page, in the language read here: the library's to add (core/auth/auth.config.ts).
    await vi.waitFor(() => expect(auth.logins).toEqual([undefined]));
  });

  it('Sign in with an exam paper open asks first, in the words of signing in — and stays when told to', async () => {
    const auth = authStandIn('visiting');
    const el = await draw({}, 'en', [{ provide: AuthService, useValue: auth }]);
    TestBed.inject(SavesInFlight).watch(() => 'signOut.examOpen');
    // The kit's question, never the browser's own box.
    const box = vi.spyOn(window, 'confirm');
    const question = TestBed.inject(ConfirmService);
    el.querySelector<HTMLButtonElement>('#visitorSignIn')!.click();
    await vi.waitFor(() => expect(question.pending()).toMatchObject({ title: 'signIn.confirmTitle', message: 'signIn.examOpen', tone: 'danger' }));
    question.settle(false);
    await TestBed.inject(ApplicationRef).whenStable();
    expect(auth.logins).toEqual([]);
    expect(box).not.toHaveBeenCalled();
    vi.restoreAllMocks();
  });

  it('once, after a sign-in moved what this browser studied: how much, and what the account had already — each note closes', async () => {
    const el = await draw({});
    const visitor = TestBed.inject(VisitorKey);
    const move: VisitorMove = { found: true, items: 12, kept: 3, attempts: 2, answers: 140 };
    visitor.moved.set(move);
    visitor.lost.set(true);
    await TestBed.inject(ApplicationRef).whenStable();
    expect(text(el, '#visitorMoved p')).toBe(
      'What you studied without signing in is now in your account. Kanji and words: 12, exam attempts: 2. Kanji and words that were in your account already: 3. Your own progress stays for them.',
    );
    expect(text(el, '#visitorLost p')).toBe(ENGLISH['visitor.lost']);
    expect(el.querySelector('#visitorNotice'), 'a person’s page: no notice').toBeNull();
    el.querySelector<HTMLButtonElement>('#visitorMoved button')!.click();
    el.querySelector<HTMLButtonElement>('#visitorLost button')!.click();
    await TestBed.inject(ApplicationRef).whenStable();
    expect([el.querySelector('#visitorMoved'), el.querySelector('#visitorLost'), visitor.moved(), visitor.lost()]).toEqual([null, null, null, false]);
  });

  it('a move that finished after the page was drawn: where each part stands is asked again', async () => {
    let asked = 0;
    const el = await draw({}, 'en', [
      {
        provide: ApiService,
        useValue: {
          summary: () => (asked++, Promise.resolve(summary({ reviewsDue: asked === 1 ? 1 : 4 }))),
          meta: () => Promise.resolve(META),
          attempts: () => Promise.resolve([]),
        },
      },
    ]);
    expect(text(el, '#kDue')).toBe('1');
    TestBed.inject(VisitorKey).moves.update((n) => n + 1);
    await vi.waitFor(async () => {
      await TestBed.inject(ApplicationRef).whenStable();
      expect(text(el, '#kDue')).toBe('4');
    });
  });
});
