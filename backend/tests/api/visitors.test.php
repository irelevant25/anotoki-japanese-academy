<?php
// Visitors (src/visitors.php, learner_middleware() in api/middleware/person.php):
// studying without signing in where the IAM says this site does not require it
// (test_access(false); this file's database has migration 007 from the
// template). Nobody reads as an empty learner; the first save makes a visitor
// within the limits, in that save's own transaction; a key opens that
// visitor's data and nothing else; a token always wins over a key; the caps;
// the move at sign-in and its rules; the sweep after the answer; no visitor in
// a backup or on the People page. Visitor ids are never assumed: they are
// found by the hash of their key.
declare(strict_types=1);

require __DIR__ . '/../lib.php'; // before the app loads: a throwaway database and backup folder

$GLOBALS['app'] = null;
before(function (): void {
    test_access(false);
    $GLOBALS['app'] = start_app();
});

/** Headers of a request without a token, with these added. */
function nobody(array $headers = []): array
{
    return array_merge(no_token(), $headers);
}

/** Headers of a request that is the visitor of $key. */
function as_visitor(string $key, array $headers = []): array
{
    return nobody(array_merge(["X-Visitor-Key: $key"], $headers));
}

/** The visitor of a key, by its hash: their id, or null. */
function visitor_of(string $key): ?int
{
    $id = db_value('SELECT id FROM users WHERE visitor_key_hash = ?', [hash('sha256', $key)]);
    return $id === null ? null : (int) $id;
}

function visitors_here(): int
{
    return (int) db_value('SELECT count(*) FROM users WHERE id < 0');
}

/** A well-formed key nobody has. */
function stray_key(): string
{
    return rtrim(strtr(base64_encode(random_bytes(32)), '+/', '-_'), '=');
}

/** Nobody's first save on $base (a lesson of $item): the new visitor's key. */
function new_visitor(string $base, string $item = 'k:大', array $headers = []): string
{
    $r = call($base, 'POST', '/api/kanji/learn', ['id' => $item], nobody($headers));
    assert_same(200, $r['status'], $r['raw']);
    $key = $r['headers']['x-visitor-key'] ?? '';
    assert_match('/^[A-Za-z0-9_-]{43}$/', $key, 'the new key, in the answer\'s header');
    return $key;
}

/** Every row of this user id, per table of USER_TABLES. */
function rows_of(int $id): array
{
    $out = [];
    foreach (USER_TABLES as $table) {
        $out[$table] = (int) db_value("SELECT count(*) FROM $table WHERE user_id = ?", [$id]);
    }
    return $out;
}

const NO_ROWS = ['srs_settings' => 0, 'srs_progress' => 0, 'srs_daily' => 0, 'srs_log' => 0, 'exam_attempts' => 0, 'imports' => 0];

/** The backup folder's files, by name. */
function backup_files(): array
{
    $files = is_dir(backup_dir()) ? array_values(array_diff(scandir(backup_dir()) ?: [], ['.', '..'])) : [];
    sort($files);
    return $files;
}

/** Waits (up to 5 s) until $done() says so: work done after an answer may finish a moment after it. */
function eventually(callable $done, string $message): void
{
    for ($until = microtime(true) + 5; !$done(); usleep(50000)) {
        if (microtime(true) > $until) {
            fail($message);
        }
    }
}

test('the relay says sign-in is not required here, and how long a visitor\'s data is kept', function (): void {
    $r = call($GLOBALS['app']['base'], 'GET', '/api/auth/config', null, nobody());
    assert_same(['issuer' => 'https://iam.test', 'clientId' => 'japanese-academy', 'loginRequired' => false, 'visitorKeepDays' => 30], $r['body']);
});

test('nobody reads as a learner with no data, and nothing is written: the reads, a paper, the resets', function (): void {
    $base = $GLOBALS['app']['base'];
    $users = (int) db_value('SELECT count(*) FROM users');
    $files = backup_files();
    $p = call($base, 'GET', '/api/kanji/progress', null, nobody());
    assert_same(200, $p['status'], $p['raw']);
    assert_same(0, $p['body']['summary']['learned']);
    assert_match('/"items":\{\}/', $p['raw'], 'no progress');
    assert_same(0, call($base, 'GET', '/api/kanji/summary', null, nobody())['body']['learned']);
    assert_same(200, call($base, 'GET', '/api/kanji/catalog', null, nobody())['status']);
    assert_same(0, call($base, 'GET', '/api/meta', null, nobody())['body']['attempts']);
    assert_same([], call($base, 'GET', '/api/attempts', null, nobody())['body']);
    assert_same(404, call($base, 'GET', '/report/2026-10-05T10-00-00-000Z-x', null, nobody())['status']);
    $paper = call($base, 'POST', '/api/exam', ['size' => 5, 'seed' => 'nobody'], nobody());
    assert_same([200, true], [$paper['status'], count($paper['body']['questions'] ?? []) > 0], 'a paper: it saves nothing');
    $reset = call($base, 'POST', '/api/kanji/reset', ['confirm' => 'RESET'], nobody());
    assert_same([200, ['ok' => true]], [$reset['status'], $reset['body']], 'nothing to reset');
    $item = call($base, 'POST', '/api/kanji/reset-item', ['id' => 'k:大'], nobody());
    assert_same([200, srs_blank()], [$item['status'], $item['body']['state']]);
    assert_same(404, call($base, 'POST', '/api/kanji/reset-item', ['id' => 'k:nope'], nobody())['status'], 'an item that is none, still');
    foreach ([$p, $paper, $reset, $item] as $r) {
        assert_same(null, $r['headers']['x-visitor-key'] ?? null, 'no key handed out');
    }
    assert_same($users, (int) db_value('SELECT count(*) FROM users'), 'nobody was made');
    assert_same($files, backup_files(), 'no copy taken for nobody\'s reset');
    assert_same([], server_problems($GLOBALS['app']));
});

