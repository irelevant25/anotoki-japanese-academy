<?php
/**
 * The setup page, /setup.php: how a copy of Japanese Academy is set up, on
 * the owner's computer, a developer's, or a website. It writes this copy's
 * settings (backend/config/*.local.php, which the app requires), and builds the
 * database: makes it if it is missing and the user may, applies the migrations
 * (after a raw copy of every table when it holds study data), builds the study
 * content, and brings data in — the owner's JSON files of the first version,
 * once, or a backup from their computer, into their IAM user id.
 *
 * Two ways, told apart by where the request comes from:
 *
 *   this computer   PHP's built-in server (php backend/server.php, the launchers),
 *                   a request straight from 127.0.0.1 or localhost
 *                   (auth_from_this_computer()). No token: a nonce in a cookie
 *                   and in the form (SameSite=Strict) keeps other sites' pages
 *                   from sending it. It stays, and can be run again: it shows
 *                   what is set, never the password (left empty, the saved one
 *                   stays). It offers sign-in off (auth mode none) for the
 *                   owner's own copy, or through an IAM — the development IAM
 *                   at http://localhost:4300 by default.
 *   a website       first, proof of owning the server: a token it writes into
 *                   backend/config/setup-token.local.php, which only FTP reaches
 *                   (it is never shown here). Sign-in through the IAM only. When
 *                   done it writes backend/storage/installed.lock, then deletes
 *                   the token file and itself; with the lock there it refuses to
 *                   run (and deletes itself if it is uploaded again). To run it
 *                   again on purpose, delete the lock and upload it again.
 *
 * "Test connection" buttons try the database and the IAM (its
 * {issuer}/.well-known/openid-configuration) without sending the whole form.
 *
 * The owner's computer, after the move to backend/ + frontend/: the settings of
 * the version before (src/config.local.php) are offered, their password
 * included (never shown), and the setup brings the database up to date — a raw
 * copy of every table, migrations 002 and 003 (the owner's rows become user
 * 1's, their IAM user id), the content — without changing a row otherwise.
 */

declare(strict_types=1);

header('Content-Type: text/html; charset=utf-8');
header('X-Robots-Tag: noindex, nofollow');
// Not no-referrer: under it a browser sends its own form with "Origin: null",
// and on this computer the Origin is part of the proof (setup_proven()).
header('Referrer-Policy: same-origin');
header('X-Frame-Options: DENY');
header('X-Content-Type-Options: nosniff');
header('Cache-Control: no-store');

/** HTML-escaped. */
function setup_h(string $text): string
{
    return htmlspecialchars($text, ENT_QUOTES, 'UTF-8');
}

/** The nonce of this page's own <style> and <script>: nothing else may run here. */
function setup_csp_nonce(): string
{
    static $nonce = null;
    return $nonce ??= base64_encode(random_bytes(16));
}

/** A whole page, and the end of the request. $tone: plain, good or bad. */
function setup_page(string $heading, string $body, string $tone = 'plain', string $script = ''): void
{
    $nonce = setup_csp_nonce();
    header("Content-Security-Policy: default-src 'none'; style-src 'nonce-$nonce'; script-src 'nonce-$nonce'; connect-src 'self'; "
        . "img-src 'self' data:; form-action 'self'; base-uri 'none'; frame-ancestors 'none'");
    echo '<!doctype html><html lang="en"><head><meta charset="utf-8">'
        . '<meta name="viewport" content="width=device-width,initial-scale=1">'
        . '<meta name="robots" content="noindex, nofollow"><title>Set up · Japanese Academy</title>'
        . '<style nonce="' . $nonce . '">' . SETUP_CSS . '</style></head><body><main class="wrap">'
        . '<section class="panel ' . setup_h($tone) . '"><h1>' . setup_h($heading) . '</h1>' . $body . '</section></main>'
        . ($script !== '' ? '<script nonce="' . $nonce . '">' . $script . '</script>' : '')
        . '</body></html>';
    exit;
}

/**
 * The app's own colours, light and dark, in a page that stands alone. The
 * color-scheme lets the browser draw its own parts of the form (the select's
 * list, the file button, the radios) in the same theme.
 */
