<?php
/**
 * The app's own words, in the languages it speaks: the languages, the strings
 * a page asks for by key, and the grid the owner rewords them in. (The study
 * material is not here, and is never translated: the kanji, the words, their
 * readings and glosses and the exam's questions come from data/.)
 *
 * A key is the code's: migrations write the keys and their first strings
 * (backend/migrations/004_languages_and_translations.sql, and one for every
 * string added later), the owner's pages only ever change a string. English is
 * what every other language falls back to, key by key, so it cannot be
 * switched off, deleted, or left without a string.
 *
 * A string is text and is drawn as text, never HTML. What stands in for a
 * value is a {placeholder}, and which ones a key has is fixed by its English
 * string: the code fills them in, and a translation that invented one would
 * show it to the reader as it is written.
 *
 * The three tables (languages, translation_keys, translations) are the site's,
 * not a person's: everybody reads them, the owner writes them, and no query
 * here has a user id. The one place a person appears is translations.updated_by,
 * who last reworded a string: the request's person (the routes pass
 * uid($request)), or null for a migration and the command line.
 *
 * What a request asks for comes back as [status, body], like the other
 * handlers' answers (backend/api/routes/translations.php sends it). A
 * refusal's body is {"error": sentence, "code": word} and, where they apply,
 * "key", "language", "placeholder" and "keys": the owner's pages show the
 * sentence beside the key it is about.
 */

declare(strict_types=1);

/** The language every other one falls back to. */
const TRANSLATION_FALLBACK = 'en';

/**
 * The languages the migrations write strings for. They cannot be deleted: the
 * next migration with strings would fail on the missing language, and a failed
 * migration closes the whole site, on a host with no shell to mend it from.
 * backend/tests/unit/translations.test.php keeps this list true.
 */
const TRANSLATION_SEEDED_LANGUAGES = ['en', 'sk'];

/** The largest body a save or an import of strings may have: every string of a language is a few dozen kB. */
const TRANSLATIONS_BODY_LIMIT = 1024 * 1024;

/** How long one string may be: the longest the app has is a few sentences. */
const TRANSLATION_VALUE_MAX = 2000;

/** A placeholder in a string: {name}. The same expression as the frontend's (core/i18n). */
const TRANSLATION_PLACEHOLDER = '/\{([A-Za-z][A-Za-z0-9_]*)\}/';

const LANGUAGES_MAX = 20;
const LANGUAGE_NAME_MAX = 50;
const LANGUAGE_SORT_MAX = 1000;

/**
 * How the copy of a language's strings, taken before it is deleted, is named
 * in backups/ (translations_copy()). It is a flat {key: text}, not a backup of
 * study data: the setup page leaves these out of the backups it offers.
 */
const TRANSLATIONS_COPY_PREFIX = 'academy-before-language-delete-';

/** What the app answers while its words are not in the database yet: 004 still on its way in an upload. */
const TRANSLATIONS_NOT_READY = 'The database is not up to date with the upload yet: the app\'s own words are not in it. Try again in a moment.';

/**
 * A refusal on its way out of a check. Thrown from deep inside one, so a
 * transaction rolls back and nothing of a refused save is kept; every function
 * a route calls catches it and answers it as [status, body].
 */
final class TranslationRefused extends RuntimeException
{
    public int $status;
    /** The word a page acts on: 'unknown_key', 'fallback_language' … */
    public string $errorCode;
    /** What it is about: key, language, placeholder, keys. */
    public array $extra;

    public function __construct(int $status, string $errorCode, string $message, array $extra = [])
    {
        parent::__construct($message);
        $this->status = $status;
        $this->errorCode = $errorCode;
        $this->extra = $extra;
    }

    /** [status, {"error": sentence, "code": word, …what it is about}] */
    public function answer(): array
    {
        return [$this->status, ['error' => $this->getMessage(), 'code' => $this->errorCode] + $this->extra];
    }
}

/* ------------------------------------------------------------------ text */

// Text measured the way people see it, for the checks below. They live here
// and not in src/util.php: that one is a content file, and a changed byte in
// it rebuilds the catalog and the question bank in every database.

/** The first $max characters of a UTF-8 string; '' for bytes that are not UTF-8. */
function text_clip(string $text, int $max): string
{
    return preg_match('/^.{0,' . $max . '}/us', $text, $m) ? $m[0] : '';
}

