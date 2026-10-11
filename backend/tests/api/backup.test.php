<?php
// The study data outside the database and back: the day's backup of
// everybody's data, and a restore (version 2: everybody, or the people it
// names; version 1, from before user ids, is no longer read). Every name of a
// backup says UTC's day and time, whoever's request wrote it.
declare(strict_types=1);

require __DIR__ . '/../lib.php'; // before the app loads: a throwaway database and backup folder

before(function (): void {
    test_db();
});

/** Somebody else than TEST_USER. */
const OTHER = 7001;

function daily_backups(): array
{
    return array_map('basename', glob(backup_dir() . '/academy-*.json') ?: []);
}

function wipe(): void
{
    foreach (['srs_progress', 'srs_daily', 'srs_log', 'exam_attempts', 'imports'] as $t) {
        db_exec("DELETE FROM $t");
    }
}

/** Some study data for user $uid: a lesson, its day count and log line, and (with $exam) an exam attempt. */
function study(int $uid, string $item, bool $exam = false): void
{
    users_ensure($uid);
    $now = now_ms();
    store_put($uid, $item, srs_learn(null, $now));
    store_bump_daily($uid, 'lesson', true, $now);
    store_log($uid, ['kind' => 'lesson', 'id' => $item], $now);
    if ($exam) {
        $spec = ['size' => 20, 'seed' => "restore-$uid"];
        $paper = exam_paper(exam_normalize_spec($spec));
        [$status] = exam_submit($uid, ['spec' => $spec, 'responses' => array_fill_keys(array_column($paper['questions'], 'id'), ['choice' => 0, 'ms' => 100])]);
        assert_same(200, $status);
    }
}

/** Everything the database holds of one person. */
function everything_of(int $uid): array
{
    return [store_export($uid), store_log_all($uid), exam_attempts_all($uid)];
}

test('the day’s backup: nothing to copy in an empty database', function (): void {
    assert_same(null, backup_daily());
    assert_same([], daily_backups());
});

test('the day’s backup: a complete copy of everybody’s data, once a day, written aside and renamed', function (): void {
    study(TEST_USER, 'k:大');
    study(OTHER, 'k:山');
    db_exec("UPDATE users SET preferred_username = 'ada' WHERE id = ?", [OTHER]);
    date_default_timezone_set('Pacific/Kiritimati'); // a person's request far east of UTC: the day stays UTC's
    $file = backup_daily();
    date_default_timezone_set('UTC');
    assert_same(['academy-' . utc_date() . '.json'], daily_backups(), 'one finished backup, no .tmp left, named by the UTC day');
    assert_same(str_replace('\\', '/', backup_dir() . '/academy-' . utc_date() . '.json'), str_replace('\\', '/', (string) $file));
    $b = backup_read($file);
    assert_same(2, $b['version']);
    $mine = backup_person_in($b, TEST_USER);
    assert_same(1, $mine['kanji']['items']['k:大']['stage']);
    assert_same('lesson', $mine['log'][0]['kind']);
    $theirs = backup_person_in($b, OTHER);
    assert_same('ada', $theirs['username'], 'the name from their token, so a backup says whose data is whose');
    assert_same(['k:山'], array_keys($theirs['kanji']['items']), 'each person’s own data, and only theirs');
    assert_same(null, backup_daily(), 'the same day adds nothing');
    assert_same(1, count(daily_backups()));
});

test('a backup says which database it copies', function (): void {
    assert_same(db_name(), backup_data()['database']);
});

/** The app's own words as the database has them: languages, keys, strings. */
function words(): array
{
    return [db_all('SELECT * FROM languages ORDER BY code'), db_all('SELECT * FROM translation_keys ORDER BY name'), db_all('SELECT * FROM translations ORDER BY key_name, language_code')];
}

