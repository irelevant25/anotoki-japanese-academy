<?php
// Your own data as one file, and back (GET and PUT /api/me/data): every
// signed-in person, their data alone. Bringing a file back replaces what they
// have, after a copy of it; a file that is not one, or too big for the server,
// is refused before anything changes; an import and an answer of the same
// person take turns; nobody else's rows are ever read or written.
declare(strict_types=1);

require __DIR__ . '/../lib.php'; // before the app loads: a throwaway database and backup folder

/** The zone every request of TEST_USER's names here, so their file's zone stays what it is. */
const HOME_ZONE = 'Europe/Bratislava';
/** Somebody else, who studies too. */
const OTHER = 7101;
/** People with nothing here until a file brings it. */
const NEWCOMER = 7102;
const OUTSIDER = 7103;

$GLOBALS['app'] = null;
before(function (): void {
    $GLOBALS['app'] = start_app();
    [$a, $b, $c, $d] = array_column(db_all("SELECT id FROM srs_items WHERE type = 'kanji' ORDER BY ord LIMIT 4"), 'id');
    foreach ([$a, $b, $c] as $id) {
        assert_same(200, mine('POST', '/api/kanji/learn', ['id' => $id])['status']);
    }
    mine('POST', '/api/kanji/settings', ['batchSize' => 7, 'lessonTypes' => 'kanji']);
    mine('POST', '/api/kanji/item', ['id' => $a, 'notes' => ['meaning' => 'my own note']]);
    $paper = mine('POST', '/api/exam', ['size' => 20, 'seed' => 'mine'])['body'];
    assert_same(200, mine('POST', '/api/submit', ['spec' => $paper['spec'], 'responses' => []])['status']);
    assert_same(200, as_person(OTHER, 'POST', '/api/kanji/learn', ['id' => $d])['status']);
    $GLOBALS['items'] = [$a, $b, $c, $d];
});

/** A request of TEST_USER's, from their browser in HOME_ZONE. */
function mine(string $method, string $url, $body = null, array $headers = []): array
{
    $named = (bool) preg_grep('/^X-Time-Zone:/i', $headers);
    return call($GLOBALS['app']['base'], $method, $url, $body, array_merge($named ? [] : ['X-Time-Zone: ' . HOME_ZONE], $headers));
}

function as_person(int $user, string $method, string $url, $body = null, array $headers = []): array
{
    return call($GLOBALS['app']['base'], $method, $url, $body, array_merge($headers, test_bearer(test_token($user))));
}

/** A body exactly as given (call() sends JSON as JSON), as TEST_USER unless $headers say otherwise. */
function put_text(string $text, array $headers = [], ?array $app = null): array
{
    return test_begin(($app ?? $GLOBALS['app'])['base'], 'PUT', '/api/me/data', $text, array_merge(['X-Time-Zone: ' . HOME_ZONE], $headers))['answer']();
}

/** Everything the database holds of one person. */
function everything_of(int $uid): array
{
    return [store_export($uid), store_log_all($uid), exam_attempts_all($uid)];
}

function import_copies(int $uid): array
{
    $files = glob(backup_dir() . "/academy-before-import-user-$uid-*.json") ?: [];
    sort($files);
    return $files;
}

/* ----------------------------------------------------------------- the file */

