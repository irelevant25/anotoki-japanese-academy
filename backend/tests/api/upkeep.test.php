<?php
// The start-time work a hosted site does on requests (backend/src/upkeep.php),
// and the migrations' engine under it (db_migrator(): the anotoki library's,
// set up for this site): the last line every migration ends with, the stamp
// stored with the study content, the lock every way of applying takes, and
// nothing built while a migration waits. The uploads themselves (a migration
// that arrives in parts, one that fails, the setup page run again) are
// tests/api/deploy.test.php's, on a copy of the site: no test writes into
// backend/migrations.
declare(strict_types=1);

require __DIR__ . '/../lib.php'; // before the app loads: a throwaway database and backup folder

before(function (): void {
    test_db();
});

test('every migration ends with its own last line, so one still being written or uploaded never runs in part', function (): void {
    $files = array_map('basename', glob(MIGRATIONS_DIR . '/*.sql') ?: []);
    assert_true(count($files) >= 3);
    $drafts = test_config_migration_drafts();
    foreach ($files as $name) {
        assert_match('/^\d{3}_[a-z0-9_]+\.sql$/D', $name);
        if ($name === '001_init.sql') {
            continue; // from before the rule, and applied everywhere already
        }
        $sql = (string) file_get_contents(MIGRATIONS_DIR . "/$name");
        $lines = preg_split('/\R/', rtrim($sql));
        if (in_array($name, $drafts, true)) {
            // Still being written: the last migration only, and it says so at its top.
            assert_same(end($files), $name, "$name is a draft (no last line yet): only the newest migration may be one");
            assert_match('/THIS FILE IS A DRAFT until its last line is "-- end of ' . substr($name, 0, 3) . '"/', $sql, "$name says it is a draft");
            continue;
        }
        assert_same('-- end of ' . substr($name, 0, 3), end($lines), "$name: its last line");
        assert_true(db_migration_whole($name, $sql) && db_migration_ready($name, $sql), "$name is whole");
    }
    // The anotoki library's files keep the same rule, and none of them is ever a draft: the engine asks of them as
    // of this site's (db_migrator()'s ready hook), without the 001 of before the rule or a draft the tests name.
    foreach (glob(Anotoki\Lib\Translations\Schema::directory() . '/*.sql') ?: [] as $file) {
        $name = basename($file);
        $sql = (string) file_get_contents($file);
        assert_true(db_migration_ready($name, $sql, false), "the library's $name is whole");
        assert_false(db_migration_ready($name, rtrim(preg_replace('/-- end of \d{3}\s*$/D', '', $sql)) . "\n", false), "the library's $name without its last line would wait");
    }
    assert_false(db_migration_ready('001_init.sql', 'CREATE TABLE before_the_rule (id int);', false), 'a library’s 001 is never the 001 of before the rule');
    assert_same([], db_migrations_ready(), 'this database has them all');
    assert_same([], db_pending_migrations(), 'drafts too: the tests apply them');
});

test('a migration still being written waits on every database but the tests’, which apply it only when they name it', function (): void {
    $drafts = test_config_migration_drafts();
    $named = (string) getenv('ACADEMY_MIGRATION_DRAFTS');
    assert_same(implode(',', $drafts), $named, 'tests/lib.php names exactly the drafts there are');
    foreach (array_merge($drafts, ['999_test_half.sql']) as $name) {
        foreach (['anotoki_japanese_academy', 'anotoki_japanese', 'japanese_academy', 'academy_testx', 'Academy_test_x', 'academy_test_x;drop'] as $database) {
            assert_false(db_migration_drafts_allowed($database, $name), "$name, $database: never a database of anybody's, whatever the environment says");
        }
    }
    foreach ($drafts as $name) {
        $sql = (string) file_get_contents(MIGRATIONS_DIR . "/$name");
        assert_true(db_migration_drafts_allowed('academy_test_template', $name), "$name: the tests' template");
        assert_true(db_migration_ready($name, $sql), "$name: applied to this throwaway database, which the tests named it for");
        try {
            putenv('ACADEMY_MIGRATION_DRAFTS'); // what the owner's server has: nobody names a draft
            assert_false(db_migration_ready($name, $sql), "$name waits when nobody names it");
            putenv("ACADEMY_MIGRATION_DRAFTS=$named");
            config_overrides(['db' => ['name' => 'anotoki_japanese_academy']]); // read, never connected to
            assert_false(db_migration_ready($name, $sql), "$name waits for a database that is not the tests', even named");
        } finally {
            config_overrides([]);
            putenv("ACADEMY_MIGRATION_DRAFTS=$named");
        }
    }
    assert_false(db_migration_drafts_allowed(db_name(), '999_test_half.sql'), 'a file nobody named is no draft: a half upload waits on the tests’ databases too');
    assert_false(db_migration_ready('999_test_half.sql', "CREATE TABLE half (id int);\n"), 'and the engine is told so');
    assert_true(db_migration_ready('999_test_whole.sql', "CREATE TABLE whole (id int);\n-- end of 999\n"), 'its last line makes it whole');
    assert_true(db_migration_ready('001_init.sql', 'CREATE TABLE before_the_rule (id int);'), '001 is from before the rule');
});

