<?php
// The app's own strings: what the migrations leave in the database against
// what the frontend asks for (so a page never shows a key instead of a
// sentence, and no string is kept that nothing reads), the rules a string
// must keep (backend/src/translations.php), and the scan that finds the
// frontend's keys (backend/tools/translation_keys.php), tested on sources of
// its own.
//
// Nothing here writes to the database: it is what the migrations made.
//
// The checks of the catalogue (every key in both languages, used and unused
// keys, the plural families, a migration's gate) have nothing to hold while
// no migration writes a string. They switch on by themselves: from the
// moment a migration holds "INSERT INTO translation_keys" (string_migrations()),
// every one of them bites.
declare(strict_types=1);

require __DIR__ . '/../lib.php'; // before the app loads: a throwaway database and settings
require BACKEND . '/tools/translation_keys.php';

/**
 * The migrations that write strings. Until the first of them is there the
 * database has no keys, and the checks against the frontend have nothing to
 * hold it to; from then on every one of them bites.
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
            static fn (string $file): bool => (bool) preg_match('/INSERT\s+INTO\s+translation_keys\b/i', sql_code((string) file_get_contents(MIGRATIONS_DIR . "/$file")))
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

/** @return string[] every key the database has, by name */
function database_keys(): array
{
    test_db();
    return array_column(db_all('SELECT name FROM translation_keys ORDER BY name COLLATE "C"'), 'name');
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

/** A value for a message, bytes that are not text included (test_show() is for what JSON can write). */
function shown($value): string
{
    $text = json_encode($value, JSON_UNESCAPED_UNICODE | JSON_INVALID_UTF8_SUBSTITUTE | JSON_PARTIAL_OUTPUT_ON_ERROR);
    return is_string($text) ? $text : gettype($value);
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
 * What translations_check() refuses $values with: [code, what it is about];
 * or the changes it would make.
 *
 * @param mixed $values
 */
function check($values, array $english = ['test.hello' => 'Hello, {name}!', 'test.bye' => 'Goodbye', 'test.count' => '{count} questions', 'test.step' => 'Step {n} of {m}']): array
{
    try {
        return translations_check($values, ['test.hello', 'test.bye', 'test.count', 'test.step', 'test.new'], ['en' => 'English', 'sk' => 'Slovak'], $english);
    } catch (TranslationRefused $e) {
        assert_same(422, $e->status);
        assert_same([422, ['error' => $e->getMessage(), 'code' => $e->errorCode] + $e->extra], $e->answer(), 'and as a route answers it');
        return [$e->errorCode, $e->extra];
    }
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
        assert_same([], database_keys(), 'no migration writes strings yet, so there are none');
    } else {
        assert_true(database_keys() !== [], implode(', ', string_migrations()) . ' left no keys');
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

test('every key has an English string, and a Slovak one', function (): void {
    assert_same([], keys_without('en'), 'keys with no English string: nothing to fall back to');
    assert_same([], keys_without('sk'), 'keys with no Slovak string');
});

test('a translation uses no placeholder its English string does not have', function (): void {
    test_db();
    $english = translations_of(TRANSLATION_FALLBACK);
    $wrong = [];
    foreach (db_all('SELECT key_name, language_code, value FROM translations WHERE language_code <> ? ORDER BY key_name COLLATE "C", language_code', [TRANSLATION_FALLBACK]) as $row) {
        $extra = array_diff(translation_placeholders($row['value']), translation_placeholders($english[$row['key_name']] ?? ''));
        if ($extra !== []) {
            $wrong[] = "{$row['key_name']} ({$row['language_code']}): {" . implode('}, {', $extra) . '}';
        }
    }
    assert_same([], $wrong, 'the app fills in only the placeholders the English string has');
});

test('a plural family has .one, .few and .other in both languages, and nothing else ends in them', function (): void {
    $keys = database_keys();
    $families = [];
    foreach ($keys as $key) {
        if (preg_match('/^(.+)\.(' . implode('|', TRANSLATION_PLURAL_FORMS) . ')$/D', $key, $m)) {
            $families[$m[1]] = true;
        }
    }
    $incomplete = [];
    foreach (array_keys($families) as $family) {
        foreach (TRANSLATION_PLURAL_FORMS as $form) {
            if (!in_array("$family.$form", $keys, true)) {
                $incomplete[] = "$family.$form";
            }
        }
    }
    assert_same([], $incomplete, 'a key ending in .one, .few or .other is a form of a plural, and a plural has all three');
    // "in both languages" is the test above: every key has both.
});

test('no namespace is named after a file the frontend names: "changelog.json" would read as a key', function (): void {
    $namespaces = array_values(array_unique(array_map('translation_key_namespace', database_keys())));
    assert_same([], array_values(array_intersect($namespaces, ['changelog'])), 'the dialog\'s words are under whatsNew');
    foreach (database_keys() as $key) {
        assert_true(translation_key_shape_ok($key), "$key is not the shape of a key, so the scan cannot find it");
    }
});

test('every language a migration writes strings for is one that cannot be deleted', function (): void {
    test_db();
    $written = array_column(db_all('SELECT DISTINCT language_code FROM translations ORDER BY language_code'), 'language_code');
    assert_same([], array_values(array_diff($written, TRANSLATION_SEEDED_LANGUAGES)), 'add them to TRANSLATION_SEEDED_LANGUAGES: deleting one would make the next string migration fail');

    $languages = array_column(db_all('SELECT code FROM languages'), 'code');
    assert_same([], array_values(array_diff(TRANSLATION_SEEDED_LANGUAGES, $languages)), 'and each of them is a language here');
    assert_true(in_array(TRANSLATION_FALLBACK, TRANSLATION_SEEDED_LANGUAGES, true));
    if (string_migrations() !== []) {
        assert_same(in_order(TRANSLATION_SEEDED_LANGUAGES), in_order($written), 'the list names exactly the languages the migrations write');
    }
});

test('every key the frontend uses is in the database, and every key in the database is used', function (): void {
    $scan = translation_keys_scan(translation_keys_frontend_root(), database_keys());
    assert_same([], $scan['problems'], 'what the scan does not let through');

    if (string_migrations() === []) {
        // Nothing is written yet, so nothing the frontend already asks for can
        // be found: from the first migration with strings on, all of it is held.
        return;
    }
    assert_same([], $scan['missing'], 'used by the frontend, not in the database: the page would show the key (php backend/translations.php --status)');
    assert_same([], $scan['unused'], 'in the database, used nowhere: delete them with a migration');
    assert_true(is_file(translation_keys_frontend_root() . '/' . TRANSLATION_DYNAMIC_KEYS_FILE), 'the keys put together at run time are declared in ' . TRANSLATION_DYNAMIC_KEYS_FILE);
});

test('the exam\'s section and part names are for exactly the ids the server sends', function (): void {
    // The page words a section and a part from its id (exam.section.<id>, exam.part.<id>): a section the
    // server gains, or one a string is missing for, would show as a key on the exam's setup screen.
    $file = translation_keys_frontend_root() . '/' . TRANSLATION_DYNAMIC_KEYS_FILE;
    $declared = is_file($file) ? translation_keys_dynamic((string) file_get_contents($file))['prefixes'] : [];
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

/* -------------------------------------------------- the rules a string keeps */

test('a language code: two small letters, or two and two; and nothing else reaches a query', function (): void {
    foreach (['en', 'sk', 'pt-br', 'zh-tw'] as $code) {
        assert_true(language_code_ok($code), $code);
    }
    foreach (['', 'e', 'eng', 'EN', 'En', 'en-', 'en-GB', 'en_gb', 'en-gbr', 'e1', ' en', "en\n", "sk\0", "\xFF\xFE", 'en-gb-x', 5, null, ['en'], true] as $code) {
        assert_false(language_code_ok($code), shown($code));
    }
    assert_same(null, language_row("\xFF"), 'no query for what is not a code: bytes that are not text would be a database error');
});

test('text is measured the way people see it: characters, the browser\'s spaces, and no control characters', function (): void {
    assert_same('žlt', text_clip('žltý kôň', 3));
    assert_same('', text_clip("\xFF\xFE", 3), 'bytes that are not text');
    assert_same('日本', text_clip('日本', 5));
    assert_same(8, text_length('žltý kôň'), 'characters, not bytes');
    assert_same(3, text_length("a\nb"), 'a line break is a character');
    assert_same('a b', text_clean("a\x07 \x00b\x7F"), 'control characters dropped');
    assert_same("a\tb\r\nc", text_clean("a\tb\r\nc"), 'tabs and line breaks kept');
    foreach ([5, null, ['a'], true, 1.5, "\xC3\x28"] as $value) {
        assert_same(null, text_clean($value), shown($value) . ' is not text');
    }
    // What the browser's trim() takes away, and nothing more.
    assert_same('a', text_trim("\u{FEFF}\u{00A0}\u{2003}\t a \u{3000}\u{2028}\r\n"));
    assert_same("\u{0085}a\u{180E}", text_trim("\u{0085}a\u{180E}"), 'two characters PHP counts as spaces and the browser does not');
});

test('placeholders: {name}, the same expression as the frontend fills in', function (): void {
    assert_same(['name', 'count'], translation_placeholders('Hello, {name}! {count} of {count} - {name}'));
    assert_same(['a_b', 'A1'], translation_placeholders('{a_b} {A1}'));
    assert_same([], translation_placeholders('{} {1a} { name } {na-me} {_x} plain'));
});

test('a save is checked whole: the shape, the key, the language, the text, its length, its placeholders', function (): void {
    assert_same([], check([]), 'nothing to change');
    assert_same(
        [['key' => 'test.bye', 'language' => 'en', 'value' => 'Bye'], ['key' => 'test.hello', 'language' => 'sk', 'value' => 'Dobrý deň, {name}!']],
        check(['test.hello' => ['sk' => "  Dobrý\x07 deň, {name}! \u{00A0}"], 'test.bye' => ['en' => 'Bye']]),
        'control characters dropped, the spaces around it gone'
    );
    assert_same([['key' => 'test.hello', 'language' => 'sk', 'value' => null]], check(['test.hello' => ['sk' => " \t "]]), 'an empty string in another language: that string goes');
    assert_same([], check(['test.hello' => []]), 'a key with nothing to change');

    // Whatever order the cells were typed in, they are written by key and then by language: two
    // saves of the same strings take their rows in one order, and neither waits for the other for ever.
    $ordered = static fn (array $values): array => array_map(static fn (array $change): string => $change['key'] . ' ' . $change['language'], check($values));
    assert_same(['test.bye sk', 'test.hello en', 'test.hello sk'], $ordered(['test.hello' => ['sk' => 'A {name}', 'en' => 'B {name}'], 'test.bye' => ['sk' => 'C']]));
    assert_same(['test.bye sk', 'test.hello en', 'test.hello sk'], $ordered(['test.bye' => ['sk' => ''], 'test.hello' => ['en' => 'B {name}', 'sk' => '']]), 'the ones that go among the ones that are written');
    assert_same($ordered(['test.step' => ['sk' => 'x'], 'test.count' => ['sk' => 'y'], 'test.bye' => ['sk' => 'z']]), $ordered(['test.bye' => ['sk' => 'z'], 'test.count' => ['sk' => 'y'], 'test.step' => ['sk' => 'x']]));

    $invalid = [
        'nothing' => null, 'a text' => 'text', 'a number' => 5, 'a list' => ['a', 'b'],
        'a key with a text' => ['test.hello' => 'Hello'], 'a key with a list' => ['test.hello' => ['a', 'b']],
        'a number for a string' => ['test.hello' => ['sk' => 5]], 'a list for a string' => ['test.hello' => ['sk' => ['x']]], 'null for a string' => ['test.hello' => ['sk' => null]],
        '2001 characters' => ['test.bye' => ['sk' => str_repeat('á', 2001)]],
    ];
    foreach ($invalid as $what => $values) {
        assert_same('invalid_value', check($values)[0], $what);
    }
    assert_same(2000, text_length(check(['test.bye' => ['sk' => str_repeat('á', 2000)]])[0]['value']), '2000 characters, not bytes');

    assert_same(['unknown_key', ['key' => 'no.such', 'keys' => ['no.such', '12']]], check(['test.bye' => ['en' => 'Bye'], 'no.such' => ['en' => 'x'], '12' => ['sk' => 'y']]), 'every unknown key is named');
    assert_same(['unknown_language', ['key' => 'test.bye', 'language' => 'de']], check(['test.bye' => ['de' => 'Tschüss']]));
    assert_same(['fallback_required', ['key' => 'test.bye', 'language' => 'en']], check(['test.bye' => ['en' => "\x07 "]]), 'English is what the others fall back to');

    // the order of the checks: the key before the language, the language before the text
    assert_same('unknown_key', check(['no.such' => ['xx' => 5]])[0]);
    assert_same('unknown_language', check(['test.bye' => ['xx' => 5]])[0]);
    assert_same('invalid_value', check(['no.such' => 'text'])[0], 'the shape first');
});

test('a string with nothing in it to see is an empty one; and one too long to trim is too long, never empty', function (): void {
    // A zero-width space, a word joiner, a soft hyphen: trim() leaves each, and the page would draw an empty place.
    $unseen = ['a zero-width space' => "\u{200B}", 'a word joiner' => "\u{2060}", 'a soft hyphen' => "\u{00AD}", 'several, with spaces' => " \u{200B}\u{00A0}\u{200D}\t\u{FEFF} ", 'nothing' => '', 'spaces' => " \n "];
    foreach ($unseen as $what => $text) {
        assert_true(text_blank($text), $what);
        assert_same([['key' => 'test.bye', 'language' => 'sk', 'value' => null]], check(['test.bye' => ['sk' => $text]]), "$what in another language: that string goes");
        assert_same(['fallback_required', ['key' => 'test.bye', 'language' => 'en']], check(['test.bye' => ['en' => $text]]), "$what in English");
        try {
            language_name($text, 'The name in English');
            fail("$what was taken for a language's name");
        } catch (TranslationRefused $e) {
            assert_same('invalid_language', $e->errorCode, $what);
        }
    }
    assert_true(text_blank("\xFF\xFE"), 'bytes that are not text are nothing to read');

    // A character of that kind inside a word is part of the word: Persian and Indic spelling needs it.
    foreach (["Ah\u{200C}oj", "\u{200B}Ahoj", 'a', '.', "\u{0301}"] as $text) {
        assert_false(text_blank($text), shown($text));
    }
    assert_same("Ah\u{200C}oj", check(['test.bye' => ['sk' => " Ah\u{200C}oj "]])[0]['value'], 'kept as it was written');
    assert_same("می\u{200C}خواهم", language_name("می\u{200C}خواهم", 'The name as its speakers write it'));
    // text_trim() itself is the browser's trim(), and takes none of them away.
    assert_same("\u{200B}", text_trim(" \u{200B} "));

    // More spaces inside it than the expression can get through: the text comes back as it is,
    // and is refused for its length; not taken for an empty one, which would delete the stored string.
    $long = 'a' . str_repeat(' ', 1100000) . 'b';
    assert_same($long, text_trim($long));
    assert_false(text_blank($long));
    assert_same(['invalid_value', ['key' => 'test.bye', 'language' => 'sk']], check(['test.bye' => ['sk' => $long]]));
    assert_same(['invalid_value', ['key' => 'test.bye', 'language' => 'en']], check(['test.bye' => ['en' => $long]]), 'not fallback_required either');
    try {
        language_name($long, 'The name in English');
        fail('taken for a name');
    } catch (TranslationRefused $e) {
        assert_match('/1 to 50 characters/', $e->getMessage());
    }
    assert_same('b', text_trim(str_repeat(' ', 1100000) . 'b'), 'a run at either end is still trimmed');
    assert_same('a', text_trim('a' . str_repeat("\u{00A0}", 600000)));
});

test('placeholders are the code\'s: English keeps exactly its own, a translation may leave one out but never add one', function (): void {
    assert_same('Hi, {name}!', check(['test.hello' => ['en' => 'Hi, {name}!']])[0]['value'], 'reworded, the placeholder kept');
    assert_same(['placeholder_changed', ['key' => 'test.hello', 'language' => 'en', 'placeholder' => 'name']], check(['test.hello' => ['en' => 'Hi!']]));
    assert_same(['placeholder_changed', ['key' => 'test.hello', 'language' => 'en', 'placeholder' => 'who']], check(['test.hello' => ['en' => 'Hi, {name} and {who}!']]));
    assert_same(['placeholder_changed', ['key' => 'test.bye', 'language' => 'en', 'placeholder' => 'name']], check(['test.bye' => ['en' => 'Bye, {name}']]));

    assert_same('Vitaj!', check(['test.hello' => ['sk' => 'Vitaj!']])[0]['value'], 'a translation may say it without the placeholder');
    assert_same(['unknown_placeholder', ['key' => 'test.hello', 'language' => 'sk', 'placeholder' => 'meno']], check(['test.hello' => ['sk' => 'Ahoj, {name} {meno}!']]));
    // English sent with it does not change what the key has: the stored English string does
    assert_same('unknown_placeholder', check(['test.hello' => ['sk' => 'Ahoj {who}', 'en' => 'Hi {who}']])[0]);
    assert_same('placeholder_changed', check(['test.hello' => ['en' => 'Hi {who}', 'sk' => 'Ahoj {who}']])[0]);

    // a key with no English string yet: the English sent with it is what counts
    assert_same(2, count(check(['test.new' => ['sk' => 'Nové {a}', 'en' => 'New {a}']])));
    assert_same('unknown_placeholder', check(['test.new' => ['sk' => 'Nové {a}']])[0], 'with no English at all there is no placeholder to use');
    assert_same(1, count(check(['test.new' => ['sk' => 'Nové']])));

    // The sentences name the key and the placeholder: the owner's page shows them beside the cell.
    try {
        translations_check(['test.hello' => ['en' => 'Hi!']], ['test.hello'], ['en' => 'English'], ['test.hello' => 'Hello, {name}!']);
        fail('taken');
    } catch (TranslationRefused $e) {
        assert_same('The English string of "test.hello" must keep {name}: the app puts a value there.', $e->getMessage());
    }
    try {
        translations_check(['test.hello' => ['en' => 'Hi, {name} {title}!']], ['test.hello'], ['en' => 'English'], ['test.hello' => 'Hello, {name}!']);
        fail('taken');
    } catch (TranslationRefused $e) {
        assert_same('The English string of "test.hello" cannot use {title}: the app has no value for it.', $e->getMessage());
    }
    try {
        translations_check(['test.hello' => ['sk' => 'Ahoj, {meno}!']], ['test.hello'], ['sk' => 'Slovak'], ['test.hello' => 'Hello, {name}!']);
        fail('taken');
    } catch (TranslationRefused $e) {
        assert_same('The Slovak string of "test.hello" uses {meno}, which its English string does not have.', $e->getMessage());
    }
});

test('a brace is only ever part of a placeholder: one written any other way is refused, not shown to everybody', function (): void {
    // What the page would leave exactly as it is written: the name translated, a space inside, a brace too few or too many.
    $wrong = [
        'the name translated' => ['test.count', 'sk', '{počet} otázok'],
        'spaces inside' => ['test.count', 'sk', '{ count } otázok'],
        'never closed' => ['test.count', 'sk', '{count otázok'],
        'a space before it closes' => ['test.count', 'sk', '{count } otázok'],
        'two braces' => ['test.count', 'sk', '{{count}} otázok'],
        'one of two never closed' => ['test.step', 'sk', 'Krok {n / {m}'],
        'two braces in English' => ['test.step', 'en', 'Step {{n}} of {m}'],
        'a brace that only closes' => ['test.bye', 'sk', 'Dovidenia }'],
        'a brace in a string with no placeholder' => ['test.bye', 'en', 'Good {bye'],
        'an empty pair' => ['test.count', 'sk', '{count} {} otázok'],
    ];
    foreach ($wrong as $what => [$key, $code, $text]) {
        assert_same(['invalid_placeholder', ['key' => $key, 'language' => $code]], check([$key => [$code => $text]]), $what);
    }
    try {
        translations_check(['test.step' => ['sk' => 'Krok { n }']], ['test.step'], ['sk' => 'Slovak'], ['test.step' => 'Step {n} of {m}']);
        fail('taken');
    } catch (TranslationRefused $e) {
        assert_same('The Slovak string of "test.step" has a { or } that is not part of a placeholder. A placeholder is written exactly as the English string has it, like {n}: no spaces, and its name is not translated.', $e->getMessage(), 'it says how one is written, with one of the key\'s own');
    }
    try {
        translations_check(['test.bye' => ['sk' => 'Zbohom {']], ['test.bye'], ['sk' => 'Slovak'], ['test.bye' => 'Goodbye']);
        fail('taken');
    } catch (TranslationRefused $e) {
        assert_same('The Slovak string of "test.bye" has a { or } that is not part of a placeholder. This key has no placeholder, so its strings can hold no { or }.', $e->getMessage(), 'a key with no placeholder: none is offered, since it would be refused next');
    }

    // Before the placeholders are compared: a well-made one the key does not have is still the other refusal.
    assert_same('unknown_placeholder', check(['test.count' => ['sk' => '{meno} otázok']])[0]);
    assert_same('unknown_placeholder', check(['test.count' => ['sk' => '{Count} otázok']])[0], 'a placeholder\'s name is as it is written, capitals too');
    assert_same('placeholder_changed', check(['test.step' => ['en' => 'Step {n}']])[0]);
    // And what was fine is fine.
    assert_same('{count} otázok', check(['test.count' => ['sk' => '{count} otázok']])[0]['value']);
    assert_same('Krok {n} / {m}', check(['test.step' => ['sk' => 'Krok {n} / {m}']])[0]['value']);
    assert_same('Ahoj, {name}!', check(['test.hello' => ['sk' => 'Ahoj, {name}!']])[0]['value']);
    assert_same('Vitaj!', check(['test.hello' => ['sk' => 'Vitaj!']])[0]['value']);
});

test('every string the migrations wrote passes the checks a save makes, as it is', function (): void {
    // Otherwise a string nobody could save again would be released: the grid sends a cell back
    // whole, and a rule the seed does not keep (a brace, a length, a space at its end) would refuse it.
    test_db();
    $languages = array_column(db_all('SELECT code, name FROM languages'), 'name', 'code');
    $stored = [];
    foreach (db_all('SELECT key_name, language_code, value FROM translations ORDER BY key_name COLLATE "C", language_code') as $row) {
        $stored[$row['key_name']][$row['language_code']] = $row['value'];
    }
    if (string_migrations() !== []) {
        assert_true(count($stored) > 100, 'the strings are there to check');
    }

    $changes = translations_check($stored, database_keys(), $languages, translations_of(TRANSLATION_FALLBACK));
    $checked = [];
    foreach ($changes as $change) {
        $checked[$change['key']][$change['language']] = $change['value'];
    }
    assert_same($stored, $checked, 'every string comes back as it is kept');
});

/**
 * The frontend's files that keep English for what they draw while there may be no strings (keptWord()),
 * in a `const ENGLISH` map, and how many entries each has at least.
 */
const KEPT_ENGLISH_FILES = [
    'standin/problem/problem.component.ts' => 5,
    'standin/sign-in/sign-in.component.ts' => 2,
    'top-bar/top-bar.component.ts' => 15,
    'ui/theme-toggle/theme-toggle.component.ts' => 5,
    'core/i18n/language-chooser/language-chooser.component.ts' => 2,
];

test('the English kept for a page drawn with no strings (the problem page, the Sign in card, the top bar) is the seeded English, word for word', function (): void {
    // It is what a start that failed shows while the browser kept no strings; reworded in one place only,
    // the page would say one thing before the strings come and another after.
    test_db();
    $seeded = translations_of(TRANSLATION_FALLBACK);
    foreach (KEPT_ENGLISH_FILES as $file => $least) {
        $source = (string) file_get_contents(translation_keys_frontend_root() . '/' . $file);
        assert_true(preg_match('/const ENGLISH[^=]*=\s*\{(.*?)\n\};/s', $source, $map) === 1, "$file keeps its English in ENGLISH");
        preg_match_all('/\'([a-z][A-Za-z0-9_.-]*)\':\s*(?:\'((?:[^\'\\\\]|\\\\.)*)\'|"((?:[^"\\\\]|\\\\.)*)")/', $map[1], $entries, PREG_SET_ORDER);
        assert_true(count($entries) >= $least, "$file: the entries are read");
        foreach ($entries as $entry) {
            $english = stripcslashes(($entry[3] ?? '') !== '' ? $entry[3] : $entry[2]);
            assert_same($seeded[$entry[1]] ?? null, $english, "$file: {$entry[1]}");
        }
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

test('If-None-Match is compared the weak way: any tag of the list, with or without W/, or *; and as a server that compresses sends it back', function (): void {
    $etag = '"abc"';
    foreach (['"abc"', 'W/"abc"', '"x", "abc"', '"x" ,W/"abc" , "y"', '*', ' "abc" '] as $header) {
        assert_true(translations_not_modified($header, $etag), $header);
    }
    // Apache's mod_deflate and mod_brotli mark the tag of an answer they compressed, inside the quotes.
    foreach (['"abc-gzip"', 'W/"abc-gzip"', '"abc-br"', 'W/"abc-br"', '"abc-zstd"', '"x", "abc-gzip"', '"x-gzip" , W/"abc-gzip"'] as $header) {
        assert_true(translations_not_modified($header, $etag), $header);
    }
    foreach (['', 'abc', '"abd"', 'W/"x"', '"abc', 'w/"abc"', '"abd-gzip"', '"abc-gzipx"', '"abc-deflate"', 'abc-gzip"', '"abc-gzip', '"x-gzip"', '"abc-gzip-gzip"', '"abc"-gzip'] as $header) {
        assert_false(translations_not_modified($header, $etag), $header);
    }
});

/* ------------------------------------------------------------------ the scan */

test('the scan: a quoted literal with a key\'s shape in a namespace the database has; never an attribute\'s value, a comment, a spec', function (): void {
    $root = sources([
        'home/home.component.html' => <<<'HTML'
            <!-- {{ 'home.inAComment' | translate }} -->
            <h1>{{ 'home.title' | translate }}</h1>
            <p [text]="error.message" title="home.anAttribute" [class.on]="home.expression"></p>
            <button [attr.aria-label]="'common.close' | translate" (click)="close()">x</button>
            <span>{{ 'home.questions' | translatePlural: n }}</span>
            <span>{{ "home.doubleQuoted" | translate }}</span>
            <p>Don't stop: {{ 'home.afterAnApostrophe' | translate: { day: d } }} - it's fine</p>
            <!--
              'home.inALongComment'
            -->
            <em>{{ 'home.missing' | translate }}</em>
            HTML,
        'home/home.component.ts' => <<<'TS'
            import { Home } from './home.model';
            import { ApiService } from '../core/api/api.service';
            // 'home.inALineComment' is what a comment explains
            /* 'home.inABlockComment'
               'home.stillInIt' */
            const address = 'http://example.test/'; const afterIt = 'home.afterAnAddress';
            const accept = 'image/*'; const afterAGlob = 'home.afterAGlob'; /* and 'home.afterTheGlob' is a comment */
            const quote = 'it\'s'; const afterAQuote = 'home.afterAnEscape';
            this.status.set(this.i18n.t('home.saved'), `${this.i18n.t("home.inATemplate")}`);
            const notOurs = ['changelog.json', 'theme-boot.js', 'home', '.home.title', 'Home.title', 'home..title', 'home.ti tle', 'changelog.', `changelog.${kind}`];
            const inBackticks = `home.inBackticks`; const sentence = `home.title is ${what}, they say`;
            const label = word('exam.section.' + question.section) + word(`exam.part.${book.id}`);
            TS,
        'home/home.component.spec.ts' => "expect(text).toBe('home.onlyInASpec');\n",
        'core/testing/example.ts' => "export const example = 'home.onlyInTesting';\n",
        'core/auth/sdk/anotoki-auth.d.ts' => "export const sdk = 'home.inTheSdk';\n",
        'core/auth/auth.service.ts' => "const key = 'home.inTheAuthService';\n",
        'home/home.component.scss' => "/* 'home.inAStyle' */\n",
        'core/i18n/dynamic-keys.ts' => <<<'TS'
            /** The keys put together at run time: 'comment.': ['ignored']. */
            export const DYNAMIC_KEYS: Record<string, readonly string[]> = {
              // a comment: 'also.': ['ignored']
              'exam.section.': ['kana', 'vocab-jp-en'],
              'exam.part.': [
                '1',
                "2",
              ],
              'time.': ['now', 'inDays'],
              'error.': [],
            };
            TS,
    ]);
    $database = [
        'home.title', 'home.questions.one', 'home.questions.few', 'home.questions.other', 'home.doubleQuoted', 'home.afterAnApostrophe',
        'home.afterAnAddress', 'home.afterAGlob', 'home.afterAnEscape', 'home.saved', 'home.inATemplate', 'home.inTheAuthService', 'home.inBackticks',
        'home.inAComment', 'home.inALineComment', 'home.inABlockComment', 'home.onlyInASpec', 'home.onlyInTesting', 'home.inTheSdk', 'home.anAttribute', 'home.expression',
        'common.close', 'common.unused', 'error.message', 'error.unknown',
        'exam.section.kana', 'exam.section.vocab-jp-en', 'exam.section.keigo', 'exam.part.1', 'exam.part.2',
        'time.now', 'time.inDays.one', 'time.inDays.few', 'time.inDays.other',
    ];
    $scan = translation_keys_scan($root, $database);

    assert_same([], $scan['problems']);
    assert_same(['home.missing' => ['home/home.component.html:11']], $scan['missing'], 'asked for, and not there');
    assert_same([
        'common.unused', 'error.message', 'error.unknown', 'exam.section.keigo',
        'home.anAttribute', 'home.expression', 'home.inABlockComment', 'home.inAComment', 'home.inALineComment', 'home.inTheSdk', 'home.onlyInASpec', 'home.onlyInTesting',
    ], $scan['unused'], 'an attribute\'s value is an expression; comments, specs, the example data and the IAM\'s SDK do not count; nor does a key under a declared prefix that is not listed');
    assert_same(['home/home.component.html:2'], $scan['used']['home.title'], 'with the file and the line');
    assert_same(['home/home.component.ts:7'], $scan['used']['home.afterAGlob'], 'the lines are the file\'s, comments or not');
    assert_same(['home/home.component.html:5'], $scan['used']['home.questions.few'], 'a plural is asked for by its family\'s name');
    assert_same(['core/i18n/dynamic-keys.ts'], $scan['used']['time.inDays.other'], 'a declared key may be a family too');
    assert_same(['core/i18n/dynamic-keys.ts'], $scan['used']['exam.part.2'], 'a tail may be a number, on a line of its own, in either quote');
    assert_same(['core/i18n/dynamic-keys.ts'], $scan['used']['exam.section.vocab-jp-en']);
    assert_same(count($database) - count($scan['unused']), count($scan['used']));

    // A namespace the database does not have is nobody's key: 'changelog.json' is a file.
    assert_same([], translation_keys_scan($root, [])['used']);
    assert_same(['exam.part.1', 'exam.part.2', 'exam.section.kana', 'exam.section.vocab-jp-en', 'time.inDays', 'time.now'], array_keys(translation_keys_scan($root, [])['missing']), 'but what is declared must exist, whatever the database has');
    assert_same(['home/home.component.ts:11'], $scan['used']['home.inBackticks'], 'a template literal with nothing put into it is a literal');
    assert_same(['home.afterAGlob', 'home.afterAnAddress', 'home.afterAnApostrophe', 'home.afterAnEscape', 'home.doubleQuoted', 'home.inATemplate', 'home.inBackticks', 'home.inTheAuthService', 'home.missing', 'home.questions', 'home.saved', 'home.title'],
        array_values(array_filter(array_keys(translation_keys_scan($root, ['home.x'])['missing']), static fn (string $key): bool => str_starts_with($key, 'home.'))), 'every literal of a namespace the database has');
});

test('the scan: a file\'s name has a key\'s shape, which is why no namespace is named after one', function (): void {
    // core/changelog/changelog.service.ts names the file it fetches: 'changelog.json'.
    $root = sources([
        'core/changelog/changelog.service.ts' => "const FILE = 'changelog.json';\nconst title = this.i18n.t('whatsNew.title');\n",
        'core/changelog/changelog.component.html' => "<h2>{{ 'whatsNew.title' | translate }}</h2>\n",
    ]);
    $scan = translation_keys_scan($root, ['whatsNew.title', 'whatsNew.latest']);
    assert_same([[], [], ['whatsNew.latest']], [$scan['problems'], $scan['missing'], $scan['unused']], 'the dialog\'s words under whatsNew: the file\'s name is nobody\'s key');
    assert_same(['core/changelog/changelog.component.html:1', 'core/changelog/changelog.service.ts:2'], $scan['used']['whatsNew.title']);

    // With a "changelog" namespace the very same line would be a key the database lacks, for ever.
    $named = translation_keys_scan($root, ['changelog.title', 'whatsNew.title']);
    assert_same(['changelog.json' => ['core/changelog/changelog.service.ts:1']], $named['missing']);
});

test('the scan: a plural family with a form missing names the form', function (): void {
    $root = sources(['a.component.html' => "{{ 'session.steps' | translatePlural: n }}\n{{ 'session.step' | translate }}\n"]);
    $scan = translation_keys_scan($root, ['session.steps.one', 'session.steps.other', 'session.step']);
    assert_same(['session.steps.few' => ['a.component.html:1']], $scan['missing']);
    assert_same(['session.step', 'session.steps.one', 'session.steps.other'], array_keys($scan['used']));
    assert_same([], $scan['unused']);
    assert_same([], $scan['problems'], 'a family with a form missing is a family: the form is what is missing');
});

test('the scan: a key asked for the wrong way (a family as one string, one string as a family) shows the key, and fails', function (): void {
    // Both "exist", so by the keys alone all is well; and t('session.minutes') finds no such key, plural('session.start') no session.start.other.
    $root = sources([
        'a.component.html' => <<<'HTML'
            <p>{{ 'session.minutes' | translate: { count: n } }}</p>
            <p>{{ "session.start" | translatePlural: n }}</p>
            <p [title]="'session.minutes' | translatePlural: n">{{ "session.start" | translate }}</p>
            <!-- {{ 'session.minutes' | translate }} -->
            <p>{{ 'other.minutes' | translate }} {{ (wide ? 'session.minutes' : 'session.start') | translate }}</p>
            HTML,
        'a.component.ts' => <<<'TS'
            const a = this.i18n.t('session.start') + this._i18n.plural("session.minutes", count);
            const b = this.i18n.t( "session.minutes", { count }) + i18n.plural(`session.start`, 2);
            const c = i18n.around('session.minutes', 'count') + (i18n.has('session.minutes') ? 1 : 0) + i18n.has('session.start');
            // i18n.t('session.minutes') in a comment
            const d = set.has('title') && map.t('changelog.minutes') && i18n.plural(key, count) && i18n.t(TABLE[kind] ?? 'session.start');
            TS,
    ]);
    $database = ['session.minutes.one', 'session.minutes.few', 'session.minutes.other', 'session.start'];
    $scan = translation_keys_scan($root, $database);
    assert_same([
        "a.component.html:1: 'session.minutes' is a plural family and is asked for as one string - the page would show the key",
        "a.component.html:2: 'session.start' is asked for as a plural, and there is no session.start.one, .few or .other - the page would show the key",
        "a.component.ts:2: 'session.minutes' is a plural family and is asked for as one string - the page would show the key",
        "a.component.ts:2: 'session.start' is asked for as a plural, and there is no session.start.one, .few or .other - the page would show the key",
        "a.component.ts:3: 'session.minutes' is a plural family and is asked for as one string - the page would show the key",
        "a.component.ts:3: 'session.minutes' is a plural family and is asked for as one string - the page would show the key",
    ], $scan['problems'], 'each place it is asked for wrongly, in either quote; the right way round, a comment, another namespace and a key that comes through a variable are let be');
    assert_same([], $scan['missing'], 'by the keys alone nothing is missing, which is why it has to be said');
    assert_same([], $scan['unused']);

    // Asked for as a plural with no key of that name at all: both are said.
    $none = translation_keys_scan(sources(['a.component.html' => "{{ 'session.hours' | translatePlural: n }}\n"]), ['session.start']);
    assert_same(['session.hours'], array_keys($none['missing']));
    assert_match("/^a\\.component\\.html:1: 'session\\.hours' is asked for as a plural/", $none['problems'][0] ?? '');
});

test('the scan: a key put together at run time is put together from a declared prefix, or the scan fails', function (): void {
    $files = [
        'a.service.ts' => <<<'TS'
            const refused = this.i18n.t('session.refused.' + kind);
            const again = this.i18n.t(`session.refused.${kind}`) + this.i18n.t(`session.refused${suffix}`) + this.i18n.t("session." + part + '.title');
            const declared = word('exam.part.' + id) + word(`exam.part.${id}`);
            const whole = i18n.t(`session.inBackticks`) + i18n.t(`session.notThere`);
            const notOurs = ['changelog.' + kind, `changelog.${kind}`, `session.refused is ${kind}`, 'session', 'session. ', `${kind}.session.`];
            // 'session.commented.' + kind
            TS,
        'a.component.html' => "<p>{{ ('session.shown.' + kind) | translate }}</p>\n<p class=\"session.\" [title]=\"'session.title.' + kind\"></p>\n",
        'core/i18n/dynamic-keys.ts' => "export const DYNAMIC_KEYS = {\n  'exam.part.': ['1'],\n};\n",
    ];
    $database = ['session.start', 'session.inBackticks', 'exam.part.1'];
    $scan = translation_keys_scan(sources($files), $database);
    assert_same([
        "a.component.html:1: a key is put together from 'session.shown.', which core/i18n/dynamic-keys.ts does not declare",
        "a.component.html:2: a key is put together from 'session.title.', which core/i18n/dynamic-keys.ts does not declare",
        "a.service.ts:1: a key is put together from 'session.refused.', which core/i18n/dynamic-keys.ts does not declare",
        "a.service.ts:2: a key is put together from 'session.refused.', which core/i18n/dynamic-keys.ts does not declare",
        "a.service.ts:2: a key is put together from 'session.refused', which core/i18n/dynamic-keys.ts does not declare",
        "a.service.ts:2: a key is put together from 'session.', which core/i18n/dynamic-keys.ts does not declare",
    ], $scan['problems'], 'a literal ending in a dot, a template literal going on with ${...}; a declared prefix, another namespace, a sentence and a comment are let be');
    assert_same(['session.notThere' => ['a.service.ts:4']], $scan['missing'], 'a key in backticks is asked for like any other');
    assert_same(['a.service.ts:4'], $scan['used']['session.inBackticks']);
    assert_same(['session.start'], $scan['unused']);

    // Declared, the same sources pass, and the keys under the prefix are then held like any others.
    $files['core/i18n/dynamic-keys.ts'] = "export const DYNAMIC_KEYS = {\n  'exam.part.': ['1'],\n  'session.refused.': ['closed'],\n  'session.shown.': [],\n  'session.title.': [],\n  'session.': [],\n};\n";
    $declared = translation_keys_scan(sources($files), $database);
    assert_same(["a.service.ts:2: a key is put together from 'session.refused', which core/i18n/dynamic-keys.ts does not declare"], $declared['problems'], 'what is left is the one that is no prefix at all');
    assert_same(['session.notThere', 'session.refused.closed'], array_keys($declared['missing']), 'and a declared key that is not in the database is missing');
});

test('the scan without dynamic-keys.ts, or with nothing declared in it: no key is put together at run time, and that is held', function (): void {
    $database = ['home.title', 'exam.section.kana'];
    $plain = ['home/home.component.html' => "<h1>{{ 'home.title' | translate }}</h1>\n"];
    $built = ['exam/exam.component.ts' => "const name = this.i18n.t('exam.section.' + question.section);\n"];
    $undeclared = ["exam/exam.component.ts:1: a key is put together from 'exam.section.', which core/i18n/dynamic-keys.ts does not declare"];
    $nothing = [
        'absent' => null,
        'empty' => '',
        'only a line break' => "\n",
        'only comments' => "// The keys put together at run time: none yet.\n/* 'exam.section.': ['kana'] */\n",
        'an empty object' => "/** The keys put together at run time. */\nexport const DYNAMIC_KEYS: Record<string, readonly string[]> = {};\n",
        'an empty object over two lines' => "export const DYNAMIC_KEYS: Record<string, readonly string[]> = {\n};\n",
    ];
    foreach ($nothing as $what => $declaration) {
        $files = $declaration === null ? [] : ['core/i18n/dynamic-keys.ts' => $declaration];
        $scan = translation_keys_scan(sources($plain + $files), $database);
        assert_same([[], [], ['exam.section.kana']], [$scan['problems'], $scan['missing'], $scan['unused']], "$what: nothing declared is no problem, and a key nothing asks for is unused");
        assert_same(['home/home.component.html:1'], $scan['used']['home.title'], $what);
        // A source that does put one together is then the problem: its keys could be missing and nothing would say so.
        assert_same($undeclared, translation_keys_scan(sources($plain + $built + $files), $database)['problems'], "$what: a key put together all the same");
        if ($declaration !== null) {
            assert_same(['prefixes' => [], 'keys' => [], 'problems' => []], translation_keys_dynamic($declaration), $what);
        }
    }
    assert_same([], translation_keys_scan(sources($plain + $built), [])['problems'], 'with no key in the database at all (before the strings are seeded) nothing is anybody\'s key yet');

    // A file that declares something the reader cannot read is not "nothing declared".
    $made = translation_keys_scan(sources($plain + ['core/i18n/dynamic-keys.ts' => "export const DYNAMIC_KEYS = makeKeys();\n"]), $database);
    assert_same(['core/i18n/dynamic-keys.ts: no \'prefix.\': [tails] could be read from it'], $made['problems']);
});

test('the scan fails a template that gives innerHTML a translated string, on one line or several; and a list of tails it cannot read', function (): void {
    $root = sources([
        'a.component.html' => "<p [innerHTML]=\"text()\"></p>\n<p>{{ 'home.title' | translate }}</p>\n<p [innerHTML]=\"'home.title' | translate\"></p>\n<!-- <p [innerHTML]=\"'home.title' | translatePlural: 2\"></p> -->\n"
            // Broken over lines, as Prettier breaks a long binding.
            . "<div\n  class=\"rich\"\n  [innerHTML]=\"\n    'home.title'\n      | translate: { name: name() }\n  \"\n></div>\n"
            // A translated string beside the binding, not in it: drawn as text like any other.
            . "<p [innerHTML]=\"report().html\" [attr.aria-label]=\"'home.title' | translate\">{{ 'home.title' | translate }}</p>\n"
            . "<p [innerHtml]='i18n.t(\"home.title\")'></p>\n",
        'a.component.ts' => "el.innerHTML = this.i18n.translate('home.title');\n",
        'core/i18n/dynamic-keys.ts' => "export const DYNAMIC_KEYS = {\n  'exam.section.': SECTIONS.map((s) => s.id),\n  'exam.part.': [...PARTS],\n  'error.': ['offline', 'not a key', ''],\n  'time.': ['now'],\n};\n",
    ]);
    $scan = translation_keys_scan($root, ['home.title', 'time.now', 'error.offline']);
    assert_same(7, count($scan['problems']), test_show($scan['problems']));
    assert_match('/^a\.component\.html:3: innerHTML is given a translated string - a string is text/', $scan['problems'][0]);
    assert_match('/^a\.component\.html:7: innerHTML is given a translated string/', $scan['problems'][1], 'on the line the binding begins');
    assert_match('/^a\.component\.html:13: innerHTML is given a translated string/', $scan['problems'][2], 'asked for with t() in the template, and however the attribute is written; line 12, with a translated string beside the binding, is let be');
    assert_match("/dynamic-keys\\.ts: the tails of 'exam\\.section\\.' are not written out/", $scan['problems'][3]);
    assert_match("/the tails of 'exam\\.part\\.' are not written out/", $scan['problems'][4]);
    assert_match("/'error\\.' \\+ 'not a key' is not a key/", $scan['problems'][5]);
    assert_match("/'error\\.' \\+ '' is not a key/", $scan['problems'][6]);
    assert_same([], $scan['missing'], 'what could be read was read');
    assert_same([], $scan['unused']);
});

test('the scan reads the real frontend: only the files it should, and their comments are not keys', function (): void {
    $root = translation_keys_frontend_root();
    $files = translation_key_source_files($root);
    assert_true(in_array('app.routes.ts', $files, true) && in_array('app.component.html', $files, true), 'the sources are where the scan looks');
    assert_true(is_file("$root/core/auth/sdk/anotoki-auth.d.ts"), 'the IAM\'s SDK is where the scan leaves it out');
    foreach ($files as $file) {
        assert_match('/\.(ts|html)$/', $file);
        assert_no_match('~\.spec\.ts$|^core/testing/|^core/auth/sdk/~', $file);
    }
    assert_same("a\n\n\nb 'c/*' \"d//\" `e\n//` f \ng", translation_key_source_text("a\r\n/* x\r\n 'y' */\r\nb 'c/*' \"d//\" `e\n//` f // 'z'\r\ng", false), 'comments out, strings as they are, line for line');
    assert_same("a\n\nb", translation_key_source_text("a<!-- 'x'\n -->\nb", true));
});

/* --------------------------------------------------- a language as a file */

test('a language\'s strings as a file: flat JSON, the letters as they are, {} for none', function (): void {
    $dir = temp_dir('strings');
    assert_same("{}\n", translations_file_text([]));
    assert_same("{}\n", translations_file_text(new stdClass()));
    assert_same("{\n    \"home.title\": \"Prehľad – „naučené“\",\n    \"a/b\": \"1\"\n}\n", translations_file_text(['home.title' => 'Prehľad – „naučené“', 'a/b' => '1']));

    $values = ['home.title' => 'Prehľad', 'time.now' => "práve\nteraz", '12' => 'a key that looks like a number'];
    translation_file_write("$dir/sk.json", $values);
    assert_same($values, translation_file_read("$dir/sk.json"));
    file_put_contents("$dir/windows.json", "\xEF\xBB\xBF" . str_replace("\n", "\r\n", translations_file_text($values)));
    assert_same($values, translation_file_read("$dir/windows.json"), 'as an editor on Windows saves it');
    file_put_contents("$dir/empty.json", "{}\n");
    assert_same([], translation_file_read("$dir/empty.json"));

    file_put_contents("$dir/list.json", '["a", "b"]');
    file_put_contents("$dir/broken.json", '{"a": ');
    file_put_contents("$dir/text.json", '"a"');
    assert_throws(static fn () => translation_file_read("$dir/list.json"), '/one flat object/');
    assert_throws(static fn () => translation_file_read("$dir/text.json"), '/one flat object/');
    assert_throws(static fn () => translation_file_read("$dir/broken.json"), '/is not JSON/');
    assert_throws(static fn () => translation_file_read("$dir/nothing.json"), '/There is no file/');
});

test('the strings of a language out of a file: a flat export as it is, or a backup\'s translations.values.<code>', function (): void {
    $dir = temp_dir('strings');
    $values = ['home.title' => 'Prehľad', 'format' => 'a key may be named so'];
    translation_file_write("$dir/sk.json", $values);
    assert_same($values, translation_file_strings("$dir/sk.json", 'sk'), 'a flat export is that language\'s, whatever code is asked');
    assert_same($values, translation_file_strings("$dir/sk.json", 'de'));

    $backup = ['format' => BACKUP_FORMAT, 'version' => BACKUP_VERSION, 'takenAt' => '2026-09-30T06:00:00.000Z', 'database' => 'academy_test_example', 'everybody' => true,
        'users' => [['id' => 1, 'username' => null, 'kanji' => ['items' => ['k:大' => ['stage' => 4, 'notes' => ['meaning' => 'big']]]], 'log' => [], 'attempts' => [['attempt' => ['responses' => [['a' => ['b' => ['c' => 1]]]]]]]]],
        'translations' => ['languages' => [], 'values' => ['en' => ['home.title' => 'Dashboard'], 'sk' => ['home.title' => 'Prehľad'], 'de' => new stdClass()]]];
    file_put_contents("$dir/academy-2026-09-30.json", json_text($backup) . "\n");
    assert_same(['home.title' => 'Prehľad'], translation_file_strings("$dir/academy-2026-09-30.json", 'sk'));
    assert_same(['home.title' => 'Dashboard'], translation_file_strings("$dir/academy-2026-09-30.json", 'en'));
    assert_same([], translation_file_strings("$dir/academy-2026-09-30.json", 'de'), 'a language with no strings of its own');
    assert_throws(static fn () => translation_file_strings("$dir/academy-2026-09-30.json", 'fr'), '/is a backup, and holds no strings of the language "fr"/');

    // A backup from before the app kept its words in the database, or a copy of one person alone: it holds none.
    file_put_contents("$dir/academy-old.json", json_text(array_diff_key($backup, ['translations' => 0])) . "\n");
    assert_throws(static fn () => translation_file_strings("$dir/academy-old.json", 'sk'), '/is a backup, and holds no strings of the language "sk"/');
    file_put_contents("$dir/academy-odd.json", json_text(['translations' => ['values' => ['sk' => ['a', 'b']]]] + $backup) . "\n");
    assert_throws(static fn () => translation_file_strings("$dir/academy-odd.json", 'sk'), '/holds no strings of the language "sk"/');
});
