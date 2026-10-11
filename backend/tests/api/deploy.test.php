<?php
// A hosted site, end to end, on this computer: the upload built by
// backend/tools/build-dist.php into a temp folder; served the way Apache
// serves it; set up by its setup page over HTTP as a website sees it (every
// request with the Host of a website: the token, the lock, the self-delete),
// with a database and a PostgreSQL user of its own, as a hosting panel makes
// them, from the database and the IAM alone; signed into with the test IAM's
// tokens; and later uploads: a new migration, which waits once it is all
// there until an administrator applies it on the Migrations page - the site
// closed meanwhile but for what the pages need to start, to sign in and to
// reach that page (the anotoki library's SiteGate, in each of its states);
// one that fails there; the setup page run again on purpose; the update that
// brings the app's own words, while its migration (004) is still arriving;
// and a site that was installed and lost its settings, which never offers the
// setup page again. (The setup page on the owner's own computer is
// tests/api/setup.test.php's.)
declare(strict_types=1);

require __DIR__ . '/../lib.php'; // before the app loads: a throwaway database and backup folder

/** The owner's user id at the hosted IAM: their data is brought in under it, and they are its ADMIN. */
const OWNER_AT_IAM = 42;

/** Every request comes to the site by its own name, as on a host: never this computer's. */
const WEBSITE = ['Host: academy.example.test'];

$GLOBALS['site'] = null;

function site(): array
{
    return $GLOBALS['site'];
}

/** A request to the site, as a website gets it. */
function site_call(string $method, string $url, $body = null, array $headers = []): array
{
    return call(site()['base'], $method, $url, $body, array_merge(WEBSITE, $headers));
}

/** What every address but the open ones answers while a migration waits (the anotoki library's SiteGate). */
const UPDATE_PENDING = ['code' => 'update_pending', 'message' => 'The site is being updated. Try again in a few minutes.'];

/** What the words' routes say while the database holds none (the anotoki library's 503 translations_unavailable), in this app's error body. */
define('WORDS_UNAVAILABLE', Anotoki\Lib\Translations\Translations::unavailable()->message);

/**
 * Every migration file of this site's copy, in order (db_migration_sets(), from the site's own copy of the
 * anotoki library): the library's admin tools, this site's own (the drafts the tests apply among them), the
 * library's words and people.
 */
function site_migrations(): array
{
    $of = static function (string $folder, ?string $set): array {
        $names = array_map('basename', glob(site()['dir'] . "/backend/$folder/*.sql") ?: []);
        sort($names);
        return array_map(static fn (string $name): string => $set === null ? $name : "$set/$name", $names);
    };
    $library = 'vendor/anotoki/lib/php/migrations';
    return array_merge($of("$library/admin", 'anotoki_admin'), $of('migrations', null), $of("$library/translations", 'anotoki_translations'),
        $of("$library/people", 'anotoki_people'));
}

/** A file of the site's migrations as the engine names it in the Migrations page's answers. */
function migration(string $name): array
{
    return ['set' => MIGRATION_SET, 'name' => $name];
}

before(function (): void {
    $GLOBALS['site'] = test_site();
});

/** The setup page's form, filled in as the owner would; $change replaces fields (null leaves one out). */
function setup_form(array $change = []): array
{
    if (!array_key_exists('token', $change)) {
        $change['token'] = (string) ((require site()['dir'] . '/backend/config/setup-token.local.php')['token'] ?? '');
    }
    return array_filter($change + [
        'db_host' => (string) config('db.host'),
        'db_port' => (string) config('db.port'),
        'db_name' => db_name(),
        'db_user' => site()['role'],
        'db_password' => site()['password'],
        'issuer' => 'https://iam.test',
        'client_id' => 'japanese-academy',
        'action' => 'save',
    ], static fn ($value): bool => $value !== null);
}

/**
 * The owner's data from their computer: the file their own copy of the app
 * gives them (GET /api/me/data there: one person, under that copy's user id).
 */
function owner_backup(): string
{
    $file = str_replace('\\', '/', sys_get_temp_dir()) . '/academy-test-data-' . bin2hex(random_bytes(4)) . '.json';
    $id = '2026-09-22T11-09-21-059Z-exam-1790075246120-320199';
    file_put_contents($file, json_text([
        'format' => BACKUP_FORMAT, 'version' => BACKUP_VERSION, 'takenAt' => '2026-09-26T06:00:00.000Z', 'everybody' => false,
        'users' => [['id' => 1, 'username' => 'owner', 'createdAt' => 1790153500962, 'lastSeenAt' => 1790239383533, 'timeZone' => 'Europe/Bratislava',
        'kanji' => [
            'version' => 1, 'createdAt' => 1790153500962, 'updatedAt' => 1790239383533,
            'settings' => ['batchSize' => 3, 'lessonTypes' => 'both', 'autoplay' => false],
            'items' => ['k:大' => array_merge(srs_blank(), ['stage' => 4, 'learnedAt' => 1790154533255]), 'k:学' => ['stage' => 2]],
            'daily' => ['2026-09-23' => ['lessons' => 2, 'reviews' => 0, 'reviewsCorrect' => 0, 'practice' => 0, 'practiceCorrect' => 0]],
        ],
        'log' => [['t' => 1790154533257, 'kind' => 'lesson', 'id' => 'k:大'], ['t' => 1790154533300, 'kind' => 'lesson', 'id' => 'k:学']],
        'attempts' => [[
            'attempt' => [
                'id' => $id, 'startedAt' => '2026-09-22T11:07:26.000Z', 'finishedAt' => '2026-09-22T11:09:21.059Z', 'meta' => ['candidate' => 'irelevant'],
                'exam' => ['seed' => 'exam-1790075246120-320199', 'size' => 38, 'books' => [1], 'lessons' => [0, 1, 2], 'sections' => ['kana']],
                'summary' => ['total' => 38, 'answered' => 38, 'unanswered' => 0, 'right' => 14, 'wrong' => 24, 'pct' => 36.8, 'grade' => 'F', 'passed' => false, 'passMark' => 70, 'totalMs' => 114886, 'avgMs' => 3023],
                'bySection' => [], 'byLesson' => [], 'byBook' => [], 'responses' => [],
            ],
            'report' => '<!doctype html><title>the old report</title>',
        ]],
        ]],
    ]));
    $GLOBALS['temp_files'][] = $file;
    return $file;
}

after(function (): void {
    foreach ($GLOBALS['temp_files'] ?? [] as $file) {
        @unlink($file);
    }
});

