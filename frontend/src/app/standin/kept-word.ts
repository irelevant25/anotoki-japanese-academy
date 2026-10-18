import { TranslationParams, TranslationService, fillPlaceholders } from '@anotoki/lib/translations';

/**
 * A string for what is drawn outside the router's screens — the three stand-in
 * pages, the top bar and the frame of the "What's new" dialog (the family's
 * footer under them has the library's words, never a key) — and so may be
 * drawn while the app has no strings at all: they live
 * in the database, which a copy that is not set up, or a server that does not
 * answer, cannot give. The string of the language on the page when there is
 * one (from the server, or kept by the browser from an earlier visit); the
 * English written in the code, which is the same text as the seeded English,
 * when there is not. Never the key.
 *
 * `params` fill the {placeholders} of either.
 *
 * Call it inside a computed() or from a template: has() and t() read signals,
 * so the words follow the strings when they come, and the language when it
 * changes.
 */
export function keptWord(i18n: TranslationService, key: string, english: string, params?: TranslationParams): string {
  return i18n.has(key) ? i18n.t(key, params) : fillPlaceholders(english, params);
}
