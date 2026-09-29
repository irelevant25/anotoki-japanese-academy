// Typed-answer checking for the kanji SRS, against the real catalog: the one
// the backend builds from data/ (scripts/catalog-fixture.mjs writes it before
// every run).
import fixture from '../../testing/catalog.fixture.json';
import { checkMeaning, checkReading, knownCoresOf, meaningVariants, readingForms } from './answer';

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
