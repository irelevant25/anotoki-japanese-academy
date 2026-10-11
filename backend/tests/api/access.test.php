<?php
// Whether this site requires sign-in (src/access.php): the IAM's answer, read
// by the anotoki library's SignInRule from its stand-in IAM or from the test's
// own file (test_access()), relayed by GET /api/auth/config as login_required
// - and true while the database cannot keep visitors, and whenever nothing
// better is known. No real IAM is asked.
declare(strict_types=1);

require __DIR__ . '/../lib.php'; // before the app loads: a throwaway database and backup folder

/** What GET /api/auth/config of $app relays. */
function relayed(array $app): ?bool
{
    $r = call($app['base'], 'GET', '/api/auth/config', null, no_token());
    assert_same(200, $r['status'], $r['raw']);
    return $r['body']['login_required'] ?? null;
}

/** access_login_required() in this process, as a new request asks it: the rule's answer is one per request. */
function asked_now(?string &$reason = null): bool
{
    academy_sign_in_rule()->reset();
    return access_login_required($reason);
}

/** The stand-in IAM's state, after $changes (POST /_test/state merges them). */
function iam_state(array $iam, ?array $changes = null): array
{
    return call($iam['base'], $changes === null ? 'GET' : 'POST', '/_test/state', $changes, no_token())['body'];
}

/** How often the stand-in IAM was asked about this site so far. */
function asked(array $iam): int
{
    return count(array_filter(iam_state($iam)['log'], static fn (string $l): bool => $l === 'GET /api/public/applications/japanese-academy'));
}

/** What migration 007 adds, as far as visitors_ready() looks: from now on this file's database can keep visitors (again). */
function visitors_column(): void
{
    db_exec('ALTER TABLE users ADD COLUMN IF NOT EXISTS visitor_key_hash char(64)');
}

/** A database whose migration 007 waits (the tests' template has it): without what visitors_ready() looks for. */
function no_visitors_column(): void
{
    db_exec('ALTER TABLE users DROP COLUMN IF EXISTS visitor_key_hash CASCADE');
}

/** A little over a second: an answer kept for application_ttl 1 is old after it. */
function past_a_second(): void
{
    usleep(1_100_000);
}

test('the stand-in IAM answers the public application route: the switch, an unknown application, down, its cache header', function (): void {
    $iam = stand_in_iam();
    $url = '/api/public/applications/japanese-academy';
    $answer = call($iam['base'], 'GET', $url, null, no_token());
    assert_same(200, $answer['status'], 'answered');
    assert_same(['client_id' => 'japanese-academy', 'name' => 'Test site', 'login_required' => true], $answer['body'], 'the default: sign-in required');
    assert_same('public, max-age=60', $answer['headers']['cache-control'] ?? null, 'cacheable for a minute, as the IAM\'s');
    assert_same(['MEMBER'], iam_state($iam)['user']['roles'], 'its default person holds MEMBER, as every account does');
    iam_state($iam, ['login_required' => false]);
    assert_same(false, call($iam['base'], 'GET', $url, null, no_token())['body']['login_required'], 'switched off');
    assert_same('other-site', call($iam['base'], 'GET', '/api/public/applications/other-site', null, no_token())['body']['client_id'] ?? null, 'any client id');
    iam_state($iam, ['application_missing' => true]);
    assert_same([404, 'not_found'], [call($iam['base'], 'GET', $url, null, no_token())['status'], call($iam['base'], 'GET', $url, null, no_token())['body']['error'] ?? null],
        'an unknown or switched-off application');
    iam_state($iam, ['application_missing' => false, 'down' => true]);
    assert_same(503, call($iam['base'], 'GET', $url, null, no_token())['status'], 'the IAM out of reach');
    assert_same(5, asked($iam), 'every ask is in its log');
});

