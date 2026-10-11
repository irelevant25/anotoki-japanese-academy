<?php
/**
 * What every PHP test file loads first: the isolation of your data, a small
 * test runner (test(), before(), after(), assertions), and the real server
 * started for the API tests.
 *
 * Isolation: before the app is loaded, this file gives the test settings of
 * its own — a folder of the settings files the app reads
 * (tests/tools/test-config.php), named by ACADEMY_CONFIG_DIR — for a
 * throwaway database (academy_test_<…>, copied from academy_test_template) and
 * a temp folder for backups. It refuses to go on if the app was loaded first.
 * No test can reach your database or backend/storage/backups/. The database, the folders and the settings are
 * removed when the file's tests end; ACADEMY_KEEP_TEMP=1 keeps them for a look.
 *
 * Sign-in is the app's one way, the IAM, through the test IAM: a key pair made
 * for the file (test_iam(): the anotoki library's TestIam), whose public half
 * the settings name as the IAM's keys, so the file signs its own tokens
 * (test_token()) and no IAM is ever asked; whether the IAM requires sign-in
 * here comes from a file of the test's too (test_access()), and so do the
 * accounts the IAM deleted (test_anonymized()). call() sends a token of
 * TEST_USER, a person with no role, unless a test sends its own or none
 * (no_token()). For a sign-in by redirect, the anotoki library's stand-in IAM
 * (stand_in_iam()).
 *
 * tests/run.php runs every test file (php backend/tests/run.php [file…]).
 */

declare(strict_types=1);

const TEST_DB_PREFIX = 'academy_test_';
const TEST_TEMPLATE = 'academy_test_template';

if (defined('ROOT')) {
    throw new RuntimeException('tests/lib.php came too late: the app was loaded before it, with its real settings.');
}

require __DIR__ . '/tools/test-config.php';

// A migration still being written (without its last line) is applied to the
// tests' throwaway databases, as testdb.php applies it to their template:
// the tests run on the tables it makes, and every server they start, the app
// as a website included, does the same (db_migration_drafts_allowed(): only
// the drafts named here, and never to a database that is not academy_test_…).
putenv('ACADEMY_MIGRATION_DRAFTS=' . implode(',', test_config_migration_drafts()));

/** A throwaway database's name: a test database, never the template or the real one. */
function test_db_name_ok(string $name): bool
{
    return (bool) preg_match('/^' . TEST_DB_PREFIX . '[a-z0-9_]+$/D', $name) && $name !== TEST_TEMPLATE;
}

(static function (): void {
    $name = (string) getenv('ACADEMY_DB_NAME'); // tests/run.php names one per file
    if (!test_db_name_ok($name)) {
        $name = TEST_DB_PREFIX . getmypid() . '_' . bin2hex(random_bytes(3));
    }
    $backups = str_replace('\\', '/', (string) getenv('ACADEMY_BACKUPS_DIR'));
    if (!str_contains($backups, '/academy-test-')) {
        $backups = str_replace('\\', '/', sys_get_temp_dir()) . '/academy-test-' . getmypid() . '-' . bin2hex(random_bytes(3));
    }
    $dir = str_replace('\\', '/', sys_get_temp_dir()) . '/academy-test-config-' . getmypid() . '-' . bin2hex(random_bytes(3));
    // the test IAM's folder: its key pair and the key set the settings name, written by test_iam() before any token is checked
    $iam = str_replace('\\', '/', sys_get_temp_dir()) . '/academy-test-iam-' . getmypid() . '-' . bin2hex(random_bytes(3));
    $jwks = "$iam/jwks.json";
    // the IAM's answer whether sign-in is required: none until test_access() writes one (the IAM out of reach: required)
    $application = str_replace('\\', '/', sys_get_temp_dir()) . '/academy-application-' . getmypid() . '-' . bin2hex(random_bytes(3)) . '.json';
    // the IAM's deleted accounts: none until test_anonymized() writes them (the IAM out of reach for them)
    $anonymized = str_replace('\\', '/', sys_get_temp_dir()) . '/academy-anonymized-' . getmypid() . '-' . bin2hex(random_bytes(3)) . '.json';
    test_config_write($dir, $name, $jwks, $backups, null, 'https://iam.test', ['application_file' => $application, 'anonymized_file' => $anonymized]);
    putenv("ACADEMY_CONFIG_DIR=$dir");
    putenv('ACADEMY_JWKS_FILE');
    putenv('ACADEMY_APPLICATION_FILE');
    $GLOBALS['TEST_CONFIG'] = ['dir' => $dir, 'name' => $name, 'backups' => $backups, 'iam' => $iam, 'jwks' => $jwks, 'application' => $application,
        'anonymized' => $anonymized];
})();

require __DIR__ . '/../src/bootstrap.php';

if (!test_db_name_ok(db_name())) {
    throw new RuntimeException('The tests would use the database ' . db_name() . ': refusing.');
}

/* ------------------------------------------------------------ the runner */

$GLOBALS['TESTS'] = ['tests' => [], 'before' => [], 'after' => []];