test('the build: what a site needs, and nothing else', function (): void {
    $dir = site()['dir'];
    $needed = ['public/index.html', 'public/main-TESTAPP1.js', 'public/changelog.json', 'public/index.php', 'public/.htaccess',
        'backend/setup.php', 'backend/api/app.php', 'backend/api/front.php', 'backend/src/bootstrap.php', 'backend/src/auth.php', 'backend/src/admin.php',
        'backend/config/config.php', 'backend/migrations/002_users.sql', 'backend/vendor/autoload.php', 'backend/vendor/slim/slim/Slim/App.php',
        // the anotoki library: the migrations' engine, the SiteGate and the Migrations page's addresses
        'backend/vendor/anotoki/lib/php/src/Migrations/Migrator.php', 'backend/vendor/anotoki/lib/php/src/Migrations/Http/SiteGate.php',
        // and its translations: the code that serves the words, its migration set and its own words
        'backend/vendor/anotoki/lib/php/src/Translations/Translations.php', 'backend/vendor/anotoki/lib/php/src/Translations/Http/TranslationsRoutes.php',
        'backend/vendor/anotoki/lib/php/migrations/translations/001_languages_and_strings.sql', 'backend/vendor/anotoki/lib/php/migrations/translations/002_library_words.sql',
        'backend/vendor/anotoki/lib/php/resources/library-words.json',
        // its sign-in, people and admin tools: who is asking, the scrub, the logs, feedback and backups, and their sets
        'backend/vendor/anotoki/lib/php/src/Auth/Http/Identify.php', 'backend/vendor/anotoki/lib/php/src/People/Scrubber.php',
        'backend/vendor/anotoki/lib/php/src/ErrorLog/ErrorLog.php', 'backend/vendor/anotoki/lib/php/src/Backups/Backups.php',
        'backend/vendor/anotoki/lib/php/migrations/admin/001_audit_log.sql', 'backend/vendor/anotoki/lib/php/migrations/people/001_people.sql',
        // the app's own words: the code that serves them, and the migration that holds them
        'backend/src/translations.php', 'backend/api/routes/translations.php', 'backend/api/middleware/staff.php', 'backend/migrations/004_languages_and_translations.sql',
        'backend/composer.lock', 'backend/data/vocab.json', 'backend/data/audio.json', 'backend/data/authored-items-part1.php',
        'backend/.htaccess', 'backend/storage/.htaccess'];
    foreach ($needed as $file) {
        assert_true(is_file("$dir/$file"), $file);
    }
    $all = [];
    foreach (new RecursiveIteratorIterator(new RecursiveDirectoryIterator($dir, FilesystemIterator::SKIP_DOTS)) as $item) {
        $all[] = str_replace('\\', '/', substr($item->getPathname(), strlen($dir) + 1));
    }
    assert_same([], glob("$dir/backend/data/audio/*") ?: [], 'no clips with --no-audio');
    assert_same(['backend', 'public'], array_values(array_diff(scandir($dir) ?: [], ['.', '..', '.academy-dist'])), 'nothing beside public/ and backend/');

    // The whole build, listed: the same, and every clip.
    $full = json_decode(test_build('--list --frontend=' . escapeshellarg(test_frontend())), true);
    $clips = array_values(array_filter($full, static fn (string $f): bool => str_starts_with($f, 'backend/data/audio/')));
    assert_same(count(glob(AUDIO_CLIPS . '/*.mp3') ?: []), count($clips), 'every clip');
    $rest = array_values(array_diff($full, $clips));
    sort($rest);
    $built = array_values(array_diff($all, ['.academy-dist']));
    sort($built);
    assert_same($rest, $built, 'the list is what gets built');

    $never = '~^(?!(public|backend)/)|^backend/(tests|tools|public|data/source)/|^backend/(router|manage|translations)\.php$'
        . '|\.local\.php$|(^|/)\.env$|^backend/storage/(?!\.htaccess$)~';
    assert_same([], array_values(array_filter($full, static fn (string $f): bool => (bool) preg_match($never, $f))), 'none of these');
    // The command line's tools need a shell and the whole repository: the strings' (backend/translations.php,
    // with the key scan in backend/tools/) stay on the developer's computer, as router.php and manage.php do.
    assert_true(is_file(BACKEND . '/translations.php') && is_file(BACKEND . '/tools/translation_keys.php'), 'they are there to leave out');
    assert_true((bool) preg_match($never, 'backend/translations.php'));
    assert_true(str_contains((string) file_get_contents(BACKEND . '/tools/build-dist.php'), '|^backend/(router|manage|translations)\.php$'), 'the build\'s own list (DIST_NEVER) names it too');
    foreach (['backend/router.php', 'backend/manage.php', 'backend/data/source/vocab-part1.tsv', 'backend/storage/backups/academy-2026-10-01.json', 'data/vocab.json', 'backups/.htaccess'] as $path) {
        assert_true((bool) preg_match($never, $path), "$path: never uploaded");
    }
    foreach (['backend/translations.php', 'backend/tools/translation_keys.php'] as $tool) {
        assert_false(in_array($tool, $full, true) || in_array($tool, $all, true) || is_file("$dir/$tool"), "$tool is never uploaded");
    }
    assert_true(in_array('backend/src/translations.php', $full, true) && in_array('backend/api/routes/translations.php', $full, true), 'what serves the words is');
    foreach (['backend', 'backend/storage'] as $folder) {
        assert_match('/Require all denied/', (string) file_get_contents("$dir/$folder/.htaccess"), "$folder/ is never served");
    }
    $htaccess = (string) file_get_contents("$dir/public/.htaccess");
    assert_match('/CGIPassAuth On/', $htaccess, 'the token reaches PHP under CGI');
    assert_match('/SetEnvIf Authorization/', $htaccess, 'and under an older Apache');
    assert_match('/RewriteRule \^\(api\|audio\|report\)\(\/\|\$\) index\.php/', $htaccess, 'the backend\'s addresses go to the front controller');
    assert_match('/RewriteRule \^ index\.html/', $htaccess, 'and a page of the app to its index.html');
    assert_no_match('/DirectoryIndex|^\s*Options/m', $htaccess, 'nothing a host may refuse in .htaccess');
});

