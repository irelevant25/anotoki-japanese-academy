<?php
// The app's own strings: what the migrations leave in the database against
// what the frontend asks for (so a page never shows a key instead of a
// sentence, and no string is kept that nothing reads), and the form of every
// migration that writes them - 004 and after, and 009, which moved the words
// of the anotoki library's kit under the library's own keys.
//
// The rules a string keeps, the bundle, the grid and the scan itself are the
// anotoki library's (Anotoki\Lib\Translations, tested in anotoki-lib); this
// file holds this app's catalogue to them - the scan of this frontend
// (translation_key_scanner(), backend/tools/translation_keys.php), the
// library's checks of a save on every stored string, the English the pages
// keep for when there are no strings (read by the library's EnglishDictionary)
// - and the site's own reader of a backup's strings.
//
// Nothing here writes to the database: it is what the migrations made.
//
// The checks of the catalogue (every key in both languages, used and unused
// keys, the plural families, a migration's gate) have nothing to hold while
// no migration writes a string. They switch on by themselves: from the
// moment a migration holds "INSERT INTO translation_keys … VALUES"
// (string_migrations()), every one of them bites.
declare(strict_types=1);

use Anotoki\Lib\Translations\Cli\EnglishDictionary;
use Anotoki\Lib\Translations\Cli\KeyScanner;
use Anotoki\Lib\Translations\LibraryWords;
use Anotoki\Lib\Translations\Placeholders;
use Anotoki\Lib\Translations\Schema;
use Anotoki\Lib\Translations\TranslationFile;
use Anotoki\Lib\Translations\Translations;

require __DIR__ . '/../lib.php'; // before the app loads: a throwaway database and settings
require BACKEND . '/tools/translation_keys.php';

/** The forms of a plural family, as Intl.PluralRules names the ones English and Slovak have. */
const PLURAL_FORMS = ['one', 'few', 'other'];

/**
 * The migrations that write strings in 004's form - keys inserted from a list
 * of VALUES. Until the first of them is there the database has no keys, and
 * the checks against the frontend have nothing to hold it to; from then on
 * every one of them bites. (009 copies strings under the library's keys from
 * the rows that are there, in a form of its own: its own test, below.)
 *
 * @return string[]
 */
function string_migrations(): array
{
    static $found = null;
    if ($found === null) {
        $files = array_map('basename', glob(MIGRATIONS_DIR . '/*.sql') ?: []);
        sort($files);
        $found = array_values(array_filter(
            $files,
            static fn (string $file): bool => (bool) preg_match('/INSERT\s+INTO\s+translation_keys\b[^;]*?\bVALUES\b/i', sql_code((string) file_get_contents(MIGRATIONS_DIR . "/$file")))
        ));
    }
    return $found;
}

/**
 * A migration's SQL without its comments and with every string emptied (''),
 * line endings as \n: what is left is what it does. A comment may hold an
 * apostrophe and a string two dashes, so both are read in one pass.
 */
function sql_code(string $sql): string
{
    $sql = str_replace("\r\n", "\n", $sql);
    $out = '';
    for ($i = 0, $n = strlen($sql); $i < $n; $i++) {
        if ($sql[$i] === '-' && ($sql[$i + 1] ?? '') === '-') {
            $end = strpos($sql, "\n", $i);
            $i = ($end === false ? $n : $end) - 1;
        } elseif ($sql[$i] === "'") {
            for ($i++; $i < $n; $i++) {
                if ($sql[$i] === "'") {
                    if (($sql[$i + 1] ?? '') !== "'") {
                        break;
                    }
                    $i++; // '' inside a string: an apostrophe
                }
            }
            $out .= "''";
        } else {
            $out .= $sql[$i];
        }
    }
    return $out;
}

/** @return string[] every key the database has, by name - the anotoki library's too */
function database_keys(): array
{
    test_db();
    return array_column(db_all('SELECT name FROM translation_keys ORDER BY name COLLATE "C"'), 'name');
}

/** @return string[] the app's own keys: every key but the anotoki library's (anotoki.) */
function app_keys(): array
{
    return array_values(array_filter(database_keys(), static fn (string $key): bool => !LibraryWords::isLibraryKey($key)));
}

/** The keys that have no string in a language. */
function keys_without(string $code): array
{
    test_db();
    return array_column(db_all(
        'SELECT k.name FROM translation_keys k
          WHERE NOT EXISTS (SELECT 1 FROM translations t WHERE t.key_name = k.name AND t.language_code = ?)
          ORDER BY k.name COLLATE "C"',
        [$code]
    ), 'name');
}

/** A list in the order of its values: for two lists that must hold the same, whatever order each was written in. */
function in_order(array $list): array
{
    sort($list, SORT_STRING);
    return $list;
}

/** A temp folder of this file's own, removed when its tests end. */
function temp_dir(string $what): string
{
    $dir = str_replace('\\', '/', sys_get_temp_dir()) . "/academy-test-$what-" . getmypid() . '-' . bin2hex(random_bytes(4));
    mkdir($dir, 0777, true);
    $GLOBALS['temp_dirs'][] = $dir;
    return $dir;
}

after(function (): void {
    foreach ($GLOBALS['temp_dirs'] ?? [] as $dir) {
        if (!is_dir($dir) || !str_contains($dir, '/academy-test-')) {
            continue;
        }
        $items = new RecursiveIteratorIterator(new RecursiveDirectoryIterator($dir, FilesystemIterator::SKIP_DOTS), RecursiveIteratorIterator::CHILD_FIRST);
        foreach ($items as $item) {
            $item->isDir() ? @rmdir($item->getPathname()) : @unlink($item->getPathname());
        }
        @rmdir($dir);
    }
});

/** A small frontend to scan: $files as relative path => contents, written with Windows line endings. */
function sources(array $files): string
{
    $root = temp_dir('sources');
    foreach ($files as $relative => $contents) {
        if (!is_dir(dirname("$root/$relative"))) {
            mkdir(dirname("$root/$relative"), 0777, true);
        }
        // Whatever line endings this file itself was checked out with.
        file_put_contents("$root/$relative", str_replace(["\r\n", "\n"], ["\n", "\r\n"], $contents));
    }
    return $root;
}

