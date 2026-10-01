import { provideZonelessChangeDetection } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { TranslationService } from '../../../core/i18n/translation.service';
import { provideTestTranslations } from '../../../core/testing/test-translations';
import { Part, wordedParts } from './worded-parts';
import { WordedComponent } from './worded.component';

const ENGLISH = {
  'session.theAnswer': 'The answer: {expected}',
  'session.closeEnough': 'Close enough — it’s “{expected}”.',
  'session.synonymAdded': 'Added “{typed}” as one of your synonyms for {chars}.',
  'session.saving': 'Saving…',
  'practice.scope.guruUp': '{stage} and above',
  'practice.info': '{matches}; this session will ask {take}.',
};
const SLOVAK = {
  'session.theAnswer': 'Správna odpoveď: {expected}',
  'session.closeEnough': 'Skoro – správne je „{expected}“.',
  'session.synonymAdded': 'Pridané medzi tvoje synonymá: „{typed}“ ({chars}).',
  // a Slovak string may leave a placeholder out
  'practice.scope.guruUp': 'vyššie úrovne',
};

const words = (text: string): Part => ({ text, lang: null });
const ja = (text: string): Part => ({ text, lang: 'ja' });
const en = (text: string): Part => ({ text, lang: 'en' });

describe('wordedParts', () => {
  let i18n: TranslationService;

  function setUp(slovak = false): void {
    TestBed.configureTestingModule({
      providers: [provideZonelessChangeDetection(), slovak ? provideTestTranslations(SLOVAK, { language: 'sk', english: ENGLISH }) : provideTestTranslations(ENGLISH)],
    });
    i18n = TestBed.inject(TranslationService);
    vi.spyOn(console, 'warn').mockImplementation(() => undefined);
  }

  afterEach(() => vi.restoreAllMocks());

  it('cuts a sentence where its material stands, and says which language that is in', () => {
    setUp();
    expect(wordedParts(i18n, 'session.theAnswer', { expected: ja('いち、いつ') })).toEqual([words('The answer: '), ja('いち、いつ')]);
    expect(wordedParts(i18n, 'session.closeEnough', { expected: en('one') })).toEqual([words('Close enough — it’s “'), en('one'), words('”.')]);
    expect(wordedParts(i18n, 'practice.scope.guruUp', { stage: en('Guru') })).toEqual([en('Guru'), words(' and above')]);
  });

  it('takes more than one piece of material, each where the language puts it', () => {
    setUp();
    const marks = { typed: en('numero uno'), chars: ja('一') };
    expect(wordedParts(i18n, 'session.synonymAdded', marks)).toEqual([words('Added “'), en('numero uno'), words('” as one of your synonyms for '), ja('一'), words('.')]);
    // the order of the marks does not matter: the string decides where each stands
    expect(wordedParts(i18n, 'session.synonymAdded', { chars: ja('一'), typed: en('numero uno') })).toEqual(wordedParts(i18n, 'session.synonymAdded', marks));
  });

  it('words the same sentence in Slovak, the material unchanged', () => {
    setUp(true);
    expect(wordedParts(i18n, 'session.theAnswer', { expected: ja('いち') })).toEqual([words('Správna odpoveď: '), ja('いち')]);
    expect(wordedParts(i18n, 'session.synonymAdded', { typed: en('numero uno'), chars: ja('一') })).toEqual([
      words('Pridané medzi tvoje synonymá: „'),
      en('numero uno'),
      words('“ ('),
      ja('一'),
      words(').'),
    ]);
  });

  it('never reads what a mark or a parameter holds as a placeholder', () => {
    setUp();
    // what the learner typed looks like the other placeholder: it stays what was typed
    expect(wordedParts(i18n, 'session.synonymAdded', { typed: words('{chars}'), chars: ja('一') })).toEqual([
      words('Added “'),
      words('{chars}'),
      words('” as one of your synonyms for '),
      ja('一'),
      words('.'),
    ]);
    expect(wordedParts(i18n, 'session.synonymAdded', { chars: ja('{typed}'), typed: en('x') }).map((p) => p.text)).toEqual([
      'Added “',
      'x',
      '” as one of your synonyms for ',
      '{typed}',
      '.',
    ]);
  });

  it('fills the other placeholders as t() does', () => {
    setUp();
    expect(wordedParts(i18n, 'practice.info', {}, { matches: '5 items match', take: 5 })).toEqual([words('5 items match; this session will ask 5.')]);
    expect(wordedParts(i18n, 'session.saving', {})).toEqual([words('Saving…')]);
  });

  it('does not draw a mark the string leaves out — nor any, for a key with no string', () => {
    setUp(true);
    expect(wordedParts(i18n, 'practice.scope.guruUp', { stage: en('Guru') })).toEqual([words('vyššie úrovne')]);
    expect(wordedParts(i18n, 'session.nowhere', { expected: ja('いち') })).toEqual([words('session.nowhere')]);
    expect(wordedParts(i18n, 'session.nowhere', { typed: en('x'), chars: ja('一') })).toEqual([words('session.nowhere')]);
  });

  it('leaves out an empty piece', () => {
    setUp();
    expect(wordedParts(i18n, 'session.theAnswer', { expected: ja('') })).toEqual([words('The answer: ')]);
  });
});

describe('WordedComponent', () => {
  let fixture: ComponentFixture<WordedComponent>;

  beforeEach(() => {
    TestBed.configureTestingModule({ providers: [provideZonelessChangeDetection()] });
    fixture = TestBed.createComponent(WordedComponent);
  });

  it('draws the pieces as one sentence, with no space added, each piece of material saying its language', async () => {
    fixture.componentRef.setInput('parts', [words('Added “'), en('numero uno'), words('” for '), ja('一'), words('.')]);
    await fixture.whenStable();
    const host = fixture.nativeElement as HTMLElement;
    expect(host.textContent).toBe('Added “numero uno” for 一.');
    expect(Array.from(host.querySelectorAll('span')).map((s) => s.getAttribute('lang'))).toEqual([null, 'en', null, 'ja', null]);
  });

  it('draws nothing for no pieces', async () => {
    fixture.componentRef.setInput('parts', []);
    await fixture.whenStable();
    expect((fixture.nativeElement as HTMLElement).textContent).toBe('');
  });
});
