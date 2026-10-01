<?php
// Sign-in (auth mode iam) end to end: a server that checks access tokens
// against the test IAM's keys (tests/lib.php), people signed in with tokens
// this file signs itself, and what each of them may see and change: their own
// data only. No IAM is asked.
declare(strict_types=1);

require __DIR__ . '/../lib.php'; // before the app loads: a throwaway database and backup folder

/** Two people with a role here. */
const ADA = 501;
const BEN = 502;

$GLOBALS['app'] = null;
before(function (): void {
    $GLOBALS['app'] = start_app(test_iam_env());
});

/** A request as somebody (a token), or as nobody (null). */
function as_user(?string $token, string $method, string $url, $body = null): array
{
    return call($GLOBALS['app']['base'], $method, $url, $body, $token === null ? [] : test_bearer($token));
}

function ids_of(array $items): array
{
    $ids = array_keys($items);
    sort($ids);
    return $ids;
}

test('the browser is told how to sign in; the pages, the clips, health and the app’s own words need no sign-in', function (): void {
    assert_same(['mode' => 'iam', 'issuer' => 'https://iam.test', 'clientId' => 'japanese-academy'], as_user(null, 'GET', '/api/auth/config')['body']);
    assert_same(200, as_user(null, 'GET', '/api/health')['status']);
    // The third address without sign-in: the app's own words, the same for everybody, so the Sign in page reads in the reader's language.
    foreach (['en', 'sk', 'sk-sk', 'de'] as $code) {
        $words = as_user(null, 'GET', "/api/translations/$code");
        assert_same(200, $words['status'], "/api/translations/$code without a token");
        assert_same(['en', 'sk'], array_column($words['body']['languages'] ?? [], 'code'), "/api/translations/$code");
        assert_false(isset($words['headers']['www-authenticate']), "/api/translations/$code asks for no sign-in");
    }
    assert_same(200, as_user(null, 'GET', '/')['status']);
    assert_same(200, as_user(null, 'GET', '/auth/callback?code=x&state=y')['status'], 'where the IAM sends the browser back: a page of the app');
    $clip = (string) db_value('SELECT audio FROM exam_questions WHERE audio IS NOT NULL ORDER BY seq LIMIT 1');
    assert_same(200, as_user(null, 'GET', "/audio/$clip")['status'], 'the clips are shared content');
});

test('without a token every address with somebody’s data answers 401, and asks for one', function (): void {
    $routes = ['GET /api/meta', 'GET /api/attempts', 'GET /api/kanji/catalog', 'GET /api/kanji/progress', 'GET /api/kanji/summary',
        'GET /api/kanji/export', 'GET /report/some-attempt', 'POST /api/exam', 'POST /api/submit', 'POST /api/kanji/learn',
        'POST /api/kanji/review', 'POST /api/kanji/practice', 'POST /api/kanji/item', 'POST /api/kanji/settings',
        'POST /api/kanji/reset-item', 'POST /api/kanji/reset',
        // the owner's: the languages and the app's own words (tests/api/translations.test.php has who may, once signed in)
        'GET /api/owner/languages', 'POST /api/owner/languages', 'PUT /api/owner/languages/sk', 'DELETE /api/owner/languages/sk',
        'GET /api/owner/translations', 'PUT /api/owner/translations', 'GET /api/owner/translations/sk/export', 'PUT /api/owner/translations/sk/import'];
    $languages = db_all('SELECT * FROM languages ORDER BY code');
    foreach ($routes as $route) {
        [$method, $url] = explode(' ', $route);
        $body = $method === 'POST' ? ['id' => 'k:大', 'confirm' => 'RESET'] : null;
        if (str_starts_with($url, '/api/owner/') && $method !== 'GET' && $method !== 'DELETE') {
            $body = ['code' => 'xx', 'name' => 'X', 'nativeName' => 'X', 'enabled' => false, 'values' => new stdClass()];
        }
        $r = as_user(null, $method, $url, $body);
        assert_same(401, $r['status'], $route);
        assert_same('Bearer', $r['headers']['www-authenticate'] ?? null, "$route says how to sign in");
        assert_same('Sign in first.', $r['body']['error'] ?? null, $route);
        assert_same(['error' => 'Sign in first.', 'code' => 'sign_in_required'], $r['body'], "$route: the code a page words it from, beside the sentence, and no more");
    }
    assert_same(404, as_user(null, 'GET', '/api/nothing')['status'], 'an unknown address is still a 404');
    assert_same(0, (int) db_value('SELECT count(*) FROM srs_progress'), 'nothing was learned');
    assert_same($languages, db_all('SELECT * FROM languages ORDER BY code'), 'and no language added, changed or deleted');
});