test('while the database cannot keep visitors, sign-in is required whatever the IAM says; the database is asked only when the IAM says no', function (): void {
    test_db();
    no_visitors_column();
    $iam = stand_in_iam(['login_required' => false]);
    $app = start_app(['issuer' => $iam['base']]);
    assert_same(true, relayed($app), 'the IAM would let visitors in; this database cannot keep them (no migration 007)');
    assert_same(1, asked($iam), 'the IAM was asked');
    test_access(false);
    $file = start_app();
    assert_same(true, relayed($file), 'the same with the IAM\'s answer from a file');

    // The study addresses follow it: a person studies; nobody, and a visitor's key, are asked to sign in -
    // 401 sign_in_required (which the browser keeps its key on), never 503, and nothing is made.
    $users = (int) db_value('SELECT count(*) FROM users');
    assert_same(200, call($file['base'], 'GET', '/api/kanji/summary')['status'], 'a signed-in person studies as ever');
    $key = str_repeat('k', 43);
    foreach ([['GET', '/api/kanji/summary', null, []], ['POST', '/api/kanji/learn', ['id' => 'k:一'], []], ['GET', '/api/kanji/summary', null, ["X-Visitor-Key: $key"]],
        ['POST', '/api/kanji/learn', ['id' => 'k:一'], ["X-Visitor-Key: $key"]]] as [$method, $url, $body, $headers]) {
        $r = call($file['base'], $method, $url, $body, array_merge(no_token(), $headers));
        assert_same([401, 'sign_in_required'], [$r['status'], $r['body']['code'] ?? null], "$method $url " . ($headers ? 'with a key' : 'by nobody'));
        assert_same(null, $r['headers']['x-visitor-key'] ?? null, 'no key handed out');
    }
    assert_same($users, (int) db_value('SELECT count(*) FROM users'), 'nobody was made');
    $move = call($file['base'], 'POST', '/api/visitor/move', null, ["X-Visitor-Key: $key"]);
    assert_same([503, 'visitors_unavailable', '60'], [$move['status'], $move['body']['code'] ?? null, $move['headers']['retry-after'] ?? null],
        'the move (a token and a key, whatever the switch) says the database is not ready');
    assert_same([], server_problems($file));

    assert_same(true, asked_now($reason), 'and in this process');
    assert_same('visitors_not_ready', $reason, 'because of the database');
    assert_false(visitors_ready());
    test_access(true);
    assert_same(true, asked_now($reason));
    assert_same('read', $reason, 'the IAM requires sign-in: that is the answer, and the database is not asked');
    test_access(null);
    assert_same(true, asked_now($reason));
    assert_same('never_read', $reason, 'the IAM out of reach, never read: required (fail closed)');
    assert_same([], server_problems($app));
});

test('the database ready, the IAM\'s answer is relayed: off, on, a 404, kept for a minute, asked once a minute, the last value while it is away', function (): void {
    visitors_column();
    $iam = stand_in_iam(['login_required' => false]);
    $app = start_app(['issuer' => $iam['base']]);
    assert_same(false, relayed($app), 'the IAM says no sign-in is needed');
    assert_same(false, relayed($app), 'and again');
    assert_same(1, asked($iam), 'asked once: the answer is kept (application_ttl, a minute)');
    iam_state($iam, ['login_required' => true]);
    assert_same(false, relayed($app), 'switched on at the IAM: this site follows within the minute, not at once');
    assert_same(1, asked($iam));

    // A server of its own (its own cache folder) that keeps the answer for a second only.
    $quick = start_app(['issuer' => $iam['base'], 'auth' => ['application_ttl' => 1]]);
    assert_same(true, relayed($quick), 'read fresh: on');
    assert_same(2, asked($iam));
    iam_state($iam, ['login_required' => false]);
    past_a_second();
    assert_same(false, relayed($quick), 'off again, a second later');
    iam_state($iam, ['application_missing' => true]);
    past_a_second();
    assert_same(true, relayed($quick), 'a 404 (an IAM without the switch yet, or the application unknown or switched off there): required');
    iam_state($iam, ['application_missing' => false]);
    past_a_second();
    assert_same(false, relayed($quick), 'known again: off');
    $before = asked($iam);
    iam_state($iam, ['down' => true]);
    past_a_second();
    assert_same(false, relayed($quick), 'the IAM out of reach: the last value read stands');
    assert_same($before + 1, asked($iam), 'one ask while it was away');

    // Backing off after a failed ask lasts the ttl, counted in whole seconds (the SDK's time()): with a ttl of 1 it may
    // end at the very next tick of the clock, so this part keeps the answer for 3 seconds - two relays in a row are
    // well inside that however slow the machine.
    $fresh = start_app(['issuer' => $iam['base'], 'auth' => ['application_ttl' => 3]]);
    $before = asked($iam);
    assert_same(true, relayed($fresh), 'nothing ever read and the IAM out of reach: sign-in required (fail closed)');
    assert_same(true, relayed($fresh), 'and again');
    assert_same($before + 1, asked($iam), 'the IAM is not asked again at once: one ask, then it backs off');
    iam_state($iam, ['down' => false]);
    foreach ([$app, $quick, $fresh] as $server) {
        assert_same([], server_problems($server));
    }
});

