<?php
// The setup page on the owner's own computer: a copy of the app (the upload
// built into a temp folder, served by PHP's built-in server) opened from this
// computer, as composer start serves it. No token, but a nonce the page's own
// form echoes; it asks for the database and the IAM and nothing else; it
// stays and can be run again, showing what is saved and never the password.
// "Test connection" answers in the family's words, tried against the
// database and a stand-in IAM. A database in the shape of migration 001, with
// the owner's data, is copied raw and migrated, every row as it was; settings
// an earlier version wrote are ignored, and saving again writes the IAM alone.
// (A website's setup, with its token, is tests/api/deploy.test.php's.)
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
        'db_password' => site()['password'],
        'issuer' => 'https://iam.test',
        'client_id' => 'japanese-academy',
        'action' => 'save',
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

/** The site's own database, as its user. */
function site_pdo(): PDO
{
    return new PDO(sprintf('pgsql:host=%s;port=%d;dbname=%s', config('db.host'), config('db.port'), db_name()), site()['role'], site()['password'],
        [PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION]);
}

/** Test connection for the database, with these fields changed. */
function try_db(array $change = []): array
{
    $r = test_form(site()['base'], '/setup.php', local_form($GLOBALS['nonce'], ['action' => 'test-db'] + $change), [], jar());
    assert_true(is_array($r['body']), $r['raw']);
    return $r['body'];
}

before(function (): void {
    $GLOBALS['site'] = test_site();
});

test('before it is set up, every address says so, the anotoki library’s way: with the way to the setup page, since this copy was never installed (this computer’s never is)', function (): void {
    $notSetUp = ['code' => 'not_set_up', 'installed' => false, 'message' => 'This site is not set up yet. Its setup page connects it to its database.', 'setup' => '/setup.php'];
    foreach (['/api/kanji/summary', '/api/auth/config', '/api/translations/en', '/api/health', '/api/admin/migrations', '/audio/nothing.mp3', '/report/x'] as $url) {
        $r = call(site()['base'], 'GET', $url);
        assert_same([503, $notSetUp], [$r['status'], $r['body']], $url);
    }
    $r = call(site()['base'], 'GET', '/api/site-status', null, no_token());
    assert_same([200, ['state' => 'not_set_up', 'installed' => false]], [$r['status'], $r['body']], 'where the site stands: always answered');
});