test('no upload while a migration is a draft: the build refuses, naming it (the tests allow the drafts they apply)', function (): void {
    $drafts = test_config_migration_drafts();
    $list = '--list --frontend=' . escapeshellarg(test_frontend());
    exec(test_build_command($list, false) . ' 2>&1', $out, $code);
    $said = implode("\n", $out);
    if (!$drafts) {
        assert_same(0, $code, 'no draft now: it builds. ' . $said);
        echo "    (no migration is a draft now: nothing to refuse)\n";
        return;
    }
    assert_same(1, $code, $said);
    assert_true(str_contains($said, 'backend/migrations/' . implode(', ', $drafts)) && str_contains($said, '-- end of NNN'), $said);
    $out = [];
    exec(test_build_command($list, false) . ' --allow-draft=999_none.sql 2>&1', $out, $code);
    assert_same(1, $code, 'allowing another file allows nothing: ' . implode("\n", $out));
    assert_true(is_array(json_decode(test_build($list), true)), 'allowed by name: it builds');
});

test('before the setup page has run, the site is closed, and says so: never installed, so with the way to the setup page', function (): void {
    $notSetUp = ['code' => 'not_set_up', 'installed' => false, 'message' => 'This site is not set up yet. Its setup page connects it to its database.', 'setup' => '/setup.php'];
    foreach (['/api/auth/config', '/api/health', '/api/kanji/progress', '/api/translations/en', '/api/admin/migrations', '/audio/nothing.mp3'] as $url) {
        $r = site_call('GET', $url);
        assert_same(503, $r['status'], "$url: without settings, not even a sign-in mode to assume");
        assert_same($notSetUp, $r['body'], "$url: no more than that, to a website");
        assert_same('no-store', $r['headers']['cache-control'] ?? null, "$url: never kept");
    }
    $r = site_call('GET', '/api/site-status', null, no_token());
    assert_same([200, ['state' => 'not_set_up', 'installed' => false]], [$r['status'], $r['body']], 'where the site stands: always answered, to anybody');
    assert_same(200, site_call('GET', '/kanji')['status'], 'the app itself loads, and shows the library\'s "not set up yet" page');
    // from here on, the site's log must stay clean
    $GLOBALS['site']['log_from'] = filesize(site()['log']);
});

test('the token: written whole, and no form passes without it, whatever the file holds', function (): void {
    $config = site()['dir'] . '/backend/config';
    $file = "$config/setup-token.local.php";
    $settings = static fn (): array => array_values(array_filter(['database', 'auth', 'app'], static fn (string $w): bool => is_file("$config/$w.local.php")));
    // The start of a token file, and no token in it: what a cut-off write, or
    // an upload stopped half-way, leaves behind.
    file_put_contents($file, "<?php\n// The setup page's token (backend/setup.php). It deletes this file when it is done.\n\nreturn array (\n  'token' => '3f9a");
    foreach (['no token' => null, 'an empty token' => ''] as $what => $sent) {
        $r = test_form(site()['base'], '/setup.php', setup_form(['token' => $sent]), WEBSITE);
        assert_match('/That is not the token from backend\/config\/setup-token\.local\.php/', $r['raw'], "$what: refused");
        $r = test_form(site()['base'], '/setup.php', setup_form(['token' => $sent, 'action' => 'test-db']), WEBSITE);
        assert_same(false, $r['body']['ok'] ?? null, "$what: the buttons too");
    }
    assert_same([], $settings(), 'nothing written');
    assert_match('/^[0-9a-f]{48}$/D', (string) (require $file)['token'], 'a whole token took its place');
    assert_same([], glob("$config/*.tmp") ?: [], 'written aside and renamed: nothing left beside it');

    // Fields and cookies sent as lists are dropped, not a 500 for anybody who tries.
    $r = test_form(site()['base'], '/setup.php', setup_form(['token' => null, 'token[]' => 'x']), WEBSITE);
    assert_same(200, $r['status'], 'token[]=x');
    assert_match('/That is not the token from backend\/config\/setup-token\.local\.php/', $r['raw'], 'token[]=x: refused as ever');
    $r = test_form(site()['base'], '/setup.php', setup_form(['token' => null, 'token[]' => 'x', 'action' => 'test-token']), WEBSITE);
    assert_same(['ok' => false, 'message' => 'That is not the token from backend/config/setup-token.local.php.'], $r['body'], 'and its button');
    assert_same(200, site_call('GET', '/setup.php', null, ['Cookie: academy_setup[]=x'])['status'], 'a cookie sent as a list');
    assert_same([], $settings(), 'still nothing written');

    // A token that cannot be written (its place is taken): nothing can be proven, so nothing goes on.
    unlink($file);
    mkdir($file);
    try {
        assert_match('/Cannot write to backend\/config\//', site_call('GET', '/setup.php')['raw']);
        $r = test_form(site()['base'], '/setup.php', setup_form(['token' => '']), WEBSITE);
        assert_match('/Cannot write to backend\/config\//', $r['raw'], 'a form without a token: refused before anything else');
        assert_same([], $settings(), 'and still nothing written');
    } finally {
        rmdir($file);
    }
});