test('a backup of everybody holds the app’s own words, as the owner reworded them; a copy of some people alone holds none', function (): void {
    // a key of the test's own beside whatever the migrations wrote, reworded by somebody; and a language that is hidden and has no string
    db_exec("INSERT INTO translation_keys (name, description) VALUES ('test.word', 'A word of the test')");
    db_exec("INSERT INTO translations (key_name, language_code, value, updated_by) VALUES ('test.word', 'en', 'Word', NULL), ('test.word', 'sk', 'Slovo – „naše“', ?)", [OTHER]);
    db_exec("INSERT INTO languages (code, name, native_name, enabled, sort_order) VALUES ('de', 'German', 'Deutsch', false, 3)");

    $data = backup_data();
    assert_same(BACKUP_VERSION, $data['version'], 'the format is still version 2: a file without the entry is as valid as ever');
    assert_same(['format', 'version', 'takenAt', 'database', 'everybody', 'users', 'translations'], array_keys($data), 'one more entry, after the people');
    $text = json_text($data);
    $held = json_decode($text, true)['translations'];
    assert_same(['languages', 'values'], array_keys($held));
    assert_same(academy_translations()->languages(), $held['languages'], 'every language, the hidden one too, as the owner’s page lists them');
    assert_same(['code', 'name', 'native_name', 'enabled', 'sort_order', 'seeded', 'strings'], array_keys($held['languages'][0]), 'in the one wire format, snake_case');
    assert_same(['en', 'sk', 'de'], array_keys($held['values']), 'each language’s own strings, by code');
    assert_same(['Word', 'Slovo – „naše“'], [$held['values']['en']['test.word'], $held['values']['sk']['test.word']], 'the letters as they are');
    foreach (['en', 'sk', 'de'] as $code) {
        assert_same(translations_of($code), $held['values'][$code], "$code: every string of it, not merged with English");
    }
    assert_true(str_contains($text, '"de":{}'), 'a language with no strings is {} and not []');

    $file = backup_write('manual');
    assert_same($held, read_json($file)['translations'], 'in the file as in the data');
    assert_same($held, backup_read($file)['translations'], 'backup_read() takes the file for the backup it is, and leaves the entry alone');
    unlink($file);
    assert_same($held, read_json(backup_write('daily'))['translations'] ?? null, 'and in the day’s copy');

    // A copy of some people alone (before somebody's reset) is their study data: none of the site's words.
    assert_false(array_key_exists('translations', backup_data([OTHER])));
    assert_false(array_key_exists('translations', backup_data([])));
    assert_same(['format', 'version', 'takenAt', 'database', 'everybody', 'users'], array_keys(backup_data([TEST_USER, OTHER])));
});

test('a restore passes the words over: they are the site’s, not anybody’s study data; and a file without them restores as before', function (): void {
    $owner = TEST_USER;
    $file = backup_write('manual');
    $with = backup_read($file);
    assert_true(is_array($with['translations'] ?? null));
    $before = [everything_of($owner), everything_of(OTHER)];

    // Since that backup: a string reworded, a language deleted, a key gained; and something studied.
    db_exec("UPDATE translations SET value = 'Slovíčko', updated_by = ? WHERE key_name = 'test.word' AND language_code = 'sk'", [$owner]);
    db_exec("DELETE FROM languages WHERE code = 'de'");
    db_exec("INSERT INTO translation_keys (name) VALUES ('test.later')");
    db_exec("INSERT INTO translations (key_name, language_code, value) VALUES ('test.later', 'en', 'Later')");
    $words = words();
    store_put($owner, 'k:一', srs_learn(null, now_ms()));

    $counts = backup_restore($with);
    assert_same(2, $counts['people']);
    assert_same($before, [everything_of($owner), everything_of(OTHER)], 'the study data as the file has it');
    assert_same($words, words(), 'the words as they are now: a restore reads nothing of them');

    // The same file without the entry, as every backup was before the app kept its words in the database.
    $without = backup_dir() . '/academy-without-words.json';
    file_put_contents($without, json_text(array_diff_key($with, ['translations' => 0])) . "\n");
    store_put($owner, 'k:二', srs_learn(null, now_ms()));
    assert_same($counts, backup_restore(backup_read($without)), 'restores as before');
    assert_same($before, [everything_of($owner), everything_of(OTHER)]);
    assert_same($words, words());

    // Nor does it matter what stands there: the entry is never read, so it can never stop a restore of study data.
    foreach (['not even a map', ['languages' => 'x', 'values' => [['a']]], null, 5] as $odd) {
        file_put_contents($without, json_text(['translations' => $odd] + $with) . "\n");
        assert_same($counts, backup_restore(backup_read($without)), test_show($odd));
    }
    assert_same($words, words());

    // And the command line's --restore: the same.
    store_put($owner, 'k:三', srs_learn(null, now_ms()));
    exec(escapeshellarg(PHP_BINARY) . ' ' . escapeshellarg(BACKEND . '/manage.php') . ' --restore=' . escapeshellarg($file) . ' 2>&1', $out, $code);
    assert_same(0, $code, implode("\n", $out));
    assert_match('/Restored from .*: 2 people, /', implode("\n", $out));
    assert_same($before, [everything_of($owner), everything_of(OTHER)]);
    assert_same($words, words(), 'not a word changed');
    unlink($without);
    unlink($file);
});