const SETUP_CSS = ':root{color-scheme:light dark;--bg:#f6f5f2;--card:#fff;--ink:#1d1d1f;--muted:#6b6b70;--line:#e3e1dc;--soft:#efede8;--accent:#3a5f8a;'
    . '--accent-ink:#fff;--good:#2e7d5b;--bad:#b4453c;--kanji-text:#b53b25}'
    . '@media (prefers-color-scheme:dark){:root{--bg:#16161a;--card:#1e1e23;--ink:#eceaf0;--muted:#9a98a3;--line:#32323a;--soft:#26262c;'
    . '--accent:#6b9fd8;--accent-ink:#10131a;--good:#5fc094;--bad:#e2786d;--kanji-text:#ec8a70}}'
    . '*{box-sizing:border-box}html,body{margin:0}body{background:var(--bg);color:var(--ink);'
    . 'font:16px/1.6 -apple-system,BlinkMacSystemFont,"Segoe UI",system-ui,sans-serif}'
    . '.wrap{max-width:660px;margin:0 auto;padding:28px 16px 64px}'
    . '.panel{background:var(--card);border:1px solid var(--line);border-radius:10px;padding:22px}'
    . 'h1{font-size:24px;margin:0 0 6px;line-height:1.3}h1::before{content:"";display:inline-block;width:10px;height:10px;border-radius:50%;'
    . 'margin-right:10px;vertical-align:middle;background:var(--accent)}.good h1::before{background:var(--good)}.bad h1::before{background:var(--bad)}'
    . 'h2{font-size:13px;text-transform:uppercase;letter-spacing:.05em;color:var(--muted);margin:26px 0 4px}'
    . 'p,li{color:var(--muted)}li{margin:4px 0}b{color:var(--ink)}code{font-size:.9em;overflow-wrap:anywhere}'
    . '.row{display:grid;grid-template-columns:1fr 1fr;gap:0 14px}.field{display:block;margin:12px 0 0}'
    . '.lbl{display:block;font-size:13px;font-weight:600;margin-bottom:6px}.lbl em{font-weight:400;color:var(--muted);font-style:normal}'
    . 'input[type=text],input[type=password],input[type=file],select{width:100%;padding:10px 12px;border:1px solid var(--line);border-radius:7px;'
    . 'background:var(--bg);color:var(--ink);font:inherit;font-size:15px}input:focus,select:focus{outline:2px solid var(--accent);outline-offset:-1px}'
    . '.choice{display:flex;gap:9px;align-items:flex-start;margin:10px 0 0;color:var(--ink);font-size:15px}.choice input{margin-top:6px}'
    . 'input[type=radio],input[type=checkbox]{accent-color:var(--accent)}'
    . '.note{border:1px solid var(--line);background:var(--soft);border-radius:8px;padding:10px 12px;color:var(--ink)}'
    . '.err{color:var(--bad);background:var(--soft);border-radius:8px;padding:8px 12px}.ok{color:var(--good)}'
    . 'button,.btn{font:inherit;cursor:pointer;border-radius:8px}'
    . '.primary{background:var(--accent);color:var(--accent-ink);border:1px solid var(--accent);padding:11px 22px;font-weight:600;font-size:15px;text-decoration:none;display:inline-block}'
    . '.ghost{background:transparent;color:var(--ink);border:1px solid var(--line);padding:7px 14px;font-size:14px}.ghost:hover{border-color:var(--accent);color:var(--accent)}'
    . '.test{display:flex;gap:12px;align-items:center;flex-wrap:wrap;margin-top:12px}.result{font-size:14px;color:var(--muted)}'
    . '.result.good{color:var(--good)}.result.bad{color:var(--bad)}.actions{margin-top:24px}.hide{display:none}'
    . '@media (max-width:560px){.row{grid-template-columns:1fr}}';

// Before the app loads: it needs all of these, and a new host may lack one.
$lacking = [];
if (PHP_VERSION_ID < 80100) {
    $lacking[] = 'PHP 8.1 or newer (this is ' . PHP_VERSION . ')';
}
foreach (['pdo_pgsql', 'mbstring', 'intl', 'openssl'] as $extension) {
    if (!extension_loaded($extension)) {
        $lacking[] = "the PHP extension $extension";
    }
}
if ($lacking) {
    setup_page('This server cannot run Japanese Academy yet', '<p>It needs:</p><ul><li>'
        . implode('</li><li>', array_map('setup_h', $lacking)) . '</li></ul><p>Most hosting panels can switch these on (PHP settings).</p>', 'bad');
}

require_once __DIR__ . '/src/bootstrap.php';

/** This computer's own copy (no token), or a website (the token, the lock, the self-delete)? */
define('SETUP_LOCAL', PHP_SAPI === 'cli-server' && auth_from_this_computer($_SERVER));
const SETUP_LOCK = BACKEND . '/storage/installed.lock';
const SETUP_COOKIE = 'academy_setup';

function setup_token_file(): string
{
    return config_dir() . '/setup-token.local.php';
}

/**
 * The token of the first view (a website): 48 hex digits, as setup_token_write()
 * makes it. Null before there is one, and for a file that holds anything else
 * (half of one, written before tokens were written aside): a new one replaces it.
 */
function setup_token(): ?string
{
    if (!is_file(setup_token_file())) {
        return null;
    }
    try {
        $data = require setup_token_file();
    } catch (Throwable $e) {
        return null;
    }
    $token = is_array($data) ? ($data['token'] ?? null) : null;
    return is_string($token) && preg_match('/^[0-9a-f]{48}$/D', $token) ? $token : null;
}

/**
 * A new token, written aside and renamed like the settings (config_put()): a
 * request that reads the file meanwhile finds the old one or the new one,
 * never half of one. False when it could not be written.
 */
function setup_token_write(): bool
{
    try {
        config_put(setup_token_file(), "<?php\n// The setup page's token (backend/setup.php). It deletes this file when it is done.\n\nreturn "
            . var_export(['token' => bin2hex(random_bytes(24))], true) . ";\n");
        return true;
    } catch (RuntimeException $e) {
        return false;
    }
}

/** Removes what only mattered for installing a website: the token file, and this file. */
function setup_cleanup(): bool
{
    @unlink(setup_token_file());
    return @unlink(__FILE__);
}

/**
 * The settings of the version before backend/ + frontend/ (src/config.local.php,
 * which stays where it was on the owner's computer), if they are still there.
 */
function setup_legacy(): ?array
{
    $file = ROOT . '/src/config.local.php';
    if (!is_file($file)) {
        return null;
    }
    try {
        $old = require $file;
    } catch (Throwable $e) {
        return null;
    }
    if (!is_array($old) || !is_array($old['db'] ?? null)) {
        return null;
    }
    $auth = is_array($old['auth'] ?? null) ? $old['auth'] : [];
    return [
        'db' => [
            'host' => (string) ($old['db']['host'] ?? 'localhost'),
            'port' => (int) ($old['db']['port'] ?? 5432),
            'name' => (string) ($old['db']['name'] ?? 'japanese_academy'), // the old default
            'user' => (string) ($old['db']['user'] ?? 'postgres'),
            'password' => (string) ($old['db']['password'] ?? ''),
        ],
        'mode' => in_array($auth['mode'] ?? null, ['none', 'iam'], true) ? $auth['mode'] : null,
        'issuer' => is_string($auth['issuer'] ?? null) ? $auth['issuer'] : null,
        'client_id' => is_string($auth['client_id'] ?? null) ? $auth['client_id'] : null,
        'local_user_id' => is_int($auth['local_user_id'] ?? null) ? $auth['local_user_id'] : null,
        'timezone' => is_string($old['timezone'] ?? null) ? $old['timezone'] : null,
    ];
}