test('while one of this site’s own files is a draft, the anotoki library’s files wait with it - those that run before it too - on every database but the tests’', function (): void {
    $drafts = test_config_migration_drafts();
    $library = [];
    foreach (db_migration_sets() as $set) {
        if ($set->library) {
            foreach (glob($set->directory . '/*.sql') ?: [] as $file) {
                $library[$set->name . '/' . basename($file)] = [basename($file), (string) file_get_contents($file)];
            }
        }
    }
    assert_true(isset($library['anotoki_admin/001_audit_log.sql']), 'the library\'s files, the admin tools\' that run first among them: ' . implode(', ', array_keys($library)));
    foreach (['academy_test_template', db_name()] as $test) {
        assert_same(null, db_own_draft($test), "$test: the tests' databases hold nothing back - they apply the drafts they name");
    }
    foreach ($library as $label => [$name, $sql]) {
        assert_true(db_migration_ready($name, $sql, false), "$label, on this database of the tests: whole");
    }
    try {
        // A database of anybody's - the owner's own server serving this working tree: read, never connected to.
        config_overrides(['db' => ['name' => 'japanese_academy']]);
        assert_same($drafts === [] ? null : $drafts[0], db_own_draft('japanese_academy'), 'the draft of this site\'s own that holds them back');
        foreach ($library as $label => [$name, $sql]) {
            assert_same($drafts === [], db_migration_ready($name, $sql, false),
                "$label, on a database of anybody's: " . ($drafts === [] ? 'no draft, whole' : 'waits while ' . $drafts[0] . ' is a draft'));
        }
    } finally {
        config_overrides([]);
    }
});

test('the engine: this site’s table as it is, four sets - the anotoki library’s admin tools, this site’s, the library’s words and people -, each file whole in one exec, under the upkeep’s lock', function (): void {
    $status = db_migrator()->status();
    assert_same(MIGRATION_SETS_IN_ORDER, $status['sets'], 'the library’s admin tools first, this site’s own, then the library’s words and people');
    // Every file applied (in the order they ran, which is the template's history: a set added later ran later).
    $applied = array_map('db_migration_label', $status['applied']);
    $everyFile = all_migration_labels();
    sort($applied);
    sort($everyFile);
    assert_same($everyFile, $applied, 'every file applied');
    $library = array_merge(library_migrations('anotoki_admin'), library_migrations(), library_migrations('anotoki_people'));
    $recorded = array_values(array_filter(array_column(db_all('SELECT name FROM migrations'), 'name'), static fn (string $n): bool => str_contains($n, '/')));
    sort($library);
    sort($recorded);
    assert_same($library, $recorded, 'the library’s recorded by their set and name, in the table as it is');
    assert_same([[], []], [$status['pending'], $status['missing']]);
    assert_match('/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/D', (string) $status['applied'][0]['applied_at'], 'when, in UTC');
    // The bookkeeping table is the one this site has always had: never another shape.
    assert_same([['name', 'text', 'NO'], ['applied_at', 'timestamp with time zone', 'NO']], array_map(
        static fn (array $c): array => [$c['column_name'], $c['data_type'], $c['is_nullable']],
        db_all("SELECT column_name, data_type, is_nullable FROM information_schema.columns WHERE table_schema = current_schema() AND table_name = 'migrations' ORDER BY ordinal_position")
    ));
    assert_same((string) file_get_contents(MIGRATIONS_DIR . '/001_init.sql'), db_migrator()->source(MIGRATION_SET, '001_init.sql'), 'a file’s text');
    assert_same(null, db_migrator()->source(MIGRATION_SET, '../config/database.local.php'), 'and nothing that is no file of the set');
    assert_same((string) file_get_contents(Anotoki\Lib\Translations\Schema::directory() . '/001_languages_and_strings.sql'),
        db_migrator()->source('anotoki_translations', '001_languages_and_strings.sql'), 'a library file’s text');
    assert_same(null, db_migrator()->source(MIGRATION_SET, '001_languages_and_strings.sql'), 'under its own set only');
    assert_same(['backend/migrations/004_languages_and_translations.sql', 'backend/vendor/anotoki/lib/php/migrations/translations/002_library_words.sql'],
        [db_migration_path(['set' => MIGRATION_SET, 'name' => '004_languages_and_translations.sql']), db_migration_path(['set' => 'anotoki_translations', 'name' => '002_library_words.sql'])],
        'where each is, for what the site says of it');
});

