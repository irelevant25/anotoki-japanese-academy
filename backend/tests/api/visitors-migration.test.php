<?php
// Migration 007 (visitors) on a database at 006 with people's data in it:
// every row as it was, users' old CHECK (id > 0) replaced by "a person or a
// visitor", the visitors' ids counting down from -1 - and the check at its
// end fails it, changing nothing, when the database is not what it expects.
// On a database of this file's own, built up to 006 the way db_migrate() would.
declare(strict_types=1);

require __DIR__ . '/../lib.php'; // before the app loads: a throwaway database and backup folder

const MIGRATION_007 = '007_visitors.sql';
/**
 * Rewords 007's words (Sign in's questions) and checks they are there: on a real database it never runs before 007,
 * so this file - which runs every other file before 007 - leaves it out, recorded as applied, never run.
 */
const MIGRATION_011 = '011_legal_pages_and_questions.sql';

/** Every row of every table of somebody's data, as JSON, in a stable order. */
function rows_now(): array
{
    $order = ['users' => 'id', 'srs_settings' => 'user_id', 'srs_progress' => 'user_id, item_id', 'srs_daily' => 'user_id, day',
        'srs_log' => 'id', 'exam_attempts' => 'user_id, id', 'imports' => 'user_id, source'];
    $out = [];
    foreach ($order as $table => $by) {
        $out[$table] = array_column(db_all("SELECT to_jsonb(t)::text AS r FROM $table t ORDER BY $by"), 'r');
    }
    return $out;
}

