<?php
/**
 * Japanese Academy on this computer: PHP's built-in web server, with this file
 * as its router. One address serves both halves — the built Angular app
 * (frontend/dist/japanese-academy/browser) and the API — as Apache does on a
 * hosted site through public/index.php (api/front.php decides for both).
 *
 *   php backend/server.php          checks the settings and the database, applies new
 *                                   migrations (after a raw copy of every table), rebuilds
 *                                   the study content if data/ changed, takes today's
 *                                   backup, then serves http://127.0.0.1:8200
 *   php backend/server.php --url    only prints that address (for the launchers)
 *
 * HOST and PORT in the environment choose another address; without sign-in
 * (auth mode none) it refuses any host but this computer's. Not set up yet (no
 * backend/config/*.local.php), it serves anyway, so the setup page can be
 * opened: http://127.0.0.1:8200/setup.php.
 *
 * During development the frontend's own server (npm start in frontend/, on
 * http://localhost:4400) sends /api, /audio, /report and /setup.php here.
 */

declare(strict_types=1);

/** Where the server listens: this computer only, unless HOST says otherwise. */
const SERVER_HOST = '127.0.0.1';
const SERVER_PORT = 8200;

if (PHP_SAPI === 'cli-server') {
    require __DIR__ . '/src/bootstrap.php';
    require __DIR__ . '/api/front.php';
    academy_front(server_frontend_dir());
    return true;
}
if (PHP_SAPI !== 'cli') {
    http_response_code(404);
    exit;
}

require __DIR__ . '/src/bootstrap.php';

$host = (string) (getenv('HOST') ?: SERVER_HOST);
$port = (int) (getenv('PORT') ?: SERVER_PORT);
if (in_array('--url', $argv, true)) {
    echo "http://$host:$port\n";
    exit(0);
}
exit(server_run($host, $port));

/**
 * The built Angular app: frontend/dist/japanese-academy/browser (npm run
 * build:frontend; the launchers build it). The tests' own settings may name
 * another (app.frontend_dir), for a throwaway database only.
 */
function server_frontend_dir(): string
{
    $dir = config('app.frontend_dir');
    if (is_string($dir) && $dir !== '' && config_is_test_db(db_name())) {
        return app_path($dir);
    }
    return ROOT . '/frontend/dist/japanese-academy/browser';
}