test('the setup page: proof of owning the server first; then the database and the IAM, and nothing else', function (): void {
    // a backup put in the site's backend/storage/backups/ by FTP, as the setup page of an earlier version took them: nothing here reads it now
    @mkdir(site()['dir'] . '/backend/storage/backups', 0777, true);
    copy(owner_backup(), site()['dir'] . '/backend/storage/backups/academy-2026-09-25.json');
    $page = site_call('GET', '/setup.php');
    assert_same(200, $page['status']);
    assert_match('/Set up Japanese Academy/', $page['raw']);
    assert_no_match('/academy-2026-09-25\.json/', $page['raw'], 'what is in the backups is not for whoever opens the page');
    preg_match_all('/<input[^>]* name="([a-z_]+)"/', $page['raw'], $m);
    assert_same(['token', 'db_host', 'db_port', 'db_name', 'db_user', 'db_password', 'issuer', 'client_id'], $m[1],
        'the token, the database and the IAM: no sign-in mode, no admin or owner id, no time zone, no backup');
    foreach (['db_host' => 'localhost', 'db_port' => '5432', 'db_name' => 'anotoki_japanese', 'db_user' => '', 'issuer' => '', 'client_id' => 'japanese-academy'] as $name => $value) {
        assert_match('/name="' . $name . '" type="text" value="' . preg_quote($value, '/') . '"/', $page['raw'], "the default of $name on a website");
    }
    $file = site()['dir'] . '/backend/config/setup-token.local.php';
    assert_true(is_file($file), 'a token, in a file only FTP reaches');
    $token = (string) (require $file)['token'];
    assert_same(48, strlen($token));
    assert_false(str_contains($page['raw'], $token), 'never shown');
    site_call('GET', '/setup.php');
    assert_same($token, (string) (require $file)['token'], 'the same token until the end');

    $r = test_form(site()['base'], '/setup.php', setup_form(['token' => 'a guess']), WEBSITE);
    assert_match('/That is not the token from backend\/config\/setup-token\.local\.php/', $r['raw']);
    assert_same([$file], glob(site()['dir'] . '/backend/config/*.local.php') ?: [], 'nothing written but the token');
    $r = test_form(site()['base'], '/setup.php', setup_form(['issuer' => 'http://iam.example.com']), WEBSITE);
    assert_match('/must be an https:\/\/ address/', $r['raw']);
    assert_false(is_file(site()['dir'] . '/backend/config/auth.local.php'), 'and still nothing written');

    // The buttons: with the token only, or the page would be a way into the host's network.
    $r = test_form(site()['base'], '/setup.php', setup_form(['token' => 'a guess', 'action' => 'test-db']), WEBSITE);
    assert_same(['ok' => false, 'message' => 'That is not the token from backend/config/setup-token.local.php.'], $r['body']);
    $r = test_form(site()['base'], '/setup.php', setup_form(['action' => 'test-db']), WEBSITE);
    assert_same(['ok' => true, 'message' => 'Connected to the database "' . db_name() . '": it is empty - Save makes the tables.'], $r['body'], $r['raw']);
    $r = test_form(site()['base'], '/setup.php', setup_form(['action' => 'test-db', 'db_password' => 'wrong']), WEBSITE);
    assert_same(false, $r['body']['ok'] ?? null);
    assert_match('/^Cannot connect: \S/', $r['body']['message']);
    assert_no_match('/SQLSTATE/', $r['body']['message'], 'what PostgreSQL said, without PDO\'s codes');

    // The token's own button: it says so, and hands over nothing (what is saved is shown on the owner's computer only).
    $r = test_form(site()['base'], '/setup.php', setup_form(['token' => 'a guess', 'action' => 'test-token']), WEBSITE);
    assert_same(['ok' => false, 'message' => 'That is not the token from backend/config/setup-token.local.php.'], $r['body']);
    $r = test_form(site()['base'], '/setup.php', setup_form(['action' => 'test-token']), WEBSITE);
    assert_same(['ok' => true, 'message' => 'That is the token.'], $r['body'], $r['raw']);
});

test('the setup page sets the site up: the settings, the tables and the study content', function (): void {
    // what an earlier version's form sent besides is no field of this one: passed over
    $r = test_form(site()['base'], '/setup.php', setup_form(['auth_mode' => 'none', 'user_id' => '7', 'timezone' => 'Europe/Bratislava',
        'backup' => new CURLFile(owner_backup(), 'application/json', 'academy-2026-09-26.json')]), WEBSITE);
    assert_same(200, $r['status']);
    assert_match('/<h1>Set up<\/h1>/', $r['raw'], strip_tags($r['raw']));
    assert_same(['anotoki_admin/001_audit_log.sql', 'anotoki_admin/002_feedback.sql', '001_init.sql', '002_users.sql', '003_content_stamp.sql',
        '004_languages_and_translations.sql', '005_own_time_zone_and_words.sql', '006_admin_panel_words.sql', '007_visitors.sql'],
        array_slice(site_migrations(), 0, 9), 'the first migrations of every file: the library\'s admin tools, then this site\'s own');
    assert_match('/Applied the migrations: ' . preg_quote(implode(', ', site_migrations()), '/') . '\./', $r['raw'], 'every one, in order');
    assert_match('/Built the study content: 1,?373 kanji items/', $r['raw']);
    assert_no_match('/Imported/', $r['raw'], 'nobody\'s data: each person brings their own, in the app');
    assert_match('/sign in with your anotoki account at https:\/\/iam\.test/', $r['raw']);
    assert_match('/Built the study content: 1,373 kanji items and \d{1,3}(,\d{3})+ exam questions/', $r['raw'], 'counts as the app writes them');
    assert_match('/come from a file/', $r['raw'], 'the keys of the test IAM');

    $config = site()['dir'] . '/backend/config';
    assert_same(['issuer' => 'https://iam.test', 'client_id' => 'japanese-academy'], require "$config/auth.local.php", 'the IAM alone');
    $db = require "$config/database.local.php";
    assert_same([site()['role'], db_name(), site()['password']], [$db['user'], $db['name'], $db['password']]);
    assert_false(is_file("$config/app.local.php"), 'no time zone, nor any other setting');
    if (PHP_OS_FAMILY !== 'Windows') {
        assert_same('600', decoct(fileperms("$config/database.local.php") & 0777), 'the password: for the owner only');
    }
    assert_true(is_file(site()['dir'] . '/backend/storage/installed.lock'));
    assert_false(is_file(site()['dir'] . '/backend/setup.php'), 'the setup page is gone');
    assert_false(is_file("$config/setup-token.local.php"), 'and its token');

    $listed = array_column(db_all('SELECT name FROM migrations'), 'name');
    $every = site_migrations();
    sort($listed);
    sort($every);
    assert_same($every, $listed, 'every file listed, the library\'s by their set and name');
    assert_same([['name', 'text'], ['applied_at', 'timestamp with time zone']], array_map(static fn (array $c): array => [$c['column_name'], $c['data_type']],
        db_all("SELECT column_name, data_type FROM information_schema.columns WHERE table_schema = current_schema() AND table_name = 'migrations' ORDER BY ordinal_position")),
        'the table that lists them made in this site\'s shape, as every database of it has it');
    assert_same(site()['role'], db_value("SELECT tableowner FROM pg_tables WHERE tablename = 'srs_progress'"), 'made by the site’s own user');
    assert_same(1373, (int) db_value('SELECT count(*) FROM srs_items'));
    assert_same(0, (int) db_value('SELECT count(*) FROM srs_progress') + (int) db_value('SELECT count(*) FROM exam_attempts'), 'nobody’s study data yet');

    // The owner's data from their computer, under their IAM user id: they bring their file back in the app.
    $owner = test_bearer(test_token(OWNER_AT_IAM, ['ADMIN'], ['preferred_username' => 'owner']));
    $r = site_call('PUT', '/api/me/data', read_json(owner_backup()), array_merge($owner, ['X-Time-Zone: Asia/Tokyo']));
    assert_same([200, ['items' => 2, 'days' => 1, 'log' => 2, 'attempts' => 1, 'reports' => 1, 'copy' => false]], [$r['status'], $r['body']], $r['raw']);
    assert_same('Asia/Tokyo', db_value('SELECT time_zone FROM users WHERE id = ?', [OWNER_AT_IAM]), 'the zone the request named, not the file\'s');
});