test('before a language is deleted: a copy of its strings in the backups, which nothing takes for a backup of study data', function (): void {
    db_exec("INSERT INTO languages (code, name, native_name, enabled, sort_order) VALUES ('de', 'German', 'Deutsch', false, 3)");
    db_exec("INSERT INTO translations (key_name, language_code, value) VALUES ('test.word', 'de', 'Wort'), ('test.later', 'de', 'Später – „bald“')");
    $copies = static fn (): array => array_map('basename', glob(backup_dir() . '/' . TRANSLATIONS_COPY_PREFIX . '*.json') ?: []);

    // What is refused leaves no copy (the anotoki library's delete, with this app's copy first: academy_language_usage()).
    $refused = static function (string $code): array {
        $answer = academy_translations()->deleteLanguage($code);
        return $answer instanceof Anotoki\Lib\Support\Refusal ? [$answer->status, $answer->code] : [200, 'deleted'];
    };
    assert_same([409, 'fallback_language'], $refused('en'));
    assert_same([409, 'seeded_language'], $refused('sk'));
    assert_same([404, 'not_found'], $refused('fr'));
    assert_same([404, 'not_found'], $refused("d\xFF"), 'what is no code reaches no query and names no file');
    assert_same([], $copies());

    $words = words();
    $answer = academy_translations()->deleteLanguage('de');
    assert_false($answer instanceof Anotoki\Lib\Support\Refusal);
    assert_same([2, ['copy']], [$answer['strings'], array_keys($answer['extras'])], 'its two strings went, and the copy is named in the answer');
    $body = $answer['extras'];
    assert_match('/^academy-before-language-delete-de-\d{8}-\d{6}-\d{3}\.json$/D', $body['copy']);
    assert_same([$body['copy']], $copies(), 'in the backup folder, under the language’s code and the time');
    $file = backup_dir() . '/' . $body['copy'];
    assert_same("{\n    \"test.later\": \"Später – „bald“\",\n    \"test.word\": \"Wort\"\n}\n", file_get_contents($file), 'its own strings, flat, as an export gives them');
    assert_same([], glob(backup_dir() . '/*.tmp') ?: [], 'written aside and renamed');
    assert_same([0, 0], [(int) db_value("SELECT count(*) FROM languages WHERE code = 'de'"), (int) db_value("SELECT count(*) FROM translations WHERE language_code = 'de'")], 'then the language, and its strings with it');
    assert_same($words[1], words()[1], 'the keys are the code’s, and stay');
    assert_same(array_values(array_filter($words[2], static fn (array $r): bool => $r['language_code'] !== 'de')), words()[2], 'and no other language lost a string');

    // It is a flat {key: text}: no backup of anybody's data, and never counted or thinned with the day's copies.
    assert_throws(static fn () => backup_read($file), '/is not a Japanese Academy backup/');
    assert_false((bool) preg_match(DAILY_BACKUP, $body['copy']));
    unlink(backup_dir() . '/academy-' . utc_date() . '.json');
    backup_daily();
    assert_same([$body['copy']], $copies(), 'the day’s backup leaves it where it is');
    unlink($file);
});