/**
 * The keys a string migration names, place by place: the rows it inserts into
 * translation_keys, the strings it inserts for each language, and the list its
 * closing gate checks. Read from the file's text: the way the file is written
 * is the pattern every one of them follows.
 *
 *   INSERT INTO translation_keys (name, description) VALUES
 *       ('home.title', '…'),
 *   ON CONFLICT (name) DO NOTHING;
 *
 *   INSERT INTO translations (key_name, language_code, value)
 *   SELECT v.key_name, 'en', v.value FROM (VALUES
 *       ('home.title', '…'),
 *   ) AS v(key_name, value)
 *   ON CONFLICT (key_name, language_code) DO NOTHING;
 *
 *   DO $$ … FROM (VALUES ('home.title'), … ) AS k(name) … $$;
 *
 * @param string $path the migration file
 *
 * @return array{keys: string[], strings: array<string, string[]>, gate: string[]}
 */
function migration_keys(string $path): array
{
    $sql = str_replace("\r\n", "\n", (string) file_get_contents($path));
    // A pattern that could not run (a limit of PCRE's) says so, rather than finding nothing.
    $read = static function ($result) use ($path) {
        if ($result === false) {
            throw new RuntimeException("$path could not be read: " . preg_last_error_msg());
        }
        return $result;
    };
    // The first thing of a row: its key, at the start of a line.
    $rows = static function (string $block) use ($read): array {
        $read(preg_match_all("/^\\s*\\('([^']+)',/m", $block, $m));
        return $m[1];
    };

    $found = ['keys' => [], 'strings' => [], 'gate' => []];
    if ($read(preg_match('/INSERT\s+INTO\s+translation_keys\b[^;]*?\bVALUES\b(.*?)\nON CONFLICT/s', $sql, $m))) {
        $found['keys'] = $rows($m[1]);
    }
    $read(preg_match_all("/INSERT\\s+INTO\\s+translations\\b[^;]*?SELECT\\s+v\\.key_name,\\s*'([a-z-]+)',[^;]*?\\bVALUES\\b(.*?)\nON CONFLICT/s", $sql, $blocks, PREG_SET_ORDER));
    foreach ($blocks as $block) {
        $found['strings'][$block[1]] = $rows($block[2]);
    }
    // The list right before "AS k(name)", and no other: 004's gate also lists the languages it needs.
    // Found from its end, the last VALUES before it: one pattern spanning from any VALUES to "AS k(name)"
    // runs out of PCRE's JIT stack on a whole catalogue (tens of kilobytes between two VALUES).
    if ($read(preg_match('/\)\s*AS\s+k\s*\(name\)/', $sql, $end, PREG_OFFSET_CAPTURE))) {
        $before = substr($sql, 0, $end[0][1]);
        if ($read(preg_match_all('/\bVALUES\b/', $before, $all, PREG_OFFSET_CAPTURE))) {
            $list = substr($before, end($all[0])[1] + strlen('VALUES'));
            $read(preg_match_all("/\\('([^']+)'\\)/", $list, $gate));
            $found['gate'] = $gate[1];
        }
    }
    return $found;
}

/* ------------------------------------------------ what the migrations leave */

test('the two languages the app is released in, English first; and the keys, once a migration writes them', function (): void {
    test_db();
    assert_same([
        ['code' => 'en', 'name' => 'English', 'native_name' => 'English', 'enabled' => true, 'sort_order' => 1],
        ['code' => 'sk', 'name' => 'Slovak', 'native_name' => 'Slovenčina', 'enabled' => true, 'sort_order' => 2],
    ], db_all('SELECT code, name, native_name, enabled, sort_order FROM languages ORDER BY sort_order'));

    if (string_migrations() === []) {
        assert_same([], app_keys(), 'no migration writes strings yet, so there are none');
    } else {
        assert_true(app_keys() !== [], implode(', ', string_migrations()) . ' left no keys');
    }

    // the database keeps its own rules
    assert_throws(static fn () => db_exec("INSERT INTO languages (code, name, native_name) VALUES ('EN', 'x', 'x')"), '/check/i');
    assert_throws(static fn () => db_exec("INSERT INTO translations (key_name, language_code, value) VALUES ('no.such', 'en', 'x')"), '/foreign key/i');
    assert_same(
        'FOREIGN KEY (updated_by) REFERENCES users(id) ON UPDATE CASCADE ON DELETE SET NULL',
        db_value("SELECT pg_get_constraintdef(oid) FROM pg_constraint WHERE conrelid = 'translations'::regclass AND conname = 'translations_updated_by_fkey'"),
        'who reworded a string follows a moved user id, and nobody\'s leaving takes a string along'
    );
    // The three tables are the site's, not a person's: no user_id, and no part of anybody's study data.
    assert_same([], array_values(array_intersect(USER_TABLES, ['languages', 'translation_keys', 'translations'])));
    assert_same(0, (int) db_value("SELECT count(*) FROM information_schema.columns WHERE table_name IN ('languages', 'translation_keys', 'translations') AND column_name = 'user_id'"));
});

test('the anotoki library\'s words: its set runs after this site\'s own, and its keys are in the database, described as it describes them', function (): void {
    $sets = db_migration_sets();
    assert_same([MIGRATION_SET, Schema::SET], array_map(static fn ($set): string => $set->name, $sets), 'this site\'s own first: its 004 made the tables');
    assert_true($sets[1]->library && !$sets[0]->library);
    assert_same(str_replace('\\', '/', Schema::directory()), str_replace('\\', '/', $sets[1]->directory));

    test_db();
    $library = array_values(array_filter(database_keys(), static fn (string $key): bool => LibraryWords::isLibraryKey($key)));
    assert_same(in_order(LibraryWords::keys()), in_order($library), 'every key of the library, and none of its own beside them');
    $descriptions = array_column(db_all("SELECT name, description FROM translation_keys WHERE name LIKE 'anotoki.%'"), 'description', 'name');
    foreach (LibraryWords::all() as $key => $words) {
        assert_same($words['description'], $descriptions[$key] ?? null, "$key: the library's description");
    }
    // No migration of this app's writes a key of the library's namespace in 004's form: they are the library's.
    foreach (string_migrations() as $file) {
        assert_same([], array_values(array_filter(migration_keys(MIGRATIONS_DIR . "/$file")['keys'], [LibraryWords::class, 'isLibraryKey'])), "$file writes no anotoki. key");
    }
});