test('the installed site: sign-in first, and each person their own data', function (): void {
    assert_same(['state' => 'ready', 'installed' => true], site_call('GET', '/api/site-status', null, no_token())['body'], 'ready, and installed: its setup page finished here');
    assert_same(['issuer' => 'https://iam.test', 'client_id' => 'japanese-academy', 'login_required' => true, 'sign_in_available' => true, 'visitor_keep_days' => 30], site_call('GET', '/api/auth/config')['body']);
    assert_same(401, site_call('GET', '/api/kanji/progress', null, no_token())['status']);
    $owner = test_bearer(test_token(OWNER_AT_IAM, ['ADMIN'], ['preferred_username' => 'owner']));
    $p = site_call('GET', '/api/kanji/progress', null, $owner)['body'];
    assert_same(4, $p['items']['k:大']['stage'], 'the owner’s imported progress');
    $history = site_call('GET', '/api/attempts', null, $owner)['body'];
    assert_same(1, count($history));
    assert_same('<!doctype html><title>the old report</title>', site_call('GET', '/report/' . $history[0]['id'], null, $owner)['raw']);
    $someone = test_bearer(test_token(7));
    assert_same(0, site_call('GET', '/api/kanji/summary', null, $someone)['body']['learned'], 'somebody else, with no role here, studies too, and starts with nothing');
    assert_same(404, site_call('GET', '/report/' . $history[0]['id'], null, $someone)['status'], 'and cannot open the owner’s report');

    assert_match('/<title>Japanese Academy<\/title>/', site_call('GET', '/')['raw'], 'the app');
    assert_same(200, site_call('GET', '/kanji/reviews')['status'], 'a page of it');
    assert_same(404, site_call('GET', '/setup.php')['status'], 'no setup page any more');
    foreach (['/backend/config/database.local.php', '/backend/setup.php', '/backend/src/bootstrap.php', '/backend/data/vocab.json',
        '/backend/storage/backups/academy-2026-09-25.json'] as $url) {
        assert_same(404, site_call('GET', $url)['status'], "$url: outside the document root");
    }
    assert_same(403, site_call('GET', '/.htaccess')['status'], 'Apache never sends its own files');
    assert_same(404, site_call('GET', '/api/nothing')['status']);
    assert_same(['ok', 'contentCurrent'], array_keys(site_call('GET', '/api/health')['body']), 'a website keeps its database and its folders to itself');
});

test('uploaded again, the setup page refuses to run, and removes itself', function (): void {
    copy(BACKEND . '/setup.php', site()['dir'] . '/backend/setup.php');
    $r = site_call('GET', '/setup.php');
    assert_match('/Already set up/', $r['raw']);
    assert_false(is_file(site()['dir'] . '/backend/setup.php'));
});

/** The raw copies of every table taken before migrations, in the site's backups. */
function raw_copies(): array
{
    return glob(test_site_backups() . '/academy-before-migration-*.raw.json') ?: [];
}

function applied(string $migration): bool
{
    return in_array($migration, array_column(db_all('SELECT name FROM migrations'), 'name'), true);
}

