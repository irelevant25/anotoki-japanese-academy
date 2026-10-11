<?php
// A database from nothing, the command line's way: every migration applied by
// the anotoki library's engine (db_migrator(), as the tests' builder
// tests/tools/testdb.php runs it), the table that lists them in this site's
// own shape; then backend/manage.php on it, as the owner runs it - --check
// says what is left to do, --sync builds the study content, and with a
// migration waiting applies it first. (The setup page builds one from nothing
// too: tests/api/deploy.test.php; the Migrations page's Apply:
// tests/api/site-state.test.php.)
declare(strict_types=1);

require __DIR__ . '/../lib.php'; // before the app loads: a throwaway database and backup folder

before(function (): void {
    test_db_empty();
});

/** backend/manage.php with these options, against this file's database (its settings): [exit code, what it said]. */
function manage(string ...$options): array
{
    $null = PHP_OS_FAMILY === 'Windows' ? 'NUL' : '/dev/null';
    $proc = proc_open(array_merge([PHP_BINARY, '-d', 'opcache.enable=0', BACKEND . '/manage.php'], $options),
        [0 => ['file', $null, 'r'], 1 => ['pipe', 'w'], 2 => ['pipe', 'w']], $pipes, ROOT, getenv());
    $said = stream_get_contents($pipes[1]) . stream_get_contents($pipes[2]);
    foreach ($pipes as $pipe) {
        fclose($pipe);
    }
    return [proc_close($proc), trim((string) $said)];
}

/**
 * Every migration file, in the order they run: this site's own
 * (backend/migrations/), then the anotoki library's set of the words
 * (anotoki_translations/…, db_migration_sets()), as db_migration_label() names them.
 */
function every_migration(): array
{
    $files = [];
    foreach (db_migration_sets() as $set) {
        $names = array_map('basename', glob($set->directory . '/*.sql') ?: []);
        sort($names);
        foreach ($names as $name) {
            $files[] = db_migration_label(['set' => $set->name, 'name' => $name]);
        }
    }
    return $files;
}

test('from nothing: every migration, in order, each in a transaction of its own, listed in this site’s table', function (): void {
    assert_same(null, db_value("SELECT to_regclass('migrations')"), 'an empty database');
    assert_same(['anotoki_translations/001_languages_and_strings.sql', 'anotoki_translations/002_library_words.sql'], array_slice(every_migration(), -2), 'the library’s set last');
    assert_same(every_migration(), db_pending_migrations(), 'everything waits');
    assert_same(every_migration(), db_migrations_ready(), 'and may run: none is a draft the tests do not name');
    assert_same(every_migration(), db_migrate(), 'every one, in order: this site’s own, then the library’s');
    assert_same(every_migration(), array_column(db_all('SELECT name FROM migrations ORDER BY applied_at, name'), 'name'), 'listed, each when it ran - the library’s by its set and name, this site’s by its name as ever');
    assert_same([['name', 'text', 'NO'], ['applied_at', 'timestamp with time zone', 'NO']], array_map(
        static fn (array $c): array => [$c['column_name'], $c['data_type'], $c['is_nullable']],
        db_all("SELECT column_name, data_type, is_nullable FROM information_schema.columns WHERE table_schema = current_schema() AND table_name = 'migrations' ORDER BY ordinal_position")
    ), 'the table in this site’s shape, as every database of it has it - never another');
    assert_same('PRIMARY KEY (name)', db_value("SELECT pg_get_constraintdef(oid) FROM pg_constraint WHERE conrelid = 'migrations'::regclass AND contype = 'p'"));
    assert_same([], db_migrate(), 'and again: nothing to do');
    assert_same([[], []], [db_pending_migrations(), db_migrations_ready()]);
});

test('backend/manage.php on it: --check says what is left; --sync builds the content; a migration that waits, --sync applies first', function (): void {
    [$code, $said] = manage('--check');
    assert_same(1, $code, $said);
    assert_match('/^To do: rebuild the study content from backend\/data\//', $said);

    [$code, $said] = manage('--sync');
    assert_same(0, $code, $said);
    assert_match('/^Built the study content: \d+ kanji items and \d+ exam questions/m', $said);
    assert_no_match('/Applied:/', $said, 'nothing waited');

    [$code, $said] = manage('--check');
    assert_same([0, true], [$code, str_starts_with($said, 'Ready: database ' . db_name() . ', tables and study content up to date')], $said);

    // 006 taken for not applied: a migration that waits (no test writes into backend/migrations).
    db_exec('DELETE FROM migrations WHERE name = ?', ['006_admin_panel_words.sql']);
    [$code, $said] = manage('--check');
    assert_same(1, $code, $said);
    assert_match('/^To do: apply 006_admin_panel_words\.sql\. An ADMIN applies it on the admin panel\'s Migrations page .*Until then the site tells everybody it is being updated\.$/s', $said);

    [$code, $said] = manage('--sync');
    assert_same(0, $code, $said);
    assert_match('/^Applied: 006_admin_panel_words\.sql\.\r?$/m', $said);
    assert_no_match('/Backup before the update/', $said, 'nobody\'s study data here: nothing to copy');
    assert_same([], db_migrations_ready());
    [$code, $said] = manage('--check');
    assert_same(0, $code, $said);
});