test('every key has an English string, and a Slovak one', function (): void {
    assert_same([], keys_without('en'), 'keys with no English string: nothing to fall back to');
    assert_same([], keys_without('sk'), 'keys with no Slovak string');
});

test('a plural family has .one, .few and .other in both languages, and nothing else ends in them', function (): void {
    $keys = database_keys();
    $families = [];
    foreach ($keys as $key) {
        if (preg_match('/^(.+)\.(' . implode('|', PLURAL_FORMS) . ')$/D', $key, $m)) {
            $families[$m[1]] = true;
        }
    }
    $incomplete = [];
    foreach (array_keys($families) as $family) {
        foreach (PLURAL_FORMS as $form) {
            if (!in_array("$family.$form", $keys, true)) {
                $incomplete[] = "$family.$form";
            }
        }
    }
    assert_same([], $incomplete, 'a key ending in .one, .few or .other is a form of a plural, and a plural has all three');
    // "in both languages" is the test above: every key has both.
});

test('no namespace is named after a file the frontend names: "changelog.json" would read as a key', function (): void {
    $namespaces = array_values(array_unique(array_map([KeyScanner::class, 'namespaceOf'], app_keys())));
    assert_same([], array_values(array_intersect($namespaces, ['changelog'])), 'the dialog\'s words are under whatsNew');
    assert_false(in_array('anotoki', $namespaces, true), 'anotoki. is the library\'s namespace, and no key of the app\'s');
    foreach (database_keys() as $key) {
        assert_true(KeyScanner::shapeOk($key), "$key is not the shape of a key, so the scan cannot find it");
    }
});

test('every language a migration writes strings for is one that cannot be deleted', function (): void {
    test_db();
    $written = array_column(db_all('SELECT DISTINCT language_code FROM translations ORDER BY language_code'), 'language_code');
    assert_same([], array_values(array_diff($written, TRANSLATION_SEEDED_LANGUAGES)), 'add them to TRANSLATION_SEEDED_LANGUAGES: deleting one would make the next string migration fail');

    $languages = array_column(db_all('SELECT code FROM languages'), 'code');
    assert_same([], array_values(array_diff(TRANSLATION_SEEDED_LANGUAGES, $languages)), 'and each of them is a language here');
    assert_true(in_array(Translations::FALLBACK, TRANSLATION_SEEDED_LANGUAGES, true));
    assert_same(TRANSLATION_SEEDED_LANGUAGES, academy_translations_config()->releasedLanguages, 'the library is told so');
    if (string_migrations() !== []) {
        assert_same(in_order(TRANSLATION_SEEDED_LANGUAGES), in_order($written), 'the list names exactly the languages the migrations write');
    }
});

test('every key the frontend uses is in the database, and every key in the database is used', function (): void {
    $scan = translation_key_scanner()->scan(database_keys());
    assert_same([], $scan['problems'], 'what the scan does not let through');

    if (string_migrations() === []) {
        // Nothing is written yet, so nothing the frontend already asks for can
        // be found: from the first migration with strings on, all of it is held.
        return;
    }
    assert_same([], $scan['missing'], 'used by the frontend, not in the database: the page would show the key (php backend/translations.php --status)');
    assert_same([], $scan['unused'], 'in the database, used nowhere: delete them with a migration');
    assert_true(is_file(translation_keys_frontend_root() . '/' . TRANSLATION_DYNAMIC_KEYS_FILE), 'the keys put together at run time are declared in ' . TRANSLATION_DYNAMIC_KEYS_FILE);
    assert_false(array_key_exists('anotoki.topbar.sections', $scan['used'] + $scan['missing']), 'the library\'s keys are never looked for: its Angular half asks for them');
});

test('the exam\'s section and part names are for exactly the ids the server sends', function (): void {
    // The page words a section and a part from its id (exam.section.<id>, exam.part.<id>): a section the
    // server gains, or one a string is missing for, would show as a key on the exam's setup screen.
    $file = translation_keys_frontend_root() . '/' . TRANSLATION_DYNAMIC_KEYS_FILE;
    $declared = is_file($file) ? KeyScanner::dynamic((string) file_get_contents($file))['prefixes'] : [];
    $keys = database_keys();
    $seeded = string_migrations() !== [];

    $families = ['exam.section.' => array_column(SECTIONS, 'id'), 'exam.part.' => array_map('strval', array_column(BOOKS, 'id'))];
    assert_same(15, count($families['exam.section.']));
    foreach ($families as $prefix => $expected) {
        // What the frontend declares: held from the moment it lists any.
        if ($seeded || ($declared[$prefix] ?? []) !== []) {
            assert_same(in_order($expected), in_order($declared[$prefix] ?? []), "the tails of '$prefix' in " . TRANSLATION_DYNAMIC_KEYS_FILE);
        }
        if ($seeded) {
            $tails = [];
            foreach ($keys as $key) {
                if (str_starts_with($key, $prefix)) {
                    $tails[] = substr($key, strlen($prefix));
                }
            }
            assert_same(in_order($expected), in_order($tails), "the keys under '$prefix' in the database");
        }
    }
});

test('every string the migrations wrote passes the checks a save makes, as it is - the anotoki library\'s, with this app\'s ways', function (): void {
    // Otherwise a string nobody could save again would be released: the grid sends a cell back whole, and a
    // rule the seed does not keep (a brace, a length, a placeholder the English does not have, a space at
    // its end) would refuse it. The library's keys among them: an anotoki. key keeps the library's
    // placeholders, whatever the app's copy of it says (009 copied the app's words there).
    test_db();
    if (string_migrations() !== []) {
        assert_true((int) db_value('SELECT count(*) FROM translations') > 200, 'the strings are there to check');
    }
    assert_same([], academy_translations()->storedRefusals(), 'what a save would refuse of what is stored');

    // The placeholders the library's keys take are its own: the copies 009 made of the app's words keep them.
    $english = translations_of(Translations::FALLBACK);
    foreach (LibraryWords::keys() as $key) {
        assert_same(LibraryWords::placeholders($key), Placeholders::names($english[$key] ?? ''), "$key: the library's placeholders");
    }
});

