// Typed-answer checking for the kanji SRS, against the real catalog: the one
// the backend builds from data/ (scripts/catalog-fixture.mjs writes it before
// every run).
import fixture from '../../testing/catalog.fixture.json';
import { DYNAMIC_KEYS } from '../core/i18n/dynamic-keys';
import { CheckKind, checkMeaning, checkReading, knownCoresOf, materialLang, meaningVariants, readingForms } from './answer';

interface FixtureItem {
  id: string;
  meanings: string[];
  readings: string[];
}

const items = (fixture as unknown as { items: FixtureItem[] }).items;
const byId = new Map(items.map((it) => [it.id, it]));
const known = knownCoresOf(items);

function item(id: string): FixtureItem {
  const it = byId.get(id);
  if (!it) {
    throw new Error(`the catalog has no ${id}`);
  }
  return it;
}
const meaning = (id: string, answer: string) => checkMeaning(answer, item(id).meanings, known).verdict;
const reading = (id: string, answer: string) => checkReading(answer, item(id).readings).verdict;

describe('meaning', () => {
  it('ignores case, punctuation, "to" and parenthesised parts', () => {
    expect(meaning('k:食', 'eat')).toBe('correct');
    expect(meaning('k:食', 'To Eat!')).toBe('correct');
    expect(meaning('k:食', 'drink')).toBe('wrong');
    expect(meaning('v:大学', 'college')).toBe('correct');
    expect(meaning('v:父', 'father'), '"(my) father" without the parenthesis').toBe('correct');
    expect(meaning('v:感動する', 'moved'), '"to be moved" without "to be"').toBe('correct');
  });

  it('forgives a typo, but not one that is another real answer', () => {
    expect(meaning('v:大学', 'univercity')).toBe('correct');
    expect(meaning('k:右', 'rigth'), 'a transposition counts as one edit').toBe('correct');
    expect(meaning('k:右', 'night'), '"night" is 夜, not a typo of "right"').toBe('wrong');
    expect(meaning('k:回', 'time'), '"time" is 時').toBe('wrong');
    expect(meaning('k:犬', 'dig'), 'short words get no tolerance').toBe('wrong');
  });

  it('takes numbers as digits or words, exactly', () => {
    expect(meaning('k:百', '100')).toBe('correct');
    expect(meaning('k:万', '10,000')).toBe('correct');
    expect(meaning('v:三百', 'three hundred')).toBe('correct');
    expect(meaning('v:三百', '30'), 'numbers must be exact').toBe('wrong');
    expect(meaning('v:一時', 'one oclock'), 'apostrophes do not matter').toBe('correct');
  });

  it('reads slashes, nested parentheses and keigo', () => {
    expect(meaning('v:二台', 'two machines')).toBe('correct');
    expect(meaning('k:様', 'Ms.')).toBe('correct');
    expect(meaning('v:お子さん', 'your child')).toBe('correct');
    expect(meaning('v:お子さん', 'their child')).toBe('wrong');
    expect(meaning('v:作品', 'work'), 'a comma inside parentheses does not split').toBe('correct');
    expect(meaning('v:下さる', 'give me'), 'keigo resolved to the plain verb').toBe('correct');
  });

  it('calls kana or nothing invalid, not wrong', () => {
    expect(meaning('k:食', 'たべる')).toBe('invalid');
    expect(meaning('k:食', '  ')).toBe('invalid');
  });

  it('counts the learner’s own synonyms', () => {
    expect(checkMeaning('numero uno', [...item('k:一').meanings, 'numero uno'], known).verdict).toBe('correct');
    expect(checkMeaning('numero uno', item('k:一').meanings, known).verdict).toBe('wrong');
  });
});

describe('reading', () => {
  it('takes hiragana or katakana, and nothing else', () => {
    expect(reading('k:食', 'しょく')).toBe('correct');
    expect(reading('k:食', 'たべる'), 'kun + okurigana').toBe('correct');
    expect(reading('v:大学', 'ダイガク'), 'katakana = hiragana').toBe('correct');
    expect(reading('v:大学', 'たいがく')).toBe('wrong');
    expect(reading('v:大学', 'daigak'), 'unconverted romaji').toBe('invalid');
    expect(reading('v:大学', '大学')).toBe('invalid');
    expect(reading('v:一日', 'ついたち')).toBe('correct');
    expect(reading('v:一日', 'いちにち')).toBe('correct');
    expect(reading('v:何も', 'なにも'), 'no "+ negative" in the reading').toBe('correct');
  });

  it('lets a katakana long vowel be typed out', () => {
    const it = items.find((i) => i.readings.some((r) => r.includes('ー'))) as FixtureItem;
    const long = it.readings.find((x) => x.includes('ー')) as string;
    const forms = [...readingForms(long)];
    expect(forms.length).toBeGreaterThan(1);
    for (const f of forms) {
      expect(checkReading(f, it.readings).verdict, f).toBe('correct');
    }
  });
});