/** A JSON answer to one of the page's buttons ($more: what else it hands the page), and the end of the request. */
function setup_json(bool $ok, string $message, array $more = []): void
{
    header('Content-Type: application/json; charset=utf-8');
    echo json_text(['ok' => $ok, 'message' => $message] + $more);
    exit;
}

/** "1 table", "11,523 exam questions": a count as the app writes one. */
function setup_count(int $n, string $one, ?string $many = null): string
{
    return number_format($n) . ' ' . ($n === 1 ? $one : ($many ?? $one . 's'));
}

/**
 * Why PostgreSQL would not connect, for a person: without PDO's
 * "SQLSTATE[08006] [7]", down to the server's own reason when it gave one
 * ("password authentication failed for user …"), and one try of it (libpq
 * reports every address it tried).
 */
function setup_db_reason(PDOException $e): string
{
    $text = trim((string) preg_replace('/^SQLSTATE\[\w+\]\s*(\[\d+\]\s*)?/', '', trim($e->getMessage())));
    if (preg_match('/\bFATAL:\s*(.+)$/s', $text, $m)) {
        $text = $m[1];
    }
    $text = trim((string) preg_replace('/\s+/', ' ', $text));
    $text = rtrim((preg_split('/ (?=connection to server at )/', $text) ?: [$text])[0], ' .');
    return preg_match('/[?!]$/', $text) ? $text : "$text.";
}

/** A PDO connection to one database of the settings given, or a PDOException. */
function setup_pdo(array $db, string $name): PDO
{
    $dsn = sprintf('pgsql:host=%s;port=%d;dbname=%s;connect_timeout=8', $db['host'], $db['port'], $name);
    return new PDO($dsn, $db['user'], $db['password'], [PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION, PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC]);
}

/** "Test connection" for the database: can these settings reach it, and what is in it? */
function setup_try_db(array $db): array
{
    try {
        $pdo = setup_pdo($db, $db['name']);
    } catch (PDOException $e) {
        if (!db_missing_error($e)) {
            return [false, 'Cannot connect with these settings: ' . setup_db_reason($e)];
        }
        try {
            $server = setup_pdo($db, 'postgres');
            $may = (bool) $server->query('SELECT rolcreatedb OR rolsuper FROM pg_roles WHERE rolname = current_user')->fetchColumn();
        } catch (PDOException $e2) {
            return [false, "There is no database {$db['name']} there, and the server's own database would not let this user in either. "
                . 'Make the database in your hosting panel, then try again.'];
        }
        return [$may, $may
            ? "Connected to the server. There is no database {$db['name']} yet: setting up makes it."
            : "Connected to the server, but there is no database {$db['name']}, and this user may not make one. Make it in your hosting panel first."];
    }
    $files = array_map('basename', glob(MIGRATIONS_DIR . '/*.sql') ?: []);
    if (!$pdo->query("SELECT to_regclass('migrations') IS NOT NULL")->fetchColumn()) {
        $tables = (int) $pdo->query("SELECT count(*) FROM information_schema.tables WHERE table_schema = 'public'")->fetchColumn();
        return [true, "Connected to the database {$db['name']}. " . ($tables
            ? 'It holds ' . setup_count($tables, 'table') . " of something else, but none of Japanese Academy's: setting up adds them beside those."
            : 'It is empty: setting up makes its tables.')];
    }
    $applied = array_column($pdo->query('SELECT name FROM migrations')->fetchAll(), 'name');
    $pending = count(array_diff($files, $applied));
    $people = $pdo->query("SELECT to_regclass('srs_progress') IS NOT NULL")->fetchColumn()
        ? (int) $pdo->query('SELECT count(*) FROM (SELECT 1 FROM srs_progress UNION SELECT 1 FROM exam_attempts) t')->fetchColumn()
        : 0;
    return [true, "Connected to the database {$db['name']}: Japanese Academy's tables are there"
        . ($pending ? ', with ' . setup_count($pending, 'update') . ' to apply (a copy of every table is taken first)' : ', up to date')
        . ($people ? ', holding study data.' : ', with no study data yet.')];
}

/** Is this an address an IAM may have: https://, or http:// on this computer (the development IAM)? */
function setup_issuer_ok(string $issuer): bool
{
    return (bool) filter_var($issuer, FILTER_VALIDATE_URL)
        && (bool) preg_match('~^(https://[^/\s]+|http://(localhost|127\.0\.0\.1)(:\d+)?)(/[^\s]*)?$~', $issuer);
}

/** "Test connection" for the IAM: its discovery document at this address, naming itself, and its keys. */
function setup_try_iam(string $issuer): array
{
    $issuer = rtrim($issuer, '/');
    if (!setup_issuer_ok($issuer)) {
        return [false, 'The IAM\'s address must be an https:// address, like https://iam.anotoki.eu (or http://localhost:4300 for the development IAM).'];
    }
    $body = anotoki_iam_http_get("$issuer/.well-known/openid-configuration", 6);
    if ($body === null) {
        return [false, "No answer from $issuer/.well-known/openid-configuration. Is the address right, is the IAM running, and may this server make HTTPS requests?"];
    }
    $doc = json_decode($body, true);
    if (!is_array($doc) || ($doc['issuer'] ?? null) !== $issuer) {
        return [false, "Something answers at $issuer, but it is not the IAM at this address"
            . (is_array($doc) && is_string($doc['issuer'] ?? null) ? ': it calls itself ' . $doc['issuer'] . '.' : '.')];
    }
    $jwks = anotoki_iam_http_get("$issuer/.well-known/jwks.json", 6);
    $keys = $jwks === null ? [] : anotoki_iam_usable_keys((array) json_decode($jwks, true));
    return $keys
        ? [true, "Reached the IAM at $issuer: it answers, and its signing keys are there (" . count($keys) . ').']
        : [false, "The IAM at $issuer answers, but this server could not read its signing keys ($issuer/.well-known/jwks.json)."];
}