function test(string $name, callable $fn): void
{
    $GLOBALS['TESTS']['tests'][] = [$name, $fn];
}

function before(callable $fn): void
{
    $GLOBALS['TESTS']['before'][] = $fn;
}

function after(callable $fn): void
{
    $GLOBALS['TESTS']['after'][] = $fn;
}

final class AssertionFailed extends RuntimeException
{
}

function test_show($v): string
{
    return is_string($v) ? json_encode($v, JSON_UNESCAPED_UNICODE) : json_encode($v, JSON_UNESCAPED_UNICODE | JSON_PARTIAL_OUTPUT_ON_ERROR);
}

function fail(string $message): never
{
    throw new AssertionFailed($message);
}

/** Strict equality (===): for arrays the same keys, values and types, in the same order. */
function assert_same($expected, $actual, string $message = ''): void
{
    if ($expected !== $actual) {
        fail(($message !== '' ? "$message\n" : '') . '  expected: ' . test_show($expected) . "\n  actual:   " . test_show($actual));
    }
}

function assert_true($value, string $message = 'expected a true value'): void
{
    if (!$value) {
        fail($message);
    }
}

function assert_false($value, string $message = 'expected a false value'): void
{
    if ($value) {
        fail($message);
    }
}

function assert_match(string $pattern, string $text, string $message = ''): void
{
    if (!preg_match($pattern, $text)) {
        fail(($message !== '' ? "$message\n" : '') . "  $pattern does not match " . test_show(mb_substr($text, 0, 300)));
    }
}

function assert_no_match(string $pattern, string $text, string $message = ''): void
{
    if (preg_match($pattern, $text, $m)) {
        fail(($message !== '' ? "$message\n" : '') . "  $pattern matches " . test_show($m[0]));
    }
}

function assert_throws(callable $fn, string $pattern = '/./'): void
{
    try {
        $fn();
    } catch (AssertionFailed $e) {
        throw $e;
    } catch (Throwable $e) {
        assert_match($pattern, $e->getMessage(), 'the wrong error');
        return;
    }
    fail('expected an error');
}

/**
 * A refusal of the API ($r as call() gives it): its status, the code a page
 * words it from, and the sentence beside the code — for the command line, the
 * logs and these tests, word for word.
 */
function assert_refused(int $status, string $code, string $sentence, array $r, string $message = ''): void
{
    $body = is_array($r['body'] ?? null) ? $r['body'] : [];
    assert_same([$status, $code, $sentence], [$r['status'] ?? null, $body['code'] ?? null, $body['error'] ?? null], $message);
}

/** Runs the file's tests; the last line tells tests/run.php the counts. */
function test_run(): int
{
    $pass = $fail = 0;
    $file = basename((string) ($_SERVER['SCRIPT_FILENAME'] ?? ''));
    try {
        foreach ($GLOBALS['TESTS']['before'] as $fn) {
            $fn();
        }
        foreach ($GLOBALS['TESTS']['tests'] as [$name, $fn]) {
            $t = microtime(true);
            try {
                $fn();
                $pass++;
                printf("  ✔ %s (%sms)\n", $name, js_to_fixed((microtime(true) - $t) * 1000, 1));
            } catch (Throwable $e) {
                $fail++;
                printf("  ✖ %s (%sms)\n", $name, js_to_fixed((microtime(true) - $t) * 1000, 1));
                $where = $e instanceof AssertionFailed ? test_where($e) : get_class($e) . ' at ' . str_replace(ROOT, '', $e->getFile()) . ':' . $e->getLine();
                echo '    ' . str_replace("\n", "\n    ", rtrim($e->getMessage())) . "\n    ($where)\n";
            }
        }
    } finally {
        foreach ($GLOBALS['TESTS']['after'] as $fn) {
            try {
                $fn();
            } catch (Throwable $e) {
                echo '  after: ' . $e->getMessage() . "\n";
            }
        }
    }
    echo '##academy ' . json_encode(['file' => $file, 'pass' => $pass, 'fail' => $fail]) . "\n";
    return $fail ? 1 : 0;
}

/** The test file's line an assertion failed on. */
function test_where(Throwable $e): string
{
    foreach ($e->getTrace() as $frame) {
        if (isset($frame['file']) && str_ends_with($frame['file'], '.test.php')) {
            return basename($frame['file']) . ':' . $frame['line'];
        }
    }
    return basename($e->getFile()) . ':' . $e->getLine();
}

// the tests run when the test file itself is done registering them
register_shutdown_function(static function (): void {
    if (!isset($GLOBALS['TEST_RAN']) && $GLOBALS['TESTS']['tests']) {
        $GLOBALS['TEST_RAN'] = true;
        $code = test_run();
        test_cleanup();
        exit($code);
    }
    test_cleanup();
});

/* ------------------------------------------------ the database and the app */