test('the test\'s own file stands for the IAM: off, on, nothing at all, an answer that is not one', function (): void {
    visitors_column();
    $app = start_app();
    test_access(false);
    assert_same(false, relayed($app), 'off');
    test_access(true);
    assert_same(true, relayed($app), 'on: read on every request, nothing kept');
    test_access(null);
    assert_same(true, relayed($app), 'no answer, never one before: required');
    foreach (['not json' => 'not json', 'another site\'s answer' => '{"client_id": "genshin", "login_required": false}',
        'a login_required that is no boolean' => '{"client_id": "japanese-academy", "login_required": "false"}'] as $what => $body) {
        file_put_contents($GLOBALS['TEST_CONFIG']['application'], $body);
        assert_same(true, relayed($app), "$what: no answer, so required");
    }
    test_access(null);
    assert_same([], server_problems($app));
});

test('the seams count for a throwaway database only: a real one asks its IAM and keeps the answer in backend/storage/cache', function (): void {
    $seams = ['application_file' => $GLOBALS['TEST_CONFIG']['application'], 'application_ttl' => 1, 'cache_dir' => sys_get_temp_dir()];
    try {
        config_overrides(['auth' => $seams]);
        $config = auth_iam_config();
        assert_same($seams['application_file'], $config['application_file'] ?? null, 'a test database: the IAM\'s answer from the file of its settings');
        assert_same(1, $config['application_ttl'] ?? null);
        assert_same($seams['cache_dir'], $config['cache_dir']);
        config_overrides(['db' => ['name' => 'japanese_academy'], 'auth' => $seams]);
        $config = auth_iam_config();
        assert_false(isset($config['application_file']), 'any other database: never a file - the SDK asks the IAM');
        assert_false(isset($config['application_ttl']), 'kept for the SDK\'s minute');
        assert_same(BACKEND . '/storage/cache', $config['cache_dir'], 'in the app\'s own folder, never one a setting names');
    } finally {
        config_overrides([]);
    }
    assert_same('/tmp/answer.json', (static function (): ?string {
        putenv('ACADEMY_APPLICATION_FILE=/tmp/answer.json');
        try {
            return config_env_application('academy_test_x');
        } finally {
            putenv('ACADEMY_APPLICATION_FILE');
        }
    })(), 'the environment\'s file (a built site of the tests) for a test database');
    putenv('ACADEMY_APPLICATION_FILE=/tmp/answer.json');
    try {
        assert_same(null, config_env_application('japanese_academy'), 'never for any other');
        assert_same(null, config_env_application('academy_test_template'), 'nor the template');
    } finally {
        putenv('ACADEMY_APPLICATION_FILE');
    }
});