test('a later upload with a new migration: a draft while it is half there, and the site goes on; whole, the site closes but for its open addresses until an administrator’s Apply, which applies it after a raw copy of every table', function (): void {
    $file = site()['dir'] . '/backend/migrations/901_test_upload.sql';
    $owner = test_bearer(test_token(OWNER_AT_IAM, ['ADMIN']));
    $editor = test_bearer(test_token(8, ['EDITOR']));
    file_put_contents($file, "CREATE TABLE academy_test_upload (id int);\n"); // the rest still on its way
    assert_same(200, site_call('GET', '/api/kanji/summary', null, $owner)['status'], 'the site goes on meanwhile');
    assert_same(['state' => 'ready', 'installed' => true], site_call('GET', '/api/site-status', null, no_token())['body'], 'a draft stops nothing');
    assert_false(applied('901_test_upload.sql'), 'without its last line it may be half of it: not applied');
    assert_same(null, db_value("SELECT to_regclass('academy_test_upload')"));
    assert_same([], raw_copies(), 'nor any copy taken for it yet');
    assert_same([migration('901_test_upload.sql') + ['ready' => false, 'blocked' => false]], site_call('GET', '/api/admin/migrations', null, $owner)['body']['pending'] ?? null,
        'the Migrations page shows it on its way: a draft');

    file_put_contents($file, "-- end of 901\n", FILE_APPEND); // the rest arrives
    $r = site_call('GET', '/api/site-status', null, no_token());
    assert_same([200, ['state' => 'update_pending', 'installed' => true]], [$r['status'], $r['body']], 'whole, it waits: where the site stands says so, to anybody');
    $closed = ['GET /api/kanji/summary', 'GET /api/kanji/progress', 'GET /api/attempts', 'GET /api/meta', 'GET /report/x', 'GET /api/me/data', 'POST /api/visitor/move',
        'GET /api/admin/translations', 'GET /api/admin/people', 'GET /api/nothing'];
    foreach ($closed as $route) {
        [$method, $url] = explode(' ', $route);
        foreach (['an administrator' => $owner, 'nobody' => no_token()] as $who => $headers) {
            $r = site_call($method, $url, null, $headers);
            assert_same([503, UPDATE_PENDING], [$r['status'], $r['body']], "$route, $who: the site is being updated");
            assert_same('60', $r['headers']['retry-after'] ?? null, "$route: ask again in a minute");
        }
    }
    // Open: what the pages need to start, to sign somebody in and to reach the Migrations page.
    assert_same(['issuer' => 'https://iam.test', 'client_id' => 'japanese-academy', 'login_required' => true, 'sign_in_available' => true, 'visitor_keep_days' => 30],
        site_call('GET', '/api/auth/config')['body'], 'how to sign in: an administrator signs in to apply it');
    $r = site_call('GET', '/api/translations/sk');
    assert_same([200, 'sk'], [$r['status'], $r['body']['language'] ?? null], 'the app’s words: no page of keys, no problem page');
    assert_same([200, true], [site_call('GET', '/api/health')['status'], site_call('GET', '/api/health')['body']['ok'] ?? null], 'the health check');
    assert_same(404, site_call('GET', '/audio/nothing.mp3')['status'], 'the clips (shared content) pass: there is no such clip, and it says so');
    assert_false(applied('901_test_upload.sql'), 'no request applies it');
    assert_same([], raw_copies());

    // The Migrations page answers all the same, to an administrator alone - from the token, with no table asked.
    foreach (['GET /api/admin/migrations', 'GET /api/admin/migrations/file?set=academy&name=901_test_upload.sql', 'POST /api/admin/migrations/apply'] as $route) {
        [$method, $url] = explode(' ', $route);
        $r = site_call($method, $url, null, test_bearer(test_token(7)));
        assert_same([403, 'staff_only'], [$r['status'], $r['body']['code'] ?? null], "$route: a learner");
        $r = site_call($method, $url, null, $editor);
        assert_same([403, 'admin_only'], [$r['status'], $r['body']['code'] ?? null], "$route: an editor");
        $r = site_call($method, $url, null, no_token());
        assert_same([401, 'sign_in_required'], [$r['status'], $r['body']['code'] ?? null], "$route: nobody");
    }
    assert_false(applied('901_test_upload.sql'));
    $list = site_call('GET', '/api/admin/migrations', null, $owner)['body'];
    assert_same([MIGRATION_SETS_IN_ORDER, [migration('901_test_upload.sql') + ['ready' => true, 'blocked' => false]], []], [$list['sets'], $list['pending'], $list['missing']]);
    assert_same(array_values(array_diff(site_migrations(), ['901_test_upload.sql'])), array_map('db_migration_label', $list['applied']),
        'the applied ones, in the order they ran: the library\'s admin tools, this site\'s own, then the library\'s words and people');
    assert_match('/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/D', (string) ($list['applied'][0]['applied_at'] ?? ''), 'when, in UTC');
    $r = site_call('GET', '/api/admin/migrations/file?set=academy&name=901_test_upload.sql', null, $owner);
    assert_same([200, migration('901_test_upload.sql') + ['sql' => "CREATE TABLE academy_test_upload (id int);\n-- end of 901\n"]], [$r['status'], $r['body']], 'a file’s SQL');
    foreach (['set=academy&name=999_nothing.sql', 'set=academy&name=..%2Fconfig%2Fdatabase.local.php', 'set=other&name=901_test_upload.sql'] as $query) {
        $r = site_call('GET', "/api/admin/migrations/file?$query", null, $owner);
        assert_same([404, ['code' => 'not_found', 'message' => 'No such migration file.']], [$r['status'], $r['body']], "$query: no file of the set");
    }

    // One apply at a time: while another holds the lock (an Apply, the setup page, manage.php, the content's rebuild), busy at once.
    db_tx(static function () use ($owner): void {
        db_value('SELECT pg_advisory_xact_lock(?::bigint)', [UPKEEP_LOCK]);
        $r = site_call('POST', '/api/admin/migrations/apply', null, $owner);
        assert_same([409, ['code' => 'busy', 'message' => 'Another database update is running. Nothing was applied. Wait a moment, then look again.']], [$r['status'], $r['body']], 'another one runs');
    });
    assert_false(applied('901_test_upload.sql'));

    $r = site_call('POST', '/api/admin/migrations/apply', null, $owner);
    assert_same(200, $r['status']);
    assert_same(['applied' => [migration('901_test_upload.sql')], 'failed' => null, 'error' => null], array_diff_key($r['body'], ['note' => 1]));
    assert_true(preg_match('/^A copy of every table from before is in backups\/(academy-before-migration-\d{8}-\d{6}-\d{3}\.raw\.json)\. '
        . 'A backup of the database as it was is (\d{8}-\d{6}Z-before-migration-[0-9a-f]{32})\.$/', (string) ($r['body']['note'] ?? ''), $copy) === 1,
        'the copies it took first, named: this site\'s raw copy of every table, then the anotoki library\'s backup - ' . ($r['body']['note'] ?? 'no note'));
    assert_true(applied('901_test_upload.sql'), 'applied');
    assert_true((bool) db_value("SELECT to_regclass('academy_test_upload') IS NOT NULL"));
    assert_same([$copy[1]], array_map('basename', raw_copies()), 'a copy of every table first, and only one');
    assert_true(is_file(test_site_backups() . "/{$copy[2]}.anotoki-backup"), 'and the library\'s backup beside it, in the same folder');
    assert_same([], site_call('GET', '/api/admin/migrations', null, $owner)['body']['pending'] ?? null, 'nothing pending');

    assert_same(['state' => 'ready', 'installed' => true], site_call('GET', '/api/site-status', null, no_token())['body']);
    assert_same(200, site_call('GET', '/api/kanji/summary', null, $owner)['status'], 'the site is back');
    $stamp = db_value('SELECT stamp FROM content_state');
    assert_same(200, site_call('GET', '/api/kanji/summary', null, $owner)['status']);
    assert_same($stamp, db_value('SELECT stamp FROM content_state'), 'then nothing more to do');
    assert_same(['applied' => [], 'failed' => null, 'error' => null, 'note' => null], site_call('POST', '/api/admin/migrations/apply', null, $owner)['body'],
        'Apply again: there was nothing to apply');
    assert_same(1, count(raw_copies()));
});