/**
 * A connection to the database, made if it is missing and the user may (most
 * hosting has you make it in the panel). Throws a plain sentence.
 */
function setup_connect(array $db): void
{
    try {
        setup_pdo($db, $db['name']);
        return;
    } catch (PDOException $e) {
        if (!db_missing_error($e)) {
            throw new RuntimeException('Cannot connect to the database with these settings: ' . setup_db_reason($e));
        }
    }
    try {
        setup_pdo($db, 'postgres')->exec('CREATE DATABASE "' . $db['name'] . '" ENCODING \'UTF8\' TEMPLATE template0');
        setup_pdo($db, $db['name']);
    } catch (PDOException $e) {
        throw new RuntimeException("There is no database {$db['name']}, and it could not be made here. Make it in your hosting panel, then send this form again.");
    }
}

// ── A website that is installed already: the lock is what counts ──────────────

if (!SETUP_LOCAL && is_file(SETUP_LOCK)) {
    $gone = setup_cleanup();
    setup_page('Already set up', '<p>This site is set up. <code>backend/storage/installed.lock</code> stops the setup page from running again.</p>'
        . ($gone ? '<p class="ok">The setup files have been removed.</p>'
            : '<p class="err">Delete <code>backend/setup.php</code> and <code>backend/config/setup-token.local.php</code> by hand: they could not be removed.</p>')
        . '<p>To run it again on purpose, delete the lock first, and upload <code>backend/setup.php</code> again.</p>', 'good');
}

// ── Proof that it is the owner: a token on a website, a nonce here ─────────────

// Every field and cookie of this page is text. One sent as a list (token[]=x)
// would turn each (string) below into a PHP warning, and the page into a 500
// that anybody could cause: such fields are dropped, as if never sent.
$_POST = array_filter($_POST, 'is_string');
$_COOKIE = array_filter($_COOKIE, 'is_string');

$token = null;
if (!SETUP_LOCAL) {
    // The first view writes it; every view reads it from the file. Without one
    // nothing can be proven here, so nothing goes on: an empty token would
    // pass any form that sends none.
    $token = setup_token() ?? (setup_token_write() ? setup_token() : null);
    if ($token === null) {
        setup_page('Cannot write to backend/config/', '<p>The setup page could not write <code>backend/config/setup-token.local.php</code>:'
            . ' the web server may not write in <code>backend/config/</code>.</p><p>Give it write permission there, and reload this page.</p>', 'bad');
    }
}
$nonce = (string) ($_COOKIE[SETUP_COOKIE] ?? '');
if (SETUP_LOCAL && !preg_match('/^[0-9a-f]{32}$/D', $nonce)) {
    $nonce = bin2hex(random_bytes(16));
    setcookie(SETUP_COOKIE, $nonce, ['path' => '/setup.php', 'httponly' => true, 'samesite' => 'Strict']);
    $_COOKIE[SETUP_COOKIE] = ''; // a form sent now came without it
}
$method = (string) ($_SERVER['REQUEST_METHOD'] ?? 'GET');

/** Is this POST the owner's: the token (a website), or the cookie's nonce echoed by this page's own form (here)? */
function setup_proven(?string $token, string $nonce): ?string
{
    if (!SETUP_LOCAL) {
        // never a token that is not there: '' would equal a form that sends none
        // (and a space pasted along with the token is not part of it)
        return $token !== null && $token !== '' && hash_equals($token, trim((string) ($_POST['token'] ?? '')))
            ? null : 'That is not the token from backend/config/setup-token.local.php.';
    }
    $origin = (string) ($_SERVER['HTTP_ORIGIN'] ?? '');
    $here = ((!empty($_SERVER['HTTPS']) && $_SERVER['HTTPS'] !== 'off') ? 'https' : 'http') . '://' . ($_SERVER['HTTP_HOST'] ?? '');
    if (($_COOKIE[SETUP_COOKIE] ?? '') === '' || !hash_equals($nonce, (string) ($_POST['nonce'] ?? '')) || ($origin !== '' && $origin !== $here)) {
        return 'This form did not come from this page (or the page is old): reload it and try again.';
    }
    return null;
}

// ── What is set now, what the form says ────────────────────────────────────────

$saved = ['database' => config_read_file('database'), 'auth' => config_read_file('auth'), 'app' => config_read_file('app')];
$legacy = $saved['database'] === null && SETUP_LOCAL ? setup_legacy() : null;
$savedDb = $saved['database'] ?? ($legacy['db'] ?? null);
$savedAuth = $saved['auth'] ?? [];
$hasPassword = is_string($savedDb['password'] ?? null) && $savedDb['password'] !== '';
// the backups of study data: not the raw copies, nor the strings of a deleted language
$serverBackups = array_values(array_filter(
    array_map('basename', glob(backup_dir() . '/academy-*.json') ?: []),
    static fn (string $f): bool => !str_ends_with($f, '.raw.json') && !str_starts_with($f, TRANSLATIONS_COPY_PREFIX)
));
/** The form's fields as this copy has them set (or the version before had them): never the password. */
$fromSaved = array_map('strval', array_filter([
    'db_host' => $savedDb['host'] ?? null,
    'db_port' => $savedDb['port'] ?? null,
    'db_name' => $savedDb['name'] ?? null,
    'db_user' => $savedDb['user'] ?? null,
    'issuer' => $savedAuth['issuer'] ?? ($legacy['issuer'] ?? null),
    'client_id' => $savedAuth['client_id'] ?? ($legacy['client_id'] ?? null),
    'user_id' => $savedAuth['local_user_id'] ?? ($legacy['local_user_id'] ?? null),
    'timezone' => $saved['app']['timezone'] ?? ($legacy['timezone'] ?? null),
], 'is_scalar'));
// Only a form proves anything: the token (a website), or this page's nonce (here).
$refused = $method === 'POST' ? setup_proven($token, $nonce) : 'Nothing was sent.';
// What is set already, and the files in backups/, are shown to this computer,
// and on a website only once the token is proven: until then the page is
// anybody's to open, and a site whose setup page was uploaded again has its
// database's name and user, its IAM and its people's backups there. (The
// token's own button, test-token, hands them over.)
$showSaved = SETUP_LOCAL || $refused === null;
$old = array_replace([
    'db_host' => 'localhost',
    'db_port' => '5432',
    'db_name' => 'japanese_academy',
    'db_user' => SETUP_LOCAL ? 'postgres' : '',
    'issuer' => SETUP_LOCAL ? 'http://localhost:4300' : '',
    'client_id' => 'japanese-academy',
    'user_id' => '1',
    'timezone' => app_computer_timezone(),
], $showSaved ? $fromSaved : []) + [
    'auth_mode' => SETUP_LOCAL ? (string) ($savedAuth['mode'] ?? ($legacy['mode'] ?? 'none')) : 'iam',
    'backup_file' => '',
];
$errors = [];

