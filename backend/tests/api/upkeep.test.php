<?php
// The start-time work a hosted site does on requests (backend/src/upkeep.php):
// the last line every migration ends with, the stamp stored with the study
// content, and the lock every way of applying takes. The uploads themselves (a migration that arrives in parts, one that
// fails, the setup page run again) are tests/api/deploy.test.php's, on a copy
// of the site: no test writes into backend/migrations.
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
        assert_true(db_migration_whole($name, $sql) && db_migration_sql($name) !== null, "$name is whole");
    }
    assert_same([], db_migrations_ready(), 'this database has them all');
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
        assert_true(db_migration_drafts_allowed('academy_test_template', $name), "$name: the tests' template");
        assert_true(db_migration_sql($name) !== null, "$name: applied to this throwaway database, which the tests named it for");
        try {
            putenv('ACADEMY_MIGRATION_DRAFTS'); // what the owner's server has: nobody names a draft
            assert_same(null, db_migration_sql($name), "$name waits when nobody names it");
            putenv("ACADEMY_MIGRATION_DRAFTS=$named");
            config_overrides(['db' => ['name' => 'anotoki_japanese_academy']]); // read, never connected to
            assert_same(null, db_migration_sql($name), "$name waits for a database that is not the tests', even named");
        } finally {
            config_overrides([]);
            putenv("ACADEMY_MIGRATION_DRAFTS=$named");
        }
    }
    assert_false(db_migration_drafts_allowed(db_name(), '999_test_half.sql'), 'a file nobody named is no draft: a half upload waits on the tests’ databases too');
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
 * Somebody else holding the upkeep's lock for $seconds, as a request that
 * looks at the files, or an Apply, holds it: another PHP with a connection of
 * its own (one connection takes its own lock again at once). Returns when it
 * holds it; the process ends by itself.
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

test('applying waits for the lock a request holds for a moment, and says busy only when it stays taken - an Apply, the setup page and manage.php alike', function (): void {
    $timeout = db_value("SELECT current_setting('lock_timeout')");
    $appliers = [
        'the Migrations page’s Apply' => static fn (int $waitMs): array => upkeep_apply($waitMs),
        'the setup page and manage.php' => static fn (int $waitMs): array => upkeep_migrate(null, $waitMs),
    ];
    // Taken for longer than the wait (another Apply, the setup page or manage.php at it): busy.
    $other = db_connect();
    $other->query('SELECT pg_advisory_lock(' . UPKEEP_LOCK . ')');
    try {
        foreach ($appliers as $who => $apply) {
            $started = microtime(true);
            $refused = null;
            try {
                $apply(300);
            } catch (HttpError $e) {
                $refused = $e;
            }
            assert_true($refused !== null, "$who: refused while somebody else holds the lock");
            assert_same([409, 'busy', UPKEEP_BUSY], [$refused->status, $refused->errorCode, $refused->getMessage()], $who);
            assert_true(microtime(true) - $started >= 0.25, "$who: after waiting for it");
        }
    } finally {
        $other->query('SELECT pg_advisory_unlock(' . UPKEEP_LOCK . ')');
    }
    // Taken for a moment (requests looking at the files while a migration waits): waited for, then done.
    foreach ($appliers as $who => $apply) {
        lock_held_elsewhere(1.0);
        $started = microtime(true);
        $done = $apply(UPKEEP_LOCK_WAIT_MS);
        assert_true(microtime(true) - $started >= 0.5, "$who: it waited for the lock");
        assert_same([], $done['applied'], "$who: this database has them all, and the run said so instead of busy");
    }
    assert_same($timeout, db_value("SELECT current_setting('lock_timeout')"), 'the wait bounded the lock alone: the session is as it was');
});

test('a migration that fails on Apply: its administrator reads PostgreSQL’s own words, on a website too, and the log has them', function (): void {
    // This process is not PHP's built-in server: what it answers is what a website answers (error_reason() would say null).
    assert_same('cli', PHP_SAPI);
    // 005 taken for not applied: run again, it adds a column the table has already. No test writes into backend/migrations.
    $name = '005_own_time_zone_and_words.sql';
    $when = db_value('SELECT applied_at FROM migrations WHERE name = ?', [$name]);
    $log = tempnam(sys_get_temp_dir(), 'academy-log-');
    $logBefore = ini_get('error_log');
    ini_set('error_log', $log);
    db_exec('DELETE FROM migrations WHERE name = ?', [$name]);
    try {
        $r = upkeep_apply();
    } finally {
        db_exec('INSERT INTO migrations (name, applied_at) VALUES (?, ?)', [$name, $when]);
        ini_set('error_log', (string) $logBefore);
    }
    assert_same([[], $name], [$r['applied'], $r['failed']]);
    assert_match('/column "time_zone" of relation "users" already exists/', (string) $r['error'], 'why, in PostgreSQL\'s words');
    assert_match('/\[upkeep\] a migration failed: backend\/migrations\/' . preg_quote($name, '/') . ': .*column "time_zone" of relation "users" already exists/',
        (string) file_get_contents($log), 'and the site\'s error log has it as well');
    @unlink($log);
    assert_same([], db_migrations_ready(), 'the database as it was');
});
