<?php
// Where the site stands, and what it answers then (the anotoki library's
// SiteState and SiteGate, backend/api/app.php), on the real server against a
// database of this file's own that starts empty - the farthest a site can be
// behind its files: every migration waits. An administrator signs in and
// applies them all on the Migrations page, whose check reads the token alone
// (there is no table yet to look anybody up in); everybody else is told the
// site is being updated, by every address but the few that stay open; then
// the site is ready. (A site never set up, and one set up once and its
// settings gone: tests/api/deploy.test.php and setup.test.php; a database out
// of reach: tests/api/errors.test.php.)
declare(strict_types=1);

require __DIR__ . '/../lib.php'; // before the app loads: a throwaway database and backup folder

const ADMIN = 4201;
const LEARNER = 4101;

before(function (): void {
    test_db_empty();
    $GLOBALS['app'] = start_app();
});

function app_call(string $method, string $url, ?int $as = null, array $roles = []): array
{
    return call($GLOBALS['app']['base'], $method, $url, null, $as === null ? no_token() : test_bearer(test_token($as, $roles)));
}

/**
 * Where the site stands is $state, said to anybody: whatever the IAM says
 * about signing in here (required, not required, no answer - which this site
 * takes for required), and whatever a browser sends with it (nothing, a
 * visitor key nobody knows, a token that is no good, one that ran out). The
 * site's own sign-in gate (learner_middleware(), person_middleware()) never
 * stands in front of it: a 401 there would read as "not available" to the
 * library's pages, and an administrator who is signed out would never be
 * offered the way in.
 */
function assert_status_to_anybody(string $state): void
{
    $sent = [
        'nobody' => no_token(),
        'a visitor key nobody knows' => array_merge(no_token(), ['X-Visitor-Key: ' . str_repeat('k', 43)]),
        'a token that is no good' => test_bearer('not.a.token'),
        'a token that ran out' => test_bearer(test_token(LEARNER, [], ['exp' => time() - 3600])),
    ];
    try {
        foreach (['required' => true, 'not required' => false, 'unknown (the IAM out of reach)' => null] as $iam => $required) {
            test_access($required);
            foreach ($sent as $what => $headers) {
                $r = call($GLOBALS['app']['base'], 'GET', '/api/site-status', null, $headers);
                assert_same([200, ['state' => $state, 'installed' => false], 'no-store'], [$r['status'], $r['body'], $r['headers']['cache-control'] ?? null],
                    "sign-in $iam, $what");
            }
        }
    } finally {
        test_access(null);
    }
}

test('an empty database: an update waits - where the site stands says so, to anybody', function (): void {
    assert_same([200, ['state' => 'update_pending', 'installed' => false]], array_values(array_slice(app_call('GET', '/api/site-status'), 0, 2)));
    assert_same(null, db_value("SELECT to_regclass('migrations')"), 'asking makes nothing');
});

test('while it waits, where the site stands is answered whatever the IAM says about signing in, and whatever the browser sends', function (): void {
    assert_status_to_anybody('update_pending');
    assert_same([], server_problems($GLOBALS['app']), 'and nothing of it is a problem in the log');
});