test('the stamp stored with the content is the one from before the build: a file that lands during it makes the next request look again', function (): void {
    upkeep_run(); // the template's stamp may be older than the files (a checkout touches them)
    assert_same(null, upkeep_run(), 'the stamp matches the files: nothing to look at');

    $synced = content_sync(true, 'the files as they were when the build began');
    assert_true(is_array($synced) && $synced['items'] > 1000, 'rebuilt');
    assert_same('the files as they were when the build began', db_value('SELECT stamp FROM content_state'), 'the stamp it was built from, not a later one');
    assert_same([], upkeep_run(), 'not the files’ stamp: the next request looks again (and finds the content current)');
    assert_same(upkeep_stamp(), db_value('SELECT stamp FROM content_state'));
    assert_same(null, upkeep_run());
});

/**
 * Somebody else holding the upkeep's lock for $seconds, as the content's
 * rebuild holds it (or an Apply, on a lock of its connection's): another PHP
 * with a connection of its own (one connection takes its own lock again at
 * once). Returns when it holds it; the process ends by itself.
 */
function lock_held_elsewhere(float $seconds): void
{
    $code = 'require ' . var_export(BACKEND . '/src/bootstrap.php', true) . ';'
        . ' db_tx(static function (): void { db_value("SELECT pg_advisory_xact_lock(?::bigint)", [UPKEEP_LOCK]);'
        . ' fwrite(STDOUT, "held\n"); fflush(STDOUT); usleep(' . (int) ($seconds * 1000000) . '); });';
    $null = PHP_OS_FAMILY === 'Windows' ? 'NUL' : '/dev/null';
    $proc = proc_open([PHP_BINARY, '-d', 'opcache.enable=0', '-r', $code], [0 => ['file', $null, 'r'], 1 => ['pipe', 'w'], 2 => ['pipe', 'w']], $pipes, ROOT, getenv());
    $said = (string) fgets($pipes[1]);
    if (trim($said) !== 'held') {
        $why = $said . stream_get_contents($pipes[2]);
        proc_close($proc);
        throw new RuntimeException('The other process did not take the lock: ' . $why);
    }
    $GLOBALS['TEST_SERVERS'][] = static function () use ($proc, $pipes): void {
        foreach ($pipes as $pipe) {
            @fclose($pipe);
        }
        @proc_close($proc);
    };
}

/** 006 taken for not applied - it changes only what is not done yet, so it can run again - and the files' stamp forgotten: an upload. */
function upload_006(): array
{
    $name = '006_admin_panel_words.sql';
    $before = ['name' => $name, 'when' => db_value('SELECT applied_at FROM migrations WHERE name = ?', [$name]), 'stamp' => db_value('SELECT stamp FROM content_state')];
    db_exec('DELETE FROM migrations WHERE name = ?', [$name]);
    db_exec("UPDATE content_state SET stamp = 'before the upload'");
    return $before;
}

/** upload_006() undone: as if it had been applied all along. */
function applied_006(array $before): void
{
    if (!db_value('SELECT 1 FROM migrations WHERE name = ?', [$before['name']])) {
        db_exec('INSERT INTO migrations (name, applied_at) VALUES (?, ?)', [$before['name'], $before['when']]);
    }
}