/**
 * The frontend's files that keep English for what they draw while there may be no strings (keptWord()),
 * in a `const ENGLISH` map, and how many entries each has at least. core/kit.config.ts keeps the English of
 * the library's keys whose words in this app are its own (the bar's sections, the theme's "System"): the
 * kit reads them while there are no strings, over the library's built-in English.
 */
const KEPT_ENGLISH_FILES = [
    'standin/problem/problem.component.ts' => 6,
    'standin/sign-in/sign-in.component.ts' => 2,
    'top-bar/top-bar.component.ts' => 6,
    'core/kit.config.ts' => 2,
];

/** Every kept English map of the frontend, read whole by the library's reader: [file => [key => English]]. */
function kept_english(): array
{
    $kept = [];
    foreach (array_keys(KEPT_ENGLISH_FILES) as $file) {
        $kept[$file] = EnglishDictionary::read(translation_keys_frontend_root() . '/' . $file, 'ENGLISH');
    }
    return $kept;
}

test('the English kept for a page drawn with no strings (the problem page, the Sign in card, the top bar and the kit\'s words) is the seeded English, word for word', function (): void {
    // It is what a start that failed shows while the browser kept no strings; reworded in one place only,
    // the page would say one thing before the strings come and another after.
    test_db();
    $seeded = translations_of(Translations::FALLBACK);
    foreach (kept_english() as $file => $entries) {
        assert_true(count($entries) >= KEPT_ENGLISH_FILES[$file], "$file: the entries are read");
        foreach ($entries as $key => $english) {
            assert_same($seeded[$key] ?? null, $english, "$file: $key");
        }
    }
});

test('the kit says the same words before the strings come and after: the library\'s English, or the app\'s kept over it, is the seeded English of every library key', function (): void {
    // With no strings in memory the kit reads its built-in words, unless the app keeps its own English for a
    // library key (core/kit.config.ts, `libraryWords`); with them, the database's - which 009 made the app's.
    test_db();
    $seeded = translations_of(Translations::FALLBACK);
    $kit = kept_english()['core/kit.config.ts'];
    foreach (array_keys($kit) as $key) {
        assert_true(LibraryWords::isLibraryKey($key), "core/kit.config.ts keeps English for library keys only: $key");
        assert_true($kit[$key] !== LibraryWords::english($key), "$key: kept only where the app's words are not the library's own");
    }
    foreach (LibraryWords::keys() as $key) {
        assert_same($seeded[$key] ?? null, $kit[$key] ?? LibraryWords::english($key), "$key: what the kit says with no strings");
    }
});

test('a string migration\'s gate checks exactly the keys the migration writes, and writes each in every language', function (): void {
    // The reader itself, on a file written the way 004 is: its gate also lists the languages it needs,
    // and they are not taken for keys.
    $example = temp_dir('migration') . '/999_test_example.sql';
    file_put_contents($example, str_replace("\n", "\r\n", <<<'SQL'
        INSERT INTO translation_keys (name, description) VALUES
            -- home: the first page
            ('home.title', 'The heading; it''s short'),
            ('home.due.one', 'A label under a number (not a row of its own)')
        ON CONFLICT (name) DO NOTHING;

        INSERT INTO translations (key_name, language_code, value)
        SELECT v.key_name, 'en', v.value FROM (VALUES
            ('home.title', 'Home'),
            ('home.due.one', 'review due')
        ) AS v(key_name, value)
        ON CONFLICT (key_name, language_code) DO NOTHING;

        INSERT INTO translations (key_name, language_code, value)
        SELECT v.key_name, 'sk', v.value FROM (VALUES
            ('home.title', 'Domov')
        ) AS v(key_name, value)
        ON CONFLICT (key_name, language_code) DO NOTHING;

        DO $$
        DECLARE
            missing text;
        BEGIN
            SELECT string_agg(wanted.code, ', ') INTO missing
              FROM (VALUES ('en'), ('sk')) AS wanted(code)
             WHERE NOT EXISTS (SELECT 1 FROM languages l WHERE l.code = wanted.code);
            SELECT string_agg(k.name, ', ' ORDER BY k.name) INTO missing
              FROM (VALUES
                  ('home.title'), ('home.due.one')
              ) AS k(name)
             WHERE NOT EXISTS (SELECT 1 FROM translation_keys tk WHERE tk.name = k.name);
        END $$;

        -- end of 999
        SQL));
    assert_same(
        ['keys' => ['home.title', 'home.due.one'], 'strings' => ['en' => ['home.title', 'home.due.one'], 'sk' => ['home.title']], 'gate' => ['home.title', 'home.due.one']],
        migration_keys($example),
        'the rows it inserts, each language\'s strings, and the gate\'s own list'
    );

    assert_same(['004_languages_and_translations.sql', '005_own_time_zone_and_words.sql', '006_admin_panel_words.sql', '007_visitors.sql'],
        array_slice(string_migrations(), 0, 4), 'the migrations in 004\'s form (009 copies, in a form of its own)');
    foreach (string_migrations() as $file) {
        $found = migration_keys(MIGRATIONS_DIR . "/$file");
        assert_true($found['keys'] !== [], "$file: the keys it inserts could not be read");
        assert_same($found['keys'], array_values(array_unique($found['keys'])), "$file: a key is inserted twice");
        assert_same(in_order($found['keys']), in_order($found['gate']), "$file: the keys its gate checks are not the keys it inserts; a key left out of the gate could lack a string and nothing would say so");
        assert_same(in_order(TRANSLATION_SEEDED_LANGUAGES), in_order(array_keys($found['strings'])), "$file: one block of strings a language");
        foreach ($found['strings'] as $code => $keys) {
            assert_same(in_order($found['keys']), in_order($keys), "$file: the keys with a string in \"$code\" are not the keys it inserts");
        }
    }
});

/* ------------------------------------------------- each migration's form */

