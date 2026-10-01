import { provideZonelessChangeDetection } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { ApiError, ApiService } from '../core/api/api.service';
import { Attempt, ExamMeta, ExamPaper, ExamQuestion, ExamResult } from '../core/api/api.types';
import { PrivateLinksService } from '../core/auth/private-links.service';
import { fmtDateTime } from '../core/format';
import { LanguageChooserComponent } from '../core/i18n/language-chooser/language-chooser.component';
import { TranslationService } from '../core/i18n/translation.service';
import { provideTestTranslations } from '../core/testing/test-translations';
import { ExamComponent } from './exam.component';

/** Intl writes a no-break space between the thousands, and before a unit, in Slovak. */
const NBSP = String.fromCharCode(0xa0);

/** The exam's sections, by the ids the server sends (core/i18n/dynamic-keys.ts lists the same). */
const SECTIONS: [id: string, english: string, slovak: string][] = [
  ['listening-word', 'Listening — the word', 'Počúvanie – slovo'],
  ['listening-meaning', 'Listening — the meaning', 'Počúvanie – význam'],
  ['kana', 'Hiragana & Katakana', 'Hiragana a katakana'],
  ['vocab-jp-en', 'Vocabulary (Japanese → English)', 'Slovíčka (japončina → angličtina)'],
  ['vocab-en-jp', 'Vocabulary (English → Japanese)', 'Slovíčka (angličtina → japončina)'],
  ['kanji-reading', 'Kanji readings', 'Čítanie kanji'],
  ['kanji-meaning', 'Kanji meanings', 'Významy kanji'],
  ['kanji-writing', 'Kanji writing', 'Písanie kanji'],
  ['verb-class', 'Verb classes', 'Slovesné triedy'],
  ['verb-conjugation', 'Verb conjugation', 'Časovanie slovies'],
  ['adjective', 'Adjectives', 'Prídavné mená'],
  ['particle', 'Particles', 'Častice'],
  ['grammar', 'Grammar patterns', 'Gramatické vzory'],
  ['counter', 'Numbers, counters & time', 'Čísla, počítacie slová a čas'],
  ['translation', 'Sentence translation', 'Preklad viet'],
];

/** The strings this screen asks for, as the seed has them in English. */
const ENGLISH: Record<string, string> = {
  ...Object.fromEntries(SECTIONS.map(([id, english]) => [`exam.section.${id}`, english])),
  'exam.part.1': 'Part 1',
  'exam.part.2': 'Part 2',
  'exam.play.tap': 'Tap to listen',
  'exam.play.playing': 'Playing…',
  'exam.play.again': 'Listen again?',
  'exam.play.unavailable': 'Recording unavailable',
  'common.lesson': 'Lesson {n}',
  'exam.heading': 'Exam',
  'exam.tagline':
    'Could you pass a test on the whole course? Built from its vocabulary, all {kanji} kanji, the conjugation charts, hand-written grammar questions and spoken vocabulary — Part 1 (Lessons {a}–{b}) and Part 2 ({c}–{d}).',
  'exam.bank': '{questions} · {sections} · {attempts}',
  'exam.bankQuestions.one': '1 question in the bank',
  'exam.bankQuestions.few': '{count} questions in the bank',
  'exam.bankQuestions.other': '{count} questions in the bank',
  'exam.bankSections.one': '1 section',
  'exam.bankSections.few': '{count} sections',
  'exam.bankSections.other': '{count} sections',
  'exam.bankAttempts.one': '1 attempt recorded',
  'exam.bankAttempts.few': '{count} attempts recorded',
  'exam.bankAttempts.other': '{count} attempts recorded',
  'exam.candidate': 'Your name',
  'exam.candidateNote': '(for the report)',
  'exam.optional': 'optional',
  'exam.partLabel': 'Part',
  'exam.partLine': '{questions} · {lessons}',
  'exam.partQuestions.one': '1 question',
  'exam.partQuestions.few': '{count} questions',
  'exam.partQuestions.other': '{count} questions',
  'exam.lessonRange': 'lessons {from}–{to}',
  'exam.length': 'Paper length',
  'exam.size.quick': 'Quick check · {n}',
  'exam.size.standard': 'Standard · {n}',
  'exam.size.full': 'Full exam · {n}',
  'exam.size.marathon': 'Marathon · {n}',
  'exam.narrow': 'Narrow the scope',
  'exam.lessons': 'Lessons',
  'exam.sections': 'Sections',
  'exam.all': 'all',
  'exam.none': 'none',
  'exam.greetings': 'Greetings',
  'exam.available': '{n} available',
  'exam.paperId': 'Paper ID',
  'exam.paperIdNote': '(reuse one to sit the identical paper again)',
  'exam.paperIdBlank': 'leave blank for a new paper',
  'exam.start': 'Start the test',
  'exam.building': 'Building the paper…',
  'exam.pastAttempts': 'Past attempts',
  'exam.history.date': 'Date',
  'exam.history.name': 'Name',
  'exam.history.questions': 'Qs',
  'exam.history.score': 'Score',
  'exam.history.grade': 'Grade',
  'exam.history.result': 'Result',
  'exam.history.report': 'Report',
  'exam.history.open': 'open',
  'exam.history.none': 'No attempts recorded yet.',
  'exam.percent': '{pct}%',
  'exam.error.load': 'Could not load the exam: {reason}',
  'exam.error.history': 'Could not load the past attempts: {reason}',
  'exam.error.noSections': 'Pick at least one section.',
  'exam.error.noLessons': 'Pick at least one lesson.',
  'exam.error.noQuestions': 'No questions match that scope.',
  'exam.error.score': 'Could not score the test: {reason}',
  'exam.finishNow': 'Finish now',
  'exam.confirmFinish.one': '1 question unanswered. Finish and score anyway?',
  'exam.confirmFinish.few': '{count} questions unanswered. Finish and score anyway?',
  'exam.confirmFinish.other': '{count} questions unanswered. Finish and score anyway?',
  'exam.playRecording': 'Play the recording',
  'exam.replayHint': 'press {key} to replay',
  'exam.back': 'Back',
  'exam.next': 'Next',
  'exam.finish': 'Finish',
  'exam.flag': 'flag for review',
  'exam.result.correct': 'Correct',
  'exam.result.unanswered': 'Unanswered',
  'exam.result.time': 'Time',
  'exam.result.perQuestion': 'Per question',
  'exam.result.bySkill': 'By skill',
  'exam.result.byLesson': 'By lesson',
  'exam.result.bar': '{pct}% ({right}/{total})',
  'exam.result.review': 'Review',
  'exam.result.missedOnly': 'Missed only',
  'exam.result.everything': 'Everything',
  'exam.result.rowLabel': 'Q{n} · {section}',
  'exam.result.listen': 'listen',
  'exam.result.you': 'You:',
  'exam.result.correctAnswer': 'Correct:',
  'exam.result.nothingMissed': 'Nothing missed.',
  'exam.result.openReport': 'Open full report',
  'exam.result.newTest': 'New test',
  'exam.result.saved': 'Attempt and its report saved ({id}).',
  'time.durationMinutes': '{m}m {s}s',
  'time.durationSeconds': '{s}s',
  'error.offline': 'The server does not answer.',
  'error.http': 'The server answered with an error ({status}).',
  'error.unknown': 'Something went wrong.',
  'error.database_unavailable': 'The database is not reachable.',
  'error.server_error': 'Something went wrong on the server.',
  'error.paper_mismatch': 'The submitted answers do not belong to this paper. Nothing was saved.',
  'language.button': 'Language: {name}',
  'language.notLoaded': 'The language could not be loaded. Try again.',
};

