<?php
// The study data outside the database and back: the day's backup of
// everybody's data, a restore (version 2: everybody; version 1, from before
// user ids: the owner), giving the owner's data another user id, and the
// one-time import of the old JSON files (from a fixture in a temp folder:
// tests never read progress/, results/ or reports/).
declare(strict_types=1);

require __DIR__ . '/../lib.php'; // before the app loads: a throwaway database and backup folder

before(function (): void {
    test_db();
});

/** Somebody who is not the owner. */
const OTHER = 7001;

function daily_backups(): array
{
    return array_map('basename', glob(backup_dir() . '/academy-*.json') ?: []);
}

/** The old files, as the app wrote them before it used a database. */
function fixture(): string
{
    $dir = str_replace('\\', '/', sys_get_temp_dir()) . '/academy-test-fixture-' . bin2hex(random_bytes(4));
    foreach (['progress', 'results', 'reports'] as $d) {
        mkdir("$dir/$d", 0777, true);
    }
    $item = array_merge(srs_blank(), ['stage' => 4, 'learnedAt' => 1790154533255, 'nextReview' => 1790168400000, 'synonyms' => ['large']]);
    file_put_contents("$dir/progress/kanji.json", json_text([
        'version' => 1, 'createdAt' => 1790153500962, 'updatedAt' => 1790239383533,
        'settings' => ['batchSize' => 3, 'lessonTypes' => 'both', 'autoplay' => false],
        'items' => ['k:大' => $item, 'k:学' => ['stage' => 2]], // an old record may lack fields
        'daily' => ['2026-09-23' => ['lessons' => 2, 'reviews' => 0, 'reviewsCorrect' => 0, 'practice' => 0, 'practiceCorrect' => 0]],
    ]));
    file_put_contents("$dir/progress/kanji-log.jsonl", implode("\n", [
        '{"t":1790154533257,"kind":"lesson","id":"k:大"}',
        '{"t":1790154533300,"kind":"lesson","id":"k:学"}',
        'not json',
        '{"t":1790239383536,"kind":"review","id":"k:大","meaningWrong":0,"readingWrong":1,"from":1,"to":2}',
    ]) . "\n");
    $id = '2026-09-22T11-09-21-059Z-exam-1790075246120-320199';
    file_put_contents("$dir/results/$id.json", json_text([
        'id' => $id, 'startedAt' => '2026-09-22T11:07:26.000Z', 'finishedAt' => '2026-09-22T11:09:21.059Z',
        'meta' => ['candidate' => 'irelevant'], 'exam' => ['seed' => 'exam-1790075246120-320199', 'size' => 38, 'books' => [1], 'lessons' => [0, 1, 2], 'sections' => ['kana']],
        'summary' => ['total' => 38, 'answered' => 38, 'unanswered' => 0, 'right' => 14, 'wrong' => 24, 'pct' => 36.8, 'grade' => 'F', 'passed' => false, 'passMark' => 70, 'totalMs' => 114886, 'avgMs' => 3023],
        'bySection' => [], 'byLesson' => [], 'byBook' => [], 'responses' => [],
    ]));
    file_put_contents("$dir/reports/$id.html", "<!doctype html><title>the old report</title>\n");
    file_put_contents("$dir/reports/lost.html", '<!doctype html>');
    $GLOBALS['fixtures'][] = $dir;
    return $dir;
}

function tree_hash(string $dir): string
{
    $h = [];
    foreach (['progress', 'results', 'reports'] as $d) {
        foreach (glob("$dir/$d/*") ?: [] as $f) {
            $h[] = basename($f) . ':' . md5_file($f) . ':' . filemtime($f);
        }
    }
    return implode(',', $h);
}

