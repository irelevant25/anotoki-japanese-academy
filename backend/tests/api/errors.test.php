<?php
// What the API says when a request fails (backend/api/middleware/errors.php,
// backend/src/errors.php): the sentence, the code a page words the failure
// from, and — under PHP's built-in server only, the owner's own computer — the
// reason as "detail". The tests of the failing routes themselves (kanji, exam,
// sign-in, a migration that waits) assert their codes beside their sentences.
//
// Most of this runs in the test process, whose SAPI is cli: not the built-in
// server, so the app answers here as it does on a website. The built-in
// server's side is asked for by name, and once for real.
declare(strict_types=1);

require __DIR__ . '/../lib.php'; // before the app loads: a throwaway database and backup folder
require BACKEND . '/api/app.php'; // the HTTP side: Slim, the middleware

/** What a website's PHP calls itself: Apache's module, PHP-FPM, FastCGI, LiteSpeed — and the command line. */
const NOT_THIS_COMPUTER = ['apache2handler', 'fpm-fcgi', 'cgi-fcgi', 'litespeed', 'cli'];

/**
 * What the API answers when a route fails with $e: a Slim app with the error
 * middleware around its routing, as academy_app() has it. Without $sapi the
 * middleware is made as the app makes it, for the SAPI of this process.
 */
function answer_to(Throwable $e, ?string $sapi = null, string $method = 'GET', string $url = '/api/fails'): array
{
    $app = Slim\Factory\AppFactory::create();
    $app->get('/api/fails', static function () use ($e) {
        throw $e;
    });
    $app->addRoutingMiddleware();
    $app->add($sapi === null ? errors_middleware() : errors_middleware($sapi));
    $response = $app->handle((new Slim\Psr7\Factory\ServerRequestFactory())->createServerRequest($method, $url));
    return ['status' => $response->getStatusCode(), 'body' => json_decode((string) $response->getBody(), true), 'headers' => $response->getHeaders()];
}

// The middleware writes what it keeps from the browser to the error log: a file of this test's, not its output.
$GLOBALS['log'] = str_replace('\\', '/', (string) tempnam(sys_get_temp_dir(), 'academy-errors-'));
$GLOBALS['log_before'] = ini_get('error_log');
before(function (): void {
    ini_set('error_log', $GLOBALS['log']);
});
after(function (): void {
    ini_set('error_log', (string) $GLOBALS['log_before']);
    @unlink($GLOBALS['log']);
});

test('the reason of a failure is for the owner’s own computer: PHP’s built-in server, and nothing else', function (): void {
    assert_same('cli', PHP_SAPI, 'this process is not the built-in server: what it answers by itself is what a website answers');
    $e = new RuntimeException('the reason');
    assert_same('the reason', error_reason($e, 'cli-server'));
    assert_same(['detail' => 'the reason'], error_detail_field($e, 'cli-server'));
    assert_same(': the reason', error_detail($e, 'cli-server'));
    assert_same(null, error_reason($e), 'by itself: the SAPI of the process');
    assert_same([], error_detail_field($e));
    assert_same('. The server\'s error log says more.', error_detail($e));
    foreach (NOT_THIS_COMPUTER as $sapi) {
        assert_same(null, error_reason($e, $sapi), $sapi);
        assert_same([], error_detail_field($e, $sapi), $sapi);
        assert_same('. The server\'s error log says more.', error_detail($e, $sapi), $sapi);
    }
    // nothing of the app names the built-in server for these: only a test does
    assert_match('/\$app->add\(errors_middleware\(\)\);/', (string) file_get_contents(BACKEND . '/api/app.php'), 'the app’s middleware: for the SAPI it runs under');
    // The one exception: why an Apply failed goes to its administrator everywhere (tests/api/upkeep.test.php): the
    // anotoki library's Migrations routes answer it as PostgreSQL said it, and ask no SAPI.
    assert_match('/MigrationsRoutes::admin\(\$app, \'\/api\/admin\/migrations\'/', (string) file_get_contents(BACKEND . '/api/routes/migrations.php'), 'an Apply: the library\'s routes');
});