/** How many characters: code points, which is at most what the browser counts (UTF-16 units). */
function text_length(string $text): int
{
    return (int) preg_match_all('/./us', $text);
}

/**
 * What the browser counts as a space: the characters String.prototype.trim()
 * takes away and \s matches, character for character: tab, the line breaks,
 * the space, the no-break space, the Unicode spaces, the line and paragraph
 * separators and the byte-order mark. Written out rather than as \s and
 * \p{Z}: those also take U+0085 and U+180E, which the browser does not, and
 * then the two sides would disagree on whether a text is blank.
 */
const TEXT_SPACE = '[\t\n\x0B\f\r \x{A0}\x{1680}\x{2000}-\x{200A}\x{2028}\x{2029}\x{202F}\x{205F}\x{3000}\x{FEFF}]';

/**
 * The text without the spaces around it: exactly the ones the browser's
 * trim() takes away (TEXT_SPACE), not only the ASCII ones PHP's trim() knows.
 *
 * A text the expression cannot get through (a run of more than a million
 * spaces inside it) comes back as it is, never as an empty one: whoever
 * measures it next refuses it as too long, instead of taking it for nothing.
 */
function text_trim(string $text): string
{
    return preg_replace('/^' . TEXT_SPACE . '+|' . TEXT_SPACE . '+$/u', '', $text) ?? $text;
}

/**
 * Is there nothing in the text to see? True when it has no character but
 * white space, separators and format characters: a zero-width space, a word
 * joiner or a soft hyphen alone shows as nothing at all, though trim() leaves
 * each of them. Bytes that are not UTF-8 are nothing to read either.
 *
 * For the app's own strings and the names of its languages, where a text
 * nobody can see would be kept as a string and drawn as an empty place.
 */
function text_blank(string $text): bool
{
    return preg_match('/[^\s\p{Z}\p{Cf}]/u', $text) !== 1;
}

/**
 * A text field's value as it is kept: valid UTF-8 without control characters
 * but tabs and line breaks, or null for what is not text at all. The controls
 * are dropped rather than refused: a soft line break pasted from a word
 * processor, or a form feed from a PDF, would otherwise make a string that
 * can never be saved, however often it is tried.
 *
 * @param mixed $value whatever the request's JSON held
 */
function text_clean($value): ?string
{
    if (!is_string($value) || preg_match('//u', $value) !== 1) {
        return null;
    }
    return text_without_controls($value);
}

/** The text without control characters, tabs and line breaks aside. */
function text_without_controls(string $text): string
{
    return (string) preg_replace('/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/', '', $text);
}

/* ------------------------------------------------------------- languages */

/** Are the three tables there? Not while migration 004 of an upload is still arriving. */
function translations_ready(): bool
{
    return (bool) db_value("SELECT to_regclass('translations') IS NOT NULL");
}

/**
 * Before anything reads the tables for a request: without them 503
 * {"code": "not_up_to_date"}, as an HttpError, so nothing is logged. (A query
 * on the missing table would be a 503 "database not reachable" and a [db]
 * line in the log for every page load while an upload arrives.)
 */
function translations_required(): void
{
    if (!translations_ready()) {
        throw new HttpError(503, TRANSLATIONS_NOT_READY, [], 'not_up_to_date');
    }
}

/**
 * A language code as this app writes them: "sk", "pt-br". Asked before any
 * query that takes a code from an address: anything else is no language, and
 * bytes that are not UTF-8 never reach the database (which would refuse them:
 * a 503 for what is only a wrong address).
 *
 * @param mixed $code what an address or a body named
 */
function language_code_ok($code): bool
{
    return is_string($code) && preg_match('/^[a-z]{2}(-[a-z]{2})?$/D', $code) === 1;
}

function language_not_found(): TranslationRefused
{
    return new TranslationRefused(404, 'not_found', 'There is no such language.');
}

function language_invalid(string $message): TranslationRefused
{
    return new TranslationRefused(422, 'invalid_language', $message);
}

/** A language as the owner's pages read it. */
function language_json(array $row): array
{
    return [
        'code' => $row['code'],
        'name' => $row['name'],
        'nativeName' => $row['native_name'],
        'enabled' => (bool) $row['enabled'],
        'sortOrder' => (int) $row['sort_order'],
        'seeded' => in_array($row['code'], TRANSLATION_SEEDED_LANGUAGES, true),
    ];
}