before(function (): void {
    test_db_empty();
    db_migrations_table();
    db_exec('INSERT INTO migrations (name) VALUES (?), (?)', [MIGRATION_007, MIGRATION_011]); // up to 006 only (and 011 never: above)
    db_migrate();
    db_exec('DELETE FROM migrations WHERE name = ?', [MIGRATION_007]);
    // two people with study data
    users_ensure(2);
    db_exec("UPDATE users SET preferred_username = 'two', time_zone = 'Europe/Bratislava' WHERE id = 2");
    db_exec('UPDATE srs_settings SET batch_size = 3 WHERE user_id = 1'); // 001's one row, the owner's since 002
    db_exec('INSERT INTO srs_settings (user_id, batch_size) VALUES (2, 8)');
    db_exec("INSERT INTO srs_progress (user_id, item_id, stage) VALUES (1, 'k:大', 4), (2, 'k:大', 1), (2, 'k:学', 2)");
    db_exec("INSERT INTO srs_daily (user_id, day, lessons) VALUES (1, '2026-10-01', 2), (2, '2026-10-01', 1)");
    db_exec("INSERT INTO srs_log (user_id, at, kind, item_id) VALUES (1, now(), 'lesson', 'k:大'), (2, now(), 'lesson', 'k:学'), (2, now(), 'reset', NULL)");
    db_exec("INSERT INTO exam_attempts (user_id, id, finished_at, seed, total, right_count, pct, grade, passed, attempt)
             VALUES (2, 'a', now(), 's', 5, 4, 80, 'B', true, '{}')");
    db_exec("INSERT INTO imports (user_id, source, summary) VALUES (1, 'json-files', '{}')");
});

/** Nothing of 007 is there: no column, no sequence, not listed as applied. */
function assert_no_007(): void
{
    assert_same(null, db_value('SELECT name FROM migrations WHERE name = ?', [MIGRATION_007]), 'not applied');
    assert_same(null, db_value("SELECT column_name FROM information_schema.columns WHERE table_name = 'users' AND column_name = 'visitor_key_hash'"), 'no column');
    assert_same(null, db_value("SELECT to_regclass('visitor_ids')"), 'no sequence');
}

test('a database that is not what it expects fails it loudly, and then nothing changed', function (): void {
    // Somebody took 002's check away by hand and wrote an id below 1: the new check refuses the table as it is.
    $check = (string) db_value("SELECT conname FROM pg_constraint WHERE conrelid = 'users'::regclass AND contype = 'c' AND pg_get_constraintdef(oid) = 'CHECK ((id > 0))'");
    assert_same('users_id_check', $check, '002 left it under PostgreSQL\'s name');
    db()->exec('ALTER TABLE users DROP CONSTRAINT users_id_check');
    db_exec('INSERT INTO users (id) VALUES (0)');
    try {
        $before = rows_now();
        assert_throws(static fn () => db_migrate(), '/007_visitors\.sql: .*users_person_or_visitor/');
        assert_no_007();
        assert_same($before, rows_now(), 'every row as it was');
    } finally {
        db_exec('DELETE FROM users WHERE id = 0');
        db()->exec('ALTER TABLE users ADD CONSTRAINT users_id_check CHECK (id > 0)');
    }

    // Its own check at the end, after everything else it does: a row of somebody's that came or went on the way fails it by name.
    $sql = (string) file_get_contents(MIGRATIONS_DIR . '/' . MIGRATION_007);
    $at = strrpos($sql, 'DO $$');
    $before = rows_now();
    db()->beginTransaction();
    try {
        db()->exec(substr($sql, 0, $at));
        db_exec('INSERT INTO users (id) VALUES (99)');
        assert_throws(static fn () => db()->exec(substr($sql, $at)), "/007_visitors: a table of somebody's data changed: users \\(2 rows before, 3 after\\)/");
    } finally {
        db()->rollBack();
    }
    assert_no_007();
    assert_same($before, rows_now(), 'every row as it was');
});

test('applied: every row as it was; a row is a person (id > 0, no key) or a visitor (id < 0, a key); visitors count down from -1', function (): void {
    $before = rows_now();
    assert_same([MIGRATION_007], db_migrate());
    $after = rows_now();
    $users = static fn (array $rows): array => array_map(static function (string $r): array {
        $row = json_decode($r, true);
        unset($row['visitor_key_hash'], $row['visitor_from']);
        return $row;
    }, $rows['users']);
    assert_same($users($before), $users($after), 'the people as they were');
    foreach (array_diff(array_keys($before), ['users']) as $table) {
        assert_same($before[$table], $after[$table], "$table as it was");
    }
    assert_same(0, (int) db_value('SELECT count(*) FROM users WHERE visitor_key_hash IS NOT NULL OR visitor_from IS NOT NULL'), 'no person has a key');
    assert_same(null, db_value("SELECT conname FROM pg_constraint WHERE conrelid = 'users'::regclass AND contype = 'c' AND pg_get_constraintdef(oid) = 'CHECK ((id > 0))'"), 'the old check is gone');

    $hash = str_repeat('a', 64);
    assert_throws(static fn () => db_exec('INSERT INTO users (id) VALUES (0)'), '/users_person_or_visitor/');
    assert_throws(static fn () => db_exec('INSERT INTO users (id) VALUES (-5)'), '/users_person_or_visitor/');
    assert_throws(static fn () => db_exec('INSERT INTO users (id, visitor_key_hash) VALUES (5, ?)', [$hash]), '/users_person_or_visitor/');
    assert_throws(static fn () => db_exec('INSERT INTO users (id, visitor_from) VALUES (6, ?)', [$hash]), '/users_person_or_visitor/');
    assert_same(-1, (int) db_value("SELECT nextval('visitor_ids')"));
    assert_same(-2, (int) db_value("SELECT nextval('visitor_ids')"));
    db_exec('INSERT INTO users (id, visitor_key_hash, visitor_from) VALUES (-2, ?, ?)', [$hash, $hash]);
    assert_throws(static fn () => db_exec('INSERT INTO users (id, visitor_key_hash) VALUES (-3, ?)', [$hash]), '/duplicate key/');
    db_exec("INSERT INTO srs_progress (user_id, item_id, stage) VALUES (-2, 'k:大', 1)");
    assert_same(2, (int) db_value("SELECT count(*) FROM srs_progress WHERE item_id = 'k:大' AND user_id IN (1, -2)"), 'a visitor\'s rows like anybody\'s');
    assert_true(visitors_ready(), 'the app sees a database that can keep visitors');
});

test('its form: a draft until its last line, 004\'s line endings, no row of anybody\'s written, a check at its end that fails it by name', function (): void {
    $sql = (string) file_get_contents(MIGRATIONS_DIR . '/' . MIGRATION_007);
    assert_match('/^-- 007 — .+ \(\d{4}-\d{2}-\d{2}\)\n/', $sql, 'a header that says what and when');
    assert_false(str_contains($sql, "\r"), 'its line endings are 004\'s');
    $lines = preg_split('/\R/', rtrim($sql));
    if (end($lines) !== '-- end of 007') {
        assert_same([MIGRATION_007], array_values(array_intersect(test_config_migration_drafts(), [MIGRATION_007])), 'without its last line it is a draft');
        assert_match('/THIS FILE IS A DRAFT until its last line is "-- end of 007"/', $sql, 'and says so at its top');
    }
    $code = (string) preg_replace('/--[^\n]*/', '', $sql);
    assert_no_match('/\b(UPDATE|DELETE\s+FROM|TRUNCATE)\s+(users|srs_\w+|exam_attempts|imports)\b/i', $code, 'no row of anybody\'s changed');
    assert_no_match('/\bINSERT\s+INTO\s+(users|srs_\w+|exam_attempts|imports)\b/i', $code, 'nor added');
    assert_match('/\bDO \$\$(?:(?!DO \$\$).)*RAISE EXCEPTION \'007_visitors: (?:(?!DO \$\$).)*END \$\$;\s*$/s', $code, 'the last thing it does is its check');
});