test('the file: all of the person’s data and nobody else’s, as a download in their own day’s name', function (): void {
    $days = [(new DateTimeImmutable('now', new DateTimeZone('Pacific/Kiritimati')))->format('Y-m-d')];
    $r = mine('GET', '/api/me/data', null, ['X-Time-Zone: Pacific/Kiritimati']);
    $days[] = (new DateTimeImmutable('now', new DateTimeZone('Pacific/Kiritimati')))->format('Y-m-d');
    assert_same(200, $r['status']);
    assert_true(
        in_array(preg_replace('/^attachment; filename="japanese-academy-(.*)\.json"$/D', '$1', $r['headers']['content-disposition'] ?? ''), $days, true),
        'japanese-academy-<their day>.json: ' . ($r['headers']['content-disposition'] ?? ''),
    );
    assert_same('no-store', $r['headers']['cache-control'] ?? null);
    $file = $r['body'];
    assert_same(['format', 'version', 'takenAt', 'everybody', 'users'], array_keys($file), 'no database name, none of the site’s words');
    assert_same([BACKUP_FORMAT, BACKUP_VERSION, false], [$file['format'], $file['version'], $file['everybody']]);
    assert_same([TEST_USER], array_column($file['users'], 'id'), 'theirs alone');
    $me = $file['users'][0];
    assert_same(['id', 'username', 'createdAt', 'lastSeenAt', 'timeZone', 'kanji', 'log', 'attempts'], array_keys($me));
    assert_same('Pacific/Kiritimati', $me['timeZone'], 'the zone this request named, kept with them');
    $learned = array_slice($GLOBALS['items'], 0, 3);
    sort($learned);
    $have = array_keys($me['kanji']['items']);
    sort($have);
    assert_same($learned, $have, 'their items, not the other person’s');
    assert_same(['batchSize' => 7, 'lessonTypes' => 'kanji', 'autoplay' => true], $me['kanji']['settings']);
    assert_same(count(store_log_all(TEST_USER)), count($me['log']));
    assert_same(1, count($me['attempts']));
    assert_match('/^<!doctype html>/i', $me['attempts'][0]['report'], 'with its report');
    mine('GET', '/api/kanji/summary'); // the zone back home
});

test('a round trip: the file brought back after changes gives back what it held, after a copy of what it replaced', function (): void {
    $before = mine('GET', '/api/me/data')['body']['users'][0];
    $theirs = everything_of(OTHER);
    $copies = import_copies(TEST_USER);

    // What happens after the download: a full reset, and a lesson.
    assert_same(200, mine('POST', '/api/kanji/reset', ['confirm' => 'RESET'])['status']);
    assert_same(200, mine('POST', '/api/kanji/learn', ['id' => $GLOBALS['items'][3]])['status']);
    $changed = everything_of(TEST_USER);

    $r = mine('PUT', '/api/me/data', ['format' => BACKUP_FORMAT, 'version' => BACKUP_VERSION, 'everybody' => false, 'users' => [$before]]);
    assert_same(200, $r['status'], $r['raw']);
    assert_same(['items' => 3, 'days' => count($before['kanji']['daily']), 'log' => count($before['log']), 'attempts' => 1, 'reports' => 1, 'copy' => true], $r['body']);

    $after = mine('GET', '/api/me/data')['body']['users'][0];
    foreach (['kanji', 'log', 'attempts', 'timeZone', 'username'] as $part) {
        assert_same($before[$part], $after[$part], "$part: as the file held it");
    }
    assert_same($theirs, everything_of(OTHER), 'nobody else’s touched');

    $new = array_values(array_diff(import_copies(TEST_USER), $copies));
    assert_same(1, count($new), 'one copy, first');
    $copy = backup_read($new[0]);
    assert_same([false, [TEST_USER]], [$copy['everybody'], array_column($copy['users'], 'id')], 'of their data alone');
    assert_same($changed, [$copy['users'][0]['kanji'], $copy['users'][0]['log'], $copy['users'][0]['attempts']], 'what the file replaced, as it was');
    assert_match('/^academy-before-import-user-' . TEST_USER . '-\d{8}-\d{6}-\d{3}(-\d+)?\.json$/D', basename($new[0]));
    assert_same('file', db_value('SELECT source FROM imports WHERE user_id = ?', [TEST_USER]), 'recorded');
});