test('one apply at a time: while another holds the upkeep’s lock - an Apply, the setup page, manage.php or the content’s rebuild - every way of applying says busy at once, and applies nothing', function (): void {
    $before = upload_006();
    try {
        $appliers = [
            'the setup page and manage.php' => static fn (): array => upkeep_migrate(),
            'the tests’ builder' => static fn (): array => ['applied' => db_migrate()],
        ];
        $other = db_connect();
        $other->query('SELECT pg_advisory_lock(' . UPKEEP_LOCK . ')'); // another apply: the engine's own lock, on its connection
        try {
            foreach ($appliers as $who => $apply) {
                $started = microtime(true);
                assert_throws($apply, '/Another database update is running, so nothing was applied/');
                assert_true(microtime(true) - $started < 2.0, "$who: at once, not after a wait");
            }
            $busy = db_migrator(db_connect(), upkeep_before_apply())->apply();
            assert_same([true, [], null], [$busy['busy'], $busy['applied'], $busy['failed']], 'the Migrations page’s Apply: busy (409)');
        } finally {
            $other->query('SELECT pg_advisory_unlock(' . UPKEEP_LOCK . ')');
        }
        lock_held_elsewhere(2.0); // the content's rebuild at work
        assert_throws(static fn (): array => upkeep_migrate(), '/Another database update is running/');
        assert_same(['006_admin_panel_words.sql'], db_migrations_ready(), 'nothing was applied');

        // Free again: applied, after the copy (this database holds no study data: there is nothing to copy).
        for ($until = microtime(true) + 5; ; usleep(100000)) {
            try {
                $done = upkeep_migrate();
                break;
            } catch (RuntimeException $e) {
                if (microtime(true) > $until) {
                    throw $e;
                }
            }
        }
        assert_same(['backup' => null, 'applied' => ['006_admin_panel_words.sql']], $done);
        assert_same([], db_migrations_ready());
    } finally {
        applied_006($before);
    }
});

test('while a migration waits for its Apply, a request builds nothing and saves no stamp - and does not wait for the lock an Apply holds', function (): void {
    $before = upload_006();
    try {
        lock_held_elsewhere(3.0); // an Apply (or a rebuild) at work
        $started = microtime(true);
        assert_same([], upkeep_run(), 'it looked, and may do nothing yet');
        assert_true(microtime(true) - $started < 1.0, 'at once: the lock is not even asked for');
        assert_same('before the upload', db_value('SELECT stamp FROM content_state'), 'nothing saved: the first request after the Apply looks again');
        assert_same([], upkeep_run(), 'and the next request alike');
    } finally {
        applied_006($before);
    }
    // Applied: the next request looks again (waiting for the lock now), and finds the content current.
    assert_same([], upkeep_run());
    assert_same(upkeep_stamp(), db_value('SELECT stamp FROM content_state'));
    assert_same(null, upkeep_run());
});

test('a migration that fails on Apply: its administrator reads PostgreSQL’s own words, on a website too, and the log has them', function (): void {
    require_once BACKEND . '/api/app.php';
    // This process is not PHP's built-in server: what it answers is what a website answers (error_reason() would say null).
    assert_same('cli', PHP_SAPI);
    // 005 taken for not applied: run again, it adds a column the table has already. No test writes into backend/migrations.
    $name = '005_own_time_zone_and_words.sql';
    $when = db_value('SELECT applied_at FROM migrations WHERE name = ?', [$name]);
    $log = tempnam(sys_get_temp_dir(), 'academy-log-');
    $logBefore = ini_get('error_log');
    ini_set('error_log', $log);
    db_exec('DELETE FROM migrations WHERE name = ?', [$name]);
    test_iam(); // the settings name its keys: the token below is checked against them
    try {
        // The token on the request itself, as a browser sends it (the anotoki library's Identify reads the request's header).
        $request = (new Slim\Psr7\Factory\ServerRequestFactory())->createServerRequest('POST', '/api/admin/migrations/apply')
            ->withHeader('Authorization', 'Bearer ' . test_token(7, ['ADMIN']));
        $response = academy_app()->handle($request);
    } finally {
        db_exec('INSERT INTO migrations (name, applied_at) VALUES (?, ?) ON CONFLICT (name) DO NOTHING', [$name, $when]);
        ini_set('error_log', (string) $logBefore);
    }
    $r = json_decode((string) $response->getBody(), true);
    assert_same(200, $response->getStatusCode(), 'a failed file is still an answer: the page shows it');
    assert_same([[], ['set' => MIGRATION_SET, 'name' => $name]], [$r['applied'], $r['failed']]);
    assert_match('/column "time_zone" of relation "users" already exists/', (string) $r['error'], 'why, in PostgreSQL\'s words');
    assert_match('/\[upkeep\] a migration failed: backend\/migrations\/' . preg_quote($name, '/') . ': .*column "time_zone" of relation "users" already exists/',
        (string) file_get_contents($log), 'and the site\'s error log has it as well');
    @unlink($log);
    assert_same([], db_migrations_ready(), 'the database as it was');
});