test('every address but the open ones: 503 update_pending, Retry-After 60 - to a visitor, a learner and an administrator alike', function (): void {
    $pending = ['code' => 'update_pending', 'message' => 'The site is being updated. Try again in a few minutes.'];
    $closed = ['GET /api/kanji/summary', 'GET /api/meta', 'POST /api/exam', 'GET /report/x', 'GET /api/me/data', 'GET /api/admin/languages',
        'GET /api/admin/people', 'GET /api/translations', 'GET /api/translations/en/more', 'GET /api/admin/migrationsx', 'GET /api/nothing', 'GET /api/healthz'];
    foreach ($closed as $route) {
        [$method, $url] = explode(' ', $route);
        foreach (['nobody' => [null, []], 'a learner' => [LEARNER, []], 'an administrator' => [ADMIN, ['ADMIN']]] as $who => [$id, $roles]) {
            $r = app_call($method, $url, $id, $roles);
            assert_same([503, $pending, '60'], [$r['status'], $r['body'], $r['headers']['retry-after'] ?? null], "$route, $who");
        }
    }
    // The open ones answer as they would (the words not there yet: 004 waits too; the clip: there is no such one).
    assert_same(200, app_call('GET', '/api/auth/config')['status'], 'how to sign in');
    assert_same([503, 'not_up_to_date'], [app_call('GET', '/api/translations/en')['status'], app_call('GET', '/api/translations/en')['body']['code'] ?? null],
        'the words: none yet, said so as the app\'s own answer (the page shows the library\'s, in its own words)');
    assert_same([200, false], [app_call('GET', '/api/health')['status'], app_call('GET', '/api/health')['body']['contentCurrent'] ?? null], 'the health check: no content yet');
    assert_same(404, app_call('GET', '/audio/nothing.mp3')['status'], 'the clips pass');
    assert_same([], server_problems($GLOBALS['app']), 'and nothing of it is a problem in the log');
});

/**
 * A GET of $path exactly as written - curl resolves "/../" itself unless told
 * not to, and then the server would never see the crafted path the test means.
 */
function raw_get(string $path, array $headers): array
{
    $ch = curl_init($GLOBALS['app']['base'] . $path);
    $responseHeaders = [];
    curl_setopt_array($ch, [
        CURLOPT_RETURNTRANSFER => true,
        CURLOPT_PATH_AS_IS => true,
        CURLOPT_HTTPHEADER => $headers,
        CURLOPT_TIMEOUT => 60,
        CURLOPT_HEADERFUNCTION => static function ($ch, string $line) use (&$responseHeaders): int {
            if (str_contains($line, ':')) {
                [$k, $v] = explode(':', $line, 2);
                $responseHeaders[strtolower(trim($k))] = trim($v);
            }
            return strlen($line);
        },
    ]);
    $raw = curl_exec($ch);
    if ($raw === false) {
        throw new RuntimeException("GET $path: " . curl_error($ch));
    }
    return ['status' => (int) curl_getinfo($ch, CURLINFO_RESPONSE_CODE), 'body' => json_decode((string) $raw, true), 'headers' => $responseHeaders];
}

test('while it waits, a crafted path is not an open one: dot segments, %2e%2e, %2F, a trailing newline - 503 like any other address, to an administrator too', function (): void {
    $pending = ['code' => 'update_pending', 'message' => 'The site is being updated. Try again in a few minutes.'];
    $crafted = [
        '/api/admin/migrations/../x', '/api/admin/migrations/../../kanji/summary', '/api/admin/migrations/%2e%2e/x',
        '/api/admin/migrations/%2E%2E/%2e%2e/kanji/summary', '/api/admin/migrations%2F..%2F..%2Fkanji%2Fsummary',
        '/api/admin/migrations/file/../apply', '/api/admin/migrations/x', '/api/admin/migrations/apply%0A', '/api/admin/migrations%0A',
        '/api/translations/en/../../kanji/summary', '/api/translations/%2e%2e%2Fkanji%2Fsummary',
        '/audio/../api/kanji/summary', '/audio/%2e%2e%2Fapi%2Fkanji%2Fsummary', '/api/auth/config/../../kanji/summary',
        '/api/health/%2e%2e/kanji/summary', '/api/health%0A',
    ];
    foreach ($crafted as $path) {
        foreach (['nobody' => no_token(), 'an administrator' => test_bearer(test_token(ADMIN, ['ADMIN']))] as $who => $headers) {
            $r = raw_get($path, $headers);
            assert_same([503, $pending, '60'], [$r['status'], $r['body'], $r['headers']['retry-after'] ?? null], "$path, $who");
        }
    }
    // One segment after /api/translations/ reaches the words' route alone, whatever it holds, and that route judges
    // it: here "no words yet" (004 waits too), never another route's answer.
    $r = raw_get('/api/translations/en%0A', no_token());
    assert_same([503, 'not_up_to_date'], [$r['status'], $r['body']['code'] ?? null], 'the words’ route’s own answer');
    // The Migrations page's own three answer as ever (Apply: the next test), with a trailing slash too (dropped before the gate).
    $admin = test_bearer(test_token(ADMIN, ['ADMIN']));
    assert_same(200, raw_get('/api/admin/migrations', $admin)['status'], 'the list');
    assert_same(200, raw_get('/api/admin/migrations/', $admin)['status'], 'the list, with a trailing slash');
    assert_same([200, '001_init.sql'], [raw_get('/api/admin/migrations/file?set=academy&name=001_init.sql', $admin)['status'],
        raw_get('/api/admin/migrations/file?set=academy&name=001_init.sql', $admin)['body']['name'] ?? null], 'a file’s SQL');
    assert_same(null, db_value("SELECT to_regclass('migrations')"), 'and nothing applied by any of it');
    assert_same([], server_problems($GLOBALS['app']), 'nor anything in the log');
});