test('bringing the same file back again changes nothing more: replaced, never added to; and every import keeps its own copy', function (): void {
    $file = mine('GET', '/api/me/data')['body'];
    $mine = everything_of(TEST_USER);
    $copies = count(import_copies(TEST_USER));
    foreach ([1, 2] as $time) {
        assert_same(200, mine('PUT', '/api/me/data', $file)['status'], "time $time");
    }
    assert_same($mine, everything_of(TEST_USER), 'nothing counted twice');
    assert_same($copies + 2, count(import_copies(TEST_USER)), 'two imports, two copies: none in place of another');
    assert_same(1, (int) db_value("SELECT count(*) FROM imports WHERE user_id = ? AND source = 'file'", [TEST_USER]), 'one line, the latest');
});

test('a file of one person under another id (another copy of the app) comes into the caller’s account, and only theirs', function (): void {
    $file = mine('GET', '/api/me/data')['body'];
    $file['users'][0]['id'] = 999999;
    $mine = everything_of(TEST_USER);
    $theirs = everything_of(OTHER);
    $r = as_person(NEWCOMER, 'PUT', '/api/me/data', $file);
    assert_same([200, false], [$r['status'], $r['body']['copy']], 'nothing of theirs to copy');
    assert_same(
        [$mine[0]['items'], $mine[1], array_column($mine[2], 'report')],
        [everything_of(NEWCOMER)[0]['items'], everything_of(NEWCOMER)[1], array_column(everything_of(NEWCOMER)[2], 'report')],
        'the newcomer has what the file held',
    );
    assert_same($mine, everything_of(TEST_USER), 'the person the file came from: untouched');
    assert_same($theirs, everything_of(OTHER));
    assert_same(null, db_value('SELECT id FROM users WHERE id = 999999'), 'and nobody of the file’s id made');
});

test('a file of several people: the caller’s part; when none of them is the caller, 422 several_people and nothing changed', function (): void {
    $everybody = backup_data();
    assert_true(count($everybody['users']) > 2);
    $theirs = everything_of(OTHER);
    $r = as_person(OTHER, 'PUT', '/api/me/data', $everybody);
    assert_same([200, 1], [$r['status'], $r['body']['items']], 'their own part');
    assert_same($theirs, everything_of(OTHER));

    $outsider = as_person(OUTSIDER, 'PUT', '/api/me/data', $everybody);
    assert_refused(422, 'several_people', 'That file holds the data of ' . count($everybody['users']) . ' people, and none of them is you: bring back a file of your own data.', $outsider);
    assert_false(users_has_rows(OUTSIDER), 'nothing of anybody’s came to them');
});