test('the first save makes a visitor: the key in a header of a no-store answer, its data its own, another key or none sees nothing', function (): void {
    $base = $GLOBALS['app']['base'];
    $before = visitors_here();
    $r = call($base, 'POST', '/api/kanji/learn', ['id' => 'k:大'], nobody(['X-Time-Zone: Asia/Tokyo']));
    assert_same(200, $r['status'], $r['raw']);
    $key = $r['headers']['x-visitor-key'] ?? '';
    assert_match('/^[A-Za-z0-9_-]{43}$/', $key);
    assert_same('no-store', $r['headers']['cache-control'] ?? null);
    assert_false(str_contains($r['raw'], $key), 'the key is not in the body');
    assert_same($before + 1, visitors_here(), 'one visitor');
    $id = visitor_of($key);
    assert_true($id !== null && $id < 0, 'a negative id');
    $row = db_one('SELECT visitor_from, time_zone, preferred_username FROM users WHERE id = ?', [$id]);
    assert_match('/^[0-9a-f]{64}$/', (string) $row['visitor_from'], 'the address as a keyed hash');
    assert_false(hash('sha256', '127.0.0.1') === $row['visitor_from'], 'not a plain hash of it');
    assert_same(['Asia/Tokyo', null], [$row['time_zone'], $row['preferred_username']], 'the zone the browser named; no name');
    assert_same(['srs_settings' => 1, 'srs_progress' => 1, 'srs_daily' => 1, 'srs_log' => 1, 'exam_attempts' => 0, 'imports' => 0], rows_of($id),
        'the lesson, its day, its line of the log, and the settings row that says when their progress began');

    $mine = call($base, 'GET', '/api/kanji/progress', null, as_visitor($key));
    assert_same(1, $mine['body']['items']['k:大']['stage'] ?? null, 'the key opens its data');
    assert_same(null, $mine['headers']['x-visitor-key'] ?? null, 'and hands out no key again');
    $again = call($base, 'POST', '/api/kanji/learn', ['id' => 'k:学'], as_visitor($key));
    assert_same([200, null], [$again['status'], $again['headers']['x-visitor-key'] ?? null], 'a visitor\'s save makes nobody new');
    assert_same($before + 1, visitors_here());

    assert_same(0, call($base, 'GET', '/api/kanji/progress', null, nobody())['body']['summary']['learned'], 'nobody sees nothing of it');
    assert_same(0, call($base, 'GET', '/api/kanji/progress')['body']['summary']['learned'], 'nor a person');
    assert_same(0, call($base, 'GET', '/api/kanji/progress', null, array_merge(test_bearer(test_token(TEST_USER)), ["X-Visitor-Key: $key"]))['body']['summary']['learned'],
        'a person sending the key: the person, the key ignored');
    foreach (['a key nobody has' => stray_key(), 'not a key' => 'abc', 'a key with a character too many' => $key . 'x'] as $what => $other) {
        assert_refused(401, 'visitor_unknown', 'This browser\'s study without signing in has ended: it was deleted after a long time unused, or moved into an account.',
            call($base, 'GET', '/api/kanji/progress', null, as_visitor($other)), $what);
    }
    assert_same([], server_problems($GLOBALS['app']));
});

test('a first save that is refused or fails makes nobody and counts nothing', function (): void {
    $base = $GLOBALS['app']['base'];
    $before = visitors_here();
    for ($i = 0; $i < 12; $i++) {
        $r = call($base, 'POST', '/api/kanji/learn', ['id' => 'k:nope'], nobody());
        assert_same([404, null], [$r['status'], $r['headers']['x-visitor-key'] ?? null], "a lesson of no item ($i)");
    }
    $r = call($base, 'POST', '/api/kanji/learn', ['id' => 'v:大学'], nobody());
    assert_same([409, 'kanji_first', null], [$r['status'], $r['body']['code'] ?? null, $r['headers']['x-visitor-key'] ?? null], 'refused: its kanji first');
    $r = call($base, 'POST', '/api/submit', ['responses' => new stdClass()], nobody());
    assert_same([400, null], [$r['status'], $r['headers']['x-visitor-key'] ?? null], 'an exam without its paper\'s seed');
    assert_same($before, visitors_here(), 'nobody made');
    new_visitor($base, 'k:一');
    assert_same($before + 1, visitors_here(), 'thirteen refused saves from this address, and a new visitor is still welcome (10 an hour)');
});