test('a throwaway database keeps its copies apart from yours, even without a folder of its own', function (): void {
    $dir = str_replace('\\', '/', backup_dir());
    assert_same($GLOBALS['TEST_CONFIG']['backups'], $dir, 'the folder of the test’s settings');
    config_overrides(['app' => ['backups_dir' => '']]);
    try {
        assert_match('~/academy-backups-' . db_name() . '$~', backup_dir());
        assert_false(str_starts_with(str_replace('\\', '/', backup_dir()), str_replace('\\', '/', ROOT)), 'not in the repository’s backend/storage/backups/');
        config_overrides(['db' => ['name' => 'anotoki_japanese_academy'], 'app' => ['backups_dir' => sys_get_temp_dir()]]);
        assert_same(str_replace('\\', '/', BACKEND) . '/storage/backups', backup_dir(), 'your own database: backend/storage/backups/, whatever a setting says');
    } finally {
        config_overrides([]);
        config_all(true);
    }
    assert_same($dir, str_replace('\\', '/', backup_dir()));
});

test('before a migration: every table copied as it is, whatever its columns', function (): void {
    $file = backup_write_raw('before-migration');
    assert_match('/academy-before-migration-\d{8}-\d{6}-\d{3}\.raw\.json$/', $file);
    $raw = read_json($file);
    assert_same('japanese-academy-tables', $raw['format']);
    assert_same(db_name(), $raw['database']);
    // with the app's own words: the three tables of migration 004 are copied like every other
    foreach (['migrations', 'users', 'srs_settings', 'srs_progress', 'srs_daily', 'srs_log', 'exam_attempts', 'imports', 'languages', 'translation_keys', 'translations'] as $t) {
        assert_true(array_key_exists($t, $raw['tables']), "table $t");
        assert_same((int) db_value("SELECT count(*) FROM $t"), count($raw['tables'][$t]), "rows of $t");
    }
    foreach (['srs_items', 'exam_questions', 'content_state'] as $t) {
        assert_false(array_key_exists($t, $raw['tables']), "$t is rebuilt from data/, not copied");
    }
    assert_true(in_array('k:大', array_column($raw['tables']['srs_progress'], 'item_id'), true));
    unlink($file);
});

test('the day’s backup: the last 14 are kept', function (): void {
    foreach (range(1, 20) as $d) {
        file_put_contents(backup_dir() . sprintf('/academy-2020-01-%02d.json', $d), '{}');
    }
    file_put_contents(backup_dir() . '/academy-before-reset-20200101-000000-000.json', '{}');
    unlink(backup_dir() . '/academy-' . utc_date() . '.json');
    backup_daily();
    $daily = array_values(array_filter(daily_backups(), static fn (string $f): bool => (bool) preg_match(DAILY_BACKUP, $f)));
    assert_same(14, count($daily));
    assert_same('academy-2020-01-08.json', $daily[0], 'the oldest go');
    assert_true(in_array('academy-before-reset-20200101-000000-000.json', daily_backups(), true), 'other backups stay');
});

test('restore: a backup brings everybody’s data back, and what was there is backed up first', function (): void {
    $owner = TEST_USER;
    study($owner, 'k:学', true);
    store_put($owner, 'k:学', array_merge(srs_learn(null, now_ms()), ['notes' => ['meaning' => 'a child under a roof', 'reading' => '']]));
    study(OTHER, 'k:川', true);
    $file = backup_write('manual');
    $before = [everything_of($owner), everything_of(OTHER)];

    wipe();
    store_put($owner, 'k:一', srs_learn(null, now_ms()));
    $counts = backup_restore(backup_read($file));
    assert_same(2, $counts['people']);
    assert_same(2, $counts['attempts'], 'one attempt each');
    assert_same($before, [everything_of($owner), everything_of(OTHER)], 'everything as it was, for both');
    assert_same(null, store_item($owner, 'k:一'), 'what came after the backup is gone');
    assert_throws(static fn () => learner_import($owner, backup_person_in(backup_read($file), $owner)), '/already holds study data/');
});