test('not a data file of this app, or a damaged one: 422 not_a_data_file, and nothing changed', function (): void {
    $good = mine('GET', '/api/me/data')['body'];
    $person = $good['users'][0];
    $with = static fn(array $change): string => json_text(['format' => BACKUP_FORMAT, 'version' => BACKUP_VERSION, 'everybody' => false, 'users' => [array_merge($person, $change)]]);
    $without = static fn(array $person): string => json_text(['format' => BACKUP_FORMAT, 'version' => BACKUP_VERSION, 'everybody' => false, 'users' => [$person]]);
    $kanjiWithout = static function (string $part) use ($person, $with): string {
        $kanji = $person['kanji'];
        unset($kanji[$part]);
        return $with(['kanji' => $kanji]);
    };
    $personWithout = static function (string $part) use ($person, $without): string {
        unset($person[$part]);
        return $without($person);
    };
    $attempt = $person['attempts'][0];
    $nested = str_repeat('[', 100) . str_repeat(']', 100);
    $cases = [
        'That is not a Japanese Academy data file: it is empty.' => ['', '   '],
        'That is not a Japanese Academy data file: it is not JSON.' => ['not JSON', '{"format": ', $nested],
        'That is not a Japanese Academy data file.' => ['[]', '"text"', '{"format": "japanese-academy-tables", "version": 2, "users": []}', json_text(['kanji' => $person['kanji']])],
        'That data file is from another version of Japanese Academy (format 1).' => [json_text(['format' => BACKUP_FORMAT, 'version' => 1] + $person)],
        'That data file is from another version of Japanese Academy (format 9).' => [json_text(['format' => BACKUP_FORMAT, 'version' => 9, 'users' => [$person]])],
        'That data file holds nobody\'s data.' => [
            json_text(['format' => BACKUP_FORMAT, 'version' => 2, 'users' => []]),
            json_text(['format' => BACKUP_FORMAT, 'version' => 2, 'users' => ['x', 3]]),
            json_text(['format' => BACKUP_FORMAT, 'version' => 2]),
        ],
        // A person with nothing in the app's shape would replace everything with nothing: {} or a list for kanji, a part missing.
        'That data file is damaged: its kanji progress is not as this app writes it.' => [
            $with(['kanji' => 'all of it']),
            $with(['kanji' => ['items' => 'x']]),
            $with(['kanji' => null]),
            $with(['kanji' => [0]]),
            $with(['kanji' => []]),
            '{"format":"japanese-academy-backup","version":2,"users":[{}]}',
            '{"format":"japanese-academy-backup","version":2,"users":[{"kanji":[0]}]}',
            $personWithout('kanji'),
            $kanjiWithout('version'),
            $kanjiWithout('items'),
            $kanjiWithout('daily'),
            $kanjiWithout('settings'),
            $with(['kanji' => array_merge($person['kanji'], ['version' => 2])]),
            $with(['kanji' => array_merge($person['kanji'], ['items' => ['x', 'y']])]),
        ],
        'That data file is damaged: its answer log is missing or not a list.' => [
            $with(['log' => ['first' => ['t' => 1, 'kind' => 'lesson']]]),
            $with(['log' => 'x']),
            $with(['log' => null]),
            $personWithout('log'),
        ],
        'That data file is damaged: its exam attempts are missing or not a list.' => [$with(['attempts' => 'x']), $with(['attempts' => null]), $personWithout('attempts')],
        'That data file is damaged: an exam attempt is not as this app writes it.' => [
            $with(['attempts' => [['attempt' => array_merge($attempt['attempt'], ['finishedAt' => 'not a time at all']), 'report' => null]]]),
            $with(['attempts' => [['attempt' => array_merge($attempt['attempt'], ['finishedAt' => null]), 'report' => null]]]),
            $with(['attempts' => [['attempt' => $attempt['attempt'], 'report' => ['html']]]]),
            $with(['attempts' => ['x']]),
        ],
    ];
    $mine = everything_of(TEST_USER);
    $copies = import_copies(TEST_USER);
    foreach ($cases as $sentence => $texts) {
        foreach ($texts as $text) {
            assert_refused(422, 'not_a_data_file', $sentence, put_text($text), substr($text, 0, 80));
        }
    }
    assert_same($mine, everything_of(TEST_USER), 'nothing changed');
    assert_same($copies, import_copies(TEST_USER), 'nor any copy taken: refused before');

    // The shape checked is the one the app writes, an empty one too: the file of somebody with nothing yet comes back.
    $empty = as_person(7104, 'GET', '/api/me/data')['body'];
    assert_same([[], [], []], [$empty['users'][0]['kanji']['items'], $empty['users'][0]['log'], $empty['users'][0]['attempts']], 'nothing in it');
    $back = as_person(7104, 'PUT', '/api/me/data', $empty);
    assert_same(200, $back['status'], $back['raw']);
    assert_same(['items' => 0, 'days' => 0, 'log' => 0, 'attempts' => 0, 'reports' => 0], array_diff_key($back['body'], ['copy' => 1]));

    // What only the database can tell: a number it does not take. Refused, rolled back, the copy taken before it stays.
    $daily = $person['kanji']['daily'];
    $daily['2026-01-01'] = ['lessons' => 99999999999];
    $r = put_text($with(['kanji' => array_merge($person['kanji'], ['daily' => $daily])]));
    assert_refused(422, 'not_a_data_file', 'That data file is damaged: the database does not take what it holds.', $r);
    assert_same($mine, everything_of(TEST_USER), 'rolled back: nothing changed');
    assert_same([], server_problems($GLOBALS['app']), 'no PHP warnings or errors on the server');
});