test('limits: per address (IPv6 by its /64, a trusted proxy\'s header, never X-Forwarded-For alone), per hour, at once; a visitor already here keeps working', function (): void {
    db_exec("UPDATE users SET created_at = now() - interval '2 hours' WHERE id < 0"); // what earlier tests made counts no more this hour
    $proxy = ['client_address' => ['trusted_proxies' => ['127.0.0.1', '::1']]];
    $app = start_app(['app' => $proxy + ['visitors' => ['new_per_hour_per_address' => 2, 'new_per_hour' => 100, 'max' => 100]]]);
    $base = $app['base'];
    $tooMany = static function (array $headers, string $what) use ($base): void {
        $r = call($base, 'POST', '/api/kanji/learn', ['id' => 'k:大'], nobody($headers));
        assert_refused(429, 'too_many_visitors', 'Too many people are using the site without signing in just now. Sign in to continue, or try again later.', $r, $what);
        assert_same(['3600', null], [$r['headers']['retry-after'] ?? null, $r['headers']['x-visitor-key'] ?? null], $what);
    };
    $first = new_visitor($base, 'k:大', ['CF-Connecting-IP: 198.51.100.7']);
    new_visitor($base, 'k:大', ['CF-Connecting-IP: 198.51.100.7']);
    $tooMany(['CF-Connecting-IP: 198.51.100.7'], 'a third from one address within the hour');
    $tooMany(['CF-Connecting-IP: ::ffff:198.51.100.7'], 'the same address written as IPv6');
    assert_same(200, call($base, 'POST', '/api/kanji/learn', ['id' => 'k:学'], as_visitor($first, ['CF-Connecting-IP: 198.51.100.7']))['status'],
        'a visitor made before goes on studying');
    new_visitor($base, 'k:大', ['CF-Connecting-IP: 2001:db8:1:2::1']);
    new_visitor($base, 'k:大', ['CF-Connecting-IP: 2001:db8:1:2:ffff:ffff:ffff:ffff']);
    $tooMany(['CF-Connecting-IP: 2001:db8:1:2::abcd'], 'one IPv6 /64 is one address');
    new_visitor($base, 'k:大', ['CF-Connecting-IP: 2001:db8:1:3::1']);
    new_visitor($base, 'k:大', ['X-Forwarded-For: 203.0.113.1']);
    new_visitor($base, 'k:大', ['X-Forwarded-For: 203.0.113.2']);
    $tooMany(['X-Forwarded-For: 203.0.113.3'], 'X-Forwarded-For is not the header this site trusts: all three are the proxy\'s own address');

    // A server of its own has a secret of its own (its own cache folder): its counts start afresh.
    $untrusted = start_app(['app' => ['visitors' => ['new_per_hour_per_address' => 2, 'new_per_hour' => 100, 'max' => 100]]]);
    new_visitor($untrusted['base'], 'k:大', ['CF-Connecting-IP: 198.51.100.97']);
    new_visitor($untrusted['base'], 'k:大', ['CF-Connecting-IP: 198.51.100.98']);
    $r = call($untrusted['base'], 'POST', '/api/kanji/learn', ['id' => 'k:大'], nobody(['CF-Connecting-IP: 198.51.100.99']));
    assert_same([429, 'too_many_visitors'], [$r['status'], $r['body']['code'] ?? null], 'without a trusted proxy the header counts for nothing: all three are 127.0.0.1');

    db_exec("UPDATE users SET created_at = now() - interval '2 hours' WHERE id < 0");
    $hour = start_app(['app' => $proxy + ['visitors' => ['new_per_hour_per_address' => 100, 'new_per_hour' => 2, 'max' => 100]]]);
    new_visitor($hour['base'], 'k:大', ['CF-Connecting-IP: 198.51.100.21']);
    new_visitor($hour['base'], 'k:大', ['CF-Connecting-IP: 198.51.100.22']);
    $r = call($hour['base'], 'POST', '/api/kanji/learn', ['id' => 'k:大'], nobody(['CF-Connecting-IP: 198.51.100.23']));
    assert_same([429, 'too_many_visitors'], [$r['status'], $r['body']['code'] ?? null], 'new visitors an hour, from everywhere');

    db_exec("UPDATE users SET created_at = now() - interval '2 hours' WHERE id < 0");
    $now = visitors_here();
    $full = start_app(['app' => $proxy + ['visitors' => ['max' => $now + 1]]]);
    $last = new_visitor($full['base'], 'k:大', ['CF-Connecting-IP: 198.51.100.31']);
    $r = call($full['base'], 'POST', '/api/kanji/learn', ['id' => 'k:大'], nobody(['CF-Connecting-IP: 198.51.100.32']));
    assert_same([429, 'too_many_visitors'], [$r['status'], $r['body']['code'] ?? null], 'visitors at once: full');
    assert_same(200, call($full['base'], 'POST', '/api/kanji/learn', ['id' => 'k:学'], as_visitor($last))['status'], 'full refuses new visitors only');
    assert_same(200, call($full['base'], 'POST', '/api/kanji/learn', ['id' => 'k:学'])['status'], 'and never a person');
    foreach ([$app, $untrusted, $hour, $full] as $server) {
        assert_same([], server_problems($server));
    }
});

