<?php
// The app's own strings through the real server: anybody reads a language's
// strings with English underneath, signed in or not; the owner (the ADMIN
// role, or this computer without sign-in) keeps the languages and rewords the
// strings: checked whole, the changed ones only, never a placeholder the code
// does not fill; a language is deleted only after a copy of its strings, and
// never one the app is released in. The keys here are the test's own: the
// migrations write the real ones, and what they leave is held to the frontend
// in tests/unit/translations.test.php.
declare(strict_types=1);

require __DIR__ . '/../lib.php'; // before the app loads: a throwaway database and backup folder
require BACKEND . '/api/app.php'; // the owner's middleware, for its one pure function
require BACKEND . '/tools/translation_keys.php';

const OWNER = 9001;   // ADMIN: the owner
const ADA = 9003;     // ADMIN too: a second person who may reword
const BEN = 9002;     // MEMBER: studies here, and owns nothing
const NOBODY = 9004;  // no role in this app

const ENGLISH = ['code' => 'en', 'name' => 'English', 'nativeName' => 'English'];
const SLOVAK = ['code' => 'sk', 'name' => 'Slovak', 'nativeName' => 'Slovenčina'];

$GLOBALS['app'] = null;
before(function (): void {
    $GLOBALS['app'] = start_app(test_iam_env());
    // This file's copy of the database starts with no string at all: the
    // app's own keys (004 and after) are taken out of it, and their strings
    // go with them. What the routes do is then said in a handful of keys that
    // are the test's, and does not change with every string the app gains.
    $GLOBALS['seeded'] = (int) db_value('SELECT count(*) FROM translation_keys') > 0;
    db_exec('DELETE FROM translation_keys');
});

function roles_of(int $user): array
{
    if ($user === OWNER) {
        return ['ADMIN'];
    }
    if ($user === ADA) {
        return ['MEMBER', 'ADMIN'];
    }
    return $user === BEN ? ['MEMBER'] : [];
}

function as_user(int $user, string $method, string $url, $body = null, array $headers = []): array
{
    return call($GLOBALS['app']['base'], $method, $url, $body, array_merge($headers, test_bearer(test_token($user, roles_of($user)))));
}

function anonymous(string $method, string $url, $body = null, array $headers = []): array
{
    return call($GLOBALS['app']['base'], $method, $url, $body, $headers);
}

/**
 * A request whose body and headers are exactly these: for a body that is not
 * JSON, or one of a size. (call() always sends JSON, as JSON.)
 */
function raw_call(string $base, string $method, string $url, string $body, array $headers): array
{
    $ch = curl_init($base . $url);
    curl_setopt_array($ch, [CURLOPT_CUSTOMREQUEST => $method, CURLOPT_RETURNTRANSFER => true, CURLOPT_TIMEOUT => 60,
        CURLOPT_HTTPHEADER => array_merge(['Expect:'], $headers), CURLOPT_POSTFIELDS => $body]);
    $raw = curl_exec($ch);
    if ($raw === false) {
        throw new RuntimeException("$method $url: " . curl_error($ch));
    }
    return ['status' => (int) curl_getinfo($ch, CURLINFO_RESPONSE_CODE), 'body' => json_decode((string) $raw, true), 'raw' => (string) $raw];
}

/** The header that sends a person's token. */
function token_of(int $user): array
{
    return test_bearer(test_token($user, roles_of($user)));
}

/** A save of the grid's changed strings, as the owner's page sends it. */
function save(int $user, array $values): array
{
    return as_user($user, 'PUT', '/api/owner/translations', ['values' => $values === [] ? new stdClass() : $values]);
}

/** One string as the database has it: [value, updated_by, updated_at], or null. */
function stored(string $key, string $code): ?array
{
    $row = db_one('SELECT value, updated_by, updated_at FROM translations WHERE key_name = ? AND language_code = ?', [$key, $code]);
    return $row === null ? null : array_values($row);
}

/** Every string the database has, as "key code" => value: to see that a refused save wrote nothing. */
function every_string(): array
{
    return array_column(db_all("SELECT key_name || ' ' || language_code AS cell, value || ' by ' || coalesce(updated_by::text, 'nobody') AS value FROM translations ORDER BY 1"), 'value', 'cell');
}

/** The languages as the database has them, every column: to see that a refused request changed none. */
function every_language(): array
{
    return db_all('SELECT * FROM languages ORDER BY code');
}