test('restore: a version-1 backup (from before user ids) is no longer read; a copy of one person’s data restores theirs alone', function (): void {
    $owner = TEST_USER;
    $v2 = backup_read(backup_write('manual'));
    $v1 = ['format' => BACKUP_FORMAT, 'version' => 1, 'takenAt' => $v2['takenAt'], 'database' => 'japanese_academy']
        + array_intersect_key(backup_person_in($v2, $owner), array_flip(['kanji', 'log', 'attempts']));
    $file = backup_dir() . '/academy-version-1.json';
    file_put_contents($file, json_text($v1));
    $mine = everything_of($owner);
    $theirsCopy = backup_read(backup_write('before-import', [$owner]));

    wipe_one($owner);
    study(OTHER, 'k:火');
    $theirs = everything_of(OTHER);
    assert_throws(static fn () => backup_read($file), '/is a backup of another version of Japanese Academy \(format 1\)/');
    assert_same([], everything_of($owner)[2], 'nothing restored');
    $counts = backup_restore($theirsCopy);
    assert_same(1, $counts['people']);
    assert_same($mine, everything_of($owner), 'their data as the copy has it');
    assert_same($theirs, everything_of(OTHER), 'nobody else’s touched');
    unlink($file);
});

/** Takes away one person's study data (not their users row). */
function wipe_one(int $uid): void
{
    foreach (['srs_progress', 'srs_daily', 'srs_log', 'exam_attempts', 'imports'] as $t) {
        db_exec("DELETE FROM $t WHERE user_id = ?", [$uid]);
    }
}

test('before somebody’s reset: a copy of their data alone (their last 14 kept), which restores theirs and nobody else’s', function (): void {
    $owner = TEST_USER;
    study(OTHER, 'k:水', true);
    $theirs = everything_of(OTHER);
    $older = static fn (int $uid, int $day): string => sprintf('academy-before-reset-user-%d-202001%02d-000000-000.json', $uid, $day);
    foreach (range(1, 15) as $day) {
        file_put_contents(backup_dir() . '/' . $older(OTHER, $day), '{}');
    }
    file_put_contents(backup_dir() . '/' . $older($owner, 1), '{}');

    store_reset(OTHER);
    $copies = array_values(array_filter(daily_backups(), static fn (string $f): bool => str_starts_with($f, 'academy-before-reset-user-' . OTHER . '-')));
    assert_same(14, count($copies), 'their last 14');
    assert_same($older(OTHER, 3), $copies[0], 'the oldest go');
    assert_true(in_array($older($owner, 1), daily_backups(), true), 'nobody else’s copies');
    $copy = backup_read(backup_dir() . '/' . end($copies));
    assert_same(false, $copy['everybody']);
    assert_same([OTHER], array_column($copy['users'], 'id'), 'their data alone');

    study($owner, 'k:木');
    $mine = everything_of($owner);
    $counts = backup_restore($copy);
    assert_same(1, $counts['people']);
    assert_same($theirs, everything_of(OTHER), 'theirs as it was before the reset');
    assert_same($mine, everything_of($owner), 'nobody else’s touched, not even what came after the copy');
    foreach (range(1, 15) as $day) {
        @unlink(backup_dir() . '/' . $older(OTHER, $day));
    }
    unlink(backup_dir() . '/' . $older($owner, 1));
});

test('restore: a backup that holds nobody is refused, before anything is deleted', function (): void {
    $empty = ['format' => BACKUP_FORMAT, 'version' => BACKUP_VERSION, 'takenAt' => iso_time(now_ms()), 'database' => db_name(), 'everybody' => true, 'users' => []];
    $file = backup_dir() . '/academy-nobody.json';
    file_put_contents($file, json_text($empty));
    assert_throws(static fn () => backup_read($file), '/holds nobody\'s data: there is nothing in it to restore/');
    $rows = (int) db_value('SELECT count(*) FROM srs_log');
    assert_true($rows > 0);
    assert_throws(static fn () => backup_restore($empty), '/holds nobody\'s data, so nothing was restored/');
    assert_throws(static fn () => backup_restore(['users' => ['not a person']] + $empty), '/holds nobody\'s data/');
    assert_same($rows, (int) db_value('SELECT count(*) FROM srs_log'), 'nothing deleted');
    unlink($file);
});

test('a file written aside has a name of its own: another writer’s half-written copy is left alone', function (): void {
    $file = backup_dir() . '/academy-aside.json';
    file_put_contents("$file.tmp", 'another writer’s half');
    file_put_atomic($file, '{"mine": true}');
    assert_same('{"mine": true}', file_get_contents($file));
    assert_same('another writer’s half', file_get_contents("$file.tmp"), 'neither written into nor renamed away');
    assert_same(["$file.tmp"], glob(backup_dir() . '/*.tmp') ?: [], 'and none of its own left behind');
    unlink("$file.tmp");
    unlink($file);
});