/** The same in Slovak: what the server would send a Slovak reader, English underneath where a string is not given here. */
const SLOVAK: Record<string, string> = {
  ...ENGLISH,
  ...Object.fromEntries(SECTIONS.map(([id, , slovak]) => [`exam.section.${id}`, slovak])),
  'exam.part.1': 'Časť 1',
  'exam.part.2': 'Časť 2',
  'exam.play.tap': 'Ťukni a vypočuj si nahrávku',
  'exam.play.playing': 'Prehráva sa…',
  'exam.play.again': 'Vypočuť znova?',
  'exam.play.unavailable': 'Nahrávka nie je dostupná',
  'common.lesson': 'Lekcia {n}',
  'exam.heading': 'Skúška',
  'exam.bankQuestions.one': '1 otázka v banke',
  'exam.bankQuestions.few': '{count} otázky v banke',
  'exam.bankQuestions.other': '{count} otázok v banke',
  'exam.bankSections.one': '1 oblasť',
  'exam.bankSections.few': '{count} oblasti',
  'exam.bankSections.other': '{count} oblastí',
  'exam.bankAttempts.one': '1 zaznamenaný pokus',
  'exam.bankAttempts.few': '{count} zaznamenané pokusy',
  'exam.bankAttempts.other': '{count} zaznamenaných pokusov',
  'exam.partQuestions.one': '1 otázka',
  'exam.partQuestions.few': '{count} otázky',
  'exam.partQuestions.other': '{count} otázok',
  'exam.lessonRange': 'lekcie {from} – {to}',
  'exam.size.quick': 'Rýchla kontrola · {n}',
  'exam.greetings': 'Pozdravy',
  'exam.available': 'dostupné otázky: {n}',
  'exam.history.open': 'otvoriť',
  'exam.percent': '{pct} %',
  'exam.error.load': 'Skúšku sa nepodarilo načítať: {reason}',
  'exam.error.noSections': 'Vyber aspoň jednu oblasť.',
  'exam.error.score': 'Test sa nepodarilo vyhodnotiť: {reason}',
  'exam.confirmFinish.one': '1 otázka je bez odpovede. Ukončiť a vyhodnotiť aj tak?',
  'exam.confirmFinish.few': '{count} otázky sú bez odpovede. Ukončiť a vyhodnotiť aj tak?',
  'exam.confirmFinish.other': '{count} otázok je bez odpovede. Ukončiť a vyhodnotiť aj tak?',
  'exam.playRecording': 'Prehrať nahrávku',
  'exam.replayHint': 'stlač {key} a nahrávka sa prehrá znova',
  'exam.result.bar': '{pct} % ({right}/{total})',
  'exam.result.rowLabel': 'Otázka {n} · {section}',
  'exam.result.you': 'Tvoja odpoveď:',
  'exam.result.correctAnswer': 'Správna odpoveď:',
  'exam.result.openReport': 'Otvoriť celú správu',
  'time.durationMinutes': '{m} min {s} s',
  'time.durationSeconds': '{s} s',
  'error.database_unavailable': 'Databáza nie je dostupná.',
  'error.server_error': 'Na serveri sa niečo pokazilo.',
  'error.paper_mismatch': 'Odoslané odpovede nepatria k tomuto testu. Nič sa neuložilo.',
};

