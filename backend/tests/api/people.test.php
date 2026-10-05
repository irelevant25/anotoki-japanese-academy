<?php
// The People page's addresses (GET and DELETE /api/admin/people…): the
// administrators alone see who has data here and delete a person's, after a
// copy of it; the editors and everybody else are refused. A delete and a
// request of that person still on its way take turns: neither fails.
declare(strict_types=1);

require __DIR__ . '/../lib.php'; // before the app loads: a throwaway database and backup folder

const BOSS = 8001;     // ADMIN
const EDITOR = 8002;   // EDITOR: rewords strings, sees no people
const LEAVER = 8003;   // a learner whose data an administrator deletes
const STAYER = 8004;   // a learner who stays
const WAITER = 8005;   // a learner whose request is on its way while their data is deleted

$GLOBALS['app'] = null;
before(function (): void {
    $GLOBALS['app'] = start_app();
    $GLOBALS['kanji'] = array_column(db_all("SELECT id FROM srs_items WHERE type = 'kanji' ORDER BY ord LIMIT 6"), 'id');
    [$a, $b, $c] = $GLOBALS['kanji'];
    foreach ([$a, $b] as $id) {
        assert_same(200, person(LEAVER, 'POST', '/api/kanji/learn', ['id' => $id], ['X-Time-Zone: Asia/Tokyo'])['status']);
    }
    person(LEAVER, 'POST', '/api/kanji/settings', ['batchSize' => 9]);
    $paper = person(LEAVER, 'POST', '/api/exam', ['size' => 20, 'seed' => 'leaving'])['body'];
    assert_same(200, person(LEAVER, 'POST', '/api/submit', ['spec' => $paper['spec'], 'responses' => []])['status']);
    assert_same(200, person(STAYER, 'POST', '/api/kanji/learn', ['id' => $c])['status']);
    assert_same(200, person(WAITER, 'POST', '/api/kanji/learn', ['id' => $a])['status']);
    person(EDITOR, 'GET', '/api/kanji/summary');
    person(BOSS, 'GET', '/api/kanji/summary');
    // A string the leaver once reworded, as an editor of before.
    db_exec("INSERT INTO translation_keys (name, description) VALUES ('test.people', 'a test''s own') ON CONFLICT DO NOTHING");
    db_exec("INSERT INTO translations (key_name, language_code, value, updated_by) VALUES ('test.people', 'sk', 'Ľudia', ?)", [LEAVER]);
});

function roles(int $user): array
{
    return $user === BOSS ? ['ADMIN'] : ($user === EDITOR ? ['EDITOR'] : []);
}

function person(int $user, string $method, string $url, $body = null, array $headers = []): array
{
    return call($GLOBALS['app']['base'], $method, $url, $body, array_merge($headers, test_bearer(test_token($user, roles($user), ['preferred_username' => "person-$user"]))));
}

function everything_of(int $uid): array
{
    return [store_export($uid), store_log_all($uid), exam_attempts_all($uid)];
}

function rows_of(int $uid): array
{
    $rows = [];
    foreach (array_merge(USER_TABLES, ['users']) as $table) {
        $rows[$table] = (int) db_value("SELECT count(*) FROM $table WHERE " . ($table === 'users' ? 'id' : 'user_id') . ' = ?', [$uid]);
    }
    return $rows;
}

test('the administrators see everybody the site has data of, the latest seen first, with how much they studied', function (): void {
    db_exec("UPDATE users SET last_seen_at = now() - interval '10 years' WHERE id = ?", [STAYER]);
    $r = person(BOSS, 'GET', '/api/admin/people');
    assert_same(200, $r['status']);
    $people = array_column($r['body']['people'], null, 'id');
    foreach ($r['body']['people'] as $p) {
        assert_same(['id', 'username', 'createdAt', 'lastSeenAt', 'timeZone', 'items', 'attempts'], array_keys($p));
    }
    assert_same(['id' => LEAVER, 'username' => 'person-' . LEAVER, 'timeZone' => 'Asia/Tokyo', 'items' => 2, 'attempts' => 1],
        array_intersect_key($people[LEAVER], array_flip(['id', 'username', 'timeZone', 'items', 'attempts'])));
    assert_same([1, 0, null], [$people[STAYER]['items'], $people[STAYER]['attempts'], $people[STAYER]['timeZone']]);
    $seen = array_column($r['body']['people'], 'lastSeenAt');
    $sorted = $seen;
    rsort($sorted);
    assert_same($sorted, $seen, 'the latest seen first');
    assert_same(STAYER, end($r['body']['people'])['id'], 'the one not seen for ten years, last');
});

test('nobody else sees them, nor deletes anybody: an editor, a learner, somebody signed out', function (): void {
    $before = [rows_of(LEAVER), everything_of(LEAVER)];
    foreach (['GET /api/admin/people', 'DELETE /api/admin/people/' . LEAVER] as $route) {
        [$method, $url] = explode(' ', $route);
        assert_refused(403, 'admin_only', 'This is for the site\'s administrators.', person(EDITOR, $method, $url), "$route, an editor");
        assert_refused(403, 'staff_only', 'This is for the site\'s editors and administrators.', person(STAYER, $method, $url), "$route, a learner");
        assert_refused(403, 'staff_only', 'This is for the site\'s editors and administrators.', person(LEAVER, $method, $url), "$route, the person themselves");
        assert_refused(401, 'sign_in_required', 'Sign in first.', call($GLOBALS['app']['base'], $method, $url, null, no_token()), "$route, signed out");
    }
    assert_same($before, [rows_of(LEAVER), everything_of(LEAVER)], 'nothing deleted');
});