/** Every language, the ones switched off too, in the order a chooser shows them. */
function languages_all(): array
{
    return array_map('language_json', db_all('SELECT code, name, native_name, enabled, sort_order FROM languages ORDER BY sort_order, name, code'));
}

/**
 * The languages people are offered, as a chooser shows them:
 * [{code, name, nativeName}], in its order. Only these are ever answered by
 * the bundle; one switched off keeps its strings and is offered to nobody.
 */
function languages_offered(): array
{
    return array_map(
        static fn (array $row): array => ['code' => $row['code'], 'name' => $row['name'], 'nativeName' => $row['native_name']],
        db_all('SELECT code, name, native_name FROM languages WHERE enabled ORDER BY sort_order, name, code')
    );
}

/** The language with this code, or null; without a query when it is not a code at all. */
function language_row(string $code): ?array
{
    return language_code_ok($code) ? db_one('SELECT code, name, native_name, enabled, sort_order FROM languages WHERE code = ?', [$code]) : null;
}

/**
 * One of a language's two names: text of 1 to 50 characters, with something
 * in it to see. A name of nothing but a zero-width space would be an empty
 * line in the chooser.
 *
 * @param mixed $value what the body holds under the name
 */
function language_name($value, string $what): string
{
    $text = text_clean($value);
    if ($text === null) {
        throw language_invalid("$what is not text.");
    }
    $text = text_trim($text);
    if (text_blank($text) || text_length($text) > LANGUAGE_NAME_MAX) {
        throw language_invalid("$what must be 1 to " . LANGUAGE_NAME_MAX . ' characters long.');
    }
    return $text;
}

/**
 * A new language, {code, name, nativeName, enabled?}: after the ones there
 * are, and offered at once unless `enabled` says false; then it is there for
 * its strings to be written, and people are offered it when the owner
 * switches it on. It has no strings yet, so until then it would read in
 * English. Returns [201, {language}]; 409 language_exists; 422
 * invalid_language, too_many_languages.
 *
 * @param mixed $body the request's JSON
 */
function languages_create($body): array
{
    try {
        if (!is_array($body)) {
            throw language_invalid('Send the language as {code, name, nativeName}.');
        }
        $code = $body['code'] ?? null;
        if (!language_code_ok($code)) {
            throw language_invalid('A language\'s code is two small letters, or two and two with a dash between: "sk", "pt-br".');
        }
        $name = language_name($body['name'] ?? null, 'The name in English');
        $nativeName = language_name($body['nativeName'] ?? null, 'The name as its speakers write it');
        $enabled = true;
        if (array_key_exists('enabled', $body)) {
            if (!is_bool($body['enabled'])) {
                throw language_invalid('"enabled" is true or false.');
            }
            $enabled = $body['enabled'];
        }

        $row = db_tx(static function () use ($code, $name, $nativeName, $enabled): array {
            // Whoever adds a language waits here for anybody else who is adding
            // one: the count below is then of rows that are really there, and the
            // most the app keeps holds. (Two transactions that only counted
            // would each miss the other's row and both go past it.) Taken first,
            // so nothing is held while waiting; it lets the rows be read and
            // locked (a save of strings), and stops only what writes the table.
            db_exec('LOCK TABLE languages IN SHARE ROW EXCLUSIVE MODE');

            $exists = static fn (): TranslationRefused => new TranslationRefused(409, 'language_exists', "There is a language \"$code\" already.");
            if (db_value('SELECT 1 FROM languages WHERE code = ?', [$code])) {
                throw $exists();
            }
            if ((int) db_value('SELECT count(*) FROM languages') >= LANGUAGES_MAX) {
                throw new TranslationRefused(422, 'too_many_languages', 'The app keeps at most ' . LANGUAGES_MAX . ' languages. Delete one that is not used first.');
            }
            $sortOrder = min((int) db_value('SELECT coalesce(max(sort_order), 0) + 1 FROM languages'), LANGUAGE_SORT_MAX);
            // A row written past this function in this very moment: no row comes
            // back, and no error that would end the transaction.
            $row = db_one(
                'INSERT INTO languages (code, name, native_name, enabled, sort_order) VALUES (?, ?, ?, ?, ?)
                 ON CONFLICT (code) DO NOTHING
                 RETURNING code, name, native_name, enabled, sort_order',
                [$code, $name, $nativeName, $enabled, $sortOrder]
            );
            if ($row === null) {
                throw $exists();
            }
            return $row;
        });
    } catch (TranslationRefused $e) {
        return $e->answer();
    }
    return [201, ['language' => language_json($row)]];
}

