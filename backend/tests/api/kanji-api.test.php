<?php
// /api/kanji end to end: the real server with its own throwaway database; the
// clock is moved by editing that database. Sign-in is off (auth mode none), so
// every request is the owner (auth.local_user_id).
declare(strict_types=1);

require __DIR__ . '/../lib.php'; // before the app loads: a throwaway database and backup folder

$GLOBALS['app'] = null;
before(function (): void {
    $GLOBALS['app'] = start_app();
});

function api(string $method, string $url, $body = null): array
{
    return call($GLOBALS['app']['base'], $method, "/api/kanji$url", $body);
}

function make_due(string $id): void
{
    db_exec('UPDATE srs_progress SET next_review = academy_time(?) WHERE user_id = ? AND item_id = ?', [now_ms() - 1000, auth_local_user_id(), $id]);
}

test('fresh start', function (): void {
    $cat = api('GET', '/catalog')['body'];
    $p = api('GET', '/progress')['body'];
    assert_same(0, $p['summary']['learned']);
    assert_same(0, $p['summary']['reviewsDue']);
    assert_same(count(array_filter($cat['items'], static fn (array $i): bool => $i['type'] === 'kanji')), $p['summary']['lessonsAvailable']);
    assert_same(5, $p['settings']['batchSize']);
    assert_same([], $p['items'], 'no progress yet');
    assert_same('{}', json_encode((object) $p['items']));
    assert_match('/"items":\{\}/', api('GET', '/progress')['raw'], 'an empty object, as the browser expects');
});

test('lessons: vocabulary waits for its kanji; nothing is learned twice', function (): void {
    assert_same(409, api('POST', '/learn', ['id' => 'v:大学'])['status']);
    foreach (['k:大', 'k:学'] as $id) {
        $r = api('POST', '/learn', ['id' => $id]);
        assert_same(200, $r['status']);
        assert_same(1, $r['body']['state']['stage']);
    }
    assert_same(200, api('POST', '/learn', ['id' => 'v:大学'])['status']);
    assert_same(409, api('POST', '/learn', ['id' => 'k:大'])['status']);
    assert_same(404, api('POST', '/learn', ['id' => 'k:nope'])['status']);
    $p = api('GET', '/progress')['body'];
    assert_same(3, $p['summary']['learned']);
    assert_same(3, $p['summary']['today']['lessons']);
    assert_same(3, array_sum($p['summary']['forecastHours']));
});

test('reviews: only when due, once, and the stage moves', function (): void {
    assert_same(409, api('POST', '/review', ['id' => 'k:大'])['status'], 'not due yet');
    foreach (['k:大', 'k:学', 'v:大学'] as $id) {
        make_due($id);
    }
    assert_same(3, api('GET', '/progress')['body']['summary']['reviewsDue']);

    $r = api('POST', '/review', ['id' => 'k:大', 'meaningWrong' => 0, 'readingWrong' => 0]);
    assert_same([1, 2], [$r['body']['from'], $r['body']['to']]);
    assert_same(409, api('POST', '/review', ['id' => 'k:大'])['status'], 'double submit refused');

    $r = api('POST', '/review', ['id' => 'k:学', 'meaningWrong' => 1, 'readingWrong' => 1]);
    assert_same(1, $r['body']['to'], 'floor at Apprentice I');
    for ($i = 0; $i < 4; $i++) {
        make_due('k:学');
        $r = api('POST', '/review', ['id' => 'k:学']);
    }
    assert_same(5, $r['body']['to'], 'Guru I');
    make_due('k:学');
    $r = api('POST', '/review', ['id' => 'k:学', 'readingWrong' => 1]);
    assert_same(3, $r['body']['to'], 'Guru with a miss drops two stages');
});

test('practice: recorded, but never touches the schedule', function (): void {
    $before = store_item(auth_local_user_id(), 'v:大学');
    $r = api('POST', '/practice', ['id' => 'v:大学', 'firstTryCorrect' => false, 'wrong' => 2]);
    assert_same(1, $r['body']['state']['practice']['incorrect']);
    for ($i = 0; $i < 25; $i++) {
        api('POST', '/practice', ['id' => 'v:大学', 'firstTryCorrect' => true]);
    }
    $after = store_item(auth_local_user_id(), 'v:大学');
    assert_same($before['stage'], $after['stage']);
    assert_same($before['nextReview'], $after['nextReview']);
    assert_same(25, $after['practice']['correct']);
    assert_same(409, api('POST', '/practice', ['id' => 'k:食'])['status'], 'unlearned');
});

