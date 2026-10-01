import { provideZonelessChangeDetection } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { ApiError, ApiService } from '../../core/api/api.service';
import { CatalogItem, ItemState } from '../../core/api/api.types';
import { AudioService } from '../../core/audio.service';
import { TranslationService } from '../../core/i18n/translation.service';
import { provideTestTranslations } from '../../core/testing/test-translations';
import { KanjiStateService } from '../kanji-state.service';
import { SessionResult } from './session-engine';
import { SessionComponent } from './session.component';

const ENGLISH: Record<string, string> = {
  'session.mode.lesson': 'Lesson quiz',
  'session.mode.review': 'Reviews',
  'session.mode.practice': 'Practice',
  'session.note.lesson': 'Get each one right once to learn it.',
  'session.note.practice': 'Practice never changes your SRS schedule.',
  'session.done': '{n} done',
  'session.left': '{n} left',
  'session.accuracy': '{pct}%',
  'session.wrapUp': 'Wrap up',
  'session.wrappingUp': 'Wrapping up…',
  'session.end': 'End',
  'session.placeholder.meaning': 'Answer in English',
  'session.placeholder.reading': 'Type the reading — romaji turns into kana',
  'session.yourAnswer': 'Your answer',
  'session.submit': 'Submit',
  'session.closeEnough': "Close enough — it's “{expected}”.",
  'session.theAnswer': 'The answer: {expected}',
  'session.synonymAdded': 'Added “{typed}” as one of your synonyms for {chars}.',
  'session.readingAdded': 'Added {typed} as an accepted reading for {chars}.',
  'session.notSaved': 'Could not save that: {reason}',
  'session.saving': 'Saving…',
  'session.itemInfo': 'Item info',
  'session.myAnswerWasRight': 'My answer was right',
  'session.confirmEnd.one': 'Stop now? 1 half-answered item will not be saved.',
  'session.confirmEnd.few': 'Stop now? {count} half-answered items will not be saved.',
  'session.confirmEnd.other': 'Stop now? {count} half-answered items will not be saved.',
  'kanji.type.kanji': 'Kanji',
  'kanji.type.vocab': 'Vocabulary',
  'kanji.meaning': 'Meaning',
  'kanji.reading': 'Reading',
  'kanji.listen': '▶ Listen',
  'answer.check.readingEmpty': 'Type the reading first.',
  'answer.check.readingUnfinished': 'Finish typing the reading in kana.',
  'answer.check.readingInKanji': 'Type the reading in kana, not kanji.',
  'answer.check.meaningNotEnglish': 'We want the meaning in English.',
  'answer.check.meaningEmpty': 'Type the meaning first.',
  'error.offline': 'The server does not answer.',
  'error.not_learned': 'Only learned items can be practised.',
  'error.unknown': 'Something went wrong.',
};

const SLOVAK: Record<string, string> = {
  ...ENGLISH,
  'session.mode.practice': 'Precvičovanie',
  'session.note.practice': 'Precvičovanie nikdy nemení tvoj plán opakovaní SRS.',
  'session.done': 'Hotovo: {n}',
  'session.left': 'Zostáva: {n}',
  'session.accuracy': '{pct} %',
  'session.end': 'Skončiť',
  'session.placeholder.meaning': 'Odpovedz po anglicky',
  'session.placeholder.reading': 'Napíš čítanie – romaji sa zmení na kanu',
  'session.yourAnswer': 'Tvoja odpoveď',
  'session.submit': 'Odoslať',
  'session.closeEnough': 'Skoro – správne je „{expected}“.',
  'session.theAnswer': 'Správna odpoveď: {expected}',
  'session.synonymAdded': 'Pridané medzi tvoje synonymá: „{typed}“ ({chars}).',
  'session.notSaved': 'Nepodarilo sa to uložiť: {reason}',
  'session.saving': 'Ukladá sa…',
  'session.confirmEnd.one': 'Skončiť teraz? 1 rozpracovaná položka sa neuloží.',
  'session.confirmEnd.few': 'Skončiť teraz? {count} rozpracované položky sa neuložia.',
  'session.confirmEnd.other': 'Skončiť teraz? {count} rozpracovaných položiek sa neuloží.',
  'kanji.type.vocab': 'Slovíčka',
  'kanji.meaning': 'Význam',
  'kanji.reading': 'Čítanie',
  'answer.check.meaningEmpty': 'Najprv napíš význam.',
  'answer.check.readingInKanji': 'Čítanie napíš v kane, nie v kanji.',
  'error.offline': 'Server neodpovedá.',
  'error.not_learned': 'Precvičovať sa dajú len naučené položky.',
};

