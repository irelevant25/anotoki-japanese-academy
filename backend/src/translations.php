<?php
/**
 * The app's own words, in the languages it speaks: the anotoki library's
 * translations module (Anotoki\Lib\Translations, the Composer package
 * anotoki/lib - every anotoki site's, since anotoki-lib 0.3.0), set up here
 * for this app. (The study material is not here, and is never translated: the
 * kanji, the words, their readings and glosses and the exam's questions come
 * from backend/data/.)
 *
 * The library keeps the three tables' one shape (its migration set
 * anotoki_translations, after this site's own: db_migration_sets()), the
 * bundle every page reads, the grid the admin panel rewords the strings in,
 * the languages, every check of a string (a key is the code's; English is
 * what every other language falls back to, so it cannot be switched off,
 * deleted or left without a string; a {placeholder} is the code's; a string
 * is text, never HTML) and the command line's work (backend/translations.php).
 * Its routes are the API's (api/routes/translations.php), in the one wire
 * format of every anotoki site, the IAM's: snake_case. Its own keys are under
 * anotoki.: the words of its kit (the top bar, the language and theme
 * switches, the dialogs) and of its status page.
 *
 * What stays this app's, here:
 *
 *   - the languages it is released in, English and Slovak: its migrations
 *     write strings for them, so they are never deleted
 *     (TRANSLATION_SEEDED_LANGUAGES);
 *   - a save of strings holds the writer's users row first, as every answer
 *     does (users_hold()): an administrator deleting that person's data
 *     meanwhile and the save take turns, and updated_by never names a row
 *     that went;
 *   - a language is deleted only after a copy of its strings in
 *     backend/storage/backups/ (translations_copy()): no copy, no delete; the
 *     answer names the file;
 *   - a backup of everybody carries the words too (translations_backup());
 *   - who may do what: the route groups' checks (api/middleware/staff.php) -
 *     the editors and the administrators (the IAM roles EDITOR and ADMIN)
 *     reword the strings, only an administrator adds, changes or deletes a
 *     language.
 *
 * Its keys and their first strings are its migrations' (backend/migrations/
 * 004_languages_and_translations.sql and later ones). The three tables are
 * the site's, not a person's: everybody reads them, the admin panel writes
 * them, and no query here has a user id. The one place a person appears is
 * translations.updated_by, who last reworded a string: the request's person,
 * or null for a migration and the command line.
 */

declare(strict_types=1);

use Anotoki\Lib\Support\Refusal;
use Anotoki\Lib\Translations\LanguageUsage;
use Anotoki\Lib\Translations\Schema;
use Anotoki\Lib\Translations\TranslationFile;
use Anotoki\Lib\Translations\Translations;
use Anotoki\Lib\Translations\TranslationsConfig;

/**
 * The languages the migrations write strings for. They cannot be deleted: the
 * next migration with strings would fail on the missing language, and a failed
 * migration closes the whole site, on a host with no shell to mend it from.
 * backend/tests/unit/translations.test.php keeps this list true.
 */
const TRANSLATION_SEEDED_LANGUAGES = ['en', 'sk'];

/**
 * The largest body the admin panel's addresses take: every string of a
 * language is a few dozen kB. The library's routes measure a body against it
 * too (TranslationsConfig::$bodyLimit, the same 1 MiB).
 */
const TRANSLATIONS_BODY_LIMIT = 1024 * 1024;

/**
 * How the copy of a language's strings, taken before it is deleted, is named
 * in backend/storage/backups/ (translations_copy()). It is a flat {key: text}, not a backup of
 * study data: the setup page leaves these out of the backups it offers.
 */
const TRANSLATIONS_COPY_PREFIX = 'academy-before-language-delete-';

/**
 * The library's translations on this app's connection (db(), the one every
 * answer uses: a save's transaction and users_hold() share it), with this
 * app's ways (academy_translations_config()). Made when a request needs it,
 * as db_migrator() is.
 */
function academy_translations(): Translations
{
    return new Translations(db(), academy_translations_config());
}

/**
 * What is this app's own in the library's translations: the languages it is
 * released in, its work around a language's delete (academy_language_usage()),
 * and the writer's row held before a save writes anything. The rest - the
 * limits, a body of at most 1 MiB, the checks - is the family's, as the
 * library has it. (Its arguments in order, without their names: this file
 * stays parseable by PHP 7.4, CLAUDE.md.)
 */
function academy_translations_config(): TranslationsConfig
{
    return new TranslationsConfig(
        TRANSLATION_SEEDED_LANGUAGES,  // releasedLanguages
        [],                            // serverNamespaces: every key is the pages'
        [],                            // rules: the library's own
        null,                          // extraCheck
        academy_language_usage(),      // usage
        static function (PDO $pdo, ?int $userId): void {
            // beforeWrite, inside the save's transaction: the writer's row held, as an answer holds it
            if ($userId !== null) {
                users_hold($userId);
            }
        }
    );
}

/**
 * What this app does around a language's delete (the library's LanguageUsage):
 * a copy of its strings first, in the backups, named in the answer and the
 * audit's details ({copy}); a copy that cannot be written throws, and the
 * delete is rolled back with the language and its strings as they were. No
 * table of the app's refers to a language, so nothing else counts or refuses.
 */
function academy_language_usage(): LanguageUsage
{
    return new class implements LanguageUsage {
        public function extras(PDO $pdo, array $codes): array
        {
            return [];
        }

        public function refuseDelete(PDO $pdo, string $code): ?Refusal
        {
            return null;
        }

        public function beforeDelete(PDO $pdo, string $code, array $strings): array
        {
            return ['copy' => basename(translations_copy($code, $strings))];
        }
    };
}

/** Are the three tables there? Not while the migration that makes them (004) has not run. */
function translations_ready(): bool
{
    return Schema::ready(db());
}

/* ------------------------------------------------------------ the copies */

/**
 * Before a language is deleted: its own strings, $strings ([key => text], as
 * an export gives them), in
 * backend/storage/backups/academy-before-language-delete-<code>-<time>.json:
 * one flat JSON object, a key a line (the library's TranslationFile, the
 * export's format). Put back with php backend/translations.php --import
 * <code> <file>, once the language is there again. Returns the file.
 *
 * @param array<string, string> $strings
 */
function translations_copy(string $code, array $strings): string
{
    $dir = backup_dir();
    if (!is_dir($dir) && !mkdir($dir, 0777, true) && !is_dir($dir)) {
        throw new RuntimeException("Cannot create the backup folder $dir");
    }
    $file = "$dir/" . TRANSLATIONS_COPY_PREFIX . "$code-" . utc_stamp(now_ms()) . '.json';
    file_put_atomic($file, TranslationFile::text($strings));
    return $file;
}

/**
 * The languages and every string, for a backup of everybody
 * (backup_data() in src/backup.php):
 * {languages: [all, as the Languages page lists them], values: {code: {key: text}}},
 * each language's own strings. Null before migration 004. A restore never
 * reads it (the strings are the site's, not anybody's study data): they are
 * put back, a language at a time, with php backend/translations.php --import
 * <code> <the backup>.
 */
function translations_backup(): ?array
{
    if (!translations_ready()) {
        return null;
    }
    $languages = academy_translations()->languages();
    $values = array_fill_keys(array_column($languages, 'code'), []);
    foreach (db_all('SELECT language_code, key_name, value FROM translations ORDER BY language_code, key_name COLLATE "C"') as $row) {
        $values[$row['language_code']][$row['key_name']] = $row['value'];
    }
    return ['languages' => $languages, 'values' => (object) array_map(static fn (array $own): object => (object) $own, $values)];
}
