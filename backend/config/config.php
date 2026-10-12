<?php
/**
 * This copy's settings. They live only in the *.local.php files of this folder,
 * which the setup page (/setup.php, backend/setup.php) writes and git never
 * sees, and they are required: there are no defaults to fall back on. Until
 * both are there, every address but /api/site-status answers 503
 * {"code": "not_set_up"} (the anotoki library's SiteGate, backend/api/app.php),
 * and the app shows the library's "not set up yet" page - with the way to the
 * setup page only while the site was never installed (INSTALLED_LOCK).
 *
 *   database.local.php   ['host' => 'localhost', 'port' => 5432, 'name' => 'anotoki_japanese',
 *                         'user' => 'postgres', 'password' => '…']
 *   auth.local.php       ['issuer' => 'https://iam.anotoki.eu', 'client_id' => 'japanese-academy']
 *                        (on a computer, the development IAM: 'http://localhost:4300')
 *
 * People always sign in through the IAM (docs/kb/sign-in.md); who may do what
 * is their role there. Keys the earlier versions wrote are ignored, so a copy
 * set up by one keeps working: auth.local.php's 'mode' => 'iam' and
 * 'local_user_id', and app.local.php with its 'timezone'. Only a copy that was
 * set up without sign-in ('mode' => 'none') is not set up any more: there is
 * no such way now, and the setup page asks for the IAM.
 *
 * The tests run against throwaway databases with settings of their own: a
 * folder of these files, named by ACADEMY_CONFIG_DIR, and the test IAM's keys
 * from ACADEMY_JWKS_FILE (and the IAM's answer whether sign-in is required
 * from ACADEMY_APPLICATION_FILE). They are honoured only when the database they lead
 * to is an academy_test_ one, so a stray variable can never point a real
 * server at other settings. (Seven optional keys are for them alone:
 * 'jwks_file', 'application_file', 'anonymized_file' (the IAM's deleted
 * accounts, src/people.php), 'application_ttl' and 'cache_dir' in
 * auth.local.php, read by auth_jwks_file() and auth_iam_config(), and 'backups_dir'
 * and 'frontend_dir' in app.local.php, read by backup_dir() and
 * router_frontend_dir() in backend/router.php.)
 *
 * app.local.php is optional and the setup page never writes it: the owner may
 * put one on the site by FTP for the visitors' numbers ('visitors',
 * src/visitors.php) and the proxies trusted to name a visitor's address
 * ('client_address', src/client_address.php); every one has a default
 * (docs/kb/hosting.md, *Visitors on the site*). Its old 'timezone' is ignored.
 *
 * Where a request comes from has a committed default (CLIENT_ADDRESS_DEFAULTS
 * below): the site is behind Cloudflare (the owner's rule of 2026-10-11), so
 * its published ranges are the trusted proxies, and CF-Connecting-IP - pinned
 * in the code, never a setting - is believed only on a connection from one of
 * them; from anywhere else the connection's own address counts. A copy that
 * is not behind Cloudflare says so in app.local.php ('client_address' =>
 * ['trusted_proxies' => []]); a range there wider than any proxy's (an IPv4
 * prefix shorter than /8, an IPv6 one shorter than /16) is refused.
 */

declare(strict_types=1);

/** The settings files: the required ones (CONFIG_REQUIRED), and the optional app.local.php (the owner's, by FTP, or a test's). */
const CONFIG_FILES = [
    'database' => 'database.local.php',
    'auth' => 'auth.local.php',
    'app' => 'app.local.php',
];

/** What a copy needs before it is set up (the setup page writes them). */
const CONFIG_REQUIRED = ['database', 'auth'];

/**
 * The proxies whose CF-Connecting-IP names a request's address, unless
 * app.local.php's 'client_address' => ['trusted_proxies' => […]] says
 * otherwise (src/client_address.php reads them; the anotoki library's admin
 * tools read the address by the same rule - their AdminContext gets the same
 * list, src/admin.php): Cloudflare's published ranges,
 * https://www.cloudflare.com/ips-v4 and https://www.cloudflare.com/ips-v6 as
 * of 2026-10-11 (15 IPv4, 7 IPv6 - the library's ClientAddress::CLOUDFLARE,
 * which backend/tests/api/visitors.test.php holds them equal to). They change
 * rarely: refresh them from those two addresses when Cloudflare announces a
 * change. (The header is no setting: the code pins Cloudflare's own.)
 */
const CLIENT_ADDRESS_DEFAULTS = [
    'trusted_proxies' => [
        // IPv4 (https://www.cloudflare.com/ips-v4, 2026-10-11)
        '173.245.48.0/20',
        '103.21.244.0/22',
        '103.22.200.0/22',
        '103.31.4.0/22',
        '141.101.64.0/18',
        '108.162.192.0/18',
        '190.93.240.0/20',
        '188.114.96.0/20',
        '197.234.240.0/22',
        '198.41.128.0/17',
        '162.158.0.0/15',
        '104.16.0.0/13',
        '104.24.0.0/14',
        '172.64.0.0/13',
        '131.0.72.0/22',
        // IPv6 (https://www.cloudflare.com/ips-v6, 2026-10-11)
        '2400:cb00::/32',
        '2606:4700::/32',
        '2803:f800::/32',
        '2405:b500::/32',
        '2405:8100::/32',
        '2a06:98c0::/29',
        '2c0f:f248::/32',
    ],
];

/**
 * The setup page's lock: written once its setup finished on a website
 * (backend/setup.php), never on this computer. From then on nobody is offered
 * the setup page again, whatever becomes of the settings: a site without them
 * says it is not available right now, not that it is not set up (the
 * SiteGate's `installed`, backend/api/app.php).
 */
const INSTALLED_LOCK = BACKEND . '/storage/installed.lock';

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
    $application = config_env_application($name);
    if ($application !== null) {
        $config['auth']['application_file'] = $application;
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
 * The test IAM's answer whether sign-in is required, named in the environment
 * (ACADEMY_APPLICATION_FILE; src/access.php) — for a throwaway database only.
 */
function config_env_application(string $database): ?string
{
    $file = getenv('ACADEMY_APPLICATION_FILE');
    return is_string($file) && $file !== '' && config_is_test_db($database) ? $file : null;
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
 * One setting by its path: 'db.host', 'auth.issuer', 'app.backups_dir' …, or null
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
 * Why this copy is not set up yet, or null when it is: both required settings
 * files there, and each value in them one the app can use. The setup page writes them;
 * nothing else does.
 */
function config_problem(): ?string
{
    try {
        $all = config_all();
    } catch (RuntimeException $e) {
        return $e->getMessage();
    }
    foreach (CONFIG_REQUIRED as $which) {
        if (config_read_file($which) === null) {
            return 'backend/config/' . CONFIG_FILES[$which] . ' is missing';
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
    // The earlier versions' keys ('mode' => 'iam', 'local_user_id') are ignored. A copy
    // set up without sign-in has no IAM to name: it is set up again, the one way there is.
    if (($auth['mode'] ?? null) === 'none') {
        return 'sign-in without the IAM is gone: open /setup.php and save';
    }
    if (!is_string($auth['issuer'] ?? null) || !preg_match('~^https?://[^/\s]+(/[^\s]*)?$~', $auth['issuer'])) {
        return 'the IAM\'s address (issuer) in backend/config/auth.local.php is missing';
    }
    if (!is_string($auth['client_id'] ?? null) || !preg_match('/^[a-z0-9-]{2,64}$/D', $auth['client_id'])) {
        return 'the client id in backend/config/auth.local.php is missing';
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