/** This file's throwaway database, copied from the template on first use. */
function test_db(): void
{
    static $made = false;
    if ($made) {
        return;
    }
    if (!db_exists(TEST_TEMPLATE)) {
        throw new RuntimeException('No ' . TEST_TEMPLATE . ' database: run the tests with php backend/tests/run.php, which makes it.');
    }
    db_create(db_name(), TEST_TEMPLATE);
    // when it was made, so a later run can sweep it away if this one never got to
    db_server()->exec('COMMENT ON DATABASE "' . db_name() . "\" IS 'academy test " . time() . "'");
    $made = true;
    $GLOBALS['TEST_DB_MADE'] = true;
}

/**
 * This file's throwaway database, empty — no tables, no migrations (for the
 * tests of a migration on data in the old shape). Instead of test_db().
 */
function test_db_empty(): void
{
    db_create(db_name());
    db_server()->exec('COMMENT ON DATABASE "' . db_name() . "\" IS 'academy test " . time() . "'");
    $GLOBALS['TEST_DB_MADE'] = true;
}

/**
 * The anotoki library's migration files of one of its sets - the words'
 * (anotoki_translations) unless another is named: anotoki_admin, which runs
 * before this site's own, or anotoki_people, last (db_migration_sets()) - in
 * their order, as the site names them (db_migration_label():
 * "anotoki_translations/001_….sql").
 *
 * @return list<string>
 */
function library_migrations(string $set = Anotoki\Lib\Translations\Schema::SET): array
{
    foreach (db_migration_sets() as $each) {
        if ($each->name === $set) {
            $names = array_map('basename', glob($each->directory . '/*.sql') ?: []);
            sort($names);
            return array_map(static fn (string $name): string => "$set/$name", $names);
        }
    }
    throw new RuntimeException("No migration set $set here.");
}

/**
 * Every migration file of every set, in the order they run (db_migration_sets():
 * the anotoki library's anotoki_admin, this site's own, the library's
 * anotoki_translations and anotoki_people), as {set, name}.
 *
 * @return list<array{set: string, name: string}>
 */
function all_migration_files(): array
{
    $files = [];
    foreach (db_migration_sets() as $set) {
        $names = array_map('basename', glob($set->directory . '/*.sql') ?: []);
        sort($names);
        foreach ($names as $name) {
            $files[] = ['set' => $set->name, 'name' => $name];
        }
    }
    return $files;
}

/** all_migration_files() as the site names them (db_migration_label()). @return list<string> */
function all_migration_labels(): array
{
    return array_map('db_migration_label', all_migration_files());
}

/** The names of the sets, in the order they run: the library's admin tools first, this site's, the library's words and people. */
const MIGRATION_SETS_IN_ORDER = ['anotoki_admin', 'academy', 'anotoki_translations', 'anotoki_people'];

/** A language's own strings in this file's database, by key: [key => text], in the keys' order. */
function translations_of(string $code): array
{
    $values = [];
    foreach (db_all('SELECT key_name, value FROM translations WHERE language_code = ? ORDER BY key_name COLLATE "C"', [$code]) as $row) {
        $values[$row['key_name']] = $row['value'];
    }
    return $values;
}

/** Drops this file's database and removes its temp folders and settings, unless ACADEMY_KEEP_TEMP is set. */
function test_cleanup(): void
{
    foreach ($GLOBALS['TEST_SERVERS'] ?? [] as $stop) {
        $stop();
    }
    $GLOBALS['TEST_SERVERS'] = [];
    test_remove_folder($GLOBALS['TEST_CONFIG']['iam'], '/academy-test-iam-');
    @unlink($GLOBALS['TEST_CONFIG']['application']);
    @unlink($GLOBALS['TEST_CONFIG']['anonymized']);
    if (getenv('ACADEMY_KEEP_TEMP')) {
        return;
    }
    if (!empty($GLOBALS['TEST_DB_MADE']) && test_db_name_ok(db_name())) {
        $GLOBALS['TEST_DB_MADE'] = false;
        try {
            db_server()->exec('DROP DATABASE IF EXISTS "' . db_name() . '" WITH (FORCE)');
        } catch (Throwable $e) {
            echo '  (could not drop ' . db_name() . ': ' . $e->getMessage() . ")\n";
        }
    }
    $dir = backup_dir();
    if (is_dir($dir) && str_contains(str_replace('\\', '/', $dir), '/academy-test-')) {
        foreach (array_diff(scandir($dir) ?: [], ['.', '..']) as $f) {
            @unlink("$dir/$f"); // with the dotfiles, which glob() leaves out
        }
        @rmdir($dir);
    }
    foreach (array_merge([$GLOBALS['TEST_CONFIG']['dir']], $GLOBALS['TEST_CONFIG_DIRS'] ?? []) as $config) {
        test_config_remove($config);
    }
    if (isset($GLOBALS['TEST_FRONTEND']) && str_contains($GLOBALS['TEST_FRONTEND'], '/academy-test-frontend-')) {
        array_map('unlink', glob($GLOBALS['TEST_FRONTEND'] . '/*') ?: []);
        @rmdir($GLOBALS['TEST_FRONTEND']);
    }
}

