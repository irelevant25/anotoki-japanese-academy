/**
 * The keys that are put together at run time: prefix -> every tail the code
 * can add to it. A key is never built from anything open — an address, the
 * IAM's answer, what a person typed — only from these closed sets, and the
 * code that words them goes through a table with a fallback key, or checks
 * the tail against its set first.
 *
 * This file is read by the backend's key scan (backend/tools/translation_keys.php),
 * which cannot see a key that is never written out whole: every key listed
 * here (or its plural family) must exist in the database, and a database key
 * under one of these prefixes that is not listed is unused.
 *
 * A constant that holds whole keys (tabs, scopes, modes, sizes) needs no
 * line here: the scan sees the literals.
 */
export const DYNAMIC_KEYS: Record<string, readonly string[]> = {
  // A failed request, as errorKey() words it (error-text.ts): the server's own codes, verbatim, and the three that are not the server's.
  'error.': [
    'offline',
    'http',
    'unknown',
    'no_such_item',
    'already_learned',
    'kanji_first',
    'not_due',
    'not_learned',
    'seed_required',
    'paper_mismatch',
    'sign_in_required',
    'invalid_token',
    'no_access',
    'this_computer_only',
    'database_unavailable',
    'server_error',
    'not_up_to_date',
    'not_set_up',
    'not_found',
    'method_not_allowed',
  ],
  // The exam's sections, by the ids the server sends (SECTIONS in backend/src/generate.php): meta.sections[].id, a question's
  // `section`, a breakdown's `key`, a review row's `sectionId`.
  'exam.section.': [
    'listening-word',
    'listening-meaning',
    'kana',
    'vocab-jp-en',
    'vocab-en-jp',
    'kanji-reading',
    'kanji-meaning',
    'kanji-writing',
    'verb-class',
    'verb-conjugation',
    'adjective',
    'particle',
    'grammar',
    'counter',
    'translation',
  ],
  // The two parts of the course, by meta.books[].id.
  'exam.part.': ['1', '2'],
  // What the exam's player says about a recording: the states the exam keeps in `playState`.
  'exam.play.': ['tap', 'playing', 'again', 'unavailable'],
  // Why an answer was not taken as one: the kinds checkReading() and checkMeaning() give (kanji/answer.ts).
  'answer.check.': ['readingEmpty', 'readingUnfinished', 'readingInKanji', 'meaningNotEnglish', 'meaningEmpty'],
};