test('an HttpError: its sentence, its code, and a reason that reaches this computer only', function (): void {
    $plain = new HttpError(409, 'No.', [], 'some_code');
    assert_same(null, $plain->detail, 'no reason unless one is given: the fifth argument');
    assert_same([409, ['error' => 'No.', 'code' => 'some_code']], array_values(array_slice(answer_to($plain), 0, 2)));
    assert_same(['error' => 'No.', 'code' => 'some_code'], answer_to($plain, 'cli-server')['body'], 'nothing to add on this computer either');
    assert_same(['error' => 'No.'], answer_to(new HttpError(400, 'No.'))['body'], 'without a code, the sentence alone, as before');

    $why = new HttpError(503, 'It failed.', ['Retry-After: 5'], 'not_up_to_date', 'migration 009: relation "nowhere" does not exist');
    assert_same('migration 009: relation "nowhere" does not exist', $why->detail);
    $here = answer_to($why, 'cli-server');
    assert_same(503, $here['status']);
    assert_same(['error' => 'It failed.', 'code' => 'not_up_to_date', 'detail' => 'migration 009: relation "nowhere" does not exist'], $here['body'], 'this computer: the reason too');
    assert_same(['5'], $here['headers']['Retry-After'] ?? null, 'its headers, as before');
    $site = answer_to($why);
    assert_same([503, ['error' => 'It failed.', 'code' => 'not_up_to_date']], [$site['status'], $site['body']], 'a website: no "detail", whoever gave the error one');
    assert_false(array_key_exists('detail', $site['body']));
    foreach (NOT_THIS_COMPUTER as $sapi) {
        assert_same(['error' => 'It failed.', 'code' => 'not_up_to_date'], answer_to($why, $sapi)['body'], $sapi);
    }

    $role = answer_to(new HttpError(403, 'This is for the site\'s administrators.', [], 'admin_only'), 'cli-server');
    assert_same([403, ['error' => 'This is for the site\'s administrators.', 'code' => 'admin_only']], [$role['status'], $role['body']], 'a role the person lacks: as it was');
});

test('a database that cannot be reached: 503 database_unavailable, and why only on this computer', function (): void {
    $why = 'SQLSTATE[08006] [7] connection to server at "db.example" (203.0.113.7), port 5432 failed: FATAL: password authentication failed for user "academy_site"';
    $e = new PDOException($why);
    $site = answer_to($e);
    assert_same(503, $site['status']);
    assert_same(['error' => 'The database is not reachable. The server\'s error log says more.', 'code' => 'database_unavailable'], $site['body'],
        'a website: a sentence and a code — no "detail", and nothing of the user or the host');
    assert_false(array_key_exists('detail', $site['body']));
    foreach (NOT_THIS_COMPUTER as $sapi) {
        $r = answer_to($e, $sapi);
        assert_same([503, $site['body']], [$r['status'], $r['body']], $sapi);
        assert_no_match('/db\.example|academy_site|SQLSTATE/', json_text($r['body']), $sapi);
    }
    $here = answer_to($e, 'cli-server');
    assert_same(503, $here['status']);
    assert_same(['error' => "The database is not reachable: $why", 'code' => 'database_unavailable', 'detail' => $why], $here['body'],
        'this computer: the sentence as it always was, and the reason by itself');
    assert_true(str_contains((string) file_get_contents($GLOBALS['log']), "[db] $why"), 'the error log has the reason, wherever it runs');
});

test('anything else that goes wrong: 500 server_error, and what only on this computer', function (): void {
    $e = new LogicException('Undefined array key "stage"');
    $site = answer_to($e);
    assert_same(500, $site['status']);
    assert_same(['error' => 'Something went wrong on the server.', 'code' => 'server_error'], $site['body'], 'a website: a sentence and a code, no "detail"');
    assert_false(array_key_exists('detail', $site['body']));
    foreach (NOT_THIS_COMPUTER as $sapi) {
        $r = answer_to($e, $sapi);
        assert_same([500, $site['body']], [$r['status'], $r['body']], $sapi);
    }
    $here = answer_to($e, 'cli-server');
    assert_same(500, $here['status']);
    assert_same(['error' => 'Undefined array key "stage"', 'code' => 'server_error', 'detail' => 'Undefined array key "stage"'], $here['body'],
        'this computer: the message, as it always was, and once more as the reason');
    assert_match('/\[server\] Undefined array key "stage" @ .*errors\.test\.php:\d+/', (string) file_get_contents($GLOBALS['log']), 'the error log says where, too');
    // an Error is no Exception, and is answered all the same
    assert_same(['error' => 'Something went wrong on the server.', 'code' => 'server_error'], answer_to(new TypeError('not an int'))['body']);
});