/** The form's database settings, with the saved password when none was typed. */
function setup_db_from_form(array $in, ?array $savedDb): array
{
    $typed = (string) ($_POST['db_password'] ?? '');
    return [
        'host' => $in['db_host'],
        'port' => (int) $in['db_port'],
        'name' => $in['db_name'],
        'user' => $in['db_user'],
        'password' => $typed !== '' ? $typed : (string) ($savedDb['password'] ?? ''),
    ];
}

/** What is wrong with the form's database settings, if anything. */
function setup_db_errors(array $in): array
{
    $errors = [];
    if (!preg_match('/^[A-Za-z0-9._:-]{1,100}$/D', $in['db_host']) || !ctype_digit($in['db_port']) || (int) $in['db_port'] < 1 || (int) $in['db_port'] > 65535) {
        $errors[] = 'The database server or port is not valid.';
    }
    if (!preg_match('/^[A-Za-z0-9_]{1,63}$/D', $in['db_name']) || $in['db_user'] === '') {
        $errors[] = 'Fill in the database name (letters, digits and _) and its user.';
    }
    return $errors;
}

if ($method === 'POST' && !$_POST && (int) ($_SERVER['CONTENT_LENGTH'] ?? 0) > 0) {
    // PHP drops a whole form that is bigger than post_max_size: the backup, most likely
    $errors[] = 'The form was bigger than this server takes (' . ini_get('post_max_size') . '). '
        . 'Put the backup in the backups/ folder by FTP instead, and choose it below.';
} elseif ($method === 'POST') {
    foreach (array_keys($old) as $key) {
        if (array_key_exists($key, $_POST)) {
            $old[$key] = trim((string) $_POST[$key]);
        }
    }
    if (!SETUP_LOCAL) {
        $old['auth_mode'] = 'iam';
    }
    $action = (string) ($_POST['action'] ?? 'install');

    if ($action === 'test-db' || $action === 'test-iam' || $action === 'test-token') {
        if ($refused !== null) {
            setup_json(false, $refused);
        }
        if ($action === 'test-token') {
            // the token proven: what is set already (never the password), and the files in backups/
            setup_json(true, 'That is the token.' . ($fromSaved ? ' What is set already is filled in.' : '')
                . ($serverBackups ? ' ' . setup_count(count($serverBackups), 'file') . ' in backups/ to choose from.' : ''),
                ['saved' => (object) $fromSaved, 'passwordSaved' => $hasPassword, 'backups' => $serverBackups]);
        }
        if ($action === 'test-db') {
            $problems = setup_db_errors($old);
            if ($problems) {
                setup_json(false, implode(' ', $problems));
            }
            [$ok, $message] = setup_try_db(setup_db_from_form($old, $savedDb));
        } else {
            [$ok, $message] = setup_try_iam($old['issuer']);
        }
        setup_json($ok, $message);
    }

    if ($refused !== null) {
        $errors[] = $refused;
    }
    $errors = array_merge($errors, setup_db_errors($old));
    if (!in_array($old['auth_mode'], SETUP_LOCAL ? ['none', 'iam'] : ['iam'], true)) {
        $errors[] = 'Choose how people sign in.';
    }
    if ($old['auth_mode'] === 'iam' && !setup_issuer_ok(rtrim($old['issuer'], '/'))) {
        $errors[] = 'The IAM\'s address must be an https:// address, like https://iam.anotoki.eu (or http://localhost:4300 for the development IAM).';
    }
    if ($old['auth_mode'] === 'iam' && !preg_match('/^[a-z0-9-]{2,64}$/D', $old['client_id'])) {
        $errors[] = 'The client id is letters, digits and - (japanese-academy).';
    }
    if (!ctype_digit($old['user_id']) || (int) $old['user_id'] < 1 || strlen($old['user_id']) > 18) {
        $errors[] = 'Your IAM user id is a whole number (the owner\'s is usually 1).';
    }
    if (!in_array($old['timezone'], DateTimeZone::listIdentifiers(), true)) {
        $errors[] = 'That is not a time zone; they look like Europe/Bratislava.';
    }

    // The backup: sent with the form, or put in backups/ by FTP (for one bigger than the host takes).
    $backupPath = null;
    $from = '';
    $upload = $_FILES['backup'] ?? null;
    $uploadError = is_array($upload) ? (int) ($upload['error'] ?? UPLOAD_ERR_NO_FILE) : UPLOAD_ERR_NO_FILE;
    if ($uploadError === UPLOAD_ERR_OK && is_uploaded_file((string) $upload['tmp_name'])) {
        $backupPath = (string) $upload['tmp_name'];
        $from = 'the file ' . basename((string) $upload['name']);
    } elseif ($uploadError === UPLOAD_ERR_INI_SIZE || $uploadError === UPLOAD_ERR_FORM_SIZE) {
        $errors[] = 'That backup is bigger than this server takes with a form (' . ini_get('upload_max_filesize') . '). '
            . 'Put it in the backups/ folder by FTP instead, and choose it below.';
    } elseif ($uploadError !== UPLOAD_ERR_NO_FILE) {
        $errors[] = 'The backup file did not arrive whole. Send the form again.';
    } elseif ($old['backup_file'] !== '' && $refused === null) {
        // (only once the form is the owner's: "no such file" would tell anybody else which files there are)
        if (!in_array($old['backup_file'], $serverBackups, true)) {
            $errors[] = 'There is no such file in backups/.';
        } else {
            $backupPath = backup_dir() . '/' . $old['backup_file'];
            $from = 'backups/' . $old['backup_file'];
        }
    }

    if (!$errors) {
        if (function_exists('set_time_limit')) { // some hosts switch it off
            @set_time_limit(300); // the study content takes seconds to build
        }
        try {
            // read before anything is changed: a wrong file changes nothing
            $backup = $backupPath !== null ? backup_read($backupPath) : null;
            if ($backup !== null) {
                backup_person_in($backup, (int) $old['user_id']);
            }
            $log = setup_run($old, setup_db_from_form($old, $savedDb), $savedAuth, $legacy, $backup, $from);
            $result = '<ul><li>' . implode('</li><li>', array_map('setup_h', $log)) . '</li></ul>';
            if (SETUP_LOCAL) {
                setup_page('Set up', $result
                    . ($legacy !== null ? '<p>The settings of the earlier version, in <code>src/config.local.php</code>, are not used any more: you may delete that file.</p>' : '')
                    . '<p>This page stays: open it again to change the settings.</p>'
                    . '<div class="actions"><a class="primary btn" href="/">Open Japanese Academy</a></div>', 'good');
            }
            // A website: the lock first, so the setup page refuses to run again even if the cleanup fails.
            if (!is_dir(dirname(SETUP_LOCK))) {
                @mkdir(dirname(SETUP_LOCK), 0700, true);
            }
            $locked = @file_put_contents(SETUP_LOCK, json_text(['installedAt' => iso_time(now_ms()), 'database' => $old['db_name'], 'issuer' => rtrim($old['issuer'], '/')]) . "\n") !== false;
            $gone = setup_cleanup();
            setup_page('Set up', $result
                . ($locked ? '' : '<p class="err"><code>backend/storage/installed.lock</code> could not be written, so nothing but deleting the setup page stops it running again. Check that <code>backend/storage/</code> is writable.</p>')
                . ($gone ? '<p class="ok">Removed <code>backend/setup.php</code> and <code>backend/config/setup-token.local.php</code>.</p>'
                    : '<p class="err">Delete <code>backend/setup.php</code> and <code>backend/config/setup-token.local.php</code> by hand:'
                    . ' they could not be removed.' . ($locked ? ' (The lock stops the setup page meanwhile.)' : '') . '</p>')
                . '<div class="actions"><a class="primary btn" href="/">Open Japanese Academy</a></div>'
                . '<p>Sign in with your account at ' . setup_h(rtrim($old['issuer'], '/')) . '. Only people with a role in this app at the IAM get in.</p>', 'good');
        } catch (Throwable $e) {
            $errors[] = $e->getMessage();
        }
    }
}