test('a token that is not good is refused', function (): void {
    $iam = test_iam();
    $forger = anotoki_iam_test_keypair('academy-test'); // the same kid, another key
    $config = ['issuer' => $iam['issuer'], 'client_id' => $iam['client_id']];
    $bad = [
        'expired' => test_token(ADA, ['MEMBER'], ['exp' => time() - 3600]),
        'for another app' => test_token(ADA, ['MEMBER'], ['aud' => 'genshin']),
        'from another IAM' => test_token(ADA, ['MEMBER'], ['iss' => 'https://iam.anotoki.eu']),
        'an ID token' => test_token(ADA, ['MEMBER'], [], 'JWT'),
        'signed by another key' => anotoki_iam_test_sign(anotoki_iam_test_claims($config, ADA, ['MEMBER']), $forger['private_pem'], $forger['kid']),
        'no user id' => test_token(ADA, ['MEMBER'], ['sub' => 'ada']),
        'not a token' => 'not.a.token',
    ];
    foreach ($bad as $what => $token) {
        $r = as_user($token, 'GET', '/api/kanji/progress');
        assert_same(401, $r['status'], $what);
        assert_same('Bearer error="invalid_token"', $r['headers']['www-authenticate'] ?? null, $what);
        assert_same(['error' => 'Sign in again.', 'code' => 'invalid_token'], $r['body'], "$what: the same words and code whatever was wrong with it (the log has the reason)");
    }
    $basic = call($GLOBALS['app']['base'], 'GET', '/api/kanji/progress', null, ['Authorization: Basic YWRhOnNlY3JldA==']);
    assert_same(401, $basic['status'], 'a bearer token only');
    assert_refused(401, 'sign_in_required', 'Sign in first.', $basic, 'no bearer token is no token');
    assert_same(null, db_value('SELECT id FROM users WHERE id = ?', [ADA]), 'nobody refused got a row');
});

test('a token without a role here is refused: only the people the owner gave a role study here', function (): void {
    $r = as_user(test_token(ADA, []), 'GET', '/api/kanji/progress');
    assert_same(403, $r['status']);
    assert_same('Your account has no access to Japanese Academy.', $r['body']['error']);
    assert_same('no_access', $r['body']['code'] ?? null, 'the code a page words it from');
    assert_same(200, as_user(test_token(ADA, ['ADMIN']), 'GET', '/api/kanji/summary')['status'], 'ADMIN is a role here too');
});