after(function (): void {
    foreach ($GLOBALS['fixtures'] ?? [] as $dir) {
        foreach (glob("$dir/*/*") ?: [] as $f) {
            unlink($f);
        }
        foreach (glob("$dir/*") ?: [] as $d) {
            rmdir($d);
        }
        rmdir($dir);
    }
});

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
    study(auth_local_user_id(), 'k:大');
    study(OTHER, 'k:山');
    db_exec("UPDATE users SET preferred_username = 'ada' WHERE id = ?", [OTHER]);
    $file = backup_daily();
    assert_same(['academy-' . local_date() . '.json'], daily_backups(), 'one finished backup, no .tmp left');
    assert_same(str_replace('\\', '/', backup_dir() . '/academy-' . local_date() . '.json'), str_replace('\\', '/', (string) $file));
    $b = backup_read($file);
    assert_same(2, $b['version']);
    $mine = backup_person_in($b, auth_local_user_id());
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
    assert_same(languages_all(), $held['languages'], 'every language, the hidden one too, as the owner’s page lists them');
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
    assert_same(['format', 'version', 'takenAt', 'database', 'everybody', 'users'], array_keys(backup_data([auth_local_user_id(), OTHER])));
});

test('a restore passes the words over: they are the site’s, not anybody’s study data; and a file without them restores as before', function (): void {
    $owner = auth_local_user_id();
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

test('before a language is deleted: a copy of its strings in backups/, which nothing takes for a backup of study data', function (): void {
    db_exec("INSERT INTO languages (code, name, native_name, enabled, sort_order) VALUES ('de', 'German', 'Deutsch', false, 3)");
    db_exec("INSERT INTO translations (key_name, language_code, value) VALUES ('test.word', 'de', 'Wort'), ('test.later', 'de', 'Später – „bald“')");
    $copies = static fn (): array => array_map('basename', glob(backup_dir() . '/' . TRANSLATIONS_COPY_PREFIX . '*.json') ?: []);

    // What is refused leaves no copy.
    assert_same([409, 'fallback_language'], [languages_delete('en')[0], languages_delete('en')[1]['code']]);
    assert_same([409, 'seeded_language'], [languages_delete('sk')[0], languages_delete('sk')[1]['code']]);
    assert_same([404, 'not_found'], [languages_delete('fr')[0], languages_delete('fr')[1]['code']]);
    assert_same(404, languages_delete("d\xFF")[0], 'what is no code reaches no query and names no file');
    assert_same([], $copies());

    $words = words();
    [$status, $body] = languages_delete('de');
    assert_same([200, ['copy']], [$status, array_keys($body)]);
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
    unlink(backup_dir() . '/academy-' . local_date() . '.json');
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
        assert_false(str_starts_with(str_replace('\\', '/', backup_dir()), str_replace('\\', '/', ROOT)), 'not in the repository’s backups/');
        config_overrides(['db' => ['name' => 'japanese_academy'], 'app' => ['backups_dir' => sys_get_temp_dir()]]);
        assert_same(str_replace('\\', '/', ROOT) . '/backups', backup_dir(), 'your own database: backups/ at the root, whatever a setting says');
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
    unlink(backup_dir() . '/academy-' . local_date() . '.json');
    backup_daily();
    $daily = array_values(array_filter(daily_backups(), static fn (string $f): bool => (bool) preg_match(DAILY_BACKUP, $f)));
    assert_same(14, count($daily));
    assert_same('academy-2020-01-08.json', $daily[0], 'the oldest go');
    assert_true(in_array('academy-before-reset-20200101-000000-000.json', daily_backups(), true), 'other backups stay');
});

test('restore: a backup brings everybody’s data back, and what was there is backed up first', function (): void {
    $owner = auth_local_user_id();
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

test('restore: a version-1 backup (before user ids) is the owner’s, and leaves everybody else alone', function (): void {
    $owner = auth_local_user_id();
    $v2 = backup_read(backup_write('manual'));
    $v1 = ['format' => BACKUP_FORMAT, 'version' => 1, 'takenAt' => $v2['takenAt'], 'database' => 'japanese_academy']
        + array_intersect_key(backup_person_in($v2, $owner), array_flip(['kanji', 'log', 'attempts']));
    $file = backup_dir() . '/academy-version-1.json';
    file_put_contents($file, json_text($v1));
    $mine = everything_of($owner);

    wipe_one($owner);
    study(OTHER, 'k:火');
    $theirs = everything_of(OTHER);
    $counts = backup_restore(backup_read($file));
    assert_same(1, $counts['people']);
    assert_same($mine, everything_of($owner), 'the owner’s data as the file has it');
    assert_same($theirs, everything_of(OTHER), 'nobody else’s touched');
    $items = array_keys(backup_person_in($v1)['kanji']['items']);
    sort($items);
    assert_same(['k:大', 'k:学'], $items, 'a version-1 file is one person’s data');
});

/** Takes away one person's study data (not their users row). */
function wipe_one(int $uid): void
{
    foreach (['srs_progress', 'srs_daily', 'srs_log', 'exam_attempts', 'imports'] as $t) {
        db_exec("DELETE FROM $t WHERE user_id = ?", [$uid]);
    }
}

test('before somebody’s reset: a copy of their data alone (their last 14 kept), which restores theirs and nobody else’s', function (): void {
    $owner = auth_local_user_id();
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

test('the owner’s data to another user id: everything moves, nothing is lost, and a user with data of their own is refused', function (): void {
    $owner = auth_local_user_id();
    $mine = everything_of($owner);
    $count = static fn (int $uid): int => (int) db_value('SELECT (SELECT count(*) FROM srs_progress WHERE user_id = ?) + (SELECT count(*) FROM srs_log WHERE user_id = ?)', [$uid, $uid]);
    $rows = $count($owner);
    assert_true($rows > 0);
    assert_throws(static fn () => users_move($owner, OTHER), '/User 7001 already has data here, so nothing was moved/');
    assert_same($rows, $count($owner), 'a refused move changes nothing');

    users_seen(4242, 'owner-at-the-iam'); // signed in once: a bare row, nothing studied
    $moved = users_move($owner, 4242);
    assert_same($rows, $moved['srs_progress'] + $moved['srs_log']);
    assert_same(0, $count($owner));
    assert_same($mine, everything_of(4242), 'all of it, as it was');
    assert_same('owner-at-the-iam', db_value('SELECT preferred_username FROM users WHERE id = 4242'));
    assert_same(null, db_value('SELECT id FROM users WHERE id = ?', [$owner]), 'no row left behind');

    users_move(4242, $owner);
    assert_same($mine, everything_of($owner), 'and back');

    // The same through backend/manage.php, which saves the new id in the
    // settings: the test's own (ACADEMY_CONFIG_DIR), never yours.
    $php = escapeshellarg(PHP_BINARY) . ' ' . escapeshellarg(BACKEND . '/manage.php');
    $yours = array_map(static fn (string $f): ?string => is_file(BACKEND . "/config/$f") ? md5_file(BACKEND . "/config/$f") : null, CONFIG_FILES);
    $ownerIs = static fn (): int => (int) ((require $GLOBALS['TEST_CONFIG']['dir'] . '/auth.local.php')['local_user_id'] ?? 0);
    exec("$php --owner-id=" . OTHER . ' 2>&1', $refused, $code);
    assert_same(1, $code, 'refused: that user has data of their own');
    assert_match('/User 7001 already has data here, so nothing was moved/', implode("\n", $refused));
    assert_same($owner, $ownerIs(), 'and the setting is as it was');
    exec("$php --owner-id=4242 2>&1", $out, $code);
    assert_same(0, $code, implode("\n", $out));
    assert_match("/Backup first: .*academy-before-owner-change-.*\\n.*Your data \\(user $owner\\) is now user 4242's: \\d+ in srs_settings/s", implode("\n", $out));
    assert_match('/Saved auth\.local_user_id = 4242 in auth\.local\.php/', implode("\n", $out));
    assert_same(4242, $ownerIs(), 'the owner is user 4242 now, without sign-in too');
    assert_same($mine, everything_of(4242));
    // As after a restore that brought the data in under the new id already: nothing to move.
    test_config_write($GLOBALS['TEST_CONFIG']['dir'], db_name(), 'none', null, $GLOBALS['TEST_CONFIG']['backups']); // user 1 again
    exec("$php --owner-id=4242 2>&1", $again, $code);
    assert_same(0, $code, implode("\n", $again));
    assert_match("/Your data is user 4242's already \\(and user $owner has none\\)/", implode("\n", $again));
    assert_no_match('/Backup first/', implode("\n", $again), 'nothing moved, so no copy for it');
    assert_same($mine, everything_of(4242));
    users_move(4242, $owner);
    test_config_write($GLOBALS['TEST_CONFIG']['dir'], db_name(), 'none', null, $GLOBALS['TEST_CONFIG']['backups']);
    config_all(true);
    assert_same($yours, array_map(static fn (string $f): ?string => is_file(BACKEND . "/config/$f") ? md5_file(BACKEND . "/config/$f") : null, CONFIG_FILES),
        'your own settings are not a test’s to change');
});

test('import of the old files: once, only into an owner without study data, the files untouched', function (): void {
    wipe();
    $owner = auth_local_user_id();
    $dir = fixture();
    $hash = tree_hash($dir);
    $r = legacy_import($dir, $owner);
    assert_same(2, $r['items']);
    assert_same(1, $r['days']);
    assert_same(3, $r['log']);
    assert_same(1, $r['attempts']);
    assert_same(1, $r['reports']);
    assert_same(['progress/kanji-log.jsonl line 3: not a log line', 'reports/lost.html: no attempt in results/ to go with it'], $r['problems']);
    assert_same($hash, tree_hash($dir), 'the files are only read');
    assert_same(['skipped' => 'already imported'], legacy_import($dir, $owner));

    $k = store_export($owner);
    assert_same(['batchSize' => 3, 'lessonTypes' => 'both', 'autoplay' => false], $k['settings']);
    assert_same(1790153500962, $k['createdAt']);
    assert_same(1790239383533, $k['updatedAt']);
    assert_same(4, $k['items']['k:大']['stage']);
    assert_same(['large'], $k['items']['k:大']['synonyms']);
    assert_same(array_merge(srs_blank(), ['stage' => 2]), $k['items']['k:学'], 'a short record gets its missing fields');
    assert_same(['t' => 1790239383536, 'kind' => 'review', 'id' => 'k:大', 'meaningWrong' => 0, 'readingWrong' => 1, 'from' => 1, 'to' => 2], store_log_all($owner)[2]);
    assert_same(0, (int) db_value('SELECT count(*) FROM srs_progress WHERE user_id <> ?', [$owner]), 'the owner’s, nobody else’s');

    // and the server shows it
    $app = start_app();
    $p = call($app['base'], 'GET', '/api/kanji/progress')['body'];
    assert_same(4, $p['items']['k:大']['stage']);
    $hist = call($app['base'], 'GET', '/api/attempts')['body'];
    assert_same([['id' => '2026-09-22T11-09-21-059Z-exam-1790075246120-320199', 'finishedAt' => '2026-09-22T11:09:21.059Z', 'total' => 38, 'right' => 14, 'pct' => 36.8, 'grade' => 'F', 'passed' => false, 'candidate' => 'irelevant']], $hist);
    assert_same("<!doctype html><title>the old report</title>\n", call($app['base'], 'GET', '/report/2026-09-22T11-09-21-059Z-exam-1790075246120-320199')['raw'], 'the old report, as it was');
});

test('import: an unreadable progress file stops it, and nothing is imported', function (): void {
    wipe();
    $dir = fixture();
    file_put_contents("$dir/progress/kanji.json", '{"version": 1, "items": {');
    assert_throws(static fn () => legacy_import($dir, auth_local_user_id()), '/kanji\.json is not valid JSON/');
    assert_false(learner_has_data());
});

test('import: with study data in the database, the old files are not even read', function (): void {
    wipe();
    $dir = fixture();
    file_put_contents("$dir/progress/kanji.json", '{"version": 1, "items": {'); // would stop a read
    store_put(auth_local_user_id(), 'k:一', srs_learn(null, now_ms()));
    assert_same(['skipped' => 'the database already holds study data'], legacy_import($dir, auth_local_user_id()));
});

test('backend/manage.php: imports a folder it is given, and --check says when all is ready', function (): void {
    wipe();
    $dir = fixture();
    $php = escapeshellarg(PHP_BINARY) . ' ' . escapeshellarg(BACKEND . '/manage.php');
    exec("$php --import=" . escapeshellarg($dir) . ' 2>&1', $out, $code);
    assert_same(0, $code, implode("\n", $out));
    assert_match('/Imported your study history .*2 kanji items, 1 days, 3 answers, 1 exam attempts/', implode("\n", $out));
    assert_same(2, count(store_items(auth_local_user_id())), 'into the owner’s account');
    exec("$php --check 2>&1", $check, $code);
    assert_same(0, $code, implode("\n", $check));
    assert_match('/^Ready: database academy_test_/', implode("\n", $check));
});