test('a visitor\'s caps: answers kept, exam attempts - told before a paper starts; a person has none', function (): void {
    $app = start_app(['app' => ['visitors' => ['max_answers' => 2, 'max_attempts' => 1]]]);
    $base = $app['base'];
    $key = new_visitor($base, 'k:大');
    assert_same(200, call($base, 'POST', '/api/kanji/learn', ['id' => 'k:学'], as_visitor($key))['status'], 'the second answer');
    $answers = static fn (array $r, string $what) => assert_refused(422, 'visitor_limit', 'Without signing in, this browser keeps at most 2 answers. Sign in to go on.', $r, $what);
    $r = call($base, 'POST', '/api/kanji/learn', ['id' => 'k:一'], as_visitor($key));
    $answers($r, 'a third answer');
    assert_same(['answers', 2], [$r['body']['limit'] ?? null, $r['body']['max'] ?? null], 'the limit and its number, for the page');
    $answers(call($base, 'POST', '/api/kanji/reset-item', ['id' => 'k:大'], as_visitor($key)), 'a reset writes a line of the log too');
    assert_same(200, call($base, 'POST', '/api/kanji/settings', ['batchSize' => 3], as_visitor($key))['status'], 'the settings grow nothing');
    assert_same(2, (int) db_value('SELECT count(*) FROM srs_log WHERE user_id = ?', [visitor_of($key)]));

    $paper = call($base, 'POST', '/api/exam', ['size' => 5, 'seed' => 'cap'], as_visitor($key))['body'];
    $first = call($base, 'POST', '/api/submit', ['spec' => $paper['spec'], 'responses' => new stdClass()], as_visitor($key));
    assert_same(200, $first['status'], $first['raw']);
    $attempts = 'Without signing in, this browser keeps at most 1 exam attempts. Sign in to keep more.';
    $r = call($base, 'POST', '/api/exam', ['size' => 5, 'seed' => 'cap-2'], as_visitor($key));
    assert_refused(422, 'visitor_limit', $attempts, $r, 'no paper at the cap: nothing answered in vain');
    assert_same(['attempts', 1], [$r['body']['limit'] ?? null, $r['body']['max'] ?? null]);
    assert_refused(422, 'visitor_limit', $attempts, call($base, 'POST', '/api/submit', ['spec' => $paper['spec'], 'responses' => new stdClass()], as_visitor($key)), 'nor a submit');

    $made = call($base, 'POST', '/api/submit', ['spec' => $paper['spec'], 'responses' => new stdClass()], nobody());
    assert_same(200, $made['status'], 'nobody\'s submitted exam makes a visitor');
    assert_match('/^[A-Za-z0-9_-]{43}$/', $made['headers']['x-visitor-key'] ?? '');
    $person = test_bearer(test_token(711));
    foreach (['k:大', 'k:学', 'k:一'] as $item) {
        assert_same(200, call($base, 'POST', '/api/kanji/learn', ['id' => $item], $person)['status'], "a person: $item");
    }
    for ($i = 0; $i < 2; $i++) {
        assert_same(200, call($base, 'POST', '/api/submit', ['spec' => $paper['spec'], 'responses' => new stdClass()], $person)['status']);
    }
    assert_same(200, call($base, 'POST', '/api/exam', ['size' => 5, 'seed' => 'cap-3'], $person)['status'], 'a person has no caps');
    assert_same([], server_problems($app));
});

test('a token always wins over a key: a bad one is a 401, and the visitor is not even looked at; Basic is no token', function (): void {
    $base = $GLOBALS['app']['base'];
    $key = new_visitor($base, 'k:大');
    $id = visitor_of($key);
    db_exec("UPDATE users SET last_seen_at = now() - interval '1 day' WHERE id = ?", [$id]);
    $seen = db_value('SELECT last_seen_at FROM users WHERE id = ?', [$id]);
    $rows = rows_of($id);
    foreach ([
        'an expired token' => 'Authorization: Bearer ' . test_token(TEST_USER, [], ['exp' => time() - 3600]),
        'another site\'s token' => 'Authorization: Bearer ' . test_token(TEST_USER, [], ['aud' => 'genshin']),
        'a token that is none' => 'Authorization: Bearer x',
        'Bearer and nothing after it' => 'Authorization: Bearer',
    ] as $what => $authorization) {
        foreach ([['GET', '/api/kanji/progress', null], ['POST', '/api/kanji/learn', ['id' => 'k:学']]] as [$method, $url, $body]) {
            $r = call($base, $method, $url, $body, [$authorization, "X-Visitor-Key: $key"]);
            assert_same([401, 'invalid_token'], [$r['status'], $r['body']['code'] ?? null], "$what, $method $url");
        }
    }
    assert_same($rows, rows_of($id), 'nothing written for the visitor');
    assert_same($seen, db_value('SELECT last_seen_at FROM users WHERE id = ?', [$id]), 'not even seen');
    $basic = call($base, 'GET', '/api/kanji/progress', null, ['Authorization: Basic ' . base64_encode('host:password'), "X-Visitor-Key: $key"]);
    assert_same([200, 1], [$basic['status'], $basic['body']['summary']['learned'] ?? null], 'a host\'s password (Basic) says nothing of who studies: the visitor');
    assert_true(db_value('SELECT last_seen_at FROM users WHERE id = ?', [$id]) !== $seen, 'seen now');
});