test('a migration that fails on Apply: rolled back whole and named, the ones before it stay, a copy only when the tables changed, and the fixed file then applies', function (): void {
    $first = site()['dir'] . '/backend/migrations/902_test_first.sql';
    $broken = site()['dir'] . '/backend/migrations/903_test_broken.sql';
    $owner = test_bearer(test_token(OWNER_AT_IAM, ['ADMIN']));
    file_put_contents($first, "CREATE TABLE academy_test_first (id int);\n-- end of 902\n");
    file_put_contents($broken, "CREATE TABLE academy_test_half (id int);\nINSERT INTO academy_test_nowhere VALUES (1);\n-- end of 903\n");
    $copies = count(raw_copies());

    $r = site_call('POST', '/api/admin/migrations/apply', null, $owner)['body'];
    assert_same([[migration('902_test_first.sql')], migration('903_test_broken.sql')], [$r['applied'], $r['failed']], 'the first applied, then it stopped');
    // Why, in PostgreSQL's words: to the administrator on a website as on this computer (the one answer that says it
    // on a website: tests/api/upkeep.test.php, outside the built-in server, proves it), and to the error log as well.
    assert_match('/relation "academy_test_nowhere" does not exist/', (string) $r['error'], 'why');
    assert_true(applied('902_test_first.sql'));
    assert_false(applied('903_test_broken.sql'));
    assert_same(null, db_value("SELECT to_regclass('academy_test_half')"), 'the failed file rolled back whole');
    assert_same($copies + 1, count(raw_copies()));
    foreach ([2, 3] as $try) {
        $r = site_call('POST', '/api/admin/migrations/apply', null, $owner)['body'];
        assert_same([[], migration('903_test_broken.sql')], [$r['applied'], $r['failed']], "try $try");
        // try 2: the tables changed since the first copy (902 is applied): a copy, named; try 3: the same files on the same tables, no other.
        // (The library's backup before the update is named every time: made for this list of pending files, or found again.)
        assert_same($try === 2, str_contains((string) $r['note'], 'A copy of every table'), "try $try: " . ($r['note'] ?? 'no copy'));
        assert_match('/A backup of the database as it was is \d{8}-\d{6}Z-before-migration-[0-9a-f]{32}\.$/', (string) $r['note'], "try $try");
        $r = site_call('GET', '/api/kanji/summary', null, $owner);
        assert_same([503, UPDATE_PENDING], [$r['status'], $r['body']], "try $try: the site waits");
    }
    assert_same($copies + 2, count(raw_copies()), 'one more copy for the tables after 902, not one for every try');

    file_put_contents($broken, "CREATE TABLE academy_test_fixed (id int);\n-- end of 903\n");
    $r = site_call('POST', '/api/admin/migrations/apply', null, $owner)['body'];
    assert_same([[migration('903_test_broken.sql')], null, null], [$r['applied'], $r['failed'], $r['error']]);
    assert_same($copies + 3, count(raw_copies()), 'the fixed file is another upload: a copy right before it applies');
    assert_same(200, site_call('GET', '/api/kanji/summary', null, $owner)['status']);
    assert_match('/\[upkeep\] a migration failed: backend\/migrations\/903_test_broken\.sql: .*academy_test_nowhere/', (string) file_get_contents(site()['log']),
        'the site’s log says which failed, and why');
});

test('the setup page, run again on purpose after a newer upload: a raw copy of every table before it migrates', function (): void {
    unlink(site()['dir'] . '/backend/storage/installed.lock');
    copy(BACKEND . '/setup.php', site()['dir'] . '/backend/setup.php');
    $page = site_call('GET', '/setup.php');
    assert_match('/Set up Japanese Academy/', $page['raw'], 'a new token');
    // A site in use: what is set, and its people's backups, stay out of the page - before the token and after.
    $backups = array_values(array_filter(array_map('basename', glob(test_site_backups() . '/academy-*.json') ?: []),
        static fn (string $f): bool => !str_ends_with($f, '.raw.json')));
    assert_true($backups !== [], 'the day’s backup is there');
    foreach (array_merge([db_name(), site()['role'], 'https://iam.test', '(saved', 'placeholder="unchanged"'], $backups) as $set) {
        assert_false(str_contains($page['raw'], $set), "$set: not on a website's setup page");
    }
    $r = test_form(site()['base'], '/setup.php', setup_form(['token' => 'a guess', 'action' => 'test-token']), WEBSITE);
    assert_same(['ok', 'message'], array_keys($r['body']), 'a wrong token: nothing of it');
    $r = test_form(site()['base'], '/setup.php', setup_form(['action' => 'test-token']), WEBSITE);
    assert_same(['ok' => true, 'message' => 'That is the token.'], $r['body'], 'the token proven: still nothing of what is saved');
    file_put_contents(site()['dir'] . '/backend/migrations/904_test_reinstall.sql', "CREATE TABLE academy_test_reinstall (id int);\n-- end of 904\n");
    $r = test_form(site()['base'], '/setup.php', setup_form(['db_password' => '']), WEBSITE);
    assert_match('/<h1>Set up<\/h1>/', $r['raw'], strip_tags($r['raw']));
    assert_same(site()['password'], (require site()['dir'] . '/backend/config/database.local.php')['password'], 'an empty password keeps the saved one');
    assert_match('/Backup before the update: backend\/storage\/backups\/academy-before-migration-\d{8}-\d{6}-\d{3}\.raw\.json\./', $r['raw']);
    assert_match('/Applied the migrations: 904_test_reinstall\.sql\./', $r['raw']);
    assert_same(5, count(raw_copies()));
    assert_true(applied('904_test_reinstall.sql'));
    assert_true(is_file(site()['dir'] . '/backend/storage/installed.lock'), 'locked again');
    assert_false(is_file(site()['dir'] . '/backend/setup.php'), 'and gone again');
    $owner = test_bearer(test_token(OWNER_AT_IAM, ['ADMIN']));
    assert_same(4, site_call('GET', '/api/kanji/progress', null, $owner)['body']['items']['k:大']['stage'] ?? null, 'the owner’s data as it was');
    clearstatcache();
    $since = substr((string) file_get_contents(site()['log']), (int) (site()['log_from'] ?? 0));
    $problems = array_filter(preg_split('/\R/', $since), static fn (string $l): bool => (bool) preg_match('/PHP (Fatal|Parse|Warning|Notice|Deprecated)|\[server\]|\[db\]|Uncaught/i', $l));
    assert_same([], array_values($problems), 'no PHP warnings or errors on the site once it was set up');
});

