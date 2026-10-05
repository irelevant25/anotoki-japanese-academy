<?php
/**
 * The tests' own settings: a folder of the files the app reads
 * (backend/config/config.php), for one throwaway database. The app reads such
 * a folder when ACADEMY_CONFIG_DIR names it, and only for an academy_test_
 * database. Plain PHP, loaded before the app (tests/lib.php) or by
 * tests/tools/testdb.php (for the Node scripts).
 *
 * The database server, its user and password are the developer's, from
 * backend/config/database.local.php (the setup page wrote it): the test file
 * requires that one rather than holding a copy of the password.
 */

declare(strict_types=1);

/** The developer's database settings: where the throwaway databases are made. */
function test_config_server_file(): string
{
    return str_replace('\\', '/', dirname(__DIR__, 2)) . '/config/database.local.php';
}

/**
 * The migrations of backend/migrations/ still being written: every file but
 * 001 whose last line is not its "-- end of NNN" (the app's rule:
 * db_migration_sql()), by name. The tests name them in
 * ACADEMY_MIGRATION_DRAFTS, so their throwaway databases get what the drafts
 * make; nothing else does.
 */
function test_config_migration_drafts(): array
{
    $drafts = [];
    foreach (glob(dirname(__DIR__, 2) . '/migrations/*.sql') ?: [] as $file) {
        $name = basename($file);
        $lines = preg_split('/\R/', rtrim((string) file_get_contents($file)));
        if ($name !== '001_init.sql' && end($lines) !== '-- end of ' . substr($name, 0, 3)) {
            $drafts[] = $name;
        }
    }
    sort($drafts);
    return $drafts;
}

/**
 * Writes the settings folder $dir for database $name: sign-in through the
 * test IAM (issuer https://iam.test, which exists nowhere), whose keys are
 * the JWKS file $jwks; backups in $backups, and optionally the built frontend
 * in $frontend. $issuer names another IAM than https://iam.test: the stand-in
 * IAM's address (tests/tools/stand-in-iam.php), whose tokens carry it. The
 * SDK's cache is DIR/cache, never backend/storage/cache/. $auth adds to
 * auth.local.php: 'application_file' (the IAM's answer whether sign-in is
 * required, from a file: a test without a stand-in IAM must name one, or the
 * server would ask an issuer that exists nowhere), 'application_ttl' (seconds
 * the answer is kept, for a test that switches it). $app adds to
 * app.local.php: 'visitors' (the visitors' limits, src/visitors.php),
 * 'client_address' (the trusted proxies).
 */
function test_config_write(string $dir, string $name, string $jwks, string $backups, ?string $frontend = null, string $issuer = 'https://iam.test', array $auth = [], array $app = []): void
{
    if (!preg_match('/^academy_test_[a-z0-9_]+$/D', $name) || $name === 'academy_test_template') {
        throw new RuntimeException("Not a test database name: $name");
    }
    $server = test_config_server_file();
    if (!is_file($server)) {
        throw new RuntimeException('The tests make their databases on the PostgreSQL server of backend/config/database.local.php, and there is none:'
            . ' set this copy up first (composer start in backend/, then open http://localhost:8200/setup.php).');
    }
    if (!is_dir($dir) && !mkdir($dir, 0700, true) && !is_dir($dir)) {
        throw new RuntimeException("Cannot make $dir");
    }
    $write = static function (string $file, string $php) use ($dir): void {
        file_put_contents("$dir/$file", "<?php\n// A test's own settings (backend/tests/tools/test-config.php).\n\n$php\n");
    };
    $write('database.local.php', 'return ' . var_export(['name' => $name], true) . ' + (require ' . var_export($server, true) . ');');
    $write('auth.local.php', 'return ' . var_export(['issuer' => $issuer, 'client_id' => 'japanese-academy', 'jwks_file' => $jwks, 'cache_dir' => "$dir/cache"] + $auth, true) . ';');
    $app = ['backups_dir' => $backups] + $app;
    if ($frontend !== null) {
        $app['frontend_dir'] = $frontend;
    }
    $write('app.local.php', 'return ' . var_export($app, true) . ';');
}

/** Removes a settings folder of the tests. */
function test_config_remove(string $dir): void
{
    if (!str_contains(str_replace('\\', '/', $dir), '/academy-test-config-')) {
        return;
    }
    foreach (glob("$dir/*.php") ?: [] as $file) {
        @unlink($file);
    }
    // the SDK's cache: the key set, the IAM's answer, its lock
    foreach (array_diff(is_dir("$dir/cache") ? (scandir("$dir/cache") ?: []) : [], ['.', '..']) as $file) {
        @unlink("$dir/cache/$file");
    }
    @rmdir("$dir/cache");
    @rmdir($dir);
}