describe('an answer that is not one', () => {
  it('says what was wrong with it as a kind, never as a sentence: the page words it in the reader’s language', () => {
    const readings = item('v:大学').readings;
    expect(checkReading('', readings)).toEqual({ verdict: 'invalid', kind: 'readingEmpty' });
    expect(checkReading(' 、 ', readings), 'separators alone are nothing').toEqual({ verdict: 'invalid', kind: 'readingEmpty' });
    expect(checkReading('だいgak', readings)).toEqual({ verdict: 'invalid', kind: 'readingUnfinished' });
    expect(checkReading('大学', readings)).toEqual({ verdict: 'invalid', kind: 'readingInKanji' });

    const meanings = item('k:食').meanings;
    expect(checkMeaning('たべる', meanings, known)).toEqual({ verdict: 'invalid', kind: 'meaningNotEnglish' });
    expect(checkMeaning('食', meanings, known)).toEqual({ verdict: 'invalid', kind: 'meaningNotEnglish' });
    expect(checkMeaning('  ', meanings, known)).toEqual({ verdict: 'invalid', kind: 'meaningEmpty' });
    expect(checkMeaning('?!', meanings, known), 'punctuation alone is nothing').toEqual({ verdict: 'invalid', kind: 'meaningEmpty' });
  });

  it('gives a kind only to an invalid answer', () => {
    expect(checkReading('しょく', item('k:食').readings).kind).toBeUndefined();
    expect(checkReading('たいがく', item('v:大学').readings)).toEqual({ verdict: 'wrong' });
    expect(checkMeaning('eat', item('k:食').meanings, known)).toEqual({ verdict: 'correct' });
    expect(checkMeaning('drink', item('k:食').meanings, known)).toEqual({ verdict: 'wrong' });
  });

  it('has exactly the kinds the app has words for (answer.check. in dynamic-keys.ts)', () => {
    const kinds: Record<CheckKind, true> = {
      readingEmpty: true,
      readingUnfinished: true,
      readingInKanji: true,
      meaningNotEnglish: true,
      meaningEmpty: true,
    };
    expect([...DYNAMIC_KEYS['answer.check.']].sort()).toEqual(Object.keys(kinds).sort());
  });
});

describe('materialLang', () => {
  it('is Japanese for anything with kana or kanji in it', () => {
    expect(materialLang('たべる')).toBe('ja');
    expect(materialLang('タクシー')).toBe('ja');
    expect(materialLang('食')).toBe('ja');
    expect(materialLang('大学に行く'), 'kanji and kana').toBe('ja');
    expect(materialLang('お土産 (souvenir)'), 'Japanese with a gloss beside it').toBe('ja');
    expect(materialLang('Aさん'), 'one kana is enough').toBe('ja');
    expect(materialLang('ー'), 'the long-vowel mark is kana').toBe('ja');
  });

  it('is English for everything else, the page’s language aside', () => {
    expect(materialLang('to eat')).toBe('en');
    expect(materialLang('u-verb')).toBe('en');
    expect(materialLang('300')).toBe('en');
    expect(materialLang('10:30 a.m.')).toBe('en');
    expect(materialLang('')).toBe('en');
    expect(materialLang(null)).toBe('en');
    expect(materialLang(undefined)).toBe('en');
  });

  it('calls every item’s characters and readings Japanese, and every typeable meaning English', () => {
    for (const it of items as (FixtureItem & { chars: string })[]) {
      expect(materialLang(it.chars), `${it.id} chars`).toBe('ja');
      for (const r of it.readings) {
        expect(materialLang(r), `${it.id} ${r}`).toBe('ja');
      }
    }
    expect(materialLang(item('k:食').meanings[0])).toBe('en');
  });
});

it('every item can be answered, and takes its own printed answers', () => {
  const jp = /[぀-ヿ一-龯]/;
  for (const it of items) {
    const typeable = [...meaningVariants(it.meanings)].filter((v) => /^[a-z0-9 -]+$/.test(v));
    expect(typeable.length, `${it.id} has an English meaning you can type`).toBeGreaterThan(0);
    for (const m of it.meanings.filter((x) => !jp.test(x))) {
      expect(checkMeaning(m, it.meanings, known).verdict, `${it.id} "${m}"`).toBe('correct');
    }
    for (const r of it.readings) {
      expect(checkReading(r, it.readings).verdict, `${it.id} ${r}`).toBe('correct');
    }
  }
});
