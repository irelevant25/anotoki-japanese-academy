<?php
// The setup page on the owner's own computer: a copy of the app (the upload
// built into a temp folder, served by PHP's built-in server) opened from this
// computer, as the launcher opens it. No token, but a nonce the page's own
// form echoes; it stays and can be run again, never showing the password; it
// offers sign-in off. And the owner's computer after the move to backend/ +
// frontend/: the settings of the version before (src/config.local.php) are
// carried over, and a database in the shape of migration 001, with the
// owner's data, is copied raw, migrated, and becomes their IAM user id's.
// The "Test connection" buttons are tried against the database and a
// stand-in IAM. (A website's setup, with its token, is tests/api/deploy.test.php's.)
declare(strict_types=1);

require __DIR__ . '/../lib.php'; // before the app loads: a throwaway database and backup folder

$GLOBALS['site'] = null;

function site(): array
{
    return $GLOBALS['site'];
}

/** The cookie jar of the owner's browser. */
function jar(): string
{
    return $GLOBALS['jar'] ??= (string) tempnam(sys_get_temp_dir(), 'academy-test-cookies-');
}

/** The page's nonce, as its form carries it. */
function nonce_of(string $html): string
{
    preg_match('/name="nonce" value="([0-9a-f]{32})"/', $html, $m);
    return $m[1] ?? '';
}

/** The setup page's form as the owner sends it; $change replaces fields. */
function local_form(string $nonce, array $change = []): array
{
    return $change + [
        'nonce' => $nonce,
        'db_host' => (string) config('db.host'),
        'db_port' => (string) config('db.port'),
        'db_name' => db_name(),
        'db_user' => site()['role'],
        'db_password' => '', // the earlier version's, carried over
        'auth_mode' => 'none',
        'issuer' => 'http://localhost:4300',
        'client_id' => 'japanese-academy',
        'user_id' => '1',
        'timezone' => 'Europe/Bratislava',
        'action' => 'install',
    ];
}

/** The owner's rows as JSON, per table, without the user id (as tests/api/migration.test.php compares them). */
function owner_rows(PDO $pdo): array
{
    $order = ['srs_progress' => 'item_id', 'srs_daily' => 'day', 'srs_log' => 'id', 'exam_attempts' => 'id'];
    $out = [];
    foreach ($order as $table => $by) {
        $out[$table] = array_column($pdo->query("SELECT (to_jsonb(t) - 'user_id')::text AS r FROM $table t ORDER BY t.$by")->fetchAll(PDO::FETCH_ASSOC), 'r');
    }
    return $out;
}

before(function (): void {
    $GLOBALS['site'] = test_site();
});

test('before it is set up, the API says so, and to this computer why', function (): void {
    $r = call(site()['base'], 'GET', '/api/kanji/summary');
    assert_same(503, $r['status']);
    assert_same('not_set_up', $r['body']['code'] ?? null);
    assert_same('/setup.php', $r['body']['setup'] ?? null);
    assert_same('backend/config/database.local.php is missing', $r['body']['reason'] ?? null);
});