test('sign-in required: a key is 401 sign_in_required and is not even looked at, nobody is 401, the visitor waits; switched off again, it works', function (): void {
    $base = $GLOBALS['app']['base'];
    $key = new_visitor($base, 'k:大');
    $id = visitor_of($key);
    db_exec("UPDATE users SET last_seen_at = now() - interval '1 day' WHERE id = ?", [$id]);
    $seen = db_value('SELECT last_seen_at FROM users WHERE id = ?', [$id]);
    test_access(true);
    try {
        foreach ([as_visitor($key), as_visitor(stray_key()), nobody()] as $i => $headers) {
            assert_refused(401, 'sign_in_required', 'Sign in first.', call($base, 'GET', '/api/kanji/progress', null, $headers), "GET ($i)");
            assert_refused(401, 'sign_in_required', 'Sign in first.', call($base, 'POST', '/api/kanji/learn', ['id' => 'k:学'], $headers), "a save ($i)");
        }
        assert_same($seen, db_value('SELECT last_seen_at FROM users WHERE id = ?', [$id]), 'not seen');
        assert_same(200, call($base, 'GET', '/api/kanji/progress')['status'], 'a person, as ever');
        assert_same(true, call($base, 'GET', '/api/auth/config', null, nobody())['body']['loginRequired'] ?? null, 'the relay says so');
    } finally {
        test_access(false);
    }
    assert_same(1, call($base, 'GET', '/api/kanji/progress', null, as_visitor($key))['body']['summary']['learned'] ?? null, 'off again: the visitor\'s data is there');
});

test('a key opens nothing that needs a signed-in person: a data file, the admin panel, the Migrations page', function (): void {
    $base = $GLOBALS['app']['base'];
    $key = new_visitor($base, 'k:大');
    foreach ([['GET', '/api/me/data'], ['PUT', '/api/me/data'], ['GET', '/api/admin/people'], ['GET', '/api/admin/visitors'],
        ['GET', '/api/admin/translations'], ['GET', '/api/admin/migrations'], ['POST', '/api/admin/migrations/apply'], ['POST', '/api/visitor/move']] as [$method, $url]) {
        $r = call($base, $method, $url, $method === 'GET' ? null : new stdClass(), as_visitor($key));
        assert_same([401, 'sign_in_required'], [$r['status'], $r['body']['code'] ?? null], "$method $url");
    }
});

test('a visitor\'s own resets: their progress goes, no copy is taken - a visitor has no data file', function (): void {
    $base = $GLOBALS['app']['base'];
    $key = new_visitor($base, 'k:大');
    $id = visitor_of($key);
    assert_same(200, call($base, 'POST', '/api/kanji/learn', ['id' => 'k:学'], as_visitor($key))['status']);
    $files = backup_files();
    $item = call($base, 'POST', '/api/kanji/reset-item', ['id' => 'k:大'], as_visitor($key));
    assert_same([200, 0], [$item['status'], $item['body']['state']['stage'] ?? null], $item['raw']);
    $all = call($base, 'POST', '/api/kanji/reset', ['confirm' => 'RESET'], as_visitor($key));
    assert_same([200, ['ok' => true]], [$all['status'], $all['body']], $all['raw']);
    assert_same(0, rows_of($id)['srs_progress'], 'their progress went');
    assert_same(['lesson', 'lesson', 'reset-item', 'reset'], array_column(db_all('SELECT kind FROM srs_log WHERE user_id = ? ORDER BY id', [$id]), 'kind'), 'the log stays, with the resets');
    assert_same($files, backup_files(), 'no copy');
    assert_same([], preg_grep('/user--/', backup_files()), 'no file names a visitor');
    assert_same([], server_problems($GLOBALS['app']));
});