/** Removes a temp folder of the tests and everything in it - only one whose path holds $mark (an academy-test- name). */
function test_remove_folder(string $dir, string $mark): void
{
    if (!is_dir($dir) || !str_contains(str_replace('\\', '/', $dir), $mark)) {
        return;
    }
    $items = new RecursiveIteratorIterator(new RecursiveDirectoryIterator($dir, FilesystemIterator::SKIP_DOTS), RecursiveIteratorIterator::CHILD_FIRST);
    foreach ($items as $item) {
        $item->isDir() && !$item->isLink() ? @rmdir($item->getPathname()) : @unlink($item->getPathname());
    }
    @rmdir($dir);
}

/** A free port on this computer. */
function test_free_port(): int
{
    $s = stream_socket_server('tcp://127.0.0.1:0');
    $port = (int) substr(strrchr(stream_socket_get_name($s, false), ':'), 1);
    fclose($s);
    return $port;
}

/* ---------------------------------------------------------------- sign-in */

/** The person every call() is, unless a test says otherwise: an account with no role here, a learner. */
const TEST_USER = 1;

/**
 * The test IAM: the anotoki library's TestIam - a key pair made for this file
 * in a folder of its own, its public half the key set the settings name
 * (auth.jwks_file). The servers of this file check tokens against that file
 * instead of asking an IAM, so test_token() can sign whatever a test needs.
 * Its issuer exists nowhere: a request that should not happen fails loudly.
 *
 * @return array{issuer: string, client_id: string, iam: Anotoki\Lib\Auth\Testing\TestIam, dir: string, jwks_file: string}
 */
function test_iam(): array
{
    if (!isset($GLOBALS['TEST_IAM'])) {
        $dir = $GLOBALS['TEST_CONFIG']['iam'];
        $iam = Anotoki\Lib\Auth\Testing\TestIam::create($dir, 'https://iam.test', 'japanese-academy', 'academy-test');
        $GLOBALS['TEST_IAM'] = ['issuer' => $iam->issuer, 'client_id' => $iam->clientId, 'iam' => $iam, 'dir' => $dir, 'jwks_file' => $GLOBALS['TEST_CONFIG']['jwks']];
    }
    return $GLOBALS['TEST_IAM'];
}

/**
 * An access token of the test IAM for user $id, with these roles in this app
 * (none: a learner; 'EDITOR', 'ADMIN'); $extra replaces claims (an expired
 * exp, another aud …; null takes one out). $typ 'JWT' makes it an ID token's
 * type.
 */
function test_token(int $id, array $roles = [], array $extra = [], string $typ = 'at+jwt'): string
{
    $iam = test_iam()['iam'];
    return $iam->sign($iam->claims($id, $roles, $extra), $typ);
}

/**
 * What the test IAM says of the accounts it deleted, for every server of this
 * file that has no stand-in IAM: [id => when (ISO 8601 UTC, whole seconds)],
 * the file auth.anonymized_file names. null: no answer at all (the IAM out of
 * reach), which is where every file starts.
 */
function test_anonymized(?array $accounts): void
{
    $file = $GLOBALS['TEST_CONFIG']['anonymized'];
    if ($accounts === null) {
        @unlink($file);
        return;
    }
    $list = [];
    foreach ($accounts as $sub => $at) {
        $list[] = ['sub' => (string) $sub, 'anonymized_at' => $at];
    }
    file_put_contents($file, json_encode(['accounts' => $list, 'next' => null]));
}

/**
 * What the test IAM says about this site, for every server of this file that
 * has no stand-in IAM (and the app's functions in the test process): whether
 * sign-in is required here - the file auth.application_file names, read on
 * every request. null: no answer at all (the IAM out of reach), which is
 * where every file starts.
 */
function test_access(?bool $loginRequired): void
{
    $file = $GLOBALS['TEST_CONFIG']['application'];
    if ($loginRequired === null) {
        @unlink($file);
        return;
    }
    file_put_contents($file, json_encode(['client_id' => 'japanese-academy', 'name' => 'Japanese Academy', 'login_required' => $loginRequired]));
}

/** The header that sends a token. */
function test_bearer(string $token): array
{
    return ["Authorization: Bearer $token"];
}

/** The header that sends no token at all: call() then sends none of its own (curl drops an empty header). */
function no_token(): array
{
    return ['Authorization:'];
}

/**
 * Settings of their own for a server of this file: the same database, backup
 * folder and test IAM's keys; with $frontend, a built app of the test's own;
 * with $issuer, the address of a stand-in IAM, which it then asks whether
 * sign-in is required (else test_access() says); $auth adds to its
 * auth.local.php ('application_ttl' …), $app to its app.local.php ('visitors'
 * => [...], 'client_address' => [...]). Returns the folder, removed when the
 * file's tests end.
 */
function test_server_config(?string $frontend = null, string $issuer = 'https://iam.test', array $auth = [], array $app = []): string
{
    $dir = str_replace('\\', '/', sys_get_temp_dir()) . '/academy-test-config-' . getmypid() . '-' . bin2hex(random_bytes(3));
    if ($issuer === 'https://iam.test') {
        $auth += ['application_file' => $GLOBALS['TEST_CONFIG']['application'], 'anonymized_file' => $GLOBALS['TEST_CONFIG']['anonymized']];
    }
    test_config_write($dir, db_name(), test_iam()['jwks_file'], backup_dir(), $frontend, $issuer, $auth, $app);
    $GLOBALS['TEST_CONFIG_DIRS'][] = $dir;
    return $dir;
}

