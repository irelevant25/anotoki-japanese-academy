<?php
/**
 * This copy's settings. They live only in the *.local.php files of this folder,
 * which the setup page (/setup.php, backend/setup.php) writes and git never
 * sees, and they are required: there are no defaults to fall back on. Until
 * all three are there, every address with data answers 503
 * {"code": "not_set_up"}, and the app shows its "not set up yet" page.
 *
 *   database.local.php   ['host' => 'localhost', 'port' => 5432, 'name' => 'japanese_academy',
 *                         'user' => 'postgres', 'password' => '…']
 *   auth.local.php       ['mode' => 'none', 'local_user_id' => 1]                  the owner's own computer
 *                        ['mode' => 'iam', 'issuer' => 'https://iam.anotoki.eu',   a website (or a development
 *                         'client_id' => 'japanese-academy', 'local_user_id' => 1]  copy against the dev IAM)
 *   app.local.php        ['timezone' => 'Europe/Bratislava']
 *
 * local_user_id is the owner's IAM user id: whom auth mode none acts as, and
 * whose the old JSON files and version-1 backups are. Sign-in (docs/kb/sign-in.md)
 * is this deployment configuration and never a request's.
 *
 * The tests run against throwaway databases with settings of their own: a
 * folder of these three files, named by ACADEMY_CONFIG_DIR, and the test IAM's
 * keys from ACADEMY_JWKS_FILE. Both are honoured only when the database they
 * lead to is an academy_test_ one, so a stray variable can never point a real
 * server at other settings. (Three optional keys are for them alone:
 * 'jwks_file' in auth.local.php, read by auth_jwks_file(), and 'backups_dir'
 * and 'frontend_dir' in app.local.php, read by backup_dir() and
 * server_frontend_dir().)
 */

declare(strict_types=1);

/** The settings files, and what each holds (for the setup page and the not-set-up answer). */
const CONFIG_FILES = [
    'database' => 'database.local.php',
    'auth' => 'auth.local.php',
    'app' => 'app.local.php',
];

/** The folder the settings are read from. */
function config_dir(): string
{
    $dir = getenv('ACADEMY_CONFIG_DIR');
    return is_string($dir) && $dir !== '' ? rtrim(str_replace('\\', '/', $dir), '/') : str_replace('\\', '/', __DIR__);
}

/** Is this a throwaway database of the tests (academy_test_…, never the template)? */
function config_is_test_db(string $name): bool
{
    return (bool) preg_match('/^academy_test_[a-z0-9_]+$/D', $name) && $name !== 'academy_test_template';
}

/** One settings file as written, or null when it is missing or not a settings file. */
function config_read_file(string $which): ?array
{
    $file = config_dir() . '/' . CONFIG_FILES[$which];
    if (!is_file($file)) {
        return null;
    }
    try {
        $values = require $file;
    } catch (ParseError $e) {
        return null; // half written by hand, say: not a settings file
    }
    return is_array($values) ? $values : null;
}

/**
 * The settings: ['db' => database.local.php, 'auth' => auth.local.php,
 * 'app' => app.local.php], each [] when its file is missing. $reload reads the
 * files again (the setup page, after it wrote them). A test folder of settings
 * (ACADEMY_CONFIG_DIR) that names anything but a test database stops the app.
 */
function config_all(bool $reload = false): array
{
    static $config = null;
    if ($config !== null && !$reload) {
        return $config;
    }
    $config = [
        'db' => config_read_file('database') ?? [],
        'auth' => config_read_file('auth') ?? [],
        'app' => config_read_file('app') ?? [],
    ];
    $name = (string) ($config['db']['name'] ?? '');
    if (getenv('ACADEMY_CONFIG_DIR') && !config_is_test_db($name)) {
        throw new RuntimeException('ACADEMY_CONFIG_DIR is for the tests\' throwaway databases (academy_test_…) only, not for ' . ($name !== '' ? $name : 'a database without a name') . '.');
    }
    $jwks = config_env_jwks($name);
    if ($jwks !== null) {
        $config['auth']['jwks_file'] = $jwks;
    }
    foreach (config_overrides() as $section => $values) {
        $config[$section] = array_replace($config[$section], $values);
    }
    return $config;
}

/** The test IAM's keys file named in the environment (ACADEMY_JWKS_FILE) — for a throwaway database only. */
function config_env_jwks(string $database): ?string
{
    $jwks = getenv('ACADEMY_JWKS_FILE');
    return is_string($jwks) && $jwks !== '' && config_is_test_db($database) ? $jwks : null;
}

/**
 * Settings changed in this process only, for the test tools (backend/tests/tools/testdb.php
 * works on the test template; it names it here). Never written anywhere.
 */
function config_overrides(?array $set = null): array
{
    static $overrides = [];
    if ($set !== null) {
        $overrides = $set;
        config_all(true);
    }
    return $overrides;
}

