<?php
// A hosted site, end to end, on this computer: the upload built by
// backend/tools/build-dist.php into a temp folder; served the way Apache
// serves it; set up by its setup page over HTTP as a website sees it (every
// request with the Host of a website: the token, the lock, the self-delete),
// with a database and a PostgreSQL user of its own, as a hosting panel makes
// them; signed into with the test IAM's tokens; and later uploads: a new
// migration, which the next request applies once it is all there; one that
// fails; and the setup page run again on purpose. (The setup page on the
// owner's own computer is tests/api/setup.test.php's.)
declare(strict_types=1);

require __DIR__ . '/../lib.php'; // before the app loads: a throwaway database and backup folder

/** The owner's user id at the hosted IAM: their data is imported under it. */
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
        'auth_mode' => 'iam',
        'issuer' => 'https://iam.test',
        'client_id' => 'japanese-academy',
        'timezone' => 'Europe/Bratislava',
        'user_id' => (string) OWNER_AT_IAM,
        'action' => 'install',
    ], static fn ($value): bool => $value !== null);
}

/** A backup from the owner's computer, from before user ids (format version 1). */
function owner_backup(): string
{
    $file = str_replace('\\', '/', sys_get_temp_dir()) . '/academy-test-v1-' . bin2hex(random_bytes(4)) . '.json';
    $id = '2026-09-22T11-09-21-059Z-exam-1790075246120-320199';
    file_put_contents($file, json_text([
        'format' => BACKUP_FORMAT, 'version' => 1, 'takenAt' => '2026-09-26T06:00:00.000Z', 'database' => 'japanese_academy',
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
        'backend/setup.php', 'backend/api/app.php', 'backend/api/front.php', 'backend/src/bootstrap.php', 'backend/src/anotoki_iam.php',
        'backend/config/config.php', 'backend/migrations/002_users.sql', 'backend/vendor/autoload.php', 'backend/vendor/slim/slim/Slim/App.php',
        'backend/composer.lock', 'data/vocab.json', 'data/audio.json', 'backend/.htaccess', 'backend/storage/.htaccess', 'data/.htaccess', 'backups/.htaccess'];
    foreach ($needed as $file) {
        assert_true(is_file("$dir/$file"), $file);
    }
    $all = [];
    foreach (new RecursiveIteratorIterator(new RecursiveDirectoryIterator($dir, FilesystemIterator::SKIP_DOTS)) as $item) {
        $all[] = str_replace('\\', '/', substr($item->getPathname(), strlen($dir) + 1));
    }
    assert_same([], glob("$dir/data/audio/*") ?: [], 'no clips with --no-audio');

    // The whole build, listed: the same, and every clip.
    $full = json_decode(test_build('--list --frontend=' . escapeshellarg(test_frontend())), true);
    $clips = array_values(array_filter($full, static fn (string $f): bool => str_starts_with($f, 'data/audio/')));
    assert_same(count(glob(AUDIO_CLIPS . '/*.mp3') ?: []), count($clips), 'every clip');
    $rest = array_values(array_diff($full, $clips));
    sort($rest);
    $built = array_values(array_diff($all, ['.academy-dist']));
    sort($built);
    assert_same($rest, $built, 'the list is what gets built');

    $never = '~^(tests|tools|docs|books|progress|results|reports|node_modules|\.claude|temp|frontend|src)/|^backend/(tests|tools|public)/|^backend/(server|manage)\.php$'
        . '|\.local\.php$|(^|/)\.env$|^data/source/|^backups/.+\.json$|^backend/storage/(?!\.htaccess$)~';
    assert_same([], array_values(array_filter($full, static fn (string $f): bool => (bool) preg_match($never, $f))), 'none of these');
    foreach (['backend', 'backend/storage', 'data', 'backups'] as $folder) {
        assert_match('/Require all denied/', (string) file_get_contents("$dir/$folder/.htaccess"), "$folder/ is never served");
    }
    $htaccess = (string) file_get_contents("$dir/public/.htaccess");
    assert_match('/CGIPassAuth On/', $htaccess, 'the token reaches PHP under CGI');
    assert_match('/SetEnvIf Authorization/', $htaccess, 'and under an older Apache');
    assert_match('/RewriteRule \^\(api\|audio\|report\)\(\/\|\$\) index\.php/', $htaccess, 'the backend\'s addresses go to the front controller');
    assert_match('/RewriteRule \^ index\.html/', $htaccess, 'and a page of the app to its index.html');
    assert_no_match('/DirectoryIndex|^\s*Options/m', $htaccess, 'nothing a host may refuse in .htaccess');
});

test('before the setup page has run, the site is closed, and says so', function (): void {
    foreach (['/api/auth/config', '/api/health', '/api/kanji/progress'] as $url) {
        $r = site_call('GET', $url);
        assert_same(503, $r['status'], "$url: without settings, not even a sign-in mode to assume");
        assert_same(['error' => NOT_SET_UP, 'code' => 'not_set_up', 'setup' => '/setup.php'], $r['body'], "$url: no more than that, to a website");
    }
    assert_same(200, site_call('GET', '/kanji')['status'], 'the app itself loads, and shows its "not set up yet" page');
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

test('the setup page: proof of owning the server first', function (): void {
    // put in the site's backups/ by FTP (for one bigger than the host takes in a form)
    copy(owner_backup(), site()['dir'] . '/backups/academy-2026-09-25.json');
    $page = site_call('GET', '/setup.php');
    assert_same(200, $page['status']);
    assert_match('/Set up Japanese Academy/', $page['raw']);
    assert_no_match('/academy-2026-09-25\.json/', $page['raw'], 'what is in backups/ is not for whoever opens the page');
    assert_no_match('/value="none"/', $page['raw'], 'a website signs people in: no mode without');
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
    // nor does a form without the token learn which files backups/ holds
    foreach (['academy-2026-09-25.json', 'academy-1999-01-01.json'] as $name) {
        $r = test_form(site()['base'], '/setup.php', setup_form(['token' => 'a guess', 'backup_file' => $name]), WEBSITE);
        assert_no_match('/no such file/', $r['raw'], "$name: nothing said of it");
    }
    $r = test_form(site()['base'], '/setup.php', setup_form(['issuer' => 'http://iam.example.com']), WEBSITE);
    assert_match('/must be an https:\/\/ address/', $r['raw']);
    assert_false(is_file(site()['dir'] . '/backend/config/auth.local.php'), 'and still nothing written');

    // The buttons: with the token only, or the page would be a way into the host's network.
    $r = test_form(site()['base'], '/setup.php', setup_form(['token' => 'a guess', 'action' => 'test-db']), WEBSITE);
    assert_same(['ok' => false, 'message' => 'That is not the token from backend/config/setup-token.local.php.'], $r['body']);
    $r = test_form(site()['base'], '/setup.php', setup_form(['action' => 'test-db']), WEBSITE);
    assert_same(true, $r['body']['ok'] ?? null, $r['raw']);
    assert_match('/Connected to the database ' . db_name() . '\. It is empty: setting up makes its tables\./', $r['body']['message']);
    $r = test_form(site()['base'], '/setup.php', setup_form(['action' => 'test-db', 'db_password' => 'wrong']), WEBSITE);
    assert_same(false, $r['body']['ok'] ?? null);
    assert_match('/Cannot connect with these settings: \S/', $r['body']['message']);
    assert_no_match('/SQLSTATE/', $r['body']['message'], 'what PostgreSQL said, without PDO\'s codes');

    // The token's own button: once it is proven, the files in backups/ to choose from.
    $r = test_form(site()['base'], '/setup.php', setup_form(['token' => 'a guess', 'action' => 'test-token']), WEBSITE);
    assert_same(['ok' => false, 'message' => 'That is not the token from backend/config/setup-token.local.php.'], $r['body']);
    $r = test_form(site()['base'], '/setup.php', setup_form(['action' => 'test-token']), WEBSITE);
    assert_same(true, $r['body']['ok'] ?? null, $r['raw']);
    assert_same(['academy-2026-09-25.json'], $r['body']['backups'] ?? null, 'a backup put in backups/ by FTP can be chosen');
    assert_same([], (array) ($r['body']['saved'] ?? null), 'nothing is set yet');
});

test('the setup page sets the site up: settings, tables, study content, and the owner’s data', function (): void {
    // sign-in off, asked for all the same: a website signs people in, whatever the form says
    $r = test_form(site()['base'], '/setup.php', setup_form(['auth_mode' => 'none', 'backup' => new CURLFile(owner_backup(), 'application/json', 'academy-2026-09-26.json')]), WEBSITE);
    assert_same(200, $r['status']);
    assert_match('/<h1>Set up<\/h1>/', $r['raw'], strip_tags($r['raw']));
    assert_match('/Applied the migrations: 001_init\.sql, 002_users\.sql, 003_content_stamp\.sql/', $r['raw']);
    assert_match('/Built the study content: 1,?373 kanji items/', $r['raw']);
    assert_match('/Imported your data into user 42: 2 kanji items, 1 day, 2 answers, 1 exam attempt\./', $r['raw']);
    assert_match('/Built the study content: 1,373 kanji items and \d{1,3}(,\d{3})+ exam questions/', $r['raw'], 'counts as the app writes them');
    assert_match('/come from a file/', $r['raw'], 'the keys of the test IAM');

    $config = site()['dir'] . '/backend/config';
    assert_same(['mode' => 'iam', 'issuer' => 'https://iam.test', 'client_id' => 'japanese-academy', 'local_user_id' => OWNER_AT_IAM], require "$config/auth.local.php");
    $db = require "$config/database.local.php";
    assert_same([site()['role'], db_name(), site()['password']], [$db['user'], $db['name'], $db['password']]);
    assert_same(['timezone' => 'Europe/Bratislava'], require "$config/app.local.php");
    if (PHP_OS_FAMILY !== 'Windows') {
        assert_same('600', decoct(fileperms("$config/database.local.php") & 0777), 'the password: for the owner only');
    }
    assert_true(is_file(site()['dir'] . '/backend/storage/installed.lock'));
    assert_false(is_file(site()['dir'] . '/backend/setup.php'), 'the setup page is gone');
    assert_false(is_file("$config/setup-token.local.php"), 'and its token');

    assert_same(['001_init.sql', '002_users.sql', '003_content_stamp.sql'], array_column(db_all('SELECT name FROM migrations ORDER BY name'), 'name'));
    assert_same(site()['role'], db_value("SELECT tableowner FROM pg_tables WHERE tablename = 'srs_progress'"), 'made by the site’s own user');
    assert_same(1373, (int) db_value('SELECT count(*) FROM srs_items'));
    $items = array_keys(store_items(OWNER_AT_IAM));
    sort($items);
    assert_same(['k:大', 'k:学'], $items, 'the owner’s data, under their IAM user id');
    assert_same('backup', db_value('SELECT source FROM imports WHERE user_id = ?', [OWNER_AT_IAM]));
});

test('the installed site: sign-in first, and each person their own data', function (): void {
    assert_same(['mode' => 'iam', 'issuer' => 'https://iam.test', 'clientId' => 'japanese-academy'], site_call('GET', '/api/auth/config')['body']);
    assert_same(401, site_call('GET', '/api/kanji/progress')['status']);
    $owner = test_bearer(test_token(OWNER_AT_IAM, ['ADMIN'], ['preferred_username' => 'owner']));
    $p = site_call('GET', '/api/kanji/progress', null, $owner)['body'];
    assert_same(4, $p['items']['k:大']['stage'], 'the owner’s imported progress');
    $history = site_call('GET', '/api/attempts', null, $owner)['body'];
    assert_same(1, count($history));
    assert_same('<!doctype html><title>the old report</title>', site_call('GET', '/report/' . $history[0]['id'], null, $owner)['raw']);
    $someone = test_bearer(test_token(7));
    assert_same(0, site_call('GET', '/api/kanji/summary', null, $someone)['body']['learned'], 'somebody else starts with nothing');
    assert_same(404, site_call('GET', '/report/' . $history[0]['id'], null, $someone)['status'], 'and cannot open the owner’s report');

    assert_match('/<title>Japanese Academy<\/title>/', site_call('GET', '/')['raw'], 'the app');
    assert_same(200, site_call('GET', '/kanji/reviews')['status'], 'a page of it');
    assert_same(404, site_call('GET', '/setup.php')['status'], 'no setup page any more');
    foreach (['/backend/config/database.local.php', '/backend/setup.php', '/backend/src/bootstrap.php', '/data/vocab.json', '/backups/academy-2026-09-25.json'] as $url) {
        assert_same(404, site_call('GET', $url)['status'], "$url: outside the document root");
    }
    assert_same(403, site_call('GET', '/.htaccess')['status'], 'Apache never sends its own files');
    assert_same(404, site_call('GET', '/api/nothing')['status']);
    assert_same('iam', site_call('GET', '/api/health')['body']['auth']);
    assert_false(isset(site_call('GET', '/api/health')['body']['database']), 'a website keeps its database to itself');
});

test('uploaded again, the setup page refuses to run, and removes itself', function (): void {
    copy(BACKEND . '/setup.php', site()['dir'] . '/backend/setup.php');
    $r = site_call('GET', '/setup.php');
    assert_match('/Already set up/', $r['raw']);
    assert_false(is_file(site()['dir'] . '/backend/setup.php'));
});

/** The raw copies of every table taken before migrations, in backups/. */
function raw_copies(): array
{
    return glob(test_site_backups() . '/academy-before-migration-*.raw.json') ?: [];
}

function applied(string $migration): bool
{
    return in_array($migration, array_column(db_all('SELECT name FROM migrations'), 'name'), true);
}

test('a later upload with a new migration: waited for while it is half there, then applied, after a raw copy of every table', function (): void {
    $file = site()['dir'] . '/backend/migrations/004_test_upload.sql';
    $owner = test_bearer(test_token(OWNER_AT_IAM, ['ADMIN']));
    file_put_contents($file, "CREATE TABLE academy_test_upload (id int);\n"); // the rest still on its way
    assert_same(200, site_call('GET', '/api/kanji/summary', null, $owner)['status'], 'the site goes on meanwhile');
    assert_false(applied('004_test_upload.sql'), 'without its last line it may be half of it: not applied');
    assert_same(null, db_value("SELECT to_regclass('academy_test_upload')"));
    assert_same([], raw_copies(), 'nor any copy taken for it yet');

    file_put_contents($file, "-- end of 004\n", FILE_APPEND); // the rest arrives
    assert_same(200, site_call('GET', '/api/kanji/summary', null, $owner)['status']);
    assert_true(applied('004_test_upload.sql'), 'applied');
    assert_true((bool) db_value("SELECT to_regclass('academy_test_upload') IS NOT NULL"));
    assert_same(1, count(raw_copies()), 'a copy of every table first');
    $stamp = db_value('SELECT stamp FROM content_state');
    assert_same(200, site_call('GET', '/api/kanji/summary', null, $owner)['status']);
    assert_same($stamp, db_value('SELECT stamp FROM content_state'), 'then nothing more to do');
    assert_same(1, count(raw_copies()));
});

test('a migration that fails: every request says so, one copy is taken for one upload however often it is tried, and the fixed file then applies', function (): void {
    $file = site()['dir'] . '/backend/migrations/005_test_broken.sql';
    $owner = test_bearer(test_token(OWNER_AT_IAM, ['ADMIN']));
    file_put_contents($file, "INSERT INTO academy_test_nowhere VALUES (1);\n-- end of 005\n");
    foreach ([1, 2, 3] as $try) {
        $r = site_call('GET', '/api/kanji/summary', null, $owner);
        assert_same(503, $r['status'], "try $try");
        assert_match('/could not be brought up to date with the upload: backend\/migrations\/005_test_broken\.sql: .*academy_test_nowhere/',
            (string) ($r['body']['error'] ?? ''), "try $try: which migration, and why");
    }
    assert_false(applied('005_test_broken.sql'));
    assert_same(2, count(raw_copies()), 'one copy for it: each try rolled back, so the first copy is still what is there');

    // Taken out again, the site is used as before; put back, it gets a copy of its own.
    unlink($file);
    assert_same(200, site_call('GET', '/api/kanji/summary', null, $owner)['status']);
    file_put_contents($file, "INSERT INTO academy_test_nowhere VALUES (1, 2);\n-- end of 005\n");
    assert_same(503, site_call('GET', '/api/kanji/summary', null, $owner)['status']);
    assert_same(3, count(raw_copies()), 'the tables may have changed in between');

    file_put_contents($file, "CREATE TABLE academy_test_fixed (id int);\n-- end of 005\n");
    assert_same(200, site_call('GET', '/api/kanji/summary', null, $owner)['status']);
    assert_true(applied('005_test_broken.sql'));
    assert_same(4, count(raw_copies()), 'the fixed file is another upload: a copy right before it applies');
    assert_match('/\[upkeep\] a migration failed: backend\/migrations\/005_test_broken\.sql: .*academy_test_nowhere/', (string) file_get_contents(site()['log']),
        'the site’s log says which failed, and why');
});

test('the setup page, run again on purpose after a newer upload: a raw copy of every table before it migrates', function (): void {
    unlink(site()['dir'] . '/backend/storage/installed.lock');
    copy(BACKEND . '/setup.php', site()['dir'] . '/backend/setup.php');
    $page = site_call('GET', '/setup.php');
    assert_match('/Set up Japanese Academy/', $page['raw'], 'a new token');
    // A site in use: what is set, and its people's backups, stay out of the page until the token is proven.
    $backups = array_values(array_filter(array_map('basename', glob(test_site_backups() . '/academy-*.json') ?: []),
        static fn (string $f): bool => !str_ends_with($f, '.raw.json')));
    assert_true($backups !== [], 'the day’s backup is there');
    foreach (array_merge([db_name(), site()['role'], 'https://iam.test', 'value="' . OWNER_AT_IAM . '"', '<em id="pw-saved">(saved', 'type="password" placeholder="unchanged"'], $backups) as $set) {
        assert_false(str_contains($page['raw'], $set), "$set: not before the token");
    }
    $r = test_form(site()['base'], '/setup.php', setup_form(['token' => 'a guess', 'action' => 'test-token']), WEBSITE);
    assert_same(['ok', 'message'], array_keys($r['body']), 'a wrong token: nothing of it');
    $r = test_form(site()['base'], '/setup.php', setup_form(['action' => 'test-token']), WEBSITE);
    assert_same(['db_host' => (string) config('db.host'), 'db_port' => (string) config('db.port'), 'db_name' => db_name(), 'db_user' => site()['role'],
        'issuer' => 'https://iam.test', 'client_id' => 'japanese-academy', 'user_id' => (string) OWNER_AT_IAM, 'timezone' => 'Europe/Bratislava'],
        $r['body']['saved'] ?? null, 'the token proven: what is set, to fill in');
    assert_same(true, $r['body']['passwordSaved'] ?? null);
    assert_false(str_contains($r['raw'], site()['password']), 'never the password');
    assert_same($backups, $r['body']['backups'] ?? null, 'and the backups to choose from');
    file_put_contents(site()['dir'] . '/backend/migrations/006_test_reinstall.sql', "CREATE TABLE academy_test_reinstall (id int);\n-- end of 006\n");
    $r = test_form(site()['base'], '/setup.php', setup_form(), WEBSITE);
    assert_match('/<h1>Set up<\/h1>/', $r['raw'], strip_tags($r['raw']));
    assert_match('/Backup before the update: backups\/academy-before-migration-\d{8}-\d{6}-\d{3}\.raw\.json\./', $r['raw']);
    assert_match('/Applied the migrations: 006_test_reinstall\.sql\./', $r['raw']);
    assert_same(5, count(raw_copies()));
    assert_true(applied('006_test_reinstall.sql'));
    assert_true(is_file(site()['dir'] . '/backend/storage/installed.lock'), 'locked again');
    assert_false(is_file(site()['dir'] . '/backend/setup.php'), 'and gone again');
    $owner = test_bearer(test_token(OWNER_AT_IAM, ['ADMIN']));
    assert_same(4, site_call('GET', '/api/kanji/progress', null, $owner)['body']['items']['k:大']['stage'] ?? null, 'the owner’s data as it was');
    clearstatcache();
    $since = substr((string) file_get_contents(site()['log']), (int) (site()['log_from'] ?? 0));
    $problems = array_filter(preg_split('/\R/', $since), static fn (string $l): bool => (bool) preg_match('/PHP (Fatal|Parse|Warning|Notice|Deprecated)|\[server\]|\[db\]|Uncaught/i', $l));
    assert_same([], array_values($problems), 'no PHP warnings or errors on the site once it was set up');
});