/**
 * The anotoki library's stand-in IAM (backend/vendor/anotoki/lib/php/testing/
 * stand-in-iam.php, the family's one) on a free port, signing with the test
 * IAM's key: authorize, token, logout, the public answer about this site and
 * the deleted accounts, as the browser's sign-in and the app use them. Whom it
 * signs in is user 1, 'owner', MEMBER alone - a learner, as every account is -
 * unless $state says otherwise; $state is merged into its state.json first
 * (who signs in, deny, login_required …). Stopped and removed when the file's
 * tests end.
 *
 * @return array{base: string, dir: string}
 */
function stand_in_iam(array $state = []): array
{
    $iam = test_iam();
    $dir = str_replace('\\', '/', sys_get_temp_dir()) . '/academy-test-iam-' . getmypid() . '-' . bin2hex(random_bytes(3));
    mkdir($dir, 0700, true);
    copy($iam['dir'] . '/' . Anotoki\Lib\Auth\Testing\TestIam::KEY_FILE, "$dir/key.json");
    file_put_contents("$dir/state.json", json_encode($state + ['user' => ['id' => 1, 'username' => 'owner', 'roles' => ['MEMBER']]]));
    $port = test_free_port();
    $base = "http://127.0.0.1:$port";
    $null = PHP_OS_FAMILY === 'Windows' ? 'NUL' : '/dev/null';
    $proc = proc_open([PHP_BINARY, '-d', 'opcache.enable=0', '-S', "127.0.0.1:$port", Anotoki\Lib\Auth\Testing\StandInIam::script()],
        [0 => ['file', $null, 'r'], 1 => ['file', $null, 'w'], 2 => ['file', $null, 'w']], $pipes, $dir,
        ['STAND_IN_ISSUER' => $base, 'STAND_IN_DIR' => $dir] + getenv());
    $GLOBALS['TEST_SERVERS'][] = static function () use ($proc, $dir): void {
        proc_terminate($proc);
        @proc_close($proc);
        array_map('unlink', glob("$dir/*") ?: []);
        @rmdir($dir);
    };
    for ($i = 0; @file_get_contents("$base/.well-known/openid-configuration") === false; $i++) {
        if ($i > 100) {
            throw new RuntimeException('The stand-in IAM did not start.');
        }
        usleep(50000);
    }
    return ['base' => $base, 'dir' => $dir];
}

/* ----------------------------------------------------------------- the app */

/**
 * A built app of the tests' own, in the shape the Angular build gives
 * (index.html, files named with a hash of their content, what public/ holds):
 * the PHP tests never need the real build, nor wait for one.
 */
function test_frontend(): string
{
    if (!isset($GLOBALS['TEST_FRONTEND'])) {
        $dir = str_replace('\\', '/', sys_get_temp_dir()) . '/academy-test-frontend-' . getmypid() . '-' . bin2hex(random_bytes(3));
        mkdir($dir, 0777, true);
        file_put_contents("$dir/index.html", "<!doctype html><html lang=\"en\"><head><title>Japanese Academy</title></head><body><app-root></app-root></body></html>\n");
        file_put_contents("$dir/main-TESTAPP1.js", "console.log('the app');\n");
        file_put_contents("$dir/favicon.svg", "<svg xmlns=\"http://www.w3.org/2000/svg\"/>\n");
        file_put_contents("$dir/changelog.json", "[]\n");
        $GLOBALS['TEST_FRONTEND'] = $dir;
    }
    return $GLOBALS['TEST_FRONTEND'];
}

/**
 * The real server (backend/router.php as PHP's built-in server runs it) on
 * a free port, against this file's database and backup folder. Checks it says
 * so before any test talks to it. It signs people in through the test IAM
 * (test_token()). $how: ['frontend' => DIR] for another built app than
 * test_frontend(); ['issuer' => URL] for a stand-in IAM's tokens and its answer
 * whether sign-in is required (stand_in_iam()); ['auth' => [...]] adds to its
 * auth.local.php (test_server_config()), ['app' => [...]] to its app.local.php
 * (the visitors' limits, the trusted proxies);
 * ['env' => [...]] sets its environment (settings of its own,
 * ACADEMY_CONFIG_DIR, perhaps not whole: then only that it answers is checked);
 * ['ini' => ['memory_limit' => '48M', …]] PHP's own settings, as a host's php.ini
 * would have them.
 *
 * @return array{base: string, log: string, config?: string} config: its settings folder (and DIR/cache, its cache)
 */
