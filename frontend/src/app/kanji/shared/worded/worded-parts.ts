import { TranslationParams } from '@anotoki/lib/translations';

/**
 * A piece of a sentence. `lang` null: the app's own words, in the language of
 * the page. Otherwise a piece of the learning material, a kept term or
 * something a person typed, which stays what it is in every language and says
 * which language that is: English material is `en`, Japanese `ja`.
 */
export interface Part {
  text: string;
  lang: 'ja' | 'en' | null;
}

/** What stands in a sentence unworded, by the {placeholder} it stands for. */
export type Marks = Record<string, Part>;

/** What cuts a sentence: the translation service is one. */
export interface Cutting {
  t(key: string, params?: TranslationParams): string;
  around(key: string, placeholder: string, params?: TranslationParams): [before: string, after: string, found: boolean];
}

// Stand-ins for the marks after the first, from Unicode's private use area: no
// string of the app and nothing a keyboard types holds them.
const OPEN = '';
const CLOSE = '';
const STAND_IN = /(\d+)/;

/**
 * A sentence of the app with material inside it, as pieces for the template
 * to draw one by one (WordedComponent): "The answer: " + いち, the second in a
 * span with `lang="ja"`.
 *
 * The sentence is cut with around() at the first mark; any further mark goes
 * in as a stand-in that is cut out afterwards. Either way the stored string is
 * what decides where a mark stands: nothing a mark or a parameter holds is
 * read as a placeholder, and none can move a cut.
 *
 * A mark the string leaves out — which a language other than English may —
 * is not drawn at all, and neither is any when the key has no string: the
 * pieces are then the sentence as it is, or the key.
 *
 * `params` are for the sentence's other placeholders: numbers, and words the
 * app worded itself. Material, terms and what a person typed are marks.
 *
 * Call it inside a computed() or from a template: it reads the strings.
 */
export function wordedParts(i18n: Cutting, key: string, marks: Marks, params: TranslationParams = {}): Part[] {
  const names = Object.keys(marks);
  if (!names.length) {
    return [{ text: i18n.t(key, params), lang: null }];
  }
  const filled: Record<string, string | number | null | undefined> = { ...params };
  names.slice(1).forEach((name, i) => {
    filled[name] = `${OPEN}${i + 1}${CLOSE}`;
  });
  const [before, after, found] = i18n.around(key, names[0], filled);

  const parts: Part[] = [];
  const add = (part: Part): void => {
    if (part.text !== '') {
      parts.push({ text: part.text, lang: part.lang });
    }
  };
  const words = (text: string): void => {
    // split() with one group: the app's words at the even places, a stand-in's number at the odd ones
    text.split(STAND_IN).forEach((piece, i) => add(i % 2 ? marks[names[Number(piece)]] : { text: piece, lang: null }));
  };
  words(before);
  if (found) {
    add(marks[names[0]]);
  }
  words(after);
  return parts;
}