test('the time zone: the one the request names wins; without one, the file’s is kept', function (): void {
    $file = mine('GET', '/api/me/data')['body'];
    $file['users'][0]['timeZone'] = 'Asia/Tokyo';
    assert_same(200, mine('PUT', '/api/me/data', $file)['status']);
    assert_same(HOME_ZONE, db_value('SELECT time_zone FROM users WHERE id = ?', [TEST_USER]), 'the browser’s, which named one');
    assert_same(200, call($GLOBALS['app']['base'], 'PUT', '/api/me/data', $file)['status']);
    assert_same('Asia/Tokyo', db_value('SELECT time_zone FROM users WHERE id = ?', [TEST_USER]), 'no zone named: the file’s');
    $file['users'][0]['timeZone'] = 'Mars/Olympus';
    assert_same(200, call($GLOBALS['app']['base'], 'PUT', '/api/me/data', $file)['status']);
    assert_same('Asia/Tokyo', db_value('SELECT time_zone FROM users WHERE id = ?', [TEST_USER]), 'a zone that is none: passed over');
    mine('GET', '/api/kanji/summary'); // home again
});

/* ---------------------------------------------------------------- the size */

test('how big a file may be: a share of PHP’s memory_limit, never more than 16 MiB; post_max_size does not count', function (): void {
    assert_same(intdiv(128 * 1024 * 1024, IMPORT_MEMORY_SHARE), me_import_limit('128M'));
    assert_same(intdiv(48 * 1024 * 1024, IMPORT_MEMORY_SHARE), me_import_limit('48M'));
    assert_same(intdiv(256 * 1024 * 1024, IMPORT_MEMORY_SHARE), me_import_limit('262144K'));
    assert_same(IMPORT_LIMIT_MAX, me_import_limit('1G'));
    assert_same(IMPORT_LIMIT_MAX, me_import_limit('-1'), 'no limit: the most');
    assert_same(intdiv(100000000, IMPORT_MEMORY_SHARE), me_import_limit('100000000'));
});

test('the page checks a file against the same most before it sends it: its IMPORT_CEILING is IMPORT_LIMIT_MAX', function (): void {
    // A file over it would only be read and refused; one under it may still be over a server's own
    // share of memory_limit, which the page learns from that server's first 413 (home/your-data).
    $page = (string) file_get_contents(ROOT . '/frontend/src/app/home/your-data/your-data.component.ts');
    assert_true(preg_match('/export const IMPORT_CEILING = ([0-9 *]+);/', $page, $m) === 1, 'the page names its ceiling');
    $bytes = array_product(array_map('intval', explode('*', str_replace(' ', '', $m[1]))));
    assert_same(IMPORT_LIMIT_MAX, $bytes);
});

test('a data file read into PHP takes a few times its size: the share of memory_limit leaves room for it, the copy and the request', function (): void {
    $log = [];
    for ($i = 0; $i < 20000; $i++) {
        $log[] = ['t' => 1790000000000 + $i * 1000, 'kind' => 'review', 'id' => 'k:大', 'meaningWrong' => 0, 'readingWrong' => 1, 'from' => 3, 'to' => 4];
    }
    $text = json_text(['format' => BACKUP_FORMAT, 'version' => BACKUP_VERSION, 'users' => [['id' => 1, 'log' => $log]]]);
    unset($log);
    gc_collect_cycles();
    $before = memory_get_usage();
    $data = json_decode($text, true);
    $ratio = (memory_get_usage() - $before) / strlen($text);
    assert_true(count($data['users'][0]['log']) === 20000);
    assert_true($ratio < IMPORT_MEMORY_SHARE / 2.5, sprintf('%.1f times its size, held once; the share is 1/%d of memory_limit', $ratio, IMPORT_MEMORY_SHARE));
});