test('migration 004 makes and fills its own three tables, and touches no other', function (): void {
    $file = '004_languages_and_translations.sql';
    $code = sql_code((string) file_get_contents(MIGRATIONS_DIR . "/$file"));
    assert_same("a \nb '' c\nd '' ", sql_code("a -- it's a comment\r\nb 'it''s -- a string' c\nd '' -- e"), 'comments out, strings emptied');

    preg_match_all('/\bCREATE\s+TABLE\s+(?:IF\s+NOT\s+EXISTS\s+)?(\w+)/i', $code, $made);
    assert_same(['languages', 'translation_keys', 'translations'], $made[1], 'the three tables');
    preg_match_all('/\bINSERT\s+INTO\s+(\w+)/i', $code, $filled);
    assert_same([], array_values(array_diff(array_unique($filled[1]), ['languages', 'translation_keys', 'translations'])), 'rows go into its own tables only');
    assert_true(in_array('languages', $filled[1], true), 'the two languages');

    // "ON UPDATE CASCADE" and "ON DELETE SET NULL" are what a foreign key does, not a statement.
    $statements = (string) preg_replace('/\bON\s+(UPDATE|DELETE)\b/i', '', $code);
    assert_no_match('/\b(UPDATE|DELETE|ALTER|DROP|TRUNCATE)\b/i', $statements, 'it changes and removes nothing: the study tables are as they were');
    preg_match_all('/\bREFERENCES\s+(\w+)/i', $code, $references);
    assert_same(['languages', 'translation_keys', 'users'], in_order(array_values(array_unique($references[1]))), 'users is only pointed at');
    assert_match('/\bDO \$\$/', $code, 'and it ends with a check that fails it loudly');
});

/** The keys migration 005 deletes, every one of them: what nothing asks for any more. */
const MIGRATION_005_DELETED_KEYS = ['error.no_access', 'error.this_computer_only', 'account.signedInAs', 'account.userId'];

test('migration 005 in 004\'s form: one column added to users, the three translation tables written, rewords only of the seeded words, deletes only of the listed keys, a check at its end', function (): void {
    $file = '005_own_time_zone_and_words.sql';
    $sql = (string) file_get_contents(MIGRATIONS_DIR . "/$file");
    assert_match('/^-- 005 — .+ \(\d{4}-\d{2}-\d{2}\)\n/', $sql, 'a header that says what and when');
    assert_false(str_contains($sql, "\r"), 'its line endings are 004\'s');
    $lines = preg_split('/\R/', rtrim($sql));
    if (end($lines) !== '-- end of 005') {
        assert_same([$file], array_values(array_intersect(test_config_migration_drafts(), [$file])), 'without its last line it is a draft');
        assert_match('/THIS FILE IS A DRAFT until its last line is "-- end of 005"/', $sql, 'and says so at its top');
    }

    // What it does, statement by statement (the strings emptied, the check taken out).
    $code = sql_code($sql);
    assert_same(1, preg_match_all('/\bDO \$\$.*?\bEND \$\$;/s', $code, $checks), 'one check');
    assert_match('/\bDO \$\$.*?\bEND \$\$;\s*$/s', $code, 'and it is the last thing it does');
    $statements = array_values(array_filter(array_map('trim', explode(';', (string) preg_replace('/\bDO \$\$.*?\bEND \$\$;/s', '', $code)))));
    $added = 0;
    foreach ($statements as $statement) {
        $statement = (string) preg_replace('/\s+/', ' ', $statement);
        if (preg_match('/^ALTER TABLE users ADD COLUMN time_zone varchar\(64\)( CHECK \(time_zone <> \'\'\))?$/', $statement)) {
            $added++;
            continue;
        }
        $allowed = preg_match('/^COMMENT ON COLUMN users\.time_zone IS \'\'$/', $statement)
            || preg_match('/^INSERT INTO (translation_keys|translations) \(.*\bON CONFLICT \([a-z_, ]+\) DO NOTHING$/', $statement)
            || preg_match('/^UPDATE translations SET value = \'\', updated_at = now\(\) WHERE key_name = \'\' AND language_code = \'\' AND value = \'\'$/', $statement)
            || preg_match('/^UPDATE translation_keys SET description = \'\' WHERE name = \'\'$/', $statement)
            || preg_match('/^DELETE FROM translation_keys WHERE name IN \((\'\'(, )?)+\)$/', $statement);
        assert_true((bool) $allowed, "not in 005's form: $statement");
    }
    assert_same(1, $added, 'users gains its one column, time_zone, and nothing else changes in a table of anybody\'s');

    // The keys it deletes are exactly the list: a rewording the owner made goes with a deleted key.
    preg_match_all('/DELETE\s+FROM\s+translation_keys\s+WHERE\s+name\s+IN\s+\(([^)]*)\)/i', (string) preg_replace('/--[^\n]*/', '', $sql), $deletes);
    preg_match_all("/'([^']+)'/", implode(',', $deletes[1]), $names);
    assert_same(in_order(MIGRATION_005_DELETED_KEYS), in_order($names[1]), 'the keys it deletes');

    // The check: the column, as the app keeps it.
    preg_match('/\bDO \$\$.*?\bEND \$\$;/s', (string) preg_replace('/--[^\n]*/', '', $sql), $check);
    assert_match("/table_name = 'users' AND column_name = 'time_zone'/", $check[0] ?? '', 'the check looks at the column');
    assert_match("/character_maximum_length = 64/", $check[0] ?? '', 'of its size');
    assert_match("/RAISE EXCEPTION '005_own_time_zone_and_words: /", $check[0] ?? '', 'and fails the migration loudly, by name');
});