/**
 * What GET /api/meta answers. Every name in it says "server": the page words
 * the parts, the sections and the lessons from their ids, and the names the
 * server sends beside them must never reach the page.
 */
const META: ExamMeta = {
  books: [
    { id: 1, name: 'server part', lessons: [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12], available: 5204, bySection: {} },
    { id: 2, name: 'server part', lessons: [13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23], available: 6319, bySection: {} },
  ],
  sections: SECTIONS.map(([id]) => ({ id, name: 'server section', audio: id.startsWith('listening'), available: id === 'particle' ? 1204 : 700 })),
  lessons: [
    { id: 0, name: 'server greetings', book: 1 },
    { id: 1, name: 'server lesson', book: 1 },
    { id: 6, name: 'server lesson', book: 1 },
    { id: 13, name: 'server lesson', book: 2 },
  ],
  bankSize: 11523,
  attempts: 3,
};

function question(n: number, over: Partial<ExamQuestion> = {}): ExamQuestion {
  return {
    n,
    id: `q${n}`,
    section: 'particle',
    sectionName: 'server section',
    lesson: 6,
    book: 1,
    question: `Which particle fits sentence ${n}?`,
    hint: null,
    reading: null,
    audio: null,
    options: ['は', 'が', 'を', 'に'],
    ...over,
  };
}

function paper(questions: ExamQuestion[]): ExamPaper {
  return { spec: { seed: 'abc' }, seed: 'abc', size: questions.length, createdAt: '2026-09-30T10:00:00.000Z', questions };
}

/** A listening question of the greetings, with options in both scripts and in English; then a plain one. */
const LISTENING = question(1, {
  section: 'listening-word',
  lesson: 0,
  question: 'Which word did you hear?',
  hint: 'listen, then choose',
  audio: 'clip-one',
  options: ['たべる', 'to eat', '食べる', 'taberu'],
});

const RESULT: ExamResult = {
  id: '2026-09-30T10-05-00-000Z-abc',
  summary: { total: 40, answered: 39, unanswered: 1, right: 29, wrong: 10, pct: 72.5, grade: 'B', passed: true, passMark: 60, totalMs: 65000, avgMs: 3400 },
  bySection: [
    { key: 'particle', name: 'server section', pct: 79.6, right: 4, total: 5 },
    { key: 'listening-word', name: 'server section', pct: 50, right: 1, total: 2 },
  ],
  byLesson: [
    { key: 0, name: 'server greetings', pct: 100, right: 2, total: 2 },
    { key: 6, name: 'server lesson', pct: 60, right: 3, total: 5 },
  ],
  byBook: [{ key: 1, name: 'server part', pct: 72.5, right: 29, total: 40 }],
  weakSections: [],
  weakLessons: [],
  reportUrl: '/report/2026-09-30T10-05-00-000Z-abc',
  review: [
    {
      n: 1,
      section: 'server section',
      sectionId: 'listening-word',
      lesson: 0,
      audio: 'clip-one',
      question: 'Which word did you hear?',
      chosen: 'to eat',
      correctAnswer: 'たべる',
      correct: false,
      explain: 'たべる is the word that was played.',
      ref: 'Lesson 3',
    },
    {
      n: 2,
      section: 'server section',
      sectionId: 'particle',
      lesson: 6,
      audio: null,
      question: 'Which particle fits sentence 2?',
      chosen: null,
      correctAnswer: 'を',
      correct: false,
      explain: 'を marks the object.',
      ref: null,
    },
    {
      n: 3,
      section: 'server section',
      sectionId: 'particle',
      lesson: 6,
      audio: null,
      question: 'Which particle fits sentence 3?',
      chosen: 'に',
      correctAnswer: 'に',
      correct: true,
      explain: 'に marks the place.',
      ref: null,
    },
  ],
};

