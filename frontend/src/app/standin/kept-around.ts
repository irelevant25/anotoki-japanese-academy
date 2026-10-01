import { TranslationParams, TranslationService, fillPlaceholders } from '../core/i18n/translation.service';

/**
 * keptWord() for a sentence with markup inside it: the sentence cut at one
 * placeholder, as the translation service's around() cuts it —
 * `{{ before }}<span lang="en">{{ reason }}</span>{{ after }}` — for what is
 * drawn outside the router's screens, and so may be drawn while the app has
 * no strings at all (kept-word.ts says why). The string of the language on
 * the page when there is one; the English written in the code, which is the
 * same text as the seeded English, when there is not. Never the key.
 *
 * The third answer says whether the cut was made: a language may leave the
 * placeholder out, and then the page must not draw the marked-up value — it
 * would be glued onto a sentence that does not name it.
 *
 * Call it inside a computed(): has() and around() read signals, so the words
 * follow the strings when they come, and the language when it changes.
 */
export function keptAround(
  i18n: TranslationService,
  key: string,
  english: string,
  placeholder: string,
  params?: TranslationParams,
): [before: string, after: string, found: boolean] {
  if (i18n.has(key)) {
    return i18n.around(key, placeholder, params);
  }
  const mark = `{${placeholder}}`;
  const at = english.indexOf(mark);
  return at < 0 ? [fillPlaceholders(english, params), '', false] : [fillPlaceholders(english.slice(0, at), params), fillPlaceholders(english.slice(at + mark.length), params), true];
}