test('migration 006 in 004\'s form: keys and strings written, rewords only of the seeded words, no table and no other row touched, a check at its end', function (): void {
    $file = '006_admin_panel_words.sql';
    $sql = (string) file_get_contents(MIGRATIONS_DIR . "/$file");
    assert_match('/^-- 006 — .+ \(\d{4}-\d{2}-\d{2}\)\n/', $sql, 'a header that says what and when');
    assert_false(str_contains($sql, "\r"), 'its line endings are 004\'s');
    $lines = preg_split('/\R/', rtrim($sql));
    if (end($lines) !== '-- end of 006') {
        assert_same([$file], array_values(array_intersect(test_config_migration_drafts(), [$file])), 'without its last line it is a draft');
        assert_match('/THIS FILE IS A DRAFT until its last line is "-- end of 006"/', $sql, 'and says so at its top');
    }

    $code = sql_code($sql);
    assert_same(1, preg_match_all('/\bDO \$\$.*?\bEND \$\$;/s', $code), 'one check');
    assert_match('/\bDO \$\$.*?\bEND \$\$;\s*$/s', $code, 'and it is the last thing it does');
    $statements = array_values(array_filter(array_map('trim', explode(';', (string) preg_replace('/\bDO \$\$.*?\bEND \$\$;/s', '', $code)))));
    foreach ($statements as $statement) {
        $statement = (string) preg_replace('/\s+/', ' ', $statement);
        $allowed = preg_match('/^INSERT INTO (translation_keys|translations) \(.*\bON CONFLICT \([a-z_, ]+\) DO NOTHING$/', $statement)
            || preg_match('/^UPDATE translations SET value = \'\', updated_at = now\(\) WHERE key_name = \'\' AND language_code = \'\' AND value = \'\'$/', $statement)
            || preg_match('/^UPDATE translation_keys SET description = \'\' WHERE name = \'\'$/', $statement);
        assert_true((bool) $allowed, "not in 004's form: $statement");
    }

    // Each reword is of the text 004 or 005 wrote, and the check names that text: the owner's own wording stays.
    preg_match_all("/^UPDATE translations SET value = '((?:[^']|'')*)', updated_at = now\\(\\) WHERE key_name = '([^']+)' AND language_code = '([a-z]+)' AND value = '((?:[^']|'')*)';$/m", $sql, $rewords, PREG_SET_ORDER);
    assert_same(4, count($rewords), 'two keys, in English and Slovak');
    preg_match('/\bDO \$\$.*?\bEND \$\$;/s', $sql, $check);
    foreach ($rewords as [, , $key, $language, $old]) {
        assert_true(str_contains($check[0] ?? '', "('$key', '$language', '$old')"), "$key ($language): the check looks for the old text");
    }
    assert_match("/RAISE EXCEPTION '006_admin_panel_words: /", $check[0] ?? '', 'and fails the migration loudly, by name');
    test_db();
    assert_same(['Admin panel', 'Administrátorský panel'], [translations_of('en')['topbar.admin'] ?? null, translations_of('sk')['topbar.admin'] ?? null]);
});

/** The keys migration 008 deletes, every one of them: the words of the pages the anotoki library took over. */
const MIGRATION_008_DELETED_KEYS = ['boot.notSetUp.title', 'boot.notSetUp.text', 'boot.notSetUp.setup', 'boot.notSetUp.open', 'boot.notSetUp.why', 'boot.problem.migrations'];

test('migration 008 in 005\'s form: the listed keys deleted, and nothing else touched, a check at its end', function (): void {
    $file = '008_library_status_page.sql';
    $sql = (string) file_get_contents(MIGRATIONS_DIR . "/$file");
    assert_match('/^-- 008 — .+ \(\d{4}-\d{2}-\d{2}\)\n/', $sql, 'a header that says what and when');
    assert_false(str_contains($sql, "\r"), 'its line endings are 004\'s');
    $lines = preg_split('/\R/', rtrim($sql));
    if (end($lines) !== '-- end of 008') {
        assert_same([$file], array_values(array_intersect(test_config_migration_drafts(), [$file])), 'without its last line it is a draft');
        assert_match('/THIS FILE IS A DRAFT until its last line is "-- end of 008"/', $sql, 'and says so at its top');
    } else {
        assert_no_match('/THIS FILE IS A DRAFT/', $sql, 'final: its top says so no more');
    }

    $code = sql_code($sql);
    assert_same(1, preg_match_all('/\bDO \$\$.*?\bEND \$\$;/s', $code), 'one check');
    assert_match('/\bDO \$\$.*?\bEND \$\$;\s*$/s', $code, 'and it is the last thing it does');
    $statements = array_values(array_filter(array_map('trim', explode(';', (string) preg_replace('/\bDO \$\$.*?\bEND \$\$;/s', '', $code)))));
    assert_true($statements !== [], 'it does something');
    foreach ($statements as $statement) {
        $statement = (string) preg_replace('/\s+/', ' ', $statement);
        assert_match('/^DELETE FROM translation_keys WHERE name IN \((\'\'(, )?)+\)$/', $statement, "not in 005's form: $statement");
    }

    // The keys it deletes are exactly the list (their strings go with them), and its check looks for each.
    preg_match_all('/DELETE\s+FROM\s+translation_keys\s+WHERE\s+name\s+IN\s+\(([^)]*)\)/i', (string) preg_replace('/--[^\n]*/', '', $sql), $deletes);
    preg_match_all("/'([^']+)'/", implode(',', $deletes[1]), $names);
    assert_same(in_order(MIGRATION_008_DELETED_KEYS), in_order($names[1]), 'the keys it deletes');
    preg_match('/\bDO \$\$.*?\bEND \$\$;/s', (string) preg_replace('/--[^\n]*/', '', $sql), $check);
    foreach (MIGRATION_008_DELETED_KEYS as $key) {
        assert_true(str_contains($check[0] ?? '', "('$key')"), "$key: the check looks for it");
    }
    assert_match("/RAISE EXCEPTION '008_library_status_page: /", $check[0] ?? '', 'and fails the migration loudly, by name');
    assert_same([], array_values(array_intersect(MIGRATION_008_DELETED_KEYS, database_keys())), 'gone from the database it was applied to');
});

/**
 * 009's work, key by key: the app's key whose strings it copies, the library's
 * key that carries them from then on, and whether the app's own key goes
 * (only the bar read it) or stays (the app reads it too).
 */
const MIGRATION_009_COPIES = [
    'topbar.sections' => ['anotoki.topbar.sections', true],
    'topbar.phoneMenu' => ['anotoki.topbar.phoneMenu', true],
    'topbar.menuButton' => ['anotoki.topbar.menuButton', true],
    'topbar.menu' => ['anotoki.topbar.menu', true],
    'account.signOut' => ['anotoki.topbar.signOut', true],
    'signOut.saving' => ['anotoki.topbar.saving', true],
    'language.button' => ['anotoki.language.button', true],
    'language.notLoaded' => ['anotoki.language.notLoaded', true],
    'theme.label' => ['anotoki.theme.label', true],
    'theme.light' => ['anotoki.theme.light', true],
    'theme.dark' => ['anotoki.theme.dark', true],
    'theme.system' => ['anotoki.theme.auto', true],
    'theme.systemHint' => ['anotoki.theme.autoHint', true],
    'topbar.roleAdmin' => ['anotoki.topbar.roleAdmin', true],
    'topbar.roleEditor' => ['anotoki.topbar.roleEditor', true],
    'account.yourAccount' => ['anotoki.topbar.account', true],
    'topbar.admin' => ['anotoki.topbar.admin', false],
    'signIn.button' => ['anotoki.topbar.signIn', false],
    'common.close' => ['anotoki.ui.close', false],
];

