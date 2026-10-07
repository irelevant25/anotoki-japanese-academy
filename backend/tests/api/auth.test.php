<?php
// Sign-in end to end: a server that checks access tokens against the test
// IAM's keys (tests/lib.php), people signed in with tokens this file signs
// itself or gets from the stand-in IAM (tests/tools/stand-in-iam.php), and what
// each of them may see and change: their own data only. No IAM is asked.
declare(strict_types=1);

require __DIR__ . '/../lib.php'; // before the app loads: a throwaway database and backup folder

/** Two people with no role here: learners, as every account is. */
const ADA = 501;
const BEN = 502;

$GLOBALS['app'] = null;
before(function (): void {
    $GLOBALS['app'] = start_app();
});

/** A request as somebody (a token), or as nobody (null). */
function as_user(?string $token, string $method, string $url, $body = null): array
{
    return call($GLOBALS['app']['base'], $method, $url, $body, $token === null ? no_token() : test_bearer($token));
}

function ids_of(array $items): array
{
    $ids = array_keys($items);
    sort($ids);
    return $ids;
}

test('the browser is told how to sign in; the pages, the clips, health and the app’s own words need no sign-in', function (): void {
    assert_same(['issuer' => 'https://iam.test', 'clientId' => 'japanese-academy', 'loginRequired' => true, 'visitorKeepDays' => 30], as_user(null, 'GET', '/api/auth/config')['body'],
        'the IAM, and whether sign-in is required here: it is, while the database cannot keep visitors (tests/api/access.test.php)');
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

test('without a token every address with somebody’s data answers 401, and asks for one - from this computer too', function (): void {
    $routes = ['GET /api/meta', 'GET /api/attempts', 'GET /api/kanji/catalog', 'GET /api/kanji/progress', 'GET /api/kanji/summary',
        'GET /report/some-attempt', 'POST /api/exam', 'POST /api/submit', 'POST /api/kanji/learn',
        'POST /api/kanji/review', 'POST /api/kanji/practice', 'POST /api/kanji/item', 'POST /api/kanji/settings',
        'POST /api/kanji/reset-item', 'POST /api/kanji/reset',
        // your own data as a file, and back (tests/api/me.test.php)
        'GET /api/me/data', 'PUT /api/me/data',
        // the admin area: the languages, the app's own words and the people (tests/api/translations.test.php
        // and people.test.php have who may, once signed in)
        'GET /api/admin/languages', 'POST /api/admin/languages', 'PUT /api/admin/languages/sk', 'DELETE /api/admin/languages/sk',
        'GET /api/admin/translations', 'PUT /api/admin/translations', 'GET /api/admin/translations/sk/export', 'PUT /api/admin/translations/sk/import',
        'GET /api/admin/people', 'DELETE /api/admin/people/' . ADA];
    $languages = db_all('SELECT * FROM languages ORDER BY code');
    foreach ($routes as $route) {
        [$method, $url] = explode(' ', $route);
        $body = $method === 'POST' ? ['id' => 'k:大', 'confirm' => 'RESET'] : null;
        if (str_starts_with($url, '/api/admin/') && $method !== 'GET' && $method !== 'DELETE') {
            $body = ['code' => 'xx', 'name' => 'X', 'nativeName' => 'X', 'enabled' => false, 'values' => new stdClass()];
        }
        // the test server is PHP's built-in one, asked straight from this computer: nobody is anybody without a token
        $r = as_user(null, $method, $url, $body);
        assert_same(401, $r['status'], $route);
        assert_same('Bearer', $r['headers']['www-authenticate'] ?? null, "$route says how to sign in");
        assert_same('Sign in first.', $r['body']['error'] ?? null, $route);
        assert_same(['error' => 'Sign in first.', 'code' => 'sign_in_required'], $r['body'], "$route: the code a page words it from, beside the sentence, and no more");
    }
    assert_same(404, as_user(null, 'GET', '/api/nothing')['status'], 'an unknown address is still a 404');
    assert_same(404, as_user(test_token(ADA), 'GET', '/api/kanji/export')['status'], 'the kanji-only download went: /api/me/data has all of it');
    assert_same(0, (int) db_value('SELECT count(*) FROM srs_progress'), 'nothing was learned');
    assert_same($languages, db_all('SELECT * FROM languages ORDER BY code'), 'and no language added, changed or deleted');
});

test('a token that is not good is refused, never taken for anybody else', function (): void {
    $iam = test_iam();
    $forger = anotoki_iam_test_keypair('academy-test'); // the same kid, another key
    $config = ['issuer' => $iam['issuer'], 'client_id' => $iam['client_id']];
    $bad = [
        'expired' => test_token(ADA, [], ['exp' => time() - 3600]),
        'for another app' => test_token(ADA, [], ['aud' => 'genshin']),
        'from another IAM' => test_token(ADA, [], ['iss' => 'https://iam.anotoki.eu']),
        'an ID token' => test_token(ADA, [], [], 'JWT'),
        'signed by another key' => anotoki_iam_test_sign(anotoki_iam_test_claims($config, ADA, ['ADMIN']), $forger['private_pem'], $forger['kid']),
        'no user id' => test_token(ADA, [], ['sub' => 'ada']),
        'not a token' => 'not.a.token',
    ];
    foreach ($bad as $what => $token) {
        $r = as_user($token, 'GET', '/api/kanji/progress');
        assert_same(401, $r['status'], $what);
        assert_same('Bearer error="invalid_token"', $r['headers']['www-authenticate'] ?? null, $what);
        assert_same(['error' => 'Sign in again.', 'code' => 'invalid_token'], $r['body'], "$what: the same words and code whatever was wrong with it (the log has the reason)");
    }
    // The Bearer scheme claims to be somebody, token or not (auth_sent_token()): that person or 401 invalid_token.
    foreach (['Bearer', 'Bearer   ', 'bearer'] as $header) {
        $r = call($GLOBALS['app']['base'], 'GET', '/api/kanji/progress', null, ["Authorization: $header"]);
        assert_refused(401, 'invalid_token', 'Sign in again.', $r, "\"$header\": a token that is not there does not verify");
    }
    // Any other scheme claims nothing: Basic is what a host behind a password file sends with every request.
    $basic = call($GLOBALS['app']['base'], 'GET', '/api/kanji/progress', null, ['Authorization: Basic YWRhOnNlY3JldA==']);
    assert_same(401, $basic['status'], 'a bearer token only');
    assert_refused(401, 'sign_in_required', 'Sign in first.', $basic, 'no bearer token is no token');
    assert_same(null, db_value('SELECT id FROM users WHERE id = ?', [ADA]), 'nobody refused got a row');
});

test('every account studies here: MEMBER (every account holds it) is a learner, and so is a token with no role here', function (): void {
    foreach (['MEMBER alone' => ['MEMBER'], 'no role' => [], 'a role of another app' => ['OWNER'], 'MEMBER in any case' => ['member']] as $what => $roles) {
        $r = as_user(test_token(ADA, $roles), 'GET', '/api/kanji/progress');
        assert_same(200, $r['status'], $what);
        $admin = as_user(test_token(ADA, $roles), 'GET', '/api/admin/translations');
        assert_refused(403, 'staff_only', 'This is for the site\'s editors and administrators.', $admin, "$what: no admin area");
    }
    // the whole admin panel says no to MEMBER: the words, the languages, the people, the migrations
    $member = test_token(ADA, ['MEMBER']);
    foreach (['GET /api/admin/languages' => 'staff_only', 'POST /api/admin/languages' => 'staff_only', 'GET /api/admin/translations/sk/export' => 'staff_only',
        'GET /api/admin/people' => 'staff_only', 'GET /api/admin/migrations' => 'staff_only'] as $route => $code) {
        [$method, $url] = explode(' ', $route);
        $r = as_user($member, $method, $url, $method === 'POST' ? ['code' => 'xx', 'name' => 'X', 'nativeName' => 'X'] : null);
        assert_same([403, $code], [$r['status'], $r['body']['code'] ?? null], "MEMBER: $route");
    }
    assert_same(0, (int) db_value("SELECT count(*) FROM languages WHERE code = 'xx'"), 'and no language was added');
    assert_same(200, as_user(test_token(ADA, ['ADMIN']), 'GET', '/api/kanji/summary')['status'], 'an administrator studies too');
    assert_same(200, as_user(test_token(ADA, ['editor']), 'GET', '/api/admin/translations')['status'], 'a role in any case is the role');
});

test('the roles that count: ADMIN and EDITOR of this application, upper-cased', function (): void {
    assert_same([], auth_roles(['roles' => []]));
    assert_same([], auth_roles([]), 'no roles claim at all');
    assert_same([], auth_roles(['roles' => ['MEMBER', 'OWNER', '']]));
    assert_same([], auth_roles(['roles' => ['MEMBER']]), 'MEMBER alone: an ordinary learner, no role that counts here');
    assert_same(['EDITOR'], auth_roles(['roles' => ['MEMBER', 'EDITOR']]), 'MEMBER beside a role: the role');
    assert_same(['ADMIN', 'EDITOR'], auth_roles(['roles' => ['admin', 'MEMBER', 'Editor', 'ADMIN']]));
    assert_same(['ADMIN', 'EDITOR'], ROLES_STAFF);
});

test('only the Bearer scheme claims to be somebody, with or without a token after it', function (): void {
    $kept = $_SERVER;
    try {
        foreach (['Bearer abc' => true, 'Bearer' => true, 'bearer abc' => true, '  BEARER   ' => true, "Bearer\tabc" => true,
            'Basic YWRhOnNlY3JldA==' => false, 'Bearerabc' => false, 'Token abc' => false, '' => false] as $header => $claims) {
            $_SERVER['HTTP_AUTHORIZATION'] = $header;
            assert_same($claims, auth_sent_token(), "\"$header\"");
        }
        unset($_SERVER['HTTP_AUTHORIZATION']);
        assert_false(auth_sent_token(), 'no header at all');
        $_SERVER['REDIRECT_HTTP_AUTHORIZATION'] = 'Bearer abc';
        assert_true(auth_sent_token(), 'as Apache passes it on under CGI (public/.htaccess)');
    } finally {
        $_SERVER = $kept;
    }
});

test('two people, each with their own progress, settings and resets', function (): void {
    $ada = test_token(ADA, [], ['preferred_username' => 'ada']);
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
    $file = as_user($ada, 'GET', '/api/me/data')['body'];
    assert_same([ADA], array_column($file['users'], 'id'), 'her data file: hers alone');
    assert_same(['k:大', 'k:学', 'v:大学'], ids_of($file['users'][0]['kanji']['items']), 'and her progress in it');

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
    as_user(test_token(ADA, [], ['preferred_username' => 'ada.l']), 'GET', '/api/kanji/summary');
    assert_same('ada.l', db_value('SELECT preferred_username FROM users WHERE id = ?', [ADA]), 'a new name comes with the next token');
    db_exec("UPDATE users SET last_seen_at = now() - interval '1 hour' WHERE id = ?", [ADA]);
    as_user(test_token(ADA, [], ['preferred_username' => 'ada.l']), 'GET', '/api/kanji/summary');
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

test('this computer is told more, and nothing else: a request straight to its own address, with no proxy between', function (): void {
    $here = ['REMOTE_ADDR' => '127.0.0.1', 'HTTP_HOST' => '127.0.0.1:8200'];
    assert_true(auth_from_this_computer($here));
    assert_true(auth_from_this_computer(['HTTP_HOST' => 'localhost:8200'] + $here));
    assert_true(auth_from_this_computer(['REMOTE_ADDR' => '::1', 'HTTP_HOST' => '[::1]:8200']));
    assert_true(auth_from_this_computer(['HTTP_HOST' => 'LocalHost'] + $here), 'a host name is any case, and the port may be left out');
    assert_false(auth_from_this_computer(['REMOTE_ADDR' => '192.168.1.20'] + $here), 'another device');
    assert_false(auth_from_this_computer(['HTTP_HOST' => 'academy.example.com'] + $here), 'another name: a tunnel, or a page elsewhere whose own name points here');
    assert_false(auth_from_this_computer(['HTTP_HOST' => 'localhost.example.com'] + $here));
    assert_false(auth_from_this_computer(['HTTP_HOST' => '127.0.0.1.example.com'] + $here));
    assert_false(auth_from_this_computer(['REMOTE_ADDR' => '127.0.0.1']), 'no Host at all');
    foreach (['HTTP_FORWARDED' => 'for=203.0.113.9', 'HTTP_X_FORWARDED_FOR' => '203.0.113.9', 'HTTP_X_REAL_IP' => '203.0.113.9'] as $header => $value) {
        assert_false(auth_from_this_computer([$header => $value] + $here), "$header: passed on by a proxy");
    }

    // It decides nobody's sign-in: under any name, the same answers.
    foreach (['Host: academy.example.com', 'X-Forwarded-For: 203.0.113.9'] as $header) {
        assert_same(401, call($GLOBALS['app']['base'], 'GET', '/api/kanji/summary', null, array_merge([$header], no_token()))['status'], "$header, no token");
        assert_same(200, call($GLOBALS['app']['base'], 'GET', '/api/kanji/summary', null, [$header])['status'], "$header, a token");
        $words = call($GLOBALS['app']['base'], 'GET', '/api/translations/sk', null, [$header]);
        assert_same([200, 'sk'], [$words['status'], $words['body']['language'] ?? null], "$header /api/translations/sk: the same for everybody");
    }
    // Health names the database and the backup folder to this computer, and to nobody else.
    $health = call($GLOBALS['app']['base'], 'GET', '/api/health', null, ['Host: academy.example.com']);
    assert_same(200, $health['status'], 'health still answers');
    assert_same(['ok', 'contentCurrent'], array_keys($health['body']), 'and keeps the database and the folders to itself');
    $mine = call($GLOBALS['app']['base'], 'GET', '/api/health', null, no_token())['body'];
    assert_same(['ok', 'contentCurrent', 'database', 'backups'], array_keys($mine), 'which it tells this computer: no sign-in mode, no owner');
    assert_same(db_name(), $mine['database']);
    assert_same([], server_problems($GLOBALS['app']));
});

test('signing in through the stand-in IAM: a code with PKCE, tokens the app takes, a refresh, a refusal, a sign-out', function (): void {
    $iam = stand_in_iam(['user' => ['id' => 640, 'username' => 'cleo', 'roles' => ['MEMBER', 'EDITOR']]]);
    $app = start_app(['issuer' => $iam['base']]);
    assert_same(['issuer' => $iam['base'], 'clientId' => 'japanese-academy', 'loginRequired' => true, 'visitorKeepDays' => 30], call($app['base'], 'GET', '/api/auth/config', null, no_token())['body']);
    $discovery = call($iam['base'], 'GET', '/.well-known/openid-configuration', null, no_token())['body'];
    assert_same([$iam['base'], $iam['base'] . '/api/oidc/token'], [$discovery['issuer'], $discovery['token_endpoint']]);

    $verifier = bin2hex(random_bytes(32));
    $redirect = $app['base'] . '/auth/callback';
    $authorize = static function () use ($iam, $verifier, $redirect): array {
        $r = test_page($iam['base'], '/api/oidc/authorize?' . http_build_query([
            'response_type' => 'code', 'client_id' => 'japanese-academy', 'redirect_uri' => $redirect, 'scope' => 'openid profile email',
            'state' => 'st-1', 'nonce' => 'n-1', 'code_challenge_method' => 'S256',
            'code_challenge' => rtrim(strtr(base64_encode(hash('sha256', $verifier, true)), '+/', '-_'), '='),
        ]));
        assert_same(302, $r['status'], 'authorize answers with a redirect');
        $to = (string) ($r['headers']['location'][0] ?? '');
        assert_true(str_starts_with($to, "$redirect?"), "back to the app: $to");
        parse_str((string) parse_url($to, PHP_URL_QUERY), $query);
        return $query;
    };
    $back = $authorize();
    assert_same(['st-1', $iam['base']], [$back['state'] ?? null, $back['iss'] ?? null]);
    $token = static fn (array $fields): array => test_form($iam['base'], '/api/oidc/token', $fields + ['client_id' => 'japanese-academy']);
    $wrong = $token(['grant_type' => 'authorization_code', 'code' => $back['code'], 'redirect_uri' => $redirect, 'code_verifier' => 'not-the-verifier']);
    assert_same([400, 'invalid_grant'], [$wrong['status'], $wrong['body']['error'] ?? null], 'PKCE: the verifier must match');
    $back = $authorize();
    $tokens = $token(['grant_type' => 'authorization_code', 'code' => $back['code'], 'redirect_uri' => $redirect, 'code_verifier' => $verifier]);
    assert_same(200, $tokens['status']);
    $access = (string) $tokens['body']['access_token'];

    $as = static fn (string $method, string $url, $body = null): array => call($app['base'], $method, $url, $body, test_bearer($access));
    assert_same(200, $as('GET', '/api/kanji/summary')['status'], 'the app takes the stand-in IAM’s token');
    assert_same('cleo', db_value('SELECT preferred_username FROM users WHERE id = 640'), 'and knows the person by it');
    assert_same(200, $as('GET', '/api/admin/translations')['status'], 'an editor rewords the words');
    assert_refused(403, 'admin_only', 'This is for the site\'s administrators.', $as('POST', '/api/admin/languages', ['code' => 'de', 'name' => 'German', 'nativeName' => 'Deutsch']),
        'and adds no language');

    $again = $token(['grant_type' => 'refresh_token', 'refresh_token' => $tokens['body']['refresh_token']]);
    assert_same(200, $again['status'], 'a refresh');
    assert_same(200, call($app['base'], 'GET', '/api/kanji/summary', null, test_bearer((string) $again['body']['access_token']))['status']);
    assert_same(400, $token(['grant_type' => 'refresh_token', 'refresh_token' => $tokens['body']['refresh_token']])['status'], 'a refresh token works once');

    call($iam['base'], 'POST', '/_test/state', ['deny' => true]);
    $refused = $authorize();
    assert_same(['access_denied', 'st-1'], [$refused['error'] ?? null, $refused['state'] ?? null], 'a refused sign-in comes back as such');
    assert_false(isset($refused['code']));

    $out = test_page($iam['base'], '/api/oidc/logout?' . http_build_query(['post_logout_redirect_uri' => $app['base'] . '/']));
    assert_same([302, $app['base'] . '/'], [$out['status'], $out['headers']['location'][0] ?? null], 'signed out, back to the app');
    assert_same(400, $token(['grant_type' => 'refresh_token', 'refresh_token' => $again['body']['refresh_token']])['status'], 'and the session is over');
    assert_same([], server_problems($app));
});

test('a refused token’s reason goes to the log on one line, clipped: the token chose some of its words', function (): void {
    $iam = test_iam();
    $kid = "no-such-key\r\n[auth] a token was accepted: forged\x07" . str_repeat('k', 5000);
    $token = anotoki_iam_test_sign(anotoki_iam_test_claims(['issuer' => $iam['issuer'], 'client_id' => $iam['client_id']], ADA, []), $iam['pair']['private_pem'], $kid);
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

test('the settings: required, with no defaults to fall back on; what earlier versions wrote is ignored, sign-in without the IAM is gone', function (): void {
    // a copy without auth.local.php is not set up: there is no IAM to assume
    $dir = test_server_config();
    $auth = (string) file_get_contents("$dir/auth.local.php");
    unlink("$dir/auth.local.php");
    $bare = start_app(['env' => ['ACADEMY_CONFIG_DIR' => $dir]]);
    foreach (['/api/auth/config', '/api/kanji/summary', '/api/health'] as $url) {
        $r = call($bare['base'], 'GET', $url);
        assert_same(503, $r['status'], $url);
        assert_same('not_set_up', $r['body']['code'] ?? null, $url);
    }
    assert_same('/setup.php', $r['body']['setup'] ?? null, 'the way to the setup page: this computer is never installed (what is missing, manage.php --check says)');

    $problem = static function (string $authPhp, ?string $appPhp = null) use ($dir): ?string {
        file_put_contents("$dir/auth.local.php", $authPhp);
        $appPhp === null ? @unlink("$dir/app.local.php") : file_put_contents("$dir/app.local.php", $appPhp);
        putenv("ACADEMY_CONFIG_DIR=$dir");
        try {
            config_all(true);
            return config_problem();
        } finally {
            putenv('ACADEMY_CONFIG_DIR=' . $GLOBALS['TEST_CONFIG']['dir']);
            config_all(true);
        }
    };
    $jwks = var_export(test_iam()['jwks_file'], true);
    // what the setup page of an earlier version wrote, on the owner's computer and on the website: still set up
    assert_same(null, $problem("<?php return ['mode' => 'iam', 'issuer' => 'https://iam.test', 'client_id' => 'japanese-academy', 'local_user_id' => 1, 'jwks_file' => $jwks];",
        "<?php return ['timezone' => 'Europe/Bratislava'];"), 'mode iam, an owner id and a time zone: the old keys are ignored');
    assert_same(null, $problem("<?php return ['issuer' => 'https://iam.test', 'client_id' => 'japanese-academy'];"), 'and app.local.php is no longer needed');
    assert_same('sign-in without the IAM is gone: open /setup.php and save', $problem("<?php return ['mode' => 'none', 'local_user_id' => 1];"),
        'a copy set up without sign-in is set up again');
    assert_same('sign-in without the IAM is gone: open /setup.php and save',
        $problem("<?php return ['mode' => 'none', 'issuer' => 'https://iam.test', 'client_id' => 'japanese-academy', 'local_user_id' => 1];"), 'whatever else it says');
    assert_same('the IAM\'s address (issuer) in backend/config/auth.local.php is missing', $problem("<?php return ['client_id' => 'japanese-academy'];"));
    assert_same('the client id in backend/config/auth.local.php is missing', $problem("<?php return ['issuer' => 'https://iam.test'];"));

    // and the server: an old auth.local.php serves, a mode none one does not
    file_put_contents("$dir/auth.local.php", $auth);
    file_put_contents("$dir/app.local.php", "<?php return ['timezone' => 'Pacific/Kiritimati', 'backups_dir' => " . var_export(backup_dir(), true) . '];');
    assert_same(200, call($bare['base'], 'GET', '/api/kanji/summary')['status'], 'set up, with a time zone nobody reads');
    file_put_contents("$dir/auth.local.php", "<?php return ['mode' => 'none', 'local_user_id' => 1];");
    $none = call($bare['base'], 'GET', '/api/kanji/summary', null, no_token());
    assert_same([503, 'not_set_up'], [$none['status'], $none['body']['code'] ?? null], 'no request is anybody without a token');
    assert_same(null, config_problem(), 'the test’s own settings are whole again');
});

test('the tests’ settings folder and keys file count only for a throwaway database', function (): void {
    $dir = test_server_config();
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
    assert_same('1.1.0', ANOTOKI_IAM_SDK_VERSION, 'backend/src/anotoki_iam.php: change the note in src/auth.php and docs/kb/sign-in.md with it');
    $sdk = ROOT . '/frontend/src/app/core/auth/sdk';
    assert_match("/const SDK_VERSION = '1\\.2\\.0';/", (string) file_get_contents("$sdk/anotoki-auth.mjs"),
        'frontend/src/app/core/auth/sdk/anotoki-auth.mjs: change the AuthService\'s note and docs/kb/sign-in.md with it');
    // \r?: git checks the file out with CRLF line endings where core.autocrlf is on, and $ stops before \n only.
    assert_match('/^\/\/ Types for anotoki-auth\.mjs \/ anotoki-auth\.js - v1\.2\.0\r?$/m', (string) file_get_contents("$sdk/anotoki-auth.d.ts"), 'and its types, the same version');
    assert_same([], server_problems($GLOBALS['app']), 'no PHP warnings or errors on the server');
});