/**
 * The setting up itself, with what the form says. One line per step; throws a
 * plain sentence on the first thing that fails. The settings are written after
 * the database connected, so a wrong password writes nothing; sending the form
 * again does the rest.
 */
function setup_run(array $in, array $db, array $savedAuth, ?array $legacy, ?array $backup, string $from): array
{
    $log = [];
    setup_connect($db);
    $log[] = "Connected to the database {$db['name']} on {$db['host']}:{$db['port']}.";

    $userId = (int) $in['user_id'];
    // whose the data is so far: the settings' owner, or the earlier version's, or user 1 (migration 002)
    $formerOwner = (int) ($savedAuth['local_user_id'] ?? ($legacy['local_user_id'] ?? 1));
    $auth = $in['auth_mode'] === 'none'
        ? ['mode' => 'none', 'local_user_id' => $userId]
        : ['mode' => 'iam', 'issuer' => rtrim($in['issuer'], '/'), 'client_id' => $in['client_id'], 'local_user_id' => $userId];
    // the owner's data stays where it is until it has moved (below)
    config_write('database', $db);
    config_write('auth', ['local_user_id' => $formerOwner] + $auth);
    config_write('app', ['timezone' => $in['timezone']]);
    date_default_timezone_set(app_timezone());
    $log[] = 'Saved the settings in backend/config/: ' . ($auth['mode'] === 'none'
        ? 'no sign-in (this computer only)' : 'sign-in through ' . $auth['issuer']) . ", time zone {$in['timezone']}.";

    foreach ([BACKEND . '/storage', BACKEND . '/storage/cache', backup_dir()] as $dir) {
        if (!is_dir($dir) && !@mkdir($dir, 0700, true) && !is_dir($dir)) {
            throw new RuntimeException("Cannot make the folder $dir: PHP may not write there.");
        }
    }

    // On a database that holds study data, a raw copy of every table first,
    // taken without this version's queries (they may expect the new tables).
    $migrated = upkeep_migrate();
    if ($migrated['backup']) {
        $log[] = 'Backup before the update: backups/' . basename($migrated['backup']) . '.';
    }
    $log[] = $migrated['applied'] ? 'Applied the migrations: ' . implode(', ', $migrated['applied']) . '.' : 'The tables were up to date already.';
    if ($waiting = db_pending_migrations()) {
        throw new RuntimeException("backend/migrations/{$waiting[0]} is not whole (its last line, \"-- end of " . substr($waiting[0], 0, 3) . '", is missing):'
            . ' upload or copy it again, then send this form again.');
    }
    $synced = content_sync();
    $log[] = $synced
        ? 'Built the study content: ' . setup_count((int) $synced['items'], 'kanji item') . ' and ' . setup_count((int) $synced['questions'], 'exam question')
            . " ({$synced['seconds']} s)."
        : 'The study content was up to date already.';

    // The owner's data under their IAM user id, when it is not the one it had
    // (on this computer: a website's people are the IAM's, and its import names
    // its user id itself).
    if (SETUP_LOCAL && $userId !== $formerOwner && users_has_rows($formerOwner)) {
        $moved = owner_change($formerOwner, $userId);
        if ($moved['backup']) {
            $log[] = 'Backup first: backups/' . basename($moved['backup']) . '.';
        }
        $log[] = $moved['message'];
    }
    config_write('auth', $auth);

    if ($backup !== null) {
        $c = backup_import_person($backup, $userId, $from);
        $log[] = "Imported your data into user $userId: " . setup_count((int) $c['items'], 'kanji item') . ', ' . setup_count((int) $c['days'], 'day') . ', '
            . setup_count((int) $c['log'], 'answer') . ', ' . setup_count((int) $c['attempts'], 'exam attempt') . '.';
    } elseif (SETUP_LOCAL && !config_is_test_db($db['name'])) {
        $log[] = setup_first_import($userId);
    }

    // Sign-in needs the IAM's keys: can this server fetch them?
    if ($auth['mode'] === 'iam') {
        if (auth_jwks_file() !== null) {
            $log[] = 'The IAM\'s keys come from a file (auth.jwks_file, a test database\'s): nothing to fetch.';
        } elseif (anotoki_iam_http_get($auth['issuer'] . '/.well-known/jwks.json', 5) !== null) {
            $log[] = 'Reached the IAM: its keys are there, so people can sign in.';
        } else {
            $log[] = 'Warning: this server could not reach ' . $auth['issuer'] . ' just now, and signing in needs it. '
                . 'Check the address (and that the IAM runs), or ask the host whether the site may make HTTPS requests.';
        }
    }
    return $log;
}