test('migration 009 in a form of its own: a temporary copy of the strings it moves, keys and strings inserted from it, one description, the listed keys deleted, a check at its end that names every one', function (): void {
    $file = '009_strings_through_the_library.sql';
    $sql = (string) file_get_contents(MIGRATIONS_DIR . "/$file");
    assert_match('/^-- 009 — .+ \(\d{4}-\d{2}-\d{2}\)\n/', $sql, 'a header that says what and when');
    assert_false(str_contains($sql, "\r"), 'its line endings are 004\'s');
    $lines = preg_split('/\R/', rtrim($sql));
    if (end($lines) !== '-- end of 009') {
        assert_same([$file], array_values(array_intersect(test_config_migration_drafts(), [$file])), 'without its last line it is a draft');
        assert_match('/THIS FILE IS A DRAFT until its last line is "-- end of 009"/', $sql, 'and says so at its top');
    } else {
        assert_no_match('/THIS FILE IS A DRAFT/', $sql, 'final: its top says so no more');
    }

    // What it does, statement by statement (the strings emptied, the check taken out): nothing but the three tables
    // of the words, and in these forms only.
    $code = sql_code($sql);
    assert_same(1, preg_match_all('/\bDO \$\$.*?\bEND \$\$;/s', $code), 'one check');
    assert_match('/\bDO \$\$.*?\bEND \$\$;\s*$/s', $code, 'and it is the last thing it does');
    $statements = array_values(array_filter(array_map('trim', explode(';', (string) preg_replace('/\bDO \$\$.*?\bEND \$\$;/s', '', $code)))));
    $forms = [
        'the copy' => '/^CREATE TEMP TABLE academy_009_words ON COMMIT DROP AS SELECT m\.own_key, m\.library_key, t\.language_code, t\.value, t\.updated_at, t\.updated_by FROM \(VALUES (\(\'\', \'\'\),? ?)+\) AS m\(own_key, library_key\) JOIN translations t ON t\.key_name = m\.own_key$/',
        'the library\'s keys' => '/^INSERT INTO translation_keys \(name, description\) SELECT DISTINCT library_key, \'\' FROM academy_009_words ON CONFLICT \(name\) DO NOTHING$/',
        'their strings' => '/^INSERT INTO translations \(key_name, language_code, value, updated_at, updated_by\) SELECT library_key, language_code, value, updated_at, updated_by FROM academy_009_words ON CONFLICT \(key_name, language_code\) DO NOTHING$/',
        'a description' => '/^UPDATE translation_keys SET description = \'\' WHERE name = \'\'$/',
        'the deletes' => '/^DELETE FROM translation_keys WHERE name IN \((\'\'(, )?)+\)$/',
    ];
    $seen = [];
    foreach ($statements as $statement) {
        $statement = (string) preg_replace('/\s+/', ' ', $statement);
        $form = null;
        foreach ($forms as $what => $pattern) {
            if (preg_match($pattern, $statement) === 1) {
                $form = $what;
            }
        }
        assert_true($form !== null, "not in 009's form: $statement");
        $seen[] = $form;
    }
    assert_same(array_keys($forms), $seen, 'each once, in this order: the copies first, the deletes last');
    assert_no_match('/\bUPDATE\s+translations\b/i', $code, 'no string is reworded: every one goes on as it is');

    // The copies are exactly the list, each to its library key; the deletes the keys that go; the check names every one.
    $text = (string) preg_replace('/--[^\n]*/', '', $sql);
    preg_match('/CREATE TEMP TABLE academy_009_words.*?AS m\(own_key, library_key\)/s', $text, $copy);
    preg_match_all("/\\('([^']+)', '([^']+)'\\)/", $copy[0] ?? '', $pairs, PREG_SET_ORDER);
    assert_same(array_map(static fn (array $c): string => $c[0], MIGRATION_009_COPIES), array_column($pairs, 2, 1), 'the copies, each to its library key');
    foreach (MIGRATION_009_COPIES as [$library]) {
        assert_true(in_array($library, LibraryWords::keys(), true), "$library: a key of the library's");
    }
    preg_match_all('/DELETE\s+FROM\s+translation_keys\s+WHERE\s+name\s+IN\s+\(([^)]*)\)/i', $text, $deletes);
    preg_match_all("/'([^']+)'/", implode(',', $deletes[1]), $names);
    $gone = array_keys(array_filter(MIGRATION_009_COPIES, static fn (array $c): bool => $c[1]));
    assert_same(in_order($gone), in_order($names[1]), 'the keys it deletes: those only the kit read');
    preg_match('/\bDO \$\$.*?\bEND \$\$;/s', $text, $check);
    foreach ($gone as $key) {
        assert_true(str_contains($check[0] ?? '', "('$key')"), "$key: the check looks for it to be gone");
    }
    foreach (array_keys(array_filter(MIGRATION_009_COPIES, static fn (array $c): bool => !$c[1])) as $key) {
        assert_true(str_contains($check[0] ?? '', "('$key')"), "$key: the check looks for it to stay");
    }
    assert_match("/RAISE EXCEPTION '009_strings_through_the_library: /", $check[0] ?? '', 'and fails the migration loudly, by name');

    // On the database it was applied to: the library's keys carry the app's words, the moved keys are gone.
    test_db();
    $english = translations_of('en');
    $slovak = translations_of('sk');
    foreach (MIGRATION_009_COPIES as $own => [$library, $goes]) {
        assert_same($goes, !in_array($own, database_keys(), true), "$own: " . ($goes ? 'gone' : 'still the app\'s'));
    }
    assert_same(['The app’s sections', 'Časti aplikácie'], [$english['anotoki.topbar.sections'] ?? null, $slovak['anotoki.topbar.sections'] ?? null], 'the app\'s words, not the library\'s "Main navigation"');
    assert_same(['System', 'Systémový'], [$english['anotoki.theme.auto'] ?? null, $slovak['anotoki.theme.auto'] ?? null]);
    assert_same(['Cancel', 'Zrušiť'], [$english['anotoki.ui.cancel'] ?? null, $slovak['anotoki.ui.cancel'] ?? null], 'a library key the app had no words for: the library\'s');
});