test('the Migrations page: an administrator’s, read from the token alone - and its Apply builds the database from nothing', function (): void {
    foreach (['GET /api/admin/migrations', 'POST /api/admin/migrations/apply'] as $route) {
        [$method, $url] = explode(' ', $route);
        assert_same([401, 'sign_in_required'], [app_call($method, $url)['status'], app_call($method, $url)['body']['code'] ?? null], "$route: nobody");
        $r = app_call($method, $url, LEARNER);
        assert_same([403, 'staff_only'], [$r['status'], $r['body']['code'] ?? null], "$route: a learner");
        $r = app_call($method, $url, 4202, ['EDITOR']);
        assert_same([403, 'admin_only'], [$r['status'], $r['body']['code'] ?? null], "$route: an editor");
    }
    assert_same(null, db_value("SELECT to_regclass('migrations')"), 'still nothing: asking who it is wrote no row');

    $files = array_map('basename', glob(MIGRATIONS_DIR . '/*.sql') ?: []);
    sort($files);
    $list = app_call('GET', '/api/admin/migrations', ADMIN, ['ADMIN']);
    assert_same(200, $list['status']);
    assert_same([[MIGRATION_SET], [], []], [$list['body']['sets'], $list['body']['applied'], $list['body']['missing']]);
    assert_same($files, array_column($list['body']['pending'], 'name'), 'every file waits');
    assert_same([true], array_values(array_unique(array_column($list['body']['pending'], 'ready'))), 'and may run');

    $r = app_call('POST', '/api/admin/migrations/apply', ADMIN, ['ADMIN']);
    assert_same(200, $r['status']);
    assert_same(['applied' => array_map(static fn (string $f): array => ['set' => MIGRATION_SET, 'name' => $f], $files), 'failed' => null, 'error' => null, 'note' => null],
        $r['body'], 'every one, in order; nothing to copy first, as nobody has data here');
    assert_same([200, ['state' => 'ready', 'installed' => false]], array_values(array_slice(app_call('GET', '/api/site-status'), 0, 2)), 'then ready');
    $r = app_call('GET', '/api/kanji/summary', LEARNER);
    assert_same(200, $r['status'], 'the site is back: the content built by the first request that needs it');
    assert_true(app_call('GET', '/api/health')['body']['contentCurrent'] ?? false);
    assert_same([], server_problems($GLOBALS['app']));
});

test('ready, with sign-in required here and nobody signed in: the study addresses say so, and where the site stands is still answered, whatever the browser sends', function (): void {
    test_access(true);
    try {
        $r = app_call('GET', '/api/kanji/summary');
        assert_same([401, 'sign_in_required'], [$r['status'], $r['body']['code'] ?? null], 'the site\'s own sign-in gate, on its own addresses');
    } finally {
        test_access(null);
    }
    assert_status_to_anybody('ready');
    assert_same([], server_problems($GLOBALS['app']));
});
