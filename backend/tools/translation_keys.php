<?php
/**
 * Which keys the frontend asks for, and a language's strings out of a file:
 * for backend/translations.php (the command line) and the tests. Functions
 * only; tools/ is for computers with a shell and is never uploaded.
 *
 * The strings live in the database so the owner can reword them in the
 * browser, which means nothing stops a template asking for a key no migration
 * ever wrote: the page shows the key itself, and the mistake is released. The
 * scan is what catches it, and the other way round, a key left in the
 * database that no page asks for any more.
 *
 * The scan is the anotoki library's (Anotoki\Lib\Translations\Cli\KeyScanner,
 * every anotoki site's, which grew from this app's), set up here for this
 * frontend (translation_key_scanner()): every .ts and .html of
 * frontend/src/app, but the specs, core/testing/ and the IAM's SDK in
 * core/auth/sdk/; the keys put together at run time declared in
 * core/i18n/dynamic-keys.ts (prefix -> every tail); the `translate` and
 * `translatePlural` pipes and the calls .t(), .around(), .has(), .plural()
 * read for how a key is asked for; innerHTML given a translated string fails.
 * The library's own keys (anotoki.: its kit's and its status page's words,
 * which its Angular half asks for from node_modules) are never looked for,
 * and never unused. Its rules, in short:
 *
 *   - A key's shape: a namespace ([a-z][A-Za-z0-9]*), then one or more
 *     segments ([A-Za-z0-9][A-Za-z0-9_-]*), joined by dots: home.title,
 *     exam.section.vocab-jp-en.
 *   - A quoted literal of that shape whose namespace the database has is a
 *     key the code uses. The namespace is what tells 'home.title' from a
 *     file's name: 'changelog.json' has a key's shape, which is why no
 *     namespace is ever named "changelog" (the dialog's words are under
 *     whatsNew). Comments do not count, nor does a template's attribute value
 *     (an expression, [text]="error.message").
 *   - A literal L is answered by the key L, or by the plural family L.one,
 *     L.few, L.other; where it stands beside what asks for it, a family asked
 *     for as one string - or one string as a family - fails.
 *   - Keys put together at run time are declared in dynamic-keys.ts, each must
 *     exist, and a key put together from a prefix nobody declared fails.
 */

declare(strict_types=1);

use Anotoki\Lib\Translations\Cli\KeyScanner;

/** Where the keys put together at run time are declared, under the frontend's src/app. */
const TRANSLATION_DYNAMIC_KEYS_FILE = 'core/i18n/dynamic-keys.ts';

/** The frontend's sources, seen from backend/tools/. */
function translation_keys_frontend_root(): string
{
    return str_replace('\\', '/', dirname(__DIR__, 2)) . '/frontend/src/app';
}

/**
 * The library's scan of this frontend: $root, or frontend/src/app. (Its
 * arguments in order: the root, what it leaves out - besides every spec,
 * always -, the file of the keys put together at run time.)
 */
function translation_key_scanner(?string $root = null): KeyScanner
{
    return new KeyScanner($root ?? translation_keys_frontend_root(), ['core/testing/**', 'core/auth/sdk/**'], TRANSLATION_DYNAMIC_KEYS_FILE);
}

/* ------------------------------------------ a language's strings from a file */

/**
 * The strings of language $code in a file that is either a flat export -
 * {key: text}, as the Translations page's export and the command line's
 * --export write it - or a backup of everybody (src/backup.php), from which
 * its translations.values.<code> is taken: how the owner's rewordings come
 * back after a database is lost. A backup from before the app kept its words
 * in the database, a copy of some people alone, or one without that language,
 * holds none, and that is said: nothing is guessed. A byte-order mark in front
 * (an editor on Windows may put one there) is passed over. What each value is
 * is checked where the strings are kept (the library's checks of a save), not
 * here. The read hook of the command line (backend/translations.php).
 *
 * @return array<string, mixed>
 */
function translation_file_strings(string $path, string $code): array
{
    $raw = is_file($path) ? @file_get_contents($path) : false;
    if ($raw === false) {
        throw new RuntimeException("There is no file $path.");
    }
    if (str_starts_with($raw, "\xEF\xBB\xBF")) {
        $raw = substr($raw, 3);
    }
    try {
        $data = json_decode($raw, true, 512, JSON_THROW_ON_ERROR); // a backup nests: an attempt inside a person inside the file
    } catch (JsonException $e) {
        throw new RuntimeException("$path is not JSON: " . $e->getMessage() . '.');
    }
    if (!is_array($data) || ($data !== [] && array_is_list($data))) {
        throw new RuntimeException("$path does not hold one flat object, {key: text}.");
    }
    if (($data['format'] ?? null) !== BACKUP_FORMAT) {
        return $data;
    }
    $values = $data['translations']['values'][$code] ?? null;
    if (!is_array($values) || ($values !== [] && array_is_list($values))) {
        throw new RuntimeException("$path is a backup, and holds no strings of the language \"$code\".");
    }

    return $values;
}