function start_app(array $how = []): array
{
    $ini = [];
    foreach ($how['ini'] ?? [] as $setting => $value) {
        array_push($ini, '-d', "$setting=$value");
    }
    test_db();
    $frontend = array_key_exists('frontend', $how) ? (string) $how['frontend'] : test_frontend();
    $own = isset($how['env']['ACADEMY_CONFIG_DIR']);
    $env = ($how['env'] ?? []) + ['ACADEMY_CONFIG_DIR' => $own ? '' : test_server_config($frontend, (string) ($how['issuer'] ?? 'https://iam.test'), $how['auth'] ?? [], $how['app'] ?? [])] + getenv();
    unset($env['ACADEMY_JWKS_FILE']);
    $port = test_free_port();
    // The built-in server logs every request: to a file, as a pipe nobody reads would fill up and stall it.
    // No opcode cache: on Windows it is shared by every PHP process of the same build, other
    // projects' servers too, and through it PHP 8.5.11's built-in server has called the wrong
    // internal functions here (docs/kb/environment.md).
    $log = tempnam(sys_get_temp_dir(), 'academy-server-');
    $null = PHP_OS_FAMILY === 'Windows' ? 'NUL' : '/dev/null';
    $proc = proc_open(
        array_merge([PHP_BINARY, '-d', 'display_errors=stderr', '-d', 'opcache.enable=0'], $ini, ['-S', "127.0.0.1:$port", '-t', BACKEND, BACKEND . '/router.php']),
        [0 => ['file', $null, 'r'], 1 => ['file', $null, 'w'], 2 => ['file', $log, 'a']],
        $pipes,
        ROOT,
        $env
    );
    if (!is_resource($proc)) {
        throw new RuntimeException('Could not start the server.');
    }
    $base = "http://127.0.0.1:$port";
    $GLOBALS['TEST_SERVERS'][] = static function () use ($proc, $log): void {
        proc_terminate($proc);
        @proc_close($proc);
        @unlink($log);
    };
    for ($i = 0; $i < 100; $i++) {
        if ($own) {
            if (@fsockopen('127.0.0.1', $port) !== false) {
                return ['base' => $base, 'log' => $log];
            }
            usleep(50000);
            continue;
        }
        $r = @file_get_contents("$base/api/health");
        if ($r !== false) {
            $health = json_decode($r, true);
            if (($health['database'] ?? null) !== db_name() || ($health['backups'] ?? null) !== str_replace('\\', '/', backup_dir())) {
                throw new RuntimeException('The server uses ' . ($health['database'] ?? '?') . ' / ' . ($health['backups'] ?? '?') . ", not this test's database and folder.");
            }
            return ['base' => $base, 'log' => $log, 'config' => $env['ACADEMY_CONFIG_DIR']];
        }
        usleep(50000);
    }
    throw new RuntimeException('The server did not start: ' . file_get_contents($log));
}

/* ------------------------------------------------------------ a built site */

/**
 * A hosted site on this computer: the upload built by backend/tools/build-dist.php
 * (without the clips, with test_frontend() as its app) in a temp folder, and
 * this file's database with a PostgreSQL user of its own that owns it, as a
 * hosting panel makes them. Served as Apache serves it
 * (tests/tools/front-controller.php does what public/.htaccess does), with
 * the site's own settings — none until its setup page writes them — and the
 * test IAM's keys. Removed when the file's tests end.
 *
 * @return array{dir: string, base: string, role: string, password: string, log: string}
 */
function test_site(): array
{
    $dir = str_replace('\\', '/', sys_get_temp_dir()) . '/academy-test-site-' . getmypid() . '-' . bin2hex(random_bytes(3));
    test_build('--no-audio --frontend=' . escapeshellarg(test_frontend()) . ' --out=' . escapeshellarg($dir));

    $role = TEST_DB_PREFIX . getmypid() . '_site';
    $password = bin2hex(random_bytes(16));
    db_server()->exec('CREATE ROLE "' . $role . "\" LOGIN PASSWORD '$password'");
    db_server()->exec('CREATE DATABASE "' . db_name() . '" OWNER "' . $role . "\" ENCODING 'UTF8' TEMPLATE template0");
    db_server()->exec('COMMENT ON DATABASE "' . db_name() . "\" IS 'academy test " . time() . "'");
    $GLOBALS['TEST_DB_MADE'] = true;

    $env = getenv();
    unset($env['ACADEMY_CONFIG_DIR']); // the site's own settings, in its backend/config/
    $env['ACADEMY_JWKS_FILE'] = test_iam()['jwks_file'];
    $env['ACADEMY_APPLICATION_FILE'] = $GLOBALS['TEST_CONFIG']['application']; // never the issuer its setup page names
    $port = test_free_port();
    $log = (string) tempnam(sys_get_temp_dir(), 'academy-site-');
    $null = PHP_OS_FAMILY === 'Windows' ? 'NUL' : '/dev/null';
    $proc = proc_open(
        [PHP_BINARY, '-d', 'display_errors=stderr', '-d', 'opcache.enable=0', '-S', "127.0.0.1:$port", '-t', "$dir/public", BACKEND . '/tests/tools/front-controller.php'],
        [0 => ['file', $null, 'r'], 1 => ['file', $null, 'w'], 2 => ['file', $log, 'a']],
        $pipes,
        $dir,
        $env
    );
    $site = ['dir' => $dir, 'base' => "http://127.0.0.1:$port", 'role' => $role, 'password' => $password, 'log' => $log];
    // the site first, then its database, then its user, who owns the database; then its folder
    $GLOBALS['TEST_SERVERS'][] = static function () use ($proc, $site): void {
        proc_terminate($proc);
        @proc_close($proc);
        @unlink($site['log']);
        if (getenv('ACADEMY_KEEP_TEMP')) {
            return;
        }
        try {
            db_server()->exec('DROP DATABASE IF EXISTS "' . db_name() . '" WITH (FORCE)');
            $GLOBALS['TEST_DB_MADE'] = false;
            db_server()->exec('DROP ROLE IF EXISTS "' . $site['role'] . '"');
        } catch (Throwable $e) {
            echo '  (could not drop the site\'s database or user: ' . $e->getMessage() . ")\n";
        }
        foreach ([$site['dir'] => '/academy-test-site-', test_site_backups() => '/academy-backups-academy_test_'] as $folder => $mark) {
            if (is_dir($folder) && str_contains(str_replace('\\', '/', $folder), $mark)) {
                $items = new RecursiveIteratorIterator(new RecursiveDirectoryIterator($folder, FilesystemIterator::SKIP_DOTS), RecursiveIteratorIterator::CHILD_FIRST);
                foreach ($items as $item) {
                    $item->isDir() ? @rmdir($item->getPathname()) : @unlink($item->getPathname());
                }
                @rmdir($folder);
            }
        }
    };
    for ($i = 0; @file_get_contents($site['base'] . '/favicon.svg') === false; $i++) {
        if ($i > 100) {
            throw new RuntimeException('The site did not start: ' . file_get_contents($log));
        }
        usleep(50000);
    }
    return $site;
}

