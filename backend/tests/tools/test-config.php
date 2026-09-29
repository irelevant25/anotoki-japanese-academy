<?php
/**
 * The tests' own settings: a folder of the three files the app requires
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
 * Writes the settings folder $dir for database $name: auth mode $auth ('none',
 * or 'iam' through the test IAM, whose keys are in $jwks), backups in $backups,
 * and optionally the built frontend in $frontend.
 */
function test_config_write(string $dir, string $name, string $auth, ?string $jwks, string $backups, ?string $frontend = null): void
{
    if (!preg_match('/^academy_test_[a-z0-9_]+$/D', $name) || $name === 'academy_test_template') {
        throw new RuntimeException("Not a test database name: $name");
    }
    $server = test_config_server_file();
    if (!is_file($server)) {
        throw new RuntimeException('The tests make their databases on the PostgreSQL server of backend/config/database.local.php, and there is none:'
            . ' set this copy up first (php backend/server.php, then open http://127.0.0.1:8200/setup.php).');
    }
    if (!is_dir($dir) && !mkdir($dir, 0700, true) && !is_dir($dir)) {
        throw new RuntimeException("Cannot make $dir");
    }
    $write = static function (string $file, string $php) use ($dir): void {
        file_put_contents("$dir/$file", "<?php\n// A test's own settings (backend/tests/tools/test-config.php).\n\n$php\n");
    };
    $write('database.local.php', 'return ' . var_export(['name' => $name], true) . ' + (require ' . var_export($server, true) . ');');
    $write('auth.local.php', 'return ' . var_export($auth === 'iam'
        ? ['mode' => 'iam', 'issuer' => 'https://iam.test', 'client_id' => 'japanese-academy', 'local_user_id' => 1, 'jwks_file' => $jwks]
        : ['mode' => 'none', 'local_user_id' => 1], true) . ';');
    $app = ['timezone' => test_config_timezone(), 'backups_dir' => $backups];
    if ($frontend !== null) {
        $app['frontend_dir'] = $frontend;
    }
    $write('app.local.php', 'return ' . var_export($app, true) . ';');
}

/** The developer's time zone (their app.local.php), or this computer's. */
function test_config_timezone(): string
{
    $file = dirname(test_config_server_file()) . '/app.local.php';
    $app = is_file($file) ? require $file : null;
    if (is_array($app) && is_string($app['timezone'] ?? null)) {
        return $app['timezone'];
    }
    return class_exists('IntlTimeZone') ? IntlTimeZone::createDefault()->getID() : 'UTC';
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
    @rmdir($dir);
}