test('from this computer: no token; the database and the IAM, and nothing else', function (): void {
    $page = test_page(site()['base'], '/setup.php', [], jar());
    assert_same(200, $page['status']);
    assert_match('/Set up Japanese Academy/', $page['raw']);
    assert_no_match('/name="token"/', $page['raw'], 'no token on this computer');
    assert_false(is_file(site()['dir'] . '/backend/config/setup-token.local.php'), 'nor a token file');
    assert_match('/HttpOnly/i', implode(' ', $page['headers']['set-cookie'] ?? []), 'the nonce, in a cookie scripts cannot read');
    assert_match('/SameSite=Strict/i', implode(' ', $page['headers']['set-cookie'] ?? []), 'which no other site’s page sends');
    preg_match_all('/<input[^>]* name="([a-z_]+)"/', $page['raw'], $m);
    assert_same(['nonce', 'db_host', 'db_port', 'db_name', 'db_user', 'db_password', 'issuer', 'client_id'], $m[1],
        'no sign-in mode, no admin or owner id, no time zone, no backup');
    foreach (['db_host' => 'localhost', 'db_port' => '5432', 'db_name' => 'anotoki_japanese', 'db_user' => 'postgres', 'issuer' => 'http://localhost:4300',
        'client_id' => 'japanese-academy'] as $name => $value) {
        assert_match('/name="' . $name . '" type="text" value="' . preg_quote($value, '/') . '"/', $page['raw'], "the default of $name");
    }
    assert_no_match('/enctype=|type="file"|type="radio"|<select/', $page['raw'], 'nothing to upload or choose');
    assert_match('/<button type="submit" class="primary" name="action" value="save">Save<\/button>/', $page['raw'], 'Save: what the Test connection sentences say');
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

test('Test connection, in the words every anotoki setup page uses: empty, updates to apply, a missing database, a wrong password, nothing there', function (): void {
    $name = db_name();
    assert_same(['ok' => true, 'message' => "Connected to the database \"$name\": it is empty - Save makes the tables."], try_db());

    // The owner's computer before the update: a database as migration 001 left it, with the owner's study
    // data - made by the site's own user, as the owner's PostgreSQL user made it back then.
    $pdo = site_pdo();
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
    $pending = count(all_migration_files()) - 1; // every set's files but 001: the library's admin tools, words and people too
    assert_same(['ok' => true, 'message' => "Connected to the database \"$name\": $pending update(s) to apply - Save applies them."], try_db());

    $nowhere = 'academy_test_nowhere_' . getmypid();
    assert_same(['ok' => false, 'message' => "Connected to the server, but there is no database \"$nowhere\" and this user may not create one. Make it in the hosting panel first."],
        try_db(['db_name' => $nowhere]), 'the site’s user may not make databases');
    // the developer's own PostgreSQL user may: it is asked, nothing is made
    $may = try_db(['db_name' => $nowhere, 'db_user' => (string) config('db.user'), 'db_password' => (string) config('db.password')]);
    assert_same(['ok' => true, 'message' => "Connected to the server. The database \"$nowhere\" does not exist yet - Save creates it."], $may);
    assert_false(db_exists($nowhere), 'Test connection makes nothing');

    // a database that is there, which this user may not open
    $closed = $name . '_closed';
    db_server()->exec('CREATE DATABASE "' . $closed . '"');
    db_server()->exec('COMMENT ON DATABASE "' . $closed . "\" IS 'academy test " . time() . "'");
    try {
        db_server()->exec('REVOKE CONNECT ON DATABASE "' . $closed . '" FROM PUBLIC');
        $shut = try_db(['db_name' => $closed]);
        assert_same(false, $shut['ok']);
        assert_match('/^The server is there, but "' . site()['role'] . '" cannot open the database "' . $closed . '": permission denied for database/', $shut['message']);
    } finally {
        db_server()->exec('DROP DATABASE IF EXISTS "' . $closed . '" WITH (FORCE)');
    }
    $wrong = try_db(['db_password' => 'not-the-password']);
    assert_same(false, $wrong['ok']);
    assert_match('/^Cannot connect: password authentication failed for user/', $wrong['message'], 'a wrong password opens nothing');
    $none = try_db(['db_host' => '127.0.0.1', 'db_port' => (string) test_free_port()]);
    assert_same(false, $none['ok']);
    assert_match('/^Cannot connect: /', $none['message']);
    assert_same(['ok' => false, 'message' => 'Fill in the database name (letters, digits and _) and its user.'], try_db(['db_name' => 'no-dashes']));
});

test('Test connection for the IAM, against a stand-in', function (): void {
    $iam = stand_in_iam();
    $issuer = $iam['base'];
    $r = test_form(site()['base'], '/setup.php', local_form($GLOBALS['nonce'], ['action' => 'test-iam', 'issuer' => $issuer]), [], jar());
    assert_same(['ok' => true, 'message' => "Reached the IAM at $issuer: it answers, and its signing keys are there (1)."], $r['body'], $r['raw']);
    $r = test_form(site()['base'], '/setup.php', local_form($GLOBALS['nonce'], ['action' => 'test-iam', 'issuer' => "$issuer/elsewhere"]), [], jar());
    assert_same(false, $r['body']['ok'] ?? null);
    assert_match('/No answer from .*\/elsewhere\/\.well-known\/openid-configuration/', $r['body']['message']);
    $r = test_form(site()['base'], '/setup.php', local_form($GLOBALS['nonce'], ['action' => 'test-iam', 'issuer' => 'http://iam.example.com']), [], jar());
    assert_match('/must be an https:\/\/ address/', $r['body']['message'] ?? '');
});

test('Save: the database and the IAM in the settings, a raw copy, the migrations, the content, and the owner’s rows as they were, user 1’s', function (): void {
    $r = test_form(site()['base'], '/setup.php', local_form($GLOBALS['nonce']), [], jar());
    assert_match('/<h1>Saved<\/h1>/', $r['raw'], strip_tags($r['raw']));
    assert_match('/Backup before the update: backend\/storage\/backups\/academy-before-migration-\d{8}-\d{6}-\d{3}\.raw\.json\./', $r['raw'], 'a raw copy of every table first');
    $after001 = array_values(array_diff(array_map('basename', glob(MIGRATIONS_DIR . '/*.sql') ?: []), ['001_init.sql']));
    sort($after001);
    assert_same('002_users.sql', $after001[0]);
    assert_match('/Applied the migrations: ' . preg_quote(implode(', ', array_merge(library_migrations('anotoki_admin'), $after001, library_migrations(), library_migrations('anotoki_people'))), '/') . '\./',
        $r['raw'], 'every one after 001, in order: the anotoki library’s admin tools first, its words and people last');
    assert_match('/Built the study content: 1,?373 kanji items/', $r['raw']);
    assert_match('/sign-in through the IAM at https:\/\/iam\.test/', $r['raw']);
    assert_match('/sign in with your anotoki account/', $r['raw']);
    assert_match('/This page stays/', $r['raw']);
    assert_true(is_file(site()['dir'] . '/backend/setup.php'), 'on this computer the setup page stays');
    assert_false(is_file(site()['dir'] . '/backend/storage/installed.lock'), 'and locks nothing');

    $config = site()['dir'] . '/backend/config';
    assert_same(['issuer' => 'https://iam.test', 'client_id' => 'japanese-academy'], require "$config/auth.local.php", 'the IAM alone');
    assert_same(site()['password'], (require "$config/database.local.php")['password']);
    assert_same(['auth.local.php', 'database.local.php'], array_map('basename', glob("$config/*.local.php") ?: []), 'nothing else: no app.local.php');
    $pdo = site_pdo();
    assert_same($GLOBALS['before'], owner_rows($pdo), 'every row as it was');
    foreach (USER_TABLES as $table) {
        $ids = array_map('intval', array_column($pdo->query("SELECT DISTINCT user_id FROM $table")->fetchAll(PDO::FETCH_ASSOC), 'user_id'));
        assert_true($ids === [] || $ids === [1], "$table: the owner's, user 1");
    }
    assert_same(['ok' => true, 'message' => 'Connected to the database "' . db_name() . '": it is up to date.'], try_db());

    // and the app: the owner signs in as user 1, their id at the IAM, and finds their data
    assert_same(['issuer' => 'https://iam.test', 'client_id' => 'japanese-academy', 'login_required' => true, 'sign_in_available' => true, 'visitor_keep_days' => 30],
        call(site()['base'], 'GET', '/api/auth/config', null, no_token())['body']);
    assert_same(401, call(site()['base'], 'GET', '/api/kanji/progress', null, no_token())['status'], 'nobody without a token, from this computer too');
    assert_same(4, call(site()['base'], 'GET', '/api/kanji/progress', null, test_bearer(test_token(1)))['body']['items']['k:大']['stage'] ?? null);
});

test('an earlier version’s settings: the sign-in mode, the owner id and the time zone are ignored; saving again writes the IAM alone', function (): void {
    $config = site()['dir'] . '/backend/config';
    $old = "<?php\n// Written by the setup page.\n\nreturn " . var_export(['mode' => 'iam', 'issuer' => 'https://iam.test', 'client_id' => 'japanese-academy', 'local_user_id' => 1], true) . ";\n";
    file_put_contents("$config/auth.local.php", $old);
    file_put_contents("$config/app.local.php", "<?php\n// Written by the setup page.\n\nreturn ['timezone' => 'Europe/Bratislava'];\n");
    // The origin secret, which the owner puts on the site by FTP: the setup page never asks for, writes or shows it.
    $originSecret = 'origin-' . bin2hex(random_bytes(20));
    $cloudflare = "<?php\nreturn ['origin_secret' => '$originSecret'];\n";
    file_put_contents("$config/cloudflare.local.php", $cloudflare);
    assert_same(4, call(site()['base'], 'GET', '/api/kanji/progress', null, test_bearer(test_token(1)))['body']['items']['k:大']['stage'] ?? null,
        'such a copy keeps working as it is');

    $page = test_page(site()['base'], '/setup.php', [], jar());
    assert_false(str_contains($page['raw'], $originSecret), 'the origin secret is never shown');
    assert_match('/This copy is set up already/', $page['raw']);
    assert_match('/name="issuer" type="text" value="https:\/\/iam\.test"/', $page['raw'], 'what is saved, on this computer');
    assert_match('/name="db_name" type="text" value="' . db_name() . '"/', $page['raw']);
    assert_true(str_contains($page['raw'], '(saved: leave empty to keep it)'), 'a password is saved: left empty, it stays');
    assert_false(str_contains($page['raw'], site()['password']), 'the password is never shown');
    $r = test_form(site()['base'], '/setup.php', local_form(nonce_of($page['raw']), ['db_password' => '']), [], jar());
    assert_match('/<h1>Saved<\/h1>/', $r['raw'], strip_tags($r['raw']));
    assert_same(['issuer' => 'https://iam.test', 'client_id' => 'japanese-academy'], require "$config/auth.local.php", 'the old keys are gone from it');
    assert_same(site()['password'], (require "$config/database.local.php")['password'], 'the password stays as it was');
    assert_same(['timezone' => 'Europe/Bratislava'], require "$config/app.local.php", 'and app.local.php is left alone: the setup page never writes it (the owner\'s optional file), and its old timezone is ignored');
    assert_same($cloudflare, file_get_contents("$config/cloudflare.local.php"), 'cloudflare.local.php too: the origin secret as the owner put it');
    assert_false(str_contains($r['raw'], $originSecret), 'and never shown');
    unlink("$config/cloudflare.local.php");

    // A copy set up without sign-in is not set up (config_problem() says why, to manage.php --check): the way to the
    // setup page, never installed on this computer - and saving here sets it up again.
    file_put_contents("$config/auth.local.php", "<?php\nreturn ['mode' => 'none', 'local_user_id' => 1];\n");
    $r = call(site()['base'], 'GET', '/api/kanji/summary');
    assert_same([503, 'not_set_up', false, '/setup.php'], [$r['status'], $r['body']['code'] ?? null, $r['body']['installed'] ?? null, $r['body']['setup'] ?? null]);
    $page = test_page(site()['base'], '/setup.php', [], jar());
    assert_match('/name="issuer" type="text" value="http:\/\/localhost:4300"/', $page['raw'], 'no IAM saved: the development IAM');
    $r = test_form(site()['base'], '/setup.php', local_form(nonce_of($page['raw']), ['db_password' => '']), [], jar());
    assert_match('/<h1>Saved<\/h1>/', $r['raw'], strip_tags($r['raw']));
    assert_same(200, call(site()['base'], 'GET', '/api/kanji/summary')['status']);
});

test('run again, asked as a website is: the token, and nothing of what is saved', function (): void {
    $website = test_page(site()['base'], '/setup.php', ['Host: academy.example.test']);
    assert_match('/name="token"/', $website['raw']);
    foreach ([db_name(), site()['role'], 'iam.test', '(saved', 'placeholder="unchanged"'] as $set) {
        assert_false(str_contains($website['raw'], $set), "$set: not to whoever opens the page");
    }
    unlink(site()['dir'] . '/backend/config/setup-token.local.php');
});

after(function (): void {
    if (isset($GLOBALS['jar'])) {
        @unlink($GLOBALS['jar']);
    }
});