/** php backend/server.php: get the database ready, say what's there, and serve. */
function server_run(string $host, int $port): int
{
    $url = 'http://' . (str_contains($host, ':') ? "[$host]" : $host) . ":$port";
    $local = in_array($host, ['127.0.0.1', 'localhost', '::1'], true);
    $fail = static function (string $message): int {
        fwrite(STDERR, "\n  $message\n\n");
        return 1;
    };

    echo "\n  Japanese Academy  →  $url\n";
    if (!is_file(server_frontend_dir() . '/index.html')) {
        echo "  app       : not built yet: npm run build:frontend (the launchers build it)\n";
    }

    $problem = config_problem();
    if ($problem !== null) {
        // No settings, no sign-in mode yet: this computer only, like mode none.
        if (!$local) {
            return $fail("Not set up yet, so the app only listens on this computer (127.0.0.1), not on $host.");
        }
        echo "  not set up yet ($problem)\n";
        echo "  open $url/setup.php to set it up\n\n";
        return server_serve($host, $port);
    }

    try {
        $mode = auth_mode();
        $owner = auth_local_user_id();
    } catch (RuntimeException $e) {
        return $fail($e->getMessage());
    }
    // Without sign-in, whoever reaches the app is the owner, and can reset
    // their progress: this computer only.
    if ($mode === 'none' && !$local) {
        return $fail("Sign-in is off (auth mode none), so the app only listens on this computer (127.0.0.1), not on $host.\n"
            . '  For other devices it needs sign-in: auth mode iam (docs/kb/sign-in.md).');
    }
    if (config_is_test_db(db_name())) {
        echo "  WARNING   : a throwaway database of the tests (" . db_name() . "), not your usual data\n";
    }

    try {
        if (!db_exists()) {
            echo '  database  : ' . db_name() . " does not exist yet: open $url/setup.php (it makes it)\n\n";
            return server_serve($host, $port);
        }
        if (db_value("SELECT to_regclass('migrations') IS NULL")) {
            echo '  database  : ' . db_name() . " has no tables yet: open $url/setup.php\n\n";
            return server_serve($host, $port);
        }
        // New migrations, after a raw copy of every table (as the setup page and a website do).
        try {
            $migrated = upkeep_migrate();
        } catch (Throwable $e) {
            // The database answers, but cannot be brought up to date: a migration
            // failed (the message names it; it rolled back), or the copy before it
            // could not be taken. Not a database that cannot be reached, so serve
            // all the same, and the setup page opens; meanwhile every address with
            // data tries again, and says why it cannot.
            fwrite(STDERR, "\n  database  : could not be brought up to date: {$e->getMessage()}\n"
                . "  Fix that and restart. Until then the app cannot be used; $url/setup.php opens.\n\n");
            return server_serve($host, $port);
        }
        if ($migrated['backup']) {
            echo '  backup    : ' . str_replace('\\', '/', $migrated['backup']) . " (before the update)\n";
        }
        if ($migrated['applied']) {
            echo '  database  : applied ' . implode(', ', $migrated['applied']) . "\n";
        }
        if ($waiting = db_pending_migrations()) {
            echo "  database  : backend/migrations/{$waiting[0]} does not end with \"-- end of " . substr($waiting[0], 0, 3) . "\": not applied yet\n";
        }
        $synced = $waiting ? null : content_sync(); // rebuilt when data/ or the code that builds from it changed
        try {
            $backup = backup_daily(); // today's copy, before any request
        } catch (PDOException $e) {
            throw $e;
        } catch (Throwable $e) {
            // a full disk or a locked file: say so, and let the owner study anyway
            $backup = null;
            fwrite(STDERR, "\n  backup skipped: {$e->getMessage()}\n");
        }
        $k = kanji_summarize($owner);
        $people = (int) db_value('SELECT count(*) FROM users');
        $stats = exam_stats();
        $audio = db_one('SELECT audio_words, audio_voices FROM content_state');
    } catch (PDOException $e) {
        return $fail("Cannot reach the database: {$e->getMessage()}\n  Is PostgreSQL running? The settings are in backend/config/database.local.php (the setup page writes them).");
    }

    if ($synced) {
        echo "  content   : rebuilt from data/ ({$synced['items']} items, {$synced['questions']} questions, {$synced['seconds']} s)\n";
    }
    if ($mode === 'none') {
        echo "  sign-in   : off (auth mode none): you are user $owner, on this computer only\n";
        echo "  kanji SRS : {$k['total']} items, {$k['learned']} learned, {$k['reviewsDue']} review(s) due\n";
    } else {
        echo '  sign-in   : through the IAM at ' . config('auth.issuer') . " (auth mode iam), $people " . ($people === 1 ? 'person' : 'people') . " so far\n";
        echo "  kanji SRS : {$k['total']} items; user $owner: {$k['learned']} learned, {$k['reviewsDue']} review(s) due\n";
    }
    echo "  exam      : {$stats['total']} questions across " . count(SECTIONS) . " sections\n";
    echo $audio && $audio['audio_words']
        ? "  audio     : {$audio['audio_words']} words in {$audio['audio_voices']} voices (data/audio)\n"
        : "  audio     : none yet: run npm run build:audio (see README)\n";
    echo '  database  : ' . db_name() . ' on ' . config('db.host') . ':' . config('db.port') . "\n";
    if ($backup) {
        echo '  backup    : ' . str_replace('\\', '/', $backup) . "\n";
    }
    echo "\n";
    return server_serve($host, $port);
}

/**
 * PHP's built-in web server, with this file as its router, until it stops.
 * Without OPcache: on Windows every php.exe of a build shares one, and a
 * server whose extensions or settings differ from another's has run that
 * one's compiled code against the wrong internal functions
 * (docs/kb/environment.md).
 */
function server_serve(string $host, int $port): int
{
    $server = proc_open(
        [PHP_BINARY, '-d', 'display_errors=stderr', '-d', 'opcache.enable=0', '-S', "$host:$port", '-t', BACKEND, __FILE__],
        [STDIN, STDOUT, STDERR],
        $pipes,
        ROOT
    );
    if (!is_resource($server)) {
        fwrite(STDERR, "\n  Could not start PHP's web server.\n\n");
        return 1;
    }
    return proc_close($server);
}
