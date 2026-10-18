<?php
// Visitors (src/visitors.php, learner_middleware() in api/middleware/person.php):
// studying without signing in where the IAM says this site does not require it
// (test_access(false); this file's database has migration 007 from the
// template). Nobody reads as an empty learner; the first save makes a visitor
// within the limits, in that save's own transaction; a key opens that
// visitor's data and nothing else; a token always wins over a key; the caps;
// the move at sign-in and its rules; the sweep after the answer; no visitor in
// a backup or on the People page; with the origin secret (cloudflare.local.php),
// CF-Connecting-IP believed only on a request that carries it - and a file there
// that cannot be read cleanly, or names no usable secret, failing closed (only
// deleting it switches the secret off). Visitor ids are never assumed: they are
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
    assert_same(['issuer' => 'https://iam.test', 'client_id' => 'japanese-academy', 'login_required' => false, 'sign_in_available' => true, 'visitor_keep_days' => 30], $r['body']);
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

/**
 * A write as another site's page may send it here without asking first (a "simple" request: a form, plain text, or
 * no type at all), from nobody: its status, its code, and whether it handed out a key.
 */
function simple_write(string $base, string $url, ?string $type, string $raw): array
{
    $ch = curl_init($base . $url);
    curl_setopt_array($ch, [
        CURLOPT_CUSTOMREQUEST => 'POST',
        CURLOPT_RETURNTRANSFER => true,
        CURLOPT_HEADER => true,
        // An empty "Content-Type:" makes curl send none at all.
        CURLOPT_HTTPHEADER => ['Origin: https://elsewhere.example', 'Content-Type:' . ($type === null ? '' : " $type")],
        CURLOPT_POSTFIELDS => $raw,
        CURLOPT_TIMEOUT => 30,
    ]);
    $out = (string) curl_exec($ch);
    $status = (int) curl_getinfo($ch, CURLINFO_RESPONSE_CODE);
    $size = (int) curl_getinfo($ch, CURLINFO_HEADER_SIZE);
    $body = json_decode(substr($out, $size), true);
    return [$status, is_array($body) ? ($body['code'] ?? null) : null, (bool) preg_match('/^x-visitor-key:/mi', substr($out, 0, $size))];
}