test('a file over the limit: 413 too_large with the limit, refused before it is read; one just under it comes in, within the memory', function (): void {
    $small = start_app(['ini' => ['memory_limit' => '48M', 'post_max_size' => '1K']]);
    $limit = me_import_limit('48M');
    $mine = everything_of(TEST_USER);

    $file = mine('GET', '/api/me/data')['body'];
    $over = json_text($file + ['padding' => str_repeat('x', $limit)]);
    assert_true(strlen($over) > $limit);
    $r = put_text($over, [], $small);
    assert_same([413, ['error' => "That file is bigger than this server takes ($limit bytes at most).", 'code' => 'too_large', 'limit' => $limit]], [$r['status'], $r['body']]);
    assert_same($mine, everything_of(TEST_USER), 'nothing changed');

    // Just under it, and nearly all of it answer log (the part that takes most memory once read):
    // a body far over post_max_size, which a PUT is not held to.
    $line = ['t' => 1790000000000, 'kind' => 'review', 'id' => 'k:大', 'meaningWrong' => 0, 'readingWrong' => 1, 'from' => 3, 'to' => 4];
    $person = $file['users'][0];
    $base = strlen(json_text($file));
    $person['log'] = array_fill(0, intdiv($limit - $base - 1000, strlen(json_text($line)) + 1), $line);
    $near = json_text(['users' => [$person]] + $file);
    assert_true(strlen($near) <= $limit && strlen($near) > $limit * 0.95, strlen($near) . ' of ' . $limit);
    $r = put_text($near, [], $small);
    assert_same([200, count($person['log'])], [$r['status'], $r['body']['log'] ?? null], json_encode($r['body']));
    assert_same(count($person['log']), count(store_log_all(TEST_USER)));
    // the next import takes a copy of all that, under the same limit
    $r = put_text(json_text($file), [], $small);
    assert_same([200, true], [$r['status'], $r['body']['copy'] ?? null], json_encode($r['body']));
    assert_same($mine, everything_of(TEST_USER), 'and that brought back what was there before');
    assert_same([], server_problems($small), 'no PHP warnings or errors: no memory ran out');
});

/* ------------------------------------------------------- taking turns, alone */

test('an answer that arrives during an import waits for it, then works on what the import brought', function (): void {
    $item = $GLOBALS['items'][0];
    assert_same(409, mine('POST', '/api/kanji/learn', ['id' => $item])['status'], 'learned already, before');
    // Another connection does what an import does: holds the person's row, replaces their data.
    $import = db_connect();
    $import->beginTransaction();
    $import->prepare('SELECT 1 FROM users WHERE id = ? FOR UPDATE')->execute([TEST_USER]);
    $import->prepare('DELETE FROM srs_progress WHERE user_id = ? AND item_id = ?')->execute([TEST_USER, $item]);
    $answer = test_begin($GLOBALS['app']['base'], 'POST', '/api/kanji/learn', ['id' => $item], ['X-Time-Zone: ' . HOME_ZONE]);
    assert_true($answer['waits'](), 'the answer waits for the import');
    $import->commit();
    assert_same(200, $answer['answer']()['status'], 'then works on the imported state, where the item is not learned');
});

test('an import that arrives during an answer waits for it', function (): void {
    $file = mine('GET', '/api/me/data')['body'];
    $answer = db_connect();
    $answer->beginTransaction();
    $answer->prepare('SELECT 1 FROM users WHERE id = ? FOR SHARE')->execute([TEST_USER]);
    $import = test_begin($GLOBALS['app']['base'], 'PUT', '/api/me/data', $file, ['X-Time-Zone: ' . HOME_ZONE]);
    assert_true($import['waits'](), 'the import waits for the answer');
    $answer->commit();
    assert_same(200, $import['answer']()['status']);
});