/** The keys a migration would have written, with their first strings. */
function seed_strings(): void
{
    db_exec("INSERT INTO translation_keys (name, description) VALUES
        ('test.hello', 'A greeting; {name} is who is greeted'), ('test.bye', NULL), ('test.count', 'How far; {count} of {total}'), ('test.new', 'A key with no string yet')");
    db_exec("INSERT INTO translations (key_name, language_code, value) VALUES
        ('test.hello', 'en', 'Hello, {name}!'), ('test.hello', 'sk', 'Dobrý deň, {name}!'), ('test.bye', 'en', 'Goodbye'), ('test.count', 'en', '{count} of {total}')");
}

/** Two maps that hold the same, whatever order each came in. */
function assert_same_map(array $expected, $actual, string $message = ''): void
{
    assert_true(is_array($actual), ($message !== '' ? "$message: " : '') . 'not a map: ' . test_show($actual));
    ksort($expected, SORT_STRING);
    ksort($actual, SORT_STRING);
    assert_same($expected, $actual, $message);
}

/** A temp folder of this file's own, removed when its tests end. */
function temp_dir(string $what): string
{
    $dir = str_replace('\\', '/', sys_get_temp_dir()) . "/academy-test-$what-" . getmypid() . '-' . bin2hex(random_bytes(4));
    mkdir($dir, 0777, true);
    $GLOBALS['temp_dirs'][] = $dir;
    return $dir;
}

/** Another throwaway database beside this file's, with settings of its own; dropped when the tests end. */
function other_database(string $suffix, ?string $template): array
{
    $name = db_name() . "_$suffix";
    db_create($name, $template);
    db_server()->exec('COMMENT ON DATABASE "' . $name . "\" IS 'academy test " . time() . "'");
    $GLOBALS['other_databases'][] = $name;
    $config = str_replace('\\', '/', sys_get_temp_dir()) . '/academy-test-config-' . getmypid() . '-' . bin2hex(random_bytes(3));
    test_config_write($config, $name, 'none', null, backup_dir());
    $GLOBALS['TEST_CONFIG_DIRS'][] = $config;
    return ['name' => $name, 'config' => $config];
}

after(function (): void {
    foreach ($GLOBALS['other_databases'] ?? [] as $name) {
        if (test_db_name_ok($name)) {
            db_server()->exec('DROP DATABASE IF EXISTS "' . $name . '" WITH (FORCE)');
        }
    }
    foreach ($GLOBALS['temp_dirs'] ?? [] as $dir) {
        if (is_dir($dir) && str_contains($dir, '/academy-test-')) {
            array_map('unlink', glob("$dir/*") ?: []);
            @rmdir($dir);
        }
    }
});

/**
 * backend/translations.php on this file's database (or, with $config, on the
 * one those settings name): [exit code, what it printed].
 */
function cli(array $arguments, ?string $config = null): array
{
    $own = (string) getenv('ACADEMY_CONFIG_DIR');
    if ($config !== null) {
        putenv("ACADEMY_CONFIG_DIR=$config");
    }
    try {
        exec(escapeshellarg(PHP_BINARY) . ' ' . escapeshellarg(BACKEND . '/translations.php') . ' ' . implode(' ', array_map('escapeshellarg', $arguments)) . ' 2>&1', $lines, $code);
    } finally {
        putenv("ACADEMY_CONFIG_DIR=$own");
    }
    return [$code, implode("\n", $lines)];
}

/** Somebody else at the same moment: a second connection to this file's database, for a transaction left open. */
function somebody_else(): PDO
{
    return db_connect();
}

/**
 * A request that is sent and not waited for, for what has to wait for
 * somebody else. (The server answers one request at a time, and this one
 * keeps it busy until it is answered: ask for 'answer' before the next call.)
 *
 *   'waits'   is it held up by a lock somebody else has? True as soon as the
 *             database shows a connection waiting for one while the request
 *             is unanswered; false when the answer comes first (it did not
 *             wait), or nothing of either is seen in ten seconds
 *   'answer'  waits for the answer: ['status' => int, 'body' => array|null]
 *
 * @return array{waits: callable, answer: callable}
 */
function begin_as(int $user, string $method, string $url, $body = null): array
{
    $curl = curl_init($GLOBALS['app']['base'] . $url);
    $headers = array_merge(token_of($user), ['Expect:'], $body === null ? [] : ['Content-Type: application/json']);
    curl_setopt_array($curl, [CURLOPT_CUSTOMREQUEST => $method, CURLOPT_RETURNTRANSFER => true, CURLOPT_HTTPHEADER => $headers, CURLOPT_TIMEOUT => 30]);
    if ($body !== null) {
        curl_setopt($curl, CURLOPT_POSTFIELDS, json_text($body));
    }
    $multi = curl_multi_init();
    curl_multi_add_handle($multi, $curl);

    // Lets the request go on for a moment; true once it is answered.
    $answered = static function () use ($multi): bool {
        curl_multi_exec($multi, $running);
        if ($running > 0 && curl_multi_select($multi, 0.05) === -1) {
            usleep(20000); // nothing to wait on yet
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

/** The owner's addresses, each with a body that would change something. */
function owner_routes(): array
{
    return [
        ['GET', '/api/owner/languages', null],
        ['POST', '/api/owner/languages', ['code' => 'xx', 'name' => 'Nobody\'s', 'nativeName' => 'Nobody\'s']],
        ['PUT', '/api/owner/languages/sk', ['enabled' => false, 'name' => 'Changed']],
        ['DELETE', '/api/owner/languages/sk', null],
        ['GET', '/api/owner/translations', null],
        ['PUT', '/api/owner/translations', ['values' => ['test.bye' => ['en' => 'Changed']]]],
        ['GET', '/api/owner/translations/sk/export', null],
        ['PUT', '/api/owner/translations/sk/import', ['test.bye' => 'Changed']],
    ];
}

/* ------------------------------------------------ the strings a page asks for */

test('before there is any string: the languages on offer, and empty maps that are still objects', function (): void {
    $english = anonymous('GET', '/api/translations/en');
    assert_same(200, $english['status']);
    assert_same(json_text(['language' => 'en', 'languages' => [ENGLISH, SLOVAK], 'values' => new stdClass()]), $english['raw']);
    assert_same('application/json; charset=utf-8', $english['headers']['content-type'] ?? null);

    $slovak = anonymous('GET', '/api/translations/sk');
    assert_same(json_text(['language' => 'sk', 'languages' => [ENGLISH, SLOVAK], 'values' => new stdClass(), 'english' => new stdClass()]), $slovak['raw'], '{} and not []');

    $export = as_user(OWNER, 'GET', '/api/owner/translations/sk/export');
    assert_same([200, '{}'], [$export['status'], $export['raw']], 'the export of a language with no strings');
    assert_same([], as_user(OWNER, 'GET', '/api/owner/translations')['body']['keys']);
});

test('the bundle: a language\'s strings with English underneath, the same for everybody', function (): void {
    seed_strings();
    $english = ['test.hello' => 'Hello, {name}!', 'test.bye' => 'Goodbye', 'test.count' => '{count} of {total}'];

    $slovak = anonymous('GET', '/api/translations/sk');
    assert_same(['language', 'languages', 'values', 'english'], array_keys($slovak['body']));
    assert_same('sk', $slovak['body']['language']);
    assert_same([ENGLISH, SLOVAK], $slovak['body']['languages']);
    assert_same_map(['test.hello' => 'Dobrý deň, {name}!'] + $english, $slovak['body']['values'], 'a key with no Slovak string comes in English');
    assert_same_map($english, $slovak['body']['english'], 'English itself, for the owner\'s pages');
    assert_false(array_key_exists('test.new', $slovak['body']['values']), 'a key with no string at all is not there: the page shows the key');

    $own = anonymous('GET', '/api/translations/en');
    assert_same(['language', 'languages', 'values'], array_keys($own['body']), 'no second copy of English');
    assert_same_map($english, $own['body']['values']);

    // A language the app does not have: answered in English, and told so.
    $unknown = anonymous('GET', '/api/translations/de');
    assert_same([200, 'en'], [$unknown['status'], $unknown['body']['language']]);
    assert_same($own['raw'], $unknown['raw']);
    assert_same($own['raw'], anonymous('GET', '/api/translations/pt-br')['raw']);

    // A code with a region that is not offered itself is answered by its language, when that one is: a
    // Slovak browser's first wish is "sk-sk", and it gets Slovak at once, not English and a second request.
    $regional = anonymous('GET', '/api/translations/sk-sk');
    assert_same([200, 'sk'], [$regional['status'], $regional['body']['language']], '"language" says which one it is');
    assert_same($slovak['raw'], $regional['raw'], 'the Slovak bundle itself');
    assert_same($slovak['headers']['etag'], $regional['headers']['etag'], 'under the same tag');
    assert_same($own['raw'], anonymous('GET', '/api/translations/en-gb')['raw'], 'and English by English');
    $austrian = anonymous('GET', '/api/translations/de-at');
    assert_same([200, 'en'], [$austrian['status'], $austrian['body']['language']], 'a language the app does not have, with a region or without: English, as before');
    assert_same(404, anonymous('GET', '/api/translations/sk-SK')['status'], 'a code is small letters: what is not one is still no language');

    // Nobody is asked who they are: a token is not looked at, a good one or a bad one; and nothing is kept in the browser.
    $withToken = call($GLOBALS['app']['base'], 'GET', '/api/translations/sk', null, test_bearer(test_token(555)));
    assert_same($slovak['raw'], $withToken['raw']);
    assert_same(0, (int) db_value('SELECT count(*) FROM users WHERE id = 555'), 'nobody was recorded as having been here');
    $noRole = call($GLOBALS['app']['base'], 'GET', '/api/translations/sk', null, token_of(NOBODY));
    assert_same([200, $slovak['raw']], [$noRole['status'], $noRole['raw']], 'somebody with no role here reads the same words');
    $badToken = call($GLOBALS['app']['base'], 'GET', '/api/translations/sk', null, test_bearer('not.a.token'));
    assert_same([200, $slovak['raw']], [$badToken['status'], $badToken['raw']], 'a sign-in that ran out still reads in its language');
    foreach ([$slovak, $own, $withToken, $badToken] as $answer) {
        assert_false(isset($answer['headers']['set-cookie']), 'no cookie');
        assert_false(isset($answer['headers']['www-authenticate']), 'and no sign-in asked for');
    }
    // As a website is asked, under its own name: the words are nobody's data.
    assert_same($slovak['raw'], call($GLOBALS['app']['base'], 'GET', '/api/translations/sk', null, ['Host: academy.example.com'])['raw']);
});

test('a code that is not one is 404, and the database never hears of it', function (): void {
    foreach (['EN', 'Sk', 'e', 'eng', 'en-', 'en-GB', 'en_gb', 'en-gbr', 'sk%0A', '%20sk', 'sk%27', '%FF', '%C3%28', 'en.json'] as $code) {
        $answer = anonymous('GET', "/api/translations/$code");
        assert_refused(404, 'not_found', 'There is no such language.', $answer, $code);
    }
    assert_same(404, anonymous('GET', '/api/translations/en/more')['status']);
    assert_same(404, anonymous('GET', '/api/translations')['status'], 'there is no list of its own: the bundle carries it');
    assert_same(404, anonymous('GET', '/api/languages')['status']);
    assert_same(405, anonymous('PUT', '/api/translations/sk', ['values' => ['test.bye' => 'x']])['status'], 'nothing is written here');

    // The owner's routes: a code that is not one is no language.
    foreach (['%FF', 'SK', 'eng'] as $code) {
        assert_refused(404, 'not_found', 'There is no such language.', as_user(OWNER, 'PUT', "/api/owner/languages/$code", ['name' => 'X']), $code);
        assert_same(404, as_user(OWNER, 'DELETE', "/api/owner/languages/$code")['status'], $code);
        assert_same(404, as_user(OWNER, 'GET', "/api/owner/translations/$code/export")['status'], $code);
        assert_same(404, as_user(OWNER, 'PUT', "/api/owner/translations/$code/import", ['test.bye' => 'x'])['status'], $code);
    }
    assert_same([], server_problems($GLOBALS['app']), 'bytes that are not text reached no query (that would be a [db] error and a 503)');
});

test('asked again: 304 for the tag the browser holds, compared weakly, with the headers a cache needs', function (): void {
    $first = anonymous('GET', '/api/translations/sk');
    $etag = $first['headers']['etag'] ?? '';
    assert_same('"' . md5($first['raw']) . '"', $etag);
    assert_same('no-cache', $first['headers']['cache-control'] ?? null, 'kept, and asked about every time');

    // As the tag comes back from behind a server that compressed the answer: weakened (a proxy), or marked
    // inside the quotes (Apache's mod_deflate, mod_brotli); without the second the 304 would never be answered there.
    $marked = static fn (string $suffix): string => substr($etag, 0, -1) . $suffix . '"';
    foreach ([$etag, "W/$etag", "\"other\", W/$etag", "\"a\" , $etag , \"b\"", '*', $marked('-gzip'), 'W/' . $marked('-gzip'), $marked('-br'), '"other-gzip", ' . $marked('-zstd')] as $held) {
        $again = anonymous('GET', '/api/translations/sk', null, ["If-None-Match: $held"]);
        assert_same([304, ''], [$again['status'], $again['raw']], $held);
        assert_same([$etag, 'no-cache'], [$again['headers']['etag'] ?? null, $again['headers']['cache-control'] ?? null], "the 304's own headers ($held): never no-store");
        assert_false(isset($again['headers']['set-cookie']), 'and no cookie with it');
    }
    foreach (['"other"', 'W/"other"', trim($etag, '"'), '"' . md5('x') . '"', '"' . md5('x') . '-gzip"', $marked('-gzipped'), $marked('-gzip-gzip')] as $held) {
        $again = anonymous('GET', '/api/translations/sk', null, ["If-None-Match: $held"]);
        assert_same([200, $first['raw']], [$again['status'], $again['raw']], $held);
    }
    assert_true($etag !== anonymous('GET', '/api/translations/en')['headers']['etag'], 'another language, another tag');

    // A string changes: the tag the browser holds is no longer the answer's.
    db_exec("UPDATE translations SET value = 'Bye' WHERE key_name = 'test.bye' AND language_code = 'en'");
    $changed = anonymous('GET', '/api/translations/sk', null, ["If-None-Match: $etag"]);
    assert_same([200, 'Bye'], [$changed['status'], $changed['body']['values']['test.bye']]);
    assert_true($changed['headers']['etag'] !== $etag);
    db_exec("UPDATE translations SET value = 'Goodbye' WHERE key_name = 'test.bye' AND language_code = 'en'");
    assert_same($etag, anonymous('GET', '/api/translations/sk')['headers']['etag'], 'the same strings, the same tag');
});

/* ------------------------------------------------------------- who may ask */

test('who may do what: the owner\'s routes are for the ADMIN role, and nobody else changes a word', function (): void {
    $before = [every_string(), every_language()];
    foreach (owner_routes() as [$method, $url, $body]) {
        assert_refused(401, 'sign_in_required', 'Sign in first.', anonymous($method, $url, $body), "$method $url, signed out");
        assert_refused(403, 'owner_only', 'Only the owner of this site may read or change its words.', as_user(BEN, $method, $url, $body), "$method $url, somebody who studies here");
        assert_refused(403, 'no_access', 'Your account has no access to Japanese Academy.', as_user(NOBODY, $method, $url, $body), "$method $url, with no role in this app");
        assert_same(401, call($GLOBALS['app']['base'], $method, $url, $body, test_bearer(test_token(OWNER, ['ADMIN'], ['exp' => time() - 120])))['status'], "$method $url, a token that ran out");
    }
    assert_same($before, [every_string(), every_language()], 'and nothing of it was done');

    foreach ([OWNER, ADA] as $admin) {
        assert_same(200, as_user($admin, 'GET', '/api/owner/languages')['status']);
        assert_same(200, as_user($admin, 'GET', '/api/owner/translations')['status']);
        assert_same(200, as_user($admin, 'GET', '/api/owner/translations/sk/export')['status']);
    }

    // A role in the body, an address or a header of the request is nobody's role.
    assert_same(403, as_user(BEN, 'GET', '/api/owner/languages?role=ADMIN', null, ['X-Roles: ADMIN'])['status']);
    $claimed = as_user(BEN, 'POST', '/api/owner/languages', ['code' => 'xx', 'name' => 'X', 'nativeName' => 'X', 'roles' => ['ADMIN'], 'role' => 'ADMIN']);
    assert_same([403, 'owner_only'], [$claimed['status'], $claimed['body']['code'] ?? null]);
    assert_same(403, as_user(BEN, 'DELETE', '/api/owner/languages/en')['status'], 'refused for who asks before anything else is said');
    assert_same($before[1], every_language());
});

test('the owner\'s checks, in their order: the page it came from, who asks, how much was sent', function (): void {
    $base = $GLOBALS['app']['base'];
    $here = substr($base, strlen('http://'));
    $before = [every_string(), every_language()];
    $language = ['code' => 'xx', 'name' => 'Elsewhere', 'nativeName' => 'Elsewhere'];

    // A page of another site, open in the owner's browser: the browser names it, and it is never this app's address.
    foreach (['https://elsewhere.example', "http://elsewhere.example:" . parse_url($base, PHP_URL_PORT), 'null', "http://$here.example", "http://$here, http://$here", 'http://localhost'] as $origin) {
        foreach (owner_routes() as [$method, $url, $body]) {
            assert_refused(403, 'wrong_origin', 'That request came from another site\'s page, not from this app.', as_user(OWNER, $method, $url, $body, ["Origin: $origin"]), "$method $url from $origin");
        }
    }
    assert_same($before, [every_string(), every_language()], 'and nothing of it was done');
    // Its own pages name this very address; the scheme may differ (a proxy in front of a site speaks https).
    foreach (["http://$here", "https://$here", strtoupper("http://$here")] as $origin) {
        assert_same(200, as_user(OWNER, 'GET', '/api/owner/languages', null, ["Origin: $origin"])['status'], $origin);
    }
    assert_same(200, save(OWNER, [])['status'], 'and a request no page made names none');

    // The order: set up and signed in first (401), then the page (403 wrong_origin), then who asks (403 owner_only), then the size (413).
    assert_same(401, anonymous('POST', '/api/owner/languages', $language, ['Origin: https://elsewhere.example'])['status'], 'nobody signed in: that first');
    assert_same('wrong_origin', as_user(BEN, 'POST', '/api/owner/languages', $language, ['Origin: https://elsewhere.example'])['body']['code'] ?? null, 'the page before the person');
    $frame = '{"values":{"test.bye":{"sk":"%s"}}}';
    $fill = static fn (int $bytes): string => sprintf($frame, str_repeat('x', $bytes - strlen(sprintf($frame, ''))));
    $json = ['Content-Type: application/json'];
    assert_same(TRANSLATIONS_BODY_LIMIT, strlen($fill(TRANSLATIONS_BODY_LIMIT)));
    $most = raw_call($base, 'PUT', '/api/owner/translations', $fill(TRANSLATIONS_BODY_LIMIT), array_merge($json, token_of(OWNER)));
    assert_same([422, 'invalid_value'], [$most['status'], $most['body']['code'] ?? null], '1 MiB is taken, and then read: the string in it is too long');
    $over = raw_call($base, 'PUT', '/api/owner/translations', $fill(TRANSLATIONS_BODY_LIMIT + 1), array_merge($json, token_of(OWNER)));
    assert_same([413, ['error' => 'That is more than this site takes in one go.', 'code' => 'too_large']], [$over['status'], $over['body']], 'one byte more is not');
    assert_same(413, raw_call($base, 'PUT', '/api/owner/translations/sk/import', '{"test.bye":"' . str_repeat('x', TRANSLATIONS_BODY_LIMIT) . '"}', array_merge($json, token_of(OWNER)))['status']);
    assert_same(413, raw_call($base, 'POST', '/api/owner/languages', '{"code":"xx","name":"' . str_repeat('x', TRANSLATIONS_BODY_LIMIT) . '"}', array_merge($json, token_of(OWNER)))['status'], 'every owner route');
    $member = raw_call($base, 'PUT', '/api/owner/translations', $fill(TRANSLATIONS_BODY_LIMIT + 1), array_merge($json, token_of(BEN)));
    assert_same([403, 'owner_only'], [$member['status'], $member['body']['code'] ?? null], 'who asks before how much');

    // A body is JSON or nothing: what a form on another site's page can send without asking changes nothing.
    $posted = raw_call($base, 'POST', '/api/owner/languages', json_text($language), array_merge(['Content-Type: text/plain'], token_of(OWNER)));
    assert_same([422, 'invalid_language'], [$posted['status'], $posted['body']['code'] ?? null], 'JSON sent as text/plain is no body');
    $form = raw_call($base, 'POST', '/api/owner/languages', 'code=xx&name=X&nativeName=X', array_merge(['Content-Type: application/x-www-form-urlencoded'], token_of(OWNER)));
    assert_same([422, 'invalid_language'], [$form['status'], $form['body']['code'] ?? null], 'nor is a form');
    $put = raw_call($base, 'PUT', '/api/owner/translations', '{"values":{"test.bye":{"en":"Changed"}}}', array_merge(['Content-Type: text/plain'], token_of(OWNER)));
    assert_same([422, 'invalid_value'], [$put['status'], $put['body']['code'] ?? null]);
    assert_same(400, raw_call($base, 'PUT', '/api/owner/translations', '{"values": ', array_merge($json, token_of(OWNER)))['status'], 'JSON that is cut off');
    assert_same($before, [every_string(), every_language()], 'nothing of all this was done');

    // The rule itself.
    foreach ([['', 'academy.example.com'], ['', ''], ['https://academy.example.com', 'academy.example.com'], ['http://127.0.0.1:8200', '127.0.0.1:8200'],
        ['https://Academy.Example.com', 'academy.example.COM'], ['http://[::1]:8200', '[::1]:8200']] as [$origin, $host]) {
        assert_true(owner_same_origin($origin, $host), "'$origin' at '$host'");
    }
    foreach ([['https://elsewhere.example', 'academy.example.com'], ['null', 'academy.example.com'], ['http://127.0.0.1:4400', '127.0.0.1:8200'], ['http://localhost:8200', '127.0.0.1:8200'],
        ['https://academy.example.com.elsewhere.example', 'academy.example.com'], ['https://academy.example.com/', 'academy.example.com'], ['academy.example.com', 'academy.example.com'],
        ['https://academy.example.com', ''], ['ftp://academy.example.com', 'academy.example.com'], ["https://academy.example.com\n", 'academy.example.com'],
        ['https://elsewhere.example/academy.example.com', 'academy.example.com'], ['https://academy.example.com https://elsewhere.example', 'academy.example.com']] as [$origin, $host]) {
        assert_false(owner_same_origin($origin, $host), "'$origin' at '$host'");
    }
});

test('without sign-in the owner is this computer, straight to its own address; and a copy that is not set up says so first', function (): void {
    $none = start_app();
    $before = [every_string(), every_language()];
    $languages = call($none['base'], 'GET', '/api/owner/languages');
    assert_same([200, ['en', 'sk']], [$languages['status'], array_column($languages['body']['languages'], 'code')], 'from this computer: the owner');
    assert_same(200, call($none['base'], 'GET', '/api/owner/translations')['status']);

    // Through a tunnel, a proxy, or a name of somebody's own that points here: anybody.
    foreach (['X-Forwarded-For: 203.0.113.9', 'Forwarded: for=203.0.113.9', 'Host: academy.example.com'] as $header) {
        foreach (owner_routes() as [$method, $url, $body]) {
            $r = call($none['base'], $method, $url, $body, [$header]);
            assert_same([403, ['error' => AUTH_NONE_ONLY, 'code' => 'this_computer_only']], [$r['status'], $r['body']], "$header: $method $url");
        }
        assert_same(200, call($none['base'], 'GET', '/api/translations/sk', null, [$header])['status'], "$header: the words themselves are for everybody");
    }
    // A page of another site in the owner's own browser does reach 127.0.0.1, as this computer: the Origin gives it away.
    foreach (owner_routes() as [$method, $url, $body]) {
        assert_same('wrong_origin', call($none['base'], $method, $url, $body, ['Origin: https://elsewhere.example'])['body']['code'] ?? null, "$method $url from another site's page");
    }
    $posted = raw_call($none['base'], 'POST', '/api/owner/languages', '{"code":"xx","name":"X","nativeName":"X"}', ['Content-Type: text/plain']);
    assert_same([422, 'invalid_language'], [$posted['status'], $posted['body']['code'] ?? null], 'and a POST it can send without asking (text/plain) carries no body');
    assert_same($before, [every_string(), every_language()], 'nothing of it was done');

    // The app's own page, in the development server too: its address is the Host the request names.
    $saved = call($none['base'], 'PUT', '/api/owner/translations', ['values' => ['test.bye' => ['sk' => 'Ahoj nabudúce']]], ['Origin: ' . $none['base']]);
    assert_same(200, $saved['status'], test_show($saved['body']));
    assert_same(['Ahoj nabudúce', auth_local_user_id()], array_slice(stored('test.bye', 'sk'), 0, 2), 'saved by the owner');
    assert_same(200, call($none['base'], 'PUT', '/api/owner/translations', ['values' => ['test.bye' => ['sk' => '']]])['status']);
    assert_same($before[0], every_string());
    assert_same([], server_problems($none));

    // A copy that is not set up: 503 not_set_up from an owner route too, never a 500 from asking who is there.
    $dir = test_server_config('none');
    unlink("$dir/auth.local.php");
    $bare = start_app(['env' => ['ACADEMY_CONFIG_DIR' => $dir]]);
    foreach (owner_routes() as [$method, $url, $body]) {
        $r = call($bare['base'], $method, $url, $body);
        assert_same([503, 'not_set_up'], [$r['status'], $r['body']['code'] ?? null], "$method $url");
    }
    $r = call($bare['base'], 'GET', '/api/translations/en');
    assert_same([503, 'not_set_up', '/setup.php'], [$r['status'], $r['body']['code'] ?? null, $r['body']['setup'] ?? null], 'and the words: the page then shows "not set up yet"');
    assert_same($before, [every_string(), every_language()]);
    assert_same([], server_problems($bare));
});

/* ---------------------------------------------------------------- languages */

test('languages: added after the others, offered at once or hidden as the body says; renamed, reordered, switched off; English never', function (): void {
    $list = as_user(OWNER, 'GET', '/api/owner/languages');
    assert_same([
        ENGLISH + ['enabled' => true, 'sortOrder' => 1, 'seeded' => true],
        SLOVAK + ['enabled' => true, 'sortOrder' => 2, 'seeded' => true],
    ], $list['body']['languages']);

    $made = as_user(ADA, 'POST', '/api/owner/languages', ['code' => 'de', 'name' => 'German', 'nativeName' => 'Deutsch']);
    assert_same([201, ['language' => ['code' => 'de', 'name' => 'German', 'nativeName' => 'Deutsch', 'enabled' => true, 'sortOrder' => 3, 'seeded' => false]]], [$made['status'], $made['body']]);

    // What a new language is: last, and offered unless the body says otherwise, whatever else the body says.
    $made = as_user(OWNER, 'POST', '/api/owner/languages', ['code' => 'pt-br', 'name' => "  Portuguese\x07 (Brazil) ", 'nativeName' => str_repeat('ç', 50), 'sortOrder' => 0, 'seeded' => true]);
    assert_same(201, $made['status'], test_show($made['body']));
    assert_same(['language' => ['code' => 'pt-br', 'name' => 'Portuguese (Brazil)', 'nativeName' => str_repeat('ç', 50), 'enabled' => true, 'sortOrder' => 4, 'seeded' => false]], $made['body']);
    assert_same('pt-br', anonymous('GET', '/api/translations/pt-br')['body']['language'], 'offered, a code with a region answers itself');

    // Hidden from the start when the body says so (the Languages page does): there for its strings to be
    // written, offered to nobody until the owner switches it on.
    $hidden = as_user(OWNER, 'POST', '/api/owner/languages', ['code' => 'fr', 'name' => 'French', 'nativeName' => 'Français', 'enabled' => false]);
    assert_same(201, $hidden['status'], test_show($hidden['body']));
    assert_same(['language' => ['code' => 'fr', 'name' => 'French', 'nativeName' => 'Français', 'enabled' => false, 'sortOrder' => 5, 'seeded' => false]], $hidden['body']);
    $french = anonymous('GET', '/api/translations/fr');
    assert_same(['en', ['en', 'sk', 'de', 'pt-br']], [$french['body']['language'], array_column($french['body']['languages'], 'code')], 'nobody is offered it');
    assert_true(in_array('fr', array_column(as_user(OWNER, 'GET', '/api/owner/languages')['body']['languages'], 'code'), true), 'the owner\'s page has it');
    assert_same(true, as_user(OWNER, 'PUT', '/api/owner/languages/fr', ['enabled' => true])['body']['language']['enabled']);
    assert_same('fr', anonymous('GET', '/api/translations/fr-ca')['body']['language'], 'switched on, it is offered, and answers for its regions');
    $shown = as_user(OWNER, 'POST', '/api/owner/languages', ['code' => 'it', 'name' => 'Italian', 'nativeName' => 'Italiano', 'enabled' => true]);
    assert_same([201, true], [$shown['status'], $shown['body']['language']['enabled'] ?? null], 'and true is what it is without saying');
    db_exec("DELETE FROM languages WHERE code IN ('fr', 'it')");

    assert_refused(409, 'language_exists', 'There is a language "de" already.', as_user(OWNER, 'POST', '/api/owner/languages', ['code' => 'de', 'name' => 'Deutsch', 'nativeName' => 'Deutsch']));
    $invalid = [
        'enabled as text' => ['code' => 'fr', 'name' => 'French', 'nativeName' => 'Français', 'enabled' => 'false'],
        'enabled as a number' => ['code' => 'fr', 'name' => 'French', 'nativeName' => 'Français', 'enabled' => 0],
        'enabled as nothing' => ['code' => 'fr', 'name' => 'French', 'nativeName' => 'Français', 'enabled' => null],
        'a name nobody can see' => ['code' => 'fr', 'name' => "\u{200B}\u{2060}", 'nativeName' => 'Français'],
        'a native name that is a soft hyphen' => ['code' => 'fr', 'name' => 'French', 'nativeName' => " \u{00AD} "],
        'no body' => null, 'a list' => ['de'], 'no code' => ['name' => 'French', 'nativeName' => 'Français'],
        'a code in capitals' => ['code' => 'FR', 'name' => 'French', 'nativeName' => 'Français'],
        'three letters' => ['code' => 'fra', 'name' => 'French', 'nativeName' => 'Français'],
        'a code that is a number' => ['code' => 12, 'name' => 'French', 'nativeName' => 'Français'],
        'no name' => ['code' => 'fr', 'nativeName' => 'Français'],
        'an empty name' => ['code' => 'fr', 'name' => " \x07 ", 'nativeName' => 'Français'],
        'a name of 51 characters' => ['code' => 'fr', 'name' => str_repeat('é', 51), 'nativeName' => 'Français'],
        'a name that is not text' => ['code' => 'fr', 'name' => ['French'], 'nativeName' => 'Français'],
        'no native name' => ['code' => 'fr', 'name' => 'French'],
        'a native name that is a number' => ['code' => 'fr', 'name' => 'French', 'nativeName' => 5],
    ];
    foreach ($invalid as $what => $body) {
        $refused = as_user(OWNER, 'POST', '/api/owner/languages', $body);
        assert_same([422, 'invalid_language'], [$refused['status'], $refused['body']['code'] ?? null], $what);
    }
    assert_same(4, (int) db_value('SELECT count(*) FROM languages'));

    // Offered at once: it has no strings, so it reads in English; but it is that language.
    $german = anonymous('GET', '/api/translations/de');
    assert_same('de', $german['body']['language']);
    assert_same(['en', 'sk', 'de', 'pt-br'], array_column($german['body']['languages'], 'code'));
    assert_same(['code', 'name', 'nativeName'], array_keys($german['body']['languages'][2]), 'only what a chooser shows');
    assert_same_map($german['body']['english'], $german['body']['values']);

    // Changed: only what is sent.
    $renamed = as_user(OWNER, 'PUT', '/api/owner/languages/de', ['name' => ' German (Germany) ', 'sortOrder' => 0, 'code' => 'xx', 'seeded' => true]);
    assert_same(['language' => ['code' => 'de', 'name' => 'German (Germany)', 'nativeName' => 'Deutsch', 'enabled' => true, 'sortOrder' => 0, 'seeded' => false]], $renamed['body']);
    assert_same(['de', 'en', 'sk', 'pt-br'], array_column(anonymous('GET', '/api/translations/en')['body']['languages'], 'code'), 'in its new place');
    assert_same('German (Germany)', as_user(OWNER, 'PUT', '/api/owner/languages/de', new stdClass())['body']['language']['name'], 'nothing sent, nothing changed');
    $bodiless = as_user(OWNER, 'PUT', '/api/owner/languages/de');
    assert_same([200, 'German (Germany)'], [$bodiless['status'], $bodiless['body']['language']['name'] ?? null], 'nor with no body at all');
    assert_same('Deutsch (DE)', as_user(OWNER, 'PUT', '/api/owner/languages/de', ['nativeName' => 'Deutsch (DE)'])['body']['language']['nativeName']);
    $changes = [
        'enabled as text' => ['enabled' => 'false'], 'enabled as a number' => ['enabled' => 0], 'half an order' => ['sortOrder' => 1.5], 'an order as text' => ['sortOrder' => '3'],
        'an order below 0' => ['sortOrder' => -1], 'an order above 1000' => ['sortOrder' => 1001], 'an empty name' => ['name' => ''], 'a long native name' => ['nativeName' => str_repeat('x', 51)],
        'a list' => ['name'],
    ];
    foreach ($changes as $what => $body) {
        $refused = as_user(OWNER, 'PUT', '/api/owner/languages/de', $body);
        assert_same([422, 'invalid_language'], [$refused['status'], $refused['body']['code'] ?? null], $what);
    }
    assert_same(1000, as_user(OWNER, 'PUT', '/api/owner/languages/de', ['sortOrder' => 1000])['body']['language']['sortOrder']);
    assert_same(404, as_user(OWNER, 'PUT', '/api/owner/languages/fr', ['name' => 'French'])['status'], 'a language there is not');

    // Switched off: no longer offered, and asked for by name it reads in English. Never refused, but for English.
    $hidden = as_user(OWNER, 'PUT', '/api/owner/languages/sk', ['enabled' => false]);
    assert_same([200, false], [$hidden['status'], $hidden['body']['language']['enabled']], 'Slovak too: it keeps its strings');
    $slovak = anonymous('GET', '/api/translations/sk');
    assert_same('en', $slovak['body']['language']);
    assert_same(['en', 'pt-br', 'de'], array_column($slovak['body']['languages'], 'code'));
    assert_false(array_key_exists('english', $slovak['body']));
    assert_same('en', anonymous('GET', '/api/translations/sk-sk')['body']['language'], 'nor does it answer for its regions');
    assert_same(['en', 'sk', 'pt-br', 'de'], array_column(as_user(OWNER, 'GET', '/api/owner/languages')['body']['languages'], 'code'), 'the owner sees the hidden ones');
    assert_same('Dobrý deň, {name}!', as_user(OWNER, 'GET', '/api/owner/translations/sk/export')['body']['test.hello'] ?? null, 'with its strings');
    assert_same(true, as_user(OWNER, 'PUT', '/api/owner/languages/sk', ['enabled' => true])['body']['language']['enabled']);

    assert_refused(409, 'fallback_language', 'English cannot be switched off: every other language falls back to it.', as_user(OWNER, 'PUT', '/api/owner/languages/en', ['enabled' => false, 'name' => 'Changed']));
    assert_same(ENGLISH + ['enabled' => true, 'sortOrder' => 5, 'seeded' => true], as_user(OWNER, 'PUT', '/api/owner/languages/en', ['enabled' => true, 'sortOrder' => 5])['body']['language'], 'on is what it is; its place is anybody\'s to choose');
    as_user(OWNER, 'PUT', '/api/owner/languages/en', ['sortOrder' => 1]);

    // At most 20.
    for ($i = 0; $i < 16; $i++) {
        db_exec('INSERT INTO languages (code, name, native_name, sort_order) VALUES (?, ?, ?, 500)', ['x' . chr(97 + $i), "Filler $i", "Filler $i"]);
    }
    $full = as_user(OWNER, 'POST', '/api/owner/languages', ['code' => 'fr', 'name' => 'French', 'nativeName' => 'Français']);
    assert_same([422, 'too_many_languages'], [$full['status'], $full['body']['code']]);
    assert_same('language_exists', as_user(OWNER, 'POST', '/api/owner/languages', ['code' => 'de', 'name' => 'German', 'nativeName' => 'Deutsch'])['body']['code'], 'one that is there is said to be there, full or not');
    db_exec("DELETE FROM languages WHERE name LIKE 'Filler %'");
    $french = as_user(OWNER, 'POST', '/api/owner/languages', ['code' => 'fr', 'name' => 'French', 'nativeName' => 'Français']);
    assert_same([201, 1000], [$french['status'], $french['body']['language']['sortOrder']], 'last, and never past what an order may be');
    db_exec("DELETE FROM languages WHERE code = 'fr'");
});

test('two people adding the last language the app keeps, at the same moment: one waits for the other, and the most holds', function (): void {
    $fillers = LANGUAGES_MAX - 1 - (int) db_value('SELECT count(*) FROM languages');
    for ($i = 0; $i < $fillers; $i++) {
        db_exec('INSERT INTO languages (code, name, native_name, sort_order) VALUES (?, ?, ?, 500)', ['q' . chr(97 + $i), "Filler $i", "Filler $i"]);
    }
    assert_same(LANGUAGES_MAX - 1, (int) db_value('SELECT count(*) FROM languages'), 'room for one more');

    // Somebody adds the twentieth and is not finished. Counting alone, a second request would not see that
    // row, would find room and add a twenty-first.
    $other = somebody_else();
    $other->beginTransaction();
    $other->exec("INSERT INTO languages (code, name, native_name, sort_order) VALUES ('qz', 'Filler of somebody else', 'Filler', 500)");
    $second = begin_as(ADA, 'POST', '/api/owner/languages', ['code' => 'qy', 'name' => 'One too many', 'nativeName' => 'One too many']);
    try {
        if (!$second['waits']()) {
            fail('it did not wait for whoever is adding one, and answered ' . test_show($second['answer']()));
        }
        $other->commit();
        $answer = $second['answer']();
        assert_same([422, 'too_many_languages'], [$answer['status'], $answer['body']['code'] ?? null], test_show($answer['body']));
        assert_same([LANGUAGES_MAX, 0], [(int) db_value('SELECT count(*) FROM languages'), (int) db_value("SELECT count(*) FROM languages WHERE code = 'qy'")]);

        // Reading goes on while somebody adds one: only what writes the table waits.
        $other->beginTransaction();
        $other->exec('LOCK TABLE languages IN SHARE ROW EXCLUSIVE MODE');
        assert_same(200, anonymous('GET', '/api/translations/sk')['status'], 'the page\'s strings');
        assert_same(200, save(ADA, ['test.hello' => ['sk' => 'Dobrý deň, {name}!']])['status'], 'and a save of strings, which holds the languages\' rows');
        $other->rollBack();
    } finally {
        if ($other->inTransaction()) {
            $other->rollBack();
        }
        $second['answer']();
        db_exec("DELETE FROM languages WHERE name LIKE 'Filler %' OR code = 'qy'");
    }
    assert_same(['en', 'sk', 'pt-br', 'de'], array_column(as_user(OWNER, 'GET', '/api/owner/languages')['body']['languages'], 'code'), 'and the languages are what they were');
});

/* ------------------------------------------------------------------ the grid */

test('saving strings: the changed ones, by whoever saved them; a string sent as it is stays as it was; the last save is kept', function (): void {
    $grid = as_user(ADA, 'GET', '/api/owner/translations');
    assert_same(['languages', 'keys'], array_keys($grid['body']));
    assert_same(as_user(ADA, 'GET', '/api/owner/languages')['body']['languages'], $grid['body']['languages'], 'every language, hidden or not');
    assert_same([
        ['name' => 'test.bye', 'description' => '', 'values' => ['en' => 'Goodbye']],
        ['name' => 'test.count', 'description' => 'How far; {count} of {total}', 'values' => ['en' => '{count} of {total}']],
        ['name' => 'test.hello', 'description' => 'A greeting; {name} is who is greeted', 'values' => ['en' => 'Hello, {name}!', 'sk' => 'Dobrý deň, {name}!']],
        ['name' => 'test.new', 'description' => 'A key with no string yet', 'values' => []],
    ], $grid['body']['keys'], 'by name');
    assert_true(str_contains($grid['raw'], '{"name":"test.new","description":"A key with no string yet","values":{}}'), 'no strings is {} and not []');
    assert_same('no-store', $grid['headers']['cache-control'] ?? null, 'the owner\'s answers are never kept');

    $untouched = stored('test.bye', 'en');
    $saved = save(ADA, ['test.hello' => ['sk' => "  Ahoj,\x07 {name}! "]]);
    assert_same(200, $saved['status'], test_show($saved['body']));
    assert_same(['en' => 'Hello, {name}!', 'sk' => 'Ahoj, {name}!'], $saved['body']['keys'][2]['values'], 'answered with the grid as it is now; the text cleaned');
    assert_same(['Ahoj, {name}!', ADA], array_slice(stored('test.hello', 'sk'), 0, 2), 'who saved it is the token\'s person');
    assert_same($untouched, stored('test.bye', 'en'), 'what was not sent was not touched');
    assert_same(['Hello, {name}!', null], array_slice(stored('test.hello', 'en'), 0, 2), 'nor its English, written by a migration: nobody');

    // Who saved it is never what a body says.
    $claimed = as_user(ADA, 'PUT', '/api/owner/translations', ['values' => ['test.count' => ['sk' => '{count} / {total}']], 'updatedBy' => OWNER, 'userId' => OWNER, 'uid' => OWNER]);
    assert_same(200, $claimed['status']);
    assert_same(ADA, stored('test.count', 'sk')[1]);
    assert_same(200, save(ADA, ['test.count' => ['sk' => '']])['status']);

    // Somebody else's page still shows the old grid and sends strings as they are: nothing is rewritten.
    $ada = stored('test.hello', 'sk');
    assert_same(200, save(OWNER, ['test.hello' => ['sk' => 'Ahoj, {name}!', 'en' => 'Hello, {name}!'], 'test.bye' => ['en' => ' Goodbye ']])['status']);
    assert_same($ada, stored('test.hello', 'sk'), 'still Ada\'s, from when she saved it');
    assert_same($untouched, stored('test.bye', 'en'));

    // Two people, one string: the last save is kept, and says whose it is. Other people's changes come back with every save.
    assert_same(200, save(ADA, ['test.hello' => ['sk' => 'Vitaj, {name}!']])['status']);
    $owner = save(OWNER, ['test.hello' => ['sk' => 'Vitaj!'], 'test.bye' => ['sk' => 'Dovidenia']]);
    assert_same(['en' => 'Hello, {name}!', 'sk' => 'Vitaj!'], $owner['body']['keys'][2]['values'], 'a translation may leave a placeholder out');
    assert_same(['Vitaj!', OWNER], array_slice(stored('test.hello', 'sk'), 0, 2));
    assert_true(stored('test.hello', 'sk')[2] > $ada[2], 'and when');
    assert_same(['en' => 'Goodbye', 'sk' => 'Dovidenia'], save(ADA, [])['body']['keys'][0]['values'], 'a save of nothing is the fresh grid');

    // English reworded: its placeholders stay. A string for a key that had none: English first.
    assert_same(200, save(ADA, ['test.hello' => ['en' => 'Hi, {name}!'], 'test.new' => ['en' => 'New: {what}', 'sk' => 'Nové: {what}']])['status']);
    assert_same(['Hi, {name}!', ADA], array_slice(stored('test.hello', 'en'), 0, 2));
    assert_same('Nové: {what}', anonymous('GET', '/api/translations/sk')['body']['values']['test.new']);

    // An empty string: that language has none of its own again, and reads in English.
    assert_same(200, save(ADA, ['test.hello' => ['sk' => "  \t"]])['status']);
    assert_same(null, stored('test.hello', 'sk'));
    assert_same('Hi, {name}!', anonymous('GET', '/api/translations/sk')['body']['values']['test.hello']);
    assert_same(200, save(ADA, ['test.hello' => ['sk' => ' ']])['status'], 'and once more, when there is none');
    assert_same(200, save(ADA, ['test.hello' => ['sk' => 'Vitaj, {name}!']])['status']);

    // Empty is what nobody can see: a zero-width space alone is not kept as a string that draws an empty place.
    assert_same(200, save(ADA, ['test.hello' => ['sk' => "\u{200B}"]])['status']);
    assert_same(null, stored('test.hello', 'sk'), 'that string goes, like any empty one');
    $unseen = save(ADA, ['test.hello' => ['en' => " \u{2060}\u{00AD} "]]);
    assert_same([422, 'fallback_required'], [$unseen['status'], $unseen['body']['code']], 'and English is not left with one');
    assert_same(200, save(ADA, ['test.hello' => ['sk' => "Vitaj,\u{200C} {name}!"]])['status'], 'inside a text such a character is part of it');
    assert_same("Vitaj,\u{200C} {name}!", stored('test.hello', 'sk')[0]);
    assert_same(200, save(ADA, ['test.hello' => ['sk' => 'Vitaj, {name}!']])['status']);
});

test('saving strings: all of it is checked before any of it is written, and each refusal names its key', function (): void {
    $before = every_string();
    $refusals = [
        'unknown_key' => [['test.bye' => ['en' => 'Bye'], 'no.such' => ['en' => 'x'], 'nor.this' => ['sk' => 'y']], ['key' => 'no.such', 'keys' => ['no.such', 'nor.this']]],
        'unknown_language' => [['test.bye' => ['sk' => 'Zbohom', 'hu' => 'Viszlát']], ['key' => 'test.bye', 'language' => 'hu']],
        'fallback_required' => [['test.count' => ['sk' => '{count} / {total}'], 'test.bye' => ['en' => '  ']], ['key' => 'test.bye', 'language' => 'en']],
        'placeholder_changed' => [['test.bye' => ['sk' => 'Zbohom'], 'test.hello' => ['en' => 'Hi!']], ['key' => 'test.hello', 'language' => 'en', 'placeholder' => 'name']],
        'unknown_placeholder' => [['test.bye' => ['sk' => 'Zbohom'], 'test.hello' => ['sk' => 'Ahoj, {meno}!']], ['key' => 'test.hello', 'language' => 'sk', 'placeholder' => 'meno']],
        // What the page would show as braces and a word: the name translated into something that is no name, a space inside.
        'invalid_placeholder' => [['test.bye' => ['sk' => 'Zbohom'], 'test.count' => ['sk' => '{počet} / { total }']], ['key' => 'test.count', 'language' => 'sk']],
    ];
    foreach ($refusals as $code => [$values, $about]) {
        $refused = save(ADA, $values);
        assert_same([422, $code], [$refused['status'], $refused['body']['code'] ?? null], test_show($refused['body']));
        assert_same($about, array_diff_key($refused['body'], ['error' => 0, 'code' => 0]), "$code says what it is about");
        assert_same(['error', 'code'], array_slice(array_keys($refused['body']), 0, 2), "$code: the sentence and the code first");
        assert_same($before, every_string(), "$code: nothing of that save was written, not the good strings before the bad one either");
    }
    $added = save(ADA, ['test.hello' => ['en' => 'Hi, {name} - {title}!']]);
    assert_same(['placeholder_changed', 'title'], [$added['body']['code'], $added['body']['placeholder']], 'a placeholder the code does not fill');
    assert_match('/test\.hello.*\{title\}/', $added['body']['error'], 'the sentence names the key and the placeholder');
    assert_match('/Slovak.*test\.hello.*\{meno\}/', save(ADA, ['test.hello' => ['sk' => '{meno}']])['body']['error']);
    $braces = save(ADA, ['test.hello' => ['en' => 'Hi, {{name}}!']]);
    assert_same([422, 'invalid_placeholder'], [$braces['status'], $braces['body']['code']], 'in English too');
    assert_match('/English.*test\.hello.*not part of a placeholder.*like \{name\}/', $braces['body']['error'], 'it says how a placeholder is written, with the key\'s own');

    $invalid = [
        'no body' => null, 'no values' => ['strings' => []], 'values as text' => ['values' => 'test.bye'], 'values as a list' => ['values' => [['test.bye' => ['en' => 'x']]]],
        'a key with a text' => ['values' => ['test.bye' => 'Bye']], 'a string that is a number' => ['values' => ['test.bye' => ['sk' => 5]]],
        'a string that is an object' => ['values' => ['test.bye' => ['sk' => ['one' => 'x']]]], 'a string that is null' => ['values' => ['test.bye' => ['sk' => null]]],
        '2001 characters' => ['values' => ['test.bye' => ['sk' => str_repeat('ž', 2001)]]],
    ];
    foreach ($invalid as $what => $body) {
        $refused = as_user(ADA, 'PUT', '/api/owner/translations', $body);
        assert_same([422, 'invalid_value'], [$refused['status'], $refused['body']['code'] ?? null], $what);
    }
    assert_same($before, every_string());

    assert_same(200, save(ADA, ['test.count' => ['sk' => str_repeat('ž', 2000)]])['status'], '2000 characters, counted as people count them');
    assert_same(200, save(ADA, ['test.count' => ['sk' => '']])['status']);

    // A text with more spaces inside it than can be trimmed (and still under the body's limit) is too long,
    // never an empty one: that would delete the stored string with a 200, or pass it over in an import.
    $spaces = 'Ahoj' . str_repeat(' ', 1040000) . '{name}';
    foreach (['sk', 'en'] as $code) {
        $refused = save(ADA, ['test.hello' => [$code => $spaces]]);
        assert_same([422, 'invalid_value'], [$refused['status'], $refused['body']['code'] ?? null], "a million spaces inside the \"$code\" string");
    }
    $refused = as_user(ADA, 'PUT', '/api/owner/translations/sk/import', ['test.hello' => $spaces]);
    assert_same([422, 'invalid_value'], [$refused['status'], $refused['body']['code'] ?? null], 'nor is it passed over as an empty one');
    assert_same($before, every_string());

    // Room for every string of a language in one save: a few hundred kB is nothing unusual here.
    $room = save(ADA, ['test.bye' => ['sk' => 'Dovidenia'], 'test.hello' => ['en' => 'Hi, {name}!' . str_repeat(' ', 300000)]]);
    assert_same(200, $room['status'], test_show($room['body']['code'] ?? ''));
    assert_same($before, every_string(), 'and after all of it, the strings are what they were');
});

test('a language out as a file and back in: its own strings only; unknown keys refused, empty ones passed over', function (): void {
    $export = as_user(ADA, 'GET', '/api/owner/translations/sk/export');
    assert_same(200, $export['status']);
    assert_same(['test.bye' => 'Dovidenia', 'test.hello' => 'Vitaj, {name}!', 'test.new' => 'Nové: {what}'], $export['body'], 'not merged with English: test.count is not there');
    assert_same(404, as_user(ADA, 'GET', '/api/owner/translations/fr/export')['status']);
    assert_same('{}', as_user(ADA, 'GET', '/api/owner/translations/pt-br/export')['raw']);

    // Into German: the empty ones are keys nobody translated yet.
    $in = as_user(OWNER, 'PUT', '/api/owner/translations/de/import', ['test.hello' => " Hallo, {name}!\x07", 'test.bye' => '', 'test.count' => "  \t ", 'test.new' => 'Neu']);
    assert_same(200, $in['status'], test_show($in['body']));
    assert_same(['languages', 'keys'], array_keys($in['body']), 'answered with the grid as it is now');
    assert_same(['test.hello' => 'Hallo, {name}!', 'test.new' => 'Neu'], as_user(ADA, 'GET', '/api/owner/translations/de/export')['body']);
    assert_same(['Hallo, {name}!', OWNER], array_slice(stored('test.hello', 'de'), 0, 2), 'by who imported it');

    // An empty string deletes nothing, not in English either, where a save would refuse it.
    $before = every_string();
    assert_same(200, as_user(ADA, 'PUT', '/api/owner/translations/de/import', ['test.hello' => '', 'test.new' => 'Neu'])['status']);
    assert_same(200, as_user(ADA, 'PUT', '/api/owner/translations/en/import', ['test.bye' => ' ', 'test.hello' => 'Hi, {name}!'])['status']);
    assert_same(200, as_user(ADA, 'PUT', '/api/owner/translations/de/import', ['test.hello' => "\u{200B}", 'test.new' => " \u{2060}\u{00AD}"])['status'], 'nor one that only looks empty');
    assert_same(200, as_user(ADA, 'PUT', '/api/owner/translations/de/import', new stdClass())['status'], 'an empty file');
    assert_same(200, as_user(ADA, 'PUT', '/api/owner/translations/de/import')['status'], 'or no file at all');
    assert_same($before, every_string(), 'what was there stays, as it was and by whom');

    $unknown = as_user(ADA, 'PUT', '/api/owner/translations/de/import', ['test.bye' => 'Tschüss', 'no.such' => 'x', 'nor.this' => '', 'test.count' => '{count} von {total}']);
    assert_same([422, 'unknown_key'], [$unknown['status'], $unknown['body']['code']]);
    assert_same(['no.such', 'nor.this'], $unknown['body']['keys'], 'every key the app does not have, empty or not');
    assert_match('/no\.such.*nor\.this/', $unknown['body']['error']);

    $refusals = [
        'unknown_placeholder' => ['de', ['test.bye' => 'Tschüss', 'test.hello' => 'Hallo, {dich}!']],
        'placeholder_changed' => ['en', ['test.hello' => 'Hi!']],
        'invalid_value' => ['de', ['test.hello' => ['de' => 'Hallo']]],
    ];
    foreach ($refusals as $code => [$language, $body]) {
        $refused = as_user(ADA, 'PUT', "/api/owner/translations/$language/import", $body);
        assert_same([422, $code], [$refused['status'], $refused['body']['code'] ?? null], test_show($refused['body']));
    }
    $list = as_user(ADA, 'PUT', '/api/owner/translations/de/import', ['Hallo', 'Tschüss']);
    assert_same([422, 'invalid_value'], [$list['status'], $list['body']['code'] ?? null], 'a list');
    assert_same(400, raw_call($GLOBALS['app']['base'], 'PUT', '/api/owner/translations/de/import', '"Hallo"', array_merge(['Content-Type: application/json'], token_of(ADA)))['status'], 'a text: no JSON object at all');
    assert_same(404, as_user(ADA, 'PUT', '/api/owner/translations/fr/import', ['test.bye' => 'Au revoir'])['status'], 'a language there is not');
    assert_same($before, every_string(), 'nothing refused was kept');

    // What came out goes back in, and nothing changes.
    $german = as_user(ADA, 'GET', '/api/owner/translations/de/export')['body'];
    assert_same(200, as_user(ADA, 'PUT', '/api/owner/translations/de/import', $german)['status']);
    assert_same($before, every_string());
});

/* ---------------------------------------------------------- the command line */

test('the command line: --export and --import on the same strings, by nobody; a backup is a file to import from', function (): void {
    $dir = temp_dir('cli');

    [$code, $out] = cli(['--export', 'de', "$dir/de.json"]);
    assert_same(0, $code, $out);
    assert_same(translations_file_text(['test.hello' => 'Hallo, {name}!', 'test.new' => 'Neu']), file_get_contents("$dir/de.json"));
    [$code, $out] = cli(['--export', 'sk']);
    assert_same([0, ['test.bye' => 'Dovidenia', 'test.hello' => 'Vitaj, {name}!', 'test.new' => 'Nové: {what}']], [$code, json_decode($out, true)], 'to the screen without a file');
    [$code, $out] = cli(['--export', 'pt-br']);
    assert_same([0, '{}'], [$code, trim($out)]);
    [$code, $out] = cli(['--export', 'fr']);
    assert_same(1, $code, 'a language there is not');
    assert_match('/There is no such language\./', $out);
    assert_same(1, cli(['--export', 'EN'])[0], 'a code that is not one');

    $before = every_string();
    translation_file_write("$dir/de.json", ['test.hello' => 'Guten Tag, {name}!', 'test.bye' => 'Tschüss', 'test.count' => '', 'test.new' => 'Neu']);
    [$code, $out] = cli(['--import', 'de', "$dir/de.json"]);
    assert_same(0, $code, $out);
    assert_match('/4 strings in .*: 2 changed/', $out);
    assert_same(['Guten Tag, {name}!', null], array_slice(stored('test.hello', 'de'), 0, 2), 'written by nobody, as a migration\'s are');
    assert_same(['Tschüss', null], array_slice(stored('test.bye', 'de'), 0, 2));
    assert_same($before['test.new de'], every_string()['test.new de'], 'a string as it was is still whose it was');

    // Checked as a save is, and all of it or none of it.
    $before = every_string();
    translation_file_write("$dir/bad.json", ['test.bye' => 'Auf Wiedersehen', 'test.hello' => 'Hallo, {dich}!']);
    [$code, $out] = cli(['--import', 'de', "$dir/bad.json"]);
    assert_same(1, $code);
    assert_match('/Refused \(unknown_placeholder\): .*\{dich\}/', $out);
    translation_file_write("$dir/unknown.json", ['test.bye' => 'Auf Wiedersehen', 'no.such' => 'x', 'nor.this' => 'y']);
    [$code, $out] = cli(['--import', 'de', "$dir/unknown.json"]);
    assert_same(1, $code);
    assert_match('/Refused \(unknown_key\)/', $out);
    assert_match('/^\s+no\.such$/m', $out, 'the keys, one a line');
    assert_match('/^\s+nor\.this$/m', $out);
    file_put_contents("$dir/list.json", '["a"]');
    assert_same(1, cli(['--import', 'de', "$dir/list.json"])[0]);
    assert_same(1, cli(['--import', 'de', "$dir/nothing.json"])[0]);
    assert_same(1, cli(['--import', 'fr', "$dir/de.json"])[0], 'a language there is not');
    assert_same(1, cli(['--import', 'DE', "$dir/de.json"])[0], 'a code that is not one');
    assert_same(1, cli(['--import', 'de'])[0], 'no file named');
    assert_same(1, cli(['--export'])[0], 'no language named');
    [$code, $out] = cli(['--nonsense']);
    assert_same(1, $code);
    assert_match('/Unknown command --nonsense\. php backend\/translations\.php --status \| --export CODE \[FILE\] \| --import CODE FILE/', $out);
    assert_same(0, cli(['--help'])[0]);
    assert_same($before, every_string(), 'nothing refused was kept');

    // A backup of everybody holds the strings too: what the owner reworded comes back from it, a language at a time.
    $backup = backup_write('manual');
    $kept = as_user(ADA, 'GET', '/api/owner/translations/de/export')['body'];
    assert_same(200, save(ADA, ['test.hello' => ['de' => 'Verloren, {name}'], 'test.bye' => ['de' => '']])['status']);
    [$code, $out] = cli(['--import', 'de', $backup]);
    assert_same(0, $code, $out);
    assert_match('/3 strings in .*: 2 changed in "de"/', $out);
    assert_same($kept, as_user(ADA, 'GET', '/api/owner/translations/de/export')['body'], 'German as the backup has it');
    assert_same(null, stored('test.hello', 'de')[1], 'by nobody');
    [$code, $out] = cli(['--import', 'fr', $backup]);
    assert_same(1, $code, 'a language the backup does not hold');
    assert_match('/is a backup, and holds no strings of the language "fr"/', $out);
    unlink($backup);
});

test('the command line: --status reads the frontend against the database, and its exit code says whether a page would show a key', function (): void {
    // What the scan finds, asked in this process too: the frontend is what it is on the day.
    $keys = array_column(db_all('SELECT name FROM translation_keys ORDER BY name COLLATE "C"'), 'name');
    $scan = translation_keys_scan(translation_keys_frontend_root(), $keys);
    $strings = (int) db_value("SELECT count(*) FROM translations WHERE language_code = 'de'");

    [$code, $out] = cli(['--status']);
    assert_match('/== Japanese Academy \(' . preg_quote(db_name(), '/') . '\): the app\'s own strings/', $out, 'it says which database it read');
    assert_match('/the database has\s+4 keys/', $out, $out);
    assert_match('/In the database, used nowhere.*\n\s+test\.bye\n\s+test\.count\n\s+test\.hello\n\s+test\.new\n/', $out, 'the test\'s keys are the database\'s, and no page asks for them');
    assert_match('/\n\s+de\s+German \(Germany\)\s+' . $strings . ' \/ 4\n/', $out, 'how much of each language there is');
    assert_same($scan['missing'] || $scan['problems'] ? 1 : 0, $code, $out);
    assert_match($code === 1 ? '/Not clean\./' : '/\n\s+Clean\./', $out);
    foreach (array_keys($scan['missing']) as $key) {
        assert_match('/Used by the frontend, not in the database.*\n\s+' . preg_quote($key, '/') . '\n/s', $out, "$key is missing, and named");
    }

    // A literal counts once the database has its namespace: with one "changelog" key, the name of the file the
    // frontend fetches is a key the database lacks, named with the file and the line. (Why no namespace is called so.)
    assert_no_match('/\n\s+changelog\.json\n/', $out, 'the database has no such namespace, so the file\'s name is nobody\'s key');
    db_exec("INSERT INTO translation_keys (name) VALUES ('changelog.zzzProbe')");
    db_exec("INSERT INTO translations (key_name, language_code, value) VALUES ('changelog.zzzProbe', 'en', 'A probe')");
    [$code, $out] = cli(['--status']);
    assert_same(1, $code, $out);
    assert_match('/Not clean\./', $out);
    assert_no_match('/\n\s+Clean\./', $out);
    assert_match('/Used by the frontend, not in the database.*\n\s+changelog\.json\n\s+core\/changelog\/changelog\.service\.ts:\d+\n/s', $out, 'each missing key, with where it is asked for');
    assert_match('/In the database, used nowhere.*\n\s+changelog\.zzzProbe\n/s', $out);
    db_exec("DELETE FROM translation_keys WHERE name = 'changelog.zzzProbe'");

    // A key with no English string: nothing to fall back to.
    db_exec("INSERT INTO translation_keys (name) VALUES ('test.noEnglish')");
    [$code, $out] = cli(['--status']);
    assert_same(1, $code, $out);
    assert_match('/No English string.*\n\s+test\.noEnglish\n/', $out);
    assert_match('/Not clean\./', $out);
    db_exec("DELETE FROM translation_keys WHERE name = 'test.noEnglish'");

    // On a database as the migrations leave it, which is what a release is. Once a migration writes the
    // strings, that is clean: exit 0. (Until then the database has no key, and what the frontend already
    // declares is missing from it: the exit code is held to what the scan finds.)
    $released = other_database('released', TEST_TEMPLATE);
    [$code, $out] = cli(['--status'], $released['config']);
    assert_match('/== Japanese Academy \(' . preg_quote($released['name'], '/') . '\)/', $out, 'it read the database it was pointed at');
    $template = array_column(db_connect($released['name'])->query('SELECT name FROM translation_keys')->fetchAll(), 'name');
    assert_same($GLOBALS['seeded'], $template !== [], 'as this file\'s database was before its keys were taken out');
    if ($GLOBALS['seeded']) {
        assert_same(0, $code, $out);
        assert_match('/\n\s+Clean\./', $out);
        assert_no_match('/Not clean\.|Used by the frontend, not in the database|No English string|does not let through|used nowhere/', $out, $out);
    } else {
        $bare = translation_keys_scan(translation_keys_frontend_root(), []);
        assert_match('/the database has\s+0 keys/', $out);
        assert_same($bare['missing'] || $bare['problems'] ? 1 : 0, $code, $out);
    }

    // A database without the tables: a sentence and exit 1, and nothing is applied from here.
    $empty = other_database('empty', null);
    [$code, $out] = cli(['--status'], $empty['config']);
    assert_same(1, $code, $out);
    assert_match('/The database ' . preg_quote($empty['name'], '/') . ' does not hold the app\'s words yet \(migration 004 is not applied\)/', $out);
    [$code, $out] = cli(['--import', 'sk', __FILE__], $empty['config']);
    assert_same(1, $code, 'whatever is asked');
    assert_same(0, (int) db_connect($empty['name'])->query("SELECT count(*) FROM information_schema.tables WHERE table_schema = 'public'")->fetchColumn(), 'no migration was applied, no table made');
});

/* ------------------------------------------------------- deleting a language */

test('deleting a language: never English, never one the app is released in; a copy of its strings first, and they go with it', function (): void {
    assert_refused(409, 'fallback_language', 'English cannot be deleted: every other language falls back to it.', as_user(OWNER, 'DELETE', '/api/owner/languages/en'));
    $slovak = as_user(OWNER, 'DELETE', '/api/owner/languages/sk');
    assert_same([409, 'seeded_language'], [$slovak['status'], $slovak['body']['code']], 'the next migration with strings would fail without it');
    assert_same(404, as_user(OWNER, 'DELETE', '/api/owner/languages/fr')['status']);
    $copies = static fn (): array => array_map('basename', glob(backup_dir() . '/academy-before-language-delete-*.json') ?: []);
    assert_same([], $copies(), 'nothing refused left a copy');

    // A language with no strings: a copy all the same, of nothing.
    $gone = as_user(OWNER, 'DELETE', '/api/owner/languages/pt-br');
    assert_same(200, $gone['status'], test_show($gone['body']));
    assert_same(['copy'], array_keys($gone['body']));
    assert_match('/^academy-before-language-delete-pt-br-\d{8}-\d{6}-\d{3}\.json$/D', $gone['body']['copy'], 'the file\'s name, and no folder of the server');
    assert_same("{}\n", file_get_contents(backup_dir() . '/' . $gone['body']['copy']));
    assert_same(['en', 'sk', 'de'], array_column(as_user(OWNER, 'GET', '/api/owner/languages')['body']['languages'], 'code'));

    // German: its strings are in the copy, as an export gives them, and then gone.
    $german = as_user(OWNER, 'GET', '/api/owner/translations/de/export');
    assert_true(count($german['body']) >= 2, 'there is something to lose');
    $gone = as_user(OWNER, 'DELETE', '/api/owner/languages/de');
    assert_same(200, $gone['status'], test_show($gone['body']));
    $copy = backup_dir() . '/' . $gone['body']['copy'];
    assert_match('/^academy-before-language-delete-de-\d{8}-\d{6}-\d{3}\.json$/D', $gone['body']['copy']);
    assert_same(translations_file_text($german['body']), file_get_contents($copy), 'a flat export, as the command line reads one');
    assert_same(0, (int) db_value("SELECT count(*) FROM translations WHERE language_code = 'de'"), 'and its strings');
    assert_same(4, (int) db_value('SELECT count(*) FROM translation_keys'), 'the keys are the code\'s, and stay');
    assert_same(404, as_user(OWNER, 'DELETE', '/api/owner/languages/de')['status']);
    assert_same('en', anonymous('GET', '/api/translations/de')['body']['language']);
    assert_same(['en', 'sk'], array_column(as_user(ADA, 'GET', '/api/owner/translations')['body']['languages'], 'code'));
    assert_same(2, count($copies()));
    assert_same([], glob(backup_dir() . '/*.tmp') ?: [], 'written aside and renamed: nothing left beside them');

    // Back in from the copy: the language added again, then the command line.
    assert_same(201, as_user(OWNER, 'POST', '/api/owner/languages', ['code' => 'de', 'name' => 'German', 'nativeName' => 'Deutsch', 'enabled' => false])['status']);
    [$code, $out] = cli(['--import', 'de', $copy]);
    assert_same(0, $code, $out);
    assert_same($german['body'], as_user(OWNER, 'GET', '/api/owner/translations/de/export')['body'], 'as it was');

    // The copy comes first: one that cannot be written stops the delete, and the language stays with its strings.
    $taken = temp_dir('taken') . '/a-file';
    file_put_contents($taken, 'where the backup folder should be');
    config_overrides(['app' => ['backups_dir' => $taken]]);
    try {
        assert_same($taken, backup_dir());
        assert_throws(static fn () => languages_delete('de'));
    } finally {
        config_overrides([]);
    }
    assert_same($german['body'], as_user(OWNER, 'GET', '/api/owner/translations/de/export')['body'], 'nothing was deleted');
    assert_same(2, count($copies()));
});

test('a language deleted while its strings are being saved: the delete waits for the save, and its copy holds what the save wrote', function (): void {
    // The save first, not finished: it holds the languages' rows, as translations_write() does, and has
    // written a string. Deleting on what was there before would lose that string without a copy of it.
    $other = somebody_else();
    $other->beginTransaction();
    $other->query('SELECT code, name FROM languages FOR SHARE')->fetchAll();
    $other->exec("INSERT INTO translations (key_name, language_code, value) VALUES ('test.count', 'de', '{count} von {total}')");
    $copies = count(glob(backup_dir() . '/academy-before-language-delete-de-*.json') ?: []);
    $pending = begin_as(OWNER, 'DELETE', '/api/owner/languages/de');
    try {
        if (!$pending['waits']()) {
            fail('the delete did not wait for the save, and answered ' . test_show($pending['answer']()));
        }
        assert_same($copies, count(glob(backup_dir() . '/academy-before-language-delete-de-*.json') ?: []), 'no copy is taken while it waits: it would lack that string');
        $other->commit();
        $answer = $pending['answer']();
        assert_same(200, $answer['status'], test_show($answer['body']));
        $copy = json_decode((string) file_get_contents(backup_dir() . '/' . $answer['body']['copy']), true);
        assert_same('{count} von {total}', $copy['test.count'] ?? null, 'the string the save wrote is in the copy');
        assert_same(0, (int) db_value("SELECT count(*) FROM languages WHERE code = 'de'"));
    } finally {
        if ($other->inTransaction()) {
            $other->rollBack();
        }
        $pending['answer']();
    }

    // The delete first, not finished: a save into that language waits for it, and is told the language is gone.
    assert_same(201, as_user(OWNER, 'POST', '/api/owner/languages', ['code' => 'it', 'name' => 'Italian', 'nativeName' => 'Italiano'])['status']);
    $before = every_string();
    $other->beginTransaction();
    $other->query("SELECT 1 FROM languages WHERE code = 'it' FOR UPDATE")->fetchAll();
    $other->exec("DELETE FROM languages WHERE code = 'it'");
    $pending = begin_as(ADA, 'PUT', '/api/owner/translations', ['values' => ['test.bye' => ['it' => 'Ciao']]]);
    try {
        if (!$pending['waits']()) {
            fail('the save did not wait for the delete, and answered ' . test_show($pending['answer']()));
        }
        $other->commit();
        $answer = $pending['answer']();
        assert_same([422, 'unknown_language'], [$answer['status'], $answer['body']['code'] ?? null], test_show($answer['body']));
    } finally {
        if ($other->inTransaction()) {
            $other->rollBack();
        }
        $pending['answer']();
        db_exec("DELETE FROM languages WHERE code = 'it'");
    }
    assert_same($before, every_string(), 'nothing of the save was kept');
    assert_same(['en', 'sk'], array_column(as_user(OWNER, 'GET', '/api/owner/languages')['body']['languages'], 'code'));
});

/* ----------------------------------------------------------- who reworded it */

test('who reworded a string follows a user id that moves, and goes with a person who is deleted: the string stays', function (): void {
    assert_same(200, save(OWNER, ['test.bye' => ['sk' => 'Maj sa'], 'test.count' => ['sk' => '{count} / {total}']])['status']);
    assert_same(200, save(ADA, ['test.new' => ['sk' => 'Nové – {what}']])['status']);
    $by = static fn (): array => array_column(db_all("SELECT key_name, updated_by FROM translations WHERE language_code = 'sk' ORDER BY key_name"), 'updated_by', 'key_name');
    assert_same(['test.bye' => OWNER, 'test.count' => OWNER, 'test.hello' => ADA, 'test.new' => ADA], $by());
    $strings = array_column(db_all("SELECT key_name, value FROM translations ORDER BY key_name, language_code"), 'value');

    // The owner's data gets another user id (src/owner.php): their users row takes it, and the strings follow.
    users_move(OWNER, 9009);
    assert_same(['test.bye' => 9009, 'test.count' => 9009, 'test.hello' => ADA, 'test.new' => ADA], $by(), 'ON UPDATE CASCADE');
    // Somebody whose row goes (a move into an id that only ever signed in deletes that id's bare row).
    db_exec('DELETE FROM users WHERE id = ?', [ADA]);
    assert_same(['test.bye' => 9009, 'test.count' => 9009, 'test.hello' => null, 'test.new' => null], $by(), 'ON DELETE SET NULL: reworded by nobody now');
    users_move(9009, ADA);
    assert_same(['test.bye' => ADA, 'test.count' => ADA, 'test.hello' => null, 'test.new' => null], $by());
    assert_same($strings, array_column(db_all("SELECT key_name, value FROM translations ORDER BY key_name, language_code"), 'value'), 'and every string is as it was');
    assert_same(0, (int) db_value('SELECT count(*) FROM users WHERE id IN (?, ?)', [OWNER, 9009]));

    // The three tables are the site's: nobody's study data, so a person's reset, export and backup leave them be.
    assert_false(users_has_rows(ADA), 'rewording a string is no study data');
    store_reset(ADA);
    assert_same($strings, array_column(db_all("SELECT key_name, value FROM translations ORDER BY key_name, language_code"), 'value'));
    assert_false(array_key_exists('translations', backup_data([ADA])), 'a copy of one person holds none of the site\'s words');
});

test('the server said nothing it should not have', function (): void {
    assert_same([], server_problems($GLOBALS['app']));
});