test('two people, each with their own progress, settings and resets', function (): void {
    $ada = test_token(ADA, ['MEMBER'], ['preferred_username' => 'ada']);
    $ben = test_token(BEN, ['ADMIN'], ['preferred_username' => 'ben']);
    foreach (['k:大', 'k:学', 'v:大学'] as $id) {
        assert_same(200, as_user($ada, 'POST', '/api/kanji/learn', ['id' => $id])['status'], "Ada learns $id");
    }
    assert_same(409, as_user($ben, 'POST', '/api/kanji/learn', ['id' => 'v:大学'])['status'], 'Ben has not learned its kanji, Ada has');
    assert_same(200, as_user($ben, 'POST', '/api/kanji/learn', ['id' => 'k:大'])['status'], 'the same item, learned by Ben on his own');
    assert_same(200, as_user($ben, 'POST', '/api/kanji/settings', ['batchSize' => 10])['status']);
    assert_same(200, as_user($ben, 'POST', '/api/kanji/item', ['id' => 'k:学', 'notes' => ['meaning' => 'Ben’s note']])['status']);

    $pa = as_user($ada, 'GET', '/api/kanji/progress')['body'];
    $pb = as_user($ben, 'GET', '/api/kanji/progress')['body'];
    assert_same(['k:大', 'k:学', 'v:大学'], ids_of($pa['items']));
    assert_same(['k:大', 'k:学'], ids_of($pb['items']));
    assert_same('', $pa['items']['k:学']['notes']['meaning'], 'Ben’s note is his');
    assert_same([5, 10], [$pa['settings']['batchSize'], $pb['settings']['batchSize']]);
    assert_same([3, 1], [$pa['summary']['today']['lessons'], $pb['summary']['today']['lessons']]);
    assert_same(['k:大', 'k:学', 'v:大学'], ids_of(as_user($ada, 'GET', '/api/kanji/export')['body']['items']), 'the export: hers');

    // a review of the item both have: Ben's is due, Ada's is not
    db_exec('UPDATE srs_progress SET next_review = academy_time(?) WHERE user_id = ? AND item_id = ?', [now_ms() - 1000, BEN, 'k:大']);
    assert_same(409, as_user($ada, 'POST', '/api/kanji/review', ['id' => 'k:大'])['status'], 'not due for Ada');
    assert_same(2, as_user($ben, 'POST', '/api/kanji/review', ['id' => 'k:大'])['body']['to'], 'due for Ben');

    assert_same(200, as_user($ben, 'POST', '/api/kanji/reset', ['confirm' => 'RESET'])['status']);
    assert_same(0, as_user($ben, 'GET', '/api/kanji/summary')['body']['learned'], 'Ben starts again');
    assert_same(3, as_user($ada, 'GET', '/api/kanji/summary')['body']['learned'], 'Ada does not');
    assert_same(['reset'], array_column(db_all("SELECT kind FROM srs_log WHERE kind = 'reset'"), 'kind'));
    assert_same(BEN, (int) db_value("SELECT user_id FROM srs_log WHERE kind = 'reset'"), 'his reset, in his log');
});

test('the users rows: made from the tokens as people arrive, their names kept up to date', function (): void {
    assert_same([[ADA, 'ada'], [BEN, 'ben']], array_map(
        static fn (array $r): array => [(int) $r['id'], $r['preferred_username']],
        db_all('SELECT id, preferred_username FROM users WHERE id IN (?, ?) ORDER BY id', [ADA, BEN])
    ));
    as_user(test_token(ADA, ['MEMBER'], ['preferred_username' => 'ada.l']), 'GET', '/api/kanji/summary');
    assert_same('ada.l', db_value('SELECT preferred_username FROM users WHERE id = ?', [ADA]), 'a new name comes with the next token');
    db_exec("UPDATE users SET last_seen_at = now() - interval '1 hour' WHERE id = ?", [ADA]);
    as_user(test_token(ADA, ['MEMBER'], ['preferred_username' => 'ada.l']), 'GET', '/api/kanji/summary');
    assert_true((bool) db_value("SELECT last_seen_at > now() - interval '1 minute' FROM users WHERE id = ?", [ADA]), 'when they were last here');
});