test('a backup of several people: one of them is picked by user id, or none', function (): void {
    $data = backup_data();
    assert_same(OTHER, backup_person_in($data, OTHER)['id']);
    assert_throws(static fn () => backup_person_in($data, 99), '/holds the data of \d+ people \(user ids [\d, ]*7001[\d, ]*\), and none of them is user 99/');
    assert_throws(static fn () => backup_read(__FILE__), '/is not valid JSON/');
    $wrong = backup_dir() . '/academy-wrong.json';
    file_put_contents($wrong, json_text(['format' => BACKUP_FORMAT, 'version' => 9]));
    assert_throws(static fn () => backup_read($wrong), '/another version of Japanese Academy \(format 9\)/');
});

test('backend/manage.php: a version-1 file is refused, a copy of one person restores theirs; the owner id, the old files and --user are no options any more; --check says when all is ready', function (): void {
    $php = escapeshellarg(PHP_BINARY) . ' ' . escapeshellarg(BACKEND . '/manage.php');
    $yours = array_map(static fn (string $f): ?string => is_file(BACKEND . "/config/$f") ? md5_file(BACKEND . "/config/$f") : null, CONFIG_FILES);
    $mine = everything_of(TEST_USER);
    $v2 = backup_read(backup_write('manual'));
    $file = backup_dir() . '/academy-version-1-manage.json';
    file_put_contents($file, json_text(['format' => BACKUP_FORMAT, 'version' => 1, 'takenAt' => $v2['takenAt']]
        + array_intersect_key(backup_person_in($v2, TEST_USER), array_flip(['kanji', 'log', 'attempts']))));

    exec("$php --restore=" . escapeshellarg($file) . ' 2>&1', $refused, $code);
    assert_same(1, $code, 'a file from before user ids');
    assert_match('/is a backup of another version of Japanese Academy \(format 1\)\./', implode("\n", $refused));
    assert_same($mine, everything_of(TEST_USER), 'nothing changed');
    unlink($file);

    $copy = backup_write('before-import', [TEST_USER]);
    wipe_one(TEST_USER);
    exec("$php --restore=" . escapeshellarg($copy) . ' 2>&1', $out, $code);
    assert_same(0, $code, implode("\n", $out));
    assert_match('/Restored from .*: 1 person \(the file holds theirs alone: everybody else\'s data is as it was\), /', implode("\n", $out));
    assert_same($mine, everything_of(TEST_USER), 'as the copy has it');

    foreach (['--owner-id=4242', '--import=' . escapeshellarg(sys_get_temp_dir()), '--user=' . TEST_USER] as $gone) {
        exec("$php $gone 2>&1", $said, $code);
        assert_same(1, $code, $gone);
        assert_match('/Say what to do: --check, --sync, --backup or --restore=FILE \(the top/', implode("\n", $said), $gone);
    }
    exec("$php --check 2>&1", $check, $code);
    assert_same(0, $code, implode("\n", $check));
    assert_match('/^Ready: database academy_test_/', implode("\n", $check));
    assert_same($yours, array_map(static fn (string $f): ?string => is_file(BACKEND . "/config/$f") ? md5_file(BACKEND . "/config/$f") : null, CONFIG_FILES),
        'your own settings are not a test’s to change');
});

/** backend/manage.php with these options, as the owner's computer runs it: no draft named. */
function manage_as_owner(array $options): array
{
    $env = ['ACADEMY_MIGRATION_DRAFTS' => ''] + getenv();
    $null = PHP_OS_FAMILY === 'Windows' ? 'NUL' : '/dev/null';
    $out = (string) tempnam(sys_get_temp_dir(), 'academy-manage-');
    $proc = proc_open(array_merge([PHP_BINARY, BACKEND . '/manage.php'], $options), [0 => ['file', $null, 'r'], 1 => ['file', $out, 'w'], 2 => ['file', $out, 'a']], $pipes, ROOT, $env);
    $code = proc_close($proc);
    $said = (string) file_get_contents($out);
    unlink($out);
    return [$code, $said];
}

