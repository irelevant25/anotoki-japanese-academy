<?php
// The start-time work a hosted site does on requests (backend/src/upkeep.php):
// the last line every migration ends with, and the stamp stored with the study
// content. The uploads themselves (a migration that arrives in parts, one that
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
    foreach ($files as $name) {
        assert_match('/^\d{3}_[a-z0-9_]+\.sql$/D', $name);
        if ($name === '001_init.sql') {
            continue; // from before the rule, and applied everywhere already
        }
        $lines = preg_split('/\R/', rtrim((string) file_get_contents(MIGRATIONS_DIR . "/$name")));
        assert_same('-- end of ' . substr($name, 0, 3), end($lines), "$name: its last line");
        assert_true(db_migration_sql($name) !== null, "$name is whole");
    }
    assert_same([], db_migrations_ready(), 'this database has them all');
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