/**
 * Changes a language: {name?, nativeName?, enabled?, sortOrder?}; what is not
 * sent stays. English cannot be switched off; any other language can, at any
 * time: it keeps its strings and is only no longer offered. Returns
 * [200, {language}]; 404; 409 fallback_language; 422 invalid_language.
 *
 * @param mixed $body the request's JSON
 */
function languages_update(string $code, $body): array
{
    try {
        $row = language_row($code);
        if ($row === null) {
            throw language_not_found();
        }
        if (!is_array($body) || ($body !== [] && array_is_list($body))) {
            throw language_invalid('Send what changes as {name, nativeName, enabled, sortOrder}.');
        }

        $set = [];
        $params = [];
        if (array_key_exists('name', $body)) {
            $set[] = 'name = ?';
            $params[] = language_name($body['name'], 'The name in English');
        }
        if (array_key_exists('nativeName', $body)) {
            $set[] = 'native_name = ?';
            $params[] = language_name($body['nativeName'], 'The name as its speakers write it');
        }
        if (array_key_exists('enabled', $body)) {
            if (!is_bool($body['enabled'])) {
                throw language_invalid('"enabled" is true or false.');
            }
            if ($code === TRANSLATION_FALLBACK && !$body['enabled']) {
                throw new TranslationRefused(409, 'fallback_language', 'English cannot be switched off: every other language falls back to it.');
            }
            $set[] = 'enabled = ?';
            $params[] = $body['enabled'];
        }
        if (array_key_exists('sortOrder', $body)) {
            if (!is_int($body['sortOrder']) || $body['sortOrder'] < 0 || $body['sortOrder'] > LANGUAGE_SORT_MAX) {
                throw language_invalid('The order is a whole number from 0 to ' . LANGUAGE_SORT_MAX . '.');
            }
            $set[] = 'sort_order = ?';
            $params[] = $body['sortOrder'];
        }
        if ($set !== []) {
            $params[] = $code;
            $row = db_one('UPDATE languages SET ' . implode(', ', $set) . ' WHERE code = ? RETURNING code, name, native_name, enabled, sort_order', $params);
            if ($row === null) {
                throw language_not_found();
            }
        }
    } catch (TranslationRefused $e) {
        return $e->answer();
    }
    return [200, ['language' => language_json($row)]];
}

/**
 * Deletes a language and its strings, after a copy of them in backups/
 * (translations_copy()). Never English, and never a language the migrations
 * write strings for. Returns [200, {copy: the file's name}]; 404; 409
 * fallback_language, seeded_language.
 */
function languages_delete(string $code): array
{
    try {
        if (language_row($code) === null) {
            throw language_not_found();
        }
        if ($code === TRANSLATION_FALLBACK) {
            throw new TranslationRefused(409, 'fallback_language', 'English cannot be deleted: every other language falls back to it.');
        }
        if (in_array($code, TRANSLATION_SEEDED_LANGUAGES, true)) {
            throw new TranslationRefused(409, 'seeded_language', 'This language is one the app is released in: every update brings strings for it, and would fail without it. Switch it off instead.');
        }

        $copy = db_tx(static function () use ($code): string {
            // The language's row first, locked: a save of strings holds the
            // languages' rows too (translations_write()), so this waits until
            // that save is kept, and the copy then has what it wrote. A save
            // that comes after waits for this, and finds the language gone.
            if (db_value('SELECT 1 FROM languages WHERE code = ? FOR UPDATE', [$code]) === null) {
                throw language_not_found();
            }
            // The copy first, as a full reset takes one: a copy that cannot be
            // written stops the delete, and the strings go with the row.
            $copy = translations_copy($code);
            db_exec('DELETE FROM languages WHERE code = ?', [$code]);
            return $copy;
        });
    } catch (TranslationRefused $e) {
        return $e->answer();
    }
    return [200, ['copy' => basename($copy)]];
}

