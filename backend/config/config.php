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
 *
 * cloudflare.local.php is optional too, the same file in every anotoki site,
 * and the setup page never asks for, writes or shows it: the owner puts it on the
 * site by FTP. It holds the secret the owner's Cloudflare zone adds to every
 * request through it, in X-Anotoki-Origin (a Transform Rule - the owner's
 * decision of 2026-10-13):
 *
 *   cloudflare.local.php ['origin_secret' => '<a long random value, 32 characters or more>']
 *
 * With it, CF-Connecting-IP is believed only on a request that carries that
 * secret (config_origin_secret(), src/client_address.php); without the file,
 * from the trusted proxies alone, as before. A file that is there but yields
 * no usable secret fails closed - one that cannot be read cleanly, and one
 * read cleanly that names none (blank, no list, a misspelt or another key, a
 * value that is not a string; since 2026-10-18): it stands for a secret no
 * request carries, so every request from Cloudflare's ranges counts as the
 * edge it came from until it is mended (config_read_cloudflare()). Only
 * deleting the file switches the secret off. The secret is never shown or
 * logged.
 *
 * Every one of these files is read the same careful way (config_require_cleanly()):
 * a file saved by hand with a byte-order mark, without its <?php line, or with
 * text after a closing tag would print what it holds - database.local.php
 * prints its password - ahead of every answer when PHP requires it. Whatever a
 * file prints is caught and never sent, and the file is passed over: a
 * required one (database, auth) leaves the copy not set up (config_problem()
 * names the file and its fault), app.local.php means its defaults, and
 * cloudflare.local.php the secret nobody carries. A fault is said in PHP's
 * error log at most once a day (config_said()), by its kind and line or the
 * bytes the file printed - never its text, nor what PHP said of it, which can
 * quote it.
 */

declare(strict_types=1);

/**
 * The settings files: the required ones (CONFIG_REQUIRED), the optional app.local.php (the owner's, by FTP, or a
 * test's) and the optional cloudflare.local.php (the origin secret, the owner's, by FTP).
 */