test('exam attempts and reports are each person’s own, even under the same attempt id', function (): void {
    $ada = test_token(ADA);
    $ben = test_token(BEN);
    $paper = as_user($ada, 'POST', '/api/exam', ['size' => 40, 'seed' => 'shared'])['body'];
    $mine = as_user($ada, 'POST', '/api/submit', ['spec' => $paper['spec'], 'responses' => new stdClass()])['body'];
    // Ben with an attempt of the very same id: beside Ada's, not over it
    $attempt = json_decode((string) db_value('SELECT attempt FROM exam_attempts WHERE user_id = ? AND id = ?', [ADA, $mine['id']]), true);
    exam_save_attempt(BEN, $attempt, '<!doctype html><title>Ben’s report</title>');
    assert_same(2, (int) db_value('SELECT count(*) FROM exam_attempts WHERE id = ?', [$mine['id']]));

    $hers = as_user($ada, 'GET', $mine['reportUrl']);
    assert_match('/By skill/', $hers['raw']);
    assert_match("/default-src 'none'/", $hers['headers']['content-security-policy'] ?? '', 'a report may never run a script');
    assert_same('<!doctype html><title>Ben’s report</title>', as_user($ben, 'GET', $mine['reportUrl'])['raw'], 'the same address, his own report');
    assert_same(401, as_user(null, 'GET', $mine['reportUrl'])['status']);

    $paper = as_user($ada, 'POST', '/api/exam', ['size' => 40, 'seed' => 'ada-only'])['body'];
    $only = as_user($ada, 'POST', '/api/submit', ['spec' => $paper['spec'], 'responses' => new stdClass()])['body'];
    assert_same(404, as_user($ben, 'GET', $only['reportUrl'])['status'], 'Ben cannot open Ada’s report');
    assert_same([$only['id'], $mine['id']], array_column(as_user($ada, 'GET', '/api/attempts')['body'], 'id'), 'her history');
    assert_same([$mine['id']], array_column(as_user($ben, 'GET', '/api/attempts')['body'], 'id'), 'his history');
    assert_same([2, 1], [as_user($ada, 'GET', '/api/meta')['body']['attempts'], as_user($ben, 'GET', '/api/meta')['body']['attempts']]);
    $report = (string) db_value('SELECT report FROM exam_attempts WHERE user_id = ? AND id = ?', [ADA, $only['id']]);
    assert_match('/Attempt history/', $report, 'her report lists her attempts');
    assert_no_match('/Ben/', $report);
});

test('without sign-in, a server is the owner, whatever token comes', function (): void {
    $none = start_app();
    $r = call($none['base'], 'POST', '/api/kanji/learn', ['id' => 'k:山'], test_bearer(test_token(ADA)));
    assert_same(200, $r['status']);
    assert_same(auth_local_user_id(), (int) db_value("SELECT user_id FROM srs_progress WHERE item_id = 'k:山'"));
    assert_same(['mode' => 'none'], call($none['base'], 'GET', '/api/auth/config')['body']);
});

test('without sign-in only under php backend/server.php, only from this computer, and only straight to its own address', function (): void {
    $here = ['REMOTE_ADDR' => '127.0.0.1', 'HTTP_HOST' => '127.0.0.1:8200'];
    assert_true(auth_none_allowed('cli-server', $here));
    assert_true(auth_none_allowed('cli-server', ['HTTP_HOST' => 'localhost:8200'] + $here));
    assert_true(auth_none_allowed('cli-server', ['REMOTE_ADDR' => '::1', 'HTTP_HOST' => '[::1]:8200']));
    assert_true(auth_none_allowed('cli-server', ['HTTP_HOST' => 'LocalHost'] + $here), 'a host name is any case, and the port may be left out');
    assert_false(auth_none_allowed('cli-server', ['REMOTE_ADDR' => '192.168.1.20'] + $here), 'another device');
    assert_false(auth_none_allowed('apache2handler', $here), 'Apache: a website');
    assert_false(auth_none_allowed('fpm-fcgi', $here), 'PHP-FPM: a website');
    assert_false(auth_none_allowed('cgi-fcgi', ['REMOTE_ADDR' => '::1'] + $here), 'FastCGI: a website');
    assert_false(auth_none_allowed('cli-server', ['HTTP_HOST' => 'academy.example.com'] + $here), 'another name: a tunnel, or a page elsewhere whose own name points here');
    assert_false(auth_none_allowed('cli-server', ['HTTP_HOST' => 'localhost.example.com'] + $here));
    assert_false(auth_none_allowed('cli-server', ['HTTP_HOST' => '127.0.0.1.example.com'] + $here));
    assert_false(auth_none_allowed('cli-server', ['REMOTE_ADDR' => '127.0.0.1']), 'no Host at all');
    foreach (['HTTP_FORWARDED' => 'for=203.0.113.9', 'HTTP_X_FORWARDED_FOR' => '203.0.113.9', 'HTTP_X_REAL_IP' => '203.0.113.9'] as $header => $value) {
        assert_false(auth_none_allowed('cli-server', [$header => $value] + $here), "$header: passed on by a proxy");
    }

    // and so the server answers
    $none = start_app();
    assert_same(200, call($none['base'], 'GET', '/api/kanji/summary')['status'], 'straight from this computer: the owner');
    foreach (['Host: academy.example.com', 'X-Forwarded-For: 203.0.113.9', 'Forwarded: for=203.0.113.9'] as $header) {
        foreach (['/api/kanji/summary', '/api/auth/config'] as $url) {
            $r = call($none['base'], 'GET', $url, null, [$header]);
            assert_same(403, $r['status'], "$header $url");
            assert_same(AUTH_NONE_ONLY, $r['body']['error'] ?? null, "$header $url");
            assert_same(['error' => AUTH_NONE_ONLY, 'code' => 'this_computer_only'], $r['body'], "$header $url: the code a page words it from, and no more");
        }
    }
    // The owner's addresses are somebody's to change: closed the same way. The app's own words are nobody's data: open under any name.
    assert_same(200, call($none['base'], 'GET', '/api/owner/languages')['status'], 'straight from this computer: the owner');
    foreach (['GET /api/owner/languages', 'GET /api/owner/translations', 'PUT /api/owner/translations', 'DELETE /api/owner/languages/sk'] as $route) {
        [$method, $url] = explode(' ', $route);
        $r = call($none['base'], $method, $url, $method === 'PUT' ? ['values' => new stdClass()] : null, ['Host: academy.example.com']);
        assert_same([403, 'this_computer_only'], [$r['status'], $r['body']['code'] ?? null], "Host: academy.example.com $route");
    }
    foreach (['Host: academy.example.com', 'X-Forwarded-For: 203.0.113.9'] as $header) {
        $words = call($none['base'], 'GET', '/api/translations/sk', null, [$header]);
        assert_same([200, 'sk'], [$words['status'], $words['body']['language'] ?? null], "$header /api/translations/sk: the same for everybody");
    }
    $health = call($none['base'], 'GET', '/api/health', null, ['Host: academy.example.com']);
    assert_same(200, $health['status'], 'health still answers');
    assert_false(isset($health['body']['database']) || isset($health['body']['backups']) || isset($health['body']['owner']), 'but keeps the database, the folders and the owner to itself');
    assert_same(db_name(), call($none['base'], 'GET', '/api/health')['body']['database'] ?? null, 'which it tells this computer');
    assert_same([], server_problems($none));
});