/* ------------------------------------------ the strings a page asks for */

/** A map that goes out as a JSON object, empty or not: PHP would write an empty one as []. */
function translation_map(array $map): object
{
    return (object) $map;
}

/** A language's own strings, by key: [key => text], in the keys' order. */
function translations_of(string $code): array
{
    $values = [];
    foreach (db_all('SELECT key_name, value FROM translations WHERE language_code = ? ORDER BY key_name COLLATE "C"', [$code]) as $row) {
        $values[$row['key_name']] = $row['value'];
    }
    return $values;
}

/**
 * What the app reads its words from: GET /api/translations/{code}, for a code
 * that is one (language_code_ok()). `values` is the language's strings with
 * English under them, so a key with no string in it reads in English;
 * `languages` the ones offered; `english` the fallback's own strings, for the
 * owner's pages, which are always English: left out when that is what
 * `values` is.
 *
 * `language` says which language it really is. A code with a region that is
 * not offered itself is answered by its language when that one is: "sk-sk", a
 * Slovak browser's first wish, by "sk", in this one request rather than with
 * English and a second request before the first page. An offered "pt-br" is
 * itself. Anything else the app does not have, or has switched off, is
 * answered in English.
 *
 * @return array{language: string, languages: array, values: object, english?: object}
 */
function translations_bundle(string $code): array
{
    $offered = languages_offered();
    $codes = array_column($offered, 'code');
    $base = substr($code, 0, 2); // of a code that is one (language_code_ok()): its language, without the region
    if (in_array($code, $codes, true)) {
        $language = $code;
    } elseif (in_array($base, $codes, true)) {
        $language = $base;
    } else {
        $language = TRANSLATION_FALLBACK;
    }

    $english = translations_of(TRANSLATION_FALLBACK);
    $bundle = ['language' => $language, 'languages' => $offered];
    if ($language === TRANSLATION_FALLBACK) {
        $bundle['values'] = translation_map($english);
        return $bundle;
    }

    $values = translations_of($language) + $english;
    ksort($values, SORT_STRING);
    $bundle['values'] = translation_map($values);
    $bundle['english'] = translation_map($english);
    return $bundle;
}

/**
 * Does the browser hold this very answer already? If-None-Match compared the
 * weak way, which is what a conditional GET asks for: any of the tags it
 * lists, or *. A tag comes back as whatever stood between the site and the
 * browser made of it, so both marks of a compressed answer are taken off
 * first: W/ in front (a proxy or a CDN that compressed it weakens the tag),
 * and -gzip, -br or -zstd inside the quotes (Apache's mod_deflate and
 * mod_brotli add it, and cannot be told not to from an .htaccess). Without
 * the second the 304 would never be answered behind such a server. The tag
 * itself is 32 hex digits, so it never ends that way on its own.
 */
function translations_not_modified(string $ifNoneMatch, string $etag): bool
{
    foreach (explode(',', $ifNoneMatch) as $candidate) {
        $candidate = trim($candidate);
        if (str_starts_with($candidate, 'W/')) {
            $candidate = substr($candidate, 2);
        }
        $candidate = (string) preg_replace('/-(gzip|br|zstd)"$/D', '"', $candidate);
        if ($candidate === '*' || $candidate === $etag) {
            return true;
        }
    }
    return false;
}

/* ------------------------------------------------------- the owner's grid */

/**
 * Every key with its strings in every language, and the languages:
 * {languages: [all], keys: [{name, description, values: {en: "…", sk: "…"}}]},
 * the keys by name, so the forms of a plural (.few, .one, .other) are together.
 */
function translations_grid(): array
{
    $keys = [];
    foreach (db_all('SELECT name, description FROM translation_keys ORDER BY name COLLATE "C"') as $row) {
        $keys[$row['name']] = ['name' => $row['name'], 'description' => (string) ($row['description'] ?? ''), 'values' => []];
    }
    foreach (db_all('SELECT key_name, language_code, value FROM translations ORDER BY language_code') as $row) {
        $keys[$row['key_name']]['values'][$row['language_code']] = $row['value'];
    }
    return [
        'languages' => languages_all(),
        'keys' => array_map(
            static fn (array $key): array => ['name' => $key['name'], 'description' => $key['description'], 'values' => translation_map($key['values'])],
            array_values($keys)
        ),
    ];
}