test('backend/manage.php while the newest migration is still being written: --backup takes its copy all the same; the rest waits for it', function (): void {
    $drafts = test_config_migration_drafts();
    if (!$drafts) {
        echo "    (no migration is a draft now: nothing waits)\n";
        return;
    }
    $draft = end($drafts);
    // The owner's database while the draft waits: without what the draft makes (007: users' visitor columns).
    db_exec('DELETE FROM migrations WHERE name = ?', [$draft]);
    db_exec('ALTER TABLE users DROP COLUMN visitor_key_hash CASCADE, DROP COLUMN visitor_from');
    try {
        [$code, $said] = manage_as_owner(['--backup']);
        assert_same(0, $code, $said);
        assert_match('/Note: backend\/migrations\/' . preg_quote($draft, '/') . ' does not end with its last line/', $said);
        assert_true((bool) preg_match('/^Backup: (.*academy-manual-\d{8}-\d{6}-\d{3}(-\d+)?\.json)\R/m', $said, $m), $said);
        $copy = backup_read(trim($m[1]));
        assert_same(array_map('intval', array_column(db_all('SELECT id FROM users ORDER BY id'), 'id')), array_column($copy['users'], 'id'),
            'everybody, read without the columns');
        assert_same(null, db_value('SELECT name FROM migrations WHERE name = ?', [$draft]), 'and the draft not applied');

        foreach ([['--sync'], ['--restore=' . trim($m[1])]] as $options) {
            [$code, $said] = manage_as_owner($options);
            assert_same(1, $code, implode(' ', $options));
            assert_match('/does not end with its last line/', $said, implode(' ', $options));
        }
        // --check says the draft waits, and offers nothing to apply: nothing would apply it.
        [$code, $said] = manage_as_owner(['--check']);
        assert_same(1, $code, $said);
        assert_match('/^Waiting: backend\/migrations\/' . preg_quote($draft, '/') . ' does not end with its last line/m', $said);
        assert_false(str_contains($said, 'To do: apply'), $said);
    } finally {
        db_exec('ALTER TABLE users ADD COLUMN IF NOT EXISTS visitor_key_hash char(64) UNIQUE, ADD COLUMN IF NOT EXISTS visitor_from char(64)');
        db_exec('INSERT INTO migrations (name) VALUES (?) ON CONFLICT DO NOTHING', [$draft]);
    }
});

test('backend/manage.php --check with a whole migration pending: who applies it (no request does), and only the content rebuild is a request’s', function (): void {
    // the newest whole one (a draft waits instead: the test before this one)
    $whole = array_values(array_diff(array_column(db_all('SELECT name FROM migrations ORDER BY name DESC'), 'name'), test_config_migration_drafts()));
    $newest = (string) $whole[0];
    db_exec('DELETE FROM migrations WHERE name = ?', [$newest]); // as an upload or a pull leaves the owner's database
    try {
        [$code, $said] = manage_as_owner(['--check']);
    } finally {
        db_exec('INSERT INTO migrations (name) VALUES (?) ON CONFLICT DO NOTHING', [$newest]);
    }
    assert_same(1, $code, $said);
    assert_match('/(?:^|\R)To do: apply ' . preg_quote($newest, '/') . '\. An ADMIN applies it on the admin panel\'s Migrations page \(\/admin\/migrations: Apply pending\),'
        . ' or manage\.php --sync does \(the setup page too\)\. Until then the site tells everybody it is being updated\.\R/', $said);
    assert_no_match('/first request/', $said, 'a request never applies one');

    $hash = db_value('SELECT hash FROM content_state');
    db_exec("UPDATE content_state SET hash = 'built from other files'");
    try {
        [$code, $said] = manage_as_owner(['--check']);
    } finally {
        db_exec('UPDATE content_state SET hash = ?', [$hash]);
    }
    assert_same(1, $code, $said);
    assert_match('/(?:^|\R)To do: rebuild the study content from backend\/data\/\. The app\'s first request, manage\.php --sync or the setup page \(\/setup\.php\) does it\.\R/', $said);
});
