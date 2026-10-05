<?php
/**
 * The setup page, /setup.php: how a copy of Japanese Academy is set up, on
 * the owner's computer, a developer's, or a website. It asks for two things,
 * the database and the anotoki IAM people sign in through, and writes them as
 * this copy's settings (backend/config/database.local.php and auth.local.php,
 * which the app requires). Then it builds the database: makes it if it is
 * missing and the user may, applies the migrations (after a raw copy of every
 * table when it holds study data), and builds the study content. Nothing
 * else: who may administer is a role at the IAM, the time of day is the
 * server's own, and everybody's data is their own to bring.
 *
 * Two ways, told apart by where the request comes from:
 *
 *   this computer   PHP's built-in server (composer start: backend/router.php),
 *                   a request straight from 127.0.0.1 or localhost
 *                   (auth_from_this_computer()). No token: a nonce in a cookie
 *                   and in the form (SameSite=Strict) keeps other sites' pages
 *                   from sending it. It stays, and can be run again: it shows
 *                   what is saved, never the password (left empty, the saved one
 *                   stays). The IAM is the development IAM at
 *                   http://localhost:4300 by default.
 *   a website       first, proof of owning the server: a token it writes into
 *                   backend/config/setup-token.local.php, which only FTP reaches
 *                   (it is never shown here). It shows nothing of what is saved,
 *                   not even after the token (an empty password still keeps the
 *                   saved one). When done it writes backend/storage/installed.lock,
 *                   then deletes the token file and itself; with the lock there
 *                   it refuses to run (and deletes itself if it is uploaded
 *                   again). To run it again on purpose, delete the lock and
 *                   upload it again.
 *
 * "Test connection" buttons try the database and the IAM (its
 * {issuer}/.well-known/openid-configuration and keys) without saving anything,
 * and answer in the words every anotoki site's setup page uses.
 *
 * Settings an earlier version wrote (auth.local.php's mode and local_user_id,
 * app.local.php's time zone) are left as they are and ignored by the app;
 * saving here writes auth.local.php afresh, with the IAM alone. This file
 * stays parseable by PHP 7.4, so a host with an old PHP gets a sentence
 * saying so rather than a blank page.
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
 * color-scheme lets the browser draw its own parts of the form in the same
 * theme.
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
    . 'input[type=text],input[type=password]{width:100%;padding:10px 12px;border:1px solid var(--line);border-radius:7px;'
    . 'background:var(--bg);color:var(--ink);font:inherit;font-size:15px}input:focus{outline:2px solid var(--accent);outline-offset:-1px}'
    . '.note{border:1px solid var(--line);background:var(--soft);border-radius:8px;padding:10px 12px;color:var(--ink)}'
    . '.err{color:var(--bad);background:var(--soft);border-radius:8px;padding:8px 12px}.ok{color:var(--good)}'
    . 'button,.btn{font:inherit;cursor:pointer;border-radius:8px}'
    . '.primary{background:var(--accent);color:var(--accent-ink);border:1px solid var(--accent);padding:11px 22px;font-weight:600;font-size:15px;text-decoration:none;display:inline-block}'
    . '.ghost{background:transparent;color:var(--ink);border:1px solid var(--line);padding:7px 14px;font-size:14px}.ghost:hover{border-color:var(--accent);color:var(--accent)}'
    . '.test{display:flex;gap:12px;align-items:center;flex-wrap:wrap;margin-top:12px}.result{font-size:14px;color:var(--muted)}'
    . '.result.good{color:var(--good)}.result.bad{color:var(--bad)}.actions{margin-top:24px}'
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

/** A JSON answer to one of the page's buttons, and the end of the request. */
function setup_json(bool $ok, string $message): void
{
    header('Content-Type: application/json; charset=utf-8');
    echo json_text(['ok' => $ok, 'message' => $message]);
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

/**
 * "Test connection" for the database, in the family's words (every anotoki
 * site's setup page says the same): can these settings reach it, and what
 * would Save do there? Changes nothing.
 *
 * @return array{0: bool, 1: string}
 */
function setup_try_db(array $db): array
{
    $name = $db['name'];
    try {
        $pdo = setup_pdo($db, $name);
        $tables = (int) $pdo->query("SELECT count(*) FROM information_schema.tables WHERE table_schema = current_schema() AND table_type = 'BASE TABLE'")->fetchColumn();
        $files = array_map('basename', glob(MIGRATIONS_DIR . '/*.sql') ?: []);
        $applied = $pdo->query("SELECT to_regclass('migrations') IS NOT NULL")->fetchColumn()
            ? array_column($pdo->query('SELECT name FROM migrations')->fetchAll(), 'name')
            : [];
        $pending = count(array_diff($files, $applied));
        return [true, "Connected to the database \"$name\": "
            . ($tables === 0 ? 'it is empty - Save makes the tables.' : ($pending > 0 ? "$pending update(s) to apply - Save applies them." : 'it is up to date.'))];
    } catch (PDOException $e) {
        $first = $e;
    }
    try {
        $server = setup_pdo($db, 'postgres');
        $exists = $server->prepare('SELECT 1 FROM pg_database WHERE datname = ?');
        $exists->execute([$name]);
        if ($exists->fetchColumn()) {
            return [false, "The server is there, but \"{$db['user']}\" cannot open the database \"$name\": " . setup_db_reason($first)];
        }
        $create = (bool) $server->query('SELECT rolcreatedb OR rolsuper FROM pg_roles WHERE rolname = current_user')->fetchColumn();
        return $create
            ? [true, "Connected to the server. The database \"$name\" does not exist yet - Save creates it."]
            : [false, "Connected to the server, but there is no database \"$name\" and this user may not create one. Make it in the hosting panel first."];
    } catch (PDOException $e) {
        return [false, 'Cannot connect: ' . setup_db_reason($first)];
    }
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

// ── What is saved now, what the form says ──────────────────────────────────────

$savedDb = config_read_file('database');
$savedAuth = config_read_file('auth') ?? [];
$hasPassword = is_string($savedDb['password'] ?? null) && $savedDb['password'] !== '';
// What is saved is shown to this computer only. A website's setup page is
// anybody's to open, and one uploaded again would show its database's name
// and user and its IAM to whoever came first.
$fromSaved = SETUP_LOCAL ? array_map('strval', array_filter([
    'db_host' => $savedDb['host'] ?? null,
    'db_port' => $savedDb['port'] ?? null,
    'db_name' => $savedDb['name'] ?? null,
    'db_user' => $savedDb['user'] ?? null,
    'issuer' => $savedAuth['issuer'] ?? null,
    'client_id' => $savedAuth['client_id'] ?? null,
], 'is_scalar')) : [];
// Only a form proves anything: the token (a website), or this page's nonce (here).
$refused = $method === 'POST' ? setup_proven($token, $nonce) : 'Nothing was sent.';
$old = array_replace([
    'db_host' => 'localhost',
    'db_port' => '5432',
    'db_name' => 'anotoki_japanese',
    'db_user' => SETUP_LOCAL ? 'postgres' : '',
    'issuer' => SETUP_LOCAL ? 'http://localhost:4300' : '',
    'client_id' => 'japanese-academy',
], $fromSaved);
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

if ($method === 'POST') {
    foreach (array_keys($old) as $key) {
        if (array_key_exists($key, $_POST)) {
            $old[$key] = trim((string) $_POST[$key]);
        }
    }
    $action = (string) ($_POST['action'] ?? 'save');

    if ($action === 'test-db' || $action === 'test-iam' || $action === 'test-token') {
        if ($refused !== null) {
            setup_json(false, $refused);
        }
        if ($action === 'test-token') {
            setup_json(true, 'That is the token.');
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
    if (!setup_issuer_ok(rtrim($old['issuer'], '/'))) {
        $errors[] = 'The IAM\'s address must be an https:// address, like https://iam.anotoki.eu (or http://localhost:4300 for the development IAM).';
    }
    if (!preg_match('/^[a-z0-9-]{2,64}$/D', $old['client_id'])) {
        $errors[] = 'The client id is letters, digits and - (japanese-academy).';
    }

    if (!$errors) {
        if (function_exists('set_time_limit')) { // some hosts switch it off
            @set_time_limit(300); // the study content takes seconds to build
        }
        try {
            $log = setup_run($old, setup_db_from_form($old, $savedDb));
            $result = '<ul><li>' . implode('</li><li>', array_map('setup_h', $log)) . '</li></ul>';
            $signIn = '<p>Open the app and sign in with your anotoki account at ' . setup_h(rtrim($old['issuer'], '/')) . '.'
                . ' Your data comes in from the app itself, each person their own.</p>';
            if (SETUP_LOCAL) {
                setup_page('Saved', $result . $signIn
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
                . $signIn
                . '<div class="actions"><a class="primary btn" href="/">Open Japanese Academy</a></div>', 'good');
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
function setup_run(array $in, array $db): array
{
    $log = [];
    setup_connect($db);
    $log[] = "Connected to the database {$db['name']} on {$db['host']}:{$db['port']}.";

    $issuer = rtrim($in['issuer'], '/');
    config_write('database', $db);
    config_write('auth', ['issuer' => $issuer, 'client_id' => $in['client_id']]);
    $log[] = "Saved the settings in backend/config/: the database, and sign-in through the IAM at $issuer.";

    foreach ([BACKEND . '/storage', BACKEND . '/storage/cache', backup_dir()] as $dir) {
        if (!is_dir($dir) && !@mkdir($dir, 0700, true) && !is_dir($dir)) {
            throw new RuntimeException("Cannot make the folder $dir: PHP may not write there.");
        }
    }

    // On a database that holds study data, a raw copy of every table first,
    // taken without this version's queries (they may expect the new tables).
    $migrated = upkeep_migrate();
    if ($migrated['backup']) {
        $log[] = 'Backup before the update: backend/storage/backups/' . basename($migrated['backup']) . '.';
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

    // Sign-in needs the IAM's keys: can this server fetch them?
    if (auth_jwks_file() !== null) {
        $log[] = 'The IAM\'s keys come from a file (auth.jwks_file, a test database\'s): nothing to fetch.';
    } elseif (anotoki_iam_http_get($issuer . '/.well-known/jwks.json', 5) !== null) {
        $log[] = 'Reached the IAM: its keys are there, so people can sign in.';
    } else {
        $log[] = 'Warning: this server could not reach ' . $issuer . ' just now, and signing in needs it. '
            . 'Check the address (and that the IAM runs), or ask the host whether the site may make HTTPS requests.';
    }
    return $log;
}

// ── The form ──────────────────────────────────────────────────────────────────

$field = static function (string $name, string $label, string $type = 'text', string $extra = '') use ($old): string {
    return '<label class="field"><span class="lbl">' . $label . '</span><input id="' . $name . '" name="' . $name . '" type="' . $type . '"'
        . ($type === 'text' ? ' value="' . setup_h($old[$name] ?? '') . '"' : '') . ' ' . $extra . '></label>';
};
$passwordSaved = SETUP_LOCAL && $hasPassword;

$intro = SETUP_LOCAL
    ? '<p>This sets up Japanese Academy on this computer: the database with its tables and the study content, and the anotoki IAM people sign in through.'
        . ' It stays here: open it again any time to change the settings.</p>'
        . ($savedDb !== null ? '<p class="note">This copy is set up already. Change what you need and save again; the password stays as it is unless you type a new one.</p>' : '')
    : '<p>This sets up the site: the database with its tables and the study content, and the anotoki IAM people sign in through.'
        . ' Make the database in your hosting panel first.</p>'
        . '<p class="note">A token was written to <code>backend/config/setup-token.local.php</code>. Open that file by FTP or SFTP,'
        . ' copy the token, and paste it below: that is how the setup page knows it is you.</p>';

setup_page(
    'Set up Japanese Academy',
    $intro
    . implode('', array_map(static function (string $e): string {
        return '<p class="err" role="alert">' . setup_h($e) . '</p>';
    }, $errors))
    . '<form id="setup" method="post" autocomplete="off">'
    . (SETUP_LOCAL ? '<input type="hidden" name="nonce" value="' . setup_h($nonce) . '">'
        : $field('token', 'Token', 'password', 'required placeholder="paste the token here"')
            . '<div class="test"><button type="button" class="ghost" data-test="token">Check</button><span class="result" id="token-result" role="status"></span></div>')
    . '<h2>Database (PostgreSQL)</h2>'
    . '<div class="row"><div>' . $field('db_host', 'Server', 'text', 'required') . '</div><div>' . $field('db_port', 'Port', 'text', 'required inputmode="numeric"') . '</div></div>'
    . $field('db_name', 'Database', 'text', 'required')
    . '<div class="row"><div>' . $field('db_user', 'User', 'text', 'required') . '</div><div>'
    . $field('db_password', 'Password <em>' . ($passwordSaved ? '(saved: leave empty to keep it)' : '') . '</em>', 'password',
        $passwordSaved ? 'placeholder="unchanged"' : '') . '</div></div>'
    . '<div class="test"><button type="button" class="ghost" data-test="db">Test connection</button><span class="result" id="db-result" role="status"></span></div>'
    . '<h2>Sign-in (the anotoki IAM)</h2>'
    . '<p>Everybody signs in with their anotoki account, and has their own progress. Who may reword the app\'s words, or more, is their role there.</p>'
    . '<div class="row"><div>' . $field('issuer', 'The IAM\'s address', 'text', 'required' . (SETUP_LOCAL ? '' : ' placeholder="https://iam.anotoki.eu"')) . '</div><div>'
    . $field('client_id', 'Client id', 'text', 'required') . '</div></div>'
    . '<div class="test"><button type="button" class="ghost" data-test="iam">Test connection</button><span class="result" id="iam-result" role="status"></span></div>'
    . '<div class="actions"><button type="submit" class="primary" name="action" value="save">Save</button></div>'
    . '</form>',
    'plain',
    // The buttons try the settings without sending the form. The token's is
    // pressed by itself once one is pasted (or the field is left), and by Enter
    // in the field, which would otherwise send the whole form.
    '(function(){var form=document.getElementById("setup");'
    . 'document.querySelectorAll("[data-test]").forEach(function(button){button.addEventListener("click",function(){'
    . 'var out=document.getElementById(button.dataset.test+"-result");out.textContent="Trying…";out.className="result";'
    . 'var data=new FormData(form);data.set("action","test-"+button.dataset.test);button.disabled=true;'
    . 'fetch(location.pathname,{method:"POST",body:data,credentials:"same-origin"}).then(function(r){return r.json();})'
    . '.then(function(b){out.textContent=b.message;out.className="result "+(b.ok?"good":"bad");})'
    . '.catch(function(e){out.textContent="The setup page did not answer: "+e.message;out.className="result bad";})'
    . '.then(function(){button.disabled=false;});});});'
    . 'var token=document.getElementById("token");'
    . 'if(token){var check=function(){if(token.value.trim()){document.querySelector("[data-test=token]").click();}};'
    . 'token.addEventListener("change",check);token.addEventListener("paste",function(){setTimeout(check,0);});'
    . 'token.addEventListener("keydown",function(e){if(e.key==="Enter"){e.preventDefault();check();}});}'
    . '})();'
);