function translation_invalid(string $code, string $message, array $extra = []): TranslationRefused
{
    return new TranslationRefused(422, $code, $message, $extra);
}

/**
 * The placeholders a string uses, each once, in the order they first appear.
 *
 * @return string[]
 */
function translation_placeholders(string $text): array
{
    preg_match_all(TRANSLATION_PLACEHOLDER, $text, $matches);
    return array_values(array_unique($matches[1]));
}

/**
 * Checks strings somebody wants kept (a save of the grid, an import, the
 * command line) and says what to write. Everything is checked before anything
 * is written; the first thing wrong is refused (a TranslationRefused, 422),
 * with the key and the language it is about:
 *
 *   invalid_value         not {key: {language: text}}; a value that is not text, or longer than 2000 characters
 *   unknown_key           a key the app does not have (with `keys`: every such key sent)
 *   unknown_language      a language the app does not have
 *   fallback_required     an empty English string: every other language falls back to it
 *   invalid_placeholder   a { or } that is not part of a {placeholder}: "{ count }", "{počet}", "{count", "{{count}}"
 *   placeholder_changed   an English string whose {placeholders} are not exactly the stored English string's
 *   unknown_placeholder   another language's string with a {placeholder} the English one does not have
 *
 * An empty string in another language means "no string of its own": the row
 * goes, and the language reads that key in English. Empty is a string with
 * nothing in it to see (text_blank()): spaces, or a zero-width space alone,
 * which would otherwise be kept and drawn as an empty place.
 *
 * A translation may leave a placeholder out (Slovak often says it another
 * way), but never add one: the code fills in only the ones the English string
 * has. For a key with no English string yet, the English sent with it is what
 * counts. And a brace is only ever part of a placeholder: the page fills in
 * what is written exactly as {name} and leaves anything else as it stands, so
 * a placeholder with a space in it, or with its name translated, would be
 * read by everybody as braces and a word.
 *
 * What is to be written comes back by key and then by language, whatever
 * order it was sent in: every save takes its rows in that one order, so two
 * saves of the same strings wait for each other instead of each holding a
 * row the other needs (which the database ends by failing one of them).
 *
 * It reads nothing itself, so it can be tested without a database.
 *
 * @param mixed                 $values    {key: {language code: text}}
 * @param string[]              $keys      every key there is
 * @param array<string, string> $languages every language there is: code => its name in English
 * @param array<string, string> $english   the stored English string of every key that has one
 *
 * @return array<array{key: string, language: string, value: ?string}> value null: delete that string
 */