const CONFIG_FILES = [
    'database' => 'database.local.php',
    'auth' => 'auth.local.php',
    'app' => 'app.local.php',
    'cloudflare' => 'cloudflare.local.php',
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
const INSTALLED_LOCK = STATE . '/storage/installed.lock';

/** The folder the settings are read from. */
function config_dir(): string
{
    $dir = getenv('ACADEMY_CONFIG_DIR');
    return is_string($dir) && $dir !== '' ? rtrim(str_replace('\\', '/', $dir), '/') : str_replace('\\', '/', STATE) . '/config';
}

/** Is this a throwaway database of the tests (academy_test_…, never the template)? */
function config_is_test_db(string $name): bool
{
    return (bool) preg_match('/^academy_test_[a-z0-9_]+$/D', $name) && $name !== 'academy_test_template';
}

/**
 * The site's own storage: backend/storage/ - or, for a server of the tests,
 * their own settings folder (ACADEMY_CONFIG_DIR, which counts for an
 * academy_test_ database alone: config_all() refuses any other), so nothing
 * a test writes - a log line of a copy that is not set up included - lands in
 * this copy's storage. Here, beside the settings, because the settings' own
 * notes (config_said()) are kept there too, before the rest of the app is
 * loaded.
 */
function storage_dir(): string
{
    return getenv('ACADEMY_CONFIG_DIR') ? config_dir() : str_replace('\\', '/', STATE) . '/storage';
}

/**
 * Requires a PHP file of this folder - every settings file, and the setup
 * page's token (backend/setup.php) - read cleanly, or not at all.
 *
 * A file that does not start with <?php - saved by hand with a byte-order
 * mark, a blank line or a space before it, or without that line at all - is
 * passed over before PHP ever compiles it: required, it would print what
 * comes before (all of it, the password or the secret too, where the <?php
 * line is missing), and one with declare(strict_types=1) after such a start
 * is a compile-time fatal error ("strict_types declaration must be the very
 * first statement") that no handler catches - every request, where the site
 * stands included, would be a 500 instead of "not set up", and a
 * cloudflare.local.php would never fail closed (the checkpoint review of
 * 2026-10-18). The first five bytes are read alone, never the rest.
 *
 * A file that does start with it is required inside an output buffer: what it
 * prints all the same - text after a closing tag, an echo, a buffer of its
 * own left open - is caught, sent nowhere, and the file is read as no file,
 * its problem the number of bytes it printed. A file PHP cannot parse or run
 * (a ParseError, an Error, a warning the app's handler throws:
 * src/bootstrap.php) or may not open is no file either, said by the kind of
 * error and its line alone - never the error's message, which can quote the
 * file. It runs in a function of its own, so the file sees none of the
 * caller's variables.
 *
 * ['value' => what the file returned, 'problem' => null], or
 * ['value' => null, 'problem' => why it was not read]. What a caller makes of
 * a file not read is its own: the database's or the auth's leaves the copy
 * not set up (config_problem()), app.local.php's its defaults,
 * cloudflare.local.php's a secret no request carries, the token's no token.
 *
 * @return array{value: mixed, problem: ?string}
 */
function config_require_cleanly(string $file): array
{
    if (is_dir($file)) {
        return ['value' => null, 'problem' => 'cannot be read (a folder stands in its place)'];
    }
    if (!is_readable($file)) {
        return ['value' => null, 'problem' => 'cannot be read (PHP may not open it)'];
    }
    $head = @file_get_contents($file, false, null, 0, 5);
    if ($head === false) {
        return ['value' => null, 'problem' => 'cannot be read (PHP may not open it)'];
    }
    if (strtolower($head) !== '<?php') {
        return ['value' => null, 'problem' => 'does not start with <?php (a byte-order mark, a blank line or a space before it, or no <?php line at all)'];
    }
    $level = ob_get_level();
    $value = null;
    $failure = null;
    $printed = 0;
    ob_start();
    try {
        $value = (static function (string $path) {
            return require $path;
        })($file);
    } catch (Throwable $e) {
        $failure = 'cannot be read (' . get_class($e) . ' on line ' . $e->getLine() . ')';
    } finally {
        // Every buffer down to the caller's: one the file opened and left open too.
        while (ob_get_level() > $level) {
            $buffer = ob_get_clean();
            if ($buffer === false) {
                break;
            }
            $printed += strlen($buffer);
        }
    }
    if ($failure !== null) {
        return ['value' => null, 'problem' => $failure];
    }
    if ($printed > 0) {
        return ['value' => null, 'problem' => "prints $printed bytes of its own (text after a closing tag, or something it echoes)"];
    }
    return ['value' => $value, 'problem' => null];
}

/**
 * One settings file as written: the list it returns, or null when it is
 * missing, cannot be read cleanly (config_require_cleanly()), or returns no
 * list. $problem says why it is null for a file that is there: its fault -
 * by its kind and line, or the bytes it printed, never its text - or that it
 * holds no settings. A fault is said in PHP's error log, at most once a day.
 */
function config_read_file(string $which, ?string &$problem = null): ?array
{
    $problem = null;
    $file = config_dir() . '/' . CONFIG_FILES[$which];
    if (!is_file($file)) {
        return null;
    }
    $read = config_require_cleanly($file);
    if ($read['problem'] !== null) {
        $problem = $read['problem'];
        config_said(
            STATE_SHOWN .
                'config/' .
                CONFIG_FILES[$which] .
                " $problem: " .
                (in_array($which, CONFIG_REQUIRED, true) ? 'this copy is not set up until it is mended.' : 'its defaults hold until it is mended.'),
        );
        return null;
    }
    if (!is_array($read['value'])) {
        $problem = 'holds no settings (it returns no list of them)';
        return null;
    }
    return $read['value'];
}

/**
 * cloudflare.local.php as the site reads it (the owner's decision of
 * 2026-10-13 and its security review, and his "do as you think is the best"
 * of 2026-10-18 - the anotoki family's rule on every site, docs/kb/decisions.md):
 *
 *   - no file: null, no secret - CF-Connecting-IP from the trusted proxies
 *     alone, as before the file. Deleting the file is the one way to switch
 *     the secret off;
 *   - a file read cleanly whose origin_secret is a string with something in
 *     it: the file's list (config_origin_secret() trims the value: a header's
 *     value never starts or ends with a space);
 *   - a file that is there but yields no such secret: a secret no request
 *     carries (config_origin_secret_nobody_carries()), so every request from
 *     Cloudflare's ranges counts as the edge it came from until the file is
 *     mended. That is a file that cannot be read cleanly - it does not start
 *     with <?php, it prints anything, PHP cannot parse or run it, or may not
 *     open it, a folder in its place included -, and one read cleanly that
 *     names no secret: blank or only spaces, no list (the value alone, or
 *     nothing returned), a misspelt or another key, a value that is not a
 *     string (a number, a list, null, true). Each is a slip in a file its
 *     owner put there to hold a secret, and believing CF-Connecting-IP from
 *     Cloudflare's ranges alone - from anybody's Worker there - would be the
 *     looser reading: a slip never switches the check off. The site keeps
 *     running all the same: the file is optional, never a reason for "not
 *     set up".
 *
 * Each fault is said in PHP's error log at most once a day, by its kind and
 * line or the bytes the file printed, or that it names no secret - never its
 * text, and never the secret.
 */
function config_read_cloudflare(): ?array
{
    $file = config_dir() . '/' . CONFIG_FILES['cloudflare'];
    // Anything in the file's place counts as the file - a folder too: only deleting it switches the secret off.
    if (!file_exists($file)) {
        return null;
    }
    $read = config_require_cleanly($file);
    if ($read['problem'] !== null) {
        config_said(
            "backend/config/cloudflare.local.php {$read['problem']}: no request carries its secret, so every request from Cloudflare's ranges counts as the edge it came from until it is mended.",
        );
        return ['origin_secret' => config_origin_secret_nobody_carries()];
    }
    $values = $read['value'];
    $secret = is_array($values) ? $values['origin_secret'] ?? null : null;
    if (!is_string($secret) || trim($secret) === '') {
        config_said(
            STATE_SHOWN .
                'config/cloudflare.local.php holds no origin_secret (a string with something in it): no request carries its secret, so every request from Cloudflare\'s ranges counts as the edge it came from until the file names one - deleting the file switches the secret off.',
        );
        return ['origin_secret' => config_origin_secret_nobody_carries()];
    }
    return $values;
}

/**
 * A secret no request can carry: 256 random bits, made once a process and
 * never printed, logged or stored, so no X-Anotoki-Origin matches it - what a
 * cloudflare.local.php that is there but cannot be read cleanly, or names no
 * usable secret, stands for.
 */
function config_origin_secret_nobody_carries(): string
{
    static $secret = null;
    return $secret ??= bin2hex(random_bytes(32));
}

/**
 * A line in PHP's error log about a settings file written by hand, or a
 * setting in one: at most once a day for each thing said - the files are read
 * on every request, and a fault left in one is the same fault tomorrow. A
 * stamp in the storage's cache (storage/cache/said-<a hash of the line>.logged)
 * says when it was said last; where none can be written, once a process.
 * Never a value of the file: the callers say its name and its fault alone.
 */
function config_said(string $what): void
{
    static $saidWithoutStamp = [];
    $stamp = storage_dir() . '/cache/said-' . substr(hash('sha256', $what), 0, 16) . '.logged';
    clearstatcache(true, $stamp);
    $last = @filemtime($stamp);
    if ($last !== false && time() - $last < 86400) {
        return;
    }
    if (!((is_dir(dirname($stamp)) || @mkdir(dirname($stamp), 0700, true)) && @touch($stamp))) {
        if (isset($saidWithoutStamp[$what])) {
            return;
        }
        $saidWithoutStamp[$what] = true;
    }
    error_log("[config] $what");
}

/**
 * What the last read of the settings (config_all()) found wrong with each
 * file that is there: [which => why] - it cannot be read cleanly (its fault),
 * or it holds no settings. A missing file is no entry: config_problem() says
 * that. Set by config_all(), read by config_problem().
 *
 * @return array<string, string>
 */
function config_file_problems(?array $found = null): array
{
    static $problems = [];
    if ($found !== null) {
        $problems = $found;
    }
    return $problems;
}

/**
 * The settings: ['db' => database.local.php, 'auth' => auth.local.php,
 * 'app' => app.local.php, 'cloudflare' => cloudflare.local.php], each [] when
 * its file is missing or cannot be read cleanly (config_file_problems() keeps
 * why; a cloudflare.local.php that is there but cannot be read cleanly, or
 * names no usable secret, is a secret no request carries). $reload reads the files again (the setup page, after it
 * wrote them). A test folder of settings (ACADEMY_CONFIG_DIR) that names
 * anything but a test database stops the app.
 */
function config_all(bool $reload = false): array
{
    static $config = null;
    if ($config !== null && !$reload) {
        return $config;
    }
    $problems = [];
    $read = static function (string $which) use (&$problems): array {
        $values = config_read_file($which, $problem);
        if ($problem !== null) {
            $problems[$which] = $problem;
        }
        return $values ?? [];
    };
    $config = [
        'db' => $read('database'),
        'auth' => $read('auth'),
        'app' => $read('app'),
        'cloudflare' => config_read_cloudflare() ?? [],
    ];
    config_file_problems($problems);
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
 * The secret the owner's Cloudflare zone adds to every request through it
 * (X-Anotoki-Origin, the library's ClientAddress::ORIGIN_HEADER: a Transform
 * Rule - the owner's decision of 2026-10-13), from cloudflare.local.php; null
 * without one. Cloudflare's published ranges are every Cloudflare customer's,
 * not the owner's zone alone: anybody's Worker can reach the site from them
 * and write the CF-Connecting-IP it likes, a new one for every request. With
 * the secret that header is believed only on a request that carries it, and
 * any other request from Cloudflare counts as the edge it came from - coarser,
 * never looser (src/client_address.php, and the admin tools' context,
 * academy_admin_context()). Only a string with something in it is a secret
 * (trimmed: a header's value never starts or ends with a space). A file that
 * is there but cannot be read cleanly, or names no such string, is a secret
 * no request carries (config_read_cloudflare()) - so null means no file at
 * all, or, in settings set in code (a test tool's config_overrides()), no
 * such string set. Settings that cannot be read at all
 * (config_all() refuses a test's folder of settings that names a real
 * database) are none too: the site's gate says what is wrong.
 */
function config_origin_secret(): ?string
{
    try {
        $secret = config('cloudflare.origin_secret');
    } catch (RuntimeException $e) {
        return null;
    }
    return is_string($secret) && trim($secret) !== '' ? trim($secret) : null;
}

/**
 * Why this copy is not set up yet, or null when it is: both required settings
 * files there, each read cleanly (config_require_cleanly(): one that prints, or
 * that PHP cannot read, is named with its fault - never its text), and each
 * value in them one the app can use. The setup page writes them; nothing else
 * does.
 */
function config_problem(): ?string
{
    try {
        $all = config_all();
    } catch (RuntimeException $e) {
        return $e->getMessage();
    }
    $problems = config_file_problems();
    foreach (CONFIG_REQUIRED as $which) {
        if (isset($problems[$which])) {
            return STATE_SHOWN . 'config/' . CONFIG_FILES[$which] . ' ' . $problems[$which];
        }
        if (!is_file(config_dir() . '/' . CONFIG_FILES[$which])) {
            return STATE_SHOWN . 'config/' . CONFIG_FILES[$which] . ' is missing';
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
    config_put(config_dir() . '/' . CONFIG_FILES[$which], "<?php\n// Written by $by. This copy's own settings: git ignores this file, never commit it.\n\nreturn " . var_export($values, true) . ";\n");
    config_all(true);
}

/**
 * A folder of the state (config/, storage/ and its folders), made if it is
 * missing - the first setup of a site, whose release never brings them. On the
 * host it gets a deny-all .htaccess of its own, though the site's switch never
 * sends a request into it (in a checkout nothing is served from backend/).
 */
function config_state_folder(string $dir): void
{
    if (!is_dir($dir) && !@mkdir($dir, 0700, true) && !is_dir($dir)) {
        throw new RuntimeException('Cannot make the folder ' . $dir . ': the web server may not write there.');
    }
    if (STATE !== BACKEND && !is_file($dir . '/.htaccess')) {
        @file_put_contents(
            $dir . '/.htaccess',
            "# Not for the web: only PHP reads these files.\n<IfModule mod_authz_core.c>\n    Require all denied\n</IfModule>\n" .
                "<IfModule !mod_authz_core.c>\n    Order allow,deny\n    Deny from all\n</IfModule>\n",
        );
    }
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
    config_state_folder(dirname($file));
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