test('deleting a person’s data: a copy of all of it first, then every row of theirs; nobody else’s; the strings they reworded stay', function (): void {
    $leaving = everything_of(LEAVER);
    $staying = [everything_of(STAYER), rows_of(BOSS), rows_of(STAYER)];
    $r = person(BOSS, 'DELETE', '/api/admin/people/' . LEAVER);
    assert_same(200, $r['status'], $r['raw']);
    assert_same(LEAVER, $r['body']['deleted']);
    assert_match('/^academy-before-delete-user-' . LEAVER . '-\d{8}-\d{6}-\d{3}(-\d+)?\.json$/D', $r['body']['copy'], 'named after whose data it holds');

    $copy = backup_read(backup_dir() . '/' . $r['body']['copy']);
    assert_same([false, [LEAVER]], [$copy['everybody'], array_column($copy['users'], 'id')]);
    assert_same($leaving, [$copy['users'][0]['kanji'], $copy['users'][0]['log'], $copy['users'][0]['attempts']], 'all of it, as it was');
    assert_same('Asia/Tokyo', $copy['users'][0]['timeZone']);

    assert_same(array_fill_keys(array_merge(USER_TABLES, ['users']), 0), rows_of(LEAVER), 'every row of theirs gone, their users row too');
    assert_same(['Ľudia', null], array_values(db_one("SELECT value, updated_by FROM translations WHERE key_name = 'test.people'")), 'the string stays, by nobody now');
    assert_same($staying, [everything_of(STAYER), rows_of(BOSS), rows_of(STAYER)], 'nobody else’s touched');
    assert_false(in_array(LEAVER, array_column(person(BOSS, 'GET', '/api/admin/people')['body']['people'], 'id'), true), 'gone from the list');

    // the copy restores them, and them alone
    $counts = backup_restore($copy);
    assert_same(1, $counts['people']);
    assert_same($leaving, everything_of(LEAVER));
    db_exec('DELETE FROM srs_settings WHERE user_id = ?', [LEAVER]);
    foreach (['srs_progress', 'srs_daily', 'srs_log', 'exam_attempts'] as $table) {
        db_exec("DELETE FROM $table WHERE user_id = ?", [LEAVER]);
    }
    db_exec('DELETE FROM users WHERE id = ?', [LEAVER]);
});

test('nobody of that id: 404 not_found, for any address that is no id', function (): void {
    foreach ([(string) LEAVER, '999999', '0', '-1', 'abc', '1e3', str_repeat('9', 20)] as $id) {
        assert_refused(404, 'not_found', 'There is nobody of that id here.', person(BOSS, 'DELETE', "/api/admin/people/$id"), $id);
    }
});

test('the person comes back: signed in still, they start afresh, with nothing', function (): void {
    $r = person(LEAVER, 'GET', '/api/kanji/summary');
    assert_same([200, 0], [$r['status'], $r['body']['learned']]);
    assert_same(1, rows_of(LEAVER)['users'], 'a users row again, as for anybody new');
    assert_same([], person(LEAVER, 'GET', '/api/me/data')['body']['users'][0]['kanji']['items']);
});

test('a delete that arrives while an answer of that person is being saved waits for it, and then deletes that too', function (): void {
    $answer = db_connect();
    $answer->beginTransaction();
    $answer->prepare('SELECT 1 FROM users WHERE id = ? FOR SHARE')->execute([STAYER]);
    $delete = test_begin($GLOBALS['app']['base'], 'DELETE', '/api/admin/people/' . STAYER, null, test_bearer(test_token(BOSS, ['ADMIN'])));
    assert_true($delete['waits'](), 'the delete waits');
    $answer->prepare("INSERT INTO srs_daily (user_id, day, lessons) VALUES (?, '2026-01-01', 1)")->execute([STAYER]);
    $answer->commit();
    assert_same(200, $delete['answer']()['status']);
    assert_same(array_fill_keys(array_merge(USER_TABLES, ['users']), 0), rows_of(STAYER), 'what the answer saved went too');
});

test('an answer of a person whose data is being deleted waits for it, then starts their data afresh: never a failure', function (): void {
    [, , , $d] = $GLOBALS['kanji'];
    // Another connection does what people_delete() does, and does not finish yet.
    $delete = db_connect();
    $delete->beginTransaction();
    $delete->prepare('SELECT 1 FROM users WHERE id = ? FOR UPDATE')->execute([WAITER]);
    foreach (USER_TABLES as $table) {
        $delete->prepare("DELETE FROM $table WHERE user_id = ?")->execute([WAITER]);
    }
    $delete->prepare('DELETE FROM users WHERE id = ?')->execute([WAITER]);
    $answer = test_begin($GLOBALS['app']['base'], 'POST', '/api/kanji/learn', ['id' => $d], test_bearer(test_token(WAITER)));
    assert_true($answer['waits'](), 'the answer waits for the delete');
    $delete->commit();
    $r = $answer['answer']();
    assert_same(200, $r['status'], json_encode($r['body']));
    assert_same([$d], array_column(db_all('SELECT item_id FROM srs_progress WHERE user_id = ?', [WAITER]), 'item_id'), 'their data afresh: this answer alone');
    assert_same(1, rows_of(WAITER)['users']);
    assert_same([], server_problems($GLOBALS['app']), 'no PHP warnings or errors on the server');
});