/**
 * The owner's study history from the JSON files the first version kept
 * (progress/, results/, reports/), the first time, into an owner with no study
 * data yet — unless there are backups, which are newer than those files.
 */
function setup_first_import(int $owner): string
{
    if (learner_has_data_of($owner) || legacy_imported($owner)) {
        return 'Your study data is in the database.';
    }
    // The backups a restore takes: not the raw copies, the strings of a deleted language, nor somebody else's before-reset copy.
    $backups = array_values(array_filter(glob(backup_dir() . '/academy-*.json') ?: [], static fn (string $f): bool => !str_ends_with($f, '.raw.json')
        && !str_starts_with(basename($f), TRANSLATIONS_COPY_PREFIX)
        && (!preg_match('/^academy-before-reset-user-(\d+)-/', basename($f), $m) || (int) $m[1] === $owner)));
    if ($backups) {
        // the newest by time, not by name (academy-before-reset-… would sort after academy-2026-…)
        usort($backups, static fn (string $a, string $b): int => filemtime($b) <=> filemtime($a));
        return 'The database holds no study data of yours, but there are backups. To bring back the newest: php backend/manage.php --restore='
            . str_replace('\\', '/', $backups[0]);
    }
    $r = legacy_import(ROOT, $owner);
    if (isset($r['skipped'])) {
        return 'No study history to import (' . $r['skipped'] . ').';
    }
    return "Imported your study history from {$r['from']}: " . setup_count((int) $r['items'], 'kanji item') . ', ' . setup_count((int) $r['days'], 'day') . ', '
        . setup_count((int) $r['log'], 'answer') . ', ' . setup_count((int) $r['attempts'], 'exam attempt') . ' (' . number_format((int) $r['reports']) . ' with a report)'
        . ($r['problems'] ? '; left out: ' . implode('; ', $r['problems']) : '') . '. The files themselves are unchanged.';
}

// ── The form ──────────────────────────────────────────────────────────────────

$field = static function (string $name, string $label, string $type = 'text', string $extra = '') use ($old): string {
    return '<label class="field"><span class="lbl">' . $label . '</span><input id="' . $name . '" name="' . $name . '" type="' . $type . '"'
        . ($type === 'text' ? ' value="' . setup_h($old[$name] ?? '') . '"' : '') . ' ' . $extra . '></label>';
};
$choices = '<option value="">none</option>';
foreach ($showSaved ? $serverBackups : [] as $file) {
    $choices .= '<option' . ($old['backup_file'] === $file ? ' selected' : '') . '>' . setup_h($file) . '</option>';
}
$radio = static function (string $value, string $label, string $note) use ($old): string {
    return '<label class="choice"><input type="radio" name="auth_mode" value="' . $value . '"' . ($old['auth_mode'] === $value ? ' checked' : '')
        . '><span><b>' . $label . '</b><br><span class="result">' . $note . '</span></span></label>';
};

$intro = SETUP_LOCAL
    ? '<p>This sets up Japanese Academy on this computer: the settings, the database with its tables and the study content, and your data.'
        . ' It stays here: open it again any time to change the settings.</p>'
        . ($legacy !== null ? '<p class="note">The settings of the earlier version (<code>src/config.local.php</code>) are filled in, its password too (not shown). Check them and set up.</p>' : '')
        . ($saved['database'] !== null ? '<p class="note">This copy is set up already. Change what you need and send the form again; the password stays as it is unless you type a new one.</p>' : '')
    : '<p>This sets up the site: the settings, the tables and the study content, and your data if you bring it.'
        . ' Make the database in your hosting panel first.</p>'
        . '<p class="note">A token was written to <code>backend/config/setup-token.local.php</code>. Open that file by FTP or SFTP,'
        . ' copy the token, and paste it below: that is how the setup page knows it is you.</p>';