function translations_check($values, array $keys, array $languages, array $english): array
{
    $isMap = static fn ($value): bool => is_array($value) && ($value === [] || !array_is_list($value));
    if (!$isMap($values)) {
        throw translation_invalid('invalid_value', 'Send the strings by key and language: {key: {language: text}}.');
    }

    $known = array_fill_keys($keys, true);
    // What is quoted back in a refusal is never longer than a key can be.
    $quote = static fn (string $text): string => '"' . text_clip($text, 200) . '"';
    $changes = [];

    foreach ($values as $key => $cells) {
        $key = (string) $key; // PHP made a number of a key like "12"
        if (!$isMap($cells)) {
            throw translation_invalid('invalid_value', 'The strings of ' . $quote($key) . ' are not given by language: {language: text}.', ['key' => text_clip($key, 200)]);
        }
        if (!isset($known[$key])) {
            $unknown = array_values(array_filter(array_map('strval', array_keys($values)), static fn (string $name): bool => !isset($known[$name])));
            throw translation_invalid(
                'unknown_key',
                count($unknown) === 1
                    ? 'The app has no key ' . $quote($key) . '. Keys are made by the code, never here.'
                    : 'The app has no such keys: ' . implode(', ', array_map($quote, array_slice($unknown, 0, 20))) . (count($unknown) > 20 ? ' and ' . (count($unknown) - 20) . ' more' : '') . '. Keys are made by the code, never here.',
                ['key' => text_clip($key, 200), 'keys' => array_map(static fn (string $name): string => text_clip($name, 200), $unknown)]
            );
        }

        // The placeholders the key has: its stored English string's, or, for a
        // key that has none yet, those of the English string sent with it.
        $stored = $english[$key] ?? null;
        $sentEnglish = text_clean($cells[TRANSLATION_FALLBACK] ?? null);
        $placeholders = translation_placeholders($stored ?? $sentEnglish ?? '');

        foreach ($cells as $code => $value) {
            $code = (string) $code;
            $about = ['key' => $key, 'language' => text_clip($code, 20)];
            if (!isset($languages[$code])) {
                throw translation_invalid('unknown_language', 'The app has no language ' . $quote($code) . '.', $about);
            }
            $name = $languages[$code];

            $text = text_clean($value);
            if ($text === null) {
                throw translation_invalid('invalid_value', "The $name string of \"$key\" is not text.", $about);
            }
            $text = text_trim($text);
            if (text_blank($text)) {
                if ($code === TRANSLATION_FALLBACK) {
                    throw translation_invalid('fallback_required', "\"$key\" needs its English string: every other language falls back to it.", $about);
                }
                $changes[] = ['key' => $key, 'language' => $code, 'value' => null];
                continue;
            }
            if (text_length($text) > TRANSLATION_VALUE_MAX) {
                throw translation_invalid('invalid_value', "The $name string of \"$key\" is longer than " . TRANSLATION_VALUE_MAX . ' characters.', $about);
            }
            // With every placeholder taken out, no brace is left, in any
            // language: what is left would be shown as it is written.
            if (preg_match('/[{}]/', (string) preg_replace(TRANSLATION_PLACEHOLDER, '', $text)) === 1) {
                $how = $placeholders === []
                    ? 'This key has no placeholder, so its strings can hold no { or }.'
                    : 'A placeholder is written exactly as the English string has it, like {' . $placeholders[0] . '}: no spaces, and its name is not translated.';
                throw translation_invalid(
                    'invalid_placeholder',
                    "The $name string of \"$key\" has a { or } that is not part of a placeholder. $how",
                    $about
                );
            }

            $used = translation_placeholders($text);
            if ($code === TRANSLATION_FALLBACK) {
                $changed = array_merge(array_diff($placeholders, $used), array_diff($used, $placeholders));
                if ($changed !== []) {
                    $placeholder = $changed[0];
                    throw translation_invalid(
                        'placeholder_changed',
                        in_array($placeholder, $placeholders, true)
                            ? "The English string of \"$key\" must keep {" . $placeholder . '}: the app puts a value there.'
                            : "The English string of \"$key\" cannot use {" . $placeholder . '}: the app has no value for it.',
                        $about + ['placeholder' => $placeholder]
                    );
                }
            } else {
                $unknown = array_values(array_diff($used, $placeholders));
                if ($unknown !== []) {
                    throw translation_invalid(
                        'unknown_placeholder',
                        "The $name string of \"$key\" uses {" . $unknown[0] . '}, which its English string does not have.',
                        $about + ['placeholder' => $unknown[0]]
                    );
                }
            }

            $changes[] = ['key' => $key, 'language' => $code, 'value' => $text];
        }
    }

    // One order for every save (strcmp: <=> would compare "10" and "9" as numbers).
    usort($changes, static fn (array $a, array $b): int => strcmp($a['key'], $b['key']) ?: strcmp($a['language'], $b['language']));
    return $changes;
}

/**
 * Writes strings, {key: {language: text}}: all of it checked first
 * (translations_check()) and written in one transaction, or none of it (a
 * TranslationRefused from the check rolls it back). A string sent as it
 * already is stays as it was, with who wrote it and when.
 *
 * @param mixed $values {key: {language code: text}}
 */
function translations_write($values, ?int $userId): void
{
    db_tx(static function () use ($values, $userId): void {
        // FOR SHARE: no language is deleted between the check and the writing.
        $languages = array_column(db_all('SELECT code, name FROM languages FOR SHARE'), 'name', 'code');
        $keys = array_column(db_all('SELECT name FROM translation_keys'), 'name');

        foreach (translations_check($values, $keys, $languages, translations_of(TRANSLATION_FALLBACK)) as $change) {
            if ($change['value'] === null) {
                db_exec('DELETE FROM translations WHERE key_name = ? AND language_code = ?', [$change['key'], $change['language']]);
                continue;
            }
            db_exec(
                'INSERT INTO translations (key_name, language_code, value, updated_by) VALUES (?, ?, ?, ?)
                 ON CONFLICT (key_name, language_code) DO UPDATE
                    SET value = EXCLUDED.value, updated_at = now(), updated_by = EXCLUDED.updated_by
                  WHERE translations.value IS DISTINCT FROM EXCLUDED.value',
                [$change['key'], $change['language'], $change['value'], $userId]
            );
        }
    });
}