/**
 * One setting by its path: 'db.host', 'auth.mode', 'app.timezone' …, or null
 * when it is not set.
 */
function config(string $key)
{
    $value = config_all();
    foreach (explode('.', $key) as $part) {
        if (!is_array($value) || !array_key_exists($part, $value)) {
            return null;
        }
        $value = $value[$part];
    }
    return $value;
}

/**
 * Why this copy is not set up yet, or null when it is: every settings file
 * there, and each value in it one the app can use. The setup page writes them;
 * nothing else does.
 */
function config_problem(): ?string
{
    try {
        $all = config_all();
    } catch (RuntimeException $e) {
        return $e->getMessage();
    }
    foreach (CONFIG_FILES as $which => $file) {
        if (config_read_file($which) === null) {
            return "backend/config/$file is missing";
        }
    }
    $db = $all['db'];
    if (!is_string($db['host'] ?? null) || !preg_match('/^[A-Za-z0-9._:-]{1,100}$/D', $db['host'])) {
        return 'the database server in backend/config/database.local.php is not valid';
    }
    if (!is_int($db['port'] ?? null) || $db['port'] < 1 || $db['port'] > 65535) {
        return 'the database port in backend/config/database.local.php is not valid';
    }
    if (!is_string($db['name'] ?? null) || !preg_match('/^[A-Za-z0-9_]{1,63}$/D', $db['name'])) {
        return 'the database name in backend/config/database.local.php is not valid';
    }
    if (!is_string($db['user'] ?? null) || $db['user'] === '' || !is_string($db['password'] ?? null)) {
        return 'the database user or password in backend/config/database.local.php is missing';
    }
    $auth = $all['auth'];
    $mode = $auth['mode'] ?? null;
    if ($mode !== 'iam' && $mode !== 'none') {
        return "auth.mode in backend/config/auth.local.php must be 'iam' or 'none'";
    }
    if ($mode === 'iam' && (!is_string($auth['issuer'] ?? null) || !preg_match('~^https?://[^/\s]+(/[^\s]*)?$~', $auth['issuer']))) {
        return 'the IAM\'s address (issuer) in backend/config/auth.local.php is missing';
    }
    if ($mode === 'iam' && (!is_string($auth['client_id'] ?? null) || !preg_match('/^[a-z0-9-]{2,64}$/D', $auth['client_id']))) {
        return 'the client id in backend/config/auth.local.php is missing';
    }
    if (!is_int($auth['local_user_id'] ?? null) || $auth['local_user_id'] < 1) {
        return 'local_user_id in backend/config/auth.local.php is missing';
    }
    $tz = $all['app']['timezone'] ?? null;
    if (!is_string($tz) || !in_array($tz, DateTimeZone::listIdentifiers(DateTimeZone::ALL_WITH_BC), true)) {
        return 'the time zone in backend/config/app.local.php is not valid';
    }
    return null;
}

/** Is this copy set up (config_problem() finds nothing)? */
function config_set_up(): bool
{
    return config_problem() === null;
}

/** Writes one settings file and reads the settings again (config_put()). */
function config_write(string $which, array $values, string $by = 'the setup page'): void
{
    config_put(config_dir() . '/' . CONFIG_FILES[$which], "<?php\n// Written by $by. This copy's own settings: git ignores this file, never commit it.\n\nreturn "
        . var_export($values, true) . ";\n");
    config_all(true);
}

/**
 * Writes a PHP file of this folder: the settings, or the setup page's token.
 * Only its owner may read it: it may hold the database password, and a hosted
 * site shares its server with other people's sites. (Both are no-ops on
 * Windows, where files have ACLs instead.) Written aside and renamed, so a
 * request never reads half of one. Throws a RuntimeException when it cannot.
 */
function config_put(string $file, string $php): void
{
    $umask = umask(0077);
    try {
        $tmp = $file . '.' . bin2hex(random_bytes(6)) . '.tmp';
        if (@file_put_contents($tmp, $php) !== strlen($php)) {
            @unlink($tmp);
            throw new RuntimeException('Cannot write ' . basename($file) . ' in ' . dirname($file) . ': the web server may not write there.');
        }
        @chmod($tmp, 0600);
        for ($i = 0; !@rename($tmp, $file); $i++) {
            if ($i >= 8) {
                @unlink($tmp);
                throw new RuntimeException('Cannot write ' . basename($file) . ' in ' . dirname($file) . '.');
            }
            usleep(25000 * ($i + 1)); // Windows can hold a fresh file for a moment
        }
    } finally {
        umask($umask);
    }
    // a PHP cache that has seen the old file must not answer the next require with it
    if (function_exists('opcache_invalidate')) {
        @opcache_invalidate($file, true);
    }
}