// The owner's computer before the update: the settings of the version before, and a
// database as migration 001 left it, with the owner's study data — made by the
// site's own user, as the owner's PostgreSQL user made it back then.
test('the earlier version’s computer: its settings and its database, as they were', function (): void {
    @mkdir(site()['dir'] . '/src', 0777, true);
    file_put_contents(site()['dir'] . '/src/config.local.php', "<?php\n// These settings were written by setup.php. Git ignores this file: never commit it.\n\nreturn "
        . var_export(['db' => ['host' => (string) config('db.host'), 'port' => (int) config('db.port'), 'name' => db_name(),
            'user' => site()['role'], 'password' => site()['password']], 'auth' => ['mode' => 'none']], true) . ";\n");
    $pdo = new PDO(sprintf('pgsql:host=%s;port=%d;dbname=%s', config('db.host'), config('db.port'), db_name()), site()['role'], site()['password'],
        [PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION]);
    $pdo->exec('CREATE TABLE migrations (name text PRIMARY KEY, applied_at timestamptz NOT NULL DEFAULT now())');
    $pdo->exec((string) file_get_contents(MIGRATIONS_DIR . '/001_init.sql'));
    $pdo->exec("INSERT INTO migrations (name) VALUES ('001_init.sql')");
    $pdo->exec("INSERT INTO srs_progress (item_id, stage, learned_at, next_review, meaning_correct, synonyms, extra_readings, meaning_note)
                VALUES ('k:大', 4, '2026-09-23 10:05+02', '2026-09-26 10:00+02', 5, '[\"large\"]', '[]', 'arms spread — BIG')");
    $pdo->exec("INSERT INTO srs_daily (day, lessons, reviews, reviews_correct) VALUES ('2026-09-23', 2, 0, 0)");
    $pdo->exec("INSERT INTO srs_log (at, kind, item_id, details) VALUES ('2026-09-23 10:05+02', 'lesson', 'k:大', '{}')");
    $pdo->exec("INSERT INTO exam_attempts (id, started_at, finished_at, candidate, seed, total, right_count, pct, grade, passed, attempt, report) VALUES
                ('2026-09-22T11-09-21-059Z-exam-1', NULL, '2026-09-22 13:09+02', 'irelevant', 'exam-1', 38, 14, 36.8, 'F', false,
                 '{\"id\":\"2026-09-22T11-09-21-059Z-exam-1\"}', '<!doctype html><title>the first report</title>')");
    $GLOBALS['before'] = owner_rows($pdo);
    assert_same(1, count($GLOBALS['before']['srs_progress']));
});

test('from this computer: no token, the earlier settings offered, sign-in off offered', function (): void {
    $page = test_page(site()['base'], '/setup.php', [], jar());
    assert_same(200, $page['status']);
    assert_match('/Set up Japanese Academy/', $page['raw']);
    assert_no_match('/name="token"/', $page['raw'], 'no token on this computer');
    assert_false(is_file(site()['dir'] . '/backend/config/setup-token.local.php'), 'nor a token file');
    assert_match('/HttpOnly/i', implode(' ', $page['headers']['set-cookie'] ?? []), 'the nonce, in a cookie scripts cannot read');
    assert_match('/SameSite=Strict/i', implode(' ', $page['headers']['set-cookie'] ?? []), 'which no other site’s page sends');
    assert_match('/value="none" checked/', $page['raw'], 'sign-in off, as the earlier version was');
    assert_match('/The settings of the earlier version \(<code>src\/config\.local\.php<\/code>\) are filled in/', $page['raw']);
    assert_match('/name="db_name" type="text" value="' . db_name() . '"/', $page['raw']);
    assert_false(str_contains($page['raw'], site()['password']), 'its password is never shown');
    assert_match("/script-src 'nonce-/", implode(' ', $page['headers']['content-security-policy'] ?? []), 'nothing but its own script runs');
    // under no-referrer a browser would send the page's own form with "Origin: null", which is refused
    assert_same(['same-origin'], $page['headers']['referrer-policy'] ?? null, 'its own form says where it comes from');
    $GLOBALS['nonce'] = nonce_of($page['raw']);
    assert_same(32, strlen($GLOBALS['nonce']));
});

test('a form that did not come from the page itself is refused', function (): void {
    $r = test_form(site()['base'], '/setup.php', local_form('0123456789abcdef0123456789abcdef'), [], jar());
    assert_match('/This form did not come from this page/', $r['raw'], 'a wrong nonce');
    $r = test_form(site()['base'], '/setup.php', local_form($GLOBALS['nonce']), []); // no cookie: another site's page
    assert_match('/This form did not come from this page/', $r['raw'], 'no cookie');
    $r = test_form(site()['base'], '/setup.php', local_form($GLOBALS['nonce']), ['Origin: http://evil.example'], jar());
    assert_match('/This form did not come from this page/', $r['raw'], 'another origin');
    $r = test_form(site()['base'], '/setup.php', local_form($GLOBALS['nonce']), ['Origin: null'], jar());
    assert_match('/This form did not come from this page/', $r['raw'], 'a page that hides where it is');
    $r = test_form(site()['base'], '/setup.php', local_form($GLOBALS['nonce'], ['action' => 'test-db']), ['Origin: http://evil.example'], jar());
    assert_same(false, $r['body']['ok'] ?? null, 'the buttons too');
    $listed = local_form($GLOBALS['nonce']);
    unset($listed['nonce']);
    $r = test_form(site()['base'], '/setup.php', $listed + ['nonce[]' => $GLOBALS['nonce']], [], jar());
    assert_same(200, $r['status'], 'a nonce sent as a list: no 500');
    assert_match('/This form did not come from this page/', $r['raw'], 'and refused');
    assert_same([], glob(site()['dir'] . '/backend/config/*.local.php') ?: [], 'nothing written');
    // A request that names another host is a website's: the token again.
    $page = test_page(site()['base'], '/setup.php', ['Host: academy.example.test']);
    assert_match('/name="token"/', $page['raw']);
    assert_true(is_file(site()['dir'] . '/backend/config/setup-token.local.php'));
    unlink(site()['dir'] . '/backend/config/setup-token.local.php');
});

test('Test connection: the database, with the earlier password, and an IAM', function (): void {
    $r = test_form(site()['base'], '/setup.php', local_form($GLOBALS['nonce'], ['action' => 'test-db']), [], jar());
    assert_same(true, $r['body']['ok'] ?? null, $r['raw']);
    assert_match("/Connected to the database " . db_name() . ": Japanese Academy's tables are there, with 3 updates to apply \\(a copy of every table is taken first\\), holding study data\\./",
        $r['body']['message']);
    $r = test_form(site()['base'], '/setup.php', local_form($GLOBALS['nonce'], ['action' => 'test-db', 'db_name' => 'academy_test_nowhere_' . getmypid()]), [], jar());
    assert_same(false, $r['body']['ok'] ?? null, 'a user who may not make databases');
    assert_match('/there is no database academy_test_nowhere_\d+, and this user may not make one/', $r['body']['message']);

    // a stand-in IAM on this computer: its discovery document and its keys
    $port = test_free_port();
    $issuer = "http://127.0.0.1:$port";
    $null = PHP_OS_FAMILY === 'Windows' ? 'NUL' : '/dev/null';
    $proc = proc_open([PHP_BINARY, '-d', 'opcache.enable=0', '-S', "127.0.0.1:$port", BACKEND . '/tests/tools/stand-in-iam.php'],
        [0 => ['file', $null, 'r'], 1 => ['file', $null, 'w'], 2 => ['file', $null, 'w']], $pipes, BACKEND,
        ['STAND_IN_ISSUER' => $issuer, 'STAND_IN_JWKS' => test_iam()['jwks_file']] + getenv());
    $GLOBALS['TEST_SERVERS'][] = static function () use ($proc): void {
        proc_terminate($proc);
        @proc_close($proc);
    };
    for ($i = 0; @fsockopen('127.0.0.1', $port) === false && $i < 100; $i++) {
        usleep(50000);
    }
    $r = test_form(site()['base'], '/setup.php', local_form($GLOBALS['nonce'], ['action' => 'test-iam', 'issuer' => $issuer]), [], jar());
    assert_same(['ok' => true, 'message' => "Reached the IAM at $issuer: it answers, and its signing keys are there (1)."], $r['body'], $r['raw']);
    $r = test_form(site()['base'], '/setup.php', local_form($GLOBALS['nonce'], ['action' => 'test-iam', 'issuer' => "$issuer/elsewhere"]), [], jar());
    assert_same(false, $r['body']['ok'] ?? null);
    assert_match('/No answer from .*\/elsewhere\/\.well-known\/openid-configuration/', $r['body']['message']);
    $r = test_form(site()['base'], '/setup.php', local_form($GLOBALS['nonce'], ['action' => 'test-iam', 'issuer' => 'http://iam.example.com']), [], jar());
    assert_match('/must be an https:\/\/ address/', $r['body']['message'] ?? '');
});

test('setting up the earlier version’s database: a raw copy, the migrations, and the owner’s rows as they were, now user 1’s', function (): void {
    $r = test_form(site()['base'], '/setup.php', local_form($GLOBALS['nonce']), [], jar());
    assert_match('/<h1>Set up<\/h1>/', $r['raw'], strip_tags($r['raw']));
    assert_match('/Backup before the update: backups\/academy-before-migration-\d{8}-\d{6}-\d{3}\.raw\.json\./', $r['raw'], 'a raw copy of every table first');
    assert_match('/Applied the migrations: 002_users\.sql, 003_content_stamp\.sql, 004_languages_and_translations\.sql\./', $r['raw']);
    assert_match('/Built the study content: 1,?373 kanji items/', $r['raw']);
    assert_match('/no sign-in \(this computer only\)/', $r['raw']);
    assert_match('/are not used any more: you may delete that file/', $r['raw'], 'the earlier settings: told they are done with');
    assert_match('/This page stays/', $r['raw']);
    assert_true(is_file(site()['dir'] . '/backend/setup.php'), 'on this computer the setup page stays');
    assert_false(is_file(site()['dir'] . '/backend/storage/installed.lock'), 'and locks nothing');

    $config = site()['dir'] . '/backend/config';
    assert_same(['mode' => 'none', 'local_user_id' => 1], require "$config/auth.local.php");
    assert_same(site()['password'], (require "$config/database.local.php")['password'], 'the earlier password, carried over');
    $pdo = new PDO(sprintf('pgsql:host=%s;port=%d;dbname=%s', config('db.host'), config('db.port'), db_name()), site()['role'], site()['password'],
        [PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION]);
    assert_same($GLOBALS['before'], owner_rows($pdo), 'every row as it was');
    foreach (USER_TABLES as $table) {
        $ids = array_map('intval', array_column($pdo->query("SELECT DISTINCT user_id FROM $table")->fetchAll(PDO::FETCH_ASSOC), 'user_id'));
        assert_true($ids === [] || $ids === [1], "$table: the owner's, user 1");
    }
    assert_same('src/config.local.php', substr(str_replace('\\', '/', (string) realpath(site()['dir'] . '/src/config.local.php')), -20), 'the earlier file is left where it was');

    // and the app: without sign-in, the owner's
    assert_same(['mode' => 'none'], call(site()['base'], 'GET', '/api/auth/config')['body']);
    assert_same(4, call(site()['base'], 'GET', '/api/kanji/progress')['body']['items']['k:大']['stage'] ?? null);
});

test('run again: what is set, never the password; and the owner’s data to their IAM user id', function (): void {
    $page = test_page(site()['base'], '/setup.php', [], jar());
    assert_match('/This copy is set up already/', $page['raw']);
    assert_true(str_contains($page['raw'], '<em id="pw-saved">(saved: leave empty to keep it)</em>'), 'a password is saved: left empty, it stays');
    assert_false(str_contains($page['raw'], site()['password']), 'the password is never shown');
    assert_no_match('/earlier version \(<code>/', $page['raw'], 'its own settings now, not the earlier ones');
    // The same copy asked as a website is: nothing of what is set before the token is proven.
    $website = test_page(site()['base'], '/setup.php', ['Host: academy.example.test']);
    assert_match('/name="token"/', $website['raw']);
    foreach ([db_name(), site()['role'], '<em id="pw-saved">(saved', 'type="password" placeholder="unchanged"'] as $set) {
        assert_false(str_contains($website['raw'], $set), "$set: not to whoever opens the page");
    }
    unlink(site()['dir'] . '/backend/config/setup-token.local.php');

    $r = test_form(site()['base'], '/setup.php', local_form(nonce_of($page['raw']), ['user_id' => '7']), [], jar());
    assert_match('/<h1>Set up<\/h1>/', $r['raw'], strip_tags($r['raw']));
    assert_match('/Backup first: backups\/academy-before-owner-change-/', $r['raw'], strip_tags($r['raw']));
    assert_match("/Your data \\(user 1\\) is now user 7(&#039;|')s: /", $r['raw']);
    assert_same(['mode' => 'none', 'local_user_id' => 7], require site()['dir'] . '/backend/config/auth.local.php');
    assert_same(site()['password'], (require site()['dir'] . '/backend/config/database.local.php')['password'], 'the password stays as it was');
    assert_same(4, call(site()['base'], 'GET', '/api/kanji/progress')['body']['items']['k:大']['stage'] ?? null, 'the app is user 7, with the data');

    // sign-in on, for developing against the IAM: the mode, the IAM and the client id
    $r = test_form(site()['base'], '/setup.php', local_form(nonce_of($page['raw']), ['user_id' => '7', 'auth_mode' => 'iam', 'issuer' => 'https://iam.test']), [], jar());
    assert_match('/sign-in through https:\/\/iam\.test/', $r['raw'], strip_tags($r['raw']));
    assert_same(['mode' => 'iam', 'issuer' => 'https://iam.test', 'client_id' => 'japanese-academy', 'local_user_id' => 7], require site()['dir'] . '/backend/config/auth.local.php');
    assert_same(401, call(site()['base'], 'GET', '/api/kanji/progress')['status'], 'and now it wants a sign-in');
    assert_same(4, call(site()['base'], 'GET', '/api/kanji/progress', null, test_bearer(test_token(7)))['body']['items']['k:大']['stage'] ?? null);
});

after(function (): void {
    if (isset($GLOBALS['jar'])) {
        @unlink($GLOBALS['jar']);
    }
});