/* --------------------------------------------------------------- the scan */

test('the scan of this frontend: every .ts and .html of src/app but the specs, core/testing/ and the IAM\'s SDK; comments are no keys', function (): void {
    $scanner = translation_key_scanner();
    $root = translation_keys_frontend_root();
    $files = $scanner->sourceFiles();
    assert_same(str_replace('\\', '/', $root), $scanner->root());
    assert_true(in_array('app.routes.ts', $files, true) && in_array('app.component.html', $files, true), 'the sources are where the scan looks');
    assert_true(is_file("$root/core/auth/sdk/anotoki-auth.d.ts"), 'the IAM\'s SDK is where the scan leaves it out');
    foreach ($files as $file) {
        assert_match('/\.(ts|html)$/', $file);
        assert_no_match('~\.spec\.ts$|^core/testing/|^core/auth/sdk/~', $file);
    }
    assert_same("a\n\n\nb 'c/*' \"d//\" `e\n//` f \ng", KeyScanner::sourceText("a\r\n/* x\r\n 'y' */\r\nb 'c/*' \"d//\" `e\n//` f // 'z'\r\ng", false), 'comments out, strings as they are, line for line');
    assert_same("a\n\nb", KeyScanner::sourceText("a<!-- 'x'\n -->\nb", true));
});

test('the scan: a file\'s name has a key\'s shape, which is why no namespace is named after one', function (): void {
    // core/changelog/changelog.service.ts names the file it fetches: 'changelog.json'.
    $root = sources([
        'core/changelog/changelog.service.ts' => "const FILE = 'changelog.json';\nconst title = this.i18n.t('whatsNew.title');\n",
        'core/changelog/changelog.component.html' => "<h2>{{ 'whatsNew.title' | translate }}</h2>\n",
    ]);
    $scan = translation_key_scanner($root)->scan(['whatsNew.title', 'whatsNew.latest']);
    assert_same([[], [], ['whatsNew.latest']], [$scan['problems'], $scan['missing'], $scan['unused']], 'the dialog\'s words under whatsNew: the file\'s name is nobody\'s key');
    assert_same(['core/changelog/changelog.component.html:1', 'core/changelog/changelog.service.ts:2'], $scan['used']['whatsNew.title']);

    // With a "changelog" namespace the very same line would be a key the database lacks, for ever.
    $named = translation_key_scanner($root)->scan(['changelog.title', 'whatsNew.title']);
    assert_same(['changelog.json' => ['core/changelog/changelog.service.ts:1']], $named['missing']);
});

/* --------------------------------------------- a language's strings from a file */

test('the strings of a language out of a file: a flat export as it is, or a backup\'s translations.values.<code>', function (): void {
    $dir = temp_dir('strings');
    $values = ['home.title' => 'Prehľad', 'format' => 'a key may be named so', '12' => 'a key that looks like a number'];
    TranslationFile::write("$dir/sk.json", $values);
    assert_same($values, translation_file_strings("$dir/sk.json", 'sk'), 'a flat export is that language\'s, whatever code is asked');
    assert_same($values, translation_file_strings("$dir/sk.json", 'de'));
    file_put_contents("$dir/windows.json", "\xEF\xBB\xBF" . str_replace("\n", "\r\n", TranslationFile::text($values)));
    assert_same($values, translation_file_strings("$dir/windows.json", 'sk'), 'as an editor on Windows saves it');
    file_put_contents("$dir/empty.json", "{}\n");
    assert_same([], translation_file_strings("$dir/empty.json", 'sk'));
    file_put_contents("$dir/list.json", '["a", "b"]');
    file_put_contents("$dir/broken.json", '{"a": ');
    file_put_contents("$dir/text.json", '"a"');
    assert_throws(static fn () => translation_file_strings("$dir/list.json", 'sk'), '/one flat object/');
    assert_throws(static fn () => translation_file_strings("$dir/text.json", 'sk'), '/one flat object/');
    assert_throws(static fn () => translation_file_strings("$dir/broken.json", 'sk'), '/is not JSON/');
    assert_throws(static fn () => translation_file_strings("$dir/nothing.json", 'sk'), '/There is no file/');

    $backup = ['format' => BACKUP_FORMAT, 'version' => BACKUP_VERSION, 'takenAt' => '2026-09-30T06:00:00.000Z', 'database' => 'academy_test_example', 'everybody' => true,
        'users' => [['id' => 1, 'username' => null, 'kanji' => ['items' => ['k:大' => ['stage' => 4, 'notes' => ['meaning' => 'big']]]], 'log' => [], 'attempts' => [['attempt' => ['responses' => [['a' => ['b' => ['c' => 1]]]]]]]]],
        'translations' => ['languages' => [], 'values' => ['en' => ['home.title' => 'Dashboard'], 'sk' => ['home.title' => 'Prehľad'], 'de' => new stdClass()]]];
    file_put_contents("$dir/academy-2026-09-30.json", json_text($backup) . "\n");
    assert_same(['home.title' => 'Prehľad'], translation_file_strings("$dir/academy-2026-09-30.json", 'sk'), 'a backup nests deeper than a file of strings may');
    assert_same(['home.title' => 'Dashboard'], translation_file_strings("$dir/academy-2026-09-30.json", 'en'));
    assert_same([], translation_file_strings("$dir/academy-2026-09-30.json", 'de'), 'a language with no strings of its own');
    assert_throws(static fn () => translation_file_strings("$dir/academy-2026-09-30.json", 'fr'), '/is a backup, and holds no strings of the language "fr"/');

    // A backup from before the app kept its words in the database, or a copy of one person alone: it holds none.
    file_put_contents("$dir/academy-old.json", json_text(array_diff_key($backup, ['translations' => 0])) . "\n");
    assert_throws(static fn () => translation_file_strings("$dir/academy-old.json", 'sk'), '/is a backup, and holds no strings of the language "sk"/');
    file_put_contents("$dir/academy-odd.json", json_text(['translations' => ['values' => ['sk' => ['a', 'b']]]] + $backup) . "\n");
    assert_throws(static fn () => translation_file_strings("$dir/academy-odd.json", 'sk'), '/holds no strings of the language "sk"/');
});