/**
 * Where a built site keeps its backups: its settings name a throwaway database
 * and no folder, so the temp folder's academy-backups-<database> (backup_dir()).
 */
function test_site_backups(): string
{
    return str_replace('\\', '/', sys_get_temp_dir()) . '/academy-backups-' . db_name();
}

/**
 * backend/tools/build-dist.php with these options; its output. The build
 * refuses while a migration is a draft: the drafts the tests apply
 * (test_config_migration_drafts()) are allowed, so a site of the tests gets
 * what their databases get.
 */
function test_build(string $options): string
{
    exec(test_build_command($options) . ' 2>&1', $out, $code);
    if ($code !== 0) {
        throw new RuntimeException('The build failed: ' . implode("\n", $out));
    }
    return implode("\n", $out);
}

/** The command line of test_build(); $allowDrafts false: the build as the owner runs it. */
function test_build_command(string $options, bool $allowDrafts = true): string
{
    $drafts = $allowDrafts ? test_config_migration_drafts() : [];
    return escapeshellarg(PHP_BINARY) . ' ' . escapeshellarg(BACKEND . '/tools/build-dist.php') . " $options"
        . ($drafts ? ' --allow-draft=' . escapeshellarg(implode(',', $drafts)) : '');
}

/**
 * A form sent to a site (multipart: it may carry a file), with its cookies
 * ($jar, a file); $headers add to it (a Host of a website).
 *
 * @return array{status: int, raw: string, body: mixed}
 */
function test_form(string $base, string $url, array $fields, array $headers = [], ?string $jar = null): array
{
    $ch = curl_init($base . $url);
    curl_setopt_array($ch, [CURLOPT_POST => true, CURLOPT_POSTFIELDS => $fields, CURLOPT_RETURNTRANSFER => true, CURLOPT_TIMEOUT => 180, CURLOPT_HTTPHEADER => $headers]
        + ($jar !== null ? [CURLOPT_COOKIEFILE => $jar, CURLOPT_COOKIEJAR => $jar] : []));
    $raw = curl_exec($ch);
    if ($raw === false) {
        throw new RuntimeException("POST $url: " . curl_error($ch));
    }
    $decoded = json_decode((string) $raw, true);
    return ['status' => (int) curl_getinfo($ch, CURLINFO_RESPONSE_CODE), 'raw' => (string) $raw, 'body' => json_last_error() === JSON_ERROR_NONE ? $decoded : null];
}

/** A page of a site, with its cookies ($jar) and headers. */
function test_page(string $base, string $url, array $headers = [], ?string $jar = null): array
{
    $ch = curl_init($base . $url);
    $responseHeaders = [];
    curl_setopt_array($ch, [CURLOPT_RETURNTRANSFER => true, CURLOPT_TIMEOUT => 60, CURLOPT_HTTPHEADER => $headers,
        CURLOPT_HEADERFUNCTION => static function ($ch, string $line) use (&$responseHeaders): int {
            if (str_contains($line, ':')) {
                [$k, $v] = explode(':', $line, 2);
                $responseHeaders[strtolower(trim($k))][] = trim($v);
            }
            return strlen($line);
        }] + ($jar !== null ? [CURLOPT_COOKIEFILE => $jar, CURLOPT_COOKIEJAR => $jar] : []));
    $raw = curl_exec($ch);
    if ($raw === false) {
        throw new RuntimeException("GET $url: " . curl_error($ch));
    }
    return ['status' => (int) curl_getinfo($ch, CURLINFO_RESPONSE_CODE), 'raw' => (string) $raw, 'headers' => $responseHeaders];
}