/**
 * Keeps the strings the grid changed: {key: {language: text}}, only the ones
 * that changed. Two people changing the same string: the last save is kept.
 * $userId is who is saving (the request's person, from their token), or null
 * for the command line. Returns [200, the grid as it is now], or the refusal.
 *
 * @param mixed $values {key: {language code: text}}
 */
function translations_save($values, ?int $userId): array
{
    try {
        translations_write($values, $userId);
    } catch (TranslationRefused $e) {
        return $e->answer();
    }
    return [200, translations_grid()];
}

/** A language's own strings as a flat {key: text}, not merged with English: [200, {…}] ({} when it has none), or 404. */
function translations_export(string $code): array
{
    if (language_row($code) === null) {
        return language_not_found()->answer();
    }
    return [200, translation_map(translations_of($code))];
}

/**
 * A language's strings back in, from a flat {key: text}: the same checks as a
 * save. An empty string (one with nothing in it to see: text_blank()) is a key
 * nobody has translated yet, as an export filled in by hand leaves it, and is
 * passed over: an import deletes nothing. A key the app does not have is
 * refused, empty or not. Returns [200, the grid as it is now], or the refusal.
 *
 * @param mixed $body the file's, or the request's, JSON
 */
function translations_import(string $code, $body, ?int $userId): array
{
    try {
        if (language_row($code) === null) {
            throw language_not_found();
        }
        if (!is_array($body) || ($body !== [] && array_is_list($body))) {
            throw translation_invalid('invalid_value', 'Send the strings as one flat object: {key: text}.');
        }
        $values = [];
        foreach ($body as $key => $text) {
            $clean = text_clean($text);
            $values[$key] = $clean !== null && text_blank($clean) ? [] : [$code => $text];
        }
        translations_write($values, $userId);
    } catch (TranslationRefused $e) {
        return $e->answer();
    }
    return [200, translations_grid()];
}

/* ------------------------------------------------------------ the copies */

/**
 * A language's strings as the text of a file: one flat JSON object, a key a
 * line, the letters as they are, so it can be worked on in an editor and
 * compared line by line.
 *
 * @param array|object $values {key: text}
 */
function translations_file_text($values): string
{
    return json_encode((object) (array) $values, JSON_PRETTY_PRINT | JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES | JSON_THROW_ON_ERROR) . "\n";
}

/**
 * Before a language is deleted: its own strings, as an export gives them, in
 * backups/academy-before-language-delete-<code>-<time>.json. Put back with
 * php backend/translations.php --import <code> <file>, once the language is
 * there again. Returns the file.
 */
function translations_copy(string $code): string
{
    $dir = backup_dir();
    if (!is_dir($dir) && !mkdir($dir, 0777, true) && !is_dir($dir)) {
        throw new RuntimeException("Cannot create the backup folder $dir");
    }
    $file = "$dir/" . TRANSLATIONS_COPY_PREFIX . "$code-" . local_time(now_ms())->format('Ymd-His-v') . '.json';
    file_put_atomic($file, translations_file_text(translations_of($code)));
    return $file;
}

/**
 * The languages and every string, for a backup of everybody
 * (backup_data() in src/backup.php):
 * {languages: [all], values: {code: {key: text}}}, each language's own
 * strings. Null before migration 004. A restore never reads it (the strings
 * are the site's, not anybody's study data): they are put back, a language at
 * a time, with php backend/translations.php --import <code> <the backup>.
 */
function translations_backup(): ?array
{
    if (!translations_ready()) {
        return null;
    }
    $languages = languages_all();
    $values = array_fill_keys(array_column($languages, 'code'), []);
    foreach (db_all('SELECT language_code, key_name, value FROM translations ORDER BY language_code, key_name COLLATE "C"') as $row) {
        $values[$row['language_code']][$row['key_name']] = $row['value'];
    }
    return ['languages' => $languages, 'values' => translation_map(array_map('translation_map', $values))];
}