test('the update that brings the app’s own words, while migration 004 has not arrived whole: their address says 503 translations_unavailable, nothing is logged, and the rest of the site goes on', function (): void {
    // The site as it was before this version: its database without 004's tables, and the file itself short
    // of its last line, as FTP leaves it half-way. (Only a site's copy may hold a migration that is not whole:
    // no test writes into backend/migrations.)
    $name = '004_languages_and_translations.sql';
    $file = site()['dir'] . "/backend/migrations/$name";
    $whole = (string) file_get_contents($file);
    $lines = preg_split('/\R/', rtrim($whole));
    assert_same('-- end of 004', array_pop($lines));
    db_tx(static function () use ($name): void {
        db()->exec('DROP TABLE translations, translation_keys, languages');
        db_exec('DELETE FROM migrations WHERE name = ?', [$name]);
    });
    file_put_contents($file, implode("\n", $lines) . "\n");
    clearstatcache();
    $logged = (int) filesize(site()['log']);
    $copies = count(raw_copies());
    $owner = test_bearer(test_token(OWNER_AT_IAM, ['ADMIN']));

    // The anotoki library's answer, in this app's error body, and ask again in a minute.
    foreach (['/api/translations/en', '/api/translations/sk', '/api/translations/sk-sk'] as $url) {
        $r = site_call('GET', $url);
        assert_same([503, ['error' => WORDS_UNAVAILABLE, 'code' => 'translations_unavailable'], '60'], [$r['status'], $r['body'], $r['headers']['retry-after'] ?? null],
            "$url: the page puts up its problem page, not a page of keys");
    }
    assert_same(503, site_call('GET', '/api/translations/sk', null, $owner)['status'], 'signed in or not');
    foreach (['GET /api/admin/languages', 'GET /api/admin/translations', 'PUT /api/admin/translations', 'DELETE /api/admin/languages/sk'] as $route) {
        [$method, $url] = explode(' ', $route);
        $r = site_call($method, $url, $method === 'PUT' ? ['values' => new stdClass()] : null, $owner);
        assert_same([503, 'translations_unavailable'], [$r['status'], $r['body']['code'] ?? null], "$route: the admin area's addresses say the same");
    }
    assert_false(applied($name), 'without its last line it may be half of it: not applied');
    assert_same(null, db_value("SELECT to_regclass('translations')"));
    assert_same($copies, count(raw_copies()), 'nor any copy taken for it yet');

    // Everything else answers as before: people study on while the upload goes on.
    assert_same(['issuer' => 'https://iam.test', 'client_id' => 'japanese-academy', 'login_required' => true, 'sign_in_available' => true, 'visitor_keep_days' => 30], site_call('GET', '/api/auth/config')['body']);
    assert_same(true, site_call('GET', '/api/health')['body']['ok'] ?? null);
    assert_same(4, site_call('GET', '/api/kanji/progress', null, $owner)['body']['items']['k:大']['stage'] ?? null, 'the owner’s data as it was');
    assert_same(200, site_call('GET', '/api/meta', null, $owner)['status']);
    assert_same(401, site_call('GET', '/api/kanji/summary', null, no_token())['status']);
    assert_false(array_key_exists('translations', backup_data()), 'and a backup of everybody holds no words while there are none to hold');
    clearstatcache();
    $since = substr((string) file_get_contents(site()['log']), $logged);
    assert_no_match('/PHP (Fatal|Parse|Warning|Notice|Deprecated)|\[server\]|\[db\]|\[upkeep\]|Uncaught/i', $since, 'nothing was logged: a query on the missing table would be a [db] line for every page load');

    // The rest of the file arrives: it waits for an administrator, who applies it (after a raw copy of every
    // table) on the Migrations page - the site closed meanwhile; the page's next request has the words.
    file_put_contents($file, $whole);
    assert_same(['state' => 'update_pending', 'installed' => true], site_call('GET', '/api/site-status', null, no_token())['body'], 'whole, it waits');
    $r = site_call('GET', '/api/kanji/progress', null, $owner);
    assert_same([503, UPDATE_PENDING], [$r['status'], $r['body']], 'the site is being updated');
    $r = site_call('GET', '/api/translations/sk');
    assert_same([503, ['error' => WORDS_UNAVAILABLE, 'code' => 'translations_unavailable']], [$r['status'], $r['body']],
        'the words answer while an update waits, and there are none yet: the gate\'s page stands in, which has its own');
    $r = site_call('POST', '/api/admin/migrations/apply', null, $owner)['body'];
    assert_same(['applied' => [migration($name)], 'failed' => null, 'error' => null], array_diff_key($r, ['note' => 1]));
    assert_match('/^A copy of every table from before is in backups\/academy-before-migration-/', (string) ($r['note'] ?? ''), 'the copy, named');
    $r = site_call('GET', '/api/translations/sk');
    assert_same([200, 'sk', ['en', 'sk']], [$r['status'], $r['body']['language'] ?? null, array_column($r['body']['languages'] ?? [], 'code')], 'the words, with the page\'s first request');
    assert_true(applied($name), 'applied');
    assert_same($copies + 1, count(raw_copies()), 'a copy of every table first');
    assert_same(['en', 'sk'], array_column(site_call('GET', '/api/admin/languages', null, $owner)['body']['languages'] ?? [], 'code'));
    assert_same(site()['role'], db_value("SELECT tableowner FROM pg_tables WHERE tablename = 'translations'"), 'made by the site’s own user');
    assert_same(4, site_call('GET', '/api/kanji/progress', null, $owner)['body']['items']['k:大']['stage'] ?? null);
    assert_true(array_key_exists('translations', backup_data()), 'and from now on a backup holds them');
    clearstatcache();
    assert_no_match('/PHP (Fatal|Parse|Warning|Notice|Deprecated)|\[server\]|\[db\]|\[upkeep\]|Uncaught/i', substr((string) file_get_contents(site()['log']), $logged));
});

test('installed, and its settings gone: every address says the site is not available - never the setup page, which is gone too', function (): void {
    $config = site()['dir'] . '/backend/config';
    $saved = [];
    foreach (['database', 'auth'] as $which) {
        $saved[$which] = (string) file_get_contents("$config/$which.local.php");
    }
    assert_true(is_file(site()['dir'] . '/backend/storage/installed.lock') && !is_file(site()['dir'] . '/backend/setup.php'), 'installed: the lock there, the setup page gone');
    unlink("$config/auth.local.php");
    try {
        $notAvailable = ['code' => 'not_set_up', 'installed' => true, 'message' => 'The site is not available right now. Try again in a few minutes.'];
        foreach (['/api/auth/config', '/api/translations/en', '/api/kanji/progress', '/api/admin/migrations'] as $url) {
            $r = site_call('GET', $url, null, test_bearer(test_token(OWNER_AT_IAM, ['ADMIN'])));
            assert_same([503, $notAvailable], [$r['status'], $r['body']], "$url: no setup page offered");
        }
        assert_same(['state' => 'not_set_up', 'installed' => true], site_call('GET', '/api/site-status', null, no_token())['body']);
        assert_same(404, site_call('GET', '/setup.php')['status'], 'and there is none to open');
    } finally {
        foreach ($saved as $which => $php) {
            file_put_contents("$config/$which.local.php", $php);
        }
    }
    assert_same(['state' => 'ready', 'installed' => true], site_call('GET', '/api/site-status', null, no_token())['body'], 'its settings back: ready');
});