test('a refused token’s reason goes to the log on one line, clipped: the token chose some of its words', function (): void {
    $iam = test_iam();
    $kid = "no-such-key\r\n[auth] a token was accepted: forged\x07" . str_repeat('k', 5000);
    $token = anotoki_iam_test_sign(anotoki_iam_test_claims(['issuer' => $iam['issuer'], 'client_id' => $iam['client_id']], ADA, ['MEMBER']), $iam['pair']['private_pem'], $kid);
    assert_same(401, as_user($token, 'GET', '/api/kanji/summary')['status']);
    $lines = preg_split('/\R/', (string) file_get_contents($GLOBALS['app']['log']));
    $refused = array_values(array_filter($lines, static fn (string $l): bool => str_contains($l, 'no published key with kid no-such-key')));
    assert_same(1, count($refused), 'one line');
    assert_match('/\[auth\] a token was refused: no published key with kid no-such-key \[auth\] a token was accepted: forged k+$/', $refused[0]);
    assert_true(strlen($refused[0]) < 500, 'clipped: ' . strlen($refused[0]) . ' bytes');
    assert_same([], array_values(array_filter($lines, static fn (string $l): bool => str_starts_with($l, '[auth] a token was accepted'))), 'no line of its own');
    assert_same('no published key with kid x y', auth_log_text("no published key with kid x\u{2028}\ty"), 'Unicode line breaks too');
    assert_same('bytes that are not UTF-8', auth_log_text("bytes that are\xC3\xA9\xFFnot UTF-8"), 'and text that is not UTF-8');
});