test('a migration waiting for an administrator: the anotoki library’s 503 update_pending, the same everywhere - no file named, nothing to log - through the app’s own headers', function (): void {
    // 006 taken for not applied (no test writes into backend/migrations): a whole migration that waits.
    test_db();
    $name = '006_admin_panel_words.sql';
    $when = db_value('SELECT applied_at FROM migrations WHERE name = ?', [$name]);
    db_exec('DELETE FROM migrations WHERE name = ?', [$name]);
    try {
        $response = academy_app()->handle((new Slim\Psr7\Factory\ServerRequestFactory())->createServerRequest('GET', '/api/kanji/summary'));
    } finally {
        db_exec('INSERT INTO migrations (name, applied_at) VALUES (?, ?)', [$name, $when]);
    }
    assert_same(503, $response->getStatusCode());
    assert_same(['code' => 'update_pending', 'message' => 'The site is being updated. Try again in a few minutes.'], json_decode((string) $response->getBody(), true));
    assert_same(['60', 'no-store', 'nosniff', "default-src 'none'; frame-ancestors 'none'"], [$response->getHeaderLine('Retry-After'), $response->getHeaderLine('Cache-Control'),
        $response->getHeaderLine('X-Content-Type-Options'), $response->getHeaderLine('Content-Security-Policy')], 'asked again in a minute, never kept; the security headers as on every answer');
    assert_false(str_contains((string) file_get_contents($GLOBALS['log']), $name), 'and the log says nothing of it');
});

test('an unknown address and a wrong method keep their codes', function (): void {
    $e = new RuntimeException('never thrown');
    $r = answer_to($e, null, 'GET', '/api/nothing');
    assert_same([404, ['error' => 'Not found', 'code' => 'not_found']], [$r['status'], $r['body']]);
    $r = answer_to($e, null, 'POST');
    assert_same([405, ['error' => 'Method not allowed', 'code' => 'method_not_allowed'], ['GET']], [$r['status'], $r['body'], $r['headers']['Allow'] ?? null]);
});

test('for real, on this computer: a server whose database is not there says why, in the sentence and as "detail"', function (): void {
    // Settings of their own: this file's database, at a port of this computer where nothing listens.
    $dir = test_server_config();
    file_put_contents("$dir/database.local.php", '<?php return ' . var_export(['name' => db_name(), 'host' => '127.0.0.1', 'port' => test_free_port()], true)
        . ' + (require ' . var_export(test_config_server_file(), true) . ');');
    $app = start_app(['env' => ['ACADEMY_CONFIG_DIR' => $dir]]);
    $r = call($app['base'], 'GET', '/api/kanji/summary');
    assert_same(503, $r['status']);
    assert_same('database_unavailable', $r['body']['code'] ?? null, 'the code a page words it from');
    assert_true(is_string($r['body']['detail'] ?? null) && $r['body']['detail'] !== '', 'under the built-in server, straight from the app: the reason');
    assert_same('The database is not reachable: ' . $r['body']['detail'], $r['body']['error'] ?? null, 'and the sentence, as it always was');
    assert_same(['error', 'code', 'detail'], array_keys($r['body']));
    assert_true(count(server_problems($app)) > 0, 'its log has it too');
    // Where the site stands: unavailable (the settings are there; the database does not answer) - which the pages say
    // in the anotoki library's words, asking again by themselves. Never the setup page.
    assert_same([200, ['state' => 'unavailable', 'installed' => false]], array_values(array_slice(call($app['base'], 'GET', '/api/site-status', null, no_token()), 0, 2)));
});