describe('ExamComponent', () => {
  let fixture: ComponentFixture<ExamComponent>;
  let host: HTMLElement;
  let i18n: TranslationService;
  let api: { meta: ReturnType<typeof vi.fn>; paper: ReturnType<typeof vi.fn>; submit: ReturnType<typeof vi.fn>; attempts: ReturnType<typeof vi.fn> };
  let confirmBox: ReturnType<typeof vi.fn>;
  let alertBox: ReturnType<typeof vi.fn>;

  const one = (selector: string) => host.querySelector<HTMLElement>(selector)!;
  const all = (selector: string) => Array.from(host.querySelectorAll<HTMLElement>(selector));
  /** What an element says, its white space as plain spaces (Intl's no-break spaces stay what they are). */
  const said = (element: Element | null) => (element?.textContent ?? '').replace(/[ \t\r\n]+/g, ' ').trim();
  const text = (selector: string) => said(host.querySelector(selector));
  const texts = (selector: string) => all(selector).map(said);

  /** Everything the page has to say has been drawn: the answers the mocks gave have been taken in. */
  async function settle(): Promise<void> {
    await new Promise((done) => setTimeout(done));
    await fixture.whenStable();
  }

  async function open(language: 'en' | 'sk' = 'en'): Promise<void> {
    TestBed.configureTestingModule({
      providers: [
        provideZonelessChangeDetection(),
        language === 'en' ? provideTestTranslations(ENGLISH) : provideTestTranslations(SLOVAK, { language: 'sk', english: ENGLISH }),
        { provide: ApiService, useValue: api },
        { provide: PrivateLinksService, useValue: { click: vi.fn() } },
      ],
    });
    i18n = TestBed.inject(TranslationService);
    fixture = TestBed.createComponent(ExamComponent);
    host = fixture.nativeElement;
    document.body.appendChild(host);
    await settle();
  }

  /** The setup screen's Start, with the paper the server will answer. */
  async function start(questions: ExamQuestion[]): Promise<void> {
    api.paper.mockResolvedValue(paper(questions));
    one('#startBtn').click();
    await settle();
  }

  /** A key pressed on an element, as the browser sends it: it bubbles. */
  function press(on: EventTarget, key: string): void {
    on.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true }));
  }

  beforeEach(() => {
    localStorage.clear();
    api = { meta: vi.fn().mockResolvedValue(META), paper: vi.fn(), submit: vi.fn().mockResolvedValue(RESULT), attempts: vi.fn().mockResolvedValue([]) };
    confirmBox = vi.fn(() => true);
    alertBox = vi.fn();
    vi.stubGlobal('confirm', confirmBox);
    vi.stubGlobal('alert', alertBox);
    // jsdom has neither a player nor a page to scroll.
    vi.spyOn(window, 'scrollTo').mockImplementation(() => undefined);
    vi.spyOn(HTMLMediaElement.prototype, 'play').mockImplementation(() => Promise.resolve());
    vi.spyOn(HTMLMediaElement.prototype, 'pause').mockImplementation(() => undefined);
  });

  afterEach(() => {
    fixture?.destroy();
    host?.remove();
    localStorage.clear();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  /* ------------------------------------------------------------- setup */

  describe('the setup', () => {
    it('reads as it did in English: the heading, the tagline with its numbers from one constant, the paper lengths', async () => {
      await open();
      expect(text('.hero h1')).toBe('試験 Exam');
      expect(one('.hero h1 [lang]').getAttribute('lang'), 'the mark says it is Japanese').toBe('ja');
      expect(text('.tagline')).toBe(
        'Could you pass a test on the whole course? Built from its vocabulary, all 317 kanji, the conjugation charts, hand-written grammar questions and spoken vocabulary — Part 1 (Lessons 1–12) and Part 2 (13–23).',
      );
      expect(texts('#sizeChips .chip')).toEqual(['Quick check · 40', 'Standard · 120', 'Full exam · 250', 'Marathon · 500']);
      expect(all('#sizeChips .chip').map((chip) => chip.getAttribute('data-size'))).toEqual(['40', '120', '250', '500']);
      expect(text('#startBtn')).toBe('Start the test');
      expect(text('#historyBtn')).toBe('Past attempts');
      expect(one('#candidate').getAttribute('placeholder')).toBe('optional');
      expect(one('#seed').getAttribute('placeholder')).toBe('leave blank for a new paper');
      expect(text('#setupErr')).toBe('');
    });

    it('the bank line: three counts, each a phrase of its own, the numbers written as the language writes them', async () => {
      await open();
      expect(text('#bankLine')).toBe('11,523 questions in the bank · 15 sections · 3 attempts recorded');
    });

    it('the bank line in Slovak, each word agreeing with its own number — and following the language when it changes', async () => {
      await open('sk');
      expect(text('#bankLine')).toBe(`11${NBSP}523 otázok v banke · 15 oblastí · 3 zaznamenané pokusy`);

      // A computed over t() and plural(): no reload, no new request.
      await i18n.setLanguage('en', false);
      await settle();
      expect(text('#bankLine')).toBe('11,523 questions in the bank · 15 sections · 3 attempts recorded');
      expect(api.meta).toHaveBeenCalledTimes(1);
    });

    it('one attempt, no attempts: the form the number asks for', async () => {
      api.meta.mockResolvedValue({ ...META, attempts: 1 });
      await open('sk');
      expect(text('#bankLine')).toBe(`11${NBSP}523 otázok v banke · 15 oblastí · 1 zaznamenaný pokus`);
      await i18n.setLanguage('en', false);
      await settle();
      expect(text('#bankLine')).toBe('11,523 questions in the bank · 15 sections · 1 attempt recorded');
    });

    it('names the parts, the sections and the lessons from their ids — never with the names the server sends', async () => {
      await open();
      expect(texts('#bookChips .chip')).toEqual(['Part 1', 'Part 2']);
      expect(all('#bookChips .chip').map((chip) => chip.title)).toEqual(['5,204 questions · lessons 0–12', '6,319 questions · lessons 13–23']);
      expect(texts('#sectionChips .chip')).toEqual(SECTIONS.map(([, english]) => english));
      expect(one('#sectionChips [data-section="particle"]').title).toBe('1,204 available');
      // Part 1 is chosen at first: its lessons only.
      expect(texts('#lessonChips .chip')).toEqual(['Greetings (あいさつ)', 'L1', 'L6']);
      expect(all('#lessonChips .chip').map((chip) => chip.getAttribute('title'))).toEqual([null, 'Lesson 1', 'Lesson 6']);
      expect(host.textContent).not.toContain('server');
      expect(host.innerHTML).not.toContain('server');
    });

    it('the same in Slovak; the kana after the greetings says it is Japanese, whatever the page is in', async () => {
      await open('sk');
      expect(texts('#bookChips .chip')).toEqual(['Časť 1', 'Časť 2']);
      expect(all('#bookChips .chip').map((chip) => chip.title)).toEqual([`5${NBSP}204 otázok · lekcie 0 – 12`, `6${NBSP}319 otázok · lekcie 13 – 23`]);
      expect(texts('#sectionChips .chip')).toEqual(SECTIONS.map(([, , slovak]) => slovak));
      expect(one('#sectionChips [data-section="particle"]').title).toBe(`dostupné otázky: 1${NBSP}204`);
      expect(texts('#lessonChips .chip')).toEqual(['Pozdravy (あいさつ)', 'L1', 'L6']);
      expect(all('#lessonChips .chip').map((chip) => chip.getAttribute('title'))).toEqual([null, 'Lekcia 1', 'Lekcia 6']);
      expect(texts('#sizeChips .chip')[0]).toBe('Rýchla kontrola · 40');

      const kana = one('#lessonChips [data-lesson="0"] span');
      expect([kana.textContent, kana.getAttribute('lang')]).toEqual(['あいさつ', 'ja']);
      expect(host.innerHTML).not.toContain('server');
    });

    it('a failed load is worded from its code, inside the page’s own sentence — never the server’s English', async () => {
      api.meta.mockRejectedValue(
        new ApiError('The database is not reachable: secret sentence of the server', 503, {
          error: 'The database is not reachable: secret sentence of the server',
          code: 'database_unavailable',
        }),
      );
      await open('sk');
      expect(text('#setupErr')).toBe('Skúšku sa nepodarilo načítať: Databáza nie je dostupná.');
      expect(host.textContent).not.toContain('secret sentence');

      // State holds the key and the ApiError, not the sentence: it follows the language.
      await i18n.setLanguage('en', false);
      await settle();
      expect(text('#setupErr')).toBe('Could not load the exam: The database is not reachable.');
      expect(host.textContent).not.toContain('secret sentence');
    });

    it('no answer at all, and an answer that was not the app’s own', async () => {
      api.meta.mockRejectedValue(new ApiError('the server does not answer', 0, {}));
      await open();
      expect(text('#setupErr')).toBe('Could not load the exam: The server does not answer.');

      api.attempts.mockRejectedValue(new ApiError('Bad Gateway', 502, {}));
      one('#historyBtn').click();
      await settle();
      expect(text('#setupErr')).toBe('Could not load the past attempts: The server answered with an error (502).');
      expect(host.textContent).not.toContain('Bad Gateway');
    });

    it('the reason the server gives the owner’s own computer follows the page’s words, small and marked as English', async () => {
      api.meta.mockRejectedValue(new ApiError('Something went wrong on the server.', 500, { error: 'x', code: 'server_error', detail: 'Undefined index in exam.php' }));
      await open('sk');
      const detail = one('#setupErr .detail');
      expect([said(detail), detail.getAttribute('lang')]).toEqual(['Undefined index in exam.php', 'en']);
      expect(text('#setupErr')).toBe('Skúšku sa nepodarilo načítať: Na serveri sa niečo pokazilo. Undefined index in exam.php');
    });

    it('its own refusals are keys: nothing chosen, and a scope no question matches', async () => {
      await open();
      one('[data-none="sections"]').click();
      one('#startBtn').click();
      await settle();
      expect(text('#setupErr')).toBe('Pick at least one section.');
      expect(api.paper).not.toHaveBeenCalled();

      one('[data-all="sections"]').click();
      one('[data-none="lessons"]').click();
      one('#startBtn').click();
      await settle();
      expect(text('#setupErr')).toBe('Pick at least one lesson.');
      expect(api.paper).not.toHaveBeenCalled();

      one('[data-all="lessons"]').click();
      await start([]);
      expect(text('#setupErr')).toBe('No questions match that scope.');
      expect(one('#setup').hidden, 'still on the setup').toBe(false);
      expect(one('#startBtn').hasAttribute('disabled'), 'and Start can be pressed again').toBe(false);
    });

    it('a paper the server could not build says why in the page’s words alone', async () => {
      await open();
      api.paper.mockRejectedValue(new ApiError('boom: a sentence of the server', 500, { error: 'boom: a sentence of the server', code: 'server_error' }));
      one('#startBtn').click();
      await settle();
      expect(text('#setupErr')).toBe('Something went wrong on the server.');
      expect(host.textContent).not.toContain('boom');
      expect(one('#setup').hidden).toBe(false);
    });

    it('past attempts: the table’s words, the date and the numbers in the language, PASS and FAIL as marks, the report an English page', async () => {
      const attempts: Attempt[] = [
        { id: 'a 1', finishedAt: '2026-09-24T12:00:00.000Z', total: 40, right: 29, pct: 72.5, grade: 'B', passed: true, candidate: '' },
        { id: 'a2', finishedAt: '2026-09-23T09:30:00.000Z', total: 120, right: 50, pct: 41.7, grade: 'F', passed: false, candidate: 'Ada' },
      ];
      api.attempts.mockResolvedValue(attempts);
      await open('sk');
      one('#historyBtn').click();
      await settle();

      const cells = (row: number) => Array.from(all('table.data tbody tr')[row].querySelectorAll('td'));
      expect(cells(0).map(said)).toEqual([fmtDateTime(i18n, attempts[0].finishedAt), '—', '40', '72,5 %', 'B', 'PASS', 'otvoriť']);
      expect(cells(1).map(said).slice(1, 6)).toEqual(['Ada', '120', '41,7 %', 'F', 'FAIL']);
      expect(cells(0)[5].getAttribute('lang')).toBe('en');
      expect(cells(1)[5].classList.contains('fail')).toBe(true);
      const link = cells(0)[6].querySelector('a')!;
      expect([link.getAttribute('href'), link.getAttribute('hreflang')]).toEqual(['/report/a%201', 'en']);

      await i18n.setLanguage('en', false);
      await settle();
      expect(text('#historyPanel h2')).toBe('Past attempts');
      expect(texts('table.data th')).toEqual(['Date', 'Name', 'Qs', 'Score', 'Grade', 'Result', 'Report']);
      expect(cells(0).map(said)).toEqual([fmtDateTime(i18n, attempts[0].finishedAt), '—', '40', '72.5%', 'B', 'PASS', 'open']);
    });

    it('past attempts, none yet', async () => {
      await open();
      one('#historyBtn').click();
      await settle();
      expect(text('#historyBody')).toBe('No attempts recorded yet.');
    });
  });

  /* -------------------------------------------------------------- test */

  describe('the running exam', () => {
    it('words its chrome and names the section and the lesson from their ids', async () => {
      await open();
      await start([LISTENING, question(2)]);
      expect(one('#test').hidden).toBe(false);
      expect(text('#counter')).toBe('1 / 2');
      expect(text('#sectionTag')).toBe('Listening — the word');
      expect(text('#qLesson')).toBe('Greetings');
      expect(text('#quitBtn')).toBe('Finish now');
      expect(text('#prevBtn')).toBe('← Back');
      expect(text('#nextBtn')).toBe('Next →');
      expect(said(one('.flagwrap label'))).toBe('flag for review');
      expect(all('#gridNav button').map((button) => button.title)).toEqual(['Listening — the word', 'Particles']);

      one('#nextBtn').click();
      await settle();
      expect(text('#counter')).toBe('2 / 2');
      expect(text('#sectionTag')).toBe('Particles');
      expect(text('#qLesson')).toBe('Lesson 6');
      expect(text('#nextBtn')).toBe('Finish →');
      expect(host.innerHTML).not.toContain('server');
    });

    it('marks the material: the question and its hint are English, an option is Japanese or English by what it holds', async () => {
      await open('sk');
      await start([LISTENING, question(2)]);
      expect([text('#qText'), one('#qText').getAttribute('lang')]).toEqual(['Which word did you hear?', 'en']);
      expect([text('#qHint'), one('#qHint').getAttribute('lang')]).toEqual(['listen, then choose', 'en']);
      expect(all('#opts .opt .txt').map((option) => [said(option), option.getAttribute('lang')])).toEqual([
        ['たべる', 'ja'],
        ['to eat', 'en'],
        ['食べる', 'ja'],
        ['taberu', 'en'],
      ]);
      // The frame around it is Slovak.
      expect(text('#sectionTag')).toBe('Počúvanie – slovo');
      expect(text('#qLesson')).toBe('Pozdravy');
    });

    it('the player keeps a state, not a sentence: its words follow the language', async () => {
      await open('sk');
      await start([LISTENING, question(2)]);
      const audio = one('#audio');
      expect(text('#playState')).toBe('Prehráva sa…');
      expect(one('#playBtn').getAttribute('aria-label')).toBe('Prehrať nahrávku');

      audio.dispatchEvent(new Event('ended'));
      await settle();
      expect(text('#playState')).toBe('Vypočuť znova?');
      await i18n.setLanguage('en', false);
      await settle();
      expect(text('#playState')).toBe('Listen again?');

      audio.dispatchEvent(new Event('error'));
      await settle();
      expect(text('#playState')).toBe('Recording unavailable');
      expect(one('#player').classList.contains('err')).toBe(true);
    });

    it('a refused autoplay says "Tap to listen"', async () => {
      vi.mocked(HTMLMediaElement.prototype.play).mockImplementation(() => Promise.reject(new Error('NotAllowedError')));
      await open();
      await start([LISTENING]);
      expect(text('#playState')).toBe('Tap to listen');
    });

    it('the replay hint keeps its key in the middle of the sentence, wherever the language puts it', async () => {
      await open();
      await start([LISTENING]);
      expect(text('.playhint')).toBe('press R to replay');
      expect(said(one('.playhint kbd'))).toBe('R');

      fixture.destroy();
      host.remove();
      TestBed.resetTestingModule();
      await open('sk');
      await start([LISTENING]);
      expect(text('.playhint')).toBe('stlač R a nahrávka sa prehrá znova');
      expect(said(one('.playhint kbd'))).toBe('R');
    });

    it('switching the language during a paper changes words only: the question, the answers and the place stay', async () => {
      await open('sk');
      await start([question(1), question(2), question(3)]);
      one('#nextBtn').click();
      await settle();
      // Set as the answers are kept: choosing an option moves on by itself a moment later.
      fixture.componentInstance.answers.set({ q2: { choice: 2, ms: 5 } });
      fixture.componentInstance.toggleFlag();
      await settle();
      expect(text('#sectionTag')).toBe('Častice');

      await i18n.setLanguage('en', false);
      await settle();
      expect(text('#sectionTag')).toBe('Particles');
      expect(text('#counter')).toBe('2 / 3');
      expect(all('#opts .opt').map((option) => option.classList.contains('is-on'))).toEqual([false, false, true, false]);
      expect(all('#gridNav button').map((button) => Array.from(button.classList).sort().join(' '))).toEqual(['', 'cur done flag', '']);
      expect(api.paper).toHaveBeenCalledTimes(1);
      expect(api.meta).toHaveBeenCalledTimes(1);
    });
  });

  /* ----------------------------------------------------------- dialogs */

  describe('the native dialogs', () => {
    it('finishing with questions unanswered asks first, worded when it is raised: a plural family', async () => {
      confirmBox.mockReturnValue(false);
      await open();
      await start([question(1), question(2), question(3)]);
      one('#quitBtn').click();
      expect(confirmBox).toHaveBeenLastCalledWith('3 questions unanswered. Finish and score anyway?');
      expect(api.submit, 'Cancel: nothing is sent').not.toHaveBeenCalled();

      // Set as the answers are kept: choosing an option moves on by itself a moment later.
      fixture.componentInstance.answers.set({ q1: { choice: 0, ms: 5 }, q2: { choice: 3, ms: 5 } });
      one('#quitBtn').click();
      expect(confirmBox).toHaveBeenLastCalledWith('1 question unanswered. Finish and score anyway?');
    });

    it('in Slovak the verb agrees with the count too', async () => {
      confirmBox.mockReturnValue(false);
      await open('sk');
      await start([question(1), question(2), question(3), question(4), question(5)]);
      one('#quitBtn').click();
      expect(confirmBox).toHaveBeenLastCalledWith('5 otázok je bez odpovede. Ukončiť a vyhodnotiť aj tak?');
      fixture.componentInstance.answers.set({ q1: { choice: 0, ms: 5 } });
      one('#quitBtn').click();
      expect(confirmBox).toHaveBeenLastCalledWith('4 otázky sú bez odpovede. Ukončiť a vyhodnotiť aj tak?');

      // The words are made at the moment the dialog is raised: the next one is in the new language.
      await i18n.setLanguage('en', false);
      one('#quitBtn').click();
      expect(confirmBox).toHaveBeenLastCalledWith('4 questions unanswered. Finish and score anyway?');
    });

    it('every question answered: no dialog, the paper is handed in', async () => {
      await open();
      await start([question(1)]);
      fixture.componentInstance.choose(1);
      one('#quitBtn').click();
      await settle();
      expect(confirmBox).not.toHaveBeenCalled();
      expect(api.submit).toHaveBeenCalledTimes(1);
      expect(api.submit.mock.calls[0][0].spec, 'the spec echoed as it came').toEqual({ seed: 'abc' });
    });

    it('a paper that could not be scored: the page’s own sentence around the failure’s, never the server’s', async () => {
      const refusal = 'The submitted answers do not belong to this paper (3 unknown question id(s)). Nothing was saved.';
      api.submit.mockRejectedValue(new ApiError(refusal, 409, { error: refusal, code: 'paper_mismatch' }));
      await open('sk');
      await start([question(1)]);
      fixture.componentInstance.choose(1);
      one('#nextBtn').click();
      await settle();
      expect(alertBox).toHaveBeenCalledTimes(1);
      expect(alertBox).toHaveBeenLastCalledWith('Test sa nepodarilo vyhodnotiť: Odoslané odpovede nepatria k tomuto testu. Nič sa neuložilo.');
      expect(one('#test').hidden, 'the paper stays on the screen').toBe(false);
      expect(one('#quitBtn').hasAttribute('disabled'), 'and can be handed in again').toBe(false);
    });

    it('on the owner’s own computer the server’s reason follows the page’s words in the dialog', async () => {
      api.submit.mockRejectedValue(new ApiError('x', 500, { error: 'x', code: 'server_error', detail: 'Undefined index in score.php' }));
      await open();
      await start([question(1)]);
      fixture.componentInstance.choose(1);
      one('#nextBtn').click();
      await settle();
      expect(alertBox).toHaveBeenLastCalledWith('Could not score the test: Something went wrong on the server.\n\nUndefined index in score.php');
    });
  });

  /* ------------------------------------------------------------ result */

  describe('the result', () => {
    async function finished(language: 'en' | 'sk' = 'en'): Promise<void> {
      await open(language);
      await start([question(1)]);
      fixture.componentInstance.choose(1);
      one('#nextBtn').click();
      await settle();
      expect(one('#result').hidden).toBe(false);
    }

    it('the verdict: the words around the marks are the page’s, PASS and the grade are marks', async () => {
      await finished();
      expect(text('.bigscore')).toBe('72.5%');
      expect([text('.stamp'), one('.stamp').getAttribute('lang')]).toEqual(['PASS · B', 'en']);
      expect(texts('.vfacts .k')).toEqual(['Correct', 'Unanswered', 'Time', 'Per question']);
      expect(texts('.vfacts .v')).toEqual(['29 / 40', '1', '1m 5s', '3.4s']);
      expect(texts('#result h2')).toEqual(['By skill', 'By lesson', 'Review']);
      expect(text('#againBtn')).toBe('New test');
      expect(text('#savedLine')).toBe('Attempt and its report saved (2026-09-30T10-05-00-000Z-abc).');
    });

    it('in Slovak the numbers and the units are written the Slovak way; the marks stay', async () => {
      await finished('sk');
      expect(text('.bigscore')).toBe('72,5%');
      expect([text('.stamp'), one('.stamp').getAttribute('lang')]).toEqual(['PASS · B', 'en']);
      expect(texts('.vfacts .v')).toEqual(['29 / 40', '1', '1 min 5 s', '3,4 s']);
      expect(texts('#bySection .bpct')).toEqual(['80 % (4/5)', '50 % (1/2)']);
    });

    it('the bars are named from their keys: a section’s id, a lesson’s number', async () => {
      await finished();
      expect(texts('#bySection .bname')).toEqual(['Particles', 'Listening — the word']);
      expect(texts('#bySection .bpct')).toEqual(['80% (4/5)', '50% (1/2)']);
      expect(all('#bySection .bfill').map((bar) => bar.className)).toEqual(['bfill good', 'bfill bad']);
      expect(texts('#byLesson .bname')).toEqual(['Greetings', 'Lesson 6']);
      expect(texts('#byLesson .bpct')).toEqual(['100% (2/2)', '60% (3/5)']);
      expect(host.innerHTML).not.toContain('server');
    });

    it('the review: the app’s label in the page’s language, the question and the explanation English, each answer by what it holds', async () => {
      await finished('sk');
      const rows = all('#review .rev');
      expect(rows.length, 'the missed ones only, at first').toBe(2);

      const first = rows[0];
      expect(first.querySelector('.rq')!.getAttribute('lang')).toBe('en');
      const label = first.querySelector('.rn')!;
      expect([said(label), label.getAttribute('lang')]).toEqual(['Otázka 1 · Počúvanie – slovo', 'sk']);
      expect(said(first.querySelector('.rq'))).toContain('Which word did you hear?');
      const listen = first.querySelector('.miniplay')!;
      expect([listen.getAttribute('lang'), listen.getAttribute('aria-label'), said(listen)]).toEqual(['sk', 'Prehrať nahrávku', '▶ listen']);

      expect(said(first.querySelector('.mine'))).toBe('Tvoja odpoveď: to eat');
      expect(first.querySelector('.mine b')!.getAttribute('lang')).toBe('en');
      expect(said(first.querySelector('.sol'))).toBe('Správna odpoveď: たべる');
      expect(first.querySelector('.sol b')!.getAttribute('lang')).toBe('ja');
      const why = first.querySelector('.rw')!;
      expect([said(why), why.getAttribute('lang')]).toEqual(['たべる is the word that was played. · Lesson 3', 'en']);

      // No answer given: a dash, which is in no language.
      const second = rows[1];
      expect(said(second.querySelector('.mine'))).toBe('Tvoja odpoveď: —');
      expect(second.querySelector('.mine b')!.hasAttribute('lang')).toBe(false);
      expect(second.querySelector('.miniplay')).toBeNull();
      expect(said(second.querySelector('.rw'))).toBe('を marks the object.');
      expect(host.innerHTML).not.toContain('server');
    });

    it('"Everything" shows the right ones too, and their labels follow the language', async () => {
      await finished();
      expect(texts('.revfilter .chip')).toEqual(['Missed only', 'Everything']);
      one('[data-rev="all"]').click();
      await settle();
      expect(texts('#review .rn')).toEqual(['Q1 · Listening — the word', 'Q2 · Particles', 'Q3 · Particles']);
      expect(all('#review .rn').map((label) => label.getAttribute('lang'))).toEqual(['en', 'en', 'en']);
      expect(all('#review .rev')[2].querySelector('.sol'), 'a right answer needs no correction').toBeNull();
    });

    it('nothing missed says so', async () => {
      api.submit.mockResolvedValue({ ...RESULT, review: RESULT.review.filter((row) => row.correct) });
      await finished();
      expect(text('#review')).toBe('Nothing missed.');
    });

    it('the report stays the server’s English page: the link is translated and says which language it leads to', async () => {
      await finished('sk');
      const link = one('#reportLink');
      expect(said(link)).toBe('Otvoriť celú správu');
      expect([link.getAttribute('hreflang'), link.getAttribute('href'), link.getAttribute('target')]).toEqual(['en', '/report/2026-09-30T10-05-00-000Z-abc', '_blank']);
    });
  });

  /* -------------------------------------------------------------- keys */

  describe('the keys', () => {
    it('a key pressed inside the language chooser never reaches the paper: nothing is chosen, nothing handed in', async () => {
      await open('sk');
      await start([question(1)]);
      const chooser = TestBed.createComponent(LanguageChooserComponent);
      document.body.appendChild(chooser.nativeElement);
      await chooser.whenStable();
      const menu = (chooser.nativeElement as HTMLElement).querySelector<HTMLDetailsElement>('details')!;
      const summary = menu.querySelector<HTMLElement>('summary')!;
      const items = Array.from(menu.querySelectorAll<HTMLElement>('.umenu button'));
      menu.open = true;

      // The one question is the last: Enter on the page would hand the paper in.
      for (const key of ['Enter', ' ', '1', '2', 'a', 'd', 'f', 'r', 'ArrowLeft', 'ArrowRight']) {
        press(summary, key);
        press(items[0], key);
      }
      await settle();
      expect(api.submit).not.toHaveBeenCalled();
      expect(all('#opts .is-on').length, 'no option chosen').toBe(0);
      expect(all('#gridNav .flag').length, 'not flagged').toBe(0);
      expect(one('#test').hidden).toBe(false);

      // The same keys anywhere else are the paper's.
      press(document.body, '2');
      await settle();
      expect(all('#opts .opt').map((option) => option.classList.contains('is-on'))).toEqual([false, true, false, false]);
      press(document.body, 'Enter');
      await settle();
      expect(api.submit).toHaveBeenCalledTimes(1);

      chooser.destroy();
      (chooser.nativeElement as HTMLElement).remove();
    });
  });
});