test('a write of any type but JSON is refused before anything happens: 415, nobody made - what another site\'s page could send here unasked', function (): void {
    $base = $GLOBALS['app']['base'];
    $before = visitors_here();
    $messages = (int) db_value('SELECT count(*) FROM anotoki_feedback');
    // The study's saves, and the two writes anybody may send: the feedback form and a page's error (the library's routes).
    $writes = ['/api/kanji/settings' => '{"batch":3}', '/api/kanji/learn' => '{"id":"k:大"}', '/api/kanji/item' => '{"id":"k:大","meaningNote":"x"}',
        '/api/exam' => '{"size":5}', '/api/submit' => '{}', '/api/feedback' => '{"kind":"idea","message":"unasked"}',
        '/api/client-errors' => '{"message":"unasked"}'];
    foreach ($writes as $url => $json) {
        foreach (['text/plain', 'text/plain;charset=UTF-8', 'application/x-www-form-urlencoded', null, 'application/jsonp'] as $type) {
            assert_same([415, 'unsupported_media_type', false], simple_write($base, $url, $type, $json), "$url as " . ($type ?? 'no type'));
        }
    }
    assert_same($before, visitors_here(), 'nobody made, no row written');
    assert_same($messages, (int) db_value('SELECT count(*) FROM anotoki_feedback'), 'no message kept');
    assert_false(str_contains(implode("\n", array_map('file_get_contents', glob($GLOBALS['app']['config'] . '/logs/errors-*.jsonl') ?: [])), '"source":"client"'),
        'no page error written');
    // JSON itself, as ever - with its charset too (which no page can send to another site without asking first).
    assert_same([200, null, false], simple_write($base, '/api/exam', 'application/json; charset=utf-8', '{"size":5,"seed":"json"}'));
    assert_same($before, visitors_here(), 'a paper saves nothing');
    assert_same([], server_problems($GLOBALS['app']));
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

test('with the origin secret (cloudflare.local.php), a Worker writing a new CF-Connecting-IP every time is one sender - the proxy it came through - for the visitors\' limit and the pages\' reports alike; through the zone, each visitor their own', function (): void {
    db_exec("UPDATE users SET created_at = now() - interval '2 hours' WHERE id < 0"); // what earlier tests made counts no more this hour
    // This computer standing in for Cloudflare's edge, which carries anybody's requests - the owner's zone's alone with the secret.
    $secret = 'origin-' . bin2hex(random_bytes(20));
    $app = start_app([
        'app' => ['client_address' => ['trusted_proxies' => ['127.0.0.1', '::1']], 'visitors' => ['new_per_hour_per_address' => 2, 'new_per_hour' => 100, 'max' => 100]],
        'cloudflare' => ['origin_secret' => $secret],
    ]);
    $base = $app['base'];
    new_visitor($base, 'k:大', ['CF-Connecting-IP: 198.51.100.41']);
    new_visitor($base, 'k:大', ['CF-Connecting-IP: 198.51.100.42']);
    $r = call($base, 'POST', '/api/kanji/learn', ['id' => 'k:大'], nobody(['CF-Connecting-IP: 198.51.100.43']));
    assert_same([429, 'too_many_visitors'], [$r['status'], $r['body']['code'] ?? null], 'the third, from an address never seen: the proxy\'s limit is spent');
    $r = call($base, 'POST', '/api/kanji/learn', ['id' => 'k:大'], nobody(['CF-Connecting-IP: 198.51.100.44', 'X-Anotoki-Origin: not the secret']));
    assert_same([429, 'too_many_visitors'], [$r['status'], $r['body']['code'] ?? null], 'a wrong secret: the proxy too');
    new_visitor($base, 'k:大', ['CF-Connecting-IP: 198.51.100.45', "X-Anotoki-Origin: $secret"]); // through the zone: a visitor of their own

    // The pages' own errors: the library's limit (20 an hour from one sender), by academy_admin_context()'s reading.
    $report = static function (string $address, array $headers = []) use ($base): array {
        return call($base, 'POST', '/api/client-errors', ['message' => "a page's error from $address"], nobody(array_merge(["CF-Connecting-IP: $address"], $headers)));
    };
    for ($i = 1; $i <= 20; $i++) {
        $r = $report("203.0.113.$i");
        assert_same(204, $r['status'], "report $i, from a made-up visitor: {$r['raw']}");
    }
    $over = $report('203.0.113.21');
    assert_same([429, 'too_many'], [$over['status'], $over['body']['code'] ?? null], 'the 21st, from an address never seen: the proxy\'s budget is spent');
    assert_same(204, $report('203.0.113.22', ["X-Anotoki-Origin: $secret"])['status'], 'through the zone: a visitor with a budget of their own');
    assert_same([], server_problems($app));
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
        assert_same(true, call($base, 'GET', '/api/auth/config', null, nobody())['body']['login_required'] ?? null, 'the relay says so');
    } finally {
        test_access(false);
    }
    assert_same(1, call($base, 'GET', '/api/kanji/progress', null, as_visitor($key))['body']['summary']['learned'] ?? null, 'off again: the visitor\'s data is there');
});

test('a key opens nothing that needs a signed-in person: a data file, the admin panel, the Migrations page - and is not even read there', function (): void {
    $base = $GLOBALS['app']['base'];
    $key = new_visitor($base, 'k:大');
    $id = visitor_of($key);
    // Last seen an hour ago: a key that was read would be seen now (visitors_find() writes it after five minutes).
    db_exec("UPDATE users SET last_seen_at = now() - interval '1 hour' WHERE id = ?", [$id]);
    $seen = db_value('SELECT last_seen_at FROM users WHERE id = ?', [$id]);
    foreach ([['GET', '/api/me/data'], ['PUT', '/api/me/data'], ['GET', '/api/admin/people'], ['POST', '/api/admin/people/sync'],
        ['GET', '/api/admin/translations'], ['GET', '/api/admin/migrations'], ['POST', '/api/admin/migrations/apply'], ['POST', '/api/visitor/move'],
        ['GET', '/api/admin/errors'], ['GET', '/api/admin/audit'], ['GET', '/api/admin/feedback'], ['GET', '/api/admin/backups'], ['POST', '/api/admin/backups']] as [$method, $url]) {
        // A visitor's key, and one nobody has: the same 401 - the key is no business of an address that takes a person alone.
        foreach ([$key, stray_key()] as $sent) {
            $r = call($base, $method, $url, $method === 'GET' ? null : new stdClass(), as_visitor($sent));
            assert_same([401, 'sign_in_required'], [$r['status'], $r['body']['code'] ?? null], "$method $url");
        }
    }
    assert_same($seen, db_value('SELECT last_seen_at FROM users WHERE id = ?', [$id]), 'the visitor not seen: the key was never read');
    // On a study address the same key is the visitor's, and seen.
    assert_same(200, call($base, 'GET', '/api/kanji/progress', null, as_visitor($key))['status']);
    assert_true($seen !== db_value('SELECT last_seen_at FROM users WHERE id = ?', [$id]), 'seen on a study address');
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
    $page = call($base, 'GET', '/api/admin/people', null, $admin);
    assert_same(200, $page['status'], $page['raw']);
    assert_same([], array_values(array_filter(array_column($page['body']['people'], 'sub'), static fn (string $id): bool => (int) $id < 1)), 'people only');
    // The visitors are a line of their own on the People page: how many now, the longest unseen, the limits.
    $visitors = $page['body']['visitors'];
    assert_same([visitors_here(), 30, 300], [$visitors['count'], $visitors['keep_days'], $visitors['max']]);
    assert_match('/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?Z$/', (string) $visitors['oldest_seen_at'], 'the longest unseen, when');
    assert_same(403, call($base, 'GET', '/api/admin/people', null, test_bearer(test_token(706, ['EDITOR'])))['status'], 'administrators only');

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

/** A request from $remote (REMOTE_ADDR; '' for none) with these headers, as the app's code is handed one. */
function from_address(string $remote, array $headers = []): Psr\Http\Message\ServerRequestInterface
{
    $request = (new Slim\Psr7\Factory\ServerRequestFactory())->createServerRequest('GET', '/api/kanji/learn', $remote === '' ? [] : ['REMOTE_ADDR' => $remote]);
    foreach ($headers as $name => $value) {
        $request = $request->withHeader($name, $value);
    }
    return $request;
}

test('in this process: a row that went is never made again for a visitor; the address counted - Cloudflare\'s header (pinned) from Cloudflare alone, a catch-all range refused, by the library\'s rule, the admin tools\' too', function (): void {
    assert_throws(static fn () => db_tx(static fn () => users_hold(-424242)), '/study without signing in has ended/');
    assert_throws(static fn () => users_ensure(-1), '/Not a user id/');
    assert_throws(static fn () => backup_person_copy('before-move', -1), '/no person/');

    // The committed default (config/config.php): Cloudflare's published ranges - the library's own list.
    assert_same(['trusted_proxies'], array_keys(CLIENT_ADDRESS_DEFAULTS), 'the ranges alone: the header is no setting');
    assert_same(Anotoki\Lib\Support\ClientAddress::CLOUDFLARE, CLIENT_ADDRESS_DEFAULTS['trusted_proxies'], 'the committed list is the library\'s (refresh both when Cloudflare\'s change)');
    assert_same(Anotoki\Lib\Support\ClientAddress::CLOUDFLARE, client_address_trusted_proxies(), 'with no app.local.php, Cloudflare\'s ranges');
    $edge = '173.245.48.1';     // an address of Cloudflare's (173.245.48.0/20)
    $edge6 = '2400:cb00::1';    // and one of its IPv6 ones (2400:cb00::/32)
    assert_same('198.51.100.7', client_address(from_address($edge, ['CF-Connecting-IP' => '198.51.100.7'])), 'Cloudflare\'s header, from Cloudflare');
    assert_same('2001:db8:1:2::/64', client_address_counted(from_address($edge6, ['CF-Connecting-IP' => '2001:db8:1:2::5'])), 'from Cloudflare\'s IPv6 edge too, counted by its /64');
    assert_same('198.51.100.7', client_address_counted(from_address($edge, ['CF-Connecting-IP' => '::ffff:198.51.100.7'])), 'an IPv4 address written as IPv6 is that IPv4 address');
    assert_same('192.0.2.1', client_address(from_address('192.0.2.1', ['CF-Connecting-IP' => '198.51.100.7'])), 'anybody else\'s header counts for nothing');
    // The headers Cloudflare passes on as the visitor wrote them are never believed, even from Cloudflare.
    foreach (['X-Forwarded-For', 'X-Real-IP', 'True-Client-IP', 'Forwarded'] as $header) {
        assert_same($edge, client_address(from_address($edge, [$header => '198.51.100.7'])), "$header from Cloudflare is never read");
    }
    assert_same('198.51.100.7', client_address(from_address($edge, ['CF-Connecting-IP' => '198.51.100.7', 'X-Real-IP' => '203.0.113.9', 'True-Client-IP' => '203.0.113.8'])),
        'beside them, Cloudflare\'s own');
    assert_same($edge, client_address(from_address($edge, ['CF-Connecting-IP' => '198.51.100.7, 203.0.113.1'])), 'a header that names two addresses names none');
    assert_same($edge, client_address(from_address($edge, ['CF-Connecting-IP' => 'not an address'])), 'nor what is no address');
    assert_same('?', client_address(from_address('')));
    assert_same('?', client_address_counted(from_address('')));

    // The admin tools read the address by the same rule - the feedback's limits, the error log's client hash.
    $context = academy_admin_context();
    assert_same([client_address_trusted_proxies(), 'CF-Connecting-IP'], [$context->trustedProxies(), $context->clientHeader()]);
    foreach ([from_address($edge, ['CF-Connecting-IP' => '198.51.100.7']), from_address($edge6, ['CF-Connecting-IP' => '2001:db8:1:2::5']),
        from_address('192.0.2.1', ['CF-Connecting-IP' => '198.51.100.7'])] as $request) {
        assert_same(client_address_counted($request), $context->clientKey($request), 'one rule: ' . client_address_counted($request));
    }

    try {
        // A copy that is not behind Cloudflare: app.local.php's [] believes nobody.
        config_overrides(['app' => ['client_address' => ['trusted_proxies' => []]]]);
        assert_same($edge, client_address(from_address($edge, ['CF-Connecting-IP' => '198.51.100.7'])), '[]: nobody\'s header');
        // Or proxies of its own - and still Cloudflare's header alone: a header named in the settings is no setting.
        config_overrides(['app' => ['client_address' => ['trusted_proxies' => ['10.0.0.0/8', '2001:db8::/32'], 'client_ip_header' => 'X-Real-IP']]]);
        assert_same('198.51.100.9', client_address(from_address('10.1.2.3', ['CF-Connecting-IP' => '198.51.100.9'])), 'a proxy of its own, by Cloudflare\'s header');
        assert_same('10.1.2.3', client_address(from_address('10.1.2.3', ['X-Real-IP' => '198.51.100.9'])), 'never the header the settings name');
        assert_same($edge, client_address(from_address($edge, ['CF-Connecting-IP' => '198.51.100.9'])), 'and Cloudflare is no longer one of them');
        // A range wider than any proxy's - a catch-all - is refused, never believed; the proxies' own beside it stay.
        $wide = ['0.0.0.0/0', '::/0', '10.0.0.0/7', '2001:db8::/15', '0.0.0.0/1', '10.0.0.0/33', 'not a range', '10.0.0.0/', '', 42, null, ['10.0.0.0/8']];
        config_overrides(['app' => ['client_address' => ['trusted_proxies' => array_merge($wide, ['10.0.0.0/8', '2001:db8::/16', '192.0.2.10'])]]]);
        $phpLog = (string) tempnam(sys_get_temp_dir(), 'academy-proxies-');
        $logBefore = ini_set('error_log', $phpLog);
        try {
            assert_same(['10.0.0.0/8', '2001:db8::/16', '192.0.2.10'], client_address_trusted_proxies(), 'only the proxies\' own ranges, /8 and /16 the widest');
            client_address_trusted_proxies();
            $said = (string) file_get_contents($phpLog);
        } finally {
            ini_set('error_log', (string) $logBefore);
            @unlink($phpLog);
        }
        assert_same(1, substr_count($said, 'refused, never believed (no range, or wider than /8 for IPv4, /16 for IPv6): ::/0'), 'each refused range said once in PHP\'s log: ' . $said);
        assert_same(1, substr_count($said, '): 0.0.0.0/0'));
        assert_same('203.0.113.50', client_address(from_address('203.0.113.50', ['CF-Connecting-IP' => '198.51.100.9'])), '0.0.0.0/0 believes nobody\'s header');
        assert_same('2a00:1450::1', client_address(from_address('2a00:1450::1', ['CF-Connecting-IP' => '198.51.100.9'])), 'nor ::/0 (2001::/16, the widest kept, is not that address\'s)');
        assert_same('198.51.100.9', client_address(from_address('192.0.2.10', ['CF-Connecting-IP' => '198.51.100.9'])), 'one address of a proxy\'s, believed');
        config_overrides(['app' => ['client_address' => ['trusted_proxies' => ['0.0.0.0/0', '::/0']]]]);
        assert_same([], client_address_trusted_proxies(), 'catch-alls alone: nobody trusted');
        assert_same('203.0.113.50', client_address(from_address('203.0.113.50', ['CF-Connecting-IP' => '198.51.100.9'])), 'and nobody\'s header believed');
    } finally {
        config_overrides([]);
    }
    foreach (['10.0.0.0/8' => true, '2001:db8::/16' => true, '192.0.2.1' => true, '::1' => true, '2001:db8::/128' => true, '10.0.0.0/7' => false,
        '2001:db8::/15' => false, '0.0.0.0/0' => false, '::/0' => false, '10.0.0.0/33' => false, '2001:db8::/129' => false, '300.1.1.1' => false,
        '10.0.0.0/x' => false] as $range => $ok) {
        assert_same($ok, client_address_range_ok((string) $range), (string) $range);
    }

    // What a visitor's row keeps: a keyed HMAC of what the limits count, never the address.
    assert_same(visitors_address_hash(from_address('2001:db8:1:2::1')), visitors_address_hash(from_address('2001:db8:1:2::2')), 'one /64, one hash');
    assert_false(visitors_address_hash(from_address('192.0.2.1')) === visitors_address_hash(from_address('192.0.2.2')));
    assert_same(visitors_address_hash(from_address('198.51.100.7')), visitors_address_hash(from_address($edge, ['CF-Connecting-IP' => '198.51.100.7'])),
        'a visitor behind Cloudflare is counted as the visitor, never as Cloudflare');
    assert_match('/^[0-9a-f]{64}$/', visitors_address_hash(from_address('192.0.2.1')));
    assert_false(visitors_address_hash(from_address('192.0.2.1')) === hash('sha256', '192.0.2.1'), 'keyed: not the address\'s plain hash');
});

/** The secret the owner's zone would add - made up for this run, never a real one. */
define('ORIGIN_SECRET', 'origin-' . bin2hex(random_bytes(20)));

test('in this process, the origin secret: from a Cloudflare address, CF-Connecting-IP only on a request carrying it in X-Anotoki-Origin - without it, or with a wrong one, the edge; from anywhere else, the connection; with none, as before', function (): void {
    $edge = '173.245.48.1';     // an address of Cloudflare's (173.245.48.0/20)
    $edge6 = '2400:cb00::1';    // and one of its IPv6 ones (2400:cb00::/32)
    $visitor = ['CF-Connecting-IP' => '198.51.100.7'];

    // (a) No secret (this file's settings have no cloudflare.local.php): the visitor, as before.
    assert_same(null, config_origin_secret());
    assert_same('198.51.100.7', client_address(from_address($edge, $visitor)), 'no secret: the visitor Cloudflare names');
    assert_same('198.51.100.7', client_address(from_address($edge, $visitor + ['X-Anotoki-Origin' => 'anything'])), 'and the header changes nothing then');

    try {
        config_overrides(['cloudflare' => ['origin_secret' => ORIGIN_SECRET]]);
        assert_same(ORIGIN_SECRET, config_origin_secret());
        // (b) A secret, no X-Anotoki-Origin: a Worker of anybody's, writing the CF-Connecting-IP it likes - the edge.
        assert_same($edge, client_address(from_address($edge, $visitor)), 'no X-Anotoki-Origin: the edge it came from');
        assert_same($edge6, client_address(from_address($edge6, ['CF-Connecting-IP' => '2001:db8:1:2::5'])), 'an IPv6 edge too');
        // (c) A wrong one: the edge.
        foreach ([
            'another value' => 'not the secret',
            'one character short' => substr(ORIGIN_SECRET, 0, -1),
            'one too many' => ORIGIN_SECRET . 'x',
            'in capitals' => strtoupper(ORIGIN_SECRET),
            'empty' => '',
        ] as $case => $sent) {
            assert_same($edge, client_address(from_address($edge, $visitor + ['X-Anotoki-Origin' => $sent])), "a wrong secret ($case): the edge");
        }
        // (d) The right one: the visitor.
        assert_same('198.51.100.7', client_address(from_address($edge, $visitor + ['X-Anotoki-Origin' => ORIGIN_SECRET])), 'the zone\'s secret: the visitor Cloudflare names');
        assert_same('2001:db8:1:2::/64', client_address_counted(from_address($edge6, ['CF-Connecting-IP' => '2001:db8:1:2::5', 'X-Anotoki-Origin' => ORIGIN_SECRET])),
            'over IPv6 too, counted by its /64');
        // (e) The right one from outside Cloudflare's ranges: that connection's - the secret alone opens nothing.
        assert_same('192.0.2.1', client_address(from_address('192.0.2.1', $visitor + ['X-Anotoki-Origin' => ORIGIN_SECRET])), 'the secret from outside the ranges: the connection');

        // What the limits count without the secret: the edge, however many visitors a Worker makes up.
        $hashes = array_unique(array_map(static function (int $i) use ($edge): string {
            return visitors_address_hash(from_address($edge, ['CF-Connecting-IP' => "198.51.100.$i"]));
        }, range(1, 20)));
        assert_same([visitors_address_hash(from_address($edge))], array_values($hashes), 'twenty made-up visitors from one edge: one hash, the edge\'s');

        // Only a string with something in it is a secret; spaces around it are no part of it (a header's value never has them).
        // (Settings set in code - a test tool's overrides, never a file: a file that names no such string fails closed,
        // the test below.)
        config_overrides(['cloudflare' => ['origin_secret' => " \t" . ORIGIN_SECRET . "\n"]]);
        assert_same(ORIGIN_SECRET, config_origin_secret());
        foreach (['an empty value' => '', 'only spaces' => '   ', 'a number' => 123456789012345678, 'a list' => ['a', 'b'], 'nothing' => null] as $case => $value) {
            config_overrides(['cloudflare' => ['origin_secret' => $value]]);
            assert_same(null, config_origin_secret(), "$case: no secret");
            assert_same('198.51.100.7', client_address(from_address($edge, $visitor)), "$case: CF-Connecting-IP from the trusted proxies alone, as with no file");
        }
    } finally {
        config_overrides([]);
    }
    assert_same('198.51.100.7', client_address(from_address($edge, $visitor)), 'the secret gone: as before');
});

/** Every note the settings left in the storage's cache today (config_said()'s stamps): forgotten, so each case below is said afresh. */
function forget_said(): void
{
    array_map('unlink', glob(storage_dir() . '/cache/said-*.logged') ?: []);
}

test('the attack it stops, in this process: a cloudflare.local.php read cleanly that names no usable secret - blank, only spaces, no list, nothing returned, a misspelt or another key, the key in capitals, a number, a list, null, true - fails closed, a secret no request carries: a Worker\'s made-up CF-Connecting-IP from Cloudflare\'s ranges is the edge, with the file\'s own value or an empty X-Anotoki-Origin too; a folder in its place the same; only deleting the file switches the secret off; said by the file\'s name, never "not set up", never the value', function (): void {
    $file = $GLOBALS['TEST_CONFIG']['dir'] . '/cloudflare.local.php';
    $edge = '173.245.48.1';
    $log = (string) tempnam(sys_get_temp_dir(), 'academy-cloudflare-');
    $logBefore = ini_set('error_log', $log);
    try {
        file_put_contents($file, "<?php\nreturn " . var_export(['origin_secret' => ORIGIN_SECRET], true) . ";\n");
        config_all(true);
        assert_same(ORIGIN_SECRET, config_origin_secret(), 'the file\'s secret');
        assert_same($edge, client_address(from_address($edge, ['CF-Connecting-IP' => '198.51.100.7'])), 'and with it, no X-Anotoki-Origin: the edge');
        // Read cleanly, and still no secret a request could be held to (2026-10-18): each the owner's slip in a file put
        // there for a secret - never a way to switch the secret off, which "no secret" would be.
        foreach ([
            'an empty value' => "<?php return ['origin_secret' => ''];\n",
            'only spaces' => "<?php return ['origin_secret' => '   '];\n",
            'no list: the value alone' => "<?php return '" . ORIGIN_SECRET . "';\n",
            'no list: nothing returned (PHP reads 1)' => "<?php ['origin_secret' => '" . ORIGIN_SECRET . "'];\n",
            'a misspelt key' => "<?php return ['origin_secrets' => '" . ORIGIN_SECRET . "'];\n",
            'another key' => "<?php return ['secret' => '" . ORIGIN_SECRET . "'];\n",
            'the key in capitals' => "<?php return ['ORIGIN_SECRET' => '" . ORIGIN_SECRET . "'];\n",
            'a number' => "<?php return ['origin_secret' => 123456789012345678];\n",
            'a list' => "<?php return ['origin_secret' => ['" . ORIGIN_SECRET . "']];\n",
            'null' => "<?php return ['origin_secret' => null];\n",
            'true' => "<?php return ['origin_secret' => true];\n",
        ] as $case => $contents) {
            file_put_contents($log, '');
            file_put_contents($file, $contents);
            forget_said();
            ob_start();
            try {
                config_all(true);
                $secret = config_origin_secret();
                assert_true(is_string($secret) && preg_match('/^[0-9a-f]{64}$/D', $secret) === 1 && $secret !== ORIGIN_SECRET, "$case: a secret no request carries, never the file's");
                config_all(true);
                assert_same($secret, config_origin_secret(), "$case: the same one all through the process");
                assert_same(null, config_problem(), "$case: the file is optional - the copy is set up all the same");
                // The attack: anybody's Worker connects from Cloudflare's ranges and writes the CF-Connecting-IP it likes.
                foreach ([
                    'without X-Anotoki-Origin' => [],
                    'with the file\'s own value' => ['X-Anotoki-Origin' => ORIGIN_SECRET],
                    'with an empty X-Anotoki-Origin' => ['X-Anotoki-Origin' => ''],
                ] as $how => $origin) {
                    assert_same($edge, client_address(from_address($edge, ['CF-Connecting-IP' => '198.51.100.7'] + $origin)), "$case, $how: the edge, never the address it claims");
                }
                assert_same('2400:cb00::1', client_address(from_address('2400:cb00::1', ['CF-Connecting-IP' => '2001:db8:1:2::5'])), "$case: an IPv6 edge the same");
                assert_same('192.0.2.1', client_address(from_address('192.0.2.1', ['CF-Connecting-IP' => '198.51.100.7'])), "$case: from anywhere else, the connection, as ever");
                $hashes = array_unique(array_map(static function (int $i) use ($edge): string {
                    return visitors_address_hash(from_address($edge, ['CF-Connecting-IP' => "198.51.100.$i", 'X-Anotoki-Origin' => '']));
                }, range(1, 10)));
                assert_same([visitors_address_hash(from_address($edge))], array_values($hashes), "$case: ten made-up visitors from one edge are one sender to the visitors' limit");
            } finally {
                $printed = (string) ob_get_clean();
            }
            assert_same('', $printed, "$case: nothing of the file printed");
            $text = (string) file_get_contents($log);
            assert_true(str_contains($text, '[config] backend/config/cloudflare.local.php holds no origin_secret (a string with something in it): no request carries its secret, so every request from Cloudflare\'s ranges counts as the edge it came from'),
                "$case: said by the file's name, and that it fails closed - $text");
            assert_false(str_contains($text, ORIGIN_SECRET), "$case: the log never holds the value");
        }

        // Anything in the file's place counts as the file: a folder fails closed too (PHP may not open it, or reads nothing).
        unlink($file);
        mkdir($file);
        file_put_contents($log, '');
        forget_said();
        config_all(true);
        $secret = config_origin_secret();
        assert_true(is_string($secret) && preg_match('/^[0-9a-f]{64}$/D', $secret) === 1, 'a folder in its place: a secret no request carries');
        assert_same($edge, client_address(from_address($edge, ['CF-Connecting-IP' => '198.51.100.7'])), 'a folder in its place: the edge');
        assert_same(null, config_problem(), 'a folder in its place: the copy is set up all the same');
        $text = (string) file_get_contents($log);
        assert_true(str_contains($text, '[config] backend/config/cloudflare.local.php cannot be read (a folder stands in its place): no request carries its secret'), "a folder in its place: said - $text");
        rmdir($file);

        // Switched off the one way there is: the file deleted - CF-Connecting-IP from Cloudflare's ranges alone, as before
        // the secret, and nothing said of it.
        file_put_contents($log, '');
        forget_said();
        config_all(true);
        assert_same(null, config_origin_secret(), 'no file: no secret');
        assert_same('198.51.100.7', client_address(from_address($edge, ['CF-Connecting-IP' => '198.51.100.7'])), 'no file: the visitor Cloudflare names');
        assert_false(str_contains((string) file_get_contents($log), 'cloudflare'), 'no file: nothing said of it');
    } finally {
        if (is_dir($file)) {
            @rmdir($file);
        }
        @unlink($file);
        config_all(true);
        forget_said();
        ini_set('error_log', (string) $logBefore);
        @unlink($log);
    }
    assert_same(null, config_origin_secret(), 'the file gone: none');
});

test('in this process, a cloudflare.local.php that cannot be read cleanly fails closed - a secret no request carries, so a request from Cloudflare\'s ranges is its edge, even with the file\'s very value in X-Anotoki-Origin; the copy keeps running; said by its fault, never its text', function (): void {
    $file = $GLOBALS['TEST_CONFIG']['dir'] . '/cloudflare.local.php';
    $edge = '173.245.48.1';
    // A secret written bare is a constant PHP does not know, whose error quotes it; two strings side by side are a
    // parse error quoting the second.
    $bare = 'secret_' . bin2hex(random_bytes(16));
    $list = var_export(['origin_secret' => ORIGIN_SECRET], true);
    $log = (string) tempnam(sys_get_temp_dir(), 'academy-cloudflare-');
    $logBefore = ini_set('error_log', $log);
    try {
        foreach ([
            'a parse error' => ["<?php return ['origin_secret' => 'x' '" . ORIGIN_SECRET . "'];\n", 'cannot be read (ParseError on line 1)'],
            'a bare word' => ["<?php return ['origin_secret' => $bare];\n", 'cannot be read (Error on line 1)'],
            // Written by hand without its first line, or saved with a BOM or a line before it: PHP would print what
            // comes before its <?php ahead of every answer - and with declare(strict_types=1) after it could not even
            // compile it, a fatal error no handler catches (every request a 500, the file never failing closed). None
            // is compiled: a file that does not start with <?php is passed over unread.
            'no <?php line' => ["return $list;\n", 'does not start with <?php'],
            'a byte-order mark' => ["\xEF\xBB\xBF<?php return $list;\n", 'does not start with <?php'],
            'a line before its <?php' => ["\n<?php return $list;\n", 'does not start with <?php'],
            'a byte-order mark before declare(strict_types=1)' => ["\xEF\xBB\xBF<?php declare(strict_types=1);\nreturn $list;\n", 'does not start with <?php'],
            'a blank line before declare(strict_types=1)' => ["\n<?php declare(strict_types=1);\nreturn $list;\n", 'does not start with <?php'],
            // Text after a closing tag, or echoed: printed all the same, and caught.
            'text after a closing tag' => ["<?php \$kept = 1; ?>\n" . ORIGIN_SECRET . "\n<?php return $list;\n", 'prints ' . (strlen(ORIGIN_SECRET) + 1) . ' bytes of its own'],
            // What it prints into a buffer of its own, left open, is caught all the same.
            'a buffer of its own left open' => ["<?php ob_start(); echo '" . ORIGIN_SECRET . "'; return $list;\n", 'prints ' . strlen(ORIGIN_SECRET) . ' bytes of its own'],
        ] as $case => [$contents, $said]) {
            file_put_contents($log, '');
            file_put_contents($file, $contents);
            forget_said();
            ob_start();
            try {
                config_all(true);
                $secret = config_origin_secret();
                assert_true(is_string($secret) && preg_match('/^[0-9a-f]{64}$/D', $secret) === 1 && $secret !== ORIGIN_SECRET, "$case: a secret no request carries, never the file's");
                config_all(true);
                assert_same($secret, config_origin_secret(), "$case: the same one all through the process");
                assert_same(null, config_problem(), "$case: the file is optional - the copy is set up all the same");
                // The attack: anybody's Worker connects from Cloudflare's ranges and writes the CF-Connecting-IP it likes.
                assert_same($edge, client_address(from_address($edge, ['CF-Connecting-IP' => '198.51.100.7'])), "$case: from Cloudflare's ranges without the header, the edge");
                assert_same($edge, client_address(from_address($edge, ['CF-Connecting-IP' => '198.51.100.7', 'X-Anotoki-Origin' => ORIGIN_SECRET])), "$case: and with the file's own value - it was never read -, the edge too");
                assert_same('2400:cb00::1', client_address(from_address('2400:cb00::1', ['CF-Connecting-IP' => '2001:db8:1:2::5'])), "$case: an IPv6 edge the same");
                assert_same('192.0.2.1', client_address(from_address('192.0.2.1', ['CF-Connecting-IP' => '198.51.100.7'])), "$case: from anywhere else, the connection, as ever");
                $hashes = array_unique(array_map(static function (int $i) use ($edge): string {
                    return visitors_address_hash(from_address($edge, ['CF-Connecting-IP' => "198.51.100.$i", 'X-Anotoki-Origin' => ORIGIN_SECRET]));
                }, range(1, 10)));
                assert_same([visitors_address_hash(from_address($edge))], array_values($hashes), "$case: ten made-up visitors from one edge are one sender to the visitors' limit");
                // (The library's own limits read the secret through the admin context, made once a process: the
                // server's test below holds them, a request at a time.)
            } finally {
                $printed = (string) ob_get_clean();
            }
            assert_same('', $printed, "$case: nothing of the file printed");
            $text = (string) file_get_contents($log);
            assert_true(str_contains($text, "[config] backend/config/cloudflare.local.php $said") && str_contains($text, ': no request carries its secret, so every request from Cloudflare\'s ranges counts as the edge it came from'),
                "$case: said by its fault, and that it fails closed - $text");
            assert_false(str_contains($text, ORIGIN_SECRET) || str_contains($text, $bare), "$case: the log never holds the value");
        }

        // Said once a day: the file is read on every request, and the same fault tomorrow is the same fault.
        file_put_contents($file, "\xEF\xBB\xBF<?php return $list;\n");
        forget_said();
        file_put_contents($log, '');
        for ($i = 0; $i < 3; $i++) {
            config_all(true);
        }
        assert_same(1, substr_count((string) file_get_contents($log), 'backend/config/cloudflare.local.php does not start with <?php'), 'three reads, one line');
        forget_said();
        config_all(true);
        assert_same(2, substr_count((string) file_get_contents($log), 'backend/config/cloudflare.local.php does not start with <?php'), 'its stamp gone (a day later): said again');
    } finally {
        @unlink($file);
        config_all(true);
        forget_said();
        ini_set('error_log', (string) $logBefore);
        @unlink($log);
    }
    assert_same(null, config_origin_secret(), 'the file gone: none - CF-Connecting-IP from the trusted proxies alone again');
    assert_same('198.51.100.7', client_address(from_address($edge, ['CF-Connecting-IP' => '198.51.100.7'])));
});

test('a cloudflare.local.php that cannot be read cleanly fails closed through the server too: with a byte-order mark before <?php declare(strict_types=1) and the very secret - a file PHP could not even compile -, made-up CF-Connecting-IP addresses that carry it are one sender - the proxy - for the visitors\' limit and the pages\' reports; the site keeps answering; nothing of the file in any answer', function (): void {
    db_exec("UPDATE users SET created_at = now() - interval '2 hours' WHERE id < 0"); // what earlier tests made counts no more this hour
    // This computer standing in for Cloudflare's edge, as above - and the owner's file saved with a byte-order mark
    // before a declare(strict_types=1): compiled, a fatal error every request would answer with a 500.
    $secret = 'origin-' . bin2hex(random_bytes(20));
    $app = start_app(['app' => ['client_address' => ['trusted_proxies' => ['127.0.0.1', '::1']], 'visitors' => ['new_per_hour_per_address' => 2, 'new_per_hour' => 100, 'max' => 100]]]);
    file_put_contents($app['config'] . '/cloudflare.local.php', "\xEF\xBB\xBF<?php declare(strict_types=1);\n\nreturn " . var_export(['origin_secret' => $secret], true) . ";\n");
    $base = $app['base'];
    $through = static fn (string $address): array => ["CF-Connecting-IP: $address", "X-Anotoki-Origin: $secret"];
    $first = call($base, 'POST', '/api/kanji/learn', ['id' => 'k:大'], nobody($through('198.51.100.51')));
    assert_same(200, $first['status'], $first['raw']);
    assert_false(str_contains($first['raw'], $secret), 'nothing of the file in the answer');
    new_visitor($base, 'k:大', $through('198.51.100.52'));
    $r = call($base, 'POST', '/api/kanji/learn', ['id' => 'k:大'], nobody($through('198.51.100.53')));
    assert_same([429, 'too_many_visitors'], [$r['status'], $r['body']['code'] ?? null], 'the third, with the file\'s own secret and an address never seen: the proxy\'s limit is spent - it was never believed');

    for ($i = 1; $i <= 20; $i++) {
        $report = call($base, 'POST', '/api/client-errors', ['message' => "a page's error, $i"], nobody($through("203.0.113.$i")));
        assert_same(204, $report['status'], "report $i: {$report['raw']}");
    }
    $over = call($base, 'POST', '/api/client-errors', ['message' => 'one more'], nobody($through('203.0.113.21')));
    assert_same([429, 'too_many'], [$over['status'], $over['body']['code'] ?? null], 'the 21st: one budget, the proxy\'s');

    $status = call($base, 'GET', '/api/site-status', null, no_token());
    assert_same([200, 'ready'], [$status['status'], $status['body']['state'] ?? null], 'the site keeps running: the file is optional');
    assert_false(str_contains($status['raw'], $secret), 'and says nothing of it');
    $log = (string) file_get_contents($app['log']);
    assert_same(1, substr_count($log, 'backend/config/cloudflare.local.php does not start with <?php'), 'said once in the server\'s log, for all those requests');
    assert_false(str_contains($log, 'strict_types'), 'never compiled: no fatal error');
    assert_false(str_contains($log, $secret), 'never the secret');
});

test('a cloudflare.local.php read cleanly that names no secret fails closed through the server too: with its origin_secret left blank, made-up CF-Connecting-IP addresses from Cloudflare\'s ranges are one sender - the proxy - for the visitors\' limit and the pages\' reports, never each the visitor it claims; the site keeps answering', function (): void {
    db_exec("UPDATE users SET created_at = now() - interval '2 hours' WHERE id < 0"); // what earlier tests made counts no more this hour
    // This computer standing in for Cloudflare's edge, as above - and the owner's file with its value left blank, which
    // until 2026-10-18 meant "no secret": every Worker's CF-Connecting-IP believed.
    $app = start_app([
        'app' => ['client_address' => ['trusted_proxies' => ['127.0.0.1', '::1']], 'visitors' => ['new_per_hour_per_address' => 2, 'new_per_hour' => 100, 'max' => 100]],
        'cloudflare' => ['origin_secret' => ''],
    ]);
    $base = $app['base'];
    $claiming = static fn (string $address): array => ["CF-Connecting-IP: $address"];
    $first = call($base, 'POST', '/api/kanji/learn', ['id' => 'k:大'], nobody($claiming('198.51.100.61')));
    assert_same(200, $first['status'], $first['raw']);
    new_visitor($base, 'k:大', $claiming('198.51.100.62'));
    $r = call($base, 'POST', '/api/kanji/learn', ['id' => 'k:大'], nobody($claiming('198.51.100.63')));
    assert_same([429, 'too_many_visitors'], [$r['status'], $r['body']['code'] ?? null], 'the third, from an address never seen: the proxy\'s limit is spent - none of the addresses was believed');

    for ($i = 1; $i <= 20; $i++) {
        $report = call($base, 'POST', '/api/client-errors', ['message' => "a page's error, $i"], nobody($claiming("203.0.113.$i")));
        assert_same(204, $report['status'], "report $i: {$report['raw']}");
    }
    $over = call($base, 'POST', '/api/client-errors', ['message' => 'one more'], nobody($claiming('203.0.113.21')));
    assert_same([429, 'too_many'], [$over['status'], $over['body']['code'] ?? null], 'the 21st: one budget, the proxy\'s');

    $status = call($base, 'GET', '/api/site-status', null, no_token());
    assert_same([200, 'ready'], [$status['status'], $status['body']['state'] ?? null], 'the site keeps running: the file is optional');
    $log = (string) file_get_contents($app['log']);
    assert_same(1, substr_count($log, 'backend/config/cloudflare.local.php holds no origin_secret'), 'said once in the server\'s log, for all those requests: ' . $log);
});

test('a refused range in app.local.php is said in PHP\'s log once a day, not on every request that reads it', function (): void {
    $app = start_app(['app' => ['client_address' => ['trusted_proxies' => ['0.0.0.0/0', '127.0.0.1']]]]);
    $base = $app['base'];
    for ($i = 0; $i < 3; $i++) {
        $r = call($base, 'POST', '/api/client-errors', ['message' => "a page's error, $i"], nobody(['CF-Connecting-IP: 198.51.100.9']));
        assert_same(204, $r['status'], "request $i: {$r['raw']}");
    }
    $said = static fn (): int => substr_count((string) file_get_contents($app['log']), 'a trusted proxy in app.local.php refused, never believed (no range, or wider than /8 for IPv4, /16 for IPv6): 0.0.0.0/0');
    assert_same(1, $said(), 'three requests, one line: ' . (string) file_get_contents($app['log']));
    // A day later its stamp is old: said again, once.
    foreach (glob($app['config'] . '/cache/said-*.logged') ?: [] as $stamp) {
        touch($stamp, time() - 86401);
    }
    call($base, 'POST', '/api/client-errors', ['message' => 'a day later'], nobody());
    call($base, 'POST', '/api/client-errors', ['message' => 'and again'], nobody());
    assert_same(2, $said(), 'a day later: once more');
});

test('in this process, an app.local.php that cannot be read cleanly - or holds no settings - believes nobody, never Cloudflare\'s ranges again: it may be the very file that said [] for a host not behind Cloudflare (coarser, never looser)', function (): void {
    $file = $GLOBALS['TEST_CONFIG']['dir'] . '/app.local.php';
    $kept = is_file($file) ? (string) file_get_contents($file) : null;
    $edge = '173.245.48.1';
    $log = (string) tempnam(sys_get_temp_dir(), 'academy-app-');
    $logBefore = ini_set('error_log', $log);
    try {
        config_all(true);
        assert_same(CLIENT_ADDRESS_DEFAULTS['trusted_proxies'], client_address_trusted_proxies(), 'this test\'s app.local.php names no proxies: Cloudflare\'s ranges, the default');
        assert_same('198.51.100.7', client_address(from_address($edge, ['CF-Connecting-IP' => '198.51.100.7'])), 'so a Cloudflare edge\'s header is believed');
        // What a host that is not behind Cloudflare writes: believe nobody.
        $nobody = var_export(['client_address' => ['trusted_proxies' => []]], true);
        foreach ([
            'a byte-order mark' => "\xEF\xBB\xBF<?php return $nobody;\n",
            'a blank line before declare(strict_types=1)' => "\n<?php declare(strict_types=1);\nreturn $nobody;\n",
            'a parse error' => "<?php return ['client_address' => ['trusted_proxies' => []] 'x'];\n",
            'no list returned' => "<?php return 'client_address';\n",
        ] as $case => $contents) {
            file_put_contents($file, $contents);
            forget_said();
            ob_start();
            try {
                config_all(true);
                assert_true(isset(config_file_problems()['app']), "$case: not read cleanly");
                assert_same([], client_address_trusted_proxies(), "$case: nobody believed - never the default");
                assert_same($edge, client_address(from_address($edge, ['CF-Connecting-IP' => '198.51.100.7'])), "$case: a request from Cloudflare's ranges counts as its connection, its header not believed");
                assert_same('192.0.2.1', client_address(from_address('192.0.2.1', ['CF-Connecting-IP' => '198.51.100.7'])), "$case: from anywhere else, the connection, as ever");
                assert_same(null, config_problem(), "$case: the copy is set up all the same - the file is optional");
            } finally {
                $printed = (string) ob_get_clean();
            }
            assert_same('', $printed, "$case: nothing of the file printed");
            assert_match('/\[config\] backend\/config\/app\.local\.php .*: its defaults hold until it is mended\./', (string) file_get_contents($log), "$case: said in PHP's log");
        }
        // Mended, the same [] read cleanly: nobody, as it says.
        file_put_contents($file, "<?php return $nobody;\n");
        config_all(true);
        assert_same([[], []], [config_file_problems(), client_address_trusted_proxies()], 'mended: read, and its [] believes nobody');
    } finally {
        if ($kept === null) {
            @unlink($file);
        } else {
            file_put_contents($file, $kept);
        }
        config_all(true);
        forget_said();
        ini_set('error_log', (string) $logBefore);
        @unlink($log);
    }
    assert_same(CLIENT_ADDRESS_DEFAULTS['trusted_proxies'], client_address_trusted_proxies(), 'the test\'s own file back: Cloudflare\'s ranges again');
});