/** What the server wrote to its error output that isn't its request log: PHP warnings, [server] errors. */
function server_problems(array $app): array
{
    $lines = preg_split('/\R/', (string) @file_get_contents($app['log']));
    return array_values(array_filter($lines, static fn (string $l): bool => (bool) preg_match('/PHP (Fatal|Parse|Warning|Notice|Deprecated)|\[server\]|\[db\]|Uncaught/i', $l)));
}

/**
 * An HTTP request with JSON in and out, as TEST_USER (a token of the test IAM)
 * unless $headers carry an Authorization of their own: another person's
 * token, or none at all (no_token()).
 *
 * @return array{status: int, body: mixed, raw: string, headers: array<string, string>}
 */
function call(string $base, string $method, string $url, $body = null, array $headers = []): array
{
    $ch = curl_init($base . $url);
    $h = $headers;
    if (!array_filter($headers, static fn (string $line): bool => (bool) preg_match('/^Authorization:/i', $line))) {
        $h = array_merge($h, test_bearer(test_token(TEST_USER)));
    }
    if ($body !== null) {
        $h[] = 'Content-Type: application/json';
    }
    $responseHeaders = [];
    curl_setopt_array($ch, [
        CURLOPT_CUSTOMREQUEST => $method,
        CURLOPT_RETURNTRANSFER => true,
        CURLOPT_HTTPHEADER => $h,
        CURLOPT_TIMEOUT => 60,
        CURLOPT_HEADERFUNCTION => static function ($ch, string $line) use (&$responseHeaders): int {
            if (str_contains($line, ':')) {
                [$k, $v] = explode(':', $line, 2);
                $responseHeaders[strtolower(trim($k))] = trim($v);
            }
            return strlen($line);
        },
    ] + ($method === 'HEAD' ? [CURLOPT_NOBODY => true] : []) + ($body !== null ? [CURLOPT_POSTFIELDS => json_text($body)] : []));
    $raw = curl_exec($ch);
    if ($raw === false) {
        throw new RuntimeException("$method $url: " . curl_error($ch));
    }
    $decoded = json_decode((string) $raw, true);
    return [
        'status' => (int) curl_getinfo($ch, CURLINFO_RESPONSE_CODE),
        'body' => json_last_error() === JSON_ERROR_NONE ? $decoded : $raw,
        'raw' => (string) $raw,
        'headers' => $responseHeaders,
    ];
}

/**
 * A request sent and left to go on, for the tests of who waits for whom:
 * 'waits' says whether it stays unanswered because it waits for a lock in the
 * database (another connection of the test holds one), 'answer' waits for its
 * answer ({status, body}). As call(): TEST_USER unless $headers say otherwise.
 *
 * @return array{waits: callable, answer: callable}
 */
function test_begin(string $base, string $method, string $url, $body = null, array $headers = []): array
{
    if (!array_filter($headers, static fn (string $line): bool => (bool) preg_match('/^Authorization:/i', $line))) {
        $headers = array_merge($headers, test_bearer(test_token(TEST_USER)));
    }
    $curl = curl_init($base . $url);
    $headers = array_merge($headers, ['Expect:'], $body === null ? [] : ['Content-Type: application/json']);
    curl_setopt_array($curl, [CURLOPT_CUSTOMREQUEST => $method, CURLOPT_RETURNTRANSFER => true, CURLOPT_HTTPHEADER => $headers, CURLOPT_TIMEOUT => 30]);
    if ($body !== null) {
        curl_setopt($curl, CURLOPT_POSTFIELDS, is_string($body) ? $body : json_text($body));
    }
    $multi = curl_multi_init();
    curl_multi_add_handle($multi, $curl);
    $answered = static function () use ($multi): bool {
        curl_multi_exec($multi, $running);
        if ($running > 0 && curl_multi_select($multi, 0.05) === -1) {
            usleep(20000);
        }
        return $running === 0;
    };
    $answer = null;
    return [
        'waits' => static function () use ($answered): bool {
            for ($until = microtime(true) + 10; microtime(true) < $until;) {
                if ($answered()) {
                    return false;
                }
                if ((int) db_value("SELECT count(*) FROM pg_stat_activity WHERE datname = current_database() AND wait_event_type = 'Lock'") > 0) {
                    return true;
                }
            }
            return false;
        },
        'answer' => static function () use ($answered, $multi, $curl, &$answer): array {
            if ($answer === null) {
                for ($until = microtime(true) + 35; !$answered() && microtime(true) < $until;) {
                    // until it is answered (or its own 30 seconds are over)
                }
                $answer = ['status' => (int) curl_getinfo($curl, CURLINFO_RESPONSE_CODE), 'body' => json_decode((string) curl_multi_getcontent($curl), true)];
                curl_multi_remove_handle($multi, $curl);
            }
            return $answer;
        },
    ];
}