const WORD: CatalogItem = {
  id: 'v:大学',
  type: 'vocab',
  chars: '大学',
  lesson: 3,
  courseLesson: 3,
  order: 2,
  meanings: ['university; college'],
  readings: ['だいがく'],
  kanji: ['大', '学'],
  audio: null,
};
const ONE: CatalogItem = {
  id: 'k:一',
  type: 'kanji',
  chars: '一',
  no: 1,
  lesson: 3,
  courseLesson: 3,
  order: 1,
  meanings: ['one'],
  readings: ['いち', 'いつ', 'ひと'],
  on: ['いち', 'いつ'],
  kun: ['ひと'],
  audio: null,
};

const STATE = { stage: 1, synonyms: [], extraReadings: [] } as unknown as ItemState;

describe('SessionComponent', () => {
  let fixture: ComponentFixture<SessionComponent>;
  let host: HTMLElement;
  let api: { item: ReturnType<typeof vi.fn>; learn: ReturnType<typeof vi.fn>; review: ReturnType<typeof vi.fn>; practice: ReturnType<typeof vi.fn> };
  let results: SessionResult[];
  let warn: ReturnType<typeof vi.spyOn>;

  const q = <T extends HTMLElement>(selector: string): T => host.querySelector<T>(selector) as T;
  const text = (selector: string): string => q(selector).textContent ?? '';
  const answerField = (): HTMLInputElement => q<HTMLInputElement>('.s-input');
  const feedback = (): HTMLElement => q('.s-feedback');
  /** The pieces of the feedback that say a language: [text, lang]. */
  const marked = (): (string | null)[][] =>
    Array.from(feedback().querySelectorAll('span[lang]')).map((span) => [span.textContent, span.getAttribute('lang')]);

  /** Lets the saves that are out land, and what waits for them run. */
  const settle = (): Promise<void> => new Promise((resolve) => setTimeout(resolve, 0));

  /** Enter in the answer field: checks the answer, and on an answered card goes on to the next. */
  async function enter(): Promise<void> {
    answerField().dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true }));
    await fixture.whenStable();
  }

  async function answer(typed: string): Promise<void> {
    answerField().value = typed;
    await enter();
  }

  async function start(items: CatalogItem[], options: { slovak?: boolean; mode?: 'lesson' | 'review' | 'practice' } = {}): Promise<void> {
    TestBed.configureTestingModule({
      providers: [
        provideZonelessChangeDetection(),
        options.slovak ? provideTestTranslations(SLOVAK, { language: 'sk', english: ENGLISH }) : provideTestTranslations(ENGLISH),
        { provide: ApiService, useValue: api },
        { provide: AudioService, useValue: { play: vi.fn() } },
      ],
    });
    TestBed.inject(KanjiStateService).items.set([ONE, WORD]);
    fixture = TestBed.createComponent(SessionComponent);
    fixture.componentRef.setInput('mode', options.mode ?? 'practice');
    fixture.componentRef.setInput('items', items);
    fixture.componentRef.setInput('shuffle', false);
    fixture.componentInstance.done.subscribe((result) => results.push(result));
    host = fixture.nativeElement;
    document.body.appendChild(host);
    await fixture.whenStable();
  }

  beforeEach(() => {
    results = [];
    api = {
      item: vi.fn(() => Promise.resolve({ state: STATE })),
      learn: vi.fn(() => Promise.resolve({ state: STATE })),
      review: vi.fn(() => Promise.resolve({ state: STATE, from: 1, to: 2 })),
      practice: vi.fn(() => Promise.resolve({ state: STATE })),
    };
    warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
  });

  afterEach(() => {
    fixture.destroy();
    host.remove();
    vi.restoreAllMocks();
  });

  it('words its frame from keys: the mode, the counts, what is asked, the field and its button', async () => {
    await start([WORD]);
    expect(text('.s-mode')).toBe('Practice');
    expect(text('.s-count')).toBe('0 done · 1 left');
    expect(Array.from(host.querySelectorAll('.s-count b')).map((b) => b.textContent)).toEqual(['0', '1']);
    expect(text('.s-acc')).toBe('—');
    expect(text('.s-note')).toBe('Practice never changes your SRS schedule.');
    expect(text('.s-type')).toBe('Vocabulary');
    expect(text('.s-ask')).toBe('Meaning');
    expect(answerField().placeholder).toBe('Answer in English');
    expect(answerField().getAttribute('aria-label')).toBe('Your answer');
    expect(q('.s-go').getAttribute('aria-label')).toBe('Submit');
    expect(q('.s-chars').getAttribute('lang')).toBe('ja');
    expect(feedback().textContent).toBe('');
    expect(warn, 'no key of the session is without a string').not.toHaveBeenCalled();
  });

  it('reads the same in Slovak, with the number where Slovak puts it', async () => {
    await start([WORD], { slovak: true });
    expect(text('.s-mode')).toBe('Precvičovanie');
    expect(text('.s-count')).toBe('Hotovo: 0 · Zostáva: 1');
    expect(Array.from(host.querySelectorAll('.s-count b')).map((b) => b.textContent)).toEqual(['0', '1']);
    expect(text('.s-type')).toBe('Slovíčka');
    expect(text('.s-ask')).toBe('Význam');
    expect(answerField().placeholder).toBe('Odpovedz po anglicky');
    await answer('zebra');
    expect(text('.s-acc')).toBe('0 %');
  });

  it('says what to do instead of an answer that is not one, from the kind of the check', async () => {
    await start([WORD]);
    await answer('');
    expect(feedback().textContent).toBe('Type the meaning first.');
    await answer('だいがく');
    expect(feedback().textContent).toBe('We want the meaning in English.');
    expect(q('.session').classList.contains('is-wrong'), 'an invalid answer is not a wrong one').toBe(false);
    expect(text('.s-acc')).toBe('—');
  });

  it('shows the right answer after a miss: the app’s words, and the material in a span that says English', async () => {
    await start([WORD]);
    await answer('zebra');
    expect(q('.session').classList.contains('is-wrong')).toBe(true);
    expect(feedback().textContent).toBe('The answer: university; college');
    expect(marked()).toEqual([['university; college', 'en']]);
    expect(text('.s-acc')).toBe('0%');
  });

  it('asks the reading in a field that says Japanese, with the right reading in a span that says so too', async () => {
    await start([WORD]);
    await answer('university');
    expect(q('.session').classList.contains('is-correct')).toBe(true);
    expect(answerField().lang).toBe('en');
    await enter(); // on to the reading
    expect(text('.s-ask')).toBe('Reading');
    expect(answerField().placeholder).toBe('Type the reading — romaji turns into kana');
    expect(answerField().lang).toBe('ja');
    await answer('大学');
    expect(feedback().textContent).toBe('Type the reading in kana, not kanji.');
    await answer('ねこ');
    expect(feedback().textContent).toBe('The answer: だいがく');
    expect(marked()).toEqual([['だいがく', 'ja']]);
  });

  it('puts the meaning field back to English after a reading', async () => {
    await start([WORD, ONE]);
    await answer('university');
    await enter();
    await answer('だいがく');
    await enter(); // the next item: its meaning
    expect(text('.s-ask')).toBe('Meaning');
    expect(answerField().lang).toBe('en');
    expect(answerField().placeholder).toBe('Answer in English');
  });

  it('forgives a typo, and says what it should have been', async () => {
    await start([WORD]);
    await answer('univercity');
    expect(q('.session').classList.contains('is-close')).toBe(true);
    expect(feedback().textContent).toBe("Close enough — it's “university; college”.");
    expect(marked()).toEqual([['university; college', 'en']]);
  });

  it('holds the feedback as a key: it follows the language when that changes under it', async () => {
    await start([WORD], { slovak: true });
    await answer('zebra');
    expect(feedback().textContent).toBe('Správna odpoveď: university; college');
    expect(marked()).toEqual([['university; college', 'en']]);

    await TestBed.inject(TranslationService).setLanguage('en', false);
    await fixture.whenStable();
    expect(feedback().textContent).toBe('The answer: university; college');
    expect(text('.s-count')).toBe('0 done · 1 left');
    expect(answerField().value, 'the card is as it was').toBe('zebra');
  });

  it('"My answer was right": says what was added, the typed text and the characters each in their language', async () => {
    await start([WORD]);
    await answer('zebra');
    await fixture.componentInstance.acceptMine();
    await fixture.whenStable();
    expect(api.item).toHaveBeenCalledWith('v:大学', { addSynonym: 'zebra' });
    expect(q('.session').classList.contains('is-correct')).toBe(true);
    expect(feedback().textContent).toBe('Added “zebra” as one of your synonyms for 大学.');
    expect(marked()).toEqual([
      ['zebra', 'en'],
      ['大学', 'ja'],
    ]);
  });

  it('a save that fails is worded from its code, never with the server’s English sentence', async () => {
    api.item.mockImplementation(() => Promise.reject(new ApiError('Only learned items can be practised.', 409, { error: 'Only learned items can be practised.', code: 'not_learned' })));
    await start([WORD], { slovak: true });
    await answer('zebra');
    await fixture.componentInstance.acceptMine();
    await fixture.whenStable();
    expect(feedback().textContent).toBe('Nepodarilo sa to uložiť: Precvičovať sa dajú len naučené položky.');
    expect(q('.session').classList.contains('is-wrong'), 'the miss stands').toBe(true);

    api.item.mockImplementation(() => Promise.reject(new ApiError('the server does not answer', 0, {})));
    await fixture.componentInstance.acceptMine();
    await fixture.whenStable();
    expect(feedback().textContent).toBe('Nepodarilo sa to uložiť: Server neodpovedá.');
  });

  it('says "Saving…" and nothing else while the last answers are on their way, then hands over the result', async () => {
    let saved: (value: { state: ItemState }) => void = () => undefined;
    api.practice.mockImplementation(() => new Promise((resolve) => (saved = resolve)));
    await start([WORD]);
    await answer('university');
    await enter();
    await answer('だいがく');
    await enter(); // the last card: the session is over, its save still out
    // the browser suite reads exactly this
    expect(feedback().textContent).toBe('Saving…');
    expect(results).toEqual([]);

    saved({ state: STATE });
    await settle();
    expect(results.length).toBe(1);
    expect(results[0]).toMatchObject({ mode: 'practice', answered: 2, right: 2, unfinished: 0, early: false });
    expect(results[0].done[0].error).toBeUndefined();
  });

  it('keeps a failed save as the failure itself, for the summary to word', async () => {
    const refused = new ApiError('That item is not due for review.', 409, { error: 'That item is not due for review.', code: 'not_due' });
    api.review.mockImplementation(() => Promise.reject(refused));
    await start([WORD], { mode: 'review' });
    await answer('university');
    await enter();
    await answer('だいがく');
    await enter();
    await settle();
    expect(results.length).toBe(1);
    expect(results[0].done[0].error).toBe(refused);
    expect(results[0].done[0].error?.code).toBe('not_due');
  });

  it('asks before losing a half-answered item, in the browser’s own dialog, worded when it is raised', async () => {
    const asked: string[] = [];
    vi.spyOn(window, 'confirm').mockImplementation((message?: string) => (asked.push(String(message)), false));
    await start([WORD], { slovak: true });
    await answer('university');
    await enter(); // the meaning is right, the reading not answered: half answered
    q<HTMLButtonElement>('.s-top button:last-of-type').click();
    await fixture.whenStable();
    expect(asked).toEqual(['Skončiť teraz? 1 rozpracovaná položka sa neuloží.']);
    expect(results, 'refused: the session goes on').toEqual([]);

    // the same dialog after the language changed: worded anew, not kept from before
    await TestBed.inject(TranslationService).setLanguage('en', false);
    q<HTMLButtonElement>('.s-top button:last-of-type').click();
    expect(asked[1]).toBe('Stop now? 1 half-answered item will not be saved.');
  });

  it('does not ask when nothing is half answered', async () => {
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(true);
    await start([WORD]);
    q<HTMLButtonElement>('.s-top button:last-of-type').click();
    await settle();
    expect(confirm).not.toHaveBeenCalled();
    expect(results.length).toBe(1);
    expect(results[0]).toMatchObject({ early: true, unfinished: 0 });
  });

  it('names the kanji’s two kinds of reading in the right answer', async () => {
    await start([ONE]);
    await answer('one');
    await enter();
    await answer('ねこ');
    expect(feedback().textContent).toBe('The answer: on: いち、いつ  ·  kun: ひと');
    expect(marked()).toEqual([['on: いち、いつ  ·  kun: ひと', 'ja']]);
    expect(text('.s-type')).toBe('Kanji');
  });
});