test('notes, synonyms and extra readings', function (): void {
    $r = api('POST', '/item', ['id' => 'k:大', 'notes' => ['meaning' => 'arms spread wide — BIG']]);
    assert_match('/BIG/', $r['body']['state']['notes']['meaning']);
    api('POST', '/item', ['id' => 'k:大', 'addSynonym' => 'large']);
    $r = api('POST', '/item', ['id' => 'k:大', 'addSynonym' => 'large']);
    assert_same(['large'], $r['body']['state']['synonyms'], 'no duplicates');
    $r = api('POST', '/item', ['id' => 'k:大', 'removeSynonym' => 'large']);
    assert_same([], $r['body']['state']['synonyms']);
    $r = api('POST', '/item', ['id' => 'k:大', 'addReading' => 'だ']);
    assert_same(['だ'], $r['body']['state']['extraReadings']);
    $r = api('POST', '/item', ['id' => 'k:食', 'notes' => ['reading' => 'before learning']]);
    assert_same(0, $r['body']['state']['stage'], 'a note alone is not learning');
    assert_same(3, api('GET', '/progress')['body']['summary']['learned']);
});

test('settings are validated', function (): void {
    $r = api('POST', '/settings', ['batchSize' => 10, 'lessonTypes' => 'kanji']);
    assert_same(10, $r['body']['settings']['batchSize']);
    $r = api('POST', '/settings', ['batchSize' => 999, 'lessonTypes' => 'bogus']);
    assert_same(20, $r['body']['settings']['batchSize']);
    assert_same('kanji', $r['body']['settings']['lessonTypes']);
});

test('persistence: in the database, every answer in the log; a backup on a page load, never on an answer', function (): void {
    assert_same(2, store_item(auth_local_user_id(), 'k:大')['stage']);
    assert_true((int) db_value('SELECT count(*) FROM srs_log') > 30, 'log lines');
    assert_same(['lesson', 'practice', 'review'], array_column(db_all('SELECT DISTINCT kind FROM srs_log ORDER BY kind'), 'kind'));
    foreach (['srs_progress', 'srs_daily', 'srs_log'] as $table) {
        assert_same([auth_local_user_id()], array_map('intval', array_column(db_all("SELECT DISTINCT user_id FROM $table"), 'user_id')),
            "every row of $table is the owner’s: without sign-in, every request is");
    }
    // The first page load with data in the database took the day's backup
    // (for a server left running overnight); answers never take one.
    $today = backup_dir() . '/academy-' . local_date() . '.json';
    assert_true(is_file($today), 'the day’s backup, taken by a page load');
    unlink($today);
    api('POST', '/practice', ['id' => 'v:大学', 'firstTryCorrect' => true]);
    api('POST', '/item', ['id' => 'k:大', 'notes' => ['reading' => 'だい: big']]);
    api('POST', '/settings', ['autoplay' => true]);
    assert_false(is_file($today), 'no backup taken by an answer');
    api('GET', '/summary');
    assert_true(is_file($today), 'the next page load takes it again');
});

test('export: the progress in the old kanji.json shape, as a download', function (): void {
    $r = api('GET', '/export');
    assert_match('/attachment; filename="kanji-progress-\d{4}-\d{2}-\d{2}\.json"/', $r['headers']['content-disposition'] ?? '');
    assert_same(1, $r['body']['version']);
    assert_same(2, $r['body']['items']['k:大']['stage']);
    assert_same(20, $r['body']['settings']['batchSize']);
    assert_true(isset($r['body']['daily'][local_date()]));
});

test('reset: one item keeps its notes; everything needs confirmation and is backed up', function (): void {
    $r = api('POST', '/reset-item', ['id' => 'k:大']);
    assert_same(0, $r['body']['state']['stage']);
    assert_match('/BIG/', $r['body']['state']['notes']['meaning']);
    assert_same(400, api('POST', '/reset', [])['status']);
    api('POST', '/reset', ['confirm' => 'RESET']);
    $p = api('GET', '/progress')['body'];
    assert_same(0, $p['summary']['learned']);
    assert_same(20, $p['settings']['batchSize'], 'settings survive a reset');
    $backups = array_map('basename', glob(backup_dir() . '/academy-before-reset-*.json') ?: []);
    assert_same(1, count($backups), 'one backup before the reset');
    assert_match('/^academy-before-reset-user-' . auth_local_user_id() . '-\d{8}-\d{6}-\d{3}\.json$/D', $backups[0], 'named after whose data it holds');
    $saved = read_json(backup_dir() . '/' . $backups[0]);
    assert_same(false, $saved['everybody'], 'that person’s data alone');
    assert_same([auth_local_user_id()], array_column($saved['users'], 'id'));
    $mine = backup_person_in($saved, auth_local_user_id());
    assert_same(auth_local_user_id(), $mine['id']);
    assert_same(3, $mine['kanji']['items']['k:学']['stage'] ?? null, 'it holds the progress as it was');
    assert_true(count($mine['log']) > 30, 'and the answer log');
    assert_same('reset', db_value('SELECT kind FROM srs_log ORDER BY id DESC LIMIT 1'), 'the log keeps going: it is never wiped');
    assert_same([], server_problems($GLOBALS['app']), 'no PHP warnings or errors on the server');
});
