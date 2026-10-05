<?php
// Migration 002 on the owner's data as it was before people had user ids:
// every row kept as it was, now the owner's (user 1), and the check at its end
// fails it — changing nothing — if a row did not come through unchanged. On a
// database of this file's own, built up to 001 the way db_migrate() would.
declare(strict_types=1);

require __DIR__ . '/../lib.php'; // before the app loads: a throwaway database and backup folder

/**
 * The owner's rows, per table, as JSON without the user id: the shape of 001
 * (whose srs_settings had an id, always 1, where 002 has the user id).
 */
function rows_001(): array
{
    $order = ['srs_settings' => 'created_at', 'srs_progress' => 'item_id', 'srs_daily' => 'day', 'srs_log' => 'id', 'exam_attempts' => 'id', 'imports' => 'source'];
    $out = [];
    foreach ($order as $table => $by) {
        $drop = $table === 'srs_settings' ? " - 'id'" : '';
        $out[$table] = array_column(db_all("SELECT (to_jsonb(t) - 'user_id'$drop)::text AS r FROM $table t ORDER BY t.$by"), 'r');
    }
    return $out;
}

before(function (): void {
    test_db_empty();
    db()->exec('CREATE TABLE migrations (name text PRIMARY KEY, applied_at timestamptz NOT NULL DEFAULT now())');
    db()->exec((string) file_get_contents(MIGRATIONS_DIR . '/001_init.sql'));
    db_exec("INSERT INTO migrations (name) VALUES ('001_init.sql')");

    // the owner's study data, as the app kept it until 2026-09-27
    db_exec("UPDATE srs_settings SET batch_size = 3, lesson_types = 'kanji', autoplay = false, created_at = '2026-09-23 10:00+02'");
    db_exec("INSERT INTO srs_progress (item_id, stage, learned_at, next_review, meaning_correct, synonyms, extra_readings, meaning_note)
             VALUES ('k:大', 4, '2026-09-23 10:05+02', '2026-09-26 10:00+02', 5, '[\"large\"]', '[]', 'arms spread — BIG'),
                    ('v:大学', 1, '2026-09-24 08:00+02', '2026-09-24 12:00+02', 0, '[]', '[\"だいがく\"]', '')");
    db_exec("INSERT INTO srs_daily (day, lessons, reviews, reviews_correct) VALUES ('2026-09-23', 2, 0, 0), ('2026-09-24', 1, 5, 4)");
    db_exec("INSERT INTO srs_log (at, kind, item_id, details) VALUES
             ('2026-09-23 10:05+02', 'lesson', 'k:大', '{}'),
             ('2026-09-24 09:00+02', 'review', 'k:大', '{\"meaningWrong\":0,\"readingWrong\":1,\"from\":1,\"to\":2}'),
             ('2026-09-24 09:30+02', 'reset', NULL, '{}')");
    db_exec("INSERT INTO exam_attempts (id, started_at, finished_at, candidate, seed, total, right_count, pct, grade, passed, attempt, report) VALUES
             ('2026-09-22T11-09-21-059Z-exam-1', '2026-09-22 13:07+02', '2026-09-22 13:09+02', 'irelevant', 'exam-1', 38, 14, 36.8, 'F', false,
              '{\"id\":\"2026-09-22T11-09-21-059Z-exam-1\",\"summary\":{\"total\":38}}', '<!doctype html><title>the first report</title>'),
             ('2026-09-24T08-00-00-000Z-exam-2', NULL, '2026-09-24 10:00+02', '', 'exam-2', 40, 30, 75, 'C', true, '{\"id\":\"2026-09-24T08-00-00-000Z-exam-2\"}', NULL)");
    db_exec("INSERT INTO imports (source, summary) VALUES ('json-files', '{\"items\":2}')");
});

test('the check at the end fails the migration when a row changed on the way, and then nothing changed', function (): void {
    $before = rows_001();
    // Something that alters a row as the migration passes it: the check must see it.
    db()->exec("CREATE FUNCTION academy_test_tamper() RETURNS trigger LANGUAGE plpgsql AS \$\$ BEGIN NEW.meaning_note := NEW.meaning_note || '!'; RETURN NEW; END \$\$");
    db()->exec('CREATE TRIGGER academy_test_tamper BEFORE UPDATE ON srs_progress FOR EACH ROW EXECUTE FUNCTION academy_test_tamper()');
    try {
        assert_throws(static fn () => db_migrate(), '/002_users: the study data did not come through unchanged: srs_progress \(2 rows before, 2 after\)/');
    } finally {
        db()->exec('DROP TRIGGER academy_test_tamper ON srs_progress');
        db()->exec('DROP FUNCTION academy_test_tamper()');
    }
    assert_same(['001_init.sql'], array_column(db_all('SELECT name FROM migrations ORDER BY name'), 'name'), 'not applied');
    assert_same(null, db_value("SELECT to_regclass('users')"), 'no users table');
    assert_same(null, db_value("SELECT column_name FROM information_schema.columns WHERE table_name = 'srs_progress' AND column_name = 'user_id'"));
    assert_same($before, rows_001(), 'every row as it was');
});

test('every row comes through as it was, and is the owner’s', function (): void {
    $before = rows_001();
    assert_same(['002_users.sql', '003_content_stamp.sql', '004_languages_and_translations.sql', '005_own_time_zone_and_words.sql', '006_admin_panel_words.sql', '007_visitors.sql'], db_migrate());
    assert_same($before, rows_001(), 'the same rows, the same content');
    foreach (USER_TABLES as $table) {
        assert_same([1], array_map('intval', array_column(db_all("SELECT DISTINCT user_id FROM $table"), 'user_id')), "$table: the owner's");
    }
    assert_same([['id' => 1, 'preferred_username' => null]], array_map(
        static fn (array $r): array => ['id' => (int) $r['id'], 'preferred_username' => $r['preferred_username']],
        db_all('SELECT id, preferred_username FROM users')
    ));
    $key = static fn (string $table): string => (string) db_value("SELECT pg_get_constraintdef(oid) FROM pg_constraint WHERE conrelid = ?::regclass AND contype = 'p'", [$table]);
    assert_same('PRIMARY KEY (user_id, item_id)', $key('srs_progress'));
    assert_same('PRIMARY KEY (user_id, day)', $key('srs_daily'));
    assert_same('PRIMARY KEY (user_id, id)', $key('exam_attempts'));
    assert_same('PRIMARY KEY (user_id)', $key('srs_settings'));
    assert_same('PRIMARY KEY (user_id, source)', $key('imports'));
});

test('then two people can have the same item, day and attempt id, and every row belongs to somebody known', function (): void {
    users_ensure(2);
    db_exec("INSERT INTO srs_progress (user_id, item_id, stage) VALUES (2, 'k:大', 1)");
    db_exec("INSERT INTO srs_daily (user_id, day, lessons) VALUES (2, '2026-09-23', 1)");
    db_exec("INSERT INTO exam_attempts (user_id, id, finished_at, seed, total, right_count, pct, grade, passed, attempt)
             VALUES (2, '2026-09-22T11-09-21-059Z-exam-1', now(), 'exam-1', 1, 1, 100, 'A', true, '{}')");
    db_exec('INSERT INTO srs_settings (user_id) VALUES (2)');
    assert_same(2, (int) db_value("SELECT count(*) FROM srs_progress WHERE item_id = 'k:大'"));
    assert_throws(static fn () => db_exec("INSERT INTO srs_progress (user_id, item_id) VALUES (3, 'k:大')"), '/foreign key/');
    assert_throws(static fn () => db_exec("INSERT INTO srs_progress (user_id, item_id) VALUES (2, 'k:大')"), '/duplicate key/');
});

test('the app reads the migrated data as the owner’s', function (): void {
    $k = store_export(1);
    assert_same(['batchSize' => 3, 'lessonTypes' => 'kanji', 'autoplay' => false], $k['settings']);
    assert_same(4, $k['items']['k:大']['stage']);
    assert_same(['large'], $k['items']['k:大']['synonyms']);
    assert_same(['だいがく'], $k['items']['v:大学']['extraReadings']);
    assert_same(['2026-09-23', '2026-09-24'], array_keys($k['daily']));
    assert_same(['lesson', 'review', 'reset'], array_column(store_log_all(1), 'kind'));
    assert_same(['2026-09-22T11-09-21-059Z-exam-1', '2026-09-24T08-00-00-000Z-exam-2'], array_column(exam_history(1), 'id'));
    assert_same('<!doctype html><title>the first report</title>', exam_report(1, '2026-09-22T11-09-21-059Z-exam-1'));
    assert_same(null, exam_report(2, '2026-09-24T08-00-00-000Z-exam-2'), 'not somebody else’s');
});