test('the settings: required, with no defaults to fall back on, and only iam or none', function (): void {
    // a copy without auth.local.php is not set up: there is no mode to assume, and no open one
    $dir = test_server_config('none');
    unlink("$dir/auth.local.php");
    $bare = start_app(['env' => ['ACADEMY_CONFIG_DIR' => $dir]]);
    foreach (['/api/auth/config', '/api/kanji/summary', '/api/health'] as $url) {
        $r = call($bare['base'], 'GET', $url);
        assert_same(503, $r['status'], $url);
        assert_same('not_set_up', $r['body']['code'] ?? null, $url);
    }
    assert_same('backend/config/auth.local.php is missing', $r['body']['reason'] ?? null, 'what is missing, to this computer');

    file_put_contents("$dir/auth.local.php", "<?php return ['mode' => 'open', 'local_user_id' => 1];");
    assert_same(503, call($bare['base'], 'GET', '/api/kanji/summary')['status'], 'nor is one with a mode that is neither');
    putenv("ACADEMY_CONFIG_DIR=$dir");
    config_all(true);
    try {
        assert_match("/auth\\.mode in backend\\/config\\/auth\\.local\\.php must be 'iam' or 'none'/", (string) config_problem());
        assert_throws(static fn () => auth_mode(), "/auth\\.mode must be 'iam' or 'none', not 'open'/");
    } finally {
        putenv('ACADEMY_CONFIG_DIR=' . $GLOBALS['TEST_CONFIG']['dir']);
        config_all(true);
    }
    assert_same(null, config_problem(), 'the test’s own settings are whole again');
});

test('the tests’ settings folder and keys file count only for a throwaway database', function (): void {
    $dir = test_server_config('none');
    file_put_contents("$dir/database.local.php", "<?php return ['name' => 'japanese_academy'] + (require " . var_export(test_config_server_file(), true) . ');');
    putenv("ACADEMY_CONFIG_DIR=$dir");
    try {
        assert_throws(static fn () => config_all(true), "/ACADEMY_CONFIG_DIR is for the tests' throwaway databases \\(academy_test_…\\) only, not for japanese_academy/");
    } finally {
        putenv('ACADEMY_CONFIG_DIR=' . $GLOBALS['TEST_CONFIG']['dir']);
        config_all(true);
    }
    putenv('ACADEMY_JWKS_FILE=' . test_iam()['jwks_file']);
    try {
        assert_same(test_iam()['jwks_file'], config_all(true)['auth']['jwks_file'] ?? null, 'a test database: the test IAM’s keys');
        assert_same(null, config_env_jwks('japanese_academy'), 'any other: never the keys of a file named in the environment');
        assert_same(null, config_env_jwks('academy_test_template'), 'nor the template’s');
    } finally {
        putenv('ACADEMY_JWKS_FILE');
        config_all(true);
    }
    // ...nor of one named in auth.local.php: for any other database the IAM's own keys decide who is signed in
    try {
        config_overrides(['auth' => ['jwks_file' => test_iam()['jwks_file']]]);
        assert_same(test_iam()['jwks_file'], auth_jwks_file(), 'a test database: the keys file of its settings');
        assert_same(test_iam()['jwks_file'], auth_iam_config()['jwks_file'] ?? null);
        config_overrides(['db' => ['name' => 'japanese_academy'], 'auth' => ['jwks_file' => test_iam()['jwks_file']]]);
        assert_same(null, auth_jwks_file(), 'any other database: never');
        assert_false(isset(auth_iam_config()['jwks_file']), 'so the SDK fetches the IAM’s keys');
    } finally {
        config_overrides([]);
    }
});

test('the vendored IAM SDKs are the versions the notes name', function (): void {
    assert_same('1.0.1', ANOTOKI_IAM_SDK_VERSION, 'backend/src/anotoki_iam.php: change the note in src/auth.php and docs/kb/sign-in.md with it');
    $sdk = ROOT . '/frontend/src/app/core/auth/sdk';
    assert_match("/const SDK_VERSION = '1\\.1\\.1';/", (string) file_get_contents("$sdk/anotoki-auth.mjs"),
        'frontend/src/app/core/auth/sdk/anotoki-auth.mjs: change the AuthService\'s note and docs/kb/sign-in.md with it');
    assert_match('/^\/\/ Types for anotoki-auth\.mjs \/ anotoki-auth\.js - v1\.1\.1$/m', (string) file_get_contents("$sdk/anotoki-auth.d.ts"), 'and its types, the same version');
    assert_same([], server_problems($GLOBALS['app']), 'no PHP warnings or errors on the server');
});