setup_page(
    'Set up Japanese Academy',
    $intro
    . implode('', array_map(static fn (string $e): string => '<p class="err" role="alert">' . setup_h($e) . '</p>', $errors))
    . '<form id="setup" method="post" enctype="multipart/form-data" autocomplete="off">'
    . (SETUP_LOCAL ? '<input type="hidden" name="nonce" value="' . setup_h($nonce) . '">'
        : $field('token', 'Token', 'password', 'required placeholder="paste the token here"')
            . '<div class="test"><button type="button" class="ghost" data-test="token">Check</button><span class="result" id="token-result" role="status"></span></div>')
    . '<h2>Database (PostgreSQL)</h2>'
    . '<div class="row"><div>' . $field('db_host', 'Server', 'text', 'required') . '</div><div>' . $field('db_port', 'Port', 'text', 'required inputmode="numeric"') . '</div></div>'
    . $field('db_name', 'Database', 'text', 'required')
    . '<div class="row"><div>' . $field('db_user', 'User', 'text', 'required') . '</div><div>'
    . $field('db_password', 'Password <em id="pw-saved">' . ($showSaved && $hasPassword ? '(saved: leave empty to keep it)' : '') . '</em>', 'password',
        $showSaved && $hasPassword ? 'placeholder="unchanged"' : '') . '</div></div>'
    . '<div class="test"><button type="button" class="ghost" data-test="db">Test connection</button><span class="result" id="db-result" role="status"></span></div>'
    . '<h2>Sign-in</h2>'
    . (SETUP_LOCAL
        ? $radio('none', 'No sign-in', 'For your own copy: it is simply yours, and only this computer can open it.')
            . $radio('iam', 'Sign in through the anotoki IAM', 'Each person has their own progress. For developing against the IAM, which then must be running.')
        : '<p>People sign in through the anotoki IAM; each has their own progress.</p><input type="hidden" name="auth_mode" value="iam">')
    . '<div id="iam-fields"><div class="row"><div>' . $field('issuer', 'The IAM\'s address', 'text', SETUP_LOCAL ? '' : 'placeholder="https://iam.anotoki.eu"') . '</div><div>'
    . $field('client_id', 'Client id', 'text') . '</div></div>'
    . '<div class="test"><button type="button" class="ghost" data-test="iam">Test connection</button><span class="result" id="iam-result" role="status"></span></div></div>'
    . '<h2>You</h2>'
    . $field('user_id', 'Your IAM user id <em>(the IAM\'s admin console lists it; the owner\'s is usually 1)</em>', 'text', 'required inputmode="numeric"')
    . $field('timezone', 'Time zone <em>(review times and days follow it, for everybody)</em>', 'text', 'required')
    . '<h2>Your data <em>(if you bring it)</em></h2>'
    . '<p>A backup from your computer: <code>backups/academy-….json</code>. Send it here, or, if it is big, put it in this site\'s'
    . ' <code>backups/</code> folder by FTP and choose it' . (SETUP_LOCAL ? '' : ' (the list shows once the token is in)')
    . '. It goes into your IAM user id, which must have no study data yet.</p>'
    . '<label class="field"><span class="lbl">Backup file</span><input id="backup" name="backup" type="file" accept=".json,application/json"></label>'
    . '<label class="field"><span class="lbl">Or a file in backups/</span><select id="backup_file" name="backup_file">' . $choices . '</select></label>'
    . '<div class="actions"><button type="submit" class="primary" name="action" value="install">Set up</button></div>'
    . '</form>',
    'plain',
    // The buttons try the settings without sending the form. The token's, pressed
    // by itself once one is pasted (or the field is left), and by Enter in the
    // field, which would otherwise send the whole form, brings what is saved:
    // into the fields nobody typed in, and the files of backups/ into the list.
    // The browser knows the owner's time zone best.
    '(function(){var form=document.getElementById("setup");'
    . 'form.addEventListener("input",function(e){if(e.target&&e.target.name){e.target.dataset.edited="1";}});'
    . 'function fill(b){var saved=b.saved||{};Object.keys(saved).forEach(function(k){var f=form.elements.namedItem(k);'
    . 'if(f&&f.type==="text"&&!f.dataset.edited){f.value=saved[k];}});'
    . 'if(b.passwordSaved){document.getElementById("pw-saved").textContent="(saved: leave empty to keep it)";document.getElementById("db_password").placeholder="unchanged";}'
    . 'if(b.backups){var s=document.getElementById("backup_file"),was=s.value;s.length=1;b.backups.forEach(function(n){s.add(new Option(n,n,false,n===was));});}}'
    . 'document.querySelectorAll("[data-test]").forEach(function(button){button.addEventListener("click",function(){'
    . 'var out=document.getElementById(button.dataset.test+"-result");out.textContent="Trying…";out.className="result";'
    . 'var data=new FormData(form);data.set("action","test-"+button.dataset.test);data.delete("backup");button.disabled=true;'
    . 'fetch(location.pathname,{method:"POST",body:data,credentials:"same-origin"}).then(function(r){return r.json();})'
    . '.then(function(b){out.textContent=b.message;out.className="result "+(b.ok?"good":"bad");if(b.ok){fill(b);}})'
    . '.catch(function(e){out.textContent="The setup page did not answer: "+e.message;out.className="result bad";})'
    . '.then(function(){button.disabled=false;});});});'
    . 'var token=document.getElementById("token");'
    . 'if(token){var check=function(){if(token.value.trim()){document.querySelector("[data-test=token]").click();}};'
    . 'token.addEventListener("change",check);token.addEventListener("paste",function(){setTimeout(check,0);});'
    . 'token.addEventListener("keydown",function(e){if(e.key==="Enter"){e.preventDefault();check();}});}'
    . 'var modes=document.querySelectorAll("input[name=auth_mode][type=radio]"),iam=document.getElementById("iam-fields");'
    . 'function show(){var on=document.querySelector("input[name=auth_mode]:checked");iam.classList.toggle("hide",!!on&&on.value==="none");}'
    . 'modes.forEach(function(m){m.addEventListener("change",show);});show();'
    . ($method === 'POST' || ($showSaved && isset($fromSaved['timezone'])) ? ''
        : 'try{var tz=Intl.DateTimeFormat().resolvedOptions().timeZone;if(tz){document.getElementById("timezone").value=tz;}}catch(e){}')
    . '})();'
);