test('the move at sign-in: the person keeps what both have, the rest becomes theirs; a copy of theirs first; the key opens nothing after', function (): void {
    $base = $GLOBALS['app']['base'];
    $person = 701;
    $token = test_bearer(test_token($person));
    $key = new_visitor($base, 'k:大', ['X-Time-Zone: Asia/Tokyo']);
    $v = visitor_of($key);
    assert_same(200, call($base, 'POST', '/api/kanji/learn', ['id' => 'k:学'], as_visitor($key))['status']);
    assert_same(200, call($base, 'POST', '/api/kanji/settings', ['batchSize' => 7], as_visitor($key))['status']);
    // the person's own: k:大 further on, a day and an attempt id the visitor has too
    assert_same(200, call($base, 'POST', '/api/kanji/learn', ['id' => 'k:大'], $token)['status']);
    db_exec('UPDATE srs_progress SET stage = 5 WHERE user_id = ? AND item_id = ?', [$person, 'k:大']);
    db_exec('DELETE FROM srs_daily WHERE user_id IN (?, ?)', [$person, $v]);
    db_exec("INSERT INTO srs_daily (user_id, day, lessons, reviews, reviews_correct) VALUES (?, '2026-10-01', 2, 4, 3), (?, '2026-10-01', 3, 1, 1), (?, '2026-10-02', 1, 0, 0)", [$person, $v, $v]);
    db_exec("INSERT INTO srs_log (user_id, at, kind, item_id) VALUES (?, now(), 'reset-item', 'k:大'), (?, now(), 'reset-item', 'k:学'), (?, now(), 'reset', NULL)", [$v, $v, $v]);
    $attempt = static function (int $uid, string $id, int $right): void {
        db_exec("INSERT INTO exam_attempts (user_id, id, finished_at, seed, total, right_count, pct, grade, passed, attempt, report)
                 VALUES (?, ?, now(), 'seed', 5, ?, 0, 'F', false, ?, '<p>report</p>')", [$uid, $id, $right, json_text(['id' => $id])]);
    };
    $attempt($person, 'both', 5);
    $attempt($v, 'both', 1);
    $attempt($v, 'visitors', 2);
    db_exec('UPDATE users SET time_zone = NULL WHERE id = ?', [$person]);
    db_exec('DELETE FROM srs_settings WHERE user_id = ?', [$person]); // no settings of their own (their lesson made the row)
    $files = backup_files();

    $r = call($base, 'POST', '/api/visitor/move', null, array_merge($token, ["X-Visitor-Key: $key"]));
    assert_same(200, $r['status'], $r['raw']);
    assert_same(['found' => true, 'items' => 1, 'kept' => 1, 'attempts' => 1, 'answers' => 3], $r['body'],
        'k:学 moved, k:大 kept; the visitor\'s attempt of its own; two lessons and the reset of an item the person did not keep');
    assert_same(NO_ROWS, rows_of($v), 'nothing of the visitor\'s left');
    assert_same(null, db_value('SELECT id FROM users WHERE id = ?', [$v]), 'the visitor is gone');
    assert_same(['k:大' => 5, 'k:学' => 1], array_map('intval', array_column(db_all('SELECT item_id, stage FROM srs_progress WHERE user_id = ? ORDER BY item_id', [$person]), 'stage', 'item_id')),
        'their own k:大 as it was; k:学 is theirs');
    assert_same([['day' => '2026-10-01', 'lessons' => 5, 'reviews' => 5, 'reviews_correct' => 4], ['day' => '2026-10-02', 'lessons' => 1, 'reviews' => 0, 'reviews_correct' => 0]],
        array_map(static fn (array $d): array => ['day' => $d['day'], 'lessons' => (int) $d['lessons'], 'reviews' => (int) $d['reviews'], 'reviews_correct' => (int) $d['reviews_correct']],
            db_all('SELECT day::text AS day, lessons, reviews, reviews_correct FROM srs_daily WHERE user_id = ? ORDER BY day', [$person])),
        'a day both have: added; the other moved');
    assert_same([['lesson', 'k:大'], ['lesson', 'k:学'], ['lesson', 'k:大'], ['reset-item', 'k:学']],
        array_map(static fn (array $l): array => [$l['kind'], $l['item_id']], db_all('SELECT kind, item_id FROM srs_log WHERE user_id = ? ORDER BY id', [$person])),
        'every answer, in the order given; not the visitor\'s full reset, nor its reset of k:大, which the person kept');
    assert_same(['both' => 5, 'visitors' => 2], array_map('intval', array_column(db_all('SELECT id, right_count FROM exam_attempts WHERE user_id = ? ORDER BY id', [$person]), 'right_count', 'id')),
        'an attempt id both have: the person\'s');
    assert_same(7, store_settings($person)['batchSize'], 'they had no settings: the visitor\'s');
    assert_same('Asia/Tokyo', db_value('SELECT time_zone FROM users WHERE id = ?', [$person]), 'they had no zone: the visitor\'s');
    $copies = array_values(array_diff(backup_files(), $files));
    assert_same(1, count($copies), 'one copy');
    assert_match("/^academy-before-move-user-$person-.+\\.json$/", $copies[0], 'of the person\'s data, as it was');
    assert_same(1, count(backup_read(backup_dir() . '/' . $copies[0])['users'][0]['kanji']['items']), 'before the move: k:大 alone');

    assert_refused(401, 'visitor_unknown', 'This browser\'s study without signing in has ended: it was deleted after a long time unused, or moved into an account.',
        call($base, 'GET', '/api/kanji/progress', null, as_visitor($key)), 'the key opens nothing now');
    $again = call($base, 'POST', '/api/visitor/move', null, array_merge($token, ["X-Visitor-Key: $key"]));
    assert_same([200, ['found' => false, 'items' => 0, 'kept' => 0, 'attempts' => 0, 'answers' => 0]], [$again['status'], $again['body']], 'asked again (another tab): nothing to move, no error');
    assert_same(1, count(array_diff(backup_files(), $files)), 'and no copy for it');
    foreach (['no key' => [], 'not a key' => ['X-Visitor-Key: abc']] as $what => $headers) {
        assert_refused(422, 'bad_visitor_key', 'Send the visitor\'s key in the X-Visitor-Key header.', call($base, 'POST', '/api/visitor/move', null, array_merge($token, $headers)), $what);
    }
    assert_same([], server_problems($GLOBALS['app']));
});

test('the move works whatever the switch, takes no copy of a person with no data, and an emptied visitor moves nothing but goes', function (): void {
    $base = $GLOBALS['app']['base'];
    $person = 702;
    $key = new_visitor($base, 'k:大');
    $files = backup_files();
    test_access(true);
    try {
        $r = call($base, 'POST', '/api/visitor/move', null, [...test_bearer(test_token($person)), "X-Visitor-Key: $key"]);
    } finally {
        test_access(false);
    }
    assert_same([200, true, 1], [$r['status'], $r['body']['found'] ?? null, $r['body']['items'] ?? null], 'sign-in required: the key is still handed in with a token');
    assert_same($files, backup_files(), 'nothing of theirs to copy');
    assert_same(1, (int) db_value('SELECT count(*) FROM srs_progress WHERE user_id = ?', [$person]));
});

test('the move waits for a save of the person\'s, and says "try again" when a row stays held', function (): void {
    $person = 703;
    $token = test_bearer(test_token($person));
    $app = start_app(['app' => ['visitors' => ['move_lock_timeout_ms' => 300]]]);
    $base = $app['base'];
    assert_same(200, call($base, 'POST', '/api/kanji/learn', ['id' => 'k:一'], $token)['status']);
    $key = new_visitor($base, 'k:大');

    // Somebody holds the visitor's row past the move's patience: 503, ask again; nothing moved.
    db()->beginTransaction();
    db_value('SELECT 1 FROM users WHERE id = ? FOR UPDATE', [visitor_of($key)]);
    $r = call($base, 'POST', '/api/visitor/move', null, array_merge($token, ["X-Visitor-Key: $key"]));
    db()->rollBack();
    assert_refused(503, 'visitor_move_retry', 'Moving what this browser studied into your account did not finish. Try again in a moment.', $r);
    assert_same('2', $r['headers']['retry-after'] ?? null);
    assert_same(1, rows_of((int) visitor_of($key))['srs_progress'], 'nothing moved');

    // The person's row held a moment (an import of theirs, a save): the move waits, then goes through.
    $slow = start_app();
    db()->beginTransaction();
    db_value('SELECT 1 FROM users WHERE id = ? FOR UPDATE', [$person]);
    $move = test_begin($slow['base'], 'POST', '/api/visitor/move', null, array_merge($token, ["X-Visitor-Key: $key"]));
    $waited = $move['waits']();
    db()->commit();
    assert_true($waited, 'it waits for the row');
    $answer = $move['answer']();
    assert_same([200, true], [$answer['status'], $answer['body']['found'] ?? null], json_text($answer));
    assert_same(2, (int) db_value('SELECT count(*) FROM srs_progress WHERE user_id = ?', [$person]));
    assert_same([], server_problems($app));
    assert_same([], server_problems($slow));
});

test('the sweep, after an answer: a visitor unseen for 30 days goes with all of theirs; a recent one and the people stay; a failure costs no answer', function (): void {
    $app = start_app(['app' => ['visitors' => ['sweep_every_seconds' => 0, 'sweep_timeout_ms' => 300]]]);
    $base = $app['base'];
    $old = visitor_of(new_visitor($base, 'k:大'));
    $recent = visitor_of(new_visitor($base, 'k:大'));
    assert_same(200, call($base, 'POST', '/api/kanji/learn', ['id' => 'k:大'], test_bearer(test_token(704)))['status']);
    db_exec("UPDATE users SET last_seen_at = now() - interval '31 days' WHERE id IN (?, 704)", [$old]);
    db_exec("UPDATE users SET last_seen_at = now() - interval '29 days' WHERE id = ?", [$recent]);

    // A row of the old visitor held by somebody: the sweep's statement times out - logged, the answer as ever.
    db()->beginTransaction();
    db_value('SELECT 1 FROM srs_progress WHERE user_id = ? FOR UPDATE', [$old]);
    $r = call($base, 'GET', '/api/kanji/summary');
    assert_same(200, $r['status'], 'the answer');
    eventually(static fn (): bool => str_contains((string) file_get_contents($app['log']), '[visitors] the sweep stopped'), 'the failed sweep is logged');
    db()->rollBack();
    assert_true(visitor_of_id($old), 'the old visitor is still there');

    assert_same(200, call($base, 'GET', '/api/kanji/summary')['status']);
    eventually(static fn (): bool => !visitor_of_id($old), 'the old visitor went');
    assert_same(NO_ROWS, rows_of($old), 'with every row of theirs');
    assert_true(visitor_of_id($recent), 'the recent one stays');
    assert_true(visitor_of_id(704), 'a person unseen for as long is never swept');
    assert_match('/\[visitors\] unseen for 30 days, deleted: 1/', (string) file_get_contents($app['log']));
    assert_same([], server_problems($app));

    // At most once an hour (the default): the stamp in the app's cache folder.
    $hourly = start_app();
    assert_same(200, call($hourly['base'], 'GET', '/api/kanji/summary')['status']);
    eventually(static fn (): bool => is_file($hourly['config'] . '/cache/visitors-swept'), 'the sweep\'s stamp');
    db_exec("UPDATE users SET last_seen_at = now() - interval '31 days' WHERE id = ?", [$recent]);
    assert_same(200, call($hourly['base'], 'GET', '/api/kanji/summary')['status']);
    usleep(500000);
    assert_true(visitor_of_id($recent), 'swept a moment ago: not again within the hour');
});

/** Is there a users row of this id? */
function visitor_of_id(int $id): bool
{
    return db_value('SELECT 1 FROM users WHERE id = ?', [$id]) !== null;
}

test('no visitor on the People page, in a backup or in the day\'s copy; the admin panel counts them; a restore of everybody removes them', function (): void {
    $base = $GLOBALS['app']['base'];
    $key = new_visitor($base, 'k:大');
    $admin = test_bearer(test_token(705, ['ADMIN']));
    $people = call($base, 'GET', '/api/admin/people', null, $admin)['body']['people'];
    assert_same([], array_values(array_filter(array_column($people, 'id'), static fn (int $id): bool => $id < 1)), 'people only');
    $count = call($base, 'GET', '/api/admin/visitors', null, $admin);
    assert_same(200, $count['status']);
    assert_same([true, visitors_here(), 30, 300], [$count['body']['ready'], $count['body']['count'], $count['body']['keepDays'], $count['body']['max']]);
    assert_true(is_int($count['body']['oldestSeenAt']));
    assert_same(403, call($base, 'GET', '/api/admin/visitors', null, test_bearer(test_token(706, ['EDITOR'])))['status'], 'administrators only');

    $data = backup_data();
    assert_same([], array_values(array_filter(array_column($data['users'], 'id'), static fn (int $id): bool => $id < 1)), 'a backup holds people only');
    db_tx(static function (): void {
        foreach (USER_TABLES as $table) {
            db_exec("DELETE FROM $table WHERE user_id > 0");
        }
    });
    assert_false(learner_has_data(), 'only visitors have data: no day\'s copy of nobody');
    assert_true(visitors_here() > 0);
    backup_restore(['format' => BACKUP_FORMAT, 'version' => BACKUP_VERSION, 'everybody' => true, 'users' => [['id' => 707, 'kanji' => ['items' => new stdClass()], 'log' => [], 'attempts' => []]]]);
    assert_same(0, visitors_here(), 'a restore of everybody leaves no visitor');
    assert_same(0, (int) db_value('SELECT count(*) FROM srs_progress WHERE user_id < 0'));
    assert_refused(401, 'visitor_unknown', 'This browser\'s study without signing in has ended: it was deleted after a long time unused, or moved into an account.',
        call($base, 'GET', '/api/kanji/progress', null, as_visitor($key)));
});

test('in this process: a row that went is never made again for a visitor; the address counted, behind a trusted proxy or not', function (): void {
    assert_throws(static fn () => db_tx(static fn () => users_hold(-424242)), '/study without signing in has ended/');
    assert_throws(static fn () => users_ensure(-1), '/Not a user id/');
    assert_throws(static fn () => backup_person_copy('before-move', -1), '/no person/');
    try {
        config_overrides(['app' => ['client_address' => ['trusted_proxies' => ['10.0.0.0/8', '2001:db8::/32']]]]);
        assert_same('198.51.100.7', client_address(['REMOTE_ADDR' => '10.1.2.3', 'HTTP_CF_CONNECTING_IP' => '198.51.100.7']), 'a trusted proxy\'s header');
        assert_same('192.0.2.1', client_address(['REMOTE_ADDR' => '192.0.2.1', 'HTTP_CF_CONNECTING_IP' => '198.51.100.7']), 'anybody else\'s header counts for nothing');
        assert_same('10.1.2.3', client_address(['REMOTE_ADDR' => '10.1.2.3', 'HTTP_X_FORWARDED_FOR' => '198.51.100.7']), 'X-Forwarded-For is not the header');
        assert_same('10.1.2.3', client_address(['REMOTE_ADDR' => '10.1.2.3', 'HTTP_CF_CONNECTING_IP' => 'not an address']), 'nor what is no address');
        assert_same('?', client_address([]));
        config_overrides(['app' => ['client_address' => ['trusted_proxies' => ['10.0.0.0/8'], 'client_ip_header' => 'X-Forwarded-For']]]);
        assert_same('198.51.100.9', client_address(['REMOTE_ADDR' => '10.0.0.1', 'HTTP_X_FORWARDED_FOR' => '6.6.6.6, 198.51.100.9, 10.0.0.2']), 'a list from the right, past the proxies');
    } finally {
        config_overrides([]);
    }
    assert_same('198.51.100.7', client_address_bucket('::ffff:198.51.100.7'));
    assert_same('2001:db8:1:2::/64', client_address_bucket('2001:db8:1:2:aaaa:bbbb:cccc:dddd'));
    assert_same('192.0.2.1', client_address_bucket('192.0.2.1'));
    assert_true(client_address_in_ranges('172.16.5.4', ['172.16.0.0/12']));
    assert_false(client_address_in_ranges('172.32.0.1', ['172.16.0.0/12']));
    assert_false(client_address_in_ranges('::1', ['127.0.0.1']), 'an IPv6 address is in no IPv4 range');
    assert_same(visitors_address_hash(['REMOTE_ADDR' => '2001:db8:1:2::1']), visitors_address_hash(['REMOTE_ADDR' => '2001:db8:1:2::2']), 'one /64, one hash');
    assert_false(visitors_address_hash(['REMOTE_ADDR' => '192.0.2.1']) === visitors_address_hash(['REMOTE_ADDR' => '192.0.2.2']));
});
